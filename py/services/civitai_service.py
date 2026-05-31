"""CivitAI API integration service."""

import hashlib
import json
import logging
import ssl
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

from ..config import DATA_DIR

logger = logging.getLogger(__name__)


def _make_ssl_context():
    """Return an SSL context with CA verification.

    1. certifi CA bundle (available in virtually all ComfyUI envs via torch→requests→certifi)
    2. System default SSL context (OS certificate store)
    Returns None if both fail — callers fall back to urlopen without context
    (Python's own default, which also uses certifi when available).
    SSL verification is never disabled to avoid MitM exposure.
    """
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        pass
    try:
        return ssl.create_default_context()
    except Exception:
        pass
    logger.warning("CivitAI: could not build SSL context; falling back to urllib default")
    return None


_SSL_CONTEXT = _make_ssl_context  # lazy sentinel


def _get_ssl_context():
    global _SSL_CONTEXT
    if callable(_SSL_CONTEXT):
        _SSL_CONTEXT = _make_ssl_context()
    return _SSL_CONTEXT


CIVITAI_API_BASE = "https://civitai.com/api/v1"
CIVITAI_CACHE_FILE = DATA_DIR / "civitai_cache.json"

# HTTPステータスコード: 指数バックオフでリトライする対象
_RETRY_CODES = {429, 500, 502, 503, 504}
_MAX_RETRIES = 3
# POST /model-versions/by-hash は最大100件まで一括送信可能
_BATCH_CHUNK_SIZE = 100


class CivitaiService:
    """Fetch and cache CivitAI model metadata."""

    def __init__(self):
        self._cache = None

    # ── キャッシュ管理 ────────────────────────────────────────

    def _load_cache(self):
        if self._cache is not None:
            return self._cache
        if CIVITAI_CACHE_FILE.exists():
            try:
                with open(CIVITAI_CACHE_FILE, "r", encoding="utf-8") as f:
                    self._cache = json.load(f)
                    return self._cache
            except Exception:
                pass
        self._cache = {}
        return self._cache

    def _save_cache(self):
        CIVITAI_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CIVITAI_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(self._cache, f, ensure_ascii=False, indent=2)

    def get_cached(self, sha256_hash):
        """Return cached CivitAI data for a given hash, or None."""
        cache = self._load_cache()
        return cache.get(sha256_hash.lower())

    def get_all_cached(self):
        """Return the full cache dict."""
        return self._load_cache()

    # ── APIキー / ヘッダー ────────────────────────────────────

    @staticmethod
    def _get_api_key():
        """Return CivitAI API key. Env var CIVITAI_API_KEY takes priority over settings.json."""
        import os
        env_key = os.environ.get("CIVITAI_API_KEY", "").strip()
        if env_key:
            return env_key
        try:
            from ..services.settings_service import SettingsService
            return SettingsService().load().get("civitai_api_key", "").strip() or None
        except Exception:
            return None

    def _build_headers(self):
        """Build request headers, optionally including Bearer token."""
        headers = {"User-Agent": "ComfyUI-Workflow-Studio/1.0"}
        api_key = self._get_api_key()
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        return headers

    # ── ハッシュ計算 ──────────────────────────────────────────

    @staticmethod
    def calculate_sha256(file_path, chunk_size=65536):
        """Calculate SHA256 hash of a file."""
        h = hashlib.sha256()
        path = Path(file_path)
        if not path.is_file():
            return None
        with open(path, "rb") as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()  # 小文字16進数

    # ── 単体フェッチ (GET) ────────────────────────────────────

    def fetch_by_hash(self, sha256_hash):
        """Fetch model version info from CivitAI by SHA256 hash (GET).

        429/5xx は指数バックオフでリトライ。
        Returns dict with model info, or None if not found.
        Caches successful results.
        """
        sha256_lower = sha256_hash.lower()
        cache = self._load_cache()
        if sha256_lower in cache:
            return cache[sha256_lower]

        url = f"{CIVITAI_API_BASE}/model-versions/by-hash/{sha256_hash.upper()}"

        for attempt in range(_MAX_RETRIES):
            try:
                req = Request(url, headers=self._build_headers())
                with urlopen(req, timeout=15, context=_get_ssl_context()) as resp:
                    data = json.loads(resp.read().decode("utf-8"))

                if not data or "id" not in data:
                    return None

                info = self._extract_info(data)
                cache[sha256_lower] = info
                self._save_cache()
                return info

            except HTTPError as e:
                if e.code == 404:
                    logger.debug("CivitAI: model not found for hash %s", sha256_hash[:16])
                    return None
                if e.code in _RETRY_CODES and attempt < _MAX_RETRIES - 1:
                    wait = 2 ** attempt
                    logger.warning("CivitAI %s: retrying in %ss (attempt %d/%d)",
                                   e.code, wait, attempt + 1, _MAX_RETRIES)
                    time.sleep(wait)
                    continue
                logger.warning("CivitAI API error: %s %s", e.code, e.reason)
                return None
            except (URLError, Exception) as e:
                if attempt < _MAX_RETRIES - 1:
                    wait = 2 ** attempt
                    logger.warning("CivitAI request failed: %s — retrying in %ss", e, wait)
                    time.sleep(wait)
                    continue
                logger.warning("CivitAI request failed: %s", e)
                return None

        return None

    # ── 一括フェッチ (POST) ───────────────────────────────────

    def _batch_fetch_post(self, sha256_hashes):
        """POST /model-versions/by-hash でハッシュリストを一括取得（最大100件/リクエスト）。

        レスポンスの files[].hashes.SHA256 でリクエストのハッシュと照合する。
        Returns: { sha256_lower: info_or_none }
        """
        if not sha256_hashes:
            return {}

        url = f"{CIVITAI_API_BASE}/model-versions/by-hash"
        results = {h.lower(): None for h in sha256_hashes}
        cache = self._load_cache()

        for chunk_start in range(0, len(sha256_hashes), _BATCH_CHUNK_SIZE):
            chunk = sha256_hashes[chunk_start:chunk_start + _BATCH_CHUNK_SIZE]
            chunk_lower = {h.lower() for h in chunk}

            for attempt in range(_MAX_RETRIES):
                try:
                    body = json.dumps([h.upper() for h in chunk]).encode("utf-8")
                    req = Request(
                        url,
                        data=body,
                        headers={**self._build_headers(), "Content-Type": "application/json"},
                        method="POST",
                    )
                    with urlopen(req, timeout=30, context=_get_ssl_context()) as resp:
                        versions = json.loads(resp.read().decode("utf-8"))

                    # 各バージョンを files[].hashes.SHA256 でリクエストのハッシュと照合
                    for version_data in versions:
                        info = self._extract_info(version_data)
                        matched = False
                        for f in version_data.get("files", []):
                            file_sha256 = f.get("hashes", {}).get("SHA256", "").lower()
                            if file_sha256 in chunk_lower:
                                cache[file_sha256] = info
                                results[file_sha256] = info
                                matched = True
                                break
                        if not matched:
                            # files にハッシュがない場合は versionId で照合を試みる
                            logger.debug("CivitAI: could not match version %s to a requested hash",
                                         version_data.get("id"))
                    break  # チャンク成功

                except HTTPError as e:
                    if e.code in _RETRY_CODES and attempt < _MAX_RETRIES - 1:
                        wait = 2 ** attempt
                        logger.warning("CivitAI batch POST %s: retrying in %ss", e.code, wait)
                        time.sleep(wait)
                        continue
                    logger.warning("CivitAI batch POST error: %s %s", e.code, e.reason)
                    break
                except (URLError, Exception) as e:
                    if attempt < _MAX_RETRIES - 1:
                        wait = 2 ** attempt
                        logger.warning("CivitAI batch POST failed: %s — retrying in %ss", e, wait)
                        time.sleep(wait)
                        continue
                    logger.warning("CivitAI batch POST failed: %s", e)
                    break

        self._save_cache()
        return results

    # ── 情報抽出 ──────────────────────────────────────────────

    @staticmethod
    def _extract_info(data):
        """Extract relevant fields from CivitAI API response."""
        model = data.get("model", {})
        images = data.get("images", [])
        files = data.get("files", [])

        # プライマリファイルを特定
        primary_file = next((f for f in files if f.get("primary")), None)
        if not primary_file and files:
            primary_file = files[0]

        # 画像情報（URL・寸法・NSFWレベル）を最大5件取得
        image_list = []
        for img in images[:5]:
            img_url = img.get("url", "")
            if not img_url:
                continue
            image_list.append({
                "url": img_url,
                "width": img.get("width"),
                "height": img.get("height"),
                "nsfwLevel": img.get("nsfwLevel", 0),
            })

        # プライマリファイルのメタ情報（精度・フォーマット）
        file_meta = {}
        file_hashes = {}
        if primary_file:
            pm = primary_file.get("metadata", {})
            file_meta = {
                "fp": pm.get("fp"),
                "size": pm.get("size"),
                "format": pm.get("format"),
            }
            # BLAKE3, SHA256, AutoV2 等のハッシュ
            file_hashes = primary_file.get("hashes", {})

        stats = data.get("stats", {})

        # バッチ POST API は model オブジェクト内に id を含まない場合がある
        # トップレベルの modelId をフォールバックとして使用する
        model_id = model.get("id") or data.get("modelId")
        version_id = data.get("id", "")

        return {
            "versionId": version_id,
            "modelId": model_id,
            "modelName": model.get("name", ""),
            "versionName": data.get("name", ""),
            "type": model.get("type", ""),
            "description": data.get("description") or model.get("description", ""),
            "tags": model.get("tags", []),
            "nsfw": model.get("nsfw", False),
            "nsfwLevel": data.get("nsfwLevel", 0),
            "air": data.get("air", ""),
            "creator": data.get("creator", {}).get("username", ""),
            # 後方互換のため URLリストを維持しつつ詳細情報も保存
            "images": [img["url"] for img in image_list],
            "imageDetails": image_list,
            "trainedWords": data.get("trainedWords", []),
            "baseModel": data.get("baseModel", ""),
            "fileSize": primary_file.get("sizeKB", 0) if primary_file else 0,
            "fileMeta": file_meta,
            "fileHashes": file_hashes,
            "downloadUrl": data.get("downloadUrl", ""),
            "modelUrl": (
                f"https://civitai.com/models/{model_id}?modelVersionId={version_id}"
                if model_id else f"https://civitai.com/models?modelVersionId={version_id}"
            ),
            "stats": {
                "downloadCount": stats.get("downloadCount", 0),
                "thumbsUpCount": stats.get("thumbsUpCount", 0),
                "thumbsDownCount": stats.get("thumbsDownCount", 0),
            },
            "updatedAt": data.get("updatedAt", ""),
            "publishedAt": data.get("publishedAt", ""),
        }

    # ── バッチフェッチ ────────────────────────────────────────

    def batch_fetch(self, model_files, progress_callback=None):
        """Batch fetch CivitAI info for multiple model files.

        Phase 1: SHA256 計算（"hashing"）
        Phase 2: POST で一括取得（"fetching"）— キャッシュ済みはスキップ

        Args:
            model_files: list of (model_name, file_path) tuples
            progress_callback: fn(current, total, model_name, status) called per model

        Returns: dict of { model_name: { sha256, civitai_info_or_none } }
        """
        results = {}
        total = len(model_files)
        cache = self._load_cache()

        # Phase 1: ハッシュ計算
        hashes_needed = []  # [(model_name, sha256_lower, original_index)]

        for i, (model_name, file_path) in enumerate(model_files):
            if progress_callback:
                progress_callback(i, total, model_name, "hashing")

            sha256 = self.calculate_sha256(file_path)
            if not sha256:
                results[model_name] = {"sha256": None, "civitai": None, "error": "hash_failed"}
                if progress_callback:
                    progress_callback(i + 1, total, model_name, "not_found")
                continue

            sha256_lower = sha256.lower()
            results[model_name] = {"sha256": sha256_lower, "civitai": None}

            if sha256_lower in cache:
                results[model_name]["civitai"] = cache[sha256_lower]
                if progress_callback:
                    progress_callback(i + 1, total, model_name, "cached")
            else:
                hashes_needed.append((model_name, sha256_lower, i))

        # Phase 2: POST で一括取得（未キャッシュ分）
        if hashes_needed:
            if progress_callback:
                progress_callback(len(results), total, "", "fetching")

            # 同一ハッシュが複数モデルに対応する場合を考慮
            sha256_to_entries: dict[str, list] = {}
            for name, sha256_lower, idx in hashes_needed:
                sha256_to_entries.setdefault(sha256_lower, []).append((name, idx))

            batch_results = self._batch_fetch_post(list(sha256_to_entries.keys()))

            for sha256_lower, info in batch_results.items():
                for name, idx in sha256_to_entries.get(sha256_lower, []):
                    results[name]["civitai"] = info
                    if progress_callback:
                        status = "found" if info else "not_found"
                        progress_callback(idx + 1, total, name, status)

        if progress_callback:
            progress_callback(total, total, "", "done")

        return results

    # ── 画像ダウンロード ──────────────────────────────────────

    @staticmethod
    def download_image(url, save_path, timeout=15):
        """Download an image from URL and save to save_path. Returns True on success."""
        try:
            req = Request(url, headers={"User-Agent": "ComfyUI-Workflow-Studio/1.0"})
            with urlopen(req, timeout=timeout, context=_get_ssl_context()) as resp:
                data = resp.read()
            with open(save_path, "wb") as f:
                f.write(data)
            return True
        except Exception as e:
            logger.warning("Failed to download preview from %s: %s", url, e)
            return False

    # ── キャッシュ操作 ────────────────────────────────────────

    def clear_cache(self, sha256_hash=None):
        """Clear cache for a specific hash or all."""
        cache = self._load_cache()
        if sha256_hash:
            cache.pop(sha256_hash.lower(), None)
        else:
            cache.clear()
        self._save_cache()

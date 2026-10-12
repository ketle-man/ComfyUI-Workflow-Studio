"""
Semantic Service - Gallery用セマンティック検索（Gemini Embedding 2）

画像(動画・PSDはサムネイル)をGemini Embedding APIでベクトル化してローカルに保存し、
テキストクエリ/類似画像でコサイン類似度検索する。インデックス構築後の検索は
(テキストクエリの埋め込み1回を除き)ローカル処理でAPI費用はかからない。

APIキーは環境変数 GEMINI_API_KEY (または GOOGLE_API_KEY) から読む(.env経由)。
settings.json やフロントエンドには出さない。接続先は固定ホストのみ(SSRF対策)。
"""
import io
import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from . import semantic_local as local

logger = logging.getLogger(__name__)

API_BASE = "https://generativelanguage.googleapis.com/v1beta"
MODEL = "gemini-embedding-2"           # Gemini API (クラウド)
LOCAL_MODEL = local.LOCAL_MODEL        # EmbeddingGemma 2 (ローカルONNX)
DEFAULT_DIM = 1536
VALID_DIMS = (768, 1536, 3072)
# バックエンド(モデル名) -> 選択可能な出力次元
DIMS_BY_MODEL = {MODEL: VALID_DIMS, LOCAL_MODEL: local.LOCAL_DIMS}
DEFAULT_DIM_BY_MODEL = {MODEL: DEFAULT_DIM, LOCAL_MODEL: local.DEFAULT_LOCAL_DIM}
IMAGE_MAX_SIZE = 768          # 送信前の長辺リサイズ(px)
_WORKERS = 4                  # 並列API呼び出し数
_CHECKPOINT_EVERY = 100       # この件数ごとにディスクへ保存
_RETRIES = 4

# PILで直接開ける(静止画/GIFは先頭フレーム)
_PIL_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
# GalleryService.serve_thumbnail 経由でJPEG化する(動画先頭フレーム/PSD合成)
_THUMB_EXTS = {".mp4", ".webm", ".psd"}
INDEXABLE_EXTS = _PIL_EXTS | _THUMB_EXTS


class SemanticError(Exception):
    """ユーザーに見せられるエラー(code はフロントのi18n用)"""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def get_api_key() -> str:
    return (os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")).strip()


def _normalize(v: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(v))
    return v / n if n > 0 else v


def _call_embed(content: dict, task_type: str, dim: int) -> np.ndarray:
    key = get_api_key()
    if not key:
        raise SemanticError("no_api_key", "GEMINI_API_KEY is not set")
    body = {"model": f"models/{MODEL}", "content": content, "taskType": task_type}
    if dim != 768:
        body["outputDimensionality"] = dim
    data = json.dumps(body).encode("utf-8")
    url = f"{API_BASE}/models/{MODEL}:embedContent"
    last_err = ""
    for attempt in range(_RETRIES + 1):
        req = urllib.request.Request(
            url, data=data, method="POST",
            headers={"Content-Type": "application/json", "x-goog-api-key": key},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                payload = json.loads(res.read().decode("utf-8"))
            values = (payload.get("embedding") or {}).get("values")
            if not values:
                raise SemanticError("bad_response", "no embedding.values in response")
            return _normalize(np.asarray(values, dtype=np.float32))
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read().decode("utf-8")).get("error", {}).get("message", "")
            except Exception:
                msg = ""
            last_err = f"HTTP {e.code}: {msg or e.reason}"
            if e.code in (400, 403) and ("API key" in msg or "API_KEY" in msg or e.code == 403):
                raise SemanticError("api_key_invalid", last_err)
            if e.code in (429, 500, 502, 503, 504) and attempt < _RETRIES:
                time.sleep(1.5 * (2 ** attempt))
                continue
            raise SemanticError("api_error", last_err)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last_err = str(getattr(e, "reason", e))
            if attempt < _RETRIES:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise SemanticError("network_error", last_err)
    raise SemanticError("api_error", last_err)


def embed_text(text: str, dim: int) -> np.ndarray:
    return _call_embed({"parts": [{"text": text[:8000]}]}, "RETRIEVAL_QUERY", dim)


def embed_image_bytes(data: bytes, mime: str, dim: int) -> np.ndarray:
    import base64
    b64 = base64.b64encode(data).decode("ascii")
    return _call_embed({"parts": [{"inlineData": {"mimeType": mime, "data": b64}}]}, "RETRIEVAL_DOCUMENT", dim)


class SemanticService:
    def __init__(self, data_dir: Path, gallery_service):
        self.data_dir = data_dir
        self.gallery = gallery_service
        self._file = data_dir / "semantic_index.npz"
        self._lock = threading.RLock()
        self._vecs: dict[str, np.ndarray] = {}     # path -> 正規化済みベクトル
        self._stamp: dict[str, tuple[int, float]] = {}  # path -> (size, mtime)
        self._dim = 0                               # インデックスの次元(0=空)
        self._model = MODEL                         # インデックスを作ったモデル
        self._soft = local.DEFAULT_SOFT             # ローカルモデルの画像ソフトトークン数(インデックスと一致させる)
        self._settings_file = data_dir / "semantic_settings.json"
        self._load_settings()
        self._mat_cache = None                      # (paths, matrix)
        self._loaded = False
        self._dirty = 0
        # ジョブ
        self._job = self._idle_job()
        self._cancel = threading.Event()
        self._thread: threading.Thread | None = None

    # ── ローカル推論の実行設定(デバイス/スレッド数) ─────────────

    def _load_settings(self) -> None:
        try:
            if self._settings_file.exists():
                d = json.loads(self._settings_file.read_text(encoding="utf-8"))
                local.configure(str(d.get("device", "auto")), int(d.get("threads", 0)))
                return
        except Exception as e:
            logger.warning("SemanticService: failed to load settings: %s", e)
        local.configure("auto", local.default_threads())

    def set_local_options(self, device: str, threads: int) -> None:
        """実行デバイス/CPUスレッド数を反映して保存する(検索時のクエリ埋め込みにも使われる)"""
        local.configure(device, threads)
        try:
            self._settings_file.write_text(json.dumps(local.current_config()), encoding="utf-8")
        except Exception as e:
            logger.warning("SemanticService: failed to save settings: %s", e)

    # ── 永続化 ─────────────────────────────────────────────

    @staticmethod
    def _idle_job() -> dict:
        return {"running": False, "total": 0, "done": 0, "failed": 0, "current": "",
                "error": "", "error_code": "", "cancelled": False, "finished": False}

    def _ensure_loaded(self) -> None:
        with self._lock:
            if self._loaded:
                return
            self._loaded = True
            if not self._file.exists():
                return
            try:
                with np.load(self._file, allow_pickle=False) as z:
                    model = str(z["model"])
                    if model not in DIMS_BY_MODEL:
                        return
                    self._model = model
                    self._soft = int(z["soft"]) if "soft" in z.files else local.DEFAULT_SOFT
                    paths = [str(p) for p in z["paths"]]
                    sizes, mtimes, vecs = z["sizes"], z["mtimes"], z["vecs"]
                    self._dim = int(z["dim"])
                    for i, p in enumerate(paths):
                        self._vecs[p] = vecs[i]
                        self._stamp[p] = (int(sizes[i]), float(mtimes[i]))
            except Exception as e:
                logger.warning("SemanticService: failed to load index: %s", e)
                self._vecs.clear()
                self._stamp.clear()
                self._dim = 0

    def _save(self) -> None:
        with self._lock:
            if not self._vecs:
                if self._file.exists():
                    self._file.unlink()
                self._dirty = 0
                return
            paths = list(self._vecs.keys())
            tmp = self._file.with_suffix(".tmp.npz")
            np.savez(
                tmp,
                model=np.array(self._model), dim=np.array(self._dim), soft=np.array(self._soft),
                paths=np.array(paths),
                sizes=np.array([self._stamp[p][0] for p in paths], dtype=np.int64),
                mtimes=np.array([self._stamp[p][1] for p in paths], dtype=np.float64),
                vecs=np.stack([self._vecs[p] for p in paths]).astype(np.float32),
            )
            os.replace(tmp, self._file)
            self._dirty = 0

    def _put(self, path: str, vec: np.ndarray, size: int, mtime: float) -> None:
        with self._lock:
            self._vecs[path] = vec
            self._stamp[path] = (size, mtime)
            self._mat_cache = None
            self._dirty += 1

    # ── 状態 ───────────────────────────────────────────────

    def _scope_entries(self, folder: str, recursive: bool) -> list[tuple[str, str, int, float]]:
        p = Path(folder).resolve()
        if not p.is_dir() or not self.gallery._check_path_allowed(p):
            raise SemanticError("folder_not_allowed", str(folder))
        raw = self.gallery._scan_folder_recursive(p) if recursive else self.gallery._scan_folder(p)
        return [e for e in raw if Path(e[0]).suffix.lower() in INDEXABLE_EXTS]

    def status(self, folder: str = "", recursive: bool = True) -> dict:
        self._ensure_loaded()
        out = {
            "has_key": bool(get_api_key()),
            "model": MODEL,
            "backends": {
                MODEL: {"dims": list(VALID_DIMS), "default_dim": DEFAULT_DIM, "ready": bool(get_api_key())},
                LOCAL_MODEL: {"dims": list(local.LOCAL_DIMS), "default_dim": local.DEFAULT_LOCAL_DIM,
                              "ready": True, "downloaded": local.is_downloaded(self.data_dir)},
            },
            "index_model": self._model,
            "index_dim": self._dim,
            "index_soft": self._soft,
            "local": {
                "devices": local.available_devices(),
                "options": local.current_config(),
                "default_threads": local.default_threads(),
                "soft_tokens": list(local.SOFT_TOKENS),
                "default_soft": local.DEFAULT_SOFT,
            },
            "indexed_total": len(self._vecs),
            "job": dict(self._job),
        }
        if folder:
            try:
                entries = self._scope_entries(folder, recursive)
                with self._lock:
                    done = sum(1 for _, ap, sz, mt in entries if self._is_fresh(ap, sz, mt))
                out["scope_total"] = len(entries)
                out["scope_indexed"] = done
            except SemanticError:
                pass
        return out

    def folder_status(self, root: str) -> dict:
        """フォルダごとの索引状況 {絶対パス: {"indexable": n, "indexed": m}} (直下の画像のみ。Galleryツリーの枚数表示と同じ単位)"""
        self._ensure_loaded()
        entries = self._scope_entries(root, True)
        out: dict[str, dict] = {}
        with self._lock:
            for _, ap, sz, mt in entries:
                d = out.setdefault(ap.rsplit("/", 1)[0], {"indexable": 0, "indexed": 0})
                d["indexable"] += 1
                if self._is_fresh(ap, sz, mt):
                    d["indexed"] += 1
        return out

    def _is_fresh(self, path: str, size: int, mtime: float) -> bool:
        st = self._stamp.get(path)
        return st is not None and st[0] == size and abs(st[1] - mtime) < 1e-3

    # ── インデックス作成ジョブ ────────────────────────────

    def start_index(self, folder: str, recursive: bool, mode: str, model: str, dim: int,
                    soft: int = local.DEFAULT_SOFT) -> None:
        self._ensure_loaded()
        if model not in DIMS_BY_MODEL:
            raise SemanticError("bad_model", model)
        if model == MODEL and not get_api_key():
            raise SemanticError("no_api_key")
        if dim not in DIMS_BY_MODEL[model]:
            raise SemanticError("bad_dim", str(dim))
        if model != LOCAL_MODEL or soft not in local.SOFT_TOKENS:
            soft = local.DEFAULT_SOFT   # ソフトトークン数はローカルモデルのみの設定
        with self._lock:
            if self._job["running"]:
                raise SemanticError("already_running")
            entries = self._scope_entries(folder, recursive)
            mismatch = bool(self._vecs) and (self._dim != dim or self._model != model or self._soft != soft)
            if mismatch and mode != "all":
                raise SemanticError("dim_mismatch", f"{self._model}/{self._dim}/{self._soft}")
            if mode == "all":
                # 範囲内の既存ベクトルを破棄して作り直す(モデル/次元違いなら全消去)
                if mismatch:
                    self._vecs.clear()
                    self._stamp.clear()
                else:
                    for _, ap, _, _ in entries:
                        self._vecs.pop(ap, None)
                        self._stamp.pop(ap, None)
                self._mat_cache = None
            self._dim = dim
            self._model = model
            self._soft = soft
            todo = [e for e in entries if not self._is_fresh(e[1], e[2], e[3])]
            # スコープ内で消えたファイルの残骸を掃除(スコープ配下のキーのみ)
            self._prune_missing(folder, recursive, {e[1] for e in entries})
            self._cancel.clear()
            self._job = self._idle_job()
            self._job.update(running=True, total=len(todo))
        self._thread = threading.Thread(target=self._run_index, args=(todo, model, dim, soft), daemon=True)
        self._thread.start()

    def _prune_missing(self, folder: str, recursive: bool, existing: set[str]) -> None:
        base = Path(folder).resolve().as_posix().rstrip("/") + "/"
        for p in list(self._vecs.keys()):
            if not p.startswith(base):
                continue
            if not recursive and "/" in p[len(base):]:
                continue
            if p not in existing:
                self._vecs.pop(p, None)
                self._stamp.pop(p, None)
                self._mat_cache = None
                self._dirty += 1

    def cancel(self) -> None:
        self._cancel.set()

    def _run_index(self, todo: list, model: str, dim: int, soft: int = local.DEFAULT_SOFT) -> None:
        def work(entry):
            if self._cancel.is_set():
                return
            name, ap, size, mtime = entry
            self._job["current"] = name
            try:
                vec = self._embed_image(model, dim, Path(ap), soft)
                self._put(ap, vec, size, mtime)
                self._job["done"] += 1
            except SemanticError as e:
                if e.code in ("no_api_key", "api_key_invalid"):
                    self._job["error_code"], self._job["error"] = e.code, str(e)
                    self._cancel.set()
                else:
                    self._job["failed"] += 1
                    if not self._job["error"]:
                        self._job["error_code"], self._job["error"] = e.code, str(e)
            except Exception as e:
                logger.warning("SemanticService: embed failed for %s: %s", ap, e)
                self._job["failed"] += 1
            if self._dirty >= _CHECKPOINT_EVERY:
                try:
                    self._save()
                except Exception as e:
                    logger.warning("SemanticService: checkpoint failed: %s", e)

        try:
            if model == LOCAL_MODEL:
                # 初回はモデルのダウンロード/ロードを先に行う(失敗したらジョブ全体を中止)
                try:
                    local.ensure_runtime(self.data_dir, progress=lambda ph: self._job.update(current=f"({ph} model...)"))
                except Exception as e:
                    logger.warning("SemanticService: local model load failed: %s", e)
                    self._job["error_code"], self._job["error"] = "local_error", str(e)
                    self._cancel.set()
            workers = 1 if model == LOCAL_MODEL else _WORKERS   # ローカルはORT側がマルチスレッド
            with ThreadPoolExecutor(max_workers=workers) as ex:
                list(ex.map(work, todo))
        finally:
            try:
                self._save()
            except Exception as e:
                logger.warning("SemanticService: save failed: %s", e)
            if model == LOCAL_MODEL:
                local.release()   # 画像生成とVRAM/RAMを奪い合わないよう、作成後はモデルを解放(検索時に再ロード)
            self._job["running"] = False
            self._job["finished"] = True
            self._job["cancelled"] = self._cancel.is_set() and not self._job["error_code"]
            self._job["current"] = ""

    def _load_pil(self, path: Path):
        """埋め込み用に縮小したPIL画像を返す(動画/PSDはサムネイルから)"""
        from PIL import Image
        if path.suffix.lower() in _THUMB_EXTS:
            thumb = self.gallery.serve_thumbnail(str(path), IMAGE_MAX_SIZE)
            if not thumb:
                raise SemanticError("thumb_failed", str(path))
            with Image.open(thumb) as im:
                return im.convert("RGB")
        with Image.open(path) as im:
            im.seek(0)
            im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
            im.thumbnail((IMAGE_MAX_SIZE, IMAGE_MAX_SIZE), Image.LANCZOS)
            return im

    def _embed_image(self, model: str, dim: int, path: Path, soft: int | None = None) -> np.ndarray:
        from PIL import Image
        im = self._load_pil(path)
        if model == LOCAL_MODEL:
            if im.mode == "RGBA":   # 透過部は白背景に合成
                bg = Image.new("RGB", im.size, (255, 255, 255))
                bg.paste(im, mask=im.getchannel("A"))
                im = bg
            try:
                return local.embed_image(self.data_dir, im, dim, self._soft if soft is None else soft)
            except Exception as e:
                raise SemanticError("local_error", str(e))
        buf = io.BytesIO()
        if im.mode == "RGBA":
            im.save(buf, "PNG")
            return embed_image_bytes(buf.getvalue(), "image/png", dim)
        im.save(buf, "JPEG", quality=88)
        return embed_image_bytes(buf.getvalue(), "image/jpeg", dim)

    def _embed_text(self, model: str, dim: int, text: str) -> np.ndarray:
        if model == LOCAL_MODEL:
            try:
                return local.embed_text(self.data_dir, text, dim)
            except Exception as e:
                raise SemanticError("local_error", str(e))
        return embed_text(text, dim)

    # ── 検索 ───────────────────────────────────────────────

    def _matrix(self):
        with self._lock:
            if self._mat_cache is None:
                paths = list(self._vecs.keys())
                mat = np.stack([self._vecs[p] for p in paths]) if paths else np.zeros((0, max(self._dim, 1)), np.float32)
                self._mat_cache = (paths, mat)
            return self._mat_cache

    def _rank(self, qvec: np.ndarray, folder: str, recursive: bool, limit: int, exclude: str = "") -> list[dict]:
        entries = self._scope_entries(folder, recursive)
        info = {ap: (name, sz, mt) for name, ap, sz, mt in entries}
        paths, mat = self._matrix()
        if not paths:
            raise SemanticError("index_empty")
        if mat.shape[1] != qvec.shape[0]:
            raise SemanticError("dim_mismatch", str(self._dim))
        scores = mat @ qvec
        order = np.argsort(-scores)
        out = []
        for i in order:
            p = paths[i]
            if p == exclude or p not in info:
                continue
            name, sz, mt = info[p]
            item = self.gallery.make_list_item(name, p, sz, mt)
            item["score"] = round(float(scores[i]), 4)
            out.append(item)
            if len(out) >= limit:
                break
        return out

    def search_text(self, query: str, folder: str, recursive: bool, limit: int) -> list[dict]:
        self._ensure_loaded()
        query = (query or "").strip()
        if not query:
            return []
        if not self._vecs:
            raise SemanticError("index_empty")
        qvec = self._embed_text(self._model, self._dim, query)
        return self._rank(qvec, folder, recursive, limit)

    def search_similar(self, path: str, folder: str, recursive: bool, limit: int) -> list[dict]:
        self._ensure_loaded()
        p = Path(path).resolve()
        if not p.is_file() or not self.gallery._check_path_allowed(p):
            raise SemanticError("folder_not_allowed", path)
        ap = p.as_posix()
        vec = self._vecs.get(ap)
        if vec is None or not self._is_fresh(ap, p.stat().st_size, p.stat().st_mtime):
            # 未インデックスの基準画像は、その場で1枚だけ埋め込む
            if not self._vecs:
                raise SemanticError("index_empty")
            if p.suffix.lower() not in INDEXABLE_EXTS:
                raise SemanticError("unsupported_type", p.suffix)
            vec = self._embed_image(self._model, self._dim, p)
            st = p.stat()
            self._put(ap, vec, st.st_size, st.st_mtime)
            self._save()
        return self._rank(vec, folder, recursive, limit, exclude=ap)

    def clear(self) -> None:
        self._ensure_loaded()
        with self._lock:
            if self._job["running"]:
                raise SemanticError("already_running")
            self._vecs.clear()
            self._stamp.clear()
            self._dim = 0
            self._mat_cache = None
            self._save()

    def test_connection(self, model: str, dim: int) -> dict:
        if model not in DIMS_BY_MODEL:
            raise SemanticError("bad_model", model)
        if dim not in DIMS_BY_MODEL[model]:
            dim = DEFAULT_DIM_BY_MODEL[model]
        n = int(self._embed_text(model, dim, "test").shape[0])
        return {"dimensions": n, "provider": local.active_provider() if model == LOCAL_MODEL else "API"}

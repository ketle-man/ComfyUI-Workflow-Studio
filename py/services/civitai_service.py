"""CivitAI API integration service."""

import hashlib
import json
import logging
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

from ..config import DATA_DIR

logger = logging.getLogger(__name__)

CIVITAI_API_BASE = "https://civitai.com/api/v1"
CIVITAI_CACHE_FILE = DATA_DIR / "civitai_cache.json"


class CivitaiService:
    """Fetch and cache CivitAI model metadata."""

    def __init__(self):
        self._cache = None

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
        return cache.get(sha256_hash)

    def get_all_cached(self):
        """Return the full cache dict."""
        return self._load_cache()

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
        return h.hexdigest()

    def fetch_by_hash(self, sha256_hash):
        """Fetch model version info from CivitAI by SHA256 hash.

        Returns dict with model info, or None if not found.
        Caches successful results.
        """
        # Check cache first
        cache = self._load_cache()
        if sha256_hash in cache:
            return cache[sha256_hash]

        url = f"{CIVITAI_API_BASE}/model-versions/by-hash/{sha256_hash}"
        try:
            req = Request(url, headers={"User-Agent": "ComfyUI-Workflow-Studio/1.0"})
            with urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            if not data or "id" not in data:
                return None

            # Extract useful fields
            info = self._extract_info(data)
            cache[sha256_hash] = info
            self._save_cache()
            return info

        except HTTPError as e:
            if e.code == 404:
                logger.debug("CivitAI: model not found for hash %s", sha256_hash[:16])
                return None
            logger.warning("CivitAI API error: %s %s", e.code, e.reason)
            return None
        except (URLError, Exception) as e:
            logger.warning("CivitAI request failed: %s", e)
            return None

    @staticmethod
    def _extract_info(data):
        """Extract relevant fields from CivitAI API response."""
        model = data.get("model", {})
        images = data.get("images", [])
        files = data.get("files", [])

        # Get primary file info
        primary_file = None
        for f in files:
            if f.get("primary"):
                primary_file = f
                break
        if not primary_file and files:
            primary_file = files[0]

        # Get image URLs (first 5)
        image_urls = []
        for img in images[:5]:
            url = img.get("url", "")
            if url:
                # Optimize for thumbnail
                optimized = url.replace("/original=true", "/width=450,optimized=true")
                image_urls.append(optimized)

        return {
            "versionId": data.get("id"),
            "modelId": model.get("id"),
            "modelName": model.get("name", ""),
            "versionName": data.get("name", ""),
            "type": model.get("type", ""),
            "description": data.get("description") or model.get("description", ""),
            "tags": model.get("tags", []),
            "nsfw": model.get("nsfw", False),
            "creator": data.get("creator", {}).get("username", ""),
            "images": image_urls,
            "trainedWords": data.get("trainedWords", []),
            "baseModel": data.get("baseModel", ""),
            "fileSize": primary_file.get("sizeKB", 0) if primary_file else 0,
            "downloadUrl": data.get("downloadUrl", ""),
            "modelUrl": f"https://civitai.com/models/{model.get('id', '')}?modelVersionId={data.get('id', '')}",
        }

    def batch_fetch(self, model_files, progress_callback=None):
        """Batch fetch CivitAI info for multiple model files.

        Args:
            model_files: list of (model_name, file_path) tuples
            progress_callback: fn(current, total, model_name, status) called per model

        Returns: dict of { model_name: { sha256, civitai_info_or_none } }
        """
        import time

        results = {}
        total = len(model_files)
        cache = self._load_cache()

        for i, (model_name, file_path) in enumerate(model_files):
            if progress_callback:
                progress_callback(i, total, model_name, "hashing")

            # Calculate hash
            sha256 = self.calculate_sha256(file_path)
            if not sha256:
                results[model_name] = {"sha256": None, "civitai": None, "error": "hash_failed"}
                continue

            results[model_name] = {"sha256": sha256, "civitai": None}

            # Check cache
            if sha256 in cache:
                results[model_name]["civitai"] = cache[sha256]
                if progress_callback:
                    progress_callback(i, total, model_name, "cached")
                continue

            # Fetch from API
            if progress_callback:
                progress_callback(i, total, model_name, "fetching")

            info = self.fetch_by_hash(sha256)
            if info:
                results[model_name]["civitai"] = info

            if progress_callback:
                status = "found" if info else "not_found"
                progress_callback(i, total, model_name, status)

            # Rate limit: small delay between API calls
            time.sleep(0.5)

        if progress_callback:
            progress_callback(total, total, "", "done")

        return results

    def clear_cache(self, sha256_hash=None):
        """Clear cache for a specific hash or all."""
        cache = self._load_cache()
        if sha256_hash:
            cache.pop(sha256_hash, None)
        else:
            cache.clear()
        self._save_cache()

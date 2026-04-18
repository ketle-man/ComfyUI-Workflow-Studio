"""Model metadata management service."""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from ..config import MODEL_METADATA_FILE

logger = logging.getLogger(__name__)

# Preview image extensions to search for (in priority order)
_PREVIEW_EXTENSIONS = [".preview.png", ".preview.jpg", ".preview.jpeg", ".preview.webp",
                       ".png", ".jpg", ".jpeg", ".webp"]

# All sidecar extensions to delete when a model is deleted
_SIDECAR_EXTENSIONS = [
    ".preview.png", ".preview.jpg", ".preview.jpeg", ".preview.webp",
    ".png", ".jpg", ".jpeg", ".webp",
    ".json", ".civitai.info", ".info",
]

_DISABLED_SUFFIX = ".disabled"

# ComfyUI model type → folder_paths key mapping
MODEL_TYPE_FOLDER_KEYS = {
    "checkpoint": "checkpoints",
    "lora": "loras",
    "vae": "vae",
    "controlnet": "controlnet",
    "unet": "diffusion_models",
    "textencoder": "text_encoders",
    "hypernetwork": "hypernetworks",
    "embedding": "embeddings",
}


def _get_model_dirs(model_type):
    """Get all model directories for a type using ComfyUI's folder_paths.

    Returns a list of Path objects for all configured model directories
    (includes extra_model_paths.yaml settings).
    Falls back to plugin-relative path if folder_paths is unavailable.
    """
    folder_key = MODEL_TYPE_FOLDER_KEYS.get(model_type)
    if not folder_key:
        return []

    try:
        import folder_paths  # type: ignore  # ComfyUI module
        paths = folder_paths.get_folder_paths(folder_key)
        result = [Path(p) for p in paths if Path(p).is_dir()]
        if result:
            return result
    except Exception as e:
        logger.debug("folder_paths unavailable (%s), using fallback", e)

    # Fallback: custom_nodes/../../models/{folder_key}
    plugin_dir = Path(__file__).resolve().parent.parent.parent
    models_dir = plugin_dir.parent.parent / "models" / folder_key
    if models_dir.is_dir():
        return [models_dir]
    return []


class ModelsService:
    """Manages user-defined model metadata (favorites, tags, memo)."""

    def __init__(self):
        self.metadata_file = MODEL_METADATA_FILE

    def _now_iso(self):
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    def _load_metadata(self):
        if self.metadata_file.exists():
            try:
                with open(self.metadata_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def _save_metadata(self, data):
        self.metadata_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.metadata_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def get_all_metadata(self):
        return self._load_metadata()

    def update_metadata(self, model_name, updates):
        data = self._load_metadata()
        if model_name not in data:
            data[model_name] = {"tags": [], "favorite": False, "memo": ""}
        entry = data[model_name]
        if "tags" in updates:
            entry["tags"] = updates["tags"]
        if "favorite" in updates:
            entry["favorite"] = updates["favorite"]
        if "memo" in updates:
            entry["memo"] = updates["memo"]
        if "sha256" in updates:
            entry["sha256"] = updates["sha256"]
        if "badges" in updates:
            entry["badges"] = updates["badges"]
        entry["updatedAt"] = self._now_iso()
        data[model_name] = entry
        self._save_metadata(data)
        return entry

    def get_model_groups(self, model_type=None):
        data = self._load_metadata()
        raw = data.get("_groups", {})

        # Migrate old flat format { "groupName": [...] } → per-type { "checkpoint": {...} }
        if raw and not any(k in MODEL_TYPE_FOLDER_KEYS for k in raw):
            logger.info("Migrating groups to per-type format (old data moved to _groups_legacy)")
            data["_groups_legacy"] = raw
            data["_groups"] = {}
            self._save_metadata(data)
            raw = {}

        if model_type:
            return raw.get(model_type, {})
        return raw

    def save_model_groups(self, groups, model_type):
        data = self._load_metadata()
        if not isinstance(data.get("_groups"), dict):
            data["_groups"] = {}
        data["_groups"][model_type] = groups
        self._save_metadata(data)
        return groups

    def find_model_file(self, model_type, model_name):
        """Find a model file, checking both enabled and disabled states.

        Returns (Path, is_enabled) or (None, None) if not found.
        """
        dirs = _get_model_dirs(model_type)
        for d in dirs:
            enabled = d / model_name
            if enabled.is_file():
                return enabled, True
            disabled = d / (model_name + _DISABLED_SUFFIX)
            if disabled.is_file():
                return disabled, False
        return None, None

    def enable_model(self, model_type, model_name):
        """Rename model.safetensors.disabled → model.safetensors."""
        path, is_enabled = self.find_model_file(model_type, model_name)
        if path is None:
            raise FileNotFoundError(f"Model not found: {model_name}")
        if is_enabled:
            return
        target = path.parent / path.name[: -len(_DISABLED_SUFFIX)]
        path.rename(target)
        logger.info("Enabled model: %s", model_name)

    def disable_model(self, model_type, model_name):
        """Rename model.safetensors → model.safetensors.disabled."""
        path, is_enabled = self.find_model_file(model_type, model_name)
        if path is None:
            raise FileNotFoundError(f"Model not found: {model_name}")
        if not is_enabled:
            return
        target = path.parent / (path.name + _DISABLED_SUFFIX)
        path.rename(target)
        logger.info("Disabled model: %s", model_name)

    def scan_disabled_models(self, model_type):
        """Scan directories for .disabled files.

        Returns list of normalized model names (without .disabled suffix).
        """
        dirs = _get_model_dirs(model_type)
        disabled = []
        for d in dirs:
            if not d.is_dir():
                continue
            for f in d.rglob("*"):
                if f.is_file() and f.name.endswith(_DISABLED_SUFFIX):
                    try:
                        rel = str(f.relative_to(d))
                        if rel.endswith(_DISABLED_SUFFIX):
                            rel = rel[: -len(_DISABLED_SUFFIX)]
                        disabled.append(rel.replace("\\", "/"))
                    except ValueError:
                        pass
        return disabled

    def find_preview_image(self, model_type, model_name):
        """Find preview image for a model file.

        Searches all configured directories for the model type
        (via ComfyUI's folder_paths, which includes extra_model_paths.yaml).

        Looks for files like:
            modelname.preview.png, modelname.png, etc.
        next to the model file.

        Returns: absolute Path to preview image, or None.
        """
        dirs = _get_model_dirs(model_type)
        if not dirs:
            logger.debug("Preview: no dirs for model_type=%s", model_type)
            return None

        for type_dir in dirs:
            # model_name can include subdirectory (e.g., "subdir/model.safetensors")
            model_path = type_dir / model_name
            if not model_path.is_file():
                continue

            stem = model_path.stem
            parent = model_path.parent

            for ext in _PREVIEW_EXTENSIONS:
                preview = parent / (stem + ext)
                if preview.is_file():
                    logger.debug("Preview found: %s", preview)
                    return preview

            logger.debug("Preview: no preview for %s (stem=%s, dir=%s)",
                         model_name, stem, parent)
            return None

        logger.debug("Preview: model file not found in any dir: %s", model_name)
        return None

    def delete_model(self, model_type, model_name):
        """Delete a model file and all associated preview/sidecar files.

        Also removes the model's metadata entry.
        Returns dict with deleted file paths.
        """
        if ".." in model_name:
            raise ValueError(f"Invalid model name: {model_name}")

        path, _ = self.find_model_file(model_type, model_name)
        if path is None:
            raise FileNotFoundError(f"Model not found: {model_name}")

        deleted = []
        parent = path.parent

        # Compute stem from the original (non-disabled) filename.
        # path.name for a disabled file is e.g. "model.safetensors.disabled"
        # so we strip the .disabled suffix first, then take Path.stem.
        orig_name = path.name
        if orig_name.endswith(_DISABLED_SUFFIX):
            orig_name = orig_name[: -len(_DISABLED_SUFFIX)]
        stem = Path(orig_name).stem  # "model.safetensors" -> "model"

        # Delete the model file itself
        path.unlink()
        deleted.append(str(path))
        logger.info("Deleted model file: %s", path)

        # Delete all sidecar files (previews, metadata, info)
        for ext in _SIDECAR_EXTENSIONS:
            sidecar = parent / (stem + ext)
            if sidecar.is_file():
                sidecar.unlink()
                deleted.append(str(sidecar))
                logger.info("Deleted sidecar: %s", sidecar)

        # Remove metadata entry
        data = self._load_metadata()
        if model_name in data:
            del data[model_name]
            self._save_metadata(data)

        return {"deleted": deleted}

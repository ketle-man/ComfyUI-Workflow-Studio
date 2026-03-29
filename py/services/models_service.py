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

    def get_model_groups(self):
        data = self._load_metadata()
        return data.get("_groups", {})

    def save_model_groups(self, groups):
        data = self._load_metadata()
        data["_groups"] = groups
        self._save_metadata(data)
        return groups

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

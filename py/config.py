import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Plugin root directory
PLUGIN_DIR = Path(__file__).resolve().parent.parent

# Directory paths
TEMPLATES_DIR = PLUGIN_DIR / "templates"
STATIC_DIR = PLUGIN_DIR / "static"
DATA_DIR = PLUGIN_DIR / "data"

# Default workflows directory: ComfyUI's user/default/workflows
# PLUGIN_DIR is custom_nodes/ComfyUI-Workflow-Studio
# ComfyUI root is custom_nodes/../../ = two levels up
_COMFYUI_ROOT = PLUGIN_DIR.parent.parent
_COMFYUI_WORKFLOWS = _COMFYUI_ROOT / "user" / "default" / "workflows"

# Use ComfyUI workflows dir if it exists, otherwise fallback to plugin data dir
if _COMFYUI_WORKFLOWS.is_dir():
    DEFAULT_WORKFLOWS_DIR = _COMFYUI_WORKFLOWS
    logger.info("Workflow Studio: Using ComfyUI workflows dir: %s", _COMFYUI_WORKFLOWS)
else:
    DEFAULT_WORKFLOWS_DIR = DATA_DIR / "workflows"
    logger.info("Workflow Studio: ComfyUI workflows dir not found, using: %s", DEFAULT_WORKFLOWS_DIR)

# Apply settings override if available
def _resolve_workflows_dir():
    """Resolve workflows dir from settings, falling back to default."""
    settings_file = DATA_DIR / "settings.json"
    if settings_file.exists():
        try:
            import json
            with open(settings_file, "r", encoding="utf-8") as f:
                settings = json.load(f)
            custom_dir = settings.get("workflows_dir", "").strip()
            if custom_dir:
                p = Path(custom_dir)
                if p.is_dir():
                    return p
                else:
                    logger.warning("Workflow Studio: Configured workflows_dir does not exist: %s", custom_dir)
        except Exception:
            pass
    return DEFAULT_WORKFLOWS_DIR

WORKFLOWS_DIR = _resolve_workflows_dir()

# Ensure data directories exist
WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Metadata file path
METADATA_FILE = DATA_DIR / "metadata.json"
SETTINGS_FILE = DATA_DIR / "settings.json"

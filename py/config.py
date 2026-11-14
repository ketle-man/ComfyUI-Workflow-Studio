import os
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# ─── パス検査（クライアント由来のパスを resolve() する前に文字列のまま検査する）───
# Windows では UNC パス(\\host\share)は resolve()・exists() を呼んだ時点で相手ホストへ
# Windows アカウントの資格情報付きで接続してしまうため、チェックはパス操作より先に行う。

_DRIVE_RE = re.compile(r"^[A-Za-z]:")


def is_unc(value) -> bool:
    """ネットワーク共有/デバイスパス(\\\\host\\share, //host/share, \\\\?\\ 等)か。"""
    return str(value or "").replace("/", "\\").startswith("\\\\")


def is_safe_rel(rel) -> bool:
    """相対パスとして安全か。UNC・ドライブ指定・絶対パス・「..」・空セグメントを
    結合・resolve() より前に文字列のまま拒否する。"""
    s = str(rel or "")
    if not s or "\x00" in s:
        return False
    if s.startswith(("/", "\\")) or _DRIVE_RE.match(s):
        return False
    return not any(part in ("", "..") for part in re.split(r"[/\\]", s))


def resolve_untrusted(value, roots=()) -> Path:
    """クライアント由来の絶対パス文字列を検査してから resolve() して返す。

    ファイルシステムに触れない文字列処理(normpath)だけで「..」を正規化・拒否し、
    UNC は roots のうち UNC のルート配下に文字列上一致する場合のみ許可する
    (ギャラリーのルートをネットワーク共有に置いている構成だけを通すため)。
    拒否時は ValueError。"""
    s = str(value or "")
    if not s or "\x00" in s:
        raise ValueError("Access denied: invalid path")
    p = Path(os.path.normpath(s))
    if ".." in p.parts:
        raise ValueError("Access denied: path traversal")
    if is_unc(s):
        for root in roots:
            if root is None or not is_unc(str(root)):
                continue
            try:
                p.relative_to(Path(root))  # 文字列上の照合(解決しない)
                return p.resolve()
            except (ValueError, OSError):
                continue
        raise ValueError("Access denied: network path")
    return p.resolve()


# Plugin root directory
PLUGIN_DIR = Path(__file__).resolve().parent.parent

# Directory paths
TEMPLATES_DIR = PLUGIN_DIR / "templates"
STATIC_DIR = PLUGIN_DIR / "static"

# ComfyUI root is custom_nodes/../../ = two levels up
_COMFYUI_ROOT = PLUGIN_DIR.parent.parent
COMFYUI_ROOT = _COMFYUI_ROOT  # exposed for external use

# Data directory: prefer ComfyUI's user/default/Workflow-Studio/, fallback to plugin data/
_COMFYUI_USER_DEFAULT = _COMFYUI_ROOT / "user" / "default"
if _COMFYUI_USER_DEFAULT.is_dir():
    DATA_DIR = _COMFYUI_USER_DEFAULT / "Workflow-Studio"
    logger.info("Workflow Studio: Using user data dir: %s", DATA_DIR)
else:
    DATA_DIR = PLUGIN_DIR / "data"
    logger.info("Workflow Studio: user/default not found, using plugin data dir: %s", DATA_DIR)

# Default workflows directory: ComfyUI's user/default/workflows
_COMFYUI_WORKFLOWS = _COMFYUI_USER_DEFAULT / "workflows"

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
NODE_METADATA_FILE = DATA_DIR / "node_metadata.json"
NODE_SETS_FILE = DATA_DIR / "node_sets.json"
PROMPTS_FILE = DATA_DIR / "prompts.json"
MODEL_METADATA_FILE = DATA_DIR / "model_metadata.json"
WILDCARD_DIR = DATA_DIR / "wildcard"
AI_SKILLS_DIR = DATA_DIR / "ai_skills"
LAB_PLAN_DIR = DATA_DIR / "lab_plan"
VIDEO_PLAN_DIR = DATA_DIR / "video_plan"
VIDEO_EDIT_PROJECT_DIR = DATA_DIR / "video_edit_project"

# Tagger
TAGGER_DB_FILE = DATA_DIR / "tagger.db"
TAGGER_SETTINGS_FILE = DATA_DIR / "tagger_settings.json"
TAGGER_MODELS_DIR = _COMFYUI_ROOT / "models" / "tagger"

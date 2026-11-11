"""AI skill (.md system prompt) file management service.

Skills are flat ``*.md`` files with a YAML frontmatter block::

    ---
    name: Display name
    description: One sentence
    metadata:            # optional, Workflow Studio extensions
      wfs-version: 2     # built-in skills only (upgrade tracking)
      output: prompt     # prompt | svg  -> auto-check + action buttons
      tools: []          # [] or [generate_image]
      temperature: 0.4
      think: false
      context: [workflow]
    ---

``name``/``description`` follow the Agent Skills (SKILL.md) convention so skills
stay portable; everything Workflow-Studio-specific lives under ``metadata``.

Built-in skills ship in ``builtin_skills/`` next to this file and are copied
into the user's skill folder.  A small state file records which version and
content hash were installed, so an untouched built-in is upgraded silently
while a user-edited one is left alone (and flagged ``update_available``).
"""

import hashlib
import json
import logging
import re
from pathlib import Path

try:
    import yaml  # PyYAML ships with ComfyUI
except Exception:  # pragma: no cover - fallback parser below
    yaml = None

logger = logging.getLogger(__name__)

ALLOWED_EXTS = {"md"}

BUILTIN_DIR = Path(__file__).parent / "builtin_skills"
STATE_FILENAME = ".builtin_state.json"

# Content hashes of built-in skills released before version tracking existed
# (v0.3.79 - v0.9.4).  A user file matching one of these is an untouched copy
# and can be upgraded safely.
LEGACY_BUILTIN_HASHES = {
    "svg-icon.md": {"f46b635abda182b26df38d4e49ec2a626642fcd98c94013cb67303c69aaf10c1"},
    "skill-creator.md": {"2fb31273298b828c6f18c7fd010be44d31588f881d04757e5c0f5f18bbad2313"},
}

_FRONTMATTER_RE = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n?", re.DOTALL)


def _content_hash(content: str) -> str:
    return hashlib.sha256(content.replace("\r\n", "\n").strip().encode("utf-8")).hexdigest()


def _parse_frontmatter_shallow(block: str) -> dict:
    """Fallback parser: top-level ``key: value`` plus one nested ``metadata:`` level."""
    fields: dict = {}
    current_map: dict | None = None
    for line in block.splitlines():
        if not line.strip() or ":" not in line:
            continue
        indented = line[:1] in (" ", "\t")
        key, _, value = line.strip().partition(":")
        key, value = key.strip(), value.strip()
        if not key:
            continue
        if indented and current_map is not None:
            current_map[key] = _coerce_scalar(value)
        elif not indented:
            if value == "":
                current_map = {}
                fields[key] = current_map
            else:
                current_map = None
                fields[key] = value
    return fields


def _coerce_scalar(value: str):
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        return [v.strip().strip("'\"") for v in inner.split(",") if v.strip()] if inner else []
    low = value.lower()
    if low in ("true", "false"):
        return low == "true"
    try:
        return float(value) if "." in value else int(value)
    except ValueError:
        return value.strip("'\"")


def _parse_frontmatter(content: str) -> dict:
    """Extract the frontmatter block as a dict (empty dict if absent/invalid)."""
    m = _FRONTMATTER_RE.match(content or "")
    if not m:
        return {}
    block = m.group(1)
    if yaml is not None:
        try:
            data = yaml.safe_load(block)
            if isinstance(data, dict):
                return data
        except Exception:
            pass  # e.g. an unquoted ": " inside description -> shallow parse
    return _parse_frontmatter_shallow(block)


def _json_safe(value):
    """Keep only JSON-serialisable metadata values (YAML can yield dates etc.)."""
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _skill_info(filename: str, content: str, size: int) -> dict:
    meta = _parse_frontmatter(content)
    extra = meta.get("metadata") if isinstance(meta.get("metadata"), dict) else {}
    return {
        "filename": filename,
        "name": str(meta.get("name") or Path(filename).stem),
        "description": str(meta.get("description") or ""),
        "metadata": _json_safe(extra),
        "size": size,
    }


def _builtin_version(content: str) -> int:
    meta = _parse_frontmatter(content).get("metadata") or {}
    try:
        return int(meta.get("wfs-version", 1))
    except (TypeError, ValueError):
        return 1


class SkillService:
    def __init__(self, skills_dir: Path, builtin_dir: Path = BUILTIN_DIR):
        self.skills_dir = skills_dir
        self.builtin_dir = builtin_dir
        self.skills_dir.mkdir(parents=True, exist_ok=True)
        try:
            self.sync_builtin_skills()
        except Exception as e:  # never block startup on a seeding problem
            logger.warning("[WFS] Built-in skill sync failed: %s", e)

    # ------------------------------------------------------------------
    # Built-in skills
    # ------------------------------------------------------------------

    def _builtins(self) -> dict[str, str]:
        if not self.builtin_dir.is_dir():
            return {}
        return {
            p.name: p.read_text(encoding="utf-8")
            for p in sorted(self.builtin_dir.glob("*.md"))
            if p.is_file()
        }

    def _load_state(self) -> dict:
        path = self.skills_dir / STATE_FILENAME
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _save_state(self, state: dict) -> None:
        (self.skills_dir / STATE_FILENAME).write_text(
            json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    def _install_builtin(self, filename: str, content: str, state: dict) -> None:
        (self.skills_dir / filename).write_text(content, encoding="utf-8")
        state[filename] = {"version": _builtin_version(content), "hash": _content_hash(content)}

    def sync_builtin_skills(self) -> dict:
        """Install new built-ins and upgrade untouched ones.

        Rules per built-in file:
        - missing and never installed -> install
        - missing but installed before -> the user deleted it, leave it deleted
        - present, untouched (hash matches what we installed, or a known
          pre-tracking release) and older -> overwrite with the new version
        - present but edited by the user -> keep it (reported as update_available)
        Returns ``{"installed": [...], "upgraded": [...]}``.
        """
        state = self._load_state()
        result = {"installed": [], "upgraded": []}
        changed = False
        for filename, content in self._builtins().items():
            new_version = _builtin_version(content)
            path = self.skills_dir / filename
            entry = state.get(filename)
            if not path.is_file():
                if entry is None:
                    self._install_builtin(filename, content, state)
                    result["installed"].append(filename)
                    changed = True
                continue
            current_hash = _content_hash(path.read_text(encoding="utf-8"))
            if entry is None:
                if current_hash in LEGACY_BUILTIN_HASHES.get(filename, set()):
                    self._install_builtin(filename, content, state)
                    result["upgraded"].append(filename)
                elif current_hash == _content_hash(content):
                    state[filename] = {"version": new_version, "hash": current_hash}
                else:
                    # A user file with a built-in's name - never overwrite it.
                    state[filename] = {"version": 0, "hash": None}
                changed = True
                continue
            if int(entry.get("version") or 0) < new_version and current_hash == entry.get("hash"):
                self._install_builtin(filename, content, state)
                result["upgraded"].append(filename)
                changed = True
        if changed:
            self._save_state(state)
        if result["installed"] or result["upgraded"]:
            logger.info("[WFS] Built-in skills installed=%s upgraded=%s", result["installed"], result["upgraded"])
        return result

    def restore_builtin(self, filename: str) -> dict:
        """Overwrite a skill file with the shipped built-in version (explicit user action)."""
        builtins = self._builtins()
        if filename not in builtins:
            raise ValueError(f"Not a built-in skill: {filename}")
        state = self._load_state()
        self._install_builtin(filename, builtins[filename], state)
        self._save_state(state)
        path = self.skills_dir / filename
        return _skill_info(filename, builtins[filename], path.stat().st_size)

    # ------------------------------------------------------------------
    # File CRUD
    # ------------------------------------------------------------------

    def list_skills(self) -> list[dict]:
        """Return sorted list of skill files with parsed frontmatter metadata."""
        if not self.skills_dir.exists():
            return []
        builtins = self._builtins()
        state = self._load_state()
        files = []
        for path in sorted(self.skills_dir.glob("*")):
            if not (path.is_file() and path.suffix.lstrip(".").lower() in ALLOWED_EXTS):
                continue
            try:
                content = path.read_text(encoding="utf-8")
            except Exception:
                content = ""
            info = _skill_info(path.name, content, path.stat().st_size)
            builtin_content = builtins.get(path.name)
            info["builtin"] = builtin_content is not None
            info["update_available"] = False
            if builtin_content is not None:
                current_hash = _content_hash(content)
                if current_hash != _content_hash(builtin_content):
                    entry = state.get(path.name) or {}
                    installed_version = int(entry.get("version") or 0)
                    info["update_available"] = installed_version < _builtin_version(builtin_content)
                    info["modified"] = True
            files.append(info)
        return files

    def get_content(self, filename: str) -> str:
        path = self._safe_path(filename)
        if path is None:
            raise ValueError(f"Invalid filename: {filename}")
        if not path.is_file():
            raise FileNotFoundError(f"File not found: {filename}")
        return path.read_text(encoding="utf-8")

    def save_file(self, filename: str, content: str) -> dict:
        path = self._safe_path(filename)
        if path is None:
            raise ValueError(f"Invalid filename: {filename}")
        path.write_text(content, encoding="utf-8")
        return _skill_info(path.name, content, path.stat().st_size)

    def delete_file(self, filename: str) -> None:
        path = self._safe_path(filename)
        if path is None:
            raise ValueError(f"Invalid filename: {filename}")
        if path.is_file():
            path.unlink()

    def _safe_path(self, filename: str) -> Path | None:
        if not filename or not filename.strip():
            return None
        # Skills are a flat directory - reject any path separator (no subfolders).
        name = filename.strip()
        if "/" in name or "\\" in name or name in (".", "..") or name.startswith("."):
            return None
        ext = Path(name).suffix.lstrip(".").lower()
        if ext not in ALLOWED_EXTS:
            return None
        return self.skills_dir / name

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
import io
import json
import logging
import re
import shutil
import zipfile
from pathlib import Path, PurePosixPath

try:
    import yaml  # PyYAML ships with ComfyUI
except Exception:  # pragma: no cover - fallback parser below
    yaml = None

logger = logging.getLogger(__name__)

ALLOWED_EXTS = {"md"}

# Folder skills (Agent Skills / SKILL.md standard): <skills_dir>/<folder>/SKILL.md plus optional
# reference files.  Only text resources are kept and served - Workflow Studio never runs a
# skill's scripts, so script files are skipped on import.
SKILL_MD = "SKILL.md"
RESOURCE_EXTS = {"md", "txt", "json", "yaml", "yml", "csv"}
MAX_RESOURCES = 50
MAX_RESOURCE_BYTES = 200 * 1024        # per file served to the chat model
MAX_IMPORT_FILE_BYTES = 1024 * 1024    # per file inside an imported zip
MAX_IMPORT_TOTAL_BYTES = 5 * 1024 * 1024
MAX_IMPORT_ENTRIES = 300
_FOLDER_RE = re.compile(r"^[A-Za-z0-9][\w.\- ]{0,63}$")

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
        """Return sorted list of flat skill files and folder skills with parsed metadata."""
        if not self.skills_dir.exists():
            return []
        builtins = self._builtins()
        state = self._load_state()
        files = []
        for path in sorted(self.skills_dir.glob("*")):
            if path.is_dir():
                info = self._folder_skill_info(path)
                if info:
                    files.append(info)
                continue
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

    def _folder_skill_info(self, folder: Path) -> dict | None:
        if folder.name.startswith(".") or not _FOLDER_RE.match(folder.name):
            return None
        skill_md = folder / SKILL_MD
        if not skill_md.is_file():
            return None
        try:
            content = skill_md.read_text(encoding="utf-8")
        except Exception:
            content = ""
        info = _skill_info(f"{folder.name}/{SKILL_MD}", content, skill_md.stat().st_size)
        if info["name"] == SKILL_MD.rsplit(".", 1)[0]:
            info["name"] = folder.name
        info["folder"] = folder.name
        info["resources"] = self.list_resources(folder.name)
        info["builtin"] = False
        info["update_available"] = False
        return info

    def list_resources(self, folder: str) -> list[str]:
        """Readable reference files of a folder skill (relative POSIX paths, SKILL.md excluded)."""
        base = self._folder_path(folder)
        if base is None or not base.is_dir():
            return []
        out = []
        for path in sorted(base.rglob("*")):
            if len(out) >= MAX_RESOURCES:
                break
            if not path.is_file() or path.is_symlink():
                continue
            rel = path.relative_to(base).as_posix()
            if rel == SKILL_MD or any(part.startswith(".") for part in rel.split("/")):
                continue
            if path.suffix.lstrip(".").lower() in RESOURCE_EXTS:
                out.append(rel)
        return out

    def get_resource(self, folder: str, rel_path: str) -> str:
        """Read one reference file of a folder skill (used by the chat's read_skill_file tool)."""
        base = self._folder_path(folder)
        if base is None or not base.is_dir():
            raise FileNotFoundError(f"Skill folder not found: {folder}")
        rel = PurePosixPath(str(rel_path or "").replace("\\", "/"))
        if rel.is_absolute() or ".." in rel.parts or not rel.parts or rel.as_posix() == SKILL_MD:
            raise ValueError(f"Invalid resource path: {rel_path}")
        if rel.suffix.lstrip(".").lower() not in RESOURCE_EXTS:
            raise ValueError(f"Unsupported resource type: {rel_path}")
        path = (base / rel).resolve()
        if base.resolve() not in path.parents or not path.is_file():
            raise FileNotFoundError(f"Resource not found: {rel_path}")
        data = path.read_bytes()[:MAX_RESOURCE_BYTES]
        return data.decode("utf-8", errors="replace")

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
        if path.name == SKILL_MD and not path.parent.is_dir():
            raise FileNotFoundError(f"Skill folder not found: {filename}")
        path.write_text(content, encoding="utf-8")
        rel = path.relative_to(self.skills_dir).as_posix()
        return _skill_info(rel, content, path.stat().st_size)

    def delete_file(self, filename: str) -> None:
        path = self._safe_path(filename)
        if path is None:
            raise ValueError(f"Invalid filename: {filename}")
        if path.name == SKILL_MD and path.parent != self.skills_dir:
            # A folder skill is deleted as a whole (SKILL.md + its reference files).
            if path.parent.is_dir():
                shutil.rmtree(path.parent)
            return
        if path.is_file():
            path.unlink()

    # ------------------------------------------------------------------
    # Import (Agent Skills zip or a single .md)
    # ------------------------------------------------------------------

    def import_skill(self, upload_name: str, data: bytes) -> dict:
        """Import an uploaded skill.

        - ``*.md``: saved as a flat skill (``<slug>.md``; SKILL.md uploads are named after their
          frontmatter name).
        - ``*.zip``: an Agent Skills folder - SKILL.md at the zip root or inside exactly one top
          folder.  Only text resources are extracted; scripts and binaries are skipped.
        Returns ``{"skill": info, "skipped": [paths]}``.  Never overwrites: a numeric suffix is
        added when the name is taken.
        """
        name = (upload_name or "").strip()
        lower = name.lower()
        if lower.endswith(".md"):
            text = data.decode("utf-8", errors="replace")
            meta = _parse_frontmatter(text)
            stem = Path(name).stem if Path(name).name != SKILL_MD else str(meta.get("name") or "imported-skill")
            filename = self._unique_name(_slugify(stem), ".md")
            (self.skills_dir / filename).write_text(text, encoding="utf-8")
            return {"skill": _skill_info(filename, text, len(data)), "skipped": []}
        if not lower.endswith(".zip"):
            raise ValueError("Only .zip (Agent Skills folder) or .md files can be imported")
        return self._import_zip(data)

    def _import_zip(self, data: bytes) -> dict:
        try:
            zf = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as e:
            raise ValueError(f"Not a valid zip file: {e}") from e
        infos = [i for i in zf.infolist() if not i.is_dir()]
        if len(infos) > MAX_IMPORT_ENTRIES:
            raise ValueError(f"Too many files in the zip ({len(infos)} > {MAX_IMPORT_ENTRIES})")

        def parts_of(info):
            p = PurePosixPath(info.filename.replace("\\", "/"))
            if p.is_absolute() or ".." in p.parts or any(":" in part for part in p.parts):
                raise ValueError(f"Unsafe path in zip: {info.filename}")
            return p.parts

        all_parts = [(i, parts_of(i)) for i in infos]
        # Ignore OS junk (__MACOSX/, .DS_Store) when locating SKILL.md.
        all_parts = [(i, ps) for i, ps in all_parts if ps and ps[0] != "__MACOSX" and not ps[-1].startswith(".")]
        skill_md_parts = [ps for _, ps in all_parts if ps[-1] == SKILL_MD and len(ps) <= 2]
        if len(skill_md_parts) != 1:
            raise ValueError("The zip must contain exactly one SKILL.md at its root or in one top-level folder")
        prefix = skill_md_parts[0][:-1]  # () or (top_folder,)

        skill_text = zf.read("/".join(skill_md_parts[0])).decode("utf-8", errors="replace")
        meta = _parse_frontmatter(skill_text)
        base_name = prefix[0] if prefix else str(meta.get("name") or "imported-skill")
        folder = self._unique_name(_slugify(base_name), "")
        target = self.skills_dir / folder
        target.mkdir(parents=True)

        written, skipped, total = 0, [], 0
        try:
            for info, ps in all_parts:
                if tuple(ps[: len(prefix)]) != prefix:
                    skipped.append(info.filename)
                    continue
                rel = PurePosixPath(*ps[len(prefix):])
                is_skill_md = rel.as_posix() == SKILL_MD
                ext = rel.suffix.lstrip(".").lower()
                if not is_skill_md and ext not in RESOURCE_EXTS:
                    skipped.append(info.filename)
                    continue
                if info.file_size > MAX_IMPORT_FILE_BYTES:
                    skipped.append(info.filename)
                    continue
                total += info.file_size
                if total > MAX_IMPORT_TOTAL_BYTES:
                    raise ValueError("The zip's text files exceed 5 MB in total")
                content = zf.read(info)[:MAX_IMPORT_FILE_BYTES]
                out = (target / rel).resolve()
                if target.resolve() not in out.parents:
                    raise ValueError(f"Unsafe path in zip: {info.filename}")
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(content)
                written += 1
        except Exception:
            shutil.rmtree(target, ignore_errors=True)
            raise
        logger.info("[WFS] Imported skill folder %s (%d files, %d skipped)", folder, written, len(skipped))
        return {"skill": self._folder_skill_info(target), "skipped": skipped}

    def _unique_name(self, stem: str, suffix: str) -> str:
        candidate = f"{stem}{suffix}"
        n = 2
        while (self.skills_dir / candidate).exists():
            candidate = f"{stem}-{n}{suffix}"
            n += 1
        return candidate

    # ------------------------------------------------------------------
    # Path safety
    # ------------------------------------------------------------------

    def _folder_path(self, folder: str) -> Path | None:
        name = (folder or "").strip()
        if not _FOLDER_RE.match(name) or name.startswith("."):
            return None
        return self.skills_dir / name

    def _safe_path(self, filename: str) -> Path | None:
        """Flat ``name.md`` or a folder skill's ``<folder>/SKILL.md`` - nothing else."""
        if not filename or not filename.strip():
            return None
        name = filename.strip().replace("\\", "/")
        if "/" in name:
            folder, _, leaf = name.partition("/")
            if leaf != SKILL_MD:
                return None
            base = self._folder_path(folder)
            return base / SKILL_MD if base is not None else None
        if name in (".", "..") or name.startswith("."):
            return None
        ext = Path(name).suffix.lstrip(".").lower()
        if ext not in ALLOWED_EXTS:
            return None
        return self.skills_dir / name


def _slugify(text: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", str(text)).strip("-").lower()[:48]
    return slug or "imported-skill"

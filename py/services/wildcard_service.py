"""Wildcard file management service."""

import logging
import os
import platform
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

ALLOWED_EXTS = {"txt", "yaml", "yml"}


class WildcardService:
    def __init__(self, wildcard_dir: Path):
        self.wildcard_dir = wildcard_dir
        # Only mkdir if it is a real directory (not a junction/symlink)
        if not self.wildcard_dir.exists() and not self._is_junction(self.wildcard_dir):
            self.wildcard_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # File CRUD
    # ------------------------------------------------------------------

    def list_wildcards(self) -> list[dict]:
        """Return sorted list of wildcard files recursively (follows junction/symlink)."""
        if not self.wildcard_dir.exists():
            return []
        files = []
        for path in sorted(self.wildcard_dir.rglob("*")):
            if path.is_file() and path.suffix.lstrip(".").lower() in ALLOWED_EXTS:
                rel = path.relative_to(self.wildcard_dir)
                dir_posix = rel.parent.as_posix()
                if dir_posix == ".":
                    dir_posix = ""
                files.append({
                    "name": path.stem,
                    "filename": rel.as_posix(),
                    "ext": path.suffix.lstrip(".").lower(),
                    "size": path.stat().st_size,
                    "dir": dir_posix,
                    "wc_name": rel.with_suffix("").as_posix(),
                })
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
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        rel = path.relative_to(self.wildcard_dir)
        dir_posix = rel.parent.as_posix()
        if dir_posix == ".":
            dir_posix = ""
        return {
            "name": path.stem,
            "filename": rel.as_posix(),
            "ext": path.suffix.lstrip(".").lower(),
            "size": path.stat().st_size,
            "dir": dir_posix,
            "wc_name": rel.with_suffix("").as_posix(),
        }

    def delete_file(self, filename: str) -> None:
        path = self._safe_path(filename)
        if path is None:
            raise ValueError(f"Invalid filename: {filename}")
        if path.is_file():
            path.unlink()

    def _safe_path(self, filename: str) -> Path | None:
        if not filename or not filename.strip():
            return None
        # Normalize to forward slashes and strip leading/trailing slashes
        filename = filename.replace("\\", "/").strip("/")
        # Validate each path component — block traversal and empty parts
        parts = filename.split("/")
        for p in parts:
            if not p or p == ".." or p == ".":
                return None
        ext = Path(parts[-1]).suffix.lstrip(".").lower()
        if ext not in ALLOWED_EXTS:
            return None
        return self.wildcard_dir.joinpath(*parts)

    # ------------------------------------------------------------------
    # Impact Pack integration
    # ------------------------------------------------------------------

    @staticmethod
    def find_impact_pack_wildcards(comfyui_root: Path) -> Path | None:
        """Return Impact Pack wildcards directory path, or None if not installed."""
        custom_nodes = comfyui_root / "custom_nodes"
        if not custom_nodes.is_dir():
            return None
        for d in custom_nodes.iterdir():
            if d.is_dir() and "impact-pack" in d.name.lower():
                wildcards = d / "wildcards"
                if wildcards.is_dir():
                    return wildcards
        return None

    def get_link_status(self, comfyui_root: Path) -> dict:
        """Return current Impact Pack integration status."""
        impact_dir = self.find_impact_pack_wildcards(comfyui_root)
        is_linked = self._is_junction(self.wildcard_dir) or self.wildcard_dir.is_symlink()

        resolved_target = None
        if is_linked:
            try:
                resolved_target = str(self.wildcard_dir.resolve())
            except Exception:
                pass

        return {
            "impact_pack_installed": impact_dir is not None,
            "impact_pack_wildcards_dir": str(impact_dir) if impact_dir else None,
            "wfs_wildcard_dir": str(self.wildcard_dir),
            "is_linked": is_linked,
            "link_target": resolved_target,
        }

    def create_link(self, comfyui_root: Path) -> dict:
        """Replace WFS wildcard dir with a junction/symlink → Impact Pack wildcards."""
        impact_dir = self.find_impact_pack_wildcards(comfyui_root)
        if impact_dir is None:
            raise RuntimeError("ComfyUI-Impact-Pack is not installed.")

        if self._is_junction(self.wildcard_dir) or self.wildcard_dir.is_symlink():
            raise RuntimeError("Link already exists.")

        # Migrate existing WFS files to Impact Pack dir
        migrated: list[str] = []
        if self.wildcard_dir.is_dir():
            for f in self.wildcard_dir.iterdir():
                if f.is_file():
                    dest = impact_dir / f.name
                    if not dest.exists():
                        shutil.copy2(str(f), str(dest))
                        migrated.append(f.name)
            shutil.rmtree(str(self.wildcard_dir))

        # Create junction (Windows) or symlink (others)
        self._create_junction_or_symlink(self.wildcard_dir, impact_dir)
        logger.info("Wildcard link created: %s -> %s", self.wildcard_dir, impact_dir)
        return {"migrated_files": migrated}

    def remove_link(self) -> None:
        """Remove junction/symlink and restore WFS wildcard dir as a plain directory."""
        if not (self._is_junction(self.wildcard_dir) or self.wildcard_dir.is_symlink()):
            raise RuntimeError("No link to remove.")
        self._remove_junction_or_symlink(self.wildcard_dir)
        self.wildcard_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Wildcard link removed, restored plain dir: %s", self.wildcard_dir)

    # ------------------------------------------------------------------
    # Platform helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _is_junction(path: Path) -> bool:
        """Return True if path is a Windows directory junction."""
        if platform.system() != "Windows":
            return False
        try:
            import ctypes
            FILE_ATTRIBUTE_REPARSE_POINT = 0x0400
            attrs = ctypes.windll.kernel32.GetFileAttributesW(str(path))
            return attrs != 0xFFFFFFFF and bool(attrs & FILE_ATTRIBUTE_REPARSE_POINT)
        except Exception:
            return False

    @staticmethod
    def _create_junction_or_symlink(link: Path, target: Path) -> None:
        if platform.system() == "Windows":
            result = subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(link), str(target)],
                capture_output=True, text=True,
            )
            if result.returncode != 0:
                raise RuntimeError(f"mklink /J failed: {result.stderr.strip()}")
        else:
            os.symlink(target, link, target_is_directory=True)

    @staticmethod
    def _remove_junction_or_symlink(path: Path) -> None:
        if platform.system() == "Windows":
            result = subprocess.run(
                ["cmd", "/c", "rmdir", str(path)],
                capture_output=True, text=True,
            )
            if result.returncode != 0:
                raise RuntimeError(f"rmdir failed: {result.stderr.strip()}")
        else:
            os.unlink(str(path))

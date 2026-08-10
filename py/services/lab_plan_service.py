"""Lab tab plan file management service (JSON plan + optional PNG index thumbnail)."""

import base64
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


class LabPlanService:
    def __init__(self, plan_dir: Path):
        self.plan_dir = plan_dir
        self.plan_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Path safety
    # ------------------------------------------------------------------

    def _safe_path(self, filename: str, ext: str = ".json") -> Path | None:
        if not filename or not filename.strip():
            return None
        name = filename.strip()
        if not name.endswith(ext):
            name = name + ext
        if "/" in name or "\\" in name or name in (".", "..") or "\x00" in name:
            return None
        resolved = (self.plan_dir / name).resolve()
        plan_dir_resolved = self.plan_dir.resolve()
        if resolved != plan_dir_resolved and not str(resolved).startswith(str(plan_dir_resolved) + "\\") and not str(resolved).startswith(str(plan_dir_resolved) + "/"):
            return None
        return resolved

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def list_plans(self) -> list[dict]:
        if not self.plan_dir.is_dir():
            return []
        result = []
        for path in sorted(self.plan_dir.glob("*.json")):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                logger.warning("Skipping unreadable lab plan %s: %s", path.name, e)
                continue

            stem = path.stem
            thumbnail = None
            thumb_path = self.plan_dir / f"{stem}.png"
            if thumb_path.is_file():
                thumbnail = f"/wfm_data/lab_plan/{stem}.png"

            result.append({
                "filename": path.name,
                "name": data.get("name", stem),
                "note": data.get("note", ""),
                "batch_count": data.get("batch_count", 1),
                "updated_at": data.get("updated_at", ""),
                "thumbnail": thumbnail,
            })
        result.sort(key=lambda p: p.get("updated_at", ""), reverse=True)
        return result

    def get_plan(self, filename: str) -> dict:
        path = self._safe_path(filename)
        if path is None:
            raise ValueError(f"Invalid filename: {filename}")
        if not path.is_file():
            raise FileNotFoundError(f"Plan not found: {filename}")
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def save_plan(self, filename: str, data: dict, index_image_base64: str | None = None) -> dict:
        path = self._safe_path(filename)
        if path is None:
            raise ValueError(f"Invalid filename: {filename}")

        data = dict(data)
        data["updated_at"] = self._now_iso()

        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        if index_image_base64:
            self.save_index_image(filename, index_image_base64)

        return {"filename": path.name, "updated_at": data["updated_at"]}

    def save_index_image(self, filename: str, image_base64: str) -> None:
        path = self._safe_path(filename)
        if path is None:
            raise ValueError(f"Invalid filename: {filename}")
        stem = path.stem
        thumb_path = self.plan_dir / f"{stem}.png"

        # Accept both raw base64 and data: URL forms
        b64 = image_base64
        if "," in b64 and b64.strip().lower().startswith("data:"):
            b64 = b64.split(",", 1)[1]

        image_bytes = base64.b64decode(b64)
        with open(thumb_path, "wb") as f:
            f.write(image_bytes)

    def save_index_image_to_output(self, image_base64: str, filename_prefix: str = "Lab_index") -> dict:
        """Saves the contact-sheet index image into ComfyUI's own output folder,
        alongside the images generated during the run (unlike save_index_image,
        which saves it next to the plan file in plan_dir)."""
        b64 = image_base64
        if "," in b64 and b64.strip().lower().startswith("data:"):
            b64 = b64.split(",", 1)[1]
        image_bytes = base64.b64decode(b64)

        import folder_paths  # type: ignore
        output_dir = folder_paths.get_output_directory()
        full_output_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(filename_prefix, output_dir)
        save_name = f"{filename}_{counter:05}_.png"
        save_path = Path(full_output_folder) / save_name
        save_path.write_bytes(image_bytes)
        return {"filename": save_name, "subfolder": subfolder}

    def delete_plan(self, filename: str) -> None:
        path = self._safe_path(filename)
        if path is None:
            raise ValueError(f"Invalid filename: {filename}")
        if path.is_file():
            path.unlink()
        thumb_path = self.plan_dir / f"{path.stem}.png"
        if thumb_path.is_file():
            thumb_path.unlink()

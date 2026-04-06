"""Workflow CRUD and metadata management service."""

import json
import os
import re
from datetime import datetime, timezone

from ..config import WORKFLOWS_DIR, METADATA_FILE
from .workflow_analyzer import analyze_workflow
from .png_extractor import extract_png_workflow


class WorkflowService:
    """Manages workflow files and metadata."""

    def __init__(self):
        self.workflows_dir = WORKFLOWS_DIR
        self.metadata_file = METADATA_FILE

    def update_workflows_dir(self, new_dir):
        """Update workflows directory at runtime."""
        from pathlib import Path
        p = Path(new_dir)
        p.mkdir(parents=True, exist_ok=True)
        self.workflows_dir = p

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

    def _validate_filename(self, fname):
        """Validate filename has no path traversal."""
        if not fname or "/" in fname or "\\" in fname:
            return False
        if fname in (".", "..") or "\x00" in fname:
            return False
        return True

    def _safe_path(self, filename):
        """Resolve path and ensure it stays within workflows_dir.

        Raises ValueError if path traversal is detected.
        """
        if not self._validate_filename(filename):
            raise ValueError(f"Invalid filename: {filename}")
        resolved = (self.workflows_dir / filename).resolve()
        workflows_resolved = self.workflows_dir.resolve()
        if not str(resolved).startswith(str(workflows_resolved) + os.sep) and resolved != workflows_resolved:
            raise ValueError(f"Path traversal detected: {filename}")
        return resolved

    def _now_iso(self):
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    def list_workflows(self):
        """List all workflows with analysis and metadata."""
        self.workflows_dir.mkdir(parents=True, exist_ok=True)
        metadata = self._load_metadata()
        result = []

        for fname in sorted(os.listdir(self.workflows_dir)):
            if not fname.endswith(".json"):
                continue
            fpath = self.workflows_dir / fname
            if not fpath.is_file():
                continue

            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    wf_data = json.load(f)
                analysis = analyze_workflow(wf_data, fname)
            except Exception:
                analysis = {
                    "modelTypes": [],
                    "inputs": {"prompts": 0, "images": 0, "videos": 0},
                    "outputs": {"images": 0, "videos": 0},
                    "format": "unknown",
                }

            stat = fpath.stat()
            meta = metadata.get(fname, {})

            # Check for thumbnail
            base = fname[:-5]
            thumbnail = None
            for ext in (".png", ".webp"):
                if (self.workflows_dir / (base + ext)).is_file():
                    thumbnail = f"/wfm_data/workflows/{base}{ext}"
                    break

            override_types = meta.get("modelTypesOverride", [])
            if override_types:
                analysis["modelTypes"] = override_types

            result.append(
                {
                    "filename": fname,
                    "analysis": analysis,
                    "metadata": {
                        "tags": meta.get("tags", []),
                        "memo": meta.get("memo", ""),
                        "summary": meta.get("summary", ""),
                        "modelTypesOverride": override_types,
                        "favorite": bool(meta.get("favorite", False)),
                        "badges": meta.get("badges", []),
                    },
                    "mtime": stat.st_mtime,
                    "thumbnail": thumbnail,
                }
            )

        return result

    def get_raw(self, filename):
        """Get raw workflow JSON content."""
        fpath = self._safe_path(filename)
        if not fpath.is_file():
            return None
        with open(fpath, "r", encoding="utf-8") as f:
            return f.read()

    def save_metadata(self, filename, updates):
        """Save metadata (tags, memo, summary, etc.) for a workflow."""
        metadata = self._load_metadata()
        entry = metadata.get(filename, {})
        for key in ("tags", "memo", "summary", "modelTypesOverride", "favorite", "badges"):
            if key in updates:
                entry[key] = updates[key]
        entry["updatedAt"] = self._now_iso()
        metadata[filename] = entry
        self._save_metadata(metadata)

    def import_files(self, files):
        """Import workflow files. Returns list of results."""
        results = []
        self.workflows_dir.mkdir(parents=True, exist_ok=True)

        for original_name, file_data in files:
            ext = os.path.splitext(original_name)[1].lower()
            base = os.path.splitext(original_name)[0]

            if not self._validate_filename(original_name):
                results.append(
                    {"name": original_name, "status": "error", "message": "Invalid filename"}
                )
                continue

            if ext == ".json":
                try:
                    wf_data = json.loads(file_data.decode("utf-8"))
                    out_path = self._safe_path(original_name)
                    with open(out_path, "w", encoding="utf-8") as f:
                        json.dump(wf_data, f, ensure_ascii=False, indent=2)
                    results.append({"name": original_name, "status": "success"})
                except Exception as ex:
                    results.append(
                        {"name": original_name, "status": "error", "message": str(ex)}
                    )

            elif ext == ".png":
                wf_data = extract_png_workflow(file_data)
                if wf_data is None:
                    results.append(
                        {
                            "name": original_name,
                            "status": "error",
                            "message": "No ComfyUI metadata found in PNG",
                        }
                    )
                else:
                    try:
                        # Save PNG as thumbnail
                        with open(
                            self._safe_path(original_name), "wb"
                        ) as f:
                            f.write(file_data)
                        # Save extracted workflow as JSON
                        json_name = base + ".json"
                        with open(
                            self._safe_path(json_name), "w", encoding="utf-8"
                        ) as f:
                            json.dump(wf_data, f, ensure_ascii=False, indent=2)
                        results.append({"name": json_name, "status": "success"})
                    except Exception as ex:
                        results.append(
                            {
                                "name": original_name,
                                "status": "error",
                                "message": str(ex),
                            }
                        )
            else:
                results.append(
                    {
                        "name": original_name,
                        "status": "error",
                        "message": "Unsupported file format",
                    }
                )

        return results

    def rename(self, old_name, new_stem):
        """Rename workflow and its associated thumbnail."""
        new_name = new_stem + ".json"
        old_json = self._safe_path(old_name)
        new_json = self._safe_path(new_name)

        if not old_json.is_file():
            return {"error": "file not found"}, 404
        if new_json.exists():
            return {"error": "name already exists"}, 409

        os.rename(old_json, new_json)

        # Rename associated thumbnail
        old_stem = old_name[:-5] if old_name.endswith(".json") else old_name
        for ext in (".png", ".webp"):
            old_thumb = self._safe_path(old_stem + ext)
            new_thumb = self._safe_path(new_stem + ext)
            if old_thumb.is_file():
                os.rename(old_thumb, new_thumb)

        # Update metadata key
        metadata = self._load_metadata()
        if old_name in metadata:
            metadata[new_name] = metadata.pop(old_name)
            self._save_metadata(metadata)

        return {"status": "ok", "newFilename": new_name}, 200

    def delete(self, filename):
        """Delete workflow JSON and associated thumbnail."""
        json_path = self._safe_path(filename)
        if json_path.is_file():
            os.remove(json_path)

        base = filename[:-5] if filename.endswith(".json") else filename
        for ext in (".png", ".webp"):
            thumb_path = self._safe_path(base + ext)
            if thumb_path.is_file():
                os.remove(thumb_path)

        metadata = self._load_metadata()
        if filename in metadata:
            del metadata[filename]
            self._save_metadata(metadata)

    def analyze(self, filename):
        """Re-analyze a workflow and save results to metadata."""
        fpath = self._safe_path(filename)
        if not fpath.is_file():
            return None

        with open(fpath, "r", encoding="utf-8") as f:
            wf_data = json.load(f)
        analysis = analyze_workflow(wf_data, filename)

        metadata = self._load_metadata()
        entry = metadata.get(filename, {})
        entry["analysis"] = analysis
        entry["analyzedAt"] = self._now_iso()
        metadata[filename] = entry
        self._save_metadata(metadata)

        return analysis

    def reanalyze_all(self):
        """Re-analyze all workflows and update metadata."""
        self.workflows_dir.mkdir(parents=True, exist_ok=True)
        metadata = self._load_metadata()
        updated = 0
        errors = []

        for fname in sorted(os.listdir(self.workflows_dir)):
            if not fname.endswith(".json"):
                continue
            fpath = self.workflows_dir / fname
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    wf_data = json.load(f)
                analysis = analyze_workflow(wf_data, fname)
                entry = metadata.get(fname, {})
                entry["analysis"] = analysis
                entry["analyzedAt"] = self._now_iso()
                metadata[fname] = entry
                updated += 1
            except Exception as ex:
                errors.append({"name": fname, "message": str(ex)})

        self._save_metadata(metadata)
        return {"updated": updated, "errors": errors}

    def change_thumbnail(self, filename, image_data, original_image_name):
        """Change workflow thumbnail image."""
        self._safe_path(filename)  # validate filename
        orig_name_lower = original_image_name.lower()
        if orig_name_lower.endswith(".webp"):
            new_ext = ".webp"
        elif orig_name_lower.endswith(".jpg") or orig_name_lower.endswith(".jpeg"):
            new_ext = ".jpg"
        else:
            new_ext = ".png"

        stem = filename[:-5] if filename.endswith(".json") else filename

        # Backup existing thumbnails
        for ext in (".png", ".webp", ".jpg", ".jpeg"):
            old_thumb = self._safe_path(stem + ext)
            if old_thumb.is_file():
                backup = self._safe_path("old_" + stem + ext)
                if backup.is_file():
                    os.remove(backup)
                os.rename(old_thumb, backup)

        # Save new thumbnail
        new_thumb_path = self._safe_path(stem + new_ext)
        with open(new_thumb_path, "wb") as f:
            f.write(image_data)

        return f"/wfm_data/workflows/{stem}{new_ext}"

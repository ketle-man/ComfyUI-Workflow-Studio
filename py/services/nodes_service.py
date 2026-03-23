"""Node metadata and node sets management service."""

import json
import uuid
from datetime import datetime, timezone

from ..config import NODE_METADATA_FILE, NODE_SETS_FILE


class NodesService:
    """Manages user-defined node metadata (tags, favorites, groups) and node sets."""

    def __init__(self):
        self.node_metadata_file = NODE_METADATA_FILE
        self.node_sets_file = NODE_SETS_FILE

    def _now_iso(self):
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # ── Node Metadata ──────────────────────────────────────────

    def _load_node_metadata(self):
        if self.node_metadata_file.exists():
            try:
                with open(self.node_metadata_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def _save_node_metadata(self, data):
        self.node_metadata_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.node_metadata_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def get_all_metadata(self):
        return self._load_node_metadata()

    def update_node_metadata(self, node_name, updates):
        data = self._load_node_metadata()
        if node_name not in data:
            data[node_name] = {"tags": [], "favorite": False}
        entry = data[node_name]
        if "tags" in updates:
            entry["tags"] = updates["tags"]
        if "favorite" in updates:
            entry["favorite"] = updates["favorite"]
        entry["updatedAt"] = self._now_iso()
        data[node_name] = entry
        self._save_node_metadata(data)
        return entry

    # ── Node Groups ────────────────────────────────────────────

    def get_node_groups(self):
        data = self._load_node_metadata()
        return data.get("_groups", {})

    def save_node_groups(self, groups):
        data = self._load_node_metadata()
        data["_groups"] = groups
        self._save_node_metadata(data)
        return groups

    # ── Node Sets ──────────────────────────────────────────────

    def _load_node_sets(self):
        if self.node_sets_file.exists():
            try:
                with open(self.node_sets_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return []

    def _save_node_sets(self, sets):
        self.node_sets_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.node_sets_file, "w", encoding="utf-8") as f:
            json.dump(sets, f, ensure_ascii=False, indent=2)

    def list_node_sets(self):
        return self._load_node_sets()

    def create_node_set(self, set_data):
        sets = self._load_node_sets()
        set_data["id"] = str(uuid.uuid4())
        set_data["created_at"] = self._now_iso()
        sets.append(set_data)
        self._save_node_sets(sets)
        return set_data

    def update_node_set(self, set_id, updates):
        sets = self._load_node_sets()
        for s in sets:
            if s["id"] == set_id:
                for key in ("name", "description", "tags", "nodes", "links"):
                    if key in updates:
                        s[key] = updates[key]
                s["updated_at"] = self._now_iso()
                self._save_node_sets(sets)
                return s
        return None

    def delete_node_set(self, set_id):
        sets = self._load_node_sets()
        sets = [s for s in sets if s["id"] != set_id]
        self._save_node_sets(sets)

    def export_node_set_json(self, set_id):
        """Export a node set as ComfyUI-compatible partial workflow JSON."""
        sets = self._load_node_sets()
        target = None
        for s in sets:
            if s["id"] == set_id:
                target = s
                break
        if target is None:
            return None

        nodes = target.get("nodes", [])
        links = target.get("links", [])

        # Build prompt-format dict
        prompt = {}
        base_id = 100
        for i, node in enumerate(nodes):
            node_id = str(base_id + i)
            inputs = {}
            # Apply links: set linked inputs as [source_node_id, slot]
            for link in links:
                if link.get("to_node") == i:
                    input_name = link.get("to_input", "")
                    from_id = str(base_id + link["from_node"])
                    inputs[input_name] = [from_id, link.get("from_slot", 0)]
            prompt[node_id] = {
                "class_type": node["class_type"],
                "inputs": inputs,
            }
            if node.get("title"):
                prompt[node_id]["_meta"] = {"title": node["title"]}

        return {
            "name": target.get("name", ""),
            "prompt": prompt,
            "node_count": len(nodes),
        }

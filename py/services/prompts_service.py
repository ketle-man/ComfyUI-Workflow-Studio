"""Prompt presets management service."""

import json
import uuid
from datetime import datetime, timezone

from ..config import PROMPTS_FILE


class PromptsService:
    """Manages prompt presets (CRUD, categories, favorites)."""

    def __init__(self):
        self.prompts_file = PROMPTS_FILE

    def _now_iso(self):
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # ── Persistence ─────────────────────────────────────────

    def _load(self):
        if self.prompts_file.exists():
            try:
                with open(self.prompts_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return []

    def _save(self, prompts):
        self.prompts_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.prompts_file, "w", encoding="utf-8") as f:
            json.dump(prompts, f, ensure_ascii=False, indent=2)

    # ── List ────────────────────────────────────────────────

    def list_prompts(self):
        return self._load()

    # ── Create ──────────────────────────────────────────────

    def create_prompt(self, data):
        prompts = self._load()
        prompt = {
            "id": str(uuid.uuid4()),
            "name": data.get("name", "Untitled"),
            "text": data.get("text", ""),
            "negText": data.get("negText", ""),
            "category": data.get("category", ""),
            "tags": data.get("tags", []),
            "favorite": data.get("favorite", False),
            "created_at": self._now_iso(),
            "updated_at": self._now_iso(),
        }
        prompts.append(prompt)
        self._save(prompts)
        return prompt

    # ── Update ──────────────────────────────────────────────

    def update_prompt(self, prompt_id, updates):
        prompts = self._load()
        for p in prompts:
            if p["id"] == prompt_id:
                for key in ("name", "text", "negText", "category", "tags", "favorite"):
                    if key in updates:
                        p[key] = updates[key]
                p["updated_at"] = self._now_iso()
                self._save(prompts)
                return p
        return None

    # ── Delete ──────────────────────────────────────────────

    def delete_prompt(self, prompt_id):
        prompts = self._load()
        prompts = [p for p in prompts if p["id"] != prompt_id]
        self._save(prompts)

    # ── Categories (derived) ────────────────────────────────

    def list_categories(self):
        prompts = self._load()
        cats = set()
        for p in prompts:
            c = p.get("category", "").strip()
            if c:
                cats.add(c)
        return sorted(cats)

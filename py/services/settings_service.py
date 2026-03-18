"""Settings management service."""

import json
from ..config import SETTINGS_FILE


class SettingsService:
    """Manages application settings (data/settings.json)."""

    def __init__(self):
        self.settings_file = SETTINGS_FILE

    def load(self):
        if self.settings_file.exists():
            try:
                with open(self.settings_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def save(self, data):
        self.settings_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.settings_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def update(self, updates):
        """Merge updates into existing settings."""
        data = self.load()
        data.update(updates)
        self.save(data)
        return data

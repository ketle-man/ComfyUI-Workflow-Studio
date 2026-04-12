"""
Gallery Metadata Store - ギャラリー画像のメタデータ永続化
"""
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class GalleryMetadataStore:
    """
    gallery_metadata.json の構造:
    {
        "images": {
            "<abs_path>": {
                "favorite": bool,
                "tags": [str, ...],
                "memo": str,
                "groups": [str, ...]
            }
        },
        "groups": [
            {"name": str}
        ]
    }
    """

    def __init__(self, file_path: Path):
        self.file_path = file_path
        self._data: dict = {"images": {}, "groups": []}
        self._load()

    def _load(self):
        if self.file_path.exists():
            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                self._data = {
                    "images": loaded.get("images", {}),
                    "groups": loaded.get("groups", []),
                }
            except Exception as e:
                logger.warning("GalleryMetadataStore: load error: %s", e)

    def _save_to_disk(self):
        try:
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump(self._data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            logger.error("GalleryMetadataStore: save error: %s", e)
            return False

    def _normalize_path(self, image_path: str) -> str:
        return str(Path(image_path)).replace("\\", "/")

    def get(self, image_path: str) -> dict:
        key = self._normalize_path(image_path)
        return dict(self._data["images"].get(key, {}))

    def save(self, image_path: str, data: dict) -> bool:
        key = self._normalize_path(image_path)
        existing = self._data["images"].get(key, {})
        existing.update(data)
        allowed = {"favorite", "tags", "memo", "groups"}
        existing = {k: v for k, v in existing.items() if k in allowed}
        self._data["images"][key] = existing
        return self._save_to_disk()

    # ── グループ管理 ──────────────────────────────────────────────

    def list_groups(self) -> list[dict]:
        return list(self._data.get("groups", []))

    def create_group(self, name: str) -> bool:
        groups = self._data.get("groups", [])
        if any(g["name"] == name for g in groups):
            return False
        groups.append({"name": name})
        self._data["groups"] = groups
        return self._save_to_disk()

    def rename_group(self, old_name: str, new_name: str) -> bool:
        """グループ名を変更し、全画像のgroupsフィールドも更新する"""
        groups = self._data.get("groups", [])
        if not any(g["name"] == old_name for g in groups):
            return False
        if any(g["name"] == new_name for g in groups):
            return False  # 新名前が既に存在
        # グループリスト更新
        for g in groups:
            if g["name"] == old_name:
                g["name"] = new_name
                break
        # 全画像のgroupsフィールドを更新
        for meta in self._data["images"].values():
            img_groups = meta.get("groups", [])
            if old_name in img_groups:
                meta["groups"] = [new_name if g == old_name else g for g in img_groups]
        return self._save_to_disk()

    def delete_group(self, name: str) -> bool:
        groups = [g for g in self._data.get("groups", []) if g["name"] != name]
        self._data["groups"] = groups
        # 画像のgroupsからも削除
        for meta in self._data["images"].values():
            if name in meta.get("groups", []):
                meta["groups"] = [g for g in meta["groups"] if g != name]
        return self._save_to_disk()

    def list_images_in_group(self, group_name: str) -> list[str]:
        result = []
        for key, meta in self._data["images"].items():
            if group_name in meta.get("groups", []):
                result.append(key)
        return result

    def get_group_member_set(self, group_name: str) -> set:
        """グループメンバーのパスをsetで返す（高速フィルタ用）"""
        return {
            key for key, meta in self._data["images"].items()
            if group_name in meta.get("groups", [])
        }

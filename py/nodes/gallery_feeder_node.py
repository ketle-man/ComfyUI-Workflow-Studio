"""WFS_GalleryFeeder – Feeds images from a gallery group into a workflow."""
import json
import random
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Feeder専用グループ名（gallery_metadata.json 内で予約される）
FEEDER_GROUP = "__Feeder__"


class WFS_GalleryFeeder:
    """Gallery グループ内の画像をインデックス順に1枚ずつ出力するノード。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "group_name": ("STRING", {"default": FEEDER_GROUP}),
                "index":      ("INT",    {"default": 0, "min": 0, "max": 99999}),
                "sort_mode":  (["filename_asc", "filename_desc", "random"],),
                "seed":       ("INT",    {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "execute"
    CATEGORY = "Workflow Studio"
    OUTPUT_NODE = False

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # 毎回実行させる（インデックスが変わるため）
        return float("NaN")

    def execute(self, group_name: str, index: int, sort_mode: str, seed: int):
        import torch
        import numpy as np
        from PIL import Image as PILImage

        paths = self._get_sorted_paths(group_name, sort_mode, seed)
        if not paths:
            logger.warning("WFS_GalleryFeeder: group '%s' is empty or not found", group_name)
            return (torch.zeros(1, 64, 64, 3),)

        img_path = paths[index % len(paths)]
        try:
            img = PILImage.open(img_path).convert("RGB")
        except Exception as e:
            logger.error("WFS_GalleryFeeder: failed to load '%s': %s", img_path, e)
            return (torch.zeros(1, 64, 64, 3),)

        arr = np.array(img, dtype=np.float32) / 255.0
        tensor = torch.from_numpy(arr).unsqueeze(0)
        return (tensor,)

    # ── 内部ヘルパー ──────────────────────────────────────────────

    def _get_sorted_paths(self, group_name: str, sort_mode: str, seed: int) -> list[str]:
        metadata_file = self._find_metadata_file()
        if not metadata_file.exists():
            return []
        try:
            with open(metadata_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            logger.error("WFS_GalleryFeeder: metadata read error: %s", e)
            return []

        paths = [
            key for key, meta in data.get("images", {}).items()
            if group_name in meta.get("groups", []) and Path(key).exists()
        ]

        if sort_mode == "filename_asc":
            paths.sort(key=lambda p: Path(p).name.lower())
        elif sort_mode == "filename_desc":
            paths.sort(key=lambda p: Path(p).name.lower(), reverse=True)
        elif sort_mode == "random":
            rng = random.Random(seed)
            rng.shuffle(paths)

        return paths

    @staticmethod
    def _find_metadata_file() -> Path:
        # py/nodes/ -> py/ -> plugin root -> ComfyUI/custom_nodes/ -> ComfyUI root
        plugin_root = Path(__file__).resolve().parent.parent.parent
        comfyui_root = plugin_root.parent.parent
        user_default = comfyui_root / "user" / "default"
        if user_default.is_dir():
            return user_default / "Workflow-Studio" / "gallery_metadata.json"
        return plugin_root / "data" / "gallery_metadata.json"

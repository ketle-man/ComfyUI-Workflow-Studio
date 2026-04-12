"""
Gallery Service - outputフォルダの画像管理、メタデータ閲覧
"""
import json
import logging
import mimetypes
import re
import struct
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# サポートする画像拡張子
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

# メタデータ保存ファイル (gallery専用)
from .gallery_metadata import GalleryMetadataStore


class GalleryService:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.metadata_store = GalleryMetadataStore(data_dir / "gallery_metadata.json")

    # ──────────────────────────────────────────────────────────────
    # フォルダツリー
    # ──────────────────────────────────────────────────────────────

    def list_folder_tree(self, root_path: str) -> dict:
        """outputフォルダのフォルダツリーを返す"""
        root = Path(root_path)
        if not root.is_dir():
            return {"error": f"Directory not found: {root_path}"}

        def build_tree(path: Path, rel_base: Path) -> dict:
            rel = str(path.relative_to(rel_base)).replace("\\", "/")
            image_count = sum(1 for f in path.iterdir() if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS)
            children = []
            try:
                for child in sorted(path.iterdir()):
                    if child.is_dir() and not child.name.startswith("."):
                        children.append(build_tree(child, rel_base))
            except PermissionError:
                pass
            return {
                "name": path.name,
                "path": rel if rel != "." else "",
                "abs_path": str(path).replace("\\", "/"),
                "image_count": image_count,
                "children": children,
            }

        return build_tree(root, root)

    # ──────────────────────────────────────────────────────────────
    # 画像一覧
    # ──────────────────────────────────────────────────────────────

    def list_images(
        self,
        folder_path: str,
        search: str = "",
        sort_by: str = "date_desc",
        favorite_only: bool = False,
        tag_filter: str = "",
    ) -> list[dict]:
        """指定フォルダ内の画像一覧を返す（サブフォルダなし）"""
        folder = Path(folder_path)
        if not folder.is_dir():
            return []

        images = []
        for f in folder.iterdir():
            if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS:
                images.append(f)

        results = []
        for img_path in images:
            meta = self.metadata_store.get(str(img_path))
            item = {
                "filename": img_path.name,
                "path": str(img_path).replace("\\", "/"),
                "size": img_path.stat().st_size,
                "mtime": img_path.stat().st_mtime,
                "ext": img_path.suffix.lower(),
                "favorite": meta.get("favorite", False),
                "tags": meta.get("tags", []),
                "memo": meta.get("memo", ""),
                "groups": meta.get("groups", []),
            }
            results.append(item)

        # 検索フィルタ
        if search:
            s = search.lower()
            results = [r for r in results if s in r["filename"].lower() or s in r["memo"].lower() or any(s in t.lower() for t in r["tags"])]

        # お気に入りフィルタ
        if favorite_only:
            results = [r for r in results if r["favorite"]]

        # タグフィルタ
        if tag_filter:
            results = [r for r in results if tag_filter in r["tags"]]

        # ソート
        if sort_by == "name_asc":
            results.sort(key=lambda x: x["filename"].lower())
        elif sort_by == "name_desc":
            results.sort(key=lambda x: x["filename"].lower(), reverse=True)
        elif sort_by == "date_asc":
            results.sort(key=lambda x: x["mtime"])
        else:  # date_desc (default)
            results.sort(key=lambda x: x["mtime"], reverse=True)

        return results

    # ──────────────────────────────────────────────────────────────
    # 画像メタデータ
    # ──────────────────────────────────────────────────────────────

    def get_image_metadata(self, image_path: str) -> dict:
        """PNG/JPEGからメタデータを抽出し、保存済みメタと合わせて返す"""
        path = Path(image_path)
        if not path.is_file():
            return {"error": "File not found"}

        embedded = {}
        ext = path.suffix.lower()
        if ext == ".png":
            embedded = self._read_png_metadata(path)
        elif ext in {".jpg", ".jpeg"}:
            embedded = self._read_jpeg_metadata(path)

        saved = self.metadata_store.get(str(path))

        stat = path.stat()
        return {
            "filename": path.name,
            "path": str(path).replace("\\", "/"),
            "size": stat.st_size,
            "mtime": stat.st_mtime,
            "ext": ext,
            "embedded": embedded,
            "favorite": saved.get("favorite", False),
            "tags": saved.get("tags", []),
            "memo": saved.get("memo", ""),
            "groups": saved.get("groups", []),
        }

    def _read_png_metadata(self, path: Path) -> dict:
        """PNGのtEXtチャンクからメタデータを抽出"""
        result = {}
        try:
            with open(path, "rb") as f:
                sig = f.read(8)
                if sig != b"\x89PNG\r\n\x1a\n":
                    return result
                while True:
                    chunk_len_bytes = f.read(4)
                    if len(chunk_len_bytes) < 4:
                        break
                    chunk_len = struct.unpack(">I", chunk_len_bytes)[0]
                    chunk_type = f.read(4).decode("ascii", errors="ignore")
                    chunk_data = f.read(chunk_len)
                    f.read(4)  # CRC

                    if chunk_type in ("tEXt", "iTXt"):
                        try:
                            if chunk_type == "tEXt":
                                null_idx = chunk_data.index(b"\x00")
                                key = chunk_data[:null_idx].decode("latin-1")
                                value = chunk_data[null_idx + 1:].decode("latin-1")
                            else:
                                null_idx = chunk_data.index(b"\x00")
                                key = chunk_data[:null_idx].decode("utf-8")
                                # iTXtは複雑なので簡易的に後半をUTF-8で
                                rest = chunk_data[null_idx + 1:]
                                # compression flag / method skip
                                rest = rest[2:]
                                null_idx2 = rest.index(b"\x00")
                                rest = rest[null_idx2 + 1:]
                                null_idx3 = rest.index(b"\x00")
                                value = rest[null_idx3 + 1:].decode("utf-8", errors="replace")

                            result[key] = value
                        except (ValueError, UnicodeDecodeError):
                            pass

                    if chunk_type == "IEND":
                        break
        except Exception as e:
            logger.debug("PNG metadata read error: %s", e)
        return result

    def _read_jpeg_metadata(self, path: Path) -> dict:
        """JPEGのEXIF/commentからメタデータを抽出（簡易）"""
        result = {}
        try:
            with open(path, "rb") as f:
                data = f.read()
            # コメントセグメント
            idx = 0
            while idx < len(data) - 2:
                if data[idx] == 0xFF:
                    marker = data[idx + 1]
                    if marker == 0xFE:  # COM
                        length = struct.unpack(">H", data[idx + 2:idx + 4])[0]
                        comment = data[idx + 4:idx + 2 + length].decode("utf-8", errors="replace")
                        result["Comment"] = comment
                    idx += 2
                else:
                    idx += 1
        except Exception as e:
            logger.debug("JPEG metadata read error: %s", e)
        return result

    def extract_workflow_from_metadata(self, image_path: str) -> dict | None:
        """PNG埋め込みメタデータからComfyUIワークフローを抽出"""
        path = Path(image_path)
        if path.suffix.lower() != ".png":
            return None
        embedded = self._read_png_metadata(path)
        # ComfyUIはworkflowキーにJSONを格納
        workflow_str = embedded.get("workflow") or embedded.get("Workflow")
        if workflow_str:
            try:
                return json.loads(workflow_str)
            except json.JSONDecodeError:
                pass
        return None

    # ──────────────────────────────────────────────────────────────
    # メタデータ保存
    # ──────────────────────────────────────────────────────────────

    def save_image_meta(self, image_path: str, data: dict) -> bool:
        """タグ・メモ・お気に入りなどを保存"""
        return self.metadata_store.save(image_path, data)

    def toggle_favorite(self, image_path: str) -> bool:
        """お気に入りトグル。新しいfavorite値を返す"""
        meta = self.metadata_store.get(image_path)
        new_val = not meta.get("favorite", False)
        self.metadata_store.save(image_path, {"favorite": new_val})
        return new_val

    # ──────────────────────────────────────────────────────────────
    # グループ管理
    # ──────────────────────────────────────────────────────────────

    def list_groups(self) -> list[dict]:
        return self.metadata_store.list_groups()

    def create_group(self, name: str) -> bool:
        return self.metadata_store.create_group(name)

    def delete_group(self, name: str) -> bool:
        return self.metadata_store.delete_group(name)

    def add_to_group(self, image_path: str, group_name: str) -> bool:
        meta = self.metadata_store.get(image_path)
        groups = meta.get("groups", [])
        if group_name not in groups:
            groups.append(group_name)
            return self.metadata_store.save(image_path, {"groups": groups})
        return True

    def remove_from_group(self, image_path: str, group_name: str) -> bool:
        meta = self.metadata_store.get(image_path)
        groups = [g for g in meta.get("groups", []) if g != group_name]
        return self.metadata_store.save(image_path, {"groups": groups})

    def list_images_in_group(self, group_name: str) -> list[str]:
        return self.metadata_store.list_images_in_group(group_name)

    # ──────────────────────────────────────────────────────────────
    # 画像配信
    # ──────────────────────────────────────────────────────────────

    def serve_image(self, image_path: str):
        """画像のPathオブジェクトを返す（ルートで使用）"""
        p = Path(image_path)
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS:
            return p
        return None

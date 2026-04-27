"""
Gallery Service - outputフォルダの画像管理、メタデータ閲覧
"""
import json
import logging
import mimetypes
import os
import re
import struct
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# サポートする画像拡張子
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

# メタデータ保存ファイル (gallery専用)
from .gallery_metadata import GalleryMetadataStore


# PNGチャンク1個の最大許容サイズ (32MB)
_PNG_CHUNK_MAX = 32 * 1024 * 1024
# JPEGを読む際の最大ファイルサイズ (64MB)
_JPEG_READ_MAX = 64 * 1024 * 1024

# フォルダキャッシュのTTL秒（フォルダmtimeが同じでも念のため）
_CACHE_TTL = 30.0


class _FolderCache:
    """フォルダ単位の画像スキャン結果キャッシュ。
    フォルダのmtimeが変わった場合、またはTTL超過時に再スキャンする。"""

    def __init__(self):
        # folder_path -> (mtime, scan_time, [(name, path_str, size, mtime_f), ...])
        self._cache: dict[str, tuple[float, float, list]] = {}

    def get(self, folder: Path) -> list | None:
        key = str(folder)
        if key not in self._cache:
            return None
        cached_mtime, scan_time, entries = self._cache[key]
        # TTL チェック
        if time.monotonic() - scan_time > _CACHE_TTL:
            return None
        # フォルダ自体のmtimeチェック
        try:
            current_mtime = folder.stat().st_mtime
        except OSError:
            return None
        if current_mtime != cached_mtime:
            return None
        return entries

    def set(self, folder: Path, entries: list):
        key = str(folder)
        try:
            folder_mtime = folder.stat().st_mtime
        except OSError:
            folder_mtime = 0.0
        self._cache[key] = (folder_mtime, time.monotonic(), entries)

    def invalidate(self, folder: Path):
        self._cache.pop(str(folder), None)


class GalleryService:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.metadata_store = GalleryMetadataStore(data_dir / "gallery_metadata.json")
        self._allowed_root: Path | None = None
        self._folder_cache = _FolderCache()

    def update_output_root(self, root_path: str) -> None:
        """許可するルートパスを更新する（Settings変更時に呼ぶ）"""
        p = Path(root_path).resolve() if root_path else None
        self._allowed_root = p

    def _check_path_allowed(self, path: Path) -> bool:
        """パスが許可ルート配下かチェック（パストラバーサル防止）"""
        if self._allowed_root is None:
            resolved = path.resolve()
            return resolved == path.resolve()
        try:
            path.resolve().relative_to(self._allowed_root)
            return True
        except ValueError:
            return False

    # ──────────────────────────────────────────────────────────────
    # フォルダツリー
    # ──────────────────────────────────────────────────────────────

    def list_folder_tree(self, root_path: str) -> dict:
        """outputフォルダのフォルダツリーを返す"""
        root = Path(root_path).resolve()
        if not root.is_dir():
            return {"error": f"Directory not found: {root_path}"}
        if self._allowed_root is None:
            self._allowed_root = root

        def build_tree(path: Path, rel_base: Path) -> dict:
            rel = str(path.relative_to(rel_base)).replace("\\", "/")
            image_count = 0
            children = []
            try:
                with os.scandir(path) as it:
                    for entry in it:
                        if entry.is_file(follow_symlinks=True):
                            if Path(entry.name).suffix.lower() in IMAGE_EXTENSIONS:
                                image_count += 1
                        elif entry.is_dir(follow_symlinks=True) and not entry.name.startswith("."):
                            children.append(entry.name)
            except PermissionError:
                pass
            children_nodes = [build_tree(path / name, rel_base) for name in sorted(children)]
            return {
                "name": path.name,
                "path": rel if rel != "." else "",
                "abs_path": str(path).replace("\\", "/"),
                "image_count": image_count,
                "children": children_nodes,
            }

        return build_tree(root, root)

    # ──────────────────────────────────────────────────────────────
    # 画像一覧
    # ──────────────────────────────────────────────────────────────

    def _scan_folder(self, folder: Path) -> list[tuple[str, str, int, float]]:
        """os.scandir() で画像ファイルを1回のシステムコールで列挙。
        キャッシュがあればそれを返す。
        Returns: [(name, abs_path_str, size, mtime), ...]
        """
        cached = self._folder_cache.get(folder)
        if cached is not None:
            return cached

        entries = []
        try:
            with os.scandir(folder) as it:
                for entry in it:
                    if not entry.is_file(follow_symlinks=True):
                        continue
                    if Path(entry.name).suffix.lower() not in IMAGE_EXTENSIONS:
                        continue
                    try:
                        st = entry.stat(follow_symlinks=True)
                        entries.append((
                            entry.name,
                            str(Path(entry.path).resolve()).replace("\\", "/"),
                            st.st_size,
                            st.st_mtime,
                        ))
                    except OSError:
                        continue
        except PermissionError:
            pass

        self._folder_cache.set(folder, entries)
        return entries

    def list_images(
        self,
        folder_path: str,
        search: str = "",
        sort_by: str = "date_desc",
        favorite_only: bool = False,
        tag_filter: str = "",
        group_filter: str = "",
    ) -> list[dict]:
        """指定フォルダ内の画像一覧を返す（サブフォルダなし）"""
        folder = Path(folder_path).resolve()
        if not folder.is_dir():
            return []
        if not self._check_path_allowed(folder):
            logger.warning("list_images: path not allowed: %s", folder)
            return []

        # グループフィルタ: サーバーサイドで先にパスSetを取得（転送量削減）
        group_member_set: set | None = None
        if group_filter:
            group_member_set = self.metadata_store.get_group_member_set(group_filter)

        # os.scandir() でファイル情報を一括取得（stat()の個別呼び出しを排除）
        raw_entries = self._scan_folder(folder)

        results = []
        for name, abs_path, size, mtime in raw_entries:
            # グループフィルタ（サーバーサイド）
            if group_member_set is not None and abs_path not in group_member_set:
                continue

            meta = self.metadata_store.get(abs_path)

            # お気に入りフィルタ（サーバーサイド、早期スキップ）
            if favorite_only and not meta.get("favorite", False):
                continue

            # タグフィルタ（サーバーサイド、早期スキップ）
            tags = meta.get("tags", [])
            if tag_filter and tag_filter not in tags:
                continue

            ext = Path(name).suffix.lower()
            item = {
                "filename": name,
                "path": abs_path,
                "size": size,
                "mtime": mtime,
                "ext": ext,
                "favorite": meta.get("favorite", False),
                "tags": tags,
                "memo": meta.get("memo", ""),
                "groups": meta.get("groups", []),
            }

            # 検索フィルタ
            if search:
                s = search.lower()
                if not (
                    s in name.lower()
                    or s in item["memo"].lower()
                    or any(s in t.lower() for t in tags)
                ):
                    continue

            results.append(item)

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
        path = Path(image_path).resolve()
        if not path.is_file():
            return {"error": "File not found"}
        if not self._check_path_allowed(path):
            return {"error": "Access denied"}

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
                    if chunk_len > _PNG_CHUNK_MAX:
                        f.seek(chunk_len + 4, 1)
                        if chunk_type == "IEND":
                            break
                        continue
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
                                rest = chunk_data[null_idx + 1:]
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
            file_size = path.stat().st_size
            read_size = min(file_size, _JPEG_READ_MAX)
            with open(path, "rb") as f:
                data = f.read(read_size)
            idx = 0
            while idx < len(data) - 3:
                if data[idx] == 0xFF:
                    marker = data[idx + 1]
                    if marker == 0xFE:  # COM
                        length = struct.unpack(">H", data[idx + 2:idx + 4])[0]
                        end = idx + 2 + length
                        comment = data[idx + 4:end].decode("utf-8", errors="replace")
                        result["Comment"] = comment
                        break
                    idx += 2
                else:
                    idx += 1
        except Exception as e:
            logger.debug("JPEG metadata read error: %s", e)
        return result

    def extract_workflow_from_metadata(self, image_path: str) -> dict | None:
        """ワークフローを抽出する。
        優先順位: PNG[workflow] > PNG[prompt] > gallery_metadata.json[workflow]
        """
        path = Path(image_path).resolve()
        if not self._check_path_allowed(path):
            return None

        if path.suffix.lower() == ".png":
            embedded = self._read_png_metadata(path)
            # 1. workflow キー (ComfyUI UI形式)
            for key in ("workflow", "Workflow"):
                s = embedded.get(key)
                if s:
                    try:
                        return json.loads(s)
                    except json.JSONDecodeError:
                        pass
            # 2. prompt キー (ComfyUI API形式 — 大多数の生成画像)
            for key in ("prompt", "Prompt"):
                s = embedded.get(key)
                if s:
                    try:
                        return json.loads(s)
                    except json.JSONDecodeError:
                        pass

        # 3. gallery_metadata.json に保存されたworkflow
        saved = self.metadata_store.get(str(path))
        return saved.get("workflow") or None

    # ──────────────────────────────────────────────────────────────
    # メタデータ保存
    # ──────────────────────────────────────────────────────────────

    def save_image_meta(self, image_path: str, data: dict) -> bool:
        return self.metadata_store.save(image_path, data)

    def toggle_favorite(self, image_path: str) -> bool:
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

    def rename_group(self, old_name: str, new_name: str) -> bool:
        return self.metadata_store.rename_group(old_name, new_name)

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

    def create_folder(self, parent_path: str, name: str) -> dict:
        """選択フォルダ内に新しいサブフォルダを作成する"""
        parent = Path(parent_path).resolve()
        if not parent.is_dir():
            return {"ok": False, "error": "Parent directory not found"}
        if not self._check_path_allowed(parent):
            return {"ok": False, "error": "Access denied"}
        name = name.strip()
        invalid_chars = set(r'\/:*?"<>|')
        if not name or any(c in invalid_chars for c in name):
            return {"ok": False, "error": "Invalid folder name"}
        new_folder = parent / name
        if new_folder.exists():
            return {"ok": False, "error": "Folder already exists"}
        try:
            new_folder.mkdir()
            self._folder_cache.invalidate(parent)
            return {"ok": True, "path": str(new_folder).replace("\\", "/")}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def delete_folder(self, folder_path: str) -> dict:
        """フォルダを再帰的に削除する"""
        import shutil
        folder = Path(folder_path).resolve()
        if not folder.is_dir():
            return {"ok": False, "error": "Directory not found"}
        if not self._check_path_allowed(folder):
            return {"ok": False, "error": "Access denied"}
        if self._allowed_root and folder == self._allowed_root:
            return {"ok": False, "error": "Cannot delete root folder"}
        try:
            parent = folder.parent
            shutil.rmtree(folder)
            self._folder_cache.invalidate(parent)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def delete_images(self, paths: list) -> dict:
        """画像ファイルを削除する（複数対応）"""
        deleted = []
        errors = []
        for img_path in paths:
            p = Path(img_path).resolve()
            if not p.is_file():
                errors.append(f"{Path(img_path).name}: not found")
                continue
            if p.suffix.lower() not in IMAGE_EXTENSIONS:
                errors.append(f"{p.name}: not an image")
                continue
            if not self._check_path_allowed(p):
                errors.append(f"{p.name}: access denied")
                continue
            try:
                p.unlink()
                self.metadata_store.delete(str(p))
                self._folder_cache.invalidate(p.parent)
                deleted.append(str(p).replace("\\", "/"))
            except Exception as e:
                errors.append(f"{p.name}: {e}")
        return {"deleted": deleted, "errors": errors}

    def move_images(self, paths: list, dest_folder: str) -> dict:
        """画像ファイルを別フォルダへ移動する（複数対応）"""
        dest = Path(dest_folder).resolve()
        if not dest.is_dir():
            return {"ok": False, "error": "Destination folder not found", "moved": [], "errors": []}
        if not self._check_path_allowed(dest):
            return {"ok": False, "error": "Access denied", "moved": [], "errors": []}
        moved = []
        errors = []
        for img_path in paths:
            p = Path(img_path).resolve()
            if not p.is_file():
                errors.append(f"{Path(img_path).name}: not found")
                continue
            if p.suffix.lower() not in IMAGE_EXTENSIONS:
                errors.append(f"{p.name}: not an image")
                continue
            if not self._check_path_allowed(p):
                errors.append(f"{p.name}: access denied")
                continue
            dest_path = dest / p.name
            counter = 1
            while dest_path.exists():
                dest_path = dest / f"{p.stem}_{counter}{p.suffix}"
                counter += 1
            try:
                p.rename(dest_path)
                old_str = str(p).replace("\\", "/")
                new_str = str(dest_path).replace("\\", "/")
                self.metadata_store.rename_path(old_str, new_str)
                self._folder_cache.invalidate(p.parent)
                self._folder_cache.invalidate(dest)
                moved.append({"from": old_str, "to": new_str, "filename": dest_path.name})
            except Exception as e:
                errors.append(f"{p.name}: {e}")
        return {"moved": moved, "errors": errors}

    def serve_image(self, image_path: str):
        """画像のPathオブジェクトを返す（ルートで使用）"""
        p = Path(image_path).resolve()
        if not p.is_file():
            return None
        if p.suffix.lower() not in IMAGE_EXTENSIONS:
            return None
        if not self._check_path_allowed(p):
            logger.warning("serve_image: path not allowed: %s", p)
            return None
        return p

"""
Gallery Service - outputフォルダの画像管理、メタデータ閲覧
"""
import base64
import hashlib
import json
import logging
import mimetypes
import os
import re
import struct
import threading
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# 動画拡張子（PyAV(av)がコンテナ形式を問わず共通で扱えるため、寸法/再生時間/埋め込み
# メタデータ読み取り・サムネイル抽出は両形式で同じコードパスを通る）
VIDEO_EXTENSIONS = {".mp4", ".webm"}

# サポートする画像拡張子（動画はGalleryでは静止画と同じ一覧・配信経路を共有する。
# .psdはブラウザが直接レンダリングできないため、配信時に合成済みPNGへ変換する）
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".psd"} | VIDEO_EXTENSIONS

# Canvas2D の globalCompositeOperation 文字列 -> psd_tools.constants.BlendMode 名
# (Image Edit タブの Layer.blendMode はCanvas2Dの合成モード文字列をそのまま保持している)
_PSD_BLEND_MODE_MAP = {
    "source-over": "NORMAL",
    "multiply": "MULTIPLY",
    "screen": "SCREEN",
    "overlay": "OVERLAY",
    "darken": "DARKEN",
    "lighten": "LIGHTEN",
    "color-dodge": "COLOR_DODGE",
    "color-burn": "COLOR_BURN",
    "hard-light": "HARD_LIGHT",
    "soft-light": "SOFT_LIGHT",
    "difference": "DIFFERENCE",
    "exclusion": "EXCLUSION",
    "hue": "HUE",
    "saturation": "SATURATION",
    "color": "COLOR",
    "luminosity": "LUMINOSITY",
}
# 逆引き: psd_tools.constants.BlendMode 名 -> Canvas2D 文字列（PSDインポート用）。
# CSSに対応物が無いPSD側のブレンドモード(Dissolve, Linear Burn/Dodge, Vivid/Linear/Pin Light,
# Hard Mix, Subtract, Divide, Darker/Lighter Color, Pass Through)は "source-over" にフォールバックする。
_CSS_BLEND_MODE_REVERSE = {v: k for k, v in _PSD_BLEND_MODE_MAP.items()}

# data URL の MIME タイプ -> 拡張子（save_image_to_gallery / save_image_to_folder共用）
_SAVE_EXT_BY_MIME = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
}

# Comic Creator (eagle_comic_creator_spa) の nanobananaタブが生成履歴を記録するフォルダ名。
# 画像と同じフォルダに history.jsonl (1行1リクエスト、filenames配列で画像と対応) が書かれる。
NANOBANANA_FOLDER_NAME = "cc_nanobanana"


def _decode_image_data_url(image_data: str) -> tuple[bytes, str]:
    """data URL (data:<mime>;base64,<data>) をデコードし (バイト列, 拡張子) を返す。
    ヘッダが無ければPNG扱い（旧互換）。"""
    raw = image_data
    mime = "image/png"
    if raw.startswith("data:"):
        header, _, raw = raw.partition(",")
        m = re.match(r"data:([^;]+)", header)
        if m:
            mime = m.group(1)
    ext = _SAVE_EXT_BY_MIME.get(mime, ".png")
    return base64.b64decode(raw), ext


def _sanitize_save_filename(filename: str, ext: str) -> str:
    """OSで使えない文字を除去し、拡張子が無ければ付与する"""
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", filename)
    if not safe.lower().endswith(ext):
        safe += ext
    return safe

# メタデータ保存ファイル (gallery専用)
from .gallery_metadata import GalleryMetadataStore


# PNGチャンク1個の最大許容サイズ (32MB)
_PNG_CHUNK_MAX = 32 * 1024 * 1024
# JPEGを読む際の最大ファイルサイズ (64MB)
_JPEG_READ_MAX = 64 * 1024 * 1024

# フォルダキャッシュのTTL秒（フォルダmtimeが同じでも念のため）
_CACHE_TTL = 60.0

# ImagePromptギャラリー: 画像と同名の.txtサイドカーに保存されたプロンプトテキストの最大読み込みサイズ
_SIDECAR_PROMPT_MAX = 20_000

# ImagePromptギャラリーの管理フォルダ名（ComfyUI実outputフォルダ直下）
IMAGE_PROMPT_FOLDER_NAME = "ws_image_prompt"

# Style Catalogギャラリーの管理フォルダ名（ComfyUI実outputフォルダ直下）
STYLE_CATALOG_FOLDER_NAME = "ws_style_catalog"

# ponyxlWildcardsVault形式（.yaml + thumbnails/）を検出するための、画像の祖先フォルダ探索上限
_VAULT_ROOT_SEARCH_DEPTH = 8
_VAULT_THUMB_DIR_NAMES = ("thumbnails", "thumbnails_option2")


def _clean_vault_tags(text: str) -> str:
    """タグ文字列の前後の空白・カンマを整理する（tools/import_style_prompt_seed.py と同じ処理）"""
    text = text.strip()
    text = re.sub(r"^[,\s]+|[,\s]+$", "", text)
    text = re.sub(r"\s*,\s*", ", ", text)
    return text


def _parse_vault_yaml_leaves(yaml_path: Path) -> dict[str, str]:
    """comfyui_prompt_gallery の parseYamlForImages と同じ簡易パーサ（PyYAML不要）。
    「key:」行の直後が「- タグ文字列」で始まる行なら key をリーフとみなす。
    戻り値: {leaf_name(小文字): タグ文字列}
    """
    leaves: dict[str, str] = {}
    try:
        lines = yaml_path.read_text(encoding="utf-8", errors="replace").split("\n")
    except OSError:
        return leaves
    for i, line in enumerate(lines):
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#") or not trimmed.endswith(":"):
            continue
        if i + 1 >= len(lines):
            continue
        next_trimmed = lines[i + 1].strip()
        if not next_trimmed.startswith("-"):
            continue
        key = trimmed[:-1].strip()
        tags = next_trimmed[1:].strip()
        if not tags or key.lower() == "skip":
            continue
        leaves[key.lower()] = _clean_vault_tags(tags)
    return leaves


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
        # ComfyUI実outputフォルダの不変ルート。Settingsでユーザーが_allowed_rootを
        # 別フォルダに変更しても、ImagePrompt/Style Catalogギャラリー(常に実output配下)への
        # アクセスが塞がれないようにするため_allowed_rootとは別管理にする
        self._comfy_output_root: Path | None = None
        self._folder_cache = _FolderCache()
        self._bg_cancel = threading.Event()
        self._bg_cancel.set()  # 初期状態: キャンセル済み
        # ponyxlWildcardsVault形式フォールバック用キャッシュ: category_root文字列 -> (キャッシュ時刻, {leaf: tags})
        self._vault_leaf_cache: dict[str, tuple[float, dict]] = {}
        # 画像の親フォルダ文字列 -> (キャッシュ時刻, category_root or None)。
        # _find_vault_category_root は祖先ディレクトリを最大8階層×2回stat()するため、
        # 検索フィルタで全画像に対して毎回呼ぶと（特にVaultでない通常フォルダでも
        # 無駄に）遅くなる。同一フォルダ内の画像は結果が同じなのでフォルダ単位で
        # キャッシュする。
        self._vault_root_cache: dict[str, tuple[float, Path | None]] = {}

    def update_output_root(self, root_path: str) -> None:
        """許可するルートパスを更新する（Settings変更時に呼ぶ）"""
        p = Path(root_path).resolve() if root_path else None
        self._allowed_root = p

    def set_comfy_output_root(self, root_path: str) -> None:
        """ComfyUI実outputフォルダの不変ルートを設定する（起動時に一度だけ呼ぶ）"""
        p = Path(root_path).resolve() if root_path else None
        self._comfy_output_root = p

    # ──────────────────────────────────────────────────────────────
    # バックグラウンドインデックス
    # ──────────────────────────────────────────────────────────────

    def start_background_index(self, folder_path: str) -> None:
        """フォルダ内の未キャッシュ画像をバックグラウンドでインデックスする。
        フォルダロード時に呼び出す。前回のインデックス処理は自動キャンセル。"""
        self._bg_cancel.set()  # 前のスレッドをキャンセル
        cancel = threading.Event()
        self._bg_cancel = cancel
        t = threading.Thread(
            target=self._bg_index_folder,
            args=(folder_path, cancel),
            daemon=True,
        )
        t.start()

    def _bg_index_folder(self, folder_path: str, cancel: threading.Event) -> None:
        """バックグラウンドスレッドで未キャッシュ画像のprompt_cacheを構築する。
        10枚処理するたびに50msスリープしてメインスレッドへの影響を最小化。"""
        try:
            folder = Path(folder_path).resolve()
            if not folder.is_dir() or not self._check_path_allowed(folder):
                return
            entries = self._scan_folder(folder)
            batch: dict[str, dict] = {}
            processed = 0
            for name, abs_path, _, _ in entries:
                if cancel.is_set():
                    return
                ext = Path(name).suffix.lower()
                if ext not in (".png", ".jpg", ".jpeg"):
                    continue
                meta = self.metadata_store.get(abs_path)
                if meta.get("prompt_cache"):
                    continue
                embedded: dict = {}
                if ext == ".png":
                    embedded = self._read_png_metadata(Path(abs_path))
                else:
                    embedded = self._read_jpeg_metadata(Path(abs_path))
                if not embedded:
                    continue
                prompt_cache = " ".join(
                    str(v) for k, v in embedded.items()
                    if k != "workflow" and isinstance(v, str) and len(v) < 50_000
                ).strip()
                if not prompt_cache:
                    continue
                batch[abs_path] = {"prompt_cache": prompt_cache}
                processed += 1
                if len(batch) >= 10:
                    # 1件ずつsave()を呼ぶとバッチ内の枚数分だけJSONシリアライズ+
                    # ファイルI/Oが発生してしまう（大量画像フォルダのメタデータでは
                    # 1回あたり数百ms〜になりうる）ため、まとめて1回で保存する。
                    self.metadata_store.save_batch(batch)
                    batch = {}
                    time.sleep(0.05)  # 50ms 他の処理に譲る
            if batch and not cancel.is_set():
                self.metadata_store.save_batch(batch)
            if processed:
                logger.debug("BG index done: %s (%d indexed)", folder_path, processed)
        except Exception as e:
            logger.debug("BG index error: %s", e)

    def _check_path_allowed(self, path: Path) -> bool:
        """パスが許可ルート配下かチェック（パストラバーサル防止）。
        Output ギャラリーの _allowed_root、またはComfyUI実outputフォルダの
        _comfy_output_root のいずれか配下であれば許可する。"""
        resolved = path.resolve()
        if self._allowed_root is not None:
            try:
                resolved.relative_to(self._allowed_root)
                return True
            except ValueError:
                pass
        if self._comfy_output_root is not None:
            try:
                resolved.relative_to(self._comfy_output_root)
                return True
            except ValueError:
                pass
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
            total_count = image_count + sum(c["image_count_total"] for c in children_nodes)
            return {
                "name": path.name,
                "path": rel if rel != "." else "",
                "abs_path": str(path).replace("\\", "/"),
                "image_count": image_count,
                "image_count_total": total_count,
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
                    # follow_symlinks=True forces stat() to make an extra syscall per file
                    # to resolve the link target even for plain files. Output folders don't
                    # contain symlinked images, so False is safe and much cheaper.
                    if not entry.is_file(follow_symlinks=False):
                        continue
                    if Path(entry.name).suffix.lower() not in IMAGE_EXTENSIONS:
                        continue
                    try:
                        st = entry.stat(follow_symlinks=False)
                        # entry.path is already absolute+resolved because callers always
                        # pass in an already-resolved `folder`. Re-resolving it here via
                        # Path(entry.path).resolve() costs an extra filesystem round-trip
                        # per file — on a 9786-file folder that alone was 6.7s vs 0.07s.
                        entries.append((
                            entry.name,
                            entry.path.replace("\\", "/"),
                            st.st_size,
                            st.st_mtime,
                        ))
                    except OSError:
                        continue
        except PermissionError:
            pass

        self._folder_cache.set(folder, entries)
        return entries

    def _scan_folder_recursive(self, folder: Path) -> list[tuple[str, str, int, float]]:
        """フォルダ配下を再帰的に列挙する（サブフォルダの画像も含む）。
        ImagePrompt/Style Catalogギャラリーのように深い階層に画像が置かれるケース用。
        キャッシュはしない（フォルダ数が少なく、都度スキャンしても軽い想定）。
        os.walk()はDirEntryを介さずPath.stat()（follow_symlinks=True相当）を呼ぶため、
        _scan_folder()と同じ理由でフォルダ内ファイル数に対して極端に遅くなる。
        os.scandir()を自前で再帰し、follow_symlinks=Falseでstatする。
        """
        entries = []

        def _walk(d):
            try:
                with os.scandir(d) as it:
                    dir_entries = list(it)
            except (PermissionError, OSError):
                return
            for entry in dir_entries:
                if entry.is_dir(follow_symlinks=False):
                    if not entry.name.startswith("."):
                        _walk(entry.path)
                    continue
                if not entry.is_file(follow_symlinks=False):
                    continue
                if Path(entry.name).suffix.lower() not in IMAGE_EXTENSIONS:
                    continue
                try:
                    st = entry.stat(follow_symlinks=False)
                    # entry.path is already absolute since the top-level `folder` passed
                    # in by callers is always pre-resolved — see _scan_folder() for why
                    # re-resolving per file here would be costly.
                    entries.append((
                        entry.name,
                        entry.path.replace("\\", "/"),
                        st.st_size,
                        st.st_mtime,
                    ))
                except OSError:
                    continue

        _walk(folder)
        return entries

    def list_images(
        self,
        folder_path: str,
        search: str = "",
        sort_by: str = "date_desc",
        favorite_only: bool = False,
        tag_filter: str = "",
        group_filter: str = "",
        recursive: bool = False,
    ) -> list[dict]:
        """指定フォルダ内の画像一覧を返す（recursive=Trueならサブフォルダも含める）"""
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
        raw_entries = self._scan_folder_recursive(folder) if recursive else self._scan_folder(folder)

        # 孤立メタデータを自動クリーンアップ（移動・削除されたファイルの残骸を除去）。
        # recursive=False（非再帰スキャン）の場合、existing_pathsにはfolder直下の
        # ファイルしか含まれないため、cleanup側にもrecursive=Falseを伝えて対象範囲を
        # 直下のみに限定する（でないとサブフォルダ内ファイルのメタデータを誤削除する）。
        # 検索文字列入力中はキー入力のたびに呼ばれるため、ここではスキップする
        # （全メタデータ走査＋該当時はJSON全体のディスク書き込みを伴い重く、検索の
        # 度に繰り返す必要はない。通常の検索なしロード時に実行されれば十分）。
        if not search:
            existing_paths = {abs_path for _, abs_path, _, _ in raw_entries}
            self.metadata_store.cleanup_stale_images(str(folder), existing_paths, recursive=recursive)

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

            # 検索フィルタ（ファイル名・メモ・タグ・キャッシュ済みプロンプト・.txtサイドカー）
            if search:
                s = search.lower()
                sidecar_prompt = self._read_sidecar_prompt(Path(abs_path)) or ""
                if not (
                    s in name.lower()
                    or s in item["memo"].lower()
                    or any(s in t.lower() for t in tags)
                    or s in meta.get("prompt_cache", "").lower()
                    or s in sidecar_prompt.lower()
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
    # ImagePromptギャラリー: .txtサイドカーによるプロンプト保存
    # ──────────────────────────────────────────────────────────────

    def get_image_prompt_root(self) -> str | None:
        """ImagePromptギャラリーのルートフォルダ(ComfyUI実output/ws_image_prompt)を
        返す。無ければ作成する。"""
        if self._comfy_output_root is None:
            return None
        root = self._comfy_output_root / IMAGE_PROMPT_FOLDER_NAME
        root.mkdir(parents=True, exist_ok=True)
        return str(root).replace("\\", "/")

    def get_style_catalog_root(self) -> str | None:
        """Style Catalogギャラリーのルートフォルダ(ComfyUI実output/ws_style_catalog)を
        返す。無ければ作成する。"""
        if self._comfy_output_root is None:
            return None
        root = self._comfy_output_root / STYLE_CATALOG_FOLDER_NAME
        root.mkdir(parents=True, exist_ok=True)
        return str(root).replace("\\", "/")

    def save_image_to_folder(self, folder_path: str, filename: str, image_data: str) -> dict:
        """任意フォルダへ画像を保存する（data URL想定、同名なら上書き）。
        Style Catalogのカタログ作成（スタイル名でのファイル保存）で使用。"""
        folder = Path(folder_path).resolve()
        if not folder.is_dir():
            return {"ok": False, "error": "Destination folder not found"}
        if not self._check_path_allowed(folder):
            return {"ok": False, "error": "Access denied"}
        try:
            image_bytes, ext = _decode_image_data_url(image_data)
        except Exception as e:
            return {"ok": False, "error": f"Invalid imageData: {e}"}
        safe = _sanitize_save_filename(filename, ext)
        if not safe:
            return {"ok": False, "error": "Invalid filename"}
        save_path = folder / safe
        try:
            save_path.write_bytes(image_bytes)
        except OSError as e:
            return {"ok": False, "error": str(e)}
        return {"ok": True, "path": str(save_path).replace("\\", "/")}

    def _sidecar_path(self, image_path: Path) -> Path:
        return image_path.with_suffix(".txt")

    def _read_sidecar_prompt(self, image_path: Path) -> str | None:
        """画像のプロンプトテキストを返す。
        1. 画像と同名の .txt サイドカーがあればそれを使う
        2. 無ければ ponyxlWildcardsVault 形式 (*.yaml + thumbnails/) をフォールバックとして
           その場で解決する（インポート未実施のフォルダをそのまま置いた場合に対応するため）
        """
        sidecar = self._sidecar_path(image_path)
        try:
            if sidecar.is_file() and sidecar.stat().st_size <= _SIDECAR_PROMPT_MAX:
                text = sidecar.read_text(encoding="utf-8", errors="replace").strip()
                if text:
                    return text
        except OSError:
            pass
        return self._read_vault_prompt(image_path)

    def _read_nanobanana_entry(self, image_path: Path) -> dict | None:
        """画像がcc_nanobananaフォルダ内にあり、同フォルダのhistory.jsonlに対応エントリが
        あれば返す(1行=1生成リクエストで複数画像filenamesを束ねているため、自分の
        ファイル名を含む行を新しい方から探す。同名再生成があれば最新を優先する)。"""
        if image_path.parent.name != NANOBANANA_FOLDER_NAME:
            return None
        history_path = image_path.parent / "history.jsonl"
        if not history_path.is_file():
            return None
        try:
            lines = history_path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            return None
        filename = image_path.name
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if filename in (entry.get("filenames") or []):
                return entry
        return None

    def _find_vault_category_root(self, image_path: Path) -> Path | None:
        """image_path の祖先を辿り、直下に thumbnails(_option2) を持つフォルダ
        (=ponyxlWildcardsVaultのカテゴリルート) を探す。
        同一フォルダ内の画像は結果が同じなので、フォルダ単位でTTLキャッシュする。"""
        parent_key = str(image_path.parent)
        cached = self._vault_root_cache.get(parent_key)
        if cached is not None and time.monotonic() - cached[0] <= _CACHE_TTL:
            return cached[1]

        cur = image_path.parent
        result: Path | None = None
        for _ in range(_VAULT_ROOT_SEARCH_DEPTH):
            if any((cur / name).is_dir() for name in _VAULT_THUMB_DIR_NAMES):
                result = cur
                break
            if cur.parent == cur:
                break
            cur = cur.parent

        self._vault_root_cache[parent_key] = (time.monotonic(), result)
        return result

    def _load_vault_leaves(self, category_root: Path) -> dict[str, str]:
        """category_root直下のyamlをパースしたleaf辞書をTTLキャッシュする。
        以前はキャッシュの妥当性確認のため毎回 category_root.glob("*.yaml") を実行して
        いたが、category_root は「thumbnails(_option2)という名前のフォルダを直下に持つ
        祖先」というゆるい条件で決まるため、Vaultとは無関係な通常の画像出力フォルダ
        （例: 直下にComfyUIが作る空のthumbnailsキャッシュフォルダがあるだけ）が誤検出
        されることがある。そのフォルダに数千〜数万枚のファイルがあると、glob自体が
        1回数十ms〜になり、検索フィルタで画像ごとに呼ばれると数秒単位まで積み上がって
        いた（実際に発生した不具合: 1万枚超のルート直下に誤検出されたフォルダがあり、
        53枚のサブフォルダを検索するだけで約3秒かかっていた）。TTL内はglobを省略する。"""
        cache_key = str(category_root)
        cached = self._vault_leaf_cache.get(cache_key)
        if cached is not None and time.monotonic() - cached[0] <= _CACHE_TTL:
            return cached[1]
        yaml_files = sorted(category_root.glob("*.yaml")) + sorted(category_root.glob("*.yml"))
        leaves: dict[str, str] = {}
        for yf in yaml_files:
            leaves.update(_parse_vault_yaml_leaves(yf))
        self._vault_leaf_cache[cache_key] = (time.monotonic(), leaves)
        return leaves

    def _read_vault_prompt(self, image_path: Path) -> str | None:
        """ponyxlWildcardsVault形式のフォールバック解決。
        thumbnails_option2 の "{leaf}.preview3.ext" のような二重拡張子にも対応するため、
        ファイル名の最初の "." より前をリーフ名候補として使う。"""
        category_root = self._find_vault_category_root(image_path)
        if category_root is None:
            return None
        leaves = self._load_vault_leaves(category_root)
        if not leaves:
            return None
        leaf_candidate = image_path.name.split(".")[0].lower()
        return leaves.get(leaf_candidate)

    def save_image_prompt(self, image_path: str, text: str) -> bool:
        """画像と同名の.txtサイドカーにプロンプトテキストを保存する"""
        p = Path(image_path).resolve()
        if not p.is_file():
            return False
        if not self._check_path_allowed(p):
            return False
        try:
            self._sidecar_path(p).write_text((text or "").strip(), encoding="utf-8")
            return True
        except OSError as e:
            logger.warning("save_image_prompt: failed for %s: %s", p, e)
            return False

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
        elif ext == ".webp":
            embedded = self._read_webp_metadata(path)
        elif ext in VIDEO_EXTENSIONS:
            embedded = self._read_mp4_metadata(path)

        dims = self._read_media_dimensions(path, ext)
        saved = self.metadata_store.get(str(path))

        # workflow キーを除く文字列フィールドをプロンプトキャッシュとして保存（検索用）
        prompt_text = " ".join(
            str(v) for k, v in embedded.items()
            if k != "workflow" and isinstance(v, str) and len(v) < 50_000
        ).strip()
        if prompt_text and prompt_text != saved.get("prompt_cache", ""):
            self.metadata_store.save(str(path), {"prompt_cache": prompt_text})

        stat = path.stat()
        return {
            "filename": path.name,
            "path": str(path).replace("\\", "/"),
            "size": stat.st_size,
            "mtime": stat.st_mtime,
            "ext": ext,
            "embedded": embedded,
            "width": dims["width"],
            "height": dims["height"],
            "duration": dims["duration"],
            "favorite": saved.get("favorite", False),
            "tags": saved.get("tags", []),
            "memo": saved.get("memo", ""),
            "groups": saved.get("groups", []),
            "image_prompt": self._read_sidecar_prompt(path),
            "nanobanana": self._read_nanobanana_entry(path),
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
                    # IENDで止めない: ComfyUI-Custom-Scripts等はIENDの後ろに
                    # workflowチャンクを追記するため、ファイル末尾まで読む。
        except Exception as e:
            logger.debug("PNG metadata read error: %s", e)
        return result

    def _read_webp_metadata(self, path: Path) -> dict:
        """WebPのRIFF EXIFチャンクから埋め込みworkflow/prompt(JSON文字列)を抽出する。
        ComfyUIはWebPのEXIFに "workflow:{...}" / "prompt:{...}" 形式で書き込む
        （static/js/metadata-tab.js の extractWorkflowFromEXIF と同じ処理）。"""
        result = {}
        try:
            with open(path, "rb") as f:
                head = f.read(12)
                if len(head) < 12 or head[:4] != b"RIFF" or head[8:12] != b"WEBP":
                    return result
                while True:
                    hdr = f.read(8)
                    if len(hdr) < 8:
                        break
                    fourcc = hdr[:4]
                    size = struct.unpack("<I", hdr[4:])[0]
                    if fourcc == b"EXIF":
                        if size > _PNG_CHUNK_MAX:
                            break
                        text = f.read(size).decode("utf-8", errors="replace")
                        decoder = json.JSONDecoder()
                        for key in ("workflow", "prompt"):
                            idx = text.find(key + ":{")
                            if idx < 0:
                                continue
                            start = idx + len(key) + 1
                            try:
                                _, end = decoder.raw_decode(text, start)
                            except json.JSONDecodeError:
                                continue
                            result[key] = text[start:end]
                        break
                    f.seek(size + (size & 1), 1)
        except Exception as e:
            logger.debug("WebP metadata read error: %s", e)
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

    def _read_mp4_metadata(self, path: Path) -> dict:
        """MP4コンテナのformat-levelメタデータタグ（workflow/prompt等）をPyAVで抽出する。
        ComfyUIのSaveVideoはPNGのtEXtチャンクと同じキー名（workflow=UI形式, prompt=API形式）で
        moov/udta/meta（mdta）にJSON文字列を書き込む。"""
        result = {}
        try:
            import av
            with av.open(str(path)) as container:
                for k, v in (container.metadata or {}).items():
                    result[k] = v
        except Exception as e:
            logger.debug("MP4 metadata read error: %s", e)
        return result

    def _read_media_dimensions(self, path: Path, ext: str) -> dict:
        """画像は幅高さ、動画は幅高さ+再生時間（秒）を返す。取得できない項目はNone。"""
        info: dict = {"width": None, "height": None, "duration": None}
        try:
            if ext in VIDEO_EXTENSIONS:
                import av
                with av.open(str(path)) as container:
                    if container.streams.video:
                        stream = container.streams.video[0]
                        info["width"] = stream.width
                        info["height"] = stream.height
                    if container.duration:
                        info["duration"] = container.duration / 1_000_000
            elif ext == ".psd":
                from psd_tools import PSDImage
                psd = PSDImage.open(path)
                info["width"], info["height"] = psd.width, psd.height
            elif ext != ".svg":
                from PIL import Image
                with Image.open(path) as img:
                    info["width"], info["height"] = img.size
        except Exception as e:
            logger.debug("dimension read error for %s: %s", path, e)
        return info

    def _extract_embedded_workflow(self, image_path: str, prefer: str = "workflow") -> dict | None:
        """埋め込みワークフローを抽出する（PNG/MP4の[workflow]/[prompt]の優先順位を選べる）。

        prefer="workflow": UI形式(ノード位置・グループ等を保持)優先。GenerateUIへの
        ロードやJSON表示などエディタ復元が必要な用途向け。
        prefer="prompt": API形式(サブグラフ展開済みでフラット)優先。トップレベルと
        サブグラフに独立した複数系統を持つワークフロー(例: Krea2)ではUI形式の
        extractPromptsLiteGraphがトップレベル系統しか拾えないことがあるため、
        プロンプト抽出専用にAPI形式を優先する（Metadataタブのプロンプト抽出と同じ優先順位）。
        """
        path = Path(image_path).resolve()
        if not self._check_path_allowed(path):
            return None

        ext = path.suffix.lower()
        embedded = None
        if ext == ".png":
            embedded = self._read_png_metadata(path)
        elif ext == ".webp":
            embedded = self._read_webp_metadata(path)
        elif ext in VIDEO_EXTENSIONS:
            embedded = self._read_mp4_metadata(path)

        if embedded:
            key_groups = (("workflow", "Workflow"), ("prompt", "Prompt"))
            if prefer == "prompt":
                key_groups = tuple(reversed(key_groups))
            for keys in key_groups:
                for key in keys:
                    s = embedded.get(key)
                    if s:
                        try:
                            return json.loads(s)
                        except json.JSONDecodeError:
                            pass

        # gallery_metadata.json に保存されたworkflow
        saved = self.metadata_store.get(str(path))
        return saved.get("workflow") or None

    def extract_workflow_from_metadata(self, image_path: str) -> dict | None:
        """ワークフローを抽出する。
        優先順位: PNG[workflow] > PNG[prompt] > gallery_metadata.json[workflow]
        """
        return self._extract_embedded_workflow(image_path, prefer="workflow")

    def extract_prompt_workflow_from_metadata(self, image_path: str) -> dict | None:
        """プロンプト抽出専用: PNG[prompt] > PNG[workflow] > gallery_metadata.json[workflow]"""
        return self._extract_embedded_workflow(image_path, prefer="prompt")

    # ──────────────────────────────────────────────────────────────
    # メタデータ保存
    # ──────────────────────────────────────────────────────────────

    def save_image_meta(self, image_path: str, data: dict) -> bool:
        resolved = Path(image_path).resolve()
        if not self._check_path_allowed(resolved):
            logger.warning("save_image_meta: path not allowed: %s", resolved)
            return False
        # get_image_metadata() 側は resolve() 済みパスをキーにして取得するため、
        # ここでも resolve() 後の文字列で統一して保存する（キー不一致による
        # 「保存はできるが表示されない」というサイレントな食い違いを防ぐ）。
        return self.metadata_store.save(str(resolved), data)

    def toggle_favorite(self, image_path: str) -> bool:
        resolved = Path(image_path).resolve()
        if not self._check_path_allowed(resolved):
            return False
        # get_image_metadata()/list_images() 側はresolve()済みパスをキーにして取得する
        # ため、ここでも統一する(save_image_metaと同じ理由。キー不一致による
        # 「保存はできるが表示されない」というサイレントな食い違いを防ぐ)。
        resolved_str = str(resolved)
        meta = self.metadata_store.get(resolved_str)
        new_val = not meta.get("favorite", False)
        self.metadata_store.save(resolved_str, {"favorite": new_val})
        return new_val

    def bulk_set_favorite(self, paths: list[str], value: bool) -> dict:
        """複数画像のお気に入りを一括設定する"""
        ok = fail = 0
        for p in paths:
            resolved = Path(p).resolve()
            if not self._check_path_allowed(resolved):
                fail += 1
                continue
            if self.metadata_store.save(str(resolved), {"favorite": value}):
                ok += 1
            else:
                fail += 1
        return {"ok": ok, "fail": fail}

    def bulk_group_op(self, paths: list[str], group_name: str, action: str = "add") -> dict:
        """複数画像のグループ追加 / 削除を一括処理する。action は "add" または "remove"。"""
        ok = fail = 0
        for p in paths:
            success = self.add_to_group(p, group_name) if action == "add" else self.remove_from_group(p, group_name)
            if success:
                ok += 1
            else:
                fail += 1
        return {"ok": ok, "fail": fail}

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
        resolved = Path(image_path).resolve()
        if not self._check_path_allowed(resolved):
            return False
        # get_image_metadata()/list_images() 側はresolve()済みパスをキーにして取得する
        # ため、ここでも統一する(save_image_metaと同じ理由。キー不一致による
        # 「グループに追加はできるが一覧に反映されない」というサイレントな食い違いを防ぐ)。
        resolved_str = str(resolved)
        meta = self.metadata_store.get(resolved_str)
        groups = meta.get("groups", [])
        if group_name not in groups:
            groups.append(group_name)
            return self.metadata_store.save(resolved_str, {"groups": groups})
        return True

    def remove_from_group(self, image_path: str, group_name: str) -> bool:
        resolved = Path(image_path).resolve()
        if not self._check_path_allowed(resolved):
            return False
        resolved_str = str(resolved)
        meta = self.metadata_store.get(resolved_str)
        groups = [g for g in meta.get("groups", []) if g != group_name]
        return self.metadata_store.save(resolved_str, {"groups": groups})

    def list_images_in_group(self, group_name: str) -> list[str]:
        all_paths = self.metadata_store.list_images_in_group(group_name)
        existing = [p for p in all_paths if Path(p).is_file()]
        stale = [p for p in all_paths if not Path(p).is_file()]
        if stale:
            self.metadata_store.remove_stale_paths_from_group(group_name, stale)
            logger.info("Cleaned up %d stale paths from group '%s'", len(stale), group_name)
        return existing

    def clear_group(self, group_name: str) -> bool:
        return self.metadata_store.clear_group(group_name)

    def ensure_group(self, name: str) -> bool:
        return self.metadata_store.ensure_group(name)

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

    def build_psd_from_images(self, paths: list) -> bytes:
        """複数画像を各1レイヤーとして1つのPSDにまとめ、バイナリを返す。
        画像サイズが異なる場合はキャンバスを最大サイズに合わせ、各レイヤーは左上(0,0)基準で配置する。
        """
        try:
            from psd_tools import PSDImage
            from psd_tools.api.layers import PixelLayer
        except ImportError as e:
            raise RuntimeError(
                "psd-tools is not installed. Run: "
                "python_embeded\\python.exe -m pip install psd-tools"
            ) from e
        from PIL import Image
        import io

        layers_data = []
        for img_path in paths:
            p = Path(img_path).resolve()
            if not p.is_file() or p.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            if p.suffix.lower() in VIDEO_EXTENSIONS:
                continue  # 動画はPSDレイヤーにできない
            if not self._check_path_allowed(p):
                continue
            try:
                im = Image.open(p).convert("RGBA")
            except Exception as e:
                logger.warning("build_psd_from_images: failed to open %s: %s", p, e)
                continue
            layers_data.append((p.stem, im))

        if not layers_data:
            raise ValueError("No valid images to export")

        max_w = max(im.width for _, im in layers_data)
        max_h = max(im.height for _, im in layers_data)

        base = Image.new("RGBA", (max_w, max_h), (0, 0, 0, 0))
        psd = PSDImage.frompil(base)
        for name, im in layers_data:
            PixelLayer.frompil(im, psd, name=name, top=0, left=0)

        buf = io.BytesIO()
        psd.save(buf)
        return buf.getvalue()

    def build_psd_from_layers(self, width: int, height: int, layers: list) -> bytes:
        """Image Edit タブのレイヤー配列(dataURL+メタデータ)から1つのPSDを組み立てる。
        各レイヤー画像は既にフロントエンド側で回転・反転・拡縮をベイクしたキャンバス全体サイズの
        PNGとして渡される前提のため位置は常に(0,0)。opacity/blendModeはPSDレイヤー属性として渡す。
        """
        try:
            from psd_tools import PSDImage
            from psd_tools.api.layers import PixelLayer
            from psd_tools.constants import BlendMode
        except ImportError as e:
            raise RuntimeError(
                "psd-tools is not installed. Run: "
                "python_embeded\\python.exe -m pip install psd-tools"
            ) from e
        from PIL import Image
        import base64
        import io
        import re

        if not layers:
            raise ValueError("No layers to export")
        if width <= 0 or height <= 0:
            raise ValueError("Invalid canvas size")

        base = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        psd = PSDImage.frompil(base)

        added = 0
        for layer_data in layers:
            data_url = layer_data.get("imageData", "")
            m = re.match(r"^data:image/\w+;base64,(.+)$", data_url)
            if not m:
                continue
            try:
                im = Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert("RGBA")
            except Exception as e:
                logger.warning("build_psd_from_layers: failed to decode layer image: %s", e)
                continue

            name = str(layer_data.get("name") or "Layer")[:255]
            opacity = int(max(0.0, min(1.0, float(layer_data.get("opacity", 1.0)))) * 255)
            visible = bool(layer_data.get("visible", True))
            blend_key = _PSD_BLEND_MODE_MAP.get(layer_data.get("blendMode", "source-over"), "NORMAL")
            blend_mode = getattr(BlendMode, blend_key)

            pixel_layer = PixelLayer.frompil(im, psd, name=name, top=0, left=0)
            pixel_layer.opacity = opacity
            pixel_layer.blend_mode = blend_mode
            pixel_layer.visible = visible
            added += 1

        if added == 0:
            raise ValueError("No valid layer images to export")

        buf = io.BytesIO()
        psd.save(buf)
        return buf.getvalue()

    def _extract_psd_layers(self, psd) -> dict:
        """PSDImageインスタンスからレイヤー配列(dataURL+メタデータ)を抽出する共通ロジック。
        グループ自体・ラスタ化できないレイヤー(調整レイヤー等)はスキップする。
        戻り値のlayersはフロントエンドのLayer配列規約(先頭=最前面)に合わせて並べる。
        """
        from psd_tools.constants import BlendMode
        import base64
        import io

        layers_out = []
        for layer in psd.descendants():
            if layer.is_group():
                continue
            try:
                im = layer.topil()
            except Exception as e:
                logger.warning("_extract_psd_layers: failed to rasterize layer %r: %s", layer.name, e)
                continue
            if im is None:
                continue
            im = im.convert("RGBA")

            left, top, right, bottom = layer.bbox
            w, h = right - left, bottom - top
            if w <= 0 or h <= 0:
                continue

            buf = io.BytesIO()
            im.save(buf, format="PNG")
            data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

            blend_value = layer.blend_mode
            try:
                blend_name = BlendMode(blend_value.value if hasattr(blend_value, "value") else blend_value).name
            except ValueError:
                blend_name = "NORMAL"
            css_blend = _CSS_BLEND_MODE_REVERSE.get(blend_name, "source-over")

            layers_out.append({
                "name": layer.name or "Layer",
                "x": left,
                "y": top,
                "width": w,
                "height": h,
                "opacity": (layer.opacity if layer.opacity is not None else 255) / 255.0,
                "visible": bool(layer.visible),
                "blendMode": css_blend,
                "imageData": data_url,
            })

        if not layers_out:
            raise ValueError("No importable layers found in this PSD")

        # descendants()は背面→前面(下から上)の順で返るため、
        # フロントエンドのLayer配列規約(先頭=最前面)に合わせて反転する
        layers_out.reverse()

        return {"width": psd.width, "height": psd.height, "layers": layers_out}

    def import_psd_layers(self, psd_bytes: bytes) -> dict:
        """アップロードされたPSDファイル(バイト列)をレイヤー配列(dataURL+メタデータ)に分解する。"""
        try:
            from psd_tools import PSDImage
        except ImportError as e:
            raise RuntimeError(
                "psd-tools is not installed. Run: "
                "python_embeded\\python.exe -m pip install psd-tools"
            ) from e
        import io

        try:
            psd = PSDImage.open(io.BytesIO(psd_bytes))
        except Exception as e:
            raise ValueError(f"Failed to read PSD file: {e}") from e

        return self._extract_psd_layers(psd)

    def get_psd_layers_from_path(self, image_path: str) -> dict:
        """サーバー上に既にあるPSDファイル(Gallery上のパス)をレイヤー配列に分解する。
        Galleryから直接Image Editへ送る際、アップロードの往復無しで済ませるために使う。
        """
        p = Path(image_path).resolve()
        if not p.is_file() or p.suffix.lower() != ".psd":
            raise ValueError("Not a PSD file")
        if not self._check_path_allowed(p):
            raise ValueError("Access denied")

        try:
            from psd_tools import PSDImage
        except ImportError as e:
            raise RuntimeError(
                "psd-tools is not installed. Run: "
                "python_embeded\\python.exe -m pip install psd-tools"
            ) from e

        try:
            psd = PSDImage.open(p)
        except Exception as e:
            raise ValueError(f"Failed to read PSD file: {e}") from e

        return self._extract_psd_layers(psd)

    def serve_image(self, image_path: str):
        """画像のPathオブジェクトを返す（ルートで使用）。
        PSDはブラウザが直接レンダリングできないため、合成済みPNGにキャッシュ変換して返す。"""
        p = Path(image_path).resolve()
        if not p.is_file():
            return None
        if p.suffix.lower() not in IMAGE_EXTENSIONS:
            return None
        if not self._check_path_allowed(p):
            logger.warning("serve_image: path not allowed: %s", p)
            return None
        if p.suffix.lower() == ".psd":
            return self._get_psd_composite_cache(p)
        return p

    def _get_psd_composite_cache(self, p: Path) -> Path | None:
        """PSDの全レイヤー合成結果をフル解像度PNGとしてディスクキャッシュし、そのPathを返す。"""
        try:
            mtime = int(p.stat().st_mtime * 1000)
        except OSError:
            return None
        cache_key = hashlib.md5(f"{p}:{mtime}:full".encode()).hexdigest()
        cache_dir = self.data_dir / "thumb_cache"
        cache_dir.mkdir(exist_ok=True)
        out_path = cache_dir / f"{cache_key}_psdfull.png"
        if out_path.exists():
            return out_path
        try:
            from psd_tools import PSDImage
            psd = PSDImage.open(p)
            img = psd.composite()
            if img is None:
                return None
            img.convert("RGBA").save(out_path, "PNG")
            return out_path
        except Exception as e:
            logger.warning("serve_image: psd composite failed for %s: %s", p, e)
            return None

    def serve_thumbnail(self, image_path: str, width: int = 256) -> Path | None:
        """縮小サムネイルのPathを返す。
        ディスクキャッシュがあればそれを返し、なければPillowで生成して保存する。
        GIFはアニメーション保持のため元ファイルをそのまま返す。
        Pillowが使えない場合は元ファイルにフォールバック。
        MP4はPillowで開けないためPyAVで先頭フレームを抽出しJPEGとしてキャッシュする
        （元ファイルへのフォールバックはできないため、失敗時はNoneを返す）。
        PSDはpsd_toolsでレイヤーを合成してからJPEGとしてキャッシュする（同様にフォールバック不可）。
        """
        p = Path(image_path).resolve()
        if not p.is_file():
            return None
        if p.suffix.lower() not in IMAGE_EXTENSIONS:
            return None
        if not self._check_path_allowed(p):
            logger.warning("serve_thumbnail: path not allowed: %s", p)
            return None

        # GIF はアニメーション保持のためそのまま返す
        if p.suffix.lower() == ".gif":
            return p

        # SVG はベクター画像でPillowが開けないため、元ファイルをそのまま返す
        # (<img>タグはブラウザ側で任意サイズにスケーリングして表示する)
        if p.suffix.lower() == ".svg":
            return p

        try:
            mtime = int(p.stat().st_mtime * 1000)
        except OSError:
            return None

        cache_key = hashlib.md5(f"{p}:{mtime}:{width}".encode()).hexdigest()
        cache_dir = self.data_dir / "thumb_cache"
        cache_dir.mkdir(exist_ok=True)
        thumb_path = cache_dir / f"{cache_key}.jpg"

        if thumb_path.exists():
            return thumb_path

        # 動画(mp4/webm)はPillowで開けない。PyAV(av)で先頭フレームを抽出しJPEGとしてキャッシュする。
        # avが未導入/デコード失敗の場合、元ファイルは<img>的な経路に渡せないため
        # (GIF/SVGと違い元ファイルへフォールバックできない) Noneを返しプレースホルダー表示に委ねる。
        if p.suffix.lower() in VIDEO_EXTENSIONS:
            try:
                import av
                from PIL import Image
                with av.open(str(p)) as container:
                    stream = container.streams.video[0]
                    frame = next(container.decode(stream))
                    img = frame.to_image().convert("RGB")
                    img.thumbnail((width, width), Image.LANCZOS)
                    img.save(thumb_path, "JPEG", quality=85, optimize=True)
                return thumb_path
            except Exception as e:
                logger.warning("serve_thumbnail: mp4 frame extraction failed for %s: %s", p, e)
                return None

        # PSDはPillowで直接開けない(内部のマージ画像がPhotoshop側の実装依存で信頼できない)ため
        # psd_toolsでレイヤーを正しく合成してからサムネイル化する。
        if p.suffix.lower() == ".psd":
            try:
                from psd_tools import PSDImage
                from PIL import Image
                psd = PSDImage.open(p)
                img = psd.composite()
                if img is None:
                    return None
                img = img.convert("RGB")
                img.thumbnail((width, width), Image.LANCZOS)
                img.save(thumb_path, "JPEG", quality=85, optimize=True)
                return thumb_path
            except Exception as e:
                logger.warning("serve_thumbnail: psd composite failed for %s: %s", p, e)
                return None

        try:
            from PIL import Image
            with Image.open(p) as img:
                img = img.convert("RGB")
                img.thumbnail((width, width), Image.LANCZOS)
                img.save(thumb_path, "JPEG", quality=85, optimize=True)
            return thumb_path
        except Exception as e:
            logger.warning("serve_thumbnail: failed for %s: %s", p, e)
            return p  # フォールバック: 元ファイル

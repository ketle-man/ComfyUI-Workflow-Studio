"""
Gallery Routes - ギャラリータブ用APIエンドポイント
"""
import asyncio
import json
import mimetypes
import logging
from pathlib import Path
from aiohttp import web

from ..config import DATA_DIR
from ..services.gallery_service import GalleryService

logger = logging.getLogger(__name__)

_service = GalleryService(DATA_DIR)


def _init_allowed_root() -> None:
    """起動時に保存済みの出力ディレクトリで _allowed_root を初期化する。
    Gallery タブを開く前に Feeder タブの Gallery モードが serve_image を呼んでも
    404 にならないようにするために必要。"""
    try:
        settings_file = DATA_DIR / "settings.json"
        if settings_file.exists():
            with open(settings_file, "r", encoding="utf-8") as f:
                settings = json.load(f)
            saved_root = settings.get("gallery_output_dir", "").strip()
            if saved_root and Path(saved_root).is_dir():
                _service.update_output_root(saved_root)
                return
    except Exception as e:
        logger.warning("GalleryRoutes: failed to load saved gallery root: %s", e)

    # フォールバック: ComfyUI のデフォルト output フォルダ
    try:
        import folder_paths  # type: ignore
        output_dir = folder_paths.get_output_directory()
        if output_dir and Path(output_dir).is_dir():
            _service.update_output_root(output_dir)
    except Exception as e:
        logger.warning("GalleryRoutes: failed to get ComfyUI output dir: %s", e)


_init_allowed_root()


def setup_routes(app: web.Application):
    app.router.add_get("/wfm/gallery/folders", list_folders)
    app.router.add_get("/wfm/gallery/images", list_images)
    app.router.add_get("/wfm/gallery/image/meta", get_image_meta)
    app.router.add_get("/wfm/gallery/image/workflow", get_image_workflow)
    app.router.add_get("/wfm/gallery/image/serve", serve_image)
    app.router.add_get("/wfm/gallery/image/thumb", serve_thumb)
    app.router.add_post("/wfm/gallery/image/meta", save_image_meta)
    app.router.add_post("/wfm/gallery/image/favorite", toggle_favorite)
    app.router.add_get("/wfm/gallery/groups", list_groups)
    app.router.add_post("/wfm/gallery/groups", create_group)
    app.router.add_put("/wfm/gallery/groups/{name}", rename_group)
    app.router.add_delete("/wfm/gallery/groups/{name}", delete_group)
    app.router.add_post("/wfm/gallery/groups/ensure", ensure_group)
    app.router.add_post("/wfm/gallery/groups/{name}/add", add_to_group)
    app.router.add_post("/wfm/gallery/groups/{name}/remove", remove_from_group)
    app.router.add_post("/wfm/gallery/groups/{name}/clear", clear_group_images)
    app.router.add_get("/wfm/gallery/groups/{name}/images", list_group_images)
    # バルク操作
    app.router.add_post("/wfm/gallery/bulk/favorite", bulk_favorite)
    app.router.add_post("/wfm/gallery/bulk/group", bulk_group)
    # フォルダ・ファイル操作
    app.router.add_post("/wfm/gallery/folder", create_folder_route)
    app.router.add_delete("/wfm/gallery/folder", delete_folder_route)
    app.router.add_post("/wfm/gallery/images/delete", delete_images_route)
    app.router.add_post("/wfm/gallery/images/move", move_images_route)
    app.router.add_post("/wfm/gallery/images/export-zip", export_images_zip)


# ──────────────────────────────────────────────────────────────
# フォルダツリー
# ──────────────────────────────────────────────────────────────

async def list_folders(request: web.Request) -> web.Response:
    root = request.rel_url.query.get("root", "")
    if not root:
        return web.json_response({"error": "root parameter required"}, status=400)
    try:
        tree = _service.list_folder_tree(root)
        return web.json_response(tree)
    except Exception as e:
        logger.error("list_folders error: %s", e)
        return web.json_response({"error": str(e)}, status=500)


# ──────────────────────────────────────────────────────────────
# 画像一覧
# ──────────────────────────────────────────────────────────────

async def list_images(request: web.Request) -> web.Response:
    folder = request.rel_url.query.get("folder", "")
    search = request.rel_url.query.get("search", "")
    sort_by = request.rel_url.query.get("sort", "date_desc")
    favorite_only = request.rel_url.query.get("favorite", "false") == "true"
    tag_filter = request.rel_url.query.get("tag", "")
    group_filter = request.rel_url.query.get("group", "")

    if not folder:
        return web.json_response({"error": "folder parameter required"}, status=400)

    try:
        images = await asyncio.to_thread(
            _service.list_images,
            folder,
            search=search,
            sort_by=sort_by,
            favorite_only=favorite_only,
            tag_filter=tag_filter,
            group_filter=group_filter,
        )
        # 検索なしのフォルダロード時にバックグラウンドインデックスを起動
        if not search:
            _service.start_background_index(folder)
        return web.json_response({"images": images, "total": len(images)})
    except Exception as e:
        logger.error("list_images error: %s", e)
        return web.json_response({"error": str(e)}, status=500)


# ──────────────────────────────────────────────────────────────
# 画像メタデータ
# ──────────────────────────────────────────────────────────────

async def get_image_meta(request: web.Request) -> web.Response:
    path = request.rel_url.query.get("path", "")
    if not path:
        return web.json_response({"error": "path required"}, status=400)
    try:
        meta = _service.get_image_metadata(path)
        return web.json_response(meta)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def get_image_workflow(request: web.Request) -> web.Response:
    path = request.rel_url.query.get("path", "")
    if not path:
        return web.json_response({"error": "path required"}, status=400)
    try:
        wf = _service.extract_workflow_from_metadata(path)
        if wf is None:
            return web.json_response({"workflow": None, "has_workflow": False})
        return web.json_response({"workflow": wf, "has_workflow": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def serve_image(request: web.Request) -> web.Response:
    path = request.rel_url.query.get("path", "")
    if not path:
        return web.Response(status=400)

    img_path = _service.serve_image(path)
    if img_path is None:
        return web.Response(status=404)

    content_type, _ = mimetypes.guess_type(str(img_path))
    return web.FileResponse(img_path, headers={
        "Content-Type": content_type or "image/png",
        "Cache-Control": "max-age=3600",
    })


async def serve_thumb(request: web.Request) -> web.Response:
    """サムネイル配信。Pillowで縮小したJPEGをディスクキャッシュして返す。"""
    path = request.rel_url.query.get("path", "")
    if not path:
        return web.Response(status=400)
    try:
        width = int(request.rel_url.query.get("w", "256"))
        width = max(32, min(512, width))
    except ValueError:
        width = 256

    thumb_path = _service.serve_thumbnail(path, width)
    if thumb_path is None:
        return web.Response(status=404)

    ext = thumb_path.suffix.lower()
    if ext in (".jpg", ".jpeg"):
        content_type = "image/jpeg"
    elif ext == ".gif":
        content_type = "image/gif"
    else:
        content_type = mimetypes.guess_type(str(thumb_path))[0] or "image/jpeg"

    return web.FileResponse(thumb_path, headers={
        "Content-Type": content_type,
        "Cache-Control": "max-age=86400",
    })


# ──────────────────────────────────────────────────────────────
# バルク操作
# ──────────────────────────────────────────────────────────────

async def bulk_favorite(request: web.Request) -> web.Response:
    """POST /wfm/gallery/bulk/favorite — 複数画像のお気に入りを一括設定"""
    try:
        body = await request.json()
        paths = body.get("paths", [])
        value = bool(body.get("value", True))
        if not paths:
            return web.json_response({"error": "paths required"}, status=400)
        result = _service.bulk_set_favorite(paths, value)
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def bulk_group(request: web.Request) -> web.Response:
    """POST /wfm/gallery/bulk/group — 複数画像のグループ追加/削除を一括処理"""
    try:
        body = await request.json()
        paths = body.get("paths", [])
        group = body.get("group", "").strip()
        action = body.get("action", "add")  # "add" or "remove"
        if not paths or not group:
            return web.json_response({"error": "paths and group required"}, status=400)
        if action not in ("add", "remove"):
            return web.json_response({"error": "action must be 'add' or 'remove'"}, status=400)
        result = _service.bulk_group_op(paths, group, action)
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def save_image_meta(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        img_path = body.get("path", "")
        if not img_path:
            return web.json_response({"error": "path required"}, status=400)
        data = {k: v for k, v in body.items() if k != "path"}
        ok = _service.save_image_meta(img_path, data)
        return web.json_response({"ok": ok})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def toggle_favorite(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        img_path = body.get("path", "")
        if not img_path:
            return web.json_response({"error": "path required"}, status=400)
        new_val = _service.toggle_favorite(img_path)
        return web.json_response({"favorite": new_val})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ──────────────────────────────────────────────────────────────
# グループ管理
# ──────────────────────────────────────────────────────────────

async def list_groups(request: web.Request) -> web.Response:
    return web.json_response({"groups": _service.list_groups()})


async def create_group(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        name = body.get("name", "").strip()
        if not name:
            return web.json_response({"error": "name required"}, status=400)
        ok = _service.create_group(name)
        if not ok:
            return web.json_response({"error": "Group already exists"}, status=409)
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


_RESERVED_GROUPS = {"__Feeder__"}


async def rename_group(request: web.Request) -> web.Response:
    """PUT /wfm/gallery/groups/{name} - グループ名変更"""
    try:
        old_name = request.match_info.get("name", "")
        if old_name in _RESERVED_GROUPS:
            return web.json_response({"error": f"Group '{old_name}' is reserved and cannot be renamed"}, status=403)
        body = await request.json()
        new_name = body.get("new_name", "").strip()
        if not old_name or not new_name:
            return web.json_response({"error": "old_name and new_name required"}, status=400)
        ok = _service.rename_group(old_name, new_name)
        if not ok:
            return web.json_response({"error": "Rename failed (not found or name conflict)"}, status=400)
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def delete_group(request: web.Request) -> web.Response:
    name = request.match_info.get("name", "")
    if name in _RESERVED_GROUPS:
        return web.json_response({"error": f"Group '{name}' is reserved and cannot be deleted"}, status=403)
    ok = _service.delete_group(name)
    return web.json_response({"ok": ok})


async def add_to_group(request: web.Request) -> web.Response:
    try:
        name = request.match_info.get("name", "")
        body = await request.json()
        img_path = body.get("path", "")
        ok = _service.add_to_group(img_path, name)
        return web.json_response({"ok": ok})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def remove_from_group(request: web.Request) -> web.Response:
    try:
        name = request.match_info.get("name", "")
        body = await request.json()
        img_path = body.get("path", "")
        ok = _service.remove_from_group(img_path, name)
        return web.json_response({"ok": ok})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def list_group_images(request: web.Request) -> web.Response:
    name = request.match_info.get("name", "")
    images = _service.list_images_in_group(name)
    return web.json_response({"images": images})


async def clear_group_images(request: web.Request) -> web.Response:
    """POST /wfm/gallery/groups/{name}/clear - グループ内の全画像を除外"""
    name = request.match_info.get("name", "")
    if not name:
        return web.json_response({"error": "name required"}, status=400)
    ok = _service.clear_group(name)
    return web.json_response({"ok": ok})


async def ensure_group(request: web.Request) -> web.Response:
    """POST /wfm/gallery/groups/ensure - グループが存在しない場合のみ作成"""
    try:
        body = await request.json()
        name = body.get("name", "").strip()
        if not name:
            return web.json_response({"error": "name required"}, status=400)
        _service.ensure_group(name)
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ──────────────────────────────────────────────────────────────
# フォルダ・ファイル操作
# ──────────────────────────────────────────────────────────────

async def create_folder_route(request: web.Request) -> web.Response:
    """POST /wfm/gallery/folder - 新規フォルダ作成"""
    try:
        body = await request.json()
        parent = body.get("parent", "")
        name = body.get("name", "").strip()
        if not parent or not name:
            return web.json_response({"ok": False, "error": "parent and name required"}, status=400)
        result = _service.create_folder(parent, name)
        return web.json_response(result, status=200 if result["ok"] else 400)
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)


async def delete_folder_route(request: web.Request) -> web.Response:
    """DELETE /wfm/gallery/folder - フォルダ削除"""
    try:
        body = await request.json()
        folder = body.get("path", "")
        if not folder:
            return web.json_response({"ok": False, "error": "path required"}, status=400)
        result = _service.delete_folder(folder)
        return web.json_response(result, status=200 if result["ok"] else 400)
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)


async def delete_images_route(request: web.Request) -> web.Response:
    """POST /wfm/gallery/images/delete - 画像削除（単体・複数）"""
    try:
        body = await request.json()
        paths = body.get("paths", [])
        if not paths:
            return web.json_response({"deleted": [], "errors": ["paths required"]}, status=400)
        result = _service.delete_images(paths)
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"deleted": [], "errors": [str(e)]}, status=500)


async def move_images_route(request: web.Request) -> web.Response:
    """POST /wfm/gallery/images/move - 画像移動（単体・複数）"""
    try:
        body = await request.json()
        paths = body.get("paths", [])
        dest = body.get("dest", "")
        if not paths or not dest:
            return web.json_response({"moved": [], "errors": ["paths and dest required"]}, status=400)
        result = _service.move_images(paths, dest)
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"moved": [], "errors": [str(e)]}, status=500)


async def export_images_zip(request: web.Request) -> web.Response:
    """POST /wfm/gallery/images/export-zip - 複数画像をZIPファイルにしてダウンロード"""
    import zipfile
    import io

    try:
        body = await request.json()
        paths = body.get("paths", [])
        if not paths:
            return web.json_response({"error": "paths required"}, status=400)

        # ZIPファイルをメモリ上に作成
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for path in paths:
                file_path = Path(path)
                # セキュリティ: 許可されたディレクトリ内のみ
                if not _service._check_path_allowed(file_path):
                    continue
                if file_path.exists() and file_path.is_file():
                    # ファイル名のみをアーカイブに入れる（パス情報は含めない）
                    zf.write(file_path, arcname=file_path.name)

        zip_buffer.seek(0)
        return web.Response(
            body=zip_buffer.getvalue(),
            content_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=gallery_export.zip"}
        )
    except Exception as e:
        logger.error("Error exporting images to ZIP: %s", e)
        return web.json_response({"error": str(e)}, status=500)

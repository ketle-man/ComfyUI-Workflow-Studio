"""
Gallery Routes - ギャラリータブ用APIエンドポイント
"""
import json
import mimetypes
import logging
from pathlib import Path
from aiohttp import web

from ..config import DATA_DIR
from ..services.gallery_service import GalleryService

logger = logging.getLogger(__name__)

_service = GalleryService(DATA_DIR)


def setup_routes(app: web.Application):
    app.router.add_get("/wfm/gallery/folders", list_folders)
    app.router.add_get("/wfm/gallery/images", list_images)
    app.router.add_get("/wfm/gallery/image/meta", get_image_meta)
    app.router.add_get("/wfm/gallery/image/workflow", get_image_workflow)
    app.router.add_get("/wfm/gallery/image/serve", serve_image)
    app.router.add_post("/wfm/gallery/image/meta", save_image_meta)
    app.router.add_post("/wfm/gallery/image/favorite", toggle_favorite)
    app.router.add_get("/wfm/gallery/groups", list_groups)
    app.router.add_post("/wfm/gallery/groups", create_group)
    app.router.add_put("/wfm/gallery/groups/{name}", rename_group)
    app.router.add_delete("/wfm/gallery/groups/{name}", delete_group)
    app.router.add_post("/wfm/gallery/groups/{name}/add", add_to_group)
    app.router.add_post("/wfm/gallery/groups/{name}/remove", remove_from_group)
    app.router.add_get("/wfm/gallery/groups/{name}/images", list_group_images)
    # フォルダ・ファイル操作
    app.router.add_post("/wfm/gallery/folder", create_folder_route)
    app.router.add_delete("/wfm/gallery/folder", delete_folder_route)
    app.router.add_post("/wfm/gallery/images/delete", delete_images_route)
    app.router.add_post("/wfm/gallery/images/move", move_images_route)


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
        images = _service.list_images(
            folder,
            search=search,
            sort_by=sort_by,
            favorite_only=favorite_only,
            tag_filter=tag_filter,
            group_filter=group_filter,
        )
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


async def rename_group(request: web.Request) -> web.Response:
    """PUT /wfm/gallery/groups/{name} - グループ名変更"""
    try:
        old_name = request.match_info.get("name", "")
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

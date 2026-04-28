"""Wildcard file management API routes."""

import asyncio
import logging

from aiohttp import web

from ..config import DATA_DIR, COMFYUI_ROOT
from ..services.wildcard_service import WildcardService

logger = logging.getLogger(__name__)

_service = WildcardService(DATA_DIR / "wildcard")


def setup_routes(app: web.Application):
    app.router.add_get("/api/wfm/wildcards", handle_list)
    app.router.add_get("/api/wfm/wildcards/content", handle_get_content)
    app.router.add_post("/api/wfm/wildcards/save", handle_save)
    app.router.add_post("/api/wfm/wildcards/delete", handle_delete)
    app.router.add_get("/api/wfm/wildcards/link-status", handle_link_status)
    app.router.add_post("/api/wfm/wildcards/create-link", handle_create_link)
    app.router.add_post("/api/wfm/wildcards/remove-link", handle_remove_link)


async def handle_list(request: web.Request) -> web.Response:
    try:
        result = await asyncio.to_thread(_service.list_wildcards)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error listing wildcards: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_get_content(request: web.Request) -> web.Response:
    filename = request.rel_url.query.get("filename", "")
    try:
        content = await asyncio.to_thread(_service.get_content, filename)
        return web.json_response({"content": content})
    except FileNotFoundError:
        return web.json_response({"error": "not found"}, status=404)
    except Exception as e:
        logger.error("Error getting wildcard content: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_save(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        filename = body.get("filename", "")
        content = body.get("content", "")
        result = await asyncio.to_thread(_service.save_file, filename, content)
        return web.json_response({"status": "ok", "file": result})
    except Exception as e:
        logger.error("Error saving wildcard: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_delete(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        filename = body.get("filename", "")
        await asyncio.to_thread(_service.delete_file, filename)
        return web.json_response({"status": "ok"})
    except Exception as e:
        logger.error("Error deleting wildcard: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_link_status(request: web.Request) -> web.Response:
    try:
        result = await asyncio.to_thread(_service.get_link_status, COMFYUI_ROOT)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error getting wildcard link status: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_create_link(request: web.Request) -> web.Response:
    try:
        result = await asyncio.to_thread(_service.create_link, COMFYUI_ROOT)
        return web.json_response({"status": "ok", **result})
    except RuntimeError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error creating wildcard link: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_remove_link(request: web.Request) -> web.Response:
    try:
        await asyncio.to_thread(_service.remove_link)
        return web.json_response({"status": "ok"})
    except RuntimeError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error removing wildcard link: %s", e)
        return web.json_response({"error": str(e)}, status=500)

"""Prompt presets API routes."""

import asyncio
import logging

from aiohttp import web

from ..services.prompts_service import PromptsService

logger = logging.getLogger(__name__)

_service = PromptsService()


def setup_routes(app: web.Application):
    """Register all prompt management API routes."""
    app.router.add_get("/api/wfm/prompts", handle_list)
    app.router.add_post("/api/wfm/prompts", handle_create)
    app.router.add_post("/api/wfm/prompts/update", handle_update)
    app.router.add_post("/api/wfm/prompts/delete", handle_delete)


# ── List ──────────────────────────────────────────────────


async def handle_list(request: web.Request) -> web.Response:
    """GET /api/wfm/prompts"""
    try:
        result = await asyncio.to_thread(_service.list_prompts)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error listing prompts: %s", e)
        return web.json_response({"error": str(e)}, status=500)


# ── Create ────────────────────────────────────────────────


async def handle_create(request: web.Request) -> web.Response:
    """POST /api/wfm/prompts"""
    try:
        body = await request.json()
        result = await asyncio.to_thread(_service.create_prompt, body)
        return web.json_response({"status": "ok", "prompt": result})
    except Exception as e:
        logger.error("Error creating prompt: %s", e)
        return web.json_response({"error": str(e)}, status=500)


# ── Update ────────────────────────────────────────────────


async def handle_update(request: web.Request) -> web.Response:
    """POST /api/wfm/prompts/update"""
    try:
        body = await request.json()
        prompt_id = body.get("id", "")
        if not prompt_id:
            return web.json_response({"error": "id is required"}, status=400)
        updates = {k: v for k, v in body.items() if k != "id"}
        result = await asyncio.to_thread(_service.update_prompt, prompt_id, updates)
        if result is None:
            return web.json_response({"error": "prompt not found"}, status=404)
        return web.json_response({"status": "ok", "prompt": result})
    except Exception as e:
        logger.error("Error updating prompt: %s", e)
        return web.json_response({"error": str(e)}, status=500)


# ── Delete ────────────────────────────────────────────────


async def handle_delete(request: web.Request) -> web.Response:
    """POST /api/wfm/prompts/delete"""
    try:
        body = await request.json()
        prompt_id = body.get("id", "")
        if not prompt_id:
            return web.json_response({"error": "id is required"}, status=400)
        await asyncio.to_thread(_service.delete_prompt, prompt_id)
        return web.json_response({"status": "ok"})
    except Exception as e:
        logger.error("Error deleting prompt: %s", e)
        return web.json_response({"error": str(e)}, status=500)

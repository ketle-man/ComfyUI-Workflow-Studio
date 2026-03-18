"""Settings API routes."""

import asyncio
import logging
from pathlib import Path

from aiohttp import web

from ..services.settings_service import SettingsService
from ..config import DEFAULT_WORKFLOWS_DIR

logger = logging.getLogger(__name__)

_service = SettingsService()


def setup_routes(app: web.Application):
    """Register settings API routes."""
    app.router.add_get("/api/wfm/settings", handle_get)
    app.router.add_post("/api/wfm/settings", handle_post)
    app.router.add_get("/api/wfm/settings/workflows-dir", handle_get_workflows_dir)
    app.router.add_post("/api/wfm/settings/workflows-dir", handle_set_workflows_dir)


async def handle_get(request: web.Request) -> web.Response:
    """GET /api/wfm/settings - Get all settings."""
    try:
        data = await asyncio.to_thread(_service.load)
        return web.json_response(data)
    except Exception as e:
        logger.error("Error loading settings: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_post(request: web.Request) -> web.Response:
    """POST /api/wfm/settings - Update settings."""
    try:
        body = await request.json()
        data = await asyncio.to_thread(_service.update, body)
        return web.json_response({"status": "ok", "settings": data})
    except Exception as e:
        logger.error("Error saving settings: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_get_workflows_dir(request: web.Request) -> web.Response:
    """GET /api/wfm/settings/workflows-dir - Get current and default workflows directory."""
    try:
        from ..routes.workflow_routes import _service as wf_service
        current = str(wf_service.workflows_dir)
        default = str(DEFAULT_WORKFLOWS_DIR)
        return web.json_response({
            "current": current,
            "default": default,
        })
    except Exception as e:
        logger.error("Error getting workflows dir: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_set_workflows_dir(request: web.Request) -> web.Response:
    """POST /api/wfm/settings/workflows-dir - Change workflows directory."""
    try:
        body = await request.json()
        new_dir = body.get("workflows_dir", "").strip()

        if new_dir:
            p = Path(new_dir)
            if not p.is_dir():
                try:
                    p.mkdir(parents=True, exist_ok=True)
                except Exception as ex:
                    return web.json_response({
                        "error": f"Cannot create directory: {ex}",
                    }, status=400)
        else:
            # Empty = reset to default
            new_dir = ""

        # Save to settings
        await asyncio.to_thread(_service.update, {"workflows_dir": new_dir})

        # Update workflow service at runtime
        from ..routes.workflow_routes import _service as wf_service
        target = new_dir if new_dir else str(DEFAULT_WORKFLOWS_DIR)
        wf_service.update_workflows_dir(target)

        return web.json_response({
            "status": "ok",
            "workflows_dir": str(wf_service.workflows_dir),
        })
    except Exception as e:
        logger.error("Error setting workflows dir: %s", e)
        return web.json_response({"error": str(e)}, status=500)

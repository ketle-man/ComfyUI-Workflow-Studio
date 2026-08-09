"""Lab tab plan file management API routes."""

import asyncio
import logging

from aiohttp import web

from ..config import LAB_PLAN_DIR
from ..services.lab_plan_service import LabPlanService

logger = logging.getLogger(__name__)

_service = LabPlanService(LAB_PLAN_DIR)


def setup_routes(app: web.Application):
    app.router.add_get("/api/wfm/lab/plans", handle_list)
    app.router.add_get("/api/wfm/lab/plans/content", handle_get_content)
    app.router.add_post("/api/wfm/lab/plans/save", handle_save)
    app.router.add_post("/api/wfm/lab/plans/delete", handle_delete)


async def handle_list(request: web.Request) -> web.Response:
    try:
        result = await asyncio.to_thread(_service.list_plans)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error listing lab plans: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_get_content(request: web.Request) -> web.Response:
    filename = request.rel_url.query.get("filename", "")
    try:
        data = await asyncio.to_thread(_service.get_plan, filename)
        return web.json_response({"data": data})
    except FileNotFoundError:
        return web.json_response({"error": "not found"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error getting lab plan content: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_save(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        filename = body.get("filename", "")
        data = body.get("data", {})
        index_image_base64 = body.get("index_image_base64")
        result = await asyncio.to_thread(_service.save_plan, filename, data, index_image_base64)
        return web.json_response({"status": "ok", **result})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error saving lab plan: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_delete(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        filename = body.get("filename", "")
        await asyncio.to_thread(_service.delete_plan, filename)
        return web.json_response({"status": "ok"})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error deleting lab plan: %s", e)
        return web.json_response({"error": str(e)}, status=500)

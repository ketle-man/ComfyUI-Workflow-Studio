"""Video tab API routes: last-frame capture, animated GIF conversion, and
Plan (batch timeline) file management."""

import asyncio
import logging

from aiohttp import web

from ..config import VIDEO_PLAN_DIR
from ..services.video_service import VideoService
from ..services.video_plan_service import VideoPlanService

logger = logging.getLogger(__name__)

_service = VideoService()
_plan_service = VideoPlanService(VIDEO_PLAN_DIR)


def setup_routes(app: web.Application):
    app.router.add_post("/api/wfm/video/frame/save-to-output", handle_save_frame)
    app.router.add_post("/api/wfm/video/to-gif", handle_to_gif)

    app.router.add_get("/api/wfm/video/plans", handle_list_plans)
    app.router.add_get("/api/wfm/video/plans/content", handle_get_plan_content)
    app.router.add_post("/api/wfm/video/plans/save", handle_save_plan)
    app.router.add_post("/api/wfm/video/plans/delete", handle_delete_plan)
    app.router.add_post("/api/wfm/video/index-image/save-to-output", handle_save_index_to_output)


async def handle_save_frame(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        image_base64 = body.get("image_base64", "")
        if not image_base64:
            return web.json_response({"error": "image_base64 required"}, status=400)
        result = await asyncio.to_thread(_service.save_frame_to_output, image_base64)
        return web.json_response({"status": "ok", **result})
    except Exception as e:
        logger.error("Error saving video frame to output: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_to_gif(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        filename = body.get("filename", "")
        subfolder = body.get("subfolder", "")
        type_ = body.get("type", "output")
        start_time = float(body.get("start_time") or 0)
        end_time_raw = body.get("end_time")
        end_time = float(end_time_raw) if end_time_raw not in (None, "") else None
        fps = float(body.get("fps") or 10)
        max_width_raw = body.get("max_width")
        max_width = int(max_width_raw) if max_width_raw not in (None, "") else None

        if not filename:
            return web.json_response({"error": "filename required"}, status=400)

        result = await asyncio.to_thread(
            _service.convert_to_gif, filename, subfolder, type_, start_time, end_time, fps, max_width
        )
        return web.json_response({"status": "ok", **result})
    except FileNotFoundError as e:
        return web.json_response({"error": str(e)}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error converting video to GIF: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_list_plans(request: web.Request) -> web.Response:
    try:
        result = await asyncio.to_thread(_plan_service.list_plans)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error listing video plans: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_get_plan_content(request: web.Request) -> web.Response:
    filename = request.rel_url.query.get("filename", "")
    try:
        data = await asyncio.to_thread(_plan_service.get_plan, filename)
        return web.json_response({"data": data})
    except FileNotFoundError:
        return web.json_response({"error": "not found"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error getting video plan content: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_save_plan(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        filename = body.get("filename", "")
        data = body.get("data", {})
        index_image_base64 = body.get("index_image_base64")
        result = await asyncio.to_thread(_plan_service.save_plan, filename, data, index_image_base64)
        return web.json_response({"status": "ok", **result})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error saving video plan: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_delete_plan(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        filename = body.get("filename", "")
        await asyncio.to_thread(_plan_service.delete_plan, filename)
        return web.json_response({"status": "ok"})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error deleting video plan: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_save_index_to_output(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        image_base64 = body.get("image_base64", "")
        if not image_base64:
            return web.json_response({"error": "image_base64 required"}, status=400)
        result = await asyncio.to_thread(_plan_service.save_index_image_to_output, image_base64)
        return web.json_response({"status": "ok", **result})
    except Exception as e:
        logger.error("Error saving video index image to output: %s", e)
        return web.json_response({"error": str(e)}, status=500)

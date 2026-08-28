"""Video tab utility API routes: last-frame capture, animated GIF conversion."""

import asyncio
import logging

from aiohttp import web

from ..services.video_service import VideoService

logger = logging.getLogger(__name__)

_service = VideoService()


def setup_routes(app: web.Application):
    app.router.add_post("/api/wfm/video/frame/save-to-output", handle_save_frame)
    app.router.add_post("/api/wfm/video/to-gif", handle_to_gif)


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

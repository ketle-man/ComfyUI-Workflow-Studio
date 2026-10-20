"""Video tab API routes: last-frame capture, animated GIF conversion, Edit
tab probe/text-overlay burn-in, and Plan/Edit project file management."""

import asyncio
import logging

from aiohttp import web

from ..config import VIDEO_PLAN_DIR, VIDEO_EDIT_PROJECT_DIR
from ..services.video_service import VideoService
from ..services.video_plan_service import VideoPlanService
from ..services.video_edit_project_service import VideoEditProjectService

logger = logging.getLogger(__name__)

_service = VideoService()
_plan_service = VideoPlanService(VIDEO_PLAN_DIR)
_edit_project_service = VideoEditProjectService(VIDEO_EDIT_PROJECT_DIR)


def setup_routes(app: web.Application):
    app.router.add_post("/api/wfm/video/frame/save-to-output", handle_save_frame)
    app.router.add_post("/api/wfm/video/to-gif", handle_to_gif)
    app.router.add_post("/api/wfm/video/asset/register", handle_register_asset)
    app.router.add_post("/api/wfm/video/edit/convert-audio", handle_convert_audio)
    app.router.add_get("/api/wfm/video/edit/probe", handle_probe_video)
    app.router.add_post("/api/wfm/video/edit/overlay-text", handle_overlay_text)

    app.router.add_get("/api/wfm/video/plans", handle_list_plans)
    app.router.add_get("/api/wfm/video/plans/content", handle_get_plan_content)
    app.router.add_post("/api/wfm/video/plans/save", handle_save_plan)
    app.router.add_post("/api/wfm/video/plans/delete", handle_delete_plan)
    app.router.add_post("/api/wfm/video/index-image/save-to-output", handle_save_index_to_output)

    app.router.add_get("/api/wfm/video/edit/projects", handle_list_edit_projects)
    app.router.add_get("/api/wfm/video/edit/projects/content", handle_get_edit_project_content)
    app.router.add_post("/api/wfm/video/edit/projects/save", handle_save_edit_project)
    app.router.add_post("/api/wfm/video/edit/projects/delete", handle_delete_edit_project)


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


async def handle_register_asset(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        filename = body.get("filename", "")
        if not filename:
            return web.json_response({"error": "filename required"}, status=400)
        result = await asyncio.to_thread(
            _service.register_asset, filename, body.get("subfolder", ""), body.get("type", "input")
        )
        return web.json_response({"status": "ok", **result})
    except FileNotFoundError as e:
        return web.json_response({"error": str(e)}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error registering video asset: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_convert_audio(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        filename = body.get("filename", "")
        if not filename:
            return web.json_response({"error": "filename required"}, status=400)
        # PyAVの変換はCPU負荷が高いのでスレッドで実行する(イベントループを止めない)
        result = await asyncio.to_thread(
            _service.convert_audio_to_output, filename, body.get("subfolder", ""), body.get("type", "input"), body
        )
        return web.json_response({"ok": True, **result})
    except FileNotFoundError as e:
        return web.json_response({"ok": False, "error": str(e)}, status=404)
    except ValueError as e:
        return web.json_response({"ok": False, "error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error converting clip audio: %s", e)
        return web.json_response({"ok": False, "error": str(e)}, status=500)


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


async def handle_probe_video(request: web.Request) -> web.Response:
    filename = request.rel_url.query.get("filename", "")
    subfolder = request.rel_url.query.get("subfolder", "")
    type_ = request.rel_url.query.get("type", "input")
    if not filename:
        return web.json_response({"error": "filename required"}, status=400)
    try:
        result = await asyncio.to_thread(_service.probe_video, filename, subfolder, type_)
        return web.json_response(result)
    except FileNotFoundError as e:
        return web.json_response({"error": str(e)}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error probing video: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_overlay_text(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        filename = body.get("filename", "")
        subfolder = body.get("subfolder", "")
        type_ = body.get("type", "output")
        overlays = body.get("overlays") or []
        delete_source = bool(body.get("delete_source"))
        pips = body.get("pips") or []
        if not filename:
            return web.json_response({"error": "filename required"}, status=400)
        if not isinstance(overlays, list) or not isinstance(pips, list):
            return web.json_response({"error": "overlays and pips must be lists"}, status=400)

        # Decode+re-encode of every frame — run off the event loop so other
        # requests aren't stalled for the duration of the burn-in.
        result = await asyncio.to_thread(
            _service.overlay_text_on_video, filename, subfolder, type_, overlays, "video/wfm_edit", delete_source, pips
        )
        return web.json_response({"status": "ok", **result})
    except FileNotFoundError as e:
        return web.json_response({"error": str(e)}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error burning text overlay into video: %s", e)
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


async def handle_list_edit_projects(request: web.Request) -> web.Response:
    try:
        result = await asyncio.to_thread(_edit_project_service.list_projects)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error listing video edit projects: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_get_edit_project_content(request: web.Request) -> web.Response:
    filename = request.rel_url.query.get("filename", "")
    try:
        data = await asyncio.to_thread(_edit_project_service.get_project, filename)
        return web.json_response({"data": data})
    except FileNotFoundError:
        return web.json_response({"error": "not found"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error getting video edit project content: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_save_edit_project(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        filename = body.get("filename", "")
        data = body.get("data", {})
        result = await asyncio.to_thread(_edit_project_service.save_project, filename, data)
        return web.json_response({"status": "ok", **result})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error saving video edit project: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_delete_edit_project(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        filename = body.get("filename", "")
        await asyncio.to_thread(_edit_project_service.delete_project, filename)
        return web.json_response({"status": "ok"})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error deleting video edit project: %s", e)
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

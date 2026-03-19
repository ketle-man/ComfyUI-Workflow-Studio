"""Workflow management API routes."""

import asyncio
import json
import logging
from urllib.parse import parse_qs, urlparse, unquote

from aiohttp import web

from ..services.workflow_service import WorkflowService

logger = logging.getLogger(__name__)

_service = WorkflowService()


def setup_routes(app: web.Application):
    """Register all workflow API routes."""
    app.router.add_get("/api/wfm/workflows", handle_list)
    app.router.add_get("/api/wfm/workflows/raw", handle_raw)
    app.router.add_post("/api/wfm/workflows/metadata", handle_metadata)
    app.router.add_post("/api/wfm/workflows/import", handle_import)
    app.router.add_post("/api/wfm/workflows/rename", handle_rename)
    app.router.add_post("/api/wfm/workflows/delete", handle_delete)
    app.router.add_post("/api/wfm/workflows/analyze", handle_analyze)
    app.router.add_post("/api/wfm/workflows/reanalyze-all", handle_reanalyze_all)
    app.router.add_post(
        "/api/wfm/workflows/change-thumbnail", handle_change_thumbnail
    )
    app.router.add_post(
        "/api/wfm/workflows/save-canvas-image", handle_save_canvas_image
    )


async def handle_list(request: web.Request) -> web.Response:
    """GET /api/wfm/workflows - List all workflows."""
    try:
        result = await asyncio.to_thread(_service.list_workflows)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error listing workflows: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_raw(request: web.Request) -> web.Response:
    """GET /api/wfm/workflows/raw?filename=X - Get raw workflow JSON."""
    try:
        qs = parse_qs(urlparse(str(request.url)).query)
        fname = unquote(qs.get("filename", qs.get("file", [""]))[0])
        if not _service._validate_filename(fname):
            return web.json_response({"error": "invalid filename"}, status=400)

        content = await asyncio.to_thread(_service.get_raw, fname)
        if content is None:
            return web.json_response({"error": "not found"}, status=404)

        return web.Response(
            text=content, content_type="application/json", charset="utf-8"
        )
    except Exception as e:
        logger.error("Error getting raw workflow: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_metadata(request: web.Request) -> web.Response:
    """POST /api/wfm/workflows/metadata - Save workflow metadata."""
    try:
        body = await request.json()
        fname = body.get("filename", "")
        if not _service._validate_filename(fname):
            return web.json_response({"error": "invalid filename"}, status=400)

        await asyncio.to_thread(_service.save_metadata, fname, body)
        return web.json_response({"status": "ok"})
    except Exception as e:
        logger.error("Error saving metadata: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_import(request: web.Request) -> web.Response:
    """POST /api/wfm/workflows/import - Import workflow files (multipart)."""
    try:
        files = []
        reader = await request.multipart()

        while True:
            part = await reader.next()
            if part is None:
                break
            if part.filename:
                file_data = await part.read()
                files.append((part.filename, file_data))

        results = await asyncio.to_thread(_service.import_files, files)
        return web.json_response({"results": results})
    except Exception as e:
        logger.error("Error importing workflows: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_rename(request: web.Request) -> web.Response:
    """POST /api/wfm/workflows/rename - Rename a workflow."""
    try:
        body = await request.json()
        old_name = body.get("filename", "")
        new_stem = body.get("newStem", "").strip()

        if not _service._validate_filename(old_name):
            return web.json_response({"error": "invalid filename"}, status=400)
        if not new_stem or "/" in new_stem or "\\" in new_stem:
            return web.json_response({"error": "invalid new name"}, status=400)

        result, status = await asyncio.to_thread(_service.rename, old_name, new_stem)
        return web.json_response(result, status=status)
    except Exception as e:
        logger.error("Error renaming workflow: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_delete(request: web.Request) -> web.Response:
    """POST /api/wfm/workflows/delete - Delete a workflow."""
    try:
        body = await request.json()
        fname = body.get("filename", "")
        if not _service._validate_filename(fname):
            return web.json_response({"error": "invalid filename"}, status=400)

        await asyncio.to_thread(_service.delete, fname)
        return web.json_response({"status": "ok"})
    except Exception as e:
        logger.error("Error deleting workflow: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_analyze(request: web.Request) -> web.Response:
    """POST /api/wfm/workflows/analyze - Re-analyze a workflow."""
    try:
        body = await request.json()
        fname = body.get("filename", "")
        if not _service._validate_filename(fname):
            return web.json_response({"error": "invalid filename"}, status=400)

        analysis = await asyncio.to_thread(_service.analyze, fname)
        if analysis is None:
            return web.json_response({"error": "not found"}, status=404)

        return web.json_response({"analysis": analysis})
    except Exception as e:
        logger.error("Error analyzing workflow: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_reanalyze_all(request: web.Request) -> web.Response:
    """POST /api/wfm/workflows/reanalyze-all - Re-analyze all workflows."""
    try:
        result = await asyncio.to_thread(_service.reanalyze_all)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error reanalyzing workflows: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_save_canvas_image(request: web.Request) -> web.Response:
    """POST /api/wfm/workflows/save-canvas-image - Import canvas PNG as workflow + thumbnail."""
    try:
        reader = await request.multipart()
        filename = None
        image_data = None

        while True:
            part = await reader.next()
            if part is None:
                break
            if part.name == "filename":
                filename = (await part.read()).decode("utf-8")
            elif part.name == "image":
                image_data = await part.read()

        if not filename or not _service._validate_filename(filename):
            return web.json_response({"error": "invalid filename"}, status=400)
        if image_data is None:
            return web.json_response({"error": "image required"}, status=400)

        # Use import_files to extract workflow from PNG and save both JSON + thumbnail
        stem = filename[:-5] if filename.endswith(".json") else filename
        png_name = stem + ".png"
        results = await asyncio.to_thread(
            _service.import_files, [(png_name, image_data)]
        )

        if results and results[0].get("status") == "success":
            return web.json_response({"status": "ok", "filename": results[0].get("name", filename)})
        else:
            error_msg = results[0].get("message", "Import failed") if results else "Import failed"
            return web.json_response({"error": error_msg}, status=400)
    except Exception as e:
        logger.error("Error saving canvas image: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_change_thumbnail(request: web.Request) -> web.Response:
    """POST /api/wfm/workflows/change-thumbnail - Change workflow thumbnail."""
    try:
        reader = await request.multipart()
        filename = None
        image_data = None
        original_image_name = ""

        while True:
            part = await reader.next()
            if part is None:
                break
            if part.name == "filename":
                filename = (await part.read()).decode("utf-8")
            elif part.name == "file":
                original_image_name = part.filename or "image.png"
                image_data = await part.read()

        if not filename or not _service._validate_filename(filename):
            return web.json_response({"error": "invalid filename"}, status=400)
        if image_data is None:
            return web.json_response({"error": "file required"}, status=400)

        thumbnail_url = await asyncio.to_thread(
            _service.change_thumbnail, filename, image_data, original_image_name
        )
        return web.json_response({"status": "ok", "thumbnail": thumbnail_url})
    except Exception as e:
        logger.error("Error changing thumbnail: %s", e)
        return web.json_response({"error": str(e)}, status=500)

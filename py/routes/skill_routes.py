"""AI skill (.md system prompt) file management API routes."""

import asyncio
import logging

from aiohttp import web

from ..config import AI_SKILLS_DIR
from ..services.skill_service import SkillService

logger = logging.getLogger(__name__)

_service = SkillService(AI_SKILLS_DIR)


def setup_routes(app: web.Application):
    app.router.add_get("/api/wfm/skills", handle_list)
    app.router.add_get("/api/wfm/skills/content", handle_get_content)
    app.router.add_post("/api/wfm/skills/save", handle_save)
    app.router.add_post("/api/wfm/skills/delete", handle_delete)
    app.router.add_post("/api/wfm/skills/restore-builtin", handle_restore_builtin)
    app.router.add_post("/api/wfm/skills/import", handle_import)
    app.router.add_get("/api/wfm/skills/resource", handle_get_resource)


async def handle_list(request: web.Request) -> web.Response:
    try:
        result = await asyncio.to_thread(_service.list_skills)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error listing skills: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_get_content(request: web.Request) -> web.Response:
    filename = request.rel_url.query.get("filename", "")
    try:
        content = await asyncio.to_thread(_service.get_content, filename)
        return web.json_response({"content": content})
    except FileNotFoundError:
        return web.json_response({"error": "not found"}, status=404)
    except Exception as e:
        logger.error("Error getting skill content: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_save(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        filename = body.get("filename", "")
        content = body.get("content", "")
        result = await asyncio.to_thread(_service.save_file, filename, content)
        return web.json_response({"status": "ok", "file": result})
    except Exception as e:
        logger.error("Error saving skill: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_delete(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        filename = body.get("filename", "")
        await asyncio.to_thread(_service.delete_file, filename)
        return web.json_response({"status": "ok"})
    except Exception as e:
        logger.error("Error deleting skill: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_restore_builtin(request: web.Request) -> web.Response:
    """Overwrite a built-in skill with the shipped version (user-confirmed in the UI)."""
    try:
        body = await request.json()
        filename = body.get("filename", "")
        result = await asyncio.to_thread(_service.restore_builtin, filename)
        return web.json_response({"status": "ok", "file": result})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error restoring built-in skill: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_import(request: web.Request) -> web.Response:
    """Import an Agent Skills folder (.zip) or a single .md skill (multipart field "file")."""
    try:
        form = await request.post()
        upload = form.get("file")
        if upload is None or not hasattr(upload, "file"):
            return web.json_response({"error": "no file"}, status=400)
        data = upload.file.read(20 * 1024 * 1024 + 1)
        if len(data) > 20 * 1024 * 1024:
            return web.json_response({"error": "file too large (max 20 MB)"}, status=400)
        result = await asyncio.to_thread(_service.import_skill, upload.filename or "", data)
        return web.json_response({"status": "ok", **result})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error importing skill: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_get_resource(request: web.Request) -> web.Response:
    """Read one reference file of a folder skill (?skill=<folder>&path=<relative path>)."""
    folder = request.rel_url.query.get("skill", "")
    rel = request.rel_url.query.get("path", "")
    try:
        content = await asyncio.to_thread(_service.get_resource, folder, rel)
        return web.json_response({"content": content})
    except FileNotFoundError:
        return web.json_response({"error": "not found"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error("Error reading skill resource: %s", e)
        return web.json_response({"error": str(e)}, status=500)

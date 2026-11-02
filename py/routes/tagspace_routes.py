"""
TagSpace Routes - タグ/ImagePromptカード/Gallery画像を3D潜在空間に並べるタブ用API
"""
import asyncio
import logging

from aiohttp import web

from ..config import DATA_DIR
from ..services.tagspace_service import TagSpaceService, DEFAULT_MAX_TAGS, DEFAULT_BG
from ..services.semantic_service import SemanticError
from .gallery_routes import _service as _gallery, _semantic, _semantic_error, _num, _json_body
from .tagger_routes import _svc as _tagger

logger = logging.getLogger(__name__)

_tagspace = TagSpaceService(DATA_DIR, _gallery, _semantic, _tagger)


def setup_routes(app: web.Application):
    app.router.add_get("/wfm/tagspace/status", tagspace_status)
    app.router.add_get("/wfm/tagspace/space", tagspace_space)
    app.router.add_post("/wfm/tagspace/build", tagspace_build)
    app.router.add_post("/wfm/tagspace/cancel", tagspace_cancel)
    app.router.add_post("/wfm/tagspace/search", tagspace_search)
    app.router.add_post("/wfm/tagspace/neighbors", tagspace_neighbors)


async def _call(fn, *args) -> web.Response:
    try:
        return web.json_response(await asyncio.to_thread(fn, *args))
    except SemanticError as e:
        return _semantic_error(e)
    except Exception as e:
        logger.error("tagspace %s error: %s", getattr(fn, "__name__", fn), e)
        return web.json_response({"error": str(e)}, status=500)


async def tagspace_status(request: web.Request) -> web.Response:
    return await _call(_tagspace.status)


async def tagspace_space(request: web.Request) -> web.Response:
    return await _call(_tagspace.space)


async def tagspace_build(request: web.Request) -> web.Response:
    body = await _json_body(request)
    try:
        max_tags = _num(body, "max_tags", DEFAULT_MAX_TAGS, 50, 6000)
        bg = _num(body, "background", DEFAULT_BG, 0, 20000)
    except SemanticError as e:
        return _semantic_error(e)
    tagger_model = str(body.get("tagger_model", "") or "")
    tagger_scope = str(body.get("tagger_scope", "background") or "background")
    return await _call(lambda: (_tagspace.start_build(max_tags, bg, tagger_model, tagger_scope), {"ok": True})[1])


async def tagspace_cancel(request: web.Request) -> web.Response:
    _tagspace.cancel()
    return web.json_response({"ok": True})


async def tagspace_search(request: web.Request) -> web.Response:
    body = await _json_body(request)
    try:
        k = _num(body, "k", 20, 1, 200)
    except SemanticError as e:
        return _semantic_error(e)
    return await _call(_tagspace.search, str(body.get("query", "")), k)


async def tagspace_neighbors(request: web.Request) -> web.Response:
    body = await _json_body(request)
    try:
        k = _num(body, "k", 20, 1, 200)
    except SemanticError as e:
        return _semantic_error(e)
    return await _call(_tagspace.neighbors, str(body.get("id", "")), k)

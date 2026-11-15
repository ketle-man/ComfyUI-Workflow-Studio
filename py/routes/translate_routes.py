"""Prompt translation routes (GenerateUI native-language prompt input)."""

import asyncio
import logging

from aiohttp import web

from ..services import translate_service as svc
from ..services.url_guard import require_backend_url

logger = logging.getLogger(__name__)


def setup_routes(app: web.Application):
    app.router.add_get("/api/wfm/translate/config", handle_config)
    app.router.add_get("/api/wfm/translate/models", handle_models)
    app.router.add_post("/api/wfm/translate", handle_translate)
    app.router.add_post("/api/wfm/translate/pull", handle_pull)
    app.router.add_post("/api/wfm/translate/warmup", handle_warmup)
    app.router.add_post("/api/wfm/translate/unload", handle_unload)


async def handle_config(request: web.Request) -> web.Response:
    """GET /api/wfm/translate/config - effective settings + PLaMo presets."""
    cfg = await asyncio.to_thread(svc.get_config)
    return web.json_response({"config": cfg, "presets": svc.PLAMO_PRESETS})


async def handle_models(request: web.Request) -> web.Response:
    """GET /api/wfm/translate/models - models installed in the translation Ollama."""
    try:
        models = await asyncio.to_thread(svc.list_models)
        return web.json_response({"status": "success", "models": models, "presets": svc.PLAMO_PRESETS})
    except Exception as e:
        logger.warning("Translate models error: %s", e)
        return web.json_response({"status": "error", "message": str(e), "presets": svc.PLAMO_PRESETS}, status=502)


async def handle_translate(request: web.Request) -> web.Response:
    """POST /api/wfm/translate {texts: [...], model?, source_lang?} -> {translations: [...]}"""
    try:
        body = await request.json()
        texts = body.get("texts")
        translations, cached = await asyncio.to_thread(
            svc.translate_texts, texts, body.get("model") or None, body.get("source_lang"),
        )
        return web.json_response({"status": "success", "translations": translations, "cached": cached})
    except ValueError as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)
    except Exception as e:
        logger.error("Translate error: %s", e)
        return web.json_response({"status": "error", "message": str(e)}, status=502)


async def handle_warmup(request: web.Request) -> web.Response:
    """POST /api/wfm/translate/warmup - preload the model when CPU-resident mode is on."""
    try:
        loaded = await asyncio.to_thread(svc.warmup)
        return web.json_response({"status": "success", "loaded": loaded})
    except Exception as e:
        logger.warning("Translate warmup error: %s", e)
        return web.json_response({"status": "error", "message": str(e)}, status=502)


async def handle_unload(request: web.Request) -> web.Response:
    """POST /api/wfm/translate/unload - release the resident model (device switch / disable)."""
    try:
        cfg = await asyncio.to_thread(svc.get_config)
        base_url = require_backend_url(cfg["prompt_translate_url"])
        await asyncio.to_thread(svc.unload, base_url, cfg["prompt_translate_model"])
        return web.json_response({"status": "success"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=502)


async def handle_pull(request: web.Request) -> web.Response:
    """POST /api/wfm/translate/pull {model} - pull one of the PLaMo presets into Ollama."""
    try:
        body = await request.json()
        model = body.get("model", "")
        if model not in svc.PLAMO_PRESETS:
            return web.json_response({"status": "error", "message": "only PLaMo presets can be pulled"}, status=400)
        cfg = await asyncio.to_thread(svc.get_config)
        base_url = require_backend_url(cfg["prompt_translate_url"])
        data = await asyncio.to_thread(
            svc._post_json, f"{base_url}/api/pull", {"model": model, "stream": False}, 3600,
        )
        if data.get("error"):
            return web.json_response({"status": "error", "message": data["error"]}, status=502)
        return web.json_response({"status": "success", "result": data.get("status", "")})
    except Exception as e:
        logger.error("Translate pull error: %s", e)
        return web.json_response({"status": "error", "message": str(e)}, status=502)

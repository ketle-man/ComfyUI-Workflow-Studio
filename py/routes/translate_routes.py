"""Prompt translation routes (GenerateUI native-language prompt input).

Endpoints other front-ends (Comic Creator) may use — see README "Prompt translation API":
GET /api/wfm/translate/config, POST /api/wfm/translate/prompt, POST /api/wfm/translate/warmup.
"""

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
    app.router.add_post("/api/wfm/translate/prompt", handle_translate_prompt)
    app.router.add_post("/api/wfm/translate/pull", handle_pull)
    app.router.add_post("/api/wfm/translate/warmup", handle_warmup)
    app.router.add_post("/api/wfm/translate/unload", handle_unload)


async def handle_config(request: web.Request) -> web.Response:
    """GET /api/wfm/translate/config - effective settings + PLaMo presets."""
    cfg = await asyncio.to_thread(svc.get_config)
    return web.json_response({
        "api": svc.API_VERSION,
        "config": cfg,
        "presets": svc.PLAMO_PRESETS,
        "languages": svc.LANGUAGES,
    })


async def handle_models(request: web.Request) -> web.Response:
    """GET /api/wfm/translate/models - models installed in the translation Ollama."""
    try:
        models = await asyncio.to_thread(svc.list_models)
        return web.json_response({"status": "success", "models": models, "presets": svc.PLAMO_PRESETS})
    except Exception as e:
        logger.warning("Translate models error: %s", e)
        return web.json_response({"status": "error", "message": str(e), "presets": svc.PLAMO_PRESETS}, status=502)


async def _json_body(request):
    body = await request.json()
    if not isinstance(body, dict):
        raise ValueError("body must be a JSON object")
    return body


async def handle_translate(request: web.Request) -> web.Response:
    """POST /api/wfm/translate {texts: [...], model?, source_lang?, target_lang?} -> {translations: [...]}

    Each text is translated as a whole (no prompt-syntax handling). Kept for compatibility.
    """
    try:
        body = await _json_body(request)
        translations, cached = await asyncio.to_thread(
            svc.translate_texts, body.get("texts"), body.get("model") or None,
            body.get("source_lang"), body.get("target_lang") or "en",
        )
        return web.json_response({"status": "success", "translations": translations, "cached": cached})
    except ValueError as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)
    except Exception as e:
        logger.error("Translate error: %s", e)
        return web.json_response({"status": "error", "message": str(e)}, status=502)


async def handle_translate_prompt(request: web.Request) -> web.Response:
    """POST /api/wfm/translate/prompt - prompt-aware translation.

    Body: {text | texts, target_lang? ("en"), source_lang? (settings), protect_quotes? (false), model?}
    Returns {translated} for ``text`` or {translations} for ``texts``, plus ``cached``.
    Prompt syntax (commas, weights, <lora:...>, {a|b}, __wildcards__, BREAK ...) is kept;
    protect_quotes keeps the text inside 「」『』“”"" untranslated.
    """
    try:
        body = await _json_body(request)
        single = "text" in body
        texts = [body.get("text")] if single else body.get("texts")
        if single and not isinstance(texts[0], str):
            raise ValueError("text must be a string")
        translations, cached = await asyncio.to_thread(
            svc.translate_prompt_texts, texts, body.get("model") or None, body.get("source_lang"),
            body.get("target_lang") or "en", bool(body.get("protect_quotes")),
        )
        if single:
            return web.json_response({"status": "success", "translated": translations[0], "cached": cached})
        return web.json_response({"status": "success", "translations": translations, "cached": cached})
    except ValueError as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)
    except Exception as e:
        logger.error("Translate prompt error: %s", e)
        return web.json_response({"status": "error", "message": str(e)}, status=502)


async def handle_warmup(request: web.Request) -> web.Response:
    """POST /api/wfm/translate/warmup {ignore_enabled?} - preload the model when CPU-resident mode is on.

    ignore_enabled: for front-ends with their own on/off switch (Comic Creator).
    """
    try:
        try:
            body = await request.json() if request.can_read_body else {}
        except Exception:
            body = {}
        ignore = bool(body.get("ignore_enabled")) if isinstance(body, dict) else False
        loaded = await asyncio.to_thread(svc.warmup, ignore)
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

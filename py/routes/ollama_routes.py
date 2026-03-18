"""Ollama API proxy routes."""

import json
import logging
import urllib.request

from aiohttp import web

from ..services.settings_service import SettingsService

logger = logging.getLogger(__name__)

_settings = SettingsService()

OLLAMA_DEFAULTS = {
    "url": "http://localhost:11434",
    "model": "llava",
}


def _get_ollama_config():
    """Get Ollama URL and model from settings."""
    data = _settings.load()
    return {
        "url": (data.get("ollama_url") or OLLAMA_DEFAULTS["url"]).rstrip("/"),
        "model": data.get("ollama_model") or OLLAMA_DEFAULTS["model"],
    }


def setup_routes(app: web.Application):
    """Register Ollama API routes."""
    app.router.add_get("/api/wfm/ollama/models", handle_models)
    app.router.add_post("/api/wfm/ollama/test", handle_test)
    app.router.add_post("/api/wfm/ollama/chat", handle_chat)


async def handle_models(request: web.Request) -> web.Response:
    """GET /api/wfm/ollama/models - List available Ollama models."""
    import asyncio
    try:
        cfg = _get_ollama_config()

        def _fetch():
            url = f"{cfg['url']}/api/tags"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read().decode("utf-8"))

        data = await asyncio.to_thread(_fetch)
        return web.json_response({
            "status": "success",
            "models": data.get("models", []),
        })
    except Exception as e:
        logger.error("Ollama models error: %s", e)
        return web.json_response({"status": "error", "message": str(e)}, status=500)


async def handle_test(request: web.Request) -> web.Response:
    """POST /api/wfm/ollama/test - Test Ollama connection."""
    import asyncio
    try:
        cfg = _get_ollama_config()

        def _test():
            url = f"{cfg['url']}/api/tags"
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status == 200

        ok = await asyncio.to_thread(_test)
        if ok:
            return web.json_response({"connected": True, "message": "Connected to Ollama"})
        return web.json_response({"connected": False, "message": "Connection failed"})
    except Exception as e:
        return web.json_response({"connected": False, "message": str(e)})


async def handle_chat(request: web.Request) -> web.Response:
    """POST /api/wfm/ollama/chat - Send chat request to Ollama."""
    import asyncio
    try:
        body = await request.json()
        cfg = _get_ollama_config()
        model = body.get("model", cfg["model"])
        messages = body.get("messages", [])

        def _chat():
            payload = json.dumps({
                "model": model,
                "messages": messages,
                "stream": False,
            }).encode("utf-8")

            url = f"{cfg['url']}/api/chat"
            req = urllib.request.Request(
                url,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))

        resp_data = await asyncio.to_thread(_chat)
        return web.json_response({
            "status": "success",
            "message": resp_data.get("message", {}),
        })
    except Exception as e:
        logger.error("Ollama chat error: %s", e)
        return web.json_response({"error": str(e)}, status=500)

"""Unsloth API proxy routes.

Unlike Ollama/LM Studio/Lemonade, Unsloth Desktop requires an API key even
for local access (Authorization: Bearer sk-unsloth-...). The key lives in
UNSLOTH_API_KEY (loaded from a .env file by prestartup_script.py) and is
never sent to the frontend — the frontend calls this proxy with the target
path/method/payload, and the server attaches the Authorization header before
relaying to Unsloth's OpenAI-compatible API.
"""

import json
import logging
import os
import urllib.request
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse

from aiohttp import web

logger = logging.getLogger(__name__)

UNSLOTH_DEFAULT_URL = "http://localhost:8888"
_ALLOWED_PATHS = {"/v1/models", "/v1/chat/completions"}
# baseUrl is client-supplied (so a custom Unsloth port works), but the
# Authorization header carries a real secret — restrict the host to loopback
# so this proxy can't be used to exfiltrate UNSLOTH_API_KEY to an arbitrary
# server (SSRF). Port is unrestricted.
_ALLOWED_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _get_api_key():
    """Return the Unsloth API key from the environment (.env), or None."""
    return os.environ.get("UNSLOTH_API_KEY", "").strip() or None


def _is_allowed_base_url(base_url):
    """Only relay (and attach the API key) to a loopback host."""
    try:
        parsed = urlparse(base_url)
        return parsed.scheme in ("http", "https") and parsed.hostname in _ALLOWED_HOSTS
    except Exception:
        return False


def setup_routes(app: web.Application):
    """Register Unsloth API routes."""
    app.router.add_post("/api/wfm/unsloth/proxy", handle_proxy)


async def handle_proxy(request: web.Request) -> web.Response:
    """POST /api/wfm/unsloth/proxy - Relay a request to Unsloth's OpenAI-compatible API.

    Body: { baseUrl, path: "/v1/models" | "/v1/chat/completions", method: "GET" | "POST", payload }
    """
    import asyncio
    try:
        body = await request.json()
        base_url = (body.get("baseUrl") or UNSLOTH_DEFAULT_URL).rstrip("/")
        path = body.get("path") or "/v1/models"
        method = (body.get("method") or "GET").upper()
        payload = body.get("payload")

        if path not in _ALLOWED_PATHS or method not in ("GET", "POST"):
            return web.json_response({"message": "Unsupported proxy target"}, status=400)

        if not _is_allowed_base_url(base_url):
            return web.json_response({
                "message": "Unsloth backend URL must point to localhost/127.0.0.1/::1",
            }, status=400)

        api_key = _get_api_key()
        if not api_key:
            return web.json_response({
                "message": "UNSLOTH_API_KEY is not set. Copy .env.example to .env in the "
                            "plugin folder, fill in the key, and restart ComfyUI.",
            }, status=401)

        def _fetch():
            data = json.dumps(payload).encode("utf-8") if payload is not None else None
            headers = {"Authorization": f"Bearer {api_key}"}
            if data is not None:
                headers["Content-Type"] = "application/json"
            req = urllib.request.Request(f"{base_url}{path}", data=data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))

        data = await asyncio.to_thread(_fetch)
        return web.json_response(data)

    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace") if e.fp else str(e)
        logger.warning("Unsloth proxy HTTP error: %s %s", e.code, detail)
        return web.json_response({"message": f"Unsloth API error: HTTP {e.code}"}, status=e.code)
    except URLError as e:
        logger.warning("Unsloth proxy connection error: %s", e)
        return web.json_response({"message": f"Could not reach Unsloth: {e.reason}"}, status=502)
    except Exception as e:
        logger.error("Unsloth proxy error: %s", e)
        return web.json_response({"message": str(e)}, status=500)

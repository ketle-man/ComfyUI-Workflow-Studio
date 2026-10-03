"""Unsloth API proxy routes.

Unlike Ollama/LM Studio/Lemonade, Unsloth Desktop requires an API key even
for local access (Authorization: Bearer sk-unsloth-...). The key lives in
UNSLOTH_API_KEY (loaded from a .env file by prestartup_script.py) and is
never sent to the frontend — the frontend calls this proxy with the target
path/method/payload, and the server attaches the Authorization header before
relaying to Unsloth's OpenAI-compatible API — and, via the same relay, to its
Decision API (/v1/systemone, TypeSafe-compatible Laya decision models; see
static/js/decision-client.js).

The key is optional: when UNSLOTH_API_KEY is unset the request is relayed
without an Authorization header, which works when Unsloth Desktop has
Keyless API access → "Chat and inference" turned on (localhost / private LAN).
"""

import json
import logging
import os
import urllib.request
from urllib.error import HTTPError, URLError

from aiohttp import web

from ..services.url_guard import HINT as _URL_HINT, is_allowed_backend_url, urlopen as _guarded_urlopen

logger = logging.getLogger(__name__)

UNSLOTH_DEFAULT_URL = "http://localhost:8888"
_ALLOWED_PATHS = {"/v1/models", "/v1/chat/completions", "/v1/systemone"}
# baseUrl is client-supplied (so a custom Unsloth port works), but the
# Authorization header carries a real secret — restrict the host (loopback, or
# WFS_ALLOWED_BACKEND_HOSTS set by the operator) so this proxy can't be used to
# exfiltrate UNSLOTH_API_KEY to an arbitrary server (SSRF). Redirects are not followed.


def _get_api_key():
    """Return the Unsloth API key from the environment (.env), or None."""
    return os.environ.get("UNSLOTH_API_KEY", "").strip() or None


# Shown when a keyless request is rejected — also used by the Tagger's Unsloth VLM path.
KEYLESS_REJECTED_MESSAGE = (
    "Unsloth rejected the request without an API key (HTTP 401). Either set UNSLOTH_API_KEY "
    "in the plugin's .env (copy .env.example) and restart ComfyUI, or turn on Keyless API "
    "access -> \"Chat and inference\" in Unsloth Desktop's Settings -> API."
)


def setup_routes(app: web.Application):
    """Register Unsloth API routes."""
    app.router.add_post("/api/wfm/unsloth/proxy", handle_proxy)


async def handle_proxy(request: web.Request) -> web.Response:
    """POST /api/wfm/unsloth/proxy - Relay a request to Unsloth's OpenAI-compatible / Decision API.

    Body: { baseUrl, path: "/v1/models" | "/v1/chat/completions" | "/v1/systemone",
            method: "GET" | "POST", payload }
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

        if not is_allowed_backend_url(base_url):
            return web.json_response({"message": _URL_HINT}, status=400)

        # No key → relay without Authorization (Unsloth's Keyless API access); if Unsloth
        # still demands one, the 401 below explains both ways to fix it.
        api_key = _get_api_key()

        def _fetch():
            data = json.dumps(payload).encode("utf-8") if payload is not None else None
            headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
            if data is not None:
                headers["Content-Type"] = "application/json"
            req = urllib.request.Request(f"{base_url}{path}", data=data, headers=headers, method=method)
            with _guarded_urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))

        data = await asyncio.to_thread(_fetch)
        return web.json_response(data)

    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace") if e.fp else str(e)
        logger.warning("Unsloth proxy HTTP error: %s %s", e.code, detail)
        if e.code == 401 and not _get_api_key():
            return web.json_response({"message": KEYLESS_REJECTED_MESSAGE}, status=401)
        # Include a short excerpt of Unsloth's own error body — Decision API schema errors
        # (e.g. a malformed question) are otherwise impossible to diagnose from the frontend.
        return web.json_response({"message": f"Unsloth API error: HTTP {e.code} {detail[:300]}".strip()}, status=e.code)
    except URLError as e:
        logger.warning("Unsloth proxy connection error: %s", e)
        return web.json_response({"message": f"Could not reach Unsloth: {e.reason}"}, status=502)
    except Exception as e:
        logger.error("Unsloth proxy error: %s", e)
        return web.json_response({"message": str(e)}, status=500)

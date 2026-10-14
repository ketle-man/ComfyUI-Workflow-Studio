"""Partner (API) node execution support for GenerateUI.

ComfyUI's partner API nodes (Nano Banana / Gemini, Kling, Seedream, ...) authenticate through the
``extra_data`` of the ``/prompt`` request: ``auth_token_comfy_org`` (the browser's Comfy login) or
``api_key_comfy_org`` (a Comfy API key issued at platform.comfy.org). ComfyUI's own web UI adds
the login token automatically, but Workflow Studio is a separate page that POSTs to ``/prompt`` itself,
so such a prompt fails with "Unauthorized: Please login first to use this node."

When COMFY_API_KEY is set (loaded from the plugin's .env by prestartup_script.py), the frontend
queues prompts through this proxy instead. The proxy adds the key to ``extra_data`` — only when the
prompt actually contains an API node (``api_node: true`` in /object_info) — and relays the request
to the local ComfyUI. The key never reaches the browser. Usage is billed as Comfy credits.
"""

import json
import logging
import os
from urllib.parse import quote

import aiohttp
from aiohttp import web

logger = logging.getLogger(__name__)

_api_node_cache: dict = {}   # class_type -> bool (api_node flag); the node set only changes on restart


def _get_comfy_key():
    """Return the Comfy API key from the environment (.env), or None."""
    return os.environ.get("COMFY_API_KEY", "").strip() or None


def _local_base_url() -> str:
    """Base URL of this ComfyUI instance (from its --listen / --port launch arguments)."""
    try:
        from comfy.cli_args import args as _a
        port = getattr(_a, "port", None) or 8188
        host = str(getattr(_a, "listen", "") or "127.0.0.1").split(",")[0].strip()
        if host in ("", "0.0.0.0", "::"):
            host = "127.0.0.1"
        elif ":" in host:
            host = f"[{host}]"
    except Exception:
        host, port = "127.0.0.1", 8188
    return f"http://{host}:{port}"


async def _is_api_node(sess: aiohttp.ClientSession, base: str, class_type: str) -> bool:
    if class_type in _api_node_cache:
        return _api_node_cache[class_type]
    for attempt in range(2):   # /object_info occasionally drops the connection; one retry is enough
        try:
            async with sess.get(f"{base}/object_info/{quote(class_type, safe='')}") as r:
                if r.status == 200:
                    info = await r.json(content_type=None)
                    flag = bool((info.get(class_type) or {}).get("api_node"))
                    _api_node_cache[class_type] = flag
                    return flag
                break
        except Exception:
            if attempt == 1:
                logger.warning("object_info lookup failed for %s", class_type)
    return False


def setup_routes(app: web.Application):
    app.router.add_get("/api/wfm/partner/status", handle_status)
    app.router.add_post("/api/wfm/partner/prompt", handle_prompt)


async def handle_status(request: web.Request) -> web.Response:
    """GET /api/wfm/partner/status - whether a Comfy API key is configured (the key itself is never returned)."""
    return web.json_response({"configured": _get_comfy_key() is not None})


async def handle_prompt(request: web.Request) -> web.Response:
    """POST /api/wfm/partner/prompt - Relay a /prompt request to this ComfyUI, adding the Comfy API key
    to ``extra_data`` when the prompt contains an API node. The response is passed through unchanged."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": {"message": "invalid JSON body"}}, status=400)
    prompt = body.get("prompt")
    if not isinstance(prompt, dict):
        return web.json_response({"error": {"message": "prompt is required"}}, status=400)

    base = _local_base_url()
    key = _get_comfy_key()
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=120, connect=10)) as sess:
            if key:
                extra = body.get("extra_data")
                extra = extra if isinstance(extra, dict) else {}
                already = extra.get("auth_token_comfy_org") or extra.get("api_key_comfy_org")
                if not already:
                    classes = {n.get("class_type") for n in prompt.values() if isinstance(n, dict) and n.get("class_type")}
                    for cls in classes:
                        if await _is_api_node(sess, base, cls):
                            extra["api_key_comfy_org"] = key
                            break
                body["extra_data"] = extra
            async with sess.post(f"{base}/prompt", json=body) as r:
                data = await r.read()
                return web.Response(status=r.status, body=data, content_type="application/json")
    except Exception as e:
        logger.error("partner prompt relay failed: %s", e)
        return web.json_response({"error": {"message": f"relay failed: {e}"}}, status=502)

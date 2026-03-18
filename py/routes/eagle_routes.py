"""Eagle API proxy routes."""

import asyncio
import json
import logging
import urllib.request
import urllib.error

from aiohttp import web

logger = logging.getLogger(__name__)


def setup_routes(app: web.Application):
    """Register Eagle API routes."""
    app.router.add_post("/api/wfm/eagle/add", handle_add)
    app.router.add_post("/api/wfm/eagle/test", handle_test)


def _eagle_add(eagle_url, image_url, name, tags):
    """Proxy request to Eagle API (runs in thread)."""
    eagle_url = eagle_url.rstrip("/")

    if image_url.startswith("/") and not image_url.startswith("//"):
        # ComfyUI view URL -> convert to full URL for Eagle
        # Since we're running inside ComfyUI, use localhost with the configured port
        try:
            from server import PromptServer  # type: ignore
            port = PromptServer.instance.port
        except Exception:
            port = 8188
        full_url = f"http://127.0.0.1:{port}{image_url}"
        payload = json.dumps({"url": full_url, "name": name, "tags": tags}).encode("utf-8")
        endpoint = f"{eagle_url}/api/item/addFromURL"
    elif image_url.startswith("http://") or image_url.startswith("https://"):
        payload = json.dumps({"url": image_url, "name": name, "tags": tags}).encode("utf-8")
        endpoint = f"{eagle_url}/api/item/addFromURL"
    elif image_url.startswith("data:"):
        # base64 data URL
        payload = json.dumps({"url": image_url, "name": name, "tags": tags}).encode("utf-8")
        endpoint = f"{eagle_url}/api/item/addFromURL"
    else:
        raise ValueError(f"Unsupported URL format: {image_url[:50]}")

    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _eagle_test(eagle_url):
    """Test Eagle connection (runs in thread)."""
    eagle_url = eagle_url.rstrip("/")
    req = urllib.request.Request(
        f"{eagle_url}/api/application/info",
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


async def handle_add(request: web.Request) -> web.Response:
    """POST /api/wfm/eagle/add - Add image to Eagle."""
    try:
        body = await request.json()
        eagle_url = body.get("eagleUrl", "http://localhost:41595")
        image_url = body.get("url", "")
        name = body.get("name", "image.png")
        tags = body.get("tags", [])

        if not image_url:
            return web.json_response({"status": "error", "message": "No URL provided"}, status=400)

        result = await asyncio.to_thread(_eagle_add, eagle_url, image_url, name, tags)
        return web.json_response(result)
    except urllib.error.URLError as e:
        logger.error("Eagle URL error: %s", e)
        return web.json_response(
            {"status": "error", "message": f"Eagle connection error: {e.reason}"},
            status=502,
        )
    except Exception as e:
        logger.error("Eagle add error: %s", e)
        return web.json_response({"status": "error", "message": str(e)}, status=500)


async def handle_test(request: web.Request) -> web.Response:
    """POST /api/wfm/eagle/test - Test Eagle connection."""
    try:
        body = await request.json()
        eagle_url = body.get("eagleUrl", "http://localhost:41595")
        result = await asyncio.to_thread(_eagle_test, eagle_url)
        return web.json_response({
            "status": "success",
            "connected": True,
            "version": result.get("data", {}).get("version", "unknown"),
        })
    except Exception as e:
        return web.json_response({
            "status": "error",
            "connected": False,
            "message": str(e),
        })

"""Eagle API proxy routes."""

import asyncio
import json
import logging
import os
import urllib.request
import urllib.error

from aiohttp import web

logger = logging.getLogger(__name__)


def setup_routes(app: web.Application):
    """Register Eagle API routes."""
    app.router.add_post("/api/wfm/eagle/add", handle_add)
    app.router.add_post("/api/wfm/eagle/test", handle_test)


def _resolve_local_path(filename, subfolder, type_name):
    """filename/subfolder/type を ComfyUI 出力ディレクトリ上の実パスに解決する。
    ComfyUI と Eagle が同一マシン上で動作している場合のみ有効なパスが返る
    (別マシンの場合は None を返し、呼び出し側は addFromURL にフォールバックする)。"""
    try:
        import folder_paths  # type: ignore
    except Exception:
        return None

    base_dir = folder_paths.get_directory_by_type(type_name or "output")
    if not base_dir:
        return None
    base_dir = os.path.abspath(base_dir)

    filename = os.path.basename(filename or "")
    if not filename:
        return None

    full_dir = os.path.abspath(os.path.join(base_dir, subfolder or ""))
    # Windowsはパス比較で大文字小文字を区別しないため normcase で正規化してから比較する
    if os.path.commonpath((os.path.normcase(full_dir), os.path.normcase(base_dir))) != os.path.normcase(base_dir):
        # ディレクトリトラバーサル対策: base_dir 配下以外は拒否
        return None

    full_path = os.path.join(full_dir, filename)
    if not os.path.isfile(full_path):
        return None
    return full_path


def _resolve_absolute_svg_path(abs_path):
    """comfyui-tosvg の Save SVG String ノードなどが返す絶対パスを検証する。
    ComfyUI管理下(output/input/temp)ディレクトリ配下の実在する .svg ファイルのみ許可する
    (任意の絶対パスをそのまま信頼すると、外部からこのAPIを叩かれた際に
    ローカルの任意ファイルを送信させられてしまうため)。"""
    if not abs_path or not abs_path.lower().endswith(".svg"):
        return None
    try:
        import folder_paths  # type: ignore
    except Exception:
        return None

    abs_path = os.path.abspath(abs_path)
    if not os.path.isfile(abs_path):
        return None

    for type_name in ("output", "temp", "input"):
        base_dir = folder_paths.get_directory_by_type(type_name)
        if not base_dir:
            continue
        base_dir = os.path.abspath(base_dir)
        try:
            # Windowsはパス比較で大文字小文字を区別しないため normcase で正規化してから比較する
            if os.path.commonpath((os.path.normcase(abs_path), os.path.normcase(base_dir))) == os.path.normcase(base_dir):
                return abs_path
        except ValueError:
            # Windowsで異なるドライブレターの場合 commonpath が例外を投げる
            continue
    return None


def _eagle_add_from_path(eagle_url, file_path, name, tags):
    """Proxy request to Eagle's addFromPath API (runs in thread).
    SVG は ComfyUI の /view がセキュリティ上 application/octet-stream +
    attachment で返すため、addFromURL 経由だと正しい種別で保存されないことがある。
    ComfyUI と Eagle が同一マシン上にある場合はローカルパスを直接渡す方が確実。"""
    eagle_url = eagle_url.rstrip("/")
    payload = json.dumps({"path": file_path, "name": name, "tags": tags}).encode("utf-8")
    req = urllib.request.Request(
        f"{eagle_url}/api/item/addFromPath",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


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
        filename = body.get("filename", "")
        subfolder = body.get("subfolder", "")
        file_type = body.get("type", "output")
        local_path_hint = body.get("localPath", "")

        if not image_url and not local_path_hint:
            return web.json_response({"status": "error", "message": "No URL provided"}, status=400)

        # SVG は /view が application/octet-stream + attachment で返すため、
        # ローカルファイルが解決できる場合は addFromPath で直接渡す
        local_path = None
        if local_path_hint:
            # comfyui-tosvg の Save SVG String ノードなど、絶対パスが既知の場合
            local_path = _resolve_absolute_svg_path(local_path_hint)
        elif (filename or name or "").lower().endswith(".svg"):
            local_path = _resolve_local_path(filename or name, subfolder, file_type)

        if not local_path and not image_url:
            return web.json_response(
                {"status": "error", "message": f"Could not resolve local SVG path: {local_path_hint}"},
                status=400,
            )

        if local_path:
            result = await asyncio.to_thread(_eagle_add_from_path, eagle_url, local_path, name, tags)
        else:
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

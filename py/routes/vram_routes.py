"""VRAM management: unload Ollama models before image generation to free VRAM.

Ported from ComfyUI Comic Creator (/api/ccc/vram/prepare), which follows ComfyUI-LiveChatStream's
vram_prepare. ComfyUI's own free-VRAM figure (get_free_memory / system_stats vram_free) may not react
to Ollama loading/unloading models (measured on ComfyUI_5: 8462MB before and after loading a 9B model
while nvidia-smi went 6530 -> 469MB), so free VRAM is measured with nvidia-smi plus ComfyUI's own
unused torch cache, falling back to get_free_memory when nvidia-smi is unavailable.
"""

import asyncio
import json
import logging
import math
import subprocess
import time
import urllib.request
from urllib.parse import urlparse

from aiohttp import web

from ..services.url_guard import is_allowed_backend_url, LOOPBACK_HOSTS, urlopen

logger = logging.getLogger(__name__)

_MB = 1024 * 1024
_OLLAMA_DEFAULT_URL = "http://127.0.0.1:11434"
_MAX_URLS = 6                      # incl. the default; each unreachable URL costs a connect timeout
_lock = asyncio.Lock()             # never run concurrently (unloading and measuring interfere)


def setup_routes(app: web.Application):
    app.router.add_post("/api/wfm/vram/prepare", handle_prepare)


def _smi_free_mb(ident):
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    out = subprocess.run(
        ["nvidia-smi", "-i", str(ident), "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
        capture_output=True, text=True, timeout=5, creationflags=flags,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip() or "nvidia-smi failed")
    return float(out.stdout.strip().splitlines()[0])


def _free_vram_mb():
    """Free VRAM (MB) usable for image generation, and its source ('nvidia-smi' / 'comfy')."""
    import torch
    import comfy.model_management as mm
    dev = mm.get_torch_device()
    if getattr(dev, "type", "cpu") == "cuda":
        try:
            st = torch.cuda.memory_stats(dev)
            cached = max(0, st["reserved_bytes.all.current"] - st["active_bytes.all.current"])
            try:
                free = _smi_free_mb(f"GPU-{torch.cuda.get_device_properties(dev).uuid}")
            except Exception:
                free = _smi_free_mb(dev.index or 0)
            return free + cached / _MB, "nvidia-smi"
        except Exception as e:
            logger.warning("[WFS] nvidia-smi free VRAM unavailable, falling back to ComfyUI: %s", e)
    return mm.get_free_memory(dev) / _MB, "comfy"


def _wait_settled(prev_mb, timeout_s=6.0):
    """After an unload, wait until free VRAM grows and levels off (Ollama runner exit); return it (MB)."""
    now = prev_mb
    last = None
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        time.sleep(0.4)
        now, _ = _free_vram_mb()
        if last is not None and abs(now - last) < 32 and now > prev_mb + 32:
            break
        last = now
    return now


def _ollama_json(base, path, payload=None, timeout=60):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(base + path, data=data, headers={"Content-Type": "application/json"},
                                 method="POST" if data is not None else "GET")
    with urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read()


def _ollama_loaded_names(base):
    _, raw = _ollama_json(base, "/api/ps", timeout=5)
    return {m.get("name") for m in json.loads(raw.decode("utf-8")).get("models", [])}


def _ollama_unload(base, name):
    """Unload with keep_alive=0. Models that reject /api/generate (e.g. decision models) are retried
    with /api/chat. Ollama sometimes unloads a little later even after an error response, so finally
    check /api/ps to see whether it is still loaded."""
    errors = []
    for path, payload in (("/api/generate", {"model": name, "keep_alive": 0}),
                          ("/api/chat", {"model": name, "messages": [], "keep_alive": 0})):
        try:
            status, _ = _ollama_json(base, path, payload)
            if status == 200:
                return True
            errors.append(f"{path}: HTTP {status}")
        except Exception as e:
            errors.append(f"{path}: {e}")
    for _ in range(5):
        time.sleep(0.5)
        try:
            if name not in _ollama_loaded_names(base):
                return True
        except Exception:
            pass
    logger.warning("[WFS] vram: unload failed for %s: %s", name, "; ".join(errors))
    return False


def _ollama_bases(urls):
    """Deduplicated, permitted Ollama base URLs. localhost / 127.0.0.1 / ::1 count as one server.
    URLs the backend guard rejects are skipped (logged) rather than failing the whole request."""
    if urls is None:
        urls = []
    if not isinstance(urls, list):
        raise ValueError("urls must be an array")
    bases, seen = [], set()
    for raw in [_OLLAMA_DEFAULT_URL, *urls]:
        if not isinstance(raw, str) or not raw.strip():
            continue
        base = raw.strip().rstrip("/")
        if not is_allowed_backend_url(base):
            logger.warning("[WFS] vram: skipped backend URL not permitted by the guard: %s", base)
            continue
        p = urlparse(base)
        host = (p.hostname or "").lower()
        key = ("loopback" if host in LOOPBACK_HOSTS else host, p.scheme, p.port or (443 if p.scheme == "https" else 80))
        if key in seen:
            continue
        seen.add(key)
        bases.append(base)
        if len(bases) >= _MAX_URLS:
            break
    return bases


def _prepare(mode, target_mb, bases):
    free_before, free_src = _free_vram_mb()
    cands, unreachable = [], []
    for base in bases:
        try:
            _, raw = _ollama_json(base, "/api/ps", timeout=5)
            for m in json.loads(raw.decode("utf-8")).get("models", []):
                if m.get("name"):
                    cands.append({"base": base, "name": m["name"], "vram_mb": int(m.get("size_vram", 0) / _MB)})
        except Exception as e:
            # Ollama not running etc. Normal for the default URL, so not a failure; keep the reason in the
            # log only (the response doesn't reveal the state of caller-chosen local ports)
            logger.info("[WFS] vram: %s/api/ps failed: %r", base, e)
            unreachable.append({"url": base})
    unloaded, failed = [], []
    free_after = free_before
    if mode == "auto":
        # Ollama's size_vram excludes the KV cache etc. and is smaller than the VRAM actually freed.
        # Choosing by estimate could free too much, so unload the biggest first, one at a time, and stop
        # as soon as the measured free VRAM reaches the target
        cands.sort(key=lambda c: c["vram_mb"], reverse=True)
        for c in cands:
            if free_after >= target_mb:
                break
            if _ollama_unload(c["base"], c["name"]):
                unloaded.append(c)
                free_after = _wait_settled(free_after)
            else:
                failed.append(c)
    else:
        for c in cands:
            (unloaded if _ollama_unload(c["base"], c["name"]) else failed).append(c)
        if unloaded:
            free_after = _wait_settled(free_after)
    strip = lambda cs: [{"name": c["name"], "vram_mb": c["vram_mb"]} for c in cs]
    return {
        "status": "ok", "mode": mode, "target_gb": target_mb / 1024, "free_source": free_src,
        "free_before_mb": round(free_before), "free_after_mb": round(free_after),
        "unloaded": strip(unloaded), "failed": [c["name"] for c in failed],
        "unreachable": unreachable,
        "reached": free_after >= target_mb,
    }


def _error(message, status):
    return web.json_response({"status": "error", "message": message}, status=status)


async def handle_prepare(request: web.Request) -> web.Response:
    """POST {mode:'auto'|'all', target_gb, urls:[Ollama URLs]}.
    auto: only when free VRAM is below target_gb, unload the models using the most VRAM until it is reached.
    all: unload every loaded model.
    The default 127.0.0.1:11434 is always included; other URLs must pass the backend URL guard."""
    # JSON only, so another site can't unload models with a simple (preflight-free) text/plain request
    if request.content_type != "application/json":
        return _error("Content-Type must be application/json", 415)
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError("body must be a JSON object")
        mode = data.get("mode")
        if mode not in ("auto", "all"):
            raise ValueError("mode must be auto or all")
        target_gb = float(data.get("target_gb", 8) or 0)
        if not math.isfinite(target_gb):
            raise ValueError("target_gb must be a finite number")
        target_mb = min(max(target_gb, 0.0), 64.0) * 1024
        bases = _ollama_bases(data.get("urls"))
    except Exception as e:
        return _error(str(e), 400)
    if _lock.locked():
        return _error("VRAM management is already running", 409)
    try:
        async with _lock:
            result = await asyncio.get_running_loop().run_in_executor(None, _prepare, mode, target_mb, bases)
        return web.json_response(result)
    except Exception as e:
        logger.error("[WFS] vram prepare error: %s", e)
        return _error(str(e), 500)

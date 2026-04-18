"""Model metadata API routes."""

import asyncio
import logging
import mimetypes

from aiohttp import web

from ..services.models_service import ModelsService
from ..services.civitai_service import CivitaiService

logger = logging.getLogger(__name__)

_service = ModelsService()
_civitai = CivitaiService()


def setup_routes(app: web.Application):
    """Register all model management API routes."""
    app.router.add_get("/api/wfm/models/metadata", handle_get_metadata)
    app.router.add_post("/api/wfm/models/metadata", handle_save_metadata)
    app.router.add_get("/api/wfm/models/preview", handle_get_preview)
    app.router.add_get("/api/wfm/models/groups", handle_get_groups)
    app.router.add_post("/api/wfm/models/groups", handle_save_groups)
    app.router.add_post("/api/wfm/models/civitai/fetch", handle_civitai_fetch)
    app.router.add_get("/api/wfm/models/civitai/cache", handle_civitai_cache)
    app.router.add_post("/api/wfm/models/civitai/batch", handle_civitai_batch)
    app.router.add_post("/api/wfm/models/change-preview", handle_change_preview)
    app.router.add_get("/api/wfm/models/filepath", handle_get_filepath)
    app.router.add_get("/api/wfm/models/disabled", handle_get_disabled)
    app.router.add_post("/api/wfm/models/toggle", handle_toggle_model)
    app.router.add_post("/api/wfm/models/group-toggle", handle_toggle_group)
    app.router.add_post("/api/wfm/models/delete", handle_delete_models)


# ── Model Metadata ─────────────────────────────────────────


async def handle_get_metadata(request: web.Request) -> web.Response:
    """GET /api/wfm/models/metadata"""
    try:
        result = await asyncio.to_thread(_service.get_all_metadata)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error loading model metadata: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_save_metadata(request: web.Request) -> web.Response:
    """POST /api/wfm/models/metadata"""
    try:
        body = await request.json()
        model_name = body.get("modelName", "")
        if not model_name:
            return web.json_response({"error": "modelName is required"}, status=400)
        updates = {k: v for k, v in body.items() if k != "modelName"}
        result = await asyncio.to_thread(_service.update_metadata, model_name, updates)
        return web.json_response({"status": "ok", "metadata": result})
    except Exception as e:
        logger.error("Error saving model metadata: %s", e)
        return web.json_response({"error": str(e)}, status=500)


# ── Model Groups ──────────────────────────────────────────


async def handle_get_groups(request: web.Request) -> web.Response:
    """GET /api/wfm/models/groups?type=checkpoint"""
    model_type = request.query.get("type", "")
    try:
        result = await asyncio.to_thread(_service.get_model_groups, model_type or None)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error loading model groups: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_save_groups(request: web.Request) -> web.Response:
    """POST /api/wfm/models/groups

    Body: { "model_type": "checkpoint", "groups": { "groupName": [...] } }
    """
    try:
        body = await request.json()
        model_type = body.get("model_type", "")
        groups = body.get("groups", {})
        if not model_type:
            return web.json_response({"error": "model_type required"}, status=400)
        result = await asyncio.to_thread(_service.save_model_groups, groups, model_type)
        return web.json_response({"status": "ok", "groups": result})
    except Exception as e:
        logger.error("Error saving model groups: %s", e)
        return web.json_response({"error": str(e)}, status=500)


# ── CivitAI Integration ──────────────────────────────────


async def handle_civitai_fetch(request: web.Request) -> web.Response:
    """POST /api/wfm/models/civitai/fetch

    Body: { "type": "checkpoint", "name": "model.safetensors" }
    Calculates SHA256 hash and fetches model info from CivitAI.
    """
    try:
        body = await request.json()
        model_type = body.get("type", "")
        model_name = body.get("name", "")
        if not model_type or not model_name:
            return web.json_response({"error": "type and name required"}, status=400)
        if ".." in model_name:
            return web.json_response({"error": "Invalid model name"}, status=400)

        # Resolve file path
        from ..services.models_service import _get_model_dirs
        dirs = _get_model_dirs(model_type)
        file_path = None
        for d in dirs:
            candidate = d / model_name
            if candidate.is_file():
                file_path = candidate
                break

        if not file_path:
            return web.json_response({"error": "Model file not found"}, status=404)

        # Check if we already have a cached hash in metadata
        meta = _service.get_all_metadata()
        model_meta = meta.get(model_name, {})
        sha256 = model_meta.get("sha256")

        if not sha256:
            # Calculate hash (can be slow for large files)
            sha256 = await asyncio.to_thread(
                CivitaiService.calculate_sha256, file_path
            )
            if not sha256:
                return web.json_response({"error": "Failed to calculate hash"}, status=500)
            # Cache the hash in model metadata
            await asyncio.to_thread(
                _service.update_metadata, model_name, {"sha256": sha256}
            )

        # Fetch from CivitAI
        info = await asyncio.to_thread(_civitai.fetch_by_hash, sha256)
        if not info:
            return web.json_response({
                "status": "not_found",
                "sha256": sha256,
                "message": "Model not found on CivitAI"
            })

        return web.json_response({
            "status": "ok",
            "sha256": sha256,
            "civitai": info,
        })
    except Exception as e:
        logger.error("CivitAI fetch error: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_civitai_cache(request: web.Request) -> web.Response:
    """GET /api/wfm/models/civitai/cache - Return all cached CivitAI data."""
    try:
        result = await asyncio.to_thread(_civitai.get_all_cached)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error loading CivitAI cache: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_civitai_batch(request: web.Request) -> web.Response:
    """POST /api/wfm/models/civitai/batch - SSE stream for batch CivitAI fetch.

    Body: { "type": "checkpoint", "models": ["model1.safetensors", ...] }
    Streams SSE events: progress, result, done.
    """
    import json as _json

    try:
        body = await request.json()
    except Exception:
        return web.Response(status=400, text="Invalid JSON body")

    model_type = body.get("type", "")
    model_names = body.get("models", [])
    if not model_type or not model_names:
        return web.Response(status=400, text="type and models required")

    # Resolve file paths
    from ..services.models_service import _get_model_dirs
    dirs = _get_model_dirs(model_type)
    model_files = []
    for name in model_names:
        if ".." in name:
            continue
        for d in dirs:
            p = d / name
            if p.is_file():
                model_files.append((name, p))
                break

    if not model_files:
        return web.Response(status=404, text="No model files found")

    # Set up SSE response
    response = web.StreamResponse(
        status=200,
        headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
    await response.prepare(request)

    def send_sse(event, data):
        """Format SSE message (returns bytes)."""
        msg = f"event: {event}\ndata: {_json.dumps(data, ensure_ascii=False)}\n\n"
        return msg.encode("utf-8")

    # Run batch fetch in thread with progress callback via queue
    import queue
    progress_q = queue.Queue()

    def on_progress(current, total, model_name, status):
        progress_q.put({"current": current, "total": total, "model": model_name, "status": status})

    # Start batch in background thread
    loop = asyncio.get_event_loop()
    fetch_task = loop.run_in_executor(None, _civitai.batch_fetch, model_files, on_progress)

    # Stream progress events
    import time as _time

    while not fetch_task.done():
        # Drain queue
        while not progress_q.empty():
            try:
                p = progress_q.get_nowait()
                await response.write(send_sse("progress", p))
            except queue.Empty:
                break
        await asyncio.sleep(0.1)

    # Drain remaining events
    while not progress_q.empty():
        try:
            p = progress_q.get_nowait()
            await response.write(send_sse("progress", p))
        except queue.Empty:
            break

    # Get results and update metadata
    results = fetch_task.result()
    meta_updates = {}
    for model_name, result in results.items():
        sha256 = result.get("sha256")
        if sha256:
            meta_updates[model_name] = sha256

    # Bulk update sha256 in metadata
    if meta_updates:
        all_meta = _service.get_all_metadata()
        for mname, sha in meta_updates.items():
            if mname not in all_meta:
                all_meta[mname] = {"tags": [], "favorite": False, "memo": ""}
            all_meta[mname]["sha256"] = sha
        _service._save_metadata(all_meta)

    # Send final result
    summary = {
        "total": len(model_files),
        "found": sum(1 for r in results.values() if r.get("civitai")),
        "not_found": sum(1 for r in results.values() if r.get("sha256") and not r.get("civitai")),
        "errors": sum(1 for r in results.values() if r.get("error")),
        "hashes": {name: r.get("sha256") for name, r in results.items() if r.get("sha256")},
    }
    await response.write(send_sse("done", summary))
    await response.write_eof()
    return response


# ── Model Preview Image ───────────────────────────────────


async def handle_get_preview(request: web.Request) -> web.Response:
    """GET /api/wfm/models/preview?type=checkpoint&name=model.safetensors"""
    model_type = request.query.get("type", "")
    model_name = request.query.get("name", "")
    if not model_type or not model_name:
        return web.Response(status=400, text="type and name are required")

    # Security: reject path traversal
    if ".." in model_name:
        return web.Response(status=400, text="Invalid model name")

    try:
        preview_path = await asyncio.to_thread(
            _service.find_preview_image, model_type, model_name
        )
        if not preview_path:
            return web.Response(status=404)

        content_type, _ = mimetypes.guess_type(str(preview_path))
        return web.FileResponse(
            preview_path,
            headers={"Content-Type": content_type or "image/png",
                     "Cache-Control": "public, max-age=3600"},
        )
    except Exception as e:
        logger.error("Error serving model preview: %s", e)
        return web.Response(status=500, text=str(e))


async def handle_change_preview(request: web.Request) -> web.Response:
    """POST /api/wfm/models/change-preview - Upload/change model preview image.

    Multipart form: type, name, file
    Saves as {model_stem}.preview.png next to the model file.
    """
    from pathlib import Path as _Path

    try:
        reader = await request.multipart()
        model_type = None
        model_name = None
        image_data = None

        while True:
            part = await reader.next()
            if part is None:
                break
            if part.name == "type":
                model_type = (await part.read()).decode("utf-8")
            elif part.name == "name":
                model_name = (await part.read()).decode("utf-8")
            elif part.name == "file":
                image_data = await part.read()

        if not model_type or not model_name:
            return web.json_response({"error": "type and name required"}, status=400)
        if ".." in model_name:
            return web.json_response({"error": "Invalid model name"}, status=400)
        if image_data is None:
            return web.json_response({"error": "file required"}, status=400)

        # Resolve model file path
        from ..services.models_service import _get_model_dirs
        dirs = _get_model_dirs(model_type)
        model_path = None
        for d in dirs:
            candidate = d / model_name
            if candidate.is_file():
                model_path = candidate
                break

        if not model_path:
            return web.json_response({"error": "Model file not found"}, status=404)

        # Save as {stem}.preview.png next to model file
        preview_path = model_path.parent / (model_path.stem + ".preview.png")

        def _write():
            with open(preview_path, "wb") as f:
                f.write(image_data)

        await asyncio.to_thread(_write)
        logger.info("Saved preview image: %s", preview_path)

        return web.json_response({"status": "ok"})
    except Exception as e:
        logger.error("Error changing model preview: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_get_filepath(request: web.Request) -> web.Response:
    """GET /api/wfm/models/filepath?type=checkpoint&name=model.safetensors

    Returns the full file path of the model.
    """
    model_type = request.query.get("type", "")
    model_name = request.query.get("name", "")
    if not model_type or not model_name:
        return web.json_response({"error": "type and name required"}, status=400)
    if ".." in model_name:
        return web.json_response({"error": "Invalid model name"}, status=400)

    try:
        from ..services.models_service import _get_model_dirs
        dirs = _get_model_dirs(model_type)
        for d in dirs:
            candidate = d / model_name
            if candidate.is_file():
                return web.json_response({"path": str(candidate)})
        return web.json_response({"error": "Model file not found"}, status=404)
    except Exception as e:
        logger.error("Error resolving model filepath: %s", e)
        return web.json_response({"error": str(e)}, status=500)


# ── Model Enable / Disable ────────────────────────────────


async def handle_get_disabled(request: web.Request) -> web.Response:
    """GET /api/wfm/models/disabled?type=checkpoint

    Returns list of disabled model names (normalized, without .disabled suffix).
    """
    model_type = request.query.get("type", "")
    if not model_type:
        return web.json_response({"error": "type required"}, status=400)
    try:
        result = await asyncio.to_thread(_service.scan_disabled_models, model_type)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error scanning disabled models: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_toggle_model(request: web.Request) -> web.Response:
    """POST /api/wfm/models/toggle

    Body: { "model_type": "checkpoint", "model_name": "v1-5.safetensors", "enabled": false }
    Renames the model file to add/remove .disabled suffix.
    """
    try:
        body = await request.json()
        model_type = body.get("model_type", "")
        model_name = body.get("model_name", "")
        enabled = body.get("enabled", True)

        if not model_type or not model_name:
            return web.json_response({"error": "model_type and model_name required"}, status=400)
        if ".." in model_name:
            return web.json_response({"error": "Invalid model name"}, status=400)

        if enabled:
            await asyncio.to_thread(_service.enable_model, model_type, model_name)
        else:
            await asyncio.to_thread(_service.disable_model, model_type, model_name)

        return web.json_response({"status": "ok", "enabled": enabled})
    except FileNotFoundError as e:
        return web.json_response({"error": str(e)}, status=404)
    except OSError as e:
        logger.error("OS error toggling model: %s", e)
        return web.json_response({"error": str(e)}, status=500)
    except Exception as e:
        logger.error("Error toggling model: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_toggle_group(request: web.Request) -> web.Response:
    """POST /api/wfm/models/group-toggle

    Body: { "model_type": "checkpoint", "group_name": "MyGroup", "enabled": true }
    Enables or disables all models belonging to the specified group.
    """
    try:
        body = await request.json()
        model_type = body.get("model_type", "")
        group_name = body.get("group_name", "")
        enabled = body.get("enabled", True)

        if not model_type or not group_name:
            return web.json_response({"error": "model_type and group_name required"}, status=400)

        groups = await asyncio.to_thread(_service.get_model_groups, model_type)
        members = groups.get(group_name, [])

        ok_list = []
        error_list = []
        for model_name in members:
            if ".." in model_name:
                continue
            try:
                if enabled:
                    await asyncio.to_thread(_service.enable_model, model_type, model_name)
                else:
                    await asyncio.to_thread(_service.disable_model, model_type, model_name)
                ok_list.append(model_name)
            except Exception as e:
                error_list.append({"model": model_name, "error": str(e)})

        return web.json_response({
            "status": "ok",
            "enabled": enabled,
            "ok": ok_list,
            "errors": error_list,
        })
    except Exception as e:
        logger.error("Error toggling group: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_delete_models(request: web.Request) -> web.Response:
    """POST /api/wfm/models/delete

    Body: { "model_type": "checkpoint", "model_names": ["a.safetensors", "b.safetensors"] }
    Deletes each model file and associated preview/sidecar files, then removes metadata.
    """
    try:
        body = await request.json()
        model_type = body.get("model_type", "")
        model_names = body.get("model_names", [])

        if not model_type or not isinstance(model_names, list) or not model_names:
            return web.json_response({"error": "model_type and model_names[] required"}, status=400)

        ok_list = []
        error_list = []
        for model_name in model_names:
            if ".." in str(model_name):
                error_list.append({"model": model_name, "error": "Invalid model name"})
                continue
            try:
                result = await asyncio.to_thread(_service.delete_model, model_type, model_name)
                ok_list.append({"model": model_name, "deleted": result["deleted"]})
                logger.info("Deleted model: %s (%s files)", model_name, len(result["deleted"]))
            except FileNotFoundError as e:
                error_list.append({"model": model_name, "error": str(e)})
            except Exception as e:
                logger.error("Error deleting model %s: %s", model_name, e)
                error_list.append({"model": model_name, "error": str(e)})

        return web.json_response({"status": "ok", "ok": ok_list, "errors": error_list})
    except Exception as e:
        logger.error("Error in delete_models: %s", e)
        return web.json_response({"error": str(e)}, status=500)

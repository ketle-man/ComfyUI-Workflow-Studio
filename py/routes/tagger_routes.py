"""Tagger API routes."""

import asyncio
import logging

from aiohttp import web

from ..config import TAGGER_DB_FILE, TAGGER_MODELS_DIR, TAGGER_SETTINGS_FILE
from ..services.tagger_db_service import TaggerDbService
from ..services.tagger_service import TaggerService

logger = logging.getLogger(__name__)

_svc = TaggerService(TAGGER_MODELS_DIR, TAGGER_SETTINGS_FILE)
_db = TaggerDbService(TAGGER_DB_FILE)


def setup_routes(app: web.Application):
    app.router.add_get("/wfm/tagger/models", handle_models)
    app.router.add_post("/wfm/tagger/predict", handle_predict)
    app.router.add_get("/wfm/tagger/ollama/models", handle_ollama_models)
    app.router.add_post("/wfm/tagger/ollama/predict", handle_ollama_predict)
    app.router.add_post("/wfm/tagger/batch/start", handle_batch_start)
    app.router.add_get("/wfm/tagger/batch/status", handle_batch_status)
    app.router.add_post("/wfm/tagger/batch/stop", handle_batch_stop)
    app.router.add_get("/wfm/tagger/db/list", handle_db_list)
    app.router.add_get("/wfm/tagger/db/search", handle_db_search)
    app.router.add_put("/wfm/tagger/db/{id}", handle_db_update)
    app.router.add_delete("/wfm/tagger/db/{id}", handle_db_delete)
    app.router.add_get("/wfm/tagger/db/export", handle_db_export)
    app.router.add_post("/wfm/tagger/db/save", handle_db_save)
    app.router.add_post("/wfm/tagger/write_meta", handle_write_meta)
    app.router.add_get("/wfm/tagger/settings", handle_settings_get)
    app.router.add_post("/wfm/tagger/settings", handle_settings_save)


async def handle_models(request: web.Request) -> web.Response:
    try:
        models = await asyncio.to_thread(_svc.list_models)
        return web.json_response({"models": models})
    except Exception as e:
        logger.error("handle_models: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_predict(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        b64 = body.get("image_b64", "")
        model = body.get("model", "")
        if not b64 or not model:
            return web.json_response({"error": "image_b64 and model required"}, status=400)
        result = await asyncio.to_thread(
            _svc.predict, b64, model,
            float(body.get("threshold", 0.35)),
            float(body.get("char_threshold", 0.85)),
        )
        return web.json_response(result)
    except Exception as e:
        logger.error("handle_predict: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_ollama_models(request: web.Request) -> web.Response:
    api_url = request.rel_url.query.get("api_url", "http://127.0.0.1:11434")
    try:
        models = await asyncio.to_thread(_svc.ollama_models, api_url)
        return web.json_response({"models": models})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_ollama_predict(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        result = await asyncio.to_thread(
            _svc.ollama_predict,
            body.get("image_b64", ""),
            body.get("api_url", "http://127.0.0.1:11434"),
            body.get("model", ""),
            body.get("prompt", ""),
            int(body.get("max_tags", 40)),
        )
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_batch_start(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        result = await asyncio.to_thread(
            _svc.batch_start,
            body.get("folder", ""),
            body.get("model", ""),
            float(body.get("threshold", 0.35)),
            float(body.get("char_threshold", 0.85)),
            bool(body.get("use_ollama", False)),
            body.get("ollama_api", "http://127.0.0.1:11434"),
            body.get("ollama_model", ""),
            body.get("ollama_prompt", ""),
            int(body.get("ollama_max_tags", 40)),
            bool(body.get("save_db", True)),
            bool(body.get("write_file", False)),
            bool(body.get("write_txt", False)),
            _db,
        )
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_batch_status(request: web.Request) -> web.Response:
    return web.json_response(_svc.batch_status())


async def handle_batch_stop(request: web.Request) -> web.Response:
    _svc.batch_stop()
    return web.json_response({"ok": True})


async def handle_db_list(request: web.Request) -> web.Response:
    try:
        limit = int(request.rel_url.query.get("limit", 100))
        offset = int(request.rel_url.query.get("offset", 0))
        rows = await asyncio.to_thread(_db.list, limit, offset)
        total = await asyncio.to_thread(_db.total)
        return web.json_response({"rows": rows, "total": total})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_db_search(request: web.Request) -> web.Response:
    try:
        q = request.rel_url.query.get("q", "")
        rows = await asyncio.to_thread(_db.search, q)
        return web.json_response({"rows": rows})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_db_update(request: web.Request) -> web.Response:
    try:
        row_id = int(request.match_info["id"])
        body = await request.json()
        await asyncio.to_thread(
            _db.update, row_id,
            body.get("interrogator_tags", ""),
            body.get("vlm_tags", ""),
        )
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_db_delete(request: web.Request) -> web.Response:
    try:
        row_id = int(request.match_info["id"])
        await asyncio.to_thread(_db.delete, row_id)
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_db_export(request: web.Request) -> web.Response:
    try:
        csv_data = await asyncio.to_thread(_db.export_csv)
        return web.Response(
            body=csv_data.encode("utf-8"),
            content_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=tagger_tags.csv"},
        )
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_db_save(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        row_id = await asyncio.to_thread(
            _db.save,
            body.get("filename", ""),
            body.get("interrogator_tags", ""),
            body.get("vlm_tags", ""),
        )
        return web.json_response({"ok": True, "id": row_id})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_write_meta(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        result = await asyncio.to_thread(
            _svc.write_meta_to_file,
            body.get("path", ""),
            body.get("tags", ""),
        )
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_settings_get(request: web.Request) -> web.Response:
    return web.json_response(_svc.load_settings())


async def handle_settings_save(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        await asyncio.to_thread(_svc.save_settings, body)
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

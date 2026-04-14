"""Settings API routes."""

import asyncio
import json
import logging
from pathlib import Path

from aiohttp import web

from ..services.settings_service import SettingsService
from ..config import DEFAULT_WORKFLOWS_DIR, DATA_DIR

logger = logging.getLogger(__name__)

_service = SettingsService()

# Data files included in export/import
_DATA_FILES = [
    "settings.json",
    "metadata.json",
    "node_metadata.json",
    "node_sets.json",
    "prompts.json",
    "model_metadata.json",
    "gallery_metadata.json",
]


def setup_routes(app: web.Application):
    """Register settings API routes."""
    app.router.add_get("/api/wfm/settings", handle_get)
    app.router.add_post("/api/wfm/settings", handle_post)
    app.router.add_get("/api/wfm/settings/workflows-dir", handle_get_workflows_dir)
    app.router.add_post("/api/wfm/settings/workflows-dir", handle_set_workflows_dir)
    app.router.add_get("/api/wfm/settings/output-dir", handle_get_output_dir)
    app.router.add_post("/api/wfm/settings/output-dir", handle_set_output_dir)
    app.router.add_get("/api/wfm/settings/export", handle_export)
    app.router.add_post("/api/wfm/settings/import", handle_import)


async def handle_get(request: web.Request) -> web.Response:
    """GET /api/wfm/settings - Get all settings."""
    try:
        data = await asyncio.to_thread(_service.load)
        return web.json_response(data)
    except Exception as e:
        logger.error("Error loading settings: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_post(request: web.Request) -> web.Response:
    """POST /api/wfm/settings - Update settings."""
    try:
        body = await request.json()
        data = await asyncio.to_thread(_service.update, body)
        return web.json_response({"status": "ok", "settings": data})
    except Exception as e:
        logger.error("Error saving settings: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_get_workflows_dir(request: web.Request) -> web.Response:
    """GET /api/wfm/settings/workflows-dir - Get current and default workflows directory."""
    try:
        from ..routes.workflow_routes import _service as wf_service
        current = str(wf_service.workflows_dir)
        default = str(DEFAULT_WORKFLOWS_DIR)
        return web.json_response({
            "current": current,
            "default": default,
        })
    except Exception as e:
        logger.error("Error getting workflows dir: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_set_workflows_dir(request: web.Request) -> web.Response:
    """POST /api/wfm/settings/workflows-dir - Change workflows directory."""
    try:
        body = await request.json()
        new_dir = body.get("workflows_dir", "").strip()

        if new_dir:
            p = Path(new_dir)
            if not p.is_dir():
                try:
                    p.mkdir(parents=True, exist_ok=True)
                except Exception as ex:
                    return web.json_response({
                        "error": f"Cannot create directory: {ex}",
                    }, status=400)
        else:
            # Empty = reset to default
            new_dir = ""

        # Save to settings
        await asyncio.to_thread(_service.update, {"workflows_dir": new_dir})

        # Update workflow service at runtime
        from ..routes.workflow_routes import _service as wf_service
        target = new_dir if new_dir else str(DEFAULT_WORKFLOWS_DIR)
        wf_service.update_workflows_dir(target)

        return web.json_response({
            "status": "ok",
            "workflows_dir": str(wf_service.workflows_dir),
        })
    except Exception as e:
        logger.error("Error setting workflows dir: %s", e)
        return web.json_response({"error": str(e)}, status=500)


def _get_comfyui_output_dir() -> str:
    """ComfyUIのデフォルトoutputフォルダを取得する。"""
    try:
        import folder_paths  # type: ignore
        return str(folder_paths.get_output_directory())
    except Exception:
        pass
    # fallback: config.pyのCOMFYUI_ROOTから推測
    from ..config import PLUGIN_DIR
    comfyui_root = PLUGIN_DIR.parent.parent
    output_dir = comfyui_root / "output"
    if output_dir.is_dir():
        return str(output_dir)
    return ""


async def handle_get_output_dir(request: web.Request) -> web.Response:
    """GET /api/wfm/settings/output-dir - Get gallery output directory."""
    try:
        server_settings = await asyncio.to_thread(_service.load)
        saved = server_settings.get("gallery_output_dir", "").strip()
        default_dir = await asyncio.to_thread(_get_comfyui_output_dir)
        return web.json_response({
            "current": saved or default_dir,
            "default": default_dir,
            "saved": saved,
        })
    except Exception as e:
        logger.error("Error getting output dir: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_set_output_dir(request: web.Request) -> web.Response:
    """POST /api/wfm/settings/output-dir - Save gallery output directory."""
    try:
        body = await request.json()
        new_dir = body.get("gallery_output_dir", "").strip()
        await asyncio.to_thread(_service.update, {"gallery_output_dir": new_dir})

        default_dir = await asyncio.to_thread(_get_comfyui_output_dir)
        resolved = new_dir or default_dir

        # GalleryServiceの許可ルートを更新
        from ..routes.gallery_routes import _service as gallery_service
        gallery_service.update_output_root(resolved)

        return web.json_response({
            "status": "ok",
            "current": resolved,
            "default": default_dir,
            "saved": new_dir,
        })
    except Exception as e:
        logger.error("Error setting output dir: %s", e)
        return web.json_response({"error": str(e)}, status=500)


def _load_data_file(filename: str):
    """Load a single data file, return empty dict/list if missing."""
    path = DATA_DIR / filename
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _build_export_bundle() -> dict:
    """Collect all data files into a single export bundle."""
    bundle = {"__version": 1, "__source": "ComfyUI-Workflow-Studio"}
    for filename in _DATA_FILES:
        data = _load_data_file(filename)
        if data is not None:
            bundle[filename] = data
    return bundle


async def handle_export(request: web.Request) -> web.Response:
    """GET /api/wfm/settings/export - Download all data as a single JSON bundle."""
    try:
        bundle = await asyncio.to_thread(_build_export_bundle)
        body = json.dumps(bundle, ensure_ascii=False, indent=2)
        return web.Response(
            body=body.encode("utf-8"),
            content_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="wfm-data-export.json"'},
        )
    except Exception as e:
        logger.error("Error exporting data: %s", e)
        return web.json_response({"error": str(e)}, status=500)


def _apply_import_bundle(bundle: dict) -> dict:
    """Write imported bundle back to individual data files. Returns summary."""
    summary = {"imported": [], "skipped": []}
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for filename in _DATA_FILES:
        if filename not in bundle:
            summary["skipped"].append(filename)
            continue
        try:
            path = DATA_DIR / filename
            with open(path, "w", encoding="utf-8") as f:
                json.dump(bundle[filename], f, ensure_ascii=False, indent=2)
            summary["imported"].append(filename)
        except Exception as e:
            logger.error("Import failed for %s: %s", filename, e)
            summary["skipped"].append(filename)
    return summary


async def handle_import(request: web.Request) -> web.Response:
    """POST /api/wfm/settings/import - Upload and restore a JSON bundle."""
    try:
        bundle = await request.json()
        if not isinstance(bundle, dict):
            return web.json_response({"error": "Invalid bundle format"}, status=400)
        summary = await asyncio.to_thread(_apply_import_bundle, bundle)
        return web.json_response({"status": "ok", **summary})
    except Exception as e:
        logger.error("Error importing data: %s", e)
        return web.json_response({"error": str(e)}, status=500)

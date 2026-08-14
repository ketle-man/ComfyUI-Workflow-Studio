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
    "tagger_settings.json",
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
    app.router.add_get("/api/wfm/styles", handle_get_styles)
    app.router.add_post("/api/wfm/styles", handle_create_style)
    app.router.add_put("/api/wfm/styles/{name}", handle_update_style)
    app.router.add_delete("/api/wfm/styles/{name}", handle_delete_style)


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


# エクスポートから除外するsettings.jsonのキー（APIキーなどの機密情報）
_SETTINGS_EXPORT_EXCLUDE = {"civitai_api_key"}


def _build_export_bundle() -> dict:
    """Collect all data files into a single export bundle."""
    bundle = {"__version": 1, "__source": "ComfyUI-Workflow-Studio"}
    for filename in _DATA_FILES:
        data = _load_data_file(filename)
        if data is None:
            continue
        if filename == "settings.json" and isinstance(data, dict):
            data = {k: v for k, v in data.items() if k not in _SETTINGS_EXPORT_EXCLUDE}
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


def _style_files() -> list:
    style_dir = DATA_DIR / "style"
    if not style_dir.is_dir():
        return []
    return sorted(style_dir.glob("*.json"))


def _load_styles() -> list:
    """Load all style JSON files from DATA_DIR/style/ directory.
    各エントリに定義元ファイル名を "file" として付与する（Promptタブの一覧表示・
    「このファイルへ追加」機能で使用）。"""
    styles = []
    for json_file in _style_files():
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                for entry in data:
                    if isinstance(entry, dict):
                        entry = dict(entry)
                        entry["file"] = json_file.name
                        styles.append(entry)
        except Exception as e:
            logger.warning("Failed to load style file %s: %s", json_file.name, e)
    return styles


async def handle_get_styles(request: web.Request) -> web.Response:
    """GET /api/wfm/styles - Get all styles from style directory."""
    try:
        styles = await asyncio.to_thread(_load_styles)
        return web.json_response(styles)
    except Exception as e:
        logger.error("Error loading styles: %s", e)
        return web.json_response({"error": str(e)}, status=500)


# Promptタブ「Style」サブタブでの新規作成分の保存先。既存スタイルの編集は
# 元々そのスタイルが記載されているファイルをそのまま書き換える（他ファイルへは移動しない）。
_CUSTOM_STYLE_FILENAME = "custom.json"


def _find_style(name: str):
    """名前が一致する最初のスタイルを探し、(ファイルパス, そのファイルの全データ, インデックス) を返す。
    見つからなければ None。"""
    for json_file in _style_files():
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            logger.warning("Failed to load style file %s: %s", json_file.name, e)
            continue
        if not isinstance(data, list):
            continue
        for i, entry in enumerate(data):
            if isinstance(entry, dict) and entry.get("name") == name:
                return json_file, data, i
    return None


def _write_style_file(path: Path, data: list) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


async def handle_create_style(request: web.Request) -> web.Response:
    """POST /api/wfm/styles - 新規スタイルを作成する。
    body.file を指定すると既存のそのファイルへ追記する（Promptタブの「このファイルへ追加」用、
    ファイル名はstyleディレクトリに実在するもののみ許可しパストラバーサルを防ぐ）。
    未指定ならデフォルトのcustom.jsonへ追記する。"""
    try:
        body = await request.json()
        name = (body.get("name") or "").strip()
        prompt = body.get("prompt", "") or ""
        negative_prompt = body.get("negative_prompt", "") or ""
        target_file = (body.get("file") or "").strip()
        if not name:
            return web.json_response({"error": "name is required"}, status=400)

        def _create():
            if _find_style(name) is not None:
                return "duplicate"
            style_dir = DATA_DIR / "style"
            style_dir.mkdir(parents=True, exist_ok=True)

            if target_file:
                path = next((f for f in _style_files() if f.name == target_file), None)
                if path is None:
                    return "file_not_found"
            else:
                path = style_dir / _CUSTOM_STYLE_FILENAME

            data = []
            if path.is_file():
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        loaded = json.load(f)
                    if isinstance(loaded, list):
                        data = loaded
                except Exception as e:
                    logger.warning("Failed to load %s, recreating: %s", path.name, e)
            data.append({"name": name, "prompt": prompt, "negative_prompt": negative_prompt})
            _write_style_file(path, data)
            return "ok"

        result = await asyncio.to_thread(_create)
        if result == "duplicate":
            return web.json_response({"error": f'Style "{name}" already exists'}, status=400)
        if result == "file_not_found":
            return web.json_response({"error": f'File "{target_file}" not found'}, status=400)
        return web.json_response({"ok": True})
    except Exception as e:
        logger.error("Error creating style: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_update_style(request: web.Request) -> web.Response:
    """PUT /api/wfm/styles/{name} - 既存スタイルを更新する（記載元のファイルをそのまま書き換え、リネームも可）。"""
    try:
        original_name = request.match_info.get("name", "")
        body = await request.json()
        new_name = (body.get("name") or "").strip()
        prompt = body.get("prompt", "") or ""
        negative_prompt = body.get("negative_prompt", "") or ""
        if not new_name:
            return web.json_response({"error": "name is required"}, status=400)

        def _update():
            found = _find_style(original_name)
            if found is None:
                return "not_found"
            path, data, idx = found
            if new_name != original_name and _find_style(new_name) is not None:
                return "duplicate"
            data[idx] = {"name": new_name, "prompt": prompt, "negative_prompt": negative_prompt}
            _write_style_file(path, data)
            return "ok"

        result = await asyncio.to_thread(_update)
        if result == "not_found":
            return web.json_response({"error": "Style not found"}, status=404)
        if result == "duplicate":
            return web.json_response({"error": f'Style "{new_name}" already exists'}, status=400)
        return web.json_response({"ok": True})
    except Exception as e:
        logger.error("Error updating style: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_delete_style(request: web.Request) -> web.Response:
    """DELETE /api/wfm/styles/{name} - スタイルを削除する（記載元のファイルから該当エントリのみ除去）。"""
    try:
        name = request.match_info.get("name", "")

        def _delete():
            found = _find_style(name)
            if found is None:
                return False
            path, data, idx = found
            del data[idx]
            _write_style_file(path, data)
            return True

        ok = await asyncio.to_thread(_delete)
        if not ok:
            return web.json_response({"error": "Style not found"}, status=404)
        return web.json_response({"ok": True})
    except Exception as e:
        logger.error("Error deleting style: %s", e)
        return web.json_response({"error": str(e)}, status=500)

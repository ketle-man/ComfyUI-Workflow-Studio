"""G'MIC-Qt integration API routes."""

import asyncio
import base64
import datetime
import json
import logging
import mimetypes
import os
import subprocess
import threading
import uuid
from pathlib import Path
from aiohttp import web

from ..services.settings_service import SettingsService
from ..config import DATA_DIR

logger = logging.getLogger(__name__)

_settings = SettingsService()

# Global job store
# key: job_id, value: dict {status, message, result_path, error}
_gmic_jobs = {}
_gmic_jobs_lock = threading.Lock()

def _gmic_run_gui(job_id: str, input_path: str, output_path: str, gmic_exe: str):
    """Run gmic_qt.exe in a background process/thread and wait for completion.

    G'MIC-Qt Standalone argument order: -o <output> <input>
    After OK the "filter output" window appears; closing it saves to output_path.
    """
    args = [gmic_exe, "-o", output_path, input_path]
    logger.info("[gmic] Launching: %s", " ".join(args))
    try:
        with _gmic_jobs_lock:
            _gmic_jobs[job_id]["status"] = "processing"
            _gmic_jobs[job_id]["message"] = "G'MIC GUIで編集中..."

        import time

        kwargs = {}
        if os.name == "nt":
            # Required on Windows to show the GUI window from a background process
            kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE

        proc = subprocess.Popen(args, **kwargs)
        proc.wait()

        time.sleep(0.5)

        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            with _gmic_jobs_lock:
                _gmic_jobs[job_id]["status"] = "completed"
                _gmic_jobs[job_id]["result_path"] = output_path
                _gmic_jobs[job_id]["message"] = "完了"
            logger.info("[gmic] Result saved: %s", output_path)
        else:
            raise ValueError("G'MIC GUIがキャンセルされました")
    except Exception as e:
        with _gmic_jobs_lock:
            _gmic_jobs[job_id]["status"] = "failed"
            _gmic_jobs[job_id]["error"] = str(e)
            _gmic_jobs[job_id]["message"] = f"エラー: {str(e)}"
        logger.error("[gmic] Error: %s", e)

def setup_routes(app: web.Application):
    """Register G'MIC API routes."""
    app.router.add_post("/api/wfm/gmic/open", handle_open)
    app.router.add_get("/api/wfm/gmic/status/{job_id}", handle_status)
    app.router.add_post("/api/wfm/gmic/result", handle_result)

async def handle_open(request: web.Request) -> web.Response:
    """POST /api/wfm/gmic/open - Open image in G'MIC GUI."""
    try:
        body = await request.json()
        image_b64 = body.get("image_b64", "")
        if not image_b64:
            return web.json_response({"error": "image_b64 field is required"}, status=400)

        # Retrieve setting for gmic path
        data = _settings.load()
        gmic_exe = data.get("gmic_qt_path", "")
        if not os.path.exists(gmic_exe):
            return web.json_response({
                "error": f"G'MIC executable not found at: {gmic_exe}. Please configure the path in settings."
            }, status=400)

        ext = ".png"
        if image_b64.startswith("data:"):
            header, image_b64 = image_b64.split(",", 1)
            mime = header.split(";")[0].split(":")[1]
            guessed = mimetypes.guess_extension(mime)
            if guessed:
                ext = ".jpg" if guessed == ".jpe" else guessed

        img_bytes = base64.b64decode(image_b64)

        temp_dir = Path(DATA_DIR) / "gmic_temp"
        temp_dir.mkdir(parents=True, exist_ok=True)

        now_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        input_path = str(temp_dir / f"gmic_input_{now_str}{ext}")
        output_path = str(temp_dir / f"gmic_output_{now_str}_{str(uuid.uuid4())[:8]}{ext}")

        with open(input_path, "wb") as f:
            f.write(img_bytes)

        job_id = str(uuid.uuid4())
        with _gmic_jobs_lock:
            _gmic_jobs[job_id] = {
                "status": "pending",
                "message": "G'MIC GUIを起動中...",
                "result_path": None,
                "error": None,
            }

        # Start G'MIC thread
        t = threading.Thread(
            target=_gmic_run_gui,
            args=(job_id, input_path, output_path, gmic_exe),
            daemon=True,
        )
        t.start()

        return web.json_response({"job_id": job_id, "status": "pending", "message": "起動中"})
    except Exception as e:
        logger.error("[gmic] open error: %s", e)
        return web.json_response({"error": str(e)}, status=500)

async def handle_status(request: web.Request) -> web.Response:
    """GET /api/wfm/gmic/status/{job_id} - Check job status."""
    try:
        job_id = request.match_info.get("job_id", "")
        with _gmic_jobs_lock:
            job = _gmic_jobs.get(job_id)
        if job is None:
            return web.json_response({"error": "Job not found"}, status=404)
        return web.json_response({
            "job_id": job_id,
            "status": job["status"],
            "message": job.get("message", ""),
            "result_path": job.get("result_path"),
            "error": job.get("error"),
        })
    except Exception as e:
        logger.error("[gmic] status error: %s", e)
        return web.json_response({"error": str(e)}, status=500)

async def handle_result(request: web.Request) -> web.Response:
    """POST /api/wfm/gmic/result - Get result image base64."""
    try:
        body = await request.json()
        result_path = body.get("result_path", "")
        if not result_path or not os.path.exists(result_path):
            return web.json_response({"error": f"Result file not found: {result_path}"}, status=404)

        # Path traversal guard: only allow files inside gmic_temp
        allowed_dir = (Path(DATA_DIR) / "gmic_temp").resolve()
        try:
            Path(result_path).resolve().relative_to(allowed_dir)
        except ValueError:
            return web.json_response({"error": "Access denied: path outside gmic_temp"}, status=403)

        with open(result_path, "rb") as f:
            img_bytes = f.read()

        ext = os.path.splitext(result_path)[1].lower()
        mime_map = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".bmp": "image/bmp",
            ".tiff": "image/tiff"
        }
        mime = mime_map.get(ext, "image/png")
        b64 = base64.b64encode(img_bytes).decode("ascii")
        return web.json_response({"image_b64": f"data:{mime};base64,{b64}"})
    except Exception as e:
        logger.error("[gmic] result error: %s", e)
        return web.json_response({"error": str(e)}, status=500)

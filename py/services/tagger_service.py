"""WD Tagger / DeepDanbooru / Ollama VLM 推論サービス。"""

import base64
import csv
import io
import json
import logging
import tempfile
import threading
import urllib.request
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ImageOps, PngImagePlugin

logger = logging.getLogger(__name__)

_model_lock = threading.Lock()


class TaggerService:
    def __init__(self, models_dir: Path, settings_file: Path):
        self.models_dir = models_dir
        self.settings_file = settings_file
        self._cache: dict = {}
        self._batch_state: dict = {
            "running": False, "total": 0, "done": 0, "log": [], "stop": False,
        }

    # ── 設定 ──────────────────────────────────────────────────

    def load_settings(self) -> dict:
        if self.settings_file.exists():
            try:
                with open(self.settings_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def save_settings(self, data: dict):
        self.settings_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.settings_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _effective_models_dir(self) -> Path:
        custom = self.load_settings().get("models_dir", "").strip()
        if custom:
            p = Path(custom)
            if p.is_dir():
                return p
        return self.models_dir

    # ── モデル一覧 ─────────────────────────────────────────────

    def list_models(self) -> list:
        mdir = self._effective_models_dir()
        models = []
        if not mdir.is_dir():
            return models
        for item in sorted(mdir.iterdir()):
            if not item.is_dir():
                continue
            exts = {f.suffix.lower() for f in item.iterdir() if f.is_file()}
            if ".onnx" in exts:
                models.append({"name": item.name, "type": "onnx"})
            elif ".h5" in exts:
                models.append({"name": item.name, "type": "deepdanbooru"})
        return models

    # ── モデルロード ──────────────────────────────────────────

    @staticmethod
    def _validate_model_name(name: str) -> bool:
        """パストラバーサル防止: セパレータ・NUL・相対参照を拒否"""
        return bool(name) and "/" not in name and "\\" not in name and "\x00" not in name and name not in (".", "..")

    def _load_model(self, model_name: str) -> Optional[dict]:
        if not self._validate_model_name(model_name):
            logger.error("Invalid model name rejected: %r", model_name)
            return None
        if model_name in self._cache:
            return self._cache[model_name]
        with _model_lock:
            if model_name in self._cache:
                return self._cache[model_name]
            mdir = self._effective_models_dir()
            model_dir = mdir / model_name
            if not model_dir.is_dir():
                logger.error("Model dir not found: %s", model_dir)
                return None
            files = list(model_dir.iterdir())
            onnx = next((f for f in files if f.suffix == ".onnx"), None)
            h5 = next((f for f in files if f.suffix == ".h5"), None)
            if onnx:
                return self._load_onnx(model_name, onnx, model_dir)
            if h5:
                return self._load_deepdanbooru(model_name, h5, model_dir)
            logger.error("No .onnx or .h5 in %s", model_dir)
            return None

    def _load_onnx(self, name: str, onnx_file: Path, model_dir: Path) -> Optional[dict]:
        try:
            import onnxruntime as ort
            providers = []
            try:
                import torch
                if torch.cuda.is_available():
                    providers.append("CUDAExecutionProvider")
            except ImportError:
                pass
            providers.append("CPUExecutionProvider")
            session = ort.InferenceSession(str(onnx_file), providers=providers)
            labels = self._load_labels(model_dir)
            data = {
                "session": session,
                "labels": labels,
                "input_name": session.get_inputs()[0].name,
                "input_shape": session.get_inputs()[0].shape,
                "type": "onnx",
            }
            self._cache[name] = data
            logger.info("ONNX loaded: %s (%d labels)", name, len(labels))
            return data
        except ImportError:
            logger.error("onnxruntime not installed")
            return None
        except Exception as e:
            logger.error("ONNX load error %s: %s", name, e)
            return None

    def _load_deepdanbooru(self, name: str, h5_file: Path, model_dir: Path) -> Optional[dict]:
        try:
            import tensorflow as tf
        except ImportError:
            logger.warning("TensorFlow not installed — DeepDanbooru unavailable")
            return None
        try:
            model = tf.keras.models.load_model(str(h5_file))
            labels = self._load_labels(model_dir)
            data = {"session": model, "labels": labels, "type": "deepdanbooru"}
            self._cache[name] = data
            logger.info("DeepDanbooru loaded: %s (%d labels)", name, len(labels))
            return data
        except Exception as e:
            logger.error("DeepDanbooru load error %s: %s", name, e)
            return None

    def _load_labels(self, model_dir: Path) -> list:
        for fname in ("selected_tags.csv", "tags.csv", "tags.txt", "tags-general.txt"):
            p = model_dir / fname
            if not p.exists():
                continue
            try:
                if p.suffix == ".csv":
                    with open(p, "r", encoding="utf-8-sig", newline="") as f:
                        reader = csv.reader(f)
                        next(reader, None)
                        return [row[1] for row in reader if len(row) > 1]
                else:
                    with open(p, "r", encoding="utf-8") as f:
                        return [ln.strip() for ln in f if ln.strip()]
            except Exception as e:
                logger.warning("Label load failed %s: %s", p, e)
        return []

    # ── 推論（WD Tagger / DeepDanbooru） ────────────────────

    def predict(self, image_b64: str, model_name: str, threshold: float = 0.35, char_threshold: float = 0.85) -> dict:
        img = self._decode_b64(image_b64)
        data = self._load_model(model_name)
        if data is None:
            return {"error": f"Model '{model_name}' could not be loaded"}
        try:
            if data["type"] == "deepdanbooru":
                tags = self._predict_dd(img, data, threshold, char_threshold)
            else:
                tags = self._predict_onnx(img, data, threshold, char_threshold)
            return {"tags": ", ".join(tags), "count": len(tags)}
        except Exception as e:
            logger.error("predict error: %s", e)
            return {"error": str(e)}

    def _predict_onnx(self, img: Image.Image, data: dict, thr: float, char_thr: float) -> list:
        shape = data["input_shape"]
        fmt = "NHWC"
        size = (224, 224)
        if len(shape) == 4:
            if shape[1] == 3 and isinstance(shape[2], int) and shape[2] > 0:
                fmt = "NCHW"
                size = (int(shape[3]), int(shape[2]))
            elif shape[3] == 3 and isinstance(shape[1], int) and shape[1] > 0:
                fmt = "NHWC"
                size = (int(shape[2]), int(shape[1]))

        img = ImageOps.exif_transpose(img)
        if img.mode != "RGB":
            img = img.convert("RGB")
        arr = np.array(img.resize(size, Image.Resampling.LANCZOS), dtype=np.float32) / 255.0
        if fmt == "NCHW":
            arr = arr.transpose((2, 0, 1))
        arr = np.expand_dims(arr, 0)
        preds = data["session"].run(None, {data["input_name"]: arr})[0][0]
        return self._filter_tags(preds, data["labels"], thr, char_thr)

    def _predict_dd(self, img: Image.Image, data: dict, thr: float, char_thr: float) -> list:
        img = ImageOps.exif_transpose(img)
        if img.mode != "RGB":
            img = img.convert("RGB")
        arr = np.array(img.resize((512, 512), Image.Resampling.LANCZOS), dtype=np.float32) / 255.0
        arr = np.expand_dims(arr, 0)
        preds = data["session"].predict(arr)[0]
        return self._filter_tags(preds, data["labels"], thr, char_thr)

    def _filter_tags(self, preds, labels: list, thr: float, char_thr: float) -> list:
        tags = []
        for i, score in enumerate(preds):
            if i >= len(labels):
                break
            label = labels[i]
            if float(score) >= (char_thr if label.startswith("character:") else thr):
                tags.append(label.replace("character:", ""))
        return tags

    # ── Ollama VLM ────────────────────────────────────────────

    def ollama_models(self, api_url: str) -> list:
        try:
            req = urllib.request.Request(api_url.rstrip("/") + "/api/tags")
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return sorted(m["name"] for m in data.get("models", []))
        except Exception as e:
            logger.error("ollama_models: %s", e)
            return []

    def ollama_predict(self, image_b64: str, api_url: str, model: str, prompt: str, max_tags: int = 40) -> dict:
        payload = json.dumps({
            "model": model,
            "messages": [{"role": "user", "content": prompt, "images": [image_b64]}],
            "stream": False,
            "options": {"temperature": 0.7, "num_ctx": 4096},
        }).encode("utf-8")
        try:
            req = urllib.request.Request(
                api_url.rstrip("/") + "/api/chat",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            content = data.get("message", {}).get("content", "")
            tags = [t.strip() for t in content.split(",") if t.strip()][:max_tags]
            return {"tags": ", ".join(tags), "count": len(tags)}
        except Exception as e:
            logger.error("ollama_predict: %s", e)
            return {"error": str(e)}

    # ── ファイルメタデータ書込 ────────────────────────────────

    _ALLOWED_WRITE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}

    def write_meta_to_file(self, image_path: str, tags: str) -> dict:
        path = Path(image_path).resolve()
        if path.suffix.lower() not in self._ALLOWED_WRITE_EXTS:
            return {"error": "Unsupported file type"}
        if not path.is_file():
            return {"error": f"File not found: {image_path}"}
        try:
            import piexif
        except ImportError:
            piexif = None
        try:
            with Image.open(path) as img:
                img.load()
                ext = path.suffix.lower()
                if ext in (".jpg", ".jpeg") and piexif:
                    self._write_jpeg(img, path, tags, piexif)
                elif ext == ".png":
                    self._write_png(img, path, tags)
                else:
                    self._write_sidecar(path, tags)
            return {"ok": True}
        except Exception as e:
            logger.error("write_meta: %s", e)
            return {"error": str(e)}

    def _write_jpeg(self, img: Image.Image, path: Path, tags: str, piexif):
        exif_data = img.info.get("exif")
        if exif_data:
            try:
                exif_dict = piexif.load(exif_data)
            except Exception:
                exif_dict = {"0th": {}, "Exif": {}, "1st": {}, "GPS": {}, "Interop": {}}
        else:
            exif_dict = {"0th": {}, "Exif": {}, "1st": {}, "GPS": {}, "Interop": {}}
        exif_dict["0th"][piexif.ImageIFD.ImageDescription] = tags.encode("utf-8")
        exif_bytes = piexif.dump(exif_dict)
        with tempfile.NamedTemporaryFile(delete=False, suffix=path.suffix) as tmp:
            tmp_path = Path(tmp.name)
        img.save(str(tmp_path), "JPEG", quality=95, exif=exif_bytes)
        tmp_path.replace(path)

    def _write_png(self, img: Image.Image, path: Path, tags: str):
        meta = PngImagePlugin.PngInfo()
        for k, v in img.info.items():
            if isinstance(k, str) and isinstance(v, str):
                meta.add_text(k, v)
        meta.add_text("Tags", tags)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
            tmp_path = Path(tmp.name)
        img.save(str(tmp_path), "PNG", pnginfo=meta)
        tmp_path.replace(path)

    def _write_sidecar(self, path: Path, tags: str):
        sidecar = path.with_suffix(".tags.json")
        with open(sidecar, "w", encoding="utf-8") as f:
            json.dump({"tags": tags}, f, ensure_ascii=False, indent=2)

    # ── バッチ処理 ────────────────────────────────────────────

    def batch_status(self) -> dict:
        s = self._batch_state
        return {
            "running": s["running"],
            "total": s["total"],
            "done": s["done"],
            "log": s["log"][-50:],
        }

    def batch_stop(self):
        self._batch_state["stop"] = True

    def batch_start(self, folder: str, model_name: str, threshold: float, char_threshold: float,
                    use_ollama: bool, ollama_api: str, ollama_model: str, ollama_prompt: str,
                    ollama_max_tags: int, save_db: bool, write_file: bool, write_txt: bool, db_service) -> dict:
        if self._batch_state["running"]:
            return {"error": "Batch already running"}
        folder_path = Path(folder)
        if not folder_path.is_dir():
            return {"error": f"Folder not found: {folder}"}

        exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
        files = sorted(f for f in folder_path.iterdir() if f.is_file() and f.suffix.lower() in exts)
        if not files:
            return {"error": "No image files found"}

        self._batch_state = {
            "running": True, "total": len(files), "done": 0, "log": [], "stop": False,
        }

        def _run():
            for fpath in files:
                if self._batch_state["stop"]:
                    self._batch_state["log"].append("Stopped.")
                    break
                try:
                    with Image.open(fpath) as img:
                        img.load()
                        buf = io.BytesIO()
                        img.save(buf, format="PNG")
                        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

                    interrogator_tags = ""
                    if model_name:
                        res = self.predict(b64, model_name, threshold, char_threshold)
                        interrogator_tags = res.get("tags", "")

                    vlm_tags = ""
                    if use_ollama and ollama_model:
                        res2 = self.ollama_predict(b64, ollama_api, ollama_model, ollama_prompt, ollama_max_tags)
                        vlm_tags = res2.get("tags", "")

                    all_tags = ", ".join(filter(None, [interrogator_tags, vlm_tags]))

                    if save_db:
                        db_service.save(str(fpath), interrogator_tags, vlm_tags)
                    if write_file and all_tags:
                        self.write_meta_to_file(str(fpath), all_tags)
                    if write_txt and all_tags:
                        txt_path = fpath.with_suffix(".txt")
                        with open(txt_path, "w", encoding="utf-8") as f:
                            f.write(all_tags)

                    n = len([t for t in all_tags.split(",") if t.strip()])
                    self._batch_state["log"].append(f"✓ {fpath.name}: {n} tags")
                except Exception as e:
                    self._batch_state["log"].append(f"✗ {fpath.name}: {e}")
                self._batch_state["done"] += 1

            self._batch_state["running"] = False

        threading.Thread(target=_run, daemon=True).start()
        return {"ok": True, "total": len(files)}

    # ── ユーティリティ ────────────────────────────────────────

    @staticmethod
    def _decode_b64(b64: str) -> Image.Image:
        return Image.open(io.BytesIO(base64.b64decode(b64)))

"""
EmbeddingGemma 2 ローカル実行 (onnx-community/embeddinggemma-2-ONNX)

onnxruntime + tokenizers + huggingface_hub だけで動かす(transformers の対応を待たない)。
前処理は Transformers.js の Gemma4ImageProcessor / EmbeddingGemma2Processor の移植:
  画像 -> アスペクト比維持でリサイズ(48px倍数, 最大2520パッチ) -> 16pxパッチ化 -> vision_encoder
       -> image_features を text model の <|image|> トークン位置に差し込み -> sentence_embedding(768)
モデルは初回のみ固定リポジトリからダウンロードする(約300MB, q4)。
"""
import logging
import math
import os
import threading
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

REPO_ID = "onnx-community/embeddinggemma-2-ONNX"
LOCAL_MODEL = "embeddinggemma-2"
LOCAL_DIMS = (128, 256, 512, 768)   # MRL対応次元
DEFAULT_LOCAL_DIM = 768
# 量子化精度 -> ファイル名サフィックス
DTYPES = {"q4": "_q4", "q8": "_quantized", "fp16": "_fp16", "fp32": ""}
DEFAULT_DTYPE = "q4"

_PATCH = 16
_POOL = 3
SOFT_TOKENS = (70, 140, 280)            # 画像1枚あたりのソフトトークン数(多いほど高精度・低速)
DEFAULT_SOFT = 280
_IMAGE_TOKEN = "<|image|>"
_BOI = "<|image>"
_EOI = "<image|>"

DEVICES = ("auto", "cpu", "cuda", "dml")
_PROVIDER_BY_DEVICE = {"cuda": "CUDAExecutionProvider", "dml": "DmlExecutionProvider"}

_lock = threading.Lock()
_runtime = None   # ((dtype, device, threads), _Runtime)


_opts = {"device": "auto", "threads": 0}   # 実行デバイス/CPUスレッド数(configureで更新)


def configure(device: str = "auto", threads: int = 0) -> None:
    """ローカル推論の実行設定。次回のensure_runtimeから反映(device/threads変更時はセッション再作成)。"""
    _opts["device"] = device if device in DEVICES else "auto"
    _opts["threads"] = max(0, int(threads))


def current_config() -> dict:
    return dict(_opts)


def release() -> None:
    """セッションを破棄してVRAM/RAMを解放する(インデックス作成後など)。次回利用時に再ロードされる。"""
    global _runtime
    with _lock:
        _runtime = None


def active_provider() -> str:
    """直近にロードしたセッションの実行プロバイダ(未ロードなら空)"""
    rt = _runtime[1] if _runtime else None
    return rt.providers[0].replace("ExecutionProvider", "") if rt else ""


def available_devices() -> dict:
    """onnxruntime が使える実行デバイス。GPU用ビルド(onnxruntime-gpu / -directml)が無ければcpuのみ。"""
    try:
        import onnxruntime as ort
        prov = ort.get_available_providers()
        version = ort.__version__
    except Exception:
        return {"cpu": True, "cuda": False, "dml": False, "ort_version": ""}
    return {"cpu": True, "cuda": "CUDAExecutionProvider" in prov, "dml": "DmlExecutionProvider" in prov,
            "ort_version": version, "cpu_count": os.cpu_count() or 1}


def default_threads() -> int:
    """既定のCPUスレッド数: 画像生成と同居しても邪魔になりにくいよう、コアの半分(最低1)"""
    return max(1, (os.cpu_count() or 2) // 2)


def _target_size(h: int, w: int, max_patches: int) -> tuple[int, int]:
    """Gemma4ImageProcessor の get_aspect_ratio_preserving_size"""
    factor = math.sqrt(max_patches * _PATCH ** 2 / (h * w))
    side = _POOL * _PATCH
    th = int(math.floor(factor * h / side)) * side
    tw = int(math.floor(factor * w / side)) * side
    max_side = (max_patches // _POOL ** 2) * side
    if th == 0 and tw == 0:
        raise ValueError("image too small")
    if th == 0:
        th, tw = side, min((w // h) * side, max_side)
    elif tw == 0:
        tw, th = side, min((h // w) * side, max_side)
    return th, tw


class _Runtime:
    def __init__(self, model_dir: Path, dtype: str, device: str = "auto", threads: int = 0):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        sfx = DTYPES[dtype]
        so = ort.SessionOptions()
        so.log_severity_level = 3   # CUDA使用時のMemcpy警告などを抑止
        if threads > 0:
            so.intra_op_num_threads = threads
            so.inter_op_num_threads = 1
        avail = ort.get_available_providers()
        if device in _PROVIDER_BY_DEVICE:
            providers = [_PROVIDER_BY_DEVICE[device]] if _PROVIDER_BY_DEVICE[device] in avail else []
        elif device == "cpu":
            providers = []
        else:   # auto: 使えるGPUを優先
            providers = [p for p in ("CUDAExecutionProvider", "DmlExecutionProvider") if p in avail]
        if "DmlExecutionProvider" in providers:
            # DirectMLは並列実行/メモリパターン最適化に非対応
            so.enable_mem_pattern = False
            so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        providers.append("CPUExecutionProvider")
        self.providers = providers

        def make(name):
            path = str(model_dir / "onnx" / f"{name}{sfx}.onnx")
            try:
                return ort.InferenceSession(path, so, providers=providers)
            except Exception as e:
                if providers == ["CPUExecutionProvider"]:
                    raise
                logger.warning("EmbeddingGemma2: %s failed on %s (%s); falling back to CPU", name, providers[0], e)
                self.providers = ["CPUExecutionProvider"]
                return ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])

        self.text = make("model")
        self.vision = make("vision_encoder")
        self.tok = Tokenizer.from_file(str(model_dir / "tokenizer.json"))
        self.tok.no_truncation()
        self.tok.no_padding()

    def _run_text(self, text: str, image_features: np.ndarray | None) -> np.ndarray:
        ids = np.asarray([self.tok.encode(text).ids], dtype=np.int64)
        feeds = {
            "input_ids": ids,
            "attention_mask": np.ones_like(ids),
            "image_features": image_features if image_features is not None else np.zeros((0, 512), np.float32),
            "video_features": np.zeros((0, 512), np.float32),
            "audio_features": np.zeros((0, 512), np.float32),
        }
        return self.text.run(["sentence_embedding"], feeds)[0][0]

    def embed_text(self, text: str, prefix: str) -> np.ndarray:
        return self._run_text(f"{prefix}{text.strip()}", None)

    def embed_image(self, image, soft_tokens: int = DEFAULT_SOFT) -> np.ndarray:
        from PIL import Image
        im = image.convert("RGB")
        max_patches = soft_tokens * _POOL ** 2
        th, tw = _target_size(im.height, im.width, max_patches)
        if (th, tw) != (im.height, im.width):
            im = im.resize((tw, th), Image.BICUBIC)
        arr = np.asarray(im, dtype=np.float32) * (1.0 / 255.0)          # H,W,3
        ph, pw = th // _PATCH, tw // _PATCH
        n = ph * pw
        # (pH, dy, pW, dx, C) -> (pH, pW, dy, dx, C) -> (n, 768)
        patches = arr.reshape(ph, _PATCH, pw, _PATCH, 3).transpose(0, 2, 1, 3, 4).reshape(n, _PATCH * _PATCH * 3)
        # パディング無し(n個ちょうど)で渡す: 計算量が減り、パディングは出力に影響しない
        pixel = patches[None].astype(np.float32)
        pos = np.zeros((1, n, 2), dtype=np.int64)
        rows, cols = np.divmod(np.arange(n), pw)
        pos[0, :, 0], pos[0, :, 1] = cols, rows
        feats = self.vision.run(["image_features"], {"pixel_values": pixel, "pixel_position_ids": pos})[0]
        text = f"{_BOI}{_IMAGE_TOKEN * (n // _POOL ** 2)}{_EOI}"
        return self._run_text(text, feats.astype(np.float32))


def model_dir(data_dir: Path) -> Path:
    return data_dir / "models" / LOCAL_MODEL


def is_downloaded(data_dir: Path, dtype: str = DEFAULT_DTYPE) -> bool:
    d, sfx = model_dir(data_dir), DTYPES.get(dtype, "_q4")
    need = [d / "tokenizer.json"] + [d / "onnx" / f"{n}{sfx}.onnx{e}" for n in ("model", "vision_encoder") for e in ("", "_data")]
    return all(p.exists() for p in need)


def ensure_runtime(data_dir: Path, dtype: str = DEFAULT_DTYPE, progress=None,
                   device: str | None = None, threads: int | None = None) -> _Runtime:
    """モデルをダウンロード(未取得時)してセッションを返す。dtype/device/threads変更時は作り直す。"""
    global _runtime
    if dtype not in DTYPES:
        dtype = DEFAULT_DTYPE
    device = _opts["device"] if device is None else device
    threads = _opts["threads"] if threads is None else threads
    if device not in DEVICES:
        device = "auto"
    key = (dtype, device, int(threads))
    with _lock:
        if _runtime and _runtime[0] == key:
            return _runtime[1]
        d, sfx = model_dir(data_dir), DTYPES[dtype]
        if not is_downloaded(data_dir, dtype):
            if progress:
                progress("downloading")
            from huggingface_hub import hf_hub_download
            files = ["tokenizer.json"] + [f"onnx/{n}{sfx}.onnx{e}" for n in ("model", "vision_encoder") for e in ("", "_data")]
            for f in files:
                hf_hub_download(REPO_ID, f, local_dir=str(d))
        if progress:
            progress("loading")
        _runtime = (key, _Runtime(d, dtype, device, int(threads)))
        return _runtime[1]


def _finish(vec: np.ndarray, dim: int) -> np.ndarray:
    v = np.asarray(vec, dtype=np.float32)
    if dim < v.shape[0]:
        v = v[:dim]
    n = float(np.linalg.norm(v))
    return v / n if n > 0 else v


def embed_text(data_dir: Path, text: str, dim: int, dtype: str = DEFAULT_DTYPE) -> np.ndarray:
    rt = ensure_runtime(data_dir, dtype)
    return _finish(rt.embed_text(text[:8000], "task: search result | query: "), dim)


def embed_image(data_dir: Path, image, dim: int, soft: int = DEFAULT_SOFT, dtype: str = DEFAULT_DTYPE) -> np.ndarray:
    rt = ensure_runtime(data_dir, dtype)
    return _finish(rt.embed_image(image, soft if soft in SOFT_TOKENS else DEFAULT_SOFT), dim)

"""Prompt translation service (native language -> English) via Ollama.

PLaMo 3 Translate (pfnet/plamo-3-translate-*-GGUF) models are driven with a raw
PFML3 prompt on /api/generate, which is the route the model card recommends for
Ollama. Any other Ollama model is used through /api/chat with a short
"translate into English" system prompt, so a general LLM or another MT model
can be selected too.
"""

import json
import re
import threading
import urllib.request
from collections import OrderedDict

from .settings_service import SettingsService
from .url_guard import require_backend_url, urlopen

DEFAULTS = {
    "prompt_translate_enabled": False,
    "prompt_translate_url": "http://localhost:11434",
    "prompt_translate_model": "hf.co/pfnet/plamo-3-translate-2b-GGUF:Q4_K_M",
    "prompt_translate_source_lang": "auto",
    "prompt_translate_auto": False,        # GenerateUI Generate
    "prompt_translate_auto_lab": False,    # GenerateUI Lab Run
    "prompt_translate_auto_video": False,  # Video Plan Run
    "prompt_translate_unload": True,
    # "gpu" (default) or "cpu". CPU mode keeps the model resident in system RAM:
    # no VRAM use, so it never needs unloading and skips Ollama's ~4 s reload.
    "prompt_translate_device": "gpu",
}

CPU_KEEP_ALIVE = -1  # stay loaded until Ollama restarts (about 2 GB RAM for 2B Q4_K_M)

# Suggested PLaMo 3 Translate builds (shown in Settings even before they are pulled).
PLAMO_PRESETS = [
    "hf.co/pfnet/plamo-3-translate-0.8b-GGUF:Q4_K_M",
    "hf.co/pfnet/plamo-3-translate-2b-GGUF:Q4_K_M",
    "hf.co/pfnet/plamo-3-translate-8b-GGUF:Q4_K_M",
    "hf.co/pfnet/plamo-3-translate-31b-GGUF:Q4_K_M",
]

_PLAMO_STOP = ["<|plamo:tag|>", "<|plamo:bos|>"]
_PLAMO_SPECIAL = re.compile(r"<\|plamo:[a-z_]+\|>")
_LANG_RE = re.compile(r"^[a-z]{2,3}(-[A-Za-z]{2,4})?$")
_MAX_TEXT_LEN = 4000
_MAX_TEXTS = 200

_CHAT_SYSTEM = (
    "You translate text for image generation prompts into English. "
    "Output only the English translation, with no explanations, quotes or notes. "
    "Keep proper nouns, numbers and any ASCII text unchanged."
)

_cache: "OrderedDict[tuple, str]" = OrderedDict()
_CACHE_MAX = 1024
_cache_lock = threading.Lock()

_settings = SettingsService()


def get_config():
    data = _settings.load()
    cfg = {k: data.get(k, v) for k, v in DEFAULTS.items()}
    cfg["prompt_translate_url"] = (cfg["prompt_translate_url"] or DEFAULTS["prompt_translate_url"]).rstrip("/")
    cfg["prompt_translate_model"] = cfg["prompt_translate_model"] or DEFAULTS["prompt_translate_model"]
    return cfg


def is_plamo(model: str) -> bool:
    return "plamo" in (model or "").lower()


def build_pfml3(text: str, target_lang: str = "en", source_lang: str = "") -> str:
    """Build a PFML3 translation prompt (BOS is added by llama.cpp/Ollama)."""
    src = _PLAMO_SPECIAL.sub("", text)
    src_attr = f"<|plamo:key|>lang<|plamo:val|>{source_lang}" if source_lang else ""
    return (
        "<|plamo:tag|>dataset<|plamo:msg|>translation"
        f"<|plamo:tag|>input{src_attr}<|plamo:msg|>{src}"
        f"<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>{target_lang}<|plamo:msg|>"
    )


def _post_json(url: str, payload: dict, timeout: float):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _num_predict(text: str) -> int:
    # CJK -> English roughly doubles-to-triples the token count; leave headroom.
    return max(64, min(2048, len(text) * 4))


def _device_options(device):
    return {"num_gpu": 0} if device == "cpu" else {}


def _translate_one(base_url, model, text, source_lang, keep_alive, device="gpu"):
    dev = _device_options(device)
    if is_plamo(model):
        data = _post_json(f"{base_url}/api/generate", {
            "model": model,
            "prompt": build_pfml3(text, "en", source_lang),
            "raw": True,
            "stream": False,
            "keep_alive": keep_alive,
            "options": {"temperature": 0, "num_predict": _num_predict(text), "stop": _PLAMO_STOP, **dev},
        }, timeout=180)
        out = data.get("response", "")
    else:
        data = _post_json(f"{base_url}/api/chat", {
            "model": model,
            "messages": [
                {"role": "system", "content": _CHAT_SYSTEM},
                {"role": "user", "content": text},
            ],
            "stream": False,
            "think": False,
            "keep_alive": keep_alive,
            "options": {"temperature": 0, "num_predict": _num_predict(text), **dev},
        }, timeout=180)
        out = (data.get("message") or {}).get("content", "")
    out = _PLAMO_SPECIAL.sub("", out)
    return out.strip()


def unload(base_url: str, model: str):
    try:
        _post_json(f"{base_url}/api/generate", {"model": model, "keep_alive": 0}, timeout=15)
    except Exception:
        pass


def translate_texts(texts, model=None, source_lang=None):
    """Translate each string in ``texts`` into English. Blocking (run in a thread).

    Returns (translations, cached_count). Identical inputs are served from a
    bounded cache keyed by (model, source_lang, text).
    """
    if not isinstance(texts, list) or len(texts) > _MAX_TEXTS:
        raise ValueError(f"texts must be a list of at most {_MAX_TEXTS} strings")
    cfg = get_config()
    base_url = require_backend_url(cfg["prompt_translate_url"])
    model = (model or cfg["prompt_translate_model"]).strip()
    src = (source_lang if source_lang is not None else cfg["prompt_translate_source_lang"]) or "auto"
    src = "" if src == "auto" else src
    if src and not _LANG_RE.match(src):
        raise ValueError("invalid source language")

    device = "cpu" if cfg.get("prompt_translate_device") == "cpu" else "gpu"
    keep_alive = CPU_KEEP_ALIVE if device == "cpu" else "5m"

    results = []
    cached = 0
    used_model = False
    for raw in texts:
        text = str(raw or "")[:_MAX_TEXT_LEN]
        if not text.strip():
            results.append(text)
            continue
        key = (model, src, text)
        with _cache_lock:
            hit = _cache.get(key)
            if hit is not None:
                _cache.move_to_end(key)
        if hit is not None:
            results.append(hit)
            cached += 1
            continue
        out = _translate_one(base_url, model, text, src, keep_alive, device)
        used_model = True
        with _cache_lock:
            _cache[key] = out
            _cache.move_to_end(key)
            while len(_cache) > _CACHE_MAX:
                _cache.popitem(last=False)
        results.append(out)

    if used_model and device == "gpu" and cfg.get("prompt_translate_unload", True):
        # Free VRAM for the image model that usually runs right after.
        unload(base_url, model)
    return results, cached


def warmup():
    """Load the translation model ahead of the first translation (CPU mode).

    In CPU mode the model is kept resident, so loading it once in the background
    when GenerateUI opens hides Ollama's ~4 s startup from the first translation.
    Returns False when there is nothing to do.
    """
    cfg = get_config()
    if not cfg.get("prompt_translate_enabled") or cfg.get("prompt_translate_device") != "cpu":
        return False
    base_url = require_backend_url(cfg["prompt_translate_url"])
    model = cfg["prompt_translate_model"]
    # A request without a prompt only loads the model; the options decide CPU placement.
    _post_json(f"{base_url}/api/generate", {
        "model": model,
        "keep_alive": CPU_KEEP_ALIVE,
        "options": _device_options("cpu"),
    }, timeout=180)
    return True


def list_models():
    cfg = get_config()
    base_url = require_backend_url(cfg["prompt_translate_url"])
    req = urllib.request.Request(f"{base_url}/api/tags")
    with urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return [m.get("name") for m in data.get("models", []) if m.get("name")]

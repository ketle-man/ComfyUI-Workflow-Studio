"""Prompt translation service (native language -> English or another language) via Ollama.

PLaMo 3 Translate (pfnet/plamo-3-translate-*-GGUF) models are driven with a raw
PFML3 prompt on /api/generate, which is the route the model card recommends for
Ollama. Any other Ollama model is used through /api/chat with a short
"translate into <language>" system prompt, so a general LLM or another MT model
can be selected too.

Two entry points:
- translate_texts(): each string is translated as a whole.
- translate_prompt_texts(): prompt-aware. Only the pieces that contain non-ASCII
  letters are sent to the model; prompt syntax such as commas, (weights:1.2),
  [ ], {a|b}, <lora:...>, __wildcards__, embedding:name and BREAK/AND is kept,
  and optionally the text inside 「」『』“”"" (text to be drawn in the image).
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

CPU_KEEP_ALIVE = -1  # stay loaded until Ollama restarts (about 2.7 GB RAM for 2B Q4_K_M)

# Version of the HTTP API offered to other front-ends (Comic Creator). Bump when the
# /api/wfm/translate/prompt contract changes; clients feature-detect with it.
API_VERSION = 1

# Suggested PLaMo 3 Translate builds (shown in Settings even before they are pulled).
PLAMO_PRESETS = [
    "hf.co/pfnet/plamo-3-translate-0.8b-GGUF:Q4_K_M",
    "hf.co/pfnet/plamo-3-translate-2b-GGUF:Q4_K_M",
    "hf.co/pfnet/plamo-3-translate-8b-GGUF:Q4_K_M",
    "hf.co/pfnet/plamo-3-translate-31b-GGUF:Q4_K_M",
]

_PLAMO_STOP = ["<|plamo:tag|>", "<|plamo:bos|>"]
_PLAMO_SPECIAL = re.compile(r"<\|plamo:[a-z_]+\|>")
_MAX_TEXTS = 200
# One model call gets at most this many characters; longer text is split at line
# breaks, then at sentence ends, and the translations are joined again.
_CHUNK_LEN = 1000
# Hard limit for one request (all texts together). Above it the request is rejected
# instead of being cut silently.
_MAX_TOTAL_LEN = 30000

# PLaMo 3 Translate languages (model card "Supported Languages"), code -> English name.
LANGUAGES = {
    "en": "English", "ja": "Japanese", "zh-hans": "Simplified Chinese",
    "zh-hant": "Traditional Chinese", "ko": "Korean", "ar": "Arabic", "az": "Azerbaijani",
    "be": "Belarusian", "bg": "Bulgarian", "bn": "Bengali", "ca": "Catalan", "ceb": "Cebuano",
    "de": "German", "es": "Spanish", "et": "Estonian", "eu": "Basque", "fa": "Persian",
    "fr": "French", "gu": "Gujarati", "he": "Hebrew", "hi": "Hindi", "hr": "Croatian",
    "hu": "Hungarian", "hy": "Armenian", "id": "Indonesian", "it": "Italian", "jv": "Javanese",
    "ka": "Georgian", "kk": "Kazakh", "km": "Khmer", "lt": "Lithuanian", "lv": "Latvian",
    "ml": "Malayalam", "mr": "Marathi", "ms": "Malay", "my": "Burmese", "ne": "Nepali",
    "nl": "Dutch", "pa": "Punjabi", "pl": "Polish", "ru": "Russian", "si": "Sinhala",
    "sk": "Slovak", "sl": "Slovenian", "sr": "Serbian", "sw": "Swahili", "ta": "Tamil",
    "te": "Telugu", "th": "Thai", "tl": "Tagalog", "ur": "Urdu", "uz": "Uzbek", "vi": "Vietnamese",
}
_LANG_ALIASES = {
    "zh": "zh-hans", "zh-cn": "zh-hans", "zh-sg": "zh-hans", "zh-tw": "zh-hant",
    "zh-hk": "zh-hant", "zh-mo": "zh-hant",
}
# Targets whose script puts no space between sentences.
_NO_SPACE_LANGS = {"ja", "zh-hans", "zh-hant", "th", "km", "my"}

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


def normalize_lang(code, allow_auto=False, field="language"):
    """Canonical PLaMo language code ("zh" -> "zh-hans"). "" means auto-detect."""
    c = str(code or "").strip().lower().replace("_", "-")
    if not c or c == "auto":
        if allow_auto:
            return ""
        raise ValueError(f"{field} is required")
    c = _LANG_ALIASES.get(c, c)
    if c not in LANGUAGES:
        raise ValueError(f"unsupported {field}: {code}")
    return c


def _chat_system(target_lang):
    name = LANGUAGES.get(target_lang, "English")
    return (
        f"You translate text for image generation prompts into {name}. "
        f"Output only the {name} translation, with no explanations, quotes or notes. "
        "Keep proper nouns, numbers and any ASCII text unchanged."
    )


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
    # Chunks are at most _CHUNK_LEN characters, so the cap is not reached in practice.
    return max(64, min(4096, len(text) * 4))


def _device_options(device):
    return {"num_gpu": 0} if device == "cpu" else {}


def _translate_one(base_url, model, text, source_lang, keep_alive, device="gpu", target_lang="en"):
    dev = _device_options(device)
    if is_plamo(model):
        data = _post_json(f"{base_url}/api/generate", {
            "model": model,
            "prompt": build_pfml3(text, target_lang, source_lang),
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
                {"role": "system", "content": _chat_system(target_lang)},
                {"role": "user", "content": text},
            ],
            "stream": False,
            "think": False,
            "keep_alive": keep_alive,
            "options": {"temperature": 0, "num_predict": _num_predict(text), **dev},
        }, timeout=180)
        out = (data.get("message") or {}).get("content", "")
    if data.get("done_reason") == "length":
        # The output was cut at num_predict; half a translation would be silent data loss.
        raise RuntimeError("translation output reached the token limit (text too long)")
    out = _PLAMO_SPECIAL.sub("", out)
    return out.strip()


def unload(base_url: str, model: str):
    try:
        _post_json(f"{base_url}/api/generate", {"model": model, "keep_alive": 0}, timeout=15)
    except Exception:
        pass


# ------------------------------------------------------------
# Translation session (settings, cache, chunking, unload)
# ------------------------------------------------------------

_SENTENCE_END = re.compile(r"(?<=[。．！？!?.])\s*")


def _chunks(text):
    """Split long text into [(chunk, separator_after)] of at most _CHUNK_LEN characters.

    Splits at line breaks first, then at sentence ends. The separator is the line
    break(s) that followed the chunk, "" when a chunk was closed only for length, or
    " " for a sentence break (the caller applies the target language's spacing).
    A single sentence longer than _CHUNK_LEN raises ValueError rather than being cut.
    """
    result = []
    parts = re.split(r"(\n+)", text)
    buf, buf_brk = "", ""
    for k in range(0, len(parts), 2):
        line = parts[k]
        brk = parts[k + 1] if k + 1 < len(parts) else ""
        if len(line) > _CHUNK_LEN:
            if buf:
                result.append((buf, buf_brk))
                buf, buf_brk = "", ""
            cur = ""
            for sent in (x for x in _SENTENCE_END.split(line) if x):
                if len(sent) > _CHUNK_LEN:
                    raise ValueError(
                        f"a sentence is longer than {_CHUNK_LEN} characters; add line breaks to split it")
                if cur and len(cur) + len(sent) > _CHUNK_LEN:
                    result.append((cur, " "))
                    cur = ""
                cur += sent
            if cur:
                result.append((cur, brk))
            continue
        if buf and len(buf) + len(buf_brk) + len(line) > _CHUNK_LEN:
            result.append((buf, buf_brk))
            buf, buf_brk = "", ""
        buf = buf + buf_brk + line if buf else line
        buf_brk = brk
    if buf or buf_brk:
        result.append((buf, buf_brk))
    return result


def _check_total(texts):
    total = sum(len(str(t or "")) for t in texts)
    if total > _MAX_TOTAL_LEN:
        raise ValueError(f"text is too long ({total} characters, limit {_MAX_TOTAL_LEN})")


class _Session:
    """One translation request: resolved settings, cache lookups, chunking, and the
    VRAM unload (GPU mode) after the last model call."""

    def __init__(self, model=None, source_lang=None, target_lang="en"):
        cfg = get_config()
        self.cfg = cfg
        self.base_url = require_backend_url(cfg["prompt_translate_url"])
        self.model = (model or cfg["prompt_translate_model"]).strip()
        src = source_lang if source_lang is not None else cfg["prompt_translate_source_lang"]
        self.src = normalize_lang(src, allow_auto=True, field="source language")
        self.tgt = normalize_lang(target_lang or "en", field="target language")
        self.device = "cpu" if cfg.get("prompt_translate_device") == "cpu" else "gpu"
        self.keep_alive = CPU_KEEP_ALIVE if self.device == "cpu" else "5m"
        self.cached = 0
        self.used_model = False

    def _one(self, text):
        key = (self.model, self.src, self.tgt, text)
        with _cache_lock:
            hit = _cache.get(key)
            if hit is not None:
                _cache.move_to_end(key)
        if hit is not None:
            self.cached += 1
            return hit
        out = _translate_one(self.base_url, self.model, text, self.src, self.keep_alive,
                             self.device, self.tgt)
        self.used_model = True
        with _cache_lock:
            _cache[key] = out
            _cache.move_to_end(key)
            while len(_cache) > _CACHE_MAX:
                _cache.popitem(last=False)
        return out

    def translate(self, text):
        """Translate one string; whitespace-only strings are returned unchanged."""
        text = str(text or "")
        if not text.strip():
            return text
        if len(text) <= _CHUNK_LEN:
            return self._one(text)
        sentence_sep = "" if self.tgt in _NO_SPACE_LANGS else " "
        out = []
        for chunk, sep in _chunks(text):
            out.append(self._one(chunk) if chunk.strip() else chunk)
            out.append(sentence_sep if sep == " " else sep)
        return "".join(out)

    def finish(self):
        if self.used_model and self.device == "gpu" and self.cfg.get("prompt_translate_unload", True):
            # Free VRAM for the image model that usually runs right after.
            unload(self.base_url, self.model)


def _check_texts(texts):
    if not isinstance(texts, list) or len(texts) > _MAX_TEXTS:
        raise ValueError(f"texts must be a list of at most {_MAX_TEXTS} strings")
    _check_total(texts)


def translate_texts(texts, model=None, source_lang=None, target_lang="en"):
    """Translate each string in ``texts`` as a whole (no prompt-syntax handling).

    Blocking (run in a thread). Returns (translations, cached_count). Identical inputs
    are served from a bounded cache keyed by (model, source_lang, target_lang, text).
    """
    _check_texts(texts)
    sess = _Session(model, source_lang, target_lang)
    try:
        return [sess.translate(t) for t in texts], sess.cached
    finally:
        sess.finish()


# ------------------------------------------------------------
# Prompt-aware translation
# ------------------------------------------------------------

# Spans that are never translated: prompt syntax and delimiters.
_PROTECTED_RE = re.compile(
    r"(?<![A-Za-z0-9_])(?:BREAK|AND)(?![A-Za-z0-9_])"
    r"|<[^<>\n]*>"
    r"|__[^\s_]\S*?__"
    r"|embedding:[^\s,()\[\]{}|]+"
    r"|:\s*-?\d+(?:\.\d+)?"
    r"|[,\n()\[\]{}|]"
)
# Text meant to be drawn in the image: 「」 『』 “” "" (one line, no nesting).
_QUOTE_RE = re.compile(r'「[^「」\n]*」|『[^『』\n]*』|“[^“”\n]*”|"[^"\n]*"')
# Placeholder for a quoted span while the prompt is split (private-use characters,
# which contain no delimiter and are not letters).
_PH_RE = re.compile("(\\d+)")
_PH_SPLIT_RE = re.compile("(\\d+)")
_TOKEN_RE = re.compile(r"QT(\d+)(?!\d)")


def needs_translation(text):
    """True when ``text`` contains a non-ASCII letter (CJK, Cyrillic, accented Latin, ...)."""
    return any(ord(c) > 127 and c.isalpha() for c in text or "")


def split_prompt(text):
    """Split a prompt into [{"text", "translate"}]; joining every "text" gives back the input."""
    pieces = []
    last = 0
    for m in _PROTECTED_RE.finditer(text):
        if m.start() > last:
            pieces.append((text[last:m.start()], False))
        pieces.append((m.group(0), True))
        last = m.end()
    if last < len(text):
        pieces.append((text[last:], False))
    return [{"text": t, "translate": (not keep) and needs_translation(t)} for t, keep in pieces]


def _rebuild(source, translated):
    """Keep the surrounding whitespace of a piece and tidy the model output for prompt use."""
    core = source.strip()
    lead = source[:len(source) - len(source.lstrip())]
    trail = source[len(source.rstrip()):]
    out = re.sub(r"\s*\n+\s*", " ", translated or "").strip()
    # A tag such as "赤いドレス" should not become "Red dress." — drop the final period
    # unless the source itself was a full sentence.
    if not re.search(r"[。．.!?！？]$", core):
        out = re.sub(r"[.。]+$", "", out)
    # "少女、(" -> "girl, (" rather than "girl,(": an English comma needs a space after it.
    if not trail and re.search(r"[,;:]$", out):
        out += " "
    return lead + out + trail


class _Quotes:
    """Swap quoted spans for placeholders so prompt splitting never cuts inside them."""

    def __init__(self, text, enabled):
        self.items = []
        if not enabled:
            self.text = text
            return

        def sub(m):
            self.items.append(m.group(0))
            return f"{len(self.items) - 1}"

        self.text = _QUOTE_RE.sub(sub, text)

    def restore(self, s):
        return _PH_RE.sub(lambda m: self.items[int(m.group(1))], s) if self.items else s


def _translate_piece(sess, quotes, core):
    """Translate one prompt piece; quoted spans inside it go to the model as tokens."""
    ids = [int(x) for x in _PH_RE.findall(core)]
    if not ids:
        return sess.translate(core)
    # Send the sentence whole with each quote's content replaced by a token (『QT0』) so
    # the words around it are translated naturally, then put the original content back.
    def to_token(m):
        q = quotes.items[int(m.group(1))]
        return f"{q[0]}QT{m.group(1)}{q[-1]}"

    out = sess.translate(_PH_RE.sub(to_token, core))
    found = [int(x) for x in _TOKEN_RE.findall(out)]
    if sorted(found) == sorted(ids):
        return _TOKEN_RE.sub(lambda m: quotes.items[int(m.group(1))][1:-1], out)
    # The model dropped or repeated a token: translate the text around each quote on its
    # own and keep the quotes exactly as written.
    res = []
    for part in _PH_SPLIT_RE.split(core):
        if _PH_RE.fullmatch(part):
            res.append(quotes.restore(part))
        elif needs_translation(part):
            res.append(_rebuild(part, sess.translate(part.strip())))
        else:
            res.append(part)
    return "".join(res)


def translate_prompt_texts(texts, model=None, source_lang=None, target_lang="en", protect_quotes=False):
    """Translate prompts, keeping prompt syntax (and with ``protect_quotes`` the text
    inside 「」『』“”""). Blocking. Returns (translations, cached_count)."""
    _check_texts(texts)
    sess = _Session(model, source_lang, target_lang)
    try:
        results = []
        for raw in texts:
            text = str(raw or "")
            if not needs_translation(text):
                results.append(text)
                continue
            quotes = _Quotes(text, protect_quotes)
            out = []
            for p in split_prompt(quotes.text):
                if not p["translate"] or not needs_translation(_PH_RE.sub("", p["text"])):
                    out.append(quotes.restore(p["text"]))
                    continue
                translated = _translate_piece(sess, quotes, p["text"].strip())
                out.append(_rebuild(p["text"], translated))
            results.append("".join(out))
        return results, sess.cached
    finally:
        sess.finish()


def warmup(ignore_enabled=False):
    """Load the translation model ahead of the first translation (CPU mode).

    In CPU mode the model is kept resident, so loading it once in the background
    when GenerateUI opens hides Ollama's ~4 s startup from the first translation.
    ``ignore_enabled`` is for other front-ends (Comic Creator) that keep their own
    on/off switch. Returns False when there is nothing to do.
    """
    cfg = get_config()
    if cfg.get("prompt_translate_device") != "cpu":
        return False
    if not ignore_enabled and not cfg.get("prompt_translate_enabled"):
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

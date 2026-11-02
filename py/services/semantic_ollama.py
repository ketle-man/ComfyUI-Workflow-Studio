"""
EmbeddingGemma 2 を Ollama で実行する (Gallery セマンティック検索のローカルバックエンド)

画像は /api/embed に input=[{"image": <base64>}] で渡す(images フィールドは無視されテキスト扱いになる)。
740m(テキスト+画像+音声) と 440m(テキスト+画像) は同じ重みで同じベクトルを返すため、
インデックスにはタグを区別せず LOCAL_MODEL として記録する。270m/570m は画像非対応なので選択肢に入れない。
接続先は url_guard で検査する(既定はループバックのみ)。
"""
import base64
import io
import json
import logging
import threading
import time
import urllib.error
import urllib.request

import numpy as np

from . import url_guard

logger = logging.getLogger(__name__)

LOCAL_MODEL = "embeddinggemma-2"    # インデックス(npz)に記録するモデル名
LOCAL_DIMS = (128, 256, 512, 768)   # MRL対応次元
DEFAULT_LOCAL_DIM = 768
TAGS = ("embeddinggemma-2:740m", "embeddinggemma-2:440m")
DEFAULT_TAG = TAGS[0]
# :latest は 740m と同じモデル(parent_model 740m-q8_0)。740m が無ければ代わりに使う
_ALIASES = {"embeddinggemma-2:740m": ("embeddinggemma-2:latest", "embeddinggemma-2")}
DEFAULT_URL = "http://localhost:11434"
QUERY_PREFIX = "task: search result | query: "
BATCH = 4                 # 1リクエストで送る画像数(1枚ずつより約1.8倍速い)
_TIMEOUT = 120
_RETRIES = 5              # Ollama内部の接続切断(HTTP 400 "forcibly closed"等)は再試行で回復する
_TAGS_TTL = 5.0           # /api/tags の結果をキャッシュする秒数(進捗ポーリングのたびに問い合わせない)

_opts = {"url": DEFAULT_URL, "tag": DEFAULT_TAG}
_tags_cache = {"at": 0.0, "url": "", "names": None, "error": ""}
_lock = threading.Lock()


class OllamaError(Exception):
    """code: ollama_unreachable / ollama_model_missing / local_error"""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def configure(url: str = DEFAULT_URL, tag: str = DEFAULT_TAG) -> None:
    """接続先とモデルサイズを設定する。許可されないURLは ValueError(url_guard.HINT)。"""
    url = url_guard.require_backend_url((url or "").strip() or DEFAULT_URL)
    with _lock:
        _opts["url"] = url
        _opts["tag"] = tag if tag in TAGS else DEFAULT_TAG
        _tags_cache["at"] = 0.0


def current_config() -> dict:
    return dict(_opts)


def _post(path: str, body: dict, timeout: float = _TIMEOUT) -> dict:
    base = url_guard.require_backend_url(_opts["url"])
    req = urllib.request.Request(base + path, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json"})
    with url_guard.urlopen(req, timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def _http_message(e: urllib.error.HTTPError) -> str:
    try:
        return json.loads(e.read().decode("utf-8")).get("error", "") or str(e.reason)
    except Exception:
        return str(e.reason)


def _transient(code: int, msg: str) -> bool:
    low = msg.lower()
    if "failed to load image" in low:
        return False   # 壊れた画像。再試行しても直らない
    if code >= 500:
        return True
    return code == 400 and any(k in low for k in ("forcibly closed", "wsarecv", "connection", "eof"))


def installed_tags(force: bool = False) -> tuple[list[str] | None, str]:
    """(インストール済みモデル名, エラー)。接続できなければ (None, エラー文)。"""
    now = time.time()
    with _lock:
        c = dict(_tags_cache)
        url = _opts["url"]
    if not force and c["url"] == url and now - c["at"] < _TAGS_TTL:
        return c["names"], c["error"]
    names, err = None, ""
    try:
        base = url_guard.require_backend_url(url)
        with url_guard.urlopen(urllib.request.Request(base + "/api/tags"), 3) as res:
            data = json.loads(res.read().decode("utf-8"))
        names = [m.get("name") or m.get("model") or "" for m in data.get("models", [])]
    except Exception as e:
        err = str(getattr(e, "reason", e))
    with _lock:
        _tags_cache.update(at=now, url=url, names=names, error=err)
    return names, err


def _resolve(names: list[str], tag: str) -> str:
    """実際に呼ぶモデル名。未インストールなら空文字"""
    for cand in (tag,) + _ALIASES.get(tag, ()):
        if cand in names:
            return cand
    return ""


def status() -> dict:
    names, err = installed_tags()
    tag = _opts["tag"]
    out = {"url": _opts["url"], "tag": tag, "tags": list(TAGS), "reachable": names is not None, "error": err,
           "installed": {t: bool(names and _resolve(names, t)) for t in TAGS}}
    out["ready"] = bool(out["reachable"] and out["installed"][tag])
    return out


def _model_name() -> str:
    names, err = installed_tags()
    if names is None:
        raise OllamaError("ollama_unreachable", f"{_opts['url']}: {err}")
    name = _resolve(names, _opts["tag"])
    if not name:
        raise OllamaError("ollama_model_missing", _opts["tag"])
    return name


def _embed(inputs: list) -> list[np.ndarray]:
    model = _model_name()
    last = ""
    for attempt in range(_RETRIES + 1):
        try:
            data = _post("/api/embed", {"model": model, "input": inputs})
            embs = data.get("embeddings") or []
            if len(embs) != len(inputs):
                raise OllamaError("local_error", f"expected {len(inputs)} embeddings, got {len(embs)}")
            return [np.asarray(e, dtype=np.float32) for e in embs]
        except urllib.error.HTTPError as e:
            msg = _http_message(e)
            last = f"HTTP {e.code}: {msg}"
            if e.code == 404:
                with _lock:
                    _tags_cache["at"] = 0.0   # 削除された可能性があるので次回は問い合わせ直す
                raise OllamaError("ollama_model_missing", model)
            if not _transient(e.code, msg) or attempt >= _RETRIES:
                raise OllamaError("local_error", last)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = str(getattr(e, "reason", e))
            if attempt >= _RETRIES:
                raise OllamaError("ollama_unreachable", f"{_opts['url']}: {last}")
        time.sleep(min(4.0, 0.5 * (2 ** attempt)))
    raise OllamaError("local_error", last)


def _finish(vec: np.ndarray, dim: int) -> np.ndarray:
    v = vec[:dim] if dim < vec.shape[0] else vec
    n = float(np.linalg.norm(v))
    return v / n if n > 0 else v


def _image_b64(image) -> str:
    buf = io.BytesIO()
    image.convert("RGB").save(buf, "JPEG", quality=88)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def embed_text(text: str, dim: int) -> np.ndarray:
    return embed_texts([text], dim)[0]


def embed_texts(texts: list[str], dim: int) -> list[np.ndarray]:
    """検索文(クエリ)として複数のテキストをまとめて埋め込む"""
    return [_finish(v, dim) for v in _embed([QUERY_PREFIX + t[:8000].strip() for t in texts])]


def embed_images(images: list, dim: int) -> list[np.ndarray]:
    """PIL画像(RGB)のリストをまとめて埋め込む。1枚でも読めないとリクエスト全体が失敗する。"""
    return [_finish(v, dim) for v in _embed([{"image": _image_b64(im)} for im in images])]


def release() -> None:
    """モデルをVRAMから外す(インデックス作成後)。次回利用時にOllamaが再ロードする。"""
    try:
        names, _ = installed_tags()
        name = _resolve(names or [], _opts["tag"])
        if name:
            _post("/api/embed", {"model": name, "input": [], "keep_alive": 0}, timeout=30)
    except Exception as e:
        logger.debug("semantic_ollama: release failed: %s", e)

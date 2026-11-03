"""
TagSpace Service - WFSのデータを EmbeddingGemma 2 の同じベクトル空間に置き、3Dに投影する

  カード : ImagePrompt(ws_image_prompt)の画像+プロンプト。ベクトルは Gallery セマンティック索引の画像ベクトル
  タグ   : ImagePrompt/ワイルドカード/Tagger DB/Promptライブラリの文をカンマ等で分解した語。Ollamaでテキスト埋め込み
  背景   : Gallery 索引から間引いた画像(位置関係を見るための点群)

画像とテキストのベクトルは同じ空間でも別の塊に分かれる(modality gap)ため、
画像群とテキスト群をそれぞれの平均で中心化してからPCAで3軸を求める。
タグのベクトルはタグ文字列をキーに tagspace_tags.npz へキャッシュする(740m/440mは同じベクトル)。
"""
import json
import logging
import re
import sqlite3
import threading
import time
from collections import Counter
from pathlib import Path

import numpy as np
import yaml

from . import semantic_ollama as ollama
from .semantic_service import LOCAL_MODEL, SemanticError

logger = logging.getLogger(__name__)

DEFAULT_MAX_TAGS = 2000
MAX_TAGS_LIMIT = 6000
ALL_TAGS_LIMIT = 20000        # 「全タグ」(max_tags=0)でも超えない上限(ワイルドカード込み・出現1回以上だと約5万種になるため)
MIN_COUNT_LIMIT = 10
DEFAULT_BG = 4000
BG_LIMIT = 20000
_EMBED_BATCH = 32
_RADIUS = 10.0                # 3D座標の広がり(98パーセンタイル半径)
_IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
_VAULT_THUMB_DIRS = {"thumbnails", "thumbnails_option2"}
SOURCES = ("image_prompt", "gallery", "tagger_auto", "tagger", "prompt_library", "wildcard")
TAGGER_SCOPES = ("background", "all")   # Tagger補完の対象: 背景の点のみ / プロンプトの無い全画像
_TAGGER_MAX_SIDE = 1024      # Taggerに渡す前の長辺上限(PixAIの1008pxより少し大きく)
_TAGGER_SAVE_EVERY = 100
_PROMPT_MAX = 4000            # キャッシュするプロンプトの最大文字数
# Positive をたどるときに文字列として拾う入力名(CLIPTextEncode系・Qwen/Flux系のエンコーダー・文字列ノード)
_TEXT_INPUTS = {"text", "prompt", "positive", "text_g", "text_l", "clip_l", "t5xxl", "string", "value",
                "user_prompt", "system_prompt_text"}
_SKIP_INPUTS = {"negative", "negative_prompt", "neg"}

_SPLIT = re.compile(r"[,\n|{}]+|\bBREAK\b")
_WEIGHT = re.compile(r":\s*-?\d+(?:\.\d+)?\s*$")
_DP_WEIGHT = re.compile(r"^\s*\d+(?:\.\d+)?\s*::")     # Dynamic Prompts の "2::option"
_JSON_KEY = re.compile(r'"\s*:')                     # "key": の形
_MODEL_FILE = re.compile(r"\.(safetensors|ckpt|pt|pth|bin|gguf)\b", re.I)
_HAS_WORD = re.compile(r"[a-z぀-ヿ一-鿿]")
_STOP = {"break", "and", "or", "the", "a", "an"}


def normalize_tag(raw: str) -> str:
    """プロンプトの断片をタグとして正規化する。タグにならなければ空文字"""
    s = _DP_WEIGHT.sub("", raw).strip()
    if not s or "<" in s or "__" in s or s.lower().startswith(("embedding:", "rating:")):
        return ""
    # プロンプトに埋め込まれたJSON(MOSS-Image のレイアウト指定 bbox / 文字入れ text 等)の断片と、モデルのファイル名
    if _JSON_KEY.search(s) or _MODEL_FILE.search(s):
        return ""
    s = s.replace('"', "")   # 分割で片側だけ残った引用符(blue" / "pink)
    s = s.replace("\\(", "\x00").replace("\\)", "\x01")   # danbooruのエスケープ括弧は残す
    for _ in range(3):
        while len(s) > 1 and s[0] in "([" and s[-1] in ")]":
            s = s[1:-1].strip()
        s = _WEIGHT.sub("", s).strip(" \"'.;")
    if s.count("(") != s.count(")") or s.count("[") != s.count("]"):
        s = re.sub(r"[()\[\]]", "", s).strip()   # 分割で片側だけ残った括弧
    s = s.replace("\x00", "(").replace("\x01", ")").replace("_", " ")
    s = re.sub(r"\s+", " ", s).lower()
    if len(s) < 2 or len(s) > 40 or len(s.split()) > 5 or s in _STOP or not _HAS_WORD.search(s):
        return ""
    if s.startswith(("embedding:", "rating:")):   # (embedding:xxx:1) のように括弧を外してから現れる形
        return ""
    return s


def split_tags(text: str) -> list[str]:
    return [t for t in (normalize_tag(p) for p in _SPLIT.split(text or "")) if t]


# C実装があれば使う(4万行のワイルドカードYAMLで 1.9秒 → 0.2秒)。どちらも任意のPythonオブジェクトは作らない
_YAML_LOADER = getattr(yaml, "CSafeLoader", yaml.SafeLoader)


def _yaml_leaves(node):
    """YAMLを読んだ値から文字列の葉だけを取り出す(キーはカテゴリ名なので除く。
    yes/no 等が真偽値・数値に変換された葉はタグにならないので除く)"""
    if isinstance(node, dict):
        for v in node.values():
            yield from _yaml_leaves(v)
    elif isinstance(node, list):
        for v in node:
            yield from _yaml_leaves(v)
    elif isinstance(node, str):
        yield node


def _wildcard_yaml_texts(text: str):
    """ワイルドカードYAMLの項目。`- >-` 等のブロックスカラー(複数行)やエスケープもYAMLとして解釈する。
    YAMLとして読めないファイルは、従来どおり "- " で始まる行を1項目として読む"""
    try:
        yield from _yaml_leaves(yaml.load(text, Loader=_YAML_LOADER))
    except yaml.YAMLError:
        for ln in text.splitlines():
            s = ln.strip()
            if s.startswith("- "):
                yield s[2:].strip().strip("\"'")


def _upstream_texts(graph: dict, node_id: str, seen: set) -> list[str]:
    """API形式グラフで node_id から上流へたどり、プロンプト用の文字列入力を集める(negative側はたどらない)"""
    if node_id in seen or node_id not in graph:
        return []
    seen.add(node_id)
    out = []
    for key, val in ((graph[node_id] or {}).get("inputs") or {}).items():
        lk = key.lower()
        if lk in _SKIP_INPUTS:
            continue
        if isinstance(val, str):
            if lk in _TEXT_INPUTS and val.strip():
                out.append(val.strip())
        elif isinstance(val, list) and len(val) == 2 and isinstance(val[0], (str, int)):
            out += _upstream_texts(graph, str(val[0]), seen)
    return out


def positive_prompt(graph: dict) -> str:
    """API形式グラフの Positive プロンプト。サンプラー/ガイダーの positive(無ければ BasicGuider等の conditioning)から上流をたどる"""
    if not isinstance(graph, dict) or "nodes" in graph:
        return ""
    texts = []
    for node in graph.values():
        ins = (node or {}).get("inputs") if isinstance(node, dict) else None
        if not isinstance(ins, dict):
            continue
        link = ins.get("positive")
        if not isinstance(link, list) and "negative" not in ins:
            link = ins.get("conditioning") if "guider" in str(node.get("class_type", "")).lower() else None
        if isinstance(link, list) and link:
            texts += _upstream_texts(graph, str(link[0]), set())
    return ", ".join(dict.fromkeys(texts))[:_PROMPT_MAX]


class TagSpaceService:
    def __init__(self, data_dir: Path, gallery_service, semantic_service, tagger_service=None):
        self.data_dir = data_dir
        self.gallery = gallery_service
        self.semantic = semantic_service
        self.tagger = tagger_service
        self._tag_file = data_dir / "tagspace_tags.npz"
        self._space_file = data_dir / "tagspace_space.json"
        self._mat_file = data_dir / "tagspace_space.npz"
        self._prompt_file = data_dir / "tagspace_prompts.json"   # Gallery画像の Positive {path: [size, mtime, text]}
        self._tagger_file = data_dir / "tagspace_tagger.json"    # Tagger補完 {path: [size, mtime, model, tags]}
        self._lock = threading.RLock()
        self._tag_cache: dict[str, np.ndarray] | None = None   # tag -> 768次元(正規化済み)
        self._space: dict | None = None      # 3D表示用データ(JSON)
        self._mat: dict | None = None        # 近傍/検索用 {ids, vecs, kinds, mean_img, mean_txt, axes, scale}
        self._job = self._idle_job()
        self._cancel = threading.Event()

    @staticmethod
    def _idle_job() -> dict:
        return {"running": False, "phase": "", "done": 0, "total": 0, "note": "", "error": "", "error_code": "",
                "finished": False, "cancelled": False}

    # ── 状態 ───────────────────────────────────────────────

    def status(self) -> dict:
        space = self._load_space()
        meta = (space or {}).get("meta") or {}
        return {"job": dict(self._job), "built": bool(space), "meta": meta, "tagger_models": self.tagger_models(),
                "index": self.semantic.index_info(), "ollama": ollama.status(),
                "semantic_job": self.semantic.job_status()}

    def space(self) -> dict:
        space = self._load_space()
        if not space:
            raise SemanticError("tagspace_not_built")
        return space

    def _load_space(self) -> dict | None:
        with self._lock:
            if self._space is None and self._space_file.exists():
                try:
                    self._space = json.loads(self._space_file.read_text(encoding="utf-8"))
                except Exception as e:
                    logger.warning("TagSpace: failed to load space: %s", e)
            return self._space

    def _load_mat(self) -> dict:
        with self._lock:
            if self._mat is None:
                if not self._mat_file.exists():
                    raise SemanticError("tagspace_not_built")
                with np.load(self._mat_file, allow_pickle=False) as z:
                    self._mat = {k: z[k] for k in z.files}
                m = self._mat
                m["ids"] = [str(x) for x in m["ids"]]
                m["pos"] = {i: n for n, i in enumerate(m["ids"])}
                m["bg_ids"] = [str(x) for x in m["bg_ids"]] if "bg_ids" in m else []
                m["bg_pos"] = {i: n for n, i in enumerate(m["bg_ids"])}
                # 中心化して正規化したブロック(カード/タグ/背景画像)。近傍・検索のたびに作り直さない
                n_img = int(m["n_img"])
                m["blocks"] = {
                    "card": (m["ids"][:n_img], self._centered(m["vecs"][:n_img], m["mean_img"])),
                    "tag": (m["ids"][n_img:], self._centered(m["vecs"][n_img:], m["mean_txt"])),
                    "image": (m["bg_ids"], self._centered(m["bg_vecs"], m["mean_img"]) if "bg_vecs" in m
                              else np.zeros((0, m["vecs"].shape[1]), np.float32)),
                }
            return self._mat

    # ── 材料の収集 ─────────────────────────────────────────

    def _cards(self) -> tuple[list[dict], list]:
        """ImagePromptの画像のうちプロンプトを持つもの。戻り値: (カード, スキャン結果)"""
        root = self.gallery.get_image_prompt_root()
        if not root:
            return [], []
        base = Path(root).resolve()
        entries = [e for e in self.gallery._scan_folder_recursive(base) if Path(e[1]).suffix.lower() in _IMG_EXTS]
        cards, used = [], []
        for name, ap, size, mtime in entries:
            prompt = self.gallery._read_sidecar_prompt(Path(ap))
            if not prompt:
                continue
            rel = Path(ap).resolve().relative_to(base).parts[:-1]
            folders = [p for p in rel if p.lower() not in _VAULT_THUMB_DIRS]
            # tags: 詳細パネルでタグを選んで空間検索するための、プロンプトを分解したタグ(Gallery点の tags と同じ正規化)
            cards.append({"id": ap, "kind": "card", "label": name.split(".")[0], "prompt": prompt.strip(),
                          "tags": list(dict.fromkeys(split_tags(prompt))),
                          "category": "/".join(folders[-2:]) or "(root)", "group": folders[0] if folders else "(root)"})
            used.append((name, ap, size, mtime))
        return cards, used

    def _wildcard_texts(self):
        folder = self.data_dir / "wildcard"
        if not folder.is_dir():
            return
        for p in sorted(folder.rglob("*")):
            if p.suffix.lower() == ".txt":
                lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
                yield from (ln for ln in lines if ln.strip() and not ln.lstrip().startswith("#"))
            elif p.suffix.lower() in (".yaml", ".yml"):
                yield from _wildcard_yaml_texts(p.read_text(encoding="utf-8", errors="replace"))

    def _tagger_texts(self):
        db = self.data_dir / "tagger.db"
        if not db.exists():
            return
        try:
            with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as conn:
                for (text,) in conn.execute("SELECT all_tags FROM images"):
                    if text:
                        yield text
        except sqlite3.Error as e:
            logger.warning("TagSpace: tagger.db read failed: %s", e)

    def _library_texts(self):
        f = self.data_dir / "prompts.json"
        try:
            items = json.loads(f.read_text(encoding="utf-8")) if f.exists() else []
        except Exception:
            items = []
        for it in items if isinstance(items, list) else []:
            if isinstance(it, dict) and it.get("text"):
                yield str(it["text"])

    def tagger_models(self) -> list[str]:
        """Tagger補完に使えるモデル(ONNX)"""
        if self.tagger is None:
            return []
        try:
            return [m["name"] for m in self.tagger.list_models() if m.get("type") == "onnx"]
        except Exception:
            return []

    def _tagger_fill(self, targets: list[tuple[str, int, float]], model: str) -> dict[str, str]:
        """targets([(path, size, mtime)])を Tagger でタグ付けする。同じ画像・同じモデルならキャッシュを使う。
        中止しても、それまでの結果はキャッシュに残す。戻り値: {path: "tag, tag, ..."}"""
        from PIL import Image
        try:
            cache = json.loads(self._tagger_file.read_text(encoding="utf-8")) if self._tagger_file.exists() else {}
        except Exception as e:
            logger.warning("TagSpace: failed to load tagger cache: %s", e)
            cache = {}
        job = self._job
        job.update(phase="tagger", done=0, total=len(targets), note="")
        out: dict[str, str] = {}
        dirty = 0
        was_loaded = model in getattr(self.tagger, "_cache", {})

        def save():
            tmp = self._tagger_file.with_suffix(".tmp.json")
            tmp.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            tmp.replace(self._tagger_file)

        try:
            for n, (path, size, mtime) in enumerate(targets):
                if self._cancel.is_set():
                    break
                hit = cache.get(path)
                if hit and hit[0] == size and abs(hit[1] - mtime) < 1e-3 and hit[2] == model:
                    text = hit[3]
                else:
                    try:
                        with Image.open(path) as im:
                            im.seek(0)
                            im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
                            im.thumbnail((_TAGGER_MAX_SIDE, _TAGGER_MAX_SIDE), Image.LANCZOS)
                        text = ", ".join(self.tagger.tag_image(im, model))
                    except RuntimeError as e:      # モデルを読み込めない: 続けても全件失敗する
                        raise SemanticError("tagspace_tagger_model", str(e))
                    except Exception as e:
                        logger.warning("TagSpace: tagger failed for %s: %s", path, e)
                        text = ""
                    cache[path] = [size, mtime, model, text]
                    dirty += 1
                    if not job["note"]:
                        job["note"] = self.tagger.model_provider(model)
                    if dirty >= _TAGGER_SAVE_EVERY:
                        save()
                        dirty = 0
                if text:
                    out[path] = text
                job["done"] = n + 1
        finally:
            if dirty:
                save()
            if not was_loaded:   # 補完のために読み込んだモデルはメモリから外す(Taggerタブで使用中のものは残す)
                getattr(self.tagger, "_cache", {}).pop(model, None)
        return out

    def _gallery_prompts(self, exclude_prefix: str) -> dict[str, str]:
        """索引済み Gallery 画像の Positive プロンプト。(size, mtime)が同じならキャッシュを使う"""
        try:
            cache = json.loads(self._prompt_file.read_text(encoding="utf-8")) if self._prompt_file.exists() else {}
        except Exception as e:
            logger.warning("TagSpace: failed to load prompt cache: %s", e)
            cache = {}
        entries = [e for e in self.semantic.indexed_entries(exclude_prefix)
                   if Path(e[0]).suffix.lower() in _IMG_EXTS]
        job = self._job
        job.update(phase="prompts", done=0, total=len(entries))
        new_cache, out = {}, {}
        for n, (path, size, mtime) in enumerate(entries):
            if self._cancel.is_set():
                break
            if not Path(path).is_file():
                continue   # 索引作成後に削除された画像(キャッシュにも残さない)
            hit = cache.get(path)
            if hit and hit[0] == size and abs(hit[1] - mtime) < 1e-3:
                text = hit[2]
            else:
                try:
                    text = positive_prompt(self.gallery._extract_embedded_workflow(path, prefer="prompt"))
                except Exception:
                    text = ""
            new_cache[path] = [size, mtime, text]
            if text:
                out[path] = text
            if n % 200 == 0:
                job["done"] = n
        job["done"] = len(entries)
        if not self._cancel.is_set():   # 中止時は途中までの結果で既存のキャッシュを上書きしない
            tmp = self._prompt_file.with_suffix(".tmp.json")
            tmp.write_text(json.dumps(new_cache, ensure_ascii=False), encoding="utf-8")
            tmp.replace(self._prompt_file)
        return out

    def collect_tags(self, cards: list[dict], max_tags: int, gallery_texts=(), tagger_texts=(),
                     min_count: int = 1, wildcard: bool = True) -> tuple[list[dict], int]:
        """全ソースのタグを数えて上位 max_tags 件を返す(max_tags=0 は全件、ただし ALL_TAGS_LIMIT まで)。
        ソースごとに出現数の多い順に並べ、ソースを順番に1件ずつ取る(数の多いGalleryだけで埋まらないように)。
        出現数は「そのタグを含む文の数」で数え、全出典の合計が min_count 未満のタグは候補から外す。
        wildcard=False ならワイルドカードは材料にしない(ワイルドカードにしか無い語がタグの種類の大半を占めるため)。
        戻り値: (タグ, 候補数)"""
        per_src: dict[str, Counter] = {s: Counter() for s in SOURCES}
        feeds = {"image_prompt": (c["prompt"] for c in cards), "gallery": iter(gallery_texts),
                 "tagger_auto": iter(tagger_texts), "tagger": self._tagger_texts(), "prompt_library": self._library_texts(),
                 "wildcard": self._wildcard_texts() if wildcard else iter(())}
        for src, texts in feeds.items():
            for text in texts:
                per_src[src].update(set(split_tags(text)))
        total = Counter()
        for c in per_src.values():
            total.update(c)
        ok = {t for t, n in total.items() if n >= min_count}
        if not max_tags:
            max_tags = ALL_TAGS_LIMIT
        queues = {s: sorted((t for t in c if t in ok), key=lambda t, c=c: (-c[t], t)) for s, c in per_src.items()}
        queues = {s: q for s, q in queues.items() if q}
        picked: list[str] = []
        seen: set = set()
        pos = dict.fromkeys(queues, 0)
        while len(picked) < max_tags and queues:
            for src in list(queues):
                q, i = queues[src], pos[src]
                while i < len(q) and q[i] in seen:
                    i += 1
                if i >= len(q):
                    del queues[src]
                    continue
                pos[src] = i + 1
                seen.add(q[i])
                picked.append(q[i])
                if len(picked) >= max_tags:
                    break
        return [{"id": f"tag:{t}", "kind": "tag", "label": t,
                 "count": total[t],
                 "sources": [s for s in SOURCES if per_src[s][t]]} for t in picked], len(ok)

    # ── タグベクトルのキャッシュ ───────────────────────────

    def _tag_vectors(self) -> dict[str, np.ndarray]:
        with self._lock:
            if self._tag_cache is None:
                self._tag_cache = {}
                if self._tag_file.exists():
                    try:
                        with np.load(self._tag_file, allow_pickle=False) as z:
                            self._tag_cache = dict(zip((str(t) for t in z["tags"]), z["vecs"]))
                    except Exception as e:
                        logger.warning("TagSpace: failed to load tag cache: %s", e)
            return self._tag_cache

    def _save_tag_vectors(self) -> None:
        with self._lock:
            cache = self._tag_cache or {}
            if not cache:
                return
            tags = list(cache)
            tmp = self._tag_file.with_suffix(".tmp.npz")
            np.savez(tmp, tags=np.array(tags), vecs=np.stack([cache[t] for t in tags]).astype(np.float32))
            tmp.replace(self._tag_file)

    # ── 構築ジョブ ─────────────────────────────────────────

    def start_build(self, max_tags: int, bg: int, tagger_model: str = "", tagger_scope: str = "background",
                    min_count: int = 1, wildcard: bool = True) -> None:
        """max_tags=0 は全タグ(ALL_TAGS_LIMIT まで)"""
        if tagger_model and tagger_model not in self.tagger_models():
            raise SemanticError("tagspace_tagger_model", tagger_model)
        if tagger_scope not in TAGGER_SCOPES:
            tagger_scope = TAGGER_SCOPES[0]
        with self._lock:
            if self._job["running"]:
                raise SemanticError("already_running")
            info = self.semantic.index_info()
            if info["count"] and info["model"] != LOCAL_MODEL:
                raise SemanticError("tagspace_index_model", info["model"])
            st = ollama.status()
            if not st["reachable"]:
                raise SemanticError("ollama_unreachable", f"{st['url']}: {st['error']}")
            if not st["ready"]:
                raise SemanticError("ollama_model_missing", st["tag"])
            self._cancel.clear()
            self._job = self._idle_job()
            self._job.update(running=True, phase="cards")
        max_tags = 0 if int(max_tags) == 0 else max(50, min(int(max_tags), MAX_TAGS_LIMIT))
        args = (max_tags, max(0, min(int(bg), BG_LIMIT)), tagger_model, tagger_scope,
                max(1, min(int(min_count), MIN_COUNT_LIMIT)), bool(wildcard))
        threading.Thread(target=self._run_build, args=args, daemon=True).start()

    def cancel(self) -> None:
        self._cancel.set()
        if self._job.get("phase") == "index":
            self.semantic.cancel()

    def _run_build(self, max_tags: int, bg: int, tagger_model: str = "", tagger_scope: str = "background",
                   min_count: int = 1, wildcard: bool = True) -> None:
        job = self._job
        try:
            cards, entries = self._cards()
            root = self.gallery.get_image_prompt_root() or ""

            # 1. カード画像を Gallery 索引に追加(未索引/更新分のみ)
            if entries and not self._cancel.is_set():
                job.update(phase="index", done=0, total=0)
                info = self.semantic.index_info()
                dim = info["dim"] or ollama.DEFAULT_LOCAL_DIM
                self.semantic.start_index(root, True, "missing", LOCAL_MODEL, dim)
                while True:
                    sj = self.semantic.job_status()
                    job.update(done=sj["done"] + sj["failed"], total=sj["total"])
                    if not sj["running"]:
                        break
                    time.sleep(0.5)
                if sj.get("error_code") in ("ollama_unreachable", "ollama_model_missing"):
                    raise SemanticError(sj["error_code"], sj["error"])
            card_vecs = self.semantic.vectors_for(entries)
            cards = [c for c in cards if c["id"] in card_vecs]
            dim = self.semantic.index_info()["dim"] or ollama.DEFAULT_LOCAL_DIM

            # 2. Gallery 画像の Positive プロンプト(タグの材料と、背景点のタグ)
            prefix = Path(root).resolve().as_posix().rstrip("/") + "/" if root else ""
            gallery_prompts = self._gallery_prompts(prefix)
            if self._cancel.is_set():
                return

            # 3. 背景の Gallery 画像(Tagger補完の対象を決めるため、タグ集めより先に選ぶ)
            bg_paths, bg_mat = self.semantic.sample_vectors(bg + bg // 4, exclude_prefix=prefix) if bg else ([], None)
            if bg_paths:   # 索引作成後に削除された画像を除く(多めに取って bg 件に詰める)
                keep = [i for i, p in enumerate(bg_paths) if Path(p).is_file()][:bg]
                bg_paths, bg_mat = [bg_paths[i] for i in keep], bg_mat[keep]

            # 4. Tagger補完: プロンプト由来のタグが無い画像
            tagger_tags: dict[str, str] = {}
            if tagger_model:
                stamps = {p: (sz, mt) for p, sz, mt in self.semantic.indexed_entries(prefix)}
                pool = bg_paths if tagger_scope == "background" else [
                    p for p in stamps if Path(p).suffix.lower() in _IMG_EXTS and Path(p).is_file()]
                targets = [(p, *stamps[p]) for p in pool
                           if p in stamps and Path(p).suffix.lower() in _IMG_EXTS
                           and not split_tags(gallery_prompts.get(p, ""))]
                tagger_tags = self._tagger_fill(targets, tagger_model)
                if self._cancel.is_set():
                    return

            # 5. タグを集めて未キャッシュ分を埋め込む
            job.update(phase="tags", done=0, total=0, note="")
            tags, available = self.collect_tags(cards, max_tags, gallery_prompts.values(), tagger_tags.values(),
                                                min_count, wildcard)
            cache = self._tag_vectors()
            todo = [t["label"] for t in tags if t["label"] not in cache]
            job.update(total=len(todo))
            for i in range(0, len(todo), _EMBED_BATCH):
                if self._cancel.is_set():
                    break
                batch = todo[i:i + _EMBED_BATCH]
                try:
                    vecs = ollama.embed_texts(batch, ollama.DEFAULT_LOCAL_DIM)
                except ollama.OllamaError as e:
                    raise SemanticError(e.code, str(e))
                with self._lock:
                    cache.update(zip(batch, vecs))
                job["done"] = min(len(todo), i + len(batch))
                if (i // _EMBED_BATCH) % 20 == 19:
                    self._save_tag_vectors()
            self._save_tag_vectors()
            tags = [t for t in tags if t["label"] in cache]
            if self._cancel.is_set():
                return

            # 6. 投影
            job.update(phase="project", done=0, total=0)
            self._project(cards, card_vecs, tags, cache, dim, bg_paths, bg_mat, gallery_prompts, tagger_tags,
                          tagger_model if tagger_tags else "",
                          {"max_tags": max_tags, "min_count": min_count, "wildcard": wildcard, "tags_available": available})
        except SemanticError as e:
            job["error_code"], job["error"] = e.code, str(e)
        except Exception as e:
            logger.exception("TagSpace: build failed")
            job["error_code"], job["error"] = "tagspace_error", str(e)
        finally:
            ollama.release()
            job["running"] = False
            job["finished"] = True
            job["cancelled"] = self._cancel.is_set() and not job["error_code"]
            job["phase"] = ""

    @staticmethod
    def _unit(m: np.ndarray, dim: int) -> np.ndarray:
        m = m[:, :dim].astype(np.float32)
        n = np.linalg.norm(m, axis=1, keepdims=True)
        return m / np.where(n > 0, n, 1)

    def _project(self, cards, card_vecs, tags, cache, dim, bg_paths, bg_mat, gallery_prompts=None,
                 tagger_tags=None, tagger_model: str = "", tag_meta: dict | None = None) -> None:
        img = self._unit(np.stack([card_vecs[c["id"]] for c in cards]), dim) if cards else np.zeros((0, dim), np.float32)
        txt = self._unit(np.stack([cache[t["label"]] for t in tags]), dim) if tags else np.zeros((0, dim), np.float32)
        if len(img) + len(txt) < 3:
            raise SemanticError("tagspace_too_few")
        bg_u = self._unit(bg_mat, dim) if bg_mat is not None and len(bg_mat) else np.zeros((0, dim), np.float32)
        # modality gap 対策: 画像とテキスト(タグ)をそれぞれの平均で中心化する。
        # 画像側はカードの平均を使う(数の多い背景画像の平均だとカードがタグの塊から離れて見えるため)
        img_ref = img if len(img) else bg_u
        mean_img = img_ref.mean(axis=0) if len(img_ref) else np.zeros(dim, np.float32)
        mean_txt = txt.mean(axis=0) if len(txt) else np.zeros(dim, np.float32)
        x = np.concatenate([img - mean_img, txt - mean_txt])
        _, s, vt = np.linalg.svd(x, full_matrices=False)
        axes = vt[:3].astype(np.float32)
        var = (s ** 2) / max(float((s ** 2).sum()), 1e-12)
        pts = x @ axes.T
        r98 = float(np.percentile(np.linalg.norm(pts, axis=1), 98)) or 1.0
        scale = _RADIUS / r98

        def xyz(m):
            return [[round(float(v), 3) for v in row] for row in (m @ axes.T * scale)]

        n_img = len(img)
        for c, p in zip(cards, xyz(img - mean_img)):
            c["xyz"] = p
        for t, p in zip(tags, xyz(txt - mean_txt)):
            t["xyz"] = p
        gp, tt = gallery_prompts or {}, tagger_tags or {}

        def bg_item(path, pos):
            """背景点にはその画像のタグを持たせる(クリックでまとめて追加)。プロンプト由来が無ければTagger補完"""
            tags_p = list(dict.fromkeys(split_tags(gp.get(path, ""))))
            if tags_p:
                return {"id": path, "xyz": pos, "tags": tags_p, "tag_src": "prompt"}
            tags_t = list(dict.fromkeys(split_tags(tt.get(path, ""))))
            return {"id": path, "xyz": pos, "tags": tags_t, "tag_src": "tagger" if tags_t else ""}

        bg_items = [bg_item(p, q) for p, q in zip(bg_paths, xyz(bg_u - mean_img))] if len(bg_u) else []
        meta = {"built_at": time.strftime("%Y-%m-%d %H:%M:%S"), "cards": len(cards), "tags": len(tags),
                "background": len(bg_items), "gallery_prompts": len(gp), "tagger_images": len(tt),
                "tagger_model": tagger_model, "dim": dim, "model": LOCAL_MODEL,
                "explained": [round(float(v), 4) for v in var[:3]], **(tag_meta or {})}
        space = {"meta": meta, "cards": cards, "tags": tags, "background": bg_items}

        ids = [c["id"] for c in cards] + [t["id"] for t in tags]
        tmp = self._mat_file.with_suffix(".tmp.npz")
        np.savez(tmp, ids=np.array(ids), vecs=np.concatenate([img, txt]).astype(np.float32),
                 n_img=np.array(n_img), mean_img=mean_img.astype(np.float32), mean_txt=mean_txt.astype(np.float32),
                 axes=axes, scale=np.array(scale, dtype=np.float32),
                 bg_ids=np.array([b["id"] for b in bg_items]), bg_vecs=bg_u.astype(np.float32))
        tmp.replace(self._mat_file)
        tmp_json = self._space_file.with_suffix(".tmp.json")
        tmp_json.write_text(json.dumps(space, ensure_ascii=False), encoding="utf-8")
        tmp_json.replace(self._space_file)
        with self._lock:
            self._space, self._mat = space, None

    # ── 近傍・検索 ─────────────────────────────────────────

    @staticmethod
    def _centered(vecs: np.ndarray, mean: np.ndarray) -> np.ndarray:
        c = vecs - mean
        return c / np.maximum(np.linalg.norm(c, axis=1, keepdims=True), 1e-6)

    def _rank(self, m: dict, q: np.ndarray, k: int, exclude: str = "", kind: str = "") -> list[dict]:
        """カード・タグ・画像は別々の塊なので、それぞれの平均を引いた空間で比べる(=中心化コサイン)。
        同じ種類どうしの方がスコアが高く出るため、種類ごとに順位付けして交互に並べる。
        Gallery画像(背景点)を候補に入れるのは、Gallery画像を基準にしたときだけ。"""
        qc = q - (m["mean_txt"] if kind == "tag" else m["mean_img"])
        qn = qc / max(float(np.linalg.norm(qc)), 1e-6)
        order = {"tag": ("tag", "card"), "card": ("card", "tag"), "image": ("image", "tag", "card")}[kind or "card"]
        lists = []
        for name in order:
            ids, mat = m["blocks"][name]
            if not len(ids):
                lists.append([])
                continue
            scores = mat @ qn
            top = np.argsort(-scores)[:k + 1]
            lists.append([{"id": ids[i], "score": round(float(scores[i]), 4)} for i in top if ids[i] != exclude][:k])
        out = []
        for i in range(k):
            out += [lst[i] for lst in lists if i < len(lst)]
            if len(out) >= k:
                break
        return out[:k]

    def neighbors(self, item_id: str, k: int) -> list[dict]:
        m = self._load_mat()
        i = m["pos"].get(item_id)
        if i is not None:
            kind = "card" if i < int(m["n_img"]) else "tag"
            return self._rank(m, m["vecs"][i], k, exclude=item_id, kind=kind)
        j = m["bg_pos"].get(item_id)
        if j is not None:
            return self._rank(m, m["bg_vecs"][j], k, exclude=item_id, kind="image")
        raise SemanticError("tagspace_unknown_item", item_id)

    def search(self, query: str, k: int) -> dict:
        query = (query or "").strip()[:500]
        if not query:
            return {"probe": None, "matches": []}
        m = self._load_mat()
        dim = m["vecs"].shape[1]
        try:
            q = ollama.embed_text(query, ollama.DEFAULT_LOCAL_DIM)
        except ollama.OllamaError as e:
            raise SemanticError(e.code, str(e))
        q = self._unit(q[None, :], dim)[0]
        p = (q - m["mean_txt"]) @ m["axes"].T * float(m["scale"])
        return {"probe": [round(float(v), 3) for v in p], "matches": self._rank(m, q, k, kind="tag")}

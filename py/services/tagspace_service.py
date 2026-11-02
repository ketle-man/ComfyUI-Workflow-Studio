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

from . import semantic_ollama as ollama
from .semantic_service import LOCAL_MODEL, SemanticError

logger = logging.getLogger(__name__)

DEFAULT_MAX_TAGS = 2000
MAX_TAGS_LIMIT = 6000
DEFAULT_BG = 4000
BG_LIMIT = 20000
_EMBED_BATCH = 32
_RADIUS = 10.0                # 3D座標の広がり(98パーセンタイル半径)
_IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
_VAULT_THUMB_DIRS = {"thumbnails", "thumbnails_option2"}
SOURCES = ("image_prompt", "gallery", "tagger", "prompt_library", "wildcard")
_PROMPT_MAX = 4000            # キャッシュするプロンプトの最大文字数
# Positive をたどるときに文字列として拾う入力名(CLIPTextEncode系・Qwen/Flux系のエンコーダー・文字列ノード)
_TEXT_INPUTS = {"text", "prompt", "positive", "text_g", "text_l", "clip_l", "t5xxl", "string", "value",
                "user_prompt", "system_prompt_text"}
_SKIP_INPUTS = {"negative", "negative_prompt", "neg"}

_SPLIT = re.compile(r"[,\n|{}]+|\bBREAK\b")
_WEIGHT = re.compile(r":\s*-?\d+(?:\.\d+)?\s*$")
_DP_WEIGHT = re.compile(r"^\s*\d+(?:\.\d+)?\s*::")     # Dynamic Prompts の "2::option"
_HAS_WORD = re.compile(r"[a-z぀-ヿ一-鿿]")
_STOP = {"break", "and", "or", "the", "a", "an"}


def normalize_tag(raw: str) -> str:
    """プロンプトの断片をタグとして正規化する。タグにならなければ空文字"""
    s = _DP_WEIGHT.sub("", raw).strip()
    if not s or "<" in s or "__" in s or s.lower().startswith(("embedding:", "rating:")):
        return ""
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
    return s


def split_tags(text: str) -> list[str]:
    return [t for t in (normalize_tag(p) for p in _SPLIT.split(text or "")) if t]


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
    def __init__(self, data_dir: Path, gallery_service, semantic_service):
        self.data_dir = data_dir
        self.gallery = gallery_service
        self.semantic = semantic_service
        self._tag_file = data_dir / "tagspace_tags.npz"
        self._space_file = data_dir / "tagspace_space.json"
        self._mat_file = data_dir / "tagspace_space.npz"
        self._prompt_file = data_dir / "tagspace_prompts.json"   # Gallery画像の Positive {path: [size, mtime, text]}
        self._lock = threading.RLock()
        self._tag_cache: dict[str, np.ndarray] | None = None   # tag -> 768次元(正規化済み)
        self._space: dict | None = None      # 3D表示用データ(JSON)
        self._mat: dict | None = None        # 近傍/検索用 {ids, vecs, kinds, mean_img, mean_txt, axes, scale}
        self._job = self._idle_job()
        self._cancel = threading.Event()

    @staticmethod
    def _idle_job() -> dict:
        return {"running": False, "phase": "", "done": 0, "total": 0, "error": "", "error_code": "",
                "finished": False, "cancelled": False}

    # ── 状態 ───────────────────────────────────────────────

    def status(self) -> dict:
        space = self._load_space()
        meta = (space or {}).get("meta") or {}
        return {"job": dict(self._job), "built": bool(space), "meta": meta,
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
                self._mat["ids"] = [str(x) for x in self._mat["ids"]]
                self._mat["pos"] = {i: n for n, i in enumerate(self._mat["ids"])}
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
            cards.append({"id": ap, "kind": "card", "label": name.split(".")[0], "prompt": prompt.strip(),
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
                for ln in p.read_text(encoding="utf-8", errors="replace").splitlines():
                    s = ln.strip()
                    if s.startswith("- "):
                        yield s[2:].strip().strip("\"'")

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

    def collect_tags(self, cards: list[dict], max_tags: int, gallery_texts=()) -> list[dict]:
        """全ソースのタグを数えて上位 max_tags 件を返す。
        ソースごとに出現数の多い順に並べ、ソースを順番に1件ずつ取る(数の多いGalleryだけで埋まらないように)。
        出現数は「そのタグを含む文の数」で数える。"""
        per_src: dict[str, Counter] = {s: Counter() for s in SOURCES}
        feeds = {"image_prompt": (c["prompt"] for c in cards), "gallery": iter(gallery_texts),
                 "tagger": self._tagger_texts(), "prompt_library": self._library_texts(),
                 "wildcard": self._wildcard_texts()}
        for src, texts in feeds.items():
            for text in texts:
                per_src[src].update(set(split_tags(text)))
        queues = {s: sorted(c, key=lambda t, c=c: (-c[t], t)) for s, c in per_src.items() if c}
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
                 "count": sum(per_src[s][t] for s in SOURCES),
                 "sources": [s for s in SOURCES if per_src[s][t]]} for t in picked]

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

    def start_build(self, max_tags: int, bg: int) -> None:
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
        args = (max(50, min(int(max_tags), MAX_TAGS_LIMIT)), max(0, min(int(bg), BG_LIMIT)))
        threading.Thread(target=self._run_build, args=args, daemon=True).start()

    def cancel(self) -> None:
        self._cancel.set()
        if self._job.get("phase") == "index":
            self.semantic.cancel()

    def _run_build(self, max_tags: int, bg: int) -> None:
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

            # 3. タグを集めて未キャッシュ分を埋め込む
            job.update(phase="tags", done=0, total=0)
            tags = self.collect_tags(cards, max_tags, gallery_prompts.values())
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

            # 4. 背景の Gallery 画像
            job.update(phase="project", done=0, total=0)
            bg_paths, bg_mat = self.semantic.sample_vectors(bg + bg // 4, exclude_prefix=prefix) if bg else ([], None)
            if bg_paths:   # 索引作成後に削除された画像を除く(多めに取って bg 件に詰める)
                keep = [i for i, p in enumerate(bg_paths) if Path(p).is_file()][:bg]
                bg_paths, bg_mat = [bg_paths[i] for i in keep], bg_mat[keep]

            # 5. 投影
            self._project(cards, card_vecs, tags, cache, dim, bg_paths, bg_mat, gallery_prompts)
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

    def _project(self, cards, card_vecs, tags, cache, dim, bg_paths, bg_mat, gallery_prompts=None) -> None:
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
        gp = gallery_prompts or {}
        # 背景点にはその画像のプロンプト由来のタグを持たせる(クリックでまとめて追加)
        bg_items = [{"id": p, "xyz": q, "tags": list(dict.fromkeys(split_tags(gp.get(p, ""))))}
                    for p, q in zip(bg_paths, xyz(bg_u - mean_img))] if len(bg_u) else []
        meta = {"built_at": time.strftime("%Y-%m-%d %H:%M:%S"), "cards": len(cards), "tags": len(tags),
                "background": len(bg_items), "gallery_prompts": len(gp), "dim": dim, "model": LOCAL_MODEL,
                "explained": [round(float(v), 4) for v in var[:3]]}
        space = {"meta": meta, "cards": cards, "tags": tags, "background": bg_items}

        ids = [c["id"] for c in cards] + [t["id"] for t in tags]
        tmp = self._mat_file.with_suffix(".tmp.npz")
        np.savez(tmp, ids=np.array(ids), vecs=np.concatenate([img, txt]).astype(np.float32),
                 n_img=np.array(n_img), mean_img=mean_img.astype(np.float32), mean_txt=mean_txt.astype(np.float32),
                 axes=axes, scale=np.array(scale, dtype=np.float32))
        tmp.replace(self._mat_file)
        tmp_json = self._space_file.with_suffix(".tmp.json")
        tmp_json.write_text(json.dumps(space, ensure_ascii=False), encoding="utf-8")
        tmp_json.replace(self._space_file)
        with self._lock:
            self._space, self._mat = space, None

    # ── 近傍・検索 ─────────────────────────────────────────

    def _rank(self, m: dict, q: np.ndarray, k: int, exclude: str = "", kind: str = "") -> list[dict]:
        """カードとタグは別の塊なので、それぞれの平均を引いた空間で比べる(=中心化コサイン)"""
        n_img = int(m["n_img"])
        q_img = q - m["mean_img"] if kind != "tag" else q - m["mean_txt"]
        vecs = m["vecs"]
        cen = np.concatenate([vecs[:n_img] - m["mean_img"], vecs[n_img:] - m["mean_txt"]])
        cen /= np.maximum(np.linalg.norm(cen, axis=1, keepdims=True), 1e-6)
        qn = q_img / max(float(np.linalg.norm(q_img)), 1e-6)
        scores = cen @ qn
        # 同じ種類どうしの方がスコアが高く出るため、カードとタグを別々に順位付けして交互に並べる
        ranked = []
        for lo, hi in ((0, n_img), (n_img, len(vecs))):
            order = lo + np.argsort(-scores[lo:hi])
            ranked.append([{"id": m["ids"][i], "score": round(float(scores[i]), 4)}
                           for i in order[:k + 1] if m["ids"][i] != exclude][:k])
        cards, tags = ranked
        first, second = (tags, cards) if kind == "tag" else (cards, tags)
        out = [r for pair in zip(first, second) for r in pair]
        n = min(len(first), len(second))
        out += first[n:] + second[n:]
        return out[:k]

    def neighbors(self, item_id: str, k: int) -> list[dict]:
        m = self._load_mat()
        i = m["pos"].get(item_id)
        if i is None:
            raise SemanticError("tagspace_unknown_item", item_id)
        kind = "card" if i < int(m["n_img"]) else "tag"
        return self._rank(m, m["vecs"][i], k, exclude=item_id, kind=kind)

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

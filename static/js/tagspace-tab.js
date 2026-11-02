/**
 * TagSpace タブ
 * ImagePromptカード・タグ・Gallery画像を EmbeddingGemma 2 の潜在空間で3D表示し、
 * クリックで選んだカード/タグからプロンプトを組み立てて GenerateUI へ送る。
 * 座標(PCA)と近傍・検索はサーバー側(tagspace_service.py)で計算する。
 * three.js はタブを初めて開いたときに読み込む(static/lib/three)。
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./util.js";
import { comfyUI } from "./comfyui-client.js";
import { comfyEditor } from "./comfyui-editor.js";
import { semanticErrorMessage } from "./gallery-semantic.js";

const API = {
    status:    "/wfm/tagspace/status",
    space:     "/wfm/tagspace/space",
    build:     "/wfm/tagspace/build",
    cancel:    "/wfm/tagspace/cancel",
    search:    "/wfm/tagspace/search",
    neighbors: "/wfm/tagspace/neighbors",
    thumb:     (path, w = 96) => `/wfm/gallery/image/thumb?path=${encodeURIComponent(path)}&w=${w}`,
};
const THREE_URL = "/wfm_static/lib/three/three-tagspace.min.js";
const LS_VIEW = "wfm_tagspace_view";
const SOURCE_COLORS = { image_prompt: "#f59e0b", gallery: "#f472b6", tagger: "#10b981", prompt_library: "#3b82f6", wildcard: "#a855f7" };
const NEAR_K = 20;
const LABEL_MAX = 24;          // 同時に出すラベル数の上限(選択・近傍・検索結果・ホバー)
const THUMB_CONCURRENCY = 6;

let THREE = null;
const view = {
    renderer: null, scene: null, camera: null, controls: null, raycaster: null,
    layers: {},            // cards(Points) / cardSprites(Group) / tags(Points) / background(Points)
    highlight: null, probe: null, probeLines: null,
    dotTexture: null, running: false, fly: null,
};
const state = {
    space: null,
    items: new Map(),      // id -> card/tag/background item (xyz, kind, ...)
    chips: [],             // [{id, kind, label, text}]
    selected: null,        // 詳細表示中のid
    list: { title: "", rows: [] },   // 近傍 or 検索結果 [{id, score}]
    probe: null,           // 検索点 [x,y,z]
    hover: null,
    pollTimer: null,
    opts: loadOpts(),
};

function loadOpts() {
    const def = { cards: true, tags: true, background: true, thumbs: true, maxTags: 2000, bg: 4000 };
    try {
        return { ...def, ...(JSON.parse(localStorage.getItem(LS_VIEW) || "{}") || {}) };
    } catch {
        return def;
    }
}
function saveOpts() {
    try { localStorage.setItem(LS_VIEW, JSON.stringify(state.opts)); } catch { /* 保存できなくても動作に影響しない */ }
}

async function postJson(url, body) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    let data = {};
    try { data = await res.json(); } catch { /* 本文なし */ }
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code: data.code || "" });
    return data;
}

function errorMessage(e) {
    if (e?.code?.startsWith("tagspace_")) return t(`ts_err_${e.code}`, e.message);
    return semanticErrorMessage(e);
}

// ── DOM ──────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function renderShell() {
    const root = $("wfm-tab-tagspace");
    const o = state.opts;
    const layer = (key, label, color) =>
        `<label class="wfm-ts-check"><input type="checkbox" data-ts-layer="${key}" ${o[key] ? "checked" : ""}>` +
        `${color ? `<span class="wfm-ts-swatch" style="background:${color}"></span>` : ""}${escapeHtml(label)}</label>`;
    root.innerHTML = `
    <div class="wfm-ts">
        <div class="wfm-ts-toolbar">
            <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-ts-build">${escapeHtml(t("tsBuild"))}</button>
            <button class="wfm-btn wfm-btn-sm" id="wfm-ts-cancel" style="display:none;">${escapeHtml(t("tsCancel"))}</button>
            <label class="wfm-ts-num">${escapeHtml(t("tsMaxTags"))}<input type="number" id="wfm-ts-max-tags" class="wfm-input" min="50" max="6000" step="50" value="${o.maxTags}"></label>
            <label class="wfm-ts-num">${escapeHtml(t("tsBackground"))}<input type="number" id="wfm-ts-bg" class="wfm-input" min="0" max="20000" step="500" value="${o.bg}"></label>
            <span class="wfm-ts-sep"></span>
            ${layer("cards", t("tsLayerCards"))}${layer("thumbs", t("tsThumbs"))}${layer("tags", t("tsLayerTags"))}${layer("background", t("tsLayerGallery"))}
            <span class="wfm-ts-legend">${Object.entries(SOURCE_COLORS).map(([k, c]) =>
                `<span><span class="wfm-ts-swatch" style="background:${c}"></span>${escapeHtml(t(`tsSrc_${k}`))}</span>`).join("")}</span>
            <input type="search" id="wfm-ts-search" class="wfm-input wfm-ts-search" placeholder="${escapeHtml(t("tsSearchPlaceholder"))}">
        </div>
        <div class="wfm-ts-status" id="wfm-ts-status"></div>
        <div class="wfm-ts-main">
            <div class="wfm-ts-view" id="wfm-ts-view">
                <div class="wfm-ts-labels" id="wfm-ts-labels"></div>
                <div class="wfm-ts-tooltip" id="wfm-ts-tooltip" style="display:none;"></div>
                <div class="wfm-ts-empty" id="wfm-ts-empty">${escapeHtml(t("tsLoading"))}</div>
                <div class="wfm-ts-hint">${escapeHtml(t("tsHint"))}</div>
            </div>
            <aside class="wfm-ts-side">
                <section class="wfm-ts-panel">
                    <h4>${escapeHtml(t("tsDetailTitle"))}</h4>
                    <div id="wfm-ts-detail" class="wfm-ts-detail"><span class="wfm-ts-muted">${escapeHtml(t("tsDetailEmpty"))}</span></div>
                </section>
                <section class="wfm-ts-panel wfm-ts-panel-grow">
                    <h4 id="wfm-ts-list-title">${escapeHtml(t("tsNeighborsTitle"))}</h4>
                    <div id="wfm-ts-list" class="wfm-ts-list"></div>
                </section>
            </aside>
            <aside class="wfm-ts-side wfm-ts-side-prompt">
                <section class="wfm-ts-panel wfm-ts-panel-grow">
                    <h4>${escapeHtml(t("tsBuilderTitle"))}</h4>
                    <div id="wfm-ts-chips" class="wfm-ts-chips"></div>
                    <textarea id="wfm-ts-output" class="wfm-input wfm-ts-output" rows="8" readonly></textarea>
                    <div class="wfm-ts-actions">
                        <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-ts-send">${escapeHtml(t("tsSend"))}</button>
                        <button class="wfm-btn wfm-btn-sm" id="wfm-ts-copy">${escapeHtml(t("tsCopy"))}</button>
                        <button class="wfm-btn wfm-btn-sm" id="wfm-ts-clear">${escapeHtml(t("tsClear"))}</button>
                    </div>
                </section>
            </aside>
        </div>
    </div>`;
}

function bindShell() {
    $("wfm-ts-build").addEventListener("click", startBuild);
    $("wfm-ts-cancel").addEventListener("click", () => postJson(API.cancel).catch(() => {}));
    $("wfm-ts-max-tags").addEventListener("change", (e) => { state.opts.maxTags = parseInt(e.target.value, 10) || 2000; saveOpts(); });
    $("wfm-ts-bg").addEventListener("change", (e) => { state.opts.bg = Math.max(0, parseInt(e.target.value, 10) || 0); saveOpts(); });
    document.querySelectorAll("[data-ts-layer]").forEach((cb) => cb.addEventListener("change", () => {
        state.opts[cb.dataset.tsLayer] = cb.checked;
        saveOpts();
        applyLayerVisibility();
    }));
    $("wfm-ts-search").addEventListener("keydown", (e) => {
        if (e.key === "Enter") runSearch(e.target.value);
    });
    $("wfm-ts-search").addEventListener("search", (e) => { if (!e.target.value) clearSearch(); });
    $("wfm-ts-send").addEventListener("click", sendToGenerate);
    $("wfm-ts-copy").addEventListener("click", copyPrompt);
    $("wfm-ts-clear").addEventListener("click", () => { state.chips = []; refreshChips(); });
    $("wfm-ts-list").addEventListener("click", onListClick);
    $("wfm-ts-chips").addEventListener("click", (e) => {
        const id = e.target.closest("[data-ts-remove]")?.dataset.tsRemove;
        if (id) toggleChip(id);
    });
    $("wfm-ts-detail").addEventListener("click", (e) => {
        const id = e.target.closest("[data-ts-toggle]")?.dataset.tsToggle;
        if (id) toggleChip(id);
    });
}

// ── 状態・構築 ───────────────────────────────────────────────

const PHASES = ["cards", "index", "prompts", "tags", "project"];

async function refreshStatus(loadIfBuilt) {
    let st;
    try {
        const res = await fetch(API.status);
        st = await res.json();
        if (!res.ok) throw new Error(st.error || `HTTP ${res.status}`);
    } catch (e) {
        setStatus(t("errorWithMsg", e.message), true);
        return;
    }
    const job = st.job || {};
    $("wfm-ts-build").disabled = !!job.running;
    $("wfm-ts-cancel").style.display = job.running ? "" : "none";
    if (job.running) {
        const phase = PHASES.includes(job.phase) ? job.phase : "cards";
        setStatus(t(`tsPhase_${phase}`, job.done || 0, job.total || 0));
        clearTimeout(state.pollTimer);
        state.pollTimer = setTimeout(() => refreshStatus(true), 1000);
        return;
    }
    if (job.finished && job.error_code) {
        setStatus(errorMessage({ code: job.error_code, message: job.error }), true);
    } else if (st.built) {
        const m = st.meta || {};
        setStatus(t("tsBuilt", m.cards || 0, m.tags || 0, m.background || 0, m.built_at || "", (m.explained || []).reduce((a, b) => a + b, 0)));
    } else {
        setStatus(st.ollama && !st.ollama.ready ? t("tsNeedOllama") : t("tsNotBuilt"), !st.ollama?.ready);
        showEmpty(t("tsNotBuilt"));
    }
    if (st.built && loadIfBuilt && (!state.space || state.space.meta?.built_at !== st.meta?.built_at)) {
        await loadSpace();
    }
}

function setStatus(text, isError = false) {
    const el = $("wfm-ts-status");
    el.textContent = text;
    el.classList.toggle("wfm-ts-status-error", !!isError);
}

async function startBuild() {
    try {
        await postJson(API.build, { max_tags: state.opts.maxTags, background: state.opts.bg });
    } catch (e) {
        showToast(errorMessage(e), "error");
        return;
    }
    refreshStatus(true);
}

async function loadSpace() {
    try {
        const res = await fetch(API.space);
        const data = await res.json();
        if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code: data.code || "" });
        state.space = data;
    } catch (e) {
        showEmpty(errorMessage(e));
        return;
    }
    state.items.clear();
    for (const c of state.space.cards) state.items.set(c.id, c);
    for (const g of state.space.tags) state.items.set(g.id, g);
    for (const b of state.space.background) {
        b.kind = "image";   // 3Dの点(userData.items)と同じオブジェクトに付ける
        state.items.set(b.id, b);
    }
    // 再構築で消えた要素はチップから外す
    state.chips = state.chips.filter((c) => state.items.has(c.id));
    state.selected = state.items.has(state.selected) ? state.selected : null;
    state.list = { title: "", rows: [] };
    state.probe = null;
    buildScene();
    refreshChips();
    renderDetail();
    renderList();
    showEmpty("");
}

function showEmpty(text) {
    const el = $("wfm-ts-empty");
    if (!el) return;
    el.textContent = text;
    el.style.display = text ? "" : "none";
}

// ── three.js シーン ───────────────────────────────────────────

function cssColor(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function groupColor(group) {
    let h = 0;
    for (const ch of group || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return new THREE.Color().setHSL((h % 360) / 360, 0.55, 0.6);
}

function makeDotTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.beginPath();
    g.arc(32, 32, 28, 0, Math.PI * 2);
    g.fillStyle = "#fff";
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function makePoints(items, colorOf, size, opacity = 1) {
    const pos = new Float32Array(items.length * 3);
    const col = new Float32Array(items.length * 3);
    items.forEach((it, i) => {
        pos.set(it.xyz, i * 3);
        const c = colorOf(it);
        col.set([c.r, c.g, c.b], i * 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
        size, vertexColors: true, map: view.dotTexture, alphaTest: 0.5,
        transparent: opacity < 1, opacity, sizeAttenuation: true, depthWrite: opacity >= 1,
    });
    const pts = new THREE.Points(geo, mat);
    pts.userData.items = items;
    return pts;
}

function disposeObject(obj) {
    if (!obj) return;
    view.scene.remove(obj);
    obj.traverse?.((o) => {
        o.geometry?.dispose();
        if (o.material) {
            o.material.map && o.material.map !== view.dotTexture && o.material.map.dispose();
            o.material.dispose();
        }
    });
}

function buildScene() {
    for (const key of Object.keys(view.layers)) disposeObject(view.layers[key]);
    view.layers = {};
    const { cards, tags, background } = state.space;
    view.layers.background = makePoints(background, () => new THREE.Color("#9aa3b2"), 0.1, 0.55);
    view.layers.tags = makePoints(tags, (g) => new THREE.Color(SOURCE_COLORS[g.sources?.[0]] || "#cccccc"), 0.16);
    view.layers.cards = makePoints(cards, (c) => groupColor(c.group), 0.22);
    // サムネイル表示用のスプライト(テクスチャは順次読み込む)
    const group = new THREE.Group();
    for (const c of cards) {
        const mat = new THREE.SpriteMaterial({ color: groupColor(c.group), map: view.dotTexture, alphaTest: 0.5 });
        const sp = new THREE.Sprite(mat);
        sp.position.set(...c.xyz);
        sp.scale.set(0.5, 0.5, 1);
        sp.userData.item = c;
        group.add(sp);
    }
    view.layers.cardSprites = group;
    Object.values(view.layers).forEach((o) => view.scene.add(o));
    applyLayerVisibility();
    updateHighlight();
}

function applyLayerVisibility() {
    const o = state.opts;
    if (!view.layers.cards) return;
    view.layers.background.visible = o.background;
    view.layers.tags.visible = o.tags;
    view.layers.cards.visible = o.cards && !o.thumbs;
    view.layers.cardSprites.visible = o.cards && o.thumbs;
    if (o.cards && o.thumbs) loadThumbnails();
}

function loadThumbnails() {
    const queue = view.layers.cardSprites.children.filter((s) => !s.userData.thumbQueued);
    queue.forEach((s) => { s.userData.thumbQueued = true; });
    const loader = new THREE.TextureLoader();
    const next = () => {
        const sp = queue.shift();
        if (!sp) return;
        if (!sp.parent) return next();   // 再構築で捨てられたスプライト
        loader.load(API.thumb(sp.userData.item.id), (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            sp.material.map = tex;
            sp.material.color.set("#ffffff");
            sp.material.alphaTest = 0;
            sp.material.needsUpdate = true;
            const img = tex.image;
            const aspect = img?.width && img?.height ? img.width / img.height : 1;
            sp.scale.set(0.6 * Math.min(aspect, 1.6), 0.6, 1);
            next();
        }, undefined, next);
    };
    for (let i = 0; i < THUMB_CONCURRENCY; i++) next();
}

/** 選択(チップ)・近傍・検索結果を目立たせる重ね描き */
function updateHighlight() {
    if (!view.scene) return;
    disposeObject(view.highlight);
    disposeObject(view.probe);
    disposeObject(view.probeLines);
    view.highlight = view.probe = view.probeLines = null;
    const accent = new THREE.Color(cssColor("--wfm-primary", "#6366f1"));
    const near = new THREE.Color("#22d3ee");
    const chipIds = new Set(state.chips.map((c) => c.id));
    const marks = [];
    for (const id of chipIds) if (state.items.has(id)) marks.push({ xyz: state.items.get(id).xyz, color: accent });
    for (const r of state.list.rows.slice(0, NEAR_K)) {
        if (!chipIds.has(r.id) && state.items.has(r.id)) marks.push({ xyz: state.items.get(r.id).xyz, color: near });
    }
    if (marks.length) {
        view.highlight = makePoints(marks, (m) => m.color, 0.42);
        view.highlight.material.depthTest = false;
        view.highlight.renderOrder = 10;
        view.scene.add(view.highlight);
    }
    if (state.probe) {
        view.probe = makePoints([{ xyz: state.probe }], () => new THREE.Color("#ffffff"), 0.6);
        view.probe.material.depthTest = false;
        view.probe.renderOrder = 11;
        view.scene.add(view.probe);
        const seg = [];
        for (const r of state.list.rows.slice(0, 10)) {
            const it = state.items.get(r.id);
            if (it) seg.push(...state.probe, ...it.xyz);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
        view.probeLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
        view.scene.add(view.probeLines);
    }
}

async function initThree() {
    THREE = await import(THREE_URL);
    const host = $("wfm-ts-view");
    view.scene = new THREE.Scene();
    view.scene.background = new THREE.Color(cssColor("--wfm-bg", "#111318"));
    view.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 500);
    view.camera.position.set(0, 4, 22);
    view.renderer = new THREE.WebGLRenderer({ antialias: true });
    view.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.prepend(view.renderer.domElement);
    view.controls = new THREE.OrbitControls(view.camera, view.renderer.domElement);
    view.controls.enableDamping = true;
    view.controls.dampingFactor = 0.08;
    view.raycaster = new THREE.Raycaster();
    view.dotTexture = makeDotTexture();
    new ResizeObserver(resize).observe(host);
    resize();
    bindPointer(view.renderer.domElement);
}

function resize() {
    const host = $("wfm-ts-view");
    if (!view.renderer || !host.clientWidth || !host.clientHeight) return;
    view.renderer.setSize(host.clientWidth, host.clientHeight);
    view.camera.aspect = host.clientWidth / host.clientHeight;
    view.camera.updateProjectionMatrix();
}

function tabActive() {
    return $("wfm-tab-tagspace")?.classList.contains("active");
}

function loop() {
    if (!tabActive()) {
        view.running = false;   // 非表示中は描画を止める(タブを開いたときに再開)
        return;
    }
    requestAnimationFrame(loop);
    if (view.fly) stepFly();
    view.controls.update();
    view.renderer.render(view.scene, view.camera);
    updateLabels();
}

function startLoop() {
    if (view.running || !view.renderer) return;
    view.running = true;
    resize();
    requestAnimationFrame(loop);
}

/** 指定の点へ注視点を移動する(カメラとの位置関係は保つ) */
function flyTo(xyz) {
    const to = new THREE.Vector3(...xyz);
    const offset = view.camera.position.clone().sub(view.controls.target);
    if (offset.length() > 9) offset.setLength(9);
    view.fly = { t0: performance.now(), fromT: view.controls.target.clone(), fromC: view.camera.position.clone(), toT: to, toC: to.clone().add(offset) };
}

function stepFly() {
    const f = view.fly;
    const k = Math.min(1, (performance.now() - f.t0) / 450);
    const e = k * (2 - k);
    view.controls.target.lerpVectors(f.fromT, f.toT, e);
    view.camera.position.lerpVectors(f.fromC, f.toC, e);
    if (k >= 1) view.fly = null;
}

// ── ラベル・ツールチップ ─────────────────────────────────────

function screenPos(xyz) {
    const v = new THREE.Vector3(...xyz).project(view.camera);
    if (v.z > 1) return null;
    const el = view.renderer.domElement;
    return { x: (v.x + 1) / 2 * el.clientWidth, y: (1 - v.y) / 2 * el.clientHeight };
}

function updateLabels() {
    const box = $("wfm-ts-labels");
    const ids = [];
    const seen = new Set();
    const push = (id, cls) => {
        if (id && !seen.has(id) && state.items.has(id) && ids.length < LABEL_MAX) {
            seen.add(id);
            ids.push([id, cls]);
        }
    };
    state.chips.forEach((c) => push(c.id, "chip"));
    state.list.rows.slice(0, 12).forEach((r) => push(r.id, "near"));
    if (state.hover) push(state.hover, "hover");
    let html = "";
    for (const [id, cls] of ids) {
        const it = state.items.get(id);
        const p = screenPos(it.xyz);
        if (!p) continue;
        html += `<span class="wfm-ts-label wfm-ts-label-${cls}" style="transform:translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)">${escapeHtml(itemTitle(it))}</span>`;
    }
    if (box.dataset.html !== html) {
        box.innerHTML = html;
        box.dataset.html = html;
    }
}

function itemTitle(it) {
    return it.kind === "image" ? it.id.split("/").pop() : it.label;
}

function showTooltip(it, x, y) {
    const tip = $("wfm-ts-tooltip");
    if (!it) {
        tip.style.display = "none";
        return;
    }
    const thumb = it.kind !== "tag" ? `<img src="${API.thumb(it.id, 160)}" alt="">` : "";
    const body = it.kind === "card" ? escapeHtml(it.prompt.slice(0, 160))
        : it.kind === "tag" ? escapeHtml(sourcesText(it))
        : escapeHtml(it.tags?.length ? it.tags.slice(0, 20).join(", ") : t("tsImageNoTags"));
    tip.innerHTML = `${thumb}<div><b>${escapeHtml(itemTitle(it))}</b> <span class="wfm-ts-muted">${escapeHtml(t(`tsKind_${it.kind}`))}</span>` +
        `${body ? `<div class="wfm-ts-tip-body">${body}</div>` : ""}</div>`;
    tip.style.display = "";
    const host = $("wfm-ts-view");
    tip.style.left = `${Math.min(x + 14, host.clientWidth - tip.offsetWidth - 6)}px`;
    tip.style.top = `${Math.min(y + 14, host.clientHeight - tip.offsetHeight - 6)}px`;
}

function sourcesText(tag) {
    return `${t("tsSources")} ${(tag.sources || []).map((s) => t(`tsSrc_${s}`)).join(", ")} · ×${tag.count}`;
}

// ── ポインター操作 ───────────────────────────────────────────

function pick(clientX, clientY) {
    const rect = view.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    view.raycaster.setFromCamera(ndc, view.camera);
    view.raycaster.params.Points.threshold = 0.12;
    const targets = [view.layers.cardSprites, view.layers.cards, view.layers.tags, view.layers.background].filter((o) => o?.visible);
    const hits = view.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
        if (h.object.isSprite) return h.object.userData.item;
        const items = h.object.userData.items;
        if (items && h.index != null) return items[h.index];
    }
    return null;
}

function bindPointer(canvas) {
    let down = null;
    let raf = 0;
    canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener("pointermove", (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = 0;
            if (!state.space || (down && e.buttons)) return;
            const it = pick(e.clientX, e.clientY);
            state.hover = it ? it.id : null;
            const rect = canvas.getBoundingClientRect();
            showTooltip(it, e.clientX - rect.left, e.clientY - rect.top);
            canvas.style.cursor = it ? "pointer" : "";
        });
    });
    canvas.addEventListener("pointerleave", () => { state.hover = null; showTooltip(null); });
    canvas.addEventListener("pointerup", (e) => {
        const moved = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4;
        down = null;
        if (moved || e.button !== 0 || !state.space) return;
        const it = pick(e.clientX, e.clientY);
        if (!it) return;
        if (canAdd(it)) toggleChip(it.id);
        select(it.id);
    });
}

// ── 選択・近傍・検索 ─────────────────────────────────────────

async function select(id) {
    state.selected = id;
    renderDetail();
    const it = state.items.get(id);
    if (!it || it.kind === "image") return;
    try {
        const data = await postJson(API.neighbors, { id, k: NEAR_K });
        if (state.selected !== id) return;
        state.probe = null;
        state.list = { title: t("tsNeighborsOf", itemTitle(it)), rows: data };
    } catch (e) {
        showToast(errorMessage(e), "error");
        return;
    }
    renderList();
    updateHighlight();
}

async function runSearch(query) {
    query = (query || "").trim();
    if (!query) return clearSearch();
    if (!state.space) return;
    try {
        const data = await postJson(API.search, { query, k: NEAR_K });
        state.probe = data.probe;
        state.list = { title: t("tsSearchTitle", query), rows: data.matches || [] };
    } catch (e) {
        showToast(errorMessage(e), "error");
        return;
    }
    renderList();
    updateHighlight();
    if (state.probe) flyTo(state.probe);
}

function clearSearch() {
    state.probe = null;
    state.list = { title: "", rows: [] };
    renderList();
    updateHighlight();
}

function renderDetail() {
    const box = $("wfm-ts-detail");
    const it = state.items.get(state.selected);
    if (!it) {
        box.innerHTML = `<span class="wfm-ts-muted">${escapeHtml(t("tsDetailEmpty"))}</span>`;
        return;
    }
    const inChips = state.chips.some((c) => c.id === it.id);
    const thumb = it.kind !== "tag" ? `<img class="wfm-ts-detail-thumb" src="${API.thumb(it.id, 240)}" alt="">` : "";
    const body = it.kind === "card" ? `<div class="wfm-ts-detail-text">${escapeHtml(it.prompt)}</div><div class="wfm-ts-muted">${escapeHtml(it.category)}</div>`
        : it.kind === "tag" ? `<div class="wfm-ts-muted">${escapeHtml(sourcesText(it))}</div>`
        : `<div class="wfm-ts-detail-text">${escapeHtml(it.tags?.length ? it.tags.join(", ") : t("tsImageNoTags"))}</div>` +
          `<div class="wfm-ts-muted wfm-ts-path">${escapeHtml(it.id)}</div>`;
    const btn = !canAdd(it) ? ""
        : `<button class="wfm-btn wfm-btn-sm ${inChips ? "" : "wfm-btn-primary"}" data-ts-toggle="${escapeHtml(it.id)}">${escapeHtml(t(inChips ? "tsRemove" : "tsAdd"))}</button>`;
    box.innerHTML = `${thumb}<div><b>${escapeHtml(itemTitle(it))}</b> <span class="wfm-ts-muted">${escapeHtml(t(`tsKind_${it.kind}`))}</span></div>${body}${btn}`;
}

function renderList() {
    $("wfm-ts-list-title").textContent = state.list.title || t("tsNeighborsTitle");
    const chipIds = new Set(state.chips.map((c) => c.id));
    const rows = state.list.rows.filter((r) => state.items.has(r.id));
    if (!rows.length) {
        $("wfm-ts-list").innerHTML = `<span class="wfm-ts-muted">${escapeHtml(t("tsListEmpty"))}</span>`;
        return;
    }
    $("wfm-ts-list").innerHTML = rows.map((r) => {
        const it = state.items.get(r.id);
        const icon = it.kind === "card" ? `<img src="${API.thumb(it.id, 64)}" alt="" loading="lazy">`
            : `<span class="wfm-ts-dot" style="background:${SOURCE_COLORS[it.sources?.[0]] || "#ccc"}"></span>`;
        const on = chipIds.has(it.id);
        return `<div class="wfm-ts-row" data-ts-go="${escapeHtml(it.id)}">${icon}<span class="wfm-ts-row-label">${escapeHtml(it.label)}</span>` +
            `<span class="wfm-ts-muted">${r.score.toFixed(2)}</span>` +
            `<button class="wfm-ts-row-add${on ? " on" : ""}" data-ts-add="${escapeHtml(it.id)}" title="${escapeHtml(t(on ? "tsRemove" : "tsAdd"))}">${on ? "✓" : "+"}</button></div>`;
    }).join("");
}

function onListClick(e) {
    const add = e.target.closest("[data-ts-add]")?.dataset.tsAdd;
    if (add) {
        toggleChip(add);
        return;
    }
    const go = e.target.closest("[data-ts-go]")?.dataset.tsGo;
    if (go && state.items.has(go)) {
        state.selected = go;
        renderDetail();
        flyTo(state.items.get(go).xyz);
    }
}

// ── プロンプト組み立て ───────────────────────────────────────

/** カード・タグと、プロンプト由来のタグを持つGallery画像はチップにできる */
function canAdd(it) {
    return !!it && (it.kind !== "image" || it.tags?.length > 0);
}

function chipText(it) {
    return it.kind === "card" ? it.prompt : it.kind === "image" ? it.tags.join(", ") : it.label;
}

function toggleChip(id) {
    const i = state.chips.findIndex((c) => c.id === id);
    if (i >= 0) {
        state.chips.splice(i, 1);
    } else {
        const it = state.items.get(id);
        if (!canAdd(it)) return;
        state.chips.push({ id, kind: it.kind, label: itemTitle(it), text: chipText(it) });
    }
    refreshChips();
}

/** チップの文をカンマで分けて重複(大文字小文字・空白の違いを無視)を除き、順番を保って連結する */
export function composePrompt(chips) {
    const seen = new Set();
    const out = [];
    for (const c of chips) {
        for (const part of c.text.split(",")) {
            const s = part.trim();
            const key = s.toLowerCase().replace(/\s+/g, " ");
            if (s && !seen.has(key)) {
                seen.add(key);
                out.push(s);
            }
        }
    }
    return out.join(", ");
}

function refreshChips() {
    $("wfm-ts-chips").innerHTML = state.chips.length
        ? state.chips.map((c) => `<span class="wfm-ts-chip wfm-ts-chip-${c.kind}" title="${escapeHtml(c.text)}">${escapeHtml(c.label)}` +
            `<button data-ts-remove="${escapeHtml(c.id)}" title="${escapeHtml(t("tsRemove"))}">×</button></span>`).join("")
        : `<span class="wfm-ts-muted">${escapeHtml(t("tsChipsEmpty"))}</span>`;
    $("wfm-ts-output").value = composePrompt(state.chips);
    renderDetail();
    renderList();
    updateHighlight();
}

function sendToGenerate() {
    const text = $("wfm-ts-output").value.trim();
    if (!text) return;
    if (!comfyUI.currentWorkflow) {
        showToast(t("tsNoWorkflow"), "error");
        return;
    }
    comfyEditor.appendEmbeddingToPrompt(text, "positive");
    showToast(t("tsSent"), "success");
}

async function copyPrompt() {
    const text = $("wfm-ts-output").value.trim();
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        showToast(t("tsCopied"), "success");
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

// ── 初期化 ───────────────────────────────────────────────────

let _opened = false;

async function onOpen() {
    if (!_opened) {
        _opened = true;
        try {
            await initThree();
        } catch (e) {
            showEmpty(t("errorWithMsg", e.message));
            return;
        }
        await refreshStatus(true);
    }
    startLoop();
}

export function initTagSpaceTab() {
    if (!$("wfm-tab-tagspace")) return;
    renderShell();
    bindShell();
    refreshChips();
    document.querySelector('.wfm-tab[data-tab="tagspace"]')?.addEventListener("click", () => {
        // タブの表示切替(app.js)の後に初期化・描画を始める
        setTimeout(onOpen, 0);
    });
}

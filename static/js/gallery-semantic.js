/**
 * Gallery Tab - セマンティック検索 (Gemini Embedding 2 / Ollama の EmbeddingGemma 2)
 *  - 検索ボックスのSemantic Searchトグル（ONでEnter実行の意味検索）
 *  - 詳細パネルの「類似画像」トグル／更新ボタン
 *  - インデックス作成モーダル（Semantic⚙）
 * 一覧の差し替えは gallery-tab.js の loadImages() が getSemanticMode() / fetchSemanticImages() を呼んで行う。
 */

import { openModal, closeModal, showToast } from "./app.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./util.js";

const API = {
    status:  (folder, recursive) => `/wfm/gallery/semantic/status?folder=${encodeURIComponent(folder)}&recursive=${recursive}`,
    index:   "/wfm/gallery/semantic/index",
    cancel:  "/wfm/gallery/semantic/cancel",
    search:  "/wfm/gallery/semantic/search",
    similar: "/wfm/gallery/semantic/similar",
    clear:   "/wfm/gallery/semantic/clear",
    folders: (root) => `/wfm/gallery/semantic/folders?root=${encodeURIComponent(root)}`,
    test:    "/wfm/gallery/semantic/test",
    options: "/wfm/gallery/semantic/options",
};

const LS_ON = "wfm_gallery_semantic_on";
const LS_DIM = "wfm_gallery_semantic_dim";
const LS_MODEL = "wfm_gallery_semantic_model";
const GEMINI = "gemini-embedding-2";
const LOCAL = "embeddinggemma-2";
const LS_SUB = "wfm_gallery_semantic_recursive";
const LS_TAB = "wfm_gallery_semantic_tab";
const LS_TH = "wfm_gallery_semantic_th";
const LIMITS = [50, 100, 200, 500, 1000];
// Ollama のモデルサイズ(どちらも同じベクトルを返すので、切り替えても再作成は不要)
const OLLAMA_TAGS = [["embeddinggemma-2:740m", "semOllamaTag740"], ["embeddinggemma-2:440m", "semOllamaTag440"]];

const sem = {
    on: false,             // Semantic Searchトグル
    anchor: "",            // 類似画像表示中の基準画像パス（空=類似表示OFF）
    anchorName: "",
    indexModel: GEMINI,    // 現在のインデックスを作ったモデル（しきい値はモデルごとに保存する）
};

let ctx = null;            // { getSearch, getFolder, getSelected, reload, focusSearch }

function lsGet(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* 保存できなくても動作に影響しない */ }
}

async function postJson(url, body) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
    });
    let data = {};
    try { data = await res.json(); } catch { /* 本文なし */ }
    if (!res.ok) {
        throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code: data.code || "" });
    }
    return data;
}

/** APIエラーコードをi18nメッセージにする */
export function semanticErrorMessage(e) {
    const known = ["no_api_key", "api_key_invalid", "index_empty", "dim_mismatch", "already_running",
        "folder_not_allowed", "unsupported_type", "network_error", "api_error", "local_error",
        "ollama_unreachable", "ollama_model_missing", "bad_url"];
    if (e?.code && known.includes(e.code)) {
        return t(`sem_err_${e.code}`, e.message);
    }
    return t("errorWithMsg", e?.message || String(e));
}

// ── gallery-tab.js から使う公開API ────────────────────────────

/** 現在の一覧モード: {kind:"similar", path} | {kind:"text", query} | null(通常) */
export function getSemanticMode() {
    if (sem.anchor) return { kind: "similar", path: sem.anchor, name: sem.anchorName };
    const q = (ctx?.getSearch() || "").trim();
    if (sem.on && q) return { kind: "text", query: q };
    return null;
}

export function isSemanticOn() {
    return sem.on;
}

/**
 * 表示条件（類似度のしきい値・最大件数）。スコアの水準はモデルで違うため、モデルごとに保存する。
 * similar: 類似画像検索の最小スコア / text: 文章検索の最小スコア（0=絞り込みなし）
 */
function loadThresholds(model) {
    let v = {};
    try { v = JSON.parse(lsGet(LS_TH, "{}"))[model] || {}; } catch { /* 壊れた値は既定に戻す */ }
    const num = x => { const n = parseFloat(x); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0; };
    return { similar: num(v.similar), text: num(v.text), limit: LIMITS.includes(v.limit) ? v.limit : 200 };
}

function saveThresholds(model, th) {
    let all = {};
    try { all = JSON.parse(lsGet(LS_TH, "{}")) || {}; } catch { all = {}; }
    all[model] = th;
    lsSet(LS_TH, JSON.stringify(all));
}

function minScoreFor(mode) {
    const th = loadThresholds(sem.indexModel);
    return mode.kind === "similar" ? th.similar : th.text;
}

/** モードに応じてサーバーから結果（スコア降順・score付き）を取得する */
export async function fetchSemanticImages(mode, folder) {
    const th = loadThresholds(sem.indexModel);
    const common = { folder, recursive: true, limit: th.limit, min_score: minScoreFor(mode) };
    const data = mode.kind === "similar"
        ? await postJson(API.similar, { path: mode.path, ...common })
        : await postJson(API.search, { query: mode.query, ...common });
    return data.images || [];
}

/** 2行目の結果件数表示（意味検索/類似表示のときだけ文言を入れる。通常は空） */
export function setSemanticCountText(text) {
    const el = document.getElementById("wfm-gallery-sem-count");
    if (el) el.textContent = text || "";
}

/** 一覧件数ラベル */
export function semanticCountLabel(mode, count) {
    const min = minScoreFor(mode);
    return mode.kind === "similar"
        ? t("semCountSimilar", count, mode.name, min)
        : t("semCountText", count, min);
}

let _dotRoot = "";
let _dotSeq = 0;

/**
 * フォルダツリーの枚数バッジ横に、直下の画像が全件インデックス済みのフォルダへドットを付ける。
 * ツリー再構築後・インデックス作成後に呼ぶ（DOMはその場で更新し、ツリーは作り直さない）。
 */
export async function refreshSemanticDots(root) {
    if (root) _dotRoot = root;
    if (!_dotRoot) return;
    const seq = ++_dotSeq;
    let folders;
    try {
        const res = await fetch(API.folders(_dotRoot));
        if (!res.ok) return;
        folders = (await res.json()).folders || {};
    } catch {
        return;
    }
    if (seq !== _dotSeq) return;   // より新しい呼び出しがある
    document.querySelectorAll(".wfm-gallery-tree-item").forEach(item => {
        const label = item.querySelector(".wfm-gallery-tree-label");
        const badge = label?.querySelector(".wfm-gallery-tree-count");
        label?.querySelector(".wfm-gallery-tree-sem-dot")?.remove();
        const st = folders[(item.dataset.path || "").replace(/\\/g, "/")];
        if (badge && st && st.indexable > 0 && st.indexed >= st.indexable) {
            const dot = document.createElement("span");
            dot.className = "wfm-gallery-tree-sem-dot";
            dot.title = t("semDotTitle");
            badge.after(dot);
        }
    });
}

/** フォルダ切替・フィルタクリア時に類似表示を解除する（再読込は呼び出し側） */
export function exitSimilarMode() {
    sem.anchor = "";
    sem.anchorName = "";
    updateSimilarButtons();
}

// ── トグル／類似ボタン ───────────────────────────────────────

function updateToggleUi() {
    const btn = document.getElementById("wfm-gallery-semantic-toggle");
    btn?.classList.toggle("active", sem.on);
    // ON のときだけ2行目（Similar / 更新 / 設定 / 件数）を表示する
    const row = document.getElementById("wfm-gallery-sem-row");
    if (row) row.style.display = sem.on ? "flex" : "none";
    const input = document.getElementById("wfm-gallery-search");
    if (input) input.placeholder = sem.on ? t("semSearchPlaceholder") : "Search images...";
}

function updateSimilarButtons() {
    document.getElementById("wfm-gallery-similar-btn")?.classList.toggle("active", !!sem.anchor);
}

async function toggleSimilar() {
    if (sem.anchor) {
        exitSimilarMode();
        ctx.reload();
        return;
    }
    await applySimilar();
}

async function applySimilar() {
    const img = ctx.getSelected();
    if (!img) {
        showToast(t("gallerySelectImageFirst"), "error");
        return;
    }
    sem.anchor = img.path;
    sem.anchorName = img.filename;
    updateSimilarButtons();
    ctx.reload();
}

// ── インデックス作成モーダル ─────────────────────────────────

function modalHtml() {
    const tab = ["index", "model", "search"].includes(lsGet(LS_TAB, "index")) ? lsGet(LS_TAB, "index") : "index";
    const pane = (id, body) => `<div class="wfm-sem-pane" data-sem-pane="${id}" style="${tab === id ? "" : "display:none;"}">${body}</div>`;
    const tabBtn = (id, label) =>
        `<button type="button" class="wfm-sem-tab-btn${tab === id ? " active" : ""}" data-sem-tab="${id}">${escapeHtml(label)}</button>`;
    const indexPane = `
        <div class="wfm-sem-status" id="wfm-sem-status">${escapeHtml(t("loading"))}</div>
        <div class="wfm-sem-row"><b>${escapeHtml(t("semScope"))}</b>
            <span id="wfm-sem-folder" class="wfm-sem-folder"></span></div>
        <label class="wfm-sem-row"><input type="checkbox" id="wfm-sem-recursive" ${lsGet(LS_SUB, "1") === "1" ? "checked" : ""}>
            ${escapeHtml(t("semIncludeSub"))}</label>
        <div class="wfm-sem-row"><b>${escapeHtml(t("semMode"))}</b>
            <label><input type="radio" name="wfm-sem-mode" value="missing" checked> ${escapeHtml(t("semModeMissing"))}</label>
            <label><input type="radio" name="wfm-sem-mode" value="all"> ${escapeHtml(t("semModeAll"))}</label></div>
        <div class="wfm-sem-progress" id="wfm-sem-progress" style="display:none;">
            <div class="wfm-sem-bar"><div class="wfm-sem-bar-fill" id="wfm-sem-bar-fill"></div></div>
            <div id="wfm-sem-progress-text" class="wfm-sem-hint"></div>
        </div>
        <div class="wfm-sem-actions">
            <button class="wfm-btn wfm-btn-primary" id="wfm-sem-start">${escapeHtml(t("semStart"))}</button>
            <button class="wfm-btn" id="wfm-sem-cancel" disabled>${escapeHtml(t("semCancelJob"))}</button>
            <button class="wfm-btn wfm-sem-danger" id="wfm-sem-clear">${escapeHtml(t("semClear"))}</button>
        </div>`;
    const modelPane = `
        <div class="wfm-sem-row"><b>${escapeHtml(t("semModel"))}</b>
            <label><input type="radio" name="wfm-sem-model" value="${GEMINI}"> ${escapeHtml(t("semModelGemini"))}</label>
            <label><input type="radio" name="wfm-sem-model" value="${LOCAL}"> ${escapeHtml(t("semModelLocal"))}</label></div>
        <div class="wfm-sem-row"><b>${escapeHtml(t("semDimension"))}</b>
            <select id="wfm-sem-dim" class="wfm-select"></select>
            <span class="wfm-sem-hint">${escapeHtml(t("semDimHint"))}</span></div>
        <div id="wfm-sem-local-opts" class="wfm-sem-local-opts" style="display:none;">
            <div class="wfm-sem-row"><b>${escapeHtml(t("semOllamaUrl"))}</b>
                <input type="text" id="wfm-sem-ollama-url" class="wfm-input wfm-sem-url" spellcheck="false" placeholder="http://localhost:11434"></div>
            <div class="wfm-sem-row"><b>${escapeHtml(t("semOllamaTag"))}</b>
                <select id="wfm-sem-ollama-tag" class="wfm-select">
                    ${OLLAMA_TAGS.map(([tag, key]) => `<option value="${tag}">${escapeHtml(t(key))}</option>`).join("")}
                </select>
                <span id="wfm-sem-ollama-info" class="wfm-sem-hint"></span></div>
            <p class="wfm-sem-hint">${escapeHtml(t("semOllamaTagHint"))}</p>
        </div>
        <div class="wfm-sem-actions">
            <button class="wfm-btn" id="wfm-sem-test">${escapeHtml(t("semTest"))}</button>
        </div>
        <p class="wfm-sem-hint">${escapeHtml(t("semCostNote"))}</p>`;
    const searchPane = `
        <div class="wfm-sem-row"><b>${escapeHtml(t("semThTarget"))}</b>
            <span id="wfm-sem-th-model" class="wfm-sem-folder"></span></div>
        <div class="wfm-sem-row"><b>${escapeHtml(t("semThSimilar"))}</b>
            <input type="number" id="wfm-sem-th-similar" class="wfm-input wfm-sem-num" min="0" max="1" step="0.01" placeholder="0">
            <span class="wfm-sem-hint">${escapeHtml(t("semThSimilarHint"))}</span></div>
        <div class="wfm-sem-row"><b>${escapeHtml(t("semThText"))}</b>
            <input type="number" id="wfm-sem-th-text" class="wfm-input wfm-sem-num" min="0" max="1" step="0.01" placeholder="0">
            <span class="wfm-sem-hint">${escapeHtml(t("semThTextHint"))}</span></div>
        <div class="wfm-sem-row"><b>${escapeHtml(t("semThLimit"))}</b>
            <select id="wfm-sem-th-limit" class="wfm-select">${LIMITS.map(n => `<option value="${n}">${n}</option>`).join("")}</select></div>
        <p class="wfm-sem-hint">${escapeHtml(t("semThNote"))}</p>`;
    return `
    <div class="wfm-sem-modal">
        <div class="wfm-sem-tabs">${tabBtn("index", t("semTabIndex"))}${tabBtn("model", t("semTabModel"))}${tabBtn("search", t("semTabSearch"))}</div>
        ${pane("index", indexPane)}${pane("model", modelPane)}${pane("search", searchPane)}
        <div class="wfm-sem-actions wfm-sem-footer">
            <button class="wfm-btn" id="wfm-sem-help" title="${escapeHtml(t("semHelpTitle"))}">?</button>
            <button class="wfm-btn" id="wfm-sem-close">${escapeHtml(t("close"))}</button>
        </div>
    </div>`;
}

function modalAlive() {
    const overlay = document.getElementById("wfm-modal-overlay");
    return !!document.getElementById("wfm-sem-status") && overlay && overlay.style.display !== "none";
}

let _pollTimer = null;
let _backends = {};
let _sawRunning = false;

function selectedModel() {
    return document.querySelector('input[name="wfm-sem-model"]:checked')?.value || GEMINI;
}

/** Ollama の接続先/モデルサイズの初期値をサーバー保存値から設定する */
function initLocalOpts(st) {
    const ol = st.ollama || {};
    document.getElementById("wfm-sem-ollama-url").value = ol.url || "";
    const sel = document.getElementById("wfm-sem-ollama-tag");
    if (ol.tag) sel.value = ol.tag;
}

/** 検索タブ: しきい値の入力欄にインデックスのモデル用の保存値を入れる（入力中の値は上書きしない） */
function fillThresholds(st) {
    const model = st.indexed_total ? st.index_model : selectedModel();
    const box = document.getElementById("wfm-sem-th-model");
    if (box) box.textContent = model + (st.indexed_total ? "" : ` ${t("semThNoIndex")}`);
    const pane = document.getElementById("wfm-sem-th-similar");
    if (!pane || pane.dataset.model === model) return;
    const th = loadThresholds(model);
    pane.value = th.similar || "";
    document.getElementById("wfm-sem-th-text").value = th.text || "";
    document.getElementById("wfm-sem-th-limit").value = String(th.limit);
    pane.dataset.model = model;
}

/** 検索タブの入力を保存する。一覧が意味検索/類似表示中なら閉じるときに再読込する */
let _thDirty = false;
function saveThresholdInputs() {
    const model = document.getElementById("wfm-sem-th-similar")?.dataset.model;
    if (!model) return;
    const clamp = id => {
        const n = parseFloat(document.getElementById(id).value);
        return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
    };
    saveThresholds(model, {
        similar: clamp("wfm-sem-th-similar"),
        text: clamp("wfm-sem-th-text"),
        limit: parseInt(document.getElementById("wfm-sem-th-limit").value, 10) || 200,
    });
    _thDirty = true;
}

/** モーダルを閉じる共通処理 */
function closeSemanticModal() {
    clearTimeout(_pollTimer);
    closeModal();
    refreshSemanticDots();
    if (_thDirty) {
        _thDirty = false;
        if (getSemanticMode()) ctx.reload();   // 新しいしきい値で一覧を取り直す
    }
}

/** モデルサイズの選択肢に取得済みかどうかを表示する */
function updateOllamaInfo(ol) {
    if (!ol) return;
    document.querySelectorAll("#wfm-sem-ollama-tag option").forEach(opt => {
        const key = OLLAMA_TAGS.find(([tag]) => tag === opt.value)?.[1];
        if (key) opt.textContent = t(key) + (ol.installed?.[opt.value] ? "" : ` ${t("semOllamaNotPulled")}`);
    });
    const info = document.getElementById("wfm-sem-ollama-info");
    if (info) info.textContent = ol.reachable && !ol.ready ? t("semOllamaPullHint", ol.tag) : "";
}

/** 選択中モデルの次元選択肢を作り直す(preferredが選択肢にあればそれを選ぶ) */
function fillDims(model, preferred) {
    const sel = document.getElementById("wfm-sem-dim");
    const info = _backends[model];
    if (!sel || !info) return;
    sel.innerHTML = info.dims.map(d => `<option value="${d}">${d}</option>`).join("");
    sel.value = String(info.dims.includes(preferred) ? preferred : info.default_dim);
}

async function refreshModal() {
    if (!modalAlive()) return;
    const folder = ctx.getFolder();
    const recursive = document.getElementById("wfm-sem-recursive")?.checked ?? true;
    let st;
    try {
        const res = await fetch(API.status(folder, recursive));
        st = await res.json();
        if (!res.ok) throw new Error(st.error || `HTTP ${res.status}`);
    } catch (e) {
        document.getElementById("wfm-sem-status").textContent = t("errorWithMsg", e.message);
        return;
    }
    if (!modalAlive()) return;
    const job = st.job || {};
    _backends = st.backends || {};
    if (st.indexed_total) sem.indexModel = st.index_model;
    if (!document.getElementById("wfm-sem-dim").dataset.init) {
        // 初回のみ: 既存インデックスのモデル/次元、なければ前回の選択を初期値にする
        const initModel = st.indexed_total ? st.index_model : lsGet(LS_MODEL, GEMINI);
        const radio = document.querySelector(`input[name="wfm-sem-model"][value="${initModel}"]`)
            || document.querySelector(`input[name="wfm-sem-model"][value="${GEMINI}"]`);
        radio.checked = true;
        fillDims(radio.value, st.indexed_total ? st.index_dim : parseInt(lsGet(LS_DIM, "0"), 10));
        initLocalOpts(st);
        document.getElementById("wfm-sem-dim").dataset.init = "1";
    }
    fillThresholds(st);
    const model = selectedModel();
    document.getElementById("wfm-sem-local-opts").style.display = model === LOCAL ? "" : "none";
    updateOllamaInfo(st.ollama);
    const ol = st.ollama || {};
    const ready = model === LOCAL ? !!ol.ready : !!st.has_key;
    const keyLine = model !== LOCAL ? (st.has_key ? t("semKeyOk") : t("semKeyMissing"))
        : !ol.reachable ? t("semOllamaUnreachable", ol.url)
        : ol.ready ? t("semOllamaReady", ol.tag) : t("semOllamaMissing", ol.tag);
    const idxLine = t("semIndexInfo", st.indexed_total, st.index_dim || "-");
    const scopeLine = st.scope_total != null ? t("semScopeInfo", st.scope_indexed, st.scope_total) : "";
    document.getElementById("wfm-sem-status").innerHTML =
        `<div class="${ready ? "wfm-sem-ok" : "wfm-sem-ng"}">${escapeHtml(keyLine)}</div>` +
        `<div>${escapeHtml(st.indexed_total ? st.index_model : "-")} / ${escapeHtml(idxLine)}</div>` +
        (scopeLine ? `<div>${escapeHtml(scopeLine)}</div>` : "");
    document.getElementById("wfm-sem-folder").textContent = folder || t("semNoFolder");

    const prog = document.getElementById("wfm-sem-progress");
    const hasJob = job.running || job.finished;
    prog.style.display = hasJob ? "" : "none";
    if (hasJob) {
        const total = job.total || 0;
        const doneAll = (job.done || 0) + (job.failed || 0);
        document.getElementById("wfm-sem-bar-fill").style.width = total ? `${Math.min(100, (doneAll / total) * 100)}%` : "100%";
        let text = t("semProgress", job.done || 0, total, job.failed || 0);
        if (job.running && job.current) text += `  ${job.current}`;
        if (!job.running) {
            if (["no_api_key", "api_key_invalid", "local_error", "ollama_unreachable", "ollama_model_missing"].includes(job.error_code)) text += `  ${t(`sem_err_${job.error_code}`, job.error)}`;
            else text += `  ${job.cancelled ? t("semCancelled") : t("semFinished")}`;
            if (job.failed && job.error) text += `  (${job.error})`;
        }
        document.getElementById("wfm-sem-progress-text").textContent = text;
    }
    document.getElementById("wfm-sem-start").disabled = !!job.running || !ready;
    document.getElementById("wfm-sem-cancel").disabled = !job.running;
    document.getElementById("wfm-sem-clear").disabled = !!job.running;
    document.getElementById("wfm-sem-test").disabled = !ready;

    clearTimeout(_pollTimer);
    if (job.running) {
        _pollTimer = setTimeout(refreshModal, 1000);
        _sawRunning = true;
    } else if (_sawRunning) {
        _sawRunning = false;
        refreshSemanticDots();
    }
}

/** ヘルプタブのGallery > セマンティック検索の説明へ飛ぶ */
function openSemanticHelp() {
    closeSemanticModal();
    document.querySelector('.wfm-tab[data-tab="help"]')?.click();
    document.querySelector('.wfm-help-nav-item[data-help-page="gallery"]')?.click();
    const target = document.getElementById("wfm-help-gallery-33");
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("wfm-help-flash");
    setTimeout(() => target.classList.remove("wfm-help-flash"), 2500);
}

function openSemanticModal() {
    if (!ctx.getFolder()) {
        showToast(t("semNoFolder"), "error");
        return;
    }
    openModal(t("semModalTitle"), modalHtml());
    const dimOf = () => parseInt(document.getElementById("wfm-sem-dim").value, 10) || 0;
    // ローカルモデル選択時のみ Ollama の設定を送る(サーバー側で保存され、検索時のクエリ埋め込みにも使われる)
    const ollamaOpts = () => ({
        ollama_url: document.getElementById("wfm-sem-ollama-url").value.trim(),
        ollama_tag: document.getElementById("wfm-sem-ollama-tag").value,
    });
    const localOpts = () => selectedModel() === LOCAL ? ollamaOpts() : {};
    const saveOllamaOpts = async () => {
        try {
            await postJson(API.options, ollamaOpts());
        } catch (e) {
            showToast(semanticErrorMessage(e), "error");
        }
        refreshModal();
    };
    document.getElementById("wfm-sem-ollama-url").addEventListener("change", saveOllamaOpts);
    document.getElementById("wfm-sem-ollama-tag").addEventListener("change", saveOllamaOpts);
    document.querySelectorAll('input[name="wfm-sem-model"]').forEach(r => r.addEventListener("change", () => {
        fillDims(selectedModel(), 0);
        refreshModal();
    }));

    document.getElementById("wfm-sem-recursive").addEventListener("change", (e) => {
        lsSet(LS_SUB, e.target.checked ? "1" : "0");
        refreshModal();
    });
    document.getElementById("wfm-sem-close").addEventListener("click", closeSemanticModal);
    document.querySelectorAll(".wfm-sem-tab-btn").forEach(btn => btn.addEventListener("click", () => {
        document.querySelectorAll(".wfm-sem-tab-btn").forEach(b => b.classList.toggle("active", b === btn));
        document.querySelectorAll(".wfm-sem-pane").forEach(p => { p.style.display = p.dataset.semPane === btn.dataset.semTab ? "" : "none"; });
        lsSet(LS_TAB, btn.dataset.semTab);
    }));
    ["wfm-sem-th-similar", "wfm-sem-th-text"].forEach(id => document.getElementById(id).addEventListener("change", saveThresholdInputs));
    document.getElementById("wfm-sem-th-limit").addEventListener("change", saveThresholdInputs);
    document.getElementById("wfm-sem-help").addEventListener("click", openSemanticHelp);
    document.getElementById("wfm-sem-start").addEventListener("click", async () => {
        const mode = document.querySelector('input[name="wfm-sem-mode"]:checked')?.value || "missing";
        if (mode === "all" && !confirm(t("semConfirmAll"))) return;
        lsSet(LS_DIM, String(dimOf()));
        lsSet(LS_MODEL, selectedModel());
        try {
            await postJson(API.index, {
                folder: ctx.getFolder(),
                recursive: document.getElementById("wfm-sem-recursive").checked,
                mode,
                model: selectedModel(),
                dim: dimOf(),
                ...localOpts(),
            });
        } catch (e) {
            showToast(semanticErrorMessage(e), "error");
        }
        refreshModal();
    });
    document.getElementById("wfm-sem-cancel").addEventListener("click", async () => {
        await postJson(API.cancel, {}).catch(() => {});
        refreshModal();
    });
    document.getElementById("wfm-sem-test").addEventListener("click", async () => {
        try {
            const r = await postJson(API.test, { model: selectedModel(), dim: dimOf(), ...localOpts() });
            showToast(r.provider && r.provider !== "API" ? t("semTestOkProvider", r.dimensions, r.provider) : t("semTestOk", r.dimensions), "success");
        } catch (e) {
            showToast(semanticErrorMessage(e), "error");
        }
    });
    document.getElementById("wfm-sem-clear").addEventListener("click", async () => {
        if (!confirm(t("semConfirmClear"))) return;
        try {
            await postJson(API.clear, {});
            showToast(t("semCleared"), "success");
            refreshSemanticDots();
        } catch (e) {
            showToast(semanticErrorMessage(e), "error");
        }
        refreshModal();
    });
    refreshModal();
}

// ── 初期化 ───────────────────────────────────────────────────

/**
 * @param {object} context
 *  getSearch(): 検索ボックスの文字列 / getFolder(): 選択中フォルダ / getSelected(): 選択中画像
 *  reload(): 一覧再読込(loadImages)
 */
export function initSemantic(context) {
    ctx = context;
    sem.on = lsGet(LS_ON, "0") === "1";
    updateToggleUi();
    updateSimilarButtons();

    document.getElementById("wfm-gallery-semantic-toggle")?.addEventListener("click", () => {
        sem.on = !sem.on;
        lsSet(LS_ON, sem.on ? "1" : "0");
        updateToggleUi();
        // OFFにしたら類似表示も解除する（2行目ごと消えるため）
        const wasSimilar = !!sem.anchor;
        if (!sem.on) exitSimilarMode();
        // 検索文字列があれば、モード切替後の方式で結果を取り直す
        if (wasSimilar && !sem.on || (ctx.getSearch() || "").trim()) ctx.reload();
    });
    fetch(API.status("", true)).then(r => r.json()).then(st => {
        if (st.indexed_total) sem.indexModel = st.index_model;
    }).catch(() => { /* 取得できなくても既定のモデル扱いで動作する */ });
    document.getElementById("wfm-gallery-semantic-settings-btn")?.addEventListener("click", openSemanticModal);
    document.getElementById("wfm-gallery-similar-btn")?.addEventListener("click", toggleSimilar);
    document.getElementById("wfm-gallery-similar-refresh-btn")?.addEventListener("click", applySimilar);
}

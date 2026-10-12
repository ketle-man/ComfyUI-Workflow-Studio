/**
 * Gallery Tab - セマンティック検索 (Gemini Embedding 2)
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
    test:    "/wfm/gallery/semantic/test",
};

const LS_ON = "wfm_gallery_semantic_on";
const LS_DIM = "wfm_gallery_semantic_dim";
const LS_MODEL = "wfm_gallery_semantic_model";
const GEMINI = "gemini-embedding-2";
const LOCAL = "embeddinggemma-2";
const LS_SUB = "wfm_gallery_semantic_recursive";

const sem = {
    on: false,             // Semantic Searchトグル
    anchor: "",            // 類似画像表示中の基準画像パス（空=類似表示OFF）
    anchorName: "",
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
        "folder_not_allowed", "unsupported_type", "network_error", "api_error", "local_error"];
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

/** モードに応じてサーバーから結果（スコア降順・score付き）を取得する */
export async function fetchSemanticImages(mode, folder) {
    const data = mode.kind === "similar"
        ? await postJson(API.similar, { path: mode.path, folder, recursive: true })
        : await postJson(API.search, { query: mode.query, folder, recursive: true });
    return data.images || [];
}

/** 一覧件数ラベル */
export function semanticCountLabel(mode, count) {
    return mode.kind === "similar"
        ? t("semCountSimilar", count, mode.name)
        : t("semCountText", count);
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
    return `
    <div class="wfm-sem-modal">
        <div class="wfm-sem-status" id="wfm-sem-status">${escapeHtml(t("loading"))}</div>
        <div class="wfm-sem-row"><b>${escapeHtml(t("semScope"))}</b>
            <span id="wfm-sem-folder" class="wfm-sem-folder"></span></div>
        <label class="wfm-sem-row"><input type="checkbox" id="wfm-sem-recursive" ${lsGet(LS_SUB, "1") === "1" ? "checked" : ""}>
            ${escapeHtml(t("semIncludeSub"))}</label>
        <div class="wfm-sem-row"><b>${escapeHtml(t("semModel"))}</b>
            <label><input type="radio" name="wfm-sem-model" value="${GEMINI}"> ${escapeHtml(t("semModelGemini"))}</label>
            <label><input type="radio" name="wfm-sem-model" value="${LOCAL}"> ${escapeHtml(t("semModelLocal"))}</label></div>
        <div class="wfm-sem-row"><b>${escapeHtml(t("semDimension"))}</b>
            <select id="wfm-sem-dim" class="wfm-select"></select>
            <span class="wfm-sem-hint">${escapeHtml(t("semDimHint"))}</span></div>
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
            <button class="wfm-btn" id="wfm-sem-test">${escapeHtml(t("semTest"))}</button>
            <button class="wfm-btn" id="wfm-sem-clear">${escapeHtml(t("semClear"))}</button>
            <button class="wfm-btn" id="wfm-sem-close">${escapeHtml(t("close"))}</button>
        </div>
        <p class="wfm-sem-hint">${escapeHtml(t("semCostNote"))}</p>
    </div>`;
}

function modalAlive() {
    const overlay = document.getElementById("wfm-modal-overlay");
    return !!document.getElementById("wfm-sem-status") && overlay && overlay.style.display !== "none";
}

let _pollTimer = null;
let _backends = {};

function selectedModel() {
    return document.querySelector('input[name="wfm-sem-model"]:checked')?.value || GEMINI;
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
    if (!document.getElementById("wfm-sem-dim").dataset.init) {
        // 初回のみ: 既存インデックスのモデル/次元、なければ前回の選択を初期値にする
        const initModel = st.indexed_total ? st.index_model : lsGet(LS_MODEL, GEMINI);
        const radio = document.querySelector(`input[name="wfm-sem-model"][value="${initModel}"]`)
            || document.querySelector(`input[name="wfm-sem-model"][value="${GEMINI}"]`);
        radio.checked = true;
        fillDims(radio.value, st.indexed_total ? st.index_dim : parseInt(lsGet(LS_DIM, "0"), 10));
        document.getElementById("wfm-sem-dim").dataset.init = "1";
    }
    const model = selectedModel();
    const ready = model === LOCAL ? true : !!st.has_key;
    const keyLine = model === LOCAL
        ? (_backends[LOCAL]?.downloaded ? t("semLocalReady") : t("semLocalNeedDownload"))
        : (st.has_key ? t("semKeyOk") : t("semKeyMissing"));
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
            if (["no_api_key", "api_key_invalid", "local_error"].includes(job.error_code)) text += `  ${t(`sem_err_${job.error_code}`, job.error)}`;
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
    if (job.running) _pollTimer = setTimeout(refreshModal, 1000);
}

function openSemanticModal() {
    if (!ctx.getFolder()) {
        showToast(t("semNoFolder"), "error");
        return;
    }
    openModal(t("semModalTitle"), modalHtml());
    const dimOf = () => parseInt(document.getElementById("wfm-sem-dim").value, 10) || 0;
    document.querySelectorAll('input[name="wfm-sem-model"]').forEach(r => r.addEventListener("change", () => {
        fillDims(selectedModel(), 0);
        refreshModal();
    }));

    document.getElementById("wfm-sem-recursive").addEventListener("change", (e) => {
        lsSet(LS_SUB, e.target.checked ? "1" : "0");
        refreshModal();
    });
    document.getElementById("wfm-sem-close").addEventListener("click", () => {
        clearTimeout(_pollTimer);
        closeModal();
    });
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
            const r = await postJson(API.test, { model: selectedModel(), dim: dimOf() });
            showToast(t("semTestOk", r.dimensions), "success");
        } catch (e) {
            showToast(semanticErrorMessage(e), "error");
        }
    });
    document.getElementById("wfm-sem-clear").addEventListener("click", async () => {
        if (!confirm(t("semConfirmClear"))) return;
        try {
            await postJson(API.clear, {});
            showToast(t("semCleared"), "success");
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
        // 検索文字列があれば、モード切替後の方式で結果を取り直す
        if ((ctx.getSearch() || "").trim()) ctx.reload();
    });
    document.getElementById("wfm-gallery-semantic-settings-btn")?.addEventListener("click", openSemanticModal);
    document.getElementById("wfm-gallery-similar-btn")?.addEventListener("click", toggleSimilar);
    document.getElementById("wfm-gallery-similar-refresh-btn")?.addEventListener("click", applySimilar);
}

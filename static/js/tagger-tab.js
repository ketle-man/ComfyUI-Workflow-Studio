/**
 * Tagger Tab
 * Handles WD Tagger / DeepDanbooru + Ollama VLM single/batch tagging.
 */

import { t } from "./i18n.js";
import { showToast } from "./app.js";

// ── 状態 ────────────────────────────────────────────────────────

const state = {
    /** @type {string|null} 現在の画像 base64 (data URI prefix を除く) */
    imageB64: null,
    /** @type {string} 元のファイルパス (Galleryから来た場合) */
    imagePath: "",
    /** @type {string} 表示名 */
    imageName: "",
    /** @type {NodeJS.Timeout|null} バッチポーリングタイマー */
    batchPollTimer: null,
    /** @type {number|null} DB編集中の行ID */
    dbEditId: null,
};

// ── 初期化 ──────────────────────────────────────────────────────

export function initTaggerTab() {
    _applyI18n();
    _setupSubtabs();
    _setupSliders();
    _setupOllamaToggle();
    _setupSingleActions();
    _setupBatchActions();
    _setupDbActions();
    _loadModels();
    _loadSettings();
}

/** GalleryタブからTaggerタブへ画像を渡す */
export function openImageInTaggerTab(img) {
    // タブを切り替え
    document.querySelectorAll(".wfm-tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".wfm-tab-content").forEach(s => s.classList.remove("active"));
    const btn = document.querySelector('.wfm-tab[data-tab="tagger"]');
    const sec = document.getElementById("wfm-tab-tagger");
    if (btn) btn.classList.add("active");
    if (sec) sec.classList.add("active");

    // 画像を読み込む (Gallery APIから取得)
    if (!img?.path) return;
    const url = `/wfm/gallery/image/serve?path=${encodeURIComponent(img.path)}`;
    fetch(url)
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.blob();
        })
        .then(blob => {
            const reader = new FileReader();
            reader.onload = e => {
                _setPreviewFromDataUrl(e.target.result, img.filename || img.path.split(/[\\/]/).pop());
                state.imagePath = img.path;
            };
            reader.readAsDataURL(blob);
        })
        .catch(() => showToast(t("taggerNoImage"), "error"));
}

// ── i18n ─────────────────────────────────────────────────────────

function _applyI18n() {
    const map = {
        "wfm-tagger-from-gallery-btn": "taggerFromGallery",
        "wfm-tagger-upload-label": "taggerUpload",
        "wfm-tagger-threshold-label": "taggerThreshold",
        "wfm-tagger-char-threshold-label": "taggerCharThreshold",
        "wfm-tagger-generate-btn": "taggerGenerateTags",
        "wfm-tagger-ollama-header-label": "taggerOllamaEnable",
        "wfm-tagger-ollama-url-label": "taggerOllamaUrl",
        "wfm-tagger-ollama-model-label": "taggerOllamaModel",
        "wfm-tagger-ollama-prompt-label": "taggerOllamaPrompt",
        "wfm-tagger-ollama-max-label": "taggerOllamaMaxTags",
        "wfm-tagger-result-header": "taggerResult",
        "wfm-tagger-send-genui-btn": "taggerSendToGenUI",
        "wfm-tagger-send-prompt-btn": "taggerSendToPrompt",
        "wfm-tagger-save-gallery-btn": "taggerSaveToGallery",
        "wfm-tagger-write-file-btn": "taggerWriteToFile",
        "wfm-tagger-save-db-btn": "taggerSaveToDB",
        "wfm-tagger-batch-folder-header": "taggerBatchFolder",
        "wfm-tagger-batch-threshold-label": "taggerThreshold",
        "wfm-tagger-batch-char-threshold-label": "taggerCharThreshold",
        "wfm-tagger-batch-url-label": "taggerOllamaUrl",
        "wfm-tagger-batch-model-label": "taggerOllamaModel",
        "wfm-tagger-batch-prompt-label": "taggerOllamaPrompt",
        "wfm-tagger-batch-output-header": "taggerBatchOutput",
        "wfm-tagger-batch-save-db-label": "taggerSaveToDB",
        "wfm-tagger-batch-write-file-label": "taggerWriteToFile",
        "wfm-tagger-batch-write-txt-label": "taggerBatchWriteTxt",
        "wfm-tagger-batch-start-btn": "taggerBatchStart",
        "wfm-tagger-batch-stop-btn": "taggerBatchStop",
        "wfm-tagger-db-search-btn": "taggerDbSearch",
        "wfm-tagger-db-show-all-btn": "taggerDbShowAll",
        "wfm-tagger-db-export-btn": "taggerDbExport",
        "wfm-tagger-db-th-file": "taggerDbFile",
        "wfm-tagger-db-th-interrogator": "taggerDbInterrogator",
        "wfm-tagger-db-th-vlm": "taggerDbVlm",
        "wfm-tagger-db-th-date": "taggerDbDate",
        "wfm-tagger-db-edit-interr-label": "taggerDbInterrogator",
        "wfm-tagger-db-edit-vlm-label": "taggerDbVlm",
        "wfm-tagger-db-save-btn": "taggerDbSave",
        "wfm-tagger-db-delete-btn": "taggerDbDelete",
    };
    for (const [id, key] of Object.entries(map)) {
        const el = document.getElementById(id);
        if (el) el.textContent = t(key);
    }

    // サブタブボタン
    const subtabKeys = ["taggerSingleTab", "taggerBatchTab", "taggerDbTab"];
    document.querySelectorAll(".wfm-tagger-subtab-btn").forEach((btn, i) => {
        btn.textContent = t(subtabKeys[i] || "");
    });

    // プレースホルダー
    const ph = document.getElementById("wfm-tagger-preview-placeholder");
    if (ph) ph.textContent = t("taggerNoImage");
}

// ── サブタブ切り替え ─────────────────────────────────────────────

function _setupSubtabs() {
    document.querySelectorAll(".wfm-tagger-subtab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-tagger-subtab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const tab = btn.dataset.taggerTab;
            document.querySelectorAll(".wfm-tagger-subtab").forEach(s => {
                s.style.display = s.id === `wfm-tagger-${tab}` ? "" : "none";
            });
            if (tab === "db") _dbLoad();
        });
    });
}

// ── スライダー ───────────────────────────────────────────────────

function _setupSliders() {
    [
        ["wfm-tagger-threshold", "wfm-tagger-threshold-val"],
        ["wfm-tagger-char-threshold", "wfm-tagger-char-threshold-val"],
        ["wfm-tagger-batch-threshold", "wfm-tagger-batch-threshold-val"],
        ["wfm-tagger-batch-char-threshold", "wfm-tagger-batch-char-threshold-val"],
    ].forEach(([sliderId, valId]) => {
        const slider = document.getElementById(sliderId);
        const val = document.getElementById(valId);
        if (!slider || !val) return;
        val.textContent = slider.value;
        slider.addEventListener("input", () => { val.textContent = slider.value; });
    });
}

// ── Ollama トグル ────────────────────────────────────────────────

function _setupOllamaToggle() {
    const chk = document.getElementById("wfm-tagger-ollama-enable");
    const wrap = document.getElementById("wfm-tagger-ollama-settings");
    if (chk && wrap) {
        chk.addEventListener("change", () => {
            wrap.style.display = chk.checked ? "" : "none";
        });
        wrap.style.display = chk.checked ? "" : "none";
    }
}

// ── モデル一覧ロード ─────────────────────────────────────────────

async function _loadModels() {
    try {
        const res = await fetch("/wfm/tagger/models");
        const data = await res.json();
        const models = data.models || [];
        ["wfm-tagger-model", "wfm-tagger-batch-model"].forEach(selId => {
            const sel = document.getElementById(selId);
            if (!sel) return;
            sel.innerHTML = `<option value="">${t("taggerNoModel")}</option>` +
                models.map(m => `<option value="${m.name}">[${m.type}] ${m.name}</option>`).join("");
        });
    } catch (e) {
        console.warn("tagger: _loadModels error", e);
    }
}

// ── Ollamaモデル一覧ロード ───────────────────────────────────────

async function _loadOllamaModels(urlId, selId) {
    const urlEl = document.getElementById(urlId);
    const selEl = document.getElementById(selId);
    if (!urlEl || !selEl) return;
    const api = urlEl.value || "http://127.0.0.1:11434";
    try {
        const res = await fetch(`/wfm/tagger/ollama/models?api_url=${encodeURIComponent(api)}`);
        const data = await res.json();
        const models = data.models || [];
        if (models.length === 0) {
            selEl.innerHTML = `<option value="">(${t("taggerNoModel")})</option>`;
        } else {
            selEl.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join("");
        }
    } catch {
        selEl.innerHTML = `<option value="">(${t("taggerNoModel")})</option>`;
    }
}

// ── 設定の読み込み/保存 ─────────────────────────────────────────

async function _loadSettings() {
    try {
        const res = await fetch("/wfm/tagger/settings");
        const data = await res.json();
        if (data.ollama_url) {
            const el = document.getElementById("wfm-tagger-ollama-url");
            if (el) el.value = data.ollama_url;
        }
        if (data.batch_ollama_url) {
            const el = document.getElementById("wfm-tagger-batch-ollama-url");
            if (el) el.value = data.batch_ollama_url;
        }
    } catch {
        // 初回は無視
    }
}

async function _saveSettings() {
    try {
        await fetch("/wfm/tagger/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ollama_url: document.getElementById("wfm-tagger-ollama-url")?.value || "",
                batch_ollama_url: document.getElementById("wfm-tagger-batch-ollama-url")?.value || "",
            }),
        });
    } catch {
        // サイレントに失敗
    }
}

// ── Single サブタブ ─────────────────────────────────────────────

function _setupSingleActions() {
    // ファイルアップロード
    document.getElementById("wfm-tagger-upload")?.addEventListener("change", e => {
        const file = e.target.files?.[0];
        if (!file) return;
        _loadImageFile(file);
        e.target.value = "";
    });

    // ドラッグ＆ドロップ
    const dropZone = document.getElementById("wfm-tagger-drop-zone");
    if (dropZone) {
        dropZone.addEventListener("dragover", e => {
            e.preventDefault();
            dropZone.classList.add("drag-over");
        });
        dropZone.addEventListener("dragleave", e => {
            if (!dropZone.contains(e.relatedTarget)) {
                dropZone.classList.remove("drag-over");
            }
        });
        dropZone.addEventListener("drop", e => {
            e.preventDefault();
            dropZone.classList.remove("drag-over");
            const file = e.dataTransfer.files?.[0];
            if (file && file.type.startsWith("image/")) {
                _loadImageFile(file);
            }
        });
    }

    // タグ生成
    document.getElementById("wfm-tagger-generate-btn")?.addEventListener("click", _generateTags);

    // Ollamaリフレッシュ
    document.getElementById("wfm-tagger-ollama-refresh-btn")?.addEventListener("click", () => {
        _loadOllamaModels("wfm-tagger-ollama-url", "wfm-tagger-ollama-model");
    });

    // 結果アクション
    document.getElementById("wfm-tagger-send-genui-btn")?.addEventListener("click", _sendToGenUI);
    document.getElementById("wfm-tagger-send-prompt-btn")?.addEventListener("click", _sendToPrompt);
    document.getElementById("wfm-tagger-save-gallery-btn")?.addEventListener("click", _saveToGallery);
    document.getElementById("wfm-tagger-write-file-btn")?.addEventListener("click", _writeToFile);
    document.getElementById("wfm-tagger-save-db-btn")?.addEventListener("click", _saveToDb);
}

function _loadImageFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
        _setPreviewFromDataUrl(e.target.result, file.name);
        state.imagePath = "";
    };
    reader.readAsDataURL(file);
}

function _setPreviewFromDataUrl(dataUrl, name) {
    state.imageB64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
    state.imageName = name;
    const img = document.getElementById("wfm-tagger-preview");
    const ph = document.getElementById("wfm-tagger-preview-placeholder");
    const nameEl = document.getElementById("wfm-tagger-image-name");
    if (img) { img.src = dataUrl; img.style.display = ""; }
    if (ph) ph.style.display = "none";
    if (nameEl) nameEl.textContent = name;
}

async function _generateTags() {
    if (!state.imageB64) {
        showToast(t("taggerNoImage"), "warning");
        return;
    }
    const model = document.getElementById("wfm-tagger-model")?.value || "";
    const threshold = parseFloat(document.getElementById("wfm-tagger-threshold")?.value || "0.35");
    const charThreshold = parseFloat(document.getElementById("wfm-tagger-char-threshold")?.value || "0.85");
    const useOllama = document.getElementById("wfm-tagger-ollama-enable")?.checked || false;
    const ollamaUrl = document.getElementById("wfm-tagger-ollama-url")?.value || "http://127.0.0.1:11434";
    const ollamaModel = document.getElementById("wfm-tagger-ollama-model")?.value || "";
    const ollamaPrompt = document.getElementById("wfm-tagger-ollama-prompt")?.value || "";
    const maxTags = parseInt(document.getElementById("wfm-tagger-ollama-max-tags")?.value || "40");

    const generateBtn = document.getElementById("wfm-tagger-generate-btn");
    if (generateBtn) { generateBtn.disabled = true; generateBtn.textContent = "..."; }

    try {
        let tags = "";

        if (model) {
            const res = await fetch("/wfm/tagger/predict", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image_b64: state.imageB64, model, threshold, char_threshold: charThreshold }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            tags = data.tags || "";
        }

        if (useOllama && ollamaModel) {
            const res2 = await fetch("/wfm/tagger/ollama/predict", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    image_b64: state.imageB64, api_url: ollamaUrl,
                    model: ollamaModel, prompt: ollamaPrompt, max_tags: maxTags,
                }),
            });
            const data2 = await res2.json();
            if (data2.error) throw new Error(data2.error);
            const vlm = data2.tags || "";
            tags = [tags, vlm].filter(Boolean).join(", ");
        }

        if (!tags) { showToast(t("taggerNoTags"), "warning"); return; }
        document.getElementById("wfm-tagger-result").value = tags;
        showToast(t("taggerDone"), "success");
        _saveSettings();
    } catch (e) {
        showToast(e.message, "error");
    } finally {
        if (generateBtn) { generateBtn.disabled = false; generateBtn.textContent = t("taggerGenerateTags"); }
    }
}

function _sendToGenUI() {
    const tags = document.getElementById("wfm-tagger-result")?.value || "";
    if (!tags) { showToast(t("taggerNoTags"), "warning"); return; }
    const ta = document.getElementById("wfm-prompt-pos-text");
    if (!ta) { showToast(t("taggerNoGenUI"), "warning"); return; }
    const cur = ta.value;
    ta.value = cur ? `${cur}, ${tags}` : tags;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("wfm-prompt-pos-apply")?.click();
    showToast(t("taggerSentToGenUI"), "success");
}

function _sendToPrompt() {
    const tags = document.getElementById("wfm-tagger-result")?.value || "";
    if (!tags) { showToast(t("taggerNoTags"), "warning"); return; }
    const ta = document.getElementById("wfm-preset-pos");
    if (!ta) { showToast(t("taggerNoGalleryImage"), "warning"); return; }
    const cur = ta.value;
    ta.value = cur ? `${cur}, ${tags}` : tags;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    showToast(t("taggerSentToPrompt"), "success");
}

async function _saveToGallery() {
    const tags = document.getElementById("wfm-tagger-result")?.value || "";
    if (!tags || !state.imagePath) {
        showToast(t("taggerNoGalleryImage"), "warning");
        return;
    }
    try {
        const tagsArray = tags.split(",").map(s => s.trim()).filter(Boolean);
        const res = await fetch("/wfm/gallery/image/meta", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: state.imagePath, tags: tagsArray }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        showToast(t("taggerSavedToGallery"), "success");
    } catch (e) {
        showToast(e.message, "error");
    }
}

async function _writeToFile() {
    const tags = document.getElementById("wfm-tagger-result")?.value || "";
    if (!tags || !state.imagePath) {
        showToast(t("taggerNoGalleryImage"), "warning");
        return;
    }
    try {
        const res = await fetch("/wfm/tagger/write_meta", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: state.imagePath, tags }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        showToast(t("taggerWrittenToFile"), "success");
    } catch (e) {
        showToast(e.message, "error");
    }
}

async function _saveToDb() {
    const tags = document.getElementById("wfm-tagger-result")?.value || "";
    if (!tags) { showToast(t("taggerNoTags"), "warning"); return; }
    try {
        const res = await fetch("/wfm/tagger/db/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: state.imageName, interrogator_tags: tags, vlm_tags: "" }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        showToast(t("taggerSavedToDB"), "success");
    } catch (e) {
        showToast(e.message, "error");
    }
}

// ── Batch サブタブ ───────────────────────────────────────────────

function _setupBatchActions() {
    document.getElementById("wfm-tagger-batch-ollama-refresh-btn")?.addEventListener("click", () => {
        _loadOllamaModels("wfm-tagger-batch-ollama-url", "wfm-tagger-batch-ollama-model");
    });

    document.getElementById("wfm-tagger-batch-start-btn")?.addEventListener("click", _batchStart);
    document.getElementById("wfm-tagger-batch-stop-btn")?.addEventListener("click", _batchStop);
}

async function _batchStart() {
    const folder = document.getElementById("wfm-tagger-batch-folder")?.value || "";
    if (!folder) { showToast(t("taggerBatchFolder"), "warning"); return; }

    const body = {
        folder,
        model: document.getElementById("wfm-tagger-batch-model")?.value || "",
        threshold: parseFloat(document.getElementById("wfm-tagger-batch-threshold")?.value || "0.35"),
        char_threshold: parseFloat(document.getElementById("wfm-tagger-batch-char-threshold")?.value || "0.85"),
        use_ollama: document.getElementById("wfm-tagger-batch-ollama-enable")?.checked || false,
        ollama_api: document.getElementById("wfm-tagger-batch-ollama-url")?.value || "http://127.0.0.1:11434",
        ollama_model: document.getElementById("wfm-tagger-batch-ollama-model")?.value || "",
        ollama_prompt: document.getElementById("wfm-tagger-batch-ollama-prompt")?.value || "",
        save_db: document.getElementById("wfm-tagger-batch-save-db")?.checked ?? true,
        write_file: document.getElementById("wfm-tagger-batch-write-file")?.checked || false,
        write_txt: document.getElementById("wfm-tagger-batch-write-txt")?.checked || false,
    };

    try {
        const res = await fetch("/wfm/tagger/batch/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        document.getElementById("wfm-tagger-batch-start-btn").disabled = true;
        document.getElementById("wfm-tagger-batch-stop-btn").disabled = false;
        document.getElementById("wfm-tagger-batch-log").value = "";
        _startBatchPoll();
    } catch (e) {
        showToast(e.message, "error");
    }
}

async function _batchStop() {
    await fetch("/wfm/tagger/batch/stop", { method: "POST" });
}

function _startBatchPoll() {
    if (state.batchPollTimer) clearInterval(state.batchPollTimer);
    state.batchPollTimer = setInterval(_pollBatch, 1000);
}

async function _pollBatch() {
    try {
        const res = await fetch("/wfm/tagger/batch/status");
        const data = await res.json();

        const total = data.total || 0;
        const done = data.done || 0;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;

        const bar = document.getElementById("wfm-tagger-batch-progress-bar");
        const txt = document.getElementById("wfm-tagger-batch-progress-text");
        if (bar) bar.style.width = pct + "%";
        if (txt) txt.textContent = `${done} / ${total} (${pct}%)`;

        const logEl = document.getElementById("wfm-tagger-batch-log");
        if (logEl && data.log?.length) {
            logEl.value = data.log.join("\n");
            logEl.scrollTop = logEl.scrollHeight;
        }

        if (!data.running) {
            clearInterval(state.batchPollTimer);
            state.batchPollTimer = null;
            document.getElementById("wfm-tagger-batch-start-btn").disabled = false;
            document.getElementById("wfm-tagger-batch-stop-btn").disabled = true;
            showToast(t("taggerDone"), "success");
        }
    } catch {
        // 無視
    }
}

// ── DB サブタブ ──────────────────────────────────────────────────

function _setupDbActions() {
    document.getElementById("wfm-tagger-db-search-btn")?.addEventListener("click", _dbSearch);
    document.getElementById("wfm-tagger-db-show-all-btn")?.addEventListener("click", _dbLoad);
    document.getElementById("wfm-tagger-db-export-btn")?.addEventListener("click", _dbExport);
    document.getElementById("wfm-tagger-db-search-input")?.addEventListener("keydown", e => {
        if (e.key === "Enter") _dbSearch();
    });
    document.getElementById("wfm-tagger-db-save-btn")?.addEventListener("click", _dbSave);
    document.getElementById("wfm-tagger-db-delete-btn")?.addEventListener("click", _dbDelete);
}

async function _dbLoad() {
    try {
        const res = await fetch("/wfm/tagger/db/list?limit=200&offset=0");
        const data = await res.json();
        _renderDbTable(data.rows || []);
    } catch (e) {
        showToast(e.message, "error");
    }
}

async function _dbSearch() {
    const q = document.getElementById("wfm-tagger-db-search-input")?.value || "";
    if (!q) { _dbLoad(); return; }
    try {
        const res = await fetch(`/wfm/tagger/db/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        _renderDbTable(data.rows || []);
    } catch (e) {
        showToast(e.message, "error");
    }
}

function _renderDbTable(rows) {
    const tbody = document.getElementById("wfm-tagger-db-tbody");
    if (!tbody) return;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--wfm-text-secondary)">${t("taggerDbEmpty")}</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(row => `
        <tr data-id="${row.id}" title="${_esc(row.all_tags)}">
            <td>${row.id}</td>
            <td>${_esc(row.filename)}</td>
            <td>${_esc(_truncate(row.interrogator_tags, 60))}</td>
            <td>${_esc(_truncate(row.vlm_tags, 60))}</td>
            <td>${_esc(row.created_at?.split("T")[0] || row.created_at || "")}</td>
        </tr>
    `).join("");

    tbody.querySelectorAll("tr").forEach(tr => {
        tr.addEventListener("click", () => {
            tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
            tr.classList.add("selected");
            const row = rows.find(r => r.id === parseInt(tr.dataset.id));
            if (row) _openDbEdit(row);
        });
    });
}

function _openDbEdit(row) {
    state.dbEditId = row.id;
    const panel = document.getElementById("wfm-tagger-db-edit-panel");
    const header = document.getElementById("wfm-tagger-db-edit-header");
    const interrEl = document.getElementById("wfm-tagger-db-edit-interrogator");
    const vlmEl = document.getElementById("wfm-tagger-db-edit-vlm");
    if (!panel) return;
    if (header) header.textContent = `ID: ${row.id}  ${row.filename}`;
    if (interrEl) interrEl.value = row.interrogator_tags;
    if (vlmEl) vlmEl.value = row.vlm_tags;
    panel.style.display = "";
}

async function _dbSave() {
    if (state.dbEditId == null) return;
    const interrogator_tags = document.getElementById("wfm-tagger-db-edit-interrogator")?.value || "";
    const vlm_tags = document.getElementById("wfm-tagger-db-edit-vlm")?.value || "";
    try {
        const res = await fetch(`/wfm/tagger/db/${state.dbEditId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ interrogator_tags, vlm_tags }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        showToast(t("taggerDbSaved"), "success");
        _dbLoad();
    } catch (e) {
        showToast(e.message, "error");
    }
}

async function _dbDelete() {
    if (state.dbEditId == null) return;
    if (!confirm(`Delete DB record #${state.dbEditId}?`)) return;
    try {
        const res = await fetch(`/wfm/tagger/db/${state.dbEditId}`, { method: "DELETE" });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        document.getElementById("wfm-tagger-db-edit-panel").style.display = "none";
        state.dbEditId = null;
        showToast(t("taggerDbDeleted"), "success");
        _dbLoad();
    } catch (e) {
        showToast(e.message, "error");
    }
}

function _dbExport() {
    const a = document.createElement("a");
    a.href = "/wfm/tagger/db/export";
    a.download = "tagger_tags.csv";
    a.click();
}

// ── ユーティリティ ───────────────────────────────────────────────

function _esc(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _truncate(str, len) {
    if (!str) return "";
    return str.length > len ? str.slice(0, len) + "…" : str;
}

/**
 * Models Tab - Model browser and metadata management
 * Supports: Thumbnail / Card / Table views, side panel (Info / Group / CivitAI), detail modal with badges
 */

import { showToast, openModal, closeModal } from "./app.js";
import { t } from "./i18n.js";
import { comfyUI } from "./comfyui-client.js";
import { comfyEditor } from "./comfyui-editor.js";
import { escapeHtml, readJsonStorage } from "./util.js";

// ── Constants ─────────────────────────────────────────────
const RESERVED_GROUPS = ["Batch", "Stack"];
const BATCH_MODEL_TYPES = ["checkpoint", "lora"];
const STACK_MODEL_TYPES = ["lora"];

// ── State ─────────────────────────────────────────────────

const state = {
    modelsByType: {
        checkpoint: [],
        lora: [],
        vae: [],
        controlnet: [],
        unet: [],
        textencoder: [],
        hypernetwork: [],
        embedding: [],
    },
    modelMetadata: {},
    modelGroups: {},
    allModelGroups: {},  // { type: { groupName: [models] } } — all types
    civitaiCache: {},
    disabledModels: {},   // { type: Set<modelName> }
    subdirs: [],
    selectMode: false,
    selectedModels: new Set(),
    searchText: "",
    tagFilter: "",
    badgeFilter: "",
    dirFilter: "",
    groupFilter: "",
    statusFilter: "all",  // "all" | "enabled" | "disabled"
    showFavoritesOnly: false,
    showBatchOnly: false,
    viewMode: localStorage.getItem("wfm_models_view") === "table" ? "table" : "thumb",
    activeModelType: "checkpoint",
    selectedModel: null,
    loaded: {},
    currentPage: 0,
    sortColumn: null,  // "fav" | "filename" | "subdir" | "civtype" | "basemodel" | "ext" | "tags" | "memo" | "enabled"
    sortDir: "asc",    // "asc" | "desc"
};


const FETCH_MAP = {
    checkpoint: () => comfyUI.fetchCheckpoints(),
    lora: () => comfyUI.fetchLoras(),
    vae: () => comfyUI.fetchVaes(),
    controlnet: () => comfyUI.fetchControlNets(),
    unet: () => comfyUI.fetchDiffusionModels(),
    textencoder: () => comfyUI.fetchTextEncoders(),
    hypernetwork: () => comfyUI.fetchHypernetworks(),
    embedding: () => comfyUI.fetchEmbeddings(),
};

const TYPE_LABELS = {
    checkpoint: "Checkpoint",
    lora: "LoRA",
    vae: "VAE",
    controlnet: "ControlNet",
    unet: "UNET",
    textencoder: "TextEncoder",
    hypernetwork: "Hypernetwork",
    embedding: "Embedding",
};

// Mapping from models-tab type → comfyui-editor key + inputKey
const GENUI_TYPE_MAP = {
    checkpoint:  { key: "checkpoints",    inputKey: "ckpt_name" },
    lora:        { key: "loras",          inputKey: "lora_name" },
    vae:         { key: "vaes",           inputKey: "vae_name" },
    controlnet:  { key: "controlNets",    inputKey: "control_net_name" },
    unet:        { key: "diffusionModels",inputKey: "unet_name" },
    textencoder: { key: "textEncoders",   inputKey: "clip_name1" },
};

function applyToGenUI(modelName, modelType) {
    const mapping = GENUI_TYPE_MAP[modelType];
    if (!mapping) {
        showToast(t("modelsGenUIUnsupported"), "warning");
        return;
    }
    if (!comfyUI.currentWorkflow) {
        showToast(t("modelsGenUINoWorkflow"), "warning");
        return;
    }

    let selectEl = null;

    if (modelType === "lora") {
        // Use lora_nodes from analysis to correctly handle Lora Loader (LoraManager)
        const loraNodes = comfyUI.currentAnalysis?.lora_nodes || [];
        let nodeId = null;
        let isLoraManager = false;

        if (loraNodes.length > 0) {
            const targetNode = loraNodes[0];
            nodeId = targetNode.id;
            isLoraManager = !!targetNode.is_lora_manager;
        } else {
            // Fallback: find a standard LoraLoader node by lora_name input
            nodeId = Object.keys(comfyUI.currentWorkflow).find((id) => {
                const node = comfyUI.currentWorkflow[id];
                return node.inputs && "lora_name" in node.inputs;
            });
        }

        if (!nodeId || !comfyUI.currentWorkflow[nodeId]) {
            showToast(t("modelsGenUINoNode", TYPE_LABELS[modelType] || modelType), "warning");
            return;
        }

        const stem = modelName.replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");

        if (isLoraManager) {
            comfyUI.currentWorkflow[nodeId].inputs.loras = {
                __value__: [{ name: stem, strength: 1.0, active: true, expanded: false, clipStrength: 1.0, locked: false }],
            };
            comfyUI.currentWorkflow[nodeId].inputs.text = `<lora:${stem}:1:1>`;
        } else {
            comfyUI.currentWorkflow[nodeId].inputs.lora_name = modelName;
        }

        // Disable all Stack models and switch to Single tab
        comfyEditor.disableAllStack("wfm-gen-lora-fields");
        comfyEditor.switchLoraSingleTab();

        // Update Single tab LORA SYNTAX and TRIGGER WORDS displays
        const loraSyntax = `<lora:${stem}:1:1>`;
        const sha = (state.modelMetadata[modelName] || {}).sha256;
        const civInfo = sha && state.civitaiCache[sha];
        const triggerWords = civInfo?.trainedWords || [];

        const singleSyntaxEl = document.getElementById("wfm-lora-single-syntax");
        if (singleSyntaxEl) singleSyntaxEl.textContent = loraSyntax;

        const singleTriggersEl = document.getElementById("wfm-lora-single-triggers");
        if (singleTriggersEl) {
            singleTriggersEl.innerHTML = triggerWords.length
                ? triggerWords.map(w => `<span class="wfm-lora-trigger-word">${w}</span>`).join(" ")
                : `<span style="color:var(--wfm-text-secondary);font-size:12px;">—</span>`;
        }

        selectEl = document.getElementById("wfm-lora-select");
    } else {
        const { key, inputKey } = mapping;

        const nodeId = Object.keys(comfyUI.currentWorkflow).find((id) => {
            const node = comfyUI.currentWorkflow[id];
            return node.inputs && inputKey in node.inputs;
        });

        if (!nodeId) {
            showToast(t("modelsGenUINoNode", TYPE_LABELS[modelType] || modelType), "warning");
            return;
        }

        comfyUI.currentWorkflow[nodeId].inputs[inputKey] = modelName;
        selectEl = document.getElementById(`wfm-model-${key}`);
    }

    if (selectEl) {
        if (![...selectEl.options].some(o => o.value === modelName)) {
            const opt = document.createElement("option");
            opt.value = modelName;
            opt.textContent = modelName;
            selectEl.appendChild(opt);
        }
        selectEl.value = modelName;
    }

    const rawTextarea = document.getElementById("wfm-gen-raw-json");
    if (rawTextarea) {
        rawTextarea.value = JSON.stringify(comfyUI.currentWorkflow, null, 2);
    }

    showToast(`${TYPE_LABELS[modelType]}: ${modelName.split("/").pop().split("\\").pop()}`, "success");
}

// User-defined badge colors (stored in metadata per model)
// Global badge palette: label → color, stored in localStorage
function getBadgePalette() {
    return readJsonStorage("wfm_models_badge_palette");
}

function saveBadgePalette(palette) {
    localStorage.setItem("wfm_models_badge_palette", JSON.stringify(palette));
}

// ── Helpers ───────────────────────────────────────────────


function parseModelPath(fullName) {
    const lastSlash = Math.max(fullName.lastIndexOf("/"), fullName.lastIndexOf("\\"));
    if (lastSlash === -1) return { dir: "", name: fullName };
    return { dir: fullName.substring(0, lastSlash), name: fullName.substring(lastSlash + 1) };
}

function getExtension(name) {
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.substring(dot) : "";
}

function getStem(name) {
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.substring(0, dot) : name;
}

function previewUrl(modelName, modelType) {
    const type = modelType || state.activeModelType;
    return `/api/wfm/models/preview?type=${encodeURIComponent(type)}&name=${encodeURIComponent(modelName)}`;
}

/**
 * Load preview image. Uses img onload/onerror instead of HEAD request
 * (aiohttp add_get does not auto-handle HEAD method).
 * Falls back to CivitAI cached image if no local preview exists.
 */
function loadPreviewImage(imgEl, placeholderEl, modelName, modelType) {
    const url = previewUrl(modelName, modelType);
    imgEl.onload = () => {
        imgEl.style.display = "";
        if (placeholderEl) placeholderEl.style.display = "none";
    };
    imgEl.onerror = () => {
        // Fallback: use CivitAI cached image if available
        const meta = state.modelMetadata[modelName] || {};
        const sha256 = meta.sha256;
        const civitai = sha256 && state.civitaiCache[sha256];
        const civitaiImg = civitai && civitai.images && civitai.images[0];
        if (civitaiImg) {
            imgEl.onerror = () => {
                imgEl.style.display = "none";
                if (placeholderEl) placeholderEl.style.display = "";
            };
            imgEl.src = civitaiImg;
            imgEl.style.display = "";
            if (placeholderEl) placeholderEl.style.display = "none";
        } else {
            imgEl.style.display = "none";
            if (placeholderEl) placeholderEl.style.display = "";
        }
    };
    imgEl.src = url;
}

function badgeHtml(label) {
    const palette = getBadgePalette();
    const color = palette[label] || "";
    const style = color ? ` style="background:${color};color:#fff;"` : "";
    return `<span class="wfm-badge wfm-badge-model"${style}>${escapeHtml(label)}</span>`;
}

function modelBadgesHtml(modelName, clickable = false) {
    const meta = state.modelMetadata[modelName] || {};
    const badges = meta.badges || [];
    if (badges.length === 0) return "";
    return badges.map((label) => {
        const palette = getBadgePalette();
        const color = palette[label] || "";
        const style = color ? ` style="background:${color};color:#fff;"` : "";
        const dataAttr = clickable ? ` data-badge-filter="${escapeHtml(label)}"` : "";
        return `<span class="wfm-badge wfm-badge-model${clickable ? " wfm-badge-clickable" : ""}"${style}${dataAttr}>${escapeHtml(label)}</span>`;
    }).join("");
}

// ── API ───────────────────────────────────────────────────

// ── Multi-select & Bulk Group Operations ─────────────────

function toggleSelectMode() {
    state.selectMode = !state.selectMode;
    if (!state.selectMode) state.selectedModels.clear();
    const btn = document.getElementById("wfm-models-select-btn");
    if (btn) {
        btn.classList.toggle("active", state.selectMode);
        btn.textContent = state.selectMode ? t("modelSelectExit") : t("modelSelectMode");
    }
    renderModelGrid();
    renderBulkActionBar();
}

function toggleModelSelection(modelName) {
    if (state.selectedModels.has(modelName)) {
        state.selectedModels.delete(modelName);
    } else {
        state.selectedModels.add(modelName);
    }
    // Update DOM directly (avoid full re-render)
    document.querySelectorAll("[data-model-name]").forEach((el) => {
        if (el.dataset.modelName !== modelName) return;
        const checked = state.selectedModels.has(modelName);
        el.classList.toggle("wfm-card-checked", checked);
        const c = el.querySelector(".wfm-select-check");
        if (c) c.classList.toggle("checked", checked);
    });
    renderBulkActionBar();
}

function clearSelection() {
    state.selectedModels.clear();
    renderModelGrid();
    renderBulkActionBar();
}

function selectAll() {
    filterModels().forEach(m => state.selectedModels.add(m));
    renderModelGrid();
    renderBulkActionBar();
}

function renderBulkActionBar() {
    const bar = document.getElementById("wfm-models-bulk-bar");
    if (!bar) return;
    if (!state.selectMode || state.selectedModels.size === 0) {
        bar.style.display = "none";
        return;
    }
    const count = state.selectedModels.size;
    const groupNames = Object.keys(state.modelGroups).sort();
    const noGroups = groupNames.length === 0;
    const groupOptions = noGroups
        ? `<option value="">${t("modelsNoGroupAvailable")}</option>`
        : groupNames.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");

    const palette = getBadgePalette();
    const badgeLabels = Object.keys(palette).sort();
    const noBadges = badgeLabels.length === 0;
    const badgeOptions = noBadges
        ? `<option value="">${t("modelBulkNoBadge")}</option>`
        : badgeLabels.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");

    bar.style.display = "flex";
    bar.innerHTML = `
        <div class="wfm-bulk-header">
            <span class="wfm-bulk-count">${count} ${t("modelSelected")}</span>
            <button class="wfm-btn wfm-btn-sm" id="wfm-bulk-deselect-all-btn">${t("modelBulkDeselectAll")}</button>
            <button class="wfm-btn wfm-btn-sm" id="wfm-bulk-select-all-btn">${t("modelBulkSelectAll")}</button>
            <span class="wfm-bulk-sep"></span>
            <button class="wfm-btn wfm-btn-sm" id="wfm-bulk-fav-add-btn">${t("modelBulkFavAdd")}</button>
            <button class="wfm-btn wfm-btn-sm" id="wfm-bulk-fav-remove-btn">${t("modelBulkFavRemove")}</button>
        </div>
        <div class="wfm-bulk-rows">
            <div class="wfm-bulk-row">
                <span class="wfm-bulk-row-label">Group:</span>
                <select id="wfm-bulk-group-select" class="wfm-select wfm-bulk-select">${groupOptions}</select>
                <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-bulk-add-btn"${noGroups ? " disabled" : ""}>${t("modelBulkAddGroup")}</button>
                <button class="wfm-btn wfm-btn-sm wfm-btn-danger" id="wfm-bulk-remove-btn"${noGroups ? " disabled" : ""}>${t("modelBulkRemoveGroup")}</button>
                <span class="wfm-bulk-sep"></span>
                <input type="text" id="wfm-bulk-new-group-input" class="wfm-search-input wfm-bulk-input" placeholder="${t("modelsGroupName")}">
                <button class="wfm-btn wfm-btn-sm" id="wfm-bulk-create-add-btn">${t("modelBulkCreateAdd")}</button>
            </div>
            <div class="wfm-bulk-row">
                <span class="wfm-bulk-row-label">Badge:</span>
                <select id="wfm-bulk-badge-select" class="wfm-select wfm-bulk-select">${badgeOptions}</select>
                <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-bulk-badge-apply-btn"${noBadges ? " disabled" : ""}>${t("modelBulkBadgeApply")}</button>
                <button class="wfm-btn wfm-btn-sm wfm-btn-danger" id="wfm-bulk-badge-remove-btn"${noBadges ? " disabled" : ""}>${t("modelBulkBadgeRemove")}</button>
            </div>
            <div class="wfm-bulk-row">
                <span class="wfm-bulk-row-label">File:</span>
                <select id="wfm-bulk-move-select" class="wfm-select wfm-bulk-select">
                    <option value="">${t("modelBulkMoveRoot")}</option>
                    ${state.subdirs.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("")}
                </select>
                <button class="wfm-btn wfm-btn-sm" id="wfm-bulk-move-btn">${t("modelBulkMoveBtn")}</button>
                <span class="wfm-bulk-sep"></span>
                <input type="text" id="wfm-bulk-new-dir-input" class="wfm-search-input wfm-bulk-input" placeholder="${t("modelBulkMoveNewFolder")}">
                <button class="wfm-btn wfm-btn-sm" id="wfm-bulk-mkdir-move-btn">${t("modelBulkMoveCreateMove")}</button>
                <span style="flex:1"></span>
                <button class="wfm-btn wfm-btn-sm wfm-btn-danger" id="wfm-bulk-delete-btn">${t("modelBulkDelete")}</button>
            </div>
        </div>
    `;

    document.getElementById("wfm-bulk-deselect-all-btn")?.addEventListener("click", clearSelection);
    document.getElementById("wfm-bulk-select-all-btn")?.addEventListener("click", selectAll);
    document.getElementById("wfm-bulk-fav-add-btn")?.addEventListener("click", () => bulkSetFavorite(true));
    document.getElementById("wfm-bulk-fav-remove-btn")?.addEventListener("click", () => bulkSetFavorite(false));
    document.getElementById("wfm-bulk-add-btn")?.addEventListener("click", () => {
        const g = document.getElementById("wfm-bulk-group-select")?.value;
        if (g) bulkAddToGroup(g);
    });
    document.getElementById("wfm-bulk-remove-btn")?.addEventListener("click", () => {
        const g = document.getElementById("wfm-bulk-group-select")?.value;
        if (g) bulkRemoveFromGroup(g);
    });
    document.getElementById("wfm-bulk-create-add-btn")?.addEventListener("click", () => {
        const input = document.getElementById("wfm-bulk-new-group-input");
        const name = input?.value.trim();
        if (!name) return;
        if (state.modelGroups[name]) { showToast(t("modelsGroupExists"), "warning"); return; }
        bulkAddToGroup(name);
    });
    document.getElementById("wfm-bulk-badge-apply-btn")?.addEventListener("click", () => {
        const label = document.getElementById("wfm-bulk-badge-select")?.value;
        if (label) bulkApplyBadge(label, true);
    });
    document.getElementById("wfm-bulk-badge-remove-btn")?.addEventListener("click", () => {
        const label = document.getElementById("wfm-bulk-badge-select")?.value;
        if (label) bulkApplyBadge(label, false);
    });
    document.getElementById("wfm-bulk-move-btn")?.addEventListener("click", () => {
        const dest = document.getElementById("wfm-bulk-move-select")?.value || "";
        bulkMoveModels(dest);
    });
    document.getElementById("wfm-bulk-mkdir-move-btn")?.addEventListener("click", () => {
        const input = document.getElementById("wfm-bulk-new-dir-input");
        const name = input?.value.trim();
        if (!name) return;
        bulkMoveModels(name);
    });
    document.getElementById("wfm-bulk-delete-btn")?.addEventListener("click", bulkDeleteModels);
}

async function bulkAddToGroup(groupName) {
    const groups = { ...state.modelGroups };
    if (!groups[groupName]) groups[groupName] = [];
    const toAdd = [...state.selectedModels].filter((m) => !groups[groupName].includes(m));
    groups[groupName] = [...groups[groupName], ...toAdd];
    await saveModelGroups(groups);
    showToast(`${toAdd.length} ${t("modelBulkAddDone")}`, "success");
    renderBulkActionBar();
}

async function bulkRemoveFromGroup(groupName) {
    const groups = { ...state.modelGroups };
    if (!groups[groupName]) return;
    const before = groups[groupName].length;
    groups[groupName] = groups[groupName].filter((m) => !state.selectedModels.has(m));
    const removed = before - groups[groupName].length;
    if (groups[groupName].length === 0) delete groups[groupName];
    await saveModelGroups(groups);
    showToast(`${removed} ${t("modelBulkRemoveDone")}`, "success");
    renderModelGrid();
    renderBulkActionBar();
}

async function bulkSetFavorite(isFav) {
    const models = [...state.selectedModels];
    let count = 0;
    for (const mn of models) {
        const meta = state.modelMetadata[mn] || {};
        if (meta.favorite === isFav) continue;
        await saveModelMetadata(mn, { favorite: isFav });
        count++;
    }
    if (count > 0) {
        showToast(`${count} ${isFav ? t("modelBulkFavDone") : t("modelBulkUnfavDone")}`, "success");
        renderModelGrid();
    }
}

async function bulkApplyBadge(badgeLabel, add) {
    const models = [...state.selectedModels];
    let count = 0;
    for (const mn of models) {
        const meta = state.modelMetadata[mn] || {};
        const badges = [...(meta.badges || [])];
        if (add) {
            if (badges.includes(badgeLabel)) continue;
            badges.push(badgeLabel);
        } else {
            const idx = badges.indexOf(badgeLabel);
            if (idx === -1) continue;
            badges.splice(idx, 1);
        }
        await saveModelMetadata(mn, { badges });
        count++;
    }
    if (count > 0) {
        showToast(`${count} ${add ? t("modelBulkBadgeApplyDone") : t("modelBulkBadgeRemoveDone")}`, "success");
        renderModelGrid();
    }
}

async function bulkDeleteModels() {
    const count = state.selectedModels.size;
    if (count === 0) return;
    const msg = t("modelBulkDeleteConfirm").replace("{count}", count);
    if (!window.confirm(msg)) return;

    const model_names = [...state.selectedModels];
    try {
        const res = await fetch("/api/wfm/models/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model_type: state.activeModelType, model_names }),
        });
        const data = await res.json();
        const okCount = (data.ok || []).length;
        const errCount = (data.errors || []).length;
        if (errCount > 0) {
            showToast(`${t("modelBulkDeleteError")}: ${errCount} errors`, "error");
        }
        if (okCount > 0) {
            showToast(`${okCount} ${t("modelBulkDeleteDone")}`, "success");
            // Remove deleted models from local state
            model_names.forEach((mn) => {
                const list = state.modelsByType[state.activeModelType];
                const idx = list.indexOf(mn);
                if (idx !== -1) list.splice(idx, 1);
                delete state.modelMetadata[mn];
                const ds = state.disabledModels[state.activeModelType];
                if (ds) ds.delete(mn);
                state.selectedModels.delete(mn);
            });
            state.loaded[state.activeModelType] = false;
            renderModelGrid();
            renderBulkActionBar();
        }
    } catch (err) {
        showToast(`${t("modelBulkDeleteError")}: ${err.message}`, "error");
    }
}

async function fetchSubdirs() {
    try {
        const res = await fetch(`/api/wfm/models/subdirs?type=${encodeURIComponent(state.activeModelType)}`);
        state.subdirs = res.ok ? await res.json() : [];
    } catch { state.subdirs = []; }
}

async function bulkMoveModels(destSubdir) {
    const model_names = [...state.selectedModels];
    if (model_names.length === 0) return;
    try {
        const res = await fetch("/api/wfm/models/move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model_type: state.activeModelType, model_names, dest: destSubdir }),
        });
        const data = await res.json();
        const okCount = data.moved?.length || 0;
        const errCount = data.errors?.length || 0;

        if (okCount > 0) {
            data.moved.forEach(({ from, to }) => {
                const list = state.modelsByType[state.activeModelType];
                const idx = list.indexOf(from);
                if (idx !== -1) list[idx] = to;
                if (state.modelMetadata[from]) {
                    state.modelMetadata[to] = state.modelMetadata[from];
                    delete state.modelMetadata[from];
                }
                const ds = state.disabledModels[state.activeModelType];
                if (ds && ds.has(from)) { ds.delete(from); ds.add(to); }
                state.selectedModels.delete(from);
                for (const members of Object.values(state.modelGroups)) {
                    const gi = members.indexOf(from);
                    if (gi !== -1) members[gi] = to;
                }
            });
            if (state.selectedModel && data.moved.some((m) => m.from === state.selectedModel)) {
                state.selectedModel = null;
                const titleEl = document.getElementById("wfm-models-panel-title");
                if (titleEl) titleEl.textContent = "";
            }
            showToast(`${okCount} ${t("modelBulkMoveDone")}`, "success");
            await fetchSubdirs();
            renderDirFilter();
            renderModelGrid();
            renderBulkActionBar();
        }
        if (errCount > 0) {
            showToast(`${t("modelBulkMoveError")}: ${data.errors[0].error}`, "error");
        }
    } catch (err) {
        showToast(`${t("modelBulkMoveError")}: ${err.message}`, "error");
    }
}

// ── Enable / Disable helpers ──────────────────────────────

function isModelDisabled(modelName) {
    const s = state.disabledModels[state.activeModelType];
    return s ? s.has(modelName) : false;
}

async function fetchDisabledModels(type) {
    try {
        const res = await fetch(`/api/wfm/models/disabled?type=${encodeURIComponent(type)}`);
        return res.ok ? await res.json() : [];
    } catch { return []; }
}

async function toggleModelEnable(modelName) {
    const nowDisabled = isModelDisabled(modelName);
    const newEnabled = nowDisabled;
    try {
        const res = await fetch("/api/wfm/models/toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model_type: state.activeModelType,
                model_name: modelName,
                enabled: newEnabled,
            }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "toggle failed");
        }
        const s = state.disabledModels[state.activeModelType] || new Set();
        if (newEnabled) s.delete(modelName);
        else s.add(modelName);
        state.disabledModels[state.activeModelType] = s;
        showToast(t("modelStatusWarning"), "info");
        renderModelGrid();
        if (state.selectedModel === modelName) renderSideInfo(modelName);
    } catch (err) {
        showToast(t("modelToggleError") + ": " + err.message, "error");
    }
}

async function toggleGroupEnable(groupName, enable) {
    try {
        const res = await fetch("/api/wfm/models/group-toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model_type: state.activeModelType,
                group_name: groupName,
                enabled: enable,
            }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "group toggle failed");
        }
        const data = await res.json();
        const members = state.modelGroups[groupName] || [];
        const s = state.disabledModels[state.activeModelType] || new Set();
        members.forEach((m) => { if (enable) s.delete(m); else s.add(m); });
        state.disabledModels[state.activeModelType] = s;
        const errCount = data.errors?.length || 0;
        if (errCount > 0) showToast(`${errCount} ${t("modelToggleError")}`, "warning");
        showToast(t("modelStatusWarning"), "info");
        renderModelGrid();
    } catch (err) {
        showToast(t("modelToggleError") + ": " + err.message, "error");
    }
}

async function fetchModelMetadata() {
    try {
        const res = await fetch("/api/wfm/models/metadata");
        return res.ok ? await res.json() : {};
    } catch {
        return {};
    }
}

async function saveModelMetadata(modelName, updates) {
    try {
        const res = await fetch("/api/wfm/models/metadata", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modelName, ...updates }),
        });
        const data = await res.json();
        if (data.metadata) {
            state.modelMetadata[modelName] = data.metadata;
        }
        return data;
    } catch (err) {
        showToast(t("saveFailed", err.message), "error");
        return null;
    }
}

// ── Filtering ─────────────────────────────────────────────

function getCurrentModels() {
    return state.modelsByType[state.activeModelType] || [];
}

function filterModels() {
    let models = getCurrentModels();

    if (state.statusFilter === "enabled") {
        models = models.filter((m) => !isModelDisabled(m));
    } else if (state.statusFilter === "disabled") {
        models = models.filter((m) => isModelDisabled(m));
    }

    if (state.showFavoritesOnly) {
        models = models.filter((m) => {
            const meta = state.modelMetadata[m];
            return meta && meta.favorite;
        });
    }

    if (state.showBatchOnly) {
        const batchMembers = state.modelGroups["Batch"] || [];
        models = models.filter((m) => batchMembers.includes(m));
    }

    if (state.tagFilter) {
        models = models.filter((m) => {
            const meta = state.modelMetadata[m];
            return meta && meta.tags && meta.tags.includes(state.tagFilter);
        });
    }

    if (state.badgeFilter) {
        models = models.filter((m) => {
            const meta = state.modelMetadata[m];
            return meta && meta.badges && meta.badges.includes(state.badgeFilter);
        });
    }

    if (state.dirFilter) {
        models = models.filter((m) => {
            const { dir } = parseModelPath(m);
            return dir === state.dirFilter;
        });
    }

    if (state.groupFilter) {
        const members = state.modelGroups[state.groupFilter] || [];
        models = models.filter((m) => members.includes(m));
    }

    if (state.searchText) {
        const q = state.searchText.toLowerCase();
        models = models.filter((m) => {
            const meta = state.modelMetadata[m];
            const searchable = [m, ...(meta?.tags || []), meta?.memo || ""]
                .join(" ")
                .toLowerCase();
            return searchable.includes(q);
        });
    }

    return sortModels(models);
}

function sortKeyOf(modelName) {
    const meta = state.modelMetadata[modelName] || {};
    switch (state.sortColumn) {
        case "fav":
            return meta.favorite ? 1 : 0;
        case "filename":
            return parseModelPath(modelName).name.toLowerCase();
        case "subdir":
            return parseModelPath(modelName).dir.toLowerCase();
        case "civtype": {
            const civ = meta.sha256 && state.civitaiCache[meta.sha256];
            return (civ?.type || "").toLowerCase();
        }
        case "basemodel": {
            const civ = meta.sha256 && state.civitaiCache[meta.sha256];
            return (civ?.baseModel || "").toLowerCase();
        }
        case "ext":
            return getExtension(parseModelPath(modelName).name).toLowerCase();
        case "tags":
            return (meta.tags || []).join(", ").toLowerCase();
        case "memo":
            return (meta.memo || "").toLowerCase();
        case "enabled":
            return isModelDisabled(modelName) ? 1 : 0;
        default:
            return 0;
    }
}

function sortModels(models) {
    if (!state.sortColumn) return models;
    // ソートキーを1モデル1回だけ計算（比較ごとのparseModelPath等の再計算を回避）
    const dir = state.sortDir === "asc" ? 1 : -1;
    return models
        .map((m) => [sortKeyOf(m), m])
        .sort((a, b) => (a[0] < b[0] ? -dir : a[0] > b[0] ? dir : 0))
        .map((pair) => pair[1]);
}

function getAllTags() {
    const set = new Set();
    const models = getCurrentModels();
    models.forEach((m) => {
        const meta = state.modelMetadata[m];
        if (meta?.tags) meta.tags.forEach((tag) => set.add(tag));
    });
    return [...set].sort();
}

// ── Badge Management ──────────────────────────────────────

export function openBadgeEditModal(onPaletteChange = null) {
    const palette = getBadgePalette();
    const labels = Object.keys(palette).sort();

    const rowsHtml = labels.map((label) => {
        const color = palette[label] || "#6366f1";
        return `<div class="wfm-badge-color-row" data-badge-label="${escapeHtml(label)}">
            ${badgeHtml(label)}
            <input type="color" value="${color}" data-badge-label="${escapeHtml(label)}" class="wfm-badge-color-input" title="${t("badgeColorHint")}">
            <button class="wfm-btn wfm-btn-sm wfm-btn-danger wfm-badge-delete-btn" data-badge-label="${escapeHtml(label)}" title="${t("badgeDelete")}">&times;</button>
        </div>`;
    }).join("");

    const html = `
        <div style="min-width:320px;">
            <div id="wfm-badge-list">${rowsHtml || `<p style="color:var(--wfm-text-secondary);font-size:12px;">${t("badgeNone")}</p>`}</div>
            <div style="border-top:1px solid var(--wfm-border);margin-top:12px;padding-top:12px;display:flex;gap:6px;align-items:center;">
                <input type="text" id="wfm-badge-new-label" class="wfm-input" style="flex:1;" placeholder="${t("badgeNewLabel")}">
                <input type="color" id="wfm-badge-new-color" value="#6366f1" style="width:36px;height:28px;padding:1px;border-radius:4px;cursor:pointer;">
                <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-badge-add-btn">${t("badgeAdd")}</button>
            </div>
        </div>`;

    openModal(t("badgeManage"), html);
    bindBadgeModalEvents(onPaletteChange);
}

function bindBadgeModalEvents(onPaletteChange = null) {
    const afterChange = () => {
        renderBadgeFilter();
        renderModelGrid();
        if (onPaletteChange) onPaletteChange();
    };

    const refreshList = () => {
        const palette = getBadgePalette();
        const labels = Object.keys(palette).sort();
        const listEl = document.getElementById("wfm-badge-list");
        if (!listEl) return;
        listEl.innerHTML = labels.map((label) => {
            const color = palette[label] || "#6366f1";
            return `<div class="wfm-badge-color-row" data-badge-label="${escapeHtml(label)}">
                ${badgeHtml(label)}
                <input type="color" value="${color}" data-badge-label="${escapeHtml(label)}" class="wfm-badge-color-input" title="${t("badgeColorHint")}">
                <button class="wfm-btn wfm-btn-sm wfm-btn-danger wfm-badge-delete-btn" data-badge-label="${escapeHtml(label)}" title="${t("badgeDelete")}">&times;</button>
            </div>`;
        }).join("") || `<p style="color:var(--wfm-text-secondary);font-size:12px;">${t("badgeNone")}</p>`;
        bindBadgeRowEvents(refreshList, afterChange);
        afterChange();
    };

    bindBadgeRowEvents(refreshList, afterChange);

    document.getElementById("wfm-badge-add-btn")?.addEventListener("click", () => {
        const labelInput = document.getElementById("wfm-badge-new-label");
        const colorInput = document.getElementById("wfm-badge-new-color");
        const label = labelInput?.value.trim();
        if (!label) return;
        const palette = getBadgePalette();
        palette[label] = colorInput?.value || "#6366f1";
        saveBadgePalette(palette);
        if (labelInput) labelInput.value = "";
        refreshList();
    });
}

function bindBadgeRowEvents(refreshList, afterChange = null) {
    document.querySelectorAll(".wfm-badge-color-input").forEach((input) => {
        input.addEventListener("input", (e) => {
            const label = e.target.dataset.badgeLabel;
            const palette = getBadgePalette();
            palette[label] = e.target.value;
            saveBadgePalette(palette);
            refreshList();
        });
    });
    document.querySelectorAll(".wfm-badge-delete-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const label = btn.dataset.badgeLabel;
            const palette = getBadgePalette();
            delete palette[label];
            saveBadgePalette(palette);
            refreshList();
        });
    });
}

// ── Badge Filter Bar ──────────────────────────────────────

function renderBadgeFilter() {
    const container = document.getElementById("wfm-models-badge-filter-bar");
    if (!container) return;
    const palette = getBadgePalette();
    const labels = Object.keys(palette).sort();

    if (labels.length === 0) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = labels.map((label) => {
        const color = palette[label] || "";
        const isActive = state.badgeFilter === label;
        const style = color ? `background:${color};color:#fff;` : "";
        return `<button class="wfm-badge-filter-btn${isActive ? " active" : ""}" data-badge="${escapeHtml(label)}" style="${style}">${escapeHtml(label)}</button>`;
    }).join("");

    container.querySelectorAll(".wfm-badge-filter-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const label = btn.dataset.badge;
            state.badgeFilter = state.badgeFilter === label ? "" : label;
            state.currentPage = 0;
            renderBadgeFilter();
            renderModelGrid();
        });
    });
}

// ── Render: Tag Filter ────────────────────────────────────

function renderTagFilter() {
    const select = document.getElementById("wfm-models-tag-filter");
    if (!select) return;
    const tags = getAllTags();
    select.innerHTML =
        `<option value="">${t("modelsAllTags")}</option>` +
        tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("");
    select.value = state.tagFilter;
}

function renderGroupFilter() {
    const select = document.getElementById("wfm-models-group-filter");
    if (!select) return;

    const groups = state.allModelGroups[state.activeModelType] || {};
    const names = Object.keys(groups).sort();

    const currentValue = state.groupFilter
        ? `${state.activeModelType}::${state.groupFilter}`
        : "";

    select.innerHTML =
        `<option value="">${t("modelsAllGroups")}</option>` +
        names.map((name) => {
            const value = `${state.activeModelType}::${name}`;
            const isActive = value === currentValue;
            return `<option value="${escapeHtml(value)}"${isActive ? " selected" : ""}>${escapeHtml(name)}</option>`;
        }).join("");
}

function renderDirFilter() {
    const select = document.getElementById("wfm-models-dir-filter");
    if (!select) return;
    const dirs = [...new Set(
        getCurrentModels()
            .map((m) => parseModelPath(m).dir)
            .filter((d) => d !== "")
    )].sort();
    select.innerHTML =
        `<option value="">${t("modelsAllDirs")}</option>` +
        dirs.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
    select.value = state.dirFilter;
}

async function fetchModelGroups() {
    try {
        const res = await fetch(`/api/wfm/models/groups?type=${encodeURIComponent(state.activeModelType)}`);
        return res.ok ? await res.json() : {};
    } catch { return {}; }
}

async function fetchAllModelGroups() {
    try {
        const res = await fetch("/api/wfm/models/groups");
        return res.ok ? await res.json() : {};
    } catch { return {}; }
}

async function saveModelGroups(groups) {
    state.modelGroups = groups;
    state.allModelGroups[state.activeModelType] = groups;
    await fetch("/api/wfm/models/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_type: state.activeModelType, groups }),
    });
    renderGroupFilter();
    renderBulkActionBar();
}

// ── Render: Grid ──────────────────────────────────────────

function renderModelGrid() {
    const grid = document.getElementById("wfm-models-grid");
    if (!grid) return;

    grid.className = `wfm-grid wfm-view-${state.viewMode}`;
    const filtered = filterModels();

    // Update count
    const countEl = document.getElementById("wfm-models-count");
    if (countEl) {
        const total = getCurrentModels().length;
        countEl.textContent = `${filtered.length} / ${total}`;
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<p class="wfm-placeholder">${t("modelsNoModels")}</p>`;
        return;
    }

    if (state.viewMode === "table") {
        renderTableView(grid, filtered);
    } else {
        renderThumbView(grid, filtered);
    }
}

// ── Thumbnail View (same as Workflow tab) ─────────────────

function renderThumbView(grid, models) {
    grid.innerHTML = "";
    models.forEach((modelName) => {
        const meta = state.modelMetadata[modelName] || {};
        const { name } = parseModelPath(modelName);
        const disabled = isModelDisabled(modelName);
        const userBadges = modelBadgesHtml(modelName);
        const tagsHtml = (meta.tags || []).map((tag) => `<span class="wfm-badge wfm-badge-sm">${escapeHtml(tag)}</span>`).join("");
        const favStar = meta.favorite ? "\u2605" : "\u2606";
        const favClass = meta.favorite ? "wfm-fav-btn active" : "wfm-fav-btn";
        const showBatchBtn = ["checkpoint", "lora"].includes(state.activeModelType);
        const showStackBtn = state.activeModelType === "lora";
        const inBatch = showBatchBtn && isInBatch(modelName);
        const inStack = showStackBtn && isInStack(modelName);
        const batchClass = inBatch ? "wfm-batch-btn active" : "wfm-batch-btn";
        const stackClass = inStack ? "wfm-stack-btn active" : "wfm-stack-btn";

        const card = document.createElement("div");
        card.className = "wfm-card";
        if (disabled) card.classList.add("wfm-model-disabled");
        if (state.selectedModel === modelName) card.classList.add("wfm-card-selected");
        card.dataset.modelName = modelName;

        card.innerHTML = `
            <div class="wfm-card-thumb">
                <img style="display:none" />
                <span class="wfm-card-thumb-placeholder">${t("modelsNoPreview")}</span>
                ${disabled ? `<span class="wfm-disabled-overlay">${t("modelDisabled")}</span>` : ""}
            </div>
            <div class="wfm-card-body">
                <div class="wfm-card-title" title="${escapeHtml(modelName)}">${escapeHtml(getStem(name))}</div>
                <div class="wfm-card-meta">${userBadges} ${tagsHtml}</div>
            </div>
            ${showBatchBtn ? `<button class="${batchClass}" title="${t("modelsBatch")}">B</button>` : ""}
            ${showStackBtn ? `<button class="${stackClass}" title="Stack (Lora multi-apply)">S</button>` : ""}
            <button class="${favClass}" title="${t("modelsFavorite")}">${favStar}</button>
            <button class="wfm-toggle-btn${disabled ? " wfm-toggle-disabled" : ""}" title="${disabled ? t("modelEnable") : t("modelDisable")}">${disabled ? "▶" : "⏸"}</button>`;

        // Load preview without 404 console spam
        const img = card.querySelector(".wfm-card-thumb img");
        const placeholder = card.querySelector(".wfm-card-thumb-placeholder");
        loadPreviewImage(img, placeholder, modelName);

        card.querySelector(".wfm-batch-btn")?.addEventListener("click", async (e) => {
            e.stopPropagation();
            await toggleBatch(modelName);
            if (state.showBatchOnly) {
                renderModelGrid();
            } else {
                e.currentTarget.classList.toggle("active", isInBatch(modelName));
            }
        });
        card.querySelector(".wfm-stack-btn")?.addEventListener("click", async (e) => {
            e.stopPropagation();
            await toggleStack(modelName);
            e.currentTarget.classList.toggle("active", isInStack(modelName));
        });
        card.querySelector(".wfm-fav-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(modelName);
        });
        card.querySelector(".wfm-toggle-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            toggleModelEnable(modelName);
        });
        if (state.selectMode) {
            const isChecked = state.selectedModels.has(modelName);
            card.classList.toggle("wfm-card-checked", isChecked);
            const checkEl = document.createElement("div");
            checkEl.className = "wfm-select-check" + (isChecked ? " checked" : "");
            card.appendChild(checkEl);
            card.addEventListener("click", (e) => {
                if (e.target.closest(".wfm-batch-btn, .wfm-stack-btn, .wfm-fav-btn, .wfm-toggle-btn")) return;
                toggleModelSelection(modelName);
            });
        } else {
            card.addEventListener("click", () => showSidePanel(modelName));
            card.addEventListener("dblclick", (e) => { e.stopPropagation(); openDetailModal(modelName); });
        }
        grid.appendChild(card);
    });
}


// ── Table View ────────────────────────────────────────────

function thSortHtml(label, col, extraClass = "", extraStyle = "") {
    const isActive = state.sortColumn === col;
    const arrow = isActive ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
    const activeStyle = isActive ? "color:var(--wfm-accent,#6366f1);" : "";
    const cls = ["wfm-table-th-sortable", extraClass].filter(Boolean).join(" ");
    return `<th class="${cls}" data-sort-col="${col}" style="${activeStyle}${extraStyle}">${label}${arrow}</th>`;
}

function renderTableView(grid, models) {
    const showBatchBtn = ["checkpoint", "lora"].includes(state.activeModelType);
    const showStackBtn = state.activeModelType === "lora";
    const rows = models
        .map((modelName) => {
            const meta = state.modelMetadata[modelName] || {};
            const { dir, name } = parseModelPath(modelName);
            const ext = getExtension(name);
            const sha256 = meta.sha256;
            const civitai = sha256 && state.civitaiCache[sha256];
            const civitaiType = civitai ? (civitai.type || "") : "";
            const civitaiBaseModel = civitai ? (civitai.baseModel || "") : "";
            const disabled = isModelDisabled(modelName);
            const isChecked = state.selectMode && state.selectedModels.has(modelName);
            const favIcon = meta.favorite ? "&#9733;" : "&#9734;";
            const batchIcon = !showBatchBtn ? "" : isInBatch(modelName) ? `<button class="wfm-batch-btn active" title="${t("modelsBatch")}">B</button>` : `<button class="wfm-batch-btn" title="${t("modelsBatch")}">B</button>`;
            const stackIcon = isInStack(modelName) ? `<button class="wfm-stack-btn active" title="Stack (Lora multi-apply)">S</button>` : `<button class="wfm-stack-btn" title="Stack (Lora multi-apply)">S</button>`;
            const tagsStr = (meta.tags || []).join(", ");
            const memo = meta.memo || "";
            const toggleLabel = disabled ? t("modelEnable") : t("modelDisable");
            const toggleIcon = disabled ? "▶" : "⏸";
            const checkCell = state.selectMode
                ? `<td class="wfm-table-td-check"><div class="wfm-select-check${isChecked ? " checked" : ""}"></div></td>`
                : "";
            return `<tr class="wfm-models-table-row${state.selectedModel === modelName ? " wfm-card-selected" : ""}${disabled ? " wfm-model-disabled" : ""}${isChecked ? " wfm-card-checked" : ""}" data-model-name="${escapeHtml(modelName)}">
                ${checkCell}
                <td class="wfm-models-table-fav" title="Favorite">${favIcon}</td>
                <td class="wfm-table-td-thumb"><img class="wfm-table-thumb" style="display:none" /></td>
                <td class="wfm-table-td-filename" title="${escapeHtml(modelName)}">${escapeHtml(name)}</td>
                <td class="wfm-table-td-subdir">${escapeHtml(dir)}</td>
                <td class="wfm-table-td-civtype" title="${escapeHtml(civitaiType)}">${escapeHtml(civitaiType)}</td>
                <td class="wfm-table-td-basemodel" title="${escapeHtml(civitaiBaseModel)}">${escapeHtml(civitaiBaseModel)}</td>
                <td class="wfm-table-td-ext">${escapeHtml(ext)}</td>
                <td>${escapeHtml(tagsStr)}</td>
                <td class="wfm-table-td-memo" title="${escapeHtml(memo)}">${escapeHtml(memo)}</td>
                <td class="wfm-table-td-toggle"><button class="wfm-toggle-btn${disabled ? " wfm-toggle-disabled" : ""}" title="${toggleLabel}">${toggleIcon}</button></td>
                ${showBatchBtn ? `<td class="wfm-table-td-batch">${batchIcon}</td>` : ""}
                ${showStackBtn ? `<td class="wfm-table-td-stack">${stackIcon}</td>` : ""}
            </tr>`;
        })
        .join("");

    const checkTh = state.selectMode ? `<th style="width:24px;"></th>` : "";
    grid.innerHTML = `<table class="wfm-models-table"><thead><tr>
        ${checkTh}
        ${thSortHtml("&#9733;", "fav", "", "width:30px;text-align:center;")}
        <th style="width:40px;"></th>
        ${thSortHtml(t("modelsFileName"), "filename", "wfm-table-th-filename")}
        ${thSortHtml(t("modelsSubdir"), "subdir", "wfm-table-th-subdir")}
        ${thSortHtml(t("civitaiType"), "civtype", "wfm-table-th-civtype")}
        ${thSortHtml(t("civitaiBaseModel"), "basemodel", "wfm-table-th-basemodel")}
        ${thSortHtml(t("modelsExt"), "ext", "wfm-table-th-ext")}
        ${thSortHtml(t("modelsTags"), "tags")}
        ${thSortHtml(t("modelsMemo"), "memo")}
        ${thSortHtml("E/D", "enabled", "", "width:50px;text-align:center;")}
        ${showBatchBtn ? `<th style="width:30px;">B</th>` : ""}
        ${showStackBtn ? `<th style="width:30px;">S</th>` : ""}
    </tr></thead><tbody>${rows}</tbody></table>`;

    grid.querySelectorAll(".wfm-models-table-row").forEach((row) => {
        const mn = row.dataset.modelName;
        const img = row.querySelector(".wfm-table-thumb");
        if (img) loadPreviewImage(img, null, mn);

        if (state.selectMode) {
            row.addEventListener("click", (e) => {
                if (e.target.closest(".wfm-models-table-fav, .wfm-toggle-btn, .wfm-batch-btn, .wfm-stack-btn")) return;
                toggleModelSelection(mn);
            });
        } else {
            row.addEventListener("click", () => showSidePanel(mn));
            row.addEventListener("dblclick", (e) => { e.stopPropagation(); openDetailModal(mn); });
        }
        row.querySelector(".wfm-models-table-fav").addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(mn);
        });
        row.querySelector(".wfm-toggle-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            toggleModelEnable(mn);
        });
        row.querySelector(".wfm-batch-btn")?.addEventListener("click", async (e) => {
            e.stopPropagation();
            await toggleBatch(mn);
            if (state.showBatchOnly) {
                renderModelGrid();
            } else {
                e.currentTarget.classList.toggle("active", isInBatch(mn));
            }
        });
        row.querySelector(".wfm-stack-btn")?.addEventListener("click", async (e) => {
            e.stopPropagation();
            await toggleStack(mn);
            e.currentTarget.classList.toggle("active", isInStack(mn));
        });
    });

    grid.querySelectorAll(".wfm-table-th-sortable").forEach((th) => {
        th.addEventListener("click", () => {
            const col = th.dataset.sortCol;
            if (state.sortColumn === col) {
                if (state.sortDir === "asc") {
                    state.sortDir = "desc";
                } else {
                    state.sortColumn = null;
                    state.sortDir = "asc";
                }
            } else {
                state.sortColumn = col;
                state.sortDir = "asc";
            }
            renderModelGrid();
        });
    });
}

// ── Batch group helpers ───────────────────────────────────

function isInBatch(modelName) {
    return (state.modelGroups["Batch"] || []).includes(modelName);
}

async function toggleBatch(modelName) {
    const batch = state.modelGroups["Batch"] || [];
    const idx = batch.indexOf(modelName);
    if (idx >= 0) {
        batch.splice(idx, 1);
    } else {
        batch.push(modelName);
    }
    state.modelGroups["Batch"] = batch;
    state.allModelGroups[state.activeModelType] = state.modelGroups;
    await saveModelGroups(state.modelGroups);
}

async function clearBatchGroup() {
    state.modelGroups["Batch"] = [];
    state.allModelGroups[state.activeModelType] = state.modelGroups;
    await saveModelGroups(state.modelGroups);
    if (state.showBatchOnly) {
        state.showBatchOnly = false;
        document.getElementById("wfm-models-batch-filter-btn")?.classList.remove("active");
    }
    renderModelGrid();
    showToast(t("modelsBatchClear"), "success");
}

function isInStack(modelName) {
    return (state.modelGroups["Stack"] || []).includes(modelName);
}

async function toggleStack(modelName) {
    const stack = state.modelGroups["Stack"] || [];
    const idx = stack.indexOf(modelName);
    if (idx >= 0) {
        stack.splice(idx, 1);
    } else {
        stack.push(modelName);
    }
    state.modelGroups["Stack"] = stack;
    state.allModelGroups[state.activeModelType] = state.modelGroups;
    await saveModelGroups(state.modelGroups);
}

async function clearStackGroup() {
    state.modelGroups["Stack"] = [];
    state.allModelGroups[state.activeModelType] = state.modelGroups;
    await saveModelGroups(state.modelGroups);
    renderModelGrid();
    showToast(t("stackCleared"), "success");
}

// ── Favorite toggle ───────────────────────────────────────

async function toggleFavorite(modelName) {
    const meta = state.modelMetadata[modelName] || {};
    const newFav = !meta.favorite;
    await saveModelMetadata(modelName, { favorite: newFav });
    renderModelGrid();
    if (state.selectedModel === modelName) renderSideInfo(modelName);
}

// ── Detail Modal (double-click, with badges) ──────────────

function openDetailModal(modelName) {
    const meta = state.modelMetadata[modelName] || {};
    const { dir, name } = parseModelPath(modelName);
    const ext = getExtension(name);
    const isFav = !!meta.favorite;
    const tagsStr = (meta.tags || []).join(", ");
    const selectedBadges = meta.badges || [];
    const palette = getBadgePalette();
    const allBadgeLabels = Object.keys(palette).sort();

    const badgeCheckboxes = allBadgeLabels.map((label) => {
        const checked = selectedBadges.includes(label) ? " checked" : "";
        const color = palette[label] || "";
        const style = color ? `background:${color};color:#fff;` : "";
        return `<label class="wfm-badge-check-label">
            <input type="checkbox" class="wfm-badge-checkbox" value="${escapeHtml(label)}"${checked}>
            <span class="wfm-badge wfm-badge-model" style="${style}">${escapeHtml(label)}</span>
        </label>`;
    }).join("");

    const html = `
        <div class="wfm-modal-thumb-section">
            <img class="wfm-modal-thumb-img" style="display:none" />
            <div class="wfm-modal-thumb-placeholder">${t("modelsNoPreview")}</div>
        </div>
        <div style="text-align:center;margin-bottom:8px;">
            <button class="wfm-btn wfm-btn-sm" id="wfm-modal-change-thumb">${t("changeThumbnail")}</button>
            <input type="file" id="wfm-modal-thumb-file" accept="image/*" style="display:none">
        </div>
        <div class="wfm-modal-two-col">
            <div class="wfm-modal-left">
                <section>
                    <h4>${t("modelsInfo")}</h4>
                    <div><span class="wfm-badge wfm-badge-sm">${escapeHtml(ext)}</span>${dir ? ` <span class="wfm-badge wfm-badge-sm wfm-badge-dir">${escapeHtml(dir)}</span>` : ""}</div>
                </section>
                <section>
                    <h4>${t("modelsBadges")} <button class="wfm-btn wfm-btn-sm" id="wfm-modal-badge-manage" style="margin-left:6px;font-size:10px;">&#9881; ${t("badgeManage")}</button></h4>
                    <div id="wfm-modal-badge-checkboxes" class="wfm-badge-checkboxes">
                        ${allBadgeLabels.length === 0
                            ? `<span style="color:var(--wfm-text-secondary);font-size:12px;">${t("badgeNoneHint")}</span>`
                            : badgeCheckboxes}
                    </div>
                </section>
                <section>
                    <h4>${t("modelsTags")} <span style="font-weight:normal;font-size:11px;">${t("modelsTagsHint")}</span></h4>
                    <input type="text" class="wfm-input" id="wfm-modal-model-tags" value="${escapeHtml(tagsStr)}" placeholder="${t("modelsTagsPlaceholder")}">
                </section>
                <section>
                    <h4>${t("modelsMemo")}</h4>
                    <textarea class="wfm-textarea" id="wfm-modal-model-memo" rows="4" placeholder="${t("modelsMemoPlaceholder")}">${escapeHtml(meta.memo || "")}</textarea>
                </section>
                <div class="wfm-modal-actions">
                    <button class="wfm-btn wfm-btn-primary wfm-btn-sm" id="wfm-modal-model-save">${t("modelsSave")}</button>
                    ${GENUI_TYPE_MAP[state.activeModelType]
                        ? `<button class="wfm-btn wfm-btn-sm" id="wfm-modal-genui-model" title="${t("modelsGenUITitle")}">${t("modelsGenUIBtn")}</button>`
                        : ""}
                    <button class="wfm-btn wfm-btn-sm wfm-btn-danger" id="wfm-modal-model-delete" style="margin-left:auto;">${t("modelsDelete")}</button>
                </div>
            </div>
        </div>`;

    openModal(getStem(name), html);

    // Load preview image
    const modalImg = document.querySelector(".wfm-modal-thumb-img");
    const modalPlaceholder = document.querySelector(".wfm-modal-thumb-placeholder");
    if (modalImg) loadPreviewImage(modalImg, modalPlaceholder, modelName);

    // Add favorite button in header
    const titleEl = document.getElementById("wfm-modal-title");
    if (titleEl) {
        titleEl.parentNode.querySelectorAll(".wfm-fav-btn").forEach((el) => el.remove());
        const favBtn = document.createElement("button");
        favBtn.className = isFav ? "wfm-fav-btn active" : "wfm-fav-btn";
        favBtn.style.cssText = "position:static;font-size:18px;margin-right:8px;";
        favBtn.textContent = isFav ? "\u2605" : "\u2606";
        favBtn.addEventListener("click", async () => {
            const newVal = !meta.favorite;
            await saveModelMetadata(modelName, { favorite: newVal });
            meta.favorite = newVal;
            favBtn.textContent = newVal ? "\u2605" : "\u2606";
            favBtn.classList.toggle("active", newVal);
            renderModelGrid();
        });
        titleEl.parentNode.insertBefore(favBtn, titleEl);
    }

    // Badge manage button → open badge edit modal
    document.getElementById("wfm-modal-badge-manage")?.addEventListener("click", () => {
        openBadgeEditModal();
    });

    // Save
    document.getElementById("wfm-modal-model-save")?.addEventListener("click", async () => {
        const tagsInput = document.getElementById("wfm-modal-model-tags");
        const memoInput = document.getElementById("wfm-modal-model-memo");
        const tags = tagsInput ? tagsInput.value.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const memo = memoInput ? memoInput.value : "";
        const badges = [...document.querySelectorAll(".wfm-badge-checkbox:checked")].map((cb) => cb.value);
        await saveModelMetadata(modelName, { tags, memo, badges });
        showToast(t("modelsSaved"), "success");
        renderTagFilter();
        renderDirFilter();
        renderModelGrid();
    });

    // GenUI Model button
    document.getElementById("wfm-modal-genui-model")?.addEventListener("click", () => {
        applyToGenUI(modelName, state.activeModelType);
    });

    // Delete model button
    document.getElementById("wfm-modal-model-delete")?.addEventListener("click", async () => {
        const confirmMsg = t("modelBulkDeleteConfirm").replace("{count}", "1");
        if (!confirm(confirmMsg)) return;
        try {
            const res = await fetch("/api/wfm/models/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model_type: state.activeModelType, model_names: [modelName] }),
            });
            const data = await res.json();
            if (data.errors?.length > 0) {
                showToast(`${t("modelBulkDeleteError")}: ${data.errors[0].error}`, "error");
                return;
            }
            showToast(`${getStem(name)} ${t("modelBulkDeleteDone")}`, "success");
            closeModal();
            const list = state.modelsByType[state.activeModelType];
            const idx = list.indexOf(modelName);
            if (idx !== -1) list.splice(idx, 1);
            delete state.modelMetadata[modelName];
            const ds = state.disabledModels[state.activeModelType];
            if (ds) ds.delete(modelName);
            state.selectedModels.delete(modelName);
            if (state.selectedModel === modelName) {
                state.selectedModel = null;
                const titleEl = document.getElementById("wfm-models-panel-title");
                if (titleEl) titleEl.textContent = "";
            }
            renderModelGrid();
        } catch (err) {
            showToast(`${t("modelBulkDeleteError")}: ${err.message}`, "error");
        }
    });

    // Change thumbnail
    const changeBtn = document.getElementById("wfm-modal-change-thumb");
    const thumbFile = document.getElementById("wfm-modal-thumb-file");
    if (changeBtn && thumbFile) {
        changeBtn.addEventListener("click", () => { thumbFile.value = ""; thumbFile.click(); });
        thumbFile.addEventListener("change", async () => {
            const file = thumbFile.files?.[0];
            if (!file) return;
            changeBtn.disabled = true;
            changeBtn.textContent = t("uploading");
            try {
                const fd = new FormData();
                fd.append("type", state.activeModelType);
                fd.append("name", modelName);
                fd.append("file", file);
                const res = await fetch("/api/wfm/models/change-preview", { method: "POST", body: fd });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                // Reload preview in modal
                const newUrl = previewUrl(modelName) + "&t=" + Date.now();
                const mImg = document.querySelector(".wfm-modal-thumb-img");
                const mPlaceholder = document.querySelector(".wfm-modal-thumb-placeholder");
                if (mImg) { mImg.src = newUrl; mImg.style.display = ""; }
                if (mPlaceholder) mPlaceholder.style.display = "none";
                renderModelGrid();
                if (state.selectedModel === modelName) renderSideInfo(modelName);
                showToast(t("thumbnailChanged"), "success");
            } catch (err) {
                showToast(t("thumbnailError") + ": " + err.message, "error");
            } finally {
                changeBtn.disabled = false;
                changeBtn.textContent = t("changeThumbnail");
                thumbFile.value = "";
            }
        });
    }
}

// ── Side Panel ────────────────────────────────────────────

function showSidePanel(modelName) {
    state.selectedModel = modelName;

    // Highlight selected
    document.querySelectorAll("#wfm-models-grid .wfm-card, #wfm-models-grid .wfm-models-table-row").forEach((el) => {
        el.classList.toggle("wfm-card-selected", el.dataset.modelName === modelName);
    });

    const { name } = parseModelPath(modelName);
    document.getElementById("wfm-models-panel-title").textContent = name;

    // Reset to CivitAI tab
    document.querySelectorAll(".wfm-models-side-tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector('.wfm-models-side-tab-btn[data-side-tab="civitai"]')?.classList.add("active");
    document.querySelectorAll(".wfm-models-side-content").forEach((c) => (c.style.display = "none"));
    const civitaiEl = document.getElementById("wfm-models-side-civitai");
    if (civitaiEl) civitaiEl.style.display = "block";

    renderSideInfo(modelName);
    renderSideGroup(modelName);
    renderSideCivitai(modelName);
}

function closeSidePanel() {
    state.selectedModel = null;
    const titleEl = document.getElementById("wfm-models-panel-title");
    if (titleEl) titleEl.textContent = "";
    document.querySelectorAll("#wfm-models-grid .wfm-card, #wfm-models-grid .wfm-models-table-row").forEach((el) => {
        el.classList.remove("wfm-card-selected");
    });
}

// ── Side Panel: Info Tab ──────────────────────────────────

function renderSideInfo(modelName) {
    const el = document.getElementById("wfm-models-side-info");
    if (!el) return;

    const meta = state.modelMetadata[modelName] || {};
    const { dir, name } = parseModelPath(modelName);
    const ext = getExtension(name);
    const tagsStr = (meta.tags || []).join(", ");
    const userBadgesHtml = modelBadgesHtml(modelName, false);

    el.innerHTML = `
        <div class="wfm-side-thumb-container">
            <div class="wfm-side-thumb-img-wrap">
                <img style="display:none" />
                <span class="wfm-side-thumb-placeholder">${t("modelsNoPreview")}</span>
            </div>
            <div class="wfm-side-thumb-info">
                <div class="wfm-side-thumb-name wfm-model-name-copy" title="${t("modelsCopyName")}">${escapeHtml(name)}</div>
                <div class="wfm-side-thumb-meta">
                    <span class="wfm-badge wfm-badge-sm">${escapeHtml(ext)}</span>
                    ${dir ? `<span class="wfm-badge wfm-badge-sm wfm-badge-dir">${escapeHtml(dir)}</span>` : ""}
                    ${userBadgesHtml}
                </div>
            </div>
        </div>
        <div class="wfm-node-detail-section">
            <div class="wfm-node-detail-label">${t("modelsFilePath")}</div>
            <div class="wfm-node-detail-value">
                <span id="wfm-models-side-filepath" class="wfm-model-filepath" title="${t("modelsCopyPath")}" style="cursor:pointer;word-break:break-all;font-size:0.85em;color:#aaa;">${t("modelsLoading")}...</span>
            </div>
        </div>
        <div class="wfm-node-detail-section">
            <div class="wfm-node-detail-label">${t("modelsTags")}</div>
            <div class="wfm-node-detail-value">
                <input type="text" id="wfm-models-side-tags" class="wfm-search-input" value="${escapeHtml(tagsStr)}" placeholder="${t("modelsTagsPlaceholder")}">
            </div>
        </div>
        <div class="wfm-node-detail-section">
            <div class="wfm-node-detail-label">${t("modelsMemo")}</div>
            <div class="wfm-node-detail-value">
                <textarea id="wfm-models-side-memo" class="wfm-textarea" rows="4" placeholder="${t("modelsMemoPlaceholder")}">${escapeHtml(meta.memo || "")}</textarea>
            </div>
        </div>
        <div class="wfm-node-detail-section" style="display:flex;gap:6px;">
            <button id="wfm-models-side-save-btn" class="wfm-btn wfm-btn-sm wfm-btn-primary">${t("modelsSave")}</button>
            ${GENUI_TYPE_MAP[state.activeModelType]
                ? `<button id="wfm-models-side-genui-btn" class="wfm-btn wfm-btn-sm" title="${t("modelsGenUITitle")}">${t("modelsGenUIBtn")}</button>`
                : ""}
        </div>`;

    // Load preview image
    const sideImg = el.querySelector(".wfm-side-thumb-img-wrap img");
    const sidePlaceholder = el.querySelector(".wfm-side-thumb-placeholder");
    if (sideImg) loadPreviewImage(sideImg, sidePlaceholder, modelName);

    // Copy model name on click
    el.querySelector(".wfm-model-name-copy")?.addEventListener("click", () => {
        navigator.clipboard.writeText(modelName).then(() => {
            showToast(t("modelsCopiedName"), "success");
        });
    });

    // Fetch and display file path
    fetch(`/api/wfm/models/filepath?type=${encodeURIComponent(state.activeModelType)}&name=${encodeURIComponent(modelName)}`)
        .then((r) => r.json())
        .then((data) => {
            const fpEl = document.getElementById("wfm-models-side-filepath");
            if (fpEl && data.path) {
                fpEl.textContent = data.path;
                fpEl.title = t("modelsCopyPath");
            } else if (fpEl) {
                fpEl.textContent = modelName;
            }
        })
        .catch(() => {
            const fpEl = document.getElementById("wfm-models-side-filepath");
            if (fpEl) fpEl.textContent = modelName;
        });

    // Copy file path on click
    el.querySelector("#wfm-models-side-filepath")?.addEventListener("click", () => {
        const fpEl = document.getElementById("wfm-models-side-filepath");
        if (fpEl) {
            navigator.clipboard.writeText(fpEl.textContent).then(() => {
                showToast(t("modelsCopiedPath"), "success");
            });
        }
    });

    // Save button
    el.querySelector("#wfm-models-side-save-btn")?.addEventListener("click", () => {
        const tagsInput = document.getElementById("wfm-models-side-tags");
        const memoInput = document.getElementById("wfm-models-side-memo");
        const tags = tagsInput ? tagsInput.value.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const memo = memoInput ? memoInput.value : "";
        saveModelMetadata(modelName, { tags, memo }).then(() => {
            showToast(t("modelsSaved"), "success");
            renderTagFilter();
            renderModelGrid();
        });
    });

    // GenUI Model button
    el.querySelector("#wfm-models-side-genui-btn")?.addEventListener("click", () => {
        applyToGenUI(modelName, state.activeModelType);
    });
}

// ── Side Panel: Group Tab ─────────────────────────────────

function renderSideGroup(modelName) {
    const el = document.getElementById("wfm-models-side-group");
    if (!el) return;

    // Find groups this model belongs to
    const memberOf = [];
    for (const [gName, members] of Object.entries(state.modelGroups)) {
        if (members.includes(modelName)) memberOf.push(gName);
    }

    // All group names for the assign dropdown
    const allGroups = Object.keys(state.modelGroups).sort();
    const availableGroups = allGroups.filter((g) => !memberOf.includes(g));

    el.innerHTML = `
        <div style="padding:0 4px;">
            <div style="margin-bottom:12px;">
                <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${t("modelsCurrentGroups")}</div>
                ${memberOf.length === 0
                    ? `<p style="color:var(--wfm-text-secondary);font-size:12px;">${t("modelsNoGroup")}</p>`
                    : memberOf.map((g) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;">
                        <span style="font-size:13px;">${escapeHtml(g)}</span>
                        <button class="wfm-btn wfm-btn-sm wfm-btn-danger wfm-group-remove" data-group="${escapeHtml(g)}" title="${t("modelsRemoveFromGroup")}">&times;</button>
                      </div>`).join("")}
            </div>
            <div style="margin-bottom:12px;">
                <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${t("modelsAssignGroup")}</div>
                <div style="display:flex;gap:4px;">
                    <select id="wfm-models-group-assign" class="wfm-select" style="flex:1;font-size:12px;">
                        ${availableGroups.length === 0
                            ? `<option value="">${t("modelsNoGroupAvailable")}</option>`
                            : availableGroups.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("")}
                    </select>
                    <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-models-group-assign-btn" ${availableGroups.length === 0 ? "disabled" : ""}>${t("modelsAdd")}</button>
                </div>
            </div>
            <div>
                <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${t("modelsCreateGroup")}</div>
                <div style="display:flex;gap:4px;">
                    <input type="text" id="wfm-models-group-new" class="wfm-search-input" style="flex:1;font-size:12px;" placeholder="${t("modelsGroupName")}">
                    <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-models-group-create-btn">${t("modelsCreate")}</button>
                </div>
            </div>
            <div style="margin-top:16px;border-top:1px solid var(--wfm-border);padding-top:12px;">
                <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${t("modelsManageGroups")}</div>
                <div style="display:flex;gap:4px;margin-bottom:6px;">
                    <select id="wfm-models-group-manage-select" class="wfm-select" style="flex:1;font-size:12px;">
                        ${allGroups.length === 0
                            ? `<option value="">${t("modelsNoGroupAvailable")}</option>`
                            : allGroups.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("")}
                    </select>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-models-group-rename-btn" ${allGroups.length === 0 ? "disabled" : ""}>${t("modelsRename")}</button>
                    <button class="wfm-btn wfm-btn-sm wfm-btn-danger" id="wfm-models-group-delete-btn" ${allGroups.length === 0 ? "disabled" : ""}>${t("modelsDelete")}</button>
                </div>
                <div style="display:flex;gap:4px;">
                    <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-models-group-enable-btn" ${allGroups.length === 0 ? "disabled" : ""}>${t("modelGroupEnableAll")}</button>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-models-group-disable-btn" ${allGroups.length === 0 ? "disabled" : ""}>${t("modelGroupDisableAll")}</button>
                </div>
            </div>
        </div>
    `;

    // Remove from group
    el.querySelectorAll(".wfm-group-remove").forEach((btn) => {
        btn.addEventListener("click", () => {
            const g = btn.dataset.group;
            const members = state.modelGroups[g] || [];
            state.modelGroups[g] = members.filter((m) => m !== modelName);
            if (state.modelGroups[g].length === 0) delete state.modelGroups[g];
            saveModelGroups(state.modelGroups).then(() => {
                renderSideGroup(modelName);
                renderModelGrid();
            });
        });
    });

    // Assign to group
    document.getElementById("wfm-models-group-assign-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-models-group-assign");
        const g = sel?.value;
        if (!g) return;
        if (!state.modelGroups[g]) state.modelGroups[g] = [];
        if (!state.modelGroups[g].includes(modelName)) state.modelGroups[g].push(modelName);
        saveModelGroups(state.modelGroups).then(() => {
            renderSideGroup(modelName);
        });
    });

    // Create new group
    document.getElementById("wfm-models-group-create-btn")?.addEventListener("click", () => {
        const input = document.getElementById("wfm-models-group-new");
        const name = input?.value.trim();
        if (!name) return;
        if (state.modelGroups[name]) {
            showToast(t("modelsGroupExists"), "warning");
            return;
        }
        state.modelGroups[name] = [modelName];
        saveModelGroups(state.modelGroups).then(() => {
            renderSideGroup(modelName);
        });
    });

    // Rename group
    document.getElementById("wfm-models-group-rename-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-models-group-manage-select");
        const oldName = sel?.value;
        if (!oldName) return;
        if (RESERVED_GROUPS.includes(oldName)) {
            showToast(t("modelsGroupReserved"), "warning");
            return;
        }
        const newName = prompt(t("modelsRenamePrompt"), oldName);
        if (!newName || newName === oldName) return;
        if (state.modelGroups[newName]) {
            showToast(t("modelsGroupExists"), "warning");
            return;
        }
        state.modelGroups[newName] = state.modelGroups[oldName];
        delete state.modelGroups[oldName];
        saveModelGroups(state.modelGroups).then(() => {
            renderSideGroup(modelName);
            renderModelGrid();
        });
    });

    // Delete group
    document.getElementById("wfm-models-group-delete-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-models-group-manage-select");
        const g = sel?.value;
        if (!g) return;
        if (RESERVED_GROUPS.includes(g)) {
            showToast(t("modelsGroupReserved"), "warning");
            return;
        }
        if (!confirm(t("modelsDeleteGroupConfirm").replace("{name}", g))) return;
        delete state.modelGroups[g];
        saveModelGroups(state.modelGroups).then(() => {
            renderSideGroup(modelName);
            renderModelGrid();
        });
    });

    // Enable all models in selected group
    document.getElementById("wfm-models-group-enable-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-models-group-manage-select");
        const g = sel?.value;
        if (!g) return;
        toggleGroupEnable(g, true).then(() => renderSideGroup(modelName));
    });

    // Disable all models in selected group
    document.getElementById("wfm-models-group-disable-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-models-group-manage-select");
        const g = sel?.value;
        if (!g) return;
        toggleGroupEnable(g, false).then(() => renderSideGroup(modelName));
    });
}

// ── Side Panel: CivitAI Tab ───────────────────────────────

function renderSideCivitai(modelName) {
    const el = document.getElementById("wfm-models-side-civitai");
    if (!el) return;

    // Check if we have cached civitai data via sha256
    const meta = state.modelMetadata[modelName] || {};
    const sha256 = meta.sha256;
    const cached = sha256 && state.civitaiCache[sha256];

    if (cached) {
        renderCivitaiInfo(el, cached, modelName);
    } else if (sha256) {
        // SHA256 is known but model was not found on CivitAI
        el.innerHTML = `
            <div style="padding:0 4px;text-align:center;">
                <p style="color:var(--wfm-text-secondary);font-size:13px;margin-bottom:12px;">
                    ${t("civitaiNotFoundDesc")}
                </p>
                <button class="wfm-btn wfm-btn-sm" id="wfm-civitai-fetch-btn">
                    ${t("civitaiRefetchBtn")}
                </button>
                <div id="wfm-civitai-status" style="margin-top:8px;font-size:12px;color:var(--wfm-text-secondary);"></div>
            </div>`;
        document.getElementById("wfm-civitai-fetch-btn")?.addEventListener("click", () => {
            fetchCivitaiForModel(modelName, el);
        });
    } else {
        el.innerHTML = `
            <div style="padding:0 4px;text-align:center;">
                <p style="color:var(--wfm-text-secondary);font-size:13px;margin-bottom:12px;">
                    ${t("civitaiFetchDesc")}
                </p>
                <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-civitai-fetch-btn">
                    ${t("civitaiFetch")}
                </button>
                <div id="wfm-civitai-status" style="margin-top:8px;font-size:12px;color:var(--wfm-text-secondary);"></div>
            </div>`;
        document.getElementById("wfm-civitai-fetch-btn")?.addEventListener("click", () => {
            fetchCivitaiForModel(modelName, el);
        });
    }
}

async function fetchCivitaiForModel(modelName, el) {
    const statusEl = document.getElementById("wfm-civitai-status");
    const fetchBtn = document.getElementById("wfm-civitai-fetch-btn");
    if (fetchBtn) fetchBtn.disabled = true;
    if (statusEl) statusEl.textContent = t("civitaiHashing");

    try {
        const res = await fetch("/api/wfm/models/civitai/fetch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: state.activeModelType, name: modelName }),
        });
        const data = await res.json();

        if (data.status === "ok" && data.civitai) {
            // Update caches
            if (data.sha256) {
                state.civitaiCache[data.sha256] = data.civitai;
                // Update metadata with sha256
                if (!state.modelMetadata[modelName]) state.modelMetadata[modelName] = {};
                state.modelMetadata[modelName].sha256 = data.sha256;
            }
            renderCivitaiInfo(el, data.civitai, modelName);
            showToast(t("civitaiFound"), "success");
            // Always refresh preview: local file if saved, otherwise civitai image as fallback
            const sidePanel = document.getElementById("wfm-models-side-panel");
            if (sidePanel) {
                const sideImg = sidePanel.querySelector(".wfm-side-thumb-img-wrap img");
                const sidePh = sidePanel.querySelector(".wfm-side-thumb-placeholder");
                if (sideImg) {
                    if (data.preview_saved) {
                        sideImg.src = previewUrl(modelName) + "&t=" + Date.now();
                    } else {
                        const civitaiImg = data.civitai.images && data.civitai.images[0];
                        if (civitaiImg) sideImg.src = civitaiImg;
                    }
                    sideImg.style.display = "";
                    if (sidePh) sidePh.style.display = "none";
                }
            }
            renderModelGrid();
        } else if (data.status === "not_found") {
            if (statusEl) statusEl.textContent = t("civitaiNotFound");
            if (fetchBtn) fetchBtn.disabled = false;
        } else {
            if (statusEl) statusEl.textContent = data.error || t("civitaiError");
            if (fetchBtn) fetchBtn.disabled = false;
        }
    } catch (err) {
        console.error("CivitAI fetch error:", err);
        if (statusEl) statusEl.textContent = t("civitaiError");
        if (fetchBtn) fetchBtn.disabled = false;
    }
}

function renderCivitaiInfo(el, info, modelName) {
    // URL: ユーザー設定ホスト（localStorage）を使用、modelId なし時は /model-versions/ にフォールバック
    const civitaiHost = localStorage.getItem("wfm_civitai_host") || "civitai.com";
    const modelUrl = info.modelId && info.versionId
        ? `https://${civitaiHost}/models/${info.modelId}?modelVersionId=${info.versionId}`
        : info.versionId
            ? `https://${civitaiHost}/model-versions/${info.versionId}`
            : (info.modelUrl || "#");

    // Hash: BLAKE3 優先、なければ SHA256
    const fileHashes = info.fileHashes || {};
    const blake3 = fileHashes.BLAKE3 || fileHashes.Blake3 || "";
    const sha256 = fileHashes.SHA256 || (state.modelMetadata[modelName] || {}).sha256 || "";
    const hashType = blake3 ? "BLAKE3" : (sha256 ? "SHA256" : "");
    const hashFull = blake3 || sha256;

    // Detail rows
    const ROW = "display:flex;align-items:center;font-size:12px;margin-bottom:5px;";
    const LABEL = "color:var(--wfm-text-secondary);min-width:80px;flex-shrink:0;";

    const typeRow = info.type ? `
        <div style="${ROW}">
            <span style="${LABEL}">${t("civitaiType")}</span>
            <span style="font-size:10px;font-weight:700;background:var(--wfm-bg-tertiary,rgba(255,255,255,0.1));padding:2px 7px;border-radius:3px;letter-spacing:0.6px;">${escapeHtml(info.type.toUpperCase())}</span>
        </div>` : "";

    const baseModelRow = info.baseModel ? `
        <div style="${ROW}">
            <span style="${LABEL}">${t("civitaiBaseModel")}</span>
            <span>${escapeHtml(info.baseModel)}</span>
        </div>` : "";

    const hashRow = hashFull ? `
        <div style="${ROW}">
            <span style="${LABEL}">${t("civitaiHashLabel")}</span>
            <code class="wfm-hash-value" data-hash="${escapeHtml(hashFull)}"
                style="background:var(--wfm-bg-secondary);padding:2px 6px;border-radius:3px;cursor:pointer;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:calc(100% - 84px);"
                title="${t("civitaiCopyHash")}">${escapeHtml(hashType)}: ${escapeHtml(hashFull.substring(0, 16).toUpperCase())}…</code>
        </div>` : "";

    const detailSection = (typeRow || baseModelRow || hashRow)
        ? `<div style="margin-bottom:10px;">${typeRow}${baseModelRow}${hashRow}</div>` : "";

    const tagsHtml = (info.tags || []).map((tag) =>
        `<span class="wfm-badge wfm-badge-sm">${escapeHtml(tag)}</span>`
    ).join(" ");

    const trainedWordsHtml = (info.trainedWords || []).map((w) =>
        `<code style="font-size:11px;background:var(--wfm-bg-secondary);padding:1px 4px;border-radius:3px;cursor:pointer;" class="wfm-trained-word" title="${t("civitaiCopyWord")}">${escapeHtml(w)}</code>`
    ).join(" ");

    // Sample images — all go to Sample pane
    const images = info.images || [];
    const sampleImagesHtml = images.map((url) =>
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${t("civitaiOpenImage")}"><img src="${escapeHtml(url)}" style="width:100%;border-radius:4px;margin-bottom:6px;cursor:pointer;display:block;" loading="lazy" /></a>`
    ).join("");

    el.innerHTML = `
        <div style="padding:0 4px;">
            <div style="display:flex;border-bottom:1px solid var(--wfm-border);margin-bottom:10px;">
                <button class="wfm-civitai-subtab-btn" data-pane="info"
                    style="padding:4px 10px;font-size:12px;border:none;background:none;cursor:pointer;border-bottom:2px solid var(--wfm-primary);color:var(--wfm-primary);font-weight:600;margin-bottom:-1px;">
                    ${t("civitaiTabInfo")}
                </button>
                <button class="wfm-civitai-subtab-btn" data-pane="sample"
                    style="padding:4px 10px;font-size:12px;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;color:var(--wfm-text-secondary);margin-bottom:-1px;">
                    ${t("civitaiTabSample")}${images.length ? ` (${images.length})` : ""}
                </button>
            </div>

            <div id="wfm-civitai-pane-info">
                <div style="margin-bottom:10px;">
                    <div style="font-weight:700;font-size:14px;margin-bottom:2px;">
                        <a href="${escapeHtml(modelUrl)}" target="_blank" style="color:var(--wfm-primary);text-decoration:none;">${escapeHtml(info.modelName)}</a>
                    </div>
                    <div style="font-size:12px;color:var(--wfm-text-secondary);">
                        ${escapeHtml(info.versionName)}${info.creator ? ` · by ${escapeHtml(info.creator)}` : ""}
                    </div>
                </div>
                ${detailSection}
                ${tagsHtml ? `<div style="margin-bottom:8px;">${tagsHtml}</div>` : ""}
                ${trainedWordsHtml ? `<div style="margin-bottom:10px;"><div style="font-weight:600;font-size:12px;margin-bottom:4px;">${t("civitaiTriggerWords")}</div>${trainedWordsHtml}</div>` : ""}
                ${info.description ? `<div style="font-size:12px;color:var(--wfm-text-secondary);line-height:1.5;max-height:120px;overflow-y:auto;">${info.description}</div>` : ""}
                <div style="margin-top:10px;">
                    <button class="wfm-btn wfm-btn-sm" id="wfm-civitai-refresh-btn">${t("civitaiRefresh")}</button>
                </div>
            </div>

            <div id="wfm-civitai-pane-sample" style="display:none;">
                ${sampleImagesHtml || `<p style="color:var(--wfm-text-secondary);font-size:13px;text-align:center;margin-top:20px;">${t("civitaiNoImages")}</p>`}
            </div>
        </div>`;

    // Sub-tab switching
    const subtabBtns = el.querySelectorAll(".wfm-civitai-subtab-btn");
    subtabBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const pane = btn.dataset.pane;
            subtabBtns.forEach((b) => {
                const isActive = b === btn;
                b.style.borderBottom = isActive ? "2px solid var(--wfm-primary)" : "2px solid transparent";
                b.style.color = isActive ? "var(--wfm-primary)" : "var(--wfm-text-secondary)";
                b.style.fontWeight = isActive ? "600" : "400";
            });
            el.querySelector("#wfm-civitai-pane-info").style.display = pane === "info" ? "" : "none";
            el.querySelector("#wfm-civitai-pane-sample").style.display = pane === "sample" ? "" : "none";
        });
    });

    // Copy trigger word on click
    el.querySelectorAll(".wfm-trained-word").forEach((wordEl) => {
        wordEl.addEventListener("click", () => {
            navigator.clipboard.writeText(wordEl.textContent).then(() => {
                showToast(t("civitaiWordCopied"), "success");
            });
        });
    });

    // Copy hash on click
    el.querySelectorAll(".wfm-hash-value").forEach((hashEl) => {
        hashEl.addEventListener("click", () => {
            navigator.clipboard.writeText(hashEl.dataset.hash).then(() => {
                showToast(t("civitaiHashCopied"), "success");
            });
        });
    });

    // Refresh button
    document.getElementById("wfm-civitai-refresh-btn")?.addEventListener("click", () => {
        const meta = state.modelMetadata[modelName] || {};
        if (meta.sha256) delete state.civitaiCache[meta.sha256];
        delete meta.sha256;
        fetchCivitaiForModel(modelName, el);
    });
}

// ── Data Loading ──────────────────────────────────────────

async function loadModelsForCurrentType() {
    const type = state.activeModelType;
    const placeholder = document.getElementById("wfm-models-placeholder");

    if (state.loaded[type] && state.modelsByType[type].length > 0) {
        // Reload groups for this type (groups are per-type)
        state.modelGroups = await fetchModelGroups();
        if (BATCH_MODEL_TYPES.includes(type) && !state.modelGroups["Batch"]) {
            state.modelGroups["Batch"] = [];
            await saveModelGroups(state.modelGroups);
        }
        if (STACK_MODEL_TYPES.includes(type) && !state.modelGroups["Stack"]) {
            state.modelGroups["Stack"] = [];
            await saveModelGroups(state.modelGroups);
        }
        if (!STACK_MODEL_TYPES.includes(type)) delete state.modelGroups["Stack"];
        state.allModelGroups[type] = state.modelGroups;
        renderTagFilter();
        renderDirFilter();
        renderGroupFilter();
        renderModelGrid();
        fetchSubdirs();
        return;
    }

    if (placeholder) placeholder.textContent = t("modelsLoading");

    try {
        const fetchFn = FETCH_MAP[type];
        if (!fetchFn) throw new Error("Unknown model type: " + type);

        const [models, disabledList, groups] = await Promise.all([
            fetchFn(), fetchDisabledModels(type), fetchModelGroups(),
        ]);
        const disabledSet = new Set(Array.isArray(disabledList) ? disabledList : []);
        state.disabledModels[type] = disabledSet;
        if (BATCH_MODEL_TYPES.includes(type) && !groups["Batch"]) {
            groups["Batch"] = [];
            await saveModelGroups(groups);
        }
        if (STACK_MODEL_TYPES.includes(type) && !groups["Stack"]) {
            groups["Stack"] = [];
            await saveModelGroups(groups);
        }
        if (!STACK_MODEL_TYPES.includes(type)) delete groups["Stack"];
        state.modelGroups = groups;
        state.allModelGroups[type] = groups;

        // Merge enabled + disabled into one list (dedup)
        // Guard: ensure models is an array (ComfyUI may return non-array on edge cases)
        const enabledList = Array.isArray(models) ? models : [];
        const allModels = [...new Set([...enabledList, ...disabledSet])];
        state.modelsByType[type] = allModels;
        state.loaded[type] = true;

        renderTagFilter();
        renderDirFilter();
        renderGroupFilter();
        renderModelGrid();
        fetchSubdirs();
    } catch (err) {
        console.error("Failed to load models:", err);
        if (placeholder) placeholder.textContent = t("modelsLoadError");
        showToast(t("errorWithMsg", err.message), "error");
    }
}

async function fetchCivitaiCache() {
    try {
        const res = await fetch("/api/wfm/models/civitai/cache");
        return res.ok ? await res.json() : {};
    } catch { return {}; }
}

async function batchFetchCivitai() {
    const models = getCurrentModels();
    if (models.length === 0) {
        showToast(t("modelsNoModels"), "warning");
        return;
    }

    // Filter out models that already have CivitAI data
    const meta = state.modelMetadata;
    const uncached = models.filter((m) => {
        const sha = meta[m]?.sha256;
        return !sha || !state.civitaiCache[sha];
    });

    if (uncached.length === 0) {
        showToast(t("civitaiBatchAllCached"), "info");
        return;
    }

    const btn = document.getElementById("wfm-models-civitai-batch-btn");
    const progressEl = document.getElementById("wfm-models-civitai-progress");
    if (btn) btn.disabled = true;

    try {
        const res = await fetch("/api/wfm/models/civitai/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: state.activeModelType, models: uncached }),
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Parse SSE events
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            let eventType = "";
            for (const line of lines) {
                if (line.startsWith("event: ")) {
                    eventType = line.slice(7).trim();
                } else if (line.startsWith("data: ")) {
                    const data = JSON.parse(line.slice(6));
                    if (eventType === "progress") {
                        const pct = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
                        const statusText = data.status === "hashing" ? t("civitaiHashing2")
                            : data.status === "fetching" ? t("civitaiFetching")
                            : data.status === "cached" ? "✓"
                            : data.status === "found" ? "✓"
                            : data.status === "not_found" ? "—"
                            : "";
                        if (progressEl) progressEl.textContent = `${pct}% (${data.current}/${data.total}) ${statusText}`;
                    } else if (eventType === "done") {
                        if (progressEl) progressEl.textContent = "";
                        const previewNote = data.preview_saved > 0 ? ` (+${data.preview_saved} preview)` : "";
                        showToast(t("civitaiBatchDone", data.found, data.not_found) + previewNote, "success");
                        // Reload caches
                        const [newMeta, newCache] = await Promise.all([fetchModelMetadata(), fetchCivitaiCache()]);
                        // Apply sha256 hashes from batch result directly in case fetchModelMetadata
                        // returns before the server has flushed updated metadata to disk
                        if (data.hashes) {
                            for (const [modelName, sha256] of Object.entries(data.hashes)) {
                                if (!newMeta[modelName]) newMeta[modelName] = {};
                                if (!newMeta[modelName].sha256) newMeta[modelName].sha256 = sha256;
                            }
                        }
                        state.modelMetadata = newMeta;
                        state.civitaiCache = newCache;
                        renderModelGrid();
                        // Refresh side panel if open
                        if (state.selectedModel) renderSideCivitai(state.selectedModel);
                    }
                }
            }
        }
    } catch (err) {
        console.error("Batch CivitAI error:", err);
        showToast(t("civitaiError"), "error");
    } finally {
        if (btn) btn.disabled = false;
        if (progressEl) progressEl.textContent = "";
    }
}

async function loadMetadataAndModels() {
    const [metadata, civitaiCache, allGroups] = await Promise.all([
        fetchModelMetadata(), fetchCivitaiCache(), fetchAllModelGroups()
    ]);
    state.modelMetadata = metadata;
    state.civitaiCache = civitaiCache;
    state.allModelGroups = allGroups;
    // groups are loaded per-type inside loadModelsForCurrentType
    await loadModelsForCurrentType();
}

// ── Init ──────────────────────────────────────────────────

export function initModelsTab() {
    // Sub-tab switching (model types)
    document.querySelectorAll(".wfm-models-type-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-models-type-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            state.activeModelType = btn.dataset.modelType;
            state.searchText = "";
            state.tagFilter = "";
            state.badgeFilter = "";
            state.dirFilter = "";
            state.groupFilter = "";
            state.statusFilter = "all";
            state.currentPage = 0;
            state.selectedModel = null;
            const statusFilter = document.getElementById("wfm-models-status-filter");
            if (statusFilter) statusFilter.value = "all";
            state.selectMode = false;
            state.selectedModels.clear();
            const selectBtn = document.getElementById("wfm-models-select-btn");
            if (selectBtn) { selectBtn.classList.remove("active"); selectBtn.textContent = t("modelSelectMode"); }
            renderBulkActionBar();
            closeSidePanel();

            const searchInput = document.getElementById("wfm-models-search");
            if (searchInput) searchInput.value = "";
            const tagFilter = document.getElementById("wfm-models-tag-filter");
            if (tagFilter) tagFilter.value = "";
            renderBadgeFilter();

            loadModelsForCurrentType();
        });
    });

    // Search
    const searchInput = document.getElementById("wfm-models-search");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            state.searchText = searchInput.value;
            state.currentPage = 0;
            renderModelGrid();
        });
    }

    // Tag filter
    document.getElementById("wfm-models-tag-filter")?.addEventListener("change", (e) => {
        state.tagFilter = e.target.value;
        state.currentPage = 0;
        renderModelGrid();
    });

    // Dir filter
    document.getElementById("wfm-models-dir-filter")?.addEventListener("change", (e) => {
        state.dirFilter = e.target.value;
        state.currentPage = 0;
        renderModelGrid();
    });

    // Group filter — value is "type::groupName" or "" for all
    document.getElementById("wfm-models-group-filter")?.addEventListener("change", async (e) => {
        const value = e.target.value;
        if (!value) {
            state.groupFilter = "";
        } else {
            const sepIdx = value.indexOf("::");
            const type = value.substring(0, sepIdx);
            const groupName = value.substring(sepIdx + 2);
            // Auto-switch model type if different
            if (type !== state.activeModelType) {
                document.querySelectorAll(".wfm-models-type-btn").forEach((b) => {
                    b.classList.toggle("active", b.dataset.modelType === type);
                });
                state.activeModelType = type;
                state.searchText = "";
                state.tagFilter = "";
                state.badgeFilter = "";
                state.dirFilter = "";
                state.statusFilter = "all";
                state.selectedModel = null;
                const statusFilter = document.getElementById("wfm-models-status-filter");
                if (statusFilter) statusFilter.value = "all";
                const searchInput = document.getElementById("wfm-models-search");
                if (searchInput) searchInput.value = "";
                closeSidePanel();
                await loadModelsForCurrentType();
            }
            state.groupFilter = groupName;
        }
        state.currentPage = 0;
        renderModelGrid();
    });

    // Status filter
    document.getElementById("wfm-models-status-filter")?.addEventListener("change", (e) => {
        state.statusFilter = e.target.value;
        state.currentPage = 0;
        renderModelGrid();
    });

    // Favorites filter
    const favBtn = document.getElementById("wfm-models-fav-btn");
    if (favBtn) {
        favBtn.addEventListener("click", () => {
            state.showFavoritesOnly = !state.showFavoritesOnly;
            favBtn.classList.toggle("active", state.showFavoritesOnly);
            state.currentPage = 0;
            renderModelGrid();
        });
    }

    // Batch filter
    document.getElementById("wfm-models-batch-filter-btn")?.addEventListener("click", () => {
        state.showBatchOnly = !state.showBatchOnly;
        document.getElementById("wfm-models-batch-filter-btn").classList.toggle("active", state.showBatchOnly);
        state.currentPage = 0;
        renderModelGrid();
    });

    // Batch clear
    document.getElementById("wfm-models-batch-clear-btn")?.addEventListener("click", () => {
        clearBatchGroup();
    });

    // Stack clear
    document.getElementById("wfm-models-stack-clear-btn")?.addEventListener("click", () => {
        clearStackGroup();
    });

    // View mode (thumb / card / table)
    document.querySelectorAll("[data-models-view]").forEach((btn) => {
        if (btn.dataset.modelsView === state.viewMode) {
            document.querySelectorAll("[data-models-view]").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
        }
        btn.addEventListener("click", () => {
            document.querySelectorAll("[data-models-view]").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            state.viewMode = btn.dataset.modelsView;
            localStorage.setItem("wfm_models_view", state.viewMode);
            renderModelGrid();
        });
    });

    // Badge manage button (toolbar)
    document.getElementById("wfm-models-badge-settings-btn")?.addEventListener("click", () => {
        openBadgeEditModal();
    });

    // Refresh
    document.getElementById("wfm-models-refresh-btn")?.addEventListener("click", () => {
        state.loaded[state.activeModelType] = false;
        state.modelsByType[state.activeModelType] = [];
        loadModelsForCurrentType();
    });

    // Select mode
    document.getElementById("wfm-models-select-btn")?.addEventListener("click", toggleSelectMode);

    // CivitAI batch fetch
    document.getElementById("wfm-models-civitai-batch-btn")?.addEventListener("click", () => {
        batchFetchCivitai();
    });

    // Side panel tab switching
    document.querySelectorAll(".wfm-models-side-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-models-side-tab-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            const tabId = btn.dataset.sideTab;
            document.querySelectorAll(".wfm-models-side-content").forEach((c) => (c.style.display = "none"));
            const map = { info: "wfm-models-side-info", group: "wfm-models-side-group", civitai: "wfm-models-side-civitai" };
            const target = document.getElementById(map[tabId]);
            if (target) target.style.display = "block";
            if (tabId === "civitai" && state.selectedModel) renderSideCivitai(state.selectedModel);
        });
    });

    // Initialize badge filter bar
    renderBadgeFilter();

    // Lazy load on first tab click
    let firstLoad = false;
    document.querySelector('[data-tab="models"]')?.addEventListener("click", () => {
        if (!firstLoad) {
            firstLoad = true;
            loadMetadataAndModels();
        }
    });
}

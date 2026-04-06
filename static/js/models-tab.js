/**
 * Models Tab - Model browser and metadata management
 * Supports: Thumbnail / Card / Table views, side panel (Info / Group / CivitAI), detail modal with badges
 */

import { showToast, openModal, closeModal } from "./app.js";
import { t } from "./i18n.js";
import { comfyUI } from "./comfyui-client.js";
import { comfyEditor } from "./comfyui-editor.js";

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
    civitaiCache: {},
    searchText: "",
    tagFilter: "",
    badgeFilter: "",
    dirFilter: "",
    groupFilter: "",
    showFavoritesOnly: false,
    viewMode: localStorage.getItem("wfm_models_view") || "thumb",
    activeModelType: "checkpoint",
    selectedModel: null,
    loaded: {},
    currentPage: 0,
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

    const { key, inputKey } = mapping;

    // Find the first matching node in the current workflow
    const nodeId = Object.keys(comfyUI.currentWorkflow).find((id) => {
        const node = comfyUI.currentWorkflow[id];
        return node.inputs && inputKey in node.inputs;
    });

    if (!nodeId) {
        showToast(t("modelsGenUINoNode", TYPE_LABELS[modelType] || modelType), "warning");
        return;
    }

    comfyUI.currentWorkflow[nodeId].inputs[inputKey] = modelName;

    // Sync GenUI select element if visible
    const selectEl = document.getElementById(`wfm-model-${key}`);
    if (selectEl) {
        // Add option if not present (subdir paths may not be in list)
        if (![...selectEl.options].some(o => o.value === modelName)) {
            const opt = document.createElement("option");
            opt.value = modelName;
            opt.textContent = modelName;
            selectEl.appendChild(opt);
        }
        selectEl.value = modelName;
    }

    // Sync raw JSON display
    const rawTextarea = document.getElementById("wfm-gen-raw-json");
    if (rawTextarea) {
        rawTextarea.value = JSON.stringify(comfyUI.currentWorkflow, null, 2);
    }

    showToast(`${TYPE_LABELS[modelType]}: ${modelName.split("/").pop().split("\\").pop()}`, "success");
}

// User-defined badge colors (stored in metadata per model)
// Global badge palette: label → color, stored in localStorage
function getBadgePalette() {
    try {
        return JSON.parse(localStorage.getItem("wfm_models_badge_palette") || "{}");
    } catch { return {}; }
}

function saveBadgePalette(palette) {
    localStorage.setItem("wfm_models_badge_palette", JSON.stringify(palette));
}

// ── Helpers ───────────────────────────────────────────────

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

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
 */
function loadPreviewImage(imgEl, placeholderEl, modelName, modelType) {
    const url = previewUrl(modelName, modelType);
    imgEl.onload = () => {
        imgEl.style.display = "";
        if (placeholderEl) placeholderEl.style.display = "none";
    };
    imgEl.onerror = () => {
        imgEl.style.display = "none";
        if (placeholderEl) placeholderEl.style.display = "";
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
        showToast("Error saving metadata: " + err.message, "error");
        return null;
    }
}

// ── Filtering ─────────────────────────────────────────────

function getCurrentModels() {
    return state.modelsByType[state.activeModelType] || [];
}

function filterModels() {
    let models = getCurrentModels();

    if (state.showFavoritesOnly) {
        models = models.filter((m) => {
            const meta = state.modelMetadata[m];
            return meta && meta.favorite;
        });
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

    return models;
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
    const groups = Object.keys(state.modelGroups).sort();
    select.innerHTML =
        `<option value="">${t("modelsAllGroups")}</option>` +
        groups.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
    select.value = state.groupFilter;
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
        const res = await fetch("/api/wfm/models/groups");
        return res.ok ? await res.json() : {};
    } catch { return {}; }
}

async function saveModelGroups(groups) {
    state.modelGroups = groups;
    await fetch("/api/wfm/models/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(groups),
    });
    renderGroupFilter();
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
    } else if (state.viewMode === "card") {
        renderCardView(grid, filtered);
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
        const userBadges = modelBadgesHtml(modelName);
        const tagsHtml = (meta.tags || []).map((tag) => `<span class="wfm-badge wfm-badge-sm">${escapeHtml(tag)}</span>`).join("");
        const favStar = meta.favorite ? "\u2605" : "\u2606";
        const favClass = meta.favorite ? "wfm-fav-btn active" : "wfm-fav-btn";

        const card = document.createElement("div");
        card.className = "wfm-card";
        if (state.selectedModel === modelName) card.classList.add("wfm-card-selected");
        card.dataset.modelName = modelName;

        card.innerHTML = `
            <div class="wfm-card-thumb">
                <img style="display:none" />
                <span class="wfm-card-thumb-placeholder">${t("modelsNoPreview")}</span>
            </div>
            <div class="wfm-card-body">
                <div class="wfm-card-title" title="${escapeHtml(modelName)}">${escapeHtml(getStem(name))}</div>
                <div class="wfm-card-meta">${userBadges} ${tagsHtml}</div>
            </div>
            <button class="${favClass}" title="${t("modelsFavorite")}">${favStar}</button>`;

        // Load preview without 404 console spam
        const img = card.querySelector(".wfm-card-thumb img");
        const placeholder = card.querySelector(".wfm-card-thumb-placeholder");
        loadPreviewImage(img, placeholder, modelName);

        card.querySelector(".wfm-fav-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(modelName);
        });
        card.addEventListener("click", () => showSidePanel(modelName));
        card.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            openDetailModal(modelName);
        });
        grid.appendChild(card);
    });
}

// ── Card View (no thumbnail, compact) ─────────────────────

function renderCardView(grid, models) {
    grid.innerHTML = "";
    models.forEach((modelName) => {
        const meta = state.modelMetadata[modelName] || {};
        const { dir, name } = parseModelPath(modelName);
        const ext = getExtension(name);
        const userBadges = modelBadgesHtml(modelName);
        const tagsHtml = (meta.tags || []).map((tag) => `<span class="wfm-badge wfm-badge-sm">${escapeHtml(tag)}</span>`).join("");
        const favStar = meta.favorite ? "\u2605" : "\u2606";
        const favClass = meta.favorite ? "wfm-fav-btn active" : "wfm-fav-btn";

        const card = document.createElement("div");
        card.className = "wfm-card wfm-model-card";
        if (state.selectedModel === modelName) card.classList.add("wfm-card-selected");
        card.dataset.modelName = modelName;

        card.innerHTML = `
            <div class="wfm-card-body">
                <div class="wfm-card-title" title="${escapeHtml(modelName)}">${escapeHtml(name)}</div>
                <div class="wfm-card-meta">
                    ${userBadges} ${tagsHtml}
                </div>
            </div>
            <button class="${favClass}" title="${t("modelsFavorite")}">${favStar}</button>`;

        card.querySelector(".wfm-fav-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(modelName);
        });
        card.addEventListener("click", () => showSidePanel(modelName));
        card.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            openDetailModal(modelName);
        });
        grid.appendChild(card);
    });
}

// ── Table View ────────────────────────────────────────────

function renderTableView(grid, models) {
    const rows = models
        .map((modelName) => {
            const meta = state.modelMetadata[modelName] || {};
            const { dir, name } = parseModelPath(modelName);
            const ext = getExtension(name);
            const favIcon = meta.favorite ? "&#9733;" : "&#9734;";
            const tagsStr = (meta.tags || []).join(", ");
            const memo = meta.memo || "";
            return `<tr class="wfm-models-table-row${state.selectedModel === modelName ? " wfm-card-selected" : ""}" data-model-name="${escapeHtml(modelName)}">
                <td class="wfm-models-table-fav" title="Favorite">${favIcon}</td>
                <td class="wfm-table-td-thumb"><img class="wfm-table-thumb" style="display:none" /></td>
                <td title="${escapeHtml(modelName)}">${escapeHtml(name)}</td>
                <td class="wfm-table-td-subdir">${escapeHtml(dir)}</td>
                <td class="wfm-table-td-ext">${escapeHtml(ext)}</td>
                <td>${escapeHtml(tagsStr)}</td>
                <td class="wfm-table-td-memo" title="${escapeHtml(memo)}">${escapeHtml(memo)}</td>
            </tr>`;
        })
        .join("");

    grid.innerHTML = `<table class="wfm-models-table"><thead><tr>
        <th style="width:30px;">&#9733;</th>
        <th style="width:40px;"></th>
        <th>${t("modelsFileName")}</th>
        <th class="wfm-table-th-subdir">${t("modelsSubdir")}</th>
        <th class="wfm-table-th-ext">${t("modelsExt")}</th>
        <th>${t("modelsTags")}</th>
        <th>${t("modelsMemo")}</th>
    </tr></thead><tbody>${rows}</tbody></table>`;

    grid.querySelectorAll(".wfm-models-table-row").forEach((row) => {
        const mn = row.dataset.modelName;
        // Load preview image without 404 console spam
        const img = row.querySelector(".wfm-table-thumb");
        if (img) loadPreviewImage(img, null, mn);

        row.addEventListener("click", () => showSidePanel(mn));
        row.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            openDetailModal(mn);
        });
        row.querySelector(".wfm-models-table-fav").addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(mn);
        });
    });
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

    // Reset to Info tab
    document.querySelectorAll(".wfm-models-side-tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector('.wfm-models-side-tab-btn[data-side-tab="info"]')?.classList.add("active");
    document.querySelectorAll(".wfm-models-side-content").forEach((c) => (c.style.display = "none"));
    const infoEl = document.getElementById("wfm-models-side-info");
    if (infoEl) infoEl.style.display = "block";

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
        if (!confirm(t("modelsDeleteGroupConfirm").replace("{name}", g))) return;
        delete state.modelGroups[g];
        saveModelGroups(state.modelGroups).then(() => {
            renderSideGroup(modelName);
            renderModelGrid();
        });
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
    const imagesHtml = (info.images || []).map((url) =>
        `<img src="${escapeHtml(url)}" style="width:100%;border-radius:4px;margin-bottom:6px;" loading="lazy" />`
    ).join("");

    const tagsHtml = (info.tags || []).map((tag) =>
        `<span class="wfm-badge wfm-badge-sm">${escapeHtml(tag)}</span>`
    ).join(" ");

    const trainedWordsHtml = (info.trainedWords || []).map((w) =>
        `<code style="font-size:11px;background:var(--wfm-bg-secondary);padding:1px 4px;border-radius:3px;cursor:pointer;" class="wfm-trained-word" title="${t("civitaiCopyWord")}">${escapeHtml(w)}</code>`
    ).join(" ");

    el.innerHTML = `
        <div style="padding:0 4px;">
            <div style="margin-bottom:10px;">
                <div style="font-weight:700;font-size:14px;margin-bottom:2px;">
                    <a href="${escapeHtml(info.modelUrl)}" target="_blank" style="color:var(--wfm-primary);text-decoration:none;">${escapeHtml(info.modelName)}</a>
                </div>
                <div style="font-size:12px;color:var(--wfm-text-secondary);">
                    ${escapeHtml(info.versionName)} · ${escapeHtml(info.baseModel)} · by ${escapeHtml(info.creator)}
                </div>
            </div>
            ${imagesHtml ? `<div style="margin-bottom:10px;">${imagesHtml}</div>` : ""}
            ${tagsHtml ? `<div style="margin-bottom:8px;">${tagsHtml}</div>` : ""}
            ${trainedWordsHtml ? `<div style="margin-bottom:10px;"><div style="font-weight:600;font-size:12px;margin-bottom:4px;">${t("civitaiTriggerWords")}</div>${trainedWordsHtml}</div>` : ""}
            ${info.description ? `<div style="font-size:12px;color:var(--wfm-text-secondary);line-height:1.5;max-height:200px;overflow-y:auto;">${info.description}</div>` : ""}
            <div style="margin-top:10px;">
                <button class="wfm-btn wfm-btn-sm" id="wfm-civitai-refresh-btn">${t("civitaiRefresh")}</button>
            </div>
        </div>`;

    // Copy trigger word on click
    el.querySelectorAll(".wfm-trained-word").forEach((wordEl) => {
        wordEl.addEventListener("click", () => {
            navigator.clipboard.writeText(wordEl.textContent).then(() => {
                showToast(t("civitaiWordCopied"), "success");
            });
        });
    });

    // Refresh button
    document.getElementById("wfm-civitai-refresh-btn")?.addEventListener("click", () => {
        // Clear cache for this model and re-fetch
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
        renderTagFilter();
        renderDirFilter();
        renderModelGrid();
        return;
    }

    if (placeholder) placeholder.textContent = t("modelsLoading");

    try {
        const fetchFn = FETCH_MAP[type];
        if (!fetchFn) throw new Error("Unknown model type: " + type);

        const models = await fetchFn();
        state.modelsByType[type] = models || [];
        state.loaded[type] = true;

        renderTagFilter();
        renderDirFilter();
        renderModelGrid();
    } catch (err) {
        console.error("Failed to load models:", err);
        if (placeholder) placeholder.textContent = t("modelsLoadError");
        showToast("Error: " + err.message, "error");
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
                        showToast(t("civitaiBatchDone", data.found, data.not_found), "success");
                        // Reload caches
                        const [newMeta, newCache] = await Promise.all([fetchModelMetadata(), fetchCivitaiCache()]);
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
    const [metadata, groups, civitaiCache] = await Promise.all([
        fetchModelMetadata(), fetchModelGroups(), fetchCivitaiCache()
    ]);
    state.modelMetadata = metadata;
    state.modelGroups = groups;
    state.civitaiCache = civitaiCache;
    renderGroupFilter();
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
            state.currentPage = 0;
            state.selectedModel = null;
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

    // Group filter
    document.getElementById("wfm-models-group-filter")?.addEventListener("change", (e) => {
        state.groupFilter = e.target.value;
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

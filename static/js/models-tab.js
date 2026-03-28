/**
 * Models Tab - Model browser and metadata management
 * Supports: Thumbnail / Card / Table views, side panel (Info / Group / CivitAI), detail modal with badges
 */

import { showToast, openModal, closeModal } from "./app.js";
import { t } from "./i18n.js";
import { comfyUI } from "./comfyui-client.js";

// ── State ─────────────────────────────────────────────────

const state = {
    modelsByType: {
        checkpoint: [],
        lora: [],
        vae: [],
        controlnet: [],
        unet: [],
        textencoder: [],
    },
    modelMetadata: {},
    modelGroups: {},
    civitaiCache: {},
    searchText: "",
    tagFilter: "",
    groupFilter: "",
    showFavoritesOnly: false,
    viewMode: localStorage.getItem("wfm_models_view") || "thumb",
    activeModelType: "checkpoint",
    selectedModel: null,
    loaded: {},
    currentPage: 0,
    badgeColors: JSON.parse(localStorage.getItem("wfm_models_badge_colors") || "{}"),
};

const MODELS_PER_PAGE = 24;

const FETCH_MAP = {
    checkpoint: () => comfyUI.fetchCheckpoints(),
    lora: () => comfyUI.fetchLoras(),
    vae: () => comfyUI.fetchVaes(),
    controlnet: () => comfyUI.fetchControlNets(),
    unet: () => comfyUI.fetchDiffusionModels(),
    textencoder: () => comfyUI.fetchTextEncoders(),
};

const TYPE_LABELS = {
    checkpoint: "Checkpoint",
    lora: "LoRA",
    vae: "VAE",
    controlnet: "ControlNet",
    unet: "UNET",
    textencoder: "TextEncoder",
};

// Default badge colors for model types
const DEFAULT_BADGE_COLORS = {
    Checkpoint: "#6366f1",
    LoRA: "#f59e0b",
    VAE: "#10b981",
    ControlNet: "#ef4444",
    UNET: "#8b5cf6",
    TextEncoder: "#06b6d4",
};

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
    const color = state.badgeColors[label] || DEFAULT_BADGE_COLORS[label] || "";
    const style = color ? ` style="background:${color};color:#fff;"` : "";
    return `<span class="wfm-badge wfm-badge-model"${style}>${escapeHtml(label)}</span>`;
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

// ── Badge Color Settings ──────────────────────────────────

function renderBadgeSettings() {
    const panel = document.getElementById("wfm-models-badge-settings-panel");
    if (!panel) return;

    const labels = Object.keys(TYPE_LABELS).map((k) => TYPE_LABELS[k]);
    panel.innerHTML = labels
        .map((label) => {
            const color = state.badgeColors[label] || DEFAULT_BADGE_COLORS[label] || "#6366f1";
            return `<div class="wfm-badge-color-row">
                ${badgeHtml(label)}
                <input type="color" value="${color}" data-badge-label="${escapeHtml(label)}" class="wfm-badge-color-input">
            </div>`;
        })
        .join("");

    panel.querySelectorAll(".wfm-badge-color-input").forEach((input) => {
        input.addEventListener("input", (e) => {
            state.badgeColors[e.target.dataset.badgeLabel] = e.target.value;
            localStorage.setItem("wfm_models_badge_colors", JSON.stringify(state.badgeColors));
            renderBadgeSettings();
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

    // Pagination
    const start = state.currentPage * MODELS_PER_PAGE;
    const page = filtered.slice(start, start + MODELS_PER_PAGE);
    const totalPages = Math.ceil(filtered.length / MODELS_PER_PAGE);

    if (state.viewMode === "table") {
        renderTableView(grid, page, totalPages);
    } else if (state.viewMode === "card") {
        renderCardView(grid, page, totalPages);
    } else {
        renderThumbView(grid, page, totalPages);
    }
}

// ── Thumbnail View (same as Workflow tab) ─────────────────

function renderThumbView(grid, models, totalPages) {
    grid.innerHTML = "";
    models.forEach((modelName) => {
        const meta = state.modelMetadata[modelName] || {};
        const { name } = parseModelPath(modelName);
        const typeLabel = TYPE_LABELS[state.activeModelType];
        const badges = badgeHtml(typeLabel);
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
                <div class="wfm-card-meta">${badges} ${tagsHtml}</div>
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

    updatePagination(totalPages);
}

// ── Card View (no thumbnail, compact) ─────────────────────

function renderCardView(grid, models, totalPages) {
    grid.innerHTML = "";
    models.forEach((modelName) => {
        const meta = state.modelMetadata[modelName] || {};
        const { dir, name } = parseModelPath(modelName);
        const ext = getExtension(name);
        const typeLabel = TYPE_LABELS[state.activeModelType];
        const badges = badgeHtml(typeLabel);
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
                    ${dir ? `<span class="wfm-badge wfm-badge-sm wfm-badge-dir">${escapeHtml(dir)}</span>` : ""}
                    <span class="wfm-badge wfm-badge-sm">${escapeHtml(ext)}</span>
                    ${badges} ${tagsHtml}
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

    updatePagination(totalPages);
}

// ── Table View ────────────────────────────────────────────

function renderTableView(grid, models, totalPages) {
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

    updatePagination(totalPages);
}

function updatePagination(totalPages) {
    const container = document.getElementById("wfm-models-pagination");
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ""; return; }
    container.innerHTML = `
        <button class="wfm-btn wfm-btn-sm" ${state.currentPage === 0 ? "disabled" : ""} data-page="prev">&laquo;</button>
        <span>${state.currentPage + 1} / ${totalPages}</span>
        <button class="wfm-btn wfm-btn-sm" ${state.currentPage >= totalPages - 1 ? "disabled" : ""} data-page="next">&raquo;</button>
    `;
    container.querySelector('[data-page="prev"]').addEventListener("click", () => {
        if (state.currentPage > 0) { state.currentPage--; renderModelGrid(); }
    });
    container.querySelector('[data-page="next"]').addEventListener("click", () => {
        if (state.currentPage < totalPages - 1) { state.currentPage++; renderModelGrid(); }
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
    const typeLabel = TYPE_LABELS[state.activeModelType];
    const typeBadge = badgeHtml(typeLabel);
    const ext = getExtension(name);
    const isFav = !!meta.favorite;
    const tagsStr = (meta.tags || []).join(", ");

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
                    <h4>${t("modelsModelType")}</h4>
                    <div>${typeBadge} <span class="wfm-badge wfm-badge-sm">${escapeHtml(ext)}</span></div>
                </section>
                ${dir ? `<section><h4>${t("modelsSubdir")}</h4><div>${escapeHtml(dir)}</div></section>` : ""}
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

    // Save
    document.getElementById("wfm-modal-model-save")?.addEventListener("click", async () => {
        const tagsInput = document.getElementById("wfm-modal-model-tags");
        const memoInput = document.getElementById("wfm-modal-model-memo");
        const tags = tagsInput ? tagsInput.value.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const memo = memoInput ? memoInput.value : "";
        await saveModelMetadata(modelName, { tags, memo });
        showToast(t("modelsSaved"), "success");
        renderTagFilter();
        renderModelGrid();
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
    const panel = document.getElementById("wfm-models-side-panel");
    if (!panel) return;
    panel.style.display = "flex";

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
    const panel = document.getElementById("wfm-models-side-panel");
    if (panel) panel.style.display = "none";
    state.selectedModel = null;
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
    const typeLabel = TYPE_LABELS[state.activeModelType] || state.activeModelType;
    const tagsStr = (meta.tags || []).join(", ");

    el.innerHTML = `
        <div class="wfm-side-thumb-container">
            <div class="wfm-side-thumb-img-wrap">
                <img style="display:none" />
                <span class="wfm-side-thumb-placeholder">${t("modelsNoPreview")}</span>
            </div>
            <div class="wfm-side-thumb-info">
                <div class="wfm-side-thumb-name wfm-model-name-copy" title="${t("modelsCopyName")}">${escapeHtml(name)}</div>
                <div class="wfm-side-thumb-meta">
                    ${badgeHtml(typeLabel)} <span class="wfm-badge wfm-badge-sm">${escapeHtml(ext)}</span>
                    ${dir ? `<span class="wfm-badge wfm-badge-sm wfm-badge-dir">${escapeHtml(dir)}</span>` : ""}
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
        <div class="wfm-node-detail-section">
            <button id="wfm-models-side-save-btn" class="wfm-btn wfm-btn-sm wfm-btn-primary">${t("modelsSave")}</button>
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
            state.currentPage = 0;
            state.selectedModel = null;
            closeSidePanel();

            const searchInput = document.getElementById("wfm-models-search");
            if (searchInput) searchInput.value = "";
            const tagFilter = document.getElementById("wfm-models-tag-filter");
            if (tagFilter) tagFilter.value = "";

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

    // Badge settings
    const badgeBtn = document.getElementById("wfm-models-badge-settings-btn");
    const badgePanel = document.getElementById("wfm-models-badge-settings-panel");
    if (badgeBtn && badgePanel) {
        badgeBtn.addEventListener("click", () => {
            const visible = badgePanel.style.display !== "none";
            badgePanel.style.display = visible ? "none" : "block";
            if (!visible) renderBadgeSettings();
        });
    }

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

    // Side panel close
    document.getElementById("wfm-models-panel-close")?.addEventListener("click", closeSidePanel);

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

    // Lazy load on first tab click
    let firstLoad = false;
    document.querySelector('[data-tab="models"]')?.addEventListener("click", () => {
        if (!firstLoad) {
            firstLoad = true;
            loadMetadataAndModels();
        }
    });
}

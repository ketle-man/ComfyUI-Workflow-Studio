/**
 * Models Tab - Grid rendering (Thumbnail / Table views) and per-card
 * Batch/Stack/Favorite toggles.
 *
 * This module and selection-bulk.js / detail-panel.js form a circular
 * import triangle with each other and with models-tab.js: rendering a card
 * needs to wire up selection, side-panel, and detail-modal click handlers,
 * and those in turn re-render the grid after they change state. All the
 * cross-module calls happen inside event handlers (never at module
 * evaluation time), and every export here is a `function` declaration
 * (hoisted), so the cycle resolves safely under ES Modules.
 */

import { showToast } from "../app.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../util.js";
import { state } from "./state.js";
import { filterModels, getCurrentModels, isModelDisabled } from "./filters.js";
import { modelBadgesHtml } from "./badges.js";
import { parseModelPath, getExtension, getStem, loadPreviewImage } from "./helpers.js";
import { toggleModelSelection } from "./selection-bulk.js";
import { showSidePanel, openDetailModal, renderSideInfo } from "./detail-panel.js";
import { saveModelGroups, saveModelMetadata, toggleModelEnable } from "../models-tab.js";

export function renderModelGrid() {
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

export function renderThumbView(grid, models) {
    grid.innerHTML = "";
    models.forEach((modelName) => {
        const meta = state.modelMetadata[modelName] || {};
        const { name } = parseModelPath(modelName);
        const disabled = isModelDisabled(modelName);
        const userBadges = modelBadgesHtml(modelName);
        const tagsHtml = (meta.tags || []).map((tag) => `<span class="wfm-badge wfm-badge-sm">${escapeHtml(tag)}</span>`).join("");
        const favStar = meta.favorite ? "★" : "☆";
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
            const btn = e.currentTarget;
            await toggleBatch(modelName);
            if (state.showBatchOnly) {
                renderModelGrid();
            } else {
                btn.classList.toggle("active", isInBatch(modelName));
            }
        });
        card.querySelector(".wfm-stack-btn")?.addEventListener("click", async (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            await toggleStack(modelName);
            btn.classList.toggle("active", isInStack(modelName));
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

export function thSortHtml(label, col, extraClass = "", extraStyle = "") {
    const isActive = state.sortColumn === col;
    const arrow = isActive ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
    const activeStyle = isActive ? "color:var(--wfm-accent,#6366f1);" : "";
    const cls = ["wfm-table-th-sortable", extraClass].filter(Boolean).join(" ");
    return `<th class="${cls}" data-sort-col="${col}" style="${activeStyle}${extraStyle}">${label}${arrow}</th>`;
}

export function renderTableView(grid, models) {
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

export function isInBatch(modelName) {
    return (state.modelGroups["Batch"] || []).includes(modelName);
}

export async function toggleBatch(modelName) {
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

export async function clearBatchGroup() {
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

export function isInStack(modelName) {
    return (state.modelGroups["Stack"] || []).includes(modelName);
}

export async function toggleStack(modelName) {
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

export async function clearStackGroup() {
    state.modelGroups["Stack"] = [];
    state.allModelGroups[state.activeModelType] = state.modelGroups;
    await saveModelGroups(state.modelGroups);
    renderModelGrid();
    showToast(t("stackCleared"), "success");
}

// ── Favorite toggle ───────────────────────────────────────

export async function toggleFavorite(modelName) {
    const meta = state.modelMetadata[modelName] || {};
    const newFav = !meta.favorite;
    await saveModelMetadata(modelName, { favorite: newFav });
    renderModelGrid();
    if (state.selectedModel === modelName) renderSideInfo(modelName);
}

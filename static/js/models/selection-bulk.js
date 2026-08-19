/**
 * Models Tab - Multi-select mode and bulk group/badge/favorite/move/delete
 * operations on the current selection.
 *
 * Part of the grid-view.js / selection-bulk.js / detail-panel.js circular
 * import triangle — see the note at the top of grid-view.js.
 */

import { showToast } from "../app.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../util.js";
import { state, RESERVED_GROUPS } from "./state.js";
import { filterModels, renderDirFilter } from "./filters.js";
import { getBadgePalette } from "./badges.js";
import { renderModelGrid } from "./grid-view.js";
import { saveModelGroups, saveModelMetadata } from "../models-tab.js";

export function toggleSelectMode() {
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

export function toggleModelSelection(modelName) {
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

export function clearSelection() {
    state.selectedModels.clear();
    renderModelGrid();
    renderBulkActionBar();
}

export function selectAll() {
    filterModels().forEach(m => state.selectedModels.add(m));
    renderModelGrid();
    renderBulkActionBar();
}

export function renderBulkActionBar() {
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

export async function bulkAddToGroup(groupName) {
    const groups = { ...state.modelGroups };
    if (!groups[groupName]) groups[groupName] = [];
    const toAdd = [...state.selectedModels].filter((m) => !groups[groupName].includes(m));
    groups[groupName] = [...groups[groupName], ...toAdd];
    await saveModelGroups(groups);
    showToast(`${toAdd.length} ${t("modelBulkAddDone")}`, "success");
    renderBulkActionBar();
}

export async function bulkRemoveFromGroup(groupName) {
    const groups = { ...state.modelGroups };
    if (!groups[groupName]) return;
    const before = groups[groupName].length;
    groups[groupName] = groups[groupName].filter((m) => !state.selectedModels.has(m));
    const removed = before - groups[groupName].length;
    // RESERVED_GROUPS (Batch / Stack) は空になってもキーを保持する
    if (groups[groupName].length === 0 && !RESERVED_GROUPS.includes(groupName)) delete groups[groupName];
    await saveModelGroups(groups);
    showToast(`${removed} ${t("modelBulkRemoveDone")}`, "success");
    renderModelGrid();
    renderBulkActionBar();
}

export async function bulkSetFavorite(isFav) {
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

export async function bulkApplyBadge(badgeLabel, add) {
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

export async function bulkDeleteModels() {
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

export async function fetchSubdirs() {
    try {
        const res = await fetch(`/api/wfm/models/subdirs?type=${encodeURIComponent(state.activeModelType)}`);
        state.subdirs = res.ok ? await res.json() : [];
    } catch { state.subdirs = []; }
}

export async function bulkMoveModels(destSubdir) {
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

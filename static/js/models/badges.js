/**
 * Models Tab - Badge palette, badge rendering, badge edit modal, badge filter bar
 */

import { openModal } from "../app.js";
import { t } from "../i18n.js";
import { escapeHtml, readJsonStorage } from "../util.js";
import { state } from "./state.js";

// Grid re-render is owned by models-tab.js (grid rendering hasn't been split
// out yet); registered once from initModelsTab() to avoid a circular import.
let _onGridChange = () => {};
export function setGridChangeCallback(fn) { _onGridChange = fn; }

export function getBadgePalette() {
    return readJsonStorage("wfm_models_badge_palette");
}

export function saveBadgePalette(palette) {
    localStorage.setItem("wfm_models_badge_palette", JSON.stringify(palette));
}

export function badgeHtml(label) {
    const palette = getBadgePalette();
    const color = palette[label] || "";
    const style = color ? ` style="background:${color};color:#fff;"` : "";
    return `<span class="wfm-badge wfm-badge-model"${style}>${escapeHtml(label)}</span>`;
}

export function modelBadgesHtml(modelName, clickable = false) {
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
        _onGridChange();
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

export function renderBadgeFilter() {
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
            _onGridChange();
        });
    });
}

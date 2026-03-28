/**
 * Workflow Tab - Workflow list, import, filter, metadata editing
 * View modes: thumbnail, card, table
 * Side panel: Raw JSON, Group management
 */

import { showToast, openModal, closeModal } from "./app.js";
import { comfyWorkflow } from "./comfyui-workflow.js";
import { loadWorkflowIntoEditor } from "./generate-tab.js";
import { t, getSummaryPrompt } from "./i18n.js";
import { highlightJSON } from "./json-highlight.js";

// ============================================
// State
// ============================================

const state = {
    workflows: [],
    activeModel: "ALL",
    searchText: "",
    viewMode: localStorage.getItem("wfm_default_view") || "thumb", // thumb | card | table
    selectedWf: null,
    groupFilter: "", // empty = all groups
    currentPage: 0,
    badgeColors: (() => {
        try { return JSON.parse(localStorage.getItem("wfm_badge_colors") || "{}"); }
        catch { return {}; }
    })(),
};

const WF_PER_PAGE = 24;

const BADGE_DEFAULT_COLORS = {
    "SD1.5": "#e67e22",
    SDXL: "#2ecc71",
    Flux: "#9b59b6",
    Flux2: "#8e44ad",
    SD3: "#3498db",
    Qwen: "#e74c3c",
    "Z-IMAGE": "#1abc9c",
};

// ============================================
// Open in ComfyUI
// ============================================

function openInComfyUI(workflowData) {
    // Open ComfyUI frontend in a new tab and load the workflow.
    // Same-origin, so we can access the child window's app object.
    const comfyWindow = window.open("/", "_blank");
    if (!comfyWindow) {
        showToast(t("popupBlocked"), "error");
        return;
    }

    // Wait for ComfyUI to fully load, then call app.loadGraphData()
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds max
    const timer = setInterval(() => {
        attempts++;
        try {
            if (comfyWindow.app && typeof comfyWindow.app.loadGraphData === "function") {
                clearInterval(timer);
                comfyWindow.app.loadGraphData(workflowData);
                showToast(t("openedInComfyUI"), "success");
            } else if (attempts >= maxAttempts) {
                clearInterval(timer);
                showToast(t("comfyUILoadTimeout"), "error");
            }
        } catch (err) {
            // Cross-origin or window closed
            if (attempts >= maxAttempts) {
                clearInterval(timer);
            }
        }
    }, 500);
}

// ============================================
// Group Manager (localStorage)
// ============================================

const groups = {
    _data: null,

    load() {
        try {
            this._data = JSON.parse(localStorage.getItem("wfm_groups") || "{}");
        } catch {
            this._data = {};
        }
        return this._data;
    },
    save() {
        localStorage.setItem("wfm_groups", JSON.stringify(this._data));
    },
    get data() {
        return this._data || this.load();
    },

    groupNames() {
        return Object.keys(this.data).sort((a, b) => a.localeCompare(b));
    },

    groupsOf(filename) {
        return Object.keys(this.data).filter((g) => this.data[g].includes(filename));
    },

    createGroup(name) {
        if (!name || this.data[name]) return false;
        this.data[name] = [];
        this.save();
        return true;
    },

    deleteGroup(name) {
        delete this.data[name];
        this.save();
    },

    renameGroup(oldName, newName) {
        if (!newName || this.data[newName] || !this.data[oldName]) return false;
        this.data[newName] = this.data[oldName];
        delete this.data[oldName];
        this.save();
        return true;
    },

    assign(filename, groupName) {
        if (groupName && this.data[groupName]) {
            if (!this.data[groupName].includes(filename)) {
                this.data[groupName].push(filename);
            }
        }
        this.save();
    },

    remove(filename, groupName) {
        if (groupName && this.data[groupName]) {
            this.data[groupName] = this.data[groupName].filter((n) => n !== filename);
        }
        this.save();
    },

    renameWorkflow(oldFilename, newFilename) {
        Object.keys(this.data).forEach((g) => {
            const idx = this.data[g].indexOf(oldFilename);
            if (idx !== -1) this.data[g][idx] = newFilename;
        });
        this.save();
    },
};

// ============================================
// API
// ============================================

async function fetchWorkflows() {
    const res = await fetch("/api/wfm/workflows");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

async function importFiles(files) {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    const res = await fetch("/api/wfm/workflows/import", {
        method: "POST",
        body: fd,
    });
    return await res.json();
}

async function saveMetadata(filename, updates) {
    const res = await fetch("/api/wfm/workflows/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, ...updates }),
    });
    return await res.json();
}

async function deleteWorkflow(filename) {
    const res = await fetch("/api/wfm/workflows/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
    });
    return await res.json();
}

async function renameWorkflow(filename, newStem) {
    const res = await fetch("/api/wfm/workflows/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, newStem }),
    });
    return await res.json();
}

async function reanalyzeAll() {
    const res = await fetch("/api/wfm/workflows/reanalyze-all", {
        method: "POST",
    });
    return await res.json();
}

async function getRawWorkflow(filename) {
    const res = await fetch(
        `/api/wfm/workflows/raw?filename=${encodeURIComponent(filename)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

// ============================================
// Rendering Helpers
// ============================================

function badgeHtml(type) {
    const color = state.badgeColors[type] || BADGE_DEFAULT_COLORS[type] || "#0077ff";
    return `<span class="wfm-badge wfm-badge-model" style="background:${color}">${type}</span>`;
}

function getAllModelTypes() {
    const set = new Set();
    state.workflows.forEach((wf) =>
        (wf.analysis.modelTypes || []).forEach((t) => set.add(t))
    );
    return [...set].sort();
}

function renderModelFilters() {
    const container = document.getElementById("wfm-model-filters");
    if (!container) return;

    const types = getAllModelTypes();

    container.innerHTML = `
        <button class="wfm-filter-btn ${state.activeModel === "ALL" ? "active" : ""}" data-filter="ALL">ALL</button>
        <button class="wfm-filter-btn ${state.activeModel === "FAVORITE" ? "active" : ""}" data-filter="FAVORITE">&#9733;</button>
        ${types.map((t) => `<button class="wfm-filter-btn ${state.activeModel === t ? "active" : ""}" data-filter="${t}">${t}</button>`).join("")}
    `;

    container.querySelectorAll(".wfm-filter-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            state.activeModel = btn.dataset.filter;
            state.currentPage = 0;
            renderModelFilters();
            renderGrid();
        });
    });
}

function filterWorkflows() {
    return state.workflows.filter((wf) => {
        if (state.activeModel === "FAVORITE") {
            if (!wf.metadata.favorite) return false;
        } else if (state.activeModel !== "ALL") {
            if (!(wf.analysis.modelTypes || []).includes(state.activeModel))
                return false;
        }

        // Group filter
        if (state.groupFilter) {
            const grpFiles = groups.data[state.groupFilter] || [];
            if (!grpFiles.includes(wf.filename)) return false;
        }

        if (state.searchText) {
            const fname = wf.filename.toLowerCase();
            const tags = (wf.metadata.tags || []).join(" ").toLowerCase();
            const memo = (wf.metadata.memo || "").toLowerCase();
            const summary = (wf.metadata.summary || "").toLowerCase();
            const q = state.searchText.toLowerCase();
            if (
                !fname.includes(q) &&
                !tags.includes(q) &&
                !memo.includes(q) &&
                !summary.includes(q)
            )
                return false;
        }

        return true;
    });
}

// ============================================
// Grid Rendering (3 view modes)
// ============================================

function renderGrid() {
    const grid = document.getElementById("wfm-workflow-grid");
    if (!grid) return;

    grid.className = `wfm-grid wfm-view-${state.viewMode}`;

    const filtered = filterWorkflows();

    if (filtered.length === 0) {
        grid.innerHTML =
            '<p class="wfm-placeholder">No workflows found</p>';
        updateWfPagination(0);
        return;
    }

    if (state.viewMode === "table") {
        renderTableView(grid, filtered);
        updateWfPagination(0);
        return;
    }

    // Thumbnail / Card view with pagination
    const totalPages = Math.ceil(filtered.length / WF_PER_PAGE);
    if (state.currentPage >= totalPages) state.currentPage = totalPages - 1;
    if (state.currentPage < 0) state.currentPage = 0;
    const start = state.currentPage * WF_PER_PAGE;
    const pageItems = filtered.slice(start, start + WF_PER_PAGE);

    updateWfPagination(totalPages);

    grid.innerHTML = "";
    pageItems.forEach((wf) => {
        const card = document.createElement("div");
        card.className = "wfm-card";
        card.dataset.filename = wf.filename;
        const hasThumb = !!wf.thumbnail;
        const badges = (wf.analysis.modelTypes || []).map((t) => badgeHtml(t)).join("");
        const tags = (wf.metadata.tags || []).map((t) => `<span class="wfm-tag">#${t}</span>`).join("");
        const favStar = wf.metadata.favorite ? "\u2605" : "\u2606";
        const favClass = wf.metadata.favorite ? "wfm-fav-btn active" : "wfm-fav-btn";

        if (state.viewMode === "thumb") {
            card.innerHTML = `
                <div class="wfm-card-thumb">${hasThumb ? `<img src="${wf.thumbnail}" loading="lazy" />` : `<span class="wfm-card-thumb-placeholder">${t("noImage")}</span>`}</div>
                <div class="wfm-card-body">
                    <div class="wfm-card-title" title="${wf.filename}">${wf.filename.replace(/\.json$/, "")}</div>
                    <div class="wfm-card-meta">${badges}</div>
                </div>
                <button class="${favClass}" title="${t("favorite")}">${favStar}</button>`;
        } else {
            // Card view: no thumbnail, more meta info
            const io = `P:${wf.analysis.inputs?.prompts || 0} I:${wf.analysis.inputs?.images || 0} → ${wf.analysis.outputs?.images || 0}`;
            card.innerHTML = `
                <div class="wfm-card-body">
                    <div class="wfm-card-title" title="${wf.filename}">${wf.filename.replace(/\.json$/, "")}</div>
                    <div class="wfm-card-meta">${badges}</div>
                    <div class="wfm-card-io">${io}</div>
                    <div class="wfm-card-tags">${tags}</div>
                </div>
                <button class="${favClass}" title="${t("favorite")}">${favStar}</button>`;
        }

        card.querySelector(".wfm-fav-btn")?.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(wf, e.currentTarget);
        });
        card.addEventListener("click", () => showSidePanel(wf, card));
        card.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            openDetailModal(wf);
        });
        grid.appendChild(card);
    });

    // Restore selection highlight
    if (state.selectedWf) {
        const sel = grid.querySelector(`[data-filename="${state.selectedWf.filename}"]`);
        if (sel) sel.classList.add("wfm-card-selected");
    }
}

function updateWfPagination(totalPages) {
    const container = document.getElementById("wfm-workflow-pagination");
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ""; return; }
    container.innerHTML = `
        <button class="wfm-btn wfm-btn-sm" ${state.currentPage === 0 ? "disabled" : ""} data-page="prev">&laquo;</button>
        <span>${state.currentPage + 1} / ${totalPages}</span>
        <button class="wfm-btn wfm-btn-sm" ${state.currentPage >= totalPages - 1 ? "disabled" : ""} data-page="next">&raquo;</button>
    `;
    container.querySelector('[data-page="prev"]').addEventListener("click", () => {
        if (state.currentPage > 0) { state.currentPage--; renderGrid(); }
    });
    container.querySelector('[data-page="next"]').addEventListener("click", () => {
        if (state.currentPage < totalPages - 1) { state.currentPage++; renderGrid(); }
    });
}

function renderTableView(grid, filtered) {
    const table = document.createElement("table");
    table.className = "wfm-table";
    table.innerHTML = `<thead><tr>
        <th style="width:20px;"></th>
        <th style="width:48px;">Image</th>
        <th class="wfm-table-th-name">Filename</th>
        <th style="width:80px;">${t("model")}</th>
        <th style="width:90px;">I/O</th>
        <th style="width:60px;">${t("tags")}</th>
        <th class="wfm-table-th-memo">${t("memo")}</th>
        <th class="wfm-table-th-summary">${t("summary")}</th>
    </tr></thead>`;
    const tbody = document.createElement("tbody");

    filtered.forEach((wf) => {
        const tr = document.createElement("tr");
        tr.className = "wfm-table-row";
        tr.dataset.filename = wf.filename;
        const badges = (wf.analysis.modelTypes || []).map((t) => badgeHtml(t)).join("");
        const tags = (wf.metadata.tags || []).map((t) => `<span class="wfm-tag">#${t}</span>`).join("");
        const thumbHtml = wf.thumbnail
            ? `<img src="${wf.thumbnail}" class="wfm-table-thumb" loading="lazy" />`
            : `<div class="wfm-table-no-thumb">-</div>`;
        const io = `P:${wf.analysis.inputs?.prompts || 0} I:${wf.analysis.inputs?.images || 0} → ${wf.analysis.outputs?.images || 0}`;
        const favStar = wf.metadata.favorite ? "\u2605" : "\u2606";
        const favClass = wf.metadata.favorite ? "wfm-fav-btn active" : "wfm-fav-btn";

        tr.innerHTML = `
            <td><button class="${favClass}" title="${t("favorite")}">${favStar}</button></td>
            <td class="wfm-table-td-thumb">${thumbHtml}</td>
            <td class="wfm-table-td-name" title="${wf.filename}">${wf.filename.replace(/\.json$/, "")}</td>
            <td>${badges}</td>
            <td class="wfm-table-td-io">${io}</td>
            <td>${tags}</td>
            <td class="wfm-table-td-memo" title="${(wf.metadata.memo || "").replace(/"/g, "&quot;")}">${wf.metadata.memo || ""}</td>
            <td class="wfm-table-td-summary" title="${(wf.metadata.summary || "").replace(/"/g, "&quot;")}">${wf.metadata.summary || ""}</td>`;

        tr.querySelector(".wfm-fav-btn")?.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(wf, e.currentTarget);
        });
        tr.addEventListener("click", () => showSidePanel(wf, tr));
        tr.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            openDetailModal(wf);
        });
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    grid.innerHTML = "";
    grid.appendChild(table);

    // Restore selection highlight
    if (state.selectedWf) {
        const sel = tbody.querySelector(`[data-filename="${state.selectedWf.filename}"]`);
        if (sel) sel.classList.add("wfm-card-selected");
    }
}

async function toggleFavorite(wf, btnEl) {
    const newVal = !wf.metadata.favorite;
    try {
        await saveMetadata(wf.filename, { favorite: newVal });
        wf.metadata.favorite = newVal;
        btnEl.textContent = newVal ? "\u2605" : "\u2606";
        btnEl.classList.toggle("active", newVal);
    } catch (err) {
        showToast("Error: " + err.message, "error");
    }
}

// ============================================
// Side Panel
// ============================================

async function showSidePanel(wf, cardEl) {
    const panel = document.getElementById("wfm-side-panel");
    const titleEl = document.getElementById("wfm-side-panel-title");
    const contentEl = document.getElementById("wfm-json-content");
    if (!panel || !contentEl) return;

    titleEl.textContent = wf.filename.replace(/\.json$/, "");
    contentEl.textContent = t("loading");
    panel.style.display = "flex";

    state.selectedWf = wf;

    // Enable toolbar load buttons
    const listLoadBtn = document.getElementById("wfm-list-load-btn");
    if (listLoadBtn) { listLoadBtn.disabled = false; listLoadBtn.title = ""; }
    const listOpenComfyBtn = document.getElementById("wfm-list-open-comfyui-btn");
    if (listOpenComfyBtn) { listOpenComfyBtn.disabled = false; listOpenComfyBtn.title = ""; }

    // Highlight selected card/row
    document.querySelectorAll(".wfm-card, .wfm-table-row").forEach((c) =>
        c.classList.remove("wfm-card-selected")
    );
    if (cardEl) cardEl.classList.add("wfm-card-selected");

    // Update thumbnail tab
    sidePanelThumbUpdate(wf);

    // Update group tab
    sidePanelGroupUpdate();

    const badgeEl = document.getElementById("wfm-json-format-badge");
    try {
        const data = await getRawWorkflow(wf.filename);
        if (badgeEl) {
            const fmt = comfyWorkflow.detectFormat(data, wf.filename);
            const formatLabels = { ui: t("uiFormat"), api: t("apiFormat"), app: t("appFormat") };
            badgeEl.textContent = formatLabels[fmt] || fmt;
            badgeEl.className = "wfm-format-badge wfm-format-badge--" + fmt;
        }
        const jsonStr = JSON.stringify(data, null, 2);
        contentEl.innerHTML = highlightJSON(jsonStr);
        contentEl.dataset.rawJson = jsonStr;
    } catch (err) {
        contentEl.textContent = "Error: " + err.message;
        if (badgeEl) {
            badgeEl.textContent = "";
            badgeEl.className = "wfm-format-badge";
        }
    }
}

function closeSidePanel() {
    const panel = document.getElementById("wfm-side-panel");
    if (panel) panel.style.display = "none";
    document.querySelectorAll(".wfm-card, .wfm-table-row").forEach((c) =>
        c.classList.remove("wfm-card-selected")
    );
    state.selectedWf = null;
    const listLoadBtn = document.getElementById("wfm-list-load-btn");
    if (listLoadBtn) { listLoadBtn.disabled = true; listLoadBtn.title = t("selectCardFirst"); }
    const listOpenComfyBtn = document.getElementById("wfm-list-open-comfyui-btn");
    if (listOpenComfyBtn) { listOpenComfyBtn.disabled = true; listOpenComfyBtn.title = t("selectCardFirst"); }
    sidePanelGroupUpdate();
}

// ============================================
// Thumbnail Tab in Side Panel
// ============================================

function sidePanelThumbUpdate(wf) {
    const imgWrap = document.getElementById("wfm-side-thumb-img-wrap");
    const nameEl = document.getElementById("wfm-side-thumb-name");
    const metaEl = document.getElementById("wfm-side-thumb-meta");
    if (!imgWrap) return;

    if (wf && wf.thumbnail) {
        imgWrap.innerHTML = `<img src="${wf.thumbnail}" alt="${wf.filename}" />`;
    } else {
        imgWrap.innerHTML = `<span class="wfm-side-thumb-placeholder">${t("noImage")}</span>`;
    }

    if (nameEl) {
        nameEl.textContent = wf ? wf.filename.replace(/\.json$/, "") : "";
    }
    if (metaEl && wf) {
        const badges = (wf.analysis.modelTypes || []).map((mt) => badgeHtml(mt)).join(" ");
        const io = `P:${wf.analysis.inputs?.prompts || 0} I:${wf.analysis.inputs?.images || 0} → ${wf.analysis.outputs?.images || 0}`;
        metaEl.innerHTML = `${badges} <span style="margin-left:4px;">${io}</span>`;
    } else if (metaEl) {
        metaEl.innerHTML = "";
    }
}

// ============================================
// Group Tab in Side Panel
// ============================================

function sidePanelGroupUpdate() {
    const nameEl = document.getElementById("wfm-grp-prop-name");
    const groupEl = document.getElementById("wfm-grp-prop-group");
    const assignBtn = document.getElementById("wfm-assign-group-btn");
    const removeBtn = document.getElementById("wfm-remove-group-btn");

    if (!state.selectedWf) {
        if (nameEl) nameEl.textContent = t("noSelection");
        if (groupEl) groupEl.textContent = "";
        if (assignBtn) assignBtn.disabled = true;
        if (removeBtn) removeBtn.disabled = true;
        return;
    }

    const filename = state.selectedWf.filename;
    if (nameEl) nameEl.textContent = filename.replace(/\.json$/, "");
    const grps = groups.groupsOf(filename);
    if (groupEl) groupEl.textContent = grps.length > 0 ? `${t("groupsLabel")}: ${grps.join(", ")}` : `${t("groupsLabel")}: ${t("groupsNone")}`;
    if (assignBtn) assignBtn.disabled = false;

    const selGroup = document.getElementById("wfm-group-select")?.value;
    if (removeBtn) removeBtn.disabled = !selGroup || !grps.includes(selGroup);
}

function refreshGroupSelects() {
    const sideSel = document.getElementById("wfm-group-select");
    const filterSel = document.getElementById("wfm-group-filter");
    const grpNames = groups.groupNames();

    [filterSel, sideSel].forEach((sel, i) => {
        if (!sel) return;
        const prevVal = sel.value;
        sel.innerHTML = i === 0
            ? `<option value="">${t("allGroups")}</option>`
            : `<option value="">${t("selectGroup")}</option>`;
        grpNames.forEach((g) => {
            const opt = document.createElement("option");
            opt.value = g;
            opt.textContent = g;
            sel.appendChild(opt);
        });
        if (grpNames.includes(prevVal)) sel.value = prevVal;
    });
}

// ============================================
// Badge Color Settings
// ============================================

function renderBadgeSettings() {
    const panel = document.getElementById("wfm-badge-settings-panel");
    if (!panel) return;

    // === Default View section ===
    const currentView = localStorage.getItem("wfm_default_view") || "thumb";
    const viewOptions = [
        { value: "thumb", label: t("viewThumbnail") },
        { value: "card", label: t("viewCard") },
        { value: "table", label: t("viewTable") },
    ];
    const viewRadios = viewOptions.map((opt) =>
        `<label class="wfm-settings-radio">
            <input type="radio" name="wfm-default-view" value="${opt.value}" ${opt.value === currentView ? "checked" : ""}>
            ${opt.label}
        </label>`
    ).join("");

    // === Badge Colors section ===
    const types = getAllModelTypes();
    const allKnown = new Set([...Object.keys(BADGE_DEFAULT_COLORS), ...types]);
    const rows = [...allKnown].sort().map((type) => {
        const color = state.badgeColors[type] || BADGE_DEFAULT_COLORS[type] || "#0077ff";
        return `<div class="wfm-badge-color-row" data-type="${type}">
            <span class="wfm-badge wfm-badge-model" style="background:${color}">${type}</span>
            <input type="color" class="wfm-badge-color-input" value="${color}" data-type="${type}" title="Change color for ${type}" />
        </div>`;
    }).join("");

    panel.innerHTML = `
        <div class="wfm-badge-settings-title">${t("defaultView")}</div>
        <div class="wfm-settings-radio-group">${viewRadios}</div>
        <hr style="border:none;border-top:1px solid var(--wfm-border);margin:8px 0;">
        <div class="wfm-badge-settings-title">${t("badgeColors")}</div>
        ${rows}
        <button id="wfm-badge-color-reset" class="wfm-btn wfm-btn-sm" style="margin-top:6px;width:100%;">${t("resetColors")}</button>`;

    // Default view change
    panel.querySelectorAll('input[name="wfm-default-view"]').forEach((radio) => {
        radio.addEventListener("change", () => {
            localStorage.setItem("wfm_default_view", radio.value);
            state.viewMode = radio.value;
            // Update active state on view mode buttons
            document.querySelectorAll(".wfm-view-btn").forEach((b) => {
                b.classList.toggle("active", b.dataset.view === radio.value);
            });
            renderGrid();
        });
    });

    // Badge color change
    panel.querySelectorAll(".wfm-badge-color-input").forEach((input) => {
        input.addEventListener("input", (e) => {
            const type = e.target.dataset.type;
            const color = e.target.value;
            state.badgeColors[type] = color;
            localStorage.setItem("wfm_badge_colors", JSON.stringify(state.badgeColors));
            const badge = e.target.closest(".wfm-badge-color-row")?.querySelector(".wfm-badge");
            if (badge) badge.style.background = color;
            renderGrid();
        });
    });

    panel.querySelector("#wfm-badge-color-reset")?.addEventListener("click", () => {
        state.badgeColors = {};
        localStorage.removeItem("wfm_badge_colors");
        renderBadgeSettings();
        renderGrid();
    });
}

// ============================================
// Detail Modal
// ============================================

// Helper: save modal meta on blur (auto-save)
async function saveModalMeta(wf) {
    const tagsStr = document.getElementById("wfm-detail-tags")?.value || "";
    const tags = tagsStr.split(",").map((s) => s.trim()).filter(Boolean);
    const memo = document.getElementById("wfm-detail-memo")?.value || "";
    const summary = document.getElementById("wfm-detail-summary")?.value || "";
    const patch = { tags, memo, summary };
    try {
        await saveMetadata(wf.filename, patch);
        const cached = state.workflows.find((w) => w.filename === wf.filename);
        if (cached) Object.assign(cached.metadata, patch);
    } catch (err) {
        console.warn("Metadata save error:", err);
    }
}

function openDetailModal(wf) {
    const meta = wf.metadata;
    const types = (wf.analysis.modelTypes || []).map((t) => badgeHtml(t)).join(" ");
    const io = `P:${wf.analysis.inputs?.prompts || 0} I:${wf.analysis.inputs?.images || 0} → ${wf.analysis.outputs?.images || 0}`;
    const overrideText = (meta.modelTypesOverride || []).join(", ");
    const isFav = !!meta.favorite;

    const thumbSrc = wf.thumbnail || "";
    const html = `
        <div class="wfm-modal-thumb-section">
            ${thumbSrc
                ? `<img src="${thumbSrc}" class="wfm-modal-thumb-img" />`
                : `<div class="wfm-modal-thumb-placeholder">${t("noImage")}</div>`
            }
        </div>
        <div class="wfm-modal-two-col">
            <div class="wfm-modal-left">
                <section>
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <h4>${t("analysis")}</h4>
                        <button class="wfm-btn wfm-btn-sm" id="wfm-detail-analyze">${t("analyze")}</button>
                    </div>
                    <div id="wfm-detail-analysis" class="wfm-detail-analysis">
                        <div>${types || `<span style="color:var(--wfm-text-secondary)">${t("noModelDetected")}</span>`}</div>
                        <div style="font-size:11px;color:var(--wfm-text-secondary);margin-top:4px;">${io}</div>
                    </div>
                    <div id="wfm-detail-override-row" style="margin-top:8px;">
                        <div style="display:flex;gap:4px;align-items:center;">
                            <span style="font-size:12px;color:var(--wfm-text-secondary);white-space:nowrap;">${t("modelCategory")}</span>
                            <input type="text" class="wfm-input" id="wfm-detail-model-override"
                                value="${overrideText}"
                                placeholder="${t("modelOverridePlaceholder")}" style="flex:1;font-size:12px;padding:4px 6px;min-width:0;">
                            <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-detail-override-save">${t("save")}</button>
                        </div>
                    </div>
                </section>
                <section>
                    <h4>${t("tags")} <span style="font-weight:normal;font-size:11px;">${t("tagsHint")}</span></h4>
                    <input type="text" class="wfm-input" id="wfm-detail-tags" value="${(meta.tags || []).join(", ")}" placeholder="${t("tagsPlaceholder")}">
                </section>
                <section>
                    <h4>${t("memo")}</h4>
                    <textarea class="wfm-textarea" id="wfm-detail-memo" rows="4" placeholder="${t("memoPlaceholder")}">${meta.memo || ""}</textarea>
                </section>
                <div class="wfm-modal-actions">
                    <button class="wfm-btn wfm-btn-primary" id="wfm-detail-load">${t("loadInGenerate")}</button>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-detail-open-comfyui">${t("openInComfyUI")}</button>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-detail-set-default">${t("setAsDefault")}</button>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-detail-change-thumb">${t("changeThumbnail")}</button>
                    <input type="file" id="wfm-detail-thumb-file" accept="image/png,image/webp,image/jpeg" style="display:none">
                </div>
            </div>
            <div class="wfm-modal-right">
                <section style="display:flex;flex-direction:column;flex:1;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <h4>${t("summary")}</h4>
                        <button class="wfm-btn wfm-btn-sm" id="wfm-detail-summarize" title="${t("summarize")} (Ollama)">${t("summarize")}</button>
                        <button class="wfm-btn wfm-btn-danger wfm-btn-sm" id="wfm-detail-delete" style="margin-left:auto;">${t("delete")}</button>
                    </div>
                    <textarea class="wfm-textarea" id="wfm-detail-summary" style="flex:1;min-height:0;" placeholder="${t("summaryPlaceholder")}">${meta.summary || ""}</textarea>
                </section>
            </div>
        </div>
    `;

    openModal(wf.filename.replace(".json", ""), html);

    // Favorite button in modal header (add dynamically, remove any existing first)
    const titleEl = document.getElementById("wfm-modal-title");
    if (titleEl) {
        titleEl.parentNode.querySelectorAll(".wfm-fav-btn").forEach((el) => el.remove());
        const favBtn = document.createElement("button");
        favBtn.className = isFav ? "wfm-fav-btn active" : "wfm-fav-btn";
        favBtn.style.cssText = "position:static;font-size:18px;margin-right:8px;";
        favBtn.textContent = isFav ? "\u2605" : "\u2606";
        favBtn.addEventListener("click", async () => {
            const newVal = !wf.metadata.favorite;
            try {
                await saveMetadata(wf.filename, { favorite: newVal });
                wf.metadata.favorite = newVal;
                favBtn.textContent = newVal ? "\u2605" : "\u2606";
                favBtn.classList.toggle("active", newVal);
                renderGrid();
            } catch (err) {
                showToast("Error: " + err.message, "error");
            }
        });
        titleEl.parentNode.insertBefore(favBtn, titleEl);

        // Title click to inline rename
        titleEl.style.cursor = "pointer";
        titleEl.title = t("clickToRename");
        const titleInput = document.getElementById("wfm-modal-title-input");
        titleEl.addEventListener("click", () => {
            titleInput.value = titleEl.textContent;
            titleEl.style.display = "none";
            titleInput.style.display = "";
            titleInput.focus();
            titleInput.select();
        });
        const commitRename = async () => {
            const newStem = titleInput.value.trim();
            titleInput.style.display = "none";
            titleEl.style.display = "";
            if (!newStem || !wf) return;
            const oldFilename = wf.filename;
            const oldStem = oldFilename.replace(/\.json$/, "");
            if (newStem === oldStem) return;
            try {
                const result = await renameWorkflow(oldFilename, newStem);
                if (result.error) throw new Error(result.error);
                // Update local cache
                const cached = state.workflows.find((w) => w.filename === oldFilename);
                if (cached) {
                    cached.filename = result.newFilename;
                    if (cached.thumbnail) cached.thumbnail = cached.thumbnail.replace(oldStem, newStem);
                }
                wf.filename = result.newFilename;
                if (wf.thumbnail) wf.thumbnail = wf.thumbnail.replace(oldStem, newStem);
                groups.renameWorkflow(oldFilename, result.newFilename);
                titleEl.textContent = newStem;
                renderGrid();
                showToast(t("renamed"), "success");
            } catch (err) {
                showToast(t("renameError") + ": " + err.message, "error");
            }
        };
        titleInput.addEventListener("blur", commitRename);
        titleInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); titleInput.blur(); }
            if (e.key === "Escape") {
                titleInput.style.display = "none";
                titleEl.style.display = "";
            }
        });
    }

    // Auto-save tags/memo/summary on blur
    ["wfm-detail-tags", "wfm-detail-memo", "wfm-detail-summary"].forEach((id) => {
        document.getElementById(id)?.addEventListener("blur", () => saveModalMeta(wf));
    });

    // Analyze button
    document.getElementById("wfm-detail-analyze")?.addEventListener("click", async () => {
        const btn = document.getElementById("wfm-detail-analyze");
        btn.disabled = true;
        btn.textContent = t("analyzing");
        try {
            const res = await fetch("/api/wfm/workflows/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: wf.filename }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            wf.analysis = data.analysis;
            const cached = state.workflows.find((w) => w.filename === wf.filename);
            if (cached) cached.analysis = data.analysis;
            // Re-render analysis section
            const analysisEl = document.getElementById("wfm-detail-analysis");
            if (analysisEl) {
                const newTypes = (data.analysis.modelTypes || []).map((mt) => badgeHtml(mt)).join(" ");
                const newIo = `P:${data.analysis.inputs?.prompts || 0} I:${data.analysis.inputs?.images || 0} → ${data.analysis.outputs?.images || 0}`;
                analysisEl.innerHTML = `<div>${newTypes || `<span style="color:var(--wfm-text-secondary)">${t("noModelDetected")}</span>`}</div>
                    <div style="font-size:11px;color:var(--wfm-text-secondary);margin-top:4px;">${newIo}</div>`;
            }
            renderGrid();
            showToast(t("analysisComplete"), "success");
        } catch (err) {
            showToast(t("analyzeError") + ": " + err.message, "error");
        } finally {
            btn.disabled = false;
            btn.textContent = t("analyze");
        }
    });

    // Model type override save
    document.getElementById("wfm-detail-override-save")?.addEventListener("click", async () => {
        const overrideStr = document.getElementById("wfm-detail-model-override")?.value || "";
        const modelTypesOverride = overrideStr.split(",").map((t) => t.trim()).filter(Boolean);
        try {
            await saveMetadata(wf.filename, { modelTypesOverride });
            wf.metadata.modelTypesOverride = modelTypesOverride;
            const cached = state.workflows.find((w) => w.filename === wf.filename);
            if (cached) cached.metadata.modelTypesOverride = modelTypesOverride;
            renderGrid();
            showToast(t("overrideSaved"), "success");
        } catch (err) {
            showToast(t("saveError") + ": " + err.message, "error");
        }
    });

    // Load in GenerateUI
    document.getElementById("wfm-detail-load").addEventListener("click", async () => {
        try {
            const wfData = await getRawWorkflow(wf.filename);
            const loaded = await loadWorkflowIntoEditor(wfData, wf.filename);
            if (loaded === false) return;
            document.querySelector('.wfm-tab[data-tab="generate"]')?.click();
            closeModal();
        } catch (err) {
            showToast(t("loadError") + ": " + err.message, "error");
        }
    });

    // Open in ComfyUI
    document.getElementById("wfm-detail-open-comfyui")?.addEventListener("click", async () => {
        try {
            const wfData = await getRawWorkflow(wf.filename);
            openInComfyUI(wfData);
        } catch (err) {
            showToast(t("loadError") + ": " + err.message, "error");
        }
    });

    // Set as default workflow
    document.getElementById("wfm-detail-set-default")?.addEventListener("click", async () => {
        try {
            const wfData = await getRawWorkflow(wf.filename);
            // Convert to API format if needed for auto-load
            const format = comfyWorkflow.detectFormat(wfData);
            let apiData = wfData;
            if (format === "ui") {
                apiData = await comfyWorkflow.convertUiToApi(wfData);
            }
            // Save to localStorage
            const settings = JSON.parse(localStorage.getItem("wfm_settings") || "{}");
            settings.defaultWorkflow = wf.filename;
            settings.defaultWorkflowData = apiData;
            localStorage.setItem("wfm_settings", JSON.stringify(settings));
            showToast(t("defaultWorkflowSet", wf.filename), "success");
        } catch (err) {
            showToast(t("error") + ": " + err.message, "error");
        }
    });

    // Change Thumbnail
    const changeThumbBtn = document.getElementById("wfm-detail-change-thumb");
    const thumbFileInput = document.getElementById("wfm-detail-thumb-file");
    if (changeThumbBtn && thumbFileInput) {
        changeThumbBtn.addEventListener("click", () => {
            thumbFileInput.value = "";
            thumbFileInput.click();
        });
        thumbFileInput.addEventListener("change", async () => {
            const file = thumbFileInput.files?.[0];
            if (!file) return;
            changeThumbBtn.disabled = true;
            changeThumbBtn.textContent = t("uploading");
            try {
                const fd = new FormData();
                fd.append("filename", wf.filename);
                fd.append("file", file);
                const res = await fetch("/api/wfm/workflows/change-thumbnail", { method: "POST", body: fd });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                const newUrl = data.thumbnail + "?t=" + Date.now();
                wf.thumbnail = newUrl;
                const cached = state.workflows.find((w) => w.filename === wf.filename);
                if (cached) cached.thumbnail = newUrl;
                renderGrid();
                sidePanelThumbUpdate(wf);
                // Update modal thumbnail if visible
                const modalThumbImg = document.querySelector(".wfm-modal-thumb-img");
                if (modalThumbImg) modalThumbImg.src = newUrl;
                const modalThumbPlaceholder = document.querySelector(".wfm-modal-thumb-placeholder");
                if (modalThumbPlaceholder) {
                    modalThumbPlaceholder.outerHTML = `<img src="${newUrl}" class="wfm-modal-thumb-img" />`;
                }
                showToast(t("thumbnailChanged"), "success");
            } catch (err) {
                showToast(t("thumbnailError") + ": " + err.message, "error");
            } finally {
                changeThumbBtn.disabled = false;
                changeThumbBtn.textContent = t("changeThumbnail");
                thumbFileInput.value = "";
            }
        });
    }

    // Delete button
    document.getElementById("wfm-detail-delete").addEventListener("click", async () => {
        if (!confirm(t("deleteConfirm", wf.filename))) return;

        try {
            await deleteWorkflow(wf.filename);
            showToast(t("deleted"), "success");
            closeModal();
            if (state.selectedWf?.filename === wf.filename) {
                closeSidePanel();
            }
            await loadWorkflows();
        } catch (err) {
            showToast(t("deleteError") + ": " + err.message, "error");
        }
    });

    // Summarize button (Ollama)
    document.getElementById("wfm-detail-summarize")?.addEventListener("click", async () => {
        const btn = document.getElementById("wfm-detail-summarize");
        btn.disabled = true;
        btn.textContent = t("summarizing");
        try {
            const wfJson = await getRawWorkflow(wf.filename);
            const promptText = getSummaryPrompt() + JSON.stringify(wfJson).substring(0, 4000);
            const chatRes = await fetch("/api/wfm/ollama/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: [{ role: "user", content: promptText }] }),
            });
            const chatData = await chatRes.json();
            if (chatData.error) throw new Error(chatData.error);
            const summary = chatData.message?.content || chatData.content || chatData.response || "";
            document.getElementById("wfm-detail-summary").value = summary;
            await saveModalMeta(wf);
            showToast(t("summaryGenerated"), "success");
        } catch (err) {
            showToast(t("summarizeError") + ": " + err.message, "error");
        } finally {
            btn.disabled = false;
            btn.textContent = t("summarize");
        }
    });
}

// ============================================
// Load & Initialize
// ============================================

async function loadWorkflows() {
    try {
        state.workflows = await fetchWorkflows();

        // Clean up stale group entries (deleted workflows)
        const validFiles = new Set(state.workflows.map(w => w.filename));
        let groupsDirty = false;
        for (const g of Object.keys(groups.data)) {
            const before = groups.data[g].length;
            groups.data[g] = groups.data[g].filter(fn => validFiles.has(fn));
            if (groups.data[g].length !== before) groupsDirty = true;
        }
        if (groupsDirty) groups.save();

        renderModelFilters();
        renderGrid();
    } catch (err) {
        console.error("Failed to load workflows:", err);
        const grid = document.getElementById("wfm-workflow-grid");
        if (grid) {
            grid.innerHTML =
                '<p class="wfm-placeholder">Failed to load workflows. Check console for details.</p>';
        }
    }
}

export function initWorkflowTab() {
    // Import input (inside label, no separate button needed)
    const importInput = document.getElementById("wfm-import-input");
    if (importInput) {
        importInput.addEventListener("change", async (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;

            try {
                const data = await importFiles(files);
                const ok =
                    data.results?.filter((r) => r.status === "success").length ?? 0;
                const ng = data.results?.filter((r) => r.status === "error") ?? [];
                let msg = `${ok} file(s) imported`;
                if (ng.length)
                    msg +=
                        "\nFailed:\n" +
                        ng.map((r) => `${r.name}: ${r.message}`).join("\n");
                showToast(msg, ng.length ? "error" : "success");
                await loadWorkflows();
            } catch (err) {
                showToast("Import error: " + err.message, "error");
            }
            e.target.value = "";
        });
    }

    // View mode buttons - set initial active state from saved preference
    document.querySelectorAll(".wfm-view-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.view === state.viewMode);
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-view-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            state.viewMode = btn.dataset.view;
            localStorage.setItem("wfm_default_view", state.viewMode);
            renderGrid();
        });
    });

    // Search input
    const searchInput = document.getElementById("wfm-search");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            state.searchText = searchInput.value;
            state.currentPage = 0;
            renderGrid();
        });
    }

    // Drag & drop on workflow grid
    const grid = document.getElementById("wfm-workflow-grid");
    if (grid) {
        grid.addEventListener("dragover", (e) => e.preventDefault());
        grid.addEventListener("drop", async (e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer?.files || []).filter(
                (f) => f.name.endsWith(".json") || f.name.endsWith(".png")
            );
            if (!files.length) return;

            try {
                const data = await importFiles(files);
                const ok =
                    data.results?.filter((r) => r.status === "success").length ?? 0;
                showToast(`${ok} file(s) imported via drag & drop`, "success");
                await loadWorkflows();
            } catch (err) {
                showToast("Import error: " + err.message, "error");
            }
        });
    }

    // Side panel: close button
    document.getElementById("wfm-side-panel-close")?.addEventListener("click", closeSidePanel);

    // Side panel: tab switching
    document.querySelectorAll(".wfm-side-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-side-tab-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            const tabId = btn.dataset.sideTab;
            document.querySelectorAll(".wfm-side-tab-content").forEach((c) => {
                c.classList.remove("active");
                c.style.display = "none";
            });
            const target = document.getElementById("wfm-side-tab-" + tabId);
            if (target) {
                target.classList.add("active");
                target.style.display = "flex";
            }
        });
    });

    // Side panel: JSON copy button
    document.getElementById("wfm-json-copy-btn")?.addEventListener("click", () => {
        const el = document.getElementById("wfm-json-content");
        const content = el?.dataset.rawJson || el?.textContent || "";
        const copyBtn = document.getElementById("wfm-json-copy-btn");
        navigator.clipboard.writeText(content).then(() => {
            if (copyBtn) {
                copyBtn.textContent = t("copied");
                setTimeout(() => { copyBtn.textContent = t("copy"); }, 1500);
            }
        }).catch(() => {});
    });

    // Group management
    groups.load();
    refreshGroupSelects();

    // Add group
    document.getElementById("wfm-group-add-btn")?.addEventListener("click", () => {
        const input = document.getElementById("wfm-group-name-input");
        const name = input?.value.trim();
        if (!name) return;
        if (!groups.createGroup(name)) {
            showToast(`"${name}" already exists`, "error");
            return;
        }
        input.value = "";
        refreshGroupSelects();
        showToast(`Group "${name}" created`, "success");
    });

    // Rename group
    document.getElementById("wfm-group-rename-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-group-select");
        const oldName = sel?.value;
        if (!oldName) return;
        const newName = prompt("New group name:", oldName);
        if (!newName || newName === oldName) return;
        if (!groups.renameGroup(oldName, newName)) {
            showToast("Rename failed", "error");
            return;
        }
        refreshGroupSelects();
        sidePanelGroupUpdate();
        showToast(`Group renamed to "${newName}"`, "success");
    });

    // Delete group
    document.getElementById("wfm-group-delete-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-group-select");
        const name = sel?.value;
        if (!name) return;
        if (!confirm(`Delete group "${name}"?`)) return;
        groups.deleteGroup(name);
        refreshGroupSelects();
        sidePanelGroupUpdate();
        showToast(`Group "${name}" deleted`, "success");
    });

    // Assign to group
    document.getElementById("wfm-assign-group-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-group-select");
        const groupName = sel?.value;
        if (!groupName || !state.selectedWf) return;
        groups.assign(state.selectedWf.filename, groupName);
        sidePanelGroupUpdate();
        showToast(`Added to "${groupName}"`, "success");
    });

    // Remove from group
    document.getElementById("wfm-remove-group-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-group-select");
        const groupName = sel?.value;
        if (!groupName || !state.selectedWf) return;
        groups.remove(state.selectedWf.filename, groupName);
        sidePanelGroupUpdate();
        showToast(`Removed from "${groupName}"`, "success");
    });

    // Update remove button state when group select changes
    document.getElementById("wfm-group-select")?.addEventListener("change", () => {
        sidePanelGroupUpdate();
    });

    // Toolbar: group filter dropdown
    document.getElementById("wfm-group-filter")?.addEventListener("change", (e) => {
        state.groupFilter = e.target.value;
        state.currentPage = 0;
        renderGrid();
    });

    // Toolbar: Load in GenerateUI button
    document.getElementById("wfm-list-load-btn")?.addEventListener("click", async () => {
        if (!state.selectedWf) return;
        try {
            const wfData = await getRawWorkflow(state.selectedWf.filename);
            const loaded = await loadWorkflowIntoEditor(wfData, state.selectedWf.filename);
            if (loaded === false) return;
            document.querySelector('.wfm-tab[data-tab="generate"]')?.click();
        } catch (err) {
            showToast(t("loadError") + ": " + err.message, "error");
        }
    });

    // Toolbar: Open in ComfyUI button
    document.getElementById("wfm-list-open-comfyui-btn")?.addEventListener("click", async () => {
        if (!state.selectedWf) return;
        try {
            const wfData = await getRawWorkflow(state.selectedWf.filename);
            openInComfyUI(wfData);
        } catch (err) {
            showToast(t("loadError") + ": " + err.message, "error");
        }
    });

    // Toolbar: Refresh button
    document.getElementById("wfm-refresh-btn")?.addEventListener("click", async () => {
        await loadWorkflows();
        showToast("Refreshed", "success");
    });

    // Toolbar: Badge color settings
    const badgeSettingsBtn = document.getElementById("wfm-badge-settings-btn");
    const badgeSettingsPanel = document.getElementById("wfm-badge-settings-panel");
    if (badgeSettingsBtn && badgeSettingsPanel) {
        badgeSettingsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = badgeSettingsPanel.style.display !== "none";
            if (isOpen) {
                badgeSettingsPanel.style.display = "none";
                return;
            }
            renderBadgeSettings();
            badgeSettingsPanel.style.display = "";
        });
        document.addEventListener("click", (e) => {
            if (!badgeSettingsPanel.contains(e.target) && e.target !== badgeSettingsBtn) {
                badgeSettingsPanel.style.display = "none";
            }
        });
    }

    // Toolbar: Reanalyze All button
    document.getElementById("wfm-reanalyze-btn")?.addEventListener("click", async () => {
        try {
            const result = await reanalyzeAll();
            showToast(`Reanalyzed ${result.count ?? 0} workflows`, "success");
            await loadWorkflows();
        } catch (err) {
            showToast("Reanalyze error: " + err.message, "error");
        }
    });

    // Initial load
    loadWorkflows();
}

/**
 * Nodes Tab - Node browser, organization, and node sets management
 */

import { showToast } from "./app.js";
import { comfyUI } from "./comfyui-client.js";
import { t } from "./i18n.js";

// ── State ─────────────────────────────────────────────────

const NODES_PER_PAGE = 50;

const state = {
    allNodes: [],
    nodeMetadata: {},
    nodeGroups: {},
    nodeSets: [],
    searchText: "",
    categoryFilter: "",
    packageFilter: "",
    tagFilter: "",
    groupFilter: "",
    showFavoritesOnly: false,
    viewMode: localStorage.getItem("wfm_nodes_view") || "card",
    selectedNode: null,
    activeSubView: "browser",
    loaded: false,
    currentPage: 0,
};

// ── Helpers ───────────────────────────────────────────────

function extractPackageName(pythonModule) {
    if (!pythonModule || pythonModule === "nodes") return "ComfyUI (Built-in)";
    const parts = pythonModule.split(".");
    if (parts[0] === "custom_nodes" && parts.length > 1) return parts[1];
    return pythonModule;
}

function packageColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return `hsl(${Math.abs(hash) % 360}, 50%, 40%)`;
}

function packageBadgeHtml(name) {
    return `<span class="wfm-badge" style="background:${packageColor(name)}">${name}</span>`;
}

function categoryBadgeHtml(cat) {
    return `<span class="wfm-badge wfm-badge-category">${cat}</span>`;
}

function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── API ───────────────────────────────────────────────────

async function fetchAllNodes() {
    const data = await comfyUI.fetchAllObjectInfo();
    return Object.entries(data).map(([name, info]) => ({
        name,
        display_name: info.display_name || name,
        description: info.description || "",
        category: info.category || "uncategorized",
        python_module: info.python_module || "",
        package: extractPackageName(info.python_module),
        input: info.input || {},
        input_order: info.input_order || {},
        output: info.output || [],
        output_name: info.output_name || [],
        output_node: info.output_node || false,
        search_aliases: info.search_aliases || [],
        deprecated: info.deprecated || false,
        experimental: info.experimental || false,
    }));
}

async function fetchNodeMetadata() {
    try {
        const res = await fetch("/api/wfm/nodes/metadata");
        return res.ok ? await res.json() : {};
    } catch { return {}; }
}

async function saveNodeMetadata(nodeName, updates) {
    const res = await fetch("/api/wfm/nodes/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeName, ...updates }),
    });
    return await res.json();
}

async function fetchNodeGroups() {
    try {
        const res = await fetch("/api/wfm/nodes/groups");
        return res.ok ? await res.json() : {};
    } catch { return {}; }
}

async function saveNodeGroups(groups) {
    await fetch("/api/wfm/nodes/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(groups),
    });
}

async function fetchNodeSets() {
    try {
        const res = await fetch("/api/wfm/node-sets");
        return res.ok ? await res.json() : [];
    } catch { return []; }
}

async function createNodeSet(data) {
    const res = await fetch("/api/wfm/node-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return await res.json();
}

async function updateNodeSet(id, updates) {
    const res = await fetch("/api/wfm/node-sets/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
    });
    return await res.json();
}

async function deleteNodeSet(id) {
    await fetch("/api/wfm/node-sets/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
    });
}

// ── Filtering ─────────────────────────────────────────────

function getAllCategories() {
    const set = new Set();
    state.allNodes.forEach(n => {
        const top = n.category.split("/")[0];
        if (top) set.add(top);
    });
    return [...set].sort();
}

function getAllPackages() {
    const set = new Set();
    state.allNodes.forEach(n => set.add(n.package));
    return [...set].sort();
}

function getAllTags() {
    const set = new Set();
    Object.values(state.nodeMetadata).forEach(meta => {
        if (meta && meta.tags) meta.tags.forEach(tag => set.add(tag));
    });
    return [...set].sort();
}

function filterNodes() {
    return state.allNodes.filter(node => {
        if (node.deprecated) return false;

        if (state.showFavoritesOnly) {
            const meta = state.nodeMetadata[node.name];
            if (!meta?.favorite) return false;
        }

        if (state.categoryFilter && !node.category.startsWith(state.categoryFilter)) return false;
        if (state.packageFilter && node.package !== state.packageFilter) return false;

        if (state.tagFilter) {
            const meta = state.nodeMetadata[node.name];
            if (!meta?.tags?.includes(state.tagFilter)) return false;
        }

        if (state.groupFilter) {
            const members = state.nodeGroups[state.groupFilter] || [];
            if (!members.includes(node.name)) return false;
        }

        if (state.searchText) {
            const q = state.searchText.toLowerCase();
            const meta = state.nodeMetadata[node.name];
            const searchable = [
                node.name, node.display_name, node.description,
                ...(node.search_aliases || []),
                ...(meta?.tags || []),
            ].join(" ").toLowerCase();
            if (!searchable.includes(q)) return false;
        }

        return true;
    });
}

// ── Render Filters ────────────────────────────────────────

function renderFilters() {
    // Categories
    const catSelect = document.getElementById("wfm-nodes-category-filter");
    if (catSelect) {
        const cats = getAllCategories();
        catSelect.innerHTML = `<option value="">${t("nodesAllCategories")}</option>` +
            cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
        catSelect.value = state.categoryFilter;
    }

    // Packages
    const pkgSelect = document.getElementById("wfm-nodes-package-filter");
    if (pkgSelect) {
        const pkgs = getAllPackages();
        pkgSelect.innerHTML = `<option value="">${t("nodesAllPackages")}</option>` +
            pkgs.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
        pkgSelect.value = state.packageFilter;
    }

    // Tags
    const tagSelect = document.getElementById("wfm-nodes-tag-filter");
    if (tagSelect) {
        const tags = getAllTags();
        tagSelect.innerHTML = `<option value="">${t("nodesAllTags")}</option>` +
            tags.map(tg => `<option value="${escapeHtml(tg)}">#${escapeHtml(tg)}</option>`).join("");
        tagSelect.value = state.tagFilter;
    }

    // Groups
    const grpSelect = document.getElementById("wfm-nodes-group-filter");
    if (grpSelect) {
        const grpNames = Object.keys(state.nodeGroups).sort();
        grpSelect.innerHTML = `<option value="">${t("nodesAllGroups")}</option>` +
            grpNames.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
        grpSelect.value = state.groupFilter;
    }
}

// ── Render Grid ───────────────────────────────────────────

function renderNodeGrid() {
    const grid = document.getElementById("wfm-nodes-grid");
    if (!grid) return;

    grid.className = `wfm-grid wfm-view-${state.viewMode}`;
    const filtered = filterNodes();

    const countEl = document.getElementById("wfm-nodes-count");
    if (countEl) countEl.textContent = `${filtered.length} / ${state.allNodes.length}`;

    if (filtered.length === 0) {
        grid.innerHTML = `<p class="wfm-placeholder">${t("noNodesFound")}</p>`;
        clearPagination();
        return;
    }

    if (state.viewMode === "table") {
        renderNodeTableView(grid, filtered);
        clearPagination();
        return;
    }

    // Card view with pagination
    const totalPages = Math.ceil(filtered.length / NODES_PER_PAGE);
    if (state.currentPage >= totalPages) state.currentPage = totalPages - 1;
    if (state.currentPage < 0) state.currentPage = 0;

    const start = state.currentPage * NODES_PER_PAGE;
    const pageItems = filtered.slice(start, start + NODES_PER_PAGE);

    grid.innerHTML = "";
    pageItems.forEach(node => {
        const meta = state.nodeMetadata[node.name] || {};
        const card = document.createElement("div");
        card.className = "wfm-card wfm-node-card";
        if (state.selectedNode && state.selectedNode.name === node.name) {
            card.classList.add("wfm-card-selected");
        }
        card.dataset.nodeName = node.name;
        card.style.borderLeft = `3px solid ${packageColor(node.package)}`;

        const inputCount = Object.keys(node.input.required || {}).length +
                           Object.keys(node.input.optional || {}).length;
        const outputCount = (node.output || []).length;
        const tags = (meta.tags || []).map(tg => `<span class="wfm-tag">#${escapeHtml(tg)}</span>`).join("");
        const favStar = meta.favorite ? "\u2605" : "\u2606";
        const favClass = meta.favorite ? "wfm-fav-btn active" : "wfm-fav-btn";

        card.innerHTML = `
            <div class="wfm-card-body">
                <div class="wfm-card-title" title="${escapeHtml(node.name)}">${escapeHtml(node.display_name)}</div>
                <div class="wfm-card-meta">
                    ${categoryBadgeHtml(node.category)}
                </div>
                ${tags ? `<div class="wfm-card-tags">${tags}</div>` : ""}
            </div>
            <button class="${favClass}" title="Favorite">${favStar}</button>`;

        card.querySelector(".wfm-fav-btn").addEventListener("click", e => {
            e.stopPropagation();
            toggleFavorite(node.name, e.currentTarget);
        });
        card.addEventListener("click", () => showNodeSidePanel(node));
        grid.appendChild(card);
    });

    renderPagination(filtered.length, totalPages);
}

function renderPagination(totalItems, totalPages) {
    const container = document.getElementById("wfm-nodes-pagination");
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ""; return; }

    const start = state.currentPage * NODES_PER_PAGE + 1;
    const end = Math.min((state.currentPage + 1) * NODES_PER_PAGE, totalItems);
    container.innerHTML = `
        <button class="wfm-btn wfm-btn-sm" ${state.currentPage === 0 ? "disabled" : ""} data-page="prev">&laquo;</button>
        <span>${start}-${end} / ${totalItems}</span>
        <button class="wfm-btn wfm-btn-sm" ${state.currentPage >= totalPages - 1 ? "disabled" : ""} data-page="next">&raquo;</button>
    `;
    container.querySelector('[data-page="prev"]').addEventListener("click", () => {
        if (state.currentPage > 0) { state.currentPage--; renderNodeGrid(); scrollGridToTop(); }
    });
    container.querySelector('[data-page="next"]').addEventListener("click", () => {
        if (state.currentPage < totalPages - 1) { state.currentPage++; renderNodeGrid(); scrollGridToTop(); }
    });
}

function clearPagination() {
    const container = document.getElementById("wfm-nodes-pagination");
    if (container) container.innerHTML = "";
}

function scrollGridToTop() {
    document.getElementById("wfm-nodes-grid")?.scrollTo(0, 0);
}

function renderNodeTableView(grid, filtered) {
    grid.innerHTML = "";
    const table = document.createElement("table");
    table.className = "wfm-table";
    table.innerHTML = `<thead><tr>
        <th style="width:30px">&#9733;</th>
        <th>${t("nodesClassName")}</th>
        <th>${t("nodesPackage")}</th>
        <th>${t("nodesCategory")}</th>
        <th>In</th><th>Out</th>
    </tr></thead>`;
    const tbody = document.createElement("tbody");
    filtered.forEach(node => {
        const meta = state.nodeMetadata[node.name] || {};
        const tr = document.createElement("tr");
        tr.className = "wfm-nodes-table-row";
        tr.dataset.nodeName = node.name;
        if (state.selectedNode && state.selectedNode.name === node.name) {
            tr.classList.add("wfm-card-selected");
        }
        const inputCount = Object.keys(node.input.required || {}).length +
                           Object.keys(node.input.optional || {}).length;
        const outputCount = (node.output || []).length;
        tr.innerHTML = `
            <td><button class="${meta.favorite ? "wfm-fav-btn active" : "wfm-fav-btn"}">${meta.favorite ? "\u2605" : "\u2606"}</button></td>
            <td title="${escapeHtml(node.name)}">${escapeHtml(node.display_name)}</td>
            <td>${packageBadgeHtml(node.package)}</td>
            <td>${escapeHtml(node.category)}</td>
            <td>${inputCount}</td><td>${outputCount}</td>`;
        tr.querySelector(".wfm-fav-btn").addEventListener("click", e => {
            e.stopPropagation();
            toggleFavorite(node.name, e.currentTarget);
        });
        tr.addEventListener("click", () => showNodeSidePanel(node));
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    grid.appendChild(table);
}

// ── Favorite ──────────────────────────────────────────────

async function toggleFavorite(nodeName, btnEl) {
    const meta = state.nodeMetadata[nodeName] || {};
    const newFav = !meta.favorite;
    await saveNodeMetadata(nodeName, { favorite: newFav });
    if (!state.nodeMetadata[nodeName]) state.nodeMetadata[nodeName] = {};
    state.nodeMetadata[nodeName].favorite = newFav;
    btnEl.textContent = newFav ? "\u2605" : "\u2606";
    btnEl.classList.toggle("active", newFav);
}

// ── Side Panel ────────────────────────────────────────────

function showNodeSidePanel(node) {
    state.selectedNode = node;
    const panel = document.getElementById("wfm-nodes-side-panel");
    if (!panel) return;
    panel.style.display = "flex";

    // Highlight selected card
    document.querySelectorAll("#wfm-nodes-grid .wfm-card, #wfm-nodes-grid tr").forEach(el => {
        el.classList.toggle("wfm-card-selected", el.dataset.nodeName === node.name ||
            el.querySelector(`[title="${node.name}"]`) !== null);
    });

    // Title
    document.getElementById("wfm-nodes-panel-title").textContent = node.display_name;

    // Reset to Details tab
    document.querySelectorAll(".wfm-nodes-side-tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelector('.wfm-nodes-side-tab-btn[data-side-tab="details"]')?.classList.add("active");
    document.querySelectorAll(".wfm-nodes-side-content").forEach(c => { c.style.display = "none"; c.classList.remove("active"); });
    const detailsEl = document.getElementById("wfm-nodes-side-details");
    if (detailsEl) { detailsEl.style.display = "block"; detailsEl.classList.add("active"); }

    renderSideDetails(node);
    renderSideIO(node);
    renderSideGroups(node);
}

function renderSideDetails(node) {
    const el = document.getElementById("wfm-nodes-side-details");
    if (!el) return;
    const meta = state.nodeMetadata[node.name] || {};
    const flags = [];
    if (node.output_node) flags.push(`<span class="wfm-badge" style="background:var(--wfm-success)">${t("nodesOutputNode")}</span>`);
    if (node.experimental) flags.push(`<span class="wfm-badge" style="background:var(--wfm-warning)">${t("nodesExperimental")}</span>`);
    if (node.deprecated) flags.push(`<span class="wfm-badge" style="background:var(--wfm-danger)">${t("nodesDeprecated")}</span>`);

    el.innerHTML = `
        <div class="wfm-node-detail-section" style="display:flex;align-items:center;gap:6px;">
            <div style="flex:1;">
                <div class="wfm-node-detail-label">${t("nodesClassName")}</div>
                <div class="wfm-node-detail-value" style="font-family:monospace;font-size:12px;">${escapeHtml(node.name)}</div>
            </div>
            <button id="wfm-node-copy-name-btn" class="wfm-btn wfm-btn-sm" title="${t("nodesCopyClassName")}">&#128203;</button>
        </div>
        <div class="wfm-node-detail-section">
            <div class="wfm-node-detail-label">${t("nodesPackage")}</div>
            <div class="wfm-node-detail-value">${packageBadgeHtml(node.package)}</div>
        </div>
        <div class="wfm-node-detail-section">
            <div class="wfm-node-detail-label">${t("nodesCategory")}</div>
            <div class="wfm-node-detail-value">${escapeHtml(node.category)}</div>
        </div>
        ${node.description ? `<div class="wfm-node-detail-section">
            <div class="wfm-node-detail-label">${t("nodesDescription")}</div>
            <div class="wfm-node-detail-value" style="font-size:12px;">${escapeHtml(node.description)}</div>
        </div>` : ""}
        ${flags.length ? `<div class="wfm-node-detail-section"><div>${flags.join(" ")}</div></div>` : ""}
        <div class="wfm-node-detail-section">
            <div class="wfm-node-detail-label">${t("nodesEditTags")}</div>
            <input type="text" id="wfm-nodes-tag-input" class="wfm-input" style="width:100%;"
                value="${escapeHtml((meta.tags || []).join(", "))}"
                placeholder="${t("nodesEditTags")}">
        </div>`;

    // Copy class name button
    const copyNameBtn = document.getElementById("wfm-node-copy-name-btn");
    if (copyNameBtn) {
        copyNameBtn.addEventListener("click", async () => {
            await navigator.clipboard.writeText(node.name);
            showToast(t("nodesCopiedClassName"), "success");
        });
    }

    const tagInput = document.getElementById("wfm-nodes-tag-input");
    if (tagInput) {
        const saveTags = async () => {
            const tags = tagInput.value.split(",").map(s => s.trim()).filter(Boolean);
            await saveNodeMetadata(node.name, { tags });
            if (!state.nodeMetadata[node.name]) state.nodeMetadata[node.name] = {};
            state.nodeMetadata[node.name].tags = tags;
            renderFilters();
        };
        tagInput.addEventListener("change", saveTags);
    }
}

function renderSideIO(node) {
    const el = document.getElementById("wfm-nodes-side-io");
    if (!el) return;

    const required = node.input.required || {};
    const optional = node.input.optional || {};

    let html = `<h4 style="margin:0 0 8px;">${t("nodesInputs")}</h4>`;
    html += `<table class="wfm-node-io-table"><thead><tr><th>Name</th><th>Type</th><th>Details</th></tr></thead><tbody>`;

    for (const [name, spec] of Object.entries(required)) {
        html += renderInputRow(name, spec, true);
    }
    for (const [name, spec] of Object.entries(optional)) {
        html += renderInputRow(name, spec, false);
    }
    html += `</tbody></table>`;

    html += `<h4 style="margin:16px 0 8px;">${t("nodesOutputs")}</h4>`;
    html += `<table class="wfm-node-io-table"><thead><tr><th>Name</th><th>Type</th></tr></thead><tbody>`;
    (node.output || []).forEach((type, i) => {
        const name = node.output_name?.[i] || type;
        html += `<tr><td>${escapeHtml(name)}</td><td><code>${escapeHtml(type)}</code></td></tr>`;
    });
    html += `</tbody></table>`;

    el.innerHTML = html;
}

function renderInputRow(name, spec, isRequired) {
    let type = "unknown";
    let details = "";

    if (Array.isArray(spec)) {
        const typeOrList = spec[0];
        if (Array.isArray(typeOrList)) {
            type = "COMBO";
            const items = typeOrList.length > 5 ? typeOrList.slice(0, 5).join(", ") + "..." : typeOrList.join(", ");
            details = items;
        } else {
            type = String(typeOrList);
        }
        if (spec[1] && typeof spec[1] === "object") {
            const opts = spec[1];
            const parts = [];
            if (opts.default !== undefined) parts.push(`default: ${opts.default}`);
            if (opts.min !== undefined) parts.push(`min: ${opts.min}`);
            if (opts.max !== undefined) parts.push(`max: ${opts.max}`);
            if (opts.step !== undefined) parts.push(`step: ${opts.step}`);
            if (parts.length) details = parts.join(", ");
        }
    }

    const reqClass = isRequired ? "wfm-node-input-required" : "wfm-node-input-optional";
    const reqLabel = isRequired ? "" : ` <span style="color:var(--wfm-text-secondary);font-size:10px;">(opt)</span>`;
    return `<tr class="${reqClass}"><td>${escapeHtml(name)}${reqLabel}</td><td><code>${escapeHtml(type)}</code></td><td style="font-size:11px;">${escapeHtml(details)}</td></tr>`;
}

function renderSideGroups(node) {
    const el = document.getElementById("wfm-nodes-side-group");
    if (!el) return;

    const groupNames = Object.keys(state.nodeGroups).sort();
    const memberOf = groupNames.filter(g => (state.nodeGroups[g] || []).includes(node.name));

    let html = `<h4 style="margin:0 0 8px;">${t("nodesGroups")}</h4>`;

    // Current groups
    if (memberOf.length) {
        html += memberOf.map(g =>
            `<div class="wfm-node-group-item">
                <span>${escapeHtml(g)}</span>
                <button class="wfm-btn wfm-btn-sm wfm-btn-danger wfm-node-remove-group" data-group="${escapeHtml(g)}">${t("nodesRemoveGroup")}</button>
            </div>`
        ).join("");
    } else {
        html += `<p style="color:var(--wfm-text-secondary);font-size:12px;">No groups assigned</p>`;
    }

    // Assign to group
    const available = groupNames.filter(g => !memberOf.includes(g));
    html += `<div style="margin-top:12px;display:flex;gap:4px;">
        <select id="wfm-nodes-assign-group-select" class="wfm-select" style="flex:1;">
            <option value="">${t("nodesAssignGroup")}</option>
            ${available.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("")}
        </select>
        <button id="wfm-nodes-assign-group-btn" class="wfm-btn wfm-btn-sm wfm-btn-primary">+</button>
    </div>`;

    // Create new group
    html += `<div style="margin-top:8px;display:flex;gap:4px;">
        <input type="text" id="wfm-nodes-new-group-input" class="wfm-input" style="flex:1;" placeholder="${t("nodesGroupName")}">
        <button id="wfm-nodes-create-group-btn" class="wfm-btn wfm-btn-sm">${t("nodesCreateGroup")}</button>
    </div>`;

    el.innerHTML = html;

    // Event listeners
    el.querySelectorAll(".wfm-node-remove-group").forEach(btn => {
        btn.addEventListener("click", async () => {
            const group = btn.dataset.group;
            state.nodeGroups[group] = (state.nodeGroups[group] || []).filter(n => n !== node.name);
            if (state.nodeGroups[group].length === 0) delete state.nodeGroups[group];
            await saveNodeGroups(state.nodeGroups);
            renderSideGroups(node);
            renderFilters();
        });
    });

    document.getElementById("wfm-nodes-assign-group-btn")?.addEventListener("click", async () => {
        const sel = document.getElementById("wfm-nodes-assign-group-select");
        const group = sel?.value;
        if (!group) return;
        if (!state.nodeGroups[group]) state.nodeGroups[group] = [];
        if (!state.nodeGroups[group].includes(node.name)) {
            state.nodeGroups[group].push(node.name);
            await saveNodeGroups(state.nodeGroups);
            renderSideGroups(node);
            renderFilters();
        }
    });

    document.getElementById("wfm-nodes-create-group-btn")?.addEventListener("click", async () => {
        const input = document.getElementById("wfm-nodes-new-group-input");
        const name = input?.value?.trim();
        if (!name) return;
        if (!state.nodeGroups[name]) state.nodeGroups[name] = [];
        if (!state.nodeGroups[name].includes(node.name)) {
            state.nodeGroups[name].push(node.name);
        }
        await saveNodeGroups(state.nodeGroups);
        input.value = "";
        renderSideGroups(node);
        renderFilters();
    });
}

function closeNodeSidePanel() {
    const panel = document.getElementById("wfm-nodes-side-panel");
    if (panel) panel.style.display = "none";
    state.selectedNode = null;
    document.querySelectorAll("#wfm-nodes-grid .wfm-card, #wfm-nodes-grid tr").forEach(el => {
        el.classList.remove("wfm-card-selected");
    });
}

// ── Node Sets ─────────────────────────────────────────────

function renderNodeSets() {
    const grid = document.getElementById("wfm-node-sets-grid");
    if (!grid) return;

    if (state.nodeSets.length === 0) {
        grid.innerHTML = `<p class="wfm-placeholder">No node sets yet.</p>`;
        return;
    }

    grid.innerHTML = "";
    state.nodeSets.forEach(set => {
        const card = document.createElement("div");
        card.className = "wfm-card wfm-node-set-card";
        const tags = (set.tags || []).map(tg => `<span class="wfm-tag">#${escapeHtml(tg)}</span>`).join("");
        const nodeCount = (set.nodes || []).length;

        card.innerHTML = `
            <div class="wfm-card-body">
                <div class="wfm-card-title">${escapeHtml(set.name || "Untitled")}</div>
                ${set.description ? `<div style="font-size:12px;color:var(--wfm-text-secondary);margin:4px 0;">${escapeHtml(set.description)}</div>` : ""}
                <div class="wfm-card-meta">
                    <span class="wfm-badge" style="background:var(--wfm-accent)">${nodeCount} nodes</span>
                    ${tags}
                </div>
            </div>
            <div class="wfm-node-set-actions">
                <button class="wfm-btn wfm-btn-sm wfm-btn-danger wfm-node-set-delete" title="${t("nodesDeleteSet")}">&#128465;</button>
            </div>`;

        card.querySelector(".wfm-node-set-delete").addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!confirm(t("nodesDeleteSetConfirm"))) return;
            await deleteNodeSet(set.id);
            state.nodeSets = state.nodeSets.filter(s => s.id !== set.id);
            renderNodeSets();
        });

        card.addEventListener("click", () => showEditSetModal(set));
        grid.appendChild(card);
    });
}

function showCreateSetModal() {
    const modal = document.getElementById("wfm-modal-overlay");
    if (!modal) return;

    const allNodeNames = state.allNodes.map(n => n.name).sort();

    modal.querySelector(".wfm-modal-header h2").textContent = t("nodesCreateSet");
    const body = modal.querySelector(".wfm-modal-body");
    body.innerHTML = `
        <div class="wfm-form-group">
            <label>${t("nodesSetName")}</label>
            <input type="text" id="wfm-set-name" class="wfm-input" style="width:100%;">
        </div>
        <div class="wfm-form-group">
            <label>${t("nodesSetDescription")}</label>
            <textarea id="wfm-set-desc" class="wfm-textarea" style="width:100%;"></textarea>
        </div>
        <div class="wfm-form-group">
            <label>${t("nodesEditTags")}</label>
            <input type="text" id="wfm-set-tags" class="wfm-input" style="width:100%;" placeholder="tag1, tag2">
        </div>
        <div class="wfm-form-group">
            <label>${t("nodesSetNodes")}</label>
            <div id="wfm-set-nodes-list"></div>
            <button id="wfm-set-add-node" class="wfm-btn wfm-btn-sm" style="margin-top:4px;">+ ${t("nodesAddNode")}</button>
        </div>
        <div class="wfm-form-group">
            <label>${t("nodesSetLinks")}</label>
            <div id="wfm-set-links-list"></div>
            <button id="wfm-set-add-link" class="wfm-btn wfm-btn-sm" style="margin-top:4px;">+ ${t("nodesAddLink")}</button>
        </div>
        <div style="margin-top:12px;text-align:right;">
            <button id="wfm-set-save" class="wfm-btn wfm-btn-primary">${t("save")}</button>
        </div>`;

    const nodesList = document.getElementById("wfm-set-nodes-list");
    let nodeRows = [];

    function addNodeRow() {
        const idx = nodeRows.length;
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:4px;margin-bottom:4px;align-items:center;";
        row.innerHTML = `
            <input type="text" class="wfm-input wfm-set-node-class" style="flex:1;" list="wfm-node-datalist" placeholder="Node class type">
            <input type="text" class="wfm-set-node-title wfm-input" style="width:80px;" placeholder="Title">
            <button class="wfm-btn wfm-btn-sm wfm-btn-danger wfm-set-remove-node">&times;</button>`;
        row.querySelector(".wfm-set-remove-node").addEventListener("click", () => {
            nodeRows = nodeRows.filter((_, i) => i !== idx);
            row.remove();
        });
        nodesList.appendChild(row);
        nodeRows.push(row);
    }

    // Datalist for autocomplete
    if (!document.getElementById("wfm-node-datalist")) {
        const dl = document.createElement("datalist");
        dl.id = "wfm-node-datalist";
        allNodeNames.forEach(n => {
            const opt = document.createElement("option");
            opt.value = n;
            dl.appendChild(opt);
        });
        document.body.appendChild(dl);
    }

    addNodeRow();
    addNodeRow();

    document.getElementById("wfm-set-add-node").addEventListener("click", addNodeRow);

    // Link rows
    const linksList = document.getElementById("wfm-set-links-list");
    let linkRows = [];

    function addLinkRow() {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:4px;margin-bottom:4px;align-items:center;font-size:12px;";
        row.innerHTML = `
            <span>From #</span>
            <input type="number" class="wfm-input wfm-set-link-from" style="width:50px;" min="0" value="0">
            <span>slot</span>
            <input type="number" class="wfm-input wfm-set-link-from-slot" style="width:50px;" min="0" value="0">
            <span>→ To #</span>
            <input type="number" class="wfm-input wfm-set-link-to" style="width:50px;" min="0" value="1">
            <span>slot</span>
            <input type="number" class="wfm-input wfm-set-link-to-slot" style="width:50px;" min="0" value="0">
            <button class="wfm-btn wfm-btn-sm wfm-btn-danger wfm-set-remove-link">&times;</button>`;
        row.querySelector(".wfm-set-remove-link").addEventListener("click", () => {
            linkRows = linkRows.filter(r => r !== row);
            row.remove();
        });
        linksList.appendChild(row);
        linkRows.push(row);
    }

    document.getElementById("wfm-set-add-link").addEventListener("click", addLinkRow);

    document.getElementById("wfm-set-save").addEventListener("click", async () => {
        const name = document.getElementById("wfm-set-name").value.trim();
        if (!name) return;
        const description = document.getElementById("wfm-set-desc").value.trim();
        const tags = document.getElementById("wfm-set-tags").value.split(",").map(s => s.trim()).filter(Boolean);
        const nodes = [];
        nodesList.querySelectorAll(".wfm-set-node-class").forEach((input, i) => {
            const classType = input.value.trim();
            if (!classType) return;
            const titleInput = nodesList.querySelectorAll(".wfm-set-node-title")[i];
            nodes.push({
                class_type: classType,
                title: titleInput?.value?.trim() || "",
                rel_pos: [i * 300, 0],
            });
        });
        if (nodes.length === 0) return;

        // Collect links
        const links = [];
        linkRows.forEach(row => {
            const fromNode = parseInt(row.querySelector(".wfm-set-link-from").value) || 0;
            const fromSlot = parseInt(row.querySelector(".wfm-set-link-from-slot").value) || 0;
            const toNode = parseInt(row.querySelector(".wfm-set-link-to").value) || 0;
            const toSlot = parseInt(row.querySelector(".wfm-set-link-to-slot").value) || 0;
            links.push({ from_node: fromNode, from_slot: fromSlot, to_node: toNode, to_slot: toSlot });
        });

        const result = await createNodeSet({ name, description, tags, nodes, links });
        if (result.nodeSet) {
            state.nodeSets.push(result.nodeSet);
        } else {
            state.nodeSets = await fetchNodeSets();
        }
        renderNodeSets();
        modal.style.display = "none";
    });

    modal.style.display = "flex";
}

function showEditSetModal(set) {
    const modal = document.getElementById("wfm-modal-overlay");
    if (!modal) return;

    const allNodeNames = state.allNodes.map(n => n.name).sort();

    modal.querySelector(".wfm-modal-header h2").textContent = t("nodesEditSet");
    const body = modal.querySelector(".wfm-modal-body");
    body.innerHTML = `
        <div class="wfm-form-group">
            <label>${t("nodesSetName")}</label>
            <input type="text" id="wfm-set-name" class="wfm-input" style="width:100%;">
        </div>
        <div class="wfm-form-group">
            <label>${t("nodesSetDescription")}</label>
            <textarea id="wfm-set-desc" class="wfm-textarea" style="width:100%;"></textarea>
        </div>
        <div class="wfm-form-group">
            <label>${t("nodesEditTags")}</label>
            <input type="text" id="wfm-set-tags" class="wfm-input" style="width:100%;" placeholder="tag1, tag2">
        </div>
        <div class="wfm-form-group">
            <label>${t("nodesSetNodes")} <small style="color:var(--wfm-text-secondary);">(#0, #1, ...)</small></label>
            <div id="wfm-set-nodes-list"></div>
            <button id="wfm-set-add-node" class="wfm-btn wfm-btn-sm" style="margin-top:4px;">+ ${t("nodesAddNode")}</button>
        </div>
        <div class="wfm-form-group">
            <label>${t("nodesSetLinks")}</label>
            <div id="wfm-set-links-list"></div>
            <button id="wfm-set-add-link" class="wfm-btn wfm-btn-sm" style="margin-top:4px;">+ ${t("nodesAddLink")}</button>
        </div>
        <div style="margin-top:12px;text-align:right;">
            <button id="wfm-set-save" class="wfm-btn wfm-btn-primary">${t("save")}</button>
        </div>`;

    // Fill existing values
    document.getElementById("wfm-set-name").value = set.name || "";
    document.getElementById("wfm-set-desc").value = set.description || "";
    document.getElementById("wfm-set-tags").value = (set.tags || []).join(", ");

    const nodesList = document.getElementById("wfm-set-nodes-list");
    let nodeRows = [];

    // Datalist for autocomplete
    if (!document.getElementById("wfm-node-datalist")) {
        const dl = document.createElement("datalist");
        dl.id = "wfm-node-datalist";
        allNodeNames.forEach(n => {
            const opt = document.createElement("option");
            opt.value = n;
            dl.appendChild(opt);
        });
        document.body.appendChild(dl);
    }

    function addNodeRow(classType, title, relPos) {
        const idx = nodeRows.length;
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:4px;margin-bottom:4px;align-items:center;";
        row.innerHTML = `
            <span style="font-size:11px;color:var(--wfm-text-secondary);min-width:20px;">#${idx}</span>
            <input type="text" class="wfm-input wfm-set-node-class" style="flex:1;" list="wfm-node-datalist" placeholder="Node class type" value="${escapeHtml(classType || "")}">
            <input type="text" class="wfm-set-node-title wfm-input" style="width:80px;" placeholder="Title" value="${escapeHtml(title || "")}">
            <button class="wfm-btn wfm-btn-sm wfm-btn-danger wfm-set-remove-node">&times;</button>`;
        row.querySelector(".wfm-set-remove-node").addEventListener("click", () => {
            nodeRows = nodeRows.filter((_, i) => i !== idx);
            row.remove();
        });
        nodesList.appendChild(row);
        nodeRows.push(row);
    }

    // Populate existing nodes
    (set.nodes || []).forEach((n, i) => {
        addNodeRow(n.class_type, n.title, n.rel_pos);
    });
    if ((set.nodes || []).length === 0) {
        addNodeRow("", "", null);
    }

    document.getElementById("wfm-set-add-node").addEventListener("click", () => addNodeRow("", "", null));

    // Link rows
    const linksList = document.getElementById("wfm-set-links-list");
    let linkRows = [];

    function addLinkRow(fromNode, fromSlot, toNode, toSlot) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:4px;margin-bottom:4px;align-items:center;font-size:12px;";
        row.innerHTML = `
            <span>From #</span>
            <input type="number" class="wfm-input wfm-set-link-from" style="width:50px;" min="0" value="${fromNode ?? 0}">
            <span>slot</span>
            <input type="number" class="wfm-input wfm-set-link-from-slot" style="width:50px;" min="0" value="${fromSlot ?? 0}">
            <span>→ To #</span>
            <input type="number" class="wfm-input wfm-set-link-to" style="width:50px;" min="0" value="${toNode ?? 1}">
            <span>slot</span>
            <input type="number" class="wfm-input wfm-set-link-to-slot" style="width:50px;" min="0" value="${toSlot ?? 0}">
            <button class="wfm-btn wfm-btn-sm wfm-btn-danger wfm-set-remove-link">&times;</button>`;
        row.querySelector(".wfm-set-remove-link").addEventListener("click", () => {
            linkRows = linkRows.filter(r => r !== row);
            row.remove();
        });
        linksList.appendChild(row);
        linkRows.push(row);
    }

    // Populate existing links
    (set.links || []).forEach(lk => {
        addLinkRow(lk.from_node, lk.from_slot, lk.to_node, lk.to_slot);
    });

    document.getElementById("wfm-set-add-link").addEventListener("click", () => addLinkRow(0, 0, 1, 0));

    // Save (update)
    document.getElementById("wfm-set-save").addEventListener("click", async () => {
        const name = document.getElementById("wfm-set-name").value.trim();
        if (!name) return;
        const description = document.getElementById("wfm-set-desc").value.trim();
        const tags = document.getElementById("wfm-set-tags").value.split(",").map(s => s.trim()).filter(Boolean);
        const nodes = [];
        nodesList.querySelectorAll(".wfm-set-node-class").forEach((input, i) => {
            const classType = input.value.trim();
            if (!classType) return;
            const titleInput = nodesList.querySelectorAll(".wfm-set-node-title")[i];
            nodes.push({
                class_type: classType,
                title: titleInput?.value?.trim() || "",
                rel_pos: [i * 300, 0],
            });
        });
        if (nodes.length === 0) return;

        const links = [];
        linkRows.forEach(row => {
            const fromNode = parseInt(row.querySelector(".wfm-set-link-from").value) || 0;
            const fromSlot = parseInt(row.querySelector(".wfm-set-link-from-slot").value) || 0;
            const toNode = parseInt(row.querySelector(".wfm-set-link-to").value) || 0;
            const toSlot = parseInt(row.querySelector(".wfm-set-link-to-slot").value) || 0;
            links.push({ from_node: fromNode, from_slot: fromSlot, to_node: toNode, to_slot: toSlot });
        });

        await updateNodeSet(set.id, { name, description, tags, nodes, links });

        // Refresh local state
        state.nodeSets = await fetchNodeSets();
        renderNodeSets();
        modal.style.display = "none";
        showToast(t("nodesSetUpdated"), "success");
    });

    modal.style.display = "flex";
}

// ── Data Loading ──────────────────────────────────────────

async function loadNodesData() {
    const placeholder = document.getElementById("wfm-nodes-placeholder");
    if (placeholder) placeholder.textContent = t("loading");

    try {
        if (!comfyUI.baseUrl) {
            if (placeholder) placeholder.textContent = t("nodesConnectToComfyUI");
            return;
        }

        const [nodes, metadata, sets] = await Promise.all([
            fetchAllNodes(),
            fetchNodeMetadata(),
            fetchNodeSets(),
        ]);

        state.allNodes = nodes;
        state.nodeMetadata = metadata;
        state.nodeGroups = metadata._groups || {};
        state.nodeSets = sets;
        state.loaded = true;

        renderFilters();
        renderNodeGrid();
    } catch (err) {
        console.error("Failed to load nodes:", err);
        if (placeholder) placeholder.textContent = t("nodesConnectToComfyUI");
        showToast(t("error") + ": " + err.message, "error");
    }
}

// ── Init ──────────────────────────────────────────────────

export function initNodesTab() {
    // Sub-view toggle
    document.querySelectorAll(".wfm-nodes-subview-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-nodes-subview-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.activeSubView = btn.dataset.subview;

            const browserEl = document.getElementById("wfm-nodes-browser");
            const setsEl = document.getElementById("wfm-nodes-sets");
            const toolbar = document.getElementById("wfm-nodes-browser-toolbar");

            if (state.activeSubView === "browser") {
                if (browserEl) browserEl.style.display = "";
                if (setsEl) setsEl.style.display = "none";
                if (toolbar) toolbar.style.display = "";
            } else {
                if (browserEl) browserEl.style.display = "none";
                if (setsEl) setsEl.style.display = "";
                if (toolbar) toolbar.style.display = "none";
                renderNodeSets();
            }
        });
    });

    // Search
    const searchInput = document.getElementById("wfm-nodes-search");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            state.searchText = searchInput.value;
            state.currentPage = 0;
            renderNodeGrid();
        });
    }

    // Filters
    document.getElementById("wfm-nodes-category-filter")?.addEventListener("change", e => {
        state.categoryFilter = e.target.value;
        state.currentPage = 0;
        renderNodeGrid();
    });
    document.getElementById("wfm-nodes-package-filter")?.addEventListener("change", e => {
        state.packageFilter = e.target.value;
        state.currentPage = 0;
        renderNodeGrid();
    });
    document.getElementById("wfm-nodes-tag-filter")?.addEventListener("change", e => {
        state.tagFilter = e.target.value;
        state.currentPage = 0;
        renderNodeGrid();
    });
    document.getElementById("wfm-nodes-group-filter")?.addEventListener("change", e => {
        state.groupFilter = e.target.value;
        state.currentPage = 0;
        renderNodeGrid();
    });

    // Favorites toggle
    document.getElementById("wfm-nodes-fav-btn")?.addEventListener("click", e => {
        state.showFavoritesOnly = !state.showFavoritesOnly;
        e.currentTarget.classList.toggle("active", state.showFavoritesOnly);
        state.currentPage = 0;
        renderNodeGrid();
    });

    // View mode
    document.querySelectorAll("[data-nodes-view]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("[data-nodes-view]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.viewMode = btn.dataset.nodesView;
            localStorage.setItem("wfm_nodes_view", state.viewMode);
            renderNodeGrid();
        });
    });

    // Refresh
    document.getElementById("wfm-nodes-refresh-btn")?.addEventListener("click", () => {
        state.loaded = false;
        loadNodesData();
    });

    // Side panel close
    document.getElementById("wfm-nodes-panel-close")?.addEventListener("click", closeNodeSidePanel);

    // Side panel tab switching
    document.querySelectorAll(".wfm-nodes-side-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-nodes-side-tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const tabId = btn.dataset.sideTab;
            document.querySelectorAll(".wfm-nodes-side-content").forEach(c => {
                c.style.display = "none";
                c.classList.remove("active");
            });
            const map = { details: "wfm-nodes-side-details", io: "wfm-nodes-side-io", nodegroup: "wfm-nodes-side-group" };
            const target = document.getElementById(map[tabId]);
            if (target) { target.style.display = "block"; target.classList.add("active"); }
        });
    });

    // Create node set button
    document.getElementById("wfm-node-set-create-btn")?.addEventListener("click", showCreateSetModal);

    // Lazy load on first tab click
    document.querySelector('[data-tab="nodes"]')?.addEventListener("click", () => {
        if (!state.loaded) loadNodesData();
    });
}

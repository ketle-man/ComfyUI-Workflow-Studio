/**
 * Node Library Sidebar Panel
 *
 * Fixed sidebar panel injected into ComfyUI DOM.
 * Three tabs: Favorites (single nodes), Node Sets (multi-node), Groups.
 * Items are draggable onto the canvas or click-to-place.
 */
console.log("[WFM] node_sets_menu.js loading...");
import { app } from "../../scripts/app.js";
console.log("[WFM] node_sets_menu.js: app imported");

export const NODE_SETS_TOOLTIP = "Node Library – Browse & drag nodes onto canvas";

// ============================================
// State
// ============================================

const state = {
    visible: false,
    activeTab: "favorites",   // favorites | sets | groups
    favorites: [],             // [{name, display_name}]
    nodeSets: [],
    groups: {},                // {groupName: [nodeName, ...]}
    metadata: {},
    searchText: "",
    loaded: false,
};

// ============================================
// API
// ============================================

const fetchNodeSets = async () => {
    try {
        const res = await fetch("/api/wfm/node-sets");
        return res.ok ? await res.json() : [];
    } catch { return []; }
};

const fetchMetadata = async () => {
    try {
        const res = await fetch("/api/wfm/nodes/metadata");
        return res.ok ? await res.json() : {};
    } catch { return {}; }
};

const fetchGroups = async () => {
    try {
        const res = await fetch("/api/wfm/nodes/groups");
        return res.ok ? await res.json() : {};
    } catch { return {}; }
};

const loadData = async () => {
    const [metadata, nodeSets, groups] = await Promise.all([
        fetchMetadata(), fetchNodeSets(), fetchGroups(),
    ]);
    state.metadata = metadata;
    state.nodeSets = nodeSets;
    state.groups = groups;

    // Extract favorites from metadata
    state.favorites = [];
    for (const [name, meta] of Object.entries(metadata)) {
        if (name === "_groups") continue;
        if (meta.favorite) {
            state.favorites.push({ name, display_name: name });
        }
    }
    state.loaded = true;
};

// ============================================
// Canvas placement helpers
// ============================================

const getCanvasDropPos = (e) => {
    const canvas = app.canvas;
    if (!canvas) return [100, 100];
    const rect = canvas.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvas.ds.scale - canvas.ds.offset[0];
    const y = (e.clientY - rect.top) / canvas.ds.scale - canvas.ds.offset[1];
    return [x, y];
};

const placeSingleNode = (classType, pos) => {
    const graph = app.graph;
    if (!graph) return;
    const node = LiteGraph.createNode(classType);
    if (!node) {
        showToast(`Unknown node: ${classType}`, "error");
        return;
    }
    node.pos = pos || [100, 100];
    graph.add(node);
    app.canvas.setDirty(true, true);
    showToast(`Placed: ${node.title || classType}`, "success");
};

const placeNodeSet = (nodeSet, pos) => {
    const graph = app.graph;
    const canvas = app.canvas;
    if (!graph || !canvas) return;

    const nodes = nodeSet.nodes || [];
    if (nodes.length === 0) return;

    const baseX = pos ? pos[0] : (-canvas.ds.offset[0] + canvas.canvas.width / 2 / canvas.ds.scale);
    const baseY = pos ? pos[1] : (-canvas.ds.offset[1] + canvas.canvas.height / 2 / canvas.ds.scale);

    const positions = nodes.map(n => n.rel_pos || [0, 0]);
    const minX = Math.min(...positions.map(p => p[0]));
    const minY = Math.min(...positions.map(p => p[1]));

    const createdNodes = [];
    for (const nodeDef of nodes) {
        if (!nodeDef.class_type) { createdNodes.push(null); continue; }
        const node = LiteGraph.createNode(nodeDef.class_type);
        if (!node) { createdNodes.push(null); continue; }
        const rp = nodeDef.rel_pos || [0, 0];
        node.pos = [baseX + rp[0] - minX, baseY + rp[1] - minY];
        if (nodeDef.title) node.title = nodeDef.title;
        if (nodeDef.widget_values && node.widgets) {
            for (const [k, v] of Object.entries(nodeDef.widget_values)) {
                const w = node.widgets.find(ww => ww.name === k);
                if (w) w.value = v;
            }
        }
        graph.add(node);
        createdNodes.push(node);
    }

    for (const link of (nodeSet.links || [])) {
        const from = createdNodes[link.from_node];
        const to = createdNodes[link.to_node];
        if (from && to) {
            try { from.connect(link.from_slot ?? 0, to, link.to_slot ?? 0); } catch {}
        }
    }

    canvas.setDirty(true, true);
    showToast(`Placed "${nodeSet.name}" (${createdNodes.filter(Boolean).length} nodes)`, "success");
};

// ============================================
// Drag & Drop onto canvas
// ============================================

let dropHandlerInstalled = false;

const installCanvasDropHandler = () => {
    if (dropHandlerInstalled) return;
    dropHandlerInstalled = true;

    const canvasEl = document.getElementById("graph-canvas");
    if (!canvasEl) return;

    canvasEl.addEventListener("dragover", (e) => {
        if (e.dataTransfer.types.includes("application/x-wfm-node")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        }
    });

    canvasEl.addEventListener("drop", (e) => {
        const raw = e.dataTransfer.getData("application/x-wfm-node");
        if (!raw) return;
        e.preventDefault();

        const data = JSON.parse(raw);
        const pos = getCanvasDropPos(e);

        if (data.type === "single") {
            placeSingleNode(data.classType, pos);
        } else if (data.type === "set") {
            const set = state.nodeSets.find(s => s.id === data.setId);
            if (set) placeNodeSet(set, pos);
        }
    });
};

// ============================================
// Sidebar Panel DOM
// ============================================

let panelEl = null;

const PANEL_ID = "wfm-node-library-panel";

const createPanel = () => {
    if (panelEl) return panelEl;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
        <div class="wfm-nlp-header">
            <span class="wfm-nlp-title">Node Library</span>
            <button class="wfm-nlp-refresh" title="Refresh">&#8635;</button>
            <button class="wfm-nlp-close" title="Close">&times;</button>
        </div>
        <div class="wfm-nlp-tabs">
            <button class="wfm-nlp-tab active" data-tab="favorites">&#9733; Favorites</button>
            <button class="wfm-nlp-tab" data-tab="sets">&#9776; Sets</button>
            <button class="wfm-nlp-tab" data-tab="groups">&#128193; Groups</button>
        </div>
        <div class="wfm-nlp-search">
            <input type="text" class="wfm-nlp-search-input" placeholder="Search...">
        </div>
        <div class="wfm-nlp-content"></div>
    `;

    document.body.appendChild(panel);
    panelEl = panel;

    // Tab switching
    panel.querySelectorAll(".wfm-nlp-tab").forEach(btn => {
        btn.addEventListener("click", () => {
            state.activeTab = btn.dataset.tab;
            panel.querySelectorAll(".wfm-nlp-tab").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            renderContent();
        });
    });

    // Close
    panel.querySelector(".wfm-nlp-close").addEventListener("click", () => togglePanel());

    // Search
    panel.querySelector(".wfm-nlp-search-input").addEventListener("input", (e) => {
        state.searchText = e.target.value.toLowerCase().trim();
        renderContent();
    });

    // Refresh
    panel.querySelector(".wfm-nlp-refresh").addEventListener("click", async () => {
        await loadData();
        renderContent();
        showToast("Node Library refreshed", "success");
    });

    injectStyles();
    return panel;
};

// ============================================
// Render content
// ============================================

const renderContent = () => {
    const content = panelEl?.querySelector(".wfm-nlp-content");
    if (!content) return;

    if (!state.loaded) {
        content.innerHTML = `<div class="wfm-nlp-empty">Loading...</div>`;
        return;
    }

    switch (state.activeTab) {
        case "favorites": renderFavorites(content); break;
        case "sets": renderSets(content); break;
        case "groups": renderGroups(content); break;
    }
};

const renderFavorites = (container) => {
    let items = state.favorites;
    if (state.searchText) {
        items = items.filter(n => n.name.toLowerCase().includes(state.searchText));
    }

    if (items.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">
            ${state.favorites.length === 0 ? "No favorites yet.<br><small>Star nodes in Workflow Studio → Nodes tab</small>" : "No matches"}
        </div>`;
        return;
    }

    container.innerHTML = "";
    for (const node of items) {
        const el = createDraggableItem(node.display_name || node.name, "single", { classType: node.name });
        el.addEventListener("dblclick", () => {
            placeSingleNode(node.name);
        });
        container.appendChild(el);
    }
};

const renderSets = (container) => {
    let items = state.nodeSets;
    if (state.searchText) {
        items = items.filter(s =>
            s.name.toLowerCase().includes(state.searchText) ||
            (s.tags || []).some(t => t.toLowerCase().includes(state.searchText))
        );
    }

    if (items.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">
            ${state.nodeSets.length === 0 ? "No node sets.<br><small>Create sets in Workflow Studio → Nodes tab</small>" : "No matches"}
        </div>`;
        return;
    }

    container.innerHTML = "";
    for (const set of items) {
        const count = (set.nodes || []).length;
        const el = createDraggableItem(
            `${esc(set.name)} <span class="wfm-nlp-badge">${count} nodes</span>`,
            "set",
            { setId: set.id },
            set.description
        );
        el.addEventListener("dblclick", () => {
            placeNodeSet(set);
        });
        container.appendChild(el);
    }
};

const renderGroups = (container) => {
    const groupNames = Object.keys(state.groups).sort();

    if (groupNames.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">
            No groups.<br><small>Create groups in Workflow Studio → Nodes tab</small>
        </div>`;
        return;
    }

    let filtered = groupNames;
    if (state.searchText) {
        filtered = groupNames.filter(g =>
            g.toLowerCase().includes(state.searchText) ||
            (state.groups[g] || []).some(n => n.toLowerCase().includes(state.searchText))
        );
    }

    container.innerHTML = "";
    for (const groupName of filtered) {
        const nodes = state.groups[groupName] || [];

        const section = document.createElement("div");
        section.className = "wfm-nlp-group-section";

        const header = document.createElement("div");
        header.className = "wfm-nlp-group-header";
        header.innerHTML = `<span>${esc(groupName)}</span> <span class="wfm-nlp-badge">${nodes.length}</span>`;
        header.addEventListener("click", () => {
            const list = section.querySelector(".wfm-nlp-group-list");
            list.style.display = list.style.display === "none" ? "block" : "none";
            header.classList.toggle("collapsed");
        });
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "wfm-nlp-group-list";
        for (const nodeName of nodes) {
            const el = createDraggableItem(nodeName, "single", { classType: nodeName });
            el.addEventListener("dblclick", () => placeSingleNode(nodeName));
            list.appendChild(el);
        }
        section.appendChild(list);
        container.appendChild(section);
    }
};

// ============================================
// Draggable item factory
// ============================================

const createDraggableItem = (label, type, data, subtitle) => {
    const el = document.createElement("div");
    el.className = "wfm-nlp-item";
    el.draggable = true;
    el.innerHTML = `
        <div class="wfm-nlp-item-label">${label}</div>
        ${subtitle ? `<div class="wfm-nlp-item-sub">${esc(subtitle)}</div>` : ""}
    `;

    el.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/x-wfm-node", JSON.stringify({ type, ...data }));
        el.classList.add("dragging");
    });

    el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
    });

    return el;
};

// ============================================
// Toggle & exports
// ============================================

export const togglePanel = async () => {
    const panel = createPanel();
    state.visible = !state.visible;
    panel.style.display = state.visible ? "flex" : "none";

    if (state.visible && !state.loaded) {
        await loadData();
        renderContent();
    }

    installCanvasDropHandler();
};

export const getNodeSetsIcon = () => `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <path d="M17.5 14v7M14 17.5h7"/>
    </svg>
`;

// ============================================
// Toast
// ============================================

const showToast = (message, type = "info") => {
    const existing = document.getElementById("wfm-ns-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "wfm-ns-toast";
    const colors = {
        success: { bg: "rgba(46,213,115,0.95)" },
        error: { bg: "rgba(255,71,87,0.95)" },
        info: { bg: "rgba(74,158,255,0.95)" },
    };
    Object.assign(toast.style, {
        position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
        padding: "10px 24px", background: (colors[type] || colors.info).bg, color: "#fff",
        borderRadius: "8px", fontSize: "14px", fontWeight: "500", zIndex: "99999",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)", transition: "opacity 0.3s", whiteSpace: "nowrap",
    });
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 3000);
};

const esc = (s) => s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : "";

// ============================================
// Save selected nodes as Node Set (context menu)
// ============================================

export const saveSelectedAsNodeSet = async () => {
    const selectedNodes = Object.values(app.canvas.selected_nodes || {});
    if (selectedNodes.length === 0) {
        showToast("Select at least one node first", "error");
        return;
    }

    // Prompt for name
    const name = prompt("Node Set name:");
    if (!name || !name.trim()) return;

    // Build node list with relative positions
    // Use the top-left of the bounding box as origin
    const minX = Math.min(...selectedNodes.map(n => n.pos[0]));
    const minY = Math.min(...selectedNodes.map(n => n.pos[1]));

    const nodeIdToIndex = new Map();
    const nodes = [];
    selectedNodes.forEach((node, i) => {
        nodeIdToIndex.set(node.id, i);
        nodes.push({
            class_type: node.type || node.comfyClass || "",
            title: node.title || "",
            rel_pos: [Math.round(node.pos[0] - minX), Math.round(node.pos[1] - minY)],
        });
    });

    // Extract links between selected nodes
    const links = [];
    const graph = app.graph;

    for (const node of selectedNodes) {
        if (!node.inputs) continue;
        for (let slotIdx = 0; slotIdx < node.inputs.length; slotIdx++) {
            const input = node.inputs[slotIdx];
            if (input.link == null) continue;

            // Resolve link data
            let linkData = null;
            if (graph.links instanceof Map) {
                linkData = graph.links.get(input.link);
            } else if (graph.links) {
                linkData = graph.links[input.link];
            }
            if (!linkData) continue;

            // linkData: [id, origin_id, origin_slot, target_id, target_slot, type]
            // or object with .origin_id, .origin_slot, etc.
            const originId = linkData.origin_id ?? linkData[1];
            const originSlot = linkData.origin_slot ?? linkData[2];
            const targetSlot = linkData.target_slot ?? linkData[4];

            // Only include if both source and target are in the selection
            if (nodeIdToIndex.has(originId) && nodeIdToIndex.has(node.id)) {
                links.push({
                    from_node: nodeIdToIndex.get(originId),
                    from_slot: originSlot,
                    to_node: nodeIdToIndex.get(node.id),
                    to_slot: targetSlot,
                });
            }
        }
    }

    // Save via API
    try {
        const res = await fetch("/api/wfm/node-sets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.trim(), description: "", tags: [], nodes, links }),
        });
        const result = await res.json();
        if (result.status === "ok") {
            showToast(`Node Set "${name.trim()}" saved (${nodes.length} nodes, ${links.length} links)`, "success");
            // Refresh sidebar if open
            if (state.loaded) {
                await loadData();
                renderContent();
            }
        } else {
            showToast("Failed to save: " + (result.error || "Unknown error"), "error");
        }
    } catch (err) {
        showToast("Failed to save: " + err.message, "error");
    }
};


// ============================================
// Styles
// ============================================

const injectStyles = () => {
    if (document.getElementById("wfm-nlp-styles")) return;
    const style = document.createElement("style");
    style.id = "wfm-nlp-styles";
    style.textContent = `
        #${PANEL_ID} {
            position: fixed;
            right: 0;
            top: 0;
            width: 280px;
            height: 100vh;
            background: var(--comfy-menu-bg, #1e1e1e);
            border-left: 1px solid var(--border-color, #4e4e4e);
            z-index: 9999;
            display: none;
            flex-direction: column;
            font-family: sans-serif;
            font-size: 13px;
            color: var(--input-text, #ddd);
            box-shadow: -4px 0 16px rgba(0,0,0,0.3);
        }
        .wfm-nlp-header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 10px 12px;
            border-bottom: 1px solid var(--border-color, #4e4e4e);
            flex-shrink: 0;
        }
        .wfm-nlp-title {
            font-weight: 600;
            font-size: 14px;
            flex: 1;
        }
        .wfm-nlp-close {
            background: none;
            border: none;
            color: var(--input-text, #ddd);
            font-size: 20px;
            cursor: pointer;
            padding: 0 4px;
            opacity: 0.6;
        }
        .wfm-nlp-close:hover { opacity: 1; }
        .wfm-nlp-tabs {
            display: flex;
            border-bottom: 1px solid var(--border-color, #4e4e4e);
            flex-shrink: 0;
        }
        .wfm-nlp-tab {
            flex: 1;
            padding: 8px 4px;
            background: none;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--input-text, #ddd);
            font-size: 11px;
            cursor: pointer;
            opacity: 0.6;
            transition: all 0.15s;
            white-space: nowrap;
        }
        .wfm-nlp-tab:hover { opacity: 0.9; }
        .wfm-nlp-tab.active {
            opacity: 1;
            border-bottom-color: var(--p-button-background, #4a9eff);
        }
        .wfm-nlp-search {
            padding: 8px;
            border-bottom: 1px solid var(--border-color, #4e4e4e);
            flex-shrink: 0;
        }
        .wfm-nlp-search-input {
            width: 100%;
            padding: 6px 8px;
            background: var(--comfy-input-bg, #2a2a2a);
            border: 1px solid var(--border-color, #4e4e4e);
            border-radius: 4px;
            color: var(--input-text, #ddd);
            font-size: 12px;
            outline: none;
            box-sizing: border-box;
        }
        .wfm-nlp-search-input:focus {
            border-color: var(--p-button-background, #4a9eff);
        }
        .wfm-nlp-content {
            flex: 1;
            overflow-y: auto;
            padding: 4px 0;
        }
        .wfm-nlp-empty {
            padding: 24px 16px;
            text-align: center;
            color: var(--descrip-text, #999);
            font-size: 12px;
            line-height: 1.6;
        }
        .wfm-nlp-item {
            padding: 7px 12px;
            cursor: grab;
            border-bottom: 1px solid var(--border-color, #3a3a3a);
            transition: background 0.12s;
            user-select: none;
        }
        .wfm-nlp-item:hover {
            background: var(--comfy-input-bg, #333);
        }
        .wfm-nlp-item.dragging {
            opacity: 0.5;
            background: var(--comfy-input-bg, #333);
        }
        .wfm-nlp-item-label {
            font-size: 12px;
            line-height: 1.3;
        }
        .wfm-nlp-item-sub {
            font-size: 10px;
            color: var(--descrip-text, #888);
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .wfm-nlp-badge {
            display: inline-block;
            font-size: 10px;
            padding: 1px 5px;
            background: var(--comfy-input-bg, #444);
            border-radius: 3px;
            color: var(--descrip-text, #aaa);
            margin-left: 4px;
            vertical-align: middle;
        }
        .wfm-nlp-group-section {
            border-bottom: 1px solid var(--border-color, #3a3a3a);
        }
        .wfm-nlp-group-header {
            padding: 8px 12px;
            cursor: pointer;
            font-weight: 500;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: background 0.12s;
        }
        .wfm-nlp-group-header:hover {
            background: var(--comfy-input-bg, #333);
        }
        .wfm-nlp-group-header::before {
            content: "\\25BC";
            font-size: 8px;
            margin-right: 6px;
            transition: transform 0.15s;
        }
        .wfm-nlp-group-header.collapsed::before {
            transform: rotate(-90deg);
        }
        .wfm-nlp-group-list {
            padding-left: 8px;
        }
        .wfm-nlp-group-list .wfm-nlp-item {
            padding: 5px 12px;
            font-size: 11px;
        }
        .wfm-nlp-refresh {
            background: none;
            border: none;
            color: var(--input-text, #ddd);
            font-size: 16px;
            cursor: pointer;
            opacity: 0.7;
        }
        .wfm-nlp-refresh:hover { opacity: 1; }
    `;
    document.head.appendChild(style);
};


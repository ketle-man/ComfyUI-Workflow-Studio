/**
 * Workflow Studio Library Sidebar Panel
 *
 * Fixed sidebar panel injected into ComfyUI DOM.
 * Three top-level tabs: Workflows / Nodes / Prompts
 *   Workflows sub-tabs: Favorites, Model Type, Groups
 *   Nodes sub-tabs:     Favorites, Sets, Groups
 *   Prompts sub-tabs:   Favorites, Categories
 * Items are draggable onto the canvas or click-to-place.
 */
console.log("[WFM] node_sets_menu.js loading...");
import { app } from "../../scripts/app.js";
console.log("[WFM] node_sets_menu.js: app imported");

export const NODE_SETS_TOOLTIP = "Workflow Studio Library \u2013 Browse & drag workflows/nodes/prompts onto canvas";

// ============================================
// State
// ============================================

const state = {
    visible: false,
    // Top-level tab
    topTab: "workflows",           // "workflows" | "nodes" | "prompts" | "models"
    // Node sub-tabs (existing)
    activeTab: "all",              // all | favorites | groups
    activeTab2: null,              // 2nd row: "sets" | "category" | "package" (or null when 1st row active)
    activeNodeCategory: "",        // selected category value
    activeNodePackage: "",         // selected package value
    objectInfo: {},                // raw /object_info data for package lookup
    favorites: [],                 // [{name, display_name}]
    nodeSets: [],
    groups: {},                    // {groupName: [nodeName, ...]}
    metadata: {},
    loaded: false,
    // Workflow sub-tabs (new)
    wfSubTab: "wf-all",           // "wf-all" | "wf-favorites" | "wf-groups"
    wfSubTab2: null,               // 2nd row: "wf-modeltype" (or null when 1st row active)
    wfList: [],                    // full workflow array from API
    wfFavorites: [],               // metadata.favorite === true
    wfBadgeTypes: [],              // unique badge strings
    wfGroups: {},                  // from localStorage "wfm_groups"
    wfLoaded: false,
    // Prompts sub-tabs
    promptSubTab: "prompt-all",    // "prompt-all" | "prompt-favorites" | "prompt-categories"
    promptList: [],                // full prompt array from API
    promptFavorites: [],           // favorite === true
    promptCategories: [],          // unique category strings
    promptLoaded: false,
    // Models sub-tabs
    modelSubTab: "model-all",      // "model-all" | "model-favorites" | "model-groups"
    modelSubTab2: null,            // 2nd row: "model-type" (or null when 1st row active)
    modelMetadata: {},             // {modelName: {favorite, tags, badges, ...}}
    modelGroups: {},               // {groupName: [modelName, ...]} from /api/wfm/models/groups
    modelsLoaded: false,
    // Shared
    searchText: "",
};

// ============================================
// API – Nodes
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

const fetchObjectInfo = async () => {
    try {
        const res = await fetch(`${window.location.origin}/object_info`);
        return res.ok ? await res.json() : {};
    } catch { return {}; }
};

const extractPackageName = (pythonModule) => {
    if (!pythonModule || pythonModule === "nodes") return "ComfyUI (Built-in)";
    const parts = pythonModule.split(".");
    if (parts[0] === "custom_nodes" && parts.length > 1) return parts[1];
    return pythonModule;
};

const loadData = async () => {
    const [metadata, nodeSets, groups, objectInfo] = await Promise.all([
        fetchMetadata(), fetchNodeSets(), fetchGroups(), fetchObjectInfo(),
    ]);
    state.metadata = metadata;
    state.nodeSets = nodeSets;
    state.groups = groups;
    state.objectInfo = objectInfo;

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
// API – Prompts
// ============================================

const fetchPrompts = async () => {
    try {
        const res = await fetch("/api/wfm/prompts");
        return res.ok ? await res.json() : [];
    } catch { return []; }
};

const loadPromptData = async () => {
    const prompts = await fetchPrompts();
    state.promptList = prompts;
    state.promptFavorites = prompts.filter(p => p.favorite);

    const catSet = new Set();
    for (const p of prompts) {
        const c = (p.category || "").trim();
        if (c) catSet.add(c);
    }
    state.promptCategories = [...catSet].sort();
    state.promptLoaded = true;
};

// ============================================
// API – Models
// ============================================

const MODEL_TYPE_LABELS = {
    checkpoint: "Checkpoint",
    lora: "LoRA",
    vae: "VAE",
    controlnet: "ControlNet",
    unet: "UNET",
    textencoder: "TextEncoder",
    hypernetwork: "Hypernetwork",
    embedding: "Embedding",
};

const MODEL_TYPES = Object.keys(MODEL_TYPE_LABELS);

const fetchModelList = async (type) => {
    try {
        const comfyBase = window.location.origin;
        const fetchMap = {
            checkpoint: () => fetch(`${comfyBase}/object_info/CheckpointLoaderSimple`).then(r => r.json()).then(d => d?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || []),
            lora:        () => fetch(`${comfyBase}/object_info/LoraLoader`).then(r => r.json()).then(d => d?.LoraLoader?.input?.required?.lora_name?.[0] || []),
            vae:         () => fetch(`${comfyBase}/object_info/VAELoader`).then(r => r.json()).then(d => d?.VAELoader?.input?.required?.vae_name?.[0] || []),
            controlnet:  () => fetch(`${comfyBase}/object_info/ControlNetLoader`).then(r => r.json()).then(d => d?.ControlNetLoader?.input?.required?.control_net_name?.[0] || []),
            unet:        () => fetch(`${comfyBase}/object_info/UNETLoader`).then(r => r.json()).then(d => d?.UNETLoader?.input?.required?.unet_name?.[0] || []),
            textencoder: async () => {
                const base = window.location.origin;
                for (const cls of ["DualCLIPLoader", "CLIPLoader"]) {
                    try {
                        const d = await fetch(`${base}/object_info/${cls}`).then(r => r.json());
                        const list = d?.[cls]?.input?.required?.clip_name1?.[0];
                        if (list?.length) return list;
                    } catch {}
                }
                return [];
            },
            hypernetwork:() => fetch(`${comfyBase}/object_info/HypernetworkLoader`).then(r => r.json()).then(d => d?.HypernetworkLoader?.input?.required?.hypernetwork_name?.[0] || []),
            embedding:   () => fetch(`${comfyBase}/embeddings`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
        };
        const fn = fetchMap[type];
        return fn ? await fn() : [];
    } catch { return []; }
};

const fetchModelMetadata = async () => {
    try {
        const res = await fetch("/api/wfm/models/metadata");
        return res.ok ? await res.json() : {};
    } catch { return {}; }
};

const fetchModelGroups = async () => {
    try {
        const res = await fetch("/api/wfm/models/groups");
        return res.ok ? await res.json() : {};
    } catch { return {}; }
};

const loadModelsData = async () => {
    const [metadata, groups] = await Promise.all([fetchModelMetadata(), fetchModelGroups()]);
    state.modelMetadata = metadata;
    state.modelGroups = groups;
    state.modelsLoaded = true;
};

// ============================================
// API – Workflows
// ============================================

const fetchWorkflows = async () => {
    try {
        const res = await fetch("/api/wfm/workflows");
        return res.ok ? await res.json() : [];
    } catch { return []; }
};

const fetchWorkflowRaw = async (filename) => {
    try {
        const res = await fetch(`/api/wfm/workflows/raw?filename=${encodeURIComponent(filename)}`);
        return res.ok ? await res.json() : null;
    } catch { return null; }
};

const loadWfData = async () => {
    const workflows = await fetchWorkflows();
    state.wfList = workflows.filter(w => w.filename !== ".index.json");

    // Extract favorites
    state.wfFavorites = workflows.filter(w => w.metadata?.favorite);

    // Extract unique badge labels
    const badgeSet = new Set();
    for (const wf of workflows) {
        (wf.metadata?.badges || []).forEach(b => badgeSet.add(b));
    }
    state.wfBadgeTypes = [...badgeSet].sort();

    // Load groups from localStorage and clean up stale entries
    try {
        state.wfGroups = JSON.parse(localStorage.getItem("wfm_groups") || "{}");
    } catch { state.wfGroups = {}; }

    // Remove filenames that no longer exist from groups
    const validFiles = new Set(workflows.map(w => w.filename));
    let groupsDirty = false;
    for (const groupName of Object.keys(state.wfGroups)) {
        const before = state.wfGroups[groupName].length;
        state.wfGroups[groupName] = state.wfGroups[groupName].filter(fn => validFiles.has(fn));
        if (state.wfGroups[groupName].length !== before) groupsDirty = true;
    }
    if (groupsDirty) {
        localStorage.setItem("wfm_groups", JSON.stringify(state.wfGroups));
    }

    state.wfLoaded = true;
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
// Prompt → Text node placement
// ============================================

const placePromptNode = (posText, negText, promptName, pos) => {
    const graph = app.graph;
    if (!graph) return;

    const node = LiteGraph.createNode("WFS_PromptText");
    if (!node) {
        showToast("WFS_PromptText node not found. Please restart ComfyUI.", "error");
        return;
    }

    node.pos = pos || [100, 100];
    if (promptName) node.title = promptName;

    graph.add(node);

    // Set positive and negative widget values
    if (node.widgets) {
        const posWidget = node.widgets.find(w => w.name === "positive");
        if (posWidget) posWidget.value = posText || "";
        const negWidget = node.widgets.find(w => w.name === "negative");
        if (negWidget) negWidget.value = negText || "";
    }

    app.canvas.setDirty(true, true);
    showToast(`Placed: ${promptName || "Prompt"}`, "success");
};

// ============================================
// Model node placement
// ============================================

// Model type → { classType, widgetName } mapping
const MODEL_NODE_MAP = {
    checkpoint:   { classType: "CheckpointLoaderSimple", widgetName: "ckpt_name" },
    lora:         { classType: "LoraLoader",             widgetName: "lora_name" },
    vae:          { classType: "VAELoader",              widgetName: "vae_name" },
    controlnet:   { classType: "ControlNetLoader",       widgetName: "control_net_name" },
    unet:         { classType: "UNETLoader",             widgetName: "unet_name" },
    textencoder:  { classType: "CLIPLoader",             widgetName: "clip_name1" },
    hypernetwork: { classType: "HypernetworkLoader",     widgetName: "hypernetwork_name" },
    // embedding has no loader node — copy-only
};

const placeModelNode = (modelName, modelType, pos) => {
    const mapping = MODEL_NODE_MAP[modelType];
    if (!mapping) {
        // Embedding: copy "embedding:name" to clipboard and notify
        const lastSlash = Math.max(modelName.lastIndexOf("/"), modelName.lastIndexOf("\\"));
        const filename = lastSlash >= 0 ? modelName.substring(lastSlash + 1) : modelName;
        const dot = filename.lastIndexOf(".");
        const stem = dot >= 0 ? filename.substring(0, dot) : filename;
        const text = `embedding:${stem}`;
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Copied: ${text}`, "success");
        });
        return;
    }

    const graph = app.graph;
    if (!graph) return;

    const node = LiteGraph.createNode(mapping.classType);
    if (!node) {
        showToast(`Node not found: ${mapping.classType}`, "error");
        return;
    }

    const canvas = app.canvas;
    const centerPos = canvas
        ? [-canvas.ds.offset[0] + canvas.canvas.width / 2 / canvas.ds.scale,
           -canvas.ds.offset[1] + canvas.canvas.height / 2 / canvas.ds.scale]
        : [100, 100];
    node.pos = pos || centerPos;
    graph.add(node);

    // Set the model widget value
    if (node.widgets) {
        const w = node.widgets.find(ww => ww.name === mapping.widgetName);
        if (w) {
            w.value = modelName;
            // Trigger callback if present (updates node appearance)
            if (w.callback) w.callback(modelName);
        }
    }

    app.canvas.setDirty(true, true);
    const lastSlash = Math.max(modelName.lastIndexOf("/"), modelName.lastIndexOf("\\"));
    const filename = lastSlash >= 0 ? modelName.substring(lastSlash + 1) : modelName;
    showToast(`Placed: ${filename}`, "success");
};

// ============================================
// Workflow canvas loading
// ============================================

const loadWorkflowOnCanvas = async (filename) => {
    const displayName = filename.replace(/\.json$/i, "");
    showToast(`Loading "${displayName}"...`, "info");
    const data = await fetchWorkflowRaw(filename);
    if (!data) {
        showToast("Failed to load workflow", "error");
        return;
    }
    try {
        await app.loadGraphData(data);
        showToast(`Loaded: ${displayName}`, "success");
    } catch (err) {
        showToast("Failed to load: " + err.message, "error");
    }
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
        if (e.dataTransfer.types.includes("application/x-wfm-node") ||
            e.dataTransfer.types.includes("application/x-wfm-workflow") ||
            e.dataTransfer.types.includes("application/x-wfm-prompt") ||
            e.dataTransfer.types.includes("application/x-wfm-model")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        }
    });

    canvasEl.addEventListener("drop", (e) => {
        // Handle model drop
        const modelRaw = e.dataTransfer.getData("application/x-wfm-model");
        if (modelRaw) {
            e.preventDefault();
            const { modelName, modelType } = JSON.parse(modelRaw);
            const pos = getCanvasDropPos(e);
            placeModelNode(modelName, modelType, pos);
            return;
        }

        // Handle prompt drop
        const promptRaw = e.dataTransfer.getData("application/x-wfm-prompt");
        if (promptRaw) {
            e.preventDefault();
            const data = JSON.parse(promptRaw);
            const pos = getCanvasDropPos(e);
            placePromptNode(data.text, data.negText, data.name, pos);
            return;
        }

        // Handle workflow drop
        const wfRaw = e.dataTransfer.getData("application/x-wfm-workflow");
        if (wfRaw) {
            e.preventDefault();
            const { filename } = JSON.parse(wfRaw);
            loadWorkflowOnCanvas(filename);
            return;
        }

        // Handle node drop
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

// ============================================
// Theme
// ============================================

const THEME_KEY = "wfm_nlp_theme";

const THEME_VARS = [
    { key: "bg",     label: "Background",      cssVar: "--comfy-menu-bg",   default: "#1e1e1e" },
    { key: "input",  label: "Sub-header BG",   cssVar: "--comfy-input-bg",  default: "#2a2a2a" },
    { key: "text",   label: "Text",             cssVar: "--input-text",      default: "#dddddd" },
    { key: "border", label: "Border",           cssVar: "--border-color",    default: "#4e4e4e" },
    { key: "desc",   label: "Secondary text",   cssVar: "--descrip-text",    default: "#888888" },
];

function loadTheme() {
    try { return JSON.parse(localStorage.getItem(THEME_KEY)) || {}; } catch { return {}; }
}

function applyTheme(panel, theme) {
    THEME_VARS.forEach(({ key, cssVar, default: def }) => {
        panel.style.setProperty(cssVar, theme[key] || def);
    });
}

function buildThemePanel(panel) {
    const themePanel = panel.querySelector(".wfm-nlp-theme-panel");
    if (!themePanel) return;
    const theme = loadTheme();
    themePanel.innerHTML = `
        <div class="wfm-nlp-theme-title">Panel Theme</div>
        ${THEME_VARS.map(({ key, label, default: def }) => `
        <div class="wfm-nlp-theme-row">
            <span class="wfm-nlp-theme-label">${label}</span>
            <input type="color" class="wfm-nlp-theme-color" data-key="${key}"
                value="${theme[key] || def}">
        </div>`).join("")}
        <div class="wfm-nlp-theme-actions">
            <button class="wfm-nlp-theme-reset-btn">Reset</button>
            <button class="wfm-nlp-theme-save-btn">Save</button>
        </div>`;

    themePanel.querySelector(".wfm-nlp-theme-save-btn").addEventListener("click", () => {
        const saved = {};
        themePanel.querySelectorAll(".wfm-nlp-theme-color").forEach(input => {
            saved[input.dataset.key] = input.value;
        });
        localStorage.setItem(THEME_KEY, JSON.stringify(saved));
        applyTheme(panel, saved);
        themePanel.style.display = "none";
    });

    themePanel.querySelector(".wfm-nlp-theme-reset-btn").addEventListener("click", () => {
        localStorage.removeItem(THEME_KEY);
        THEME_VARS.forEach(({ cssVar, default: def }) => {
            panel.style.setProperty(cssVar, def);
        });
        themePanel.style.display = "none";
    });

    // Live preview on color change
    themePanel.querySelectorAll(".wfm-nlp-theme-color").forEach(input => {
        input.addEventListener("input", () => {
            panel.style.setProperty(
                THEME_VARS.find(v => v.key === input.dataset.key).cssVar,
                input.value
            );
        });
    });
}

const createPanel = () => {
    if (panelEl) return panelEl;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
        <div class="wfm-nlp-header">
            <span class="wfm-nlp-title">Workflow Studio Library</span>
            <button class="wfm-nlp-theme-btn" title="Theme settings">&#9881;</button>
            <button class="wfm-nlp-refresh" title="Refresh">&#8635;</button>
            <button class="wfm-nlp-close" title="Close">&times;</button>
        </div>
        <div class="wfm-nlp-theme-panel" style="display:none;"></div>
        <div class="wfm-nlp-tabs">
            <button class="wfm-nlp-tab wfm-nlp-top-tab active" data-toptab="workflows">Workflows</button>
            <button class="wfm-nlp-tab wfm-nlp-top-tab" data-toptab="nodes">Nodes</button>
            <button class="wfm-nlp-tab wfm-nlp-top-tab" data-toptab="prompts">Prompts</button>
            <button class="wfm-nlp-tab wfm-nlp-top-tab" data-toptab="models">Models</button>
        </div>
        <div class="wfm-nlp-subtabs"></div>
        <div class="wfm-nlp-subtabs wfm-nlp-subtabs-row2"></div>
        <div class="wfm-nlp-search">
            <input type="text" class="wfm-nlp-search-input" placeholder="Search workflows...">
        </div>
        <div class="wfm-nlp-content"></div>
    `;

    document.body.appendChild(panel);
    panelEl = panel;

    // Top-level tab switching
    panel.querySelectorAll(".wfm-nlp-top-tab").forEach(btn => {
        btn.addEventListener("click", async () => {
            const tab = btn.dataset.toptab;
            if (state.topTab === tab) return;
            state.topTab = tab;
            state.searchText = "";
            const searchInput = panel.querySelector(".wfm-nlp-search-input");
            if (searchInput) {
                searchInput.value = "";
                const placeholders = { workflows: "Search workflows...", nodes: "Search nodes...", prompts: "Search prompts...", models: "Search models..." };
                searchInput.placeholder = placeholders[tab] || "Search...";
            }
            panel.querySelectorAll(".wfm-nlp-top-tab").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            // Load data if needed
            if (tab === "workflows" && !state.wfLoaded) {
                await loadWfData();
            } else if (tab === "nodes" && !state.loaded) {
                await loadData();
            } else if (tab === "prompts" && !state.promptLoaded) {
                await loadPromptData();
            } else if (tab === "models" && !state.modelsLoaded) {
                await loadModelsData();
            }

            rebuildSubTabs();
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
        if (state.topTab === "workflows") {
            state.wfLoaded = false;
            await loadWfData();
        } else if (state.topTab === "prompts") {
            state.promptLoaded = false;
            await loadPromptData();
        } else if (state.topTab === "models") {
            state.modelsLoaded = false;
            await loadModelsData();
        } else {
            state.loaded = false;
            await loadData();
        }
        renderContent();
        showToast("Library refreshed", "success");
    });

    // Theme button
    panel.querySelector(".wfm-nlp-theme-btn").addEventListener("click", () => {
        const themePanel = panel.querySelector(".wfm-nlp-theme-panel");
        if (!themePanel) return;
        const isOpen = themePanel.style.display !== "none";
        if (isOpen) {
            themePanel.style.display = "none";
        } else {
            buildThemePanel(panel);
            themePanel.style.display = "block";
        }
    });

    injectStyles();

    // Apply saved theme
    applyTheme(panel, loadTheme());

    rebuildSubTabs();
    return panel;
};

// ============================================
// Sub-tab management
// ============================================

const rebuildSubTabs = () => {
    const row1 = panelEl?.querySelector(".wfm-nlp-subtabs:not(.wfm-nlp-subtabs-row2)");
    const row2 = panelEl?.querySelector(".wfm-nlp-subtabs-row2");
    if (!row1 || !row2) return;

    row1.innerHTML = "";
    row2.innerHTML = "";

    const updateAllActive = () => {
        row1.querySelectorAll(".wfm-nlp-sub-tab").forEach(b => b.classList.remove("active"));
        row2.querySelectorAll(".wfm-nlp-sub-tab").forEach(b => b.classList.remove("active"));
    };

    if (state.topTab === "models") {
        const row1Tabs = [
            { key: "model-all", label: "All" },
            { key: "model-favorites", label: "\u2605 Favorites" },
            { key: "model-groups", label: "\ud83d\udcc1 Groups" },
        ];
        const row2Tabs = [
            { key: "model-type", label: "\u25a6 By Type" },
        ];

        const activeKey = state.modelSubTab2 || state.modelSubTab;

        for (const t of row1Tabs) {
            const btn = document.createElement("button");
            btn.className = "wfm-nlp-tab wfm-nlp-sub-tab" + (activeKey === t.key ? " active" : "");
            btn.dataset.subtab = t.key;
            btn.textContent = t.label;
            btn.addEventListener("click", () => {
                state.modelSubTab = t.key;
                state.modelSubTab2 = null;
                updateAllActive();
                btn.classList.add("active");
                renderContent();
            });
            row1.appendChild(btn);
        }
        for (const t of row2Tabs) {
            const btn = document.createElement("button");
            btn.className = "wfm-nlp-tab wfm-nlp-sub-tab" + (activeKey === t.key ? " active" : "");
            btn.dataset.subtab = t.key;
            btn.textContent = t.label;
            btn.addEventListener("click", () => {
                state.modelSubTab2 = t.key;
                updateAllActive();
                btn.classList.add("active");
                renderContent();
            });
            row2.appendChild(btn);
        }
    } else if (state.topTab === "prompts") {
        const row1Tabs = [
            { key: "prompt-all", label: "All" },
            { key: "prompt-favorites", label: "\u2605 Favorites" },
            { key: "prompt-categories", label: "\ud83d\udcc1 Categories" },
        ];

        const activeKey = state.promptSubTab;

        for (const t of row1Tabs) {
            const btn = document.createElement("button");
            btn.className = "wfm-nlp-tab wfm-nlp-sub-tab" + (activeKey === t.key ? " active" : "");
            btn.dataset.subtab = t.key;
            btn.textContent = t.label;
            btn.addEventListener("click", () => {
                state.promptSubTab = t.key;
                updateAllActive();
                btn.classList.add("active");
                renderContent();
            });
            row1.appendChild(btn);
        }
        // No row2 tabs for prompts
    } else if (state.topTab === "workflows") {
        const row1Tabs = [
            { key: "wf-all", label: "All" },
            { key: "wf-favorites", label: "\u2605 Favorites" },
            { key: "wf-groups", label: "\ud83d\udcc1 Groups" },
        ];
        const row2Tabs = [
            { key: "wf-modeltype", label: "\u25a6 Model Type" },
        ];

        const activeKey = state.wfSubTab2 || state.wfSubTab;

        for (const t of row1Tabs) {
            const btn = document.createElement("button");
            btn.className = "wfm-nlp-tab wfm-nlp-sub-tab" + (activeKey === t.key ? " active" : "");
            btn.dataset.subtab = t.key;
            btn.textContent = t.label;
            btn.addEventListener("click", () => {
                state.wfSubTab = t.key;
                state.wfSubTab2 = null;
                updateAllActive();
                btn.classList.add("active");
                renderContent();
            });
            row1.appendChild(btn);
        }
        for (const t of row2Tabs) {
            const btn = document.createElement("button");
            btn.className = "wfm-nlp-tab wfm-nlp-sub-tab" + (activeKey === t.key ? " active" : "");
            btn.dataset.subtab = t.key;
            btn.textContent = t.label;
            btn.addEventListener("click", () => {
                state.wfSubTab2 = t.key;
                updateAllActive();
                btn.classList.add("active");
                renderContent();
            });
            row2.appendChild(btn);
        }
    } else {
        const row1Tabs = [
            { key: "all", label: "All" },
            { key: "favorites", label: "\u2733 Favorites" },
            { key: "groups", label: "\ud83d\udcc1 Groups" },
        ];
        const row2Tabs = [
            { key: "sets", label: "\u2630 Sets" },
            { key: "category", label: "\ud83d\udcc2 Category" },
            { key: "package", label: "\ud83e\udde9 Package" },
        ];

        const activeKey = state.activeTab2 || state.activeTab;

        for (const t of row1Tabs) {
            const btn = document.createElement("button");
            btn.className = "wfm-nlp-tab wfm-nlp-sub-tab" + (activeKey === t.key ? " active" : "");
            btn.dataset.subtab = t.key;
            btn.textContent = t.label;
            btn.addEventListener("click", () => {
                state.activeTab = t.key;
                state.activeTab2 = null;
                updateAllActive();
                btn.classList.add("active");
                renderContent();
            });
            row1.appendChild(btn);
        }
        for (const t of row2Tabs) {
            const btn = document.createElement("button");
            btn.className = "wfm-nlp-tab wfm-nlp-sub-tab" + (activeKey === t.key ? " active" : "");
            btn.dataset.subtab = t.key;
            btn.textContent = t.label;
            btn.addEventListener("click", () => {
                state.activeTab2 = t.key;
                updateAllActive();
                btn.classList.add("active");
                renderContent();
            });
            row2.appendChild(btn);
        }
    }
};

// ============================================
// Render content
// ============================================

const renderContent = () => {
    const content = panelEl?.querySelector(".wfm-nlp-content");
    if (!content) return;

    // Remove filter dropdowns from previous category/package views
    panelEl.querySelectorAll(".wfm-nlp-filter-row").forEach(e => e.remove());

    if (state.topTab === "models") {
        if (!state.modelsLoaded) {
            content.innerHTML = `<div class="wfm-nlp-empty">Loading...</div>`;
            return;
        }
        const modelKey = state.modelSubTab2 || state.modelSubTab;
        switch (modelKey) {
            case "model-all": renderModelAll(content); break;
            case "model-favorites": renderModelFavorites(content); break;
            case "model-groups": renderModelGroups(content); break;
            case "model-type": renderModelByType(content); break;
        }
    } else if (state.topTab === "prompts") {
        if (!state.promptLoaded) {
            content.innerHTML = `<div class="wfm-nlp-empty">Loading...</div>`;
            return;
        }
        switch (state.promptSubTab) {
            case "prompt-all": renderPromptAll(content); break;
            case "prompt-favorites": renderPromptFavorites(content); break;
            case "prompt-categories": renderPromptCategories(content); break;
        }
    } else if (state.topTab === "workflows") {
        if (!state.wfLoaded) {
            content.innerHTML = `<div class="wfm-nlp-empty">Loading...</div>`;
            return;
        }
        const key = state.wfSubTab2 || state.wfSubTab;
        switch (key) {
            case "wf-all": renderWfAll(content); break;
            case "wf-favorites": renderWfFavorites(content); break;
            case "wf-modeltype": renderWfModelType(content); break;
            case "wf-groups": renderWfGroups(content); break;
        }
    } else {
        if (!state.loaded) {
            content.innerHTML = `<div class="wfm-nlp-empty">Loading...</div>`;
            return;
        }
        const key = state.activeTab2 || state.activeTab;
        switch (key) {
            case "all": renderAllNodes(content); break;
            case "favorites": renderFavorites(content); break;
            case "sets": renderSets(content); break;
            case "groups": renderGroups(content); break;
            case "category": renderNodesByCategory(content); break;
            case "package": renderNodesByPackage(content); break;
        }
    }
};

// ============================================
// Render – Workflow sub-tabs
// ============================================

const getWfBadges = (wf) => {
    return wf.metadata?.badges || [];
};

const createDraggableWfItem = (wf) => {
    const displayName = wf.filename.replace(/\.json$/i, "");
    const types = getWfBadges(wf);
    const badge = types.length ? types.join(", ") : "";
    const fmt = wf.analysis?.format || "";
    const fmtBadge = (fmt === "api" || fmt === "app")
        ? `<span class="wfm-nlp-fmt-badge wfm-nlp-fmt-${fmt}">${fmt.toUpperCase()}</span>`
        : "";
    const starHtml = wf.metadata?.favorite
        ? `<span class="wfm-nlp-fav-star">\u2605</span>`
        : "";

    const el = document.createElement("div");
    el.className = "wfm-nlp-item";
    el.draggable = true;
    el.innerHTML = `
        <div class="wfm-nlp-item-label">${fmtBadge}${starHtml}${esc(displayName)}</div>
        ${badge ? `<div class="wfm-nlp-item-sub">${esc(badge)}</div>` : ""}
    `;

    el.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/x-wfm-workflow",
            JSON.stringify({ filename: wf.filename }));
        el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));

    // Double-click to load
    el.addEventListener("dblclick", () => loadWorkflowOnCanvas(wf.filename));

    return el;
};

const matchesWfSearch = (wf) => {
    if (!state.searchText) return true;
    const s = state.searchText;
    if (wf.filename.toLowerCase().includes(s)) return true;
    if ((wf.metadata?.tags || []).some(t => t.toLowerCase().includes(s))) return true;
    if (wf.metadata?.memo?.toLowerCase().includes(s)) return true;
    if (wf.metadata?.summary?.toLowerCase().includes(s)) return true;
    return false;
};

const renderWfAll = (container) => {
    let items = state.wfList.filter(matchesWfSearch);

    if (items.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">No matches</div>`;
        return;
    }

    container.innerHTML = "";
    for (const wf of items) {
        container.appendChild(createDraggableWfItem(wf));
    }
};

const renderWfFavorites = (container) => {
    let items = state.wfFavorites.filter(matchesWfSearch);

    if (items.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">
            ${state.wfFavorites.length === 0
                ? "No favorite workflows.<br><small>Star workflows in Workflow Studio</small>"
                : "No matches"}
        </div>`;
        return;
    }

    container.innerHTML = "";
    for (const wf of items) {
        container.appendChild(createDraggableWfItem(wf));
    }
};

const renderWfModelType = (container) => {
    container.innerHTML = "";

    if (state.wfBadgeTypes.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">
            No badges found.<br><small>Add badges to workflows in Workflow Studio</small>
        </div>`;
        return;
    }

    for (const modelType of state.wfBadgeTypes) {
        const wfs = state.wfList.filter(w => {
            return (w.metadata?.badges || []).includes(modelType);
        }).filter(matchesWfSearch);

        if (state.searchText && wfs.length === 0) continue;

        const section = document.createElement("div");
        section.className = "wfm-nlp-group-section";

        const header = document.createElement("div");
        header.className = "wfm-nlp-group-header collapsed";
        header.innerHTML = `<span>${esc(modelType)}</span> <span class="wfm-nlp-badge">${wfs.length}</span>`;
        header.addEventListener("click", () => {
            const list = section.querySelector(".wfm-nlp-group-list");
            list.style.display = list.style.display === "none" ? "block" : "none";
            header.classList.toggle("collapsed");
        });
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "wfm-nlp-group-list";
        list.style.display = "none";
        for (const wf of wfs) {
            list.appendChild(createDraggableWfItem(wf));
        }
        section.appendChild(list);
        container.appendChild(section);
    }

    if (container.children.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">No matches</div>`;
    }
};

const renderWfGroups = (container) => {
    const groupNames = Object.keys(state.wfGroups).sort();

    if (groupNames.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">
            No groups.<br><small>Create groups in Workflow Studio</small>
        </div>`;
        return;
    }

    container.innerHTML = "";

    let filtered = groupNames;
    if (state.searchText) {
        filtered = groupNames.filter(g =>
            g.toLowerCase().includes(state.searchText) ||
            (state.wfGroups[g] || []).some(f => f.toLowerCase().includes(state.searchText))
        );
    }

    for (const groupName of filtered) {
        const filenames = state.wfGroups[groupName] || [];

        const section = document.createElement("div");
        section.className = "wfm-nlp-group-section";

        const header = document.createElement("div");
        header.className = "wfm-nlp-group-header collapsed";
        header.innerHTML = `<span>${esc(groupName)}</span> <span class="wfm-nlp-badge">${filenames.length}</span>`;
        header.addEventListener("click", () => {
            const list = section.querySelector(".wfm-nlp-group-list");
            list.style.display = list.style.display === "none" ? "block" : "none";
            header.classList.toggle("collapsed");
        });
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "wfm-nlp-group-list";
        list.style.display = "none";
        for (const fn of filenames) {
            const wf = state.wfList.find(w => w.filename === fn);
            if (wf) {
                list.appendChild(createDraggableWfItem(wf));
            }
        }
        section.appendChild(list);
        container.appendChild(section);
    }

    if (container.children.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">No matches</div>`;
    }
};

// ============================================
// Render – Models sub-tabs
// ============================================

const matchesModelSearch = (name) => {
    if (!state.searchText) return true;
    const s = state.searchText;
    if (name.toLowerCase().includes(s)) return true;
    const meta = state.modelMetadata[name] || {};
    if ((meta.tags || []).some(t => t.toLowerCase().includes(s))) return true;
    if ((meta.badges || []).some(b => b.toLowerCase().includes(s))) return true;
    if ((meta.memo || "").toLowerCase().includes(s)) return true;
    return false;
};

const createModelItem = (modelName, modelType) => {
    const meta = state.modelMetadata[modelName] || {};
    const isFav = !!meta.favorite;
    const badges = (meta.badges || []);
    const tags = (meta.tags || []);

    // Stem (filename without extension)
    const lastSlash = Math.max(modelName.lastIndexOf("/"), modelName.lastIndexOf("\\"));
    const filename = lastSlash >= 0 ? modelName.substring(lastSlash + 1) : modelName;
    const dot = filename.lastIndexOf(".");
    const stem = dot >= 0 ? filename.substring(0, dot) : filename;

    const badgesHtml = badges.map(b =>
        `<span class="wfm-nlp-model-badge">${esc(b)}</span>`
    ).join("");
    const tagsHtml = tags.length
        ? `<span class="wfm-nlp-item-sub">${esc(tags.join(", "))}</span>`
        : "";

    const isEmbedding = modelType === "embedding";
    const dragTitle = isEmbedding
        ? `Drag to canvas (copies embedding:${stem})`
        : `Drag to canvas to place ${MODEL_TYPE_LABELS[modelType] || modelType} node`;

    const el = document.createElement("div");
    el.className = "wfm-nlp-item wfm-nlp-model-item";
    el.draggable = true;
    el.title = `${modelName}\n${dragTitle}`;
    el.innerHTML = `
        <div class="wfm-nlp-item-row">
            <div class="wfm-nlp-item-body">
                <div class="wfm-nlp-item-label">
                    ${isFav ? '<span style="color:#ffd700;margin-right:3px;">&#9733;</span>' : ""}${esc(stem)}
                </div>
                ${badgesHtml ? `<div class="wfm-nlp-model-badges">${badgesHtml}</div>` : ""}
                ${tagsHtml}
            </div>
            <button class="wfm-nlp-copy-btn wfm-nlp-model-copy" title="Copy model name">C</button>
        </div>
    `;

    el.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/x-wfm-model",
            JSON.stringify({ modelName, modelType }));
        el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));

    // Double-click: place node immediately at canvas center
    el.addEventListener("dblclick", () => placeModelNode(modelName, modelType));

    el.querySelector(".wfm-nlp-model-copy").addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(stem).then(() => {
            showToast("Copied: " + stem, "success");
        });
    });

    return el;
};

const renderModelAll = async (container) => {
    container.innerHTML = `<div class="wfm-nlp-empty">Loading...</div>`;

    // Fetch all model types in parallel
    const results = await Promise.all(
        MODEL_TYPES.map(async (type) => {
            const list = await fetchModelList(type);
            return { type, list };
        })
    );

    // Flatten: [{name, type}]
    const allModels = [];
    for (const { type, list } of results) {
        for (const name of list) {
            allModels.push({ name, type });
        }
    }

    const filtered = allModels.filter(m => matchesModelSearch(m.name));

    if (filtered.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">${allModels.length === 0 ? "No models found." : "No matches"}</div>`;
        return;
    }

    container.innerHTML = "";
    for (const m of filtered) {
        const item = createModelItem(m.name, m.type);
        const typeLabel = MODEL_TYPE_LABELS[m.type] || m.type;
        const typeBadgeEl = item.querySelector(".wfm-nlp-item-body");
        if (typeBadgeEl) {
            const tb = document.createElement("span");
            tb.className = "wfm-nlp-model-type-badge";
            tb.textContent = typeLabel;
            typeBadgeEl.prepend(tb);
        }
        container.appendChild(item);
    }
};

const renderModelByType = async (container) => {
    container.innerHTML = `<div class="wfm-nlp-empty">Loading...</div>`;

    const results = await Promise.all(
        MODEL_TYPES.map(async (type) => {
            const list = await fetchModelList(type);
            return { type, list };
        })
    );

    container.innerHTML = "";
    let hasAny = false;

    for (const { type, list } of results) {
        const filtered = list.filter(name => matchesModelSearch(name));
        if (state.searchText && filtered.length === 0) continue;
        if (list.length === 0) continue;

        hasAny = true;
        const typeLabel = MODEL_TYPE_LABELS[type] || type;
        const section = document.createElement("div");
        section.className = "wfm-nlp-group-section";

        const header = document.createElement("div");
        header.className = "wfm-nlp-group-header collapsed";
        header.innerHTML = `<span>${esc(typeLabel)}</span> <span class="wfm-nlp-badge">${filtered.length}</span>`;
        header.addEventListener("click", () => {
            const listEl = section.querySelector(".wfm-nlp-group-list");
            listEl.style.display = listEl.style.display === "none" ? "block" : "none";
            header.classList.toggle("collapsed");
        });
        section.appendChild(header);

        const listEl = document.createElement("div");
        listEl.className = "wfm-nlp-group-list";
        listEl.style.display = "none";
        for (const name of filtered) {
            listEl.appendChild(createModelItem(name, type));
        }
        section.appendChild(listEl);
        container.appendChild(section);
    }

    if (!hasAny) {
        container.innerHTML = `<div class="wfm-nlp-empty">No models found.</div>`;
    }
};

const renderModelFavorites = async (container) => {
    container.innerHTML = `<div class="wfm-nlp-empty">Loading...</div>`;

    // Fetch all models and check against metadata favorites
    const results = await Promise.all(
        MODEL_TYPES.map(async (type) => {
            const list = await fetchModelList(type);
            return { type, list };
        })
    );

    const favorites = [];
    for (const { type, list } of results) {
        for (const name of list) {
            if (state.modelMetadata[name]?.favorite) {
                favorites.push({ name, type });
            }
        }
    }

    const filtered = favorites.filter(m => matchesModelSearch(m.name));

    if (filtered.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">${favorites.length === 0 ? "No favorites yet." : "No matches"}</div>`;
        return;
    }

    container.innerHTML = "";
    for (const m of filtered) {
        const item = createModelItem(m.name, m.type);
        const typeLabel = MODEL_TYPE_LABELS[m.type] || m.type;
        const typeBadgeEl = item.querySelector(".wfm-nlp-item-body");
        if (typeBadgeEl) {
            const tb = document.createElement("span");
            tb.className = "wfm-nlp-model-type-badge";
            tb.textContent = typeLabel;
            typeBadgeEl.prepend(tb);
        }
        container.appendChild(item);
    }
};

const renderModelGroups = async (container) => {
    container.innerHTML = `<div class="wfm-nlp-empty">Loading...</div>`;

    // allGroups is { type: { groupName: [modelName, ...] } }
    const allGroups = state.modelGroups;

    // Flatten into [{ modelType, groupName, members }]
    const flatGroups = [];
    for (const [modelType, groups] of Object.entries(allGroups)) {
        if (typeof groups !== "object" || Array.isArray(groups)) continue;
        for (const [groupName, members] of Object.entries(groups)) {
            if (Array.isArray(members) && members.length > 0) {
                flatGroups.push({ modelType, groupName, members });
            }
        }
    }

    if (flatGroups.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">No groups found.</div>`;
        return;
    }

    // Build name→type lookup by fetching all models once
    const results = await Promise.all(
        MODEL_TYPES.map(async (type) => {
            const list = await fetchModelList(type);
            return { type, list };
        })
    );
    const typeOf = {};
    for (const { type, list } of results) {
        for (const name of list) typeOf[name] = type;
    }

    container.innerHTML = "";
    let hasAny = false;

    for (const { modelType, groupName, members } of flatGroups) {
        const filtered = members.filter(name => matchesModelSearch(name));
        if (state.searchText && filtered.length === 0) continue;

        hasAny = true;
        const section = document.createElement("div");
        section.className = "wfm-nlp-group-section";

        const typeLabel = MODEL_TYPE_LABELS[modelType] || modelType;
        const header = document.createElement("div");
        header.className = "wfm-nlp-group-header collapsed";
        header.innerHTML = `<span class="wfm-nlp-model-type-badge">[${esc(typeLabel)}]</span> <span>${esc(groupName)}</span> <span class="wfm-nlp-badge">${filtered.length}</span>`;
        header.addEventListener("click", () => {
            const listEl = section.querySelector(".wfm-nlp-group-list");
            listEl.style.display = listEl.style.display === "none" ? "block" : "none";
            header.classList.toggle("collapsed");
        });
        section.appendChild(header);

        const listEl = document.createElement("div");
        listEl.className = "wfm-nlp-group-list";
        listEl.style.display = "none";
        for (const name of filtered) {
            const type = typeOf[name] || modelType;
            const item = createModelItem(name, type);
            listEl.appendChild(item);
        }
        section.appendChild(listEl);
        container.appendChild(section);
    }

    if (!hasAny) {
        container.innerHTML = `<div class="wfm-nlp-empty">No matches.</div>`;
    }
};

// ============================================
// Render – Prompt sub-tabs
// ============================================

const matchesPromptSearch = (p) => {
    if (!state.searchText) return true;
    const s = state.searchText;
    if ((p.name || "").toLowerCase().includes(s)) return true;
    if ((p.text || "").toLowerCase().includes(s)) return true;
    if ((p.category || "").toLowerCase().includes(s)) return true;
    if ((p.tags || []).some(t => t.toLowerCase().includes(s))) return true;
    return false;
};

const createDraggablePromptItem = (prompt) => {
    const el = document.createElement("div");
    el.className = "wfm-nlp-item wfm-nlp-prompt-item";
    el.draggable = true;

    const previewText = (prompt.text || "").length > 60
        ? prompt.text.substring(0, 60) + "..."
        : (prompt.text || "");

    const hasNeg = (prompt.negText || "").trim();

    el.innerHTML = `
        <div class="wfm-nlp-item-row">
            <div class="wfm-nlp-item-body">
                <div class="wfm-nlp-item-label">${prompt.favorite ? '<span style="color:#ffd700;margin-right:3px;">\u2605</span>' : ""}${esc(prompt.name)}</div>
                <div class="wfm-nlp-item-sub">${esc(previewText)}</div>
            </div>
            <div class="wfm-nlp-copy-btns">
                <button class="wfm-nlp-copy-btn wfm-nlp-copy-pos" title="Copy Positive">P</button>
                ${hasNeg ? '<button class="wfm-nlp-copy-btn wfm-nlp-copy-neg" title="Copy Negative">N</button>' : ""}
            </div>
        </div>
    `;

    // Copy positive
    el.querySelector(".wfm-nlp-copy-pos").addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(prompt.text || "").then(() => {
            showToast("Positive copied", "success");
        }).catch(() => {
            showToast("Failed to copy", "error");
        });
    });

    // Copy negative
    if (hasNeg) {
        el.querySelector(".wfm-nlp-copy-neg").addEventListener("click", (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(prompt.negText || "").then(() => {
                showToast("Negative copied", "success");
            }).catch(() => {
                showToast("Failed to copy", "error");
            });
        });
    }

    el.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/x-wfm-prompt",
            JSON.stringify({ id: prompt.id, text: prompt.text, negText: prompt.negText || "", name: prompt.name }));
        el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));

    // Double-click to place on canvas
    el.addEventListener("dblclick", () => placePromptNode(prompt.text, prompt.negText || "", prompt.name));

    return el;
};

const renderPromptAll = (container) => {
    let items = state.promptList.filter(matchesPromptSearch);

    if (items.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">
            ${state.promptList.length === 0
                ? 'No prompts yet.<br><small>Create prompts in Workflow Studio</small>'
                : 'No matches'}
        </div>`;
        return;
    }

    container.innerHTML = "";
    for (const p of items) {
        container.appendChild(createDraggablePromptItem(p));
    }
};

const renderPromptFavorites = (container) => {
    let items = state.promptFavorites.filter(matchesPromptSearch);

    if (items.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">
            ${state.promptFavorites.length === 0
                ? 'No favorite prompts.<br><small>Star prompts to add them here</small>'
                : 'No matches'}
        </div>`;
        return;
    }

    container.innerHTML = "";
    for (const p of items) {
        container.appendChild(createDraggablePromptItem(p));
    }
};

const renderPromptCategories = (container) => {
    container.innerHTML = "";

    if (state.promptCategories.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">
            No categories.<br><small>Set categories when creating prompts</small>
        </div>`;
        return;
    }

    for (const cat of state.promptCategories) {
        const prompts = state.promptList
            .filter(p => (p.category || "").trim() === cat)
            .filter(matchesPromptSearch);

        if (state.searchText && prompts.length === 0) continue;

        const section = document.createElement("div");
        section.className = "wfm-nlp-group-section";

        const header = document.createElement("div");
        header.className = "wfm-nlp-group-header collapsed";
        header.innerHTML = `<span>${esc(cat)}</span> <span class="wfm-nlp-badge">${prompts.length}</span>`;
        header.addEventListener("click", () => {
            const list = section.querySelector(".wfm-nlp-group-list");
            list.style.display = list.style.display === "none" ? "block" : "none";
            header.classList.toggle("collapsed");
        });
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "wfm-nlp-group-list";
        list.style.display = "none";
        for (const p of prompts) {
            list.appendChild(createDraggablePromptItem(p));
        }
        section.appendChild(list);
        container.appendChild(section);
    }

    // Uncategorized prompts
    const uncategorized = state.promptList
        .filter(p => !(p.category || "").trim())
        .filter(matchesPromptSearch);

    if (uncategorized.length > 0) {
        const section = document.createElement("div");
        section.className = "wfm-nlp-group-section";

        const header = document.createElement("div");
        header.className = "wfm-nlp-group-header collapsed";
        header.innerHTML = `<span>Uncategorized</span> <span class="wfm-nlp-badge">${uncategorized.length}</span>`;
        header.addEventListener("click", () => {
            const list = section.querySelector(".wfm-nlp-group-list");
            list.style.display = list.style.display === "none" ? "block" : "none";
            header.classList.toggle("collapsed");
        });
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "wfm-nlp-group-list";
        list.style.display = "none";
        for (const p of uncategorized) {
            list.appendChild(createDraggablePromptItem(p));
        }
        section.appendChild(list);
        container.appendChild(section);
    }

    if (container.children.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">No matches</div>`;
    }
};

// ============================================
// Render – Node sub-tabs (existing)
// ============================================

const renderAllNodes = (container) => {
    const registered = typeof LiteGraph !== "undefined" ? LiteGraph.registered_node_types : {};
    let nodeNames = Object.keys(registered).sort();

    if (state.searchText) {
        nodeNames = nodeNames.filter(n => n.toLowerCase().includes(state.searchText));
    }

    if (nodeNames.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">No matches</div>`;
        return;
    }

    container.innerHTML = "";
    for (const name of nodeNames) {
        const isFav = state.metadata[name]?.favorite;
        const label = isFav
            ? `<span class="wfm-nlp-fav-star">\u2605</span>${esc(name)}`
            : esc(name);
        const el = createDraggableItem(label, "single", { classType: name });
        el.addEventListener("dblclick", () => placeSingleNode(name));
        container.appendChild(el);
    }
};

const renderFavorites = (container) => {
    let items = state.favorites;
    if (state.searchText) {
        items = items.filter(n => n.name.toLowerCase().includes(state.searchText));
    }

    if (items.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">
            ${state.favorites.length === 0 ? "No favorites yet.<br><small>Star nodes in Workflow Studio \u2192 Nodes tab</small>" : "No matches"}
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
            ${state.nodeSets.length === 0 ? "No node sets.<br><small>Create sets in Workflow Studio \u2192 Nodes tab</small>" : "No matches"}
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
            No groups.<br><small>Create groups in Workflow Studio \u2192 Nodes tab</small>
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
        header.className = "wfm-nlp-group-header collapsed";
        header.innerHTML = `<span>${esc(groupName)}</span> <span class="wfm-nlp-badge">${nodes.length}</span>`;
        header.addEventListener("click", () => {
            const list = section.querySelector(".wfm-nlp-group-list");
            list.style.display = list.style.display === "none" ? "block" : "none";
            header.classList.toggle("collapsed");
        });
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "wfm-nlp-group-list";
        list.style.display = "none";
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
// Render – Nodes by Category / Package
// ============================================

const getNodeCategory = (nodeType) => {
    const info = state.objectInfo[nodeType];
    if (info?.category) return info.category.split("/")[0] || "uncategorized";
    // Fallback: LiteGraph type string often contains category as prefix
    const def = typeof LiteGraph !== "undefined"
        ? LiteGraph.registered_node_types[nodeType]
        : null;
    const cat = def?.category || "";
    return cat.split("/")[0] || "uncategorized";
};

const getNodePackage = (nodeType) => {
    const info = state.objectInfo[nodeType];
    if (!info) return "ComfyUI (Built-in)";
    return extractPackageName(info.python_module || "");
};

const renderNodesByCategory = (container) => {
    const registered = typeof LiteGraph !== "undefined" ? LiteGraph.registered_node_types : {};
    const nodeNames = Object.keys(registered).sort();

    // Build category list
    const catSet = new Set();
    nodeNames.forEach(n => catSet.add(getNodeCategory(n)));
    const categories = [...catSet].sort();

    // Insert dropdown above content (remove old one first)
    container.parentNode.querySelectorAll(".wfm-nlp-filter-row").forEach(e => e.remove());
    const wrap = document.createElement("div");
    wrap.className = "wfm-nlp-filter-row";
    wrap.style.cssText = "padding:6px 8px;border-bottom:1px solid var(--border-color,#4e4e4e);flex-shrink:0;";
    const sel = document.createElement("select");
    sel.style.cssText = "width:100%;padding:4px 6px;background:var(--comfy-input-bg,#2a2a2a);border:1px solid var(--border-color,#4e4e4e);border-radius:3px;color:var(--input-text,#ddd);font-size:12px;";
    sel.innerHTML = `<option value="">-- All Categories --</option>` +
        categories.map(c => `<option value="${esc(c)}"${c === state.activeNodeCategory ? " selected" : ""}>${esc(c)}</option>`).join("");
    sel.addEventListener("change", () => {
        state.activeNodeCategory = sel.value;
        renderNodesByCategoryList(container);
    });
    wrap.appendChild(sel);
    container.parentNode.insertBefore(wrap, container);

    renderNodesByCategoryList(container);
};

const renderNodesByCategoryList = (container) => {
    const registered = typeof LiteGraph !== "undefined" ? LiteGraph.registered_node_types : {};
    let nodeNames = Object.keys(registered).sort();

    if (state.activeNodeCategory) {
        nodeNames = nodeNames.filter(n => getNodeCategory(n) === state.activeNodeCategory);
    }
    if (state.searchText) {
        nodeNames = nodeNames.filter(n => n.toLowerCase().includes(state.searchText));
    }

    container.innerHTML = "";
    if (nodeNames.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">No nodes found</div>`;
        return;
    }
    for (const name of nodeNames) {
        const isFav = state.metadata[name]?.favorite;
        const label = isFav ? `<span class="wfm-nlp-fav-star">\u2605</span>${esc(name)}` : esc(name);
        const el = createDraggableItem(label, "single", { classType: name });
        el.addEventListener("dblclick", () => placeSingleNode(name));
        container.appendChild(el);
    }
};

const renderNodesByPackage = (container) => {
    const registered = typeof LiteGraph !== "undefined" ? LiteGraph.registered_node_types : {};
    const nodeNames = Object.keys(registered).sort();

    // Build package list
    const pkgSet = new Set();
    nodeNames.forEach(n => pkgSet.add(getNodePackage(n)));
    const packages = [...pkgSet].sort();

    // Insert dropdown above content (remove old one first)
    container.parentNode.querySelectorAll(".wfm-nlp-filter-row").forEach(e => e.remove());
    const wrap = document.createElement("div");
    wrap.className = "wfm-nlp-filter-row";
    wrap.style.cssText = "padding:6px 8px;border-bottom:1px solid var(--border-color,#4e4e4e);flex-shrink:0;";
    const sel = document.createElement("select");
    sel.style.cssText = "width:100%;padding:4px 6px;background:var(--comfy-input-bg,#2a2a2a);border:1px solid var(--border-color,#4e4e4e);border-radius:3px;color:var(--input-text,#ddd);font-size:12px;";
    sel.innerHTML = `<option value="">-- All Packages --</option>` +
        packages.map(p => `<option value="${esc(p)}"${p === state.activeNodePackage ? " selected" : ""}>${esc(p)}</option>`).join("");
    sel.addEventListener("change", () => {
        state.activeNodePackage = sel.value;
        renderNodesByPackageList(container);
    });
    wrap.appendChild(sel);
    container.parentNode.insertBefore(wrap, container);

    renderNodesByPackageList(container);
};

const renderNodesByPackageList = (container) => {
    const registered = typeof LiteGraph !== "undefined" ? LiteGraph.registered_node_types : {};
    let nodeNames = Object.keys(registered).sort();

    if (state.activeNodePackage) {
        nodeNames = nodeNames.filter(n => getNodePackage(n) === state.activeNodePackage);
    }
    if (state.searchText) {
        nodeNames = nodeNames.filter(n => n.toLowerCase().includes(state.searchText));
    }

    container.innerHTML = "";
    if (nodeNames.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">No nodes found</div>`;
        return;
    }
    for (const name of nodeNames) {
        const isFav = state.metadata[name]?.favorite;
        const label = isFav ? `<span class="wfm-nlp-fav-star">\u2605</span>${esc(name)}` : esc(name);
        const el = createDraggableItem(label, "single", { classType: name });
        el.addEventListener("dblclick", () => placeSingleNode(name));
        container.appendChild(el);
    }
};

// ============================================
// Draggable item factory (nodes)
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

    if (state.visible) {
        // Load data for current top tab
        if (state.topTab === "workflows" && !state.wfLoaded) {
            await loadWfData();
        } else if (state.topTab === "nodes" && !state.loaded) {
            await loadData();
        } else if (state.topTab === "prompts" && !state.promptLoaded) {
            await loadPromptData();
        } else if (state.topTab === "models" && !state.modelsLoaded) {
            await loadModelsData();
        }
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
            width: 310px;
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
        .wfm-nlp-subtabs {
            display: flex;
            border-bottom: 1px solid var(--border-color, #4e4e4e);
            flex-shrink: 0;
            background: var(--comfy-input-bg, #2a2a2a);
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
        .wfm-nlp-top-tab {
            font-size: 12px;
            font-weight: 600;
            padding: 9px 4px;
        }
        .wfm-nlp-sub-tab {
            font-size: 10px;
            padding: 6px 4px;
        }
        .wfm-nlp-search {
            padding: 8px;
            border-bottom: 1px solid var(--border-color, #4e4e4e);
            flex-shrink: 0;
        }
        .wfm-nlp-subtabs-row2 {
            border-bottom: 1px solid var(--border-color, #4e4e4e);
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
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .wfm-nlp-item-sub {
            font-size: 10px;
            color: var(--descrip-text, #888);
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .wfm-nlp-fmt-badge {
            display: inline-block;
            font-size: 9px;
            font-weight: bold;
            padding: 1px 4px;
            border-radius: 3px;
            margin-right: 4px;
            vertical-align: middle;
            line-height: 1.2;
        }
        .wfm-nlp-fmt-api {
            background: #e74c3c;
            color: #fff;
        }
        .wfm-nlp-fmt-app {
            background: #e67e22;
            color: #fff;
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
        .wfm-nlp-item-row {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .wfm-nlp-item-body {
            flex: 1;
            min-width: 0;
        }
        .wfm-nlp-copy-btns {
            display: flex;
            gap: 2px;
            flex-shrink: 0;
            opacity: 0;
            transition: opacity 0.15s;
        }
        .wfm-nlp-prompt-item:hover .wfm-nlp-copy-btns {
            opacity: 1;
        }
        .wfm-nlp-copy-btn {
            background: none;
            border: 1px solid var(--border-color, #555);
            color: var(--descrip-text, #888);
            font-size: 10px;
            font-weight: 600;
            cursor: pointer;
            padding: 1px 5px;
            border-radius: 3px;
            transition: background 0.15s, color 0.15s;
            line-height: 1.4;
        }
        .wfm-nlp-copy-pos:hover {
            background: rgba(46,213,115,0.25);
            color: #2ed573;
            border-color: #2ed573;
        }
        .wfm-nlp-copy-neg:hover {
            background: rgba(255,71,87,0.25);
            color: #ff4757;
            border-color: #ff4757;
        }
        .wfm-nlp-model-item { cursor: default; }
        .wfm-nlp-model-item:hover .wfm-nlp-copy-btns { opacity: 1; }
        .wfm-nlp-model-copy:hover {
            background: rgba(74,158,255,0.25);
            color: #4a9eff;
            border-color: #4a9eff;
        }
        .wfm-nlp-fav-star {
            color: #f5c518;
            font-size: 11px;
            margin-right: 3px;
            vertical-align: middle;
            line-height: 1;
        }
        .wfm-nlp-model-type-badge {
            display: inline-block;
            font-size: 9px;
            font-weight: bold;
            padding: 1px 5px;
            border-radius: 3px;
            background: rgba(74,158,255,0.25);
            color: #4a9eff;
            margin-bottom: 2px;
            vertical-align: middle;
        }
        .wfm-nlp-model-badges {
            display: flex;
            flex-wrap: wrap;
            gap: 3px;
            margin-top: 2px;
        }
        .wfm-nlp-model-badge {
            display: inline-block;
            font-size: 9px;
            padding: 1px 5px;
            border-radius: 10px;
            background: rgba(255,255,255,0.12);
            color: var(--descrip-text, #aaa);
        }
        .wfm-nlp-theme-btn {
            background: none;
            border: none;
            color: var(--input-text, #ddd);
            font-size: 15px;
            cursor: pointer;
            opacity: 0.7;
            padding: 0 2px;
            line-height: 1;
        }
        .wfm-nlp-theme-btn:hover { opacity: 1; }
        .wfm-nlp-theme-panel {
            border-bottom: 1px solid var(--border-color, #4e4e4e);
            background: var(--comfy-input-bg, #2a2a2a);
            padding: 10px 12px;
            flex-shrink: 0;
        }
        .wfm-nlp-theme-title {
            font-size: 11px;
            font-weight: 600;
            color: var(--input-text, #ddd);
            margin-bottom: 8px;
            opacity: 0.8;
        }
        .wfm-nlp-theme-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
        }
        .wfm-nlp-theme-label {
            font-size: 11px;
            color: var(--descrip-text, #aaa);
            flex: 1;
            white-space: nowrap;
        }
        .wfm-nlp-theme-color {
            width: 32px;
            height: 22px;
            border: 1px solid var(--border-color, #555);
            border-radius: 3px;
            padding: 1px;
            cursor: pointer;
            background: transparent;
        }
        .wfm-nlp-theme-actions {
            display: flex;
            gap: 6px;
            margin-top: 8px;
            justify-content: flex-end;
        }
        .wfm-nlp-theme-save-btn, .wfm-nlp-theme-reset-btn {
            font-size: 11px;
            padding: 3px 10px;
            border-radius: 3px;
            cursor: pointer;
            border: 1px solid var(--border-color, #555);
        }
        .wfm-nlp-theme-save-btn {
            background: #4a9eff;
            color: #fff;
            border-color: #4a9eff;
        }
        .wfm-nlp-theme-save-btn:hover { background: #3a8eef; }
        .wfm-nlp-theme-reset-btn {
            background: none;
            color: var(--descrip-text, #aaa);
        }
        .wfm-nlp-theme-reset-btn:hover { color: var(--input-text, #ddd); }
    `;
    document.head.appendChild(style);
};

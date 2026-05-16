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
    // Info (Metadata) tab
    infoSubTab: "info-model",   // "info-model" | "info-lora" | "info-prompt"
    infoMeta: null,             // parsed metadata from dropped file
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
            <button class="wfm-nlp-tab wfm-nlp-top-tab active" data-toptab="workflows" title="Workflows">W</button>
            <button class="wfm-nlp-tab wfm-nlp-top-tab" data-toptab="nodes" title="Nodes">N</button>
            <button class="wfm-nlp-tab wfm-nlp-top-tab" data-toptab="prompts" title="Prompts">P</button>
            <button class="wfm-nlp-tab wfm-nlp-top-tab" data-toptab="models" title="Models">M</button>
            <button class="wfm-nlp-tab wfm-nlp-top-tab" data-toptab="info" title="Information (Metadata)">I</button>
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
                const placeholders = { workflows: "Search workflows...", nodes: "Search nodes...", prompts: "Search prompts...", models: "Search models...", info: "" };
                searchInput.placeholder = placeholders[tab] ?? "Search...";
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

    if (state.topTab === "info") {
        const row1Tabs = [
            { key: "info-model", label: "model" },
            { key: "info-lora",  label: "lora" },
            { key: "info-prompt", label: "Prompts" },
        ];
        const activeKey = state.infoSubTab;
        for (const t of row1Tabs) {
            const btn = document.createElement("button");
            btn.className = "wfm-nlp-tab wfm-nlp-sub-tab" + (activeKey === t.key ? " active" : "");
            btn.dataset.subtab = t.key;
            btn.textContent = t.label;
            btn.addEventListener("click", () => {
                state.infoSubTab = t.key;
                updateAllActive();
                btn.classList.add("active");
                renderInfoSubContent();
            });
            row1.appendChild(btn);
        }
    } else if (state.topTab === "models") {
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

    // Show/hide search bar and adjust overflow for info tab
    const searchEl = panelEl?.querySelector(".wfm-nlp-search");
    if (state.topTab === "info") {
        if (searchEl) searchEl.style.display = "none";
        content.style.overflowY = "hidden";
        content.style.padding = "0";
        renderInfoTab(content);
        return;
    } else {
        if (searchEl) searchEl.style.display = "";
        content.style.overflowY = "auto";
        content.style.padding = "4px 0";
    }

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
// Info Tab – Metadata Parsing (ported from metadata-tab.js)
// ============================================

const INFO_MAX_FILE_SIZE = 50 * 1024 * 1024;

function _sanitizeJSON(text) {
    return text
        .replace(/-Infinity\b/g, "null")
        .replace(/\bInfinity\b/g, "null")
        .replace(/\bNaN\b/g, "null");
}

async function _readWebPEXIFChunk(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const ascii = new TextDecoder("latin1");
    if (bytes.byteLength < 12) return null;
    if (ascii.decode(bytes.slice(0, 4)) !== "RIFF") return null;
    if (ascii.decode(bytes.slice(8, 12)) !== "WEBP") return null;
    let offset = 12;
    while (offset + 8 <= buffer.byteLength) {
        const fourcc = ascii.decode(bytes.slice(offset, offset + 4));
        const chunkSize = view.getUint32(offset + 4, true);
        if (fourcc === "EXIF") return bytes.slice(offset + 8, offset + 8 + chunkSize);
        offset += 8 + chunkSize;
        if (chunkSize % 2 === 1) offset++;
    }
    return null;
}

function _extractWorkflowFromEXIF(exifBytes) {
    const utf8 = new TextDecoder("utf-8", { fatal: false });
    const text = utf8.decode(exifBytes);
    for (const key of ["workflow:", "prompt:"]) {
        const idx = text.indexOf(key + "{");
        if (idx < 0) continue;
        let jsonStr = text.slice(idx + key.length);
        const nullIdx = jsonStr.indexOf("\x00");
        if (nullIdx >= 0) jsonStr = jsonStr.slice(0, nullIdx);
        try { return JSON.parse(_sanitizeJSON(jsonStr)); } catch {
            const lb = jsonStr.lastIndexOf("}");
            if (lb > 0) { try { return JSON.parse(_sanitizeJSON(jsonStr.slice(0, lb + 1))); } catch {} }
        }
    }
    return null;
}

function _findNull(arr, start = 0) {
    for (let i = start; i < arr.length; i++) if (arr[i] === 0) return i;
    return -1;
}
function _parseTEXtChunk(data, latin1) {
    const np = _findNull(data);
    if (np === -1) return null;
    return { keyword: latin1.decode(data.slice(0, np)), text: latin1.decode(data.slice(np + 1)) };
}
function _parseITXtChunk(data, latin1, utf8) {
    const np = _findNull(data);
    if (np === -1) return null;
    const keyword = latin1.decode(data.slice(0, np));
    let pos = np + 3;
    pos = _findNull(data, pos); if (pos === -1) return null; pos++;
    pos = _findNull(data, pos); if (pos === -1) return null; pos++;
    return { keyword, text: utf8.decode(data.slice(pos)) };
}
async function _readAllPNGTextChunks(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIG[i]) return null;
    const view = new DataView(buffer);
    const latin1 = new TextDecoder("latin1");
    const utf8 = new TextDecoder("utf-8");
    let offset = 8;
    const chunks = {};
    while (offset + 12 <= buffer.byteLength) {
        const length = view.getUint32(offset);
        if (offset + 12 + length > buffer.byteLength) break;
        const type = latin1.decode(bytes.slice(offset + 4, offset + 8));
        const data = bytes.slice(offset + 8, offset + 8 + length);
        if (type === "tEXt") { const c = _parseTEXtChunk(data, latin1); if (c) chunks[c.keyword] = c.text; }
        else if (type === "iTXt") { const c = _parseITXtChunk(data, latin1, utf8); if (c) chunks[c.keyword] = c.text; }
        offset += 12 + length;
    }
    return chunks;
}

function _collectUnique(arr) {
    const seen = new Set(), out = [];
    for (const v of arr) { if (v && typeof v === "string" && !seen.has(v)) { seen.add(v); out.push(v); } }
    return out;
}
function _collectAllNodes(wf) {
    if (!Array.isArray(wf.nodes)) return [];
    const all = [...wf.nodes];
    for (const sg of wf.definitions?.subgraphs ?? []) if (Array.isArray(sg.nodes)) all.push(...sg.nodes);
    return all;
}
const _META_NODE_TYPES = new Set(["ImageMetadataCheckpointLoader", "ImageMetadataPromptLoader"]);
const _VAE_NONE = "None";

function _extractCheckpoints(wf) {
    if (!wf || typeof wf !== "object") return [];
    if (Array.isArray(wf.nodes)) return _collectUnique(_collectAllNodes(wf).filter(n => n.type?.toLowerCase().includes("checkpoint") || _META_NODE_TYPES.has(n.type)).map(n => n.widgets_values?.[0]));
    return _collectUnique(Object.values(wf).filter(n => n?.class_type?.toLowerCase().includes("checkpoint") || _META_NODE_TYPES.has(n?.class_type)).map(n => n.inputs?.ckpt_name));
}
function _extractVAEs(wf) {
    if (!wf || typeof wf !== "object") return [];
    if (Array.isArray(wf.nodes)) return _collectUnique(_collectAllNodes(wf).flatMap(n => { if (n.type === "VAELoader") return [n.widgets_values?.[0]]; if (_META_NODE_TYPES.has(n.type ?? "")) { const v = n.widgets_values?.[1]; return v && v !== _VAE_NONE ? [v] : []; } return []; }));
    return _collectUnique(Object.values(wf).flatMap(n => { if (!n || typeof n !== "object") return []; if (n.class_type === "VAELoader") return [n.inputs?.vae_name]; if (_META_NODE_TYPES.has(n.class_type ?? "")) { const v = n.inputs?.vae_name; return v && v !== _VAE_NONE ? [v] : []; } return []; }));
}
function _extractDiffusionModels(wf) {
    if (!wf || typeof wf !== "object") return [];
    if (Array.isArray(wf.nodes)) return _collectUnique(_collectAllNodes(wf).filter(n => n.type === "UNETLoader").map(n => n.widgets_values?.[0]));
    return _collectUnique(Object.values(wf).filter(n => n?.class_type === "UNETLoader").map(n => n.inputs?.unet_name));
}
function _extractTextEncoders(wf) {
    if (!wf || typeof wf !== "object") return [];
    const names = [];
    if (Array.isArray(wf.nodes)) {
        for (const n of _collectAllNodes(wf)) {
            if (n.type === "CLIPLoader") { if (n.widgets_values?.[0]) names.push(n.widgets_values[0]); }
            else if (n.type === "DualCLIPLoader") { [0,1].forEach(i => { if (n.widgets_values?.[i]) names.push(n.widgets_values[i]); }); }
            else if (n.type === "TripleCLIPLoader") { [0,1,2].forEach(i => { if (n.widgets_values?.[i]) names.push(n.widgets_values[i]); }); }
        }
    } else {
        for (const n of Object.values(wf)) {
            if (!n || typeof n !== "object") continue;
            const ct = n.class_type ?? "";
            if (ct === "CLIPLoader") { if (n.inputs?.clip_name) names.push(n.inputs.clip_name); }
            else if (ct === "DualCLIPLoader") { if (n.inputs?.clip_name1) names.push(n.inputs.clip_name1); if (n.inputs?.clip_name2) names.push(n.inputs.clip_name2); }
            else if (ct === "TripleCLIPLoader") { ["clip_name1","clip_name2","clip_name3"].forEach(k => { if (n.inputs?.[k]) names.push(n.inputs[k]); }); }
        }
    }
    return _collectUnique(names);
}
function _extractLoRAs(wf) {
    if (!wf || typeof wf !== "object") return [];
    const results = [], seen = new Set();
    function add(name, sm, sc) {
        if (!name || typeof name !== "string" || name === "None" || seen.has(name)) return;
        seen.add(name);
        results.push({ name, strength_model: typeof sm === "number" ? sm : 1.0, strength_clip: typeof sc === "number" ? sc : 1.0 });
    }
    if (Array.isArray(wf.nodes)) {
        for (const n of _collectAllNodes(wf)) {
            const type = n.type ?? "";
            if (type === "LoraLoader") add(n.widgets_values?.[0], n.widgets_values?.[1], n.widgets_values?.[2]);
            else if (type === "LoraLoaderModelOnly") add(n.widgets_values?.[0], n.widgets_values?.[1], 1.0);
            else if (type === "ImageMetadataLoRALoader") { for (let i = 0; i < 3; i++) add(n.widgets_values?.[i*3], n.widgets_values?.[i*3+1], n.widgets_values?.[i*3+2]); }
            else if (type === "Lora Loader (LoraManager)") { const list = n.widgets_values?.find(v => Array.isArray(v)); if (list) for (const l of list) { if (l?.active !== false) add(l?.name, l?.strength ?? 1.0, l?.clipStrength ?? l?.strength ?? 1.0); } }
        }
    } else {
        for (const n of Object.values(wf)) {
            if (!n || typeof n !== "object") continue;
            const ct = n.class_type ?? "";
            if (ct === "LoraLoader") add(n.inputs?.lora_name, n.inputs?.strength_model, n.inputs?.strength_clip);
            else if (ct === "LoraLoaderModelOnly") add(n.inputs?.lora_name, n.inputs?.strength, 1.0);
        }
    }
    return results;
}

function _isTextEncoderNode(ct) { return ct === "CLIPTextEncode" || ct.includes("TextEncode") || ct.includes("TextEncoderSD"); }
function _isSamplerNode(ct) { return ct === "KSampler" || ct === "KSamplerAdvanced" || ct.includes("KSampler") || ct.includes("Sampler"); }
function _isPromptStylerNode(ct) { return ct.includes("PromptStyler"); }

function _extractPromptsFromNodeSet(nodes, links) {
    const nodeMap = new Map();
    for (const n of nodes) nodeMap.set(n.id, n);
    const linkOrigin = new Map(), linkSlot = new Map();
    if (Array.isArray(links)) {
        for (const lk of links) {
            if (Array.isArray(lk)) { linkOrigin.set(lk[0], lk[1]); linkSlot.set(lk[0], lk[2] ?? 0); }
            else if (lk && typeof lk === "object") { const id = lk.id ?? lk[0], origin = lk.origin_id ?? lk[1], slot = lk.origin_slot ?? lk[2] ?? 0; if (id != null && origin != null) { linkOrigin.set(id, origin); linkSlot.set(id, slot); } }
        }
    }
    const textMap = new Map();
    for (const n of nodes) {
        if (!_isTextEncoderNode(n.type ?? "")) continue;
        const text = n.widgets_values?.[0];
        if (text && typeof text === "string") { textMap.set(n.id, text); }
        else if (Array.isArray(n.inputs)) {
            const textInput = n.inputs.find(inp => inp.name === "text" || inp.name === "text_g" || inp.name === "prompt");
            if (textInput?.link != null) {
                const originId = linkOrigin.get(textInput.link);
                const originSlot = linkSlot.get(textInput.link) ?? 0;
                const srcNode = originId != null ? nodeMap.get(originId) : null;
                if (srcNode) {
                    const srcType = srcNode.type ?? "";
                    if (_isPromptStylerNode(srcType)) { const v = srcNode.widgets_values?.[originSlot]; if (v && typeof v === "string") textMap.set(n.id, v); }
                    else { const v = srcNode.widgets_values?.[originSlot] ?? srcNode.widgets_values?.[0]; if (v && typeof v === "string") textMap.set(n.id, v); }
                }
            }
        }
    }
    const pos = new Set(), neg = new Set();
    let foundSampler = false;
    for (const n of nodes) {
        if (!_isSamplerNode(n.type ?? "") || !Array.isArray(n.inputs)) continue;
        foundSampler = true;
        for (const inp of n.inputs) {
            if (!inp || inp.link == null) continue;
            const originId = linkOrigin.get(inp.link);
            if (originId == null) continue;
            const txt = textMap.get(originId);
            if (!txt) continue;
            const name = inp.name ?? "";
            if (name === "positive" || name.startsWith("positive")) pos.add(txt);
            else if (name === "negative" || name.startsWith("negative")) neg.add(txt);
        }
    }
    if (!foundSampler) return null;
    if (pos.size === 0 && neg.size === 0) {
        const allTexts = [...textMap.values()].filter(t => t.trim());
        if (allTexts.length > 0) return { positives: [], negatives: [], texts: allTexts };
        return null;
    }
    return { positives: [...pos], negatives: [...neg] };
}

function _extractMarkdownNoteModels(wf) {
    const allNodes = [];
    if (Array.isArray(wf.nodes)) allNodes.push(...wf.nodes);
    for (const sg of wf.definitions?.subgraphs ?? []) if (Array.isArray(sg.nodes)) allNodes.push(...sg.nodes);
    const result = { checkpoints: [], vaes: [], diffusionModels: [], textEncoders: [], loras: [] };
    const seen = { checkpoints: new Set(), vaes: new Set(), diffusionModels: new Set(), textEncoders: new Set(), loras: new Set() };
    function addU(arr, set, name) { if (name && typeof name === "string" && !set.has(name)) { set.add(name); arr.push(name); } }
    for (const n of allNodes) {
        if (n.type !== "MarkdownNote") continue;
        const raw = n.widgets_values;
        const text = Array.isArray(raw) ? raw[0] : (typeof raw === "string" ? raw : null);
        if (!text) continue;
        const sRe = /\*\*([^*\n]+)\*\*/g;
        let sm;
        while ((sm = sRe.exec(text)) !== null) {
            const sec = sm[1].trim().toLowerCase().replace(/\s+/g, "_");
            if (!["text_encoders", "diffusion_models", "vae", "checkpoints", "loras"].includes(sec)) continue;
            const rest = text.slice(sm.index + sm[0].length);
            const end = rest.search(/\n\*\*|\n##/);
            const content = end >= 0 ? rest.slice(0, end) : rest;
            const lRe = /^- \[([^\]]+)\]/gm;
            let lm;
            while ((lm = lRe.exec(content)) !== null) {
                const name = lm[1].trim();
                if (sec === "text_encoders") addU(result.textEncoders, seen.textEncoders, name);
                else if (sec === "diffusion_models") addU(result.diffusionModels, seen.diffusionModels, name);
                else if (sec === "vae") addU(result.vaes, seen.vaes, name);
                else if (sec === "checkpoints") addU(result.checkpoints, seen.checkpoints, name);
                else if (sec === "loras") addU(result.loras, seen.loras, name);
            }
        }
    }
    const hasAny = result.checkpoints.length || result.vaes.length || result.diffusionModels.length || result.textEncoders.length || result.loras.length;
    return hasAny ? result : null;
}

function _resolveLinkedText(wf, srcId, slot) {
    const src = wf[String(srcId)];
    if (!src || typeof src !== "object") return null;
    const ct = src.class_type ?? "";
    if (_isPromptStylerNode(ct)) { const v = slot === 0 ? src.inputs?.text_positive : src.inputs?.text_negative; return (v && typeof v === "string") ? v : null; }
    const keys = slot === 0 ? ["text_positive", "text", "text_g", "prompt"] : ["text_negative", "text_l"];
    for (const k of keys) { const v = src.inputs?.[k]; if (v && typeof v === "string") return v; }
    return null;
}

function _extractPromptsAPI(wf) {
    const metaNodes = Object.values(wf).filter(n => n?.class_type === "ImageMetadataPromptLoader");
    if (metaNodes.length > 0) {
        const pos = new Set(), neg = new Set();
        for (const n of metaNodes) { if (n.inputs?.positive_text) pos.add(n.inputs.positive_text); if (n.inputs?.negative_text) neg.add(n.inputs.negative_text); }
        if (pos.size > 0 || neg.size > 0) return { positives: [...pos], negatives: [...neg] };
    }
    const textMap = new Map();
    for (const [id, n] of Object.entries(wf)) {
        if (!n || !_isTextEncoderNode(n.class_type ?? "")) continue;
        const raw = n.inputs?.text ?? n.inputs?.text_g ?? null;
        if (raw && typeof raw === "string") { textMap.set(id, raw); }
        else if (Array.isArray(raw)) { const txt = _resolveLinkedText(wf, raw[0], raw[1] ?? 0); if (txt) textMap.set(id, txt); }
    }
    const pos = new Set(), neg = new Set();
    let foundSampler = false;
    for (const n of Object.values(wf)) {
        if (!n || !_isSamplerNode(n.class_type ?? "")) continue;
        foundSampler = true;
        for (const [key, val] of Object.entries(n.inputs ?? {})) {
            if (!Array.isArray(val)) continue;
            const txt = textMap.get(String(val[0]));
            if (!txt) continue;
            if (key === "positive" || key.startsWith("positive")) pos.add(txt);
            else if (key === "negative" || key.startsWith("negative")) neg.add(txt);
        }
    }
    if (!foundSampler || (pos.size === 0 && neg.size === 0)) { const all = [...textMap.values()].filter(t => t && t.trim()); return { positives: [], negatives: [], texts: all }; }
    return { positives: [...pos], negatives: [...neg] };
}

function _extractPromptsLiteGraph(wf) {
    const { nodes, links } = wf;
    if (!Array.isArray(nodes)) return { positives: [], negatives: [] };
    const metaNodes = nodes.filter(n => n.type === "ImageMetadataPromptLoader");
    if (metaNodes.length > 0) {
        const pos = new Set(), neg = new Set();
        for (const n of metaNodes) { const p = n.widgets_values?.[2], ng = n.widgets_values?.[3]; if (p) pos.add(p); if (ng) neg.add(ng); }
        if (pos.size > 0 || neg.size > 0) return { positives: [...pos], negatives: [...neg] };
    }
    const wfsNodes = nodes.filter(n => n.type === "WFS_PromptText");
    if (wfsNodes.length > 0) {
        const pos = new Set(), neg = new Set();
        for (const n of wfsNodes) { const p = n.widgets_values?.[0], ng = n.widgets_values?.[1]; if (p) pos.add(p); if (ng) neg.add(ng); }
        if (pos.size > 0 || neg.size > 0) return { positives: [...pos], negatives: [...neg] };
    }
    const topResult = _extractPromptsFromNodeSet(nodes, links ?? []);
    if (topResult) return topResult;
    const primTexts = [];
    for (const n of _collectAllNodes(wf)) {
        if (n.type !== "PrimitiveStringMultiline") continue;
        const t = Array.isArray(n.widgets_values) ? n.widgets_values[0] : n.widgets_values;
        if (t && typeof t === "string" && t.trim()) primTexts.push(t.trim());
    }
    if (primTexts.length > 0) return { positives: [], negatives: [], texts: primTexts };
    for (const sg of wf.definitions?.subgraphs ?? []) {
        if (!Array.isArray(sg.nodes)) continue;
        const sgResult = _extractPromptsFromNodeSet(sg.nodes, sg.links ?? []);
        if (sgResult) return sgResult;
    }
    const stylerPos = new Set(), stylerNeg = new Set();
    for (const n of nodes) {
        if (!_isPromptStylerNode(n.type ?? "")) continue;
        const vals = n.widgets_values ?? [];
        for (let i = 0; i < vals.length; i++) { if (typeof vals[i] !== "string" || !vals[i].trim()) continue; if (i % 2 === 0) stylerPos.add(vals[i]); else stylerNeg.add(vals[i]); }
    }
    if (stylerPos.size > 0 || stylerNeg.size > 0) return { positives: [...stylerPos], negatives: [...stylerNeg] };
    const all = [];
    for (const n of _collectAllNodes(wf)) {
        if (!_isTextEncoderNode(n.type ?? "")) continue;
        const t = n.widgets_values?.[0];
        if (t && typeof t === "string" && t.trim()) all.push(t);
    }
    return { positives: [], negatives: [], texts: all };
}

function _extractPrompts(wf) {
    if (!wf || typeof wf !== "object") return { positives: [], negatives: [] };
    return Array.isArray(wf.nodes) ? _extractPromptsLiteGraph(wf) : _extractPromptsAPI(wf);
}

function _parseSDAParameters(raw) {
    const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const stepsMatch = text.match(/\nSteps:\s+\d/);
    if (!stepsMatch) return null;
    const paramsStart = stepsMatch.index + 1;
    const promptSection = text.slice(0, paramsStart - 1);
    const paramsLine = text.slice(paramsStart);
    const negSep = "\nNegative prompt: ";
    const negIdx = promptSection.indexOf(negSep);
    let positive = "", negative = "";
    if (negIdx !== -1) { positive = promptSection.slice(0, negIdx).trim(); negative = promptSection.slice(negIdx + negSep.length).trim(); }
    else positive = promptSection.trim();
    const params = {};
    const re = /,?\s*([A-Za-z][A-Za-z0-9 ]*):\s*("(?:[^"\\]|\\.)*"|[^,]+)/g;
    let m;
    while ((m = re.exec(paramsLine)) !== null) params[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
    return { positive, negative, params };
}
function _parseFooocusMetadata(raw) {
    let obj; try { obj = JSON.parse(raw); } catch { return null; }
    if (!obj?.base_model) return null;
    const toArray = v => !v ? [] : Array.isArray(v) ? v.filter(Boolean) : [String(v)];
    return { checkpoint: obj.base_model, vae: (obj.vae && obj.vae !== "Default") ? obj.vae : null, positives: toArray(obj.full_prompt ?? obj.prompt), negatives: toArray(obj.full_negative_prompt ?? obj.negative_prompt) };
}

async function _extractAllMetadata(file) {
    const name = file.name.toLowerCase();
    const isJSON = file.type === "application/json" || name.endsWith(".json");
    const isWebP = file.type === "image/webp" || name.endsWith(".webp");

    function fromWorkflow(wf, source) {
        const base = { source, checkpoints: _extractCheckpoints(wf), vaes: _extractVAEs(wf), diffusionModels: _extractDiffusionModels(wf), textEncoders: _extractTextEncoders(wf), loras: _extractLoRAs(wf), ..._extractPrompts(wf) };
        const mdm = _extractMarkdownNoteModels(wf);
        if (mdm) {
            if (!base.checkpoints.length) base.checkpoints = mdm.checkpoints;
            if (!base.vaes.length) base.vaes = mdm.vaes;
            if (!base.diffusionModels.length) base.diffusionModels = mdm.diffusionModels;
            if (!base.textEncoders.length) base.textEncoders = mdm.textEncoders;
            if (!base.loras.length) base.loras = mdm.loras;
        }
        return base;
    }

    if (isJSON) {
        let wf; try { wf = JSON.parse(_sanitizeJSON(await file.text())); } catch { return null; }
        return wf ? fromWorkflow(wf, "comfyui") : null;
    }
    if (isWebP) {
        const exif = await _readWebPEXIFChunk(file);
        if (!exif) return null;
        const wf = _extractWorkflowFromEXIF(exif);
        return wf ? fromWorkflow(wf, "comfyui") : null;
    }
    // PNG
    const chunks = await _readAllPNGTextChunks(file);
    if (!chunks) return null;
    if (chunks.prompt) { let wf; try { wf = JSON.parse(_sanitizeJSON(chunks.prompt)); } catch { return null; } return wf ? fromWorkflow(wf, "comfyui") : null; }
    if (chunks.workflow) { let wf; try { wf = JSON.parse(_sanitizeJSON(chunks.workflow)); } catch { return null; } return wf ? fromWorkflow(wf, "comfyui") : null; }
    if (chunks.fooocus_scheme === "fooocus" && chunks.parameters) {
        const f = _parseFooocusMetadata(chunks.parameters);
        if (!f) return null;
        return { source: "fooocus", checkpoints: [f.checkpoint], vaes: f.vae ? [f.vae] : [], diffusionModels: [], textEncoders: [], loras: [], positives: f.positives, negatives: f.negatives };
    }
    if (chunks.parameters) {
        const p = _parseSDAParameters(chunks.parameters);
        if (!p) return null;
        const { positive, negative, params } = p;
        const modelName = params["Model"];
        if (!modelName) return null;
        if (params["Module 2"] != null) {
            const textEncoders = [];
            for (let i = 2; i <= 9; i++) { const mod = params[`Module ${i}`]; if (!mod) break; textEncoders.push(mod); }
            return { source: "sd_forge", checkpoints: [], vaes: params["Module 1"] ? [params["Module 1"]] : [], diffusionModels: [modelName], textEncoders, loras: [], positives: positive ? [positive] : [], negatives: negative ? [negative] : [] };
        }
        const vaeValue = params["Module 1"] ?? params["VAE"] ?? null;
        return { source: "sd", checkpoints: [modelName], vaes: vaeValue ? [vaeValue] : [], diffusionModels: [], textEncoders: [], loras: [], positives: positive ? [positive] : [], negatives: negative ? [negative] : [] };
    }
    return null;
}

// ============================================
// Info Tab – UI rendering
// ============================================

const handleInfoFile = async (file) => {
    if (!file || !panelEl) return;
    const fileInfo   = panelEl.querySelector("#wfm-nlp-info-fileinfo");
    const previewImg = panelEl.querySelector("#wfm-nlp-info-preview-img");
    const dropLabel  = panelEl.querySelector("#wfm-nlp-info-drop-label");

    if (file.size > INFO_MAX_FILE_SIZE) {
        if (fileInfo) fileInfo.textContent = "File too large (max 50MB)";
        return;
    }
    if (fileInfo) fileInfo.textContent = "Parsing...";

    const isImage = file.type.startsWith("image/") || /\.(png|webp|jpg|jpeg)$/i.test(file.name);
    if (isImage && previewImg && dropLabel) {
        const url = URL.createObjectURL(file);
        previewImg.src = url;
        previewImg.style.display = "block";
        dropLabel.style.display = "none";
        previewImg.onload = () => URL.revokeObjectURL(url);
    } else if (previewImg && dropLabel) {
        previewImg.style.display = "none";
        dropLabel.style.display = "";
    }

    let meta;
    try { meta = await _extractAllMetadata(file); }
    catch (err) { if (fileInfo) fileInfo.textContent = "Parse error: " + err.message; return; }

    if (!meta) {
        if (fileInfo) fileInfo.textContent = "No metadata found in file";
        state.infoMeta = null;
        renderInfoSubContent();
        return;
    }

    state.infoMeta = meta;
    const sizeKB = (file.size / 1024).toFixed(1);
    const srcLabel = { comfyui: "ComfyUI", sd: "SD WebUI", sd_forge: "SD Forge", fooocus: "Fooocus" }[meta.source] ?? meta.source;
    if (fileInfo) fileInfo.textContent = `${file.name}  (${sizeKB} KB · ${srcLabel})`;
    renderInfoSubContent();
};

const setupInfoDropHandlers = (container) => {
    const dropZone  = container.querySelector("#wfm-nlp-info-drop");
    const dropLabel = container.querySelector("#wfm-nlp-info-drop-label");
    const previewImg = container.querySelector("#wfm-nlp-info-preview-img");
    const fileInput = container.querySelector("#wfm-nlp-info-file-input");
    if (!dropZone) return;

    dropZone.addEventListener("dragover",  e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add("drag-over"); });
    dropZone.addEventListener("dragleave", e => { e.stopPropagation(); dropZone.classList.remove("drag-over"); });
    dropZone.addEventListener("drop", e => {
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.remove("drag-over");
        handleInfoFile(e.dataTransfer.files?.[0]);
    });
    dropZone.addEventListener("click", e => { if (e.target === previewImg) return; fileInput.click(); });
    fileInput.addEventListener("change", () => { handleInfoFile(fileInput.files?.[0]); fileInput.value = ""; });

    const copyBtn = container.querySelector("#wfm-nlp-info-copy-btn");
    if (copyBtn) {
        copyBtn.addEventListener("click", () => {
            const textarea = container.querySelector("#wfm-nlp-info-prompt-full");
            const text = textarea?.value;
            if (!text) return;
            navigator.clipboard.writeText(text).then(() => {
                const orig = copyBtn.textContent;
                copyBtn.textContent = "Copied!";
                copyBtn.classList.add("wfm-nlp-info-copy-btn--done");
                setTimeout(() => { copyBtn.textContent = orig; copyBtn.classList.remove("wfm-nlp-info-copy-btn--done"); }, 1200);
            });
        });
    }
};

const renderInfoModels = (container, meta) => {
    container.innerHTML = "";
    if (!meta) {
        container.innerHTML = `<div class="wfm-nlp-info-empty">Drop a PNG/WebP/JSON file to view model info</div>`;
        return;
    }
    const sections = [
        { label: "Checkpoint",     items: meta.checkpoints },
        { label: "VAE",            items: meta.vaes },
        { label: "Diffusion Model", items: meta.diffusionModels },
        { label: "Text Encoder",   items: meta.textEncoders },
    ];
    let hasAny = false;
    for (const { label, items } of sections) {
        if (!items || items.length === 0) continue;
        hasAny = true;
        const sec = document.createElement("div");
        sec.className = "wfm-nlp-info-section";
        sec.innerHTML = `<div class="wfm-nlp-info-section-title">${esc(label)}</div>`;
        for (const name of items) {
            const item = document.createElement("div");
            item.className = "wfm-nlp-info-item";
            item.title = name;
            item.innerHTML = `<span class="wfm-nlp-info-item-name">${esc(name)}</span>`;
            sec.appendChild(item);
        }
        container.appendChild(sec);
    }
    if (!hasAny) container.innerHTML = `<div class="wfm-nlp-info-empty">No model info found</div>`;
};

const renderInfoLoras = (container, meta) => {
    container.innerHTML = "";
    if (!meta || !meta.loras || meta.loras.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-info-empty">${meta ? "No LoRA found" : "Drop a PNG/WebP/JSON file to view LoRA info"}</div>`;
        return;
    }
    for (const lora of meta.loras) {
        const item = document.createElement("div");
        item.className = "wfm-nlp-info-item";
        item.title = lora.name;
        const sm = typeof lora.strength_model === "number" ? lora.strength_model.toFixed(2) : "—";
        const sc = typeof lora.strength_clip  === "number" ? lora.strength_clip.toFixed(2)  : "—";
        item.innerHTML = `<span class="wfm-nlp-info-item-name">${esc(lora.name)}</span><span class="wfm-nlp-info-item-badge">${sm}/${sc}</span>`;
        container.appendChild(item);
    }
};

const renderInfoPrompts = (container, meta) => {
    container.innerHTML = "";
    const promptFull      = panelEl?.querySelector("#wfm-nlp-info-prompt-full");
    const promptFullLabel = panelEl?.querySelector("#wfm-nlp-info-prompt-full-label");
    if (!meta) {
        container.innerHTML = `<div class="wfm-nlp-info-empty">Drop a PNG/WebP/JSON file to view prompts</div>`;
        return;
    }
    const allPrompts = [
        ...(meta.positives || []).map(p => ({ type: "positive", text: p })),
        ...(meta.negatives || []).map(p => ({ type: "negative", text: p })),
        ...((meta.texts   || []).map(p => ({ type: "text",     text: p }))),
    ];
    if (allPrompts.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-info-empty">No prompts found</div>`;
        return;
    }
    for (const { type, text } of allPrompts) {
        const item = document.createElement("div");
        item.className = "wfm-nlp-info-prompt-item";
        const snippet = text.length > 55 ? text.slice(0, 55) + "…" : text;
        const badge = type === "positive"
            ? `<span class="wfm-nlp-info-badge-pos">POS</span>`
            : type === "negative"
            ? `<span class="wfm-nlp-info-badge-neg">NEG</span>`
            : "";
        item.innerHTML = `${badge}<span class="wfm-nlp-info-item-name">${esc(snippet)}</span>`;
        item.addEventListener("click", () => {
            container.querySelectorAll(".wfm-nlp-info-prompt-item").forEach(e => e.classList.remove("selected"));
            item.classList.add("selected");
            if (promptFull) promptFull.value = text;
            if (promptFullLabel) promptFullLabel.textContent = type === "positive" ? "Positive" : type === "negative" ? "Negative" : "Text";
        });
        container.appendChild(item);
    }
    const first = container.querySelector(".wfm-nlp-info-prompt-item");
    if (first) first.click();
};

const renderInfoSubContent = () => {
    if (!panelEl) return;
    const subContent    = panelEl.querySelector("#wfm-nlp-info-subcontent");
    const promptPreview = panelEl.querySelector("#wfm-nlp-info-prompt-preview");
    if (!subContent) return;
    const meta = state.infoMeta;
    if (state.infoSubTab === "info-prompt") {
        if (promptPreview) promptPreview.style.display = "flex";
        renderInfoPrompts(subContent, meta);
    } else {
        if (promptPreview) promptPreview.style.display = "none";
        if (state.infoSubTab === "info-model") renderInfoModels(subContent, meta);
        else renderInfoLoras(subContent, meta);
    }
};

const renderInfoTab = (container) => {
    if (!container.querySelector(".wfm-nlp-info-layout")) {
        container.innerHTML = `
            <div class="wfm-nlp-info-layout">
                <div class="wfm-nlp-info-drop" id="wfm-nlp-info-drop">
                    <img id="wfm-nlp-info-preview-img" style="display:none;max-width:100%;max-height:100%;object-fit:contain;pointer-events:none;">
                    <span id="wfm-nlp-info-drop-label" style="font-size:11px;color:var(--descrip-text,#999);pointer-events:none;">Drop PNG / WebP / JSON</span>
                    <input type="file" id="wfm-nlp-info-file-input" accept=".png,.webp,.json,image/png,image/webp,application/json" style="display:none;">
                </div>
                <div id="wfm-nlp-info-fileinfo" class="wfm-nlp-info-fileinfo">—</div>
                <div id="wfm-nlp-info-subcontent" class="wfm-nlp-info-subcontent"></div>
                <div id="wfm-nlp-info-prompt-preview" class="wfm-nlp-info-prompt-preview" style="display:none;">
                    <div id="wfm-nlp-info-prompt-full-label" class="wfm-nlp-info-prompt-label"></div>
                    <textarea id="wfm-nlp-info-prompt-full" class="wfm-nlp-info-prompt-textarea" readonly></textarea>
                    <button id="wfm-nlp-info-copy-btn" class="wfm-nlp-info-copy-btn">Copy</button>
                </div>
            </div>
        `;
        setupInfoDropHandlers(container);
    }
    renderInfoSubContent();
};

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
            font-size: 13px;
            font-weight: 700;
            padding: 6px 2px;
            border-radius: 3px;
            border: 1px solid transparent;
            margin: 3px 1px;
        }
        .wfm-nlp-top-tab.active {
            border-color: var(--p-button-background, #4a9eff);
        }
        .wfm-nlp-sub-tab {
            font-size: 10px;
            padding: 6px 4px;
        }
        /* Info tab layout */
        .wfm-nlp-info-layout {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        }
        .wfm-nlp-info-drop {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 54px;
            border: 2px dashed var(--border-color, #4e4e4e);
            border-radius: 6px;
            margin: 8px 8px 0;
            cursor: pointer;
            overflow: hidden;
            flex-shrink: 0;
            transition: border-color 0.15s;
            position: relative;
        }
        .wfm-nlp-info-drop:hover,
        .wfm-nlp-info-drop.drag-over {
            border-color: var(--p-button-background, #4a9eff);
            background: rgba(74,158,255,0.04);
        }
        .wfm-nlp-info-fileinfo {
            font-size: 10px;
            color: var(--descrip-text, #888);
            padding: 4px 10px 6px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex-shrink: 0;
            border-bottom: 1px solid var(--border-color, #3a3a3a);
        }
        .wfm-nlp-info-subcontent {
            flex: 1;
            overflow-y: auto;
            padding: 4px 0;
        }
        .wfm-nlp-info-section {
            margin-bottom: 2px;
        }
        .wfm-nlp-info-section-title {
            font-size: 9px;
            font-weight: 700;
            color: var(--descrip-text, #888);
            text-transform: uppercase;
            letter-spacing: 0.6px;
            padding: 6px 10px 2px;
        }
        .wfm-nlp-info-item {
            padding: 4px 10px;
            font-size: 11px;
            border-bottom: 1px solid var(--border-color, #3a3a3a);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
        }
        .wfm-nlp-info-item-name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 11px;
        }
        .wfm-nlp-info-item-badge {
            font-size: 10px;
            color: var(--descrip-text, #aaa);
            flex-shrink: 0;
        }
        .wfm-nlp-info-empty {
            padding: 20px 10px;
            text-align: center;
            font-size: 11px;
            color: var(--descrip-text, #888);
            line-height: 1.6;
        }
        .wfm-nlp-info-prompt-item {
            padding: 5px 10px;
            font-size: 11px;
            border-bottom: 1px solid var(--border-color, #3a3a3a);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: background 0.12s;
        }
        .wfm-nlp-info-prompt-item:hover {
            background: var(--comfy-input-bg, #333);
        }
        .wfm-nlp-info-prompt-item.selected {
            background: rgba(74,158,255,0.15);
        }
        .wfm-nlp-info-badge-pos {
            font-size: 9px;
            font-weight: bold;
            padding: 1px 4px;
            border-radius: 3px;
            background: rgba(46,213,115,0.22);
            color: #2ed573;
            flex-shrink: 0;
        }
        .wfm-nlp-info-badge-neg {
            font-size: 9px;
            font-weight: bold;
            padding: 1px 4px;
            border-radius: 3px;
            background: rgba(255,71,87,0.22);
            color: #ff4757;
            flex-shrink: 0;
        }
        .wfm-nlp-info-prompt-preview {
            flex-direction: column;
            flex-shrink: 0;
            border-top: 1px solid var(--border-color, #3a3a3a);
            padding: 6px 8px;
            gap: 3px;
        }
        .wfm-nlp-info-prompt-label {
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--descrip-text, #888);
        }
        .wfm-nlp-info-prompt-textarea {
            width: 100%;
            height: 160px;
            background: var(--comfy-input-bg, #1e1e1e);
            border: 1px solid var(--border-color, #4e4e4e);
            border-radius: 3px;
            color: var(--input-text, #ddd);
            font-size: 10px;
            padding: 5px 7px;
            box-sizing: border-box;
            resize: none;
            outline: none;
            font-family: monospace;
            line-height: 1.4;
        }
        .wfm-nlp-info-copy-btn {
            align-self: flex-end;
            margin-top: 4px;
            padding: 3px 12px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid var(--border-color, #555);
            border-radius: 3px;
            background: none;
            color: var(--descrip-text, #aaa);
            transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .wfm-nlp-info-copy-btn:hover {
            background: rgba(74,158,255,0.2);
            color: #4a9eff;
            border-color: #4a9eff;
        }
        .wfm-nlp-info-copy-btn--done {
            background: rgba(46,213,115,0.2);
            color: #2ed573;
            border-color: #2ed573;
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

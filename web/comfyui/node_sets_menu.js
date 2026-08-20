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
    promptSubTab2: null,           // "prompt-groups" | null
    promptList: [],                // full prompt array from API
    promptFavorites: [],           // favorite === true
    promptCategories: [],          // unique category strings
    promptGroups: {},              // { groupName: [promptId, ...] } from localStorage
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
    // AI tab
    aiSubTab: "ai-translate",   // "ai-translate" | "ai-chat" | "ai-vlm" | "ai-settings"
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

    try {
        state.promptGroups = JSON.parse(localStorage.getItem("wfm_prompt_preset_groups") || "{}");
    } catch { state.promptGroups = {}; }
    const validIds = new Set(prompts.map(p => p.id));
    for (const g of Object.keys(state.promptGroups)) {
        state.promptGroups[g] = (state.promptGroups[g] || []).filter(id => validIds.has(id));
    }

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

// Returns true if the JSON is in ComfyUI API format (dict of nodeId→{class_type, inputs})
// rather than the UI format (has nodes[] and links[] arrays).
const isApiWorkflowFormat = (data) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    if (Array.isArray(data.nodes)) return false;
    const keys = Object.keys(data);
    return keys.length > 0 && keys.every((k) => data[k]?.class_type);
};

// Minimal API→UI conversion so app.loadGraphData() can handle API-format workflows.
// Nodes are arranged in a grid; link types use "*" since object_info is not queried here.
const convertApiToUiWorkflow = (api) => {
    const nodes = [];
    const links = [];
    let linkId = 1;
    const sortedIds = Object.keys(api).sort((a, b) => Number(a) - Number(b));
    sortedIds.forEach((id, idx) => {
        const node = api[id];
        const col = idx % 5;
        const row = Math.floor(idx / 5);
        const uiNode = {
            id: Number(id),
            type: node.class_type,
            title: node._meta?.title || node.class_type,
            pos: [col * 300 + 50, row * 250 + 50],
            size: [250, 200],
            inputs: [],
            outputs: [],
            widgets_values: [],
            mode: 0,
        };
        for (const [key, val] of Object.entries(node.inputs || {})) {
            if (Array.isArray(val) && val.length === 2 && typeof val[0] === "string" && typeof val[1] === "number") {
                uiNode.inputs.push({ name: key, type: "*", link: linkId });
                links.push([linkId, Number(val[0]), val[1], Number(id), uiNode.inputs.length - 1, "*"]);
                linkId++;
            } else {
                uiNode.widgets_values.push(val);
            }
        }
        nodes.push(uiNode);
    });
    const maxNodeId = Math.max(0, ...sortedIds.map(Number));
    return { nodes, links, groups: [], config: {}, extra: {}, version: 0.4, last_node_id: maxNodeId, last_link_id: linkId };
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
    node.title = "Wfs Prompt";

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
// CLIP Text Encode node placement
// ============================================

const placeClipTextEncodeNode = (text, pos) => {
    const graph = app.graph;
    if (!graph) return;
    const node = LiteGraph.createNode("CLIPTextEncode");
    if (!node) {
        showToast("Node not found: CLIPTextEncode", "error");
        return;
    }
    const canvas = app.canvas;
    const centerPos = canvas
        ? [-canvas.ds.offset[0] + canvas.canvas.width / 2 / canvas.ds.scale,
           -canvas.ds.offset[1] + canvas.canvas.height / 2 / canvas.ds.scale]
        : [100, 100];
    node.pos = pos || centerPos;
    graph.add(node);
    if (node.widgets) {
        const w = node.widgets.find(ww => ww.name === "text");
        if (w) { w.value = text; if (w.callback) w.callback(text); }
    }
    app.canvas.setDirty(true, true);
    showToast("Placed: CLIP Text Encode", "success");
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
    textencoder:  { classType: "CLIPLoader",             widgetName: "clip_name" },
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
// Lora Loader (LoraManager) node placement
// ============================================

const placeLoraMgrNode = (loras, pos) => {
    const graph = app.graph;
    if (!graph) return;
    const node = LiteGraph.createNode("Lora Loader (LoraManager)");
    if (!node) {
        showToast("Node not found: Lora Loader (LoraManager)", "error");
        return;
    }
    const canvas = app.canvas;
    const centerPos = canvas
        ? [-canvas.ds.offset[0] + canvas.canvas.width / 2 / canvas.ds.scale,
           -canvas.ds.offset[1] + canvas.canvas.height / 2 / canvas.ds.scale]
        : [100, 100];
    node.pos = pos || centerPos;
    graph.add(node);
    if (node.widgets) {
        const loraList = loras.map(l => ({ name: l.name, strength: l.strength_model ?? l.strength ?? 1.0, clipStrength: l.strength_clip ?? l.strength_model ?? l.strength ?? 1.0, active: true }));
        const w = node.widgets.find(ww => Array.isArray(ww.value) || ww.name === "loras");
        if (w) { w.value = loraList; if (w.callback) w.callback(loraList); }
        const textW = node.widgets.find(ww => ww.name === "text");
        if (textW) {
            textW.value = loraList
                .filter(l => l.active !== false)
                .map(l => {
                    const s = parseFloat(l.strength) || 1.0;
                    const c = parseFloat(l.clipStrength) || s;
                    return s === c ? `<lora:${l.name}:${s}>` : `<lora:${l.name}:${s}:${c}>`;
                })
                .join(" ");
            if (textW.callback) textW.callback(textW.value);
        }
    }
    app.canvas.setDirty(true, true);
    showToast(`Placed: Lora Loader (${loras.length} loras)`, "success");
};

// ============================================
// Workflow canvas loading
// ============================================

/**
 * Load workflow JSON onto the ComfyUI canvas.
 * Delegates to app.handleFile() so ComfyUI's native path handles both UI and API
 * formats (identical to dragging a file from Explorer). Falls back to
 * convertApiToUiWorkflow() + loadGraphData() if handleFile is unavailable.
 */
const loadDataOnCanvas = async (data) => {
    if (typeof app?.handleFile === "function") {
        const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
        const file = new File([blob], "workflow.json", { type: "application/json" });
        await app.handleFile(file);
    } else {
        if (isApiWorkflowFormat(data)) data = convertApiToUiWorkflow(data);
        await app.loadGraphData(data);
    }
};

// ============================================
// Cross-window receiver for SPA Send-to-Canvas
// ============================================
window.wfmReceiveWorkflow = async (data) => {
    await loadDataOnCanvas(data);
};

// ============================================
// Cross-window bridge for SPA Mask Editor One integration
// ============================================
// WFS Image Edit タブから呼ばれる。現在のグラフ上にある既存の MaskEditorOne ノードへ
// 画像を送り込み、そのノード自身の「Edit Mask」ウィジェット（node._editMaskWidget.callback）を
// 疑似クリックしてモーダルを開く。モーダルの overlay DOM (.me-overlay) が非表示に戻ったタイミングで
// Apply 後のマスク（node._maskDataUrl、グレースケール PNG data URL）を呼び出し元へ返す。
// Cancel/×で閉じた場合はマスクが更新されていないため null を返す。
window.wfmOpenMaskEditorForNode = async (nodeId, imageDataUrl) => {
    const node = app.graph.getNodeById(nodeId);
    if (!node || node.type !== "MaskEditorOne") {
        throw new Error(`MaskEditorOne node ${nodeId} not found in the current graph`);
    }
    if (typeof node._editMaskWidget?.callback !== "function") {
        throw new Error("MaskEditorOne node is missing its Edit Mask control (unsupported version?)");
    }

    const resp = await fetch("/mask_editor/store_image", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ node_id: String(nodeId), bg_image_b64: imageDataUrl }),
    });
    if (!resp.ok) throw new Error("Failed to send image to Mask Editor One");

    // ノード側のプレビュー/モーダル背景を、送信した画像に同期させる
    node._bgDataUrl = imageDataUrl;
    node._bgImg = await new Promise((r) => {
        const img = new Image();
        img.onload  = () => r(img);
        img.onerror = () => r(null);
        img.src = imageDataUrl;
    });
    node._previewMode = "image";
    node.setDirtyCanvas?.(true, true);

    const prevMaskUrl = node._maskDataUrl;
    node._editMaskWidget.callback();

    // openMaskEditor() は同期的に overlay DOM を構築・表示するため、callback() 直後に取得できる
    const overlays = [...document.querySelectorAll(".me-overlay")];
    const overlay  = overlays.find((o) => o.style.display !== "none") || overlays[overlays.length - 1];
    if (!overlay) throw new Error("Mask Editor One modal did not open");

    window.focus();

    return new Promise((resolve) => {
        const observer = new MutationObserver(() => {
            if (overlay.style.display === "none") {
                observer.disconnect();
                resolve(node._maskDataUrl && node._maskDataUrl !== prevMaskUrl ? node._maskDataUrl : null);
            }
        });
        observer.observe(overlay, { attributes: true, attributeFilter: ["style"] });
    });
};

// ============================================
// Cross-window bridge for SPA "Send to Workflow"
// ============================================
// WFS Image Edit タブから呼ばれる。アップロード済みの画像ファイル名を、現在ComfyUIキャンバス上で
// 選択中のノードの "image" ウィジェット（LoadImage / LoadImage 互換ノード）へ書き込む。
// 選択ノードに該当ウィジェットが無ければグラフ内の最初の該当ノードにフォールバックする。
// chat_TE カスタムノードの "Send to workflow" ボタンと同じロジック。
function _wfmFindImageWidget() {
    const graph = app.graph;
    if (!graph) return null;

    let selected = [];
    try {
        const sel = app.canvas?.selected_nodes;
        if (sel) selected = Object.values(sel);
    } catch { /* ignore */ }

    const pools = [selected, graph._nodes || []];
    for (const pool of pools) {
        for (const node of pool) {
            const widget = node?.widgets?.find((w) => w.name === "image");
            if (widget) return widget;
        }
    }
    return null;
}

window.wfmSendImageToSelectedNode = (filename) => {
    const widget = _wfmFindImageWidget();
    if (!widget) {
        throw new Error("No image widget found (select a LoadImage-type node)");
    }
    if (widget.options?.values && !widget.options.values.includes(filename)) {
        widget.options.values.unshift(filename);
    }
    widget.value = filename;
    widget.callback?.(widget.value);
    app.graph.setDirtyCanvas(true, true);
    return true;
};

const loadWorkflowOnCanvas = async (filename) => {
    const displayName = filename.replace(/\.json$/i, "");
    showToast(`Loading "${displayName}"...`, "info");
    const data = await fetchWorkflowRaw(filename);
    if (!data) {
        showToast("Failed to load workflow", "error");
        return;
    }
    try {
        await loadDataOnCanvas(data);
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
            e.dataTransfer.types.includes("application/x-wfm-model") ||
            e.dataTransfer.types.includes("application/x-wfm-lora-multi") ||
            e.dataTransfer.types.includes("application/x-wfm-clip-text") ||
            e.dataTransfer.types.includes("application/x-wfm-pending")) {
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

        // Handle Lora Loader (LoraManager) multi-lora drop
        const loraMultiRaw = e.dataTransfer.getData("application/x-wfm-lora-multi");
        if (loraMultiRaw) {
            e.preventDefault();
            const { loras } = JSON.parse(loraMultiRaw);
            const pos = getCanvasDropPos(e);
            placeLoraMgrNode(loras, pos);
            return;
        }

        // Handle CLIP Text Encode drop
        const clipTextRaw = e.dataTransfer.getData("application/x-wfm-clip-text");
        if (clipTextRaw) {
            e.preventDefault();
            const { text } = JSON.parse(clipTextRaw);
            const pos = getCanvasDropPos(e);
            placeClipTextEncodeNode(text, pos);
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

        // Handle pending workflow drop (from Gallery / Workflow tab "Send to Canvas")
        const pendingRaw = e.dataTransfer.getData("application/x-wfm-pending");
        if (pendingRaw) {
            e.preventDefault();
            (async () => {
                try {
                    const wfData = JSON.parse(pendingRaw);
                    await loadDataOnCanvas(wfData);
                    localStorage.removeItem("wfm_pending_workflow");
                    if (panelEl) {
                        const titleEl = panelEl.querySelector(".wfm-nlp-title");
                        if (titleEl) {
                            titleEl.draggable = false;
                            titleEl.classList.remove("wfm-nlp-title-pending");
                            titleEl.title = "Workflow Studio Library";
                        }
                    }
                    showToast("Workflow loaded on canvas", "success");
                } catch (err) {
                    showToast("Failed to load workflow: " + err.message, "error");
                }
            })();
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
            <button class="wfm-nlp-tab wfm-nlp-top-tab" data-toptab="ai" title="AI Tools (Translation)">A</button>
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
                const placeholders = { workflows: "Search workflows...", nodes: "Search nodes...", prompts: "Search prompts...", models: "Search models...", info: "", ai: "" };
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

    // Pending workflow drag-to-canvas
    const titleEl = panel.querySelector(".wfm-nlp-title");
    const updateTitlePendingState = () => {
        const hasPending = !!localStorage.getItem("wfm_pending_workflow");
        titleEl.draggable = hasPending;
        titleEl.classList.toggle("wfm-nlp-title-pending", hasPending);
        titleEl.title = hasPending
            ? "Drag to canvas to load workflow"
            : "Workflow Studio Library";
    };
    updateTitlePendingState();
    panel.addEventListener("mouseenter", updateTitlePendingState);
    window.addEventListener("storage", (e) => {
        if (e.key === "wfm_pending_workflow") updateTitlePendingState();
    });
    titleEl.addEventListener("dragstart", (e) => {
        const pendingRaw = localStorage.getItem("wfm_pending_workflow");
        if (!pendingRaw) { e.preventDefault(); return; }
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/x-wfm-pending", pendingRaw);
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

    if (state.topTab === "ai") {
        const row1Tabs = [
            { key: "ai-translate", label: "Translation" },
            { key: "ai-chat",      label: "Chat" },
            { key: "ai-vlm",       label: "TOOLS" },
            { key: "ai-settings",  label: "Settings" },
        ];
        const activeKey = state.aiSubTab;
        for (const t of row1Tabs) {
            const btn = document.createElement("button");
            btn.className = "wfm-nlp-tab wfm-nlp-sub-tab" + (activeKey === t.key ? " active" : "");
            btn.dataset.subtab = t.key;
            btn.textContent = t.label;
            btn.addEventListener("click", () => {
                state.aiSubTab = t.key;
                updateAllActive();
                btn.classList.add("active");
                renderAiSubContent();
            });
            row1.appendChild(btn);
        }
    } else if (state.topTab === "info") {
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
        const row2Tabs = [
            { key: "prompt-groups", label: "\ud83d\udcc1 Groups" },
        ];

        const activeKey = state.promptSubTab2 || state.promptSubTab;

        for (const t of row1Tabs) {
            const btn = document.createElement("button");
            btn.className = "wfm-nlp-tab wfm-nlp-sub-tab" + (activeKey === t.key ? " active" : "");
            btn.dataset.subtab = t.key;
            btn.textContent = t.label;
            btn.addEventListener("click", () => {
                state.promptSubTab = t.key;
                state.promptSubTab2 = null;
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
                state.promptSubTab2 = t.key;
                updateAllActive();
                btn.classList.add("active");
                renderContent();
            });
            row2.appendChild(btn);
        }
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

    // Show/hide search bar and adjust overflow for info/ai tab
    const searchEl = panelEl?.querySelector(".wfm-nlp-search");
    if (state.topTab === "info") {
        if (searchEl) searchEl.style.display = "none";
        content.style.overflowY = "hidden";
        content.style.padding = "0";
        renderInfoTab(content);
        return;
    } else if (state.topTab === "ai") {
        if (searchEl) searchEl.style.display = "none";
        content.style.overflowY = "hidden";
        content.style.padding = "0";
        renderAiTab(content);
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
        const promptKey = state.promptSubTab2 || state.promptSubTab;
        switch (promptKey) {
            case "prompt-all": renderPromptAll(content); break;
            case "prompt-favorites": renderPromptFavorites(content); break;
            case "prompt-categories": renderPromptCategories(content); break;
            case "prompt-groups": renderPromptGroups(content); break;
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

        if (modelType === "lora" && filtered.length >= 1) {
            const sep = document.createElement("div");
            sep.className = "wfm-nlp-info-section-title";
            sep.style.marginTop = "6px";
            listEl.appendChild(sep);

            const multiItem = document.createElement("div");
            multiItem.className = "wfm-nlp-item wfm-nlp-model-item";
            multiItem.draggable = true;
            multiItem.title = `Drag to canvas to place Lora Loader (LoraManager) with all ${filtered.length} loras`;
            multiItem.innerHTML = `<div class="wfm-nlp-item-row"><div class="wfm-nlp-item-body"><div class="wfm-nlp-item-label">All ${filtered.length} LoRAs</div><div class="wfm-nlp-item-sub">→ Lora Loader (LoraManager)</div></div></div>`;
            const buildLoraList = () => filtered.map(n => {
                const stem = n.replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");
                return { name: stem, strength: 1.0, clipStrength: 1.0, active: true };
            });
            multiItem.addEventListener("dragstart", (e) => {
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData("application/x-wfm-lora-multi", JSON.stringify({ loras: buildLoraList() }));
                multiItem.classList.add("dragging");
            });
            multiItem.addEventListener("dragend", () => multiItem.classList.remove("dragging"));
            multiItem.addEventListener("dblclick", (e) => { e.stopPropagation(); placeLoraMgrNode(buildLoraList()); });
            listEl.appendChild(multiItem);
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

const renderPromptGroups = (container) => {
    container.innerHTML = "";
    const groupNames = Object.keys(state.promptGroups).sort();

    if (groupNames.length === 0) {
        container.innerHTML = `<div class="wfm-nlp-empty">
            No groups.<br><small>Create groups in Workflow Studio</small>
        </div>`;
        return;
    }

    const promptMap = new Map(state.promptList.map(p => [p.id, p]));
    let hasAny = false;

    for (const groupName of groupNames) {
        const ids = state.promptGroups[groupName] || [];
        const prompts = ids.map(id => promptMap.get(id)).filter(Boolean);
        const filtered = prompts.filter(matchesPromptSearch);
        if (state.searchText && filtered.length === 0) continue;

        hasAny = true;
        const section = document.createElement("div");
        section.className = "wfm-nlp-group-section";

        const header = document.createElement("div");
        header.className = "wfm-nlp-group-header collapsed";
        header.innerHTML = `<span>${esc(groupName)}</span> <span class="wfm-nlp-badge">${filtered.length}</span>`;
        header.addEventListener("click", () => {
            const list = section.querySelector(".wfm-nlp-group-list");
            list.style.display = list.style.display === "none" ? "block" : "none";
            header.classList.toggle("collapsed");
        });
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "wfm-nlp-group-list";
        list.style.display = "none";
        for (const p of filtered) {
            list.appendChild(createDraggablePromptItem(p));
        }
        section.appendChild(list);
        container.appendChild(section);
    }

    if (!hasAny) {
        container.innerHTML = `<div class="wfm-nlp-empty">No matches.</div>`;
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

// ============================================
// UI→API変換（static/js/comfyui-workflow.js の convertUiToApi() 相当ロジックの複製）
// web/comfyui/ は static/js/ と配信URLが異なりESモジュールをimportできないため、
// AI backend URL解決等の既存パターンと同じくローカルに複製している。
// サブグラフ(definitions.subgraphs)を含むワークフローは、外側の折りたたみ表示
// ウィジェット値(実際にユーザーが編集する値)が定義テンプレート内のノードの
// widgets_valuesへ反映されているとは限らないため、この変換を経由してから
// モデル名・プロンプトを抽出する。ロジックを変更する場合は
// static/js/comfyui-workflow.js の convertUiToApi()/_flattenSubgraphs() 側も
// 同期すること。GenerateUIタブと異なりIタブは読み取り専用表示のため、
// Checkpoint代替やBypass/Muteノードの記録機能は省いている。
// ============================================

let _wfmObjectInfoCache = null;
async function _wfmLoadObjectInfo() {
    if (_wfmObjectInfoCache) return _wfmObjectInfoCache;
    try {
        const res = await fetch("/object_info");
        if (res.ok) _wfmObjectInfoCache = await res.json();
    } catch {}
    return _wfmObjectInfoCache || {};
}

function _wfmResolveBypassSource(nodeById, linkMap, nodeId, slot, visited) {
    const idStr = String(nodeId);
    const node = nodeById[idStr];
    if (!node || node.mode !== 4) return [idStr, slot];
    if (visited.has(idStr)) return null;
    visited.add(idStr);
    const outputs = node.outputs || [];
    const inputs = node.inputs || [];
    const outType = outputs[slot]?.type;
    let inIdx = -1;
    if (inputs[slot]?.type === outType && linkMap[idStr]?.[slot]) {
        inIdx = slot;
    } else {
        inIdx = inputs.findIndex((inp, i) => inp.type === outType && linkMap[idStr]?.[i]);
    }
    if (inIdx === -1) return null;
    const upstream = linkMap[idStr][inIdx];
    if (!upstream) return null;
    return _wfmResolveBypassSource(nodeById, linkMap, upstream[0], upstream[1], visited);
}

function _wfmGetWidgetInputNames(objectInfo, classType) {
    const info = objectInfo[classType];
    if (!info) return [];
    const names = [];
    const required = info.input?.required || {};
    const optional = info.input?.optional || {};
    for (const [name, spec] of Object.entries(required)) {
        const type = Array.isArray(spec) ? spec[0] : spec;
        if (Array.isArray(type)) {
            names.push(name);
        } else if (typeof type === "string") {
            const upper = type.toUpperCase();
            if (upper === "INT" || upper === "FLOAT" || upper === "STRING" || upper === "BOOLEAN" || upper === "COMBO" || upper === "COMFY_DYNAMICCOMBO_V3") {
                names.push(name);
            }
        }
    }
    for (const [name, spec] of Object.entries(optional)) {
        const type = Array.isArray(spec) ? spec[0] : spec;
        if (Array.isArray(type)) {
            names.push(name);
        } else if (typeof type === "string") {
            const upper = type.toUpperCase();
            if (upper === "INT" || upper === "FLOAT" || upper === "STRING" || upper === "BOOLEAN" || upper === "COMFY_DYNAMICCOMBO_V3") {
                names.push(name);
            }
        }
    }
    return names;
}

function _wfmGetWidgetInputTypes(objectInfo, classType) {
    const info = objectInfo[classType];
    if (!info) return [];
    const types = [];
    const required = info.input?.required || {};
    const optional = info.input?.optional || {};
    for (const [name, spec] of Object.entries(required)) {
        const type = Array.isArray(spec) ? spec[0] : spec;
        if (Array.isArray(type)) {
            types.push("COMBO");
        } else if (typeof type === "string") {
            const upper = type.toUpperCase();
            if (upper === "INT" || upper === "FLOAT" || upper === "STRING" || upper === "BOOLEAN" || upper === "COMBO" || upper === "COMFY_DYNAMICCOMBO_V3") {
                types.push(upper);
            }
        }
    }
    for (const [name, spec] of Object.entries(optional)) {
        const type = Array.isArray(spec) ? spec[0] : spec;
        if (Array.isArray(type)) {
            types.push("COMBO");
        } else if (typeof type === "string") {
            const upper = type.toUpperCase();
            if (upper === "INT" || upper === "FLOAT" || upper === "STRING" || upper === "BOOLEAN" || upper === "COMBO" || upper === "COMFY_DYNAMICCOMBO_V3") {
                types.push(upper);
            }
        }
    }
    return types;
}

function _wfmGetDynamicComboSubNames(objectInfo, classType, widgetName, selectedKey) {
    const info = objectInfo[classType];
    const spec = info?.input?.required?.[widgetName] || info?.input?.optional?.[widgetName];
    const options = spec?.[1]?.options;
    if (!Array.isArray(options)) return [];
    const opt = options.find((o) => o.key === selectedKey) || options[0];
    return Object.keys(opt?.inputs?.required || {});
}

const _WFM_CONTROL_AFTER_GENERATE = new Set(["fixed", "increment", "decrement", "randomize"]);
function _wfmIsExtraWidgetValue(val, expectedType) {
    if (expectedType === "INT" || expectedType === "FLOAT") {
        if (typeof val === "string" && _WFM_CONTROL_AFTER_GENERATE.has(val)) return true;
    }
    return false;
}

function _wfmFlattenSubgraphs(workflow, objectInfo) {
    const defs = workflow.definitions?.subgraphs;
    if (!defs || defs.length === 0) return workflow;
    const subgraphMap = {};
    for (const sg of defs) subgraphMap[sg.id] = sg;
    if (!workflow.nodes.some(n => subgraphMap[n.type])) return workflow;

    const wf = JSON.parse(JSON.stringify(workflow));
    const sgDefs = {};
    for (const sg of wf.definitions?.subgraphs || []) sgDefs[sg.id] = sg;

    let maxNodeId = 0;
    let maxLinkId = 0;
    for (const n of wf.nodes) if (n.id > maxNodeId) maxNodeId = n.id;
    for (const l of wf.links) if (l[0] > maxLinkId) maxLinkId = l[0];

    const addedNodes = [];
    const addedLinks = [];
    const nodesToRemove = new Set();

    for (const node of wf.nodes) {
        const sgDef = sgDefs[node.type];
        if (!sgDef) continue;
        nodesToRemove.add(node.id);

        const nodeIdRemap = {};
        for (const iNode of sgDef.nodes) {
            nodeIdRemap[iNode.id] = `${node.id}:${iNode.id}`;
        }

        const inputPortTargets = {};
        for (let portIdx = 0; portIdx < (sgDef.inputs || []).length; portIdx++) {
            const port = sgDef.inputs[portIdx];
            for (const linkId of (port.linkIds || [])) {
                const iLink = (sgDef.links || []).find(l => l.id === linkId);
                if (iLink && iLink.origin_id === -10) {
                    inputPortTargets[portIdx] = {
                        targetNodeId: nodeIdRemap[iLink.target_id],
                        targetSlot: iLink.target_slot,
                    };
                }
            }
        }

        const outputPortSources = {};
        for (let portIdx = 0; portIdx < (sgDef.outputs || []).length; portIdx++) {
            const port = sgDef.outputs[portIdx];
            for (const linkId of (port.linkIds || [])) {
                const iLink = (sgDef.links || []).find(l => l.id === linkId);
                if (iLink && iLink.target_id === -20) {
                    outputPortSources[portIdx] = {
                        sourceNodeId: nodeIdRemap[iLink.origin_id],
                        sourceSlot: iLink.origin_slot,
                    };
                }
            }
        }

        const redirectedTargets = new Set();
        for (const link of wf.links) {
            if (link[3] === node.id) {
                const dstSlot = link[4];
                const inputName = node.inputs?.[dstSlot]?.name;
                let portIdx = inputName
                    ? (sgDef.inputs || []).findIndex(p => p.name === inputName)
                    : -1;
                if (portIdx === -1) portIdx = dstSlot;
                const target = inputPortTargets[portIdx];
                if (target) {
                    link[3] = target.targetNodeId;
                    link[4] = target.targetSlot;
                    redirectedTargets.add(`${target.targetNodeId}:${target.targetSlot}`);
                }
            }
            if (link[1] === node.id) {
                const srcSlot = link[2];
                const source = outputPortSources[srcSlot];
                if (source) {
                    link[1] = source.sourceNodeId;
                    link[2] = source.sourceSlot;
                }
            }
        }

        const remappedByOrigId = {};
        const normalizedNodeIds = new Set();
        for (const iNode of sgDef.nodes) {
            const remapped = JSON.parse(JSON.stringify(iNode));
            remapped.id = nodeIdRemap[iNode.id];

            const allWidgetInputs = (remapped.inputs || []).filter((i) => i.widget);
            if (remapped.widgets_values && remapped.widgets_values.length === allWidgetInputs.length) {
                const linkedIdx = new Set();
                allWidgetInputs.forEach((inp, i) => {
                    const slotIdx = remapped.inputs.indexOf(inp);
                    if (redirectedTargets.has(`${remapped.id}:${slotIdx}`)) linkedIdx.add(i);
                });
                if (linkedIdx.size > 0) {
                    remapped.widgets_values = remapped.widgets_values.filter((_, i) => !linkedIdx.has(i));
                    normalizedNodeIds.add(remapped.id);
                }
            }

            addedNodes.push(remapped);
            remappedByOrigId[iNode.id] = remapped;
        }

        const outerWidgetInputs = (node.inputs || []).filter((inp) => inp.widget);
        outerWidgetInputs.forEach((inp, widgetIdx) => {
            if (inp.link != null) return;
            if (widgetIdx >= (node.widgets_values || []).length) return;
            const outerValue = node.widgets_values[widgetIdx];

            const portIdx = (sgDef.inputs || []).findIndex((p) => p.name === inp.name);
            if (portIdx === -1) return;
            const target = inputPortTargets[portIdx];
            if (!target) return;

            const origInternalId = String(target.targetNodeId).split(":").pop();
            const remappedNode = remappedByOrigId[origInternalId];
            if (!remappedNode) return;

            const targetInputDef = (remappedNode.inputs || [])[target.targetSlot];
            if (!targetInputDef?.widget) return;

            let iWidgetIdx;
            if (normalizedNodeIds.has(remappedNode.id)) {
                const remainingNames = (remappedNode.inputs || [])
                    .filter((i) => i.widget)
                    .filter((i) => {
                        const slotIdx = remappedNode.inputs.indexOf(i);
                        return !redirectedTargets.has(`${remappedNode.id}:${slotIdx}`);
                    })
                    .map((i) => i.name);
                iWidgetIdx = remainingNames.indexOf(targetInputDef.name);
            } else {
                const widgetNames = _wfmGetWidgetInputNames(objectInfo, remappedNode.type);
                iWidgetIdx = widgetNames.indexOf(targetInputDef.name);
            }
            if (iWidgetIdx === -1) return;

            if (!remappedNode.widgets_values) remappedNode.widgets_values = [];
            remappedNode.widgets_values[iWidgetIdx] = outerValue;
        });

        for (const iLink of (sgDef.links || [])) {
            if (iLink.origin_id === -10 || iLink.target_id === -20) continue;
            maxLinkId++;
            addedLinks.push([
                maxLinkId,
                nodeIdRemap[iLink.origin_id],
                iLink.origin_slot,
                nodeIdRemap[iLink.target_id],
                iLink.target_slot,
                iLink.type,
            ]);
        }
    }

    wf.nodes = [...wf.nodes.filter(n => !nodesToRemove.has(n.id)), ...addedNodes];
    wf.links = [
        ...wf.links.filter(l => !nodesToRemove.has(l[1]) && !nodesToRemove.has(l[3])),
        ...addedLinks,
    ];

    delete wf.definitions;
    return wf;
}

function _wfmIsDisplayOnlyNode(node) {
    const hasConnectedOutput = node.outputs?.some(o => o.links && o.links.length > 0);
    const hasConnectedInput = node.inputs?.some(i => i.link != null);
    return !hasConnectedOutput && !hasConnectedInput;
}

function _wfmGetWidgetMapping(nodeType) {
    const mappings = {
        CheckpointLoaderSimple: ["ckpt_name"],
        KSampler: ["seed", "steps", "cfg", "sampler_name", "scheduler", "denoise"],
        CLIPTextEncode: ["text"],
        CLIPTextEncodeEditPlus: ["text_edit", "mode"],
        ImageMetadataCheckpointLoader: ["ckpt_name", "vae_name", "_metadata_json"],
        ImageMetadataPromptLoader: ["ckpt_name", "vae_name", "positive_text", "negative_text", "_metadata_json"],
        ImageMetadataLoRALoader: ["lora_1", "strength_model_1", "strength_clip_1", "lora_2", "strength_model_2", "strength_clip_2", "lora_3", "strength_model_3", "strength_clip_3"],
        EmptyLatentImage: ["width", "height", "batch_size"],
        LoraLoader: ["lora_name", "strength_model", "strength_clip"],
        VAELoader: ["vae_name"],
        SaveImage: ["filename_prefix"],
        LoadImage: ["image", "upload"],
        UNETLoader: ["unet_name", "weight_dtype"],
        LoaderGGUF: ["gguf_name"],
        LoaderGGUFAdvanced: ["gguf_name", "dequant_dtype", "patch_dtype", "patch_on_device"],
        ResolutionSelector: ["aspect_ratio", "megapixels"],
        EmptySD3LatentImage: ["width", "height", "batch_size"],
        CLIPLoader: ["clip_name", "type", "device"],
        ClipLoaderGGUF: ["clip_name", "type"],
        DualClipLoaderGGUF: ["clip_name1", "clip_name2", "type"],
        FluxGuidance: ["guidance"],
        CFGNorm: ["strength"],
        ImpactWildcardProcessor: ["wildcard_text"],
        ImpactWildcardEncode: ["wildcard_text"],
        WFS_PromptText: ["positive", "negative"],
    };
    return mappings[nodeType] || null;
}

async function _wfmConvertUiToApi(workflow) {
    if (!workflow.nodes || !workflow.links) return {};

    const objectInfo = await _wfmLoadObjectInfo();
    const flatWorkflow = _wfmFlattenSubgraphs(workflow, objectInfo);

    const linkMap = {};
    for (const link of flatWorkflow.links) {
        const [id, srcNode, srcSlot, dstNode, dstSlot] = link;
        if (!linkMap[dstNode]) linkMap[dstNode] = {};
        linkMap[dstNode][dstSlot] = [String(srcNode), srcSlot];
    }
    const nodeById = {};
    for (const n of flatWorkflow.nodes) nodeById[String(n.id)] = n;

    const api = {};
    for (const node of flatWorkflow.nodes) {
        if (node.mode === 2 || node.mode === 4) continue;
        if (!objectInfo[node.type] && _wfmIsDisplayOnlyNode(node)) continue;
        const nodeId = String(node.id);
        const inputs = {};

        const nodeLinks = linkMap[node.id] || {};
        const inputDefs = node.inputs || [];
        const linkedInputNames = new Set();
        const linkedSlotNames = new Set();
        inputDefs.forEach((inp, idx) => {
            if (nodeLinks[idx]) {
                const resolved = _wfmResolveBypassSource(nodeById, linkMap, nodeLinks[idx][0], nodeLinks[idx][1], new Set());
                if (!resolved) return;
                inputs[inp.name] = resolved;
                linkedInputNames.add(inp.name);
                linkedSlotNames.add(inp.name);
            }
        });

        const widgets = node.widgets_values || [];
        if (widgets.length > 0) {
            const lmWidgetIds = node.properties?.__lm_widget_ids;
            if (lmWidgetIds && Array.isArray(lmWidgetIds)) {
                lmWidgetIds.forEach((name, idx) => {
                    if (idx >= widgets.length || linkedInputNames.has(name)) return;
                    let val = widgets[idx];
                    if (name === "loras" && Array.isArray(val)) {
                        val = { "__value__": val };
                    }
                    inputs[name] = val;
                });
            } else {
                const widgetNames = _wfmGetWidgetInputNames(objectInfo, node.type);
                if (widgetNames.length > 0) {
                    const widgetTypes = _wfmGetWidgetInputTypes(objectInfo, node.type);
                    let wIdx = 0;
                    for (let nIdx = 0; nIdx < widgetNames.length; nIdx++) {
                        if (wIdx >= widgets.length) break;
                        const name = widgetNames[nIdx];
                        const expectedType = widgetTypes[nIdx];
                        if (linkedInputNames.has(name)) {
                            if (!linkedSlotNames.has(name)) {
                                wIdx++;
                                if (wIdx < widgets.length && _wfmIsExtraWidgetValue(widgets[wIdx], expectedType)) {
                                    wIdx++;
                                }
                            }
                            continue;
                        }
                        let val = widgets[wIdx];
                        wIdx++;
                        if (_wfmIsExtraWidgetValue(val, expectedType)) {
                            if (wIdx < widgets.length) {
                                val = widgets[wIdx];
                                wIdx++;
                            }
                        }
                        if (expectedType === "COMFY_DYNAMICCOMBO_V3") {
                            inputs[name] = val;
                            const subNames = _wfmGetDynamicComboSubNames(objectInfo, node.type, name, val);
                            for (const subName of subNames) {
                                if (wIdx >= widgets.length) break;
                                inputs[`${name}.${subName}`] = widgets[wIdx];
                                wIdx++;
                            }
                            continue;
                        }
                        if (expectedType === "COMBO") {
                            const allInputDefs = {
                                ...(objectInfo[node.type]?.input?.required || {}),
                                ...(objectInfo[node.type]?.input?.optional || {}),
                            };
                            const spec = allInputDefs[name];
                            if (spec) {
                                const choices = Array.isArray(spec[0]) ? spec[0] : null;
                                if (choices && choices.length > 0 && !choices.includes(val)) {
                                    val = choices[0];
                                }
                            }
                        }
                        inputs[name] = val;
                    }
                } else {
                    const mapping = _wfmGetWidgetMapping(node.type);
                    if (mapping) {
                        mapping.forEach((key, idx) => {
                            if (idx < widgets.length && key && !(key in inputs)) {
                                inputs[key] = widgets[idx];
                            }
                        });
                    }
                }
            }
        }

        if ((node.type === "ImpactWildcardEncode" || node.type === "ImpactWildcardProcessor")
            && widgets.length > 0) {
            inputs["wildcard_text"] = widgets[0];
        }

        api[nodeId] = {
            class_type: node.type,
            inputs,
            _meta: { title: node.title || node.type },
        };
    }
    return api;
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
    const _UNET_TYPES = new Set(["UNETLoader", "UnetLoaderGGUF", "UNETLoaderGGUF"]);
    if (Array.isArray(wf.nodes)) return _collectUnique(_collectAllNodes(wf).filter(n => _UNET_TYPES.has(n.type)).map(n => n.widgets_values?.[0]));
    return _collectUnique(Object.values(wf).filter(n => _UNET_TYPES.has(n?.class_type)).map(n => n.inputs?.unet_name));
}
function _extractTextEncoders(wf) {
    if (!wf || typeof wf !== "object") return [];
    const names = [];
    if (Array.isArray(wf.nodes)) {
        for (const n of _collectAllNodes(wf)) {
            if (n.type === "CLIPLoader") { if (n.widgets_values?.[0]) names.push(n.widgets_values[0]); }
            else if (n.type === "DualCLIPLoader") { [0,1].forEach(i => { if (n.widgets_values?.[i]) names.push(n.widgets_values[i]); }); }
            else if (n.type === "TripleCLIPLoader") { [0,1,2].forEach(i => { if (n.widgets_values?.[i]) names.push(n.widgets_values[i]); }); }
            else if (n.type === "QuadrupleCLIPLoader") { [0,1,2,3].forEach(i => { if (n.widgets_values?.[i]) names.push(n.widgets_values[i]); }); }
        }
    } else {
        for (const n of Object.values(wf)) {
            if (!n || typeof n !== "object") continue;
            const ct = n.class_type ?? "";
            if (ct === "CLIPLoader") { if (n.inputs?.clip_name) names.push(n.inputs.clip_name); }
            else if (ct === "DualCLIPLoader") { if (n.inputs?.clip_name1) names.push(n.inputs.clip_name1); if (n.inputs?.clip_name2) names.push(n.inputs.clip_name2); }
            else if (ct === "TripleCLIPLoader") { ["clip_name1","clip_name2","clip_name3"].forEach(k => { if (n.inputs?.[k]) names.push(n.inputs[k]); }); }
            else if (ct === "QuadrupleCLIPLoader") { ["clip_name1","clip_name2","clip_name3","clip_name4"].forEach(k => { if (n.inputs?.[k]) names.push(n.inputs[k]); }); }
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
        const smNum = parseFloat(sm);
        const scNum = parseFloat(sc);
        results.push({ name, strength_model: isNaN(smNum) ? 1.0 : smNum, strength_clip: isNaN(scNum) ? 1.0 : scNum });
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
            else if (ct === "Lora Loader (LoraManager)") {
                const lorasData = n.inputs?.loras;
                const list = lorasData?.__value__ ?? (Array.isArray(lorasData) ? lorasData : null);
                if (list) for (const l of list) { if (l?.active !== false) add(l?.name, l?.strength ?? 1.0, l?.clipStrength ?? l?.strength ?? 1.0); }
            }
        }
    }
    return results;
}

function _isTextEncoderNode(ct) { return ct === "CLIPTextEncode" || ct.includes("TextEncode") || ct.includes("TextEncoderSD"); }
function _isSamplerNode(ct) { return ct === "KSampler" || ct === "KSamplerAdvanced" || ct.includes("KSampler") || ct.includes("Sampler"); }
function _isPromptStylerNode(ct) { return ct.includes("PromptStyler"); }

// CLIPTextEncodeEditPlus (model-and-prompt-from-metadata) の encode() と同じ結合ルール。
// RAW: text1のみ。EDIT: text_editのみ。front/back: text2(未接続ならtext_edit)をtext1の前/後に結合。
function _resolveEditPlusText(mode, textEdit, text1, text2) {
    const t1 = typeof text1 === "string" ? text1 : "";
    const edit = typeof textEdit === "string" ? textEdit : "";
    const insert = typeof text2 === "string" && text2 !== "" ? text2 : edit;
    switch (mode) {
        case "RAW": return t1;
        case "EDIT": return edit;
        case "front": return t1 ? `${insert}, ${t1}` : insert;
        case "back": return t1 ? `${t1}, ${insert}` : insert;
        default: return t1 || edit;
    }
}

// LiteGraph形式: リンクを辿ってテキストを解決（ComfySwitchNode等の中継ノードにも対応）
function _resolveLinkedTextInNodeSet(nodeMap, linkOrigin, linkSlot, srcId, slot, depth = 0) {
    if (depth > 6) return null;
    const srcNode = nodeMap.get(srcId);
    if (!srcNode) return null;
    const srcType = srcNode.type ?? "";
    if (_isPromptStylerNode(srcType)) {
        const v = srcNode.widgets_values?.[slot];
        return (v && typeof v === "string") ? v : null;
    }
    if (srcType === "ComfySwitchNode" && Array.isArray(srcNode.inputs)) {
        for (const name of ["on_false", "on_true"]) {
            const inp = srcNode.inputs.find(i => i.name === name);
            if (inp?.link == null) continue;
            const originId = linkOrigin.get(inp.link);
            const originSlot = linkSlot.get(inp.link) ?? 0;
            if (originId == null) continue;
            const text = _resolveLinkedTextInNodeSet(nodeMap, linkOrigin, linkSlot, originId, originSlot, depth + 1);
            if (text) return text;
        }
        return null;
    }
    const v = srcNode.widgets_values?.[slot] ?? srcNode.widgets_values?.[0];
    if (v && typeof v === "string") return v;
    // "source" = PreviewAny（値タップ中継）, "string_a" = StringConcatenate（LoRAトリガーワード
    // 連結等）— Krea-2のプロンプト強化配線で使われる中継ノード
    if (Array.isArray(srcNode.inputs)) {
        const nextInput = srcNode.inputs.find(i => ["text", "value", "prompt", "string", "source", "string_a"].includes(i.name));
        if (nextInput?.link != null) {
            const originId = linkOrigin.get(nextInput.link);
            const originSlot = linkSlot.get(nextInput.link) ?? 0;
            if (originId != null) return _resolveLinkedTextInNodeSet(nodeMap, linkOrigin, linkSlot, originId, originSlot, depth + 1);
        }
    }
    return null;
}

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
        const type = n.type ?? "";
        if (type === "CLIPTextEncodeEditPlus") {
            const resolveNamedInput = (name) => {
                if (!Array.isArray(n.inputs)) return null;
                const inp = n.inputs.find(i => i.name === name);
                if (inp?.link == null) return null;
                const originId = linkOrigin.get(inp.link);
                const originSlot = linkSlot.get(inp.link) ?? 0;
                if (originId == null) return null;
                return _resolveLinkedTextInNodeSet(nodeMap, linkOrigin, linkSlot, originId, originSlot);
            };
            const combined = _resolveEditPlusText(n.widgets_values?.[1], n.widgets_values?.[0], resolveNamedInput("text1"), resolveNamedInput("text2"));
            if (combined) textMap.set(n.id, combined);
            continue;
        }
        if (!_isTextEncoderNode(type)) continue;
        const text = n.widgets_values?.[0];
        if (text && typeof text === "string") { textMap.set(n.id, text); }
        else if (Array.isArray(n.inputs)) {
            const textInput = n.inputs.find(inp => inp.name === "text" || inp.name === "text_g" || inp.name === "prompt");
            if (textInput?.link != null) {
                const originId = linkOrigin.get(textInput.link);
                const originSlot = linkSlot.get(textInput.link) ?? 0;
                const text2 = _resolveLinkedTextInNodeSet(nodeMap, linkOrigin, linkSlot, originId, originSlot);
                if (text2) textMap.set(n.id, text2);
            }
        }
    }
    const pos = new Set(), neg = new Set();
    let foundSampler = false;
    for (const n of nodes) {
        if (!_isSamplerNode(n.type ?? "") || !Array.isArray(n.inputs)) continue;
        foundSampler = true;
        // SamplerCustomAdvanced doesn't hold positive/negative directly — resolve through its
        // "guider" input (CFGGuider/DualCFGGuider/BasicGuider) instead.
        let inputsToScan = n.inputs;
        const guiderInput = n.inputs.find(inp => inp.name === "guider");
        if (guiderInput?.link != null) {
            const guiderId = linkOrigin.get(guiderInput.link);
            const guiderNode = guiderId != null ? nodeMap.get(guiderId) : null;
            if (Array.isArray(guiderNode?.inputs)) inputsToScan = guiderNode.inputs;
        }
        for (const inp of inputsToScan) {
            if (!inp || inp.link == null) continue;
            const originId = linkOrigin.get(inp.link);
            if (originId == null) continue;
            const name = inp.name ?? "";
            // DualCFGGuider (HiDream E1): cond1 carries the positive-derived conditioning.
            const isPos = name === "positive" || name === "cond1" || name.startsWith("positive");
            const isNeg = name === "negative" || name.startsWith("negative");
            if (!isPos && !isNeg) continue;
            // TextEncodeMageFlowEdit / TextEncodeBooguEdit — 1ノードでprompt/negative_prompt両方を
            // 直接持つため、textMap(1ノード1テキスト)では両ロールを表現できない
            const srcNode = nodeMap.get(originId);
            if (srcNode?.type === "TextEncodeMageFlowEdit" || srcNode?.type === "TextEncodeBooguEdit") {
                const widgetIdx = isPos ? 0 : 1; // widgets_values: [prompt, negative_prompt, ...]
                const txt = srcNode.widgets_values?.[widgetIdx];
                if (txt && typeof txt === "string") { if (isPos) pos.add(txt); else neg.add(txt); }
                continue;
            }
            // InstructPixToPixConditioning (HiDream E1): forwards the actual text-encoder
            // conditioning through its own positive/negative inputs — follow one more hop.
            let resolvedOriginId = originId;
            if (srcNode?.type === "InstructPixToPixConditioning" && Array.isArray(srcNode.inputs)) {
                const innerInput = srcNode.inputs.find(i => i.name === (isPos ? "positive" : "negative"));
                if (innerInput?.link != null) {
                    const innerId = linkOrigin.get(innerInput.link);
                    if (innerId != null) resolvedOriginId = innerId;
                }
            }
            const txt = textMap.get(resolvedOriginId);
            if (!txt) continue;
            if (isPos) pos.add(txt); else neg.add(txt);
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

function _resolveLinkedText(wf, srcId, slot, depth = 0) {
    if (depth > 6) return null;
    const src = wf[String(srcId)];
    if (!src || typeof src !== "object") return null;
    const ct = src.class_type ?? "";
    if (_isPromptStylerNode(ct)) { const v = slot === 0 ? src.inputs?.text_positive : src.inputs?.text_negative; return (v && typeof v === "string") ? v : null; }
    // ComfySwitchNode ("If/Else Switch") — 片方(TextGenerateなどLLMノード)は静的解決不能なため
    // on_false/on_true の両方を試し、リテラルへ解決できた方を採用する。
    if (ct === "ComfySwitchNode") {
        for (const key of ["on_false", "on_true"]) {
            const v = src.inputs?.[key];
            if (Array.isArray(v)) { const text = _resolveLinkedText(wf, v[0], v[1] ?? 0, depth + 1); if (text) return text; }
            else if (typeof v === "string" && v) return v;
        }
        return null;
    }
    // "source" = PreviewAny の値タップ中継、"string_a" = StringConcatenate の主オペランド
    const keys = slot === 0 ? ["text_positive", "text", "text_g", "prompt", "value", "source", "string_a"] : ["text_negative", "text_l", "source", "string_a"];
    for (const k of keys) {
        const v = src.inputs?.[k];
        if (typeof v === "string" && v) return v;
        if (Array.isArray(v)) { const text = _resolveLinkedText(wf, v[0], v[1] ?? 0, depth + 1); if (text) return text; }
    }
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
        if (!n) continue;
        const ct = n.class_type ?? "";
        if (ct === "CLIPTextEncodeEditPlus") {
            const resolveField = (key) => {
                const v = n.inputs?.[key];
                if (typeof v === "string") return v;
                if (Array.isArray(v)) return _resolveLinkedText(wf, v[0], v[1] ?? 0);
                return null;
            };
            const combined = _resolveEditPlusText(n.inputs?.mode, n.inputs?.text_edit, resolveField("text1"), resolveField("text2"));
            if (combined) textMap.set(id, combined);
            continue;
        }
        if (!_isTextEncoderNode(ct)) continue;
        // "prompt" — TextEncodeQwenImageEdit(Plus)/TextEncodeBooguEdit and similar Image Edit
        // model text encoders use this key instead of "text"/"text_g".
        const raw = n.inputs?.text ?? n.inputs?.text_g ?? n.inputs?.prompt ?? null;
        if (raw && typeof raw === "string") { textMap.set(id, raw); }
        else if (Array.isArray(raw)) { const txt = _resolveLinkedText(wf, raw[0], raw[1] ?? 0); if (txt) textMap.set(id, txt); }
    }
    const pos = new Set(), neg = new Set();
    let foundSampler = false;
    for (const n of Object.values(wf)) {
        if (!n || !_isSamplerNode(n.class_type ?? "")) continue;
        foundSampler = true;
        // SamplerCustomAdvanced doesn't hold positive/negative directly — it drives a separate
        // Guider node (CFGGuider/DualCFGGuider/BasicGuider) via its "guider" input. Scan that
        // node's inputs instead so the loop below can find the positive/negative-role keys.
        let inputsToScan = n.inputs ?? {};
        if (Array.isArray(n.inputs?.guider)) {
            const guiderNode = wf[String(n.inputs.guider[0])];
            if (guiderNode?.inputs) inputsToScan = guiderNode.inputs;
        }
        for (const [key, val] of Object.entries(inputsToScan)) {
            if (!Array.isArray(val)) continue;
            // DualCFGGuider (HiDream E1): cond1 carries the positive-derived conditioning.
            const isPos = key === "positive" || key === "cond1" || key.startsWith("positive");
            const isNeg = key === "negative" || key.startsWith("negative");
            if (!isPos && !isNeg) continue;
            // TextEncodeMageFlowEdit / TextEncodeBooguEdit — 1ノードでprompt/negative_prompt両方を
            // 直接持つため、textMap(1ノード1テキスト)では両ロールを表現できない
            const srcNode = wf[String(val[0])];
            if (srcNode?.class_type === "TextEncodeMageFlowEdit" || srcNode?.class_type === "TextEncodeBooguEdit") {
                const txt = isPos ? srcNode.inputs?.prompt : srcNode.inputs?.negative_prompt;
                if (txt && typeof txt === "string") { if (isPos) pos.add(txt); else neg.add(txt); }
                continue;
            }
            // InstructPixToPixConditioning (HiDream E1): forwards the actual text-encoder
            // conditioning through its own positive/negative inputs — follow one more hop.
            const resolvedId = srcNode?.class_type === "InstructPixToPixConditioning" && Array.isArray(srcNode.inputs?.[isPos ? "positive" : "negative"])
                ? String(srcNode.inputs[isPos ? "positive" : "negative"][0])
                : String(val[0]);
            const txt = textMap.get(resolvedId);
            if (!txt) continue;
            if (isPos) pos.add(txt); else neg.add(txt);
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

    async function fromWorkflow(originalWf, source) {
        let wf = originalWf;
        // サブグラフを持つワークフローは、外側の折りたたみ表示ウィジェット値(実際に
        // ユーザーが見ている値)がテンプレート内のノードのwidgets_valuesへ反映されて
        // いないことがあるため、_wfmConvertUiToApi() で正規化してから抽出する。
        if (Array.isArray(wf?.nodes) && wf.definitions?.subgraphs?.length > 0) {
            try {
                const apiWf = await _wfmConvertUiToApi(wf);
                if (apiWf && Object.keys(apiWf).length > 0) wf = apiWf;
            } catch { /* 変換失敗時は元のUI形式のまま抽出（既存ロジックにフォールバック） */ }
        }
        const base = { source, checkpoints: _extractCheckpoints(wf), vaes: _extractVAEs(wf), diffusionModels: _extractDiffusionModels(wf), textEncoders: _extractTextEncoders(wf), loras: _extractLoRAs(wf), ..._extractPrompts(wf) };
        // MarkdownNote は常に元のUI形式ワークフローから抽出する（API変換後は nodes 情報が失われるため）
        const mdm = _extractMarkdownNoteModels(originalWf);
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
        return wf ? await fromWorkflow(wf, "comfyui") : null;
    }
    if (isWebP) {
        const exif = await _readWebPEXIFChunk(file);
        if (!exif) return null;
        const wf = _extractWorkflowFromEXIF(exif);
        return wf ? await fromWorkflow(wf, "comfyui") : null;
    }
    // PNG
    const chunks = await _readAllPNGTextChunks(file);
    if (!chunks) return null;
    if (chunks.prompt) { let wf; try { wf = JSON.parse(_sanitizeJSON(chunks.prompt)); } catch { return null; } return wf ? await fromWorkflow(wf, "comfyui") : null; }
    if (chunks.workflow) { let wf; try { wf = JSON.parse(_sanitizeJSON(chunks.workflow)); } catch { return null; } return wf ? await fromWorkflow(wf, "comfyui") : null; }
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
        { label: "Checkpoint",     items: meta.checkpoints,     modelType: "checkpoint" },
        { label: "VAE",            items: meta.vaes,            modelType: "vae" },
        { label: "Diffusion Model", items: meta.diffusionModels, modelType: "unet" },
        { label: "Text Encoder",   items: meta.textEncoders,    modelType: "textencoder" },
    ];
    let hasAny = false;
    for (const { label, items, modelType } of sections) {
        if (!items || items.length === 0) continue;
        hasAny = true;
        const sec = document.createElement("div");
        sec.className = "wfm-nlp-info-section";
        sec.innerHTML = `<div class="wfm-nlp-info-section-title">${esc(label)}</div>`;
        for (const name of items) {
            const item = document.createElement("div");
            item.className = "wfm-nlp-info-item wfm-nlp-info-item--draggable";
            item.draggable = true;
            item.title = `${name}\nDrag to canvas to place node`;
            item.innerHTML = `<span class="wfm-nlp-info-item-name">${esc(name)}</span>`;
            item.addEventListener("dragstart", (e) => {
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData("application/x-wfm-model", JSON.stringify({ modelName: name, modelType }));
                item.classList.add("dragging");
            });
            item.addEventListener("dragend", () => item.classList.remove("dragging"));
            item.addEventListener("dblclick", () => placeModelNode(name, modelType));
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
        item.className = "wfm-nlp-info-item wfm-nlp-info-item--draggable";
        item.draggable = true;
        item.title = `${lora.name}\nDrag to canvas to place LoRA node`;
        const sm = typeof lora.strength_model === "number" ? lora.strength_model.toFixed(2) : "—";
        const sc = typeof lora.strength_clip  === "number" ? lora.strength_clip.toFixed(2)  : "—";
        item.innerHTML = `<span class="wfm-nlp-info-item-name">${esc(lora.name)}</span><span class="wfm-nlp-info-item-badge">${sm}/${sc}</span>`;
        item.addEventListener("dragstart", (e) => {
            e.dataTransfer.effectAllowed = "copy";
            e.dataTransfer.setData("application/x-wfm-model", JSON.stringify({ modelName: lora.name, modelType: "lora" }));
            item.classList.add("dragging");
        });
        item.addEventListener("dragend", () => item.classList.remove("dragging"));
        item.addEventListener("dblclick", () => placeModelNode(lora.name, "lora"));
        container.appendChild(item);
    }

    if (meta.loras.length >= 1) {
        const sep = document.createElement("div");
        sep.className = "wfm-nlp-info-section-title";
        sep.style.marginTop = "8px";
        sep.textContent = "Multiple LORA";
        container.appendChild(sep);

        const multiItem = document.createElement("div");
        multiItem.className = "wfm-nlp-info-item wfm-nlp-info-item--draggable";
        multiItem.draggable = true;
        multiItem.title = `Drag to canvas to place Lora Loader (LoraManager) with all ${meta.loras.length} loras`;
        multiItem.innerHTML = `<span class="wfm-nlp-info-item-name">All ${meta.loras.length} LoRAs</span><span class="wfm-nlp-info-item-badge">LoraManager</span>`;
        multiItem.addEventListener("dragstart", (e) => {
            e.dataTransfer.effectAllowed = "copy";
            e.dataTransfer.setData("application/x-wfm-lora-multi", JSON.stringify({ loras: meta.loras }));
            multiItem.classList.add("dragging");
        });
        multiItem.addEventListener("dragend", () => multiItem.classList.remove("dragging"));
        multiItem.addEventListener("dblclick", () => placeLoraMgrNode(meta.loras));
        container.appendChild(multiItem);
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
        item.draggable = true;
        item.title = `Drag to canvas to place CLIP Text Encode node`;
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
        item.addEventListener("dragstart", (e) => {
            e.dataTransfer.effectAllowed = "copy";
            e.dataTransfer.setData("application/x-wfm-clip-text", JSON.stringify({ text }));
            item.classList.add("dragging");
        });
        item.addEventListener("dragend", () => item.classList.remove("dragging"));
        item.addEventListener("dblclick", () => placeClipTextEncodeNode(text));
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
// AI Tab
// ============================================

const AI_SETTINGS_KEY = "wfm_ai_settings";
const AI_LANG_NAMES = { ja: "Japanese", en: "English", zh: "Chinese" };
const AI_BACKEND_DEFAULT_URLS = {
    ollama: "http://localhost:11434",
    lmstudio: "http://localhost:1234",
    lemonade: "http://localhost:13305",
    unsloth: "http://localhost:8888",
};
function getAiBackendDefaultUrl(backend) {
    return AI_BACKEND_DEFAULT_URLS[backend] || AI_BACKEND_DEFAULT_URLS.ollama;
}

// Server relays the request, attaching the Unsloth API key from .env so it
// never reaches the frontend — see py/routes/unsloth_routes.py.
async function aiUnslothProxy(baseUrl, path, method, payload) {
    const r = await fetch("/api/wfm/unsloth/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, path, method, payload }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
    return data;
}

// Unlike Ollama/LM Studio/Lemonade (which inline reasoning as <think> tags
// inside content), Unsloth's OpenAI-compatible API returns it in a separate
// `reasoning_content` field. Fold it back into a <think> block so the
// existing Thinking-mode show/strip logic (_aiApplyGenOptions/aiStripThinkingTags)
// still applies uniformly. Without this, a low max_tokens can make the model
// spend its whole budget reasoning and return an empty `content` with no
// visible explanation.
function _aiUnslothContent(message) {
    const reasoning = message?.reasoning_content;
    const content = message?.content || "";
    return reasoning ? `<think>${reasoning}</think>${content}` : content;
}

function isValidAiUrl(url) {
    try {
        const u = new URL(url);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

function loadAiCfg() {
    try { return JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) || "{}"); } catch { return {}; }
}
function saveAiCfg(patch) {
    const d = { ...loadAiCfg(), ...patch };
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(d));
    return d;
}

// Ollamaは `think` (bool) と `options.num_predict` で制御できるが、
// LM Studio/LemonadeはOpenAI互換APIのため max_tokens のみ標準対応。
// thinking mode切替は非対応バックエンド／モデル向けに、出力からの
// <think>タグ除去でも担保する（aiStripThinkingTagsを参照）。
function _aiApplyGenOptions(body, backend, settings) {
    const maxTokens = parseInt(settings?.maxTokens, 10);
    if (backend === "ollama") {
        body.think = !!settings?.thinkingMode;
        if (maxTokens > 0) body.options = { ...(body.options || {}), num_predict: maxTokens };
    } else if (maxTokens > 0) {
        body.max_tokens = maxTokens;
    }
    return body;
}

function aiStripThinkingTags(text) {
    return (text || "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .trim();
}

async function aiCallLLM(url, backend, model, prompt, settings = {}) {
    if (backend === "ollama") {
        const r = await fetch(`${url}/api/generate`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(_aiApplyGenOptions({ model, prompt, stream: false }, backend, settings)),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = (await r.json()).response || "";
        return settings.thinkingMode ? text : aiStripThinkingTags(text);
    } else if (backend === "unsloth") {
        const body = _aiApplyGenOptions({ model, messages: [{ role: "user", content: prompt }], stream: false }, backend, settings);
        const d = await aiUnslothProxy(url, "/v1/chat/completions", "POST", body);
        const text = _aiUnslothContent(d.choices?.[0]?.message);
        return settings.thinkingMode ? text : aiStripThinkingTags(text);
    } else {
        const r = await fetch(`${url}/v1/chat/completions`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(_aiApplyGenOptions({ model, messages: [{ role: "user", content: prompt }], stream: false }, backend, settings)),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        const text = d.choices?.[0]?.message?.content || "";
        return settings.thinkingMode ? text : aiStripThinkingTags(text);
    }
}

function aiFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const b64 = e.target.result.split(",")[1];
            resolve({ base64: b64, mimeType: file.type });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function aiCallVLM(url, backend, model, prompt, base64Image, mimeType, settings = {}) {
    if (backend === "ollama") {
        const r = await fetch(`${url}/api/generate`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(_aiApplyGenOptions({ model, prompt, images: [base64Image], stream: false }, backend, settings)),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = (await r.json()).response || "";
        return settings.thinkingMode ? text : aiStripThinkingTags(text);
    } else if (backend === "unsloth") {
        const body = _aiApplyGenOptions({
            model,
            messages: [{ role: "user", content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
            ]}],
            stream: false,
        }, backend, settings);
        const d = await aiUnslothProxy(url, "/v1/chat/completions", "POST", body);
        const text = _aiUnslothContent(d.choices?.[0]?.message);
        return settings.thinkingMode ? text : aiStripThinkingTags(text);
    } else {
        const r = await fetch(`${url}/v1/chat/completions`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(_aiApplyGenOptions({
                model,
                messages: [{ role: "user", content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
                ]}],
                stream: false,
            }, backend, settings)),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = (await r.json()).choices?.[0]?.message?.content || "";
        return settings.thinkingMode ? text : aiStripThinkingTags(text);
    }
}

async function aiCallChat(url, backend, model, messages, settings = {}) {
    if (backend === "ollama") {
        const r = await fetch(`${url}/api/chat`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(_aiApplyGenOptions({ model, messages, stream: false }, backend, settings)),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = (await r.json()).message?.content || "";
        return settings.thinkingMode ? text : aiStripThinkingTags(text);
    } else if (backend === "unsloth") {
        const body = _aiApplyGenOptions({ model, messages, stream: false }, backend, settings);
        const d = await aiUnslothProxy(url, "/v1/chat/completions", "POST", body);
        const text = _aiUnslothContent(d.choices?.[0]?.message);
        return settings.thinkingMode ? text : aiStripThinkingTags(text);
    } else {
        const r = await fetch(`${url}/v1/chat/completions`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(_aiApplyGenOptions({ model, messages, stream: false }, backend, settings)),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = (await r.json()).choices?.[0]?.message?.content || "";
        return settings.thinkingMode ? text : aiStripThinkingTags(text);
    }
}

// Strips common LLM wrapping/preamble artifacts that survive despite the system prompt.
function cleanAiTranslationOutput(raw) {
    let s = (raw || "").trim();
    s = s.replace(/^(sure[,.]?\s*)?(here('|)s|here is)?\s*(the\s+)?translation\s*:?\s*/i, "");
    s = s.replace(/^(翻訳|译文|翻译)\s*[::]\s*/, "");
    if (s.length >= 2) {
        const first = s[0], last = s[s.length - 1];
        const pairs = { '"': '"', "'": "'", "“": "”", "「": "」" };
        if (pairs[first] === last) s = s.slice(1, -1).trim();
    }
    return s;
}

// Heuristic: if the cleaned output is (near-)identical to the input, the
// model most likely echoed the source instead of translating it.
function aiLooksUntranslated(input, output) {
    const normalize = (s) => s.trim().toLowerCase().replace(/[\s.,!?"'。、！？「」]/g, "");
    const a = normalize(input), b = normalize(output);
    return a.length > 0 && a === b;
}

async function aiFetchModels(url, backend) {
    if (backend === "ollama") {
        const r = await fetch(`${url}/api/tags`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return ((await r.json()).models || []).map(m => m.name);
    } else if (backend === "unsloth") {
        const d = await aiUnslothProxy(url, "/v1/models", "GET");
        return (d.data || []).map(m => m.id);
    } else {
        const r = await fetch(`${url}/v1/models`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return ((await r.json()).data || []).map(m => m.id);
    }
}

// ---- AI skills (Chat system prompt library) ----

async function aiSkillFetchFiles() {
    try {
        const r = await fetch("/api/wfm/skills");
        return r.ok ? await r.json() : [];
    } catch { return []; }
}

async function aiSkillFetchContent(filename) {
    try {
        const r = await fetch(`/api/wfm/skills/content?filename=${encodeURIComponent(filename)}`);
        const d = await r.json();
        return d.content ?? null;
    } catch { return null; }
}

async function aiSkillSaveFile(filename, content) {
    try {
        const r = await fetch("/api/wfm/skills/save", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, content }),
        });
        const d = await r.json();
        return d.status === "ok" ? d.file : null;
    } catch { return null; }
}

async function aiSkillDeleteFile(filename) {
    try {
        await fetch("/api/wfm/skills/delete", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename }),
        });
    } catch { /* ignore */ }
}

function aiSkillStripFrontmatter(content) {
    const m = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    return (m ? content.slice(m[0].length) : content).trim();
}

const renderAiTab = (container) => {
    if (!container.querySelector(".wfm-nlp-ai-layout")) {
        container.innerHTML = `
            <div class="wfm-nlp-ai-layout">
                <!-- Translation sub -->
                <div id="wfm-nlp-ai-translate" class="wfm-nlp-ai-pane">
                    <div class="wfm-nlp-ai-lang-row">
                        <select id="wfm-nlp-ai-src" class="wfm-nlp-ai-sel">
                            <option value="ja">Japanese</option>
                            <option value="en">English</option>
                            <option value="zh">Chinese</option>
                            <option value="free">Free</option>
                        </select>
                        <button id="wfm-nlp-ai-swap" class="wfm-nlp-ai-swap" title="Swap">⇄</button>
                        <select id="wfm-nlp-ai-dst" class="wfm-nlp-ai-sel">
                            <option value="en">English</option>
                            <option value="ja">Japanese</option>
                            <option value="zh">Chinese</option>
                            <option value="free">Free</option>
                        </select>
                    </div>
                    <textarea id="wfm-nlp-ai-input" class="wfm-nlp-ai-textarea" placeholder="Enter text to translate..."></textarea>
                    <div class="wfm-nlp-ai-actions">
                        <button id="wfm-nlp-ai-trans-btn" class="wfm-nlp-ai-btn wfm-nlp-ai-btn-primary">Translate</button>
                        <button id="wfm-nlp-ai-copy-btn" class="wfm-nlp-ai-btn">Copy</button>
                        <span id="wfm-nlp-ai-status" class="wfm-nlp-ai-status"></span>
                    </div>
                    <textarea id="wfm-nlp-ai-output" class="wfm-nlp-ai-textarea wfm-nlp-ai-output" placeholder="Translation result..." readonly></textarea>
                </div>
                <!-- Chat sub -->
                <div id="wfm-nlp-ai-chat" class="wfm-nlp-ai-pane" style="display:none;">
                    <div class="wfm-nlp-ai-row" style="flex-shrink:0;">
                        <select id="wfm-nlp-ai-skill-select" class="wfm-nlp-ai-sel" style="flex:1;width:auto;">
                            <option value="">-- No skill --</option>
                        </select>
                        <button id="wfm-nlp-ai-skill-manage-btn" class="wfm-nlp-ai-btn" title="Manage skills">&#9998;</button>
                    </div>
                    <div id="wfm-nlp-ai-skill-panel" class="wfm-nlp-ai-skill-panel" style="display:none;">
                        <div class="wfm-nlp-ai-row" style="justify-content:space-between;">
                            <span class="wfm-nlp-ai-sec-title">Skills</span>
                            <div style="display:flex;gap:4px;">
                                <button id="wfm-nlp-ai-skill-new-btn" class="wfm-nlp-ai-btn wfm-nlp-ai-btn-primary">+ New</button>
                                <button id="wfm-nlp-ai-skill-close-btn" class="wfm-nlp-ai-btn">&#10005;</button>
                            </div>
                        </div>
                        <div id="wfm-nlp-ai-skill-list" class="wfm-nlp-ai-skill-list"></div>
                        <div id="wfm-nlp-ai-skill-editor" class="wfm-nlp-ai-skill-editor" style="display:none;">
                            <input type="text" id="wfm-nlp-ai-skill-editor-filename" class="wfm-nlp-ai-input" placeholder="filename.md">
                            <textarea id="wfm-nlp-ai-skill-editor-content" class="wfm-nlp-ai-input wfm-nlp-ai-skill-editor-ta" rows="6" placeholder="---&#10;name: My Skill&#10;description: ...&#10;---&#10;&#10;System prompt..."></textarea>
                            <div class="wfm-nlp-ai-actions">
                                <button id="wfm-nlp-ai-skill-editor-save-btn" class="wfm-nlp-ai-btn wfm-nlp-ai-btn-primary">Save</button>
                                <button id="wfm-nlp-ai-skill-editor-delete-btn" class="wfm-nlp-ai-btn wfm-nlp-ai-skill-danger-btn" style="display:none;">Delete</button>
                                <button id="wfm-nlp-ai-skill-editor-cancel-btn" class="wfm-nlp-ai-btn">Cancel</button>
                            </div>
                        </div>
                    </div>
                    <div class="wfm-nlp-ai-chat-msgs" id="wfm-nlp-ai-chat-msgs"></div>
                    <textarea id="wfm-nlp-ai-chat-input" class="wfm-nlp-ai-textarea wfm-nlp-ai-chat-input" placeholder="Type a message..."></textarea>
                    <div class="wfm-nlp-ai-actions">
                        <button id="wfm-nlp-ai-chat-send" class="wfm-nlp-ai-btn wfm-nlp-ai-btn-primary">Send</button>
                        <button id="wfm-nlp-ai-chat-clear" class="wfm-nlp-ai-btn">Clear</button>
                        <span id="wfm-nlp-ai-chat-status" class="wfm-nlp-ai-status"></span>
                    </div>
                </div>
                <!-- TOOLS sub -->
                <div id="wfm-nlp-ai-vlm" class="wfm-nlp-ai-pane" style="display:none;">
                    <div class="wfm-nlp-ai-vlm-drop" id="wfm-nlp-ai-vlm-drop">
                        <img id="wfm-nlp-ai-vlm-preview" style="display:none;max-width:100%;max-height:100%;object-fit:contain;pointer-events:none;">
                        <span id="wfm-nlp-ai-vlm-label" class="wfm-nlp-ai-vlm-label">Drop PNG / JPG / WebP</span>
                        <input type="file" id="wfm-nlp-ai-vlm-file" accept="image/png,image/jpeg,image/webp" style="display:none;">
                    </div>
                    <div id="wfm-nlp-ai-wc-inputs" style="display:none;flex-direction:column;gap:5px;">
                        <div class="wfm-nlp-ai-row">
                            <span class="wfm-nlp-ai-lbl">Name</span>
                            <input type="text" id="wfm-nlp-ai-wc-name" class="wfm-nlp-ai-input" style="flex:1;" placeholder="e.g. sports">
                        </div>
                        <div class="wfm-nlp-ai-row">
                            <span class="wfm-nlp-ai-lbl">Count</span>
                            <input type="number" id="wfm-nlp-ai-wc-count" class="wfm-nlp-ai-input wfm-nlp-ai-wc-count" value="20" min="1" max="200">
                        </div>
                    </div>
                    <div class="wfm-nlp-ai-row">
                        <select id="wfm-nlp-ai-vlm-task" class="wfm-nlp-ai-sel" style="flex:1;">
                            <option value="describe">Describe image</option>
                            <option value="prompt">Create prompt</option>
                            <option value="tags">Create tags</option>
                            <option value="wildcard">Create wildcards</option>
                        </select>
                        <button id="wfm-nlp-ai-vlm-run" class="wfm-nlp-ai-btn wfm-nlp-ai-btn-primary">Run</button>
                    </div>
                    <span id="wfm-nlp-ai-vlm-status" class="wfm-nlp-ai-status"></span>
                    <textarea id="wfm-nlp-ai-vlm-result" class="wfm-nlp-ai-textarea wfm-nlp-ai-output" style="flex:1;min-height:60px;" placeholder="Result..." readonly></textarea>
                    <button id="wfm-nlp-ai-vlm-copy" class="wfm-nlp-ai-btn" style="align-self:flex-end;">Copy</button>
                </div>
                <!-- Settings sub -->
                <div id="wfm-nlp-ai-settings" class="wfm-nlp-ai-pane wfm-nlp-ai-settings-pane" style="display:none;">
                    <div class="wfm-nlp-ai-sec">
                        <div class="wfm-nlp-ai-sec-title">Backend</div>
                        <div class="wfm-nlp-ai-radio-row">
                            <label class="wfm-nlp-ai-radio"><input type="radio" name="wfm-nlp-ai-backend" value="ollama"> Ollama</label>
                            <label class="wfm-nlp-ai-radio"><input type="radio" name="wfm-nlp-ai-backend" value="lmstudio"> LM Studio</label>
                            <label class="wfm-nlp-ai-radio"><input type="radio" name="wfm-nlp-ai-backend" value="lemonade"> Lemonade</label>
                            <label class="wfm-nlp-ai-radio"><input type="radio" name="wfm-nlp-ai-backend" value="unsloth"> Unsloth</label>
                        </div>
                    </div>
                    <div class="wfm-nlp-ai-sec">
                        <div class="wfm-nlp-ai-sec-title">Connection</div>
                        <input type="text" id="wfm-nlp-ai-url" class="wfm-nlp-ai-input" placeholder="http://localhost:11434">
                        <div class="wfm-nlp-ai-row">
                            <button id="wfm-nlp-ai-test" class="wfm-nlp-ai-btn">Test connection</button>
                            <span id="wfm-nlp-ai-test-result" class="wfm-nlp-ai-status"></span>
                        </div>
                    </div>
                    <div class="wfm-nlp-ai-sec">
                        <div class="wfm-nlp-ai-sec-title">Model</div>
                        <div class="wfm-nlp-ai-row">
                            <select id="wfm-nlp-ai-model" class="wfm-nlp-ai-sel" style="flex:1;">
                                <option value="">-- Select model --</option>
                            </select>
                            <button id="wfm-nlp-ai-model-refresh" class="wfm-nlp-ai-btn">↻</button>
                        </div>
                    </div>
                    <div class="wfm-nlp-ai-sec">
                        <div class="wfm-nlp-ai-sec-title">Generation</div>
                        <div class="wfm-nlp-ai-row">
                            <label class="wfm-nlp-ai-lbl" style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                                <input type="checkbox" id="wfm-nlp-ai-thinking-mode"> Thinking mode
                            </label>
                        </div>
                        <div class="wfm-nlp-ai-row">
                            <span class="wfm-nlp-ai-lbl">Max tokens</span>
                            <input type="number" id="wfm-nlp-ai-max-tokens" class="wfm-nlp-ai-input" min="0" step="1" placeholder="0 = unlimited" style="flex:1;">
                        </div>
                    </div>
                    <div class="wfm-nlp-ai-sec">
                        <div class="wfm-nlp-ai-sec-title">Free language</div>
                        <div class="wfm-nlp-ai-row">
                            <span class="wfm-nlp-ai-lbl">Source</span>
                            <input type="text" id="wfm-nlp-ai-free-src" class="wfm-nlp-ai-input" placeholder="e.g. French" style="flex:1;">
                        </div>
                        <div class="wfm-nlp-ai-row">
                            <span class="wfm-nlp-ai-lbl">Target</span>
                            <input type="text" id="wfm-nlp-ai-free-dst" class="wfm-nlp-ai-input" placeholder="e.g. German" style="flex:1;">
                        </div>
                    </div>
                    <div class="wfm-nlp-ai-sec">
                        <button id="wfm-nlp-ai-save" class="wfm-nlp-ai-btn wfm-nlp-ai-btn-primary" style="width:100%;">Save</button>
                    </div>
                </div>
            </div>
        `;
        setupAiHandlers(container);
    }
    renderAiSubContent();
};

const renderAiSubContent = () => {
    if (!panelEl) return;
    const panes = { "ai-translate": "wfm-nlp-ai-translate", "ai-chat": "wfm-nlp-ai-chat", "ai-vlm": "wfm-nlp-ai-vlm", "ai-settings": "wfm-nlp-ai-settings" };
    for (const [key, id] of Object.entries(panes)) {
        const el = panelEl.querySelector(`#${id}`);
        if (el) el.style.display = state.aiSubTab === key ? "flex" : "none";
    }
};

const setupAiHandlers = (container) => {
    const cfg = loadAiCfg();

    // Restore settings
    const backendRadios = container.querySelectorAll("input[name='wfm-nlp-ai-backend']");
    backendRadios.forEach(r => { if (r.value === (cfg.backend || "ollama")) r.checked = true; });
    const urlInput = container.querySelector("#wfm-nlp-ai-url");
    if (urlInput && cfg.backendUrl) urlInput.value = cfg.backendUrl;
    else if (urlInput) urlInput.value = "http://localhost:11434";

    // Backend change → switch URL to the new backend's default
    backendRadios.forEach(r => {
        r.addEventListener("change", () => {
            if (urlInput) urlInput.value = getAiBackendDefaultUrl(r.value);
        });
    });

    const freeSrcInput = container.querySelector("#wfm-nlp-ai-free-src");
    const freeDstInput = container.querySelector("#wfm-nlp-ai-free-dst");
    if (freeSrcInput && cfg.freeSrcLang) freeSrcInput.value = cfg.freeSrcLang;
    if (freeDstInput && cfg.freeDstLang) freeDstInput.value = cfg.freeDstLang;

    const thinkingModeInput = container.querySelector("#wfm-nlp-ai-thinking-mode");
    if (thinkingModeInput) thinkingModeInput.checked = !!cfg.thinkingMode;
    const maxTokensInput = container.querySelector("#wfm-nlp-ai-max-tokens");
    if (maxTokensInput && cfg.maxTokens) maxTokensInput.value = cfg.maxTokens;

    const srcSel = container.querySelector("#wfm-nlp-ai-src");
    const dstSel = container.querySelector("#wfm-nlp-ai-dst");
    if (srcSel && cfg.srcLang) srcSel.value = cfg.srcLang;
    if (dstSel && cfg.dstLang) dstSel.value = cfg.dstLang;

    // Swap
    container.querySelector("#wfm-nlp-ai-swap")?.addEventListener("click", () => {
        const tmp = srcSel.value; srcSel.value = dstSel.value; dstSel.value = tmp;
        const inputEl = container.querySelector("#wfm-nlp-ai-input");
        const outputEl = container.querySelector("#wfm-nlp-ai-output");
        const tmpTxt = inputEl.value; inputEl.value = outputEl.value; outputEl.value = tmpTxt;
        saveAiCfg({ srcLang: srcSel.value, dstLang: dstSel.value });
    });

    srcSel?.addEventListener("change", () => saveAiCfg({ srcLang: srcSel.value }));
    dstSel?.addEventListener("change", () => saveAiCfg({ dstLang: dstSel.value }));

    // Translate
    container.querySelector("#wfm-nlp-ai-trans-btn")?.addEventListener("click", async () => {
        const text = container.querySelector("#wfm-nlp-ai-input")?.value?.trim();
        if (!text) { showToast("テキストを入力してください", "error"); return; }

        const c = loadAiCfg();
        const backend = c.backend || "ollama";
        const url = c.backendUrl || getAiBackendDefaultUrl(backend);
        const model = c.model;
        if (!isValidAiUrl(url)) { showToast("URLは http:// または https:// で始まる必要があります", "error"); return; }
        if (!model) { showToast("Please select a model in Settings", "error"); return; }

        const srcLang = srcSel?.value || "ja";
        const dstLang = dstSel?.value || "en";
        const srcName = srcLang === "free" ? (c.freeSrcLang || "").trim() : AI_LANG_NAMES[srcLang];
        const dstName = dstLang === "free" ? (c.freeDstLang || "English").trim() || "English" : AI_LANG_NAMES[dstLang];
        const fromPart = srcName ? ` from ${srcName}` : "";
        const systemPrompt = `You are a professional translator. Translate the text the user sends${fromPart} into ${dstName}. `
            + `Reply with ONLY the translated text and nothing else: no explanations, no notes, no preamble like "Here is the translation:", `
            + `no surrounding quotes, and do not repeat or echo the original text.`;
        const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: text }];

        const transBtn = container.querySelector("#wfm-nlp-ai-trans-btn");
        const statusEl = container.querySelector("#wfm-nlp-ai-status");
        const outputEl = container.querySelector("#wfm-nlp-ai-output");
        transBtn.disabled = true;
        statusEl.textContent = "Translating...";
        statusEl.className = "wfm-nlp-ai-status wfm-nlp-ai-working";
        outputEl.value = "";

        try {
            const result = await aiCallChat(url, backend, model, messages, c);
            const cleaned = cleanAiTranslationOutput(result);
            outputEl.value = cleaned;
            statusEl.textContent = "完了";
            statusEl.className = "wfm-nlp-ai-status wfm-nlp-ai-ok";
            if (srcLang !== dstLang && aiLooksUntranslated(text, cleaned)) {
                showToast("モデルが原文をそのまま返しました。翻訳されていない可能性があります。別のモデルをお試しください。", "error");
            }
        } catch (err) {
            statusEl.textContent = `エラー: ${err.message}`;
            statusEl.className = "wfm-nlp-ai-status wfm-nlp-ai-err";
        } finally {
            transBtn.disabled = false;
        }
    });

    // Copy
    container.querySelector("#wfm-nlp-ai-copy-btn")?.addEventListener("click", () => {
        const text = container.querySelector("#wfm-nlp-ai-output")?.value;
        if (!text) { showToast("No text to copy", "error"); return; }
        navigator.clipboard.writeText(text).then(() => showToast("Copied", "success"));
    });

    // Model refresh helper
    const refreshModels = async () => {
        const c = loadAiCfg();
        const backend = container.querySelector("input[name='wfm-nlp-ai-backend']:checked")?.value || "ollama";
        const url = container.querySelector("#wfm-nlp-ai-url")?.value?.trim() || "";
        const modelSel = container.querySelector("#wfm-nlp-ai-model");
        try {
            const models = await aiFetchModels(url, backend);
            modelSel.innerHTML = '<option value="">-- Select model --</option>';
            models.forEach(name => {
                const opt = document.createElement("option");
                opt.value = name; opt.textContent = name;
                if (name === c.model) opt.selected = true;
                modelSel.appendChild(opt);
            });
            if (!models.length) showToast("No models found", "error");
        } catch (err) {
            showToast("Failed to fetch models: " + err.message, "error");
        }
    };

    // Connection test
    container.querySelector("#wfm-nlp-ai-test")?.addEventListener("click", async () => {
        const testBtn = container.querySelector("#wfm-nlp-ai-test");
        const resultEl = container.querySelector("#wfm-nlp-ai-test-result");
        const backend = container.querySelector("input[name='wfm-nlp-ai-backend']:checked")?.value || "ollama";
        const url = container.querySelector("#wfm-nlp-ai-url")?.value?.trim() || "";
        if (!isValidAiUrl(url)) {
            resultEl.textContent = "http:// または https:// で始まるURLを入力してください";
            resultEl.className = "wfm-nlp-ai-status wfm-nlp-ai-err";
            return;
        }
        testBtn.disabled = true;
        resultEl.textContent = "Connecting...";
        resultEl.className = "wfm-nlp-ai-status wfm-nlp-ai-working";
        try {
            const models = await aiFetchModels(url, backend);
            resultEl.textContent = `OK (${models.length} models)`;
            resultEl.className = "wfm-nlp-ai-status wfm-nlp-ai-ok";
            await refreshModels();
        } catch (err) {
            resultEl.textContent = `失敗: ${err.message}`;
            resultEl.className = "wfm-nlp-ai-status wfm-nlp-ai-err";
        } finally {
            testBtn.disabled = false;
        }
    });

    // Model refresh button
    container.querySelector("#wfm-nlp-ai-model-refresh")?.addEventListener("click", () => refreshModels());

    // Save settings
    container.querySelector("#wfm-nlp-ai-save")?.addEventListener("click", () => {
        const backend = container.querySelector("input[name='wfm-nlp-ai-backend']:checked")?.value || "ollama";
        const url = container.querySelector("#wfm-nlp-ai-url")?.value?.trim() || "";
        const model = container.querySelector("#wfm-nlp-ai-model")?.value || "";
        const freeSrcLang = container.querySelector("#wfm-nlp-ai-free-src")?.value?.trim() || "";
        const freeDstLang = container.querySelector("#wfm-nlp-ai-free-dst")?.value?.trim() || "";
        const thinkingMode = !!container.querySelector("#wfm-nlp-ai-thinking-mode")?.checked;
        const maxTokens = Math.max(0, parseInt(container.querySelector("#wfm-nlp-ai-max-tokens")?.value, 10) || 0);
        if (url && !isValidAiUrl(url)) {
            showToast("URLは http:// または https:// で始まる必要があります", "error");
            return;
        }
        saveAiCfg({ backend, backendUrl: url, model, freeSrcLang, freeDstLang, thinkingMode, maxTokens });
        showToast("Settings saved", "success");
    });

    // Auto-load models if settings exist
    if (cfg.backendUrl && cfg.backend) refreshModels().catch(() => {});

    // ---- Chat handlers ----
    let chatHistory = [];
    const chatMsgsEl  = container.querySelector("#wfm-nlp-ai-chat-msgs");
    const chatInputEl = container.querySelector("#wfm-nlp-ai-chat-input");
    const chatSendBtn = container.querySelector("#wfm-nlp-ai-chat-send");
    const chatClearBtn= container.querySelector("#wfm-nlp-ai-chat-clear");
    const chatStatusEl= container.querySelector("#wfm-nlp-ai-chat-status");

    const appendChatBubble = (role, content) => {
        const div = document.createElement("div");
        div.className = `wfm-nlp-ai-chat-msg wfm-nlp-ai-chat-msg-${role}`;
        div.textContent = content;
        chatMsgsEl.appendChild(div);
        chatMsgsEl.scrollTop = chatMsgsEl.scrollHeight;
    };

    const sendChatMessage = async () => {
        const text = chatInputEl?.value?.trim();
        if (!text) return;
        const c = loadAiCfg();
        const backend = c.backend || "ollama";
        const url = c.backendUrl || getAiBackendDefaultUrl(backend);
        const model = c.model;
        if (!isValidAiUrl(url)) { showToast("URLは http:// または https:// で始まる必要があります", "error"); return; }
        if (!model) { showToast("Please select a model in Settings", "error"); return; }

        chatInputEl.value = "";
        chatHistory.push({ role: "user", content: text });
        appendChatBubble("user", text);

        chatSendBtn.disabled = true;
        chatStatusEl.textContent = "Thinking...";
        chatStatusEl.className = "wfm-nlp-ai-status wfm-nlp-ai-working";

        try {
            const skillPrompt = await getActiveSkillSystemPrompt();
            const messagesToSend = skillPrompt
                ? [{ role: "system", content: skillPrompt }, ...chatHistory]
                : chatHistory;
            const reply = await aiCallChat(url, backend, model, messagesToSend, c);
            chatHistory.push({ role: "assistant", content: reply });
            appendChatBubble("assistant", reply);
            chatStatusEl.textContent = "";
            chatStatusEl.className = "wfm-nlp-ai-status";
        } catch (err) {
            chatHistory.pop();
            if (chatMsgsEl.lastChild) chatMsgsEl.removeChild(chatMsgsEl.lastChild);
            chatInputEl.value = text;
            chatStatusEl.textContent = `エラー: ${err.message}`;
            chatStatusEl.className = "wfm-nlp-ai-status wfm-nlp-ai-err";
        } finally {
            chatSendBtn.disabled = false;
        }
    };

    chatSendBtn?.addEventListener("click", sendChatMessage);
    chatInputEl?.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
    chatClearBtn?.addEventListener("click", () => {
        chatHistory = [];
        if (chatMsgsEl) chatMsgsEl.innerHTML = "";
        if (chatStatusEl) { chatStatusEl.textContent = ""; chatStatusEl.className = "wfm-nlp-ai-status"; }
    });

    // ---- Skill handlers (Chat system prompt library) ----
    let skillFilesNlp = [];
    let skillEditingFilenameNlp = null;
    let activeSkillCacheNlp = null; // { filename, content }

    const skillSelectEl = container.querySelector("#wfm-nlp-ai-skill-select");
    const skillManageBtn = container.querySelector("#wfm-nlp-ai-skill-manage-btn");
    const skillPanelEl = container.querySelector("#wfm-nlp-ai-skill-panel");
    const skillCloseBtn = container.querySelector("#wfm-nlp-ai-skill-close-btn");
    const skillNewBtn = container.querySelector("#wfm-nlp-ai-skill-new-btn");
    const skillListEl = container.querySelector("#wfm-nlp-ai-skill-list");
    const skillEditorEl = container.querySelector("#wfm-nlp-ai-skill-editor");
    const skillEditorFilenameEl = container.querySelector("#wfm-nlp-ai-skill-editor-filename");
    const skillEditorContentEl = container.querySelector("#wfm-nlp-ai-skill-editor-content");
    const skillEditorSaveBtn = container.querySelector("#wfm-nlp-ai-skill-editor-save-btn");
    const skillEditorDeleteBtn = container.querySelector("#wfm-nlp-ai-skill-editor-delete-btn");
    const skillEditorCancelBtn = container.querySelector("#wfm-nlp-ai-skill-editor-cancel-btn");

    async function getActiveSkillSystemPrompt() {
        const filename = skillSelectEl?.value || "";
        if (!filename) return null;
        if (activeSkillCacheNlp?.filename === filename) return activeSkillCacheNlp.content;
        const raw = await aiSkillFetchContent(filename);
        const content = aiSkillStripFrontmatter(raw || "");
        activeSkillCacheNlp = { filename, content };
        return content;
    }

    function renderSkillList() {
        if (!skillListEl) return;
        skillListEl.innerHTML = "";
        if (skillFilesNlp.length === 0) {
            skillListEl.innerHTML = `<div style="padding:8px;font-size:11px;color:var(--descrip-text,#888);">No skills yet.</div>`;
            return;
        }
        for (const f of skillFilesNlp) {
            const item = document.createElement("div");
            item.className = "wfm-nlp-ai-skill-item";
            item.title = f.description || "";
            item.innerHTML = `<span class="wfm-nlp-ai-skill-item-name">${f.name}</span><span>&#9998;</span>`;
            item.addEventListener("click", async () => {
                const content = await aiSkillFetchContent(f.filename);
                openSkillEditor(f.filename, content ?? "");
            });
            skillListEl.appendChild(item);
        }
    }

    function openSkillEditor(filename, content) {
        skillEditingFilenameNlp = filename || null;
        if (!skillEditorEl) return;
        if (skillEditorFilenameEl) skillEditorFilenameEl.value = filename || "";
        if (skillEditorContentEl) skillEditorContentEl.value = content || "";
        if (skillEditorDeleteBtn) skillEditorDeleteBtn.style.display = filename ? "" : "none";
        skillEditorEl.style.display = "";
        skillEditorFilenameEl?.focus();
    }

    function closeSkillEditor() {
        skillEditingFilenameNlp = null;
        if (skillEditorEl) skillEditorEl.style.display = "none";
    }

    function populateSkillSelect() {
        if (!skillSelectEl) return;
        const c = loadAiCfg();
        const wanted = skillSelectEl.value || c.activeSkillFilename || "";
        skillSelectEl.innerHTML = `<option value="">-- No skill --</option>` +
            skillFilesNlp.map(f => `<option value="${f.filename}" title="${f.description || ""}">${f.name}</option>`).join("");
        skillSelectEl.value = skillFilesNlp.some(f => f.filename === wanted) ? wanted : "";
        activeSkillCacheNlp = null;
    }

    async function refreshSkillFiles() {
        skillFilesNlp = await aiSkillFetchFiles();
        renderSkillList();
        populateSkillSelect();
    }

    refreshSkillFiles();

    skillSelectEl?.addEventListener("change", () => {
        saveAiCfg({ activeSkillFilename: skillSelectEl.value });
        activeSkillCacheNlp = null;
    });

    skillManageBtn?.addEventListener("click", () => {
        if (!skillPanelEl) return;
        const show = skillPanelEl.style.display === "none";
        skillPanelEl.style.display = show ? "" : "none";
        if (show) refreshSkillFiles();
    });

    skillCloseBtn?.addEventListener("click", () => {
        if (skillPanelEl) skillPanelEl.style.display = "none";
    });

    skillNewBtn?.addEventListener("click", () => {
        openSkillEditor(null, "---\nname: \ndescription: \n---\n\n");
    });

    skillEditorSaveBtn?.addEventListener("click", async () => {
        let filename = (skillEditorFilenameEl?.value || "").trim();
        const content = skillEditorContentEl?.value || "";
        if (!filename) { showToast("ファイル名を入力してください", "error"); return; }
        if (!/\.md$/i.test(filename)) filename += ".md";
        if (!/^[\w\-. ]+\.md$/i.test(filename)) { showToast("無効なファイル名です", "error"); return; }
        const saved = await aiSkillSaveFile(filename, content);
        if (saved) {
            showToast(`保存しました: ${filename}`, "success");
            closeSkillEditor();
            await refreshSkillFiles();
            skillSelectEl.value = filename;
            saveAiCfg({ activeSkillFilename: filename });
            activeSkillCacheNlp = null;
        } else {
            showToast("保存に失敗しました", "error");
        }
    });

    skillEditorDeleteBtn?.addEventListener("click", async () => {
        if (!skillEditingFilenameNlp) return;
        if (!confirm(`Delete "${skillEditingFilenameNlp}"?`)) return;
        await aiSkillDeleteFile(skillEditingFilenameNlp);
        showToast(`削除しました: ${skillEditingFilenameNlp}`, "success");
        if (skillSelectEl.value === skillEditingFilenameNlp) {
            saveAiCfg({ activeSkillFilename: "" });
            activeSkillCacheNlp = null;
        }
        closeSkillEditor();
        await refreshSkillFiles();
    });

    skillEditorCancelBtn?.addEventListener("click", () => closeSkillEditor());

    // ---- VLM handlers ----
    let vlmImage = null; // { base64, mimeType }

    const vlmDrop    = container.querySelector("#wfm-nlp-ai-vlm-drop");
    const vlmPreview = container.querySelector("#wfm-nlp-ai-vlm-preview");
    const vlmLabel   = container.querySelector("#wfm-nlp-ai-vlm-label");
    const vlmFile    = container.querySelector("#wfm-nlp-ai-vlm-file");
    const vlmTaskSel = container.querySelector("#wfm-nlp-ai-vlm-task");
    const vlmRunBtn  = container.querySelector("#wfm-nlp-ai-vlm-run");
    const vlmStatus  = container.querySelector("#wfm-nlp-ai-vlm-status");
    const vlmResult  = container.querySelector("#wfm-nlp-ai-vlm-result");
    const vlmCopy    = container.querySelector("#wfm-nlp-ai-vlm-copy");
    const wcInputs   = container.querySelector("#wfm-nlp-ai-wc-inputs");
    const wcNameEl   = container.querySelector("#wfm-nlp-ai-wc-name");
    const wcCountEl  = container.querySelector("#wfm-nlp-ai-wc-count");

    const updateVlmTaskUI = () => {
        const isWc = vlmTaskSel?.value === "wildcard";
        if (vlmDrop) vlmDrop.style.display = isWc ? "none" : "";
        if (wcInputs) wcInputs.style.display = isWc ? "flex" : "none";
    };
    vlmTaskSel?.addEventListener("change", updateVlmTaskUI);
    updateVlmTaskUI();

    const loadVlmImage = async (file) => {
        if (!file || !file.type.startsWith("image/")) return;
        const data = await aiFileToBase64(file);
        vlmImage = data;
        vlmPreview.src = `data:${data.mimeType};base64,${data.base64}`;
        vlmPreview.style.display = "block";
        vlmLabel.style.display = "none";
    };

    vlmDrop?.addEventListener("click", () => vlmFile?.click());
    vlmFile?.addEventListener("change", e => { if (e.target.files[0]) loadVlmImage(e.target.files[0]); });
    vlmDrop?.addEventListener("dragover", e => { e.preventDefault(); vlmDrop.classList.add("drag-over"); });
    vlmDrop?.addEventListener("dragleave", () => vlmDrop.classList.remove("drag-over"));
    vlmDrop?.addEventListener("drop", e => {
        e.preventDefault();
        vlmDrop.classList.remove("drag-over");
        const file = e.dataTransfer.files[0];
        if (file) loadVlmImage(file);
    });

    const VLM_PROMPTS = {
        describe: "Describe this image in detail.",
        prompt: "Create a detailed Stable Diffusion image generation prompt based on this image. Output only the prompt text, nothing else.",
        tags: "Generate a list of descriptive tags for this image. Output only comma-separated tags in English, nothing else.",
    };

    vlmRunBtn?.addEventListener("click", async () => {
        const task = vlmTaskSel?.value || "describe";
        const c = loadAiCfg();
        const backend = c.backend || "ollama";
        const url = c.backendUrl || getAiBackendDefaultUrl(backend);
        const model = c.model;
        if (!isValidAiUrl(url)) { showToast("URLは http:// または https:// で始まる必要があります", "error"); return; }
        if (!model) { showToast("Please select a model in Settings", "error"); return; }

        if (task === "wildcard") {
            const name  = wcNameEl?.value?.trim() || "";
            const count = Math.max(1, parseInt(wcCountEl?.value) || 20);
            if (!name) { showToast("Please enter a wildcard name", "error"); return; }

            vlmRunBtn.disabled = true;
            vlmStatus.textContent = "Running...";
            vlmStatus.className = "wfm-nlp-ai-status wfm-nlp-ai-working";
            vlmResult.value = "";

            const prompt = `Generate ${count} wildcard entries for the category "${name}". Output only plain text in English, one entry per line, no numbers, no markdown, no asterisks, no bold, nothing else.`;
            try {
                const result = await aiCallLLM(url, backend, model, prompt, c);
                vlmResult.value = result.trim()
                    .split("\n")
                    .map(l => l.replace(/\*\*/g, "").replace(/^\*\s*/, "").replace(/^\d+\.\s*/, "").trim())
                    .filter(l => l.length > 0)
                    .join("\n");
                vlmStatus.textContent = "完了";
                vlmStatus.className = "wfm-nlp-ai-status wfm-nlp-ai-ok";
            } catch (err) {
                vlmStatus.textContent = `エラー: ${err.message}`;
                vlmStatus.className = "wfm-nlp-ai-status wfm-nlp-ai-err";
            } finally {
                vlmRunBtn.disabled = false;
            }
            return;
        }

        if (!vlmImage) { showToast("Please drop an image", "error"); return; }

        vlmRunBtn.disabled = true;
        vlmStatus.textContent = "Running...";
        vlmStatus.className = "wfm-nlp-ai-status wfm-nlp-ai-working";
        vlmResult.value = "";

        try {
            const result = await aiCallVLM(url, backend, model, VLM_PROMPTS[task], vlmImage.base64, vlmImage.mimeType, c);
            vlmResult.value = result.trim();
            vlmStatus.textContent = "完了";
            vlmStatus.className = "wfm-nlp-ai-status wfm-nlp-ai-ok";
        } catch (err) {
            vlmStatus.textContent = `エラー: ${err.message}`;
            vlmStatus.className = "wfm-nlp-ai-status wfm-nlp-ai-err";
        } finally {
            vlmRunBtn.disabled = false;
        }
    });

    vlmCopy?.addEventListener("click", () => {
        const text = vlmResult?.value;
        if (!text) { showToast("No text to copy", "error"); return; }
        navigator.clipboard.writeText(text).then(() => showToast("Copied", "success"));
    });
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
        .wfm-nlp-title-pending {
            cursor: grab;
            color: #66aaff;
        }
        .wfm-nlp-title-pending::after {
            content: " ●";
            font-size: 7px;
            color: #4caf50;
            vertical-align: super;
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
            height: 110px;
            flex-shrink: 0;
            border: 2px dashed var(--border-color, #4e4e4e);
            border-radius: 6px;
            margin: 8px 8px 0;
            cursor: pointer;
            overflow: hidden;
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
        .wfm-nlp-info-item--draggable {
            cursor: grab;
            transition: background 0.12s;
            user-select: none;
        }
        .wfm-nlp-info-item--draggable:hover {
            background: var(--comfy-input-bg, #333);
        }
        .wfm-nlp-info-item--draggable.dragging,
        .wfm-nlp-info-prompt-item.dragging {
            opacity: 0.5;
            background: var(--comfy-input-bg, #333);
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
            cursor: grab;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: background 0.12s;
            user-select: none;
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
        /* AI Tab */
        .wfm-nlp-ai-layout {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        }
        .wfm-nlp-ai-pane {
            display: flex;
            flex-direction: column;
            flex: 1;
            overflow: hidden;
            gap: 6px;
            padding: 8px;
        }
        .wfm-nlp-ai-settings-pane {
            overflow-y: auto;
        }
        .wfm-nlp-ai-lang-row {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-shrink: 0;
        }
        .wfm-nlp-ai-sel {
            flex: 1;
            padding: 4px 6px;
            background: var(--comfy-input-bg, #2a2a2a);
            border: 1px solid var(--border-color, #4e4e4e);
            border-radius: 3px;
            color: var(--input-text, #ddd);
            font-size: 11px;
            outline: none;
        }
        .wfm-nlp-ai-swap {
            flex-shrink: 0;
            padding: 4px 6px;
            font-size: 14px;
        }
        .wfm-nlp-ai-textarea {
            flex: 1;
            min-height: 80px;
            padding: 6px 8px;
            background: var(--comfy-input-bg, #2a2a2a);
            border: 1px solid var(--border-color, #4e4e4e);
            border-radius: 3px;
            color: var(--input-text, #ddd);
            font-size: 11px;
            font-family: inherit;
            resize: none;
            outline: none;
            line-height: 1.5;
            box-sizing: border-box;
        }
        .wfm-nlp-ai-textarea:focus {
            border-color: var(--p-button-background, #4a9eff);
        }
        .wfm-nlp-ai-output {
            background: var(--comfy-menu-bg, #1e1e1e);
            color: var(--descrip-text, #aaa);
        }
        .wfm-nlp-ai-output:focus { border-color: var(--border-color, #4e4e4e); }
        .wfm-nlp-ai-actions {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
        }
        .wfm-nlp-ai-status {
            font-size: 10px;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .wfm-nlp-ai-working { color: var(--wfm-warning, #ffa502); }
        .wfm-nlp-ai-ok      { color: #2ed573; }
        .wfm-nlp-ai-err     { color: #ff4757; }
        .wfm-nlp-ai-btn {
            padding: 4px 10px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid var(--border-color, #555);
            border-radius: 3px;
            background: none;
            color: var(--descrip-text, #aaa);
            transition: background 0.15s, color 0.15s;
            white-space: nowrap;
        }
        .wfm-nlp-ai-btn:hover {
            background: rgba(74,158,255,0.2);
            color: #4a9eff;
            border-color: #4a9eff;
        }
        .wfm-nlp-ai-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .wfm-nlp-ai-btn-primary {
            background: var(--p-button-background, #4a9eff);
            color: #fff;
            border-color: var(--p-button-background, #4a9eff);
        }
        .wfm-nlp-ai-btn-primary:hover { background: #3a8eef; border-color: #3a8eef; color: #fff; }
        .wfm-nlp-ai-coming {
            display: flex;
            flex: 1;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            color: var(--descrip-text, #888);
            text-align: center;
            padding: 16px;
        }
        .wfm-nlp-ai-sec {
            display: flex;
            flex-direction: column;
            gap: 5px;
            padding: 8px 0;
            border-bottom: 1px solid var(--border-color, #3a3a3a);
        }
        .wfm-nlp-ai-sec:last-child { border-bottom: none; }
        .wfm-nlp-ai-sec-title {
            font-size: 9px;
            font-weight: 700;
            color: var(--descrip-text, #888);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .wfm-nlp-ai-radio-row {
            display: flex;
            gap: 12px;
        }
        .wfm-nlp-ai-radio {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            color: var(--input-text, #ddd);
            cursor: pointer;
        }
        .wfm-nlp-ai-input {
            padding: 5px 8px;
            background: var(--comfy-input-bg, #2a2a2a);
            border: 1px solid var(--border-color, #4e4e4e);
            border-radius: 3px;
            color: var(--input-text, #ddd);
            font-size: 11px;
            outline: none;
            box-sizing: border-box;
        }
        .wfm-nlp-ai-input:focus { border-color: var(--p-button-background, #4a9eff); }
        .wfm-nlp-ai-row {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .wfm-nlp-ai-lbl {
            font-size: 10px;
            color: var(--descrip-text, #888);
            white-space: nowrap;
            width: 28px;
            flex-shrink: 0;
        }
        /* VLM drop zone */
        .wfm-nlp-ai-vlm-drop {
            height: 110px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px dashed var(--border-color, #4e4e4e);
            border-radius: 6px;
            cursor: pointer;
            overflow: hidden;
            transition: border-color 0.15s, background 0.15s;
            position: relative;
        }
        .wfm-nlp-ai-vlm-drop:hover,
        .wfm-nlp-ai-vlm-drop.drag-over {
            border-color: var(--p-button-background, #4a9eff);
            background: rgba(74,158,255,0.04);
        }
        .wfm-nlp-ai-vlm-label {
            font-size: 11px;
            color: var(--descrip-text, #999);
            pointer-events: none;
        }
        /* Chat */
        .wfm-nlp-ai-chat-msgs {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-height: 0;
            padding: 2px;
        }
        .wfm-nlp-ai-chat-msg {
            max-width: 92%;
            padding: 6px 8px;
            border-radius: 6px;
            font-size: 11px;
            line-height: 1.5;
            word-break: break-word;
            white-space: pre-wrap;
        }
        .wfm-nlp-ai-chat-msg-user {
            align-self: flex-end;
            background: var(--p-button-background, #4a9eff);
            color: #fff;
        }
        .wfm-nlp-ai-chat-msg-assistant {
            align-self: flex-start;
            background: var(--comfy-input-bg, #2a2a2a);
            border: 1px solid var(--border-color, #4e4e4e);
            color: var(--input-text, #ddd);
        }
        .wfm-nlp-ai-chat-input {
            min-height: 50px;
            max-height: 100px;
            flex: none;
            flex-shrink: 0;
        }
        /* Wildcard count */
        .wfm-nlp-ai-wc-count {
            width: 60px;
        }
        /* AI skills */
        .wfm-nlp-ai-skill-panel {
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 6px;
            border: 1px solid var(--border-color, #4e4e4e);
            border-radius: 4px;
            background: var(--comfy-menu-bg, #1e1e1e);
        }
        .wfm-nlp-ai-skill-list {
            max-height: 120px;
            overflow-y: auto;
            border: 1px solid var(--border-color, #4e4e4e);
            border-radius: 3px;
        }
        .wfm-nlp-ai-skill-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 4px;
            padding: 4px 6px;
            font-size: 11px;
            color: var(--input-text, #ddd);
            border-bottom: 1px solid var(--border-color, #3a3a3a);
            cursor: pointer;
        }
        .wfm-nlp-ai-skill-item:last-child { border-bottom: none; }
        .wfm-nlp-ai-skill-item:hover { background: rgba(74,158,255,0.1); }
        .wfm-nlp-ai-skill-item-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .wfm-nlp-ai-skill-editor {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .wfm-nlp-ai-skill-editor-ta {
            font-family: monospace;
            resize: vertical;
            min-height: 90px;
        }
        .wfm-nlp-ai-skill-danger-btn {
            color: #ff4757;
            border-color: #ff4757;
        }
    `;
    document.head.appendChild(style);
};

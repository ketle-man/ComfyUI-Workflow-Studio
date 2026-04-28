/**
 * ComfyUI Workflow - Format detection, conversion, and analysis
 */

// Cache for /object_info (loaded once, shared)
let _objectInfoCache = null;

async function _loadObjectInfo() {
    if (_objectInfoCache) return _objectInfoCache;
    try {
        const res = await fetch("/object_info");
        if (res.ok) {
            _objectInfoCache = await res.json();
        }
    } catch {}
    return _objectInfoCache || {};
}

/**
 * Get ordered widget (non-link) input names for a node class from object_info.
 * These correspond to widgets_values in UI-format nodes.
 */
function _getWidgetInputNames(objectInfo, classType) {
    const info = objectInfo[classType];
    if (!info) return [];
    const names = [];
    const required = info.input?.required || {};
    const optional = info.input?.optional || {};

    // Required inputs: skip types that are linked (have uppercase first letter = node output types)
    for (const [name, spec] of Object.entries(required)) {
        const type = Array.isArray(spec) ? spec[0] : spec;
        // Link types are strings like "MODEL", "CLIP", "CONDITIONING", "LATENT", "IMAGE", etc.
        // Widget types are: "INT", "FLOAT", "STRING", "BOOLEAN", or an array of choices
        if (Array.isArray(type)) {
            // Combo/enum widget
            names.push(name);
        } else if (typeof type === "string") {
            const upper = type.toUpperCase();
            if (upper === "INT" || upper === "FLOAT" || upper === "STRING" || upper === "BOOLEAN" || upper === "COMBO") {
                names.push(name);
            }
            // Other uppercase types (MODEL, CLIP, etc.) are link inputs, skip
        }
    }

    // Optional inputs that are widgets
    for (const [name, spec] of Object.entries(optional)) {
        const type = Array.isArray(spec) ? spec[0] : spec;
        if (Array.isArray(type)) {
            names.push(name);
        } else if (typeof type === "string") {
            const upper = type.toUpperCase();
            if (upper === "INT" || upper === "FLOAT" || upper === "STRING" || upper === "BOOLEAN") {
                names.push(name);
            }
        }
    }

    return names;
}

/**
 * Get ordered widget input types for a node class (parallel to _getWidgetInputNames).
 * Returns type info: "INT", "FLOAT", "STRING", "BOOLEAN", or "COMBO".
 */
function _getWidgetInputTypes(objectInfo, classType) {
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
            if (upper === "INT" || upper === "FLOAT" || upper === "STRING" || upper === "BOOLEAN" || upper === "COMBO") {
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
            if (upper === "INT" || upper === "FLOAT" || upper === "STRING" || upper === "BOOLEAN" || upper === "COMBO") {
                types.push(upper);
            }
        }
    }
    return types;
}

/**
 * Detect if a widget value is a frontend-only extra (like "control_after_generate").
 * These values appear in widgets_values but are not in object_info inputs.
 * Common extras: "fixed", "increment", "decrement", "randomize" after seed/INT fields.
 */
const _CONTROL_AFTER_GENERATE = new Set(["fixed", "increment", "decrement", "randomize"]);

function _isExtraWidgetValue(val, expectedType) {
    if (expectedType === "INT" || expectedType === "FLOAT") {
        // If we expect a number but got a string like "fixed", it's a control widget
        if (typeof val === "string" && _CONTROL_AFTER_GENERATE.has(val)) {
            return true;
        }
    }
    return false;
}

/**
 * Flatten a subgraph-containing UI workflow into a plain UI workflow.
 *
 * Subgraph nodes have a UUID type matching definitions.subgraphs[].id.
 * Internal links use object format {id, origin_id, origin_slot, target_id, target_slot, type}.
 * Parent links use array format [id, srcNode, srcSlot, dstNode, dstSlot, type].
 * Virtual boundary nodes: -10 (input), -20 (output).
 *
 * Strategy: expand internal nodes into the parent, redirect parent links through
 * the boundary ports, and convert internal links from object to array format.
 * Widget values in internal nodes are preserved as-is (they are synced at save time
 * by ComfyUI frontend). convertUiToApi handles widget mapping via object_info.
 */
function _flattenSubgraphs(workflow) {
    const defs = workflow.definitions?.subgraphs;
    if (!defs || defs.length === 0) return workflow;

    const subgraphMap = {};
    for (const sg of defs) subgraphMap[sg.id] = sg;

    if (!workflow.nodes.some(n => subgraphMap[n.type])) return workflow;

    // Deep clone
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

        // Remap internal node IDs using ComfyUI's "parentId:internalId" format
        const nodeIdRemap = {};
        for (const iNode of sgDef.nodes) {
            nodeIdRemap[iNode.id] = `${node.id}:${iNode.id}`;
        }

        // === Map subgraph input ports → internal target {nodeId, slot} ===
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

        // === Map subgraph output ports → internal source {nodeId, slot} ===
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

        // === Redirect parent links ===
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

        // === Add internal nodes (remapped IDs) ===
        for (const iNode of sgDef.nodes) {
            const remapped = JSON.parse(JSON.stringify(iNode));
            remapped.id = nodeIdRemap[iNode.id];
            addedNodes.push(remapped);
        }

        // === Add internal links (object format → array format) ===
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

export const comfyWorkflow = {
    detectFormat(workflow, filename) {
        if (!workflow || typeof workflow !== "object") return "unknown";
        if (Array.isArray(workflow.nodes) && workflow.links !== undefined) {
            // App format: UI-based structure with definitions (subgraphs) or linearMode
            if (workflow.definitions || workflow.extra?.linearMode === true) return "app";
            if (filename && /\.app\.json$/i.test(filename)) return "app";
            return "ui";
        }
        // API format: top-level keys are node IDs with class_type
        const keys = Object.keys(workflow);
        if (keys.length > 0 && keys.every((k) => workflow[k]?.class_type)) return "api";
        return "unknown";
    },

    /**
     * Convert UI-format workflow to API-format using /object_info for accurate widget mapping.
     */
    async convertUiToApi(workflow) {
        if (!workflow.nodes || !workflow.links) return {};

        // Flatten subgraphs before conversion
        const flatWorkflow = _flattenSubgraphs(workflow);

        const objectInfo = await _loadObjectInfo();

        // Build link map: dstNode -> { dstSlot -> [srcNodeId, srcSlot] }
        const linkMap = {};
        for (const link of flatWorkflow.links) {
            const [id, srcNode, srcSlot, dstNode, dstSlot] = link;
            if (!linkMap[dstNode]) linkMap[dstNode] = {};
            linkMap[dstNode][dstSlot] = [String(srcNode), srcSlot];
        }

        const api = {};
        for (const node of flatWorkflow.nodes) {
            if (node.mode === 4) continue; // muted/bypassed
            // Skip note/display-only nodes that are unknown to ComfyUI backend
            if (!objectInfo[node.type] && _isDisplayOnlyNode(node)) continue;
            const nodeId = String(node.id);
            const inputs = {};

            // 1. Process linked inputs (node.inputs = link slots)
            const nodeLinks = linkMap[node.id] || {};
            const inputDefs = node.inputs || [];
            const linkedInputNames = new Set();
            inputDefs.forEach((inp, idx) => {
                if (nodeLinks[idx]) {
                    inputs[inp.name] = nodeLinks[idx];
                    linkedInputNames.add(inp.name);
                }
            });

            // 2. Map widgets_values to widget input names using object_info
            const widgets = node.widgets_values || [];
            if (widgets.length > 0) {
                const widgetNames = _getWidgetInputNames(objectInfo, node.type);

                if (widgetNames.length > 0) {
                    // Use object_info to map widgets_values correctly.
                    // widgets_values may contain extra frontend-only values like
                    // "control_after_generate" (e.g. "fixed", "increment", "randomize")
                    // that don't appear in object_info. We consume values sequentially
                    // and match by expected type to handle these extras.
                    const widgetTypes = _getWidgetInputTypes(objectInfo, node.type);
                    let wIdx = 0;
                    for (let nIdx = 0; nIdx < widgetNames.length; nIdx++) {
                        if (wIdx >= widgets.length) break;
                        const name = widgetNames[nIdx];
                        const expectedType = widgetTypes[nIdx];
                        // Skip if this input is already linked
                        if (linkedInputNames.has(name)) {
                            // Still consume widget value(s) since widgets_values
                            // includes entries for linked inputs too
                            wIdx++;
                            // Also skip control_after_generate if present
                            if (wIdx < widgets.length && _isExtraWidgetValue(widgets[wIdx], expectedType)) {
                                wIdx++;
                            }
                            continue;
                        }
                        // Check if current widget value matches expected type
                        // If not, skip widget values until we find a match (handles hidden widgets)
                        let val = widgets[wIdx];
                        wIdx++;

                        // Heuristic: if expected is number but got string like "fixed"/"randomize",
                        // that's a control_after_generate - skip it and take next
                        if (_isExtraWidgetValue(val, expectedType)) {
                            if (wIdx < widgets.length) {
                                val = widgets[wIdx];
                                wIdx++;
                            }
                        }
                        // For COMBO inputs, validate the value against the available choices.
                        // Dynamic COMBO options (e.g. Impact Pack's "Select to add Wildcard") may
                        // differ between the saved workflow and the current ComfyUI instance
                        // (e.g. "Select Wildcard 🟢 Full Cache" vs "Select Wildcard"), causing
                        // "Prompt outputs failed validation". Fall back to first choice when mismatch.
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
                    // object_info didn't have this node, try static mapping fallback
                    const mapping = _getWidgetMapping(node.type);
                    if (mapping) {
                        mapping.forEach((key, idx) => {
                            if (idx < widgets.length && key && !(key in inputs)) {
                                inputs[key] = widgets[idx];
                            }
                        });
                    }
                }
            }

            api[nodeId] = {
                class_type: node.type,
                inputs,
                _meta: { title: node.title || node.type },
            };
        }
        return api;
    },

    convertApiToUi(api) {
        const nodes = [];
        const links = [];
        let linkId = 1;
        const sortedIds = Object.keys(api).sort((a, b) => Number(a) - Number(b));

        sortedIds.forEach((id, idx) => {
            const node = api[id];
            const row = Math.floor(idx / 5);
            const col = idx % 5;

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

            // Separate linked inputs from widget values
            for (const [key, val] of Object.entries(node.inputs || {})) {
                if (Array.isArray(val) && val.length === 2) {
                    // This is a link reference
                    const srcNodeId = Number(val[0]);
                    const srcSlot = val[1];
                    uiNode.inputs.push({ name: key, type: "*", link: linkId });
                    links.push([linkId, srcNodeId, srcSlot, Number(id), uiNode.inputs.length - 1, "*"]);
                    linkId++;
                } else {
                    uiNode.widgets_values.push(val);
                }
            }

            nodes.push(uiNode);
        });

        return { nodes, links, groups: [], config: {}, extra: {}, version: 0.4 };
    },

    getAllNodes(workflow) {
        const nodes = [];
        if (workflow.nodes) {
            // UI format
            for (const n of workflow.nodes) {
                nodes.push({ id: String(n.id), type: n.type, title: n.title || n.type });
            }
        } else {
            // API format
            for (const [id, n] of Object.entries(workflow)) {
                if (n?.class_type) {
                    nodes.push({ id, type: n.class_type, title: n._meta?.title || n.class_type });
                }
            }
        }
        return nodes.sort((a, b) => Number(a.id) - Number(b.id));
    },

    analyzeWorkflow(workflow) {
        const result = {
            checkpoint_nodes: [],
            prompt_nodes: [],
            sampler_nodes: [],
            latent_nodes: [],
            lora_nodes: [],
            vae_nodes: [],
            save_nodes: [],
            load_image_nodes: [],
            text_encoder_nodes: [],
            diffusion_model_nodes: [],
            controlnet_nodes: [],
            all_nodes: [],
        };

        if (!workflow) return result;

        // Build sampler connections for prompt classification
        const samplerPositiveRef = {};
        const samplerNegativeRef = {};

        for (const [id, node] of Object.entries(workflow)) {
            if (!node?.class_type) continue;
            const ct = node.class_type;
            const inputs = node.inputs || {};
            const title = node._meta?.title || ct;

            result.all_nodes.push({ id, type: ct, title });

            if (ct === "KSampler" || ct === "KSamplerAdvanced") {
                if (Array.isArray(inputs.positive)) samplerPositiveRef[inputs.positive[0]] = true;
                if (Array.isArray(inputs.negative)) samplerNegativeRef[inputs.negative[0]] = true;

                result.sampler_nodes.push({
                    id, type: ct, title,
                    seed: inputs.seed, steps: inputs.steps, cfg: inputs.cfg,
                    sampler_name: inputs.sampler_name, scheduler: inputs.scheduler,
                    denoise: inputs.denoise,
                });
            }
        }

        for (const [id, node] of Object.entries(workflow)) {
            if (!node?.class_type) continue;
            const ct = node.class_type;
            const inputs = node.inputs || {};
            const title = node._meta?.title || ct;

            if (ct.includes("CheckpointLoader")) {
                result.checkpoint_nodes.push({
                    id, type: ct, title,
                    ckpt_name: inputs.ckpt_name,
                });
            }

            if (ct === "CLIPTextEncode") {
                let role = "unknown";
                if (samplerPositiveRef[id]) role = "positive";
                else if (samplerNegativeRef[id]) role = "negative";
                else if (/pos|正/i.test(title)) role = "positive";
                else if (/neg|負/i.test(title)) role = "negative";
                result.prompt_nodes.push({
                    id, type: ct, title, role,
                    text: inputs.text,
                    textKey: "text",
                });
            }

            // ImpactWildcardEncode / ImpactWildcardProcessor — treat wildcard_text as prompt
            if (ct === "ImpactWildcardEncode" || ct === "ImpactWildcardProcessor") {
                let role = "unknown";
                if (samplerPositiveRef[id]) role = "positive";
                else if (samplerNegativeRef[id]) role = "negative";
                else if (/pos|正/i.test(title)) role = "positive";
                else if (/neg|負/i.test(title)) role = "negative";
                result.prompt_nodes.push({
                    id, type: ct, title, role,
                    text: inputs.wildcard_text,
                    textKey: "wildcard_text",
                });
            }

            if (ct === "EmptyLatentImage" || ct === "EmptySD3LatentImage") {
                result.latent_nodes.push({
                    id, type: ct, title,
                    width: inputs.width, height: inputs.height,
                    batch_size: inputs.batch_size,
                });
            }

            if (ct === "LoraLoader" || ct === "LoraLoaderModelOnly") {
                result.lora_nodes.push({
                    id, type: ct, title,
                    lora_name: inputs.lora_name,
                    strength_model: inputs.strength_model,
                    strength_clip: inputs.strength_clip,
                });
            }

            if (ct === "VAELoader") {
                result.vae_nodes.push({ id, type: ct, title, vae_name: inputs.vae_name });
            }

            if (ct === "SaveImage" || ct === "PreviewImage") {
                result.save_nodes.push({ id, type: ct, title });
            }

            if (ct === "LoadImage" || ct === "LoadImageMask"
                || (ct.toLowerCase().includes("load") && ct.toLowerCase().includes("image") && inputs.image !== undefined)) {
                result.load_image_nodes.push({
                    id, type: ct, title, image: inputs.image,
                });
            }

            if (ct === "DualCLIPLoader" || ct === "CLIPLoader") {
                result.text_encoder_nodes.push({
                    id, type: ct, title,
                    clip_name1: inputs.clip_name1 || inputs.clip_name,
                    clip_name2: inputs.clip_name2,
                });
            }

            if (ct === "UNETLoader" || ct === "UnetLoaderGGUF") {
                result.diffusion_model_nodes.push({
                    id, type: ct, title, unet_name: inputs.unet_name,
                });
            }

            if (ct.includes("ControlNetLoader")) {
                result.controlnet_nodes.push({
                    id, type: ct, title,
                    control_net_name: inputs.control_net_name,
                });
            }
        }

        result.all_nodes.sort((a, b) => Number(a.id) - Number(b.id));
        return result;
    },

    applyParams(workflow, params) {
        for (const [key, value] of Object.entries(params)) {
            // Parse key format: nodeId.paramName
            const dotIdx = key.indexOf(".");
            if (dotIdx === -1) continue;
            const nodeId = key.slice(0, dotIdx);
            const paramName = key.slice(dotIdx + 1);
            if (workflow[nodeId]?.inputs) {
                workflow[nodeId].inputs[paramName] = value;
            }
        }
    },

    applyRandomSeeds(workflow) {
        for (const node of Object.values(workflow)) {
            if (!node?.inputs) continue;
            if ("seed" in node.inputs) {
                node.inputs.seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
            }
            if ("noise_seed" in node.inputs) {
                node.inputs.noise_seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
            }
        }
    },
};

/** Check if a node is display-only (no connected inputs or outputs) */
function _isDisplayOnlyNode(node) {
    const hasConnectedOutput = node.outputs?.some(o => o.links && o.links.length > 0);
    const hasConnectedInput = node.inputs?.some(i => i.link != null);
    return !hasConnectedOutput && !hasConnectedInput;
}

function _getWidgetMapping(nodeType) {
    const mappings = {
        CheckpointLoaderSimple: ["ckpt_name"],
        KSampler: ["seed", "steps", "cfg", "sampler_name", "scheduler", "denoise"],
        CLIPTextEncode: ["text"],
        EmptyLatentImage: ["width", "height", "batch_size"],
        LoraLoader: ["lora_name", "strength_model", "strength_clip"],
        VAELoader: ["vae_name"],
        SaveImage: ["filename_prefix"],
        LoadImage: ["image", "upload"],
        UNETLoader: ["unet_name", "weight_dtype"],
        ResolutionSelector: ["aspect_ratio", "megapixels"],
        EmptySD3LatentImage: ["width", "height", "batch_size"],
        CLIPLoader: ["clip_name", "type", "device"],
        FluxGuidance: ["guidance"],
        CFGNorm: ["strength"],
    };
    return mappings[nodeType] || null;
}

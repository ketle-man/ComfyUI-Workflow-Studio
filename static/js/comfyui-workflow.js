/**
 * ComfyUI Workflow - Format detection, conversion, and analysis
 */

// Cache for /object_info (loaded once, shared)
let _objectInfoCache = null;

// convertUiToApi() の COMBO フォールバック（未一致時に選択肢の先頭へ無警告で差し替え）が
// ckpt_name に対して発生した場合の記録。呼び出し元が読み込み直後に確認して警告表示できるよう、
// 直近の convertUiToApi() 呼び出し分だけを保持する。
let _lastCheckpointSubstitutions = [];

// convertUiToApi() で除外された Bypass(mode:4) / Mute(mode:2) ノードの記録。
// API形式には mode 情報が残らないため、呼び出し元がRaw JSON表示時に
// 「このワークフローにはバイパス/ミュート中のノードがあった」と伝えられるよう、
// 直近の convertUiToApi() 呼び出し分だけを保持する。
let _lastBypassedNodes = [];
let _lastMutedNodes = [];

/**
 * Trace a link's source through any Bypass-mode (mode 4) nodes, matching each bypassed
 * node's output slot to an input slot of the same type and following the connection
 * upstream (recursively, for chained bypasses). Mirrors ComfyUI's own Bypass behavior,
 * where a bypassed node is removed but its wires are reconnected end-to-end.
 * Returns null when no pass-through source exists (the matching input is unconnected),
 * in which case the caller should treat the input as unlinked.
 */
function _resolveBypassSource(nodeById, linkMap, nodeId, slot, visited) {
    const idStr = String(nodeId);
    const node = nodeById[idStr];
    if (!node || node.mode !== 4) return [idStr, slot];
    if (visited.has(idStr)) return null; // circular bypass chain guard

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
    return _resolveBypassSource(nodeById, linkMap, upstream[0], upstream[1], visited);
}

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
            if (upper === "INT" || upper === "FLOAT" || upper === "STRING" || upper === "BOOLEAN" || upper === "COMBO" || upper === "COMFY_DYNAMICCOMBO_V3") {
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
            if (upper === "INT" || upper === "FLOAT" || upper === "STRING" || upper === "BOOLEAN" || upper === "COMFY_DYNAMICCOMBO_V3") {
                names.push(name);
            }
        }
    }

    return names;
}

/**
 * Get ordered widget input types for a node class (parallel to _getWidgetInputNames).
 * Returns type info: "INT", "FLOAT", "STRING", "BOOLEAN", "COMBO", or "COMFY_DYNAMICCOMBO_V3".
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

/**
 * Resolve the sub-input names for a DynamicCombo's currently-selected option.
 * objectInfo spec shape: ["COMFY_DYNAMICCOMBO_V3", { options: [{ key, inputs: { required: {...} } }, ...] }]
 */
function _getDynamicComboSubNames(objectInfo, classType, widgetName, selectedKey) {
    const info = objectInfo[classType];
    const spec = info?.input?.required?.[widgetName] || info?.input?.optional?.[widgetName];
    const options = spec?.[1]?.options;
    if (!Array.isArray(options)) return [];
    const opt = options.find((o) => o.key === selectedKey) || options[0];
    return Object.keys(opt?.inputs?.required || {});
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
 * True when a subgraph-template node's widget input (by name) is actually wired end-to-end —
 * either redirected from an outer parent-graph link, or wired to another internal node within the
 * same subgraph template (boundary links from the subgraph's own input ports, origin_id === -10,
 * don't count: those resolve to a plain injected widget value instead, handled separately).
 */
function _isLinkedWidgetName(remappedNode, sgDef, origInternalId, redirectedTargets, name) {
    const inputDef = (remappedNode.inputs || []).find((i) => i.widget && i.name === name);
    if (!inputDef) return false;
    const slotIdx = remappedNode.inputs.indexOf(inputDef);
    if (redirectedTargets.has(`${remappedNode.id}:${slotIdx}`)) return true;
    return inputDef.link != null && (sgDef.links || []).some(
        (l) => l.id === inputDef.link && String(l.target_id) === origInternalId && l.target_slot === slotIdx && l.origin_id !== -10
    );
}

/**
 * Simulate consuming widgets_values against object_info's widget name/type order, accounting for
 * frontend-only "control_after_generate" extras (e.g. "fixed" after a seed) that occupy one extra
 * slot and shift every later index by one. When skipLinked is true, widgets the caller's
 * isLinkedName() flags as linked are treated as consuming zero widgets_values entries (the
 * "modern" ComfyUI format); with it false, every widget is assumed present (the "legacy full"
 * format some subgraph templates store). Returns each widget's actual widgets_values index
 * (or -1 if the array ran out), plus consumedIndices — every index a widget's own turn advanced
 * past (normally just its value, but two when a control_after_generate extra was skipped) — and
 * how many entries were consumed in total (the latter is how callers detect which of the two
 * formats a given widgets_values array actually follows).
 *
 * consumedIndices matters because convertUiToApi's own widget-mapping loop only skips a
 * control_after_generate extra while advancing past the *next* widget's turn (see its
 * `!linkedSlotNames.has(name)` branch) — if that next widget turns out to be linked, the loop
 * `continue`s before ever looking at the extra, leaving it unconsumed and silently misread as the
 * value of whatever non-linked widget comes after. Stripping a linked widget's position alone
 * (without its swallowed extra) reproduces exactly that bug one level up, in the injection step.
 */
function _simulateWidgetValues(widgetNames, widgetTypes, widgetsValues, isLinkedName, skipLinked) {
    let idx = 0;
    const positions = {};
    const consumedIndices = {};
    for (let nIdx = 0; nIdx < widgetNames.length; nIdx++) {
        const name = widgetNames[nIdx];
        if (skipLinked && isLinkedName(name)) {
            positions[name] = -1;
            consumedIndices[name] = [];
            continue;
        }
        if (idx >= widgetsValues.length) {
            positions[name] = -1;
            consumedIndices[name] = [];
            continue;
        }
        const consumed = [idx];
        let p = idx;
        idx++;
        if (_isExtraWidgetValue(widgetsValues[p], widgetTypes[nIdx]) && idx < widgetsValues.length) {
            consumed.push(idx);
            p = idx;
            idx++;
        }
        positions[name] = p;
        consumedIndices[name] = consumed;
    }
    return { positions, consumedIndices, consumed: idx };
}

/**
 * Strip a subgraph-template node's widgets_values entries belonging to widget slots that are
 * actually linked (see _isLinkedWidgetName), so convertUiToApi's own widget-mapping loop — which
 * assumes the "modern" format where linked widgets contribute zero widgets_values entries — maps
 * every remaining widget to the right value instead of drifting by however many linked entries
 * were left in place. No-op when widgets_values already follows the modern format (nothing to
 * strip) or the node has no widget inputs at all.
 */
function _stripLegacyLinkedWidgetValues(objectInfo, remappedNode, sgDef, origInternalId, redirectedTargets) {
    const widgetsValues = remappedNode.widgets_values;
    const allWidgetInputs = (remappedNode.inputs || []).filter((i) => i.widget);
    if (!widgetsValues || allWidgetInputs.length === 0) return;

    const widgetNames = _getWidgetInputNames(objectInfo, remappedNode.type);
    const widgetTypes = _getWidgetInputTypes(objectInfo, remappedNode.type);
    const isLinkedName = (name) => _isLinkedWidgetName(remappedNode, sgDef, origInternalId, redirectedTargets, name);

    // If skipping linked widgets already accounts for every entry, widgets_values is already in
    // the modern (no dangling linked entries) format — nothing to strip.
    const skipSim = _simulateWidgetValues(widgetNames, widgetTypes, widgetsValues, isLinkedName, true);
    if (skipSim.consumed === widgetsValues.length) return;

    // Otherwise it's "legacy full": recompute with every widget present to find exactly which
    // indices the linked ones occupy — including any control_after_generate extra a linked
    // widget's own turn would have consumed, which must be dropped too (see _simulateWidgetValues).
    const fullSim = _simulateWidgetValues(widgetNames, widgetTypes, widgetsValues, isLinkedName, false);
    const linkedIdx = new Set();
    for (const name of widgetNames) {
        if (isLinkedName(name)) {
            for (const i of fullSim.consumedIndices[name] || []) linkedIdx.add(i);
        }
    }
    if (linkedIdx.size > 0) {
        remappedNode.widgets_values = widgetsValues.filter((_, i) => !linkedIdx.has(i));
    }
}

/**
 * Find the widgets_values array index that corresponds to a given widget input name on a
 * subgraph-template node, for injecting an outer subgraph-node's un-linked widget value into it.
 * Assumes _stripLegacyLinkedWidgetValues has already normalized widgets_values to the modern
 * format (linked widgets contribute zero entries), matching what convertUiToApi's own
 * widget-mapping loop expects.
 */
function _findInjectedWidgetIndex(objectInfo, remappedNode, sgDef, origInternalId, redirectedTargets, targetName) {
    const widgetNames = _getWidgetInputNames(objectInfo, remappedNode.type);
    const widgetTypes = _getWidgetInputTypes(objectInfo, remappedNode.type);
    const widgetsValues = remappedNode.widgets_values || [];
    const isLinkedName = (name) => _isLinkedWidgetName(remappedNode, sgDef, origInternalId, redirectedTargets, name);
    const sim = _simulateWidgetValues(widgetNames, widgetTypes, widgetsValues, isLinkedName, true);
    return sim.positions[targetName] ?? -1;
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
 *
 * Widget values: the outer subgraph node's own widgets_values hold the values actually
 * set via the subgraph's collapsed form (what the user sees/edits). The internal nodes'
 * widgets_values, stored in the subgraph template (definitions.subgraphs[].nodes), are
 * only stale defaults from when the template was authored — ComfyUI does NOT keep them
 * synced in saved workflow JSON. Un-linked outer widget inputs are therefore copied onto
 * the matching internal node's widgets_values (via objectInfo to get the correct index,
 * since the internal node's real class type is known). Linked outer inputs are left to
 * the "Redirect parent links" step above, which takes priority.
 */
function _flattenSubgraphs(workflow, objectInfo) {
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
        // Track which {internal node, input slot} pairs end up resolved by a real outer
        // link after redirection — needed below to tell apart "boundary-only" links
        // (prompt/model-name ports that are actually widget values, see injection step)
        // from ports that truly carry a link end-to-end (e.g. width/height wired to a
        // ResolutionSelector node).
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

        // === Add internal nodes (remapped IDs) ===
        const remappedByOrigId = {};
        for (const iNode of sgDef.nodes) {
            const remapped = JSON.parse(JSON.stringify(iNode));
            remapped.id = nodeIdRemap[iNode.id];

            // Propagate the outer subgraph-node's Mute/Bypass mode onto every internal node.
            // Without this, muting or bypassing a whole subgraph instance (e.g. disabling one of
            // several parallel Flux.2 sampling pipelines via Ctrl-B) leaves its internal nodes at
            // their template-authored mode (normally 0/enabled), so convertUiToApi's mode check
            // below never excludes them — they end up in the API payload and can be picked up by
            // node-existence-based UI logic (e.g. "first matching node found") ahead of the nodes
            // actually driving the enabled pipeline.
            if (node.mode === 2 || node.mode === 4) {
                remapped.mode = node.mode;
            }

            // Some subgraph-template nodes store widgets_values in the "legacy full" format (one
            // entry per widget input, including ones that are actually linked — either redirected
            // from an outer parent-graph link, or wired to another internal node within the same
            // subgraph template, e.g. EmptyFlux2LatentImage.width <- GetImageSize). Strip those
            // entries so convertUiToApi's widget-mapping loop (which assumes the "modern" format:
            // linked widgets contribute zero entries) doesn't drift every subsequent widget by
            // however many linked entries were left in place — see _stripLegacyLinkedWidgetValues.
            // Boundary links that terminate in a plain widget value (e.g. prompt text) are NOT
            // treated as linked here — those resolve via the outer-value injection step below.
            _stripLegacyLinkedWidgetValues(objectInfo, remapped, sgDef, String(iNode.id), redirectedTargets);

            addedNodes.push(remapped);
            remappedByOrigId[iNode.id] = remapped;
        }

        // === Inject outer subgraph-node widget values into internal nodes ===
        // Only un-linked widget inputs — linked ones are already redirected above.
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

            // Compute where in widgets_values this widget's value actually lives — accounting for
            // linked slots (which consume no entry) and control_after_generate-style extras
            // (which shift later indices by one). See _findInjectedWidgetIndex for why a plain
            // name-index lookup silently corrupts sibling widgets here.
            const iWidgetIdx = _findInjectedWidgetIndex(
                objectInfo, remappedNode, sgDef, origInternalId, redirectedTargets, targetInputDef.name
            );
            if (iWidgetIdx === -1) return;

            if (!remappedNode.widgets_values) remappedNode.widgets_values = [];
            remappedNode.widgets_values[iWidgetIdx] = outerValue;
        });

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
            // App format: simplified web-app-style UI (linearMode) or .app.json filename.
            // A workflow that merely *contains* subgraphs (definitions.subgraphs) is still
            // a normal node graph — convertUiToApi() flattens subgraphs before conversion,
            // so it's treated as "ui" rather than blocked as unsupported "app" format.
            if (workflow.extra?.linearMode === true) return "app";
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
    getLastCheckpointSubstitutions() {
        return _lastCheckpointSubstitutions;
    },

    getLastBypassedNodes() {
        return _lastBypassedNodes;
    },

    getLastMutedNodes() {
        return _lastMutedNodes;
    },

    async convertUiToApi(workflow) {
        _lastCheckpointSubstitutions = [];
        _lastBypassedNodes = [];
        _lastMutedNodes = [];
        if (!workflow.nodes || !workflow.links) return {};

        const objectInfo = await _loadObjectInfo();

        // Flatten subgraphs before conversion (needs objectInfo to correctly map outer
        // subgraph-node widget values onto internal nodes' widgets_values indices)
        const flatWorkflow = _flattenSubgraphs(workflow, objectInfo);

        // Build link map: dstNode -> { dstSlot -> [srcNodeId, srcSlot] }
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
            // Mute (mode 2): excluded, no pass-through — matches ComfyUI itself, where
            // muting a node with required downstream dependents is expected to error.
            // Bypass (mode 4): excluded here too, but its wires are rerouted below via
            // _resolveBypassSource() so downstream nodes reconnect to its upstream source.
            if (node.mode === 2) {
                _lastMutedNodes.push({ nodeId: String(node.id), title: node.title || node.type });
                continue;
            }
            if (node.mode === 4) {
                _lastBypassedNodes.push({ nodeId: String(node.id), title: node.title || node.type });
                continue;
            }
            // Skip note/display-only nodes that are unknown to ComfyUI backend
            if (!objectInfo[node.type] && _isDisplayOnlyNode(node)) continue;
            const nodeId = String(node.id);
            const inputs = {};

            // 1. Process linked inputs (node.inputs = link slots)
            const nodeLinks = linkMap[node.id] || {};
            const inputDefs = node.inputs || [];
            const linkedInputNames = new Set();
            // UI slot inputs with an actual link don't have a widget value entry in
            // widgets_values (modern ComfyUI format). Track these separately so the
            // widget-mapping loop won't advance wIdx for them.
            const linkedSlotNames = new Set();
            inputDefs.forEach((inp, idx) => {
                if (nodeLinks[idx]) {
                    const resolved = _resolveBypassSource(nodeById, linkMap, nodeLinks[idx][0], nodeLinks[idx][1], new Set());
                    if (!resolved) return; // Bypass chain with no upstream source — leave unlinked
                    inputs[inp.name] = resolved;
                    linkedInputNames.add(inp.name);
                    linkedSlotNames.add(inp.name);
                }
            });

            // 2. Map widgets_values to widget input names using object_info
            const widgets = node.widgets_values || [];
            if (widgets.length > 0) {
                // Lora Loader (LoraManager): use __lm_widget_ids from node properties
                // widgets_values: [autocomplete_meta_obj, text_str, loras_array]
                // API format:     {__lm_autocomplete_meta_text: obj, text: str, loras: {__value__: arr}}
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
                            if (!linkedSlotNames.has(name)) {
                                // Not a UI slot input — old-style linked input that still
                                // occupies a slot in widgets_values; consume it.
                                wIdx++;
                                if (wIdx < widgets.length && _isExtraWidgetValue(widgets[wIdx], expectedType)) {
                                    wIdx++;
                                }
                            }
                            // UI slot inputs with a real link have no widget value entry — don't advance wIdx.
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
                        // DynamicCombo (e.g. SaveImageAdvanced's "format"): val is the selected
                        // option's key (e.g. "png"). Per comfy_api/latest/_io.py
                        // DynamicCombo._expand_schema_for_dynamic, the backend looks up flat
                        // dot-prefixed keys ("format", "format.bit_depth", ...) in the raw
                        // inputs dict and assembles them into a single dict itself at execution
                        // time — it does NOT accept a pre-built dict under the "format" key.
                        if (expectedType === "COMFY_DYNAMICCOMBO_V3") {
                            inputs[name] = val;
                            const subNames = _getDynamicComboSubNames(objectInfo, node.type, name, val);
                            for (const subName of subNames) {
                                if (wIdx >= widgets.length) break;
                                inputs[`${name}.${subName}`] = widgets[wIdx];
                                wIdx++;
                            }
                            continue;
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
                                    if (name === "ckpt_name") {
                                        _lastCheckpointSubstitutions.push({
                                            nodeId: String(node.id),
                                            title: node.title || node.type,
                                            original: val,
                                            replaced: choices[0],
                                        });
                                    }
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
                } // end else (non-LoraManager path)
            }

            // ImpactWildcardEncode / ImpactWildcardProcessor: widgets[0] is always wildcard_text.
            // Always overwrite: object_info ordering may misalign when widget order differs between
            // impact-pack versions; widgets[0] is stable across all known versions.
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
            inpaint_encode_nodes: [],
            mask_editor_one_nodes: [],
            text_encoder_nodes: [],
            diffusion_model_nodes: [],
            controlnet_nodes: [],
            hypernetwork_nodes: [],
            all_nodes: [],
        };

        if (!workflow) return result;

        // === Pass 1: Collect sampler refs + all_nodes ===
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

                // KSamplerAdvanced uses noise_seed instead of seed
                const seedKey = "seed" in inputs ? "seed" : "noise_seed";
                const seedVal = inputs.seed ?? inputs.noise_seed;
                // seed/steps/cfg/denoise are sometimes wired to Primitive nodes (e.g. a shared
                // "steps" value switched between two LoRA presets) instead of holding a direct
                // number — leave those undefined so the settings-tab UI shows "linked" instead of
                // a link-reference array, and Apply doesn't clobber the link with a literal value.
                result.sampler_nodes.push({
                    id, type: ct, title,
                    seed: typeof seedVal === "number" ? seedVal : undefined,
                    seedKey, seedNodeId: id,
                    steps: typeof inputs.steps === "number" ? inputs.steps : undefined, stepsNodeId: id,
                    cfg: typeof inputs.cfg === "number" ? inputs.cfg : undefined, cfgNodeId: id,
                    sampler_name: inputs.sampler_name, samplerNodeId: id,
                    scheduler: inputs.scheduler, schedulerNodeId: id,
                    denoise: typeof inputs.denoise === "number" ? inputs.denoise : undefined, denoiseNodeId: id,
                });
            }

            // CFGGuider / BasicGuider / DualCFGGuider — used by "Advanced Sampling" workflows
            // (Flux.1/Flux.2, SD3.5, Chroma, HiDream E1, etc.) in place of KSampler's
            // positive/negative inputs. These feed SamplerCustomAdvanced rather than driving a
            // sampler themselves, so role propagation must start here too, or CLIPTextEncode
            // nodes downstream stay "unknown" role.
            if (ct === "CFGGuider") {
                if (Array.isArray(inputs.positive)) samplerPositiveRef[inputs.positive[0]] = true;
                if (Array.isArray(inputs.negative)) samplerNegativeRef[inputs.negative[0]] = true;
            }
            if (ct === "BasicGuider") {
                if (Array.isArray(inputs.conditioning)) samplerPositiveRef[inputs.conditioning[0]] = true;
            }
            // DualCFGGuider (HiDream E1 instruct-pix2pix style edit): cond1/cond2 both derive from
            // the positive text (often via InstructPixToPixConditioning), negative is separate —
            // cond2 is left unmarked since it doesn't cleanly map to either role.
            if (ct === "DualCFGGuider") {
                if (Array.isArray(inputs.cond1)) samplerPositiveRef[inputs.cond1[0]] = true;
                if (Array.isArray(inputs.negative)) samplerNegativeRef[inputs.negative[0]] = true;
            }
            // SamplerCustom (older/simpler counterpart to SamplerCustomAdvanced): holds
            // positive/negative directly instead of going through a separate Guider node.
            if (ct === "SamplerCustom") {
                if (Array.isArray(inputs.positive)) samplerPositiveRef[inputs.positive[0]] = true;
                if (Array.isArray(inputs.negative)) samplerNegativeRef[inputs.negative[0]] = true;
            }
        }

        // === Pass 1b: Expand refs through CONDITIONING graph (BFS, 5 iterations) ===
        // Nodes that pass CONDITIONING through without changing positive/negative role
        const COND_PASSTHROUGH = new Set([
            "ConditioningCombine", "ConditioningConcat", "ConditioningAverage",
            "ConditioningSetTimestepRange",
            // ConditioningZeroOut is intentionally excluded: it discards upstream text entirely
            // (used as a no-text negative in ZIT/Lumina2 workflows). Propagating the negative
            // role upstream would incorrectly mark the shared positive CLIPTextEncode as "unknown".
            "ControlNetApply", "ControlNetApplyAdvanced",
            "IPAdapterApply", "IPAdapterApplyFaceID",
            "StyleModelApply",
            "FluxGuidance", "FluxKontextMultiReferenceLatentMethod",
        ]);

        for (let iter = 0; iter < 5; iter++) {
            for (const [id, node] of Object.entries(workflow)) {
                if (!node?.class_type) continue;
                const ct = node.class_type;
                const inputs = node.inputs || {};
                const isPos = !!samplerPositiveRef[id];
                const isNeg = !!samplerNegativeRef[id];
                if (!isPos && !isNeg) continue;

                if (COND_PASSTHROUGH.has(ct)) {
                    for (const v of Object.values(inputs)) {
                        if (Array.isArray(v)) {
                            if (isPos) samplerPositiveRef[v[0]] = true;
                            if (isNeg) samplerNegativeRef[v[0]] = true;
                        }
                    }
                }

                // Propagate role through text encoder linked inputs (CLIPTextEncode → upstream text source)
                if (ct === "CLIPTextEncode") {
                    const tv = inputs.text;
                    if (Array.isArray(tv)) {
                        if (isPos) samplerPositiveRef[tv[0]] = true;
                        if (isNeg) samplerNegativeRef[tv[0]] = true;
                    }
                }
                if (ct === "CLIPTextEncodeSDXL" || ct === "CLIPTextEncodeSDXLRefiner") {
                    for (const key of ["text_g", "text_l"]) {
                        const tv = inputs[key];
                        if (Array.isArray(tv)) {
                            if (isPos) samplerPositiveRef[tv[0]] = true;
                            if (isNeg) samplerNegativeRef[tv[0]] = true;
                        }
                    }
                }
                if (ct === "ImpactWildcardEncode" || ct === "ImpactWildcardProcessor") {
                    const tv = inputs.wildcard_text;
                    if (Array.isArray(tv)) {
                        if (isPos) samplerPositiveRef[tv[0]] = true;
                        if (isNeg) samplerNegativeRef[tv[0]] = true;
                    }
                }
                // CLIPTextEncodeEditPlus — propagate role to its STRING inputs (text1, text2)
                if (ct === "CLIPTextEncodeEditPlus") {
                    for (const key of ["text1", "text2"]) {
                        const tv = inputs[key];
                        if (Array.isArray(tv)) {
                            if (isPos) samplerPositiveRef[tv[0]] = true;
                            if (isNeg) samplerNegativeRef[tv[0]] = true;
                        }
                    }
                }
                // InstructPixToPixConditioning (HiDream E1 edit) — unlike COND_PASSTHROUGH nodes,
                // this has *separate* positive/negative inputs feeding separate outputs, so each
                // role must route only to its own input (not both) or the negative CLIPTextEncode
                // would incorrectly get marked positive too via the positive-output branch.
                if (ct === "InstructPixToPixConditioning") {
                    if (isPos && Array.isArray(inputs.positive)) samplerPositiveRef[inputs.positive[0]] = true;
                    if (isNeg && Array.isArray(inputs.negative)) samplerNegativeRef[inputs.negative[0]] = true;
                }
            }
        }

        // === Pass 2: Main analysis ===
        for (const [id, node] of Object.entries(workflow)) {
            if (!node?.class_type) continue;
            const ct = node.class_type;
            const inputs = node.inputs || {};
            const title = node._meta?.title || ct;

            const isPos = !!samplerPositiveRef[id];
            const isNeg = !!samplerNegativeRef[id];

            const getRole = () => {
                if (isPos && !isNeg) return "positive";
                if (isNeg && !isPos) return "negative";
                if (/pos|正/i.test(title)) return "positive";
                if (/neg|負/i.test(title)) return "negative";
                return "unknown";
            };

            // --- Advanced Sampler: SamplerCustomAdvanced ---
            // "Advanced Sampling" pattern used by Flux.1/Flux.2, SD3.5, Chroma, HiDream E1, etc.:
            // instead of one KSampler node holding seed/steps/cfg/sampler/scheduler, those values
            // are spread across RandomNoise (noise_seed) → a Guider node (cfg) → KSamplerSelect
            // (sampler_name) → a *Scheduler node (steps/denoise), all feeding SamplerCustomAdvanced.
            // Collect them into one composite entry so Settings-tab editing still works; each
            // value's *NodeId tracks which real node to write back to (null = no such control
            // exists on this workflow, e.g. Flux2Scheduler has no named "scheduler" combo).
            if (ct === "SamplerCustomAdvanced") {
                const noiseId = Array.isArray(inputs.noise) ? String(inputs.noise[0]) : null;
                const guiderId = Array.isArray(inputs.guider) ? String(inputs.guider[0]) : null;
                const samplerSelId = Array.isArray(inputs.sampler) ? String(inputs.sampler[0]) : null;
                const schedulerId = Array.isArray(inputs.sigmas) ? String(inputs.sigmas[0]) : null;

                const noiseInputs = (noiseId && workflow[noiseId]?.inputs) || {};
                const guiderNode = guiderId ? workflow[guiderId] : null;
                const guiderInputs = guiderNode?.inputs || {};
                // DualCFGGuider (HiDream E1 instruct-pix2pix edit) has no plain "cfg" input — its
                // two CFG knobs are cfg_conds/cfg_cond2_negative. Use cfg_conds as the
                // representative value so Settings still shows/edits *something* meaningful.
                const guiderCfgKey = guiderNode?.class_type === "DualCFGGuider" ? "cfg_conds" : "cfg";
                const samplerSelInputs = (samplerSelId && workflow[samplerSelId]?.inputs) || {};
                const schedulerInputs = (schedulerId && workflow[schedulerId]?.inputs) || {};

                result.sampler_nodes.push({
                    id, type: ct, title, advanced: true,
                    seed: typeof noiseInputs.noise_seed === "number" ? noiseInputs.noise_seed : undefined,
                    seedKey: "noise_seed", seedNodeId: noiseId,
                    steps: typeof schedulerInputs.steps === "number" ? schedulerInputs.steps : undefined,
                    stepsNodeId: schedulerId,
                    cfg: typeof guiderInputs[guiderCfgKey] === "number" ? guiderInputs[guiderCfgKey] : undefined,
                    cfgNodeId: guiderCfgKey in guiderInputs ? guiderId : null,
                    cfgKey: guiderCfgKey,
                    sampler_name: samplerSelInputs.sampler_name, samplerNodeId: samplerSelId,
                    scheduler: undefined, schedulerNodeId: "scheduler" in schedulerInputs ? schedulerId : null,
                    denoise: typeof schedulerInputs.denoise === "number" ? schedulerInputs.denoise : undefined,
                    denoiseNodeId: "denoise" in schedulerInputs ? schedulerId : null,
                });
            }

            // --- Advanced Sampler: SamplerCustom ---
            // Older/simpler counterpart to SamplerCustomAdvanced: no RandomNoise/Guider
            // indirection — noise_seed and cfg are its own widgets, and positive/negative feed it
            // directly. sampler_name/steps/scheduler/denoise still come from separate
            // KSamplerSelect/*Scheduler nodes via its sampler/sigmas inputs.
            if (ct === "SamplerCustom") {
                const samplerSelId = Array.isArray(inputs.sampler) ? String(inputs.sampler[0]) : null;
                const schedulerId = Array.isArray(inputs.sigmas) ? String(inputs.sigmas[0]) : null;
                const samplerSelInputs = (samplerSelId && workflow[samplerSelId]?.inputs) || {};
                const schedulerInputs = (schedulerId && workflow[schedulerId]?.inputs) || {};

                result.sampler_nodes.push({
                    id, type: ct, title, advanced: true,
                    seed: typeof inputs.noise_seed === "number" ? inputs.noise_seed : undefined,
                    seedKey: "noise_seed", seedNodeId: id,
                    steps: typeof schedulerInputs.steps === "number" ? schedulerInputs.steps : undefined,
                    stepsNodeId: schedulerId,
                    cfg: typeof inputs.cfg === "number" ? inputs.cfg : undefined,
                    cfgNodeId: id,
                    sampler_name: samplerSelInputs.sampler_name, samplerNodeId: samplerSelId,
                    scheduler: schedulerInputs.scheduler, schedulerNodeId: "scheduler" in schedulerInputs ? schedulerId : null,
                    denoise: typeof schedulerInputs.denoise === "number" ? schedulerInputs.denoise : undefined,
                    denoiseNodeId: "denoise" in schedulerInputs ? schedulerId : null,
                });
            }

            // --- Checkpoint nodes ---
            // Matches: CheckpointLoaderSimple, CheckpointLoader, "Checkpoint Loader" (WAS), etc.
            if (ct.includes("CheckpointLoader") || ct === "Checkpoint Loader") {
                result.checkpoint_nodes.push({
                    id, type: ct, title,
                    ckpt_name: inputs.ckpt_name,
                });
            }

            // ImageMetadataPromptLoader — checkpoint + positive/negative prompts in one node
            if (ct === "ImageMetadataPromptLoader") {
                result.checkpoint_nodes.push({ id, type: ct, title, ckpt_name: inputs.ckpt_name });
                if (typeof inputs.positive_text === "string") {
                    result.prompt_nodes.push({
                        id, type: ct, title: `${title} [positive]`, role: "positive",
                        text: inputs.positive_text, textKey: "positive_text",
                    });
                }
                if (typeof inputs.negative_text === "string") {
                    result.prompt_nodes.push({
                        id, type: ct, title: `${title} [negative]`, role: "negative",
                        text: inputs.negative_text, textKey: "negative_text",
                    });
                }
            }

            // --- Prompt nodes ---

            if (ct === "CLIPTextEncode") {
                // Only add when text is a direct string (if linked, upstream node will be detected)
                const textVal = inputs.text;
                if (typeof textVal === "string") {
                    result.prompt_nodes.push({
                        id, type: ct, title, role: getRole(),
                        text: textVal, textKey: "text",
                    });
                }
            }

            // SDXL dual-text encoder
            if (ct === "CLIPTextEncodeSDXL" || ct === "CLIPTextEncodeSDXLRefiner") {
                const textG = inputs.text_g;
                const textL = inputs.text_l;
                // Add only if at least one text field is a direct string
                if (typeof textG === "string" || typeof textL === "string") {
                    result.prompt_nodes.push({
                        id, type: ct, title, role: getRole(),
                        text: typeof textG === "string" ? textG : (typeof textL === "string" ? textL : ""),
                        textKey: typeof textG === "string" ? "text_g" : "text_l",
                    });
                }
            }

            // CLIPTextEncodeEditPlus — text_edit is the locally editable override; text1 is always a link.
            // Skip when text_edit is empty: it means upstream nodes (ImpactWildcardEncode etc.) supply
            // the actual prompt text and the edit field is just an optional local override.
            if (ct === "CLIPTextEncodeEditPlus") {
                const textVal = inputs.text_edit;
                if (typeof textVal === "string" && textVal !== "") {
                    result.prompt_nodes.push({
                        id, type: ct, title, role: getRole(),
                        text: textVal, textKey: "text_edit",
                    });
                }
            }

            // Qwen-based image+text encoder (Plus variant takes up to 3 reference images;
            // the base variant takes one — both share the same "prompt" widget)
            if (ct === "TextEncodeQwenImageEditPlus" || ct === "TextEncodeQwenImageEdit") {
                result.prompt_nodes.push({
                    id, type: ct, title, role: getRole(),
                    text: inputs.prompt || "",
                    textKey: "prompt",
                });
            }

            // TextEncodeBooguEdit (Boogu image-edit model) — prompt + negative_prompt in one node
            if (ct === "TextEncodeBooguEdit") {
                if (typeof inputs.prompt === "string") {
                    result.prompt_nodes.push({
                        id, type: ct, title: `${title} [positive]`, role: "positive",
                        text: inputs.prompt, textKey: "prompt",
                    });
                }
                if (typeof inputs.negative_prompt === "string") {
                    result.prompt_nodes.push({
                        id, type: ct, title: `${title} [negative]`, role: "negative",
                        text: inputs.negative_prompt, textKey: "negative_prompt",
                    });
                }
            }

            // Mage-Flow text encoder — prompt + negative_prompt in one node (fixed roles,
            // unlike KSampler-derived getRole() since both wires originate from this node)
            if (ct === "TextEncodeMageFlowEdit") {
                if (typeof inputs.prompt === "string") {
                    result.prompt_nodes.push({
                        id, type: ct, title: `${title} [positive]`, role: "positive",
                        text: inputs.prompt, textKey: "prompt",
                    });
                }
                if (typeof inputs.negative_prompt === "string") {
                    result.prompt_nodes.push({
                        id, type: ct, title: `${title} [negative]`, role: "negative",
                        text: inputs.negative_prompt, textKey: "negative_prompt",
                    });
                }
            }

            // SDXLPromptStyler / SDXLPromptStylerAdvanced — contains both pos & neg in one node
            if (ct === "SDXLPromptStyler" || ct === "SDXLPromptStylerAdvanced") {
                if (inputs.text_positive !== undefined) {
                    result.prompt_nodes.push({
                        id, type: ct, title: `${title} [positive]`, role: "positive",
                        text: inputs.text_positive || "", textKey: "text_positive",
                    });
                }
                if (inputs.text_negative !== undefined) {
                    result.prompt_nodes.push({
                        id, type: ct, title: `${title} [negative]`, role: "negative",
                        text: inputs.text_negative || "", textKey: "text_negative",
                    });
                }
            }

            // ImpactWildcardEncode / ImpactWildcardProcessor — treat wildcard_text as prompt
            if (ct === "ImpactWildcardEncode" || ct === "ImpactWildcardProcessor") {
                const textVal = inputs.wildcard_text;
                if (typeof textVal === "string") {
                    result.prompt_nodes.push({
                        id, type: ct, title, role: getRole(),
                        text: textVal, textKey: "wildcard_text",
                    });
                }
            }

            // WFS_PromptText — 2出力ノード。output[0]=positive / output[1]=negative
            if (ct === "WFS_PromptText") {
                if (typeof inputs.positive === "string") {
                    result.prompt_nodes.push({
                        id, type: ct, title: `${title} [positive]`, role: "positive",
                        text: inputs.positive, textKey: "positive",
                    });
                }
                if (typeof inputs.negative === "string") {
                    result.prompt_nodes.push({
                        id, type: ct, title: `${title} [negative]`, role: "negative",
                        text: inputs.negative, textKey: "negative",
                    });
                }
            }

            // PrimitiveStringMultiline / PrimitiveString — when feeding a prompt node
            if ((ct === "PrimitiveStringMultiline" || ct === "PrimitiveString") && (isPos || isNeg)) {
                result.prompt_nodes.push({
                    id, type: ct, title, role: getRole(),
                    text: inputs.value || "",
                    textKey: "value",
                });
            }

            // --- Latent nodes ---
            // EmptyFlux2LatentImage (Flux.2 templates) often has width/height wired to a
            // GetImageSize node (auto-follows the reference image) rather than a direct number —
            // leave those as undefined, same treatment as TextEncodeMageFlowEdit below, so the
            // settings-tab UI shows "linked" instead of a stale default and Apply doesn't clobber it.
            if (ct === "EmptyLatentImage" || ct === "EmptySD3LatentImage" || ct === "EmptyFlux2LatentImage") {
                result.latent_nodes.push({
                    id, type: ct, title,
                    width: typeof inputs.width === "number" ? inputs.width : undefined,
                    height: typeof inputs.height === "number" ? inputs.height : undefined,
                    batch_size: inputs.batch_size,
                });
            }

            // TextEncodeMageFlowEdit also carries width/height/batch_size directly
            // (it builds the latent internally instead of a separate EmptyLatentImage node).
            // width/height are commonly wired to a ResolutionSelector-style helper node
            // (array link ref) rather than a direct number — leave those as undefined so
            // the settings-tab UI falls back to its default instead of rendering a link ref.
            if (ct === "TextEncodeMageFlowEdit") {
                result.latent_nodes.push({
                    id, type: ct, title,
                    width: typeof inputs.width === "number" ? inputs.width : undefined,
                    height: typeof inputs.height === "number" ? inputs.height : undefined,
                    batch_size: inputs.batch_size,
                });
            }

            // --- LoRA nodes ---
            if (ct === "LoraLoader" || ct === "LoraLoaderModelOnly") {
                result.lora_nodes.push({
                    id, type: ct, title,
                    lora_name: inputs.lora_name,
                    strength_model: inputs.strength_model,
                    strength_clip: inputs.strength_clip,
                });
            }

            // Power Lora Loader (rgthree) — dynamic lora_N inputs in API format
            if (ct === "Power Lora Loader (rgthree)") {
                for (const [k, v] of Object.entries(inputs)) {
                    if (/^lora_\d+$/.test(k) && typeof v === "string") {
                        result.lora_nodes.push({
                            id, type: ct, title,
                            lora_name: v,
                            strength_model: inputs[k.replace("lora_", "strength_")] ?? 1,
                            strength_clip: inputs[k.replace("lora_", "strength_clip_")] ?? 1,
                        });
                    }
                }
            }

            // Lora Loader (LoraManager) — loras stored in inputs.loras.__value__
            if (ct === "Lora Loader (LoraManager)") {
                result.lora_nodes.push({ id, type: ct, title, is_lora_manager: true });
            }

            // ImageMetadataLoRALoader — up to 3 LoRA slots; skip "None" entries
            if (ct === "ImageMetadataLoRALoader") {
                for (let i = 1; i <= 3; i++) {
                    const loraName = inputs[`lora_${i}`];
                    if (typeof loraName === "string" && loraName !== "None") {
                        result.lora_nodes.push({
                            id, type: ct, title,
                            lora_name: loraName,
                            strength_model: inputs[`strength_model_${i}`] ?? 1.0,
                            strength_clip: inputs[`strength_clip_${i}`] ?? 1.0,
                        });
                    }
                }
            }

            // --- VAE nodes ---
            if (ct === "VAELoader") {
                result.vae_nodes.push({ id, type: ct, title, vae_name: inputs.vae_name });
            }

            // --- Save/preview nodes ---
            if (ct === "SaveImage" || ct === "PreviewImage") {
                result.save_nodes.push({ id, type: ct, title });
            }

            // --- Load image nodes ---
            if (ct === "LoadImage" || ct === "LoadImageMask"
                || (ct.toLowerCase().includes("load") && ct.toLowerCase().includes("image") && inputs.image !== undefined)) {
                result.load_image_nodes.push({
                    id, type: ct, title, image: inputs.image,
                });
            }

            // --- VAE Encode (for Inpainting) nodes ---
            if (ct === "VAEEncodeForInpaint") {
                result.inpaint_encode_nodes.push({
                    id, type: ct, title,
                    grow_mask_by: inputs.grow_mask_by,
                });
            }

            // --- Mask Editor One nodes (comfyui-mask-editor-one) ---
            // 画像とマスクをノード自身が内包する（LoadImageを介さない）インペイント画像ソース。
            // image出力はサーバー側キャッシュ(bg_image_b64、node_idキー)から、mask出力は
            // layer_data(JSON文字列)ウィジェットの各レイヤーのアルファチャンネルから合成される。
            if (ct === "MaskEditorOne") {
                result.mask_editor_one_nodes.push({ id, type: ct, title });
            }

            // --- Text encoder (CLIP) nodes ---
            if (ct === "DualCLIPLoader" || ct === "CLIPLoader" || ct === "ClipLoaderGGUF" || ct === "DualClipLoaderGGUF") {
                result.text_encoder_nodes.push({
                    id, type: ct, title,
                    clip_name1: inputs.clip_name1 || inputs.clip_name,
                    clip_name2: inputs.clip_name2,
                    clip_type: inputs.type,
                    device: inputs.device,
                });
            }

            // --- Diffusion model nodes ---
            if (ct === "UNETLoader" || ct === "UnetLoaderGGUF") {
                result.diffusion_model_nodes.push({
                    id, type: ct, title, unet_name: inputs.unet_name, inputKey: "unet_name",
                });
            }
            if (ct === "LoaderGGUF" || ct === "LoaderGGUFAdvanced") {
                result.diffusion_model_nodes.push({
                    id, type: ct, title, unet_name: inputs.gguf_name, inputKey: "gguf_name",
                });
            }

            // --- ControlNet loader nodes ---
            if (ct.includes("ControlNetLoader")) {
                result.controlnet_nodes.push({
                    id, type: ct, title,
                    control_net_name: inputs.control_net_name,
                });
            }

            // --- Hypernetwork loader nodes ---
            if (ct === "HypernetworkLoader") {
                result.hypernetwork_nodes.push({
                    id, type: ct, title,
                    hypernetwork_name: inputs.hypernetwork_name,
                    strength: inputs.strength ?? 1.0,
                });
            }
        }

        // --- Post-pass: flag LoadImage nodes whose MASK output (slot 1) is wired to something
        // downstream (directly, or via a pass-through node like MaskEditorNode). These are the
        // "inpaint-capable" slots — image + mask both come from the same node's two outputs, so
        // painting a mask for them only requires re-uploading that one node's image with the mask
        // baked into the alpha channel (matches ComfyUI's native LoadImage alpha→MASK extraction). ---
        const loadImageIds = new Set(result.load_image_nodes.filter(n => n.type === "LoadImage").map(n => n.id));
        if (loadImageIds.size > 0) {
            for (const node of Object.values(workflow)) {
                if (!node?.inputs) continue;
                for (const v of Object.values(node.inputs)) {
                    if (Array.isArray(v) && v.length === 2 && Number(v[1]) === 1 && loadImageIds.has(String(v[0]))) {
                        const target = result.load_image_nodes.find(n => n.id === String(v[0]));
                        if (target) target.mask_used = true;
                    }
                }
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
        // Impact Pack wildcard nodes — only map wildcard_text (index 0); remaining widgets
        // vary between versions and include frontend-only extras, so we leave them unmapped.
        ImpactWildcardProcessor: ["wildcard_text"],
        ImpactWildcardEncode: ["wildcard_text"],
        WFS_PromptText: ["positive", "negative"],
    };
    return mappings[nodeType] || null;
}

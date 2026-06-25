/**
 * ComfyUI Editor - Dynamic UI generation for workflow parameter editing
 */

import { comfyUI } from "./comfyui-client.js";
import { syncJsonHighlight } from "./json-highlight.js";

// ── Latent Image preset state ─────────────────────────────
const _LATENT_PRESET_KEY = "wfm_latent_presets";
const _LATENT_DEFAULT_PRESETS = [
    { w: 720,  h: 1280 }, { w: 768,  h: 1024 }, { w: 1152, h: 896  },
    { w: 1344, h: 768  }, { w: 832,  h: 1216 }, { w: 832,  h: 1248 },
    { w: 832,  h: 1280 }, { w: 1920, h: 1080 }, { w: 2560, h: 1440 },
    { w: 3840, h: 2160 },
];

function _loadLatentPresets() {
    try {
        const raw = localStorage.getItem(_LATENT_PRESET_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function _saveLatentPresets(list) {
    localStorage.setItem(_LATENT_PRESET_KEY, JSON.stringify(list));
}

function _buildPresetOptions(customPresets) {
    const customs = customPresets.map((p) =>
        `<option value="${p.w}x${p.h}">${p.w}x${p.h}</option>`
    ).join("");
    const defaults = _LATENT_DEFAULT_PRESETS.map((p) =>
        `<option value="${p.w}x${p.h}" data-default="1">${p.w}x${p.h}</option>`
    ).join("");
    return customs + defaults;
}

function _refreshPresetSelect(customPresets) {
    const sel = document.getElementById("wfm-latent-preset-select");
    if (!sel) return;
    sel.innerHTML = _buildPresetOptions(customPresets);
}

// ── LoRA pane stack state ─────────────────────────────────
// { modelFullPath: { m: number, c: number } }
let _stackStrengths = {};
// { modelFullPath: boolean } — true = active (default)
let _stackActive = {};
// { id: string|null, selStart: number, selEnd: number }
let _lastPromptFocus = { id: null, selStart: 0, selEnd: 0 };

function _loraBasename(fullPath) {
    const name = (fullPath || "").replace(/\\/g, "/").split("/").pop() || fullPath;
    return name.replace(/\.[^.]+$/, "");
}

function _buildLoraSyntax(stackModels) {
    return stackModels
        .filter((m) => _stackActive[m] !== false)
        .map((m) => {
            const stem = _loraBasename(m);
            const str = (_stackStrengths[m]?.m ?? 1.0).toFixed(2).replace(/\.?0+$/, "") || "1";
            return `<lora:${stem}:${str}>`;
        })
        .join(", ");
}

function _buildLoraManagerSyntax(stackModels) {
    return stackModels
        .filter((m) => _stackActive[m] !== false)
        .map((m) => {
            const stem = _loraBasename(m);
            const strM = (_stackStrengths[m]?.m ?? 1.0).toFixed(2).replace(/\.?0+$/, "") || "1";
            const strC = (_stackStrengths[m]?.c ?? 1.0).toFixed(2).replace(/\.?0+$/, "") || "1";
            return `<lora:${stem}:${strM}:${strC}>`;
        })
        .join(" ");
}

function _applyLoraToNode(nodeId, loraPath, strModel, strClip, isLoraManager) {
    if (isLoraManager) {
        const stem = _loraBasename(loraPath);
        comfyUI.currentWorkflow[nodeId].inputs.loras = {
            __value__: [{ name: stem, strength: strModel, active: true, expanded: false, clipStrength: strClip, locked: false }],
        };
        comfyUI.currentWorkflow[nodeId].inputs.text = `<lora:${stem}:${strModel}:${strClip}>`;
    } else {
        comfyUI.currentWorkflow[nodeId].inputs.lora_name = loraPath;
        comfyUI.currentWorkflow[nodeId].inputs.strength_model = strModel;
        comfyUI.currentWorkflow[nodeId].inputs.strength_clip = strClip;
    }
}

function _refreshLoraPaneDynamic(stackModels, metadata, civitaiCache) {
    const syntaxEl = document.getElementById("wfm-lora-stack-syntax");
    if (syntaxEl) syntaxEl.textContent = _buildLoraSyntax(stackModels) || "—";

    const triggersEl = document.getElementById("wfm-lora-stack-triggers");
    if (triggersEl && metadata && civitaiCache) {
        const activeWords = [];
        stackModels.forEach((m) => {
            if (_stackActive[m] === false) return;
            const sha = (metadata[m] || {}).sha256;
            const civInfo = sha && civitaiCache[sha];
            if (civInfo?.trainedWords?.length) activeWords.push(...civInfo.trainedWords);
        });
        triggersEl.innerHTML = activeWords.length
            ? activeWords.map((w) => `<span class="wfm-lora-trigger-word">${w}</span>`).join(" ")
            : `<span style="color:var(--wfm-text-secondary);font-size:12px;">—</span>`;
    }
}

function _refreshLoraSingleDynamic(metadata, civitaiCache) {
    const modelName = document.getElementById("wfm-lora-select")?.value;
    const syntaxEl = document.getElementById("wfm-lora-single-syntax");
    const triggersEl = document.getElementById("wfm-lora-single-triggers");
    if (!modelName) {
        if (syntaxEl) syntaxEl.textContent = "—";
        if (triggersEl) triggersEl.innerHTML = `<span style="color:var(--wfm-text-secondary);font-size:12px;">—</span>`;
        return;
    }
    const stem = _loraBasename(modelName);
    const strM = parseFloat(document.getElementById("wfm-lora-str-model")?.value) || 1.0;
    const strC = parseFloat(document.getElementById("wfm-lora-str-clip")?.value) || 1.0;
    if (syntaxEl) syntaxEl.textContent = `<lora:${stem}:${strM}:${strC}>`;
    if (triggersEl) {
        const sha = (metadata[modelName] || {}).sha256;
        const civInfo = sha && civitaiCache[sha];
        const words = civInfo?.trainedWords || [];
        triggersEl.innerHTML = words.length
            ? words.map(w => `<span class="wfm-lora-trigger-word">${w}</span>`).join(" ")
            : `<span style="color:var(--wfm-text-secondary);font-size:12px;">—</span>`;
    }
}

function _syncStackToggleAll(stackModels) {
    const cb = document.getElementById("wfm-lora-stack-toggle-all");
    if (!cb) return;
    const allOn = stackModels.every((m) => _stackActive[m] !== false);
    const allOff = stackModels.every((m) => _stackActive[m] === false);
    cb.checked = allOn;
    cb.indeterminate = !allOn && !allOff;
}

/** Sync comfyUI.currentWorkflow to Raw JSON textarea + highlight */
function _syncRawJson() {
    const rawTextarea = document.getElementById("wfm-gen-raw-json");
    if (rawTextarea && comfyUI.currentWorkflow) {
        const jsonStr = JSON.stringify(comfyUI.currentWorkflow, null, 2);
        rawTextarea.value = jsonStr;
        const highlight = document.getElementById("wfm-gen-raw-json-highlight");
        syncJsonHighlight(highlight, jsonStr);
    }
}

export const comfyEditor = {
    models: {
        checkpoints: [],
        vaes: [],
        loras: [],
        diffusionModels: [],
        textEncoders: [],
        controlNets: [],
        hypernetworks: [],
        embeddings: [],
        samplers: [],
        schedulers: [],
        lastError: null,
    },

    async loadModelLists() {
        try {
            const [ckpt, vae, lora, diff, enc, cn, hn, emb, samp, sched] = await Promise.all([
                comfyUI.fetchCheckpoints(),
                comfyUI.fetchVaes(),
                comfyUI.fetchLoras(),
                comfyUI.fetchDiffusionModels(),
                comfyUI.fetchTextEncoders(),
                comfyUI.fetchControlNets(),
                comfyUI.fetchHypernetworks(),
                comfyUI.fetchEmbeddings(),
                comfyUI.fetchSamplers(),
                comfyUI.fetchSchedulers(),
            ]);
            this.models.checkpoints = ckpt;
            this.models.vaes = vae;
            this.models.loras = lora;
            this.models.diffusionModels = diff;
            this.models.textEncoders = enc;
            this.models.controlNets = cn;
            this.models.hypernetworks = hn;
            this.models.embeddings = emb;
            this.models.samplers = samp;
            this.models.schedulers = sched;
            this.models.lastError = null;
        } catch (err) {
            this.models.lastError = err.message;
            console.error("Failed to load model lists:", err);
        }
    },

    renderAll(analysis, workflow) {
        this.renderPromptTab(analysis, "wfm-gen-prompt-fields");
        this.renderImageTab(analysis, "wfm-gen-image-fields");
        this.renderModelTab(analysis, "wfm-gen-model-fields");
        this.renderLoraPane(analysis, "wfm-gen-lora-fields"); // async, fires independently
        this.renderSettingsTab(analysis, "wfm-gen-settings-fields");
        _syncRawJson();
    },

    renderPromptTab(analysis, containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const positiveNodes = (analysis.prompt_nodes || []).filter((n) => n.role === "positive");
        const negativeNodes = (analysis.prompt_nodes || []).filter((n) => n.role === "negative");
        const nodeOpts = _nodeOptions(analysis.all_nodes);
        const embeddings = this.models.embeddings || [];

        el.innerHTML = `
            <div class="wfm-form-group">
                <label>Positive Prompt</label>
                <div style="display:flex;gap:8px;margin-bottom:6px;">
                    <select id="wfm-prompt-pos-target" class="wfm-select" style="width:auto;flex:1">
                        ${positiveNodes.map((n) => `<option value="${n.id}" data-text-key="${n.textKey || "text"}" selected>ID:${n.id} (${n.title})</option>`).join("")}
                        ${nodeOpts}
                    </select>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-prompt-pos-apply">Apply</button>
                </div>
                <textarea class="wfm-textarea" id="wfm-prompt-pos-text" rows="6">${positiveNodes[0]?.text || ""}</textarea>
            </div>
            <div class="wfm-form-group">
                <label>Negative Prompt</label>
                <div style="display:flex;gap:8px;margin-bottom:6px;">
                    <select id="wfm-prompt-neg-target" class="wfm-select" style="width:auto;flex:1">
                        ${negativeNodes.map((n) => `<option value="${n.id}" data-text-key="${n.textKey || "text"}" selected>ID:${n.id} (${n.title})</option>`).join("")}
                        ${nodeOpts}
                    </select>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-prompt-neg-apply">Apply</button>
                </div>
                <textarea class="wfm-textarea" id="wfm-prompt-neg-text" rows="6">${negativeNodes[0]?.text || ""}</textarea>
            </div>
            <div class="wfm-form-group" style="border-top:1px solid var(--wfm-border);margin-top:12px;padding-top:12px;">
                <label>Embeddings</label>
                <input type="text" class="wfm-input" id="wfm-embedding-filter" placeholder="Filter..." style="margin-bottom:4px;">
                <select class="wfm-select" id="wfm-embedding-select" style="margin-bottom:4px;">
                    ${embeddings.map((m) => `<option value="${m}">${m}</option>`).join("")}
                </select>
                <div style="display:flex;gap:6px;align-items:center;margin-top:4px;">
                    <label style="font-size:12px;white-space:nowrap;color:var(--wfm-text-secondary);">Weight</label>
                    <input type="number" class="wfm-input" id="wfm-embedding-weight" value="1.0" step="0.1" min="-10" max="10" style="width:70px;">
                    <button class="wfm-btn wfm-btn-sm" id="wfm-embedding-paste">Paste</button>
                </div>
            </div>
        `;

        document.getElementById("wfm-prompt-pos-apply")?.addEventListener("click", () => {
            const nodeId = document.getElementById("wfm-prompt-pos-target")?.value;
            const text = document.getElementById("wfm-prompt-pos-text")?.value;
            if (nodeId && comfyUI.currentWorkflow?.[nodeId]) {
                const promptNode = (analysis.prompt_nodes || []).find(n => n.id === nodeId);
                const textKey = promptNode?.textKey || "text";
                comfyUI.currentWorkflow[nodeId].inputs[textKey] = text;
                _syncRawJson();
            }
        });

        document.getElementById("wfm-prompt-neg-apply")?.addEventListener("click", () => {
            const nodeId = document.getElementById("wfm-prompt-neg-target")?.value;
            const text = document.getElementById("wfm-prompt-neg-text")?.value;
            if (nodeId && comfyUI.currentWorkflow?.[nodeId]) {
                const promptNode = (analysis.prompt_nodes || []).find(n => n.id === nodeId);
                const textKey = promptNode?.textKey || "text";
                comfyUI.currentWorkflow[nodeId].inputs[textKey] = text;
                _syncRawJson();
            }
        });

        // Track last focused prompt textarea for Paste button
        ["wfm-prompt-pos-text", "wfm-prompt-neg-text"].forEach((taId) => {
            const ta = document.getElementById(taId);
            if (!ta) return;
            ["click", "keyup", "blur"].forEach((evt) => {
                ta.addEventListener(evt, () => {
                    _lastPromptFocus = { id: taId, selStart: ta.selectionStart, selEnd: ta.selectionEnd };
                });
            });
        });

        // Embedding filter
        document.getElementById("wfm-embedding-filter")?.addEventListener("input", (e) => {
            const filter = e.target.value.toLowerCase();
            const select = document.getElementById("wfm-embedding-select");
            if (!select) return;
            select.innerHTML = (this.models.embeddings || [])
                .filter((m) => m.toLowerCase().includes(filter))
                .map((m) => `<option value="${m}">${m}</option>`)
                .join("");
        });

        // Embedding Paste button — inserts at cursor position of last focused prompt textarea
        document.getElementById("wfm-embedding-paste")?.addEventListener("click", () => {
            const select = document.getElementById("wfm-embedding-select");
            if (!select?.value) return;
            const rawWeight = parseFloat(document.getElementById("wfm-embedding-weight")?.value);
            const weight = isNaN(rawWeight) ? 1.0 : rawWeight;
            const stem = select.value.replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");
            const weightStr = Number.isInteger(weight) ? `${weight}.0` : String(weight);
            const syntax = `(embedding:${stem}:${weightStr})`;

            const targetId = _lastPromptFocus.id === "wfm-prompt-neg-text" ? "wfm-prompt-neg-text" : "wfm-prompt-pos-text";
            const promptType = targetId === "wfm-prompt-neg-text" ? "negative" : "positive";
            const ta = document.getElementById(targetId);
            if (!ta) return;

            const selStart = _lastPromptFocus.id === targetId ? _lastPromptFocus.selStart : ta.value.length;
            const selEnd = _lastPromptFocus.id === targetId ? _lastPromptFocus.selEnd : ta.value.length;
            const before = ta.value.substring(0, selStart);
            const after = ta.value.substring(selEnd);
            const sep = before && !/[,\s]$/.test(before) ? ", " : "";
            const newText = before + sep + syntax + after;
            ta.value = newText;

            const newCursor = selStart + sep.length + syntax.length;
            ta.focus();
            ta.setSelectionRange(newCursor, newCursor);
            _lastPromptFocus = { id: targetId, selStart: newCursor, selEnd: newCursor };

            const wfNode = (comfyUI.currentAnalysis?.prompt_nodes || []).find((n) => n.role === promptType);
            if (wfNode && comfyUI.currentWorkflow?.[wfNode.id]) {
                comfyUI.currentWorkflow[wfNode.id].inputs[wfNode.textKey || "text"] = newText;
                _syncRawJson();
            }
        });
    },

    renderModelTab(analysis, containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const sections = [
            { label: "Checkpoint", key: "checkpoints", nodes: analysis.checkpoint_nodes, inputKey: "ckpt_name" },
            { label: "VAE", key: "vaes", nodes: analysis.vae_nodes, inputKey: "vae_name" },
            { label: "Diffusion Model", key: "diffusionModels", nodes: analysis.diffusion_model_nodes, inputKey: "unet_name" },
            { label: "Text Encoder", key: "textEncoders", nodes: analysis.text_encoder_nodes, inputKey: "clip_name1" },
            { label: "ControlNet", key: "controlNets", nodes: analysis.controlnet_nodes, inputKey: "control_net_name" },
            {
                label: "Hypernetwork", key: "hypernetworks", nodes: analysis.hypernetwork_nodes, inputKey: "hypernetwork_name",
                extras: [{ label: "Strength", inputKey: "strength", type: "number", defaultVal: 1.0, step: 0.01, min: -10, max: 10 }],
            },
        ];

        el.innerHTML = sections
            .map((s) => {
                const models = this.models[s.key] || [];
                const currentVal = s.nodes?.[0]?.[s.inputKey] || "";
                const targetOpts = s.nodes
                    .map((n) => `<option value="${n.id}">ID:${n.id} (${n.title})</option>`)
                    .join("");
                const extrasHtml = (s.extras || []).map((ex) => {
                    const curVal = s.nodes?.[0]?.[ex.inputKey] ?? ex.defaultVal;
                    return `<div style="display:flex;gap:6px;align-items:center;margin-top:4px;">
                        <label style="font-size:12px;white-space:nowrap;color:var(--wfm-text-secondary);">${ex.label}</label>
                        <input type="${ex.type}" class="wfm-input wfm-model-extra" id="wfm-model-${s.key}-${ex.inputKey}"
                            data-key="${s.key}" data-input-key="${ex.inputKey}"
                            value="${curVal}" step="${ex.step}" min="${ex.min}" max="${ex.max}"
                            style="width:80px;">
                    </div>`;
                }).join("");

                return `
                <div class="wfm-form-group" style="border-bottom:1px solid var(--wfm-border);padding-bottom:12px;">
                    <label>${s.label}</label>
                    <input type="text" class="wfm-input wfm-model-filter" placeholder="Filter..." data-target="wfm-model-${s.key}" style="margin-bottom:4px;">
                    <select class="wfm-select" id="wfm-model-${s.key}" style="margin-bottom:4px;">
                        ${models.map((m) => `<option value="${m}" ${m === currentVal ? "selected" : ""}>${m}</option>`).join("")}
                    </select>
                    ${extrasHtml}
                    <div style="display:flex;gap:8px;align-items:center;margin-top:4px;">
                        <select class="wfm-select" id="wfm-model-${s.key}-target" style="flex:1;">${targetOpts}</select>
                        <button class="wfm-btn wfm-btn-sm wfm-model-apply" data-key="${s.key}" data-input="${s.inputKey}">Apply</button>
                    </div>
                </div>
            `;
            })
            .join("");

        // Filter inputs
        el.querySelectorAll(".wfm-model-filter").forEach((input) => {
            input.addEventListener("input", () => {
                const targetId = input.dataset.target;
                const select = document.getElementById(targetId);
                if (!select) return;
                const filter = input.value.toLowerCase();
                const key = targetId.replace("wfm-model-", "");
                const models = this.models[key] || [];
                select.innerHTML = models
                    .filter((m) => m.toLowerCase().includes(filter))
                    .map((m) => `<option value="${m}">${m}</option>`)
                    .join("");
            });
        });

        // Apply buttons
        el.querySelectorAll(".wfm-model-apply").forEach((btn) => {
            btn.addEventListener("click", () => {
                const key = btn.dataset.key;
                const inputKey = btn.dataset.input;
                const select = document.getElementById(`wfm-model-${key}`);
                const targetSelect = document.getElementById(`wfm-model-${key}-target`);
                if (!select || !targetSelect) return;
                const value = select.value;
                const nodeId = targetSelect.value;
                if (nodeId && comfyUI.currentWorkflow?.[nodeId]) {
                    comfyUI.currentWorkflow[nodeId].inputs[inputKey] = value;
                    // Apply extras (e.g. strength for Hypernetwork)
                    el.querySelectorAll(`.wfm-model-extra[data-key="${key}"]`).forEach((ex) => {
                        const exInputKey = ex.dataset.inputKey;
                        const exVal = parseFloat(ex.value);
                        if (!isNaN(exVal)) comfyUI.currentWorkflow[nodeId].inputs[exInputKey] = exVal;
                    });
                    _syncRawJson();
                }
            });
        });
    },

    async renderLoraPane(analysis, containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const loraNodes = analysis.lora_nodes || [];
        const loras = this.models.loras || [];
        const defaultStackTarget = (loraNodes.find((n) => n.is_lora_manager) || loraNodes[0])?.id;
        const nodeOpts = loraNodes
            .map((n) => `<option value="${n.id}">ID:${n.id} (${n.title})</option>`)
            .join("");
        const stackTargetOpts = loraNodes
            .map((n) => `<option value="${n.id}" ${String(n.id) === String(defaultStackTarget) ? "selected" : ""}>ID:${n.id} (${n.title})</option>`)
            .join("");
        // currentWorkflowから直接取得（applyToGenUIによる変更を正確に反映）
        let currentVal = loraNodes[0]?.lora_name || "";
        const _firstLoraNode = loraNodes[0];
        if (_firstLoraNode && comfyUI.currentWorkflow?.[_firstLoraNode.id]) {
            const _wfNode = comfyUI.currentWorkflow[_firstLoraNode.id];
            if (!_firstLoraNode.is_lora_manager) {
                currentVal = _wfNode.inputs?.lora_name || currentVal;
            } else {
                // LoraManager: loras.__value__[0].nameからフルパスを復元
                const _wfLoras = _wfNode.inputs?.loras?.__value__;
                if (Array.isArray(_wfLoras) && _wfLoras.length > 0) {
                    const _stem = _wfLoras[0].name;
                    const _found = (this.models.loras || []).find(m => _loraBasename(m) === _stem);
                    currentVal = _found || _stem;
                }
            }
        }

        // Fetch Stack group, metadata, CivitAI cache in parallel
        let stackModels = [];
        let metadata = {};
        let civitaiCache = {};
        try {
            const [grpRes, metaRes, civRes] = await Promise.all([
                fetch("/api/wfm/models/groups?type=lora"),
                fetch("/api/wfm/models/metadata"),
                fetch("/api/wfm/models/civitai/cache"),
            ]);
            const groups = grpRes.ok ? await grpRes.json() : {};
            stackModels = groups["Stack"] || [];
            metadata = metaRes.ok ? await metaRes.json() : {};
            civitaiCache = civRes.ok ? await civRes.json() : {};
        } catch { /* ignore */ }

        stackModels.forEach((m) => {
            if (!_stackStrengths[m]) _stackStrengths[m] = { m: 1.0, c: 1.0 };
            if (_stackActive[m] === undefined) _stackActive[m] = true;
        });

        // Build Stack trigger words
        const activeTriggerWords = [];
        const allStackTriggers = [];
        stackModels.forEach((m) => {
            const sha = (metadata[m] || {}).sha256;
            const civInfo = sha && civitaiCache[sha];
            if (civInfo?.trainedWords?.length) {
                allStackTriggers.push(...civInfo.trainedWords);
                if (_stackActive[m] !== false) activeTriggerWords.push(...civInfo.trainedWords);
            }
        });
        const stackTriggerHtml = activeTriggerWords.length
            ? activeTriggerWords.map((w) => `<span class="wfm-lora-trigger-word">${w}</span>`).join(" ")
            : `<span style="color:var(--wfm-text-secondary);font-size:12px;">—</span>`;
        const stackLoraSyntax = _buildLoraSyntax(stackModels);
        const allActive = stackModels.every((m) => _stackActive[m] !== false);
        const anyActive = stackModels.some((m) => _stackActive[m] !== false);

        const stackModelRows = stackModels.map((m) => {
            const stem = _loraBasename(m);
            const str = _stackStrengths[m] || { m: 1.0, c: 1.0 };
            const active = _stackActive[m] !== false;
            return `
            <div class="wfm-lora-stack-model-row${active ? "" : " wfm-lora-stack-model-row--off"}" data-model="${m.replace(/"/g, "&quot;")}">
                <input type="checkbox" class="wfm-lora-stack-active-cb" ${active ? "checked" : ""} title="Enable/Disable">
                <span class="wfm-lora-stack-model-name" title="${m}">${stem}</span>
                <div class="wfm-lora-stack-strengths">
                    <input type="number" class="wfm-input wfm-lora-stack-str-m" value="${str.m}" step="0.05" min="0" max="2" style="width:64px;" ${active ? "" : "disabled"}>
                    <input type="number" class="wfm-input wfm-lora-stack-str-c" value="${str.c}" step="0.05" min="0" max="2" style="width:64px;" ${active ? "" : "disabled"}>
                </div>
            </div>`;
        }).join("");

        const _prevActiveTab = el.querySelector(".wfm-lora-tab-btn.active")?.dataset?.tab || "single";
        // applyToGenUIで設定したSingle表示の状態を保存（再描画後に復元）
        const _prevSingleSyntax = document.getElementById("wfm-lora-single-syntax")?.textContent || "";
        const _prevSingleTriggers = document.getElementById("wfm-lora-single-triggers")?.innerHTML || "";

        el.innerHTML = `
            <div class="wfm-lora-tab-header">
                <button class="wfm-lora-tab-btn active" data-tab="single">Single</button>
                <button class="wfm-lora-tab-btn" data-tab="stack">Stack</button>
            </div>

            <!-- Single tab -->
            <div class="wfm-lora-tab-content" id="wfm-lora-panel-single">
                <input type="text" class="wfm-input" id="wfm-lora-filter" placeholder="Filter...">
                <select class="wfm-select" id="wfm-lora-select">
                    ${loras.map((m) => `<option value="${m}" ${m === currentVal ? "selected" : ""}>${m}</option>`).join("")}
                </select>
                <div class="wfm-lora-strength-single">
                    <span>M</span>
                    <input type="number" class="wfm-input" id="wfm-lora-str-model" value="1.0" step="0.05" min="0" max="2">
                    <span>C</span>
                    <input type="number" class="wfm-input" id="wfm-lora-str-clip" value="1.0" step="0.05" min="0" max="2">
                </div>
                <div class="wfm-lora-stack-header">
                    <select class="wfm-select" id="wfm-lora-single-target" style="flex:1;min-width:0;">${nodeOpts}</select>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-lora-single-apply" title="Apply LoRA to node and sync to Positive prompt">Apply</button>
                    <button class="wfm-btn wfm-btn-sm wfm-lora-p-btn" id="wfm-lora-single-pos-apply" title="Apply Positive prompt to workflow">P</button>
                </div>
                <div class="wfm-lora-stack-info-block">
                    <div class="wfm-lora-stack-info-label">Lora syntax</div>
                    <div id="wfm-lora-single-syntax" class="wfm-lora-stack-syntax">—</div>
                </div>
                <div class="wfm-lora-stack-info-block">
                    <div class="wfm-lora-stack-info-label">Trigger words</div>
                    <div id="wfm-lora-single-triggers" class="wfm-lora-stack-triggers"><span style="color:var(--wfm-text-secondary);font-size:12px;">—</span></div>
                </div>
            </div>

            <!-- Stack tab -->
            <div class="wfm-lora-tab-content" id="wfm-lora-panel-stack" style="display:none;">
                <div class="wfm-lora-stack-header">
                    <select class="wfm-select" id="wfm-lora-stack-target" style="flex:1;min-width:0;">${stackTargetOpts}</select>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-lora-stack-apply" title="Apply Stack to node and sync to Positive prompt">Apply</button>
                    <button class="wfm-btn wfm-btn-sm wfm-lora-p-btn" id="wfm-lora-pos-apply" title="Apply Positive prompt to workflow">P</button>
                </div>
                <div class="wfm-lora-strength-combined">
                    <span class="wfm-lora-stack-label" style="margin-right:4px;flex-shrink:0;">Stack</span>
                    <input type="checkbox" id="wfm-lora-stack-toggle-all" ${allActive ? "checked" : ""} title="Toggle all stack models" style="flex-shrink:0;margin-right:8px;">
                    ${stackModels.length > 0 ? `
                    <div class="wfm-lora-stack-global-adj-groups">
                        <div class="wfm-lora-stack-global-adj-group">
                            <span>Str M</span>
                            <button class="wfm-btn wfm-btn-xs" id="wfm-stack-adj-m-dec">−</button>
                            <input type="number" id="wfm-stack-adj-step-m" class="wfm-input wfm-lora-stack-adj-step" value="0.05" step="0.05" min="0.01" max="2.0">
                            <button class="wfm-btn wfm-btn-xs" id="wfm-stack-adj-m-inc">+</button>
                        </div>
                        <div class="wfm-lora-stack-global-adj-group">
                            <span>C</span>
                            <button class="wfm-btn wfm-btn-xs" id="wfm-stack-adj-c-dec">−</button>
                            <input type="number" id="wfm-stack-adj-step-c" class="wfm-input wfm-lora-stack-adj-step" value="0.05" step="0.05" min="0.01" max="2.0">
                            <button class="wfm-btn wfm-btn-xs" id="wfm-stack-adj-c-inc">+</button>
                        </div>
                    </div>
                    ` : ""}
                </div>
                <div class="wfm-lora-stack-info-block">
                    <div class="wfm-lora-stack-info-label">Lora syntax</div>
                    <div id="wfm-lora-stack-syntax" class="wfm-lora-stack-syntax">—</div>
                </div>
                <div class="wfm-lora-stack-info-block">
                    <div class="wfm-lora-stack-info-label">Trigger words</div>
                    <div id="wfm-lora-stack-triggers" class="wfm-lora-stack-triggers">${stackTriggerHtml}</div>
                </div>
                <div class="wfm-lora-stack-models">
                    ${stackModelRows || `<p class="wfm-placeholder">No models in Stack group</p>`}
                </div>
            </div>
        `;

        // Fix: overwrite textContent to avoid HTML parsing of <lora:...> syntax
        const _synEl = document.getElementById("wfm-lora-stack-syntax");
        if (_synEl) _synEl.textContent = stackLoraSyntax || "—";

        // Single: applyToGenUIで設定したsyntax/triggersを復元
        if (_prevSingleSyntax && _prevSingleSyntax !== "—") {
            const _sEl = document.getElementById("wfm-lora-single-syntax");
            if (_sEl) _sEl.textContent = _prevSingleSyntax;
        }
        if (_prevSingleTriggers) {
            const _tEl = document.getElementById("wfm-lora-single-triggers");
            if (_tEl && !_prevSingleTriggers.includes(">—<")) _tEl.innerHTML = _prevSingleTriggers;
        }

        // ── Tab switching ────────────────────────────────────
        el.querySelectorAll(".wfm-lora-tab-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                el.querySelectorAll(".wfm-lora-tab-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                const tab = btn.dataset.tab;
                document.getElementById("wfm-lora-panel-single").style.display = tab === "single" ? "" : "none";
                document.getElementById("wfm-lora-panel-stack").style.display = tab === "stack" ? "" : "none";
            });
        });

        // Restore previously active tab after re-render
        if (_prevActiveTab === "stack") {
            el.querySelector('[data-tab="single"]')?.classList.remove("active");
            el.querySelector('[data-tab="stack"]')?.classList.add("active");
            document.getElementById("wfm-lora-panel-single").style.display = "none";
            document.getElementById("wfm-lora-panel-stack").style.display = "";
        }

        // ── Single: filter ───────────────────────────────────
        document.getElementById("wfm-lora-filter")?.addEventListener("input", (e) => {
            const filter = e.target.value.toLowerCase();
            const select = document.getElementById("wfm-lora-select");
            if (!select) return;
            select.innerHTML = loras
                .filter((m) => m.toLowerCase().includes(filter))
                .map((m) => `<option value="${m}">${m}</option>`)
                .join("");
            _refreshLoraSingleDynamic(metadata, civitaiCache);
        });

        // ── Single: update SYNTAX/TRIGGERS on model or strength change ──
        document.getElementById("wfm-lora-select")?.addEventListener("change", () => _refreshLoraSingleDynamic(metadata, civitaiCache));
        document.getElementById("wfm-lora-str-model")?.addEventListener("input", () => _refreshLoraSingleDynamic(metadata, civitaiCache));
        document.getElementById("wfm-lora-str-clip")?.addEventListener("input", () => _refreshLoraSingleDynamic(metadata, civitaiCache));

        // ── Single: Apply button ─────────────────────────────
        document.getElementById("wfm-lora-single-apply")?.addEventListener("click", () => {
            const nodeId = document.getElementById("wfm-lora-single-target")?.value;
            const select = document.getElementById("wfm-lora-select");
            if (!nodeId || !comfyUI.currentWorkflow?.[nodeId] || !select?.value) return;

            const node = loraNodes.find((n) => String(n.id) === String(nodeId));
            const strModel = parseFloat(document.getElementById("wfm-lora-str-model")?.value) || 1.0;
            const strClip = parseFloat(document.getElementById("wfm-lora-str-clip")?.value) || 1.0;
            _applyLoraToNode(nodeId, select.value, strModel, strClip, node?.is_lora_manager);
            _syncRawJson();

            // Sync to Positive prompt
            const posTextarea = document.getElementById("wfm-prompt-pos-text");
            if (!posTextarea) return;
            const stem = _loraBasename(select.value);
            const loraSyntax = `<lora:${stem}:${strModel}:${strClip}>`;
            const sha = (metadata[select.value] || {}).sha256;
            const civInfo = sha && civitaiCache[sha];
            const triggerWords = civInfo?.trainedWords || [];

            let cleaned = posTextarea.value;
            const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            cleaned = cleaned.replace(new RegExp(`,?\\s*<lora:${escapedStem}:[^>]*>`, "gi"), "");
            if (triggerWords.length > 0) {
                const wordSet = new Set(triggerWords.map(w => w.trim().toLowerCase()));
                cleaned = cleaned.split(",").map(p => p.trim()).filter(p => p && !wordSet.has(p.toLowerCase())).join(", ");
            }
            cleaned = cleaned.replace(/,\s*$/, "").trim();
            const append = triggerWords.length > 0 ? `${loraSyntax}, ${triggerWords.join(", ")}` : loraSyntax;
            posTextarea.value = cleaned ? `${cleaned}, ${append}` : append;

            const posNodeId = document.getElementById("wfm-prompt-pos-target")?.value;
            if (posNodeId && comfyUI.currentWorkflow?.[posNodeId]) {
                const promptNode = comfyUI.currentAnalysis?.prompt_nodes?.find(n => String(n.id) === String(posNodeId));
                comfyUI.currentWorkflow[posNodeId].inputs[promptNode?.textKey || "text"] = posTextarea.value;
                _syncRawJson();
            }
        });

        // ── Single: P button ─────────────────────────────────
        document.getElementById("wfm-lora-single-pos-apply")?.addEventListener("click", () => {
            const nodeId = document.getElementById("wfm-prompt-pos-target")?.value;
            const text = document.getElementById("wfm-prompt-pos-text")?.value;
            if (nodeId && comfyUI.currentWorkflow?.[nodeId]) {
                const promptNode = comfyUI.currentAnalysis?.prompt_nodes?.find(n => String(n.id) === String(nodeId));
                comfyUI.currentWorkflow[nodeId].inputs[promptNode?.textKey || "text"] = text;
                _syncRawJson();
            }
        });

        // ── Stack: per-model strength + toggle ───────────────
        el.querySelectorAll(".wfm-lora-stack-model-row").forEach((row) => {
            const modelName = row.dataset.model;
            const inputM = row.querySelector(".wfm-lora-stack-str-m");
            const inputC = row.querySelector(".wfm-lora-stack-str-c");
            const cbActive = row.querySelector(".wfm-lora-stack-active-cb");

            const onStrChange = () => {
                _stackStrengths[modelName] = { m: parseFloat(inputM.value) || 1.0, c: parseFloat(inputC.value) || 1.0 };
                _refreshLoraPaneDynamic(stackModels, metadata, civitaiCache);
            };
            inputM?.addEventListener("input", onStrChange);
            inputC?.addEventListener("input", onStrChange);

            cbActive?.addEventListener("change", () => {
                const on = cbActive.checked;
                _stackActive[modelName] = on;
                row.classList.toggle("wfm-lora-stack-model-row--off", !on);
                if (inputM) inputM.disabled = !on;
                if (inputC) inputC.disabled = !on;
                _syncStackToggleAll(stackModels);
                _refreshLoraPaneDynamic(stackModels, metadata, civitaiCache);
            });
        });

        // ── Stack: toggle-all checkbox ───────────────────────
        const toggleAllCb = document.getElementById("wfm-lora-stack-toggle-all");
        if (toggleAllCb) {
            toggleAllCb.indeterminate = !allActive && anyActive;
            toggleAllCb.addEventListener("change", () => {
                const on = toggleAllCb.checked;
                stackModels.forEach((m) => { _stackActive[m] = on; });
                el.querySelectorAll(".wfm-lora-stack-model-row").forEach((row) => {
                    const cb = row.querySelector(".wfm-lora-stack-active-cb");
                    const inM = row.querySelector(".wfm-lora-stack-str-m");
                    const inC = row.querySelector(".wfm-lora-stack-str-c");
                    if (cb) cb.checked = on;
                    if (inM) inM.disabled = !on;
                    if (inC) inC.disabled = !on;
                    row.classList.toggle("wfm-lora-stack-model-row--off", !on);
                });
                _refreshLoraPaneDynamic(stackModels, metadata, civitaiCache);
            });
        }

        // ── Stack: global strength adjustment ────────────────
        if (stackModels.length > 0) {
            const adjApply = (key, sign) => {
                const delta = sign * (parseFloat(document.getElementById(`wfm-stack-adj-step-${key}`)?.value) || 0.05);
                stackModels.forEach((m) => {
                    const str = _stackStrengths[m] || { m: 1.0, c: 1.0 };
                    str[key] = Math.max(0, Math.round((str[key] + delta) * 1000) / 1000);
                    _stackStrengths[m] = str;
                });
                el.querySelectorAll(".wfm-lora-stack-model-row").forEach((row) => {
                    const str = _stackStrengths[row.dataset.model];
                    if (!str) return;
                    const inp = row.querySelector(`.wfm-lora-stack-str-${key}`);
                    if (inp) inp.value = str[key];
                });
                _refreshLoraPaneDynamic(stackModels, metadata, civitaiCache);
            };
            document.getElementById("wfm-stack-adj-m-inc")?.addEventListener("click", () => adjApply("m", 1));
            document.getElementById("wfm-stack-adj-m-dec")?.addEventListener("click", () => adjApply("m", -1));
            document.getElementById("wfm-stack-adj-c-inc")?.addEventListener("click", () => adjApply("c", 1));
            document.getElementById("wfm-stack-adj-c-dec")?.addEventListener("click", () => adjApply("c", -1));
        }

        // ── Stack: Apply button ──────────────────────────────
        document.getElementById("wfm-lora-stack-apply")?.addEventListener("click", () => {
            const nodeId = document.getElementById("wfm-lora-stack-target")?.value;
            if (!nodeId || !comfyUI.currentWorkflow?.[nodeId]) return;

            const node = loraNodes.find((n) => String(n.id) === String(nodeId));
            if (node?.is_lora_manager) {
                const loraValue = stackModels.map((m) => {
                    const stem = _loraBasename(m);
                    const str = _stackStrengths[m] || { m: 1.0, c: 1.0 };
                    const active = _stackActive[m] !== false;
                    return { name: stem, strength: str.m, active, expanded: false, clipStrength: str.c, locked: false };
                });
                comfyUI.currentWorkflow[nodeId].inputs.loras = { __value__: loraValue };
                comfyUI.currentWorkflow[nodeId].inputs.text = _buildLoraManagerSyntax(stackModels);
            } else {
                const first = stackModels[0];
                if (first) {
                    comfyUI.currentWorkflow[nodeId].inputs.lora_name = first;
                    comfyUI.currentWorkflow[nodeId].inputs.strength_model = _stackStrengths[first]?.m ?? 1.0;
                    comfyUI.currentWorkflow[nodeId].inputs.strength_clip = _stackStrengths[first]?.c ?? 1.0;
                }
            }
            _syncRawJson();

            // Sync Stack LORA SYNTAX + TRIGGER WORDS to Positive prompt
            const posTextarea = document.getElementById("wfm-prompt-pos-text");
            if (!posTextarea) return;
            const effectiveSyntax = _buildLoraSyntax(stackModels);

            // Recompute trigger words at apply-time using the current _stackActive state
            const currentAllTriggers = [];
            const currentActiveTriggers = [];
            stackModels.forEach((m) => {
                const sha = (metadata[m] || {}).sha256;
                const civInfo = sha && civitaiCache[sha];
                if (civInfo?.trainedWords?.length) {
                    currentAllTriggers.push(...civInfo.trainedWords);
                    if (_stackActive[m] !== false) currentActiveTriggers.push(...civInfo.trainedWords);
                }
            });

            let cleaned = posTextarea.value;
            for (const m of stackModels) {
                const stem = _loraBasename(m).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                cleaned = cleaned.replace(new RegExp(`,?\\s*<lora:${stem}:[^>]*>`, "gi"), "");
            }
            if (currentAllTriggers.length > 0) {
                const wordSet = new Set(currentAllTriggers.map(w => w.trim().toLowerCase()));
                cleaned = cleaned.split(",").map(p => p.trim()).filter(p => p && !wordSet.has(p.toLowerCase())).join(", ");
            }
            cleaned = cleaned.replace(/,\s*$/, "").trim();
            if (effectiveSyntax) {
                const append = currentActiveTriggers.length > 0
                    ? `${effectiveSyntax}, ${currentActiveTriggers.join(", ")}`
                    : effectiveSyntax;
                posTextarea.value = cleaned ? `${cleaned}, ${append}` : append;
            } else {
                posTextarea.value = cleaned;
            }

            const posNodeId = document.getElementById("wfm-prompt-pos-target")?.value;
            if (posNodeId && comfyUI.currentWorkflow?.[posNodeId]) {
                const promptNode = comfyUI.currentAnalysis?.prompt_nodes?.find(n => String(n.id) === String(posNodeId));
                comfyUI.currentWorkflow[posNodeId].inputs[promptNode?.textKey || "text"] = posTextarea.value;
                _syncRawJson();
            }
        });

        // ── Stack: P button ──────────────────────────────────
        document.getElementById("wfm-lora-pos-apply")?.addEventListener("click", () => {
            const nodeId = document.getElementById("wfm-prompt-pos-target")?.value;
            const text = document.getElementById("wfm-prompt-pos-text")?.value;
            if (nodeId && comfyUI.currentWorkflow?.[nodeId]) {
                const promptNode = comfyUI.currentAnalysis?.prompt_nodes?.find(n => String(n.id) === String(nodeId));
                comfyUI.currentWorkflow[nodeId].inputs[promptNode?.textKey || "text"] = text;
                _syncRawJson();
            }
        });

        // Initial single tab display
        _refreshLoraSingleDynamic(metadata, civitaiCache);
    },

    renderSettingsTab(analysis, containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const sampler = analysis.sampler_nodes?.[0];
        const latent = analysis.latent_nodes?.[0];

        el.innerHTML = `
            <div style="display:flex;flex-direction:row;gap:0;align-items:flex-start;">
                <div style="flex:1;min-width:0;padding-right:14px;border-right:1px solid var(--wfm-border);">
                    <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--wfm-text-secondary);margin:0 0 12px;">KSampler</h3>
                    ${sampler ? `
                    <input type="hidden" id="wfm-settings-sampler-id" value="${sampler.id}" data-seed-key="${sampler.seedKey || "seed"}">
                    <div class="wfm-form-group">
                        <label>Seed</label>
                        <input type="number" class="wfm-input" id="wfm-settings-seed" value="${sampler.seed ?? -1}">
                    </div>
                    <div class="wfm-form-group">
                        <label>Steps</label>
                        <input type="number" class="wfm-input" id="wfm-settings-steps" value="${sampler.steps ?? 20}" min="1" max="200">
                    </div>
                    <div class="wfm-form-group">
                        <label>CFG</label>
                        <input type="number" class="wfm-input" id="wfm-settings-cfg" value="${sampler.cfg ?? 7}" step="0.5" min="0">
                    </div>
                    <div class="wfm-form-group">
                        <label>Sampler</label>
                        <select class="wfm-select" id="wfm-settings-sampler-name">
                            ${this.models.samplers.map((s) => `<option value="${s}" ${s === sampler.sampler_name ? "selected" : ""}>${s}</option>`).join("")}
                        </select>
                    </div>
                    <div class="wfm-form-group">
                        <label>Scheduler</label>
                        <select class="wfm-select" id="wfm-settings-scheduler">
                            ${this.models.schedulers.map((s) => `<option value="${s}" ${s === sampler.scheduler ? "selected" : ""}>${s}</option>`).join("")}
                        </select>
                    </div>
                    <div class="wfm-form-group">
                        <label>Denoise</label>
                        <input type="number" class="wfm-input" id="wfm-settings-denoise" value="${sampler.denoise ?? 1.0}" step="0.05" min="0" max="1">
                    </div>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-settings-sampler-apply">Apply</button>
                    ` : "<p class='wfm-placeholder'>No KSampler node found</p>"}
                </div>
                <div style="flex:1;min-width:0;padding-left:14px;">
                    <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--wfm-text-secondary);margin:0 0 12px;">Latent Image</h3>
                    ${latent ? `
                    <input type="hidden" id="wfm-settings-latent-id" value="${latent.id}">
                    <div class="wfm-form-group">
                        <label>Width</label>
                        <input type="number" class="wfm-input" id="wfm-settings-width" value="${latent.width ?? 512}" step="8" min="64">
                    </div>
                    <div class="wfm-form-group">
                        <label>Height</label>
                        <input type="number" class="wfm-input" id="wfm-settings-height" value="${latent.height ?? 512}" step="8" min="64">
                    </div>
                    <div class="wfm-form-group">
                        <label>Batch Size</label>
                        <input type="number" class="wfm-input" id="wfm-settings-batch" value="${latent.batch_size ?? 1}" min="1" max="64">
                    </div>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-settings-latent-apply">Apply</button>
                    <div style="margin-top:10px;border-top:1px solid var(--wfm-border);padding-top:10px;">
                        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
                            ${[512, 768, 1024, 2048].map((s) => `<button class="wfm-btn wfm-btn-sm wfm-latent-sq-btn" data-size="${s}">${s}</button>`).join("")}
                            <button class="wfm-btn wfm-btn-sm wfm-latent-sq-btn" data-size="1024">1K</button>
                            <button class="wfm-btn wfm-btn-sm wfm-latent-sq-btn" data-size="2048">2K</button>
                            <button class="wfm-btn wfm-btn-sm wfm-latent-sq-btn" data-size="4096">4K</button>
                        </div>
                        <div style="display:flex;align-items:center;gap:4px;margin-bottom:6px;">
                            <select id="wfm-latent-preset-select" style="flex:1;padding:4px 6px;font-size:12px;background:var(--wfm-surface);color:var(--wfm-text);border:1px solid var(--wfm-border);border-radius:4px;min-width:0;">
                                ${_buildPresetOptions(_loadLatentPresets())}
                            </select>
                            <button class="wfm-btn wfm-btn-sm" id="wfm-latent-wh-set" title="Width→左、Height→右にセット">WHSet</button>
                            <button class="wfm-btn wfm-btn-sm" id="wfm-latent-hw-set" title="Width→右、Height→左にセット">HWSet</button>
                        </div>
                        <div style="display:flex;gap:4px;">
                            <button class="wfm-btn wfm-btn-sm" id="wfm-latent-preset-add" title="現在のWidth/Heightをプリセットに追加">+</button>
                            <button class="wfm-btn wfm-btn-sm" id="wfm-latent-preset-del" title="選択中のカスタムプリセットを削除">−</button>
                        </div>
                    </div>
                    ` : "<p class='wfm-placeholder'>No EmptyLatentImage node found</p>"}
                </div>
            </div>
        `;

        document.getElementById("wfm-settings-sampler-apply")?.addEventListener("click", () => {
            const nodeId = document.getElementById("wfm-settings-sampler-id")?.value;
            if (!nodeId || !comfyUI.currentWorkflow?.[nodeId]) return;
            const inputs = comfyUI.currentWorkflow[nodeId].inputs;
            // KSamplerAdvanced uses noise_seed; fall back to seed
            const seedKey = document.getElementById("wfm-settings-sampler-id")?.dataset?.seedKey || "seed";
            inputs[seedKey] = parseInt(document.getElementById("wfm-settings-seed")?.value) || -1;
            inputs.steps = parseInt(document.getElementById("wfm-settings-steps")?.value) || 20;
            inputs.cfg = parseFloat(document.getElementById("wfm-settings-cfg")?.value) || 7;
            inputs.sampler_name = document.getElementById("wfm-settings-sampler-name")?.value;
            inputs.scheduler = document.getElementById("wfm-settings-scheduler")?.value;
            inputs.denoise = parseFloat(document.getElementById("wfm-settings-denoise")?.value) || 1.0;
            _syncRawJson();
        });

        document.getElementById("wfm-settings-latent-apply")?.addEventListener("click", () => {
            const nodeId = document.getElementById("wfm-settings-latent-id")?.value;
            if (!nodeId || !comfyUI.currentWorkflow?.[nodeId]) return;
            const inputs = comfyUI.currentWorkflow[nodeId].inputs;
            inputs.width = parseInt(document.getElementById("wfm-settings-width")?.value) || 512;
            inputs.height = parseInt(document.getElementById("wfm-settings-height")?.value) || 512;
            inputs.batch_size = parseInt(document.getElementById("wfm-settings-batch")?.value) || 1;
            _syncRawJson();
        });

        // 正方形プリセットボタン
        document.querySelectorAll(".wfm-latent-sq-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const size = parseInt(btn.dataset.size);
                const w = document.getElementById("wfm-settings-width");
                const h = document.getElementById("wfm-settings-height");
                if (w) w.value = size;
                if (h) h.value = size;
            });
        });

        // ドロップダウン WHSet / HWSet
        document.getElementById("wfm-latent-wh-set")?.addEventListener("click", () => {
            const val = document.getElementById("wfm-latent-preset-select")?.value;
            if (!val) return;
            const [pw, ph] = val.split("x").map(Number);
            const w = document.getElementById("wfm-settings-width");
            const h = document.getElementById("wfm-settings-height");
            if (w) w.value = pw;
            if (h) h.value = ph;
        });

        document.getElementById("wfm-latent-hw-set")?.addEventListener("click", () => {
            const val = document.getElementById("wfm-latent-preset-select")?.value;
            if (!val) return;
            const [pw, ph] = val.split("x").map(Number);
            const w = document.getElementById("wfm-settings-width");
            const h = document.getElementById("wfm-settings-height");
            if (w) w.value = ph;
            if (h) h.value = pw;
        });

        // + ボタン: 現在のW/Hをカスタムプリセットの先頭に追加
        document.getElementById("wfm-latent-preset-add")?.addEventListener("click", () => {
            const wVal = parseInt(document.getElementById("wfm-settings-width")?.value);
            const hVal = parseInt(document.getElementById("wfm-settings-height")?.value);
            if (!wVal || !hVal) return;
            const customs = _loadLatentPresets();
            const key = `${wVal}x${hVal}`;
            const isDefault = _LATENT_DEFAULT_PRESETS.some((p) => p.w === wVal && p.h === hVal);
            const alreadyCustom = customs.some((p) => p.w === wVal && p.h === hVal);
            if (isDefault || alreadyCustom) return;
            customs.unshift({ w: wVal, h: hVal });
            _saveLatentPresets(customs);
            _refreshPresetSelect(customs);
            // 追加した項目を選択状態にする
            const sel = document.getElementById("wfm-latent-preset-select");
            if (sel) sel.value = key;
        });

        // − ボタン: 選択中のカスタムプリセットを削除（デフォルトは削除不可）
        document.getElementById("wfm-latent-preset-del")?.addEventListener("click", () => {
            const sel = document.getElementById("wfm-latent-preset-select");
            if (!sel) return;
            const opt = sel.options[sel.selectedIndex];
            if (!opt || opt.dataset.default === "1") return;
            const [dw, dh] = sel.value.split("x").map(Number);
            const customs = _loadLatentPresets().filter((p) => !(p.w === dw && p.h === dh));
            _saveLatentPresets(customs);
            _refreshPresetSelect(customs);
        });
    },

    renderImageTab(analysis, containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const loadNodes = analysis.load_image_nodes || [];
        if (loadNodes.length === 0) {
            el.innerHTML = `<p class="wfm-placeholder">No LoadImage nodes found in workflow</p>`;
            return;
        }

        // Render up to 4 image input slots
        const slots = loadNodes.slice(0, 4);
        el.innerHTML = `
            <div class="wfm-i2i-grid">
                ${slots.map((node, i) => `
                    <div class="wfm-i2i-slot" data-slot="${i}" data-node-id="${node.id}">
                        <div class="wfm-i2i-slot-header">
                            <span style="font-weight:600;font-size:12px;">ID:${node.id} ${node.title}</span>
                            <span class="wfm-i2i-filename" id="wfm-i2i-filename-${i}">${node.image || ""}</span>
                        </div>
                        <div class="wfm-i2i-preview-wrap" id="wfm-i2i-preview-wrap-${i}" style="${node.image ? "" : "display:none;"}">
                            <img class="wfm-i2i-preview-img" id="wfm-i2i-preview-${i}" src="${node.image ? `/view?filename=${encodeURIComponent(node.image)}&type=input` : ""}">
                        </div>
                        <div class="wfm-i2i-drop-zone" id="wfm-i2i-drop-${i}">
                            <label class="wfm-i2i-drop-label">
                                Drop image or click to select
                                <input type="file" accept="image/*" class="wfm-i2i-file" id="wfm-i2i-file-${i}" style="display:none;">
                            </label>
                        </div>
                        <div style="display:flex;gap:6px;margin-top:6px;">
                            <button class="wfm-btn wfm-btn-sm wfm-btn-primary wfm-i2i-apply" data-slot="${i}" disabled>Apply</button>
                            <span class="wfm-i2i-status" id="wfm-i2i-status-${i}"></span>
                        </div>
                    </div>
                `).join("")}
            </div>
        `;

        // Initialize each slot
        slots.forEach((node, i) => {
            const fileInput = document.getElementById(`wfm-i2i-file-${i}`);
            const applyBtn = el.querySelector(`.wfm-i2i-apply[data-slot="${i}"]`);
            const previewWrap = document.getElementById(`wfm-i2i-preview-wrap-${i}`);
            const previewImg = document.getElementById(`wfm-i2i-preview-${i}`);
            const filenameEl = document.getElementById(`wfm-i2i-filename-${i}`);
            const statusEl = document.getElementById(`wfm-i2i-status-${i}`);
            const dropZone = document.getElementById(`wfm-i2i-drop-${i}`);
            let pendingFile = null;

            const applyFile = (file) => {
                if (!file || !file.type.startsWith("image/")) return;
                pendingFile = file;
                const url = URL.createObjectURL(file);
                previewImg.src = url;
                previewWrap.style.display = "";
                filenameEl.textContent = file.name;
                applyBtn.disabled = false;
                statusEl.textContent = "";
            };

            // File input change
            fileInput?.addEventListener("change", () => {
                if (fileInput.files.length > 0) applyFile(fileInput.files[0]);
            });

            // Drag & drop
            if (dropZone) {
                dropZone.addEventListener("dragover", (e) => {
                    e.preventDefault();
                    dropZone.classList.add("drag-over");
                });
                dropZone.addEventListener("dragleave", () => {
                    dropZone.classList.remove("drag-over");
                });
                dropZone.addEventListener("drop", (e) => {
                    e.preventDefault();
                    dropZone.classList.remove("drag-over");
                    if (e.dataTransfer.files.length > 0) applyFile(e.dataTransfer.files[0]);
                });
            }

            // Apply button: upload to ComfyUI and set on node
            applyBtn?.addEventListener("click", async () => {
                if (!pendingFile) return;
                applyBtn.disabled = true;
                statusEl.textContent = "Uploading...";
                try {
                    const result = await comfyUI.uploadImage(pendingFile, pendingFile.name);
                    if (result.name) {
                        // Update workflow node
                        if (comfyUI.currentWorkflow?.[node.id]) {
                            comfyUI.currentWorkflow[node.id].inputs.image = result.name;
                        }
                        statusEl.textContent = `✓ ${result.name}`;
                        statusEl.style.color = "var(--wfm-success)";
                        filenameEl.textContent = result.name;
                        _syncRawJson();
                    } else {
                        throw new Error("Upload returned no filename");
                    }
                } catch (err) {
                    statusEl.textContent = `✗ ${err.message}`;
                    statusEl.style.color = "var(--wfm-danger)";
                    applyBtn.disabled = false;
                }
            });
        });
    },

    syncToWorkflow() {
        // Sync prompt texts before generation
        const posSelect = document.getElementById("wfm-prompt-pos-target");
        const posTarget = posSelect?.value;
        const posText = document.getElementById("wfm-prompt-pos-text")?.value;
        if (posTarget && comfyUI.currentWorkflow?.[posTarget]) {
            const posTextKey = posSelect.selectedOptions[0]?.dataset?.textKey || "text";
            comfyUI.currentWorkflow[posTarget].inputs[posTextKey] = posText;
        }

        const negSelect = document.getElementById("wfm-prompt-neg-target");
        const negTarget = negSelect?.value;
        const negText = document.getElementById("wfm-prompt-neg-text")?.value;
        if (negTarget && comfyUI.currentWorkflow?.[negTarget]) {
            const negTextKey = negSelect.selectedOptions[0]?.dataset?.textKey || "text";
            comfyUI.currentWorkflow[negTarget].inputs[negTextKey] = negText;
        }
    },

    disableAllStack(containerId = "wfm-gen-lora-fields") {
        for (const k of Object.keys(_stackActive)) {
            _stackActive[k] = false;
        }
        const toggleAll = document.getElementById("wfm-lora-stack-toggle-all");
        if (toggleAll) toggleAll.checked = false;
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll(".wfm-lora-stack-model-row").forEach((row) => {
            row.classList.add("wfm-lora-stack-model-row--off");
            const cb = row.querySelector(".wfm-lora-stack-active-cb");
            const inM = row.querySelector(".wfm-lora-stack-str-m");
            const inC = row.querySelector(".wfm-lora-stack-str-c");
            if (cb) cb.checked = false;
            if (inM) inM.disabled = true;
            if (inC) inC.disabled = true;
        });
    },

    appendEmbeddingToPrompt(syntax, promptType) {
        const promptNodes = (comfyUI.currentAnalysis?.prompt_nodes || []).filter((n) => n.role === promptType);
        const textareaId = promptType === "positive" ? "wfm-prompt-pos-text" : "wfm-prompt-neg-text";
        const textarea = document.getElementById(textareaId);

        if (promptNodes.length > 0 && comfyUI.currentWorkflow) {
            const node = promptNodes[0];
            const wfNode = comfyUI.currentWorkflow[node.id];
            if (wfNode) {
                const textKey = node.textKey || "text";
                const current = wfNode.inputs[textKey] || "";
                const newText = current ? `${current}, ${syntax}` : syntax;
                wfNode.inputs[textKey] = newText;
                if (textarea) textarea.value = newText;
                _syncRawJson();
                return;
            }
        }

        // Fallback: update textarea only
        if (textarea) {
            const current = textarea.value;
            textarea.value = current ? `${current}, ${syntax}` : syntax;
        }
    },

    switchLoraSingleTab() {
        const container = document.getElementById("wfm-gen-lora-fields");
        if (!container) return;
        container.querySelectorAll(".wfm-lora-tab-btn").forEach(b => b.classList.remove("active"));
        const singleBtn = container.querySelector(".wfm-lora-tab-btn[data-tab='single']");
        if (singleBtn) singleBtn.classList.add("active");
        const singlePanel = document.getElementById("wfm-lora-panel-single");
        const stackPanel = document.getElementById("wfm-lora-panel-stack");
        if (singlePanel) singlePanel.style.display = "";
        if (stackPanel) stackPanel.style.display = "none";
    },
};

function _nodeOptions(nodes) {
    if (!nodes) return "";
    return nodes
        .map((n) => `<option value="${n.id}">ID:${n.id} (${n.title})</option>`)
        .join("");
}

/**
 * ComfyUI Editor - Dynamic UI generation for workflow parameter editing
 */

import { comfyUI } from "./comfyui-client.js";
import { syncJsonHighlight } from "./json-highlight.js";

// ── LoRA pane stack state ─────────────────────────────────
// { modelFullPath: { m: number, c: number } }
let _stackStrengths = {};
// { modelFullPath: boolean } — true = active (default)
let _stackActive = {};

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

function _refreshLoraPaneDynamic(stackModels) {
    const syntaxEl = document.getElementById("wfm-lora-stack-syntax");
    if (syntaxEl) syntaxEl.textContent = _buildLoraSyntax(stackModels) || "—";
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
        samplers: [],
        schedulers: [],
        lastError: null,
    },

    async loadModelLists() {
        try {
            const [ckpt, vae, lora, diff, enc, cn, samp, sched] = await Promise.all([
                comfyUI.fetchCheckpoints(),
                comfyUI.fetchVaes(),
                comfyUI.fetchLoras(),
                comfyUI.fetchDiffusionModels(),
                comfyUI.fetchTextEncoders(),
                comfyUI.fetchControlNets(),
                comfyUI.fetchSamplers(),
                comfyUI.fetchSchedulers(),
            ]);
            this.models.checkpoints = ckpt;
            this.models.vaes = vae;
            this.models.loras = lora;
            this.models.diffusionModels = diff;
            this.models.textEncoders = enc;
            this.models.controlNets = cn;
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
                <textarea class="wfm-textarea" id="wfm-prompt-pos-text" rows="8">${positiveNodes[0]?.text || ""}</textarea>
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
        ];

        el.innerHTML = sections
            .map((s) => {
                const models = this.models[s.key] || [];
                const currentVal = s.nodes?.[0]?.[s.inputKey] || "";
                const targetOpts = s.nodes
                    .map((n) => `<option value="${n.id}">ID:${n.id} (${n.title})</option>`)
                    .join("");

                return `
                <div class="wfm-form-group" style="border-bottom:1px solid var(--wfm-border);padding-bottom:12px;">
                    <label>${s.label}</label>
                    <input type="text" class="wfm-input wfm-model-filter" placeholder="Filter..." data-target="wfm-model-${s.key}" style="margin-bottom:4px;">
                    <select class="wfm-select" id="wfm-model-${s.key}" style="margin-bottom:4px;">
                        ${models.map((m) => `<option value="${m}" ${m === currentVal ? "selected" : ""}>${m}</option>`).join("")}
                    </select>
                    <div style="display:flex;gap:8px;align-items:center;">
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
        // Stack target defaults to first LoraManager node if present
        const defaultStackTarget = (loraNodes.find((n) => n.is_lora_manager) || loraNodes[0])?.id;
        const targetOpts = loraNodes
            .map((n) => `<option value="${n.id}">ID:${n.id} (${n.title})</option>`)
            .join("");
        const stackTargetOpts = loraNodes
            .map((n) => `<option value="${n.id}" ${String(n.id) === String(defaultStackTarget) ? "selected" : ""}>ID:${n.id} (${n.title})</option>`)
            .join("");
        const currentVal = loraNodes[0]?.lora_name || "";

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

        // Initialize strength / active state for new models
        stackModels.forEach((m) => {
            if (!_stackStrengths[m]) _stackStrengths[m] = { m: 1.0, c: 1.0 };
            if (_stackActive[m] === undefined) _stackActive[m] = true;
        });

        // Build trigger words from CivitAI data
        const allTriggerWords = [];
        const activeTriggerWords = [];
        stackModels.forEach((m) => {
            const sha = (metadata[m] || {}).sha256;
            const civInfo = sha && civitaiCache[sha];
            if (civInfo?.trainedWords?.length) {
                allTriggerWords.push(...civInfo.trainedWords);
                if (_stackActive[m] !== false) {
                    activeTriggerWords.push(...civInfo.trainedWords);
                }
            }
        });
        const triggerHtml = allTriggerWords.length
            ? allTriggerWords.map((w) => `<span class="wfm-lora-trigger-word">${w}</span>`).join(" ")
            : `<span style="color:var(--wfm-text-secondary);font-size:12px;">—</span>`;

        const loraSyntax = _buildLoraSyntax(stackModels);

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

        el.innerHTML = `
            <div class="wfm-lora-unified">
                <input type="text" class="wfm-input" id="wfm-lora-filter" placeholder="Filter...">
                <select class="wfm-select" id="wfm-lora-select">
                    ${loras.map((m) => `<option value="${m}" ${m === currentVal ? "selected" : ""}>${m}</option>`).join("")}
                </select>
                <div class="wfm-lora-stack-header">
                    <select class="wfm-select" id="wfm-lora-stack-target" style="flex:1;min-width:0;">${stackTargetOpts}</select>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-lora-stack-apply" title="Apply to node and sync LoRA syntax + trigger words to Positive prompt">Apply</button>
                    <button class="wfm-btn wfm-btn-sm wfm-lora-p-btn" id="wfm-lora-pos-apply" title="Apply Positive prompt to workflow">P</button>
                </div>
                <div class="wfm-lora-strength-combined">
                    <span class="wfm-lora-stack-label" style="margin-right:4px;flex-shrink:0;">Stack</span>
                    <input type="checkbox" id="wfm-lora-stack-toggle-all" ${allActive ? "checked" : ""} title="Toggle all stack models" style="flex-shrink:0;margin-right:8px;">
                    <div class="wfm-lora-strength-single">
                        <span>M</span>
                        <input type="number" class="wfm-input" id="wfm-lora-str-model" value="1.0" step="0.05" min="0" max="2">
                        <span>C</span>
                        <input type="number" class="wfm-input" id="wfm-lora-str-clip" value="1.0" step="0.05" min="0" max="2">
                    </div>
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
                    <div id="wfm-lora-stack-syntax" class="wfm-lora-stack-syntax">${loraSyntax || "—"}</div>
                </div>
                <div class="wfm-lora-stack-info-block">
                    <div class="wfm-lora-stack-info-label">Trigger words</div>
                    <div id="wfm-lora-stack-triggers" class="wfm-lora-stack-triggers">${triggerHtml}</div>
                </div>
                <div class="wfm-lora-stack-models">
                    ${stackModelRows || `<p class="wfm-placeholder">No models in Stack group</p>`}
                </div>
            </div>
        `;

        // Fix: <lora:...> syntax injected via innerHTML is parsed as HTML tags — overwrite with textContent
        const _synEl = document.getElementById("wfm-lora-stack-syntax");
        if (_synEl) _synEl.textContent = loraSyntax || "—";

        // ── Filter ──────────────────────────────────────────
        document.getElementById("wfm-lora-filter")?.addEventListener("input", (e) => {
            const filter = e.target.value.toLowerCase();
            const select = document.getElementById("wfm-lora-select");
            if (!select) return;
            select.innerHTML = loras
                .filter((m) => m.toLowerCase().includes(filter))
                .map((m) => `<option value="${m}">${m}</option>`)
                .join("");
        });

        // ── P button: apply Positive prompt to workflow ───────
        document.getElementById("wfm-lora-pos-apply")?.addEventListener("click", () => {
            const nodeId = document.getElementById("wfm-prompt-pos-target")?.value;
            const text = document.getElementById("wfm-prompt-pos-text")?.value;
            if (nodeId && comfyUI.currentWorkflow?.[nodeId]) {
                const promptNode = comfyUI.currentAnalysis?.prompt_nodes?.find(n => n.id === nodeId);
                const textKey = promptNode?.textKey || "text";
                comfyUI.currentWorkflow[nodeId].inputs[textKey] = text;
                _syncRawJson();
            }
        });

        // ── Stack strength inputs + per-model toggle ─────────
        el.querySelectorAll(".wfm-lora-stack-model-row").forEach((row) => {
            const modelName = row.dataset.model;
            const inputM = row.querySelector(".wfm-lora-stack-str-m");
            const inputC = row.querySelector(".wfm-lora-stack-str-c");
            const cbActive = row.querySelector(".wfm-lora-stack-active-cb");
            const nameSpan = row.querySelector(".wfm-lora-stack-model-name");

            const onStrChange = () => {
                _stackStrengths[modelName] = {
                    m: parseFloat(inputM.value) || 1.0,
                    c: parseFloat(inputC.value) || 1.0,
                };
                _refreshLoraPaneDynamic(stackModels);
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
                _refreshLoraPaneDynamic(stackModels);
            });
        });

        // ── Toggle-all checkbox ───────────────────────────────
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
                _refreshLoraPaneDynamic(stackModels);
            });
        }

        // ── Global strength adjustment ─────────────────────
        if (stackModels.length > 0) {
            const adjApply = (key, sign) => {
                const stepEl = document.getElementById(`wfm-stack-adj-step-${key}`);
                const delta = sign * (parseFloat(stepEl?.value) || 0.05);
                stackModels.forEach((m) => {
                    const str = _stackStrengths[m] || { m: 1.0, c: 1.0 };
                    str[key] = Math.max(0, Math.round((str[key] + delta) * 1000) / 1000);
                    _stackStrengths[m] = str;
                });
                el.querySelectorAll(".wfm-lora-stack-model-row").forEach((row) => {
                    const model = row.dataset.model;
                    const str = _stackStrengths[model];
                    if (!str) return;
                    const inp = row.querySelector(`.wfm-lora-stack-str-${key}`);
                    if (inp) inp.value = str[key];
                });
                _refreshLoraPaneDynamic(stackModels);
            };
            document.getElementById("wfm-stack-adj-m-inc")?.addEventListener("click", () => adjApply("m", 1));
            document.getElementById("wfm-stack-adj-m-dec")?.addEventListener("click", () => adjApply("m", -1));
            document.getElementById("wfm-stack-adj-c-inc")?.addEventListener("click", () => adjApply("c", 1));
            document.getElementById("wfm-stack-adj-c-dec")?.addEventListener("click", () => adjApply("c", -1));
        }

        // ── Apply button (unified: stack or single fallback) ──
        document.getElementById("wfm-lora-stack-apply")?.addEventListener("click", () => {
            // Step 1: apply to node
            const targetSelect = document.getElementById("wfm-lora-stack-target");
            const nodeId = targetSelect?.value;
            if (nodeId && comfyUI.currentWorkflow?.[nodeId]) {
                const node = loraNodes.find((n) => String(n.id) === String(nodeId));
                if (stackModels.length > 0) {
                    if (node?.is_lora_manager) {
                        // LoraManager: apply all stack models; respect active/inactive state
                        const loraValue = stackModels.map((m) => {
                            const stem = _loraBasename(m);
                            const str = _stackStrengths[m] || { m: 1.0, c: 1.0 };
                            const active = _stackActive[m] !== false;
                            return { name: stem, strength: str.m, active, expanded: false, clipStrength: str.c, locked: false };
                        });
                        comfyUI.currentWorkflow[nodeId].inputs.loras = { __value__: loraValue };
                        comfyUI.currentWorkflow[nodeId].inputs.text = _buildLoraManagerSyntax(stackModels);
                    } else {
                        // Standard LoraLoader: apply first model of stack
                        const first = stackModels[0];
                        if (first) {
                            comfyUI.currentWorkflow[nodeId].inputs.lora_name = first;
                            comfyUI.currentWorkflow[nodeId].inputs.strength_model = _stackStrengths[first]?.m ?? 1.0;
                            comfyUI.currentWorkflow[nodeId].inputs.strength_clip = _stackStrengths[first]?.c ?? 1.0;
                        }
                    }
                } else {
                    // No stack — apply selected single LoRA
                    const select = document.getElementById("wfm-lora-select");
                    if (select?.value) {
                        const strModel = parseFloat(document.getElementById("wfm-lora-str-model")?.value) || 1.0;
                        const strClip = parseFloat(document.getElementById("wfm-lora-str-clip")?.value) || 1.0;
                        _applyLoraToNode(nodeId, select.value, strModel, strClip, node?.is_lora_manager);
                    }
                }
                _syncRawJson();
            }

            // Step 2: sync LoRA syntax + trigger words to Positive prompt
            const posTextarea = document.getElementById("wfm-prompt-pos-text");
            if (!posTextarea) return;

            let effectiveModels, effectiveSyntax, effectiveTriggerWords, allTriggers;
            if (stackModels.length > 0) {
                effectiveModels = stackModels;
                effectiveSyntax = _buildLoraSyntax(stackModels);
                effectiveTriggerWords = activeTriggerWords;
                allTriggers = [];
                stackModels.forEach((m) => {
                    const sha = (metadata[m] || {}).sha256;
                    const civInfo = sha && civitaiCache[sha];
                    if (civInfo?.trainedWords?.length) allTriggers.push(...civInfo.trainedWords);
                });
            } else {
                const singleModel = document.getElementById("wfm-lora-select")?.value;
                effectiveModels = singleModel ? [singleModel] : [];
                if (singleModel) {
                    const stem = _loraBasename(singleModel);
                    const strM = parseFloat(document.getElementById("wfm-lora-str-model")?.value) || 1.0;
                    const strC = parseFloat(document.getElementById("wfm-lora-str-clip")?.value) || 1.0;
                    effectiveSyntax = `<lora:${stem}:${strM}:${strC}>`;
                    const sha = (metadata[singleModel] || {}).sha256;
                    const civInfo = sha && civitaiCache[sha];
                    effectiveTriggerWords = civInfo?.trainedWords || [];
                    allTriggers = effectiveTriggerWords;
                } else {
                    effectiveSyntax = "";
                    effectiveTriggerWords = [];
                    allTriggers = [];
                }
            }

            let cleaned = posTextarea.value;
            for (const m of effectiveModels) {
                const stem = _loraBasename(m).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                cleaned = cleaned.replace(new RegExp(`,?\\s*<lora:${stem}:[^>]*>`, "gi"), "");
            }
            if (allTriggers.length > 0) {
                const wordSet = new Set(allTriggers.map(w => w.trim().toLowerCase()));
                cleaned = cleaned.split(",").map(p => p.trim()).filter(p => p && !wordSet.has(p.toLowerCase())).join(", ");
            }
            cleaned = cleaned.replace(/,\s*$/, "").trim();

            if (effectiveSyntax) {
                const append = effectiveTriggerWords.length > 0
                    ? `${effectiveSyntax}, ${effectiveTriggerWords.join(", ")}`
                    : effectiveSyntax;
                posTextarea.value = cleaned ? `${cleaned}, ${append}` : append;
            } else {
                posTextarea.value = cleaned;
            }

            const posTarget = document.getElementById("wfm-prompt-pos-target");
            const posNodeId = posTarget?.value;
            if (posNodeId && comfyUI.currentWorkflow?.[posNodeId]) {
                const promptNode = comfyUI.currentAnalysis?.prompt_nodes?.find(n => n.id === posNodeId);
                const textKey = promptNode?.textKey || "text";
                comfyUI.currentWorkflow[posNodeId].inputs[textKey] = posTextarea.value;
                _syncRawJson();
            }
        });

        // ── Auto-apply Stack to LoraManager on load ──────────
        if (defaultStackTarget && stackModels.length > 0 && comfyUI.currentWorkflow?.[defaultStackTarget]) {
            const targetNode = loraNodes.find((n) => String(n.id) === String(defaultStackTarget));
            if (targetNode?.is_lora_manager) {
                const loraValue = stackModels.map((m) => {
                    const stem = _loraBasename(m);
                    const str = _stackStrengths[m] || { m: 1.0, c: 1.0 };
                    const active = _stackActive[m] !== false;
                    return { name: stem, strength: str.m, active, expanded: false, clipStrength: str.c, locked: false };
                });
                comfyUI.currentWorkflow[defaultStackTarget].inputs.loras = { __value__: loraValue };
                comfyUI.currentWorkflow[defaultStackTarget].inputs.text = _buildLoraManagerSyntax(stackModels);
                _syncRawJson();
            }
        }
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
};

function _nodeOptions(nodes) {
    if (!nodes) return "";
    return nodes
        .map((n) => `<option value="${n.id}">ID:${n.id} (${n.title})</option>`)
        .join("");
}

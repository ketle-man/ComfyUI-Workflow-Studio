/**
 * ComfyUI Editor - Dynamic UI generation for workflow parameter editing
 */

import { comfyUI } from "./comfyui-client.js";
import { syncJsonHighlight } from "./json-highlight.js";

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
                <textarea class="wfm-textarea" id="wfm-prompt-pos-text" rows="4">${positiveNodes[0]?.text || ""}</textarea>
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
                <textarea class="wfm-textarea" id="wfm-prompt-neg-text" rows="3">${negativeNodes[0]?.text || ""}</textarea>
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
            { label: "LoRA", key: "loras", nodes: analysis.lora_nodes, inputKey: "lora_name" },
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
                    ${s.key === "loras" ? `
                    <div style="display:flex;gap:8px;margin-top:6px;align-items:center;">
                        <label style="font-size:12px;">Strength M:</label>
                        <input type="number" class="wfm-input" id="wfm-lora-str-model" value="1.0" step="0.1" min="0" max="2" style="width:70px;">
                        <label style="font-size:12px;">C:</label>
                        <input type="number" class="wfm-input" id="wfm-lora-str-clip" value="1.0" step="0.1" min="0" max="2" style="width:70px;">
                    </div>` : ""}
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
                    // Apply LoRA strengths
                    if (key === "loras") {
                        const strModel = parseFloat(document.getElementById("wfm-lora-str-model")?.value) || 1.0;
                        const strClip = parseFloat(document.getElementById("wfm-lora-str-clip")?.value) || 1.0;
                        comfyUI.currentWorkflow[nodeId].inputs.strength_model = strModel;
                        comfyUI.currentWorkflow[nodeId].inputs.strength_clip = strClip;
                    }
                    _syncRawJson();
                }
            });
        });
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

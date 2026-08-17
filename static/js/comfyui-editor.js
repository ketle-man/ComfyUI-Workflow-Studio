/**
 * ComfyUI Editor - Dynamic UI generation for workflow parameter editing
 */

import { comfyUI } from "./comfyui-client.js";
import { syncJsonHighlight } from "./json-highlight.js";
import { t } from "./i18n.js";
import { escapeHtml, setupSearchClearBtn } from "./util.js";

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

// ── I2I placeholder image (Input tab / Image sub-panel) ──────────────────
// One shared default (color-generated or a fixed uploaded image), remembered across
// sessions. Each LoadImage slot's own "Placeholder" button applies this same default
// to just that slot — see renderImageTab.
const _I2I_PLACEHOLDER_KEY = "wfm_i2i_placeholder";
const _I2I_PLACEHOLDER_DEFAULT = { mode: "color", color: "#808080", width: 512, height: 512, imageFilename: "" };

function _loadI2IPlaceholderConfig() {
    try {
        const raw = localStorage.getItem(_I2I_PLACEHOLDER_KEY);
        return raw ? { ..._I2I_PLACEHOLDER_DEFAULT, ...JSON.parse(raw) } : { ..._I2I_PLACEHOLDER_DEFAULT };
    } catch { return { ..._I2I_PLACEHOLDER_DEFAULT }; }
}

function _saveI2IPlaceholderConfig(cfg) {
    localStorage.setItem(_I2I_PLACEHOLDER_KEY, JSON.stringify(cfg));
}

// Renders a solid-color PNG on an offscreen canvas and returns it as a File, ready to
// upload through comfyUI.uploadImage() the same way a picked/dropped file would be.
function _generateColorImageFile(width, height, color) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, width || 512);
        canvas.height = Math.max(1, height || 512);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = color || "#808080";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (!blob) { reject(new Error("Failed to render placeholder image")); return; }
            resolve(new File([blob], `placeholder_${canvas.width}x${canvas.height}.png`, { type: "image/png" }));
        }, "image/png");
    });
}

// Wires the placeholder config panel at the top of the Image sub-panel (mode switch,
// color/size fields, default-image drop zone). Every change is persisted immediately via
// _saveI2IPlaceholderConfig so it's remembered next time the panel is rendered — this
// panel is display-only config, it doesn't touch any workflow node itself; only each
// slot's own Placeholder button (see renderImageTab) does that.
function _wireI2IPlaceholderConfig(scopeEl) {
    const colorModeRadio = scopeEl.querySelector("#wfm-i2i-ph-mode-color");
    const imageModeRadio = scopeEl.querySelector("#wfm-i2i-ph-mode-image");
    const colorFields = scopeEl.querySelector("#wfm-i2i-ph-color-fields");
    const imageFields = scopeEl.querySelector("#wfm-i2i-ph-image-fields");
    const widthInput = scopeEl.querySelector("#wfm-i2i-ph-width");
    const heightInput = scopeEl.querySelector("#wfm-i2i-ph-height");
    const colorInput = scopeEl.querySelector("#wfm-i2i-ph-color");
    const dropZone = scopeEl.querySelector("#wfm-i2i-ph-drop");
    const fileInput = scopeEl.querySelector("#wfm-i2i-ph-file");
    const previewWrap = scopeEl.querySelector("#wfm-i2i-ph-preview-wrap");
    const previewImg = scopeEl.querySelector("#wfm-i2i-ph-preview-img");
    const statusEl = scopeEl.querySelector("#wfm-i2i-ph-status");
    if (!colorModeRadio) return; // no LoadImage slots rendered — panel doesn't exist

    const setMode = (mode) => {
        if (colorFields) colorFields.style.display = mode === "color" ? "" : "none";
        if (imageFields) imageFields.style.display = mode === "image" ? "" : "none";
        _saveI2IPlaceholderConfig({ ..._loadI2IPlaceholderConfig(), mode });
    };
    colorModeRadio.addEventListener("change", () => { if (colorModeRadio.checked) setMode("color"); });
    imageModeRadio?.addEventListener("change", () => { if (imageModeRadio.checked) setMode("image"); });

    widthInput?.addEventListener("change", () => {
        const width = Math.max(1, parseInt(widthInput.value, 10) || 512);
        widthInput.value = width;
        _saveI2IPlaceholderConfig({ ..._loadI2IPlaceholderConfig(), width });
    });
    heightInput?.addEventListener("change", () => {
        const height = Math.max(1, parseInt(heightInput.value, 10) || 512);
        heightInput.value = height;
        _saveI2IPlaceholderConfig({ ..._loadI2IPlaceholderConfig(), height });
    });
    colorInput?.addEventListener("change", () => {
        _saveI2IPlaceholderConfig({ ..._loadI2IPlaceholderConfig(), color: colorInput.value });
    });

    // Default image: uploaded to ComfyUI immediately (its filename is what actually gets
    // reused later, not the raw file) so every slot's Placeholder button can apply it
    // without re-uploading.
    const applyDefaultImageFile = async (file) => {
        if (!file || !file.type.startsWith("image/")) return;
        if (statusEl) statusEl.textContent = t("i2iPlaceholderUploading");
        try {
            const result = await comfyUI.uploadImage(file, file.name);
            if (!result.name) throw new Error("Upload returned no filename");
            _saveI2IPlaceholderConfig({ ..._loadI2IPlaceholderConfig(), imageFilename: result.name });
            if (previewImg) previewImg.src = `/view?filename=${encodeURIComponent(result.name)}&type=input`;
            if (previewWrap) previewWrap.style.display = "";
            if (statusEl) { statusEl.textContent = `✓ ${result.name}`; statusEl.style.color = "var(--wfm-success)"; }
        } catch (err) {
            if (statusEl) { statusEl.textContent = `✗ ${err.message}`; statusEl.style.color = "var(--wfm-danger)"; }
        }
    };
    fileInput?.addEventListener("change", () => {
        if (fileInput.files.length > 0) applyDefaultImageFile(fileInput.files[0]);
    });
    if (dropZone) {
        dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
        dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropZone.classList.remove("drag-over");
            if (e.dataTransfer.files.length > 0) applyDefaultImageFile(e.dataTransfer.files[0]);
        });
    }
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
        comfyUI.currentWorkflow[nodeId].inputs.lora_name = comfyEditor.resolveLoraName(loraPath);
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

// ── Inpaint: 画像+マスクのRGBA合成 ──────────────────────
// mask は白=インペイント対象領域/黒=維持領域のグレースケール画像を想定（Image Editの
// マスクレイヤーも、手動でドロップする白黒マスクファイルも同じ規約）。
// ComfyUIネイティブのLoadImageはアルファチャンネルから mask = 1 - alpha を抽出するため、
// 合成後の alpha は 255 - maskGray とする。
async function _loadImageElement(src) {
    // `instanceof Blob` は別レルム（他ウィンドウ/iframe）で生成されたBlob/Fileでは
    // falseになる（コンストラクタの参照が異なるため）。Comic CreaterからiframeへBlobを
    // 直接渡すInpaint連携で発生するため、実体で判定する（文字列URLかどうかだけを見る）。
    const isBlobLike = typeof src !== "string";
    const url = isBlobLike ? URL.createObjectURL(src) : src;
    try {
        const img = new Image();
        img.src = url;
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error("Failed to load image"));
        });
        return img;
    } finally {
        if (isBlobLike) URL.revokeObjectURL(url);
    }
}

async function _compositeImageWithMask(imageInput, maskInput) {
    const img  = await _loadImageElement(imageInput);
    const mask = await _loadImageElement(maskInput);

    const w = img.naturalWidth, h = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = w; maskCanvas.height = h;
    const mctx = maskCanvas.getContext("2d");
    mctx.drawImage(mask, 0, 0, w, h);
    const maskData = mctx.getImageData(0, 0, w, h).data;

    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        data[i + 3] = 255 - maskData[i];
    }
    ctx.putImageData(imgData, 0, 0);

    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// ── Inpaint: Mask Editor One (comfyui-mask-editor-one) ノード向けヘルパー ──────
// この custom node は LoadImage を介さず、画像は /mask_editor/store_image でサーバー側
// キャッシュ(bg_image_b64, node_idキー)へ、マスクは layer_data(JSON文字列)ウィジェットの
// 各レイヤーの「アルファチャンネル」から合成される（LoadImageの 1-alpha とは逆で、
// alpha値がそのままmask値になる規約）。
async function _imageInputToDataURL(imageInput) {
    const img = await _loadImageElement(imageInput);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
}

async function _maskInputToAlphaDataURL(maskInput) {
    const img = await _loadImageElement(maskInput);
    const w = img.naturalWidth, h = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);

    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        const gray = data[i];
        data[i] = data[i + 1] = data[i + 2] = 255;
        data[i + 3] = gray;
    }
    ctx.putImageData(imgData, 0, 0);

    return canvas.toDataURL("image/png");
}

// ── プロンプト強調weight編集 (Ctrl+↑/↓) ──────────────────────
// A1111 / ComfyUIネイティブのCLIP Text Encodeと同様の操作感:
// 選択（無ければカーソル位置の括弧ブロックまたは単語）を (text:weight) 形式に変換し、
// weightを0.05刻みで増減する。weightが1.0に戻ったら括弧を除去する。
const _PROMPT_WEIGHT_DELIMITERS = new Set([",", "\n", "\r", "\t", " ", "(", ")", ":"]);

function _selectSurroundingParenBlock(text, pos) {
    const openIdx = text.lastIndexOf("(", pos - 1);
    if (openIdx === -1) return null;
    const closeBefore = text.lastIndexOf(")", pos - 1);
    if (closeBefore > openIdx) return null; // カーソルは既に閉じたブロックの外
    const closeIdx = text.indexOf(")", pos);
    if (closeIdx === -1) return null;
    return { start: openIdx, end: closeIdx + 1 };
}

function _selectSurroundingWord(text, pos) {
    let start = pos, end = pos;
    while (start > 0 && !_PROMPT_WEIGHT_DELIMITERS.has(text[start - 1])) start--;
    while (end < text.length && !_PROMPT_WEIGHT_DELIMITERS.has(text[end])) end++;
    return { start, end };
}

function _attachPromptWeightControl(textarea) {
    textarea.addEventListener("keydown", (e) => {
        if (!e.ctrlKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        e.preventDefault();

        const delta = e.key === "ArrowUp" ? 0.05 : -0.05;
        const text = textarea.value;
        let start = textarea.selectionStart;
        let end = textarea.selectionEnd;

        if (start === end) {
            const range = _selectSurroundingParenBlock(text, start) || _selectSurroundingWord(text, start);
            start = range.start;
            end = range.end;
        }
        if (start === end) return;

        const selected = text.substring(start, end);
        const m = selected.match(/^\((.*):(-?[\d.]+)\)$/s);
        const inner = m ? m[1] : selected;
        let weight = (m ? parseFloat(m[2]) : 1.0) + delta;
        weight = Math.round(weight * 100) / 100;

        const replacement = weight === 1.0 ? inner : `(${inner}:${weight.toFixed(2)})`;
        textarea.value = text.substring(0, start) + replacement + text.substring(end);
        textarea.setSelectionRange(start, start + replacement.length);
    });
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

    // ComfyUI(Windows)は"\"区切りでLoraのenumを返すため、内部の"/"区切り表記と突き合わせて実際の表記に変換する
    resolveLoraName(name) {
        const normalized = name.replace(/\\/g, "/");
        const found = this.models.loras.find((n) => n.replace(/\\/g, "/") === normalized);
        return found || name;
    },

    renderAll(analysis, workflow, opts = {}) {
        this.renderPromptTab(analysis, "wfm-gen-prompt-fields");
        this.renderImageTab(analysis, "wfm-gen-image-fields");
        this.renderModelTab(analysis, "wfm-gen-model-fields");
        this.renderLoraPane(analysis, "wfm-gen-lora-fields", opts); // async, fires independently
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
                    <select id="wfm-prompt-pos-target" class="wfm-select" style="width:auto;flex:1;min-width:0;">
                        ${positiveNodes.map((n, i) => `<option value="${n.id}" data-text-key="${n.textKey || "text"}" ${i === 0 ? "selected" : ""}>ID:${n.id} (${n.title})</option>`).join("")}
                        ${nodeOpts}
                    </select>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-prompt-pos-revert" title="${t("revertPromptTitle")}">↺</button>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-prompt-pos-apply" title="Apply (Alt+Click: Apply &amp; Generate)">Apply</button>
                </div>
                <textarea class="wfm-textarea" id="wfm-prompt-pos-text" rows="6">${positiveNodes[0]?.text || ""}</textarea>
            </div>
            <div class="wfm-form-group">
                <label>Negative Prompt</label>
                <div style="display:flex;gap:8px;margin-bottom:6px;">
                    <select id="wfm-prompt-neg-target" class="wfm-select" style="width:auto;flex:1;min-width:0;">
                        ${negativeNodes.map((n, i) => `<option value="${n.id}" data-text-key="${n.textKey || "text"}" ${i === 0 ? "selected" : ""}>ID:${n.id} (${n.title})</option>`).join("")}
                        ${nodeOpts}
                    </select>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-prompt-neg-revert" title="${t("revertPromptTitle")}">↺</button>
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

        document.getElementById("wfm-prompt-pos-apply")?.addEventListener("click", (e) => {
            const nodeId = document.getElementById("wfm-prompt-pos-target")?.value;
            const text = document.getElementById("wfm-prompt-pos-text")?.value;
            if (nodeId && comfyUI.currentWorkflow?.[nodeId]) {
                const promptNode = (analysis.prompt_nodes || []).find(n => n.id === nodeId);
                const textKey = promptNode?.textKey || "text";
                comfyUI.currentWorkflow[nodeId].inputs[textKey] = text;
                _syncRawJson();
                if (e.altKey) document.dispatchEvent(new CustomEvent("wfm:apply-and-generate"));
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

        // Revert: テキストエリアを直前にApplyされたノードの現在値へ戻す
        document.getElementById("wfm-prompt-pos-revert")?.addEventListener("click", () => {
            const nodeId = document.getElementById("wfm-prompt-pos-target")?.value;
            const wfNode = comfyUI.currentWorkflow?.[nodeId];
            const ta = document.getElementById("wfm-prompt-pos-text");
            if (!nodeId || !wfNode || !ta) return;
            const promptNode = (analysis.prompt_nodes || []).find(n => n.id === nodeId);
            const textKey = promptNode?.textKey || "text";
            ta.value = wfNode.inputs[textKey] ?? "";
        });

        document.getElementById("wfm-prompt-neg-revert")?.addEventListener("click", () => {
            const nodeId = document.getElementById("wfm-prompt-neg-target")?.value;
            const wfNode = comfyUI.currentWorkflow?.[nodeId];
            const ta = document.getElementById("wfm-prompt-neg-text");
            if (!nodeId || !wfNode || !ta) return;
            const promptNode = (analysis.prompt_nodes || []).find(n => n.id === nodeId);
            const textKey = promptNode?.textKey || "text";
            ta.value = wfNode.inputs[textKey] ?? "";
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
            _attachPromptWeightControl(ta);
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
                const isMissing = !!currentVal && !models.includes(currentVal);
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
                    <div class="wfm-search-wrap" style="margin-bottom:4px;width:100%;">
                        <input type="text" class="wfm-input wfm-search-input wfm-model-filter" id="wfm-model-${s.key}-filter" placeholder="Filter..." data-target="wfm-model-${s.key}">
                        <button type="button" class="wfm-search-clear-btn" id="wfm-model-${s.key}-filter-clear" title="Clear search">✕</button>
                    </div>
                    <select class="wfm-select ${isMissing ? "wfm-select-missing" : ""}" id="wfm-model-${s.key}" style="margin-bottom:4px;">
                        ${isMissing ? `<option value="${escapeHtml(currentVal)}" selected>⚠ ${escapeHtml(currentVal)} (${t("modelNotFound")})</option>` : ""}
                        ${models.map((m) => `<option value="${m}" ${m === currentVal ? "selected" : ""}>${m}</option>`).join("")}
                    </select>
                    ${isMissing ? `<div class="wfm-model-missing-hint">${t("modelNotFoundHint")}</div>` : ""}
                    ${extrasHtml}
                    <div style="display:flex;gap:8px;align-items:center;margin-top:4px;">
                        <select class="wfm-select" id="wfm-model-${s.key}-target" style="flex:1;">${targetOpts}</select>
                        <button class="wfm-btn wfm-btn-sm wfm-model-apply" data-key="${s.key}" data-input="${s.inputKey}" title="Apply (Alt+Click: Apply &amp; Generate)">Apply</button>
                    </div>
                </div>
            `;
            })
            .join("") + '<div class="wfm-form-group" id="wfm-te-section" style="border-bottom:1px solid var(--wfm-border);padding-bottom:12px;"><label>Text Encoder</label></div>';

        // Filter inputs
        el.querySelectorAll(".wfm-model-filter").forEach((input) => {
            const targetId = input.dataset.target;
            const rebuild = () => {
                const select = document.getElementById(targetId);
                if (!select) return;
                const filter = input.value.toLowerCase();
                const key = targetId.replace("wfm-model-", "");
                const models = this.models[key] || [];
                select.innerHTML = models
                    .filter((m) => m.toLowerCase().includes(filter))
                    .map((m) => `<option value="${m}">${m}</option>`)
                    .join("");
            };
            input.addEventListener("input", rebuild);
            setupSearchClearBtn(input.id, `${input.id}-clear`, rebuild);
        });

        // Apply buttons
        el.querySelectorAll(".wfm-model-apply").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const key = btn.dataset.key;
                let inputKey = btn.dataset.input;
                const select = document.getElementById(`wfm-model-${key}`);
                const targetSelect = document.getElementById(`wfm-model-${key}-target`);
                if (!select || !targetSelect) return;
                const value = select.value;
                const nodeId = targetSelect.value;
                if (nodeId && comfyUI.currentWorkflow?.[nodeId]) {
                    // LoaderGGUF ノードは gguf_name キーを使う
                    const ct = comfyUI.currentWorkflow[nodeId].class_type;
                    if (key === "diffusionModels" && (ct === "LoaderGGUF" || ct === "LoaderGGUFAdvanced")) {
                        inputKey = "gguf_name";
                    }
                    comfyUI.currentWorkflow[nodeId].inputs[inputKey] = value;
                    // Apply extras (e.g. strength for Hypernetwork)
                    el.querySelectorAll(`.wfm-model-extra[data-key="${key}"]`).forEach((ex) => {
                        const exInputKey = ex.dataset.inputKey;
                        const exVal = parseFloat(ex.value);
                        if (!isNaN(exVal)) comfyUI.currentWorkflow[nodeId].inputs[exInputKey] = exVal;
                    });
                    _syncRawJson();
                    if (e.altKey) document.dispatchEvent(new CustomEvent("wfm:apply-and-generate"));
                }
            });
        });

        // Text Encoder セクションの非同期初期化
        _initTextEncoderSection(analysis, this.models.textEncoders || [], el).catch(() => {});
    },

    async renderLoraPane(analysis, containerId, opts = {}) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const loraNodes = analysis.lora_nodes || [];
        const loras = this.models.loras || [];
        const defaultStackTarget = (loraNodes.find((n) => n.is_lora_manager) || loraNodes[0])?.id;
        const hasLoraManager = loraNodes.some((n) => n.is_lora_manager);
        // Use Stack Group チェックボックスの現在状態を先読み(Stack表示の取得元判定に使う)。
        // resetStackMode(新規読み込み)時は常にOFF扱い。
        const stackModeChecked = hasLoraManager && !opts.resetStackMode && (el.querySelector("#wfm-lora-stack-mode-toggle")?.checked ?? false);

        // ワークフロー新規読み込み時のみ: LoraManagerノードのloras/text状態をスナップショットし、
        // Stackグループ使用チェックボックスをOFFへリセットする(既存のGenUI状態への影響を避けるため
        // タブ切替やStack再読込などの単なる再描画では行わない)。
        if (opts.resetStackMode) {
            comfyUI.loraManagerSnapshots = {};
            for (const n of loraNodes) {
                if (!n.is_lora_manager) continue;
                const wfNode = comfyUI.currentWorkflow?.[n.id];
                if (!wfNode?.inputs) continue;
                comfyUI.loraManagerSnapshots[n.id] = {
                    loras: Array.isArray(wfNode.inputs.loras?.__value__) ? JSON.parse(JSON.stringify(wfNode.inputs.loras.__value__)) : [],
                    text: wfNode.inputs.text ?? "",
                };
            }
        }
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

        // Stack表示の取得元: ON(Use Stack Group)ならModelsタブの登録済みStackグループ、
        // OFF(既定)ならLoraManagerノードに実際に設定されているLoRAをそのまま表示する。
        let stackModels = [];
        let metadata = {};
        let civitaiCache = {};
        const useWorkflowLoraState = hasLoraManager && !stackModeChecked;
        try {
            const [metaRes, civRes] = await Promise.all([
                fetch("/api/wfm/models/metadata"),
                fetch("/api/wfm/models/civitai/cache"),
            ]);
            metadata = metaRes.ok ? await metaRes.json() : {};
            civitaiCache = civRes.ok ? await civRes.json() : {};
        } catch { /* ignore */ }

        if (stackModeChecked) {
            try {
                const grpRes = await fetch("/api/wfm/models/groups?type=lora");
                const groups = grpRes.ok ? await grpRes.json() : {};
                stackModels = groups["Stack"] || [];
            } catch { /* ignore */ }
            stackModels.forEach((m) => {
                if (!_stackStrengths[m]) _stackStrengths[m] = { m: 1.0, c: 1.0 };
                if (_stackActive[m] === undefined) _stackActive[m] = true;
            });
        } else if (useWorkflowLoraState) {
            const wfNode = comfyUI.currentWorkflow?.[defaultStackTarget];
            const wfLoras = wfNode?.inputs?.loras?.__value__;
            // resetStackMode(新規読み込み)/syncFromWorkflow(チェックボックスOFF切替直後)の時だけ
            // ワークフローの実データで強制上書きする。タブ切替等の単なる再描画では、
            // 既にメモリ上に値があればそれを維持し、Stackパネルでの一時的なON/OFF・強度編集を
            // 再描画のたびに消してしまわないようにする。
            const shouldSync = opts.resetStackMode || opts.syncFromWorkflow;
            if (Array.isArray(wfLoras)) {
                stackModels = wfLoras.map((l) => {
                    const found = (this.models.loras || []).find((m) => _loraBasename(m) === l.name);
                    const full = found || l.name;
                    if (shouldSync || _stackStrengths[full] === undefined) {
                        _stackStrengths[full] = { m: parseFloat(l.strength) || 1.0, c: parseFloat(l.clipStrength ?? l.strength) || 1.0 };
                    }
                    if (shouldSync || _stackActive[full] === undefined) {
                        _stackActive[full] = l.active !== false;
                    }
                    return full;
                });
            }
        }

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
        // stackModelsが空だと every() が空配列に対し true を返す(空虚な真)ため、
        // 何も無いのに「トグルオール」チェックボックスがON表示になるのを防ぐ
        const allActive = stackModels.length > 0 && stackModels.every((m) => _stackActive[m] !== false);
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

        let _prevActiveTab = el.querySelector(".wfm-lora-tab-btn.active")?.dataset?.tab || "single";
        // 新規読み込み時、LoraManagerノードに実際に複数LoRAが設定されている場合は
        // Single(1件しか表示できない)ではなくStackタブを初期表示にする
        if (opts.resetStackMode && useWorkflowLoraState && stackModels.length > 1) _prevActiveTab = "stack";
        // applyToGenUIで設定したSingle表示の状態を保存（再描画後に復元）
        const _prevSingleSyntax = document.getElementById("wfm-lora-single-syntax")?.textContent || "";
        const _prevSingleTriggers = document.getElementById("wfm-lora-single-triggers")?.innerHTML || "";

        el.innerHTML = `
            <div class="wfm-lora-tab-header">
                <button class="wfm-lora-tab-btn active" data-tab="single">Single</button>
                <button class="wfm-lora-tab-btn" data-tab="stack">Stack</button>
                ${hasLoraManager ? `
                <label class="wfm-lora-stack-mode-label" style="margin-left:auto;display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap;" title="ON: 登録済みStackグループを読み込む / OFF: ワークフローに実際に設定されているLoRAを表示・編集する">
                    <input type="checkbox" id="wfm-lora-stack-mode-toggle" ${stackModeChecked ? "checked" : ""}>
                    Use Stack Group
                </label>` : ""}
            </div>

            <!-- Single tab -->
            <div class="wfm-lora-tab-content" id="wfm-lora-panel-single">
                <div class="wfm-search-wrap" style="width:100%;">
                    <input type="text" class="wfm-input wfm-search-input" id="wfm-lora-filter" placeholder="Filter...">
                    <button type="button" class="wfm-search-clear-btn" id="wfm-lora-filter-clear" title="Clear search">✕</button>
                </div>
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
                ${hasLoraManager ? `<div style="font-size:11px;color:var(--wfm-text-secondary);margin-bottom:6px;">${useWorkflowLoraState ? "Showing: LoRAs currently in workflow" : "Showing: registered Stack group"}</div>` : ""}
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
                    ${stackModelRows || `<p class="wfm-placeholder">${useWorkflowLoraState ? "No LoRAs set on this node" : "No models in Stack group"}</p>`}
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

        // ── Stackグループ使用チェックボックス ─────────────────
        // ON: LoraManagerノードへStackグループを（クリアしてから）読み込む(既存のStack Applyを流用)
        // OFF: ワークフロー読み込み時点のloras/text状態へ（クリアしてから）戻す
        document.getElementById("wfm-lora-stack-mode-toggle")?.addEventListener("change", async (e) => {
            const nodeId = document.getElementById("wfm-lora-stack-target")?.value || defaultStackTarget;
            if (!nodeId || !comfyUI.currentWorkflow?.[nodeId]) return;

            if (e.target.checked) {
                // stackModelsはこの時点では「ワークフロー state」を指したままのため、
                // 先に再描画してStackグループを取得させてからApplyする
                await this.renderLoraPane(analysis, containerId);
                document.getElementById("wfm-lora-stack-apply")?.click();
                return;
            }

            const snap = comfyUI.loraManagerSnapshots?.[nodeId] || { loras: [], text: "" };
            comfyUI.currentWorkflow[nodeId].inputs.loras = { __value__: JSON.parse(JSON.stringify(snap.loras)) };
            comfyUI.currentWorkflow[nodeId].inputs.text = snap.text;
            _syncRawJson();

            // ON時にPositiveプロンプトへ挿入されたStack由来の<lora:...>構文とトリガーワードを除去する
            // (新規に追加はしない。ワークフロー本来のプロンプトへ戻すだけ)
            const posTextarea = document.getElementById("wfm-prompt-pos-text");
            if (posTextarea && stackModels.length > 0) {
                let cleaned = posTextarea.value;
                for (const m of stackModels) {
                    const stem = _loraBasename(m).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    cleaned = cleaned.replace(new RegExp(`,?\\s*<lora:${stem}:[^>]*>`, "gi"), "");
                }
                const stackWords = new Set();
                stackModels.forEach((m) => {
                    const sha = (metadata[m] || {}).sha256;
                    const civInfo = sha && civitaiCache[sha];
                    civInfo?.trainedWords?.forEach((w) => stackWords.add(w.trim().toLowerCase()));
                });
                if (stackWords.size > 0) {
                    cleaned = cleaned.split(",").map((p) => p.trim()).filter((p) => p && !stackWords.has(p.toLowerCase())).join(", ");
                }
                posTextarea.value = cleaned.replace(/,\s*$/, "").trim();

                const posNodeId = document.getElementById("wfm-prompt-pos-target")?.value;
                if (posNodeId && comfyUI.currentWorkflow?.[posNodeId]) {
                    const promptNode = comfyUI.currentAnalysis?.prompt_nodes?.find((n) => String(n.id) === String(posNodeId));
                    comfyUI.currentWorkflow[posNodeId].inputs[promptNode?.textKey || "text"] = posTextarea.value;
                    _syncRawJson();
                }
            }

            // syncFromWorkflow: OFFへ戻した直後は、たった今書き戻したloras/text状態と
            // Stackパネルの強度/有効状態表示を一致させるため強制同期する
            this.renderLoraPane(analysis, containerId, { syncFromWorkflow: true });
        });

        // ── Single: filter ───────────────────────────────────
        const loraFilterInput = document.getElementById("wfm-lora-filter");
        const rebuildLoraSingleList = () => {
            const filter = loraFilterInput?.value.toLowerCase() || "";
            const select = document.getElementById("wfm-lora-select");
            if (!select) return;
            select.innerHTML = loras
                .filter((m) => m.toLowerCase().includes(filter))
                .map((m) => `<option value="${m}">${m}</option>`)
                .join("");
            _refreshLoraSingleDynamic(metadata, civitaiCache);
        };
        loraFilterInput?.addEventListener("input", rebuildLoraSingleList);
        setupSearchClearBtn("wfm-lora-filter", "wfm-lora-filter-clear", rebuildLoraSingleList);

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
                    comfyUI.currentWorkflow[nodeId].inputs.lora_name = comfyEditor.resolveLoraName(first);
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

        // "Advanced Sampling" workflows (Flux.1/Flux.2, SD3.5, Chroma...) spread seed/steps/cfg/
        // sampler/scheduler/denoise across RandomNoise + CFGGuider + KSamplerSelect + a *Scheduler
        // node instead of one KSampler. sampler.*NodeId (set in analyzeWorkflow) says which real
        // node each field writes back to; null/"" means that workflow has no such control at all
        // (e.g. Flux2Scheduler has no named "scheduler" combo) so the field is disabled here.
        const schedulerAvailable = !!sampler && sampler.schedulerNodeId != null;
        const denoiseAvailable = !!sampler && sampler.denoiseNodeId != null;

        el.innerHTML = `
            <div style="display:flex;flex-direction:row;gap:0;align-items:flex-start;">
                <div style="flex:1;min-width:0;padding-right:14px;border-right:1px solid var(--wfm-border);">
                    <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--wfm-text-secondary);margin:0 0 12px;">${sampler?.advanced ? "Sampler (Advanced)" : "KSampler"}</h3>
                    ${sampler ? `
                    <input type="hidden" id="wfm-settings-sampler-id"
                        data-seed-key="${sampler.seedKey || "seed"}"
                        data-seed-node-id="${sampler.seedNodeId ?? sampler.id}"
                        data-steps-node-id="${sampler.stepsNodeId ?? sampler.id}"
                        data-cfg-key="${sampler.cfgKey || "cfg"}"
                        data-cfg-node-id="${sampler.cfgNodeId ?? sampler.id}"
                        data-sampler-node-id="${sampler.samplerNodeId ?? sampler.id}"
                        data-scheduler-node-id="${sampler.schedulerNodeId ?? ""}"
                        data-denoise-node-id="${sampler.denoiseNodeId ?? ""}">
                    <div class="wfm-form-group">
                        <label>Seed</label>
                        <input type="number" class="wfm-input" id="wfm-settings-seed" value="${sampler.seed ?? ""}" placeholder="${sampler.seed === undefined ? "linked" : ""}">
                    </div>
                    <div class="wfm-form-group">
                        <label>Steps</label>
                        <input type="number" class="wfm-input" id="wfm-settings-steps" value="${sampler.steps ?? ""}" placeholder="${sampler.steps === undefined ? "linked" : ""}" min="1" max="200">
                    </div>
                    <div class="wfm-form-group">
                        <label>CFG</label>
                        <input type="number" class="wfm-input" id="wfm-settings-cfg" value="${sampler.cfg ?? ""}" placeholder="${sampler.cfg === undefined ? "linked" : ""}" step="0.5" min="0">
                    </div>
                    <div class="wfm-form-group">
                        <label>Sampler</label>
                        <select class="wfm-select" id="wfm-settings-sampler-name">
                            ${this.models.samplers.map((s) => `<option value="${s}" ${s === sampler.sampler_name ? "selected" : ""}>${s}</option>`).join("")}
                        </select>
                    </div>
                    <div class="wfm-form-group">
                        <label>Scheduler</label>
                        <select class="wfm-select" id="wfm-settings-scheduler" ${schedulerAvailable ? "" : "disabled"}>
                            ${schedulerAvailable
                                ? this.models.schedulers.map((s) => `<option value="${s}" ${s === sampler.scheduler ? "selected" : ""}>${s}</option>`).join("")
                                : `<option value="">N/A</option>`}
                        </select>
                    </div>
                    <div class="wfm-form-group">
                        <label>Denoise</label>
                        <input type="number" class="wfm-input" id="wfm-settings-denoise" value="${sampler.denoise ?? ""}" placeholder="${denoiseAvailable && sampler.denoise === undefined ? "linked" : ""}" step="0.05" min="0" max="1" ${denoiseAvailable ? "" : "disabled"}>
                    </div>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-settings-sampler-apply" title="Apply (Alt+Click: Apply &amp; Generate)">Apply</button>
                    ` : "<p class='wfm-placeholder'>No KSampler node found</p>"}
                </div>
                <div style="flex:1;min-width:0;padding-left:14px;">
                    <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--wfm-text-secondary);margin:0 0 12px;">Latent Image</h3>
                    ${latent ? `
                    <input type="hidden" id="wfm-settings-latent-id" value="${latent.id}">
                    <div class="wfm-form-group">
                        <label>Width</label>
                        <input type="number" class="wfm-input" id="wfm-settings-width" value="${latent.width ?? ""}" placeholder="${latent.width === undefined ? "linked" : ""}" step="8" min="64">
                    </div>
                    <div class="wfm-form-group">
                        <label>Height</label>
                        <input type="number" class="wfm-input" id="wfm-settings-height" value="${latent.height ?? ""}" placeholder="${latent.height === undefined ? "linked" : ""}" step="8" min="64">
                    </div>
                    <div class="wfm-form-group">
                        <label>Batch Size</label>
                        <input type="number" class="wfm-input" id="wfm-settings-batch" value="${latent.batch_size ?? 1}" min="1" max="64">
                    </div>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-settings-latent-apply">Apply</button>
                    ${latent.width === undefined || latent.height === undefined ? `<p class="wfm-placeholder" style="margin-top:6px;">Width/Height is linked to another node (e.g. auto-follows the input image) — leave blank to keep it linked.</p>` : ""}
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

        document.getElementById("wfm-settings-sampler-apply")?.addEventListener("click", (e) => {
            const ds = document.getElementById("wfm-settings-sampler-id")?.dataset || {};
            const write = (nodeId, key, value) => {
                if (!nodeId || !comfyUI.currentWorkflow?.[nodeId]) return;
                comfyUI.currentWorkflow[nodeId].inputs[key] = value;
            };
            const seedEl = document.getElementById("wfm-settings-seed");
            if (seedEl?.value !== "") write(ds.seedNodeId, ds.seedKey || "seed", parseInt(seedEl.value) || -1);
            const stepsEl = document.getElementById("wfm-settings-steps");
            if (stepsEl?.value !== "") write(ds.stepsNodeId, "steps", parseInt(stepsEl.value) || 20);
            const cfgEl = document.getElementById("wfm-settings-cfg");
            if (cfgEl?.value !== "") write(ds.cfgNodeId, ds.cfgKey || "cfg", parseFloat(cfgEl.value) || 7);
            write(ds.samplerNodeId, "sampler_name", document.getElementById("wfm-settings-sampler-name")?.value);
            if (ds.schedulerNodeId) write(ds.schedulerNodeId, "scheduler", document.getElementById("wfm-settings-scheduler")?.value);
            const denoiseEl = document.getElementById("wfm-settings-denoise");
            if (ds.denoiseNodeId && denoiseEl?.value !== "") write(ds.denoiseNodeId, "denoise", parseFloat(denoiseEl.value) || 1.0);
            _syncRawJson();
            if (e.altKey) document.dispatchEvent(new CustomEvent("wfm:apply-and-generate"));
        });

        document.getElementById("wfm-settings-latent-apply")?.addEventListener("click", () => {
            const nodeId = document.getElementById("wfm-settings-latent-id")?.value;
            if (!nodeId || !comfyUI.currentWorkflow?.[nodeId]) return;
            const inputs = comfyUI.currentWorkflow[nodeId].inputs;
            const wEl = document.getElementById("wfm-settings-width");
            const hEl = document.getElementById("wfm-settings-height");
            // Blank = leave the (linked) width/height alone instead of clobbering it with a default
            if (wEl?.value !== "") inputs.width = parseInt(wEl.value) || 512;
            if (hEl?.value !== "") inputs.height = parseInt(hEl.value) || 512;
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
        const meoNodes  = analysis.mask_editor_one_nodes || [];
        if (loadNodes.length === 0 && meoNodes.length === 0) {
            el.innerHTML = `<p class="wfm-placeholder">No LoadImage / Mask Editor One nodes found in workflow</p>`;
            return;
        }

        // Render up to 4 image input slots
        const slots = loadNodes.slice(0, 4);
        // Mask Editor One ノード（画像+マスクを内包、常に両方必須）— 別枠で最大2件表示
        const meoSlots = meoNodes.slice(0, 2);
        const phCfg = _loadI2IPlaceholderConfig();
        const isColorMode = phCfg.mode !== "image";
        el.innerHTML = `
            ${slots.length === 0 ? "" : `
            <details class="wfm-settings-section wfm-i2i-placeholder-config">
                <summary class="wfm-settings-summary">${t("i2iPlaceholderTitle")}</summary>
                <div class="wfm-i2i-placeholder-mode">
                    <label><input type="radio" name="wfm-i2i-ph-mode" id="wfm-i2i-ph-mode-color" value="color" ${isColorMode ? "checked" : ""}> ${t("i2iPlaceholderColor")}</label>
                    <label><input type="radio" name="wfm-i2i-ph-mode" id="wfm-i2i-ph-mode-image" value="image" ${isColorMode ? "" : "checked"}> ${t("i2iPlaceholderImage")}</label>
                </div>
                <div id="wfm-i2i-ph-color-fields" class="wfm-i2i-placeholder-fields wfm-lab-modal-inline" style="${isColorMode ? "" : "display:none;"}">
                    <div><label>${t("i2iPlaceholderWidth")}</label><input type="number" min="1" id="wfm-i2i-ph-width" class="wfm-input" value="${Number(phCfg.width) || 512}"></div>
                    <div><label>${t("i2iPlaceholderHeight")}</label><input type="number" min="1" id="wfm-i2i-ph-height" class="wfm-input" value="${Number(phCfg.height) || 512}"></div>
                    <div><label>${t("i2iPlaceholderColorLabel")}</label><input type="color" id="wfm-i2i-ph-color" class="wfm-input" value="${escapeHtml(/^#[0-9a-fA-F]{6}$/.test(phCfg.color) ? phCfg.color : "#808080")}"></div>
                </div>
                <div id="wfm-i2i-ph-image-fields" class="wfm-i2i-placeholder-fields" style="${isColorMode ? "display:none;" : ""}">
                    <div class="wfm-i2i-preview-wrap" id="wfm-i2i-ph-preview-wrap" style="${phCfg.imageFilename ? "" : "display:none;"}">
                        <img class="wfm-i2i-preview-img" id="wfm-i2i-ph-preview-img" src="${phCfg.imageFilename ? `/view?filename=${encodeURIComponent(phCfg.imageFilename)}&type=input` : ""}">
                    </div>
                    <div class="wfm-i2i-drop-zone" id="wfm-i2i-ph-drop">
                        <label class="wfm-i2i-drop-label">
                            ${t("i2iPlaceholderDropImage")}
                            <input type="file" accept="image/*" id="wfm-i2i-ph-file" style="display:none;">
                        </label>
                    </div>
                    <span class="wfm-i2i-status" id="wfm-i2i-ph-status"></span>
                </div>
            </details>
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
                        ${node.mask_used ? `
                        <div class="wfm-i2i-mask-section">
                            <div class="wfm-i2i-mask-header">
                                <span>Mask</span>
                                <span class="wfm-i2i-mask-filename" id="wfm-i2i-mask-filename-${i}"></span>
                            </div>
                            <div class="wfm-i2i-preview-wrap wfm-i2i-mask-preview-wrap" id="wfm-i2i-mask-preview-wrap-${i}" style="display:none;">
                                <img class="wfm-i2i-preview-img" id="wfm-i2i-mask-preview-${i}">
                            </div>
                            <div class="wfm-i2i-drop-zone wfm-i2i-mask-drop-zone" id="wfm-i2i-mask-drop-${i}">
                                <label class="wfm-i2i-drop-label">
                                    Drop mask (white=inpaint) or click to select
                                    <input type="file" accept="image/*" class="wfm-i2i-file" id="wfm-i2i-mask-file-${i}" style="display:none;">
                                </label>
                            </div>
                        </div>
                        ` : ""}
                        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
                            <button class="wfm-btn wfm-btn-sm wfm-btn-primary wfm-i2i-apply" data-slot="${i}" disabled>Apply</button>
                            <button type="button" class="wfm-btn wfm-btn-sm wfm-i2i-placeholder-btn" data-slot="${i}">${t("i2iPlaceholderApply")}</button>
                            <button type="button" class="wfm-btn wfm-btn-sm wfm-i2i-clear" data-slot="${i}">${t("clear")}</button>
                            <span class="wfm-i2i-status" id="wfm-i2i-status-${i}"></span>
                        </div>
                    </div>
                `).join("")}
            </div>
            `}
            ${meoSlots.length === 0 ? "" : `
            <div class="wfm-i2i-grid" style="margin-top:12px;">
                ${meoSlots.map((node, i) => `
                    <div class="wfm-i2i-slot" data-meo-slot="${i}" data-node-id="${node.id}">
                        <div class="wfm-i2i-slot-header">
                            <span style="font-weight:600;font-size:12px;">ID:${node.id} ${node.title} (Mask Editor One)</span>
                        </div>
                        <div class="wfm-i2i-preview-wrap" id="wfm-meo-preview-wrap-${i}" style="display:none;">
                            <img class="wfm-i2i-preview-img" id="wfm-meo-preview-${i}">
                        </div>
                        <div class="wfm-i2i-drop-zone" id="wfm-meo-drop-${i}">
                            <label class="wfm-i2i-drop-label">
                                Drop image or click to select
                                <input type="file" accept="image/*" class="wfm-i2i-file" id="wfm-meo-file-${i}" style="display:none;">
                            </label>
                        </div>
                        <div class="wfm-i2i-mask-section">
                            <div class="wfm-i2i-mask-header">
                                <span>Mask</span>
                                <span class="wfm-i2i-mask-filename" id="wfm-meo-mask-filename-${i}"></span>
                            </div>
                            <div class="wfm-i2i-preview-wrap wfm-i2i-mask-preview-wrap" id="wfm-meo-mask-preview-wrap-${i}" style="display:none;">
                                <img class="wfm-i2i-preview-img" id="wfm-meo-mask-preview-${i}">
                            </div>
                            <div class="wfm-i2i-drop-zone wfm-i2i-mask-drop-zone" id="wfm-meo-mask-drop-${i}">
                                <label class="wfm-i2i-drop-label">
                                    Drop mask (white=inpaint) or click to select
                                    <input type="file" accept="image/*" class="wfm-i2i-file" id="wfm-meo-mask-file-${i}" style="display:none;">
                                </label>
                            </div>
                        </div>
                        <div style="display:flex;gap:6px;margin-top:6px;">
                            <button class="wfm-btn wfm-btn-sm wfm-btn-primary wfm-meo-apply" data-slot="${i}" disabled>Apply</button>
                            <span class="wfm-i2i-status" id="wfm-meo-status-${i}"></span>
                        </div>
                    </div>
                `).join("")}
            </div>
            `}
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
            const maskFileInput = document.getElementById(`wfm-i2i-mask-file-${i}`);
            const maskDropZone = document.getElementById(`wfm-i2i-mask-drop-${i}`);
            const maskPreviewWrap = document.getElementById(`wfm-i2i-mask-preview-wrap-${i}`);
            const maskPreviewImg = document.getElementById(`wfm-i2i-mask-preview-${i}`);
            const maskFilenameEl = document.getElementById(`wfm-i2i-mask-filename-${i}`);
            let pendingFile = null;
            let pendingMaskFile = null;

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

            const applyMaskFile = (file) => {
                if (!file || !file.type.startsWith("image/")) return;
                pendingMaskFile = file;
                const url = URL.createObjectURL(file);
                maskPreviewImg.src = url;
                maskPreviewWrap.style.display = "";
                maskFilenameEl.textContent = file.name;
                applyBtn.disabled = false;
                statusEl.textContent = "";
            };

            // File input change
            fileInput?.addEventListener("change", () => {
                if (fileInput.files.length > 0) applyFile(fileInput.files[0]);
            });
            maskFileInput?.addEventListener("change", () => {
                if (maskFileInput.files.length > 0) applyMaskFile(maskFileInput.files[0]);
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
            if (maskDropZone) {
                maskDropZone.addEventListener("dragover", (e) => {
                    e.preventDefault();
                    maskDropZone.classList.add("drag-over");
                });
                maskDropZone.addEventListener("dragleave", () => {
                    maskDropZone.classList.remove("drag-over");
                });
                maskDropZone.addEventListener("drop", (e) => {
                    e.preventDefault();
                    maskDropZone.classList.remove("drag-over");
                    if (e.dataTransfer.files.length > 0) applyMaskFile(e.dataTransfer.files[0]);
                });
            }

            // Apply button: upload to ComfyUI and set on node
            // (マスクが指定されている場合は画像+マスクをRGBA合成して1枚のPNGとしてアップロードする)
            applyBtn?.addEventListener("click", async () => {
                if (!pendingFile && !pendingMaskFile) return;
                applyBtn.disabled = true;
                statusEl.textContent = "Uploading...";
                try {
                    let result;
                    if (pendingMaskFile) {
                        const baseImage = pendingFile || previewImg.src;
                        if (!baseImage) throw new Error("No base image to apply mask to");
                        const composedBlob = await _compositeImageWithMask(baseImage, pendingMaskFile);
                        const fileName = (pendingFile?.name || node.image || "inpaint.png").replace(/\.[^.]+$/, "") + "_masked.png";
                        const composedFile = new File([composedBlob], fileName, { type: "image/png" });
                        result = await comfyUI.uploadImage(composedFile, fileName);
                    } else {
                        result = await comfyUI.uploadImage(pendingFile, pendingFile.name);
                    }
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

            // Clear: reset this slot's staged/preview state back to empty. Doesn't touch
            // the workflow node itself — LoadImage always needs *some* valid filename, so
            // there's nothing meaningful to "unset" there; this just lets the user cancel
            // a pending pick and start over.
            const clearBtn = el.querySelector(`.wfm-i2i-clear[data-slot="${i}"]`);
            clearBtn?.addEventListener("click", () => {
                pendingFile = null;
                previewImg.src = "";
                previewWrap.style.display = "none";
                filenameEl.textContent = "";
                if (fileInput) fileInput.value = "";
                applyBtn.disabled = !pendingMaskFile;
                statusEl.textContent = "";
            });

            // Placeholder: generate (color mode) or reuse (image mode) the shared default
            // configured at the top of the panel, and replace this slot's image
            // immediately — no separate Apply click needed, matching the "one button,
            // one slot" behavior described for this feature.
            const placeholderBtn = el.querySelector(`.wfm-i2i-placeholder-btn[data-slot="${i}"]`);
            placeholderBtn?.addEventListener("click", async () => {
                const cfg = _loadI2IPlaceholderConfig();
                placeholderBtn.disabled = true;
                statusEl.textContent = t("i2iPlaceholderGenerating");
                try {
                    let filename;
                    if (cfg.mode === "image") {
                        if (!cfg.imageFilename) throw new Error(t("i2iPlaceholderNoDefaultImage"));
                        filename = cfg.imageFilename;
                    } else {
                        const file = await _generateColorImageFile(cfg.width, cfg.height, cfg.color);
                        const result = await comfyUI.uploadImage(file, file.name);
                        if (!result.name) throw new Error("Upload returned no filename");
                        filename = result.name;
                    }
                    if (comfyUI.currentWorkflow?.[node.id]) {
                        comfyUI.currentWorkflow[node.id].inputs.image = filename;
                    }
                    pendingFile = null;
                    previewImg.src = `/view?filename=${encodeURIComponent(filename)}&type=input`;
                    previewWrap.style.display = "";
                    filenameEl.textContent = filename;
                    applyBtn.disabled = !pendingMaskFile;
                    statusEl.textContent = `✓ ${filename}`;
                    statusEl.style.color = "var(--wfm-success)";
                    _syncRawJson();
                } catch (err) {
                    statusEl.textContent = `✗ ${err.message}`;
                    statusEl.style.color = "var(--wfm-danger)";
                } finally {
                    placeholderBtn.disabled = false;
                }
            });
        });

        _wireI2IPlaceholderConfig(el);

        // Initialize each Mask Editor One slot（画像+マスク両方が揃って初めてApply可能）
        meoSlots.forEach((node, i) => {
            const fileInput = document.getElementById(`wfm-meo-file-${i}`);
            const maskFileInput = document.getElementById(`wfm-meo-mask-file-${i}`);
            const dropZone = document.getElementById(`wfm-meo-drop-${i}`);
            const maskDropZone = document.getElementById(`wfm-meo-mask-drop-${i}`);
            const previewWrap = document.getElementById(`wfm-meo-preview-wrap-${i}`);
            const previewImg = document.getElementById(`wfm-meo-preview-${i}`);
            const maskPreviewWrap = document.getElementById(`wfm-meo-mask-preview-wrap-${i}`);
            const maskPreviewImg = document.getElementById(`wfm-meo-mask-preview-${i}`);
            const maskFilenameEl = document.getElementById(`wfm-meo-mask-filename-${i}`);
            const applyBtn = el.querySelector(`.wfm-meo-apply[data-slot="${i}"]`);
            const statusEl = document.getElementById(`wfm-meo-status-${i}`);
            let pendingFile = null;
            let pendingMaskFile = null;

            const updateApplyEnabled = () => { applyBtn.disabled = !(pendingFile && pendingMaskFile); };

            const applyFile = (file) => {
                if (!file || !file.type.startsWith("image/")) return;
                pendingFile = file;
                previewImg.src = URL.createObjectURL(file);
                previewWrap.style.display = "";
                statusEl.textContent = "";
                updateApplyEnabled();
            };
            const applyMaskFile = (file) => {
                if (!file || !file.type.startsWith("image/")) return;
                pendingMaskFile = file;
                maskPreviewImg.src = URL.createObjectURL(file);
                maskPreviewWrap.style.display = "";
                maskFilenameEl.textContent = file.name;
                statusEl.textContent = "";
                updateApplyEnabled();
            };

            fileInput?.addEventListener("change", () => {
                if (fileInput.files.length > 0) applyFile(fileInput.files[0]);
            });
            maskFileInput?.addEventListener("change", () => {
                if (maskFileInput.files.length > 0) applyMaskFile(maskFileInput.files[0]);
            });

            [[dropZone, applyFile], [maskDropZone, applyMaskFile]].forEach(([zone, handler]) => {
                if (!zone) return;
                zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
                zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
                zone.addEventListener("drop", (e) => {
                    e.preventDefault();
                    zone.classList.remove("drag-over");
                    if (e.dataTransfer.files.length > 0) handler(e.dataTransfer.files[0]);
                });
            });

            applyBtn?.addEventListener("click", async () => {
                if (!pendingFile || !pendingMaskFile) return;
                applyBtn.disabled = true;
                statusEl.textContent = "Uploading...";
                try {
                    await this.applyImageAndMaskToMaskEditorOneNode(pendingFile, pendingMaskFile, node.id);
                    statusEl.textContent = "✓ Applied";
                    statusEl.style.color = "var(--wfm-success)";
                } catch (err) {
                    statusEl.textContent = `✗ ${err.message}`;
                    statusEl.style.color = "var(--wfm-danger)";
                    applyBtn.disabled = false;
                }
            });
        });
    },

    // opts.workflow/opts.analysis を渡すと comfyUI.currentWorkflow/currentAnalysis の代わりに
    // そちらへ書き込み、DOM更新は行わずアップロード後のファイル名だけを返す
    // （GenerateUIタブの表示状態には触れない。Chatペインの画像添付I2I連携から利用）。
    async applyImageToSlot(file, slotIndex = 0, opts = {}) {
        const workflow = opts.workflow || comfyUI.currentWorkflow;
        const analysis = opts.analysis || comfyUI.currentAnalysis;
        const loadNodes = analysis?.load_image_nodes || [];
        const node = loadNodes[slotIndex];
        if (!node) throw new Error("No LoadImage node at slot " + slotIndex);

        const result = await comfyUI.uploadImage(file, file.name);
        if (!result.name) throw new Error("Upload returned no filename");

        if (workflow?.[node.id]) {
            workflow[node.id].inputs.image = result.name;
        }

        if (opts.workflow) return result.name;

        const previewWrap = document.getElementById(`wfm-i2i-preview-wrap-${slotIndex}`);
        const previewImg  = document.getElementById(`wfm-i2i-preview-${slotIndex}`);
        const filenameEl  = document.getElementById(`wfm-i2i-filename-${slotIndex}`);
        const statusEl    = document.getElementById(`wfm-i2i-status-${slotIndex}`);
        const applyBtn    = document.querySelector(`.wfm-i2i-apply[data-slot="${slotIndex}"]`);

        if (previewImg) {
            previewImg.src = `/view?filename=${encodeURIComponent(result.name)}&type=input`;
            if (previewWrap) previewWrap.style.display = "";
        }
        if (filenameEl) filenameEl.textContent = result.name;
        if (statusEl)   { statusEl.textContent = `✓ ${result.name}`; statusEl.style.color = "var(--wfm-success)"; }
        if (applyBtn)   applyBtn.disabled = true;

        _syncRawJson();
        return result.name;
    },

    // imageInput/maskInput: File/Blob いずれも可。マスクは白=インペイント対象領域のグレースケール想定。
    // 画像とマスクをRGBA合成し、1枚のPNGとして対象LoadImageノードへアップロードする
    // （ComfyUIネイティブのアルファ→MASK抽出に準拠。Image Edit「Inpaint」タブのRunボタンから利用）。
    // opts.workflow/opts.analysis を渡すと、comfyUI.currentWorkflow/currentAnalysis の代わりに
    // そのワークフローへ書き込む（GenerateUIタブの表示・DOM更新は行わない。専用ワークフロー実行用）。
    async applyImageAndMaskToSlot(imageInput, maskInput, slotIndex = 0, opts = {}) {
        const workflow = opts.workflow || comfyUI.currentWorkflow;
        const analysis = opts.analysis || comfyUI.currentAnalysis;
        const loadNodes = analysis?.load_image_nodes || [];
        const node = loadNodes[slotIndex];
        if (!node) throw new Error("No LoadImage node at slot " + slotIndex);

        const composedBlob = await _compositeImageWithMask(imageInput, maskInput);
        const fileName = `inpaint_${Math.random().toString(36).slice(2, 10)}.png`;
        const composedFile = new File([composedBlob], fileName, { type: "image/png" });

        const result = await comfyUI.uploadImage(composedFile, fileName);
        if (!result.name) throw new Error("Upload returned no filename");

        if (workflow?.[node.id]) {
            workflow[node.id].inputs.image = result.name;
        }

        if (opts.workflow) return result.name;

        const previewWrap = document.getElementById(`wfm-i2i-preview-wrap-${slotIndex}`);
        const previewImg  = document.getElementById(`wfm-i2i-preview-${slotIndex}`);
        const filenameEl  = document.getElementById(`wfm-i2i-filename-${slotIndex}`);
        const statusEl    = document.getElementById(`wfm-i2i-status-${slotIndex}`);
        const applyBtn    = document.querySelector(`.wfm-i2i-apply[data-slot="${slotIndex}"]`);

        if (previewImg) {
            previewImg.src = `/view?filename=${encodeURIComponent(result.name)}&type=input`;
            if (previewWrap) previewWrap.style.display = "";
        }
        if (filenameEl) filenameEl.textContent = result.name;
        if (statusEl)   { statusEl.textContent = `✓ ${result.name}`; statusEl.style.color = "var(--wfm-success)"; }
        if (applyBtn)   applyBtn.disabled = true;

        _syncRawJson();
        return result.name;
    },

    // imageInput/maskInput: File/Blob いずれも可。マスクは白=インペイント対象領域のグレースケール想定。
    // Mask Editor One (comfyui-mask-editor-one) ノード向け。画像はサーバー側キャッシュへ
    // /mask_editor/store_image でPOSHし（node_idキー、bg_image_b64）、マスクは layer_data
    // ウィジェットへ「アルファチャンネル=mask値」のレイヤーとして書き込む。
    // opts.workflow を渡すと comfyUI.currentWorkflow の代わりにそのワークフローへ書き込む。
    async applyImageAndMaskToMaskEditorOneNode(imageInput, maskInput, nodeId, opts = {}) {
        const workflow = opts.workflow || comfyUI.currentWorkflow;
        const bgDataUrl   = await _imageInputToDataURL(imageInput);
        const maskDataUrl = await _maskInputToAlphaDataURL(maskInput);

        const resp = await fetch(`${comfyUI.baseUrl}/mask_editor/store_image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ node_id: String(nodeId), bg_image_b64: bgDataUrl }),
        });
        if (!resp.ok) throw new Error(`Failed to store image for Mask Editor One (node ${nodeId})`);

        if (workflow?.[nodeId]) {
            workflow[nodeId].inputs.layer_data = JSON.stringify({
                layers: [{ visible: true, opacity: 1, operation: "add", imageData: maskDataUrl }],
            });
        }

        if (!opts.workflow) _syncRawJson();
    },

    // Inpaint Run から呼ばれるポジ/ネガプロンプト設定。
    // opts.workflow/opts.analysis を渡すと、GenerateUIタブの選択中ターゲット（DOM）に依存せず、
    // そのワークフロー内の最初の該当role prompt_nodeへ直接反映する（専用ワークフロー実行用）。
    setPromptText(role, text, opts = {}) {
        if (opts.workflow && opts.analysis) {
            const node = (opts.analysis.prompt_nodes || []).find((n) => n.role === role);
            if (node && opts.workflow[node.id]) {
                opts.workflow[node.id].inputs[node.textKey || "text"] = text;
            }
            return;
        }
        const textareaId = role === "positive" ? "wfm-prompt-pos-text" : "wfm-prompt-neg-text";
        const textarea = document.getElementById(textareaId);
        if (textarea) textarea.value = text;
        this.syncToWorkflow();
        _syncRawJson();
    },

    // Inpaint Run から呼ばれる grow_mask_by / denoise 設定。
    // ワークフロー内の最初の VAEEncodeForInpaint ノード / denoise を持つ最初の sampler ノードへ反映する
    // （複数のインペイントパイプラインが同一ワークフローに存在するケースは現状非対応）。
    // workflow/analysis を渡すと comfyUI.currentWorkflow/currentAnalysis の代わりにそちらへ書き込む。
    setInpaintParams({ growMaskBy, denoise, workflow, analysis } = {}) {
        const wf = workflow || comfyUI.currentWorkflow;
        const an = analysis || comfyUI.currentAnalysis;
        const encodeNode = an?.inpaint_encode_nodes?.[0];
        if (encodeNode && growMaskBy != null && wf?.[encodeNode.id]) {
            wf[encodeNode.id].inputs.grow_mask_by = growMaskBy;
        }

        const samplerNode = (an?.sampler_nodes || []).find((n) => n.denoise !== undefined);
        if (samplerNode && denoise != null && wf?.[samplerNode.id]) {
            wf[samplerNode.id].inputs.denoise = denoise;
        }

        if (!workflow) _syncRawJson();
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

async function _initTextEncoderSection(analysis, textEncoders, containerEl) {
    const section = containerEl.querySelector("#wfm-te-section");
    if (!section) return;

    const nodes = analysis.text_encoder_nodes || [];
    if (nodes.length === 0) {
        section.innerHTML = `<label>Text Encoder</label><p class="wfm-placeholder">No text encoder node found</p>`;
        return;
    }

    const firstNode = nodes[0];
    const ct = firstNode.type;
    const isDual = ct === "DualCLIPLoader" || ct === "DualClipLoaderGGUF";
    const hasDevice = ct === "ClipLoaderGGUF" || ct === "DualClipLoaderGGUF";
    // CLIPLoader は clip_name、DualCLIPLoader は clip_name1 キーを使う
    const clip1Key = (ct === "CLIPLoader" || ct === "ClipLoaderGGUF") ? "clip_name" : "clip_name1";

    // object_info から type 選択肢を取得
    let typeOptions = [];
    try {
        const info = await comfyUI.fetchObjectInfo(ct);
        const typeSpec = info?.[ct]?.input?.required?.type;
        if (typeSpec) {
            const first = typeSpec[0];
            if (Array.isArray(first)) typeOptions = first;
            else if (Array.isArray(typeSpec[1]?.values)) typeOptions = typeSpec[1].values;
            else if (Array.isArray(typeSpec[1]?.options)) typeOptions = typeSpec[1].options;
        }
    } catch {}

    const currentClip1 = firstNode.clip_name1 || "";
    const currentClip2 = firstNode.clip_name2 || "";
    const currentType = firstNode.clip_type || typeOptions[0] || "";
    const currentDevice = firstNode.device || "default";

    const targetOpts = nodes.map(n => `<option value="${n.id}">ID:${n.id} (${n.title})</option>`).join("");
    const clip1Opts = textEncoders.map(m => `<option value="${m}" ${m === currentClip1 ? "selected" : ""}>${m}</option>`).join("");
    const clip2Opts = textEncoders.map(m => `<option value="${m}" ${m === currentClip2 ? "selected" : ""}>${m}</option>`).join("");
    const typeOpts = typeOptions.map(t => `<option value="${t}" ${t === currentType ? "selected" : ""}>${t}</option>`).join("");
    const deviceOpts = ["default", "cpu"].map(d => `<option value="${d}" ${d === currentDevice ? "selected" : ""}>${d}</option>`).join("");

    section.innerHTML = `
        <label>Text Encoder</label>
        <input type="text" class="wfm-input" id="wfm-te-filter" placeholder="Filter..." style="margin-bottom:4px;">
        <select class="wfm-select" id="wfm-te-clip1" style="margin-bottom:4px;">${clip1Opts}</select>
        ${isDual ? `<select class="wfm-select" id="wfm-te-clip2" style="margin-bottom:4px;">${clip2Opts}</select>` : ""}
        ${typeOptions.length > 0 ? `
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
            <label style="font-size:12px;white-space:nowrap;color:var(--wfm-text-secondary);width:50px;">Type</label>
            <select class="wfm-select" id="wfm-te-type">${typeOpts}</select>
        </div>` : ""}
        ${hasDevice ? `
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
            <label style="font-size:12px;white-space:nowrap;color:var(--wfm-text-secondary);width:50px;">Device</label>
            <select class="wfm-select" id="wfm-te-device">${deviceOpts}</select>
        </div>` : ""}
        <div style="display:flex;gap:8px;align-items:center;margin-top:4px;">
            <select class="wfm-select" id="wfm-te-target" style="flex:1;">${targetOpts}</select>
            <button class="wfm-btn wfm-btn-sm" id="wfm-te-apply">Apply</button>
        </div>
    `;

    // フィルター（clip1 のみ）
    document.getElementById("wfm-te-filter")?.addEventListener("input", (e) => {
        const filter = e.target.value.toLowerCase();
        const sel = document.getElementById("wfm-te-clip1");
        if (!sel) return;
        const filtered = textEncoders.filter(m => m.toLowerCase().includes(filter));
        sel.innerHTML = filtered.map(m => `<option value="${m}">${m}</option>`).join("");
    });

    // Apply
    document.getElementById("wfm-te-apply")?.addEventListener("click", () => {
        const nodeId = document.getElementById("wfm-te-target")?.value;
        if (!nodeId || !comfyUI.currentWorkflow?.[nodeId]) return;
        const inputs = comfyUI.currentWorkflow[nodeId].inputs;

        const clip1Val = document.getElementById("wfm-te-clip1")?.value;
        if (clip1Val) inputs[clip1Key] = clip1Val;

        if (isDual) {
            const clip2Val = document.getElementById("wfm-te-clip2")?.value;
            if (clip2Val) inputs.clip_name2 = clip2Val;
        }

        const typeVal = document.getElementById("wfm-te-type")?.value;
        if (typeVal) inputs.type = typeVal;

        if (hasDevice) {
            const deviceVal = document.getElementById("wfm-te-device")?.value;
            if (deviceVal) inputs.device = deviceVal;
        }

        _syncRawJson();
    });
}

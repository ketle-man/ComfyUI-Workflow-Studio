/**
 * Image Edit Tab - Inpaint / I2I Actions
 * Composites the active mask layer against the background and runs it
 * through GenerateUI's currently loaded workflow (or a dedicated one) for
 * inpainting, plus a mask-less I2I variant. Also exposes the external
 * entry points used by other same-origin panels (e.g. Comic Creator).
 */

import { showToast }     from "../app.js";
import { comfyUI }       from "../comfyui-client.js";
import { comfyEditor }   from "../comfyui-editor.js";
import { comfyWorkflow } from "../comfyui-workflow.js";

export class InpaintI2IActions {
    /**
     * @param {object} callbacks
     * @param {() => object|null} callbacks.getLayerManager
     * @param {() => HTMLCanvasElement} callbacks.buildBgCanvas
     */
    constructor(callbacks) {
        this._cb = callbacks;

        this.positive   = "";
        this.negative   = "";
        this.growMaskBy = null;  // null = 未初期化（ワークフローの現在値から初期化）
        this.denoise    = null;  // null = 未初期化（ワークフローの現在値から初期化）
        this.running    = false;
        this.resultUrl  = null;
        this.i2iExternalRunning = false;

        // Inpaint 専用ワークフロー（OFF時は GenerateUI で読み込み中のワークフローを使用）
        this.useDedicated     = false;
        this.dedicatedFilename = null;
        this.workflowList      = [];
    }

    async fetchWorkflowList(onLoaded) {
        try {
            const resp = await fetch(`${comfyUI.baseUrl}/api/wfm/workflows`);
            if (!resp.ok) return;
            const list = await resp.json();
            this.workflowList = (list || []).map((w) => w.filename).filter(Boolean);
            onLoaded?.();
        } catch {
            this.workflowList = [];
        }
    }

    renderPanel() {
        const pane  = document.getElementById("ie-props-pane");
        const body  = document.getElementById("ie-props-body");
        const title = document.getElementById("ie-props-title");
        if (!pane || !body) return;
        pane.style.display = "flex";
        if (title) title.textContent = "Inpaint";

        // 未初期化ならワークフローの現在値から初期化（VAEEncodeForInpaint.grow_mask_by / KSampler.denoise）
        if (this.growMaskBy == null) {
            this.growMaskBy = comfyUI.currentAnalysis?.inpaint_encode_nodes?.[0]?.grow_mask_by ?? 6;
        }
        if (this.denoise == null) {
            const samplerNode = (comfyUI.currentAnalysis?.sampler_nodes || []).find((n) => n.denoise !== undefined);
            this.denoise = samplerNode?.denoise ?? 1.0;
        }

        body.innerHTML = `
            <div class="ie-props-row">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="checkbox" id="ie-inpaint-use-dedicated" ${this.useDedicated ? "checked" : ""}>
                    Use dedicated workflow
                </label>
            </div>
            <div class="ie-props-row" id="ie-inpaint-dedicated-row" style="${this.useDedicated ? "" : "display:none;"}">
                <select id="ie-inpaint-dedicated-select" style="flex:1;">
                    <option value="">-- select workflow --</option>
                    ${this.workflowList.map((f) => `<option value="${f}" ${f === this.dedicatedFilename ? "selected" : ""}>${f}</option>`).join("")}
                </select>
            </div>
            <div class="ie-props-row" style="flex-direction:column;align-items:stretch;">
                <label>Positive Prompt</label>
                <textarea id="ie-inpaint-positive" rows="3" style="width:100%;resize:vertical;font-size:12px;">${this.positive}</textarea>
            </div>
            <div class="ie-props-row" style="flex-direction:column;align-items:stretch;">
                <label>Negative Prompt</label>
                <textarea id="ie-inpaint-negative" rows="3" style="width:100%;resize:vertical;font-size:12px;">${this.negative}</textarea>
            </div>
            <div class="ie-props-row">
                <label>Grow Mask By</label>
                <input type="number" id="ie-inpaint-grow-mask" min="0" max="200" step="1" value="${this.growMaskBy}" style="width:60px;">
            </div>
            <div class="ie-props-row">
                <label>Denoise</label>
                <input type="number" id="ie-inpaint-denoise" min="0" max="1" step="0.01" value="${this.denoise}" style="width:60px;">
            </div>
            <div class="ie-props-row">
                <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="ie-inpaint-run-btn" style="flex:1;" ${this.running ? "disabled" : ""}>
                    ${this.running ? "Running..." : "Run"}
                </button>
            </div>
            <span id="ie-inpaint-status" style="font-size:11px;color:var(--wfm-text-secondary);"></span>
            ${this.resultUrl ? `
            <div class="ie-props-row" style="flex-direction:column;align-items:stretch;">
                <label>Result</label>
                <img src="${this.resultUrl}" style="max-width:100%;border-radius:var(--wfm-radius-sm);border:1px solid var(--wfm-border);">
            </div>
            ` : ""}
        `;

        document.getElementById("ie-inpaint-use-dedicated")?.addEventListener("change", e => {
            this.useDedicated = e.target.checked;
            this.renderPanel();
        });
        document.getElementById("ie-inpaint-dedicated-select")?.addEventListener("change", e => {
            this.dedicatedFilename = e.target.value || null;
        });
        document.getElementById("ie-inpaint-positive")?.addEventListener("input", e => { this.positive = e.target.value; });
        document.getElementById("ie-inpaint-negative")?.addEventListener("input", e => { this.negative = e.target.value; });
        document.getElementById("ie-inpaint-grow-mask")?.addEventListener("input", e => {
            this.growMaskBy = parseInt(e.target.value) || 0;
        });
        document.getElementById("ie-inpaint-denoise")?.addEventListener("input", e => {
            this.denoise = Math.max(0, Math.min(1, parseFloat(e.target.value)));
            if (Number.isNaN(this.denoise)) this.denoise = 1.0;
        });
        document.getElementById("ie-inpaint-run-btn")?.addEventListener("click", () => this.run());
    }

    _exportMaskCanvas(maskLayer) {
        const w = maskLayer.canvas.width, h = maskLayer.canvas.height;
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(maskLayer.canvas, 0, 0);
        return canvas;
    }

    async run() {
        if (this.running) return;
        const layerMgr = this._cb.getLayerManager();
        if (!layerMgr) { showToast("No image loaded", "error"); return; }

        // 非表示のマスクレイヤーはInpaint対象から除外する（目玉アイコンOFF=対象外）
        const maskLayer = (layerMgr.activeLayer?.type === "mask" && layerMgr.activeLayer.visible)
            ? layerMgr.activeLayer
            : layerMgr.layers.find(l => l.type === "mask" && l.visible);
        if (!maskLayer) { showToast("Create or show a mask layer first (Mask tool)", "info"); return; }

        if (this.useDedicated) {
            if (!this.dedicatedFilename) { showToast("Select a dedicated workflow first", "info"); return; }
        } else if (!comfyUI.currentAnalysis) {
            showToast("Load a workflow in GenerateUI first", "info");
            return;
        }

        const runBtn    = document.getElementById("ie-inpaint-run-btn");
        const statusEl  = document.getElementById("ie-inpaint-status");
        const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

        this.running = true;
        if (runBtn) { runBtn.disabled = true; runBtn.textContent = "Running..."; }
        setStatus(this.useDedicated ? "Loading dedicated workflow..." : "Compositing...");

        try {
            // 専用ワークフロー使用時は GenerateUI の comfyUI.currentWorkflow/currentAnalysis には
            // 一切触れず、ここでロード・解析したローカルなワークフロー/解析結果だけを使う。
            let overrideOpts = {};

            if (this.useDedicated) {
                const resp = await fetch(`${comfyUI.baseUrl}/api/wfm/workflows/raw?filename=${encodeURIComponent(this.dedicatedFilename)}`);
                if (!resp.ok) throw new Error(`Failed to load workflow (HTTP ${resp.status})`);
                let dedicatedWorkflow = await resp.json();
                const format = comfyWorkflow.detectFormat(dedicatedWorkflow, this.dedicatedFilename);
                if (format === "ui") {
                    dedicatedWorkflow = await comfyWorkflow.convertUiToApi(dedicatedWorkflow);
                } else if (format !== "api") {
                    throw new Error("Unsupported or unrecognized workflow format");
                }
                overrideOpts = { workflow: dedicatedWorkflow, analysis: comfyWorkflow.analyzeWorkflow(dedicatedWorkflow) };
            }

            setStatus("Compositing...");
            const bgCanvas   = this._cb.buildBgCanvas();
            const imageBlob  = await new Promise((resolve) => bgCanvas.toBlob(resolve, "image/png"));
            const maskCanvas = this._exportMaskCanvas(maskLayer);
            const maskBlob   = await new Promise((resolve) => maskCanvas.toBlob(resolve, "image/png"));

            const resultUrl = await this._runWithImages(imageBlob, maskBlob, {
                positive: this.positive,
                negative: this.negative,
                growMaskBy: this.growMaskBy,
                denoise: this.denoise,
                overrideOpts,
                onStatus: setStatus,
            });
            if (resultUrl) this.resultUrl = resultUrl;

            setStatus("Done");
            showToast("Inpaint generation complete", "success");
        } catch (err) {
            setStatus("Error");
            showToast(`Inpaint failed: ${err.message}`, "error");
        } finally {
            this.running = false;
            this.renderPanel();
        }
    }

    // 共通処理: 画像+マスクBlobを対象ノード（LoadImage/MaskEditorOne）へ反映し、
    // プロンプト/grow_mask_by/denoiseを設定してGenerate UIで実行、結果URLを返す。
    // UI駆動の run() と外部（Comic Creator等）向けの runExternal() の両方から使う。
    async _runWithImages(imageBlob, maskBlob, { positive, negative, growMaskBy, denoise, overrideOpts = {}, onStatus } = {}) {
        const setStatus = onStatus || (() => {});

        // LoadImage(の MASK 出力が使われている)スロットを優先し、無ければ Mask Editor One
        // ノード（LoadImage を介さず画像/マスクを内包する custom node）にフォールバックする
        const analysisForLookup = overrideOpts.analysis || comfyUI.currentAnalysis;
        if (!analysisForLookup) throw new Error("No workflow loaded in GenerateUI");
        const slotIndex = (analysisForLookup.load_image_nodes || []).findIndex(n => n.mask_used);
        const meoNode = (analysisForLookup.mask_editor_one_nodes || [])[0];
        if (slotIndex === -1 && !meoNode) {
            throw new Error("No inpaint-capable LoadImage or Mask Editor One node found in the workflow");
        }

        setStatus("Uploading...");
        if (slotIndex !== -1) {
            await comfyEditor.applyImageAndMaskToSlot(imageBlob, maskBlob, slotIndex, overrideOpts);
        } else {
            await comfyEditor.applyImageAndMaskToMaskEditorOneNode(imageBlob, maskBlob, meoNode.id, overrideOpts);
        }

        comfyEditor.setPromptText("positive", positive, overrideOpts);
        comfyEditor.setPromptText("negative", negative, overrideOpts);
        comfyEditor.setInpaintParams({ growMaskBy, denoise, ...overrideOpts });

        if (!window._wfmGenerateTab?.generate) throw new Error("GenerateUI is not ready yet");

        setStatus("Generating...");
        await window._wfmGenerateTab.generate(overrideOpts.workflow || undefined);

        const resultImg = document.getElementById("wfm-gen-result-img");
        return resultImg?.src || null;
    }

    // Comic Creator等、同一オリジンiframe越しの外部呼び出し専用エントリポイント。
    // 専用ワークフロー選択(useDedicated)は扱わず、常にGenerate UIに現在
    // ロード中のワークフロー（comfyUI.currentWorkflow/currentAnalysis）を対象にする。
    async runExternal(imageBlob, maskBlob, { positive = "", negative = "", growMaskBy = 6, denoise = 1.0 } = {}) {
        if (this.running) throw new Error("Inpaint is already running");
        this.running = true;
        try {
            const resultUrl = await this._runWithImages(imageBlob, maskBlob, { positive, negative, growMaskBy, denoise });
            if (!resultUrl) throw new Error("No result image produced");
            return { ok: true, url: resultUrl };
        } finally {
            this.running = false;
        }
    }

    // 共通処理: 画像Blob（マスクなし）を対象LoadImageノード(slot 0)へ反映し、
    // プロンプト/denoiseを設定してGenerate UIで実行、結果URLを返す。
    // _runWithImages のマスクなし版（Comic CreatorのSelect I2I連携専用）。
    async _runI2IWithImage(imageBlob, { positive, negative, denoise, overrideOpts = {}, onStatus } = {}) {
        const setStatus = onStatus || (() => {});

        const analysisForLookup = overrideOpts.analysis || comfyUI.currentAnalysis;
        if (!analysisForLookup) throw new Error("No workflow loaded in GenerateUI");
        if (!(analysisForLookup.load_image_nodes?.length > 0)) {
            throw new Error("No LoadImage node found in the workflow");
        }

        setStatus("Uploading...");
        const file = new File([imageBlob], `i2i_${Math.random().toString(36).slice(2, 10)}.png`, { type: "image/png" });
        await comfyEditor.applyImageToSlot(file, 0, overrideOpts);

        comfyEditor.setPromptText("positive", positive, overrideOpts);
        comfyEditor.setPromptText("negative", negative, overrideOpts);
        comfyEditor.setInpaintParams({ denoise, ...overrideOpts });

        if (!window._wfmGenerateTab?.generate) throw new Error("GenerateUI is not ready yet");

        setStatus("Generating...");
        await window._wfmGenerateTab.generate(overrideOpts.workflow || undefined);

        const resultImg = document.getElementById("wfm-gen-result-img");
        return resultImg?.src || null;
    }

    // Comic Creator等、同一オリジンiframe越しの外部呼び出し専用エントリポイント（I2I版）。
    // runExternal と対になる、マスク不要のシンプルなI2I実行。
    async runI2IExternal(imageBlob, { positive = "", negative = "", denoise = 1.0 } = {}) {
        if (this.i2iExternalRunning) throw new Error("I2I is already running");
        this.i2iExternalRunning = true;
        try {
            const resultUrl = await this._runI2IWithImage(imageBlob, { positive, negative, denoise });
            if (!resultUrl) throw new Error("No result image produced");
            return { ok: true, url: resultUrl };
        } finally {
            this.i2iExternalRunning = false;
        }
    }
}

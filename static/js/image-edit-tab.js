/**
 * Image Edit Tab
 * Canvas-based image editor with object-based layer support.
 * Phase 1: Draw, Text, Select (move/resize/rotate/flip), Layers, Save/Upload.
 */

import { LayerManager, Layer } from "./image-edit/LayerManager.js";
import { DrawTool }            from "./image-edit/DrawTool.js";
import { TextTool, TEXT_FONTS } from "./image-edit/TextTool.js";
import { SelectTool }          from "./image-edit/SelectTool.js";
import { ShapeTool }           from "./image-edit/ShapeTool.js";
import { MaskTool }            from "./image-edit/MaskTool.js";
import { MaskColorTool, MaskAlphaTool, MaskTextTool, MaskVectorTool, MaskShapeTool, MASK_TEXT_FONTS } from "./image-edit/MaskEditorOneTools.js";
import { GmicIntegration }     from "./image-edit/GmicIntegration.js";
import { BlurTool }            from "./image-edit/BlurTool.js";
import { BgRemove }            from "./image-edit/BgRemove.js";
import { Sam3Segmentation }    from "./image-edit/Sam3Segmentation.js";
import { MaskEditorOneBridge } from "./image-edit/MaskEditorOneBridge.js";
import { InpaintI2IActions }   from "./image-edit/InpaintI2IActions.js";
import { FileExport }          from "./image-edit/FileExport.js";
import { showToast }           from "./app.js";
import { comfyUI }             from "./comfyui-client.js";
import { comfyEditor }         from "./comfyui-editor.js";
import { comfyWorkflow }       from "./comfyui-workflow.js";

const TOOL_DEFS = [
    { id: "select",   icon: "▲",  label: "Select",    ready: true  },
    { id: "draw",     icon: "✏",  label: "Draw",      ready: true  },
    { id: "text",     icon: "T",   label: "Text",      ready: true  },
    { id: "shape",    icon: "□",   label: "Shape",     ready: true  },
    { id: "mask",     icon: "🎭",  label: "Mask",      ready: true  },
    { id: "blur",     icon: "≈",   label: "Blur",      ready: true  },
    { id: "filter",   icon: "★",   label: "Filter",    ready: true },
    { id: "bgremove", icon: "⬚",   label: "BG Remove", ready: true  },
    { id: "inpaint",  icon: "🩹",  label: "Inpaint",   ready: true  },
];

const UNDO_LIMIT = 20;

function fitToCanvas(imgW, imgH, canvasW, canvasH) {
    const scale = Math.min(1, canvasW / imgW, canvasH / imgH);
    return { w: Math.round(imgW * scale), h: Math.round(imgH * scale) };
}

class ImageEditTab {
    constructor() {
        this._layerMgr      = null;
        this._activeTool    = "select";
        this._drawTool      = new DrawTool(null);
        this._textTool      = new TextTool(null);
        this._selectTool    = new SelectTool();
        this._zoom          = 1.0;
        this._panOffset     = { x: 0, y: 0 };
        this._canvasW       = 512;
        this._canvasH       = 512;
        this._baseName      = "image";
        this._undoStack     = [];
        this._redoStack     = [];
        this._panning       = false;
        this._panStart      = null;
        this._spaceDown     = false;
        this._compositeMode    = false;
        this._editingTextLayer = null;
        this._initialized      = false;
        this._shapeTool        = new ShapeTool();
        // Blur ツール
        this._blurTool = new BlurTool({
            getLayerManager:     () => this._layerMgr,
            getZoom:             () => this._zoom,
            saveUndo:            () => this._saveUndo(),
            updateCompositeView: () => this._updateCompositeView(),
            refreshLayerList:    () => this._refreshLayerList(),
            renderToolOptions:   (toolId) => this._renderToolOptions(toolId)
        });
        // Mask ツール
        this._maskTool         = null;
        this._maskSubtool      = "paint";
        // Mask Editor One 追加ツール
        this._maskColorTool  = null;
        this._maskAlphaTool  = null;
        this._maskTextTool   = null;
        this._maskVectorTool = null;
        this._maskShapeTool  = null;
        this._maskInverted     = false;
        this._maskOverlayColor = "#ff0000";
        this._maskBlur         = 0;
        // G'MIC tool integration
        this._gmic = new GmicIntegration({
            getLayerManager:          () => this._layerMgr,
            syncActiveLayerFromCanvas: () => this._syncActiveLayerFromCanvas(),
            saveUndo:                 () => this._saveUndo(),
            updateCompositeView:      () => this._updateCompositeView(),
            refreshLayerList:         () => this._refreshLayerList(),
            renderToolOptions:        (toolId) => this._renderToolOptions(toolId)
        });
        // 背景除去（imgly / Mask Editor One BiRefNet）
        this._bgRemove = new BgRemove({
            getLayerManager:     () => this._layerMgr,
            saveUndo:            () => this._saveUndo(),
            updateCompositeView: () => this._updateCompositeView(),
            refreshLayerList:    () => this._refreshLayerList(),
            onLayerAdded:        (newLayer) => {
                if (this._activeTool === "select") this._selectTool?.setLayer(newLayer);
            }
        });
        // Mask Editor One SAM3 セグメンテーション
        this._sam3 = new Sam3Segmentation({
            getLayerManager:     () => this._layerMgr,
            saveUndo:            () => this._saveUndo(),
            updateCompositeView: () => this._updateCompositeView(),
            refreshLayerList:    () => this._refreshLayerList(),
            renderToolOptions:   (toolId) => this._renderToolOptions(toolId),
            renderMaskProps:     (sub) => this._renderMaskProps(sub)
        });
        // ABR brush (Mask Editor One) — optional feature
        this._abrAvailable = false;
        this._abrBrushTree = [];
        // Mask Editor One 連携ボタン（既存ノード再利用方式）
        this._maskEditorBridge = new MaskEditorOneBridge({
            getLayerManager:     () => this._layerMgr,
            saveUndo:            () => this._saveUndo(),
            updateCompositeView: () => this._updateCompositeView(),
            refreshLayerList:    () => this._refreshLayerList(),
            buildBgCanvas:       () => this._buildBgCanvas()
        });
        // Inpaint / I2I（Comic Creator連携の外部実行も含む）
        this._inpaint = new InpaintI2IActions({
            getLayerManager: () => this._layerMgr,
            buildBgCanvas:   () => this._buildBgCanvas()
        });
        // ファイル出力（PNG保存 / Gallery保存 / ComfyUIアップロード）
        this._fileExport = new FileExport({
            getLayerManager:  () => this._layerMgr,
            getCanvasSize:    () => ({ w: this._canvasW, h: this._canvasH }),
            getBaseName:      () => this._baseName,
            renderMaskedLayer: (ctx, target, maskLayer, targetLayer, showOverlay) =>
                this._renderMaskedLayer(ctx, target, maskLayer, targetLayer, showOverlay)
        });
    }

    // ── 初期化 ────────────────────────────────────

    init() {
        if (this._initialized) return;
        this._initialized = true;
        this._setupToolButtons();
        this._setupActionBar();
        this._setupCanvasEvents();
        this._setupLayerPanel();
        this._setupKeyboard();
        this._initBrushCursor();
        // Mask Editor One の BiRefNet / SAM3 が利用可能か非同期で確認
        this._bgRemove.checkAvailability();
        this._sam3.checkAvailability();
        this._checkAbrAvailability();
        // Inpaint「専用ワークフロー」選択肢のため、保存済みワークフロー一覧を取得
        this._inpaint.fetchWorkflowList(() => {
            if (this._activeTool === "inpaint") this._inpaint.renderPanel();
        });
    }

    async _checkAbrAvailability() {
        try {
            const resp = await fetch("/mask_editor/brushes/list");
            if (!resp.ok) return;
            const json = await resp.json();
            this._abrBrushTree = json.tree || [];
            this._abrAvailable = this._abrBrushTree.length > 0;
        } catch {
            this._abrAvailable = false;
        }
    }

    // ── ブラシカーソル ────────────────────────────

    _initBrushCursor() {
        const el = document.createElement("div");
        el.id = "ie-brush-cursor";
        Object.assign(el.style, {
            position:      "fixed",
            pointerEvents: "none",
            border:        "1.5px solid rgba(255,255,255,0.85)",
            boxShadow:     "0 0 0 1px rgba(0,0,0,0.6)",
            borderRadius:  "50%",
            display:       "none",
            transform:     "translate(-50%,-50%)",
            zIndex:        "99999",
        });
        document.body.appendChild(el);
        this._brushCursorEl = el;
    }

    _updateBrushCursor(e) {
        const el = this._brushCursorEl;
        if (!el) return;
        const tool = this._activeTool;
        const size = tool === "draw"
            ? this._drawTool?.brushSize
            : (tool === "mask" && this._maskSubtool === "paint") ? this._maskTool?.brushSize : null;
        if (size == null) { el.style.display = "none"; return; }

        const refCanvas = document.getElementById("ie-canvas-draw");
        if (!refCanvas) { el.style.display = "none"; return; }
        const rect  = refCanvas.getBoundingClientRect();
        // Image Edit タブ非表示時（width=0）はカーソルを消す
        if (rect.width === 0 || rect.height === 0) { el.style.display = "none"; return; }
        // キャンバス外は通常カーソルを表示
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
            el.style.display = "none";
            return;
        }
        const scale = rect.width / refCanvas.width;
        const px    = Math.max(2, size * scale);

        el.style.width   = px + "px";
        el.style.height  = px + "px";
        el.style.left    = e.clientX + "px";
        el.style.top     = e.clientY + "px";
        el.style.display = "block";
    }

    _hideBrushCursor() {
        if (this._brushCursorEl) this._brushCursorEl.style.display = "none";
    }

    // ── ツールボタン ──────────────────────────────

    _setupToolButtons() {
        document.querySelectorAll(".ie-tool-btn[data-tool]").forEach(btn => {
            btn.addEventListener("click", () => {
                const def = TOOL_DEFS.find(d => d.id === btn.dataset.tool);
                if (!def?.ready) { showToast(`${def?.label ?? btn.dataset.tool}: coming soon`, "info"); return; }
                this._setActiveTool(btn.dataset.tool);
            });
        });
    }

    _setActiveTool(toolId) {
        this._hideBrushCursor();
        if (this._activeTool === "draw")   this._drawTool?.deactivate();
        if (this._activeTool === "text")   this._textTool?.deactivate();
        if (this._activeTool === "select") this._selectTool?.deactivate();
        if (this._activeTool === "shape")  this._shapeTool?.deactivate();
        if (this._activeTool === "mask")   this._deactivateMaskSubtool();
        if (this._activeTool === "filter") {
            this._gmic.abort();
        }
        if (this._activeTool === "blur") {
            this._blurTool.deactivate();
        }
        // Draw/Mask/Inpaint以外に切り替えたらプロパティペインを非表示
        if (toolId !== "mask" && toolId !== "draw" && toolId !== "inpaint") {
            const pane = document.getElementById("ie-props-pane");
            if (pane) pane.style.display = "none";
        }

        this._activeTool = toolId;

        document.querySelectorAll(".ie-tool-btn").forEach(btn =>
            btn.classList.toggle("active", btn.dataset.tool === toolId));

        this._renderToolOptions(toolId);
        this._activateCurrentTool();
    }

    _activateCurrentTool() {
        const drawCanvas    = document.getElementById("ie-canvas-draw");
        const overlayCanvas = document.getElementById("ie-canvas-overlay");
        if (!drawCanvas || !this._layerMgr) return;

        if (this._activeTool === "draw" && this._drawTool) {
            const activeLayer = this._layerMgr?.activeLayer;
            if (activeLayer) this._drawTool.setCanvas(activeLayer.canvas);
            this._drawTool.activate();
        } else if (this._activeTool === "text" && this._textTool) {
            this._textTool.setCanvas(drawCanvas);
            this._textTool.activate();
        } else if (this._activeTool === "select" && this._selectTool) {
            this._selectTool.setCanvas(overlayCanvas);
            this._selectTool.activate();
        } else if (this._activeTool === "shape" && this._shapeTool) {
            this._shapeTool.setCanvas(overlayCanvas);
            this._shapeTool.activate();
            if (overlayCanvas) overlayCanvas.style.cursor = "crosshair";
        } else if (this._activeTool === "mask") {
            this._initMaskEditorOneTools();
            this._activateMaskSubtool();
        } else if (this._activeTool === "blur") {
            this._blurTool.activate();
        }
    }

    _renderToolOptions(toolId) {
        const el = document.getElementById("ie-tool-options");
        if (!el) return;
        el.innerHTML = "";

        if (toolId === "select" && this._selectTool) {
            el.innerHTML = `
                <div class="ie-opt-group">
                    <button class="wfm-btn wfm-btn-sm" id="ie-flip-h-btn" title="Flip Horizontal">↔ Flip H</button>
                    <button class="wfm-btn wfm-btn-sm" id="ie-flip-v-btn" title="Flip Vertical">↕ Flip V</button>
                </div>
                <div class="ie-opt-group" style="margin-left:8px;">
                    <label style="font-size:11px;color:var(--wfm-text-secondary);">Rotate</label>
                    <input type="number" id="ie-rotate-input" value="0" step="1" min="-360" max="360"
                        style="width:56px;" class="ie-opt-input" title="Rotation angle (degrees)">°
                    <button class="wfm-btn wfm-btn-sm" id="ie-rotate-apply-btn">Apply</button>
                    <button class="wfm-btn wfm-btn-sm" id="ie-rotate-reset-btn">Reset</button>
                </div>
            `;
            document.getElementById("ie-flip-h-btn")?.addEventListener("click", () => {
                this._selectTool.flipH();
                this._updateCompositeView();
                this._refreshLayerList();
            });
            document.getElementById("ie-flip-v-btn")?.addEventListener("click", () => {
                this._selectTool.flipV();
                this._updateCompositeView();
                this._refreshLayerList();
            });
            document.getElementById("ie-rotate-apply-btn")?.addEventListener("click", () => {
                const layer = this._selectTool.getSelectedLayer();
                if (!layer) return;
                const deg = parseFloat(document.getElementById("ie-rotate-input").value) || 0;
                layer.rotation = deg;
                this._selectTool.setLayer(layer);
                this._updateCompositeView();
                this._refreshLayerList();
            });
            document.getElementById("ie-rotate-reset-btn")?.addEventListener("click", () => {
                const layer = this._selectTool.getSelectedLayer();
                if (!layer) return;
                layer.rotation = 0;
                layer.flipX    = false;
                layer.flipY    = false;
                document.getElementById("ie-rotate-input").value = 0;
                this._selectTool.setLayer(layer);
                this._updateCompositeView();
                this._refreshLayerList();
            });

        } else if (toolId === "draw" && this._drawTool) {
            el.innerHTML = "";
            this._renderDrawProps();

        } else if (toolId === "text" && this._textTool) {
            el.innerHTML = `
                <div class="ie-opt-group">
                    <label>Color</label>
                    <input type="color" id="ie-text-color" value="${this._textTool.color}"
                        style="width:30px;height:24px;padding:0;border:1px solid var(--wfm-border);cursor:pointer;border-radius:3px;">
                </div>
                <div class="ie-opt-group">
                    <label>Size</label>
                    <input type="number" id="ie-text-size" value="${this._textTool.fontSize}"
                        min="6" max="500" style="width:56px;" class="ie-opt-input">
                </div>
                <div class="ie-opt-group">
                    <label>Font</label>
                    <select id="ie-text-font" class="ie-opt-select">
                        ${TEXT_FONTS.map(f => `<option value="${f}" ${this._textTool.fontFamily===f?"selected":""}>${f}</option>`).join("")}
                    </select>
                </div>
                <div class="ie-opt-group" style="gap:4px;">
                    <button class="wfm-btn wfm-btn-sm ${this._textTool.bold   ? "ie-opt-active":""}" id="ie-text-bold"><b>B</b></button>
                    <button class="wfm-btn wfm-btn-sm ${this._textTool.italic ? "ie-opt-active":""}" id="ie-text-italic"><i>I</i></button>
                    <select id="ie-text-align" class="ie-opt-select" style="width:72px;">
                        <option value="left"   ${this._textTool.align==="left"   ?"selected":""}>Left</option>
                        <option value="center" ${this._textTool.align==="center" ?"selected":""}>Center</option>
                        <option value="right"  ${this._textTool.align==="right"  ?"selected":""}>Right</option>
                    </select>
                </div>
            `;
            document.getElementById("ie-text-color")?.addEventListener("input", e => { this._textTool.color = e.target.value; });
            document.getElementById("ie-text-size")?.addEventListener("change", e => { this._textTool.fontSize = parseInt(e.target.value) || 64; });
            document.getElementById("ie-text-font")?.addEventListener("change", e => { this._textTool.fontFamily = e.target.value; });
            document.getElementById("ie-text-bold")?.addEventListener("click", () => {
                this._textTool.bold = !this._textTool.bold; this._renderToolOptions("text");
            });
            document.getElementById("ie-text-italic")?.addEventListener("click", () => {
                this._textTool.italic = !this._textTool.italic; this._renderToolOptions("text");
            });
            document.getElementById("ie-text-align")?.addEventListener("change", e => { this._textTool.align = e.target.value; });
        } else if (toolId === "shape" && this._shapeTool) {
            const t = this._shapeTool;
            const isLineKind  = ["line", "freeline"].includes(t.shape);
            const showRounded = ["rect", "ellipse"].includes(t.shape);
            el.innerHTML = `
                <div class="ie-opt-group">
                    <label>Shape</label>
                    <select id="ie-shape-kind" class="ie-opt-select">
                        <option value="rect"     ${t.shape==="rect"     ?"selected":""}>Rect</option>
                        <option value="ellipse"  ${t.shape==="ellipse"  ?"selected":""}>Ellipse</option>
                        <option value="line"     ${t.shape==="line"     ?"selected":""}>Line</option>
                        <option value="freeline" ${t.shape==="freeline" ?"selected":""}>FreeLine</option>
                    </select>
                </div>
                <div class="ie-opt-group" id="ie-shape-rounded-wrap" style="display:${showRounded?"":"none"};">
                    <label><input type="checkbox" id="ie-shape-rounded" ${t.rounded?"checked":""}> Rounded</label>
                </div>
                <div class="ie-opt-group" id="ie-shape-fill-wrap" style="display:${isLineKind?"none":""};">
                    <label>Fill</label>
                    <input type="checkbox" id="ie-shape-fill-none" ${t.fillNone?"checked":""}> <span style="font-size:11px;color:var(--wfm-text-secondary);">None</span>
                    <input type="color" id="ie-shape-fill" value="${t.fillColor}" ${t.fillNone?"disabled":""}
                        style="width:28px;height:24px;padding:0;border:1px solid var(--wfm-border);cursor:pointer;border-radius:3px;margin-left:2px;">
                </div>
                <div class="ie-opt-group">
                    <label>Stroke</label>
                    <div id="ie-shape-stroke-none-wrap" style="display:${isLineKind?"none":""};">
                        <input type="checkbox" id="ie-shape-stroke-none" ${t.strokeNone?"checked":""}> <span style="font-size:11px;color:var(--wfm-text-secondary);">None</span>
                    </div>
                    <input type="color" id="ie-shape-stroke" value="${t.strokeColor}" ${(!isLineKind && t.strokeNone)?"disabled":""}
                        style="width:28px;height:24px;padding:0;border:1px solid var(--wfm-border);cursor:pointer;border-radius:3px;margin-left:2px;">
                    <input type="number" id="ie-shape-stroke-width" value="${t.strokeWidth}" min="1" max="200" ${(!isLineKind && t.strokeNone)?"disabled":""}
                        style="width:44px;margin-left:2px;" class="ie-opt-input">
                </div>
                <div class="ie-opt-group">
                    <label>Opacity</label>
                    <input type="range" id="ie-shape-opacity" min="1" max="100" value="${Math.round(t.opacity*100)}" style="width:70px;">
                    <span id="ie-shape-opacity-lbl">${Math.round(t.opacity*100)}%</span>
                </div>
                <div class="ie-opt-group" style="margin-left:8px;">
                    <button class="wfm-btn wfm-btn-sm" id="ie-shape-undo-btn">↩ Undo</button>
                </div>
            `;

            const _updateShapeVisibility = () => {
                const kind       = document.getElementById("ie-shape-kind").value;
                const lineKind   = ["line", "freeline"].includes(kind);
                const rw  = document.getElementById("ie-shape-rounded-wrap");
                const fw  = document.getElementById("ie-shape-fill-wrap");
                const snw = document.getElementById("ie-shape-stroke-none-wrap");
                if (rw)  rw.style.display  = ["rect", "ellipse"].includes(kind) ? "" : "none";
                if (fw)  fw.style.display  = lineKind ? "none" : "";
                if (snw) snw.style.display = lineKind ? "none" : "";
                if (lineKind) {
                    // fill は不要
                    document.getElementById("ie-shape-fill-none").checked = true;
                    document.getElementById("ie-shape-fill").disabled = true;
                    t.fillNone = true;
                    // stroke は常に有効
                    document.getElementById("ie-shape-stroke").disabled       = false;
                    document.getElementById("ie-shape-stroke-width").disabled = false;
                } else {
                    // rect / ellipse: strokeNone に従って再適用
                    const sn = document.getElementById("ie-shape-stroke-none").checked;
                    document.getElementById("ie-shape-stroke").disabled       = sn;
                    document.getElementById("ie-shape-stroke-width").disabled = sn;
                }
            };

            document.getElementById("ie-shape-kind")?.addEventListener("change", e => {
                t.shape = e.target.value;
                _updateShapeVisibility();
            });
            document.getElementById("ie-shape-rounded")?.addEventListener("change", e => {
                t.rounded = e.target.checked;
            });
            document.getElementById("ie-shape-fill-none")?.addEventListener("change", e => {
                t.fillNone = e.target.checked;
                document.getElementById("ie-shape-fill").disabled = e.target.checked;
            });
            document.getElementById("ie-shape-fill")?.addEventListener("input", e => {
                t.fillColor = e.target.value;
            });
            document.getElementById("ie-shape-stroke-none")?.addEventListener("change", e => {
                t.strokeNone = e.target.checked;
                document.getElementById("ie-shape-stroke").disabled       = e.target.checked;
                document.getElementById("ie-shape-stroke-width").disabled = e.target.checked;
            });
            document.getElementById("ie-shape-stroke")?.addEventListener("input", e => {
                t.strokeColor = e.target.value;
            });
            document.getElementById("ie-shape-stroke-width")?.addEventListener("input", e => {
                t.strokeWidth = parseFloat(e.target.value) || 1;
            });
            document.getElementById("ie-shape-opacity")?.addEventListener("input", e => {
                t.opacity = parseInt(e.target.value) / 100;
                document.getElementById("ie-shape-opacity-lbl").textContent = e.target.value + "%";
            });
            document.getElementById("ie-shape-undo-btn")?.addEventListener("click", () => this._undo());

        } else if (toolId === "mask") {
            const sub = this._maskSubtool ?? "paint";
            const sam3Disabled = this._sam3.available ? "" : "disabled";
            const sam3Title    = this._sam3.available ? "SAM3 Segment" : "SAM3 (Mask Editor One required)";
            const sam3Ui = this._sam3.renderToolbarExtra(sub);
            el.innerHTML = `
                <div class="ie-opt-group" style="flex-wrap:nowrap;gap:2px;">
                    <button class="wfm-btn wfm-btn-sm${sub === "paint"  ? " ie-opt-active" : ""}" id="ie-mask-paint-btn">Paint</button>
                    <button class="wfm-btn wfm-btn-sm${sub === "color"  ? " ie-opt-active" : ""}" id="ie-mask-color-btn">Color</button>
                    <button class="wfm-btn wfm-btn-sm${sub === "alpha"  ? " ie-opt-active" : ""}" id="ie-mask-alpha-btn">Alpha</button>
                    <button class="wfm-btn wfm-btn-sm${sub === "text"   ? " ie-opt-active" : ""}" id="ie-mask-text-btn">Text</button>
                    <button class="wfm-btn wfm-btn-sm${sub === "vector" ? " ie-opt-active" : ""}" id="ie-mask-vector-btn">Vector</button>
                    <button class="wfm-btn wfm-btn-sm${sub === "shape"  ? " ie-opt-active" : ""}" id="ie-mask-shape-btn">Shape</button>
                    <button class="wfm-btn wfm-btn-sm${sub === "sam3"   ? " ie-opt-active" : ""}" id="ie-mask-sam3-btn"
                        ${sam3Disabled} title="${sam3Title}">SAM3</button>
                </div>
                <div style="width:1px;height:22px;background:var(--wfm-border);margin:0 4px;flex-shrink:0;"></div>
                ${sam3Ui}
                ${sub !== "sam3" ? `
                <div class="ie-opt-group">
                    <label style="font-size:11px;cursor:pointer;color:var(--wfm-text-secondary);">
                        <input type="checkbox" id="ie-mask-invert" ${this._maskInverted ? "checked" : ""}> Invert
                    </label>
                </div>
                <div class="ie-opt-group">
                    <label style="font-size:11px;color:var(--wfm-text-secondary);">Overlay</label>
                    <input type="color" id="ie-mask-overlay-color" value="${this._maskOverlayColor}"
                        style="width:28px;height:22px;padding:0;border:1px solid var(--wfm-border);cursor:pointer;border-radius:3px;">
                </div>
                <div class="ie-opt-group">
                    <label style="font-size:11px;color:var(--wfm-text-secondary);">Blur</label>
                    <input type="range" id="ie-mask-blur" min="0" max="50" value="${this._maskBlur}" style="width:70px;">
                    <span id="ie-mask-blur-val" style="font-size:11px;min-width:22px;">${this._maskBlur}</span>px
                </div>` : ""}
            `;
            document.getElementById("ie-mask-paint-btn")?.addEventListener("click", () => {
                this._switchMaskSubtool("paint");
            });
            document.getElementById("ie-mask-color-btn")?.addEventListener("click", () => {
                this._switchMaskSubtool("color");
            });
            document.getElementById("ie-mask-alpha-btn")?.addEventListener("click", () => {
                this._switchMaskSubtool("alpha");
            });
            document.getElementById("ie-mask-text-btn")?.addEventListener("click", () => {
                this._switchMaskSubtool("text");
            });
            document.getElementById("ie-mask-vector-btn")?.addEventListener("click", () => {
                this._switchMaskSubtool("vector");
            });
            document.getElementById("ie-mask-shape-btn")?.addEventListener("click", () => {
                this._switchMaskSubtool("shape");
            });
            document.getElementById("ie-mask-sam3-btn")?.addEventListener("click", () => {
                if (this._sam3.available) this._switchMaskSubtool("sam3");
            });
            this._sam3.bindToolbarEvents();
            document.getElementById("ie-mask-invert")?.addEventListener("change", e => {
                this._maskInverted = e.target.checked;
                this._updateCompositeView();
            });
            document.getElementById("ie-mask-overlay-color")?.addEventListener("input", e => {
                this._maskOverlayColor = e.target.value;
                this._updateCompositeView();
            });
            document.getElementById("ie-mask-blur")?.addEventListener("input", e => {
                this._maskBlur = parseInt(e.target.value);
                document.getElementById("ie-mask-blur-val").textContent = e.target.value;
                this._updateCompositeView();
            });
            this._renderMaskProps(sub);

        } else if (toolId === "blur") {
            this._blurTool.renderPanel(el);

        } else if (toolId === "bgremove") {
            this._bgRemove.renderPanel(el);

        } else if (toolId === "filter") {
            this._gmic.renderPanel(el);

        } else if (toolId === "inpaint") {
            el.innerHTML = "";
            this._inpaint.renderPanel();
        } else {
            const def = TOOL_DEFS.find(d => d.id === toolId);
            el.innerHTML = `<span style="font-size:12px;color:var(--wfm-text-secondary);">${def?.label ?? toolId}: coming soon</span>`;
        }
    }

    _renderMaskProps(sub) {
        const pane  = document.getElementById("ie-props-pane");
        const body  = document.getElementById("ie-props-body");
        const title = document.getElementById("ie-props-title");
        if (!pane || !body) return;
        pane.style.display = "flex";
        if (title) title.textContent = sub.charAt(0).toUpperCase() + sub.slice(1);

        if (sub === "paint" && this._maskTool) {
            const t = this._maskTool;
            body.innerHTML = `
                <div class="ie-props-row">
                    <label>Mode</label>
                    <div style="display:flex;gap:4px;">
                        <button class="wfm-btn wfm-btn-sm${t.mode === "paint" ? " ie-opt-active" : ""}" id="ie-mask-mode-add" style="flex:1;">Add</button>
                        <button class="wfm-btn wfm-btn-sm${t.mode === "erase" ? " ie-opt-active" : ""}" id="ie-mask-mode-erase" style="flex:1;">Erase</button>
                    </div>
                </div>
                <div class="ie-props-row">
                    <label>Size</label>
                    <input type="range" id="ie-mask-size" min="1" max="200" value="${t.brushSize}">
                    <span id="ie-mask-size-lbl">${t.brushSize}px</span>
                </div>
                <div class="ie-props-row">
                    <label>Hardness</label>
                    <input type="range" id="ie-mask-hard" min="0" max="100" value="${Math.round(t.hardness * 100)}"
                        ${t.brushImage ? "disabled title='Hardness applies to circle brush only'" : ""}>
                    <span id="ie-mask-hard-lbl">${Math.round(t.hardness * 100)}%</span>
                </div>
                <div style="margin:6px 0 4px;border-top:1px solid var(--wfm-border);padding-top:6px;font-size:10px;color:${this._abrAvailable ? "var(--wfm-success)" : "var(--wfm-text-secondary)"};letter-spacing:0.05em;"
                    title="${this._abrAvailable ? "Mask Editor One: brushes available" : "Mask Editor One: no brushes imported yet"}">
                    MASK EDITOR ONE
                </div>
                <div class="ie-props-row">
                    <label>Brush</label>
                    <span style="font-size:11px;color:var(--wfm-text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                        title="${t.brushName ?? "Circle"}">${t.brushName ?? "Circle"}</span>
                    <button class="wfm-btn wfm-btn-sm" id="ie-mask-select-brush" style="font-size:10px;padding:1px 6px;flex-shrink:0;" ${this._abrAvailable ? "" : "disabled"}>Select</button>
                    ${t.brushImage ? `<button class="wfm-btn wfm-btn-sm" id="ie-mask-clear-brush" style="font-size:10px;padding:1px 5px;flex-shrink:0;">✕</button>` : ""}
                </div>
                <div class="ie-props-row">
                    <button class="wfm-btn wfm-btn-sm" id="ie-mask-editor-one-open" style="flex:1;font-size:11px;"
                        title="Send the current canvas to the Mask Editor One node on the ComfyUI canvas (selected node preferred, falls back to the first one found) and edit interactively">
                        Edit in Mask Editor One →
                    </button>
                </div>
                ${t.brushImage ? `
                <div class="ie-props-row">
                    <label>Spacing</label>
                    <input type="range" id="ie-mask-spacing" min="5" max="100" value="${Math.round((t.spacing ?? 0.25) * 100)}">
                    <span id="ie-mask-spacing-lbl">${Math.round((t.spacing ?? 0.25) * 100)}%</span>
                </div>
                <div class="ie-props-row">
                    <label>Angle</label>
                    <input type="range" id="ie-mask-angle" min="0" max="359" value="${t.angle ?? 0}">
                    <span id="ie-mask-angle-lbl">${t.angle ?? 0}°</span>
                </div>
                <div class="ie-props-row">
                    <label>Sz Jitter</label>
                    <input type="range" id="ie-mask-szjitter" min="0" max="100" value="${Math.round((t.sizeJitterAmount ?? 0.5) * 100)}">
                    <span id="ie-mask-szjitter-lbl">${Math.round((t.sizeJitterAmount ?? 0.5) * 100)}%</span>
                </div>
                <div class="ie-props-row">
                    <label>Rot. Jitter</label>
                    <label style="cursor:pointer;font-size:11px;">
                        <input type="checkbox" id="ie-mask-rotjitter" ${t.rotationJitter ? "checked" : ""}> On
                    </label>
                </div>` : ""}
            `;
            document.getElementById("ie-mask-mode-add")?.addEventListener("click", () => {
                this._maskTool.mode = "paint";
                this._maskTool._stamp = null;
                this._renderMaskProps("paint");
            });
            document.getElementById("ie-mask-mode-erase")?.addEventListener("click", () => {
                this._maskTool.mode = "erase";
                this._maskTool._stamp = null;
                this._renderMaskProps("paint");
            });
            document.getElementById("ie-mask-size")?.addEventListener("input", e => {
                this._maskTool.brushSize = parseInt(e.target.value);
                document.getElementById("ie-mask-size-lbl").textContent = e.target.value + "px";
                this._maskTool._stamp = null;
            });
            document.getElementById("ie-mask-hard")?.addEventListener("input", e => {
                this._maskTool.hardness = parseInt(e.target.value) / 100;
                document.getElementById("ie-mask-hard-lbl").textContent = e.target.value + "%";
                this._maskTool._stamp = null;
            });
            document.getElementById("ie-mask-select-brush")?.addEventListener("click", () => this._openAbrBrushPicker());
            document.getElementById("ie-mask-editor-one-open")?.addEventListener("click", () => this._maskEditorBridge.openEditor());
            document.getElementById("ie-mask-clear-brush")?.addEventListener("click", () => {
                this._maskTool?.clearImageBrush();
                this._renderMaskProps("paint");
            });
            document.getElementById("ie-mask-spacing")?.addEventListener("input", e => {
                this._maskTool.spacing = parseInt(e.target.value) / 100;
                document.getElementById("ie-mask-spacing-lbl").textContent = e.target.value + "%";
            });
            document.getElementById("ie-mask-angle")?.addEventListener("input", e => {
                this._maskTool.angle = parseInt(e.target.value);
                document.getElementById("ie-mask-angle-lbl").textContent = e.target.value + "°";
            });
            document.getElementById("ie-mask-szjitter")?.addEventListener("input", e => {
                this._maskTool.sizeJitterAmount = parseInt(e.target.value) / 100;
                this._maskTool.sizeJitter = this._maskTool.sizeJitterAmount > 0;
                document.getElementById("ie-mask-szjitter-lbl").textContent = e.target.value + "%";
            });
            document.getElementById("ie-mask-rotjitter")?.addEventListener("change", e => {
                this._maskTool.rotationJitter = e.target.checked;
            });
        } else if (sub === "sam3") {
            this._sam3.renderResultsPanel(body);
        } else if (sub === "color" && this._maskColorTool) {
            const t = this._maskColorTool;
            body.innerHTML = `
                <div class="ie-props-row">
                    <label>Mode</label>
                    <div style="display:flex;gap:4px;">
                        <button class="wfm-btn wfm-btn-sm${t.mode === "add"      ? " ie-opt-active" : ""}" id="ie-mc-add"  style="flex:1;">Add</button>
                        <button class="wfm-btn wfm-btn-sm${t.mode === "subtract" ? " ie-opt-active" : ""}" id="ie-mc-sub"  style="flex:1;">Sub</button>
                    </div>
                </div>
                <div class="ie-props-row">
                    <label>Tolerance</label>
                    <input type="range" id="ie-mc-tol" min="0" max="255" value="${t.tolerance}">
                    <span id="ie-mc-tol-lbl">${t.tolerance}</span>
                </div>
                <div class="ie-props-row">
                    <label>Feather %</label>
                    <input type="range" id="ie-mc-fea" min="0" max="100" value="${t.feather}">
                    <span id="ie-mc-fea-lbl">${t.feather}%</span>
                </div>
                <div style="font-size:10px;color:var(--wfm-text-secondary);margin-top:2px;">Click on canvas to select color</div>
            `;
            document.getElementById("ie-mc-add")?.addEventListener("click", () => { t.mode = "add"; this._renderMaskProps("color"); });
            document.getElementById("ie-mc-sub")?.addEventListener("click", () => { t.mode = "subtract"; this._renderMaskProps("color"); });
            document.getElementById("ie-mc-tol")?.addEventListener("input", e => {
                t.tolerance = parseInt(e.target.value);
                document.getElementById("ie-mc-tol-lbl").textContent = e.target.value;
            });
            document.getElementById("ie-mc-fea")?.addEventListener("input", e => {
                t.feather = parseInt(e.target.value);
                document.getElementById("ie-mc-fea-lbl").textContent = e.target.value + "%";
            });

        } else if (sub === "alpha" && this._maskAlphaTool) {
            const t = this._maskAlphaTool;
            body.innerHTML = `
                <div class="ie-props-row">
                    <label>Threshold</label>
                    <input type="range" id="ie-ma-thr" min="0" max="255" value="${t.threshold}">
                    <span id="ie-ma-thr-lbl">${t.threshold}</span>
                </div>
                <div class="ie-props-row">
                    <label style="cursor:pointer;">
                        <input type="checkbox" id="ie-ma-inv" ${t.invert ? "checked" : ""}> Invert
                    </label>
                </div>
                <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="ie-ma-extract" style="margin-top:4px;">Extract Alpha</button>
                <div style="font-size:10px;color:var(--wfm-text-secondary);margin-top:2px;">Extracts alpha from image layers</div>
            `;
            document.getElementById("ie-ma-thr")?.addEventListener("input", e => {
                t.threshold = parseInt(e.target.value);
                document.getElementById("ie-ma-thr-lbl").textContent = e.target.value;
            });
            document.getElementById("ie-ma-inv")?.addEventListener("change", e => { t.invert = e.target.checked; });
            document.getElementById("ie-ma-extract")?.addEventListener("click", () => {
                const activeLayer = this._layerMgr?.activeLayer;
                if (!activeLayer || activeLayer.type !== "mask") { showToast("Select a mask layer first", "info"); return; }
                const bgCv = this._buildBgCanvas();
                this._maskAlphaTool.setCanvas(activeLayer.canvas);
                this._maskAlphaTool.setSourceImage(bgCv);
                this._saveUndo();
                this._maskAlphaTool.extract();
                this._updateCompositeView();
                this._refreshLayerList();
            });

        } else if (sub === "text" && this._maskTextTool) {
            const t = this._maskTextTool;
            body.innerHTML = `
                <div class="ie-props-row">
                    <label>Mode</label>
                    <div style="display:flex;gap:4px;">
                        <button class="wfm-btn wfm-btn-sm${t.mode === "add"   ? " ie-opt-active" : ""}" id="ie-mt-add"   style="flex:1;">Add</button>
                        <button class="wfm-btn wfm-btn-sm${t.mode === "erase" ? " ie-opt-active" : ""}" id="ie-mt-erase" style="flex:1;">Erase</button>
                    </div>
                </div>
                <div class="ie-props-row">
                    <label>Font</label>
                    <select id="ie-mt-font" class="ie-opt-select" style="width:100%;font-size:11px;">
                        ${MASK_TEXT_FONTS.map(f => `<option value="${f}"${t.fontFamily === f ? " selected" : ""}>${f}</option>`).join("")}
                    </select>
                </div>
                <div class="ie-props-row">
                    <label>Size</label>
                    <input type="number" id="ie-mt-size" value="${t.fontSize}" min="6" max="500" class="ie-opt-input" style="width:60px;">
                </div>
                <div class="ie-props-row" style="flex-direction:row;align-items:center;gap:6px;">
                    <button class="wfm-btn wfm-btn-sm${t.bold   ? " ie-opt-active" : ""}" id="ie-mt-bold"   style="min-width:30px;"><b>B</b></button>
                    <button class="wfm-btn wfm-btn-sm${t.italic ? " ie-opt-active" : ""}" id="ie-mt-italic" style="min-width:30px;"><i>I</i></button>
                    <select id="ie-mt-align" class="ie-opt-select" style="flex:1;font-size:11px;">
                        ${["left","center","right"].map(a => `<option value="${a}"${t.align === a ? " selected" : ""}>${a.charAt(0).toUpperCase()+a.slice(1)}</option>`).join("")}
                    </select>
                </div>
                <div style="font-size:10px;color:var(--wfm-text-secondary);margin-top:2px;">Click on canvas to stamp text</div>
            `;
            document.getElementById("ie-mt-add")?.addEventListener("click", () => { t.mode = "add"; this._renderMaskProps("text"); });
            document.getElementById("ie-mt-erase")?.addEventListener("click", () => { t.mode = "erase"; this._renderMaskProps("text"); });
            document.getElementById("ie-mt-font")?.addEventListener("change", e => { t.fontFamily = e.target.value; });
            document.getElementById("ie-mt-size")?.addEventListener("input", e => { t.fontSize = parseInt(e.target.value) || 64; });
            document.getElementById("ie-mt-bold")?.addEventListener("click", () => { t.bold = !t.bold; this._renderMaskProps("text"); });
            document.getElementById("ie-mt-italic")?.addEventListener("click", () => { t.italic = !t.italic; this._renderMaskProps("text"); });
            document.getElementById("ie-mt-align")?.addEventListener("change", e => { t.align = e.target.value; });

        } else if (sub === "vector" && this._maskVectorTool) {
            const t = this._maskVectorTool;
            const pts = t._points ?? [];
            body.innerHTML = `
                <div class="ie-props-row">
                    <label>Mode</label>
                    <div style="display:flex;gap:4px;">
                        <button class="wfm-btn wfm-btn-sm${t.mode === "add"   ? " ie-opt-active" : ""}" id="ie-mv-add"   style="flex:1;">Add</button>
                        <button class="wfm-btn wfm-btn-sm${t.mode === "erase" ? " ie-opt-active" : ""}" id="ie-mv-erase" style="flex:1;">Erase</button>
                    </div>
                </div>
                <div class="ie-props-row" style="flex-direction:row;align-items:center;justify-content:space-between;">
                    <span style="color:var(--wfm-text-secondary);">Points: ${pts.length}</span>
                    <button class="wfm-btn wfm-btn-sm" id="ie-mv-reset">Reset</button>
                </div>
                <div style="font-size:10px;color:var(--wfm-text-secondary);margin-top:2px;line-height:1.5;">
                    Click: add point<br>
                    Click 1st point: close<br>
                    Enter: close open path<br>
                    Backspace: remove last<br>
                    Esc: reset
                </div>
            `;
            document.getElementById("ie-mv-add")?.addEventListener("click", () => { t.mode = "add"; this._renderMaskProps("vector"); });
            document.getElementById("ie-mv-erase")?.addEventListener("click", () => { t.mode = "erase"; this._renderMaskProps("vector"); });
            document.getElementById("ie-mv-reset")?.addEventListener("click", () => { t.reset(); this._renderMaskProps("vector"); });

        } else if (sub === "shape" && this._maskShapeTool) {
            const t = this._maskShapeTool;
            body.innerHTML = `
                <div class="ie-props-row">
                    <label>Mode</label>
                    <div style="display:flex;gap:4px;">
                        <button class="wfm-btn wfm-btn-sm${t.mode === "add"   ? " ie-opt-active" : ""}" id="ie-ms-add"   style="flex:1;">Add</button>
                        <button class="wfm-btn wfm-btn-sm${t.mode === "erase" ? " ie-opt-active" : ""}" id="ie-ms-erase" style="flex:1;">Erase</button>
                    </div>
                </div>
                <div class="ie-props-row">
                    <label>Shape</label>
                    <div style="display:flex;gap:4px;">
                        <button class="wfm-btn wfm-btn-sm${t.shape === "rect"    ? " ie-opt-active" : ""}" id="ie-ms-rect"    style="flex:1;">Rect</button>
                        <button class="wfm-btn wfm-btn-sm${t.shape === "ellipse" ? " ie-opt-active" : ""}" id="ie-ms-ellipse" style="flex:1;">Ellipse</button>
                    </div>
                </div>
                <div style="font-size:10px;color:var(--wfm-text-secondary);margin-top:2px;">Shift: square / circle</div>
            `;
            document.getElementById("ie-ms-add")?.addEventListener("click", () => { t.mode = "add"; this._renderMaskProps("shape"); });
            document.getElementById("ie-ms-erase")?.addEventListener("click", () => { t.mode = "erase"; this._renderMaskProps("shape"); });
            document.getElementById("ie-ms-rect")?.addEventListener("click", () => { t.shape = "rect"; this._renderMaskProps("shape"); });
            document.getElementById("ie-ms-ellipse")?.addEventListener("click", () => { t.shape = "ellipse"; this._renderMaskProps("shape"); });

        } else {
            body.innerHTML = `<span style="font-size:11px;color:var(--wfm-text-secondary);">No options</span>`;
        }
    }

    _renderDrawProps() {
        const pane  = document.getElementById("ie-props-pane");
        const body  = document.getElementById("ie-props-body");
        const title = document.getElementById("ie-props-title");
        if (!pane || !body) return;
        pane.style.display = "flex";
        if (title) title.textContent = "Draw";

        const t = this._drawTool;
        body.innerHTML = `
            <div class="ie-props-row">
                <label>Mode</label>
                <div style="display:flex;gap:4px;">
                    <button class="wfm-btn wfm-btn-sm${t.mode === "draw"  ? " ie-opt-active" : ""}" id="ie-draw-mode-draw"  style="flex:1;">Draw</button>
                    <button class="wfm-btn wfm-btn-sm${t.mode === "erase" ? " ie-opt-active" : ""}" id="ie-draw-mode-erase" style="flex:1;">Erase</button>
                </div>
            </div>
            <div class="ie-props-row">
                <label>Color</label>
                <input type="color" id="ie-draw-color" value="${t.color}"
                    style="width:36px;height:24px;padding:0;border:1px solid var(--wfm-border);cursor:pointer;border-radius:3px;flex-shrink:0;">
            </div>
            <div class="ie-props-row">
                <label>Size</label>
                <input type="range" id="ie-draw-size" min="1" max="200" value="${t.brushSize}">
                <span id="ie-draw-size-lbl">${t.brushSize}px</span>
            </div>
            <div class="ie-props-row">
                <label>Hardness</label>
                <input type="range" id="ie-draw-hard" min="0" max="100" value="${Math.round(t.hardness * 100)}"
                    ${t.brushImage ? "disabled title='Hardness applies to circle brush only'" : ""}>
                <span id="ie-draw-hard-lbl">${Math.round(t.hardness * 100)}%</span>
            </div>
            <div class="ie-props-row">
                <label>Opacity</label>
                <input type="range" id="ie-draw-opacity" min="1" max="100" value="${Math.round(t.opacity * 100)}">
                <span id="ie-draw-opacity-lbl">${Math.round(t.opacity * 100)}%</span>
            </div>
            <div style="margin:6px 0 4px;border-top:1px solid var(--wfm-border);padding-top:6px;font-size:10px;color:${this._abrAvailable ? "var(--wfm-success)" : "var(--wfm-text-secondary)"};letter-spacing:0.05em;"
                title="${this._abrAvailable ? "Mask Editor One: brushes available" : "Mask Editor One: no brushes imported yet"}">
                MASK EDITOR ONE (COLOR)
            </div>
            <div class="ie-props-row">
                <label>Brush</label>
                <span style="font-size:11px;color:var(--wfm-text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                    title="${t.brushName ?? "Circle"}">${t.brushName ?? "Circle"}</span>
                <button class="wfm-btn wfm-btn-sm" id="ie-draw-select-brush" style="font-size:10px;padding:1px 6px;flex-shrink:0;" ${this._abrAvailable ? "" : "disabled"}>Select</button>
                ${t.brushImage ? `<button class="wfm-btn wfm-btn-sm" id="ie-draw-clear-brush" style="font-size:10px;padding:1px 5px;flex-shrink:0;">✕</button>` : ""}
            </div>
            ${t.brushImage ? `
            <div class="ie-props-row">
                <label>Spacing</label>
                <input type="range" id="ie-draw-spacing" min="5" max="100" value="${Math.round((t.spacing ?? 0.25) * 100)}">
                <span id="ie-draw-spacing-lbl">${Math.round((t.spacing ?? 0.25) * 100)}%</span>
            </div>
            <div class="ie-props-row">
                <label>Angle</label>
                <input type="range" id="ie-draw-angle" min="0" max="359" value="${t.angle ?? 0}">
                <span id="ie-draw-angle-lbl">${t.angle ?? 0}°</span>
            </div>
            <div class="ie-props-row">
                <label>Sz Jitter</label>
                <input type="range" id="ie-draw-szjitter" min="0" max="100" value="${Math.round((t.sizeJitterAmount ?? 0.5) * 100)}">
                <span id="ie-draw-szjitter-lbl">${Math.round((t.sizeJitterAmount ?? 0.5) * 100)}%</span>
            </div>
            <div class="ie-props-row">
                <label>Rot. Jitter</label>
                <label style="cursor:pointer;font-size:11px;">
                    <input type="checkbox" id="ie-draw-rotjitter" ${t.rotationJitter ? "checked" : ""}> On
                </label>
            </div>` : ""}
        `;

        document.getElementById("ie-draw-mode-draw")?.addEventListener("click", () => {
            this._drawTool.mode = "draw";
            this._drawTool._stamp = null;
            this._renderDrawProps();
        });
        document.getElementById("ie-draw-mode-erase")?.addEventListener("click", () => {
            this._drawTool.mode = "erase";
            this._drawTool._stamp = null;
            this._renderDrawProps();
        });
        document.getElementById("ie-draw-color")?.addEventListener("input", e => {
            this._drawTool.color = e.target.value;
            this._drawTool._stamp = null;
            this._drawTool._imgStamp = null;
        });
        document.getElementById("ie-draw-size")?.addEventListener("input", e => {
            this._drawTool.brushSize = parseInt(e.target.value);
            document.getElementById("ie-draw-size-lbl").textContent = e.target.value + "px";
            this._drawTool._stamp = null;
        });
        document.getElementById("ie-draw-hard")?.addEventListener("input", e => {
            this._drawTool.hardness = parseInt(e.target.value) / 100;
            document.getElementById("ie-draw-hard-lbl").textContent = e.target.value + "%";
            this._drawTool._stamp = null;
        });
        document.getElementById("ie-draw-opacity")?.addEventListener("input", e => {
            this._drawTool.opacity = parseInt(e.target.value) / 100;
            document.getElementById("ie-draw-opacity-lbl").textContent = e.target.value + "%";
        });
        document.getElementById("ie-draw-select-brush")?.addEventListener("click", () => this._openAbrBrushPickerForDraw());
        document.getElementById("ie-draw-clear-brush")?.addEventListener("click", () => {
            this._drawTool?.clearImageBrush();
            this._renderDrawProps();
        });
        document.getElementById("ie-draw-spacing")?.addEventListener("input", e => {
            this._drawTool.spacing = parseInt(e.target.value) / 100;
            document.getElementById("ie-draw-spacing-lbl").textContent = e.target.value + "%";
        });
        document.getElementById("ie-draw-angle")?.addEventListener("input", e => {
            this._drawTool.angle = parseInt(e.target.value);
            document.getElementById("ie-draw-angle-lbl").textContent = e.target.value + "°";
        });
        document.getElementById("ie-draw-szjitter")?.addEventListener("input", e => {
            this._drawTool.sizeJitterAmount = parseInt(e.target.value) / 100;
            this._drawTool.sizeJitter = this._drawTool.sizeJitterAmount > 0;
            document.getElementById("ie-draw-szjitter-lbl").textContent = e.target.value + "%";
        });
        document.getElementById("ie-draw-rotjitter")?.addEventListener("change", e => {
            this._drawTool.rotationJitter = e.target.checked;
        });
    }

    // ── Mask Editor One 追加ツール: 初期化・切り替え ──────────────────────────

    _initMaskEditorOneTools() {
        if (this._maskColorTool) return; // 初期化済み
        const overlayCanvas = document.getElementById("ie-canvas-overlay");
        const onChange = () => { this._updateCompositeView(); this._refreshLayerList(); };

        this._maskColorTool  = new MaskColorTool();
        this._maskColorTool.onChange(onChange);

        this._maskAlphaTool  = new MaskAlphaTool();
        this._maskAlphaTool.onChange(onChange);

        this._maskTextTool   = new MaskTextTool();
        this._maskTextTool.onChange(onChange);

        this._maskVectorTool = new MaskVectorTool();
        this._maskVectorTool.setPreviewCanvas(overlayCanvas);
        this._maskVectorTool.onBeforeCommit = () => this._saveUndo();
        this._maskVectorTool.onChange(() => { onChange(); this._renderMaskProps("vector"); });

        this._maskShapeTool  = new MaskShapeTool();
        this._maskShapeTool.setPreviewCanvas(overlayCanvas);
        this._maskShapeTool.onChange(onChange);
    }

    _deactivateMaskSubtool() {
        const sub = this._maskSubtool;
        if (sub === "paint")  this._maskTool?.deactivate();
        if (sub === "color")  this._maskColorTool?.deactivate();
        if (sub === "alpha")  this._maskAlphaTool?.deactivate();
        if (sub === "text")   this._maskTextTool?.deactivate();
        if (sub === "vector") this._maskVectorTool?.deactivate();
        if (sub === "shape")  this._maskShapeTool?.deactivate();
    }

    _activateMaskSubtool() {
        const sub         = this._maskSubtool;
        const activeLayer = this._layerMgr?.activeLayer;
        const canvas      = activeLayer?.type === "mask" ? activeLayer.canvas : null;
        if (sub === "paint" && this._maskTool) {
            if (canvas) this._maskTool.setCanvas(canvas);
            this._maskTool.activate();
        } else if (sub === "color" && this._maskColorTool) {
            if (canvas) this._maskColorTool.setCanvas(canvas);
            this._maskColorTool.activate();
        } else if (sub === "alpha" && this._maskAlphaTool) {
            if (canvas) this._maskAlphaTool.setCanvas(canvas);
            this._maskAlphaTool.activate();
        } else if (sub === "text" && this._maskTextTool) {
            if (canvas) this._maskTextTool.setCanvas(canvas);
            this._maskTextTool.activate();
        } else if (sub === "vector" && this._maskVectorTool) {
            if (canvas) this._maskVectorTool.setCanvas(canvas);
            this._maskVectorTool.activate();
        } else if (sub === "shape" && this._maskShapeTool) {
            if (canvas) this._maskShapeTool.setCanvas(canvas);
            this._maskShapeTool.activate();
        }
    }

    _switchMaskSubtool(sub) {
        this._deactivateMaskSubtool();
        this._maskSubtool = sub;
        this._renderToolOptions("mask");
        this._activateMaskSubtool();
    }

    // マスクを除いた全表示レイヤーを合成した背景キャンバスを生成（ColorTool/AlphaTool 用）
    _buildBgCanvas() {
        const canvas = document.createElement("canvas");
        canvas.width  = this._canvasW;
        canvas.height = this._canvasH;
        if (!this._layerMgr) return canvas;
        const ctx    = canvas.getContext("2d");
        const layers = this._layerMgr.layers;
        for (let i = layers.length - 1; i >= 0; i--) {
            const layer = layers[i];
            if (!layer.visible || layer.type === "mask") continue;
            ctx.save();
            ctx.globalAlpha = layer.opacity;
            ctx.globalCompositeOperation = layer.blendMode;
            Layer.applyTransform(ctx, layer);
            ctx.drawImage(layer.canvas, -layer.canvas.width / 2, -layer.canvas.height / 2);
            ctx.restore();
        }
        return canvas;
    }

    // Comic Creator等、同一オリジンiframe越しの外部呼び出し専用エントリポイント。
    async runInpaintExternal(imageBlob, maskBlob, opts) {
        return this._inpaint.runExternal(imageBlob, maskBlob, opts);
    }

    // Comic Creator等、同一オリジンiframe越しの外部呼び出し専用エントリポイント（I2I版）。
    async runI2IExternal(imageBlob, opts) {
        return this._inpaint.runI2IExternal(imageBlob, opts);
    }

    _renderMaskLayerOverlay(ctx, maskLayer) {
        // アクティブなマスクレイヤーのみオーバーレイ表示（非アクティブなマスクは隠す）
        if (this._layerMgr?.activeLayer !== maskLayer) return;

        const overlayColor = this._maskOverlayColor;
        const blurPx       = this._maskBlur;
        const inverted     = this._maskInverted;

        const mw = maskLayer.canvas.width;
        const mh = maskLayer.canvas.height;

        const tmp = document.createElement("canvas");
        tmp.width  = mw;
        tmp.height = mh;
        const tc = tmp.getContext("2d");

        tc.fillStyle = overlayColor;
        tc.fillRect(0, 0, mw, mh);
        tc.globalCompositeOperation = inverted ? "destination-out" : "destination-in";
        tc.drawImage(maskLayer.canvas, 0, 0);
        tc.globalCompositeOperation = "source-over";

        ctx.save();
        ctx.globalAlpha = 0.55 * maskLayer.opacity;
        if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
        Layer.applyTransform(ctx, maskLayer);
        ctx.drawImage(tmp, -mw / 2, -mh / 2);
        ctx.restore();
        if (blurPx > 0) ctx.filter = "none";
    }

    // ── アクションバー ─────────────────────────────

    _setupActionBar() {
        document.getElementById("ie-upload-input")?.addEventListener("change", e => {
            const file = e.target.files?.[0];
            if (file) this._loadFile(file);
            e.target.value = "";
        });

        document.getElementById("ie-new-btn")?.addEventListener("click", () => this._newCanvas());
        document.getElementById("ie-undo-btn")?.addEventListener("click", () => this._undo());
        document.getElementById("ie-redo-btn")?.addEventListener("click", () => this._redo());
        document.getElementById("ie-save-btn")?.addEventListener("click", () => this._fileExport.savePng());
        document.getElementById("ie-save-gallery-btn")?.addEventListener("click", () => this._fileExport.saveToGallery());
        document.getElementById("ie-send-workflow-btn")?.addEventListener("click", () => this._fileExport.sendToWorkflow());
        document.getElementById("ie-zoom-fit")?.addEventListener("click", () => this._fitToView());
        document.getElementById("ie-zoom-100")?.addEventListener("click", () => {
            this._panOffset = { x: 0, y: 0 }; this._setZoom(1.0);
        });

        const tab = document.getElementById("wfm-tab-image-edit");
        if (tab) {
            tab.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
            tab.addEventListener("drop", e => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith("image/")) this._loadFile(file);
            });
        }
    }

    // ── Canvas イベント ───────────────────────────

    _setupCanvasEvents() {
        const wrap = document.getElementById("ie-canvas-wrap");
        if (!wrap) return;

        wrap.addEventListener("wheel", e => {
            e.preventDefault();
            this._setZoom(this._zoom * (e.deltaY > 0 ? 0.9 : 1.1));
        }, { passive: false });

        wrap.addEventListener("mousedown", e => {
            if (e.button === 1 || (e.button === 0 && this._spaceDown)) {
                e.preventDefault();
                this._panning  = true;
                this._panStart = { x: e.clientX - this._panOffset.x, y: e.clientY - this._panOffset.y };
                wrap.style.cursor = "grabbing";
                return;
            }
            // Draw/Mask: allow starting a stroke from the canvas margin area
            if (e.button !== 0) return;
            const tool = this._activeTool;
            if (tool !== "draw" && tool !== "mask") return;
            const drawCanvas   = document.getElementById("ie-canvas-draw");
            const overlayCanvas = document.getElementById("ie-canvas-overlay");
            // Skip if the event target is already a canvas — existing handlers cover that
            if (e.target === drawCanvas || e.target === overlayCanvas) return;
            if (!this._layerMgr || !drawCanvas) return;
            this._onToolMouseDown(e, drawCanvas);
        });
        window.addEventListener("mousemove", e => {
            if (this._panning) {
                this._panOffset.x = e.clientX - this._panStart.x;
                this._panOffset.y = e.clientY - this._panStart.y;
                this._applyTransform();
            }
            // Draw/Mask: update brush cursor and continue stroke outside canvas
            const tool = this._activeTool;
            if (tool === "draw" || tool === "mask") {
                this._updateBrushCursor(e);
                const isDrawing = tool === "draw"
                    ? this._drawTool?._drawing
                    : this._maskTool?._drawing;
                if (isDrawing) {
                    const refCanvas = document.getElementById("ie-canvas-draw");
                    if (refCanvas) this._onToolMouseMove(e, refCanvas);
                }
            }
        });
        window.addEventListener("mouseup", e => {
            if (this._panning && (e.button === 1 || e.button === 0)) {
                this._panning = false;
                wrap.style.cursor = this._spaceDown ? "grab" : "";
            }
            // Draw/Mask: end stroke from anywhere (including outside canvas)
            if (e.button === 0) {
                const tool = this._activeTool;
                if (tool === "draw" && this._drawTool?._drawing) this._drawTool.onMouseUp();
                if (tool === "mask" && this._maskTool?._drawing) this._maskTool.onMouseUp();
            }
        });

        // draw / text 用 mousedown
        const drawCanvas = document.getElementById("ie-canvas-draw");
        if (drawCanvas) {
            drawCanvas.addEventListener("mousedown",  e => this._onToolMouseDown(e, drawCanvas));
            drawCanvas.addEventListener("mousemove",  e => this._onToolMouseMove(e, drawCanvas));
            drawCanvas.addEventListener("mouseup",    e => this._onToolMouseUp(e));
            drawCanvas.addEventListener("mouseleave", () => this._onToolMouseLeave());
        }

        // select 用 mousedown（overlayCanvas）
        const overlay = document.getElementById("ie-canvas-overlay");
        if (overlay) {
            overlay.addEventListener("mousedown",  e => this._onToolMouseDown(e, overlay));
            overlay.addEventListener("mousemove",  e => this._onToolMouseMove(e, overlay));
            overlay.addEventListener("mouseup",    e => this._onToolMouseUp(e));
            overlay.addEventListener("mouseleave", () => this._onToolMouseLeave());
            // テキストオブジェクトのダブルクリックで再編集
            overlay.addEventListener("dblclick", e => this._onOverlayDblClick(e, overlay));
        }
    }

    _onToolMouseDown(e, refCanvas) {
        if (!this._layerMgr || e.button !== 0 || this._spaceDown) return;
        const pos = DrawTool.getCanvasPos(refCanvas, e);

        if (this._activeTool === "draw" && this._drawTool) {
            const activeLayer = this._layerMgr.activeLayer;
            if (!activeLayer) return;
            this._saveUndo();
            this._drawTool.setCanvas(activeLayer.canvas);
            this._drawTool.onMouseDown(pos.x, pos.y);
            this._updateCompositeView();

        } else if (this._activeTool === "mask") {
            const activeLayer = this._layerMgr.activeLayer;
            if (!activeLayer || activeLayer.type !== "mask") {
                showToast("Select a mask layer first", "info");
                return;
            }
            const sub = this._maskSubtool;
            if (sub === "paint" && this._maskTool) {
                this._saveUndo();
                this._maskTool.setCanvas(activeLayer.canvas);
                this._maskTool.onMouseDown(pos.x, pos.y);
                this._updateCompositeView();
            } else if (sub === "color" && this._maskColorTool) {
                this._saveUndo();
                this._maskColorTool.setCanvas(activeLayer.canvas);
                this._maskColorTool.setBgCanvas(this._buildBgCanvas());
                this._maskColorTool.onMouseDown(pos.x, pos.y);
                this._updateCompositeView();
                this._refreshLayerList();
            } else if (sub === "text" && this._maskTextTool) {
                this._maskTextTool.setCanvas(activeLayer.canvas);
                this._maskTextTool.onMouseDown(pos.x, pos.y);
            } else if (sub === "vector" && this._maskVectorTool) {
                this._maskVectorTool.setCanvas(activeLayer.canvas);
                this._maskVectorTool.onMouseDown(pos.x, pos.y);
                this._renderMaskProps("vector");
            } else if (sub === "shape" && this._maskShapeTool) {
                this._saveUndo();
                this._maskShapeTool.setCanvas(activeLayer.canvas);
                this._maskShapeTool.onMouseDown(pos.x, pos.y);
            }

        } else if (this._activeTool === "shape" && this._shapeTool) {
            this._shapeTool.onMouseDown(pos.x, pos.y);

        } else if (this._activeTool === "text" && this._textTool) {
            // undo・drawCanvasリセットはテキスト確定時（onChange）で行う
            this._textTool.onMouseDown(pos.x, pos.y);

        } else if (this._activeTool === "select" && this._selectTool) {
            const result = this._selectTool.onMouseDown(pos.x, pos.y, this._layerMgr);
            if (result === "select") {
                const sel = this._selectTool.getSelectedLayer();
                if (sel) { this._layerMgr.setActive(sel.id); this._refreshLayerList(); }
            } else if (result && result !== null) {
                // move / resize / rotate → undo を事前に保存
                this._saveUndo();
            }
        } else if (this._activeTool === "blur") {
            this._blurTool.onMouseDown(pos);
        }
    }

    _onToolMouseMove(e, refCanvas) {
        if (!this._layerMgr) return;
        const pos = DrawTool.getCanvasPos(refCanvas, e);
        if (this._activeTool === "draw") {
            this._drawTool?.onMouseMove(pos.x, pos.y);
            if (this._drawTool?._drawing) this._updateCompositeView();
        }
        if (this._activeTool === "mask") {
            const sub = this._maskSubtool;
            if (sub === "paint") {
                this._maskTool?.onMouseMove(pos.x, pos.y);
                if (this._maskTool?._drawing) this._updateCompositeView();
            } else if (sub === "vector") {
                this._maskVectorTool?.onMouseMove(pos.x, pos.y);
            } else if (sub === "shape") {
                this._maskShapeTool?.onMouseMove(pos.x, pos.y, e);
            }
        }
        if (this._activeTool === "shape")  this._shapeTool?.onMouseMove(pos.x, pos.y);
        if (this._activeTool === "select") this._selectTool?.onMouseMove(pos.x, pos.y);
        if (this._activeTool === "blur") this._blurTool.onMouseMove(pos);
    }

    _onToolMouseUp(e) {
        if (!this._layerMgr || e.button !== 0) return;
        if (this._activeTool === "draw")   this._drawTool?.onMouseUp();
        if (this._activeTool === "mask") {
            const sub = this._maskSubtool;
            if (sub === "paint") this._maskTool?.onMouseUp();
            else if (sub === "shape") {
                const activeLayer = this._layerMgr?.activeLayer;
                if (activeLayer?.type === "mask") {
                    this._maskShapeTool?.onMouseUp();
                    this._updateCompositeView();
                    this._refreshLayerList();
                }
            }
        }
        if (this._activeTool === "shape")  this._shapeTool?.onMouseUp();
        if (this._activeTool === "select") this._selectTool?.onMouseUp();
        if (this._activeTool === "blur") this._blurTool.onMouseUp();
    }

    _onToolMouseLeave() {
        // Draw/Mask: do NOT stop the stroke — window mousemove/mouseup continue tracking
        this._hideBrushCursor();
        if (this._activeTool === "shape")  this._shapeTool?.onMouseLeave();
        if (this._activeTool === "select") this._selectTool?.onMouseLeave();
        if (this._activeTool === "mask" && this._maskSubtool === "vector") this._maskVectorTool?.onMouseLeave();
        if (this._activeTool === "blur") this._blurTool.onMouseLeave();
    }

    // ── 画像ロード ────────────────────────────────

    async _loadFile(file) {
        const dataUrl = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
        await this._loadFromDataUrl(dataUrl, file.name.replace(/\.[^.]+$/, ""));
    }

    async _loadFromDataUrl(dataUrl, baseName = "image") {
        const img = await new Promise(resolve => {
            const i = new Image();
            i.onload  = () => resolve(i);
            i.onerror = () => resolve(null);
            i.src = dataUrl;
        });
        if (!img) { showToast("Failed to load image", "error"); return; }

        const hasLayers = this._layerMgr && this._layerMgr.layers.length > 0;

        if (hasLayers) {
            // 既存キャンバスに画像オブジェクトとして追加（キャンバスにフィット）
            this._syncActiveLayerFromCanvas();
            this._saveUndo();
            const fit = fitToCanvas(img.width, img.height, this._canvasW, this._canvasH);
            const newLayer = this._layerMgr.addLayer("image", baseName, {
                contentW: img.width, contentH: img.height,
                displayW: fit.w,     displayH: fit.h,
                x: Math.round((this._canvasW - fit.w) / 2),
                y: Math.round((this._canvasH - fit.h) / 2),
            });
            newLayer.ctx.drawImage(img, 0, 0);
            // 新しいオブジェクトをSelectToolで選択
            this._layerMgr.setActive(newLayer.id);
            if (this._activeTool !== "select") this._setActiveTool("select");
            this._selectTool?.setLayer(newLayer);
            this._updateCompositeView();
            this._refreshLayerList();
            document.getElementById("ie-placeholder").style.display = "none";
            showToast(`Image added: ${img.width}×${img.height}`, "success");
            return;
        }

        // 新規キャンバス（Layer 1に画像配置）
        this._canvasW  = img.width;
        this._canvasH  = img.height;
        this._baseName = baseName;
        this._initCanvases();

        const layer1 = this._layerMgr.addLayer("image", "Layer 1", {
            contentW: img.width, contentH: img.height,
            displayW: img.width, displayH: img.height,
            x: 0, y: 0,
        });
        layer1.ctx.drawImage(img, 0, 0);
        layer1.locked = true; // 初期画像は誤操作防止のため自動ロック

        this._undoStack = [];
        this._redoStack = [];

        this._setActiveTool("select");
        this._selectTool?.setLayer(layer1);
        this._refreshLayerList();
        this._updateCompositeView();
        this._fitToView();

        document.getElementById("ie-placeholder").style.display = "none";
        showToast(`Loaded: ${img.width}×${img.height}`, "success");
    }

    _newCanvas() {
        const current = `${this._canvasW || 512}x${this._canvasH || 512}`;
        const input   = prompt("Canvas size (WxH):", current);
        if (!input) return;
        const m = input.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
        if (!m) { showToast("Invalid format. Use WxH (e.g. 512x512)", "error"); return; }
        const w = parseInt(m[1]), h = parseInt(m[2]);
        if (w < 1 || h < 1 || w > 8192 || h > 8192) { showToast("Size must be between 1 and 8192", "error"); return; }

        this._canvasW  = w;
        this._canvasH  = h;
        this._baseName = "new-canvas";
        this._initCanvases();
        const layer1 = this._layerMgr.addLayer("draw", "Layer 1");
        this._layerMgr.setActive(layer1.id);
        this._undoStack = [];
        this._redoStack = [];
        this._setActiveTool("select");
        this._selectTool?.setLayer(layer1);
        this._refreshLayerList();
        this._updateCompositeView();
        this._fitToView();

        document.getElementById("ie-placeholder").style.display = "none";
        showToast(`New canvas: ${w}×${h}`, "success");
    }

    _initCanvases() {
        const drawCanvas    = document.getElementById("ie-canvas-draw");
        const overlayCanvas = document.getElementById("ie-canvas-overlay");
        if (drawCanvas) { drawCanvas.width = this._canvasW; drawCanvas.height = this._canvasH; }
        if (overlayCanvas) { overlayCanvas.width = this._canvasW; overlayCanvas.height = this._canvasH; }

        const container = document.getElementById("ie-canvas-container");
        if (container) {
            container.style.width  = this._canvasW + "px";
            container.style.height = this._canvasH + "px";
        }

        this._layerMgr = new LayerManager(this._canvasW, this._canvasH);
        this._layerMgr.on("change", () => this._refreshLayerList());

        this._drawTool = new DrawTool(null);
        this._drawTool.onChange(() => {
            // layer.canvas に直接描くため sync 不要
            this._updateCompositeView();
            this._refreshLayerList();
        });

        this._textTool = new TextTool(drawCanvas);
        this._textTool.onChange((clickX, clickY) => {
            const data  = this._textTool.createLayerData(clickX, clickY);
            const props = {
                text:       this._textTool.text,
                fontFamily: this._textTool.fontFamily,
                fontSize:   this._textTool.fontSize,
                bold:       this._textTool.bold,
                italic:     this._textTool.italic,
                align:      this._textTool.align,
                color:      this._textTool.color,
                nativeW:    data.width,
                nativeH:    data.height,
            };
            const label = (props.text.slice(0, 20).replace(/\n/g, " ").trim()) || "Text";

            if (this._editingTextLayer) {
                // 既存テキストレイヤーの再編集
                const layer = this._editingTextLayer;
                this._editingTextLayer = null;
                this._saveUndo();
                layer.name      = label;
                layer.textProps = props;
                // ネイティブサイズで canvas を再生成
                layer.canvas.width  = data.width;
                layer.canvas.height = data.height;
                layer.ctx = layer.canvas.getContext("2d");
                layer.ctx.drawImage(data.canvas, 0, 0);
                // displayサイズもネイティブサイズに戻す
                layer.displayW = data.width;
                layer.displayH = data.height;
                this._selectTool?.setLayer(layer);
                this._updateCompositeView();
                this._refreshLayerList();
                return;
            }

            // 新規テキストレイヤーを追加
            this._saveUndo();
            const textLayer = this._layerMgr.addLayer("text", label, {
                contentW: data.width,  contentH: data.height,
                displayW: data.width,  displayH: data.height,
                x: Math.round(data.x), y: Math.round(data.y),
            });
            textLayer.ctx.drawImage(data.canvas, 0, 0);
            textLayer.textProps = props;
            this._layerMgr.setActive(textLayer.id);
            this._setActiveTool("select");
            this._selectTool?.setLayer(textLayer);
            this._updateCompositeView();
            this._refreshLayerList();
        });

        this._shapeTool = new ShapeTool();
        this._shapeTool.onChange(shapeObj => {
            this._saveUndo();
            const layerName = `Shape ${this._layerMgr.layers.length + 1}`;
            const layer = this._layerMgr.addLayer("draw", layerName, {
                contentW: this._canvasW, contentH: this._canvasH,
                displayW: this._canvasW, displayH: this._canvasH,
                x: 0, y: 0,
            });
            ShapeTool.drawShape(layer.ctx, shapeObj);
            this._layerMgr.setActive(layer.id);
            this._updateCompositeView();
            this._refreshLayerList();
        });

        this._selectTool = new SelectTool();
        this._selectTool.setCanvas(overlayCanvas);
        this._selectTool.onChange(eventType => {
            if (eventType === "transformEnd") {
                // テキストレイヤーをリサイズ後の displayW/H で再描画（ぼやけ防止）
                const sel = this._selectTool.getSelectedLayer();
                if (sel?.type === "text" && sel.textProps) {
                    this._rerenderTextLayer(sel);
                }
                this._refreshLayerList();
            }
            this._updateCompositeView();
        });

        this._maskTool = new MaskTool(null);
        this._maskTool.onChange(() => {
            // layer.canvas に直接描くため sync 不要
            this._updateCompositeView();
            this._refreshLayerList();
        });

        this._compositeMode = false;
    }

    // drawCanvas ← activeLayerのみ（描画前リセット、compositeMode = false）
    _loadActiveLayerToCanvas() {
        const layer      = this._layerMgr?.activeLayer;
        const drawCanvas = document.getElementById("ie-canvas-draw");
        if (!layer || !drawCanvas) return;
        // draw レイヤーのみ対象（image/textオブジェクトには使わない）
        const ctx = drawCanvas.getContext("2d");
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        // DrawLayerは変換なし（x=0, y=0, displayW=canvasW でスケール1:1）で描画
        ctx.drawImage(layer.canvas, 0, 0,
            layer.displayW, layer.displayH,
            layer.x, layer.y,
            layer.displayW, layer.displayH);
        this._compositeMode = false;
    }

    // drawCanvas → activeLayer に保存（compositeMode=true時はスキップ）
    _syncActiveLayerFromCanvas() {
        if (this._compositeMode) return;
        const layer      = this._layerMgr?.activeLayer;
        const drawCanvas = document.getElementById("ie-canvas-draw");
        if (!layer || !drawCanvas) return;
        layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        // スケールの逆変換でdrawCanvasの内容をlayer.canvasに戻す
        const scaleX = layer.canvas.width  / layer.displayW;
        const scaleY = layer.canvas.height / layer.displayH;
        layer.ctx.save();
        layer.ctx.scale(scaleX, scaleY);
        layer.ctx.drawImage(drawCanvas, -layer.x * scaleX, -layer.y * scaleY);
        layer.ctx.restore();
    }

    // 全可視レイヤーを変換付きで合成 → drawCanvas（compositeMode = true）
    _updateCompositeView() {
        const drawCanvas = document.getElementById("ie-canvas-draw");
        if (!drawCanvas || !this._layerMgr) return;
        const ctx = drawCanvas.getContext("2d");
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

        const layers = this._layerMgr.layers;
        // layers[0]=front … layers[n-1]=back、走査は back→front

        // 前処理: 連続する maskApply=true マスクグループを検出
        // グループの front 側インデックス → { masks: Layer[], target: Layer, targetIdx }
        const maskGroupMap = new Map();
        const skipIndices  = new Set();
        let i = 0;
        while (i < layers.length) {
            if (layers[i].type === "mask" && layers[i].maskApply) {
                const frontIdx = i;
                const masks = [];
                while (i < layers.length && layers[i].type === "mask" && layers[i].maskApply) {
                    masks.push(layers[i]);
                    skipIndices.add(i);
                    i++;
                }
                if (i < layers.length) {
                    maskGroupMap.set(frontIdx, { masks, target: layers[i], targetIdx: i });
                    skipIndices.add(i); // ターゲットもグループ処理でまとめて描画
                } else {
                    // ターゲットなし（末尾）→ グループをオーバーレイ表示のみ
                    maskGroupMap.set(frontIdx, { masks, target: null, targetIdx: -1 });
                }
            } else {
                i++;
            }
        }

        for (let j = layers.length - 1; j >= 0; j--) {
            if (skipIndices.has(j)) {
                // マスクグループの front に到達したらグループ全体を描画
                if (maskGroupMap.has(j)) {
                    const group = maskGroupMap.get(j);
                    this._renderMaskGroup(ctx, drawCanvas, group.masks, group.target);
                }
                continue;
            }
            const layer = layers[j];
            if (!layer.visible) continue;

            if (layer.type === "mask") {
                // maskApply=false のマスクはオーバーレイ表示のみ
                this._renderMaskLayerOverlay(ctx, layer);
            } else {
                ctx.save();
                ctx.globalAlpha = layer.opacity;
                ctx.globalCompositeOperation = layer.blendMode;
                Layer.applyTransform(ctx, layer);
                ctx.drawImage(layer.canvas, -layer.canvas.width / 2, -layer.canvas.height / 2);
                ctx.restore();
            }
        }
        this._compositeMode = true;
    }

    _renderMaskGroup(ctx, drawCanvas, maskLayers, targetLayer) {
        const W = drawCanvas.width;
        const H = drawCanvas.height;

        // ターゲットなし → オーバーレイ表示のみ
        if (!targetLayer) {
            for (const ml of maskLayers) {
                if (ml.visible) this._renderMaskLayerOverlay(ctx, ml);
            }
            return;
        }

        // 1. マスクグループを合成（Mask Editor One CanvasCompositor と同ロジック）
        //    maskLayers は front→back 順なので back→front（逆順）で合成
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width  = W;
        maskCanvas.height = H;
        const mc = maskCanvas.getContext("2d");
        for (let k = maskLayers.length - 1; k >= 0; k--) {
            const ml = maskLayers[k];
            if (!ml.visible) continue;
            mc.save();
            mc.globalAlpha = ml.opacity;
            mc.globalCompositeOperation = ml.operation === "subtract" ? "destination-out" : "lighten";
            Layer.applyTransform(mc, ml);
            mc.drawImage(ml.canvas, -ml.canvas.width / 2, -ml.canvas.height / 2);
            mc.restore();
        }

        // 2. 合成マスクでターゲットレイヤーをクリップ
        const tmp = document.createElement("canvas");
        tmp.width  = W;
        tmp.height = H;
        const tc = tmp.getContext("2d");
        if (targetLayer.visible) {
            tc.save();
            tc.globalAlpha = targetLayer.opacity;
            tc.globalCompositeOperation = targetLayer.blendMode;
            Layer.applyTransform(tc, targetLayer);
            tc.drawImage(targetLayer.canvas, -targetLayer.canvas.width / 2, -targetLayer.canvas.height / 2);
            tc.restore();
        }
        tc.globalCompositeOperation = this._maskInverted ? "destination-out" : "destination-in";
        tc.drawImage(maskCanvas, 0, 0);

        ctx.drawImage(tmp, 0, 0);

        // 3. 全マスクレイヤーのオーバーレイ表示
        for (const ml of maskLayers) {
            if (ml.visible) this._renderMaskLayerOverlay(ctx, ml);
        }
    }

    _renderMaskedLayer(ctx, drawCanvas, maskLayer, targetLayer, showOverlay = true) {
        const W = drawCanvas.width;
        const H = drawCanvas.height;
        const tmp = document.createElement("canvas");
        tmp.width  = W;
        tmp.height = H;
        const tc = tmp.getContext("2d");

        if (targetLayer.visible) {
            tc.save();
            tc.globalAlpha = targetLayer.opacity;
            tc.globalCompositeOperation = targetLayer.blendMode;
            Layer.applyTransform(tc, targetLayer);
            tc.drawImage(targetLayer.canvas, -targetLayer.canvas.width / 2, -targetLayer.canvas.height / 2);
            tc.restore();
        }

        tc.save();
        tc.globalCompositeOperation = this._maskInverted ? "destination-out" : "destination-in";
        Layer.applyTransform(tc, maskLayer);
        tc.drawImage(maskLayer.canvas, -maskLayer.canvas.width / 2, -maskLayer.canvas.height / 2);
        tc.restore();

        ctx.save();
        ctx.drawImage(tmp, 0, 0);
        ctx.restore();

        if (showOverlay) {
            this._renderMaskLayerOverlay(ctx, maskLayer);
        }
    }

    // ── ズーム・パン ──────────────────────────────

    _fitToView() {
        const wrap = document.getElementById("ie-canvas-wrap");
        if (!wrap || !this._canvasW) return;
        this._zoom      = Math.min((wrap.clientWidth - 40) / this._canvasW, (wrap.clientHeight - 40) / this._canvasH, 2.0);
        this._panOffset = { x: 0, y: 0 };
        this._applyTransform();
    }

    _setZoom(z) {
        this._zoom = Math.max(0.05, Math.min(10, z));
        this._applyTransform();
    }

    _applyTransform() {
        const container = document.getElementById("ie-canvas-container");
        const wrap      = document.getElementById("ie-canvas-wrap");
        if (!container || !wrap) return;
        const tx = this._panOffset.x + (wrap.clientWidth  - this._canvasW * this._zoom) / 2;
        const ty = this._panOffset.y + (wrap.clientHeight - this._canvasH * this._zoom) / 2;
        container.style.transform = `translate(${tx}px,${ty}px) scale(${this._zoom})`;
        const zl = document.getElementById("ie-zoom-label");
        if (zl) zl.textContent = Math.round(this._zoom * 100) + "%";
    }

    // ── レイヤーパネル ────────────────────────────

    _setupLayerPanel() {
        document.getElementById("ie-add-layer-btn")?.addEventListener("click", () => {
            if (!this._layerMgr) return;
            this._syncActiveLayerFromCanvas();
            this._saveUndo();
            const layer = this._layerMgr.addLayer("draw", `Layer ${this._layerMgr.layers.length + 1}`);
            // 新しいdrawレイヤーはキャンバスサイズ全体をカバー
            layer.displayW = this._canvasW; layer.displayH = this._canvasH;
            layer.x = 0; layer.y = 0;
            this._loadActiveLayerToCanvas();
            this._updateCompositeView();
            this._activateCurrentTool();
        });

        document.getElementById("ie-add-mask-btn")?.addEventListener("click", () => {
            if (!this._layerMgr) { showToast("Open an image first", "info"); return; }
            this._syncActiveLayerFromCanvas();
            this._saveUndo();
            const maskCount = this._layerMgr.layers.filter(l => l.type === "mask").length + 1;
            const layer = this._layerMgr.addLayer("mask", `Mask ${maskCount}`);
            layer.displayW = this._canvasW;
            layer.displayH = this._canvasH;
            layer.x = 0;
            layer.y = 0;
            this._layerMgr.setActive(layer.id);
            this._setActiveTool("mask");
            this._loadActiveLayerToCanvas();
            this._updateCompositeView();
            this._refreshLayerList();
            document.getElementById("ie-placeholder").style.display = "none";
            showToast("Mask layer added", "success");
        });

        document.getElementById("ie-del-layer-btn")?.addEventListener("click", () => {
            if (!this._layerMgr || this._layerMgr.layers.length <= 1) return;
            this._saveUndo();
            const active = this._layerMgr.activeLayer;
            if (active) this._layerMgr.deleteLayer(active.id);
            if (this._selectTool?.getSelectedLayer()?.id === active?.id) {
                this._selectTool.clearSelection();
            }
            this._updateCompositeView();
            this._activateCurrentTool();
        });

        document.getElementById("ie-layer-up-btn")?.addEventListener("click", () => {
            if (!this._layerMgr) return;
            const active = this._layerMgr.activeLayer;
            if (active) { this._layerMgr.moveUp(active.id); this._updateCompositeView(); }
        });

        document.getElementById("ie-layer-down-btn")?.addEventListener("click", () => {
            if (!this._layerMgr) return;
            const active = this._layerMgr.activeLayer;
            if (active) { this._layerMgr.moveDown(active.id); this._updateCompositeView(); }
        });

        document.getElementById("ie-layer-opacity")?.addEventListener("input", e => {
            if (!this._layerMgr) return;
            const v = parseInt(e.target.value) / 100;
            const active = this._layerMgr.activeLayer;
            if (active) { this._layerMgr.setOpacity(active.id, v); this._updateCompositeView(); }
            const lbl = document.getElementById("ie-layer-opacity-label");
            if (lbl) lbl.textContent = e.target.value + "%";
        });
    }

    _refreshLayerList() {
        const el = document.getElementById("ie-layer-list");
        if (!el || !this._layerMgr) return;

        el.innerHTML = this._layerMgr.layers.map((layer, i) => {
            const isActive = i === this._layerMgr.activeIndex;
            const typeIcon = layer.type === "image" ? "🖼"
                : layer.type === "text" ? "T"
                : layer.type === "mask" ? "⬚"
                : "✏";
            const maskApplyBtn = layer.type === "mask"
                ? `<button class="ie-layer-vis-btn" data-id="${layer.id}" data-action="mask-apply"
                        title="${layer.maskApply ? "Disable clipping mask" : "Enable as clipping mask"}"
                        style="color:${layer.maskApply ? "var(--wfm-primary,#4682e6)" : "inherit"};font-size:11px;">✂</button>
                   <button class="ie-layer-vis-btn" data-id="${layer.id}" data-action="mask-op"
                        title="${layer.operation === "subtract" ? "Mode: Subtract (click to switch to Add)" : "Mode: Add (click to switch to Subtract)"}"
                        style="font-size:10px;font-weight:bold;min-width:16px;color:${layer.operation === "subtract" ? "#e2534a" : "#4db84d"};">${layer.operation === "subtract" ? "S" : "A"}</button>`
                : "";
            return `
                <div class="ie-layer-item ${isActive ? "active" : ""}" data-id="${layer.id}" data-action="select" data-type="${layer.type}">
                    <button class="ie-layer-vis-btn" data-id="${layer.id}" data-action="vis"
                        title="${layer.visible ? "Hide" : "Show"}">${layer.visible ? "👁" : "🚫"}</button>
                    <button class="ie-layer-vis-btn" data-id="${layer.id}" data-action="lock"
                        title="${layer.locked ? "Unlock" : "Lock"}"
                        style="color:${layer.locked ? "#e2a04a" : "inherit"}">${layer.locked ? "🔒" : "🔓"}</button>
                    ${maskApplyBtn}
                    <img class="ie-layer-thumb" src="${layer.getThumbnailDataURL()}" draggable="false">
                    <span class="ie-layer-type-icon" style="font-size:10px;opacity:0.7;flex-shrink:0;">${typeIcon}</span>
                    <span class="ie-layer-name">${layer.name}</span>
                </div>
            `;
        }).join("");

        el.querySelectorAll("[data-action]").forEach(node => {
            node.addEventListener("click", e => {
                e.stopPropagation();
                const id     = node.dataset.id;
                const action = node.dataset.action;
                if (action === "vis") {
                    this._layerMgr.toggleVisible(id);
                    this._updateCompositeView();
                } else if (action === "mask-apply") {
                    this._layerMgr.toggleMaskApply(id);
                    this._updateCompositeView();
                    this._refreshLayerList();
                } else if (action === "mask-op") {
                    this._layerMgr.toggleOperation(id);
                    this._updateCompositeView();
                    this._refreshLayerList();
                } else if (action === "lock") {
                    this._layerMgr.toggleLocked(id);
                    // ロック変更はSelectToolのオーバーレイを再描画
                    const sel = this._selectTool?.getSelectedLayer();
                    if (sel?.id === id) this._selectTool?.setLayer(sel);
                    this._refreshLayerList();
                } else if (action === "select") {
                    this._syncActiveLayerFromCanvas();
                    this._layerMgr.setActive(id);
                    const layer = this._layerMgr.activeLayer;
                    if (layer?.type === "mask") {
                        if (this._activeTool !== "mask") {
                            this._setActiveTool("mask");
                        } else {
                            // すでにマスクツール選択中 → canvas だけ切り替え
                            this._maskTool?.setCanvas(layer.canvas);
                            this._maskTool?.activate();
                        }
                        // operation に合わせて MaskTool の mode を同期
                        if (this._maskTool) {
                            this._maskTool.mode = layer.operation === "subtract" ? "erase" : "paint";
                            this._renderToolOptions("mask");
                        }
                        this._updateCompositeView();
                    } else if (this._activeTool === "draw" && layer) {
                        this._drawTool?.setCanvas(layer.canvas);
                        this._updateCompositeView();
                    } else if (this._activeTool === "select" && layer) {
                        this._selectTool?.setLayer(layer);
                        this._updateCompositeView();
                    } else {
                        this._updateCompositeView();
                    }
                    this._refreshLayerList();
                    if (layer) {
                        const sl = document.getElementById("ie-layer-opacity");
                        const lb = document.getElementById("ie-layer-opacity-label");
                        if (sl) sl.value = Math.round(layer.opacity * 100);
                        if (lb) lb.textContent = Math.round(layer.opacity * 100) + "%";
                    }
                }
            });
        });
    }

    // ── Undo / Redo ──────────────────────────────

    _saveUndo() {
        if (!this._layerMgr) return;
        this._syncActiveLayerFromCanvas();
        const state = JSON.stringify(this._layerMgr.toJSON());
        this._undoStack.push(state);
        if (this._undoStack.length > UNDO_LIMIT) this._undoStack.shift();
        this._redoStack = [];
    }

    async _undo() {
        if (!this._layerMgr || this._undoStack.length === 0) return;
        this._syncActiveLayerFromCanvas();
        this._redoStack.push(JSON.stringify(this._layerMgr.toJSON()));
        await this._restoreState(this._undoStack.pop());
    }

    async _redo() {
        if (!this._layerMgr || this._redoStack.length === 0) return;
        this._syncActiveLayerFromCanvas();
        this._undoStack.push(JSON.stringify(this._layerMgr.toJSON()));
        await this._restoreState(this._redoStack.pop());
    }

    async _restoreState(jsonStr) {
        const json = JSON.parse(jsonStr);
        await this._layerMgr.fromJSON(json);
        this._selectTool?.clearSelection();
        this._updateCompositeView();
        this._activateCurrentTool();
        this._refreshLayerList();
    }


    /** ギャラリーなど外部から画像URLをロード */
    async loadFromUrl(url, name) {
        try {
            const r       = await fetch(url);
            const blob    = await r.blob();
            const dataUrl = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.readAsDataURL(blob);
            });
            await this._loadFromDataUrl(dataUrl, name || url.split("/").pop().replace(/\.[^.]+$/, "") || "gallery-image");
        } catch {
            showToast("Failed to load image from URL", "error");
        }
    }

    // ── キーボードショートカット ──────────────────

    _setupKeyboard() {
        document.addEventListener("keydown", e => {
            if (!document.getElementById("wfm-tab-image-edit")?.classList.contains("active")) return;
            if (e.key === " " && !e.target.closest("input, textarea, select")) {
                e.preventDefault();
                this._spaceDown = true;
                const wrap = document.getElementById("ie-canvas-wrap");
                if (wrap && !this._panning) wrap.style.cursor = "grab";
            }
            if (e.ctrlKey && e.key === "z") { e.preventDefault(); this._undo(); }
            if (e.ctrlKey && e.key === "y") { e.preventDefault(); this._redo(); }
            if (this._activeTool === "mask" && this._maskSubtool === "vector") {
                this._maskVectorTool?.onKeyDown(e);
            }
            if (!e.ctrlKey && !e.target.closest("input, textarea, select")) {
                if (e.key === "v") this._setActiveTool("select");
                if (e.key === "b") this._setActiveTool("draw");
                if (e.key === "t") this._setActiveTool("text");
                if (e.key === "s") this._setActiveTool("shape");
                // Delete/Backspaceで選択オブジェクト削除
                if ((e.key === "Delete" || e.key === "Backspace") && this._activeTool === "select") {
                    const layer = this._selectTool?.getSelectedLayer();
                    if (layer && this._layerMgr && this._layerMgr.layers.length > 1) {
                        this._saveUndo();
                        this._selectTool.clearSelection();
                        this._layerMgr.deleteLayer(layer.id);
                        this._updateCompositeView();
                    }
                }
            }
        });

        document.addEventListener("keyup", e => {
            if (e.key === " ") {
                this._spaceDown = false;
                if (!this._panning) {
                    const wrap = document.getElementById("ie-canvas-wrap");
                    if (wrap) wrap.style.cursor = "";
                }
            }
        });
    }

    // ── テキストオブジェクト再編集 ────────────────────

    /** overlayCanvas のダブルクリック: テキストレイヤー選択中なら再編集 */
    _onOverlayDblClick(e, refCanvas) {
        if (!this._layerMgr || this._activeTool !== "select") return;
        const pos   = DrawTool.getCanvasPos(refCanvas, e);
        const layer = this._selectTool?.getSelectedLayer();
        if (!layer || !this._selectTool._isPointInLayer(pos.x, pos.y, layer)) return;
        if (layer.type === "text" && layer.textProps) {
            this._openTextEditForLayer(layer, pos.x, pos.y);
        }
    }

    /** textProps を TextTool にセットしてオーバーレイを開く */
    _openTextEditForLayer(layer, canvasX, canvasY) {
        const p = layer.textProps;
        this._textTool.text       = p.text;
        this._textTool.fontFamily = p.fontFamily;
        this._textTool.fontSize   = p.fontSize;
        this._textTool.bold       = p.bold;
        this._textTool.italic     = p.italic;
        this._textTool.align      = p.align;
        this._textTool.color      = p.color;
        this._editingTextLayer    = layer;
        this._textTool.openAt(canvasX, canvasY);
    }

    /**
     * テキストレイヤーを displayW/H サイズで再描画する（拡大縮小後のぼやけ防止）。
     * canvas.width = displayW にするため applyTransform のスケールは常に 1:1 になる。
     */
    _rerenderTextLayer(layer) {
        const p = layer.textProps;
        if (!p) return;

        const newW = Math.max(1, Math.round(layer.displayW));
        const newH = Math.max(1, Math.round(layer.displayH));
        const sx   = newW / p.nativeW;
        const sy   = newH / p.nativeH;

        layer.canvas.width  = newW;
        layer.canvas.height = newH;
        layer.ctx = layer.canvas.getContext("2d");

        const font = [
            p.italic ? "italic" : "",
            p.bold   ? "bold"   : "",
            `${p.fontSize}px`,
            `"${p.fontFamily}", sans-serif`,
        ].filter(Boolean).join(" ");

        const lines = p.text.split("\n");
        const lineH = p.fontSize * 1.2;
        const pad   = 4;

        const ctx = layer.ctx;
        ctx.save();
        ctx.scale(sx, sy);
        ctx.font         = font;
        ctx.fillStyle    = p.color;
        ctx.textBaseline = "top";
        ctx.textAlign    = p.align;

        let drawX = pad;
        if (p.align === "center") drawX = p.nativeW / 2;
        else if (p.align === "right") drawX = p.nativeW - pad;

        lines.forEach((line, i) => {
            ctx.fillText(line, drawX, pad + i * lineH);
        });
        ctx.restore();
    }

    _openAbrBrushPicker() {
        const existing = document.getElementById("wfm-abr-picker-overlay");
        if (existing) { existing.remove(); return; }

        const overlay = document.createElement("div");
        overlay.id = "wfm-abr-picker-overlay";
        Object.assign(overlay.style, {
            position: "fixed", inset: "0",
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: "99999",
        });

        const modal = document.createElement("div");
        Object.assign(modal.style, {
            background: "var(--wfm-surface, #2a2a2a)",
            border: "1px solid var(--wfm-border, #444)",
            borderRadius: "8px",
            width: "640px", height: "460px",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            color: "var(--wfm-text, #ddd)",
            fontFamily: "sans-serif",
        });

        // Header
        const header = document.createElement("div");
        Object.assign(header.style, {
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px",
            borderBottom: "1px solid var(--wfm-border, #444)",
            fontWeight: "bold", fontSize: "13px", flexShrink: "0",
        });
        const headerTitle = document.createElement("span");
        headerTitle.textContent = "ABR Brush Library (Mask Editor One)";
        const closeBtn = document.createElement("button");
        closeBtn.textContent = "×";
        closeBtn.className = "wfm-btn wfm-btn-sm";
        closeBtn.style.cssText = "font-size:16px;padding:0 6px;";
        closeBtn.onclick = () => overlay.remove();
        header.appendChild(headerTitle);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        // Body: tree + grid
        const body = document.createElement("div");
        Object.assign(body.style, { display: "flex", flex: "1", overflow: "hidden" });

        const treeEl = document.createElement("div");
        Object.assign(treeEl.style, {
            width: "150px", flexShrink: "0",
            borderRight: "1px solid var(--wfm-border, #444)",
            overflowY: "auto", padding: "4px 0", fontSize: "12px",
        });

        const gridEl = document.createElement("div");
        Object.assign(gridEl.style, {
            flex: "1", overflowY: "auto",
            display: "flex", flexWrap: "wrap",
            alignContent: "flex-start", padding: "6px", gap: "4px",
        });

        body.appendChild(treeEl);
        body.appendChild(gridEl);
        modal.appendChild(body);

        // Footer
        const footer = document.createElement("div");
        Object.assign(footer.style, {
            display: "flex", gap: "8px", padding: "8px 12px", flexShrink: "0",
            borderTop: "1px solid var(--wfm-border, #444)",
        });
        const resetBtn = document.createElement("button");
        resetBtn.className = "wfm-btn wfm-btn-sm";
        resetBtn.textContent = "⬤ Round Brush (default)";
        resetBtn.onclick = () => {
            this._maskTool?.clearImageBrush();
            this._renderMaskProps("paint");
            this._renderToolOptions("mask");
            overlay.remove();
        };
        footer.appendChild(resetBtn);
        modal.appendChild(footer);

        overlay.appendChild(modal);
        overlay.addEventListener("mousedown", e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);

        // ── Data helpers ────────────────────────────────────────────
        const tree = this._abrBrushTree;
        let selectedFolder = null;
        const expanded = new Set();

        const collectFiles = (nodes) => {
            const result = [];
            for (const n of nodes) {
                if (n.type === "file") result.push(n);
                else if (n.type === "folder" && n.children) result.push(...collectFiles(n.children));
            }
            return result;
        };

        const findFolder = (nodes, path) => {
            for (const n of nodes) {
                if (n.type !== "folder") continue;
                if (n.path === path) return n;
                const found = findFolder(n.children || [], path);
                if (found) return found;
            }
            return null;
        };

        // ── Brush thumbnail ─────────────────────────────────────────
        const makeBrushThumb = (node) => {
            const item = document.createElement("div");
            Object.assign(item.style, {
                width: "72px", cursor: "pointer", textAlign: "center",
                padding: "4px", borderRadius: "4px",
                border: "1px solid var(--wfm-border, #444)",
                background: "var(--wfm-bg, #1a1a1a)",
                boxSizing: "border-box",
            });
            item.title = node.name;

            const THUMB = 64;
            const canvas = document.createElement("canvas");
            canvas.width = THUMB; canvas.height = THUMB;
            canvas.style.cssText = "display:block;border-radius:3px;";
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#1a1a2a";
            ctx.fillRect(0, 0, THUMB, THUMB);

            const img = new Image();
            img.onload = () => {
                const srcW = img.naturalWidth || img.width;
                const srcH = img.naturalHeight || img.height;
                const aspect = srcW / srcH || 1;
                const WORK = 128;
                const wW = aspect >= 1 ? WORK : Math.max(1, Math.round(WORK * aspect));
                const wH = aspect >= 1 ? Math.max(1, Math.round(WORK / aspect)) : WORK;
                const tmp = document.createElement("canvas");
                tmp.width = wW; tmp.height = wH;
                const stx = tmp.getContext("2d");
                stx.drawImage(img, 0, 0, wW, wH);
                const id = stx.getImageData(0, 0, wW, wH);
                const d = id.data;
                let hasAlpha = false;
                for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { hasAlpha = true; break; }
                let invertLum = false;
                if (!hasAlpha) {
                    const corners = [0, wW - 1, wW * (wH - 1), wW * wH - 1];
                    let bg = 0;
                    for (const ci of corners) { const ii = ci * 4; bg += (d[ii] * 0.299 + d[ii+1] * 0.587 + d[ii+2] * 0.114) / 255; }
                    invertLum = (bg / corners.length) > 0.5;
                }
                for (let i = 0; i < d.length; i += 4) {
                    const a = hasAlpha ? d[i+3] / 255 : (() => { const l = (d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114)/255; return invertLum ? 1-l : l; })();
                    d[i] = d[i+1] = d[i+2] = 255; d[i+3] = Math.round(a * 255);
                }
                stx.putImageData(id, 0, 0);
                const THRESHOLD = 15;
                let x0 = wW, x1 = -1, y0 = wH, y1 = -1;
                for (let y = 0; y < wH; y++) for (let x = 0; x < wW; x++) if (d[(y*wW+x)*4+3] > THRESHOLD) { if (x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
                if (x1 >= x0 && y1 >= y0) {
                    const cW = x1-x0+1, cH = y1-y0+1;
                    const s = Math.min((THUMB-4)/cW, (THUMB-4)/cH);
                    ctx.drawImage(tmp, x0, y0, cW, cH, Math.round((THUMB-Math.round(cW*s))/2), Math.round((THUMB-Math.round(cH*s))/2), Math.round(cW*s), Math.round(cH*s));
                }
            };
            img.src = `/mask_editor/brushes/raw?path=${encodeURIComponent(node.path)}`;
            item.appendChild(canvas);

            const label = document.createElement("div");
            label.textContent = node.name;
            Object.assign(label.style, { fontSize: "10px", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--wfm-text-secondary, #999)" });
            item.appendChild(label);

            item.addEventListener("mouseenter", () => { item.style.background = "color-mix(in srgb, var(--wfm-primary, #4682e6) 20%, transparent)"; item.style.borderColor = "var(--wfm-primary, #4682e6)"; });
            item.addEventListener("mouseleave", () => { item.style.background = "var(--wfm-bg, #1a1a1a)"; item.style.borderColor = "var(--wfm-border, #444)"; });
            item.onclick = () => {
                const loadImg = new Image();
                loadImg.onload = () => {
                    this._maskTool?.setImageBrush(loadImg, node.name);
                    this._renderMaskProps("paint");
                    this._renderToolOptions("mask");
                    overlay.remove();
                };
                loadImg.src = `/mask_editor/brushes/raw?path=${encodeURIComponent(node.path)}`;
            };
            return item;
        };

        // ── Grid rendering ─────────────────────────────────────────
        const showFolder = (path) => {
            const files = path === null ? collectFiles(tree) : collectFiles(findFolder(tree, path)?.children || []);
            gridEl.innerHTML = "";
            if (files.length === 0) {
                const msg = document.createElement("span");
                msg.style.cssText = "font-size:12px;color:var(--wfm-text-secondary,#999);padding:12px;";
                msg.textContent = tree.length === 0 ? "No brushes installed" : "No brushes in this folder";
                gridEl.appendChild(msg);
                return;
            }
            for (const file of files) gridEl.appendChild(makeBrushThumb(file));
        };

        // ── Tree rendering ─────────────────────────────────────────
        const renderTree = () => {
            treeEl.innerHTML = "";
            const allItem = document.createElement("div");
            Object.assign(allItem.style, {
                padding: "5px 10px", cursor: "pointer", fontSize: "12px",
                background: selectedFolder === null ? "color-mix(in srgb, var(--wfm-primary, #4682e6) 25%, transparent)" : "",
            });
            allItem.textContent = "All Brushes";
            allItem.onclick = () => { selectedFolder = null; renderTree(); showFolder(null); };
            treeEl.appendChild(allItem);

            const renderNodes = (nodes, depth) => {
                for (const n of nodes) {
                    if (n.type !== "folder") continue;
                    const isExpanded = expanded.has(n.path);
                    const item = document.createElement("div");
                    Object.assign(item.style, {
                        padding: `5px 10px 5px ${10 + depth * 12}px`,
                        cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px",
                        background: selectedFolder === n.path ? "color-mix(in srgb, var(--wfm-primary, #4682e6) 25%, transparent)" : "",
                    });
                    const arrow = document.createElement("span");
                    arrow.style.cssText = "font-size:9px;color:var(--wfm-text-secondary,#999);flex-shrink:0;";
                    arrow.textContent = isExpanded ? "▼" : "▶";
                    const nameSpan = document.createElement("span");
                    nameSpan.textContent = n.name;
                    nameSpan.style.overflow = "hidden";
                    nameSpan.style.textOverflow = "ellipsis";
                    nameSpan.style.whiteSpace = "nowrap";
                    item.appendChild(arrow);
                    item.appendChild(nameSpan);
                    item.onclick = () => {
                        if (isExpanded) expanded.delete(n.path); else expanded.add(n.path);
                        selectedFolder = n.path;
                        renderTree(); showFolder(n.path);
                    };
                    treeEl.appendChild(item);
                    if (isExpanded) renderNodes(n.children || [], depth + 1);
                }
            };
            renderNodes(tree, 0);
        };

        renderTree();
        showFolder(null);
    }

    _openAbrBrushPickerForDraw() {
        const existing = document.getElementById("wfm-abr-picker-overlay");
        if (existing) { existing.remove(); return; }

        const overlay = document.createElement("div");
        overlay.id = "wfm-abr-picker-overlay";
        Object.assign(overlay.style, {
            position: "fixed", inset: "0",
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: "99999",
        });

        const modal = document.createElement("div");
        Object.assign(modal.style, {
            background: "var(--wfm-surface, #2a2a2a)",
            border: "1px solid var(--wfm-border, #444)",
            borderRadius: "8px",
            width: "640px", height: "460px",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            color: "var(--wfm-text, #ddd)",
            fontFamily: "sans-serif",
        });

        const header = document.createElement("div");
        Object.assign(header.style, {
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px",
            borderBottom: "1px solid var(--wfm-border, #444)",
            fontWeight: "bold", fontSize: "13px", flexShrink: "0",
        });
        const headerTitle = document.createElement("span");
        headerTitle.textContent = "ABR Brush Library — MASK EDITOR ONE (COLOR)";
        const closeBtn = document.createElement("button");
        closeBtn.textContent = "×";
        closeBtn.className = "wfm-btn wfm-btn-sm";
        closeBtn.style.cssText = "font-size:16px;padding:0 6px;";
        closeBtn.onclick = () => overlay.remove();
        header.appendChild(headerTitle);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        const body = document.createElement("div");
        Object.assign(body.style, { display: "flex", flex: "1", overflow: "hidden" });

        const treeEl = document.createElement("div");
        Object.assign(treeEl.style, {
            width: "150px", flexShrink: "0",
            borderRight: "1px solid var(--wfm-border, #444)",
            overflowY: "auto", padding: "4px 0", fontSize: "12px",
        });

        const gridEl = document.createElement("div");
        Object.assign(gridEl.style, {
            flex: "1", overflowY: "auto",
            display: "flex", flexWrap: "wrap",
            alignContent: "flex-start", padding: "6px", gap: "4px",
        });

        body.appendChild(treeEl);
        body.appendChild(gridEl);
        modal.appendChild(body);

        const footer = document.createElement("div");
        Object.assign(footer.style, {
            display: "flex", gap: "8px", padding: "8px 12px", flexShrink: "0",
            borderTop: "1px solid var(--wfm-border, #444)",
        });
        const resetBtn = document.createElement("button");
        resetBtn.className = "wfm-btn wfm-btn-sm";
        resetBtn.textContent = "⬤ Round Brush (default)";
        resetBtn.onclick = () => {
            this._drawTool?.clearImageBrush();
            this._renderDrawProps();
            overlay.remove();
        };
        footer.appendChild(resetBtn);
        modal.appendChild(footer);

        overlay.appendChild(modal);
        overlay.addEventListener("mousedown", e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);

        const tree = this._abrBrushTree;
        let selectedFolder = null;
        const expanded = new Set();

        const collectFiles = (nodes) => {
            const result = [];
            for (const n of nodes) {
                if (n.type === "file") result.push(n);
                else if (n.type === "folder" && n.children) result.push(...collectFiles(n.children));
            }
            return result;
        };

        const findFolder = (nodes, path) => {
            for (const n of nodes) {
                if (n.type !== "folder") continue;
                if (n.path === path) return n;
                const found = findFolder(n.children || [], path);
                if (found) return found;
            }
            return null;
        };

        const currentColor = this._drawTool?.color ?? "#ff0000";
        const hex = currentColor.replace("#", "");
        const cr  = parseInt(hex.slice(0, 2), 16);
        const cg  = parseInt(hex.slice(2, 4), 16);
        const cb  = parseInt(hex.slice(4, 6), 16);

        const makeBrushThumb = (node) => {
            const item = document.createElement("div");
            Object.assign(item.style, {
                width: "72px", cursor: "pointer", textAlign: "center",
                padding: "4px", borderRadius: "4px",
                border: "1px solid var(--wfm-border, #444)",
                background: "var(--wfm-bg, #1a1a1a)",
                boxSizing: "border-box",
            });
            item.title = node.name;

            const THUMB = 64;
            const canvas = document.createElement("canvas");
            canvas.width = THUMB; canvas.height = THUMB;
            canvas.style.cssText = "display:block;border-radius:3px;";
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#1a1a2a";
            ctx.fillRect(0, 0, THUMB, THUMB);

            const img = new Image();
            img.onload = () => {
                const srcW = img.naturalWidth || img.width;
                const srcH = img.naturalHeight || img.height;
                const aspect = srcW / srcH || 1;
                const WORK = 128;
                const wW = aspect >= 1 ? WORK : Math.max(1, Math.round(WORK * aspect));
                const wH = aspect >= 1 ? Math.max(1, Math.round(WORK / aspect)) : WORK;
                const tmp = document.createElement("canvas");
                tmp.width = wW; tmp.height = wH;
                const stx = tmp.getContext("2d");
                stx.drawImage(img, 0, 0, wW, wH);
                const id = stx.getImageData(0, 0, wW, wH);
                const d = id.data;
                let hasAlpha = false;
                for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { hasAlpha = true; break; }
                let invertLum = false;
                if (!hasAlpha) {
                    const corners = [0, wW - 1, wW * (wH - 1), wW * wH - 1];
                    let bg = 0;
                    for (const ci of corners) { const ii = ci * 4; bg += (d[ii] * 0.299 + d[ii+1] * 0.587 + d[ii+2] * 0.114) / 255; }
                    invertLum = (bg / corners.length) > 0.5;
                }
                for (let i = 0; i < d.length; i += 4) {
                    const a = hasAlpha ? d[i+3] / 255 : (() => { const l = (d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114)/255; return invertLum ? 1-l : l; })();
                    d[i] = cr; d[i+1] = cg; d[i+2] = cb; d[i+3] = Math.round(a * 255);
                }
                stx.putImageData(id, 0, 0);
                const THRESHOLD = 15;
                let x0 = wW, x1 = -1, y0 = wH, y1 = -1;
                for (let y = 0; y < wH; y++) for (let x = 0; x < wW; x++) if (d[(y*wW+x)*4+3] > THRESHOLD) { if (x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
                if (x1 >= x0 && y1 >= y0) {
                    const cW = x1-x0+1, cH = y1-y0+1;
                    const s = Math.min((THUMB-4)/cW, (THUMB-4)/cH);
                    ctx.drawImage(tmp, x0, y0, cW, cH, Math.round((THUMB-Math.round(cW*s))/2), Math.round((THUMB-Math.round(cH*s))/2), Math.round(cW*s), Math.round(cH*s));
                }
            };
            img.src = `/mask_editor/brushes/raw?path=${encodeURIComponent(node.path)}`;
            item.appendChild(canvas);

            const label = document.createElement("div");
            label.textContent = node.name;
            Object.assign(label.style, { fontSize: "10px", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--wfm-text-secondary, #999)" });
            item.appendChild(label);

            item.addEventListener("mouseenter", () => { item.style.background = "color-mix(in srgb, var(--wfm-primary, #4682e6) 20%, transparent)"; item.style.borderColor = "var(--wfm-primary, #4682e6)"; });
            item.addEventListener("mouseleave", () => { item.style.background = "var(--wfm-bg, #1a1a1a)"; item.style.borderColor = "var(--wfm-border, #444)"; });
            item.onclick = () => {
                const loadImg = new Image();
                loadImg.onload = () => {
                    this._drawTool?.setImageBrush(loadImg, node.name);
                    this._renderDrawProps();
                    overlay.remove();
                };
                loadImg.src = `/mask_editor/brushes/raw?path=${encodeURIComponent(node.path)}`;
            };
            return item;
        };

        const showFolder = (path) => {
            const files = path === null ? collectFiles(tree) : collectFiles(findFolder(tree, path)?.children || []);
            gridEl.innerHTML = "";
            if (files.length === 0) {
                const msg = document.createElement("span");
                msg.style.cssText = "font-size:12px;color:var(--wfm-text-secondary,#999);padding:12px;";
                msg.textContent = tree.length === 0 ? "No brushes installed" : "No brushes in this folder";
                gridEl.appendChild(msg);
                return;
            }
            for (const file of files) gridEl.appendChild(makeBrushThumb(file));
        };

        const renderTree = () => {
            treeEl.innerHTML = "";
            const allItem = document.createElement("div");
            Object.assign(allItem.style, {
                padding: "5px 10px", cursor: "pointer", fontSize: "12px",
                background: selectedFolder === null ? "color-mix(in srgb, var(--wfm-primary, #4682e6) 25%, transparent)" : "",
            });
            allItem.textContent = "All Brushes";
            allItem.onclick = () => { selectedFolder = null; renderTree(); showFolder(null); };
            treeEl.appendChild(allItem);

            const renderNodes = (nodes, depth) => {
                for (const n of nodes) {
                    if (n.type !== "folder") continue;
                    const isExpanded = expanded.has(n.path);
                    const item = document.createElement("div");
                    Object.assign(item.style, {
                        padding: `5px 10px 5px ${10 + depth * 12}px`,
                        cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px",
                        background: selectedFolder === n.path ? "color-mix(in srgb, var(--wfm-primary, #4682e6) 25%, transparent)" : "",
                    });
                    const arrow = document.createElement("span");
                    arrow.style.cssText = "font-size:9px;color:var(--wfm-text-secondary,#999);flex-shrink:0;";
                    arrow.textContent = isExpanded ? "▼" : "▶";
                    const nameSpan = document.createElement("span");
                    nameSpan.textContent = n.name;
                    nameSpan.style.overflow = "hidden";
                    nameSpan.style.textOverflow = "ellipsis";
                    nameSpan.style.whiteSpace = "nowrap";
                    item.appendChild(arrow);
                    item.appendChild(nameSpan);
                    item.onclick = () => {
                        if (isExpanded) expanded.delete(n.path); else expanded.add(n.path);
                        selectedFolder = n.path;
                        renderTree(); showFolder(n.path);
                    };
                    treeEl.appendChild(item);
                    if (isExpanded) renderNodes(n.children || [], depth + 1);
                }
            };
            renderNodes(tree, 0);
        };

        renderTree();
        showFolder(null);
    }

}

export const imageEditTab = new ImageEditTab();
window._wfmImageEditTab = imageEditTab;

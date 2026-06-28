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
import { showToast }           from "./app.js";

const TOOL_DEFS = [
    { id: "select",   icon: "▲",  label: "Select",    ready: true  },
    { id: "draw",     icon: "✏",  label: "Draw",      ready: true  },
    { id: "text",     icon: "T",   label: "Text",      ready: true  },
    { id: "shape",    icon: "□",   label: "Shape",     ready: true  },
    { id: "mask",     icon: "🎭",  label: "Mask",      ready: true  },
    { id: "blur",     icon: "≈",   label: "Blur",      ready: true  },
    { id: "filter",   icon: "★",   label: "Filter",    ready: true },
    { id: "bgremove", icon: "⬚",   label: "BG Remove", ready: true  },
];

const UNDO_LIMIT = 20;

function _applyMosaicToRegion(ctx, x, y, w, h, size) {
    if (w <= 0 || h <= 0 || size < 1) return;
    const imgData = ctx.getImageData(x, y, w, h);
    const d = imgData.data;
    for (let py = 0; py < h; py += size) {
        for (let px = 0; px < w; px += size) {
            const i = (py * w + px) * 4;
            const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
            for (let by = py; by < Math.min(py + size, h); by++) {
                for (let bx = px; bx < Math.min(px + size, w); bx++) {
                    const j = (by * w + bx) * 4;
                    d[j] = r; d[j + 1] = g; d[j + 2] = b; d[j + 3] = a;
                }
            }
        }
    }
    ctx.putImageData(imgData, x, y);
}

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
        this._blurRectMode  = null;   // null | 'blur' | 'mosaic'
        this._blurDragging  = false;
        this._blurDragStart = null;
        this._blurDragCur   = null;
        // Mask ツール
        this._maskTool         = null;
        this._maskSubtool      = "paint";
        this._maskInverted     = false;
        this._maskOverlayColor = "#ff0000";
        this._maskBlur         = 0;
        // G'MIC tool state
        this._gmicState = {
            lastResultJobId: null,
            processing: false,
            aborted: false
        };
        // Mask Editor One BiRefNet 利用可否
        this._birefnetAvailable = false;
        // Mask Editor One SAM3 状態
        this._sam3Available = false;
        this._sam3Results   = [];   // [{mask_b64, score, area}, ...]
        this._sam3Prompt    = "";
        this._sam3MaxMasks  = 9;
        this._sam3Loading   = false;
        this._sam3Mode      = "add";        // "add" | "erase"
        this._sam3Selected  = new Set();    // 選択中の結果インデックス
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
        this._checkBiRefNetAvailability();
        this._checkSam3Availability();
    }

    async _checkBiRefNetAvailability() {
        try {
            const resp = await fetch("/mask_editor/birefnet/status");
            if (!resp.ok) return;
            const json = await resp.json();
            this._birefnetAvailable = json.loaded === true || json.model_found === true;
        } catch {
            this._birefnetAvailable = false;
        }
    }

    async _checkSam3Availability() {
        try {
            const resp = await fetch("/mask_editor/sam3/status");
            if (!resp.ok) return;
            const json = await resp.json();
            this._sam3Available = json.loaded === true || json.ckpt_found === true;
        } catch {
            this._sam3Available = false;
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
            : tool === "mask" ? this._maskTool?.brushSize : null;
        if (size == null) { el.style.display = "none"; return; }

        const refCanvas = document.getElementById("ie-canvas-draw");
        if (!refCanvas) { el.style.display = "none"; return; }
        const rect  = refCanvas.getBoundingClientRect();
        // Image Edit タブ非表示時（width=0）はカーソルを消す
        if (rect.width === 0 || rect.height === 0) { el.style.display = "none"; return; }
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
        if (this._activeTool === "mask")   this._maskTool?.deactivate();
        if (this._activeTool === "filter") {
            this._gmicAbort();
        }
        if (this._activeTool === "blur") {
            this._blurRectMode = null;
            this._blurDragging = false;
            const overlay = document.getElementById("ie-canvas-overlay");
            if (overlay) {
                overlay.style.cursor = "";
                overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
            }
        }
        // マスク以外に切り替えたらプロパティペインを非表示
        if (toolId !== "mask") {
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
        } else if (this._activeTool === "mask" && this._maskTool) {
            const activeLayer = this._layerMgr?.activeLayer;
            if (activeLayer?.type === "mask") {
                this._maskTool.setCanvas(activeLayer.canvas);
            }
            this._maskTool.activate();
        } else if (this._activeTool === "blur") {
            if (overlayCanvas) overlayCanvas.style.cursor = this._blurRectMode ? "crosshair" : "default";
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
            el.innerHTML = `
                <div class="ie-opt-group">
                    <label>Color</label>
                    <input type="color" id="ie-draw-color" value="${this._drawTool.color}"
                        style="width:30px;height:24px;padding:0;border:1px solid var(--wfm-border);cursor:pointer;border-radius:3px;">
                </div>
                <div class="ie-opt-group">
                    <label>Size</label>
                    <input type="range" id="ie-draw-size" min="1" max="200" value="${this._drawTool.brushSize}" style="width:80px;">
                    <span id="ie-draw-size-lbl">${this._drawTool.brushSize}px</span>
                </div>
                <div class="ie-opt-group">
                    <label>Hardness</label>
                    <input type="range" id="ie-draw-hard" min="0" max="100" value="${Math.round(this._drawTool.hardness*100)}" style="width:70px;">
                    <span id="ie-draw-hard-lbl">${Math.round(this._drawTool.hardness*100)}%</span>
                </div>
                <div class="ie-opt-group">
                    <label>Opacity</label>
                    <input type="range" id="ie-draw-opacity" min="1" max="100" value="${Math.round(this._drawTool.opacity*100)}" style="width:70px;">
                    <span id="ie-draw-opacity-lbl">${Math.round(this._drawTool.opacity*100)}%</span>
                </div>
                <div class="ie-opt-group">
                    <label>Mode</label>
                    <select id="ie-draw-mode" class="ie-opt-select">
                        <option value="draw"  ${this._drawTool.mode==="draw"  ? "selected":""}>Draw</option>
                        <option value="erase" ${this._drawTool.mode==="erase" ? "selected":""}>Erase</option>
                    </select>
                </div>
            `;
            document.getElementById("ie-draw-color")?.addEventListener("input", e => {
                this._drawTool.color = e.target.value; this._drawTool._stamp = null;
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
            document.getElementById("ie-draw-mode")?.addEventListener("change", e => {
                this._drawTool.mode = e.target.value;
            });

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
            const sam3Disabled = this._sam3Available ? "" : "disabled";
            const sam3Title    = this._sam3Available ? "SAM3 Segment" : "SAM3 (Mask Editor One required)";
            const sam3Ui = this._sam3Available && sub === "sam3" ? `
                <div class="ie-opt-group">
                    <input type="text" id="ie-sam3-prompt" class="ie-opt-input"
                        placeholder="e.g. cat, person..."
                        value="${this._sam3Prompt}"
                        style="width:160px;font-size:11px;padding:2px 6px;border:1px solid var(--wfm-border);border-radius:3px;background:var(--wfm-surface);color:var(--wfm-text);">
                </div>
                <div class="ie-opt-group">
                    <label style="font-size:11px;color:var(--wfm-text-secondary);">Max</label>
                    <select id="ie-sam3-max" class="ie-opt-select" style="width:44px;">
                        ${[3,6,9,12].map(n => `<option value="${n}"${n === this._sam3MaxMasks ? " selected" : ""}>${n}</option>`).join("")}
                    </select>
                </div>
                <div class="ie-opt-group">
                    <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="ie-sam3-run-btn" ${this._sam3Loading ? "disabled" : ""}>
                        ${this._sam3Loading ? "Running..." : "Segment"}
                    </button>
                </div>
                <span id="ie-sam3-status" style="font-size:11px;color:var(--wfm-text-secondary);margin-left:4px;">
                    ${this._sam3Results.length > 0 ? `${this._sam3Results.length} masks found` : ""}
                </span>
            ` : "";
            el.innerHTML = `
                <div class="ie-opt-group">
                    <button class="wfm-btn wfm-btn-sm${sub === "paint" ? " ie-opt-active" : ""}" id="ie-mask-paint-btn">Paint</button>
                    <button class="wfm-btn wfm-btn-sm${sub === "sam3"  ? " ie-opt-active" : ""}" id="ie-mask-sam3-btn"
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
                this._maskSubtool = "paint";
                this._renderToolOptions("mask");
            });
            document.getElementById("ie-mask-sam3-btn")?.addEventListener("click", () => {
                if (this._sam3Available) {
                    this._maskSubtool = "sam3";
                    this._renderToolOptions("mask");
                }
            });
            document.getElementById("ie-sam3-prompt")?.addEventListener("input", e => {
                this._sam3Prompt = e.target.value;
            });
            document.getElementById("ie-sam3-max")?.addEventListener("change", e => {
                this._sam3MaxMasks = parseInt(e.target.value);
            });
            document.getElementById("ie-sam3-run-btn")?.addEventListener("click", () => this._runSam3Segment());
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
            const blurOn   = this._blurRectMode === "blur";
            const mosaicOn = this._blurRectMode === "mosaic";
            el.innerHTML = `
                <div class="ie-opt-group">
                    <span style="font-size:11px;color:var(--wfm-text-secondary);">Whole:</span>
                </div>
                <div class="ie-opt-group">
                    <label style="font-size:11px;">Blur</label>
                    <input type="range" id="ie-whole-blur" min="1" max="50" value="10" style="width:70px;">
                    <span id="ie-whole-blur-val" style="font-size:11px;min-width:22px;">10</span>px
                    <button class="wfm-btn wfm-btn-sm" id="ie-whole-blur-apply">Apply</button>
                </div>
                <div class="ie-opt-group">
                    <label style="font-size:11px;">Mosaic</label>
                    <input type="range" id="ie-whole-mosaic" min="5" max="100" value="20" style="width:70px;">
                    <span id="ie-whole-mosaic-val" style="font-size:11px;min-width:22px;">20</span>px
                    <button class="wfm-btn wfm-btn-sm" id="ie-whole-mosaic-apply">Apply</button>
                </div>
                <div style="width:1px;height:22px;background:var(--wfm-border);margin:0 6px;flex-shrink:0;"></div>
                <div class="ie-opt-group">
                    <span style="font-size:11px;color:var(--wfm-text-secondary);">Rect:</span>
                </div>
                <div class="ie-opt-group">
                    <button class="wfm-btn wfm-btn-sm${blurOn ? " ie-opt-active" : ""}" id="ie-rect-blur-toggle"
                        style="${blurOn ? "background:var(--wfm-accent,#4682e6);color:#fff;" : ""}">
                        Rect Blur: ${blurOn ? "ON" : "OFF"}
                    </button>
                    <input type="range" id="ie-rect-blur" min="1" max="50" value="10" style="width:70px;">
                    <span id="ie-rect-blur-val" style="font-size:11px;min-width:22px;">10</span>px
                </div>
                <div class="ie-opt-group">
                    <button class="wfm-btn wfm-btn-sm${mosaicOn ? " ie-opt-active" : ""}" id="ie-rect-mosaic-toggle"
                        style="${mosaicOn ? "background:var(--wfm-accent,#4682e6);color:#fff;" : ""}">
                        Rect Mosaic: ${mosaicOn ? "ON" : "OFF"}
                    </button>
                    <input type="range" id="ie-rect-mosaic" min="5" max="50" value="15" style="width:70px;">
                    <span id="ie-rect-mosaic-val" style="font-size:11px;min-width:22px;">15</span>px
                </div>
            `;
            document.getElementById("ie-whole-blur")?.addEventListener("input", e => {
                document.getElementById("ie-whole-blur-val").textContent = e.target.value;
            });
            document.getElementById("ie-whole-mosaic")?.addEventListener("input", e => {
                document.getElementById("ie-whole-mosaic-val").textContent = e.target.value;
            });
            document.getElementById("ie-whole-blur-apply")?.addEventListener("click", () => {
                this._applyWholeBlur(parseInt(document.getElementById("ie-whole-blur").value));
            });
            document.getElementById("ie-whole-mosaic-apply")?.addEventListener("click", () => {
                this._applyWholeMosaic(parseInt(document.getElementById("ie-whole-mosaic").value));
            });
            document.getElementById("ie-rect-blur-toggle")?.addEventListener("click", () => {
                this._blurRectMode = this._blurRectMode === "blur" ? null : "blur";
                this._renderToolOptions("blur");
                const ov = document.getElementById("ie-canvas-overlay");
                if (ov) ov.style.cursor = this._blurRectMode ? "crosshair" : "default";
            });
            document.getElementById("ie-rect-mosaic-toggle")?.addEventListener("click", () => {
                this._blurRectMode = this._blurRectMode === "mosaic" ? null : "mosaic";
                this._renderToolOptions("blur");
                const ov = document.getElementById("ie-canvas-overlay");
                if (ov) ov.style.cursor = this._blurRectMode ? "crosshair" : "default";
            });
            document.getElementById("ie-rect-blur")?.addEventListener("input", e => {
                document.getElementById("ie-rect-blur-val").textContent = e.target.value;
            });
            document.getElementById("ie-rect-mosaic")?.addEventListener("input", e => {
                document.getElementById("ie-rect-mosaic-val").textContent = e.target.value;
            });

        } else if (toolId === "bgremove") {
            const birefnetDisabled = this._birefnetAvailable ? "" : "disabled";
            const birefnetLabel    = this._birefnetAvailable
                ? "BiRefNet (Mask Editor One)"
                : "BiRefNet (Mask Editor One required)";
            el.innerHTML = `
                <div class="ie-opt-group">
                    <label>Model</label>
                    <select id="ie-bgremove-model" class="ie-opt-select">
                        <option value="imgly">Lightweight (@imgly)</option>
                        <option value="birefnet" ${birefnetDisabled}>${birefnetLabel}</option>
                    </select>
                </div>
                <div class="ie-opt-group">
                    <label style="font-size:11px;cursor:pointer;">
                        <input type="checkbox" id="ie-bgremove-new-layer" checked> New Layer
                    </label>
                </div>
                <div class="ie-opt-group">
                    <button class="wfm-btn wfm-btn-sm" id="ie-bgremove-btn">Remove BG</button>
                </div>
                <span id="ie-bgremove-status" style="font-size:11px;color:var(--wfm-text-secondary);margin-left:4px;"></span>
            `;
            document.getElementById("ie-bgremove-btn")?.addEventListener("click", () => this._applyBgRemove());

        } else if (toolId === "filter") {
            const openBtnDisabled = this._gmicState.processing ? "disabled" : "";
            const applyBtnDisabled = (!this._gmicState.lastResultJobId || this._gmicState.processing) ? "disabled" : "";
            const progressStyle = this._gmicState.processing ? "display:flex" : "display:none";
            
            el.innerHTML = `
                <div class="ie-opt-group">
                    <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="ie-gmic-open-btn" ${openBtnDisabled}>G'MIC GUIで編集</button>
                    <button class="wfm-btn wfm-btn-sm" id="ie-gmic-apply-btn" ${applyBtnDisabled}>結果を反映</button>
                </div>
                <div class="ie-opt-group" id="ie-gmic-progress-area" style="${progressStyle}; align-items:center; gap:6px;">
                    <span id="ie-gmic-progress-lbl" style="font-size:11px; color:var(--wfm-text-secondary);">G'MIC GUIを起動中...</span>
                    <button class="wfm-btn wfm-btn-sm" id="ie-gmic-abort-btn" style="background:#ea4335;color:#fff;">中断</button>
                </div>
            `;
            document.getElementById("ie-gmic-open-btn")?.addEventListener("click", () => this._gmicOpenGui());
            document.getElementById("ie-gmic-apply-btn")?.addEventListener("click", () => this._gmicApplyResult());
            document.getElementById("ie-gmic-abort-btn")?.addEventListener("click", () => this._gmicAbort());
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
                    <input type="range" id="ie-mask-hard" min="0" max="100" value="${Math.round(t.hardness * 100)}">
                    <span id="ie-mask-hard-lbl">${Math.round(t.hardness * 100)}%</span>
                </div>
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
        } else if (sub === "sam3") {
            const modeAdd   = this._sam3Mode === "add";
            const selCount  = this._sam3Selected.size;
            const hasResult = this._sam3Results.length > 0;
            body.innerHTML = `
                <div class="ie-props-row">
                    <label>Mode</label>
                    <div style="display:flex;gap:4px;">
                        <button class="wfm-btn wfm-btn-sm${modeAdd   ? " ie-opt-active" : ""}" id="ie-sam3-mode-add"   style="flex:1;">Add</button>
                        <button class="wfm-btn wfm-btn-sm${!modeAdd  ? " ie-opt-active" : ""}" id="ie-sam3-mode-erase" style="flex:1;">Erase</button>
                    </div>
                </div>
                ${hasResult ? `
                <div class="ie-props-row" style="flex-direction:column;align-items:stretch;gap:4px;">
                    <div style="font-size:11px;color:var(--wfm-text-secondary);">Click to select / deselect:</div>
                    <div id="ie-sam3-results" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">
                        ${this._sam3Results.map((r, i) => {
                            const sel = this._sam3Selected.has(i);
                            const borderColor = sel ? "var(--wfm-primary,#4682e6)" : "var(--wfm-border)";
                            const bg          = sel ? "color-mix(in srgb,var(--wfm-primary,#4682e6) 15%,transparent)" : "transparent";
                            return `<div class="ie-sam3-thumb" data-idx="${i}"
                                style="cursor:pointer;border:2px solid ${borderColor};border-radius:4px;overflow:hidden;text-align:center;background:${bg};position:relative;">
                                <img src="${r.mask_b64}" style="width:100%;display:block;background:#000;">
                                <div style="font-size:10px;padding:2px 0;color:var(--wfm-text-secondary);">
                                    ${Math.round((r.score ?? 0) * 100)}%
                                </div>
                                ${sel ? '<div style="position:absolute;top:2px;right:3px;font-size:12px;line-height:1;color:var(--wfm-primary,#4682e6);">✓</div>' : ""}
                            </div>`;
                        }).join("")}
                    </div>
                    <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="ie-sam3-apply-btn"
                        ${selCount === 0 ? "disabled" : ""} style="margin-top:4px;">
                        Apply Selected${selCount > 0 ? ` (${selCount})` : ""}
                    </button>
                </div>` : `
                <div style="font-size:11px;color:var(--wfm-text-secondary);padding:4px 0;">
                    ${this._sam3Loading ? "Segmenting..." : "Enter a prompt and press Segment"}
                </div>`}
            `;
            document.getElementById("ie-sam3-mode-add")?.addEventListener("click", () => {
                this._sam3Mode = "add";
                this._renderMaskProps("sam3");
            });
            document.getElementById("ie-sam3-mode-erase")?.addEventListener("click", () => {
                this._sam3Mode = "erase";
                this._renderMaskProps("sam3");
            });
            body.querySelectorAll(".ie-sam3-thumb").forEach(el => {
                el.addEventListener("click", () => {
                    const idx = parseInt(el.dataset.idx);
                    if (this._sam3Selected.has(idx)) this._sam3Selected.delete(idx);
                    else                              this._sam3Selected.add(idx);
                    this._renderMaskProps("sam3");
                });
            });
            document.getElementById("ie-sam3-apply-btn")?.addEventListener("click", () => {
                this._applySelectedSam3Masks();
            });
        } else {
            body.innerHTML = `<span style="font-size:11px;color:var(--wfm-text-secondary);">No options</span>`;
        }
    }

    _renderMaskLayerOverlay(ctx, maskLayer) {
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
        document.getElementById("ie-save-btn")?.addEventListener("click", () => this._savePng());
        document.getElementById("ie-save-gallery-btn")?.addEventListener("click", () => this._saveToGallery());
        document.getElementById("ie-upload-comfy-btn")?.addEventListener("click", () => this._uploadToComfyUI());
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

        } else if (this._activeTool === "mask" && this._maskTool) {
            const activeLayer = this._layerMgr.activeLayer;
            if (!activeLayer || activeLayer.type !== "mask") {
                showToast("Select a mask layer first", "info");
                return;
            }
            this._saveUndo();
            this._maskTool.setCanvas(activeLayer.canvas);
            this._maskTool.onMouseDown(pos.x, pos.y);
            this._updateCompositeView();

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
        } else if (this._activeTool === "blur" && this._blurRectMode) {
            this._blurDragging  = true;
            this._blurDragStart = { x: pos.x, y: pos.y };
            this._blurDragCur   = { x: pos.x, y: pos.y };
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
            this._maskTool?.onMouseMove(pos.x, pos.y);
            if (this._maskTool?._drawing) this._updateCompositeView();
        }
        if (this._activeTool === "shape")  this._shapeTool?.onMouseMove(pos.x, pos.y);
        if (this._activeTool === "select") this._selectTool?.onMouseMove(pos.x, pos.y);
        if (this._activeTool === "blur" && this._blurDragging) {
            this._blurDragCur = pos;
            this._drawBlurPreview();
        }
    }

    _onToolMouseUp(e) {
        if (!this._layerMgr || e.button !== 0) return;
        if (this._activeTool === "draw")   this._drawTool?.onMouseUp();
        if (this._activeTool === "mask")   this._maskTool?.onMouseUp();
        if (this._activeTool === "shape")  this._shapeTool?.onMouseUp();
        if (this._activeTool === "select") this._selectTool?.onMouseUp();
        if (this._activeTool === "blur" && this._blurDragging) {
            this._blurDragging = false;
            this._applyRectEffect();
            const overlay = document.getElementById("ie-canvas-overlay");
            if (overlay) overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
        }
    }

    _onToolMouseLeave() {
        // Draw/Mask: do NOT stop the stroke — window mousemove/mouseup continue tracking
        this._hideBrushCursor();
        if (this._activeTool === "shape")  this._shapeTool?.onMouseLeave();
        if (this._activeTool === "select") this._selectTool?.onMouseLeave();
        if (this._activeTool === "blur" && this._blurDragging) {
            this._blurDragging = false;
            const overlay = document.getElementById("ie-canvas-overlay");
            if (overlay) overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
        }
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
        this._undoStack = [];
        this._redoStack = [];
        this._setActiveTool("select");
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

    // ── 合成・保存 ─────────────────────────────────

    _buildCompositeCanvas() {
        const canvas = document.createElement("canvas");
        canvas.width  = this._canvasW;
        canvas.height = this._canvasH;
        if (!this._layerMgr) return canvas;
        this._compositeForExport(canvas);
        return canvas;
    }

    // 保存用合成: maskApply=true のクリッピングを適用、マスクオーバーレイは除外
    _compositeForExport(target) {
        const ctx = target.getContext("2d");
        ctx.clearRect(0, 0, target.width, target.height);
        const layers = this._layerMgr.layers;
        const maskedIndices = new Set();
        for (let i = 0; i < layers.length; i++) {
            if (layers[i].type === "mask" && layers[i].maskApply && layers[i].visible && i + 1 < layers.length) {
                maskedIndices.add(i + 1);
            }
        }
        for (let i = layers.length - 1; i >= 0; i--) {
            const layer = layers[i];
            if (!layer.visible) continue;
            if (maskedIndices.has(i)) continue;
            if (layer.type === "mask") {
                if (layer.maskApply && i + 1 < layers.length) {
                    this._renderMaskedLayer(ctx, target, layer, layers[i + 1], false);
                }
                // maskApply=false のマスクはエクスポートに含めない
            } else {
                ctx.save();
                ctx.globalAlpha = layer.opacity;
                ctx.globalCompositeOperation = layer.blendMode;
                Layer.applyTransform(ctx, layer);
                ctx.drawImage(layer.canvas, -layer.canvas.width / 2, -layer.canvas.height / 2);
                ctx.restore();
            }
        }
    }

    _savePng() {
        if (!this._layerMgr) { showToast("No image loaded", "error"); return; }
        const canvas = this._buildCompositeCanvas();
        const a = document.createElement("a");
        a.href     = canvas.toDataURL("image/png");
        a.download = (this._baseName || "wfs-edit") + "-output.png";
        a.click();
        showToast("PNG saved", "success");
    }

    async _saveToGallery() {
        if (!this._layerMgr) { showToast("No image loaded", "error"); return; }

        // デフォルトファイル名: wfs-image-YYYYMMDDHHmmss
        const now = new Date();
        const pad = n => String(n).padStart(2, "0");
        const ts  = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const defaultName = `wfs-image-${ts}`;

        const filename = window.prompt("Save to Gallery — file name (without extension):", defaultName);
        if (filename === null) return; // キャンセル
        const safeName = filename.trim() || defaultName;

        const canvas   = this._buildCompositeCanvas();
        const imageData = canvas.toDataURL("image/png");

        try {
            const r = await fetch("/wfm/gallery/image/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: safeName, imageData }),
            });
            if (!r.ok) {
                const e = await r.json().catch(() => ({}));
                throw new Error(e.error || r.statusText);
            }
            showToast(`Saved to Gallery: ${safeName}.png`, "success");
        } catch (err) {
            showToast(`Gallery save failed: ${err.message}`, "error");
        }
    }

    async _uploadToComfyUI() {
        if (!this._layerMgr) { showToast("No image loaded", "error"); return; }
        const canvas = this._buildCompositeCanvas();
        const blob   = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        const file   = new File([blob], (this._baseName || "wfs-edit") + "-output.png", { type: "image/png" });
        const form   = new FormData();
        form.append("image", file);
        form.append("overwrite", "true");
        try {
            const r    = await fetch("/upload/image", { method: "POST", body: form });
            const data = await r.json();
            showToast(`Uploaded: ${data.name}`, "success");
        } catch {
            showToast("Upload failed", "error");
        }
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

    // ── ぼかし / モザイク ─────────────────────────

    _applyWholeBlur(amount) {
        if (!this._layerMgr) return;
        const layer = this._layerMgr.activeLayer;
        if (!layer) { showToast("No active layer", "error"); return; }
        this._saveUndo();
        const w = layer.canvas.width, h = layer.canvas.height;
        const tmp = document.createElement("canvas");
        tmp.width = w; tmp.height = h;
        const tc = tmp.getContext("2d");
        tc.filter = `blur(${amount}px)`;
        tc.drawImage(layer.canvas, 0, 0);
        layer.ctx.clearRect(0, 0, w, h);
        layer.ctx.drawImage(tmp, 0, 0);
        this._updateCompositeView();
        this._refreshLayerList();
    }

    _applyWholeMosaic(size) {
        if (!this._layerMgr) return;
        const layer = this._layerMgr.activeLayer;
        if (!layer) { showToast("No active layer", "error"); return; }
        this._saveUndo();
        _applyMosaicToRegion(layer.ctx, 0, 0, layer.canvas.width, layer.canvas.height, size);
        this._updateCompositeView();
        this._refreshLayerList();
    }

    // canvas座標 (cx,cy) → layer.canvas 座標への逆変換
    _canvasToLayerCoords(layer, cx, cy) {
        const centerX = layer.x + layer.displayW / 2;
        const centerY = layer.y + layer.displayH / 2;
        const dx = cx - centerX, dy = cy - centerY;
        const angle = -(layer.rotation || 0) * Math.PI / 180;
        const rdx = dx * Math.cos(angle) - dy * Math.sin(angle);
        const rdy = dx * Math.sin(angle) + dy * Math.cos(angle);
        const scaleX = layer.displayW / layer.canvas.width;
        const scaleY = layer.displayH / layer.canvas.height;
        let lx = rdx / scaleX + layer.canvas.width  / 2;
        let ly = rdy / scaleY + layer.canvas.height / 2;
        if (layer.flipX) lx = layer.canvas.width  - lx;
        if (layer.flipY) ly = layer.canvas.height - ly;
        return { x: lx, y: ly };
    }

    _drawBlurPreview() {
        const overlay = document.getElementById("ie-canvas-overlay");
        if (!overlay) return;
        const ctx = overlay.getContext("2d");
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        const s = this._blurDragStart, c = this._blurDragCur;
        if (!s || !c) return;
        const x = Math.min(s.x, c.x), y = Math.min(s.y, c.y);
        const w = Math.abs(c.x - s.x), h = Math.abs(c.y - s.y);
        ctx.strokeStyle = this._blurRectMode === "blur" ? "#4af" : "#fa4";
        ctx.lineWidth   = 1 / this._zoom;
        ctx.setLineDash([4 / this._zoom, 2 / this._zoom]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
    }

    _applyRectEffect() {
        const layer = this._layerMgr?.activeLayer;
        if (!layer || !this._blurDragStart || !this._blurDragCur) return;
        const s = this._blurDragStart, c = this._blurDragCur;
        if (Math.abs(c.x - s.x) < 3 || Math.abs(c.y - s.y) < 3) return;

        const minX = Math.min(s.x, c.x), minY = Math.min(s.y, c.y);
        const maxX = Math.max(s.x, c.x), maxY = Math.max(s.y, c.y);
        const p1 = this._canvasToLayerCoords(layer, minX, minY);
        const p2 = this._canvasToLayerCoords(layer, maxX, maxY);

        const lx = Math.round(Math.max(0, Math.min(p1.x, p2.x)));
        const ly = Math.round(Math.max(0, Math.min(p1.y, p2.y)));
        const lw = Math.round(Math.min(layer.canvas.width  - lx, Math.abs(p2.x - p1.x)));
        const lh = Math.round(Math.min(layer.canvas.height - ly, Math.abs(p2.y - p1.y)));
        if (lw <= 0 || lh <= 0) return;

        this._saveUndo();

        if (this._blurRectMode === "blur") {
            const amount = parseInt(document.getElementById("ie-rect-blur")?.value ?? "10");
            const tmp = document.createElement("canvas");
            tmp.width = layer.canvas.width; tmp.height = layer.canvas.height;
            const tc = tmp.getContext("2d");
            tc.filter = `blur(${amount}px)`;
            tc.drawImage(layer.canvas, 0, 0);
            layer.ctx.drawImage(tmp, lx, ly, lw, lh, lx, ly, lw, lh);
        } else {
            const size = parseInt(document.getElementById("ie-rect-mosaic")?.value ?? "15");
            _applyMosaicToRegion(layer.ctx, lx, ly, lw, lh, size);
        }

        this._updateCompositeView();
        this._refreshLayerList();
    }

    // ── 背景除去 ─────────────────────────────────

    async _bgRemoveImgly(dataUrl, onStatus) {
        if (!window._wfmImglyRemoveBg) {
            onStatus("Loading model...");
            const mod = await import("https://esm.sh/@imgly/background-removal@1.5.7?bundle&target=es2022");
            window._wfmImglyRemoveBg = mod.removeBackground;
        }
        onStatus("Processing...");
        const res  = await fetch(dataUrl);
        const blob = await res.blob();
        const resultBlob = await window._wfmImglyRemoveBg(blob, {
            publicPath: "https://staticimgly.com/@imgly/background-removal-data/1.5.7/dist/",
        });
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(resultBlob);
        });
    }

    async _runSam3Segment() {
        if (!this._layerMgr || this._sam3Loading) return;
        const prompt = this._sam3Prompt.trim();
        if (!prompt) { showToast("Please enter a prompt", "warning"); return; }

        // 推論対象: アクティブレイヤー（マスクなら下のイメージレイヤーを探す）
        let imageLayer = this._layerMgr.activeLayer;
        if (!imageLayer || imageLayer.type === "mask") {
            imageLayer = this._layerMgr.layers.find(l => l.type !== "mask" && l.visible);
        }
        if (!imageLayer) { showToast("No image layer found", "error"); return; }

        const NODE_ID = "wfs_sam3";
        this._sam3Loading  = true;
        this._sam3Results  = [];
        this._sam3Selected = new Set();
        this._renderToolOptions("mask");
        this._renderMaskProps("sam3");

        try {
            const dataUrl = imageLayer.canvas.toDataURL("image/png");
            await fetch("/mask_editor/store_image", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ node_id: NODE_ID, image_b64: dataUrl }),
            });

            const resp = await fetch("/mask_editor/sam3/segment", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ node_id: NODE_ID, prompt, max_masks: this._sam3MaxMasks }),
            });
            const json = await resp.json();
            if (json.error) throw new Error(json.error);
            this._sam3Results = json.masks || [];
            if (this._sam3Results.length === 0) showToast("No masks found", "warning");
            else showToast(`${this._sam3Results.length} mask(s) found`, "success");
        } catch (err) {
            showToast("SAM3 error: " + err.message, "error");
        } finally {
            this._sam3Loading = false;
            this._renderToolOptions("mask");
            this._renderMaskProps("sam3");
        }
    }

    async _applySelectedSam3Masks() {
        if (!this._layerMgr || this._sam3Selected.size === 0) return;
        const indices = [...this._sam3Selected].sort((a, b) => a - b);
        const masks   = indices.map(i => this._sam3Results[i]).filter(Boolean);
        if (masks.length === 0) return;

        let maskLayer = this._layerMgr.activeLayer;
        if (!maskLayer || maskLayer.type !== "mask") {
            const ref = this._layerMgr.activeLayer;
            maskLayer = this._layerMgr.addLayer("mask", "SAM3 Mask", {
                contentW: ref?.canvas.width  ?? this._layerMgr.width,
                contentH: ref?.canvas.height ?? this._layerMgr.height,
                displayW: ref?.displayW      ?? this._layerMgr.width,
                displayH: ref?.displayH      ?? this._layerMgr.height,
                x: ref?.x ?? 0, y: ref?.y ?? 0,
            });
            this._layerMgr.setActive(maskLayer.id);
        }

        this._saveUndo();
        for (const r of masks) {
            await this._applySam3Mask(maskLayer, r.mask_b64, this._sam3Mode);
        }

        this._updateCompositeView();
        this._refreshLayerList();
        showToast(`SAM3: ${masks.length} mask(s) applied (${this._sam3Mode})`, "success");
    }

    _applySam3Mask(maskLayer, maskB64, mode = "add") {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const W = maskLayer.canvas.width;
                const H = maskLayer.canvas.height;
                // グレースケール輝度 → アルファ白マスクに変換
                const off = document.createElement("canvas");
                off.width = W; off.height = H;
                const mc = off.getContext("2d");
                mc.drawImage(img, 0, 0, W, H);
                const imgData = mc.getImageData(0, 0, W, H);
                const d = imgData.data;
                for (let i = 0; i < d.length; i += 4) {
                    const lum = d[i];
                    d[i] = d[i+1] = d[i+2] = 255;
                    d[i+3] = lum;
                }
                mc.putImageData(imgData, 0, 0);
                // モードに合わせてマスクキャンバスに合成
                maskLayer.ctx.save();
                maskLayer.ctx.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";
                maskLayer.ctx.drawImage(off, 0, 0);
                maskLayer.ctx.restore();
                resolve();
            };
            img.onerror = resolve;
            img.src = maskB64;
        });
    }

    async _bgRemoveBiRefNet(dataUrl, onStatus) {
        const NODE_ID = "wfs_bgremove";

        // 1. アクティブレイヤー画像を Mask Editor One のキャッシュに登録
        onStatus("Sending image...");
        const storeResp = await fetch("/mask_editor/store_image", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ node_id: NODE_ID, image_b64: dataUrl }),
        });
        if (!storeResp.ok) throw new Error("Failed to cache image for BiRefNet");

        // 2. BiRefNet 推論実行
        onStatus("Running BiRefNet...");
        const resp = await fetch("/mask_editor/birefnet/remove_bg", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ node_id: NODE_ID }),
        });
        const json = await resp.json();
        if (json.error) throw new Error(json.error);

        // 3. グレースケールマスク (白=前景) → RGBA PNG に変換して返す
        onStatus("Compositing...");
        return await this._applyMaskToImage(dataUrl, json.mask_b64);
    }

    async _applyMaskToImage(imageB64, maskB64) {
        const loadImage = src => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload  = () => resolve(img);
            img.onerror = () => reject(new Error("Image load failed: " + src.slice(0, 40)));
            img.src = src;
        });
        const [origImg, maskImg] = await Promise.all([loadImage(imageB64), loadImage(maskB64)]);

        const w = origImg.naturalWidth;
        const h = origImg.naturalHeight;

        // マスク: グレースケール輝度値 → アルファチャンネル (RGBA 白マスク)
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width  = w;
        maskCanvas.height = h;
        const mc = maskCanvas.getContext("2d");
        mc.drawImage(maskImg, 0, 0, w, h);
        const maskData = mc.getImageData(0, 0, w, h);
        const md = maskData.data;
        for (let i = 0; i < md.length; i += 4) {
            md[i + 3] = md[i]; // 輝度 → アルファ
            md[i] = md[i + 1] = md[i + 2] = 255;
        }
        mc.putImageData(maskData, 0, 0);

        // 元画像にマスクを destination-in で適用
        const out = document.createElement("canvas");
        out.width  = w;
        out.height = h;
        const ctx = out.getContext("2d");
        ctx.drawImage(origImg, 0, 0, w, h);
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(maskCanvas, 0, 0, w, h);

        return out.toDataURL("image/png");
    }

    async _applyBgRemove() {
        if (!this._layerMgr) { showToast("No image loaded", "error"); return; }
        const layer = this._layerMgr.activeLayer;
        if (!layer)  { showToast("No active layer", "error"); return; }

        const model    = document.getElementById("ie-bgremove-model")?.value ?? "imgly";
        const asNew    = document.getElementById("ie-bgremove-new-layer")?.checked ?? true;
        const statusEl = document.getElementById("ie-bgremove-status");
        const btn      = document.getElementById("ie-bgremove-btn");
        const setStatus = msg => { if (statusEl) statusEl.textContent = msg; };

        if (btn) btn.disabled = true;
        setStatus("Starting...");

        try {
            const dataUrl = layer.canvas.toDataURL("image/png");

            let resultDataUrl;
            if (model === "imgly") {
                resultDataUrl = await this._bgRemoveImgly(dataUrl, setStatus);
            } else {
                resultDataUrl = await this._bgRemoveBiRefNet(dataUrl, setStatus);
            }

            const img = await new Promise((resolve, reject) => {
                const i = new Image();
                i.onload  = () => resolve(i);
                i.onerror = () => reject(new Error("Result image load failed"));
                i.src = resultDataUrl;
            });

            this._saveUndo();

            if (asNew) {
                const newL = this._layerMgr.addLayer("image", layer.name + " (no bg)", {
                    contentW: img.width,    contentH: img.height,
                    displayW: layer.displayW, displayH: layer.displayH,
                    x: layer.x,            y: layer.y,
                });
                newL.ctx.drawImage(img, 0, 0);
                this._layerMgr.setActive(newL.id);
                if (this._activeTool === "select") this._selectTool?.setLayer(newL);
            } else {
                layer.canvas.width  = img.width;
                layer.canvas.height = img.height;
                layer.ctx = layer.canvas.getContext("2d");
                layer.ctx.drawImage(img, 0, 0);
            }

            this._updateCompositeView();
            this._refreshLayerList();
            setStatus("Done!");
            setTimeout(() => setStatus(""), 3000);
            showToast("Background removed", "success");

        } catch (err) {
            setStatus("Error: " + err.message);
            showToast("BG remove failed: " + err.message, "error");
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ── G'MIC Integration ──────────────────────────

    async _gmicOpenGui() {
        if (!this._layerMgr) { showToast("No image loaded", "error"); return; }
        const layer = this._layerMgr.activeLayer;
        if (!layer)  { showToast("No active layer", "error"); return; }
        this._syncActiveLayerFromCanvas();

        if (this._gmicState.processing) return;

        const dataUrl = layer.canvas.toDataURL("image/png");

        this._gmicState.processing = true;
        const openBtn      = document.getElementById("ie-gmic-open-btn");
        const progressArea = document.getElementById("ie-gmic-progress-area");
        const progressLbl  = document.getElementById("ie-gmic-progress-lbl");
        const applyBtn     = document.getElementById("ie-gmic-apply-btn");

        if (openBtn) openBtn.disabled = true;
        if (applyBtn) applyBtn.disabled = true;
        if (progressArea) progressArea.style.display = "flex";
        if (progressLbl) progressLbl.textContent = "画像をサーバーへ送信中...";

        try {
            const res = await fetch("/api/wfm/gmic/open", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image_b64: dataUrl })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }
            const data = await res.json();
            this._gmicState.lastResultJobId = data.job_id;
            if (progressLbl) progressLbl.textContent = "G'MIC GUIで編集中... フィルターを選択して「OK」を押すと適用可能になります";
            await this._gmicWaitForJob(data.job_id);
        } catch (e) {
            if (e.message !== "__aborted__") {
                showToast("G'MIC Error: " + e.message, "error");
            }
            this._gmicState.processing = false;
            this._gmicState.aborted = false;
            if (openBtn) openBtn.disabled = false;
            if (progressArea) progressArea.style.display = "none";
        }
    }

    _gmicAbort() {
        this._gmicState.aborted = true;
        this._gmicState.processing = false;
        const openBtn      = document.getElementById("ie-gmic-open-btn");
        const progressArea = document.getElementById("ie-gmic-progress-area");
        if (progressArea) progressArea.style.display = "none";
        if (openBtn) openBtn.disabled = false;
    }

    async _gmicWaitForJob(jobId) {
        const progressLbl = document.getElementById("ie-gmic-progress-lbl");
        const applyBtn    = document.getElementById("ie-gmic-apply-btn");
        const maxWait = 600, interval = 2000;
        const start = Date.now();
        this._gmicState.aborted = false;

        while (true) {
            if (this._gmicState.aborted) throw new Error("__aborted__");
            if ((Date.now() - start) / 1000 > maxWait) throw new Error("Timeout");
            await new Promise(r => setTimeout(r, interval));
            if (this._gmicState.aborted) throw new Error("__aborted__");
            try {
                const res = await fetch(`/api/wfm/gmic/status/${jobId}`);
                if (res.status === 404) throw new Error("__aborted__");
                if (!res.ok) continue;
                const status = await res.json();
                if (status.status === "completed") {
                    this._gmicState.lastResultJobId = jobId;
                    if (applyBtn) applyBtn.disabled = false;
                    if (progressLbl) progressLbl.textContent = "処理完了 → 「結果を反映」で画像に適用";
                    this._gmicState.processing = false;
                    showToast("G'MIC filtering complete. Click Apply to insert result.", "success");
                    return;
                }
                if (status.status === "failed") {
                    if (progressLbl) progressLbl.textContent = status.error || "G'MIC GUIがキャンセルされました";
                    throw new Error("__aborted__");
                }
                if (progressLbl) progressLbl.textContent = status.message || "G'MIC GUIで編集中...";
            } catch (e) {
                if (e.message === "__aborted__" || e.message.includes("Timeout")) throw e;
            }
        }
    }

    async _gmicApplyResult() {
        if (!this._gmicState.lastResultJobId) {
            showToast("No G'MIC result to apply", "error");
            return;
        }
        const applyBtn = document.getElementById("ie-gmic-apply-btn");
        const openBtn  = document.getElementById("ie-gmic-open-btn");
        const progressArea = document.getElementById("ie-gmic-progress-area");
        if (applyBtn) applyBtn.disabled = true;

        try {
            const statusRes = await fetch(`/api/wfm/gmic/status/${this._gmicState.lastResultJobId}`);
            if (!statusRes.ok) throw new Error(`HTTP ${statusRes.status}`);
            const statusData = await statusRes.json();
            if (!statusData.result_path) throw new Error("No result path found");

            const b64res = await fetch("/api/wfm/gmic/result", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ result_path: statusData.result_path })
            });
            if (!b64res.ok) throw new Error(`HTTP ${b64res.status}`);
            const { image_b64: dataUrl } = await b64res.json();

            const img = await new Promise((resolve, reject) => {
                const i = new Image();
                i.onload  = () => resolve(i);
                i.onerror = () => reject(new Error("Failed to load result image"));
                i.src = dataUrl;
            });

            this._saveUndo();

            const layer = this._layerMgr.activeLayer;
            if (!layer) throw new Error("No active layer");

            layer.canvas.width  = img.width;
            layer.canvas.height = img.height;
            layer.ctx = layer.canvas.getContext("2d");
            layer.ctx.drawImage(img, 0, 0);

            this._updateCompositeView();
            this._refreshLayerList();
            showToast("G'MIC filter applied successfully", "success");

            // Reset G'MIC status
            this._gmicState.lastResultJobId = null;
            this._gmicState.processing = false;
            if (openBtn) openBtn.disabled = false;
            if (progressArea) progressArea.style.display = "none";
            this._renderToolOptions("filter");
        } catch (err) {
            showToast("Failed to apply G'MIC result: " + err.message, "error");
            if (applyBtn) applyBtn.disabled = false;
        }
    }
}

export const imageEditTab = new ImageEditTab();
window._wfmImageEditTab = imageEditTab;

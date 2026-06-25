/**
 * Image Edit Tab
 * Canvas-based image editor with object-based layer support.
 * Phase 1: Draw, Text, Select (move/resize/rotate/flip), Layers, Save/Upload.
 */

import { LayerManager, Layer } from "./image-edit/LayerManager.js";
import { DrawTool }            from "./image-edit/DrawTool.js";
import { TextTool, TEXT_FONTS } from "./image-edit/TextTool.js";
import { SelectTool }          from "./image-edit/SelectTool.js";
import { showToast }           from "./app.js";

const TOOL_DEFS = [
    { id: "select",   icon: "▲",  label: "Select",    ready: true  },
    { id: "draw",     icon: "✏",  label: "Draw",      ready: true  },
    { id: "text",     icon: "T",   label: "Text",      ready: true  },
    { id: "mask",     icon: "🎭",  label: "Mask",      ready: false },
    { id: "blur",     icon: "≈",   label: "Blur",      ready: false },
    { id: "filter",   icon: "★",   label: "Filter",    ready: false },
    { id: "bgremove", icon: "⬚",   label: "BG Remove", ready: false },
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
        this._drawTool      = null;
        this._textTool      = null;
        this._selectTool    = null;
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
        this._editingTextLayer = null; // テキスト再編集中のレイヤー参照
        this._initialized      = false;
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
        if (this._activeTool === "draw")   this._drawTool?.deactivate();
        if (this._activeTool === "text")   this._textTool?.deactivate();
        if (this._activeTool === "select") this._selectTool?.deactivate();

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
            this._drawTool.setCanvas(drawCanvas);
            this._drawTool.activate();
        } else if (this._activeTool === "text" && this._textTool) {
            this._textTool.setCanvas(drawCanvas);
            this._textTool.activate();
        } else if (this._activeTool === "select" && this._selectTool) {
            this._selectTool.setCanvas(overlayCanvas);
            this._selectTool.activate();
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
        } else {
            const def = TOOL_DEFS.find(d => d.id === toolId);
            el.innerHTML = `<span style="font-size:12px;color:var(--wfm-text-secondary);">${def?.label ?? toolId}: coming soon</span>`;
        }
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
            }
        });
        window.addEventListener("mousemove", e => {
            if (!this._panning) return;
            this._panOffset.x = e.clientX - this._panStart.x;
            this._panOffset.y = e.clientY - this._panStart.y;
            this._applyTransform();
        });
        window.addEventListener("mouseup", e => {
            if (this._panning && (e.button === 1 || e.button === 0)) {
                this._panning = false;
                wrap.style.cursor = this._spaceDown ? "grab" : "";
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
            this._saveUndo();
            this._loadActiveLayerToCanvas();
            this._drawTool.onMouseDown(pos.x, pos.y);

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
        }
    }

    _onToolMouseMove(e, refCanvas) {
        if (!this._layerMgr) return;
        const pos = DrawTool.getCanvasPos(refCanvas, e);
        if (this._activeTool === "draw")   this._drawTool?.onMouseMove(pos.x, pos.y);
        if (this._activeTool === "select") this._selectTool?.onMouseMove(pos.x, pos.y);
    }

    _onToolMouseUp(e) {
        if (!this._layerMgr || e.button !== 0) return;
        if (this._activeTool === "draw")   this._drawTool?.onMouseUp();
        if (this._activeTool === "select") this._selectTool?.onMouseUp();
    }

    _onToolMouseLeave() {
        if (this._activeTool === "draw")   this._drawTool?.onMouseLeave();
        if (this._activeTool === "select") this._selectTool?.onMouseLeave();
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

        this._drawTool = new DrawTool(drawCanvas);
        this._drawTool.onChange(() => {
            this._syncActiveLayerFromCanvas();
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
        for (let i = this._layerMgr.layers.length - 1; i >= 0; i--) {
            const layer = this._layerMgr.layers[i];
            if (!layer.visible) continue;
            ctx.save();
            ctx.globalAlpha = layer.opacity;
            ctx.globalCompositeOperation = layer.blendMode;
            Layer.applyTransform(ctx, layer);
            ctx.drawImage(layer.canvas, -layer.canvas.width / 2, -layer.canvas.height / 2);
            ctx.restore();
        }
        this._compositeMode = true;
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
            const typeIcon = layer.type === "image" ? "🖼" : layer.type === "text" ? "T" : "✏";
            return `
                <div class="ie-layer-item ${isActive ? "active" : ""}" data-id="${layer.id}" data-action="select">
                    <button class="ie-layer-vis-btn" data-id="${layer.id}" data-action="vis"
                        title="${layer.visible ? "Hide" : "Show"}">${layer.visible ? "👁" : "🚫"}</button>
                    <button class="ie-layer-vis-btn" data-id="${layer.id}" data-action="lock"
                        title="${layer.locked ? "Unlock" : "Lock"}"
                        style="color:${layer.locked ? "#e2a04a" : "inherit"}">${layer.locked ? "🔒" : "🔓"}</button>
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
                    if (this._activeTool === "select" && layer) {
                        this._selectTool?.setLayer(layer);
                    } else {
                        this._loadActiveLayerToCanvas();
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
        this._syncActiveLayerFromCanvas();
        if (this._layerMgr) this._layerMgr.composite(canvas);
        return canvas;
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
}

export const imageEditTab = new ImageEditTab();
window._wfmImageEditTab = imageEditTab;

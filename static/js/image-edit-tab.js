/**
 * Image Edit Tab
 * Canvas-based image editor with layer support.
 * Phase 1: Draw, Text, Layers, Save/Upload.
 * Other tools (Mask, Blur, Filter, BG Remove) are placeholders.
 */

import { LayerManager }    from "./image-edit/LayerManager.js";
import { DrawTool }        from "./image-edit/DrawTool.js";
import { TextTool, TEXT_FONTS } from "./image-edit/TextTool.js";
import { showToast }       from "./app.js";

const TOOL_DEFS = [
    { id: "draw",     icon: "✏",  label: "Draw",      ready: true  },
    { id: "text",     icon: "T",   label: "Text",      ready: true  },
    { id: "mask",     icon: "🎭",  label: "Mask",      ready: false },
    { id: "blur",     icon: "≈",   label: "Blur",      ready: false },
    { id: "filter",   icon: "★",   label: "Filter",    ready: false },
    { id: "bgremove", icon: "⬚",   label: "BG Remove", ready: false },
];

const UNDO_LIMIT = 20;

class ImageEditTab {
    constructor() {
        this._layerMgr    = null;
        this._activeTool  = "draw";
        this._drawTool    = null;
        this._textTool    = null;
        this._zoom        = 1.0;
        this._panOffset   = { x: 0, y: 0 };
        this._bgImage     = null;
        this._canvasW     = 512;
        this._canvasH     = 512;
        this._undoStack   = [];
        this._redoStack   = [];
        this._panning     = false;
        this._panStart    = null;
        this._spaceDown   = false;
        this._initialized = false;
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
                if (!def?.ready) {
                    showToast(`${def?.label ?? btn.dataset.tool}: coming soon`, "info");
                    return;
                }
                this._setActiveTool(btn.dataset.tool);
            });
        });
    }

    _setActiveTool(toolId) {
        if (this._activeTool === "draw")  this._drawTool?.deactivate();
        if (this._activeTool === "text")  this._textTool?.deactivate();

        this._activeTool = toolId;

        document.querySelectorAll(".ie-tool-btn").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.tool === toolId);
        });

        this._renderToolOptions(toolId);
        this._activateDrawCanvas();
    }

    _activateDrawCanvas() {
        const drawCanvas = document.getElementById("ie-canvas-draw");
        if (!drawCanvas || !this._layerMgr) return;

        if (this._activeTool === "draw" && this._drawTool) {
            this._drawTool.setCanvas(drawCanvas);
            this._drawTool.activate();
        } else if (this._activeTool === "text" && this._textTool) {
            this._textTool.setCanvas(drawCanvas);
            this._textTool.activate();
        }
    }

    _renderToolOptions(toolId) {
        const el = document.getElementById("ie-tool-options");
        if (!el) return;
        el.innerHTML = "";

        if (toolId === "draw" && this._drawTool) {
            el.innerHTML = `
                <div class="ie-opt-group">
                    <label>Color</label>
                    <input type="color" id="ie-draw-color" value="${this._drawTool.color}"
                        style="width:30px;height:24px;padding:0;border:1px solid var(--wfm-border);cursor:pointer;border-radius:3px;">
                </div>
                <div class="ie-opt-group">
                    <label>Size</label>
                    <input type="range" id="ie-draw-size" min="1" max="200" value="${this._drawTool.brushSize}" style="width:80px;">
                    <span id="ie-draw-size-lbl" style="min-width:28px;">${this._drawTool.brushSize}px</span>
                </div>
                <div class="ie-opt-group">
                    <label>Hardness</label>
                    <input type="range" id="ie-draw-hard" min="0" max="100" value="${Math.round(this._drawTool.hardness * 100)}" style="width:70px;">
                    <span id="ie-draw-hard-lbl" style="min-width:28px;">${Math.round(this._drawTool.hardness * 100)}%</span>
                </div>
                <div class="ie-opt-group">
                    <label>Opacity</label>
                    <input type="range" id="ie-draw-opacity" min="1" max="100" value="${Math.round(this._drawTool.opacity * 100)}" style="width:70px;">
                    <span id="ie-draw-opacity-lbl" style="min-width:28px;">${Math.round(this._drawTool.opacity * 100)}%</span>
                </div>
                <div class="ie-opt-group">
                    <label>Mode</label>
                    <select id="ie-draw-mode" class="ie-opt-select">
                        <option value="draw"  ${this._drawTool.mode === "draw"  ? "selected" : ""}>Draw</option>
                        <option value="erase" ${this._drawTool.mode === "erase" ? "selected" : ""}>Erase</option>
                    </select>
                </div>
            `;
            document.getElementById("ie-draw-color")?.addEventListener("input", e => {
                this._drawTool.color = e.target.value;
                this._drawTool._stamp = null;
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
                        ${TEXT_FONTS.map(f => `<option value="${f}" ${this._textTool.fontFamily === f ? "selected" : ""}>${f}</option>`).join("")}
                    </select>
                </div>
                <div class="ie-opt-group" style="gap:4px;">
                    <button class="wfm-btn wfm-btn-sm ${this._textTool.bold   ? "ie-opt-active" : ""}" id="ie-text-bold"  ><b>B</b></button>
                    <button class="wfm-btn wfm-btn-sm ${this._textTool.italic ? "ie-opt-active" : ""}" id="ie-text-italic"><i>I</i></button>
                    <select id="ie-text-align" class="ie-opt-select" style="width:72px;">
                        <option value="left"   ${this._textTool.align === "left"   ? "selected" : ""}>Left</option>
                        <option value="center" ${this._textTool.align === "center" ? "selected" : ""}>Center</option>
                        <option value="right"  ${this._textTool.align === "right"  ? "selected" : ""}>Right</option>
                    </select>
                </div>
            `;
            document.getElementById("ie-text-color")?.addEventListener("input", e => {
                this._textTool.color = e.target.value;
            });
            document.getElementById("ie-text-size")?.addEventListener("change", e => {
                this._textTool.fontSize = parseInt(e.target.value) || 64;
            });
            document.getElementById("ie-text-font")?.addEventListener("change", e => {
                this._textTool.fontFamily = e.target.value;
            });
            document.getElementById("ie-text-bold")?.addEventListener("click", () => {
                this._textTool.bold = !this._textTool.bold;
                this._renderToolOptions("text");
            });
            document.getElementById("ie-text-italic")?.addEventListener("click", () => {
                this._textTool.italic = !this._textTool.italic;
                this._renderToolOptions("text");
            });
            document.getElementById("ie-text-align")?.addEventListener("change", e => {
                this._textTool.align = e.target.value;
            });

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

        document.getElementById("ie-from-gallery-btn")?.addEventListener("click", () => {
            this._openGalleryPicker();
        });

        document.getElementById("ie-undo-btn")?.addEventListener("click", () => this._undo());
        document.getElementById("ie-redo-btn")?.addEventListener("click", () => this._redo());

        document.getElementById("ie-save-btn")?.addEventListener("click", () => this._savePng());
        document.getElementById("ie-upload-comfy-btn")?.addEventListener("click", () => this._uploadToComfyUI());

        document.getElementById("ie-zoom-fit")?.addEventListener("click", () => this._fitToView());
        document.getElementById("ie-zoom-100")?.addEventListener("click", () => {
            this._panOffset = { x: 0, y: 0 };
            this._setZoom(1.0);
        });

        // ドロップゾーン（タブエリア全体）
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

        // Wheel zoom
        wrap.addEventListener("wheel", e => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            this._setZoom(this._zoom * factor);
        }, { passive: false });

        // Middle mouse / Space+drag pan
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

        // drawCanvas 描画イベント
        const drawCanvas = document.getElementById("ie-canvas-draw");
        if (drawCanvas) {
            drawCanvas.addEventListener("mousedown", e => this._onDrawMouseDown(e));
            drawCanvas.addEventListener("mousemove", e => this._onDrawMouseMove(e));
            drawCanvas.addEventListener("mouseup",   e => this._onDrawMouseUp(e));
            drawCanvas.addEventListener("mouseleave",  () => this._onDrawMouseLeave());
        }
    }

    _onDrawMouseDown(e) {
        if (!this._layerMgr || e.button !== 0 || this._spaceDown) return;
        const pos = DrawTool.getCanvasPos(document.getElementById("ie-canvas-draw"), e);

        if (this._activeTool === "draw" && this._drawTool) {
            this._saveUndo();
            this._drawTool.onMouseDown(pos.x, pos.y);
        } else if (this._activeTool === "text" && this._textTool) {
            this._textTool.onMouseDown(pos.x, pos.y);
        }
    }

    _onDrawMouseMove(e) {
        if (!this._layerMgr) return;
        const pos = DrawTool.getCanvasPos(document.getElementById("ie-canvas-draw"), e);
        if (this._activeTool === "draw")  this._drawTool?.onMouseMove(pos.x, pos.y);
    }

    _onDrawMouseUp(e) {
        if (!this._layerMgr || e.button !== 0) return;
        if (this._activeTool === "draw") {
            this._drawTool?.onMouseUp();
            this._syncActiveLayerFromCanvas();
            this._refreshLayerList();
        }
    }

    _onDrawMouseLeave() {
        if (this._activeTool === "draw") this._drawTool?.onMouseLeave();
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

        this._bgImage  = img;
        this._canvasW  = img.width;
        this._canvasH  = img.height;
        this._baseName = baseName;

        this._initCanvases();
        this._renderBg();

        this._layerMgr.addLayer("draw", "Layer 1");
        this._undoStack = [];
        this._redoStack = [];

        this._setActiveTool(this._activeTool);
        this._refreshLayerList();
        this._fitToView();

        document.getElementById("ie-placeholder").style.display = "none";
        showToast(`Loaded: ${img.width}×${img.height}`, "success");
    }

    _initCanvases() {
        const bgCanvas   = document.getElementById("ie-canvas-bg");
        const drawCanvas = document.getElementById("ie-canvas-draw");

        [bgCanvas, drawCanvas].forEach(c => {
            if (c) { c.width = this._canvasW; c.height = this._canvasH; }
        });

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
            this._refreshLayerList();
        });

        this._textTool = new TextTool(drawCanvas);
        this._textTool.onChange(() => {
            this._syncActiveLayerFromCanvas();
            this._refreshLayerList();
        });
    }

    _renderBg() {
        const bgCanvas = document.getElementById("ie-canvas-bg");
        if (!bgCanvas || !this._bgImage) return;
        const ctx = bgCanvas.getContext("2d");
        ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        ctx.drawImage(this._bgImage, 0, 0);
    }

    // アクティブレイヤーの内容を drawCanvas に転写してツールを有効化
    _loadActiveLayerToCanvas() {
        const layer      = this._layerMgr?.activeLayer;
        const drawCanvas = document.getElementById("ie-canvas-draw");
        if (!layer || !drawCanvas) return;
        const ctx = drawCanvas.getContext("2d");
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        ctx.drawImage(layer.canvas, 0, 0);
    }

    // drawCanvas の内容をアクティブレイヤーに保存
    _syncActiveLayerFromCanvas() {
        const layer      = this._layerMgr?.activeLayer;
        const drawCanvas = document.getElementById("ie-canvas-draw");
        if (!layer || !drawCanvas) return;
        layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        layer.ctx.drawImage(drawCanvas, 0, 0);
    }

    // ── ズーム・パン ──────────────────────────────

    _fitToView() {
        const wrap = document.getElementById("ie-canvas-wrap");
        if (!wrap || !this._canvasW) return;
        const ww = wrap.clientWidth  - 40;
        const wh = wrap.clientHeight - 40;
        this._zoom      = Math.min(ww / this._canvasW, wh / this._canvasH, 2.0);
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
        const ww = wrap.clientWidth;
        const wh = wrap.clientHeight;
        const tx = this._panOffset.x + (ww - this._canvasW * this._zoom) / 2;
        const ty = this._panOffset.y + (wh - this._canvasH * this._zoom) / 2;
        container.style.transform = `translate(${tx}px,${ty}px) scale(${this._zoom})`;
        const zoomLabel = document.getElementById("ie-zoom-label");
        if (zoomLabel) zoomLabel.textContent = Math.round(this._zoom * 100) + "%";
    }

    // ── レイヤーパネル ────────────────────────────

    _setupLayerPanel() {
        document.getElementById("ie-add-layer-btn")?.addEventListener("click", () => {
            if (!this._layerMgr) return;
            this._syncActiveLayerFromCanvas();
            this._saveUndo();
            this._layerMgr.addLayer("draw", `Layer ${this._layerMgr.layers.length + 1}`);
            this._loadActiveLayerToCanvas();
            this._activateDrawCanvas();
        });

        document.getElementById("ie-del-layer-btn")?.addEventListener("click", () => {
            if (!this._layerMgr || this._layerMgr.layers.length <= 1) return;
            this._saveUndo();
            const active = this._layerMgr.activeLayer;
            if (active) this._layerMgr.deleteLayer(active.id);
            this._loadActiveLayerToCanvas();
            this._activateDrawCanvas();
        });

        document.getElementById("ie-layer-up-btn")?.addEventListener("click", () => {
            if (!this._layerMgr) return;
            const active = this._layerMgr.activeLayer;
            if (active) this._layerMgr.moveUp(active.id);
        });

        document.getElementById("ie-layer-down-btn")?.addEventListener("click", () => {
            if (!this._layerMgr) return;
            const active = this._layerMgr.activeLayer;
            if (active) this._layerMgr.moveDown(active.id);
        });

        document.getElementById("ie-layer-opacity")?.addEventListener("input", e => {
            if (!this._layerMgr) return;
            const v = parseInt(e.target.value) / 100;
            const active = this._layerMgr.activeLayer;
            if (active) this._layerMgr.setOpacity(active.id, v);
            const lbl = document.getElementById("ie-layer-opacity-label");
            if (lbl) lbl.textContent = e.target.value + "%";
        });
    }

    _refreshLayerList() {
        const el = document.getElementById("ie-layer-list");
        if (!el || !this._layerMgr) return;

        el.innerHTML = this._layerMgr.layers.map((layer, i) => {
            const isActive = i === this._layerMgr.activeIndex;
            return `
                <div class="ie-layer-item ${isActive ? "active" : ""}" data-id="${layer.id}" data-action="select">
                    <button class="ie-layer-vis-btn" data-id="${layer.id}" data-action="vis"
                        title="${layer.visible ? "Hide" : "Show"}">${layer.visible ? "👁" : "🚫"}</button>
                    <img class="ie-layer-thumb" src="${layer.getThumbnailDataURL()}" draggable="false">
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
                } else if (action === "select") {
                    this._syncActiveLayerFromCanvas();
                    this._layerMgr.setActive(id);
                    this._loadActiveLayerToCanvas();
                    this._activateDrawCanvas();
                    // Opacity スライダー更新
                    const layer = this._layerMgr.activeLayer;
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
        this._loadActiveLayerToCanvas();
        this._activateDrawCanvas();
        this._refreshLayerList();
    }

    // ── 合成・保存 ─────────────────────────────────

    _buildCompositeCanvas() {
        const canvas = document.createElement("canvas");
        canvas.width  = this._canvasW;
        canvas.height = this._canvasH;
        const ctx = canvas.getContext("2d");
        if (this._bgImage) ctx.drawImage(this._bgImage, 0, 0);
        // 現在描画中のレイヤーを同期してから合成
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

    // ── ギャラリー連携 ────────────────────────────

    _openGalleryPicker() {
        // ギャラリータブの選択状態を参照する
        const gallerySelected = window._wfmGallerySelectedUrl;
        if (gallerySelected) {
            this.loadFromUrl(gallerySelected);
        } else {
            showToast('Select an image in the Gallery tab first, then click "Edit in Image Edit"', "info");
        }
    }

    /** 他タブ・外部から画像URLを受け取ってロードする */
    async loadFromUrl(url) {
        try {
            const r       = await fetch(url);
            const blob    = await r.blob();
            const dataUrl = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.readAsDataURL(blob);
            });
            const name = url.split("/").pop().split("?")[0].replace(/\.[^.]+$/, "") || "gallery-image";
            await this._loadFromDataUrl(dataUrl, name);
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
            if (e.key === "b" && !e.ctrlKey) this._setActiveTool("draw");
            if (e.key === "t" && !e.ctrlKey) this._setActiveTool("text");
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
}

export const imageEditTab = new ImageEditTab();

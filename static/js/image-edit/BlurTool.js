/**
 * Image Edit Tab - Blur / Mosaic Tool
 * Whole-layer blur/mosaic buttons plus a drag-to-select rectangle mode
 * that applies blur or mosaic to just the dragged region.
 */

import { showToast } from "../app.js";

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

export class BlurTool {
    /**
     * @param {object} callbacks
     * @param {() => object|null} callbacks.getLayerManager
     * @param {() => number} callbacks.getZoom
     * @param {() => void} callbacks.saveUndo
     * @param {() => void} callbacks.updateCompositeView
     * @param {() => void} callbacks.refreshLayerList
     * @param {(toolId: string) => void} callbacks.renderToolOptions
     */
    constructor(callbacks) {
        this._cb = callbacks;
        this.rectMode  = null;   // null | 'blur' | 'mosaic'
        this._dragging  = false;
        this._dragStart = null;
        this._dragCur   = null;
    }

    activate() {
        const overlay = document.getElementById("ie-canvas-overlay");
        if (overlay) overlay.style.cursor = this.rectMode ? "crosshair" : "default";
    }

    deactivate() {
        this.rectMode  = null;
        this._dragging = false;
        const overlay = document.getElementById("ie-canvas-overlay");
        if (overlay) {
            overlay.style.cursor = "";
            overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
        }
    }

    renderPanel(el) {
        const blurOn   = this.rectMode === "blur";
        const mosaicOn = this.rectMode === "mosaic";
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
            this.applyWholeBlur(parseInt(document.getElementById("ie-whole-blur").value));
        });
        document.getElementById("ie-whole-mosaic-apply")?.addEventListener("click", () => {
            this.applyWholeMosaic(parseInt(document.getElementById("ie-whole-mosaic").value));
        });
        document.getElementById("ie-rect-blur-toggle")?.addEventListener("click", () => {
            this.rectMode = this.rectMode === "blur" ? null : "blur";
            this._cb.renderToolOptions("blur");
            const ov = document.getElementById("ie-canvas-overlay");
            if (ov) ov.style.cursor = this.rectMode ? "crosshair" : "default";
        });
        document.getElementById("ie-rect-mosaic-toggle")?.addEventListener("click", () => {
            this.rectMode = this.rectMode === "mosaic" ? null : "mosaic";
            this._cb.renderToolOptions("blur");
            const ov = document.getElementById("ie-canvas-overlay");
            if (ov) ov.style.cursor = this.rectMode ? "crosshair" : "default";
        });
        document.getElementById("ie-rect-blur")?.addEventListener("input", e => {
            document.getElementById("ie-rect-blur-val").textContent = e.target.value;
        });
        document.getElementById("ie-rect-mosaic")?.addEventListener("input", e => {
            document.getElementById("ie-rect-mosaic-val").textContent = e.target.value;
        });
    }

    onMouseDown(pos) {
        if (!this.rectMode) return;
        this._dragging  = true;
        this._dragStart = { x: pos.x, y: pos.y };
        this._dragCur   = { x: pos.x, y: pos.y };
    }

    onMouseMove(pos) {
        if (!this._dragging) return;
        this._dragCur = pos;
        this._drawPreview();
    }

    onMouseUp() {
        if (!this._dragging) return;
        this._dragging = false;
        this._applyRectEffect();
        const overlay = document.getElementById("ie-canvas-overlay");
        if (overlay) overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
    }

    onMouseLeave() {
        if (!this._dragging) return;
        this._dragging = false;
        const overlay = document.getElementById("ie-canvas-overlay");
        if (overlay) overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
    }

    applyWholeBlur(amount) {
        const layerMgr = this._cb.getLayerManager();
        if (!layerMgr) return;
        const layer = layerMgr.activeLayer;
        if (!layer) { showToast("No active layer", "error"); return; }
        this._cb.saveUndo();
        const w = layer.canvas.width, h = layer.canvas.height;
        const tmp = document.createElement("canvas");
        tmp.width = w; tmp.height = h;
        const tc = tmp.getContext("2d");
        tc.filter = `blur(${amount}px)`;
        tc.drawImage(layer.canvas, 0, 0);
        layer.ctx.clearRect(0, 0, w, h);
        layer.ctx.drawImage(tmp, 0, 0);
        this._cb.updateCompositeView();
        this._cb.refreshLayerList();
    }

    applyWholeMosaic(size) {
        const layerMgr = this._cb.getLayerManager();
        if (!layerMgr) return;
        const layer = layerMgr.activeLayer;
        if (!layer) { showToast("No active layer", "error"); return; }
        this._cb.saveUndo();
        _applyMosaicToRegion(layer.ctx, 0, 0, layer.canvas.width, layer.canvas.height, size);
        this._cb.updateCompositeView();
        this._cb.refreshLayerList();
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

    _drawPreview() {
        const overlay = document.getElementById("ie-canvas-overlay");
        if (!overlay) return;
        const ctx = overlay.getContext("2d");
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        const s = this._dragStart, c = this._dragCur;
        if (!s || !c) return;
        const x = Math.min(s.x, c.x), y = Math.min(s.y, c.y);
        const w = Math.abs(c.x - s.x), h = Math.abs(c.y - s.y);
        const zoom = this._cb.getZoom();
        ctx.strokeStyle = this.rectMode === "blur" ? "#4af" : "#fa4";
        ctx.lineWidth   = 1 / zoom;
        ctx.setLineDash([4 / zoom, 2 / zoom]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
    }

    _applyRectEffect() {
        const layer = this._cb.getLayerManager()?.activeLayer;
        if (!layer || !this._dragStart || !this._dragCur) return;
        const s = this._dragStart, c = this._dragCur;
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

        this._cb.saveUndo();

        if (this.rectMode === "blur") {
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

        this._cb.updateCompositeView();
        this._cb.refreshLayerList();
    }
}

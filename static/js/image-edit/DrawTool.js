/**
 * Image Edit Tab - Draw Tool
 * Inspired by comfyui-mask-editor-one PaintTool.js
 * Supports color drawing and erasing with a soft round brush.
 */

export class DrawTool {
    constructor(canvas) {
        this.canvas      = canvas;
        this.ctx         = canvas.getContext("2d");
        this.brushSize   = 20;
        this.hardness    = 0.8;   // 0.0 = very soft, 1.0 = hard edge
        this.opacity     = 1.0;
        this.color       = "#ff0000";
        this.mode        = "draw"; // "draw" | "erase"

        this._drawing    = false;
        this._lastX      = 0;
        this._lastY      = 0;

        // Cached stamp canvas
        this._stamp      = null;
        this._stampSize  = 0;
        this._stampHard  = 0;
        this._stampColor = null;

        this._onChange   = null;
    }

    setCanvas(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext("2d");
        this._stamp = null;
    }

    onChange(fn) { this._onChange = fn; }

    activate() {
        this.canvas.style.cursor = "crosshair";
    }

    deactivate() {
        this._drawing = false;
        this.canvas.style.cursor = "";
    }

    onMouseDown(x, y) {
        this._drawing = true;
        this._lastX = x;
        this._lastY = y;
        this._paint(x, y);
    }

    onMouseMove(x, y) {
        if (!this._drawing) return;
        this._paintLine(this._lastX, this._lastY, x, y);
        this._lastX = x;
        this._lastY = y;
    }

    onMouseUp() {
        if (this._drawing) {
            this._drawing = false;
            if (this._onChange) this._onChange();
        }
    }

    onMouseLeave() {
        if (this._drawing) this.onMouseUp();
    }

    _getStamp() {
        if (
            this._stamp &&
            this._stampSize  === this.brushSize &&
            this._stampHard  === this.hardness &&
            this._stampColor === this.color
        ) return this._stamp;

        const size = Math.max(1, Math.round(this.brushSize));
        const sc   = document.createElement("canvas");
        sc.width   = size;
        sc.height  = size;
        const sctx = sc.getContext("2d");
        const cx = size / 2, cy = size / 2, r = size / 2;

        const innerR = r * (1 - Math.min(this.hardness, 0.99)) * 0.95;
        const grd = sctx.createRadialGradient(cx, cy, innerR, cx, cy, r);
        grd.addColorStop(0, this.color);
        grd.addColorStop(1, this.color + "00");
        sctx.fillStyle = grd;
        sctx.beginPath();
        sctx.arc(cx, cy, r, 0, Math.PI * 2);
        sctx.fill();

        this._stamp      = sc;
        this._stampSize  = size;
        this._stampHard  = this.hardness;
        this._stampColor = this.color;
        return sc;
    }

    _paint(x, y) {
        const stamp = this._getStamp();
        const s     = stamp.width;
        this.ctx.save();
        this.ctx.globalAlpha = this.opacity;
        if (this.mode === "erase") {
            this.ctx.globalCompositeOperation = "destination-out";
        }
        this.ctx.drawImage(stamp, x - s / 2, y - s / 2);
        this.ctx.restore();
    }

    _paintLine(x0, y0, x1, y1) {
        const dist    = Math.hypot(x1 - x0, y1 - y0);
        const spacing = Math.max(1, this.brushSize * 0.2);
        const steps   = Math.max(1, Math.ceil(dist / spacing));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            this._paint(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        }
    }

    static getCanvasPos(canvas, event) {
        const rect   = canvas.getBoundingClientRect();
        const scaleX = canvas.width  / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top)  * scaleY,
        };
    }
}

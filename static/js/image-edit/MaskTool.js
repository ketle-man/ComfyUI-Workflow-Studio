/**
 * Image Edit Tab - Mask Tool
 * White-paint / erase brush for mask layers.
 * paint mode: draws white (opaque) = mask present
 * erase mode: destination-out (transparent) = mask absent
 *
 * Supports circular soft brush (built-in) and image brushes loaded
 * from Mask Editor One's ABR brush library (optional).
 */

export class MaskTool {
    constructor(canvas) {
        this.canvas      = canvas;
        this.ctx         = canvas?.getContext("2d");
        this.brushSize   = 30;
        this.hardness    = 0.85;
        this.spacing     = 0.25;   // stamp interval as fraction of brushSize (image brush only)
        this.mode        = "paint"; // "paint" | "erase"

        // Image brush from ABR library (null = default circle brush)
        this.brushImage       = null;
        this.brushName        = "Circle";
        this.angle            = 0;      // degrees [0, 359]
        this.sizeJitter       = false;
        this.sizeJitterAmount = 0.5;    // 0–1: fraction of brushSize that can be removed
        this.rotationJitter   = false;

        this._drawing    = false;
        this._lastX      = 0;
        this._lastY      = 0;

        // Cached circle stamp
        this._stamp      = null;
        this._stampSize  = 0;
        this._stampHard  = 0;
        this._stampMode  = null;

        // Cached image stamp
        this._imgStamp     = null;
        this._imgStampSize = 0;
        this._imgStampImg  = null;

        // Stroke buffer: prevents intra-stroke opacity accumulation (image brush only)
        this._baseCanvas   = null;
        this._strokeCanvas = null;
        this._strokeCtx    = null;

        this._onChange   = null;
    }

    setCanvas(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext("2d");
        this._stamp    = null;
        this._imgStamp = null;
    }

    onChange(fn) { this._onChange = fn; }

    setImageBrush(img, name) {
        this.brushImage = img;
        this.brushName  = name;
        this._imgStamp  = null;
    }

    clearImageBrush() {
        this.brushImage = null;
        this.brushName  = "Circle";
        this._stamp     = null;
        this._imgStamp  = null;
    }

    activate() {
        if (this.canvas) this.canvas.style.cursor = "none";
    }

    deactivate() {
        this._drawing = false;
        this._clearStrokeBuffer();
        if (this.canvas) this.canvas.style.cursor = "";
    }

    onMouseDown(x, y) {
        this._drawing = true;
        this._lastX   = x;
        this._lastY   = y;
        if (this.brushImage) {
            this._initStrokeBuffer();
            this._paintToStroke(x, y);
            this._mergeStroke();
        } else {
            this._paint(x, y);
        }
    }

    onMouseMove(x, y) {
        if (!this._drawing) return;
        if (this.brushImage) {
            this._paintLineToStroke(this._lastX, this._lastY, x, y);
            this._mergeStroke();
        } else {
            this._paintLine(this._lastX, this._lastY, x, y);
        }
        this._lastX = x;
        this._lastY = y;
    }

    onMouseUp() {
        if (this._drawing) {
            this._drawing = false;
            this._clearStrokeBuffer();
            if (this._onChange) this._onChange();
        }
    }

    onMouseLeave() {
        if (this._drawing) this.onMouseUp();
    }

    // ── Stroke buffer (image brush only) ─────────────────────────────

    _initStrokeBuffer() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this._baseCanvas        = document.createElement("canvas");
        this._baseCanvas.width  = w;
        this._baseCanvas.height = h;
        this._baseCanvas.getContext("2d").drawImage(this.canvas, 0, 0);
        this._strokeCanvas        = document.createElement("canvas");
        this._strokeCanvas.width  = w;
        this._strokeCanvas.height = h;
        this._strokeCtx = this._strokeCanvas.getContext("2d");
    }

    _clearStrokeBuffer() {
        this._baseCanvas   = null;
        this._strokeCanvas = null;
        this._strokeCtx    = null;
    }

    _mergeStroke() {
        const ctx = this.ctx;
        const w   = this.canvas.width;
        const h   = this.canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(this._baseCanvas, 0, 0);
        ctx.globalCompositeOperation = this.mode === "erase" ? "destination-out" : "lighten";
        ctx.drawImage(this._strokeCanvas, 0, 0);
        ctx.globalCompositeOperation = "source-over";
    }

    _paintToStroke(x, y) {
        const saved = this.ctx;
        this.ctx = this._strokeCtx;

        if (this.sizeJitter || this.rotationJitter) {
            const savedSize      = this.brushSize;
            const savedAngle     = this.angle;
            const savedStamp     = this._imgStamp;
            const savedStampSize = this._imgStampSize;
            if (this.sizeJitter) {
                this.brushSize = Math.max(1, savedSize * (1 - Math.random() * this.sizeJitterAmount));
            }
            if (this.rotationJitter) {
                this.angle = Math.random() * 360;
            }
            this._paintImageBrush(x, y);
            this.brushSize     = savedSize;
            this.angle         = savedAngle;
            this._imgStamp     = savedStamp;
            this._imgStampSize = savedStampSize;
        } else {
            this._paintImageBrush(x, y);
        }

        this.ctx = saved;
    }

    _paintLineToStroke(x0, y0, x1, y1) {
        const dist  = Math.hypot(x1 - x0, y1 - y0);
        const step  = Math.max(1, this.brushSize * this.spacing);
        const steps = Math.ceil(dist / step);
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            this._paintToStroke(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        }
    }

    // ── Circle brush ─────────────────────────────────────────────────

    _getStamp() {
        if (
            this._stamp &&
            this._stampSize === this.brushSize &&
            this._stampHard === this.hardness &&
            this._stampMode === this.mode
        ) return this._stamp;

        const size  = Math.max(1, Math.round(this.brushSize));
        const sc    = document.createElement("canvas");
        sc.width    = size;
        sc.height   = size;
        const sctx  = sc.getContext("2d");
        const cx = size / 2, cy = size / 2, r = size / 2;

        const color      = this.mode === "paint" ? "#ffffff" : "#000000";
        const colorAlpha = this.mode === "paint" ? "rgba(255,255,255,0)" : "rgba(0,0,0,0)";

        const innerR = r * (1 - Math.min(this.hardness, 0.99)) * 0.95;
        const grd = sctx.createRadialGradient(cx, cy, innerR, cx, cy, r);
        grd.addColorStop(0, color);
        grd.addColorStop(1, colorAlpha);
        sctx.fillStyle = grd;
        sctx.beginPath();
        sctx.arc(cx, cy, r, 0, Math.PI * 2);
        sctx.fill();

        this._stamp     = sc;
        this._stampSize = size;
        this._stampHard = this.hardness;
        this._stampMode = this.mode;
        return sc;
    }

    _paint(x, y) {
        const stamp = this._getStamp();
        const s     = stamp.width;
        this.ctx.save();
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

    // ── Image brush ──────────────────────────────────────────────────

    _getImageStamp(size) {
        size = Math.max(1, size);
        if (
            this._imgStamp     &&
            this._imgStampSize === size &&
            this._imgStampImg  === this.brushImage
        ) return this._imgStamp;

        const img    = this.brushImage;
        const srcW   = img.naturalWidth  || img.width;
        const srcH   = img.naturalHeight || img.height;
        const aspect = (srcW > 0 && srcH > 0) ? srcW / srcH : 1;

        const stampH = size;
        const stampW = Math.max(1, Math.round(size * aspect));

        const sc  = document.createElement("canvas");
        sc.width  = stampW;
        sc.height = stampH;
        const stx = sc.getContext("2d");
        stx.drawImage(img, 0, 0, stampW, stampH);

        const imgData = stx.getImageData(0, 0, stampW, stampH);
        const d = imgData.data;

        // Detect alpha channel (ABR-exported PNGs carry alpha = brush density)
        let hasAlpha = false;
        for (let i = 3; i < d.length; i += 4) {
            if (d[i] < 250) { hasAlpha = true; break; }
        }

        let invertLum = false;
        if (!hasAlpha) {
            const corners = [0, stampW - 1, stampW * (stampH - 1), stampW * stampH - 1];
            let bgLum = 0;
            for (const ci of corners) {
                const ii = ci * 4;
                bgLum += (d[ii] * 0.299 + d[ii + 1] * 0.587 + d[ii + 2] * 0.114) / 255;
            }
            invertLum = (bgLum / corners.length) > 0.5;
        }

        // Convert to white pixels; alpha = brush density
        for (let i = 0; i < d.length; i += 4) {
            let alpha;
            if (hasAlpha) {
                alpha = d[i + 3] / 255;
            } else {
                const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
                alpha = invertLum ? 1 - lum : lum;
            }
            d[i] = d[i + 1] = d[i + 2] = 255;
            d[i + 3] = Math.round(alpha * 255);
        }
        stx.putImageData(imgData, 0, 0);

        this._imgStamp     = sc;
        this._imgStampSize = size;
        this._imgStampImg  = this.brushImage;
        return sc;
    }

    _paintImageBrush(x, y) {
        const stamp = this._getImageStamp(Math.round(this.brushSize));
        this.ctx.globalCompositeOperation = "source-over";
        if (this.angle) {
            this.ctx.save();
            this.ctx.translate(Math.round(x), Math.round(y));
            this.ctx.rotate((this.angle * Math.PI) / 180);
            this.ctx.drawImage(stamp, -stamp.width / 2, -stamp.height / 2);
            this.ctx.restore();
        } else {
            this.ctx.drawImage(stamp, Math.round(x - stamp.width / 2), Math.round(y - stamp.height / 2));
        }
        this.ctx.globalCompositeOperation = "source-over";
    }
}

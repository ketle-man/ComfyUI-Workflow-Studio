/**
 * ShapeTool — rect / ellipse / line / freeline drawing tool for Image Edit tab.
 * Preview is drawn on the overlay canvas; committed shapes become new draw layers.
 */
export class ShapeTool {
    constructor() {
        // shape settings
        this.shape       = "rect";
        this.rounded     = false;
        this.fillColor   = "#ff0000";
        this.fillNone    = false;
        this.strokeColor = "#000000";
        this.strokeNone  = true;
        this.strokeWidth = 5;
        this.opacity     = 1.0;

        // internal state
        this._active    = false;
        this._canvas    = null;  // overlay canvas (preview)
        this._ctx       = null;
        this._dragging  = false;
        this._dragStart = null;
        this._curPt     = null;
        this._points    = [];    // freeline points

        this._onChange = null;
    }

    // overlay canvas used for live preview
    setCanvas(canvas) {
        this._canvas = canvas;
        this._ctx    = canvas ? canvas.getContext("2d") : null;
    }

    onChange(cb) { this._onChange = cb; }

    activate() {
        this._active = true;
    }

    deactivate() {
        this._active   = false;
        this._dragging = false;
        this._clearOverlay();
        if (this._canvas) this._canvas.style.cursor = "";
    }

    onMouseDown(x, y) {
        if (!this._active) return;
        this._dragging  = true;
        this._dragStart = { x, y };
        this._curPt     = { x, y };
        this._points    = this.shape === "freeline" ? [{ x, y }] : [];
    }

    onMouseMove(x, y) {
        if (!this._dragging) return;
        this._curPt = { x, y };
        if (this.shape === "freeline") this._points.push({ x, y });
        this._drawPreview(x, y);
    }

    onMouseUp() {
        if (!this._dragging) return;
        this._dragging = false;
        this._clearOverlay();
        this._commit();
    }

    onMouseLeave() {
        if (!this._dragging) return;
        this._dragging = false;
        this._clearOverlay();
        this._commit();
    }

    // ── private ───────────────────────────────────────

    _clearOverlay() {
        if (this._ctx && this._canvas) {
            this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        }
    }

    _drawPreview(curX, curY) {
        if (!this._ctx || !this._canvas) return;
        const ctx = this._ctx;
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        const s = this._dragStart;
        ctx.save();
        ctx.globalAlpha = this.opacity;

        if (this.shape === "freeline") {
            // freeline: always draw with stroke color (strokeNone has no meaning here)
            if (this._points.length >= 2) {
                ctx.strokeStyle = this.strokeColor;
                ctx.lineWidth   = this.strokeWidth;
                ctx.lineCap     = "round";
                ctx.lineJoin    = "round";
                ctx.beginPath();
                ctx.moveTo(this._points[0].x, this._points[0].y);
                for (let i = 1; i < this._points.length; i++) ctx.lineTo(this._points[i].x, this._points[i].y);
                ctx.stroke();
            }
        } else {
            // dashed blue outline for rect / ellipse / line
            ctx.strokeStyle = "#0077ff";
            ctx.lineWidth   = Math.max(1, this.strokeWidth || 1);
            ctx.setLineDash([4, 2]);

            const x1 = Math.min(s.x, curX), y1 = Math.min(s.y, curY);
            const w  = Math.abs(curX - s.x),  h  = Math.abs(curY - s.y);

            if (this.shape === "ellipse") {
                ctx.beginPath();
                ctx.ellipse(x1 + w / 2, y1 + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
                ctx.stroke();
            } else if (this.shape === "line") {
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(curX, curY);
                ctx.stroke();
            } else {
                // rect
                if (this.rounded) {
                    const r = Math.min(w, h) * 0.15;
                    ctx.beginPath();
                    ctx.roundRect(x1, y1, w, h, r);
                    ctx.stroke();
                } else {
                    ctx.strokeRect(x1, y1, w, h);
                }
            }
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    _commit() {
        const s = this._dragStart, c = this._curPt;
        if (!s || !c) return;

        const isFreehand = this.shape === "freeline";
        const dx = Math.abs(c.x - s.x), dy = Math.abs(c.y - s.y);
        if (!isFreehand && dx < 2 && dy < 2) return;
        if (isFreehand && this._points.length < 2) return;

        const isStrokeMandatory = ["line", "freeline"].includes(this.shape);
        const shapeObj = {
            kind:        this.shape,
            s:           { ...s },
            c:           { ...c },
            points:      isFreehand ? this._points.map(p => ({ ...p })) : [],
            fillColor:   this.fillNone   ? null : this.fillColor,
            // line / freeline always use stroke; ignore strokeNone
            strokeColor: (isStrokeMandatory || !this.strokeNone) ? this.strokeColor : null,
            strokeWidth: (isStrokeMandatory || !this.strokeNone) ? this.strokeWidth : 0,
            opacity:     this.opacity,
            rounded:     this.rounded,
        };

        this._onChange?.(shapeObj);
    }

    // ── static renderer (used by onChange callback to bake shape into layer) ──

    static drawShape(ctx, sh) {
        const { kind, s, c, points, fillColor, strokeColor, strokeWidth, opacity, rounded } = sh;
        ctx.save();
        ctx.globalAlpha = opacity ?? 1;

        if (kind === "freeline") {
            if (strokeColor && strokeWidth > 0 && points.length >= 2) {
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth   = strokeWidth;
                ctx.lineCap     = "round";
                ctx.lineJoin    = "round";
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
                ctx.stroke();
            }
        } else if (kind === "ellipse") {
            const x1 = Math.min(s.x, c.x), y1 = Math.min(s.y, c.y);
            const w  = Math.abs(c.x - s.x),  h  = Math.abs(c.y - s.y);
            ctx.beginPath();
            ctx.ellipse(x1 + w / 2, y1 + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
            if (fillColor)                       { ctx.fillStyle   = fillColor;   ctx.fill();   }
            if (strokeColor && strokeWidth > 0)  { ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeWidth; ctx.stroke(); }
        } else if (kind === "line") {
            if (strokeColor && strokeWidth > 0) {
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth   = strokeWidth;
                ctx.lineCap     = "round";
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(c.x, c.y);
                ctx.stroke();
            }
        } else {
            // rect
            const x1 = Math.min(s.x, c.x), y1 = Math.min(s.y, c.y);
            const w  = Math.abs(c.x - s.x),  h  = Math.abs(c.y - s.y);
            if (rounded) {
                const r = Math.min(w, h) * 0.15;
                ctx.beginPath();
                ctx.roundRect(x1, y1, w, h, r);
            } else {
                ctx.beginPath();
                ctx.rect(x1, y1, w, h);
            }
            if (fillColor)                       { ctx.fillStyle   = fillColor;   ctx.fill();   }
            if (strokeColor && strokeWidth > 0)  { ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeWidth; ctx.stroke(); }
        }
        ctx.restore();
    }

    // coordinate helper (same signature as DrawTool.getCanvasPos)
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

/**
 * Image Edit Tab - Mask Editor One 互換追加ツール
 * Color, Alpha, Text, Vector, Shape の各マスクツール。
 * マスクレイヤー canvas に直接白（add）または destination-out（erase）で描画する。
 */

// ── Color Tool ───────────────────────────────────────────────────────────────
// bgCanvas（背景合成画像）のクリック色に近いピクセルをマスク選択する。
export class MaskColorTool {
    constructor() {
        this.tolerance  = 40;   // 0-255
        this.feather    = 5;    // 0-100 (tolerance に対する%)
        this.mode       = "add"; // "add" | "subtract"
        this._canvas    = null;
        this._ctx       = null;
        this._bgCanvas  = null;
        this._onChange  = null;
    }

    setCanvas(canvas) { this._canvas = canvas; this._ctx = canvas.getContext("2d"); }
    setBgCanvas(canvas) { this._bgCanvas = canvas; }
    onChange(fn) { this._onChange = fn; }

    activate()   { if (this._canvas) this._canvas.style.cursor = "crosshair"; }
    deactivate() { if (this._canvas) this._canvas.style.cursor = ""; }

    onMouseDown(x, y) { this._selectByColor(Math.round(x), Math.round(y)); }
    onMouseMove() {}
    onMouseUp()   {}
    onMouseLeave() {}

    _selectByColor(px, py) {
        if (!this._bgCanvas || !this._ctx || !this._canvas) return;
        const bgCtx = this._bgCanvas.getContext("2d");
        const bw = this._bgCanvas.width;
        const bh = this._bgCanvas.height;
        if (bw === 0 || bh === 0) return;

        const srcData = bgCtx.getImageData(0, 0, bw, bh);
        const dw = this._canvas.width;
        const dh = this._canvas.height;
        const sx = bw / dw;
        const sy = bh / dh;

        const bpx = Math.min(bw - 1, Math.round(px * sx));
        const bpy = Math.min(bh - 1, Math.round(py * sy));
        const idx = (bpy * bw + bpx) * 4;
        if (idx < 0 || idx + 3 >= srcData.data.length) return;

        const tr = srcData.data[idx];
        const tg = srcData.data[idx + 1];
        const tb = srcData.data[idx + 2];

        const outData = new Uint8ClampedArray(dw * dh * 4);
        const tol = this.tolerance;

        for (let dy = 0; dy < dh; dy++) {
            for (let dx = 0; dx < dw; dx++) {
                const bx = Math.min(bw - 1, Math.round(dx * sx));
                const by = Math.min(bh - 1, Math.round(dy * sy));
                const si = (by * bw + bx) * 4;
                const r = srcData.data[si];
                const g = srcData.data[si + 1];
                const b = srcData.data[si + 2];
                const dist = Math.sqrt((r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2);

                let alpha;
                if (tol <= 0) {
                    alpha = dist === 0 ? 255 : 0;
                } else {
                    const fStart = tol * (1 - this.feather / 100);
                    if (dist <= fStart)   alpha = 255;
                    else if (dist <= tol) alpha = Math.round(255 * (1 - (dist - fStart) / (tol - fStart)));
                    else                  alpha = 0;
                }

                const j = (dy * dw + dx) * 4;
                outData[j] = outData[j + 1] = outData[j + 2] = 255;
                outData[j + 3] = alpha;
            }
        }

        const tmp = document.createElement("canvas");
        tmp.width = dw; tmp.height = dh;
        tmp.getContext("2d").putImageData(new ImageData(outData, dw, dh), 0, 0);

        const ctx = this._ctx;
        ctx.globalCompositeOperation = this.mode === "subtract" ? "destination-out" : "lighten";
        ctx.drawImage(tmp, 0, 0);
        ctx.globalCompositeOperation = "source-over";

        if (this._onChange) this._onChange();
    }
}

// ── Alpha Tool ───────────────────────────────────────────────────────────────
// 元画像のアルファチャンネルをマスクとして抽出する。
export class MaskAlphaTool {
    constructor() {
        this.threshold = 128;   // 0-255
        this.invert    = false;
        this._canvas   = null;
        this._ctx      = null;
        this._srcImg   = null;  // HTMLImageElement or HTMLCanvasElement
        this._onChange = null;
    }

    setCanvas(canvas)  { this._canvas = canvas; this._ctx = canvas.getContext("2d"); }
    setSourceImage(img) { this._srcImg = img; }
    onChange(fn) { this._onChange = fn; }

    activate()   { if (this._canvas) this._canvas.style.cursor = "default"; }
    deactivate() { if (this._canvas) this._canvas.style.cursor = ""; }

    onMouseDown() {}
    onMouseMove() {}
    onMouseUp()   {}
    onMouseLeave() {}

    extract() {
        if (!this._srcImg || !this._ctx || !this._canvas) return;
        const w = this._canvas.width;
        const h = this._canvas.height;
        const tmp = document.createElement("canvas");
        tmp.width = w; tmp.height = h;
        tmp.getContext("2d").drawImage(this._srcImg, 0, 0, w, h);
        const src = tmp.getContext("2d").getImageData(0, 0, w, h);
        const out = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < src.data.length; i += 4) {
            let a = src.data[i + 3];
            if (this.threshold > 0) a = a >= this.threshold ? 255 : 0;
            if (this.invert) a = 255 - a;
            out[i] = out[i + 1] = out[i + 2] = 255;
            out[i + 3] = a;
        }
        this._ctx.clearRect(0, 0, w, h);
        this._ctx.putImageData(new ImageData(out, w, h), 0, 0);
        if (this._onChange) this._onChange();
    }
}

// ── Text Tool ────────────────────────────────────────────────────────────────
// クリック位置にテキストを白（add）または消去（erase）でスタンプする。
export const MASK_TEXT_FONTS = [
    "Arial", "Arial Black", "Georgia", "Times New Roman",
    "Courier New", "Verdana", "Trebuchet MS", "Impact",
    "Comic Sans MS", "Helvetica", "Tahoma",
];

export class MaskTextTool {
    constructor() {
        this.text       = "Hello";
        this.fontFamily = "Arial";
        this.fontSize   = 64;
        this.bold       = false;
        this.italic     = false;
        this.align      = "left";
        this.mode       = "add";
        this._canvas    = null;
        this._ctx       = null;
        this._overlay   = null;
        this._onChange  = null;
    }

    setCanvas(canvas) { this._canvas = canvas; this._ctx = canvas.getContext("2d"); }
    onChange(fn) { this._onChange = fn; }

    activate()   { if (this._canvas) this._canvas.style.cursor = "crosshair"; }
    deactivate() { this._closeOverlay(); if (this._canvas) this._canvas.style.cursor = ""; }

    onMouseDown(x, y) {
        if (this._overlay) { this._closeOverlay(); return; }
        this._showOverlay(x, y);
    }
    onMouseMove() {}
    onMouseUp()   {}
    onMouseLeave() {}

    _getFont() {
        const parts = [];
        if (this.italic) parts.push("italic");
        if (this.bold)   parts.push("bold");
        parts.push(`${this.fontSize}px`);
        parts.push(`"${this.fontFamily}", sans-serif`);
        return parts.join(" ");
    }

    _showOverlay(canvasX, canvasY) {
        const cv   = this._canvas;
        const rect = cv.getBoundingClientRect();
        const cssX = Math.round(canvasX * (rect.width  / cv.width))  + rect.left;
        const cssY = Math.round(canvasY * (rect.height / cv.height)) + rect.top;

        const overlay = document.createElement("div");
        overlay.style.cssText = [
            `position:fixed;left:${cssX}px;top:${cssY}px;`,
            "background:var(--wfm-surface,#2a2a2a);",
            "border:1px solid var(--wfm-border,#444);",
            "border-radius:4px;padding:6px;z-index:99999;",
            "box-shadow:0 4px 16px rgba(0,0,0,0.5);min-width:200px;",
        ].join("");

        const ta = document.createElement("textarea");
        ta.value       = this.text;
        ta.rows        = 3;
        ta.placeholder = "Enter text…";
        ta.style.cssText = [
            "width:100%;resize:vertical;box-sizing:border-box;",
            "background:var(--wfm-bg,#1a1a1a);color:var(--wfm-text,#ddd);",
            "border:1px solid var(--wfm-border,#444);border-radius:3px;",
            "padding:4px;font-size:12px;",
        ].join("");
        overlay.appendChild(ta);

        const btnRow = document.createElement("div");
        btnRow.style.cssText = "display:flex;gap:4px;margin-top:4px;";

        const okBtn = document.createElement("button");
        okBtn.textContent = "Stamp";
        okBtn.className   = "wfm-btn wfm-btn-sm wfm-btn-primary";
        okBtn.style.flex  = "1";
        okBtn.onclick = () => {
            if (ta.value.trim()) { this.text = ta.value; this._stamp(canvasX, canvasY); }
            this._closeOverlay();
        };

        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Cancel";
        cancelBtn.className   = "wfm-btn wfm-btn-sm";
        cancelBtn.style.flex  = "1";
        cancelBtn.onclick = () => this._closeOverlay();

        btnRow.appendChild(okBtn);
        btnRow.appendChild(cancelBtn);
        overlay.appendChild(btnRow);

        const hint = document.createElement("div");
        hint.textContent = "Ctrl+Enter: Stamp  /  Esc: Cancel";
        hint.style.cssText = "font-size:10px;color:var(--wfm-text-secondary,#888);margin-top:3px;";
        overlay.appendChild(hint);

        ta.addEventListener("keydown", e => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); okBtn.click(); }
            else if (e.key === "Escape") cancelBtn.click();
            e.stopPropagation();
        });
        overlay.addEventListener("mousedown", e => e.stopPropagation());

        document.body.appendChild(overlay);
        this._overlay = overlay;
        ta.focus(); ta.select();
    }

    _closeOverlay() {
        if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    }

    _stamp(x, y) {
        const ctx = this._ctx;
        ctx.save();
        ctx.font         = this._getFont();
        ctx.textAlign    = this.align;
        ctx.textBaseline = "top";
        if (this.mode === "erase") {
            ctx.globalCompositeOperation = "destination-out";
            ctx.fillStyle = "rgba(0,0,0,1)";
        } else {
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = "white";
        }
        const lines      = this.text.split("\n");
        const lineHeight = this.fontSize * 1.2;
        for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + i * lineHeight);
        ctx.restore();
        if (this._onChange) this._onChange();
    }
}

// ── Vector Tool ──────────────────────────────────────────────────────────────
// クリックでポイント追加、Catmull-Rom スプラインで閉じたパスを塗りつぶす。
const VECTOR_CLOSE_R = 12;

export class MaskVectorTool {
    constructor() {
        this.mode           = "add";
        this._canvas        = null;
        this._ctx           = null;
        this._previewCanvas = null;
        this._points        = [];
        this._hoverX        = null;
        this._hoverY        = null;
        this.onBeforeCommit = null;
        this._onChange      = null;
    }

    setCanvas(canvas)        { this._canvas = canvas; this._ctx = canvas.getContext("2d"); }
    setPreviewCanvas(canvas) { this._previewCanvas = canvas; }
    onChange(fn) { this._onChange = fn; }

    activate()   { if (this._canvas) this._canvas.style.cursor = "crosshair"; this._renderPreview(); }
    deactivate() { if (this._canvas) this._canvas.style.cursor = ""; this._clearPreview(); }

    reset() { this._points = []; this._hoverX = null; this._hoverY = null; this._clearPreview(); }

    onMouseDown(x, y) {
        if (this._points.length >= 3) {
            const f = this._points[0];
            if (Math.hypot(x - f.x, y - f.y) <= VECTOR_CLOSE_R) { this._commitPath(true); return; }
        }
        this._points.push({ x, y });
        this._renderPreview();
    }

    onMouseMove(x, y) { this._hoverX = x; this._hoverY = y; this._renderPreview(); }
    onMouseLeave()    { this._hoverX = null; this._hoverY = null; this._renderPreview(); }
    onMouseUp()       {}

    onKeyDown(e) {
        if (e.key === "Escape") {
            e.preventDefault(); this.reset();
        } else if (e.key === "Enter" && this._points.length >= 2) {
            e.preventDefault(); this._commitPath(false);
        } else if ((e.key === "Backspace" || e.key === "Delete") && this._points.length > 0) {
            e.preventDefault(); this._points.pop(); this._renderPreview();
        }
    }

    _commitPath(closed) {
        if (this._points.length < 2) return;
        if (this.onBeforeCommit) this.onBeforeCommit();
        const ctx = this._ctx;
        ctx.save();
        if (this.mode === "erase") {
            ctx.globalCompositeOperation = "destination-out";
            ctx.fillStyle = "rgba(0,0,0,1)";
        } else {
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = "white";
        }
        ctx.beginPath();
        this._buildSpline(ctx, this._points, closed);
        ctx.fill();
        ctx.restore();
        this.reset();
        if (this._onChange) this._onChange();
    }

    _buildSpline(ctx, pts, closed) {
        const n = pts.length;
        if (n === 0) return;
        if (n === 1) { ctx.moveTo(pts[0].x, pts[0].y); return; }
        if (n === 2) {
            ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
            if (closed) ctx.closePath(); return;
        }
        let ext;
        if (closed) {
            ext = [pts[n - 1], ...pts, pts[0], pts[1]];
        } else {
            ext = [
                { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y },
                ...pts,
                { x: 2 * pts[n-1].x - pts[n-2].x, y: 2 * pts[n-1].y - pts[n-2].y },
            ];
        }
        ctx.moveTo(ext[1].x, ext[1].y);
        const count = closed ? n : n - 1;
        for (let i = 0; i < count; i++) {
            const [p0, p1, p2, p3] = [ext[i], ext[i+1], ext[i+2], ext[i+3]];
            ctx.bezierCurveTo(
                p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
                p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
                p2.x, p2.y,
            );
        }
        if (closed) ctx.closePath();
    }

    _renderPreview() {
        if (!this._previewCanvas) return;
        const pctx = this._previewCanvas.getContext("2d");
        const w = this._previewCanvas.width, h = this._previewCanvas.height;
        pctx.clearRect(0, 0, w, h);
        const pts = this._points, hx = this._hoverX, hy = this._hoverY;
        if (pts.length === 0 && hx === null) return;

        if (pts.length >= 2) {
            pctx.save();
            pctx.strokeStyle = "rgba(255,210,40,0.9)"; pctx.lineWidth = 1.5; pctx.setLineDash([]);
            pctx.beginPath(); this._buildSpline(pctx, pts, false); pctx.stroke();
            pctx.restore();
        }

        if (pts.length >= 1 && hx !== null) {
            const canClose = pts.length >= 3 && Math.hypot(hx - pts[0].x, hy - pts[0].y) <= VECTOR_CLOSE_R;
            pctx.save();
            if (canClose) {
                pctx.strokeStyle = "rgba(255,100,100,0.55)"; pctx.lineWidth = 1.5; pctx.setLineDash([4, 3]);
                pctx.beginPath(); this._buildSpline(pctx, pts, true); pctx.stroke();
            } else {
                pctx.strokeStyle = "rgba(255,210,40,0.5)"; pctx.lineWidth = 1; pctx.setLineDash([4, 3]);
                pctx.beginPath();
                pctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
                pctx.lineTo(hx, hy); pctx.stroke();
            }
            pctx.restore();
        }

        for (let i = 0; i < pts.length; i++) {
            const p = pts[i], isFirst = i === 0;
            const closeable = isFirst && pts.length >= 3 && hx !== null && Math.hypot(hx - p.x, hy - p.y) <= VECTOR_CLOSE_R;
            pctx.beginPath();
            pctx.arc(p.x, p.y, closeable ? 7 : (isFirst ? 5 : 4), 0, Math.PI * 2);
            pctx.fillStyle   = closeable ? "rgba(255,80,80,0.95)" : (isFirst ? "rgba(255,210,40,0.95)" : "rgba(255,210,40,0.8)");
            pctx.strokeStyle = "rgba(0,0,0,0.6)"; pctx.lineWidth = 1;
            pctx.fill(); pctx.stroke();
        }

        if (hx !== null) {
            const onFirst = pts.length >= 3 && Math.hypot(hx - pts[0].x, hy - pts[0].y) <= VECTOR_CLOSE_R;
            if (!onFirst) {
                pctx.beginPath(); pctx.arc(hx, hy, 3, 0, Math.PI * 2);
                pctx.fillStyle = "rgba(255,255,255,0.6)"; pctx.strokeStyle = "rgba(200,200,200,0.5)"; pctx.lineWidth = 1;
                pctx.fill(); pctx.stroke();
            }
        }
    }

    _clearPreview() {
        if (!this._previewCanvas) return;
        const c = this._previewCanvas;
        c.getContext("2d").clearRect(0, 0, c.width, c.height);
    }
}

// ── Shape Tool ───────────────────────────────────────────────────────────────
// ドラッグで矩形または楕円をマスクとして描画する（Shift = 正方形/正円）。
export class MaskShapeTool {
    constructor() {
        this.mode    = "add";
        this.shape   = "rect";  // "rect" | "ellipse"
        this._canvas        = null;
        this._ctx           = null;
        this._previewCanvas = null;
        this._pCtx          = null;
        this._startX   = 0;
        this._startY   = 0;
        this._curX     = 0;
        this._curY     = 0;
        this._curShift = false;
        this._drawing  = false;
        this._onChange = null;
    }

    setCanvas(canvas) { this._canvas = canvas; this._ctx = canvas.getContext("2d"); }
    setPreviewCanvas(canvas) { this._previewCanvas = canvas; this._pCtx = canvas.getContext("2d"); }
    onChange(fn) { this._onChange = fn; }

    activate()   { if (this._canvas) this._canvas.style.cursor = "crosshair"; }
    deactivate() { this._drawing = false; this._clearPreview(); if (this._canvas) this._canvas.style.cursor = ""; }

    onMouseDown(x, y) {
        this._startX = x; this._startY = y;
        this._curX = x; this._curY = y; this._curShift = false;
        this._drawing = true;
        this._drawPreview(x, y, false);
    }

    onMouseMove(x, y, e) {
        if (!this._drawing) return;
        this._curX = x; this._curY = y; this._curShift = e?.shiftKey ?? false;
        this._drawPreview(x, y, this._curShift);
    }

    // x/y を省略した場合は最後に記録した座標を使用（mouseupイベント非経由での呼び出し対応）
    onMouseUp(x, y, e) {
        if (!this._drawing) return;
        const cx    = x     ?? this._curX;
        const cy    = y     ?? this._curY;
        const shift = e?.shiftKey ?? this._curShift;
        this._drawing = false;
        this._clearPreview();
        this._commit(cx, cy, shift);
        if (this._onChange) this._onChange();
    }

    onMouseLeave() {}

    _getRect(x, y, shift) {
        const sx = this._startX, sy = this._startY;
        if (shift) {
            const half = Math.max(Math.abs(x - sx), Math.abs(y - sy));
            return { x: sx - half, y: sy - half, w: half * 2, h: half * 2 };
        }
        return { x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) };
    }

    _drawPreview(x, y, shift) {
        if (!this._pCtx) return;
        const pc = this._previewCanvas;
        this._pCtx.clearRect(0, 0, pc.width, pc.height);
        const { x: rx, y: ry, w, h } = this._getRect(x, y, shift);
        if (w < 1 || h < 1) return;
        this._pCtx.save();
        this._pCtx.strokeStyle = "rgba(0,180,255,0.9)"; this._pCtx.lineWidth = 1.5; this._pCtx.setLineDash([5, 3]);
        this._pCtx.beginPath();
        if (this.shape === "rect") this._pCtx.rect(rx, ry, w, h);
        else this._pCtx.ellipse(rx + w / 2, ry + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        this._pCtx.stroke(); this._pCtx.restore();
    }

    _clearPreview() {
        if (!this._pCtx) return;
        this._pCtx.clearRect(0, 0, this._previewCanvas.width, this._previewCanvas.height);
    }

    _commit(x, y, shift) {
        const { x: rx, y: ry, w, h } = this._getRect(x, y, shift);
        if (w < 1 || h < 1) return;
        const ctx = this._ctx;
        ctx.save();
        ctx.globalCompositeOperation = this.mode === "erase" ? "destination-out" : "source-over";
        ctx.fillStyle = "white";
        ctx.beginPath();
        if (this.shape === "rect") ctx.rect(rx, ry, w, h);
        else ctx.ellipse(rx + w / 2, ry + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.restore();
    }
}

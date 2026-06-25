/**
 * Image Edit Tab - Text Tool
 * Measures text bounding box, renders to an off-screen canvas,
 * and calls onChange(clickX, clickY) so the caller can create
 * a proper text layer with the exact content size.
 */

export const TEXT_FONTS = [
    "Arial", "Arial Black", "Georgia", "Times New Roman",
    "Courier New", "Verdana", "Trebuchet MS", "Impact",
    "Comic Sans MS", "Tahoma",
];

const TEXT_PADDING = 4; // テキスト描画時の余白(px)

export class TextTool {
    constructor(canvas) {
        this.canvas     = canvas;
        this.text       = "Hello";
        this.fontFamily = "Arial";
        this.fontSize   = 64;
        this.bold       = false;
        this.italic     = false;
        this.align      = "left";
        this.color      = "#ffffff";
        this._overlay   = null;
        this._onChange  = null;
    }

    setCanvas(canvas) {
        this._closeOverlay();
        this.canvas = canvas;
    }

    onChange(fn) { this._onChange = fn; }

    activate() {
        if (this.canvas) this.canvas.style.cursor = "text";
    }

    deactivate() {
        this._closeOverlay();
        if (this.canvas) this.canvas.style.cursor = "";
    }

    onMouseDown(x, y) {
        if (this._overlay) { this._closeOverlay(); return; }
        this._showOverlay(x, y);
    }

    /** 既存テキスト再編集用: プロパティを外部でセット後に呼ぶ */
    openAt(canvasX, canvasY) {
        this._closeOverlay();
        this._showOverlay(canvasX, canvasY);
    }

    onMouseMove() {}
    onMouseLeave() {}
    onMouseUp() {}

    /** テキストのバウンディングボックスサイズのcanvasを返す */
    createLayerData(clickX, clickY) {
        const lines = this.text.split("\n");
        const lineH = this.fontSize * 1.2;
        const font  = this._getCSSFont();

        // measureText 用の仮canvas
        const tmp    = document.createElement("canvas");
        const tmpCtx = tmp.getContext("2d");
        tmpCtx.font  = font;

        let maxW = 0;
        for (const line of lines) {
            const w = line.length > 0 ? tmpCtx.measureText(line).width : this.fontSize * 0.3;
            if (w > maxW) maxW = w;
        }

        const tw = Math.max(1, Math.ceil(maxW + TEXT_PADDING * 2));
        const th = Math.max(1, Math.ceil(lines.length * lineH + TEXT_PADDING * 2));

        const canvas = document.createElement("canvas");
        canvas.width  = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        ctx.font         = font;
        ctx.fillStyle    = this.color;
        ctx.textBaseline = "top";
        ctx.textAlign    = this.align;

        let drawX = TEXT_PADDING;
        if (this.align === "center") drawX = tw / 2;
        else if (this.align === "right") drawX = tw - TEXT_PADDING;

        lines.forEach((line, i) => {
            ctx.fillText(line, drawX, TEXT_PADDING + i * lineH);
        });

        return {
            canvas,
            width:  tw,
            height: th,
            x: clickX,
            y: clickY,
        };
    }

    // ── 内部 ──────────────────────────────────────

    _getCSSFont() {
        const parts = [];
        if (this.italic) parts.push("italic");
        if (this.bold)   parts.push("bold");
        parts.push(`${this.fontSize}px`);
        parts.push(`"${this.fontFamily}", sans-serif`);
        return parts.join(" ");
    }

    _showOverlay(canvasX, canvasY) {
        const cv     = this.canvas;
        const rect   = cv.getBoundingClientRect();
        const scaleX = rect.width  / cv.width;
        const scaleY = rect.height / cv.height;
        const cssX   = Math.round(canvasX * scaleX);
        const cssY   = Math.round(canvasY * scaleY);

        const container = cv.parentElement;
        const overlay   = document.createElement("div");
        overlay.className  = "ie-text-overlay";
        overlay.style.left = cssX + "px";
        overlay.style.top  = cssY + "px";

        const textarea = document.createElement("textarea");
        textarea.className   = "ie-text-textarea";
        textarea.value       = this.text;
        textarea.rows        = 3;
        textarea.placeholder = "Enter text…";
        overlay.appendChild(textarea);

        const btnRow    = document.createElement("div");
        btnRow.className = "ie-text-btn-row";

        const okBtn = document.createElement("button");
        okBtn.className   = "wfm-btn wfm-btn-sm wfm-btn-primary";
        okBtn.textContent = "OK";
        okBtn.onclick = () => {
            this.text = textarea.value;
            this._closeOverlay();
            // drawCanvasには描画せず、呼び出し側でレイヤーとして処理する
            if (this._onChange) this._onChange(canvasX, canvasY);
        };
        btnRow.appendChild(okBtn);

        const cancelBtn = document.createElement("button");
        cancelBtn.className   = "wfm-btn wfm-btn-sm";
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick     = () => this._closeOverlay();
        btnRow.appendChild(cancelBtn);

        overlay.appendChild(btnRow);
        container.appendChild(overlay);
        this._overlay = overlay;
        textarea.focus();

        textarea.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); okBtn.click(); }
            else if (e.key === "Escape") this._closeOverlay();
        });
    }

    _closeOverlay() {
        if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    }
}

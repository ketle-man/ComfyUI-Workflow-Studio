/**
 * Image Edit Tab - Text Tool
 * Inspired by comfyui-mask-editor-one TextTool.js
 * Renders colored text directly onto the active layer canvas.
 */

export const TEXT_FONTS = [
    "Arial", "Arial Black", "Georgia", "Times New Roman",
    "Courier New", "Verdana", "Trebuchet MS", "Impact",
    "Comic Sans MS", "Tahoma",
];

export class TextTool {
    constructor(canvas) {
        this.canvas     = canvas;
        this.ctx        = canvas.getContext("2d");
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
        this.ctx    = canvas.getContext("2d");
    }

    onChange(fn) { this._onChange = fn; }

    activate() {
        this.canvas.style.cursor = "text";
    }

    deactivate() {
        this._closeOverlay();
        this.canvas.style.cursor = "";
    }

    onMouseDown(x, y) {
        if (this._overlay) {
            this._closeOverlay();
            return;
        }
        this._showOverlay(x, y);
    }

    onMouseMove() {}
    onMouseLeave() {}
    onMouseUp() {}

    _getCSSFont() {
        const parts = [];
        if (this.italic) parts.push("italic");
        if (this.bold)   parts.push("bold");
        parts.push(`${this.fontSize}px`);
        parts.push(`"${this.fontFamily}", sans-serif`);
        return parts.join(" ");
    }

    _showOverlay(canvasX, canvasY) {
        const cv    = this.canvas;
        const rect  = cv.getBoundingClientRect();
        const scaleX = rect.width  / cv.width;
        const scaleY = rect.height / cv.height;
        const cssX   = Math.round(canvasX * scaleX);
        const cssY   = Math.round(canvasY * scaleY);

        const container = cv.parentElement;

        const overlay = document.createElement("div");
        overlay.className = "ie-text-overlay";
        overlay.style.left = cssX + "px";
        overlay.style.top  = cssY + "px";

        const textarea = document.createElement("textarea");
        textarea.className   = "ie-text-textarea";
        textarea.value       = this.text;
        textarea.rows        = 3;
        textarea.placeholder = "Enter text…";
        overlay.appendChild(textarea);

        const btnRow = document.createElement("div");
        btnRow.className = "ie-text-btn-row";

        const okBtn = document.createElement("button");
        okBtn.className   = "wfm-btn wfm-btn-sm wfm-btn-primary";
        okBtn.textContent = "OK";
        okBtn.onclick = () => {
            this.text = textarea.value;
            this._drawText(canvasX, canvasY);
            this._closeOverlay();
            if (this._onChange) this._onChange();
        };
        btnRow.appendChild(okBtn);

        const cancelBtn = document.createElement("button");
        cancelBtn.className   = "wfm-btn wfm-btn-sm";
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = () => this._closeOverlay();
        btnRow.appendChild(cancelBtn);

        overlay.appendChild(btnRow);
        container.appendChild(overlay);
        this._overlay = overlay;
        textarea.focus();

        // Enterキー（Shift+Enterで改行）
        textarea.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                okBtn.click();
            } else if (e.key === "Escape") {
                this._closeOverlay();
            }
        });
    }

    _drawText(x, y) {
        const ctx = this.ctx;
        ctx.save();
        ctx.font         = this._getCSSFont();
        ctx.fillStyle    = this.color;
        ctx.textAlign    = this.align;
        ctx.textBaseline = "top";

        const lines  = this.text.split("\n");
        const lineH  = this.fontSize * 1.2;
        lines.forEach((line, i) => {
            ctx.fillText(line, x, y + i * lineH);
        });
        ctx.restore();
    }

    _closeOverlay() {
        if (this._overlay) {
            this._overlay.remove();
            this._overlay = null;
        }
    }
}

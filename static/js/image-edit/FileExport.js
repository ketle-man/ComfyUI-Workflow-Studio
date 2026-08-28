/**
 * Image Edit Tab - File Export
 * Composites the visible layers (respecting mask-apply clipping) into a
 * flat canvas and offers three destinations: local PNG download, WFS
 * Gallery, and the selected node's image widget on the ComfyUI canvas
 * (Send to LI node).
 */

import { showToast } from "../app.js";
import { Layer }     from "./LayerManager.js";

export class FileExport {
    /**
     * @param {object} callbacks
     * @param {() => object|null} callbacks.getLayerManager
     * @param {() => {w: number, h: number}} callbacks.getCanvasSize
     * @param {() => string} callbacks.getBaseName
     * @param {(ctx: CanvasRenderingContext2D, drawCanvas: HTMLCanvasElement, maskLayer: object, targetLayer: object, showOverlay: boolean) => void} callbacks.renderMaskedLayer
     */
    constructor(callbacks) {
        this._cb = callbacks;
    }

    _buildCompositeCanvas() {
        const { w, h } = this._cb.getCanvasSize();
        const canvas = document.createElement("canvas");
        canvas.width  = w;
        canvas.height = h;
        const layerMgr = this._cb.getLayerManager();
        if (!layerMgr) return canvas;
        this._compositeForExport(canvas, layerMgr);
        return canvas;
    }

    // 保存用合成: maskApply=true のクリッピングを適用、マスクオーバーレイは除外
    _compositeForExport(target, layerMgr) {
        const ctx = target.getContext("2d");
        ctx.clearRect(0, 0, target.width, target.height);
        const layers = layerMgr.layers;
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
                    this._cb.renderMaskedLayer(ctx, target, layer, layers[i + 1], false);
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

    savePng() {
        if (!this._cb.getLayerManager()) { showToast("No image loaded", "error"); return; }
        const canvas = this._buildCompositeCanvas();
        const a = document.createElement("a");
        a.href     = canvas.toDataURL("image/png");
        a.download = (this._cb.getBaseName() || "wfs-edit") + "-output.png";
        a.click();
        showToast("PNG saved", "success");
    }

    async saveToGallery() {
        if (!this._cb.getLayerManager()) { showToast("No image loaded", "error"); return; }

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

    // Uploads the composite via /upload/image, then (via window.opener,
    // since WFS runs in its own window — same cross-window pattern as
    // wfmReceiveWorkflow/wfmOpenMaskEditorForNode) writes the resulting
    // filename into the "image" widget of the currently selected ComfyUI
    // node (falling back to the first node in the graph with one), mirroring
    // the chat_TE custom node's "Send to workflow" button.
    async sendToWorkflow() {
        if (!this._cb.getLayerManager()) { showToast("No image loaded", "error"); return; }
        if (!window.opener || typeof window.opener.wfmSendImageToSelectedNode !== "function") {
            showToast("Open Workflow Studio from ComfyUI's top menu to use this feature", "error");
            return;
        }
        const canvas = this._buildCompositeCanvas();
        const blob   = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        const file   = new File([blob], (this._cb.getBaseName() || "wfs-edit") + "-output.png", { type: "image/png" });
        const form   = new FormData();
        form.append("image", file);
        form.append("overwrite", "true");
        try {
            const r    = await fetch("/upload/image", { method: "POST", body: form });
            const data = await r.json();
            const filename = data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
            window.opener.wfmSendImageToSelectedNode(filename);
            showToast(`Sent "${filename}" to LI node`, "success");
        } catch (err) {
            showToast(`Send to LI node failed: ${err.message}`, "error");
        }
    }
}

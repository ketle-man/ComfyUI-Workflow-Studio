/**
 * Image Edit Tab - Mask Editor One 連携ブリッジ
 * WFS Image Edit タブの合成画像を、現在のワークフロー中にある MaskEditorOne ノードへ送り、
 * window.opener（ComfyUIタブ）側で実際のモーダルを開いて編集させ、
 * Apply 後の結果マスクを新規マスクレイヤーとして WFS 側に取り込む。
 * モーダル自体は ComfyUI ページの LiteGraph ノードに強く依存するため、WFS 側からは
 * window.opener.wfmOpenMaskEditorForNode()（web/comfyui/node_sets_menu.js 側で定義）を介して操作する。
 */

import { showToast } from "../app.js";
import { comfyUI }   from "../comfyui-client.js";

export class MaskEditorOneBridge {
    /**
     * @param {object} callbacks
     * @param {() => object|null} callbacks.getLayerManager
     * @param {() => void} callbacks.saveUndo
     * @param {() => void} callbacks.updateCompositeView
     * @param {() => void} callbacks.refreshLayerList
     * @param {() => HTMLCanvasElement} callbacks.buildBgCanvas
     */
    constructor(callbacks) {
        this._cb = callbacks;
        this.available = false;
        this.node      = null;   // { id, title } の Mask Editor One ノード（先頭の1件）
        this.running   = false;
    }

    // window.opener 側でタブ移動・リロードが起きうるため、ボタン描画のたびに再評価する
    refresh() {
        const meoNodes = comfyUI.currentAnalysis?.mask_editor_one_nodes || [];
        this.node      = meoNodes[0] || null;
        this.available = !!this.node;
    }

    get bridgeReady() {
        return !!(window.opener && typeof window.opener.wfmOpenMaskEditorForNode === "function");
    }

    async openEditor() {
        if (this.running) return;
        this.refresh();
        if (!this.node) {
            showToast("No Mask Editor One node found in the current workflow", "error");
            return;
        }
        if (!this.bridgeReady) {
            showToast("Open Workflow Studio from ComfyUI's top menu to use this feature", "error");
            return;
        }
        const layerMgr = this._cb.getLayerManager();
        if (!layerMgr) { showToast("No image loaded", "error"); return; }

        this.running = true;
        try {
            const dataUrl = this._cb.buildBgCanvas().toDataURL("image/png");
            window.opener.focus();
            showToast("Switch to the ComfyUI tab, edit the mask, then click Apply", "info");

            const maskDataUrl = await window.opener.wfmOpenMaskEditorForNode(this.node.id, dataUrl);
            if (!maskDataUrl) {
                showToast("Mask Editor One: cancelled (no changes)", "info");
                return;
            }

            this._cb.saveUndo();
            const maskLayer = layerMgr.addLayer("mask", "Mask Editor One", {
                contentW: layerMgr.width, contentH: layerMgr.height,
                displayW: layerMgr.width, displayH: layerMgr.height,
                x: 0, y: 0,
            });
            layerMgr.setActive(maskLayer.id);
            await this._applyMask(maskLayer, maskDataUrl);

            this._cb.updateCompositeView();
            this._cb.refreshLayerList();
            showToast("Mask Editor One: mask imported", "success");
        } catch (err) {
            showToast("Mask Editor One error: " + err.message, "error");
        } finally {
            this.running = false;
        }
    }

    // グレースケール輝度 → アルファ白マスクに変換して書き込む（Sam3Segmentation._applyMask と同じ変換）
    _applyMask(maskLayer, maskDataUrl) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const W = maskLayer.canvas.width;
                const H = maskLayer.canvas.height;
                const off = document.createElement("canvas");
                off.width = W; off.height = H;
                const mc = off.getContext("2d");
                mc.drawImage(img, 0, 0, W, H);
                const imgData = mc.getImageData(0, 0, W, H);
                const d = imgData.data;
                for (let i = 0; i < d.length; i += 4) {
                    const lum = d[i];
                    d[i] = d[i + 1] = d[i + 2] = 255;
                    d[i + 3] = lum;
                }
                mc.putImageData(imgData, 0, 0);
                maskLayer.ctx.drawImage(off, 0, 0);
                resolve();
            };
            img.onerror = resolve;
            img.src = maskDataUrl;
        });
    }
}

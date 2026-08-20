/**
 * Image Edit Tab - Mask Editor One 連携ブリッジ
 * WFS Image Edit タブの合成画像を、ComfyUIキャンバス上のMaskEditorOneノード（選択中のノードを
 * 優先、無ければグラフ内で最初に見つかったもの）へ送り、window.opener（ComfyUIタブ）側で実際の
 * モーダルを開いて編集させ、Apply後の結果マスクを新規マスクレイヤーとしてWFS側に取り込む。
 * 「Send to Workflow」の image ウィジェット探索と同じ「選択中優先・フォールバック」方式のため、
 * WFS側のワークフロー読み込み状況とは無関係に動作する。
 * モーダル自体は ComfyUI ページの LiteGraph ノードに強く依存するため、WFS 側からは
 * window.opener.wfmOpenMaskEditorForNode()（web/comfyui/node_sets_menu.js 側で定義）を介して操作する。
 */

import { showToast } from "../app.js";

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
        this.running = false;
    }

    get bridgeReady() {
        return !!(window.opener && typeof window.opener.wfmOpenMaskEditorForNode === "function");
    }

    async openEditor() {
        if (this.running) return;
        if (!this.bridgeReady) {
            showToast("Open Workflow Studio from ComfyUI's top menu to use this feature", "error");
            return;
        }
        const layerMgr = this._cb.getLayerManager();
        if (!layerMgr) { showToast("No image loaded", "error"); return; }

        this.running = true;
        try {
            const dataUrl = this._cb.buildBgCanvas().toDataURL("image/png");
            // アクティブレイヤーが既存のマスクレイヤーなら、その内容もそのまま Mask Editor One の
            // 初期マスクとして渡す（画像だけでなく、今描いているマスクも引き継ぐ）
            const activeLayer = layerMgr.activeLayer;
            const existingMaskDataUrl = activeLayer?.type === "mask" ? activeLayer.canvas.toDataURL("image/png") : null;
            window.opener.focus();
            showToast("Switch to the ComfyUI tab, edit the mask, then click Apply", "info");

            const maskDataUrl = await window.opener.wfmOpenMaskEditorForNode(dataUrl, existingMaskDataUrl);
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

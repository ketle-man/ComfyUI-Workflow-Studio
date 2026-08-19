/**
 * Image Edit Tab - Background Removal
 * Two backends: a lightweight in-browser model (@imgly/background-removal)
 * and BiRefNet via the Mask Editor One server endpoints.
 */

import { showToast } from "../app.js";

export class BgRemove {
    /**
     * @param {object} callbacks
     * @param {() => object|null} callbacks.getLayerManager
     * @param {() => void} callbacks.saveUndo
     * @param {() => void} callbacks.updateCompositeView
     * @param {() => void} callbacks.refreshLayerList
     * @param {(newLayer: object) => void} callbacks.onLayerAdded
     */
    constructor(callbacks) {
        this._cb = callbacks;
        this.birefnetAvailable = false;
    }

    async checkAvailability() {
        try {
            const resp = await fetch("/mask_editor/birefnet/status");
            if (!resp.ok) return;
            const json = await resp.json();
            this.birefnetAvailable = json.loaded === true || json.model_found === true;
        } catch {
            this.birefnetAvailable = false;
        }
    }

    renderPanel(el) {
        const birefnetDisabled = this.birefnetAvailable ? "" : "disabled";
        const birefnetLabel    = this.birefnetAvailable
            ? "BiRefNet (Mask Editor One)"
            : "BiRefNet (Mask Editor One required)";
        el.innerHTML = `
            <div class="ie-opt-group">
                <label>Model</label>
                <select id="ie-bgremove-model" class="ie-opt-select">
                    <option value="imgly">Lightweight (@imgly)</option>
                    <option value="birefnet" ${birefnetDisabled}>${birefnetLabel}</option>
                </select>
            </div>
            <div class="ie-opt-group">
                <label style="font-size:11px;cursor:pointer;">
                    <input type="checkbox" id="ie-bgremove-new-layer" checked> New Layer
                </label>
            </div>
            <div class="ie-opt-group">
                <button class="wfm-btn wfm-btn-sm" id="ie-bgremove-btn">Remove BG</button>
            </div>
            <span id="ie-bgremove-status" style="font-size:11px;color:var(--wfm-text-secondary);margin-left:4px;"></span>
        `;
        document.getElementById("ie-bgremove-btn")?.addEventListener("click", () => this.apply());
    }

    async apply() {
        const layerMgr = this._cb.getLayerManager();
        if (!layerMgr) { showToast("No image loaded", "error"); return; }
        const layer = layerMgr.activeLayer;
        if (!layer)  { showToast("No active layer", "error"); return; }

        const model    = document.getElementById("ie-bgremove-model")?.value ?? "imgly";
        const asNew    = document.getElementById("ie-bgremove-new-layer")?.checked ?? true;
        const statusEl = document.getElementById("ie-bgremove-status");
        const btn      = document.getElementById("ie-bgremove-btn");
        const setStatus = msg => { if (statusEl) statusEl.textContent = msg; };

        if (btn) btn.disabled = true;
        setStatus("Starting...");

        try {
            const dataUrl = layer.canvas.toDataURL("image/png");

            let resultDataUrl;
            if (model === "imgly") {
                resultDataUrl = await this._removeImgly(dataUrl, setStatus);
            } else {
                resultDataUrl = await this._removeBiRefNet(dataUrl, setStatus);
            }

            const img = await new Promise((resolve, reject) => {
                const i = new Image();
                i.onload  = () => resolve(i);
                i.onerror = () => reject(new Error("Result image load failed"));
                i.src = resultDataUrl;
            });

            this._cb.saveUndo();

            if (asNew) {
                const newL = layerMgr.addLayer("image", layer.name + " (no bg)", {
                    contentW: img.width,    contentH: img.height,
                    displayW: layer.displayW, displayH: layer.displayH,
                    x: layer.x,            y: layer.y,
                });
                newL.ctx.drawImage(img, 0, 0);
                layerMgr.setActive(newL.id);
                this._cb.onLayerAdded(newL);
            } else {
                layer.canvas.width  = img.width;
                layer.canvas.height = img.height;
                layer.ctx = layer.canvas.getContext("2d");
                layer.ctx.drawImage(img, 0, 0);
            }

            this._cb.updateCompositeView();
            this._cb.refreshLayerList();
            setStatus("Done!");
            setTimeout(() => setStatus(""), 3000);
            showToast("Background removed", "success");

        } catch (err) {
            setStatus("Error: " + err.message);
            showToast("BG remove failed: " + err.message, "error");
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async _removeImgly(dataUrl, onStatus) {
        if (!window._wfmImglyRemoveBg) {
            onStatus("Loading model...");
            const mod = await import("https://esm.sh/@imgly/background-removal@1.5.7?bundle&target=es2022");
            window._wfmImglyRemoveBg = mod.removeBackground;
        }
        onStatus("Processing...");
        const res  = await fetch(dataUrl);
        const blob = await res.blob();
        const resultBlob = await window._wfmImglyRemoveBg(blob, {
            publicPath: "https://staticimgly.com/@imgly/background-removal-data/1.5.7/dist/",
        });
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(resultBlob);
        });
    }

    async _removeBiRefNet(dataUrl, onStatus) {
        const NODE_ID = "wfs_bgremove";

        // 1. アクティブレイヤー画像を Mask Editor One のキャッシュに登録
        onStatus("Sending image...");
        const storeResp = await fetch("/mask_editor/store_image", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ node_id: NODE_ID, image_b64: dataUrl }),
        });
        if (!storeResp.ok) throw new Error("Failed to cache image for BiRefNet");

        // 2. BiRefNet 推論実行
        onStatus("Running BiRefNet...");
        const resp = await fetch("/mask_editor/birefnet/remove_bg", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ node_id: NODE_ID }),
        });
        const json = await resp.json();
        if (json.error) throw new Error(json.error);

        // 3. グレースケールマスク (白=前景) → RGBA PNG に変換して返す
        onStatus("Compositing...");
        return await this._applyMaskToImage(dataUrl, json.mask_b64);
    }

    async _applyMaskToImage(imageB64, maskB64) {
        const loadImage = src => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload  = () => resolve(img);
            img.onerror = () => reject(new Error("Image load failed: " + src.slice(0, 40)));
            img.src = src;
        });
        const [origImg, maskImg] = await Promise.all([loadImage(imageB64), loadImage(maskB64)]);

        const w = origImg.naturalWidth;
        const h = origImg.naturalHeight;

        // マスク: グレースケール輝度値 → アルファチャンネル (RGBA 白マスク)
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width  = w;
        maskCanvas.height = h;
        const mc = maskCanvas.getContext("2d");
        mc.drawImage(maskImg, 0, 0, w, h);
        const maskData = mc.getImageData(0, 0, w, h);
        const md = maskData.data;
        for (let i = 0; i < md.length; i += 4) {
            md[i + 3] = md[i]; // 輝度 → アルファ
            md[i] = md[i + 1] = md[i + 2] = 255;
        }
        mc.putImageData(maskData, 0, 0);

        // 元画像にマスクを destination-in で適用
        const out = document.createElement("canvas");
        out.width  = w;
        out.height = h;
        const ctx = out.getContext("2d");
        ctx.drawImage(origImg, 0, 0, w, h);
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(maskCanvas, 0, 0, w, h);

        return out.toDataURL("image/png");
    }
}

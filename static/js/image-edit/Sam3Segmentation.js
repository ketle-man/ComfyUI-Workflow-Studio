/**
 * Image Edit Tab - SAM3 Segmentation (Mask Editor One integration)
 * Text-prompted segmentation via the Mask Editor One SAM3 server endpoints.
 * Rendered as a subtool of the Mask tool; the toolbar shell itself stays in
 * ImageEditTab (shared with the other mask subtools), but the prompt/run
 * controls and the result thumbnail grid are owned here.
 */

import { showToast } from "../app.js";

export class Sam3Segmentation {
    /**
     * @param {object} callbacks
     * @param {() => object|null} callbacks.getLayerManager
     * @param {() => void} callbacks.saveUndo
     * @param {() => void} callbacks.updateCompositeView
     * @param {() => void} callbacks.refreshLayerList
     * @param {(toolId: string) => void} callbacks.renderToolOptions
     * @param {(sub: string) => void} callbacks.renderMaskProps
     */
    constructor(callbacks) {
        this._cb = callbacks;
        this.available = false;
        this.results   = [];   // [{mask_b64, score, area}, ...]
        this.prompt    = "";
        this.maxMasks  = 9;
        this.loading   = false;
        this.mode      = "add";        // "add" | "erase"
        this.selected  = new Set();    // 選択中の結果インデックス
    }

    async checkAvailability() {
        try {
            const resp = await fetch("/mask_editor/sam3/status");
            if (!resp.ok) return;
            const json = await resp.json();
            this.available = json.loaded === true || json.ckpt_found === true;
        } catch {
            this.available = false;
        }
    }

    // マスクツールバー内、SAM3選択時にのみ表示するprompt/max/runコントロール
    renderToolbarExtra(activeSub) {
        if (!this.available || activeSub !== "sam3") return "";
        return `
            <div class="ie-opt-group">
                <input type="text" id="ie-sam3-prompt" class="ie-opt-input"
                    placeholder="e.g. cat, person..."
                    value="${this.prompt}"
                    style="width:160px;font-size:11px;padding:2px 6px;border:1px solid var(--wfm-border);border-radius:3px;background:var(--wfm-surface);color:var(--wfm-text);">
            </div>
            <div class="ie-opt-group">
                <label style="font-size:11px;color:var(--wfm-text-secondary);">Max</label>
                <select id="ie-sam3-max" class="ie-opt-select" style="width:44px;">
                    ${[3,6,9,12].map(n => `<option value="${n}"${n === this.maxMasks ? " selected" : ""}>${n}</option>`).join("")}
                </select>
            </div>
            <div class="ie-opt-group">
                <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="ie-sam3-run-btn" ${this.loading ? "disabled" : ""}>
                    ${this.loading ? "Running..." : "Segment"}
                </button>
            </div>
            <span id="ie-sam3-status" style="font-size:11px;color:var(--wfm-text-secondary);margin-left:4px;">
                ${this.results.length > 0 ? `${this.results.length} masks found` : ""}
            </span>
        `;
    }

    bindToolbarEvents() {
        document.getElementById("ie-sam3-prompt")?.addEventListener("input", e => {
            this.prompt = e.target.value;
        });
        document.getElementById("ie-sam3-max")?.addEventListener("change", e => {
            this.maxMasks = parseInt(e.target.value);
        });
        document.getElementById("ie-sam3-run-btn")?.addEventListener("click", () => this.runSegment());
    }

    // props ペイン（"sam3" サブツール選択時）: モード切替 + 結果サムネイルグリッド
    renderResultsPanel(body) {
        const modeAdd   = this.mode === "add";
        const selCount  = this.selected.size;
        const hasResult = this.results.length > 0;
        body.innerHTML = `
            <div class="ie-props-row">
                <label>Mode</label>
                <div style="display:flex;gap:4px;">
                    <button class="wfm-btn wfm-btn-sm${modeAdd   ? " ie-opt-active" : ""}" id="ie-sam3-mode-add"   style="flex:1;">Add</button>
                    <button class="wfm-btn wfm-btn-sm${!modeAdd  ? " ie-opt-active" : ""}" id="ie-sam3-mode-erase" style="flex:1;">Erase</button>
                </div>
            </div>
            ${hasResult ? `
            <div class="ie-props-row" style="flex-direction:column;align-items:stretch;gap:4px;">
                <div style="font-size:11px;color:var(--wfm-text-secondary);">Click to select / deselect:</div>
                <div id="ie-sam3-results" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">
                    ${this.results.map((r, i) => {
                        const sel = this.selected.has(i);
                        const borderColor = sel ? "var(--wfm-primary,#4682e6)" : "var(--wfm-border)";
                        const bg          = sel ? "color-mix(in srgb,var(--wfm-primary,#4682e6) 15%,transparent)" : "transparent";
                        return `<div class="ie-sam3-thumb" data-idx="${i}"
                            style="cursor:pointer;border:2px solid ${borderColor};border-radius:4px;overflow:hidden;text-align:center;background:${bg};position:relative;">
                            <img src="${r.mask_b64}" style="width:100%;display:block;background:#000;">
                            <div style="font-size:10px;padding:2px 0;color:var(--wfm-text-secondary);">
                                ${Math.round((r.score ?? 0) * 100)}%
                            </div>
                            ${sel ? '<div style="position:absolute;top:2px;right:3px;font-size:12px;line-height:1;color:var(--wfm-primary,#4682e6);">✓</div>' : ""}
                        </div>`;
                    }).join("")}
                </div>
                <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="ie-sam3-apply-btn"
                    ${selCount === 0 ? "disabled" : ""} style="margin-top:4px;">
                    Apply Selected${selCount > 0 ? ` (${selCount})` : ""}
                </button>
            </div>` : `
            <div style="font-size:11px;color:var(--wfm-text-secondary);padding:4px 0;">
                ${this.loading ? "Segmenting..." : "Enter a prompt and press Segment"}
            </div>`}
        `;
        document.getElementById("ie-sam3-mode-add")?.addEventListener("click", () => {
            this.mode = "add";
            this._cb.renderMaskProps("sam3");
        });
        document.getElementById("ie-sam3-mode-erase")?.addEventListener("click", () => {
            this.mode = "erase";
            this._cb.renderMaskProps("sam3");
        });
        body.querySelectorAll(".ie-sam3-thumb").forEach(el => {
            el.addEventListener("click", () => {
                const idx = parseInt(el.dataset.idx);
                if (this.selected.has(idx)) this.selected.delete(idx);
                else                        this.selected.add(idx);
                this._cb.renderMaskProps("sam3");
            });
        });
        document.getElementById("ie-sam3-apply-btn")?.addEventListener("click", () => {
            this.applySelectedMasks();
        });
    }

    async runSegment() {
        const layerMgr = this._cb.getLayerManager();
        if (!layerMgr || this.loading) return;
        const prompt = this.prompt.trim();
        if (!prompt) { showToast("Please enter a prompt", "warning"); return; }

        // 推論対象: アクティブレイヤー（マスクなら下のイメージレイヤーを探す）
        let imageLayer = layerMgr.activeLayer;
        if (!imageLayer || imageLayer.type === "mask") {
            imageLayer = layerMgr.layers.find(l => l.type !== "mask" && l.visible);
        }
        if (!imageLayer) { showToast("No image layer found", "error"); return; }

        const NODE_ID = "wfs_sam3";
        this.loading  = true;
        this.results  = [];
        this.selected = new Set();
        this._cb.renderToolOptions("mask");
        this._cb.renderMaskProps("sam3");

        try {
            const dataUrl = imageLayer.canvas.toDataURL("image/png");
            await fetch("/mask_editor/store_image", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ node_id: NODE_ID, image_b64: dataUrl }),
            });

            const resp = await fetch("/mask_editor/sam3/segment", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ node_id: NODE_ID, prompt, max_masks: this.maxMasks }),
            });
            const json = await resp.json();
            if (json.error) throw new Error(json.error);
            this.results = json.masks || [];
            if (this.results.length === 0) showToast("No masks found", "warning");
            else showToast(`${this.results.length} mask(s) found`, "success");
        } catch (err) {
            showToast("SAM3 error: " + err.message, "error");
        } finally {
            this.loading = false;
            this._cb.renderToolOptions("mask");
            this._cb.renderMaskProps("sam3");
        }
    }

    async applySelectedMasks() {
        const layerMgr = this._cb.getLayerManager();
        if (!layerMgr || this.selected.size === 0) return;
        const indices = [...this.selected].sort((a, b) => a - b);
        const masks   = indices.map(i => this.results[i]).filter(Boolean);
        if (masks.length === 0) return;

        let maskLayer = layerMgr.activeLayer;
        if (!maskLayer || maskLayer.type !== "mask") {
            const ref = layerMgr.activeLayer;
            maskLayer = layerMgr.addLayer("mask", "SAM3 Mask", {
                contentW: ref?.canvas.width  ?? layerMgr.width,
                contentH: ref?.canvas.height ?? layerMgr.height,
                displayW: ref?.displayW      ?? layerMgr.width,
                displayH: ref?.displayH      ?? layerMgr.height,
                x: ref?.x ?? 0, y: ref?.y ?? 0,
            });
            layerMgr.setActive(maskLayer.id);
        }

        this._cb.saveUndo();
        for (const r of masks) {
            await this._applyMask(maskLayer, r.mask_b64, this.mode);
        }

        this._cb.updateCompositeView();
        this._cb.refreshLayerList();
        showToast(`SAM3: ${masks.length} mask(s) applied (${this.mode})`, "success");
    }

    _applyMask(maskLayer, maskB64, mode = "add") {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const W = maskLayer.canvas.width;
                const H = maskLayer.canvas.height;
                // グレースケール輝度 → アルファ白マスクに変換
                const off = document.createElement("canvas");
                off.width = W; off.height = H;
                const mc = off.getContext("2d");
                mc.drawImage(img, 0, 0, W, H);
                const imgData = mc.getImageData(0, 0, W, H);
                const d = imgData.data;
                for (let i = 0; i < d.length; i += 4) {
                    const lum = d[i];
                    d[i] = d[i+1] = d[i+2] = 255;
                    d[i+3] = lum;
                }
                mc.putImageData(imgData, 0, 0);
                // モードに合わせてマスクキャンバスに合成
                maskLayer.ctx.save();
                maskLayer.ctx.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";
                maskLayer.ctx.drawImage(off, 0, 0);
                maskLayer.ctx.restore();
                resolve();
            };
            img.onerror = resolve;
            img.src = maskB64;
        });
    }
}

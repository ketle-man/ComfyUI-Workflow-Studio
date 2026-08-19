/**
 * Image Edit Tab - G'MIC Integration
 * Launches the G'MIC GUI on the server for the active layer, polls job
 * status, and applies the resulting image back onto the layer.
 */

import { showToast } from "../app.js";

export class GmicIntegration {
    /**
     * @param {object} callbacks
     * @param {() => object|null} callbacks.getLayerManager
     * @param {() => void} callbacks.syncActiveLayerFromCanvas
     * @param {() => void} callbacks.saveUndo
     * @param {() => void} callbacks.updateCompositeView
     * @param {() => void} callbacks.refreshLayerList
     * @param {(toolId: string) => void} callbacks.renderToolOptions
     */
    constructor(callbacks) {
        this._cb = callbacks;
        this.state = {
            lastResultJobId: null,
            processing: false,
            aborted: false
        };
    }

    renderPanel(el) {
        const openBtnDisabled  = this.state.processing ? "disabled" : "";
        const applyBtnDisabled = (!this.state.lastResultJobId || this.state.processing) ? "disabled" : "";
        const progressStyle    = this.state.processing ? "display:flex" : "display:none";

        el.innerHTML = `
            <div class="ie-opt-group">
                <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="ie-gmic-open-btn" ${openBtnDisabled}>G'MIC GUIで編集</button>
                <button class="wfm-btn wfm-btn-sm" id="ie-gmic-apply-btn" ${applyBtnDisabled}>結果を反映</button>
            </div>
            <div class="ie-opt-group" id="ie-gmic-progress-area" style="${progressStyle}; align-items:center; gap:6px;">
                <span id="ie-gmic-progress-lbl" style="font-size:11px; color:var(--wfm-text-secondary);">G'MIC GUIを起動中...</span>
                <button class="wfm-btn wfm-btn-sm" id="ie-gmic-abort-btn" style="background:#ea4335;color:#fff;">中断</button>
            </div>
        `;
        document.getElementById("ie-gmic-open-btn")?.addEventListener("click", () => this.openGui());
        document.getElementById("ie-gmic-apply-btn")?.addEventListener("click", () => this.applyResult());
        document.getElementById("ie-gmic-abort-btn")?.addEventListener("click", () => this.abort());
    }

    async openGui() {
        const layerMgr = this._cb.getLayerManager();
        if (!layerMgr) { showToast("No image loaded", "error"); return; }
        const layer = layerMgr.activeLayer;
        if (!layer)  { showToast("No active layer", "error"); return; }
        this._cb.syncActiveLayerFromCanvas();

        if (this.state.processing) return;

        const dataUrl = layer.canvas.toDataURL("image/png");

        this.state.processing = true;
        const openBtn      = document.getElementById("ie-gmic-open-btn");
        const progressArea = document.getElementById("ie-gmic-progress-area");
        const progressLbl  = document.getElementById("ie-gmic-progress-lbl");
        const applyBtn     = document.getElementById("ie-gmic-apply-btn");

        if (openBtn) openBtn.disabled = true;
        if (applyBtn) applyBtn.disabled = true;
        if (progressArea) progressArea.style.display = "flex";
        if (progressLbl) progressLbl.textContent = "画像をサーバーへ送信中...";

        try {
            const res = await fetch("/api/wfm/gmic/open", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image_b64: dataUrl })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }
            const data = await res.json();
            this.state.lastResultJobId = data.job_id;
            if (progressLbl) progressLbl.textContent = "G'MIC GUIで編集中... フィルターを選択して「OK」を押すと適用可能になります";
            await this._waitForJob(data.job_id);
        } catch (e) {
            if (e.message !== "__aborted__") {
                showToast("G'MIC Error: " + e.message, "error");
            }
            this.state.processing = false;
            this.state.aborted = false;
            if (openBtn) openBtn.disabled = false;
            if (progressArea) progressArea.style.display = "none";
        }
    }

    abort() {
        this.state.aborted = true;
        this.state.processing = false;
        const openBtn      = document.getElementById("ie-gmic-open-btn");
        const progressArea = document.getElementById("ie-gmic-progress-area");
        if (progressArea) progressArea.style.display = "none";
        if (openBtn) openBtn.disabled = false;
    }

    async _waitForJob(jobId) {
        const progressLbl = document.getElementById("ie-gmic-progress-lbl");
        const applyBtn    = document.getElementById("ie-gmic-apply-btn");
        const maxWait = 600, interval = 2000;
        const start = Date.now();
        this.state.aborted = false;

        while (true) {
            if (this.state.aborted) throw new Error("__aborted__");
            if ((Date.now() - start) / 1000 > maxWait) throw new Error("Timeout");
            await new Promise(r => setTimeout(r, interval));
            if (this.state.aborted) throw new Error("__aborted__");
            try {
                const res = await fetch(`/api/wfm/gmic/status/${jobId}`);
                if (res.status === 404) throw new Error("__aborted__");
                if (!res.ok) continue;
                const status = await res.json();
                if (status.status === "completed") {
                    this.state.lastResultJobId = jobId;
                    if (applyBtn) applyBtn.disabled = false;
                    if (progressLbl) progressLbl.textContent = "処理完了 → 「結果を反映」で画像に適用";
                    this.state.processing = false;
                    showToast("G'MIC filtering complete. Click Apply to insert result.", "success");
                    return;
                }
                if (status.status === "failed") {
                    if (progressLbl) progressLbl.textContent = status.error || "G'MIC GUIがキャンセルされました";
                    throw new Error("__aborted__");
                }
                if (progressLbl) progressLbl.textContent = status.message || "G'MIC GUIで編集中...";
            } catch (e) {
                if (e.message === "__aborted__" || e.message.includes("Timeout")) throw e;
            }
        }
    }

    async applyResult() {
        if (!this.state.lastResultJobId) {
            showToast("No G'MIC result to apply", "error");
            return;
        }
        const applyBtn = document.getElementById("ie-gmic-apply-btn");
        const openBtn  = document.getElementById("ie-gmic-open-btn");
        const progressArea = document.getElementById("ie-gmic-progress-area");
        if (applyBtn) applyBtn.disabled = true;

        try {
            const statusRes = await fetch(`/api/wfm/gmic/status/${this.state.lastResultJobId}`);
            if (!statusRes.ok) throw new Error(`HTTP ${statusRes.status}`);
            const statusData = await statusRes.json();
            if (!statusData.result_path) throw new Error("No result path found");

            const b64res = await fetch("/api/wfm/gmic/result", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ result_path: statusData.result_path })
            });
            if (!b64res.ok) throw new Error(`HTTP ${b64res.status}`);
            const { image_b64: dataUrl } = await b64res.json();

            const img = await new Promise((resolve, reject) => {
                const i = new Image();
                i.onload  = () => resolve(i);
                i.onerror = () => reject(new Error("Failed to load result image"));
                i.src = dataUrl;
            });

            this._cb.saveUndo();

            const layerMgr = this._cb.getLayerManager();
            const layer = layerMgr?.activeLayer;
            if (!layer) throw new Error("No active layer");

            layer.canvas.width  = img.width;
            layer.canvas.height = img.height;
            layer.ctx = layer.canvas.getContext("2d");
            layer.ctx.drawImage(img, 0, 0);

            this._cb.updateCompositeView();
            this._cb.refreshLayerList();
            showToast("G'MIC filter applied successfully", "success");

            // Reset G'MIC status
            this.state.lastResultJobId = null;
            this.state.processing = false;
            if (openBtn) openBtn.disabled = false;
            if (progressArea) progressArea.style.display = "none";
            this._cb.renderToolOptions("filter");
        } catch (err) {
            showToast("Failed to apply G'MIC result: " + err.message, "error");
            if (applyBtn) applyBtn.disabled = false;
        }
    }
}

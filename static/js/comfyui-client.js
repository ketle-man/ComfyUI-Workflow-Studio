/**
 * ComfyUI API Client
 * Handles communication with ComfyUI server (same origin)
 */

function _uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}

export const comfyUI = {
    baseUrl: "",
    wsUrl: "",
    clientId: _uuid(),
    socket: null,
    connected: false,
    generating: false,
    currentPromptId: null,
    // trackProgress() 実行中の Promise を promptId -> reject関数 で保持。
    // WebSocket切断時に、待機中のPromiseを解決させずに放置してバッチループが
    // 無言のまま停止する（例: カタログ作成バッチが特定件数で止まる）のを防ぐ。
    _pendingTrackers: new Map(),
    currentWorkflow: null,
    currentAnalysis: null,
    // ワークフロー読み込み時点のLora Loader (LoraManager)ノードの loras/text 状態。
    // Stackグループチェックボックスのトグル時に、OFF側の「読み込み時の状態へ戻す」用に使う。
    loraManagerSnapshots: {},

    updateUrl(url) {
        if (!url) {
            this.baseUrl = "";
            this.wsUrl = "";
            return;
        }
        url = url.replace(/\/+$/, "");
        this.baseUrl = url;
        this.wsUrl = url.replace(/^http/, "ws");
    },

    async checkConnection() {
        try {
            const res = await fetch(`${this.baseUrl}/system_stats`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.connected = true;
            return true;
        } catch {
            this.connected = false;
            return false;
        }
    },

    connectWebSocket() {
        // Reuse existing open connection
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            return Promise.resolve(true);
        }
        // Wait if currently connecting
        if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
            return new Promise((resolve) => {
                this.socket.addEventListener("open", () => resolve(true), { once: true });
                this.socket.addEventListener("error", () => resolve(false), { once: true });
            });
        }
        // Close stale socket
        if (this.socket) {
            try { this.socket.close(); } catch {}
            this.socket = null;
        }
        return new Promise((resolve) => {
            const url = `${this.wsUrl}/ws?clientId=${this.clientId}`;
            this.socket = new WebSocket(url);
            this.socket.onopen = () => resolve(true);
            this.socket.onerror = () => resolve(false);
            this.socket.onclose = () => {
                this.socket = null;
                this._rejectPendingTrackers(new Error("WebSocket disconnected"));
            };
        });
    },

    _rejectPendingTrackers(err) {
        for (const rejectFn of this._pendingTrackers.values()) rejectFn(err);
        this._pendingTrackers.clear();
    },

    // Node info fetching
    async fetchObjectInfo(nodeClass) {
        const res = await fetch(`${this.baseUrl}/object_info/${nodeClass}`);
        if (!res.ok) return null;
        return await res.json();
    },

    async fetchAllObjectInfo() {
        const res = await fetch(`${this.baseUrl}/object_info`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    },

    async _fetchModelList(nodeClasses, inputKey) {
        for (const cls of nodeClasses) {
            try {
                const info = await this.fetchObjectInfo(cls);
                if (info?.[cls]?.input?.required?.[inputKey]) {
                    const inputDef = info[cls].input.required[inputKey];
                    const first = inputDef[0];
                    // V1: [["model1", "model2"], {}]
                    if (Array.isArray(first)) return first;
                    // V2: ["COMBO", { "values": [...] }]
                    if (typeof first === "string" && Array.isArray(inputDef[1]?.values)) {
                        return inputDef[1].values;
                    }
                    // V3 ComfyNode: ["COMBO", { "options": [...] }]
                    if (typeof first === "string" && Array.isArray(inputDef[1]?.options)) {
                        return inputDef[1].options;
                    }
                }
            } catch {}
        }
        return [];
    },

    async fetchCheckpoints() {
        return this._fetchModelList(
            ["CheckpointLoaderSimple", "CheckpointLoader"],
            "ckpt_name"
        );
    },

    async fetchLoras() {
        return this._fetchModelList(
            ["LoraLoader", "LoraLoaderModelOnly"],
            "lora_name"
        );
    },

    async fetchVaes() {
        return this._fetchModelList(["VAELoader"], "vae_name");
    },

    async fetchControlNets() {
        return this._fetchModelList(
            ["ControlNetLoader", "ControlNetApply"],
            "control_net_name"
        );
    },

    async fetchDiffusionModels() {
        const [standard, gguf] = await Promise.all([
            this._fetchModelList(["UNETLoader", "UnetLoaderGGUF"], "unet_name"),
            this._fetchModelList(["LoaderGGUF", "LoaderGGUFAdvanced"], "gguf_name"),
        ]);
        return [...new Set([...standard, ...gguf])];
    },

    async fetchTextEncoders() {
        const [dual, single] = await Promise.all([
            this._fetchModelList(["DualCLIPLoader", "DualClipLoaderGGUF"], "clip_name1"),
            this._fetchModelList(["CLIPLoader", "ClipLoaderGGUF"], "clip_name"),
        ]);
        return [...new Set([...dual, ...single])];
    },

    async fetchHypernetworks() {
        return this._fetchModelList(
            ["HypernetworkLoader"],
            "hypernetwork_name"
        );
    },

    async fetchEmbeddings() {
        // Use WFS backend API (reliable, goes through same aiohttp server)
        try {
            const res = await fetch("/api/wfm/models/files?type=embedding");
            if (res.ok) {
                const list = await res.json();
                return Array.isArray(list) ? list : [];
            }
            console.warn("[WFS] /api/wfm/models/files?type=embedding returned", res.status);
        } catch (e) {
            console.error("[WFS] fetchEmbeddings error:", e);
        }
        return [];
    },

    async fetchSamplers() {
        return this._fetchModelList(["KSampler"], "sampler_name");
    },

    async fetchSchedulers() {
        return this._fetchModelList(["KSampler"], "scheduler");
    },

    // Generation
    async queuePrompt(workflow, extraData = null) {
        const body = {
            prompt: workflow,
            client_id: this.clientId,
        };
        if (extraData) body.extra_data = extraData;
        const res = await fetch(`${this.baseUrl}/prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `HTTP ${res.status}`);
        }
        return await res.json();
    },

    // timeoutMs: この時間内に完了/エラー/中断通知が来なければ強制的にreject。
    // WebSocketの取りこぼしやexecution_interrupted未処理でPromiseが永久に
    // ぶら下がり続け、バッチループが無言で停止するのを防ぐための安全弁。
    trackProgress(promptId, progressCallback, timeoutMs = 10 * 60 * 1000) {
        return new Promise((resolve, reject) => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                reject(new Error("WebSocket not connected"));
                return;
            }
            let settled = false;
            const finish = (isResolve, value) => {
                if (settled) return;
                settled = true;
                this.socket?.removeEventListener("message", handler);
                clearTimeout(timer);
                this._pendingTrackers.delete(promptId);
                if (isResolve) resolve(value); else reject(value);
            };

            const timer = setTimeout(() => {
                finish(false, new Error(`Generation timed out after ${Math.round(timeoutMs / 1000)}s (prompt_id=${promptId})`));
            }, timeoutMs);

            const handler = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === "progress" && msg.data?.prompt_id === promptId) {
                        const pct = msg.data.value / msg.data.max;
                        progressCallback?.(pct, msg.data);
                    }
                    if (msg.type === "executing" && msg.data?.prompt_id === promptId) {
                        if (msg.data.node === null) {
                            finish(true);
                        }
                    }
                    if (msg.type === "execution_error" && msg.data?.prompt_id === promptId) {
                        finish(false, new Error(msg.data.exception_message || "Execution error"));
                    }
                    if (msg.type === "execution_interrupted" && msg.data?.prompt_id === promptId) {
                        finish(false, new Error("Execution interrupted"));
                    }
                } catch {}
            };
            this.socket.addEventListener("message", handler);
            this._pendingTrackers.set(promptId, (err) => finish(false, err));
        });
    },

    async getHistory(promptId) {
        const res = await fetch(`${this.baseUrl}/history/${promptId}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data[promptId] || null;
    },

    async getImageBlob(imageData) {
        const params = new URLSearchParams({
            filename: imageData.filename,
            subfolder: imageData.subfolder || "",
            type: imageData.type || "output",
        });
        const res = await fetch(`${this.baseUrl}/view?${params}`);
        if (!res.ok) throw new Error(`Failed to fetch image: HTTP ${res.status}`);
        const blob = await res.blob();
        // /view はSVGをセキュリティ上application/octet-streamで返すため、
        // <img>で表示できるよう拡張子から正しいMIMEタイプへ付け替える
        if (imageData.filename?.toLowerCase().endsWith(".svg") && blob.type !== "image/svg+xml") {
            return blob.slice(0, blob.size, "image/svg+xml");
        }
        return blob;
    },

    async uploadImage(file, filename, overwrite = true) {
        const fd = new FormData();
        fd.append("image", file, filename || file.name);
        fd.append("overwrite", overwrite ? "true" : "false");
        const res = await fetch(`${this.baseUrl}/upload/image`, {
            method: "POST",
            body: fd,
        });
        if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);
        return await res.json();
    },

    async interrupt() {
        await fetch(`${this.baseUrl}/interrupt`, { method: "POST" });
    },

    // Seed helpers
    applySeedToWorkflow(workflow, seed) {
        for (const node of Object.values(workflow)) {
            if (!node?.inputs) continue;
            if ("seed" in node.inputs) node.inputs.seed = seed;
            if ("noise_seed" in node.inputs) node.inputs.noise_seed = seed;
        }
    },

    // High-level generate
    async generate(workflow, options = {}) {
        const { seedMode = "random", seedValue = -1, onProgress, onComplete, onError, timeoutMs } = options;

        this.generating = true;
        try {
            // Apply seed
            let seed = seedValue;
            if (seedMode === "random" || seed < 0) {
                seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
            }
            this.applySeedToWorkflow(workflow, seed);

            // Connect WebSocket
            const wsOk = await this.connectWebSocket();
            if (!wsOk) {
                throw new Error("Failed to connect WebSocket");
            }

            // Queue prompt — pass workflow as extra_pnginfo so SaveImage embeds it in PNG metadata
            const result = await this.queuePrompt(workflow, { extra_pnginfo: { workflow } });
            this.currentPromptId = result.prompt_id;

            // Track progress
            await this.trackProgress(result.prompt_id, onProgress, timeoutMs);

            // Get history/results
            const history = await this.getHistory(result.prompt_id);
            if (!history) throw new Error("No history found");

            // Extract images from SaveImage outputs only
            const images = [];
            // comfyui-tosvg の "Save SVG String" ノードは images ではなく
            // saved_svg(ファイル名) / path(絶対パス) という独自キーで返す
            const svgOutputs = [];
            const outputs = history.outputs || {};
            for (const nodeOutput of Object.values(outputs)) {
                if (nodeOutput.images) {
                    for (const img of nodeOutput.images) {
                        images.push(img);
                    }
                }
                if (nodeOutput.saved_svg) {
                    // ComfyUI の実行エンジンは ui 出力の各値をイテラブルとして連結するため、
                    // ノード側が単一文字列で返すと 1 文字ずつ分解された配列になってしまう。
                    // (例: "a.svg" -> ["a",".","s","v","g"]) 文字配列を検出したら結合して復元する。
                    const joinIfCharArray = (v) =>
                        Array.isArray(v) && v.every((c) => typeof c === "string" && c.length === 1)
                            ? v.join("")
                            : v;
                    svgOutputs.push({
                        filename: joinIfCharArray(nodeOutput.saved_svg),
                        path: joinIfCharArray(nodeOutput.path) || "",
                    });
                }
            }

            onComplete?.(images, seed);
            return { images, seed, svgOutputs };
        } catch (err) {
            onError?.(err);
            throw err;
        } finally {
            this.generating = false;
        }
    },
};

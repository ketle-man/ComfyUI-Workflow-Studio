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
    currentWorkflow: null,
    currentAnalysis: null,

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
            this.socket.onclose = () => { this.socket = null; };
        });
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
                    if (Array.isArray(first)) return first;
                    // Newer ComfyUI format: ["COMBO", { "values": [...] }]
                    if (typeof first === "string" && Array.isArray(inputDef[1]?.values)) {
                        return inputDef[1].values;
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
        return this._fetchModelList(
            ["UNETLoader", "UnetLoaderGGUF"],
            "unet_name"
        );
    },

    async fetchTextEncoders() {
        return this._fetchModelList(
            ["DualCLIPLoader", "CLIPLoader"],
            "clip_name1"
        );
    },

    async fetchHypernetworks() {
        return this._fetchModelList(
            ["HypernetworkLoader"],
            "hypernetwork_name"
        );
    },

    async fetchEmbeddings() {
        // ComfyUI exposes embeddings via /embeddings endpoint
        try {
            const res = await fetch(`${this.baseUrl}/embeddings`);
            if (res.ok) {
                const list = await res.json();
                return Array.isArray(list) ? list : [];
            }
        } catch {}
        return [];
    },

    async fetchSamplers() {
        return this._fetchModelList(["KSampler"], "sampler_name");
    },

    async fetchSchedulers() {
        return this._fetchModelList(["KSampler"], "scheduler");
    },

    // Generation
    async queuePrompt(workflow) {
        const res = await fetch(`${this.baseUrl}/prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt: workflow,
                client_id: this.clientId,
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `HTTP ${res.status}`);
        }
        return await res.json();
    },

    trackProgress(promptId, progressCallback) {
        return new Promise((resolve, reject) => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                reject(new Error("WebSocket not connected"));
                return;
            }
            const handler = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === "progress" && msg.data?.prompt_id === promptId) {
                        const pct = msg.data.value / msg.data.max;
                        progressCallback?.(pct, msg.data);
                    }
                    if (msg.type === "executing" && msg.data?.prompt_id === promptId) {
                        if (msg.data.node === null) {
                            this.socket.removeEventListener("message", handler);
                            resolve();
                        }
                    }
                    if (msg.type === "execution_error" && msg.data?.prompt_id === promptId) {
                        this.socket.removeEventListener("message", handler);
                        reject(new Error(msg.data.exception_message || "Execution error"));
                    }
                } catch {}
            };
            this.socket.addEventListener("message", handler);
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
        return await res.blob();
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
        const { seedMode = "random", seedValue = -1, onProgress, onComplete, onError } = options;

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

            // Queue prompt
            const result = await this.queuePrompt(workflow);
            this.currentPromptId = result.prompt_id;

            // Track progress
            await this.trackProgress(result.prompt_id, onProgress);

            // Get history/results
            const history = await this.getHistory(result.prompt_id);
            if (!history) throw new Error("No history found");

            // Extract images from SaveImage outputs only
            const images = [];
            const outputs = history.outputs || {};
            for (const nodeOutput of Object.values(outputs)) {
                if (nodeOutput.images) {
                    for (const img of nodeOutput.images) {
                        images.push(img);
                    }
                }
            }

            onComplete?.(images, seed);
            return { images, seed };
        } catch (err) {
            onError?.(err);
            throw err;
        } finally {
            this.generating = false;
        }
    },
};

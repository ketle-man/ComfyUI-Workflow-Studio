/**
 * Image Edit Tab - Layer & LayerManager
 * Inspired by comfyui-mask-editor-one LayerManager.js
 */

export class Layer {
    constructor(name, type, width, height) {
        this.id = crypto.randomUUID();
        this.name = name;
        this.type = type; // 'draw' | 'text'
        this.canvas = document.createElement("canvas");
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext("2d");
        this.visible = true;
        this.opacity = 1.0;
        this.blendMode = "source-over";
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    resize(width, height) {
        const tmp = document.createElement("canvas");
        tmp.width = width;
        tmp.height = height;
        tmp.getContext("2d").drawImage(this.canvas, 0, 0, width, height);
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext("2d");
        this.ctx.drawImage(tmp, 0, 0);
    }

    getThumbnailDataURL(size = 32) {
        const thumb = document.createElement("canvas");
        thumb.width = size;
        thumb.height = size;
        const ctx = thumb.getContext("2d");
        // チェッカー背景（透明部分の表示）
        ctx.fillStyle = "#aaa";
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = "#fff";
        for (let x = 0; x < size; x += 8) {
            for (let y = 0; y < size; y += 8) {
                if ((x / 8 + y / 8) % 2 === 0) ctx.fillRect(x, y, 8, 8);
            }
        }
        ctx.drawImage(this.canvas, 0, 0, size, size);
        return thumb.toDataURL("image/png");
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            imageData: this.canvas.toDataURL("image/png"),
            visible: this.visible,
            opacity: this.opacity,
            blendMode: this.blendMode,
        };
    }

    static fromJSON(json, width, height) {
        const layer = new Layer(json.name, json.type, width, height);
        layer.id = json.id;
        layer.visible = json.visible ?? true;
        layer.opacity = json.opacity ?? 1.0;
        layer.blendMode = json.blendMode ?? "source-over";

        if (json.imageData) {
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    layer.ctx.drawImage(img, 0, 0, width, height);
                    resolve(layer);
                };
                img.onerror = () => resolve(layer);
                img.src = json.imageData;
            });
        }
        return Promise.resolve(layer);
    }
}

export class LayerManager {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.layers = []; // 先頭 = 最前面
        this.activeIndex = 0;
        this._listeners = [];
    }

    get activeLayer() {
        return this.layers[this.activeIndex] ?? null;
    }

    addLayer(type = "draw", name = null) {
        const n = name ?? `Layer ${this.layers.length + 1}`;
        const layer = new Layer(n, type, this.width, this.height);
        this.layers.splice(this.activeIndex, 0, layer);
        this._emit("change");
        return layer;
    }

    deleteLayer(id) {
        if (this.layers.length <= 1) return;
        const idx = this.layers.findIndex(l => l.id === id);
        if (idx < 0) return;
        this.layers.splice(idx, 1);
        this.activeIndex = Math.max(0, Math.min(this.activeIndex, this.layers.length - 1));
        this._emit("change");
    }

    setActive(id) {
        const idx = this.layers.findIndex(l => l.id === id);
        if (idx >= 0) {
            this.activeIndex = idx;
            this._emit("activeChange", this.layers[idx]);
        }
    }

    moveUp(id) {
        const idx = this.layers.findIndex(l => l.id === id);
        if (idx <= 0) return;
        [this.layers[idx - 1], this.layers[idx]] = [this.layers[idx], this.layers[idx - 1]];
        if (this.activeIndex === idx) this.activeIndex = idx - 1;
        else if (this.activeIndex === idx - 1) this.activeIndex = idx;
        this._emit("change");
    }

    moveDown(id) {
        const idx = this.layers.findIndex(l => l.id === id);
        if (idx < 0 || idx >= this.layers.length - 1) return;
        [this.layers[idx], this.layers[idx + 1]] = [this.layers[idx + 1], this.layers[idx]];
        if (this.activeIndex === idx) this.activeIndex = idx + 1;
        else if (this.activeIndex === idx + 1) this.activeIndex = idx;
        this._emit("change");
    }

    toggleVisible(id) {
        const layer = this.layers.find(l => l.id === id);
        if (layer) {
            layer.visible = !layer.visible;
            this._emit("change");
        }
    }

    setOpacity(id, opacity) {
        const layer = this.layers.find(l => l.id === id);
        if (layer) {
            layer.opacity = Math.max(0, Math.min(1, opacity));
            this._emit("change");
        }
    }

    /** 全レイヤーを下→上の順で target canvas に合成 */
    composite(target) {
        const ctx = target.getContext("2d");
        ctx.clearRect(0, 0, target.width, target.height);
        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i];
            if (!layer.visible) continue;
            ctx.save();
            ctx.globalAlpha = layer.opacity;
            ctx.globalCompositeOperation = layer.blendMode;
            ctx.drawImage(layer.canvas, 0, 0);
            ctx.restore();
        }
    }

    on(event, fn) {
        this._listeners.push({ event, fn });
    }

    _emit(event, data) {
        for (const l of this._listeners) {
            if (l.event === event) l.fn(data);
        }
    }

    toJSON() {
        return {
            layers: this.layers.map(l => l.toJSON()),
            width: this.width,
            height: this.height,
        };
    }

    async fromJSON(json) {
        this.layers = await Promise.all(
            (json.layers || []).map(lj => Layer.fromJSON(lj, this.width, this.height))
        );
        this.activeIndex = 0;
        this._emit("change");
    }
}

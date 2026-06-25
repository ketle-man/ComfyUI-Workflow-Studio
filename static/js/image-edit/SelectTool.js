/**
 * Image Edit Tab - Select Tool
 * Handles object selection, move, resize, rotate, flip on the overlay canvas.
 */

const HANDLE_R    = 5;    // ハンドル半径(px)
const ROTATE_DIST = 32;   // 回転ハンドルまでの距離(px)
const MIN_SIZE    = 10;   // 最小表示サイズ(px)

export class SelectTool {
    constructor() {
        this._overlay  = null;
        this._octx     = null;
        this._layer    = null;  // 選択中レイヤー
        this._dragMode = null;  // "move"|"rotate"|"resize-tl"|"resize-tr"|"resize-br"|"resize-bl"
        this._dragStart    = null;
        this._origTransform = null;
        this._onChange  = null;
        this._cursor    = "default";
    }

    setCanvas(overlayCanvas) {
        this._overlay = overlayCanvas;
        this._octx    = overlayCanvas.getContext("2d");
    }

    onChange(fn) { this._onChange = fn; }

    activate() {
        if (this._overlay) this._overlay.style.pointerEvents = "auto";
        this._drawOverlay();
    }

    deactivate() {
        this._clearOverlay();
        if (this._overlay) this._overlay.style.pointerEvents = "none";
    }

    clearSelection() {
        this._layer = null;
        this._dragMode = null;
        this._clearOverlay();
    }

    setLayer(layer) {
        this._layer = layer;
        this._drawOverlay();
    }

    getSelectedLayer() { return this._layer; }

    // ── マウスイベント ───────────────────────────

    onMouseDown(x, y, layerMgr) {
        if (this._layer) {
            const hit = this._hitHandle(x, y);
            // ロック中はハンドル操作を禁止（選択済み表示は維持）
            if (hit && !this._layer.locked) {
                this._startDrag(hit, x, y);
                return hit;
            }
        }

        // レイヤーヒットテスト（前面から）
        for (let i = 0; i < layerMgr.layers.length; i++) {
            const layer = layerMgr.layers[i];
            if (!layer.visible) continue;
            if (this._isPointInLayer(x, y, layer)) {
                this._layer = layer;
                this._drawOverlay();
                // ロック中は選択のみ（移動ドラッグは開始しない）
                if (!layer.locked) this._startDrag("move", x, y);
                return "select";
            }
        }

        // 空白クリック → 選択解除
        this._layer = null;
        this._clearOverlay();
        return null;
    }

    onMouseMove(x, y) {
        if (!this._dragMode || !this._layer) {
            // カーソル変更のみ
            this._updateCursor(x, y);
            return;
        }

        const dx = x - this._dragStart.x;
        const dy = y - this._dragStart.y;
        const ot = this._origTransform;

        if (this._dragMode === "move") {
            this._layer.x = ot.x + dx;
            this._layer.y = ot.y + dy;
        } else if (this._dragMode === "rotate") {
            const cx = ot.x + ot.displayW / 2;
            const cy = ot.y + ot.displayH / 2;
            const a0 = Math.atan2(this._dragStart.y - cy, this._dragStart.x - cx);
            const a1 = Math.atan2(y - cy, x - cx);
            this._layer.rotation = ot.rotation + (a1 - a0) * 180 / Math.PI;
        } else if (this._dragMode.startsWith("resize-")) {
            this._applyResize(dx, dy);
        }

        this._drawOverlay();
        if (this._onChange) this._onChange("transforming");
    }

    onMouseUp() {
        if (this._dragMode) {
            this._dragMode    = null;
            this._dragStart   = null;
            this._origTransform = null;
            if (this._onChange) this._onChange("transformEnd");
        }
    }

    onMouseLeave() { this.onMouseUp(); }

    // ── 反転 ─────────────────────────────────────

    flipH() {
        if (!this._layer) return;
        this._layer.flipX = !this._layer.flipX;
        this._drawOverlay();
        if (this._onChange) this._onChange("transformEnd");
    }

    flipV() {
        if (!this._layer) return;
        this._layer.flipY = !this._layer.flipY;
        this._drawOverlay();
        if (this._onChange) this._onChange("transformEnd");
    }

    // ── 内部ユーティリティ ─────────────────────────

    _startDrag(mode, x, y) {
        this._dragMode  = mode;
        this._dragStart = { x, y };
        this._origTransform = {
            x: this._layer.x, y: this._layer.y,
            displayW: this._layer.displayW, displayH: this._layer.displayH,
            rotation: this._layer.rotation,
        };
    }

    // 回転を考慮した4頂点を返す（name: "tl"|"tr"|"br"|"bl"）
    _getCorners(layer) {
        const hw   = layer.displayW / 2;
        const hh   = layer.displayH / 2;
        const cx   = layer.x + hw;
        const cy   = layer.y + hh;
        const r    = (layer.rotation ?? 0) * Math.PI / 180;
        const cosR = Math.cos(r), sinR = Math.sin(r);
        return [
            { name: "tl", lx: -hw, ly: -hh },
            { name: "tr", lx:  hw, ly: -hh },
            { name: "br", lx:  hw, ly:  hh },
            { name: "bl", lx: -hw, ly:  hh },
        ].map(p => ({
            name: p.name,
            x: cx + p.lx * cosR - p.ly * sinR,
            y: cy + p.lx * sinR + p.ly * cosR,
        }));
    }

    // 上辺中央から ROTATE_DIST だけ上に出た回転ハンドル
    _getRotateHandle(layer) {
        const hw   = layer.displayW / 2;
        const hh   = layer.displayH / 2;
        const cx   = layer.x + hw;
        const cy   = layer.y + hh;
        const r    = (layer.rotation ?? 0) * Math.PI / 180;
        const cosR = Math.cos(r), sinR = Math.sin(r);
        const dist = hh + ROTATE_DIST;
        // ローカル座標 (0, -dist) を回転: x' = dist*sin(r), y' = -dist*cos(r)
        return {
            x: cx + sinR * dist,
            y: cy - cosR * dist,
        };
    }

    _hitHandle(x, y) {
        if (!this._layer) return null;
        const rh = this._getRotateHandle(this._layer);
        if (Math.hypot(x - rh.x, y - rh.y) <= HANDLE_R * 2.5) return "rotate";

        const corners = this._getCorners(this._layer);
        for (const c of corners) {
            if (Math.hypot(x - c.x, y - c.y) <= HANDLE_R * 2.5) return `resize-${c.name}`;
        }

        if (this._isPointInLayer(x, y, this._layer)) return "move";
        return null;
    }

    _isPointInLayer(x, y, layer) {
        const hw = layer.displayW / 2;
        const hh = layer.displayH / 2;
        const cx = layer.x + hw;
        const cy = layer.y + hh;
        // 逆回転で点をローカル座標に変換
        const r    = -(layer.rotation ?? 0) * Math.PI / 180;
        const cosR = Math.cos(r), sinR = Math.sin(r);
        const lx   = (x - cx) * cosR - (y - cy) * sinR;
        const ly   = (x - cx) * sinR + (y - cy) * cosR;
        return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
    }

    _applyResize(dx, dy) {
        const ot   = this._origTransform;
        const mode = this._dragMode;
        // 回転の逆行列でdx/dyをローカル座標に変換
        const r    = -(ot.rotation ?? 0) * Math.PI / 180;
        const cosR = Math.cos(r), sinR = Math.sin(r);
        const ldx  = dx * cosR - dy * sinR;
        const ldy  = dx * sinR + dy * cosR;

        let { x, y, displayW, displayH } = ot;

        if (mode === "resize-tl") { x += ldx; y += ldy; displayW -= ldx; displayH -= ldy; }
        else if (mode === "resize-tr") {         y += ldy; displayW += ldx; displayH -= ldy; }
        else if (mode === "resize-br") {                   displayW += ldx; displayH += ldy; }
        else if (mode === "resize-bl") { x += ldx;         displayW -= ldx; displayH += ldy; }

        if (displayW < MIN_SIZE) { if (mode.includes("l")) x -= MIN_SIZE - displayW; displayW = MIN_SIZE; }
        if (displayH < MIN_SIZE) { if (mode.includes("t")) y -= MIN_SIZE - displayH; displayH = MIN_SIZE; }

        // 回転あり: x/yのずれを回転軸中心に合わせて再計算
        // ローカル左上の変位を逆回転して戻す
        const r2   = (ot.rotation ?? 0) * Math.PI / 180;
        const cosR2 = Math.cos(r2), sinR2 = Math.sin(r2);
        const ox   = ot.x + ot.displayW / 2;
        const oy   = ot.y + ot.displayH / 2;
        // 新しい左上 (ローカル -hw2, -hh2 を回転して絶対座標)
        const hw2  = displayW / 2;
        const hh2  = displayH / 2;
        const dx2  = -hw2 * cosR2 + hh2 * sinR2; // ローカル(-hw2, -hh2)を回転
        const dy2  = -hw2 * sinR2 - hh2 * cosR2;
        // ... でも回転付きリサイズは複雑なので、回転がほぼ0のときのみシンプル版を使用
        if (Math.abs(ot.rotation ?? 0) < 1) {
            this._layer.x = x; this._layer.y = y;
        }
        // 回転あり時は displayW/H のみ更新（位置は維持）
        this._layer.displayW = displayW;
        this._layer.displayH = displayH;
    }

    _updateCursor(x, y) {
        if (!this._overlay) return;
        const hit = this._layer ? this._hitHandle(x, y) : null;
        const cursorMap = {
            "move": "move", "rotate": "crosshair",
            "resize-tl": "nwse-resize", "resize-br": "nwse-resize",
            "resize-tr": "nesw-resize", "resize-bl": "nesw-resize",
        };
        this._overlay.style.cursor = hit ? (cursorMap[hit] ?? "default") : "default";
    }

    // ── オーバーレイ描画 ───────────────────────────

    _drawOverlay() {
        this._clearOverlay();
        if (!this._layer || !this._octx) return;

        const ctx     = this._octx;
        const layer   = this._layer;
        const locked  = !!layer.locked;
        const color   = locked ? "#e2a04a" : "#4a90e2"; // ロック中はオレンジ
        const corners = this._getCorners(layer);
        const rh      = this._getRotateHandle(layer);
        const tl = corners[0], tr = corners[1];
        const topMid = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };

        ctx.save();

        // バウンディングボックス
        ctx.setLineDash([5, 3]);
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        corners.forEach((c, i) => i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y));
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        if (!locked) {
            // 回転ライン＋ハンドル（ロック中は非表示）
            ctx.strokeStyle = color;
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.moveTo(topMid.x, topMid.y);
            ctx.lineTo(rh.x, rh.y);
            ctx.stroke();

            ctx.fillStyle   = "#fff";
            ctx.strokeStyle = color;
            ctx.lineWidth   = 1.5;
            ctx.beginPath();
            ctx.arc(rh.x, rh.y, HANDLE_R, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // コーナーハンドル
            for (const c of corners) {
                ctx.fillStyle   = "#fff";
                ctx.strokeStyle = color;
                ctx.lineWidth   = 1.5;
                ctx.beginPath();
                ctx.rect(c.x - HANDLE_R, c.y - HANDLE_R, HANDLE_R * 2, HANDLE_R * 2);
                ctx.fill();
                ctx.stroke();
            }
        } else {
            // ロック中: 中央に鍵アイコン
            const cx = layer.x + layer.displayW / 2;
            const cy = layer.y + layer.displayH / 2;
            ctx.font      = "18px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = color;
            ctx.fillText("🔒", cx, cy);
        }

        ctx.restore();
    }

    _clearOverlay() {
        if (this._octx && this._overlay) {
            this._octx.clearRect(0, 0, this._overlay.width, this._overlay.height);
        }
    }
}

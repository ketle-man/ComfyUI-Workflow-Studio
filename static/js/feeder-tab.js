/**
 * Feeder Tab - ImageFeeder node control with embedded image library
 */

import { comfyUI } from "./comfyui-client.js";
import { showToast } from "./app.js";

// ── Module State ──────────────────────────────────────────────────
const _s = {
    dir: "",            // current folder relative path
    images: [],         // filenames in current folder
    selected: new Set(),// selected filenames (across all interactions)
    presets: {},        // {presetName: {directory, selected_files}}
    running: false,     // feeder run loop active
};

// ── Node helpers ──────────────────────────────────────────────────

function _feederNodes() {
    const wf = comfyUI.currentWorkflow;
    if (!wf) return [];
    return Object.entries(wf)
        .filter(([, n]) => n?.class_type === "ImageFeeder")
        .map(([id, n]) => ({ id, title: n._meta?.title || `ImageFeeder` }));
}

export function refreshFeederNodeList() {
    const sel = document.getElementById("wfm-feeder-node-sel");
    if (!sel) return;
    const nodes = _feederNodes();
    if (nodes.length === 0) {
        sel.innerHTML = `<option value="">-- No ImageFeeder node --</option>`;
        return;
    }
    const prevVal = sel.value;
    sel.innerHTML = nodes.map(n =>
        `<option value="${n.id}">${n.title} (ID:${n.id})</option>`
    ).join("");
    if (prevVal && nodes.find(n => n.id === prevVal)) sel.value = prevVal;
    _loadFromNode(sel.value || nodes[0].id);
}

function _loadFromNode(nodeId) {
    const wf = comfyUI.currentWorkflow;
    if (!wf?.[nodeId]) return;
    const inp = wf[nodeId].inputs || {};

    _setVal("wfm-feeder-dir-input",  inp.directory   || "");
    _setVal("wfm-feeder-sort",       inp.sort_mode   || "ascending");
    _setVal("wfm-feeder-index",      inp.index       ?? 0);
    _setVal("wfm-feeder-start",      inp.start_index ?? 0);
    _setVal("wfm-feeder-end",        inp.end_index   ?? 0);
    _setVal("wfm-feeder-batch",      inp.batch_size  ?? 1);
    _setVal("wfm-feeder-seed",       inp.seed        ?? 0);
    _setCheck("wfm-feeder-use-sel",  inp.use_selection ?? true);

    // Restore selected_files
    _s.selected.clear();
    try {
        const arr = JSON.parse(inp.selected_files || "[]");
        if (Array.isArray(arr)) arr.forEach(f => _s.selected.add(f));
    } catch {}

    const dir = inp.directory || "";
    if (_s.dir !== dir) {
        _s.dir = dir;
        _loadImages(dir);
        _highlightTreeRow(dir);
    } else {
        _refreshGridCbs();
    }
    _updateStatus();
}

function _applyToWorkflow() {
    const nodeId = document.getElementById("wfm-feeder-node-sel")?.value;
    const wf = comfyUI.currentWorkflow;
    if (!nodeId || !wf?.[nodeId]) {
        showToast("No ImageFeeder node selected", "error");
        return;
    }
    _applyToNode(nodeId);
    showToast("Applied to workflow", "success");
}

// ── Run Loop ──────────────────────────────────────────────────────

function _setRunUI(running) {
    const runBtn  = document.getElementById("wfm-feeder-run-btn");
    const stopBtn = document.getElementById("wfm-feeder-stop-btn");
    if (runBtn)  runBtn.disabled  = running;
    if (stopBtn) stopBtn.disabled = !running;
}

function _applyToNode(nodeId) {
    const wf  = comfyUI.currentWorkflow;
    const inp = wf[nodeId].inputs;
    inp.directory      = _s.dir;
    inp.sort_mode      = document.getElementById("wfm-feeder-sort")?.value || "ascending";
    inp.index          = parseInt(document.getElementById("wfm-feeder-index")?.value)  || 0;
    inp.start_index    = parseInt(document.getElementById("wfm-feeder-start")?.value)  || 0;
    inp.end_index      = parseInt(document.getElementById("wfm-feeder-end")?.value)    || 0;
    inp.batch_size     = parseInt(document.getElementById("wfm-feeder-batch")?.value)  || 1;
    inp.seed           = parseInt(document.getElementById("wfm-feeder-seed")?.value)   || 0;
    inp.use_selection  = document.getElementById("wfm-feeder-use-sel")?.checked ?? true;
    inp.selected_files = JSON.stringify([..._s.selected]);
}

async function _startRun() {
    if (_s.running) return;
    if (!comfyUI.currentWorkflow) { showToast("No workflow loaded", "error"); return; }
    if (!comfyUI.connected)       { showToast("Not connected to ComfyUI", "error"); return; }

    const nodeId = document.getElementById("wfm-feeder-node-sel")?.value;
    if (!nodeId || !comfyUI.currentWorkflow[nodeId]) {
        showToast("No ImageFeeder node selected", "error");
        return;
    }

    // WebSocket を先に接続してノード sync メッセージを受け取れるようにする
    const wsOk = await comfyUI.connectWebSocket();
    if (!wsOk) { showToast("WebSocket connection failed", "error"); return; }

    _s.running = true;
    _setRunUI(true);

    const progressBar  = document.getElementById("wfm-gen-progress-bar");
    const progressText = document.getElementById("wfm-gen-progress-text");
    const resultImg    = document.getElementById("wfm-gen-result-img");

    // image_loop_node_sync メッセージを捕捉するリスナー
    let _lastSync = null;
    const _syncHandler = (ev) => {
        try {
            const msg = JSON.parse(ev.data);
            if (msg.type === "image_loop_node_sync" && String(msg.data?.node_id) === String(nodeId)) {
                _lastSync = msg.data;
            }
        } catch {}
    };
    comfyUI.socket.addEventListener("message", _syncHandler);

    let count = 0;
    try {
        while (_s.running) {
            _lastSync = null;
            _applyToNode(nodeId);

            const wf  = comfyUI.currentWorkflow;
            const inp = wf[nodeId].inputs;

            if (progressBar)  progressBar.style.width  = "0%";
            if (progressText) progressText.textContent = `#${++count} 0%`;

            // 右ペインのseed設定を使用（KSamplerに適用される）
            const seedMode  = document.getElementById("wfm-gen-seed-mode")?.value  || "random";
            const seedValue = parseInt(document.getElementById("wfm-gen-seed-value")?.value) || -1;

            const { images, seed } = await comfyUI.generate(
                { ...wf },
                {
                    seedMode,
                    seedValue,
                    onProgress: (pct) => {
                        if (progressBar)  progressBar.style.width  = `${(pct * 100).toFixed(1)}%`;
                        if (progressText) progressText.textContent = `#${count} ${(pct * 100).toFixed(0)}%`;
                    },
                }
            );

            // 右ペインのseed表示を更新（通常の生成と同じ挙動）
            const seedEl = document.getElementById("wfm-gen-seed-value");
            if (seedEl) seedEl.value = seed;

            if (progressBar) progressBar.style.width = "100%";

            if (images.length > 0 && resultImg) {
                const blob = await comfyUI.getImageBlob(images[0]);
                resultImg.src = URL.createObjectURL(blob);
                resultImg.style.display = "block";
            }

            if (!_s.running) break;

            // control after generate: ノードから返された next_index を反映
            const control = document.getElementById("wfm-feeder-control-after")?.value || "loop";
            if (control === "fixed") {
                // index を変えない
            } else if (_lastSync) {
                const indexEl = document.getElementById("wfm-feeder-index");
                if (indexEl) indexEl.value = _lastSync.next_index;
                if (control === "increment" && !_lastSync.has_next) {
                    _s.running = false;
                    showToast(`Feeder complete (${count} generated)`, "success");
                    break;
                }
                // loop: has_next=false でも次は index=0 からなので続行
            }
        }
    } catch (err) {
        if (_s.running) showToast("Feeder run error: " + err.message, "error");
    } finally {
        comfyUI.socket?.removeEventListener("message", _syncHandler);
        _s.running = false;
        _setRunUI(false);
        if (progressText) progressText.textContent = `Done (${count} generated)`;
    }
}

async function _stopRun() {
    _s.running = false;
    try { await comfyUI.interrupt(); } catch {}
    _setRunUI(false);
    showToast("Feeder stopped", "info");
}

// ── Folder Tree ───────────────────────────────────────────────────

async function _loadTree() {
    const container = document.getElementById("wfm-feeder-tree");
    if (!container) return;
    container.innerHTML = `<div class="wfm-feeder-tree-msg">Loading...</div>`;
    try {
        const res = await fetch("/image_loop/tree");
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        _renderTree(data.tree || [], container);
    } catch (err) {
        container.innerHTML = `<div class="wfm-feeder-tree-msg">Cannot reach image-loop API</div>`;
        console.warn("[Feeder] tree load failed:", err);
    }
}

function _renderTree(items, container, depth = 0) {
    if (depth === 0) {
        container.innerHTML = "";
        container.appendChild(_makeTreeRow("", "🏠 (root)", 0));
    }
    for (const item of items) {
        const icon = item.children?.length > 0 ? "📂" : "📁";
        container.appendChild(_makeTreeRow(item.path, `${icon} ${item.name}`, depth + 1));
        if (item.children?.length > 0) _renderTree(item.children, container, depth + 1);
    }
}

function _makeTreeRow(path, label, depth) {
    const row = document.createElement("div");
    row.className = "wfm-feeder-tree-row" + (_s.dir === path ? " active" : "");
    row.style.paddingLeft = `${8 + depth * 12}px`;
    row.dataset.path = path;
    row.textContent = label;
    row.title = path || "(root)";
    row.addEventListener("click", () => _selectDir(path));
    return row;
}

function _selectDir(path) {
    if (_s.dir !== path) {
        _s.selected.clear();
        _s.dir = path;
        _setVal("wfm-feeder-dir-input", path);
    }
    _highlightTreeRow(path);
    _loadImages(path);
    _updateStatus();
}

function _highlightTreeRow(path) {
    document.querySelectorAll(".wfm-feeder-tree-row").forEach(el => {
        el.classList.toggle("active", el.dataset.path === path);
    });
}

// ── Image Grid ────────────────────────────────────────────────────

async function _loadImages(dir) {
    const grid = document.getElementById("wfm-feeder-grid");
    if (!grid) return;
    grid.innerHTML = `<div class="wfm-feeder-grid-msg">Loading...</div>`;
    try {
        const url = "/image_loop/images" + (dir ? `?dir=${encodeURIComponent(dir)}` : "");
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        _s.images = data.images || [];
        _renderGrid();
    } catch (err) {
        _s.images = [];
        grid.innerHTML = `<div class="wfm-feeder-grid-msg" style="color:var(--wfm-danger)">Load failed: ${err.message}</div>`;
    }
    _updateStatus();
}

function _renderGrid() {
    const grid = document.getElementById("wfm-feeder-grid");
    if (!grid) return;
    if (_s.images.length === 0) {
        grid.innerHTML = `<div class="wfm-feeder-grid-msg">No images found</div>`;
        return;
    }
    grid.innerHTML = "";
    for (const fname of _s.images) grid.appendChild(_makeCard(fname));
}

function _makeCard(fname) {
    const relPath = _s.dir ? `${_s.dir}/${fname}` : fname;
    const checked  = _s.selected.has(fname);

    const card = document.createElement("div");
    card.className = "wfm-feeder-card" + (checked ? " selected" : "");
    card.dataset.name = fname;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "wfm-feeder-card-cb";
    cb.checked = checked;
    cb.addEventListener("change", e => {
        e.stopPropagation();
        if (cb.checked) _s.selected.add(fname);
        else _s.selected.delete(fname);
        card.classList.toggle("selected", cb.checked);
        _updateStatus();
    });

    const img = document.createElement("img");
    img.className = "wfm-feeder-card-img";
    img.loading = "lazy";
    img.src = `/image_loop/thumbnail?path=${encodeURIComponent(relPath)}`;
    img.onerror = () => { img.style.display = "none"; card.style.minHeight = "110px"; };

    const name = document.createElement("div");
    name.className = "wfm-feeder-card-name";
    name.textContent = fname;
    name.title = fname;

    card.append(cb, img, name);
    card.addEventListener("click", e => {
        if (e.target === cb) return;
        _showPreview(relPath, fname);
    });
    return card;
}

function _refreshGridCbs() {
    document.querySelectorAll(".wfm-feeder-card").forEach(card => {
        const sel = _s.selected.has(card.dataset.name);
        card.classList.toggle("selected", sel);
        const cb = card.querySelector("input[type=checkbox]");
        if (cb) cb.checked = sel;
    });
}

function _selectAll() {
    _s.images.forEach(f => _s.selected.add(f));
    _refreshGridCbs();
    _updateStatus();
}

function _deselectAll() {
    _s.images.forEach(f => _s.selected.delete(f));
    _refreshGridCbs();
    _updateStatus();
}

// ── Status Bar ───────────────────────────────────────────────────

function _updateStatus() {
    const el = document.getElementById("wfm-feeder-status");
    if (!el) return;
    const inCurrent = _s.images.filter(f => _s.selected.has(f)).length;
    el.textContent = `📂 ${_s.dir || "(root)"} | ${inCurrent} / ${_s.images.length} selected`;
}

// ── Preview Panel ────────────────────────────────────────────────

async function _showPreview(relPath, fname) {
    const imgEl  = document.getElementById("wfm-feeder-preview-img");
    const nameEl = document.getElementById("wfm-feeder-preview-name");
    const infoEl = document.getElementById("wfm-feeder-preview-info");

    if (imgEl) {
        imgEl.src = `/image_loop/thumbnail?path=${encodeURIComponent(relPath)}`;
        imgEl.style.display = "block";
    }
    if (nameEl) nameEl.textContent = fname;
    if (infoEl) infoEl.textContent = "Loading...";

    try {
        const res = await fetch(`/image_loop/image_info?path=${encodeURIComponent(relPath)}`);
        if (res.ok && infoEl) {
            const d = await res.json();
            const kb = d.size_bytes ? (d.size_bytes / 1024).toFixed(1) + " KB" : "";
            infoEl.textContent = `${d.width ?? "?"}×${d.height ?? "?"} px\n${kb}`;
        }
    } catch { if (infoEl) infoEl.textContent = ""; }
}

// ── Presets ──────────────────────────────────────────────────────

async function _loadPresets() {
    try {
        const res = await fetch("/image_feeder/presets");
        if (!res.ok) return;
        _s.presets = await res.json();
    } catch { _s.presets = {}; }
    _renderPresets();
}

function _renderPresets() {
    const sel = document.getElementById("wfm-feeder-preset-sel");
    if (!sel) return;
    const names = Object.keys(_s.presets).sort();
    sel.innerHTML = `<option value="">-- Select preset --</option>` +
        names.map(n => `<option value="${n}">${n}</option>`).join("");
}

async function _savePreset() {
    const name = document.getElementById("wfm-feeder-preset-name")?.value.trim();
    if (!name) { showToast("Enter a preset name", "error"); return; }
    const sel = _s.images.filter(f => _s.selected.has(f));
    try {
        const res = await fetch("/image_feeder/presets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, directory: _s.dir, selected_files: sel }),
        });
        if (res.ok) {
            showToast(`Preset saved: ${name}`, "success");
            const nameInput = document.getElementById("wfm-feeder-preset-name");
            if (nameInput) nameInput.value = "";
            await _loadPresets();
            const selEl = document.getElementById("wfm-feeder-preset-sel");
            if (selEl) selEl.value = name;
        } else { showToast("Save failed", "error"); }
    } catch (err) { showToast("Save error: " + err.message, "error"); }
}

async function _applyPreset() {
    const selEl = document.getElementById("wfm-feeder-preset-sel");
    const name = selEl?.value;
    if (!name || !_s.presets[name]) { showToast("Select a preset first", "error"); return; }
    const preset = _s.presets[name];
    const dir = preset.directory || "";

    _s.selected.clear();
    (preset.selected_files || []).forEach(f => _s.selected.add(f));
    _setVal("wfm-feeder-dir-input", dir);

    if (_s.dir !== dir) {
        _s.dir = dir;
        _highlightTreeRow(dir);
        await _loadImages(dir);
    }
    _refreshGridCbs();
    _updateStatus();
    showToast(`Preset loaded: ${name}`, "success");
}

async function _deletePreset() {
    const name = document.getElementById("wfm-feeder-preset-sel")?.value;
    if (!name) return;
    try {
        await fetch(`/image_feeder/presets/${encodeURIComponent(name)}`, { method: "DELETE" });
        showToast(`Preset deleted: ${name}`, "info");
        await _loadPresets();
    } catch (err) { showToast("Delete error", "error"); }
}

// ── Helpers ───────────────────────────────────────────────────────

function _setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? "";
}
function _setCheck(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
}

// ── Init ─────────────────────────────────────────────────────────

export async function initFeederTab() {
    document.getElementById("wfm-feeder-node-sel")?.addEventListener("change", e => {
        _loadFromNode(e.target.value);
    });

    document.getElementById("wfm-feeder-apply-btn")?.addEventListener("click", _applyToWorkflow);

    document.getElementById("wfm-feeder-dir-input")?.addEventListener("change", e => {
        const val = e.target.value.trim();
        if (_s.dir !== val) {
            _s.dir = val;
            _highlightTreeRow(val);
            _loadImages(val);
        }
    });

    document.getElementById("wfm-feeder-reload-tree")?.addEventListener("click", _loadTree);
    document.getElementById("wfm-feeder-sel-all")?.addEventListener("click", _selectAll);
    document.getElementById("wfm-feeder-desel-all")?.addEventListener("click", _deselectAll);

    document.getElementById("wfm-feeder-preset-save")?.addEventListener("click", _savePreset);
    document.getElementById("wfm-feeder-preset-load")?.addEventListener("click", _applyPreset);
    document.getElementById("wfm-feeder-preset-del")?.addEventListener("click", _deletePreset);

    document.getElementById("wfm-feeder-run-btn")?.addEventListener("click", _startRun);
    document.getElementById("wfm-feeder-stop-btn")?.addEventListener("click", _stopRun);

    await Promise.all([_loadTree(), _loadPresets()]);
}

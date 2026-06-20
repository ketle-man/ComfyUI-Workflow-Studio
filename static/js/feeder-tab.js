/**
 * Feeder Tab - ImageFeeder node control (Image Loop mode)
 *              + WFS_GalleryFeeder node control (Gallery mode)
 */

import { comfyUI } from "./comfyui-client.js";
import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { FEEDER_GROUP, ensureFeederGroup } from "./gallery-tab.js";

// ── Module State ──────────────────────────────────────────────────
const _s = {
    dir: "",            // current folder relative path (loop mode)
    images: [],         // filenames in current folder (loop mode)
    selected: new Set(),// selected filenames (loop mode)
    presets: {},        // {presetName: {directory, selected_files}}
    running: false,     // feeder run loop active
    mode: localStorage.getItem("wfm_feeder_mode") || "loop",  // "loop" | "gallery"
};

// Gallery mode state
const _gs = {
    groups: [],          // [{name}]
    group: FEEDER_GROUP, // selected group name
    images: [],          // absolute paths in selected group
    idx: 0,              // current index
};

// ── Node helpers ──────────────────────────────────────────────────

function _feederNodes() {
    const wf = comfyUI.currentWorkflow;
    if (!wf) return [];
    return Object.entries(wf)
        .filter(([, n]) => n?.class_type === "ImageFeeder")
        .map(([id, n]) => ({ id, title: n._meta?.title || `ImageFeeder` }));
}

function _galFeederNodes() {
    const wf = comfyUI.currentWorkflow;
    if (!wf) return [];
    return Object.entries(wf)
        .filter(([, n]) => n?.class_type === "WFS_GalleryFeeder")
        .map(([id, n]) => ({ id, title: n._meta?.title || `GalleryFeeder` }));
}

export function refreshFeederNodeList() {
    if (_s.mode === "gallery") {
        _refreshGalNodeList();
    } else {
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
}

function _refreshGalNodeList() {
    const sel = document.getElementById("wfm-feeder-gal-node-sel");
    if (!sel) return;
    const nodes = _galFeederNodes();
    if (nodes.length === 0) {
        sel.innerHTML = `<option value="">-- No WFS_GalleryFeeder node --</option>`;
        return;
    }
    const prevVal = sel.value;
    sel.innerHTML = nodes.map(n =>
        `<option value="${n.id}">${n.title} (ID:${n.id})</option>`
    ).join("");
    if (prevVal && nodes.find(n => n.id === prevVal)) sel.value = prevVal;
    _loadFromGalNode(sel.value || nodes[0].id);
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

function _loadFromGalNode(nodeId) {
    const wf = comfyUI.currentWorkflow;
    if (!wf?.[nodeId]) return;
    const inp = wf[nodeId].inputs || {};

    const group = inp.group_name || FEEDER_GROUP;
    _setVal("wfm-feeder-gal-sort", inp.sort_mode || "filename_asc");
    _setVal("wfm-feeder-gal-index", inp.index ?? 0);
    _setVal("wfm-feeder-gal-seed", inp.seed ?? 0);
    _gs.idx = inp.index ?? 0;

    if (_gs.group !== group) {
        _gs.group = group;
        _setGalGroupSelect(group);
        _loadGalImages(group);
    }
}

function _applyToWorkflow() {
    const nodeId = document.getElementById("wfm-feeder-node-sel")?.value;
    const wf = comfyUI.currentWorkflow;
    if (!nodeId || !wf?.[nodeId]) {
        showToast(t("feederNoNode"), "error");
        return;
    }
    _applyToNode(nodeId);
    showToast(t("appliedToWorkflow"), "success");
}

function _applyGalToWorkflow() {
    const nodeId = document.getElementById("wfm-feeder-gal-node-sel")?.value;
    const wf = comfyUI.currentWorkflow;
    if (!nodeId || !wf?.[nodeId]) {
        showToast(t("feederGalNoNode"), "error");
        return;
    }
    _applyToGalNode(nodeId);
    showToast(t("appliedToWorkflow"), "success");
}

// ── Run Loop ──────────────────────────────────────────────────────

function _setRunUI(running) {
    const runBtn  = document.getElementById("wfm-feeder-run-btn");
    const stopBtn = document.getElementById("wfm-feeder-stop-btn");
    if (runBtn)  runBtn.disabled  = running;
    if (stopBtn) stopBtn.disabled = !running;
}

function _setGalRunUI(running) {
    const runBtn  = document.getElementById("wfm-feeder-gal-run-btn");
    const stopBtn = document.getElementById("wfm-feeder-gal-stop-btn");
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

function _applyToGalNode(nodeId) {
    const wf  = comfyUI.currentWorkflow;
    const inp = wf[nodeId].inputs;
    inp.group_name = _gs.group;
    inp.index      = _gs.idx;
    inp.sort_mode  = document.getElementById("wfm-feeder-gal-sort")?.value || "filename_asc";
    inp.seed       = parseInt(document.getElementById("wfm-feeder-gal-seed")?.value) || 0;
}

async function _startRun() {
    if (_s.running) return;
    if (!comfyUI.currentWorkflow) { showToast(t("noWorkflowLoaded"), "error"); return; }
    if (!comfyUI.connected)       { showToast(t("notConnectedToComfyUI"), "error"); return; }

    const nodeId = document.getElementById("wfm-feeder-node-sel")?.value;
    if (!nodeId || !comfyUI.currentWorkflow[nodeId]) {
        showToast(t("feederNoNode"), "error");
        return;
    }

    const wsOk = await comfyUI.connectWebSocket();
    if (!wsOk) { showToast(t("wsConnectionFailed"), "error"); return; }

    _s.running = true;
    _setRunUI(true);

    const progressBar  = document.getElementById("wfm-gen-progress-bar");
    const progressText = document.getElementById("wfm-gen-progress-text");
    const resultImg    = document.getElementById("wfm-gen-result-img");

    let _lastSync = null;
    const _syncHandler = (ev) => {
        try {
            const msg = JSON.parse(ev.data);
            if (msg.type === "image_loop_node_sync" && String(msg.data?.node_id) === String(nodeId)) {
                _lastSync = msg.data;
                if (msg.data.thumbnail_path) {
                    const p = msg.data.thumbnail_path;
                    _showPreview(p, p.split("/").pop());
                }
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

            const seedEl = document.getElementById("wfm-gen-seed-value");
            if (seedEl) seedEl.value = seed;

            if (progressBar) progressBar.style.width = "100%";

            if (images.length > 0 && resultImg) {
                const blob = await comfyUI.getImageBlob(images[0]);
                resultImg.src = URL.createObjectURL(blob);
                resultImg.style.display = "block";
            }

            if (!_s.running) break;

            const control = document.getElementById("wfm-feeder-control-after")?.value || "loop";
            if (control === "fixed") {
                // index を変えない
            } else if (_lastSync) {
                const indexEl = document.getElementById("wfm-feeder-index");
                if (indexEl) indexEl.value = _lastSync.next_index;
                if (control === "increment" && !_lastSync.has_next) {
                    _s.running = false;
                    showToast(t("feederComplete", count), "success");
                    break;
                }
            }
        }
    } catch (err) {
        if (_s.running) showToast(t("feederRunError", err.message), "error");
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
    showToast(t("feederStopped"), "info");
}

// ── Gallery Mode Run Loop ─────────────────────────────────────────

async function _startGalRun() {
    if (_s.running) return;
    if (!comfyUI.currentWorkflow) { showToast(t("noWorkflowLoaded"), "error"); return; }
    if (!comfyUI.connected)       { showToast(t("notConnectedToComfyUI"), "error"); return; }

    const nodeId = document.getElementById("wfm-feeder-gal-node-sel")?.value;
    if (!nodeId || !comfyUI.currentWorkflow[nodeId]) {
        showToast(t("feederGalNoNode"), "error");
        return;
    }
    if (_gs.images.length === 0) {
        showToast(t("feederGalEmptyGroup"), "error");
        return;
    }

    const wsOk = await comfyUI.connectWebSocket();
    if (!wsOk) { showToast(t("wsConnectionFailed"), "error"); return; }

    _s.running = true;
    _setGalRunUI(true);

    const progressBar  = document.getElementById("wfm-gen-progress-bar");
    const progressText = document.getElementById("wfm-gen-progress-text");
    const resultImg    = document.getElementById("wfm-gen-result-img");
    const indexEl      = document.getElementById("wfm-feeder-gal-index");

    const total = _gs.images.length;
    let count = 0;
    try {
        while (_s.running) {
            _applyToGalNode(nodeId);

            if (progressBar)  progressBar.style.width  = "0%";
            if (progressText) progressText.textContent = `#${++count} [${_gs.idx + 1}/${total}] 0%`;

            const seedMode  = document.getElementById("wfm-gen-seed-mode")?.value  || "random";
            const seedValue = parseInt(document.getElementById("wfm-gen-seed-value")?.value) || -1;

            const { images, seed } = await comfyUI.generate(
                { ...comfyUI.currentWorkflow },
                {
                    seedMode,
                    seedValue,
                    onProgress: (pct) => {
                        if (progressBar)  progressBar.style.width  = `${(pct * 100).toFixed(1)}%`;
                        if (progressText) progressText.textContent = `#${count} [${_gs.idx + 1}/${total}] ${(pct * 100).toFixed(0)}%`;
                    },
                }
            );

            const seedEl = document.getElementById("wfm-gen-seed-value");
            if (seedEl) seedEl.value = seed;

            if (progressBar) progressBar.style.width = "100%";

            if (images.length > 0 && resultImg) {
                const blob = await comfyUI.getImageBlob(images[0]);
                resultImg.src = URL.createObjectURL(blob);
                resultImg.style.display = "block";
            }

            if (!_s.running) break;

            const control = document.getElementById("wfm-feeder-gal-control-after")?.value || "loop";
            const nextIdx = (_gs.idx + 1) % total;
            const isLast  = _gs.idx === total - 1;

            if (control === "fixed") {
                // idx を変えない
            } else if (control === "increment" && isLast) {
                _s.running = false;
                showToast(t("feederComplete", count), "success");
                break;
            } else {
                _gs.idx = nextIdx;
                if (indexEl) indexEl.value = _gs.idx;
                _highlightGalCard(_gs.images[_gs.idx]);
            }
        }
    } catch (err) {
        if (_s.running) showToast(t("feederRunError", err.message), "error");
    } finally {
        _s.running = false;
        _setGalRunUI(false);
        if (progressText) progressText.textContent = `Done (${count} generated)`;
    }
}

async function _stopGalRun() {
    _s.running = false;
    try { await comfyUI.interrupt(); } catch {}
    _setGalRunUI(false);
    showToast(t("feederStopped"), "info");
}

// ── Folder Tree (loop mode) ───────────────────────────────────────

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

// ── Image Grid (loop mode) ────────────────────────────────────────

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

function _updateStatus() {
    const el = document.getElementById("wfm-feeder-status");
    if (!el) return;
    const inCurrent = _s.images.filter(f => _s.selected.has(f)).length;
    el.textContent = `📂 ${_s.dir || "(root)"} | ${inCurrent} / ${_s.images.length} selected`;
}

// ── Gallery Mode: Group & Image Grid ─────────────────────────────

async function _loadGalGroups() {
    try {
        const res = await fetch("/wfm/gallery/groups");
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        _gs.groups = data.groups || [];
        _renderGalGroupSelect();
    } catch (err) {
        console.warn("[Feeder] loadGalGroups failed:", err);
    }
}

function _renderGalGroupSelect() {
    const sel = document.getElementById("wfm-feeder-gal-group");
    if (!sel) return;
    sel.innerHTML = _gs.groups
        .map(g => `<option value="${g.name}"${g.name === _gs.group ? " selected" : ""}>${g.name}</option>`)
        .join("");
    if (!_gs.groups.find(g => g.name === _gs.group) && _gs.groups.length > 0) {
        _gs.group = _gs.groups[0].name;
    }
}

function _setGalGroupSelect(group) {
    const sel = document.getElementById("wfm-feeder-gal-group");
    if (sel) sel.value = group;
}

async function _loadGalImages(group) {
    const grid = document.getElementById("wfm-feeder-gal-grid");
    const statusEl = document.getElementById("wfm-feeder-gal-status");
    if (!grid) return;
    grid.innerHTML = `<div class="wfm-feeder-grid-msg">Loading...</div>`;
    try {
        const res = await fetch(`/wfm/gallery/groups/${encodeURIComponent(group)}/images`);
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        _gs.images = data.images || [];
        _gs.idx    = 0;
        const idxEl = document.getElementById("wfm-feeder-gal-index");
        if (idxEl) idxEl.value = 0;
        _renderGalGrid();
        if (statusEl) statusEl.textContent = `${_gs.images.length} image(s) in "${group}"`;
    } catch (err) {
        _gs.images = [];
        grid.innerHTML = `<div class="wfm-feeder-grid-msg" style="color:var(--wfm-danger)">Load failed: ${err.message}</div>`;
        if (statusEl) statusEl.textContent = "";
    }
}

function _renderGalGrid() {
    const grid = document.getElementById("wfm-feeder-gal-grid");
    if (!grid) return;
    if (_gs.images.length === 0) {
        grid.innerHTML = `<div class="wfm-feeder-grid-msg">No images in this group</div>`;
        return;
    }
    grid.innerHTML = "";
    _gs.images.forEach((absPath, i) => grid.appendChild(_makeGalCard(absPath, i)));
}

function _makeGalCard(absPath, idx) {
    const fname = absPath.replace(/\\/g, "/").split("/").pop();
    const card = document.createElement("div");
    card.className = "wfm-feeder-card" + (idx === _gs.idx ? " selected" : "");
    card.dataset.path = absPath;
    card.dataset.idx  = idx;

    const img = document.createElement("img");
    img.className = "wfm-feeder-card-img";
    img.loading = "lazy";
    img.src = `/wfm/gallery/image/serve?path=${encodeURIComponent(absPath)}`;
    img.onerror = () => { img.style.display = "none"; card.style.minHeight = "110px"; };

    const name = document.createElement("div");
    name.className = "wfm-feeder-card-name";
    name.textContent = fname;
    name.title = fname;

    card.append(img, name);
    card.addEventListener("click", () => {
        _gs.idx = idx;
        const idxEl = document.getElementById("wfm-feeder-gal-index");
        if (idxEl) idxEl.value = idx;
        _highlightGalCard(absPath);
        _showGalPreview(absPath, fname);
    });
    return card;
}

function _highlightGalCard(absPath) {
    document.querySelectorAll("#wfm-feeder-gal-grid .wfm-feeder-card").forEach(c => {
        c.classList.toggle("selected", c.dataset.path === absPath);
    });
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

async function _showGalPreview(absPath, fname) {
    const imgEl  = document.getElementById("wfm-feeder-preview-img");
    const nameEl = document.getElementById("wfm-feeder-preview-name");
    const infoEl = document.getElementById("wfm-feeder-preview-info");

    if (imgEl) {
        imgEl.src = `/wfm/gallery/image/serve?path=${encodeURIComponent(absPath)}`;
        imgEl.style.display = "block";
    }
    if (nameEl) nameEl.textContent = fname;
    if (infoEl) infoEl.textContent = "";
}

// ── Presets (loop mode) ───────────────────────────────────────────

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
    if (!name) { showToast(t("enterPresetName"), "error"); return; }
    const sel = _s.images.filter(f => _s.selected.has(f));
    try {
        const res = await fetch("/image_feeder/presets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, directory: _s.dir, selected_files: sel }),
        });
        if (res.ok) {
            showToast(t("presetSavedName", name), "success");
            const nameInput = document.getElementById("wfm-feeder-preset-name");
            if (nameInput) nameInput.value = "";
            await _loadPresets();
            const selEl = document.getElementById("wfm-feeder-preset-sel");
            if (selEl) selEl.value = name;
        } else { showToast(t("saveFailed"), "error"); }
    } catch (err) { showToast(t("saveFailed", err.message), "error"); }
}

async function _applyPreset() {
    const selEl = document.getElementById("wfm-feeder-preset-sel");
    const name = selEl?.value;
    if (!name || !_s.presets[name]) { showToast(t("selectPresetFirst"), "error"); return; }
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
    showToast(t("presetLoaded", name), "success");
}

async function _deletePreset() {
    const name = document.getElementById("wfm-feeder-preset-sel")?.value;
    if (!name) return;
    try {
        await fetch(`/image_feeder/presets/${encodeURIComponent(name)}`, { method: "DELETE" });
        showToast(t("presetDeleted", name), "info");
        await _loadPresets();
    } catch (err) { showToast(t("deleteFailed"), "error"); }
}

// ── Mode Switch ───────────────────────────────────────────────────

function _setMode(mode) {
    _s.mode = mode;
    localStorage.setItem("wfm_feeder_mode", mode);

    const loopBtn = document.getElementById("wfm-feeder-mode-loop");
    const galBtn  = document.getElementById("wfm-feeder-mode-gallery");
    const loopSec = document.getElementById("wfm-feeder-loop-section");
    const galSec  = document.getElementById("wfm-feeder-gal-section");
    const loopLib = document.getElementById("wfm-feeder-loop-library");
    const galLib  = document.getElementById("wfm-feeder-gal-library");

    const isGallery = mode === "gallery";

    if (loopBtn) loopBtn.classList.toggle("wfm-btn-primary", !isGallery);
    if (galBtn)  galBtn.classList.toggle("wfm-btn-primary",  isGallery);
    if (loopSec) loopSec.style.display = isGallery ? "none" : "";
    if (galSec)  galSec.style.display  = isGallery ? "" : "none";
    if (loopLib) loopLib.style.display = isGallery ? "none" : "";
    if (galLib)  galLib.style.display  = isGallery ? "" : "none";

    if (isGallery) {
        _loadGalGroups().then(() => _loadGalImages(_gs.group));
        _refreshGalNodeList();
    }
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
    // Mode toggle
    document.getElementById("wfm-feeder-mode-loop")?.addEventListener("click", () => _setMode("loop"));
    document.getElementById("wfm-feeder-mode-gallery")?.addEventListener("click", () => _setMode("gallery"));

    // ── Image Loop mode events ──
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

    // ── Gallery mode events ──
    document.getElementById("wfm-feeder-gal-node-sel")?.addEventListener("change", e => {
        _loadFromGalNode(e.target.value);
    });

    document.getElementById("wfm-feeder-gal-apply-btn")?.addEventListener("click", _applyGalToWorkflow);

    document.getElementById("wfm-feeder-gal-group")?.addEventListener("change", e => {
        _gs.group = e.target.value;
        _gs.idx   = 0;
        _loadGalImages(_gs.group);
    });

    document.getElementById("wfm-feeder-gal-index")?.addEventListener("change", e => {
        _gs.idx = Math.max(0, parseInt(e.target.value) || 0);
        if (_gs.images[_gs.idx]) _highlightGalCard(_gs.images[_gs.idx]);
    });

    document.getElementById("wfm-feeder-gal-run-btn")?.addEventListener("click", _startGalRun);
    document.getElementById("wfm-feeder-gal-stop-btn")?.addEventListener("click", _stopGalRun);

    // 初期化
    await ensureFeederGroup();
    _setMode(_s.mode);

    if (_s.mode === "loop") {
        await Promise.all([_loadTree(), _loadPresets()]);
        _selectDir("");
    }
}

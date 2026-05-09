/**
 * GenerateUI Tab - Workflow execution with parameter editing
 */

import { showToast } from "./app.js";
import { comfyUI } from "./comfyui-client.js";
import { comfyWorkflow } from "./comfyui-workflow.js";
import { comfyEditor } from "./comfyui-editor.js";
import { t } from "./i18n.js";
import { syncJsonHighlight, syncScroll } from "./json-highlight.js";
import { initFeederTab, refreshFeederNodeList } from "./feeder-tab.js";

// ============================================
// Eagle Auto-Save
// ============================================

function getEagleSettings() {
    try {
        const s = JSON.parse(localStorage.getItem("wfm_settings") || "{}");
        return {
            url: s.eagleUrl || "http://localhost:41595",
            autoSave: !!s.eagleAutoSave,
        };
    } catch {
        return { url: "http://localhost:41595", autoSave: false };
    }
}

async function saveToEagle(imageUrl, name, tags = []) {
    const eagle = getEagleSettings();
    if (!eagle.autoSave) return;
    try {
        const res = await fetch("/api/wfm/eagle/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                eagleUrl: eagle.url,
                url: imageUrl,
                name,
                tags: ["wfm-comfyui", ...tags],
            }),
        });
        const data = await res.json();
        if (data.status === "success") {
            console.log("[Eagle] Saved:", name);
        } else {
            console.warn("[Eagle] Save failed:", data.message);
        }
    } catch (err) {
        console.warn("[Eagle] Save error:", err.message);
    }
}

// ============================================
// Gallery Metadata - ワークフロー保存
// ============================================

let _outputDir = "";

async function _fetchOutputDir() {
    try {
        const res = await fetch("/api/wfm/settings/output-dir");
        if (res.ok) {
            const data = await res.json();
            _outputDir = (data.current || "").replace(/\\/g, "/").replace(/\/$/, "");
        }
    } catch {}
}

async function saveGeneratedImagesMeta(images, workflow) {
    if (!_outputDir) await _fetchOutputDir();
    if (!_outputDir) return;

    for (const img of images) {
        if (img.type !== "output") continue;
        const parts = [_outputDir];
        if (img.subfolder) parts.push(img.subfolder);
        parts.push(img.filename);
        const path = parts.join("/");
        try {
            await fetch("/wfm/gallery/image/meta", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path, workflow }),
            });
        } catch {}
    }
}

// ============================================
// Status & Connection
// ============================================

function updateStatus(connected) {
    const label = document.getElementById("wfm-gen-status");
    if (!label) return;
    if (connected) {
        label.textContent = "Connected";
        label.className = "wfm-gen-status connected";
    } else {
        label.textContent = "Disconnected";
        label.className = "wfm-gen-status disconnected";
    }
}

// ============================================
// Workflow Loading
// ============================================

export async function loadWorkflowIntoEditor(workflow, filename) {
    let apiWorkflow = workflow;
    const format = comfyWorkflow.detectFormat(workflow, filename);

    if (format === "app") {
        showToast(t("appFormatNotSupported"), "error");
        return false;
    } else if (format === "ui") {
        apiWorkflow = await comfyWorkflow.convertUiToApi(workflow);
    } else if (format === "unknown") {
        showToast("Unknown workflow format", "error");
        return false;
    }

    comfyUI.currentWorkflow = apiWorkflow;
    comfyUI.currentAnalysis = comfyWorkflow.analyzeWorkflow(apiWorkflow);

    // Render editor tabs
    comfyEditor.renderAll(comfyUI.currentAnalysis, apiWorkflow);

    // Update raw JSON with highlight
    const rawTextarea = document.getElementById("wfm-gen-raw-json");
    const rawHighlight = document.getElementById("wfm-gen-raw-json-highlight");
    if (rawTextarea) {
        const jsonStr = JSON.stringify(apiWorkflow, null, 2);
        rawTextarea.value = jsonStr;
        syncJsonHighlight(rawHighlight, jsonStr);
    }

    // Update workflow name display
    const nameEl = document.getElementById("wfm-gen-wf-name");
    if (nameEl) {
        nameEl.textContent = filename || "Loaded Workflow";
    }

    // Enable generate button
    const genBtn = document.getElementById("wfm-gen-generate-btn");
    if (genBtn) genBtn.disabled = !comfyUI.connected;

    refreshFeederNodeList();

    showToast(`Workflow loaded: ${filename || ""}`, "success");
    return true;
}

// ============================================
// Checkpoint Batch
// ============================================

const _ckptBatch = { aborted: false, paused: false, _resumeResolve: null };

async function _waitIfPaused() {
    if (!_ckptBatch.paused) return;
    await new Promise((resolve) => { _ckptBatch._resumeResolve = resolve; });
}

function _setPauseBtnState(paused) {
    const btn = document.getElementById("wfm-ckpt-batch-pause-btn");
    if (!btn) return;
    btn.textContent = paused ? "Resume" : "Pause";
    btn.style.background = paused ? "var(--wfm-success, #22c55e)" : "";
    btn.style.color = paused ? "#fff" : "";
}

// mode: "all" = 全選択, "some" = 一部選択, "none" = 全解除
const _ckptState = { mode: "all", selected: new Set() };

function _getSelectedCheckpoints() {
    const all = comfyEditor.models.checkpoints || [];
    if (_ckptState.mode === "all") return all;
    if (_ckptState.mode === "none") return [];
    return all.filter((m) => _ckptState.selected.has(m));
}

function _updateDropdownLabel() {
    const labelEl = document.getElementById("wfm-ckpt-dropdown-label");
    if (!labelEl) return;
    const total = (comfyEditor.models.checkpoints || []).length;
    if (_ckptState.mode === "all") {
        labelEl.textContent = total > 0 ? `All (${total})` : "All checkpoints";
    } else if (_ckptState.mode === "none") {
        labelEl.textContent = `0 / ${total} selected`;
    } else {
        labelEl.textContent = `${_ckptState.selected.size} / ${total} selected`;
    }
}

// モデルパスリストをフォルダ → [modelPath, ...] のMapに変換
function _buildFolderTree(models) {
    const map = new Map();
    for (const m of models) {
        const normalized = m.replace(/\\/g, "/");
        const lastSlash = normalized.lastIndexOf("/");
        const folder = lastSlash === -1 ? "" : normalized.substring(0, lastSlash);
        if (!map.has(folder)) map.set(folder, []);
        map.get(folder).push(m);
    }
    return new Map([...map.entries()].sort((a, b) => {
        if (a[0] === b[0]) return 0;
        if (a[0] === "") return -1;
        if (b[0] === "") return 1;
        return a[0].localeCompare(b[0]);
    }));
}

// フォルダ内の選択状態を返す: "checked" | "indeterminate" | "unchecked"
function _getFolderCheckState(folderModels) {
    if (_ckptState.mode === "all") return "checked";
    if (_ckptState.mode === "none") return "unchecked";
    const selCount = folderModels.filter((m) => _ckptState.selected.has(m)).length;
    if (selCount === 0) return "unchecked";
    if (selCount === folderModels.length) return "checked";
    return "indeterminate";
}

// 単一モデルの選択トグル（_ckptState を更新）
function _toggleSingleModel(m, checked, all) {
    if (_ckptState.mode === "all" && !checked) {
        _ckptState.mode = "some";
        _ckptState.selected.clear();
        all.forEach((x) => _ckptState.selected.add(x));
    } else if (_ckptState.mode === "none" && checked) {
        _ckptState.mode = "some";
        _ckptState.selected.clear();
    }
    if (checked) _ckptState.selected.add(m);
    else _ckptState.selected.delete(m);
    if (_ckptState.selected.size === all.length) { _ckptState.mode = "all"; _ckptState.selected.clear(); }
    if (_ckptState.mode === "some" && _ckptState.selected.size === 0) _ckptState.mode = "none";
}

// フォルダ単位の一括トグル（_ckptState を更新）
function _toggleFolderModels(folderModels, checked, all) {
    if (_ckptState.mode === "all" && !checked) {
        _ckptState.mode = "some";
        _ckptState.selected.clear();
        all.forEach((x) => _ckptState.selected.add(x));
    } else if (_ckptState.mode === "none" && checked) {
        _ckptState.mode = "some";
        _ckptState.selected.clear();
    }
    folderModels.forEach((m) => { if (checked) _ckptState.selected.add(m); else _ckptState.selected.delete(m); });
    if (_ckptState.selected.size === all.length) { _ckptState.mode = "all"; _ckptState.selected.clear(); }
    if (_ckptState.mode === "some" && _ckptState.selected.size === 0) _ckptState.mode = "none";
}

function _rebuildCkptList() {
    const listEl = document.getElementById("wfm-ckpt-list");
    if (!listEl) return;
    const all = comfyEditor.models.checkpoints || [];
    const search = document.getElementById("wfm-ckpt-search")?.value.toLowerCase() || "";
    const filtered = search ? all.filter((m) => m.toLowerCase().includes(search)) : all;

    if (filtered.length === 0) {
        listEl.innerHTML = `<div style="padding:8px 10px;font-size:11px;color:var(--wfm-text-secondary);">No checkpoints</div>`;
        return;
    }

    const folderTree = _buildFolderTree(filtered);
    listEl.innerHTML = "";

    for (const [folder, models] of folderTree) {
        const group = document.createElement("div");
        group.className = "wfm-ckpt-folder-group open";

        // --- フォルダヘッダー ---
        const header = document.createElement("div");
        header.className = "wfm-ckpt-folder-header";

        const folderCb = document.createElement("input");
        folderCb.type = "checkbox";
        const folderState = _getFolderCheckState(models);
        folderCb.checked = folderState === "checked";
        folderCb.indeterminate = folderState === "indeterminate";

        const toggle = document.createElement("span");
        toggle.className = "wfm-ckpt-folder-toggle";
        toggle.textContent = "▶";

        const nameSpan = document.createElement("span");
        nameSpan.className = "wfm-ckpt-folder-name";
        nameSpan.textContent = folder || "(root)";
        nameSpan.title = folder || "(root)";

        const countSpan = document.createElement("span");
        countSpan.className = "wfm-ckpt-folder-count";
        countSpan.textContent = models.length;

        // --- ファイルリスト ---
        const filesDiv = document.createElement("div");
        filesDiv.className = "wfm-ckpt-folder-files";

        for (const m of models) {
            const itemLabel = document.createElement("label");
            itemLabel.className = "wfm-ckpt-item wfm-ckpt-item--indented";

            const fileCb = document.createElement("input");
            fileCb.type = "checkbox";
            fileCb.value = m;
            if (_ckptState.mode === "all") fileCb.checked = true;
            else if (_ckptState.mode === "none") fileCb.checked = false;
            else fileCb.checked = _ckptState.selected.has(m);

            const normalized = m.replace(/\\/g, "/");
            const lastSlash = normalized.lastIndexOf("/");
            const fileName = lastSlash === -1 ? m : m.substring(lastSlash + 1);
            const fileSpan = document.createElement("span");
            fileSpan.className = "wfm-ckpt-item-label";
            fileSpan.textContent = fileName;
            fileSpan.title = m;

            fileCb.addEventListener("change", () => {
                _toggleSingleModel(m, fileCb.checked, all);
                const s = _getFolderCheckState(models);
                folderCb.checked = s === "checked";
                folderCb.indeterminate = s === "indeterminate";
                _updateDropdownLabel();
                _updateBatchInfo();
            });

            itemLabel.appendChild(fileCb);
            itemLabel.appendChild(fileSpan);
            filesDiv.appendChild(itemLabel);
        }

        // フォルダCBのchange
        folderCb.addEventListener("change", () => {
            _toggleFolderModels(models, folderCb.checked, all);
            folderCb.indeterminate = false;
            filesDiv.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = folderCb.checked; });
            _updateDropdownLabel();
            _updateBatchInfo();
        });

        // フォルダ名 / トグル矢印クリックで展開・折りたたみ
        [toggle, nameSpan].forEach((el) => {
            el.addEventListener("click", () => group.classList.toggle("open"));
        });

        header.appendChild(folderCb);
        header.appendChild(toggle);
        header.appendChild(nameSpan);
        header.appendChild(countSpan);
        group.appendChild(header);
        group.appendChild(filesDiv);
        listEl.appendChild(group);
    }
}

function _updateBatchInfo() {
    const infoEl = document.getElementById("wfm-ckpt-batch-info");
    if (!infoEl) return;
    const n = _getSelectedCheckpoints().length;
    infoEl.textContent = `${n} checkpoint${n !== 1 ? "s" : ""} will be processed`;
}

function initCheckpointBatch() {
    const checkbox = document.getElementById("wfm-ckpt-batch-enabled");
    const body = document.getElementById("wfm-ckpt-batch-body");
    const wrap = document.getElementById("wfm-ckpt-dropdown-wrap");
    const btn = document.getElementById("wfm-ckpt-dropdown-btn");
    const panel = document.getElementById("wfm-ckpt-dropdown-panel");

    checkbox?.addEventListener("change", () => {
        if (body) body.style.display = checkbox.checked ? "block" : "none";
        if (checkbox.checked) {
            _updateDropdownLabel();
            _updateBatchInfo();
        }
    });

    // ドロップダウン開閉
    btn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = panel.style.display !== "none";
        if (isOpen) {
            panel.style.display = "none";
            wrap.classList.remove("open");
        } else {
            _rebuildCkptList();
            panel.style.display = "block";
            wrap.classList.add("open");
            document.getElementById("wfm-ckpt-search")?.focus();
        }
    });

    // 外側クリックで閉じる
    document.addEventListener("click", (e) => {
        if (panel && panel.style.display !== "none" && !wrap?.contains(e.target)) {
            panel.style.display = "none";
            wrap?.classList.remove("open");
        }
    });

    // 検索フィルター
    document.getElementById("wfm-ckpt-search")?.addEventListener("input", _rebuildCkptList);

    // 全選択
    document.getElementById("wfm-ckpt-select-all")?.addEventListener("click", () => {
        _ckptState.mode = "all";
        _ckptState.selected.clear();
        _rebuildCkptList();
        _updateDropdownLabel();
        _updateBatchInfo();
    });

    // 全解除
    document.getElementById("wfm-ckpt-deselect-all")?.addEventListener("click", () => {
        _ckptState.mode = "none";
        _ckptState.selected.clear();
        _rebuildCkptList();
        _updateDropdownLabel();
        _updateBatchInfo();
    });

    // Pause / Resume
    document.getElementById("wfm-ckpt-batch-pause-btn")?.addEventListener("click", () => {
        if (!_ckptBatch.paused) {
            _ckptBatch.paused = true;
            _setPauseBtnState(true);
        } else {
            _ckptBatch.paused = false;
            _setPauseBtnState(false);
            if (_ckptBatch._resumeResolve) {
                _ckptBatch._resumeResolve();
                _ckptBatch._resumeResolve = null;
            }
        }
    });
}

// ============================================
// Generation (core — throws on error)
// ============================================

async function _coreGenerate(silent = false) {
    const progressBar = document.getElementById("wfm-gen-progress-bar");
    const progressText = document.getElementById("wfm-gen-progress-text");
    const resultImg = document.getElementById("wfm-gen-result-img");
    const resultThumbs = document.getElementById("wfm-gen-result-thumbs");

    const seedMode = document.getElementById("wfm-gen-seed-mode")?.value || "random";
    const seedValue = parseInt(document.getElementById("wfm-gen-seed-value")?.value) || -1;

    if (progressBar) progressBar.style.width = "0%";
    if (progressText) progressText.textContent = "Starting...";

    const { images, seed } = await comfyUI.generate(
        { ...comfyUI.currentWorkflow },
        {
            seedMode,
            seedValue,
            onProgress: (pct) => {
                if (progressBar) progressBar.style.width = `${(pct * 100).toFixed(1)}%`;
                if (progressText) progressText.textContent = `${(pct * 100).toFixed(0)}%`;
            },
        }
    );

    const seedEl = document.getElementById("wfm-gen-seed-value");
    if (seedEl) seedEl.value = seed;

    if (progressText) progressText.textContent = `Done (${images.length} image${images.length !== 1 ? "s" : ""})`;
    if (progressBar) progressBar.style.width = "100%";

    if (images.length > 0) {
        const blob = await comfyUI.getImageBlob(images[0]);
        const url = URL.createObjectURL(blob);
        if (resultImg) {
            resultImg.src = url;
            resultImg.style.display = "block";
        }

        if (resultThumbs && images.length > 1) {
            resultThumbs.innerHTML = "";
            for (let i = 0; i < images.length; i++) {
                const b = i === 0 ? blob : await comfyUI.getImageBlob(images[i]);
                const u = i === 0 ? url : URL.createObjectURL(b);
                const thumb = document.createElement("img");
                thumb.src = u;
                thumb.className = `wfm-gen-thumb ${i === 0 ? "active" : ""}`;
                thumb.addEventListener("click", () => {
                    resultImg.src = u;
                    resultThumbs.querySelectorAll(".wfm-gen-thumb").forEach((t) => t.classList.remove("active"));
                    thumb.classList.add("active");
                });
                resultThumbs.appendChild(thumb);
            }
        }
    }

    if (getEagleSettings().autoSave && images.length > 0) {
        for (const img of images) {
            const viewUrl = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${encodeURIComponent(img.type || "output")}`;
            saveToEagle(viewUrl, img.filename);
        }
    }

    if (images.length > 0) {
        saveGeneratedImagesMeta(images, { ...comfyUI.currentWorkflow }).catch(() => {});
    }

    if (!silent) showToast("Generation complete", "success");
}

// ============================================
// Batch generation loop
// ============================================

async function _runBatchGenerate() {
    const ckptNodes = comfyUI.currentAnalysis?.checkpoint_nodes || [];
    if (ckptNodes.length === 0) {
        showToast("No checkpoint node found in workflow", "error");
        return;
    }

    const list = _getSelectedCheckpoints();

    if (list.length === 0) {
        showToast("No checkpoints selected", "error");
        return;
    }

    const batchProgress = document.getElementById("wfm-ckpt-batch-progress");
    const batchCurrentName = document.getElementById("wfm-ckpt-batch-current-name");
    const batchCount = document.getElementById("wfm-ckpt-batch-count");
    const batchBar = document.getElementById("wfm-ckpt-batch-bar");
    const progressText = document.getElementById("wfm-gen-progress-text");

    if (batchProgress) batchProgress.style.display = "block";
    const pauseBtn = document.getElementById("wfm-ckpt-batch-pause-btn");
    if (pauseBtn) { pauseBtn.style.display = "block"; pauseBtn.disabled = false; }
    _setPauseBtnState(false);

    let completed = 0;
    let failed = 0;

    try {
        for (let i = 0; i < list.length; i++) {
            if (_ckptBatch.aborted) break;

            // 一時停止中は次のモデルへ進む前に待機
            if (_ckptBatch.paused) {
                if (batchCurrentName) batchCurrentName.textContent = "Paused...";
                if (progressText) progressText.textContent = "Paused";
            }
            await _waitIfPaused();
            if (_ckptBatch.aborted) break;

            const model = list[i];
            if (batchCurrentName) batchCurrentName.textContent = model;
            if (batchCount) batchCount.textContent = `${i + 1} / ${list.length}`;
            if (batchBar) batchBar.style.width = `${((i / list.length) * 100).toFixed(1)}%`;
            if (progressText) progressText.textContent = `[${i + 1}/${list.length}] Loading...`;

            for (const node of ckptNodes) {
                if (comfyUI.currentWorkflow?.[node.id]) {
                    comfyUI.currentWorkflow[node.id].inputs.ckpt_name = model;
                }
            }

            try {
                await _coreGenerate(true);
                completed++;
            } catch (err) {
                if (_ckptBatch.aborted) break;
                failed++;
                showToast(`[${i + 1}/${list.length}] Failed: ${err.message}`, "error");
            }
        }
    } finally {
        if (pauseBtn) pauseBtn.disabled = true;
        _ckptBatch.paused = false;
        if (_ckptBatch._resumeResolve) {
            _ckptBatch._resumeResolve();
            _ckptBatch._resumeResolve = null;
        }
        _setPauseBtnState(false);
    }

    if (batchBar) batchBar.style.width = "100%";
    if (batchCurrentName) batchCurrentName.textContent = _ckptBatch.aborted ? "Stopped" : "Done";

    if (_ckptBatch.aborted) {
        showToast(`Batch stopped — ${completed} completed, ${failed} failed`, "info");
    } else {
        showToast(
            `Batch complete: ${completed}/${list.length}${failed > 0 ? ` (${failed} failed)` : ""}`,
            failed > 0 ? "error" : "success"
        );
    }
}

// ============================================
// Generate entry point
// ============================================

async function handleGenerate() {
    if (!comfyUI.currentWorkflow) {
        showToast("No workflow loaded", "error");
        return;
    }
    if (comfyUI.generating) return;

    comfyEditor.syncToWorkflow();

    const genBtn = document.getElementById("wfm-gen-generate-btn");
    const interruptBtn = document.getElementById("wfm-gen-interrupt-btn");

    genBtn.disabled = true;
    if (interruptBtn) interruptBtn.style.display = "inline-block";
    _ckptBatch.aborted = false;
    _ckptBatch.paused = false;
    _ckptBatch._resumeResolve = null;

    const batchEnabled = document.getElementById("wfm-ckpt-batch-enabled")?.checked;

    try {
        if (batchEnabled) {
            await _runBatchGenerate();
        } else {
            try {
                await _coreGenerate(false);
            } catch (err) {
                const progressText = document.getElementById("wfm-gen-progress-text");
                if (progressText) progressText.textContent = "Error";
                showToast("Generation error: " + err.message, "error");
            }
        }
    } finally {
        genBtn.disabled = false;
        if (interruptBtn) interruptBtn.style.display = "none";
    }
}

// ============================================
// Initialization
// ============================================

export async function initGenerateTab() {
    // Default to same origin
    comfyUI.updateUrl(window.location.origin);

    // Connect button
    document.getElementById("wfm-gen-connect-btn")?.addEventListener("click", async () => {
        const connected = await comfyUI.checkConnection();
        updateStatus(connected);
        if (connected) {
            await comfyEditor.loadModelLists();
            showToast("Connected to ComfyUI", "success");
        } else {
            showToast("Failed to connect", "error");
        }
    });

    // Model refresh
    document.getElementById("wfm-gen-model-refresh-btn")?.addEventListener("click", async () => {
        await comfyEditor.loadModelLists();
        if (comfyUI.currentAnalysis) {
            comfyEditor.renderAll(comfyUI.currentAnalysis, comfyUI.currentWorkflow);
        }
        showToast("Model lists refreshed", "success");
        _updateDropdownLabel();
        _updateBatchInfo();
    });

    // Generate button
    document.getElementById("wfm-gen-generate-btn")?.addEventListener("click", handleGenerate);

    // Interrupt button (stops both single generation and batch loop)
    document.getElementById("wfm-gen-interrupt-btn")?.addEventListener("click", async () => {
        _ckptBatch.aborted = true;
        // 一時停止中でもループを抜けられるよう待機を解除
        _ckptBatch.paused = false;
        if (_ckptBatch._resumeResolve) {
            _ckptBatch._resumeResolve();
            _ckptBatch._resumeResolve = null;
        }
        await comfyUI.interrupt();
        showToast("Interrupted", "info");
    });

    // Move shared Raw JSON widget into the active tab's rawjson-col
    function moveRawJsonToTab(tabKey) {
        const widget = document.getElementById("wfm-gen-rawjson-widget");
        if (!widget) return;
        if (tabKey === "feeder") {
            widget.style.display = "none";
            return;
        }
        const col = document.getElementById(`wfm-gen-rawjson-col-${tabKey}`);
        if (col) {
            col.appendChild(widget);
            widget.style.display = "flex";
        }
    }

    // Subtab navigation
    document.querySelectorAll(".wfm-gen-subtab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.subtab;
            document.querySelectorAll(".wfm-gen-subtab-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".wfm-gen-subtab-content").forEach((c) => c.classList.remove("active"));
            document.getElementById(`wfm-gen-subtab-${target}`)?.classList.add("active");
            moveRawJsonToTab(target);
        });
    });

    // Initial placement: move to first active tab (input)
    moveRawJsonToTab("input");

    // Raw JSON apply (always-visible panel in right column)
    document.getElementById("wfm-gen-apply-raw-btn")?.addEventListener("click", async () => {
        const textarea = document.getElementById("wfm-gen-raw-json");
        if (!textarea) return;
        try {
            const wf = JSON.parse(textarea.value);
            await loadWorkflowIntoEditor(wf, "Raw JSON");
        } catch (err) {
            showToast("Invalid JSON: " + err.message, "error");
        }
    });

    // Raw JSON highlight sync on input/scroll
    {
        const editor = document.getElementById("wfm-gen-raw-json");
        const highlight = document.getElementById("wfm-gen-raw-json-highlight");
        if (editor && highlight) {
            editor.addEventListener("input", () => syncJsonHighlight(highlight, editor.value));
            editor.addEventListener("scroll", () => syncScroll(editor, highlight));
        }
    }

    // Check for workflow loaded from Workflow tab (via sessionStorage)
    const stored = sessionStorage.getItem("wfm_loaded_workflow");
    if (stored) {
        sessionStorage.removeItem("wfm_loaded_workflow");
        try {
            const { filename, data } = JSON.parse(stored);
            await loadWorkflowIntoEditor(data, filename);
        } catch {}
    }

    // outputDir を事前取得（生成後の保存に使用）
    _fetchOutputDir();
    window.addEventListener("wfm-output-dir-changed", (e) => {
        _outputDir = (e.detail?.path || "").replace(/\\/g, "/").replace(/\/$/, "");
    });

    // Checkpoint batch UI
    initCheckpointBatch();

    // Feeder tab
    await initFeederTab();

    // Auto-connect on init
    const connected = await comfyUI.checkConnection();
    updateStatus(connected);
    if (connected) {
        await comfyEditor.loadModelLists();
        _updateDropdownLabel();
        _updateBatchInfo();
    }

    // Auto-load default workflow (doesn't require ComfyUI connection)
    if (!comfyUI.currentWorkflow) {
        try {
            const settings = JSON.parse(localStorage.getItem("wfm_settings") || "{}");
            if (settings.defaultWorkflow && settings.defaultWorkflowData) {
                await loadWorkflowIntoEditor(settings.defaultWorkflowData, settings.defaultWorkflow);
                console.log("Workflow Studio: Auto-loaded default workflow:", settings.defaultWorkflow);
            }
        } catch {}
    }
}

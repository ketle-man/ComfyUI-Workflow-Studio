/**
 * GenerateUI Tab - Workflow execution with parameter editing
 */

import { showToast } from "./app.js";
import { comfyUI } from "./comfyui-client.js";
import { comfyWorkflow } from "./comfyui-workflow.js";
import { comfyEditor } from "./comfyui-editor.js";
import { t } from "./i18n.js";
import { syncJsonHighlight, syncScroll } from "./json-highlight.js";

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

    showToast(`Workflow loaded: ${filename || ""}`, "success");
    return true;
}

// ============================================
// Checkpoint Batch
// ============================================

const _ckptBatch = { aborted: false };

function _parseFolderList(str) {
    return str.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function _getModelFolder(modelPath) {
    const normalized = modelPath.replace(/\\/g, "/");
    const idx = normalized.indexOf("/");
    return idx === -1 ? "" : normalized.substring(0, idx).toLowerCase();
}

function _filterCheckpoints(checkpoints, includeStr, excludeStr) {
    const inc = _parseFolderList(includeStr);
    const exc = _parseFolderList(excludeStr);
    return checkpoints.filter((m) => {
        const folder = _getModelFolder(m);
        if (inc.length > 0 && !inc.includes(folder)) return false;
        if (exc.length > 0 && exc.includes(folder)) return false;
        return true;
    });
}

function _updateBatchInfo() {
    const infoEl = document.getElementById("wfm-ckpt-batch-info");
    if (!infoEl) return;
    const inc = document.getElementById("wfm-ckpt-batch-include")?.value || "";
    const exc = document.getElementById("wfm-ckpt-batch-exclude")?.value || "";
    const n = _filterCheckpoints(comfyEditor.models.checkpoints, inc, exc).length;
    infoEl.textContent = `${n} checkpoint${n !== 1 ? "s" : ""} will be processed`;
}

function initCheckpointBatch() {
    const checkbox = document.getElementById("wfm-ckpt-batch-enabled");
    const body = document.getElementById("wfm-ckpt-batch-body");

    checkbox?.addEventListener("change", () => {
        if (body) body.style.display = checkbox.checked ? "block" : "none";
        if (checkbox.checked) _updateBatchInfo();
    });

    document.getElementById("wfm-ckpt-batch-include")?.addEventListener("input", _updateBatchInfo);
    document.getElementById("wfm-ckpt-batch-exclude")?.addEventListener("input", _updateBatchInfo);
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

    const inc = document.getElementById("wfm-ckpt-batch-include")?.value || "";
    const exc = document.getElementById("wfm-ckpt-batch-exclude")?.value || "";
    const list = _filterCheckpoints(comfyEditor.models.checkpoints, inc, exc);

    if (list.length === 0) {
        showToast("No checkpoints match the folder filter", "error");
        return;
    }

    const batchProgress = document.getElementById("wfm-ckpt-batch-progress");
    const batchCurrentName = document.getElementById("wfm-ckpt-batch-current-name");
    const batchCount = document.getElementById("wfm-ckpt-batch-count");
    const batchBar = document.getElementById("wfm-ckpt-batch-bar");
    const progressText = document.getElementById("wfm-gen-progress-text");

    if (batchProgress) batchProgress.style.display = "block";

    let completed = 0;
    let failed = 0;

    for (let i = 0; i < list.length; i++) {
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
        _updateBatchInfo();
    });

    // Generate button
    document.getElementById("wfm-gen-generate-btn")?.addEventListener("click", handleGenerate);

    // Interrupt button (stops both single generation and batch loop)
    document.getElementById("wfm-gen-interrupt-btn")?.addEventListener("click", async () => {
        _ckptBatch.aborted = true;
        await comfyUI.interrupt();
        showToast("Interrupted", "info");
    });

    // Move shared Raw JSON widget into the active tab's rawjson-col
    function moveRawJsonToTab(tabKey) {
        const widget = document.getElementById("wfm-gen-rawjson-widget");
        const col = document.getElementById(`wfm-gen-rawjson-col-${tabKey}`);
        if (widget && col) {
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

    // Auto-connect on init
    const connected = await comfyUI.checkConnection();
    updateStatus(connected);
    if (connected) {
        await comfyEditor.loadModelLists();
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

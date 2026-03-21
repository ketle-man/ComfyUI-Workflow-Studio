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
        return;
    } else if (format === "ui") {
        apiWorkflow = await comfyWorkflow.convertUiToApi(workflow);
    } else if (format === "unknown") {
        showToast("Unknown workflow format", "error");
        return;
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
}

// ============================================
// Generation
// ============================================

async function handleGenerate() {
    if (!comfyUI.currentWorkflow) {
        showToast("No workflow loaded", "error");
        return;
    }
    if (comfyUI.generating) return;

    const genBtn = document.getElementById("wfm-gen-generate-btn");
    const progressBar = document.getElementById("wfm-gen-progress-bar");
    const progressText = document.getElementById("wfm-gen-progress-text");
    const interruptBtn = document.getElementById("wfm-gen-interrupt-btn");
    const resultImg = document.getElementById("wfm-gen-result-img");
    const resultThumbs = document.getElementById("wfm-gen-result-thumbs");

    // Sync prompts to workflow
    comfyEditor.syncToWorkflow();

    const seedMode = document.getElementById("wfm-gen-seed-mode")?.value || "random";
    const seedValue = parseInt(document.getElementById("wfm-gen-seed-value")?.value) || -1;

    genBtn.disabled = true;
    if (interruptBtn) interruptBtn.style.display = "inline-block";
    if (progressBar) progressBar.style.width = "0%";
    if (progressText) progressText.textContent = "Starting...";

    try {
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

        // Update seed display
        const seedEl = document.getElementById("wfm-gen-seed-value");
        if (seedEl) seedEl.value = seed;

        if (progressText) progressText.textContent = `Done (${images.length} image${images.length !== 1 ? "s" : ""})`;
        if (progressBar) progressBar.style.width = "100%";

        // Display results
        if (images.length > 0) {
            const blob = await comfyUI.getImageBlob(images[0]);
            const url = URL.createObjectURL(blob);
            if (resultImg) {
                resultImg.src = url;
                resultImg.style.display = "block";
            }

            // Thumbnails for multiple images
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

        // Eagle auto-save
        if (getEagleSettings().autoSave && images.length > 0) {
            for (const img of images) {
                const viewUrl = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${encodeURIComponent(img.type || "output")}`;
                saveToEagle(viewUrl, img.filename);
            }
        }

        showToast("Generation complete", "success");
    } catch (err) {
        if (progressText) progressText.textContent = "Error";
        showToast("Generation error: " + err.message, "error");
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
    });

    // Generate button
    document.getElementById("wfm-gen-generate-btn")?.addEventListener("click", handleGenerate);

    // Interrupt button
    document.getElementById("wfm-gen-interrupt-btn")?.addEventListener("click", async () => {
        await comfyUI.interrupt();
        showToast("Interrupted", "info");
    });

    // Subtab navigation
    document.querySelectorAll(".wfm-gen-subtab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.subtab;
            document.querySelectorAll(".wfm-gen-subtab-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".wfm-gen-subtab-content").forEach((c) => c.classList.remove("active"));
            document.getElementById(`wfm-gen-subtab-${target}`)?.classList.add("active");
        });
    });

    // Raw JSON apply
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

    // Auto-connect on init
    const connected = await comfyUI.checkConnection();
    updateStatus(connected);
    if (connected) {
        await comfyEditor.loadModelLists();
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

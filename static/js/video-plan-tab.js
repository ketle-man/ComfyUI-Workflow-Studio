/**
 * Video Tab - Plan subtab: batch video generation from a timeline of blocks.
 *
 * A Plan is a sequence of blocks, each a fully self-contained generation job
 * (own prompt / duration / optional first & last frame images). Running a Plan
 * executes its blocks in order against whatever workflow is currently loaded
 * (see loadWorkflowIntoVideoEditor), the same way the old single-shot form
 * generated one video — a Plan with a single block IS that old form.
 *
 * Unlike Lab's independent-per-parameter keyframe columns, a block bundles all
 * of its values together since each one is an independent, complete clip.
 * Chaining (using the previous block's last frame as this block's first frame)
 * is a per-block choice (first_image_mode), not a Plan-wide toggle — an
 * explicitly-set previous last_image_filename always wins over frame
 * extraction from that block's generated output (see _resolveFirstImage).
 */

import { comfyUI } from "./comfyui-client.js";
import { comfyWorkflow } from "./comfyui-workflow.js";
import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { escapeHtml, embedPngTextChunk } from "./util.js";
import { readAllPNGTextChunks } from "./metadata-tab.js";
import { isVideoFilename, extractLastFrameBlob } from "./video-utils.js";
import { locateVideoModelNodes, readTemplateDefaults, applyBlockToWorkflow } from "./video-workflow.js";
import { VTEMP_GROUP } from "./gallery-tab.js";
import { setResultPreview } from "./video-preview.js";

const VIDEO_BLOCK_COLORS = ["#4caf7d", "#3b4b8a", "#8e5cd9", "#e0c341", "#4ac0d9", "#9ad14b", "#e08a3c", "#d9527a"];
const VIDEO_PLAN_PREFIX = "ws_videoplan_";
const VIDEO_PLAN_PNG_KEY = "wfm_video_plan";
const MAX_INDEX_THUMBS = 9;

function _emptyBlock(colorIdx) {
    return {
        id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        color: VIDEO_BLOCK_COLORS[colorIdx % VIDEO_BLOCK_COLORS.length],
        duration: 2,
        prompt: "",
        first_image_mode: "none", // "none" | "explicit" | "chain_previous"
        first_image_filename: null,
        last_image_filename: null,
    };
}

function _emptyPlanState() {
    return {
        planFilename: null,
        note: "",
        workflowFilename: null,
        base_settings: { aspect_ratio: "", megapixels: 0.2, multiple: 32 },
        seed_mode: "random",
        seed_value: 0,
        blocks: [_emptyBlock(0)],
        results: { blocks: [] },
    };
}

let _plan = _emptyPlanState();
let _selectedBlockId = _plan.blocks[0].id;
let _paused = false;
let _aborted = false;
let _resumeResolve = null;

// The workflow currently loaded for this Plan to run against — a UI-format
// workflow JSON, never mutated directly (each iteration works on its own
// structuredClone, same discipline as Lab's _buildWorkflowForIteration).
let _templateWorkflow = null;
let _templateFilename = null;

let _outputDir = "";

// ============================================
// Timeline
// ============================================

function _renderTimeline() {
    const track = document.getElementById("wfm-video-timeline-track");
    if (!track) return;
    track.innerHTML = "";
    for (const block of _plan.blocks) {
        const el = document.createElement("div");
        el.className = "wfm-video-timeline-block" + (block.id === _selectedBlockId ? " selected" : "");
        el.style.flexGrow = String(Math.max(block.duration, 0.1));
        el.style.backgroundColor = block.color;
        el.title = `${block.duration}s`;
        el.dataset.blockId = block.id;
        el.addEventListener("click", () => _selectBlock(block.id));
        track.appendChild(el);
    }
}

function _selectBlock(id) {
    _selectedBlockId = id;
    _renderTimeline();
    _renderBlockEditor();
}

function _splitSelectedBlock() {
    const idx = _plan.blocks.findIndex((b) => b.id === _selectedBlockId);
    if (idx === -1) return;
    const block = _plan.blocks[idx];
    const half = Math.max(block.duration / 2, 0.5);
    block.duration = half;
    const newBlock = _emptyBlock(_plan.blocks.length);
    newBlock.duration = half;
    _plan.blocks.splice(idx + 1, 0, newBlock);
    _selectedBlockId = newBlock.id;
    _renderTimeline();
    _renderBlockEditor();
}

function _addBlock() {
    const newBlock = _emptyBlock(_plan.blocks.length);
    _plan.blocks.push(newBlock);
    _selectedBlockId = newBlock.id;
    _renderTimeline();
    _renderBlockEditor();
}

function _deleteSelectedBlock() {
    if (_plan.blocks.length <= 1) {
        showToast(t("videoPlanMinOneBlock"), "error");
        return;
    }
    const idx = _plan.blocks.findIndex((b) => b.id === _selectedBlockId);
    if (idx === -1) return;
    _plan.blocks.splice(idx, 1);
    _selectedBlockId = _plan.blocks[Math.max(0, idx - 1)].id;
    _renderTimeline();
    _renderBlockEditor();
}

function _initTimelineControls() {
    document.getElementById("wfm-video-block-split-btn")?.addEventListener("click", _splitSelectedBlock);
    document.getElementById("wfm-video-block-add-btn")?.addEventListener("click", _addBlock);
    document.getElementById("wfm-video-block-delete-btn")?.addEventListener("click", _deleteSelectedBlock);
}

// ============================================
// Block editor (First/Last image, Prompt, Duration, color)
// ============================================

// Mirrors the "field matches the loaded workflow" highlight GenerateUI's Model tab
// uses (wfm-model-label-active, color customizable in Settings) — carried over from
// the pre-Plan/Asset/Edit single-shot form, where it lived directly in video-tab.js.
// First/Last Image/Prompt/Duration labels get re-created every block switch
// (_renderBlockEditor rebuilds the whole editor's innerHTML), so this must be
// re-applied there too, not just once on workflow load.
const _FIELD_LABEL_IDS = [
    "wfm-video-block-prompt-label",
    "wfm-video-block-duration-label",
    "wfm-video-block-first-label",
    "wfm-video-block-last-label",
    "wfm-video-plan-aspect-ratio-label",
    "wfm-video-plan-megapixels-label",
    "wfm-video-plan-multiple-label",
];

function _setFieldActive(id, active) {
    document.getElementById(id)?.classList.toggle("wfm-model-label-active", !!active);
}

function _updateFieldHighlights() {
    const nodes = _templateWorkflow ? locateVideoModelNodes(_templateWorkflow) : null;
    if (!nodes) {
        _FIELD_LABEL_IDS.forEach((id) => _setFieldActive(id, false));
        return;
    }
    const hasResolution = !!nodes.resolutionNode;
    _setFieldActive("wfm-video-block-prompt-label", true);
    _setFieldActive("wfm-video-block-duration-label", true);
    _setFieldActive("wfm-video-block-first-label", nodes.firstFrameSlot !== -1);
    _setFieldActive("wfm-video-block-last-label", nodes.lastFrameSlot !== -1);
    _setFieldActive("wfm-video-plan-aspect-ratio-label", hasResolution);
    _setFieldActive("wfm-video-plan-megapixels-label", hasResolution);
    _setFieldActive("wfm-video-plan-multiple-label", hasResolution);
}

function _frameFieldHtml(which, filename) {
    const previewStyle = filename ? "" : "display:none;";
    const previewSrc = filename ? `${comfyUI.baseUrl}/view?filename=${encodeURIComponent(filename)}&type=input` : "";
    return `
        <div class="wfm-i2i-preview-wrap" id="wfm-video-block-${which}-wrap" style="${previewStyle}">
            <img class="wfm-i2i-preview-img" id="wfm-video-block-${which}-preview" src="${previewSrc}">
        </div>
        <div class="wfm-i2i-drop-zone" id="wfm-video-block-${which}-drop">
            <label class="wfm-i2i-drop-label">
                <span>Drop image or click to select</span>
                <input type="file" accept="image/*" id="wfm-video-block-${which}-file" style="display:none;">
            </label>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
            <span class="wfm-i2i-status" id="wfm-video-block-${which}-status" style="flex:1;"></span>
            <button type="button" class="wfm-btn wfm-btn-sm" id="wfm-video-block-${which}-clear">Clear</button>
        </div>
    `;
}

function _blockEditorHtml(block, isFirstBlock) {
    return `
        <div class="wfm-video-block-col wfm-video-block-first-col">
            <label id="wfm-video-block-first-label">First Image</label>
            <select id="wfm-video-block-first-mode" class="wfm-input">
                <option value="none" ${block.first_image_mode === "none" ? "selected" : ""}>None</option>
                <option value="explicit" ${block.first_image_mode === "explicit" ? "selected" : ""}>Specify image</option>
                <option value="chain_previous" ${isFirstBlock ? "disabled" : ""} ${block.first_image_mode === "chain_previous" ? "selected" : ""}>Use previous block's last frame</option>
            </select>
            <div id="wfm-video-block-first-image-area" style="display:${block.first_image_mode === "explicit" ? "" : "none"};margin-top:6px;">
                ${_frameFieldHtml("first", block.first_image_mode === "explicit" ? block.first_image_filename : null)}
            </div>
        </div>

        <div class="wfm-video-block-col wfm-video-block-last-col">
            <label id="wfm-video-block-last-label">Last Image (optional)</label>
            ${_frameFieldHtml("last", block.last_image_filename)}
        </div>

        <div class="wfm-video-block-col wfm-video-block-prompt-col">
            <label id="wfm-video-block-prompt-label">Prompt</label>
            <textarea id="wfm-video-block-prompt" class="wfm-textarea" rows="8">${escapeHtml(block.prompt || "")}</textarea>
        </div>

        <div class="wfm-video-block-col wfm-video-block-duration-col">
            <div class="wfm-video-block-color-row">
                <span class="wfm-video-color-swatch" style="background:${escapeHtml(block.color)}"></span>
                <span>color</span>
            </div>
            <label id="wfm-video-block-duration-label">Duration (seconds)</label>
            <input type="number" id="wfm-video-block-duration" class="wfm-input" step="0.5" min="0.5" value="${block.duration}">
        </div>
    `;
}

function _wireBlockImageDropZone(which) {
    const dropZone = document.getElementById(`wfm-video-block-${which}-drop`);
    const fileInput = document.getElementById(`wfm-video-block-${which}-file`);
    if (!dropZone || !fileInput) return;
    const onFile = (file) => _handleBlockImageUpload(which, file);
    fileInput.addEventListener("change", () => { if (fileInput.files.length > 0) onFile(fileInput.files[0]); });
    dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        if (e.dataTransfer.files.length > 0) onFile(e.dataTransfer.files[0]);
    });
}

async function _handleBlockImageUpload(which, file) {
    if (!file || !file.type.startsWith("image/")) return;
    const block = _plan.blocks.find((b) => b.id === _selectedBlockId);
    if (!block) return;
    const statusEl = document.getElementById(`wfm-video-block-${which}-status`);
    const previewImg = document.getElementById(`wfm-video-block-${which}-preview`);
    const wrap = document.getElementById(`wfm-video-block-${which}-wrap`);
    if (previewImg) previewImg.src = URL.createObjectURL(file);
    if (wrap) wrap.style.display = "";
    if (statusEl) statusEl.textContent = "Uploading...";
    try {
        const result = await comfyUI.uploadImage(file, file.name);
        // The just-uploaded filename isn't in convertUiToApi()'s cached /object_info
        // yet — without this, its COMBO-mismatch fallback would silently swap it
        // for an unrelated pre-existing file the next time this Plan runs.
        comfyWorkflow.invalidateObjectInfoCache();
        if (which === "first") { block.first_image_filename = result.name; block.first_image_mode = "explicit"; }
        else block.last_image_filename = result.name;
        if (statusEl) { statusEl.textContent = `✓ ${result.name}`; statusEl.style.color = "var(--wfm-success)"; }
    } catch (err) {
        if (statusEl) { statusEl.textContent = `✗ ${err.message}`; statusEl.style.color = "var(--wfm-danger)"; }
    }
}

function _clearBlockImage(which) {
    const block = _plan.blocks.find((b) => b.id === _selectedBlockId);
    if (!block) return;
    if (which === "first") {
        block.first_image_filename = null;
        if (block.first_image_mode === "explicit") block.first_image_mode = "none";
    } else {
        block.last_image_filename = null;
    }
    _renderBlockEditor();
}

function _renderBlockEditor() {
    const container = document.getElementById("wfm-video-block-editor");
    if (!container) return;
    const idx = _plan.blocks.findIndex((b) => b.id === _selectedBlockId);
    const block = _plan.blocks[idx] ?? _plan.blocks[0];
    if (!block) return;
    container.innerHTML = _blockEditorHtml(block, idx <= 0);

    document.getElementById("wfm-video-block-first-mode")?.addEventListener("change", (e) => {
        block.first_image_mode = e.target.value;
        if (block.first_image_mode !== "explicit") block.first_image_filename = null;
        _renderBlockEditor();
    });
    _wireBlockImageDropZone("first");
    _wireBlockImageDropZone("last");
    document.getElementById("wfm-video-block-first-clear")?.addEventListener("click", () => _clearBlockImage("first"));
    document.getElementById("wfm-video-block-last-clear")?.addEventListener("click", () => _clearBlockImage("last"));

    document.getElementById("wfm-video-block-prompt")?.addEventListener("input", (e) => { block.prompt = e.target.value; });
    document.getElementById("wfm-video-block-duration")?.addEventListener("change", (e) => {
        const v = Number(e.target.value);
        block.duration = (isNaN(v) || v <= 0) ? 0.5 : v;
        e.target.value = block.duration;
        _renderTimeline();
    });

    _updateFieldHighlights();
}

// ============================================
// Base settings
// ============================================

function _initBaseSettings() {
    document.getElementById("wfm-video-plan-aspect-ratio")?.addEventListener("change", (e) => {
        _plan.base_settings.aspect_ratio = e.target.value;
    });
    document.getElementById("wfm-video-plan-megapixels")?.addEventListener("change", (e) => {
        _plan.base_settings.megapixels = Number(e.target.value) || 0.2;
    });
    document.getElementById("wfm-video-plan-multiple")?.addEventListener("change", (e) => {
        _plan.base_settings.multiple = Number(e.target.value) || 32;
    });
}

function _applyBaseSettingsToUI() {
    const aspectEl = document.getElementById("wfm-video-plan-aspect-ratio");
    const mpEl = document.getElementById("wfm-video-plan-megapixels");
    const multEl = document.getElementById("wfm-video-plan-multiple");
    if (aspectEl && _plan.base_settings.aspect_ratio) aspectEl.value = _plan.base_settings.aspect_ratio;
    if (mpEl) mpEl.value = _plan.base_settings.megapixels;
    if (multEl) multEl.value = _plan.base_settings.multiple;
}

async function _populateAspectRatioOptions() {
    const select = document.getElementById("wfm-video-plan-aspect-ratio");
    if (!select) return;
    try {
        const info = await comfyUI.fetchObjectInfo("ResolutionSelector");
        const inputDef = info?.ResolutionSelector?.input?.required?.aspect_ratio;
        if (!inputDef) return;
        const first = inputDef[0];
        let values = null;
        if (Array.isArray(first)) values = first;
        else if (typeof first === "string" && Array.isArray(inputDef[1]?.values)) values = inputDef[1].values;
        else if (typeof first === "string" && Array.isArray(inputDef[1]?.options)) values = inputDef[1].options;
        if (!values?.length) return;
        select.innerHTML = values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
        if (_plan.base_settings.aspect_ratio) select.value = _plan.base_settings.aspect_ratio;
    } catch {
        // ResolutionSelectorが未導入の環境などは選択肢が空のまま。
    }
}

// ============================================
// Workflow loading
// ============================================

// Entry point for the Workflow tab's "Load in Video" button — starts a brand
// new Plan (a single block) seeded from the workflow's own current values,
// exactly like the old single-shot form used to populate itself.
export async function loadWorkflowIntoVideoEditor(workflow, filename) {
    const nodes = locateVideoModelNodes(workflow);
    if (!nodes) {
        showToast(t("videoUnsupportedWorkflow"), "error");
        return false;
    }
    _templateWorkflow = workflow;
    _templateFilename = filename || "";

    const nameEl = document.getElementById("wfm-video-wf-name");
    if (nameEl) nameEl.textContent = filename || "Loaded Workflow";

    const defaults = readTemplateDefaults(nodes);

    _plan = _emptyPlanState();
    _plan.workflowFilename = filename || "";
    _plan.base_settings.aspect_ratio = defaults.aspectRatio || "";
    if (defaults.megapixels != null) _plan.base_settings.megapixels = defaults.megapixels;
    if (defaults.multiple != null) _plan.base_settings.multiple = defaults.multiple;

    const block = _plan.blocks[0];
    block.prompt = defaults.prompt;
    block.duration = defaults.duration;
    if (defaults.firstImageFilename) {
        block.first_image_mode = "explicit";
        block.first_image_filename = defaults.firstImageFilename;
    }
    if (defaults.lastImageFilename) block.last_image_filename = defaults.lastImageFilename;

    const aspectEl = document.getElementById("wfm-video-plan-aspect-ratio");
    const mpEl = document.getElementById("wfm-video-plan-megapixels");
    const multEl = document.getElementById("wfm-video-plan-multiple");
    [aspectEl, mpEl, multEl].forEach((el) => { if (el) el.disabled = !defaults.hasResolution; });

    _selectedBlockId = block.id;
    _applyBaseSettingsToUI();
    _renderTimeline();
    _renderBlockEditor();
    _updatePlanWorkflowUI();
    _syncNoteAndSeedUI();

    // Jump to the Plan subtab so the freshly-loaded editor is actually visible
    // (mirrors how workflow-tab.js switches the top-level tab to "video").
    document.querySelector('.wfm-video-subtab-btn[data-video-subtab="plan"]')?.click();

    showToast(t("videoWorkflowLoaded", filename || ""), "success");
    return true;
}

// Loads a Plan's recorded workflow file as this Plan's template WITHOUT
// touching the Plan's own blocks/base_settings — unlike
// loadWorkflowIntoVideoEditor above, which always starts a fresh single-block
// Plan. Used only by the Plan pane's "Open Workflow" button, after a Plan
// (with its blocks already restored by _applyPlanData) has been loaded.
async function _loadPlanWorkflow() {
    const filename = _plan.workflowFilename;
    if (!filename) return;
    if (!window.confirm(t("videoConfirmLoadWorkflow", filename))) return;
    try {
        const resp = await fetch(`/api/wfm/workflows/raw?filename=${encodeURIComponent(filename)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const nodes = locateVideoModelNodes(data);
        if (!nodes) {
            showToast(t("videoUnsupportedWorkflow"), "error");
            return;
        }
        _templateWorkflow = data;
        _templateFilename = filename;
        const nameEl = document.getElementById("wfm-video-wf-name");
        if (nameEl) nameEl.textContent = filename;
        _updateFieldHighlights();
        showToast(t("videoWorkflowLoaded", filename), "success");
    } catch (err) {
        showToast(`${t("videoWorkflowLoadFailed")}: ${err.message}`, "error");
    }
}

// ============================================
// Gallery integration (group tagging + workflow sidecar for generated output)
// ============================================

async function _fetchOutputDir() {
    try {
        const res = await fetch("/api/wfm/settings/output-dir");
        if (res.ok) {
            const data = await res.json();
            _outputDir = (data.current || "").replace(/\\/g, "/").replace(/\/$/, "");
        }
    } catch { /* non-critical */ }
}

// __Video Assets__ is a manually-curated group (users add things to it via
// Gallery themselves) — a batch run never writes to it directly. Every run's
// own output lands in __Video Temp__ instead (a reserved, auto-managed scratch
// group, cleared via the "Clear __Video Temp__" button in Gallery's detail
// pane), regardless of whether the plan itself has been saved — organizing a
// run's output into __Video Assets__ is left entirely to the user, on their
// own schedule (previously this auto-filed into a per-plan "VideoPlan:<name>"
// group instead, which was removed since users found manual curation simpler).
async function _ensureVideoAssetGroups() {
    try {
        const res = await fetch("/wfm/gallery/groups/ensure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: VTEMP_GROUP }),
        });
        if (!res.ok) console.warn(`[VideoPlan] ensure group "${VTEMP_GROUP}" failed: HTTP ${res.status}`);
    } catch (err) {
        console.warn(`[VideoPlan] ensure group "${VTEMP_GROUP}" error:`, err);
    }
}

async function _addOutputsToVideoGroups(images) {
    if (!_outputDir) await _fetchOutputDir();
    if (!_outputDir) {
        console.warn("[VideoPlan] output dir unknown — skipping group tagging for", images);
        return;
    }
    for (const img of images) {
        if (img.type !== "output") continue;
        const parts = [_outputDir];
        if (img.subfolder) parts.push(img.subfolder);
        parts.push(img.filename);
        const path = parts.join("/");
        try {
            const res = await fetch(`/wfm/gallery/groups/${encodeURIComponent(VTEMP_GROUP)}/add`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }),
            });
            if (!res.ok) console.warn(`[VideoPlan] add "${path}" to "${VTEMP_GROUP}" failed: HTTP ${res.status}`);
        } catch (err) {
            console.warn(`[VideoPlan] add "${path}" to "${VTEMP_GROUP}" error:`, err);
        }
    }
}

async function _saveGeneratedVideoMeta(images, workflow) {
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
        } catch { /* non-critical */ }
    }
}

function _resultMediaUrl(media) {
    const params = new URLSearchParams({ filename: media.filename, subfolder: media.subfolder || "", type: media.type || "output" });
    return `${comfyUI.baseUrl}/view?${params}`;
}

// ============================================
// Batch execution
// ============================================

function _waitIfPaused() {
    if (!_paused) return Promise.resolve();
    return new Promise((resolve) => { _resumeResolve = resolve; });
}

function _setRunUiState(running) {
    const runBtn = document.getElementById("wfm-video-plan-run-btn");
    const cancelBtn = document.getElementById("wfm-video-plan-cancel-btn");
    const pauseBtn = document.getElementById("wfm-video-plan-pause-btn");
    if (runBtn) runBtn.style.display = running ? "none" : "";
    if (cancelBtn) cancelBtn.style.display = running ? "" : "none";
    if (pauseBtn) {
        pauseBtn.disabled = !running;
        pauseBtn.textContent = t("videoPlanPause");
    }
}

// Resolves the effective first-frame filename for block i, honoring the
// per-block first_image_mode. For "chain_previous": an explicit
// last_image_filename on the previous block always wins (it's already a known
// input image — no extraction needed); otherwise the previous block's actual
// generated last frame is used (extracted client-side after that block ran).
async function _resolveFirstImage(block, i, prevGeneratedLastFrameRef) {
    if (block.first_image_mode === "explicit") return block.first_image_filename || null;
    if (block.first_image_mode === "chain_previous" && i > 0) {
        const prevBlock = _plan.blocks[i - 1];
        if (prevBlock.last_image_filename) return prevBlock.last_image_filename;
        return prevGeneratedLastFrameRef;
    }
    return null;
}

async function _runVideoPlanBatch() {
    if (!_templateWorkflow) {
        showToast(t("videoNoWorkflowLoaded"), "error");
        return;
    }

    _paused = false;
    _aborted = false;
    _plan.results.blocks = [];
    _setRunUiState(true);
    await _ensureVideoAssetGroups();

    const progressBar = document.getElementById("wfm-video-plan-progress-bar");
    const progressText = document.getElementById("wfm-video-plan-progress-text");

    let completed = 0, failed = 0;
    let prevGeneratedLastFrameRef = null;

    try {
        for (let i = 0; i < _plan.blocks.length; i++) {
            if (_aborted) break;
            await _waitIfPaused();
            if (_aborted) break;

            const block = _plan.blocks[i];
            const total = _plan.blocks.length;
            if (progressText) progressText.textContent = `[${i + 1}/${total}] ...`;

            const clone = structuredClone(_templateWorkflow);
            const nodes = locateVideoModelNodes(clone);
            if (!nodes) {
                showToast(t("videoUnsupportedWorkflow"), "error");
                break;
            }

            const firstImageFilename = await _resolveFirstImage(block, i, prevGeneratedLastFrameRef);
            applyBlockToWorkflow(clone, nodes, {
                prompt: block.prompt,
                duration: block.duration,
                aspectRatio: _plan.base_settings.aspect_ratio,
                megapixels: _plan.base_settings.megapixels,
                multiple: _plan.base_settings.multiple,
                firstImageFilename,
                lastImageFilename: block.last_image_filename || null,
            });

            try {
                const apiWorkflow = await comfyWorkflow.convertUiToApi(clone);
                const { images } = await comfyUI.generate(apiWorkflow, {
                    seedMode: _plan.seed_mode,
                    seedValue: _plan.seed_value,
                    timeoutMs: 30 * 60 * 1000,
                    onProgress: (pct) => {
                        if (progressBar) progressBar.style.width = `${(pct * 100).toFixed(1)}%`;
                        if (progressText) progressText.textContent = `[${i + 1}/${total}] ${(pct * 100).toFixed(0)}%`;
                    },
                });
                const outputMedia = images.filter((img) => img.type !== "temp");
                _plan.results.blocks.push({ block_id: block.id, images: outputMedia });

                await _addOutputsToVideoGroups(outputMedia);
                await _saveGeneratedVideoMeta(outputMedia, apiWorkflow);

                // Show this block's clip in the center panel's result pane as soon as
                // it finishes, independent of whether chain_previous below needs it too.
                const resultVid = outputMedia.find((m) => isVideoFilename(m.filename));
                if (resultVid) {
                    setResultPreview(_resultMediaUrl(resultVid), {
                        kind: "output", filename: resultVid.filename, subfolder: resultVid.subfolder || "", type: resultVid.type || "output",
                    });
                }

                // Only needed as a fallback for the NEXT block's "chain_previous" —
                // skip the extraction entirely when this block already has its own
                // explicit last_image_filename (that value is used directly instead).
                prevGeneratedLastFrameRef = null;
                if (!block.last_image_filename) {
                    const vid = outputMedia.find((m) => isVideoFilename(m.filename));
                    if (vid) {
                        try {
                            const blob = await extractLastFrameBlob(_resultMediaUrl(vid));
                            const file = new File([blob], `videoplan_chain_${Date.now()}.png`, { type: "image/png" });
                            const uploaded = await comfyUI.uploadImage(file, file.name);
                            // Without this, the next block's convertUiToApi() call sees
                            // a filename that isn't in its cached /object_info's LoadImage
                            // "image" COMBO choices and silently substitutes an unrelated
                            // pre-existing file instead — this was the actual cause behind
                            // a chained block appearing to start from a random image.
                            comfyWorkflow.invalidateObjectInfoCache();
                            prevGeneratedLastFrameRef = uploaded.name;
                        } catch { /* chain_previous on the next block will simply get no image */ }
                    }
                }

                completed++;
            } catch (err) {
                if (_aborted) break;
                failed++;
                showToast(t("batchItemFailed", i + 1, total, err.message), "error");
            }
        }
    } finally {
        _paused = false;
        if (_resumeResolve) { _resumeResolve(); _resumeResolve = null; }
        _setRunUiState(false);
    }

    if (progressBar) progressBar.style.width = "100%";
    if (_aborted) {
        showToast(t("batchStopped", completed, failed), "info");
    } else {
        showToast(t("batchComplete", completed, _plan.blocks.length, failed), failed > 0 ? "error" : "success");
    }
}

function _initRunControls() {
    document.getElementById("wfm-video-plan-note")?.addEventListener("input", (e) => { _plan.note = e.target.value; });
    document.getElementById("wfm-video-plan-seed-value")?.addEventListener("change", (e) => {
        _plan.seed_value = Number(e.target.value) || 0;
    });
    document.getElementById("wfm-video-plan-seed-randomize")?.addEventListener("change", (e) => {
        _plan.seed_mode = e.target.checked ? "random" : "fixed";
    });

    document.getElementById("wfm-video-plan-run-btn")?.addEventListener("click", () => _runVideoPlanBatch());
    document.getElementById("wfm-video-plan-cancel-btn")?.addEventListener("click", async () => {
        _aborted = true;
        _paused = false;
        if (_resumeResolve) { _resumeResolve(); _resumeResolve = null; }
        await comfyUI.interrupt();
        showToast(t("interrupted"), "info");
    });
    document.getElementById("wfm-video-plan-pause-btn")?.addEventListener("click", (e) => {
        _paused = !_paused;
        e.target.textContent = _paused ? t("videoPlanResume") : t("videoPlanPause");
        if (!_paused && _resumeResolve) { _resumeResolve(); _resumeResolve = null; }
    });
}

function _syncNoteAndSeedUI() {
    const noteEl = document.getElementById("wfm-video-plan-note");
    const seedValEl = document.getElementById("wfm-video-plan-seed-value");
    const seedRandEl = document.getElementById("wfm-video-plan-seed-randomize");
    if (noteEl) noteEl.value = _plan.note;
    if (seedValEl) seedValEl.value = _plan.seed_value;
    if (seedRandEl) seedRandEl.checked = _plan.seed_mode === "random";
}

// ============================================
// Plan save / load / clear
// ============================================

function _stripVideoPlanPrefix(base) {
    return base.toLowerCase().startsWith(VIDEO_PLAN_PREFIX) ? base.slice(VIDEO_PLAN_PREFIX.length) : base;
}

function _buildPlanData(name) {
    return {
        name,
        note: _plan.note,
        workflow_filename: _templateFilename || _plan.workflowFilename || "",
        base_settings: { ..._plan.base_settings },
        seed_mode: _plan.seed_mode,
        seed_value: _plan.seed_value,
        blocks: _plan.blocks,
        results: { blocks: _plan.results.blocks },
    };
}

function _loadImageEl(src) {
    return new Promise((resolve) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = src;
    });
}

// A result item's own URL (e.g. .mp4) can't be loaded into an <img> — extract
// its last frame first so the index/contact-sheet gets a real thumbnail.
async function _loadIndexCellImage(media) {
    const url = _resultMediaUrl(media);
    if (!isVideoFilename(media.filename)) return _loadImageEl(url);
    try {
        const blob = await extractLastFrameBlob(url);
        const blobUrl = URL.createObjectURL(blob);
        const im = await _loadImageEl(blobUrl);
        URL.revokeObjectURL(blobUrl);
        return im;
    } catch {
        return null;
    }
}

// planData, when given, is embedded into the resulting PNG as an iTXt chunk
// (VIDEO_PLAN_PNG_KEY) so the image alone can be dropped back onto the Plan
// drop zone to restore the whole Plan (see _loadPlanFromIndexImage).
async function _buildIndexImageDataUrl(planData) {
    const thumbs = _plan.results.blocks.map((r) => r.images?.[0]).filter(Boolean).slice(0, MAX_INDEX_THUMBS);
    if (thumbs.length === 0) return null;

    const cols = Math.min(3, thumbs.length);
    const rows = Math.ceil(thumbs.length / cols);
    const cellSize = 128;
    const canvas = document.createElement("canvas");
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < thumbs.length; i++) {
        const im = await _loadIndexCellImage(thumbs[i]);
        if (!im) continue;
        const col = i % cols, row = Math.floor(i / cols);
        const scale = Math.max(cellSize / im.width, cellSize / im.height);
        const w = im.width * scale, h = im.height * scale;
        ctx.drawImage(im, col * cellSize - (w - cellSize) / 2, row * cellSize - (h - cellSize) / 2, w, h);
    }
    const dataUrl = canvas.toDataURL("image/png");
    if (!planData) return dataUrl;
    try {
        return embedPngTextChunk(dataUrl, VIDEO_PLAN_PNG_KEY, JSON.stringify(planData));
    } catch (err) {
        console.warn("Failed to embed Video plan metadata into index image:", err);
        return dataUrl;
    }
}

async function _savePlan(filenameOverride, forceNewName = false) {
    let inputName = filenameOverride;
    if (!inputName) {
        if (forceNewName || !_plan.planFilename) {
            inputName = window.prompt(t("videoPlanEnterName"), "");
            if (!inputName) return;
        } else {
            inputName = _plan.planFilename;
        }
    }

    const baseName = _stripVideoPlanPrefix(inputName.replace(/\.json$/i, ""));
    const filename = `${VIDEO_PLAN_PREFIX}${baseName}.json`;
    const data = _buildPlanData(baseName);

    let indexImageBase64 = null;
    try { indexImageBase64 = await _buildIndexImageDataUrl(data); } catch { /* thumbnail generation is best-effort */ }

    try {
        const res = await fetch("/api/wfm/video/plans/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, data, index_image_base64: indexImageBase64 }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        _plan.planFilename = json.filename;
        _updatePlanWorkflowUI();
        showToast(t("videoPlanSaved"), "success");
    } catch (err) {
        showToast(`${t("videoPlanSaveFailed")}: ${err.message}`, "error");
    }
}

function _applyPlanData(filename, data) {
    _plan.planFilename = filename;
    _plan.note = data.note || "";
    _plan.workflowFilename = data.workflow_filename || null;
    _plan.base_settings = {
        aspect_ratio: data.base_settings?.aspect_ratio || "",
        megapixels: data.base_settings?.megapixels ?? 0.2,
        multiple: data.base_settings?.multiple ?? 32,
    };
    _plan.seed_mode = data.seed_mode || "random";
    _plan.seed_value = data.seed_value ?? 0;
    _plan.blocks = (Array.isArray(data.blocks) && data.blocks.length > 0) ? data.blocks : [_emptyBlock(0)];
    _plan.results = { blocks: data.results?.blocks || [] };
    _selectedBlockId = _plan.blocks[0].id;

    _applyBaseSettingsToUI();
    _syncNoteAndSeedUI();
    _renderTimeline();
    _renderBlockEditor();
    _updatePlanWorkflowUI();
}

async function _loadPlanFromFile(file) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const filename = file.name.toLowerCase().endsWith(".json") ? file.name : `${file.name}.json`;
        _applyPlanData(filename, data);
        showToast(t("videoPlanLoaded"), "success");
    } catch (err) {
        showToast(`${t("videoPlanLoadFailed")}: ${err.message}`, "error");
    }
}

async function _loadPlanFromIndexImage(file) {
    const stem = file.name.replace(/\.[^.]+$/, "");
    const filename = `${stem}.json`;
    try {
        const chunks = await readAllPNGTextChunks(file);
        if (chunks?.[VIDEO_PLAN_PNG_KEY]) {
            _applyPlanData(filename, JSON.parse(chunks[VIDEO_PLAN_PNG_KEY]));
            showToast(t("videoPlanLoaded"), "success");
            return;
        }
    } catch { /* fall through to the server lookup below */ }
    await _loadPlanFromServer(filename);
}

async function _loadPlanFromServer(filename) {
    try {
        const res = await fetch(`/api/wfm/video/plans/content?filename=${encodeURIComponent(filename)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        _applyPlanData(filename, json.data || {});
        showToast(t("videoPlanLoaded"), "success");
    } catch (err) {
        showToast(`${t("videoPlanLoadFailed")}: ${err.message}`, "error");
    }
}

// Entry point for the Project panel's saved-plan list (video-project-tab.js) —
// loads a plan by filename the same way drag&drop does, then jumps to the Plan
// subtab so the freshly-loaded editor is actually visible (mirrors
// loadWorkflowIntoVideoEditor above).
export async function openSavedVideoPlan(filename) {
    await _loadPlanFromServer(filename);
    document.querySelector('.wfm-video-subtab-btn[data-video-subtab="plan"]')?.click();
}

function _clearPlan() {
    if (!window.confirm(t("videoConfirmClearPlan"))) return;
    _plan = _emptyPlanState();
    _selectedBlockId = _plan.blocks[0].id;
    _syncNoteAndSeedUI();
    _renderTimeline();
    _renderBlockEditor();
    _updatePlanWorkflowUI();
}

function _updatePlanWorkflowUI() {
    const row = document.getElementById("wfm-video-plan-workflow-row");
    const nameEl = document.getElementById("wfm-video-plan-workflow-name");
    if (!row || !nameEl) return;
    if (_plan.workflowFilename) {
        nameEl.textContent = _plan.workflowFilename;
        nameEl.title = _plan.workflowFilename;
        row.style.display = "";
    } else {
        row.style.display = "none";
    }
}

function _initPlanDropZone() {
    const dropZone = document.getElementById("wfm-video-plan-drop-zone");
    const fileInput = document.getElementById("wfm-video-plan-file-input");
    if (!dropZone || !fileInput) return;
    const handle = (file) => {
        if (!file) return;
        if (file.type === "image/png" || file.name.toLowerCase().endsWith(".png")) _loadPlanFromIndexImage(file);
        else _loadPlanFromFile(file);
    };
    fileInput.addEventListener("change", () => { if (fileInput.files.length > 0) handle(fileInput.files[0]); });
    dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        if (e.dataTransfer.files.length > 0) handle(e.dataTransfer.files[0]);
    });
}

function _initPlanButtons() {
    document.getElementById("wfm-video-plan-save-btn")?.addEventListener("click", () => _savePlan());
    document.getElementById("wfm-video-plan-saveas-btn")?.addEventListener("click", () => _savePlan(null, true));
    document.getElementById("wfm-video-plan-clear-btn")?.addEventListener("click", () => _clearPlan());
    document.getElementById("wfm-video-plan-workflow-load-btn")?.addEventListener("click", () => _loadPlanWorkflow());
}

// Run/Plan tabs — Run/Pause/Cancel/progress/Seed vs. Note/Save/SaveAs/Clear/Load,
// switched within the same compact widget (same active-class + content-toggle
// pattern as video-tab.js's own Frame/GIF property tabs).
function _initRunPlanTabToggle() {
    document.querySelectorAll(".wfm-video-runplan-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-video-runplan-tab").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            const target = btn.dataset.runplanTab;
            document.querySelectorAll(".wfm-video-runplan-content").forEach((c) => {
                c.style.display = c.id === `wfm-video-runplan-${target}` ? "" : "none";
            });
        });
    });
}

// ============================================
// Init
// ============================================

export function initVideoPlanTab() {
    _initPlanDropZone();
    _initBaseSettings();
    _populateAspectRatioOptions();
    _initTimelineControls();
    _initRunPlanTabToggle();
    _initRunControls();
    _initPlanButtons();
    _renderTimeline();
    _renderBlockEditor();
}

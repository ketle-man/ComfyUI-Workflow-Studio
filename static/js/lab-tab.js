/**
 * Lab Tab - Experimental I2I batch generation.
 *
 * Runs the currently loaded workflow N times, letting Model (Checkpoint/LoRA/VAE) /
 * Prompt / KSampler each be overridden independently starting at a chosen iteration
 * ("keyframe"). Never mutates comfyUI.currentWorkflow — everything is applied to a
 * fresh deep clone per iteration so it can't interfere with the Input/Model/Settings/
 * Batch subtabs.
 */

import { comfyUI } from "./comfyui-client.js";
import { comfyEditor } from "./comfyui-editor.js";
import { showToast, openModal, closeModal } from "./app.js";
import { t } from "./i18n.js";
import { escapeHtml, embedPngTextChunk, getEagleSettings, saveToEagle, setupSearchClearBtn } from "./util.js";
import { extractAllMetadata, readAllPNGTextChunks } from "./metadata-tab.js";
import { syncJsonHighlight, syncScroll } from "./json-highlight.js";
import { _expandWildcardsInWorkflow } from "./generate-tab.js";

const COLUMN_KEYS = ["model", "prompt", "ksampler"];
const MAX_RESULTS = 9;
const RESULTS_GRID_COLS = 3;
const LAB_PLAN_PREFIX = "ws_labplan_";
const LAB_PLAN_PNG_KEY = "wfm_lab_plan";

function _defaultValueFor(col) {
    if (col === "model") return { checkpoint: "", lora: { name: "", strengthModel: 1.0, strengthClip: 1.0 }, vae: "" };
    if (col === "prompt") return { positive: "", negative: "", styleApplied: false, styleName: "" };
    if (col === "ksampler") return { steps: null, cfg: null, sampler_name: "", scheduler: "", denoise: null, seed: null };
    return "";
}

// Fills in defaults for a possibly-partial "model" column value — both for legacy
// plan data migrated by _migrateLabColumns (which never sets a lora) and defensively
// for any hand-edited Plan JSON.
function _normalizeModelValue(v) {
    return {
        checkpoint: v?.checkpoint || "",
        lora: {
            name: v?.lora?.name || "",
            strengthModel: v?.lora?.strengthModel ?? 1.0,
            strengthClip: v?.lora?.strengthClip ?? 1.0,
        },
        vae: v?.vae || "",
    };
}

function _emptyColumns() {
    return {
        model: [{ atIteration: 1, value: _defaultValueFor("model"), revertToBase: false, bypassed: false }],
        prompt: [{ atIteration: 1, value: _defaultValueFor("prompt"), revertToBase: false, bypassed: false }],
        ksampler: [{ atIteration: 1, value: _defaultValueFor("ksampler"), revertToBase: false, bypassed: false }],
    };
}

// Legacy Plan JSON (pre "Model column" merge) stored separate checkpoint/vae columns.
// Merges them into one "model" column keyed by atIteration so old .json/.png plans
// still load correctly. LoRA is left empty since the old format never had it.
function _migrateLabColumns(columns) {
    if (!columns) return _emptyColumns();
    if (columns.model) return columns;

    const ckptKfs = columns.checkpoint || [];
    const vaeKfs = columns.vae || [];
    const { checkpoint, vae, ...rest } = columns;

    if (ckptKfs.length === 0 && vaeKfs.length === 0) {
        return { ...rest, model: _emptyColumns().model };
    }

    const iterations = [...new Set([1, ...ckptKfs.map((k) => k.atIteration), ...vaeKfs.map((k) => k.atIteration)])].sort((a, b) => a - b);
    const findAt = (kfs, iter) => kfs.find((k) => k.atIteration === iter);
    const model = iterations.map((iter) => {
        const ck = findAt(ckptKfs, iter);
        const vk = findAt(vaeKfs, iter);
        return {
            atIteration: iter,
            bypassed: !!(ck?.bypassed || vk?.bypassed),
            revertToBase: !!(ck?.revertToBase || vk?.revertToBase),
            value: { checkpoint: ck?.value || "", lora: { name: "", strengthModel: 1.0, strengthClip: 1.0 }, vae: vk?.value || "" },
        };
    });
    return { ...rest, model };
}

function _emptyLabState() {
    return {
        planFilename: null,
        note: "",
        batchCount: 4,
        chainImage: false,
        t2iMode: false,
        saveIndexOnRun: true,
        sourceImageFilename: null,
        workflowFilename: null,
        columns: _emptyColumns(),
        results: { images: [] },
    };
}

let _lab = _emptyLabState();
let _paused = false;
let _aborted = false;
let _resumeResolve = null;
let _lastGeneratedImageRef = null; // ComfyUI "name [type]" annotated ref of the previous iteration's first output

// Which single field the Model column's cells currently display (C/L/V toggle in its
// header) — purely a display preference, not part of the Plan data, so it's not saved
// with the plan and simply resets to "checkpoint" on page load.
let _modelViewMode = "checkpoint";

// ============================================
// Init
// ============================================

export function initLabTab() {
    _initDropZone();
    _initPlanDropZone();
    _initSubtabToggle();
    _initColumnButtons();
    _initModelViewToggle();
    _initRunControls();
    _initPlanButtons();
    _initPlanJsonTab();
    _renderAllColumns();
    _renderResultsGrid();
    _updateT2IModeUI();
}

// Re-renders the column grid so Setting 1's live-reflected cells (see _isLiveDisplay)
// pick up whatever is currently loaded in GenerateUI. Called by generate-tab.js each
// time its own Lab subtab is switched to — cells are static HTML rendered once, so
// without this they'd stay frozen at whatever GenerateUI showed the last time Lab was
// rendered, not "initially" reflecting the workflow as the user opens Lab now.
export function refreshLabLiveDefaults() {
    _renderAllColumns();
}

function _initDropZone() {
    const dropZone = document.getElementById("wfm-lab-drop-zone");
    const fileInput = document.getElementById("wfm-lab-file-input");
    const previewWrap = document.getElementById("wfm-lab-preview-wrap");
    const previewImg = document.getElementById("wfm-lab-preview-img");

    document.getElementById("wfm-lab-t2i-mode")?.addEventListener("change", (e) => {
        _lab.t2iMode = e.target.checked;
        _updateT2IModeUI();
    });

    const applyFile = async (file) => {
        if (_lab.t2iMode) {
            showToast(t("labT2IImageIgnored"), "info");
            return;
        }
        if (!file || !file.type.startsWith("image/")) return;
        const url = URL.createObjectURL(file);
        if (previewImg) previewImg.src = url;
        if (previewWrap) previewWrap.style.display = "";
        try {
            const result = await comfyUI.uploadImage(file, file.name);
            if (!result.name) throw new Error("Upload returned no filename");
            _lab.sourceImageFilename = result.name;
            _updateResultsSourceImage();
            showToast(t("labImageUploaded", result.name), "success");
        } catch (err) {
            showToast(`${t("labUploadFailed")}: ${err.message}`, "error");
        }
    };

    fileInput?.addEventListener("change", () => {
        if (fileInput.files.length > 0) applyFile(fileInput.files[0]);
    });
    if (dropZone) {
        dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
        dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropZone.classList.remove("drag-over");
            if (e.dataTransfer.files.length > 0) applyFile(e.dataTransfer.files[0]);
        });
    }
}

// Plan Load — same drag&drop + click-to-browse UX as the Image drop zone.
// Accepts a .json plan file (read directly) or a .png index-image thumbnail
// (same basename as its .json on the server, fetched by filename).
function _initPlanDropZone() {
    const dropZone = document.getElementById("wfm-lab-plan-drop-zone");
    const fileInput = document.getElementById("wfm-lab-plan-file-input");

    const applyFile = (file) => {
        if (!file) return;
        const name = file.name.toLowerCase();
        if (name.endsWith(".json")) {
            _loadPlanFromFile(file);
        } else if (name.endsWith(".png") || file.type.startsWith("image/")) {
            _loadPlanFromIndexImage(file);
        } else {
            showToast(t("labPlanInvalidFile"), "error");
        }
    };

    fileInput?.addEventListener("change", () => {
        if (fileInput.files.length > 0) applyFile(fileInput.files[0]);
        fileInput.value = ""; // allow re-selecting the same file next time
    });
    if (dropZone) {
        dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
        dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropZone.classList.remove("drag-over");
            if (e.dataTransfer.files.length > 0) applyFile(e.dataTransfer.files[0]);
        });
    }
}

function _initSubtabToggle() {
    document.querySelectorAll(".wfm-lab-subtab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.labSubtab;
            document.querySelectorAll(".wfm-lab-subtab-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById("wfm-lab-panel-setting")?.classList.toggle("active", target === "setting");
            document.getElementById("wfm-lab-panel-results")?.classList.toggle("active", target === "results");
            document.getElementById("wfm-lab-panel-planjson")?.classList.toggle("active", target === "planjson");
            if (target === "results") _updateResultsSourceImage();
            if (target === "planjson") _syncLabJsonView();
        });
    });
}

function _initPlanJsonTab() {
    document.getElementById("wfm-lab-planjson-refresh")?.addEventListener("click", () => {
        _syncLabJsonView();
        showToast(t("labPlanJsonRefreshed"), "success");
    });

    document.getElementById("wfm-lab-planjson-apply")?.addEventListener("click", () => {
        const editor = document.getElementById("wfm-lab-planjson-editor");
        let data;
        try {
            data = JSON.parse(editor?.value || "{}");
        } catch (err) {
            showToast(`${t("labPlanJsonInvalid")}: ${err.message}`, "error");
            return;
        }
        _applyPlanData(_lab.planFilename, data);
        _syncLabJsonView();
        showToast(t("labPlanJsonApplied"), "success");
    });

    const editor = document.getElementById("wfm-lab-planjson-editor");
    const highlight = document.getElementById("wfm-lab-planjson-highlight");
    editor?.addEventListener("scroll", () => syncScroll(editor, highlight));
}

// Serializes the live Setting-tab state into the same shape saved to disk by
// _savePlan(), for display/editing in the Plan JSON panel.
function _buildPlanData(name) {
    // The workflow currently loaded in GenerateUI is what this plan actually ran
    // against — read it live so Save/Save As always records the up-to-date file.
    const wfNameEl = document.getElementById("wfm-gen-wf-name");
    const workflowFilename = wfNameEl?.dataset.filename || _lab.workflowFilename || "";
    return {
        name,
        note: _lab.note,
        batch_count: _lab.batchCount,
        chain_image: _lab.chainImage,
        t2i_mode: _lab.t2iMode,
        save_index_on_run: _lab.saveIndexOnRun,
        source_image: _lab.sourceImageFilename,
        workflow_filename: workflowFilename,
        columns: _lab.columns,
        results: { images: _lab.results.images },
    };
}

function _syncLabJsonView() {
    const editor = document.getElementById("wfm-lab-planjson-editor");
    const highlight = document.getElementById("wfm-lab-planjson-highlight");
    if (!editor) return;
    const name = _lab.planFilename ? _stripLabPlanPrefix(_lab.planFilename.replace(/\.json$/i, "")) : "";
    const json = JSON.stringify(_buildPlanData(name), null, 2);
    editor.value = json;
    syncJsonHighlight(highlight, json);
}

// Highest atIteration among all columns' keyframes — used to detect keyframes that
// fall outside the current Batch count (they aren't deleted, just never reached by
// the run loop, so it's easy to lower Batch count without noticing they went dormant).
function _maxKeyframeIteration() {
    let max = 1;
    for (const col of COLUMN_KEYS) {
        for (const kf of _lab.columns[col] || []) {
            if (kf.atIteration > max) max = kf.atIteration;
        }
    }
    return max;
}

function _warnIfKeyframesExceedBatch() {
    const maxIter = _maxKeyframeIteration();
    if (maxIter > _lab.batchCount) {
        showToast(t("labKeyframesExceedBatch", maxIter, _lab.batchCount), "error");
    }
}

function _initRunControls() {
    document.getElementById("wfm-lab-batch-count")?.addEventListener("change", (e) => {
        const v = parseInt(e.target.value, 10);
        _lab.batchCount = (isNaN(v) || v < 1) ? 1 : v;
        e.target.value = _lab.batchCount;
        _warnIfKeyframesExceedBatch();
    });
    document.getElementById("wfm-lab-note")?.addEventListener("input", (e) => { _lab.note = e.target.value; });
    document.getElementById("wfm-lab-chain-image")?.addEventListener("change", (e) => { _lab.chainImage = e.target.checked; });
    document.getElementById("wfm-lab-save-index-on-run")?.addEventListener("change", (e) => { _lab.saveIndexOnRun = e.target.checked; });

    document.getElementById("wfm-lab-run-btn")?.addEventListener("click", () => _runLabBatch());
    document.getElementById("wfm-lab-cancel-btn")?.addEventListener("click", async () => {
        _aborted = true;
        _paused = false;
        if (_resumeResolve) { _resumeResolve(); _resumeResolve = null; }
        await comfyUI.interrupt();
        showToast(t("interrupted"), "info");
    });
    document.getElementById("wfm-lab-pause-btn")?.addEventListener("click", (e) => {
        _paused = !_paused;
        e.target.textContent = _paused ? t("labResume") : t("labPause");
        if (!_paused && _resumeResolve) { _resumeResolve(); _resumeResolve = null; }
    });
}

function _initPlanButtons() {
    document.getElementById("wfm-lab-plan-save-btn")?.addEventListener("click", () => _savePlan());
    document.getElementById("wfm-lab-plan-saveas-btn")?.addEventListener("click", () => _savePlan(null, true));
    document.getElementById("wfm-lab-plan-clear-btn")?.addEventListener("click", () => _clearPlan());
    document.getElementById("wfm-lab-plan-workflow-load-btn")?.addEventListener("click", () => _loadPlanWorkflow());
}

// ============================================
// Column keyframes: render / add / remove / edit
// ============================================

function _initColumnButtons() {
    document.querySelectorAll(".wfm-lab-col-add").forEach((btn) => {
        btn.addEventListener("click", () => {
            const col = btn.dataset.col;
            const kfs = _lab.columns[col];
            const lastIter = kfs[kfs.length - 1].atIteration;
            if (lastIter >= _lab.batchCount) {
                showToast(t("labBatchCountTooSmall"), "error");
                return;
            }
            kfs.push({ atIteration: lastIter + 1, value: _defaultValueFor(col), revertToBase: false, bypassed: false });
            _renderColumn(col);
            _openCellModal(col, kfs.length - 1);
        });
    });
    document.querySelectorAll(".wfm-lab-col-remove").forEach((btn) => {
        btn.addEventListener("click", () => {
            const col = btn.dataset.col;
            const kfs = _lab.columns[col];
            if (kfs.length <= 1) return; // Row 1 (baseline) cannot be removed
            kfs.pop();
            _renderColumn(col);
        });
    });
}

// Wires the Model column header's C/L/V buttons — switches which single field its cells
// summarize (see _modelViewMode) and re-renders just that column. Purely a display
// filter: the underlying keyframe data (all three fields) is untouched either way.
function _initModelViewToggle() {
    document.querySelectorAll(".wfm-lab-model-view-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            _modelViewMode = btn.dataset.view;
            document.querySelectorAll(".wfm-lab-model-view-btn").forEach((b) => b.classList.toggle("active", b === btn));
            _renderColumn("model");
        });
    });
}

function _renderAllColumns() {
    COLUMN_KEYS.forEach(_renderColumn);
}

function _renderColumn(col) {
    const container = document.getElementById(`wfm-lab-col-cells-${col}`);
    if (!container) return;
    if (col === "model") _updateModelViewHighlight();
    const keyframes = _lab.columns[col];
    container.innerHTML = keyframes.map((kf, idx) => _cellHtml(col, kf, idx)).join("");
    container.querySelectorAll(".wfm-lab-cell").forEach((el) => {
        el.addEventListener("click", () => _openCellModal(col, parseInt(el.dataset.idx, 10)));
    });
}

// Colors the header's C/L/V buttons the same "this node type actually exists in the
// loaded workflow" highlight GenerateUI's Model tab uses (wfm-model-label-active,
// colored via settings-tab.js applyModelTabActiveColor) — independent of which one is
// currently selected/active. Re-run on every model column render so it stays in sync
// with whatever's loaded (initial render, keyframe edits, toggle clicks, plan load/
// apply, and refreshLabLiveDefaults() when switching into the Lab subtab).
function _updateModelViewHighlight() {
    const analysis = comfyUI.currentAnalysis;
    const hasCheckpoint = (analysis?.checkpoint_nodes?.length || 0) > 0;
    const hasLora = (analysis?.lora_nodes?.length || 0) > 0;
    const hasVae = (analysis?.vae_nodes?.length || 0) > 0;
    document.querySelector('.wfm-lab-model-view-btn[data-view="checkpoint"]')?.classList.toggle("wfm-model-label-active", hasCheckpoint);
    document.querySelector('.wfm-lab-model-view-btn[data-view="lora"]')?.classList.toggle("wfm-model-label-active", hasLora);
    document.querySelector('.wfm-lab-model-view-btn[data-view="vae"]')?.classList.toggle("wfm-model-label-active", hasVae);
}

function _cellHtml(col, kf, idx) {
    const revertClass = kf.revertToBase ? " wfm-lab-cell-revert" : "";
    const bypassClass = kf.bypassed ? " wfm-lab-cell-bypassed" : "";
    if (idx === 0) {
        // Bypassed takes priority over the live-reflect display — an explicit "skip this
        // row" toggle shouldn't be masked by Setting 1's usual "show the workflow's
        // current value" behavior (see _isLiveDisplay).
        const live = !kf.bypassed && _isLiveDisplay(col, idx);
        const liveClass = live ? " wfm-lab-cell-live" : "";
        const label = live ? _cellLabel(col, { value: _liveValueFor(col), revertToBase: false, bypassed: false }) : _cellLabel(col, kf);
        return `<div class="wfm-lab-cell${revertClass}${bypassClass}${liveClass}" data-idx="${idx}">
            <span class="wfm-lab-cell-index">${kf.atIteration}:</span>
            <span class="wfm-lab-cell-value">${label}</span>
        </div>`;
    }
    // Iteration #2 and beyond: value on its own line, applied-at iteration below it
    return `<div class="wfm-lab-cell${revertClass}${bypassClass}" data-idx="${idx}">
        <div class="wfm-lab-cell-value">${_cellLabel(col, kf)}</div>
        <div class="wfm-lab-cell-applied">${t("labAppliedAt", kf.atIteration)}</div>
    </div>`;
}

function _cellLabel(col, kf) {
    if (kf.bypassed) return t("labBypassed");
    if (kf.revertToBase) return t("labRevertToBase");
    if (col === "model") {
        // The header's C/L/V toggle (_modelViewMode) picks which single field this cell
        // summarizes. Real keyframes (atIteration set) resolve the field's inherited/
        // effective value via _resolveModelKeyframe — e.g. a keyframe that only touches
        // LoRA still shows whatever Checkpoint is actually in effect when viewing "C",
        // not a blank. The synthetic live-preview object built for keyframe #1 (no
        // atIteration) already IS that resolved value, so it's used as-is.
        const resolved = (kf.atIteration != null) ? _resolveModelKeyframe(kf.atIteration) : _normalizeModelValue(kf.value);
        let display = "";
        if (_modelViewMode === "checkpoint") display = resolved.checkpoint;
        else if (_modelViewMode === "vae") display = resolved.vae;
        else if (_modelViewMode === "lora" && resolved.lora.name) display = `${resolved.lora.name} (${resolved.lora.strengthModel}/${resolved.lora.strengthClip})`;
        return display ? escapeHtml(display) : t("labUseWorkflowDefault");
    }
    if (col === "prompt") {
        const p = kf.value?.positive || "";
        const n = kf.value?.negative || "";
        if (!p && !n) return t("labUseWorkflowDefault");
        return `<span class="wfm-lab-cell-prompt-line">P: ${escapeHtml(p)}</span><span class="wfm-lab-cell-prompt-line">N: ${escapeHtml(n)}</span>`;
    }
    if (col === "ksampler") {
        const v = kf.value || {};
        if (v.steps == null && v.cfg == null && v.denoise == null) return t("labUseWorkflowDefault");
        const parts = [];
        if (v.steps != null) parts.push(`Step${v.steps}`);
        if (v.cfg != null) parts.push(`CFG${v.cfg}`);
        if (v.denoise != null) parts.push(`Denoise${v.denoise}`);
        return escapeHtml(parts.join(" / "));
    }
    return "";
}

function _isEmptyValue(col, value) {
    if (col === "model") {
        const v = _normalizeModelValue(value);
        return !v.checkpoint && !v.lora.name && !v.vae;
    }
    if (col === "prompt") return !value || (!value.positive && !value.negative);
    if (col === "ksampler") {
        return !value || (value.steps == null && value.cfg == null && value.denoise == null &&
            !value.sampler_name && !value.scheduler && value.seed == null);
    }
    return true;
}

// Reads the currently loaded GenerateUI workflow's live setting for a column. Used so
// Setting 1 (the baseline keyframe, idx 0) visibly "keeps the workflow's setting" —
// both in its grid cell and pre-filled into its modal — for as long as the user hasn't
// explicitly saved an override on it. Returns null when nothing is loaded or the
// workflow has no matching node, in which case callers fall back to the plain
// "(workflow default)" placeholder as before.
function _liveValueFor(col) {
    const analysis = comfyUI.currentAnalysis;
    if (!analysis) return null;
    if (col === "model") {
        const ckpt = analysis.checkpoint_nodes?.[0]?.ckpt_name || "";
        const vae = analysis.vae_nodes?.[0]?.vae_name || "";
        // LoRA is intentionally left out of the live-reflected value — there's no safe
        // way to pick "the" active LoRA back out of a workflow node to prefill with.
        if (!ckpt && !vae) return null;
        return { checkpoint: ckpt, lora: { name: "", strengthModel: 1.0, strengthClip: 1.0 }, vae };
    }
    if (col === "prompt") {
        const posNode = analysis.prompt_nodes?.find((n) => n.role === "positive");
        const negNode = analysis.prompt_nodes?.find((n) => n.role === "negative");
        if (!posNode && !negNode) return null;
        return { positive: posNode?.text || "", negative: negNode?.text || "", styleApplied: false, styleName: "" };
    }
    if (col === "ksampler") {
        const s = analysis.sampler_nodes?.[0];
        if (!s) return null;
        return {
            steps: s.steps ?? null, cfg: s.cfg ?? null,
            sampler_name: s.sampler_name || "", scheduler: s.scheduler || "",
            denoise: s.denoise ?? null, seed: s.seed ?? null,
        };
    }
    return null;
}

// True when a column/keyframe is currently showing the live GenerateUI value instead of
// its own stored value — i.e. Setting 1, never explicitly overridden, with a workflow
// actually loaded. Once the user saves an edit on it (even re-saving the same live
// values), _isEmptyValue(col, kf.value) becomes false and this permanently stops
// applying — the cell/modal switch to showing that saved override instead.
function _isLiveDisplay(col, idx) {
    if (idx !== 0) return false;
    const kf = _lab.columns[col][0];
    if (kf.bypassed || !_isEmptyValue(col, kf.value)) return false;
    return _liveValueFor(col) != null;
}

// Resolves what a keyframe should actually display/prefill with: its own stored value,
// or — for a live-displaying Setting 1 — the current GenerateUI value in its place.
function _effectiveDisplayValue(col, idx) {
    if (_isLiveDisplay(col, idx)) return _liveValueFor(col);
    return _lab.columns[col][idx]?.value;
}

function _openCellModal(col, idx) {
    const kf = _lab.columns[col][idx];
    const isFirst = idx === 0;
    const live = _isLiveDisplay(col, idx);
    const effectiveValue = live ? _liveValueFor(col) : kf.value;
    const hasPrevious = col === "prompt" && idx > 0;

    let valueFieldsHtml = "";
    if (col === "model") {
        // Shows ONLY the field matching the column header's C/L/V toggle (_modelViewMode)
        // — no in-modal tab switcher — so what's open in the modal always matches what the
        // cell/header are currently showing. To edit a different field, switch the header
        // toggle first, then reopen the cell; Save only touches the field being shown here
        // (see the save handler below), leaving the other two exactly as already stored.
        const v = _normalizeModelValue(effectiveValue);
        // What this row would inherit for the shown field if left blank (everything up to,
        // but not including, this keyframe's own atIteration) — shown as the blank option's
        // label so it's clear leaving it untouched still carries a value forward, rather
        // than resetting to the workflow's own default. Only meaningful past #1.
        const inherited = isFirst ? null : _resolveModelKeyframe(kf.atIteration - 1);
        const selectFieldHtml = (idPrefix, options, currentVal, inheritedVal) => `
            <div class="wfm-search-wrap" style="width:100%;">
                <input type="text" id="wfm-lab-modal-${idPrefix}-filter" class="wfm-input wfm-search-input" placeholder="Filter...">
                <button type="button" class="wfm-search-clear-btn" id="wfm-lab-modal-${idPrefix}-filter-clear" title="Clear search">✕</button>
            </div>
            <select id="wfm-lab-modal-${idPrefix}-select" class="wfm-select">
                <option value="">${escapeHtml(inheritedVal ? t("labInheritsFrom", inheritedVal) : t("labUseWorkflowDefault"))}</option>
                ${options.map((m) => `<option value="${escapeHtml(m)}" ${m === currentVal ? "selected" : ""}>${escapeHtml(m)}</option>`).join("")}
            </select>`;
        if (_modelViewMode === "checkpoint") {
            valueFieldsHtml = `
                <div class="wfm-lab-modal-row">
                    <label>Checkpoint</label>
                    ${selectFieldHtml("ckpt", comfyEditor.models.checkpoints || [], v.checkpoint, inherited?.checkpoint)}
                </div>`;
        } else if (_modelViewMode === "lora") {
            valueFieldsHtml = `
                <div class="wfm-lab-modal-row">
                    <label>LoRA</label>
                    ${selectFieldHtml("lora", comfyEditor.models.loras || [], v.lora.name, inherited?.lora?.name)}
                    <div class="wfm-lora-strength-single" style="margin-top:6px;">
                        <span>M</span>
                        <input type="number" class="wfm-input" id="wfm-lab-modal-lora-strmodel" value="${v.lora.strengthModel}" step="0.05" min="0" max="2">
                        <span>C</span>
                        <input type="number" class="wfm-input" id="wfm-lab-modal-lora-strclip" value="${v.lora.strengthClip}" step="0.05" min="0" max="2">
                    </div>
                </div>`;
        } else if (_modelViewMode === "vae") {
            valueFieldsHtml = `
                <div class="wfm-lab-modal-row">
                    <label>VAE</label>
                    ${selectFieldHtml("vae", comfyEditor.models.vaes || [], v.vae, inherited?.vae)}
                </div>`;
        }
    } else if (col === "prompt") {
        const v = effectiveValue || {};
        valueFieldsHtml = `
            <div class="wfm-lab-modal-btnrow">
                <button type="button" id="wfm-lab-modal-get-genui" class="wfm-btn wfm-btn-sm">${t("labGetFromGenUI")}</button>
                <button type="button" id="wfm-lab-modal-get-image" class="wfm-btn wfm-btn-sm">${t("labGetFromImage")}</button>
                ${hasPrevious ? `<button type="button" id="wfm-lab-modal-get-previous" class="wfm-btn wfm-btn-sm">${t("labGetFromPrevious")}</button>` : ""}
                <button type="button" id="wfm-lab-modal-clear" class="wfm-btn wfm-btn-sm">${t("labClearPrompt")}</button>
            </div>
            <div class="wfm-lab-modal-row">
                <label>Positive</label>
                <textarea id="wfm-lab-modal-positive" class="wfm-input" rows="3">${escapeHtml(v.positive || "")}</textarea>
            </div>
            <div class="wfm-lab-modal-row">
                <label>Negative</label>
                <textarea id="wfm-lab-modal-negative" class="wfm-input" rows="3">${escapeHtml(v.negative || "")}</textarea>
            </div>
            <div class="wfm-lab-modal-checkbox">
                <input type="checkbox" id="wfm-lab-modal-style-toggle" ${v.styleApplied ? "checked" : ""}>
                <label for="wfm-lab-modal-style-toggle">${t("labStyle")}</label>
                <button type="button" id="wfm-lab-modal-style-apply" class="wfm-btn wfm-btn-sm">${t("labApply")}</button>
                <span id="wfm-lab-modal-style-name" style="color:var(--wfm-text-secondary);">${v.styleApplied && v.styleName ? escapeHtml(v.styleName) : ""}</span>
            </div>`;
    } else if (col === "ksampler") {
        const v = effectiveValue || {};
        const samplers = comfyEditor.models.samplers || [];
        const schedulers = comfyEditor.models.schedulers || [];
        valueFieldsHtml = `
            <div class="wfm-lab-modal-inline">
                <div><label>Steps</label><input type="number" id="wfm-lab-modal-steps" class="wfm-input" value="${v.steps ?? ""}"></div>
                <div><label>CFG</label><input type="number" step="0.1" id="wfm-lab-modal-cfg" class="wfm-input" value="${v.cfg ?? ""}"></div>
                <div><label>Denoise</label><input type="number" step="0.01" min="0" max="1" id="wfm-lab-modal-denoise" class="wfm-input" value="${v.denoise ?? ""}"></div>
            </div>
            <div class="wfm-lab-modal-inline">
                <div><label>Sampler</label>
                    <select id="wfm-lab-modal-sampler" class="wfm-select">
                        <option value="">${t("labUseWorkflowDefault")}</option>
                        ${samplers.map((s) => `<option value="${escapeHtml(s)}" ${s === v.sampler_name ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
                    </select>
                </div>
                <div><label>Scheduler</label>
                    <select id="wfm-lab-modal-scheduler" class="wfm-select">
                        <option value="">${t("labUseWorkflowDefault")}</option>
                        ${schedulers.map((s) => `<option value="${escapeHtml(s)}" ${s === v.scheduler ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
                    </select>
                </div>
            </div>
            <div class="wfm-lab-modal-row">
                <label>${t("labSeedEmptyRandom")}</label>
                <input type="number" id="wfm-lab-modal-seed" class="wfm-input" value="${v.seed ?? ""}">
            </div>`;
    }

    const atIterRow = isFirst ? "" : `
        <div class="wfm-lab-modal-row">
            <label>${t("labApplyFromIteration")}</label>
            <input type="number" id="wfm-lab-modal-iter" class="wfm-input" value="${kf.atIteration}" min="2" max="${_lab.batchCount}">
        </div>`;

    const revertRow = isFirst ? "" : `
        <div class="wfm-lab-modal-checkbox">
            <input type="checkbox" id="wfm-lab-modal-revert" ${kf.revertToBase ? "checked" : ""}>
            <label for="wfm-lab-modal-revert">${t("labRevertCheckboxLabel")}</label>
        </div>`;

    // Bypass is available on every row, including Setting 1: skip this keyframe's
    // override entirely (as if the row didn't exist) so whatever was active before it
    // keeps running — see _resolveKeyframe. Lab-internal only; never touches the actual
    // ComfyUI node's mode.
    const bypassRow = `
        <div class="wfm-lab-modal-checkbox">
            <input type="checkbox" id="wfm-lab-modal-bypass" ${kf.bypassed ? "checked" : ""}>
            <label for="wfm-lab-modal-bypass">${t("labBypassCheckboxLabel")}</label>
        </div>`;

    const deleteBtn = !isFirst
        ? `<button id="wfm-lab-modal-delete" class="wfm-btn wfm-btn-danger">${t("delete")}</button>` : "";

    const liveHint = live ? `<p class="wfm-lab-modal-hint">${t("labLiveHint")}</p>` : "";

    const html = `
        ${liveHint}
        <div id="wfm-lab-modal-fields">${valueFieldsHtml}</div>
        ${atIterRow}
        ${bypassRow}
        ${revertRow}
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">
            ${deleteBtn}
            <button id="wfm-lab-modal-save" class="wfm-btn wfm-btn-primary">${t("save")}</button>
        </div>`;
    openModal(`${col} #${idx + 1}`, html);
    if (col === "prompt") _wireLabPromptModalExtras(idx);
    if (col === "model") _wireLabModelFieldFilter();

    // Bypass disables everything else on the modal (value fields AND the Revert
    // checkbox) — the two are mutually exclusive since bypass already means "ignore
    // this row", making a simultaneous revertToBase moot.
    const revertCb = document.getElementById("wfm-lab-modal-revert");
    const bypassCb = document.getElementById("wfm-lab-modal-bypass");
    const fieldsWrap = document.getElementById("wfm-lab-modal-fields");
    const revertRowEl = revertCb?.closest(".wfm-lab-modal-checkbox");
    const syncDisabled = () => {
        const bypassed = !!bypassCb?.checked;
        const fieldsDisabled = bypassed || !!revertCb?.checked;
        if (fieldsWrap) fieldsWrap.style.opacity = fieldsDisabled ? "0.4" : "1";
        fieldsWrap?.querySelectorAll("input,select,textarea").forEach((el) => { el.disabled = fieldsDisabled; });
        if (revertCb) revertCb.disabled = bypassed;
        if (revertRowEl) revertRowEl.style.opacity = bypassed ? "0.4" : "1";
    };
    revertCb?.addEventListener("change", syncDisabled);
    bypassCb?.addEventListener("change", syncDisabled);
    syncDisabled();

    document.getElementById("wfm-lab-modal-delete")?.addEventListener("click", () => {
        _lab.columns[col].splice(idx, 1);
        _renderColumn(col);
        closeModal();
    });

    document.getElementById("wfm-lab-modal-save")?.addEventListener("click", () => {
        const revert = !!document.getElementById("wfm-lab-modal-revert")?.checked;
        const bypassed = !!document.getElementById("wfm-lab-modal-bypass")?.checked;
        let atIteration = kf.atIteration;
        if (!isFirst) {
            const parsed = parseInt(document.getElementById("wfm-lab-modal-iter")?.value, 10);
            if (!isNaN(parsed)) atIteration = Math.min(Math.max(parsed, 2), _lab.batchCount);
        }

        let value = kf.value;
        if (!revert && !bypassed) {
            if (col === "model") {
                // Only the field the modal actually shows (_modelViewMode) gets updated —
                // the other two are carried over from this row's own currently-saved
                // value untouched, since their fields aren't in the DOM to read from.
                const next = _normalizeModelValue(kf.value);
                if (_modelViewMode === "checkpoint") {
                    next.checkpoint = document.getElementById("wfm-lab-modal-ckpt-select")?.value || "";
                } else if (_modelViewMode === "lora") {
                    next.lora = {
                        name: document.getElementById("wfm-lab-modal-lora-select")?.value || "",
                        strengthModel: parseFloat(document.getElementById("wfm-lab-modal-lora-strmodel")?.value) || 1.0,
                        strengthClip: parseFloat(document.getElementById("wfm-lab-modal-lora-strclip")?.value) || 1.0,
                    };
                } else if (_modelViewMode === "vae") {
                    next.vae = document.getElementById("wfm-lab-modal-vae-select")?.value || "";
                }
                value = next;
            } else if (col === "prompt") {
                value = {
                    positive: document.getElementById("wfm-lab-modal-positive")?.value || "",
                    negative: document.getElementById("wfm-lab-modal-negative")?.value || "",
                    styleApplied: !!document.getElementById("wfm-lab-modal-style-toggle")?.checked,
                    styleName: document.getElementById("wfm-lab-modal-style-name")?.textContent || "",
                };
            } else if (col === "ksampler") {
                const numOrNull = (id) => {
                    const raw = document.getElementById(id)?.value;
                    return (raw === "" || raw == null) ? null : Number(raw);
                };
                value = {
                    steps: numOrNull("wfm-lab-modal-steps"),
                    cfg: numOrNull("wfm-lab-modal-cfg"),
                    denoise: numOrNull("wfm-lab-modal-denoise"),
                    sampler_name: document.getElementById("wfm-lab-modal-sampler")?.value || "",
                    scheduler: document.getElementById("wfm-lab-modal-scheduler")?.value || "",
                    seed: numOrNull("wfm-lab-modal-seed"),
                };
            }
        }

        _lab.columns[col][idx] = { atIteration, value, revertToBase: revert, bypassed };
        _lab.columns[col].sort((a, b) => a.atIteration - b.atIteration);
        _renderColumn(col);
        closeModal();
    });
}

// Merges a style ({prompt, negative_prompt}, from Workflow-Studio/style/*.json) into
// plain positive/negative text. Unlike generate-tab.js's _applyNamedStyle() (which
// substitutes a {prompt} placeholder into the style template for the main Generate
// flow), Lab always appends: existing text is never cleared or reordered, the style's
// text is just added after a comma (or used as-is if the field was empty).
function _applyStyleToText(positive, negative, style) {
    const append = (existing, addition) => {
        if (!addition) return existing;
        return existing ? `${existing}, ${addition}` : addition;
    };
    return {
        positive: append(positive, style.prompt),
        negative: append(negative, style.negative_prompt),
    };
}

// Wires the filter box above whichever single field the Model-column modal is
// currently showing (_modelViewMode picks which one exists in the DOM — the other two
// calls below are harmless no-ops since their elements aren't present). Same filter
// behavior as GenerateUI's Model tab filter inputs (comfyui-editor.js renderModelTab).
function _wireLabModelFieldFilter() {
    const wireFilter = (idPrefix, modelsKey) => {
        const filterInput = document.getElementById(`wfm-lab-modal-${idPrefix}-filter`);
        const select = document.getElementById(`wfm-lab-modal-${idPrefix}-select`);
        if (!filterInput || !select) return;
        const options = comfyEditor.models[modelsKey] || [];
        const applyFilter = () => {
            const filter = filterInput.value.toLowerCase();
            select.innerHTML = `<option value="">${t("labUseWorkflowDefault")}</option>` +
                options.filter((m) => m.toLowerCase().includes(filter))
                    .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
        };
        filterInput.addEventListener("input", applyFilter);
        setupSearchClearBtn(filterInput.id, `${filterInput.id}-clear`, applyFilter);
    };
    wireFilter("ckpt", "checkpoints");
    wireFilter("lora", "loras");
    wireFilter("vae", "vaes");
}

// Wires the Prompt-column modal's extra actions: fetch the live GenerateUI prompt,
// extract a prompt from a dropped image/workflow file, copy the previous keyframe's
// prompt, clear the fields, and apply/toggle a saved Style. idx is this keyframe's own
// position in _lab.columns.prompt (needed for the "Get from Previous" lookup).
function _wireLabPromptModalExtras(idx) {
    document.getElementById("wfm-lab-modal-clear")?.addEventListener("click", () => {
        const posEl = document.getElementById("wfm-lab-modal-positive");
        const negEl = document.getElementById("wfm-lab-modal-negative");
        if (posEl) posEl.value = "";
        if (negEl) negEl.value = "";
        showToast(t("labPromptCleared"), "success");
    });

    // Copies BOTH positive and negative from the keyframe immediately before this one
    // (idx - 1) in the same column — e.g. editing #3 copies #2's prompt wholesale. If #2
    // is itself the unedited Setting 1, this naturally picks up its live GenerateUI value
    // via _effectiveDisplayValue() rather than an empty string.
    document.getElementById("wfm-lab-modal-get-previous")?.addEventListener("click", () => {
        if (idx <= 0) return;
        const prev = _effectiveDisplayValue("prompt", idx - 1) || {};
        const posEl = document.getElementById("wfm-lab-modal-positive");
        const negEl = document.getElementById("wfm-lab-modal-negative");
        if (posEl) posEl.value = prev.positive || "";
        if (negEl) negEl.value = prev.negative || "";
        showToast(t("labPromptCopiedFromPrevious"), "success");
    });

    // Style NAME always comes from the dropdown already at the top of the GenerateUI
    // toolbar (populated by generate-tab.js's _loadStyles()) — Lab has no picker of its
    // own. The Apply button merges it into the text below (independent of the top
    // toolbar's own enable checkbox); the checkbox only tracks on/off state and shows/
    // clears the applied name — it never merges text by itself.
    const styleToggle = document.getElementById("wfm-lab-modal-style-toggle");
    const styleApplyBtn = document.getElementById("wfm-lab-modal-style-apply");
    const styleNameEl = document.getElementById("wfm-lab-modal-style-name");

    styleToggle?.addEventListener("change", () => {
        if (!styleToggle.checked && styleNameEl) styleNameEl.textContent = "";
    });

    styleApplyBtn?.addEventListener("click", async () => {
        const styleName = document.getElementById("wfm-style-select")?.value;
        if (!styleName) {
            showToast(t("labEnableStyleFirst"), "error");
            return;
        }
        let styles = [];
        try {
            const res = await fetch("/api/wfm/styles");
            styles = res.ok ? await res.json() : [];
        } catch { styles = []; }
        const style = styles.find((s) => s.name === styleName);
        if (!style) {
            showToast(t("labNoStyles"), "error");
            return;
        }

        const posEl = document.getElementById("wfm-lab-modal-positive");
        const negEl = document.getElementById("wfm-lab-modal-negative");
        const merged = _applyStyleToText(posEl?.value || "", negEl?.value || "", style);
        if (posEl) posEl.value = merged.positive;
        if (negEl) negEl.value = merged.negative;
        if (styleToggle) styleToggle.checked = true;
        if (styleNameEl) styleNameEl.textContent = styleName;
        showToast(t("labStyleApplied"), "success");
    });

    document.getElementById("wfm-lab-modal-get-genui")?.addEventListener("click", () => {
        const analysis = comfyUI.currentAnalysis;
        if (!analysis) { showToast(t("labNoWorkflowLoaded"), "error"); return; }
        const posNode = analysis.prompt_nodes?.find((n) => n.role === "positive");
        const negNode = analysis.prompt_nodes?.find((n) => n.role === "negative");
        const posEl = document.getElementById("wfm-lab-modal-positive");
        const negEl = document.getElementById("wfm-lab-modal-negative");
        if (posEl) posEl.value = posNode?.text ?? "";
        if (negEl) negEl.value = negNode?.text ?? "";
        showToast(t("labPromptFetched"), "success");
    });

    // Reads metadata from the image already loaded in Lab's own Image drop zone
    // (_lab.sourceImageFilename, already uploaded to ComfyUI's input folder) rather
    // than asking the user to pick a separate file.
    document.getElementById("wfm-lab-modal-get-image")?.addEventListener("click", async () => {
        if (!_lab.sourceImageFilename) {
            showToast(t("labNoSourceImage"), "error");
            return;
        }
        try {
            const res = await fetch(`/view?filename=${encodeURIComponent(_lab.sourceImageFilename)}&type=input`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const file = new File([blob], _lab.sourceImageFilename, { type: blob.type || "image/png" });

            const meta = await extractAllMetadata(file);
            if (!meta || (!meta.positives?.length && !meta.negatives?.length)) {
                showToast(t("labNoPromptInImage"), "error");
                return;
            }
            const posEl = document.getElementById("wfm-lab-modal-positive");
            const negEl = document.getElementById("wfm-lab-modal-negative");
            if (posEl && meta.positives?.[0]) posEl.value = meta.positives[0];
            if (negEl && meta.negatives?.[0]) negEl.value = meta.negatives[0];
            showToast(t("labPromptFetched"), "success");
        } catch (err) {
            showToast(`${t("labMetadataExtractFailed")}: ${err.message}`, "error");
        }
    });
}

// ============================================
// Effective-value resolution & workflow build
// ============================================

// A bypassed keyframe is skipped entirely when picking which row is "in effect" for a
// given iteration — as if it weren't there — so whatever was active before it (an
// earlier keyframe, or ultimately nothing) just keeps running. This only affects
// which row *applies*; the bypassed row's own value/atIteration stay untouched so
// un-bypassing it later restores it exactly as configured.
function _resolveKeyframe(col, iteration) {
    const kfs = _lab.columns[col];
    let applicable = null;
    for (const kf of kfs) {
        if (kf.atIteration > iteration) break;
        if (!kf.bypassed) applicable = kf;
    }
    if (!applicable) return null;
    if (applicable.revertToBase) {
        const row1 = kfs.find((k) => k.atIteration === 1);
        return (row1 && !row1.bypassed && !_isEmptyValue(col, row1.value)) ? row1.value : null;
    }
    return _isEmptyValue(col, applicable.value) ? null : applicable.value;
}

// Unlike _resolveKeyframe (which swaps in one keyframe's whole value), the Model column
// bundles three independent settings — Checkpoint/LoRA/VAE — into a single row, so a
// keyframe that only sets a LoRA must NOT blank out a Checkpoint/VAE chosen by an earlier
// keyframe. This resolves each of the three fields separately: walking keyframes up to
// `iteration` in order, each field keeps whatever value it last saw set (non-empty),
// carrying forward across keyframes that leave it blank. A `revertToBase` keyframe resets
// all three fields at once to iteration #1's row (mirrors _resolveKeyframe's revert
// semantics) rather than being treated as a per-field value of its own. Bypassed keyframes
// are skipped entirely, as elsewhere.
function _resolveModelKeyframe(iteration) {
    const kfs = _lab.columns.model;
    const row1 = kfs.find((k) => k.atIteration === 1);
    const row1Value = (row1 && !row1.bypassed) ? _normalizeModelValue(row1.value) : null;

    let current = _defaultValueFor("model");
    for (const kf of kfs) {
        if (kf.atIteration > iteration) break;
        if (kf.bypassed) continue;
        if (kf.revertToBase) {
            current = row1Value ? _normalizeModelValue(row1Value) : _defaultValueFor("model");
            continue;
        }
        const v = _normalizeModelValue(kf.value);
        if (v.checkpoint) current.checkpoint = v.checkpoint;
        if (v.lora.name) current.lora = { ...v.lora };
        if (v.vae) current.vae = v.vae;
    }
    return current;
}

function _buildWorkflowForIteration(iteration, chainImageRef) {
    const wf = JSON.parse(JSON.stringify(comfyUI.currentWorkflow || {}));
    const analysis = comfyUI.currentAnalysis;
    if (!analysis) return { workflow: wf, seed: null };

    const write = (nodeId, key, val) => {
        if (nodeId != null && wf[nodeId]) wf[nodeId].inputs[key] = val;
    };

    const model = _resolveModelKeyframe(iteration);
    if (model.checkpoint && analysis.checkpoint_nodes?.[0]) {
        write(analysis.checkpoint_nodes[0].id, "ckpt_name", model.checkpoint);
    }

    if (model.vae) {
        const vaeNode = analysis.vae_nodes?.[0];
        if (vaeNode && wf[vaeNode.id]) {
            write(vaeNode.id, "vae_name", model.vae);
        } else {
            // Workflow has no standalone VAELoader node (VAE baked into the checkpoint) —
            // inject one and repoint every "vae" input link at it so the override actually applies.
            const newId = String(Math.max(0, ...Object.keys(wf).map(Number)) + 1);
            wf[newId] = { class_type: "VAELoader", inputs: { vae_name: model.vae }, _meta: { title: "VAE Loader" } };
            for (const node of Object.values(wf)) {
                if (Array.isArray(node?.inputs?.vae)) node.inputs.vae = [newId, 0];
            }
        }
    }

    if (model.lora.name) {
        _applyLabLoraToWorkflow(wf, analysis, model.lora);
    }

    const prompt = _resolveKeyframe("prompt", iteration);
    if (prompt) {
        const posNode = analysis.prompt_nodes?.find((n) => n.role === "positive");
        const negNode = analysis.prompt_nodes?.find((n) => n.role === "negative");
        if (posNode && prompt.positive) write(posNode.id, posNode.textKey || "text", prompt.positive);
        if (negNode && prompt.negative) write(negNode.id, negNode.textKey || "text", prompt.negative);
    }

    let seed = null;
    const ks = _resolveKeyframe("ksampler", iteration);
    const sampler = analysis.sampler_nodes?.[0];
    if (ks && sampler) {
        if (ks.steps != null) write(sampler.stepsNodeId ?? sampler.id, "steps", ks.steps);
        if (ks.cfg != null) write(sampler.cfgNodeId ?? sampler.id, "cfg", ks.cfg);
        if (ks.sampler_name) write(sampler.samplerNodeId ?? sampler.id, "sampler_name", ks.sampler_name);
        if (ks.scheduler && sampler.schedulerNodeId) write(sampler.schedulerNodeId, "scheduler", ks.scheduler);
        if (ks.denoise != null && sampler.denoiseNodeId) write(sampler.denoiseNodeId, "denoise", ks.denoise);
        if (ks.seed != null) seed = ks.seed;
    }

    const imageRef = _lab.t2iMode ? null : (chainImageRef || _lab.sourceImageFilename);
    if (imageRef && analysis.load_image_nodes?.[0]) {
        write(analysis.load_image_nodes[0].id, "image", imageRef);
    }

    return { workflow: wf, seed };
}

// True once a "no LoRA node in this workflow" warning has already been shown during the
// current Run — reset at the start of _runLabBatch so the toast fires at most once per
// run instead of once per iteration.
let _labLoraWarned = false;

// Applies a Lab-configured LoRA (Single only — no Stack support here) to the given
// per-iteration workflow clone. Mirrors models-tab.js's applyToGenUI LoRA branch: prefer
// analysis.lora_nodes[0] (correctly picks up "Lora Loader (LoraManager)" nodes via
// is_lora_manager), else fall back to any node with a lora_name input. If the workflow
// has no LoRA node at all, this warns once and does nothing — unlike VAE above, Lab does
// NOT auto-inject a LoraLoader node, since that would require rewiring model/clip links
// between the checkpoint and every downstream consumer, not just overwriting one input.
function _applyLabLoraToWorkflow(wf, analysis, lora) {
    let nodeId = analysis.lora_nodes?.[0]?.id;
    let isLoraManager = !!analysis.lora_nodes?.[0]?.is_lora_manager;
    if (nodeId == null) {
        nodeId = Object.keys(wf).find((id) => wf[id]?.inputs && "lora_name" in wf[id].inputs);
        isLoraManager = false;
    }

    if (nodeId == null || !wf[nodeId]) {
        if (!_labLoraWarned) {
            _labLoraWarned = true;
            showToast(t("labLoraNoNode"), "warning");
        }
        return;
    }

    const strModel = lora.strengthModel ?? 1.0;
    const strClip = lora.strengthClip ?? 1.0;
    if (isLoraManager) {
        const stem = lora.name.replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");
        wf[nodeId].inputs.loras = {
            __value__: [{ name: stem, strength: strModel, active: true, expanded: false, clipStrength: strClip, locked: false }],
        };
        wf[nodeId].inputs.text = `<lora:${stem}:${strModel}:${strClip}>`;
    } else {
        wf[nodeId].inputs.lora_name = comfyEditor.resolveLoraName(lora.name);
        wf[nodeId].inputs.strength_model = strModel;
        wf[nodeId].inputs.strength_clip = strClip;
    }
}

// ComfyUI's LoadImage accepts "name [type]" (optionally "subfolder/name [type]") to
// reference a previously generated output/temp image without re-uploading it.
function _annotatedImageRef(img) {
    const rel = img.subfolder ? `${img.subfolder}/${img.filename}` : img.filename;
    return `${rel} [${img.type || "output"}]`;
}

// ============================================
// Batch execution
// ============================================

function _waitIfPaused() {
    if (!_paused) return Promise.resolve();
    return new Promise((resolve) => { _resumeResolve = resolve; });
}

function _setRunUiState(running) {
    const runBtn = document.getElementById("wfm-lab-run-btn");
    const cancelBtn = document.getElementById("wfm-lab-cancel-btn");
    const pauseBtn = document.getElementById("wfm-lab-pause-btn");
    if (runBtn) runBtn.style.display = running ? "none" : "";
    if (cancelBtn) cancelBtn.style.display = running ? "" : "none";
    if (pauseBtn) {
        pauseBtn.disabled = !running;
        pauseBtn.textContent = t("labPause");
    }
}

async function _runLabBatch() {
    if (!comfyUI.currentWorkflow || !comfyUI.currentAnalysis) {
        showToast(t("labNoWorkflowLoaded"), "error");
        return;
    }
    if (!_lab.t2iMode && !_lab.sourceImageFilename) {
        showToast(t("labNoSourceImage"), "error");
        return;
    }

    _paused = false;
    _aborted = false;
    _labLoraWarned = false;
    _lastGeneratedImageRef = null;
    _lab.results.images = [];
    _renderResultsGrid();
    _setRunUiState(true);

    const progressBar = document.getElementById("wfm-lab-progress-bar");
    const progressText = document.getElementById("wfm-lab-progress-text");
    const eagleAutoSave = getEagleSettings().autoSave;

    let completed = 0, failed = 0;
    try {
        for (let i = 1; i <= _lab.batchCount; i++) {
            if (_aborted) break;
            await _waitIfPaused();
            if (_aborted) break;

            if (progressText) progressText.textContent = `[${i}/${_lab.batchCount}] ...`;
            const chainRef = (!_lab.t2iMode && _lab.chainImage && i > 1) ? _lastGeneratedImageRef : null;
            const { workflow, seed } = _buildWorkflowForIteration(i, chainRef);
            const workflowExpanded = await _expandWildcardsInWorkflow(workflow);

            try {
                const { images } = await comfyUI.generate(workflowExpanded, {
                    seedMode: seed != null ? "fixed" : "random",
                    seedValue: seed ?? -1,
                    onProgress: (pct) => {
                        if (progressBar) progressBar.style.width = `${(pct * 100).toFixed(1)}%`;
                        if (progressText) progressText.textContent = `[${i}/${_lab.batchCount}] ${(pct * 100).toFixed(0)}%`;
                    },
                });
                const outputImages = images.filter((img) => img.type !== "temp");
                if (outputImages.length > 0) {
                    _lastGeneratedImageRef = _annotatedImageRef(outputImages[0]);
                }
                for (const img of outputImages) {
                    if (_lab.results.images.length < MAX_RESULTS) {
                        _lab.results.images.push({ ...img, iteration: i });
                    }
                    if (eagleAutoSave) {
                        const viewUrl = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${encodeURIComponent(img.type || "output")}`;
                        saveToEagle(viewUrl, img.filename, [], img);
                    }
                }
                _renderResultsGrid();
                completed++;
            } catch (err) {
                if (_aborted) break;
                failed++;
                showToast(t("batchItemFailed", i, _lab.batchCount, err.message), "error");
            }
        }
    } finally {
        _paused = false;
        if (_resumeResolve) { _resumeResolve(); _resumeResolve = null; }
        _setRunUiState(false);
    }

    await _maybeSaveIndexImageOnRun();

    if (progressBar) progressBar.style.width = "100%";
    if (_aborted) {
        showToast(t("batchStopped", completed, failed), "info");
    } else {
        showToast(t("batchComplete", completed, _lab.batchCount, failed), failed > 0 ? "error" : "success");
    }
}

// ============================================
// Results grid
// ============================================

function _resultImageUrl(img) {
    return `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${encodeURIComponent(img.type || "output")}`;
}

function _renderResultsGrid() {
    const grid = document.getElementById("wfm-lab-results-grid");
    if (!grid) return;
    if (_lab.results.images.length === 0) {
        grid.innerHTML = `<p class="wfm-placeholder">${t("labNoResultsYet")}</p>`;
        return;
    }
    grid.innerHTML = _lab.results.images.map((img, i) => `
        <div class="wfm-lab-result-item">
            <span class="wfm-lab-result-index">${img.iteration}</span>
            <img class="wfm-lab-result-thumb" data-idx="${i}" src="${_resultImageUrl(img)}">
        </div>`).join("");
    grid.querySelectorAll(".wfm-lab-result-thumb").forEach((el) => {
        el.addEventListener("click", () => {
            openModal(t("labResultPreview"), `<img src="${el.src}" style="max-width:100%;max-height:80vh;display:block;margin:0 auto;">`);
        });
    });
}

function _updateResultsSourceImage() {
    const img = document.getElementById("wfm-lab-results-source-img");
    const t2iNote = document.getElementById("wfm-lab-results-t2i-note");
    if (!img) return;
    if (!_lab.t2iMode && _lab.sourceImageFilename) {
        img.src = `/view?filename=${encodeURIComponent(_lab.sourceImageFilename)}&type=input`;
        img.style.display = "";
    } else {
        img.style.display = "none";
    }
    if (t2iNote) t2iNote.style.display = _lab.t2iMode ? "" : "none";
}

// Greys out image-related controls that don't apply to a T2I workflow (no
// LoadImage node to feed): the drop zone and the "use generated image for
// next" chain checkbox. Doesn't clear any already-uploaded source image, so
// toggling back to I2I restores prior state.
function _updateT2IModeUI() {
    const t2iEl = document.getElementById("wfm-lab-t2i-mode");
    const dropZone = document.getElementById("wfm-lab-drop-zone");
    const previewWrap = document.getElementById("wfm-lab-preview-wrap");
    const chainEl = document.getElementById("wfm-lab-chain-image");
    if (t2iEl) t2iEl.checked = _lab.t2iMode;
    if (dropZone) dropZone.classList.toggle("wfm-disabled", _lab.t2iMode);
    if (previewWrap && _lab.t2iMode) previewWrap.style.display = "none";
    if (chainEl) chainEl.disabled = _lab.t2iMode;
    _updateResultsSourceImage();
}

// ============================================
// Index (contact-sheet) thumbnail generation
// ============================================

function _loadImageEl(src) {
    return new Promise((resolve) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = src;
    });
}

// planData, when given, is embedded into the resulting PNG as an iTXt chunk
// (LAB_PLAN_PNG_KEY) so the image alone — dropped onto the Plan drop zone, from
// anywhere, not just lab_plan/ — can be loaded back without needing a same-named
// .json alongside it on the server.
async function _buildIndexImageDataUrl(planData) {
    const imgs = _lab.results.images.slice(0, MAX_RESULTS);
    if (imgs.length === 0) return null;

    const cols = Math.min(RESULTS_GRID_COLS, imgs.length);
    const rows = Math.ceil(imgs.length / cols);
    const cellSize = 128;
    const canvas = document.createElement("canvas");
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < imgs.length; i++) {
        const im = await _loadImageEl(_resultImageUrl(imgs[i]));
        if (!im) continue;
        const col = i % cols, row = Math.floor(i / cols);
        const scale = Math.max(cellSize / im.width, cellSize / im.height);
        const w = im.width * scale, h = im.height * scale;
        ctx.drawImage(im, col * cellSize - (w - cellSize) / 2, row * cellSize - (h - cellSize) / 2, w, h);
    }
    const dataUrl = canvas.toDataURL("image/png");
    if (!planData) return dataUrl;
    try {
        return embedPngTextChunk(dataUrl, LAB_PLAN_PNG_KEY, JSON.stringify(planData));
    } catch (err) {
        console.warn("Failed to embed Lab plan metadata into index image:", err);
        return dataUrl;
    }
}

// When "Save index image to Output on Run" is checked, builds the same
// contact-sheet used for Plan files and writes it into ComfyUI's own Output
// folder (auto-numbered, like a normal generated image) — independent of
// Plan Save, which always writes its own copy next to the plan file. Once it
// has a real file in Output, it also feeds it through the same Eagle
// auto-save path as every other Lab-generated image (single global toggle
// in Settings, no separate checkbox here).
async function _maybeSaveIndexImageOnRun() {
    if (!_lab.saveIndexOnRun) return;
    try {
        const name = _lab.planFilename ? _stripLabPlanPrefix(_lab.planFilename.replace(/\.json$/i, "")) : "";
        const dataUrl = await _buildIndexImageDataUrl(_buildPlanData(name));
        if (!dataUrl) return;
        const res = await fetch("/api/wfm/lab/index-image/save-to-output", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_base64: dataUrl }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        showToast(t("labIndexImageSaved", json.filename), "success");

        if (getEagleSettings().autoSave) {
            const viewUrl = `/view?filename=${encodeURIComponent(json.filename)}&subfolder=${encodeURIComponent(json.subfolder || "")}&type=output`;
            saveToEagle(viewUrl, json.filename, [], { filename: json.filename, subfolder: json.subfolder || "", type: "output" });
        }
    } catch (err) {
        showToast(`${t("labIndexImageSaveFailed")}: ${err.message}`, "error");
    }
}

// ============================================
// Plan save / load / clear
// ============================================

// Plan files are always saved with the ws_labplan_ prefix so they're easy to
// spot (and script against) among other files in lab_plan/. Existing plans
// that already carry it are re-saved as-is rather than double-prefixed.
function _stripLabPlanPrefix(base) {
    return base.toLowerCase().startsWith(LAB_PLAN_PREFIX) ? base.slice(LAB_PLAN_PREFIX.length) : base;
}

async function _savePlan(filenameOverride, forceNewName = false) {
    let inputName = filenameOverride;
    if (!inputName) {
        if (forceNewName || !_lab.planFilename) {
            inputName = window.prompt(t("labEnterPlanName"), "");
            if (!inputName) return;
        } else {
            inputName = _lab.planFilename;
        }
    }

    const baseName = _stripLabPlanPrefix(inputName.replace(/\.json$/i, ""));
    const filename = `${LAB_PLAN_PREFIX}${baseName}.json`;
    const data = _buildPlanData(baseName);

    let indexImageBase64 = null;
    try {
        indexImageBase64 = await _buildIndexImageDataUrl(data);
    } catch { /* thumbnail generation is best-effort */ }

    try {
        const res = await fetch("/api/wfm/lab/plans/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, data, index_image_base64: indexImageBase64 }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        _lab.planFilename = json.filename;
        _lab.workflowFilename = data.workflow_filename || null;
        _updatePlanWorkflowUI();
        showToast(t("labPlanSaved"), "success");
    } catch (err) {
        showToast(`${t("labPlanSaveFailed")}: ${err.message}`, "error");
    }
}

function _applyPlanData(filename, data) {
    _lab.planFilename = filename;
    _lab.note = data.note || "";
    _lab.batchCount = data.batch_count || 1;
    _lab.chainImage = !!data.chain_image;
    _lab.t2iMode = !!data.t2i_mode;
    _lab.saveIndexOnRun = !!data.save_index_on_run;
    _lab.sourceImageFilename = data.source_image || null;
    _lab.workflowFilename = data.workflow_filename || null;
    _lab.columns = _migrateLabColumns(data.columns);
    _lab.results = { images: (data.results?.images || []).slice(0, MAX_RESULTS) };
    _updatePlanWorkflowUI();
    _updateT2IModeUI();

    const noteEl = document.getElementById("wfm-lab-note");
    const batchEl = document.getElementById("wfm-lab-batch-count");
    const chainEl = document.getElementById("wfm-lab-chain-image");
    const saveIndexEl = document.getElementById("wfm-lab-save-index-on-run");
    if (noteEl) noteEl.value = _lab.note;
    if (batchEl) batchEl.value = _lab.batchCount;
    if (chainEl) chainEl.checked = _lab.chainImage;
    if (saveIndexEl) saveIndexEl.checked = _lab.saveIndexOnRun;

    const previewWrap = document.getElementById("wfm-lab-preview-wrap");
    const previewImg = document.getElementById("wfm-lab-preview-img");
    if (_lab.sourceImageFilename && previewImg && previewWrap) {
        previewImg.src = `/view?filename=${encodeURIComponent(_lab.sourceImageFilename)}&type=input`;
        previewWrap.style.display = "";
    } else if (previewWrap) {
        previewWrap.style.display = "none";
    }

    _renderAllColumns();
    _renderResultsGrid();
    _updateResultsSourceImage();
    _warnIfKeyframesExceedBatch();
}

// Plan Load reads a dropped/picked .json plan file directly in the browser (no
// server round-trip needed — the browser's native file picker can't be preset to
// open in .../Workflow-Studio/lab_plan, but most browsers remember the folder
// after the user browses there once).
async function _loadPlanFromFile(file) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const filename = file.name.toLowerCase().endsWith(".json") ? file.name : `${file.name}.json`;
        _applyPlanData(filename, data);
        showToast(t("labPlanLoaded"), "success");
    } catch (err) {
        showToast(`${t("labPlanLoadFailed")}: ${err.message}`, "error");
    }
}

// Dropping the index-image thumbnail. Since v0.3.90 every index image (both the
// lab_plan/ companion PNG from Plan Save, and the Output-folder copy from "Save
// index image to Output on Run") carries the full plan data embedded as a
// LAB_PLAN_PNG_KEY iTXt chunk, so it can be read directly from the dropped file
// with no server round-trip — this is the only way to load a plan back from an
// Output-folder PNG, which has no same-named .json anywhere. Falls back to the
// old same-basename server lookup for older index images saved before this.
async function _loadPlanFromIndexImage(file) {
    const stem = file.name.replace(/\.[^.]+$/, "");
    const filename = `${stem}.json`;
    try {
        const chunks = await readAllPNGTextChunks(file);
        if (chunks?.[LAB_PLAN_PNG_KEY]) {
            _applyPlanData(filename, JSON.parse(chunks[LAB_PLAN_PNG_KEY]));
            showToast(t("labPlanLoaded"), "success");
            return;
        }
    } catch { /* fall through to the server lookup below */ }
    await _loadPlanFromServer(filename);
}

async function _loadPlanFromServer(filename) {
    try {
        const res = await fetch(`/api/wfm/lab/plans/content?filename=${encodeURIComponent(filename)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        _applyPlanData(filename, json.data || {});
        showToast(t("labPlanLoaded"), "success");
    } catch (err) {
        showToast(`${t("labPlanLoadFailed")}: ${err.message}`, "error");
    }
}

function _clearPlan() {
    if (!window.confirm(t("labConfirmClear"))) return;
    _lab = _emptyLabState();

    const noteEl = document.getElementById("wfm-lab-note");
    const batchEl = document.getElementById("wfm-lab-batch-count");
    const chainEl = document.getElementById("wfm-lab-chain-image");
    const saveIndexEl = document.getElementById("wfm-lab-save-index-on-run");
    if (noteEl) noteEl.value = "";
    if (batchEl) batchEl.value = _lab.batchCount;
    if (chainEl) chainEl.checked = _lab.chainImage;
    if (saveIndexEl) saveIndexEl.checked = _lab.saveIndexOnRun;

    const previewWrap = document.getElementById("wfm-lab-preview-wrap");
    if (previewWrap) previewWrap.style.display = "none";

    _renderAllColumns();
    _renderResultsGrid();
    _updateResultsSourceImage();
    _updatePlanWorkflowUI();
    _updateT2IModeUI();
}

// ============================================
// Plan → workflow recall
// ============================================

// Shows/hides the recorded-workflow row in the Plan pane based on _lab.workflowFilename.
function _updatePlanWorkflowUI() {
    const row = document.getElementById("wfm-lab-plan-workflow-row");
    const nameEl = document.getElementById("wfm-lab-plan-workflow-name");
    if (!row || !nameEl) return;
    if (_lab.workflowFilename) {
        nameEl.textContent = _lab.workflowFilename;
        nameEl.title = _lab.workflowFilename;
        row.style.display = "";
    } else {
        row.style.display = "none";
    }
}

// Loads the plan's recorded workflow file into GenerateUI, replacing whatever is
// currently loaded there. Requires explicit confirmation — Lab never swaps the
// active workflow on its own (e.g. when a plan is loaded via drag & drop).
// Uses a dynamic import to avoid a static circular import with generate-tab.js,
// which already imports initLabTab from this file.
async function _loadPlanWorkflow() {
    const filename = _lab.workflowFilename;
    if (!filename) return;
    if (!window.confirm(t("labConfirmLoadWorkflow", filename))) return;
    try {
        const resp = await fetch(`/api/wfm/workflows/raw?filename=${encodeURIComponent(filename)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const { loadWorkflowIntoEditor } = await import("./generate-tab.js");
        await loadWorkflowIntoEditor(data, filename);
    } catch (err) {
        showToast(`${t("labWorkflowLoadFailed")}: ${err.message}`, "error");
    }
}

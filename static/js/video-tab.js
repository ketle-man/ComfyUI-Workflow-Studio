/**
 * Video Tab - top-level orchestration for the Plan / Asset / Edit subtabs, plus
 * the Frame-capture / GIF-conversion / Video-Source tools (kept exactly as they
 * were — they don't depend on which subtab is active and stay visible across
 * all three; see video-tab.css's persistent-panel layout).
 *
 * Batch generation (the former single-shot form) now lives in
 * video-plan-tab.js, and per-block workflow manipulation in video-workflow.js.
 * This file only re-exports loadWorkflowIntoVideoEditor so workflow-tab.js's
 * "Load in Video" button needs no changes.
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { comfyUI } from "./comfyui-client.js";
import { applyStoredVideoVolume } from "./settings-tab.js";
import { initVideoPlanTab, loadWorkflowIntoVideoEditor } from "./video-plan-tab.js";
import { initVideoAssetTab, refreshVideoAssetTab } from "./video-asset-tab.js";

export { loadWorkflowIntoVideoEditor };

const state = {
    // Whatever's currently shown in the center preview frame — a just-generated
    // result, or a video dropped/picked in the Video Source panel. Used by the
    // Frame/GIF property tabs so they work on any video, not just generated ones.
    // { kind: "output"|"input", filename, subfolder, type } for anything already on
    // the server, or { kind: "local", file } for a picked file not yet uploaded.
    previewSource: null,
};

// ============================================
// Subtab switching — two INDEPENDENT groups sharing the same .wfm-video-subtab-*
// look, kept deliberately uncoupled: the sidebar's lone Asset button just
// shows/hides its own panel, while the center Plan/Edit pair is its own
// exclusive 2-way tab. Querying each scoped to its own container (rather than
// one global querySelectorAll) is what keeps clicking one from affecting the
// other.
// ============================================

function _initCenterSubtabToggle() {
    const scope = document.querySelector(".wfm-video-center-panel");
    if (!scope) return;
    scope.querySelectorAll(".wfm-video-subtab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.videoSubtab;
            scope.querySelectorAll(".wfm-video-subtab-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            scope.querySelectorAll(".wfm-video-subtab-panel").forEach((p) => {
                p.style.display = p.dataset.videoSubtabPanel === target ? "" : "none";
            });
        });
    });
}

// The sidebar currently holds only "Asset" (Plan/Edit moved to the center
// panel — see above), so it behaves as a simple show/hide toggle rather than
// an N-way exclusive tab: there's nothing else in its group to switch to.
function _initAssetToggle() {
    const sidebar = document.querySelector(".wfm-video-form-panel");
    const btn = sidebar?.querySelector(".wfm-video-subtab-btn");
    const panel = document.getElementById("wfm-video-subtab-asset");
    if (!btn || !panel) return;
    btn.addEventListener("click", () => {
        const willShow = panel.style.display === "none";
        panel.style.display = willShow ? "" : "none";
        btn.classList.toggle("active", willShow);
        if (willShow) refreshVideoAssetTab();
    });
}

// ============================================
// first_frame / last_frame アップロード（Video Sourceパネル・Frame/GIFタブと共有する
// 汎用ドロップゾーン配線ヘルパー。video-plan-tab.jsのブロック画像アップロードとは別物）
// ============================================

function _wireDropZone(dropZoneId, fileInputId, onFile) {
    const dropZone = document.getElementById(dropZoneId);
    const fileInput = document.getElementById(fileInputId);
    if (!dropZone || !fileInput) return;
    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) onFile(fileInput.files[0]);
    });
    dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        if (e.dataTransfer.files.length > 0) onFile(e.dataTransfer.files[0]);
    });
}

// ============================================
// 結果表示
// ============================================

// Sets (or clears) the center preview frame's video and records where it came from —
// `source` is what the Frame/GIF property tabs act on (see state.previewSource above).
// Revokes the previous blob: URL (if any) so picking a series of local files doesn't
// leak memory.
let _previewObjectUrl = null;

function _setPreviewMedia(url, source) {
    state.previewSource = source;
    const video = document.getElementById("wfm-video-preview-video");
    const placeholder = document.getElementById("wfm-video-preview-placeholder");
    if (!video || !placeholder) return;

    if (_previewObjectUrl) {
        URL.revokeObjectURL(_previewObjectUrl);
        _previewObjectUrl = null;
    }
    if (url && url.startsWith("blob:")) _previewObjectUrl = url;

    if (url) {
        video.src = url;
        video.style.display = "block";
        placeholder.style.display = "none";
    } else {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.style.display = "none";
        placeholder.style.display = "";
    }
}

// ============================================
// i18nの適用（app.jsのapplyI18nToHtml()と同じ「個別要素にt()を適用」方式）
// ============================================

function _applyVideoI18n() {
    const setText = (id, key) => {
        const el = document.getElementById(id);
        if (el) el.textContent = t(key);
    };
    setText("wfm-video-edit-placeholder-label", "videoEditPlaceholder");
    setText("wfm-video-source-label", "videoSourceLabel");
    setText("wfm-video-source-hint", "videoSourceHint");
    setText("wfm-video-source-drop-label", "videoSourceDropLabel");
    setText("wfm-video-source-clear", "clear");
    setText("wfm-video-preview-placeholder", "videoNoVideo");
    setText("wfm-video-prop-tab-frame", "videoPropFrame");
    setText("wfm-video-prop-tab-gif", "videoPropGif");
    setText("wfm-video-frame-hint", "videoFrameHint");
    setText("wfm-video-frame-capture-btn", "videoCaptureFrame");
    setText("wfm-video-frame-save-btn", "videoSaveToOutput");
    setText("wfm-video-gif-start-label", "videoGifStart");
    setText("wfm-video-gif-end-label", "videoGifEnd");
    setText("wfm-video-gif-fps-label", "videoGifFps");
    setText("wfm-video-gif-width-label", "videoGifWidth");
    setText("wfm-video-gif-convert-btn", "videoConvertToGif");
}

// ============================================
// Video Source panel — loads any local video into the preview frame, independent of
// generation, so Frame/GIF tools work without running the loaded video workflow first.
// ============================================

function _wireVideoSourcePanel() {
    _wireDropZone("wfm-video-source-drop", "wfm-video-source-file", (file) => {
        if (!file.type.startsWith("video/")) return;
        const statusEl = document.getElementById("wfm-video-source-status");
        _setPreviewMedia(URL.createObjectURL(file), { kind: "local", file });
        if (statusEl) { statusEl.textContent = file.name; statusEl.style.color = ""; }
    });

    document.getElementById("wfm-video-source-clear")?.addEventListener("click", () => {
        _setPreviewMedia(null, null);
        const statusEl = document.getElementById("wfm-video-source-status");
        if (statusEl) statusEl.textContent = "";
        const fileInput = document.getElementById("wfm-video-source-file");
        if (fileInput) fileInput.value = "";
    });
}

// ============================================
// Properties panel tabs (Frame / GIF)
// ============================================

function _initPropTabs() {
    const tabs = document.querySelectorAll(".wfm-video-prop-tab");
    tabs.forEach((btn) => {
        btn.addEventListener("click", () => {
            tabs.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            const target = btn.dataset.propTab;
            document.querySelectorAll(".wfm-video-prop-content").forEach((c) => {
                c.style.display = c.id === `wfm-video-prop-${target}` ? "" : "none";
            });
        });
    });
}

// ============================================
// Frame tab — captures the preview video's current playback position as a PNG,
// client-side (canvas), and saves it into ComfyUI's own output folder.
// ============================================

let _capturedFrameBlob = null;

function _blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Failed to read blob"));
        reader.readAsDataURL(blob);
    });
}

function _initFrameTab() {
    const captureBtn = document.getElementById("wfm-video-frame-capture-btn");
    const saveBtn = document.getElementById("wfm-video-frame-save-btn");
    const previewWrap = document.getElementById("wfm-video-frame-preview-wrap");
    const previewImg = document.getElementById("wfm-video-frame-preview-img");
    const statusEl = document.getElementById("wfm-video-frame-status");

    captureBtn?.addEventListener("click", () => {
        const video = document.getElementById("wfm-video-preview-video");
        if (!video || video.style.display === "none" || !video.videoWidth) {
            showToast(t("videoNoSourceLoaded"), "error");
            return;
        }
        try {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext("2d").drawImage(video, 0, 0);
            canvas.toBlob((blob) => {
                if (!blob) return;
                _capturedFrameBlob = blob;
                if (previewImg) previewImg.src = URL.createObjectURL(blob);
                if (previewWrap) previewWrap.style.display = "";
                if (saveBtn) saveBtn.disabled = false;
                if (statusEl) statusEl.textContent = "";
            }, "image/png");
        } catch (err) {
            showToast(t("videoFrameCaptureFailed", err.message), "error");
        }
    });

    saveBtn?.addEventListener("click", async () => {
        if (!_capturedFrameBlob) return;
        saveBtn.disabled = true;
        if (statusEl) statusEl.textContent = "Saving...";
        try {
            const dataUrl = await _blobToDataUrl(_capturedFrameBlob);
            const res = await fetch("/api/wfm/video/frame/save-to-output", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image_base64: dataUrl }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            if (statusEl) { statusEl.textContent = `✓ ${json.filename}`; statusEl.style.color = "var(--wfm-success)"; }
            showToast(t("videoFrameSaved", json.filename), "success");
        } catch (err) {
            if (statusEl) { statusEl.textContent = `✗ ${err.message}`; statusEl.style.color = "var(--wfm-danger)"; }
            showToast(t("errorWithMsg", err.message), "error");
        } finally {
            saveBtn.disabled = false;
        }
    });
}

// ============================================
// GIF tab — sends the preview video (uploading it first if it's a local file not yet
// on the server) to the server, which decodes it with PyAV and encodes an animated
// GIF with Pillow (both already required by ComfyUI itself — no ffmpeg dependency).
// ============================================

function _initGifTab() {
    const convertBtn = document.getElementById("wfm-video-gif-convert-btn");
    const progressBar = document.getElementById("wfm-video-gif-progress-bar");
    const progressText = document.getElementById("wfm-video-gif-progress-text");
    const previewWrap = document.getElementById("wfm-video-gif-preview-wrap");
    const previewImg = document.getElementById("wfm-video-gif-preview-img");
    const statusEl = document.getElementById("wfm-video-gif-status");

    convertBtn?.addEventListener("click", async () => {
        if (!state.previewSource) {
            showToast(t("videoNoSourceLoaded"), "error");
            return;
        }
        convertBtn.disabled = true;
        if (statusEl) statusEl.textContent = "";
        if (progressBar) progressBar.style.width = "20%";
        if (progressText) progressText.textContent = "Uploading...";

        try {
            let ref = state.previewSource;
            if (ref.kind === "local") {
                const result = await comfyUI.uploadImage(ref.file, ref.file.name);
                ref = { kind: "input", filename: result.name, subfolder: result.subfolder || "", type: "input" };
                // Cache the uploaded reference so a repeat conversion doesn't re-upload.
                state.previewSource = ref;
            }

            const start = Number(document.getElementById("wfm-video-gif-start")?.value) || 0;
            const endRaw = document.getElementById("wfm-video-gif-end")?.value;
            const fps = Number(document.getElementById("wfm-video-gif-fps")?.value) || 10;
            const widthRaw = document.getElementById("wfm-video-gif-width")?.value;

            if (progressBar) progressBar.style.width = "60%";
            if (progressText) progressText.textContent = t("videoGifConverting");

            const res = await fetch("/api/wfm/video/to-gif", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename: ref.filename,
                    subfolder: ref.subfolder || "",
                    type: ref.type,
                    start_time: start,
                    end_time: endRaw ? Number(endRaw) : null,
                    fps,
                    max_width: widthRaw ? Number(widthRaw) : null,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

            if (progressBar) progressBar.style.width = "100%";
            if (progressText) progressText.textContent = t("videoGifDoneCount", json.frame_count ?? 0);

            const params = new URLSearchParams({ filename: json.filename, subfolder: json.subfolder || "", type: "output" });
            if (previewImg) previewImg.src = `${comfyUI.baseUrl}/view?${params}`;
            if (previewWrap) previewWrap.style.display = "";
            if (statusEl) { statusEl.textContent = `✓ ${json.filename}`; statusEl.style.color = "var(--wfm-success)"; }
            showToast(t("videoGifSaved", json.filename), "success");
        } catch (err) {
            if (statusEl) { statusEl.textContent = `✗ ${err.message}`; statusEl.style.color = "var(--wfm-danger)"; }
            if (progressText) progressText.textContent = "Error";
            showToast(t("errorWithMsg", err.message), "error");
        } finally {
            convertBtn.disabled = false;
        }
    });
}

// ============================================
// 初期化
// ============================================

export function initVideoTab() {
    _applyVideoI18n();
    _initCenterSubtabToggle();
    _initAssetToggle();
    initVideoPlanTab();
    initVideoAssetTab();

    _wireVideoSourcePanel();
    _initPropTabs();
    _initFrameTab();
    _initGifTab();

    // 保存済みの音量を適用し、以降ユーザーがネイティブコントロールで変更した音量も
    // 自動保存する（要素自体は永続的なので初期化時に一度呼べば十分）。
    applyStoredVideoVolume(document.getElementById("wfm-video-preview-video"));
}

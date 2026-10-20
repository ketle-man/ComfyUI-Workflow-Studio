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
import { initVideoProjectTab, refreshVideoProjectTab } from "./video-project-tab.js";
import { initVideoEditTab, addClipFromFile } from "./video-edit-tab.js";
import { VIDEO_GROUP, ensureVideoGroup } from "./gallery-tab.js";
import {
    setSourcePreview, getActivePreviewSource, updateActivePreviewSourceRef,
    getActivePreviewVideoElement, getAllPreviewVideoElements,
} from "./video-preview.js";

export { loadWorkflowIntoVideoEditor };

// ============================================
// Subtab switching — two INDEPENDENT groups sharing the same .wfm-video-subtab-*
// look, kept deliberately uncoupled: the sidebar's Project button collapses its
// panel entirely when re-clicked (nothing needs to always be visible there —
// Video Source covers the "load something to work with" case), while the center
// Plan/Edit/Asset trio is a "always exactly one visible" tab group. Querying each
// scoped to its own container (rather than one global querySelectorAll) is
// what keeps clicking one from affecting the other.
// ============================================

// Which of the center Plan/Edit subtabs was last active — the sidebar
// Project panel uses this to decide whether to list saved Video Plans or
// saved Video Edit projects (Asset has no saved-list concept, so selecting
// it leaves this unchanged rather than resetting to "plan").
let _centerSubtabMode = "plan";

function _isProjectPanelOpen() {
    const panel = document.getElementById("wfm-video-subtab-project");
    return !!panel && panel.style.display !== "none";
}

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
            if (target === "asset") refreshVideoAssetTab();
            if (target === "plan" || target === "edit") {
                _centerSubtabMode = target;
                // Project panel may already be open (e.g. switching Plan<->Edit
                // while it's pinned) — keep its list in sync with the new mode.
                if (_isProjectPanelOpen()) refreshVideoProjectTab(_centerSubtabMode);
            }
        });
    });
}

// Sidebar Project button: clicking it shows its panel; clicking it again while
// active collapses it, letting the video preview reclaim the sidebar's width
// when it isn't needed.
function _initSidebarSubtabToggle() {
    const sidebar = document.querySelector(".wfm-video-form-panel");
    if (!sidebar) return;
    const buttons = sidebar.querySelectorAll(".wfm-video-subtab-btn");
    buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.videoSubtab;
            const panel = document.getElementById(`wfm-video-subtab-${target}`);
            const willShow = !!panel && panel.style.display === "none";
            buttons.forEach((b) => b.classList.remove("active"));
            sidebar.querySelectorAll(".wfm-video-subtab-panel").forEach((p) => { p.style.display = "none"; });
            if (willShow) {
                btn.classList.add("active");
                panel.style.display = "";
                if (target === "project") refreshVideoProjectTab(_centerSubtabMode);
            }
        });
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
// i18nの適用（app.jsのapplyI18nToHtml()と同じ「個別要素にt()を適用」方式）
// ============================================

function _applyVideoI18n() {
    const setText = (id, key) => {
        const el = document.getElementById(id);
        if (el) el.textContent = t(key);
    };
    const setTitle = (id, key) => {
        const el = document.getElementById(id);
        if (el) el.title = t(key);
    };
    setText("wfm-video-edit-export-btn", "videoEditExportBtn");
    setText("wfm-video-edit-track-video", "videoEditTrackVideo");
    setText("wfm-video-edit-track-pip", "videoEditTrackPip");
    setText("wfm-video-edit-pip-title", "videoEditPipTitle");
    setText("wfm-video-edit-pip-btn", "videoEditPipAdd");
    setText("wfm-video-edit-track-text", "videoEditTrackText");
    setText("wfm-video-edit-track-audio", "videoEditTrackAudio");
    setTitle("wfm-video-edit-move-left-btn", "videoEditMoveLeft");
    setTitle("wfm-video-edit-move-right-btn", "videoEditMoveRight");
    setText("wfm-video-edit-duplicate-btn", "videoEditDuplicate");
    setText("wfm-video-edit-delete-btn", "videoEditDelete");
    setText("wfm-video-edit-clear-btn", "videoEditClearBtn");
    setTitle("wfm-video-edit-undo-btn", "videoEditUndo");
    setTitle("wfm-video-edit-redo-btn", "videoEditRedo");
    setText("wfm-video-edit-audio-title", "videoEditAudioTitle");
    setText("wfm-video-edit-keep-audio-label", "videoEditKeepAudio");
    setText("wfm-video-edit-orig-vol-label", "videoEditOriginalVolume");
    setText("wfm-video-edit-bgm-btn", "videoEditBgmSelect");
    setTitle("wfm-video-edit-bgm-clear", "videoEditBgmRemove");
    setText("wfm-video-edit-bgm-vol-label", "videoEditBgmVolume");
    setText("wfm-video-edit-bgm-offset-label", "videoEditBgmOffset");
    setText("wfm-video-edit-bgm-hint", "videoEditBgmHint");
    setText("wfm-video-edit-sound-btn", "videoEditSoundAdd");
    setText("wfm-video-source-add-to-edit", "videoSourceAddToEdit");
    setText("wfm-video-source-register-asset", "videoSourceRegisterAsset");
    setText("wfm-video-source-label", "videoSourceLabel");
    setText("wfm-video-source-hint", "videoSourceHint");
    setText("wfm-video-source-drop-label", "videoSourceDropLabel");
    setText("wfm-video-source-clear", "clear");
    setText("wfm-video-source-preview-placeholder", "videoSourcePreviewPlaceholder");
    setText("wfm-video-preview-placeholder", "videoResultPreviewPlaceholder");
    setText("wfm-video-prop-tab-frame", "videoPropFrame");
    setText("wfm-video-prop-tab-gif", "videoPropGif");
    setText("wfm-video-subtab-btn-project", "videoPropProject");
    setText("wfm-video-project-hint", "videoProjectHint");
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
        const isVideo = file.type.startsWith("video/");
        const isImage = file.type.startsWith("image/");
        if (!isVideo && !isImage) return;
        const statusEl = document.getElementById("wfm-video-source-status");
        setSourcePreview(URL.createObjectURL(file), { kind: "local", file }, isVideo ? "video" : "image");
        if (statusEl) { statusEl.textContent = file.name; statusEl.style.color = ""; }
    });

    // "Add to Edit" — explicit, user-triggered handoff from whatever is loaded
    // in the Source pane (a plain drop, an Asset selection, a Frame/GIF-tool
    // source) into the Edit subtab's clip timeline. Deliberately NOT automatic
    // on every Source drop — Frame/GIF is a single-video tool the user reaches
    // for far more often than multi-clip editing, so auto-adding would clutter
    // the Edit timeline with videos the user never meant to combine.
    document.getElementById("wfm-video-source-add-to-edit")?.addEventListener("click", async () => {
        const ref = getActivePreviewSource();
        if (!ref) { showToast(t("videoNoSourceLoaded"), "error"); return; }
        try {
            let file;
            if (ref.kind === "local") {
                file = ref.file;
            } else {
                const blob = await comfyUI.getImageBlob(ref);
                const isVideoExt = /\.(mp4|webm|mkv|mov)$/i.test(ref.filename || "");
                file = new File([blob], ref.filename, { type: blob.type || (isVideoExt ? "video/mp4" : "image/png") });
            }
            addClipFromFile(file);
            document.querySelector('.wfm-video-center-panel .wfm-video-subtab-btn[data-video-subtab="edit"]')?.click();
            showToast(t("videoEditClipSent", file.name), "success");
        } catch (err) {
            showToast(t("errorWithMsg", err.message), "error");
        }
    });

    // "Register as Asset" — puts whatever is loaded in the Source pane into Gallery's
    // curated __Video Assets__ group so it shows up in the Asset subtab. Local files
    // are uploaded to input first, then copied into output/video by the backend
    // (Gallery only lists the output folder); sources already in output are tagged as-is.
    document.getElementById("wfm-video-source-register-asset")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        let ref = getActivePreviewSource();
        if (!ref) { showToast(t("videoNoSourceLoaded"), "error"); return; }
        btn.disabled = true;
        try {
            if (ref.kind === "local") {
                const uploaded = await comfyUI.uploadImage(ref.file, ref.file.name);
                ref = { kind: "input", filename: uploaded.name, subfolder: uploaded.subfolder || "", type: "input" };
                updateActivePreviewSourceRef(ref);
            }
            const res = await fetch("/api/wfm/video/asset/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: ref.filename, subfolder: ref.subfolder || "", type: ref.type || "input" }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            await ensureVideoGroup();
            const addRes = await fetch(`/wfm/gallery/groups/${encodeURIComponent(VIDEO_GROUP)}/add`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: json.path }),
            });
            if (!addRes.ok) throw new Error(`HTTP ${addRes.status}`);
            showToast(t("videoSourceAssetRegistered", json.filename), "success");
            refreshVideoAssetTab();
        } catch (err) {
            showToast(t("errorWithMsg", err.message), "error");
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById("wfm-video-source-clear")?.addEventListener("click", () => {
        setSourcePreview(null, null);
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
let _frameOutputDir = "";

function _blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Failed to read blob"));
        reader.readAsDataURL(blob);
    });
}

// Same small output-dir lookup each of video-asset-tab.js/video-plan-tab.js/
// video-edit-tab.js keeps its own copy of — needed to build the absolute path
// Gallery's group-tagging API expects.
async function _fetchFrameOutputDir() {
    if (_frameOutputDir) return;
    try {
        const res = await fetch("/api/wfm/settings/output-dir");
        if (res.ok) {
            const data = await res.json();
            _frameOutputDir = (data.current || "").replace(/\\/g, "/").replace(/\/$/, "");
        }
    } catch { /* non-critical */ }
}

// Opt-in tagging of a saved frame into Gallery's curated __Video Assets__
// group (see the "Add to Video Assets group" checkbox) — mirrors
// video-edit-tab.js's _addOutputToVideoTemp, but targets the curated group
// directly since a manually-captured frame is a deliberate keep, not the
// every-run scratch output __Video Temp__ exists for.
async function _addFrameToVideoAssets(filename, subfolder) {
    await _fetchFrameOutputDir();
    if (!_frameOutputDir) return;
    const parts = [_frameOutputDir];
    if (subfolder) parts.push(subfolder);
    parts.push(filename);
    const path = parts.join("/");
    try {
        await ensureVideoGroup();
        await fetch(`/wfm/gallery/groups/${encodeURIComponent(VIDEO_GROUP)}/add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
        });
    } catch (err) {
        console.warn("[VideoTab] failed to tag frame into video group:", err);
    }
}

function _initFrameTab() {
    const captureBtn = document.getElementById("wfm-video-frame-capture-btn");
    const saveBtn = document.getElementById("wfm-video-frame-save-btn");
    const previewWrap = document.getElementById("wfm-video-frame-preview-wrap");
    const previewImg = document.getElementById("wfm-video-frame-preview-img");
    const statusEl = document.getElementById("wfm-video-frame-status");

    captureBtn?.addEventListener("click", () => {
        const video = getActivePreviewVideoElement();
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
            if (document.getElementById("wfm-video-frame-add-to-assets")?.checked) {
                await _addFrameToVideoAssets(json.filename, json.subfolder);
            }
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
        if (!getActivePreviewSource()) {
            showToast(t("videoNoSourceLoaded"), "error");
            return;
        }
        convertBtn.disabled = true;
        if (statusEl) statusEl.textContent = "";
        if (progressBar) progressBar.style.width = "20%";
        if (progressText) progressText.textContent = "Uploading...";

        try {
            let ref = getActivePreviewSource();
            if (ref.kind === "local") {
                const result = await comfyUI.uploadImage(ref.file, ref.file.name);
                ref = { kind: "input", filename: result.name, subfolder: result.subfolder || "", type: "input" };
                // Cache the uploaded reference so a repeat conversion doesn't re-upload.
                updateActivePreviewSourceRef(ref);
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
    _initSidebarSubtabToggle();
    initVideoPlanTab();
    initVideoAssetTab();
    initVideoProjectTab();
    initVideoEditTab();

    _wireVideoSourcePanel();
    _initPropTabs();
    _initFrameTab();
    _initGifTab();

    // 保存済みの音量を適用し、以降ユーザーがネイティブコントロールで変更した音量も
    // 自動保存する（要素自体は永続的なので初期化時に一度呼べば十分）。両方のプレビュー
    // ペイン(Asset/Source用・生成結果用)の<video>要素に適用する。
    getAllPreviewVideoElements().forEach((video) => applyStoredVideoVolume(video));
}

/**
 * Video Tab - MiniMax H3 (Image to Video) 専用の動画生成UI
 * GenerateUIタブとは完全に独立。UI形式ワークフローJSONを直接編集し、
 * comfyWorkflow.convertUiToApi() でAPI形式に変換して実行する。
 * 状態は「テンプレートJSON＋フォーム値」のみ保持し、生成の都度
 * structuredClone() したコピーに書き込む（複数回生成をまたいだID不整合を防ぐ）。
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { comfyUI } from "./comfyui-client.js";
import { comfyWorkflow } from "./comfyui-workflow.js";
import { escapeHtml } from "./util.js";

const DEFAULT_WORKFLOW_FILENAME = "minimax_test.json";

const state = {
    templateWorkflow: null,
    templateFilename: null,
    firstFrameFilename: null,
    lastFrameFilename: null,
    generating: false,
};

// ============================================
// ワークフロー取得
// ============================================

async function getRawWorkflow(filename) {
    const res = await fetch(`/api/wfm/workflows/raw?filename=${encodeURIComponent(filename)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

// ============================================
// MiniMax H3ノードの動的特定（ノードIDをハードコードしない）
// ============================================

// ノードのinputs[]のうちwidgetキーを持つものだけを抽出した並び順で、名前からインデックスを引く。
// widgets_values配列はこの並び順と1:1対応する（link接続されていてもwidgetキーを持つ入力は
// widgets_valuesにスロットを持つ「legacy full」形式のため）。
function _widgetIndex(node, name) {
    const widgetInputs = (node?.inputs || []).filter((inp) => inp.widget);
    return widgetInputs.findIndex((inp) => inp.name === name);
}

function locateMiniMaxNodes(workflow) {
    if (!Array.isArray(workflow?.nodes) || !Array.isArray(workflow?.links)) return null;

    const sgDef = (workflow.definitions?.subgraphs || [])
        .find((sg) => (sg.nodes || []).some((n) => n.type === "MiniMaxH3ImageToVideo"));
    if (!sgDef) return null;

    const instanceNode = workflow.nodes.find((n) => n.type === sgDef.id);
    if (!instanceNode || !Array.isArray(instanceNode.widgets_values)) return null;

    const firstFrameSlot = instanceNode.inputs.findIndex((inp) => inp.name === "first_frame");
    const lastFrameSlot = instanceNode.inputs.findIndex((inp) => inp.name === "last_frame");
    const widthSlot = instanceNode.inputs.findIndex((inp) => inp.name === "width");
    if (firstFrameSlot === -1 || lastFrameSlot === -1 || widthSlot === -1) return null;

    const findLinkedNode = (targetSlot) => {
        const link = workflow.links.find((l) => l[3] === instanceNode.id && l[4] === targetSlot);
        if (!link) return null;
        return workflow.nodes.find((n) => n.id === link[1]) || null;
    };

    // first_frameはoptional入力のため、LoadImageノードが接続されていないワークフロー
    // (テキストのみで動作するT2V構成など)もサポート対象とする。未接続の場合は
    // loadImageNode: null のまま返し、必要ならrunGeneration側で動的にノードを注入する。
    const rawLoadImageNode = findLinkedNode(firstFrameSlot);
    const loadImageNode = (rawLoadImageNode && rawLoadImageNode.type === "LoadImage") ? rawLoadImageNode : null;
    const resolutionNode = findLinkedNode(widthSlot);
    if (!resolutionNode || resolutionNode.type !== "ResolutionSelector") return null;

    const promptIdx = _widgetIndex(instanceNode, "prompt");
    const durationIdx = _widgetIndex(instanceNode, "value_1");
    if (promptIdx === -1 || durationIdx === -1) return null;

    return {
        sgDef, instanceNode, loadImageNode, resolutionNode,
        firstFrameSlot, lastFrameSlot, promptIdx, durationIdx,
    };
}

// ============================================
// ワークフロー読み込み
// ============================================

function _showFramePreview(which, filename) {
    const previewImg = document.getElementById(`wfm-video-${which}-frame-preview`);
    const wrap = document.getElementById(`wfm-video-${which}-frame-wrap`);
    if (!previewImg || !wrap || !filename) return;
    previewImg.src = `${comfyUI.baseUrl}/view?filename=${encodeURIComponent(filename)}&type=input`;
    wrap.style.display = "";
}

export async function loadWorkflowIntoVideoEditor(workflow, filename) {
    const nodes = locateMiniMaxNodes(workflow);
    if (!nodes) {
        showToast(t("videoUnsupportedWorkflow"), "error");
        return false;
    }

    state.templateWorkflow = workflow;
    state.templateFilename = filename || "";
    state.firstFrameFilename = null;
    state.lastFrameFilename = null;

    const nameEl = document.getElementById("wfm-video-wf-name");
    if (nameEl) nameEl.textContent = filename || "Loaded Workflow";

    const { instanceNode, resolutionNode, loadImageNode, promptIdx, durationIdx } = nodes;

    const promptEl = document.getElementById("wfm-video-prompt");
    if (promptEl) promptEl.value = instanceNode.widgets_values[promptIdx] ?? "";

    const durationEl = document.getElementById("wfm-video-duration");
    if (durationEl) durationEl.value = instanceNode.widgets_values[durationIdx] ?? 2;

    const arIdx = _widgetIndex(resolutionNode, "aspect_ratio");
    const mpIdx = _widgetIndex(resolutionNode, "megapixels");
    const multIdx = _widgetIndex(resolutionNode, "multiple");
    const aspectEl = document.getElementById("wfm-video-aspect-ratio");
    if (aspectEl && arIdx !== -1 && resolutionNode.widgets_values[arIdx] != null) {
        aspectEl.value = resolutionNode.widgets_values[arIdx];
    }
    const mpEl = document.getElementById("wfm-video-megapixels");
    if (mpEl && mpIdx !== -1) mpEl.value = resolutionNode.widgets_values[mpIdx] ?? mpEl.value;
    const multEl = document.getElementById("wfm-video-multiple");
    if (multEl && multIdx !== -1) multEl.value = resolutionNode.widgets_values[multIdx] ?? multEl.value;

    const fnIdx = _widgetIndex(loadImageNode, "image");
    if (fnIdx !== -1 && loadImageNode.widgets_values[fnIdx]) {
        state.firstFrameFilename = loadImageNode.widgets_values[fnIdx];
        _showFramePreview("first", state.firstFrameFilename);
    }

    showToast(t("videoWorkflowLoaded", filename || ""), "success");
    return true;
}

async function loadDefaultWorkflow() {
    try {
        const wf = await getRawWorkflow(DEFAULT_WORKFLOW_FILENAME);
        await loadWorkflowIntoVideoEditor(wf, DEFAULT_WORKFLOW_FILENAME);
    } catch {
        // 初回自動ロード失敗は静かに無視する（環境によってファイルが存在しないこともある）。
        // Workflowタブの「Load in Video」ボタンから明示的に読み込める。
    }
}

// ============================================
// Aspect Ratio 選択肢（object_infoから動的取得、ハードコードしない）
// ============================================

async function _populateAspectRatioOptions() {
    const select = document.getElementById("wfm-video-aspect-ratio");
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
    } catch {
        // ResolutionSelectorが未導入の環境などは選択肢が空のまま(手入力不可のselectなので実質何もできないが、
        // Videoタブ自体の初期化は継続させる)。
    }
}

// ============================================
// first_frame / last_frame アップロード
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

async function _handleFrameUpload(which, file) {
    if (!file || !file.type.startsWith("image/")) return;
    const statusEl = document.getElementById(`wfm-video-${which}-frame-status`);
    const previewImg = document.getElementById(`wfm-video-${which}-frame-preview`);
    const wrap = document.getElementById(`wfm-video-${which}-frame-wrap`);
    if (previewImg) previewImg.src = URL.createObjectURL(file);
    if (wrap) wrap.style.display = "";
    if (statusEl) statusEl.textContent = "Uploading...";
    try {
        const result = await comfyUI.uploadImage(file, file.name);
        if (which === "first") state.firstFrameFilename = result.name;
        else state.lastFrameFilename = result.name;
        if (statusEl) {
            statusEl.textContent = `✓ ${result.name}`;
            statusEl.style.color = "var(--wfm-success)";
        }
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = `✗ ${err.message}`;
            statusEl.style.color = "var(--wfm-danger)";
        }
    }
}

function _clearFrame(which) {
    if (which === "first") state.firstFrameFilename = null;
    else state.lastFrameFilename = null;
    const wrap = document.getElementById(`wfm-video-${which}-frame-wrap`);
    const previewImg = document.getElementById(`wfm-video-${which}-frame-preview`);
    const statusEl = document.getElementById(`wfm-video-${which}-frame-status`);
    const fileInput = document.getElementById(`wfm-video-${which}-frame-file`);
    if (wrap) wrap.style.display = "none";
    if (previewImg) previewImg.src = "";
    if (statusEl) statusEl.textContent = "";
    if (fileInput) fileInput.value = "";
}

// ============================================
// フォーム値の読み取り・ワークフローへの反映
// ============================================

function _readFormValues() {
    return {
        prompt: document.getElementById("wfm-video-prompt")?.value || "",
        aspectRatio: document.getElementById("wfm-video-aspect-ratio")?.value || "",
        megapixels: Number(document.getElementById("wfm-video-megapixels")?.value) || 0.2,
        multiple: Number(document.getElementById("wfm-video-multiple")?.value) || 32,
        duration: Number(document.getElementById("wfm-video-duration")?.value) || 2,
    };
}

function _applyFormToWorkflow(nodes, form) {
    const { instanceNode, resolutionNode, loadImageNode, promptIdx, durationIdx } = nodes;

    instanceNode.widgets_values[promptIdx] = form.prompt;
    instanceNode.widgets_values[durationIdx] = form.duration;

    const arIdx = _widgetIndex(resolutionNode, "aspect_ratio");
    const mpIdx = _widgetIndex(resolutionNode, "megapixels");
    const multIdx = _widgetIndex(resolutionNode, "multiple");
    if (arIdx !== -1) resolutionNode.widgets_values[arIdx] = form.aspectRatio;
    if (mpIdx !== -1) resolutionNode.widgets_values[mpIdx] = form.megapixels;
    if (multIdx !== -1) resolutionNode.widgets_values[multIdx] = form.multiple;

    // first_frameは既存のLoadImageノードが接続されている場合のみここで書き換える。
    // 接続が無い場合(loadImageNode: null)は、first_frameが新規指定された時だけ
    // _injectFrameNode()でノードごと注入する（未指定ならバイパス=未接続のまま実行）。
    if (loadImageNode) {
        const fnIdx = _widgetIndex(loadImageNode, "image");
        if (fnIdx !== -1) loadImageNode.widgets_values[fnIdx] = state.firstFrameFilename;
    }
}

// first_frame/last_frameが未接続のワークフローに対して、画像が指定された時だけ
// LoadImageノードを新規注入する共通ヘルパー。ノードID/リンクIDはclone内の実際の
// 最大値+1で採番するため、重複ID/リンクID不整合は起きない
// (CLAUDE.md記載の既知の落とし穴への対策)。未指定時は何もしない
// (テンプレート由来のlink:nullのまま=クリーンな状態を毎回cloneするので残留の心配がない=バイパス扱い)。
function _injectFrameNode(clone, instanceNode, targetSlot, filename) {
    const maxNodeId = Math.max(clone.last_node_id || 0, ...clone.nodes.map((n) => n.id));
    const maxLinkId = Math.max(clone.last_link_id || 0, ...clone.links.map((l) => l[0]));
    const newNodeId = maxNodeId + 1;
    const newLinkId = maxLinkId + 1;

    clone.nodes.push({
        id: newNodeId,
        type: "LoadImage",
        pos: [(instanceNode.pos?.[0] || 0) - 260, (instanceNode.pos?.[1] || 0) + 40],
        size: [280, 314],
        flags: {},
        order: clone.nodes.length,
        mode: 0,
        inputs: [
            { localized_name: "image", name: "image", type: "COMBO", widget: { name: "image" }, link: null },
            { localized_name: "choose file to upload", name: "upload", type: "IMAGEUPLOAD", widget: { name: "upload" }, link: null },
        ],
        outputs: [
            { localized_name: "IMAGE", name: "IMAGE", type: "IMAGE", links: [newLinkId] },
            { localized_name: "MASK", name: "MASK", type: "MASK", links: null },
        ],
        properties: { "Node name for S&R": "LoadImage" },
        widgets_values: [filename, "image"],
    });

    clone.links.push([newLinkId, newNodeId, 0, instanceNode.id, targetSlot, "IMAGE"]);
    const targetInput = instanceNode.inputs[targetSlot];
    if (targetInput) targetInput.link = newLinkId;

    clone.last_node_id = newNodeId;
    clone.last_link_id = newLinkId;
}

// ============================================
// 実行
// ============================================

async function runGeneration() {
    if (state.generating) return;
    if (!state.templateWorkflow) {
        showToast(t("videoNoWorkflowLoaded"), "error");
        return;
    }

    const clone = structuredClone(state.templateWorkflow);
    const nodes = locateMiniMaxNodes(clone);
    if (!nodes) {
        showToast(t("videoUnsupportedWorkflow"), "error");
        return;
    }

    _applyFormToWorkflow(nodes, _readFormValues());
    // first_frame: 既存のLoadImageノードが無いワークフロー(T2V構成等)で、
    // ユーザーが新たに画像を指定した場合のみノードを注入する。未指定ならバイパス(未接続のまま実行)。
    if (!nodes.loadImageNode && state.firstFrameFilename) {
        _injectFrameNode(clone, nodes.instanceNode, nodes.firstFrameSlot, state.firstFrameFilename);
    }
    if (state.lastFrameFilename) {
        _injectFrameNode(clone, nodes.instanceNode, nodes.lastFrameSlot, state.lastFrameFilename);
    }

    const genBtn = document.getElementById("wfm-video-generate-btn");
    const progressBar = document.getElementById("wfm-video-progress-bar");
    const progressText = document.getElementById("wfm-video-progress-text");

    state.generating = true;
    if (genBtn) genBtn.disabled = true;
    if (progressBar) progressBar.style.width = "0%";
    if (progressText) progressText.textContent = "Converting workflow...";

    try {
        const apiWorkflow = await comfyWorkflow.convertUiToApi(clone);

        const seedValue = Number(document.getElementById("wfm-video-noise-seed")?.value) || 0;
        const seedMode = document.getElementById("wfm-video-seed-randomize")?.checked ? "random" : "fixed";

        const { images, seed } = await comfyUI.generate(apiWorkflow, {
            seedMode,
            seedValue,
            timeoutMs: 30 * 60 * 1000, // 動画生成は静止画より長時間になりうる
            onProgress: (pct) => {
                if (progressBar) progressBar.style.width = `${(pct * 100).toFixed(1)}%`;
                if (progressText) progressText.textContent = `${(pct * 100).toFixed(0)}%`;
            },
        });

        const seedEl = document.getElementById("wfm-video-noise-seed");
        if (seedEl) seedEl.value = seed;

        const outputMedia = images.filter((img) => img.type !== "temp");
        if (progressText) progressText.textContent = t("videoDoneCount", outputMedia.length);
        if (progressBar) progressBar.style.width = "100%";

        _renderResult(outputMedia);
        await _saveGeneratedVideoMeta(outputMedia, apiWorkflow);
        showToast(t("videoGenerateSuccess"), "success");
    } catch (err) {
        showToast(t("errorWithMsg", err.message), "error");
        if (progressText) progressText.textContent = "Error";
    } finally {
        state.generating = false;
        if (genBtn) genBtn.disabled = false;
    }
}

// ============================================
// 結果表示
// ============================================

function _renderResult(images) {
    const container = document.getElementById("wfm-video-result");
    if (!container) return;
    if (!images?.length) {
        container.innerHTML = `<p class="wfm-placeholder">${t("videoNoResult")}</p>`;
        return;
    }
    container.innerHTML = images.map((img) => {
        const params = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || "", type: img.type || "output" });
        const src = `${comfyUI.baseUrl}/view?${params}`;
        const isVideo = img.filename.toLowerCase().endsWith(".mp4");
        return isVideo
            ? `<video class="wfm-video-result-item" src="${src}" controls></video>`
            : `<img class="wfm-video-result-item" src="${src}" alt="">`;
    }).join("");
}

// ============================================
// Gallery連携（生成結果のワークフローをサイドカーメタとして保存）
// ============================================

let _outputDir = "";

async function _fetchOutputDir() {
    try {
        const res = await fetch("/api/wfm/settings/output-dir");
        if (res.ok) {
            const data = await res.json();
            _outputDir = (data.current || "").replace(/\\/g, "/").replace(/\/$/, "");
        }
    } catch { /* non-critical */ }
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

// ============================================
// i18nの適用（app.jsのapplyI18nToHtml()と同じ「個別要素にt()を適用」方式）
// ============================================

function _applyVideoI18n() {
    const setText = (id, key) => {
        const el = document.getElementById(id);
        if (el) el.textContent = t(key);
    };
    setText("wfm-video-title-label", "videoTitle");
    setText("wfm-video-first-frame-label", "videoFirstFrame");
    setText("wfm-video-last-frame-label", "videoLastFrame");
    setText("wfm-video-first-frame-drop-label", "videoDropOrClick");
    setText("wfm-video-last-frame-drop-label", "videoDropOrClick");
    setText("wfm-video-first-frame-clear", "clear");
    setText("wfm-video-last-frame-clear", "clear");
    setText("wfm-video-prompt-label", "videoPrompt");
    setText("wfm-video-aspect-ratio-label", "videoAspectRatio");
    setText("wfm-video-megapixels-label", "videoMegapixels");
    setText("wfm-video-multiple-label", "videoMultiple");
    setText("wfm-video-duration-label", "videoDuration");
    setText("wfm-video-noise-seed-label", "videoNoiseSeed");
    setText("wfm-video-randomize-label", "videoRandomizeSeed");
    setText("wfm-video-generate-btn", "videoGenerate");
    setText("wfm-video-result-label", "videoResult");
    setText("wfm-video-no-result-label", "videoNoResult");
    setText("wfm-video-edit-placeholder-label", "videoEditPlaceholder");
    setText("wfm-video-properties-label", "videoProperties");
    setText("wfm-video-properties-placeholder-label", "videoPropertiesPlaceholder");
}

// ============================================
// 初期化
// ============================================

export function initVideoTab() {
    _applyVideoI18n();
    _populateAspectRatioOptions();

    _wireDropZone("wfm-video-first-frame-drop", "wfm-video-first-frame-file", (file) => _handleFrameUpload("first", file));
    _wireDropZone("wfm-video-last-frame-drop", "wfm-video-last-frame-file", (file) => _handleFrameUpload("last", file));

    document.getElementById("wfm-video-first-frame-clear")?.addEventListener("click", () => _clearFrame("first"));
    document.getElementById("wfm-video-last-frame-clear")?.addEventListener("click", () => _clearFrame("last"));
    document.getElementById("wfm-video-generate-btn")?.addEventListener("click", runGeneration);

    loadDefaultWorkflow();
}

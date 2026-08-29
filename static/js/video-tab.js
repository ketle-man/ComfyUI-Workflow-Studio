/**
 * Video Tab - MiniMax H3 (Image to Video) / LTX-2.5 (Text・Image・First&Last-Frame to
 * Video) / Wan2.2 (Text to Video) 対応の動画生成UI。GenerateUIタブとは完全に独立。
 * UI形式ワークフローJSONを直接編集し、comfyWorkflow.convertUiToApi() でAPI形式に
 * 変換して実行する。状態は「テンプレートJSON＋フォーム値」のみ保持し、生成の都度
 * structuredClone() したコピーに書き込む（複数回生成をまたいだID不整合を防ぐ）。
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { comfyUI } from "./comfyui-client.js";
import { comfyWorkflow } from "./comfyui-workflow.js";
import { escapeHtml } from "./util.js";
import { applyStoredVideoVolume } from "./settings-tab.js";

const state = {
    templateWorkflow: null,
    templateFilename: null,
    firstFrameFilename: null,
    lastFrameFilename: null,
    generating: false,
    // Whatever's currently shown in the center preview frame — a just-generated
    // result, or a video dropped/picked in the Video Source panel. Used by the
    // Frame/GIF property tabs so they work on any video, not just generated ones.
    // { kind: "output"|"input", filename, subfolder, type } for anything already on
    // the server, or { kind: "local", file } for a picked file not yet uploaded.
    previewSource: null,
};

// ============================================
// 動画モデルノードの動的特定（ノードIDをハードコードしない）
// MiniMax H3 / LTX-2.5 (Text・Image・First&Last-Frame to Video) / Wan2.2 (Text to Video)
// に対応。サブグラフの内部ノード型（Wan2.2のみサブグラフ名）で対象ワークフローの種類を
// 判定し、以降はサブグラフが公開する入力のlabel（無ければname）で意味的にスロットを
// 特定する。これによりLTX-2.5の3バリアント間で公開入力のname（text/value/value_1...）
// が揺れていても、label（prompt/duration/width...）は共通しているため同じロジックで
// 処理できる。
// ============================================

// ノードのinputs[]のうちwidgetキーを持つものだけを抽出した並び順で、指定した入力定義の
// インデックスを引く。widgets_values配列はこの並び順と1:1対応する（link接続されていても
// widgetキーを持つ入力はwidgets_valuesにスロットを持つ「legacy full」形式のため）。
function _widgetIndexOf(node, inputDef) {
    if (!inputDef) return -1;
    const widgetInputs = (node?.inputs || []).filter((inp) => inp.widget);
    return widgetInputs.indexOf(inputDef);
}

// 上と同じ並び順ルールで、名前から直接インデックスを引く版（ResolutionSelectorや
// LoadImageなど、モデルファミリー間で入力名が揺れないノードに使う）。
function _widgetIndex(node, name) {
    const widgetInputs = (node?.inputs || []).filter((inp) => inp.widget);
    return widgetInputs.findIndex((inp) => inp.name === name);
}

// サブグラフが公開する入力は、labelがあればlabel、無ければnameが意味的な役割を表す
// （例: MiniMax H3の"width"はlabel無しでname自体が"width"、LTX-2.5の"value_2"はlabelが
// "width"）。
function _findInputByLabel(node, label) {
    return (node?.inputs || []).find((inp) => (inp.label || inp.name) === label) || null;
}

function _detectVideoSubgraph(workflow) {
    if (!Array.isArray(workflow?.nodes) || !Array.isArray(workflow?.links)) return null;
    const subgraphs = workflow.definitions?.subgraphs || [];

    const minimax = subgraphs.find((sg) => (sg.nodes || []).some((n) => n.type === "MiniMaxH3ImageToVideo"));
    if (minimax) return { family: "minimax", sgDef: minimax };

    // LTX-2.5のText/Image/First&Last-Frame to Videoはいずれも内部にLTXV*系ノードを持つ
    // サブグラフとして配布される。バリアントごとにサブグラフの公開入力nameが異なるため、
    // 内部ノード型のプレフィックスで検出する。
    const ltx = subgraphs.find((sg) => (sg.nodes || []).some((n) => typeof n.type === "string" && n.type.startsWith("LTXV")));
    if (ltx) return { family: "ltx25", sgDef: ltx };

    // Wan2.2はUNETLoader/KSamplerAdvanced/EmptyHunyuanLatentVideoなど汎用ノードのみで
    // 構成されており、MiniMax H3/LTX-2.5のような固有ノード型による検出ができない。
    // そのためサブグラフ自体の名前（公式テンプレート由来の "...(Wan2.2)" 表記）で検出する。
    const wan22 = subgraphs.find((sg) => /wan\s*2\.2/i.test(sg.name || ""));
    if (wan22) return { family: "wan22", sgDef: wan22 };

    return null;
}

function locateVideoModelNodes(workflow) {
    const detected = _detectVideoSubgraph(workflow);
    if (!detected) return null;
    const { family, sgDef } = detected;

    const instanceNode = workflow.nodes.find((n) => n.type === sgDef.id);
    if (!instanceNode || !Array.isArray(instanceNode.widgets_values)) return null;

    // Wan2.2の公開入力はプロンプトが label 無しの name="text" のまま(MiniMax H3の"prompt"や
    // LTX-2.5の label="prompt" と異なる)ため、"prompt" が見つからない場合は "text" にフォール
    // バックする。
    const promptInput = _findInputByLabel(instanceNode, "prompt") || _findInputByLabel(instanceNode, "text");
    const durationInput = _findInputByLabel(instanceNode, "duration");
    const widthInput = _findInputByLabel(instanceNode, "width");
    if (!promptInput || !durationInput || !widthInput) return null;

    const promptIdx = _widgetIndexOf(instanceNode, promptInput);
    const durationIdx = _widgetIndexOf(instanceNode, durationInput);
    if (promptIdx === -1 || durationIdx === -1) return null;

    const widthSlot = instanceNode.inputs.indexOf(widthInput);

    const findLinkedNode = (targetSlot) => {
        if (targetSlot === -1) return null;
        const link = workflow.links.find((l) => l[3] === instanceNode.id && l[4] === targetSlot);
        if (!link) return null;
        return workflow.nodes.find((n) => n.id === link[1]) || null;
    };

    // 一部のLTX-2.5バリアント(First & Last Frame to Video等)はResolutionSelectorを介さず、
    // width/heightをサブグラフの直接ウィジェット値として持つ。その場合はresolutionNode: null
    // を返し、以降の処理ではaspect_ratio等の操作をスキップする(テンプレートのwidth/height値が
    // そのまま使われる)。
    const rawResolutionNode = findLinkedNode(widthSlot);
    const resolutionNode = (rawResolutionNode && rawResolutionNode.type === "ResolutionSelector") ? rawResolutionNode : null;

    // first_frame/last_frameはoptional入力のため、対応するLoadImageノードが接続されて
    // いないワークフロー(テキストのみで動作するT2V構成など)もサポート対象とする。
    // 未接続の場合はnullのまま返し、必要ならrunGeneration側で動的にノードを注入する。
    const firstFrameInput = _findInputByLabel(instanceNode, "first_frame");
    const lastFrameInput = _findInputByLabel(instanceNode, "last_frame");
    const firstFrameSlot = firstFrameInput ? instanceNode.inputs.indexOf(firstFrameInput) : -1;
    const lastFrameSlot = lastFrameInput ? instanceNode.inputs.indexOf(lastFrameInput) : -1;

    const rawLoadImageNode = findLinkedNode(firstFrameSlot);
    const loadImageNode = (rawLoadImageNode && rawLoadImageNode.type === "LoadImage") ? rawLoadImageNode : null;
    const rawLastLoadImageNode = findLinkedNode(lastFrameSlot);
    const lastLoadImageNode = (rawLastLoadImageNode && rawLastLoadImageNode.type === "LoadImage") ? rawLastLoadImageNode : null;

    return {
        family, sgDef, instanceNode, loadImageNode, lastLoadImageNode, resolutionNode,
        firstFrameSlot, lastFrameSlot, promptIdx, durationIdx,
    };
}

// ============================================
// ワークフロー読み込み
// ============================================

// GenerateUIタブのModelタブが使う「ロードされたワークフローに該当する項目」ハイライト
// (wfm-model-label-active、色は設定のGenerateUI Modelタブ ハイライト色と共通) を、
// Videoタブの左パネルにも適用する。Wan2.2などResolutionSelectorを持たないファミリーは
// Aspect Ratio/Megapixels/Multipleが操作不可(既にdisabled)になるため、ここでも
// 該当なし扱いにしてハイライトしない。
const _VIDEO_FIELD_LABEL_IDS = [
    "wfm-video-prompt-label",
    "wfm-video-duration-label",
    "wfm-video-first-frame-label",
    "wfm-video-last-frame-label",
    "wfm-video-aspect-ratio-label",
    "wfm-video-megapixels-label",
    "wfm-video-multiple-label",
];

function _setFieldActive(id, active) {
    document.getElementById(id)?.classList.toggle("wfm-model-label-active", !!active);
}

function _updateFieldHighlights(nodes) {
    if (!nodes) {
        _VIDEO_FIELD_LABEL_IDS.forEach((id) => _setFieldActive(id, false));
        return;
    }
    const hasResolution = !!nodes.resolutionNode;
    _setFieldActive("wfm-video-prompt-label", true);
    _setFieldActive("wfm-video-duration-label", true);
    _setFieldActive("wfm-video-first-frame-label", nodes.firstFrameSlot !== -1);
    _setFieldActive("wfm-video-last-frame-label", nodes.lastFrameSlot !== -1);
    _setFieldActive("wfm-video-aspect-ratio-label", hasResolution);
    _setFieldActive("wfm-video-megapixels-label", hasResolution);
    _setFieldActive("wfm-video-multiple-label", hasResolution);
}

function _showFramePreview(which, filename) {
    const previewImg = document.getElementById(`wfm-video-${which}-frame-preview`);
    const wrap = document.getElementById(`wfm-video-${which}-frame-wrap`);
    if (!previewImg || !wrap || !filename) return;
    previewImg.src = `${comfyUI.baseUrl}/view?filename=${encodeURIComponent(filename)}&type=input`;
    wrap.style.display = "";
}

export async function loadWorkflowIntoVideoEditor(workflow, filename) {
    const nodes = locateVideoModelNodes(workflow);
    if (!nodes) {
        showToast(t("videoUnsupportedWorkflow"), "error");
        _updateFieldHighlights(null);
        return false;
    }

    _updateFieldHighlights(nodes);
    state.templateWorkflow = workflow;
    state.templateFilename = filename || "";
    // 前回読み込んだワークフローのFirst/Last Frameプレビューが残っていると、画像を使わない
    // ワークフロー(T2V構成など)を読み込んだ際に誤って画像が使われるかのように見えてしまう。
    // state自体は下で再設定されるが、プレビュー表示(DOM)側は明示的にクリアしないと残留する。
    _clearFrame("first");
    _clearFrame("last");

    const nameEl = document.getElementById("wfm-video-wf-name");
    if (nameEl) nameEl.textContent = filename || "Loaded Workflow";

    const { instanceNode, resolutionNode, loadImageNode, lastLoadImageNode, promptIdx, durationIdx } = nodes;

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
    // ResolutionSelectorを介さないバリアント(width/heightが直接ウィジェット値)では
    // aspect_ratio/megapixels/multipleを反映する先が無いため、操作できないことが分かるよう無効化する。
    [aspectEl, mpEl, multEl].forEach((el) => { if (el) el.disabled = !resolutionNode; });

    const fnIdx = _widgetIndex(loadImageNode, "image");
    if (fnIdx !== -1 && loadImageNode.widgets_values[fnIdx]) {
        state.firstFrameFilename = loadImageNode.widgets_values[fnIdx];
        _showFramePreview("first", state.firstFrameFilename);
    }
    const lastFnIdx = _widgetIndex(lastLoadImageNode, "image");
    if (lastFnIdx !== -1 && lastLoadImageNode.widgets_values[lastFnIdx]) {
        state.lastFrameFilename = lastLoadImageNode.widgets_values[lastFnIdx];
        _showFramePreview("last", state.lastFrameFilename);
    }

    showToast(t("videoWorkflowLoaded", filename || ""), "success");
    return true;
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
    const { instanceNode, resolutionNode, loadImageNode, lastLoadImageNode, promptIdx, durationIdx } = nodes;

    instanceNode.widgets_values[promptIdx] = form.prompt;
    instanceNode.widgets_values[durationIdx] = form.duration;

    const arIdx = _widgetIndex(resolutionNode, "aspect_ratio");
    const mpIdx = _widgetIndex(resolutionNode, "megapixels");
    const multIdx = _widgetIndex(resolutionNode, "multiple");
    if (arIdx !== -1) resolutionNode.widgets_values[arIdx] = form.aspectRatio;
    if (mpIdx !== -1) resolutionNode.widgets_values[mpIdx] = form.megapixels;
    if (multIdx !== -1) resolutionNode.widgets_values[multIdx] = form.multiple;

    // first_frame/last_frameは既存のLoadImageノードが接続されている場合のみここで書き換える。
    // 接続が無い場合(loadImageNode/lastLoadImageNode: null)は、画像が新規指定された時だけ
    // _injectFrameNode()でノードごと注入する（未指定ならバイパス=未接続のまま実行）。
    if (loadImageNode) {
        const fnIdx = _widgetIndex(loadImageNode, "image");
        if (fnIdx !== -1) loadImageNode.widgets_values[fnIdx] = state.firstFrameFilename;
    }
    if (lastLoadImageNode) {
        const fnIdx = _widgetIndex(lastLoadImageNode, "image");
        if (fnIdx !== -1) lastLoadImageNode.widgets_values[fnIdx] = state.lastFrameFilename;
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
    const nodes = locateVideoModelNodes(clone);
    if (!nodes) {
        showToast(t("videoUnsupportedWorkflow"), "error");
        return;
    }

    _applyFormToWorkflow(nodes, _readFormValues());
    // first_frame/last_frame: 既存のLoadImageノードが無いワークフロー(T2V構成等)で、
    // ユーザーが新たに画像を指定した場合のみノードを注入する。未指定ならバイパス(未接続のまま実行)。
    if (!nodes.loadImageNode && state.firstFrameFilename) {
        _injectFrameNode(clone, nodes.instanceNode, nodes.firstFrameSlot, state.firstFrameFilename);
    }
    if (!nodes.lastLoadImageNode && state.lastFrameFilename) {
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

function _renderResult(images) {
    // Both MiniMax H3 and LTX-2.5 emit a single VIDEO output — but guard generically
    // (prefer an mp4 if present) in case a future video workflow's SaveVideo/PreviewVideo
    // ordering differs.
    const media = (images || []).find((img) => img.filename.toLowerCase().endsWith(".mp4")) || images?.[0];
    if (!media) {
        _setPreviewMedia(null, null);
        return;
    }
    const params = new URLSearchParams({ filename: media.filename, subfolder: media.subfolder || "", type: media.type || "output" });
    const src = `${comfyUI.baseUrl}/view?${params}`;
    _setPreviewMedia(src, {
        kind: media.type === "input" ? "input" : "output",
        filename: media.filename,
        subfolder: media.subfolder || "",
        type: media.type || "output",
    });
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
    _populateAspectRatioOptions();

    _wireDropZone("wfm-video-first-frame-drop", "wfm-video-first-frame-file", (file) => _handleFrameUpload("first", file));
    _wireDropZone("wfm-video-last-frame-drop", "wfm-video-last-frame-file", (file) => _handleFrameUpload("last", file));

    document.getElementById("wfm-video-first-frame-clear")?.addEventListener("click", () => _clearFrame("first"));
    document.getElementById("wfm-video-last-frame-clear")?.addEventListener("click", () => _clearFrame("last"));
    document.getElementById("wfm-video-generate-btn")?.addEventListener("click", runGeneration);

    _wireVideoSourcePanel();
    _initPropTabs();
    _initFrameTab();
    _initGifTab();

    // 保存済みの音量を適用し、以降ユーザーがネイティブコントロールで変更した音量も
    // 自動保存する（要素自体は永続的なので初期化時に一度呼べば十分）。
    applyStoredVideoVolume(document.getElementById("wfm-video-preview-video"));
}

/**
 * Gallery Tab - output画像ブラウザ
 * 3カラム: フォルダツリー | 画像一覧 | 詳細パネル
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { loadFileIntoMetadataTab, extractPrompts, buildPromptItem } from "./metadata-tab.js";
import { loadWorkflowIntoEditor } from "./generate-tab.js";
import { escapeHtml, setupSearchClearBtn, getAiBackendDefaultUrl } from "./util.js";
import { comfyWorkflow } from "./comfyui-workflow.js";
import { comfyUI } from "./comfyui-client.js";
import { comfyEditor } from "./comfyui-editor.js";
import { callLLM, loadAiSettings, isValidBackendUrl } from "./ai-tab.js";
import { initImagePromptTab, activateImagePromptTab } from "./image-prompt-tab.js";
import { initStyleCatalogTab, activateStyleCatalogTab } from "./style-catalog-tab.js";
import { applyStoredVideoVolume } from "./settings-tab.js";

// ── 定数 ─────────────────────────────────────────────────────

const API = {
    folders:        (root)     => `/wfm/gallery/folders?root=${encodeURIComponent(root)}`,
    images:         (params)   => `/wfm/gallery/images?${new URLSearchParams(params)}`,
    imageMeta:      (path)     => `/wfm/gallery/image/meta?path=${encodeURIComponent(path)}`,
    imageWorkflow:  (path)     => `/wfm/gallery/image/workflow?path=${encodeURIComponent(path)}`,
    serveImage:     (path)     => `/wfm/gallery/image/serve?path=${encodeURIComponent(path)}`,
    thumb:          (path, w = 256) => `/wfm/gallery/image/thumb?path=${encodeURIComponent(path)}&w=${w}`,
    bulkFavorite:   "/wfm/gallery/bulk/favorite",
    bulkGroup:      "/wfm/gallery/bulk/group",
    saveImageMeta:              `/wfm/gallery/image/meta`,
    toggleFavorite:             `/wfm/gallery/image/favorite`,
    groups:                     `/wfm/gallery/groups`,
    groupCreate:                `/wfm/gallery/groups`,
    groupEnsure:                `/wfm/gallery/groups/ensure`,
    groupRename:    (name)     => `/wfm/gallery/groups/${encodeURIComponent(name)}`,
    groupDelete:    (name)     => `/wfm/gallery/groups/${encodeURIComponent(name)}`,
    groupAdd:       (name)     => `/wfm/gallery/groups/${encodeURIComponent(name)}/add`,
    groupRemove:    (name)     => `/wfm/gallery/groups/${encodeURIComponent(name)}/remove`,
    groupClear:     (name)     => `/wfm/gallery/groups/${encodeURIComponent(name)}/clear`,
    groupImages:    (name)     => `/wfm/gallery/groups/${encodeURIComponent(name)}/images`,
    folderCreate:               `/wfm/gallery/folder`,
    folderDelete:               `/wfm/gallery/folder`,
    imagesDelete:               `/wfm/gallery/images/delete`,
    imagesMove:                 `/wfm/gallery/images/move`,
    imagesExportZip:            `/wfm/gallery/images/export-zip`,
};

export const FEEDER_GROUP = "__Feeder__";
export const VIDEO_GROUP = "__VideoAssets__";
// Video Planを名前を付けて保存していない状態で生成した動画の一時置き場。
// __VideoAssets__(ユーザーが手動でキュレーションする素材グループ)とは異なり、
// 未保存Planの生成物置き場として自動的に追加される作業用グループ。
export const VTEMP_GROUP = "__vtemp__";

const _RESERVED_GROUPS = [FEEDER_GROUP, VIDEO_GROUP, VTEMP_GROUP];
function _isReservedGroup(name) {
    return _RESERVED_GROUPS.includes(name);
}

// 拡張子から動画ファイル（mp4）かどうかを判定する。
// 一覧アイテムは path/filename、詳細メタ(get_image_metadata)は ext フィールドを持つため両対応。
function isVideoFile(img) {
    const source = img?.ext || img?.filename || img?.path || "";
    return source.toLowerCase().endsWith(".mp4");
}

// ComfyUI Comic Creater からiframe越しに画像を受け取り、Generate UIのImage入力スロットへ直接セットする（I2I連携）。
// Comic Creater側の「I2Iへ送る」ボタンから
// iframe.contentWindow._wfmReceiveImageForI2I(blob, name, workflowData?, workflowFilename?) として呼ばれる。
// 画像スロットへのセット自体は wfm-gallery-send-genui-image-btn のクリックハンドラ（Galleryの選択画像を送る版）と同一。
// workflowData が渡された場合（Comic Creater側の設定タブでデフォルトワークフローが有効な時）は、
// 画像をセットする前にそのワークフローを読み込む。
window._wfmReceiveImageForI2I = async (blob, name, workflowData, workflowFilename) => {
    try {
        if (workflowData) {
            try {
                // iframeロード直後などモデルリスト未取得のままワークフローを読み込むと、
                // Model/生成UIタブのCheckpoint等ドロップダウンが空のままレンダリングされてしまう。
                // 接続確認・モデルリスト取得を保証してからワークフローを読み込む
                if (!comfyUI.connected) {
                    await comfyUI.checkConnection();
                }
                if (comfyUI.connected && (!comfyEditor.models.checkpoints || comfyEditor.models.checkpoints.length === 0)) {
                    await comfyEditor.loadModelLists();
                }
                await loadWorkflowIntoEditor(workflowData, workflowFilename || "workflow.json");
            } catch (e) {
                console.warn("[I2I] failed to load default workflow:", e);
            }
        }
        const file = new File([blob], name || "cc-image.png", { type: blob.type || "image/png" });
        document.querySelector('[data-tab="generate"]')?.click();
        document.querySelector('.wfm-gen-subtab-btn[data-subtab="input"]')?.click();
        document.querySelector('.wfm-input-inner-tab[data-input-tab="image"]')?.click();
        await comfyEditor.applyImageToSlot(file, 0);
        showToast(t("gallerySentGenUI"), "success");
        return true;
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
        return false;
    }
};

// ComfyUI Comic Creater からiframe越しに合成画像+マスクを受け取り、Image Edit タブの
// Inpaint機能をUIを開かずに直接実行して結果URLを返す（Inpaint連携）。
// Comic Creater側の Image タブ「Inpaint」から
// iframe.contentWindow._wfmReceiveInpaintRequest(imageBlob, maskBlob, params, workflowData?, workflowFilename?) として呼ばれる。
// workflowData が渡された場合（Comic Creater側の設定タブでInpaint用デフォルトワークフローが有効な時）は、
// 実行前にそのワークフローを読み込む。渡されない場合はGenerate UIに現在ロード中のワークフローをそのまま使う。
window._wfmReceiveInpaintRequest = async (imageBlob, maskBlob, params, workflowData, workflowFilename) => {
    try {
        if (workflowData) {
            if (!comfyUI.connected) {
                await comfyUI.checkConnection();
            }
            if (comfyUI.connected && (!comfyEditor.models.checkpoints || comfyEditor.models.checkpoints.length === 0)) {
                await comfyEditor.loadModelLists();
            }
            await loadWorkflowIntoEditor(workflowData, workflowFilename || "workflow.json");
        }
        return await window._wfmImageEditTab.runInpaintExternal(imageBlob, maskBlob, params);
    } catch (e) {
        return { ok: false, message: e.message };
    }
};

// ComfyUI Comic Creater からiframe越しに画像を受け取り、Image Edit タブの
// Select I2I機能をUIを開かずに直接実行して結果URLを返す（I2I連携、マスク不要）。
// Comic Creater側の Image タブ「Select→I2I」から
// iframe.contentWindow._wfmReceiveI2IRunRequest(imageBlob, params, workflowData?, workflowFilename?) として呼ばれる。
// workflowData が渡された場合（Comic Creater側のI2I設定でデフォルトワークフローが有効な時）は、
// 実行前にそのワークフローを読み込む。渡されない場合はGenerate UIに現在ロード中のワークフローをそのまま使う。
window._wfmReceiveI2IRunRequest = async (imageBlob, params, workflowData, workflowFilename) => {
    try {
        if (workflowData) {
            if (!comfyUI.connected) {
                await comfyUI.checkConnection();
            }
            if (comfyUI.connected && (!comfyEditor.models.checkpoints || comfyEditor.models.checkpoints.length === 0)) {
                await comfyEditor.loadModelLists();
            }
            await loadWorkflowIntoEditor(workflowData, workflowFilename || "workflow.json");
        }
        return await window._wfmImageEditTab.runI2IExternal(imageBlob, params);
    } catch (e) {
        return { ok: false, message: e.message };
    }
};

// ComfyUI Comic Creater からiframe越しにコマの設定（シーン・要素・セリフ等）を受け取り、
// AIタブの設定タブと同じLLM接続設定（Ollama/LM Studio）で画像生成プロンプトの下書きを
// 生成して返す（半自動マンガ作成の「L」ボタン連携用）。
// Comic Creater側のスクリプトタブ「L」ボタンから
// iframe.contentWindow._wfmReceiveLLMPromptRequest(context) として呼ばれる。
// context: { scene, elements, dialogues, existingPrompt }（いずれも文字列、空文字可）
window._wfmReceiveLLMPromptRequest = async (context) => {
    try {
        const settings = loadAiSettings();
        const { backend = "ollama", backendUrl, model } = settings;
        const url = backendUrl || getAiBackendDefaultUrl(backend);
        if (!isValidBackendUrl(url)) return { ok: false, message: "AI settings: invalid backend URL (configure it in the Settings tab)" };
        if (!model) return { ok: false, message: "AI settings: no model selected (configure it in the Settings tab)" };

        const { scene = "", elements = "", dialogues = "", existingPrompt = "" } = context || {};
        const prompt = [
            "Create a concise Stable Diffusion image generation prompt (English, comma-separated tags/phrases describing scene, composition, character appearance and action) for one manga panel, based on the following context.",
            "Output only the prompt text, nothing else.",
            scene ? `Scene: ${scene}` : null,
            elements ? `Characters/elements: ${elements}` : null,
            dialogues ? `Dialogue: ${dialogues}` : null,
            existingPrompt ? `Current draft prompt (revise/improve it): ${existingPrompt}` : null,
        ].filter(Boolean).join("\n");

        const result = await callLLM(url, backend, model, prompt);
        const text = (result || "").trim();
        if (!text) return { ok: false, message: "LLM returned an empty response" };
        return { ok: true, text };
    } catch (e) {
        return { ok: false, message: e.message };
    }
};

// ComfyUI Comic Creater からiframe越しに画像プロンプト・サイズを受け取り、Generate UIで
// テキストから画像を生成して結果URLを返す（半自動マンガ作成のコマ単位バッチ画像生成用）。
// Comic Creater側のスクリプトタブ「画像を一括生成」から
// iframe.contentWindow._wfmReceiveGenerateRequest(prompt, width, height, negative, workflowData?, workflowFilename?)
// として呼ばれる。I2I/Inpaintと異なり画像アップロードは行わない（txt2img）。
// workflowData が渡された場合（Comic Creater側のT2I設定でデフォルトワークフローが有効な時）は、
// 実行前にそのワークフローを読み込む。渡されない場合はGenerate UIに現在ロード中のワークフローをそのまま使う。
window._wfmReceiveGenerateRequest = async (prompt, width, height, negative, workflowData, workflowFilename) => {
    try {
        if (!window._wfmGenerateTab?.generate) return { ok: false, message: "Generate UI is not ready yet" };

        if (workflowData) {
            try {
                if (!comfyUI.connected) {
                    await comfyUI.checkConnection();
                }
                if (comfyUI.connected && (!comfyEditor.models.checkpoints || comfyEditor.models.checkpoints.length === 0)) {
                    await comfyEditor.loadModelLists();
                }
                await loadWorkflowIntoEditor(workflowData, workflowFilename || "workflow.json");
            } catch (e) {
                console.warn("[T2I] failed to load default workflow:", e);
            }
        }

        const analysis = comfyUI.currentAnalysis;
        if (!comfyUI.currentWorkflow || !analysis) return { ok: false, message: "No workflow loaded in Generate UI" };

        const workflow = JSON.parse(JSON.stringify(comfyUI.currentWorkflow));
        const latent = analysis.latent_nodes?.[0];
        if (latent && width && height && workflow[latent.id]) {
            workflow[latent.id].inputs.width = width;
            workflow[latent.id].inputs.height = height;
        }

        comfyEditor.setPromptText("positive", prompt || "", { workflow, analysis });
        if (negative) comfyEditor.setPromptText("negative", negative, { workflow, analysis });

        await window._wfmGenerateTab.generate(workflow);

        const resultUrl = document.getElementById("wfm-gen-result-img")?.src;
        if (!resultUrl) return { ok: false, message: "No result image produced" };
        return { ok: true, url: resultUrl };
    } catch (e) {
        return { ok: false, message: e.message };
    }
};

// ── ページング ────────────────────────────────────────────────
const PAGE_SIZE = 50;
let _renderedCount = 0;
let _scrollObserver = null;

// ── 状態 ─────────────────────────────────────────────────────

const state = {
    outputRoot: "",        // ComfyUI output フォルダ
    currentFolder: "",     // 選択中フォルダ絶対パス
    images: [],            // 現在表示中画像リスト
    selectedImage: null,   // 選択中画像オブジェクト（詳細パネル用）
    viewMode: localStorage.getItem("wfm_gallery_view") || "thumb",
    sortBy: localStorage.getItem("wfm_gallery_sort") || "date_desc",
    search: "",
    favoriteOnly: false,
    tagFilter: "",
    groupFilter: "",       // グループフィルタ
    groups: [],
    embeddedWorkflow: null,  // 選択画像のworkflow JSON
    selectedImages: new Set(), // 複数選択中のパス Set
    lastSelectionIndex: -1,    // Shift選択のアンカーインデックス
    folderTree: null,      // フォルダツリー全体（移動先選択に使用）
};

// ── ヘルパー ──────────────────────────────────────────────────

async function apiFetch(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(mtime) {
    return new Date(mtime * 1000).toLocaleString();
}

function formatDuration(seconds) {
    const total = Math.round(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

async function openImageInMetadataTab(img) {
    try {
        const res = await fetch(API.serveImage(img.path));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const file = new File([blob], img.filename, { type: blob.type || "image/png" });
        await loadFileIntoMetadataTab(file);
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

async function downloadImage(img) {
    try {
        const res = await fetch(API.serveImage(img.path));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = img.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(t("downloadStarted"), "success");
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

async function exportSelectedImagesToZip(paths) {
    if (paths.length === 0) return;
    try {
        const res = await fetch(API.imagesExportZip, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `gallery_export_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(t("exportCompleted"), "success");
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

// ── フォルダツリー ────────────────────────────────────────────

function _getExpandedPaths() {
    const expanded = new Set();
    document.querySelectorAll(".wfm-gallery-tree-item").forEach(item => {
        const arrow = item.querySelector(".wfm-gallery-tree-arrow");
        if (arrow && arrow.dataset.expanded === "true") {
            expanded.add(item.dataset.path);
        }
    });
    return expanded;
}

function _restoreTreeState(expandedPaths, selectedPath) {
    // 親→子の順で展開するため、階層の浅い順にソート
    const sorted = [...expandedPaths].sort(
        (a, b) => a.split("/").length - b.split("/").length
    );
    for (const path of sorted) {
        document.querySelectorAll(".wfm-gallery-tree-item").forEach(item => {
            if (item.dataset.path !== path) return;
            const arrow = item.querySelector(".wfm-gallery-tree-arrow");
            if (arrow && arrow.dataset.expanded !== "true" && arrow.style.visibility !== "hidden") {
                arrow.click();
            }
        });
    }
    // 選択状態を復元（labelクリックは画像リロードを伴うのでハイライトのみ）
    if (selectedPath) {
        document.querySelectorAll(".wfm-gallery-tree-item").forEach(item => {
            if (item.dataset.path === selectedPath) {
                document.querySelectorAll(".wfm-gallery-tree-item.selected").forEach(el => el.classList.remove("selected"));
                item.classList.add("selected");
            }
        });
    }
}

async function loadFolderTree() {
    if (!state.outputRoot) return;

    // 再構築前に展開状態を保存
    const expandedPaths = _getExpandedPaths();
    const isFirstLoad = expandedPaths.size === 0 && !state.currentFolder;

    const tree = document.getElementById("wfm-gallery-tree");
    tree.innerHTML = `<p class="wfm-placeholder">${t("loading")}</p>`;

    try {
        const data = await apiFetch(API.folders(state.outputRoot));
        if (data.error) {
            tree.innerHTML = `<p class="wfm-placeholder">${escapeHtml(data.error)}</p>`;
            return;
        }
        state.folderTree = data;
        tree.innerHTML = "";
        renderTreeNode(data, tree, 0, true);

        if (isFirstLoad) {
            // 初回のみ root を自動選択
            const firstLabel = tree.querySelector(".wfm-gallery-tree-label");
            if (firstLabel) firstLabel.click();
        } else {
            // 展開状態と選択ハイライトを復元
            _restoreTreeState(expandedPaths, state.currentFolder);
        }
    } catch (e) {
        tree.innerHTML = `<p class="wfm-placeholder">Error: ${escapeHtml(e.message)}</p>`;
    }
}

function renderTreeNode(node, container, depth, isRoot) {
    const item = document.createElement("div");
    item.className = "wfm-gallery-tree-item";
    item.style.paddingLeft = `${depth * 12}px`;
    item.dataset.path = node.abs_path;

    const hasChildren = node.children && node.children.length > 0;
    const absPath = node.abs_path;

    // 展開アイコン
    const arrow = document.createElement("span");
    arrow.className = "wfm-gallery-tree-arrow";
    if (hasChildren) {
        arrow.textContent = "▶";
        arrow.dataset.expanded = "false";
    } else {
        arrow.textContent = " ";
        arrow.style.visibility = "hidden";
    }
    item.appendChild(arrow);

    // フォルダ名
    const label = document.createElement("span");
    label.className = "wfm-gallery-tree-label";
    label.textContent = isRoot ? "[root]" : node.name;
    if (node.image_count > 0) {
        const badge = document.createElement("span");
        badge.className = "wfm-gallery-tree-count";
        badge.textContent = node.image_count;
        label.appendChild(badge);
    }
    item.appendChild(label);

    // クリックで画像一覧更新
    label.addEventListener("click", () => {
        document.querySelectorAll(".wfm-gallery-tree-item.selected").forEach(el => el.classList.remove("selected"));
        item.classList.add("selected");
        state.currentFolder = absPath;
        state.selectedImages.clear();
        state.lastSelectionIndex = -1;
        updateBulkBar();
        loadImages();
        // Delete Folder ボタン: rootは削除不可
        const delBtn = document.getElementById("wfm-gallery-folder-delete-btn");
        if (delBtn) {
            delBtn.disabled = (absPath === state.outputRoot.replace(/\\/g, "/") || absPath === state.outputRoot);
        }
    });

    // 矢印クリックで子ノード展開/折りたたみ
    if (hasChildren) {
        const childContainer = document.createElement("div");
        childContainer.className = "wfm-gallery-tree-children";
        childContainer.style.display = "none";

        arrow.addEventListener("click", (e) => {
            e.stopPropagation();
            const expanded = arrow.dataset.expanded === "true";
            if (!expanded) {
                arrow.dataset.expanded = "true";
                arrow.textContent = "▼";
                childContainer.style.display = "";
                if (childContainer.children.length === 0) {
                    node.children.forEach(child => renderTreeNode(child, childContainer, depth + 1, false));
                }
            } else {
                arrow.dataset.expanded = "false";
                arrow.textContent = "▶";
                childContainer.style.display = "none";
            }
        });

        container.appendChild(item);
        container.appendChild(childContainer);

        // root フォルダはデフォルトで展開状態にする（フォルダスキャン高速化により
        // サブフォルダの内容もすぐ確認できるようになったため、折りたたみ初期状態だと
        // 気付きにくい）
        if (isRoot) {
            arrow.dataset.expanded = "true";
            arrow.textContent = "▼";
            childContainer.style.display = "";
            node.children.forEach(child => renderTreeNode(child, childContainer, depth + 1, false));
        }
    } else {
        container.appendChild(item);
    }
}

// ── 画像一覧 ─────────────────────────────────────────────────

async function loadImages() {
    if (!state.currentFolder) return;

    const grid = document.getElementById("wfm-gallery-grid");
    grid.innerHTML = `<p class="wfm-placeholder">${t("loading")}</p>`;

    const params = {
        folder: state.currentFolder,
        sort: state.sortBy,
    };
    if (state.search) params.search = state.search;
    if (state.favoriteOnly) params.favorite = "true";
    if (state.tagFilter) params.tag = state.tagFilter;

    // グループフィルタはサーバーサイドで処理。グループのメンバーは現在のフォルダの
    // サブフォルダに散らばっている可能性がある(例: 動画は"video"サブフォルダ配下)ため、
    // 通常のフォルダ単位ブラウズ(非再帰)とは異なり、フィルタ時はフォルダ配下を再帰的に
    // 検索する。
    if (state.groupFilter) {
        params.group = state.groupFilter;
        params.recursive = "true";
    }

    try {
        const images = (await apiFetch(API.images(params))).images || [];
        state.images = images;
        state.lastSelectionIndex = -1;
        document.getElementById("wfm-gallery-count").textContent = `${state.images.length} images`;
        renderImages();
        updateTagFilter(state.images);
    } catch (e) {
        grid.innerHTML = `<p class="wfm-placeholder">Error: ${escapeHtml(e.message)}</p>`;
    }
}

function renderImages() {
    const grid = document.getElementById("wfm-gallery-grid");
    grid.className = `wfm-gallery-grid wfm-gallery-view-${state.viewMode}`;

    _disconnectScrollObserver();
    _renderedCount = 0;

    if (state.images.length === 0) {
        grid.innerHTML = `<p class="wfm-placeholder">No images found.</p>`;
        return;
    }

    grid.innerHTML = "";

    if (state.viewMode === "thumb") {
        _appendNextPage(grid);
        if (_renderedCount < state.images.length) {
            _attachScrollSentinel(grid);
        }
    } else {
        grid.appendChild(createTable(state.images));
    }
}

function _appendNextPage(grid) {
    const end = Math.min(_renderedCount + PAGE_SIZE, state.images.length);
    const fragment = document.createDocumentFragment();
    for (let i = _renderedCount; i < end; i++) {
        fragment.appendChild(createThumbCard(state.images[i]));
    }
    grid.appendChild(fragment);
    _renderedCount = end;
}

function _disconnectScrollObserver() {
    if (_scrollObserver) {
        _scrollObserver.disconnect();
        _scrollObserver = null;
    }
    document.getElementById("wfm-gallery-scroll-sentinel")?.remove();
}

function _attachScrollSentinel(grid) {
    const sentinel = document.createElement("div");
    sentinel.id = "wfm-gallery-scroll-sentinel";
    sentinel.style.cssText = "height:1px;width:100%;grid-column:1/-1";
    grid.appendChild(sentinel);

    _scrollObserver = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        _appendNextPage(grid);
        if (_renderedCount >= state.images.length) {
            _disconnectScrollObserver();
        } else {
            // sentinel を末尾に移動
            grid.appendChild(sentinel);
        }
    }, { rootMargin: "300px" });

    _scrollObserver.observe(sentinel);
}

function createThumbCard(img) {
    const card = document.createElement("div");
    card.className = "wfm-gallery-thumb-card";
    card.title = img.filename;
    card.dataset.path = img.path;
    if (state.selectedImages.has(img.path)) {
        card.classList.add("multi-selected");
    }
    if (state.selectedImage && state.selectedImage.path === img.path) {
        card.classList.add("selected");
    }

    // サムネイル画像
    const imgEl = document.createElement("img");
    imgEl.className = "wfm-gallery-thumb-img";
    imgEl.loading = "lazy";
    imgEl.src = API.thumb(img.path);
    imgEl.alt = img.filename;
    imgEl.onerror = () => {
        imgEl.style.display = "none";
        const placeholder = document.createElement("div");
        placeholder.className = "wfm-gallery-thumb-placeholder";
        placeholder.textContent = "?";
        card.insertBefore(placeholder, imgEl.nextSibling);
    };
    card.appendChild(imgEl);

    // 動画ファイルは再生アイコンバッジを重ねて表示（サムネイル自体は先頭フレームのJPEG）
    if (isVideoFile(img)) {
        const playBadge = document.createElement("div");
        playBadge.className = "wfm-gallery-thumb-video-badge";
        playBadge.textContent = "▶";
        card.appendChild(playBadge);
    }

    // お気に入りトグルボタン（カード右上）
    const favBtn = document.createElement("button");
    favBtn.className = `wfm-gallery-thumb-fav-btn${img.favorite ? " active" : ""}`;
    favBtn.title = img.favorite ? "Unfavorite" : "Favorite";
    favBtn.textContent = img.favorite ? "★" : "☆";
    favBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await toggleFavoriteInPlace(img, favBtn);
    });
    card.appendChild(favBtn);

    // Feederグループトグルボタン（カード左上）
    const inFeeder = (img.groups || []).includes(FEEDER_GROUP);
    const feederBtn = document.createElement("button");
    feederBtn.className = `wfm-gallery-thumb-feeder-btn${inFeeder ? " active" : ""}`;
    feederBtn.title = inFeeder ? "Remove from Feeder" : "Add to Feeder";
    feederBtn.textContent = "F";
    feederBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await toggleFeederGroupInPlace(img, feederBtn);
    });
    card.appendChild(feederBtn);

    // クリック: 詳細表示 / Ctrl+クリック: 複数選択 / Shift+クリック: 範囲選択 / Alt+クリック: Metadataタブで開く
    card.addEventListener("click", (e) => {
        if (e.altKey) {
            e.preventDefault();
            openImageInMetadataTab(img);
            return;
        }
        const idx = state.images.findIndex(i => i.path === img.path);
        if (e.shiftKey && state.lastSelectionIndex !== -1) {
            // 範囲選択: アンカーから現在位置まで一括追加
            const from = Math.min(state.lastSelectionIndex, idx);
            const to = Math.max(state.lastSelectionIndex, idx);
            for (let i = from; i <= to; i++) {
                state.selectedImages.add(state.images[i].path);
            }
            _applySelectionToDOM();
            updateBulkBar();
        } else if (e.ctrlKey || e.metaKey) {
            // 複数選択トグル
            if (state.selectedImages.has(img.path)) {
                state.selectedImages.delete(img.path);
                card.classList.remove("multi-selected");
            } else {
                state.selectedImages.add(img.path);
                card.classList.add("multi-selected");
            }
            state.lastSelectionIndex = idx;
            updateBulkBar();
        } else {
            // 通常選択: 詳細表示
            state.selectedImage = img;
            state.lastSelectionIndex = idx;
            document.querySelectorAll(".wfm-gallery-thumb-card.selected").forEach(el => el.classList.remove("selected"));
            card.classList.add("selected");
            loadImageDetail(img);
        }
    });

    // ダブルクリック: 拡大表示
    card.addEventListener("dblclick", () => {
        openLightbox(img);
    });

    return card;
}

function createTable(images) {
    const table = document.createElement("table");
    table.className = "wfm-gallery-table";

    // Fav列を最左列に配置
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr>
        <th>Fav</th>
        <th></th>
        <th>Filename</th>
        <th>Size</th>
        <th>Date</th>
        <th>Tags</th>
    </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    images.forEach(img => {
        const tr = document.createElement("tr");
        tr.dataset.path = img.path;
        if (state.selectedImages.has(img.path)) {
            tr.classList.add("multi-selected");
        }
        if (state.selectedImage && state.selectedImage.path === img.path) {
            tr.classList.add("selected");
        }

        // Fav列を先頭に
        const favBtn = document.createElement("button");
        favBtn.className = `wfm-gallery-table-fav-btn${img.favorite ? " active" : ""}`;
        favBtn.title = img.favorite ? "Unfavorite" : "Favorite";
        favBtn.textContent = img.favorite ? "★" : "☆";
        favBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            await toggleFavoriteInPlace(img, favBtn);
        });

        const tdFav = document.createElement("td");
        tdFav.appendChild(favBtn);

        const tdThumb = document.createElement("td");
        tdThumb.innerHTML = `<img src="${API.thumb(img.path, 128)}" class="wfm-gallery-table-thumb" loading="lazy" alt="">`;

        const tdName = document.createElement("td");
        tdName.className = "wfm-gallery-table-name";
        tdName.title = img.filename;
        tdName.textContent = img.filename;

        const tdSize = document.createElement("td");
        tdSize.textContent = formatBytes(img.size);

        const tdDate = document.createElement("td");
        tdDate.textContent = formatDate(img.mtime);

        const tdTags = document.createElement("td");
        tdTags.innerHTML = (img.tags || []).map(tag => `<span class="wfm-gallery-tag-badge">${escapeHtml(tag)}</span>`).join("");

        tr.appendChild(tdFav);
        tr.appendChild(tdThumb);
        tr.appendChild(tdName);
        tr.appendChild(tdSize);
        tr.appendChild(tdDate);
        tr.appendChild(tdTags);

        // クリック: 詳細表示 / Ctrl+クリック: 複数選択 / Shift+クリック: 範囲選択 / Alt+クリック: Metadataタブで開く
        tr.addEventListener("click", (e) => {
            if (e.altKey) {
                e.preventDefault();
                openImageInMetadataTab(img);
                return;
            }
            const idx = state.images.findIndex(i => i.path === img.path);
            if (e.shiftKey && state.lastSelectionIndex !== -1) {
                const from = Math.min(state.lastSelectionIndex, idx);
                const to = Math.max(state.lastSelectionIndex, idx);
                for (let i = from; i <= to; i++) {
                    state.selectedImages.add(state.images[i].path);
                }
                _applySelectionToDOM();
                updateBulkBar();
            } else if (e.ctrlKey || e.metaKey) {
                if (state.selectedImages.has(img.path)) {
                    state.selectedImages.delete(img.path);
                    tr.classList.remove("multi-selected");
                } else {
                    state.selectedImages.add(img.path);
                    tr.classList.add("multi-selected");
                }
                state.lastSelectionIndex = idx;
                updateBulkBar();
            } else {
                state.selectedImage = img;
                state.lastSelectionIndex = idx;
                tbody.querySelectorAll("tr.selected").forEach(el => el.classList.remove("selected"));
                tr.classList.add("selected");
                loadImageDetail(img);
            }
        });

        tr.addEventListener("dblclick", () => openLightbox(img));

        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
}

// ── 複数選択ユーティリティ ────────────────────────────────────

/** state.selectedImages に基づき、描画済みの要素の multi-selected クラスを同期する */
function _applySelectionToDOM() {
    const grid = document.getElementById("wfm-gallery-grid");
    if (!grid) return;
    grid.querySelectorAll("[data-path]").forEach(el => {
        el.classList.toggle("multi-selected", state.selectedImages.has(el.dataset.path));
    });
}

// ── 複数選択バー ──────────────────────────────────────────────

function updateBulkBar() {
    const bar = document.getElementById("wfm-gallery-bulk-bar");
    const countEl = document.getElementById("wfm-gallery-bulk-count");
    if (!bar) return;
    const count = state.selectedImages.size;
    if (count > 0) {
        bar.style.display = "";
        countEl.textContent = `${count} ${t("galleryBulkSelected")}`;
    } else {
        bar.style.display = "none";
    }
    // Compare ボタンは 2〜4 枚選択時のみ表示
    const compareBtn = document.getElementById("wfm-gallery-bulk-compare");
    if (compareBtn) {
        const show = count >= 2 && count <= 4;
        compareBtn.style.display = show ? "" : "none";
        compareBtn.textContent = t("galleryBulkCompare");
    }
}

// ── お気に入りトグル（インプレース更新） ─────────────────────────

async function toggleFavoriteInPlace(img, btn) {
    try {
        const res = await fetch(API.toggleFavorite, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: img.path }),
        });
        const data = await res.json();
        img.favorite = data.favorite;
        const cached = state.images.find(i => i.path === img.path);
        if (cached) cached.favorite = data.favorite;
        btn.textContent = data.favorite ? "★" : "☆";
        btn.title = data.favorite ? "Unfavorite" : "Favorite";
        btn.classList.toggle("active", data.favorite);
        if (state.selectedImage && state.selectedImage.path === img.path) {
            state.selectedImage.favorite = data.favorite;
        }
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

async function toggleFeederGroupInPlace(img, btn) {
    const inFeeder = (img.groups || []).includes(FEEDER_GROUP);
    try {
        if (inFeeder) {
            await fetch(API.groupRemove(FEEDER_GROUP), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: img.path }),
            });
            img.groups = (img.groups || []).filter(g => g !== FEEDER_GROUP);
            showToast(t("removedFromFeeder"), "success");
        } else {
            await fetch(API.groupAdd(FEEDER_GROUP), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: img.path }),
            });
            img.groups = [...(img.groups || []), FEEDER_GROUP];
            showToast(t("addedToFeeder"), "success");
        }
        const cached = state.images.find(i => i.path === img.path);
        if (cached) cached.groups = img.groups;
        const nowInFeeder = img.groups.includes(FEEDER_GROUP);
        btn.classList.toggle("active", nowInFeeder);
        btn.title = nowInFeeder ? "Remove from Feeder" : "Add to Feeder";
        if (state.selectedImage && state.selectedImage.path === img.path) {
            state.selectedImage.groups = img.groups;
        }
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

// ── タグフィルター更新 ────────────────────────────────────────

function updateTagFilter(images) {
    const tags = new Set();
    images.forEach(img => (img.tags || []).forEach(tag => tags.add(tag)));
    const sel = document.getElementById("wfm-gallery-tag-filter");
    const current = sel.value;
    sel.innerHTML = `<option value="">${t("galleryAllTags")}</option>`;
    [...tags].sort().forEach(tag => {
        const opt = document.createElement("option");
        opt.value = tag;
        opt.textContent = tag;
        if (tag === current) opt.selected = true;
        sel.appendChild(opt);
    });
}

// ── 詳細パネル ────────────────────────────────────────────────

function _updateCopyCanvasBtn() {
    const btn = document.getElementById("wfm-gallery-copy-workflow-btn");
    if (!btn) return;
    btn.disabled = !state.embeddedWorkflow;
    btn.title = "";
}

async function loadImageDetail(img) {
    // ファイル操作ボタンを有効化
    const moveBtn = document.getElementById("wfm-gallery-img-move-btn");
    const delBtn = document.getElementById("wfm-gallery-img-delete-btn");
    if (moveBtn) moveBtn.disabled = false;
    if (delBtn) delBtn.disabled = false;

    // プレビュー（mp4は<video controls>、それ以外は<img>）
    const preview = document.getElementById("wfm-gallery-detail-preview");
    const isVideo = isVideoFile(img);
    const mediaHtml = isVideo
        ? `<video src="${API.serveImage(img.path)}" class="wfm-gallery-detail-img" controls title="Double-click to enlarge"></video>`
        : `<img src="${API.serveImage(img.path)}" class="wfm-gallery-detail-img" alt="${escapeHtml(img.filename)}" title="Double-click to enlarge">`;
    preview.innerHTML = `
        <div class="wfm-gallery-preview-wrapper">
            ${mediaHtml}
        </div>
    `;
    const previewMediaEl = preview.querySelector(isVideo ? "video" : "img");
    previewMediaEl.addEventListener("dblclick", () => openLightbox(img));
    if (isVideo) applyStoredVideoVolume(previewMediaEl);

    // ファイル名
    document.getElementById("wfm-gallery-detail-filename").textContent = img.filename;

    // 基本情報
    document.getElementById("wfm-gallery-info-name").textContent = img.filename;
    document.getElementById("wfm-gallery-info-size").textContent = `Size: ${formatBytes(img.size)}`;
    document.getElementById("wfm-gallery-info-date").textContent = `Date: ${formatDate(img.mtime)}`;

    // タグ
    renderTagsDisplay(img.tags || []);

    // メモ
    document.getElementById("wfm-gallery-memo").value = img.memo || "";

    // 埋め込みメタデータとworkflow取得
    try {
        const [metaRes, wfRes] = await Promise.all([
            apiFetch(API.imageMeta(img.path)),
            apiFetch(API.imageWorkflow(img.path)),
        ]);
        state.embeddedWorkflow = wfRes.has_workflow ? wfRes.workflow : null;
        renderWorkflowJson(state.embeddedWorkflow);
        _updateCopyCanvasBtn();
        renderImagePromptSection(metaRes.image_prompt);
        renderDimensionInfo(metaRes);
        // Promptタブは prompt_workflow (API形式優先) を使う。トップレベルとサブグラフに
        // 独立した複数系統を持つワークフローでは workflow (UI形式) からの抽出だと
        // トップレベル系統しか拾えないことがあるため（Metadataタブと同じ優先順位に揃える）。
        renderPromptTab(wfRes.prompt_workflow ?? state.embeddedWorkflow);
    } catch (e) {
        renderWorkflowJson(null);
        _updateCopyCanvasBtn();
        renderImagePromptSection(null);
        renderDimensionInfo(null);
        renderPromptTab(null);
    }

    // グループタブ更新
    renderDetailGroup(img);
}

function renderDimensionInfo(metaRes) {
    const el = document.getElementById("wfm-gallery-info-dim");
    if (!el) return;
    const parts = [];
    if (metaRes?.width && metaRes?.height) parts.push(`${metaRes.width}×${metaRes.height}`);
    if (metaRes?.duration) parts.push(formatDuration(metaRes.duration));
    el.textContent = parts.length ? parts.join(" · ") : "";
}

function renderImagePromptSection(imagePrompt) {
    const section = document.getElementById("wfm-gallery-image-prompt-section");
    const text = document.getElementById("wfm-gallery-image-prompt-text");
    if (!section || !text) return;
    if (imagePrompt) {
        text.textContent = imagePrompt;
        section.style.display = "";
    } else {
        section.style.display = "none";
    }
}

function renderTagsDisplay(tags) {
    const container = document.getElementById("wfm-gallery-tags-display");
    container.innerHTML = "";
    tags.forEach(tag => {
        const span = document.createElement("span");
        span.className = "wfm-gallery-tag-badge wfm-gallery-tag-removable";
        span.innerHTML = `${escapeHtml(tag)} <button class="wfm-gallery-tag-remove" data-tag="${escapeHtml(tag)}" title="Remove">&times;</button>`;
        span.querySelector("button").addEventListener("click", () => removeTag(tag));
        container.appendChild(span);
    });
}

function renderWorkflowJson(workflow) {
    const pre = document.getElementById("wfm-gallery-workflow-json");
    const statusEl = document.getElementById("wfm-gallery-meta-status");
    const copyBtn = document.getElementById("wfm-gallery-copy-workflow-btn");

    if (workflow) {
        pre.textContent = JSON.stringify(workflow, null, 2);
        if (statusEl) statusEl.textContent = "Workflow found";
        if (copyBtn) copyBtn.disabled = false;
    } else {
        pre.textContent = "No workflow embedded in this image.";
        if (statusEl) statusEl.textContent = "No workflow";
        if (copyBtn) copyBtn.disabled = true;
    }
}

// 埋め込みワークフローからpositive/negativeプロンプトを抽出してPromptタブに表示する。
// 複数候補があるケース(PromptStyler等で正負が複数生成される場合)に対応するため、
// Metadataタブと同じ POS/NEGリスト → クリックで全文表示のUI(buildPromptItem)をそのまま
// 再利用する。選択画像を切り替えるたびにマウス操作無しで読めるよう、先頭項目を自動選択する。
function renderPromptTab(workflow) {
    const listEl = document.getElementById("wfm-gallery-prompt-list");
    const fullArea = document.getElementById("wfm-gallery-prompt-full");
    const fullLabel = document.getElementById("wfm-gallery-prompt-full-label");
    if (!listEl || !fullArea || !fullLabel) return;

    listEl.innerHTML = "";
    fullArea.value = "";
    fullLabel.textContent = "";

    if (!workflow) {
        listEl.innerHTML = `<div class="wfm-meta-item" style="opacity:0.6;">No workflow embedded in this image.</div>`;
        return;
    }

    const { positives, negatives, texts } = extractPrompts(workflow);
    const allPrompts = [
        ...positives.map(p => ({ type: "positive", text: p })),
        ...negatives.map(p => ({ type: "negative", text: p })),
        ...(texts ?? []).map(p => ({ type: "text", text: p })),
    ];

    if (allPrompts.length === 0) {
        listEl.innerHTML = `<div class="wfm-meta-item" style="opacity:0.6;">No prompt found.</div>`;
        return;
    }

    for (const { type, text } of allPrompts) {
        listEl.appendChild(buildPromptItem(text, type, text, fullArea, fullLabel, listEl));
    }
    // Auto-select first item (positive prompts come first in allPrompts)
    listEl.querySelector(".wfm-meta-item-clickable")?.click();
}

// ── タグ操作 ─────────────────────────────────────────────────

async function addTag(tag) {
    if (!state.selectedImage || !tag.trim()) return;
    const tags = [...(state.selectedImage.tags || [])];
    if (tags.includes(tag.trim())) return;
    tags.push(tag.trim());
    const ok = await saveMetaField({ tags });
    if (!ok) return;
    state.selectedImage.tags = tags;
    renderTagsDisplay(tags);
    updateTagFilter(state.images);
}

async function removeTag(tag) {
    if (!state.selectedImage) return;
    const tags = (state.selectedImage.tags || []).filter(t => t !== tag);
    const ok = await saveMetaField({ tags });
    if (!ok) return;
    state.selectedImage.tags = tags;
    renderTagsDisplay(tags);
    updateTagFilter(state.images);
}

// 戻り値: 保存が実際にサーバーへ永続化されたか(true/false)。呼び出し元はこれを見て
// ローカル状態(state.selectedImage等)の更新可否を判断すること — でないと、サーバーが
// 保存を拒否した場合にもUI上は成功したように見えてしまう(リロードすると消える不具合の原因)。
async function saveMetaField(fields) {
    if (!state.selectedImage) return false;
    try {
        const res = await fetch(API.saveImageMeta, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: state.selectedImage.path, ...fields }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        // サーバー側は常にHTTP 200を返し、成否は body.ok (bool) で表す設計
        // (gallery_routes.py save_image_meta)。ここをチェックしないと、
        // 許可パス外などでサーバーが保存を拒否してもUI上は成功したように見えてしまう。
        if (json.error || json.ok === false) {
            throw new Error(json.error || "Save rejected by server");
        }
        const idx = state.images.findIndex(i => i.path === state.selectedImage.path);
        if (idx >= 0) Object.assign(state.images[idx], fields);
        return true;
    } catch (e) {
        showToast(t("saveFailed", e.message), "error");
        return false;
    }
}

// ── グループ ─────────────────────────────────────────────────

async function loadGroups() {
    try {
        const data = await apiFetch(API.groups);
        state.groups = data.groups || [];
        _updateGroupSelects();
        // 詳細パネルが表示中なら再描画
        if (state.selectedImage) {
            renderDetailGroup(state.selectedImage);
        }
    } catch (e) {
        console.error("loadGroups error:", e);
    }
}

/** Feederグループ(__Feeder__)が存在しない場合に作成する */
export async function ensureFeederGroup() {
    try {
        await fetch(API.groupEnsure, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: FEEDER_GROUP }),
        });
        await loadGroups();
    } catch (e) {
        console.warn("[Gallery] ensureFeederGroup error:", e);
    }
}

/** __VideoAssets__グループが存在しない場合に作成する。add_to_groupは対象グループが
 * レジストリに登録されているかを確認せず画像側にグループ名を書き込むだけのため、
 * 一度レジストリから消える(例: 予約保護が効く前の版で削除された)と、以後の手動追加は
 * 画像には記録されてもグループ一覧・フィルタには一切出てこなくなる。VideoタブのAsset
 * タブ初期化時に呼び、レジストリを確実に存在させる。 */
export async function ensureVideoGroup() {
    try {
        await fetch(API.groupEnsure, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: VIDEO_GROUP }),
        });
        await loadGroups();
    } catch (e) {
        console.warn("[Gallery] ensureVideoGroup error:", e);
    }
}

/** Feederグループ内の全画像を除外する（FC ボタン） */
async function clearFeederGroup() {
    try {
        await fetch(API.groupClear(FEEDER_GROUP), { method: "POST" });
        showToast(t("feederGroupCleared"), "success");
        // グループフィルタが __Feeder__ ならリロード
        if (state.groupFilter === FEEDER_GROUP) {
            await loadImages();
        }
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

/** __vtemp__グループ内の全画像を除外する（詳細パネルのVtCボタン） */
async function clearVtempGroup() {
    try {
        await fetch(API.groupClear(VTEMP_GROUP), { method: "POST" });
        showToast(t("vtempGroupCleared"), "success");
        if (state.groupFilter === VTEMP_GROUP) {
            await loadImages();
        }
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

/** ツールバーのグループフィルタと一括バーのセレクトを更新 */
function _updateGroupSelects() {
    // ツールバー: グループフィルタ
    const filterSel = document.getElementById("wfm-gallery-group-filter");
    if (filterSel) {
        const current = filterSel.value;
        filterSel.innerHTML = `<option value="">All Groups</option>`;
        state.groups.forEach(g => {
            const opt = document.createElement("option");
            opt.value = g.name;
            opt.textContent = g.name;
            if (g.name === current) opt.selected = true;
            filterSel.appendChild(opt);
        });
    }

    // 一括操作バー: グループ選択
    const bulkSel = document.getElementById("wfm-gallery-bulk-group-select");
    if (bulkSel) {
        const current = bulkSel.value;
        bulkSel.innerHTML = `<option value="">${t("galleryBulkAddToGroup")}</option>`;
        state.groups.forEach(g => {
            const opt = document.createElement("option");
            opt.value = g.name;
            opt.textContent = g.name;
            if (g.name === current) opt.selected = true;
            bulkSel.appendChild(opt);
        });
    }
}

/** 詳細パネルのGroupタブをModelsと同じUIで描画（JS動的生成） */
function renderDetailGroup(img) {
    const el = document.getElementById("wfm-gallery-detail-group");
    if (!el) return;

    const memberOf = img.groups || [];
    const allGroups = state.groups.map(g => g.name).sort();
    const availableGroups = allGroups.filter(g => !memberOf.includes(g));

    el.innerHTML = `
        <div style="padding:4px;">
            <div style="margin-bottom:12px;">
                <div class="wfm-gallery-section-title">${t("modelsCurrentGroups")}</div>
                ${memberOf.length === 0
                    ? `<p style="color:var(--wfm-text-secondary);font-size:12px;">${t("modelsNoGroup")}</p>`
                    : memberOf.map(g => `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;">
                            <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(g)}</span>
                            <button class="wfm-btn wfm-btn-sm wfm-btn-danger wfm-gallery-grp-remove" data-group="${escapeHtml(g)}" title="${t("modelsRemoveFromGroup")}">&times;</button>
                        </div>`).join("")}
            </div>
            <div style="margin-bottom:12px;">
                <div class="wfm-gallery-section-title">${t("modelsAssignGroup")}</div>
                <div style="display:flex;gap:4px;">
                    <select id="wfm-gallery-grp-assign-sel" class="wfm-select" style="flex:1;font-size:12px;padding:3px 6px;">
                        ${availableGroups.length === 0
                            ? `<option value="">${t("modelsNoGroupAvailable")}</option>`
                            : availableGroups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("")}
                    </select>
                    <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-gallery-grp-assign-btn"
                        ${availableGroups.length === 0 ? "disabled" : ""}>${t("modelsAdd")}</button>
                </div>
            </div>
            <div style="margin-bottom:12px;">
                <div class="wfm-gallery-section-title">${t("modelsCreateGroup")}</div>
                <div style="display:flex;gap:4px;">
                    <input type="text" id="wfm-gallery-grp-new-input" class="wfm-input"
                        style="flex:1;font-size:12px;padding:3px 6px;" placeholder="${t("modelsGroupName")}">
                    <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-gallery-grp-create-btn">${t("modelsCreate")}</button>
                </div>
            </div>
            <div style="border-top:1px solid var(--wfm-border);padding-top:10px;margin-top:4px;">
                <div class="wfm-gallery-section-title">${t("modelsManageGroups")}</div>
                <div style="display:flex;gap:4px;">
                    <select id="wfm-gallery-grp-manage-sel" class="wfm-select" style="flex:1;font-size:12px;padding:3px 6px;">
                        ${allGroups.length === 0
                            ? `<option value="">${t("modelsNoGroupAvailable")}</option>`
                            : allGroups.map(g => {
                                const label = _isReservedGroup(g) ? `🔒 ${escapeHtml(g)}` : escapeHtml(g);
                                return `<option value="${escapeHtml(g)}">${label}</option>`;
                            }).join("")}
                    </select>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-gallery-grp-rename-btn"
                        ${allGroups.length === 0 || _isReservedGroup(allGroups[0]) ? "disabled" : ""} title="${t("modelsRename")}">&#9998;</button>
                    <button class="wfm-btn wfm-btn-sm wfm-btn-danger" id="wfm-gallery-grp-delete-btn"
                        ${allGroups.length === 0 || _isReservedGroup(allGroups[0]) ? "disabled" : ""} title="${t("modelsDelete")}">&times;</button>
                </div>
                <button class="wfm-btn wfm-btn-sm" id="wfm-gallery-vtemp-clear-btn" style="width:100%;margin-top:6px;" title="Clear the __vtemp__ group (auto-populated by unsaved Video Plan runs)">VtC — Clear __vtemp__</button>
            </div>
        </div>
    `;

    // グループから除外
    el.querySelectorAll(".wfm-gallery-grp-remove").forEach(btn => {
        btn.addEventListener("click", async () => {
            const g = btn.dataset.group;
            try {
                await fetch(API.groupRemove(g), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: img.path }),
                });
                img.groups = (img.groups || []).filter(x => x !== g);
                const cached = state.images.find(i => i.path === img.path);
                if (cached) cached.groups = img.groups;
                renderDetailGroup(img);
                showToast(t("removedFromGroupName", g), "success");
            } catch (e) {
                showToast(t("errorWithMsg", e.message), "error");
            }
        });
    });

    // グループに追加
    el.querySelector("#wfm-gallery-grp-assign-btn")?.addEventListener("click", async () => {
        const sel = el.querySelector("#wfm-gallery-grp-assign-sel");
        const g = sel?.value;
        if (!g) return;
        try {
            await fetch(API.groupAdd(g), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: img.path }),
            });
            if (!(img.groups || []).includes(g)) img.groups = [...(img.groups || []), g];
            const cached = state.images.find(i => i.path === img.path);
            if (cached) cached.groups = img.groups;
            renderDetailGroup(img);
            showToast(t("addedToGroupName", g), "success");
        } catch (e) {
            showToast(t("errorWithMsg", e.message), "error");
        }
    });

    // グループ作成（作成後に現在の画像にも追加）
    el.querySelector("#wfm-gallery-grp-create-btn")?.addEventListener("click", async () => {
        const input = el.querySelector("#wfm-gallery-grp-new-input");
        const name = input?.value.trim();
        if (!name) return;
        if (state.groups.some(g => g.name === name)) {
            showToast(t("groupExists"), "warning");
            return;
        }
        try {
            await fetch(API.groupCreate, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            // 作成後に現在の画像へ追加
            await fetch(API.groupAdd(name), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: img.path }),
            });
            if (!(img.groups || []).includes(name)) img.groups = [...(img.groups || []), name];
            const cached = state.images.find(i => i.path === img.path);
            if (cached) cached.groups = img.groups;
            input.value = "";
            await loadGroups(); // セレクト類を更新
            showToast(t("groupCreated", name), "success");
        } catch (e) {
            showToast(t("errorWithMsg", e.message), "error");
        }
    });

    // 管理セレクト変更時: 予約グループ(__Feeder__/__VideoAssets__/__vtemp__)は rename/delete を無効化
    el.querySelector("#wfm-gallery-grp-manage-sel")?.addEventListener("change", (e) => {
        const isReserved = _isReservedGroup(e.target.value);
        const renameBtn = el.querySelector("#wfm-gallery-grp-rename-btn");
        const deleteBtn = el.querySelector("#wfm-gallery-grp-delete-btn");
        if (renameBtn) renameBtn.disabled = isReserved;
        if (deleteBtn) deleteBtn.disabled = isReserved;
    });

    // VtC ボタン: __vtemp__ グループをクリア(未保存Video Planの生成物置き場)
    el.querySelector("#wfm-gallery-vtemp-clear-btn")?.addEventListener("click", clearVtempGroup);

    // グループ名変更
    el.querySelector("#wfm-gallery-grp-rename-btn")?.addEventListener("click", async () => {
        const sel = el.querySelector("#wfm-gallery-grp-manage-sel");
        const oldName = sel?.value;
        if (!oldName) return;
        const newName = prompt(`Rename group "${oldName}" to:`, oldName);
        if (!newName || newName === oldName) return;
        if (state.groups.some(g => g.name === newName)) {
            showToast(t("groupNameExists"), "warning");
            return;
        }
        try {
            const res = await fetch(API.groupRename(oldName), {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ new_name: newName }),
            });
            if (!res.ok) throw new Error((await res.json()).error || "Rename failed");
            // 現在の画像のgroupsも更新
            if (img.groups) {
                img.groups = img.groups.map(g => g === oldName ? newName : g);
            }
            const cached = state.images.find(i => i.path === img.path);
            if (cached && cached.groups) {
                cached.groups = cached.groups.map(g => g === oldName ? newName : g);
            }
            // グループフィルタが変更されたグループを選択中なら更新
            if (state.groupFilter === oldName) {
                state.groupFilter = newName;
            }
            await loadGroups();
            showToast(t("renamedTo", newName), "success");
        } catch (e) {
            showToast(t("errorWithMsg", e.message), "error");
        }
    });

    // グループ削除
    el.querySelector("#wfm-gallery-grp-delete-btn")?.addEventListener("click", async () => {
        const sel = el.querySelector("#wfm-gallery-grp-manage-sel");
        const name = sel?.value;
        if (!name) return;
        if (!confirm(`Delete group "${name}"?`)) return;
        try {
            await fetch(API.groupDelete(name), { method: "DELETE" });
            if (img.groups) img.groups = img.groups.filter(g => g !== name);
            const cached = state.images.find(i => i.path === img.path);
            if (cached && cached.groups) cached.groups = cached.groups.filter(g => g !== name);
            if (state.groupFilter === name) {
                state.groupFilter = "";
                const filterSel = document.getElementById("wfm-gallery-group-filter");
                if (filterSel) filterSel.value = "";
            }
            await loadGroups();
            showToast(t("groupDeleted", name), "success");
        } catch (e) {
            showToast(t("errorWithMsg", e.message), "error");
        }
    });
}


// ── フォルダ作成・削除 ────────────────────────────────────────

async function createFolder() {
    if (!state.currentFolder) {
        showToast(t("selectParentFolderFirst"), "error");
        return;
    }
    const name = prompt("New folder name:");
    if (!name || !name.trim()) return;
    try {
        const res = await fetch(API.folderCreate, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parent: state.currentFolder, name: name.trim() }),
        });
        const data = await res.json();
        if (!data.ok) {
            showToast(t("errorWithMsg", data.error), "error");
            return;
        }
        showToast(t("folderCreated", name.trim()), "success");
        await loadFolderTree();
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

async function deleteFolder() {
    if (!state.currentFolder) return;
    if (!confirm(`Delete folder "${state.currentFolder.split("/").pop()}" and all its contents?`)) return;
    try {
        const res = await fetch(API.folderDelete, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: state.currentFolder }),
        });
        const data = await res.json();
        if (!data.ok) {
            showToast(t("errorWithMsg", data.error), "error");
            return;
        }
        showToast(t("folderDeleted"), "success");
        state.currentFolder = "";
        state.images = [];
        document.getElementById("wfm-gallery-grid").innerHTML = `<p class="wfm-placeholder">Select a folder to browse images.</p>`;
        await loadFolderTree();
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

// ── ファイル削除・移動 ────────────────────────────────────────

async function performDeleteImages(paths) {
    try {
        const res = await fetch(API.imagesDelete, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths }),
        });
        const data = await res.json();
        if (data.deleted && data.deleted.length > 0) {
            showToast(t("deletedNImages", data.deleted.length), "success");
            // 削除された画像をstateから除去
            const deletedSet = new Set(data.deleted);
            state.images = state.images.filter(img => !deletedSet.has(img.path));
            state.selectedImages = new Set([...state.selectedImages].filter(p => !deletedSet.has(p)));
            if (state.selectedImage && deletedSet.has(state.selectedImage.path)) {
                state.selectedImage = null;
                document.getElementById("wfm-gallery-detail-preview").innerHTML = `<span class="wfm-placeholder">No selection</span>`;
                document.getElementById("wfm-gallery-detail-filename").textContent = "";
                const moveBtn = document.getElementById("wfm-gallery-img-move-btn");
                const delBtn = document.getElementById("wfm-gallery-img-delete-btn");
                if (moveBtn) moveBtn.disabled = true;
                if (delBtn) delBtn.disabled = true;
            }
            updateBulkBar();
            renderImages();
            // フォルダツリーのカウントを更新
            loadFolderTree();
        }
        if (data.errors && data.errors.length > 0) {
            showToast(t("errorsList", data.errors.join(", ")), "error");
        }
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

async function performMoveImages(paths, destFolder) {
    try {
        const res = await fetch(API.imagesMove, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths, dest: destFolder }),
        });
        const data = await res.json();
        if (data.moved && data.moved.length > 0) {
            showToast(t("movedNImages", data.moved.length), "success");
            const movedSet = new Set(data.moved.map(m => m.from));
            state.images = state.images.filter(img => !movedSet.has(img.path));
            state.selectedImages = new Set([...state.selectedImages].filter(p => !movedSet.has(p)));
            if (state.selectedImage && movedSet.has(state.selectedImage.path)) {
                state.selectedImage = null;
                document.getElementById("wfm-gallery-detail-preview").innerHTML = `<span class="wfm-placeholder">No selection</span>`;
                document.getElementById("wfm-gallery-detail-filename").textContent = "";
                const moveBtn = document.getElementById("wfm-gallery-img-move-btn");
                const delBtn = document.getElementById("wfm-gallery-img-delete-btn");
                if (moveBtn) moveBtn.disabled = true;
                if (delBtn) delBtn.disabled = true;
            }
            updateBulkBar();
            renderImages();
            loadFolderTree();
        }
        if (data.errors && data.errors.length > 0) {
            showToast(t("errorsList", data.errors.join(", ")), "error");
        }
        if (data.error) {
            showToast(t("errorWithMsg", data.error), "error");
        }
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

// ── フォルダツリーを平坦なリストに変換 ──────────────────────────

function flattenFolderTree(node, result = []) {
    if (!node) return result;
    result.push({ name: node.name, abs_path: node.abs_path });
    if (node.children) {
        node.children.forEach(child => flattenFolderTree(child, result));
    }
    return result;
}

// ── 移動先選択モーダル ────────────────────────────────────────

function openMoveModal(paths) {
    const allFolders = flattenFolderTree(state.folderTree);
    const destinations = allFolders.filter(f => f.abs_path !== state.currentFolder);

    if (destinations.length === 0) {
        showToast(t("noOtherFolders"), "error");
        return;
    }

    const overlay = document.createElement("div");
    overlay.className = "wfm-gallery-lightbox";
    overlay.innerHTML = `
        <div class="wfm-gallery-move-modal">
            <div class="wfm-gallery-move-modal-title">Move ${paths.length} image(s) to folder:</div>
            <select id="wfm-gallery-move-dest-sel" class="wfm-select wfm-gallery-move-dest-sel">
                ${destinations.map(f => `<option value="${escapeHtml(f.abs_path)}">${escapeHtml(f.name)}</option>`).join("")}
            </select>
            <div class="wfm-gallery-move-modal-footer">
                <button id="wfm-gallery-move-confirm" class="wfm-btn wfm-btn-primary">Move</button>
                <button id="wfm-gallery-move-cancel" class="wfm-btn">Cancel</button>
            </div>
        </div>
    `;

    overlay.querySelector("#wfm-gallery-move-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector("#wfm-gallery-move-confirm").addEventListener("click", async () => {
        const dest = overlay.querySelector("#wfm-gallery-move-dest-sel").value;
        if (!dest) return;
        overlay.remove();
        await performMoveImages(paths, dest);
    });

    document.body.appendChild(overlay);
}

// ── 一括操作 ─────────────────────────────────────────────────

async function bulkAddToGroup(groupName) {
    if (!groupName || state.selectedImages.size === 0) return;
    const paths = [...state.selectedImages];
    try {
        const res = await fetch(API.bulkGroup, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths, group: groupName, action: "add" }),
        });
        const data = await res.json();
        if (data.ok > 0) {
            paths.forEach(path => {
                const img = state.images.find(im => im.path === path);
                if (img) {
                    if (!img.groups) img.groups = [];
                    if (!img.groups.includes(groupName)) img.groups.push(groupName);
                }
            });
        }
        showToast(t("addedNImagesToGroup", data.ok, groupName), "success");
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

async function bulkRemoveFromGroup(groupName) {
    if (!groupName || state.selectedImages.size === 0) return;
    const paths = [...state.selectedImages];
    try {
        const res = await fetch(API.bulkGroup, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths, group: groupName, action: "remove" }),
        });
        const data = await res.json();
        if (data.ok > 0) {
            paths.forEach(path => {
                const img = state.images.find(im => im.path === path);
                if (img && img.groups) {
                    img.groups = img.groups.filter(g => g !== groupName);
                }
            });
        }
        showToast(t("removedNImagesFromGroup", data.ok, groupName), "success");
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

async function bulkSetFavorite(favoriteValue) {
    if (state.selectedImages.size === 0) return;
    const paths = [...state.selectedImages].filter(path => {
        const img = state.images.find(i => i.path === path);
        return img && img.favorite !== favoriteValue;
    });
    if (paths.length === 0) return;
    try {
        const res = await fetch(API.bulkFavorite, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths, value: favoriteValue }),
        });
        const data = await res.json();
        if (data.ok > 0) {
            paths.forEach(path => {
                const img = state.images.find(im => im.path === path);
                if (img) img.favorite = favoriteValue;
            });
            showToast(favoriteValue ? t("favoritedNImages", data.ok) : t("unfavoritedNImages", data.ok), "success");
            renderImages();
        }
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

// ── ライトボックス ────────────────────────────────────────────

function openLightbox(img) {
    const overlay = document.createElement("div");
    overlay.className = "wfm-gallery-lightbox";
    const mediaHtml = isVideoFile(img)
        ? `<video src="${API.serveImage(img.path)}" class="wfm-gallery-lightbox-img" controls autoplay></video>`
        : `<img src="${API.serveImage(img.path)}" class="wfm-gallery-lightbox-img" alt="${escapeHtml(img.filename)}">`;
    overlay.innerHTML = `
        <div class="wfm-gallery-lightbox-inner">
            ${mediaHtml}
            <div class="wfm-gallery-lightbox-footer">${escapeHtml(img.filename)}</div>
            <button class="wfm-gallery-lightbox-close">&times;</button>
        </div>
    `;
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay || e.target.classList.contains("wfm-gallery-lightbox-close")) {
            overlay.remove();
        }
    });
    document.body.appendChild(overlay);
    if (isVideoFile(img)) applyStoredVideoVolume(overlay.querySelector("video"));
}

// ── 画像比較ライトボックス ─────────────────────────────────────

function openCompare(paths) {
    const imgs = paths.map(p => state.images.find(im => im.path === p)).filter(Boolean);
    if (imgs.length < 2) return;

    const overlay = document.createElement("div");
    overlay.className = "wfm-gallery-lightbox wfm-lightbox-compare";

    const itemsHtml = imgs.map(img => {
        const mediaHtml = isVideoFile(img)
            ? `<video src="${API.serveImage(img.path)}" class="wfm-lightbox-compare-img" controls></video>`
            : `<img src="${API.serveImage(img.path)}" class="wfm-lightbox-compare-img" alt="${escapeHtml(img.filename)}" loading="lazy">`;
        return `
        <div class="wfm-lightbox-compare-item">
            ${mediaHtml}
            <div class="wfm-lightbox-compare-label">${escapeHtml(img.filename)}</div>
        </div>
    `;
    }).join("");

    overlay.innerHTML = `
        <div class="wfm-lightbox-compare-inner">
            <div class="wfm-lightbox-compare-grid" style="--compare-cols:${imgs.length}">${itemsHtml}</div>
        </div>
        <button class="wfm-gallery-lightbox-close wfm-lightbox-compare-close">&times;</button>
    `;
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay || e.target.classList.contains("wfm-gallery-lightbox-close")) {
            overlay.remove();
        }
    });
    document.body.appendChild(overlay);
    overlay.querySelectorAll("video").forEach(applyStoredVideoVolume);
}

// ── outputパス取得 ────────────────────────────────────────────

async function detectOutputPath() {
    try {
        const res = await fetch("/api/wfm/settings/output-dir");
        if (res.ok) {
            const data = await res.json();
            const dir = data.current || "";
            if (dir) {
                state.outputRoot = dir;
                loadFolderTree();
                return;
            }
        }
    } catch (e) { /* ignore */ }
}

// Settings変更イベントを受信してツリーを再ロード
window.addEventListener("wfm-output-dir-changed", (e) => {
    const newPath = e.detail?.path || "";
    if (!newPath) return;
    state.outputRoot = newPath;
    const galleryTab = document.getElementById("wfm-tab-gallery");
    if (galleryTab && galleryTab.classList.contains("active")) {
        loadFolderTree();
    }
});

// ── 初期化 ────────────────────────────────────────────────────

export function initGalleryTab() {
    const tabBtn = document.querySelector('.wfm-tab[data-tab="gallery"]');
    if (tabBtn) {
        tabBtn.addEventListener("click", onGalleryTabActivated);
    }

    bindEvents();
    _initGallerySubtabToggle();
    initImagePromptTab();
    initStyleCatalogTab();
}

let _initialized = false;

function onGalleryTabActivated() {
    if (_initialized) return;
    _initialized = true;
    detectOutputPath();
    loadGroups();
}

// ── サブタブ切替 (Output / ImagePrompt / Style_Catalog / Metadata) ────────────

function _initGallerySubtabToggle() {
    document.querySelectorAll(".wfm-gallery-subtab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.gallerySubtab;
            document.querySelectorAll(".wfm-gallery-subtab-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById("wfm-gallery-panel-output")?.classList.toggle("active", target === "output");
            document.getElementById("wfm-gallery-panel-imageprompt")?.classList.toggle("active", target === "imageprompt");
            document.getElementById("wfm-gallery-panel-styleCatalog")?.classList.toggle("active", target === "styleCatalog");
            document.getElementById("wfm-gallery-panel-metadata")?.classList.toggle("active", target === "metadata");
            if (target === "imageprompt") activateImagePromptTab();
            if (target === "styleCatalog") activateStyleCatalogTab();
        });
    });
}

function bindEvents() {
    // リフレッシュ
    document.getElementById("wfm-gallery-refresh-btn")?.addEventListener("click", () => {
        loadFolderTree();
        loadImages();
    });

    // 選択画像を Image Edit タブへ送信
    document.getElementById("wfm-gallery-send-image-edit-btn")?.addEventListener("click", () => {
        if (!state.selectedImage) {
            showToast("Please select an image first", "info");
            return;
        }
        const url  = API.serveImage(state.selectedImage.path);
        const name = (state.selectedImage.filename || "gallery-image").replace(/\.[^.]+$/, "");
        if (window._wfmImageEditTab) {
            document.querySelector('[data-tab="image-edit"]')?.click();
            window._wfmImageEditTab.loadFromUrl(url, name);
        }
    });

    // 選択画像を GenerateUI Image タブへ送信
    document.getElementById("wfm-gallery-send-genui-image-btn")?.addEventListener("click", async () => {
        if (!state.selectedImage) {
            showToast(t("gallerySelectImageFirst"), "info");
            return;
        }
        if (!comfyUI.currentAnalysis) {
            showToast(t("noWorkflowLoaded"), "info");
            return;
        }
        const loadNodes = comfyUI.currentAnalysis.load_image_nodes || [];
        if (loadNodes.length === 0) {
            showToast(t("galleryNoLoadImageNode"), "info");
            return;
        }
        try {
            const res = await fetch(API.serveImage(state.selectedImage.path));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const file = new File([blob], state.selectedImage.filename, { type: blob.type || "image/png" });

            // GenerateUI → Input subtab → Image inner tab へ切り替え
            document.querySelector('[data-tab="generate"]')?.click();
            document.querySelector('.wfm-gen-subtab-btn[data-subtab="input"]')?.click();
            document.querySelector('.wfm-input-inner-tab[data-input-tab="image"]')?.click();

            await comfyEditor.applyImageToSlot(file, 0);
            showToast(t("gallerySentGenUI"), "success");
        } catch (e) {
            showToast(t("errorWithMsg", e.message), "error");
        }
    });

    // 選択画像をComfyUIキャンバス上で選択中のノード（LoadImage系）のimageウィジェットへ送信。
    // Image Editタブの「Send to LI node」と同じ橋渡し(window.opener.wfmSendImageToSelectedNode、
    // node_sets_menu.js側で定義)を使う。Galleryの画像はGalleryルート配下の任意フォルダにあり得るため、
    // GenUI送信と違いLoadImageノードの有無に依存しない — /upload/imageでinputフォルダへ
    // アップロードしてから、そのファイル名を書き込む。
    document.getElementById("wfm-gallery-send-li-node-btn")?.addEventListener("click", async () => {
        if (!state.selectedImage) {
            showToast(t("gallerySelectImageFirst"), "info");
            return;
        }
        if (!window.opener || typeof window.opener.wfmSendImageToSelectedNode !== "function") {
            showToast(t("sendToLiNodeNoOpener"), "error");
            return;
        }
        try {
            const res = await fetch(API.serveImage(state.selectedImage.path));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const file = new File([blob], state.selectedImage.filename || "gallery-image.png", { type: blob.type || "image/png" });
            const result = await comfyUI.uploadImage(file, file.name);
            const filename = result.subfolder ? `${result.subfolder}/${result.name}` : result.name;
            window.opener.wfmSendImageToSelectedNode(filename);
            showToast(t("sendToLiNodeSuccess", filename), "success");
        } catch (e) {
            showToast(t("errorWithMsg", e.message), "error");
        }
    });

    // 選択画像を ComfyUI Comic Creator の選択コマ／オーバーレイへ送信
    // （ComfyUI Comic CreaterからこのGalleryタブがiframe埋め込みされている場合のみ表示・動作する）
    const sendCcBtn = document.getElementById("wfm-gallery-send-cc-btn");
    if (sendCcBtn) {
        let embedded = false;
        try {
            embedded = !!(window.parent && window.parent !== window);
        } catch (e) {
            embedded = false;
        }
        if (embedded) sendCcBtn.style.display = "";

        sendCcBtn.addEventListener("click", () => {
            if (!state.selectedImage) {
                showToast(t("gallerySelectImageFirst"), "info");
                return;
            }
            const url = API.serveImage(state.selectedImage.path);

            // I2I送信元がImageタブだった場合はそちらへ画像を読み込ませる（_ccI2ITargetModeはComic Creater側が
            // 「I2Iへ送る」ボタン押下時にセットするフラグ。undefined/'layout'なら従来通りコマ/オーバーレイへ挿入）
            let targetMode = null;
            try {
                targetMode = window.parent?._ccI2ITargetMode || null;
            } catch (e) {
                targetMode = null;
            }
            if (targetMode === "image") {
                let imageTab = null;
                try {
                    if (window.parent && window.parent !== window && typeof window.parent._ccImageTab?.loadFromUrl === "function") {
                        imageTab = window.parent._ccImageTab;
                    }
                } catch (e) {
                    imageTab = null;
                }
                if (!imageTab) {
                    showToast(t("galleryCCNotAvailable"), "info");
                    return;
                }
                imageTab.loadFromUrl(url, (state.selectedImage.filename || "cc-image").replace(/\.[^.]+$/, ""));
                showToast(t("gallerySentCC"), "success");
                return;
            }

            let insertFn = null;
            try {
                if (window.parent && window.parent !== window && typeof window.parent.insertImageFromUrl === "function") {
                    insertFn = window.parent.insertImageFromUrl;
                }
            } catch (e) {
                insertFn = null;
            }
            if (!insertFn) {
                showToast(t("galleryCCNotAvailable"), "info");
                return;
            }
            insertFn(url);
            showToast(t("gallerySentCC"), "success");
        });
    }

    // 検索
    document.getElementById("wfm-gallery-search")?.addEventListener("input", (e) => {
        state.search = e.target.value;
        loadImages();
    });
    setupSearchClearBtn("wfm-gallery-search", "wfm-gallery-search-clear-btn", () => {
        state.search = "";
        loadImages();
    });

    // ソート
    document.getElementById("wfm-gallery-sort")?.addEventListener("change", (e) => {
        state.sortBy = e.target.value;
        localStorage.setItem("wfm_gallery_sort", state.sortBy);
        loadImages();
    });
    const sortSel = document.getElementById("wfm-gallery-sort");
    if (sortSel) sortSel.value = state.sortBy;

    // お気に入りフィルタ
    document.getElementById("wfm-gallery-fav-btn")?.addEventListener("click", () => {
        state.favoriteOnly = !state.favoriteOnly;
        document.getElementById("wfm-gallery-fav-btn").classList.toggle("active", state.favoriteOnly);
        loadImages();
    });

    // タグフィルタ
    document.getElementById("wfm-gallery-tag-filter")?.addEventListener("change", (e) => {
        state.tagFilter = e.target.value;
        loadImages();
    });

    // グループフィルタ
    document.getElementById("wfm-gallery-group-filter")?.addEventListener("change", (e) => {
        state.groupFilter = e.target.value;
        loadImages();
    });

    // FC ボタン: Feeder グループをクリア
    document.getElementById("wfm-gallery-fc-btn")?.addEventListener("click", clearFeederGroup);

    // ビュー切替
    document.querySelectorAll("[data-gallery-view]").forEach(btn => {
        btn.addEventListener("click", () => {
            state.viewMode = btn.dataset.galleryView;
            localStorage.setItem("wfm_gallery_view", state.viewMode);
            document.querySelectorAll("[data-gallery-view]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            renderImages();
        });
    });
    document.querySelectorAll("[data-gallery-view]").forEach(b => {
        b.classList.toggle("active", b.dataset.galleryView === state.viewMode);
    });

    // タグ追加
    document.getElementById("wfm-gallery-tag-add-btn")?.addEventListener("click", () => {
        const input = document.getElementById("wfm-gallery-tag-input");
        addTag(input.value);
        input.value = "";
    });
    document.getElementById("wfm-gallery-tag-input")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            addTag(e.target.value);
            e.target.value = "";
        }
    });

    // メモ保存
    document.getElementById("wfm-gallery-memo-save-btn")?.addEventListener("click", () => {
        const memo = document.getElementById("wfm-gallery-memo").value;
        saveMetaField({ memo }).then((ok) => { if (ok) showToast(t("memoSaved"), "success"); });
    });

    // ワークフローコピー＆キャンバスへ送る
    document.getElementById("wfm-gallery-copy-workflow-btn")?.addEventListener("click", async () => {
        if (!state.embeddedWorkflow) {
            showToast(t("galleryNoEmbeddedWorkflow"), "error");
            return;
        }
        try {
            // window.opener経由でComfyUIキャンバスに直接ロード（推奨）
            if (window.opener && typeof window.opener.wfmReceiveWorkflow === "function") {
                window.opener.wfmReceiveWorkflow(state.embeddedWorkflow);
                await navigator.clipboard.writeText(JSON.stringify(state.embeddedWorkflow, null, 2)).catch(() => {});
                showToast(t("workflowSentToCanvasDirect"), "success");
                return;
            }
            // フォールバック: localStorage + タイトルドラッグ（UI形式のみ）
            const fmt = comfyWorkflow.detectFormat(state.embeddedWorkflow);
            if (fmt === "api") {
                showToast(t("apiFormatCanvasNoOpener"), "error");
                return;
            }
            const jsonStr = JSON.stringify(state.embeddedWorkflow, null, 2);
            await navigator.clipboard.writeText(jsonStr).catch(() => {});
            localStorage.setItem("wfm_pending_workflow", jsonStr);
            showToast(t("workflowSentToCanvas"), "success");
        } catch (err) {
            showToast(t("errorWithMsg", err.message), "error");
        }
    });

    // 一括操作バー
    document.getElementById("wfm-gallery-bulk-deselect")?.addEventListener("click", () => {
        state.selectedImages.clear();
        state.lastSelectionIndex = -1;
        updateBulkBar();
        // 選択状態をビューから除去
        document.querySelectorAll(".multi-selected").forEach(el => el.classList.remove("multi-selected"));
    });

    document.getElementById("wfm-gallery-bulk-select-all")?.addEventListener("click", () => {
        state.images.forEach(img => state.selectedImages.add(img.path));
        renderImages();
        updateBulkBar();
    });

    document.getElementById("wfm-gallery-bulk-group-add")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-gallery-bulk-group-select");
        if (sel && sel.value) {
            bulkAddToGroup(sel.value);
        } else {
            showToast(t("selectGroupFirst"), "error");
        }
    });

    document.getElementById("wfm-gallery-bulk-group-remove")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-gallery-bulk-group-select");
        if (sel && sel.value) {
            bulkRemoveFromGroup(sel.value);
        } else {
            showToast(t("selectGroupFirst"), "error");
        }
    });

    document.getElementById("wfm-gallery-bulk-fav")?.addEventListener("click", () => {
        bulkSetFavorite(true);
    });

    document.getElementById("wfm-gallery-bulk-unfav")?.addEventListener("click", () => {
        bulkSetFavorite(false);
    });

    document.getElementById("wfm-gallery-bulk-compare")?.addEventListener("click", () => {
        if (state.selectedImages.size < 2) return;
        openCompare([...state.selectedImages]);
    });

    document.getElementById("wfm-gallery-bulk-move")?.addEventListener("click", () => {
        if (state.selectedImages.size === 0) return;
        openMoveModal([...state.selectedImages]);
    });

    document.getElementById("wfm-gallery-bulk-export")?.addEventListener("click", () => {
        if (state.selectedImages.size === 0) return;
        exportSelectedImagesToZip([...state.selectedImages]);
    });

    document.getElementById("wfm-gallery-bulk-delete")?.addEventListener("click", () => {
        if (state.selectedImages.size === 0) return;
        const count = state.selectedImages.size;
        if (!confirm(`Delete ${count} selected image(s)? This cannot be undone.`)) return;
        performDeleteImages([...state.selectedImages]);
    });

    // フォルダ作成・削除
    document.getElementById("wfm-gallery-folder-create-btn")?.addEventListener("click", createFolder);
    document.getElementById("wfm-gallery-folder-delete-btn")?.addEventListener("click", deleteFolder);

    // 詳細パネル: 単体ファイル操作
    document.getElementById("wfm-gallery-img-move-btn")?.addEventListener("click", () => {
        if (!state.selectedImage) return;
        openMoveModal([state.selectedImage.path]);
    });

    document.getElementById("wfm-gallery-img-delete-btn")?.addEventListener("click", () => {
        if (!state.selectedImage) return;
        if (!confirm(`Delete "${state.selectedImage.filename}"? This cannot be undone.`)) return;
        performDeleteImages([state.selectedImage.path]);
    });

    // MetadataタブボタンをJSONに改名（テンプレートとの二重保証）
    const metaTabBtn = document.querySelector('.wfm-gallery-detail-tab-btn[data-detail-tab="meta"]');
    if (metaTabBtn) metaTabBtn.textContent = "JSON";

    // Metadataボタン: 選択画像をMetadataタブで開く
    document.getElementById("wfm-gallery-open-metadata-btn")?.addEventListener("click", () => {
        if (!state.selectedImage) {
            showToast(t("gallerySelectImageFirst"), "error");
            return;
        }
        openImageInMetadataTab(state.selectedImage);
    });

    document.getElementById("wfm-gallery-open-tagger-btn")?.addEventListener("click", async () => {
        if (!state.selectedImage) {
            showToast(t("gallerySelectImageFirst"), "error");
            return;
        }
        const { openImageInTaggerTab } = await import("./tagger-tab.js");
        openImageInTaggerTab(state.selectedImage);
    });

    // Downloadボタン: プレビューのオーバーレイだと動画の再生コントロール操作を妨げるため、
    // アクションボタン行に常時表示のボタンとして配置している
    document.getElementById("wfm-gallery-download-btn")?.addEventListener("click", () => {
        if (!state.selectedImage) {
            showToast(t("gallerySelectImageFirst"), "error");
            return;
        }
        downloadImage(state.selectedImage);
    });

    // Load in GenerateUI ボタン: 埋め込みワークフローをGenerateUIタブに読み込む
    document.getElementById("wfm-gallery-load-genui-btn")?.addEventListener("click", async () => {
        if (!state.selectedImage) {
            showToast(t("gallerySelectImageFirst"), "error");
            return;
        }
        if (!state.embeddedWorkflow) {
            showToast(t("galleryNoEmbeddedWorkflow"), "warning");
            return;
        }
        const loaded = await loadWorkflowIntoEditor(state.embeddedWorkflow, state.selectedImage.filename);
        if (loaded !== false) {
            document.querySelector('.wfm-tab[data-tab="generate"]')?.click();
        }
    });

    // 詳細タブ切り替え（data-detail-tab を持つボタンのみ対象。Metadata / Load GenUI はアクションボタン）
    document.querySelectorAll(".wfm-gallery-detail-tab-btn[data-detail-tab]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-gallery-detail-tab-btn[data-detail-tab]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const tabId = btn.dataset.detailTab;
            document.querySelectorAll(".wfm-gallery-detail-tab-content").forEach(c => c.style.display = "none");
            document.getElementById(`wfm-gallery-detail-${tabId}`).style.display = "";
        });
    });

    // ESCでライトボックスを閉じる
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            document.querySelectorAll(".wfm-gallery-lightbox").forEach(el => el.remove());
        }
    });

    // Clear filters button
    const galleryClearBtn = document.getElementById("wfm-gallery-clear-filters-btn");
    if (galleryClearBtn) {
        galleryClearBtn.textContent = t("clearFilters");
        galleryClearBtn.addEventListener("click", () => {
            state.search = "";
            state.favoriteOnly = false;
            state.tagFilter = "";
            state.groupFilter = "";
            const searchInput = document.getElementById("wfm-gallery-search");
            if (searchInput) searchInput.value = "";
            const tagFilter = document.getElementById("wfm-gallery-tag-filter");
            if (tagFilter) tagFilter.value = "";
            const groupFilter = document.getElementById("wfm-gallery-group-filter");
            if (groupFilter) groupFilter.value = "";
            const favBtn = document.getElementById("wfm-gallery-fav-btn");
            if (favBtn) favBtn.classList.remove("active");
            loadImages();
        });
    }
}

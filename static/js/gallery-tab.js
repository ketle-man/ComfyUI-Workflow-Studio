/**
 * Gallery Tab - output画像ブラウザ
 * 3カラム: フォルダツリー | 画像一覧 | 詳細パネル
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { loadFileIntoMetadataTab } from "./metadata-tab.js";
import { loadWorkflowIntoEditor } from "./generate-tab.js";
import { escapeHtml } from "./util.js";
import { comfyWorkflow } from "./comfyui-workflow.js";
import { comfyUI } from "./comfyui-client.js";
import { comfyEditor } from "./comfyui-editor.js";

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
    label.textContent = isRoot ? `[root] ${node.name}` : node.name;
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

    // グループフィルタはサーバーサイドで処理
    if (state.groupFilter) params.group = state.groupFilter;

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

    // プレビュー
    const preview = document.getElementById("wfm-gallery-detail-preview");
    preview.innerHTML = `
        <div class="wfm-gallery-preview-wrapper">
            <img src="${API.serveImage(img.path)}" class="wfm-gallery-detail-img" alt="${escapeHtml(img.filename)}" title="Double-click to enlarge">
            <div class="wfm-gallery-preview-overlay">
                <button class="wfm-gallery-download-btn" title="Download image">⬇</button>
            </div>
        </div>
    `;
    preview.querySelector("img").addEventListener("dblclick", () => openLightbox(img));
    preview.querySelector(".wfm-gallery-download-btn").addEventListener("click", () => downloadImage(img));

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
    } catch (e) {
        renderWorkflowJson(null);
        _updateCopyCanvasBtn();
    }

    // グループタブ更新
    renderDetailGroup(img);
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

// ── タグ操作 ─────────────────────────────────────────────────

async function addTag(tag) {
    if (!state.selectedImage || !tag.trim()) return;
    const tags = [...(state.selectedImage.tags || [])];
    if (tags.includes(tag.trim())) return;
    tags.push(tag.trim());
    await saveMetaField({ tags });
    state.selectedImage.tags = tags;
    renderTagsDisplay(tags);
    updateTagFilter(state.images);
}

async function removeTag(tag) {
    if (!state.selectedImage) return;
    const tags = (state.selectedImage.tags || []).filter(t => t !== tag);
    await saveMetaField({ tags });
    state.selectedImage.tags = tags;
    renderTagsDisplay(tags);
    updateTagFilter(state.images);
}

async function saveMetaField(fields) {
    if (!state.selectedImage) return;
    try {
        await fetch(API.saveImageMeta, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: state.selectedImage.path, ...fields }),
        });
        const idx = state.images.findIndex(i => i.path === state.selectedImage.path);
        if (idx >= 0) Object.assign(state.images[idx], fields);
    } catch (e) {
        showToast(t("saveFailed", e.message), "error");
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
                                const label = g === FEEDER_GROUP ? `🔒 ${escapeHtml(g)}` : escapeHtml(g);
                                return `<option value="${escapeHtml(g)}">${label}</option>`;
                            }).join("")}
                    </select>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-gallery-grp-rename-btn"
                        ${allGroups.length === 0 || allGroups[0] === FEEDER_GROUP ? "disabled" : ""} title="${t("modelsRename")}">&#9998;</button>
                    <button class="wfm-btn wfm-btn-sm wfm-btn-danger" id="wfm-gallery-grp-delete-btn"
                        ${allGroups.length === 0 || allGroups[0] === FEEDER_GROUP ? "disabled" : ""} title="${t("modelsDelete")}">&times;</button>
                </div>
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

    // 管理セレクト変更時: __Feeder__ は rename/delete を無効化
    el.querySelector("#wfm-gallery-grp-manage-sel")?.addEventListener("change", (e) => {
        const isReserved = e.target.value === FEEDER_GROUP;
        const renameBtn = el.querySelector("#wfm-gallery-grp-rename-btn");
        const deleteBtn = el.querySelector("#wfm-gallery-grp-delete-btn");
        if (renameBtn) renameBtn.disabled = isReserved;
        if (deleteBtn) deleteBtn.disabled = isReserved;
    });

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
    overlay.innerHTML = `
        <div class="wfm-gallery-lightbox-inner">
            <img src="${API.serveImage(img.path)}" class="wfm-gallery-lightbox-img" alt="${escapeHtml(img.filename)}">
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
}

// ── 画像比較ライトボックス ─────────────────────────────────────

function openCompare(paths) {
    const imgs = paths.map(p => state.images.find(im => im.path === p)).filter(Boolean);
    if (imgs.length < 2) return;

    const overlay = document.createElement("div");
    overlay.className = "wfm-gallery-lightbox wfm-lightbox-compare";

    const itemsHtml = imgs.map(img => `
        <div class="wfm-lightbox-compare-item">
            <img src="${API.serveImage(img.path)}" class="wfm-lightbox-compare-img" alt="${escapeHtml(img.filename)}" loading="lazy">
            <div class="wfm-lightbox-compare-label">${escapeHtml(img.filename)}</div>
        </div>
    `).join("");

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
}

let _initialized = false;

function onGalleryTabActivated() {
    if (_initialized) return;
    _initialized = true;
    detectOutputPath();
    loadGroups();
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

    // 検索
    document.getElementById("wfm-gallery-search")?.addEventListener("input", (e) => {
        state.search = e.target.value;
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
        saveMetaField({ memo }).then(() => showToast(t("memoSaved"), "success"));
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
                showToast(t("workflowSentToCanvas"), "success");
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
}

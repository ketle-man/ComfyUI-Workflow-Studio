/**
 * Style Catalog Gallery — Gallery タブのサブタブ。
 * ws_style_catalog フォルダ配下の画像（GenerateUIの「カタログ作成」で生成した、
 * ファイル名=スタイル名のプレビュー画像）を閲覧し、埋め込みPositive/Negative
 * プロンプトを表示・コピーする。「Select as Style」でGenerateUIの登録済み
 * Styleドロップダウンをファイル名と同名のStyleに切り替える。
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { escapeHtml, setupSearchClearBtn } from "./util.js";
import { extractAllMetadata } from "./metadata-tab.js";
import { selectStyleByName } from "./generate-tab.js";

const API = {
    root:        () => `/wfm/gallery/style-catalog/root`,
    folders:     (root)   => `/wfm/gallery/folders?root=${encodeURIComponent(root)}`,
    images:      (params) => `/wfm/gallery/images?${new URLSearchParams(params)}`,
    thumb:       (path, w = 200) => `/wfm/gallery/image/thumb?path=${encodeURIComponent(path)}&w=${w}`,
    serveImage:  (path)   => `/wfm/gallery/image/serve?path=${encodeURIComponent(path)}`,
};

const state = {
    root: null,
    currentFolder: null,
    search: "",
    images: [],
    selectedImage: null,
};

let _initialized = false;

async function apiFetch(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function debounce(fn, wait) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

// ── 初期化 ────────────────────────────────────────────────────

export function initStyleCatalogTab() {
    document.getElementById("wfm-stylecatalog-refresh-btn")?.addEventListener("click", () => {
        loadFolderTree();
        loadImages();
    });

    setupSearchClearBtn("wfm-stylecatalog-search", "wfm-stylecatalog-search-clear-btn", () => {
        state.search = "";
        loadImages();
    });

    const searchInput = document.getElementById("wfm-stylecatalog-search");
    searchInput?.addEventListener("input", debounce(() => {
        state.search = searchInput.value.trim();
        loadImages();
    }, 300));

    document.getElementById("wfm-stylecatalog-copy-positive-btn")?.addEventListener("click", () => copyText("wfm-stylecatalog-positive-text"));
    document.getElementById("wfm-stylecatalog-copy-negative-btn")?.addEventListener("click", () => copyText("wfm-stylecatalog-negative-text"));
    document.getElementById("wfm-stylecatalog-select-style-btn")?.addEventListener("click", onSelectStyleClick);
}

export async function activateStyleCatalogTab() {
    if (_initialized) return;
    _initialized = true;
    try {
        const data = await apiFetch(API.root());
        state.root = data.root;
        await loadFolderTree();
    } catch (e) {
        const tree = document.getElementById("wfm-stylecatalog-tree");
        if (tree) tree.innerHTML = `<p class="wfm-placeholder">Error: ${escapeHtml(e.message)}</p>`;
    }
}

// ── フォルダツリー ────────────────────────────────────────────

async function loadFolderTree() {
    if (!state.root) return;
    const tree = document.getElementById("wfm-stylecatalog-tree");
    tree.innerHTML = `<p class="wfm-placeholder">${t("loading")}</p>`;
    try {
        const data = await apiFetch(API.folders(state.root));
        if (data.error) {
            tree.innerHTML = `<p class="wfm-placeholder">${escapeHtml(data.error)}</p>`;
            return;
        }
        tree.innerHTML = "";
        renderTreeNode(data, tree, 0, true);
        const firstLabel = tree.querySelector(".wfm-gallery-tree-label");
        if (firstLabel) firstLabel.click();
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

    const label = document.createElement("span");
    label.className = "wfm-gallery-tree-label";
    label.textContent = isRoot ? "[root]" : node.name;
    const totalCount = node.image_count_total ?? node.image_count;
    if (totalCount > 0) {
        const badge = document.createElement("span");
        badge.className = "wfm-gallery-tree-count";
        badge.textContent = totalCount;
        label.appendChild(badge);
    }
    item.appendChild(label);

    label.addEventListener("click", () => {
        document.querySelectorAll("#wfm-stylecatalog-tree .wfm-gallery-tree-item.selected").forEach(el => el.classList.remove("selected"));
        item.classList.add("selected");
        state.currentFolder = absPath;
        loadImages();
    });

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
    const grid = document.getElementById("wfm-stylecatalog-grid");
    grid.innerHTML = `<p class="wfm-placeholder">${t("loading")}</p>`;

    // 上位フォルダを選択した場合もサブフォルダの画像をまとめて表示する
    const params = { folder: state.currentFolder, sort: "name_asc", recursive: "true" };
    if (state.search) params.search = state.search;

    try {
        const data = await apiFetch(API.images(params));
        state.images = data.images || [];
        document.getElementById("wfm-stylecatalog-count").textContent = `${state.images.length} images`;
        renderImages();
    } catch (e) {
        grid.innerHTML = `<p class="wfm-placeholder">Error: ${escapeHtml(e.message)}</p>`;
    }
}

function renderImages() {
    const grid = document.getElementById("wfm-stylecatalog-grid");
    if (state.images.length === 0) {
        grid.innerHTML = `<p class="wfm-placeholder">${t("galleryNoImages")}</p>`;
        return;
    }
    grid.innerHTML = "";
    const fragment = document.createDocumentFragment();
    state.images.forEach(img => fragment.appendChild(createThumbCard(img)));
    grid.appendChild(fragment);
}

function createThumbCard(img) {
    const card = document.createElement("div");
    card.className = "wfm-gallery-thumb-card";
    card.title = img.filename;
    card.dataset.path = img.path;
    if (state.selectedImage && state.selectedImage.path === img.path) {
        card.classList.add("selected");
    }

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

    card.addEventListener("click", () => selectImage(img));

    return card;
}

// ── 選択画像 / Positive・Negative表示 ─────────────────────────

function styleNameFromFilename(filename) {
    return filename.replace(/\.[^.]+$/, "");
}

async function selectImage(img) {
    state.selectedImage = img;
    document.querySelectorAll("#wfm-stylecatalog-grid .wfm-gallery-thumb-card").forEach(el => {
        el.classList.toggle("selected", el.dataset.path === img.path);
    });

    document.getElementById("wfm-stylecatalog-selected-name").textContent = img.filename;
    const preview = document.getElementById("wfm-stylecatalog-selected-preview");
    preview.innerHTML = "";
    const previewImg = document.createElement("img");
    previewImg.src = API.serveImage(img.path);
    previewImg.alt = img.filename;
    previewImg.style.cssText = "max-width:100%;max-height:100%;object-fit:contain;";
    preview.appendChild(previewImg);

    const positiveText = document.getElementById("wfm-stylecatalog-positive-text");
    const negativeText = document.getElementById("wfm-stylecatalog-negative-text");
    const copyPositiveBtn = document.getElementById("wfm-stylecatalog-copy-positive-btn");
    const copyNegativeBtn = document.getElementById("wfm-stylecatalog-copy-negative-btn");
    const selectStyleBtn = document.getElementById("wfm-stylecatalog-select-style-btn");

    positiveText.textContent = "";
    negativeText.textContent = "";
    copyPositiveBtn.disabled = true;
    copyNegativeBtn.disabled = true;
    selectStyleBtn.disabled = false; // ファイル名からのStyle選択はメタデータ抽出に依存しない

    try {
        const res = await fetch(API.serveImage(img.path));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const file = new File([blob], img.filename, { type: blob.type || "image/png" });
        const meta = await extractAllMetadata(file);

        const positive = meta?.positives?.[0] || "";
        const negative = meta?.negatives?.[0] || "";

        if (!positive && !negative) {
            positiveText.textContent = t("stylecatalogNoPromptFound");
        } else {
            positiveText.textContent = positive;
            negativeText.textContent = negative;
            copyPositiveBtn.disabled = !positive;
            copyNegativeBtn.disabled = !negative;
        }
    } catch (e) {
        positiveText.textContent = t("stylecatalogNoPromptFound");
    }
}

function copyText(elementId) {
    const el = document.getElementById(elementId);
    const text = el?.textContent || "";
    if (!text.trim()) return;
    navigator.clipboard.writeText(text)
        .then(() => showToast(t("imagePromptCopiedToast"), "success"))
        .catch((e) => showToast(t("errorWithMsg", e.message), "error"));
}

function onSelectStyleClick() {
    const img = state.selectedImage;
    if (!img) return;
    const name = styleNameFromFilename(img.filename);
    const ok = selectStyleByName(name);
    if (ok) {
        showToast(t("stylecatalogStyleSelected", name), "success");
    } else {
        showToast(t("stylecatalogNoMatch"), "error");
    }
}

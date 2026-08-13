/**
 * ImagePrompt Gallery — Gallery タブのサブタブ。
 * ws_image_prompt フォルダ配下の画像+.txtサイドカーを閲覧し、
 * クリックで選択→「追加」でプロンプトを組み立てて最終的にコピーする。
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { escapeHtml, setupSearchClearBtn } from "./util.js";

const API = {
    root:        () => `/wfm/gallery/image-prompt/root`,
    folders:     (root)   => `/wfm/gallery/folders?root=${encodeURIComponent(root)}`,
    images:      (params) => `/wfm/gallery/images?${new URLSearchParams(params)}`,
    imageMeta:   (path)   => `/wfm/gallery/image/meta?path=${encodeURIComponent(path)}`,
    thumb:       (path, w = 200) => `/wfm/gallery/image/thumb?path=${encodeURIComponent(path)}&w=${w}`,
    serveImage:  (path)   => `/wfm/gallery/image/serve?path=${encodeURIComponent(path)}`,
    savePrompt:            `/wfm/gallery/image/image-prompt`,
};

const state = {
    root: null,
    currentFolder: null,
    search: "",
    images: [],
    selectedImage: null,
    chips: [], // [{ path, filename, prompt }]
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

export function initImagePromptTab() {
    document.getElementById("wfm-imageprompt-refresh-btn")?.addEventListener("click", () => {
        loadFolderTree();
        loadImages();
    });

    setupSearchClearBtn("wfm-imageprompt-search", "wfm-imageprompt-search-clear-btn", () => {
        state.search = "";
        loadImages();
    });

    const searchInput = document.getElementById("wfm-imageprompt-search");
    searchInput?.addEventListener("input", debounce(() => {
        state.search = searchInput.value.trim();
        loadImages();
    }, 300));

    document.getElementById("wfm-imageprompt-add-btn")?.addEventListener("click", addSelectedToChips);
    document.getElementById("wfm-imageprompt-save-prompt-btn")?.addEventListener("click", saveSelectedPrompt);
    document.getElementById("wfm-imageprompt-clear-btn")?.addEventListener("click", clearAllChips);
    document.getElementById("wfm-imageprompt-copy-btn")?.addEventListener("click", copyFinalPrompt);
}

export async function activateImagePromptTab() {
    if (_initialized) return;
    _initialized = true;
    try {
        const data = await apiFetch(API.root());
        state.root = data.root;
        await loadFolderTree();
    } catch (e) {
        const tree = document.getElementById("wfm-imageprompt-tree");
        if (tree) tree.innerHTML = `<p class="wfm-placeholder">Error: ${escapeHtml(e.message)}</p>`;
    }
}

// ── フォルダツリー ────────────────────────────────────────────

async function loadFolderTree() {
    if (!state.root) return;
    const tree = document.getElementById("wfm-imageprompt-tree");
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
    // サブフォルダ内も含めた合計件数（クリックで再帰的に全画像を表示するため）
    const totalCount = node.image_count_total ?? node.image_count;
    if (totalCount > 0) {
        const badge = document.createElement("span");
        badge.className = "wfm-gallery-tree-count";
        badge.textContent = totalCount;
        label.appendChild(badge);
    }
    item.appendChild(label);

    label.addEventListener("click", () => {
        document.querySelectorAll("#wfm-imageprompt-tree .wfm-gallery-tree-item.selected").forEach(el => el.classList.remove("selected"));
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
    const grid = document.getElementById("wfm-imageprompt-grid");
    grid.innerHTML = `<p class="wfm-placeholder">${t("loading")}</p>`;

    // 上位フォルダを選択した場合もサブフォルダの画像をまとめて表示する
    const params = { folder: state.currentFolder, sort: "name_asc", recursive: "true" };
    if (state.search) params.search = state.search;

    try {
        const data = await apiFetch(API.images(params));
        state.images = data.images || [];
        document.getElementById("wfm-imageprompt-count").textContent = `${state.images.length} images`;
        renderImages();
    } catch (e) {
        grid.innerHTML = `<p class="wfm-placeholder">Error: ${escapeHtml(e.message)}</p>`;
    }
}

function renderImages() {
    const grid = document.getElementById("wfm-imageprompt-grid");
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

// ── 選択画像 / プロンプト表示 ─────────────────────────────────

async function selectImage(img) {
    state.selectedImage = img;
    document.querySelectorAll("#wfm-imageprompt-grid .wfm-gallery-thumb-card").forEach(el => {
        el.classList.toggle("selected", el.dataset.path === img.path);
    });

    document.getElementById("wfm-imageprompt-selected-name").textContent = img.filename;
    const preview = document.getElementById("wfm-imageprompt-selected-preview");
    preview.innerHTML = "";
    const previewImg = document.createElement("img");
    previewImg.src = API.serveImage(img.path);
    previewImg.alt = img.filename;
    previewImg.style.cssText = "max-width:100%;max-height:100%;object-fit:contain;";
    preview.appendChild(previewImg);

    const promptBox = document.getElementById("wfm-imageprompt-selected-prompt");
    promptBox.value = "";
    document.getElementById("wfm-imageprompt-save-prompt-btn").disabled = true;
    document.getElementById("wfm-imageprompt-add-btn").disabled = true;

    try {
        const meta = await apiFetch(API.imageMeta(img.path));
        promptBox.value = meta.image_prompt || "";
        document.getElementById("wfm-imageprompt-save-prompt-btn").disabled = false;
        document.getElementById("wfm-imageprompt-add-btn").disabled = !meta.image_prompt;
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

async function saveSelectedPrompt() {
    if (!state.selectedImage) return;
    const promptBox = document.getElementById("wfm-imageprompt-selected-prompt");
    try {
        const res = await apiFetch(API.savePrompt, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: state.selectedImage.path, prompt: promptBox.value }),
        });
        if (res.ok) {
            showToast(t("imagePromptSaved"), "success");
            document.getElementById("wfm-imageprompt-add-btn").disabled = !promptBox.value.trim();
        } else {
            showToast(t("saveFailed"), "error");
        }
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

// ── プロンプトビルダー (チップ / 最終プロンプト) ─────────────────

function cleanPromptText(text) {
    return String(text || "")
        .replace(/^[,\s]+|[,\s]+$/g, "")
        .replace(/\s*,\s*/g, ", ")
        .trim();
}

function addSelectedToChips() {
    const img = state.selectedImage;
    if (!img) return;
    const promptBox = document.getElementById("wfm-imageprompt-selected-prompt");
    const prompt = cleanPromptText(promptBox.value);
    if (!prompt) return;
    if (state.chips.some(c => c.path === img.path)) {
        showToast(t("imagePromptAlreadyAdded"), "info");
        return;
    }
    state.chips.push({ path: img.path, filename: img.filename, prompt });
    renderChips();
    rebuildFinalPrompt();
}

function removeChip(path) {
    state.chips = state.chips.filter(c => c.path !== path);
    renderChips();
    rebuildFinalPrompt();
}

function clearAllChips() {
    state.chips = [];
    renderChips();
    document.getElementById("wfm-imageprompt-final-prompt").value = "";
}

function renderChips() {
    const container = document.getElementById("wfm-imageprompt-chips");
    container.innerHTML = "";
    state.chips.forEach(chip => {
        const el = document.createElement("span");
        el.className = "wfm-imageprompt-chip";
        el.title = chip.prompt;

        const text = document.createElement("span");
        text.className = "wfm-imageprompt-chip-text";
        text.textContent = chip.filename.replace(/\.[^.]+$/, "");
        el.appendChild(text);

        const removeBtn = document.createElement("button");
        removeBtn.className = "wfm-imageprompt-chip-remove";
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", () => removeChip(chip.path));
        el.appendChild(removeBtn);

        container.appendChild(el);
    });
}

function rebuildFinalPrompt() {
    const combined = state.chips.map(c => c.prompt).join(", ");
    document.getElementById("wfm-imageprompt-final-prompt").value = cleanPromptText(combined);
}

async function copyFinalPrompt() {
    const text = document.getElementById("wfm-imageprompt-final-prompt").value;
    if (!text.trim()) {
        showToast(t("imagePromptNothingToCopy"), "info");
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        showToast(t("imagePromptCopiedToast"), "success");
    } catch (e) {
        showToast(t("errorWithMsg", e.message), "error");
    }
}

/**
 * Gallery Tab - output画像ブラウザ
 * 3カラム: フォルダツリー | 画像一覧 | 詳細パネル
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";

// ── 定数 ─────────────────────────────────────────────────────

const API = {
    folders:        (root)     => `/wfm/gallery/folders?root=${encodeURIComponent(root)}`,
    images:         (params)   => `/wfm/gallery/images?${new URLSearchParams(params)}`,
    imageMeta:      (path)     => `/wfm/gallery/image/meta?path=${encodeURIComponent(path)}`,
    imageWorkflow:  (path)     => `/wfm/gallery/image/workflow?path=${encodeURIComponent(path)}`,
    serveImage:     (path)     => `/wfm/gallery/image/serve?path=${encodeURIComponent(path)}`,
    saveImageMeta:              `/wfm/gallery/image/meta`,
    toggleFavorite:             `/wfm/gallery/image/favorite`,
    groups:                     `/wfm/gallery/groups`,
    groupCreate:                `/wfm/gallery/groups`,
    groupDelete:    (name)     => `/wfm/gallery/groups/${encodeURIComponent(name)}`,
    groupAdd:       (name)     => `/wfm/gallery/groups/${encodeURIComponent(name)}/add`,
    groupRemove:    (name)     => `/wfm/gallery/groups/${encodeURIComponent(name)}/remove`,
};

// ── 状態 ─────────────────────────────────────────────────────

const state = {
    outputRoot: "",        // ComfyUI output フォルダ
    currentFolder: "",     // 選択中フォルダ絶対パス
    images: [],            // 現在表示中画像リスト
    selectedImage: null,   // 選択中画像オブジェクト
    viewMode: localStorage.getItem("wfm_gallery_view") || "thumb",
    sortBy: localStorage.getItem("wfm_gallery_sort") || "date_desc",
    search: "",
    favoriteOnly: false,
    tagFilter: "",
    groups: [],
    treeExpanded: true,
    embeddedWorkflow: null,  // 選択画像のworkflow JSON
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

// ── フォルダツリー ────────────────────────────────────────────

async function loadFolderTree() {
    if (!state.outputRoot) return;

    const tree = document.getElementById("wfm-gallery-tree");
    tree.innerHTML = `<p class="wfm-placeholder">${t("loading")}</p>`;

    try {
        const data = await apiFetch(API.folders(state.outputRoot));
        if (data.error) {
            tree.innerHTML = `<p class="wfm-placeholder">${data.error}</p>`;
            return;
        }
        tree.innerHTML = "";
        renderTreeNode(data, tree, 0, true);
    } catch (e) {
        tree.innerHTML = `<p class="wfm-placeholder">Error: ${e.message}</p>`;
    }
}

function renderTreeNode(node, container, depth, isRoot) {
    const item = document.createElement("div");
    item.className = "wfm-gallery-tree-item";
    item.style.paddingLeft = `${depth * 12}px`;

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
        loadImages();
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

    try {
        const data = await apiFetch(API.images(params));
        state.images = data.images || [];
        document.getElementById("wfm-gallery-count").textContent = `${state.images.length} images`;
        renderImages();
        updateTagFilter(state.images);
    } catch (e) {
        grid.innerHTML = `<p class="wfm-placeholder">Error: ${e.message}</p>`;
    }
}

function renderImages() {
    const grid = document.getElementById("wfm-gallery-grid");
    grid.className = `wfm-gallery-grid wfm-gallery-view-${state.viewMode}`;

    if (state.images.length === 0) {
        grid.innerHTML = `<p class="wfm-placeholder">No images found.</p>`;
        return;
    }

    grid.innerHTML = "";

    if (state.viewMode === "thumb") {
        state.images.forEach(img => {
            const card = createThumbCard(img);
            grid.appendChild(card);
        });
    } else {
        grid.appendChild(createTable(state.images));
    }
}

function createThumbCard(img) {
    const card = document.createElement("div");
    card.className = "wfm-gallery-thumb-card";
    if (state.selectedImage && state.selectedImage.path === img.path) {
        card.classList.add("selected");
    }

    // サムネイル画像
    const imgEl = document.createElement("img");
    imgEl.className = "wfm-gallery-thumb-img";
    imgEl.loading = "lazy";
    imgEl.src = API.serveImage(img.path);
    imgEl.alt = img.filename;
    imgEl.onerror = () => {
        imgEl.style.display = "none";
        const placeholder = document.createElement("div");
        placeholder.className = "wfm-gallery-thumb-placeholder";
        placeholder.textContent = "?";
        card.insertBefore(placeholder, imgEl.nextSibling);
    };
    card.appendChild(imgEl);

    // お気に入りアイコン
    if (img.favorite) {
        const fav = document.createElement("span");
        fav.className = "wfm-gallery-thumb-fav";
        fav.textContent = "★";
        card.appendChild(fav);
    }

    // ファイル名
    const name = document.createElement("div");
    name.className = "wfm-gallery-thumb-name";
    name.textContent = img.filename;
    name.title = img.filename;
    card.appendChild(name);

    // タグ
    if (img.tags && img.tags.length > 0) {
        const tagsEl = document.createElement("div");
        tagsEl.className = "wfm-gallery-thumb-tags";
        img.tags.slice(0, 2).forEach(tag => {
            const t = document.createElement("span");
            t.className = "wfm-gallery-tag-badge";
            t.textContent = tag;
            tagsEl.appendChild(t);
        });
        card.appendChild(tagsEl);
    }

    // シングルクリック: 詳細表示
    card.addEventListener("click", () => {
        state.selectedImage = img;
        document.querySelectorAll(".wfm-gallery-thumb-card.selected").forEach(el => el.classList.remove("selected"));
        card.classList.add("selected");
        loadImageDetail(img);
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

    const thead = document.createElement("thead");
    thead.innerHTML = `<tr>
        <th></th>
        <th>Filename</th>
        <th>Size</th>
        <th>Date</th>
        <th>Tags</th>
        <th>Fav</th>
    </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    images.forEach(img => {
        const tr = document.createElement("tr");
        if (state.selectedImage && state.selectedImage.path === img.path) {
            tr.classList.add("selected");
        }

        tr.innerHTML = `
            <td><img src="${API.serveImage(img.path)}" class="wfm-gallery-table-thumb" loading="lazy" alt=""></td>
            <td class="wfm-gallery-table-name" title="${img.filename}">${img.filename}</td>
            <td>${formatBytes(img.size)}</td>
            <td>${formatDate(img.mtime)}</td>
            <td>${(img.tags || []).map(tag => `<span class="wfm-gallery-tag-badge">${tag}</span>`).join("")}</td>
            <td>${img.favorite ? "★" : "☆"}</td>
        `;

        tr.addEventListener("click", () => {
            state.selectedImage = img;
            tbody.querySelectorAll("tr.selected").forEach(el => el.classList.remove("selected"));
            tr.classList.add("selected");
            loadImageDetail(img);
        });

        tr.addEventListener("dblclick", () => openLightbox(img));

        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
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

async function loadImageDetail(img) {
    // プレビュー
    const preview = document.getElementById("wfm-gallery-detail-preview");
    preview.innerHTML = `<img src="${API.serveImage(img.path)}" class="wfm-gallery-detail-img" alt="${img.filename}" title="Double-click to enlarge">`;
    preview.querySelector("img").addEventListener("dblclick", () => openLightbox(img));

    // ファイル名
    document.getElementById("wfm-gallery-detail-filename").textContent = img.filename;

    // 基本情報
    document.getElementById("wfm-gallery-info-name").textContent = img.filename;
    document.getElementById("wfm-gallery-info-size").textContent = `Size: ${formatBytes(img.size)}`;
    document.getElementById("wfm-gallery-info-date").textContent = `Date: ${formatDate(img.mtime)}`;

    // お気に入りボタン
    const favBtn = document.getElementById("wfm-gallery-fav-toggle");
    updateFavBtn(favBtn, img.favorite);

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
        renderMetadata(metaRes.embedded || {});
        state.embeddedWorkflow = wfRes.has_workflow ? wfRes.workflow : null;

        const copyWfBtn = document.getElementById("wfm-gallery-copy-workflow-btn");
        copyWfBtn.disabled = !state.embeddedWorkflow;
        copyWfBtn.style.opacity = state.embeddedWorkflow ? "1" : "0.4";
    } catch (e) {
        document.getElementById("wfm-gallery-metadata-content").textContent = "Error loading metadata";
    }

    // グループタブ更新
    renderCurrentGroups(img.groups || []);
    renderGroupSelect();
}

function updateFavBtn(btn, isFav) {
    btn.textContent = isFav ? "★ Unfavorite" : "☆ Favorite";
    btn.classList.toggle("wfm-btn-primary", isFav);
}

function renderTagsDisplay(tags) {
    const container = document.getElementById("wfm-gallery-tags-display");
    container.innerHTML = "";
    tags.forEach(tag => {
        const span = document.createElement("span");
        span.className = "wfm-gallery-tag-badge wfm-gallery-tag-removable";
        span.innerHTML = `${tag} <button class="wfm-gallery-tag-remove" data-tag="${tag}" title="Remove">&times;</button>`;
        span.querySelector("button").addEventListener("click", () => removeTag(tag));
        container.appendChild(span);
    });
}

function renderMetadata(embedded) {
    const container = document.getElementById("wfm-gallery-metadata-content");
    if (!embedded || Object.keys(embedded).length === 0) {
        container.textContent = "No embedded metadata.";
        return;
    }
    container.innerHTML = "";
    for (const [key, value] of Object.entries(embedded)) {
        const row = document.createElement("div");
        row.className = "wfm-gallery-meta-row";
        const keyEl = document.createElement("span");
        keyEl.className = "wfm-gallery-meta-key";
        keyEl.textContent = key;
        const valEl = document.createElement("span");
        valEl.className = "wfm-gallery-meta-value";
        // 長いvalueは省略
        const display = String(value).length > 100 ? String(value).slice(0, 100) + "…" : String(value);
        valEl.textContent = display;
        valEl.title = String(value);
        row.appendChild(keyEl);
        row.appendChild(valEl);
        container.appendChild(row);
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
        // 一覧のキャッシュも更新
        const idx = state.images.findIndex(i => i.path === state.selectedImage.path);
        if (idx >= 0) Object.assign(state.images[idx], fields);
    } catch (e) {
        showToast(`Save failed: ${e.message}`, "error");
    }
}

// ── お気に入り ────────────────────────────────────────────────

async function toggleFavorite() {
    if (!state.selectedImage) return;
    try {
        const res = await fetch(API.toggleFavorite, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: state.selectedImage.path }),
        });
        const data = await res.json();
        state.selectedImage.favorite = data.favorite;
        const idx = state.images.findIndex(i => i.path === state.selectedImage.path);
        if (idx >= 0) state.images[idx].favorite = data.favorite;
        updateFavBtn(document.getElementById("wfm-gallery-fav-toggle"), data.favorite);
        renderImages();
    } catch (e) {
        showToast(`Error: ${e.message}`, "error");
    }
}

// ── グループ ─────────────────────────────────────────────────

async function loadGroups() {
    try {
        const data = await apiFetch(API.groups);
        state.groups = data.groups || [];
        renderGroupSelect();
        renderGroupsList();
    } catch (e) {
        console.error("loadGroups error:", e);
    }
}

function renderGroupSelect() {
    const sel = document.getElementById("wfm-gallery-group-select");
    sel.innerHTML = `<option value="">Select group</option>`;
    state.groups.forEach(g => {
        const opt = document.createElement("option");
        opt.value = g.name;
        opt.textContent = g.name;
        sel.appendChild(opt);
    });
}

function renderCurrentGroups(groups) {
    const container = document.getElementById("wfm-gallery-current-groups");
    container.innerHTML = "";
    if (!groups || groups.length === 0) {
        container.textContent = "Not in any group.";
        return;
    }
    groups.forEach(g => {
        const span = document.createElement("span");
        span.className = "wfm-gallery-tag-badge wfm-gallery-tag-removable";
        span.innerHTML = `${g} <button class="wfm-gallery-tag-remove" title="Remove from group">&times;</button>`;
        span.querySelector("button").addEventListener("click", () => removeFromGroup(g));
        container.appendChild(span);
    });
}

function renderGroupsList() {
    const container = document.getElementById("wfm-gallery-groups-list");
    container.innerHTML = "";
    if (state.groups.length === 0) {
        container.textContent = "No groups yet.";
        return;
    }
    state.groups.forEach(g => {
        const row = document.createElement("div");
        row.className = "wfm-gallery-group-row";
        row.innerHTML = `<span class="wfm-gallery-group-name">${g.name}</span>
            <button class="wfm-btn wfm-btn-sm wfm-btn-danger wfm-gallery-group-delete" data-name="${g.name}" title="Delete group">&times;</button>`;
        row.querySelector(".wfm-gallery-group-delete").addEventListener("click", () => deleteGroup(g.name));
        container.appendChild(row);
    });
}

async function createGroup(name) {
    if (!name.trim()) return;
    try {
        await fetch(API.groupCreate, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.trim() }),
        });
        await loadGroups();
        showToast(`Group "${name}" created`, "success");
    } catch (e) {
        showToast(`Error: ${e.message}`, "error");
    }
}

async function deleteGroup(name) {
    if (!confirm(`Delete group "${name}"?`)) return;
    try {
        await fetch(API.groupDelete(name), { method: "DELETE" });
        await loadGroups();
        showToast(`Group "${name}" deleted`, "success");
    } catch (e) {
        showToast(`Error: ${e.message}`, "error");
    }
}

async function addToGroup(groupName) {
    if (!state.selectedImage || !groupName) return;
    try {
        await fetch(API.groupAdd(groupName), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: state.selectedImage.path }),
        });
        const groups = [...(state.selectedImage.groups || [])];
        if (!groups.includes(groupName)) groups.push(groupName);
        state.selectedImage.groups = groups;
        renderCurrentGroups(groups);
        showToast(`Added to "${groupName}"`, "success");
    } catch (e) {
        showToast(`Error: ${e.message}`, "error");
    }
}

async function removeFromGroup(groupName) {
    if (!state.selectedImage) return;
    try {
        await fetch(API.groupRemove(groupName), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: state.selectedImage.path }),
        });
        const groups = (state.selectedImage.groups || []).filter(g => g !== groupName);
        state.selectedImage.groups = groups;
        renderCurrentGroups(groups);
        showToast(`Removed from "${groupName}"`, "success");
    } catch (e) {
        showToast(`Error: ${e.message}`, "error");
    }
}

// ── ライトボックス ────────────────────────────────────────────

function openLightbox(img) {
    const overlay = document.createElement("div");
    overlay.className = "wfm-gallery-lightbox";
    overlay.innerHTML = `
        <div class="wfm-gallery-lightbox-inner">
            <img src="${API.serveImage(img.path)}" class="wfm-gallery-lightbox-img" alt="${img.filename}">
            <div class="wfm-gallery-lightbox-footer">${img.filename}</div>
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

// ── フォルダツリーパネル折りたたみ ─────────────────────────────

function toggleTreePanel() {
    const panel = document.getElementById("wfm-gallery-tree-panel");
    const btn = document.getElementById("wfm-gallery-tree-toggle");
    state.treeExpanded = !state.treeExpanded;
    panel.classList.toggle("collapsed", !state.treeExpanded);
    btn.textContent = state.treeExpanded ? "◀" : "▶";
}

// ── outputパス取得 ────────────────────────────────────────────

async function detectOutputPath() {
    // ComfyUIのoutputフォルダを設定から取得する
    try {
        const res = await fetch("/wfm/settings");
        const data = await res.json();
        const outputDir = data.output_dir || data.comfyui_output_dir || "";
        if (outputDir) {
            state.outputRoot = outputDir;
            document.getElementById("wfm-gallery-output-label").textContent = outputDir;
            return;
        }
    } catch (e) {
        // ignore
    }
    // フォールバック: system_stats から output_dir を取得
    try {
        const res = await fetch("/system_stats");
        if (res.ok) {
            const data = await res.json();
            // ComfyUI /system_stats は直接output_dirを返さないので、
            // ユーザーに入力させるUIへフォールバック
        }
    } catch (e) { /* ignore */ }

    showOutputPathInput();
}

function showOutputPathInput() {
    const label = document.getElementById("wfm-gallery-output-label");
    label.innerHTML = `
        <div style="display:flex;gap:4px;align-items:center;padding:4px;">
            <input type="text" id="wfm-gallery-output-input" class="wfm-input"
                placeholder="ComfyUI output path..." style="flex:1;font-size:12px;padding:4px 6px;">
            <button id="wfm-gallery-output-set-btn" class="wfm-btn wfm-btn-sm wfm-btn-primary">Set</button>
        </div>
    `;
    const savedPath = localStorage.getItem("wfm_gallery_output_path") || "";
    document.getElementById("wfm-gallery-output-input").value = savedPath;

    document.getElementById("wfm-gallery-output-set-btn").addEventListener("click", () => {
        const val = document.getElementById("wfm-gallery-output-input").value.trim();
        if (!val) return;
        state.outputRoot = val;
        localStorage.setItem("wfm_gallery_output_path", val);
        label.textContent = val;
        loadFolderTree();
    });

    if (savedPath) {
        state.outputRoot = savedPath;
        loadFolderTree();
    }
}

// ── 初期化 ────────────────────────────────────────────────────

export function initGalleryTab() {
    // タブ切り替え時にのみ初期化
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
    // ソートの初期値を反映
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
    // ビューの初期値を反映
    document.querySelectorAll("[data-gallery-view]").forEach(b => {
        b.classList.toggle("active", b.dataset.galleryView === state.viewMode);
    });

    // フォルダツリー折りたたみ
    document.getElementById("wfm-gallery-tree-toggle")?.addEventListener("click", toggleTreePanel);

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
        saveMetaField({ memo }).then(() => showToast("Memo saved", "success"));
    });

    // お気に入りトグル (詳細パネル)
    document.getElementById("wfm-gallery-fav-toggle")?.addEventListener("click", toggleFavorite);

    // ワークフローコピー
    document.getElementById("wfm-gallery-copy-workflow-btn")?.addEventListener("click", () => {
        if (!state.embeddedWorkflow) {
            showToast("No embedded workflow found.", "error");
            return;
        }
        navigator.clipboard.writeText(JSON.stringify(state.embeddedWorkflow, null, 2))
            .then(() => showToast("Workflow copied to clipboard!", "success"))
            .catch(() => showToast("Copy failed", "error"));
    });

    // グループ作成
    document.getElementById("wfm-gallery-new-group-btn")?.addEventListener("click", () => {
        const input = document.getElementById("wfm-gallery-new-group-input");
        createGroup(input.value);
        input.value = "";
    });

    // グループに追加
    document.getElementById("wfm-gallery-group-add-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-gallery-group-select");
        if (sel.value) addToGroup(sel.value);
    });

    // 詳細タブ切り替え
    document.querySelectorAll(".wfm-gallery-detail-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-gallery-detail-tab-btn").forEach(b => b.classList.remove("active"));
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

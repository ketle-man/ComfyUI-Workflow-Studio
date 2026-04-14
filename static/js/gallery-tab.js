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
    groupRename:    (name)     => `/wfm/gallery/groups/${encodeURIComponent(name)}`,
    groupDelete:    (name)     => `/wfm/gallery/groups/${encodeURIComponent(name)}`,
    groupAdd:       (name)     => `/wfm/gallery/groups/${encodeURIComponent(name)}/add`,
    groupRemove:    (name)     => `/wfm/gallery/groups/${encodeURIComponent(name)}/remove`,
};

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
        // root フォルダを自動選択（フォルダ未選択の場合のみ）
        if (!state.currentFolder) {
            const firstLabel = tree.querySelector(".wfm-gallery-tree-label");
            if (firstLabel) firstLabel.click();
        }
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
        state.selectedImages.clear();
        updateBulkBar();
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

    // グループフィルタはサーバーサイドで処理
    if (state.groupFilter) params.group = state.groupFilter;

    try {
        const images = (await apiFetch(API.images(params))).images || [];
        state.images = images;
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
    card.title = img.filename;
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

    // クリック: 詳細表示 / Ctrl+クリック: 複数選択
    card.addEventListener("click", (e) => {
        if (e.ctrlKey || e.metaKey) {
            // 複数選択トグル
            if (state.selectedImages.has(img.path)) {
                state.selectedImages.delete(img.path);
                card.classList.remove("multi-selected");
            } else {
                state.selectedImages.add(img.path);
                card.classList.add("multi-selected");
            }
            updateBulkBar();
        } else {
            // 通常選択: 詳細表示
            state.selectedImage = img;
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
        tdThumb.innerHTML = `<img src="${API.serveImage(img.path)}" class="wfm-gallery-table-thumb" loading="lazy" alt="">`;

        const tdName = document.createElement("td");
        tdName.className = "wfm-gallery-table-name";
        tdName.title = img.filename;
        tdName.textContent = img.filename;

        const tdSize = document.createElement("td");
        tdSize.textContent = formatBytes(img.size);

        const tdDate = document.createElement("td");
        tdDate.textContent = formatDate(img.mtime);

        const tdTags = document.createElement("td");
        tdTags.innerHTML = (img.tags || []).map(tag => `<span class="wfm-gallery-tag-badge">${tag}</span>`).join("");

        tr.appendChild(tdFav);
        tr.appendChild(tdThumb);
        tr.appendChild(tdName);
        tr.appendChild(tdSize);
        tr.appendChild(tdDate);
        tr.appendChild(tdTags);

        // クリック: 詳細表示 / Ctrl+クリック: 複数選択
        tr.addEventListener("click", (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (state.selectedImages.has(img.path)) {
                    state.selectedImages.delete(img.path);
                    tr.classList.remove("multi-selected");
                } else {
                    state.selectedImages.add(img.path);
                    tr.classList.add("multi-selected");
                }
                updateBulkBar();
            } else {
                state.selectedImage = img;
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

// ── 複数選択バー ──────────────────────────────────────────────

function updateBulkBar() {
    const bar = document.getElementById("wfm-gallery-bulk-bar");
    const countEl = document.getElementById("wfm-gallery-bulk-count");
    if (!bar) return;
    const count = state.selectedImages.size;
    if (count > 0) {
        bar.style.display = "";
        countEl.textContent = `${count} selected`;
    } else {
        bar.style.display = "none";
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
        showToast(`Error: ${e.message}`, "error");
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
    } catch (e) {
        renderWorkflowJson(null);
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
        span.innerHTML = `${tag} <button class="wfm-gallery-tag-remove" data-tag="${tag}" title="Remove">&times;</button>`;
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
        showToast(`Save failed: ${e.message}`, "error");
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
        bulkSel.innerHTML = `<option value="">Add to Group...</option>`;
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
                            : allGroups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("")}
                    </select>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-gallery-grp-rename-btn"
                        ${allGroups.length === 0 ? "disabled" : ""} title="${t("modelsRename")}">&#9998;</button>
                    <button class="wfm-btn wfm-btn-sm wfm-btn-danger" id="wfm-gallery-grp-delete-btn"
                        ${allGroups.length === 0 ? "disabled" : ""} title="${t("modelsDelete")}">&times;</button>
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
                showToast(`Removed from "${g}"`, "success");
            } catch (e) {
                showToast(`Error: ${e.message}`, "error");
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
            showToast(`Added to "${g}"`, "success");
        } catch (e) {
            showToast(`Error: ${e.message}`, "error");
        }
    });

    // グループ作成（作成後に現在の画像にも追加）
    el.querySelector("#wfm-gallery-grp-create-btn")?.addEventListener("click", async () => {
        const input = el.querySelector("#wfm-gallery-grp-new-input");
        const name = input?.value.trim();
        if (!name) return;
        if (state.groups.some(g => g.name === name)) {
            showToast("Group already exists", "warning");
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
            showToast(`Group "${name}" created`, "success");
        } catch (e) {
            showToast(`Error: ${e.message}`, "error");
        }
    });

    // グループ名変更
    el.querySelector("#wfm-gallery-grp-rename-btn")?.addEventListener("click", async () => {
        const sel = el.querySelector("#wfm-gallery-grp-manage-sel");
        const oldName = sel?.value;
        if (!oldName) return;
        const newName = prompt(`Rename group "${oldName}" to:`, oldName);
        if (!newName || newName === oldName) return;
        if (state.groups.some(g => g.name === newName)) {
            showToast("Group name already exists", "warning");
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
            showToast(`Renamed to "${newName}"`, "success");
        } catch (e) {
            showToast(`Error: ${e.message}`, "error");
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
            showToast(`Group "${name}" deleted`, "success");
        } catch (e) {
            showToast(`Error: ${e.message}`, "error");
        }
    });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ── 一括操作 ─────────────────────────────────────────────────

async function bulkAddToGroup(groupName) {
    if (!groupName || state.selectedImages.size === 0) return;
    const paths = [...state.selectedImages];
    let success = 0;
    for (const path of paths) {
        try {
            await fetch(API.groupAdd(groupName), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path }),
            });
            // キャッシュ更新
            const img = state.images.find(i => i.path === path);
            if (img) {
                if (!img.groups) img.groups = [];
                if (!img.groups.includes(groupName)) img.groups.push(groupName);
            }
            success++;
        } catch (e) { /* continue */ }
    }
    showToast(`Added ${success} image(s) to "${groupName}"`, "success");
}

async function bulkSetFavorite(favoriteValue) {
    if (state.selectedImages.size === 0) return;
    const paths = [...state.selectedImages];
    let success = 0;
    for (const path of paths) {
        try {
            const img = state.images.find(i => i.path === path);
            if (!img || img.favorite === favoriteValue) continue;
            await fetch(API.toggleFavorite, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path }),
            });
            img.favorite = favoriteValue;
            success++;
        } catch (e) { /* continue */ }
    }
    if (success > 0) {
        showToast(`${favoriteValue ? "Favorited" : "Unfavorited"} ${success} image(s)`, "success");
        renderImages(); // お気に入り状態が変わったのでビュー更新
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
        saveMetaField({ memo }).then(() => showToast("Memo saved", "success"));
    });

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

    // 一括操作バー
    document.getElementById("wfm-gallery-bulk-deselect")?.addEventListener("click", () => {
        state.selectedImages.clear();
        updateBulkBar();
        // 選択状態をビューから除去
        document.querySelectorAll(".multi-selected").forEach(el => el.classList.remove("multi-selected"));
    });

    document.getElementById("wfm-gallery-bulk-group-add")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-gallery-bulk-group-select");
        if (sel && sel.value) {
            bulkAddToGroup(sel.value);
        } else {
            showToast("Please select a group", "error");
        }
    });

    document.getElementById("wfm-gallery-bulk-fav")?.addEventListener("click", () => {
        bulkSetFavorite(true);
    });

    document.getElementById("wfm-gallery-bulk-unfav")?.addEventListener("click", () => {
        bulkSetFavorite(false);
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

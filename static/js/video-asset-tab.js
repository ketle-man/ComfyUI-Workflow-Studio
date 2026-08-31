/**
 * Video Tab - Asset subtab: browses the videos a Plan run has generated.
 *
 * Deliberately thin — it reuses Gallery's existing backend (groups, tags/memo
 * sidecar, thumbnailing) exactly like feeder-tab.js's own Gallery mode does,
 * rather than re-implementing folder browsing, bulk selection, etc. Anything
 * beyond basic browsing/tagging (move, export, delete, multi-select) is left
 * to the real Gallery tab via the "Open in Gallery" button.
 */

import { VIDEO_GROUP, VTEMP_GROUP, ensureVideoGroup } from "./gallery-tab.js";
import { setSourcePreview } from "./video-preview.js";

// Sentinel for the "All Video Assets" option — not a real backend group, since
// Gallery's group filter only ever matches one group at a time. Selecting it
// fetches VIDEO_GROUP and VTEMP_GROUP separately and merges them (see _loadImages).
const ALL_GROUPS_VALUE = "__video_asset_all__";

// Display names are now identical to the underlying group names (minus the
// "__...__" wrapping) — no more per-plan "VideoPlan:<name>" sub-groups, so the
// dropdown is always exactly these three fixed entries.
const _GROUPS = [ALL_GROUPS_VALUE, VIDEO_GROUP, VTEMP_GROUP];

const _s = {
    outputDir: "",
    group: ALL_GROUPS_VALUE,
    images: [],
    selectedPath: null,
    loaded: false, // becomes true once the Asset subtab has been shown at least once
};

async function _fetchOutputDir() {
    if (_s.outputDir) return;
    try {
        const res = await fetch("/api/wfm/settings/output-dir");
        if (res.ok) {
            const data = await res.json();
            _s.outputDir = (data.current || "").replace(/\\/g, "/").replace(/\/$/, "");
        }
    } catch { /* non-critical */ }
}

function _groupLabel(g) {
    if (g === ALL_GROUPS_VALUE) return "All Video Assets";
    if (g === VIDEO_GROUP) return "Video Assets";
    if (g === VTEMP_GROUP) return "Video Temp";
    return g;
}

function _renderGroupSelect() {
    const sel = document.getElementById("wfm-video-asset-group");
    if (!sel) return;
    sel.innerHTML = _GROUPS
        .map((g) => `<option value="${g}"${g === _s.group ? " selected" : ""}>${_groupLabel(g)}</option>`)
        .join("");
}

async function _fetchGroupImages(group) {
    const params = new URLSearchParams({ folder: _s.outputDir, group, recursive: "true", sort: "date_desc" });
    const res = await fetch(`/wfm/gallery/images?${params}`);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return data.images || [];
}

async function _loadImages() {
    const grid = document.getElementById("wfm-video-asset-grid");
    const statusEl = document.getElementById("wfm-video-asset-status");
    if (!grid) return;
    await _fetchOutputDir();
    if (!_s.outputDir) {
        grid.innerHTML = `<div class="wfm-placeholder">No output folder configured</div>`;
        return;
    }
    grid.innerHTML = `<div class="wfm-placeholder">Loading...</div>`;
    try {
        let images;
        if (_s.group === ALL_GROUPS_VALUE) {
            // "All Video Assets" = the union of the curated __Video Assets__
            // group and __Video Temp__ (auto-populated by every plan run,
            // organized into __Video Assets__ by the user on their own
            // schedule) — not a single backend group filter, so fetch both
            // and merge.
            const [curated, temp] = await Promise.all([
                _fetchGroupImages(VIDEO_GROUP),
                _fetchGroupImages(VTEMP_GROUP),
            ]);
            const byPath = new Map();
            for (const img of [...curated, ...temp]) byPath.set(img.path, img);
            images = Array.from(byPath.values()).sort((a, b) => b.mtime - a.mtime);
        } else {
            images = await _fetchGroupImages(_s.group);
        }
        _s.images = images;
        _renderGrid();
        if (statusEl) statusEl.textContent = `${_s.images.length} video(s)`;
    } catch (err) {
        _s.images = [];
        grid.innerHTML = `<div class="wfm-placeholder" style="color:var(--wfm-danger)">Load failed: ${err.message}</div>`;
        if (statusEl) statusEl.textContent = "";
    }
}

function _renderGrid() {
    const grid = document.getElementById("wfm-video-asset-grid");
    if (!grid) return;
    if (_s.images.length === 0) {
        grid.innerHTML = `<div class="wfm-placeholder">No videos yet</div>`;
        return;
    }
    grid.innerHTML = "";
    for (const img of _s.images) grid.appendChild(_makeCard(img));
}

function _makeCard(img) {
    const card = document.createElement("div");
    card.className = "wfm-video-asset-card" + (img.path === _s.selectedPath ? " selected" : "");
    card.dataset.path = img.path;

    const thumb = document.createElement("img");
    thumb.className = "wfm-video-asset-card-img";
    thumb.loading = "lazy";
    thumb.src = `/wfm/gallery/image/thumb?path=${encodeURIComponent(img.path)}&w=200`;
    thumb.onerror = () => { thumb.style.display = "none"; };

    const name = document.createElement("div");
    name.className = "wfm-video-asset-card-name";
    name.textContent = img.filename;
    name.title = img.filename;

    card.append(thumb, name);
    card.addEventListener("click", () => _selectImage(img));
    return card;
}

function _selectImage(img) {
    _s.selectedPath = img.path;
    document.querySelectorAll(".wfm-video-asset-card").forEach((c) => {
        c.classList.toggle("selected", c.dataset.path === img.path);
    });
    _renderDetail(img);
    _loadIntoSourcePreview(img);
}

// Feeds the selected asset's video into the center panel's Asset/Source preview
// pane (see video-preview.js) so it's visible without switching tabs, and so the
// Frame/GIF property tools can operate on it just like a Video Source drop.
// Fetched as a Blob and wrapped as a "local" source rather than trying to map
// Gallery's arbitrary absolute path onto ComfyUI's filename/subfolder/type
// triple — that keeps the GIF tool's existing upload-on-first-use path working
// unchanged for both cases.
async function _loadIntoSourcePreview(img) {
    try {
        const res = await fetch(`/wfm/gallery/image/serve?path=${encodeURIComponent(img.path)}`);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const file = new File([blob], img.filename, { type: blob.type || "video/mp4" });
        setSourcePreview(URL.createObjectURL(file), { kind: "local", file });
    } catch (err) {
        console.warn("[VideoAsset] failed to load preview:", err);
    }
}

function _renderDetail(img) {
    const panel = document.getElementById("wfm-video-asset-detail");
    if (!panel) return;
    // Filename/memo are untrusted (filesystem names, user-entered text) — the
    // markup skeleton is static, and those two values are assigned afterward
    // via textContent/.value, never interpolated into the HTML string itself.
    panel.innerHTML = `
        <div class="wfm-video-asset-name" id="wfm-video-asset-name"></div>
        <label>Tags</label>
        <div class="wfm-video-asset-tags" id="wfm-video-asset-tags"></div>
        <div style="display:flex;gap:6px;">
            <input type="text" id="wfm-video-asset-tag-input" class="wfm-input" placeholder="Add tag" style="flex:1;">
            <button type="button" class="wfm-btn wfm-btn-sm" id="wfm-video-asset-tag-add">Add</button>
        </div>
        <label style="margin-top:10px;">Memo</label>
        <textarea id="wfm-video-asset-memo" class="wfm-textarea" rows="3"></textarea>
        <button type="button" class="wfm-btn wfm-btn-sm" id="wfm-video-asset-memo-save" style="margin-top:6px;">Save Memo</button>
        <button type="button" class="wfm-btn wfm-btn-primary wfm-btn-sm" id="wfm-video-asset-open-gallery" style="width:100%;margin-top:12px;">Open in Gallery</button>
    `;

    const nameEl = document.getElementById("wfm-video-asset-name");
    if (nameEl) { nameEl.textContent = img.filename; nameEl.title = img.filename; }
    const memoEl = document.getElementById("wfm-video-asset-memo");
    if (memoEl) memoEl.value = img.memo || "";

    _renderTags(img);

    panel.querySelector("#wfm-video-asset-tag-add")?.addEventListener("click", async () => {
        const input = panel.querySelector("#wfm-video-asset-tag-input");
        const tag = input?.value.trim();
        if (!tag) return;
        const tags = Array.from(new Set([...(img.tags || []), tag]));
        await _saveMeta(img.path, { tags });
        img.tags = tags;
        input.value = "";
        _renderTags(img);
    });

    panel.querySelector("#wfm-video-asset-memo-save")?.addEventListener("click", async () => {
        const memo = panel.querySelector("#wfm-video-asset-memo")?.value || "";
        await _saveMeta(img.path, { memo });
        img.memo = memo;
    });

    panel.querySelector("#wfm-video-asset-open-gallery")?.addEventListener("click", () => {
        document.querySelector('.wfm-tab[data-tab="gallery"]')?.click();
        const filterSel = document.getElementById("wfm-gallery-group-filter");
        if (filterSel) {
            // ALL_GROUPS_VALUE is a virtual union with no Gallery-side equivalent
            // (Gallery's own filter only ever matches one real group) — fall back
            // to the curated group, the closer of the two to "everything worth keeping".
            filterSel.value = _s.group === ALL_GROUPS_VALUE ? VIDEO_GROUP : _s.group;
            filterSel.dispatchEvent(new Event("change"));
        }
    });
}

function _renderTags(img) {
    const container = document.getElementById("wfm-video-asset-tags");
    if (!container) return;
    const tags = img.tags || [];
    container.innerHTML = "";
    if (tags.length === 0) {
        const placeholder = document.createElement("span");
        placeholder.className = "wfm-placeholder";
        placeholder.textContent = "No tags";
        container.appendChild(placeholder);
        return;
    }
    // Built via DOM APIs (not innerHTML) since tag text is user-entered —
    // textContent keeps it inert regardless of what characters it contains.
    for (const tag of tags) {
        const pill = document.createElement("span");
        pill.className = "wfm-video-asset-tag";
        pill.append(document.createTextNode(`${tag} `));

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", async () => {
            const newTags = tags.filter((t2) => t2 !== tag);
            await _saveMeta(img.path, { tags: newTags });
            img.tags = newTags;
            _renderTags(img);
        });

        pill.appendChild(removeBtn);
        container.appendChild(pill);
    }
}

async function _saveMeta(path, data) {
    try {
        await fetch("/wfm/gallery/image/meta", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, ...data }),
        });
    } catch (err) {
        console.warn("[VideoAsset] saveMeta failed:", err);
    }
}

// Called whenever the Asset subtab becomes active (see video-tab.js's subtab
// toggle) — always refetches rather than caching, so a Plan run's newly
// generated videos show up as soon as the user switches over to look.
export async function refreshVideoAssetTab() {
    if (!_s.loaded) {
        _renderGroupSelect();
        _s.loaded = true;
    }
    await _loadImages();
}

export function initVideoAssetTab() {
    document.getElementById("wfm-video-asset-group")?.addEventListener("change", (e) => {
        _s.group = e.target.value;
        _s.selectedPath = null;
        const panel = document.getElementById("wfm-video-asset-detail");
        if (panel) panel.innerHTML = `<span class="wfm-placeholder">Select a video</span>`;
        _loadImages();
    });
    document.getElementById("wfm-video-asset-refresh")?.addEventListener("click", () => _loadImages());

    // Neither reserved group is ever auto-created by a batch run itself (see
    // video-plan-tab.js's _ensureVideoAssetGroups, which only ensures
    // __Video Temp__ right before a run starts), so a fresh install or a group
    // deleted via Gallery's Manage Groups would otherwise never come back on
    // its own — add_to_group() happily records membership on individual images
    // without ever re-registering the group itself. ensureVideoGroup() ensures
    // both __Video Assets__ and __Video Temp__ every time the Asset subtab inits.
    ensureVideoGroup();
}

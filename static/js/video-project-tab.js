/**
 * Video Tab - Sidebar "Project" subtab (next to Asset): browses saved Video
 * Plan files (ws_videoplan_*.json in video_plan/), independent of which plan
 * (if any) is currently loaded in the Plan editor.
 *
 * Deliberately thin, mirroring video-asset-tab.js's own scope — clicking an
 * item hands off to video-plan-tab.js's openSavedVideoPlan() rather than
 * re-implementing plan loading here.
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./util.js";
import { openSavedVideoPlan } from "./video-plan-tab.js";

const _s = {
    plans: [],
    activeFilename: null,
    loaded: false, // becomes true once the Project subtab has been shown at least once
};

function _formatUpdatedAt(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString();
}

function _renderList() {
    const list = document.getElementById("wfm-video-project-list");
    if (!list) return;
    if (_s.plans.length === 0) {
        list.innerHTML = `<span class="wfm-placeholder">${t("videoProjectEmpty")}</span>`;
        return;
    }
    list.innerHTML = "";
    for (const plan of _s.plans) list.appendChild(_makeItem(plan));
}

function _makeItem(plan) {
    const item = document.createElement("div");
    item.className = "wfm-video-project-item" + (plan.filename === _s.activeFilename ? " active" : "");
    item.dataset.filename = plan.filename;

    const thumb = document.createElement("img");
    thumb.className = "wfm-video-project-item-thumb";
    thumb.loading = "lazy";
    if (plan.thumbnail) thumb.src = plan.thumbnail;
    thumb.onerror = () => { thumb.style.visibility = "hidden"; };

    const info = document.createElement("div");
    info.className = "wfm-video-project-item-info";

    const name = document.createElement("div");
    name.className = "wfm-video-project-item-name";
    name.textContent = plan.name || plan.filename;
    name.title = plan.filename;

    const meta = document.createElement("div");
    meta.className = "wfm-video-project-item-meta";
    const blockLabel = t("videoProjectBlockCount", plan.block_count ?? 0);
    const updated = _formatUpdatedAt(plan.updated_at);
    meta.textContent = updated ? `${blockLabel} · ${updated}` : blockLabel;
    meta.title = plan.note || "";

    info.append(name, meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "wfm-video-project-item-delete";
    deleteBtn.textContent = "×";
    deleteBtn.title = t("delete");
    deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        _deletePlan(plan);
    });

    item.append(thumb, info, deleteBtn);
    item.addEventListener("click", () => _openPlan(plan));
    return item;
}

async function _openPlan(plan) {
    _s.activeFilename = plan.filename;
    _renderList();
    await openSavedVideoPlan(plan.filename);
}

async function _deletePlan(plan) {
    if (!window.confirm(t("videoProjectDeleteConfirm", plan.name || plan.filename))) return;
    try {
        const res = await fetch("/api/wfm/video/plans/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: plan.filename }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (_s.activeFilename === plan.filename) _s.activeFilename = null;
        showToast(t("videoProjectDeleted"), "success");
        await refreshVideoProjectTab();
    } catch (err) {
        showToast(`${t("videoProjectDeleteFailed")}: ${err.message}`, "error");
    }
}

// Called whenever the Project subtab becomes active (see video-tab.js's prop-tab
// toggle) — always refetches rather than caching, so a plan saved elsewhere
// (Plan pane's Save/Save As) shows up as soon as the user switches over to look.
export async function refreshVideoProjectTab() {
    const list = document.getElementById("wfm-video-project-list");
    if (!list) return;
    try {
        const res = await fetch("/api/wfm/video/plans");
        if (!res.ok) throw new Error(String(res.status));
        _s.plans = await res.json();
        _renderList();
    } catch (err) {
        list.innerHTML = `<span class="wfm-placeholder" style="color:var(--wfm-danger)">${escapeHtml(t("videoProjectLoadListFailed"))}: ${escapeHtml(err.message)}</span>`;
    }
    _s.loaded = true;
}

export function initVideoProjectTab() {
    document.getElementById("wfm-video-project-refresh")?.addEventListener("click", () => refreshVideoProjectTab());
}

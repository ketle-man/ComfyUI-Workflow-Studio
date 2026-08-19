/**
 * Models Tab - Detail modal (double-click) and the side panel's
 * Info / Group / CivitAI tabs.
 *
 * Part of the grid-view.js / selection-bulk.js / detail-panel.js circular
 * import triangle — see the note at the top of grid-view.js.
 */

import { showToast, openModal, closeModal } from "../app.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../util.js";
import { state, RESERVED_GROUPS, GENUI_TYPE_MAP } from "./state.js";
import { getCurrentModels, renderTagFilter, renderDirFilter } from "./filters.js";
import { getBadgePalette, modelBadgesHtml, openBadgeEditModal } from "./badges.js";
import { parseModelPath, getExtension, getStem, loadPreviewImage, previewUrl } from "./helpers.js";
import { renderModelGrid } from "./grid-view.js";
import {
    applyToGenUI, applyEmbeddingToPrompt, saveModelMetadata, toggleGroupEnable,
    fetchModelMetadata, saveModelGroups,
} from "../models-tab.js";

// ── Detail Modal (double-click, with badges) ──────────────

export function openDetailModal(modelName) {
    const meta = state.modelMetadata[modelName] || {};
    const { dir, name } = parseModelPath(modelName);
    const ext = getExtension(name);
    const isFav = !!meta.favorite;
    const tagsStr = (meta.tags || []).join(", ");
    const selectedBadges = meta.badges || [];
    const palette = getBadgePalette();
    const allBadgeLabels = Object.keys(palette).sort();

    const badgeCheckboxes = allBadgeLabels.map((label) => {
        const checked = selectedBadges.includes(label) ? " checked" : "";
        const color = palette[label] || "";
        const style = color ? `background:${color};color:#fff;` : "";
        return `<label class="wfm-badge-check-label">
            <input type="checkbox" class="wfm-badge-checkbox" value="${escapeHtml(label)}"${checked}>
            <span class="wfm-badge wfm-badge-model" style="${style}">${escapeHtml(label)}</span>
        </label>`;
    }).join("");

    const html = `
        <div class="wfm-modal-thumb-section">
            <img class="wfm-modal-thumb-img" style="display:none" />
            <div class="wfm-modal-thumb-placeholder">${t("modelsNoPreview")}</div>
        </div>
        <div style="text-align:center;margin-bottom:8px;">
            <button class="wfm-btn wfm-btn-sm" id="wfm-modal-change-thumb">${t("changeThumbnail")}</button>
            <input type="file" id="wfm-modal-thumb-file" accept="image/*" style="display:none">
        </div>
        <div class="wfm-modal-two-col">
            <div class="wfm-modal-left">
                <section>
                    <h4>${t("modelsInfo")}</h4>
                    <div><span class="wfm-badge wfm-badge-sm">${escapeHtml(ext)}</span>${dir ? ` <span class="wfm-badge wfm-badge-sm wfm-badge-dir">${escapeHtml(dir)}</span>` : ""}</div>
                </section>
                <section>
                    <h4>${t("modelsBadges")} <button class="wfm-btn wfm-btn-sm" id="wfm-modal-badge-manage" style="margin-left:6px;font-size:10px;">&#9881; ${t("badgeManage")}</button></h4>
                    <div id="wfm-modal-badge-checkboxes" class="wfm-badge-checkboxes">
                        ${allBadgeLabels.length === 0
                            ? `<span style="color:var(--wfm-text-secondary);font-size:12px;">${t("badgeNoneHint")}</span>`
                            : badgeCheckboxes}
                    </div>
                </section>
                <section>
                    <h4>${t("modelsTags")} <span style="font-weight:normal;font-size:11px;">${t("modelsTagsHint")}</span></h4>
                    <input type="text" class="wfm-input" id="wfm-modal-model-tags" value="${escapeHtml(tagsStr)}" placeholder="${t("modelsTagsPlaceholder")}">
                </section>
                <section>
                    <h4>${t("modelsMemo")}</h4>
                    <textarea class="wfm-textarea" id="wfm-modal-model-memo" rows="4" placeholder="${t("modelsMemoPlaceholder")}">${escapeHtml(meta.memo || "")}</textarea>
                </section>
                <div class="wfm-modal-actions">
                    <button class="wfm-btn wfm-btn-primary wfm-btn-sm" id="wfm-modal-model-save">${t("modelsSave")}</button>
                    ${state.activeModelType === "embedding"
                        ? `<button class="wfm-btn wfm-btn-sm" id="wfm-modal-genui-pp" title="Positive Promptにエンベッディング追加">GenUI PP</button>
                           <button class="wfm-btn wfm-btn-sm" id="wfm-modal-genui-np" title="Negative Promptにエンベッディング追加">GenUI NP</button>`
                        : (GENUI_TYPE_MAP[state.activeModelType]
                            ? `<button class="wfm-btn wfm-btn-sm" id="wfm-modal-genui-model" title="${t("modelsGenUITitle")}">${t("modelsGenUIBtn")}</button>`
                            : "")}
                    <button class="wfm-btn wfm-btn-sm wfm-btn-danger" id="wfm-modal-model-delete" style="margin-left:auto;">${t("modelsDelete")}</button>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-modal-model-close">${t("close")}</button>
                </div>
            </div>
        </div>`;

    openModal(getStem(name), html);

    // Load preview image
    const modalImg = document.querySelector(".wfm-modal-thumb-img");
    const modalPlaceholder = document.querySelector(".wfm-modal-thumb-placeholder");
    if (modalImg) loadPreviewImage(modalImg, modalPlaceholder, modelName);

    // Add favorite button in header
    const titleEl = document.getElementById("wfm-modal-title");
    if (titleEl) {
        titleEl.parentNode.querySelectorAll(".wfm-fav-btn").forEach((el) => el.remove());
        const favBtn = document.createElement("button");
        favBtn.className = isFav ? "wfm-fav-btn active" : "wfm-fav-btn";
        favBtn.style.cssText = "position:static;font-size:18px;margin-right:8px;";
        favBtn.textContent = isFav ? "★" : "☆";
        favBtn.addEventListener("click", async () => {
            const newVal = !meta.favorite;
            await saveModelMetadata(modelName, { favorite: newVal });
            meta.favorite = newVal;
            favBtn.textContent = newVal ? "★" : "☆";
            favBtn.classList.toggle("active", newVal);
            renderModelGrid();
        });
        titleEl.parentNode.insertBefore(favBtn, titleEl);
    }

    // Badge manage button → open badge edit modal
    document.getElementById("wfm-modal-badge-manage")?.addEventListener("click", () => {
        openBadgeEditModal();
    });

    // Save
    document.getElementById("wfm-modal-model-save")?.addEventListener("click", async () => {
        const tagsInput = document.getElementById("wfm-modal-model-tags");
        const memoInput = document.getElementById("wfm-modal-model-memo");
        const tags = tagsInput ? tagsInput.value.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const memo = memoInput ? memoInput.value : "";
        const badges = [...document.querySelectorAll(".wfm-badge-checkbox:checked")].map((cb) => cb.value);
        await saveModelMetadata(modelName, { tags, memo, badges });
        showToast(t("modelsSaved"), "success");
        renderTagFilter();
        renderDirFilter();
        renderModelGrid();
    });

    // GenUI Model / Embedding buttons
    document.getElementById("wfm-modal-genui-model")?.addEventListener("click", () => {
        applyToGenUI(modelName, state.activeModelType);
    });
    document.getElementById("wfm-modal-genui-pp")?.addEventListener("click", () => {
        applyEmbeddingToPrompt(modelName, "positive");
    });
    document.getElementById("wfm-modal-genui-np")?.addEventListener("click", () => {
        applyEmbeddingToPrompt(modelName, "negative");
    });

    // Close button (連続作業時にXボタンまでマウス移動しなくて済むように)
    document.getElementById("wfm-modal-model-close")?.addEventListener("click", () => {
        closeModal();
    });

    // Delete model button
    document.getElementById("wfm-modal-model-delete")?.addEventListener("click", async () => {
        const confirmMsg = t("modelBulkDeleteConfirm").replace("{count}", "1");
        if (!confirm(confirmMsg)) return;
        try {
            const res = await fetch("/api/wfm/models/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model_type: state.activeModelType, model_names: [modelName] }),
            });
            const data = await res.json();
            if (data.errors?.length > 0) {
                showToast(`${t("modelBulkDeleteError")}: ${data.errors[0].error}`, "error");
                return;
            }
            showToast(`${getStem(name)} ${t("modelBulkDeleteDone")}`, "success");
            closeModal();
            const list = state.modelsByType[state.activeModelType];
            const idx = list.indexOf(modelName);
            if (idx !== -1) list.splice(idx, 1);
            delete state.modelMetadata[modelName];
            const ds = state.disabledModels[state.activeModelType];
            if (ds) ds.delete(modelName);
            state.selectedModels.delete(modelName);
            if (state.selectedModel === modelName) {
                state.selectedModel = null;
                const titleEl2 = document.getElementById("wfm-models-panel-title");
                if (titleEl2) titleEl2.textContent = "";
            }
            renderModelGrid();
        } catch (err) {
            showToast(`${t("modelBulkDeleteError")}: ${err.message}`, "error");
        }
    });

    // Change thumbnail
    const changeBtn = document.getElementById("wfm-modal-change-thumb");
    const thumbFile = document.getElementById("wfm-modal-thumb-file");
    if (changeBtn && thumbFile) {
        changeBtn.addEventListener("click", () => { thumbFile.value = ""; thumbFile.click(); });
        thumbFile.addEventListener("change", async () => {
            const file = thumbFile.files?.[0];
            if (!file) return;
            changeBtn.disabled = true;
            changeBtn.textContent = t("uploading");
            try {
                const fd = new FormData();
                fd.append("type", state.activeModelType);
                fd.append("name", modelName);
                fd.append("file", file);
                const res = await fetch("/api/wfm/models/change-preview", { method: "POST", body: fd });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                // Reload preview in modal
                const newUrl = previewUrl(modelName) + "&t=" + Date.now();
                const mImg = document.querySelector(".wfm-modal-thumb-img");
                const mPlaceholder = document.querySelector(".wfm-modal-thumb-placeholder");
                if (mImg) { mImg.src = newUrl; mImg.style.display = ""; }
                if (mPlaceholder) mPlaceholder.style.display = "none";
                renderModelGrid();
                if (state.selectedModel === modelName) renderSideInfo(modelName);
                showToast(t("thumbnailChanged"), "success");
            } catch (err) {
                showToast(t("thumbnailError") + ": " + err.message, "error");
            } finally {
                changeBtn.disabled = false;
                changeBtn.textContent = t("changeThumbnail");
                thumbFile.value = "";
            }
        });
    }
}

// ── Side Panel ────────────────────────────────────────────

export function showSidePanel(modelName) {
    state.selectedModel = modelName;

    // Highlight selected
    document.querySelectorAll("#wfm-models-grid .wfm-card, #wfm-models-grid .wfm-models-table-row").forEach((el) => {
        el.classList.toggle("wfm-card-selected", el.dataset.modelName === modelName);
    });

    const { name } = parseModelPath(modelName);
    document.getElementById("wfm-models-panel-title").textContent = name;

    // Reset to CivitAI tab
    document.querySelectorAll(".wfm-models-side-tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector('.wfm-models-side-tab-btn[data-side-tab="civitai"]')?.classList.add("active");
    document.querySelectorAll(".wfm-models-side-content").forEach((c) => (c.style.display = "none"));
    const civitaiEl = document.getElementById("wfm-models-side-civitai");
    if (civitaiEl) civitaiEl.style.display = "block";

    const genuiNavBtn = document.getElementById("wfm-side-genui-nav-btn");
    const genuiNpBtn = document.getElementById("wfm-side-genui-np-btn");
    if (genuiNavBtn) {
        if (state.activeModelType === "embedding") {
            genuiNavBtn.textContent = "GenUI PP";
            genuiNavBtn.title = "Positive Promptにエンベッディング追加";
            genuiNavBtn.style.display = "";
            if (genuiNpBtn) {
                genuiNpBtn.textContent = "GenUI NP";
                genuiNpBtn.title = "Negative Promptにエンベッディング追加";
                genuiNpBtn.style.display = "";
            }
        } else if (GENUI_TYPE_MAP[state.activeModelType]) {
            genuiNavBtn.textContent = t("modelsGenUIBtn");
            genuiNavBtn.title = t("modelsGenUITitle");
            genuiNavBtn.style.display = "";
            if (genuiNpBtn) genuiNpBtn.style.display = "none";
        } else {
            genuiNavBtn.style.display = "none";
            if (genuiNpBtn) genuiNpBtn.style.display = "none";
        }
    }

    renderSideInfo(modelName);
    renderSideGroup(modelName);
    renderSideCivitai(modelName);
}

export function closeSidePanel() {
    state.selectedModel = null;
    const titleEl = document.getElementById("wfm-models-panel-title");
    if (titleEl) titleEl.textContent = "";
    document.querySelectorAll("#wfm-models-grid .wfm-card, #wfm-models-grid .wfm-models-table-row").forEach((el) => {
        el.classList.remove("wfm-card-selected");
    });
    const npBtn = document.getElementById("wfm-side-genui-np-btn");
    if (npBtn) npBtn.style.display = "none";
    const ppBtn = document.getElementById("wfm-side-genui-nav-btn");
    if (ppBtn) ppBtn.style.display = "none";
}

// ── Side Panel: Info Tab ──────────────────────────────────

export function renderSideInfo(modelName) {
    const el = document.getElementById("wfm-models-side-info");
    if (!el) return;

    const meta = state.modelMetadata[modelName] || {};
    const { dir, name } = parseModelPath(modelName);
    const ext = getExtension(name);
    const tagsStr = (meta.tags || []).join(", ");
    const userBadgesHtml = modelBadgesHtml(modelName, false);

    el.innerHTML = `
        <div class="wfm-side-thumb-container">
            <div class="wfm-side-thumb-img-wrap">
                <img style="display:none" />
                <span class="wfm-side-thumb-placeholder">${t("modelsNoPreview")}</span>
            </div>
            <div class="wfm-side-thumb-info">
                <div class="wfm-side-thumb-name wfm-model-name-copy" title="${t("modelsCopyName")}">${escapeHtml(name)}</div>
                <div class="wfm-side-thumb-meta">
                    <span class="wfm-badge wfm-badge-sm">${escapeHtml(ext)}</span>
                    ${dir ? `<span class="wfm-badge wfm-badge-sm wfm-badge-dir">${escapeHtml(dir)}</span>` : ""}
                    ${userBadgesHtml}
                </div>
            </div>
        </div>
        <div class="wfm-node-detail-section">
            <div class="wfm-node-detail-label">${t("modelsFilePath")}</div>
            <div class="wfm-node-detail-value">
                <span id="wfm-models-side-filepath" class="wfm-model-filepath" title="${t("modelsCopyPath")}" style="cursor:pointer;word-break:break-all;font-size:0.85em;color:#aaa;">${t("modelsLoading")}...</span>
            </div>
        </div>
        <div class="wfm-node-detail-section">
            <div class="wfm-node-detail-label">${t("modelsTags")}</div>
            <div class="wfm-node-detail-value">
                <input type="text" id="wfm-models-side-tags" class="wfm-search-input" value="${escapeHtml(tagsStr)}" placeholder="${t("modelsTagsPlaceholder")}">
            </div>
        </div>
        <div class="wfm-node-detail-section">
            <div class="wfm-node-detail-label">${t("modelsMemo")}</div>
            <div class="wfm-node-detail-value">
                <textarea id="wfm-models-side-memo" class="wfm-textarea" rows="4" placeholder="${t("modelsMemoPlaceholder")}">${escapeHtml(meta.memo || "")}</textarea>
            </div>
        </div>
        <div class="wfm-node-detail-section" style="display:flex;gap:6px;">
            <button id="wfm-models-side-save-btn" class="wfm-btn wfm-btn-sm wfm-btn-primary">${t("modelsSave")}</button>
            ${state.activeModelType === "embedding"
                ? `<button id="wfm-models-side-genui-pp-btn" class="wfm-btn wfm-btn-sm" title="Positive Promptにエンベッディング追加">GenUI PP</button>
                   <button id="wfm-models-side-genui-np-btn" class="wfm-btn wfm-btn-sm" title="Negative Promptにエンベッディング追加">GenUI NP</button>`
                : (GENUI_TYPE_MAP[state.activeModelType]
                    ? `<button id="wfm-models-side-genui-btn" class="wfm-btn wfm-btn-sm" title="${t("modelsGenUITitle")}">${t("modelsGenUIBtn")}</button>`
                    : "")}
        </div>`;

    // Load preview image
    const sideImg = el.querySelector(".wfm-side-thumb-img-wrap img");
    const sidePlaceholder = el.querySelector(".wfm-side-thumb-placeholder");
    if (sideImg) loadPreviewImage(sideImg, sidePlaceholder, modelName);

    // Copy model name on click
    el.querySelector(".wfm-model-name-copy")?.addEventListener("click", () => {
        navigator.clipboard.writeText(modelName).then(() => {
            showToast(t("modelsCopiedName"), "success");
        });
    });

    // Fetch and display file path
    fetch(`/api/wfm/models/filepath?type=${encodeURIComponent(state.activeModelType)}&name=${encodeURIComponent(modelName)}`)
        .then((r) => r.json())
        .then((data) => {
            const fpEl = document.getElementById("wfm-models-side-filepath");
            if (fpEl && data.path) {
                fpEl.textContent = data.path;
                fpEl.title = t("modelsCopyPath");
            } else if (fpEl) {
                fpEl.textContent = modelName;
            }
        })
        .catch(() => {
            const fpEl = document.getElementById("wfm-models-side-filepath");
            if (fpEl) fpEl.textContent = modelName;
        });

    // Copy file path on click
    el.querySelector("#wfm-models-side-filepath")?.addEventListener("click", () => {
        const fpEl = document.getElementById("wfm-models-side-filepath");
        if (fpEl) {
            navigator.clipboard.writeText(fpEl.textContent).then(() => {
                showToast(t("modelsCopiedPath"), "success");
            });
        }
    });

    // Save button
    el.querySelector("#wfm-models-side-save-btn")?.addEventListener("click", () => {
        const tagsInput = document.getElementById("wfm-models-side-tags");
        const memoInput = document.getElementById("wfm-models-side-memo");
        const tags = tagsInput ? tagsInput.value.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const memo = memoInput ? memoInput.value : "";
        saveModelMetadata(modelName, { tags, memo }).then(() => {
            showToast(t("modelsSaved"), "success");
            renderTagFilter();
            renderModelGrid();
        });
    });

    // GenUI Model / Embedding buttons
    el.querySelector("#wfm-models-side-genui-btn")?.addEventListener("click", () => {
        applyToGenUI(modelName, state.activeModelType);
    });
    el.querySelector("#wfm-models-side-genui-pp-btn")?.addEventListener("click", () => {
        applyEmbeddingToPrompt(modelName, "positive");
    });
    el.querySelector("#wfm-models-side-genui-np-btn")?.addEventListener("click", () => {
        applyEmbeddingToPrompt(modelName, "negative");
    });
}

// ── Side Panel: Group Tab ─────────────────────────────────

export function renderSideGroup(modelName) {
    const el = document.getElementById("wfm-models-side-group");
    if (!el) return;

    // Find groups this model belongs to
    const memberOf = [];
    for (const [gName, members] of Object.entries(state.modelGroups)) {
        if (members.includes(modelName)) memberOf.push(gName);
    }

    // All group names for the assign dropdown
    const allGroups = Object.keys(state.modelGroups).sort();
    const availableGroups = allGroups.filter((g) => !memberOf.includes(g));

    el.innerHTML = `
        <div style="padding:0 4px;">
            <div style="margin-bottom:12px;">
                <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${t("modelsCurrentGroups")}</div>
                ${memberOf.length === 0
                    ? `<p style="color:var(--wfm-text-secondary);font-size:12px;">${t("modelsNoGroup")}</p>`
                    : memberOf.map((g) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;">
                        <span style="font-size:13px;">${escapeHtml(g)}</span>
                        <button class="wfm-btn wfm-btn-sm wfm-btn-danger wfm-group-remove" data-group="${escapeHtml(g)}" title="${t("modelsRemoveFromGroup")}">&times;</button>
                      </div>`).join("")}
            </div>
            <div style="margin-bottom:12px;">
                <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${t("modelsAssignGroup")}</div>
                <div style="display:flex;gap:4px;">
                    <select id="wfm-models-group-assign" class="wfm-select" style="flex:1;font-size:12px;">
                        ${availableGroups.length === 0
                            ? `<option value="">${t("modelsNoGroupAvailable")}</option>`
                            : availableGroups.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("")}
                    </select>
                    <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-models-group-assign-btn" ${availableGroups.length === 0 ? "disabled" : ""}>${t("modelsAdd")}</button>
                </div>
            </div>
            <div>
                <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${t("modelsCreateGroup")}</div>
                <div style="display:flex;gap:4px;">
                    <input type="text" id="wfm-models-group-new" class="wfm-search-input" style="flex:1;font-size:12px;" placeholder="${t("modelsGroupName")}">
                    <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-models-group-create-btn">${t("modelsCreate")}</button>
                </div>
            </div>
            <div style="margin-top:16px;border-top:1px solid var(--wfm-border);padding-top:12px;">
                <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${t("modelsManageGroups")}</div>
                <div style="display:flex;gap:4px;margin-bottom:6px;">
                    <select id="wfm-models-group-manage-select" class="wfm-select" style="flex:1;font-size:12px;">
                        ${allGroups.length === 0
                            ? `<option value="">${t("modelsNoGroupAvailable")}</option>`
                            : allGroups.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("")}
                    </select>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-models-group-rename-btn" ${allGroups.length === 0 ? "disabled" : ""}>${t("modelsRename")}</button>
                    <button class="wfm-btn wfm-btn-sm wfm-btn-danger" id="wfm-models-group-delete-btn" ${allGroups.length === 0 ? "disabled" : ""}>${t("modelsDelete")}</button>
                </div>
                <div style="display:flex;gap:4px;">
                    <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-models-group-enable-btn" ${allGroups.length === 0 ? "disabled" : ""}>${t("modelGroupEnableAll")}</button>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-models-group-disable-btn" ${allGroups.length === 0 ? "disabled" : ""}>${t("modelGroupDisableAll")}</button>
                </div>
            </div>
        </div>
    `;

    // Remove from group
    el.querySelectorAll(".wfm-group-remove").forEach((btn) => {
        btn.addEventListener("click", () => {
            const g = btn.dataset.group;
            const members = state.modelGroups[g] || [];
            state.modelGroups[g] = members.filter((m) => m !== modelName);
            if (state.modelGroups[g].length === 0) delete state.modelGroups[g];
            saveModelGroups(state.modelGroups).then(() => {
                renderSideGroup(modelName);
                renderModelGrid();
            });
        });
    });

    // Assign to group
    document.getElementById("wfm-models-group-assign-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-models-group-assign");
        const g = sel?.value;
        if (!g) return;
        if (!state.modelGroups[g]) state.modelGroups[g] = [];
        if (!state.modelGroups[g].includes(modelName)) state.modelGroups[g].push(modelName);
        saveModelGroups(state.modelGroups).then(() => {
            renderSideGroup(modelName);
        });
    });

    // Create new group
    document.getElementById("wfm-models-group-create-btn")?.addEventListener("click", () => {
        const input = document.getElementById("wfm-models-group-new");
        const name = input?.value.trim();
        if (!name) return;
        if (state.modelGroups[name]) {
            showToast(t("modelsGroupExists"), "warning");
            return;
        }
        state.modelGroups[name] = [modelName];
        saveModelGroups(state.modelGroups).then(() => {
            renderSideGroup(modelName);
        });
    });

    // Rename group
    document.getElementById("wfm-models-group-rename-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-models-group-manage-select");
        const oldName = sel?.value;
        if (!oldName) return;
        if (RESERVED_GROUPS.includes(oldName)) {
            showToast(t("modelsGroupReserved"), "warning");
            return;
        }
        const newName = prompt(t("modelsRenamePrompt"), oldName);
        if (!newName || newName === oldName) return;
        if (state.modelGroups[newName]) {
            showToast(t("modelsGroupExists"), "warning");
            return;
        }
        state.modelGroups[newName] = state.modelGroups[oldName];
        delete state.modelGroups[oldName];
        saveModelGroups(state.modelGroups).then(() => {
            renderSideGroup(modelName);
            renderModelGrid();
        });
    });

    // Delete group
    document.getElementById("wfm-models-group-delete-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-models-group-manage-select");
        const g = sel?.value;
        if (!g) return;
        if (RESERVED_GROUPS.includes(g)) {
            showToast(t("modelsGroupReserved"), "warning");
            return;
        }
        if (!confirm(t("modelsDeleteGroupConfirm").replace("{name}", g))) return;
        delete state.modelGroups[g];
        saveModelGroups(state.modelGroups).then(() => {
            renderSideGroup(modelName);
            renderModelGrid();
        });
    });

    // Enable all models in selected group
    document.getElementById("wfm-models-group-enable-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-models-group-manage-select");
        const g = sel?.value;
        if (!g) return;
        toggleGroupEnable(g, true).then(() => renderSideGroup(modelName));
    });

    // Disable all models in selected group
    document.getElementById("wfm-models-group-disable-btn")?.addEventListener("click", () => {
        const sel = document.getElementById("wfm-models-group-manage-select");
        const g = sel?.value;
        if (!g) return;
        toggleGroupEnable(g, false).then(() => renderSideGroup(modelName));
    });
}

// ── Side Panel: CivitAI Tab ───────────────────────────────

export function renderSideCivitai(modelName) {
    const el = document.getElementById("wfm-models-side-civitai");
    if (!el) return;

    // Check if we have cached civitai data via sha256
    const meta = state.modelMetadata[modelName] || {};
    const sha256 = meta.sha256;
    const cached = sha256 && state.civitaiCache[sha256];

    if (cached) {
        renderCivitaiInfo(el, cached, modelName);
    } else if (sha256) {
        // SHA256 is known but model was not found on CivitAI
        el.innerHTML = `
            <div style="padding:0 4px;text-align:center;">
                <p style="color:var(--wfm-text-secondary);font-size:13px;margin-bottom:12px;">
                    ${t("civitaiNotFoundDesc")}
                </p>
                <button class="wfm-btn wfm-btn-sm" id="wfm-civitai-fetch-btn">
                    ${t("civitaiRefetchBtn")}
                </button>
                <div id="wfm-civitai-status" style="margin-top:8px;font-size:12px;color:var(--wfm-text-secondary);"></div>
            </div>`;
        document.getElementById("wfm-civitai-fetch-btn")?.addEventListener("click", () => {
            fetchCivitaiForModel(modelName, el);
        });
    } else {
        el.innerHTML = `
            <div style="padding:0 4px;text-align:center;">
                <p style="color:var(--wfm-text-secondary);font-size:13px;margin-bottom:12px;">
                    ${t("civitaiFetchDesc")}
                </p>
                <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-civitai-fetch-btn">
                    ${t("civitaiFetch")}
                </button>
                <div id="wfm-civitai-status" style="margin-top:8px;font-size:12px;color:var(--wfm-text-secondary);"></div>
            </div>`;
        document.getElementById("wfm-civitai-fetch-btn")?.addEventListener("click", () => {
            fetchCivitaiForModel(modelName, el);
        });
    }
}

export async function fetchCivitaiForModel(modelName, el) {
    const statusEl = document.getElementById("wfm-civitai-status");
    const fetchBtn = document.getElementById("wfm-civitai-fetch-btn");
    if (fetchBtn) fetchBtn.disabled = true;
    if (statusEl) statusEl.textContent = t("civitaiHashing");

    try {
        const res = await fetch("/api/wfm/models/civitai/fetch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: state.activeModelType, name: modelName }),
        });
        const data = await res.json();

        if (data.status === "ok" && data.civitai) {
            // Update caches
            if (data.sha256) {
                state.civitaiCache[data.sha256] = data.civitai;
                // Update metadata with sha256
                if (!state.modelMetadata[modelName]) state.modelMetadata[modelName] = {};
                state.modelMetadata[modelName].sha256 = data.sha256;
            }
            renderCivitaiInfo(el, data.civitai, modelName);
            showToast(t("civitaiFound"), "success");
            // Always refresh preview: local file if saved, otherwise civitai image as fallback
            const sidePanel = document.getElementById("wfm-models-side-panel");
            if (sidePanel) {
                const sideImg = sidePanel.querySelector(".wfm-side-thumb-img-wrap img");
                const sidePh = sidePanel.querySelector(".wfm-side-thumb-placeholder");
                if (sideImg) {
                    if (data.preview_saved) {
                        sideImg.src = previewUrl(modelName) + "&t=" + Date.now();
                    } else {
                        const civitaiImg = data.civitai.images && data.civitai.images[0];
                        if (civitaiImg) sideImg.src = civitaiImg;
                    }
                    sideImg.style.display = "";
                    if (sidePh) sidePh.style.display = "none";
                }
            }
            renderModelGrid();
        } else if (data.status === "not_found") {
            if (statusEl) statusEl.textContent = t("civitaiNotFound");
            if (fetchBtn) fetchBtn.disabled = false;
        } else {
            if (statusEl) statusEl.textContent = data.error || t("civitaiError");
            if (fetchBtn) fetchBtn.disabled = false;
        }
    } catch (err) {
        console.error("CivitAI fetch error:", err);
        if (statusEl) statusEl.textContent = t("civitaiError");
        if (fetchBtn) fetchBtn.disabled = false;
    }
}

export function renderCivitaiInfo(el, info, modelName) {
    // URL: ユーザー設定ホスト（localStorage）を使用、modelId なし時は /model-versions/ にフォールバック
    const civitaiHost = localStorage.getItem("wfm_civitai_host") || "civitai.com";
    const modelUrl = info.modelId && info.versionId
        ? `https://${civitaiHost}/models/${info.modelId}?modelVersionId=${info.versionId}`
        : info.versionId
            ? `https://${civitaiHost}/model-versions/${info.versionId}`
            : (info.modelUrl || "#");

    // Hash: BLAKE3 優先、なければ SHA256
    const fileHashes = info.fileHashes || {};
    const blake3 = fileHashes.BLAKE3 || fileHashes.Blake3 || "";
    const sha256 = fileHashes.SHA256 || (state.modelMetadata[modelName] || {}).sha256 || "";
    const hashType = blake3 ? "BLAKE3" : (sha256 ? "SHA256" : "");
    const hashFull = blake3 || sha256;

    // Detail rows
    const ROW = "display:flex;align-items:center;font-size:12px;margin-bottom:5px;";
    const LABEL = "color:var(--wfm-text-secondary);min-width:80px;flex-shrink:0;";

    const typeRow = info.type ? `
        <div style="${ROW}">
            <span style="${LABEL}">${t("civitaiType")}</span>
            <span style="font-size:10px;font-weight:700;background:var(--wfm-bg-tertiary,rgba(255,255,255,0.1));padding:2px 7px;border-radius:3px;letter-spacing:0.6px;">${escapeHtml(info.type.toUpperCase())}</span>
        </div>` : "";

    const baseModelRow = info.baseModel ? `
        <div style="${ROW}">
            <span style="${LABEL}">${t("civitaiBaseModel")}</span>
            <span>${escapeHtml(info.baseModel)}</span>
        </div>` : "";

    const hashRow = hashFull ? `
        <div style="${ROW}">
            <span style="${LABEL}">${t("civitaiHashLabel")}</span>
            <code class="wfm-hash-value" data-hash="${escapeHtml(hashFull)}"
                style="background:var(--wfm-bg-secondary);padding:2px 6px;border-radius:3px;cursor:pointer;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:calc(100% - 84px);"
                title="${t("civitaiCopyHash")}">${escapeHtml(hashType)}: ${escapeHtml(hashFull.substring(0, 16).toUpperCase())}…</code>
        </div>` : "";

    const detailSection = (typeRow || baseModelRow || hashRow)
        ? `<div style="margin-bottom:10px;">${typeRow}${baseModelRow}${hashRow}</div>` : "";

    const tagsHtml = (info.tags || []).map((tag) =>
        `<span class="wfm-badge wfm-badge-sm">${escapeHtml(tag)}</span>`
    ).join(" ");

    const trainedWordsHtml = (info.trainedWords || []).map((w) =>
        `<code style="font-size:11px;background:var(--wfm-bg-secondary);padding:1px 4px;border-radius:3px;cursor:pointer;" class="wfm-trained-word" title="${t("civitaiCopyWord")}">${escapeHtml(w)}</code>`
    ).join(" ");

    // Sample images — all go to Sample pane
    const images = info.images || [];
    const sampleImagesHtml = images.map((url) =>
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${t("civitaiOpenImage")}"><img src="${escapeHtml(url)}" style="width:100%;border-radius:4px;margin-bottom:6px;cursor:pointer;display:block;" loading="lazy" /></a>`
    ).join("");

    el.innerHTML = `
        <div style="padding:0 4px;">
            <div style="display:flex;border-bottom:1px solid var(--wfm-border);margin-bottom:10px;">
                <button class="wfm-civitai-subtab-btn" data-pane="info"
                    style="padding:4px 10px;font-size:12px;border:none;background:none;cursor:pointer;border-bottom:2px solid var(--wfm-primary);color:var(--wfm-primary);font-weight:600;margin-bottom:-1px;">
                    ${t("civitaiTabInfo")}
                </button>
                <button class="wfm-civitai-subtab-btn" data-pane="sample"
                    style="padding:4px 10px;font-size:12px;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;color:var(--wfm-text-secondary);margin-bottom:-1px;">
                    ${t("civitaiTabSample")}${images.length ? ` (${images.length})` : ""}
                </button>
            </div>

            <div id="wfm-civitai-pane-info">
                <div style="margin-bottom:10px;">
                    <div style="font-weight:700;font-size:14px;margin-bottom:2px;">
                        <a href="${escapeHtml(modelUrl)}" target="_blank" style="color:var(--wfm-primary);text-decoration:none;">${escapeHtml(info.modelName)}</a>
                    </div>
                    <div style="font-size:12px;color:var(--wfm-text-secondary);">
                        ${escapeHtml(info.versionName)}${info.creator ? ` · by ${escapeHtml(info.creator)}` : ""}
                    </div>
                </div>
                ${detailSection}
                ${tagsHtml ? `<div style="margin-bottom:8px;">${tagsHtml}</div>` : ""}
                ${trainedWordsHtml ? `<div style="margin-bottom:10px;"><div style="font-weight:600;font-size:12px;margin-bottom:4px;">${t("civitaiTriggerWords")}</div>${trainedWordsHtml}</div>` : ""}
                ${info.description ? `<div style="font-size:12px;color:var(--wfm-text-secondary);line-height:1.5;max-height:120px;overflow-y:auto;">${info.description}</div>` : ""}
                <div style="margin-top:10px;">
                    <button class="wfm-btn wfm-btn-sm" id="wfm-civitai-refresh-btn">${t("civitaiRefresh")}</button>
                </div>
            </div>

            <div id="wfm-civitai-pane-sample" style="display:none;">
                ${sampleImagesHtml || `<p style="color:var(--wfm-text-secondary);font-size:13px;text-align:center;margin-top:20px;">${t("civitaiNoImages")}</p>`}
            </div>
        </div>`;

    // Sub-tab switching
    const subtabBtns = el.querySelectorAll(".wfm-civitai-subtab-btn");
    subtabBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const pane = btn.dataset.pane;
            subtabBtns.forEach((b) => {
                const isActive = b === btn;
                b.style.borderBottom = isActive ? "2px solid var(--wfm-primary)" : "2px solid transparent";
                b.style.color = isActive ? "var(--wfm-primary)" : "var(--wfm-text-secondary)";
                b.style.fontWeight = isActive ? "600" : "400";
            });
            el.querySelector("#wfm-civitai-pane-info").style.display = pane === "info" ? "" : "none";
            el.querySelector("#wfm-civitai-pane-sample").style.display = pane === "sample" ? "" : "none";
        });
    });

    // Copy trigger word on click
    el.querySelectorAll(".wfm-trained-word").forEach((wordEl) => {
        wordEl.addEventListener("click", () => {
            navigator.clipboard.writeText(wordEl.textContent).then(() => {
                showToast(t("civitaiWordCopied"), "success");
            });
        });
    });

    // Copy hash on click
    el.querySelectorAll(".wfm-hash-value").forEach((hashEl) => {
        hashEl.addEventListener("click", () => {
            navigator.clipboard.writeText(hashEl.dataset.hash).then(() => {
                showToast(t("civitaiHashCopied"), "success");
            });
        });
    });

    // Refresh button
    document.getElementById("wfm-civitai-refresh-btn")?.addEventListener("click", () => {
        const meta = state.modelMetadata[modelName] || {};
        if (meta.sha256) delete state.civitaiCache[meta.sha256];
        delete meta.sha256;
        fetchCivitaiForModel(modelName, el);
    });
}

// ── CivitAI cache / batch fetch ───────────────────────────

export async function fetchCivitaiCache() {
    try {
        const res = await fetch("/api/wfm/models/civitai/cache");
        return res.ok ? await res.json() : {};
    } catch { return {}; }
}

export async function batchFetchCivitai() {
    const models = getCurrentModels();
    if (models.length === 0) {
        showToast(t("modelsNoModels"), "warning");
        return;
    }

    // Filter out models that already have CivitAI data
    const meta = state.modelMetadata;
    const uncached = models.filter((m) => {
        const sha = meta[m]?.sha256;
        return !sha || !state.civitaiCache[sha];
    });

    if (uncached.length === 0) {
        showToast(t("civitaiBatchAllCached"), "info");
        return;
    }

    const btn = document.getElementById("wfm-models-civitai-batch-btn");
    const progressEl = document.getElementById("wfm-models-civitai-progress");
    if (btn) btn.disabled = true;

    try {
        const res = await fetch("/api/wfm/models/civitai/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: state.activeModelType, models: uncached }),
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Parse SSE events
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            let eventType = "";
            for (const line of lines) {
                if (line.startsWith("event: ")) {
                    eventType = line.slice(7).trim();
                } else if (line.startsWith("data: ")) {
                    const data = JSON.parse(line.slice(6));
                    if (eventType === "progress") {
                        const pct = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
                        const statusText = data.status === "hashing" ? t("civitaiHashing2")
                            : data.status === "fetching" ? t("civitaiFetching")
                            : data.status === "cached" ? "✓"
                            : data.status === "found" ? "✓"
                            : data.status === "not_found" ? "—"
                            : "";
                        if (progressEl) progressEl.textContent = `${pct}% (${data.current}/${data.total}) ${statusText}`;
                    } else if (eventType === "done") {
                        if (progressEl) progressEl.textContent = "";
                        const previewNote = data.preview_saved > 0 ? ` (+${data.preview_saved} preview)` : "";
                        showToast(t("civitaiBatchDone", data.found, data.not_found) + previewNote, "success");
                        // Reload caches
                        const [newMeta, newCache] = await Promise.all([fetchModelMetadata(), fetchCivitaiCache()]);
                        // Apply sha256 hashes from batch result directly in case fetchModelMetadata
                        // returns before the server has flushed updated metadata to disk
                        if (data.hashes) {
                            for (const [modelName, sha256] of Object.entries(data.hashes)) {
                                if (!newMeta[modelName]) newMeta[modelName] = {};
                                if (!newMeta[modelName].sha256) newMeta[modelName].sha256 = sha256;
                            }
                        }
                        state.modelMetadata = newMeta;
                        state.civitaiCache = newCache;
                        renderModelGrid();
                        // Refresh side panel if open
                        if (state.selectedModel) renderSideCivitai(state.selectedModel);
                    }
                }
            }
        }
    } catch (err) {
        console.error("Batch CivitAI error:", err);
        showToast(t("civitaiError"), "error");
    } finally {
        if (btn) btn.disabled = false;
        if (progressEl) progressEl.textContent = "";
    }
}

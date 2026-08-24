/**
 * Prompt Tab - Presets (API CRUD, groups, Preset Manager panel)
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { readJsonStorage } from "./util.js";

// ============================================
// State
// ============================================

// Preset data (loaded from API, with localStorage migration)
let promptPresets = [];
let pmActiveTab = "all";       // "all" | "favorites" | "groups"
let pmSearchText = "";
let pmSelectedId = null;       // currently selected preset id
export let pmGroups = {};      // { groupName: [presetId, ...] }
const PM_GROUPS_KEY = "wfm_prompt_preset_groups";
export const PROMPT_RESERVED_GROUPS = ["Batch"];

// ============================================
// Preset API helpers
// ============================================

export async function fetchPresets() {
    try {
        const res = await fetch("/api/wfm/prompts");
        return res.ok ? await res.json() : [];
    } catch { return []; }
}

export async function apiCreatePreset(data) {
    try {
        const res = await fetch("/api/wfm/prompts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        const result = await res.json();
        return result.status === "ok" ? result.prompt : null;
    } catch { return null; }
}

export async function apiUpdatePreset(id, updates) {
    try {
        const res = await fetch("/api/wfm/prompts/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, ...updates }),
        });
        const result = await res.json();
        return result.status === "ok" ? result.prompt : null;
    } catch { return null; }
}

export async function apiDeletePreset(id) {
    try {
        await fetch("/api/wfm/prompts/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
    } catch { /* ignore */ }
}

// ============================================
// Migrate localStorage presets to API
// ============================================

const PRESETS_KEY = "wfm_prompt_presets";

async function migrateLocalStoragePresets() {
    try {
        const raw = localStorage.getItem(PRESETS_KEY);
        if (!raw) return;
        const local = JSON.parse(raw);
        if (!Array.isArray(local) || local.length === 0) return;

        // Only migrate if API has no presets yet
        const existing = await fetchPresets();
        if (existing.length > 0) {
            localStorage.removeItem(PRESETS_KEY);
            return;
        }

        for (const p of local) {
            await apiCreatePreset({
                name: p.name || "Untitled",
                text: p.posText || p.text || "",
                negText: p.negText || "",
                category: "",
                tags: [],
                favorite: false,
            });
        }
        localStorage.removeItem(PRESETS_KEY);
    } catch { /* ignore migration errors */ }
}

// ============================================
// Preset data management
// ============================================

export async function loadAllPresets() {
    await migrateLocalStoragePresets();
    promptPresets = await fetchPresets();

    // Load groups from localStorage
    pmGroups = readJsonStorage(PM_GROUPS_KEY);

    // Clean stale entries from groups (preserve reserved groups even if empty)
    const validIds = new Set(promptPresets.map(p => p.id));
    for (const g of Object.keys(pmGroups)) {
        pmGroups[g] = (pmGroups[g] || []).filter(id => validIds.has(id));
        if (pmGroups[g].length === 0 && !PROMPT_RESERVED_GROUPS.includes(g)) delete pmGroups[g];
    }
    // Ensure reserved groups always exist
    for (const g of PROMPT_RESERVED_GROUPS) {
        if (!pmGroups[g]) pmGroups[g] = [];
    }
    saveGroups();

    renderPresetSelect();
    renderGroupSelect();
    renderPresetManager();
}

export function saveGroups() {
    localStorage.setItem(PM_GROUPS_KEY, JSON.stringify(pmGroups));
    renderGroupSelect();
}

function renderGroupSelect() {
    const select = document.getElementById("wfm-preset-group-select");
    if (!select) return;
    const prevVal = select.value;
    select.innerHTML = `<option value="">Select group...</option>`;
    for (const g of Object.keys(pmGroups).sort()) {
        const opt = document.createElement("option");
        opt.value = g;
        opt.textContent = g;
        select.appendChild(opt);
    }
    if (prevVal && pmGroups[prevVal]) select.value = prevVal;
}

function renderPresetSelect() {
    const select = document.getElementById("wfm-preset-select");
    if (!select) return;
    const prevVal = select.value;
    select.innerHTML = `<option value="">${t("newPreset")}</option>`;
    promptPresets.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
    // Restore selection if still valid
    if (prevVal && promptPresets.find(p => p.id === prevVal)) {
        select.value = prevVal;
    }
}

function selectPresetInEditor(preset) {
    const presetSelect = document.getElementById("wfm-preset-select");
    const presetName = document.getElementById("wfm-preset-name");
    const presetCategory = document.getElementById("wfm-preset-category");
    const presetPos = document.getElementById("wfm-preset-pos");
    const presetNeg = document.getElementById("wfm-preset-neg");

    if (presetSelect) presetSelect.value = preset ? preset.id : "";
    if (presetName) presetName.value = preset ? preset.name : "";
    if (presetCategory) presetCategory.value = preset ? (preset.category || "") : "";
    if (presetPos) presetPos.value = preset ? (preset.text || preset.posText || "") : "";
    if (presetNeg) presetNeg.value = preset ? (preset.negText || "") : "";

    pmSelectedId = preset ? preset.id : null;
    renderPresetManager();
}

// ============================================
// Preset Manager rendering
// ============================================

export function esc(s) {
    return s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
}

export function renderPresetManager() {
    const container = document.getElementById("wfm-pm-list");
    if (!container) return;
    container.innerHTML = "";

    switch (pmActiveTab) {
        case "all": renderPmAll(container); break;
        case "favorites": renderPmFavorites(container); break;
        case "groups": renderPmGroups(container); break;
    }
}

function matchesSearch(p) {
    if (!pmSearchText) return true;
    const s = pmSearchText.toLowerCase();
    return (p.name || "").toLowerCase().includes(s) ||
           (p.text || "").toLowerCase().includes(s) ||
           (p.category || "").toLowerCase().includes(s) ||
           (p.tags || []).some(t => t.toLowerCase().includes(s));
}

// Ordered list of actual preset objects for a group (stale ids already filtered out by
// loadAllPresets, but this is defensive for callers that read pmGroups directly too).
export function getPresetsInGroup(groupName) {
    const ids = pmGroups[groupName] || [];
    return ids.map(id => promptPresets.find(p => p.id === id)).filter(Boolean);
}

export function isInBatchPreset(id) {
    return (pmGroups["Batch"] || []).includes(id);
}

export function toggleBatchPreset(id) {
    const batch = pmGroups["Batch"] || [];
    const idx = batch.indexOf(id);
    if (idx >= 0) { batch.splice(idx, 1); } else { batch.push(id); }
    pmGroups["Batch"] = batch;
    saveGroups();
}

export function clearBatchPresets() {
    pmGroups["Batch"] = [];
    saveGroups();
    renderPresetManager();
    showToast(t("promptBatchClear"), "success");
}

function createPmItem(preset) {
    const el = document.createElement("div");
    el.className = "wfm-pm-item" + (pmSelectedId === preset.id ? " active" : "");

    const previewText = (preset.text || "").length > 50
        ? preset.text.substring(0, 50) + "..."
        : (preset.text || "");

    const catBadge = preset.category
        ? `<span style="font-size:9px;color:var(--wfm-primary);margin-left:4px;">[${esc(preset.category)}]</span>`
        : "";

    const inBatch = isInBatchPreset(preset.id);

    el.innerHTML = `
        <div class="wfm-pm-item-body">
            <div class="wfm-pm-item-name">${preset.favorite ? '<span style="color:#ffd700;">&#9733;</span> ' : ""}${esc(preset.name)}${catBadge}</div>
            <div class="wfm-pm-item-sub">${esc(previewText)}</div>
        </div>
        <div class="wfm-pm-item-actions">
            <button class="wfm-pm-action-btn pm-batch-btn${inBatch ? " batch-active" : ""}" title="Batch">B</button>
            <button class="wfm-pm-action-btn pm-fav-btn${preset.favorite ? " fav-active" : ""}" title="Favorite">&#9733;</button>
            <button class="wfm-pm-action-btn pm-del-btn" title="Delete" style="color:var(--wfm-danger);">&#10005;</button>
        </div>
    `;

    // Click to select in editor
    el.addEventListener("click", (e) => {
        if (e.target.closest(".wfm-pm-item-actions")) return;
        selectPresetInEditor(preset);
    });

    // Batch toggle
    el.querySelector(".pm-batch-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleBatchPreset(preset.id);
        renderPresetManager();
    });

    // Favorite toggle
    el.querySelector(".pm-fav-btn").addEventListener("click", async (e) => {
        e.stopPropagation();
        const updated = await apiUpdatePreset(preset.id, { favorite: !preset.favorite });
        if (updated) {
            const idx = promptPresets.findIndex(p => p.id === preset.id);
            if (idx >= 0) promptPresets[idx] = updated;
            renderPresetManager();
        }
    });

    // Delete
    el.querySelector(".pm-del-btn").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${preset.name}"?`)) return;
        await apiDeletePreset(preset.id);
        promptPresets = promptPresets.filter(p => p.id !== preset.id);
        if (pmSelectedId === preset.id) {
            pmSelectedId = null;
            selectPresetInEditor(null);
        }
        renderPresetSelect();
        renderPresetManager();
        showToast(t("deleted"), "success");
    });

    return el;
}

function renderPmAll(container) {
    const items = promptPresets.filter(matchesSearch);
    if (items.length === 0) {
        container.innerHTML = `<div class="wfm-pm-empty">${promptPresets.length === 0 ? "No presets yet.<br><small>Create one in the Presets panel</small>" : "No matches"}</div>`;
        return;
    }
    for (const p of items) {
        container.appendChild(createPmItem(p));
    }
}

function renderPmFavorites(container) {
    const favs = promptPresets.filter(p => p.favorite);
    const items = favs.filter(matchesSearch);
    if (items.length === 0) {
        container.innerHTML = `<div class="wfm-pm-empty">${favs.length === 0 ? "No favorites yet.<br><small>Star presets to add them here</small>" : "No matches"}</div>`;
        return;
    }
    for (const p of items) {
        container.appendChild(createPmItem(p));
    }
}

function renderPmGroups(container) {
    const groupNames = Object.keys(pmGroups).sort();

    if (groupNames.length === 0) {
        container.innerHTML = `<div class="wfm-pm-empty">No groups yet.<br><small>Create groups from the Presets panel below</small></div>`;
        return;
    }

    for (const groupName of groupNames) {
        const ids = pmGroups[groupName] || [];
        const presets = ids.map(id => promptPresets.find(p => p.id === id)).filter(Boolean);

        const section = document.createElement("div");

        const header = document.createElement("div");
        header.className = "wfm-pm-group-header collapsed";
        header.innerHTML = `<span>${esc(groupName)}</span> <span class="wfm-pm-badge">${presets.length}</span>`;

        const list = document.createElement("div");
        list.style.display = "none";

        header.addEventListener("click", () => {
            list.style.display = list.style.display === "none" ? "block" : "none";
            header.classList.toggle("collapsed");
        });

        for (const p of presets) {
            const item = createPmItem(p);
            // Add remove-from-group button
            const removeBtn = document.createElement("button");
            removeBtn.className = "wfm-pm-action-btn";
            removeBtn.title = "Remove from group";
            removeBtn.textContent = "➖";
            removeBtn.style.fontSize = "10px";
            removeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                pmGroups[groupName] = pmGroups[groupName].filter(id => id !== p.id);
                // 予約グループ (Batch) は空になってもキーを保持する
                if (pmGroups[groupName].length === 0 && !PROMPT_RESERVED_GROUPS.includes(groupName)) delete pmGroups[groupName];
                saveGroups();
                renderPresetManager();
            });
            item.querySelector(".wfm-pm-item-actions").prepend(removeBtn);
            list.appendChild(item);
        }
        section.appendChild(header);
        section.appendChild(list);
        container.appendChild(section);
    }
}

// ============================================
// UI wiring (called from prompt-tab.js's initPromptTab)
// ============================================

export function initPresetsUI() {
    loadAllPresets();

    const presetSelect = document.getElementById("wfm-preset-select");
    const presetName = document.getElementById("wfm-preset-name");
    const presetCategory = document.getElementById("wfm-preset-category");
    const presetPos = document.getElementById("wfm-preset-pos");
    const presetNeg = document.getElementById("wfm-preset-neg");

    // Load preset on selection
    presetSelect?.addEventListener("change", () => {
        const id = presetSelect.value;
        const p = promptPresets.find(pp => pp.id === id);
        selectPresetInEditor(p || null);
    });

    // Copy positive prompt to clipboard
    document.getElementById("wfm-preset-copy-pos-btn")?.addEventListener("click", () => {
        const text = presetPos?.value || "";
        if (!text.trim()) {
            showToast(t("noTextToCopy"), "error");
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            showToast(t("copiedToClipboard"), "success");
        });
    });

    // Copy negative prompt to clipboard
    document.getElementById("wfm-preset-copy-neg-btn")?.addEventListener("click", () => {
        const text = presetNeg?.value || "";
        if (!text.trim()) {
            showToast(t("noTextToCopy"), "error");
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            showToast(t("copiedToClipboard"), "success");
        });
    });

    // Save preset (create or update via API)
    document.getElementById("wfm-preset-save-btn")?.addEventListener("click", async () => {
        const name = presetName?.value.trim();
        const category = presetCategory?.value.trim() || "";
        const pos = presetPos?.value || "";
        const neg = presetNeg?.value || "";

        if (!name) {
            showToast(t("enterPresetName"), "error");
            return;
        }
        if (!pos.trim() && !neg.trim()) {
            showToast(t("noPromptToSave"), "error");
            return;
        }

        const selectedId = presetSelect?.value;
        const existing = selectedId ? promptPresets.find(p => p.id === selectedId) : null;

        if (existing) {
            // Update
            const updated = await apiUpdatePreset(existing.id, {
                name, text: pos, negText: neg, category,
            });
            if (updated) {
                const idx = promptPresets.findIndex(p => p.id === existing.id);
                if (idx >= 0) promptPresets[idx] = updated;
                showToast(t("presetSaved"), "success");
            }
        } else {
            // Create
            const created = await apiCreatePreset({
                name, text: pos, negText: neg, category,
                tags: [], favorite: false,
            });
            if (created) {
                promptPresets.push(created);
                showToast(t("presetSaved"), "success");
            }
        }

        pmSelectedId = null;
        renderPresetSelect();
        renderPresetManager();
        if (presetSelect) presetSelect.value = "";
    });

    // Apply preset to GenerateUI
    document.getElementById("wfm-preset-apply-btn")?.addEventListener("click", () => {
        const pos = presetPos?.value || "";
        const neg = presetNeg?.value || "";
        const textareas = document.querySelectorAll("#wfm-gen-prompt-fields textarea");
        if (textareas.length === 0) {
            showToast(t("noPromptFields"), "error");
            return;
        }
        let applied = false;
        if (textareas.length > 0 && pos) {
            textareas[0].value = pos;
            textareas[0].dispatchEvent(new Event("input", { bubbles: true }));
            applied = true;
        }
        if (textareas.length > 1 && neg) {
            textareas[1].value = neg;
            textareas[1].dispatchEvent(new Event("input", { bubbles: true }));
            applied = true;
        }
        if (applied) showToast(t("appliedToGenerateUI"), "success");
    });

    // --- Group management (Presets side) ---
    document.getElementById("wfm-preset-new-group-btn")?.addEventListener("click", () => {
        const name = prompt("Group name:");
        if (!name || !name.trim()) return;
        const key = name.trim();
        if (pmGroups[key]) {
            showToast(t("groupExists"), "error");
            return;
        }
        pmGroups[key] = [];
        saveGroups();
        renderPresetManager();
        showToast(t("groupCreated", key), "success");
    });

    document.getElementById("wfm-preset-add-to-group-btn")?.addEventListener("click", () => {
        const groupSelect = document.getElementById("wfm-preset-group-select");
        const groupName = groupSelect?.value;
        if (!groupName) {
            showToast(t("selectGroupFirst"), "error");
            return;
        }
        const id = presetSelect?.value;
        if (!id) {
            showToast(t("selectPresetFirst"), "error");
            return;
        }
        if (!pmGroups[groupName]) pmGroups[groupName] = [];
        if (pmGroups[groupName].includes(id)) {
            showToast(t("alreadyInGroup"), "info");
            return;
        }
        pmGroups[groupName].push(id);
        saveGroups();
        renderPresetManager();
        showToast(t("addedToGroup"), "success");
    });

    document.getElementById("wfm-preset-del-group-btn")?.addEventListener("click", () => {
        const groupSelect = document.getElementById("wfm-preset-group-select");
        const groupName = groupSelect?.value;
        if (!groupName) {
            showToast(t("selectGroupFirst"), "error");
            return;
        }
        if (PROMPT_RESERVED_GROUPS.includes(groupName)) {
            showToast(t("modelsGroupReserved"), "warning");
            return;
        }
        if (!confirm(`Delete group "${groupName}"?`)) return;
        delete pmGroups[groupName];
        saveGroups();
        renderPresetManager();
        showToast(t("groupDeleted", groupName), "success");
    });

    // --- Preset Manager ---
    document.querySelectorAll(".wfm-pm-tab").forEach(btn => {
        btn.addEventListener("click", () => {
            pmActiveTab = btn.dataset.pmtab;
            document.querySelectorAll(".wfm-pm-tab").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            renderPresetManager();
        });
    });

    document.getElementById("wfm-pm-search-input")?.addEventListener("input", (e) => {
        pmSearchText = e.target.value.trim();
        renderPresetManager();
    });

    document.getElementById("wfm-pm-batch-clear-btn")?.addEventListener("click", () => {
        clearBatchPresets();
    });
}

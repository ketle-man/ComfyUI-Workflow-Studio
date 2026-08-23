/**
 * Prompt Tab - Table view (Presets / Presets Group / Wildcards / Style as editable tables)
 * Reuses the API helpers and Form-tab refresh functions from prompt-tab.js so both
 * views stay in sync after any create/update/delete.
 *
 * Every table shares the same left-most "#" (auto row number) column: clicking a row's
 * number toggles its selection (highlighted), and the toolbar's Delete button removes all
 * selected rows at once. There are no more per-row delete buttons — that pattern was too
 * easy to misclick.
 */

import { showToast, openModal, closeModal } from "./app.js";
import { t } from "./i18n.js";
import { setupSearchClearBtn } from "./util.js";
import { refreshStylesList } from "./generate-tab.js";
import {
    fetchPresets, apiCreatePreset, apiUpdatePreset, apiDeletePreset, loadAllPresets,
    wcFetchFiles, wcFetchContent, wcSaveFile, wcDeleteFile, wcRefreshFiles,
    styleFetchList, styleApiCreate, styleApiUpdate, styleApiDelete, styleRefreshList,
    pmGroups, saveGroups, PROMPT_RESERVED_GROUPS, renderPresetManager,
    isInBatchPreset, toggleBatchPreset, clearBatchPresets,
} from "./prompt-tab.js";
import { createWildcardToolbar } from "./prompt-wildcards.js";

function flashCell(el) {
    if (!el) return;
    el.classList.remove("wfm-prompt-edit-cell-saved");
    void el.offsetWidth; // reflow to restart animation
    el.classList.add("wfm-prompt-edit-cell-saved");
}

// Builds the left "#" cell: a clickable auto row-number for existing rows, or the
// Add/Cancel icon buttons for a pending new row. Returns { td, addBtn, cancelBtn }
// (addBtn/cancelBtn are null for existing rows). A single click toggles row selection
// (for the toolbar's bulk actions); a double click opens the full prompt-editor modal
// (onDblClick), where supported.
function buildNumCell(tr, { isNew, index, selected, onToggle, onDblClick }) {
    const td = document.createElement("td");
    if (isNew) {
        td.className = "wfm-prompt-edit-num-cell-new";
        const addBtn = document.createElement("button");
        addBtn.className = "wfm-prompt-edit-inline-add-btn";
        addBtn.title = "Add";
        addBtn.innerHTML = "&#10003;";
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "wfm-prompt-edit-inline-cancel-btn";
        cancelBtn.title = "Cancel";
        cancelBtn.innerHTML = "&#10005;";
        td.appendChild(addBtn);
        td.appendChild(cancelBtn);
        return { td, addBtn, cancelBtn };
    }
    td.className = "wfm-prompt-edit-num-cell";
    td.textContent = String(index);
    td.title = onDblClick ? "Click to select for deletion — double-click to edit the prompt" : "Click to select for deletion";
    if (selected) tr.classList.add("wfm-prompt-edit-row-selected");
    td.addEventListener("click", () => onToggle());
    if (onDblClick) td.addEventListener("dblclick", () => onDblClick());
    return { td, addBtn: null, cancelBtn: null };
}

// Shared Positive/Negative prompt-editor modal for Presets & Style (both have the two
// fields). onSave receives the (possibly edited) positive/negative text and is
// responsible for persisting them and closing the modal on success.
// wildcardToolbar: true adds the { } | __ : ; $$ [ ] <lora> n${ } 📂File input-assist toolbar
// above the textarea. Only passed for Preset prompts (openPresetPromptModal) — that's the
// only place the Form tab's Wildcard Composer feeds into via its "→ Pos / → Neg" buttons;
// Style prompts have no such wildcard connection, so they don't get the toolbar.
function openPositiveNegativeModal(title, initialPos, initialNeg, onSave, { wildcardToolbar = false } = {}) {
    const html = `
        ${wildcardToolbar ? '<div id="wfm-ptable-modal-wc-toolbar"></div>' : ""}
        <div class="wfm-prompt-modal-toggle">
            <button id="wfm-ptable-modal-pos-btn" class="wfm-btn wfm-btn-sm wfm-btn-primary">Positive</button>
            <button id="wfm-ptable-modal-neg-btn" class="wfm-btn wfm-btn-sm">Negative</button>
        </div>
        <textarea id="wfm-ptable-modal-textarea" class="wfm-textarea wfm-prompt-modal-textarea"></textarea>
        <div class="wfm-prompt-modal-actions">
            <button id="wfm-ptable-modal-save-btn" class="wfm-btn wfm-btn-primary">Save</button>
            <button id="wfm-ptable-modal-close-btn" class="wfm-btn">Close</button>
        </div>
    `;
    openModal(title, html);

    const posBtn = document.getElementById("wfm-ptable-modal-pos-btn");
    const negBtn = document.getElementById("wfm-ptable-modal-neg-btn");
    const ta = document.getElementById("wfm-ptable-modal-textarea");
    const saveBtn = document.getElementById("wfm-ptable-modal-save-btn");
    const closeBtn = document.getElementById("wfm-ptable-modal-close-btn");

    if (wildcardToolbar) {
        document.getElementById("wfm-ptable-modal-wc-toolbar")?.appendChild(createWildcardToolbar(ta));
    }

    let active = "pos";
    let posText = initialPos || "";
    let negText = initialNeg || "";
    const sync = () => { ta.value = active === "pos" ? posText : negText; };
    const capture = () => { if (active === "pos") posText = ta.value; else negText = ta.value; };

    posBtn.addEventListener("click", () => {
        capture(); active = "pos";
        posBtn.classList.add("wfm-btn-primary"); negBtn.classList.remove("wfm-btn-primary");
        sync();
    });
    negBtn.addEventListener("click", () => {
        capture(); active = "neg";
        negBtn.classList.add("wfm-btn-primary"); posBtn.classList.remove("wfm-btn-primary");
        sync();
    });
    sync();

    saveBtn.addEventListener("click", async () => {
        capture();
        await onSave(posText, negText);
    });
    closeBtn.addEventListener("click", () => closeModal());
}

// Single-field prompt-editor modal for Wildcard file content (no Positive/Negative split).
function openSingleTextModal(title, initialText, onSave) {
    const html = `
        <textarea id="wfm-ptable-modal-textarea" class="wfm-textarea wfm-prompt-modal-textarea"></textarea>
        <div class="wfm-prompt-modal-actions">
            <button id="wfm-ptable-modal-save-btn" class="wfm-btn wfm-btn-primary">Save</button>
            <button id="wfm-ptable-modal-close-btn" class="wfm-btn">Close</button>
        </div>
    `;
    openModal(title, html);
    const ta = document.getElementById("wfm-ptable-modal-textarea");
    ta.value = initialText || "";
    document.getElementById("wfm-ptable-modal-save-btn")?.addEventListener("click", () => onSave(ta.value));
    document.getElementById("wfm-ptable-modal-close-btn")?.addEventListener("click", () => closeModal());
}

// ============================================
// Presets table
// ============================================

let tablePresets = [];
let presetsSearch = "";
let pendingNewPreset = false;
const selectedPresetIds = new Set();
// Toolbar ★/B sort toggles: bring favorites and/or batch-selected presets to the top.
// Both can be active at once — ★ acts as the primary key, B as the secondary key.
let presetsSortFav = false;
let presetsSortBatch = false;

function presetMatchesSearch(p) {
    if (!presetsSearch) return true;
    const s = presetsSearch.toLowerCase();
    return (p.name || "").toLowerCase().includes(s) ||
           (p.text || "").toLowerCase().includes(s) ||
           (p.category || "").toLowerCase().includes(s);
}

// Stable sort (Array.prototype.sort is stable per spec) so presets with equal
// ★/B status keep their original relative order instead of jumping around.
function sortPresetsForDisplay(items) {
    if (!presetsSortFav && !presetsSortBatch) return items;
    return [...items].sort((a, b) => {
        if (presetsSortFav) {
            const diff = (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
            if (diff !== 0) return diff;
        }
        if (presetsSortBatch) {
            const diff = (isInBatchPreset(b.id) ? 1 : 0) - (isInBatchPreset(a.id) ? 1 : 0);
            if (diff !== 0) return diff;
        }
        return 0;
    });
}

function updatePresetsDeleteBtn() {
    const btn = document.getElementById("wfm-ptable-presets-delete-btn");
    const deselectBtn = document.getElementById("wfm-ptable-presets-deselect-btn");
    const n = selectedPresetIds.size;
    if (btn) { btn.disabled = n === 0; btn.textContent = n > 0 ? `Delete (${n})` : "Delete"; }
    if (deselectBtn) deselectBtn.disabled = n === 0;
}

// Populates the Presets toolbar's "Select group..." dropdown from the current group list
// ("Batch" is excluded — that's managed via the B column / BC button instead). Keeping this
// list short (group count, not preset count) is exactly why grouping moved here from the
// old per-group "Add Preset" picker in the Presets Group tab.
function refreshPresetsGroupSelect() {
    const select = document.getElementById("wfm-ptable-presets-group-select");
    if (!select) return;
    const prevVal = select.value;
    select.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "Select group...";
    select.appendChild(defaultOpt);
    for (const name of Object.keys(pmGroups).filter(n => !PROMPT_RESERVED_GROUPS.includes(n)).sort()) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    }
    if (prevVal && pmGroups[prevVal]) select.value = prevVal;
}

async function loadPresetsTable() {
    tablePresets = await fetchPresets();
    selectedPresetIds.clear();
    refreshPresetsGroupSelect();
    renderPresetsTable();
}

function renderPresetsTable() {
    const tbody = document.getElementById("wfm-ptable-presets-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (pendingNewPreset) tbody.appendChild(buildPresetRow(null, -1));

    const items = sortPresetsForDisplay(tablePresets.filter(presetMatchesSearch));
    items.forEach((p, i) => tbody.appendChild(buildPresetRow(p, i + 1)));

    const countEl = document.getElementById("wfm-ptable-presets-count");
    if (countEl) countEl.textContent = `${items.length} / ${tablePresets.length}`;

    if (!pendingNewPreset && items.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="7" class="wfm-prompt-edit-empty">${tablePresets.length === 0 ? "No presets yet." : "No matches."}</td>`;
        tbody.appendChild(tr);
    }
    updatePresetsDeleteBtn();
}

async function savePresetField(preset, el, field, value) {
    const current = field === "text" ? (preset.text ?? preset.posText ?? "") : (preset[field] ?? "");
    if (value === current) return;
    if (field === "name" && !value) { showToast(t("enterPresetName"), "error"); el.value = current; return; }
    const updated = await apiUpdatePreset(preset.id, { [field]: value });
    if (updated) {
        Object.assign(preset, updated);
        flashCell(el);
        loadAllPresets();
    } else {
        showToast(t("saveFailed"), "error");
        el.value = current;
    }
}

function buildPresetRow(preset, index) {
    const isNew = !preset;
    const tr = document.createElement("tr");
    if (isNew) tr.className = "wfm-prompt-edit-row-new";

    const { td: tdNum, addBtn, cancelBtn } = buildNumCell(tr, {
        isNew, index,
        selected: !isNew && selectedPresetIds.has(preset.id),
        onToggle: () => {
            if (selectedPresetIds.has(preset.id)) selectedPresetIds.delete(preset.id);
            else selectedPresetIds.add(preset.id);
            tr.classList.toggle("wfm-prompt-edit-row-selected", selectedPresetIds.has(preset.id));
            updatePresetsDeleteBtn();
        },
        onDblClick: isNew ? undefined : () => openPresetPromptModal(preset),
    });
    tr.appendChild(tdNum);

    const tdFav = document.createElement("td");
    if (!isNew) {
        const favBtn = document.createElement("button");
        favBtn.className = "wfm-prompt-edit-fav-btn" + (preset.favorite ? " active" : "");
        favBtn.title = "Favorite";
        favBtn.innerHTML = "&#9733;";
        favBtn.addEventListener("click", async () => {
            const updated = await apiUpdatePreset(preset.id, { favorite: !preset.favorite });
            if (updated) {
                Object.assign(preset, updated);
                favBtn.classList.toggle("active", !!preset.favorite);
                loadAllPresets();
                // ★ソート中は状態変化で順位が動くため、部分更新に加えて再描画で追従する
                if (presetsSortFav) renderPresetsTable();
            }
        });
        tdFav.appendChild(favBtn);
    }
    tr.appendChild(tdFav);

    const tdName = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "wfm-prompt-edit-input";
    nameInput.placeholder = "name";
    nameInput.value = preset ? preset.name : "";
    tdName.appendChild(nameInput);
    tr.appendChild(tdName);

    const tdCat = document.createElement("td");
    const catInput = document.createElement("input");
    catInput.type = "text";
    catInput.className = "wfm-prompt-edit-input";
    catInput.placeholder = "category";
    catInput.value = preset ? (preset.category || "") : "";
    tdCat.appendChild(catInput);
    tr.appendChild(tdCat);

    const tdPos = document.createElement("td");
    const posTA = document.createElement("textarea");
    posTA.className = "wfm-prompt-edit-textarea";
    posTA.rows = 2;
    posTA.placeholder = "positive prompt";
    posTA.value = preset ? (preset.text || preset.posText || "") : "";
    tdPos.appendChild(posTA);
    tr.appendChild(tdPos);

    const tdNeg = document.createElement("td");
    const negTA = document.createElement("textarea");
    negTA.className = "wfm-prompt-edit-textarea";
    negTA.rows = 2;
    negTA.placeholder = "negative prompt";
    negTA.value = preset ? (preset.negText || "") : "";
    tdNeg.appendChild(negTA);
    tr.appendChild(tdNeg);

    const tdBatch = document.createElement("td");
    if (!isNew) {
        const batchBtn = document.createElement("button");
        batchBtn.className = "wfm-prompt-edit-fav-btn wfm-prompt-edit-batch-btn" + (isInBatchPreset(preset.id) ? " active" : "");
        batchBtn.title = "Batch";
        batchBtn.textContent = "B";
        batchBtn.addEventListener("click", () => {
            toggleBatchPreset(preset.id);
            batchBtn.classList.toggle("active", isInBatchPreset(preset.id));
            // Bソート中は状態変化で順位が動くため、部分更新に加えて再描画で追従する
            if (presetsSortBatch) renderPresetsTable();
        });
        tdBatch.appendChild(batchBtn);
    }
    tr.appendChild(tdBatch);

    if (isNew) {
        addBtn.addEventListener("click", async () => {
            const name = nameInput.value.trim();
            const pos = posTA.value;
            const neg = negTA.value;
            if (!name) { showToast(t("enterPresetName"), "error"); nameInput.focus(); return; }
            if (!pos.trim() && !neg.trim()) { showToast(t("noPromptToSave"), "error"); return; }
            const created = await apiCreatePreset({ name, text: pos, negText: neg, category: catInput.value.trim(), tags: [], favorite: false });
            if (created) {
                tablePresets.push(created);
                pendingNewPreset = false;
                renderPresetsTable();
                await loadAllPresets();
                showToast(t("presetSaved"), "success");
            } else {
                showToast(t("saveFailed"), "error");
            }
        });
        cancelBtn.addEventListener("click", () => { pendingNewPreset = false; renderPresetsTable(); });
    } else {
        nameInput.addEventListener("change", () => savePresetField(preset, nameInput, "name", nameInput.value.trim()));
        catInput.addEventListener("change", () => savePresetField(preset, catInput, "category", catInput.value.trim()));
        posTA.addEventListener("change", () => savePresetField(preset, posTA, "text", posTA.value));
        negTA.addEventListener("change", () => savePresetField(preset, negTA, "negText", negTA.value));
    }

    return tr;
}

async function deleteSelectedPresets() {
    if (selectedPresetIds.size === 0) return;
    const names = tablePresets.filter(p => selectedPresetIds.has(p.id)).map(p => p.name);
    if (!confirm(`Delete ${names.length} preset(s)?\n\n${names.join(", ")}`)) return;
    for (const id of selectedPresetIds) await apiDeletePreset(id);
    tablePresets = tablePresets.filter(p => !selectedPresetIds.has(p.id));
    selectedPresetIds.clear();
    renderPresetsTable();
    await loadAllPresets();
    showToast(t("deleted"), "success");
}

function getSinglySelectedPreset() {
    if (selectedPresetIds.size !== 1) {
        showToast(t("selectPresetFirst"), "error");
        return null;
    }
    const id = [...selectedPresetIds][0];
    return tablePresets.find(p => p.id === id) || null;
}

function copySelectedPresetField(field) {
    const preset = getSinglySelectedPreset();
    if (!preset) return;
    const text = field === "text" ? (preset.text || preset.posText || "") : (preset.negText || "");
    if (!text.trim()) { showToast(t("noTextToCopy"), "error"); return; }
    navigator.clipboard.writeText(text).then(() => showToast(t("copiedToClipboard"), "success"));
}

function addSelectedPresetsToGroup() {
    const select = document.getElementById("wfm-ptable-presets-group-select");
    const groupName = select?.value;
    if (!groupName) { showToast(t("selectGroupFirst"), "error"); return; }
    if (selectedPresetIds.size === 0) { showToast(t("selectPresetFirst"), "error"); return; }
    if (!pmGroups[groupName]) pmGroups[groupName] = [];
    let added = 0;
    for (const id of selectedPresetIds) {
        if (!pmGroups[groupName].includes(id)) { pmGroups[groupName].push(id); added++; }
    }
    saveGroups();
    renderPresetManager();
    renderPresetsGroupTable();
    if (added > 0) showToast(t("addedToGroup"), "success");
    else showToast(t("alreadyInGroup"), "info");
}

function openPresetPromptModal(preset) {
    openPositiveNegativeModal(preset.name || "Preset", preset.text || preset.posText || "", preset.negText || "", async (pos, neg) => {
        const updated = await apiUpdatePreset(preset.id, { text: pos, negText: neg });
        if (updated) {
            Object.assign(preset, updated);
            loadAllPresets();
            renderPresetsTable();
            showToast(t("presetSaved"), "success");
            closeModal();
        } else {
            showToast(t("saveFailed"), "error");
        }
    }, { wildcardToolbar: true });
}

// ============================================
// Presets Group table
// ============================================

let presetsGroupSearch = "";
let pendingNewGroup = false;
const selectedGroupNames = new Set();

function groupMatchesSearch(name) {
    if (!presetsGroupSearch) return true;
    return name.toLowerCase().includes(presetsGroupSearch.toLowerCase());
}

function updatePresetsGroupDeleteBtn() {
    const btn = document.getElementById("wfm-ptable-presetsgroup-delete-btn");
    const deselectBtn = document.getElementById("wfm-ptable-presetsgroup-deselect-btn");
    const n = selectedGroupNames.size;
    if (btn) { btn.disabled = n === 0; btn.textContent = n > 0 ? `Delete (${n})` : "Delete"; }
    if (deselectBtn) deselectBtn.disabled = n === 0;
}

async function loadPresetsGroupTable() {
    if (tablePresets.length === 0) tablePresets = await fetchPresets();
    selectedGroupNames.clear();
    renderPresetsGroupTable();
}

function renderPresetsGroupTable() {
    const tbody = document.getElementById("wfm-ptable-presetsgroup-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (pendingNewGroup) tbody.appendChild(buildGroupRow(null, -1));

    // "Batch" is managed via the Presets table's own B column + BC button, not here.
    const allNames = Object.keys(pmGroups).filter(n => !PROMPT_RESERVED_GROUPS.includes(n));
    const names = allNames.filter(groupMatchesSearch).sort();
    names.forEach((name, i) => tbody.appendChild(buildGroupRow(name, i + 1)));

    const countEl = document.getElementById("wfm-ptable-presetsgroup-count");
    if (countEl) countEl.textContent = `${names.length} / ${allNames.length}`;

    if (!pendingNewGroup && names.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="3" class="wfm-prompt-edit-empty">${allNames.length === 0 ? "No groups yet." : "No matches."}</td>`;
        tbody.appendChild(tr);
    }
    updatePresetsGroupDeleteBtn();
}

function buildGroupRow(name, index) {
    const isNew = name === null;
    const tr = document.createElement("tr");
    if (isNew) tr.className = "wfm-prompt-edit-row-new";
    const isReserved = !isNew && PROMPT_RESERVED_GROUPS.includes(name);

    const { td: tdNum, addBtn, cancelBtn } = buildNumCell(tr, {
        isNew, index,
        selected: !isNew && selectedGroupNames.has(name),
        onToggle: () => {
            if (selectedGroupNames.has(name)) selectedGroupNames.delete(name);
            else selectedGroupNames.add(name);
            tr.classList.toggle("wfm-prompt-edit-row-selected", selectedGroupNames.has(name));
            updatePresetsGroupDeleteBtn();
        },
    });
    tr.appendChild(tdNum);

    const tdName = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "wfm-prompt-edit-input";
    nameInput.placeholder = "group name";
    nameInput.value = isNew ? "" : name;
    if (isReserved) { nameInput.disabled = true; nameInput.title = "Reserved group — cannot rename"; }
    tdName.appendChild(nameInput);
    tr.appendChild(tdName);

    const tdPresets = document.createElement("td");
    if (!isNew) {
        const memberIds = pmGroups[name] || [];
        if (memberIds.length === 0) {
            const empty = document.createElement("span");
            empty.className = "wfm-prompt-edit-file-badge";
            empty.textContent = "(empty)";
            tdPresets.appendChild(empty);
        }
        for (const id of memberIds) {
            const preset = tablePresets.find(p => p.id === id);
            const badge = document.createElement("span");
            badge.className = "wfm-prompt-edit-preset-badge";
            const label = document.createElement("span");
            label.textContent = preset ? preset.name : "(missing)";
            badge.appendChild(label);
            const rm = document.createElement("button");
            rm.className = "wfm-prompt-edit-badge-remove";
            rm.innerHTML = "&#10005;";
            rm.title = "Remove from group";
            rm.addEventListener("click", () => {
                pmGroups[name] = (pmGroups[name] || []).filter(pid => pid !== id);
                saveGroups();
                renderPresetsGroupTable();
                renderPresetManager();
            });
            badge.appendChild(rm);
            tdPresets.appendChild(badge);
        }
    }
    tr.appendChild(tdPresets);

    if (isNew) {
        addBtn.addEventListener("click", () => {
            const newName = nameInput.value.trim();
            if (!newName) { showToast("Enter a group name", "error"); nameInput.focus(); return; }
            if (pmGroups[newName]) { showToast(t("groupExists"), "error"); return; }
            pmGroups[newName] = [];
            saveGroups();
            pendingNewGroup = false;
            renderPresetsGroupTable();
            renderPresetManager();
            refreshPresetsGroupSelect();
            showToast(t("groupCreated", newName), "success");
        });
        cancelBtn.addEventListener("click", () => { pendingNewGroup = false; renderPresetsGroupTable(); });
    } else if (!isReserved) {
        nameInput.addEventListener("change", () => {
            const newName = nameInput.value.trim();
            if (!newName) { showToast("Enter a group name", "error"); nameInput.value = name; return; }
            if (newName === name) return;
            if (pmGroups[newName]) { showToast(t("groupExists"), "error"); nameInput.value = name; return; }
            pmGroups[newName] = pmGroups[name];
            delete pmGroups[name];
            saveGroups();
            renderPresetsGroupTable();
            renderPresetManager();
            refreshPresetsGroupSelect();
        });
    }

    return tr;
}

function deleteSelectedGroups() {
    if (selectedGroupNames.size === 0) return;
    const blocked = [...selectedGroupNames].filter(n => PROMPT_RESERVED_GROUPS.includes(n));
    const toDelete = [...selectedGroupNames].filter(n => !PROMPT_RESERVED_GROUPS.includes(n));
    if (toDelete.length === 0) { showToast(t("modelsGroupReserved"), "warning"); return; }
    if (!confirm(`Delete ${toDelete.length} group(s)?\n\n${toDelete.join(", ")}`)) return;
    for (const n of toDelete) delete pmGroups[n];
    saveGroups();
    selectedGroupNames.clear();
    renderPresetsGroupTable();
    renderPresetManager();
    refreshPresetsGroupSelect();
    if (blocked.length > 0) showToast(t("modelsGroupReserved"), "warning");
    showToast(t("groupDeleted", toDelete.join(", ")), "success");
}

// ============================================
// Wildcards table
// ============================================

let tableWildcards = []; // [{ name, ext, dir, wc_name, filename, content }]
let wildcardsSearch = "";
let pendingNewWildcard = false;
const selectedWildcardFilenames = new Set();

function wcMatchesSearch(f) {
    if (!wildcardsSearch) return true;
    const s = wildcardsSearch.toLowerCase();
    return f.filename.toLowerCase().includes(s) || (f.content || "").toLowerCase().includes(s);
}

function validateWcPath(raw) {
    const name = (raw || "").trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
    if (!name) return null;
    const parts = name.split("/");
    if (parts.some(p => !p || !/^[\w\-. ]+$/.test(p))) return null;
    return name;
}

function updateWildcardsDeleteBtn() {
    const btn = document.getElementById("wfm-ptable-wildcards-delete-btn");
    const deselectBtn = document.getElementById("wfm-ptable-wildcards-deselect-btn");
    const n = selectedWildcardFilenames.size;
    if (btn) { btn.disabled = n === 0; btn.textContent = n > 0 ? `Delete (${n})` : "Delete"; }
    if (deselectBtn) deselectBtn.disabled = n === 0;
}

async function loadWildcardsTable() {
    const files = await wcFetchFiles();
    tableWildcards = await Promise.all(files.map(async f => ({ ...f, content: (await wcFetchContent(f.filename)) ?? "" })));
    selectedWildcardFilenames.clear();
    renderWildcardsTable();
}

function renderWildcardsTable() {
    const tbody = document.getElementById("wfm-ptable-wildcards-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (pendingNewWildcard) tbody.appendChild(buildWildcardRow(null, -1));

    const items = tableWildcards.filter(wcMatchesSearch);
    items.forEach((f, i) => tbody.appendChild(buildWildcardRow(f, i + 1)));

    const countEl = document.getElementById("wfm-ptable-wildcards-count");
    if (countEl) countEl.textContent = `${items.length} / ${tableWildcards.length}`;

    if (!pendingNewWildcard && items.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="4" class="wfm-prompt-edit-empty">${tableWildcards.length === 0 ? "No wildcard files yet." : "No matches."}</td>`;
        tbody.appendChild(tr);
    }
    updateWildcardsDeleteBtn();
}

function buildWildcardRow(file, index) {
    const isNew = !file;
    const tr = document.createElement("tr");
    if (isNew) tr.className = "wfm-prompt-edit-row-new";

    const { td: tdNum, addBtn, cancelBtn } = buildNumCell(tr, {
        isNew, index,
        selected: !isNew && selectedWildcardFilenames.has(file.filename),
        onToggle: () => {
            if (selectedWildcardFilenames.has(file.filename)) selectedWildcardFilenames.delete(file.filename);
            else selectedWildcardFilenames.add(file.filename);
            tr.classList.toggle("wfm-prompt-edit-row-selected", selectedWildcardFilenames.has(file.filename));
            updateWildcardsDeleteBtn();
        },
        onDblClick: isNew ? undefined : () => openWildcardPromptModal(file),
    });
    tr.appendChild(tdNum);

    const tdPath = document.createElement("td");
    const pathInput = document.createElement("input");
    pathInput.type = "text";
    pathInput.className = "wfm-prompt-edit-input";
    pathInput.placeholder = "folder/name";
    pathInput.value = file ? file.wc_name : "";
    tdPath.appendChild(pathInput);
    tr.appendChild(tdPath);

    const tdExt = document.createElement("td");
    const extSelect = document.createElement("select");
    extSelect.className = "wfm-prompt-edit-input";
    extSelect.innerHTML = `<option value="txt">txt</option><option value="yaml">yaml</option>`;
    extSelect.value = file ? file.ext : "txt";
    tdExt.appendChild(extSelect);
    tr.appendChild(tdExt);

    const tdContent = document.createElement("td");
    const contentTA = document.createElement("textarea");
    contentTA.className = "wfm-prompt-edit-textarea";
    contentTA.rows = 3;
    contentTA.placeholder = "one item per line (txt) or YAML format";
    contentTA.value = file ? file.content : "";
    tdContent.appendChild(contentTA);
    tr.appendChild(tdContent);

    if (isNew) {
        addBtn.addEventListener("click", async () => {
            const path = validateWcPath(pathInput.value);
            if (!path) { showToast(t("invalidPathFormat"), "error"); pathInput.focus(); return; }
            const filename = `${path}.${extSelect.value}`;
            const saved = await wcSaveFile(filename, contentTA.value);
            if (saved) {
                pendingNewWildcard = false;
                await loadWildcardsTable();
                await wcRefreshFiles();
                showToast(t("savedAs", filename), "success");
            } else {
                showToast(t("saveFailed"), "error");
            }
        });
        cancelBtn.addEventListener("click", () => { pendingNewWildcard = false; renderWildcardsTable(); });
    } else {
        // Path/ext edits rename the file: save under the new filename, then drop the old one.
        const renameHandler = async () => {
            const path = validateWcPath(pathInput.value);
            if (!path) { showToast(t("invalidPathFormat"), "error"); pathInput.value = file.wc_name; return; }
            const newFilename = `${path}.${extSelect.value}`;
            if (newFilename === file.filename) return;
            const saved = await wcSaveFile(newFilename, contentTA.value);
            if (!saved) { showToast(t("saveFailed"), "error"); pathInput.value = file.wc_name; extSelect.value = file.ext; return; }
            await wcDeleteFile(file.filename);
            selectedWildcardFilenames.delete(file.filename);
            Object.assign(file, saved);
            flashCell(pathInput);
            showToast(t("savedAs", newFilename), "success");
            wcRefreshFiles();
        };
        pathInput.addEventListener("change", renameHandler);
        extSelect.addEventListener("change", renameHandler);

        contentTA.addEventListener("change", async () => {
            if (contentTA.value === file.content) return;
            const saved = await wcSaveFile(file.filename, contentTA.value);
            if (saved) {
                file.content = contentTA.value;
                flashCell(contentTA);
            } else {
                showToast(t("saveFailed"), "error");
                contentTA.value = file.content;
            }
        });
    }

    return tr;
}

async function deleteSelectedWildcards() {
    if (selectedWildcardFilenames.size === 0) return;
    const names = [...selectedWildcardFilenames];
    if (!confirm(`Delete ${names.length} wildcard file(s)?\n\n${names.join(", ")}`)) return;
    for (const filename of names) await wcDeleteFile(filename);
    tableWildcards = tableWildcards.filter(f => !selectedWildcardFilenames.has(f.filename));
    selectedWildcardFilenames.clear();
    renderWildcardsTable();
    await wcRefreshFiles();
    showToast(t("deleted"), "success");
}

function openWildcardPromptModal(file) {
    openSingleTextModal(file.filename || "Wildcard", file.content || "", async (text) => {
        const saved = await wcSaveFile(file.filename, text);
        if (saved) {
            file.content = text;
            renderWildcardsTable();
            showToast(t("savedAs", file.filename), "success");
            closeModal();
        } else {
            showToast(t("saveFailed"), "error");
        }
    });
}

// ============================================
// Style table
// ============================================

let tableStyles = [];
let stylesSearch = "";
let pendingNewStyle = false;
const selectedStyleNames = new Set();

function styleMatchesSearch(s) {
    if (!stylesSearch) return true;
    const q = stylesSearch.toLowerCase();
    return s.name.toLowerCase().includes(q) ||
           (s.prompt || "").toLowerCase().includes(q) ||
           (s.negative_prompt || "").toLowerCase().includes(q);
}

function updateStylesDeleteBtn() {
    const btn = document.getElementById("wfm-ptable-style-delete-btn");
    const deselectBtn = document.getElementById("wfm-ptable-style-deselect-btn");
    const n = selectedStyleNames.size;
    if (btn) { btn.disabled = n === 0; btn.textContent = n > 0 ? `Delete (${n})` : "Delete"; }
    if (deselectBtn) deselectBtn.disabled = n === 0;
}

async function loadStylesTable() {
    tableStyles = await styleFetchList();
    selectedStyleNames.clear();
    renderStylesTable();
}

function renderStylesTable() {
    const tbody = document.getElementById("wfm-ptable-style-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (pendingNewStyle) tbody.appendChild(buildStyleRow(null, -1));

    const items = tableStyles.filter(styleMatchesSearch);
    items.forEach((s, i) => tbody.appendChild(buildStyleRow(s, i + 1)));

    const countEl = document.getElementById("wfm-ptable-style-count");
    if (countEl) countEl.textContent = `${items.length} / ${tableStyles.length}`;

    if (!pendingNewStyle && items.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="5" class="wfm-prompt-edit-empty">${tableStyles.length === 0 ? "No styles yet." : "No matches."}</td>`;
        tbody.appendChild(tr);
    }
    updateStylesDeleteBtn();
}

function buildStyleRow(style, index) {
    const isNew = !style;
    const tr = document.createElement("tr");
    if (isNew) tr.className = "wfm-prompt-edit-row-new";

    const { td: tdNum, addBtn, cancelBtn } = buildNumCell(tr, {
        isNew, index,
        selected: !isNew && selectedStyleNames.has(style.name),
        onToggle: () => {
            if (selectedStyleNames.has(style.name)) selectedStyleNames.delete(style.name);
            else selectedStyleNames.add(style.name);
            tr.classList.toggle("wfm-prompt-edit-row-selected", selectedStyleNames.has(style.name));
            updateStylesDeleteBtn();
        },
        onDblClick: isNew ? undefined : () => openStylePromptModal(style),
    });
    tr.appendChild(tdNum);

    const tdName = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "wfm-prompt-edit-input";
    nameInput.placeholder = "style name";
    nameInput.value = style ? style.name : "";
    tdName.appendChild(nameInput);
    tr.appendChild(tdName);

    const tdFile = document.createElement("td");
    if (style?.file) {
        const badge = document.createElement("span");
        badge.className = "wfm-prompt-edit-file-badge";
        badge.title = style.file;
        badge.textContent = style.file;
        tdFile.appendChild(badge);
    }
    tr.appendChild(tdFile);

    const tdPos = document.createElement("td");
    const posTA = document.createElement("textarea");
    posTA.className = "wfm-prompt-edit-textarea";
    posTA.rows = 2;
    posTA.placeholder = "e.g. cinematic still, {prompt}, dramatic lighting";
    posTA.value = style ? (style.prompt || "") : "";
    tdPos.appendChild(posTA);
    tr.appendChild(tdPos);

    const tdNeg = document.createElement("td");
    const negTA = document.createElement("textarea");
    negTA.className = "wfm-prompt-edit-textarea";
    negTA.rows = 2;
    negTA.placeholder = "e.g. blurry, low quality";
    negTA.value = style ? (style.negative_prompt || "") : "";
    tdNeg.appendChild(negTA);
    tr.appendChild(tdNeg);

    if (isNew) {
        addBtn.addEventListener("click", async () => {
            const name = nameInput.value.trim();
            if (!name) { showToast(t("pleaseEnterStyleName"), "error"); nameInput.focus(); return; }
            const result = await styleApiCreate(name, posTA.value, negTA.value, null);
            if (result.ok) {
                pendingNewStyle = false;
                await loadStylesTable();
                await styleRefreshList();
                await refreshStylesList();
                showToast(t("savedAs", name), "success");
            } else {
                showToast(t("errorWithMsg", result.error), "error");
            }
        });
        cancelBtn.addEventListener("click", () => { pendingNewStyle = false; renderStylesTable(); });
    } else {
        const saveStyleRow = async (changedEl) => {
            const nameNow = nameInput.value.trim();
            const posNow = posTA.value;
            const negNow = negTA.value;
            if (!nameNow) { showToast(t("pleaseEnterStyleName"), "error"); nameInput.value = style.name; return; }
            if (nameNow === style.name && posNow === (style.prompt || "") && negNow === (style.negative_prompt || "")) return;
            const result = await styleApiUpdate(style.name, nameNow, posNow, negNow);
            if (result.ok) {
                selectedStyleNames.delete(style.name);
                style.name = nameNow;
                style.prompt = posNow;
                style.negative_prompt = negNow;
                flashCell(changedEl);
                await styleRefreshList();
                await refreshStylesList();
            } else {
                showToast(t("errorWithMsg", result.error), "error");
                nameInput.value = style.name;
                posTA.value = style.prompt || "";
                negTA.value = style.negative_prompt || "";
            }
        };
        nameInput.addEventListener("change", () => saveStyleRow(nameInput));
        posTA.addEventListener("change", () => saveStyleRow(posTA));
        negTA.addEventListener("change", () => saveStyleRow(negTA));
    }

    return tr;
}

async function deleteSelectedStyles() {
    if (selectedStyleNames.size === 0) return;
    const names = [...selectedStyleNames];
    if (!confirm(`Delete ${names.length} style(s)?\n\n${names.join(", ")}`)) return;
    const failed = [];
    for (const name of names) {
        const result = await styleApiDelete(name);
        if (!result.ok) failed.push(name);
    }
    tableStyles = tableStyles.filter(s => !selectedStyleNames.has(s.name) || failed.includes(s.name));
    selectedStyleNames.clear();
    renderStylesTable();
    await styleRefreshList();
    await refreshStylesList();
    if (failed.length > 0) showToast(t("errorWithMsg", `Failed: ${failed.join(", ")}`), "error");
    else showToast(t("deleted"), "success");
}

function openStylePromptModal(style) {
    openPositiveNegativeModal(style.name || "Style", style.prompt || "", style.negative_prompt || "", async (pos, neg) => {
        const result = await styleApiUpdate(style.name, style.name, pos, neg);
        if (result.ok) {
            style.prompt = pos;
            style.negative_prompt = neg;
            await styleRefreshList();
            await refreshStylesList();
            renderStylesTable();
            showToast(t("savedAs", style.name), "success");
            closeModal();
        } else {
            showToast(t("errorWithMsg", result.error), "error");
        }
    });
}

// ============================================
// Tab switching + init
// ============================================

let _presetsLoaded = false;
let _presetsGroupLoaded = false;
let _wildcardsLoaded = false;
let _stylesLoaded = false;

function switchPromptToplevel(target) {
    document.querySelectorAll(".wfm-prompt-toplevel-tab").forEach(b => b.classList.toggle("active", b.dataset.promptToplevel === target));
    document.getElementById("wfm-prompt-panel-form")?.classList.toggle("active", target === "form");
    document.getElementById("wfm-prompt-panel-table")?.classList.toggle("active", target === "table");
    if (target === "table" && !_presetsLoaded) {
        _presetsLoaded = true;
        loadPresetsTable();
    }
}

function switchPromptTableSubtab(target) {
    document.querySelectorAll(".wfm-prompt-table-subtab").forEach(b => b.classList.toggle("active", b.dataset.ptableSubtab === target));
    document.getElementById("wfm-ptable-presets")?.classList.toggle("active", target === "presets");
    document.getElementById("wfm-ptable-presetsGroup")?.classList.toggle("active", target === "presetsGroup");
    document.getElementById("wfm-ptable-wildcards")?.classList.toggle("active", target === "wildcards");
    document.getElementById("wfm-ptable-style")?.classList.toggle("active", target === "style");
    if (target === "presetsGroup" && !_presetsGroupLoaded) { _presetsGroupLoaded = true; loadPresetsGroupTable(); }
    if (target === "wildcards" && !_wildcardsLoaded) { _wildcardsLoaded = true; loadWildcardsTable(); }
    if (target === "style" && !_stylesLoaded) { _stylesLoaded = true; loadStylesTable(); }
}

export function initPromptTableTab() {
    document.querySelectorAll(".wfm-prompt-toplevel-tab").forEach(btn => {
        btn.addEventListener("click", () => switchPromptToplevel(btn.dataset.promptToplevel));
    });

    document.querySelectorAll(".wfm-prompt-table-subtab").forEach(btn => {
        btn.addEventListener("click", () => switchPromptTableSubtab(btn.dataset.ptableSubtab));
    });

    // Presets
    document.getElementById("wfm-ptable-presets-add-btn")?.addEventListener("click", () => {
        if (pendingNewPreset) return;
        pendingNewPreset = true;
        renderPresetsTable();
        document.querySelector("#wfm-ptable-presets-tbody input")?.focus();
    });
    document.getElementById("wfm-ptable-presets-delete-btn")?.addEventListener("click", deleteSelectedPresets);
    document.getElementById("wfm-ptable-presets-deselect-btn")?.addEventListener("click", () => {
        selectedPresetIds.clear();
        renderPresetsTable();
    });
    document.getElementById("wfm-ptable-presets-batch-clear-btn")?.addEventListener("click", () => {
        clearBatchPresets();
        renderPresetsTable();
    });
    document.getElementById("wfm-ptable-presets-copy-pos-btn")?.addEventListener("click", () => copySelectedPresetField("text"));
    document.getElementById("wfm-ptable-presets-copy-neg-btn")?.addEventListener("click", () => copySelectedPresetField("negText"));
    document.getElementById("wfm-ptable-presets-add-to-group-btn")?.addEventListener("click", addSelectedPresetsToGroup);
    setupSearchClearBtn("wfm-ptable-presets-search", "wfm-ptable-presets-search-clear-btn", () => {
        presetsSearch = "";
        renderPresetsTable();
    });
    document.getElementById("wfm-ptable-presets-search")?.addEventListener("input", (e) => {
        presetsSearch = e.target.value.trim();
        renderPresetsTable();
    });
    document.getElementById("wfm-ptable-presets-sort-fav-btn")?.addEventListener("click", (e) => {
        presetsSortFav = !presetsSortFav;
        e.currentTarget.classList.toggle("wfm-btn-primary", presetsSortFav);
        renderPresetsTable();
    });
    document.getElementById("wfm-ptable-presets-sort-batch-btn")?.addEventListener("click", (e) => {
        presetsSortBatch = !presetsSortBatch;
        e.currentTarget.classList.toggle("wfm-btn-primary", presetsSortBatch);
        renderPresetsTable();
    });

    // Presets Group
    document.getElementById("wfm-ptable-presetsgroup-add-btn")?.addEventListener("click", () => {
        if (pendingNewGroup) return;
        pendingNewGroup = true;
        renderPresetsGroupTable();
        document.querySelector("#wfm-ptable-presetsgroup-tbody input")?.focus();
    });
    document.getElementById("wfm-ptable-presetsgroup-delete-btn")?.addEventListener("click", deleteSelectedGroups);
    document.getElementById("wfm-ptable-presetsgroup-deselect-btn")?.addEventListener("click", () => {
        selectedGroupNames.clear();
        renderPresetsGroupTable();
    });
    setupSearchClearBtn("wfm-ptable-presetsgroup-search", "wfm-ptable-presetsgroup-search-clear-btn", () => {
        presetsGroupSearch = "";
        renderPresetsGroupTable();
    });
    document.getElementById("wfm-ptable-presetsgroup-search")?.addEventListener("input", (e) => {
        presetsGroupSearch = e.target.value.trim();
        renderPresetsGroupTable();
    });

    // Wildcards
    document.getElementById("wfm-ptable-wildcards-add-btn")?.addEventListener("click", () => {
        if (pendingNewWildcard) return;
        pendingNewWildcard = true;
        renderWildcardsTable();
        document.querySelector("#wfm-ptable-wildcards-tbody input")?.focus();
    });
    document.getElementById("wfm-ptable-wildcards-delete-btn")?.addEventListener("click", deleteSelectedWildcards);
    document.getElementById("wfm-ptable-wildcards-deselect-btn")?.addEventListener("click", () => {
        selectedWildcardFilenames.clear();
        renderWildcardsTable();
    });
    setupSearchClearBtn("wfm-ptable-wildcards-search", "wfm-ptable-wildcards-search-clear-btn", () => {
        wildcardsSearch = "";
        renderWildcardsTable();
    });
    document.getElementById("wfm-ptable-wildcards-search")?.addEventListener("input", (e) => {
        wildcardsSearch = e.target.value.trim();
        renderWildcardsTable();
    });

    // Style
    document.getElementById("wfm-ptable-style-add-btn")?.addEventListener("click", () => {
        if (pendingNewStyle) return;
        pendingNewStyle = true;
        renderStylesTable();
        document.querySelector("#wfm-ptable-style-tbody input")?.focus();
    });
    document.getElementById("wfm-ptable-style-delete-btn")?.addEventListener("click", deleteSelectedStyles);
    document.getElementById("wfm-ptable-style-deselect-btn")?.addEventListener("click", () => {
        selectedStyleNames.clear();
        renderStylesTable();
    });
    setupSearchClearBtn("wfm-ptable-style-search", "wfm-ptable-style-search-clear-btn", () => {
        stylesSearch = "";
        renderStylesTable();
    });
    document.getElementById("wfm-ptable-style-search")?.addEventListener("input", (e) => {
        stylesSearch = e.target.value.trim();
        renderStylesTable();
    });
}

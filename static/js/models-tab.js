/**
 * Models Tab - Model browser and metadata management
 * Supports: Thumbnail / Card / Table views, side panel (Info / Group / CivitAI), detail modal with badges
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { comfyUI } from "./comfyui-client.js";
import { comfyEditor } from "./comfyui-editor.js";
import { setupSearchClearBtn } from "./util.js";
import { state, BATCH_MODEL_TYPES, STACK_MODEL_TYPES, FETCH_MAP, TYPE_LABELS, GENUI_TYPE_MAP } from "./models/state.js";
import { openBadgeEditModal, renderBadgeFilter, setGridChangeCallback } from "./models/badges.js";
import { isModelDisabled, renderTagFilter, renderGroupFilter, renderDirFilter } from "./models/filters.js";
import { renderModelGrid, clearBatchGroup, clearStackGroup } from "./models/grid-view.js";
import { toggleSelectMode, renderBulkActionBar, fetchSubdirs } from "./models/selection-bulk.js";
import { closeSidePanel, renderSideCivitai, renderSideInfo, batchFetchCivitai, fetchCivitaiCache } from "./models/detail-panel.js";

export { openBadgeEditModal };

export function applyToGenUI(modelName, modelType) {
    const mapping = GENUI_TYPE_MAP[modelType];
    if (!mapping) {
        showToast(t("modelsGenUIUnsupported"), "warning");
        return;
    }
    if (!comfyUI.currentWorkflow) {
        showToast(t("modelsGenUINoWorkflow"), "warning");
        return;
    }

    let selectEl = null;

    if (modelType === "lora") {
        // Use lora_nodes from analysis to correctly handle Lora Loader (LoraManager)
        const loraNodes = comfyUI.currentAnalysis?.lora_nodes || [];
        let nodeId = null;
        let isLoraManager = false;

        if (loraNodes.length > 0) {
            const targetNode = loraNodes[0];
            nodeId = targetNode.id;
            isLoraManager = !!targetNode.is_lora_manager;
        } else {
            // Fallback: find a standard LoraLoader node by lora_name input
            nodeId = Object.keys(comfyUI.currentWorkflow).find((id) => {
                const node = comfyUI.currentWorkflow[id];
                return node.inputs && "lora_name" in node.inputs;
            });
        }

        if (!nodeId || !comfyUI.currentWorkflow[nodeId]) {
            showToast(t("modelsGenUINoNode", TYPE_LABELS[modelType] || modelType), "warning");
            return;
        }

        const stem = modelName.replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");

        if (isLoraManager) {
            comfyUI.currentWorkflow[nodeId].inputs.loras = {
                __value__: [{ name: stem, strength: 1.0, active: true, expanded: false, clipStrength: 1.0, locked: false }],
            };
            comfyUI.currentWorkflow[nodeId].inputs.text = `<lora:${stem}:1:1>`;
        } else {
            comfyUI.currentWorkflow[nodeId].inputs.lora_name = comfyEditor.resolveLoraName(modelName);
        }

        // Disable all Stack models and switch to Single tab
        comfyEditor.disableAllStack("wfm-gen-lora-fields");
        comfyEditor.switchLoraSingleTab();

        // Update Single tab LORA SYNTAX and TRIGGER WORDS displays
        const loraSyntax = `<lora:${stem}:1:1>`;
        const sha = (state.modelMetadata[modelName] || {}).sha256;
        const civInfo = sha && state.civitaiCache[sha];
        const triggerWords = civInfo?.trainedWords || [];

        const singleSyntaxEl = document.getElementById("wfm-lora-single-syntax");
        if (singleSyntaxEl) singleSyntaxEl.textContent = loraSyntax;

        const singleTriggersEl = document.getElementById("wfm-lora-single-triggers");
        if (singleTriggersEl) {
            singleTriggersEl.innerHTML = triggerWords.length
                ? triggerWords.map(w => `<span class="wfm-lora-trigger-word">${w}</span>`).join(" ")
                : `<span style="color:var(--wfm-text-secondary);font-size:12px;">—</span>`;
        }

        selectEl = document.getElementById("wfm-lora-select");
    } else {
        const { key, inputKey } = mapping;

        // unet タイプは LoaderGGUF (gguf_name)、textencoder タイプは CLIPLoader (clip_name) も対応
        const searchKeys = modelType === "unet" ? [inputKey, "gguf_name"]
                         : modelType === "textencoder" ? [inputKey, "clip_name"]
                         : [inputKey];
        let nodeId = null;
        let actualInputKey = inputKey;
        for (const ik of searchKeys) {
            nodeId = Object.keys(comfyUI.currentWorkflow).find((id) => {
                const node = comfyUI.currentWorkflow[id];
                return node.inputs && ik in node.inputs;
            });
            if (nodeId) { actualInputKey = ik; break; }
        }

        if (!nodeId) {
            showToast(t("modelsGenUINoNode", TYPE_LABELS[modelType] || modelType), "warning");
            return;
        }

        comfyUI.currentWorkflow[nodeId].inputs[actualInputKey] = modelName;
        selectEl = document.getElementById(`wfm-model-${key}`);
    }

    if (selectEl) {
        if (![...selectEl.options].some(o => o.value === modelName)) {
            const opt = document.createElement("option");
            opt.value = modelName;
            opt.textContent = modelName;
            selectEl.appendChild(opt);
        }
        selectEl.value = modelName;
    }

    const rawTextarea = document.getElementById("wfm-gen-raw-json");
    if (rawTextarea) {
        rawTextarea.value = JSON.stringify(comfyUI.currentWorkflow, null, 2);
    }

    showToast(`${TYPE_LABELS[modelType]}: ${modelName.split("/").pop().split("\\").pop()}`, "success");
}

export function applyEmbeddingToPrompt(modelName, promptType) {
    if (!comfyUI.currentWorkflow) {
        showToast(t("modelsGenUINoWorkflow"), "warning");
        return;
    }
    const stem = modelName.replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");
    const syntax = `(embedding:${stem}:1.0)`;
    comfyEditor.appendEmbeddingToPrompt(syntax, promptType);
    showToast(`Embedding → ${promptType === "positive" ? "PP" : "NP"}: ${stem}`, "success");
}

// ── API ───────────────────────────────────────────────────


// ── Enable / Disable helpers ──────────────────────────────

async function fetchDisabledModels(type) {
    try {
        const res = await fetch(`/api/wfm/models/disabled?type=${encodeURIComponent(type)}`);
        return res.ok ? await res.json() : [];
    } catch { return []; }
}

export async function toggleModelEnable(modelName) {
    const nowDisabled = isModelDisabled(modelName);
    const newEnabled = nowDisabled;
    try {
        const res = await fetch("/api/wfm/models/toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model_type: state.activeModelType,
                model_name: modelName,
                enabled: newEnabled,
            }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "toggle failed");
        }
        const s = state.disabledModels[state.activeModelType] || new Set();
        if (newEnabled) s.delete(modelName);
        else s.add(modelName);
        state.disabledModels[state.activeModelType] = s;
        showToast(t("modelStatusWarning"), "info");
        renderModelGrid();
        if (state.selectedModel === modelName) renderSideInfo(modelName);
    } catch (err) {
        showToast(t("modelToggleError") + ": " + err.message, "error");
    }
}

export async function toggleGroupEnable(groupName, enable) {
    try {
        const res = await fetch("/api/wfm/models/group-toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model_type: state.activeModelType,
                group_name: groupName,
                enabled: enable,
            }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "group toggle failed");
        }
        const data = await res.json();
        const okSet = new Set(data.ok || []);
        const s = state.disabledModels[state.activeModelType] || new Set();
        // 成功したメンバーのみ更新（部分失敗時のサーバー/クライアント乖離を防ぐ）
        for (const m of okSet) { if (enable) s.delete(m); else s.add(m); }
        state.disabledModels[state.activeModelType] = s;
        const errCount = data.errors?.length || 0;
        if (errCount > 0) showToast(`${errCount} ${t("modelToggleError")}`, "warning");
        showToast(t("modelStatusWarning"), "info");
        renderModelGrid();
    } catch (err) {
        showToast(t("modelToggleError") + ": " + err.message, "error");
    }
}

export async function fetchModelMetadata() {
    try {
        const res = await fetch("/api/wfm/models/metadata");
        return res.ok ? await res.json() : {};
    } catch {
        return {};
    }
}

export async function saveModelMetadata(modelName, updates) {
    try {
        const res = await fetch("/api/wfm/models/metadata", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modelName, ...updates }),
        });
        const data = await res.json();
        if (data.metadata) {
            state.modelMetadata[modelName] = data.metadata;
        }
        return data;
    } catch (err) {
        showToast(t("saveFailed", err.message), "error");
        return null;
    }
}

// ── Filtering ─────────────────────────────────────────────

async function fetchModelGroups() {
    try {
        const res = await fetch(`/api/wfm/models/groups?type=${encodeURIComponent(state.activeModelType)}`);
        return res.ok ? await res.json() : {};
    } catch { return {}; }
}

async function fetchAllModelGroups() {
    try {
        const res = await fetch("/api/wfm/models/groups");
        return res.ok ? await res.json() : {};
    } catch { return {}; }
}

export async function saveModelGroups(groups) {
    state.modelGroups = groups;
    state.allModelGroups[state.activeModelType] = groups;
    await fetch("/api/wfm/models/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_type: state.activeModelType, groups }),
    });
    renderGroupFilter();
    renderBulkActionBar();
}



// ── Data Loading ──────────────────────────────────────────

async function loadModelsForCurrentType() {
    const type = state.activeModelType;
    const placeholder = document.getElementById("wfm-models-placeholder");

    if (state.loaded[type] && state.modelsByType[type].length > 0) {
        // Reload groups for this type (groups are per-type)
        state.modelGroups = await fetchModelGroups();
        if (BATCH_MODEL_TYPES.includes(type) && !state.modelGroups["Batch"]) {
            state.modelGroups["Batch"] = [];
            await saveModelGroups(state.modelGroups);
        }
        if (STACK_MODEL_TYPES.includes(type) && !state.modelGroups["Stack"]) {
            state.modelGroups["Stack"] = [];
            await saveModelGroups(state.modelGroups);
        }
        if (!STACK_MODEL_TYPES.includes(type)) delete state.modelGroups["Stack"];
        state.allModelGroups[type] = state.modelGroups;
        renderTagFilter();
        renderDirFilter();
        renderGroupFilter();
        renderModelGrid();
        fetchSubdirs();
        return;
    }

    if (placeholder) placeholder.textContent = t("modelsLoading");

    try {
        const fetchFn = FETCH_MAP[type];
        if (!fetchFn) throw new Error("Unknown model type: " + type);

        const [models, disabledList, groups] = await Promise.all([
            fetchFn(), fetchDisabledModels(type), fetchModelGroups(),
        ]);
        const disabledSet = new Set(Array.isArray(disabledList) ? disabledList : []);
        state.disabledModels[type] = disabledSet;
        if (BATCH_MODEL_TYPES.includes(type) && !groups["Batch"]) {
            groups["Batch"] = [];
            await saveModelGroups(groups);
        }
        if (STACK_MODEL_TYPES.includes(type) && !groups["Stack"]) {
            groups["Stack"] = [];
            await saveModelGroups(groups);
        }
        if (!STACK_MODEL_TYPES.includes(type)) delete groups["Stack"];
        state.modelGroups = groups;
        state.allModelGroups[type] = groups;

        // Merge enabled + disabled into one list (dedup)
        // Guard: ensure models is an array (ComfyUI may return non-array on edge cases)
        const enabledList = Array.isArray(models) ? models : [];
        const allModels = [...new Set([...enabledList, ...disabledSet])];
        state.modelsByType[type] = allModels;
        state.loaded[type] = true;

        renderTagFilter();
        renderDirFilter();
        renderGroupFilter();
        renderModelGrid();
        fetchSubdirs();
    } catch (err) {
        console.error("Failed to load models:", err);
        if (placeholder) placeholder.textContent = t("modelsLoadError");
        showToast(t("errorWithMsg", err.message), "error");
    }
}


async function loadMetadataAndModels() {
    const [metadata, civitaiCache, allGroups] = await Promise.all([
        fetchModelMetadata(), fetchCivitaiCache(), fetchAllModelGroups()
    ]);
    state.modelMetadata = metadata;
    state.civitaiCache = civitaiCache;
    state.allModelGroups = allGroups;
    // groups are loaded per-type inside loadModelsForCurrentType
    await loadModelsForCurrentType();
}

// ── Init ──────────────────────────────────────────────────

export function initModelsTab() {
    setGridChangeCallback(renderModelGrid);
    // Sub-tab switching (model types)
    document.querySelectorAll(".wfm-models-type-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-models-type-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            state.activeModelType = btn.dataset.modelType;
            state.searchText = "";
            state.tagFilter = "";
            state.badgeFilter = "";
            state.dirFilter = "";
            state.groupFilter = "";
            state.statusFilter = "all";
            state.currentPage = 0;
            state.selectedModel = null;
            const statusFilter = document.getElementById("wfm-models-status-filter");
            if (statusFilter) statusFilter.value = "all";
            state.selectMode = false;
            state.selectedModels.clear();
            const selectBtn = document.getElementById("wfm-models-select-btn");
            if (selectBtn) { selectBtn.classList.remove("active"); selectBtn.textContent = t("modelSelectMode"); }
            renderBulkActionBar();
            closeSidePanel();

            const searchInput = document.getElementById("wfm-models-search");
            if (searchInput) searchInput.value = "";
            const tagFilter = document.getElementById("wfm-models-tag-filter");
            if (tagFilter) tagFilter.value = "";
            renderBadgeFilter();

            loadModelsForCurrentType();
        });
    });

    // Search
    const searchInput = document.getElementById("wfm-models-search");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            state.searchText = searchInput.value;
            state.currentPage = 0;
            renderModelGrid();
        });
    }
    setupSearchClearBtn("wfm-models-search", "wfm-models-search-clear-btn", () => {
        state.searchText = "";
        state.currentPage = 0;
        renderModelGrid();
    });

    // Tag filter
    document.getElementById("wfm-models-tag-filter")?.addEventListener("change", (e) => {
        state.tagFilter = e.target.value;
        state.currentPage = 0;
        renderModelGrid();
    });

    // Dir filter
    document.getElementById("wfm-models-dir-filter")?.addEventListener("change", (e) => {
        state.dirFilter = e.target.value;
        state.currentPage = 0;
        renderModelGrid();
    });

    // Group filter — value is "type::groupName" or "" for all
    document.getElementById("wfm-models-group-filter")?.addEventListener("change", async (e) => {
        const value = e.target.value;
        if (!value) {
            state.groupFilter = "";
        } else {
            const sepIdx = value.indexOf("::");
            const type = value.substring(0, sepIdx);
            const groupName = value.substring(sepIdx + 2);
            // Auto-switch model type if different
            if (type !== state.activeModelType) {
                document.querySelectorAll(".wfm-models-type-btn").forEach((b) => {
                    b.classList.toggle("active", b.dataset.modelType === type);
                });
                state.activeModelType = type;
                state.searchText = "";
                state.tagFilter = "";
                state.badgeFilter = "";
                state.dirFilter = "";
                state.statusFilter = "all";
                state.selectedModel = null;
                const statusFilter = document.getElementById("wfm-models-status-filter");
                if (statusFilter) statusFilter.value = "all";
                const searchInput = document.getElementById("wfm-models-search");
                if (searchInput) searchInput.value = "";
                closeSidePanel();
                await loadModelsForCurrentType();
            }
            state.groupFilter = groupName;
        }
        state.currentPage = 0;
        renderModelGrid();
    });

    // Status filter
    document.getElementById("wfm-models-status-filter")?.addEventListener("change", (e) => {
        state.statusFilter = e.target.value;
        state.currentPage = 0;
        renderModelGrid();
    });

    // Favorites filter
    const favBtn = document.getElementById("wfm-models-fav-btn");
    if (favBtn) {
        favBtn.addEventListener("click", () => {
            state.showFavoritesOnly = !state.showFavoritesOnly;
            favBtn.classList.toggle("active", state.showFavoritesOnly);
            state.currentPage = 0;
            renderModelGrid();
        });
    }

    // Batch filter
    document.getElementById("wfm-models-batch-filter-btn")?.addEventListener("click", () => {
        state.showBatchOnly = !state.showBatchOnly;
        document.getElementById("wfm-models-batch-filter-btn").classList.toggle("active", state.showBatchOnly);
        state.currentPage = 0;
        renderModelGrid();
    });

    // Batch clear
    document.getElementById("wfm-models-batch-clear-btn")?.addEventListener("click", () => {
        clearBatchGroup();
    });

    // Stack clear
    document.getElementById("wfm-models-stack-clear-btn")?.addEventListener("click", () => {
        clearStackGroup();
    });

    // Clear filters button
    const modelsClearBtn = document.getElementById("wfm-models-clear-filters-btn");
    if (modelsClearBtn) {
        modelsClearBtn.textContent = t("clearFilters");
        modelsClearBtn.addEventListener("click", () => {
            state.searchText = "";
            state.tagFilter = "";
            state.dirFilter = "";
            state.groupFilter = "";
            state.statusFilter = "all";
            state.showFavoritesOnly = false;
            state.showBatchOnly = false;
            state.currentPage = 0;
            const searchInput = document.getElementById("wfm-models-search");
            if (searchInput) searchInput.value = "";
            const tagFilter = document.getElementById("wfm-models-tag-filter");
            if (tagFilter) tagFilter.value = "";
            const dirFilter = document.getElementById("wfm-models-dir-filter");
            if (dirFilter) dirFilter.value = "";
            const groupFilter = document.getElementById("wfm-models-group-filter");
            if (groupFilter) groupFilter.value = "";
            const statusFilter = document.getElementById("wfm-models-status-filter");
            if (statusFilter) statusFilter.value = "all";
            const favBtn = document.getElementById("wfm-models-fav-btn");
            if (favBtn) favBtn.classList.remove("active");
            const batchFilterBtn = document.getElementById("wfm-models-batch-filter-btn");
            if (batchFilterBtn) batchFilterBtn.classList.remove("active");
            renderModelGrid();
        });
    }

    // View mode (thumb / card / table)
    document.querySelectorAll("[data-models-view]").forEach((btn) => {
        if (btn.dataset.modelsView === state.viewMode) {
            document.querySelectorAll("[data-models-view]").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
        }
        btn.addEventListener("click", () => {
            document.querySelectorAll("[data-models-view]").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            state.viewMode = btn.dataset.modelsView;
            localStorage.setItem("wfm_models_view", state.viewMode);
            renderModelGrid();
        });
    });

    // Badge manage button (toolbar)
    document.getElementById("wfm-models-badge-settings-btn")?.addEventListener("click", () => {
        openBadgeEditModal();
    });

    // Refresh
    document.getElementById("wfm-models-refresh-btn")?.addEventListener("click", () => {
        state.loaded[state.activeModelType] = false;
        state.modelsByType[state.activeModelType] = [];
        loadModelsForCurrentType();
    });

    // Select mode
    document.getElementById("wfm-models-select-btn")?.addEventListener("click", toggleSelectMode);

    // CivitAI batch fetch
    document.getElementById("wfm-models-civitai-batch-btn")?.addEventListener("click", () => {
        batchFetchCivitai();
    });

    // Side panel tab switching
    document.querySelectorAll(".wfm-models-side-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-models-side-tab-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            const tabId = btn.dataset.sideTab;
            document.querySelectorAll(".wfm-models-side-content").forEach((c) => (c.style.display = "none"));
            const map = { info: "wfm-models-side-info", group: "wfm-models-side-group", civitai: "wfm-models-side-civitai" };
            const target = document.getElementById(map[tabId]);
            if (target) target.style.display = "block";
            if (tabId === "civitai" && state.selectedModel) renderSideCivitai(state.selectedModel);
        });
    });

    // GenUI Model / Embedding buttons in side tab nav
    document.getElementById("wfm-side-genui-nav-btn")?.addEventListener("click", () => {
        if (!state.selectedModel) return;
        if (state.activeModelType === "embedding") {
            applyEmbeddingToPrompt(state.selectedModel, "positive");
        } else {
            applyToGenUI(state.selectedModel, state.activeModelType);
        }
    });
    document.getElementById("wfm-side-genui-np-btn")?.addEventListener("click", () => {
        if (state.selectedModel) applyEmbeddingToPrompt(state.selectedModel, "negative");
    });

    // Initialize badge filter bar
    renderBadgeFilter();

    // Lazy load on first tab click
    let firstLoad = false;
    document.querySelector('[data-tab="models"]')?.addEventListener("click", () => {
        if (!firstLoad) {
            firstLoad = true;
            loadMetadataAndModels();
        }
    });
}

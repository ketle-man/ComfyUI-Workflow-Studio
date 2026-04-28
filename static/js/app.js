/**
 * Workflow Studio - SPA Shell
 * Tab switching and initialization
 */

import { initI18n, t } from "./i18n.js";

// Initialize i18n before anything else
initI18n();

// ============================================
// Toast Notification
// ============================================

let toastTimer = null;

export function showToast(message, type = "info", duration = 3000) {
    const toast = document.getElementById("wfm-toast");
    if (!toast) return;

    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = "wfm-toast";
    if (type === "success" || type === "error") {
        toast.classList.add(type);
    }
    toast.style.display = "block";
    toast.style.opacity = "1";

    toastTimer = setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => {
            toast.style.display = "none";
        }, 300);
    }, duration);
}

// ============================================
// Modal
// ============================================

export function openModal(title, contentHtml) {
    const overlay = document.getElementById("wfm-modal-overlay");
    const titleEl = document.getElementById("wfm-modal-title");
    const bodyEl = document.getElementById("wfm-modal-body");

    if (!overlay || !titleEl || !bodyEl) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = contentHtml;
    overlay.style.display = "flex";
}

export function closeModal() {
    const overlay = document.getElementById("wfm-modal-overlay");
    if (overlay) {
        overlay.style.display = "none";
    }
}

// ============================================
// Tab Switching
// ============================================

function initTabs() {
    const tabs = document.querySelectorAll(".wfm-tab");
    const contents = document.querySelectorAll(".wfm-tab-content");

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const targetId = tab.dataset.tab;

            // Update tab buttons
            tabs.forEach((tb) => tb.classList.remove("active"));
            tab.classList.add("active");

            // Update tab contents
            contents.forEach((c) => c.classList.remove("active"));
            const target = document.getElementById(`wfm-tab-${targetId}`);
            if (target) {
                target.classList.add("active");
            }
        });
    });
}

// ============================================
// Apply i18n to static HTML elements
// ============================================

function applyI18nToHtml() {
    // Tab labels
    const tabMap = { workflow: "tabWorkflow", nodes: "tabNodes", models: "tabModels", generate: "tabGenerate", prompt: "tabPrompt", gallery: "tabGallery", settings: "tabSettings", help: "tabHelp" };
    document.querySelectorAll(".wfm-tab").forEach((tab) => {
        const key = tabMap[tab.dataset.tab];
        if (key) tab.textContent = t(key);
    });

    // Toolbar elements
    const searchInput = document.getElementById("wfm-search");
    if (searchInput) searchInput.placeholder = t("searchPlaceholder");

    const groupFilter = document.getElementById("wfm-group-filter");
    if (groupFilter) {
        const firstOpt = groupFilter.querySelector("option[value='']");
        if (firstOpt) firstOpt.textContent = t("allGroups");
    }

    const listLoadBtn = document.getElementById("wfm-list-load-btn");
    if (listLoadBtn) {
        listLoadBtn.textContent = t("loadInGenerate");
        if (listLoadBtn.disabled) listLoadBtn.title = t("selectCardFirst");
    }

    const listOpenComfyBtn = document.getElementById("wfm-list-open-comfyui-btn");
    if (listOpenComfyBtn) {
        listOpenComfyBtn.textContent = t("openInComfyUI");
        if (listOpenComfyBtn.disabled) listOpenComfyBtn.title = t("selectCardFirst");
    }

    const refreshBtn = document.getElementById("wfm-refresh-btn");
    if (refreshBtn) refreshBtn.textContent = t("refresh");

    const reanalyzeBtn = document.getElementById("wfm-reanalyze-btn");
    if (reanalyzeBtn) reanalyzeBtn.textContent = t("reanalyzeAll");

    // Import label
    const importLabel = document.querySelector("#wfm-import-input")?.closest("label");
    if (importLabel) {
        const input = importLabel.querySelector("input");
        importLabel.textContent = t("import");
        if (input) importLabel.appendChild(input);
    }

    // Side panel
    const sidePanelTabs = document.querySelectorAll(".wfm-side-tab-btn");
    sidePanelTabs.forEach((btn) => {
        if (btn.dataset.sideTab === "json") btn.textContent = "JSON";
        if (btn.dataset.sideTab === "group") btn.textContent = t("groupsLabel");
    });

    const copyBtn = document.getElementById("wfm-json-copy-btn");
    if (copyBtn) copyBtn.textContent = t("copy");

    // Nodes tab
    const nodesSubBtns = document.querySelectorAll(".wfm-nodes-subview-btn");
    nodesSubBtns.forEach(btn => {
        if (btn.dataset.subview === "browser") btn.textContent = t("nodesAllNodes");
        if (btn.dataset.subview === "sets") btn.textContent = t("nodesNodeSets");
    });
    const nodesSearch = document.getElementById("wfm-nodes-search");
    if (nodesSearch) nodesSearch.placeholder = t("nodesSearchPlaceholder");
    const nodesRefreshBtn = document.getElementById("wfm-nodes-refresh-btn");
    if (nodesRefreshBtn) nodesRefreshBtn.textContent = t("nodesRefresh");
    const nodeSetCreateBtn = document.getElementById("wfm-node-set-create-btn");
    if (nodeSetCreateBtn) nodeSetCreateBtn.textContent = t("nodesCreateSet");
    const nodesSideTabBtns = document.querySelectorAll(".wfm-nodes-side-tab-btn");
    nodesSideTabBtns.forEach(btn => {
        if (btn.dataset.sideTab === "details") btn.textContent = t("nodesDetails");
        if (btn.dataset.sideTab === "io") btn.textContent = t("nodesIoSpec");
        if (btn.dataset.sideTab === "nodegroup") btn.textContent = t("nodesGroups");
    });
    const nodesPlaceholder = document.getElementById("wfm-nodes-placeholder");
    if (nodesPlaceholder) nodesPlaceholder.textContent = t("nodesClickToLoad");

    // Models tab
    const modelsTypeBtns = document.querySelectorAll(".wfm-models-type-btn");
    modelsTypeBtns.forEach(btn => {
        const key = "models" + btn.dataset.modelType.charAt(0).toUpperCase() + btn.dataset.modelType.slice(1);
        const label = t(key);
        if (label && label !== key) btn.textContent = label;
    });
    const modelsSearch = document.getElementById("wfm-models-search");
    if (modelsSearch) modelsSearch.placeholder = t("modelsSearchPlaceholder");
    const modelsRefreshBtn = document.getElementById("wfm-models-refresh-btn");
    if (modelsRefreshBtn) modelsRefreshBtn.textContent = t("modelsRefresh");
    const modelsPlaceholder = document.getElementById("wfm-models-placeholder");
    if (modelsPlaceholder) modelsPlaceholder.textContent = t("modelsClickToLoad");
    const modelsTagFilter = document.getElementById("wfm-models-tag-filter");
    if (modelsTagFilter) {
        const firstOpt = modelsTagFilter.querySelector("option[value='']");
        if (firstOpt) firstOpt.textContent = t("modelsAllTags");
    }
    const modelsSideTabBtns = document.querySelectorAll(".wfm-models-side-tab-btn");
    modelsSideTabBtns.forEach(btn => {
        if (btn.dataset.sideTab === "info") btn.textContent = t("modelsSideInfo");
        if (btn.dataset.sideTab === "group") btn.textContent = t("modelsSideGroup");
        if (btn.dataset.sideTab === "civitai") btn.textContent = t("modelsSideCivitai");
    });

    // Gallery tab
    const gallerySideTabBtns = document.querySelectorAll(".wfm-gallery-detail-tab-btn");
    gallerySideTabBtns.forEach(btn => {
        if (btn.dataset.detailTab === "info") btn.textContent = t("modelsSideInfo");
        if (btn.dataset.detailTab === "meta") btn.textContent = t("gallerySideMetadata");
        if (btn.dataset.detailTab === "group") btn.textContent = t("modelsSideGroup");
    });

    // Prompt tab
    const assistantHeader = document.querySelector(".wfm-prompt-split-left .wfm-prompt-split-header");
    if (assistantHeader) assistantHeader.textContent = t("assistantSubtab");
    const presetsHeader = document.querySelector(".wfm-prompt-split-right .wfm-prompt-split-header");
    if (presetsHeader) presetsHeader.textContent = t("presetsSubtab");
    const ollamaRefreshBtn = document.getElementById("wfm-ollama-refresh-btn");
    if (ollamaRefreshBtn) ollamaRefreshBtn.textContent = t("refresh");
    const ollamaTestBtn = document.getElementById("wfm-ollama-test-btn");
    if (ollamaTestBtn) ollamaTestBtn.textContent = t("test");
    const ollamaAttachBtn = document.getElementById("wfm-ollama-attach-btn");
    if (ollamaAttachBtn) ollamaAttachBtn.textContent = t("attachImage");
    const ollamaClearBtn = document.getElementById("wfm-ollama-clear-btn");
    if (ollamaClearBtn) ollamaClearBtn.textContent = t("clearChat");
    const ollamaSendBtn = document.getElementById("wfm-ollama-send-btn");
    if (ollamaSendBtn) ollamaSendBtn.textContent = t("send");
    const ja2enBtn = document.getElementById("wfm-ollama-ja2en-btn");
    if (ja2enBtn) ja2enBtn.textContent = t("ja2en");
    const en2jaBtn = document.getElementById("wfm-ollama-en2ja-btn");
    if (en2jaBtn) en2jaBtn.textContent = t("en2ja");
    const presetApplyBtn = document.getElementById("wfm-preset-apply-btn");
    if (presetApplyBtn) presetApplyBtn.textContent = t("applyPreset");
    const presetSaveBtn = document.getElementById("wfm-preset-save-btn");
    if (presetSaveBtn) presetSaveBtn.textContent = t("savePreset");
    const presetCopyPosBtn = document.getElementById("wfm-preset-copy-pos-btn");
    if (presetCopyPosBtn) presetCopyPosBtn.textContent = t("copyPositivePrompt");
    const presetCopyNegBtn = document.getElementById("wfm-preset-copy-neg-btn");
    if (presetCopyNegBtn) presetCopyNegBtn.textContent = t("copyNegativePrompt");

    // Group panel labels
    const propTitle = document.querySelector("#wfm-side-tab-group .wfm-group-section-title");
    if (propTitle) propTitle.textContent = t("properties");

    const groupMgmtTitles = document.querySelectorAll("#wfm-side-tab-group .wfm-group-section-title");
    if (groupMgmtTitles[1]) groupMgmtTitles[1].textContent = t("groupManagement");
    if (groupMgmtTitles[2]) groupMgmtTitles[2].textContent = t("workflowActions");

    const groupNameInput = document.getElementById("wfm-group-name-input");
    if (groupNameInput) groupNameInput.placeholder = t("groupNamePlaceholder");

    const addGroupBtn = document.getElementById("wfm-group-add-btn");
    if (addGroupBtn) addGroupBtn.textContent = t("addGroup");

    const groupSelect = document.getElementById("wfm-group-select");
    if (groupSelect) {
        const firstOpt = groupSelect.querySelector("option[value='']");
        if (firstOpt) firstOpt.textContent = t("selectGroup");
    }

    const assignBtn = document.getElementById("wfm-assign-group-btn");
    if (assignBtn) assignBtn.textContent = t("addToGroup");

    const removeBtn = document.getElementById("wfm-remove-group-btn");
    if (removeBtn) removeBtn.textContent = t("removeFromGroup");

    // Help & Support tab
    const helpManualTitle = document.getElementById("wfm-help-manual-title");
    if (helpManualTitle) helpManualTitle.textContent = t("helpManualTitle");

    const helpIdMap = {
        "wfm-help-about-title": "helpAboutTitle",
        "wfm-help-about-desc": "helpAboutDesc",
        "wfm-help-about-1": "helpAbout1", "wfm-help-about-2": "helpAbout2",
        "wfm-help-wf-1": "helpWf1", "wfm-help-wf-2": "helpWf2", "wfm-help-wf-3": "helpWf3",
        "wfm-help-wf-4": "helpWf4", "wfm-help-wf-5": "helpWf5", "wfm-help-wf-6": "helpWf6",
        "wfm-help-wf-7": "helpWf7",
        "wfm-help-gen-1": "helpGen1", "wfm-help-gen-2": "helpGen2",
        "wfm-help-gen-3": "helpGen3", "wfm-help-gen-4": "helpGen4",
        "wfm-help-gen-5": "helpGen5", "wfm-help-gen-6": "helpGen6", "wfm-help-gen-7": "helpGen7",
        "wfm-help-gen-8": "helpGen8", "wfm-help-gen-9": "helpGen9", "wfm-help-gen-10": "helpGen10",
        "wfm-help-prompt-1": "helpPrompt1", "wfm-help-prompt-2": "helpPrompt2",
        "wfm-help-prompt-3": "helpPrompt3", "wfm-help-prompt-4": "helpPrompt4",
        "wfm-help-prompt-5": "helpPrompt5", "wfm-help-prompt-6": "helpPrompt6",
        "wfm-help-prompt-7": "helpPrompt7", "wfm-help-prompt-8": "helpPrompt8",
        "wfm-help-prompt-9": "helpPrompt9",
        "wfm-help-settings-1": "helpSettings1", "wfm-help-settings-2": "helpSettings2",
        "wfm-help-settings-3": "helpSettings3", "wfm-help-settings-4": "helpSettings4",
        "wfm-help-settings-5": "helpSettings5", "wfm-help-settings-6": "helpSettings6",
        "wfm-help-settings-7": "helpSettings7", "wfm-help-settings-8": "helpSettings8",
        "wfm-help-settings-9": "helpSettings9", "wfm-help-settings-10": "helpSettings10",
        "wfm-help-nodes-1": "helpNodes1", "wfm-help-nodes-2": "helpNodes2",
        "wfm-help-nodes-3": "helpNodes3", "wfm-help-nodes-4": "helpNodes4",
        "wfm-help-nodes-5": "helpNodes5", "wfm-help-nodes-6": "helpNodes6",
        "wfm-help-models-1": "helpModels1", "wfm-help-models-2": "helpModels2",
        "wfm-help-models-3": "helpModels3", "wfm-help-models-4": "helpModels4",
        "wfm-help-models-5": "helpModels5", "wfm-help-models-6": "helpModels6",
        "wfm-help-models-7": "helpModels7", "wfm-help-models-8": "helpModels8",
        "wfm-help-models-9": "helpModels9", "wfm-help-models-10": "helpModels10",
        "wfm-help-models-11": "helpModels11",
        "wfm-help-gallery-title": "helpGalleryTitle",
        "wfm-help-gallery-1": "helpGallery1", "wfm-help-gallery-2": "helpGallery2",
        "wfm-help-gallery-3": "helpGallery3", "wfm-help-gallery-4": "helpGallery4",
        "wfm-help-gallery-5": "helpGallery5", "wfm-help-gallery-6": "helpGallery6",
        "wfm-help-gallery-7": "helpGallery7", "wfm-help-gallery-8": "helpGallery8",
        "wfm-help-gallery-9": "helpGallery9", "wfm-help-gallery-10": "helpGallery10",
        "wfm-help-sidepanel-title": "helpSidepanelTitle",
        "wfm-help-sidepanel-1": "helpSidepanel1", "wfm-help-sidepanel-2": "helpSidepanel2",
        "wfm-help-sidepanel-3": "helpSidepanel3", "wfm-help-sidepanel-4": "helpSidepanel4",
        "wfm-help-sidepanel-5": "helpSidepanel5", "wfm-help-sidepanel-6": "helpSidepanel6",
        "wfm-help-sidepanel-7": "helpSidepanel7", "wfm-help-sidepanel-8": "helpSidepanel8",
        "wfm-help-sidepanel-9": "helpSidepanel9", "wfm-help-sidepanel-10": "helpSidepanel10",
        "wfm-help-sidepanel-11": "helpSidepanel11", "wfm-help-sidepanel-12": "helpSidepanel12",
        "wfm-help-shortcuts-title": "helpShortcutsTitle",
        "wfm-help-shortcuts-1": "helpShortcuts1", "wfm-help-shortcuts-2": "helpShortcuts2",
        "wfm-help-shortcuts-3": "helpShortcuts3", "wfm-help-shortcuts-4": "helpShortcuts4",
        "wfm-help-trouble-title": "helpTroubleTitle",
        "wfm-help-trouble-1": "helpTrouble1", "wfm-help-trouble-2": "helpTrouble2",
        "wfm-help-trouble-3": "helpTrouble3", "wfm-help-trouble-4": "helpTrouble4",
        "wfm-help-support-title": "helpSupportTitle",
        "wfm-help-support-desc": "helpSupportDesc",
        "wfm-help-github-desc": "helpGithubDesc",
        "wfm-help-kofi-desc": "helpKofiDesc",
        "wfm-help-thanks": "helpThanks",
    };
    for (const [id, key] of Object.entries(helpIdMap)) {
        const el = document.getElementById(id);
        if (el) el.textContent = t(key);
    }
}

// ============================================
// Modal close handlers
// ============================================

function initModal() {
    const overlay = document.getElementById("wfm-modal-overlay");
    const closeBtn = document.querySelector(".wfm-modal-close");

    if (closeBtn) {
        closeBtn.addEventListener("click", closeModal);
    }

    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeModal();
        }
    });
}

// ============================================
// Initialization
// ============================================

import { initWorkflowTab } from "./workflow-tab.js";
import { initNodesTab } from "./nodes-tab.js";
import { initGenerateTab } from "./generate-tab.js";
import { initPromptTab } from "./prompt-tab.js";
import { initSettingsTab, applyTheme, getSavedTheme } from "./settings-tab.js";
import { initModelsTab } from "./models-tab.js";
import { initGalleryTab } from "./gallery-tab.js";

// Apply saved theme immediately to prevent flash of default theme
applyTheme(getSavedTheme());

document.addEventListener("DOMContentLoaded", () => {
    applyI18nToHtml();
    initTabs();
    initModal();
    initSettingsTab(); // Settings first (applies saved URL)
    initWorkflowTab();
    initNodesTab();
    initModelsTab();
    initGenerateTab();
    initPromptTab();
    initGalleryTab();

    console.log("Workflow Studio: App initialized");
});

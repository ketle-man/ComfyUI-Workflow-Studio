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
    const tabMap = { workflow: "tabWorkflow", generate: "tabGenerate", prompt: "tabPrompt", settings: "tabSettings" };
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

    // Prompt tab
    document.querySelectorAll(".wfm-prompt-subtab-btn").forEach((btn) => {
        if (btn.dataset.promptSubtab === "assistant") btn.textContent = t("assistantSubtab");
        if (btn.dataset.promptSubtab === "presets") btn.textContent = t("presetsSubtab");
    });
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
    const presetDeleteBtn = document.getElementById("wfm-preset-delete-btn");
    if (presetDeleteBtn) presetDeleteBtn.textContent = t("deletePreset");
    const presetSaveBtn = document.getElementById("wfm-preset-save-btn");
    if (presetSaveBtn) presetSaveBtn.textContent = t("savePreset");

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
import { initGenerateTab } from "./generate-tab.js";
import { initPromptTab } from "./prompt-tab.js";
import { initSettingsTab } from "./settings-tab.js";

document.addEventListener("DOMContentLoaded", () => {
    applyI18nToHtml();
    initTabs();
    initModal();
    initSettingsTab(); // Settings first (applies saved URL)
    initWorkflowTab();
    initGenerateTab();
    initPromptTab();

    console.log("Workflow Studio: App initialized");
});

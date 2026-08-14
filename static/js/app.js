/**
 * Workflow Studio - SPA Shell
 * Tab switching and initialization
 */

import { initI18n, t } from "./i18n.js";
import { getSettings } from "./util.js";

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
    const tabMap = { workflow: "tabWorkflow", nodes: "tabNodes", models: "tabModels", generate: "tabGenerate", prompt: "tabPrompt", metadata: "tabMetadata", gallery: "tabGallery", "image-edit": "tabImageEdit", settings: "tabSettings", help: "tabHelp", ai: "tabAi", tagger: "tabTagger" };
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
        listOpenComfyBtn.textContent = t("sendToCanvas");
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
    const galleryBulkDeselect = document.getElementById("wfm-gallery-bulk-deselect");
    if (galleryBulkDeselect) galleryBulkDeselect.textContent = t("galleryBulkDeselectAll");
    const galleryBulkSelectAll = document.getElementById("wfm-gallery-bulk-select-all");
    if (galleryBulkSelectAll) galleryBulkSelectAll.textContent = t("galleryBulkSelectAll");
    const galleryBulkGroupSelect = document.getElementById("wfm-gallery-bulk-group-select");
    if (galleryBulkGroupSelect) {
        const opt = galleryBulkGroupSelect.querySelector("option[value='']");
        if (opt) opt.textContent = t("galleryBulkAddToGroup");
    }
    const galleryBulkGroupAdd = document.getElementById("wfm-gallery-bulk-group-add");
    if (galleryBulkGroupAdd) galleryBulkGroupAdd.textContent = t("galleryBulkAdd");
    const galleryBulkGroupRemove = document.getElementById("wfm-gallery-bulk-group-remove");
    if (galleryBulkGroupRemove) galleryBulkGroupRemove.textContent = t("galleryBulkGroupRemove");
    const galleryBulkFav = document.getElementById("wfm-gallery-bulk-fav");
    if (galleryBulkFav) galleryBulkFav.textContent = t("galleryBulkFavAll");
    const galleryBulkUnfav = document.getElementById("wfm-gallery-bulk-unfav");
    if (galleryBulkUnfav) galleryBulkUnfav.textContent = t("galleryBulkUnfavAll");
    const galleryBulkMove = document.getElementById("wfm-gallery-bulk-move");
    if (galleryBulkMove) galleryBulkMove.textContent = t("galleryBulkMoveTo");
    const galleryBulkExport = document.getElementById("wfm-gallery-bulk-export");
    if (galleryBulkExport) galleryBulkExport.textContent = t("galleryBulkExport");
    const galleryBulkDelete = document.getElementById("wfm-gallery-bulk-delete");
    if (galleryBulkDelete) galleryBulkDelete.textContent = t("galleryBulkDelete");
    const galleryOpenTaggerBtn = document.getElementById("wfm-gallery-open-tagger-btn");
    if (galleryOpenTaggerBtn) galleryOpenTaggerBtn.textContent = t("tabTagger");

    // Gallery サブタブ (Output / ImagePrompt / Style_Catalog)
    const galleryOutputSubtab = document.getElementById("wfm-gallery-subtab-output");
    if (galleryOutputSubtab) galleryOutputSubtab.textContent = t("galleryTabOutput");
    const galleryImagePromptSubtab = document.getElementById("wfm-gallery-subtab-imageprompt");
    if (galleryImagePromptSubtab) galleryImagePromptSubtab.textContent = t("galleryTabImagePrompt");
    const galleryStyleCatalogSubtab = document.getElementById("wfm-gallery-subtab-styleCatalog");
    if (galleryStyleCatalogSubtab) galleryStyleCatalogSubtab.textContent = t("galleryTabStyleCatalog");

    // ImagePrompt ギャラリーパネル
    const imagePromptSearch = document.getElementById("wfm-imageprompt-search");
    if (imagePromptSearch) imagePromptSearch.placeholder = t("gallerySearchPlaceholder");
    const imagePromptRefreshBtn = document.getElementById("wfm-imageprompt-refresh-btn");
    if (imagePromptRefreshBtn) imagePromptRefreshBtn.textContent = t("refresh");
    const imagePromptTreeTitle = document.getElementById("wfm-imageprompt-tree-title");
    if (imagePromptTreeTitle) imagePromptTreeTitle.textContent = t("galleryFolders");
    const imagePromptListPlaceholder = document.getElementById("wfm-imageprompt-list-placeholder");
    if (imagePromptListPlaceholder) imagePromptListPlaceholder.textContent = t("gallerySelectFolder");
    const imagePromptNoSelection = document.getElementById("wfm-imageprompt-no-selection");
    if (imagePromptNoSelection) imagePromptNoSelection.textContent = t("galleryNoSelection");
    const imagePromptSelectedPromptTitle = document.getElementById("wfm-imageprompt-selected-prompt-title");
    if (imagePromptSelectedPromptTitle) imagePromptSelectedPromptTitle.textContent = t("imagePromptSelectedPrompt");
    const imagePromptSelectedPrompt = document.getElementById("wfm-imageprompt-selected-prompt");
    if (imagePromptSelectedPrompt) imagePromptSelectedPrompt.placeholder = t("imagePromptNoPrompt");
    const imagePromptSavePromptBtn = document.getElementById("wfm-imageprompt-save-prompt-btn");
    if (imagePromptSavePromptBtn) imagePromptSavePromptBtn.textContent = t("save");
    const imagePromptAddBtn = document.getElementById("wfm-imageprompt-add-btn");
    if (imagePromptAddBtn) imagePromptAddBtn.textContent = t("imagePromptAddBtn");
    const imagePromptChipsTitle = document.getElementById("wfm-imageprompt-chips-title");
    if (imagePromptChipsTitle) imagePromptChipsTitle.textContent = t("imagePromptChipsTitle");
    const imagePromptClearBtn = document.getElementById("wfm-imageprompt-clear-btn");
    if (imagePromptClearBtn) imagePromptClearBtn.textContent = t("imagePromptClearBtn");
    const imagePromptFinalPromptTitle = document.getElementById("wfm-imageprompt-final-prompt-title");
    if (imagePromptFinalPromptTitle) imagePromptFinalPromptTitle.textContent = t("imagePromptFinalPromptTitle");
    const imagePromptCopyBtn = document.getElementById("wfm-imageprompt-copy-btn");
    if (imagePromptCopyBtn) imagePromptCopyBtn.textContent = t("copy");

    // Style_Catalog ギャラリーパネル
    const scSearch = document.getElementById("wfm-stylecatalog-search");
    if (scSearch) scSearch.placeholder = t("stylecatalogSearchPlaceholder");
    const scRefreshBtn = document.getElementById("wfm-stylecatalog-refresh-btn");
    if (scRefreshBtn) scRefreshBtn.textContent = t("refresh");
    const scTreeTitle = document.getElementById("wfm-stylecatalog-tree-title");
    if (scTreeTitle) scTreeTitle.textContent = t("galleryFolders");
    const scListPlaceholder = document.getElementById("wfm-stylecatalog-list-placeholder");
    if (scListPlaceholder) scListPlaceholder.textContent = t("gallerySelectFolder");
    const scNoSelection = document.getElementById("wfm-stylecatalog-no-selection");
    if (scNoSelection) scNoSelection.textContent = t("galleryNoSelection");
    const scPositiveTitle = document.getElementById("wfm-stylecatalog-positive-title");
    if (scPositiveTitle) scPositiveTitle.textContent = t("stylecatalogPositive");
    const scCopyPositiveBtn = document.getElementById("wfm-stylecatalog-copy-positive-btn");
    if (scCopyPositiveBtn) scCopyPositiveBtn.textContent = t("copy");
    const scNegativeTitle = document.getElementById("wfm-stylecatalog-negative-title");
    if (scNegativeTitle) scNegativeTitle.textContent = t("stylecatalogNegative");
    const scCopyNegativeBtn = document.getElementById("wfm-stylecatalog-copy-negative-btn");
    if (scCopyNegativeBtn) scCopyNegativeBtn.textContent = t("copy");
    const scSelectStyleBtn = document.getElementById("wfm-stylecatalog-select-style-btn");
    if (scSelectStyleBtn) scSelectStyleBtn.textContent = t("stylecatalogSelectStyleBtn");
    const scLoadGenuiBtn = document.getElementById("wfm-stylecatalog-load-genui-btn");
    if (scLoadGenuiBtn) scLoadGenuiBtn.textContent = t("stylecatalogLoadGenuiBtn");
    const scOpenMetadataBtn = document.getElementById("wfm-stylecatalog-open-metadata-btn");
    if (scOpenMetadataBtn) scOpenMetadataBtn.textContent = t("stylecatalogOpenMetadataBtn");

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

    // AI tab
    document.querySelectorAll(".wfm-ai-subtab-btn").forEach(btn => {
        if (btn.dataset.aiSubtab === "translate") btn.textContent = t("aiSubTabTranslate");
        if (btn.dataset.aiSubtab === "vlm") btn.textContent = t("aiSubTabVlm");
        if (btn.dataset.aiSubtab === "ai-settings") btn.textContent = t("aiSubTabSettings");
    });
    const aiLangMap = { ja: "aiLangJa", en: "aiLangEn", zh: "aiLangZh", free: "aiLangFree" };
    [document.getElementById("wfm-ai-src-lang"), document.getElementById("wfm-ai-dst-lang")].forEach(sel => {
        if (!sel) return;
        sel.querySelectorAll("option").forEach(opt => {
            const key = aiLangMap[opt.value];
            if (key) opt.textContent = t(key);
        });
    });
    const aiTransInput = document.getElementById("wfm-ai-trans-input");
    if (aiTransInput) aiTransInput.placeholder = t("aiTransInputPlaceholder");
    const aiTransOutput = document.getElementById("wfm-ai-trans-output");
    if (aiTransOutput) aiTransOutput.placeholder = t("aiTransOutputPlaceholder");
    const aiTransBtn = document.getElementById("wfm-ai-trans-btn");
    if (aiTransBtn) aiTransBtn.textContent = t("aiTranslateBtn");
    const aiTransCopyBtn = document.getElementById("wfm-ai-trans-copy-btn");
    if (aiTransCopyBtn) aiTransCopyBtn.textContent = t("aiCopyBtn");
    const aiVlmLabel = document.getElementById("wfm-ai-vlm-label");
    if (aiVlmLabel) aiVlmLabel.textContent = t("aiVlmDropLabel");
    const aiVlmTask = document.getElementById("wfm-ai-vlm-task");
    if (aiVlmTask) {
        aiVlmTask.querySelectorAll("option").forEach(opt => {
            if (opt.value === "describe") opt.textContent = t("aiVlmDescribe");
            if (opt.value === "prompt") opt.textContent = t("aiVlmPromptCreate");
        });
    }
    const aiVlmRunBtn = document.getElementById("wfm-ai-vlm-run");
    if (aiVlmRunBtn) aiVlmRunBtn.textContent = t("aiVlmRunBtn");
    const aiVlmResult = document.getElementById("wfm-ai-vlm-result");
    if (aiVlmResult) aiVlmResult.placeholder = t("aiVlmResultPlaceholder");
    const aiVlmCopyBtn = document.getElementById("wfm-ai-vlm-copy");
    if (aiVlmCopyBtn) aiVlmCopyBtn.textContent = t("aiCopyBtn");
    const aiBackendTitle = document.getElementById("wfm-ai-settings-backend-title");
    if (aiBackendTitle) aiBackendTitle.textContent = t("aiSettingsBackend");
    const aiConnTitle = document.getElementById("wfm-ai-settings-conn-title");
    if (aiConnTitle) aiConnTitle.textContent = t("aiSettingsConnection");
    const aiTestBtn = document.getElementById("wfm-ai-test-btn");
    if (aiTestBtn) aiTestBtn.textContent = t("aiSettingsTestBtn");
    const aiModelTitle = document.getElementById("wfm-ai-settings-model-title");
    if (aiModelTitle) aiModelTitle.textContent = t("aiSettingsModelSection");
    const aiModelSel = document.getElementById("wfm-ai-model-select");
    if (aiModelSel) {
        const firstOpt = aiModelSel.querySelector("option[value='']");
        if (firstOpt) firstOpt.textContent = t("aiSettingsModelPlaceholder");
    }
    const aiModelRefreshBtn = document.getElementById("wfm-ai-model-refresh-btn");
    if (aiModelRefreshBtn) aiModelRefreshBtn.textContent = t("aiSettingsRefreshBtn");
    const aiFreeLangTitle = document.getElementById("wfm-ai-settings-freelang-title");
    if (aiFreeLangTitle) aiFreeLangTitle.textContent = t("aiSettingsFreeLang");
    const aiFreeSrcLabel = document.getElementById("wfm-ai-free-src-label");
    if (aiFreeSrcLabel) aiFreeSrcLabel.textContent = t("aiSettingsInputLang");
    const aiFreeDstLabel = document.getElementById("wfm-ai-free-dst-label");
    if (aiFreeDstLabel) aiFreeDstLabel.textContent = t("aiSettingsOutputLang");
    const aiSaveBtn = document.getElementById("wfm-ai-settings-save-btn");
    if (aiSaveBtn) aiSaveBtn.textContent = t("aiSettingsSaveBtn");
    const aiChatImgGenLabel = document.getElementById("wfm-ai-chat-imggen-label-text");
    if (aiChatImgGenLabel) aiChatImgGenLabel.textContent = t("aiChatImgGenToggle");
    const aiChatGenTitle = document.getElementById("wfm-ai-settings-chatgen-title");
    if (aiChatGenTitle) aiChatGenTitle.textContent = t("aiSettingsChatGenTitle");
    const aiChatGenDedicatedLabel = document.getElementById("wfm-ai-chatgen-dedicated-label");
    if (aiChatGenDedicatedLabel) aiChatGenDedicatedLabel.textContent = t("aiSettingsChatGenDedicated");
    const aiChatGenI2ITitle = document.getElementById("wfm-ai-settings-chatgen-i2i-title");
    if (aiChatGenI2ITitle) aiChatGenI2ITitle.textContent = t("aiSettingsChatI2IGenTitle");
    const aiChatGenI2IDedicatedLabel = document.getElementById("wfm-ai-chatgen-i2i-dedicated-label");
    if (aiChatGenI2IDedicatedLabel) aiChatGenI2IDedicatedLabel.textContent = t("aiSettingsChatGenDedicated");
    const aiSkillSel = document.getElementById("wfm-ai-chat-skill-select");
    if (aiSkillSel) {
        const firstOpt = aiSkillSel.querySelector("option[value='']");
        if (firstOpt) firstOpt.textContent = `-- ${t("aiSkillNone")} --`;
    }
    const aiSkillManageBtn = document.getElementById("wfm-ai-chat-skill-manage-btn");
    if (aiSkillManageBtn) aiSkillManageBtn.title = t("aiSkillManageBtnTitle");
    const aiSkillPanelTitle = document.querySelector(".wfm-ai-skill-panel-title");
    if (aiSkillPanelTitle) aiSkillPanelTitle.textContent = t("aiSkillPanelTitle");
    const aiSkillNewBtn = document.getElementById("wfm-ai-skill-new-btn");
    if (aiSkillNewBtn) aiSkillNewBtn.textContent = t("aiSkillNewBtn");
    const aiSkillContentTA = document.getElementById("wfm-ai-skill-editor-content");
    if (aiSkillContentTA) aiSkillContentTA.placeholder = t("aiSkillContentPlaceholder");

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
        "wfm-help-gen-11": "helpGen11", "wfm-help-gen-12": "helpGen12",
        "wfm-help-gen-13": "helpGen13", "wfm-help-gen-14": "helpGen14",
        "wfm-help-gen-15": "helpGen15", "wfm-help-gen-16": "helpGen16",
        "wfm-help-gen-17": "helpGen17", "wfm-help-gen-18": "helpGen18",
        "wfm-help-gen-19": "helpGen19",
        "wfm-help-gen-20": "helpGen20", "wfm-help-gen-21": "helpGen21",
        "wfm-help-gen-22": "helpGen22", "wfm-help-gen-23": "helpGen23",
        "wfm-help-gen-24": "helpGen24", "wfm-help-gen-25": "helpGen25",
        "wfm-help-gen-26": "helpGen26",
        "wfm-help-feeder-title": "helpFeederTitle",
        "wfm-help-feeder-desc": "helpFeederDesc",
        "wfm-help-feeder-imgloop-title": "helpFeederImgloopTitle",
        "wfm-help-feeder-imgloop-desc": "helpFeederImgloopDesc",
        "wfm-help-feeder-1": "helpFeeder1", "wfm-help-feeder-2": "helpFeeder2",
        "wfm-help-feeder-3": "helpFeeder3", "wfm-help-feeder-4": "helpFeeder4",
        "wfm-help-feeder-5": "helpFeeder5", "wfm-help-feeder-6": "helpFeeder6",
        "wfm-help-feeder-7": "helpFeeder7", "wfm-help-feeder-8": "helpFeeder8",
        "wfm-help-feeder-9": "helpFeeder9",
        "wfm-help-feeder-gal-title": "helpFeederGalTitle",
        "wfm-help-feeder-gal-desc": "helpFeederGalDesc",
        "wfm-help-feeder-gal-1": "helpFeederGal1", "wfm-help-feeder-gal-2": "helpFeederGal2",
        "wfm-help-feeder-gal-3": "helpFeederGal3", "wfm-help-feeder-gal-4": "helpFeederGal4",
        "wfm-help-feeder-gal-5": "helpFeederGal5", "wfm-help-feeder-gal-6": "helpFeederGal6",
        "wfm-help-lab-title": "helpLabTitle",
        "wfm-help-lab-desc": "helpLabDesc",
        "wfm-help-lab-card-columns-title": "helpLabCardColumnsTitle",
        "wfm-help-lab-1": "helpLab1", "wfm-help-lab-2": "helpLab2",
        "wfm-help-lab-3": "helpLab3", "wfm-help-lab-4": "helpLab4",
        "wfm-help-lab-5": "helpLab5", "wfm-help-lab-6": "helpLab6",
        "wfm-help-lab-7": "helpLab7", "wfm-help-lab-8": "helpLab8",
        "wfm-help-lab-9": "helpLab9", "wfm-help-lab-10": "helpLab10",
        "wfm-help-lab-card-plan-title": "helpLabCardPlanTitle",
        "wfm-help-lab-plan-1": "helpLabPlan1", "wfm-help-lab-plan-2": "helpLabPlan2",
        "wfm-help-lab-plan-3": "helpLabPlan3", "wfm-help-lab-plan-4": "helpLabPlan4",
        "wfm-help-lab-plan-5": "helpLabPlan5", "wfm-help-lab-plan-6": "helpLabPlan6",
        "wfm-help-lab-plan-7": "helpLabPlan7", "wfm-help-lab-plan-8": "helpLabPlan8",
        "wfm-help-lab-plan-9": "helpLabPlan9", "wfm-help-lab-plan-10": "helpLabPlan10",
        "wfm-help-lab-plan-11": "helpLabPlan11",
        "wfm-help-lab-card-results-title": "helpLabCardResultsTitle",
        "wfm-help-lab-results-1": "helpLabResults1", "wfm-help-lab-results-2": "helpLabResults2",
        "wfm-help-lab-results-3": "helpLabResults3",
        "wfm-help-prompt-1": "helpPrompt1", "wfm-help-prompt-2": "helpPrompt2",
        "wfm-help-prompt-3": "helpPrompt3", "wfm-help-prompt-4": "helpPrompt4",
        "wfm-help-prompt-5": "helpPrompt5", "wfm-help-prompt-6": "helpPrompt6",
        "wfm-help-prompt-7": "helpPrompt7", "wfm-help-prompt-8": "helpPrompt8",
        "wfm-help-prompt-9": "helpPrompt9",
        "wfm-help-prompt-card-style-title": "helpPromptCardStyleTitle",
        "wfm-help-prompt-10": "helpPrompt10", "wfm-help-prompt-11": "helpPrompt11",
        "wfm-help-prompt-12": "helpPrompt12", "wfm-help-prompt-13": "helpPrompt13",
        "wfm-help-prompt-14": "helpPrompt14",
        "wfm-help-settings-1": "helpSettings1", "wfm-help-settings-2": "helpSettings2",
        "wfm-help-settings-3": "helpSettings3", "wfm-help-settings-4": "helpSettings4",
        "wfm-help-settings-5": "helpSettings5", "wfm-help-settings-6": "helpSettings6",
        "wfm-help-settings-7": "helpSettings7", "wfm-help-settings-8": "helpSettings8",
        "wfm-help-settings-9": "helpSettings9", "wfm-help-settings-10": "helpSettings10",
        "wfm-help-settings-11": "helpSettings11", "wfm-help-settings-12": "helpSettings12",
        "wfm-help-settings-13": "helpSettings13",
        "wfm-help-nodes-1": "helpNodes1", "wfm-help-nodes-2": "helpNodes2",
        "wfm-help-nodes-3": "helpNodes3", "wfm-help-nodes-4": "helpNodes4",
        "wfm-help-nodes-5": "helpNodes5", "wfm-help-nodes-6": "helpNodes6",
        "wfm-help-nodes-7": "helpNodes7",
        "wfm-help-models-1": "helpModels1", "wfm-help-models-2": "helpModels2",
        "wfm-help-models-3": "helpModels3", "wfm-help-models-4": "helpModels4",
        "wfm-help-models-5": "helpModels5", "wfm-help-models-6": "helpModels6",
        "wfm-help-models-7": "helpModels7", "wfm-help-models-8": "helpModels8",
        "wfm-help-models-9": "helpModels9", "wfm-help-models-10": "helpModels10",
        "wfm-help-models-11": "helpModels11", "wfm-help-models-12": "helpModels12",
        "wfm-help-gallery-title": "helpGalleryTitle",
        "wfm-help-gallery-1": "helpGallery1", "wfm-help-gallery-2": "helpGallery2",
        "wfm-help-gallery-3": "helpGallery3", "wfm-help-gallery-4": "helpGallery4",
        "wfm-help-gallery-5": "helpGallery5", "wfm-help-gallery-6": "helpGallery6",
        "wfm-help-gallery-7": "helpGallery7", "wfm-help-gallery-8": "helpGallery8",
        "wfm-help-gallery-9": "helpGallery9", "wfm-help-gallery-10": "helpGallery10",
        "wfm-help-gallery-11": "helpGallery11", "wfm-help-gallery-12": "helpGallery12",
        "wfm-help-gallery-13": "helpGallery13", "wfm-help-gallery-14": "helpGallery14",
        "wfm-help-gallery-15": "helpGallery15", "wfm-help-gallery-16": "helpGallery16",
        "wfm-help-gallery-17": "helpGallery17",
        "wfm-help-gallery-18": "helpGallery18", "wfm-help-gallery-19": "helpGallery19",
        "wfm-help-gallery-20": "helpGallery20", "wfm-help-gallery-21": "helpGallery21",
        "wfm-help-gallery-22": "helpGallery22", "wfm-help-gallery-23": "helpGallery23",
        "wfm-help-gallery-24": "helpGallery24", "wfm-help-gallery-25": "helpGallery25",
        "wfm-help-gallery-card-styleprompt-title": "helpGalleryCardStyleprompt",
        "wfm-help-gallery-card-stylecatalog-title": "helpGalleryCardStylecatalog",
        "wfm-help-tagger-title": "helpTaggerTitle",
        "wfm-help-tagger-1": "helpTagger1", "wfm-help-tagger-2": "helpTagger2",
        "wfm-help-tagger-3": "helpTagger3", "wfm-help-tagger-4": "helpTagger4",
        "wfm-help-tagger-5": "helpTagger5", "wfm-help-tagger-6": "helpTagger6",
        "wfm-help-tagger-7": "helpTagger7", "wfm-help-tagger-8": "helpTagger8",
        "wfm-help-tagger-9": "helpTagger9",
        "wfm-help-sidepanel-title": "helpSidepanelTitle",
        "wfm-help-sidepanel-1": "helpSidepanel1", "wfm-help-sidepanel-2": "helpSidepanel2",
        "wfm-help-sidepanel-3": "helpSidepanel3", "wfm-help-sidepanel-4": "helpSidepanel4",
        "wfm-help-sidepanel-5": "helpSidepanel5", "wfm-help-sidepanel-6": "helpSidepanel6",
        "wfm-help-sidepanel-7": "helpSidepanel7", "wfm-help-sidepanel-8": "helpSidepanel8",
        "wfm-help-sidepanel-9": "helpSidepanel9", "wfm-help-sidepanel-10": "helpSidepanel10",
        "wfm-help-sidepanel-11": "helpSidepanel11", "wfm-help-sidepanel-12": "helpSidepanel12",
        "wfm-help-sidepanel-13": "helpSidepanel13",
        "wfm-help-sidepanel-14": "helpSidepanel14", "wfm-help-sidepanel-15": "helpSidepanel15",
        "wfm-help-sidepanel-16": "helpSidepanel16",
        "wfm-help-sidepanel-17": "helpSidepanel17",
        "wfm-help-ai-title": "helpAiTitle",
        "wfm-help-ai-1": "helpAi1", "wfm-help-ai-2": "helpAi2", "wfm-help-ai-3": "helpAi3",
        "wfm-help-ai-4": "helpAi4", "wfm-help-ai-6": "helpAi6",
        "wfm-help-ai-7": "helpAi7",
        "wfm-help-ai-8": "helpAi8",
        "wfm-help-ai-9": "helpAi9",
        "wfm-help-ai-card-layout-title": "helpAiCardLayout",
        "wfm-help-ai-card-translate-title": "helpAiCardTranslate",
        "wfm-help-ai-card-chat-title": "helpAiCardChat",
        "wfm-help-ai-card-svg-title": "helpAiCardSvg",
        "wfm-help-ai-card-skills-title": "helpAiCardSkills",
        "wfm-help-ai-card-skilltips-title": "helpAiCardSkillTips",
        "wfm-help-ai-card-tools-title": "helpAiCardTools",
        "wfm-help-ai-card-settings-title": "helpAiCardSettings",
        "wfm-help-imageedit-title": "helpImageEditTitle",
        "wfm-help-imageedit-tools-title": "helpImageEditToolsTitle",
        "wfm-help-imageedit-layer-title": "helpImageEditLayerTitle",
        "wfm-help-imageedit-text-title": "helpImageEditTextTitle",
        "wfm-help-imageedit-export-title": "helpImageEditExportTitle",
        "wfm-help-imageedit-kbd-title": "helpImageEditKbdTitle",
        "wfm-help-imageedit-1": "helpImageEdit1", "wfm-help-imageedit-2": "helpImageEdit2", "wfm-help-imageedit-3": "helpImageEdit3",
        "wfm-help-imageedit-4": "helpImageEdit4", "wfm-help-imageedit-5": "helpImageEdit5",
        "wfm-help-imageedit-6": "helpImageEdit6", "wfm-help-imageedit-7": "helpImageEdit7",
        "wfm-help-imageedit-8": "helpImageEdit8", "wfm-help-imageedit-9": "helpImageEdit9",
        "wfm-help-imageedit-10": "helpImageEdit10", "wfm-help-imageedit-11": "helpImageEdit11",
        "wfm-help-imageedit-12": "helpImageEdit12", "wfm-help-imageedit-13": "helpImageEdit13",
        "wfm-help-imageedit-14": "helpImageEdit14", "wfm-help-imageedit-15": "helpImageEdit15",
        "wfm-help-imageedit-16": "helpImageEdit16", "wfm-help-imageedit-17": "helpImageEdit17",
        "wfm-help-imageedit-18": "helpImageEdit18", "wfm-help-imageedit-19": "helpImageEdit19",
        "wfm-help-imageedit-20": "helpImageEdit20", "wfm-help-imageedit-21": "helpImageEdit21",
        "wfm-help-imageedit-22": "helpImageEdit22", "wfm-help-imageedit-23": "helpImageEdit23",
        "wfm-help-imageedit-24": "helpImageEdit24", "wfm-help-imageedit-25": "helpImageEdit25",
        "wfm-help-imageedit-26": "helpImageEdit26", "wfm-help-imageedit-27": "helpImageEdit27",
        "wfm-help-imageedit-28": "helpImageEdit28", "wfm-help-imageedit-29": "helpImageEdit29",
        "wfm-help-imageedit-30": "helpImageEdit30",
        "wfm-help-imageedit-7b": "helpImageEdit7b", "wfm-help-imageedit-7c": "helpImageEdit7c",
        "wfm-help-imageedit-7d": "helpImageEdit7d", "wfm-help-imageedit-7e": "helpImageEdit7e",
        "wfm-help-imageedit-8b": "helpImageEdit8b",
        "wfm-help-imageedit-blur-title": "helpImageEditBlurTitle",
        "wfm-help-imageedit-blur-1": "helpImageEditBlur1", "wfm-help-imageedit-blur-2": "helpImageEditBlur2",
        "wfm-help-imageedit-blur-3": "helpImageEditBlur3", "wfm-help-imageedit-blur-4": "helpImageEditBlur4",
        "wfm-help-imageedit-blur-5": "helpImageEditBlur5", "wfm-help-imageedit-blur-6": "helpImageEditBlur6",
        "wfm-help-imageedit-bgremove-title": "helpImageEditBgRemoveTitle",
        "wfm-help-imageedit-bgremove-1": "helpImageEditBgRemove1", "wfm-help-imageedit-bgremove-2": "helpImageEditBgRemove2",
        "wfm-help-imageedit-bgremove-3": "helpImageEditBgRemove3", "wfm-help-imageedit-bgremove-4": "helpImageEditBgRemove4",
        "wfm-help-imageedit-bgremove-5": "helpImageEditBgRemove5",
        "wfm-help-imageedit-mask-title": "helpImageEditMaskTitle",
        "wfm-help-imageedit-mask-1": "helpImageEditMask1", "wfm-help-imageedit-mask-2": "helpImageEditMask2",
        "wfm-help-imageedit-mask-3": "helpImageEditMask3", "wfm-help-imageedit-mask-4": "helpImageEditMask4",
        "wfm-help-imageedit-mask-5": "helpImageEditMask5", "wfm-help-imageedit-mask-6": "helpImageEditMask6",
        "wfm-help-imageedit-mask-7": "helpImageEditMask7", "wfm-help-imageedit-mask-8": "helpImageEditMask8",
        "wfm-help-imageedit-mask-9": "helpImageEditMask9", "wfm-help-imageedit-mask-10": "helpImageEditMask10",
        "wfm-help-imageedit-mask-11": "helpImageEditMask11", "wfm-help-imageedit-mask-12": "helpImageEditMask12",
        "wfm-help-imageedit-mask-13": "helpImageEditMask13",
        "wfm-help-imageedit-gmic-title": "helpImageEditGmicTitle",
        "wfm-help-imageedit-gmic-1": "helpImageEditGmic1", "wfm-help-imageedit-gmic-2": "helpImageEditGmic2",
        "wfm-help-imageedit-gmic-3": "helpImageEditGmic3", "wfm-help-imageedit-gmic-4": "helpImageEditGmic4",
        "wfm-help-imageedit-gmic-install-title": "helpImageEditGmicInstallTitle",
        "wfm-help-imageedit-gmic-install-1": "helpImageEditGmicInstall1",
        "wfm-help-imageedit-gmic-install-2": "helpImageEditGmicInstall2",
        "wfm-help-imageedit-gmic-install-3": "helpImageEditGmicInstall3",
        "wfm-help-imageedit-tabkbd-title": "helpImageEditTabKbdTitle",
        "wfm-help-imageedit-tabkbd-1": "helpImageEdit22", "wfm-help-imageedit-tabkbd-2": "helpImageEdit23",
        "wfm-help-imageedit-tabkbd-3": "helpImageEdit24", "wfm-help-imageedit-tabkbd-4": "helpImageEdit25",
        "wfm-help-imageedit-tabkbd-5": "helpImageEdit26", "wfm-help-imageedit-tabkbd-6": "helpImageEdit27",
        "wfm-help-imageedit-tabkbd-7": "helpImageEdit28", "wfm-help-imageedit-tabkbd-8": "helpImageEdit29",
        "wfm-help-shortcuts-title": "helpShortcutsTitle",
        "wfm-help-shortcuts-1": "helpShortcuts1", "wfm-help-shortcuts-2": "helpShortcuts2",
        "wfm-help-shortcuts-3": "helpShortcuts3", "wfm-help-shortcuts-4": "helpShortcuts4",
        "wfm-help-trouble-title": "helpTroubleTitle",
        "wfm-help-trouble-1": "helpTrouble1", "wfm-help-trouble-2": "helpTrouble2",
        "wfm-help-trouble-3": "helpTrouble3", "wfm-help-trouble-4": "helpTrouble4",
        "wfm-help-trouble-5": "helpTrouble5", "wfm-help-trouble-6": "helpTrouble6",
        "wfm-help-trouble-7": "helpTrouble7", "wfm-help-trouble-8": "helpTrouble8",
        "wfm-help-trouble-9": "helpTrouble9",
        "wfm-help-support-title": "helpSupportTitle",
        "wfm-help-support-desc": "helpSupportDesc",
        "wfm-help-github-desc": "helpGithubDesc",
        "wfm-help-kofi-desc": "helpKofiDesc",
        "wfm-help-thanks": "helpThanks",
        // -- Help card headings (card-based redesign) --
        "wfm-help-about-card-getting-started-title": "helpAboutCardGettingStarted",
        "wfm-help-wf-title": "helpWfTitle",
        "wfm-help-wf-card-browse-title": "helpWfCardBrowse",
        "wfm-help-wf-card-groups-title": "helpWfCardGroups",
        "wfm-help-wf-card-panel-title": "helpWfCardPanel",
        "wfm-help-gen-title": "helpGenTitle",
        "wfm-help-gen-card-connect-title": "helpGenCardConnect",
        "wfm-help-gen-card-tabs-title": "helpGenCardTabs",
        "wfm-help-gen-card-seed-title": "helpGenCardSeed",
        "wfm-help-gen-card-batchsetup-title": "helpGenCardBatchSetup",
        "wfm-help-gen-card-batchtypes-title": "helpGenCardBatchTypes",
        "wfm-help-gen-card-lora-title": "helpGenCardLora",
        "wfm-help-prompt-title": "helpPromptTitle",
        "wfm-help-prompt-card-ai-title": "helpPromptCardAi",
        "wfm-help-prompt-card-presets-title": "helpPromptCardPresets",
        "wfm-help-prompt-card-wildcards-title": "helpPromptCardWildcards",
        "wfm-help-metadata-card-overview-title": "helpMetadataCardOverview",
        "wfm-help-metadata-card-extracted-title": "helpMetadataCardExtracted",
        "wfm-help-metadata-card-formats-title": "helpMetadataCardFormats",
        "wfm-help-settings-title": "helpSettingsTitle",
        "wfm-help-settings-card-general-title": "helpSettingsCardGeneral",
        "wfm-help-settings-card-connections-title": "helpSettingsCardConnections",
        "wfm-help-settings-card-workflow-title": "helpSettingsCardWorkflow",
        "wfm-help-settings-card-editor-title": "helpSettingsCardEditor",
        "wfm-help-settings-card-misc-title": "helpSettingsCardMisc",
        "wfm-help-nodes-title": "helpNodesTitle",
        "wfm-help-nodes-card-browse-title": "helpNodesCardBrowse",
        "wfm-help-nodes-card-groups-title": "helpNodesCardGroups",
        "wfm-help-nodes-card-panel-title": "helpNodesCardPanel",
        "wfm-help-gallery-card-browse-title": "helpGalleryCardBrowse",
        "wfm-help-gallery-card-folder-title": "helpGalleryCardFolder",
        "wfm-help-gallery-card-detail-title": "helpGalleryCardDetail",
        "wfm-help-gallery-card-actions-title": "helpGalleryCardActions",
        "wfm-help-gallery-card-formats-title": "helpGalleryCardFormats",
        "wfm-help-models-title": "helpModelsTitle",
        "wfm-help-models-card-browse-title": "helpModelsCardBrowse",
        "wfm-help-models-card-civitai-title": "helpModelsCardCivitai",
        "wfm-help-models-card-apply-title": "helpModelsCardApply",
        "wfm-help-models-card-groups-title": "helpModelsCardGroups",
        "wfm-help-models-card-bulk-title": "helpModelsCardBulk",
        "wfm-help-sidepanel-card-tabs-title": "helpSidepanelCardTabs",
        "wfm-help-sidepanel-card-dnd-title": "helpSidepanelCardDnd",
        "wfm-help-sidepanel-card-info-title": "helpSidepanelCardInfo",
        "wfm-help-sidepanel-card-ai-title": "helpSidepanelCardAi",
        "wfm-help-sidepanel-card-nav-title": "helpSidepanelCardNav",
        "wfm-help-tagger-card-overview-title": "helpTaggerCardOverview",
        "wfm-help-tagger-card-single-title": "helpTaggerCardSingle",
        "wfm-help-tagger-card-sending-title": "helpTaggerCardSending",
        "wfm-help-tagger-card-batch-title": "helpTaggerCardBatch",
        "wfm-help-imageedit-card-overview-title": "helpImageEditCardOverview",
        "wfm-help-shortcuts-card-general-title": "helpShortcutsCardGeneral",
        "wfm-help-trouble-card-connection-title": "helpTroubleCardConnection",
        "wfm-help-trouble-card-workflow-title": "helpTroubleCardWorkflow",
        "wfm-help-trouble-card-tagger-title": "helpTroubleCardTagger",
    };
    for (const [id, key] of Object.entries(helpIdMap)) {
        const el = document.getElementById(id);
        if (el) el.textContent = t(key);
    }

    // Search box placeholder
    const helpSearch = document.getElementById("wfm-help-search");
    if (helpSearch) {
        helpSearch.placeholder = t("helpSearchPlaceholder");
        helpSearch.addEventListener("input", _onHelpSearch);
    }

    // Jump-to-tab buttons
    document.querySelectorAll(".wfm-help-jump-btn").forEach((btn) => {
        btn.textContent = t("helpJumpToTab");
    });
}

function _onHelpSearch(e) {
    const q = e.target.value.trim().toLowerCase();
    const navItems = document.querySelectorAll("[data-help-page]");
    if (!q) {
        navItems.forEach(btn => btn.classList.remove("search-hidden"));
        return;
    }

    const matchedPages = new Set();
    document.querySelectorAll(".wfm-help-page").forEach(page => {
        const pageId = page.id.replace("wfm-help-page-", "");
        if (page.textContent.toLowerCase().includes(q)) matchedPages.add(pageId);
    });

    let firstBtn = null;
    navItems.forEach(btn => {
        const pageId = btn.dataset.helpPage;
        if (matchedPages.has(pageId)) {
            btn.classList.remove("search-hidden");
            if (!firstBtn) firstBtn = btn;
        } else {
            btn.classList.add("search-hidden");
        }
    });

    if (firstBtn && !firstBtn.classList.contains("active")) firstBtn.click();
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
import { initSettingsTab, applyTheme, getSavedTheme, applyTextareaFontSize, applyJsonColors } from "./settings-tab.js";
import { initModelsTab } from "./models-tab.js";
import { initGalleryTab } from "./gallery-tab.js";
import { initMetadataTab } from "./metadata-tab.js";
import { initAiTab } from "./ai-tab.js";
import { initTaggerTab } from "./tagger-tab.js";
import { imageEditTab } from "./image-edit-tab.js";

// Apply saved theme immediately to prevent flash of default theme
applyTheme(getSavedTheme());

// Apply saved textarea font size & JSON highlight colors
try {
    const _s = getSettings();
    if (_s.textareaFontSize) applyTextareaFontSize(_s.textareaFontSize);
    applyJsonColors(_s.jsonColors);
} catch {}

function initHelpTab() {
    document.querySelectorAll(".wfm-help-nav-item").forEach((btn) => {
        btn.addEventListener("click", () => {
            const page = btn.dataset.helpPage;
            document.querySelectorAll(".wfm-help-nav-item").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".wfm-help-page").forEach((p) => p.classList.remove("active"));
            document.getElementById(`wfm-help-page-${page}`)?.classList.add("active");
        });
    });

    // Jump-to-tab buttons: switch to the real feature tab this help page documents
    document.querySelectorAll(".wfm-help-jump-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelector(`.wfm-tab[data-tab="${btn.dataset.jumpTab}"]`)?.click();
        });
    });
}

document.addEventListener("DOMContentLoaded", () => {
    applyI18nToHtml();
    initTabs();
    initModal();
    initHelpTab();
    initSettingsTab(); // Settings first (applies saved URL)
    initWorkflowTab();
    initNodesTab();
    initModelsTab();
    initGenerateTab();
    initPromptTab();
    initMetadataTab();
    initGalleryTab();
    initAiTab();
    initTaggerTab();
    imageEditTab.init();

    console.log("Workflow Studio: App initialized");
});

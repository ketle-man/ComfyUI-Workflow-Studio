/**
 * Prompt Tab - orchestrator
 * Wires together the Preset Manager, AI Assistant, Wildcard manager, and Style manager
 * sub-modules and owns only the UI wiring that spans them (center-column and Col3 tab
 * switching). Feature logic lives in:
 *   - prompt-presets.js   Preset CRUD, groups, Preset Manager panel
 *   - prompt-ai-chat.js   Ollama/LM Studio chat, translate, apply to GenerateUI
 *   - prompt-wildcards.js Wildcard file manager
 *   - prompt-styles.js    Style manager (Col3 "Style" tab)
 */

import { initPresetsUI } from "./prompt-presets.js";
import { initAiChatUI } from "./prompt-ai-chat.js";
import { initWildcardsUI } from "./prompt-wildcards.js";
import { initStylesUI } from "./prompt-styles.js";

// Re-exported so prompt-table.js (table view) can keep importing these from
// "./prompt-tab.js" without every caller needing to know the new module split.
export {
    fetchPresets, apiCreatePreset, apiUpdatePreset, apiDeletePreset, loadAllPresets,
    saveGroups, pmGroups, PROMPT_RESERVED_GROUPS, renderPresetManager,
    isInBatchPreset, toggleBatchPreset, clearBatchPresets,
} from "./prompt-presets.js";
export {
    wcFetchFiles, wcFetchContent, wcSaveFile, wcDeleteFile, wcRefreshFiles,
} from "./prompt-wildcards.js";
export {
    styleFetchList, styleApiCreate, styleApiUpdate, styleApiDelete, styleRefreshList,
} from "./prompt-styles.js";

// ============================================
// Initialize
// ============================================

export function initPromptTab() {
    initAiChatUI();
    initPresetsUI();

    // ── Center column tab switching ──────────────────────────
    document.querySelectorAll(".wfm-prompt-center-tab").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.ptab;
            document.querySelectorAll(".wfm-prompt-center-tab").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".wfm-prompt-center-pane").forEach(p => {
                p.style.display = p.id === `wfm-ptab-${target}` ? "" : "none";
            });
        });
    });

    initWildcardsUI();

    // ── Col3タブ切り替え (Wildcard / Style) ────────────────────
    document.querySelectorAll(".wfm-prompt-col3-tab[data-col3tab]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-prompt-col3-tab[data-col3tab]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const tabId = btn.dataset.col3tab;
            document.querySelectorAll(".wfm-prompt-col3-tab-content").forEach(c => { c.style.display = "none"; });
            const content = document.getElementById(`wfm-col3-tab-${tabId}`);
            if (content) content.style.display = "";
        });
    });

    initStylesUI();
}

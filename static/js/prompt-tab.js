/**
 * Prompt Tab - Ollama AI Assistant + Prompt Presets + Preset Manager
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";

// ============================================
// State
// ============================================

const ollamaState = {
    chatHistory: [],
    attachedImage: null,
};

// Preset data (loaded from API, with localStorage migration)
let promptPresets = [];
let pmActiveTab = "all";       // "all" | "favorites" | "groups"
let pmSearchText = "";
let pmSelectedId = null;       // currently selected preset id
let pmGroups = {};             // { groupName: [presetId, ...] }
const PM_GROUPS_KEY = "wfm_prompt_preset_groups";

// ============================================
// Preset API helpers
// ============================================

async function fetchPresets() {
    try {
        const res = await fetch("/api/wfm/prompts");
        return res.ok ? await res.json() : [];
    } catch { return []; }
}

async function apiCreatePreset(data) {
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

async function apiUpdatePreset(id, updates) {
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

async function apiDeletePreset(id) {
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
                category: "",
                tags: [],
                favorite: false,
            });
            // Note: negText is stored separately - we combine it
            if (p.negText) {
                // Create a separate entry for negative prompt reference
                // or store in the text field with marker
            }
        }
        localStorage.removeItem(PRESETS_KEY);
    } catch { /* ignore migration errors */ }
}

// ============================================
// Preset data management
// ============================================

async function loadAllPresets() {
    await migrateLocalStoragePresets();
    promptPresets = await fetchPresets();

    // Load groups from localStorage
    try {
        pmGroups = JSON.parse(localStorage.getItem(PM_GROUPS_KEY) || "{}");
    } catch { pmGroups = {}; }

    // Clean stale entries from groups
    const validIds = new Set(promptPresets.map(p => p.id));
    for (const g of Object.keys(pmGroups)) {
        pmGroups[g] = (pmGroups[g] || []).filter(id => validIds.has(id));
        if (pmGroups[g].length === 0) delete pmGroups[g];
    }
    saveGroups();

    renderPresetSelect();
    renderGroupSelect();
    renderPresetManager();
}

function saveGroups() {
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

function esc(s) {
    return s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
}

function renderPresetManager() {
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

function createPmItem(preset) {
    const el = document.createElement("div");
    el.className = "wfm-pm-item" + (pmSelectedId === preset.id ? " active" : "");

    const previewText = (preset.text || "").length > 50
        ? preset.text.substring(0, 50) + "..."
        : (preset.text || "");

    const catBadge = preset.category
        ? `<span style="font-size:9px;color:var(--wfm-primary);margin-left:4px;">[${esc(preset.category)}]</span>`
        : "";

    el.innerHTML = `
        <div class="wfm-pm-item-body">
            <div class="wfm-pm-item-name">${preset.favorite ? '<span style="color:#ffd700;">&#9733;</span> ' : ""}${esc(preset.name)}${catBadge}</div>
            <div class="wfm-pm-item-sub">${esc(previewText)}</div>
        </div>
        <div class="wfm-pm-item-actions">
            <button class="wfm-pm-action-btn pm-fav-btn${preset.favorite ? " fav-active" : ""}" title="Favorite">&#9733;</button>
            <button class="wfm-pm-action-btn pm-del-btn" title="Delete" style="color:var(--wfm-danger);">&#10005;</button>
        </div>
    `;

    // Click to select in editor
    el.addEventListener("click", (e) => {
        if (e.target.closest(".wfm-pm-item-actions")) return;
        selectPresetInEditor(preset);
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
            removeBtn.textContent = "\u2796";
            removeBtn.style.fontSize = "10px";
            removeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                pmGroups[groupName] = pmGroups[groupName].filter(id => id !== p.id);
                if (pmGroups[groupName].length === 0) delete pmGroups[groupName];
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
// Ollama API helpers
// ============================================

async function ollamaModels() {
    const res = await fetch("/api/wfm/ollama/models");
    return await res.json();
}

async function ollamaTest() {
    const res = await fetch("/api/wfm/ollama/test", { method: "POST" });
    return await res.json();
}

async function ollamaChat(model, messages) {
    const res = await fetch("/api/wfm/ollama/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages }),
    });
    return await res.json();
}

// ============================================
// Chat UI
// ============================================

function addChatMessage(role, content) {
    const chat = document.getElementById("wfm-ollama-chat");
    if (!chat) return;

    const welcome = chat.querySelector(".wfm-ollama-welcome");
    if (welcome) welcome.remove();

    const msg = document.createElement("div");
    msg.className = `wfm-ollama-msg ${role}`;

    const roleLabel = document.createElement("div");
    roleLabel.className = "wfm-ollama-msg-role";
    roleLabel.textContent = role === "user" ? t("you") : "AI";
    msg.appendChild(roleLabel);

    const contentDiv = document.createElement("div");
    contentDiv.className = "wfm-ollama-msg-content";
    contentDiv.textContent = content;
    msg.appendChild(contentDiv);

    // Apply button for assistant messages
    if (role === "assistant") {
        const applyRow = document.createElement("div");
        applyRow.className = "wfm-ollama-apply-row";

        const applyBtn = document.createElement("button");
        applyBtn.className = "wfm-btn wfm-btn-sm wfm-btn-primary";
        applyBtn.textContent = t("applyToGenerateUI");
        applyBtn.addEventListener("click", () => applyToGenerateUI(content));
        applyRow.appendChild(applyBtn);

        const copyBtn = document.createElement("button");
        copyBtn.className = "wfm-btn wfm-btn-sm";
        copyBtn.textContent = t("copy");
        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(content).then(() => {
                copyBtn.textContent = t("copied");
                setTimeout(() => { copyBtn.textContent = t("copy"); }, 1500);
            });
        });
        applyRow.appendChild(copyBtn);

        msg.appendChild(applyRow);
    }

    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
}

function clearChat() {
    ollamaState.chatHistory = [];
    ollamaState.attachedImage = null;
    updateAttachmentDisplay();

    const chat = document.getElementById("wfm-ollama-chat");
    if (chat) {
        chat.innerHTML = `
            <div class="wfm-ollama-welcome">
                <p>AI Assistant (Ollama)</p>
                <p>${t("assistantWelcome")}</p>
            </div>
        `;
    }
}

// ============================================
// Image Attachment
// ============================================

function attachFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        ollamaState.attachedImage = { name: file.name, dataUrl: e.target.result };
        updateAttachmentDisplay();
    };
    reader.readAsDataURL(file);
}

function updateAttachmentDisplay() {
    const container = document.getElementById("wfm-ollama-attachments");
    if (!container) return;
    container.innerHTML = "";

    if (!ollamaState.attachedImage) return;

    const item = document.createElement("div");
    item.className = "wfm-ollama-attachment";

    const img = document.createElement("img");
    img.src = ollamaState.attachedImage.dataUrl;
    item.appendChild(img);

    const name = document.createElement("span");
    name.className = "wfm-ollama-attachment-name";
    name.textContent = ollamaState.attachedImage.name;
    item.appendChild(name);

    const removeBtn = document.createElement("button");
    removeBtn.className = "wfm-ollama-attachment-remove";
    removeBtn.textContent = "\u00d7";
    removeBtn.addEventListener("click", () => {
        ollamaState.attachedImage = null;
        updateAttachmentDisplay();
    });
    item.appendChild(removeBtn);

    container.appendChild(item);
}

// ============================================
// Send Message
// ============================================

async function sendMessage() {
    const input = document.getElementById("wfm-ollama-input");
    const modelSelect = document.getElementById("wfm-ollama-model");
    if (!input || !modelSelect) return;

    const message = input.value.trim();
    if (!message) return;

    const model = modelSelect.value;
    if (!model) {
        showToast(t("selectModelFirst"), "error");
        return;
    }

    addChatMessage("user", message);
    input.value = "";

    const userMsg = { role: "user", content: message };
    if (ollamaState.attachedImage) {
        userMsg.images = [ollamaState.attachedImage.dataUrl.split(",")[1]];
    }
    ollamaState.chatHistory.push(userMsg);

    const sendBtn = document.getElementById("wfm-ollama-send-btn");
    if (sendBtn) sendBtn.disabled = true;

    try {
        const data = await ollamaChat(model, ollamaState.chatHistory);
        if (data.status === "success" && data.message) {
            const reply = data.message.content;
            addChatMessage("assistant", reply);
            ollamaState.chatHistory.push({ role: "assistant", content: reply });
            ollamaState.attachedImage = null;
            updateAttachmentDisplay();
        } else {
            showToast(t("error") + ": " + (data.error || data.message || "No response"), "error");
        }
    } catch (err) {
        showToast(t("error") + ": " + err.message, "error");
    } finally {
        if (sendBtn) sendBtn.disabled = false;
    }
}

// ============================================
// Translation
// ============================================

async function sendTranslate(direction) {
    const input = document.getElementById("wfm-ollama-input");
    const modelSelect = document.getElementById("wfm-ollama-model");
    if (!input || !modelSelect) return;

    const text = input.value.trim();
    if (!text) return;

    const model = modelSelect.value;
    if (!model) {
        showToast(t("selectModelFirst"), "error");
        return;
    }

    const labels = { ja2en: "JA\u2192EN", en2ja: "EN\u2192JA", zh2en: "ZH\u2192EN", en2zh: "EN\u2192ZH" };
    addChatMessage("user", `[${labels[direction] || direction}]\n${text}`);
    input.value = "";

    const btns = ["wfm-ollama-send-btn", "wfm-ollama-ja2en-btn", "wfm-ollama-en2ja-btn", "wfm-ollama-zh2en-btn", "wfm-ollama-en2zh-btn"]
        .map((id) => document.getElementById(id));
    btns.forEach((b) => { if (b) b.disabled = true; });

    try {
        const prompts = {
            ja2en: `Translate the following Japanese text into English. Output only the translated text, nothing else.\n\n${text}`,
            en2ja: `\u4ee5\u4e0b\u306e\u82f1\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3092\u65e5\u672c\u8a9e\u306b\u7ffb\u8a33\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u7ffb\u8a33\u7d50\u679c\u306e\u307f\u3092\u51fa\u529b\u3057\u3001\u4ed6\u306e\u8aac\u660e\u306f\u4e0d\u8981\u3067\u3059\u3002\n\n${text}`,
            zh2en: `Translate the following Chinese text into English. Output only the translated text, nothing else.\n\n${text}`,
            en2zh: `\u8bf7\u5c06\u4ee5\u4e0b\u82f1\u6587\u7ffb\u8bd1\u6210\u4e2d\u6587\u3002\u53ea\u8f93\u51fa\u7ffb\u8bd1\u7ed3\u679c\uff0c\u4e0d\u9700\u8981\u5176\u4ed6\u8bf4\u660e\u3002\n\n${text}`,
        };
        const prompt = prompts[direction];

        const data = await ollamaChat(model, [{ role: "user", content: prompt }]);
        if (data.status === "success" && data.message) {
            addChatMessage("assistant", data.message.content);
        } else {
            showToast(t("error") + ": No response", "error");
        }
    } catch (err) {
        showToast(t("error") + ": " + err.message, "error");
    } finally {
        btns.forEach((b) => { if (b) b.disabled = false; });
    }
}

// ============================================
// Apply to GenerateUI
// ============================================

function applyToGenerateUI(text) {
    const textareas = document.querySelectorAll("#wfm-gen-prompt-fields textarea");
    if (textareas.length === 0) {
        showToast(t("noPromptFields"), "error");
        return;
    }
    textareas[0].value = text;
    textareas[0].dispatchEvent(new Event("input", { bubbles: true }));
    textareas[0].dispatchEvent(new Event("change", { bubbles: true }));
    showToast(t("appliedToGenerateUI"), "success");
}

// ============================================
// Initialize
// ============================================

export function initPromptTab() {
    // Ollama model refresh
    async function refreshModels() {
        const select = document.getElementById("wfm-ollama-model");
        const status = document.getElementById("wfm-ollama-status");
        try {
            const data = await ollamaModels();
            if (data.status === "success" && data.models) {
                select.innerHTML = data.models
                    .map((m) => `<option value="${m.name}">${m.name}</option>`)
                    .join("");
                if (status) {
                    status.textContent = `${data.models.length} models`;
                    status.className = "wfm-ollama-status connected";
                }
            }
        } catch {
            if (status) {
                status.textContent = t("failedConnect");
                status.className = "wfm-ollama-status error";
            }
        }
    }

    // Auto-load models on init
    refreshModels();

    document.getElementById("wfm-ollama-refresh-btn")?.addEventListener("click", refreshModels);

    // Test connection
    document.getElementById("wfm-ollama-test-btn")?.addEventListener("click", async () => {
        const status = document.getElementById("wfm-ollama-status");
        if (status) { status.textContent = "Testing..."; status.className = "wfm-ollama-status"; }
        try {
            const data = await ollamaTest();
            if (data.connected) {
                if (status) { status.textContent = t("connected"); status.className = "wfm-ollama-status connected"; }
                await refreshModels();
            } else {
                if (status) { status.textContent = t("failedConnect"); status.className = "wfm-ollama-status error"; }
            }
        } catch {
            if (status) { status.textContent = t("error"); status.className = "wfm-ollama-status error"; }
        }
    });

    // Send message
    document.getElementById("wfm-ollama-send-btn")?.addEventListener("click", sendMessage);

    // Enter to send
    document.getElementById("wfm-ollama-input")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Clear chat
    document.getElementById("wfm-ollama-clear-btn")?.addEventListener("click", clearChat);

    // File attachment
    const fileInput = document.getElementById("wfm-ollama-file-input");
    document.getElementById("wfm-ollama-attach-btn")?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
            attachFile(fileInput.files[0]);
            fileInput.value = "";
        }
    });

    // Translation
    document.getElementById("wfm-ollama-ja2en-btn")?.addEventListener("click", () => sendTranslate("ja2en"));
    document.getElementById("wfm-ollama-en2ja-btn")?.addEventListener("click", () => sendTranslate("en2ja"));
    document.getElementById("wfm-ollama-zh2en-btn")?.addEventListener("click", () => sendTranslate("zh2en"));
    document.getElementById("wfm-ollama-en2zh-btn")?.addEventListener("click", () => sendTranslate("en2zh"));

    // --- Presets (API-based) ---
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
                pmSelectedId = created.id;
                showToast(t("presetSaved"), "success");
            }
        }

        renderPresetSelect();
        renderPresetManager();

        // Re-select
        if (pmSelectedId && presetSelect) {
            presetSelect.value = pmSelectedId;
        }
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
            showToast("Group already exists", "error");
            return;
        }
        pmGroups[key] = [];
        saveGroups();
        renderPresetManager();
        showToast(`Group "${key}" created`, "success");
    });

    document.getElementById("wfm-preset-add-to-group-btn")?.addEventListener("click", () => {
        const groupSelect = document.getElementById("wfm-preset-group-select");
        const groupName = groupSelect?.value;
        if (!groupName) {
            showToast("Select a group first", "error");
            return;
        }
        const id = presetSelect?.value;
        if (!id) {
            showToast("Select a preset first", "error");
            return;
        }
        if (!pmGroups[groupName]) pmGroups[groupName] = [];
        if (pmGroups[groupName].includes(id)) {
            showToast("Already in this group", "info");
            return;
        }
        pmGroups[groupName].push(id);
        saveGroups();
        renderPresetManager();
        showToast("Added to group", "success");
    });

    document.getElementById("wfm-preset-del-group-btn")?.addEventListener("click", () => {
        const groupSelect = document.getElementById("wfm-preset-group-select");
        const groupName = groupSelect?.value;
        if (!groupName) {
            showToast("Select a group first", "error");
            return;
        }
        if (!confirm(`Delete group "${groupName}"?`)) return;
        delete pmGroups[groupName];
        saveGroups();
        renderPresetManager();
        showToast(`Group "${groupName}" deleted`, "success");
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
}

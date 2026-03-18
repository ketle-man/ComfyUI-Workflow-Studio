/**
 * Prompt Tab - Ollama AI Assistant + Prompt Presets
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

const PRESETS_KEY = "wfm_prompt_presets";

let promptPresets = [];

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

    const labels = { ja2en: "JA→EN", en2ja: "EN→JA", zh2en: "ZH→EN", en2zh: "EN→ZH" };
    addChatMessage("user", `[${labels[direction] || direction}]\n${text}`);
    input.value = "";

    const btns = ["wfm-ollama-send-btn", "wfm-ollama-ja2en-btn", "wfm-ollama-en2ja-btn", "wfm-ollama-zh2en-btn", "wfm-ollama-en2zh-btn"]
        .map((id) => document.getElementById(id));
    btns.forEach((b) => { if (b) b.disabled = true; });

    try {
        const prompts = {
            ja2en: `Translate the following Japanese text into English. Output only the translated text, nothing else.\n\n${text}`,
            en2ja: `以下の英語のテキストを日本語に翻訳してください。翻訳結果のみを出力し、他の説明は不要です。\n\n${text}`,
            zh2en: `Translate the following Chinese text into English. Output only the translated text, nothing else.\n\n${text}`,
            en2zh: `请将以下英文翻译成中文。只输出翻译结果，不需要其他说明。\n\n${text}`,
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
// Presets
// ============================================

function loadPresets() {
    try {
        promptPresets = JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]");
    } catch {
        promptPresets = [];
    }
    renderPresets();
}

function savePresets() {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(promptPresets));
    renderPresets();
}

function renderPresets() {
    const select = document.getElementById("wfm-preset-select");
    if (!select) return;
    select.innerHTML = `<option value="">${t("newPreset")}</option>`;
    promptPresets.forEach((p, i) => {
        const opt = document.createElement("option");
        opt.value = i.toString();
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

// ============================================
// Initialize
// ============================================

export function initPromptTab() {
    // Subtab switching
    document.querySelectorAll(".wfm-prompt-subtab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-prompt-subtab-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            const tab = btn.dataset.promptSubtab;
            document.querySelectorAll(".wfm-prompt-subtab-content").forEach((c) => {
                c.classList.toggle("active", c.id === `wfm-prompt-subtab-${tab}`);
            });
        });
    });

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

    // --- Presets ---
    loadPresets();

    const presetSelect = document.getElementById("wfm-preset-select");
    const presetName = document.getElementById("wfm-preset-name");
    const presetPos = document.getElementById("wfm-preset-pos");
    const presetNeg = document.getElementById("wfm-preset-neg");

    // Load preset on selection
    presetSelect?.addEventListener("change", () => {
        const idx = presetSelect.value;
        if (idx !== "" && promptPresets[idx]) {
            const p = promptPresets[idx];
            if (presetName) presetName.value = p.name;
            if (presetPos) presetPos.value = p.posText || p.text || "";
            if (presetNeg) presetNeg.value = p.negText || "";
        } else {
            if (presetName) presetName.value = "";
            if (presetPos) presetPos.value = "";
            if (presetNeg) presetNeg.value = "";
        }
    });

    // Save preset
    document.getElementById("wfm-preset-save-btn")?.addEventListener("click", () => {
        const name = presetName?.value.trim();
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

        const existIdx = promptPresets.findIndex((p) => p.name === name);
        if (existIdx >= 0) {
            promptPresets[existIdx].posText = pos;
            promptPresets[existIdx].negText = neg;
        } else {
            promptPresets.push({ name, posText: pos, negText: neg });
        }
        savePresets();
        showToast(t("presetSaved"), "success");

        // Select newly saved
        const newIdx = promptPresets.findIndex((p) => p.name === name);
        if (presetSelect && newIdx >= 0) presetSelect.value = newIdx.toString();
    });

    // Delete preset
    document.getElementById("wfm-preset-delete-btn")?.addEventListener("click", () => {
        const idx = presetSelect?.value;
        if (idx === "" || !promptPresets[idx]) return;
        if (!confirm(t("deleteConfirm", promptPresets[idx].name))) return;
        promptPresets.splice(idx, 1);
        savePresets();
        if (presetName) presetName.value = "";
        if (presetPos) presetPos.value = "";
        if (presetNeg) presetNeg.value = "";
        showToast(t("deleted"), "success");
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
}

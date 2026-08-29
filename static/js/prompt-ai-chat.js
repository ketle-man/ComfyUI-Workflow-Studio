/**
 * Prompt Tab - AI Assistant (Ollama / LM Studio / Lemonade / Unsloth chat, translate, apply to GenerateUI)
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { unslothProxy } from "./util.js";
import { openAiBackendSettingsModal, getAiBackendConfig } from "./ai-settings-modal.js";

// ============================================
// State
// ============================================

const ollamaState = {
    chatHistory: [],
    attachedImage: null,
};

const PROMPT_AI_KEY = "wfm_prompt_ai_settings";

export function getPromptAiConfig() {
    return getAiBackendConfig(PROMPT_AI_KEY);
}

// Ollama-style messages (with .images) → OpenAI互換 content 配列に変換
function _toOpenAiMessages(messages) {
    return messages.map(msg => {
        if (msg.images?.length) {
            return {
                role: msg.role,
                content: [
                    { type: "text", text: msg.content },
                    ...msg.images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } })),
                ],
            };
        }
        return { role: msg.role, content: msg.content };
    });
}

function _stripThinkingTags(text) {
    return (text || "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .trim();
}

// Ollamaは `think` (bool) と `options.num_predict`、OpenAI互換は `max_tokens` で制御
function _applyGenOptions(body, backend, cfg) {
    if (backend === "ollama") {
        body.think = !!cfg.thinkingMode;
        if (cfg.maxTokens > 0) body.options = { ...(body.options || {}), num_predict: cfg.maxTokens };
    } else if (cfg.maxTokens > 0) {
        body.max_tokens = cfg.maxTokens;
    }
    return body;
}

async function chatWithAi(model, messages) {
    const cfg = getPromptAiConfig();
    const { backend, url } = cfg;
    if (backend === "ollama") {
        const res = await fetch(`${url}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(_applyGenOptions({ model, messages, stream: false }, backend, cfg)),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = (await res.json()).message?.content || "";
        return cfg.thinkingMode ? text : _stripThinkingTags(text);
    } else if (backend === "unsloth") {
        const body = _applyGenOptions({ model, messages: _toOpenAiMessages(messages), stream: false }, backend, cfg);
        const data = await unslothProxy(url, "/v1/chat/completions", "POST", body);
        const msg = data.choices?.[0]?.message;
        // Unslothはreasoningを別フィールドで返すため<think>タグに畳んで表示に混ぜる
        const text = (msg?.reasoning_content ? `<think>${msg.reasoning_content}</think>` : "") + (msg?.content || "");
        return cfg.thinkingMode ? text : _stripThinkingTags(text);
    } else {
        // LM Studio / Lemonade (OpenAI-compatible)
        const res = await fetch(`${url}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(_applyGenOptions({ model, messages: _toOpenAiMessages(messages), stream: false }, backend, cfg)),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = (await res.json()).choices?.[0]?.message?.content || "";
        return cfg.thinkingMode ? text : _stripThinkingTags(text);
    }
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
                <p>AI Assistant</p>
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
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
        ollamaState.attachedImage = null;
        updateAttachmentDisplay();
    });
    item.appendChild(removeBtn);

    container.appendChild(item);
}

// ============================================
// Status label (設定モーダルで選択中のbackend/modelを表示)
// ============================================

function _updateStatusLabel() {
    const status = document.getElementById("wfm-ollama-status");
    if (!status) return;
    const { backend, model } = getPromptAiConfig();
    status.textContent = model ? `${backend}: ${model}` : `${backend}: ${t("selectModelFirst")}`;
    status.className = model ? "wfm-ollama-status connected" : "wfm-ollama-status error";
}

// ============================================
// Send Message
// ============================================

async function sendMessage() {
    const input = document.getElementById("wfm-ollama-input");
    if (!input) return;

    const message = input.value.trim();
    if (!message) return;

    const { model } = getPromptAiConfig();
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
        const reply = await chatWithAi(model, ollamaState.chatHistory);
        addChatMessage("assistant", reply);
        ollamaState.chatHistory.push({ role: "assistant", content: reply });
        ollamaState.attachedImage = null;
        updateAttachmentDisplay();
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
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    const { model } = getPromptAiConfig();
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

        const reply = await chatWithAi(model, [{ role: "user", content: prompt }]);
        addChatMessage("assistant", reply);
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
// UI wiring (called from prompt-tab.js's initPromptTab)
// ============================================

export function initAiChatUI() {
    _updateStatusLabel();

    // Settings modal
    document.getElementById("wfm-ollama-settings-btn")?.addEventListener("click", () => {
        openAiBackendSettingsModal(PROMPT_AI_KEY, t("settings"), _updateStatusLabel);
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
}

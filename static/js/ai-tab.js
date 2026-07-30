/**
 * AI Tab - Translation, VLM, Settings
 * Supports Ollama, LM Studio, and Lemonade as backends
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { readJsonStorage, getAiBackendDefaultUrl } from "./util.js";
import { comfyUI } from "./comfyui-client.js";
import { comfyEditor } from "./comfyui-editor.js";
import { comfyWorkflow } from "./comfyui-workflow.js";

const SETTINGS_KEY = "wfm_ai_settings";

const LANG_NAMES = {
    ja: "Japanese",
    en: "English",
    zh: "Chinese",
};

// ============================================
// Settings persistence
// ============================================

function loadAiSettings() {
    return readJsonStorage(SETTINGS_KEY);
}

function saveAiSettings(patch) {
    const data = { ...loadAiSettings(), ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    return data;
}

const VLM_PROMPTS = {
    describe: "Describe this image in detail.",
    prompt: "Create a detailed Stable Diffusion image generation prompt based on this image. Output only the prompt text, nothing else.",
    tags: "Generate a list of descriptive tags for this image. Output only comma-separated tags in English, nothing else.",
};

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const b64 = e.target.result.split(",")[1];
            resolve({ base64: b64, mimeType: file.type });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function callVLM(url, backend, model, prompt, base64Image, mimeType) {
    if (backend === "ollama") {
        const res = await fetch(`${url}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, prompt, images: [base64Image], stream: false }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()).response || "";
    } else {
        const res = await fetch(`${url}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
                ]}],
                stream: false,
            }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()).choices?.[0]?.message?.content || "";
    }
}

// ============================================
// URL validation
// ============================================

function isValidBackendUrl(url) {
    try {
        const u = new URL(url);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

// ============================================
// API helpers
// ============================================

async function fetchModels(url, backend) {
    if (backend === "ollama") {
        const res = await fetch(`${url}/api/tags`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.models || []).map((m) => m.name);
    } else {
        // LM Studio (OpenAI-compatible)
        const res = await fetch(`${url}/v1/models`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.data || []).map((m) => m.id);
    }
}

async function testConnection(url, backend) {
    const models = await fetchModels(url, backend);
    return models.length;
}

async function callLLM(url, backend, model, prompt) {
    if (backend === "ollama") {
        const res = await fetch(`${url}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, prompt, stream: false }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.response || "";
    } else {
        // LM Studio (OpenAI-compatible)
        const res = await fetch(`${url}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: prompt }],
                stream: false,
            }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
    }
}

// ============================================
// Translation prompt builder
// ============================================

function buildTranslationPrompt(text, srcLang, dstLang, settings) {
    const srcName = srcLang === "free" ? (settings.freeSrcLang || "Auto") : LANG_NAMES[srcLang];
    const dstName = dstLang === "free" ? (settings.freeDstLang || "English") : LANG_NAMES[dstLang];
    const fromPart = srcLang === "free" ? "" : `from ${srcName} `;
    return `Translate the following text ${fromPart}to ${dstName}. Output only the translated text, nothing else.\n\n${text}`;
}

// ============================================
// Translation tab
// ============================================

function initTranslateTab() {
    const srcLangSel = document.getElementById("wfm-ai-src-lang");
    const dstLangSel = document.getElementById("wfm-ai-dst-lang");
    const swapBtn = document.getElementById("wfm-ai-trans-swap-btn");
    const inputEl = document.getElementById("wfm-ai-trans-input");
    const outputEl = document.getElementById("wfm-ai-trans-output");
    const transBtn = document.getElementById("wfm-ai-trans-btn");
    const copyBtn = document.getElementById("wfm-ai-trans-copy-btn");
    const statusEl = document.getElementById("wfm-ai-trans-status");

    if (!transBtn) return;

    // Restore saved language selections
    const saved = loadAiSettings();
    if (saved.srcLang && srcLangSel) srcLangSel.value = saved.srcLang;
    if (saved.dstLang && dstLangSel) dstLangSel.value = saved.dstLang;

    // Persist language selections
    srcLangSel?.addEventListener("change", () => saveAiSettings({ srcLang: srcLangSel.value }));
    dstLangSel?.addEventListener("change", () => saveAiSettings({ dstLang: dstLangSel.value }));

    // Swap languages
    swapBtn?.addEventListener("click", () => {
        const tmp = srcLangSel.value;
        srcLangSel.value = dstLangSel.value;
        dstLangSel.value = tmp;
        saveAiSettings({ srcLang: srcLangSel.value, dstLang: dstLangSel.value });
        // Swap text content too
        const tmpText = inputEl.value;
        inputEl.value = outputEl.value;
        outputEl.value = tmpText;
    });

    // Translate
    transBtn.addEventListener("click", async () => {
        const text = inputEl.value.trim();
        if (!text) {
            showToast(t("aiToastNoText"), "error");
            return;
        }

        const settings = loadAiSettings();
        const { backend = "ollama", backendUrl, model } = settings;
        const url = backendUrl || getAiBackendDefaultUrl(backend);

        if (!isValidBackendUrl(url)) {
            showToast(t("aiToastInvalidUrl"), "error");
            return;
        }

        if (!model) {
            showToast(t("aiToastNoModel"), "error");
            return;
        }

        transBtn.disabled = true;
        statusEl.textContent = t("aiStatusTranslating");
        statusEl.className = "wfm-ai-trans-status wfm-ai-status-working";
        outputEl.value = "";

        try {
            const prompt = buildTranslationPrompt(text, srcLangSel.value, dstLangSel.value, settings);
            const result = await callLLM(url, backend, model, prompt);
            outputEl.value = result.trim();
            statusEl.textContent = t("aiStatusDone");
            statusEl.className = "wfm-ai-trans-status wfm-ai-status-ok";
        } catch (err) {
            statusEl.textContent = `${t("aiStatusConnectFail")}${err.message}`;
            statusEl.className = "wfm-ai-trans-status wfm-ai-status-error";
            showToast(t("aiToastTransFailed") + err.message, "error");
        } finally {
            transBtn.disabled = false;
        }
    });

    // Copy translated text
    copyBtn?.addEventListener("click", () => {
        const text = outputEl.value;
        if (!text) {
            showToast(t("aiToastNoCopyText"), "error");
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            showToast(t("aiToastCopied"), "success");
        });
    });
}

// ============================================
// Settings tab
// ============================================

async function refreshModels() {
    const settings = loadAiSettings();
    const backend = document.querySelector("input[name='wfm-ai-backend']:checked")?.value || "ollama";
    const url = document.getElementById("wfm-ai-backend-url")?.value?.trim() || "";
    const modelSel = document.getElementById("wfm-ai-model-select");
    const refreshBtn = document.getElementById("wfm-ai-model-refresh-btn");

    if (!modelSel) return;

    if (refreshBtn) refreshBtn.disabled = true;
    try {
        const models = await fetchModels(url, backend);
        modelSel.innerHTML = `<option value="">-- ${t("aiSettingsModelPlaceholder")} --</option>`;
        models.forEach((name) => {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            if (name === settings.model) opt.selected = true;
            modelSel.appendChild(opt);
        });
        if (models.length === 0) showToast(t("aiToastNoModels"), "error");
    } catch (err) {
        showToast(t("aiToastModelsFailed") + err.message, "error");
    } finally {
        if (refreshBtn) refreshBtn.disabled = false;
    }
}

function initSettingsTab() {
    const saved = loadAiSettings();

    // Restore saved values
    const backendRadios = document.querySelectorAll("input[name='wfm-ai-backend']");
    backendRadios.forEach((r) => {
        if (r.value === (saved.backend || "ollama")) r.checked = true;
    });

    const urlInput = document.getElementById("wfm-ai-backend-url");
    if (urlInput && saved.backendUrl) urlInput.value = saved.backendUrl;

    // Switch URL to the new backend's default when the user changes backend
    backendRadios.forEach((r) => {
        r.addEventListener("change", () => {
            if (!urlInput) return;
            urlInput.value = getAiBackendDefaultUrl(r.value);
        });
    });

    // Connection test
    document.getElementById("wfm-ai-test-btn")?.addEventListener("click", async () => {
        const testBtn = document.getElementById("wfm-ai-test-btn");
        const resultEl = document.getElementById("wfm-ai-test-result");
        const backend = document.querySelector("input[name='wfm-ai-backend']:checked")?.value || "ollama";
        const url = urlInput?.value?.trim() || "";

        if (!isValidBackendUrl(url)) {
            if (resultEl) {
                resultEl.textContent = t("aiToastInvalidUrlInput");
                resultEl.className = "wfm-ai-test-result wfm-ai-status-error";
            }
            return;
        }

        if (testBtn) testBtn.disabled = true;
        if (resultEl) {
            resultEl.textContent = t("aiStatusConnecting");
            resultEl.className = "wfm-ai-test-result wfm-ai-status-working";
        }

        try {
            const count = await testConnection(url, backend);
            if (resultEl) {
                resultEl.textContent = `${t("aiStatusConnectOk")} (${count} ${t("aiModels")})`;
                resultEl.className = "wfm-ai-test-result wfm-ai-status-ok";
            }
            await refreshModels();
        } catch (err) {
            if (resultEl) {
                resultEl.textContent = `${t("aiStatusConnectFail")}${err.message}`;
                resultEl.className = "wfm-ai-test-result wfm-ai-status-error";
            }
        } finally {
            if (testBtn) testBtn.disabled = false;
        }
    });

    // Model refresh
    document.getElementById("wfm-ai-model-refresh-btn")?.addEventListener("click", () => refreshModels());

    // Free language inputs
    const freeSrcInput = document.getElementById("wfm-ai-free-src-lang");
    const freeDstInput = document.getElementById("wfm-ai-free-dst-lang");
    if (freeSrcInput && saved.freeSrcLang) freeSrcInput.value = saved.freeSrcLang;
    if (freeDstInput && saved.freeDstLang) freeDstInput.value = saved.freeDstLang;

    // Chat image generation — dedicated workflow selection (T2I)
    const chatGenCheckbox = document.getElementById("wfm-ai-chatgen-dedicated-checkbox");
    const chatGenRow      = document.getElementById("wfm-ai-chatgen-dedicated-row");
    const chatGenSelect   = document.getElementById("wfm-ai-chatgen-dedicated-select");

    if (chatGenCheckbox) chatGenCheckbox.checked = !!saved.chatGenDedicatedEnabled;
    if (chatGenRow) chatGenRow.style.display = saved.chatGenDedicatedEnabled ? "" : "none";

    chatGenCheckbox?.addEventListener("change", () => {
        if (chatGenRow) chatGenRow.style.display = chatGenCheckbox.checked ? "" : "none";
    });

    // Chat I2I generation — dedicated workflow selection
    const chatGenI2ICheckbox = document.getElementById("wfm-ai-chatgen-i2i-dedicated-checkbox");
    const chatGenI2IRow      = document.getElementById("wfm-ai-chatgen-i2i-dedicated-row");
    const chatGenI2ISelect   = document.getElementById("wfm-ai-chatgen-i2i-dedicated-select");

    if (chatGenI2ICheckbox) chatGenI2ICheckbox.checked = !!saved.chatGenI2IDedicatedEnabled;
    if (chatGenI2IRow) chatGenI2IRow.style.display = saved.chatGenI2IDedicatedEnabled ? "" : "none";

    chatGenI2ICheckbox?.addEventListener("change", () => {
        if (chatGenI2IRow) chatGenI2IRow.style.display = chatGenI2ICheckbox.checked ? "" : "none";
    });

    if (chatGenSelect) {
        fetch(`${comfyUI.baseUrl}/api/wfm/workflows`)
            .then((r) => (r.ok ? r.json() : []))
            .then((list) => {
                const filenames = (list || []).map((w) => w.filename).filter(Boolean);
                const optionsHtml = `<option value="">-- select workflow --</option>` +
                    filenames.map((f) => `<option value="${f}">${f}</option>`).join("");
                chatGenSelect.innerHTML = optionsHtml;
                if (saved.chatGenDedicatedFilename) chatGenSelect.value = saved.chatGenDedicatedFilename;
                if (chatGenI2ISelect) {
                    chatGenI2ISelect.innerHTML = optionsHtml;
                    if (saved.chatGenI2IDedicatedFilename) chatGenI2ISelect.value = saved.chatGenI2IDedicatedFilename;
                }
            })
            .catch(() => {});
    }

    // Save settings
    document.getElementById("wfm-ai-settings-save-btn")?.addEventListener("click", () => {
        const backend = document.querySelector("input[name='wfm-ai-backend']:checked")?.value || "ollama";
        const url = urlInput?.value?.trim() || "";
        const model = document.getElementById("wfm-ai-model-select")?.value || "";
        const freeSrcLang = freeSrcInput?.value?.trim() || "";
        const freeDstLang = freeDstInput?.value?.trim() || "";
        const chatGenDedicatedEnabled = !!chatGenCheckbox?.checked;
        const chatGenDedicatedFilename = chatGenSelect?.value || "";
        const chatGenI2IDedicatedEnabled = !!chatGenI2ICheckbox?.checked;
        const chatGenI2IDedicatedFilename = chatGenI2ISelect?.value || "";

        if (url && !isValidBackendUrl(url)) {
            showToast(t("aiToastInvalidUrl"), "error");
            return;
        }

        saveAiSettings({
            backend, backendUrl: url, model, freeSrcLang, freeDstLang,
            chatGenDedicatedEnabled, chatGenDedicatedFilename,
            chatGenI2IDedicatedEnabled, chatGenI2IDedicatedFilename,
        });
        showToast(t("aiToastSettingsSaved"), "success");
    });

    // Load models on init if settings exist
    if (saved.backendUrl && saved.backend) {
        refreshModels().catch(() => {});
    }
}

// ============================================
// Chat tab
// ============================================

const IMAGE_GEN_TOOLS = [{
    type: "function",
    function: {
        name: "generate_image",
        description: "Generate an image using the currently loaded ComfyUI workflow. If an image is currently attached to the conversation, this performs image-to-image generation using that image as the base; otherwise it performs text-to-image. Call this when the user asks to create, draw, paint, edit, or transform an image.",
        parameters: {
            type: "object",
            properties: {
                prompt: { type: "string", description: "Positive prompt describing the desired image." },
                negative_prompt: { type: "string", description: "What to avoid in the image. Optional." },
            },
            required: ["prompt"],
        },
    },
}];

// chatHistory の内部共通形式 {role, content, images?:[{base64,mimeType}]} を
// バックエンドごとのワイヤーフォーマットへ変換する（callVLM() と同じ規約）
function _formatMessagesForBackend(messages, backend) {
    return messages.map((m) => {
        if (!m.images?.length) return { role: m.role, content: m.content };
        if (backend === "ollama") {
            return { role: m.role, content: m.content, images: m.images.map((i) => i.base64) };
        }
        return {
            role: m.role,
            content: [
                { type: "text", text: m.content },
                ...m.images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mimeType};base64,${i.base64}` } })),
            ],
        };
    });
}

async function callChat(url, backend, model, messages, tools) {
    const formattedMessages = _formatMessagesForBackend(messages, backend);
    if (backend === "ollama") {
        const body = { model, messages: formattedMessages, stream: false };
        if (tools) body.tools = tools;
        const res = await fetch(`${url}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const message = (await res.json()).message || {};
        return { content: message.content || "", toolCalls: message.tool_calls || null };
    } else {
        const body = { model, messages: formattedMessages, stream: false };
        if (tools) { body.tools = tools; body.tool_choice = "auto"; }
        const res = await fetch(`${url}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const message = (await res.json()).choices?.[0]?.message || {};
        return { content: message.content || "", toolCalls: message.tool_calls || null };
    }
}

function _parseToolArgs(toolCall) {
    const raw = toolCall.function?.arguments ?? toolCall.arguments;
    if (typeof raw === "string") {
        try { return JSON.parse(raw); } catch { return {}; }
    }
    return raw || {};
}

async function _loadDedicatedChatGenWorkflow(filename) {
    const resp = await fetch(`${comfyUI.baseUrl}/api/wfm/workflows/raw?filename=${encodeURIComponent(filename)}`);
    if (!resp.ok) throw new Error(`Failed to load workflow (HTTP ${resp.status})`);
    let workflow = await resp.json();
    const format = comfyWorkflow.detectFormat(workflow, filename);
    if (format === "ui") {
        workflow = await comfyWorkflow.convertUiToApi(workflow);
    } else if (format !== "api") {
        throw new Error("Unsupported or unrecognized workflow format");
    }
    return { workflow, analysis: comfyWorkflow.analyzeWorkflow(workflow) };
}

async function generateImageFromChat(prompt, negativePrompt) {
    if (!window._wfmGenerateTab?.generate) throw new Error(t("aiChatGenerateNotReady"));

    const settings = loadAiSettings();
    const isI2I = !!_toolsImage;
    let workflow, analysis;

    if (isI2I && settings.chatGenI2IDedicatedEnabled && settings.chatGenI2IDedicatedFilename) {
        ({ workflow, analysis } = await _loadDedicatedChatGenWorkflow(settings.chatGenI2IDedicatedFilename));
    } else if (!isI2I && settings.chatGenDedicatedEnabled && settings.chatGenDedicatedFilename) {
        ({ workflow, analysis } = await _loadDedicatedChatGenWorkflow(settings.chatGenDedicatedFilename));
    } else {
        if (!comfyUI.currentWorkflow || !comfyUI.currentAnalysis) throw new Error(t("aiChatNoWorkflowLoaded"));
        workflow = JSON.parse(JSON.stringify(comfyUI.currentWorkflow));
        analysis = comfyUI.currentAnalysis;
    }

    if (isI2I) {
        if (!(analysis.load_image_nodes?.length > 0)) throw new Error(t("aiChatNoLoadImageNode"));
        await comfyEditor.applyImageToSlot(_toolsImage.file, 0, { workflow, analysis });
    }

    comfyEditor.setPromptText("positive", prompt || "", { workflow, analysis });
    if (negativePrompt) comfyEditor.setPromptText("negative", negativePrompt, { workflow, analysis });

    const result = await window._wfmGenerateTab.generate(workflow);
    const images = result?.images || [];
    if (images.length === 0) throw new Error(t("aiChatNoImageProduced"));

    const img = images[0];
    return `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${encodeURIComponent(img.type || "output")}`;
}

// アシスタント応答からSVGコードを抽出する（```svg フェンス or 生の <svg>...</svg>）
function _extractSvgCode(text) {
    if (!text) return null;
    const fenced = text.match(/```(?:svg|xml)?\s*([\s\S]*?<svg[\s\S]*?<\/svg>)[\s\S]*?```/i);
    if (fenced) return fenced[1].trim();
    const bare = text.match(/<svg[\s\S]*?<\/svg>/i);
    if (bare) return bare[0].trim();
    return null;
}

// SVGコードをプレビュー表示し、Galleryへ保存するボタンを追加する。
// <img src="data:..."> でのレンダリングはブラウザがスクリプト実行を無効化するため安全。
function _appendSvgPreview(container, svgCode) {
    const wrapper = document.createElement("div");
    wrapper.className = "wfm-ai-chat-svg-wrapper";

    const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgCode)))}`;

    const img = document.createElement("img");
    img.src = dataUrl;
    img.className = "wfm-ai-chat-svg-img";
    img.alt = "Generated SVG";
    wrapper.appendChild(img);

    const saveBtn = document.createElement("button");
    saveBtn.className = "wfm-btn wfm-btn-sm";
    saveBtn.textContent = t("aiChatSaveSvgToGallery");
    saveBtn.addEventListener("click", async () => {
        saveBtn.disabled = true;
        try {
            const res = await fetch("/wfm/gallery/image/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: `chat_svg_${Date.now()}.svg`, imageData: dataUrl }),
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
            showToast(t("aiChatSvgSaved"), "success");
        } catch (e) {
            showToast(t("aiChatSvgSaveFailed") + e.message, "error");
        } finally {
            saveBtn.disabled = false;
        }
    });
    wrapper.appendChild(saveBtn);

    container.appendChild(wrapper);
}

function appendChatBubble(messagesEl, role, content, opts = {}) {
    const div = document.createElement("div");
    div.className = `wfm-ai-chat-msg wfm-ai-chat-msg-${role}`;
    if (content) div.textContent = content;
    if (opts.imageUrl) {
        const img = document.createElement("img");
        img.src = opts.imageUrl;
        img.className = "wfm-ai-chat-img";
        div.appendChild(img);
    }
    if (opts.attachThumb) {
        const img = document.createElement("img");
        img.src = opts.attachThumb;
        img.className = "wfm-ai-chat-attach-thumb";
        div.appendChild(img);
    }
    if (role === "assistant" && content) {
        const svgCode = _extractSvgCode(content);
        if (svgCode) _appendSvgPreview(div, svgCode);
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
}

function initChatTab() {
    const messagesEl = document.getElementById("wfm-ai-chat-messages");
    const inputEl    = document.getElementById("wfm-ai-chat-input");
    const sendBtn    = document.getElementById("wfm-ai-chat-send-btn");
    const clearBtn   = document.getElementById("wfm-ai-chat-clear-btn");
    const statusEl   = document.getElementById("wfm-ai-chat-status");
    const imgGenToggle = document.getElementById("wfm-ai-chat-imggen-toggle");

    if (!messagesEl || !inputEl || !sendBtn) return;

    if (imgGenToggle) {
        const savedToggle = loadAiSettings();
        imgGenToggle.checked = savedToggle.chatImageGenEnabled !== false;
        imgGenToggle.addEventListener("change", () => {
            saveAiSettings({ chatImageGenEnabled: imgGenToggle.checked });
        });
    }

    document.getElementById("wfm-ai-chat-attachment-clear")?.addEventListener("click", () => {
        _clearToolsImage();
    });

    let chatHistory = [];

    async function sendMessage() {
        const text = inputEl.value.trim();
        if (!text) return;

        const settings = loadAiSettings();
        const { backend = "ollama", backendUrl, model } = settings;
        const url = backendUrl || getAiBackendDefaultUrl(backend);

        if (!isValidBackendUrl(url)) {
            showToast(t("aiToastInvalidUrl"), "error");
            return;
        }
        if (!model) {
            showToast(t("aiToastNoModel"), "error");
            return;
        }

        inputEl.value = "";
        inputEl.style.height = "";
        const userEntry = { role: "user", content: text };
        if (_toolsImage) userEntry.images = [{ base64: _toolsImage.base64, mimeType: _toolsImage.mimeType }];
        chatHistory.push(userEntry);
        appendChatBubble(messagesEl, "user", text, _toolsImage ? { attachThumb: `data:${_toolsImage.mimeType};base64,${_toolsImage.base64}` } : {});

        sendBtn.disabled = true;
        statusEl.textContent = t("aiStatusChatting");
        statusEl.className = "wfm-ai-trans-status wfm-ai-status-working";

        try {
            const tools = imgGenToggle?.checked !== false ? IMAGE_GEN_TOOLS : undefined;
            const reply = await callChat(url, backend, model, chatHistory, tools);
            const toolCall = reply.toolCalls?.find(
                (tc) => (tc.function?.name || tc.name) === "generate_image"
            );

            if (toolCall) {
                chatHistory.push({ role: "assistant", content: reply.content || "" });
                if (reply.content) appendChatBubble(messagesEl, "assistant", reply.content);

                statusEl.textContent = t("aiStatusGeneratingImage");
                const args = _parseToolArgs(toolCall);
                try {
                    const imageUrl = await generateImageFromChat(args.prompt, args.negative_prompt);
                    appendChatBubble(messagesEl, "assistant", "", { imageUrl });
                } catch (genErr) {
                    appendChatBubble(messagesEl, "assistant", `${t("aiToastImageGenFailed")}${genErr.message}`);
                    showToast(t("aiToastImageGenFailed") + genErr.message, "error");
                }
            } else {
                chatHistory.push({ role: "assistant", content: reply.content });
                appendChatBubble(messagesEl, "assistant", reply.content);
            }
            statusEl.textContent = "";
            statusEl.className = "wfm-ai-trans-status";
        } catch (err) {
            chatHistory.pop();
            if (messagesEl.lastChild) messagesEl.removeChild(messagesEl.lastChild);
            inputEl.value = text;
            statusEl.textContent = `${t("aiStatusConnectFail")}${err.message}`;
            statusEl.className = "wfm-ai-trans-status wfm-ai-status-error";
            showToast(t("aiToastChatFailed") + err.message, "error");
        } finally {
            sendBtn.disabled = false;
        }
    }

    sendBtn.addEventListener("click", sendMessage);

    inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    clearBtn.addEventListener("click", () => {
        chatHistory = [];
        messagesEl.innerHTML = "";
        statusEl.textContent = "";
        statusEl.className = "wfm-ai-trans-status";
    });
}

// ============================================
// TOOLS ↔ Chat shared image attachment
// ============================================

let _toolsImage = null; // { file: File, base64: string, mimeType: string }

function _syncAttachmentUI() {
    const vlmPreview = document.getElementById("wfm-ai-vlm-preview");
    const vlmLabel   = document.getElementById("wfm-ai-vlm-label");
    const vlmClear   = document.getElementById("wfm-ai-vlm-clear");
    const chatAttach = document.getElementById("wfm-ai-chat-attachment");
    const chatThumb  = document.getElementById("wfm-ai-chat-attachment-thumb");
    const chatLabel  = document.getElementById("wfm-ai-chat-attachment-label");

    if (_toolsImage) {
        const dataUrl = `data:${_toolsImage.mimeType};base64,${_toolsImage.base64}`;
        if (vlmPreview) { vlmPreview.src = dataUrl; vlmPreview.style.display = "block"; }
        if (vlmLabel) vlmLabel.style.display = "none";
        if (vlmClear) vlmClear.style.display = "flex";
        if (chatAttach) chatAttach.style.display = "flex";
        if (chatThumb) chatThumb.src = dataUrl;
        if (chatLabel) chatLabel.textContent = t("aiChatAttachmentLabel");
    } else {
        if (vlmPreview) { vlmPreview.src = ""; vlmPreview.style.display = "none"; }
        if (vlmLabel) vlmLabel.style.display = "";
        if (vlmClear) vlmClear.style.display = "none";
        if (chatAttach) chatAttach.style.display = "none";
        if (chatThumb) chatThumb.src = "";
    }
}

function _clearToolsImage() {
    _toolsImage = null;
    _syncAttachmentUI();
}

// ============================================
// VLM tab
// ============================================

function initVlmTab() {
    const dropEl    = document.getElementById("wfm-ai-vlm-drop");
    const clearEl   = document.getElementById("wfm-ai-vlm-clear");
    const fileInput = document.getElementById("wfm-ai-vlm-file");
    const taskSel   = document.getElementById("wfm-ai-vlm-task");
    const runBtn    = document.getElementById("wfm-ai-vlm-run");
    const statusEl  = document.getElementById("wfm-ai-vlm-status");
    const resultEl  = document.getElementById("wfm-ai-vlm-result");
    const copyBtn   = document.getElementById("wfm-ai-vlm-copy");
    const wcInputs  = document.getElementById("wfm-ai-wc-inputs");
    const wcNameEl  = document.getElementById("wfm-ai-wc-name");
    const wcCountEl = document.getElementById("wfm-ai-wc-count");

    if (!dropEl) return;

    function updateTaskUI() {
        const isWildcard = taskSel?.value === "wildcard";
        dropEl.style.display = isWildcard ? "none" : "";
        if (wcInputs) wcInputs.style.display = isWildcard ? "" : "none";
    }
    taskSel?.addEventListener("change", updateTaskUI);
    updateTaskUI();

    const loadImage = async (file) => {
        if (!file || !file.type.startsWith("image/")) return;
        const { base64, mimeType } = await fileToBase64(file);
        _toolsImage = { file, base64, mimeType };
        _syncAttachmentUI();
    };

    dropEl.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", e => { if (e.target.files[0]) loadImage(e.target.files[0]); });
    dropEl.addEventListener("dragover", e => { e.preventDefault(); dropEl.classList.add("drag-over"); });
    dropEl.addEventListener("dragleave", () => dropEl.classList.remove("drag-over"));
    dropEl.addEventListener("drop", e => {
        e.preventDefault();
        dropEl.classList.remove("drag-over");
        if (e.dataTransfer.files[0]) loadImage(e.dataTransfer.files[0]);
    });
    clearEl?.addEventListener("click", (e) => {
        e.stopPropagation();
        _clearToolsImage();
        if (fileInput) fileInput.value = "";
    });

    runBtn.addEventListener("click", async () => {
        const task = taskSel?.value || "describe";
        const settings = loadAiSettings();
        const { backend = "ollama", backendUrl, model } = settings;
        const url = backendUrl || getAiBackendDefaultUrl(backend);

        if (!isValidBackendUrl(url)) { showToast(t("aiToastInvalidUrl"), "error"); return; }
        if (!model) { showToast(t("aiToastNoModel"), "error"); return; }

        if (task === "wildcard") {
            const name  = wcNameEl?.value.trim() || "";
            const count = Math.max(1, parseInt(wcCountEl?.value) || 20);
            if (!name) { showToast(t("aiToastWcNoName"), "error"); return; }

            runBtn.disabled = true;
            statusEl.textContent = t("aiStatusRunning");
            statusEl.className = "wfm-ai-trans-status wfm-ai-status-working";
            resultEl.value = "";

            const prompt = `Generate ${count} wildcard entries for the category "${name}". Output only plain text in English, one entry per line, no numbers, no markdown, no asterisks, no bold, nothing else.`;

            try {
                const result = await callLLM(url, backend, model, prompt);
                resultEl.value = result.trim()
                    .split("\n")
                    .map(l => l.replace(/\*\*/g, "").replace(/^\*\s*/, "").replace(/^\d+\.\s*/, "").trim())
                    .filter(l => l.length > 0)
                    .join("\n");
                statusEl.textContent = t("aiStatusDone");
                statusEl.className = "wfm-ai-trans-status wfm-ai-status-ok";
            } catch (err) {
                statusEl.textContent = `${t("aiStatusConnectFail")}${err.message}`;
                statusEl.className = "wfm-ai-trans-status wfm-ai-status-error";
                showToast(t("aiToastVlmFailed") + err.message, "error");
            } finally {
                runBtn.disabled = false;
            }
            return;
        }

        if (!_toolsImage) { showToast(t("aiToastNoImage"), "error"); return; }

        runBtn.disabled = true;
        statusEl.textContent = t("aiStatusRunning");
        statusEl.className = "wfm-ai-trans-status wfm-ai-status-working";
        resultEl.value = "";

        try {
            const result = await callVLM(url, backend, model, VLM_PROMPTS[task], _toolsImage.base64, _toolsImage.mimeType);
            resultEl.value = result.trim();
            statusEl.textContent = t("aiStatusDone");
            statusEl.className = "wfm-ai-trans-status wfm-ai-status-ok";
        } catch (err) {
            statusEl.textContent = `${t("aiStatusConnectFail")}${err.message}`;
            statusEl.className = "wfm-ai-trans-status wfm-ai-status-error";
            showToast(t("aiToastVlmFailed") + err.message, "error");
        } finally {
            runBtn.disabled = false;
        }
    });

    copyBtn.addEventListener("click", () => {
        const text = resultEl.value;
        if (!text) { showToast(t("aiToastNoCopyText"), "error"); return; }
        navigator.clipboard.writeText(text).then(() => showToast(t("aiToastCopied"), "success"));
    });
}

// ============================================
// Export
// ============================================

export function initAiTab() {
    initTranslateTab();
    initChatTab();
    initVlmTab();
    initSettingsTab();
}

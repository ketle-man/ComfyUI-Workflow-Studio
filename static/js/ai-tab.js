/**
 * AI Tab - Translation, VLM, Settings
 * Supports Ollama, LM Studio, and Lemonade as backends
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { readJsonStorage, getAiBackendDefaultUrl, escapeHtml, unloadAiModel } from "./util.js";
import { unloadAllOllamaModels } from "./vram-prepare.js";
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

// ============================================
// Thinking mode / Max tokens (shared by callLLM / callChat / callVLM)
// ============================================

// Ollamaは `think` (bool) と `options.num_predict` で制御できるが、
// LM Studio/LemonadeはOpenAI互換APIのため max_tokens のみ標準対応。
// thinking mode切替は非対応バックエンド／モデル向けに、出力からの
// <think>タグ除去でも担保する（stripThinkingTagsを参照）。
function _applyGenOptions(body, backend, settings) {
    const maxTokens = parseInt(settings?.maxTokens, 10);
    // temperature はスキルの metadata.temperature から渡される（未指定ならモデル既定値のまま）
    const temperature = typeof settings?.temperature === "number" ? settings.temperature : null;
    if (backend === "ollama") {
        body.think = !!settings?.thinkingMode;
        if (maxTokens > 0) body.options = { ...(body.options || {}), num_predict: maxTokens };
        if (temperature != null) body.options = { ...(body.options || {}), temperature };
    } else {
        if (maxTokens > 0) body.max_tokens = maxTokens;
        if (temperature != null) body.temperature = temperature;
    }
    return body;
}

function stripThinkingTags(text) {
    return (text || "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .trim();
}

async function callVLM(url, backend, model, prompt, base64Image, mimeType, settings = {}) {
    if (backend === "ollama") {
        const res = await fetch(`${url}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(_applyGenOptions({ model, prompt, images: [base64Image], stream: false }, backend, settings)),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = (await res.json()).response || "";
        return settings.thinkingMode ? text : stripThinkingTags(text);
    } else if (backend === "unsloth") {
        const body = _applyGenOptions({
            model,
            messages: [{ role: "user", content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
            ]}],
            stream: false,
        }, backend, settings);
        const data = await unslothProxy(url, "/v1/chat/completions", "POST", body);
        const text = _unslothContent(data.choices?.[0]?.message);
        return settings.thinkingMode ? text : stripThinkingTags(text);
    } else {
        const res = await fetch(`${url}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(_applyGenOptions({
                model,
                messages: [{ role: "user", content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
                ]}],
                stream: false,
            }, backend, settings)),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = (await res.json()).choices?.[0]?.message?.content || "";
        return settings.thinkingMode ? text : stripThinkingTags(text);
    }
}

// ============================================
// Unsloth proxy (server relays the request, attaching the API key from .env
// so it never reaches the frontend — see py/routes/unsloth_routes.py)
// ============================================

async function unslothProxy(baseUrl, path, method, payload) {
    const res = await fetch("/api/wfm/unsloth/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, path, method, payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
}

// Unlike Ollama/LM Studio/Lemonade (which inline reasoning as <think> tags
// inside content), Unsloth's OpenAI-compatible API returns it in a separate
// `reasoning_content` field. Fold it back into a <think> block so the
// existing Thinking-mode show/strip logic (_applyGenOptions/stripThinkingTags)
// still applies uniformly. Without this, a low max_tokens can make the model
// spend its whole budget reasoning and return an empty `content` with no
// visible explanation.
function _unslothContent(message) {
    const reasoning = message?.reasoning_content;
    const content = message?.content || "";
    return reasoning ? `<think>${reasoning}</think>${content}` : content;
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
    } else if (backend === "unsloth") {
        const data = await unslothProxy(url, "/v1/models", "GET");
        return (data.data || []).map((m) => m.id);
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

async function callLLM(url, backend, model, prompt, settings = {}) {
    if (backend === "ollama") {
        const res = await fetch(`${url}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(_applyGenOptions({ model, prompt, stream: false }, backend, settings)),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const text = data.response || "";
        return settings.thinkingMode ? text : stripThinkingTags(text);
    } else if (backend === "unsloth") {
        const body = _applyGenOptions({ model, messages: [{ role: "user", content: prompt }], stream: false }, backend, settings);
        const data = await unslothProxy(url, "/v1/chat/completions", "POST", body);
        const text = _unslothContent(data.choices?.[0]?.message);
        return settings.thinkingMode ? text : stripThinkingTags(text);
    } else {
        // LM Studio (OpenAI-compatible)
        const res = await fetch(`${url}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(_applyGenOptions({
                model,
                messages: [{ role: "user", content: prompt }],
                stream: false,
            }, backend, settings)),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || "";
        return settings.thinkingMode ? text : stripThinkingTags(text);
    }
}

// ============================================
// Translation prompt builder
// ============================================

// Uses a system role (via callChat) rather than a single raw prompt string —
// local models follow "translate only, no commentary" far more reliably
// when it's a system instruction instead of buried inside the user text.
function buildTranslationMessages(text, srcLang, dstLang, settings) {
    const srcName = srcLang === "free" ? (settings.freeSrcLang || "").trim() : LANG_NAMES[srcLang];
    const dstName = dstLang === "free" ? (settings.freeDstLang || "English").trim() || "English" : LANG_NAMES[dstLang];
    const fromPart = srcName ? ` from ${srcName}` : "";
    const system = `You are a professional translator. Translate the text the user sends${fromPart} into ${dstName}. `
        + `Reply with ONLY the translated text and nothing else: no explanations, no notes, no preamble like "Here is the translation:", `
        + `no surrounding quotes, and do not repeat or echo the original text.`;
    return [
        { role: "system", content: system },
        { role: "user", content: text },
    ];
}

// Strips common LLM wrapping/preamble artifacts that survive despite the system prompt.
function cleanTranslationOutput(raw) {
    let s = (raw || "").trim();
    s = s.replace(/^(sure[,.]?\s*)?(here('|)s|here is)?\s*(the\s+)?translation\s*:?\s*/i, "");
    s = s.replace(/^(翻訳|译文|翻译)\s*[::]\s*/, "");
    if (s.length >= 2) {
        const first = s[0], last = s[s.length - 1];
        const pairs = { '"': '"', "'": "'", "“": "”", "「": "」" };
        if (pairs[first] === last) s = s.slice(1, -1).trim();
    }
    return s;
}

// Heuristic: if the cleaned output is (near-)identical to the input, the
// model most likely echoed the source instead of translating it.
function looksUntranslated(input, output) {
    const normalize = (s) => s.trim().toLowerCase().replace(/[\s.,!?"'。、！？「」]/g, "");
    const a = normalize(input), b = normalize(output);
    return a.length > 0 && a === b;
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
            const messages = buildTranslationMessages(text, srcLangSel.value, dstLangSel.value, settings);
            const { content } = await callChat(url, backend, model, messages, undefined, settings);
            const cleaned = cleanTranslationOutput(content);
            outputEl.value = cleaned;

            if (srcLangSel.value !== dstLangSel.value && looksUntranslated(text, cleaned)) {
                statusEl.textContent = t("aiStatusDone");
                statusEl.className = "wfm-ai-trans-status wfm-ai-status-error";
                showToast(t("aiToastMaybeNotTranslated"), "error");
            } else {
                statusEl.textContent = t("aiStatusDone");
                statusEl.className = "wfm-ai-trans-status wfm-ai-status-ok";
            }
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

    const thinkingModeCheckbox = document.getElementById("wfm-ai-thinking-mode-checkbox");
    if (thinkingModeCheckbox) thinkingModeCheckbox.checked = !!saved.thinkingMode;
    const maxTokensInput = document.getElementById("wfm-ai-max-tokens");
    if (maxTokensInput && saved.maxTokens) maxTokensInput.value = saved.maxTokens;

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

    // Unload model
    document.getElementById("wfm-ai-unload-btn")?.addEventListener("click", async () => {
        const backend = document.querySelector("input[name='wfm-ai-backend']:checked")?.value || "ollama";
        const url = urlInput?.value?.trim() || "";
        const model = document.getElementById("wfm-ai-model-select")?.value || "";
        // Ollama: unload every loaded model incl. decision models (same server step as Settings → VRAM Management)
        if (backend === "ollama") { await unloadAllOllamaModels(url); return; }
        if (!model) { showToast(t("aiUnloadNoModel"), "error"); return; }
        try {
            await unloadAiModel(url, backend, model);
            showToast(t("aiUnloadDone"), "success");
        } catch (err) {
            showToast(err.message === "UNSUPPORTED" ? t("aiUnloadUnsupported") : t("aiUnloadFailed") + err.message, "error");
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
        const thinkingMode = !!thinkingModeCheckbox?.checked;
        const maxTokens = Math.max(0, parseInt(maxTokensInput?.value, 10) || 0);

        if (url && !isValidBackendUrl(url)) {
            showToast(t("aiToastInvalidUrl"), "error");
            return;
        }

        saveAiSettings({
            backend, backendUrl: url, model, freeSrcLang, freeDstLang,
            thinkingMode, maxTokens,
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
        description: "Generate an image using the currently loaded ComfyUI workflow. If an image is currently attached to the conversation, this performs image-to-image generation using that image as the base; otherwise it performs text-to-image. Call this when the user asks to create, draw, paint, edit, or transform an image. All parameters besides prompt are optional — omit any the user didn't specify and the workflow's own current setting is kept.",
        parameters: {
            type: "object",
            properties: {
                prompt: { type: "string", description: "Positive prompt describing the desired image." },
                negative_prompt: { type: "string", description: "What to avoid in the image. Optional." },
                steps: { type: "integer", description: "Sampling steps. Optional." },
                cfg: { type: "number", description: "Classifier-free guidance scale. Optional." },
                sampler_name: { type: "string", description: "ComfyUI sampler name (e.g. euler, dpmpp_2m, ddim). Optional." },
                scheduler: { type: "string", description: "ComfyUI scheduler name (e.g. normal, karras, simple). Optional." },
                denoise: { type: "number", description: "Denoise strength 0-1 (mainly relevant for image-to-image). Optional." },
                seed: { type: "integer", description: "Fixed seed. Omit for a random seed each time. Optional." },
                width: { type: "integer", description: "Output image width in pixels. Ignored if the workflow has a Resolution Selector node — use aspect_ratio instead for those. Optional." },
                height: { type: "integer", description: "Output image height in pixels. Ignored if the workflow has a Resolution Selector node — use aspect_ratio instead for those. Optional." },
                aspect_ratio: { type: "string", enum: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"], description: "Aspect ratio preset. Only applied if the workflow has a Resolution Selector node (feeding width/height from a ratio + megapixel target); ignored otherwise. Optional." },
                batch_size: { type: "integer", description: "Number of images to generate in this single call. Optional." },
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

async function callChat(url, backend, model, messages, tools, settings = {}) {
    const formattedMessages = _formatMessagesForBackend(messages, backend);
    if (backend === "ollama") {
        const body = _applyGenOptions({ model, messages: formattedMessages, stream: false }, backend, settings);
        if (tools) body.tools = tools;
        const res = await fetch(`${url}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const message = (await res.json()).message || {};
        const content = message.content || "";
        return { content: settings.thinkingMode ? content : stripThinkingTags(content), toolCalls: message.tool_calls || null };
    } else if (backend === "unsloth") {
        const body = _applyGenOptions({ model, messages: formattedMessages, stream: false }, backend, settings);
        if (tools) { body.tools = tools; body.tool_choice = "auto"; }
        const data = await unslothProxy(url, "/v1/chat/completions", "POST", body);
        const message = data.choices?.[0]?.message || {};
        const content = _unslothContent(message);
        return { content: settings.thinkingMode ? content : stripThinkingTags(content), toolCalls: message.tool_calls || null };
    } else {
        const body = _applyGenOptions({ model, messages: formattedMessages, stream: false }, backend, settings);
        if (tools) { body.tools = tools; body.tool_choice = "auto"; }
        const res = await fetch(`${url}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const message = (await res.json()).choices?.[0]?.message || {};
        const content = message.content || "";
        return { content: settings.thinkingMode ? content : stripThinkingTags(content), toolCalls: message.tool_calls || null };
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

async function generateImageFromChat(prompt, negativePrompt, params = {}) {
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

    const { steps, cfg, sampler_name, scheduler, denoise, seed, width, height, batch_size, aspect_ratio } = params;
    let resolvedAspectRatio = null;
    const resSelector = analysis.resolution_selector_nodes?.[0];
    if (aspect_ratio && resSelector) {
        resolvedAspectRatio = await comfyEditor.resolveAspectRatioOption(resSelector.type, aspect_ratio);
    }
    comfyEditor.setGenerationParams({
        steps, cfg, sampler_name, scheduler, denoise, seed, width, height, batch_size,
        resolvedAspectRatio, workflow, analysis,
    });

    const result = await window._wfmGenerateTab.generate(workflow, seed != null ? { seedValue: seed } : {});
    const images = result?.images || [];
    if (images.length === 0) throw new Error(t("aiChatNoImageProduced"));

    return images.map((img) =>
        `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${encodeURIComponent(img.type || "output")}`
    );
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

// アシスタント応答から ```skill フェンスを抽出する（Skill Creator用スキルが出力する完成品ブロック）
function _extractSkillBlock(text) {
    if (!text) return null;
    const m = text.match(/```skill\s*([\s\S]*?)```/i);
    return m ? m[1].trim() : null;
}

// frontmatterの name から保存用ファイル名を推測する（未設定時は my-skill.md）
function _slugifySkillName(content) {
    const m = content.match(/^---\r?\n[\s\S]*?name:\s*(.+?)\r?\n/);
    const name = (m ? m[1] : "").trim();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return `${slug || "my-skill"}.md`;
}

// 応答内にスキル定義ブロックがあれば「スキルとして保存」ボタンを追加する。
// クリックすると管理パネルを開き、新規スキルとしてエディタに内容を流し込む（保存前にレビュー可能）。
function _appendSkillSaveButton(container, skillContent) {
    const btn = document.createElement("button");
    btn.className = "wfm-btn wfm-btn-sm";
    btn.textContent = t("aiChatSaveAsSkill");
    btn.addEventListener("click", () => {
        const panel = document.getElementById("wfm-ai-skill-panel");
        if (panel) panel.style.display = "";
        skillOpenEditor(null, skillContent);
        const nameInput = document.getElementById("wfm-ai-skill-editor-filename");
        if (nameInput) nameInput.value = _slugifySkillName(skillContent);
    });
    container.appendChild(btn);
}

// ============================================
// ```prompt block (T2I Prompt Enhancer etc.) — parse + action buttons
// ============================================

// ```prompt フェンス内の "positive:" / "negative:" を取り出す。
// 各キーは次のキー行までを値とみなす（複数行にも対応）。キーが無い場合は全体を positive とする。
function _extractPromptBlock(text) {
    if (!text) return null;
    const m = text.match(/```prompt[^\n]*\n([\s\S]*?)```/i);
    if (!m) return null;
    const body = m[1];
    const result = { positive: "", negative: null };
    const keyRe = /^\s*(positive|negative)\s*(?:prompt)?\s*:\s*/i;
    let current = null;
    const buf = { positive: [], negative: [] };
    for (const line of body.split(/\r?\n/)) {
        const km = line.match(keyRe);
        if (km) {
            current = km[1].toLowerCase();
            buf[current].push(line.slice(km[0].length));
        } else if (current) {
            buf[current].push(line);
        } else if (line.trim()) {
            current = "positive";
            buf.positive.push(line);
        }
    }
    result.positive = buf.positive.join(" ").replace(/\s+/g, " ").trim();
    if (buf.negative.length) result.negative = buf.negative.join(" ").replace(/\s+/g, " ").trim();
    return result;
}

// プロンプトブロックの下に「GenerateUIに反映」「このプロンプトで生成」「コピー」ボタンを付ける
function _appendPromptActions(container, block, messagesEl) {
    const row = document.createElement("div");
    row.className = "wfm-ai-chat-actions";

    const applyBtn = document.createElement("button");
    applyBtn.className = "wfm-btn wfm-btn-sm";
    applyBtn.textContent = t("aiChatApplyPrompt");
    applyBtn.title = t("aiChatApplyPromptTip");
    applyBtn.addEventListener("click", () => {
        if (!comfyUI.currentWorkflow || !comfyUI.currentAnalysis) {
            showToast(t("aiChatNoWorkflowLoaded"), "error");
            return;
        }
        comfyEditor.setPromptText("positive", block.positive);
        if (block.negative != null) comfyEditor.setPromptText("negative", block.negative);
        showToast(t("aiChatPromptApplied"), "success");
    });

    const genBtn = document.createElement("button");
    genBtn.className = "wfm-btn wfm-btn-sm wfm-btn-primary";
    genBtn.textContent = t("aiChatGenerateWithPrompt");
    genBtn.addEventListener("click", async () => {
        genBtn.disabled = true;
        try {
            const imageUrls = await generateImageFromChat(block.positive, block.negative || "", {});
            appendChatBubble(messagesEl, "assistant", "", { imageUrls });
        } catch (e) {
            showToast(t("aiToastImageGenFailed") + e.message, "error");
        } finally {
            genBtn.disabled = false;
        }
    });

    const copyBtn = document.createElement("button");
    copyBtn.className = "wfm-btn wfm-btn-sm";
    copyBtn.textContent = t("aiChatCopyPrompt");
    copyBtn.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(block.positive);
            showToast(t("aiChatPromptCopied"), "success");
        } catch (e) {
            showToast(t("errorWithMsg", e.message), "error");
        }
    });

    row.append(applyBtn, genBtn, copyBtn);
    container.appendChild(row);
}

// ============================================
// Skill output auto-check (metadata.output)
// ============================================

// SVGを検証し、問題点（英語、LLMへのフィードバック用）の配列を返す。空配列なら合格。
function _validateSvg(svgCode) {
    if (!svgCode) return [];
    const problems = [];
    const doc = new DOMParser().parseFromString(svgCode, "image/svg+xml");
    const err = doc.querySelector("parsererror");
    if (err) {
        const detail = (err.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300);
        return [`The SVG is not well-formed XML: ${detail}`];
    }
    const root = doc.documentElement;
    if (!root || root.localName !== "svg") return ["The root element must be <svg>."];
    if (!root.getAttribute("viewBox")) problems.push("The <svg> element has no viewBox attribute.");
    if (root.namespaceURI !== "http://www.w3.org/2000/svg") problems.push('The <svg> element is missing xmlns="http://www.w3.org/2000/svg".');
    const forbidden = new Set();
    for (const el of [root, ...root.querySelectorAll("*")]) {
        const name = el.localName.toLowerCase();
        if (name === "script" || name === "foreignobject") forbidden.add(`<${el.localName}>`);
        for (const attr of el.attributes) {
            const an = attr.name.toLowerCase();
            if (an.startsWith("on")) forbidden.add(`${attr.name} attribute`);
            if ((an === "href" || an === "xlink:href") && /^\s*(https?:|javascript:|data:)/i.test(attr.value)) {
                forbidden.add(`external ${attr.name}`);
            }
        }
    }
    if (forbidden.size) problems.push(`Remove forbidden content: ${[...forbidden].join(", ")}.`);
    const drawables = root.querySelectorAll("path,circle,ellipse,rect,polygon,polyline,line,text,use");
    if (drawables.length === 0) problems.push("The SVG contains no visible shapes.");
    return problems;
}

// スキルの metadata.output に応じて応答を検証する。問題が無ければ空配列。
// 「成果物を出そうとして壊れている」場合だけを問題とする。成果物が全く無い応答
// （説明だけ頼まれた・確認の質問をしている等）はユーザーの意図を優先して再依頼しない。
function _checkSkillOutput(outputType, content) {
    const text = content || "";
    if (outputType === "svg") {
        const svgCode = _extractSvgCode(text);
        if (!svgCode) {
            return /<svg[\s>]/i.test(text)
                ? ["The <svg> element is not closed. Output one complete <svg>...</svg> element inside a ```svg code block."]
                : [];
        }
        return _validateSvg(svgCode);
    }
    if (outputType === "prompt") {
        const block = _extractPromptBlock(text);
        if (!block) {
            // ```prompt フェンスを付け忘れて "positive:" 行だけ書いた場合（小型モデルで多い）
            return /^[\s*_#>-]*positive(\s+prompt)?[\s*_]*:/im.test(text)
                ? ["The prompt is not inside a fenced block. Put the 'positive:' and 'negative:' lines inside a code block labeled prompt (```prompt ... ```)."]
                : [];
        }
        if (!block.positive) return ["The ```prompt block has an empty 'positive:' line."];
    }
    return [];
}

function _autoCheckFeedback(problems, outputType) {
    const what = outputType === "svg" ? "the complete corrected SVG in a ```svg block" : "the complete corrected ```prompt block";
    return `[Workflow Studio auto-check] Your last answer has these problems:\n- ${problems.join("\n- ")}\nReply with ${what}. Do not apologize or explain at length.`;
}

// ============================================
// Workflow context (metadata.context: [workflow])
// ============================================

// GenerateUIで読み込み中のワークフローを短い英語の要約にする（system promptへ注入）。
// 送信のたびに作り直す（ワークフローは会話中に差し替わり得るため）。
function _buildWorkflowContext() {
    const wf = comfyUI.currentWorkflow;
    const an = comfyUI.currentAnalysis;
    if (!wf || !an) {
        return "## Current workflow context\nNo workflow is loaded in GenerateUI. If the target model matters, ask the user or assume a NATURAL-language model.";
    }
    const modelKeys = ["ckpt_name", "unet_name", "model_name", "clip_name", "clip_name1", "clip_name2", "clip_name3", "clip_name4", "vae_name", "lora_name"];
    const models = new Set();
    const loaderTypes = new Set();
    for (const node of Object.values(wf)) {
        if (!node?.class_type) continue;
        const inputs = node.inputs || {};
        let isLoader = false;
        for (const k of modelKeys) {
            if (typeof inputs[k] === "string" && inputs[k] && inputs[k] !== "None") {
                models.add(`${k}=${inputs[k]}`);
                isLoader = true;
            }
        }
        if (isLoader || /Loader|TextEncode|CLIP/i.test(node.class_type)) loaderTypes.add(node.class_type);
    }
    const lines = ["## Current workflow context (auto-generated by Workflow Studio)"];
    if (models.size) lines.push(`- Model files: ${[...models].slice(0, 12).join("; ")}`);
    if (loaderTypes.size) lines.push(`- Loader / text-encoder node types: ${[...loaderTypes].slice(0, 12).join(", ")}`);
    const prompts = (an.prompt_nodes || []).slice(0, 4);
    if (prompts.length) {
        lines.push(`- Prompt nodes: ${prompts.map((p) => `${p.type} (${p.role || "unknown"})`).join(", ")}`);
        const pos = prompts.find((p) => p.role === "positive" && p.text);
        if (pos) lines.push(`- Current positive prompt: "${String(pos.text).replace(/\s+/g, " ").slice(0, 400)}"`);
        const neg = prompts.find((p) => p.role === "negative" && p.text);
        if (neg) lines.push(`- Current negative prompt: "${String(neg.text).replace(/\s+/g, " ").slice(0, 200)}"`);
    }
    const s = an.sampler_nodes?.[0];
    if (s) {
        const parts = [];
        if (s.steps != null) parts.push(`steps ${s.steps}`);
        if (s.cfg != null) parts.push(`CFG ${s.cfg}`);
        if (s.sampler_name) parts.push(`sampler ${s.sampler_name}`);
        if (parts.length) lines.push(`- Sampler: ${parts.join(", ")}`);
    }
    const l = an.latent_nodes?.[0];
    if (l && l.width && l.height) lines.push(`- Resolution: ${l.width}x${l.height}`);
    if (an.load_image_nodes?.length) lines.push(`- Has ${an.load_image_nodes.length} LoadImage input(s) (image-to-image / edit workflow).`);
    return lines.join("\n");
}

// ============================================
// AI skills (Chat system prompt library)
// ============================================

async function skillFetchFiles() {
    try {
        const res = await fetch("/api/wfm/skills");
        return res.ok ? await res.json() : [];
    } catch { return []; }
}

async function skillFetchContent(filename) {
    try {
        const res = await fetch(`/api/wfm/skills/content?filename=${encodeURIComponent(filename)}`);
        const data = await res.json();
        return data.content ?? null;
    } catch { return null; }
}

async function skillSaveFile(filename, content) {
    try {
        const res = await fetch("/api/wfm/skills/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, content }),
        });
        const data = await res.json();
        return data.status === "ok" ? data.file : null;
    } catch { return null; }
}

async function skillDeleteFile(filename) {
    try {
        await fetch("/api/wfm/skills/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename }),
        });
    } catch { /* ignore */ }
}

// system prompt として送る前に frontmatter (---...---) を取り除く
function _stripSkillFrontmatter(content) {
    const m = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    return (m ? content.slice(m[0].length) : content).trim();
}

let skillFiles = [];
let skillEditingFilename = null; // null = new file
let _activeSkillCache = null; // { filename, content } キャッシュ（送信毎の再フェッチを避ける）

function skillRenderList() {
    const list = document.getElementById("wfm-ai-skill-list");
    if (!list) return;
    list.innerHTML = "";

    if (skillFiles.length === 0) {
        list.innerHTML = `<div class="wfm-pm-empty" style="font-size:12px;">${t("aiSkillNoFiles")}</div>`;
        return;
    }

    for (const f of skillFiles) {
        const item = document.createElement("div");
        item.className = "wfm-wc-file-item";
        item.innerHTML = `
            <div class="wfm-wc-file-item-info">
                <span class="wfm-wc-file-name" title="${escapeHtml(f.description || "")}">${escapeHtml(f.name)}</span>
                <span class="wfm-wc-file-ext">.md</span>
                ${f.builtin ? `<span class="wfm-ai-skill-badge" title="${escapeHtml(t("aiSkillBuiltinTip"))}">${escapeHtml(t("aiSkillBuiltin"))}</span>` : ""}
            </div>
            <div class="wfm-wc-file-item-actions">
                ${f.update_available ? `<button class="wfm-pm-action-btn wfm-ai-skill-update-btn" title="${escapeHtml(t("aiSkillUpdateTip"))}">&#8635;</button>` : ""}
                <button class="wfm-pm-action-btn wfm-ai-skill-edit-btn" title="Edit">&#9998;</button>
            </div>
        `;
        item.querySelector(".wfm-ai-skill-edit-btn").addEventListener("click", async (e) => {
            e.stopPropagation();
            const content = await skillFetchContent(f.filename);
            skillOpenEditor(f.filename, content ?? "");
        });
        item.querySelector(".wfm-ai-skill-update-btn")?.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!confirm(t("aiSkillUpdateConfirm", f.name))) return;
            if (await skillRestoreBuiltin(f.filename)) {
                showToast(t("aiSkillUpdated", f.name), "success");
                _activeSkillCache = null;
                await skillRefreshFiles();
            } else {
                showToast(t("saveFailed"), "error");
            }
        });
        list.appendChild(item);
    }
}

function skillOpenEditor(filename, content) {
    skillEditingFilename = filename || null;

    const editor = document.getElementById("wfm-ai-skill-editor");
    const nameInput = document.getElementById("wfm-ai-skill-editor-filename");
    const contentTA = document.getElementById("wfm-ai-skill-editor-content");
    const deleteBtn = document.getElementById("wfm-ai-skill-editor-delete-btn");

    if (!editor) return;
    nameInput.value = filename || "";
    contentTA.value = content || "";
    deleteBtn.style.display = filename ? "" : "none";
    editor.style.display = "";
    nameInput.focus();
}

function skillCloseEditor() {
    skillEditingFilename = null;
    const editor = document.getElementById("wfm-ai-skill-editor");
    if (editor) editor.style.display = "none";
}

function skillPopulateSelect() {
    const sel = document.getElementById("wfm-ai-chat-skill-select");
    if (!sel) return;
    const settings = loadAiSettings();
    const wanted = sel.value || settings.activeSkillFilename || "";

    sel.innerHTML = `<option value="">-- ${t("aiSkillNone")} --</option>` +
        skillFiles.map((f) => `<option value="${escapeHtml(f.filename)}" title="${escapeHtml(f.description || "")}">${escapeHtml(f.name)}</option>`).join("");

    sel.value = skillFiles.some((f) => f.filename === wanted) ? wanted : "";
    _activeSkillCache = null;
}

async function skillRefreshFiles() {
    skillFiles = await skillFetchFiles();
    skillRenderList();
    skillPopulateSelect();
}

// 選択中スキルの本文と metadata を取得（system prompt注入用、選択が変わるまでキャッシュ）
// 戻り値: null（スキル未選択）または { prompt, meta }
async function _getActiveSkill() {
    const sel = document.getElementById("wfm-ai-chat-skill-select");
    const filename = sel?.value || "";
    if (!filename) return null;
    if (_activeSkillCache?.filename !== filename) {
        const raw = await skillFetchContent(filename);
        const content = _stripSkillFrontmatter(raw || "");
        _activeSkillCache = { filename, content };
    }
    const meta = skillFiles.find((f) => f.filename === filename)?.metadata || {};
    return { prompt: _activeSkillCache.content, meta };
}

async function skillRestoreBuiltin(filename) {
    try {
        const res = await fetch("/api/wfm/skills/restore-builtin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename }),
        });
        const data = await res.json();
        return data.status === "ok";
    } catch { return false; }
}

function initSkillManager() {
    const selectEl = document.getElementById("wfm-ai-chat-skill-select");
    const manageBtn = document.getElementById("wfm-ai-chat-skill-manage-btn");
    const panel = document.getElementById("wfm-ai-skill-panel");
    const closeBtn = document.getElementById("wfm-ai-skill-close-btn");
    const newBtn = document.getElementById("wfm-ai-skill-new-btn");
    const saveBtn = document.getElementById("wfm-ai-skill-editor-save-btn");
    const deleteBtn = document.getElementById("wfm-ai-skill-editor-delete-btn");
    const cancelBtn = document.getElementById("wfm-ai-skill-editor-cancel-btn");

    if (!selectEl) return;

    skillRefreshFiles();

    selectEl.addEventListener("change", () => {
        saveAiSettings({ activeSkillFilename: selectEl.value });
        _activeSkillCache = null;
    });

    manageBtn?.addEventListener("click", () => {
        if (!panel) return;
        const show = panel.style.display === "none";
        panel.style.display = show ? "" : "none";
        if (show) skillRefreshFiles();
    });

    closeBtn?.addEventListener("click", () => {
        if (panel) panel.style.display = "none";
    });

    newBtn?.addEventListener("click", () => {
        skillOpenEditor(null, "---\nname: \ndescription: \n---\n\n");
    });

    saveBtn?.addEventListener("click", async () => {
        const nameInput = document.getElementById("wfm-ai-skill-editor-filename");
        const contentTA = document.getElementById("wfm-ai-skill-editor-content");
        let filename = (nameInput?.value || "").trim();
        const content = contentTA?.value || "";

        if (!filename) { showToast(t("pleaseEnterFilename"), "error"); return; }
        if (!/\.md$/i.test(filename)) filename += ".md";
        if (!/^[\w\-. ]+\.md$/i.test(filename)) { showToast(t("invalidPathFormat"), "error"); return; }

        const saved = await skillSaveFile(filename, content);
        if (saved) {
            showToast(t("savedAs", filename), "success");
            skillCloseEditor();
            await skillRefreshFiles();
            selectEl.value = filename;
            saveAiSettings({ activeSkillFilename: filename });
            _activeSkillCache = null;
        } else {
            showToast(t("saveFailed"), "error");
        }
    });

    deleteBtn?.addEventListener("click", async () => {
        if (!skillEditingFilename) return;
        if (!confirm(`Delete "${skillEditingFilename}"?`)) return;
        await skillDeleteFile(skillEditingFilename);
        showToast(t("deletedName", skillEditingFilename), "success");
        if (selectEl.value === skillEditingFilename) {
            saveAiSettings({ activeSkillFilename: "" });
            _activeSkillCache = null;
        }
        skillCloseEditor();
        await skillRefreshFiles();
    });

    cancelBtn?.addEventListener("click", () => skillCloseEditor());
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
    if (opts.imageUrls?.length) {
        opts.imageUrls.forEach((url) => {
            const img = document.createElement("img");
            img.src = url;
            img.className = "wfm-ai-chat-img";
            div.appendChild(img);
        });
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
        const skillBlock = _extractSkillBlock(content);
        if (skillBlock) _appendSkillSaveButton(div, skillBlock);
        const promptBlock = _extractPromptBlock(content);
        if (promptBlock?.positive) _appendPromptActions(div, promptBlock, messagesEl);
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

    initSkillManager();

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

        // 失敗時にこの送信で追加した履歴・吹き出しをまとめて取り消すための位置
        const historyMark = chatHistory.length - 1;
        const domMark = messagesEl.children.length - 1;

        try {
            const skill = await _getActiveSkill();
            const meta = skill?.meta || {};
            // metadata.tools が配列なら、その中に generate_image がある場合だけツールを渡す
            // （トグルがオフなら常に渡さない）。未指定のスキルは従来どおりトグルに従う。
            const imgGenOn = imgGenToggle?.checked !== false;
            const toolsAllowed = Array.isArray(meta.tools) ? meta.tools.includes("generate_image") : true;
            const tools = imgGenOn && toolsAllowed ? IMAGE_GEN_TOOLS : undefined;
            const chatSettings = { ...settings };
            if (typeof meta.temperature === "number") chatSettings.temperature = meta.temperature;
            if (typeof meta.think === "boolean") chatSettings.thinkingMode = meta.think;

            let systemPrompt = skill?.prompt || "";
            const contexts = Array.isArray(meta.context) ? meta.context : [];
            if (contexts.includes("workflow")) systemPrompt += `\n\n${_buildWorkflowContext()}`;
            const buildMessages = () => systemPrompt.trim()
                ? [{ role: "system", content: systemPrompt.trim() }, ...chatHistory]
                : chatHistory;

            let reply = await callChat(url, backend, model, buildMessages(), tools, chatSettings);

            // metadata.output があれば応答を検証し、問題があれば具体的なエラーを添えて1回だけ再依頼する
            const outputType = typeof meta.output === "string" ? meta.output.toLowerCase() : "";
            if (outputType && meta["auto-check"] !== false && !reply.toolCalls?.length) {
                const problems = _checkSkillOutput(outputType, reply.content);
                if (problems.length) {
                    chatHistory.push({ role: "assistant", content: reply.content });
                    appendChatBubble(messagesEl, "assistant", reply.content);
                    const feedback = _autoCheckFeedback(problems, outputType);
                    chatHistory.push({ role: "user", content: feedback });
                    appendChatBubble(messagesEl, "notice", t("aiChatAutoCheckRetry", problems.join(" / ")));
                    statusEl.textContent = t("aiStatusAutoFixing");
                    reply = await callChat(url, backend, model, buildMessages(), undefined, chatSettings);
                    const remaining = _checkSkillOutput(outputType, reply.content);
                    if (remaining.length) {
                        appendChatBubble(messagesEl, "notice", t("aiChatAutoCheckStillFailing", remaining.join(" / ")));
                    }
                }
            }
            const toolCall = reply.toolCalls?.find(
                (tc) => (tc.function?.name || tc.name) === "generate_image"
            );

            if (toolCall) {
                chatHistory.push({ role: "assistant", content: reply.content || "" });
                if (reply.content) appendChatBubble(messagesEl, "assistant", reply.content);

                statusEl.textContent = t("aiStatusGeneratingImage");
                const args = _parseToolArgs(toolCall);
                try {
                    const imageUrls = await generateImageFromChat(args.prompt, args.negative_prompt, args);
                    appendChatBubble(messagesEl, "assistant", "", { imageUrls });
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
            chatHistory.length = Math.max(0, historyMark);
            while (messagesEl.children.length > Math.max(0, domMark)) messagesEl.removeChild(messagesEl.lastChild);
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
                const result = await callLLM(url, backend, model, prompt, settings);
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
            const result = await callVLM(url, backend, model, VLM_PROMPTS[task], _toolsImage.base64, _toolsImage.mimeType, settings);
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

// gallery-tab.js の外部（Comic Creator）向けブリッジ（半自動マンガ作成の画像プロンプト
// 下書き機能）が、設定タブと同じAI接続設定・LLM呼び出しロジックを再利用するためのexport。
export { callLLM, loadAiSettings, isValidBackendUrl };

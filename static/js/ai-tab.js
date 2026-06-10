/**
 * AI Tab - Translation, VLM, Settings
 * Supports Ollama and LM Studio as backends
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { readJsonStorage } from "./util.js";

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
        const url = backendUrl || (backend === "ollama" ? "http://localhost:11434" : "http://localhost:1234");

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

    // Update URL placeholder when backend changes
    backendRadios.forEach((r) => {
        r.addEventListener("change", () => {
            if (!urlInput) return;
            const defaultUrl = r.value === "ollama" ? "http://localhost:11434" : "http://localhost:1234";
            if (!saved.backendUrl) urlInput.value = defaultUrl;
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

    // Save settings
    document.getElementById("wfm-ai-settings-save-btn")?.addEventListener("click", () => {
        const backend = document.querySelector("input[name='wfm-ai-backend']:checked")?.value || "ollama";
        const url = urlInput?.value?.trim() || "";
        const model = document.getElementById("wfm-ai-model-select")?.value || "";
        const freeSrcLang = freeSrcInput?.value?.trim() || "";
        const freeDstLang = freeDstInput?.value?.trim() || "";

        if (url && !isValidBackendUrl(url)) {
            showToast(t("aiToastInvalidUrl"), "error");
            return;
        }

        saveAiSettings({ backend, backendUrl: url, model, freeSrcLang, freeDstLang });
        showToast(t("aiToastSettingsSaved"), "success");
    });

    // Load models on init if settings exist
    if (saved.backendUrl && saved.backend) {
        refreshModels().catch(() => {});
    }
}

// ============================================
// VLM tab
// ============================================

function initVlmTab() {
    const dropEl    = document.getElementById("wfm-ai-vlm-drop");
    const previewEl = document.getElementById("wfm-ai-vlm-preview");
    const labelEl   = document.getElementById("wfm-ai-vlm-label");
    const fileInput = document.getElementById("wfm-ai-vlm-file");
    const taskSel   = document.getElementById("wfm-ai-vlm-task");
    const runBtn    = document.getElementById("wfm-ai-vlm-run");
    const statusEl  = document.getElementById("wfm-ai-vlm-status");
    const resultEl  = document.getElementById("wfm-ai-vlm-result");
    const copyBtn   = document.getElementById("wfm-ai-vlm-copy");

    if (!dropEl) return;

    let vlmImage = null; // { base64, mimeType }

    const loadImage = async (file) => {
        if (!file || !file.type.startsWith("image/")) return;
        vlmImage = await fileToBase64(file);
        previewEl.src = `data:${vlmImage.mimeType};base64,${vlmImage.base64}`;
        previewEl.style.display = "block";
        labelEl.style.display = "none";
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

    runBtn.addEventListener("click", async () => {
        if (!vlmImage) { showToast(t("aiToastNoImage"), "error"); return; }

        const settings = loadAiSettings();
        const { backend = "ollama", backendUrl, model } = settings;
        const url = backendUrl || (backend === "ollama" ? "http://localhost:11434" : "http://localhost:1234");

        if (!isValidBackendUrl(url)) {
            showToast(t("aiToastInvalidUrl"), "error");
            return;
        }
        if (!model) { showToast(t("aiToastNoModel"), "error"); return; }

        const task = taskSel?.value || "describe";
        runBtn.disabled = true;
        statusEl.textContent = t("aiStatusRunning");
        statusEl.className = "wfm-ai-trans-status wfm-ai-status-working";
        resultEl.value = "";

        try {
            const result = await callVLM(url, backend, model, VLM_PROMPTS[task], vlmImage.base64, vlmImage.mimeType);
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
    initVlmTab();
    initSettingsTab();
}

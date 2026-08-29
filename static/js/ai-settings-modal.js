/**
 * Shared AI backend settings modal (Backend / Connection / Model / Generation / Unload / Save).
 * Used by the Prompt tab and Tagger tab, each with its own localStorage key so their
 * settings stay independent — mirrors the AI TOOL tab's own settings pane (ai-tab.js).
 */

import { openModal, closeModal, showToast } from "./app.js";
import { t } from "./i18n.js";
import { readJsonStorage, getAiBackendDefaultUrl, unslothProxy, unloadAiModel } from "./util.js";

function loadCfg(storageKey) {
    return readJsonStorage(storageKey);
}

function saveCfg(storageKey, patch) {
    const data = { ...loadCfg(storageKey), ...patch };
    localStorage.setItem(storageKey, JSON.stringify(data));
    return data;
}

// 保存済み設定を {backend, url, model, thinkingMode, maxTokens} の形で返す
export function getAiBackendConfig(storageKey) {
    const s = loadCfg(storageKey);
    const backend = s.backend || "ollama";
    const url = (s.backendUrl || getAiBackendDefaultUrl(backend)).replace(/\/$/, "");
    return {
        backend,
        url,
        model: s.model || "",
        thinkingMode: !!s.thinkingMode,
        maxTokens: Math.max(0, parseInt(s.maxTokens, 10) || 0),
    };
}

function isValidBackendUrl(url) {
    try {
        const u = new URL(url);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

async function fetchBackendModels(url, backend) {
    if (backend === "ollama") {
        const res = await fetch(`${url}/api/tags`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()).models?.map(m => m.name) || [];
    } else if (backend === "unsloth") {
        const data = await unslothProxy(url, "/v1/models", "GET");
        return (data.data || []).map(m => m.id);
    } else {
        const res = await fetch(`${url}/v1/models`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return ((await res.json()).data || []).map(m => m.id);
    }
}

/**
 * @param {string} storageKey localStorage key holding {backend, backendUrl, model, thinkingMode, maxTokens}
 * @param {string} title modal title
 * @param {() => void} [onSaved] called after Save persists the config (e.g. to refresh a status label)
 */
export function openAiBackendSettingsModal(storageKey, title, onSaved) {
    const saved = loadCfg(storageKey);
    const backend = saved.backend || "ollama";

    const html = `
        <div class="wfm-ai-settings-container">
            <div class="wfm-ai-settings-section">
                <div class="wfm-ai-settings-title">${t("aiSettingsBackend")}</div>
                <div class="wfm-ai-backend-row">
                    ${[["ollama", "Ollama"], ["lmstudio", "LM Studio"], ["lemonade", "Lemonade"], ["unsloth", "Unsloth"]].map(([v, label]) => `
                        <label class="wfm-ai-radio-label">
                            <input type="radio" name="wfm-aism-backend" value="${v}" ${v === backend ? "checked" : ""}> ${label}
                        </label>`).join("")}
                </div>
            </div>
            <div class="wfm-ai-settings-section">
                <div class="wfm-ai-settings-title">${t("aiSettingsConnection")}</div>
                <div class="wfm-ai-settings-row">
                    <label class="wfm-ai-label">URL</label>
                    <input type="text" id="wfm-aism-url" class="wfm-input wfm-ai-url-input" value="${saved.backendUrl || getAiBackendDefaultUrl(backend)}">
                </div>
                <div class="wfm-ai-settings-row">
                    <button id="wfm-aism-test-btn" class="wfm-btn">${t("aiSettingsTestBtn")}</button>
                    <button id="wfm-aism-unload-btn" class="wfm-btn">${t("aiUnloadModel")}</button>
                </div>
                <div class="wfm-ai-settings-row">
                    <span id="wfm-aism-test-result" class="wfm-ai-test-result"></span>
                </div>
            </div>
            <div class="wfm-ai-settings-section">
                <div class="wfm-ai-settings-title">${t("aiSettingsModelSection")}</div>
                <div class="wfm-ai-settings-row">
                    <select id="wfm-aism-model" class="wfm-select wfm-ai-model-select">
                        <option value="">${t("selectModel")}</option>
                    </select>
                    <button id="wfm-aism-refresh-btn" class="wfm-btn">${t("aiSettingsRefreshBtn")}</button>
                </div>
            </div>
            <div class="wfm-ai-settings-section">
                <div class="wfm-ai-settings-title">${t("aiSettingsGenerationTitle")}</div>
                <div class="wfm-ai-settings-row">
                    <label class="wfm-ai-label" style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" id="wfm-aism-thinking"> ${t("aiSettingsThinkingMode")}
                    </label>
                </div>
                <div class="wfm-ai-settings-row">
                    <label class="wfm-ai-label">${t("aiSettingsMaxTokens")}</label>
                    <input type="number" id="wfm-aism-max-tokens" class="wfm-input" min="0" step="1" placeholder="${t("aiSettingsMaxTokensPlaceholder")}">
                </div>
            </div>
            <div class="wfm-ai-settings-section">
                <button id="wfm-aism-save-btn" class="wfm-btn wfm-btn-primary">${t("aiSettingsSaveBtn")}</button>
            </div>
        </div>`;

    openModal(title, html);

    const urlInput = document.getElementById("wfm-aism-url");
    const modelSelect = document.getElementById("wfm-aism-model");
    const thinkingCheckbox = document.getElementById("wfm-aism-thinking");
    const maxTokensInput = document.getElementById("wfm-aism-max-tokens");
    const testResultEl = document.getElementById("wfm-aism-test-result");

    thinkingCheckbox.checked = !!saved.thinkingMode;
    if (saved.maxTokens) maxTokensInput.value = saved.maxTokens;

    function currentBackend() {
        return document.querySelector("input[name='wfm-aism-backend']:checked")?.value || "ollama";
    }

    async function populateModels(selectedModel) {
        const url = urlInput.value.trim();
        try {
            const models = await fetchBackendModels(url, currentBackend());
            modelSelect.innerHTML = models.length
                ? models.map(name => `<option value="${name}" ${name === selectedModel ? "selected" : ""}>${name}</option>`).join("")
                : `<option value="">${t("noModelsFound")}</option>`;
        } catch {
            modelSelect.innerHTML = `<option value="">${t("noModelsFound")}</option>`;
        }
    }
    populateModels(saved.model || "");

    document.querySelectorAll("input[name='wfm-aism-backend']").forEach(r => {
        r.addEventListener("change", () => {
            urlInput.value = getAiBackendDefaultUrl(r.value);
            testResultEl.textContent = "";
        });
    });

    document.getElementById("wfm-aism-refresh-btn")?.addEventListener("click", () => populateModels(modelSelect.value));

    document.getElementById("wfm-aism-test-btn")?.addEventListener("click", async () => {
        const url = urlInput.value.trim();
        if (!isValidBackendUrl(url)) {
            testResultEl.textContent = t("aiToastInvalidUrlInput");
            testResultEl.className = "wfm-ai-test-result wfm-ai-status-error";
            return;
        }
        testResultEl.textContent = t("aiStatusConnecting");
        testResultEl.className = "wfm-ai-test-result wfm-ai-status-working";
        try {
            const models = await fetchBackendModels(url, currentBackend());
            testResultEl.textContent = `${t("aiStatusConnectOk")} (${models.length} ${t("aiModels")})`;
            testResultEl.className = "wfm-ai-test-result wfm-ai-status-ok";
            await populateModels(modelSelect.value);
        } catch (err) {
            testResultEl.textContent = `${t("aiStatusConnectFail")}${err.message}`;
            testResultEl.className = "wfm-ai-test-result wfm-ai-status-error";
        }
    });

    document.getElementById("wfm-aism-unload-btn")?.addEventListener("click", async () => {
        const url = urlInput.value.trim();
        const model = modelSelect.value;
        if (!model) { showToast(t("aiUnloadNoModel"), "error"); return; }
        try {
            await unloadAiModel(url, currentBackend(), model);
            showToast(t("aiUnloadDone"), "success");
        } catch (err) {
            showToast(err.message === "UNSUPPORTED" ? t("aiUnloadUnsupported") : t("aiUnloadFailed") + err.message, "error");
        }
    });

    document.getElementById("wfm-aism-save-btn")?.addEventListener("click", () => {
        const url = urlInput.value.trim();
        if (url && !isValidBackendUrl(url)) {
            showToast(t("aiToastInvalidUrl"), "error");
            return;
        }
        saveCfg(storageKey, {
            backend: currentBackend(),
            backendUrl: url,
            model: modelSelect.value,
            thinkingMode: !!thinkingCheckbox.checked,
            maxTokens: Math.max(0, parseInt(maxTokensInput.value, 10) || 0),
        });
        showToast(t("aiToastSettingsSaved"), "success");
        closeModal();
        if (onSaved) onSaved();
    });
}

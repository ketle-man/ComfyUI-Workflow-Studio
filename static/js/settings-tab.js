/**
 * Settings Tab - Language, ComfyUI, Ollama, Default Workflow, Eagle
 */

import { showToast } from "./app.js";
import { comfyUI } from "./comfyui-client.js";
import { t, getLang, getSummaryLang, setLang, setSummaryLang, getLanguageOptions, getSummaryLanguageOptions } from "./i18n.js";

const SETTINGS_KEY = "wfm_settings";

function loadLocalSettings() {
    try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {
        return {};
    }
}

function saveLocalSettings(patch) {
    const data = { ...loadLocalSettings(), ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    return data;
}

async function loadServerSettings() {
    try {
        const res = await fetch("/api/wfm/settings");
        return await res.json();
    } catch {
        return {};
    }
}

async function saveServerSettings(patch) {
    try {
        const res = await fetch("/api/wfm/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
        });
        return await res.json();
    } catch {
        return {};
    }
}

function buildLangOptions(optionsMap, selectedValue) {
    return Object.entries(optionsMap)
        .map(([code, label]) => `<option value="${code}" ${code === selectedValue ? "selected" : ""}>${label}</option>`)
        .join("");
}

export async function initSettingsTab() {
    const container = document.querySelector("#wfm-tab-settings .wfm-settings-container");
    if (!container) return;

    const settings = loadLocalSettings();
    const serverSettings = await loadServerSettings();

    // Load current workflows dir info
    let workflowsDirInfo = { current: "", default: "" };
    try {
        const res = await fetch("/api/wfm/settings/workflows-dir");
        workflowsDirInfo = await res.json();
    } catch {}


    const uiLang = getLang();
    const summaryLang = getSummaryLang();

    container.innerHTML = `
        <h2 style="font-size:18px;margin-bottom:20px;">${t("settingsTitle")}</h2>

        <!-- Language Settings -->
        <div style="border:1px solid var(--wfm-border);border-radius:var(--wfm-radius);padding:16px;margin-bottom:20px;">
            <h3 style="font-size:15px;margin-bottom:12px;">${t("langLabel")} / ${t("summaryLangLabel")}</h3>
            <div class="wfm-form-group">
                <label>${t("langLabel")}</label>
                <select class="wfm-select" id="wfm-settings-ui-lang">
                    ${buildLangOptions(getLanguageOptions(), uiLang)}
                </select>
            </div>
            <div class="wfm-form-group">
                <label>${t("summaryLangLabel")}</label>
                <select class="wfm-select" id="wfm-settings-summary-lang">
                    ${buildLangOptions(getSummaryLanguageOptions(), summaryLang)}
                </select>
                <small style="color:var(--wfm-warning);font-size:11px;display:block;margin-top:4px;">
                    ⚠ ${t("summaryLangNote")}
                </small>
            </div>
        </div>

        <!-- Workflow Data Folder -->
        <div style="border:1px solid var(--wfm-border);border-radius:var(--wfm-radius);padding:16px;margin-bottom:20px;">
            <h3 style="font-size:15px;margin-bottom:12px;">${t("workflowsDir")}</h3>
            <div class="wfm-form-group">
                <label>${t("workflowsDirLabel")}</label>
                <div style="display:flex;gap:8px;">
                    <input type="text" class="wfm-input" id="wfm-settings-workflows-dir"
                        value="${serverSettings.workflows_dir || ""}"
                        placeholder="${workflowsDirInfo.default}">
                    <button class="wfm-btn wfm-btn-primary wfm-btn-sm" id="wfm-settings-workflows-dir-apply">${t("workflowsDirApply")}</button>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-settings-workflows-dir-reset">${t("workflowsDirDefault")}</button>
                </div>
                <small style="color:var(--wfm-text-secondary);font-size:11px;display:block;margin-top:4px;">
                    ${t("workflowsDirHint")}
                </small>
                <div style="font-size:11px;color:var(--wfm-text-secondary);margin-top:6px;">
                    ${t("workflowsDirCurrent")}: <code id="wfm-settings-workflows-dir-current" style="color:var(--wfm-primary);word-break:break-all;">${workflowsDirInfo.current}</code>
                </div>
            </div>
        </div>

        <!-- ComfyUI Settings -->
        <div style="border:1px solid var(--wfm-border);border-radius:var(--wfm-radius);padding:16px;margin-bottom:20px;">
            <h3 style="font-size:15px;margin-bottom:12px;">${t("comfyuiConnection")}</h3>
            <div class="wfm-form-group">
                <label>${t("comfyuiUrl")}</label>
                <div style="display:flex;gap:8px;">
                    <input type="text" class="wfm-input" id="wfm-settings-comfyui-url"
                        value="${settings.comfyuiUrl || ""}"
                        placeholder="${t("comfyuiUrlHint")}">
                    <button class="wfm-btn" id="wfm-settings-test-url">${t("test")}</button>
                </div>
                <small style="color:var(--wfm-text-secondary);font-size:11px;">
                    ${t("comfyuiUrlHint")}
                </small>
            </div>
            <div id="wfm-settings-url-status" style="font-size:12px;margin-top:4px;"></div>
        </div>

        <!-- Ollama Settings -->
        <div style="border:1px solid var(--wfm-border);border-radius:var(--wfm-radius);padding:16px;margin-bottom:20px;">
            <h3 style="font-size:15px;margin-bottom:12px;">${t("ollamaSettings")}</h3>
            <div class="wfm-form-group">
                <label>${t("ollamaUrl")}</label>
                <input type="text" class="wfm-input" id="wfm-settings-ollama-url"
                    value="${serverSettings.ollama_url || "http://localhost:11434"}"
                    placeholder="http://localhost:11434">
            </div>
            <div class="wfm-form-group">
                <label>${t("ollamaDefaultModel")}</label>
                <div style="display:flex;gap:8px;">
                    <select class="wfm-select" id="wfm-settings-ollama-model" style="flex:1;">
                        <option value="">${t("selectModel")}</option>
                    </select>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-settings-ollama-refresh">${t("refresh")}</button>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:8px;">
                <button class="wfm-btn wfm-btn-primary wfm-btn-sm" id="wfm-settings-ollama-save">${t("saveOllama")}</button>
                <button class="wfm-btn wfm-btn-sm" id="wfm-settings-ollama-test">${t("testConnection")}</button>
                <span id="wfm-settings-ollama-status" style="font-size:12px;line-height:28px;"></span>
            </div>
        </div>

        <!-- Default Workflow -->
        <div style="border:1px solid var(--wfm-border);border-radius:var(--wfm-radius);padding:16px;margin-bottom:20px;">
            <h3 style="font-size:15px;margin-bottom:12px;">${t("defaultWorkflow")}</h3>
            <div class="wfm-form-group">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:13px;" id="wfm-settings-default-wf-name">${settings.defaultWorkflow || t("defaultWorkflowNone")}</span>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-settings-clear-wf" ${settings.defaultWorkflow ? "" : "disabled"}>${t("clear")}</button>
                </div>
                <small style="color:var(--wfm-text-secondary);font-size:11px;display:block;margin-top:6px;">
                    ${t("defaultWorkflowHint")}
                </small>
            </div>
        </div>

        <!-- Eagle Integration (optional) -->
        <div style="border:1px solid var(--wfm-border);border-radius:var(--wfm-radius);padding:16px;margin-bottom:20px;">
            <h3 style="font-size:15px;margin-bottom:12px;">${t("eagleIntegration")}</h3>
            <div class="wfm-form-group">
                <label>${t("eagleUrl")}</label>
                <div style="display:flex;gap:8px;">
                    <input type="text" class="wfm-input" id="wfm-settings-eagle-url"
                        value="${settings.eagleUrl || "http://localhost:41595"}"
                        placeholder="http://localhost:41595">
                    <button class="wfm-btn" id="wfm-settings-test-eagle">${t("test")}</button>
                </div>
            </div>
            <div id="wfm-settings-eagle-status" style="font-size:12px;margin-top:4px;"></div>
            <div class="wfm-form-group" style="margin-top:8px;">
                <label>
                    <input type="checkbox" id="wfm-settings-eagle-auto-save"
                        ${settings.eagleAutoSave ? "checked" : ""}>
                    ${t("eagleAutoSave")}
                </label>
            </div>
        </div>

        <!-- Save Button -->
        <button class="wfm-btn wfm-btn-primary" id="wfm-settings-save" style="min-width:120px;">${t("saveSettings")}</button>
    `;

    // --- Language change handlers ---
    document.getElementById("wfm-settings-ui-lang")?.addEventListener("change", (e) => {
        const lang = e.target.value;
        setLang(lang);
        saveLocalSettings({ ...loadLocalSettings(), uiLang: lang });
        // Re-render the entire page to apply new language
        showToast("Language changed. Reloading...", "success");
        setTimeout(() => location.reload(), 500);
    });

    document.getElementById("wfm-settings-summary-lang")?.addEventListener("change", (e) => {
        const lang = e.target.value;
        setSummaryLang(lang);
        saveLocalSettings({ ...loadLocalSettings(), summaryLang: lang });
        showToast(t("settingsSaved"), "success");
    });

    // --- Workflows dir handlers ---
    document.getElementById("wfm-settings-workflows-dir-apply")?.addEventListener("click", async () => {
        const dirInput = document.getElementById("wfm-settings-workflows-dir");
        const currentEl = document.getElementById("wfm-settings-workflows-dir-current");
        const newDir = dirInput.value.trim();
        try {
            const res = await fetch("/api/wfm/settings/workflows-dir", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workflows_dir: newDir }),
            });
            const data = await res.json();
            if (data.error) {
                showToast(`${t("workflowsDirError")}: ${data.error}`, "error");
            } else {
                if (currentEl) currentEl.textContent = data.workflows_dir;
                showToast(t("workflowsDirChanged"), "success");
            }
        } catch (err) {
            showToast(`${t("workflowsDirError")}: ${err.message}`, "error");
        }
    });

    document.getElementById("wfm-settings-workflows-dir-reset")?.addEventListener("click", async () => {
        const dirInput = document.getElementById("wfm-settings-workflows-dir");
        const currentEl = document.getElementById("wfm-settings-workflows-dir-current");
        dirInput.value = "";
        try {
            const res = await fetch("/api/wfm/settings/workflows-dir", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workflows_dir: "" }),
            });
            const data = await res.json();
            if (currentEl) currentEl.textContent = data.workflows_dir;
            showToast(t("workflowsDirChanged"), "success");
        } catch (err) {
            showToast(`${t("workflowsDirError")}: ${err.message}`, "error");
        }
    });

    // --- Ollama model list loader ---
    async function loadOllamaModels() {
        const select = document.getElementById("wfm-settings-ollama-model");
        try {
            const res = await fetch("/api/wfm/ollama/models");
            const data = await res.json();
            const models = data.models || [];
            const savedModel = serverSettings.ollama_model || "llava";
            select.innerHTML = models.length
                ? models.map((m) => `<option value="${m.name}" ${m.name === savedModel ? "selected" : ""}>${m.name}</option>`).join("")
                : `<option value="">${t("noModelsFound")}</option>`;
        } catch {
            select.innerHTML = `<option value="">${t("failedLoadModels")}</option>`;
        }
    }
    await loadOllamaModels();

    // Refresh Ollama models
    document.getElementById("wfm-settings-ollama-refresh")?.addEventListener("click", loadOllamaModels);

    // Test Ollama connection
    document.getElementById("wfm-settings-ollama-test")?.addEventListener("click", async () => {
        const statusEl = document.getElementById("wfm-settings-ollama-status");
        statusEl.textContent = "Testing...";
        statusEl.style.color = "var(--wfm-text-secondary)";
        try {
            const res = await fetch("/api/wfm/ollama/test", { method: "POST" });
            const data = await res.json();
            statusEl.textContent = data.connected ? t("ollamaConnected") : `${t("ollamaFailed")}: ${data.message}`;
            statusEl.style.color = data.connected ? "var(--wfm-success)" : "var(--wfm-danger)";
        } catch (err) {
            statusEl.textContent = `${t("error")}: ${err.message}`;
            statusEl.style.color = "var(--wfm-danger)";
        }
    });

    // Save Ollama settings (to server)
    document.getElementById("wfm-settings-ollama-save")?.addEventListener("click", async () => {
        const ollamaUrl = document.getElementById("wfm-settings-ollama-url")?.value.trim() || "http://localhost:11434";
        const ollamaModel = document.getElementById("wfm-settings-ollama-model")?.value || "";
        try {
            await saveServerSettings({ ollama_url: ollamaUrl, ollama_model: ollamaModel });
            serverSettings.ollama_url = ollamaUrl;
            serverSettings.ollama_model = ollamaModel;
            showToast(t("ollamaSaved"), "success");
        } catch (err) {
            showToast(`${t("saveError")}: ${err.message}`, "error");
        }
    });

    // Test ComfyUI URL
    document.getElementById("wfm-settings-test-url")?.addEventListener("click", async () => {
        const urlInput = document.getElementById("wfm-settings-comfyui-url");
        const statusEl = document.getElementById("wfm-settings-url-status");
        const url = urlInput.value.trim() || window.location.origin;

        comfyUI.updateUrl(url);
        const ok = await comfyUI.checkConnection();
        statusEl.textContent = ok ? t("connectedCheck") : t("failedConnect");
        statusEl.style.color = ok ? "var(--wfm-success)" : "var(--wfm-danger)";
    });

    // Test Eagle URL (via server proxy to avoid CORS)
    document.getElementById("wfm-settings-test-eagle")?.addEventListener("click", async () => {
        const urlInput = document.getElementById("wfm-settings-eagle-url");
        const statusEl = document.getElementById("wfm-settings-eagle-status");
        statusEl.textContent = "Testing...";
        statusEl.style.color = "var(--wfm-text-secondary)";
        try {
            const res = await fetch("/api/wfm/eagle/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ eagleUrl: urlInput.value.trim() }),
            });
            const data = await res.json();
            if (data.connected) {
                statusEl.textContent = `${t("connectedCheck")} (Eagle v${data.version || "?"})`;
                statusEl.style.color = "var(--wfm-success)";
            } else {
                statusEl.textContent = `${t("failedConnect")}: ${data.message || ""}`;
                statusEl.style.color = "var(--wfm-danger)";
            }
        } catch {
            statusEl.textContent = t("failedConnect");
            statusEl.style.color = "var(--wfm-danger)";
        }
    });

    // Clear default workflow
    document.getElementById("wfm-settings-clear-wf")?.addEventListener("click", () => {
        const s = JSON.parse(localStorage.getItem("wfm_settings") || "{}");
        delete s.defaultWorkflow;
        delete s.defaultWorkflowData;
        localStorage.setItem("wfm_settings", JSON.stringify(s));
        const nameEl = document.getElementById("wfm-settings-default-wf-name");
        if (nameEl) nameEl.textContent = t("defaultWorkflowNone");
        document.getElementById("wfm-settings-clear-wf").disabled = true;
        showToast(t("defaultWorkflowCleared"), "success");
    });

    // Save (local settings)
    document.getElementById("wfm-settings-save")?.addEventListener("click", () => {
        const patch = {
            comfyuiUrl: document.getElementById("wfm-settings-comfyui-url")?.value.trim() || "",
            eagleUrl: document.getElementById("wfm-settings-eagle-url")?.value.trim() || "http://localhost:41595",
            eagleAutoSave: document.getElementById("wfm-settings-eagle-auto-save")?.checked || false,
            uiLang: getLang(),
            summaryLang: getSummaryLang(),
        };

        saveLocalSettings(patch);

        // Apply ComfyUI URL
        comfyUI.updateUrl(patch.comfyuiUrl || window.location.origin);

        showToast(t("settingsSaved"), "success");
    });

    // Apply saved ComfyUI URL on init
    const savedUrl = settings.comfyuiUrl || "";
    if (savedUrl) {
        comfyUI.updateUrl(savedUrl);
    }
}

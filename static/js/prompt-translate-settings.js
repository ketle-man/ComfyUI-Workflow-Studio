/**
 * Settings tab section for Prompt Translate (see prompt-translate.js).
 * Values live in the server settings.json so the backend can read them.
 */

import { showToast } from "./app.js";
import { t, getLang } from "./i18n.js";
import { escapeHtml } from "./util.js";
import { setTranslateConfig, translatePrompt } from "./prompt-translate.js";

const DEFAULT_URL = "http://localhost:11434";
const DEFAULT_MODEL = "hf.co/pfnet/plamo-3-translate-2b-GGUF:Q4_K_M";

// Languages PLaMo 3 Translate supports (English is the target, so it is left out).
const SOURCE_LANGS = [
    "ja", "zh", "ko", "ar", "az", "be", "bg", "bn", "ca", "ceb", "de", "es", "et", "eu", "fa", "fr",
    "gu", "he", "hi", "hr", "hu", "hy", "id", "it", "jv", "ka", "kk", "km", "lt", "lv", "ml", "mr",
    "ms", "my", "ne", "nl", "pa", "pl", "ru", "si", "sk", "sl", "sr", "sw", "ta", "te", "th", "tl",
    "ur", "uz", "vi",
];

const SAMPLE_TEXT = {
    ja: "夕焼けの海辺に立つ少女、(長い黒髪:1.2), masterpiece",
    zh: "站在夕阳海边的少女, (长长的黑发:1.2), masterpiece",
};

function _langName(code) {
    try {
        const dn = new Intl.DisplayNames([getLang() || "en"], { type: "language" });
        return dn.of(code) || code;
    } catch {
        return code;
    }
}

export function promptTranslateSettingsHtml(s) {
    const enabled = !!s.prompt_translate_enabled;
    const src = s.prompt_translate_source_lang || "auto";
    const unload = s.prompt_translate_unload !== false;
    const cpu = s.prompt_translate_device === "cpu";
    return `
        <details class="wfm-settings-section" id="wfm-pt-settings">
            <summary class="wfm-settings-summary">${t("promptTranslateSection")}</summary>
            <div class="wfm-form-group">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="checkbox" id="wfm-pt-enabled" ${enabled ? "checked" : ""}>
                    <span>${t("promptTranslateEnable")}</span>
                </label>
                <small style="color:var(--wfm-text-secondary);font-size:11px;display:block;margin-top:4px;">
                    ${t("promptTranslateHint")}
                </small>
            </div>
            <div id="wfm-pt-body" style="${enabled ? "" : "opacity:0.55;"}">
                <div class="wfm-form-group">
                    <label>${t("promptTranslateAutoHeading")}</label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" id="wfm-pt-auto" ${s.prompt_translate_auto ? "checked" : ""}>
                        <span>${t("promptTranslateAuto")}</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:2px;">
                        <input type="checkbox" id="wfm-pt-auto-lab" ${s.prompt_translate_auto_lab ? "checked" : ""}>
                        <span>${t("promptTranslateAutoLab")}</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:2px;">
                        <input type="checkbox" id="wfm-pt-auto-video" ${s.prompt_translate_auto_video ? "checked" : ""}>
                        <span>${t("promptTranslateAutoVideo")}</span>
                    </label>
                    <small style="color:var(--wfm-text-secondary);font-size:11px;display:block;margin-top:4px;">
                        ${t("promptTranslateAutoHint")}
                    </small>
                </div>
                <div class="wfm-form-group">
                    <label>${t("promptTranslateDevice")}</label>
                    <select class="wfm-select" id="wfm-pt-device" style="width:100%;">
                        <option value="gpu" ${cpu ? "" : "selected"}>${t("promptTranslateDeviceGpu")}</option>
                        <option value="cpu" ${cpu ? "selected" : ""}>${t("promptTranslateDeviceCpu")}</option>
                    </select>
                    <label id="wfm-pt-unload-label" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:6px;${cpu ? "opacity:0.5;" : ""}">
                        <input type="checkbox" id="wfm-pt-unload" ${unload ? "checked" : ""} ${cpu ? "disabled" : ""}>
                        <span>${t("promptTranslateUnload")}</span>
                    </label>
                    <small style="color:var(--wfm-text-secondary);font-size:11px;display:block;margin-top:4px;">
                        ${t("promptTranslateDeviceHint")}
                    </small>
                </div>
                <div class="wfm-form-group">
                    <label>${t("promptTranslateSourceLang")}</label>
                    <select class="wfm-select" id="wfm-pt-source-lang" style="width:100%;">
                        <option value="auto" ${src === "auto" ? "selected" : ""}>${t("promptTranslateSourceAuto")}</option>
                        ${SOURCE_LANGS.map((c) => `<option value="${c}" ${src === c ? "selected" : ""}>${escapeHtml(_langName(c))} (${c})</option>`).join("")}
                    </select>
                </div>
                <div class="wfm-form-group">
                    <label>${t("promptTranslateUrl")}</label>
                    <div style="display:flex;gap:8px;">
                        <input type="text" class="wfm-input" id="wfm-pt-url" value="${escapeHtml(s.prompt_translate_url || "")}" placeholder="${DEFAULT_URL}">
                        <button class="wfm-btn wfm-btn-sm" id="wfm-pt-url-save">${t("save")}</button>
                    </div>
                </div>
                <div class="wfm-form-group">
                    <label>${t("promptTranslateModel")}</label>
                    <div style="display:flex;gap:8px;">
                        <select class="wfm-select" id="wfm-pt-model" style="flex:1;min-width:0;">
                            <option value="${escapeHtml(s.prompt_translate_model || DEFAULT_MODEL)}" selected>${escapeHtml(s.prompt_translate_model || DEFAULT_MODEL)}</option>
                        </select>
                        <button class="wfm-btn wfm-btn-sm" id="wfm-pt-model-refresh">${t("refresh")}</button>
                        <button class="wfm-btn wfm-btn-sm" id="wfm-pt-model-pull" style="display:none;">${t("promptTranslatePull")}</button>
                    </div>
                    <small id="wfm-pt-model-hint" style="color:var(--wfm-text-secondary);font-size:11px;display:block;margin-top:4px;">
                        ${t("promptTranslateModelHint")}
                    </small>
                </div>
                <div class="wfm-form-group">
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button class="wfm-btn wfm-btn-sm" id="wfm-pt-test">${t("test")}</button>
                        <span id="wfm-pt-test-status" style="font-size:12px;word-break:break-all;"></span>
                    </div>
                </div>
            </div>
        </details>`;
}

export function initPromptTranslateSettings(serverSettings, saveServerSettings) {
    const $ = (id) => document.getElementById(id);
    let installed = [];
    let presets = [];

    const save = async (patch, toast = true) => {
        try {
            const res = await saveServerSettings(patch);
            if (res?.error) throw new Error(res.error);
            Object.assign(serverSettings, patch);
            setTranslateConfig(patch);
            if (toast) showToast(t("promptTranslateSaved"), "success");
            return true;
        } catch (err) {
            showToast(t("errorWithMsg", err.message), "error");
            return false;
        }
    };

    const currentModel = () => serverSettings.prompt_translate_model || DEFAULT_MODEL;

    const renderModelOptions = () => {
        const sel = $("wfm-pt-model");
        if (!sel) return;
        const cur = currentModel();
        const plamoInstalled = installed.filter((m) => /plamo/i.test(m));
        // Embedding-only models cannot generate text, so they are not offered.
        const others = installed.filter((m) => !/plamo/i.test(m) && !/embed|minilm/i.test(m));
        const missingPresets = presets.filter((p) => !installed.includes(p));
        const opt = (v, label) => `<option value="${escapeHtml(v)}" ${v === cur ? "selected" : ""}>${escapeHtml(label || v)}</option>`;
        let html = "";
        if (plamoInstalled.length) html += `<optgroup label="PLaMo 3 Translate">${plamoInstalled.map((m) => opt(m)).join("")}</optgroup>`;
        if (missingPresets.length) html += `<optgroup label="${escapeHtml(t("promptTranslateNotPulled"))}">${missingPresets.map((m) => opt(m, `${m} ${t("promptTranslateNotPulledMark")}`)).join("")}</optgroup>`;
        if (others.length) html += `<optgroup label="${escapeHtml(t("promptTranslateOtherModels"))}">${others.map((m) => opt(m)).join("")}</optgroup>`;
        if (![...installed, ...presets].includes(cur)) html = opt(cur) + html;
        sel.innerHTML = html;
        updatePullButton();
    };

    const updatePullButton = () => {
        const btn = $("wfm-pt-model-pull");
        if (!btn) return;
        const m = currentModel();
        btn.style.display = presets.includes(m) && !installed.includes(m) ? "" : "none";
    };

    const refreshModels = async (quiet = false) => {
        try {
            const res = await fetch("/api/wfm/translate/models");
            const data = await res.json();
            presets = data.presets || [];
            if (data.status !== "success") throw new Error(data.message || `HTTP ${res.status}`);
            installed = data.models || [];
        } catch (err) {
            installed = [];
            if (!quiet) showToast(t("promptTranslateModelsError", err.message), "error");
        }
        renderModelOptions();
    };

    // CPU mode keeps the model resident: preload it now, and release it when leaving CPU mode
    // or turning the feature off so it does not sit in RAM unused.
    const postTranslate = (path) => fetch(`/api/wfm/translate/${path}`, { method: "POST" }).catch(() => {});
    const isCpu = () => serverSettings.prompt_translate_device === "cpu";

    $("wfm-pt-device")?.addEventListener("change", async (e) => {
        const device = e.target.value === "cpu" ? "cpu" : "gpu";
        const prev = isCpu() ? "cpu" : "gpu";
        if (!(await save({ prompt_translate_device: device }))) { e.target.value = prev; return; }
        const cpu = device === "cpu";
        const cb = $("wfm-pt-unload");
        if (cb) cb.disabled = cpu;
        const lbl = $("wfm-pt-unload-label");
        if (lbl) lbl.style.opacity = cpu ? "0.5" : "";
        // Ollama reloads the model for the new placement; drop the old instance first.
        await postTranslate("unload");
        if (cpu) postTranslate("warmup");
    });

    $("wfm-pt-enabled")?.addEventListener("change", async (e) => {
        const on = !!e.target.checked;
        if (!(await save({ prompt_translate_enabled: on }))) { e.target.checked = !on; return; }
        if (isCpu()) postTranslate(on ? "warmup" : "unload");
        const body = $("wfm-pt-body");
        if (body) body.style.opacity = on ? "" : "0.55";
    });
    [["wfm-pt-auto", "prompt_translate_auto"], ["wfm-pt-auto-lab", "prompt_translate_auto_lab"], ["wfm-pt-auto-video", "prompt_translate_auto_video"]]
        .forEach(([id, key]) => {
            $(id)?.addEventListener("change", async (e) => {
                const on = !!e.target.checked;
                if (!(await save({ [key]: on }))) e.target.checked = !on;
            });
        });
    $("wfm-pt-unload")?.addEventListener("change", async (e) => {
        const on = !!e.target.checked;
        if (!(await save({ prompt_translate_unload: on }))) e.target.checked = !on;
    });
    $("wfm-pt-source-lang")?.addEventListener("change", (e) => save({ prompt_translate_source_lang: e.target.value }));
    $("wfm-pt-url-save")?.addEventListener("click", async () => {
        const url = ($("wfm-pt-url")?.value || "").trim();
        if (await save({ prompt_translate_url: url })) refreshModels();
    });
    $("wfm-pt-model")?.addEventListener("change", async (e) => {
        const cpu = isCpu() && serverSettings.prompt_translate_enabled;
        if (cpu) await postTranslate("unload"); // release the previous resident model
        await save({ prompt_translate_model: e.target.value });
        if (cpu) postTranslate("warmup");
        updatePullButton();
    });
    $("wfm-pt-model-refresh")?.addEventListener("click", () => refreshModels());

    $("wfm-pt-model-pull")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const model = currentModel();
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = t("promptTranslatePulling");
        try {
            const res = await fetch("/api/wfm/translate/pull", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model }),
            });
            const data = await res.json();
            if (data.status !== "success") throw new Error(data.message || `HTTP ${res.status}`);
            showToast(t("promptTranslatePulled"), "success");
            await refreshModels(true);
        } catch (err) {
            showToast(t("errorWithMsg", err.message), "error");
        } finally {
            btn.disabled = false;
            btn.textContent = label;
        }
    });

    $("wfm-pt-test")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const status = $("wfm-pt-test-status");
        const sample = SAMPLE_TEXT[getLang()] || SAMPLE_TEXT.ja;
        btn.disabled = true;
        if (status) { status.style.color = "var(--wfm-text-secondary)"; status.textContent = t("promptTranslateRunning"); }
        const t0 = performance.now();
        try {
            const out = await translatePrompt(sample);
            const sec = ((performance.now() - t0) / 1000).toFixed(1);
            if (status) { status.style.color = "var(--wfm-success, #4caf50)"; status.textContent = `${sample} → ${out} (${sec}s)`; }
        } catch (err) {
            if (status) { status.style.color = "var(--wfm-danger, #f44336)"; status.textContent = err.message; }
        } finally {
            btn.disabled = false;
        }
    });

    // Fill the model list when the section is first opened (avoids an Ollama call on every Settings visit).
    const section = $("wfm-pt-settings");
    section?.addEventListener("toggle", () => { if (section.open && !installed.length) refreshModels(true); });
}

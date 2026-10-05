/**
 * vram-prepare.js — unload Ollama models right before image generation to free VRAM.
 *
 * Ported from ComfyUI Comic Creator's vram-prepare.js. The work is done by the server
 * (py/routes/vram_routes.py, /api/wfm/vram/prepare), which judges free VRAM by nvidia-smi
 * rather than ComfyUI's figure (it may not react to Ollama loading/unloading models).
 *
 * - Settings (Settings tab "VRAM Management"): mode = 'off' | 'auto' | 'all', targetGb (auto's target)
 * - Ollama targets: the default 127.0.0.1:11434 (always added by the server) + the AI TOOL / Prompt /
 *   Tagger AI settings and the Decision Model when their backend is Ollama
 * - comfyUI.queuePrompt() calls prepareVramForGeneration() before every queue; failures never block generation
 */

import { t } from "./i18n.js";
import { showToast } from "./app.js";
import { readJsonStorage, getAiBackendDefaultUrl } from "./util.js";
import { getDecisionSettings } from "./decision-client.js";

const SETTINGS_KEY = "wfm_vram_settings";
const DEFAULT_SETTINGS = Object.freeze({ mode: "off", targetGb: 8 });
// AI backend settings that may point at Ollama (AI TOOL / sidepanel A tab, Prompt tab, Tagger tab)
const AI_SETTINGS_KEYS = ["wfm_ai_settings", "wfm_prompt_ai_settings", "wfm_tagger_ai_settings"];

export function getVramSettings() {
    const saved = readJsonStorage(SETTINGS_KEY);
    const merged = { ...DEFAULT_SETTINGS, ...(saved && typeof saved === "object" ? saved : {}) };
    if (!["off", "auto", "all"].includes(merged.mode)) merged.mode = DEFAULT_SETTINGS.mode;
    const gb = Number(merged.targetGb);
    merged.targetGb = gb >= 0 && gb <= 64 ? gb : DEFAULT_SETTINGS.targetGb;
    return merged;
}

export function saveVramSettings(patch) {
    const next = { ...getVramSettings(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* keep working even if it can't be saved */ }
    return next;
}

// Configured Ollama URLs (duplicates and the default URL are merged server-side)
function collectOllamaUrls() {
    const urls = [];
    for (const key of AI_SETTINGS_KEYS) {
        const s = readJsonStorage(key);
        if ((s.backend || "ollama") === "ollama") urls.push(s.backendUrl || getAiBackendDefaultUrl("ollama"));
    }
    const dec = getDecisionSettings();
    if (dec.backend === "ollama" && dec.baseUrl) urls.push(dec.baseUrl);
    return [...new Set(urls)];
}

/**
 * Ask the server to free VRAM. mode: 'auto' | 'all'. extraUrls: e.g. an unsaved URL from a settings form.
 * Returns the server result (throws on failure).
 */
export async function requestVramPrepare(mode, targetGb = getVramSettings().targetGb, extraUrls = []) {
    const urls = [...new Set([...collectOllamaUrls(), ...extraUrls.filter(Boolean)])];
    const res = await fetch("/api/wfm/vram/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, target_gb: targetGb, urls }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== "ok") throw new Error(data.message || `HTTP ${res.status}`);
    return data;
}

const gb = (mb) => (mb / 1024).toFixed(1);

/** One-line summary of a result (Settings tab status and pre-generation toast) */
export function describeVramResult(d) {
    if (d.unloaded.length) {
        let msg = t("vramUnloaded", d.unloaded.map((u) => u.name).join(", "), gb(d.free_before_mb), gb(d.free_after_mb));
        if (d.failed.length) msg += " / " + t("vramFailedModels", d.failed.join(", "));
        return msg;
    }
    if (d.failed.length) return t("vramFailedModels", d.failed.join(", "));
    if (d.unreachable?.length) return t("vramUnreachable", d.unreachable.map((u) => u.url).join(", "));
    if (d.mode === "auto") return d.reached ? t("vramEnough", gb(d.free_after_mb), d.target_gb) : t("vramShort", gb(d.free_after_mb), d.target_gb);
    return t("vramNothingLoaded", gb(d.free_after_mb));
}

/**
 * "Unload Model" button for the Ollama backend (AI TOOL tab / Prompt・Tagger settings modal):
 * unload every loaded Ollama model, decision models included — the same server step as
 * "Unload all now". url is the form's (possibly unsaved) Ollama URL. Shows the result as a toast.
 */
export async function unloadAllOllamaModels(url) {
    try {
        const d = await requestVramPrepare("all", undefined, [url]);
        showToast(describeVramResult(d), d.failed.length || (!d.unloaded.length && d.unreachable?.length) ? "error" : "success", 5000);
    } catch (e) {
        showToast(t("aiUnloadFailed") + (e.message || String(e)), "error");
    }
}

// ---- Settings tab "VRAM Management" section ----

/** Wire up the section rendered by settings-tab.js (re-run after every re-render). */
export function initVramSettings() {
    const modeSel = document.getElementById("wfm-settings-vram-mode");
    const targetInput = document.getElementById("wfm-settings-vram-target");
    const unloadBtn = document.getElementById("wfm-settings-vram-unload");
    const statusEl = document.getElementById("wfm-settings-vram-status");
    if (!modeSel || !targetInput) return;
    const s = getVramSettings();
    modeSel.value = s.mode;
    targetInput.value = s.targetGb;
    targetInput.disabled = s.mode !== "auto";

    const setStatus = (text, color) => {
        if (statusEl) { statusEl.textContent = text; statusEl.style.color = color || "var(--wfm-text-secondary)"; }
    };
    modeSel.addEventListener("change", () => {
        saveVramSettings({ mode: modeSel.value });
        targetInput.disabled = modeSel.value !== "auto";
        _lastShortNote = "";
    });
    targetInput.addEventListener("change", () => {
        const v = Math.min(Math.max(parseFloat(targetInput.value) || 0, 0), 64);
        targetInput.value = v;
        saveVramSettings({ targetGb: v });
        _lastShortNote = "";
    });
    unloadBtn?.addEventListener("click", async () => {
        unloadBtn.disabled = true;
        setStatus(t("vramUnloading"));
        try {
            const d = await requestVramPrepare("all");
            setStatus(describeVramResult(d), d.failed.length ? "var(--wfm-warning, #e0a040)" : "var(--wfm-success, #6c6)");
        } catch (e) {
            setStatus(t("vramPrepareFailed", e.message || String(e)), "var(--wfm-danger, #e66)");
        } finally {
            unloadBtn.disabled = false;
        }
    });
}

let _lastShortNote = "";

/**
 * Call right before queuing a generation. Does nothing when the mode is off; never throws.
 * Shows a toast only when something was unloaded, the target can't be reached, or it failed
 * (the same "can't reach target" note isn't repeated across a batch).
 */
export async function prepareVramForGeneration() {
    const settings = getVramSettings();
    if (settings.mode === "off") return null;
    try {
        const d = await requestVramPrepare(settings.mode, settings.targetGb);
        const short = d.mode === "auto" && !d.reached;
        if (d.unloaded.length || d.failed.length) {
            showToast("🧹 " + describeVramResult(d), d.failed.length > 0 || short ? "error" : "success", 6000);
            _lastShortNote = "";
        } else if (short) {
            const note = describeVramResult(d);
            if (note !== _lastShortNote) { _lastShortNote = note; showToast("⚠ " + note, "error", 6000); }
        }
        return d;
    } catch (e) {
        console.warn("[WFS] vram prepare failed:", e);
        showToast("⚠ " + t("vramPrepareFailed", e.message || String(e)), "error", 6000);
        return null;
    }
}

/**
 * Prompt Translate — type GenerateUI prompts in your own language and translate
 * them into English with a local Ollama model (PLaMo 3 Translate by default).
 *
 * Works like the A1111 prompt-translator extensions: only the parts of a prompt
 * that contain non-ASCII letters are sent to the model. Prompt syntax such as
 * commas, (weights:1.2), [ ], {a|b}, <lora:...>, __wildcards__,
 * embedding:name and BREAK/AND is kept as it is, so a mixed prompt like
 * "masterpiece, (赤いドレスの女性:1.2), <lora:foo:0.8>" only translates the Japanese part.
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";

let _config = null;
let _configPromise = null;

// textarea -> { original, translated } for the "restore original" button
const _history = new WeakMap();

export async function loadTranslateConfig(force = false) {
    if (_config && !force) return _config;
    if (!_configPromise || force) {
        _configPromise = fetch("/api/wfm/translate/config")
            .then((r) => r.json())
            .then((d) => { _config = d.config || {}; return _config; })
            .catch(() => { _config = {}; return _config; })
            .finally(() => { _configPromise = null; });
    }
    return _configPromise;
}

export function getTranslateConfig() {
    return _config || {};
}

export function isTranslateEnabled() {
    return !!_config?.prompt_translate_enabled;
}

/** Called by the Settings tab after saving, so open UIs update without a reload. */
export function setTranslateConfig(patch) {
    _config = { ...(_config || {}), ...patch };
    updateTranslateButtons();
}

// ------------------------------------------------------------
// Prompt splitting
// ------------------------------------------------------------

// Spans that are never translated: prompt syntax and delimiters.
const PROTECTED_RE = /\b(?:BREAK|AND)\b|<[^<>\n]*>|__[^\s_][^\s]*?__|embedding:[^\s,()[\]{}|]+|:\s*-?\d+(?:\.\d+)?|[,\n()[\]{}|]/g;
// A piece needs translation when it contains a non-ASCII letter (CJK, Cyrillic, accented Latin, ...).
const NEEDS_TRANSLATION_RE = /(?![\x00-\x7F])\p{L}/u;

/** Split a prompt into [{ text, translate }] pieces. Joining all .text gives back the input. */
export function splitPrompt(text) {
    const pieces = [];
    let last = 0;
    for (const m of text.matchAll(PROTECTED_RE)) {
        if (m.index > last) pieces.push(text.slice(last, m.index));
        pieces.push({ keep: m[0] });
        last = m.index + m[0].length;
    }
    if (last < text.length) pieces.push(text.slice(last));
    return pieces.map((p) => {
        if (typeof p !== "string") return { text: p.keep, translate: false };
        return { text: p, translate: NEEDS_TRANSLATION_RE.test(p) };
    });
}

export function needsTranslation(text) {
    return splitPrompt(text || "").some((p) => p.translate);
}

// Keep the surrounding whitespace of a piece and tidy the model output for prompt use.
function _rebuild(source, translated) {
    const lead = source.match(/^\s*/)[0];
    const trail = source.match(/\s*$/)[0];
    const core = source.trim();
    let out = (translated || "").replace(/\s*\n+\s*/g, " ").trim();
    // A tag such as "赤いドレス" should not become "Red dress." — drop the final period
    // unless the source itself was a full sentence.
    if (!/[。．.!?！？]$/.test(core)) out = out.replace(/[.。]+$/, "");
    // "少女、(" -> "girl, (" rather than "girl,(" — a Japanese comma needs no space, an English one does.
    if (!trail && /[,;:]$/.test(out)) out += " ";
    return lead + out + trail;
}

/** Translate a whole prompt string. Throws on backend errors. */
export async function translatePrompt(text) {
    const pieces = splitPrompt(text || "");
    const cores = [...new Set(pieces.filter((p) => p.translate).map((p) => p.text.trim()))];
    if (cores.length === 0) return text;

    const res = await fetch("/api/wfm/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: cores }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== "success") {
        throw new Error(data.message || `HTTP ${res.status}`);
    }
    const map = new Map(cores.map((c, i) => [c, data.translations[i] ?? c]));
    return pieces.map((p) => (p.translate ? _rebuild(p.text, map.get(p.text.trim())) : p.text)).join("");
}

// Replace textarea text while keeping the browser's Ctrl+Z history where possible.
function _setTextareaValue(ta, value) {
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand("insertText", false, value); } catch { ok = false; }
    if (!ok || ta.value !== value) ta.value = value;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Translate one textarea in place. Returns true when the text changed.
 * The original text is remembered for the restore button.
 */
export async function translateTextarea(ta) {
    if (!ta || ta.disabled) return false;
    const original = ta.value;
    if (!needsTranslation(original)) return false;
    const translated = await translatePrompt(original);
    if (translated === original) return false;
    _setTextareaValue(ta, translated);
    _history.set(ta, { original, translated });
    _updateRestoreButton(ta);
    return true;
}

export function restoreTextarea(ta) {
    const h = ta && _history.get(ta);
    if (!h || ta.disabled) return;
    _setTextareaValue(ta, h.original);
    _history.delete(ta);
    _updateRestoreButton(ta);
}

const PROMPT_TEXTAREAS = ["wfm-prompt-pos-text", "wfm-prompt-neg-text"];

/**
 * GenerateUI hook: when translation and "translate before Generate" are both on,
 * translate the Positive/Negative prompt textareas. Throws if translation fails so
 * the caller can stop instead of sending untranslated text.
 */
export async function autoTranslateBeforeGenerate() {
    if (!(await isAutoTranslateOn("generate"))) return false;
    const targets = PROMPT_TEXTAREAS.map((id) => document.getElementById(id))
        .filter((ta) => ta && needsTranslation(ta.value));
    if (targets.length === 0) return false;
    const progress = document.getElementById("wfm-gen-progress-text");
    if (progress) progress.textContent = t("promptTranslateRunning");
    for (const ta of targets) await translateTextarea(ta);
    if (progress) progress.textContent = "";
    return true;
}

// Settings key for each "translate automatically when running" checkbox.
const AUTO_KEYS = {
    generate: "prompt_translate_auto",
    lab: "prompt_translate_auto_lab",
    video: "prompt_translate_auto_video",
};

/** True when translation is enabled and the auto checkbox for ``kind`` (generate/lab/video) is on. */
export async function isAutoTranslateOn(kind) {
    await loadTranslateConfig();
    return isTranslateEnabled() && !!_config[AUTO_KEYS[kind]];
}

/**
 * Lab Run hook: translate the prompt texts inside one iteration's API-format workflow
 * copy, in place. The Lab plan's own keyframe values stay in the user's language;
 * repeated phrases come from the server-side cache, so later iterations cost ~nothing.
 * Throws on translation failure so the caller can stop the batch.
 */
export async function translateWorkflowPrompts(workflow, promptNodes) {
    for (const n of promptNodes || []) {
        const inputs = workflow?.[n.id]?.inputs;
        const key = n.textKey || "text";
        if (inputs && typeof inputs[key] === "string" && needsTranslation(inputs[key])) {
            inputs[key] = await translatePrompt(inputs[key]);
        }
    }
    return workflow;
}

// ------------------------------------------------------------
// Buttons in the GenerateUI Prompt tab
// ------------------------------------------------------------

function _updateRestoreButton(ta) {
    const btn = document.querySelector(`.wfm-pt-restore[data-target="${ta.id}"]`);
    if (!btn) return;
    const h = _history.get(ta);
    btn.style.display = isTranslateEnabled() && h && ta.value === h.translated ? "" : "none";
}

export function updateTranslateButtons() {
    const on = isTranslateEnabled();
    document.querySelectorAll(".wfm-pt-translate").forEach((b) => { b.style.display = on ? "" : "none"; });
    document.querySelectorAll(".wfm-pt-restore").forEach((b) => {
        const ta = document.getElementById(b.dataset.target);
        if (ta) _updateRestoreButton(ta);
    });
}

/**
 * Wire the 🌐 / restore buttons produced by translateButtonsHtml() inside ``root``
 * (GenerateUI prompt tab, Lab prompt modal, Video Plan block prompt, ...).
 */
export function attachTranslateButtons(root = document) {
    root.querySelectorAll(".wfm-pt-translate").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const ta = document.getElementById(btn.dataset.target);
            if (!ta) return;
            if (!needsTranslation(ta.value)) {
                showToast(t("promptTranslateNothing"), "info");
                return;
            }
            btn.disabled = true;
            const label = btn.textContent;
            btn.textContent = "…";
            try {
                await translateTextarea(ta);
            } catch (err) {
                showToast(t("promptTranslateError", err.message), "error");
            } finally {
                btn.disabled = false;
                btn.textContent = label;
            }
        });
    });
    root.querySelectorAll(".wfm-pt-restore").forEach((btn) => {
        btn.addEventListener("click", () => restoreTextarea(document.getElementById(btn.dataset.target)));
    });
    root.querySelectorAll(".wfm-pt-restore").forEach((btn) => {
        const ta = document.getElementById(btn.dataset.target);
        ta?.addEventListener("input", () => _updateRestoreButton(ta));
    });
    loadTranslateConfig().then(() => {
        updateTranslateButtons();
        _warmupOnce();
    });
}

// CPU-resident mode: load the model in the background once per page so the first 🌐
// does not pay Ollama's ~4 s startup. The server ignores this unless CPU mode is on.
let _warmedUp = false;
function _warmupOnce() {
    if (_warmedUp || !isTranslateEnabled() || _config.prompt_translate_device !== "cpu") return;
    _warmedUp = true;
    fetch("/api/wfm/translate/warmup", { method: "POST" }).catch(() => {});
}

/** HTML for the two buttons placed next to a prompt textarea's Apply button. */
export function translateButtonsHtml(textareaId) {
    const on = isTranslateEnabled();
    return `<button class="wfm-btn wfm-btn-sm wfm-pt-translate" data-target="${textareaId}" title="${t("promptTranslateBtnTitle")}" style="${on ? "" : "display:none;"}">🌐</button>`
        + `<button class="wfm-btn wfm-btn-sm wfm-pt-restore" data-target="${textareaId}" title="${t("promptTranslateRestoreTitle")}" style="display:none;">${t("promptTranslateRestore")}</button>`;
}

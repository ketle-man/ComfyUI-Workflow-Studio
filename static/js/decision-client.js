/**
 * Decision model client (Unsloth Decision API / Laya, Ollama 0.35+ / tev1・nimble・clef).
 *
 * Laya is a *decision* model, not a generator: it takes a state (text or any JSON) plus typed
 * questions and returns calibrated probabilities in one forward pass — no free-form output, so no
 * format hallucination, and results can be thresholded directly. Most decision models are text-only
 * (image-based judgments must first be turned into text — Tagger tags / VLM caption), but Ollama's
 * "clef" models accept images directly (decide()'s `images` param — base64, no `data:` prefix; use
 * supportsDecisionVision() first since a non-vision model errors out on an images payload). This
 * file is ComfyUI-Comic-Creator's decision-client.js origin (CC ported it 2026-09-30) and CC later
 * added vision support (2026-10, based on ComfyUI-LiveChatStream's judgeImage pattern) which is
 * ported back here — keep the two in sync going forward.
 *
 * Both backends speak the same TypeSafe-compatible POST /v1/systemone. Unsloth needs an API key
 * even on localhost (unless Keyless API access is on), so its requests go through the same
 * server-side proxy as the Unsloth chat backend (py/routes/unsloth_routes.py, key from .env).
 * Ollama needs no key and allows CORS, so it's called directly from the browser like the existing
 * Ollama LLM backend. Backend/URL/model/threshold come from the Settings tab's own
 * "Decision Model" section (wfm_decision_settings), independent of the AI TOOL / Tagger backends so
 * a decision model can run alongside whichever LLM/VLM those use.
 * API reference: https://unsloth.ai/docs/models/decision-laya,
 * https://github.com/ollama/ollama/releases/tag/v0.35.0
 *
 * Usage (threshold defaults to the Settings tab value when omitted):
 *   import { decide, noul, choice, score, isYes, pickChoice } from "./decision-client.js";
 *   const answers = await decide(promptText, {
 *       genre: choice("Which genre fits best?", { portrait: "a person is the main subject", landscape: "scenery" }),
 *       text:  noul("Does the image contain rendered text?"),
 *       nsfw:  score("How sexually explicit is this?", ["none", "suggestive", "explicit"]),
 *   });
 *   const genre = pickChoice(answers.genre, 0.8);   // { value, probability, confident }
 */

import { unslothProxy, readJsonStorage } from "./util.js";

// Limits documented by Unsloth's Decision API.
export const DECISION_LIMITS = { maxQuestions: 64, maxChoiceOptions: 255, maxScoreLevels: 10 };

// Unsloth: "laya" = the model picked in Unsloth's settings. Explicit variants: "laya-multilingual"
// (default download, 100+ languages), "laya-english", "laya-typed-decisions" (structured data such
// as JSON records — e.g. workflow node summaries).
// Ollama: decision models are ordinary pulled models whose /api/tags capabilities include
// "decision" — listed live by listDecisionModels(); `models` below are only pull suggestions
// (tev1 = 4B / 4.5 GB, tev1:0.8b = 812 MB, nimble = 9B / 9.5 GB, clef = 27B / ~18GB vision-capable —
// needs Ollama 0.35.1+, clef-flash(9B) is unreliable as of Ollama 0.40.1, see ollama/ollama#18769).
export const DECISION_BACKENDS = {
    unsloth: {
        label: "Unsloth",
        defaultUrl: "http://localhost:8888",
        models: ["laya", "laya-multilingual", "laya-english", "laya-typed-decisions"],
        defaultModel: "laya",
    },
    ollama: {
        label: "Ollama",
        defaultUrl: "http://localhost:11434",
        models: ["tev1", "tev1:0.8b", "nimble", "clef"],
        defaultModel: "tev1",
    },
};
export const DECISION_MODELS = DECISION_BACKENDS.unsloth.models;
export const DEFAULT_DECISION_MODEL = DECISION_BACKENDS.unsloth.defaultModel;

export const DECISION_SETTINGS_KEY = "wfm_decision_settings";
const DEFAULT_SETTINGS = {
    backend: "unsloth",
    baseUrl: DECISION_BACKENDS.unsloth.defaultUrl,
    model: DEFAULT_DECISION_MODEL,
    threshold: 0.8,
};

/** Saved Decision Model settings merged over the defaults. */
export function getDecisionSettings() {
    const saved = readJsonStorage(DECISION_SETTINGS_KEY);
    const merged = { ...DEFAULT_SETTINGS, ...saved };
    const th = Number(merged.threshold);
    merged.threshold = th > 0 && th <= 1 ? th : DEFAULT_SETTINGS.threshold;
    if (!DECISION_BACKENDS[merged.backend]) merged.backend = DEFAULT_SETTINGS.backend;
    const backend = DECISION_BACKENDS[merged.backend];
    if (!merged.baseUrl) merged.baseUrl = backend.defaultUrl;
    // A model name from the other backend (e.g. "laya" after switching to Ollama) can't work.
    const isLaya = /^laya/.test(merged.model || "");
    if (!merged.model || (merged.backend === "ollama" && isLaya) || (merged.backend === "unsloth" && !isLaya)) {
        merged.model = backend.defaultModel;
    }
    return merged;
}

/**
 * Model choices for the Settings dropdown. Unsloth: its fixed Laya names. Ollama: installed models
 * whose /api/tags capabilities include "decision" (throws if Ollama can't be reached). Returns
 * { models, installed } — installed is false for Unsloth (names aren't checked against the server).
 */
export async function listDecisionModels(backend, baseUrl) {
    if (backend !== "ollama") return { models: [...DECISION_BACKENDS.unsloth.models], installed: false };
    const res = await fetch(`${(baseUrl || DECISION_BACKENDS.ollama.defaultUrl).replace(/\/+$/, "")}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = (data.models || [])
        .filter((m) => Array.isArray(m.capabilities) && m.capabilities.includes("decision"))
        .map((m) => m.name)
        .sort();
    return { models, installed: true };
}

export function saveDecisionSettings(patch) {
    const data = { ...getDecisionSettings(), ...patch };
    localStorage.setItem(DECISION_SETTINGS_KEY, JSON.stringify(data));
    return data;
}

// ---- Question builders ----

/** Yes/no question — answer.noul is the probability of "yes" (0..1). */
export function noul(instructions) {
    return { type: "noul", instructions };
}

/**
 * Pick-one question. criteria: an array of option names, or { option: description } — descriptions
 * noticeably improve accuracy (options share a token budget, so past ~20 described options the
 * descriptions get trimmed).
 */
export function choice(instructions, criteria) {
    return { type: "choice", instructions, criteria };
}

/** Rating question. levels: ordered labels from lowest (0) to highest, 2..10 entries. */
export function score(instructions, levels) {
    return { type: "score", instructions, criteria: levels };
}

// ---- Request ----


function _validateQuestions(questions) {
    const entries = Object.entries(questions || {});
    if (entries.length === 0) throw new Error("decide(): no questions given");
    if (entries.length > DECISION_LIMITS.maxQuestions) {
        throw new Error(`decide(): ${entries.length} questions exceeds the limit of ${DECISION_LIMITS.maxQuestions}`);
    }
    for (const [key, q] of entries) {
        if (!q || !["noul", "choice", "score"].includes(q.type)) {
            throw new Error(`decide(): question "${key}" has an unknown type`);
        }
        const n = Array.isArray(q.criteria) ? q.criteria.length : Object.keys(q.criteria || {}).length;
        if (q.type === "choice" && (n < 2 || n > DECISION_LIMITS.maxChoiceOptions)) {
            throw new Error(`decide(): choice "${key}" needs 2-${DECISION_LIMITS.maxChoiceOptions} options (got ${n})`);
        }
        if (q.type === "score" && (n < 2 || n > DECISION_LIMITS.maxScoreLevels)) {
            throw new Error(`decide(): score "${key}" needs 2-${DECISION_LIMITS.maxScoreLevels} levels (got ${n})`);
        }
    }
}

/**
 * Ask typed questions about one state. Returns the raw `answers` object keyed like `questions`.
 * The first call after Unsloth starts loads the model (10-20 s); later calls are sub-second on CPU.
 *
 * @param {string|object} state  Text or any JSON (e.g. { prompt, tags, model }).
 * @param {object} questions     { key: noul(...) | choice(...) | score(...) }, max 64.
 * @param {object} [opts]        { backend, model, baseUrl } — override the saved Decision Model settings.
 * @param {string[]} [images]    Base64 image data (no `data:` prefix), shared by all questions.
 *                               Vision-capable Ollama models only (e.g. clef) — check with
 *                               supportsDecisionVision() first; a non-vision model errors out.
 */
export async function decide(state, questions, opts = {}, images = []) {
    _validateQuestions(questions);
    const settings = getDecisionSettings();
    const backend = opts.backend || settings.backend;
    const baseUrl = (opts.baseUrl || settings.baseUrl).replace(/\/+$/, "");
    const payload = { model: opts.model || settings.model, state, questions };
    if (images?.length) payload.images = images;
    let data;
    if (backend === "ollama") {
        const res = await fetch(`${baseUrl}/v1/systemone`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        data = await res.json().catch(() => ({}));
        // Ollama reports failures as { error } (e.g. 'model "tev1" not found, try pulling it first').
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    } else {
        data = await unslothProxy(baseUrl, "/v1/systemone", "POST", payload);
    }
    if (!data || typeof data.answers !== "object") throw new Error(data?.error || "Decision API returned no answers");
    return data.answers;
}

/** Blob / data URL / image URL → base64 (no `data:` prefix), for decide()'s `images` param. */
export async function imageToBase64(src) {
    const blob = src instanceof Blob ? src : await (await fetch(src)).blob();
    return await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
}

/**
 * Whether the configured decision model accepts images. Ollama only — decision models' /api/show
 * capabilities list only "decision" (not "vision") on some Ollama builds, so this also checks for an
 * image encoder (projector_info) as a fallback. Unsloth can't be checked this way, so it returns
 * null (unknown) — callers should try and fall back to text-only on failure. Returns false on error.
 *
 * @param {object} [opts]  { backend, model, baseUrl } — same overrides as decide().
 */
export async function supportsDecisionVision(opts = {}) {
    const settings = getDecisionSettings();
    const backend = opts.backend || settings.backend;
    if (backend !== "ollama") return null;
    const baseUrl = (opts.baseUrl || settings.baseUrl).replace(/\/+$/, "");
    try {
        const res = await fetch(`${baseUrl}/api/show`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: opts.model || settings.model }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        return (Array.isArray(data.capabilities) && data.capabilities.includes("vision"))
            || !!(data.projector_info && Object.keys(data.projector_info).length);
    } catch {
        return false;
    }
}

/**
 * Run decide() over many states with a small concurrency cap (the model runs locally, so flooding
 * it only queues requests). Per-item failures are returned as { error } instead of rejecting all.
 */
export async function decideMany(states, questions, opts = {}) {
    const concurrency = Math.max(1, opts.concurrency || 2);
    const results = new Array(states.length);
    let next = 0;
    const worker = async () => {
        while (next < states.length) {
            const i = next++;
            try {
                results[i] = { answers: await decide(states[i], questions, opts) };
            } catch (e) {
                results[i] = { error: e.message };
            }
            opts.onProgress?.(i, results[i]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, states.length) }, worker));
    return results;
}

/**
 * Connection check for the Settings tab: one yes/no question, timed. The first request after
 * Unsloth starts also loads the model (10-20 s), so callers should say that a slow first test is
 * normal.
 */
export async function testDecisionConnection(opts = {}) {
    const started = performance.now();
    const answers = await decide("A cat is sitting on a sofa.", {
        test: noul("Is there an animal in the text?"),
    }, opts);
    return { ms: Math.round(performance.now() - started), yes: answers.test?.noul };
}

// ---- Answer helpers ----
// Threshold on `probabilities` (or noul's value), not `confidence` — per Unsloth's docs, confidence
// only says how peaked the distribution is and its formula differs from Jev's.

/** True when the yes-probability of a noul answer reaches `threshold`. */
export function isYes(answer, threshold = getDecisionSettings().threshold) {
    return typeof answer?.noul === "number" && answer.noul >= threshold;
}

/**
 * Most likely option of a choice answer. `confident` is false below `threshold` — callers should
 * then show the value as a suggestion for the user to confirm rather than apply it automatically.
 */
export function pickChoice(answer, threshold = getDecisionSettings().threshold) {
    const value = answer?.choice ?? null;
    const probability = value != null ? (answer.probabilities?.[value] ?? 0) : 0;
    return { value, probability, confident: value != null && probability >= threshold };
}

/**
 * Most likely level of a score answer: { level (index from 0), label, value (expected score,
 * fractional), probability, confident }.
 */
export function pickScore(answer, threshold = getDecisionSettings().threshold) {
    const probs = answer?.probabilities || {};
    let level = null, probability = 0;
    for (const [k, p] of Object.entries(probs)) {
        if (p > probability) { level = Number(k); probability = p; }
    }
    return {
        level,
        label: level != null ? (answer.legend?.[String(level)] ?? null) : null,
        value: typeof answer?.score === "number" ? answer.score : null,
        probability,
        confident: level != null && probability >= threshold,
    };
}

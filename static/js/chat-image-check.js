/**
 * chat-image-check.js — AI TOOL Chat: judge generated images (and rendered SVGs) with a
 * vision-capable decision model, so the chat can fix only what is missing.
 *
 * Why a decision model instead of the chat VLM: a generator VLM answers pass/fail without a
 * probability and was measured to say "yes" to things that are not in the image (2026-11-11:
 * gemma4-uncensored e4b judged "holds a sword" = true). Ollama decision models with image input
 * (d3:4b, clef-flash, clef) answered 18/18 checklist questions correctly on the same image with a
 * clear gap between yes (0.75-1.0) and no (0.0-0.1), and return calibrated `noul` probabilities
 * that code can threshold. Only one image was measured, so results are shown to the user and
 * automatic fix rounds are off by default.
 *
 * Flow (driven by ai-tab.js):
 *   buildChecklist()  chat LLM turns the user's request into 3-7 yes/no visual questions
 *   judgeImage()      decision model answers them for the image (+ a quality score)
 *   renderCheckCard() shows ✔ / ? / ✘ per item; failed + uncertain items are what gets fixed
 */

import { t } from "./i18n.js";
import { escapeHtml } from "./util.js";
import { decide, noul, score } from "./decision-client.js";

const OLLAMA_DEFAULT_URL = "http://localhost:11434";
export const DEFAULT_JUDGE_MODEL = "d3:4b";

// Probability bands for a noul answer (after flipping "expect: no" items). In the 2026-11-11
// test runs with d3:4b, correct passes were >= 0.88 while wrong passes caused by attribute binding
// ("Is the boy wearing a green hat?" when the girl wore it) landed at 0.70-0.79, so 0.85 is the
// pass line and 0.3-0.85 counts as "uncertain" (fixed like a failure). clef answers yes a bit
// lower (0.75+), so it reports more "uncertain" items.
export const PASS_THRESHOLD = 0.85;
export const FAIL_THRESHOLD = 0.3;

/** Judge connection: the AI TOOL Ollama URL when the chat backend is Ollama, else the default. */
export function getJudgeConfig(aiSettings = {}) {
    const baseUrl = aiSettings.backend === "ollama" && aiSettings.backendUrl
        ? aiSettings.backendUrl
        : OLLAMA_DEFAULT_URL;
    return {
        baseUrl: baseUrl.replace(/\/+$/, ""),
        model: aiSettings.chatJudgeModel || DEFAULT_JUDGE_MODEL,
        autoRounds: Math.max(0, Math.min(3, parseInt(aiSettings.chatCheckAutoRounds, 10) || 0)),
    };
}

/**
 * Ollama decision models (capabilities include "decision"), vision-capable ones first.
 * Returns [{ name, vision }]. Throws if Ollama can't be reached.
 */
export async function listJudgeModels(baseUrl) {
    const url = (baseUrl || OLLAMA_DEFAULT_URL).replace(/\/+$/, "");
    const res = await fetch(`${url}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const names = (data.models || [])
        .filter((m) => Array.isArray(m.capabilities) && m.capabilities.includes("decision"))
        .map((m) => m.name);
    const out = await Promise.all(names.map(async (name) => {
        try {
            const r = await fetch(`${url}/api/show`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: name }),
            });
            const d = r.ok ? await r.json() : {};
            const vision = (Array.isArray(d.capabilities) && d.capabilities.includes("vision"))
                || !!(d.projector_info && Object.keys(d.projector_info).length);
            return { name, vision };
        } catch {
            return { name, vision: false };
        }
    }));
    return out.sort((a, b) => (b.vision - a.vision) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

const CHECKLIST_SCHEMA = {
    type: "object",
    properties: {
        items: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    question: { type: "string" },
                    label: { type: "string" },
                    expect: { type: "string", enum: ["yes", "no"] },
                },
                required: ["question", "label", "expect"],
            },
        },
    },
    required: ["items"],
};

const CHECKLIST_SYSTEM = `You turn an image request into a short visual checklist for an image-judging model.
Return JSON only: {"items":[{"question":"...","label":"...","expect":"yes"}]}
Rules:
- 3 to 8 items, one concrete requirement per item.
- "question": an English yes/no question that can be answered by looking at the image alone. Always name who or what it is about (e.g. "Is the girl wearing a white dress?", never "Is someone wearing a white dress?"). For positions, name both sides (e.g. "Is the white rabbit between the boy and the girl?").
- "expect": "yes" when YES means the requirement is met.
- The judging model often mixes up which person has which attribute. So when the request has two or more people or animals with different attributes, add up to 2 swap-check items with "expect": "no" that ask whether the attribute is on the WRONG one (e.g. the boy should wear the green hat -> "Is the girl wearing a green hat?" with "expect": "no").
- "label": the requirement as a very short phrase in the language of the user's request, including who it is about (e.g. "男の子の緑の帽子", "帽子は女の子ではない").
- Only check visible things the user actually asked for: subject and count, key attributes and colors, clothing, pose or action, setting, time of day or lighting, text that must appear.
- Never check image quality, art style quality, or details the user did not ask for.`;

/** Pull the first JSON object out of a model reply (code fences / prose tolerated). */
export function parseChecklist(text) {
    if (!text) return [];
    let data = null;
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
        try { data = JSON.parse(text.slice(start, end + 1)); } catch { data = null; }
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    return items
        .map((it) => (typeof it === "string" ? { question: it, label: it } : it))
        .filter((it) => it && typeof it.question === "string" && it.question.trim())
        .map((it) => ({
            question: it.question.trim().slice(0, 300),
            label: String(it.label || it.question).trim().slice(0, 80),
            expect: String(it.expect || "yes").toLowerCase() === "no" ? "no" : "yes",
        }))
        .slice(0, 8);
}

/**
 * Ask the chat LLM for the checklist. `chat(messages, extraSettings)` must return the reply text.
 * Falls back to one whole-prompt question if the model returns nothing usable.
 */
export async function buildChecklist(chat, request, prompt) {
    const user = `User request: ${request || "(none)"}\nPrompt used for generation: ${prompt || "(none)"}`;
    let items = [];
    try {
        const text = await chat(
            [{ role: "system", content: CHECKLIST_SYSTEM }, { role: "user", content: user }],
            { format: CHECKLIST_SCHEMA, temperature: 0.2, thinkingMode: false },
        );
        items = parseChecklist(text);
    } catch { /* fall through to the fallback below */ }
    if (items.length === 0) {
        const desc = (request || prompt || "").replace(/\s+/g, " ").slice(0, 300);
        items = [{ question: `Does the image match this description: "${desc}"?`, label: desc.slice(0, 40), expect: "yes" }];
    }
    return items;
}

// ---------------------------------------------------------------------------
// Judging
// ---------------------------------------------------------------------------

/** Image URL / data URL → JPEG base64 (no prefix), downscaled so the longest side is <= maxSide. */
export async function imageUrlToJpegBase64(src, maxSide = 768) {
    const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("image load failed"));
        el.src = src;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((img.naturalWidth || maxSide) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || maxSide) * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // transparent SVG/PNG areas → white, like a viewer would show
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9).split(",")[1] || "";
}

/** SVG markup → JPEG base64 rendered at `size` px (white background, currentColor = black). */
export async function svgToJpegBase64(svgCode, size = 512) {
    let markup = svgCode;
    // Render at a fixed size even when the SVG has no width/height (viewBox only).
    if (!/<svg[^>]*\swidth=/i.test(markup)) markup = markup.replace(/<svg\b/i, `<svg width="${size}" height="${size}"`);
    const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(markup)))}`;
    return imageUrlToJpegBase64(dataUrl, size);
}

const QUALITY_LEVELS = ["poor", "acceptable", "excellent"];

/**
 * Judge one image against the checklist. The first request after ComfyUI generated an image can
 * fail while VRAM is still held, so it retries once after 4 s.
 * Returns { items: [{ question, label, p, status: "pass"|"uncertain"|"fail" }], quality, ms }.
 */
export async function judgeImage(imageBase64, items, cfg, { withQuality = true } = {}) {
    const questions = {};
    items.forEach((it, i) => { questions[`q${i + 1}`] = noul(it.question); });
    if (withQuality) questions.quality = score("Overall visual quality of the image", QUALITY_LEVELS);
    const opts = { backend: "ollama", baseUrl: cfg.baseUrl, model: cfg.model };
    const started = performance.now();
    let answers;
    try {
        answers = await decide("A generated image to be checked against the user's requirements.", questions, opts, [imageBase64]);
    } catch (e) {
        await new Promise((r) => setTimeout(r, 4000));
        answers = await decide("A generated image to be checked against the user's requirements.", questions, opts, [imageBase64]);
    }
    const results = items.map((it, i) => {
        const p = answers[`q${i + 1}`]?.noul;
        const raw = typeof p === "number" ? p : 0;
        // "expect: no" items (swap checks) are met when the answer is NO
        const prob = it.expect === "no" ? 1 - raw : raw;
        const status = prob >= PASS_THRESHOLD ? "pass" : prob < FAIL_THRESHOLD ? "fail" : "uncertain";
        return { ...it, p: prob, status };
    });
    let quality = null;
    if (withQuality && answers.quality) {
        const probs = answers.quality.probabilities || {};
        let best = null, bestP = -1;
        for (const [k, v] of Object.entries(probs)) if (v > bestP) { best = Number(k); bestP = v; }
        quality = { level: best, label: QUALITY_LEVELS[best] ?? null, value: answers.quality.score };
    }
    return { items: results, quality, ms: Math.round(performance.now() - started) };
}

export function failedItems(result) {
    return (result?.items || []).filter((it) => it.status !== "pass");
}

// ---------------------------------------------------------------------------
// SVG part list ("Parts: body, head (circle), beak" line written by the SVG skill)
// ---------------------------------------------------------------------------

export function parseSvgParts(text) {
    const m = (text || "").match(/^\s*\**parts?\**\s*:\s*(.+)$/im);
    if (!m) return [];
    // Split on commas outside parentheses, then drop "(how it is drawn)" notes.
    const parts = [];
    let depth = 0, cur = "";
    for (const ch of m[1]) {
        if (ch === "(") depth++;
        if (ch === ")") depth = Math.max(0, depth - 1);
        if ((ch === "," || ch === ";") && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
    }
    parts.push(cur);
    return parts
        .map((p) => p.replace(/\([^)]*\)/g, "").replace(/[.*_`]/g, "").replace(/\s+/g, " ").trim())
        .filter((p) => p && p.length <= 40)
        .slice(0, 7);
}

/** Checklist for a rendered SVG: one question per part plus "is it recognisable as <request>". */
export function svgChecklist(parts, request) {
    const items = parts.map((p) => ({ question: `Does the drawing clearly show a ${p}?`, label: p, expect: "yes" }));
    const subject = (request || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (subject) items.unshift({ question: `Is this drawing recognizable as: "${subject}"?`, label: subject.slice(0, 40), expect: "yes" });
    return items.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Result card
// ---------------------------------------------------------------------------

const STATUS_ICON = { pass: "✔", uncertain: "?", fail: "✘" };

/**
 * Render the judgement as a chat card. `actions` = [{ label, primary, onClick(btn) }].
 * Returns the card element.
 */
export function renderCheckCard(result, { model, round = 0, actions = [] } = {}) {
    const card = document.createElement("div");
    card.className = "wfm-ai-check-card";
    const failed = failedItems(result);
    const head = failed.length === 0 ? t("aiChatCheckPassed") : t("aiChatCheckFailedCount", failed.length);
    const roundText = round > 0 ? ` · ${t("aiChatCheckRound", round)}` : "";
    card.innerHTML = `
        <div class="wfm-ai-check-head ${failed.length ? "is-fail" : "is-pass"}">
            <span>${escapeHtml(head)}</span>
            <span class="wfm-ai-check-meta">${escapeHtml(t("aiChatCheckBy", model))}${escapeHtml(roundText)} · ${(result.ms / 1000).toFixed(1)}s</span>
        </div>
        <ul class="wfm-ai-check-list">
            ${result.items.map((it) => `
                <li class="wfm-ai-check-item is-${it.status}" title="${escapeHtml(it.question)}">
                    <span class="wfm-ai-check-icon">${STATUS_ICON[it.status]}</span>
                    <span class="wfm-ai-check-label">${escapeHtml(it.label)}</span>
                    <span class="wfm-ai-check-p">${Math.round(it.p * 100)}%</span>
                </li>`).join("")}
        </ul>
        ${result.quality?.label ? `<div class="wfm-ai-check-quality">${escapeHtml(t("aiChatCheckQuality", t(`aiChatCheckQuality_${result.quality.label}`)))}</div>` : ""}
    `;
    if (actions.length) {
        const row = document.createElement("div");
        row.className = "wfm-ai-chat-msg-actions";
        for (const a of actions) {
            const btn = document.createElement("button");
            btn.className = `wfm-btn wfm-btn-sm${a.primary ? " wfm-btn-primary" : ""}`;
            btn.textContent = a.label;
            btn.addEventListener("click", () => a.onClick(btn));
            row.appendChild(btn);
        }
        card.appendChild(row);
    }
    return card;
}

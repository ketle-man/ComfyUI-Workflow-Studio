/**
 * workflow-compat-check.js — "GenerateUI compatibility check" for the Workflow tab detail modal.
 *
 * Two verdicts, each shown as a ✅ / ⚠ / ❌ badge whose hover tip lists the reasons:
 *  - conversion: can the workflow be turned into the API prompt GenerateUI queues? Uses the same
 *    convertUiToApi() as GenerateUI. ❌ = unsupported format / conversion error / node types ComfyUI
 *    doesn't know (it would reject the prompt with missing_node_type); ⚠ = COMBO values not available
 *    here (models, LoRAs, images…) that the conversion silently replaces with the first choice.
 *  - operability: how much of the workflow can be run from GenerateUI's fields alone — the share of
 *    nodes with settings that GenerateUI exposes per analyzeWorkflow() (✅ 80%+, ⚠ 50%+, ❌ below).
 *    The Decision Model (laya) was tried for this rating but couldn't tell the cases apart (an
 *    all-hidden workflow scored higher than an all-exposed one), so the rating is rule-based.
 * Nothing is persisted; results are cached in memory for the session only.
 */

import { comfyWorkflow } from "./comfyui-workflow.js";
import { t } from "./i18n.js";

const MAX_LIST = 8;            // items listed per section in the tip
const _cache = new Map();      // filename -> result (session only)

export function getCachedCompat(filename) {
    return _cache.get(filename) || null;
}

const _list = (items) => {
    const shown = items.slice(0, MAX_LIST).map((s) => `  • ${s}`);
    if (items.length > MAX_LIST) shown.push(`  • ${t("compatMore", items.length - MAX_LIST)}`);
    return shown;
};

// API-format workflows skip convertUiToApi(), so check their COMBO values directly
function _comboMismatches(api, objectInfo) {
    const out = [];
    for (const [id, node] of Object.entries(api)) {
        const def = objectInfo[node.class_type]?.input;
        if (!def) continue;
        const specs = { ...(def.required || {}), ...(def.optional || {}) };
        for (const [name, val] of Object.entries(node.inputs || {})) {
            if (Array.isArray(val)) continue;
            const choices = Array.isArray(specs[name]?.[0]) ? specs[name][0] : null;
            if (choices && choices.length > 0 && !choices.includes(val)) {
                out.push({ nodeId: id, type: node.class_type, title: node._meta?.title || node.class_type, input: name, original: val });
            }
        }
    }
    return out;
}

async function _checkConversion(raw, filename) {
    const format = comfyWorkflow.detectFormat(raw, filename);
    if (format === "app") return { status: "error", lines: [t("appFormatNotSupported")] };
    if (format === "unknown") return { status: "error", lines: [t("unknownWorkflowFormat")] };

    let api, subs = [], bypassed = [], muted = [];
    try {
        if (format === "ui") {
            api = await comfyWorkflow.convertUiToApi(structuredClone(raw));
            subs = comfyWorkflow.getLastComboSubstitutions();
            bypassed = comfyWorkflow.getLastBypassedNodes();
            muted = comfyWorkflow.getLastMutedNodes();
        } else {
            api = raw;
        }
    } catch (e) {
        return { status: "error", lines: [t("compatConvertFailed", e.message || String(e))] };
    }
    const objectInfo = await comfyWorkflow.getObjectInfo();
    if (format === "api") subs = _comboMismatches(api, objectInfo);

    const ids = Object.keys(api || {});
    if (ids.length === 0) return { status: "error", lines: [t("compatNoNodes")] };

    const hasObjectInfo = Object.keys(objectInfo).length > 0;
    const missingTypes = hasObjectInfo
        ? [...new Set(ids.map((id) => api[id].class_type).filter((ct) => !objectInfo[ct]))]
        : [];

    // API-format files are queued as-is (no conversion), so say so instead of "after conversion"
    const lines = [format === "api" ? t("compatNodeCountApi", ids.length) : t("compatNodeCount", ids.length)];
    if (bypassed.length || muted.length) lines.push(t("compatBypassMuted", bypassed.length, muted.length));
    if (!hasObjectInfo) lines.push(t("compatNoObjectInfo"));
    if (missingTypes.length) {
        lines.push(t("compatMissingNodes", missingTypes.length));
        lines.push(..._list(missingTypes));
    }
    if (subs.length) {
        // UI format: convertUiToApi() swaps them for the first choice. API format skips conversion,
        // so ComfyUI rejects them at validation ("Value not in list") unless fixed beforehand.
        lines.push(t(format === "api" ? "compatComboMissingApi" : "compatComboMissing", subs.length));
        lines.push(..._list(subs.map((s) => `${s.title}.${s.input}: ${s.original}`)));
    }
    const status = missingTypes.length ? "error" : (subs.length || !hasObjectInfo) ? "warn" : "ok";
    if (status === "ok") lines.push(t(format === "api" ? "compatApiOk" : "compatConvertOk"));
    return { status, lines, api, objectInfo };
}

// Node IDs GenerateUI shows fields for (Settings uses only the first sampler / latent)
function _exposedNodeIds(analysis) {
    const ids = new Set();
    const add = (item) => {
        if (!item) return;
        if (item.id != null) ids.add(String(item.id));
        for (const [k, v] of Object.entries(item)) {
            if (/NodeId$/.test(k) && v != null) ids.add(String(v));
        }
    };
    for (const [key, items] of Object.entries(analysis)) {
        if (key === "all_nodes" || !Array.isArray(items)) continue;
        if (key === "sampler_nodes" || key === "latent_nodes") add(items[0]);
        else items.forEach(add);
    }
    return ids;
}

function _operabilityFacts(api, analysis) {
    const exposed = _exposedNodeIds(analysis);
    const settingsNodes = Object.entries(api).filter(([, n]) =>
        Object.values(n.inputs || {}).some((v) => !Array.isArray(v)));
    const hidden = settingsNodes.filter(([id]) => !exposed.has(id));
    const hiddenDesc = hidden.map(([, n]) => {
        const names = Object.entries(n.inputs || {}).filter(([, v]) => !Array.isArray(v)).map(([k]) => k);
        const title = n._meta?.title && n._meta.title !== n.class_type ? ` "${n._meta.title}"` : "";
        return `${n.class_type}${title} (${names.slice(0, 6).join(", ")}${names.length > 6 ? ", …" : ""})`;
    });
    const count = (k) => (analysis[k] || []).length;
    const positive = (analysis.prompt_nodes || []).filter((n) => n.role === "positive").length;
    const negative = (analysis.prompt_nodes || []).filter((n) => n.role === "negative").length;
    const coverage = settingsNodes.length ? (settingsNodes.length - hidden.length) / settingsNodes.length : 0;
    return {
        positive, negative,
        samplers: count("sampler_nodes"), latent: count("latent_nodes") + count("resolution_selector_nodes"),
        models: count("checkpoint_nodes") + count("diffusion_model_nodes") + count("text_encoder_nodes"),
        loras: count("lora_nodes"), loadImages: count("load_image_nodes"), saves: count("save_nodes"),
        settingsTotal: settingsNodes.length, hiddenDesc, coverage,
    };
}

const _statusFromCoverage = (c) => (c >= 0.8 ? "ok" : c >= 0.5 ? "warn" : "error");

function _checkOperability(conv) {
    const analysis = comfyWorkflow.analyzeWorkflow(conv.api);
    const f = _operabilityFacts(conv.api, analysis);
    const pct = Math.round(f.coverage * 100);
    const lines = [
        t("compatScoreRule", pct),
        t("compatFactPrompts", f.positive, f.negative),
        t("compatFactSampler", f.samplers),
        t("compatFactCoverage", f.settingsTotal - f.hiddenDesc.length, f.settingsTotal, pct),
    ];
    if (f.hiddenDesc.length) {
        lines.push(t("compatFactHidden"));
        lines.push(..._list(f.hiddenDesc));
    }
    return { status: _statusFromCoverage(f.coverage), label: `${pct}%`, lines };
}

/** Run both checks for one workflow (raw JSON as stored). Never throws. */
export async function checkWorkflowCompat(raw, filename) {
    let result;
    try {
        const conversion = await _checkConversion(raw, filename);
        const operability = conversion.status === "error"
            ? { status: "skip", label: "—", lines: [t("compatOperabilitySkipped")] }
            : _checkOperability(conversion);
        result = {
            conversion: { status: conversion.status, lines: conversion.lines },
            operability,
        };
    } catch (e) {
        result = {
            conversion: { status: "error", lines: [t("compatConvertFailed", e.message || String(e))] },
            operability: { status: "skip", label: "—", lines: [t("compatOperabilitySkipped")] },
        };
    }
    _cache.set(filename, result);
    return result;
}

const ICON = { ok: "✅", warn: "⚠", error: "❌", skip: "—" };

/** Badge HTML for one verdict: icon + label, reasons in the hover tip (data-tip, pre-line). */
export function compatBadgeHtml(title, verdict, escapeHtml) {
    const label = verdict.label ? ` ${verdict.label}` : "";
    const tip = [title, ...verdict.lines].join("\n");
    return `<span class="wfm-compat-badge wfm-compat-${verdict.status}" tabindex="0" data-tip="${escapeHtml(tip)}">${ICON[verdict.status]} ${escapeHtml(title)}${escapeHtml(label)}</span>`;
}

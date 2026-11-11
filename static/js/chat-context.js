/**
 * chat-context.js — facts injected into the AI TOOL Chat system prompt by a skill's
 * `metadata.context` list ("workflow-detail", "logs"; "workflow" lives in ai-tab.js).
 *
 * Why: in the 2026-11-11 model check every local chat model answered a simple ComfyUI question
 * ("SDXL vs Flux") with confident factual errors. Diagnosis skills therefore must not rely on what
 * the model "knows" — they get verifiable data instead: the exact node graph, which node types
 * ComfyUI does not know (not installed), which model/option values are not in ComfyUI's own
 * lists (with the closest existing names), the last execution error from /history, and the tail
 * of the ComfyUI log. Everything is plain text, size-capped, and built fresh on every message.
 */

import { comfyUI } from "./comfyui-client.js";
import { comfyWorkflow } from "./comfyui-workflow.js";

const MAX_NODES = 60;
const MAX_DETAIL_CHARS = 9000;
const MAX_LOG_CHARS = 3500;

function _trunc(v, n = 80) {
    const s = String(v).replace(/\s+/g, " ");
    return s.length > n ? `${s.slice(0, n)}…` : s;
}

// object_info input spec → the list of allowed values for a COMBO input, or null.
// Two shapes exist: [[...options], {...}] (classic) and ["COMBO", {options: [...]}] (V3 nodes).
function _comboOptions(spec) {
    if (!Array.isArray(spec)) return null;
    if (Array.isArray(spec[0])) return spec[0];
    if (spec[0] === "COMBO" && Array.isArray(spec[1]?.options)) return spec[1].options;
    return null;
}

// Core ComfyUI link-only types. Custom node packs also define UI widgets with their own
// upper-case type names (LOAD_3D viewport_state, COLOR, IMAGECOMPARE...), which an API-format
// workflow legitimately omits, so only these well-known connection types are checked.
const CONNECTION_TYPES = new Set([
    "MODEL", "CLIP", "VAE", "CONDITIONING", "LATENT", "IMAGE", "MASK", "CONTROL_NET",
    "CLIP_VISION", "CLIP_VISION_OUTPUT", "STYLE_MODEL", "UPSCALE_MODEL", "GLIGEN", "AUDIO",
    "VIDEO", "SIGMAS", "NOISE", "GUIDER", "SAMPLER", "LORA_MODEL", "HOOKS", "MESH", "VOXEL",
]);

// A required input that can only be satisfied by a link (MODEL / CLIP / LATENT / IMAGE ...).
function _isConnectionType(spec) {
    if (!Array.isArray(spec) || typeof spec[0] !== "string") return false;
    return CONNECTION_TYPES.has(spec[0]);
}

function _inputSpec(info, name) {
    return info?.input?.required?.[name] ?? info?.input?.optional?.[name] ?? null;
}

// Closest existing option names for a value that is not in the list (token overlap on the
// file name, ignoring folders and extensions). Good enough to point at "you have v2, not v3".
export function closestOptions(value, options, limit = 3) {
    const tokens = (s) => new Set(String(s).toLowerCase().replace(/\\/g, "/").split("/").pop()
        .replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|sft)$/i, "")
        .split(/[^a-z0-9]+/).filter((t) => t.length > 1));
    const want = tokens(value);
    if (!want.size) return [];
    return options
        .filter((o) => typeof o === "string")
        .map((o) => {
            const have = tokens(o);
            let common = 0;
            for (const t of want) if (have.has(t)) common++;
            return { o, score: common / Math.max(want.size, have.size || 1) };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.o);
}

/**
 * Detailed, checked description of the workflow loaded in GenerateUI (API format).
 * Pure data → text; `objectInfo` is { classType: info } for the types used.
 */
export function describeWorkflowDetail(wf, objectInfo) {
    const entries = Object.entries(wf || {}).filter(([, n]) => n && typeof n === "object" && n.class_type);
    const lines = ["## Workflow facts (checked by Workflow Studio against this ComfyUI install)"];
    lines.push(`- ${entries.length} nodes.`);

    const types = [...new Set(entries.map(([, n]) => n.class_type))];
    const missingTypes = types.filter((ty) => !objectInfo?.[ty]);
    lines.push(missingTypes.length
        ? `- NOT INSTALLED node types (ComfyUI does not know them): ${missingTypes.join(", ")}`
        : "- All node types are installed.");

    const problems = [];
    const nodeLines = [];
    const ids = new Set(entries.map(([id]) => id));
    for (const [id, node] of entries.slice(0, MAX_NODES)) {
        const info = objectInfo?.[node.class_type];
        const title = node._meta?.title && node._meta.title !== node.class_type ? ` "${_trunc(node._meta.title, 40)}"` : "";
        const values = [];
        const links = [];
        for (const [k, v] of Object.entries(node.inputs || {})) {
            if (Array.isArray(v) && v.length === 2 && (typeof v[0] === "string" || typeof v[0] === "number")) {
                const src = String(v[0]);
                links.push(`${k}<-#${src}`);
                if (!ids.has(src)) problems.push(`#${id} ${node.class_type}: input "${k}" is linked to node #${src}, which does not exist.`);
                continue;
            }
            if (v === null || typeof v === "object") continue;
            values.push(`${k}=${_trunc(v, k === "text" || k === "prompt" ? 120 : 70)}`);
            const options = info ? _comboOptions(_inputSpec(info, k)) : null;
            if (options && typeof v === "string" && options.length && !options.includes(v)) {
                const near = closestOptions(v, options);
                problems.push(`#${id} ${node.class_type}: ${k}="${v}" is NOT in ComfyUI's list for this input${near.length ? ` (closest existing: ${near.map((o) => `"${o}"`).join(", ")})` : " (no similar name found)"}.`);
            }
        }
        if (info) {
            // Only unconnected required CONNECTION inputs (MODEL, CLIP, LATENT, IMAGE, ...) are
            // reported: those make the run fail for sure. Missing widget values are usually filled
            // with defaults or are UI-only, and dynamic inputs (Autogrow "COMFY_*") are stored
            // under other keys - checking them produced false alarms on ~1/3 of real workflows.
            for (const [name, spec] of Object.entries(info.input?.required || {})) {
                if (name in (node.inputs || {}) || !_isConnectionType(spec)) continue;
                problems.push(`#${id} ${node.class_type}: required ${spec[0]} input "${name}" is not connected.`);
            }
        }
        nodeLines.push(`#${id} ${node.class_type}${title}${missingTypes.includes(node.class_type) ? " [NOT INSTALLED]" : ""}: ${[...values, ...links].join(", ") || "(no inputs)"}`);
    }
    if (entries.length > MAX_NODES) nodeLines.push(`… ${entries.length - MAX_NODES} more nodes not listed.`);

    lines.push(problems.length ? `- Detected problems:\n${problems.slice(0, 30).map((p) => `  - ${p}`).join("\n")}` : "- No missing files, options or links detected.");
    lines.push("- Nodes (#id ClassType: widget values, input<-#source node):");
    let text = `${lines.join("\n")}\n${nodeLines.map((l) => `  ${l}`).join("\n")}`;
    if (text.length > MAX_DETAIL_CHARS) text = `${text.slice(0, MAX_DETAIL_CHARS)}\n  … (truncated)`;
    return text;
}

export async function buildWorkflowDetailContext() {
    const wf = comfyUI.currentWorkflow;
    if (!wf) return "## Workflow facts\nNo workflow is loaded in GenerateUI. Ask the user to load the workflow they are asking about in the GenerateUI tab.";
    const types = [...new Set(Object.values(wf).map((n) => n?.class_type).filter(Boolean))];
    let objectInfo = {};
    try {
        objectInfo = await comfyWorkflow.getObjectInfoForTypes(types);
    } catch (e) {
        return `## Workflow facts\nCould not read node definitions from ComfyUI (${e.message}), so installed nodes and files could not be checked.`;
    }
    return describeWorkflowDetail(wf, objectInfo);
}

// ANSI colour codes from ComfyUI's coloured log lines
const ANSI_RE = /\u001b\[[0-9;]*m/g;

/** Keep the most recent error block of the log (from the last Traceback / error line), else the tail. */
export function extractLogTail(logText, maxChars = MAX_LOG_CHARS) {
    const lines = String(logText || "").replace(ANSI_RE, "").split(/\r?\n/).filter((l) => l.trim());
    let start = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (/Traceback \(most recent call last\)|!!! Exception|Error:|ERROR|Prompt outputs failed validation/.test(lines[i])) {
            start = i;
            // walk back to the beginning of a traceback block
            while (start > 0 && /^\s|Traceback|File "/.test(lines[start - 1]) && i - start < 40) start--;
            break;
        }
    }
    const picked = start >= 0 ? lines.slice(Math.max(0, start - 3), start + 40) : lines.slice(-25);
    let text = picked.join("\n");
    if (text.length > maxChars) text = `…${text.slice(-maxChars)}`;
    return { text, hasError: start >= 0 };
}

/** Last execution error recorded in ComfyUI's /history (most recent first). */
export function lastExecutionError(history) {
    const runs = Object.values(history || {});
    for (let i = runs.length - 1; i >= 0; i--) {
        const msgs = runs[i]?.status?.messages || [];
        const err = msgs.find((m) => m?.[0] === "execution_error")?.[1];
        if (err) return err;
    }
    return null;
}

export async function buildLogsContext() {
    const parts = ["## ComfyUI runtime facts"];
    try {
        const res = await fetch(`${comfyUI.baseUrl || ""}/history?max_items=5`);
        const err = res.ok ? lastExecutionError(await res.json()) : null;
        if (err) {
            const tb = Array.isArray(err.traceback) ? err.traceback.join("").split("\n").filter(Boolean).slice(-8).join("\n") : "";
            parts.push(`- Last execution error (from /history): node #${err.node_id} ${err.node_type}: ${err.exception_type}: ${_trunc(err.exception_message, 600)}${tb ? `\n  Traceback tail:\n${tb}` : ""}`);
        } else {
            parts.push("- No execution error in the last 5 runs (/history).");
        }
    } catch (e) {
        parts.push(`- Could not read /history: ${e.message}`);
    }
    try {
        const res = await fetch(`${comfyUI.baseUrl || ""}/internal/logs`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const { text, hasError } = extractLogTail(typeof raw === "string" ? raw : JSON.stringify(raw));
        parts.push(`- ComfyUI log (${hasError ? "most recent error block" : "last lines, no error found"}):\n${text}`);
    } catch (e) {
        parts.push(`- Could not read the ComfyUI log: ${e.message}`);
    }
    return parts.join("\n");
}

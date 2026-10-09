/**
 * Metadata Tab
 * Drop a PNG/WebP/JSON file to extract and display model/prompt metadata.
 * Parsing logic adapted from model-and-prompt-from-metadata (workflow_utils.js).
 */

import { t } from "./i18n.js";
import { escapeHtml } from "./util.js";
import { comfyWorkflow } from "./comfyui-workflow.js";

// ── File size limit ───────────────────────────────────────────
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// ── Sanitize JSON (NaN/Infinity → null) ──────────────────────
function sanitizeJSON(text) {
    return text
        .replace(/-Infinity\b/g, "null")
        .replace(/\bInfinity\b/g, "null")
        .replace(/\bNaN\b/g, "null");
}

// ── WebP EXIF ────────────────────────────────────────────────
async function readWebPEXIFChunk(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const ascii = new TextDecoder("latin1");
    if (bytes.byteLength < 12) return null;
    if (ascii.decode(bytes.slice(0, 4)) !== "RIFF") return null;
    if (ascii.decode(bytes.slice(8, 12)) !== "WEBP") return null;
    let offset = 12;
    while (offset + 8 <= buffer.byteLength) {
        const fourcc = ascii.decode(bytes.slice(offset, offset + 4));
        const chunkSize = view.getUint32(offset + 4, true);
        if (fourcc === "EXIF") return bytes.slice(offset + 8, offset + 8 + chunkSize);
        offset += 8 + chunkSize;
        if (chunkSize % 2 === 1) offset++;
    }
    return null;
}

function extractWorkflowFromEXIF(exifBytes) {
    const utf8 = new TextDecoder("utf-8", { fatal: false });
    const text = utf8.decode(exifBytes);
    for (const key of ["workflow:", "prompt:"]) {
        const idx = text.indexOf(key + "{");
        if (idx < 0) continue;
        let jsonStr = text.slice(idx + key.length);
        const nullIdx = jsonStr.indexOf("\x00");
        if (nullIdx >= 0) jsonStr = jsonStr.slice(0, nullIdx);
        try { return JSON.parse(sanitizeJSON(jsonStr)); } catch {
            const lb = jsonStr.lastIndexOf("}");
            if (lb > 0) { try { return JSON.parse(sanitizeJSON(jsonStr.slice(0, lb + 1))); } catch {} }
        }
    }
    return null;
}

// ── PNG text chunks ───────────────────────────────────────────
function findNull(arr, start = 0) {
    for (let i = start; i < arr.length; i++) if (arr[i] === 0) return i;
    return -1;
}
function parseTEXtChunk(data, latin1) {
    const np = findNull(data);
    if (np === -1) return null;
    return { keyword: latin1.decode(data.slice(0, np)), text: latin1.decode(data.slice(np + 1)) };
}
function parseITXtChunk(data, latin1, utf8) {
    const np = findNull(data);
    if (np === -1) return null;
    const keyword = latin1.decode(data.slice(0, np));
    let pos = np + 3;
    pos = findNull(data, pos); if (pos === -1) return null; pos++;
    pos = findNull(data, pos); if (pos === -1) return null; pos++;
    return { keyword, text: utf8.decode(data.slice(pos)) };
}
export async function readAllPNGTextChunks(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIG[i]) return null;
    const view = new DataView(buffer);
    const latin1 = new TextDecoder("latin1");
    const utf8 = new TextDecoder("utf-8");
    let offset = 8;
    const chunks = {};
    while (offset + 12 <= buffer.byteLength) {
        const length = view.getUint32(offset);
        if (offset + 12 + length > buffer.byteLength) break;
        const type = latin1.decode(bytes.slice(offset + 4, offset + 8));
        const data = bytes.slice(offset + 8, offset + 8 + length);
        if (type === "tEXt") { const c = parseTEXtChunk(data, latin1); if (c) chunks[c.keyword] = c.text; }
        else if (type === "iTXt") { const c = parseITXtChunk(data, latin1, utf8); if (c) chunks[c.keyword] = c.text; }
        offset += 12 + length;
    }
    return chunks;
}

// ── MP4 container metadata (moov/udta/meta の mdta keys/ilst) ──
// ComfyUIのSaveVideoはPNGのtEXtチャンクと同じキー名(workflow=UI形式, prompt=API形式)で
// JSON文字列をisobmff(mp4)のudta/meta(mdta)にコンテナレベルタグとして書き込む(FFmpegの
// movflags=+use_metadata_tags)。ここではPyAV等に頼らずブラウザ側でボックスを直接辿って読む。
function findMP4Box(view, bytes, start, end, targetType) {
    let offset = start;
    while (offset + 8 <= end) {
        const size = view.getUint32(offset);
        const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
        let boxSize = size;
        let bodyStart = offset + 8;
        if (size === 1) {
            if (offset + 16 > end) break;
            const hi = view.getUint32(offset + 8);
            const lo = view.getUint32(offset + 12);
            boxSize = hi * 4294967296 + lo;
            bodyStart = offset + 16;
        } else if (size === 0) {
            boxSize = end - offset;
        }
        if (boxSize < 8) break;
        if (type === targetType) return { bodyStart, end: offset + boxSize };
        offset += boxSize;
    }
    return null;
}

export async function readMP4MetaTags(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    if (bytes.length < 12) return null;
    const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (ftyp !== "ftyp") return null;

    const moov = findMP4Box(view, bytes, 0, bytes.length, "moov");
    if (!moov) return null;
    const udta = findMP4Box(view, bytes, moov.bodyStart, moov.end, "udta");
    let meta = udta ? findMP4Box(view, bytes, udta.bodyStart, udta.end, "meta") : null;
    if (!meta) meta = findMP4Box(view, bytes, moov.bodyStart, moov.end, "meta");
    if (!meta) return null;
    const metaBody = meta.bodyStart + 4; // meta は FullBox (version+flags 4バイト)
    const keysBox = findMP4Box(view, bytes, metaBody, meta.end, "keys");
    const ilstBox = findMP4Box(view, bytes, metaBody, meta.end, "ilst");
    if (!keysBox || !ilstBox) return null;

    const utf8 = new TextDecoder("utf-8", { fatal: false });
    let off = keysBox.bodyStart + 4; // version+flags をスキップ
    const count = view.getUint32(off); off += 4;
    const keyNames = [];
    for (let i = 0; i < count && off + 8 <= keysBox.end; i++) {
        const ksize = view.getUint32(off);
        if (ksize < 8) break;
        keyNames.push(utf8.decode(bytes.slice(off + 8, off + ksize)));
        off += ksize;
    }

    const result = {};
    let ioff = ilstBox.bodyStart;
    while (ioff + 8 <= ilstBox.end) {
        const itemSize = view.getUint32(ioff);
        const keyIndex = view.getUint32(ioff + 4);
        if (itemSize < 8) break;
        const itemEnd = Math.min(ioff + itemSize, ilstBox.end);
        const data = findMP4Box(view, bytes, ioff + 8, itemEnd, "data");
        if (data) {
            const payload = bytes.slice(data.bodyStart + 8, data.end); // type(4)+locale(4)をスキップ
            const name = keyNames[keyIndex - 1];
            if (name) { try { result[name] = utf8.decode(payload); } catch { /* skip */ } }
        }
        ioff = itemEnd;
    }
    return result;
}

// ── Workflow extraction helpers ───────────────────────────────
function collectUnique(arr) {
    const seen = new Set(), out = [];
    for (const v of arr) { if (v && typeof v === "string" && !seen.has(v)) { seen.add(v); out.push(v); } }
    return out;
}
function collectAllNodes(workflow) {
    if (!Array.isArray(workflow.nodes)) return [];
    const all = [...workflow.nodes];
    for (const sg of workflow.definitions?.subgraphs ?? []) if (Array.isArray(sg.nodes)) all.push(...sg.nodes);
    return all;
}
const META_NODE_TYPES = new Set(["ImageMetadataCheckpointLoader", "ImageMetadataPromptLoader"]);
const VAE_NONE = "None";

function extractCheckpoints(wf) {
    if (!wf || typeof wf !== "object") return [];
    if (Array.isArray(wf.nodes)) return collectUnique(collectAllNodes(wf).filter(n => n.type?.toLowerCase().includes("checkpoint") || META_NODE_TYPES.has(n.type)).map(n => n.widgets_values?.[0]));
    return collectUnique(Object.values(wf).filter(n => n?.class_type?.toLowerCase().includes("checkpoint") || META_NODE_TYPES.has(n?.class_type)).map(n => n.inputs?.ckpt_name));
}
function extractVAEs(wf) {
    if (!wf || typeof wf !== "object") return [];
    if (Array.isArray(wf.nodes)) return collectUnique(collectAllNodes(wf).flatMap(n => { if (n.type === "VAELoader") return [n.widgets_values?.[0]]; if (META_NODE_TYPES.has(n.type ?? "")) { const v = n.widgets_values?.[1]; return v && v !== VAE_NONE ? [v] : []; } return []; }));
    return collectUnique(Object.values(wf).flatMap(n => { if (!n || typeof n !== "object") return []; if (n.class_type === "VAELoader") return [n.inputs?.vae_name]; if (META_NODE_TYPES.has(n.class_type ?? "")) { const v = n.inputs?.vae_name; return v && v !== VAE_NONE ? [v] : []; } return []; }));
}
function extractDiffusionModels(wf) {
    if (!wf || typeof wf !== "object") return [];
    const UNET_TYPES = new Set(["UNETLoader", "UnetLoaderGGUF", "UNETLoaderGGUF"]);
    if (Array.isArray(wf.nodes)) return collectUnique(collectAllNodes(wf).filter(n => UNET_TYPES.has(n.type)).map(n => n.widgets_values?.[0]));
    return collectUnique(Object.values(wf).filter(n => UNET_TYPES.has(n?.class_type)).map(n => n.inputs?.unet_name));
}
function extractTextEncoders(wf) {
    if (!wf || typeof wf !== "object") return [];
    const names = [];
    if (Array.isArray(wf.nodes)) {
        for (const n of collectAllNodes(wf)) {
            if (n.type === "CLIPLoader") { if (n.widgets_values?.[0]) names.push(n.widgets_values[0]); }
            else if (n.type === "DualCLIPLoader") { [0,1].forEach(i => { if (n.widgets_values?.[i]) names.push(n.widgets_values[i]); }); }
            else if (n.type === "TripleCLIPLoader") { [0,1,2].forEach(i => { if (n.widgets_values?.[i]) names.push(n.widgets_values[i]); }); }
            else if (n.type === "QuadrupleCLIPLoader") { [0,1,2,3].forEach(i => { if (n.widgets_values?.[i]) names.push(n.widgets_values[i]); }); }
        }
    } else {
        for (const n of Object.values(wf)) {
            if (!n || typeof n !== "object") continue;
            const ct = n.class_type ?? "";
            if (ct === "CLIPLoader") { if (n.inputs?.clip_name) names.push(n.inputs.clip_name); }
            else if (ct === "DualCLIPLoader") { if (n.inputs?.clip_name1) names.push(n.inputs.clip_name1); if (n.inputs?.clip_name2) names.push(n.inputs.clip_name2); }
            else if (ct === "TripleCLIPLoader") { ["clip_name1","clip_name2","clip_name3"].forEach(k => { if (n.inputs?.[k]) names.push(n.inputs[k]); }); }
            else if (ct === "QuadrupleCLIPLoader") { ["clip_name1","clip_name2","clip_name3","clip_name4"].forEach(k => { if (n.inputs?.[k]) names.push(n.inputs[k]); }); }
        }
    }
    return collectUnique(names);
}
function extractLoRAs(wf) {
    if (!wf || typeof wf !== "object") return [];
    const results = [], seen = new Set();
    function add(name, sm, sc) {
        if (!name || typeof name !== "string" || name === "None" || seen.has(name)) return;
        seen.add(name);
        const smNum = parseFloat(sm);
        const scNum = parseFloat(sc);
        results.push({ name, strength_model: isNaN(smNum) ? 1.0 : smNum, strength_clip: isNaN(scNum) ? 1.0 : scNum });
    }
    if (Array.isArray(wf.nodes)) {
        for (const n of collectAllNodes(wf)) {
            const type = n.type ?? "";
            if (type === "LoraLoader") add(n.widgets_values?.[0], n.widgets_values?.[1], n.widgets_values?.[2]);
            else if (type === "LoraLoaderModelOnly") add(n.widgets_values?.[0], n.widgets_values?.[1], 1.0);
            else if (type === "ImageMetadataLoRALoader") { for (let i = 0; i < 3; i++) add(n.widgets_values?.[i*3], n.widgets_values?.[i*3+1], n.widgets_values?.[i*3+2]); }
            else if (type === "Lora Loader (LoraManager)") { const list = n.widgets_values?.find(v => Array.isArray(v)); if (list) for (const l of list) { if (l?.active !== false) add(l?.name, l?.strength ?? 1.0, l?.clipStrength ?? l?.strength ?? 1.0); } }
        }
    } else {
        for (const n of Object.values(wf)) {
            if (!n || typeof n !== "object") continue;
            const ct = n.class_type ?? "";
            if (ct === "LoraLoader") add(n.inputs?.lora_name, n.inputs?.strength_model, n.inputs?.strength_clip);
            else if (ct === "LoraLoaderModelOnly") add(n.inputs?.lora_name, n.inputs?.strength, 1.0);
            else if (ct === "Lora Loader (LoraManager)") {
                const lorasData = n.inputs?.loras;
                const list = lorasData?.__value__ ?? (Array.isArray(lorasData) ? lorasData : null);
                if (list) for (const l of list) { if (l?.active !== false) add(l?.name, l?.strength ?? 1.0, l?.clipStrength ?? l?.strength ?? 1.0); }
            }
        }
    }
    return results;
}

// LiveChatStream(ComfyUI-LiveChatStream)のRETURN_NAMES順 = INPUT_TYPESの対応ウィジェット名
// (positive→prompt_text, negative→negative_text, response→response_text, ...)。nodes.pyの
// INPUT_TYPES/RETURN_TYPESコメント通り、ウィジェット・出力スロットとも末尾追加のみで位置互換。
const LIVE_CHAT_STREAM_OUTPUT_KEYS = ["prompt_text", "negative_text", "response_text", "chat_p_text", "chat_n_text", "thinking_text"];

function isTextEncoderNode(ct) { return ct === "CLIPTextEncode" || ct.includes("TextEncode") || ct.includes("TextEncoderSD"); }
function isSamplerNode(ct) { return ct === "KSampler" || ct === "KSamplerAdvanced" || ct.includes("KSampler") || ct.includes("Sampler"); }
function isPromptStylerNode(ct) { return ct.includes("PromptStyler"); }

// サンプラーノードの設定値(seed/steps/cfg/sampler_name/scheduler/denoise)をAPI形式の
// 名前付きinputsから読む。ノードタイプごとにwidgets_valuesの並びが異なる(KSampler/
// KSamplerAdvanced等)ため、UI形式(LiteGraph)はconvertUiToApi()を経由した後に呼ぶ想定。
const SAMPLER_SETTING_KEYS = ["seed", "noise_seed", "steps", "cfg", "sampler_name", "scheduler", "denoise"];
function extractSamplerSettings(apiWf) {
    if (!apiWf || typeof apiWf !== "object" || Array.isArray(apiWf.nodes)) return null;
    for (const n of Object.values(apiWf)) {
        if (!n || typeof n !== "object" || !isSamplerNode(n.class_type ?? "")) continue;
        const inputs = n.inputs ?? {};
        const settings = {};
        for (const key of SAMPLER_SETTING_KEYS) {
            const v = inputs[key];
            if (v !== undefined && !Array.isArray(v)) settings[key] = v;
        }
        if (Object.keys(settings).length > 0) return settings;
    }
    return null;
}

// CLIPTextEncodeEditPlus (model-and-prompt-from-metadata) の encode() と同じ結合ルール。
// RAW: text1のみ。EDIT: text_editのみ。front/back: text2(未接続ならtext_edit)をtext1の前/後に結合。
function resolveEditPlusText(mode, textEdit, text1, text2) {
    const t1 = typeof text1 === "string" ? text1 : "";
    const edit = typeof textEdit === "string" ? textEdit : "";
    const insert = typeof text2 === "string" && text2 !== "" ? text2 : edit;
    switch (mode) {
        case "RAW": return t1;
        case "EDIT": return edit;
        case "front": return t1 ? `${insert}, ${t1}` : insert;
        case "back": return t1 ? `${t1}, ${insert}` : insert;
        default: return t1 || edit;
    }
}

export function extractPrompts(wf) {
    if (!wf || typeof wf !== "object") return { positives: [], negatives: [] };
    return Array.isArray(wf.nodes) ? extractPromptsLiteGraph(wf) : extractPromptsAPI(wf);
}

// LiteGraph形式: リンクを辿ってテキストを解決（ComfySwitchNode等の中継ノードにも対応）
function resolveLinkedTextInNodeSet(nodeMap, linkOrigin, linkSlot, srcId, slot, depth = 0) {
    if (depth > 6) return null;
    const srcNode = nodeMap.get(srcId);
    if (!srcNode) return null;
    const srcType = srcNode.type ?? "";
    if (isPromptStylerNode(srcType)) {
        const v = srcNode.widgets_values?.[slot];
        return (v && typeof v === "string") ? v : null;
    }
    // ComfySwitchNode ("If/Else Switch") — 片方(TextGenerateなどLLMノード)は静的解決不能なため
    // on_false/on_true の両方を試し、リテラルへ解決できた方を採用する。
    if (srcType === "ComfySwitchNode" && Array.isArray(srcNode.inputs)) {
        for (const name of ["on_false", "on_true"]) {
            const inp = srcNode.inputs.find(i => i.name === name);
            if (inp?.link == null) continue;
            const originId = linkOrigin.get(inp.link);
            const originSlot = linkSlot.get(inp.link) ?? 0;
            if (originId == null) continue;
            const text = resolveLinkedTextInNodeSet(nodeMap, linkOrigin, linkSlot, originId, originSlot, depth + 1);
            if (text) return text;
        }
        return null;
    }
    // WFS_PromptText, PrimitiveStringMultiline 等、任意の STRING 出力ノード
    const v = srcNode.widgets_values?.[slot] ?? srcNode.widgets_values?.[0];
    if (v && typeof v === "string") return v;
    // さらにリンクされている場合（StringReplace等の中継ノード）は追跡する
    // "source" = PreviewAny（値タップ中継）, "string_a" = StringConcatenate（LoRAトリガーワード
    // 連結等）— Krea-2のプロンプト強化配線で使われる中継ノード
    if (Array.isArray(srcNode.inputs)) {
        const nextInput = srcNode.inputs.find(i => ["text", "value", "prompt", "string", "source", "string_a"].includes(i.name));
        if (nextInput?.link != null) {
            const originId = linkOrigin.get(nextInput.link);
            const originSlot = linkSlot.get(nextInput.link) ?? 0;
            if (originId != null) return resolveLinkedTextInNodeSet(nodeMap, linkOrigin, linkSlot, originId, originSlot, depth + 1);
        }
    }
    return null;
}

// CLIPTextEncode + KSampler でプロンプト抽出（トップレベル・サブグラフ共用）
// サンプラーが見つかりテキストが取れた場合のみ非null を返す
function extractPromptsFromNodeSet(nodes, links) {
    const nodeMap = new Map();
    for (const n of nodes) nodeMap.set(n.id, n);
    const linkOrigin = new Map(), linkSlot = new Map();
    if (Array.isArray(links)) {
        for (const lk of links) {
            if (Array.isArray(lk)) {
                linkOrigin.set(lk[0], lk[1]);
                linkSlot.set(lk[0], lk[2] ?? 0);
            } else if (lk && typeof lk === "object") {
                const id = lk.id ?? lk[0], origin = lk.origin_id ?? lk[1], slot = lk.origin_slot ?? lk[2] ?? 0;
                if (id != null && origin != null) { linkOrigin.set(id, origin); linkSlot.set(id, slot); }
            }
        }
    }
    const textMap = new Map();
    for (const n of nodes) {
        const type = n.type ?? "";
        if (type === "CLIPTextEncodeEditPlus") {
            const resolveNamedInput = (name) => {
                if (!Array.isArray(n.inputs)) return null;
                const inp = n.inputs.find(i => i.name === name);
                if (inp?.link == null) return null;
                const originId = linkOrigin.get(inp.link);
                const originSlot = linkSlot.get(inp.link) ?? 0;
                if (originId == null) return null;
                return resolveLinkedTextInNodeSet(nodeMap, linkOrigin, linkSlot, originId, originSlot);
            };
            const combined = resolveEditPlusText(n.widgets_values?.[1], n.widgets_values?.[0], resolveNamedInput("text1"), resolveNamedInput("text2"));
            if (combined) textMap.set(n.id, combined);
            continue;
        }
        if (!isTextEncoderNode(type)) continue;
        // A text widget converted to a wired input keeps its last typed value in widgets_values[0]
        // (stale — never sent to the backend), so the linked source must win over it.
        const textInput = Array.isArray(n.inputs)
            ? n.inputs.find(inp => inp.name === "text" || inp.name === "text_g" || inp.name === "prompt")
            : null;
        const linkedText = textInput?.link != null && linkOrigin.has(textInput.link)
            ? resolveLinkedTextInNodeSet(nodeMap, linkOrigin, linkSlot, linkOrigin.get(textInput.link), linkSlot.get(textInput.link) ?? 0)
            : null;
        const text = linkedText || n.widgets_values?.[0];
        if (text && typeof text === "string") textMap.set(n.id, text);
    }
    const pos = new Set(), neg = new Set();
    let foundSampler = false;
    for (const n of nodes) {
        if (!isSamplerNode(n.type ?? "") || !Array.isArray(n.inputs)) continue;
        foundSampler = true;
        // SamplerCustomAdvanced doesn't hold positive/negative directly — it drives a separate
        // Guider node (CFGGuider/DualCFGGuider/BasicGuider) via its "guider" input. Scan that
        // node's inputs instead so the loop below can find the positive/negative-role slots.
        let inputsToScan = n.inputs;
        let viaBasicGuider = false;
        const guiderInput = n.inputs.find(inp => inp.name === "guider");
        if (guiderInput?.link != null) {
            const guiderId = linkOrigin.get(guiderInput.link);
            const guiderNode = guiderId != null ? nodeMap.get(guiderId) : null;
            if (Array.isArray(guiderNode?.inputs)) inputsToScan = guiderNode.inputs;
            viaBasicGuider = guiderNode?.type === "BasicGuider";
        }
        for (const inp of inputsToScan) {
            if (!inp || inp.link == null) continue;
            const originId = linkOrigin.get(inp.link);
            if (originId == null) continue;
            const name = inp.name ?? "";
            // DualCFGGuider (HiDream E1): cond1 carries the positive-derived conditioning.
            // BasicGuider (Flux/Ming Image etc., no negative): its single "conditioning" input is positive.
            const isPos = name === "positive" || name === "cond1" || name.startsWith("positive")
                || (viaBasicGuider && name === "conditioning");
            const isNeg = name === "negative" || name.startsWith("negative");
            if (!isPos && !isNeg) continue;
            // TextEncodeMageFlowEdit / TextEncodeBooguEdit — one node carries both prompt &
            // negative_prompt directly, so textMap (single text per node) can't represent both
            // roles.
            const srcNode = nodeMap.get(originId);
            if (srcNode?.type === "TextEncodeMageFlowEdit" || srcNode?.type === "TextEncodeBooguEdit") {
                const widgetIdx = isPos ? 0 : 1; // widgets_values: [prompt, negative_prompt, ...]
                const text = srcNode.widgets_values?.[widgetIdx];
                if (text && typeof text === "string") { if (isPos) pos.add(text); else neg.add(text); }
                continue;
            }
            // InstructPixToPixConditioning (HiDream E1): forwards the actual text-encoder
            // conditioning through its own positive/negative inputs — follow one more hop.
            let resolvedOriginId = originId;
            if (srcNode?.type === "InstructPixToPixConditioning" && Array.isArray(srcNode.inputs)) {
                const innerInput = srcNode.inputs.find(i => i.name === (isPos ? "positive" : "negative"));
                if (innerInput?.link != null) {
                    const innerId = linkOrigin.get(innerInput.link);
                    if (innerId != null) resolvedOriginId = innerId;
                }
            }
            const text = textMap.get(resolvedOriginId);
            if (!text) continue;
            if (isPos) pos.add(text); else neg.add(text);
        }
    }
    if (!foundSampler) return null;
    // SamplerCustomAdvanced などで positive/negative 直結がない場合、判別不能テキストとして返す
    if (pos.size === 0 && neg.size === 0) {
        const allTexts = [...textMap.values()].filter(t => t.trim());
        if (allTexts.length > 0) return { positives: [], negatives: [], texts: allTexts };
        return null;
    }
    return { positives: [...pos], negatives: [...neg] };
}

// MarkdownNote の **section** → - [name](url) パターンからモデルを抽出
// flux/qwen/z-image などのサブグラフ形式ワークフロー向け補完用
function extractMarkdownNoteModels(wf) {
    const allNodes = [];
    if (Array.isArray(wf.nodes)) allNodes.push(...wf.nodes);
    for (const sg of wf.definitions?.subgraphs ?? []) if (Array.isArray(sg.nodes)) allNodes.push(...sg.nodes);
    const result = { checkpoints: [], vaes: [], diffusionModels: [], textEncoders: [], loras: [] };
    const seen = { checkpoints: new Set(), vaes: new Set(), diffusionModels: new Set(), textEncoders: new Set(), loras: new Set() };
    function addU(arr, set, name) { if (name && typeof name === "string" && !set.has(name)) { set.add(name); arr.push(name); } }
    for (const n of allNodes) {
        if (n.type !== "MarkdownNote") continue;
        const raw = n.widgets_values;
        const text = Array.isArray(raw) ? raw[0] : (typeof raw === "string" ? raw : null);
        if (!text) continue;
        const sRe = /\*\*([^*\n]+)\*\*/g;
        let sm;
        while ((sm = sRe.exec(text)) !== null) {
            const sec = sm[1].trim().toLowerCase().replace(/\s+/g, "_");
            if (!["text_encoders", "diffusion_models", "vae", "checkpoints", "loras"].includes(sec)) continue;
            const rest = text.slice(sm.index + sm[0].length);
            const end = rest.search(/\n\*\*|\n##/);
            const content = end >= 0 ? rest.slice(0, end) : rest;
            const lRe = /^- \[([^\]]+)\]/gm;
            let lm;
            while ((lm = lRe.exec(content)) !== null) {
                const name = lm[1].trim();
                if (sec === "text_encoders") addU(result.textEncoders, seen.textEncoders, name);
                else if (sec === "diffusion_models") addU(result.diffusionModels, seen.diffusionModels, name);
                else if (sec === "vae") addU(result.vaes, seen.vaes, name);
                else if (sec === "checkpoints") addU(result.checkpoints, seen.checkpoints, name);
                else if (sec === "loras") addU(result.loras, seen.loras, name);
            }
        }
    }
    const hasAny = result.checkpoints.length || result.vaes.length || result.diffusionModels.length || result.textEncoders.length || result.loras.length;
    return hasAny ? result : null;
}

// API形式: リンク参照 [srcNodeId, slot] からテキストを解決
function resolveLinkedText(wf, srcId, slot, depth = 0) {
    if (depth > 6) return null;
    const src = wf[String(srcId)];
    if (!src || typeof src !== "object") return null;
    const ct = src.class_type ?? "";
    // PromptStyler系: slot 0 = text_positive, slot 1 = text_negative
    if (isPromptStylerNode(ct)) {
        const v = slot === 0 ? src.inputs?.text_positive : src.inputs?.text_negative;
        return (v && typeof v === "string") ? v : null;
    }
    // LiveChatStream (ComfyUI-LiveChatStream) — 出力(positive/negative/response/chat_p/
    // chat_n/thinking)は同名+"_text"の非表示ウィジェットの値をそのまま返すだけのノード。
    // 下の汎用キー探索には引っかからない(prompt_text等は"prompt"等と一致しない)ため個別対応する。
    // response(LLM応答全文)は数千〜数万文字になり得るが、文字列を返すだけなので問題なく解決できる。
    if (ct === "LiveChatStream") {
        const key = LIVE_CHAT_STREAM_OUTPUT_KEYS[slot];
        const v = key ? src.inputs?.[key] : undefined;
        return (typeof v === "string" && v) ? v : null;
    }
    // ComfySwitchNode ("If/Else Switch", on_false/on_true/switch) — Ernie Imageのプロンプト強化
    // トグルなどで使われる。片方(TextGenerateなどLLMノード)は静的解決不能なため両方試し、
    // リテラルへ解決できた方を採用する。
    if (ct === "ComfySwitchNode") {
        for (const key of ["on_false", "on_true"]) {
            const v = src.inputs?.[key];
            if (Array.isArray(v)) {
                const text = resolveLinkedText(wf, v[0], v[1] ?? 0, depth + 1);
                if (text) return text;
            } else if (typeof v === "string" && v) {
                return v;
            }
        }
        return null;
    }
    // 汎用テキストキー（"value" は PrimitiveString/PrimitiveStringMultiline、"source" は
    // PreviewAny の値タップ中継、"string_a" は StringConcatenate の主オペランド — いずれも
    // Krea-2のプロンプト強化配線で使われる中継ノード）
    const keys = slot === 0
        ? ["text_positive", "text", "text_g", "prompt", "value", "source", "string_a"]
        : ["text_negative", "text_l", "source", "string_a"];
    for (const k of keys) {
        const v = src.inputs?.[k];
        if (typeof v === "string" && v) return v;
        if (Array.isArray(v)) {
            const text = resolveLinkedText(wf, v[0], v[1] ?? 0, depth + 1);
            if (text) return text;
        }
    }
    return null;
}

function extractPromptsAPI(wf) {
    const metaNodes = Object.values(wf).filter(n => n?.class_type === "ImageMetadataPromptLoader");
    if (metaNodes.length > 0) {
        const pos = new Set(), neg = new Set();
        for (const n of metaNodes) { if (n.inputs?.positive_text) pos.add(n.inputs.positive_text); if (n.inputs?.negative_text) neg.add(n.inputs.negative_text); }
        if (pos.size > 0 || neg.size > 0) return { positives: [...pos], negatives: [...neg] };
    }
    const textMap = new Map();
    for (const [id, n] of Object.entries(wf)) {
        if (!n) continue;
        const ct = n.class_type ?? "";
        if (ct === "CLIPTextEncodeEditPlus") {
            const resolveField = (key) => {
                const v = n.inputs?.[key];
                if (typeof v === "string") return v;
                if (Array.isArray(v)) return resolveLinkedText(wf, v[0], v[1] ?? 0);
                return null;
            };
            const combined = resolveEditPlusText(n.inputs?.mode, n.inputs?.text_edit, resolveField("text1"), resolveField("text2"));
            if (combined) textMap.set(id, combined);
            continue;
        }
        // MiniMaxH3ImageToVideo等の動画生成オールインワンノード。CLIPTextEncode等を経由せず
        // 自ノードの"prompt"入力に直接テキストを持つ(positive/negativeの区別も無い)ため、
        // isTextEncoderNode判定を通さずtextMapへ直接投入する(fallbackのtextsに載る)。
        if (typeof n.inputs?.prompt === "string" && /ImageToVideo|TextToVideo/i.test(ct)) {
            textMap.set(id, n.inputs.prompt);
            continue;
        }
        if (!isTextEncoderNode(ct)) continue;
        // "prompt" — TextEncodeQwenImageEdit(Plus)/TextEncodeBooguEdit and similar Image Edit
        // model text encoders use this key instead of "text"/"text_g".
        const raw = n.inputs?.text ?? n.inputs?.text_g ?? n.inputs?.prompt ?? null;
        if (raw && typeof raw === "string") {
            textMap.set(id, raw);
        } else if (Array.isArray(raw)) {
            // リンク参照 [srcNodeId, slot] → 解決
            const text = resolveLinkedText(wf, raw[0], raw[1] ?? 0);
            if (text) textMap.set(id, text);
        }
    }
    const pos = new Set(), neg = new Set();
    let foundSampler = false;
    for (const n of Object.values(wf)) {
        if (!n || !isSamplerNode(n.class_type ?? "")) continue;
        foundSampler = true;
        // SamplerCustomAdvanced doesn't hold positive/negative directly — it drives a separate
        // Guider node (CFGGuider/DualCFGGuider/BasicGuider) via its "guider" input. Scan that
        // node's inputs instead so the loop below can find the positive/negative-role keys.
        let inputsToScan = n.inputs ?? {};
        let viaBasicGuider = false;
        if (Array.isArray(n.inputs?.guider)) {
            const guiderNode = wf[String(n.inputs.guider[0])];
            if (guiderNode?.inputs) inputsToScan = guiderNode.inputs;
            viaBasicGuider = guiderNode?.class_type === "BasicGuider";
        }
        for (const [key, val] of Object.entries(inputsToScan)) {
            if (!Array.isArray(val)) continue;
            // DualCFGGuider (HiDream E1): cond1 carries the positive-derived conditioning.
            // BasicGuider (Flux/Ming Image etc., no negative): its single "conditioning" input is positive.
            const isPos = key === "positive" || key === "cond1" || key.startsWith("positive")
                || (viaBasicGuider && key === "conditioning");
            const isNeg = key === "negative" || key.startsWith("negative");
            if (!isPos && !isNeg) continue;
            // TextEncodeMageFlowEdit / TextEncodeBooguEdit — one node carries both prompt &
            // negative_prompt directly, so textMap (single text per node) can't represent both
            // roles.
            const srcNode = wf[String(val[0])];
            if (srcNode?.class_type === "TextEncodeMageFlowEdit" || srcNode?.class_type === "TextEncodeBooguEdit") {
                const text = isPos ? srcNode.inputs?.prompt : srcNode.inputs?.negative_prompt;
                if (text && typeof text === "string") { if (isPos) pos.add(text); else neg.add(text); }
                continue;
            }
            // InstructPixToPixConditioning (HiDream E1): forwards the actual text-encoder
            // conditioning through its own positive/negative inputs — follow one more hop.
            const resolvedId = srcNode?.class_type === "InstructPixToPixConditioning" && Array.isArray(srcNode.inputs?.[isPos ? "positive" : "negative"])
                ? String(srcNode.inputs[isPos ? "positive" : "negative"][0])
                : String(val[0]);
            const text = textMap.get(resolvedId);
            if (!text) continue;
            if (isPos) pos.add(text); else neg.add(text);
        }
    }
    if (!foundSampler || (pos.size === 0 && neg.size === 0)) { const all = [...textMap.values()].filter(t => t && t.trim()); return { positives: [], negatives: [], texts: all }; }
    return { positives: [...pos], negatives: [...neg] };
}

function extractPromptsLiteGraph(wf) {
    const { nodes, links } = wf;
    if (!Array.isArray(nodes)) return { positives: [], negatives: [] };

    // 1. ImageMetadataPromptLoader (WFS専用)
    const metaNodes = nodes.filter(n => n.type === "ImageMetadataPromptLoader");
    if (metaNodes.length > 0) {
        const pos = new Set(), neg = new Set();
        for (const n of metaNodes) { const p = n.widgets_values?.[2], ng = n.widgets_values?.[3]; if (p) pos.add(p); if (ng) neg.add(ng); }
        if (pos.size > 0 || neg.size > 0) return { positives: [...pos], negatives: [...neg] };
    }

    // 2. WFS_PromptText (WFS専用)
    const wfsNodes = nodes.filter(n => n.type === "WFS_PromptText");
    if (wfsNodes.length > 0) {
        const pos = new Set(), neg = new Set();
        for (const n of wfsNodes) { const p = n.widgets_values?.[0], ng = n.widgets_values?.[1]; if (p) pos.add(p); if (ng) neg.add(ng); }
        if (pos.size > 0 || neg.size > 0) return { positives: [...pos], negatives: [...neg] };
    }

    // 3. トップレベルの CLIPTextEncode + KSampler
    const topResult = extractPromptsFromNodeSet(nodes, links ?? []);
    if (topResult) return topResult;

    // 4. PrimitiveStringMultiline（flux2-klein / ernie など）- サブグラフ内も探す
    const primTexts = [];
    for (const n of collectAllNodes(wf)) {
        if (n.type !== "PrimitiveStringMultiline") continue;
        const t = Array.isArray(n.widgets_values) ? n.widgets_values[0] : n.widgets_values;
        if (t && typeof t === "string" && t.trim()) primTexts.push(t.trim());
    }
    if (primTexts.length > 0) return { positives: [], negatives: [], texts: primTexts };

    // 5. サブグラフ内の CLIPTextEncode + KSampler（z-image / qwen / flux など）
    for (const sg of wf.definitions?.subgraphs ?? []) {
        if (!Array.isArray(sg.nodes)) continue;
        const sgResult = extractPromptsFromNodeSet(sg.nodes, sg.links ?? []);
        if (sgResult) return sgResult;
    }

    // 6. PromptStyler フォールバック
    const stylerPos = new Set(), stylerNeg = new Set();
    for (const n of nodes) {
        if (!isPromptStylerNode(n.type ?? "")) continue;
        const vals = n.widgets_values ?? [];
        for (let i = 0; i < vals.length; i++) {
            if (typeof vals[i] !== "string" || !vals[i].trim()) continue;
            if (i % 2 === 0) stylerPos.add(vals[i]);
            else stylerNeg.add(vals[i]);
        }
    }
    if (stylerPos.size > 0 || stylerNeg.size > 0) return { positives: [...stylerPos], negatives: [...stylerNeg] };

    // 7. テキストエンコーダー全テキスト（最終フォールバック）- サブグラフも含む・判別不能
    const all = [];
    for (const n of collectAllNodes(wf)) {
        if (!isTextEncoderNode(n.type ?? "")) continue;
        const t = n.widgets_values?.[0];
        if (t && typeof t === "string" && t.trim()) all.push(t);
    }
    return { positives: [], negatives: [], texts: all };
}

// ── SD/Fooocus prompt extraction ──────────────────────────────
function parseSDAParameters(raw) {
    const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const stepsMatch = text.match(/\nSteps:\s+\d/);
    if (!stepsMatch) return null;
    const paramsStart = stepsMatch.index + 1;
    const promptSection = text.slice(0, paramsStart - 1);
    const paramsLine = text.slice(paramsStart);
    const negSep = "\nNegative prompt: ";
    const negIdx = promptSection.indexOf(negSep);
    let positive = "", negative = "";
    if (negIdx !== -1) { positive = promptSection.slice(0, negIdx).trim(); negative = promptSection.slice(negIdx + negSep.length).trim(); }
    else positive = promptSection.trim();
    const params = {};
    const re = /,?\s*([A-Za-z][A-Za-z0-9 ]*):\s*("(?:[^"\\]|\\.)*"|[^,]+)/g;
    let m;
    while ((m = re.exec(paramsLine)) !== null) params[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
    return { positive, negative, params };
}
function parseFooocusMetadata(raw) {
    let obj; try { obj = JSON.parse(raw); } catch { return null; }
    if (!obj?.base_model) return null;
    const toArray = v => !v ? [] : Array.isArray(v) ? v.filter(Boolean) : [String(v)];
    return { checkpoint: obj.base_model, vae: (obj.vae && obj.vae !== "Default") ? obj.vae : null, positives: toArray(obj.full_prompt ?? obj.prompt), negatives: toArray(obj.full_negative_prompt ?? obj.negative_prompt) };
}

// ── Master extractAllMetadata ─────────────────────────────────
export async function extractAllMetadata(file) {
    const name = file.name.toLowerCase();
    const isJSON = file.type === "application/json" || name.endsWith(".json");
    const isWebP = file.type === "image/webp" || name.endsWith(".webp");
    const isMP4 = file.type === "video/mp4" || name.endsWith(".mp4");

    async function fromWorkflow(originalWf, source) {
        let wf = originalWf;
        let apiWf = Array.isArray(wf?.nodes) ? null : wf;
        // サブグラフを持つワークフローは、外側のサブグラフノードに実際に設定された値
        // (ユーザーが見ている値)が内部ノードのwidgets_valuesへ反映されていないことがある
        // (テンプレートの古いデフォルト値のまま)。convertUiToApi() はこの注入も含めて
        // 正しく解決するため、そちらを経由してから抽出する。通常のワークフローには影響しない。
        if (Array.isArray(wf?.nodes)) {
            try {
                const converted = await comfyWorkflow.convertUiToApi(wf);
                if (converted && Object.keys(converted).length > 0) {
                    apiWf = converted;
                    if (wf.definitions?.subgraphs?.length > 0) wf = converted;
                }
            } catch { /* 変換失敗時は元のUI形式のまま抽出（既存ロジックにフォールバック） */ }
        }
        const base = { source, checkpoints: extractCheckpoints(wf), vaes: extractVAEs(wf), diffusionModels: extractDiffusionModels(wf), textEncoders: extractTextEncoders(wf), loras: extractLoRAs(wf), samplerSettings: extractSamplerSettings(apiWf), ...extractPrompts(wf) };
        // MarkdownNote からモデル情報を補完（subgraph形式の flux/qwen/z-image など）。
        // API変換後は nodes 情報が失われるため、常に元のUI形式ワークフローから抽出する。
        const mdm = extractMarkdownNoteModels(originalWf);
        if (mdm) {
            if (!base.checkpoints.length) base.checkpoints = mdm.checkpoints;
            if (!base.vaes.length) base.vaes = mdm.vaes;
            if (!base.diffusionModels.length) base.diffusionModels = mdm.diffusionModels;
            if (!base.textEncoders.length) base.textEncoders = mdm.textEncoders;
            if (!base.loras.length) base.loras = mdm.loras;
        }
        return base;
    }

    if (isJSON) {
        let wf; try { wf = JSON.parse(sanitizeJSON(await file.text())); } catch { return null; }
        return wf ? await fromWorkflow(wf, "comfyui") : null;
    }
    if (isWebP) {
        const exif = await readWebPEXIFChunk(file);
        if (!exif) return null;
        const wf = extractWorkflowFromEXIF(exif);
        return wf ? await fromWorkflow(wf, "comfyui") : null;
    }
    if (isMP4) {
        let tags; try { tags = await readMP4MetaTags(file); } catch { return null; }
        if (!tags) return null;
        for (const key of ["prompt", "workflow"]) {
            const raw = tags[key];
            if (!raw) continue;
            let wf; try { wf = JSON.parse(sanitizeJSON(raw)); } catch { continue; }
            if (wf) return await fromWorkflow(wf, "comfyui");
        }
        return null;
    }
    // PNG
    const chunks = await readAllPNGTextChunks(file);
    if (!chunks) return null;

    if (chunks.prompt) { let wf; try { wf = JSON.parse(sanitizeJSON(chunks.prompt)); } catch { return null; } return wf ? await fromWorkflow(wf, "comfyui") : null; }
    if (chunks.workflow) { let wf; try { wf = JSON.parse(sanitizeJSON(chunks.workflow)); } catch { return null; } return wf ? await fromWorkflow(wf, "comfyui") : null; }

    if (chunks.fooocus_scheme === "fooocus" && chunks.parameters) {
        const f = parseFooocusMetadata(chunks.parameters);
        if (!f) return null;
        return { source: "fooocus", checkpoints: [f.checkpoint], vaes: f.vae ? [f.vae] : [], diffusionModels: [], textEncoders: [], loras: [], positives: f.positives, negatives: f.negatives };
    }
    if (chunks.parameters) {
        const p = parseSDAParameters(chunks.parameters);
        if (!p) return null;
        const { positive, negative, params } = p;
        const modelName = params["Model"];
        if (!modelName) return null;
        if (params["Module 2"] != null) {
            const textEncoders = [];
            for (let i = 2; i <= 9; i++) { const mod = params[`Module ${i}`]; if (!mod) break; textEncoders.push(mod); }
            return { source: "sd_forge", checkpoints: [], vaes: params["Module 1"] ? [params["Module 1"]] : [], diffusionModels: [modelName], textEncoders, loras: [], positives: positive ? [positive] : [], negatives: negative ? [negative] : [] };
        }
        const vaeValue = params["Module 1"] ?? params["VAE"] ?? null;
        return { source: "sd", checkpoints: [modelName], vaes: vaeValue ? [vaeValue] : [], diffusionModels: [], textEncoders: [], loras: [], positives: positive ? [positive] : [], negatives: negative ? [negative] : [] };
    }
    return null;
}

// ── UI helpers ────────────────────────────────────────────────

function buildModelItem(label) {
    const el = document.createElement("div");
    el.className = "wfm-meta-item";
    el.title = label;
    el.innerHTML = `<span class="wfm-meta-item-name">${escapeHtml(label)}</span>`;
    return el;
}

function buildLoRAItem(lora) {
    const el = document.createElement("div");
    el.className = "wfm-meta-item";
    el.title = lora.name;
    const sm = lora.strength_model.toFixed(2);
    const sc = lora.strength_clip.toFixed(2);
    el.innerHTML = `<span class="wfm-meta-item-name">${escapeHtml(lora.name)}</span><span class="wfm-meta-item-badge">${sm}/${sc}</span>`;
    return el;
}

export function buildPromptItem(label, type, full, fullArea, fullLabel, listEl) {
    const el = document.createElement("div");
    el.className = "wfm-meta-item wfm-meta-item-clickable";
    const snippet = label.length > 60 ? label.slice(0, 60) + "…" : label;
    const typeBadge = type === "positive" ? `<span class="wfm-meta-badge-pos">POS</span>`
        : type === "negative" ? `<span class="wfm-meta-badge-neg">NEG</span>`
        : ``;
    el.innerHTML = `${typeBadge}<span class="wfm-meta-item-name">${escapeHtml(snippet)}</span>`;
    el.addEventListener("click", () => {
        listEl.querySelectorAll(".wfm-meta-item-clickable").forEach(e => e.classList.remove("selected"));
        el.classList.add("selected");
        fullArea.value = full;
        fullLabel.textContent = type === "positive" ? t("metaPromptPositive")
            : type === "negative" ? t("metaPromptNegative")
            : t("metaPromptText") || "Text";
    });
    return el;
}

function renderSection(sectionEl, listEl, items, buildFn) {
    listEl.innerHTML = "";
    if (items.length === 0) { sectionEl.classList.add("wfm-meta-section-empty"); return; }
    sectionEl.classList.remove("wfm-meta-section-empty");
    for (const item of items) listEl.appendChild(buildFn(item));
}

// ── External API ──────────────────────────────────────────────
let _externalHandleFile = null;

// path: Gallery上のサーバーファイルパス(任意)。渡された場合、/wfm/gallery/image/meta から
// 幅・高さやnanobanana履歴(cc_nanobananaフォルダの画像のみ)を補って表示する。
export async function loadFileIntoMetadataTab(file, path) {
    document.querySelector('.wfm-tab[data-tab="gallery"]')?.click();
    document.querySelector('.wfm-gallery-subtab-btn[data-gallery-subtab="metadata"]')?.click();
    await new Promise(r => setTimeout(r, 0));
    if (_externalHandleFile) await _externalHandleFile(file, path);
}

// ── Tab initialization ────────────────────────────────────────
export function initMetadataTab() {
    const dropZone = document.getElementById("wfm-meta-drop");
    const dropLabel = document.getElementById("wfm-meta-drop-label");
    const previewImg = document.getElementById("wfm-meta-preview-img");
    const fileInfo = document.getElementById("wfm-meta-file-info");
    const fileInput = document.getElementById("wfm-meta-file-input");

    const ckptSection = document.getElementById("wfm-meta-ckpt-section");
    const vaeSection = document.getElementById("wfm-meta-vae-section");
    const diffSection = document.getElementById("wfm-meta-diff-section");
    const teSection = document.getElementById("wfm-meta-te-section");
    const loraSection = document.getElementById("wfm-meta-lora-section");
    const promptSection = document.getElementById("wfm-meta-prompt-section");

    const ckptList = document.getElementById("wfm-meta-ckpt-list");
    const vaeList = document.getElementById("wfm-meta-vae-list");
    const diffList = document.getElementById("wfm-meta-diff-list");
    const teList = document.getElementById("wfm-meta-te-list");
    const loraList = document.getElementById("wfm-meta-lora-list");
    const promptList = document.getElementById("wfm-meta-prompt-list");
    const promptFull = document.getElementById("wfm-meta-prompt-full");
    const promptFullLabel = document.getElementById("wfm-meta-prompt-full-label");

    // Settings (画像サイズ・KSampler設定値) / Nanobanana履歴
    const settingsSection = document.getElementById("wfm-meta-settings-section");
    const setSize = document.getElementById("wfm-meta-set-size");
    const setSeed = document.getElementById("wfm-meta-set-seed");
    const setSteps = document.getElementById("wfm-meta-set-steps");
    const setCfg = document.getElementById("wfm-meta-set-cfg");
    const setSampler = document.getElementById("wfm-meta-set-sampler");
    const setScheduler = document.getElementById("wfm-meta-set-scheduler");
    const setDenoise = document.getElementById("wfm-meta-set-denoise");

    const nbSection = document.getElementById("wfm-meta-nb-section");
    const nbEngine = document.getElementById("wfm-meta-nb-engine");
    const nbModel = document.getElementById("wfm-meta-nb-model");
    const nbSize = document.getElementById("wfm-meta-nb-size");
    const nbSeed = document.getElementById("wfm-meta-nb-seed");
    const nbTimestamp = document.getElementById("wfm-meta-nb-timestamp");
    const nbPrompt = document.getElementById("wfm-meta-nb-prompt");
    const nbNegSection = document.getElementById("wfm-meta-nb-negative-section");
    const nbNegative = document.getElementById("wfm-meta-nb-negative");

    if (!dropZone) return;

    // Apply i18n to section titles
    const titleMap = {
        "wfm-meta-ckpt-section": "metaSectionCkpt",
        "wfm-meta-vae-section": "metaSectionVae",
        "wfm-meta-diff-section": "metaSectionDiff",
        "wfm-meta-te-section": "metaSectionTe",
        "wfm-meta-lora-section": "metaSectionLora",
        "wfm-meta-prompt-section": "metaSectionPrompt",
        "wfm-meta-settings-section": "metaSectionSettings",
        "wfm-meta-nb-section": "metaSectionNanobanana",
    };
    for (const [id, key] of Object.entries(titleMap)) {
        const title = document.querySelector(`#${id} .wfm-meta-section-title`);
        if (title) { const tx = t(key); if (tx && tx !== key) title.textContent = tx; }
    }

    // Apply i18n to format note
    const i18nIds = {
        "wfm-meta-format-note-title": "metaFormatNoteTitle",
        "wfm-meta-fmt-comfyui": "metaFmtComfyui",
        "wfm-meta-fmt-sdwebui": "metaFmtSdwebui",
        "wfm-meta-fmt-fooocus": "metaFmtFooocus",
        "wfm-meta-format-todo": "metaFormatTodo",
    };
    for (const [id, key] of Object.entries(i18nIds)) {
        const el = document.getElementById(id);
        if (el) { const tx = t(key); if (tx && tx !== key) el.textContent = tx; }
    }

    // Apply i18n to help card
    const helpIds = {
        "wfm-help-metadata-title": "helpMetadataTitle",
        "wfm-help-metadata-desc": "helpMetadataDesc",
        "wfm-help-metadata-1": "helpMetadata1",
        "wfm-help-metadata-2": "helpMetadata2",
        "wfm-help-metadata-3": "helpMetadata3",
        "wfm-help-metadata-4": "helpMetadata4",
        "wfm-help-metadata-5": "helpMetadata5",
        "wfm-help-metadata-6": "helpMetadata6",
        "wfm-help-metadata-7": "helpMetadata7",
    };
    for (const [id, key] of Object.entries(helpIds)) {
        const el = document.getElementById(id);
        if (el) { const tx = t(key); if (tx && tx !== key) el.textContent = tx; }
    }

    function clearAll() {
        [ckptList, vaeList, diffList, teList, loraList, promptList].forEach(l => { if (l) l.innerHTML = ""; });
        [ckptSection, vaeSection, diffSection, teSection, loraSection, promptSection].forEach(s => { if (s) s.classList.add("wfm-meta-section-empty"); });
        if (promptFull) promptFull.value = "";
        if (promptFullLabel) promptFullLabel.textContent = "";
        renderSettings(null, null);
        renderNanobanana(null);
    }

    // ── Settings (画像サイズ・KSampler設定) ─────────────────────
    function setRow(el, label, value) {
        if (!el) return;
        el.textContent = (value !== undefined && value !== null && value !== "") ? `${label}: ${value}` : "";
    }

    function renderSettings(samplerSettings, dims) {
        setRow(setSize, t("metaSettingsSize") || "Size", dims?.width && dims?.height ? `${dims.width}×${dims.height}` : "");
        const s = samplerSettings ?? {};
        setRow(setSeed, t("metaSettingsSeed") || "Seed", s.seed ?? s.noise_seed);
        setRow(setSteps, t("metaSettingsSteps") || "Steps", s.steps);
        setRow(setCfg, t("metaSettingsCfg") || "CFG", s.cfg);
        setRow(setSampler, t("metaSettingsSampler") || "Sampler", s.sampler_name);
        setRow(setScheduler, t("metaSettingsScheduler") || "Scheduler", s.scheduler);
        setRow(setDenoise, t("metaSettingsDenoise") || "Denoise", s.denoise);
        const hasAny = (dims?.width && dims?.height) || Object.keys(s).length > 0;
        if (settingsSection) settingsSection.style.display = hasAny ? "" : "none";
    }

    // ── Nanobanana履歴(cc_nanobananaフォルダの画像のみ、Galleryから開いた場合に表示) ──
    function renderNanobanana(entry) {
        if (!nbSection) return;
        if (!entry) {
            nbSection.style.display = "none";
            return;
        }
        nbSection.style.display = "";
        setRow(nbEngine, t("metaNbEngine") || "Engine", entry.engine);
        setRow(nbModel, t("metaNbModel") || "Model", entry.model);
        const size = entry.image_size || (entry.width && entry.height ? `${entry.width}×${entry.height}` : "");
        setRow(nbSize, t("metaNbSize") || "Size", size);
        setRow(nbSeed, t("metaNbSeed") || "Seed", entry.seed != null ? String(entry.seed) : "");
        setRow(nbTimestamp, t("metaNbTimestamp") || "Date", entry.timestamp);
        if (nbPrompt) nbPrompt.value = entry.prompt || "";
        if (nbNegSection && nbNegative) {
            if (entry.negative_prompt) { nbNegative.value = entry.negative_prompt; nbNegSection.style.display = ""; }
            else { nbNegative.value = ""; nbNegSection.style.display = "none"; }
        }
    }

    // path指定時、サーバーの /wfm/gallery/image/meta から幅・高さとnanobanana履歴を取得する
    // (Galleryタブから「Metadata」ボタンで開いた場合のみ渡される。ドラッグ&ドロップされた
    // 任意ファイルはブラウザ上のFileオブジェクトのみでサーバーパスを持たないため対象外)。
    async function fetchServerMeta(path) {
        if (!path) return null;
        try {
            const res = await fetch(`/wfm/gallery/image/meta?path=${encodeURIComponent(path)}`);
            if (!res.ok) return null;
            const json = await res.json();
            return json.error ? null : json;
        } catch {
            return null;
        }
    }

    async function handleFile(file, path) {
        if (!file) return;
        if (file.size > MAX_FILE_SIZE) {
            fileInfo.textContent = t("metaFileTooLarge");
            fileInfo.style.color = "var(--wfm-warning)";
            return;
        }

        fileInfo.textContent = t("metaParsing");
        fileInfo.style.color = "var(--wfm-text-secondary)";
        clearAll();

        const serverMeta = await fetchServerMeta(path);

        // Show preview for images
        const isImage = file.type.startsWith("image/") || file.name.toLowerCase().match(/\.(png|webp|jpg|jpeg)$/);
        let naturalDims = null;
        if (isImage) {
            const url = URL.createObjectURL(file);
            previewImg.src = url;
            previewImg.style.display = "block";
            dropLabel.style.display = "none";
            await new Promise(resolve => {
                previewImg.onload = () => {
                    naturalDims = { width: previewImg.naturalWidth, height: previewImg.naturalHeight };
                    URL.revokeObjectURL(url);
                    resolve();
                };
                previewImg.onerror = resolve;
            });
        } else {
            previewImg.style.display = "none";
            dropLabel.style.display = "flex";
        }

        const dims = (serverMeta?.width && serverMeta?.height) ? serverMeta : naturalDims;
        renderNanobanana(serverMeta?.nanobanana ?? null);

        let meta;
        try {
            meta = await extractAllMetadata(file);
        } catch (err) {
            console.error("[MetadataTab]", err);
            fileInfo.textContent = t("metaParseError");
            fileInfo.style.color = "var(--wfm-danger)";
            renderSettings(null, dims);
            return;
        }

        if (!meta) {
            // nanobanana(Gemini API経由)の画像はComfyUIワークフローを埋め込んでいないため
            // extractAllMetadataはnullを返す。その場合でもnanobanana履歴があれば
            // 「メタデータ無し」エラーにせず、画像サイズのみSettingsに表示する。
            if (serverMeta?.nanobanana) {
                const sizeKB = (file.size / 1024).toFixed(1);
                fileInfo.textContent = `${file.name}  (${sizeKB} KB · Nanobanana)`;
                fileInfo.style.color = "var(--wfm-text-secondary)";
            } else {
                fileInfo.textContent = t("metaNoMetadata");
                fileInfo.style.color = "var(--wfm-warning)";
            }
            renderSettings(null, dims);
            return;
        }

        const sizeKB = (file.size / 1024).toFixed(1);
        const sourceLabel = { comfyui: "ComfyUI", sd: "SD WebUI", sd_forge: "SD Forge", fooocus: "Fooocus" }[meta.source] ?? meta.source;
        fileInfo.textContent = `${file.name}  (${sizeKB} KB · ${sourceLabel})`;
        fileInfo.style.color = "var(--wfm-text-secondary)";

        renderSection(ckptSection, ckptList, meta.checkpoints, n => buildModelItem(n));
        renderSection(vaeSection, vaeList, meta.vaes, n => buildModelItem(n));
        renderSection(diffSection, diffList, meta.diffusionModels, n => buildModelItem(n));
        renderSection(teSection, teList, meta.textEncoders, n => buildModelItem(n));
        renderSection(loraSection, loraList, meta.loras, l => buildLoRAItem(l));
        renderSettings(meta.samplerSettings, dims);

        // Prompts
        promptList.innerHTML = "";
        const allPrompts = [
            ...meta.positives.map(p => ({ type: "positive", text: p })),
            ...meta.negatives.map(p => ({ type: "negative", text: p })),
            ...(meta.texts ?? []).map(p => ({ type: "text", text: p })),
        ];
        if (allPrompts.length > 0) {
            promptSection.classList.remove("wfm-meta-section-empty");
            for (const { type, text } of allPrompts) {
                promptList.appendChild(buildPromptItem(text, type, text, promptFull, promptFullLabel, promptList));
            }
            // Auto-select first positive
            const firstPositive = promptList.querySelector(".wfm-meta-item-clickable");
            if (firstPositive) firstPositive.click();
        } else {
            promptSection.classList.add("wfm-meta-section-empty");
        }
    }

    // ── Prompt action buttons ─────────────────────────────────
    function getPromptText() { return promptFull?.value ?? ""; }

    function flashBtn(btn) {
        btn.classList.add("wfm-meta-btn-flash");
        setTimeout(() => btn.classList.remove("wfm-meta-btn-flash"), 600);
    }

    function setTextareaValue(id, text) {
        const el = document.getElementById(id);
        if (!el) return false;
        el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    }

    document.getElementById("wfm-meta-copy-btn")?.addEventListener("click", function () {
        const text = getPromptText();
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => flashBtn(this));
    });

    document.getElementById("wfm-meta-genui-pos-btn")?.addEventListener("click", function () {
        const text = getPromptText();
        if (!text) return;
        if (setTextareaValue("wfm-prompt-pos-text", text)) flashBtn(this);
    });

    document.getElementById("wfm-meta-genui-neg-btn")?.addEventListener("click", function () {
        const text = getPromptText();
        if (!text) return;
        if (setTextareaValue("wfm-prompt-neg-text", text)) flashBtn(this);
    });

    document.getElementById("wfm-meta-preset-pos-btn")?.addEventListener("click", function () {
        const text = getPromptText();
        if (!text) return;
        if (setTextareaValue("wfm-preset-pos", text)) flashBtn(this);
    });

    document.getElementById("wfm-meta-preset-neg-btn")?.addEventListener("click", function () {
        const text = getPromptText();
        if (!text) return;
        if (setTextareaValue("wfm-preset-neg", text)) flashBtn(this);
    });

    _externalHandleFile = handleFile;

    // Drag & Drop
    dropZone.addEventListener("dragover", e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add("drag-over"); });
    dropZone.addEventListener("dragleave", e => { e.stopPropagation(); dropZone.classList.remove("drag-over"); });
    dropZone.addEventListener("drop", e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove("drag-over"); handleFile(e.dataTransfer.files?.[0]); });
    dropZone.addEventListener("click", e => { if (e.target === previewImg) return; fileInput.click(); });
    fileInput.addEventListener("change", () => { handleFile(fileInput.files?.[0]); fileInput.value = ""; });

    // Prevent scroll passthrough in lists
    [ckptList, vaeList, diffList, teList, loraList, promptList].forEach(l => {
        if (l) l.addEventListener("wheel", e => e.stopPropagation(), { passive: true });
    });

    clearAll();
}

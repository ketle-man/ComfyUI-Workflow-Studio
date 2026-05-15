/**
 * Metadata Tab
 * Drop a PNG/WebP/JSON file to extract and display model/prompt metadata.
 * Parsing logic adapted from model-and-prompt-from-metadata (workflow_utils.js).
 */

import { t } from "./i18n.js";

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
async function readAllPNGTextChunks(file) {
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
    if (Array.isArray(wf.nodes)) return collectUnique(wf.nodes.filter(n => n.type?.toLowerCase().includes("checkpoint") || META_NODE_TYPES.has(n.type)).map(n => n.widgets_values?.[0]));
    return collectUnique(Object.values(wf).filter(n => n?.class_type?.toLowerCase().includes("checkpoint") || META_NODE_TYPES.has(n?.class_type)).map(n => n.inputs?.ckpt_name));
}
function extractVAEs(wf) {
    if (!wf || typeof wf !== "object") return [];
    if (Array.isArray(wf.nodes)) return collectUnique(wf.nodes.flatMap(n => { if (n.type === "VAELoader") return [n.widgets_values?.[0]]; if (META_NODE_TYPES.has(n.type ?? "")) { const v = n.widgets_values?.[1]; return v && v !== VAE_NONE ? [v] : []; } return []; }));
    return collectUnique(Object.values(wf).flatMap(n => { if (!n || typeof n !== "object") return []; if (n.class_type === "VAELoader") return [n.inputs?.vae_name]; if (META_NODE_TYPES.has(n.class_type ?? "")) { const v = n.inputs?.vae_name; return v && v !== VAE_NONE ? [v] : []; } return []; }));
}
function extractDiffusionModels(wf) {
    if (!wf || typeof wf !== "object") return [];
    if (Array.isArray(wf.nodes)) return collectUnique(collectAllNodes(wf).filter(n => n.type === "UNETLoader").map(n => n.widgets_values?.[0]));
    return collectUnique(Object.values(wf).filter(n => n?.class_type === "UNETLoader").map(n => n.inputs?.unet_name));
}
function extractTextEncoders(wf) {
    if (!wf || typeof wf !== "object") return [];
    const names = [];
    if (Array.isArray(wf.nodes)) {
        for (const n of collectAllNodes(wf)) {
            if (n.type === "CLIPLoader") { if (n.widgets_values?.[0]) names.push(n.widgets_values[0]); }
            else if (n.type === "DualCLIPLoader") { [0,1].forEach(i => { if (n.widgets_values?.[i]) names.push(n.widgets_values[i]); }); }
            else if (n.type === "TripleCLIPLoader") { [0,1,2].forEach(i => { if (n.widgets_values?.[i]) names.push(n.widgets_values[i]); }); }
        }
    } else {
        for (const n of Object.values(wf)) {
            if (!n || typeof n !== "object") continue;
            const ct = n.class_type ?? "";
            if (ct === "CLIPLoader") { if (n.inputs?.clip_name) names.push(n.inputs.clip_name); }
            else if (ct === "DualCLIPLoader") { if (n.inputs?.clip_name1) names.push(n.inputs.clip_name1); if (n.inputs?.clip_name2) names.push(n.inputs.clip_name2); }
            else if (ct === "TripleCLIPLoader") { ["clip_name1","clip_name2","clip_name3"].forEach(k => { if (n.inputs?.[k]) names.push(n.inputs[k]); }); }
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
        results.push({ name, strength_model: typeof sm === "number" ? sm : 1.0, strength_clip: typeof sc === "number" ? sc : 1.0 });
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
        }
    }
    return results;
}

function isTextEncoderNode(ct) { return ct === "CLIPTextEncode" || ct.includes("TextEncode") || ct.includes("TextEncoderSD"); }
function isSamplerNode(ct) { return ct === "KSampler" || ct === "KSamplerAdvanced" || ct.includes("KSampler") || ct.includes("Sampler"); }
function isPromptStylerNode(ct) { return ct.includes("PromptStyler"); }

function extractPrompts(wf) {
    if (!wf || typeof wf !== "object") return { positives: [], negatives: [] };
    return Array.isArray(wf.nodes) ? extractPromptsLiteGraph(wf) : extractPromptsAPI(wf);
}

// API形式: リンク参照 [srcNodeId, slot] からテキストを解決
function resolveLinkedText(wf, srcId, slot) {
    const src = wf[String(srcId)];
    if (!src || typeof src !== "object") return null;
    const ct = src.class_type ?? "";
    // PromptStyler系: slot 0 = text_positive, slot 1 = text_negative
    if (isPromptStylerNode(ct)) {
        const v = slot === 0 ? src.inputs?.text_positive : src.inputs?.text_negative;
        return (v && typeof v === "string") ? v : null;
    }
    // 汎用テキストキー
    const keys = slot === 0
        ? ["text_positive", "text", "text_g", "prompt"]
        : ["text_negative", "text_l"];
    for (const k of keys) {
        const v = src.inputs?.[k];
        if (v && typeof v === "string") return v;
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
        if (!n || !isTextEncoderNode(n.class_type ?? "")) continue;
        const raw = n.inputs?.text ?? n.inputs?.text_g ?? null;
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
        for (const [key, val] of Object.entries(n.inputs ?? {})) {
            if (!Array.isArray(val)) continue;
            const text = textMap.get(String(val[0]));
            if (!text) continue;
            if (key === "positive" || key.startsWith("positive")) pos.add(text);
            else if (key === "negative" || key.startsWith("negative")) neg.add(text);
        }
    }
    if (!foundSampler || (pos.size === 0 && neg.size === 0)) { const all = [...textMap.values()]; return { positives: all, negatives: all }; }
    return { positives: [...pos], negatives: [...neg] };
}

function extractPromptsLiteGraph(wf) {
    const { nodes, links } = wf;
    if (!Array.isArray(nodes)) return { positives: [], negatives: [] };
    const metaNodes = nodes.filter(n => n.type === "ImageMetadataPromptLoader");
    if (metaNodes.length > 0) {
        const pos = new Set(), neg = new Set();
        for (const n of metaNodes) { const p = n.widgets_values?.[2], ng = n.widgets_values?.[3]; if (p) pos.add(p); if (ng) neg.add(ng); }
        if (pos.size > 0 || neg.size > 0) return { positives: [...pos], negatives: [...neg] };
    }
    const wfsNodes = nodes.filter(n => n.type === "WFS_PromptText");
    if (wfsNodes.length > 0) {
        const pos = new Set(), neg = new Set();
        for (const n of wfsNodes) { const p = n.widgets_values?.[0], ng = n.widgets_values?.[1]; if (p) pos.add(p); if (ng) neg.add(ng); }
        if (pos.size > 0 || neg.size > 0) return { positives: [...pos], negatives: [...neg] };
    }

    const nodeMap = new Map(); for (const n of nodes) nodeMap.set(n.id, n);

    // links[]: [id, origin_id, origin_slot, dest_id, dest_slot, type]
    const linkOrigin = new Map(); // linkId → originNodeId
    const linkSlot = new Map();   // linkId → originSlot
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

    // CLIPTextEncode系ノードからテキストを収集
    // ・widgets_values[0] に直接入っている場合
    // ・inputs にリンクがある場合（PromptStyler → CLIPTextEncode）
    const textMap = new Map();
    for (const n of nodes) {
        if (!isTextEncoderNode(n.type ?? "")) continue;
        const text = n.widgets_values?.[0];
        if (text && typeof text === "string") {
            textMap.set(n.id, text);
        } else if (Array.isArray(n.inputs)) {
            // テキスト入力がリンクの場合 → リンク先ノードから解決
            const textInput = n.inputs.find(inp => inp.name === "text" || inp.name === "text_g");
            if (textInput?.link != null) {
                const originId = linkOrigin.get(textInput.link);
                const originSlot = linkSlot.get(textInput.link) ?? 0;
                const srcNode = originId != null ? nodeMap.get(originId) : null;
                if (srcNode) {
                    const srcType = srcNode.type ?? "";
                    if (isPromptStylerNode(srcType) || srcType === "WFS_PromptText") {
                        const v = srcNode.widgets_values?.[originSlot];
                        if (v && typeof v === "string") textMap.set(n.id, v);
                    }
                }
            }
        }
    }

    const pos = new Set(), neg = new Set();
    let foundSampler = false;
    for (const n of nodes) {
        if (!isSamplerNode(n.type ?? "") || !Array.isArray(n.inputs)) continue;
        foundSampler = true;
        for (const inp of n.inputs) {
            if (!inp || inp.link == null) continue;
            const originId = linkOrigin.get(inp.link);
            if (originId == null) continue;
            const text = textMap.get(originId);
            if (!text) continue;
            const name = inp.name ?? "";
            if (name === "positive" || name.startsWith("positive")) pos.add(text);
            else if (name === "negative" || name.startsWith("negative")) neg.add(text);
        }
    }

    // フォールバック: サンプラーが見つからないか両方空
    if (!foundSampler || (pos.size === 0 && neg.size === 0)) {
        // PromptStylerノードを直接スキャン
        const stylerPos = new Set(), stylerNeg = new Set();
        for (const n of nodes) {
            if (!isPromptStylerNode(n.type ?? "")) continue;
            // widgets_values からポジティブ/ネガティブを探す
            // 多くのPromptStylerはindex 0=positive, 1=negativeまたはスタイル文字列
            const vals = n.widgets_values ?? [];
            for (let i = 0; i < vals.length; i++) {
                if (typeof vals[i] !== "string" || !vals[i].trim()) continue;
                if (i % 2 === 0) stylerPos.add(vals[i]);
                else stylerNeg.add(vals[i]);
            }
        }
        if (stylerPos.size > 0 || stylerNeg.size > 0) {
            return { positives: [...stylerPos], negatives: [...stylerNeg] };
        }
        const all = [...textMap.values()];
        return { positives: all, negatives: all };
    }
    return { positives: [...pos], negatives: [...neg] };
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
async function extractAllMetadata(file) {
    const name = file.name.toLowerCase();
    const isJSON = file.type === "application/json" || name.endsWith(".json");
    const isWebP = file.type === "image/webp" || name.endsWith(".webp");

    function fromWorkflow(wf, source) {
        return { source, checkpoints: extractCheckpoints(wf), vaes: extractVAEs(wf), diffusionModels: extractDiffusionModels(wf), textEncoders: extractTextEncoders(wf), loras: extractLoRAs(wf), ...extractPrompts(wf) };
    }

    if (isJSON) {
        let wf; try { wf = JSON.parse(sanitizeJSON(await file.text())); } catch { return null; }
        return wf ? fromWorkflow(wf, "comfyui") : null;
    }
    if (isWebP) {
        const exif = await readWebPEXIFChunk(file);
        if (!exif) return null;
        const wf = extractWorkflowFromEXIF(exif);
        return wf ? fromWorkflow(wf, "comfyui") : null;
    }
    // PNG
    const chunks = await readAllPNGTextChunks(file);
    if (!chunks) return null;

    if (chunks.prompt) { let wf; try { wf = JSON.parse(sanitizeJSON(chunks.prompt)); } catch { return null; } return wf ? fromWorkflow(wf, "comfyui") : null; }
    if (chunks.workflow) { let wf; try { wf = JSON.parse(sanitizeJSON(chunks.workflow)); } catch { return null; } return wf ? fromWorkflow(wf, "comfyui") : null; }

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
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

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

function buildPromptItem(label, type, full, fullArea, fullLabel, listEl) {
    const el = document.createElement("div");
    el.className = "wfm-meta-item wfm-meta-item-clickable";
    const snippet = label.length > 60 ? label.slice(0, 60) + "…" : label;
    const typeBadge = type === "positive" ? `<span class="wfm-meta-badge-pos">POS</span>` : `<span class="wfm-meta-badge-neg">NEG</span>`;
    el.innerHTML = `${typeBadge}<span class="wfm-meta-item-name">${escapeHtml(snippet)}</span>`;
    el.addEventListener("click", () => {
        listEl.querySelectorAll(".wfm-meta-item-clickable").forEach(e => e.classList.remove("selected"));
        el.classList.add("selected");
        fullArea.value = full;
        fullLabel.textContent = type === "positive" ? t("metaPromptPositive") : t("metaPromptNegative");
    });
    return el;
}

function renderSection(sectionEl, listEl, items, buildFn) {
    listEl.innerHTML = "";
    if (items.length === 0) { sectionEl.classList.add("wfm-meta-section-empty"); return; }
    sectionEl.classList.remove("wfm-meta-section-empty");
    for (const item of items) listEl.appendChild(buildFn(item));
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

    if (!dropZone) return;

    // Apply i18n to section titles
    const titleMap = {
        "wfm-meta-ckpt-section": "metaSectionCkpt",
        "wfm-meta-vae-section": "metaSectionVae",
        "wfm-meta-diff-section": "metaSectionDiff",
        "wfm-meta-te-section": "metaSectionTe",
        "wfm-meta-lora-section": "metaSectionLora",
        "wfm-meta-prompt-section": "metaSectionPrompt",
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
    }

    async function handleFile(file) {
        if (!file) return;
        if (file.size > MAX_FILE_SIZE) {
            fileInfo.textContent = t("metaFileTooLarge");
            fileInfo.style.color = "var(--wfm-warning)";
            return;
        }

        fileInfo.textContent = t("metaParsing");
        fileInfo.style.color = "var(--wfm-text-secondary)";
        clearAll();

        // Show preview for images
        const isImage = file.type.startsWith("image/") || file.name.toLowerCase().match(/\.(png|webp|jpg|jpeg)$/);
        if (isImage) {
            const url = URL.createObjectURL(file);
            previewImg.src = url;
            previewImg.style.display = "block";
            dropLabel.style.display = "none";
            previewImg.onload = () => URL.revokeObjectURL(url);
        } else {
            previewImg.style.display = "none";
            dropLabel.style.display = "flex";
        }

        let meta;
        try {
            meta = await extractAllMetadata(file);
        } catch (err) {
            console.error("[MetadataTab]", err);
            fileInfo.textContent = t("metaParseError");
            fileInfo.style.color = "var(--wfm-danger)";
            return;
        }

        if (!meta) {
            fileInfo.textContent = t("metaNoMetadata");
            fileInfo.style.color = "var(--wfm-warning)";
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

        // Prompts
        promptList.innerHTML = "";
        const allPrompts = [
            ...meta.positives.map(p => ({ type: "positive", text: p })),
            ...meta.negatives.map(p => ({ type: "negative", text: p })),
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

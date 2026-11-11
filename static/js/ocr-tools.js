/**
 * ocr-tools.js — AI TOOL > TOOLS: OCR (text extraction) with Ollama OCR models.
 *
 * Ported from ComfyUI Comic Creator's OCR tab (static/js/ocr-core.js + main/29-ocr-tab.js),
 * keeping only the general-purpose part: read the text of one image, optionally with boxes.
 * What carried over from CC's measurements:
 * - Send a JPEG whose long side is <= 1600 px with transparent areas filled white.
 * - temperature 0; retry once on HTTP 500 (the runner can drop right after a model swap).
 * - LightOnOCR sometimes returns nothing or loops on dense images; a grayscale copy often works,
 *   so an empty / repetitive result is retried once in grayscale.
 * - Per-model prompts: PaddleOCR-VL "OCR:", GLM-OCR "Text Recognition:".
 *
 * Measured in WFS (2026-11-11, mixed JA/EN test page with a vertical column):
 *   LightOnOCR-3 4b  text-only 1.1 s / boxes 7.9 s, 100 %   PaddleOCR-VL-manga 3.9 s, 100 %
 *   unlimited-ocr (DeepSeek-OCR) 14 s, 100 %, always emits boxes
 *   PaddleOCR-VL 1.6 11 s and GLM-OCR 15 s missed the vertical column (94 %).
 * Hence LightOnOCR is preferred, and boxes are only requested when the user asks for them.
 */

export const SEND_MAX_SIDE = 1600;

// Preference order when picking the default OCR model from what Ollama has installed.
const MODEL_PREFERENCE = [/lighton/i, /paddleocr.*manga/i, /paddleocr/i, /deepseek.*ocr|unlimited-ocr/i, /glm-ocr/i, /ocr/i];

export const BOX_PROMPT = "Detect all text regions and output each as text with bounding box [x1,y1,x2,y2] normalized to 0-1000.";
const PLAIN_PROMPT = "Extract all text from this image.";

/** Installed Ollama models that look like OCR models, best first. */
export async function listOcrModels(baseUrl) {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const names = ((await res.json()).models || []).map((m) => m.name).filter((n) => /ocr/i.test(n));
    const rank = (n) => { const i = MODEL_PREFERENCE.findIndex((re) => re.test(n)); return i < 0 ? 99 : i; };
    return names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Can this model return text positions? (LightOnOCR on request, DeepSeek-OCR always) */
export function supportsBoxes(model) {
    return /lighton|unlimited-ocr|deepseek.*ocr/i.test(String(model || ""));
}

export function ocrPrompt(model, withBoxes) {
    const m = String(model || "");
    if (/lighton/i.test(m)) return withBoxes ? BOX_PROMPT : PLAIN_PROMPT;
    if (/paddle/i.test(m)) return "OCR:";
    if (/glm-ocr/i.test(m)) return "Text Recognition:";
    if (/unlimited-ocr|deepseek.*ocr/i.test(m)) return "Free OCR.";
    return PLAIN_PROMPT;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function makeBox(label, x1, y1, x2, y2, text) {
    const a = clamp01(Math.min(x1, x2)), b = clamp01(Math.min(y1, y2));
    const c = clamp01(Math.max(x1, x2)), d = clamp01(Math.max(y1, y2));
    if (c - a < 0.004 || d - b < 0.004) return null;
    return { label: label || "text", x1: a, y1: b, x2: c, y2: d, text: cleanLine(text) };
}

// Markdown decorations the OCR models add (headings, bold, rules)
function cleanLine(s) {
    return String(s || "")
        .replace(/^\s*#{1,6}\s*/gm, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, "")
        .trim();
}

/**
 * Boxes from either syntax (coordinates normalized 0-1000, x1,y1,x2,y2):
 *   LightOnOCR     `![label](x1,y1,x2,y2) text`
 *   DeepSeek-OCR   `label [x1, y1, x2, y2]text`   (one per line)
 * Returns [{ label, x1, y1, x2, y2, text }] with 0-1 coordinates.
 */
export function parseOcrBoxes(raw) {
    const s = String(raw || "");
    const out = [];
    const md = s.split(/(?=!\[[^\]]*\]\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))/);
    for (const chunk of md) {
        const m = chunk.match(/^!\[([^\]]*)\]\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)([\s\S]*)$/);
        if (!m) continue;
        const box = makeBox(m[1], +m[2] / 1000, +m[3] / 1000, +m[4] / 1000, +m[5] / 1000, m[6]);
        if (box) out.push(box);
    }
    if (out.length) return out;
    for (const line of s.split(/\r?\n/)) {
        const m = line.match(/^\s*([a-z_]+)?\s*\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]\s*(.*)$/i);
        if (!m) continue;
        const box = makeBox(m[1], +m[2] / 1000, +m[3] / 1000, +m[4] / 1000, +m[5] / 1000, m[6]);
        if (box) out.push(box);
    }
    return out;
}

/** Plain text of an OCR reply: box tokens and Markdown decorations removed, blank runs collapsed. */
export function ocrPlainText(raw, boxes = null) {
    const list = boxes || parseOcrBoxes(raw);
    if (list.length) return list.map((b) => b.text).filter(Boolean).join("\n");
    // Model special tokens (<|ref|> etc.) and Markdown decorations removed, line by line;
    // blank lines between paragraphs are kept but never more than one in a row.
    return String(raw || "").replace(/<\|[^|]*\|>/g, "")
        .split(/\r?\n/).map((l) => cleanLine(l))
        .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Empty, or the same line over and over (LightOnOCR's failure mode on dense images)
export function ocrLooksFailed(text) {
    const lines = String(text || "").split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return true;
    return lines.length >= 30 && new Set(lines).size / lines.length < 0.5;
}

// ---------------------------------------------------------------------------
// Image + model call
// ---------------------------------------------------------------------------

/** base64 image → JPEG base64 (long side <= maxSide, white background, optional grayscale). */
export async function prepareOcrImage(base64, mimeType, { maxSide = SEND_MAX_SIDE, gray = false } = {}) {
    const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("image load failed"));
        el.src = `data:${mimeType || "image/png"};base64,${base64}`;
    });
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(img.naturalWidth * k));
    cv.height = Math.max(1, Math.round(img.naturalHeight * k));
    const cx = cv.getContext("2d");
    cx.fillStyle = "#fff";
    cx.fillRect(0, 0, cv.width, cv.height);
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    if (gray) {
        const d = cx.getImageData(0, 0, cv.width, cv.height), p = d.data;
        for (let i = 0; i < p.length; i += 4) {
            const y = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000;
            p[i] = p[i + 1] = p[i + 2] = y;
        }
        cx.putImageData(d, 0, 0);
    }
    return cv.toDataURL("image/jpeg", 0.92).split(",")[1];
}

async function ollamaOcrChat(baseUrl, model, prompt, b64, retry = true) {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model, stream: false, think: false,
            messages: [{ role: "user", content: prompt, images: [b64] }],
            options: { temperature: 0, num_predict: 4096 },
        }),
    });
    if (res.status === 500 && retry) {
        await new Promise((r) => setTimeout(r, 800));
        return ollamaOcrChat(baseUrl, model, prompt, b64, false);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return (await res.json()).message?.content || "";
}

/**
 * Read one image. Returns { text, boxes, retriedGray, ms }.
 * withBoxes only takes effect for models that support positions (supportsBoxes).
 */
export async function runOcr({ baseUrl, model, base64, mimeType, withBoxes = false }) {
    const started = performance.now();
    const prompt = ocrPrompt(model, withBoxes && supportsBoxes(model));
    const read = async (gray) => {
        const raw = await ollamaOcrChat(baseUrl, model, prompt, await prepareOcrImage(base64, mimeType, { gray }));
        // Only boxes with text: the result shows one line per box, so box #n == line #n
        // (image regions without text would shift the numbering).
        const all = parseOcrBoxes(raw);
        const boxes = all.filter((b) => b.text);
        return { boxes, text: all.length ? boxes.map((b) => b.text).join("\n") : ocrPlainText(raw) };
    };
    let r = await read(false);
    let retriedGray = false;
    if (ocrLooksFailed(r.text)) {
        const g = await read(true);
        if (!ocrLooksFailed(g.text) || g.text.length > r.text.length) { r = g; retriedGray = true; }
    }
    return { ...r, retriedGray, ms: Math.round(performance.now() - started) };
}

/**
 * Draw boxes over an <img> shown with object-fit: contain inside `container`.
 * Each box gets a small numbered tag; clicking it calls onPick(index).
 */
export function renderOcrOverlay(container, img, boxes, onPick) {
    container.innerHTML = "";
    if (!img || !boxes?.length || !img.naturalWidth) { container.style.display = "none"; return; }
    const cw = img.clientWidth, ch = img.clientHeight;
    const k = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    const ox = img.offsetLeft + (cw - w) / 2, oy = img.offsetTop + (ch - h) / 2;
    boxes.forEach((b, i) => {
        const el = document.createElement("div");
        el.className = "wfm-ai-ocr-box";
        el.style.left = `${ox + b.x1 * w}px`;
        el.style.top = `${oy + b.y1 * h}px`;
        el.style.width = `${(b.x2 - b.x1) * w}px`;
        el.style.height = `${(b.y2 - b.y1) * h}px`;
        el.title = b.text;
        const tag = document.createElement("span");
        tag.className = "wfm-ai-ocr-box-tag";
        tag.textContent = String(i + 1);
        el.appendChild(tag);
        el.addEventListener("click", (e) => { e.stopPropagation(); onPick?.(i); });
        container.appendChild(el);
    });
    container.style.display = "";
}

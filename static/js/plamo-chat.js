/**
 * PLaMo Translate over a chat API (Ollama /api/chat, LM Studio, ...).
 *
 * PLaMo Translate is a translation-only model. Its chat template treats the user
 * message as source text and a system message that does not start with
 * "[plamo-translate]" as mere context, so instruction prompts are translated or
 * ignored and the direction falls back to Japanese <-> English auto-switching.
 * Per the model card, chat clients pass the languages in a leading
 * "[plamo-translate]" system message and send the text alone.
 *
 * Keep in sync with the inline copy in web/comfyui/node_sets_menu.js (side panel A tab),
 * which cannot import from static/.
 */

// Languages PLaMo 3 Translate supports.
export const PLAMO_LANGS = [
    "ar", "az", "be", "bg", "bn", "ca", "ceb", "de", "en", "es", "et", "eu", "fa", "fr", "gu", "he",
    "hi", "hr", "hu", "hy", "id", "it", "ja", "jv", "ka", "kk", "km", "ko", "lt", "lv", "ml", "mr",
    "ms", "my", "ne", "nl", "pa", "pl", "ru", "si", "sk", "sl", "sr", "sw", "ta", "te", "th", "tl",
    "ur", "uz", "vi", "zh",
];

export const PLAMO_STOP = ["<|plamo:tag|>", "<|plamo:bos|>"];

export function isPlamoModel(model) {
    return /plamo/i.test(model || "");
}

let _nameMap = null;
function _buildNameMap() {
    const map = new Map();
    const locales = ["en", "ja", "zh", typeof navigator !== "undefined" ? navigator.language : "en"];
    for (const code of PLAMO_LANGS) {
        map.set(code, code);
        for (const loc of [...locales, code]) { // `code` adds the endonym (français, 한국어, ...)
            try {
                const name = new Intl.DisplayNames([loc], { type: "language" }).of(code);
                if (name) map.set(name.toLowerCase(), code);
            } catch { /* Intl.DisplayNames unavailable */ }
        }
    }
    // Common spellings Intl does not produce
    [["chinese", "zh"], ["中文", "zh"], ["中国語", "zh"], ["filipino", "tl"], ["tagalog", "tl"], ["persian", "fa"], ["farsi", "fa"]]
        .forEach(([k, v]) => map.set(k, v));
    return map;
}

/** "ja" / "Japanese" / "日本語" / "French" -> PLaMo language code, or "" when unknown. */
export function plamoLangCode(nameOrCode) {
    const key = (nameOrCode || "").trim().toLowerCase();
    if (!key) return "";
    if (!_nameMap) _nameMap = _buildNameMap();
    return _nameMap.get(key) || _nameMap.get(key.split(/[-_]/)[0]) || "";
}

/**
 * Chat messages for translating ``text`` with PLaMo. ``src``/``dst`` are codes or
 * language names; an unknown source is left to auto-detection. Throws when the
 * target language is not one PLaMo supports.
 */
export function buildPlamoMessages(text, src, dst) {
    const dstCode = plamoLangCode(dst);
    if (!dstCode) throw new Error(`PLaMo Translate does not support the target language "${dst}"`);
    const srcCode = plamoLangCode(src);
    const header = `[plamo-translate]\ntarget_lang=${dstCode}` + (srcCode && srcCode !== dstCode ? `\nsource_lang=${srcCode}` : "");
    return [
        { role: "system", content: header },
        { role: "user", content: text },
    ];
}

export function cleanPlamoOutput(text) {
    return (text || "").replace(/<\|plamo:[a-z_]+\|>/g, "").trim();
}

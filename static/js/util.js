/**
 * Shared utilities
 */

// ============================================
// PNG metadata embedding (iTXt chunk)
// ============================================
// Embeds an arbitrary key/UTF-8-text pair into a canvas-generated PNG data URL as
// an iTXt chunk, inserted right after IHDR — same insertion point/CRC approach as
// ComfyUI's own workflow-embedding (web/comfyui/top_menu_extension.js's
// embedWorkflowInPng), but iTXt instead of tEXt so non-ASCII text (Japanese notes,
// prompts, etc.) round-trips correctly through this codebase's PNG chunk reader
// (metadata-tab.js's readAllPNGTextChunks already decodes iTXt text as UTF-8;
// tEXt text there is decoded as Latin-1, which would mangle non-ASCII payloads).

function _n2b(n) {
    return new Uint8Array([(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
}

function _joinBytes(...arrs) {
    const result = new Uint8Array(arrs.reduce((total, a) => total + a.byteLength, 0));
    arrs.reduce((offset, a) => { result.set(a, offset); return offset + a.byteLength; }, 0);
    return result;
}

let _pngCrcTable = null;
function _pngCrc32(data) {
    if (!_pngCrcTable) {
        _pngCrcTable = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            _pngCrcTable[n] = c;
        }
    }
    let crc = 0 ^ -1;
    for (let i = 0; i < data.byteLength; i++) crc = (crc >>> 8) ^ _pngCrcTable[(crc ^ data[i]) & 0xff];
    return (crc ^ -1) >>> 0;
}

function _dataUrlToBytes(dataUrl) {
    const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function _bytesToDataUrl(bytes, mime) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return `data:${mime};base64,${btoa(binary)}`;
}

export function embedPngTextChunk(dataUrl, keyword, text) {
    const bytes = _dataUrlToBytes(dataUrl);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const data = _joinBytes(
        new TextEncoder().encode(`iTXt${keyword}`),
        new Uint8Array([0, 0, 0, 0, 0]), // keyword-NUL, compression flag(0), compression method(0), empty lang tag+NUL, empty translated keyword+NUL
        new TextEncoder().encode(text),
    );
    const chunk = _joinBytes(_n2b(data.byteLength - 4), data, _n2b(_pngCrc32(data)));

    // Insert after IHDR (8-byte signature + 4-byte length + 4-byte type + IHDR data + 4-byte CRC)
    const ihdrDataLen = view.getUint32(8);
    const insertAt = ihdrDataLen + 20;
    const result = _joinBytes(bytes.subarray(0, insertAt), chunk, bytes.subarray(insertAt));
    return _bytesToDataUrl(result, "image/png");
}

// HTMLエスケープ（属性値・テキストコンテンツ両方で安全に使える）
export function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;");
}

// localStorage からJSONを安全に読む（不正JSON・未設定時はfallback）
export function readJsonStorage(key, fallback = {}) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

// プラグイン共通設定 (wfm_settings)
export function getSettings() {
    return readJsonStorage("wfm_settings");
}

// AIバックエンド(Ollama/LM Studio/Lemonade)ごとのデフォルトURL
export const AI_BACKEND_DEFAULT_URLS = {
    ollama: "http://localhost:11434",
    lmstudio: "http://localhost:1234",
    lemonade: "http://localhost:13305",
    unsloth: "http://localhost:8888",
};

export function getAiBackendDefaultUrl(backend) {
    return AI_BACKEND_DEFAULT_URLS[backend] || AI_BACKEND_DEFAULT_URLS.ollama;
}

// ============================================
// Eagle Auto-Save
// ============================================

export function getEagleSettings() {
    const s = getSettings();
    return {
        url: s.eagleUrl || "http://localhost:41595",
        autoSave: !!s.eagleAutoSave,
    };
}

export async function saveToEagle(imageUrl, name, tags = [], fileInfo = null) {
    const eagle = getEagleSettings();
    if (!eagle.autoSave) return;
    try {
        const res = await fetch("/api/wfm/eagle/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                eagleUrl: eagle.url,
                url: imageUrl,
                name,
                tags: ["wfm-comfyui", ...tags],
                // SVG はサーバー側でローカルパス解決(addFromPath)するために必要
                filename: fileInfo?.filename || "",
                subfolder: fileInfo?.subfolder || "",
                type: fileInfo?.type || "output",
                // comfyui-tosvg の Save SVG String など、絶対パスが既知の場合に渡す
                localPath: fileInfo?.localPath || "",
            }),
        });
        const data = await res.json();
        if (data.status === "success") {
            console.log("[Eagle] Saved:", name);
        } else {
            console.warn("[Eagle] Save failed:", data.message);
        }
    } catch (err) {
        console.warn("[Eagle] Save error:", err.message);
    }
}

/**
 * 検索inputにオーバーレイXボタンを設定する。
 * @param {string} inputId - 検索inputのID
 * @param {string} clearBtnId - クリアボタンのID
 * @param {Function} onClear - クリア時に呼び出すコールバック（inputは既に空になった後で呼ばれる）
 */
export function setupSearchClearBtn(inputId, clearBtnId, onClear) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(clearBtnId);
    if (!input || !btn) return;

    const sync = () => {
        btn.style.display = input.value ? "flex" : "none";
    };

    input.addEventListener("input", sync);
    btn.addEventListener("click", () => {
        input.value = "";
        btn.style.display = "none";
        input.focus();
        onClear();
    });

    // 初期値が入っている場合に備えて同期
    sync();
}

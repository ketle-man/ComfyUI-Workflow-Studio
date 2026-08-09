/**
 * Shared utilities
 */

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

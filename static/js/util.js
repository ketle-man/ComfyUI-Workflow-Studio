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

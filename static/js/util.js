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

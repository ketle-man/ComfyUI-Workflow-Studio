/**
 * Prompt Tab - Style manager (Col3 "Style" タブ)
 */
// Wildcardファイルマネージャーと同じCRUDパターン（一覧→エディタ→保存/削除/キャンセル）。
// 保存・削除後は generate-tab.js の refreshStylesList() を呼び、GenerateUIのStyleドロップダウンや
// Batchタブのチェックリストを再読み込み無しで最新状態へ同期する。

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { setupSearchClearBtn } from "./util.js";
import { refreshStylesList } from "./generate-tab.js";
import { esc } from "./prompt-presets.js";

let styleListData = [];
let styleSearchText = "";
let styleEditingOriginalName = null; // null = 新規作成
let styleEditingFile = null;         // 編集中/追加先スタイルの定義元ファイル名（style/配下、null = デフォルトのcustom.json）

export async function styleFetchList() {
    try {
        const res = await fetch("/api/wfm/styles");
        return res.ok ? await res.json() : [];
    } catch { return []; }
}

export async function styleApiCreate(name, prompt, negativePrompt, targetFile) {
    try {
        const body = { name, prompt, negative_prompt: negativePrompt };
        if (targetFile) body.file = targetFile;
        const res = await fetch("/api/wfm/styles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        return res.ok ? { ok: true } : { ok: false, error: data.error || `HTTP ${res.status}` };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

export async function styleApiUpdate(originalName, name, prompt, negativePrompt) {
    try {
        const res = await fetch(`/api/wfm/styles/${encodeURIComponent(originalName)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, prompt, negative_prompt: negativePrompt }),
        });
        const data = await res.json().catch(() => ({}));
        return res.ok ? { ok: true } : { ok: false, error: data.error || `HTTP ${res.status}` };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

export async function styleApiDelete(name) {
    try {
        const res = await fetch(`/api/wfm/styles/${encodeURIComponent(name)}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        return res.ok ? { ok: true } : { ok: false, error: data.error || `HTTP ${res.status}` };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function styleRenderList() {
    const list = document.getElementById("wfm-style-list");
    if (!list) return;
    list.innerHTML = "";

    const q = styleSearchText.trim().toLowerCase();
    const filtered = q ? styleListData.filter(s => s.name.toLowerCase().includes(q)) : styleListData;

    if (filtered.length === 0) {
        list.innerHTML = styleListData.length === 0
            ? `<div class="wfm-pm-empty" style="font-size:12px;">No styles yet.<br><small>Click "+ New" to create one.</small></div>`
            : `<div class="wfm-pm-empty" style="font-size:12px;">No matching styles.</div>`;
        return;
    }

    for (const s of filtered) {
        const item = document.createElement("div");
        item.className = "wfm-wc-file-item";
        item.innerHTML = `
            <div class="wfm-wc-file-item-info">
                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.name)}</span>
                ${s.file ? `<span class="wfm-wc-file-ext" title="${esc(s.file)}">${esc(s.file)}</span>` : ""}
            </div>
            <div class="wfm-wc-file-item-actions">
                <button class="wfm-pm-action-btn wfm-style-edit-btn" title="Edit style">&#9998;</button>
            </div>
        `;
        item.querySelector(".wfm-style-edit-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            styleOpenEditor(s);
        });
        item.addEventListener("click", () => styleOpenEditor(s));
        list.appendChild(item);
    }
}

// forcedFile: 「+ Add to this file」から呼ばれた場合に、既存スタイルではなく
// 特定ファイルを追加先として指定するために使う（styleは渡さずnullにする）
function styleOpenEditor(style, forcedFile) {
    styleEditingOriginalName = style ? style.name : null;
    styleEditingFile = style ? (style.file || null) : (forcedFile || null);

    const editor = document.getElementById("wfm-style-editor");
    const nameInput = document.getElementById("wfm-style-editor-name");
    const promptTA = document.getElementById("wfm-style-editor-prompt");
    const negativeTA = document.getElementById("wfm-style-editor-negative");
    const deleteBtn = document.getElementById("wfm-style-editor-delete-btn");
    const addFileBtn = document.getElementById("wfm-style-editor-addfile-btn");
    const fileLabel = document.getElementById("wfm-style-editor-file-label");

    if (!editor) return;
    nameInput.value = style?.name || "";
    promptTA.value = style?.prompt || "";
    negativeTA.value = style?.negative_prompt || "";
    deleteBtn.style.display = style ? "" : "none";
    // 「このファイルへ追加」は既存スタイルを編集中（=対象ファイルが分かっている）時だけ表示
    addFileBtn.style.display = style ? "" : "none";
    if (styleEditingFile) {
        fileLabel.textContent = `File: ${styleEditingFile}`;
        fileLabel.style.display = "";
    } else {
        fileLabel.style.display = "none";
    }
    editor.style.display = "";
    nameInput.focus();
}

function styleCloseEditor() {
    styleEditingOriginalName = null;
    styleEditingFile = null;
    const editor = document.getElementById("wfm-style-editor");
    if (editor) editor.style.display = "none";
}

export async function styleRefreshList() {
    styleListData = await styleFetchList();
    styleRenderList();
}

// ============================================
// UI wiring (called from prompt-tab.js's initPromptTab)
// ============================================

export function initStylesUI() {
    document.getElementById("wfm-style-new-btn")?.addEventListener("click", () => {
        styleOpenEditor(null);
    });

    document.getElementById("wfm-style-refresh-btn")?.addEventListener("click", () => {
        styleRefreshList();
    });

    // 編集中の既存スタイルと同じファイルへ、新しい空のスタイルを追加する
    document.getElementById("wfm-style-editor-addfile-btn")?.addEventListener("click", () => {
        if (!styleEditingFile) return;
        styleOpenEditor(null, styleEditingFile);
    });

    setupSearchClearBtn("wfm-style-search", "wfm-style-search-clear-btn", () => {
        styleSearchText = "";
        styleRenderList();
    });
    document.getElementById("wfm-style-search")?.addEventListener("input", (e) => {
        styleSearchText = e.target.value;
        styleRenderList();
    });

    document.getElementById("wfm-style-editor-save-btn")?.addEventListener("click", async () => {
        const nameInput = document.getElementById("wfm-style-editor-name");
        const promptTA = document.getElementById("wfm-style-editor-prompt");
        const negativeTA = document.getElementById("wfm-style-editor-negative");

        const name = (nameInput?.value || "").trim();
        const prompt = promptTA?.value || "";
        const negativePrompt = negativeTA?.value || "";

        if (!name) { showToast(t("pleaseEnterStyleName"), "error"); return; }

        const result = styleEditingOriginalName
            ? await styleApiUpdate(styleEditingOriginalName, name, prompt, negativePrompt)
            : await styleApiCreate(name, prompt, negativePrompt, styleEditingFile);

        if (result.ok) {
            showToast(t("savedAs", name), "success");
            styleCloseEditor();
            await styleRefreshList();
            await refreshStylesList();
        } else {
            showToast(t("errorWithMsg", result.error), "error");
        }
    });

    // Editor: delete
    document.getElementById("wfm-style-editor-delete-btn")?.addEventListener("click", async () => {
        if (!styleEditingOriginalName) return;
        if (!confirm(`Delete "${styleEditingOriginalName}"?`)) return;
        const result = await styleApiDelete(styleEditingOriginalName);
        if (result.ok) {
            showToast(t("deletedName", styleEditingOriginalName), "success");
            styleCloseEditor();
            await styleRefreshList();
            await refreshStylesList();
        } else {
            showToast(t("errorWithMsg", result.error), "error");
        }
    });

    // Editor: cancel
    document.getElementById("wfm-style-editor-cancel-btn")?.addEventListener("click", () => {
        styleCloseEditor();
    });

    // Initial style list load
    styleRefreshList();
}

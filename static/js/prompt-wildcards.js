/**
 * Prompt Tab - Wildcard file manager (list, editor, insert-at-cursor helpers)
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { esc } from "./prompt-presets.js";

// ============================================
// Wildcard API helpers
// ============================================

export async function wcFetchFiles() {
    try {
        const res = await fetch("/api/wfm/wildcards");
        return res.ok ? await res.json() : [];
    } catch { return []; }
}

export async function wcFetchContent(filename) {
    try {
        const res = await fetch(`/api/wfm/wildcards/content?filename=${encodeURIComponent(filename)}`);
        const data = await res.json();
        return data.content ?? null;
    } catch { return null; }
}

export async function wcSaveFile(filename, content) {
    try {
        const res = await fetch("/api/wfm/wildcards/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, content }),
        });
        const data = await res.json();
        return data.status === "ok" ? data.file : null;
    } catch { return null; }
}

export async function wcDeleteFile(filename) {
    try {
        await fetch("/api/wfm/wildcards/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename }),
        });
    } catch { /* ignore */ }
}

// ============================================
// Wildcard state & helpers
// ============================================

let wcFiles = [];
let wcEditingFilename = null; // null = new file

// Insert text at cursor; if open+close provided wraps selection
function wcInsertAtCursor(textarea, open, close = "") {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    let inserted, cursorStart, cursorEnd;

    if (selected && close) {
        inserted = open + selected + close;
        cursorStart = start + open.length;
        cursorEnd = cursorStart + selected.length;
    } else if (close) {
        inserted = open + close;
        cursorStart = start + open.length;
        cursorEnd = cursorStart;
    } else {
        inserted = open;
        cursorStart = start + open.length;
        cursorEnd = cursorStart;
    }

    textarea.value =
        textarea.value.substring(0, start) +
        inserted +
        textarea.value.substring(end);
    textarea.setSelectionRange(cursorStart, cursorEnd);
    textarea.focus();
    textarea.dispatchEvent(new Event("input"));
}

// ============================================
// Wildcard file list rendering
// ============================================

function wcRenderFileList() {
    const list = document.getElementById("wfm-wc-file-list");
    if (!list) return;
    list.innerHTML = "";

    if (wcFiles.length === 0) {
        list.innerHTML = `<div class="wfm-pm-empty" style="font-size:12px;">No wildcard files yet.<br><small>Click "+ New" to create one.</small></div>`;
        return;
    }

    // Group by directory; root ("") first, then alphabetical
    const grouped = {};
    for (const f of wcFiles) {
        const dir = f.dir || "";
        if (!grouped[dir]) grouped[dir] = [];
        grouped[dir].push(f);
    }
    const dirs = Object.keys(grouped).sort((a, b) => {
        if (a === "") return -1;
        if (b === "") return 1;
        return a.localeCompare(b);
    });

    function addFileItem(f, indented) {
        const item = document.createElement("div");
        item.className = "wfm-wc-file-item" + (indented ? " wfm-wc-file-item--sub" : "");
        item.innerHTML = `
            <div class="wfm-wc-file-item-info">
                <span class="wfm-wc-file-name">${esc(f.name)}</span>
                <span class="wfm-wc-file-ext">.${esc(f.ext)}</span>
            </div>
            <div class="wfm-wc-file-item-actions">
                <button class="wfm-pm-action-btn wfm-wc-use-btn" title="Insert __${esc(f.wc_name)}__ at cursor">Use</button>
                <button class="wfm-pm-action-btn wfm-wc-edit-btn" title="Edit file">&#9998;</button>
            </div>
        `;
        item.querySelector(".wfm-wc-use-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            const ta = document.getElementById("wfm-wc-prompt");
            if (ta) wcInsertAtCursor(ta, `__${f.wc_name}__`);
        });
        item.querySelector(".wfm-wc-edit-btn").addEventListener("click", async (e) => {
            e.stopPropagation();
            const content = await wcFetchContent(f.filename);
            wcOpenEditor(f.wc_name, f.ext, content ?? "", f.filename);
        });
        item.addEventListener("click", () => {
            const ta = document.getElementById("wfm-wc-prompt");
            if (ta) wcInsertAtCursor(ta, `__${f.wc_name}__`);
        });
        list.appendChild(item);
    }

    for (const dir of dirs) {
        if (dir) {
            const header = document.createElement("div");
            header.className = "wfm-wc-dir-header";
            header.textContent = dir + "/";
            list.appendChild(header);
        }
        for (const f of grouped[dir]) {
            addFileItem(f, dir !== "");
        }
    }
}

// ============================================
// Wildcard file editor
// ============================================

function wcOpenEditor(name, ext, content, existingFilename) {
    wcEditingFilename = existingFilename || null;

    const editor = document.getElementById("wfm-wc-editor");
    const nameInput = document.getElementById("wfm-wc-editor-name");
    const extSelect = document.getElementById("wfm-wc-editor-ext");
    const contentTA = document.getElementById("wfm-wc-editor-content");
    const deleteBtn = document.getElementById("wfm-wc-editor-delete-btn");

    if (!editor) return;
    nameInput.value = name || "";
    extSelect.value = ext || "txt";
    contentTA.value = content || "";
    deleteBtn.style.display = existingFilename ? "" : "none";
    editor.style.display = "";
    nameInput.focus();
}

function wcCloseEditor() {
    wcEditingFilename = null;
    const editor = document.getElementById("wfm-wc-editor");
    if (editor) editor.style.display = "none";
}

export async function wcRefreshFiles() {
    wcFiles = await wcFetchFiles();
    wcRenderFileList();
    wcUpdateFilePicker();
}

// ============================================
// Wildcard file picker popup
// ============================================

// Renders the wildcard-file-reference list into `picker`, inserting into `targetTa` on click.
// Shared by the Form tab's fixed file-picker popup and any dynamically built toolbar
// (see createWildcardToolbar) so both stay in sync with a single implementation.
function renderFilePicker(picker, targetTa) {
    picker.innerHTML = "";
    if (wcFiles.length === 0) {
        picker.innerHTML = `<div style="padding:8px;font-size:11px;color:var(--wfm-text-secondary);">No wildcard files</div>`;
        return;
    }
    // Group by directory same as file list
    const grouped = {};
    for (const f of wcFiles) {
        const dir = f.dir || "";
        if (!grouped[dir]) grouped[dir] = [];
        grouped[dir].push(f);
    }
    const dirs = Object.keys(grouped).sort((a, b) => {
        if (a === "") return -1;
        if (b === "") return 1;
        return a.localeCompare(b);
    });
    for (const dir of dirs) {
        if (dir) {
            const sep = document.createElement("div");
            sep.className = "wfm-wc-picker-dir";
            sep.textContent = dir + "/";
            picker.appendChild(sep);
        }
        for (const f of grouped[dir]) {
            const btn = document.createElement("button");
            btn.className = "wfm-wc-picker-item" + (dir ? " wfm-wc-picker-item--sub" : "");
            btn.textContent = `__${f.wc_name}__`;
            btn.addEventListener("click", () => {
                wcInsertAtCursor(targetTa, `__${f.wc_name}__`);
                picker.style.display = "none";
            });
            picker.appendChild(btn);
        }
    }
}

function wcUpdateFilePicker() {
    const picker = document.getElementById("wfm-wc-file-picker");
    const ta = document.getElementById("wfm-wc-prompt");
    if (!picker || !ta) return;
    renderFilePicker(picker, ta);
}

// ============================================
// Reusable wildcard syntax toolbar (buttons + file-reference picker)
// ============================================

const WC_SYNTAX_BUTTONS = [
    { open: "{", close: "}", label: "{ }", title: "Random pick set  e.g. {cat|dog}" },
    { open: "|", close: "", label: "|", title: "Separator" },
    { open: "__", close: "__", label: "__", title: "Wildcard file reference  e.g. __animals__" },
    { open: ":", close: "", label: ":", title: "Colon" },
    { open: ";", close: "", label: ";", title: "Semicolon" },
    { open: "$$", close: "", label: "$$", title: "Multi-pick  e.g. {2$$cat|dog|bird}" },
    { open: "[", close: "]", label: "[ ]", title: "Bracket set  e.g. [cat|dog]" },
];

// Builds a standalone wildcard-syntax toolbar (syntax buttons, LoRA/n$${} helpers, and the
// file-reference picker) wired to insert into the given textarea. The Form tab's Col3 panel
// uses the static toolbar markup in index.html instead (wired in initWildcardsUI below); this
// is for callers that need the same toolbar attached to a textarea built at runtime, such as
// the Table tab's wildcard edit modal (see prompt-table.js).
export function createWildcardToolbar(textareaEl) {
    const toolbar = document.createElement("div");
    toolbar.className = "wfm-wc-toolbar";

    for (const b of WC_SYNTAX_BUTTONS) {
        const btn = document.createElement("button");
        btn.className = "wfm-wc-btn";
        btn.title = b.title;
        btn.textContent = b.label;
        btn.addEventListener("click", () => wcInsertAtCursor(textareaEl, b.open, b.close));
        toolbar.appendChild(btn);
    }

    const loraBtn = document.createElement("button");
    loraBtn.className = "wfm-wc-btn";
    loraBtn.title = "LoRA with LBW  e.g. <lora:name:1:LBW=...;...>";
    loraBtn.textContent = "<lora>";
    loraBtn.addEventListener("click", () => {
        wcInsertAtCursor(textareaEl, "<lora::1:LBW=;>");
        // Move cursor to after "lora:" for the name
        const pos = textareaEl.selectionStart - "<lora::1:LBW=;>".length + 6;
        textareaEl.setSelectionRange(pos, pos);
        textareaEl.focus();
    });
    toolbar.appendChild(loraBtn);

    const nsetBtn = document.createElement("button");
    nsetBtn.className = "wfm-wc-btn";
    nsetBtn.title = "Multi-pick set  e.g. {2$$cat|dog|bird}";
    nsetBtn.textContent = "n$${ }";
    nsetBtn.addEventListener("click", () => {
        const n = prompt("Number of items to pick (n):", "2");
        if (n === null) return;
        const num = parseInt(n, 10);
        if (isNaN(num) || num < 1) { showToast(t("enterPositiveInt"), "error"); return; }
        const template = "{" + num + "$$|}";
        const start = textareaEl.selectionStart;
        wcInsertAtCursor(textareaEl, template);
        // Move cursor between $$ and |
        const inner = start + ("{" + num + "$$").length;
        textareaEl.setSelectionRange(inner, inner);
        textareaEl.focus();
    });
    toolbar.appendChild(nsetBtn);

    const pickerWrap = document.createElement("div");
    pickerWrap.className = "wfm-wc-file-picker-wrap";
    const pickBtn = document.createElement("button");
    pickBtn.className = "wfm-wc-btn";
    pickBtn.title = "Insert wildcard file reference";
    pickBtn.innerHTML = "&#128194; File";
    const picker = document.createElement("div");
    picker.className = "wfm-wc-file-picker";
    picker.style.display = "none";
    pickBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = picker.style.display !== "none";
        picker.style.display = isOpen ? "none" : "";
        if (!isOpen) renderFilePicker(picker, textareaEl);
    });
    document.addEventListener("click", () => { picker.style.display = "none"; });
    pickerWrap.appendChild(pickBtn);
    pickerWrap.appendChild(picker);
    toolbar.appendChild(pickerWrap);

    return toolbar;
}

// ============================================
// UI wiring (called from prompt-tab.js's initPromptTab)
// ============================================

export function initWildcardsUI() {
    // ── Wildcard syntax buttons ──────────────────────────────
    document.querySelectorAll(".wfm-wc-btn[data-wc-open]").forEach(btn => {
        btn.addEventListener("click", () => {
            const ta = document.getElementById("wfm-wc-prompt");
            if (!ta) return;
            const open = btn.dataset.wcOpen || "";
            const close = btn.dataset.wcClose || "";
            wcInsertAtCursor(ta, open, close);
        });
    });

    // LoRA LBW template button
    document.getElementById("wfm-wc-lora-btn")?.addEventListener("click", () => {
        const ta = document.getElementById("wfm-wc-prompt");
        if (!ta) return;
        wcInsertAtCursor(ta, "<lora::1:LBW=;>");
        // Move cursor to after "lora:" for the name
        const pos = ta.selectionStart - "<lora::1:LBW=;>".length + 6;
        ta.setSelectionRange(pos, pos);
        ta.focus();
    });

    // n$${ } button — asks for n then inserts multi-pick template
    document.getElementById("wfm-wc-nset-btn")?.addEventListener("click", () => {
        const ta = document.getElementById("wfm-wc-prompt");
        if (!ta) return;
        const n = prompt("Number of items to pick (n):", "2");
        if (n === null) return;
        const num = parseInt(n, 10);
        if (isNaN(num) || num < 1) { showToast(t("enterPositiveInt"), "error"); return; }
        const template = "{" + num + "$$|}";
        const start = ta.selectionStart;
        wcInsertAtCursor(ta, template);
        // Move cursor between $$ and |
        const inner = start + ("{" + num + "$$").length;
        ta.setSelectionRange(inner, inner);
        ta.focus();
    });

    // File picker toggle
    const filePickBtn = document.getElementById("wfm-wc-filepick-btn");
    const filePicker = document.getElementById("wfm-wc-file-picker");
    filePickBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!filePicker) return;
        const isOpen = filePicker.style.display !== "none";
        filePicker.style.display = isOpen ? "none" : "";
        if (!isOpen) wcUpdateFilePicker();
    });
    document.addEventListener("click", () => {
        if (filePicker) filePicker.style.display = "none";
    });

    // ── Wildcard prompt actions ──────────────────────────────
    document.getElementById("wfm-wc-copy-btn")?.addEventListener("click", () => {
        const ta = document.getElementById("wfm-wc-prompt");
        const text = ta?.value || "";
        if (!text.trim()) { showToast(t("noTextToCopy"), "error"); return; }
        navigator.clipboard.writeText(text).then(() => showToast(t("copiedToClipboard"), "success"));
    });

    document.getElementById("wfm-wc-to-pos-btn")?.addEventListener("click", () => {
        const src = document.getElementById("wfm-wc-prompt");
        const dst = document.getElementById("wfm-preset-pos");
        if (!src || !dst) return;
        dst.value = src.value;
        dst.dispatchEvent(new Event("input", { bubbles: true }));
        showToast(t("sentToPositive"), "success");
    });

    document.getElementById("wfm-wc-to-neg-btn")?.addEventListener("click", () => {
        const src = document.getElementById("wfm-wc-prompt");
        const dst = document.getElementById("wfm-preset-neg");
        if (!src || !dst) return;
        dst.value = src.value;
        dst.dispatchEvent(new Event("input", { bubbles: true }));
        showToast(t("sentToNegative"), "success");
    });

    document.getElementById("wfm-wc-clear-btn")?.addEventListener("click", () => {
        const ta = document.getElementById("wfm-wc-prompt");
        if (ta) { ta.value = ""; ta.focus(); }
    });

    // ── Wildcard file manager ────────────────────────────────
    document.getElementById("wfm-wc-new-file-btn")?.addEventListener("click", () => {
        wcOpenEditor("", "txt", "", null);
    });

    document.getElementById("wfm-wc-files-refresh-btn")?.addEventListener("click", () => {
        wcRefreshFiles();
    });

    // Editor: save
    document.getElementById("wfm-wc-editor-save-btn")?.addEventListener("click", async () => {
        const nameInput = document.getElementById("wfm-wc-editor-name");
        const extSelect = document.getElementById("wfm-wc-editor-ext");
        const contentTA = document.getElementById("wfm-wc-editor-content");

        // Normalize separators and strip leading/trailing slashes
        const rawName = (nameInput?.value || "").trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
        const ext = extSelect?.value || "txt";
        const content = contentTA?.value || "";

        if (!rawName) { showToast(t("pleaseEnterFilename"), "error"); return; }
        // Validate each path component (allow letters, numbers, -, _, ., space)
        const nameParts = rawName.split("/");
        if (nameParts.some(p => !p || !/^[\w\-. ]+$/.test(p))) {
            showToast(t("invalidPathFormat"), "error");
            return;
        }
        const name = rawName;
        const filename = `${name}.${ext}`;
        const saved = await wcSaveFile(filename, content);
        if (saved) {
            showToast(t("savedAs", filename), "success");
            wcCloseEditor();
            wcRefreshFiles();
        } else {
            showToast(t("saveFailed"), "error");
        }
    });

    // Editor: delete
    document.getElementById("wfm-wc-editor-delete-btn")?.addEventListener("click", async () => {
        if (!wcEditingFilename) return;
        if (!confirm(`Delete "${wcEditingFilename}"?`)) return;
        await wcDeleteFile(wcEditingFilename);
        showToast(t("deletedName", wcEditingFilename), "success");
        wcCloseEditor();
        wcRefreshFiles();
    });

    // Editor: cancel
    document.getElementById("wfm-wc-editor-cancel-btn")?.addEventListener("click", () => {
        wcCloseEditor();
    });

    // Initial wildcard file load
    wcRefreshFiles();
}

/**
 * GenerateUI Tab - Workflow execution with parameter editing
 */

import { showToast, openModal, closeModal } from "./app.js";
import { comfyUI } from "./comfyui-client.js";
import { comfyWorkflow } from "./comfyui-workflow.js";
import { comfyEditor } from "./comfyui-editor.js";
import { t } from "./i18n.js";
import { syncJsonHighlight, syncScroll } from "./json-highlight.js";
import { initFeederTab, refreshFeederNodeList } from "./feeder-tab.js";
import { getSettings, readJsonStorage } from "./util.js";

// ============================================
// Eagle Auto-Save
// ============================================

function getEagleSettings() {
    const s = getSettings();
    return {
        url: s.eagleUrl || "http://localhost:41595",
        autoSave: !!s.eagleAutoSave,
    };
}

async function saveToEagle(imageUrl, name, tags = []) {
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

// ============================================
// Gallery Metadata - ワークフロー保存
// ============================================

let _outputDir = "";

async function _fetchOutputDir() {
    try {
        const res = await fetch("/api/wfm/settings/output-dir");
        if (res.ok) {
            const data = await res.json();
            _outputDir = (data.current || "").replace(/\\/g, "/").replace(/\/$/, "");
        }
    } catch {}
}

async function saveGeneratedImagesMeta(images, workflow) {
    if (!_outputDir) await _fetchOutputDir();
    if (!_outputDir) return;

    for (const img of images) {
        if (img.type !== "output") continue;
        const parts = [_outputDir];
        if (img.subfolder) parts.push(img.subfolder);
        parts.push(img.filename);
        const path = parts.join("/");
        try {
            await fetch("/wfm/gallery/image/meta", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path, workflow }),
            });
        } catch {}
    }
}

// ============================================
// Status & Connection
// ============================================

function updateStatus(connected) {
    const label = document.getElementById("wfm-gen-status");
    if (!label) return;
    if (connected) {
        label.textContent = "Connected";
        label.className = "wfm-gen-status connected";
    } else {
        label.textContent = "Disconnected";
        label.className = "wfm-gen-status disconnected";
    }
}

// ============================================
// Workflow Save
// ============================================

async function saveCurrentWorkflow() {
    if (!comfyUI.currentWorkflow) {
        showToast(t("noWorkflowLoaded"), "warning");
        return;
    }

    const currentFilename = document.getElementById("wfm-gen-wf-name")?.dataset?.filename || "";
    const defaultStem = currentFilename.replace(/\.(json|png|jpg|jpeg|webp|gif)$/i, "") || "workflow";

    const html = `
        <div style="display:flex;flex-direction:column;gap:14px;min-width:300px;">
            <div>
                <label style="font-size:12px;color:var(--wfm-text-secondary);display:block;margin-bottom:4px;">${t("filenameLabel")}</label>
                <div style="display:flex;align-items:center;gap:6px;">
                    <input type="text" id="wfm-save-wf-name" class="wfm-input" style="flex:1;" placeholder="workflow name">
                    <span style="color:var(--wfm-text-secondary);font-size:13px;">.json</span>
                </div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="wfm-btn wfm-btn-sm" id="wfm-save-wf-cancel-btn">${t("cancel")}</button>
                <button class="wfm-btn wfm-btn-sm wfm-btn-primary" id="wfm-save-wf-confirm-btn">${t("save")}</button>
            </div>
        </div>`;

    openModal(t("saveWorkflowTitle"), html);

    // 属性値に埋め込まず DOM 経由で初期値を設定（ファイル名中の引用符等によるHTML注入防止）
    const input = document.getElementById("wfm-save-wf-name");
    if (input) input.value = defaultStem;
    setTimeout(() => {
        if (input) { input.focus(); input.select(); }
    }, 50);

    document.getElementById("wfm-save-wf-cancel-btn")?.addEventListener("click", () => closeModal());

    let saving = false;
    const doSave = async () => {
        if (saving) return;
        const stem = input?.value?.trim();
        if (!stem) {
            showToast(t("pleaseEnterFilename"), "warning");
            return;
        }
        const filename = stem.endsWith(".json") ? stem : `${stem}.json`;
        saving = true;
        try {
            // Raw JSON に未適用の編集があれば保存対象に反映する
            let workflow = comfyUI.currentWorkflow;
            const rawText = document.getElementById("wfm-gen-raw-json")?.value ?? "";
            if (rawText.trim() && rawText !== JSON.stringify(workflow, null, 2)) {
                try {
                    workflow = JSON.parse(rawText);
                } catch {
                    showToast(t("rawJsonUnappliedInvalid"), "error");
                    return;
                }
            }

            // 上書き確認（保存先がUI形式ならAPI形式化でレイアウトが失われる旨を警告）
            try {
                const listRes = await fetch("/api/wfm/workflows");
                const listData = await listRes.json();
                const existing = (Array.isArray(listData) ? listData : []).find(w => w.filename === filename);
                if (existing) {
                    const msg = existing.analysis?.format === "ui"
                        ? t("uiFormatOverwriteWarn")
                        : t("overwriteConfirm", filename);
                    if (!confirm(msg)) return;
                }
            } catch { /* 一覧取得失敗時は確認をスキップして保存を続行 */ }

            const blob = new Blob(
                [JSON.stringify(workflow, null, 2)],
                { type: "application/json" }
            );
            const file = new File([blob], filename, { type: "application/json" });
            const fd = new FormData();
            fd.append("files", file);
            const res = await fetch("/api/wfm/workflows/import", { method: "POST", body: fd });
            const data = await res.json();
            const ng = (data.results || []).filter(r => r.status === "error");
            if (ng.length) {
                showToast(t("saveFailed", ng[0].message || "unknown error"), "error");
                return;
            }
            closeModal();
            if (workflow !== comfyUI.currentWorkflow) {
                // Raw JSON の編集を保存した場合はエディタにも反映して同期する
                await loadWorkflowIntoEditor(workflow, filename);
            } else {
                const nameEl = document.getElementById("wfm-gen-wf-name");
                if (nameEl) {
                    nameEl.textContent = filename;
                    nameEl.dataset.filename = filename;
                }
            }
            showToast(t("savedAs", filename), "success");
        } catch (err) {
            showToast(t("saveFailed", err.message), "error");
        } finally {
            saving = false;
        }
    };

    document.getElementById("wfm-save-wf-confirm-btn")?.addEventListener("click", doSave);
    input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doSave();
    });
}

// ============================================
// Workflow Loading
// ============================================

export async function loadWorkflowIntoEditor(workflow, filename) {
    let apiWorkflow = workflow;
    const format = comfyWorkflow.detectFormat(workflow, filename);

    if (format === "app") {
        showToast(t("appFormatNotSupported"), "error");
        return false;
    } else if (format === "ui") {
        apiWorkflow = await comfyWorkflow.convertUiToApi(workflow);
    } else if (format === "unknown") {
        showToast(t("unknownWorkflowFormat"), "error");
        return false;
    }

    comfyUI.currentWorkflow = apiWorkflow;
    comfyUI.currentAnalysis = comfyWorkflow.analyzeWorkflow(apiWorkflow);

    // Render editor tabs
    comfyEditor.renderAll(comfyUI.currentAnalysis, apiWorkflow);

    // Update raw JSON with highlight
    const rawTextarea = document.getElementById("wfm-gen-raw-json");
    const rawHighlight = document.getElementById("wfm-gen-raw-json-highlight");
    if (rawTextarea) {
        const jsonStr = JSON.stringify(apiWorkflow, null, 2);
        rawTextarea.value = jsonStr;
        syncJsonHighlight(rawHighlight, jsonStr);
    }

    // Update workflow name display
    const nameEl = document.getElementById("wfm-gen-wf-name");
    if (nameEl) {
        nameEl.textContent = filename || "Loaded Workflow";
        nameEl.dataset.filename = filename || "";
    }

    // Enable generate button
    const genBtn = document.getElementById("wfm-gen-generate-btn");
    if (genBtn) genBtn.disabled = !comfyUI.connected;

    refreshFeederNodeList();

    showToast(t("workflowLoadedName", filename || ""), "success");
    return true;
}

// ============================================
// Batch (multi-type: Checkpoint / Lora / Prompt / Workflow)
// ============================================

const _ckptBatch = { aborted: false, paused: false, _resumeResolve: null };
let _activeBatchType = null; // "checkpoint" | "lora" | "prompt" | "workflow" | "sampler" | "scheduler" | null

async function _waitIfPaused() {
    if (!_ckptBatch.paused) return;
    await new Promise((resolve) => { _ckptBatch._resumeResolve = resolve; });
}

function _setPauseBtnState(paused) {
    const btn = document.getElementById("wfm-ckpt-batch-pause-btn");
    if (!btn) return;
    btn.textContent = paused ? "Resume" : "Pause";
    btn.style.background = paused ? "var(--wfm-success, #22c55e)" : "";
    btn.style.color = paused ? "#fff" : "";
}

function _updateBatchTypeLabel(running = false) {
    const el = document.getElementById("wfm-batch-type-label");
    if (!el) return;
    const labels = { checkpoint: "Checkpoint", lora: "Lora", prompt: "Prompt", workflow: "Workflow", sampler: "Sampler", scheduler: "Scheduler", style: "Style" };
    if (_activeBatchType) {
        el.textContent = labels[_activeBatchType];
        el.style.color = running ? "var(--wfm-primary)" : "";
    } else {
        el.textContent = "—";
        el.style.color = "";
    }
}

// mode: "all" = 全選択, "some" = 一部選択, "none" = 全解除
const _ckptState = { mode: "none", selected: new Set() };

// グループ選択状態（中央ペイン）
// selectedGroups  : グループ全体が選択済み（グループ名のSet）
// partialSelections: 部分選択 { groupName: Set<memberValue> }
const _batchGroupState = {
    // Checkpoint
    groups: {},
    selectedGroups: new Set(),
    partialSelections: {},
    // Lora
    loraGroups: {},
    loraSelectedGroups: new Set(),
    loraPartialSelections: {},
    // Prompt (グループ値はpresetId、表示はtitleで解決)
    promptGroups: {},
    promptPresets: [],
    promptSelectedGroups: new Set(),
    promptPartialSelections: {},
    // Workflow
    wfGroups: {},
    wfSelectedGroups: new Set(),
    wfPartialSelections: {},
};

// Sampler / Scheduler 選択状態
const _samplerSelected = new Set();
const _schedulerSelected = new Set();

// 汎用: groupsData/selectedGroups/partialSelectionsからメンバーSetを返す
function _getItemsFromGroupState(groupsData, selectedGroups, partialSelections) {
    const result = new Set();
    for (const [name, members] of Object.entries(groupsData)) {
        if (selectedGroups.has(name)) {
            members.forEach((m) => result.add(m));
        } else {
            const partial = partialSelections[name];
            if (partial) partial.forEach((m) => { if (members.includes(m)) result.add(m); });
        }
    }
    return result;
}

// 中央ペインCheckpointグループの選択モデルSet
function _getSelectedGroupModels() {
    return _getItemsFromGroupState(_batchGroupState.groups, _batchGroupState.selectedGroups, _batchGroupState.partialSelections);
}

// Loraグループの選択アイテムSet
function _getSelectedLoraGroupItems() {
    return _getItemsFromGroupState(_batchGroupState.loraGroups, _batchGroupState.loraSelectedGroups, _batchGroupState.loraPartialSelections);
}

// Promptグループの選択プリセット配列 (idではなくpresetオブジェクト)
function _getSelectedPromptGroupItems() {
    const ids = _getItemsFromGroupState(_batchGroupState.promptGroups, _batchGroupState.promptSelectedGroups, _batchGroupState.promptPartialSelections);
    return [...ids].map((id) => _batchGroupState.promptPresets.find((p) => p.id === id)).filter(Boolean);
}

// Workflowグループの選択ファイル名Set
function _getSelectedWfGroupItems() {
    return _getItemsFromGroupState(_batchGroupState.wfGroups, _batchGroupState.wfSelectedGroups, _batchGroupState.wfPartialSelections);
}

// グループの選択済みメンバー数（汎用）
function _getGroupSelCountFrom(name, groupsData, selectedGroups, partialSelections) {
    const members = groupsData[name] || [];
    if (selectedGroups.has(name)) return members.length;
    const partial = partialSelections[name];
    return partial ? members.filter((m) => partial.has(m)).length : 0;
}

// グループの選択済みモデル数を返す（Checkpoint用 UIカウント表示）
function _getGroupSelCount(name) {
    return _getGroupSelCountFrom(name, _batchGroupState.groups, _batchGroupState.selectedGroups, _batchGroupState.partialSelections);
}

function _getSelectedCheckpoints() {
    const all = comfyEditor.models.checkpoints || [];
    // 左ペイン（ファイルツリー）選択
    let leftModels;
    if (_ckptState.mode === "all") leftModels = all;
    else if (_ckptState.mode === "none") leftModels = [];
    else leftModels = all.filter((m) => _ckptState.selected.has(m));

    // 中央ペイン（グループ）選択を統合（重複排除）
    const seen = new Set(leftModels);
    const result = [...leftModels];
    for (const m of _getSelectedGroupModels()) {
        if (!seen.has(m)) { seen.add(m); result.push(m); }
    }
    return result;
}

function _renderQueueColumn(countId, listId, items, displayFn, singular, plural) {
    const countEl = document.getElementById(countId);
    const listEl = document.getElementById(listId);
    const n = items.length;
    if (countEl) countEl.textContent = `${n} ${n !== 1 ? plural : singular}`;
    if (!listEl) return;
    if (n === 0) {
        listEl.innerHTML = `<p class="wfm-placeholder" style="font-size:11px;padding:8px 10px;">None selected</p>`;
        return;
    }
    listEl.innerHTML = items.map((item, i) => {
        const label = displayFn(item);
        const tip = typeof item === "string" ? item.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;") : "";
        const safeLabel = label.replace(/&/g, "&amp;").replace(/</g, "&lt;");
        return `<div class="wfm-batch-preview-item" title="${tip}">${i + 1}. ${safeLabel}</div>`;
    }).join("");
}

function _renderBatchPreview() {
    // Checkpoint
    const ckptList = _getSelectedCheckpoints();
    _renderQueueColumn(
        "wfm-batch-preview-count", "wfm-batch-preview-list",
        ckptList,
        (m) => m.replace(/\\/g, "/").split("/").pop(),
        "checkpoint", "checkpoints"
    );
    // Lora
    const loraList = [..._getSelectedLoraGroupItems()];
    _renderQueueColumn(
        "wfm-batch-lora-count", "wfm-batch-lora-list",
        loraList,
        (m) => m.replace(/\\/g, "/").split("/").pop(),
        "lora", "loras"
    );
    // Prompt
    const promptList = _getSelectedPromptGroupItems();
    _renderQueueColumn(
        "wfm-batch-prompt-count", "wfm-batch-prompt-list",
        promptList,
        (p) => p.name || p.id,
        "prompt", "prompts"
    );
    // Workflow
    const wfList = [..._getSelectedWfGroupItems()];
    _renderQueueColumn(
        "wfm-batch-wf-count", "wfm-batch-wf-list",
        wfList,
        (f) => f.replace(/\.json$/i, "").replace(/\\/g, "/").split("/").pop(),
        "workflow", "workflows"
    );
    // Sampler
    _renderQueueColumn(
        "wfm-batch-sampler-count", "wfm-batch-sampler-list",
        [..._samplerSelected].sort(),
        (s) => s,
        "sampler", "samplers"
    );
    // Scheduler
    _renderQueueColumn(
        "wfm-batch-scheduler-count", "wfm-batch-scheduler-list",
        [..._schedulerSelected].sort(),
        (s) => s,
        "scheduler", "schedulers"
    );
    // Style
    const styleList = _stylesData.filter((s) => _batchStyleSelected.has(s.name)).map((s) => s.name);
    _renderQueueColumn(
        "wfm-batch-style-count", "wfm-batch-style-preview-list",
        styleList,
        (s) => s,
        "style", "styles"
    );
}

// モデルパスリストをフォルダ → [modelPath, ...] のMapに変換
function _buildFolderTree(models) {
    const map = new Map();
    for (const m of models) {
        const normalized = m.replace(/\\/g, "/");
        const lastSlash = normalized.lastIndexOf("/");
        const folder = lastSlash === -1 ? "" : normalized.substring(0, lastSlash);
        if (!map.has(folder)) map.set(folder, []);
        map.get(folder).push(m);
    }
    return new Map([...map.entries()].sort((a, b) => {
        if (a[0] === b[0]) return 0;
        if (a[0] === "") return -1;
        if (b[0] === "") return 1;
        return a[0].localeCompare(b[0]);
    }));
}

// フォルダ内の選択状態を返す: "checked" | "indeterminate" | "unchecked"
function _getFolderCheckState(folderModels) {
    if (_ckptState.mode === "all") return "checked";
    if (_ckptState.mode === "none") return "unchecked";
    const selCount = folderModels.filter((m) => _ckptState.selected.has(m)).length;
    if (selCount === 0) return "unchecked";
    if (selCount === folderModels.length) return "checked";
    return "indeterminate";
}

// 単一モデルの選択トグル（_ckptState を更新）
function _toggleSingleModel(m, checked, all) {
    if (_ckptState.mode === "all" && !checked) {
        _ckptState.mode = "some";
        _ckptState.selected.clear();
        all.forEach((x) => _ckptState.selected.add(x));
    } else if (_ckptState.mode === "none" && checked) {
        _ckptState.mode = "some";
        _ckptState.selected.clear();
    }
    if (checked) _ckptState.selected.add(m);
    else _ckptState.selected.delete(m);
    if (_ckptState.selected.size === all.length) { _ckptState.mode = "all"; _ckptState.selected.clear(); }
    if (_ckptState.mode === "some" && _ckptState.selected.size === 0) _ckptState.mode = "none";
}

// フォルダ単位の一括トグル（_ckptState を更新）
function _toggleFolderModels(folderModels, checked, all) {
    if (_ckptState.mode === "all" && !checked) {
        _ckptState.mode = "some";
        _ckptState.selected.clear();
        all.forEach((x) => _ckptState.selected.add(x));
    } else if (_ckptState.mode === "none" && checked) {
        _ckptState.mode = "some";
        _ckptState.selected.clear();
    }
    folderModels.forEach((m) => { if (checked) _ckptState.selected.add(m); else _ckptState.selected.delete(m); });
    if (_ckptState.selected.size === all.length) { _ckptState.mode = "all"; _ckptState.selected.clear(); }
    if (_ckptState.mode === "some" && _ckptState.selected.size === 0) _ckptState.mode = "none";
}

function _rebuildCkptList() {
    const listEl = document.getElementById("wfm-ckpt-list");
    if (!listEl) return;
    const all = comfyEditor.models.checkpoints || [];
    const search = document.getElementById("wfm-ckpt-search")?.value.toLowerCase() || "";
    const filtered = search ? all.filter((m) => m.toLowerCase().includes(search)) : all;

    if (filtered.length === 0) {
        listEl.innerHTML = `<div style="padding:8px 10px;font-size:11px;color:var(--wfm-text-secondary);">No checkpoints</div>`;
        return;
    }

    const folderTree = _buildFolderTree(filtered);
    listEl.innerHTML = "";

    for (const [folder, models] of folderTree) {
        const group = document.createElement("div");
        group.className = "wfm-ckpt-folder-group open";

        // --- フォルダヘッダー ---
        const header = document.createElement("div");
        header.className = "wfm-ckpt-folder-header";

        const folderCb = document.createElement("input");
        folderCb.type = "checkbox";
        const folderState = _getFolderCheckState(models);
        folderCb.checked = folderState === "checked";
        folderCb.indeterminate = folderState === "indeterminate";

        const toggle = document.createElement("span");
        toggle.className = "wfm-ckpt-folder-toggle";
        toggle.textContent = "▶";

        const nameSpan = document.createElement("span");
        nameSpan.className = "wfm-ckpt-folder-name";
        nameSpan.textContent = folder || "(root)";
        nameSpan.title = folder || "(root)";

        const countSpan = document.createElement("span");
        countSpan.className = "wfm-ckpt-folder-count";
        countSpan.textContent = models.length;

        // --- ファイルリスト ---
        const filesDiv = document.createElement("div");
        filesDiv.className = "wfm-ckpt-folder-files";

        for (const m of models) {
            const itemLabel = document.createElement("label");
            itemLabel.className = "wfm-ckpt-item wfm-ckpt-item--indented";

            const fileCb = document.createElement("input");
            fileCb.type = "checkbox";
            fileCb.value = m;
            if (_ckptState.mode === "all") fileCb.checked = true;
            else if (_ckptState.mode === "none") fileCb.checked = false;
            else fileCb.checked = _ckptState.selected.has(m);

            const normalized = m.replace(/\\/g, "/");
            const lastSlash = normalized.lastIndexOf("/");
            const fileName = lastSlash === -1 ? m : m.substring(lastSlash + 1);
            const fileSpan = document.createElement("span");
            fileSpan.className = "wfm-ckpt-item-label";
            fileSpan.textContent = fileName;
            fileSpan.title = m;

            fileCb.addEventListener("change", () => {
                _toggleSingleModel(m, fileCb.checked, all);
                const s = _getFolderCheckState(models);
                folderCb.checked = s === "checked";
                folderCb.indeterminate = s === "indeterminate";
                _renderBatchPreview();
            });

            itemLabel.appendChild(fileCb);
            itemLabel.appendChild(fileSpan);
            filesDiv.appendChild(itemLabel);
        }

        // フォルダCBのchange
        folderCb.addEventListener("change", () => {
            _toggleFolderModels(models, folderCb.checked, all);
            folderCb.indeterminate = false;
            filesDiv.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = folderCb.checked; });
            _renderBatchPreview();
        });

        // フォルダ名 / トグル矢印クリックで展開・折りたたみ
        [toggle, nameSpan].forEach((el) => {
            el.addEventListener("click", () => group.classList.toggle("open"));
        });

        header.appendChild(folderCb);
        header.appendChild(toggle);
        header.appendChild(nameSpan);
        header.appendChild(countSpan);
        group.appendChild(header);
        group.appendChild(filesDiv);
        listEl.appendChild(group);
    }
}

// ============================================
// Batch Tab
// ============================================

async function _loadBatchCheckpointGroups() {
    try {
        const res = await fetch("/api/wfm/models/groups?type=checkpoint");
        if (res.ok) _batchGroupState.groups = await res.json();
        else _batchGroupState.groups = {};
    } catch { _batchGroupState.groups = {}; }

    // 削除されたグループを選択状態からも除去
    const currentNames = new Set(Object.keys(_batchGroupState.groups));
    for (const name of _batchGroupState.selectedGroups) {
        if (!currentNames.has(name)) _batchGroupState.selectedGroups.delete(name);
    }
    for (const name of Object.keys(_batchGroupState.partialSelections)) {
        if (!currentNames.has(name)) delete _batchGroupState.partialSelections[name];
    }

    _renderBatchGroupList();
    _renderBatchPreview();
}

function _renderBatchGroupList() {
    const el = document.getElementById("wfm-batch-group-list");
    if (!el) return;
    const groups = _batchGroupState.groups;
    const names = Object.keys(groups).sort();

    if (names.length === 0) {
        el.innerHTML = `<p class="wfm-placeholder" style="font-size:12px;padding:16px;">No groups defined.<br>Create groups in the Models tab.</p>`;
        return;
    }

    el.innerHTML = "";
    for (const name of names) {
        const members = groups[name] || [];

        const groupDiv = document.createElement("div");
        groupDiv.className = "wfm-batch-group-item open";

        const headerDiv = document.createElement("div");
        headerDiv.className = "wfm-batch-group-header";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        const selCount = _getGroupSelCount(name);
        cb.checked = members.length > 0 && selCount === members.length;
        cb.indeterminate = selCount > 0 && selCount < members.length;

        const toggle = document.createElement("span");
        toggle.className = "wfm-ckpt-folder-toggle";
        toggle.textContent = "▶";

        const nameSpan = document.createElement("span");
        nameSpan.className = "wfm-batch-group-name";
        nameSpan.textContent = name;

        const countSpan = document.createElement("span");
        countSpan.className = "wfm-batch-group-count";
        countSpan.textContent = `${selCount}/${members.length}`;

        const memberDiv = document.createElement("div");
        memberDiv.className = "wfm-batch-group-members";

        for (const m of members) {
            const label = document.createElement("label");
            label.className = "wfm-ckpt-item wfm-ckpt-item--indented";

            const fileCb = document.createElement("input");
            fileCb.type = "checkbox";
            fileCb.value = m;
            // 選択状態: グループ全体選択 or 部分選択に含まれる
            fileCb.checked = _batchGroupState.selectedGroups.has(name)
                || !!(_batchGroupState.partialSelections[name]?.has(m));

            const fileName = m.replace(/\\/g, "/").split("/").pop();
            const fileSpan = document.createElement("span");
            fileSpan.className = "wfm-ckpt-item-label";
            fileSpan.textContent = fileName;
            fileSpan.title = m;

            fileCb.addEventListener("change", () => {
                if (_batchGroupState.selectedGroups.has(name)) {
                    // グループ全体選択中に1つ外す → 部分選択に移行
                    _batchGroupState.selectedGroups.delete(name);
                    const partial = new Set(members);
                    partial.delete(m);
                    if (partial.size > 0) _batchGroupState.partialSelections[name] = partial;
                } else {
                    if (!_batchGroupState.partialSelections[name]) {
                        _batchGroupState.partialSelections[name] = new Set();
                    }
                    if (fileCb.checked) _batchGroupState.partialSelections[name].add(m);
                    else _batchGroupState.partialSelections[name].delete(m);
                    // 全員選択 → selectedGroups に昇格
                    if (members.every((x) => _batchGroupState.partialSelections[name].has(x))) {
                        _batchGroupState.selectedGroups.add(name);
                        delete _batchGroupState.partialSelections[name];
                    }
                    // 空になった → partial削除
                    if (_batchGroupState.partialSelections[name]?.size === 0) {
                        delete _batchGroupState.partialSelections[name];
                    }
                }
                const sc = _getGroupSelCount(name);
                cb.checked = sc === members.length && members.length > 0;
                cb.indeterminate = sc > 0 && sc < members.length;
                countSpan.textContent = `${sc}/${members.length}`;
                _renderBatchPreview();
            });

            label.appendChild(fileCb);
            label.appendChild(fileSpan);
            memberDiv.appendChild(label);
        }

        cb.addEventListener("change", () => {
            if (cb.checked) {
                _batchGroupState.selectedGroups.add(name);
                delete _batchGroupState.partialSelections[name];
            } else {
                _batchGroupState.selectedGroups.delete(name);
                delete _batchGroupState.partialSelections[name];
            }
            memberDiv.querySelectorAll("input[type=checkbox]").forEach((c) => { c.checked = cb.checked; });
            countSpan.textContent = `${cb.checked ? members.length : 0}/${members.length}`;
            _renderBatchPreview();
        });

        [toggle, nameSpan].forEach((el) => {
            el.addEventListener("click", () => groupDiv.classList.toggle("open"));
        });

        headerDiv.appendChild(cb);
        headerDiv.appendChild(toggle);
        headerDiv.appendChild(nameSpan);
        headerDiv.appendChild(countSpan);
        groupDiv.appendChild(headerDiv);
        groupDiv.appendChild(memberDiv);
        el.appendChild(groupDiv);
    }
}

// ============================================
// 汎用グループリストレンダリング
// displayFn: (memberValue) => 表示文字列
// ============================================
function _renderAnyGroupList(listEl, groupsData, selectedGroups, partialSelections, displayFn, onPreviewChange) {
    if (!listEl) return;
    const names = Object.keys(groupsData).sort();
    if (names.length === 0) {
        listEl.innerHTML = `<p class="wfm-placeholder" style="font-size:12px;padding:16px;">No groups defined.</p>`;
        return;
    }
    listEl.innerHTML = "";
    for (const name of names) {
        const members = groupsData[name] || [];
        const groupDiv = document.createElement("div");
        groupDiv.className = "wfm-batch-group-item open";

        const headerDiv = document.createElement("div");
        headerDiv.className = "wfm-batch-group-header";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        const getSelCount = () => _getGroupSelCountFrom(name, groupsData, selectedGroups, partialSelections);
        let selCount = getSelCount();
        cb.checked = members.length > 0 && selCount === members.length;
        cb.indeterminate = selCount > 0 && selCount < members.length;

        const toggle = document.createElement("span");
        toggle.className = "wfm-ckpt-folder-toggle";
        toggle.textContent = "▶";

        const nameSpan = document.createElement("span");
        nameSpan.className = "wfm-batch-group-name";
        nameSpan.textContent = name;

        const countSpan = document.createElement("span");
        countSpan.className = "wfm-batch-group-count";
        countSpan.textContent = `${selCount}/${members.length}`;

        const memberDiv = document.createElement("div");
        memberDiv.className = "wfm-batch-group-members";

        for (const m of members) {
            const label = document.createElement("label");
            label.className = "wfm-ckpt-item wfm-ckpt-item--indented";

            const fileCb = document.createElement("input");
            fileCb.type = "checkbox";
            fileCb.value = m;
            fileCb.checked = selectedGroups.has(name) || !!(partialSelections[name]?.has(m));

            const fileSpan = document.createElement("span");
            fileSpan.className = "wfm-ckpt-item-label";
            fileSpan.textContent = displayFn(m);
            fileSpan.title = m;

            fileCb.addEventListener("change", () => {
                if (selectedGroups.has(name)) {
                    selectedGroups.delete(name);
                    const partial = new Set(members);
                    partial.delete(m);
                    if (partial.size > 0) partialSelections[name] = partial;
                } else {
                    if (!partialSelections[name]) partialSelections[name] = new Set();
                    if (fileCb.checked) partialSelections[name].add(m);
                    else partialSelections[name].delete(m);
                    if (members.every((x) => partialSelections[name].has(x))) {
                        selectedGroups.add(name);
                        delete partialSelections[name];
                    }
                    if (partialSelections[name]?.size === 0) delete partialSelections[name];
                }
                const sc = getSelCount();
                cb.checked = sc === members.length && members.length > 0;
                cb.indeterminate = sc > 0 && sc < members.length;
                countSpan.textContent = `${sc}/${members.length}`;
                onPreviewChange();
            });

            label.appendChild(fileCb);
            label.appendChild(fileSpan);
            memberDiv.appendChild(label);
        }

        cb.addEventListener("change", () => {
            if (cb.checked) {
                selectedGroups.add(name);
                delete partialSelections[name];
            } else {
                selectedGroups.delete(name);
                delete partialSelections[name];
            }
            memberDiv.querySelectorAll("input[type=checkbox]").forEach((c) => { c.checked = cb.checked; });
            countSpan.textContent = `${cb.checked ? members.length : 0}/${members.length}`;
            onPreviewChange();
        });

        [toggle, nameSpan].forEach((el) => {
            el.addEventListener("click", () => groupDiv.classList.toggle("open"));
        });

        headerDiv.appendChild(cb);
        headerDiv.appendChild(toggle);
        headerDiv.appendChild(nameSpan);
        headerDiv.appendChild(countSpan);
        groupDiv.appendChild(headerDiv);
        groupDiv.appendChild(memberDiv);
        listEl.appendChild(groupDiv);
    }
}

// ============================================
// Lora グループ
// ============================================
async function _loadBatchLoraGroups() {
    try {
        const res = await fetch("/api/wfm/models/groups?type=lora");
        if (res.ok) {
            const raw = await res.json();
            // Normalize backslashes (Windows ComfyUI paths) to forward slashes
            const normalized = {};
            for (const [g, members] of Object.entries(raw)) {
                normalized[g] = members.map((m) => m.replace(/\\/g, "/"));
            }
            _batchGroupState.loraGroups = normalized;
        } else { _batchGroupState.loraGroups = {}; }
    } catch { _batchGroupState.loraGroups = {}; }

    const currentNames = new Set(Object.keys(_batchGroupState.loraGroups));
    for (const name of _batchGroupState.loraSelectedGroups) {
        if (!currentNames.has(name)) _batchGroupState.loraSelectedGroups.delete(name);
    }
    for (const name of Object.keys(_batchGroupState.loraPartialSelections)) {
        if (!currentNames.has(name)) delete _batchGroupState.loraPartialSelections[name];
    }

    _renderBatchLoraGroupList();
    _renderBatchPreview();
}

function _renderBatchLoraGroupList() {
    const el = document.getElementById("wfm-batch-lora-group-list");
    _renderAnyGroupList(
        el,
        _batchGroupState.loraGroups,
        _batchGroupState.loraSelectedGroups,
        _batchGroupState.loraPartialSelections,
        (m) => m.replace(/\\/g, "/").split("/").pop(),
        _renderBatchPreview
    );
}

// ============================================
// Prompt グループ
// ============================================
async function _loadPromptGroupsForBatch() {
    try {
        const res = await fetch("/api/wfm/prompts");
        _batchGroupState.promptPresets = res.ok ? await res.json() : [];
    } catch { _batchGroupState.promptPresets = []; }
    _batchGroupState.promptGroups = readJsonStorage("wfm_prompt_preset_groups");

    const validIds = new Set(_batchGroupState.promptPresets.map((p) => p.id));
    for (const g of Object.keys(_batchGroupState.promptGroups)) {
        _batchGroupState.promptGroups[g] = (_batchGroupState.promptGroups[g] || []).filter((id) => validIds.has(id));
    }

    const currentNames = new Set(Object.keys(_batchGroupState.promptGroups));
    for (const name of _batchGroupState.promptSelectedGroups) {
        if (!currentNames.has(name)) _batchGroupState.promptSelectedGroups.delete(name);
    }
    for (const name of Object.keys(_batchGroupState.promptPartialSelections)) {
        if (!currentNames.has(name)) delete _batchGroupState.promptPartialSelections[name];
    }

    _renderBatchPromptGroupList();
    _renderBatchPreview();
}

function _renderBatchPromptGroupList() {
    const el = document.getElementById("wfm-batch-prompt-group-list");
    const presetsMap = new Map(_batchGroupState.promptPresets.map((p) => [p.id, p]));
    _renderAnyGroupList(
        el,
        _batchGroupState.promptGroups,
        _batchGroupState.promptSelectedGroups,
        _batchGroupState.promptPartialSelections,
        (id) => presetsMap.get(id)?.name || id,
        _renderBatchPreview
    );
}

// ============================================
// Workflow グループ
// ============================================
function _loadWorkflowGroupsForBatch() {
    _batchGroupState.wfGroups = readJsonStorage("wfm_groups");

    const currentNames = new Set(Object.keys(_batchGroupState.wfGroups));
    for (const name of _batchGroupState.wfSelectedGroups) {
        if (!currentNames.has(name)) _batchGroupState.wfSelectedGroups.delete(name);
    }
    for (const name of Object.keys(_batchGroupState.wfPartialSelections)) {
        if (!currentNames.has(name)) delete _batchGroupState.wfPartialSelections[name];
    }

    _renderBatchWfGroupList();
    _renderBatchPreview();
}

function _renderBatchWfGroupList() {
    const el = document.getElementById("wfm-batch-wf-group-list");
    _renderAnyGroupList(
        el,
        _batchGroupState.wfGroups,
        _batchGroupState.wfSelectedGroups,
        _batchGroupState.wfPartialSelections,
        (f) => f.replace(/\.json$/i, "").replace(/\\/g, "/").split("/").pop(),
        _renderBatchPreview
    );
}

// ============================================
// Sampler / Scheduler リスト
// ============================================
function _buildSimpleGroupList(listEl, items, selectedSet, emptyMsg) {
    if (!listEl) return;
    if (items.length === 0) {
        listEl.innerHTML = `<div style="padding:8px 10px;font-size:11px;color:var(--wfm-text-secondary);">${emptyMsg}</div>`;
        return;
    }
    listEl.innerHTML = "";

    const group = document.createElement("div");
    group.className = "wfm-ckpt-folder-group open";

    const header = document.createElement("div");
    header.className = "wfm-ckpt-folder-header";

    const folderCb = document.createElement("input");
    folderCb.type = "checkbox";
    const selCount = () => items.filter((x) => selectedSet.has(x)).length;
    const updateFolderCb = () => {
        const n = selCount();
        folderCb.checked = items.length > 0 && n === items.length;
        folderCb.indeterminate = n > 0 && n < items.length;
    };
    updateFolderCb();

    const toggle = document.createElement("span");
    toggle.className = "wfm-ckpt-folder-toggle";
    toggle.textContent = "▶";

    const nameSpan = document.createElement("span");
    nameSpan.className = "wfm-ckpt-folder-name";
    nameSpan.textContent = "(root)";

    const countSpan = document.createElement("span");
    countSpan.className = "wfm-ckpt-folder-count";
    countSpan.textContent = items.length;

    const filesDiv = document.createElement("div");
    filesDiv.className = "wfm-ckpt-folder-files";

    for (const s of items) {
        const label = document.createElement("label");
        label.className = "wfm-ckpt-item wfm-ckpt-item--indented";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = s;
        cb.checked = selectedSet.has(s);
        cb.addEventListener("change", () => {
            if (cb.checked) selectedSet.add(s);
            else selectedSet.delete(s);
            updateFolderCb();
            _renderBatchPreview();
        });
        const span = document.createElement("span");
        span.className = "wfm-ckpt-item-label";
        span.textContent = s;
        label.appendChild(cb);
        label.appendChild(span);
        filesDiv.appendChild(label);
    }

    folderCb.addEventListener("change", () => {
        folderCb.indeterminate = false;
        items.forEach((s) => { if (folderCb.checked) selectedSet.add(s); else selectedSet.delete(s); });
        filesDiv.querySelectorAll("input[type=checkbox]").forEach((c) => { c.checked = folderCb.checked; });
        _renderBatchPreview();
    });

    [toggle, nameSpan].forEach((el) => {
        el.addEventListener("click", () => group.classList.toggle("open"));
    });

    header.appendChild(folderCb);
    header.appendChild(toggle);
    header.appendChild(nameSpan);
    header.appendChild(countSpan);
    group.appendChild(header);
    group.appendChild(filesDiv);
    listEl.appendChild(group);
}

function _rebuildSamplerList() {
    _buildSimpleGroupList(
        document.getElementById("wfm-sampler-list"),
        comfyEditor.models.samplers || [],
        _samplerSelected,
        "No samplers (connect to ComfyUI first)"
    );
}

function _rebuildSchedulerList() {
    _buildSimpleGroupList(
        document.getElementById("wfm-scheduler-list"),
        comfyEditor.models.schedulers || [],
        _schedulerSelected,
        "No schedulers (connect to ComfyUI first)"
    );
}

function initBatchTab() {
    // 左ペイン タブ切り替え
    document.querySelectorAll(".wfm-batch-left-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-batch-left-tab").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            const tabId = btn.dataset.leftTab;
            document.querySelectorAll(".wfm-batch-left-content").forEach((c) => c.classList.remove("active"));
            document.getElementById(`wfm-batch-left-${tabId}`)?.classList.add("active");
            if (tabId === "sampler") _rebuildSamplerList();
            else if (tabId === "scheduler") _rebuildSchedulerList();
            else if (tabId === "style") _rebuildStyleList();
        });
    });

    // 中央ペイン 内部タブ切り替え
    document.querySelectorAll(".wfm-batch-inner-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".wfm-batch-inner-tab").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            const tabId = btn.dataset.batchInner;
            document.querySelectorAll(".wfm-batch-inner-content").forEach((c) => c.classList.remove("active"));
            document.getElementById(`wfm-batch-inner-${tabId}`)?.classList.add("active");
            if (tabId === "checkpoint") _loadBatchCheckpointGroups();
            else if (tabId === "lora") _loadBatchLoraGroups();
            else if (tabId === "prompt") _loadPromptGroupsForBatch();
            else if (tabId === "workflow") _loadWorkflowGroupsForBatch();
        });
    });

    // 検索フィルター（左ペイン Checkpoint）
    document.getElementById("wfm-ckpt-search")?.addEventListener("input", _rebuildCkptList);

    // 全選択 / 全解除（左ペイン Checkpoint）
    document.getElementById("wfm-ckpt-select-all")?.addEventListener("click", () => {
        _ckptState.mode = "all";
        _ckptState.selected.clear();
        _rebuildCkptList();
        _renderBatchPreview();
    });
    document.getElementById("wfm-ckpt-deselect-all")?.addEventListener("click", () => {
        _ckptState.mode = "none";
        _ckptState.selected.clear();
        _rebuildCkptList();
        _renderBatchPreview();
    });

    // 全選択 / 全解除（左ペイン Sampler）
    document.getElementById("wfm-sampler-select-all")?.addEventListener("click", () => {
        (comfyEditor.models.samplers || []).forEach((s) => _samplerSelected.add(s));
        _rebuildSamplerList();
        _renderBatchPreview();
    });
    document.getElementById("wfm-sampler-deselect-all")?.addEventListener("click", () => {
        _samplerSelected.clear();
        _rebuildSamplerList();
        _renderBatchPreview();
    });

    // 全選択 / 全解除（左ペイン Scheduler）
    document.getElementById("wfm-scheduler-select-all")?.addEventListener("click", () => {
        (comfyEditor.models.schedulers || []).forEach((s) => _schedulerSelected.add(s));
        _rebuildSchedulerList();
        _renderBatchPreview();
    });
    document.getElementById("wfm-scheduler-deselect-all")?.addEventListener("click", () => {
        _schedulerSelected.clear();
        _rebuildSchedulerList();
        _renderBatchPreview();
    });

    // 全選択 / 全解除（左ペイン Style）
    document.getElementById("wfm-style-batch-select-all")?.addEventListener("click", () => {
        _stylesData.forEach((s) => _batchStyleSelected.add(s.name));
        _rebuildStyleList();
        _renderBatchPreview();
    });
    document.getElementById("wfm-style-batch-deselect-all")?.addEventListener("click", () => {
        _batchStyleSelected.clear();
        _rebuildStyleList();
        _renderBatchPreview();
    });

    // Batch タブが表示されたときに全グループを読み込む
    document.querySelector('[data-subtab="batch"]')?.addEventListener("click", () => {
        _rebuildCkptList();
        _loadBatchCheckpointGroups();
        _loadBatchLoraGroups();
        _loadPromptGroupsForBatch();
        _loadWorkflowGroupsForBatch();
        _rebuildStyleList();
        _renderBatchPreview();
    });
}

function initCheckpointBatch() {
    // Batch type checkboxes — radio behavior (only one at a time)
    document.querySelectorAll(".wfm-batch-type-cb").forEach((cb) => {
        cb.addEventListener("change", () => {
            if (cb.checked) {
                _activeBatchType = cb.dataset.batchType;
                document.querySelectorAll(".wfm-batch-type-cb").forEach((other) => {
                    if (other !== cb) other.checked = false;
                });
            } else {
                _activeBatchType = null;
            }
            _updateBatchTypeLabel();
        });
    });

    // Pause / Resume
    document.getElementById("wfm-ckpt-batch-pause-btn")?.addEventListener("click", () => {
        if (!_ckptBatch.paused) {
            _ckptBatch.paused = true;
            _setPauseBtnState(true);
        } else {
            _ckptBatch.paused = false;
            _setPauseBtnState(false);
            if (_ckptBatch._resumeResolve) {
                _ckptBatch._resumeResolve();
                _ckptBatch._resumeResolve = null;
            }
        }
    });
}

// ============================================
// Style (Fooocus-style JSON from DATA_DIR/style/)
// ============================================

let _stylesData = [];
const _batchStyleSelected = new Set();
let _batchStyleOverride = null; // Style バッチ実行中に一時的にセット

async function _loadStyles() {
    try {
        const res = await fetch("/api/wfm/styles");
        if (res.ok) _stylesData = await res.json();
        else _stylesData = [];
    } catch { _stylesData = []; }
    _renderStyleDropdown();
    _rebuildStyleList();
}

function _renderStyleDropdown() {
    const sel = document.getElementById("wfm-style-select");
    if (!sel) return;
    sel.innerHTML = "";
    if (_stylesData.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No styles";
        sel.appendChild(opt);
        return;
    }
    for (const s of _stylesData) {
        const opt = document.createElement("option");
        opt.value = s.name;
        opt.textContent = s.name;
        sel.appendChild(opt);
    }
}

function _rebuildStyleList() {
    _buildSimpleGroupList(
        document.getElementById("wfm-batch-style-list"),
        _stylesData.map((s) => s.name),
        _batchStyleSelected,
        "No styles (place JSON files in Workflow-Studio/style/)"
    );
}

function _applyNamedStyle(workflow, style) {
    if (!style) return workflow;
    const analysis = comfyUI.currentAnalysis;
    if (!analysis) return workflow;

    const positiveNodes = (analysis.prompt_nodes || []).filter((n) => n.role === "positive");
    const negativeNodes = (analysis.prompt_nodes || []).filter((n) => n.role === "negative");

    const result = JSON.parse(JSON.stringify(workflow));

    if (style.prompt) {
        for (const node of positiveNodes) {
            const nodeData = result[node.id];
            if (!nodeData) continue;
            const key = node.textKey || "text";
            const original = nodeData.inputs[key] || "";
            nodeData.inputs[key] = style.prompt.includes("{prompt}")
                ? style.prompt.replace("{prompt}", original)
                : original ? `${original}, ${style.prompt}` : style.prompt;
        }
    }

    if (style.negative_prompt) {
        for (const node of negativeNodes) {
            const nodeData = result[node.id];
            if (!nodeData) continue;
            const key = node.textKey || "text";
            const original = nodeData.inputs[key] || "";
            nodeData.inputs[key] = original
                ? `${original}, ${style.negative_prompt}`
                : style.negative_prompt;
        }
    }

    return result;
}

function _applyStyleToWorkflow(workflow) {
    // バッチ実行中は上書きスタイルを優先
    if (_batchStyleOverride !== null) return _applyNamedStyle(workflow, _batchStyleOverride);

    const enabled = document.getElementById("wfm-style-enabled")?.checked;
    if (!enabled) return workflow;
    const selectedName = document.getElementById("wfm-style-select")?.value;
    if (!selectedName) return workflow;
    const style = _stylesData.find((s) => s.name === selectedName);
    return _applyNamedStyle(workflow, style || null);
}

// ============================================
// SPA-side wildcard expansion (A1111-style __name__ syntax)
// Applies to non-ImpactWildcard nodes only; ImpactWildcard* nodes expand server-side.
// ============================================

const _wcLineCache = new Map(); // filename → string[] | null

async function _fetchWildcardLines(name) {
    if (_wcLineCache.has(name)) return _wcLineCache.get(name);
    try {
        const res = await fetch(`/api/wfm/wildcards/content?filename=${encodeURIComponent(name + ".txt")}`);
        if (!res.ok) { _wcLineCache.set(name, null); return null; }
        const data = await res.json();
        const lines = (data.content || "")
            .split("\n")
            .map(l => l.trim())
            .filter(l => l && !l.startsWith("#"));
        const result = lines.length > 0 ? lines : null;
        _wcLineCache.set(name, result);
        return result;
    } catch {
        _wcLineCache.set(name, null);
        return null;
    }
}

async function _expandWildcardText(text) {
    for (let pass = 0; pass < 5; pass++) {
        const matches = [...text.matchAll(/__([^_\s][^_]*)__/g)];
        if (matches.length === 0) break;
        let changed = false;
        let offset = 0;
        let result = text;
        for (const match of matches) {
            const lines = await _fetchWildcardLines(match[1]);
            if (lines) {
                const replacement = lines[Math.floor(Math.random() * lines.length)];
                const pos = match.index + offset;
                result = result.slice(0, pos) + replacement + result.slice(pos + match[0].length);
                offset += replacement.length - match[0].length;
                changed = true;
            }
        }
        if (!changed) break;
        text = result;
    }
    return text;
}

const _IMPACT_WC_TYPES = new Set(["ImpactWildcardEncode", "ImpactWildcardProcessor"]);

async function _expandWildcardsInWorkflow(workflow) {
    let hasWildcard = false;
    outer: for (const node of Object.values(workflow)) {
        if (_IMPACT_WC_TYPES.has(node.class_type)) continue;
        for (const val of Object.values(node.inputs || {})) {
            if (typeof val === "string" && /__[^_\s][^_]*__/.test(val)) {
                hasWildcard = true;
                break outer;
            }
        }
    }
    if (!hasWildcard) return workflow;

    const expanded = JSON.parse(JSON.stringify(workflow));
    for (const node of Object.values(expanded)) {
        if (_IMPACT_WC_TYPES.has(node.class_type)) continue;
        for (const [key, val] of Object.entries(node.inputs || {})) {
            if (typeof val === "string" && /__[^_\s][^_]*__/.test(val)) {
                node.inputs[key] = await _expandWildcardText(val);
            }
        }
    }
    return expanded;
}

// ============================================
// Generation (core — throws on error)
// ============================================

async function _coreGenerate(silent = false) {
    const progressBar = document.getElementById("wfm-gen-progress-bar");
    const progressText = document.getElementById("wfm-gen-progress-text");
    const resultImg = document.getElementById("wfm-gen-result-img");
    const resultThumbs = document.getElementById("wfm-gen-result-thumbs");

    const seedMode = document.getElementById("wfm-gen-seed-mode")?.value || "random";
    const seedValue = parseInt(document.getElementById("wfm-gen-seed-value")?.value) || -1;

    if (progressBar) progressBar.style.width = "0%";
    if (progressText) progressText.textContent = "Starting...";

    const workflowExpanded = await _expandWildcardsInWorkflow({ ...comfyUI.currentWorkflow });
    const workflowForGenerate = _applyStyleToWorkflow(workflowExpanded);
    const { images, seed } = await comfyUI.generate(
        workflowForGenerate,
        {
            seedMode,
            seedValue,
            onProgress: (pct) => {
                if (progressBar) progressBar.style.width = `${(pct * 100).toFixed(1)}%`;
                if (progressText) progressText.textContent = `${(pct * 100).toFixed(0)}%`;
            },
        }
    );

    const seedEl = document.getElementById("wfm-gen-seed-value");
    if (seedEl) seedEl.value = seed;

    if (progressText) progressText.textContent = `Done (${images.length} image${images.length !== 1 ? "s" : ""})`;
    if (progressBar) progressBar.style.width = "100%";

    if (images.length > 0) {
        const blob = await comfyUI.getImageBlob(images[0]);
        const url = URL.createObjectURL(blob);
        if (resultImg) {
            resultImg.src = url;
            resultImg.style.display = "block";
        }

        if (resultThumbs && images.length > 1) {
            resultThumbs.innerHTML = "";
            for (let i = 0; i < images.length; i++) {
                const b = i === 0 ? blob : await comfyUI.getImageBlob(images[i]);
                const u = i === 0 ? url : URL.createObjectURL(b);
                const thumb = document.createElement("img");
                thumb.src = u;
                thumb.className = `wfm-gen-thumb ${i === 0 ? "active" : ""}`;
                thumb.addEventListener("click", () => {
                    resultImg.src = u;
                    resultThumbs.querySelectorAll(".wfm-gen-thumb").forEach((t) => t.classList.remove("active"));
                    thumb.classList.add("active");
                });
                resultThumbs.appendChild(thumb);
            }
        }
    }

    if (getEagleSettings().autoSave && images.length > 0) {
        for (const img of images) {
            const viewUrl = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${encodeURIComponent(img.type || "output")}`;
            saveToEagle(viewUrl, img.filename);
        }
    }

    if (images.length > 0) {
        saveGeneratedImagesMeta(images, { ...comfyUI.currentWorkflow }).catch(() => {});
    }

    if (!silent) showToast(t("generationComplete"), "success");
}

// ============================================
// Batch generation loop
// ============================================

// 汎用バッチループ: items を順に applyFn(item) → _coreGenerate() で処理する
async function _runBatchLoop(items, applyFn, labelFn = (x) => String(x)) {
    const batchProgress   = document.getElementById("wfm-ckpt-batch-progress");
    const batchCurrentName = document.getElementById("wfm-ckpt-batch-current-name");
    const batchCount      = document.getElementById("wfm-ckpt-batch-count");
    const batchBar        = document.getElementById("wfm-ckpt-batch-bar");
    const progressText    = document.getElementById("wfm-gen-progress-text");
    const pauseBtn        = document.getElementById("wfm-ckpt-batch-pause-btn");

    if (batchProgress) batchProgress.style.display = "block";
    if (pauseBtn) { pauseBtn.style.display = "block"; pauseBtn.disabled = false; }
    _setPauseBtnState(false);
    _updateBatchTypeLabel(true);

    let completed = 0, failed = 0;

    try {
        for (let i = 0; i < items.length; i++) {
            if (_ckptBatch.aborted) break;

            if (_ckptBatch.paused) {
                if (batchCurrentName) batchCurrentName.textContent = "Paused...";
                if (progressText) progressText.textContent = "Paused";
            }
            await _waitIfPaused();
            if (_ckptBatch.aborted) break;

            const item = items[i];
            const label = labelFn(item);
            if (batchCurrentName) batchCurrentName.textContent = label;
            if (batchCount) batchCount.textContent = `${i + 1} / ${items.length}`;
            if (batchBar) batchBar.style.width = `${((i / items.length) * 100).toFixed(1)}%`;
            if (progressText) progressText.textContent = `[${i + 1}/${items.length}] Loading...`;

            try {
                await applyFn(item);
                await _coreGenerate(true);
                completed++;
            } catch (err) {
                if (_ckptBatch.aborted) break;
                failed++;
                showToast(t("batchItemFailed", i + 1, items.length, err.message), "error");
            }
        }
    } finally {
        if (pauseBtn) pauseBtn.disabled = true;
        _ckptBatch.paused = false;
        if (_ckptBatch._resumeResolve) {
            _ckptBatch._resumeResolve();
            _ckptBatch._resumeResolve = null;
        }
        _setPauseBtnState(false);
        _updateBatchTypeLabel(false);
    }

    if (batchBar) batchBar.style.width = "100%";
    if (batchCurrentName) batchCurrentName.textContent = _ckptBatch.aborted ? "Stopped" : "Done";

    if (_ckptBatch.aborted) {
        showToast(t("batchStopped", completed, failed), "info");
    } else {
        showToast(t("batchComplete", completed, items.length, failed), failed > 0 ? "error" : "success");
    }
}

// アクティブなバッチタイプに応じてバッチを実行するディスパッチャ
async function _runBatchGenerate() {
    switch (_activeBatchType) {
        case "checkpoint": {
            const ckptNodes = comfyUI.currentAnalysis?.checkpoint_nodes || [];
            if (ckptNodes.length === 0) { showToast(t("modelsGenUINoNode", "checkpoint"), "error"); return; }
            const list = _getSelectedCheckpoints();
            if (list.length === 0) { showToast(t("batchNoneSelected", "checkpoints"), "error"); return; }
            await _runBatchLoop(list, (model) => {
                for (const node of ckptNodes) {
                    if (comfyUI.currentWorkflow?.[node.id])
                        comfyUI.currentWorkflow[node.id].inputs.ckpt_name = model;
                }
            });
            break;
        }
        case "lora": {
            const loraNodes = comfyUI.currentAnalysis?.lora_nodes || [];
            if (loraNodes.length === 0) { showToast(t("modelsGenUINoNode", "LoRA"), "error"); return; }
            const list = [..._getSelectedLoraGroupItems()];
            if (list.length === 0) { showToast(t("batchNoneSelected", "LoRAs"), "error"); return; }
            await _runBatchLoop(list, (loraName) => {
                for (const node of loraNodes) {
                    if (!comfyUI.currentWorkflow?.[node.id]) continue;
                    if (node.is_lora_manager) {
                        const stem = loraName.replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");
                        comfyUI.currentWorkflow[node.id].inputs.loras = {
                            __value__: [{ name: stem, strength: 1.0, active: true, expanded: false, clipStrength: 1.0, locked: false }],
                        };
                        comfyUI.currentWorkflow[node.id].inputs.text = `<lora:${stem}:1:1>`;
                    } else {
                        comfyUI.currentWorkflow[node.id].inputs.lora_name = loraName;
                    }
                }
            }, (name) => name.replace(/\.[^.]+$/, ""));
            break;
        }
        case "prompt": {
            const positiveNodes = (comfyUI.currentAnalysis?.prompt_nodes || []).filter((n) => n.role === "positive");
            const negativeNodes = (comfyUI.currentAnalysis?.prompt_nodes || []).filter((n) => n.role === "negative");
            if (positiveNodes.length === 0 && negativeNodes.length === 0) {
                showToast(t("modelsGenUINoNode", "prompt"), "error"); return;
            }
            // _getSelectedPromptGroupItems() はすでにプリセットオブジェクトの配列を返す
            const list = _getSelectedPromptGroupItems();
            if (list.length === 0) { showToast(t("batchNoneSelected", "prompts"), "error"); return; }
            await _runBatchLoop(list, (preset) => {
                for (const node of positiveNodes) {
                    if (comfyUI.currentWorkflow?.[node.id])
                        comfyUI.currentWorkflow[node.id].inputs[node.textKey || "text"] = preset.text || "";
                }
                for (const node of negativeNodes) {
                    if (comfyUI.currentWorkflow?.[node.id])
                        comfyUI.currentWorkflow[node.id].inputs[node.textKey || "text"] = preset.negText || "";
                }
            }, (preset) => preset.name || preset.id);
            break;
        }
        case "workflow": {
            const list = [..._getSelectedWfGroupItems()];
            if (list.length === 0) { showToast(t("batchNoneSelected", "workflows"), "error"); return; }
            const savedWorkflow = comfyUI.currentWorkflow ? JSON.stringify(comfyUI.currentWorkflow) : null;
            const savedFilename = document.getElementById("wfm-gen-workflow-name")?.textContent || "";
            try {
                await _runBatchLoop(list, async (filename) => {
                    const resp = await fetch(`/api/wfm/workflows/raw?filename=${encodeURIComponent(filename)}`);
                    if (!resp.ok) throw new Error(`Failed to load: ${filename}`);
                    const data = await resp.json();
                    await loadWorkflowIntoEditor(data, filename);
                }, (filename) => filename.replace(/\.json$/, ""));
            } finally {
                if (savedWorkflow) {
                    try { await loadWorkflowIntoEditor(JSON.parse(savedWorkflow), savedFilename); } catch {}
                }
            }
            break;
        }
        case "sampler": {
            const samplerNodes = comfyUI.currentAnalysis?.sampler_nodes || [];
            if (samplerNodes.length === 0) { showToast(t("modelsGenUINoNode", "KSampler"), "error"); return; }
            const list = [..._samplerSelected].sort();
            if (list.length === 0) { showToast(t("batchNoneSelected", "samplers"), "error"); return; }
            await _runBatchLoop(list, (samplerName) => {
                for (const node of samplerNodes) {
                    if (comfyUI.currentWorkflow?.[node.id])
                        comfyUI.currentWorkflow[node.id].inputs.sampler_name = samplerName;
                }
            });
            break;
        }
        case "scheduler": {
            const samplerNodes = comfyUI.currentAnalysis?.sampler_nodes || [];
            if (samplerNodes.length === 0) { showToast(t("modelsGenUINoNode", "KSampler"), "error"); return; }
            const list = [..._schedulerSelected].sort();
            if (list.length === 0) { showToast(t("batchNoneSelected", "schedulers"), "error"); return; }
            await _runBatchLoop(list, (schedulerName) => {
                for (const node of samplerNodes) {
                    if (comfyUI.currentWorkflow?.[node.id])
                        comfyUI.currentWorkflow[node.id].inputs.scheduler = schedulerName;
                }
            });
            break;
        }
        case "style": {
            const list = _stylesData.filter((s) => _batchStyleSelected.has(s.name));
            if (list.length === 0) { showToast(t("batchNoneSelected", "styles"), "error"); return; }
            try {
                await _runBatchLoop(list, (style) => {
                    _batchStyleOverride = style;
                }, (s) => s.name);
            } finally {
                _batchStyleOverride = null;
            }
            break;
        }
    }
}

// ============================================
// Generate entry point
// ============================================

async function handleGenerate() {
    if (!comfyUI.currentWorkflow) {
        showToast(t("noWorkflowLoaded"), "error");
        return;
    }
    if (comfyUI.generating) return;

    comfyEditor.syncToWorkflow();

    const genBtn = document.getElementById("wfm-gen-generate-btn");
    const interruptBtn = document.getElementById("wfm-gen-interrupt-btn");

    genBtn.disabled = true;
    if (interruptBtn) interruptBtn.style.display = "inline-block";
    _ckptBatch.aborted = false;
    _ckptBatch.paused = false;
    _ckptBatch._resumeResolve = null;

    const batchEnabled = _activeBatchType !== null;

    try {
        if (batchEnabled) {
            await _runBatchGenerate();
        } else {
            try {
                await _coreGenerate(false);
            } catch (err) {
                const progressText = document.getElementById("wfm-gen-progress-text");
                if (progressText) progressText.textContent = "Error";
                showToast(t("generationError", err.message), "error");
            }
        }
    } finally {
        genBtn.disabled = false;
        if (interruptBtn) interruptBtn.style.display = "none";
    }
}

// ============================================
// Initialization
// ============================================

export async function initGenerateTab() {
    // Default to same origin
    comfyUI.updateUrl(window.location.origin);

    // Connect button
    document.getElementById("wfm-gen-connect-btn")?.addEventListener("click", async () => {
        const connected = await comfyUI.checkConnection();
        updateStatus(connected);
        if (connected) {
            await comfyEditor.loadModelLists();
            showToast(t("connectedToComfyUI"), "success");
        } else {
            showToast(t("failedToConnect"), "error");
        }
    });

    // Model refresh
    document.getElementById("wfm-gen-model-refresh-btn")?.addEventListener("click", async () => {
        await comfyEditor.loadModelLists();
        if (comfyUI.currentAnalysis) {
            comfyEditor.renderAll(comfyUI.currentAnalysis, comfyUI.currentWorkflow);
        }
        showToast(t("modelListsRefreshed"), "success");
        _rebuildSamplerList();
        _rebuildSchedulerList();
        _renderBatchPreview();
    });

    // Save workflow button
    document.getElementById("wfm-gen-save-btn")?.addEventListener("click", () => saveCurrentWorkflow());

    document.getElementById("wfm-gen-reset-workflow-btn")?.addEventListener("click", async () => {
        const filename = document.getElementById("wfm-gen-wf-name")?.dataset?.filename;
        if (!filename || !filename.endsWith(".json")) {
            showToast(t("noFileWorkflowLoaded"), "warning");
            return;
        }
        try {
            const resp = await fetch(`/api/wfm/workflows/raw?filename=${encodeURIComponent(filename)}`);
            if (!resp.ok) throw new Error(resp.status);
            const data = await resp.json();
            await loadWorkflowIntoEditor(data, filename);
        } catch (err) {
            showToast(t("resetFailed", err.message), "error");
        }
    });

    // Generate button
    document.getElementById("wfm-gen-generate-btn")?.addEventListener("click", handleGenerate);

    // Alt+Apply from Input/Model/Settings tabs → Apply & Generate
    document.addEventListener("wfm:apply-and-generate", () => handleGenerate());

    // Interrupt button (stops both single generation and batch loop)
    document.getElementById("wfm-gen-interrupt-btn")?.addEventListener("click", async () => {
        _ckptBatch.aborted = true;
        // 一時停止中でもループを抜けられるよう待機を解除
        _ckptBatch.paused = false;
        if (_ckptBatch._resumeResolve) {
            _ckptBatch._resumeResolve();
            _ckptBatch._resumeResolve = null;
        }
        await comfyUI.interrupt();
        showToast(t("interrupted"), "info");
    });

    // Move shared Raw JSON widget into the active tab's rawjson-col
    function moveRawJsonToTab(tabKey) {
        const widget = document.getElementById("wfm-gen-rawjson-widget");
        if (!widget) return;
        if (tabKey === "feeder" || tabKey === "batch") {
            widget.style.display = "none";
            return;
        }
        const col = document.getElementById(`wfm-gen-rawjson-col-${tabKey}`);
        if (col) {
            col.appendChild(widget);
            widget.style.display = "flex";
        }
    }

    // Subtab navigation
    document.querySelectorAll(".wfm-gen-subtab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.subtab;
            document.querySelectorAll(".wfm-gen-subtab-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".wfm-gen-subtab-content").forEach((c) => c.classList.remove("active"));
            document.getElementById(`wfm-gen-subtab-${target}`)?.classList.add("active");
            moveRawJsonToTab(target);
            // Re-render LoRA pane when switching to model tab so Stack group changes are reflected
            if (target === "model" && comfyUI.currentAnalysis) {
                comfyEditor.renderLoraPane(comfyUI.currentAnalysis, "wfm-gen-lora-fields");
            }
        });
    });

    // Stack refresh button in LoRA column header
    document.getElementById("wfm-lora-stack-refresh")?.addEventListener("click", () => {
        if (comfyUI.currentAnalysis) {
            comfyEditor.renderLoraPane(comfyUI.currentAnalysis, "wfm-gen-lora-fields");
        }
    });

    // Input inner tab (Prompt / Image)
    document.querySelectorAll(".wfm-input-inner-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.inputTab;
            document.querySelectorAll(".wfm-input-inner-tab").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".wfm-input-inner-panel").forEach((p) => p.style.display = "none");
            document.getElementById(`wfm-input-panel-${target}`)?.style.setProperty("display", "");
        });
    });

    // Initial placement: move to first active tab (input)
    moveRawJsonToTab("input");

    // Raw JSON apply (always-visible panel in right column)
    document.getElementById("wfm-gen-apply-raw-btn")?.addEventListener("click", async () => {
        const textarea = document.getElementById("wfm-gen-raw-json");
        if (!textarea) return;
        try {
            const wf = JSON.parse(textarea.value);
            await loadWorkflowIntoEditor(wf, "Raw JSON");
        } catch (err) {
            showToast(t("invalidJsonMsg", err.message), "error");
        }
    });

    // Raw JSON highlight sync + search
    {
        const editor = document.getElementById("wfm-gen-raw-json");
        const highlight = document.getElementById("wfm-gen-raw-json-highlight");
        const searchOverlay = document.getElementById("wfm-gen-raw-json-search-overlay");
        const searchInput = document.getElementById("wfm-gen-raw-search");
        const searchCount = document.getElementById("wfm-gen-raw-search-count");
        const searchPrev = document.getElementById("wfm-gen-raw-search-prev");
        const searchNext = document.getElementById("wfm-gen-raw-search-next");
        const searchClear = document.getElementById("wfm-gen-raw-search-clear");

        let currentMatchIndex = 0;
        let matchPositions = [];

        function updateSearchOverlay() {
            if (!editor || !searchOverlay || !searchInput) return;
            const term = searchInput.value;
            if (!term) {
                searchOverlay.innerHTML = "";
                if (searchCount) { searchCount.textContent = ""; searchCount.style.color = ""; }
                matchPositions = [];
                return;
            }

            const text = editor.value;
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(escapedTerm, "gi");

            matchPositions = [];
            let m;
            while ((m = regex.exec(text)) !== null) matchPositions.push(m.index);

            if (matchPositions.length === 0) {
                searchOverlay.innerHTML = "";
                if (searchCount) { searchCount.textContent = "No results"; searchCount.style.color = "#e06c75"; }
                return;
            }

            if (searchCount) searchCount.style.color = "";
            if (currentMatchIndex >= matchPositions.length) currentMatchIndex = 0;
            if (searchCount) searchCount.textContent = `${currentMatchIndex + 1}/${matchPositions.length}`;

            const escapedHtml = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            let matchIdx = 0;
            const html = escapedHtml.replace(new RegExp(escapedTerm, "gi"), (match) => {
                const cls = matchIdx === currentMatchIndex ? "wfm-search-current" : "wfm-search-match";
                matchIdx++;
                return `<mark class="${cls}">${match}</mark>`;
            });
            searchOverlay.innerHTML = html + "\n";

            // Scroll editor to current match
            const pos = matchPositions[currentMatchIndex];
            editor.focus();
            editor.setSelectionRange(pos, pos + term.length);
            const lineNum = (text.slice(0, pos).match(/\n/g) || []).length;
            const lineH = parseFloat(getComputedStyle(editor).lineHeight) || 18;
            editor.scrollTop = Math.max(0, lineH * lineNum - editor.clientHeight / 2);
            searchOverlay.scrollTop = editor.scrollTop;
            searchOverlay.scrollLeft = editor.scrollLeft;
            if (highlight) highlight.scrollTop = editor.scrollTop;
        }

        if (editor && highlight) {
            editor.addEventListener("input", () => {
                syncJsonHighlight(highlight, editor.value);
                if (searchInput?.value) updateSearchOverlay();
            });
            editor.addEventListener("scroll", () => {
                syncScroll(editor, highlight);
                if (searchOverlay) {
                    searchOverlay.scrollTop = editor.scrollTop;
                    searchOverlay.scrollLeft = editor.scrollLeft;
                }
            });
        }

        searchInput?.addEventListener("input", () => { currentMatchIndex = 0; updateSearchOverlay(); });

        searchNext?.addEventListener("click", () => {
            if (!matchPositions.length) return;
            currentMatchIndex = (currentMatchIndex + 1) % matchPositions.length;
            updateSearchOverlay();
        });

        searchPrev?.addEventListener("click", () => {
            if (!matchPositions.length) return;
            currentMatchIndex = (currentMatchIndex - 1 + matchPositions.length) % matchPositions.length;
            updateSearchOverlay();
        });

        function clearSearch() {
            if (searchInput) searchInput.value = "";
            currentMatchIndex = 0;
            matchPositions = [];
            if (searchOverlay) searchOverlay.innerHTML = "";
            if (searchCount) { searchCount.textContent = ""; searchCount.style.color = ""; }
        }

        searchClear?.addEventListener("click", clearSearch);

        searchInput?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                if (!matchPositions.length) return;
                currentMatchIndex = e.shiftKey
                    ? (currentMatchIndex - 1 + matchPositions.length) % matchPositions.length
                    : (currentMatchIndex + 1) % matchPositions.length;
                updateSearchOverlay();
                e.preventDefault();
            } else if (e.key === "Escape") {
                clearSearch();
            }
        });
    }

    // Check for workflow loaded from Workflow tab (via sessionStorage)
    const stored = sessionStorage.getItem("wfm_loaded_workflow");
    if (stored) {
        sessionStorage.removeItem("wfm_loaded_workflow");
        try {
            const { filename, data } = JSON.parse(stored);
            await loadWorkflowIntoEditor(data, filename);
        } catch {}
    }

    // outputDir を事前取得（生成後の保存に使用）
    _fetchOutputDir();
    window.addEventListener("wfm-output-dir-changed", (e) => {
        _outputDir = (e.detail?.path || "").replace(/\\/g, "/").replace(/\/$/, "");
    });

    // Checkpoint batch UI
    initCheckpointBatch();

    // Batch tab
    initBatchTab();

    // Feeder tab
    await initFeederTab();

    // Style dropdown
    await _loadStyles();

    // Auto-connect on init
    const connected = await comfyUI.checkConnection();
    updateStatus(connected);
    if (connected) {
        await comfyEditor.loadModelLists();
        _renderBatchPreview();
    }

    // Auto-load default workflow (doesn't require ComfyUI connection)
    if (!comfyUI.currentWorkflow) {
        try {
            const settings = getSettings();
            if (settings.defaultWorkflow && settings.defaultWorkflowData) {
                await loadWorkflowIntoEditor(settings.defaultWorkflowData, settings.defaultWorkflow);
                console.log("Workflow Studio: Auto-loaded default workflow:", settings.defaultWorkflow);
            }
        } catch {}
    }
}

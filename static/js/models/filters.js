/**
 * Models Tab - Filtering, sorting, and the tag/group/directory filter dropdowns
 */

import { t } from "../i18n.js";
import { escapeHtml } from "../util.js";
import { state } from "./state.js";
import { parseModelPath, getExtension } from "./helpers.js";

export function getCurrentModels() {
    return state.modelsByType[state.activeModelType] || [];
}

export function isModelDisabled(modelName) {
    const s = state.disabledModels[state.activeModelType];
    return s ? s.has(modelName) : false;
}

export function filterModels() {
    let models = getCurrentModels();

    if (state.statusFilter === "enabled") {
        models = models.filter((m) => !isModelDisabled(m));
    } else if (state.statusFilter === "disabled") {
        models = models.filter((m) => isModelDisabled(m));
    }

    if (state.showFavoritesOnly) {
        models = models.filter((m) => {
            const meta = state.modelMetadata[m];
            return meta && meta.favorite;
        });
    }

    if (state.showBatchOnly) {
        const batchMembers = state.modelGroups["Batch"] || [];
        models = models.filter((m) => batchMembers.includes(m));
    }

    if (state.tagFilter) {
        models = models.filter((m) => {
            const meta = state.modelMetadata[m];
            return meta && meta.tags && meta.tags.includes(state.tagFilter);
        });
    }

    if (state.badgeFilter) {
        models = models.filter((m) => {
            const meta = state.modelMetadata[m];
            return meta && meta.badges && meta.badges.includes(state.badgeFilter);
        });
    }

    if (state.dirFilter) {
        models = models.filter((m) => {
            const { dir } = parseModelPath(m);
            return dir === state.dirFilter;
        });
    }

    if (state.groupFilter) {
        const members = state.modelGroups[state.groupFilter] || [];
        models = models.filter((m) => members.includes(m));
    }

    if (state.searchText) {
        const q = state.searchText.toLowerCase();
        models = models.filter((m) => {
            const meta = state.modelMetadata[m];
            const searchable = [m, ...(meta?.tags || []), meta?.memo || ""]
                .join(" ")
                .toLowerCase();
            return searchable.includes(q);
        });
    }

    return sortModels(models);
}

export function sortKeyOf(modelName) {
    const meta = state.modelMetadata[modelName] || {};
    switch (state.sortColumn) {
        case "fav":
            return meta.favorite ? 1 : 0;
        case "filename":
            return parseModelPath(modelName).name.toLowerCase();
        case "subdir":
            return parseModelPath(modelName).dir.toLowerCase();
        case "civtype": {
            const civ = meta.sha256 && state.civitaiCache[meta.sha256];
            return (civ?.type || "").toLowerCase();
        }
        case "basemodel": {
            const civ = meta.sha256 && state.civitaiCache[meta.sha256];
            return (civ?.baseModel || "").toLowerCase();
        }
        case "ext":
            return getExtension(parseModelPath(modelName).name).toLowerCase();
        case "tags":
            return (meta.tags || []).join(", ").toLowerCase();
        case "memo":
            return (meta.memo || "").toLowerCase();
        case "enabled":
            return isModelDisabled(modelName) ? 1 : 0;
        default:
            return 0;
    }
}

export function sortModels(models) {
    if (!state.sortColumn) return models;
    // ソートキーを1モデル1回だけ計算（比較ごとのparseModelPath等の再計算を回避）
    const dir = state.sortDir === "asc" ? 1 : -1;
    return models
        .map((m) => [sortKeyOf(m), m])
        .sort((a, b) => (a[0] < b[0] ? -dir : a[0] > b[0] ? dir : 0))
        .map((pair) => pair[1]);
}

export function getAllTags() {
    const set = new Set();
    const models = getCurrentModels();
    models.forEach((m) => {
        const meta = state.modelMetadata[m];
        if (meta?.tags) meta.tags.forEach((tag) => set.add(tag));
    });
    return [...set].sort();
}

// ── Render: Tag Filter ────────────────────────────────────

export function renderTagFilter() {
    const select = document.getElementById("wfm-models-tag-filter");
    if (!select) return;
    const tags = getAllTags();
    select.innerHTML =
        `<option value="">${t("modelsAllTags")}</option>` +
        tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("");
    select.value = state.tagFilter;
}

export function renderGroupFilter() {
    const select = document.getElementById("wfm-models-group-filter");
    if (!select) return;

    const groups = state.allModelGroups[state.activeModelType] || {};
    const names = Object.keys(groups).sort();

    // 選択中のグループが削除された場合はフィルターをリセット
    if (state.groupFilter && !groups[state.groupFilter]) {
        state.groupFilter = "";
    }

    const currentValue = state.groupFilter
        ? `${state.activeModelType}::${state.groupFilter}`
        : "";

    select.innerHTML =
        `<option value="">${t("modelsAllGroups")}</option>` +
        names.map((name) => {
            const value = `${state.activeModelType}::${name}`;
            const isActive = value === currentValue;
            return `<option value="${escapeHtml(value)}"${isActive ? " selected" : ""}>${escapeHtml(name)}</option>`;
        }).join("");
}

export function renderDirFilter() {
    const select = document.getElementById("wfm-models-dir-filter");
    if (!select) return;
    const dirs = [...new Set(
        getCurrentModels()
            .map((m) => parseModelPath(m).dir)
            .filter((d) => d !== "")
    )].sort();
    select.innerHTML =
        `<option value="">${t("modelsAllDirs")}</option>` +
        dirs.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
    select.value = state.dirFilter;
}

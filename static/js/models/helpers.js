/**
 * Models Tab - Small path/preview helpers shared across the models/* modules
 */

import { state } from "./state.js";

export function parseModelPath(fullName) {
    const lastSlash = Math.max(fullName.lastIndexOf("/"), fullName.lastIndexOf("\\"));
    if (lastSlash === -1) return { dir: "", name: fullName };
    return { dir: fullName.substring(0, lastSlash), name: fullName.substring(lastSlash + 1) };
}

export function getExtension(name) {
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.substring(dot) : "";
}

export function getStem(name) {
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.substring(0, dot) : name;
}

export function previewUrl(modelName, modelType) {
    const type = modelType || state.activeModelType;
    return `/api/wfm/models/preview?type=${encodeURIComponent(type)}&name=${encodeURIComponent(modelName)}`;
}

/**
 * Load preview image. Uses img onload/onerror instead of HEAD request
 * (aiohttp add_get does not auto-handle HEAD method).
 * Falls back to CivitAI cached image if no local preview exists.
 */
export function loadPreviewImage(imgEl, placeholderEl, modelName, modelType) {
    const url = previewUrl(modelName, modelType);
    imgEl.onload = () => {
        imgEl.style.display = "";
        if (placeholderEl) placeholderEl.style.display = "none";
    };
    imgEl.onerror = () => {
        // Fallback: use CivitAI cached image if available
        const meta = state.modelMetadata[modelName] || {};
        const sha256 = meta.sha256;
        const civitai = sha256 && state.civitaiCache[sha256];
        const civitaiImg = civitai && civitai.images && civitai.images[0];
        if (civitaiImg) {
            imgEl.onerror = () => {
                imgEl.style.display = "none";
                if (placeholderEl) placeholderEl.style.display = "";
            };
            imgEl.src = civitaiImg;
            imgEl.style.display = "";
            if (placeholderEl) placeholderEl.style.display = "none";
        } else {
            imgEl.style.display = "none";
            if (placeholderEl) placeholderEl.style.display = "";
        }
    };
    imgEl.src = url;
}

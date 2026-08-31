/**
 * Video Tab - shared state for the two center-panel preview panes:
 * "source" (#wfm-video-source-preview-video — an Asset selection or a
 * locally-dropped file) and "result" (#wfm-video-preview-video — the latest
 * generated clip). video-asset-tab.js (Asset selection), video-plan-tab.js
 * (batch run results) and video-tab.js (the Video Source drop zone, Frame/GIF
 * tools) all need to read or write these. Pulling this into its own module
 * lets all three depend on it without needing to import each other —
 * video-tab.js already imports both of the others for init/refresh, so a
 * reverse import from either back into video-tab.js would create a cycle.
 */

const _PANES = {
    source: { video: "wfm-video-source-preview-video", placeholder: "wfm-video-source-preview-placeholder" },
    result: { video: "wfm-video-preview-video", placeholder: "wfm-video-preview-placeholder" },
};

const _objectUrls = { source: null, result: null };

// Whichever pane most recently received a video is what the Frame/GIF property
// tabs act on (see getActivePreviewSource/getActivePreviewVideoElement below) —
// an Asset selection or Video Source drop activates "source", a batch run
// finishing a block activates "result".
let _activePane = null; // "source" | "result" | null
let _activeSource = null;

function _setPreview(pane, url, source) {
    const ids = _PANES[pane];
    const video = document.getElementById(ids.video);
    const placeholder = document.getElementById(ids.placeholder);
    if (!video || !placeholder) return;

    if (_objectUrls[pane]) {
        URL.revokeObjectURL(_objectUrls[pane]);
        _objectUrls[pane] = null;
    }
    if (url && url.startsWith("blob:")) _objectUrls[pane] = url;

    if (url) {
        video.src = url;
        video.style.display = "block";
        placeholder.style.display = "none";
        _activePane = pane;
        _activeSource = source;
    } else {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.style.display = "none";
        placeholder.style.display = "";
        if (_activePane === pane) { _activePane = null; _activeSource = null; }
    }
}

// Sets (or clears, with url=null) the Asset-selection/Video-Source-drop pane.
export function setSourcePreview(url, source) { _setPreview("source", url, source); }

// Sets (or clears) the generated-result pane — called once per block as a
// batch run's video output comes in.
export function setResultPreview(url, source) { _setPreview("result", url, source); }

// What the Frame/GIF property tabs operate on: { kind: "output"|"input", filename,
// subfolder, type } for anything already on the server, or { kind: "local", file }
// for a picked/dropped file not yet uploaded. null if neither pane has a video.
export function getActivePreviewSource() { return _activeSource; }

// The GIF tab uploads a still-local source on first use and needs to remember
// the resulting server-side reference so a repeat conversion doesn't re-upload —
// this rewrites the active source in place without touching either <video> element.
export function updateActivePreviewSourceRef(source) { _activeSource = source; }

// The <video> element the Frame/GIF tools should read/capture from, or null if
// neither pane currently has a video loaded.
export function getActivePreviewVideoElement() {
    if (!_activePane) return null;
    return document.getElementById(_PANES[_activePane].video);
}

// Both panes' <video> elements share the same persistent volume setting.
export function getAllPreviewVideoElements() {
    return Object.values(_PANES).map((ids) => document.getElementById(ids.video)).filter(Boolean);
}

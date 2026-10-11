/**
 * Video Tab - Edit subtab: a minimal non-linear-editor-style clip timeline
 * (MVP scope: add clips, reorder, trim, concatenate, export).
 *
 * Design (see VIDEO_EDIT_TAB_PLAN.md at the repo root for the full writeup):
 *   - Every clip is uploaded to ComfyUI's `input` area on add (same
 *     upload-on-first-use pattern as video-tab.js's GIF tool), then probed
 *     via /api/wfm/video/edit/probe (PyAV, no ffmpeg) for duration/width/height.
 *   - Export builds a ComfyUI API-format prompt directly (LoadVideo -> VideoTrim
 *     per clip -> ConcatenateVideo (if >1 clip) -> SaveVideo) and runs it through
 *     the existing comfyUI.queuePrompt()/trackProgress() infra — no new backend
 *     "build workflow" endpoint needed.
 *   - Trim/scrub preview reuses the existing Source preview pane (video-preview.js)
 *     instead of a second <video> element — selecting a clip loads it there,
 *     exactly like video-asset-tab.js already does for asset selection.
 *
 * Confirmed against a live ComfyUI 0.36.0 instance (see plan doc "Phase 0"):
 *   - The class_type for the simple trim node is `"Video Slice"` (WITH A SPACE —
 *     `/object_info/VideoSlice` looks empty because that's not its real id; its
 *     node_id is literally "Video Slice"). It takes plain flat inputs
 *     (video/start_time/duration/strict_duration), no VIDEO_EDIT nesting, and
 *     is not experimental — this is what's used here, not `VideoTrim`.
 *     `VideoTrim`'s `trim` input, if ever needed, must be double-nested —
 *     `{"trim": {"start_time":.., "duration":..}}` — because its execute()
 *     does `(trim or {}).get("trim")` before reading start_time/duration; a
 *     flat `{"start_time":..}` value is silently accepted and silently
 *     no-ops (verified: it does NOT raise, it just doesn't trim anything).
 *   - `ConcatenateVideo`'s Autogrow `videos` input is addressed via flat,
 *     dot-joined keys at the top level of `inputs`: "videos.video0",
 *     "videos.video1", ... (0-indexed) — NOT a nested object and NOT plain
 *     "video0"/"video1" without the "videos." prefix.
 *   - ConcatenateVideo hard-errors at execution time if clip frame dimensions
 *     differ, so mismatched clips are blocked client-side before export —
 *     but only between VIDEO clips; an image clip is auto-fit (ImageScale,
 *     center-crop) to match, since it isn't fixed-resolution source footage.
 *
 * Image clips: a still or animated image dropped in has no inherent video
 * duration, so it gets a user-editable "hold" length instead of in/out trim
 * points (clip.trimStart stays 0, clip.trimEnd IS the hold length — this
 * keeps it a drop-in replacement everywhere the code already reads
 * trimEnd-trimStart as "this clip's length in the timeline", e.g. the block
 * width calc and the total-duration readout). Export turns it into a real
 * VIDEO segment via LoadImage -> (ImageScale, only if resolution needs to
 * match) -> RepeatImageBatch(amount = holdSeconds * fps) -> CreateVideo —
 * confirmed on a live instance to produce an exact-duration, correctly
 * concatenation-compatible clip (see VIDEO_EDIT_TAB_PLAN.md "Image clips").
 *
 * Audio (Phase 4): the soundtrack is built as a separate AUDIO chain in the
 * same export graph and handed to ConcatenateVideo's `complete_audio` input
 * (which overrides whatever audio the concatenated segments carry). Each
 * clip contributes an exact-length segment — EmptyAudio(clip length) merged
 * with that clip's own audio (GetVideoComponents' audio output; None for a
 * silent clip, which AudioMerge treats as "keep audio1") — so segments line up
 * with their video even for silent/image clips; the segments are chained with
 * AudioConcat and the optional BGM (LoadAudio -> TrimAudioDuration ->
 * AudioAdjustVolume) is laid over with AudioMerge. Verified on a live 0.37.0
 * instance: segment audio stays in sync and BGM runs the full length.
 * Note: the segments still go through GetVideoComponents -> CreateVideo before
 * concatenation — feeding a raw "Video Slice" output next to an image-derived
 * CreateVideo clip fails with "Video chunk N could not be encoded compatibly"
 * (extradata / color space mismatch), audio or not.
 *
 * Crop (Phase 2): stored per VIDEO clip as a normalized 0..1 rect (the same
 * convention as ComfyUI-LoadVideoCrop), converted to even pixel values at
 * export and applied with core `VideoCrop` right after the clip's Video Slice.
 * VideoCrop's `crop` input must be double-nested — {"crop": {"x","y","width",
 * "height"}} — like VideoTrim's (verified on 0.37.0: a 300x200 crop of a
 * 608x352 clip matches the same region of the source frame). The export
 * resolution is the first video clip's post-crop size; other clips whose
 * (post-crop) size differs are fit to it with ImageScale(crop=center).
 *
 * Text overlays (Phase 3): stored per clip with clip-relative times, so they
 * move with the clip when it's reordered. There's no time-ranged video text
 * node in ComfyUI core, so export runs the graph first (to a "wfm_edit_pre"
 * intermediate) and then burns the overlays in with /api/wfm/video/edit/overlay-text
 * (PyAV streaming decode -> Pillow -> encode, audio remuxed as-is).
 */

import { showToast } from "./app.js";
import { t } from "./i18n.js";
import { comfyUI } from "./comfyui-client.js";
import {
    setSourcePreview, setResultPreview, getActivePreviewVideoElement, getResultPreviewVideoElement,
    getPreviewPaneElements,
} from "./video-preview.js";
import { VTEMP_GROUP, ensureVideoGroup } from "./gallery-tab.js";

const _s = {
    clips: [], // { id, name, file, kind:"video"|"image", serverRef:{filename,subfolder,type}|null, duration, width, height, fps, hasAudio, trimStart, trimEnd, crop:{x,y,w,h}(0..1)|null, probing, error }
    selectedId: null,
    // Text overlays belong to the timeline, not to a clip: start/end are absolute timeline seconds.
    // Extra audio clips placed on the timeline (sound effects, voice, ...), alongside the full-length BGM.
    // start/length are timeline seconds; srcStart is the in-file start point.
    sounds: [], // { id, name, file, serverRef, duration, srcStart, length, start, volumeDb }
    // Overlay clips (picture-in-picture) on a second video track, composited over the base clips at export.
    // x/y = centre and scale = width, all as fractions of the output frame; start/length are timeline seconds.
    pips: [], // { id, name, file, kind, serverRef, duration, width, height, thumb, srcStart, length, start, x, y, scale, opacity }
    texts: [], // { id, text, start, end, fontSize, color, anchor, outline, background }
    exporting: false,
    nextId: 1,
    outputDir: "",
    trackView: "video", // which track the timeline bar shows: "video" | "text" | "audio" (UI-only view, not saved/undone)
    projectFilename: null, // currently loaded/saved project's server filename, or null if unsaved
    // Timeline-wide soundtrack settings (Phase 4). bgm: { name, file, serverRef, duration } | null
    audio: _defaultAudio(),
};

// Initial soundtrack settings — used on startup, by Clear, and for projects
// saved before Phase 4 (no "audio" key). A function declaration, so it's
// hoisted above the _s initializer that calls it.
function _defaultAudio() {
    return { keepOriginal: true, originalVolumeDb: 0, bgm: null, bgmVolumeDb: -6, bgmOffset: 0 };
}

function _isAudioDefault() {
    const d = _defaultAudio();
    return !_s.sounds.length && Object.keys(d).every((k) => _s.audio[k] === d[k]);
}

// Save/load persists only the timeline's editorial state (order, trim points,
// which server-side file each clip refers to) — not clip.file/probing/error,
// which are re-derived on load the same way a fresh "add clip" does (see
// _restoreClipFromSaved). Mirrors video-plan-tab.js's VIDEO_PLAN_PREFIX pattern.
const VIDEO_EDIT_PROJECT_PREFIX = "ws_videoeditproj_";

// Pixel-per-second scale for the timeline track — clips are laid out at their
// real (trimmed) duration and left-aligned, NOT stretched to fill the track
// width like the Plan tab's blocks (whose widths are relative shares of a
// fixed-length plan) — Edit's timeline represents actual seconds.
const _PX_PER_SEC = 20;
const _MIN_BLOCK_PX = 56;

// Default hold length for a freshly-added image clip; user-adjustable per
// clip afterward in the trim panel.
const _DEFAULT_IMAGE_DURATION = 3.0;
// fps used when turning a held image into a video segment for export/preview
// concatenation — arbitrary but consistent (doesn't need to match other
// clips' native fps; ConcatenateVideo works at the container/frame level).
const _IMAGE_EXPORT_FPS = 24;

// Soundtrack segments are built at this rate/layout; AudioMerge/AudioConcat
// resample anything else (e.g. 32kHz clip audio) to match.
const _AUDIO_SAMPLE_RATE = 48000;

// 9-grid anchors for text overlays — same "<vertical>-<horizontal>" strings
// the backend's overlay_text_on_video() accepts.
const _TEXT_ANCHORS = [
    "top-left", "top-center", "top-right",
    "middle-left", "middle-center", "middle-right",
    "bottom-left", "bottom-center", "bottom-right",
];
let _nextTextId = 1;
let _nextSoundId = 1;
let _nextPipId = 1;

let _dragClipId = null; // clip being dragged for timeline reordering

// ============================================
// Output-dir lookup (same small helper video-asset-tab.js / video-plan-tab.js
// each keep their own copy of — needed to build the absolute path Gallery's
// group-tagging API expects).
// ============================================

async function _fetchOutputDir() {
    if (_s.outputDir) return;
    try {
        const res = await fetch("/api/wfm/settings/output-dir");
        if (res.ok) {
            const data = await res.json();
            _s.outputDir = (data.current || "").replace(/\\/g, "/").replace(/\/$/, "");
        }
    } catch { /* non-critical */ }
}

// ============================================
// Clip list state
// ============================================

function _selectedClip() {
    return _s.clips.find((c) => c.id === _s.selectedId) || null;
}

// Exported so video-asset-tab.js's "Send to Edit" button can add an asset
// (already fetched as a Blob/File the same way it feeds the Source preview)
// without either module importing the other's internals.
export function addClipFromFile(file, displayName) {
    const kind = file.type.startsWith("video/") ? "video" : "image";
    const clip = {
        id: _s.nextId++,
        name: displayName || file.name,
        file,
        kind,
        serverRef: null,
        duration: kind === "image" ? _DEFAULT_IMAGE_DURATION : 0,
        width: 0,
        height: 0,
        fps: 0,
        hasAudio: false,
        trimStart: 0,
        trimEnd: kind === "image" ? _DEFAULT_IMAGE_DURATION : 0,
        crop: null,
        probing: true,
        error: null,
    };
    _s.clips.push(clip);
    _clipRegistry.set(clip.id, clip);
    _s.selectedId = clip.id;
    _renderTimeline();
    _renderTrimPanel();
    _setClipSourcePreview(clip);
    if (kind === "image") _probeImageClip(clip);
    else _probeClip(clip);
}

async function _probeClip(clip) {
    try {
        const uploaded = await comfyUI.uploadImage(clip.file, clip.file.name);
        clip.serverRef = { filename: uploaded.name, subfolder: uploaded.subfolder || "", type: "input" };

        const params = new URLSearchParams({
            filename: clip.serverRef.filename,
            subfolder: clip.serverRef.subfolder,
            type: clip.serverRef.type,
        });
        const res = await fetch(`/api/wfm/video/edit/probe?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

        clip.duration = json.duration || 0;
        clip.width = json.width || 0;
        clip.height = json.height || 0;
        clip.fps = json.fps || 0;
        clip.hasAudio = !!json.has_audio;
        clip.trimStart = 0;
        clip.trimEnd = clip.duration;
    } catch (err) {
        clip.error = err.message;
        showToast(t("errorWithMsg", err.message), "error");
    } finally {
        clip.probing = false;
        _renderTimeline();
        if (_s.selectedId === clip.id) _renderTrimPanel();
    }
}

// Image dimensions are read client-side (no server round-trip needed — PyAV
// isn't reliable for opening arbitrary still-image formats as "video" the
// way it is for real video containers) via a throwaway <img>, revoking its
// blob URL once read either way.
function _readImageDimensions(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to read image dimensions")); };
        img.src = url;
    });
}

async function _probeImageClip(clip) {
    try {
        const uploaded = await comfyUI.uploadImage(clip.file, clip.file.name);
        clip.serverRef = { filename: uploaded.name, subfolder: uploaded.subfolder || "", type: "input" };
        const dims = await _readImageDimensions(clip.file);
        clip.width = dims.width;
        clip.height = dims.height;
        // duration/trimEnd already hold the default (or a previously-edited)
        // hold length — probing an image only needs to fill in serverRef/size.
    } catch (err) {
        clip.error = err.message;
        showToast(t("errorWithMsg", err.message), "error");
    } finally {
        clip.probing = false;
        _renderTimeline();
        if (_s.selectedId === clip.id) _renderTrimPanel();
    }
}

function _moveClip(id, delta) {
    const idx = _s.clips.findIndex((c) => c.id === id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= _s.clips.length) return;
    [_s.clips[idx], _s.clips[target]] = [_s.clips[target], _s.clips[idx]];
    _renderTimeline();
}

function _duplicateClip(id) {
    const idx = _s.clips.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const src = _s.clips[idx];
    const clone = {
        ...src,
        id: _s.nextId++,
        crop: src.crop ? { ...src.crop } : null,
    };
    _s.clips.splice(idx + 1, 0, clone);
    _clipRegistry.set(clone.id, clone);
    _s.selectedId = clone.id;
    _renderTimeline();
    _renderTrimPanel();
}

function _deleteClip(id) {
    _stopPreview();
    _s.clips = _s.clips.filter((c) => c.id !== id);
    if (_s.selectedId === id) {
        _s.selectedId = _s.clips.length ? _s.clips[0].id : null;
        if (_s.selectedId) _selectClip(_s.selectedId);
        else { setSourcePreview(null, null); _clearTextLayer("source"); }
    }
    _renderTimeline();
    _renderTrimPanel();
}

// Clears clips AND resets the Audio section (BGM, volumes, keep-original) to
// its initial state — both can be brought back with Undo.
function _clearTimeline() {
    if (_s.clips.length === 0 && _isAudioDefault() && !_s.texts.length && !_s.pips.length) return;
    if (!confirm(t("videoEditConfirmClear"))) return;
    _stopPreview();
    _s.clips = [];
    _s.selectedId = null;
    _s.audio = _defaultAudio();
    _s.sounds = [];
    _s.pips = [];
    _s.texts = [];
    setSourcePreview(null, null);
    _clearTextLayer("source");
    _clearCropLayer("source");
    _renderTimeline();
    _renderTrimPanel();
    _renderSoundList();
    _renderPipList();
    _syncAudioPanel();
}

function _selectClip(id) {
    if (id !== _s.selectedId) _endCropEdit(true);
    _s.selectedId = id;
    const clip = _selectedClip();
    _renderTimeline();
    _renderTrimPanel();
    if (clip) _setClipSourcePreview(clip);
}

// ============================================
// Resolution-mismatch guard — ConcatenateVideo hard-errors at execution time
// on mismatched frame dimensions (confirmed on a live 0.36.0 instance), so
// this is checked client-side before ever building the export graph. Only
// VIDEO clips are compared: an image clip's resolution is auto-fit at export
// time (see _buildExportWorkflow), so it can never be the thing blocking export.
// ============================================

function _findResolutionMismatch(clips) {
    // Cropped clips are fit to the export size (see _buildExportWorkflow), so
    // only uncropped video clips can still conflict with each other.
    const sized = clips.filter((c) => c.kind === "video" && !c.crop && c.width && c.height);
    if (sized.length < 2) return null;
    const first = sized[0];
    const mismatched = sized.find((c) => c.width !== first.width || c.height !== first.height);
    if (!mismatched) return null;
    return t("videoEditResolutionMismatch", `${first.name} (${first.width}x${first.height})`, `${mismatched.name} (${mismatched.width}x${mismatched.height})`);
}

// ============================================
// Rendering
// ============================================

function _fmtTime(s) {
    if (!s && s !== 0) return "--";
    return `${s.toFixed(1)}s`;
}

// M:SS.ds timecode for the trim scrubber's ruler ticks and badges (mirrors
// the "0:01.70" style Clipchamp-like editors use) — distinct from _fmtTime's
// coarser "1.7s" used elsewhere (timeline block meta, total-duration readout).
function _fmtTimecode(s) {
    const clamped = Math.max(0, s || 0);
    const m = Math.floor(clamped / 60);
    const sec = clamped - m * 60;
    return `${m}:${sec.toFixed(2).padStart(5, "0")}`;
}

// Horizontal timeline track (see VIDEO_EDIT_TAB_PLAN.md's UI redesign note):
// clips are laid out left-to-right at their real (trimmed) duration on a
// fixed px/sec scale and left-aligned — an empty track stays empty on the
// right rather than stretching clips to fill it. Reordering is done either
// by dragging a block onto another (native HTML5 DnD) or via the shared
// toolbar buttons below the track, which act on whichever clip is selected
// (mirrors the Plan subtab's "+Split/+Block/Delete" toolbar pattern instead
// of giving every row its own set of buttons).
function _renderTimeline() {
    _scheduleRecord();
    const track = document.getElementById("wfm-video-edit-timeline-track");
    if (!track) return;
    track.innerHTML = "";
    track.dataset.track = _s.trackView;
    track.style.height = "";

    if (_s.clips.length > 0 && _s.trackView !== "video") {
        _renderLaneTrack(track, _s.trackView);
        _updateToolbarState();
        return;
    }

    if (_s.clips.length === 0) {
        const placeholder = document.createElement("span");
        placeholder.className = "wfm-placeholder wfm-video-edit-timeline-placeholder";
        placeholder.textContent = t("videoEditNoClipsHint");
        track.appendChild(placeholder);
        _updateToolbarState();
        return;
    }

    _s.clips.forEach((clip) => {
        const block = document.createElement("div");
        block.className = "wfm-video-edit-timeline-block" + (clip.id === _s.selectedId ? " selected" : "");
        const seconds = clip.probing || clip.error ? 0 : Math.max(0.1, clip.trimEnd - clip.trimStart);
        block.style.width = `${Math.max(_MIN_BLOCK_PX, Math.round(seconds * _PX_PER_SEC))}px`;
        block.title = clip.name;
        block.draggable = true;

        const nameEl = document.createElement("div");
        nameEl.className = "wfm-video-edit-timeline-block-name";
        nameEl.textContent = `${clip.kind === "image" ? "🖼" : "🎬"} ${clip.name}`;
        const metaEl = document.createElement("div");
        metaEl.className = "wfm-video-edit-timeline-block-meta";
        if (clip.probing) metaEl.textContent = t("videoEditProbing");
        else if (clip.error) metaEl.textContent = "✗";
        else metaEl.textContent = _fmtTime(clip.trimEnd - clip.trimStart);
        block.append(nameEl, metaEl);

        block.addEventListener("click", () => _selectClip(clip.id));

        block.addEventListener("dragstart", (e) => {
            _dragClipId = clip.id;
            e.dataTransfer.effectAllowed = "move";
        });
        block.addEventListener("dragover", (e) => e.preventDefault());
        block.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            _reorderByDrop(clip.id);
        });

        track.appendChild(block);
    });

    _updateToolbarState();
}

// ============================================
// Text / Audio track views. The data model is unchanged (text overlays live on
// their clip with clip-relative times; BGM is timeline-wide) — these tracks are
// absolute-time views of it: each clip's offset on the timeline is the sum of
// the preceding clips' trimmed lengths. Clicking an item selects its clip, so
// the trim panel's "Text overlays" section edits it.
// ============================================

function _totalLength() {
    return _clipOffsets().reduce((sum, o) => sum + o.len, 0);
}

// The { clip, start, len } window the given timeline time falls in (null past the end).
function _windowAt(time) {
    return _clipOffsets().find((o) => o.len > 0 && time >= o.start - 1e-6 && time < o.start + o.len) || null;
}

function _clipOffsets() {
    let acc = 0;
    return _s.clips.map((c) => {
        const start = acc;
        const len = c.probing || c.error ? 0 : _exportClipLength(c);
        acc += len;
        return { clip: c, start, len };
    });
}

// Greedy row packing so overlapping items (e.g. two texts at once) stack
// instead of hiding each other. items: [{ start, end }] -> row index per item.
function _packRows(items) {
    const rowEnds = [];
    return items.map((it) => {
        let row = rowEnds.findIndex((e) => it.start >= e - 1e-6);
        if (row < 0) { row = rowEnds.length; rowEnds.push(0); }
        rowEnds[row] = it.end;
        return row;
    });
}

function _renderLaneTrack(track, view) {
    const offsets = _clipOffsets();
    const total = offsets.reduce((sum, o) => sum + o.len, 0);
    const items = []; // { start, end, label, clipId, dim }
    if (view === "text") {
        for (const ov of _s.texts) {
            if (!ov.text.trim()) continue;
            const end = Math.min(ov.end, total);
            if (end <= ov.start) continue;
            items.push({
                start: ov.start, end, label: ov.text, clipId: _windowAt(ov.start)?.clip.id ?? null,
                drag: {
                    total,
                    read: () => ({ start: ov.start, end: Math.min(ov.end, total) }),
                    write: (start, end) => { ov.start = start; ov.end = end; },
                    minStart: () => 0,
                    maxEnd: () => total,
                    commit: (moved, it) => {
                        if (!moved) { if (it.clipId != null) _selectClip(it.clipId); return; }
                        const owner = _windowAt(ov.start)?.clip.id ?? null;
                        if (owner != null && owner !== _s.selectedId) _selectClip(owner); else _renderTrimPanel();
                        _refreshTextPreview();
                    },
                },
            });
        }
        items.sort((a, b) => a.start - b.start);
    } else if (view === "pip") {
        for (const p of _s.pips) {
            items.push({
                start: p.start, end: p.start + p.length, label: `${p.kind === "image" ? "\ud83d\uddbc" : "\ud83c\udfac"} ${p.name}`, clipId: null,
                drag: {
                    total,
                    read: () => ({ start: p.start, end: p.start + p.length, srcStart: p.srcStart }),
                    write: (start, end, mode, orig) => {
                        p.start = start;
                        p.length = end - start;
                        if (mode === "start" && p.kind === "video") p.srcStart = Math.max(0, Number((orig.srcStart + (start - orig.start)).toFixed(2)));
                    },
                    minStart: (orig) => (p.kind === "video" ? Math.max(0, orig.start - orig.srcStart) : 0),
                    maxEnd: (orig) => (p.kind === "video" && p.duration ? orig.start + (p.duration - orig.srcStart) : Math.max(total, orig.end)),
                    commit: () => { _renderPipList(); _refreshTextPreview(); },
                },
            });
        }
    } else {
        // Clip audio: only video clips that actually carry sound, and only while
        // "keep original audio" is on (mirrors what export mixes in).
        if (_s.audio.keepOriginal) {
            for (const o of offsets) {
                if (o.clip.kind === "video" && o.clip.hasAudio && o.len > 0) {
                    items.push({ start: o.start, end: o.start + o.len, label: `♪ ${o.clip.name}`, clipId: o.clip.id, dim: true });
                }
            }
        }
    }
    if (view === "audio") {
        for (const snd of _s.sounds) {
            items.push({
                start: snd.start, end: snd.start + snd.length, label: `\u266a ${snd.name}`, clipId: null,
                drag: {
                    total,
                    read: () => ({ start: snd.start, end: snd.start + snd.length, srcStart: snd.srcStart }),
                    write: (start, end, mode, orig) => {
                        snd.start = start;
                        snd.length = end - start;
                        if (mode === "start") snd.srcStart = Math.max(0, Number((orig.srcStart + (start - orig.start)).toFixed(2)));
                    },
                    // Trimming the left edge moves the in-file start too, so it can't go before the file's beginning.
                    minStart: (orig) => Math.max(0, orig.start - orig.srcStart),
                    maxEnd: (orig) => (snd.duration ? orig.start + (snd.duration - orig.srcStart) : Math.max(total, orig.end)),
                    commit: () => { _renderSoundList(); _syncAudioPanel(); },
                },
            });
        }
    }
    // BGM always starts at timeline 0 (bgmOffset is the in-file start point)
    // and is cut to the timeline length at export.
    const bgm = view === "audio" ? _s.audio.bgm : null;
    let bgmItem = null;
    if (bgm) {
        const avail = bgm.duration ? Math.max(0, bgm.duration - (_s.audio.bgmOffset || 0)) : total;
        bgmItem = { start: 0, end: Math.min(total, avail) || total, label: `♫ ${t("videoEditTrackBgm")}: ${bgm.name}`, clipId: null };
    }

    const lane = document.createElement("div");
    lane.className = "wfm-video-edit-lane";

    // Clip boundary bands, so items can be related to the clips they sit on.
    for (const o of offsets) {
        if (o.len <= 0) continue;
        const band = document.createElement("div");
        band.className = "wfm-video-edit-lane-clipband" + (o.clip.id === _s.selectedId ? " selected" : "");
        band.style.left = `${Math.round(o.start * _PX_PER_SEC)}px`;
        band.style.width = `${Math.round(o.len * _PX_PER_SEC)}px`;
        band.title = o.clip.name;
        band.addEventListener("click", () => _selectClip(o.clip.id));
        lane.appendChild(band);
    }

    const all = bgmItem ? [...items, bgmItem] : items;
    const laneEnd = Math.max(total, ...all.map((i) => i.end));
    lane.style.width = `${Math.max(_MIN_BLOCK_PX, Math.round(laneEnd * _PX_PER_SEC))}px`;
    const rows = _packRows(all);
    const ROW_H = 24;
    all.forEach((it, i) => {
        const el = document.createElement("div");
        el.className = "wfm-video-edit-lane-item"
            + (it.dim ? " dim" : "")
            + (it.clipId != null && it.clipId === _s.selectedId ? " selected" : "");
        el.style.left = `${Math.round(it.start * _PX_PER_SEC)}px`;
        el.style.width = `${Math.max(24, Math.round((it.end - it.start) * _PX_PER_SEC))}px`;
        el.style.top = `${4 + rows[i] * ROW_H}px`;
        el.textContent = it.label;
        el.title = `${it.label} (${_fmtTime(it.start)} – ${_fmtTime(it.end)})`;
        if (it.drag) _wireBandDrag(el, it);
        else if (it.clipId != null) el.addEventListener("click", () => _selectClip(it.clipId));
        lane.appendChild(el);
    });

    if (all.length === 0) {
        const hint = document.createElement("span");
        hint.className = "wfm-placeholder wfm-video-edit-timeline-placeholder";
        hint.style.position = "relative";
        lane.style.width = "100%"; // an empty lane is as narrow as the timeline is short — keep the hint readable
        hint.textContent = view === "text" ? t("videoEditTrackNoText") : view === "pip" ? t("videoEditTrackNoPip") : t("videoEditTrackNoAudio");
        lane.appendChild(hint);
    }
    const rowCount = all.length ? Math.max(...rows) + 1 : 1;
    track.style.height = `${Math.max(48, rowCount * ROW_H + 8)}px`;
    track.appendChild(lane);
}

// Drag a band to move it, or drag its left/right edge to retime it; a press
// without movement is a click. it.drag is an adapter so text overlays and
// sounds share this: { total, read() -> {start,end,...}, write(start,end,mode,orig),
// minStart(orig), maxEnd(orig), commit(moved, it) }. Times are absolute timeline seconds.
function _wireBandDrag(el, it) {
    const EDGE_PX = 6;
    const MIN = 0.1;
    el.style.touchAction = "none";
    el.addEventListener("pointermove", (e) => {
        if (e.buttons) return;
        const r = el.getBoundingClientRect();
        el.style.cursor = (e.clientX - r.left < EDGE_PX || r.right - e.clientX < EDGE_PX) ? "ew-resize" : "grab";
    });
    el.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const d = it.drag;
        const r = el.getBoundingClientRect();
        const mode = e.clientX - r.left < EDGE_PX ? "start" : r.right - e.clientX < EDGE_PX ? "end" : "move";
        const orig = d.read();
        const x0 = e.clientX;
        let moved = false;
        el.setPointerCapture(e.pointerId);
        const onMove = (ev) => {
            const dx = (ev.clientX - x0) / _PX_PER_SEC;
            if (!moved && Math.abs(ev.clientX - x0) < 3) return;
            moved = true;
            let { start, end } = orig;
            if (mode === "move") {
                const delta = Math.max(-orig.start, Math.min(dx, Math.max(0, d.total - orig.end)));
                start = orig.start + delta;
                end = orig.end + delta;
            } else if (mode === "start") {
                start = Math.max(d.minStart(orig), Math.min(orig.start + dx, orig.end - MIN));
            } else {
                end = Math.min(d.maxEnd(orig), Math.max(orig.end + dx, orig.start + MIN));
            }
            start = Number(start.toFixed(2));
            end = Number(end.toFixed(2));
            d.write(start, end, mode, orig);
            el.style.left = `${Math.round(start * _PX_PER_SEC)}px`;
            el.style.width = `${Math.max(24, Math.round((end - start) * _PX_PER_SEC))}px`;
        };
        const onUp = () => {
            el.removeEventListener("pointermove", onMove);
            el.removeEventListener("pointerup", onUp);
            el.removeEventListener("pointercancel", onUp);
            d.commit(moved, it);
        };
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onUp);
        el.addEventListener("pointercancel", onUp);
    });
}

function _setTrackView(view) {
    // The crop editor lives in the video view's tool menu; leaving it ends editing like "Done".
    if (view !== "video") _endCropEdit(true);
    _s.trackView = view;
    const tools = document.getElementById("wfm-video-edit-tools");
    if (tools) tools.dataset.view = view;
    document.querySelectorAll("#wfm-video-edit-track-tabs .wfm-video-edit-track-tab").forEach((b) => {
        b.classList.toggle("active", b.dataset.track === view);
    });
    _renderTimeline();
}

function _reorderByDrop(targetId) {
    if (_dragClipId == null || _dragClipId === targetId) { _dragClipId = null; return; }
    const fromIdx = _s.clips.findIndex((c) => c.id === _dragClipId);
    _dragClipId = null;
    if (fromIdx < 0) return;
    // Remove first, then look up the target's index in the now-shortened array —
    // sidesteps the off-by-one from a naive "look up both indices, then splice
    // twice" approach when fromIdx < toIdx. Dropping onto a block inserts the
    // dragged clip right before it; dropping past the last block (targetId
    // null, from the track's own drop handler) appends to the end.
    const [moved] = _s.clips.splice(fromIdx, 1);
    if (targetId == null) {
        _s.clips.push(moved);
    } else {
        const toIdx = _s.clips.findIndex((c) => c.id === targetId);
        _s.clips.splice(toIdx < 0 ? _s.clips.length : toIdx, 0, moved);
    }
    _renderTimeline();
}

function _updateToolbarState() {
    const idx = _s.clips.findIndex((c) => c.id === _s.selectedId);
    const hasSelection = idx >= 0;
    const setDisabled = (id, disabled) => {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
    };
    setDisabled("wfm-video-edit-move-left-btn", !hasSelection || idx === 0);
    setDisabled("wfm-video-edit-move-right-btn", !hasSelection || idx === _s.clips.length - 1);
    setDisabled("wfm-video-edit-duplicate-btn", !hasSelection);
    setDisabled("wfm-video-edit-delete-btn", !hasSelection);
    setDisabled("wfm-video-edit-clear-btn", _s.clips.length === 0 && _isAudioDefault() && !_s.texts.length && !_s.pips.length);
    setDisabled("wfm-video-edit-preview-btn", _s.clips.length === 0);
    _updateTotalDuration();
}

function _updateTotalDuration() {
    const el = document.getElementById("wfm-video-edit-total-duration");
    if (!el) return;
    const total = _s.clips.reduce((sum, c) => {
        if (c.probing || c.error) return sum;
        return sum + Math.max(0, c.trimEnd - c.trimStart);
    }, 0);
    el.textContent = _s.clips.length === 0 ? "" : t("videoEditTotalDuration", _fmtTime(total));
}

// ============================================
// Trim scrubber — Clipchamp-style visual timeline for the selected video
// clip's trim panel: a time ruler, a draggable in/out range, and a playhead
// synced to the Source preview's <video> element. All positions are computed
// as percentages of clip.duration (not px/sec) so no separate zoom/scale
// bookkeeping is needed — the track just fills whatever width the panel gives it.
// ============================================

// Tracks the (element, listener) pair currently wired to a <video>'s
// "timeupdate" so it can be torn down before the next clip selection reuses
// the same persistent preview element (see video-preview.js) — otherwise
// listeners would pile up across every clip switch.
let _scrubVideoEl = null;
let _scrubVideoListener = null;

function _teardownTrimScrubber() {
    if (_scrubVideoEl && _scrubVideoListener) {
        _scrubVideoEl.removeEventListener("timeupdate", _scrubVideoListener);
    }
    _scrubVideoEl = null;
    _scrubVideoListener = null;
}

// "Nice" tick spacing so the ruler shows roughly 5-8 labeled ticks regardless
// of clip length (a 3s clip gets 0.5s ticks, a 5min clip gets 60s ticks).
function _niceRulerStep(duration) {
    const rough = duration / 6;
    const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    return candidates.find((c) => c >= rough) || candidates[candidates.length - 1];
}

function _renderRuler(ruler, duration) {
    ruler.innerHTML = "";
    if (!duration) return;
    const step = _niceRulerStep(duration);
    for (let time = 0; time <= duration + 0.001; time += step) {
        const tick = document.createElement("span");
        tick.className = "wfm-video-trim-ruler-tick";
        tick.style.left = `${Math.min(100, (time / duration) * 100)}%`;
        tick.textContent = _fmtTimecode(time).replace(/\.\d+$/, "");
        ruler.appendChild(tick);
    }
}

// Wires the scrubber DOM (already inserted into the trim panel by
// _renderTrimPanel) for one video clip. `commit` is the trim-panel's own
// start/end-input commit function — the scrubber drives it via the same
// inputs rather than writing clip.trimStart/trimEnd directly, so both paths
// (typed numbers, dragged handles) stay in sync through one code path.
function _wireTrimScrubber(clip, startInput, endInput, commit) {
    const track = document.getElementById("wfm-video-trim-track");
    const ruler = document.getElementById("wfm-video-trim-ruler");
    const rangeEl = document.getElementById("wfm-video-trim-range");
    const handleStart = document.getElementById("wfm-video-trim-handle-start");
    const handleEnd = document.getElementById("wfm-video-trim-handle-end");
    const playhead = document.getElementById("wfm-video-trim-playhead");
    const badgeStart = document.getElementById("wfm-video-trim-badge-start");
    const badgeEnd = document.getElementById("wfm-video-trim-badge-end");
    const badgePlayhead = document.getElementById("wfm-video-trim-badge-playhead");
    if (!track || !clip.duration) return undefined;

    _renderRuler(ruler, clip.duration);

    const pct = (t) => `${Math.min(100, Math.max(0, (t / clip.duration) * 100))}%`;

    function updateRange() {
        rangeEl.style.left = pct(clip.trimStart);
        rangeEl.style.width = `${Math.max(0, ((Math.min(clip.trimEnd, clip.duration) - clip.trimStart) / clip.duration) * 100)}%`;
        handleStart.style.left = pct(clip.trimStart);
        handleEnd.style.left = pct(clip.trimEnd);
        badgeStart.textContent = _fmtTimecode(clip.trimStart);
        badgeEnd.textContent = _fmtTimecode(clip.trimEnd);
    }
    updateRange();

    function updatePlayhead(t) {
        playhead.style.left = pct(t);
        badgePlayhead.textContent = _fmtTimecode(t);
    }

    const video = getActivePreviewVideoElement();
    if (video) {
        _scrubVideoEl = video;
        _scrubVideoListener = () => updatePlayhead(video.currentTime);
        video.addEventListener("timeupdate", _scrubVideoListener);
        updatePlayhead(video.currentTime);
    } else {
        updatePlayhead(0);
    }

    function seekTo(clientX) {
        const rect = track.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const t = ratio * clip.duration;
        const v = getActivePreviewVideoElement();
        if (v) v.currentTime = t;
        updatePlayhead(t);
    }

    // Drags a trim handle: while pointer is down, only the scrubber's own
    // visuals (range/handle position, badge text) update — clip.trimStart/End
    // and the timeline block widths commit once on pointerup, so dragging
    // doesn't thrash _renderTimeline() on every mousemove.
    function wireHandleDrag(handleEl, isStart) {
        handleEl.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleEl.setPointerCapture(e.pointerId);
            const onMove = (ev) => {
                const rect = track.getBoundingClientRect();
                const ratio = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
                const t = ratio * clip.duration;
                if (isStart) startInput.value = Math.min(t, clip.trimEnd - 0.05).toFixed(2);
                else endInput.value = Math.max(t, clip.trimStart + 0.05).toFixed(2);
                commit({ skipTimelineRerender: true });
                updateRange();
            };
            const onUp = () => {
                handleEl.removeEventListener("pointermove", onMove);
                handleEl.removeEventListener("pointerup", onUp);
                _renderTimeline();
            };
            handleEl.addEventListener("pointermove", onMove);
            handleEl.addEventListener("pointerup", onUp);
        });
    }
    wireHandleDrag(handleStart, true);
    wireHandleDrag(handleEnd, false);

    track.addEventListener("pointerdown", (e) => {
        if (e.target === handleStart || e.target === handleEnd || e.target === playhead) return;
        seekTo(e.clientX);
    });

    playhead.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        playhead.setPointerCapture(e.pointerId);
        const onMove = (ev) => seekTo(ev.clientX);
        const onUp = () => {
            playhead.removeEventListener("pointermove", onMove);
            playhead.removeEventListener("pointerup", onUp);
        };
        playhead.addEventListener("pointermove", onMove);
        playhead.addEventListener("pointerup", onUp);
    });

    return updateRange;
}

function _renderTrimPanel() {
    const panel = document.getElementById("wfm-video-edit-trim-panel");
    if (!panel) return;
    _teardownTrimScrubber();
    const clip = _selectedClip();
    if (!clip) {
        panel.innerHTML = `<span class="wfm-placeholder">${t("videoEditSelectClipHint")}</span>`;
        return;
    }
    if (clip.probing) {
        panel.innerHTML = `<span class="wfm-placeholder">${t("videoEditProbing")}</span>`;
        return;
    }
    if (clip.error) {
        panel.innerHTML = `<span class="wfm-placeholder" style="color:var(--wfm-danger)">✗ ${clip.error}</span>`;
        return;
    }

    // clip.name is a user-controlled filename — kept out of the innerHTML string
    // and assigned via textContent afterward (same pattern as video-asset-tab.js's
    // _renderDetail()), so it can never be interpreted as markup.
    if (clip.kind === "image") {
        panel.innerHTML = `
            <div class="wfm-video-edit-clip-name" id="wfm-video-edit-trim-clip-name" style="margin-bottom:6px;"></div>
            <div class="wfm-video-edit-trim-field wfm-video-edit-tool-trim" style="max-width:160px;">
                <label>${t("videoEditImageDuration")}</label>
                <input type="number" id="wfm-video-edit-image-duration" class="wfm-input" step="0.1" min="0.1" value="${clip.trimEnd.toFixed(2)}">
            </div>
            <div class="wfm-video-edit-text-section wfm-video-edit-tool-text" id="wfm-video-edit-text-section"></div>
        `;
        const nameEl = document.getElementById("wfm-video-edit-trim-clip-name");
        if (nameEl) { nameEl.textContent = clip.name; nameEl.title = clip.name; }

        const durInput = document.getElementById("wfm-video-edit-image-duration");
        durInput.addEventListener("change", () => {
            const val = Math.max(0.1, Number(durInput.value) || _DEFAULT_IMAGE_DURATION);
            clip.trimEnd = val;
            clip.duration = val;
            durInput.value = val.toFixed(2);
            _renderTimeline();
            _updateTextLimits();
        });
        _renderTextSection(clip);
        _refreshTextPreview();
        return;
    }

    panel.innerHTML = `
        <div class="wfm-video-edit-clip-name" id="wfm-video-edit-trim-clip-name" style="margin-bottom:16px;"></div>
        <div class="wfm-video-trim-scrubber wfm-video-edit-tool-trim" id="wfm-video-trim-scrubber">
            <div class="wfm-video-trim-ruler" id="wfm-video-trim-ruler"></div>
            <div class="wfm-video-trim-track" id="wfm-video-trim-track">
                <div class="wfm-video-trim-range" id="wfm-video-trim-range"></div>
                <div class="wfm-video-trim-handle" id="wfm-video-trim-handle-start">
                    <span class="wfm-video-trim-badge" id="wfm-video-trim-badge-start"></span>
                </div>
                <div class="wfm-video-trim-handle" id="wfm-video-trim-handle-end">
                    <span class="wfm-video-trim-badge" id="wfm-video-trim-badge-end"></span>
                </div>
                <div class="wfm-video-trim-playhead" id="wfm-video-trim-playhead">
                    <span class="wfm-video-trim-badge wfm-video-trim-badge-playhead" id="wfm-video-trim-badge-playhead"></span>
                </div>
            </div>
        </div>
        <div class="wfm-video-edit-trim-row wfm-video-edit-tool-trim" style="margin-top:20px;">
            <div class="wfm-video-edit-trim-field">
                <label>${t("videoEditTrimStart")}</label>
                <input type="number" id="wfm-video-edit-trim-start" class="wfm-input" step="0.1" min="0" max="${clip.duration}" value="${clip.trimStart.toFixed(2)}">
                <button type="button" class="wfm-btn wfm-btn-xs wfm-video-edit-playhead-btn" id="wfm-video-edit-trim-start-set">${t("videoEditSetFromPlayhead")}</button>
            </div>
            <div class="wfm-video-edit-trim-field">
                <label>${t("videoEditTrimEnd")}</label>
                <input type="number" id="wfm-video-edit-trim-end" class="wfm-input" step="0.1" min="0" max="${clip.duration}" value="${clip.trimEnd.toFixed(2)}">
                <button type="button" class="wfm-btn wfm-btn-xs wfm-video-edit-playhead-btn" id="wfm-video-edit-trim-end-set">${t("videoEditSetFromPlayhead")}</button>
            </div>
        </div>
        <div class="wfm-video-edit-crop-section wfm-video-edit-tool-trim" id="wfm-video-edit-crop-section"></div>
        <div class="wfm-video-edit-text-section wfm-video-edit-tool-text" id="wfm-video-edit-text-section"></div>
    `;
    const nameEl = document.getElementById("wfm-video-edit-trim-clip-name");
    if (nameEl) { nameEl.textContent = clip.name; nameEl.title = clip.name; }

    const startInput = document.getElementById("wfm-video-edit-trim-start");
    const endInput = document.getElementById("wfm-video-edit-trim-end");

    // _wireTrimScrubber fills this in with its own updateRange() once it's
    // wired below, so commit() (used by both the typed inputs and the "use
    // current position" buttons) can keep the scrubber's highlighted range
    // and handle positions in sync — not just the timeline blocks.
    let syncScrubber = () => {};

    // skipTimelineRerender: the scrubber's handle-drag calls this on every
    // pointermove (see _wireTrimScrubber) — re-running _renderTimeline() that
    // often would rebuild every timeline block per mousemove for no visible
    // benefit, since the scrubber already redraws its own range live.
    const commit = ({ skipTimelineRerender } = {}) => {
        let start = Math.max(0, Math.min(Number(startInput.value) || 0, clip.duration));
        let end = Math.max(0, Math.min(Number(endInput.value) || 0, clip.duration));
        if (end <= start) end = Math.min(clip.duration, start + 0.1);
        clip.trimStart = start;
        clip.trimEnd = end;
        startInput.value = start.toFixed(2);
        endInput.value = end.toFixed(2);
        syncScrubber();
        if (!skipTimelineRerender) {
            _renderTimeline();
            _updateTextLimits();
        }
        _refreshTextPreview();
    };
    startInput.addEventListener("change", commit);
    endInput.addEventListener("change", commit);

    document.getElementById("wfm-video-edit-trim-start-set")?.addEventListener("click", () => {
        const video = getActivePreviewVideoElement();
        if (video) { startInput.value = video.currentTime.toFixed(2); commit(); }
    });
    document.getElementById("wfm-video-edit-trim-end-set")?.addEventListener("click", () => {
        const video = getActivePreviewVideoElement();
        if (video) { endInput.value = video.currentTime.toFixed(2); commit(); }
    });

    syncScrubber = _wireTrimScrubber(clip, startInput, endInput, commit) || syncScrubber;
    _renderCropSection(clip);
    _renderTextSection(clip);
    _refreshTextPreview();
}

// ============================================
// Crop (Phase 2) — normalized rect per video clip, edited directly on the
// Source preview: while "Edit crop" is on, a draggable/resizable rect sits
// over the letterboxed <video> box (the area outside it is dimmed); when
// off, the dimmed mask stays as a read-only indication of the crop.
// ============================================

const _CROP_ASPECTS = { free: null, "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:3": 4 / 3, "3:4": 3 / 4 };
const _CROP_MIN = 0.05; // smallest crop side, as a fraction of the frame
let _cropEditing = false;
// Crop as it was when "Edit crop" was pressed (null = uncropped), restored by Cancel.
let _cropEditOriginal = null;
let _cropAspect = "free";

function _even(v) {
    return v - (v % 2);
}

// Pixel crop for export (H.264 4:2:0 needs even dimensions/offsets), or null
// when the clip isn't cropped.
function _cropPixels(clip) {
    if (clip.kind !== "video" || !clip.crop || !clip.width || !clip.height) return null;
    const W = clip.width;
    const H = clip.height;
    const x = Math.min(_even(Math.floor(clip.crop.x * W)), W - 2);
    const y = Math.min(_even(Math.floor(clip.crop.y * H)), H - 2);
    const width = Math.max(2, Math.min(_even(Math.round(clip.crop.w * W)), _even(W - x)));
    const height = Math.max(2, Math.min(_even(Math.round(clip.crop.h * H)), _even(H - y)));
    if (x === 0 && y === 0 && width >= _even(W) && height >= _even(H)) return null;
    return { x, y, width, height };
}

// A clip's frame size after cropping (what it contributes to the export).
function _effectiveSize(clip) {
    const px = _cropPixels(clip);
    return px ? { width: px.width, height: px.height } : { width: clip.width, height: clip.height };
}

function _renderCropSection(clip) {
    const host = document.getElementById("wfm-video-edit-crop-section");
    if (!host) return;
    const aspectOptions = Object.keys(_CROP_ASPECTS)
        .map((k) => `<option value="${k}">${k === "free" ? t("videoEditCropFree") : k}</option>`)
        .join("");
    host.innerHTML = `
        <div class="wfm-video-edit-section-head">
            <span>${t("videoEditCrop")}</span>
            <span style="display:flex;gap:6px;">
                <button type="button" class="wfm-btn wfm-btn-xs" id="wfm-video-edit-crop-toggle"></button>
                <button type="button" class="wfm-btn wfm-btn-xs" id="wfm-video-edit-crop-cancel" style="display:${_cropEditing ? "" : "none"};">${t("videoEditCropCancel")}</button>
                <button type="button" class="wfm-btn wfm-btn-xs" id="wfm-video-edit-crop-reset">${t("videoEditCropReset")}</button>
            </span>
        </div>
        <div class="wfm-video-edit-crop-row">
            <label>${t("videoEditCropAspect")}<select class="wfm-input" id="wfm-video-edit-crop-aspect">${aspectOptions}</select></label>
            <span class="wfm-i2i-status" id="wfm-video-edit-crop-info"></span>
        </div>
    `;
    const toggle = document.getElementById("wfm-video-edit-crop-toggle");
    const aspect = document.getElementById("wfm-video-edit-crop-aspect");
    toggle.textContent = _cropEditing ? t("videoEditCropDone") : t("videoEditCropEdit");
    toggle.classList.toggle("active", _cropEditing);
    aspect.value = _cropAspect;
    toggle.addEventListener("click", () => {
        if (_cropEditing) { _endCropEdit(true); return; }
        _cropEditing = true;
        _cropEditOriginal = clip.crop ? { ...clip.crop } : null;
        if (!clip.crop) clip.crop = { x: 0, y: 0, w: 1, h: 1 };
        if (_cropAspect !== "free") _applyCropAspect(clip);
        _renderCropSection(clip);
        _refreshCropPreview();
    });
    document.getElementById("wfm-video-edit-crop-cancel").addEventListener("click", () => _endCropEdit(false));
    document.getElementById("wfm-video-edit-crop-reset").addEventListener("click", () => {
        clip.crop = _cropEditing ? { x: 0, y: 0, w: 1, h: 1 } : null;
        _commitCrop(clip);
    });
    aspect.addEventListener("change", () => {
        _cropAspect = aspect.value;
        if (clip.crop) _applyCropAspect(clip);
        _commitCrop(clip);
    });
    _updateCropInfo(clip);
}

// Leaves crop-edit mode. keep=true ("Done", or leaving the Edit subtab /
// selecting another clip) keeps the adjusted rect; keep=false ("Cancel")
// puts back the crop the clip had when editing started.
function _endCropEdit(keep) {
    if (!_cropEditing) return;
    _cropEditing = false;
    const clip = _selectedClip();
    if (clip) {
        if (!keep) clip.crop = _cropEditOriginal ? { ..._cropEditOriginal } : null;
        _commitCrop(clip);
        _renderCropSection(clip);
    }
    _cropEditOriginal = null;
}

function _updateCropInfo(clip) {
    const el = document.getElementById("wfm-video-edit-crop-info");
    if (!el) return;
    const px = _cropPixels(clip);
    el.textContent = px
        ? `x ${px.x}, y ${px.y} — ${px.width}×${px.height}px`
        : `${t("videoEditCropNone")} (${clip.width}×${clip.height}px)`;
}

function _commitCrop(clip) {
    // A full-frame "crop" is the same as none — keep the data clean so the
    // export doesn't insert a no-op VideoCrop node.
    if (clip.crop && !_cropEditing && !_cropPixels(clip)) clip.crop = null;
    _updateCropInfo(clip);
    _refreshCropPreview();
    _refreshTextPreview();
    _renderTimeline();
}

// Re-shapes the rect to the chosen aspect ratio (in PIXEL space — the
// normalized rect is relative to a non-square frame), keeping its center and
// shrinking to fit the frame if needed.
function _applyCropAspect(clip) {
    const r = _CROP_ASPECTS[_cropAspect];
    if (!r || !clip.crop || !clip.width || !clip.height) return;
    const c = clip.crop;
    const frameR = clip.width / clip.height;
    let w = c.w;
    let h = (w * frameR) / r;
    if (h > 1) { h = 1; w = (h * r) / frameR; }
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    clip.crop = {
        w, h,
        x: Math.min(Math.max(0, cx - w / 2), 1 - w),
        y: Math.min(Math.max(0, cy - h / 2), 1 - h),
    };
}

function _mediaBox(pane) {
    const els = getPreviewPaneElements(pane);
    if (!els?.frame) return null;
    const media = els.video && els.video.style.display !== "none" ? els.video : els.img;
    if (!media || media.style.display === "none" || !media.clientHeight) return null;
    return { frame: els.frame, media, left: media.offsetLeft, top: media.offsetTop, width: media.clientWidth, height: media.clientHeight };
}

function _clearCropLayer(pane) {
    const layer = getPreviewPaneElements(pane)?.frame?.querySelector(".wfm-video-edit-crop-layer");
    if (layer) layer.remove();
}

// Draws the crop rect (and dimmed surround) over a pane's media box.
// interactive=true wires move/resize dragging back into clip.crop.
function _drawCropLayer(pane, clip, interactive) {
    const box = _mediaBox(pane);
    if (!box || !clip?.crop) { _clearCropLayer(pane); return; }
    let layer = box.frame.querySelector(".wfm-video-edit-crop-layer");
    if (!layer) {
        layer = document.createElement("div");
        layer.className = "wfm-video-edit-crop-layer";
        layer.innerHTML = `<div class="wfm-video-edit-crop-rect">
            <span class="wfm-video-edit-crop-handle" data-h="nw"></span><span class="wfm-video-edit-crop-handle" data-h="ne"></span>
            <span class="wfm-video-edit-crop-handle" data-h="sw"></span><span class="wfm-video-edit-crop-handle" data-h="se"></span>
        </div>`;
        box.frame.appendChild(layer);
        _wireCropDrag(layer, pane);
    }
    layer.classList.toggle("interactive", !!interactive);
    Object.assign(layer.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    const rect = layer.firstElementChild;
    const c = clip.crop;
    Object.assign(rect.style, {
        left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%`,
    });
}

function _wireCropDrag(layer, pane) {
    const rect = layer.firstElementChild;
    rect.addEventListener("pointerdown", (e) => {
        const clip = _selectedClip();
        if (!layer.classList.contains("interactive") || !clip?.crop) return;
        e.preventDefault();
        e.stopPropagation();
        const handle = e.target.dataset?.h || "move";
        const box = layer.getBoundingClientRect();
        const start = { ...clip.crop };
        const x0 = e.clientX;
        const y0 = e.clientY;
        const ratio = _CROP_ASPECTS[_cropAspect];
        const frameR = clip.width && clip.height ? clip.width / clip.height : 1;
        rect.setPointerCapture(e.pointerId);

        const onMove = (ev) => {
            const dx = (ev.clientX - x0) / box.width;
            const dy = (ev.clientY - y0) / box.height;
            let { x, y, w, h } = start;
            if (handle === "move") {
                x = Math.min(Math.max(0, start.x + dx), 1 - w);
                y = Math.min(Math.max(0, start.y + dy), 1 - h);
            } else {
                // Anchor = the corner opposite the dragged handle.
                const ax = handle.includes("w") ? start.x + start.w : start.x;
                const ay = handle.includes("n") ? start.y + start.h : start.y;
                const px = Math.min(Math.max(0, (handle.includes("w") ? start.x : start.x + start.w) + dx), 1);
                const py = Math.min(Math.max(0, (handle.includes("n") ? start.y : start.y + start.h) + dy), 1);
                w = Math.max(_CROP_MIN, Math.abs(px - ax));
                h = Math.max(_CROP_MIN, Math.abs(py - ay));
                if (ratio) {
                    // Keep the pixel aspect: derive h from w, then clamp to
                    // the room available on the anchor's side.
                    h = (w * frameR) / ratio;
                    const maxH = handle.includes("n") ? ay : 1 - ay;
                    const maxW = handle.includes("w") ? ax : 1 - ax;
                    if (h > maxH) { h = maxH; w = (h * ratio) / frameR; }
                    if (w > maxW) { w = maxW; h = (w * frameR) / ratio; }
                } else {
                    w = Math.min(w, handle.includes("w") ? ax : 1 - ax);
                    h = Math.min(h, handle.includes("n") ? ay : 1 - ay);
                }
                x = handle.includes("w") ? ax - w : ax;
                y = handle.includes("n") ? ay - h : ay;
            }
            clip.crop = { x, y, w, h };
            _drawCropLayer(pane, clip, true);
            _updateCropInfo(clip);
            _refreshTextPreview();
        };
        const onUp = () => {
            rect.removeEventListener("pointermove", onMove);
            rect.removeEventListener("pointerup", onUp);
            rect.removeEventListener("pointercancel", onUp);
            _commitCrop(clip);
        };
        rect.addEventListener("pointermove", onMove);
        rect.addEventListener("pointerup", onUp);
        rect.addEventListener("pointercancel", onUp);
    });
}

function _refreshCropPreview() {
    const clip = _selectedClip();
    const els = getPreviewPaneElements("source");
    const showing = els && (els.video?.getAttribute("src") === _sourcePreviewUrl);
    if (!clip || clip.kind !== "video" || !showing || clip.probing || clip.error || !clip.crop) {
        _clearCropLayer("source");
    } else {
        _drawCropLayer("source", clip, _cropEditing);
    }
    if (_previewPlaying) {
        const cur = _previewClips[_previewIndex];
        if (cur?.kind === "video" && cur.crop) _drawCropLayer("result", cur, false);
        else _clearCropLayer("result");
    }
}

// ============================================
// Text overlays (Phase 3) — per-clip list editor in the trim panel, plus a
// CSS-positioned approximation of the burn-in drawn over the preview panes.
// Times are clip-relative (0 = the clip's trim-in point); export converts
// them to absolute timeline times (see _collectTimelineOverlays).
// ============================================

function _clipLength(clip) {
    return Math.max(0, clip.trimEnd - clip.trimStart);
}

// New overlays span the selected clip's window on the timeline.
function _newTextOverlay(clip) {
    const win = _clipOffsets().find((o) => o.clip === clip) || { start: 0, len: _totalLength() };
    return {
        id: _nextTextId++,
        text: t("videoEditTextDefault"),
        start: Number(win.start.toFixed(2)),
        end: Number((win.start + win.len).toFixed(2)),
        fontSize: 6,
        color: "#ffffff",
        anchor: "bottom-center",
        outline: true,
        background: false,
    };
}

function _renderTextSection(clip) {
    const host = document.getElementById("wfm-video-edit-text-section");
    if (!host) return;
    host.innerHTML = `
        <div class="wfm-video-edit-section-head">
            <span>${t("videoEditTextOverlays")}</span>
            <button type="button" class="wfm-btn wfm-btn-xs" id="wfm-video-edit-text-add">${t("videoEditTextAdd")}</button>
        </div>
        <div class="wfm-video-edit-text-list" id="wfm-video-edit-text-list"></div>
    `;
    const list = document.getElementById("wfm-video-edit-text-list");
    if (!_s.texts.length) {
        list.innerHTML = `<span class="wfm-placeholder">${t("videoEditTextEmpty")}</span>`;
    }
    for (const ov of _s.texts) list.appendChild(_buildTextRow(clip, ov));
    document.getElementById("wfm-video-edit-text-add")?.addEventListener("click", () => {
        _s.texts.push(_newTextOverlay(clip));
        _renderTextSection(clip);
        _refreshTextPreview();
    });
}

// Trim/hold-length edits only move the rows' max bounds — deliberately not a
// full _renderTextSection(): those edits commit on the input's "change",
// which fires on blur, i.e. on mousedown of whatever the user clicks next.
// Rebuilding the section there would replace that button under the cursor
// (e.g. "+ Add text") and swallow the click.
function _updateTextLimits() {
    const len = _totalLength();
    document.querySelectorAll('#wfm-video-edit-text-list [data-k="start"], #wfm-video-edit-text-list [data-k="end"]')
        .forEach((input) => { input.max = len; });
}

function _buildTextRow(clip, ov) {
    const len = _totalLength();
    const anchorLabels = t("videoEditTextAnchorLabels");
    const anchorOptions = _TEXT_ANCHORS
        .map((a, i) => `<option value="${a}">${Array.isArray(anchorLabels) ? anchorLabels[i] : a}</option>`)
        .join("");
    const row = document.createElement("div");
    row.className = "wfm-video-edit-text-row";
    row.innerHTML = `
        <div class="wfm-video-edit-text-row-head">
            <input type="text" class="wfm-input" data-k="text">
            <button type="button" class="wfm-btn wfm-btn-xs wfm-btn-danger" data-act="delete" title="${t("videoEditDelete")}">✕</button>
        </div>
        <div class="wfm-video-edit-text-grid">
            <label>${t("videoEditTextStart")}<input type="number" class="wfm-input" data-k="start" step="0.1" min="0" max="${len}"></label>
            <label>${t("videoEditTextEnd")}<input type="number" class="wfm-input" data-k="end" step="0.1" min="0" max="${len}"></label>
            <label>${t("videoEditTextSize")}<input type="number" class="wfm-input" data-k="fontSize" step="0.5" min="1" max="30"></label>
            <label>${t("videoEditTextColor")}<input type="color" data-k="color"></label>
            <label>${t("videoEditTextPosition")}<select class="wfm-input" data-k="anchor">${anchorOptions}</select></label>
            <label class="wfm-video-checkbox-inline"><input type="checkbox" data-k="outline"> ${t("videoEditTextOutline")}</label>
            <label class="wfm-video-checkbox-inline"><input type="checkbox" data-k="background"> ${t("videoEditTextBackground")}</label>
        </div>
    `;
    // Values are assigned as properties (never interpolated into innerHTML),
    // since the overlay text is free-form user input.
    const el = (k) => row.querySelector(`[data-k="${k}"]`);
    el("text").value = ov.text;
    el("start").value = ov.start.toFixed(2);
    el("end").value = Math.min(ov.end, len).toFixed(2);
    el("fontSize").value = ov.fontSize;
    el("color").value = ov.color;
    el("anchor").value = ov.anchor;
    el("outline").checked = ov.outline;
    el("background").checked = ov.background;

    el("text").addEventListener("input", () => { ov.text = el("text").value; _refreshTextPreview(); });
    const commitTimes = () => {
        const len = _totalLength(); // live: clips may have been re-trimmed since this row was built
        const start = Math.max(0, Math.min(Number(el("start").value) || 0, len));
        let end = Math.max(0, Math.min(Number(el("end").value) || 0, len));
        if (end <= start) end = Math.min(len, start + 0.1);
        ov.start = start;
        ov.end = end;
        el("start").value = start.toFixed(2);
        el("end").value = end.toFixed(2);
        _refreshTextPreview();
    };
    el("start").addEventListener("change", commitTimes);
    el("end").addEventListener("change", commitTimes);
    el("fontSize").addEventListener("change", () => {
        ov.fontSize = Math.max(1, Math.min(30, Number(el("fontSize").value) || 6));
        el("fontSize").value = ov.fontSize;
        _refreshTextPreview();
    });
    el("color").addEventListener("input", () => { ov.color = el("color").value; _refreshTextPreview(); });
    el("anchor").addEventListener("change", () => { ov.anchor = el("anchor").value; _refreshTextPreview(); });
    el("outline").addEventListener("change", () => { ov.outline = el("outline").checked; _refreshTextPreview(); });
    el("background").addEventListener("change", () => { ov.background = el("background").checked; _refreshTextPreview(); });
    row.querySelector('[data-act="delete"]').addEventListener("click", () => {
        _s.texts = _s.texts.filter((o) => o.id !== ov.id);
        _renderTextSection(clip);
        _refreshTextPreview();
    });
    return row;
}

// --- Preview layer -------------------------------------------------------
// A pointer-transparent div laid exactly over the pane's visible <video>/<img>
// box (the media is letterboxed inside a fixed-height frame), holding one
// absolutely-positioned element per active overlay. Font size is the same
// "% of frame height" the backend uses, so the preview matches the burn-in
// closely (font face may differ slightly from the server's system font).

let _sourcePreviewUrl = null; // last blob URL this tab put into the Source pane

function _getTextLayer(pane) {
    const els = getPreviewPaneElements(pane);
    if (!els?.frame) return null;
    let layer = els.frame.querySelector(".wfm-video-edit-text-layer");
    if (!layer) {
        layer = document.createElement("div");
        layer.className = "wfm-video-edit-text-layer";
        els.frame.appendChild(layer);
    }
    const media = els.video && els.video.style.display !== "none" ? els.video : els.img;
    return { layer, media };
}

function _clearTextLayer(pane) {
    const els = getPreviewPaneElements(pane);
    const layer = els?.frame?.querySelector(".wfm-video-edit-text-layer");
    if (layer) layer.replaceChildren();
}

// crop (normalized, optional): the burn-in happens on the cropped frame, so
// the preview layer covers only that sub-rect of the displayed media.
function _drawTextLayer(pane, overlays, crop = null, pips = []) {
    const found = _getTextLayer(pane);
    if (!found) return;
    const { layer, media } = found;
    layer.replaceChildren();
    if ((!overlays.length && !pips.length) || !media || media.style.display === "none" || !media.clientHeight) return;

    const c = crop || { x: 0, y: 0, w: 1, h: 1 };
    const w = media.clientWidth * c.w;
    const h = media.clientHeight * c.h;
    layer.style.left = `${media.offsetLeft + media.clientWidth * c.x}px`;
    layer.style.top = `${media.offsetTop + media.clientHeight * c.y}px`;
    layer.style.width = `${w}px`;
    layer.style.height = `${h}px`;
    const margin = 0.04 * Math.min(w, h);

    // Overlay clips sit under the text. The box shows a still of the clip (not live playback).
    for (const p of pips) {
        const pw = p.scale * w;
        const ratio = p.width && p.height ? p.height / p.width : 9 / 16;
        const box = document.createElement("div");
        box.className = "wfm-video-edit-pip-box";
        box.style.left = `${p.x * w - pw / 2}px`;
        box.style.top = `${p.y * h - (pw * ratio) / 2}px`;
        box.style.width = `${pw}px`;
        box.style.height = `${pw * ratio}px`;
        box.style.opacity = String(p.opacity);
        if (p.thumb) {
            const img = document.createElement("img");
            img.src = p.thumb;
            img.draggable = false;
            box.appendChild(img);
        }
        layer.appendChild(box);
    }

    for (const ov of overlays) {
        const [v, hz] = (ov.anchor || "bottom-center").split("-");
        const div = document.createElement("div");
        div.className = "wfm-video-edit-text-item";
        if (ov.outline) div.classList.add("outline");
        if (ov.background) div.classList.add("bg");
        div.textContent = ov.text;
        div.style.fontSize = `${(ov.fontSize / 100) * h}px`;
        div.style.color = ov.color;
        div.style.textAlign = hz;
        const tx = hz === "center" ? "-50%" : "0";
        const ty = v === "middle" ? "-50%" : "0";
        if (hz === "left") div.style.left = `${margin}px`;
        else if (hz === "right") div.style.right = `${margin}px`;
        else div.style.left = "50%";
        if (v === "top") div.style.top = `${margin}px`;
        else if (v === "bottom") div.style.bottom = `${margin}px`;
        else div.style.top = "50%";
        div.style.transform = `translate(${tx}, ${ty})`;
        layer.appendChild(div);
    }
}

function _activePipsAt(time) {
    return _s.pips.filter((p) => time >= p.start && time < p.start + p.length);
}

// Overlays showing at an absolute timeline time.
function _activeOverlaysAt(time) {
    return _s.texts.filter((o) => o.text.trim() && time >= o.start && time < o.end);
}

function _clipStartOffset(clip) {
    return _clipOffsets().find((o) => o.clip === clip)?.start ?? 0;
}

// Source pane: the selected clip's overlays at the source <video>'s current
// position (relative to its trim-in). Only drawn while the pane is still
// showing this tab's clip — an Asset selection elsewhere replaces the media
// and must not inherit a stale overlay.
function _refreshSourceTextPreview() {
    const clip = _selectedClip();
    const els = getPreviewPaneElements("source");
    const showing = els && (els.video?.getAttribute("src") === _sourcePreviewUrl || els.img?.getAttribute("src") === _sourcePreviewUrl);
    if (!clip || !_sourcePreviewUrl || !showing || clip.probing || clip.error) {
        _clearTextLayer("source");
        return;
    }
    if (clip.kind === "image") {
        // A still has no playhead: show every overlay that touches its window.
        const start = _clipStartOffset(clip);
        const end = start + _exportClipLength(clip);
        _drawTextLayer("source", _s.texts.filter((o) => o.text.trim() && o.start < end && o.end > start), null,
            _s.pips.filter((p) => p.start < end && p.start + p.length > start));
        return;
    }
    const t0 = _clipStartOffset(clip) + (els.video?.currentTime || 0) - clip.trimStart;
    _drawTextLayer("source", _activeOverlaysAt(t0), clip.crop, _activePipsAt(t0));
    _refreshCropPreview();
}

function _refreshTextPreview() {
    _scheduleRecord();
    if (_s.trackView === "text" || _s.trackView === "pip") _renderTimeline();
    _refreshSourceTextPreview();
    if (_previewPlaying) _refreshResultTextPreview();
}

function _setClipSourcePreview(clip) {
    _sourcePreviewUrl = URL.createObjectURL(clip.file);
    setSourcePreview(_sourcePreviewUrl, { kind: "local", file: clip.file }, clip.kind);
    const els = getPreviewPaneElements("source");
    // First draw once the letterboxed media box has its real size.
    els?.video?.addEventListener("loadedmetadata", _refreshSourceTextPreview, { once: true });
    els?.img?.addEventListener("load", _refreshSourceTextPreview, { once: true });
    _refreshSourceTextPreview();
}

// ============================================
// Sequential timeline preview — plays every ready clip back-to-back (each
// trimmed to its in/out point) in the shared "Result" pane (the same one
// Export writes its finished output into), so what plays there is always
// exactly what Export would currently produce. Deliberately reuses that pane
// rather than a third <video> element: the user asked for it to be the same
// slot the exported video lands in, not a separate preview area.
// ============================================

let _previewPlaying = false;
let _previewClips = [];
let _previewIndex = 0;
let _previewImageTimer = null; // holds an image clip on screen for its duration (setTimeout, no video events to hook)
let _previewImageStartedAt = 0; // performance.now() when the current image clip went on screen
let _previewTextTimer = null; // redraws the Result pane's text overlays while previewing
let _soundPreviews = []; // { el, timers } per timeline sound, started/stopped on the preview clock
let _bgmPreviewEl = null; // <audio> playing the BGM alongside the preview
let _savedResultAudio = null; // { muted, volume } of the Result <video>, restored on stop

function _dbToGain(db) {
    return Math.min(1, Math.pow(10, (Number(db) || 0) / 20));
}

function _refreshResultTextPreview() {
    const clip = _previewClips[_previewIndex];
    if (!_previewPlaying || !clip) {
        _clearTextLayer("result");
        return;
    }
    const base = _previewClips.slice(0, _previewIndex).reduce((sum, c) => sum + _exportClipLength(c), 0);
    const t0 = base + (clip.kind === "image"
        ? (performance.now() - _previewImageStartedAt) / 1000
        : (getResultPreviewVideoElement()?.currentTime || 0) - clip.trimStart);
    _drawTextLayer("result", _activeOverlaysAt(t0), clip.kind === "video" ? clip.crop : null, _activePipsAt(t0));
    if (clip.kind === "video" && clip.crop) _drawCropLayer("result", clip, false);
    else _clearCropLayer("result");
}

// The preview approximates the export's soundtrack: clip audio follows the
// "keep original" toggle/volume on the Result <video> itself, and the BGM
// plays from its start offset on a separate <audio> element for the whole
// preview run (it isn't re-synced at clip boundaries, so it can drift by the
// time each clip switch takes — fine for judging levels, not frame-exact).
function _startPreviewAudio() {
    const video = getResultPreviewVideoElement();
    if (video) {
        _savedResultAudio = { muted: video.muted, volume: video.volume };
        video.muted = !_s.audio.keepOriginal;
        video.volume = _dbToGain(_s.audio.originalVolumeDb);
    }
    const bgm = _s.audio.bgm;
    if (bgm?.file) {
        _bgmPreviewEl = new Audio(URL.createObjectURL(bgm.file));
        _bgmPreviewEl.volume = _dbToGain(_s.audio.bgmVolumeDb);
        _bgmPreviewEl.currentTime = _s.audio.bgmOffset || 0;
        _bgmPreviewEl.play().catch(() => {});
    }
    // Timeline sounds are scheduled off the preview start (same drift caveat as the BGM).
    for (const snd of _s.sounds) {
        if (!snd.file) continue;
        const el = new Audio(URL.createObjectURL(snd.file));
        el.volume = _dbToGain(snd.volumeDb);
        const timers = [
            setTimeout(() => { el.currentTime = snd.srcStart || 0; el.play().catch(() => {}); }, snd.start * 1000),
            setTimeout(() => el.pause(), (snd.start + snd.length) * 1000),
        ];
        _soundPreviews.push({ el, timers });
    }
}

function _stopPreviewAudio() {
    for (const { el, timers } of _soundPreviews) {
        timers.forEach(clearTimeout);
        el.pause();
        URL.revokeObjectURL(el.src);
    }
    _soundPreviews = [];
    if (_bgmPreviewEl) {
        _bgmPreviewEl.pause();
        URL.revokeObjectURL(_bgmPreviewEl.src);
        _bgmPreviewEl = null;
    }
    const video = getResultPreviewVideoElement();
    if (video && _savedResultAudio) {
        video.muted = _savedResultAudio.muted;
        video.volume = _savedResultAudio.volume;
    }
    _savedResultAudio = null;
}

function _onPreviewTimeUpdate() {
    const video = getResultPreviewVideoElement();
    const clip = _previewClips[_previewIndex];
    if (!video || !clip || clip.kind !== "video") return;
    if (video.currentTime >= clip.trimEnd) _advancePreview();
}

function _advancePreview() {
    _previewIndex += 1;
    if (_previewIndex >= _previewClips.length) { _stopPreview(); return; }
    _playPreviewClip();
}

function _playPreviewClip() {
    const clip = _previewClips[_previewIndex];
    if (!clip) { _stopPreview(); return; }

    if (clip.kind === "image") {
        const video = getResultPreviewVideoElement();
        video?.pause();
        setResultPreview(URL.createObjectURL(clip.file), { kind: "local", file: clip.file }, "image");
        _previewImageStartedAt = performance.now();
        const holdMs = Math.max(50, (clip.trimEnd - clip.trimStart) * 1000);
        _previewImageTimer = setTimeout(_advancePreview, holdMs);
        return;
    }

    const video = getResultPreviewVideoElement();
    if (!video) { _stopPreview(); return; }
    setResultPreview(URL.createObjectURL(clip.file), { kind: "local", file: clip.file }, "video");
    // currentTime only reliably applies once the new source has metadata —
    // setting it immediately after swapping src is flaky across browsers.
    const onReady = () => {
        video.removeEventListener("loadedmetadata", onReady);
        video.currentTime = clip.trimStart;
        video.play().catch(() => {});
    };
    video.addEventListener("loadedmetadata", onReady);
}

function _startPreview() {
    _previewClips = _s.clips.filter((c) => !c.probing && !c.error);
    if (_previewClips.length === 0) {
        showToast(t("videoEditNoClips"), "error");
        return;
    }
    _previewIndex = 0;
    _previewPlaying = true;
    const video = getResultPreviewVideoElement();
    video?.addEventListener("timeupdate", _onPreviewTimeUpdate);
    video?.addEventListener("ended", _advancePreview);
    _startPreviewAudio();
    _playPreviewClip();
    _previewTextTimer = setInterval(_refreshResultTextPreview, 100);
    _updatePreviewBtn();
}

function _stopPreview() {
    _previewPlaying = false;
    if (_previewImageTimer) { clearTimeout(_previewImageTimer); _previewImageTimer = null; }
    const video = getResultPreviewVideoElement();
    video?.removeEventListener("timeupdate", _onPreviewTimeUpdate);
    video?.removeEventListener("ended", _advancePreview);
    video?.pause();
    if (_previewTextTimer) { clearInterval(_previewTextTimer); _previewTextTimer = null; }
    _clearTextLayer("result");
    _clearCropLayer("result");
    _stopPreviewAudio();
    _updatePreviewBtn();
}

function _togglePreview() {
    if (_previewPlaying) _stopPreview();
    else _startPreview();
}

function _updatePreviewBtn() {
    const btn = document.getElementById("wfm-video-edit-preview-btn");
    if (btn) btn.textContent = _previewPlaying ? t("videoEditPreviewStop") : t("videoEditPreviewPlay");
}

// ============================================
// Export — builds a ComfyUI API-format prompt directly (see module header for
// the confirmed input formats) and runs it through the existing execution
// infrastructure (comfyui-client.js), exactly like video-plan-tab.js does.
// ============================================

// A clip's length in the exported video — image clips are quantized to whole
// frames at _IMAGE_EXPORT_FPS (RepeatImageBatch amount), so the soundtrack
// segment and text-overlay offsets use the same rounded value.
function _exportClipLength(clip) {
    if (clip.kind === "image") {
        return Math.max(1, Math.round(_clipLength(clip) * _IMAGE_EXPORT_FPS)) / _IMAGE_EXPORT_FPS;
    }
    return Math.max(0.05, _clipLength(clip));
}

function _serverFilePath(ref) {
    return ref.subfolder ? `${ref.subfolder}/${ref.filename}` : ref.filename;
}

function _buildExportWorkflow(clips, { audio = _s.audio, filenamePrefix = "video/wfm_edit" } = {}) {
    const prompt = {};
    let nextId = 1;
    const alloc = () => String(nextId++);
    const segments = []; // { clip, videoOut: nodeId, componentsId: nodeId|null }

    // Auto-fit target for image clips: the first VIDEO clip's resolution, so
    // a still dropped alongside real footage doesn't need to be pre-sized by
    // hand (see _findResolutionMismatch, which only ever compares VIDEO
    // clips against each other — images are exempt because of this fit step).
    const videoClip = clips.find((c) => c.kind === "video");
    const target = _effectiveSize(videoClip || clips[0] || {});
    const targetW = target.width;
    const targetH = target.height;

    const clipAudioUsed = audio.keepOriginal && clips.some((c) => c.kind === "video" && c.hasAudio);
    const hasBgm = !!audio.bgm?.serverRef;
    // A separate soundtrack (ConcatenateVideo complete_audio) is only built
    // when something actually has to be mixed: a BGM, several clips' audio
    // joined end to end, or a volume change on the original audio.
    const sounds = _s.sounds.filter((x) => x.serverRef);
    const buildTrack = hasBgm || sounds.length > 0 || (clipAudioUsed && (clips.length > 1 || Math.round(audio.originalVolumeDb) !== 0));
    // A lone video clip whose audio is kept as-is skips decode/re-encode
    // entirely: its Video Slice output goes straight to SaveVideo.
    const passthrough = clips.length === 1 && clips[0].kind === "video" && audio.keepOriginal && !buildTrack;

    for (const clip of clips) {
        const file = _serverFilePath(clip.serverRef);

        if (clip.kind === "image") {
            const loadId = alloc();
            prompt[loadId] = { class_type: "LoadImage", inputs: { image: file } };
            let imageOut = [loadId, 0];

            if (targetW && targetH && (clip.width !== targetW || clip.height !== targetH)) {
                const scaleId = alloc();
                prompt[scaleId] = {
                    class_type: "ImageScale",
                    inputs: { image: imageOut, upscale_method: "lanczos", width: targetW, height: targetH, crop: "center" },
                };
                imageOut = [scaleId, 0];
            }

            const repeatId = alloc();
            const amount = Math.round(_exportClipLength(clip) * _IMAGE_EXPORT_FPS);
            prompt[repeatId] = { class_type: "RepeatImageBatch", inputs: { image: imageOut, amount } };

            const createId = alloc();
            prompt[createId] = {
                class_type: "CreateVideo",
                inputs: { images: [repeatId, 0], fps: _IMAGE_EXPORT_FPS, codec: "auto" },
            };
            segments.push({ clip, videoOut: createId, componentsId: null });
            continue;
        }

        const loadId = alloc();
        prompt[loadId] = { class_type: "LoadVideo", inputs: { file } };

        const trimId = alloc();
        prompt[trimId] = {
            class_type: "Video Slice",
            inputs: {
                video: [loadId, 0],
                start_time: clip.trimStart,
                duration: _exportClipLength(clip),
                strict_duration: false,
            },
        };

        let clipOut = trimId;
        const crop = _cropPixels(clip);
        if (crop) {
            const cropId = alloc();
            // Double-nested on purpose — see module header.
            prompt[cropId] = { class_type: "VideoCrop", inputs: { video: [trimId, 0], crop: { crop } } };
            clipOut = cropId;
        }

        if (passthrough) {
            segments.push({ clip, videoOut: clipOut, componentsId: null });
            continue;
        }

        // Decompose/recompose through GetVideoComponents -> CreateVideo (audio
        // input left unset). Needed whenever clips are concatenated or the
        // soundtrack is rebuilt: ConcatenateVideo can't mix clips with
        // different audio layouts ("audio layout: expected None, got
        // 'stereo'"), nor a raw sliced file next to an image-derived clip
        // ("could not be encoded compatibly") — see module header. The clip's
        // own audio is picked up separately from the same GetVideoComponents
        // node (output 1) when building the soundtrack below.
        const componentsId = alloc();
        prompt[componentsId] = { class_type: "GetVideoComponents", inputs: { video: [clipOut, 0] } };
        let framesOut = [componentsId, 0];
        const size = _effectiveSize(clip);
        if (targetW && targetH && (size.width !== targetW || size.height !== targetH)) {
            // Only reachable for cropped clips (uncropped mismatches are
            // blocked by _findResolutionMismatch before export).
            const scaleId = alloc();
            prompt[scaleId] = {
                class_type: "ImageScale",
                inputs: { image: framesOut, upscale_method: "lanczos", width: targetW, height: targetH, crop: "center" },
            };
            framesOut = [scaleId, 0];
        }
        const silentId = alloc();
        prompt[silentId] = {
            class_type: "CreateVideo",
            inputs: { images: framesOut, fps: [componentsId, 2], codec: "auto" },
        };
        segments.push({ clip, videoOut: silentId, componentsId });
    }

    let completeAudio = null;
    if (buildTrack) {
        const emptyAudio = (duration) => {
            const id = alloc();
            prompt[id] = { class_type: "EmptyAudio", inputs: { duration, sample_rate: _AUDIO_SAMPLE_RATE, channels: 2 } };
            return [id, 0];
        };
        const total = segments.reduce((sum, seg) => sum + _exportClipLength(seg.clip), 0);

        let base;
        if (clipAudioUsed) {
            // One exact-length segment per clip: silence of the clip's length
            // with the clip's own audio merged in (AudioMerge pads/trims
            // audio2 to audio1's length, and passes audio1 through when the
            // clip has no audio at all), so segments stay aligned with video.
            const parts = segments.map((seg) => {
                const empty = emptyAudio(_exportClipLength(seg.clip));
                if (!seg.componentsId || !seg.clip.hasAudio) return empty;
                const mergeId = alloc();
                prompt[mergeId] = {
                    class_type: "AudioMerge",
                    inputs: { audio1: empty, audio2: [seg.componentsId, 1], merge_method: "add" },
                };
                return [mergeId, 0];
            });
            base = parts[0];
            for (const part of parts.slice(1)) {
                const concatId = alloc();
                prompt[concatId] = { class_type: "AudioConcat", inputs: { audio1: base, audio2: part, direction: "after" } };
                base = [concatId, 0];
            }
            const origDb = Math.round(audio.originalVolumeDb);
            if (origDb !== 0) {
                const volId = alloc();
                prompt[volId] = { class_type: "AudioAdjustVolume", inputs: { audio: base, volume: origDb } };
                base = [volId, 0];
            }
        } else {
            base = emptyAudio(total);
        }

        if (hasBgm) {
            const loadId = alloc();
            prompt[loadId] = { class_type: "LoadAudio", inputs: { audio: _serverFilePath(audio.bgm.serverRef) } };
            const trimId = alloc();
            prompt[trimId] = {
                class_type: "TrimAudioDuration",
                inputs: { audio: [loadId, 0], start_index: Math.max(0, audio.bgmOffset || 0), duration: total },
            };
            let bgmOut = [trimId, 0];
            const bgmDb = Math.round(audio.bgmVolumeDb);
            if (bgmDb !== 0) {
                const volId = alloc();
                prompt[volId] = { class_type: "AudioAdjustVolume", inputs: { audio: bgmOut, volume: bgmDb } };
                bgmOut = [volId, 0];
            }
            // base is exactly `total` long, so a longer BGM is cut and a
            // shorter one is padded with silence to match.
            const mixId = alloc();
            prompt[mixId] = { class_type: "AudioMerge", inputs: { audio1: base, audio2: bgmOut, merge_method: "add" } };
            base = [mixId, 0];
        }
        // Timeline sounds: trim to its in-file range, set the level, delay it to
        // its timeline position with leading silence, then mix over the base
        // (AudioMerge pads/cuts to base's length, so a sound running past the
        // end is cut).
        for (const snd of sounds) {
            if (snd.start >= total - 0.05) continue;
            const loadId = alloc();
            prompt[loadId] = { class_type: "LoadAudio", inputs: { audio: _serverFilePath(snd.serverRef) } };
            const trimId = alloc();
            prompt[trimId] = {
                class_type: "TrimAudioDuration",
                inputs: { audio: [loadId, 0], start_index: Math.max(0, snd.srcStart || 0), duration: Math.max(0.1, Math.min(snd.length, total - snd.start)) },
            };
            let out = [trimId, 0];
            const db = Math.round(snd.volumeDb);
            if (db !== 0) {
                const volId = alloc();
                prompt[volId] = { class_type: "AudioAdjustVolume", inputs: { audio: out, volume: db } };
                out = [volId, 0];
            }
            if (snd.start > 0.01) {
                const padId = alloc();
                prompt[padId] = { class_type: "AudioConcat", inputs: { audio1: emptyAudio(snd.start), audio2: out, direction: "after" } };
                out = [padId, 0];
            }
            const mixId = alloc();
            prompt[mixId] = { class_type: "AudioMerge", inputs: { audio1: base, audio2: out, merge_method: "add" } };
            base = [mixId, 0];
        }
        completeAudio = base;
    }

    let finalOutput;
    if (segments.length === 1 && !completeAudio) {
        finalOutput = [segments[0].videoOut, 0];
    } else {
        const concatId = alloc();
        const inputs = { codec: "auto" };
        // Autogrow's flat "videos.videoN" key format — see module header.
        segments.forEach((seg, i) => { inputs[`videos.video${i}`] = [seg.videoOut, 0]; });
        if (completeAudio) inputs.complete_audio = completeAudio;
        prompt[concatId] = { class_type: "ConcatenateVideo", inputs };
        finalOutput = [concatId, 0];
    }

    const saveId = alloc();
    prompt[saveId] = {
        class_type: "SaveVideo",
        inputs: { video: finalOutput, filename_prefix: filenamePrefix, format: "auto" },
    };
    return { prompt, saveId };
}

// Flattens every clip's (clip-relative) text overlays onto the exported
// timeline, in the shape /api/wfm/video/edit/overlay-text expects.
function _collectTimelineOverlays(clips) {
    const total = clips.reduce((sum, c) => sum + _exportClipLength(c), 0);
    const out = [];
    for (const o of _s.texts) {
        if (!o.text.trim()) continue;
        const start = Math.min(o.start, total);
        const end = Math.min(o.end, total);
        if (end <= start) continue;
        out.push({
            text: o.text,
            start,
            end,
            font_size: o.fontSize,
            color: o.color,
            anchor: o.anchor,
            outline: o.outline,
            background: o.background,
        });
    }
    return out;
}

// Overlay clips in the shape /api/wfm/video/edit/overlay-text expects.
function _collectPips(total) {
    return _s.pips
        .filter((p) => p.serverRef && p.length > 0 && p.start < total - 0.05)
        .map((p) => ({
            filename: p.serverRef.filename,
            subfolder: p.serverRef.subfolder || "",
            type: "input",
            kind: p.kind,
            src_start: p.kind === "video" ? p.srcStart : 0,
            start: p.start,
            length: Math.min(p.length, total - p.start),
            x: p.x,
            y: p.y,
            scale: p.scale,
            opacity: p.opacity,
        }));
}

function _setExportUi(running, pct, label) {
    const btn = document.getElementById("wfm-video-edit-export-btn");
    const bar = document.getElementById("wfm-video-edit-progress-bar");
    const text = document.getElementById("wfm-video-edit-progress-text");
    if (btn) btn.disabled = running;
    if (bar) bar.style.width = `${Math.round((pct || 0) * 100)}%`;
    if (text) text.textContent = running ? (label || t("videoEditExporting")) : "Ready";
}

async function _addOutputToVideoTemp(filename, subfolder) {
    await _fetchOutputDir();
    if (!_s.outputDir) return;
    const parts = [_s.outputDir];
    if (subfolder) parts.push(subfolder);
    parts.push(filename);
    const path = parts.join("/");
    try {
        await ensureVideoGroup();
        await fetch(`/wfm/gallery/groups/${encodeURIComponent(VTEMP_GROUP)}/add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
        });
    } catch (err) {
        console.warn("[VideoEdit] failed to tag export into video group:", err);
    }
}

async function _exportTimeline() {
    if (_s.exporting) return;
    _stopPreview();

    const readyClips = _s.clips.filter((c) => c.serverRef && !c.error);
    if (readyClips.length === 0) {
        showToast(t("videoEditNoClips"), "error");
        return;
    }
    if (_s.clips.some((c) => c.probing)) {
        showToast(t("videoEditStillProbing"), "error");
        return;
    }
    const mismatch = _findResolutionMismatch(readyClips);
    if (mismatch) {
        showToast(mismatch, "error");
        return;
    }

    _s.exporting = true;
    _setExportUi(true, 0);
    try {
        const wsOk = await comfyUI.connectWebSocket();
        if (!wsOk) throw new Error("Failed to connect WebSocket");

        // With text overlays the graph's output is only an intermediate
        // ("wfm_edit_pre", deleted by the burn-in step once it succeeds).
        const overlays = _collectTimelineOverlays(readyClips);
        const pips = _collectPips(readyClips.reduce((sum, c) => sum + _exportClipLength(c), 0));
        const needsBurn = overlays.length > 0 || pips.length > 0;
        const { prompt, saveId } = _buildExportWorkflow(readyClips, {
            filenamePrefix: needsBurn ? "video/wfm_edit_pre" : "video/wfm_edit",
        });
        const result = await comfyUI.queuePrompt(prompt);
        await comfyUI.trackProgress(result.prompt_id, (pct) => _setExportUi(true, pct));

        const history = await comfyUI.getHistory(result.prompt_id);
        let output = history?.outputs?.[saveId]?.images?.[0];
        if (!output) throw new Error("No output produced");

        if (needsBurn) {
            _setExportUi(true, 1, t("videoEditBurningText"));
            const res = await fetch("/api/wfm/video/edit/overlay-text", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename: output.filename,
                    subfolder: output.subfolder || "",
                    type: "output",
                    overlays,
                    pips,
                    delete_source: true,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            output = { filename: json.filename, subfolder: json.subfolder || "" };
        }

        const params = new URLSearchParams({ filename: output.filename, subfolder: output.subfolder || "", type: "output" });
        setResultPreview(`${comfyUI.baseUrl}/view?${params}`, { kind: "output", filename: output.filename, subfolder: output.subfolder || "", type: "output" });
        showToast(t("videoEditExportDone", output.filename), "success");
        await _addOutputToVideoTemp(output.filename, output.subfolder);
    } catch (err) {
        showToast(t("errorWithMsg", err.message), "error");
    } finally {
        _s.exporting = false;
        _setExportUi(false, 0);
    }
}

// ============================================
// Init
// ============================================

function _wireToolbar() {
    document.querySelectorAll("#wfm-video-edit-track-tabs .wfm-video-edit-track-tab").forEach((b) => {
        b.addEventListener("click", () => _setTrackView(b.dataset.track));
    });
    document.getElementById("wfm-video-edit-move-left-btn")?.addEventListener("click", () => {
        if (_s.selectedId != null) _moveClip(_s.selectedId, -1);
    });
    document.getElementById("wfm-video-edit-move-right-btn")?.addEventListener("click", () => {
        if (_s.selectedId != null) _moveClip(_s.selectedId, 1);
    });
    document.getElementById("wfm-video-edit-duplicate-btn")?.addEventListener("click", () => {
        if (_s.selectedId != null) _duplicateClip(_s.selectedId);
    });
    document.getElementById("wfm-video-edit-delete-btn")?.addEventListener("click", () => {
        if (_s.selectedId != null) _deleteClip(_s.selectedId);
    });
    document.getElementById("wfm-video-edit-preview-btn")?.addEventListener("click", _togglePreview);
    document.getElementById("wfm-video-edit-clear-btn")?.addEventListener("click", _clearTimeline);

    // Dropping a dragged block past the last one (onto empty track space)
    // moves it to the end — block-level drop handlers stopPropagation() so
    // this only fires for drops that miss every block.
    const track = document.getElementById("wfm-video-edit-timeline-track");
    track?.addEventListener("dragover", (e) => e.preventDefault());
    track?.addEventListener("drop", (e) => {
        e.preventDefault();
        _reorderByDrop(null);
    });
}

// ============================================
// Undo/Redo (Phase 5) — snapshot history of the editorial state (clip order,
// trim, crop, text overlays, audio settings). Rather than instrumenting every
// edit path, the three redraw hooks every edit already goes through
// (_renderTimeline / _refreshTextPreview / _syncAudioPanel) schedule a
// debounced _recordState(), which only pushes when the serialized state
// actually differs from the last entry — so selection changes, previews and
// resizes never create history entries, and a burst (typing, dragging a crop
// handle or trim slider) collapses into one step.
// Clip File objects aren't serialized: _clipRegistry keeps every clip ever
// added by id, so undoing a delete can restore it without re-uploading.
// ============================================

const _HISTORY_LIMIT = 100;
const _clipRegistry = new Map(); // clip id -> clip object (static fields: file, serverRef, size, ...)
const _bgmRegistry = new Map(); // bgm key -> bgm object
const _soundRegistry = new Map(); // sound id -> static fields { name, file, serverRef, duration }
const _pipRegistry = new Map(); // overlay clip id -> static fields { name, file, kind, serverRef, duration, width, height, thumb }
const _history = { stack: [], index: -1, restoring: false, timer: null };

function _bgmKey(bgm) {
    return bgm ? `${bgm.serverRef?.subfolder || ""}/${bgm.serverRef?.filename}|${bgm.name}` : null;
}

function _snapshot() {
    return JSON.stringify({
        clips: _s.clips.map((c) => ({
            id: c.id,
            trimStart: c.trimStart,
            trimEnd: c.trimEnd,
            duration: c.duration,
            crop: c.crop,
        })),
        texts: _s.texts,
        sounds: _s.sounds.map(({ id, srcStart, length, start, volumeDb }) => ({ id, srcStart, length, start, volumeDb })),
        pips: _s.pips.map(({ id, srcStart, length, start, x, y, scale, opacity }) => ({ id, srcStart, length, start, x, y, scale, opacity })),
        audio: {
            keepOriginal: _s.audio.keepOriginal,
            originalVolumeDb: _s.audio.originalVolumeDb,
            bgmVolumeDb: _s.audio.bgmVolumeDb,
            bgmOffset: _s.audio.bgmOffset,
            bgm: _bgmKey(_s.audio.bgm),
        },
    });
}

function _scheduleRecord() {
    if (_history.restoring) return;
    clearTimeout(_history.timer);
    _history.timer = setTimeout(_recordState, 300);
}

function _recordState() {
    _history.timer = null;
    // Mid-upload clips have placeholder trim values; their probe completion
    // re-renders the timeline, which records the settled state.
    if (_history.restoring || _s.clips.some((c) => c.probing)) return;
    if (_s.audio.bgm) _bgmRegistry.set(_bgmKey(_s.audio.bgm), _s.audio.bgm);
    for (const x of _s.pips) _pipRegistry.set(x.id, { name: x.name, file: x.file, kind: x.kind, serverRef: x.serverRef, duration: x.duration, width: x.width, height: x.height, thumb: x.thumb });
    for (const x of _s.sounds) _soundRegistry.set(x.id, { name: x.name, file: x.file, serverRef: x.serverRef, duration: x.duration });
    const snap = _snapshot();
    if (_history.stack[_history.index] === snap) return;
    _history.stack.splice(_history.index + 1);
    _history.stack.push(snap);
    if (_history.stack.length > _HISTORY_LIMIT) _history.stack.shift();
    _history.index = _history.stack.length - 1;
    _updateUndoButtons();
}

// Drops all history and starts over from the current state (project load).
function _resetHistory() {
    clearTimeout(_history.timer);
    _history.stack = [];
    _history.index = -1;
    _recordState();
}

function _restoreSnapshot(snap) {
    const data = JSON.parse(snap);
    _history.restoring = true;
    try {
        _stopPreview();
        const prevSelected = _s.selectedId;
        _s.clips = data.clips
            .filter((e) => _clipRegistry.has(e.id))
            .map((e) => {
                const clip = {
                    ..._clipRegistry.get(e.id),
                    trimStart: e.trimStart,
                    trimEnd: e.trimEnd,
                    duration: e.duration,
                    crop: e.crop ? { ...e.crop } : null,
                };
                _clipRegistry.set(clip.id, clip);
                return clip;
            });
        _s.texts = (data.texts || []).map((o) => ({ ...o }));
        _s.sounds = (data.sounds || []).filter((e) => _soundRegistry.has(e.id)).map((e) => ({ ..._soundRegistry.get(e.id), ...e }));
        _s.pips = (data.pips || []).filter((e) => _pipRegistry.has(e.id)).map((e) => ({ ..._pipRegistry.get(e.id), ...e }));
        _s.audio = {
            keepOriginal: data.audio.keepOriginal,
            originalVolumeDb: data.audio.originalVolumeDb,
            bgmVolumeDb: data.audio.bgmVolumeDb,
            bgmOffset: data.audio.bgmOffset,
            bgm: data.audio.bgm ? _bgmRegistry.get(data.audio.bgm) || null : null,
        };
        if (!_s.clips.some((c) => c.id === _s.selectedId)) _s.selectedId = _s.clips[0]?.id ?? null;
        _cropEditing = false;
        _renderTimeline();
        _renderTrimPanel();
        _renderSoundList();
        _renderPipList();
        _syncAudioPanel();
        const clip = _selectedClip();
        if (!clip) { setSourcePreview(null, null); _clearTextLayer("source"); _clearCropLayer("source"); }
        else if (clip.id !== prevSelected) _setClipSourcePreview(clip);
        else _refreshSourceTextPreview();
    } finally {
        _history.restoring = false;
    }
    _updateUndoButtons();
}

function _undo() {
    if (_history.timer) { clearTimeout(_history.timer); _recordState(); }
    if (_history.index <= 0) return;
    _history.index -= 1;
    _restoreSnapshot(_history.stack[_history.index]);
}

function _redo() {
    if (_history.timer) { clearTimeout(_history.timer); _recordState(); }
    if (_history.index >= _history.stack.length - 1) return;
    _history.index += 1;
    _restoreSnapshot(_history.stack[_history.index]);
}

function _updateUndoButtons() {
    const undoBtn = document.getElementById("wfm-video-edit-undo-btn");
    const redoBtn = document.getElementById("wfm-video-edit-redo-btn");
    if (undoBtn) undoBtn.disabled = _history.index <= 0;
    if (redoBtn) redoBtn.disabled = _history.index >= _history.stack.length - 1;
}

function _isEditSubtabVisible() {
    const panel = document.getElementById("wfm-video-subtab-edit");
    return !!panel && panel.offsetParent !== null;
}

function _wireUndoRedo() {
    document.getElementById("wfm-video-edit-undo-btn")?.addEventListener("click", _undo);
    document.getElementById("wfm-video-edit-redo-btn")?.addEventListener("click", _redo);
    document.addEventListener("keydown", (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey || !_isEditSubtabVisible()) return;
        // Leave native undo alone inside text fields.
        const tag = e.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
        const key = e.key.toLowerCase();
        if (key === "z" && !e.shiftKey) { e.preventDefault(); _undo(); }
        else if (key === "y" || (key === "z" && e.shiftKey)) { e.preventDefault(); _redo(); }
    });
    _updateUndoButtons();
}

// ============================================
// Audio panel (Phase 4) — timeline-wide soundtrack settings in the export
// panel. The BGM file is uploaded to ComfyUI's input folder right away (same
// upload-on-add pattern as clips) so export only needs its server filename.
// ============================================

function _readAudioDuration(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const el = new Audio();
        const done = (d) => { URL.revokeObjectURL(url); resolve(d); };
        el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : 0);
        el.onerror = () => done(0);
        el.src = url;
    });
}

function _isVideoLike(file) {
    return file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
}

// Uploads an audio source (BGM or a timeline sound) to ComfyUI's input folder
// and returns { duration, serverRef }; throws if it's a video without audio.
async function _prepareAudioFile(file) {
    // Duration first: reading it after the upload can fail if the picked
    // file is itself the one the upload just overwrote on disk.
    const duration = await _readAudioDuration(file);
    const uploaded = await comfyUI.uploadImage(file, file.name);
    const serverRef = { filename: uploaded.name, subfolder: uploaded.subfolder || "", type: "input" };
    // A video works as an audio source too (LoadAudio decodes its audio
    // track) — but only if it has one; otherwise export would fail later.
    if (_isVideoLike(file)) {
        const params = new URLSearchParams(serverRef);
        const res = await fetch(`/api/wfm/video/edit/probe?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (!json.has_audio) throw new Error(t("videoEditBgmNoAudio"));
    }
    return { duration, serverRef };
}

async function _setBgmFile(file, displayName) {
    const nameEl = document.getElementById("wfm-video-edit-bgm-name");
    if (nameEl) nameEl.textContent = t("videoEditProbing");
    try {
        const { duration, serverRef } = await _prepareAudioFile(file);
        _s.audio.bgm = { name: displayName || file.name, file, serverRef, duration };
    } catch (err) {
        // Keep whatever BGM was set before — a failed pick shouldn't clear it.
        showToast(t("errorWithMsg", err.message), "error");
    }
    _syncAudioPanel();
}

// A sound is an extra audio clip placed at a timeline position (default: the
// selected clip's start, full length capped to the timeline).
async function _addSound(file, displayName, init = {}) {
    try {
        const { duration, serverRef } = await _prepareAudioFile(file);
        const win = _clipOffsets().find((o) => o.clip.id === _s.selectedId);
        const total = _totalLength();
        const start = init.start ?? (win ? win.start : 0);
        const room = total > start ? total - start : 0;
        const natural = duration || 5;
        const length = init.length ?? Math.max(0.1, room ? Math.min(natural, room) : natural);
        _s.sounds.push({
            id: _nextSoundId++,
            name: displayName || file.name,
            file,
            serverRef,
            duration,
            srcStart: init.srcStart ?? 0,
            length,
            start,
            volumeDb: init.volumeDb ?? 0,
        });
    } catch (err) {
        showToast(t("errorWithMsg", err.message), "error");
    }
    _renderSoundList();
    _syncAudioPanel();
}

// Overlay-clip frame height as a fraction of the output frame height (its own
// aspect ratio at the chosen width, against the first video clip's output size).
function _pipHeightFrac(p) {
    const base = _effectiveSize(_s.clips.find((c) => c.kind === "video") || _s.clips[0] || {});
    const baseAspect = base.width && base.height ? base.width / base.height : 16 / 9;
    const ratio = p.width && p.height ? p.height / p.width : 9 / 16;
    return p.scale * ratio * baseAspect;
}

// A still frame to show inside the preview box: the image itself, or the
// video's frame at its in-file start captured through a canvas.
function _makePipThumb(file, kind, atSec) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        if (kind === "image") { resolve(url); return; }
        const v = document.createElement("video");
        const done = (d) => { URL.revokeObjectURL(url); resolve(d); };
        const guard = setTimeout(() => done(""), 4000);
        v.muted = true;
        v.preload = "auto";
        v.onerror = () => { clearTimeout(guard); done(""); };
        v.onloadeddata = () => { v.currentTime = Math.min(atSec, Math.max(0, (v.duration || 0) - 0.05)); };
        v.onseeked = () => {
            clearTimeout(guard);
            try {
                const c = document.createElement("canvas");
                c.width = 160;
                c.height = Math.max(1, Math.round(160 * v.videoHeight / Math.max(1, v.videoWidth)));
                c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
                done(c.toDataURL("image/jpeg", 0.7));
            } catch { done(""); }
        };
        v.src = url;
    });
}

// Default centres for freshly-added overlay clips: bottom-right, top-left,
// top-right, bottom-left, then the middle — so consecutive additions don't
// land exactly on top of each other. (Scale defaults to 30% of the frame width.)
const _PIP_DEFAULT_SPOTS = [[0.78, 0.78], [0.22, 0.22], [0.78, 0.22], [0.22, 0.78], [0.5, 0.5]];

// Exported for video-asset-tab.js's "Add as overlay" button. Resolves to
// whether the overlay was actually added (a failed upload/probe only toasts).
export function addPipFromFile(file, displayName) {
    return _addPip(file, displayName);
}

async function _addPip(file, displayName, init = {}) {
    let added = false;
    try {
        const kind = file.type.startsWith("image/") ? "image" : "video";
        const uploaded = await comfyUI.uploadImage(file, file.name);
        const serverRef = { filename: uploaded.name, subfolder: uploaded.subfolder || "", type: "input" };
        let duration = 0;
        let width = 0;
        let height = 0;
        if (kind === "video") {
            const params = new URLSearchParams(serverRef);
            const res = await fetch(`/api/wfm/video/edit/probe?${params}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            duration = json.duration || 0;
            width = json.width || 0;
            height = json.height || 0;
        } else {
            ({ width, height } = await _readImageDimensions(file));
        }
        const win = _clipOffsets().find((o) => o.clip.id === _s.selectedId);
        const total = _totalLength();
        const start = init.start ?? (win ? win.start : 0);
        const room = total > start ? total - start : 0;
        const natural = kind === "image" ? _DEFAULT_IMAGE_DURATION : (duration || 5);
        const length = init.length ?? Math.max(0.1, room ? Math.min(natural, room) : natural);
        const srcStart = kind === "video" ? (init.srcStart ?? 0) : 0;
        const thumb = await _makePipThumb(file, kind, srcStart);
        const spot = _PIP_DEFAULT_SPOTS[_s.pips.length % _PIP_DEFAULT_SPOTS.length];
        _s.pips.push({
            id: _nextPipId++, name: displayName || file.name, file, kind, serverRef, duration, width, height, thumb,
            srcStart, length, start,
            x: init.x ?? spot[0], y: init.y ?? spot[1], scale: init.scale ?? 0.3, opacity: init.opacity ?? 1,
        });
        added = true;
    } catch (err) {
        showToast(t("errorWithMsg", err.message), "error");
    }
    _renderPipList();
    _refreshTextPreview();
    return added;
}

// Same rebuild-only-when-needed rule as the sound list.
function _renderPipList() {
    const host = document.getElementById("wfm-video-edit-pip-list");
    if (!host) return;
    host.innerHTML = "";
    if (!_s.pips.length) {
        host.innerHTML = `<span class="wfm-placeholder">${t("videoEditPipNone")}</span>`;
        return;
    }
    const anchorLabels = t("videoEditTextAnchorLabels");
    const presetOptions = `<option value="">${t("videoEditPipPreset")}</option>` + _TEXT_ANCHORS
        .map((a, i) => `<option value="${a}">${Array.isArray(anchorLabels) ? anchorLabels[i] : a}</option>`)
        .join("");
    for (const p of _s.pips) {
        const row = document.createElement("div");
        row.className = "wfm-video-edit-sound-row wfm-video-edit-pip-row";
        row.innerHTML = `
            <div class="wfm-video-edit-sound-row-head">
                <span class="wfm-video-edit-sound-name" data-k="name"></span>
                <select class="wfm-input wfm-video-edit-pip-preset" data-k="preset">${presetOptions}</select>
                <button type="button" class="wfm-btn wfm-btn-xs wfm-btn-danger" data-act="delete" title="${t("videoEditDelete")}">\u2715</button>
            </div>
            <div class="wfm-video-edit-sound-grid">
                <label>${t("videoEditSoundStart")}<input type="number" class="wfm-input" data-k="start" step="0.1" min="0"></label>
                <label>${t("videoEditSoundLength")}<input type="number" class="wfm-input" data-k="length" step="0.1" min="0.1"></label>
                <label>${t("videoEditPipSize")}<input type="number" class="wfm-input" data-k="scale" step="1" min="5" max="100"></label>
                <label>${t("videoEditPipX")}<input type="number" class="wfm-input" data-k="x" step="1" min="0" max="100"></label>
                <label>${t("videoEditPipY")}<input type="number" class="wfm-input" data-k="y" step="1" min="0" max="100"></label>
                <label>${t("videoEditPipOpacity")}<input type="number" class="wfm-input" data-k="opacity" step="5" min="0" max="100"></label>
            </div>`;
        const el = (k) => row.querySelector(`[data-k="${k}"]`);
        const fill = () => {
            el("start").value = p.start.toFixed(2);
            el("length").value = p.length.toFixed(2);
            el("scale").value = Math.round(p.scale * 100);
            el("x").value = Math.round(p.x * 100);
            el("y").value = Math.round(p.y * 100);
            el("opacity").value = Math.round(p.opacity * 100);
        };
        el("name").textContent = p.name;
        el("name").title = p.name;
        fill();
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        el("start").addEventListener("change", () => { p.start = Math.max(0, Number(el("start").value) || 0); fill(); _refreshTextPreview(); });
        el("length").addEventListener("change", () => {
            const max = p.kind === "video" && p.duration ? Math.max(0.1, p.duration - p.srcStart) : Infinity;
            p.length = clamp(Number(el("length").value) || 0.1, 0.1, max);
            fill();
            _refreshTextPreview();
        });
        el("scale").addEventListener("change", () => { p.scale = clamp((Number(el("scale").value) || 30) / 100, 0.05, 1); fill(); _refreshTextPreview(); });
        el("x").addEventListener("change", () => { p.x = clamp((Number(el("x").value) || 0) / 100, 0, 1); fill(); _refreshTextPreview(); });
        el("y").addEventListener("change", () => { p.y = clamp((Number(el("y").value) || 0) / 100, 0, 1); fill(); _refreshTextPreview(); });
        el("opacity").addEventListener("change", () => { p.opacity = clamp((Number(el("opacity").value) || 0) / 100, 0, 1); fill(); _refreshTextPreview(); });
        el("preset").addEventListener("change", () => {
            const [v, hz] = (el("preset").value || "").split("-");
            el("preset").value = "";
            if (!v) return;
            const m = 0.03;
            const hf = _pipHeightFrac(p);
            p.x = hz === "left" ? m + p.scale / 2 : hz === "right" ? 1 - m - p.scale / 2 : 0.5;
            p.y = v === "top" ? m + hf / 2 : v === "bottom" ? 1 - m - hf / 2 : 0.5;
            p.x = clamp(p.x, 0, 1);
            p.y = clamp(p.y, 0, 1);
            fill();
            _refreshTextPreview();
        });
        row.querySelector('[data-act="delete"]').addEventListener("click", () => {
            _s.pips = _s.pips.filter((x) => x.id !== p.id);
            _renderPipList();
            _refreshTextPreview();
        });
        host.appendChild(row);
    }
}

// Rebuilt only on add/remove/restore/drag-end — never on a plain edit, which
// would replace the input the user is typing in.
function _renderSoundList() {
    const host = document.getElementById("wfm-video-edit-sound-list");
    if (!host) return;
    host.innerHTML = "";
    if (!_s.sounds.length) {
        host.innerHTML = `<span class="wfm-placeholder">${t("videoEditSoundNone")}</span>`;
        return;
    }
    for (const snd of _s.sounds) {
        const row = document.createElement("div");
        row.className = "wfm-video-edit-sound-row";
        row.innerHTML = `
            <div class="wfm-video-edit-sound-row-head">
                <span class="wfm-video-edit-sound-name" data-k="name"></span>
                <button type="button" class="wfm-btn wfm-btn-xs wfm-btn-danger" data-act="delete" title="${t("videoEditDelete")}">\u2715</button>
            </div>
            <div class="wfm-video-edit-sound-grid">
                <label>${t("videoEditSoundStart")}<input type="number" class="wfm-input" data-k="start" step="0.1" min="0"></label>
                <label>${t("videoEditSoundLength")}<input type="number" class="wfm-input" data-k="length" step="0.1" min="0.1"></label>
                <label>${t("videoEditSoundVolume")}<input type="number" class="wfm-input" data-k="volumeDb" step="1" min="-30" max="12"></label>
            </div>`;
        const el = (k) => row.querySelector(`[data-k="${k}"]`);
        el("name").textContent = snd.name;
        el("name").title = snd.name;
        el("start").value = snd.start.toFixed(2);
        el("length").value = snd.length.toFixed(2);
        el("volumeDb").value = snd.volumeDb;
        el("start").addEventListener("change", () => {
            snd.start = Math.max(0, Number(el("start").value) || 0);
            el("start").value = snd.start.toFixed(2);
            _syncAudioPanel();
        });
        el("length").addEventListener("change", () => {
            const max = snd.duration ? Math.max(0.1, snd.duration - snd.srcStart) : Infinity;
            snd.length = Math.max(0.1, Math.min(Number(el("length").value) || 0.1, max));
            el("length").value = snd.length.toFixed(2);
            _syncAudioPanel();
        });
        el("volumeDb").addEventListener("change", () => {
            snd.volumeDb = Math.max(-30, Math.min(12, Math.round(Number(el("volumeDb").value) || 0)));
            el("volumeDb").value = snd.volumeDb;
            _syncAudioPanel();
        });
        row.querySelector('[data-act="delete"]').addEventListener("click", () => {
            _s.sounds = _s.sounds.filter((x) => x.id !== snd.id);
            _renderSoundList();
            _syncAudioPanel();
        });
        host.appendChild(row);
    }
}

// Entry point for video-asset-tab.js's "Add as Sound" button (an audio asset becomes
// a timeline sound at the selected clip's start). Resolves once the sound is added.
export async function addSoundFromFile(file, displayName) {
    const before = _s.sounds.length;
    await _addSound(file, displayName);
    return _s.sounds.length > before;
}

// Entry point for video-asset-tab.js's "Set as BGM" button (a video asset's
// audio track becomes the BGM). Returns whether the BGM was actually set.
export async function setBgmFromFile(file, displayName) {
    _s.audio.bgmOffset = 0;
    await _setBgmFile(file, displayName);
    return !!_s.audio.bgm && _s.audio.bgm.file === file;
}

function _syncAudioPanel() {
    _scheduleRecord();
    if (_s.trackView === "audio") _renderTimeline();
    _updateToolbarState();
    const a = _s.audio;
    const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
    set("wfm-video-edit-keep-audio", (el) => { el.checked = a.keepOriginal; });
    set("wfm-video-edit-orig-vol", (el) => { el.value = a.originalVolumeDb; el.disabled = !a.keepOriginal; });
    set("wfm-video-edit-orig-vol-val", (el) => { el.textContent = `${a.originalVolumeDb} dB`; });
    set("wfm-video-edit-bgm-vol", (el) => { el.value = a.bgmVolumeDb; el.disabled = !a.bgm; });
    set("wfm-video-edit-bgm-vol-val", (el) => { el.textContent = `${a.bgmVolumeDb} dB`; });
    set("wfm-video-edit-bgm-offset", (el) => { el.value = a.bgmOffset; el.disabled = !a.bgm; });
    set("wfm-video-edit-bgm-clear", (el) => { el.disabled = !a.bgm; });
    set("wfm-video-edit-bgm-name", (el) => {
        el.textContent = a.bgm ? `${a.bgm.name}${a.bgm.duration ? ` (${_fmtTime(a.bgm.duration)})` : ""}` : t("videoEditBgmNone");
        el.title = a.bgm?.name || "";
    });
}

function _wireAudioPanel() {
    const byId = (id) => document.getElementById(id);
    byId("wfm-video-edit-keep-audio")?.addEventListener("change", (e) => {
        _s.audio.keepOriginal = e.target.checked;
        _syncAudioPanel();
    });
    byId("wfm-video-edit-orig-vol")?.addEventListener("input", (e) => {
        _s.audio.originalVolumeDb = Number(e.target.value) || 0;
        _syncAudioPanel();
    });
    byId("wfm-video-edit-bgm-vol")?.addEventListener("input", (e) => {
        _s.audio.bgmVolumeDb = Number(e.target.value) || 0;
        if (_bgmPreviewEl) _bgmPreviewEl.volume = _dbToGain(_s.audio.bgmVolumeDb);
        _syncAudioPanel();
    });
    byId("wfm-video-edit-bgm-offset")?.addEventListener("change", (e) => {
        // TrimAudioDuration errors if the start is past the end of the file.
        const max = _s.audio.bgm?.duration ? Math.max(0, _s.audio.bgm.duration - 0.1) : Infinity;
        _s.audio.bgmOffset = Math.max(0, Math.min(Number(e.target.value) || 0, max));
        _syncAudioPanel();
    });
    const input = byId("wfm-video-edit-bgm-input");
    // The picker opens natively via its wrapping <label> (see index.html).
    input?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) {
            _s.audio.bgmOffset = 0;
            _setBgmFile(file);
        }
        e.target.value = "";
    });
    // Drag & drop an audio (or video) file anywhere on the Audio section.
    const panel = document.querySelector(".wfm-video-edit-audio-panel");
    panel?.addEventListener("dragover", (e) => {
        if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
        e.preventDefault();
        panel.classList.add("drag-over");
    });
    panel?.addEventListener("dragleave", () => panel.classList.remove("drag-over"));
    panel?.addEventListener("drop", (e) => {
        const file = e.dataTransfer?.files?.[0];
        panel.classList.remove("drag-over");
        if (!file) return;
        e.preventDefault();
        if (!file.type.startsWith("audio/") && !_isVideoLike(file) && !/\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(file.name)) {
            showToast(t("videoEditBgmUnsupported"), "error");
            return;
        }
        _s.audio.bgmOffset = 0;
        _setBgmFile(file);
    });
    byId("wfm-video-edit-pip-input")?.addEventListener("change", async (e) => {
        const files = [...(e.target.files || [])];
        e.target.value = "";
        for (const file of files) await _addPip(file);
    });
    byId("wfm-video-edit-sound-input")?.addEventListener("change", async (e) => {
        const files = [...(e.target.files || [])];
        e.target.value = "";
        for (const file of files) await _addSound(file);
    });
    byId("wfm-video-edit-bgm-clear")?.addEventListener("click", () => {
        _s.audio.bgm = null;
        _s.audio.bgmOffset = 0;
        _syncAudioPanel();
    });
    _renderSoundList();
    _renderPipList();
    _syncAudioPanel();
}

// ============================================
// Project persistence (Save/Save As/Load) — see VIDEO_EDIT_TAB_PLAN.md
// section 5 "永続化". Only clips that already have a serverRef (i.e. finished
// uploading+probing) are persisted; a clip still mid-upload when Save is
// clicked is silently skipped rather than saved half-formed.
// ============================================

function _buildProjectData() {
    return {
        clips: _s.clips
            .filter((c) => c.serverRef)
            .map((c) => ({
                name: c.name,
                kind: c.kind,
                serverRef: c.serverRef,
                trimStart: c.trimStart,
                trimEnd: c.trimEnd,
                duration: c.duration,
                width: c.width,
                height: c.height,
                fps: c.fps,
                crop: c.crop,
            })),
        // Timeline-absolute text overlays (projects saved before this have
        // clip-relative "texts" inside each clip entry - migrated on load).
        texts: _s.texts.map(({ id, ...rest }) => rest),
        pips: _s.pips
            .filter((x) => x.serverRef)
            .map((x) => ({ name: x.name, kind: x.kind, serverRef: x.serverRef, srcStart: x.srcStart, length: x.length, start: x.start, x: x.x, y: x.y, scale: x.scale, opacity: x.opacity })),
        sounds: _s.sounds
            .filter((x) => x.serverRef)
            .map((x) => ({ name: x.name, serverRef: x.serverRef, srcStart: x.srcStart, length: x.length, start: x.start, volumeDb: x.volumeDb })),
        audio: {
            keepOriginal: _s.audio.keepOriginal,
            originalVolumeDb: _s.audio.originalVolumeDb,
            bgmVolumeDb: _s.audio.bgmVolumeDb,
            bgmOffset: _s.audio.bgmOffset,
            bgm: _s.audio.bgm ? { name: _s.audio.bgm.name, serverRef: _s.audio.bgm.serverRef } : null,
        },
    };
}

function _updateProjectNameUI() {
    const el = document.getElementById("wfm-video-edit-project-name");
    if (el) el.textContent = _s.projectFilename ? _s.projectFilename.replace(/\.json$/i, "") : "";
}

async function _saveProject(filenameOverride, forceNewName = false) {
    let inputName = filenameOverride;
    if (!inputName) {
        if (forceNewName || !_s.projectFilename) {
            inputName = window.prompt(t("videoEditProjectEnterName"), "");
            if (!inputName) return;
        } else {
            inputName = _s.projectFilename;
        }
    }

    const baseName = inputName.replace(/\.json$/i, "").replace(new RegExp(`^${VIDEO_EDIT_PROJECT_PREFIX}`, "i"), "");
    const filename = `${VIDEO_EDIT_PROJECT_PREFIX}${baseName}.json`;
    const data = _buildProjectData();

    try {
        const res = await fetch("/api/wfm/video/edit/projects/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, data }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        _s.projectFilename = json.filename;
        _updateProjectNameUI();
        showToast(t("videoEditProjectSaved"), "success");
    } catch (err) {
        showToast(`${t("videoEditProjectSaveFailed")}: ${err.message}`, "error");
    }
}

// Waits for a just-added clip's async upload+probe (see _probeClip/_probeImageClip)
// to finish, so the caller can then override the freshly-probed trimStart/trimEnd
// with the values that were actually saved in the project file.
function _waitForProbe(id) {
    return new Promise((resolve) => {
        const check = () => {
            const c = _s.clips.find((cl) => cl.id === id);
            if (!c || !c.probing) resolve(c);
            else setTimeout(check, 100);
        };
        check();
    });
}

// Re-adds one saved clip by fetching its still-existing server-side file back
// as a Blob and feeding it through the exact same addClipFromFile() path a
// fresh drag-and-drop uses (re-upload + re-probe) — rather than trusting the
// saved serverRef/duration/width/height directly, since the input file could
// have been deleted or replaced since the project was saved. Once probing
// settles, the saved trim points are applied on top of the freshly-probed
// (full-length) defaults.
async function _restoreClipFromSaved(entry) {
    if (!entry?.serverRef?.filename) return null;
    try {
        const params = new URLSearchParams({
            filename: entry.serverRef.filename,
            subfolder: entry.serverRef.subfolder || "",
            type: entry.serverRef.type || "input",
        });
        const res = await fetch(`${comfyUI.baseUrl}/view?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const mime = entry.kind === "image" ? "image/png" : "video/mp4";
        const file = new File([blob], entry.name || entry.serverRef.filename, { type: blob.type || mime });

        const beforeIds = new Set(_s.clips.map((c) => c.id));
        addClipFromFile(file, entry.name);
        const newClip = _s.clips.find((c) => !beforeIds.has(c.id));
        if (!newClip) return null;

        await _waitForProbe(newClip.id);
        const c = _s.clips.find((cl) => cl.id === newClip.id);
        if (!c || c.error) return null;
        if (c.kind === "video") {
            c.trimStart = Math.max(0, Math.min(entry.trimStart ?? 0, c.duration));
            c.trimEnd = Math.max(c.trimStart + 0.1, Math.min(entry.trimEnd ?? c.duration, c.duration));
        } else {
            c.trimEnd = Math.max(0.1, entry.trimEnd ?? c.trimEnd);
        }
        const sc = entry.crop;
        c.crop = c.kind === "video" && sc && [sc.x, sc.y, sc.w, sc.h].every(Number.isFinite) ? { x: sc.x, y: sc.y, w: sc.w, h: sc.h } : null;
        _renderTimeline();
        if (_s.selectedId === c.id) _renderTrimPanel();
        return c;
    } catch (err) {
        showToast(t("errorWithMsg", `${entry.name || ""}: ${err.message}`), "error");
        return null;
    }
}

// Projects saved before Phase 4 have no "audio" key — they fall back to the
// defaults (original audio kept, no BGM). A saved BGM is re-fetched and
// re-uploaded the same way clips are (see _restoreClipFromSaved).
async function _restoreAudioFromSaved(saved) {
    const defaults = _defaultAudio();
    _s.audio = {
        keepOriginal: saved?.keepOriginal ?? defaults.keepOriginal,
        originalVolumeDb: Number(saved?.originalVolumeDb) || defaults.originalVolumeDb,
        bgm: null,
        bgmVolumeDb: saved?.bgmVolumeDb ?? defaults.bgmVolumeDb,
        bgmOffset: Number(saved?.bgmOffset) || defaults.bgmOffset,
    };
    const ref = saved?.bgm?.serverRef;
    if (ref?.filename) {
        try {
            const params = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder || "", type: ref.type || "input" });
            const res = await fetch(`${comfyUI.baseUrl}/view?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const name = saved.bgm.name || ref.filename;
            await _setBgmFile(new File([blob], ref.filename, { type: blob.type || "audio/mpeg" }), name);
        } catch (err) {
            showToast(t("errorWithMsg", `BGM: ${err.message}`), "error");
        }
    }
    _syncAudioPanel();
}

// Re-fetches and re-uploads each saved sound the same way the BGM is restored.
async function _restoreSoundsFromSaved(saved) {
    _s.sounds = [];
    for (const e of Array.isArray(saved) ? saved : []) {
        const ref = e?.serverRef;
        if (!ref?.filename) continue;
        try {
            const params = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder || "", type: ref.type || "input" });
            const res = await fetch(`${comfyUI.baseUrl}/view?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            await _addSound(new File([blob], ref.filename, { type: blob.type || "audio/mpeg" }), e.name || ref.filename, {
                start: Math.max(0, Number(e.start) || 0),
                length: Math.max(0.1, Number(e.length) || 0.1),
                srcStart: Math.max(0, Number(e.srcStart) || 0),
                volumeDb: Number(e.volumeDb) || 0,
            });
        } catch (err) {
            showToast(t("errorWithMsg", `${e.name || ""}: ${err.message}`), "error");
        }
    }
}

// Re-fetches and re-uploads each saved overlay clip (see _restoreSoundsFromSaved).
async function _restorePipsFromSaved(saved) {
    _s.pips = [];
    for (const e of Array.isArray(saved) ? saved : []) {
        const ref = e?.serverRef;
        if (!ref?.filename) continue;
        try {
            const params = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder || "", type: ref.type || "input" });
            const res = await fetch(`${comfyUI.baseUrl}/view?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const fallback = e.kind === "image" ? "image/png" : "video/mp4";
            await _addPip(new File([blob], ref.filename, { type: blob.type || fallback }), e.name || ref.filename, {
                start: Math.max(0, Number(e.start) || 0),
                length: Math.max(0.1, Number(e.length) || 0.1),
                srcStart: Math.max(0, Number(e.srcStart) || 0),
                x: Number.isFinite(e.x) ? e.x : 0.78,
                y: Number.isFinite(e.y) ? e.y : 0.78,
                scale: Number.isFinite(e.scale) ? e.scale : 0.3,
                opacity: Number.isFinite(e.opacity) ? e.opacity : 1,
            });
        } catch (err) {
            showToast(t("errorWithMsg", `${e.name || ""}: ${err.message}`), "error");
        }
    }
}

async function _loadProjectData(filename, data) {
    _stopPreview();
    _s.clips = [];
    _s.selectedId = null;
    setSourcePreview(null, null);
    _clearTextLayer("source");

    const entries = Array.isArray(data.clips) ? data.clips : [];
    // Sequential, not parallel: addClipFromFile() appends to _s.clips, so
    // restoring one at a time is what keeps the reloaded timeline in the
    // same clip order it was saved in.
    const restored = [];
    for (const entry of entries) {
        restored.push({ entry, clip: await _restoreClipFromSaved(entry) });
    }
    const asOverlay = (o, shift = 0) => ({
        ..._newTextOverlay(null),
        ...o,
        start: (Number(o.start) || 0) + shift,
        end: (Number(o.end) || 0) + shift,
        id: _nextTextId++,
    });
    _s.texts = [];
    if (Array.isArray(data.texts)) {
        _s.texts = data.texts.map((o) => asOverlay(o));
    } else {
        // Legacy project: overlays were clip-relative - shift each onto its clip's timeline window.
        for (const { entry, clip } of restored) {
            if (clip && Array.isArray(entry.texts)) {
                const start = _clipStartOffset(clip);
                _s.texts.push(...entry.texts.map((o) => asOverlay(o, start)));
            }
        }
    }
    await _restoreAudioFromSaved(data.audio);
    await _restoreSoundsFromSaved(data.sounds);
    await _restorePipsFromSaved(data.pips);

    _s.projectFilename = filename;
    _updateProjectNameUI();
    _renderTimeline();
    _renderTrimPanel();
    _resetHistory();
    showToast(t("videoEditProjectLoaded"), "success");
}

async function _loadProjectFromFile(file) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const filename = file.name.toLowerCase().endsWith(".json") ? file.name : `${file.name}.json`;
        await _loadProjectData(filename, data);
    } catch (err) {
        showToast(`${t("videoEditProjectLoadFailed")}: ${err.message}`, "error");
    }
}

// Entry point for the sidebar Project panel's saved-project list
// (video-project-tab.js, "edit" mode) — mirrors video-plan-tab.js's
// openSavedVideoPlan(): fetches the project by filename, loads it, then jumps
// to the Edit subtab so the freshly-loaded timeline is actually visible.
export async function openSavedVideoEditProject(filename) {
    try {
        const res = await fetch(`/api/wfm/video/edit/projects/content?filename=${encodeURIComponent(filename)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        await _loadProjectData(filename, json.data || {});
        document.querySelector('.wfm-video-subtab-btn[data-video-subtab="edit"]')?.click();
    } catch (err) {
        showToast(`${t("videoEditProjectLoadFailed")}: ${err.message}`, "error");
    }
}

export function initVideoEditTab() {
    _wireToolbar();
    _wireAudioPanel();
    _wireUndoRedo();
    // Leaving the Edit subtab (Plan/Asset) or the Video tab itself ends crop
    // editing, keeping the rect as adjusted — the on-preview editor would
    // otherwise stay armed over a Source pane now used by other features.
    document.addEventListener("click", (e) => {
        if (!_cropEditing) return;
        const tab = e.target.closest?.("[data-tab], .wfm-video-subtab-btn");
        // "project" only opens the sidebar list; the Edit subtab stays visible.
        if (!tab || ["edit", "project"].includes(tab.dataset.videoSubtab) || tab.dataset.tab === "video") return;
        _endCropEdit(true);
    }, true);
    const sourceVideo = getPreviewPaneElements("source")?.video;
    sourceVideo?.addEventListener("timeupdate", _refreshSourceTextPreview);
    sourceVideo?.addEventListener("seeked", _refreshSourceTextPreview);
    window.addEventListener("resize", () => { _refreshTextPreview(); _refreshCropPreview(); });
    document.getElementById("wfm-video-edit-export-btn")?.addEventListener("click", _exportTimeline);
    document.getElementById("wfm-video-edit-save-btn")?.addEventListener("click", () => _saveProject());
    document.getElementById("wfm-video-edit-saveas-btn")?.addEventListener("click", () => _saveProject(null, true));
    const loadInput = document.getElementById("wfm-video-edit-load-file-input");
    // Opened natively by its wrapping <label> (see index.html); only keyboard
    // activation needs wiring, since a <label> doesn't respond to Enter/Space.
    document.querySelectorAll(".wfm-video-edit-file-btn").forEach((label) => {
        label.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            label.querySelector('input[type="file"]')?.click();
        });
    });
    loadInput?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) _loadProjectFromFile(file);
        e.target.value = "";
    });
    _renderTimeline();
    _renderTrimPanel();
    _updatePreviewBtn();
    _resetHistory();
}

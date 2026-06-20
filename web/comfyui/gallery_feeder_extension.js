/**
 * WFS_GalleryFeeder – ComfyUI canvas extension
 * Adds "After Gen", Run, and Stop controls directly on the node widget area.
 */
import { app } from "../../scripts/app.js";

const FEEDER_GROUP = "__Feeder__";

// Per-node runtime state (keyed by node.id)
const _ns = new Map();

// ── Helpers ───────────────────────────────────────────────────────────

async function fetchGroupImages(groupName) {
    try {
        const res = await fetch(`/wfm/gallery/groups/${encodeURIComponent(groupName)}/images`);
        if (!res.ok) return [];
        return (await res.json()).images || [];
    } catch { return []; }
}

function getOrCreate(nodeId) {
    if (!_ns.has(nodeId)) {
        _ns.set(nodeId, { running: false, stopFlag: false, idx: 0, images: [] });
    }
    return _ns.get(nodeId);
}

function getInputWidget(node, name) {
    return node.widgets?.find(w => w.name === name);
}

function setWidgetValue(node, name, value) {
    const w = getInputWidget(node, name);
    if (!w) return;
    w.value = value;
    if (w.callback) w.callback(value);
    app.canvas?.setDirty(true, true);
}

/** Resolves when the current prompt finishes (executing=null, interrupted), rejects on error. */
function waitForExecution() {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            app.api.removeEventListener("executing",              onExecuting);
            app.api.removeEventListener("execution_error",        onError);
            app.api.removeEventListener("execution_interrupted",  onInterrupted);
        };
        const onExecuting     = ({ detail }) => { if (detail === null) { cleanup(); resolve(); } };
        const onError         = ({ detail }) => { cleanup(); reject(new Error(detail?.exception_message || "Execution error")); };
        const onInterrupted   = ()           => { cleanup(); resolve(); };   // treat interrupt as "done"

        app.api.addEventListener("executing",             onExecuting);
        app.api.addEventListener("execution_error",       onError);
        app.api.addEventListener("execution_interrupted", onInterrupted);
    });
}

function updateRunBtn(node) {
    const st = getOrCreate(node.id);
    if (node._wfsRunWidget) node._wfsRunWidget.name = st.running ? "⏳ Running..." : "▶  Run";
    app.canvas?.setDirty(true, true);
}

function wfsToast(msg, severity = "warn") {
    try {
        const tm = app.extensionManager?.toast;
        if (tm?.add) { tm.add({ severity, summary: "Gallery Feeder", detail: msg, life: 4000 }); return; }
    } catch {}
    console[severity === "error" ? "error" : "warn"]("[WFS_GalleryFeeder]", msg);
}

// ── Run / Stop ────────────────────────────────────────────────────────

async function startLoop(node) {
    const st = getOrCreate(node.id);
    if (st.running) return;

    // Re-fetch images for the current group each Run
    const groupName = getInputWidget(node, "group_name")?.value || FEEDER_GROUP;
    const images = await fetchGroupImages(groupName);
    if (images.length === 0) {
        wfsToast(`No images in group "${groupName}"`, "warn");
        return;
    }

    st.running  = true;
    st.stopFlag = false;
    st.images   = images;
    st.idx      = Math.max(0, Math.min(
        parseInt(getInputWidget(node, "index")?.value) || 0,
        images.length - 1
    ));

    updateRunBtn(node);

    // Queue first generation with current index
    setWidgetValue(node, "index", st.idx);
    app.queuePrompt(0, 1);

    while (st.running && !st.stopFlag) {
        try {
            await waitForExecution();
        } catch (err) {
            if (st.running) wfsToast(err.message, "error");
            break;
        }

        if (!st.running || st.stopFlag) break;

        const afterGen = node._wfsAfterGenWidget?.value || "loop";
        const total    = st.images.length;

        // Increment mode: stop after the last image
        if (afterGen === "increment" && st.idx >= total - 1) break;

        if (afterGen !== "fixed") {
            st.idx = (st.idx + 1) % total;
            setWidgetValue(node, "index", st.idx);
        }

        app.queuePrompt(0, 1);
    }

    st.running = false;
    updateRunBtn(node);
}

function stopLoop(node) {
    const st = getOrCreate(node.id);
    if (!st.running) return;
    st.stopFlag = true;
    st.running  = false;
    try { app.api.interrupt(); } catch {}
    updateRunBtn(node);
}

// ── Extension registration ────────────────────────────────────────────

app.registerExtension({
    name: "WorkflowStudio.GalleryFeeder",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "WFS_GalleryFeeder") return;

        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origCreated?.call(this);
            const node = this;

            // ── After Gen selector ────────────────────────────────────
            // serialize:false → not included in widgets_values / prompt inputs
            const afterGenW = node.addWidget("combo", "wfs_after_gen", "loop", () => {}, {
                values:    ["loop", "increment", "fixed"],
                serialize: false,
            });
            node._wfsAfterGenWidget = afterGenW;

            // ── Run button ────────────────────────────────────────────
            const runW = node.addWidget("button", "▶  Run", null, () => startLoop(node));
            runW.serialize = false;
            node._wfsRunWidget = runW;

            // ── Stop button ───────────────────────────────────────────
            const stopW = node.addWidget("button", "■  Stop", null, () => stopLoop(node));
            stopW.serialize = false;
            node._wfsStopWidget = stopW;
        };

        // Clean up when node is removed from graph
        const origRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            stopLoop(this);
            _ns.delete(this.id);
            origRemoved?.call(this);
        };
    },
});

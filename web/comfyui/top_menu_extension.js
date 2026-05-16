import { app } from "../../scripts/app.js";
import { togglePanel, getNodeSetsIcon, NODE_SETS_TOOLTIP, saveSelectedAsNodeSet } from "./node_sets_menu.js";

const BUTTON_TOOLTIP = "Launch Workflow Studio (Shift+Click opens in new window)";
const SNAPSHOT_TOOLTIP = "Save workflow canvas image as thumbnail";
const WFM_PATH = "/wfm";
const NEW_WINDOW_FEATURES = "width=1400,height=900,resizable=yes,scrollbars=yes,status=yes";
const MAX_ATTACH_ATTEMPTS = 120;
const BUTTON_GROUP_CLASS = "wfm-top-menu-group";

const MIN_VERSION_FOR_ACTION_BAR = [1, 33, 9];

const openWorkflowStudio = (event) => {
    const url = `${window.location.origin}${WFM_PATH}`;

    if (event.shiftKey) {
        window.open(url, "_blank", NEW_WINDOW_FEATURES);
        return;
    }

    window.open(url, "_blank");
};

// ============================================
// Canvas Snapshot - Export workflow as PNG thumbnail
// ============================================

const getWorkflowFilename = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `wf_${stamp}.json`;
};

// ---- PNG tEXt chunk embedding helpers ----

const n2b = (n) => new Uint8Array([(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);

const joinArrayBuffer = (...bufs) => {
    const result = new Uint8Array(bufs.reduce((total, buf) => total + buf.byteLength, 0));
    bufs.reduce((offset, buf) => {
        result.set(buf, offset);
        return offset + buf.byteLength;
    }, 0);
    return result;
};

let _crcTable = null;
const crc32 = (data) => {
    if (!_crcTable) {
        _crcTable = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            _crcTable[n] = c;
        }
    }
    let crc = 0 ^ -1;
    for (let i = 0; i < data.byteLength; i++) {
        crc = (crc >>> 8) ^ _crcTable[(crc ^ data[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
};

const embedWorkflowInPng = async (blob, workflowJson) => {
    const buffer = await blob.arrayBuffer();
    const typedArr = new Uint8Array(buffer);
    const view = new DataView(buffer);

    // Create tEXt chunk: "tEXtworkflow\0{json}"
    const data = new TextEncoder().encode(`tEXtworkflow\0${workflowJson}`);
    const chunk = joinArrayBuffer(n2b(data.byteLength - 4), data, n2b(crc32(data)));

    // Insert after IHDR chunk (8-byte signature + IHDR length field(4) + IHDR type(4) + IHDR data + CRC(4))
    const ihdrDataLen = view.getUint32(8);
    const sz = ihdrDataLen + 20; // 8(sig) + 4(len) + 4(type) + ihdrDataLen + 4(crc)
    const result = joinArrayBuffer(typedArr.subarray(0, sz), chunk, typedArr.subarray(sz));

    return new Blob([result], { type: "image/png" });
};

// ---- Canvas capture ----

const captureCanvasSnapshot = () => {
    return new Promise((resolve, reject) => {
        try {
            const graph = app.graph;
            const canvas = app.canvas;
            if (!graph || !canvas || !graph._nodes?.length) {
                reject(new Error("No workflow loaded"));
                return;
            }

            // Serialize workflow data before changing canvas state
            const workflowJson = JSON.stringify(graph.serialize());

            // Calculate bounds of all nodes
            const bounds = graph._nodes.reduce(
                (p, n) => {
                    if (n.pos[0] < p[0]) p[0] = n.pos[0];
                    if (n.pos[1] < p[1]) p[1] = n.pos[1];
                    const b = n.getBounding();
                    const r = n.pos[0] + b[2];
                    const bot = n.pos[1] + b[3];
                    if (r > p[2]) p[2] = r;
                    if (bot > p[3]) p[3] = bot;
                    return p;
                },
                [99999, 99999, -99999, -99999]
            );

            // Add padding
            const padding = 80;
            bounds[0] -= padding;
            bounds[1] -= padding;
            bounds[2] += padding;
            bounds[3] += padding;

            // Save current canvas state
            const savedState = {
                scale: canvas.ds.scale,
                width: canvas.canvas.width,
                height: canvas.canvas.height,
                offset: [...canvas.ds.offset],
                transform: canvas.canvas.getContext("2d").getTransform(),
            };

            // Set canvas to render full workflow
            const dpr = window.devicePixelRatio || 1;
            canvas.ds.scale = 1;
            canvas.canvas.width = (bounds[2] - bounds[0]) * dpr;
            canvas.canvas.height = (bounds[3] - bounds[1]) * dpr;
            canvas.ds.offset = [-bounds[0], -bounds[1]];
            canvas.canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);

            // Render
            canvas.draw(true, true);

            // Capture to blob
            canvas.canvas.toBlob(async (rawBlob) => {
                // Restore canvas state
                canvas.ds.scale = savedState.scale;
                canvas.canvas.width = savedState.width;
                canvas.canvas.height = savedState.height;
                canvas.ds.offset = savedState.offset;
                canvas.canvas.getContext("2d").setTransform(savedState.transform);
                canvas.draw(true, true);

                if (!rawBlob) {
                    reject(new Error("Failed to generate canvas image"));
                    return;
                }

                try {
                    // Embed workflow JSON into PNG tEXt chunk
                    const blob = await embedWorkflowInPng(rawBlob, workflowJson);
                    resolve(blob);
                } catch (embedErr) {
                    console.warn("Workflow Studio: failed to embed workflow metadata, saving without it:", embedErr);
                    resolve(rawBlob);
                }
            }, "image/png");
        } catch (err) {
            reject(err);
        }
    });
};

const showSaveDialog = (defaultName) => {
    return new Promise((resolve) => {
        // Remove existing dialog if any
        const existing = document.getElementById("wfm-save-dialog-overlay");
        if (existing) existing.remove();

        const overlay = document.createElement("div");
        overlay.id = "wfm-save-dialog-overlay";
        Object.assign(overlay.style, {
            position: "fixed",
            inset: "0",
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: "99999",
        });

        const dialog = document.createElement("div");
        Object.assign(dialog.style, {
            background: "var(--comfy-menu-bg, #2a2a2a)",
            border: "1px solid var(--border-color, #4e4e4e)",
            borderRadius: "8px",
            padding: "16px 20px",
            minWidth: "360px",
            maxWidth: "480px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            color: "var(--input-text, #ddd)",
            fontFamily: "sans-serif",
        });

        const stem = defaultName.replace(/\.json$/, "");

        dialog.innerHTML = `
            <div style="font-size:14px;font-weight:bold;margin-bottom:12px;">Save Workflow</div>
            <label style="font-size:12px;color:var(--descrip-text,#999);display:block;margin-bottom:4px;">Filename</label>
            <input type="text" id="wfm-save-dialog-input" value="${stem}" style="
                width:100%;padding:8px 10px;font-size:13px;
                background:var(--comfy-input-bg,#1a1a1a);
                border:1px solid var(--border-color,#4e4e4e);
                border-radius:4px;color:var(--input-text,#ddd);
                outline:none;box-sizing:border-box;
            " />
            <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">
                <button id="wfm-save-dialog-cancel" style="
                    padding:6px 16px;font-size:12px;border-radius:4px;cursor:pointer;
                    background:transparent;border:1px solid var(--border-color,#4e4e4e);
                    color:var(--input-text,#ddd);
                ">Cancel</button>
                <button id="wfm-save-dialog-ok" style="
                    padding:6px 16px;font-size:12px;border-radius:4px;cursor:pointer;
                    background:var(--p-button-background,#4a9eff);border:none;
                    color:#fff;font-weight:bold;
                ">Save</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector("#wfm-save-dialog-input");
        const okBtn = dialog.querySelector("#wfm-save-dialog-ok");
        const cancelBtn = dialog.querySelector("#wfm-save-dialog-cancel");

        const cleanup = () => overlay.remove();

        const confirm = () => {
            const val = input.value.trim();
            cleanup();
            if (val) {
                resolve(val.endsWith(".json") ? val : val + ".json");
            } else {
                resolve(null);
            }
        };

        const cancel = () => { cleanup(); resolve(null); };

        okBtn.addEventListener("click", confirm);
        cancelBtn.addEventListener("click", cancel);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) cancel(); });
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); confirm(); }
            if (e.key === "Escape") cancel();
        });

        input.focus();
        input.select();
    });
};

const saveCanvasToWorkflowStudio = async () => {
    const defaultFilename = getWorkflowFilename();
    const filename = await showSaveDialog(defaultFilename);
    if (!filename) return; // cancelled

    try {
        showNotification("Capturing workflow image...", "info");
        const blob = await captureCanvasSnapshot();

        const fd = new FormData();
        fd.append("filename", filename);
        fd.append("image", blob, "canvas.png");

        const res = await fetch("/api/wfm/workflows/save-canvas-image", {
            method: "POST",
            body: fd,
        });

        const data = await res.json();
        if (data.error) {
            throw new Error(data.error);
        }

        showNotification(`Workflow saved: ${filename.replace(/\.json$/, "")}`, "success");
    } catch (err) {
        showNotification("Error: " + err.message, "error");
    }
};

const showNotification = (message, type = "info") => {
    // Try using ComfyUI's built-in toast if available
    try {
        if (app.ui?.dialog) {
            // Fallback: use a simple temporary notification
        }
    } catch (e) { /* ignore */ }

    // Simple toast notification
    const existing = document.getElementById("wfm-snapshot-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "wfm-snapshot-toast";
    const colors = {
        success: { bg: "rgba(46,213,115,0.95)", color: "#fff" },
        error: { bg: "rgba(255,71,87,0.95)", color: "#fff" },
        info: { bg: "rgba(74,158,255,0.95)", color: "#fff" },
    };
    const c = colors[type] || colors.info;
    Object.assign(toast.style, {
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "10px 24px",
        background: c.bg,
        color: c.color,
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: "500",
        zIndex: "99999",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        transition: "opacity 0.3s ease",
        whiteSpace: "nowrap",
    });
    toast.textContent = message;
    document.body.appendChild(toast);

    if (type !== "info") {
        setTimeout(() => {
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    } else {
        // Info messages will be replaced by success/error
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.opacity = "0";
                setTimeout(() => toast.remove(), 300);
            }
        }, 10000);
    }
};

// ============================================
// Version Detection & UI
// ============================================

const getComfyUIFrontendVersion = async () => {
    try {
        if (window["__COMFYUI_FRONTEND_VERSION__"]) {
            return window["__COMFYUI_FRONTEND_VERSION__"];
        }
    } catch (error) {
        console.warn("Workflow Studio: unable to read __COMFYUI_FRONTEND_VERSION__:", error);
    }

    try {
        const response = await fetch("/system_stats");
        const data = await response.json();

        if (data?.system?.comfyui_frontend_version) {
            return data.system.comfyui_frontend_version;
        }

        if (data?.system?.required_frontend_version) {
            return data.system.required_frontend_version;
        }
    } catch (error) {
        console.warn("Workflow Studio: unable to fetch system_stats:", error);
    }

    return "0.0.0";
};

const parseVersion = (versionStr) => {
    if (!versionStr || typeof versionStr !== "string") {
        return [0, 0, 0];
    }

    const cleanVersion = versionStr.replace(/^[vV]/, "").split("-")[0];
    const parts = cleanVersion.split(".").map((part) => parseInt(part, 10) || 0);

    while (parts.length < 3) {
        parts.push(0);
    }

    return parts;
};

const compareVersions = (version1, version2) => {
    const v1 = typeof version1 === "string" ? parseVersion(version1) : version1;
    const v2 = typeof version2 === "string" ? parseVersion(version2) : version2;

    for (let i = 0; i < 3; i++) {
        if (v1[i] > v2[i]) return 1;
        if (v1[i] < v2[i]) return -1;
    }

    return 0;
};

const supportsActionBarButtons = async () => {
    const version = await getComfyUIFrontendVersion();
    return compareVersions(version, MIN_VERSION_FOR_ACTION_BAR) >= 0;
};

const getWfmIcon = () => {
    return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 5 L7 17 L12 7 L17 17 L21 5" stroke-width="2.3"/>
            <path d="M5 20 Q9 17 12 20 Q15 23 19 20" stroke-width="1.8"/>
        </svg>
    `;
};

const getSnapshotIcon = () => {
    return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
            <rect x="3" y="5" width="18" height="14" rx="2"/>
            <circle cx="12" cy="12" r="3"/>
            <path d="M8 5 L9 3 L15 3 L16 5"/>
        </svg>
    `;
};

// ============================================
// Button Creation
// ============================================

const createTopMenuButton = async () => {
    const { ComfyButton } = await import("../../scripts/ui/components/button.js");

    const button = new ComfyButton({
        icon: "wfm",
        tooltip: BUTTON_TOOLTIP,
        app,
        enabled: true,
        classList: "comfyui-button comfyui-menu-mobile-collapse primary",
    });

    button.element.setAttribute("aria-label", BUTTON_TOOLTIP);
    button.element.title = BUTTON_TOOLTIP;

    if (button.iconElement) {
        button.iconElement.innerHTML = getWfmIcon();
        button.iconElement.style.width = "1.2rem";
        button.iconElement.style.height = "1.2rem";
    }

    button.element.addEventListener("click", openWorkflowStudio);
    return button;
};

const createSnapshotButton = async () => {
    const { ComfyButton } = await import("../../scripts/ui/components/button.js");

    const button = new ComfyButton({
        icon: "snapshot",
        tooltip: SNAPSHOT_TOOLTIP,
        app,
        enabled: true,
        classList: "comfyui-button comfyui-menu-mobile-collapse",
    });

    button.element.setAttribute("aria-label", SNAPSHOT_TOOLTIP);
    button.element.title = SNAPSHOT_TOOLTIP;

    if (button.iconElement) {
        button.iconElement.innerHTML = getSnapshotIcon();
        button.iconElement.style.width = "1.2rem";
        button.iconElement.style.height = "1.2rem";
    }

    button.element.addEventListener("click", saveCanvasToWorkflowStudio);
    return button;
};

const createNodeSetsButton = async () => {
    const { ComfyButton } = await import("../../scripts/ui/components/button.js");

    const button = new ComfyButton({
        icon: "node-sets",
        tooltip: NODE_SETS_TOOLTIP,
        app,
        enabled: true,
        classList: "comfyui-button comfyui-menu-mobile-collapse wfm-node-sets-btn",
    });

    button.element.setAttribute("aria-label", NODE_SETS_TOOLTIP);
    button.element.title = NODE_SETS_TOOLTIP;

    if (button.iconElement) {
        button.iconElement.innerHTML = getNodeSetsIcon();
        button.iconElement.style.width = "1.2rem";
        button.iconElement.style.height = "1.2rem";
    }

    button.element.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePanel();
    });

    return button;
};

const attachTopMenuButton = async (attempt = 0) => {
    if (document.querySelector(`.${BUTTON_GROUP_CLASS}`)) {
        return;
    }

    // Try settingsGroup first (legacy ComfyUI)
    const settingsGroup = app.menu?.settingsGroup;
    // Fallback: find the legacy topbar container used by newer ComfyUI
    const legacyContainer = document.querySelector('[data-testid="legacy-topbar-container"] .flex');

    if (!settingsGroup?.element?.parentElement && !legacyContainer) {
        if (attempt >= MAX_ATTACH_ATTEMPTS) {
            console.warn("Workflow Studio: unable to locate the ComfyUI menu container.");
            return;
        }

        requestAnimationFrame(() => attachTopMenuButton(attempt + 1));
        return;
    }

    const wfmButton = await createTopMenuButton();
    const snapshotButton = await createSnapshotButton();
    const nodeSetsButton = await createNodeSetsButton();
    const { ComfyButtonGroup } = await import("../../scripts/ui/components/buttonGroup.js");

    const buttonGroup = new ComfyButtonGroup(wfmButton, snapshotButton, nodeSetsButton);
    buttonGroup.element.classList.add(BUTTON_GROUP_CLASS);

    if (settingsGroup?.element?.parentElement) {
        settingsGroup.element.before(buttonGroup.element);
    } else if (legacyContainer) {
        legacyContainer.prepend(buttonGroup.element);
    }
};

app.registerExtension({
    name: "WorkflowStudio.TopMenu",
    actionBarButtons: [
        {
            icon: "icon-[mdi--file-document-multiple] size-4",
            tooltip: BUTTON_TOOLTIP,
            onClick: openWorkflowStudio,
        },
        {
            icon: "icon-[mdi--camera] size-4",
            tooltip: SNAPSHOT_TOOLTIP,
            onClick: saveCanvasToWorkflowStudio,
        },
        {
            icon: "icon-[mdi--view-grid-plus] size-4",
            tooltip: NODE_SETS_TOOLTIP,
            onClick: () => togglePanel(),
        },
    ],
    beforeRegisterNodeDef(nodeType, _nodeData, _app) {
        const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            origGetExtraMenuOptions?.apply(this, arguments);
            const selectedCount = Object.keys(app.canvas.selected_nodes || {}).length;
            options.push(null);
            options.push({
                content: `Save as Node Set${selectedCount > 1 ? ` (${selectedCount} nodes)` : ""}`,
                callback: saveSelectedAsNodeSet,
            });
        };
    },
    async setup() {
        const injectStyles = () => {
            const styleId = "wfm-top-menu-button-styles";
            if (document.getElementById(styleId)) return;

            const style = document.createElement("style");
            style.id = styleId;
            style.textContent = `
                button[aria-label="${BUTTON_TOOLTIP}"].wfm-top-menu-button {
                    transition: all 0.2s ease;
                    border: 1px solid transparent;
                }
                button[aria-label="${BUTTON_TOOLTIP}"].wfm-top-menu-button:hover {
                    background-color: var(--primary-hover-bg) !important;
                }
                button[aria-label="${SNAPSHOT_TOOLTIP}"].wfm-snapshot-button {
                    transition: all 0.2s ease;
                    border: 1px solid transparent;
                }
                button[aria-label="${SNAPSHOT_TOOLTIP}"].wfm-snapshot-button:hover {
                    background-color: var(--primary-hover-bg) !important;
                }
                button[aria-label="${NODE_SETS_TOOLTIP}"].wfm-node-sets-btn {
                    transition: all 0.2s ease;
                    border: 1px solid transparent;
                }
                button[aria-label="${NODE_SETS_TOOLTIP}"].wfm-node-sets-btn:hover {
                    background-color: var(--primary-hover-bg) !important;
                }
            `;
            document.head.appendChild(style);
        };
        injectStyles();

        const buttonConfigs = [
            { tooltip: BUTTON_TOOLTIP, className: "wfm-top-menu-button", getIcon: getWfmIcon, styles: { backgroundColor: "var(--primary-bg)" } },
            { tooltip: SNAPSHOT_TOOLTIP, className: "wfm-snapshot-button", getIcon: getSnapshotIcon, styles: null },
            { tooltip: NODE_SETS_TOOLTIP, className: "wfm-node-sets-btn", getIcon: getNodeSetsIcon, styles: null },
        ];

        const replaceButtonIcons = () => {
            let foundAny = false;
            for (const cfg of buttonConfigs) {
                document.querySelectorAll(`button[aria-label="${cfg.tooltip}"]`).forEach((btn) => {
                    foundAny = true;
                    btn.classList.add(cfg.className);
                    btn.innerHTML = cfg.getIcon();
                    btn.style.borderRadius = "4px";
                    btn.style.padding = "6px";
                    if (cfg.styles) Object.assign(btn.style, cfg.styles);
                    const svg = btn.querySelector("svg");
                    if (svg) {
                        svg.style.width = "20px";
                        svg.style.height = "20px";
                    }
                });
            }
            if (!foundAny) {
                requestAnimationFrame(replaceButtonIcons);
            }
        };
        requestAnimationFrame(replaceButtonIcons);
    },
});

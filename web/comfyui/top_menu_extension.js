import { app } from "../../scripts/app.js";

const BUTTON_TOOLTIP = "Launch Workflow Studio (Shift+Click opens in new window)";
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

const attachTopMenuButton = async (attempt = 0) => {
    if (document.querySelector(`.${BUTTON_GROUP_CLASS}`)) {
        return;
    }

    const settingsGroup = app.menu?.settingsGroup;
    if (!settingsGroup?.element?.parentElement) {
        if (attempt >= MAX_ATTACH_ATTEMPTS) {
            console.warn("Workflow Studio: unable to locate the ComfyUI settings button group.");
            return;
        }

        requestAnimationFrame(() => attachTopMenuButton(attempt + 1));
        return;
    }

    const wfmButton = await createTopMenuButton();
    const { ComfyButtonGroup } = await import("../../scripts/ui/components/buttonGroup.js");

    const buttonGroup = new ComfyButtonGroup(wfmButton);
    buttonGroup.element.classList.add(BUTTON_GROUP_CLASS);

    settingsGroup.element.before(buttonGroup.element);
};

const createExtensionObject = (useActionBar) => {
    const extensionObj = {
        name: "WorkflowStudio.TopMenu",
        async setup() {
            if (!useActionBar) {
                console.log("Workflow Studio: using legacy button attachment (frontend version < 1.33.9)");
                await attachTopMenuButton();
            } else {
                console.log("Workflow Studio: using actionBarButtons API (frontend version >= 1.33.9)");
            }

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
                `;
                document.head.appendChild(style);
            };
            injectStyles();

            const replaceButtonIcon = () => {
                const buttons = document.querySelectorAll(`button[aria-label="${BUTTON_TOOLTIP}"]`);
                buttons.forEach((button) => {
                    button.classList.add("wfm-top-menu-button");
                    button.innerHTML = getWfmIcon();
                    button.style.borderRadius = "4px";
                    button.style.padding = "6px";
                    button.style.backgroundColor = "var(--primary-bg)";
                    const svg = button.querySelector("svg");
                    if (svg) {
                        svg.style.width = "20px";
                        svg.style.height = "20px";
                    }
                });
                if (buttons.length === 0) {
                    requestAnimationFrame(replaceButtonIcon);
                }
            };
            requestAnimationFrame(replaceButtonIcon);
        },
    };

    if (useActionBar) {
        extensionObj.actionBarButtons = [
            {
                icon: "icon-[mdi--file-document-multiple] size-4",
                tooltip: BUTTON_TOOLTIP,
                onClick: openWorkflowStudio,
            },
        ];
    }

    return extensionObj;
};

(async () => {
    const useActionBar = await supportsActionBarButtons();
    const extensionObj = createExtensionObject(useActionBar);
    app.registerExtension(extensionObj);
})();

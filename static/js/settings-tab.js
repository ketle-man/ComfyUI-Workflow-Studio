/**
 * Settings Tab - Language, ComfyUI, Ollama, Default Workflow, Eagle
 */

import { showToast } from "./app.js";
import { comfyUI } from "./comfyui-client.js";
import { t, getLang, getSummaryLang, setLang, setSummaryLang, getLanguageOptions, getSummaryLanguageOptions } from "./i18n.js";

const SETTINGS_KEY = "wfm_settings";

function rgbToHex(rgb) {
    const m = rgb.match(/(\d+)/g);
    if (!m || m.length < 3) return "#000000";
    return "#" + m.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, "0")).join("");
}

function loadLocalSettings() {
    try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {
        return {};
    }
}

function saveLocalSettings(patch) {
    const data = { ...loadLocalSettings(), ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    return data;
}

async function loadServerSettings() {
    try {
        const res = await fetch("/api/wfm/settings");
        return await res.json();
    } catch {
        return {};
    }
}

async function saveServerSettings(patch) {
    try {
        const res = await fetch("/api/wfm/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
        });
        return await res.json();
    } catch {
        return {};
    }
}

function buildLangOptions(optionsMap, selectedValue) {
    return Object.entries(optionsMap)
        .map(([code, label]) => `<option value="${code}" ${code === selectedValue ? "selected" : ""}>${label}</option>`)
        .join("");
}

// Theme definitions with swatch colors for preview
const THEMES = [
    { id: "",                 key: "themeDefault",        colors: ["#1a1a2e", "#16213e", "#4a9eff", "#7c5cfc"] },
    { id: "pop-vibrant",      key: "themePopVibrant",     colors: ["#F8F9FA", "#FFFFFF", "#FF6B6B", "#00D2D3"] },
    { id: "light-minimalist", key: "themeLightMinimalist", colors: ["#FFFFFF", "#F5F5F5", "#4A9EFF", "#6366F1"] },
    { id: "cyberpunk",        key: "themeCyberpunk",      colors: ["#000000", "#0A0A0A", "#FF00FF", "#00FFFF"] },
    { id: "glassmorphism",    key: "themeGlassmorphism",  colors: ["#1A0533", "#0D1B3E", "#7B68EE", "#DA77F2"] },
    { id: "neumorphism",      key: "themeNeumorphism",    colors: ["#D1D9E6", "#D1D9E6", "#6C8EBF", "#7986CB"] },
    { id: "retro-pixel",      key: "themeRetroPixel",     colors: ["#2C2C34", "#3A3A44", "#5B8FD4", "#D45BD4"] },
    { id: "pastel-dream",     key: "themePastelDream",    colors: ["#F0E6FF", "#E8F5E9", "#B39DDB", "#80DEEA"] },
    { id: "brutalism",        key: "themeBrutalism",      colors: ["#FFFFFF", "#FFFFFF", "#CCFF00", "#000000"] },
    { id: "earthy",           key: "themeEarthy",         colors: ["#F5E6D3", "#EDE0D4", "#8D6E63", "#BF6830"] },
    { id: "material",         key: "themeMaterial",       colors: ["#FAFAFA", "#FFFFFF", "#3F51B5", "#FF4081"] },
    { id: "monotone-accent",  key: "themeMonotoneAccent", colors: ["#F7F7F7", "#FFFFFF", "#FF6B35", "#1A1A1A"] },
    { id: "corporate",        key: "themeCorporate",      colors: ["#F0F4F8", "#FFFFFF", "#2563EB", "#7C3AED"] },
];

// --- Background pattern definitions ---
const BG_PATTERNS = [
    { id: "none",     key: "themePatternNone" },
    { id: "stripe-h", key: "themePatternStripeH" },
    { id: "stripe-v", key: "themePatternStripeV" },
    { id: "stripe-d", key: "themePatternStripeD" },
    { id: "dot",      key: "themePatternDot" },
    { id: "check",    key: "themePatternCheck" },
    { id: "svg",      key: "themePatternSvg" },
];

// Font definitions: id, label key, CSS value, Google Fonts family name (if web font)
const FONT_OPTIONS = [
    { id: "",               key: "themeFontDefault",     css: "",                                                                                          google: "" },
    { id: "noto-sans-jp",   key: "themeFontNotoSans",    css: "'Noto Sans JP', sans-serif",                                                                google: "Noto+Sans+JP:wght@400;700" },
    { id: "zen-maru",       key: "themeFontZenMaru",     css: "'Zen Maru Gothic', sans-serif",                                                             google: "Zen+Maru+Gothic:wght@400;700" },
    { id: "m-plus-rounded", key: "themeFontMPlusRound",  css: "'M PLUS Rounded 1c', sans-serif",                                                           google: "M+PLUS+Rounded+1c:wght@400;700" },
    { id: "kosugi-maru",    key: "themeFontKosugiMaru",  css: "'Kosugi Maru', sans-serif",                                                                 google: "Kosugi+Maru" },
    { id: "sawarabi-gothic",key: "themeFontSawarabi",    css: "'Sawarabi Gothic', sans-serif",                                                              google: "Sawarabi+Gothic" },
    { id: "biz-udp",        key: "themeFontBizUdp",      css: "'BIZ UDPGothic', sans-serif",                                                               google: "BIZ+UDPGothic:wght@400;700" },
    { id: "dot-gothic",     key: "themeFontDotGothic",   css: "'DotGothic16', monospace",                                                                  google: "DotGothic16" },
    { id: "hachi-maru",     key: "themeFontHachiMaru",   css: "'Hachi Maru Pop', cursive",                                                                 google: "Hachi+Maru+Pop" },
    { id: "dela-gothic",    key: "themeFontDelaGothic",  css: "'Dela Gothic One', sans-serif",                                                             google: "Dela+Gothic+One" },
    { id: "reggae-one",     key: "themeFontReggaeOne",   css: "'Reggae One', cursive",                                                                     google: "Reggae+One" },
    { id: "rocknroll",      key: "themeFontRocknRoll",   css: "'RocknRoll One', sans-serif",                                                               google: "RocknRoll+One" },
    { id: "stick",          key: "themeFontStick",       css: "'Stick', sans-serif",                                                                       google: "Stick" },
    { id: "train-one",      key: "themeFontTrainOne",    css: "'Train One', cursive",                                                                      google: "Train+One" },
    { id: "space-mono",     key: "themeFontSpaceMono",   css: "'Space Mono', monospace",                                                                   google: "Space+Mono:wght@400;700" },
    { id: "fira-code",      key: "themeFontFiraCode",    css: "'Fira Code', monospace",                                                                    google: "Fira+Code:wght@400;700" },
];

// Load Google Font dynamically
const _loadedFonts = new Set();
function loadGoogleFont(googleFamily) {
    if (!googleFamily || _loadedFonts.has(googleFamily)) return;
    _loadedFonts.add(googleFamily);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${googleFamily}&display=swap`;
    document.head.appendChild(link);
}

function applyCustomFont(fontId) {
    const font = FONT_OPTIONS.find(f => f.id === fontId);
    let styleEl = document.getElementById("wfm-custom-font-style");
    if (!font || !font.css) {
        if (styleEl) styleEl.remove();
        return;
    }
    if (font.google) loadGoogleFont(font.google);
    if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "wfm-custom-font-style";
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = `body, .wfm-input, .wfm-select, .wfm-textarea, button { font-family: ${font.css} !important; }`;
}

// Color customization targets
const COLOR_TARGETS = [
    { varName: "--wfm-bg",           key: "themeColorBg" },
    { varName: "--wfm-bg-secondary", key: "themeColorBgSec" },
    { varName: "--wfm-surface",      key: "themeColorSurface" },
    { varName: "--wfm-text",         key: "themeColorText" },
    { varName: "--wfm-primary",      key: "themeColorPrimary" },
    { varName: "--wfm-accent",       key: "themeColorAccent" },
];

function generatePatternCSS(patternId, color, opacity, scale) {
    const o = opacity ?? 0.1;
    const s = scale ?? 20;
    const c = color || "#ffffff";
    // Convert hex to rgba
    const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
    const rgba = `rgba(${r},${g},${b},${o})`;

    switch (patternId) {
        case "stripe-h":
            return `repeating-linear-gradient(0deg, ${rgba} 0px, ${rgba} 1px, transparent 1px, transparent ${s}px)`;
        case "stripe-v":
            return `repeating-linear-gradient(90deg, ${rgba} 0px, ${rgba} 1px, transparent 1px, transparent ${s}px)`;
        case "stripe-d":
            return `repeating-linear-gradient(45deg, ${rgba} 0px, ${rgba} 1px, transparent 1px, transparent ${s}px)`;
        case "dot": {
            const half = s / 2;
            const dotR = Math.max(1, s * 0.12);
            return `radial-gradient(circle ${dotR}px at ${half}px ${half}px, ${rgba} 100%, transparent 100%)`;
        }
        case "check": {
            const half = s / 2;
            return `linear-gradient(45deg, ${rgba} 25%, transparent 25%, transparent 75%, ${rgba} 75%), ` +
                   `linear-gradient(45deg, ${rgba} 25%, transparent 25%, transparent 75%, ${rgba} 75%)`;
        }
        default:
            return "";
    }
}

function generatePatternBgSize(patternId, scale) {
    const s = scale ?? 20;
    if (patternId === "dot") return `${s}px ${s}px`;
    if (patternId === "check") {
        const half = s / 2;
        return `${s}px ${s}px`;
    }
    return "";
}

function generatePatternBgPosition(patternId, scale) {
    const s = scale ?? 20;
    if (patternId === "check") {
        const half = s / 2;
        return `0 0, ${half}px ${half}px`;
    }
    return "";
}

function generatePatternPreviewSVG(patternId) {
    const fg = "#8cb4ff";
    const bg = "#1a1a2e";
    const encode = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
    switch (patternId) {
        case "none":
            return encode(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="${bg}"/><line x1="10" y1="10" x2="50" y2="50" stroke="#555" stroke-width="2"/><line x1="50" y1="10" x2="10" y2="50" stroke="#555" stroke-width="2"/></svg>`);
        case "stripe-h":
            return encode(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="${bg}"/><rect y="4" width="60" height="4" fill="${fg}" opacity="0.7"/><rect y="16" width="60" height="4" fill="${fg}" opacity="0.7"/><rect y="28" width="60" height="4" fill="${fg}" opacity="0.7"/><rect y="40" width="60" height="4" fill="${fg}" opacity="0.7"/><rect y="52" width="60" height="4" fill="${fg}" opacity="0.7"/></svg>`);
        case "stripe-v":
            return encode(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="${bg}"/><rect x="4" width="4" height="60" fill="${fg}" opacity="0.7"/><rect x="16" width="4" height="60" fill="${fg}" opacity="0.7"/><rect x="28" width="4" height="60" fill="${fg}" opacity="0.7"/><rect x="40" width="4" height="60" fill="${fg}" opacity="0.7"/><rect x="52" width="4" height="60" fill="${fg}" opacity="0.7"/></svg>`);
        case "stripe-d":
            return encode(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="${bg}"/><line x1="-5" y1="7" x2="53" y2="-5" stroke="${fg}" stroke-width="3" opacity="0.7"/><line x1="7" y1="19" x2="65" y2="7" stroke="${fg}" stroke-width="3" opacity="0.7"/><line x1="-5" y1="31" x2="53" y2="19" stroke="${fg}" stroke-width="3" opacity="0.7"/><line x1="7" y1="43" x2="65" y2="31" stroke="${fg}" stroke-width="3" opacity="0.7"/><line x1="-5" y1="55" x2="53" y2="43" stroke="${fg}" stroke-width="3" opacity="0.7"/><line x1="7" y1="67" x2="65" y2="55" stroke="${fg}" stroke-width="3" opacity="0.7"/></svg>`);
        case "dot":
            return encode(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="${bg}"/><circle cx="10" cy="10" r="4" fill="${fg}" opacity="0.8"/><circle cx="30" cy="10" r="4" fill="${fg}" opacity="0.8"/><circle cx="50" cy="10" r="4" fill="${fg}" opacity="0.8"/><circle cx="20" cy="25" r="4" fill="${fg}" opacity="0.8"/><circle cx="40" cy="25" r="4" fill="${fg}" opacity="0.8"/><circle cx="10" cy="40" r="4" fill="${fg}" opacity="0.8"/><circle cx="30" cy="40" r="4" fill="${fg}" opacity="0.8"/><circle cx="50" cy="40" r="4" fill="${fg}" opacity="0.8"/><circle cx="20" cy="55" r="4" fill="${fg}" opacity="0.8"/><circle cx="40" cy="55" r="4" fill="${fg}" opacity="0.8"/></svg>`);
        case "check":
            return encode(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="${bg}"/><rect x="0" y="0" width="15" height="15" fill="${fg}" opacity="0.35"/><rect x="15" y="15" width="15" height="15" fill="${fg}" opacity="0.35"/><rect x="30" y="0" width="15" height="15" fill="${fg}" opacity="0.35"/><rect x="45" y="15" width="15" height="15" fill="${fg}" opacity="0.35"/><rect x="0" y="30" width="15" height="15" fill="${fg}" opacity="0.35"/><rect x="15" y="45" width="15" height="15" fill="${fg}" opacity="0.35"/><rect x="30" y="30" width="15" height="15" fill="${fg}" opacity="0.35"/><rect x="45" y="45" width="15" height="15" fill="${fg}" opacity="0.35"/></svg>`);
        case "svg":
            return encode(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="${bg}"/><rect x="10" y="10" width="40" height="40" rx="4" fill="none" stroke="${fg}" stroke-width="2" stroke-dasharray="6 3" opacity="0.6"/><text x="30" y="36" text-anchor="middle" fill="${fg}" font-size="20" font-weight="bold" opacity="0.8">+</text></svg>`);
        default:
            return "";
    }
}

// Apply custom overrides (colors + pattern) on top of the current theme
function applyCustomOverrides(custom) {
    const root = document.documentElement;
    // Remove old custom style element
    let styleEl = document.getElementById("wfm-custom-theme-style");

    // Color overrides
    if (custom && custom.colors) {
        for (const [varName, value] of Object.entries(custom.colors)) {
            if (value) root.style.setProperty(varName, value);
        }
    }

    // Pattern
    if (custom && custom.pattern && custom.pattern.id && custom.pattern.id !== "none") {
        if (!styleEl) {
            styleEl = document.createElement("style");
            styleEl.id = "wfm-custom-theme-style";
            document.head.appendChild(styleEl);
        }
        const p = custom.pattern;
        if (p.id === "svg" && p.svgData) {
            const s = p.scale ?? 40;
            const o = p.opacity ?? 1;
            const c = p.color || null;
            const gap = p.gap ?? 0;
            // Recolor SVG: inject a global style override into the SVG
            let svgStr = p.svgData;
            if (c) {
                // 1. Replace fill/stroke attributes (but not "none")
                svgStr = svgStr
                    .replace(/fill="(?!none)[^"]*"/gi, `fill="${c}"`)
                    .replace(/stroke="(?!none)[^"]*"/gi, `stroke="${c}"`);
                // 2. Replace inline style fill/stroke
                svgStr = svgStr
                    .replace(/fill:\s*(?!none)[^;"]+/gi, `fill:${c}`)
                    .replace(/stroke:\s*(?!none)[^;"]+/gi, `stroke:${c}`);
                // 3. Inject a <style> block for elements with no explicit fill/stroke
                const styleBlock = `<style>*:not([fill="none"]){fill:${c}!important}*:not([stroke="none"])[stroke]{stroke:${c}!important}</style>`;
                svgStr = svgStr.replace(/<svg([^>]*)>/i, `<svg$1>${styleBlock}`);
            }
            // Extract original viewBox/width/height, then create wrapper SVG with padding
            const tileSize = s + gap;
            let tiledSvg;
            if (gap > 0) {
                // Extract the original viewBox to preserve it in the inner SVG
                const vbMatch = svgStr.match(/viewBox="([^"]*)"/i);
                const origViewBox = vbMatch ? vbMatch[1] : `0 0 ${s} ${s}`;
                // Wrap: outer SVG with tileSize, inner SVG with original viewBox
                tiledSvg = svgStr.replace(
                    /<svg([^>]*)>/i,
                    (match, attrs) => {
                        // Remove existing width/height/viewBox from outer
                        let clean = attrs
                            .replace(/\s*width="[^"]*"/gi, '')
                            .replace(/\s*height="[^"]*"/gi, '')
                            .replace(/\s*viewBox="[^"]*"/gi, '');
                        return `<svg${clean} width="${tileSize}" height="${tileSize}" viewBox="0 0 ${tileSize} ${tileSize}">
                            <svg width="${s}" height="${s}" x="0" y="0" viewBox="${origViewBox}">`;
                    }
                ) + '</svg>';
            } else {
                tiledSvg = svgStr;
            }
            const encoded = `url("data:image/svg+xml,${encodeURIComponent(tiledSvg)}")`;
            styleEl.textContent = `body::after { content: ""; position: fixed; inset: 0; z-index: -1; background-image: ${encoded}; background-size: ${tileSize}px ${tileSize}px; background-repeat: repeat; opacity: ${o}; pointer-events: none; }`;
        } else if (p.id !== "svg") {
            const bg = generatePatternCSS(p.id, p.color, p.opacity, p.scale);
            const bgSize = generatePatternBgSize(p.id, p.scale);
            const bgPos = generatePatternBgPosition(p.id, p.scale);
            let css = `body { background-image: ${bg} !important;`;
            if (bgSize) css += ` background-size: ${bgSize} !important;`;
            if (bgPos) css += ` background-position: ${bgPos} !important;`;
            css += ` }`;
            styleEl.textContent = css;
        }
    } else {
        if (styleEl) styleEl.remove();
    }

    // Font
    if (custom && custom.fontId) {
        applyCustomFont(custom.fontId);
    } else {
        const fontEl = document.getElementById("wfm-custom-font-style");
        if (fontEl) fontEl.remove();
    }
}

function clearCustomOverrides() {
    const root = document.documentElement;
    for (const ct of COLOR_TARGETS) {
        root.style.removeProperty(ct.varName);
    }
    const styleEl = document.getElementById("wfm-custom-theme-style");
    if (styleEl) styleEl.remove();
    const fontEl = document.getElementById("wfm-custom-font-style");
    if (fontEl) fontEl.remove();
}

export function applyTheme(themeId) {
    if (themeId) {
        document.documentElement.setAttribute("data-theme", themeId);
    } else {
        document.documentElement.removeAttribute("data-theme");
    }
    // Apply saved custom overrides
    const settings = loadLocalSettings();
    clearCustomOverrides();
    if (settings.themeCustom) {
        applyCustomOverrides(settings.themeCustom);
    }
}

export function getSavedTheme() {
    return loadLocalSettings().theme || "";
}

export async function initSettingsTab() {
    const container = document.querySelector("#wfm-tab-settings .wfm-settings-container");
    if (!container) return;

    const settings = loadLocalSettings();
    const serverSettings = await loadServerSettings();

    // Load current workflows dir info
    let workflowsDirInfo = { current: "", default: "" };
    try {
        const res = await fetch("/api/wfm/settings/workflows-dir");
        workflowsDirInfo = await res.json();
    } catch {}

    // Load gallery output dir info
    let outputDirInfo = { current: "", default: "", saved: "" };
    try {
        const res = await fetch("/api/wfm/settings/output-dir");
        outputDirInfo = await res.json();
    } catch {}

    const uiLang = getLang();
    const summaryLang = getSummaryLang();

    container.innerHTML = `
        <h2 style="font-size:18px;margin-bottom:20px;">${t("settingsTitle")}</h2>

        <div class="wfm-settings-layout">

        <!-- Right column: Theme (floated right) -->
        <div class="wfm-settings-right-col">
        <!-- Theme -->
        <details class="wfm-settings-section" open>
            <summary class="wfm-settings-summary">${t("themeLabel")}</summary>
            <div class="wfm-theme-grid" id="wfm-theme-grid">
                ${THEMES.map(th => `
                    <div class="wfm-theme-card ${(settings.theme || "") === th.id ? "active" : ""}" data-theme-id="${th.id}">
                        <div class="wfm-theme-swatch">
                            ${th.colors.map(c => `<span style="background:${c};"></span>`).join("")}
                        </div>
                        <div class="wfm-theme-card-label">${t(th.key)}</div>
                    </div>
                `).join("")}
            </div>

            <!-- Theme Customizer -->
            <button class="wfm-customizer-toggle" id="wfm-customizer-toggle">
                <span class="arrow">&#9654;</span> ${t("themeCustomize")}
            </button>
            <div class="wfm-customizer-panel" id="wfm-customizer-panel">
                <!-- Color overrides -->
                <div class="wfm-customizer-section">
                    <h4>${t("themeCustomizeColors")}</h4>
                    <div class="wfm-color-grid" id="wfm-color-grid">
                        ${COLOR_TARGETS.map(ct => {
                            const saved = settings.themeCustom?.colors?.[ct.varName] || "";
                            return `<div class="wfm-color-item">
                                <label>${t(ct.key)}</label>
                                <input type="color" data-var="${ct.varName}" value="${saved || getComputedStyle(document.documentElement).getPropertyValue(ct.varName).trim()}" title="${ct.varName}">
                            </div>`;
                        }).join("")}
                    </div>
                </div>

                <!-- Background pattern -->
                <div class="wfm-customizer-section">
                    <h4>${t("themeCustomizeBgPattern")}</h4>
                    <div class="wfm-pattern-grid" id="wfm-pattern-grid">
                        ${BG_PATTERNS.map(p => {
                            const active = (settings.themeCustom?.pattern?.id || "none") === p.id ? "active" : "";
                            const preview = generatePatternPreviewSVG(p.id);
                            const bgStyle = preview
                                ? `background:url('${preview}') no-repeat center/cover;`
                                : "background:#333;";
                            return `<div class="wfm-pattern-item ${active} ${p.id === 'svg' ? 'wfm-svg-upload-btn' : ''}" data-pattern-id="${p.id}" style="${bgStyle}">
                                <span class="wfm-pattern-item-label">${t(p.key)}</span>
                            </div>`;
                        }).join("")}
                    </div>
                    <input type="file" id="wfm-svg-upload" accept=".svg" style="display:none;">

                    <!-- Pattern options -->
                    <div class="wfm-pattern-options" id="wfm-pattern-options" style="${(!settings.themeCustom?.pattern?.id || settings.themeCustom?.pattern?.id === 'none') ? 'display:none;' : ''}">
                        <label>
                            ${t("themePatternColor")}
                            <input type="color" id="wfm-pattern-color" value="${settings.themeCustom?.pattern?.color || '#ffffff'}">
                        </label>
                        <label>
                            ${t("themePatternOpacity")}
                            <input type="range" id="wfm-pattern-opacity" min="0.02" max="0.5" step="0.02" value="${settings.themeCustom?.pattern?.opacity ?? 0.1}">
                            <span id="wfm-pattern-opacity-val">${settings.themeCustom?.pattern?.opacity ?? 0.1}</span>
                        </label>
                        <label>
                            ${t("themePatternScale")}
                            <input type="range" id="wfm-pattern-scale" min="8" max="80" step="2" value="${settings.themeCustom?.pattern?.scale ?? 20}">
                            <span id="wfm-pattern-scale-val">${settings.themeCustom?.pattern?.scale ?? 20}px</span>
                        </label>
                        <label>
                            ${t("themePatternGap")}
                            <input type="range" id="wfm-pattern-gap" min="0" max="60" step="2" value="${settings.themeCustom?.pattern?.gap ?? 0}">
                            <span id="wfm-pattern-gap-val">${settings.themeCustom?.pattern?.gap ?? 0}px</span>
                        </label>
                    </div>
                    <div id="wfm-svg-name" style="font-size:11px;color:var(--wfm-text-secondary);margin-top:6px;${settings.themeCustom?.pattern?.id === 'svg' ? '' : 'display:none;'}">
                        ${settings.themeCustom?.pattern?.svgName ? `SVG: ${settings.themeCustom.pattern.svgName}` : ''}
                    </div>
                </div>

                <!-- Font -->
                <div class="wfm-customizer-section">
                    <h4>${t("themeCustomizeFont")}</h4>
                    <div class="wfm-font-grid" id="wfm-font-grid">
                        ${FONT_OPTIONS.map(f => {
                            const active = (settings.themeCustom?.fontId || "") === f.id ? "active" : "";
                            return `<div class="wfm-font-item ${active}" data-font-id="${f.id}" title="${f.css || 'System Default'}">
                                <span class="wfm-font-preview" style="${f.css ? `font-family:${f.css};` : ''}">${t(f.key)}</span>
                            </div>`;
                        }).join("")}
                    </div>
                </div>

                <!-- Actions -->
                <div class="wfm-customizer-actions">
                    <button class="wfm-btn wfm-btn-primary wfm-btn-sm" id="wfm-customizer-apply">${t("themeCustomizerApply")}</button>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-customizer-reset">${t("themeCustomizerReset")}</button>
                </div>
            </div>
        </details>

        </div><!-- /wfm-settings-right-col -->

        <!-- Left column: all settings (Language + rest), flows left of floated Theme -->
        <div class="wfm-settings-left-col">
        <!-- Language Settings -->
        <details class="wfm-settings-section" open>
            <summary class="wfm-settings-summary">${t("langLabel")} / ${t("summaryLangLabel")}</summary>
            <div class="wfm-form-group">
                <label>${t("langLabel")}</label>
                <select class="wfm-select" id="wfm-settings-ui-lang">
                    ${buildLangOptions(getLanguageOptions(), uiLang)}
                </select>
            </div>
            <div class="wfm-form-group">
                <label>${t("summaryLangLabel")}</label>
                <select class="wfm-select" id="wfm-settings-summary-lang">
                    ${buildLangOptions(getSummaryLanguageOptions(), summaryLang)}
                </select>
                <small style="color:var(--wfm-warning);font-size:11px;display:block;margin-top:4px;">
                    ⚠ ${t("summaryLangNote")}
                </small>
            </div>
        </details>

        <!-- Workflow Data Folder -->
        <details class="wfm-settings-section">
            <summary class="wfm-settings-summary">${t("workflowsDir")}</summary>
            <div class="wfm-form-group">
                <label>${t("workflowsDirLabel")}</label>
                <div style="display:flex;gap:8px;">
                    <input type="text" class="wfm-input" id="wfm-settings-workflows-dir"
                        value="${serverSettings.workflows_dir || ""}"
                        placeholder="${workflowsDirInfo.default}">
                    <button class="wfm-btn wfm-btn-primary wfm-btn-sm" id="wfm-settings-workflows-dir-apply">${t("workflowsDirApply")}</button>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-settings-workflows-dir-reset">${t("workflowsDirDefault")}</button>
                </div>
                <small style="color:var(--wfm-text-secondary);font-size:11px;display:block;margin-top:4px;">
                    ${t("workflowsDirHint")}
                </small>
                <div style="font-size:11px;color:var(--wfm-text-secondary);margin-top:6px;">
                    ${t("workflowsDirCurrent")}: <code id="wfm-settings-workflows-dir-current" style="color:var(--wfm-primary);word-break:break-all;">${workflowsDirInfo.current}</code>
                </div>
            </div>
        </details>

        <!-- Gallery Output Folder -->
        <details class="wfm-settings-section">
            <summary class="wfm-settings-summary">${t("galleryOutputDir")}</summary>
            <div class="wfm-form-group">
                <label>${t("galleryOutputDirLabel")}</label>
                <div style="display:flex;gap:8px;">
                    <input type="text" class="wfm-input" id="wfm-settings-output-dir"
                        value="${serverSettings.gallery_output_dir || ""}"
                        placeholder="${outputDirInfo.default}">
                    <button class="wfm-btn wfm-btn-primary wfm-btn-sm" id="wfm-settings-output-dir-apply">${t("workflowsDirApply")}</button>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-settings-output-dir-reset">${t("workflowsDirDefault")}</button>
                </div>
                <small style="color:var(--wfm-text-secondary);font-size:11px;display:block;margin-top:4px;">
                    ${t("galleryOutputDirHint")}
                </small>
                <div style="font-size:11px;color:var(--wfm-text-secondary);margin-top:6px;">
                    ${t("workflowsDirCurrent")}: <code id="wfm-settings-output-dir-current" style="color:var(--wfm-primary);word-break:break-all;">${outputDirInfo.current}</code>
                </div>
            </div>
        </details>

        <!-- ComfyUI Settings -->
        <details class="wfm-settings-section">
            <summary class="wfm-settings-summary">${t("comfyuiConnection")}</summary>
            <div class="wfm-form-group">
                <label>${t("comfyuiUrl")}</label>
                <div style="display:flex;gap:8px;">
                    <input type="text" class="wfm-input" id="wfm-settings-comfyui-url"
                        value="${settings.comfyuiUrl || ""}"
                        placeholder="${t("comfyuiUrlHint")}">
                    <button class="wfm-btn" id="wfm-settings-test-url">${t("test")}</button>
                </div>
                <small style="color:var(--wfm-text-secondary);font-size:11px;">
                    ${t("comfyuiUrlHint")}
                </small>
            </div>
            <div id="wfm-settings-url-status" style="font-size:12px;margin-top:4px;"></div>
        </details>

        <!-- Ollama Settings -->
        <details class="wfm-settings-section">
            <summary class="wfm-settings-summary">${t("ollamaSettings")}</summary>
            <div class="wfm-form-group">
                <label>${t("ollamaUrl")}</label>
                <input type="text" class="wfm-input" id="wfm-settings-ollama-url"
                    value="${serverSettings.ollama_url || "http://localhost:11434"}"
                    placeholder="http://localhost:11434">
            </div>
            <div class="wfm-form-group">
                <label>${t("ollamaDefaultModel")}</label>
                <div style="display:flex;gap:8px;">
                    <select class="wfm-select" id="wfm-settings-ollama-model" style="flex:1;">
                        <option value="">${t("selectModel")}</option>
                    </select>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-settings-ollama-refresh">${t("refresh")}</button>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:8px;">
                <button class="wfm-btn wfm-btn-primary wfm-btn-sm" id="wfm-settings-ollama-save">${t("saveOllama")}</button>
                <button class="wfm-btn wfm-btn-sm" id="wfm-settings-ollama-test">${t("testConnection")}</button>
                <span id="wfm-settings-ollama-status" style="font-size:12px;line-height:28px;"></span>
            </div>
        </details>

        <!-- Default Workflow -->
        <details class="wfm-settings-section">
            <summary class="wfm-settings-summary">${t("defaultWorkflow")}</summary>
            <div class="wfm-form-group">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:13px;" id="wfm-settings-default-wf-name">${settings.defaultWorkflow || t("defaultWorkflowNone")}</span>
                    <button class="wfm-btn wfm-btn-sm" id="wfm-settings-clear-wf" ${settings.defaultWorkflow ? "" : "disabled"}>${t("clear")}</button>
                </div>
                <small style="color:var(--wfm-text-secondary);font-size:11px;display:block;margin-top:6px;">
                    ${t("defaultWorkflowHint")}
                </small>
            </div>
        </details>

        <!-- Eagle Integration (optional) -->
        <details class="wfm-settings-section">
            <summary class="wfm-settings-summary">${t("eagleIntegration")}</summary>
            <div class="wfm-form-group">
                <label>${t("eagleUrl")}</label>
                <div style="display:flex;gap:8px;">
                    <input type="text" class="wfm-input" id="wfm-settings-eagle-url"
                        value="${settings.eagleUrl || "http://localhost:41595"}"
                        placeholder="http://localhost:41595">
                    <button class="wfm-btn" id="wfm-settings-test-eagle">${t("test")}</button>
                </div>
            </div>
            <div id="wfm-settings-eagle-status" style="font-size:12px;margin-top:4px;"></div>
            <div class="wfm-form-group" style="margin-top:8px;">
                <label>
                    <input type="checkbox" id="wfm-settings-eagle-auto-save"
                        ${settings.eagleAutoSave ? "checked" : ""}>
                    ${t("eagleAutoSave")}
                </label>
            </div>
        </details>

        <!-- Data Management -->
        <details class="wfm-settings-section">
            <summary class="wfm-settings-summary">${t("dataManagement")}</summary>
            <p style="font-size:12px;color:var(--wfm-text-secondary);margin-bottom:12px;">${t("dataManagementHint")}</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="wfm-btn wfm-btn-sm" id="wfm-settings-export">${t("exportData")}</button>
                <label class="wfm-btn wfm-btn-sm" style="cursor:pointer;margin:0;">
                    ${t("importData")}
                    <input type="file" id="wfm-settings-import-file" accept=".json" style="display:none;">
                </label>
            </div>
            <div id="wfm-settings-data-status" style="font-size:12px;margin-top:8px;"></div>
        </details>

        <!-- Save Button -->
        <button class="wfm-btn wfm-btn-primary" id="wfm-settings-save" style="min-width:120px;">${t("saveSettings")}</button>

        </div><!-- /wfm-settings-left-col -->

        <div style="clear:both;"></div>
        </div><!-- /wfm-settings-layout -->
    `;

    // --- Theme change handler ---
    document.getElementById("wfm-theme-grid")?.addEventListener("click", (e) => {
        const card = e.target.closest(".wfm-theme-card");
        if (!card) return;
        const themeId = card.dataset.themeId;
        // Clear custom overrides when switching theme base
        clearCustomOverrides();
        const cur = loadLocalSettings();
        delete cur.themeCustom;
        cur.theme = themeId;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(cur));
        applyTheme(themeId);
        // Update active state
        document.querySelectorAll(".wfm-theme-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        // Update color pickers to reflect new theme's computed values
        requestAnimationFrame(() => {
            document.querySelectorAll("#wfm-color-grid input[type=color]").forEach(inp => {
                const v = getComputedStyle(document.documentElement).getPropertyValue(inp.dataset.var).trim();
                if (v) inp.value = v.startsWith("#") ? v : rgbToHex(v);
            });
        });
        showToast(t("settingsSaved"), "success");
    });

    // --- Theme Customizer handlers ---
    // State for live editing
    let customizerState = {
        colors: { ...(settings.themeCustom?.colors || {}) },
        pattern: { ...(settings.themeCustom?.pattern || { id: "none", color: "#ffffff", opacity: 0.1, scale: 20 }) },
        fontId: settings.themeCustom?.fontId || "",
    };

    // Toggle panel
    document.getElementById("wfm-customizer-toggle")?.addEventListener("click", () => {
        const toggle = document.getElementById("wfm-customizer-toggle");
        const panel = document.getElementById("wfm-customizer-panel");
        toggle.classList.toggle("open");
        panel.classList.toggle("open");
    });

    // Live color change
    document.getElementById("wfm-color-grid")?.addEventListener("input", (e) => {
        if (e.target.type !== "color") return;
        const varName = e.target.dataset.var;
        const value = e.target.value;
        customizerState.colors[varName] = value;
        document.documentElement.style.setProperty(varName, value);
    });

    // Pattern selection
    document.getElementById("wfm-pattern-grid")?.addEventListener("click", (e) => {
        const item = e.target.closest(".wfm-pattern-item");
        if (!item) return;
        const patternId = item.dataset.patternId;

        // SVG file upload
        if (patternId === "svg") {
            document.getElementById("wfm-svg-upload")?.click();
            return;
        }

        customizerState.pattern.id = patternId;
        // Update active state
        document.querySelectorAll(".wfm-pattern-item").forEach(i => i.classList.remove("active"));
        item.classList.add("active");

        // Show/hide options
        const optionsEl = document.getElementById("wfm-pattern-options");
        const svgNameEl = document.getElementById("wfm-svg-name");
        if (patternId === "none") {
            optionsEl.style.display = "none";
            svgNameEl.style.display = "none";
        } else {
            optionsEl.style.display = "";
            svgNameEl.style.display = "none";
        }

        // Live preview
        applyCustomOverrides(customizerState);
    });

    // SVG file upload handler
    document.getElementById("wfm-svg-upload")?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const svgData = ev.target.result;
            customizerState.pattern.id = "svg";
            customizerState.pattern.svgData = svgData;
            customizerState.pattern.svgName = file.name;

            // Update active state
            document.querySelectorAll(".wfm-pattern-item").forEach(i => i.classList.remove("active"));
            document.querySelector('.wfm-pattern-item[data-pattern-id="svg"]')?.classList.add("active");

            // Show options + name
            document.getElementById("wfm-pattern-options").style.display = "";
            const svgNameEl = document.getElementById("wfm-svg-name");
            svgNameEl.textContent = `SVG: ${file.name}`;
            svgNameEl.style.display = "";

            applyCustomOverrides(customizerState);
        };
        reader.readAsText(file);
        e.target.value = "";
    });

    // Pattern option changes (live)
    document.getElementById("wfm-pattern-color")?.addEventListener("input", (e) => {
        customizerState.pattern.color = e.target.value;
        applyCustomOverrides(customizerState);
    });
    document.getElementById("wfm-pattern-opacity")?.addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        customizerState.pattern.opacity = v;
        document.getElementById("wfm-pattern-opacity-val").textContent = v;
        applyCustomOverrides(customizerState);
    });
    document.getElementById("wfm-pattern-scale")?.addEventListener("input", (e) => {
        const v = parseInt(e.target.value);
        customizerState.pattern.scale = v;
        document.getElementById("wfm-pattern-scale-val").textContent = v + "px";
        applyCustomOverrides(customizerState);
    });
    document.getElementById("wfm-pattern-gap")?.addEventListener("input", (e) => {
        const v = parseInt(e.target.value);
        customizerState.pattern.gap = v;
        document.getElementById("wfm-pattern-gap-val").textContent = v + "px";
        applyCustomOverrides(customizerState);
    });

    // Font selection
    document.getElementById("wfm-font-grid")?.addEventListener("click", (e) => {
        const item = e.target.closest(".wfm-font-item");
        if (!item) return;
        const fontId = item.dataset.fontId;
        customizerState.fontId = fontId;
        // Load web font for preview
        const font = FONT_OPTIONS.find(f => f.id === fontId);
        if (font?.google) loadGoogleFont(font.google);
        applyCustomFont(fontId);
        // Update active state
        document.querySelectorAll(".wfm-font-item").forEach(i => i.classList.remove("active"));
        item.classList.add("active");
    });

    // Apply & Save
    document.getElementById("wfm-customizer-apply")?.addEventListener("click", () => {
        // Clean empty color overrides
        const cleanColors = {};
        for (const [k, v] of Object.entries(customizerState.colors)) {
            if (v) cleanColors[k] = v;
        }
        const custom = {
            colors: Object.keys(cleanColors).length ? cleanColors : undefined,
            pattern: customizerState.pattern.id !== "none" ? { ...customizerState.pattern } : undefined,
            fontId: customizerState.fontId || undefined,
        };
        saveLocalSettings({ themeCustom: (custom.colors || custom.pattern || custom.fontId) ? custom : undefined });
        showToast(t("settingsSaved"), "success");
    });

    // Reset
    document.getElementById("wfm-customizer-reset")?.addEventListener("click", () => {
        clearCustomOverrides();
        customizerState = {
            colors: {},
            pattern: { id: "none", color: "#ffffff", opacity: 0.1, scale: 20, gap: 0 },
            fontId: "",
        };
        // Remove themeCustom from localStorage directly (spread merge won't delete keys)
        const cur = loadLocalSettings();
        delete cur.themeCustom;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(cur));
        applyTheme(cur.theme || "");

        // Reset UI
        requestAnimationFrame(() => {
            document.querySelectorAll("#wfm-color-grid input[type=color]").forEach(inp => {
                const v = getComputedStyle(document.documentElement).getPropertyValue(inp.dataset.var).trim();
                if (v) inp.value = v.startsWith("#") ? v : rgbToHex(v);
            });
        });
        document.querySelectorAll(".wfm-pattern-item").forEach(i => i.classList.remove("active"));
        document.querySelector('.wfm-pattern-item[data-pattern-id="none"]')?.classList.add("active");
        document.getElementById("wfm-pattern-options").style.display = "none";
        document.getElementById("wfm-svg-name").style.display = "none";
        // Reset font UI
        document.querySelectorAll(".wfm-font-item").forEach(i => i.classList.remove("active"));
        document.querySelector('.wfm-font-item[data-font-id=""]')?.classList.add("active");
        showToast(t("settingsSaved"), "success");
    });

    // --- Language change handlers ---
    document.getElementById("wfm-settings-ui-lang")?.addEventListener("change", (e) => {
        const lang = e.target.value;
        setLang(lang);
        saveLocalSettings({ ...loadLocalSettings(), uiLang: lang });
        // Re-render the entire page to apply new language
        showToast("Language changed. Reloading...", "success");
        setTimeout(() => location.reload(), 500);
    });

    document.getElementById("wfm-settings-summary-lang")?.addEventListener("change", (e) => {
        const lang = e.target.value;
        setSummaryLang(lang);
        saveLocalSettings({ ...loadLocalSettings(), summaryLang: lang });
        showToast(t("settingsSaved"), "success");
    });

    // --- Workflows dir handlers ---
    document.getElementById("wfm-settings-workflows-dir-apply")?.addEventListener("click", async () => {
        const dirInput = document.getElementById("wfm-settings-workflows-dir");
        const currentEl = document.getElementById("wfm-settings-workflows-dir-current");
        const newDir = dirInput.value.trim();
        try {
            const res = await fetch("/api/wfm/settings/workflows-dir", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workflows_dir: newDir }),
            });
            const data = await res.json();
            if (data.error) {
                showToast(`${t("workflowsDirError")}: ${data.error}`, "error");
            } else {
                if (currentEl) currentEl.textContent = data.workflows_dir;
                showToast(t("workflowsDirChanged"), "success");
            }
        } catch (err) {
            showToast(`${t("workflowsDirError")}: ${err.message}`, "error");
        }
    });

    document.getElementById("wfm-settings-workflows-dir-reset")?.addEventListener("click", async () => {
        const dirInput = document.getElementById("wfm-settings-workflows-dir");
        const currentEl = document.getElementById("wfm-settings-workflows-dir-current");
        dirInput.value = "";
        try {
            const res = await fetch("/api/wfm/settings/workflows-dir", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workflows_dir: "" }),
            });
            const data = await res.json();
            if (currentEl) currentEl.textContent = data.workflows_dir;
            showToast(t("workflowsDirChanged"), "success");
        } catch (err) {
            showToast(`${t("workflowsDirError")}: ${err.message}`, "error");
        }
    });

    // --- Gallery output dir handlers ---
    document.getElementById("wfm-settings-output-dir-apply")?.addEventListener("click", async () => {
        const dirInput = document.getElementById("wfm-settings-output-dir");
        const currentEl = document.getElementById("wfm-settings-output-dir-current");
        const newDir = dirInput.value.trim();
        try {
            const res = await fetch("/api/wfm/settings/output-dir", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gallery_output_dir: newDir }),
            });
            const data = await res.json();
            if (data.error) {
                showToast(`${t("workflowsDirError")}: ${data.error}`, "error");
            } else {
                if (currentEl) currentEl.textContent = data.current;
                showToast(t("workflowsDirChanged"), "success");
                // gallery-tab に通知して再ロード
                window.dispatchEvent(new CustomEvent("wfm-output-dir-changed", { detail: { path: data.current } }));
            }
        } catch (err) {
            showToast(`${t("workflowsDirError")}: ${err.message}`, "error");
        }
    });

    document.getElementById("wfm-settings-output-dir-reset")?.addEventListener("click", async () => {
        const dirInput = document.getElementById("wfm-settings-output-dir");
        const currentEl = document.getElementById("wfm-settings-output-dir-current");
        dirInput.value = "";
        try {
            const res = await fetch("/api/wfm/settings/output-dir", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gallery_output_dir: "" }),
            });
            const data = await res.json();
            if (currentEl) currentEl.textContent = data.current;
            showToast(t("workflowsDirChanged"), "success");
            window.dispatchEvent(new CustomEvent("wfm-output-dir-changed", { detail: { path: data.current } }));
        } catch (err) {
            showToast(`${t("workflowsDirError")}: ${err.message}`, "error");
        }
    });

    // --- Ollama model list loader ---
    async function loadOllamaModels() {
        const select = document.getElementById("wfm-settings-ollama-model");
        try {
            const res = await fetch("/api/wfm/ollama/models");
            const data = await res.json();
            const models = data.models || [];
            const savedModel = serverSettings.ollama_model || "llava";
            select.innerHTML = models.length
                ? models.map((m) => `<option value="${m.name}" ${m.name === savedModel ? "selected" : ""}>${m.name}</option>`).join("")
                : `<option value="">${t("noModelsFound")}</option>`;
        } catch {
            select.innerHTML = `<option value="">${t("failedLoadModels")}</option>`;
        }
    }
    await loadOllamaModels();

    // Refresh Ollama models
    document.getElementById("wfm-settings-ollama-refresh")?.addEventListener("click", loadOllamaModels);

    // Test Ollama connection
    document.getElementById("wfm-settings-ollama-test")?.addEventListener("click", async () => {
        const statusEl = document.getElementById("wfm-settings-ollama-status");
        statusEl.textContent = "Testing...";
        statusEl.style.color = "var(--wfm-text-secondary)";
        try {
            const res = await fetch("/api/wfm/ollama/test", { method: "POST" });
            const data = await res.json();
            statusEl.textContent = data.connected ? t("ollamaConnected") : `${t("ollamaFailed")}: ${data.message}`;
            statusEl.style.color = data.connected ? "var(--wfm-success)" : "var(--wfm-danger)";
        } catch (err) {
            statusEl.textContent = `${t("error")}: ${err.message}`;
            statusEl.style.color = "var(--wfm-danger)";
        }
    });

    // Save Ollama settings (to server)
    document.getElementById("wfm-settings-ollama-save")?.addEventListener("click", async () => {
        const ollamaUrl = document.getElementById("wfm-settings-ollama-url")?.value.trim() || "http://localhost:11434";
        const ollamaModel = document.getElementById("wfm-settings-ollama-model")?.value || "";
        try {
            await saveServerSettings({ ollama_url: ollamaUrl, ollama_model: ollamaModel });
            serverSettings.ollama_url = ollamaUrl;
            serverSettings.ollama_model = ollamaModel;
            showToast(t("ollamaSaved"), "success");
        } catch (err) {
            showToast(`${t("saveError")}: ${err.message}`, "error");
        }
    });

    // Test ComfyUI URL
    document.getElementById("wfm-settings-test-url")?.addEventListener("click", async () => {
        const urlInput = document.getElementById("wfm-settings-comfyui-url");
        const statusEl = document.getElementById("wfm-settings-url-status");
        const url = urlInput.value.trim() || window.location.origin;

        comfyUI.updateUrl(url);
        const ok = await comfyUI.checkConnection();
        statusEl.textContent = ok ? t("connectedCheck") : t("failedConnect");
        statusEl.style.color = ok ? "var(--wfm-success)" : "var(--wfm-danger)";
    });

    // Test Eagle URL (via server proxy to avoid CORS)
    document.getElementById("wfm-settings-test-eagle")?.addEventListener("click", async () => {
        const urlInput = document.getElementById("wfm-settings-eagle-url");
        const statusEl = document.getElementById("wfm-settings-eagle-status");
        statusEl.textContent = "Testing...";
        statusEl.style.color = "var(--wfm-text-secondary)";
        try {
            const res = await fetch("/api/wfm/eagle/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ eagleUrl: urlInput.value.trim() }),
            });
            const data = await res.json();
            if (data.connected) {
                statusEl.textContent = `${t("connectedCheck")} (Eagle v${data.version || "?"})`;
                statusEl.style.color = "var(--wfm-success)";
            } else {
                statusEl.textContent = `${t("failedConnect")}: ${data.message || ""}`;
                statusEl.style.color = "var(--wfm-danger)";
            }
        } catch {
            statusEl.textContent = t("failedConnect");
            statusEl.style.color = "var(--wfm-danger)";
        }
    });

    // Clear default workflow
    document.getElementById("wfm-settings-clear-wf")?.addEventListener("click", () => {
        const s = JSON.parse(localStorage.getItem("wfm_settings") || "{}");
        delete s.defaultWorkflow;
        delete s.defaultWorkflowData;
        localStorage.setItem("wfm_settings", JSON.stringify(s));
        const nameEl = document.getElementById("wfm-settings-default-wf-name");
        if (nameEl) nameEl.textContent = t("defaultWorkflowNone");
        document.getElementById("wfm-settings-clear-wf").disabled = true;
        showToast(t("defaultWorkflowCleared"), "success");
    });

    // Save (local settings)
    document.getElementById("wfm-settings-save")?.addEventListener("click", () => {
        const patch = {
            comfyuiUrl: document.getElementById("wfm-settings-comfyui-url")?.value.trim() || "",
            eagleUrl: document.getElementById("wfm-settings-eagle-url")?.value.trim() || "http://localhost:41595",
            eagleAutoSave: document.getElementById("wfm-settings-eagle-auto-save")?.checked || false,
            uiLang: getLang(),
            summaryLang: getSummaryLang(),
            theme: document.documentElement.getAttribute("data-theme") || "",
        };

        saveLocalSettings(patch);

        // Apply ComfyUI URL
        comfyUI.updateUrl(patch.comfyuiUrl || window.location.origin);

        showToast(t("settingsSaved"), "success");
    });

    // Apply saved ComfyUI URL on init
    const savedUrl = settings.comfyuiUrl || "";
    if (savedUrl) {
        comfyUI.updateUrl(savedUrl);
    }

    // --- Data Export ---
    document.getElementById("wfm-settings-export")?.addEventListener("click", async () => {
        const statusEl = document.getElementById("wfm-settings-data-status");
        try {
            const res = await fetch("/api/wfm/settings/export");
            if (!res.ok) throw new Error(await res.text());
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "wfm-data-export.json";
            a.click();
            URL.revokeObjectURL(url);
            statusEl.textContent = t("exportSuccess");
            statusEl.style.color = "var(--wfm-success, #4caf50)";
        } catch (e) {
            statusEl.textContent = t("exportError") + ": " + e.message;
            statusEl.style.color = "var(--wfm-error, #f44336)";
        }
    });

    // --- Data Import ---
    document.getElementById("wfm-settings-import-file")?.addEventListener("change", async (e) => {
        const statusEl = document.getElementById("wfm-settings-data-status");
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const bundle = JSON.parse(text);
            const res = await fetch("/api/wfm/settings/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bundle),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || res.statusText);
            const imported = result.imported?.join(", ") || "-";
            statusEl.textContent = t("importSuccess") + ": " + imported;
            statusEl.style.color = "var(--wfm-success, #4caf50)";
        } catch (e) {
            statusEl.textContent = t("importError") + ": " + e.message;
            statusEl.style.color = "var(--wfm-error, #f44336)";
        }
        // Reset file input so same file can be re-selected
        e.target.value = "";
    });
}

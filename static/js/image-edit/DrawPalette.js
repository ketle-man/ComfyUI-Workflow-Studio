/**
 * Image Edit Tab - Draw Tool color palette
 * Drawツールの2段目（ie-tool-options）に並べるカラーパレット。
 * 色1/色2の切替、基本色、カスタム色の登録を担当する。
 * 基本色・カスタム色はユーザー設定として localStorage に保存する（作品データには含めない）。
 */

import { t } from "../i18n.js";

const STORAGE_KEY = "ie_draw_palette_v1";
const CUSTOM_SLOTS = 20;

const DEFAULT_BASE = [
    "#000000", "#7f7f7f", "#880015", "#ed1c24", "#ff7f27", "#fff200", "#22b14c", "#00a2e8", "#3f48cc", "#a349a4",
    "#ffffff", "#c3c3c3", "#b97a57", "#ffaec9", "#ffc90e", "#efe4b0", "#b5e61d", "#99d9ea", "#7092be", "#c8bfe7",
];

function normalizeHex(value) {
    if (typeof value !== "string") return null;
    const hex = value.toLowerCase();
    return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
}

function loadPalette() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* 破損時は初期値 */ }
    return {
        base:   DEFAULT_BASE.map((c, i) => normalizeHex(saved?.base?.[i]) ?? c),
        custom: Array.from({ length: CUSTOM_SLOTS }, (_, i) => normalizeHex(saved?.custom?.[i])),
    };
}

export class DrawPalette {
    /**
     * @param {object} opts
     * @param {(hex: string) => void} opts.onColorChange ブラシ色を変更する
     * @param {(msg: string, type?: string) => void} opts.toast
     */
    constructor({ onColorChange, toast }) {
        this._onColorChange = onColorChange;
        this._toast  = toast;
        this._wells  = ["#000000", "#ffffff"];
        this._activeWell = 0;
        Object.assign(this, loadPalette());
        this._content = null;
        this._picker  = null;
        this._pickerTarget = null;
        this._menu = null;
        this._closeMenuOnOutside = e => { if (!this._menu?.contains(e.target)) this.closeMenu(); };
        this._closeMenuOnEscape  = e => { if (e.key === "Escape") this.closeMenu(); };
    }

    get currentColor() { return this._wells[this._activeWell]; }

    /** ie-tool-options へパレットを描画する */
    render(container) {
        this.closeMenu();

        const root = document.createElement("div");
        root.className = "ie-palette";
        this._content = document.createElement("div");
        this._content.className = "ie-palette-content";
        this._picker = document.createElement("input");
        this._picker.type = "color";
        this._picker.className = "ie-palette-picker";
        this._picker.tabIndex = -1;
        root.append(this._content, this._picker);
        container.appendChild(root);

        root.addEventListener("click", e => this._onClick(e));
        root.addEventListener("contextmenu", e => this._onContextMenu(e));
        this._picker.addEventListener("input", () => this._onPickerInput());
        this._refresh();
    }

    /** スポイト・カラー入力などパレット外で変わった色を反映する */
    syncColor(color) {
        const hex = normalizeHex(color);
        if (!hex) return;
        this._wells[this._activeWell] = hex;
        this._refresh();
    }

    /** 色1/色2を切り替える */
    toggleWell() {
        this._selectWell(1 - this._activeWell);
    }

    closeMenu() {
        if (!this._menu) return;
        this._menu.remove();
        this._menu = null;
        document.removeEventListener("pointerdown", this._closeMenuOnOutside, true);
        document.removeEventListener("keydown", this._closeMenuOnEscape, true);
    }

    _refresh() {
        if (!this._content?.isConnected) return;
        const wells = this._wells.map((color, i) => {
            const label = t(i === 0 ? "imageEditPaletteColor1" : "imageEditPaletteColor2");
            return `<button type="button" class="ie-palette-well${i === this._activeWell ? " is-active" : ""}"
                data-well="${i}" style="--swatch:${color}" title="${label} (X): ${color}" aria-label="${label}"></button>`;
        }).join("");
        this._content.innerHTML = `
            <div class="ie-opt-group ie-palette-wells">${wells}</div>
            <div class="ie-opt-group">
                <label>${t("imageEditPaletteBase")}</label>
                <div class="ie-palette-grid">${this._swatches("base")}</div>
            </div>
            <div class="ie-opt-group">
                <label>${t("imageEditPaletteCustom")}</label>
                <div class="ie-palette-grid">${this._swatches("custom")}</div>
                <button type="button" class="wfm-btn wfm-btn-sm" data-palette-add
                    title="${t("imageEditPaletteAddTitle")}">+</button>
            </div>`;
    }

    _swatches(kind) {
        return this[kind].map((color, i) => {
            const attrs = `data-kind="${kind}" data-index="${i}"`;
            if (!color) {
                const title = t("imageEditPaletteEmptyTitle");
                return `<button type="button" class="ie-palette-swatch is-empty" ${attrs} title="${title}" aria-label="${title}"></button>`;
            }
            const current = color === this.currentColor ? " is-current" : "";
            const title = `${color} — ${t("imageEditPaletteSwatchTitle")}`;
            return `<button type="button" class="ie-palette-swatch${current}" ${attrs}
                style="--swatch:${color}" title="${title}" aria-label="${color}"></button>`;
        }).join("");
    }

    _onClick(e) {
        const well = e.target.closest("[data-well]");
        if (well) {
            this._selectWell(Number(well.dataset.well));
            return;
        }
        if (e.target.closest("[data-palette-add]")) {
            this._addCurrent();
            return;
        }
        const swatch = e.target.closest("[data-kind]");
        if (!swatch) return;
        const { kind, index } = swatch.dataset;
        const color = this[kind][index];
        if (color) this._applyColor(color);
        else this._setSlot(kind, index, this.currentColor);
    }

    _onContextMenu(e) {
        const swatch = e.target.closest("[data-kind]");
        if (!swatch) return;
        e.preventDefault();
        this._openMenu(swatch, e.clientX, e.clientY);
    }

    _selectWell(index) {
        this._activeWell = index;
        this._applyColor(this.currentColor);
    }

    _applyColor(color) {
        this._wells[this._activeWell] = color;
        this._onColorChange(color);
        this._refresh();
    }

    _addCurrent() {
        const color = this.currentColor;
        if (this.custom.includes(color)) {
            this._toast(t("imageEditPaletteExists"), "info");
            return;
        }
        const index = this.custom.indexOf(null);
        if (index < 0) {
            this._toast(t("imageEditPaletteFull"), "error");
            return;
        }
        this._setSlot("custom", index, color);
    }

    _setSlot(kind, index, color) {
        this[kind][index] = color;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ base: this.base, custom: this.custom }));
        } catch { /* 保存できなくてもこのセッション中は使える */ }
        this._refresh();
    }

    _openMenu(swatch, x, y) {
        this.closeMenu();
        const { kind, index } = swatch.dataset;
        const color = this[kind][index];
        const items = [
            ["imageEditPaletteRegisterCurrent", () => this._setSlot(kind, index, this.currentColor)],
            [color ? "imageEditPaletteEditColor" : "imageEditPalettePickColor", () => this._openPicker(kind, index, x, y)],
        ];
        if (kind === "custom" && color) {
            items.push(["imageEditPaletteDelete", () => this._setSlot(kind, index, null)]);
        }
        if (kind === "base" && color !== DEFAULT_BASE[index]) {
            items.push(["imageEditPaletteResetBase", () => this._setSlot(kind, index, DEFAULT_BASE[index])]);
        }

        const menu = document.createElement("div");
        menu.className = "ie-palette-menu";
        for (const [key, action] of items) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = t(key);
            button.addEventListener("click", () => { this.closeMenu(); action(); });
            menu.appendChild(button);
        }
        this._content.closest("#wfm-tab-image-edit").appendChild(menu);
        menu.style.left = `${Math.min(x, window.innerWidth - menu.offsetWidth - 4)}px`;
        menu.style.top  = `${Math.min(y, window.innerHeight - menu.offsetHeight - 4)}px`;
        this._menu = menu;
        document.addEventListener("pointerdown", this._closeMenuOnOutside, true);
        document.addEventListener("keydown", this._closeMenuOnEscape, true);
    }

    _openPicker(kind, index, x, y) {
        this._pickerTarget = { kind, index };
        this._picker.value = this[kind][index] ?? this.currentColor;
        this._picker.style.left = `${x}px`;
        this._picker.style.top  = `${y}px`;
        this._picker.click();
    }

    _onPickerInput() {
        const { kind, index } = this._pickerTarget;
        this._setSlot(kind, index, this._picker.value);
        this._applyColor(this._picker.value);
    }
}

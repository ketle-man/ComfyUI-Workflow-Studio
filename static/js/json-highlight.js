/**
 * JSON Syntax Highlight utility
 * Color-codes JSON keys/values by semantic category (same palette as eagle_comic_creater_web).
 */

/**
 * Apply syntax highlight to a JSON string, returning HTML with <span> color classes.
 * @param {string|object} json - JSON string or object
 * @returns {string} HTML string with highlight spans
 */
export function highlightJSON(json) {
    if (typeof json !== "string") {
        json = JSON.stringify(json, null, 2);
    }
    // HTML escape
    json = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    let currentCategory = "";

    // Tokenize and wrap with spans
    return json.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        (match) => {
            let type = "";
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    type = "key";
                    const keyName = match.replace(/^"|"|\s*:$/g, "");
                    if (/_name$|^name$|^clip_name\d*$|^scheduler$/.test(keyName)) currentCategory = "yellow";
                    else if (/^title$/.test(keyName)) currentCategory = "pink";
                    else if (/^(width|height)$/.test(keyName)) currentCategory = "green";
                    else if (/^(text|prompt)$/.test(keyName)) currentCategory = "cyan";
                    else if (/^(image|file)$/.test(keyName)) currentCategory = "red";
                    else currentCategory = "";
                } else {
                    type = "val";
                }
            } else {
                type = "val";
            }

            if (currentCategory) {
                const cls = type === "key" ? `json-key-${currentCategory}` : `json-val-${currentCategory}`;
                return `<span class="${cls}">${match}</span>`;
            }
            return match;
        }
    );
}

/**
 * Sync a highlight <pre> element with the given text.
 * @param {HTMLElement} highlightEl - The <pre> element for highlighted display
 * @param {string} text - Raw JSON text
 */
export function syncJsonHighlight(highlightEl, text) {
    if (highlightEl) {
        highlightEl.innerHTML = highlightJSON(text) + "\n";
    }
}

/**
 * Sync scroll position between textarea and highlight overlay.
 * @param {HTMLTextAreaElement} editor - The textarea element
 * @param {HTMLElement} highlight - The highlight <pre> element
 */
export function syncScroll(editor, highlight) {
    if (highlight) {
        highlight.scrollTop = editor.scrollTop;
        highlight.scrollLeft = editor.scrollLeft;
    }
}

/**
 * chat-markdown.js — tiny, dependency-free Markdown renderer for AI TOOL Chat replies.
 *
 * Safety model: the whole input is HTML-escaped FIRST, then a small set of Markdown constructs is
 * turned into tags. No raw HTML from the model ever reaches the DOM, links are not rendered as
 * anchors (the model's URLs stay plain text), and images are never loaded. This keeps the
 * existing guarantees of the chat (it showed replies with textContent before) while making long
 * structured answers (lists, headings, code blocks) readable.
 *
 * Supported: fenced code blocks (```lang), inline `code`, **bold**, *italic*, # headings (h1-h4
 * rendered as h4-h6-ish sizes), - / * / 1. lists (one level), > quotes, --- rules, paragraphs and
 * line breaks. Anything else is left as escaped text.
 */

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Inline formatting on already-escaped text. Code spans are cut out first so their content is
// not touched by the bold/italic rules.
function renderInline(escaped) {
    const codes = [];
    let s = escaped.replace(/`([^`\n]+)`/g, (_, c) => {
        codes.push(c);
        return `\u0000${codes.length - 1}\u0000`;
    });
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
    return s;
}

/** Markdown text → safe HTML string. */
export function renderMarkdown(text) {
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let para = [];
    let list = null; // { tag: "ul"|"ol", items: [], start }

    const flushPara = () => {
        if (para.length) {
            out.push(`<p>${para.map((l) => renderInline(escapeHtml(l))).join("<br>")}</p>`);
            para = [];
        }
    };
    const flushList = () => {
        if (list) {
            const start = list.tag === "ol" && list.start > 1 ? ` start="${list.start}"` : "";
            out.push(`<${list.tag}${start}>${list.items.map((i) => `<li>${renderInline(escapeHtml(i))}</li>`).join("")}</${list.tag}>`);
            list = null;
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
        if (fence) {
            flushPara(); flushList();
            const lang = fence[1] || "";
            const body = [];
            i++;
            while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { body.push(lines[i]); i++; }
            const label = lang ? `<span class="wfm-md-code-lang">${escapeHtml(lang)}</span>` : "";
            out.push(`<pre class="wfm-md-pre">${label}<code>${escapeHtml(body.join("\n"))}</code></pre>`);
            continue;
        }

        if (!line.trim()) { flushPara(); flushList(); continue; }

        const heading = line.match(/^\s*(#{1,4})\s+(.+)$/);
        if (heading) {
            flushPara(); flushList();
            const level = Math.min(6, heading[1].length + 2); // # -> h3 ... #### -> h6
            out.push(`<h${level} class="wfm-md-h">${renderInline(escapeHtml(heading[2]))}</h${level}>`);
            continue;
        }

        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushPara(); flushList(); out.push("<hr>"); continue; }

        if (line.trim().startsWith(">")) {
            flushPara(); flushList();
            out.push(`<blockquote>${renderInline(escapeHtml(line.trim().replace(/^>\s?/, "")))}</blockquote>`);
            continue;
        }

        const ul = line.match(/^\s*[-*+]\s+(.+)$/);
        const ol = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
        if (ul || ol) {
            flushPara();
            const tag = ul ? "ul" : "ol";
            if (list && list.tag !== tag) flushList();
            // A numbered list interrupted by bullets keeps counting from the source number
            if (!list) list = { tag, items: [], start: ol ? Math.min(Number(ol[1]) || 1, 9999) : 1 };
            list.items.push(ul ? ul[1] : ol[2]);
            continue;
        }

        flushList();
        para.push(line);
    }
    flushPara(); flushList();
    return out.join("");
}

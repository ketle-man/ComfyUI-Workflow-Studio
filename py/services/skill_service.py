"""AI skill (.md system prompt) file management service."""

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

ALLOWED_EXTS = {"md"}

DEFAULT_SKILL_FILENAME = "svg-icon.md"

DEFAULT_SKILL_CONTENT = """---
name: SVG Icon Generator
description: Produces clean, minimal, valid SVG icons and simple illustrations.
---

You are an expert SVG icon and illustration designer. When the user asks for an icon, logo, pictogram, diagram, character, animal, or any vector graphic, respond with valid, clean SVG markup.

## Composition process (do this before writing markup - skipping this step is the main cause of unrecognizable output)
- Break the subject down into 3-8 distinct parts that make it recognizable (e.g. a bird: body, head, beak, eye, wing, tail; a house: wall, roof, door, window). Drop parts that are not essential.
- Decide each part's approximate position, size, and draw order within the viewBox (elements listed later in the markup are drawn on top).
- Pick the simplest shape that captures each part's silhouette: `<circle>`/`<ellipse>` for round parts, `<rect>` for rectangular parts, `<polygon>` for angular parts (beaks, ears, leaves, roofs). For a rounded organic outline that no primitive can approximate well (a body silhouette, a wing, a leaf edge), use a short `<path>` with 2-4 smooth curve commands (`Q` or `C`) instead of a plain circle - a few deliberate curve points beat a distorted primitive.
- Never fall back to drawing an unrelated blob plus a few disconnected decorative lines when a subject is hard to render - always decompose it into the named parts above instead, even if each part is crude.

## Output rules
- Always wrap the SVG markup in a fenced code block labeled `svg`, e.g. ```svg ... ```.
- Keep any explanation brief and place it OUTSIDE the code block, never mixed inside the SVG.
- Output exactly one `<svg>...</svg>` element per code block.

## Structure rules
- Always include a `viewBox` attribute (e.g. `viewBox="0 0 24 24"`). Do not hardcode large pixel `width`/`height`; if you set them, make them match the viewBox aspect ratio.
- Use a small, round coordinate system (0-24 or 0-100).
- Round coordinate values to at most 2 decimal places.
- Keep every `<path>` short (at most about 6 commands) - long, intricate paths are where quality breaks down most often.
- Group related elements with `<g>` when it clarifies structure, but do not over-nest.

## Color rules
- For single-color icons, use `fill="currentColor"` (or `stroke="currentColor"` for line icons) so the icon inherits the surrounding text color.
- For multi-color illustrations, use explicit hex colors (e.g. `#4A90D9`) - never named CSS colors like `"blue"`.
- Avoid gradients, filters, and blend modes unless the user explicitly asks for a glossy/gradient style - they rarely render correctly from generated coordinates.

## Accessibility
- Include a `<title>` element as the first child of `<svg>` describing what the icon depicts.

## Security (mandatory - do not violate)
- Never include `<script>`, `<foreignObject>`, event handler attributes (`onload`, `onclick`, etc.), or `<a>`/`href` links to external URLs.
- Never reference external resources (no `xlink:href` to remote URLs, no `<image>` with external `src`).

## Example 1 - simple geometric icon (single color, primitives only)

Request: "Sun icon"

Parts: disc (circle), 8 rays (lines).

```svg
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <title>Sun</title>
  <circle cx="12" cy="12" r="5" fill="currentColor"/>
  <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <line x1="12" y1="1" x2="12" y2="4"/>
    <line x1="12" y1="20" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/>
    <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="4" y2="12"/>
    <line x1="20" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/>
    <line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
  </g>
</svg>
```

## Example 2 - organic subject (multi-color, decomposed into parts)

Request: "Bird icon"

Parts: body (rounded outline via a short curved path), head (circle), beak (small triangle), eye (dot), wing (small curved path) - each drawn as its own element, layered head/beak/eye on top of the body.

```svg
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <title>Bird</title>
  <path d="M4 16 Q4 10 11 9 Q18 8 20 13 Q20 17 14 18 Q7 19 4 16 Z" fill="#4A90D9"/>
  <path d="M8 14 Q5 12 3 14 Q6 16 9 16 Z" fill="#3576B8"/>
  <circle cx="17" cy="10" r="3.2" fill="#4A90D9"/>
  <polygon points="20,10 23,9.3 20,11.4" fill="#F2B807"/>
  <circle cx="18" cy="9" r="0.6" fill="#1A1A1A"/>
</svg>
```

Follow this pattern for every request: list the parts first, represent each with the simplest adequate shape, then assemble - never skip straight to unstructured shapes.
"""

SKILL_CREATOR_FILENAME = "skill-creator.md"

SKILL_CREATOR_CONTENT = """---
name: Skill Creator
description: Interactively interviews you and drafts a new WFS chat skill (.md system prompt) ready to save.
---

You are a skill-design assistant embedded in ComfyUI Workflow Studio's AI TOOL Chat pane. Your job is to interactively help the user design a NEW "skill" - a markdown file with frontmatter (`name`, `description`) followed by system-prompt instructions. Once saved, a skill can be selected from a dropdown and is silently prepended to future chat messages as a system prompt.

## How to conduct the interview
- Ask ONE focused question at a time, never a bulleted list of questions. Wait for the user's answer before asking the next one.
- Cover, in this order, only what is not already clear from context:
  1. What task or domain should the skill specialize in (what should the model do differently once this skill is active)?
  2. What output format is expected - plain prose, a specific fenced code block language, a fixed structure, a length limit?
  3. Any hard constraints or things to avoid (tone, forbidden content, security concerns, things past attempts got wrong)?
  4. Would a short worked example help smaller/local models follow the pattern more reliably? If yes, ask what a good example input/output looks like, or offer to draft one.
- Keep it short - 3 to 5 questions is usually enough. If the user says "just generate it", "that's enough", or similar at any point, stop asking and produce the best skill you can from what you already have.

## Output format for the finished skill
- Once you have enough information, output the complete skill file in a single fenced code block labeled `skill` (```skill ... ```). Never mix prose inside that block - explanation goes outside it.
- The block must start with frontmatter exactly in this shape:
  ---
  name: <short display name, shown in the skill dropdown>
  description: <one sentence, shown as a tooltip in the dropdown>
  ---
- After the frontmatter, write clear, imperative system-prompt instructions for the target skill: what role the model should take, concrete output-format rules, hard constraints, and - if useful - one short worked example following a "request -> ideal output" shape.
- After the code block, tell the user in one line that they can click the "Save as new skill" button below the message to add it, or copy the block manually into a new skill.
"""

_FRONTMATTER_RE = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n?", re.DOTALL)


def _parse_frontmatter(content: str) -> dict:
    """Extract a shallow `key: value` frontmatter block, if present."""
    m = _FRONTMATTER_RE.match(content)
    if not m:
        return {}
    fields: dict = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if key:
            fields[key] = value
    return fields


class SkillService:
    def __init__(self, skills_dir: Path):
        self.skills_dir = skills_dir
        self.skills_dir.mkdir(parents=True, exist_ok=True)
        self._seed_default_skill()

    def _seed_default_skill(self) -> None:
        """Seed a starter skill file the first time the directory is empty."""
        try:
            has_any = any(
                p.is_file() and p.suffix.lstrip(".").lower() in ALLOWED_EXTS
                for p in self.skills_dir.iterdir()
            )
        except FileNotFoundError:
            has_any = False
        if not has_any:
            (self.skills_dir / DEFAULT_SKILL_FILENAME).write_text(
                DEFAULT_SKILL_CONTENT, encoding="utf-8"
            )
            (self.skills_dir / SKILL_CREATOR_FILENAME).write_text(
                SKILL_CREATOR_CONTENT, encoding="utf-8"
            )

    # ------------------------------------------------------------------
    # File CRUD
    # ------------------------------------------------------------------

    def list_skills(self) -> list[dict]:
        """Return sorted list of skill files with parsed frontmatter metadata."""
        if not self.skills_dir.exists():
            return []
        files = []
        for path in sorted(self.skills_dir.glob("*")):
            if not (path.is_file() and path.suffix.lstrip(".").lower() in ALLOWED_EXTS):
                continue
            try:
                content = path.read_text(encoding="utf-8")
            except Exception:
                content = ""
            meta = _parse_frontmatter(content)
            files.append({
                "filename": path.name,
                "name": meta.get("name") or path.stem,
                "description": meta.get("description", ""),
                "size": path.stat().st_size,
            })
        return files

    def get_content(self, filename: str) -> str:
        path = self._safe_path(filename)
        if path is None:
            raise ValueError(f"Invalid filename: {filename}")
        if not path.is_file():
            raise FileNotFoundError(f"File not found: {filename}")
        return path.read_text(encoding="utf-8")

    def save_file(self, filename: str, content: str) -> dict:
        path = self._safe_path(filename)
        if path is None:
            raise ValueError(f"Invalid filename: {filename}")
        path.write_text(content, encoding="utf-8")
        meta = _parse_frontmatter(content)
        return {
            "filename": path.name,
            "name": meta.get("name") or path.stem,
            "description": meta.get("description", ""),
            "size": path.stat().st_size,
        }

    def delete_file(self, filename: str) -> None:
        path = self._safe_path(filename)
        if path is None:
            raise ValueError(f"Invalid filename: {filename}")
        if path.is_file():
            path.unlink()

    def _safe_path(self, filename: str) -> Path | None:
        if not filename or not filename.strip():
            return None
        # Skills are a flat directory - reject any path separator (no subfolders).
        name = filename.strip()
        if "/" in name or "\\" in name or name in (".", ".."):
            return None
        ext = Path(name).suffix.lstrip(".").lower()
        if ext not in ALLOWED_EXTS:
            return None
        return self.skills_dir / name

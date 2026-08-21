"""PostToolUse hook: regenerate README.index.md / DEVLOG.index.md right after
Claude Code edits README.md or DEVLOG.md, so graphify's excluded-doc index
stand-ins (see .graphifyignore) never drift from the source files within a
session. A git pre-commit hook covers edits made outside Claude Code.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

TARGETS = {"readme.md": "readme", "devlog.md": "devlog"}


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return

    if payload.get("tool_name") not in ("Edit", "Write"):
        return

    file_path = payload.get("tool_input", {}).get("file_path", "")
    if not file_path:
        return

    name = Path(file_path).name.lower()
    target = TARGETS.get(name)
    if target is None:
        return

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or str(Path(file_path).resolve().parent)
    script = Path(project_dir) / "tools" / "generate_doc_index.py"
    if not script.exists():
        return

    result = subprocess.run(
        [sys.executable, str(script), target],
        cwd=project_dir,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode == 0:
        print(json.dumps({"systemMessage": f"[doc-index] {result.stdout.strip()}"}))
    else:
        print(
            json.dumps(
                {"systemMessage": f"[doc-index] generate_doc_index.py {target} failed: {result.stderr.strip()}"}
            ),
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()

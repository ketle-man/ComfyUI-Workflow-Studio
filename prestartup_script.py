"""Runs before ComfyUI imports any custom node — the only place early enough
to populate os.environ for code that reads env vars at import/request time.

Loads a .env file (if present) from this plugin's root directory so the
Unsloth backend's API key (UNSLOTH_API_KEY) can be set without editing
settings.json or exposing it to the frontend.
"""

from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parent
ENV_FILE = PLUGIN_DIR / ".env"

if ENV_FILE.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(ENV_FILE)
    except ImportError:
        print(
            "[WARNING] Workflow Studio: .env file found but python-dotenv is not installed "
            "(pip install -r requirements.txt). UNSLOTH_API_KEY will not be loaded from .env."
        )
    except Exception as e:
        print(f"[WARNING] Workflow Studio: failed to load .env file: {e}")

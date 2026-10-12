"""Runs before ComfyUI imports any custom node — the only place early enough
to populate os.environ for code that reads env vars at import/request time.

Loads a .env file (if present) from this plugin's root directory so the
Unsloth backend's API key (UNSLOTH_API_KEY) can be set without editing
settings.json or exposing it to the frontend.
"""

from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parent
ENV_FILE = PLUGIN_DIR / ".env"


def _maybe_use_selector_event_loop():
    """Windows: ProactorEventLoop(IOCP) を SelectorEventLoop に切り替える（既定はオフ）。

    環境によっては、ソケットclose(closesocket/NtClose)でイベントループがOSカーネル内で停止し、
    ComfyUI全体が無応答になる（再起動するまでポートも解放されない）。Selector方式はIOCPを使わず、
    この停止を避けられる可能性がある。副作用: asyncioのサブプロセス機能が使えない、
    同時接続数の上限（約512）がある。

    有効化: 環境変数 WFS_SELECTOR_LOOP=1、または
    user/default/Workflow-Studio/settings.json に "windows_selector_event_loop": true
    ComfyUIがイベントループを作成する前に呼ぶ必要があるため、ここ(prestartup)で設定する。
    """
    import os
    import sys

    if sys.platform != "win32":
        return
    enabled = os.environ.get("WFS_SELECTOR_LOOP", "").strip().lower() in ("1", "true", "yes")
    if not enabled:
        try:
            import json
            candidates = [
                PLUGIN_DIR.parent.parent / "user" / "default" / "Workflow-Studio" / "settings.json",
                PLUGIN_DIR / "data" / "settings.json",  # config.py fallback when user/default is absent
            ]
            for settings in candidates:
                if settings.is_file():
                    with open(settings, "r", encoding="utf-8") as f:
                        enabled = bool(json.load(f).get("windows_selector_event_loop", False))
                    break
        except Exception:
            enabled = False
    if not enabled:
        return
    try:
        import asyncio
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        print("[Workflow Studio] Using WindowsSelectorEventLoopPolicy (windows_selector_event_loop enabled)")
    except Exception as e:
        print(f"[WARNING] Workflow Studio: failed to switch to selector event loop: {e}")


_maybe_use_selector_event_loop()

if ENV_FILE.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(ENV_FILE)
    except ImportError:
        print(
            "[WARNING] Workflow Studio: .env file found but python-dotenv is not installed "
            "(pip install -r requirements.txt). UNSLOTH_API_KEY / GEMINI_API_KEY will not be loaded from .env."
        )
    except Exception as e:
        print(f"[WARNING] Workflow Studio: failed to load .env file: {e}")

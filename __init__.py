from .py.wfm import WorkflowStudio

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web/comfyui"

# Register routes on import
WorkflowStudio.add_routes()

# Register custom nodes (isolated loading)
_NODE_MODULES = {
    "WFS_PromptText": (".py.nodes.prompt_text", "WFS_PromptText"),
}

for _name, (_mod_path, _cls_name) in _NODE_MODULES.items():
    try:
        import importlib
        _mod = importlib.import_module(_mod_path, package=__name__)
        NODE_CLASS_MAPPINGS[_name] = getattr(_mod, _cls_name)
        NODE_DISPLAY_NAME_MAPPINGS[_name] = "Prompt Text (WFS)"
    except Exception as _e:
        print(f"[WARNING] Workflow Studio: Failed to load '{_name}': {_e}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

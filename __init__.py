from .py.wfm import WorkflowStudio

NODE_CLASS_MAPPINGS = {}
WEB_DIRECTORY = "./web/comfyui"

# Register routes on import
WorkflowStudio.add_routes()

__all__ = ["NODE_CLASS_MAPPINGS", "WEB_DIRECTORY"]

import logging
import mimetypes
import jinja2
from aiohttp import web
from pathlib import Path

from .config import TEMPLATES_DIR, STATIC_DIR, DATA_DIR, WORKFLOWS_DIR

logger = logging.getLogger(__name__)

# Jinja2 template environment
template_env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=True,
    auto_reload=True,
)


async def serve_index_page(request: web.Request) -> web.Response:
    """Serve the main SPA page."""
    template = template_env.get_template("index.html")
    rendered = template.render()
    return web.Response(text=rendered, content_type="text/html")


async def serve_workflow_file(request: web.Request) -> web.Response:
    """Serve files from the current workflows directory (dynamic path)."""
    from .routes.workflow_routes import _service

    filename = request.match_info.get("filename", "")
    if not filename or ".." in filename or "/" in filename or "\\" in filename:
        return web.Response(status=404)

    file_path = _service.workflows_dir / filename
    if not file_path.is_file():
        return web.Response(status=404)

    content_type, _ = mimetypes.guess_type(str(file_path))
    return web.FileResponse(file_path, headers={
        "Content-Type": content_type or "application/octet-stream",
    })


class WorkflowStudio:
    """Main entry point for Workflow Studio plugin."""

    @classmethod
    def add_routes(cls):
        """Register all routes with ComfyUI's server."""
        from server import PromptServer  # type: ignore

        app = PromptServer.instance.app

        # Static routes
        app.router.add_static("/wfm_static", str(STATIC_DIR))

        # Dynamic workflow file serving (thumbnails etc.)
        app.router.add_get("/wfm_data/workflows/{filename}", serve_workflow_file)

        # Main page
        app.router.add_get("/wfm", serve_index_page)

        # API routes
        from .routes import workflow_routes, settings_routes, ollama_routes, eagle_routes, nodes_routes, prompts_routes, models_routes, gallery_routes

        workflow_routes.setup_routes(app)
        settings_routes.setup_routes(app)
        ollama_routes.setup_routes(app)
        eagle_routes.setup_routes(app)
        nodes_routes.setup_routes(app)
        prompts_routes.setup_routes(app)
        models_routes.setup_routes(app)
        gallery_routes.setup_routes(app)

        logger.info("Workflow Studio: Routes registered successfully")

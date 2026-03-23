"""Node metadata and node sets API routes."""

import asyncio
import logging

from aiohttp import web

from ..services.nodes_service import NodesService

logger = logging.getLogger(__name__)

_service = NodesService()


def setup_routes(app: web.Application):
    """Register all node management API routes."""
    # Node metadata
    app.router.add_get("/api/wfm/nodes/metadata", handle_get_metadata)
    app.router.add_post("/api/wfm/nodes/metadata", handle_save_metadata)
    # Node groups
    app.router.add_get("/api/wfm/nodes/groups", handle_get_groups)
    app.router.add_post("/api/wfm/nodes/groups", handle_save_groups)
    # Node sets
    app.router.add_get("/api/wfm/node-sets", handle_list_sets)
    app.router.add_post("/api/wfm/node-sets", handle_create_set)
    app.router.add_post("/api/wfm/node-sets/update", handle_update_set)
    app.router.add_post("/api/wfm/node-sets/delete", handle_delete_set)
    app.router.add_get("/api/wfm/node-sets/export", handle_export_set)


# ── Node Metadata ──────────────────────────────────────────


async def handle_get_metadata(request: web.Request) -> web.Response:
    """GET /api/wfm/nodes/metadata"""
    try:
        result = await asyncio.to_thread(_service.get_all_metadata)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error loading node metadata: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_save_metadata(request: web.Request) -> web.Response:
    """POST /api/wfm/nodes/metadata"""
    try:
        body = await request.json()
        node_name = body.get("nodeName", "")
        if not node_name:
            return web.json_response({"error": "nodeName is required"}, status=400)
        updates = {k: v for k, v in body.items() if k != "nodeName"}
        result = await asyncio.to_thread(_service.update_node_metadata, node_name, updates)
        return web.json_response({"status": "ok", "metadata": result})
    except Exception as e:
        logger.error("Error saving node metadata: %s", e)
        return web.json_response({"error": str(e)}, status=500)


# ── Node Groups ────────────────────────────────────────────


async def handle_get_groups(request: web.Request) -> web.Response:
    """GET /api/wfm/nodes/groups"""
    try:
        result = await asyncio.to_thread(_service.get_node_groups)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error loading node groups: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_save_groups(request: web.Request) -> web.Response:
    """POST /api/wfm/nodes/groups"""
    try:
        body = await request.json()
        result = await asyncio.to_thread(_service.save_node_groups, body)
        return web.json_response({"status": "ok", "groups": result})
    except Exception as e:
        logger.error("Error saving node groups: %s", e)
        return web.json_response({"error": str(e)}, status=500)


# ── Node Sets ──────────────────────────────────────────────


async def handle_list_sets(request: web.Request) -> web.Response:
    """GET /api/wfm/node-sets"""
    try:
        result = await asyncio.to_thread(_service.list_node_sets)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error listing node sets: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_create_set(request: web.Request) -> web.Response:
    """POST /api/wfm/node-sets"""
    try:
        body = await request.json()
        result = await asyncio.to_thread(_service.create_node_set, body)
        return web.json_response({"status": "ok", "nodeSet": result})
    except Exception as e:
        logger.error("Error creating node set: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_update_set(request: web.Request) -> web.Response:
    """POST /api/wfm/node-sets/update"""
    try:
        body = await request.json()
        set_id = body.get("id", "")
        if not set_id:
            return web.json_response({"error": "id is required"}, status=400)
        updates = {k: v for k, v in body.items() if k != "id"}
        result = await asyncio.to_thread(_service.update_node_set, set_id, updates)
        if result is None:
            return web.json_response({"error": "node set not found"}, status=404)
        return web.json_response({"status": "ok", "nodeSet": result})
    except Exception as e:
        logger.error("Error updating node set: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_delete_set(request: web.Request) -> web.Response:
    """POST /api/wfm/node-sets/delete"""
    try:
        body = await request.json()
        set_id = body.get("id", "")
        if not set_id:
            return web.json_response({"error": "id is required"}, status=400)
        await asyncio.to_thread(_service.delete_node_set, set_id)
        return web.json_response({"status": "ok"})
    except Exception as e:
        logger.error("Error deleting node set: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_export_set(request: web.Request) -> web.Response:
    """GET /api/wfm/node-sets/export?id=xxx"""
    try:
        set_id = request.query.get("id", "")
        if not set_id:
            return web.json_response({"error": "id is required"}, status=400)
        result = await asyncio.to_thread(_service.export_node_set_json, set_id)
        if result is None:
            return web.json_response({"error": "node set not found"}, status=404)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error exporting node set: %s", e)
        return web.json_response({"error": str(e)}, status=500)

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
    app.router.add_get("/api/wfm/nodes/light", handle_get_light_nodes)
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


# ── Light node list ────────────────────────────────────────


def _build_light_node_list() -> list[dict]:
    """全ノードの軽量情報（INPUT_TYPES を呼ばない）。

    /object_info は各ノードの INPUT_TYPES() を呼ぶため、モデル一覧を走査するノードが
    多い環境では十数秒かかる。Nodesタブの一覧表示に必要なのはクラス属性だけなので、
    それらのみを読んで高速に返す（入力定義は呼び出し側が /object_info で後から補う）。
    """
    import nodes as comfy_nodes

    result = []
    for name, cls in list(comfy_nodes.NODE_CLASS_MAPPINGS.items()):
        try:
            return_types = getattr(cls, "RETURN_TYPES", ()) or ()
            result.append({
                "name": name,
                "display_name": comfy_nodes.NODE_DISPLAY_NAME_MAPPINGS.get(name, name),
                "description": getattr(cls, "DESCRIPTION", "") or "",
                "category": getattr(cls, "CATEGORY", "sd") or "sd",
                "python_module": getattr(cls, "RELATIVE_PYTHON_MODULE", "nodes") or "nodes",
                "output": list(return_types),
                "output_name": list(getattr(cls, "RETURN_NAMES", None) or return_types),
                "output_node": getattr(cls, "OUTPUT_NODE", False) is True,
                "search_aliases": list(getattr(cls, "SEARCH_ALIASES", []) or []),
                "deprecated": bool(getattr(cls, "DEPRECATED", False)),
                "experimental": bool(getattr(cls, "EXPERIMENTAL", False)),
            })
        except Exception as e:
            logger.debug("light node info failed for %s: %s", name, e)
    return result


async def handle_get_light_nodes(request: web.Request) -> web.Response:
    """GET /api/wfm/nodes/light"""
    try:
        result = await asyncio.to_thread(_build_light_node_list)
        return web.json_response(result)
    except Exception as e:
        logger.error("Error building light node list: %s", e)
        return web.json_response({"error": str(e)}, status=500)


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

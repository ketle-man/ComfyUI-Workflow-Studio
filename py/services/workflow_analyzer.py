"""Workflow analyzer - detects model types and counts input/output nodes."""

import os
import re


def _model_name_from_ui_node(node):
    """Extract model filename from UI format node (lowercase)."""
    widgets = node.get("widgets_values", [])
    val = widgets[0] if widgets else ""
    return val.lower() if isinstance(val, str) else ""


def _model_name_from_api_node(node):
    """Extract model filename from API format node (lowercase)."""
    inputs = node.get("inputs", {})
    for key in ("ckpt_name", "unet_name", "model_name"):
        val = inputs.get(key, "")
        if isinstance(val, str) and val:
            return val.lower()
    return ""


def analyze_workflow(workflow_data, filename=""):
    """Analyze workflow JSON and return model types, input/output node counts."""
    model_types = set()
    inputs = {"prompts": 0, "images": 0, "videos": 0}
    outputs = {"images": 0, "videos": 0}

    fn = filename.lower()
    if "sd1.5" in fn or "sd15" in fn:
        model_types.add("SD1.5")
    if "sdxl" in fn:
        model_types.add("SDXL")
    if "qwen" in fn:
        model_types.add("Qwen")
    if "zimage" in fn or "z-image" in fn or "zit" in fn:
        model_types.add("Z-IMAGE")
    if "flux2" in fn:
        model_types.add("Flux2")
    elif "flux" in fn:
        model_types.add("Flux")
    if "sd3" in fn:
        model_types.add("SD3")

    # Support both UI format (nodes array) and API format (node ID object)
    raw_nodes = workflow_data.get("nodes", None)
    if raw_nodes is not None:
        node_iter = [
            (
                node.get("type", ""),
                node.get("title", "").lower(),
                _model_name_from_ui_node(node),
            )
            for node in raw_nodes
        ]
    else:
        node_iter = []
        for node in workflow_data.values():
            if not isinstance(node, dict):
                continue
            ntype = node.get("class_type", "")
            title = node.get("_meta", {}).get("title", "").lower()
            mn = _model_name_from_api_node(node)
            node_iter.append((ntype, title, mn))

    for ntype, title, mn in node_iter:
        if (
            "CheckpointLoader" in ntype
            or "UNETLoader" in ntype
            or "unet_name" in ntype
        ):
            mn_base = os.path.basename(mn.replace("\\", "/"))
            if re.search(r"sd1[._-]?5|v1[._-]5", mn_base):
                model_types.add("SD1.5")
            elif re.search(r"sdxl|[._-]xl[._-]|[._-]xl$|xl[._-]", mn_base):
                model_types.add("SDXL")
            elif "flux2" in mn_base:
                model_types.add("Flux2")
            elif "flux" in mn_base:
                model_types.add("Flux")
            elif re.search(r"sd[._-]?3", mn_base):
                model_types.add("SD3")
            elif "qwen" in mn_base:
                model_types.add("Qwen")
            elif "zimage" in mn_base or "z-image" in mn_base or "zit" in mn_base:
                model_types.add("Z-IMAGE")

        if "sdxl" in title:
            model_types.add("SDXL")
        if "flux2" in title:
            model_types.add("Flux2")
        elif "flux" in title:
            model_types.add("Flux")
        if "sd1.5" in title or "sd15" in title:
            model_types.add("SD1.5")
        if "qwen" in title:
            model_types.add("Qwen")
        if "zimage" in title or "z-image" in title or "zit" in title:
            model_types.add("Z-IMAGE")

        if ntype == "CLIPTextEncode" or "prompt" in title:
            inputs["prompts"] += 1
        if ntype in ("LoadImage", "LoadImageMask"):
            inputs["images"] += 1
        if ntype == "LoadVideo" or "load video" in title:
            inputs["videos"] += 1
        if ntype == "SaveImage":
            outputs["images"] += 1
        if ntype in ("SaveVideo", "VH_VideoCombine"):
            outputs["videos"] += 1

    return {
        "modelTypes": sorted(model_types),
        "inputs": inputs,
        "outputs": outputs,
    }

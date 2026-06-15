"""Workflow analyzer - detects model types and counts input/output nodes."""

import os
import re

# CLIPLoader / DualCLIPLoader の type フィールド → モデル種別マッピング
_CLIP_TYPE_TO_MODEL = {
    "flux": "Flux",
    "flux2": "Flux2",
    "newbie": "NewBie",
    "ovis": "Ovis",
    "qwen_image": "Qwen",
    "sd3": "SD3",
    "sd3.5": "SD3",
    "hidream_i": "HiDream",
    "hidream_e": "HiDream",
    "hidream": "HiDream",
    "wan": "Wan",
    "cosmos": "Cosmos",
    "lumina": "Lumina",
    "lumina2": "Z-IMAGE",
}


def _model_name_from_ui_node(node):
    """Extract model filename from UI format node (lowercase)."""
    widgets = node.get("widgets_values", [])
    val = widgets[0] if widgets else ""
    return val.lower() if isinstance(val, str) else ""


def _clip_type_from_ui_node(node):
    """Extract CLIPLoader type string from widgets_values (lowercase)."""
    ntype = node.get("type", "")
    vals = node.get("widgets_values", [])
    if ntype == "CLIPLoader" and len(vals) > 1:
        return str(vals[1]).lower() if isinstance(vals[1], str) else ""
    if ntype in ("DualCLIPLoader", "TripleCLIPLoader") and len(vals) > 2:
        return str(vals[2]).lower() if isinstance(vals[2], str) else ""
    return ""


def _model_name_from_api_node(node):
    """Extract model filename from API format node (lowercase)."""
    inputs = node.get("inputs", {})
    for key in ("ckpt_name", "unet_name", "model_name", "clip_name1", "clip_name"):
        val = inputs.get(key, "")
        if isinstance(val, str) and val:
            return val.lower()
    return ""


def _collect_all_ui_nodes(workflow_data):
    """Yield all UI-format nodes including those inside definitions.subgraphs."""
    for node in workflow_data.get("nodes", []):
        yield node
    defs = workflow_data.get("definitions", {})
    if isinstance(defs, dict):
        for sg in defs.get("subgraphs", []):
            if isinstance(sg, dict):
                for node in sg.get("nodes", []):
                    yield node


def _detect_model_type_from_name(mn_base, model_types):
    """Detect model type from a model filename (already lowercased basename)."""
    if re.search(r"sd1[._-]?5|v1[._-]5", mn_base):
        model_types.add("SD1.5")
    elif re.search(r"sdxl|[._-]xl[._-]|[._-]xl$|xl[._-]", mn_base):
        model_types.add("SDXL")
    elif re.search(r"flux[-_.]?2", mn_base):
        model_types.add("Flux2")
    elif "flux" in mn_base:
        model_types.add("Flux")
    elif re.search(r"sd[._-]?3", mn_base):
        model_types.add("SD3")
    elif "qwen" in mn_base:
        model_types.add("Qwen")
    elif "zimage" in mn_base or "z-image" in mn_base or "zit" in mn_base:
        model_types.add("Z-IMAGE")
    elif "newbie" in mn_base:
        model_types.add("NewBie")
    elif "ovis" in mn_base:
        model_types.add("Ovis")
    elif "hidream" in mn_base:
        model_types.add("HiDream")
    elif "wan" in mn_base and re.search(r"wan[-_.]?\d|wan[-_]video", mn_base):
        model_types.add("Wan")


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
    if re.search(r"flux[-_.]?2", fn):
        model_types.add("Flux2")
    elif "flux" in fn:
        model_types.add("Flux")
    if "sd3" in fn:
        model_types.add("SD3")
    if "newbie" in fn:
        model_types.add("NewBie")
    if "ovis" in fn:
        model_types.add("Ovis")
    if "hidream" in fn:
        model_types.add("HiDream")
    if "wan" in fn and re.search(r"wan[-_.]?\d|wan[-_]video", fn):
        model_types.add("Wan")

    # Support both UI format (nodes array) and API format (node ID object)
    raw_nodes = workflow_data.get("nodes", None)
    if raw_nodes is not None:
        # UI / app format: collect all nodes including subgraph definitions
        node_iter = [
            (
                node.get("type", ""),
                node.get("title", "").lower(),
                _model_name_from_ui_node(node),
                _clip_type_from_ui_node(node),
            )
            for node in _collect_all_ui_nodes(workflow_data)
        ]
    else:
        node_iter = []
        for node in workflow_data.values():
            if not isinstance(node, dict):
                continue
            ntype = node.get("class_type", "")
            title = node.get("_meta", {}).get("title", "").lower()
            mn = _model_name_from_api_node(node)
            node_iter.append((ntype, title, mn, ""))

    for ntype, title, mn, clip_type in node_iter:
        if (
            "CheckpointLoader" in ntype
            or "UNETLoader" in ntype
            or "UnetLoader" in ntype  # UnetLoaderGGUF 等を含む
            or "unet_name" in ntype
        ):
            mn_base = os.path.basename(mn.replace("\\", "/"))
            _detect_model_type_from_name(mn_base, model_types)

        # CLIPLoader 系: type フィールドまたはファイル名からモデル種別を検出
        # QuadrupleCLIPLoader 等、type フィールドを持たない新型ローダーにも対応
        if "CLIPLoader" in ntype:
            if clip_type:
                detected = _CLIP_TYPE_TO_MODEL.get(clip_type)
                if detected:
                    model_types.add(detected)
            mn_base = os.path.basename(mn.replace("\\", "/"))
            if mn_base:
                _detect_model_type_from_name(mn_base, model_types)

        if "sdxl" in title:
            model_types.add("SDXL")
        if re.search(r"flux[-_.]?2", title):
            model_types.add("Flux2")
        elif "flux" in title:
            model_types.add("Flux")
        if "sd1.5" in title or "sd15" in title:
            model_types.add("SD1.5")
        if "qwen" in title:
            model_types.add("Qwen")
        if "zimage" in title or "z-image" in title or "zit" in title:
            model_types.add("Z-IMAGE")
        if "newbie" in title:
            model_types.add("NewBie")
        if "ovis" in title:
            model_types.add("Ovis")
        if "hidream" in title:
            model_types.add("HiDream")

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

    # Detect workflow format
    if raw_nodes is not None:
        # App format: UI-based structure with definitions (subgraphs) or linearMode
        extra = workflow_data.get("extra", {})
        if (
            "definitions" in workflow_data
            or extra.get("linearMode") is True
        ):
            wf_format = "app"
        elif filename and filename.lower().endswith(".app.json"):
            wf_format = "app"
        else:
            wf_format = "ui"
    else:
        # Check if all top-level values have class_type (API format)
        has_class = any(
            isinstance(v, dict) and "class_type" in v
            for v in workflow_data.values()
        )
        wf_format = "api" if has_class else "unknown"

    return {
        "modelTypes": sorted(model_types),
        "inputs": inputs,
        "outputs": outputs,
        "format": wf_format,
    }

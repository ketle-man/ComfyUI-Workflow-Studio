"""Extract ComfyUI workflow JSON from PNG metadata."""

import json


def extract_png_workflow(buf):
    """Extract ComfyUI workflow JSON from PNG byte data. Returns dict or None."""
    pos = 8  # Skip PNG signature
    while pos < len(buf):
        if pos + 8 > len(buf):
            break
        length = int.from_bytes(buf[pos : pos + 4], "big")
        chunk_type = buf[pos + 4 : pos + 8].decode("ascii", errors="replace")

        if chunk_type in ("tEXt", "iTXt"):
            data = buf[pos + 8 : pos + 8 + length]
            keyword = ""
            text = ""

            if chunk_type == "tEXt":
                null_idx = data.index(0) if 0 in data else -1
                if null_idx != -1:
                    keyword = data[:null_idx].decode("utf-8", errors="replace")
                    text = data[null_idx + 1 :].decode("utf-8", errors="replace")
            elif chunk_type == "iTXt":
                null1 = data.index(0) if 0 in data else -1
                if null1 != -1:
                    keyword = data[:null1].decode("utf-8", errors="replace")
                    comp_flag = data[null1 + 1] if null1 + 1 < len(data) else 1
                    if comp_flag == 0:
                        rest = data[null1 + 3 :]
                        null2 = rest.index(0) if 0 in rest else -1
                        if null2 != -1:
                            rest2 = rest[null2 + 1 :]
                            null3 = rest2.index(0) if 0 in rest2 else -1
                            if null3 != -1:
                                text = rest2[null3 + 1 :].decode(
                                    "utf-8", errors="replace"
                                )

            if keyword in ("workflow", "prompt") and text:
                try:
                    return json.loads(text)
                except Exception:
                    pass

        pos += length + 12
        if chunk_type == "IEND":
            break

    return None

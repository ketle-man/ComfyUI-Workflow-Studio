"""Video tab utilities: last-frame capture and animated GIF conversion.

Runs entirely on dependencies ComfyUI itself already requires — PyAV for
decoding (ComfyUI core already needs av>=17.0.0) and Pillow for GIF encoding
— so no ffmpeg binary and no new pip installs, unlike a typical ffmpeg-based
implementation (e.g. Eagle's video2gif/video-to-frame plugins).
"""

import base64
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    from PIL import Image
    _RESAMPLE = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
except Exception:  # pragma: no cover - Pillow is a hard ComfyUI dependency
    _RESAMPLE = None


class VideoService:
    def _resolve_media_path(self, filename: str, subfolder: str, type_: str) -> Path:
        """Resolves a ComfyUI-style {filename, subfolder, type} reference to an
        absolute path, guarding against path traversal outside the matching
        input/output/temp directory."""
        import folder_paths  # type: ignore

        base_dir = folder_paths.get_directory_by_type(type_)
        if not base_dir:
            raise ValueError(f"Invalid type: {type_}")
        base = Path(base_dir).resolve()
        target = (base / (subfolder or "") / filename).resolve()
        try:
            target.relative_to(base)
        except ValueError:
            raise ValueError("Access denied: path outside allowed directory")
        if not target.is_file():
            raise FileNotFoundError(f"File not found: {filename}")
        return target

    def save_frame_to_output(self, image_base64: str, filename_prefix: str = "video/Frame") -> dict:
        """Saves a client-captured video frame (PNG data URL) into ComfyUI's own
        output folder — same auto-numbered pattern as Lab's index-image save
        (see LabPlanService.save_index_image_to_output)."""
        import folder_paths  # type: ignore

        b64 = image_base64
        if "," in b64 and b64.strip().lower().startswith("data:"):
            b64 = b64.split(",", 1)[1]
        image_bytes = base64.b64decode(b64)

        output_dir = folder_paths.get_output_directory()
        full_output_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(filename_prefix, output_dir)
        save_name = f"{filename}_{counter:05}_.png"
        save_path = Path(full_output_folder) / save_name
        save_path.write_bytes(image_bytes)
        return {"filename": save_name, "subfolder": subfolder}

    def convert_to_gif(
        self,
        filename: str,
        subfolder: str,
        type_: str,
        start_time: float = 0.0,
        end_time=None,
        fps: float = 10.0,
        max_width=None,
        filename_prefix: str = "video/GIF",
    ) -> dict:
        """Decodes the given video (PyAV), samples it down to `fps`, optionally
        downscales to `max_width`, and encodes the result as an animated GIF
        (Pillow) into ComfyUI's own output folder."""
        import av  # type: ignore
        import folder_paths  # type: ignore

        if _RESAMPLE is None:
            raise RuntimeError("Pillow is not available")

        src_path = self._resolve_media_path(filename, subfolder, type_)
        fps = max(0.1, float(fps))

        container = av.open(str(src_path))
        try:
            stream = container.streams.video[0]
            source_fps = float(stream.average_rate) if stream.average_rate else 24.0
            step = max(1, round(source_fps / fps))

            pil_frames = []
            idx = 0
            for frame in container.decode(stream):
                t = float(frame.pts * stream.time_base) if frame.pts is not None else None
                if t is not None:
                    if t < start_time:
                        idx += 1
                        continue
                    if end_time is not None and t > end_time:
                        break
                if idx % step == 0:
                    im = frame.to_image()
                    if max_width and im.width > max_width:
                        ratio = max_width / im.width
                        im = im.resize((max_width, max(1, round(im.height * ratio))), _RESAMPLE)
                    pil_frames.append(im.convert("RGB"))
                idx += 1
        finally:
            container.close()

        if not pil_frames:
            raise ValueError("No frames found in the specified range")

        output_dir = folder_paths.get_output_directory()
        full_output_folder, out_filename, counter, out_subfolder, _ = folder_paths.get_save_image_path(filename_prefix, output_dir)
        save_name = f"{out_filename}_{counter:05}_.gif"
        save_path = Path(full_output_folder) / save_name

        duration_ms = max(20, round(1000 / fps))
        pil_frames[0].save(
            save_path,
            format="GIF",
            save_all=True,
            append_images=pil_frames[1:],
            duration=duration_ms,
            loop=0,
            optimize=True,
        )
        return {"filename": save_name, "subfolder": out_subfolder, "frame_count": len(pil_frames)}

"""Video tab utilities: last-frame capture and animated GIF conversion.

Runs entirely on dependencies ComfyUI itself already requires — PyAV for
decoding (ComfyUI core already needs av>=17.0.0) and Pillow for GIF encoding
— so no ffmpeg binary and no new pip installs, unlike a typical ffmpeg-based
implementation (e.g. Eagle's video2gif/video-to-frame plugins).
"""

import base64
import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    from PIL import Image
    _RESAMPLE = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
except Exception:  # pragma: no cover - Pillow is a hard ComfyUI dependency
    _RESAMPLE = None

# Text overlay anchors: 9-grid "<vertical>-<horizontal>" (e.g. "bottom-center").
_ANCHOR_V = ("top", "middle", "bottom")
_ANCHOR_H = ("left", "center", "right")

# Fonts tried in order for text overlays. Pillow's built-in default font has no
# CJK glyphs (Japanese/Chinese text would render as boxes), so a system font
# with CJK coverage is preferred; load_default() is only the last resort.
_FONT_CANDIDATES = {
    "win32": ["meiryo.ttc", "YuGothM.ttc", "NotoSansJP-Regular.ttf", "msgothic.ttc", "arial.ttf"],
    "darwin": [
        "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ],
    "linux": [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ],
}


def _load_overlay_font(size: int):
    from PIL import ImageFont

    platform = "win32" if sys.platform.startswith("win") else ("darwin" if sys.platform == "darwin" else "linux")
    for name in _FONT_CANDIDATES[platform]:
        path = name
        if platform == "win32" and not os.path.isabs(name):
            path = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", name)
        if os.path.isfile(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default(size=size)


def _render_text_layer(width: int, height: int, ov: dict):
    """Renders one overlay's text onto a transparent full-frame RGBA layer, so
    it can be alpha-composited over every frame in its time range without
    re-rendering the text per frame (same idea as ComfyUI core's TextOverlay)."""
    from PIL import ImageColor, ImageDraw

    text = str(ov.get("text") or "").replace("\\n", "\n")
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    if not text.strip():
        return layer

    size = max(8, round(float(ov.get("font_size") or 6.0) / 100.0 * height))
    font = _load_overlay_font(size)
    stroke = max(1, round(size * 0.06)) if ov.get("outline", True) else 0
    spacing = round(size * 0.2)
    try:
        color = ImageColor.getrgb(str(ov.get("color") or "#ffffff"))
    except ValueError:
        color = (255, 255, 255)
    fill = (*color[:3], 255)

    anchor = str(ov.get("anchor") or "bottom-center").split("-")
    v = anchor[0] if anchor and anchor[0] in _ANCHOR_V else "bottom"
    h = anchor[1] if len(anchor) > 1 and anchor[1] in _ANCHOR_H else "center"

    draw = ImageDraw.Draw(layer)
    box = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing, stroke_width=stroke, align=h)
    tw, th = box[2] - box[0], box[3] - box[1]
    margin = round(0.04 * min(width, height))
    x = {"left": margin, "center": (width - tw) / 2, "right": width - margin - tw}[h] - box[0]
    y = {"top": margin, "middle": (height - th) / 2, "bottom": height - margin - th}[v] - box[1]

    if ov.get("background"):
        pad = round(size * 0.3)
        draw.rounded_rectangle(
            (x + box[0] - pad, y + box[1] - pad, x + box[2] + pad, y + box[3] + pad),
            radius=pad, fill=(0, 0, 0, 140),
        )
    draw.multiline_text((x, y), text, font=font, fill=fill, spacing=spacing, align=h,
                        stroke_width=stroke, stroke_fill=(0, 0, 0, 255))
    return layer


def _fit_layer(img, base_w: int, base_h: int, pip: dict):
    """Scales a picture-in-picture frame to its target width (a fraction of the
    base frame's width, aspect preserved), applies opacity, and returns
    (layer, left, top) with the position of its top-left corner on the base
    frame (pip["x"]/["y"] are the layer's centre as fractions of the frame)."""
    layer = img.convert("RGBA")
    pw = max(2, int(round(float(pip["scale"]) * base_w)))
    ph = max(2, int(round(pw * layer.height / max(1, layer.width))))
    layer = layer.resize((pw, ph), _RESAMPLE)
    opacity = float(pip.get("opacity", 1.0))
    if opacity < 0.999:
        layer.putalpha(layer.getchannel("A").point(lambda a: int(a * opacity)))
    left = int(round(float(pip["x"]) * base_w - pw / 2))
    top = int(round(float(pip["y"]) * base_h - ph / 2))
    return layer, left, top


class _PipSource:
    """One overlay clip's frame source. Images are decoded once; videos are
    decoded sequentially (seek once to the in-file start, then only forward),
    since the base video is also processed strictly in time order. After a
    video's last frame it holds that frame until the overlay's end."""

    def __init__(self, path: Path, pip: dict, base_w: int, base_h: int):
        import av  # type: ignore

        self.pip = pip
        self.base_w, self.base_h = base_w, base_h
        self.start = float(pip["start"])
        self.end = self.start + float(pip["length"])
        self.src_start = max(0.0, float(pip.get("src_start") or 0.0))
        self.container = None
        self._cache_key = None
        self._cache = None
        if pip.get("kind") == "image":
            with Image.open(path) as im:
                im.load()
                self.static = _fit_layer(im, base_w, base_h, pip)
        else:
            self.static = None
            self.container = av.open(str(path))
            self.stream = self.container.streams.video[0]
            if self.src_start > 0.05:
                self.container.seek(int(self.src_start * 1_000_000))
            self.gen = self.container.decode(self.stream)
            self.cur = None
            self.nxt = None
            self.done = False

    def _time(self, frame) -> float:
        return float(frame.pts * self.stream.time_base) if frame.pts is not None else 0.0

    def layer_at(self, t: float):
        """(layer, left, top) for timeline time t, or None when inactive."""
        if not (self.start <= t < self.end):
            return None
        if self.static is not None:
            return self.static
        target = self.src_start + (t - self.start)
        while True:
            if self.nxt is None and not self.done:
                try:
                    self.nxt = next(self.gen)
                except StopIteration:
                    self.done = True
            if self.nxt is not None and self._time(self.nxt) <= target + 1e-3:
                self.cur, self.nxt = self.nxt, None
                continue
            break
        frame = self.cur or self.nxt
        if frame is None:
            return None
        key = id(frame)
        if key != self._cache_key:
            self._cache = _fit_layer(frame.to_image(), self.base_w, self.base_h, self.pip)
            self._cache_key = key
        return self._cache

    def close(self):
        if self.container is not None:
            self.container.close()
            self.container = None


def _paste_layer(base, layer, left: int, top: int):
    """Alpha-composites `layer` onto the RGBA `base` at (left, top), clipping
    whatever falls outside the frame (a plain alpha_composite() dest can't be
    negative)."""
    x0, y0 = max(0, left), max(0, top)
    x1, y1 = min(base.width, left + layer.width), min(base.height, top + layer.height)
    if x1 <= x0 or y1 <= y0:
        return
    piece = layer.crop((x0 - left, y0 - top, x1 - left, y1 - top))
    region = base.crop((x0, y0, x1, y1))
    region.alpha_composite(piece)
    base.paste(region, (x0, y0))


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

    @staticmethod
    def _unique_output_path(stem: str, ext: str) -> tuple[Path, str]:
        """output/video/ 配下で未使用のパスを決める。戻り値は (絶対パス, subfolder)。"""
        import folder_paths  # type: ignore

        subfolder = "video"
        out_dir = Path(folder_paths.get_output_directory()) / subfolder
        out_dir.mkdir(parents=True, exist_ok=True)
        dst = out_dir / f"{stem}{ext}"
        counter = 1
        while dst.exists():
            dst = out_dir / f"{stem}_{counter}{ext}"
            counter += 1
        return dst, subfolder

    def register_asset(self, filename: str, subfolder: str, type_: str) -> dict:
        """Video Sourceの動画をGalleryに載せるため、outputフォルダ配下の実体にする。
        既にoutput配下ならそのまま、input/tempならoutput/videoへコピーする。"""
        import shutil

        src = self._resolve_media_path(filename, subfolder, type_)
        if type_ == "output":
            return {"filename": src.name, "subfolder": subfolder or "", "path": str(src).replace("\\", "/")}
        dst, out_sub = self._unique_output_path(src.stem, src.suffix)
        shutil.copy2(src, dst)
        return {"filename": dst.name, "subfolder": out_sub, "path": str(dst).replace("\\", "/")}

    def convert_audio_to_output(self, filename: str, subfolder: str, type_: str, opts: dict) -> dict:
        """動画/音声クリップの音声を指定形式へ変換し、output/videoへ保存する。"""
        from .convert_service import OUTPUT_FORMATS, convert_audio, supports_tags

        fmt = str(opts.get("format", ""))
        if fmt not in OUTPUT_FORMATS:
            raise ValueError(f"Unsupported format: {fmt}")

        def _int(key: str) -> int:
            try:
                return max(0, int(opts.get(key) or 0))
            except (TypeError, ValueError):
                return 0

        src = self._resolve_media_path(filename, subfolder, type_)
        inherit = bool(opts.get("inherit_metadata", True))
        dst, out_sub = self._unique_output_path(src.stem, OUTPUT_FORMATS[fmt]["ext"])
        try:
            convert_audio(
                src, dst, fmt,
                bitrate_kbps=_int("bitrate"),
                sample_rate=_int("sample_rate"),
                channels=str(opts.get("channels", "keep")),
                inherit_metadata=inherit,
            )
        except Exception:
            dst.unlink(missing_ok=True)
            raise
        return {
            "filename": dst.name,
            "subfolder": out_sub,
            "path": str(dst).replace("\\", "/"),
            "tags_skipped": inherit and not supports_tags(fmt),
        }

    def probe_video(self, filename: str, subfolder: str, type_: str) -> dict:
        """Reads duration/dimensions/fps/audio presence via PyAV only (no ffmpeg
        subprocess) — used by the Video Edit tab right after a clip is added, so
        the timeline UI can show its length and the export-time resolution-match
        check has real numbers to compare against."""
        import av  # type: ignore

        src_path = self._resolve_media_path(filename, subfolder, type_)
        container = av.open(str(src_path))
        try:
            stream = container.streams.video[0]
            fps = float(stream.average_rate) if stream.average_rate else 0.0
            if stream.duration is not None and stream.time_base is not None:
                duration = float(stream.duration * stream.time_base)
            elif container.duration is not None:
                duration = float(container.duration) / 1_000_000
            else:
                duration = 0.0
            width = stream.codec_context.width
            height = stream.codec_context.height
            has_audio = len(container.streams.audio) > 0
        finally:
            container.close()

        return {
            "duration": duration,
            "width": width,
            "height": height,
            "fps": fps,
            "has_audio": has_audio,
        }

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

    def overlay_text_on_video(
        self,
        filename: str,
        subfolder: str,
        type_: str,
        overlays: list,
        filename_prefix: str = "video/wfm_edit",
        delete_source: bool = False,
        pips: list = None,
    ) -> dict:
        """Burns timed text overlays - and picture-in-picture overlay clips
        (video or image, placed/scaled/faded on the frame) - into a video
        (Video Edit tab, Phase 3 + overlay track).

        ComfyUI core has no time-ranged video text node (core TextOverlay draws
        on every frame of an IMAGE batch, top/bottom only), and routing the
        whole timeline through IMAGE tensors would hold every decoded frame in
        memory at once — so this streams instead: decode one frame, composite
        any overlay whose [start, end) covers it, encode, repeat. Audio packets
        are remuxed untouched (no audio re-encode), so the soundtrack built by
        the export graph (original audio / BGM) survives this pass as-is.

        overlays: [{text, start, end, font_size (% of frame height), color,
        anchor ("<top|middle|bottom>-<left|center|right>"), outline, background}]
        with start/end in seconds from the start of the video.

        pips: [{filename, subfolder, type (input), kind ("video"|"image"),
        src_start (in-file start, s), start (timeline s), length (s),
        x, y (centre, fractions of the frame), scale (width as a fraction of
        the frame width), opacity (0..1)}]. Overlay audio is not mixed.
        Pips are drawn first (in list order), then text on top.
        """
        import av  # type: ignore
        import folder_paths  # type: ignore

        src_path = self._resolve_media_path(filename, subfolder, type_)
        items = []
        for ov in overlays or []:
            try:
                start = max(0.0, float(ov.get("start") or 0.0))
                end = float(ov.get("end") or 0.0)
            except (TypeError, ValueError):
                continue
            if end > start and str(ov.get("text") or "").strip():
                items.append((start, end, ov))
        valid_pips = []
        for pip in pips or []:
            try:
                if float(pip["length"]) > 0 and float(pip["scale"]) > 0 and pip.get("filename"):
                    valid_pips.append(pip)
            except (KeyError, TypeError, ValueError):
                continue
        if not items and not valid_pips:
            raise ValueError("No valid text or overlay clips")
        # Resolve overlay files up front so a missing one fails before any encoding.
        pip_paths = [
            self._resolve_media_path(p["filename"], p.get("subfolder", ""), p.get("type", "input"))
            for p in valid_pips
        ]

        output_dir = folder_paths.get_output_directory()
        full_output_folder, out_filename, counter, out_subfolder, _ = folder_paths.get_save_image_path(filename_prefix, output_dir)
        save_name = f"{out_filename}_{counter:05}_.mp4"
        save_path = Path(full_output_folder) / save_name

        in_c = av.open(str(src_path))
        out_c = None
        pip_sources = []
        try:
            in_v = in_c.streams.video[0]
            in_a = in_c.streams.audio[0] if in_c.streams.audio else None
            width, height = in_v.codec_context.width, in_v.codec_context.height
            rate = in_v.average_rate or in_v.guessed_rate or 24

            pip_sources = [_PipSource(path, pip, width, height) for path, pip in zip(pip_paths, valid_pips)]
            layers = [(s, e, _render_text_layer(width, height, ov)) for s, e, ov in items]

            out_c = av.open(str(save_path), mode="w")
            out_v = out_c.add_stream("libx264", rate=rate)
            out_v.width = width
            out_v.height = height
            out_v.pix_fmt = "yuv420p"
            out_v.options = {"crf": "18", "preset": "medium"}
            out_a = out_c.add_stream_from_template(in_a) if in_a is not None else None

            streams = [in_v] + ([in_a] if in_a is not None else [])
            first_pts = None
            index = 0
            for packet in in_c.demux(*streams):
                if packet.stream.type == "audio":
                    if packet.dts is None:
                        continue
                    packet.stream = out_a
                    out_c.mux(packet)
                    continue
                for frame in packet.decode():
                    if frame.pts is not None and first_pts is None:
                        first_pts = frame.pts
                    t = float((frame.pts - first_pts) * in_v.time_base) if frame.pts is not None else index / float(rate)
                    active = [layer for s, e, layer in layers if s <= t < e]
                    pip_layers = [pl for pl in (src.layer_at(t) for src in pip_sources) if pl is not None]
                    if active or pip_layers:
                        img = frame.to_image().convert("RGBA")
                        for layer, left, top in pip_layers:
                            _paste_layer(img, layer, left, top)
                        for layer in active:
                            img.alpha_composite(layer)
                        out_frame = av.VideoFrame.from_image(img.convert("RGB"))
                    else:
                        out_frame = frame
                    out_frame.pts = index
                    out_frame.time_base = out_v.codec_context.time_base
                    index += 1
                    for out_packet in out_v.encode(out_frame):
                        out_c.mux(out_packet)
            for out_packet in out_v.encode(None):
                out_c.mux(out_packet)
        except BaseException:
            if out_c is not None:
                out_c.close()
                out_c = None
            save_path.unlink(missing_ok=True)
            raise
        finally:
            if out_c is not None:
                out_c.close()
            for src in pip_sources:
                src.close()
            in_c.close()

        # The export graph's intermediate file is only deleted when the caller
        # explicitly asks and it's one of this tab's own "_pre" intermediates in
        # output — never an arbitrary user file.
        if delete_source and type_ == "output" and Path(filename).name.startswith("wfm_edit_pre"):
            try:
                src_path.unlink()
            except OSError as e:
                logger.warning("Could not delete intermediate %s: %s", src_path, e)

        return {"filename": save_name, "subfolder": out_subfolder, "frame_count": index}

"""Audio conversion (and audio extraction from video) using PyAV.

Gallery の「Convert」機能のコア。PyAV(av)だけで完結し、システムの ffmpeg には依存しない。
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# 出力フォーマット -> (拡張子, エンコーダ, 標準サンプル形式, ビットレート指定可否, タグ保持可否)
# .ogg は PyAV 同梱ビルドに Vorbis エンコーダが無いため出力対象外（入力は読める）。
# wav は任意キー(prompt/workflow)のタグを持てないため、メタデータ引き継ぎの対象外。
OUTPUT_FORMATS = {
    "flac": {"ext": ".flac", "codec": "flac", "sample_fmt": "s16", "bitrate": False, "tags": True},
    "mp3": {"ext": ".mp3", "codec": "libmp3lame", "sample_fmt": "fltp", "bitrate": True, "tags": True},
    "opus": {"ext": ".opus", "codec": "libopus", "sample_fmt": "flt", "bitrate": True, "tags": True},
    "m4a": {"ext": ".m4a", "codec": "aac", "sample_fmt": "fltp", "bitrate": True, "tags": True},
    "wav": {"ext": ".wav", "codec": "pcm_s16le", "sample_fmt": "s16", "bitrate": False, "tags": False},
}

# 引き継ぐタグ(小文字で比較)。ComfyUIの prompt/workflow と一般的な曲情報のみ。
_CARRY_TAGS = {"prompt", "workflow", "title", "artist", "album", "date", "genre", "comment"}

_OPUS_RATES = (8000, 12000, 16000, 24000, 48000)


def supports_tags(fmt: str) -> bool:
    return bool(OUTPUT_FORMATS.get(fmt, {}).get("tags"))


def _channel_layout(opt: str, src_channels: int) -> str:
    if opt == "mono":
        return "mono"
    if opt == "stereo":
        return "stereo"
    return "mono" if src_channels == 1 else "stereo"


def convert_audio(src: Path, dst: Path, fmt: str, *, bitrate_kbps: int = 0,
                  sample_rate: int = 0, channels: str = "keep",
                  inherit_metadata: bool = True) -> dict:
    """src(音声または音声トラックを持つ動画)から dst へ変換する。

    sample_rate=0 / channels="keep" は元の設定を維持。opusは48kHz固定扱い。
    戻り値: {"tags_written": bool}（タグを持てない形式や元にタグが無い場合は False）
    """
    import av

    spec = OUTPUT_FORMATS[fmt]
    tags_written = False
    with av.open(str(src)) as in_c:
        if not in_c.streams.audio:
            raise ValueError("No audio stream in the source file")
        in_stream = in_c.streams.audio[0]

        rate = sample_rate or in_stream.rate or 44100
        if fmt == "opus":
            rate = min(_OPUS_RATES, key=lambda r: abs(r - rate)) if sample_rate else 48000
        elif fmt == "mp3" and rate not in (8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000):
            rate = 44100
        layout = _channel_layout(channels, in_stream.channels)

        options = {"movflags": "use_metadata_tags"} if fmt == "m4a" else {}
        with av.open(str(dst), "w", options=options) as out_c:
            # タグ: 引き継ぎ対象かつ形式がタグを持てる場合のみ
            if inherit_metadata and spec["tags"]:
                src_tags = dict(in_c.metadata or {})
                for k, v in (in_stream.metadata or {}).items():  # Opus等はストリーム側にタグを持つ
                    src_tags.setdefault(k, v)
                for k, v in src_tags.items():
                    if k.lower() in _CARRY_TAGS and isinstance(v, str) and v:
                        out_c.metadata[k.lower()] = v
                        tags_written = True

            out_stream = out_c.add_stream(spec["codec"], rate=rate)
            out_stream.layout = layout
            if spec["bitrate"] and bitrate_kbps:
                out_stream.bit_rate = int(bitrate_kbps) * 1000

            resampler = av.AudioResampler(format=out_stream.format.name, layout=layout, rate=rate)

            def _encode(frames):
                for f in frames:
                    for pkt in out_stream.encode(f):
                        out_c.mux(pkt)

            for frame in in_c.decode(in_stream):
                _encode(resampler.resample(frame))
            _encode(resampler.resample(None))
            for pkt in out_stream.encode(None):
                out_c.mux(pkt)
    return {"tags_written": tags_written}

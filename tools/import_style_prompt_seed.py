"""
Style/Prompt ギャラリー用シードデータ投入スクリプト。

comfyui_prompt_gallery / prompt_builder_proto 形式の wildcard データ
(pack: set: category: leaf: [tag_string] という4階層YAML + thumbnails/ 配下の対応画像)
から、画像とタグ文字列の組が揃っているエントリだけを ws_style_prompt 用フォルダへコピーする。

- テキストのみのワイルドカード（画像が無いもの）は対象外
- サムネイル画像はあってもYAML側にタグが無いもの（プレースホルダー画像等）も対象外
- コピー先には画像と同名の .txt サイドカー（タグ文字列そのまま）を書き込む

Usage:
    python tools/import_style_prompt_seed.py --source <wildcard_dataディレクトリ> --dest <ws_style_promptディレクトリ>
"""
import argparse
import re
import shutil
from pathlib import Path

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def clean_tags(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^[,\s]+|[,\s]+$", "", text)
    text = re.sub(r"\s*,\s*", ", ", text)
    return text


def parse_yaml_leaves(yaml_path: Path) -> dict[str, str]:
    """comfyui_prompt_gallery の parseYamlForImages と同じ簡易パーサ（PyYAML不要）。
    「key:」行の直後が「- タグ文字列」で始まる行なら key をリーフとみなす。
    戻り値: {leaf_name(小文字): タグ文字列}
    """
    leaves: dict[str, str] = {}
    lines = yaml_path.read_text(encoding="utf-8", errors="replace").split("\n")
    for i, line in enumerate(lines):
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        if not trimmed.endswith(":"):
            continue
        if i + 1 >= len(lines):
            continue
        next_trimmed = lines[i + 1].strip()
        if not next_trimmed.startswith("-"):
            continue
        key = trimmed[:-1].strip()
        tags = next_trimmed[1:].strip()
        if not tags or key.lower() == "skip":
            continue
        leaves[key.lower()] = clean_tags(tags)
    return leaves


def import_category(cat_dir: Path, dest_root: Path) -> tuple[int, int, int]:
    """1カテゴリ分を投入する。戻り値: (copied, images_without_prompt, leaves_total)"""
    category = cat_dir.name
    yaml_files = sorted(cat_dir.glob("*.yaml")) + sorted(cat_dir.glob("*.yml"))

    leaves: dict[str, str] = {}
    for yf in yaml_files:
        leaves.update(parse_yaml_leaves(yf))

    copied = 0
    images_without_prompt = 0

    # "thumbnails" と、preview違いの "thumbnails_option2"（例: alchemist.preview3.jpeg）の両方を対象にする
    for thumb_dir_name in ("thumbnails", "thumbnails_option2"):
        thumbnails_dir = cat_dir / thumb_dir_name
        if not thumbnails_dir.is_dir():
            continue
        for img_path in sorted(thumbnails_dir.rglob("*")):
            if not img_path.is_file() or img_path.suffix.lower() not in IMAGE_EXTS:
                continue
            # "alchemist.preview3.jpeg" のような二重拡張子にも対応するため、最初の "." より前をリーフ名候補にする
            leaf_candidate = img_path.name.split(".")[0].lower()
            tags = leaves.get(leaf_candidate)
            if tags is None:
                images_without_prompt += 1
                continue

            rel_parts = img_path.relative_to(thumbnails_dir).parts
            # 先頭1階層（パック名。例: "ponyxl"）は全カテゴリ共通で冗長なため省く
            dest_rel = Path(*rel_parts[1:]) if len(rel_parts) > 1 else Path(rel_parts[0])
            dest_path = dest_root / category / dest_rel
            dest_path.parent.mkdir(parents=True, exist_ok=True)

            shutil.copy2(img_path, dest_path)
            dest_path.with_suffix(".txt").write_text(tags, encoding="utf-8")
            copied += 1

    return copied, images_without_prompt, len(leaves)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="wildcard_data ディレクトリ")
    parser.add_argument("--dest", required=True, help="投入先 ws_style_prompt ディレクトリ")
    args = parser.parse_args()

    source = Path(args.source)
    dest = Path(args.dest)
    if not source.is_dir():
        raise SystemExit(f"source not found: {source}")
    dest.mkdir(parents=True, exist_ok=True)

    categories = [
        d for d in sorted(source.iterdir())
        if d.is_dir() and (d / "thumbnails").is_dir()
    ]
    if not categories:
        raise SystemExit(f"No category with a thumbnails/ subfolder found under {source}")

    total_copied = 0
    total_skipped = 0
    for cat_dir in categories:
        copied, skipped, leaf_total = import_category(cat_dir, dest)
        print(f"[{cat_dir.name}] copied={copied}  images_without_prompt={skipped}  yaml_leaves={leaf_total}")
        total_copied += copied
        total_skipped += skipped

    print(f"\nDone. {len(categories)} categories, {total_copied} images copied, {total_skipped} skipped (no matching prompt).")
    print(f"Destination: {dest}")


if __name__ == "__main__":
    main()

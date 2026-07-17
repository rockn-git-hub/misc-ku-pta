"""
Convert a PDF file into numbered WebP page images for the PTA viewer PoC.

This script keeps the workflow simple on Windows:
1. Render each page through poppler.
2. Save each page as WebP under api/_documents/<doc-id>/.

Example:
    .\.venv\Scripts\python.exe .\convert_pdf_to_webp.py `
        --pdf "C:\path\to\sample.pdf" `
        --output-dir "D:\PTA\Codex\api\_documents\sample-doc" `
        --dpi 180 `
        --quality 82
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from pdf2image import convert_from_path


DEFAULT_POPPLER_PATH = Path(r"C:\Program Files\poppler-0.68.0\bin")


def build_parser() -> argparse.ArgumentParser:
    """Create the command line parser."""
    parser = argparse.ArgumentParser(
        description="Convert PDF pages into numbered WebP files."
    )
    parser.add_argument("--pdf", required=True, help="Source PDF file path.")
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Directory where numbered .webp files will be written.",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=180,
        help="Rendering DPI. Higher values improve text readability but increase size.",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=82,
        help="WebP quality from 0 to 100.",
    )
    parser.add_argument(
        "--poppler-path",
        default=str(DEFAULT_POPPLER_PATH),
        help="Directory containing pdftoppm.exe and pdfinfo.exe.",
    )
    return parser


def ensure_output_dir(output_dir: Path) -> None:
    """Recreate the output directory so old page files do not remain."""
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)


def convert_pdf(pdf_path: Path, output_dir: Path, dpi: int, quality: int, poppler_path: Path) -> int:
    """Render the PDF and save every page as a numbered WebP file."""
    pages = convert_from_path(
        pdf_path=str(pdf_path),
        dpi=dpi,
        fmt="png",
        poppler_path=str(poppler_path),
    )

    for index, image in enumerate(pages, start=1):
        output_path = output_dir / f"{index:03}.webp"
        image.save(output_path, format="WEBP", quality=quality, method=6)

    return len(pages)


def main() -> int:
    """Parse arguments and execute the conversion."""
    parser = build_parser()
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    output_dir = Path(args.output_dir)
    poppler_path = Path(args.poppler_path)

    if not pdf_path.exists():
        parser.error(f"PDF file not found: {pdf_path}")
    if not poppler_path.exists():
        parser.error(f"Poppler directory not found: {poppler_path}")
    if args.dpi < 72:
        parser.error("--dpi must be 72 or greater.")
    if not 0 <= args.quality <= 100:
        parser.error("--quality must be between 0 and 100.")

    ensure_output_dir(output_dir)
    page_count = convert_pdf(
        pdf_path=pdf_path,
        output_dir=output_dir,
        dpi=args.dpi,
        quality=args.quality,
        poppler_path=poppler_path,
    )
    print(f"Converted {page_count} pages into {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Extract a simple per-slide text outline from a PPTX."""

import argparse
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


NS = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}


def slide_sort_key(name):
    match = re.search(r"slide(\d+)\.xml$", name)
    return int(match.group(1)) if match else 0


def extract_outline(pptx_path):
    lines = []
    with zipfile.ZipFile(pptx_path, "r") as archive:
        slide_names = sorted(
            [name for name in archive.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", name)],
            key=slide_sort_key,
        )
        for index, slide_name in enumerate(slide_names, start=1):
            root = ET.fromstring(archive.read(slide_name))
            texts = [node.text.strip() for node in root.findall(".//a:t", NS) if node.text and node.text.strip()]
            lines.append("## Slide {}".format(index))
            lines.append("")
            if texts:
                for text in texts:
                    lines.append("- {}".format(text))
            else:
                lines.append("- (no text)")
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main():
    parser = argparse.ArgumentParser(description="Extract per-slide text outline from a PPTX")
    parser.add_argument("input", help="Path to .pptx file")
    parser.add_argument("--output", help="Optional output markdown path")
    args = parser.parse_args()

    outline = extract_outline(args.input)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(outline)
    else:
        sys.stdout.write(outline)


if __name__ == "__main__":
    main()

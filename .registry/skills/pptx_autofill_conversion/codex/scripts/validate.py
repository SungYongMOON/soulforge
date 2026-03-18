#!/usr/bin/env python3
"""Validate basic PPTX structure and optional expected text markers."""

import argparse
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


NS = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}


def collect_texts(archive):
    texts = []
    slide_names = sorted(
        [name for name in archive.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", name)]
    )
    for slide_name in slide_names:
        root = ET.fromstring(archive.read(slide_name))
        texts.extend([node.text.strip() for node in root.findall(".//a:t", NS) if node.text and node.text.strip()])
    return texts


def validate(pptx_path, expected_strings):
    with zipfile.ZipFile(pptx_path, "r") as archive:
        names = set(archive.namelist())
        required = {"[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml"}
        missing = sorted(required - names)
        if missing:
            raise RuntimeError("missing required entries: {}".format(", ".join(missing)))

        slide_names = sorted(name for name in archive.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", name))
        if not slide_names:
            raise RuntimeError("no slide XML found")

        for entry in list(required) + slide_names:
            ET.fromstring(archive.read(entry))

        texts = collect_texts(archive)
        full_text = "\n".join(texts)
        for expected in expected_strings:
            if expected not in full_text:
                raise RuntimeError("expected text not found: {}".format(expected))

        return len(slide_names), len(texts)


def main():
    parser = argparse.ArgumentParser(description="Validate PPTX structure and expected text")
    parser.add_argument("input", help="Path to .pptx file")
    parser.add_argument("--expect", action="append", default=[], help="Expected text snippet")
    args = parser.parse_args()

    try:
        slide_count, text_count = validate(args.input, args.expect)
    except Exception as exc:
        print("INVALID: {}".format(exc), file=sys.stderr)
        sys.exit(1)

    print("VALID: {}".format(args.input))
    print("  Slides: {}".format(slide_count))
    print("  Text nodes: {}".format(text_count))


if __name__ == "__main__":
    main()

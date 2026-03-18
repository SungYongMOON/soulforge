#!/usr/bin/env python3
"""Summarize PPTX slide structure for template-preserving work."""

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter


NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
}


def slide_sort_key(name):
    match = re.search(r"slide(\d+)\.xml$", name)
    return int(match.group(1)) if match else 0


def analyze(pptx_path):
    report = {"slides": [], "placeholder_texts": {}}
    placeholder_counter = Counter()

    with zipfile.ZipFile(pptx_path, "r") as archive:
        slide_names = sorted(
            [name for name in archive.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", name)],
            key=slide_sort_key,
        )
        for index, slide_name in enumerate(slide_names, start=1):
            root = ET.fromstring(archive.read(slide_name))
            texts = [node.text.strip() for node in root.findall(".//a:t", NS) if node.text and node.text.strip()]
            for text in texts:
                if "입력하세요" in text or "제목" in text:
                    placeholder_counter[text] += 1

            report["slides"].append(
                {
                    "slide_number": index,
                    "slide_name": slide_name,
                    "text_count": len(texts),
                    "shape_count": len(root.findall(".//p:sp", NS)),
                    "group_shape_count": len(root.findall(".//p:grpSp", NS)),
                    "table_count": len(root.findall(".//a:tbl", NS)),
                    "sample_texts": texts[:12],
                }
            )

    report["placeholder_texts"] = dict(sorted(placeholder_counter.items()))
    return report


def main():
    parser = argparse.ArgumentParser(description="Analyze PPTX template structure")
    parser.add_argument("input", help="Path to .pptx file")
    parser.add_argument("--output", help="Optional output JSON path")
    args = parser.parse_args()

    report = analyze(args.input)
    content = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(content)
    else:
        sys.stdout.write(content)


if __name__ == "__main__":
    main()

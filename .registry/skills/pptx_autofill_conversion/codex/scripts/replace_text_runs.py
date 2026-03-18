#!/usr/bin/env python3
"""Replace exact text runs in PPTX slide XML and repack the archive."""

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


NS = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}


def slide_sort_key(name):
    match = re.search(r"slide(\d+)\.xml$", name)
    return int(match.group(1)) if match else 0


def unpack_archive(source_pptx, directory):
    with zipfile.ZipFile(source_pptx, "r") as archive:
        archive.extractall(directory)


def pack_archive(directory, output_pptx):
    root = Path(directory)
    with zipfile.ZipFile(output_pptx, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(root.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(root).as_posix())


def replace_exact_text(work_dir, mapping):
    total = 0
    slide_dir = Path(work_dir) / "ppt" / "slides"
    slide_paths = sorted(slide_dir.glob("slide*.xml"), key=lambda path: slide_sort_key(path.name))
    for slide_path in slide_paths:
        tree = ET.parse(slide_path)
        root = tree.getroot()
        changed = False
        for node in root.findall(".//a:t", NS):
            if node.text in mapping:
                node.text = mapping[node.text]
                total += 1
                changed = True
                continue

            stripped = node.text.strip()
            if stripped in mapping:
                leading = node.text[: len(node.text) - len(node.text.lstrip())]
                trailing = node.text[len(node.text.rstrip()) :]
                node.text = leading + mapping[stripped] + trailing
                total += 1
                changed = True
        if changed:
            tree.write(slide_path, encoding="UTF-8", xml_declaration=True)
    return total


def main():
    parser = argparse.ArgumentParser(description="Replace exact text runs in slide XML and repack a PPTX")
    parser.add_argument("input", help="Source .pptx")
    parser.add_argument("mapping_json", help="JSON file mapping exact old text to new text")
    parser.add_argument("output", help="Output .pptx")
    args = parser.parse_args()

    if not os.path.isfile(args.input):
        print("Error: file not found: {}".format(args.input), file=sys.stderr)
        sys.exit(1)
    if not os.path.isfile(args.mapping_json):
        print("Error: mapping file not found: {}".format(args.mapping_json), file=sys.stderr)
        sys.exit(1)

    with open(args.mapping_json, "r", encoding="utf-8") as handle:
        mapping = json.load(handle)

    with tempfile.TemporaryDirectory(prefix="pptx-autofill-") as temp_dir:
        unpack_archive(args.input, temp_dir)
        replacements = replace_exact_text(temp_dir, mapping)
        pack_archive(temp_dir, args.output)

    print("Repacked {} -> {}".format(args.input, args.output))
    print("Replacements: {}".format(replacements))


if __name__ == "__main__":
    main()

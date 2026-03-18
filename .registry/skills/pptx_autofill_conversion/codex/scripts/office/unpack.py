#!/usr/bin/env python3
"""Unpack a PPTX file into a directory with pretty-printed XML when possible."""

import argparse
import os
import sys
from pathlib import Path
from xml.dom import minidom
from zipfile import ZipFile


def pretty_xml(data):
    try:
        parsed = minidom.parseString(data)
        return parsed.toprettyxml(indent="  ", encoding="UTF-8")
    except Exception:
        return data


def unpack(input_path, output_dir):
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)

    with ZipFile(input_path, "r") as archive:
        for entry in archive.namelist():
            data = archive.read(entry)
            target = output / entry
            target.parent.mkdir(parents=True, exist_ok=True)
            if entry.endswith(".xml") or entry.endswith(".rels"):
                target.write_bytes(pretty_xml(data))
            else:
                target.write_bytes(data)

    print("Unpacked: {} -> {}".format(input_path, output_dir))


def main():
    parser = argparse.ArgumentParser(description="Unpack a PPTX archive into a directory")
    parser.add_argument("input", help="Path to .pptx file")
    parser.add_argument("output", help="Output directory")
    args = parser.parse_args()

    if not os.path.isfile(args.input):
        print("Error: file not found: {}".format(args.input), file=sys.stderr)
        sys.exit(1)

    unpack(args.input, args.output)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Pack a directory back into a PPTX archive."""

import argparse
import os
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def pack(input_dir, output_path):
    root = Path(input_dir)
    if not root.is_dir():
        raise FileNotFoundError("Directory not found: {}".format(input_dir))

    all_files = sorted(
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file()
    )

    with ZipFile(output_path, "w", ZIP_DEFLATED) as archive:
        for relative_path in all_files:
            archive.write(root / relative_path, relative_path, compress_type=ZIP_DEFLATED)

    print("Packed: {} -> {}".format(input_dir, output_path))


def main():
    parser = argparse.ArgumentParser(description="Pack a directory into a PPTX archive")
    parser.add_argument("input", help="Input directory")
    parser.add_argument("output", help="Output .pptx file")
    args = parser.parse_args()

    if not os.path.isdir(args.input):
        print("Error: directory not found: {}".format(args.input), file=sys.stderr)
        sys.exit(1)

    pack(args.input, args.output)


if __name__ == "__main__":
    main()

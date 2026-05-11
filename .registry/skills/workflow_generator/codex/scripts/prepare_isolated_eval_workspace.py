#!/usr/bin/env python3
"""Prepare an isolated workspace for target skill B evaluation.

Copy only explicitly allowed files into a clean destination directory under the
current run root, and refuse hidden oracle-like names by default.
"""

from __future__ import annotations

import argparse
import fnmatch
import shutil
import sys
from pathlib import Path

DEFAULT_DENY = [
    "*REF*",
    "*oracle*",
    "*answer*",
    "*expected*",
    "*accepted*",
    "*gold*",
]


def denied(path: Path, patterns: list[str]) -> str | None:
    name = path.name
    full = str(path)
    for pattern in patterns:
        if fnmatch.fnmatchcase(name.lower(), pattern.lower()) or fnmatch.fnmatchcase(full.lower(), pattern.lower()):
            return pattern
    return None


def is_within(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def validate_run_root(run_root: Path) -> None:
    if run_root.anchor == str(run_root) or len(run_root.parts) < 3:
        raise ValueError(f"refusing unsafe run root: {run_root}")
    if not run_root.exists() or not run_root.is_dir():
        raise ValueError(f"run root must already exist and be a directory: {run_root}")


def validate_destination(dest: Path, run_root: Path, sources: list[Path]) -> None:
    validate_run_root(run_root)
    if dest == run_root:
        raise ValueError("destination must be a subdirectory of run root, not run root itself")
    if not is_within(dest, run_root):
        raise ValueError(f"destination must be inside run root: dest={dest} run_root={run_root}")
    for src in sources:
        if src == dest or is_within(src, dest):
            raise ValueError(f"destination would delete an allowed source file: dest={dest} source={src}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Copy allowed evaluation files while excluding hidden oracle files.")
    parser.add_argument("--run-root", required=True, help="Current run root. Destination must be a subdirectory of it.")
    parser.add_argument("--dest", required=True, help="Destination directory to create or refresh.")
    parser.add_argument("--allow", action="append", default=[], help="File to copy. Repeat for multiple files.")
    parser.add_argument("--deny", action="append", default=[], help="Additional deny glob. Repeat for multiple patterns.")
    args = parser.parse_args(argv)

    run_root = Path(args.run_root).resolve()
    dest = Path(args.dest).resolve()
    deny_patterns = DEFAULT_DENY + args.deny
    allowed = [Path(p).resolve() for p in args.allow]

    if not allowed:
        print("error: at least one --allow file is required", file=sys.stderr)
        return 2

    for src in allowed:
        if not src.is_file():
            print(f"error: allowed source is not a file: {src}", file=sys.stderr)
            return 2
        pattern = denied(src, deny_patterns)
        if pattern:
            print(f"error: denied oracle-like file refused: {src} pattern={pattern}", file=sys.stderr)
            return 3

    try:
        validate_destination(dest, run_root, allowed)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)

    copied = []
    for src in allowed:
        target = dest / src.name
        shutil.copy2(src, target)
        copied.append(str(target))

    print("run_root:", run_root)
    print("isolated_workspace:", dest)
    for item in copied:
        print("copied:", item)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

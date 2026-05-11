#!/usr/bin/env python3
"""Prepare a read-only workspace for verifier V.

Copy B's candidate output and the reference/oracle artifact into a clean
verification directory under the current run root. This helper is for V only;
never pass this workspace to the B executor.
"""

from __future__ import annotations

import argparse
import json
import shutil
import stat
import sys
from pathlib import Path


def make_read_only(path: Path) -> None:
    mode = path.stat().st_mode
    path.chmod(mode & ~(stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH))


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
    if dest.anchor == str(dest) or len(dest.parts) < 3:
        raise ValueError(f"refusing unsafe destination: {dest}")
    if dest == run_root:
        raise ValueError("destination must be a subdirectory of run root, not run root itself")
    if not is_within(dest, run_root):
        raise ValueError(f"destination must be inside run root: dest={dest} run_root={run_root}")
    for src in sources:
        if src == dest or is_within(src, dest):
            raise ValueError(f"destination would delete an input file: dest={dest} source={src}")


def safe_refresh(dest: Path, run_root: Path, sources: list[Path]) -> None:
    validate_destination(dest, run_root, sources)
    if dest.exists():
        if not dest.is_dir():
            raise ValueError(f"destination exists and is not a directory: {dest}")
        shutil.rmtree(dest, onerror=handle_remove_readonly)
    dest.mkdir(parents=True)


def handle_remove_readonly(func, path: str, _exc_info) -> None:
    Path(path).chmod(stat.S_IWRITE)
    func(path)


def copy_one(src: Path, target: Path) -> Path:
    shutil.copy2(src, target)
    make_read_only(target)
    return target


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Create a read-only verifier workspace with candidate and oracle files.")
    parser.add_argument("--run-root", required=True, help="Current run root. Destination must be a subdirectory of it.")
    parser.add_argument("--dest", required=True, help="Destination directory to create or refresh.")
    parser.add_argument("--candidate", required=True, help="B output candidate artifact, in any task format.")
    parser.add_argument("--oracle", required=True, help="Reference/oracle artifact, in any task format. This is visible to V only.")
    parser.add_argument("--contract", action="append", default=[], help="Optional acceptance contract/checklist file. Repeatable.")
    args = parser.parse_args(argv)

    run_root = Path(args.run_root).resolve()
    dest = Path(args.dest).resolve()
    candidate = Path(args.candidate).resolve()
    oracle = Path(args.oracle).resolve()
    contracts = [Path(p).resolve() for p in args.contract]

    if not candidate.is_file():
        print(f"error: candidate is not a file: {candidate}", file=sys.stderr)
        return 2
    if not oracle.is_file():
        print(f"error: oracle is not a file: {oracle}", file=sys.stderr)
        return 2
    if candidate == oracle:
        print("error: candidate and oracle must be different files", file=sys.stderr)
        return 2
    for contract in contracts:
        if not contract.is_file():
            print(f"error: contract is not a file: {contract}", file=sys.stderr)
            return 2

    try:
        safe_refresh(dest, run_root, [candidate, oracle] + contracts)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    candidate_name = candidate.name
    oracle_name = oracle.name
    if candidate_name.lower() == oracle_name.lower():
        candidate_name = f"candidate_{candidate_name}"
        oracle_name = f"oracle_{oracle_name}"

    candidate_target = copy_one(candidate, dest / candidate_name)
    oracle_target = copy_one(oracle, dest / oracle_name)

    contract_targets = []
    for contract in contracts:
        target = dest / contract.name
        if target.exists():
            target = dest / f"contract_{contract.name}"
        contract_targets.append(copy_one(contract, target))

    manifest = {
        "role": "verifier_v_only",
        "candidate": {"source": str(candidate), "workspace_path": str(candidate_target)},
        "oracle": {"source": str(oracle), "workspace_path": str(oracle_target)},
        "contracts": [{"source": str(src), "workspace_path": str(dst)} for src, dst in zip(contracts, contract_targets)],
        "read_only": True,
        "rules": [
            "This workspace is for the verifier subagent only.",
            "Do not pass this workspace to the B executor.",
            "Verifier must not modify files, rerun B, commit, or push.",
        ],
    }
    manifest_path = dest / "verification_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    make_read_only(manifest_path)

    print("run_root:", run_root)
    print("verification_workspace:", dest)
    print("candidate:", candidate_target)
    print("oracle:", oracle_target)
    for item in contract_targets:
        print("contract:", item)
    print("manifest:", manifest_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

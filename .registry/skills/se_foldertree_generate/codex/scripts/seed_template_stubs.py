#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Seed structure-only template stubs into generated SE task folders.

This script intentionally does not claim external-standard or contract
compliance. It only copies team-owned draft skeletons into `00_Temp`
based on a registry.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict, List

try:
    import yaml  # PyYAML
except ImportError as e:
    raise SystemExit(
        "PyYAML is required. Install requirements first:\n"
        "  python -m pip install -r requirements.txt\n"
    ) from e

SKILL_ROOT = Path(__file__).resolve().parents[1]


def read_yaml(file_path: Path) -> Dict[str, Any]:
    data = yaml.safe_load(file_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Expected dict YAML at {file_path}")
    return data


def ensure_dir(path_obj: Path, dry_run: bool) -> None:
    if dry_run:
        print(f"  [DRY-RUN] mkdir: {path_obj}")
        return
    path_obj.mkdir(parents=True, exist_ok=True)


def load_registry(registry_path: Path) -> Dict[str, Any]:
    if not registry_path.exists():
        raise FileNotFoundError(f"Template registry not found: {registry_path}")
    data = read_yaml(registry_path)
    templates = data.get("templates", [])
    if not isinstance(templates, list):
        raise ValueError("Template registry `templates` must be a list.")
    return data


def select_template_matches(
    templates: List[Dict[str, Any]],
    task_term: str,
) -> List[Dict[str, Any]]:
    matches: List[Dict[str, Any]] = []
    normalized_term = str(task_term or "").strip()

    for template in templates:
        if not isinstance(template, dict):
            continue
        if template.get("match_all") is True:
            matches.append(template)
            continue
        terms = template.get("terms", [])
        if not isinstance(terms, list):
            continue
        normalized_terms = [str(term).strip() for term in terms if str(term).strip()]
        if normalized_term and normalized_term in normalized_terms:
            matches.append(template)

    return matches


def seed_template_stub(
    template: Dict[str, Any],
    templates_root: Path,
    task_dir: Path,
    dry_run: bool,
) -> None:
    template_id = str(template.get("template_id", "unknown_template")).strip()
    source_rel = str(template.get("source_file", "")).strip()
    if not source_rel:
        raise ValueError(f"Template {template_id} is missing source_file.")

    source_path = (templates_root / source_rel).resolve()
    if not source_path.exists():
        raise FileNotFoundError(f"Template source not found: {source_path}")

    seed_subfolder = str(template.get("seed_subfolder", "00_Temp")).strip() or "00_Temp"
    output_filename = str(template.get("output_filename", source_path.name)).strip() or source_path.name
    target_dir = task_dir / seed_subfolder
    target_path = target_dir / output_filename

    ensure_dir(target_dir, dry_run)
    if dry_run:
        print(f"  [DRY-RUN] seed template: {target_path} <= {source_path.name}")
        return

    if target_path.exists():
        print(f"  [SKIP] existing template kept: {target_path}")
        return

    target_path.write_text(source_path.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"  [SEED] template: {target_path}")


def seed_from_manifest(
    manifest_path: Path,
    registry_path: Path,
    project_root: Path,
    dry_run: bool,
) -> int:
    manifest = read_yaml(manifest_path)
    registry = load_registry(registry_path)
    templates = registry.get("templates", [])
    templates_root = registry_path.parent
    seeded_count = 0

    for task in manifest.get("required_tasks", []):
        if not isinstance(task, dict):
            continue
        task_path = str(task.get("path", "")).strip()
        task_term = str(task.get("term", "")).strip()
        if not task_path:
            continue

        task_dir = project_root / Path(task_path)
        if not task_dir.exists() and not dry_run:
            print(f"  [WARN] task dir missing, skipped: {task_dir}")
            continue

        matches = select_template_matches(templates, task_term)
        for template in matches:
            seed_template_stub(template, templates_root, task_dir, dry_run)
            seeded_count += 1

    return seeded_count


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed structure-only SE template stubs into 00_Temp folders.")
    ap.add_argument("--project-root", required=True, help="Generated project root that contains plan_manifest.json")
    ap.add_argument(
        "--manifest",
        help="Explicit manifest path. If omitted, <project-root>/plan_manifest.json is used.",
    )
    ap.add_argument(
        "--template-registry",
        default=str(SKILL_ROOT / "assets" / "templates" / "index.yaml"),
        help="Template registry YAML path.",
    )
    ap.add_argument("--dry-run", action="store_true", help="Preview template seeding without writing files.")
    args = ap.parse_args()

    project_root = Path(args.project_root).expanduser().resolve()
    manifest_path = Path(args.manifest).expanduser().resolve() if args.manifest else project_root / "plan_manifest.json"
    registry_path = Path(args.template_registry).expanduser().resolve()

    if not manifest_path.exists():
        raise SystemExit(f"Manifest not found: {manifest_path}")

    seeded = seed_from_manifest(manifest_path, registry_path, project_root, args.dry_run)
    print(f"[DONE] processed template matches: {seeded}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Preview draft SE foldertree variants without generating project folders."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import yaml


REQUIRED_KEYS = {
    "variant_id",
    "status",
    "generation_enabled",
    "variant_type",
    "evidence_level",
    "decision",
}
EXPECTED_COMMON_SPINE = ["SRR", "SFR", "PDR", "CDR", "TRR", "FCA", "PCA"]
SAFE_NON_PRODUCTION_STATUSES = {"draft", "blocked"}
SUPPORTED_INPUT_KEYS = {"business_type", "prime_contractor", "quality_grade"}


def load_variants(variants_dir: Path) -> list[dict[str, Any]]:
    variants: list[dict[str, Any]] = []
    for path in sorted(variants_dir.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError(f"{path.name}: top-level YAML must be a mapping")
        data["_file"] = path.name
        variants.append(data)
    return variants


def validate_variant(variant: dict[str, Any], variant_ids: set[str]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    file_name = variant.get("_file", "<unknown>")

    missing = sorted(REQUIRED_KEYS - set(variant))
    if missing:
        errors.append(f"{file_name}: missing required keys: {', '.join(missing)}")

    variant_id = str(variant.get("variant_id", "")).strip()
    if not re.fullmatch(r"[a-z0-9_]+", variant_id):
        errors.append(f"{file_name}: variant_id must use lowercase letters, digits, and underscores")

    generation_enabled = variant.get("generation_enabled")
    status = str(variant.get("status", "")).strip()
    if status in SAFE_NON_PRODUCTION_STATUSES and generation_enabled is not False:
        errors.append(f"{file_name}: {status} variants must keep generation_enabled: false")

    base_variant = variant.get("base_variant")
    if base_variant and base_variant not in variant_ids:
        errors.append(f"{file_name}: base_variant '{base_variant}' does not exist")

    variant_type = variant.get("variant_type")
    if variant_type == "common_base":
        gates = variant.get("gates")
        if not isinstance(gates, list):
            errors.append(f"{file_name}: common_base must define gates as a list")
        else:
            spine = [str(g.get("canonical_gate", "")).strip() for g in gates if isinstance(g, dict)]
            if spine != EXPECTED_COMMON_SPINE:
                errors.append(
                    f"{file_name}: common spine must be {'/'.join(EXPECTED_COMMON_SPINE)}, got {'/'.join(spine)}"
                )
    elif variant_type == "contractor_overlay":
        if not base_variant:
            errors.append(f"{file_name}: contractor_overlay must declare base_variant")
        if "overlay_for" not in variant:
            warnings.append(f"{file_name}: contractor_overlay has no overlay_for block")
    elif variant_type == "project_tailoring_candidate":
        if status != "blocked":
            warnings.append(f"{file_name}: project_tailoring_candidate is expected to stay blocked until evidence exists")
        if not variant.get("blocked_reasons"):
            errors.append(f"{file_name}: blocked candidate must list blocked_reasons")
    elif variant_type == "production_basic_spec":
        if not base_variant:
            errors.append(f"{file_name}: production_basic_spec must declare base_variant")
        if generation_enabled is not True:
            errors.append(f"{file_name}: production_basic_spec must set generation_enabled: true")
        supported_input = variant.get("supported_input")
        if not isinstance(supported_input, dict):
            errors.append(f"{file_name}: production_basic_spec must declare supported_input")
        else:
            missing_input = sorted(SUPPORTED_INPUT_KEYS - set(supported_input))
            if missing_input:
                errors.append(f"{file_name}: supported_input missing keys: {', '.join(missing_input)}")
        if not str(variant.get("support_key", "")).strip():
            errors.append(f"{file_name}: production_basic_spec must declare support_key")
        if not str(variant.get("spec_asset", "")).strip():
            errors.append(f"{file_name}: production_basic_spec must declare spec_asset")
    else:
        warnings.append(f"{file_name}: unknown variant_type '{variant_type}'")

    return errors, warnings


def build_preview(variants: list[dict[str, Any]]) -> dict[str, Any]:
    variant_id_counter = Counter(str(v.get("variant_id", "")).strip() for v in variants)
    variant_ids = set(variant_id_counter)
    report: dict[str, Any] = {
        "variant_count": len(variants),
        "variants": [],
        "errors": [],
        "warnings": [],
        "production_generation_enabled": [],
    }

    for variant_id, count in variant_id_counter.items():
        if variant_id and count > 1:
            report["errors"].append(f"duplicate variant_id detected: {variant_id}")

    production_inputs: dict[tuple[str, str, str], str] = {}
    for variant in variants:
        errors, warnings = validate_variant(variant, variant_ids)
        report["errors"].extend(errors)
        report["warnings"].extend(warnings)
        if variant.get("generation_enabled") is True:
            report["production_generation_enabled"].append(variant.get("variant_id"))
            supported_input = variant.get("supported_input")
            if isinstance(supported_input, dict):
                combo = (
                    str(supported_input.get("business_type", "")).strip(),
                    str(supported_input.get("prime_contractor", "")).strip(),
                    str(supported_input.get("quality_grade", "")).strip(),
                )
                previous = production_inputs.get(combo)
                if previous:
                    report["errors"].append(
                        f"{variant.get('_file')}: duplicate production supported_input already used by {previous}"
                    )
                else:
                    production_inputs[combo] = str(variant.get("_file"))
        gates = variant.get("gates")
        gate_count = len(gates) if isinstance(gates, list) else 0
        report["variants"].append(
            {
                "file": variant.get("_file"),
                "variant_id": variant.get("variant_id"),
                "status": variant.get("status"),
                "generation_enabled": variant.get("generation_enabled"),
                "variant_type": variant.get("variant_type"),
                "evidence_level": variant.get("evidence_level"),
                "base_variant": variant.get("base_variant"),
                "gate_count": gate_count,
                "support_key": variant.get("support_key"),
                "spec_asset": variant.get("spec_asset"),
                "decision": variant.get("decision"),
            }
        )
    return report


def print_report(report: dict[str, Any]) -> None:
    print("SE foldertree draft variant preview")
    print(f"Variants: {report['variant_count']}")
    for item in report["variants"]:
        print(
            "- {variant_id} [{status}] type={variant_type} generation_enabled={generation_enabled} "
            "evidence={evidence_level} gates={gate_count}".format(**item)
        )
        if item.get("support_key"):
            print(f"  support_key: {item['support_key']} spec_asset: {item.get('spec_asset')}")
        print(f"  decision: {item['decision']}")
    if report["warnings"]:
        print("\nWarnings:")
        for warning in report["warnings"]:
            print(f"- {warning}")
    if report["errors"]:
        print("\nErrors:")
        for error in report["errors"]:
            print(f"- {error}")
    if report["production_generation_enabled"]:
        print("\nProduction-enabled variants:")
        for variant_id in report["production_generation_enabled"]:
            print(f"- {variant_id}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--variants-dir", default="assets/variants", help="Directory containing draft variant YAML files")
    parser.add_argument("--json-out", help="Optional path for a JSON preview report")
    args = parser.parse_args()

    variants_dir = Path(args.variants_dir)
    if not variants_dir.exists():
        print(f"variants dir not found: {variants_dir}", file=sys.stderr)
        return 2

    try:
        report = build_preview(load_variants(variants_dir))
    except Exception as exc:  # noqa: BLE001 - CLI should report readable validation failures.
        print(f"failed to preview variants: {exc}", file=sys.stderr)
        return 1

    print_report(report)

    if args.json_out:
        json_path = Path(args.json_out)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nJSON preview written: {json_path}")

    return 1 if report["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())

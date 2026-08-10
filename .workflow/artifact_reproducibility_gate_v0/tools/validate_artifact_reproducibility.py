#!/usr/bin/env python3
"""Deterministic, metadata-only artifact reproducibility validator.

The validator does not accept worker prose as proof. It compares locked identities,
inspects native ZIP/XML packages, detects hard-coded authoring that bypasses declared
inputs, and requires an independent render receipt when the fixture contract says so.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tempfile
import zipfile
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path
from xml.etree import ElementTree as ET


SCHEMA_VERSION = "artifact_reproducibility_receipt_v0"
ID_PATTERN = re.compile(r"\b(?:R-[A-Za-z0-9_\-]+|[A-Z]{2,12}-[A-Z0-9_\-]{2,})\b")
SOURCE_READ_PATTERNS = (
    re.compile(r"open\s*\(", re.I),
    re.compile(r"read_text\s*\(", re.I),
    re.compile(r"read_bytes\s*\(", re.I),
    re.compile(r"Path\s*\([^\n]+\)\.(?:read_text|read_bytes)\s*\(", re.I),
)
HARD_CODE_PATTERNS = (
    re.compile(r"\bREQS\s*=", re.I),
    re.compile(r"\bREQUIREMENTS\s*=", re.I),
    re.compile(r"\brequirements\s*=\s*\[", re.I),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def canonical_hash(value: object) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest().upper()


def location_independent_receipt_hash(receipt: dict) -> str:
    basis = json.loads(json.dumps(receipt, ensure_ascii=False))
    for candidate in basis.get("candidate_metadata", []):
        candidate.pop("artifact_ref", None)
        candidate.pop("builder_ref", None)
        candidate["missing_refs"] = sorted(Path(value).name for value in candidate.get("missing_refs", []))
        builder = candidate.get("builder", {})
        mentions = builder.get("declared_input_mentions")
        if isinstance(mentions, dict):
            builder["declared_input_mentions"] = sorted(
                [{"name": Path(key).name, "observed": value} for key, value in mentions.items()],
                key=lambda item: item["name"],
            )
    return canonical_hash(basis)


def bound_identity(value: str) -> bool:
    return bool(re.fullmatch(r"(?:sha256:[0-9A-Fa-f]{64}|version:[A-Za-z0-9_.+\-]+)", value))


def ref_set_identity(paths: list[Path]) -> str:
    return canonical_hash([{"name": path.name, "sha256": sha256(path)} for path in paths])


def normalized_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def parse_xml(data: bytes, name: str, errors: list[str]) -> ET.Element | None:
    try:
        return ET.fromstring(data)
    except ET.ParseError as exc:
        errors.append(f"xml_parse_error:{name}:{exc}")
        return None


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def paragraph_text(element: ET.Element) -> str:
    values: list[str] = []
    for node in element.iter():
        if local_name(node.tag) == "t" and node.text:
            values.append(node.text)
    return "".join(values)


def page_break_value(element: ET.Element) -> bool:
    for key, value in element.attrib.items():
        if local_name(key).lower() == "pagebreak" and str(value).lower() in {"1", "true"}:
            return True
    return False


def inspect_hwpx(zf: zipfile.ZipFile, names: list[str], errors: list[str]) -> dict:
    findings: dict = {
        "mimetype_first": bool(names and names[0] == "mimetype"),
        "mimetype_stored": False,
        "section_count": 0,
        "paragraph_count": 0,
        "table_count": 0,
        "page_break_indices": [],
        "blank_page_break_indices": [],
        "consecutive_page_break_pairs": [],
    }
    if "mimetype" in names:
        findings["mimetype_stored"] = zf.getinfo("mimetype").compress_type == zipfile.ZIP_STORED
    section_names = sorted(name for name in names if re.fullmatch(r"Contents/section\d+\.xml", name))
    findings["section_count"] = len(section_names)
    top_level_index = 0
    all_text: list[str] = []
    ids: list[str] = []
    for section_name in section_names:
        root = parse_xml(zf.read(section_name), section_name, errors)
        if root is None:
            continue
        for element in root.iter():
            name = local_name(element.tag)
            if name == "tbl":
                findings["table_count"] += 1
            elif name == "p":
                findings["paragraph_count"] += 1
            elif name == "t" and element.text:
                value = normalized_text(element.text)
                if value:
                    all_text.append(value)
                    ids.extend(ID_PATTERN.findall(value))

        # Only section-direct paragraphs define document page boundaries. PageBreak
        # attributes inside table cells are layout details and must not be promoted to
        # blank-page risk findings.
        for section in (element for element in root.iter() if local_name(element.tag) == "sec"):
            previous_direct_break: int | None = None
            previous_direct_break_meaningful = False
            for child in list(section):
                if local_name(child.tag) != "p":
                    previous_direct_break = None
                    previous_direct_break_meaningful = False
                    continue
                is_break = page_break_value(child)
                if is_break:
                    findings["page_break_indices"].append(top_level_index)
                    text = normalized_text(paragraph_text(child))
                    has_embedded_content = any(
                        local_name(node.tag) in {"tbl", "pic", "shape", "container", "ole", "gso"}
                        for node in child.iter()
                    )
                    meaningful = bool(text) or has_embedded_content
                    if not meaningful:
                        findings["blank_page_break_indices"].append(top_level_index)
                    # Consecutive pageBreak paragraphs are only a blank-page risk when
                    # the previous boundary paragraph contains no visible text/object.
                    # A template page may legitimately be a single content-bearing
                    # paragraph (for example, a warning table plus signature image)
                    # followed by the next page's heading paragraph.
                    if (
                        previous_direct_break is not None
                        and top_level_index == previous_direct_break + 1
                        and not previous_direct_break_meaningful
                    ):
                        findings["consecutive_page_break_pairs"].append([previous_direct_break, top_level_index])
                    previous_direct_break = top_level_index
                    previous_direct_break_meaningful = meaningful
                else:
                    previous_direct_break = None
                    previous_direct_break_meaningful = False
                top_level_index += 1
    findings["normalized_text"] = normalized_text(" ".join(all_text))
    findings["record_ids"] = sorted(set(ids))
    return findings


def inspect_zip_xml_package(path: Path, family: str) -> dict:
    errors: list[str] = []
    component_hashes: dict[str, str] = {}
    findings: dict = {}
    with zipfile.ZipFile(path, "r") as zf:
        names = zf.namelist()
        for name in names:
            if name.endswith("/"):
                continue
            data = zf.read(name)
            component_hashes[name] = hashlib.sha256(data).hexdigest().upper()
            if name.lower().endswith((".xml", ".rels", ".hpf")):
                parse_xml(data, name, errors)
        if family == "hwpx":
            findings = inspect_hwpx(zf, names, errors)
        elif family == "pptx":
            findings["slide_count"] = len(
                [name for name in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)]
            )
        elif family == "xlsx":
            findings["sheet_component_count"] = len(
                [name for name in names if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name)]
            )
        elif family == "docx":
            findings["has_document_xml"] = "word/document.xml" in names
        findings["entry_count"] = len(names)
        findings["entry_names"] = names
    return {
        "zip_valid": not errors,
        "xml_errors": errors,
        "component_hashes": component_hashes,
        "findings": findings,
    }


def inspect_builder(builder: Path, declared_inputs: list[Path]) -> dict:
    text = builder.read_text(encoding="utf-8", errors="replace")
    input_mentions: dict[str, bool] = {}
    for item in declared_inputs:
        input_mentions[str(item)] = item.name in text or str(item) in text
    read_api_observed = any(pattern.search(text) for pattern in SOURCE_READ_PATTERNS)
    hard_coded_authoring = any(pattern.search(text) for pattern in HARD_CODE_PATTERNS)
    consumed_evidence = all(input_mentions.values()) and read_api_observed
    return {
        "sha256": sha256(builder),
        "size_bytes": builder.stat().st_size,
        "declared_input_mentions": input_mentions,
        "read_api_observed": read_api_observed,
        "hard_coded_authoring_marker": hard_coded_authoring,
        "declared_inputs_consumed_by_static_evidence": consumed_evidence,
    }


def inspect_consumption_receipt(path: Path | None, builder: Path, declared_inputs: list[Path]) -> dict:
    if path is None or not path.exists():
        return {"present": False, "valid": False}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"present": True, "valid": False, "error": str(exc)}
    expected_inputs = sorted(
        [{"name": item.name, "sha256": sha256(item)} for item in declared_inputs],
        key=lambda item: item["name"],
    )
    observed_inputs = sorted(
        [
            {"name": Path(item.get("ref", "")).name, "sha256": str(item.get("sha256", "")).upper()}
            for item in data.get("consumed_inputs", [])
        ],
        key=lambda item: item["name"],
    )
    valid = (
        data.get("schema_version") == "artifact_input_consumption_receipt_v0"
        and str(data.get("builder_sha256", "")).upper() == sha256(builder)
        and observed_inputs == expected_inputs
    )
    return {
        "present": True,
        "valid": valid,
        "receipt_sha256": sha256(path),
        "consumed_input_count": len(observed_inputs),
        "consumed_input_set_sha256": canonical_hash(observed_inputs),
    }


def inspect_render_receipt(path: Path | None) -> dict:
    if path is None:
        return {"present": False, "valid": False, "complete_surface_coverage": False}
    if not path.exists():
        return {"present": False, "valid": False, "complete_surface_coverage": False}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # bounded diagnostic
        return {"present": True, "valid": False, "complete_surface_coverage": False, "error": str(exc)}
    return {
        "present": True,
        "valid": True,
        "complete_surface_coverage": bool(data.get("complete_surface_coverage", False)),
        "surface_count": data.get("surface_count"),
        "reviewed_surface_count": data.get("reviewed_surface_count"),
        "receipt_sha256": sha256(path),
    }


def inspect_candidate(candidate: dict, family: str) -> dict:
    artifact = Path(candidate["artifact_ref"])
    builder = Path(candidate["builder_ref"])
    declared_inputs = [Path(value) for value in candidate.get("declared_input_refs", [])]
    semantic_packet_refs = [Path(value) for value in candidate.get("semantic_packet_refs", [])]
    template_ref = Path(candidate["template_ref"])
    all_refs = [artifact, builder, template_ref, *semantic_packet_refs, *declared_inputs]
    missing = [str(path) for path in all_refs if not path.exists()]
    result: dict = {
        "candidate_id": candidate["candidate_id"],
        "artifact_ref": str(artifact),
        "builder_ref": str(builder),
        "missing_refs": missing,
        "worker_self_check_present": bool(
            candidate.get("worker_self_check_ref")
            and Path(candidate["worker_self_check_ref"]).exists()
        ),
    }
    if missing:
        return result
    result["experiment_identities"] = {
        "semantic_packet_set_sha256": ref_set_identity(semantic_packet_refs),
        "template_sha256": sha256(template_ref),
        "toolchain_identity": candidate["toolchain_identity"],
        "toolchain_identity_is_bound": bound_identity(candidate["toolchain_identity"]),
        "prompt_contract_identity": candidate["prompt_contract_identity"],
        "prompt_contract_identity_is_bound": bound_identity(candidate["prompt_contract_identity"]),
    }
    result["artifact"] = {
        "sha256": sha256(artifact),
        "size_bytes": artifact.stat().st_size,
    }
    result["builder"] = inspect_builder(builder, declared_inputs)
    consumption_ref = candidate.get("input_consumption_receipt_ref")
    result["input_consumption_receipt"] = inspect_consumption_receipt(
        Path(consumption_ref) if consumption_ref else None,
        builder,
        declared_inputs,
    )
    result["declared_inputs_consumed"] = bool(
        result["builder"]["declared_inputs_consumed_by_static_evidence"]
        or result["input_consumption_receipt"]["valid"]
    )
    if family in {"hwpx", "docx", "pptx", "xlsx", "zip_xml_package"}:
        try:
            result["package"] = inspect_zip_xml_package(artifact, family)
        except (zipfile.BadZipFile, OSError) as exc:
            result["package"] = {"zip_valid": False, "xml_errors": [str(exc)], "component_hashes": {}, "findings": {}}
    render_ref = candidate.get("render_receipt_ref")
    result["render"] = inspect_render_receipt(Path(render_ref) if render_ref else None)
    return result


def same(values: list[object]) -> bool:
    return len({json.dumps(value, sort_keys=True, ensure_ascii=False) for value in values}) <= 1


def evaluate(manifest: dict) -> dict:
    family = manifest["format"]
    contract = manifest["comparison_contract"]
    inspected = [inspect_candidate(candidate, family) for candidate in manifest["candidates"]]
    differences: list[dict] = []
    remediation: list[str] = []
    gates = {
        "experiment_identity": "pass",
        "semantic_authoring": "pass",
        "deterministic_build": "pass" if contract["byte_deterministic"] else "not_required",
        "package_structure": "pass",
        "rendered_visual": "pass" if contract["visual_receipt_required"] else "not_required",
    }

    if any(item["missing_refs"] for item in inspected):
        gates["experiment_identity"] = "fail"
        differences.append({"code": "missing_fixture_ref", "details": [item["missing_refs"] for item in inspected]})

    builder_hashes = [item.get("builder", {}).get("sha256") for item in inspected]
    if contract["same_builder"] and not same(builder_hashes):
        gates["experiment_identity"] = "fail"
        differences.append({"code": "builder_hash_mismatch", "values": builder_hashes})
        remediation.append("Freeze one reviewed publisher script and reuse its exact hash in every repeat run.")

    experiment_identities = [item.get("experiment_identities", {}) for item in inspected]
    semantic_packet_hashes = [item.get("semantic_packet_set_sha256") for item in experiment_identities]
    template_hashes = [item.get("template_sha256") for item in experiment_identities]
    toolchain_ids = [item.get("toolchain_identity") for item in experiment_identities]
    prompt_ids = [item.get("prompt_contract_identity") for item in experiment_identities]
    if contract["same_semantic_packet"] and not same(semantic_packet_hashes):
        gates["experiment_identity"] = "fail"
        differences.append({"code": "semantic_packet_hash_mismatch", "values": semantic_packet_hashes})
    if contract["same_template"] and not same(template_hashes):
        gates["experiment_identity"] = "fail"
        differences.append({"code": "template_hash_mismatch", "values": template_hashes})
    if contract["same_toolchain"] and (
        not same(toolchain_ids) or not all(item.get("toolchain_identity_is_bound", False) for item in experiment_identities)
    ):
        gates["experiment_identity"] = "fail"
        differences.append({"code": "toolchain_identity_unbound_or_mismatch", "values": toolchain_ids})
        remediation.append("Persist and hash the exact runtime/toolchain lock before launching repeated workers.")
    if contract["same_prompt_contract"] and (
        not same(prompt_ids) or not all(item.get("prompt_contract_identity_is_bound", False) for item in experiment_identities)
    ):
        gates["experiment_identity"] = "fail"
        differences.append({"code": "prompt_contract_identity_unbound_or_mismatch", "values": prompt_ids})
        remediation.append("Persist the exact worker contract as a file and bind its SHA-256; chat similarity is not an experiment identity.")

    input_consumption = [item.get("declared_inputs_consumed", False) for item in inspected]
    hard_coded = [item.get("builder", {}).get("hard_coded_authoring_marker", False) for item in inspected]
    if contract["same_semantic_packet"] and (not all(input_consumption) or any(hard_coded)):
        gates["semantic_authoring"] = "fail"
        differences.append({
            "code": "declared_semantic_packet_not_proven_consumed",
            "consumption_evidence": input_consumption,
            "hard_coded_authoring_marker": hard_coded,
        })
        remediation.append("Author one immutable semantic content packet first; the publisher must parse it and must not contain business-content arrays.")

    output_hashes = [item.get("artifact", {}).get("sha256") for item in inspected]
    if contract["byte_deterministic"] and not same(output_hashes):
        gates["deterministic_build"] = "fail"
        differences.append({"code": "artifact_hash_mismatch", "values": output_hashes})

    package_valid: list[bool] = []
    if family in {"hwpx", "docx", "pptx", "xlsx", "zip_xml_package"}:
        package_valid = [item.get("package", {}).get("zip_valid", False) for item in inspected]
        if not all(package_valid):
            gates["package_structure"] = "fail"
            differences.append({"code": "invalid_native_package", "values": package_valid})

    component_hashes = [item.get("package", {}).get("component_hashes", {}) for item in inspected]
    if contract["byte_deterministic"] and component_hashes and not same(component_hashes):
        gates["deterministic_build"] = "fail"
        differing_names: list[str] = []
        all_names = sorted(set().union(*(set(value) for value in component_hashes)))
        for name in all_names:
            if not same([value.get(name) for value in component_hashes]):
                differing_names.append(name)
        differences.append({"code": "package_component_hash_mismatch", "components": differing_names})

    if family == "hwpx":
        texts = [item.get("package", {}).get("findings", {}).get("normalized_text", "") for item in inspected]
        similarity = 1.0
        if len(texts) >= 2:
            similarity = min(SequenceMatcher(None, texts[0], value).ratio() for value in texts[1:])
        threshold = float(contract.get("minimum_text_similarity", 1.0))
        if similarity < threshold:
            gates["semantic_authoring"] = "fail"
            differences.append({"code": "normalized_text_similarity_below_threshold", "observed": round(similarity, 6), "required": threshold})
        id_sets = [item.get("package", {}).get("findings", {}).get("record_ids", []) for item in inspected]
        if contract["same_semantic_packet"] and not same(id_sets):
            gates["semantic_authoring"] = "fail"
            differences.append({
                "code": "record_id_set_mismatch",
                "values": [
                    {"count": len(value), "set_sha256": canonical_hash(value)} for value in id_sets
                ],
            })
        for item in inspected:
            findings = item.get("package", {}).get("findings", {})
            if findings.get("consecutive_page_break_pairs"):
                gates["package_structure"] = "fail"
                differences.append({
                    "code": "consecutive_page_break_risk",
                    "candidate_id": item["candidate_id"],
                    "pairs": findings["consecutive_page_break_pairs"],
                })
                remediation.append("Use one template-owned page boundary; fail closed on an added blank page-break paragraph.")
            if not findings.get("mimetype_first") or not findings.get("mimetype_stored"):
                gates["package_structure"] = "fail"
                differences.append({"code": "hwpx_mimetype_rule_failed", "candidate_id": item["candidate_id"]})

    if contract["visual_receipt_required"]:
        render_pass = [
            item.get("render", {}).get("valid", False)
            and item.get("render", {}).get("complete_surface_coverage", False)
            for item in inspected
        ]
        if not all(render_pass):
            gates["rendered_visual"] = "fail"
            differences.append({"code": "independent_complete_render_receipt_missing", "values": render_pass})
            remediation.append("Render every page, slide, or sheet and attach a separate complete-surface visual receipt.")

    # Keep the receipt metadata-only. Content text and requirement identifiers are used
    # in memory for comparison, then reduced to count/hash evidence before persistence.
    for item in inspected:
        findings = item.get("package", {}).get("findings", {})
        text_value = findings.pop("normalized_text", None)
        if text_value is not None:
            findings["normalized_text_length"] = len(text_value)
            findings["normalized_text_sha256"] = hashlib.sha256(text_value.encode("utf-8")).hexdigest().upper()
        id_value = findings.pop("record_ids", None)
        if id_value is not None:
            findings["record_id_count"] = len(id_value)
            findings["record_id_set_sha256"] = canonical_hash(id_value)

    order = ["experiment_identity", "semantic_authoring", "deterministic_build", "package_structure", "rendered_visual"]
    first_failed = next((gate for gate in order if gates[gate] == "fail"), None)
    verdict = "pass" if first_failed is None else "fail"
    receipt = {
        "schema_version": SCHEMA_VERSION,
        "fixture_id": manifest["fixture_id"],
        "format": family,
        "verdict": verdict,
        "first_failed_gate": first_failed,
        "gates": gates,
        "candidate_metadata": inspected,
        "differences": differences,
        "remediation": list(dict.fromkeys(remediation)),
        "worker_self_checks_are_acceptance": False,
        "claim_ceiling": "observed",
    }
    receipt["deterministic_receipt_hash"] = location_independent_receipt_hash(receipt)
    return receipt


def validate_manifest_shape(manifest: dict) -> None:
    required = {"schema_version", "fixture_id", "format", "comparison_contract", "candidates"}
    missing = sorted(required - set(manifest))
    if missing:
        raise ValueError(f"missing manifest keys: {missing}")
    if manifest["schema_version"] != "artifact_reproducibility_fixture_v0":
        raise ValueError("unsupported manifest schema_version")
    if len(manifest["candidates"]) < 2:
        raise ValueError("at least two candidates are required")
    contract_keys = {"same_semantic_packet", "same_template", "same_builder", "same_toolchain", "same_prompt_contract", "byte_deterministic", "visual_receipt_required"}
    if not contract_keys.issubset(manifest["comparison_contract"]):
        raise ValueError("comparison_contract is incomplete")


def run_self_test() -> int:
    with tempfile.TemporaryDirectory(prefix="artifact-repro-") as temp:
        root = Path(temp)
        packet = root / "packet.json"
        template = root / "template.bin"
        packet.write_text('{"records":[{"id":"REQ-001","text":"synthetic"}]}', encoding="utf-8")
        template.write_bytes(b"synthetic-template")
        builder = root / "builder.py"
        builder.write_text(
            "from pathlib import Path\n"
            "packet = Path('packet.json').read_text(encoding='utf-8')\n"
            "template = Path('template.bin').read_bytes()\n",
            encoding="utf-8",
        )
        artifacts = []
        receipts = []
        for index in (1, 2):
            artifact = root / f"artifact_{index}.bin"
            artifact.write_bytes(b"identical-artifact")
            render = root / f"render_{index}.json"
            render.write_text(json.dumps({"complete_surface_coverage": True, "surface_count": 1, "reviewed_surface_count": 1}), encoding="utf-8")
            artifacts.append(artifact)
            receipts.append(render)
        manifest = {
            "schema_version": "artifact_reproducibility_fixture_v0",
            "fixture_id": "synthetic_self_test_001",
            "format": "generic_binary",
            "comparison_contract": {
                "same_semantic_packet": True,
                "same_template": True,
                "same_builder": True,
                "same_toolchain": True,
                "same_prompt_contract": True,
                "byte_deterministic": True,
                "visual_receipt_required": True,
                "minimum_text_similarity": 1.0,
            },
            "candidates": [
                {"candidate_id": f"run_{index}", "artifact_ref": str(artifacts[index - 1]), "semantic_packet_refs": [str(packet)], "template_ref": str(template), "builder_ref": str(builder), "toolchain_identity": "version:synthetic-1.0", "prompt_contract_identity": "sha256:" + "A" * 64, "declared_input_refs": [str(packet), str(template)], "input_consumption_receipt_ref": None, "render_receipt_ref": str(receipts[index - 1]), "worker_self_check_ref": None}
                for index in (1, 2)
            ],
        }
        receipt_a = evaluate(manifest)
        receipt_b = evaluate(manifest)
        stable = receipt_a == receipt_b
        passed = receipt_a["verdict"] == "pass" and stable
        print(json.dumps({"self_test_pass": passed, "cold_replay_stable": stable, "receipt_hash": receipt_a["deterministic_receipt_hash"]}, ensure_ascii=False, indent=2))
        return 0 if passed else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return run_self_test()
    if not args.manifest or not args.output:
        parser.error("--manifest and --output are required unless --self-test is used")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    validate_manifest_shape(manifest)
    receipt = evaluate(manifest)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"verdict": receipt["verdict"], "first_failed_gate": receipt["first_failed_gate"], "receipt_hash": receipt["deterministic_receipt_hash"]}, ensure_ascii=False))
    return 0 if receipt["verdict"] == "pass" else 2


if __name__ == "__main__":
    sys.exit(main())

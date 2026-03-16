#!/usr/bin/env python3
"""Local CLI for Soulforge vNext canonical validation and synthetic UI state."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[4]
AGENT_ROOT = REPO_ROOT / ".agent"
UNIT_ROOT = REPO_ROOT / ".unit"
CLASS_ROOT = REPO_ROOT / ".agent_class"
WORKFLOW_ROOT = REPO_ROOT / ".workflow"
PARTY_ROOT = REPO_ROOT / ".party"
WORKSPACES_ROOT = REPO_ROOT / "_workspaces"
WORKSPACES_README = WORKSPACES_ROOT / "README.md"
LOCAL_WORKSPACE_ROOT_ENV = "SOULFORGE_LOCAL_WORKSPACE_ROOT"
LEGACY_WORKSPACE_DIRS = ("company", "personal")

SCHEMA_VERSION = "ui-state.v1"
INLINE_MAPPING_RE = re.compile(r"^[A-Za-z0-9_.-]+\s*:")
ROW_IDS = ("skills", "tools", "knowledge", "workflows")
REQUIRED_UNIT_DIRS = (
    "policy",
    "protocols",
    "runtime",
    "memory",
    "sessions",
    "autonomic",
    "artifacts",
)
REQUIRED_WORKFLOW_FILES = (
    "workflow.yaml",
    "role_slots.yaml",
    "step_graph.yaml",
    "handoff_rules.yaml",
    "monster_rules.yaml",
    "party_compatibility.yaml",
)
REQUIRED_PARTY_FILES = (
    "party.yaml",
    "member_slots.yaml",
    "allowed_species.yaml",
    "allowed_classes.yaml",
    "allowed_workflows.yaml",
    "appserver_profile.yaml",
)
REQUIRED_CLASS_FILES = (
    "class.yaml",
    "knowledge_refs.yaml",
    "skill_refs.yaml",
    "tool_refs.yaml",
)


class YamlParseError(ValueError):
    """Raised when the minimal YAML parser cannot parse a file."""


@dataclass
class Finding:
    level: str
    code: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"level": self.level, "code": self.code, "message": self.message}


def add(findings: list[Finding], level: str, code: str, message: str) -> None:
    findings.append(Finding(level=level, code=code, message=message))


def relative_to_repo(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def load_yaml(path: Path) -> Any:
    if not path.exists():
        raise FileNotFoundError(path)

    tokens: list[tuple[int, str, int]] = []
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw_line.strip():
            continue
        if raw_line.lstrip().startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        if indent % 2:
            raise YamlParseError(f"{path}: line {line_number}: indentation must use multiples of two spaces")
        tokens.append((indent, raw_line.strip(), line_number))

    if not tokens:
        return {}

    value, next_index = parse_block(path, tokens, 0, tokens[0][0])
    if next_index != len(tokens):
        _, _, line_number = tokens[next_index]
        raise YamlParseError(f"{path}: line {line_number}: unexpected trailing content")
    return value


def parse_block(
    path: Path, tokens: list[tuple[int, str, int]], index: int, indent: int
) -> tuple[Any, int]:
    current_indent, content, line_number = tokens[index]
    if current_indent != indent:
        raise YamlParseError(
            f"{path}: line {line_number}: expected indent {indent}, found {current_indent}"
        )
    if content.startswith("- "):
        return parse_list(path, tokens, index, indent)
    return parse_mapping(path, tokens, index, indent)


def parse_mapping(
    path: Path, tokens: list[tuple[int, str, int]], index: int, indent: int
) -> tuple[dict[str, Any], int]:
    mapping: dict[str, Any] = {}

    while index < len(tokens):
        current_indent, content, line_number = tokens[index]
        if current_indent < indent:
            break
        if current_indent > indent:
            raise YamlParseError(f"{path}: line {line_number}: unexpected indentation")
        if content.startswith("- "):
            break
        if ":" not in content:
            raise YamlParseError(f"{path}: line {line_number}: expected key/value pair")

        key, remainder = content.split(":", 1)
        key = key.strip()
        value_text = remainder.strip()
        index += 1

        if not key:
            raise YamlParseError(f"{path}: line {line_number}: empty mapping key")

        if value_text:
            mapping[key] = parse_scalar(value_text)
            continue

        if index < len(tokens) and tokens[index][0] > indent:
            child_indent = tokens[index][0]
            child_value, index = parse_block(path, tokens, index, child_indent)
            mapping[key] = child_value
        else:
            mapping[key] = {}

    return mapping, index


def parse_list(
    path: Path, tokens: list[tuple[int, str, int]], index: int, indent: int
) -> tuple[list[Any], int]:
    items: list[Any] = []

    while index < len(tokens):
        current_indent, content, line_number = tokens[index]
        if current_indent < indent:
            break
        if current_indent > indent:
            raise YamlParseError(f"{path}: line {line_number}: unexpected indentation in list")
        if not content.startswith("- "):
            break

        value_text = content[2:].strip()
        index += 1

        if value_text:
            if looks_like_inline_mapping(value_text):
                item, index = parse_inline_mapping_item(path, tokens, index, indent, value_text, line_number)
                items.append(item)
            else:
                items.append(parse_scalar(value_text))
            continue

        if index < len(tokens) and tokens[index][0] > indent:
            child_indent = tokens[index][0]
            child_value, index = parse_block(path, tokens, index, child_indent)
            items.append(child_value)
        else:
            items.append(None)

    return items, index


def looks_like_inline_mapping(value: str) -> bool:
    return bool(INLINE_MAPPING_RE.match(value))


def parse_inline_mapping_item(
    path: Path,
    tokens: list[tuple[int, str, int]],
    index: int,
    indent: int,
    value_text: str,
    line_number: int,
) -> tuple[dict[str, Any], int]:
    if ":" not in value_text:
        raise YamlParseError(f"{path}: line {line_number}: expected inline mapping entry")

    key, remainder = value_text.split(":", 1)
    key = key.strip()
    remainder = remainder.strip()
    if not key:
        raise YamlParseError(f"{path}: line {line_number}: empty inline mapping key")

    mapping: dict[str, Any] = {}
    if remainder:
        mapping[key] = parse_scalar(remainder)
    else:
        if index < len(tokens) and tokens[index][0] > indent:
            child_indent = tokens[index][0]
            child_value, index = parse_block(path, tokens, index, child_indent)
            mapping[key] = child_value
        else:
            mapping[key] = {}

    if index < len(tokens) and tokens[index][0] > indent:
        extra_indent = tokens[index][0]
        extra_mapping, index = parse_mapping(path, tokens, index, extra_indent)
        mapping.update(extra_mapping)

    return mapping, index


def parse_scalar(value: str) -> Any:
    if value == "true":
        return True
    if value == "false":
        return False
    if value == "null":
        return None
    if value == "[]":
        return []
    if value == "{}":
        return {}
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [parse_scalar(item.strip()) for item in split_inline_items(inner)]
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1].replace("''", "'")
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1].replace('\\"', '"')
    return value


def split_inline_items(value: str) -> list[str]:
    items: list[str] = []
    current: list[str] = []
    quote: str | None = None

    for char in value:
        if char in ("'", '"'):
            if quote is None:
                quote = char
            elif quote == char:
                quote = None
        if char == "," and quote is None:
            items.append("".join(current).strip())
            current = []
            continue
        current.append(char)

    if current:
        items.append("".join(current).strip())

    return items


def safe_load_mapping(path: Path, findings: list[Finding], code: str) -> dict[str, Any] | None:
    try:
        data = load_yaml(path)
    except FileNotFoundError:
        add(findings, "error", code, f"missing required file {relative_to_repo(path)}")
        return None
    except YamlParseError as error:
        add(findings, "error", code, str(error))
        return None

    if not isinstance(data, dict):
        add(findings, "error", code, f"{relative_to_repo(path)} must be a mapping")
        return None
    return data


def ensure_required_string(
    data: dict[str, Any],
    key: str,
    path: Path,
    findings: list[Finding],
    code: str,
) -> str | None:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        add(findings, "error", code, f"{relative_to_repo(path)} requires non-empty string field {key}")
        return None
    return value.strip()


def ensure_required_list(
    data: dict[str, Any],
    key: str,
    path: Path,
    findings: list[Finding],
    code: str,
) -> list[Any]:
    value = data.get(key)
    if not isinstance(value, list):
        add(findings, "error", code, f"{relative_to_repo(path)} requires list field {key}")
        return []
    return value


def resolve_relative_ref(base_path: Path, ref_value: str) -> Path:
    return (base_path.parent / ref_value).resolve()


def owner_status(findings: list[Finding]) -> str:
    if any(finding.level == "error" for finding in findings):
        return "error"
    if any(finding.level == "warning" for finding in findings):
        return "warning"
    return "ready"


def split_findings(findings: list[Finding]) -> tuple[list[Finding], list[Finding]]:
    warnings = [finding for finding in findings if finding.level == "warning"]
    errors = [finding for finding in findings if finding.level == "error"]
    return warnings, errors


def catalog_item(
    item_id: str,
    display_name: str,
    summary: str,
    source_ref: str,
    status: str,
    **extra: Any,
) -> dict[str, Any]:
    payload = {
        "id": item_id,
        "display_name": display_name,
        "summary": summary,
        "source_ref": source_ref,
        "status": status,
    }
    payload.update(extra)
    return payload


def load_agent_axis(findings: list[Finding]) -> dict[str, Any]:
    index_path = AGENT_ROOT / "index.yaml"
    index_data = safe_load_mapping(index_path, findings, "agent-index")
    items: list[dict[str, Any]] = []
    heroes: list[dict[str, Any]] = []

    if index_data is None:
        return {
            "root": ".agent",
            "owner": ".agent",
            "catalog_ref": ".agent/index.yaml",
            "items": [],
            "heroes": [],
        }

    owner = ensure_required_string(index_data, "owner", index_path, findings, "agent-index-owner")
    if owner and owner != ".agent":
        add(findings, "error", "agent-index-owner", f"{relative_to_repo(index_path)} owner must be .agent")

    entries = ensure_required_list(index_data, "entries", index_path, findings, "agent-index-entries")
    for entry in entries:
        if not isinstance(entry, dict):
            add(findings, "error", "agent-index-entry", f"{relative_to_repo(index_path)} entries must be mappings")
            continue
        species_id = entry.get("species_id")
        species_rel = entry.get("path")
        if not isinstance(species_id, str) or not isinstance(species_rel, str):
            add(findings, "error", "agent-index-entry", f"{relative_to_repo(index_path)} entry requires species_id and path")
            continue

        species_path = (AGENT_ROOT / species_rel).resolve()
        species_data = safe_load_mapping(species_path, findings, "species-file")
        if species_data is None:
            continue

        title = ensure_required_string(species_data, "title", species_path, findings, "species-title") or species_id
        summary = ensure_required_string(species_data, "summary", species_path, findings, "species-summary") or ""
        heroes_index_ref = ensure_required_string(species_data, "heroes_index", species_path, findings, "species-heroes-index")

        hero_count = 0
        hero_catalog_ref = None
        if heroes_index_ref is not None:
            heroes_index_path = resolve_relative_ref(species_path, heroes_index_ref)
            hero_catalog_ref = relative_to_repo(heroes_index_path)
            heroes_index = safe_load_mapping(heroes_index_path, findings, "heroes-index")
            if heroes_index is not None:
                hero_entries = ensure_required_list(
                    heroes_index, "entries", heroes_index_path, findings, "heroes-index-entries"
                )
                for hero_entry in hero_entries:
                    if not isinstance(hero_entry, dict):
                        add(findings, "error", "heroes-index-entry", f"{hero_catalog_ref} entries must be mappings")
                        continue
                    hero_id = hero_entry.get("hero_id")
                    hero_rel = hero_entry.get("path")
                    if not isinstance(hero_id, str) or not isinstance(hero_rel, str):
                        add(
                            findings,
                            "error",
                            "heroes-index-entry",
                            f"{hero_catalog_ref} entry requires hero_id and path",
                        )
                        continue
                    hero_path = resolve_relative_ref(heroes_index_path, hero_rel)
                    hero_data = safe_load_mapping(hero_path, findings, "hero-file")
                    if hero_data is None:
                        continue
                    hero_title = ensure_required_string(hero_data, "title", hero_path, findings, "hero-title") or hero_id
                    hero_summary = ensure_required_string(hero_data, "summary", hero_path, findings, "hero-summary") or ""
                    hero_species_id = ensure_required_string(
                        hero_data, "species_id", hero_path, findings, "hero-species"
                    ) or species_id
                    heroes.append(
                        catalog_item(
                            hero_id,
                            hero_title,
                            hero_summary,
                            relative_to_repo(hero_path),
                            str(hero_data.get("status", "unknown")),
                            species_id=hero_species_id,
                        )
                    )
                    hero_count += 1

        items.append(
            catalog_item(
                species_id,
                title,
                summary,
                relative_to_repo(species_path),
                str(species_data.get("status", "unknown")),
                hero_catalog_ref=hero_catalog_ref,
                hero_count=hero_count,
            )
        )

    return {
        "root": ".agent",
        "owner": ".agent",
        "catalog_ref": ".agent/index.yaml",
        "items": items,
        "heroes": heroes,
    }


def load_class_axis(findings: list[Finding]) -> dict[str, Any]:
    index_path = CLASS_ROOT / "index.yaml"
    index_data = safe_load_mapping(index_path, findings, "class-index")
    items: list[dict[str, Any]] = []

    if index_data is None:
        return {
            "root": ".agent_class",
            "owner": ".agent_class",
            "catalog_ref": ".agent_class/index.yaml",
            "items": [],
        }

    owner = ensure_required_string(index_data, "owner", index_path, findings, "class-index-owner")
    if owner and owner != ".agent_class":
        add(findings, "error", "class-index-owner", f"{relative_to_repo(index_path)} owner must be .agent_class")

    entries = ensure_required_list(index_data, "entries", index_path, findings, "class-index-entries")
    for entry in entries:
        if not isinstance(entry, dict):
            add(findings, "error", "class-index-entry", f"{relative_to_repo(index_path)} entries must be mappings")
            continue
        class_id = entry.get("class_id")
        class_rel = entry.get("path")
        if not isinstance(class_id, str) or not isinstance(class_rel, str):
            add(findings, "error", "class-index-entry", f"{relative_to_repo(index_path)} entry requires class_id and path")
            continue

        class_path = (CLASS_ROOT / class_rel).resolve()
        class_dir = class_path.parent
        class_data = safe_load_mapping(class_path, findings, "class-file")
        if class_data is None:
            continue

        class_title = ensure_required_string(class_data, "title", class_path, findings, "class-title") or class_id
        class_summary = ensure_required_string(
            class_data, "summary", class_path, findings, "class-summary"
        ) or ""

        refs_payload: dict[str, Any] = {}
        for file_name in REQUIRED_CLASS_FILES[1:]:
            ref_path = class_dir / file_name
            ref_data = safe_load_mapping(ref_path, findings, "class-ref-file")
            ref_key = file_name.replace(".yaml", "")
            refs_payload[f"{ref_key}_source_ref"] = relative_to_repo(ref_path)
            refs_payload[f"{ref_key}_count"] = 0
            if ref_data is None:
                continue
            list_key = ref_key
            ref_items = ref_data.get(list_key)
            if isinstance(ref_items, list):
                refs_payload[f"{ref_key}_count"] = len(ref_items)

        for directory_name in ("profiles", "manifests"):
            directory_path = class_dir / directory_name
            if not directory_path.is_dir():
                add(findings, "error", "class-dir", f"missing required directory {relative_to_repo(directory_path)}")
            refs_payload[f"{directory_name}_dir"] = relative_to_repo(directory_path)

        items.append(
            catalog_item(
                class_id,
                class_title,
                class_summary,
                relative_to_repo(class_path),
                str(class_data.get("status", "unknown")),
                **refs_payload,
            )
        )

    return {
        "root": ".agent_class",
        "owner": ".agent_class",
        "catalog_ref": ".agent_class/index.yaml",
        "items": items,
    }


def load_workflow_axis(findings: list[Finding]) -> dict[str, Any]:
    index_path = WORKFLOW_ROOT / "index.yaml"
    index_data = safe_load_mapping(index_path, findings, "workflow-index")
    items: list[dict[str, Any]] = []

    if index_data is None:
        return {
            "root": ".workflow",
            "owner": ".workflow",
            "catalog_ref": ".workflow/index.yaml",
            "items": [],
        }

    entries = ensure_required_list(index_data, "entries", index_path, findings, "workflow-index-entries")
    for entry in entries:
        if not isinstance(entry, dict):
            add(findings, "error", "workflow-index-entry", f"{relative_to_repo(index_path)} entries must be mappings")
            continue
        workflow_id = entry.get("workflow_id")
        workflow_rel = entry.get("path")
        if not isinstance(workflow_id, str) or not isinstance(workflow_rel, str):
            add(
                findings,
                "error",
                "workflow-index-entry",
                f"{relative_to_repo(index_path)} entry requires workflow_id and path",
            )
            continue

        workflow_path = (WORKFLOW_ROOT / workflow_rel).resolve()
        workflow_dir = workflow_path.parent
        workflow_data = safe_load_mapping(workflow_path, findings, "workflow-file")
        if workflow_data is None:
            continue

        workflow_title = ensure_required_string(
            workflow_data, "title", workflow_path, findings, "workflow-title"
        ) or workflow_id
        workflow_summary = ensure_required_string(
            workflow_data, "summary", workflow_path, findings, "workflow-summary"
        ) or ""

        refs_payload: dict[str, Any] = {}
        for file_name in REQUIRED_WORKFLOW_FILES[1:]:
            target_path = workflow_dir / file_name
            if safe_load_mapping(target_path, findings, "workflow-required-file") is not None:
                refs_payload[f"{file_name.replace('.yaml', '')}_ref"] = relative_to_repo(target_path)

        history_readme = workflow_dir / "history" / "README.md"
        if not history_readme.exists():
            add(findings, "error", "workflow-history", f"missing required file {relative_to_repo(history_readme)}")
        refs_payload["history_policy"] = "curated_summary_only"
        refs_payload["history_ref"] = relative_to_repo(history_readme)

        items.append(
            catalog_item(
                workflow_id,
                workflow_title,
                workflow_summary,
                relative_to_repo(workflow_path),
                str(workflow_data.get("status", "unknown")),
                **refs_payload,
            )
        )

    return {
        "root": ".workflow",
        "owner": ".workflow",
        "catalog_ref": ".workflow/index.yaml",
        "items": items,
    }


def load_party_axis(findings: list[Finding]) -> dict[str, Any]:
    index_path = PARTY_ROOT / "index.yaml"
    index_data = safe_load_mapping(index_path, findings, "party-index")
    items: list[dict[str, Any]] = []

    if index_data is None:
        return {
            "root": ".party",
            "owner": ".party",
            "catalog_ref": ".party/index.yaml",
            "items": [],
        }

    entries = ensure_required_list(index_data, "entries", index_path, findings, "party-index-entries")
    for entry in entries:
        if not isinstance(entry, dict):
            add(findings, "error", "party-index-entry", f"{relative_to_repo(index_path)} entries must be mappings")
            continue
        party_id = entry.get("party_id")
        party_rel = entry.get("path")
        if not isinstance(party_id, str) or not isinstance(party_rel, str):
            add(findings, "error", "party-index-entry", f"{relative_to_repo(index_path)} entry requires party_id and path")
            continue

        party_path = (PARTY_ROOT / party_rel).resolve()
        party_dir = party_path.parent
        party_data = safe_load_mapping(party_path, findings, "party-file")
        if party_data is None:
            continue

        party_title = ensure_required_string(party_data, "title", party_path, findings, "party-title") or party_id
        party_summary = ensure_required_string(party_data, "summary", party_path, findings, "party-summary") or ""

        refs_payload: dict[str, Any] = {}
        for file_name in REQUIRED_PARTY_FILES[1:]:
            target_path = party_dir / file_name
            if safe_load_mapping(target_path, findings, "party-required-file") is not None:
                refs_payload[f"{file_name.replace('.yaml', '')}_ref"] = relative_to_repo(target_path)

        stats_readme = party_dir / "stats" / "README.md"
        if not stats_readme.exists():
            add(findings, "error", "party-stats", f"missing required file {relative_to_repo(stats_readme)}")
        refs_payload["stats_policy"] = "curated_summary_only"
        refs_payload["stats_ref"] = relative_to_repo(stats_readme)

        items.append(
            catalog_item(
                party_id,
                party_title,
                party_summary,
                relative_to_repo(party_path),
                str(party_data.get("status", "unknown")),
                **refs_payload,
            )
        )

    return {
        "root": ".party",
        "owner": ".party",
        "catalog_ref": ".party/index.yaml",
        "items": items,
    }


def list_unit_dirs() -> list[Path]:
    if not UNIT_ROOT.exists():
        return []
    return [
        child
        for child in sorted(UNIT_ROOT.iterdir())
        if child.is_dir() and not child.name.startswith(".")
    ]


def load_unit_axis(findings: list[Finding]) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    for unit_dir in list_unit_dirs():
        unit_path = unit_dir / "unit.yaml"
        unit_data = safe_load_mapping(unit_path, findings, "unit-file")
        if unit_data is None:
            continue

        unit_id = ensure_required_string(unit_data, "unit_id", unit_path, findings, "unit-id") or unit_dir.name
        title = ensure_required_string(unit_data, "title", unit_path, findings, "unit-title") or unit_id

        for required_dir in REQUIRED_UNIT_DIRS:
            required_path = unit_dir / required_dir
            if not required_path.is_dir():
                add(findings, "error", "unit-dir", f"missing required directory {relative_to_repo(required_path)}")
            readme_path = required_path / "README.md"
            if required_path.exists() and not readme_path.exists():
                add(findings, "error", "unit-readme", f"missing required file {relative_to_repo(readme_path)}")

        items.append(
            catalog_item(
                unit_id,
                title,
                "",
                relative_to_repo(unit_path),
                str(unit_data.get("status", "unknown")),
                species_ref=unit_data.get("species_ref"),
                hero_ref=unit_data.get("hero_ref"),
                class_package_refs=unit_data.get("class_package_refs") if isinstance(unit_data.get("class_package_refs"), list) else [],
                workflow_refs=unit_data.get("workflow_refs") if isinstance(unit_data.get("workflow_refs"), list) else [],
                party_template_refs=unit_data.get("party_template_refs") if isinstance(unit_data.get("party_template_refs"), list) else [],
                required_dirs=list(REQUIRED_UNIT_DIRS),
            )
        )

    return {
        "root": ".unit",
        "owner": ".unit",
        "items": items,
    }


def build_lookup(items: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    by_id: dict[str, dict[str, Any]] = {}
    by_ref: dict[str, dict[str, Any]] = {}
    for item in items:
        item_id = item.get("id")
        source_ref = item.get("source_ref")
        if isinstance(item_id, str):
            by_id[item_id] = item
        if isinstance(source_ref, str):
            by_ref[source_ref] = item
    return by_id, by_ref


def validate_cross_refs(
    findings: list[Finding],
    species_axis: dict[str, Any],
    unit_axis: dict[str, Any],
    class_axis: dict[str, Any],
    workflow_axis: dict[str, Any],
    party_axis: dict[str, Any],
) -> None:
    species_by_id, species_by_ref = build_lookup(species_axis["items"])
    hero_by_id, hero_by_ref = build_lookup(species_axis["heroes"])
    class_by_id, class_by_ref = build_lookup(class_axis["items"])
    workflow_by_id, workflow_by_ref = build_lookup(workflow_axis["items"])
    party_by_id, party_by_ref = build_lookup(party_axis["items"])

    for unit in unit_axis["items"]:
        unit_ref = unit["source_ref"]
        species_ref = unit.get("species_ref")
        hero_ref = unit.get("hero_ref")
        if isinstance(species_ref, str) and species_ref not in species_by_ref:
            add(findings, "error", "unit-species-ref", f"{unit_ref} species_ref {species_ref} does not resolve")
        if isinstance(hero_ref, str) and hero_ref not in hero_by_ref:
            add(findings, "error", "unit-hero-ref", f"{unit_ref} hero_ref {hero_ref} does not resolve")
        for class_ref in unit.get("class_package_refs", []):
            if isinstance(class_ref, str) and class_ref not in class_by_ref:
                add(findings, "error", "unit-class-ref", f"{unit_ref} class_package_ref {class_ref} does not resolve")
        for workflow_ref in unit.get("workflow_refs", []):
            if isinstance(workflow_ref, str) and workflow_ref not in workflow_by_ref:
                add(findings, "error", "unit-workflow-ref", f"{unit_ref} workflow_ref {workflow_ref} does not resolve")
        for party_ref in unit.get("party_template_refs", []):
            if isinstance(party_ref, str) and party_ref not in party_by_ref:
                add(findings, "error", "unit-party-ref", f"{unit_ref} party_template_ref {party_ref} does not resolve")

    for workflow in workflow_axis["items"]:
        party_compatibility_ref = workflow.get("party_compatibility_ref")
        if not isinstance(party_compatibility_ref, str):
            continue
        compatibility_path = REPO_ROOT / party_compatibility_ref
        compatibility_data = safe_load_mapping(compatibility_path, findings, "workflow-party-compatibility")
        if compatibility_data is None:
            continue
        for party_id in compatibility_data.get("compatible_party_ids", []):
            if isinstance(party_id, str) and party_id not in party_by_id:
                add(
                    findings,
                    "error",
                    "workflow-party-ref",
                    f"{party_compatibility_ref} compatible_party_id {party_id} does not resolve",
                )

    for party in party_axis["items"]:
        source_ref = party["source_ref"]
        for key, lookup, file_suffix in (
            ("allowed_species_ref", species_by_id, "allowed_species"),
            ("allowed_classes_ref", class_by_id, "allowed_classes"),
            ("allowed_workflows_ref", workflow_by_id, "allowed_workflows"),
        ):
            ref = party.get(key)
            if not isinstance(ref, str):
                continue
            target_path = REPO_ROOT / ref
            target_data = safe_load_mapping(target_path, findings, f"party-{file_suffix}")
            if target_data is None:
                continue
            list_key = {
                "allowed_species_ref": "species_ids",
                "allowed_classes_ref": "class_ids",
                "allowed_workflows_ref": "workflow_ids",
            }[key]
            values = target_data.get(list_key)
            if not isinstance(values, list):
                add(findings, "error", f"party-{file_suffix}", f"{ref} requires list field {list_key}")
                continue
            for item_id in values:
                if isinstance(item_id, str) and item_id not in lookup:
                    add(findings, "error", f"party-{file_suffix}", f"{source_ref} references unknown id {item_id}")


def resolve_local_workspace_root(workspace_root: str | None) -> tuple[Path, str]:
    if workspace_root is not None and workspace_root.strip():
        return Path(workspace_root).expanduser().resolve(), "cli"

    env_value = os.environ.get(LOCAL_WORKSPACE_ROOT_ENV)
    if env_value and env_value.strip():
        return Path(env_value).expanduser().resolve(), "env"

    return WORKSPACES_ROOT, "repo_default"


def render_workspace_root_ref(path: Path) -> str:
    try:
        return relative_to_repo(path)
    except ValueError:
        return path.as_posix()


def load_workspaces_axis(
    findings: list[Finding],
    local_scan: bool,
    workspace_root: str | None = None,
) -> dict[str, Any]:
    if not WORKSPACES_README.exists():
        add(findings, "error", "workspaces-readme", "missing required file _workspaces/README.md")

    projects: list[dict[str, Any]] = []
    local_root_ref = None
    local_root_source = None
    if local_scan:
        local_root, local_root_source = resolve_local_workspace_root(workspace_root)
        local_root_ref = render_workspace_root_ref(local_root)
        if not local_root.exists():
            add(
                findings,
                "error",
                "workspace-root-missing",
                f"local workspace root does not exist: {local_root_ref}",
            )
        elif not local_root.is_dir():
            add(
                findings,
                "error",
                "workspace-root-type",
                f"local workspace root must be a directory: {local_root_ref}",
            )
        else:
            if local_root == WORKSPACES_ROOT:
                add(
                    findings,
                    "warning",
                    "workspace-root-default",
                    "local smoke uses repo _workspaces/ by default; prefer --workspace-root or SOULFORGE_LOCAL_WORKSPACE_ROOT for a private mission site mount.",
                )

        if local_root.exists() and local_root.is_dir():
            for child in sorted(local_root.iterdir()):
                if not child.is_dir() or child.name.startswith("."):
                    continue
                if local_root == WORKSPACES_ROOT and child.name in LEGACY_WORKSPACE_DIRS:
                    add(
                        findings,
                        "warning",
                        "legacy-workspace-bridge",
                        f"skipping legacy bridge directory during local smoke scan: {render_workspace_root_ref(child)}",
                    )
                    continue
                project_agent_dir = child / ".project_agent"
                project_state = "local_detected"
                if project_agent_dir.is_dir():
                    project_state = "project_agent_present"
                projects.append(
                    {
                        "project_code": child.name,
                        "project_root_ref": render_workspace_root_ref(child),
                        "state": project_state,
                        "project_agent_present": project_agent_dir.is_dir(),
                    }
                )

    return {
        "root": "_workspaces",
        "owner": "_workspaces",
        "mode": "local_only_mount",
        "mount_status": "reserved_public_root",
        "local_scan_enabled": local_scan,
        "local_workspace_root": local_root_ref,
        "local_workspace_root_source": local_root_source,
        "projects": projects,
        "notes": [
            "Public repo payloads do not require _workspaces/<project_code>/ materialization.",
            "Local mission site inspection is opt-in and never used by repo fixtures.",
            f"Opt-in local smoke root can be provided via --workspace-root or {LOCAL_WORKSPACE_ROOT_ENV}.",
        ],
    }


def build_overview_payload(
    findings: list[Finding],
    species_axis: dict[str, Any],
    unit_axis: dict[str, Any],
    class_axis: dict[str, Any],
    workflow_axis: dict[str, Any],
    workspaces_axis: dict[str, Any],
) -> dict[str, Any]:
    _, species_by_ref = build_lookup(species_axis["items"])
    _, hero_by_ref = build_lookup(species_axis["heroes"])
    class_by_id, class_by_ref = build_lookup(class_axis["items"])
    active_unit = unit_axis["items"][0] if unit_axis["items"] else None
    active_species = species_by_ref.get(active_unit.get("species_ref")) if active_unit else None
    active_hero = hero_by_ref.get(active_unit.get("hero_ref")) if active_unit else None

    active_class_id = None
    if active_unit:
        class_refs = active_unit.get("class_package_refs", [])
        if class_refs and isinstance(class_refs[0], str):
            class_item = class_by_ref.get(class_refs[0])
            if class_item:
                active_class_id = class_item["id"]

    active_workflow_count = 0
    if active_unit:
        workflow_refs = active_unit.get("workflow_refs", [])
        active_workflow_count = len([ref for ref in workflow_refs if isinstance(ref, str)])

    warnings, errors = split_findings(findings)

    return {
        "body_id": None,
        "class_id": active_class_id,
        "active_profile": None,
        "active_species": identity_ref(active_species, True),
        "active_hero": identity_ref(active_hero, active_hero is not None),
        "sections_present": {
            "present": sum(
                1
                for axis in (species_axis, unit_axis, class_axis, workflow_axis, workspaces_axis)
                if axis.get("items") or axis is workspaces_axis
            ),
            "total": 5,
        },
        "installed_counts": {
            "skills": 0,
            "tools": 0,
            "knowledge": 0,
            "workflows": len(workflow_axis["items"]),
        },
        "equipped_counts": {
            "skills": 0,
            "tools": 0,
            "knowledge": 0,
            "workflows": active_workflow_count,
        },
        "workspace_counts": {
            "total": len(workspaces_axis["projects"]),
            "bound": 0,
            "unbound": 0,
            "invalid": 0,
        },
        "warnings": len(warnings),
        "errors": len(errors),
        "overall_status": owner_status(findings),
        "status_note": "vNext derived state uses unit-owned bindings and local-only synthetic workspace summaries.",
    }


def identity_ref(item: dict[str, Any] | None, active: bool) -> dict[str, Any] | None:
    if item is None:
        return None
    return {
        "id": item["id"],
        "display_name": item["display_name"],
        "summary": item["summary"],
        "source_ref": item["source_ref"],
        "active": active,
    }


def build_body_payload(unit_axis: dict[str, Any], overview: dict[str, Any], workspaces_axis: dict[str, Any]) -> dict[str, Any]:
    active_unit = unit_axis["items"][0] if unit_axis["items"] else None
    section_presence = []
    section_summaries = []
    if active_unit is not None:
        for required_dir in REQUIRED_UNIT_DIRS:
            path = Path(active_unit["source_ref"]).parent / required_dir
            repo_path = path.as_posix()
            section_presence.append(
                {
                    "id": required_dir,
                    "path": repo_path,
                    "present": True,
                    "status": "present",
                }
            )
            section_summaries.append(
                {
                    "section_id": required_dir,
                    "title": required_dir.replace("_", " ").title(),
                    "summary": f"Unit-owned {required_dir} template surface.",
                    "status": "present",
                    "present": True,
                }
            )

    return {
        "meta": {
            "body_id": None,
            "display_name": active_unit["display_name"] if active_unit else None,
            "version": None,
            "operating_context": "unit_owner_projection",
            "status": "ready",
        },
        "active_species": overview["active_species"],
        "active_hero": overview["active_hero"],
        "section_presence": section_presence,
        "section_summaries": section_summaries,
        "current_bindings": {
            "class_binding": {
                "status": "present" if overview["class_id"] else "inactive",
                "class_id": overview["class_id"],
                "active_profile": None,
            },
            "workspace_binding": {
                "status": "inactive" if not workspaces_axis["local_scan_enabled"] else "present",
                "active_workspace": None,
                "candidate_count": len(workspaces_axis["projects"]),
            },
            "precedence": [
                ".unit owns active bindings",
                ".agent_class provides reusable packages only",
                "_workspaces is opt-in local-only mount",
            ],
        },
    }


def row_item(
    item_id: str,
    display_name: str,
    summary: str,
    source_ref: str,
    category: str,
    *,
    installed: bool,
    equipped: bool,
) -> dict[str, Any]:
    return {
        "id": item_id,
        "display_name": display_name,
        "summary": summary,
        "installed": installed,
        "equipped": equipped,
        "active": equipped,
        "required": equipped,
        "preferred": False,
        "dependency_status": "resolved" if equipped else "unknown",
        "family": None,
        "category": category,
        "source_ref": source_ref,
        "source_hint": "vnext-template",
        "catalog_ref": source_ref,
        "selectable_candidate": installed,
    }


def build_class_view_payload(unit_axis: dict[str, Any], class_axis: dict[str, Any], workflow_axis: dict[str, Any]) -> dict[str, Any]:
    active_unit = unit_axis["items"][0] if unit_axis["items"] else None
    _, class_by_ref = build_lookup(class_axis["items"])
    _, workflow_by_ref = build_lookup(workflow_axis["items"])

    active_class = None
    equipped_workflow_refs: set[str] = set()
    if active_unit:
        class_refs = active_unit.get("class_package_refs", [])
        if class_refs and isinstance(class_refs[0], str):
            active_class = class_by_ref.get(class_refs[0])
        equipped_workflow_refs = {
            ref for ref in active_unit.get("workflow_refs", []) if isinstance(ref, str)
        }

    rows = {row_id: [] for row_id in ROW_IDS}
    for workflow in workflow_axis["items"]:
        workflow_ref = workflow["source_ref"]
        rows["workflows"].append(
            row_item(
                workflow["id"],
                workflow["display_name"],
                workflow["summary"],
                workflow_ref,
                "workflow",
                installed=True,
                equipped=workflow_ref in equipped_workflow_refs,
            )
        )

    return {
        "class_id": active_class["id"] if active_class else None,
        "class_name": active_class["display_name"] if active_class else None,
        "class_version": None,
        "active_profile": None,
        "rows": rows,
        "row_order": list(ROW_IDS),
        "legend": [
            {"id": "installed", "label": "Installed", "summary": "Reusable canon present in catalog."},
            {"id": "equipped", "label": "Equipped", "summary": "Referenced by the active unit owner."},
        ],
    }


def build_catalogs_payload(species_axis: dict[str, Any], workflow_axis: dict[str, Any]) -> dict[str, Any]:
    return {
        "identity": {
            "status": "present",
            "species_candidates": [identity_ref(item, False) for item in species_axis["items"]],
            "hero_candidates": [identity_ref(item, False) for item in species_axis["heroes"]],
        },
        "class": {
            "status": "present",
            "profiles_catalog": [],
            "skills_catalog": [],
            "tools_catalog": [],
            "knowledge_catalog": [],
            "workflows_catalog": [identity_ref(item, False) for item in workflow_axis["items"]],
        },
    }


def build_diagnostics_payload(findings: list[Finding]) -> dict[str, Any]:
    warnings, errors = split_findings(findings)
    highest = "ok"
    if errors:
        highest = "error"
    elif warnings:
        highest = "warning"
    return {
        "summary": {
            "warnings": len(warnings),
            "errors": len(errors),
            "highest_severity": highest,
        },
        "warnings": [
            {
                "code": finding.code,
                "message": finding.message,
                "severity": "warning",
                "location_hint": None,
            }
            for finding in warnings
        ],
        "errors": [
            {
                "code": finding.code,
                "message": finding.message,
                "severity": "error",
                "location_hint": None,
            }
            for finding in errors
        ],
    }


def build_ui_hints(default_tab: str | None = None) -> dict[str, Any]:
    return {
        "theme": "adventurers-desk",
        "phase": "vnext-canon",
        "default_tab": default_tab or "overview",
        "layout": {
            "left_ratio": 0.32,
            "right_ratio": 0.68,
            "gutter_ratio": 0.04,
        },
        "material_hints": {
            "species": "catalog parchment",
            "units": "owner dossier",
            "classes": "package ledger",
            "workflows": "canon grimoire",
            "parties": "template roster",
            "workspaces": "sealed mission mount",
        },
        "icon_hints": {
            "species": "leaf",
            "units": "shield",
            "classes": "hammer",
            "workflows": "map",
            "parties": "banner",
            "workspaces": "lock",
        },
        "renderer_notes": [
            "Legacy body/class/workspaces panels remain compatibility projections only.",
            "Authoritative payload surface is the vNext 6-axis top level.",
        ],
    }


def build_derived_state(
    local_scan: bool,
    default_tab: str | None = None,
    workspace_root: str | None = None,
) -> tuple[dict[str, Any], list[Finding]]:
    findings: list[Finding] = []
    species_axis = load_agent_axis(findings)
    unit_axis = load_unit_axis(findings)
    class_axis = load_class_axis(findings)
    workflow_axis = load_workflow_axis(findings)
    party_axis = load_party_axis(findings)
    validate_cross_refs(findings, species_axis, unit_axis, class_axis, workflow_axis, party_axis)
    workspaces_axis = load_workspaces_axis(findings, local_scan, workspace_root)

    overview = build_overview_payload(
        findings, species_axis, unit_axis, class_axis, workflow_axis, workspaces_axis
    )
    body = build_body_payload(unit_axis, overview, workspaces_axis)
    class_view = build_class_view_payload(unit_axis, class_axis, workflow_axis)
    diagnostics = build_diagnostics_payload(findings)

    payload = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": None,
        "source": {
            "producer": "ui_sync.py",
            "mode": "integration",
            "adapter": "vnext-6-axis",
            "fixture_name": None,
            "notes": [
                "Canonical source is the vNext 6-axis owner model.",
                "Public repo mode does not materialize or scan _workspaces/<project_code> unless explicitly requested.",
            ],
        },
        "species": species_axis,
        "units": unit_axis,
        "classes": class_axis,
        "workflows": workflow_axis,
        "parties": party_axis,
        "workspaces": workspaces_axis,
        "overview": overview,
        "body": body,
        "class_view": class_view,
        "catalogs": build_catalogs_payload(species_axis, workflow_axis),
        "diagnostics": diagnostics,
        "ui_hints": build_ui_hints(default_tab),
    }
    return payload, findings


def render_validation_text(payload: dict[str, Any], findings: list[Finding]) -> str:
    warnings, errors = split_findings(findings)
    lines = [
        "Soulforge vNext validation",
        f"  species: {len(payload['species']['items'])}",
        f"  units: {len(payload['units']['items'])}",
        f"  classes: {len(payload['classes']['items'])}",
        f"  workflows: {len(payload['workflows']['items'])}",
        f"  parties: {len(payload['parties']['items'])}",
        f"  workspaces mode: {payload['workspaces']['mode']}",
        f"  local workspace scan: {'enabled' if payload['workspaces']['local_scan_enabled'] else 'disabled'}",
        f"  warnings: {len(warnings)}",
        f"  errors: {len(errors)}",
    ]
    if warnings:
        lines.append("Warnings:")
        lines.extend(f"  - [{finding.code}] {finding.message}" for finding in warnings)
    if errors:
        lines.append("Errors:")
        lines.extend(f"  - [{finding.code}] {finding.message}" for finding in errors)
    return "\n".join(lines)


def render_workspaces_text(workspaces: dict[str, Any]) -> str:
    lines = [
        "Soulforge vNext workspace summary",
        f"  mode: {workspaces['mode']}",
        f"  local_scan_enabled: {str(workspaces['local_scan_enabled']).lower()}",
        f"  local_workspace_root: {workspaces['local_workspace_root'] or '-'}",
        f"  local_workspace_root_source: {workspaces['local_workspace_root_source'] or '-'}",
        f"  project_count: {len(workspaces['projects'])}",
    ]
    for project in workspaces["projects"]:
        lines.append(
            f"  - {project['project_code']} ({project['state']}, project_agent_present={str(project['project_agent_present']).lower()})"
        )
    return "\n".join(lines)


def render_loadout_text(payload: dict[str, Any]) -> str:
    return "\n".join(
        [
            "Soulforge vNext class/package resolve",
            "  note: loadout semantics were removed from canon; this command now reports reusable package state only.",
            f"  classes: {len(payload['classes']['items'])}",
            f"  workflows: {len(payload['workflows']['items'])}",
            f"  parties: {len(payload['parties']['items'])}",
        ]
    )


def run_sync_body_state(check: bool, as_json: bool) -> int:
    payload = {
        "status": "noop",
        "message": ".agent/body_state.yaml is no longer canonical in vNext; sync-body-state performs no mutation.",
        "check": check,
    }
    if as_json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(payload["message"])
    return 0


def run_resolve_loadout(as_json: bool) -> int:
    payload, findings = build_derived_state(local_scan=False)
    result = {
        "summary": {
            "classes": len(payload["classes"]["items"]),
            "workflows": len(payload["workflows"]["items"]),
            "parties": len(payload["parties"]["items"]),
            "warnings": len([finding for finding in findings if finding.level == "warning"]),
            "errors": len([finding for finding in findings if finding.level == "error"]),
        },
        "classes": payload["classes"],
        "workflows": payload["workflows"],
        "parties": payload["parties"],
    }
    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(render_loadout_text(payload))
    return 1 if result["summary"]["errors"] else 0


def run_resolve_workspaces(as_json: bool, local_scan: bool, workspace_root: str | None) -> int:
    findings: list[Finding] = []
    workspaces = load_workspaces_axis(findings, local_scan, workspace_root)
    result = {
        "workspaces": workspaces,
        "summary": {
            "project_count": len(workspaces["projects"]),
            "mode": workspaces["mode"],
            "local_scan_enabled": workspaces["local_scan_enabled"],
            "warnings": len([finding for finding in findings if finding.level == "warning"]),
            "errors": len([finding for finding in findings if finding.level == "error"]),
        },
        "findings": [finding.as_dict() for finding in findings],
    }
    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(render_workspaces_text(workspaces))
    return 1 if result["summary"]["errors"] else 0


def run_validate(as_json: bool, local_scan: bool, workspace_root: str | None) -> int:
    payload, findings = build_derived_state(local_scan=local_scan, workspace_root=workspace_root)
    warnings, errors = split_findings(findings)
    result = {
        "summary": {
            "species": len(payload["species"]["items"]),
            "units": len(payload["units"]["items"]),
            "classes": len(payload["classes"]["items"]),
            "workflows": len(payload["workflows"]["items"]),
            "parties": len(payload["parties"]["items"]),
            "workspace_projects": len(payload["workspaces"]["projects"]),
            "warnings": len(warnings),
            "errors": len(errors),
        },
        "findings": [finding.as_dict() for finding in findings],
        "axes": {
            "species": payload["species"],
            "units": payload["units"],
            "classes": payload["classes"],
            "workflows": payload["workflows"],
            "parties": payload["parties"],
            "workspaces": payload["workspaces"],
        },
    }
    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(render_validation_text(payload, findings))
    return 1 if errors else 0


def run_derive_ui_state(
    as_json: bool,
    local_scan: bool,
    default_tab: str | None,
    workspace_root: str | None,
) -> int:
    payload, findings = build_derived_state(
        local_scan=local_scan,
        default_tab=default_tab,
        workspace_root=workspace_root,
    )
    if as_json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(render_validation_text(payload, findings))
    return 1 if any(finding.level == "error" for finding in findings) else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Soulforge vNext canonical validator and UI state producer")
    subparsers = parser.add_subparsers(dest="command", required=True)

    sync_parser = subparsers.add_parser(
        "sync-body-state",
        help="Deprecated no-op kept for compatibility. body_state is no longer canonical.",
    )
    sync_parser.add_argument("--check", action="store_true")
    sync_parser.add_argument("--json", action="store_true")

    resolve_parser = subparsers.add_parser(
        "resolve-loadout",
        help="Compatibility alias that reports reusable class/workflow/party surfaces without loadout semantics.",
    )
    resolve_parser.add_argument("--json", action="store_true")

    resolve_workspaces_parser = subparsers.add_parser(
        "resolve-workspaces",
        help="Report local-only workspace mount status. Local project scan is opt-in.",
    )
    resolve_workspaces_parser.add_argument("--json", action="store_true")
    resolve_workspaces_parser.add_argument("--local-workspaces", action="store_true")
    resolve_workspaces_parser.add_argument("--workspace-root", default=None)

    derive_parser = subparsers.add_parser(
        "derive-ui-state",
        help="Emit the vNext 6-axis derived UI payload with compatibility projections.",
    )
    derive_parser.add_argument("--json", action="store_true")
    derive_parser.add_argument("--local-workspaces", action="store_true")
    derive_parser.add_argument("--workspace-root", default=None)
    derive_parser.add_argument(
        "--default-tab",
        choices=("overview", "body", "class", "workspaces"),
        default=None,
    )

    validate_parser = subparsers.add_parser(
        "validate",
        help="Validate the vNext owner roots. Local workspace scan is opt-in.",
    )
    validate_parser.add_argument("--json", action="store_true")
    validate_parser.add_argument("--local-workspaces", action="store_true")
    validate_parser.add_argument("--workspace-root", default=None)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "sync-body-state":
        return run_sync_body_state(check=args.check, as_json=args.json)
    if args.command == "resolve-loadout":
        return run_resolve_loadout(as_json=args.json)
    if args.command == "resolve-workspaces":
        return run_resolve_workspaces(
            as_json=args.json,
            local_scan=args.local_workspaces,
            workspace_root=args.workspace_root,
        )
    if args.command == "validate":
        return run_validate(
            as_json=args.json,
            local_scan=args.local_workspaces,
            workspace_root=args.workspace_root,
        )
    if args.command == "derive-ui-state":
        return run_derive_ui_state(
            as_json=args.json,
            local_scan=args.local_workspaces,
            default_tab=args.default_tab,
            workspace_root=args.workspace_root,
        )

    parser.error(f"unknown command {args.command}")
    return 2


if __name__ == "__main__":
    sys.exit(main())

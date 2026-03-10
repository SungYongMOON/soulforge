#!/usr/bin/env python3
"""Local CLI for body state synchronization and metadata validation."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[4]
AGENT_ROOT = REPO_ROOT / ".agent"
CLASS_ROOT = REPO_ROOT / ".agent_class"
BODY_YAML = AGENT_ROOT / "body.yaml"
BODY_STATE_YAML = AGENT_ROOT / "body_state.yaml"
CLASS_YAML = CLASS_ROOT / "class.yaml"
LOADOUT_YAML = CLASS_ROOT / "loadout.yaml"
REQUIRED_BODY_STATE_KEYS = ("body_id", "sections", "status")
MODULE_LIBRARY_KEYS = ("skills", "tools", "workflows", "knowledge")
REQUIRED_MODULE_KEYS = MODULE_LIBRARY_KEYS + ("docs",)
REQUIRED_EQUIPPED_KEYS = MODULE_LIBRARY_KEYS
REQUIRED_BINDING_KEYS = ("body", "company_workspace", "personal_workspace")
MODULE_KIND_BY_LIBRARY_KEY = {
    "skills": "skill",
    "tools": "tool",
    "workflows": "workflow",
    "knowledge": "knowledge",
}
COMMON_MANIFEST_KEYS = ("id", "kind", "name", "version", "description")
WORKFLOW_REQUIRE_KEYS = ("skills", "tools", "knowledge")
TOOL_FAMILIES = ("adapters", "connectors", "local_cli", "mcp")
PATH_LIKE_SUFFIXES = (".yaml", ".yml", ".py")


class YamlParseError(ValueError):
    """Raised when the minimal YAML parser cannot parse a file."""


@dataclass
class Finding:
    level: str
    code: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"level": self.level, "code": self.code, "message": self.message}


@dataclass
class ModuleRecord:
    module_id: str
    kind: str
    manifest_path: Path
    name: str
    version: str
    description: str
    entrypoint: str | None = None
    family: str | None = None
    content_path: str | None = None
    requires: dict[str, list[str]] | None = None

    def as_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": self.module_id,
            "kind": self.kind,
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "manifest_path": relative_to_repo(self.manifest_path),
        }
        if self.entrypoint is not None:
            payload["entrypoint"] = self.entrypoint
        if self.family is not None:
            payload["family"] = self.family
        if self.content_path is not None:
            payload["content_path"] = self.content_path
        if self.requires is not None:
            payload["requires"] = self.requires
        return payload


@dataclass
class ResolveResult:
    findings: list[Finding]
    catalog: dict[str, dict[str, ModuleRecord]]
    duplicate_ids: dict[str, set[str]]
    equipped_requested: dict[str, list[str]]
    equipped_resolved: dict[str, list[ModuleRecord]]
    class_id: str | None
    active_profile: str | None


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
            items.append(parse_scalar(value_text))
            continue

        if index < len(tokens) and tokens[index][0] > indent:
            child_indent = tokens[index][0]
            child_value, index = parse_block(path, tokens, index, child_indent)
            items.append(child_value)
        else:
            items.append(None)

    return items, index


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


def dump_yaml(value: Any, indent: int = 0) -> str:
    lines = render_yaml(value, indent)
    return "\n".join(lines) + "\n"


def render_yaml(value: Any, indent: int) -> list[str]:
    prefix = " " * indent

    if isinstance(value, dict):
        lines: list[str] = []
        for key, item in value.items():
            if isinstance(item, dict):
                if item:
                    lines.append(f"{prefix}{key}:")
                    lines.extend(render_yaml(item, indent + 2))
                else:
                    lines.append(f"{prefix}{key}: {{}}")
            elif isinstance(item, list):
                if item:
                    lines.append(f"{prefix}{key}:")
                    lines.extend(render_yaml(item, indent + 2))
                else:
                    lines.append(f"{prefix}{key}: []")
            else:
                lines.append(f"{prefix}{key}: {format_scalar(item)}")
        return lines

    if isinstance(value, list):
        lines = []
        for item in value:
            if isinstance(item, dict):
                lines.append(f"{prefix}-")
                lines.extend(render_yaml(item, indent + 2))
            elif isinstance(item, list):
                if item:
                    lines.append(f"{prefix}-")
                    lines.extend(render_yaml(item, indent + 2))
                else:
                    lines.append(f"{prefix}- []")
            else:
                lines.append(f"{prefix}- {format_scalar(item)}")
        return lines

    return [f"{prefix}{format_scalar(value)}"]


def format_scalar(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    if isinstance(value, str):
        if value == "":
            return "''"
        safe = all(ch.isalnum() or ch in "._-/" for ch in value)
        if safe:
            return value
        return "'" + value.replace("'", "''") + "'"
    return str(value)


def make_body_state(body_data: dict[str, Any]) -> dict[str, Any]:
    body_id = body_data.get("id")
    if not isinstance(body_id, str) or not body_id:
        raise YamlParseError(f"{BODY_YAML}: id must be a non-empty string")

    sections = body_data.get("sections")
    if not isinstance(sections, dict):
        raise YamlParseError(f"{BODY_YAML}: sections must be a mapping")

    state_sections: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []

    for section_name, relative_path in sections.items():
        if not isinstance(relative_path, str):
            raise YamlParseError(f"{BODY_YAML}: sections.{section_name} must be a string path")
        present = (AGENT_ROOT / relative_path).is_dir()
        state_sections[section_name] = {"path": relative_path, "present": present}
        if not present:
            warnings.append(f"missing section: {section_name} ({relative_path})")

    summary = "ready" if not warnings else "degraded"
    return {
        "body_id": body_id,
        "sections": state_sections,
        "status": {
            "summary": summary,
            "warnings": warnings,
        },
    }


def compare_text(path: Path, expected_text: str) -> bool:
    if not path.exists():
        return False
    return path.read_text(encoding="utf-8") == expected_text


def add(finding_list: list[Finding], level: str, code: str, message: str) -> None:
    finding_list.append(Finding(level=level, code=code, message=message))


def relative_to_repo(path: Path) -> str:
    return str(path.relative_to(REPO_ROOT))


def load_required_mapping(path: Path) -> dict[str, Any]:
    data = load_yaml(path)
    if not isinstance(data, dict):
        raise YamlParseError(f"{path}: root must be a mapping")
    return data


def validate_repo() -> tuple[list[Finding], ResolveResult | None]:
    findings: list[Finding] = []

    body_data = load_optional_yaml(BODY_YAML, findings, "body_yaml_missing", "body metadata exists")
    body_state_data = load_optional_yaml(
        BODY_STATE_YAML, findings, "body_state_missing", "body state metadata exists"
    )

    actual_presence_by_path: dict[str, bool] = {}
    expected_body_state: dict[str, Any] | None = None

    if isinstance(body_data, dict):
        validate_body(body_data, findings, actual_presence_by_path)
        if "id" in body_data and isinstance(body_data.get("sections"), dict):
            expected_body_state = make_body_state(body_data)

    if isinstance(body_data, dict) and isinstance(body_state_data, dict):
        validate_body_state(body_data, body_state_data, actual_presence_by_path, findings, expected_body_state)

    class_data = load_optional_yaml(CLASS_YAML, findings, "class_yaml_missing", "class metadata exists")
    loadout_data = load_optional_yaml(
        LOADOUT_YAML, findings, "loadout_yaml_missing", "loadout metadata exists"
    )

    resolve_result: ResolveResult | None = None
    if isinstance(class_data, dict) and isinstance(loadout_data, dict):
        resolve_result = resolve_loadout_contract(class_data, loadout_data)
        findings.extend(resolve_result.findings)
    else:
        if isinstance(class_data, dict):
            validate_class_modules(class_data, findings)
        if isinstance(loadout_data, dict):
            validate_loadout_structure(loadout_data, findings)

    return findings, resolve_result


def load_optional_yaml(
    path: Path, findings: list[Finding], missing_code: str, pass_message: str
) -> dict[str, Any] | None:
    if not path.exists():
        add(findings, "FAIL", missing_code, f"missing required file: {relative_to_repo(path)}")
        return None

    try:
        data = load_yaml(path)
    except (FileNotFoundError, YamlParseError) as error:
        add(findings, "FAIL", f"{path.name}_parse_error", str(error))
        return None

    if not isinstance(data, dict):
        add(findings, "FAIL", f"{path.name}_root_type", f"{relative_to_repo(path)} root must be a mapping")
        return None

    add(findings, "PASS", f"{path.name}_exists", pass_message)
    return data


def validate_body(
    body_data: dict[str, Any], findings: list[Finding], actual_presence_by_path: dict[str, bool]
) -> None:
    sections = body_data.get("sections")
    if not isinstance(sections, dict):
        add(findings, "FAIL", "body_sections_type", "body.yaml sections must be a mapping")
        return

    section_paths = list(sections.values())
    if not all(isinstance(path, str) for path in section_paths):
        add(findings, "FAIL", "body_sections_path_type", "every body.yaml section path must be a string")
        return

    duplicates = [path for path, count in Counter(section_paths).items() if count > 1]
    if duplicates:
        duplicate_list = ", ".join(sorted(duplicates))
        add(findings, "FAIL", "body_sections_duplicate_path", f"duplicate body section paths: {duplicate_list}")
    else:
        add(findings, "PASS", "body_sections_unique", "body section paths are unique")

    missing_sections = []
    for section_name, relative_path in sections.items():
        present = (AGENT_ROOT / relative_path).is_dir()
        actual_presence_by_path[relative_path] = present
        if not present:
            missing_sections.append(f"{section_name} ({relative_path})")

    if missing_sections:
        joined = ", ".join(missing_sections)
        add(findings, "FAIL", "body_section_missing", f"missing body section paths: {joined}")
    else:
        add(findings, "PASS", "body_sections_present", "all body section paths exist in .agent")


def validate_body_state(
    body_data: dict[str, Any],
    body_state_data: dict[str, Any],
    actual_presence_by_path: dict[str, bool],
    findings: list[Finding],
    expected_body_state: dict[str, Any] | None,
) -> None:
    missing_top_level = [key for key in REQUIRED_BODY_STATE_KEYS if key not in body_state_data]
    if missing_top_level:
        add(
            findings,
            "FAIL",
            "body_state_missing_keys",
            "body_state missing required top-level keys: " + ", ".join(missing_top_level),
        )
        return

    body_id = body_data.get("id")
    state_body_id = body_state_data.get("body_id")
    if state_body_id == body_id:
        add(findings, "PASS", "body_state_body_id", "body_state body_id matches body id")
    else:
        add(findings, "FAIL", "body_state_body_id", "body_state body_id does not match body id")

    sections = body_data.get("sections")
    state_sections = body_state_data.get("sections")
    if not isinstance(sections, dict) or not isinstance(state_sections, dict):
        add(findings, "FAIL", "body_state_sections_type", "body_state sections must be a mapping")
        return

    body_keys = list(sections.keys())
    state_keys = list(state_sections.keys())
    missing_keys = [key for key in body_keys if key not in state_sections]
    extra_keys = [key for key in state_keys if key not in sections]
    if missing_keys or extra_keys:
        messages = []
        if missing_keys:
            messages.append(f"missing: {', '.join(missing_keys)}")
        if extra_keys:
            messages.append(f"extra: {', '.join(extra_keys)}")
        add(findings, "FAIL", "body_state_section_keys", "body_state section keys mismatch (" + "; ".join(messages) + ")")
        return
    add(findings, "PASS", "body_state_section_keys", "body_state section keys match body definition")

    path_errors = []
    present_errors = []
    for section_name, relative_path in sections.items():
        state_entry = state_sections.get(section_name)
        if not isinstance(state_entry, dict):
            path_errors.append(section_name)
            continue
        state_path = state_entry.get("path")
        state_present = state_entry.get("present")
        if state_path != relative_path:
            path_errors.append(section_name)
        actual_present = actual_presence_by_path.get(relative_path, (AGENT_ROOT / relative_path).is_dir())
        if state_present != actual_present:
            present_errors.append(section_name)

    if path_errors:
        add(
            findings,
            "FAIL",
            "body_state_section_paths",
            "body_state section paths mismatch for: " + ", ".join(path_errors),
        )
    else:
        add(findings, "PASS", "body_state_section_paths", "body_state section paths match body definition")

    if present_errors:
        add(
            findings,
            "FAIL",
            "body_state_section_present",
            "body_state present flags mismatch for: " + ", ".join(present_errors),
        )
    else:
        add(
            findings,
            "PASS",
            "body_state_section_present",
            "body_state present flags match the filesystem",
        )

    actual_summary = "ready" if all(actual_presence_by_path.values()) else "degraded"
    state_status = body_state_data.get("status")
    if isinstance(state_status, dict) and state_status.get("summary") == actual_summary:
        add(findings, "PASS", "body_state_summary", "body_state summary matches the filesystem")
    else:
        add(findings, "FAIL", "body_state_summary", "body_state summary does not match the filesystem")

    expected_warnings = expected_body_state["status"]["warnings"] if expected_body_state else []
    actual_warnings = state_status.get("warnings") if isinstance(state_status, dict) else None
    if actual_warnings == expected_warnings:
        add(findings, "PASS", "body_state_warnings", "body_state warnings match expected missing-section warnings")
    else:
        add(findings, "FAIL", "body_state_warnings", "body_state warnings do not match expected missing-section warnings")


def validate_class_modules(class_data: dict[str, Any], findings: list[Finding]) -> dict[str, Path]:
    module_roots: dict[str, Path] = {}
    modules = class_data.get("modules")
    if not isinstance(modules, dict):
        add(findings, "FAIL", "class_modules_type", "class.yaml modules must be a mapping")
        return module_roots

    missing_keys = [key for key in REQUIRED_MODULE_KEYS if key not in modules]
    if missing_keys:
        add(
            findings,
            "FAIL",
            "class_modules_missing",
            "class.yaml modules missing required keys: " + ", ".join(missing_keys),
        )
    else:
        add(findings, "PASS", "class_modules_keys", "class.yaml modules include required keys")

    path_failures = []
    for key in REQUIRED_MODULE_KEYS:
        relative_path = modules.get(key)
        if not isinstance(relative_path, str) or not relative_path:
            path_failures.append(key)
            continue
        resolved_path = CLASS_ROOT / relative_path
        if not resolved_path.is_dir():
            path_failures.append(key)
            continue
        module_roots[key] = resolved_path

    if path_failures:
        add(
            findings,
            "FAIL",
            "class_modules_path",
            "class.yaml module paths missing or invalid for: " + ", ".join(path_failures),
        )
    else:
        add(findings, "PASS", "class_modules_path", "class.yaml module fields exist and resolve to real paths")

    return module_roots


def validate_loadout_structure(loadout_data: dict[str, Any], findings: list[Finding]) -> dict[str, list[str]]:
    equipped_values = {key: [] for key in REQUIRED_EQUIPPED_KEYS}

    equipped = loadout_data.get("equipped")
    if not isinstance(equipped, dict):
        add(findings, "FAIL", "loadout_equipped_type", "loadout.yaml equipped must be a mapping")
    else:
        missing_equipped = [key for key in REQUIRED_EQUIPPED_KEYS if key not in equipped]
        if missing_equipped:
            add(
                findings,
                "FAIL",
                "loadout_equipped_missing",
                "loadout.yaml equipped missing required keys: " + ", ".join(missing_equipped),
            )
        else:
            add(findings, "PASS", "loadout_equipped_keys", "loadout equipped keys are present")

        non_list_keys = [key for key in REQUIRED_EQUIPPED_KEYS if key in equipped and not isinstance(equipped[key], list)]
        if non_list_keys:
            add(
                findings,
                "FAIL",
                "loadout_equipped_list_type",
                "loadout equipped entries must be lists for: " + ", ".join(non_list_keys),
            )
        else:
            add(findings, "PASS", "loadout_equipped_list_type", "loadout equipped entries use list shape")

        invalid_id_entries: list[str] = []
        for key in REQUIRED_EQUIPPED_KEYS:
            values = equipped.get(key)
            if not isinstance(values, list):
                continue
            bad_positions = [
                str(index + 1)
                for index, value in enumerate(values)
                if not isinstance(value, str) or not value.strip()
            ]
            if bad_positions:
                invalid_id_entries.append(f"{key}[{', '.join(bad_positions)}]")
                continue
            equipped_values[key] = [value.strip() for value in values]

        if invalid_id_entries:
            add(
                findings,
                "FAIL",
                "loadout_equipped_id_type",
                "loadout equipped entries must use non-empty string ids for: " + ", ".join(invalid_id_entries),
            )
        else:
            add(
                findings,
                "PASS",
                "loadout_equipped_id_type",
                "loadout equipped entries use non-empty string ids",
            )

    bindings = loadout_data.get("bindings")
    if not isinstance(bindings, dict):
        add(findings, "FAIL", "loadout_bindings_type", "loadout.yaml bindings must be a mapping")
        return equipped_values

    missing_bindings = [key for key in REQUIRED_BINDING_KEYS if key not in bindings]
    if missing_bindings:
        add(
            findings,
            "FAIL",
            "loadout_bindings_missing",
            "loadout bindings missing required keys: " + ", ".join(missing_bindings),
        )
    else:
        add(findings, "PASS", "loadout_bindings_keys", "loadout bindings include required base fields")

    return equipped_values


def resolve_loadout_contract(class_data: dict[str, Any], loadout_data: dict[str, Any]) -> ResolveResult:
    findings: list[Finding] = []
    module_roots = validate_class_modules(class_data, findings)
    equipped_requested = validate_loadout_structure(loadout_data, findings)
    catalog, duplicate_ids = build_module_catalog(module_roots, findings)
    equipped_resolved = resolve_equipped_modules(equipped_requested, catalog, duplicate_ids, findings)
    validate_equipped_workflow_dependencies(equipped_resolved, catalog, duplicate_ids, findings)

    return ResolveResult(
        findings=findings,
        catalog=catalog,
        duplicate_ids=duplicate_ids,
        equipped_requested=equipped_requested,
        equipped_resolved=equipped_resolved,
        class_id=loadout_data.get("class_id") if isinstance(loadout_data.get("class_id"), str) else None,
        active_profile=loadout_data.get("active_profile") if isinstance(loadout_data.get("active_profile"), str) else None,
    )


def build_module_catalog(
    module_roots: dict[str, Path], findings: list[Finding]
) -> tuple[dict[str, dict[str, ModuleRecord]], dict[str, set[str]]]:
    catalog = {key: {} for key in REQUIRED_EQUIPPED_KEYS}
    duplicate_ids = {key: set() for key in REQUIRED_EQUIPPED_KEYS}

    for key in ("skills", "workflows", "knowledge"):
        root = module_roots.get(key)
        if root is None:
            continue
        for manifest_path, family in scan_module_manifest_paths(root, key, findings):
            record = load_module_record(manifest_path, MODULE_KIND_BY_LIBRARY_KEY[key], findings, family)
            if record is None:
                continue
            register_module_record(key, record, catalog, duplicate_ids, findings)

    tool_root = module_roots.get("tools")
    if tool_root is not None:
        for manifest_path, family in scan_module_manifest_paths(tool_root, "tools", findings):
            record = load_module_record(manifest_path, "tool", findings, family)
            if record is None:
                continue
            register_module_record("tools", record, catalog, duplicate_ids, findings)

    return catalog, duplicate_ids


def scan_module_manifest_paths(
    root: Path, library_key: str, findings: list[Finding]
) -> list[tuple[Path, str | None]]:
    manifests: list[tuple[Path, str | None]] = []
    invalid_paths: list[str] = []

    for manifest_path in sorted(root.rglob("module.yaml")):
        relative = manifest_path.relative_to(root)
        parts = relative.parts
        if library_key == "tools":
            if len(parts) == 3 and parts[0] in TOOL_FAMILIES and parts[2] == "module.yaml":
                manifests.append((manifest_path, parts[0]))
            else:
                invalid_paths.append(relative_to_repo(manifest_path))
            continue

        if len(parts) == 2 and parts[1] == "module.yaml":
            manifests.append((manifest_path, None))
        else:
            invalid_paths.append(relative_to_repo(manifest_path))

    if invalid_paths:
        code = f"{library_key}_manifest_path_contract"
        label = "tool" if library_key == "tools" else MODULE_KIND_BY_LIBRARY_KEY[library_key]
        add(
            findings,
            "FAIL",
            code,
            f"{label} manifest paths violate module reference contract: " + ", ".join(sorted(invalid_paths)),
        )

    return manifests


def load_module_record(
    manifest_path: Path,
    expected_kind: str,
    findings: list[Finding],
    actual_family: str | None = None,
) -> ModuleRecord | None:
    try:
        data = load_yaml(manifest_path)
    except (FileNotFoundError, YamlParseError) as error:
        add(findings, "FAIL", "module_manifest_parse_error", str(error))
        return None

    if not isinstance(data, dict):
        add(
            findings,
            "FAIL",
            "module_manifest_root_type",
            f"{relative_to_repo(manifest_path)} root must be a mapping",
        )
        return None

    valid = True
    missing_common = [field for field in COMMON_MANIFEST_KEYS if field not in data]
    if missing_common:
        add(
            findings,
            "FAIL",
            "module_manifest_common_missing",
            f"{relative_to_repo(manifest_path)} missing required fields: " + ", ".join(missing_common),
        )
        valid = False

    invalid_common = [
        field
        for field in COMMON_MANIFEST_KEYS
        if field in data and (not isinstance(data[field], str) or not data[field].strip())
    ]
    if invalid_common:
        add(
            findings,
            "FAIL",
            "module_manifest_common_type",
            f"{relative_to_repo(manifest_path)} requires non-empty string fields: " + ", ".join(invalid_common),
        )
        valid = False

    module_id = data.get("id").strip() if isinstance(data.get("id"), str) and data.get("id").strip() else None
    manifest_kind = (
        data.get("kind").strip() if isinstance(data.get("kind"), str) and data.get("kind").strip() else None
    )

    if manifest_kind is not None and manifest_kind not in MODULE_KIND_BY_LIBRARY_KEY.values():
        add(
            findings,
            "FAIL",
            "module_manifest_kind_value",
            f"{relative_to_repo(manifest_path)} uses invalid kind: {manifest_kind}",
        )
        valid = False

    if manifest_kind is not None and manifest_kind != expected_kind:
        add(
            findings,
            "FAIL",
            "module_manifest_kind_mismatch",
            f"{relative_to_repo(manifest_path)} declares kind {manifest_kind} but lives under {expected_kind} root",
        )
        valid = False

    entrypoint = None
    family = None
    content_path = None
    requires: dict[str, list[str]] | None = None

    if expected_kind in ("skill", "tool", "workflow"):
        entrypoint_value = data.get("entrypoint")
        if not isinstance(entrypoint_value, str) or not entrypoint_value.strip():
            add(
                findings,
                "FAIL",
                "module_manifest_entrypoint",
                f"{relative_to_repo(manifest_path)} requires a non-empty string entrypoint",
            )
            valid = False
        else:
            entrypoint = entrypoint_value.strip()

    if expected_kind == "tool":
        family_value = data.get("family")
        if not isinstance(family_value, str) or not family_value.strip():
            add(
                findings,
                "FAIL",
                "tool_manifest_family_type",
                f"{relative_to_repo(manifest_path)} requires a non-empty string family",
            )
            valid = False
        else:
            family = family_value.strip()
            if family not in TOOL_FAMILIES:
                add(
                    findings,
                    "FAIL",
                    "tool_manifest_family_value",
                    f"{relative_to_repo(manifest_path)} uses invalid tool family: {family}",
                )
                valid = False
            if actual_family is not None and family != actual_family:
                add(
                    findings,
                    "FAIL",
                    "tool_manifest_family_mismatch",
                    f"{relative_to_repo(manifest_path)} declares family {family} but path family is {actual_family}",
                )
                valid = False

    if expected_kind == "workflow":
        requires_value = data.get("requires")
        requires = {key: [] for key in WORKFLOW_REQUIRE_KEYS}
        if not isinstance(requires_value, dict):
            add(
                findings,
                "FAIL",
                "workflow_manifest_requires_type",
                f"{relative_to_repo(manifest_path)} requires a mapping at requires",
            )
            valid = False
        else:
            missing_requires = [key for key in WORKFLOW_REQUIRE_KEYS if key not in requires_value]
            if missing_requires:
                add(
                    findings,
                    "FAIL",
                    "workflow_manifest_requires_missing",
                    f"{relative_to_repo(manifest_path)} missing requires fields: " + ", ".join(missing_requires),
                )
                valid = False

            for key in WORKFLOW_REQUIRE_KEYS:
                dependency_ids = requires_value.get(key)
                if not isinstance(dependency_ids, list):
                    add(
                        findings,
                        "FAIL",
                        "workflow_manifest_requires_list_type",
                        f"{relative_to_repo(manifest_path)} requires list shape at requires.{key}",
                    )
                    valid = False
                    continue

                bad_positions = [
                    str(index + 1)
                    for index, dependency_id in enumerate(dependency_ids)
                    if not isinstance(dependency_id, str) or not dependency_id.strip()
                ]
                if bad_positions:
                    add(
                        findings,
                        "FAIL",
                        "workflow_manifest_requires_id_type",
                        f"{relative_to_repo(manifest_path)} requires non-empty string ids at requires.{key}[{', '.join(bad_positions)}]",
                    )
                    valid = False
                    continue

                requires[key] = [dependency_id.strip() for dependency_id in dependency_ids]

    if expected_kind == "knowledge":
        content_path_value = data.get("content_path")
        if not isinstance(content_path_value, str) or not content_path_value.strip():
            add(
                findings,
                "FAIL",
                "knowledge_manifest_content_path",
                f"{relative_to_repo(manifest_path)} requires a non-empty string content_path",
            )
            valid = False
        else:
            content_path = content_path_value.strip()

    if not valid or module_id is None or manifest_kind is None:
        return None

    return ModuleRecord(
        module_id=module_id,
        kind=manifest_kind,
        manifest_path=manifest_path,
        name=data["name"].strip(),
        version=data["version"].strip(),
        description=data["description"].strip(),
        entrypoint=entrypoint,
        family=family,
        content_path=content_path,
        requires=requires,
    )


def register_module_record(
    library_key: str,
    record: ModuleRecord,
    catalog: dict[str, dict[str, ModuleRecord]],
    duplicate_ids: dict[str, set[str]],
    findings: list[Finding],
) -> None:
    existing = catalog[library_key].get(record.module_id)
    if existing is None and record.module_id not in duplicate_ids[library_key]:
        catalog[library_key][record.module_id] = record
        return

    if existing is not None:
        duplicate_ids[library_key].add(record.module_id)
        del catalog[library_key][record.module_id]
        add(
            findings,
            "FAIL",
            "module_manifest_duplicate_id",
            f"duplicate {MODULE_KIND_BY_LIBRARY_KEY[library_key]} module id {record.module_id}: "
            f"{relative_to_repo(existing.manifest_path)}, {relative_to_repo(record.manifest_path)}",
        )
        return

    add(
        findings,
        "FAIL",
        "module_manifest_duplicate_id",
        f"additional duplicate {MODULE_KIND_BY_LIBRARY_KEY[library_key]} module id {record.module_id}: "
        f"{relative_to_repo(record.manifest_path)}",
    )


def resolve_equipped_modules(
    equipped_requested: dict[str, list[str]],
    catalog: dict[str, dict[str, ModuleRecord]],
    duplicate_ids: dict[str, set[str]],
    findings: list[Finding],
) -> dict[str, list[ModuleRecord]]:
    equipped_resolved = {key: [] for key in REQUIRED_EQUIPPED_KEYS}

    for library_key in REQUIRED_EQUIPPED_KEYS:
        unresolved: list[str] = []
        for module_id in equipped_requested.get(library_key, []):
            if looks_like_path_reference(module_id):
                unresolved.append(f"{module_id} (path-like reference)")
                continue
            if module_id in duplicate_ids[library_key]:
                unresolved.append(f"{module_id} (duplicate id)")
                continue

            record = catalog[library_key].get(module_id)
            if record is not None:
                equipped_resolved[library_key].append(record)
                continue

            other_kind = find_other_kind_for_id(module_id, library_key, catalog)
            if other_kind is not None:
                unresolved.append(f"{module_id} (kind mismatch: {other_kind})")
            else:
                unresolved.append(f"{module_id} (unknown id)")

        if unresolved:
            add(
                findings,
                "FAIL",
                f"loadout_{library_key}_resolve",
                f"loadout equipped {library_key} failed to resolve: " + ", ".join(unresolved),
            )
        else:
            add(
                findings,
                "PASS",
                f"loadout_{library_key}_resolve",
                f"loadout equipped {library_key} resolved cleanly ({len(equipped_requested.get(library_key, []))} requested)",
            )

    return equipped_resolved


def validate_equipped_workflow_dependencies(
    equipped_resolved: dict[str, list[ModuleRecord]],
    catalog: dict[str, dict[str, ModuleRecord]],
    duplicate_ids: dict[str, set[str]],
    findings: list[Finding],
) -> None:
    equipped_workflows = equipped_resolved.get("workflows", [])
    if not equipped_workflows:
        add(
            findings,
            "PASS",
            "workflow_dependency_resolution",
            "equipped workflows are empty, so workflow dependency resolution is clean",
        )
        return

    for workflow in equipped_workflows:
        requires = workflow.requires or {key: [] for key in WORKFLOW_REQUIRE_KEYS}
        unresolved: list[str] = []
        for dependency_key in WORKFLOW_REQUIRE_KEYS:
            for module_id in requires.get(dependency_key, []):
                if module_id in duplicate_ids[dependency_key]:
                    unresolved.append(f"{dependency_key}:{module_id} (duplicate id)")
                    continue
                if catalog[dependency_key].get(module_id) is None:
                    unresolved.append(f"{dependency_key}:{module_id} (unknown id)")

        if unresolved:
            add(
                findings,
                "FAIL",
                "workflow_dependency_resolution",
                f"equipped workflow {workflow.module_id} has unresolved dependencies: " + ", ".join(unresolved),
            )
        else:
            add(
                findings,
                "PASS",
                "workflow_dependency_resolution",
                f"equipped workflow {workflow.module_id} dependencies resolve against installed catalog",
            )


def looks_like_path_reference(value: str) -> bool:
    return "/" in value or "\\" in value or value.endswith(PATH_LIKE_SUFFIXES)


def find_other_kind_for_id(
    module_id: str, expected_library_key: str, catalog: dict[str, dict[str, ModuleRecord]]
) -> str | None:
    for library_key in REQUIRED_EQUIPPED_KEYS:
        if library_key == expected_library_key:
            continue
        if module_id in catalog[library_key]:
            return MODULE_KIND_BY_LIBRARY_KEY[library_key]
    return None


def build_resolve_payload(result: ResolveResult) -> dict[str, Any]:
    workflow_dependencies = []
    for workflow in sorted(result.catalog["workflows"].values(), key=lambda item: item.module_id):
        workflow_dependencies.append(
            {
                "workflow_id": workflow.module_id,
                "equipped": any(
                    equipped_workflow.module_id == workflow.module_id
                    for equipped_workflow in result.equipped_resolved["workflows"]
                ),
                "requires": workflow.requires or {key: [] for key in WORKFLOW_REQUIRE_KEYS},
                "manifest_path": relative_to_repo(workflow.manifest_path),
            }
        )

    payload = {
        "catalog": {
            key: [record.as_dict() for record in sorted(result.catalog[key].values(), key=lambda item: item.module_id)]
            for key in REQUIRED_EQUIPPED_KEYS
        },
        "equipped": {
            key: {
                "requested": result.equipped_requested.get(key, []),
                "resolved": [record.as_dict() for record in result.equipped_resolved.get(key, [])],
            }
            for key in REQUIRED_EQUIPPED_KEYS
        },
        "workflow_dependencies": workflow_dependencies,
    }
    return payload


def summarize_findings(findings: list[Finding]) -> dict[str, Any]:
    fail_count = sum(1 for finding in findings if finding.level == "FAIL")
    warn_count = sum(1 for finding in findings if finding.level == "WARN")
    pass_count = sum(1 for finding in findings if finding.level == "PASS")
    return {
        "pass": pass_count,
        "warn": warn_count,
        "fail": fail_count,
        "result": "FAIL" if fail_count else "PASS",
    }


def split_findings(findings: list[Finding]) -> tuple[list[Finding], list[Finding]]:
    warnings = [finding for finding in findings if finding.level == "WARN"]
    errors = [finding for finding in findings if finding.level == "FAIL"]
    return warnings, errors


def sync_body_state(check: bool, as_json: bool) -> int:
    body_data = load_required_mapping(BODY_YAML)

    new_state = make_body_state(body_data)
    rendered = dump_yaml(new_state)
    changed = not compare_text(BODY_STATE_YAML, rendered)

    if check:
        result = {
            "command": "sync-body-state",
            "body_state_path": relative_to_repo(BODY_STATE_YAML),
            "changed": changed,
            "summary": new_state["status"]["summary"],
            "warnings": new_state["status"]["warnings"],
        }
        if as_json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            status = "FAIL" if changed else "PASS"
            print(f"{status} body_state regeneration check")
            print(f"  file: {relative_to_repo(BODY_STATE_YAML)}")
            print(f"  changed: {'yes' if changed else 'no'}")
            print(f"  summary: {new_state['status']['summary']}")
            print(f"  warnings: {len(new_state['status']['warnings'])}")
        return 1 if changed else 0

    BODY_STATE_YAML.write_text(rendered, encoding="utf-8")
    result = {
        "command": "sync-body-state",
        "body_state_path": relative_to_repo(BODY_STATE_YAML),
        "written": True,
        "changed": changed,
        "summary": new_state["status"]["summary"],
        "warnings": new_state["status"]["warnings"],
    }
    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("PASS body_state regenerated")
        print(f"  file: {relative_to_repo(BODY_STATE_YAML)}")
        print(f"  changed: {'yes' if changed else 'no'}")
        print(f"  summary: {new_state['status']['summary']}")
        print(f"  warnings: {len(new_state['status']['warnings'])}")
    return 0


def run_resolve_loadout(as_json: bool) -> int:
    class_data = load_required_mapping(CLASS_YAML)
    loadout_data = load_required_mapping(LOADOUT_YAML)
    result = resolve_loadout_contract(class_data, loadout_data)
    summary = summarize_findings(result.findings)
    warnings, errors = split_findings(result.findings)
    payload = build_resolve_payload(result)
    exit_code = 1 if summary["fail"] else 0

    if as_json:
        print(
            json.dumps(
                {
                    "command": "resolve-loadout",
                    **payload,
                    "warnings": [finding.as_dict() for finding in warnings],
                    "errors": [finding.as_dict() for finding in errors],
                    "summary": summary,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return exit_code

    for finding in result.findings:
        print(f"{finding.level} {finding.message}")
    print(
        f"{summary['result']} resolve-loadout summary: "
        f"{summary['pass']} pass, {summary['warn']} warn, {summary['fail']} fail"
    )
    for key in REQUIRED_EQUIPPED_KEYS:
        installed_count = len(result.catalog[key])
        requested_count = len(result.equipped_requested.get(key, []))
        resolved_count = len(result.equipped_resolved.get(key, []))
        print(
            f"  {key}: installed {installed_count}, requested {requested_count}, resolved {resolved_count}"
        )
    return exit_code


def run_validate(as_json: bool) -> int:
    findings, resolve_result = validate_repo()
    summary = summarize_findings(findings)
    warnings, errors = split_findings(findings)
    exit_code = 1 if summary["fail"] else 0

    if as_json:
        payload: dict[str, Any] = {
            "command": "validate",
            "summary": summary,
            "warnings": [finding.as_dict() for finding in warnings],
            "errors": [finding.as_dict() for finding in errors],
            "findings": [finding.as_dict() for finding in findings],
        }
        if resolve_result is not None:
            payload["resolve_loadout"] = build_resolve_payload(resolve_result)
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        for finding in findings:
            print(f"{finding.level} {finding.message}")
        print(
            f"{summary['result']} validation summary: "
            f"{summary['pass']} pass, {summary['warn']} warn, {summary['fail']} fail"
        )

    return exit_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Soulforge body sync and class loadout resolve/validate local CLI."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    sync_parser = subparsers.add_parser(
        "sync-body-state", help="Regenerate .agent/body_state.yaml from body metadata and filesystem state."
    )
    sync_parser.add_argument(
        "--check",
        action="store_true",
        help="Check whether .agent/body_state.yaml is up to date without rewriting it.",
    )
    sync_parser.add_argument(
        "--json", action="store_true", help="Print machine-readable JSON output."
    )

    resolve_parser = subparsers.add_parser(
        "resolve-loadout",
        help="Resolve installed module manifests and loadout equipped ids from class metadata.",
    )
    resolve_parser.add_argument(
        "--json", action="store_true", help="Print machine-readable JSON output."
    )

    validate_parser = subparsers.add_parser(
        "validate", help="Validate body/class/loadout metadata, body_state consistency, and loadout resolve."
    )
    validate_parser.add_argument(
        "--json", action="store_true", help="Print machine-readable JSON output."
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.command == "sync-body-state":
            return sync_body_state(check=args.check, as_json=args.json)
        if args.command == "resolve-loadout":
            return run_resolve_loadout(as_json=args.json)
        if args.command == "validate":
            return run_validate(as_json=args.json)
    except (FileNotFoundError, YamlParseError) as error:
        print(f"FAIL {error}", file=sys.stderr)
        return 1

    parser.error(f"unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    sys.exit(main())

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
REQUIRED_MODULE_KEYS = ("skills", "tools", "workflows", "knowledge", "docs")
REQUIRED_EQUIPPED_KEYS = ("skills", "tools", "workflows", "knowledge")
REQUIRED_BINDING_KEYS = ("body", "company_workspace", "personal_workspace")


class YamlParseError(ValueError):
    """Raised when the minimal YAML parser cannot parse a file."""


@dataclass
class Finding:
    level: str
    code: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"level": self.level, "code": self.code, "message": self.message}


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
    if value == "[]":
        return []
    if value == "{}":
        return {}
    return value


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


def validate_repo() -> list[Finding]:
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

    if isinstance(class_data, dict):
        validate_class(class_data, findings)
    if isinstance(loadout_data, dict):
        validate_loadout(loadout_data, findings)

    return findings


def load_optional_yaml(
    path: Path, findings: list[Finding], missing_code: str, pass_message: str
) -> dict[str, Any] | None:
    if not path.exists():
        add(findings, "FAIL", missing_code, f"missing required file: {path.relative_to(REPO_ROOT)}")
        return None

    try:
        data = load_yaml(path)
    except (FileNotFoundError, YamlParseError) as error:
        add(findings, "FAIL", f"{path.name}_parse_error", str(error))
        return None

    if not isinstance(data, dict):
        add(findings, "FAIL", f"{path.name}_root_type", f"{path.relative_to(REPO_ROOT)} root must be a mapping")
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


def validate_class(class_data: dict[str, Any], findings: list[Finding]) -> None:
    modules = class_data.get("modules")
    if not isinstance(modules, dict):
        add(findings, "FAIL", "class_modules_type", "class.yaml modules must be a mapping")
        return

    missing_keys = [key for key in REQUIRED_MODULE_KEYS if key not in modules]
    if missing_keys:
        add(
            findings,
            "FAIL",
            "class_modules_missing",
            "class.yaml modules missing required keys: " + ", ".join(missing_keys),
        )
        return

    path_failures = []
    for key in REQUIRED_MODULE_KEYS:
        relative_path = modules.get(key)
        if not isinstance(relative_path, str):
            path_failures.append(key)
            continue
        if not (CLASS_ROOT / relative_path).is_dir():
            path_failures.append(key)

    if path_failures:
        add(
            findings,
            "FAIL",
            "class_modules_path",
            "class.yaml module paths missing or invalid for: " + ", ".join(path_failures),
        )
    else:
        add(findings, "PASS", "class_modules_path", "class.yaml module fields exist and resolve to real paths")


def validate_loadout(loadout_data: dict[str, Any], findings: list[Finding]) -> None:
    equipped = loadout_data.get("equipped")
    if not isinstance(equipped, dict):
        add(findings, "FAIL", "loadout_equipped_type", "loadout.yaml equipped must be a mapping")
        return

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

    unresolved_keys = []
    for key in REQUIRED_EQUIPPED_KEYS:
        values = equipped.get(key)
        if isinstance(values, list) and values:
            unresolved_keys.append(f"{key} ({len(values)})")
    if unresolved_keys:
        add(
            findings,
            "WARN",
            "loadout_module_resolution_deferred",
            "module reference contract not defined yet; unresolved equipped entries: " + ", ".join(unresolved_keys),
        )
    else:
        add(
            findings,
            "PASS",
            "loadout_module_resolution_deferred",
            "equipped lists are empty, so module reference resolution is deferred cleanly",
        )

    bindings = loadout_data.get("bindings")
    if not isinstance(bindings, dict):
        add(findings, "FAIL", "loadout_bindings_type", "loadout.yaml bindings must be a mapping")
        return

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


def sync_body_state(check: bool, as_json: bool) -> int:
    body_data = load_yaml(BODY_YAML)
    if not isinstance(body_data, dict):
        raise YamlParseError(f"{BODY_YAML}: root must be a mapping")

    new_state = make_body_state(body_data)
    rendered = dump_yaml(new_state)
    changed = not compare_text(BODY_STATE_YAML, rendered)

    if check:
        result = {
            "command": "sync-body-state",
            "body_state_path": str(BODY_STATE_YAML.relative_to(REPO_ROOT)),
            "changed": changed,
            "summary": new_state["status"]["summary"],
            "warnings": new_state["status"]["warnings"],
        }
        if as_json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            status = "FAIL" if changed else "PASS"
            print(f"{status} body_state regeneration check")
            print(f"  file: {BODY_STATE_YAML.relative_to(REPO_ROOT)}")
            print(f"  changed: {'yes' if changed else 'no'}")
            print(f"  summary: {new_state['status']['summary']}")
            print(f"  warnings: {len(new_state['status']['warnings'])}")
        return 1 if changed else 0

    BODY_STATE_YAML.write_text(rendered, encoding="utf-8")
    result = {
        "command": "sync-body-state",
        "body_state_path": str(BODY_STATE_YAML.relative_to(REPO_ROOT)),
        "written": True,
        "changed": changed,
        "summary": new_state["status"]["summary"],
        "warnings": new_state["status"]["warnings"],
    }
    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        status = "PASS"
        print(f"{status} body_state regenerated")
        print(f"  file: {BODY_STATE_YAML.relative_to(REPO_ROOT)}")
        print(f"  changed: {'yes' if changed else 'no'}")
        print(f"  summary: {new_state['status']['summary']}")
        print(f"  warnings: {len(new_state['status']['warnings'])}")
    return 0


def run_validate(as_json: bool) -> int:
    findings = validate_repo()
    fail_count = sum(1 for finding in findings if finding.level == "FAIL")
    warn_count = sum(1 for finding in findings if finding.level == "WARN")
    pass_count = sum(1 for finding in findings if finding.level == "PASS")
    exit_code = 1 if fail_count else 0

    if as_json:
        payload = {
            "command": "validate",
            "summary": {
                "pass": pass_count,
                "warn": warn_count,
                "fail": fail_count,
                "result": "FAIL" if fail_count else "PASS",
            },
            "findings": [finding.as_dict() for finding in findings],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        for finding in findings:
            print(f"{finding.level} {finding.message}")
        result = "FAIL" if fail_count else "PASS"
        print(
            f"{result} validation summary: {pass_count} pass, {warn_count} warn, {fail_count} fail"
        )

    return exit_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Soulforge body sync and metadata validation local CLI."
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

    validate_parser = subparsers.add_parser(
        "validate", help="Validate body/class/loadout metadata and body_state consistency."
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
        if args.command == "validate":
            return run_validate(as_json=args.json)
    except (FileNotFoundError, YamlParseError) as error:
        print(f"FAIL {error}", file=sys.stderr)
        return 1

    parser.error(f"unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    sys.exit(main())

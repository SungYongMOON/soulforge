#!/usr/bin/env python3
"""Local CLI for body state synchronization and metadata validation."""

from __future__ import annotations

import argparse
import json
import re
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
REQUIRED_BODY_STATE_KEYS = (
    "body_id",
    "operating_context",
    "sections",
    "active_selection",
    "catalog_layer",
    "operating_profiles",
    "status",
)
MODULE_LIBRARY_KEYS = ("skills", "tools", "workflows", "knowledge")
REQUIRED_MODULE_KEYS = MODULE_LIBRARY_KEYS + ("docs",)
REQUIRED_EQUIPPED_KEYS = MODULE_LIBRARY_KEYS
REQUIRED_BINDING_KEYS = ("body", "company_workspace", "personal_workspace")
WORKSPACE_KINDS = ("company", "personal")
WORKSPACE_ROOT = REPO_ROOT / "_workspaces"
PROJECT_AGENT_DIRNAME = ".project_agent"
PROJECT_AGENT_REQUIRED_FILES = (
    "contract.yaml",
    "capsule_bindings.yaml",
    "workflow_bindings.yaml",
    "local_state_map.yaml",
)
PROJECT_CONTRACT_KEYS = (
    "project_id",
    "project_name",
    "workspace_kind",
    "body_ref",
    "class_ref",
    "default_loadout",
)
CAPSULE_BINDING_KEYS = ("capsule_id", "source_ref", "target_path", "mode")
WORKFLOW_BINDING_KEYS = ("workflow_id", "entrypoint", "trigger", "enabled")
LOCAL_STATE_KEYS = ("key", "path", "purpose", "tracked")
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
CAPSULE_BINDING_MODES = ("read_only", "read_write", "copy")
WORKFLOW_TRIGGERS = ("manual", "on_demand", "scheduled")
WORKFLOW_MUTATION_MODES = ("read_only", "append_only", "overwrite_owned")
TAB_SPECS = (
    ("overview", "종합(Overview)"),
    ("body", "본체(.agent)"),
    ("class", "직업(.agent_class)"),
    ("workspaces", "워크스페이스(_workspaces)"),
)
INLINE_MAPPING_RE = re.compile(r"^[A-Za-z0-9_.-]+\s*:")


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
class WorkspaceProjectRecord:
    project_path: str
    workspace_kind: str
    state: str
    project_agent_present: bool
    contract: dict[str, Any]
    capsule_bindings: dict[str, Any]
    workflow_bindings: dict[str, Any]
    local_state: dict[str, Any]
    warnings: list[Finding]
    errors: list[Finding]

    def as_dict(self) -> dict[str, Any]:
        return {
            "project_path": self.project_path,
            "workspace_kind": self.workspace_kind,
            "state": self.state,
            "project_agent_present": self.project_agent_present,
            "contract": self.contract,
            "capsule_bindings": self.capsule_bindings,
            "workflow_bindings": self.workflow_bindings,
            "local_state": self.local_state,
            "warnings": [finding.as_dict() for finding in self.warnings],
            "errors": [finding.as_dict() for finding in self.errors],
        }


@dataclass
class WorkspaceResolveResult:
    findings: list[Finding]
    workspaces: dict[str, list[WorkspaceProjectRecord]]
    summary: dict[str, int]

    def as_dict(self) -> dict[str, Any]:
        return {
            "workspaces": {
                kind: {"projects": [project.as_dict() for project in self.workspaces[kind]]}
                for kind in WORKSPACE_KINDS
            },
            "summary": self.summary,
        }


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

    operating_context = body_data.get("operating_context")
    if not isinstance(operating_context, str) or not operating_context:
        raise YamlParseError(f"{BODY_YAML}: operating_context must be a non-empty string")

    operating_profiles = body_data.get("operating_profiles")
    if not isinstance(operating_profiles, dict):
        raise YamlParseError(f"{BODY_YAML}: operating_profiles must be a mapping")

    active_selection = body_data.get("active_selection")
    if not isinstance(active_selection, dict):
        raise YamlParseError(f"{BODY_YAML}: active_selection must be a mapping")

    catalog_layer = body_data.get("catalog_layer")
    if not isinstance(catalog_layer, dict):
        raise YamlParseError(f"{BODY_YAML}: catalog_layer must be a mapping")

    future_expansion = body_data.get("future_expansion", {})
    if not isinstance(future_expansion, dict):
        raise YamlParseError(f"{BODY_YAML}: future_expansion must be a mapping")

    sections = body_data.get("sections")
    if not isinstance(sections, dict):
        raise YamlParseError(f"{BODY_YAML}: sections must be a mapping")

    state_sections: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []

    for section_name, section_value in sections.items():
        relative_path = get_body_section_path(section_value)
        if relative_path is None:
            raise YamlParseError(f"{BODY_YAML}: sections.{section_name} must be a string path or mapping with path")
        present = resolve_body_section_path(relative_path).is_dir()
        state_sections[section_name] = {"path": relative_path, "present": present}
        if not present:
            warnings.append(f"missing section: {section_name} ({relative_path})")

    summary = "ready" if not warnings else "degraded"
    return {
        "body_id": body_id,
        "operating_context": operating_context,
        "sections": state_sections,
        "active_selection": active_selection,
        "catalog_layer": build_catalog_layer_state(catalog_layer),
        "operating_profiles": {"summary": operating_profiles},
        "future_expansion": future_expansion,
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


def get_body_section_path(section_value: Any) -> str | None:
    if isinstance(section_value, str) and section_value:
        return section_value
    if isinstance(section_value, dict):
        path_value = section_value.get("path")
        if isinstance(path_value, str) and path_value:
            return path_value
    return None


def build_catalog_layer_state(catalog_layer: dict[str, Any]) -> dict[str, Any]:
    relative_path = catalog_layer.get("path")
    if not isinstance(relative_path, str) or not relative_path:
        raise YamlParseError(f"{BODY_YAML}: catalog_layer.path must be a non-empty string")

    roots = catalog_layer.get("roots")
    if not isinstance(roots, dict):
        raise YamlParseError(f"{BODY_YAML}: catalog_layer.roots must be a mapping")

    state_roots: dict[str, dict[str, Any]] = {}
    for root_name, root_path in roots.items():
        if not isinstance(root_path, str) or not root_path:
            raise YamlParseError(f"{BODY_YAML}: catalog_layer.roots.{root_name} must be a non-empty string")
        state_roots[root_name] = {
            "path": root_path,
            "present": resolve_body_section_path(root_path).is_dir(),
        }

    return {
        "path": relative_path,
        "present": resolve_body_section_path(relative_path).is_dir(),
        "roots": state_roots,
    }


def resolve_body_section_path(path_value: str) -> Path:
    candidate = Path(path_value)
    if candidate.is_absolute():
        return candidate
    if candidate.parts and candidate.parts[0] == ".agent":
        return REPO_ROOT / candidate
    return AGENT_ROOT / candidate


def load_required_mapping(path: Path) -> dict[str, Any]:
    data = load_yaml(path)
    if not isinstance(data, dict):
        raise YamlParseError(f"{path}: root must be a mapping")
    return data


def safe_load_mapping(path: Path) -> dict[str, Any] | None:
    try:
        data = load_yaml(path)
    except (FileNotFoundError, YamlParseError):
        return None
    return data if isinstance(data, dict) else None


def validate_repo() -> tuple[list[Finding], ResolveResult | None, WorkspaceResolveResult]:
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

    resolve_result = prepare_loadout_context(findings)

    workspace_result = resolve_workspace_contracts(resolve_result)
    findings.extend(workspace_result.findings)

    return findings, resolve_result, workspace_result


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


def load_project_mapping(path: Path, findings: list[Finding], label: str) -> dict[str, Any] | None:
    if not path.exists():
        add(findings, "FAIL", f"{label}_missing", f"missing required file: {relative_to_repo(path)}")
        return None

    try:
        data = load_yaml(path)
    except (FileNotFoundError, YamlParseError) as error:
        add(findings, "FAIL", f"{label}_parse_error", str(error))
        return None

    if not isinstance(data, dict):
        add(findings, "FAIL", f"{label}_root_type", f"{relative_to_repo(path)} root must be a mapping")
        return None

    return data


def prepare_loadout_context(findings: list[Finding]) -> ResolveResult | None:
    class_data = load_optional_yaml(CLASS_YAML, findings, "class_yaml_missing", "class metadata exists")
    loadout_data = load_optional_yaml(
        LOADOUT_YAML, findings, "loadout_yaml_missing", "loadout metadata exists"
    )

    if isinstance(class_data, dict) and isinstance(loadout_data, dict):
        resolve_result = resolve_loadout_contract(class_data, loadout_data)
        findings.extend(resolve_result.findings)
        return resolve_result

    if isinstance(class_data, dict):
        validate_class_modules(class_data, findings)
    if isinstance(loadout_data, dict):
        validate_loadout_structure(loadout_data, findings)
    return None


def resolve_workspace_contracts(loadout_result: ResolveResult | None) -> WorkspaceResolveResult:
    findings: list[Finding] = []
    workspaces = {kind: [] for kind in WORKSPACE_KINDS}
    project_agent_seen = False

    for workspace_kind in WORKSPACE_KINDS:
        workspace_root = WORKSPACE_ROOT / workspace_kind
        if not workspace_root.is_dir():
            add(
                findings,
                "FAIL",
                f"workspace_root_{workspace_kind}",
                f"missing workspace root: {relative_to_repo(workspace_root)}",
            )
            continue

        add(
            findings,
            "PASS",
            f"workspace_root_{workspace_kind}",
            f"workspace root exists: {relative_to_repo(workspace_root)}",
        )
        project_dirs = list_project_dirs(workspace_root)
        add(
            findings,
            "PASS",
            f"workspace_scan_{workspace_kind}",
            f"scanned {len(project_dirs)} project directories under {relative_to_repo(workspace_root)}",
        )
        for project_dir in project_dirs:
            record = resolve_project_contract(project_dir, workspace_kind, loadout_result)
            workspaces[workspace_kind].append(record)
            findings.extend(record.warnings)
            findings.extend(record.errors)
            project_agent_seen = project_agent_seen or record.project_agent_present

    if project_agent_seen:
        add(
            findings,
            "WARN",
            "workspace_default_loadout_scope",
            "contract.default_loadout currently validates only against .agent_class/loadout.yaml active_profile until multi-profile support is introduced",
        )

    summary = build_workspace_summary(workspaces)
    return WorkspaceResolveResult(findings=findings, workspaces=workspaces, summary=summary)


def list_project_dirs(workspace_root: Path) -> list[Path]:
    return sorted(
        [
            entry
            for entry in workspace_root.iterdir()
            if entry.is_dir() and not entry.name.startswith(".")
        ],
        key=lambda path: path.name,
    )


def resolve_project_contract(
    project_dir: Path, workspace_kind: str, loadout_result: ResolveResult | None
) -> WorkspaceProjectRecord:
    warnings: list[Finding] = []
    errors: list[Finding] = []
    project_findings: list[Finding] = []
    project_path = relative_to_repo(project_dir)
    project_agent_dir = project_dir / PROJECT_AGENT_DIRNAME
    project_agent_present = project_agent_dir.exists()
    contract_path = project_agent_dir / "contract.yaml"
    capsule_path = project_agent_dir / "capsule_bindings.yaml"
    workflow_path = project_agent_dir / "workflow_bindings.yaml"
    local_state_path = project_agent_dir / "local_state_map.yaml"
    contract = make_project_section(contract_path)
    capsule_bindings = make_project_section(capsule_path)
    workflow_bindings = make_project_section(workflow_path)
    local_state = make_project_section(local_state_path)

    if not project_agent_present:
        return WorkspaceProjectRecord(
            project_path=project_path,
            workspace_kind=workspace_kind,
            state="unbound",
            project_agent_present=False,
            contract=contract,
            capsule_bindings=capsule_bindings,
            workflow_bindings=workflow_bindings,
            local_state=local_state,
            warnings=warnings,
            errors=errors,
        )

    if not project_agent_dir.is_dir():
        add(
            errors,
            "FAIL",
            "project_agent_dir_type",
            f"{project_path}/.project_agent exists but is not a directory",
        )
        return WorkspaceProjectRecord(
            project_path=project_path,
            workspace_kind=workspace_kind,
            state="invalid",
            project_agent_present=True,
            contract=contract,
            capsule_bindings=capsule_bindings,
            workflow_bindings=workflow_bindings,
            local_state=local_state,
            warnings=warnings,
            errors=errors,
        )

    contract_data = validate_project_contract_file(
        contract_path, project_dir, workspace_kind, loadout_result, project_findings
    )
    contract["present"] = contract_path.exists()
    contract["valid"] = contract_data is not None
    if contract_data is not None:
        contract.update(
            {
                "project_id": contract_data["project_id"].strip(),
                "project_name": contract_data["project_name"].strip(),
                "body_ref": contract_data["body_ref"].strip(),
                "class_ref": contract_data["class_ref"].strip(),
                "default_loadout": contract_data["default_loadout"].strip(),
            }
        )

    capsule_data = validate_capsule_bindings_file(capsule_path, project_dir, project_findings)
    capsule_bindings["present"] = capsule_path.exists()
    capsule_bindings["valid"] = capsule_data is not None
    if capsule_data is not None:
        capsule_bindings["binding_count"] = len(capsule_data.get("bindings", []))

    workflow_data = validate_workflow_bindings_file(
        workflow_path, project_dir, loadout_result, project_findings
    )
    workflow_bindings["present"] = workflow_path.exists()
    workflow_bindings["valid"] = workflow_data is not None
    if workflow_data is not None:
        workflow_bindings["binding_count"] = len(workflow_data.get("bindings", []))

    local_state_data = validate_local_state_map_file(local_state_path, project_dir, project_findings)
    local_state["present"] = local_state_path.exists()
    local_state["valid"] = local_state_data is not None
    if local_state_data is not None:
        local_state["entry_count"] = len(local_state_data.get("local_entries", []))

    warnings, errors = split_findings(project_findings)
    state = "bound" if not errors else "invalid"

    return WorkspaceProjectRecord(
        project_path=project_path,
        workspace_kind=workspace_kind,
        state=state,
        project_agent_present=True,
        contract=contract,
        capsule_bindings=capsule_bindings,
        workflow_bindings=workflow_bindings,
        local_state=local_state,
        warnings=warnings,
        errors=errors,
    )


def make_project_section(path: Path) -> dict[str, Any]:
    return {"path": relative_to_repo(path), "present": path.exists(), "valid": False}


def validate_project_contract_file(
    path: Path, project_dir: Path, workspace_kind: str, loadout_result: ResolveResult | None, findings: list[Finding]
) -> dict[str, Any] | None:
    del project_dir

    data = load_project_mapping(path, findings, "project_contract")
    if data is None:
        return None

    valid = True
    missing_keys = [key for key in PROJECT_CONTRACT_KEYS if key not in data]
    if missing_keys:
        add(
            findings,
            "FAIL",
            "project_contract_missing_keys",
            f"{relative_to_repo(path)} missing required fields: " + ", ".join(missing_keys),
        )
        valid = False

    invalid_string_keys = [
        key
        for key in PROJECT_CONTRACT_KEYS
        if key in data and (not isinstance(data[key], str) or not data[key].strip())
    ]
    if invalid_string_keys:
        add(
            findings,
            "FAIL",
            "project_contract_field_type",
            f"{relative_to_repo(path)} requires non-empty string fields: " + ", ".join(invalid_string_keys),
        )
        valid = False

    if not valid:
        return None

    if data["workspace_kind"].strip() != workspace_kind:
        add(
            findings,
            "FAIL",
            "project_contract_workspace_kind",
            f"{relative_to_repo(path)} workspace_kind {data['workspace_kind']} does not match parent root {workspace_kind}",
        )
        valid = False

    if not resolves_exact_repo_path(data["body_ref"].strip(), AGENT_ROOT):
        add(
            findings,
            "FAIL",
            "project_contract_body_ref",
            f"{relative_to_repo(path)} body_ref must resolve to .agent",
        )
        valid = False

    if not resolves_exact_repo_path(data["class_ref"].strip(), CLASS_ROOT):
        add(
            findings,
            "FAIL",
            "project_contract_class_ref",
            f"{relative_to_repo(path)} class_ref must resolve to .agent_class",
        )
        valid = False

    active_profile = loadout_result.active_profile if loadout_result is not None else None
    if active_profile is None:
        add(
            findings,
            "FAIL",
            "project_contract_default_loadout_context",
            f"{relative_to_repo(path)} cannot validate default_loadout because .agent_class/loadout.yaml active_profile is unavailable",
        )
        valid = False
    elif data["default_loadout"].strip() != active_profile:
        add(
            findings,
            "FAIL",
            "project_contract_default_loadout",
            f"{relative_to_repo(path)} default_loadout {data['default_loadout']} does not match active_profile {active_profile}",
        )
        valid = False

    if valid:
        add(
            findings,
            "PASS",
            "project_contract_resolve",
            f"{relative_to_repo(path)} resolves cleanly",
        )
        return data

    return None


def validate_capsule_bindings_file(path: Path, project_dir: Path, findings: list[Finding]) -> dict[str, Any] | None:
    data = load_project_mapping(path, findings, "capsule_bindings")
    if data is None:
        return None

    bindings = data.get("bindings")
    if not isinstance(bindings, list):
        add(
            findings,
            "FAIL",
            "capsule_bindings_list_type",
            f"{relative_to_repo(path)} bindings must be a list",
        )
        return None

    valid = True
    for index, binding in enumerate(bindings, start=1):
        if not isinstance(binding, dict):
            add(
                findings,
                "FAIL",
                "capsule_bindings_entry_type",
                f"{relative_to_repo(path)} bindings[{index}] must be a mapping",
            )
            valid = False
            continue

        if not validate_required_string_fields(
            binding,
            CAPSULE_BINDING_KEYS,
            findings,
            f"{relative_to_repo(path)} bindings[{index}]",
            "capsule_bindings",
        ):
            valid = False
            continue

        if not resolves_owner_ref(binding["source_ref"].strip()):
            add(
                findings,
                "FAIL",
                "capsule_bindings_source_ref",
                f"{relative_to_repo(path)} bindings[{index}].source_ref must resolve under .agent or .agent_class",
            )
            valid = False

        if not is_relative_project_path(binding["target_path"].strip(), project_dir):
            add(
                findings,
                "FAIL",
                "capsule_bindings_target_path",
                f"{relative_to_repo(path)} bindings[{index}].target_path must be a relative path inside the project root",
            )
            valid = False

        if binding["mode"].strip() not in CAPSULE_BINDING_MODES:
            add(
                findings,
                "FAIL",
                "capsule_bindings_mode",
                f"{relative_to_repo(path)} bindings[{index}].mode must be one of: {', '.join(CAPSULE_BINDING_MODES)}",
            )
            valid = False

    if valid:
        add(findings, "PASS", "capsule_bindings_resolve", f"{relative_to_repo(path)} resolves cleanly")
        return data
    return None


def validate_workflow_bindings_file(
    path: Path, project_dir: Path, loadout_result: ResolveResult | None, findings: list[Finding]
) -> dict[str, Any] | None:
    data = load_project_mapping(path, findings, "workflow_bindings")
    if data is None:
        return None

    bindings = data.get("bindings")
    if not isinstance(bindings, list):
        add(
            findings,
            "FAIL",
            "workflow_bindings_list_type",
            f"{relative_to_repo(path)} bindings must be a list",
        )
        return None

    valid = True
    workflow_catalog = loadout_result.catalog["workflows"] if loadout_result is not None else {}
    duplicate_workflow_ids = loadout_result.duplicate_ids["workflows"] if loadout_result is not None else set()
    for index, binding in enumerate(bindings, start=1):
        entry_valid = True
        if not isinstance(binding, dict):
            add(
                findings,
                "FAIL",
                "workflow_bindings_entry_type",
                f"{relative_to_repo(path)} bindings[{index}] must be a mapping",
            )
            valid = False
            continue

        if not validate_required_string_fields(
            {key: binding.get(key) for key in ("workflow_id", "entrypoint", "trigger")},
            ("workflow_id", "entrypoint", "trigger"),
            findings,
            f"{relative_to_repo(path)} bindings[{index}]",
            "workflow_bindings",
        ):
            valid = False
            entry_valid = False

        if "enabled" not in binding or not isinstance(binding["enabled"], bool):
            add(
                findings,
                "FAIL",
                "workflow_bindings_enabled_type",
                f"{relative_to_repo(path)} bindings[{index}].enabled must be a bool",
            )
            valid = False
            entry_valid = False

        if not entry_valid:
            continue

        workflow_id = binding["workflow_id"].strip()
        if workflow_id in duplicate_workflow_ids:
            add(
                findings,
                "FAIL",
                "workflow_bindings_workflow_id_duplicate",
                f"{relative_to_repo(path)} bindings[{index}].workflow_id {workflow_id} is duplicated in the installed workflow catalog",
            )
            valid = False
            entry_valid = False
        elif workflow_id not in workflow_catalog:
            add(
                findings,
                "FAIL",
                "workflow_bindings_workflow_id_unknown",
                f"{relative_to_repo(path)} bindings[{index}].workflow_id {workflow_id} is not in the installed workflow catalog",
            )
            valid = False
            entry_valid = False
        elif binding["entrypoint"].strip() != workflow_catalog[workflow_id].entrypoint:
            manifest_entrypoint = workflow_catalog[workflow_id].entrypoint
            add(
                findings,
                "FAIL",
                "workflow_bindings_entrypoint_mismatch",
                f"{relative_to_repo(path)} bindings[{index}].entrypoint {binding['entrypoint']} does not match workflow manifest entrypoint {manifest_entrypoint}",
            )
            valid = False
            entry_valid = False

        if binding["trigger"].strip() not in WORKFLOW_TRIGGERS:
            add(
                findings,
                "FAIL",
                "workflow_bindings_trigger",
                f"{relative_to_repo(path)} bindings[{index}].trigger must be one of: {', '.join(WORKFLOW_TRIGGERS)}",
            )
            valid = False
            entry_valid = False

        if "read_paths" in binding and not validate_optional_project_path_list(
            binding["read_paths"],
            project_dir,
            findings,
            f"{relative_to_repo(path)} bindings[{index}].read_paths",
            "workflow_bindings_read_paths",
        ):
            valid = False
            entry_valid = False

        if "write_paths" in binding and not validate_optional_project_path_list(
            binding["write_paths"],
            project_dir,
            findings,
            f"{relative_to_repo(path)} bindings[{index}].write_paths",
            "workflow_bindings_write_paths",
        ):
            valid = False
            entry_valid = False

        mutation_mode = binding.get("mutation_mode")
        if mutation_mode is not None:
            if not isinstance(mutation_mode, str) or not mutation_mode.strip():
                add(
                    findings,
                    "FAIL",
                    "workflow_bindings_mutation_mode_type",
                    f"{relative_to_repo(path)} bindings[{index}].mutation_mode must be a non-empty string",
                )
                valid = False
                entry_valid = False
            elif mutation_mode.strip() not in WORKFLOW_MUTATION_MODES:
                add(
                    findings,
                    "FAIL",
                    "workflow_bindings_mutation_mode",
                    f"{relative_to_repo(path)} bindings[{index}].mutation_mode must be one of: {', '.join(WORKFLOW_MUTATION_MODES)}",
                )
                valid = False
                entry_valid = False

        if "write_paths" in binding and mutation_mode is None:
            add(
                findings,
                "FAIL",
                "workflow_bindings_write_paths_requires_mutation_mode",
                f"{relative_to_repo(path)} bindings[{index}].write_paths requires mutation_mode",
            )
            valid = False
            entry_valid = False

        if (
            isinstance(mutation_mode, str)
            and mutation_mode.strip() == "read_only"
            and "write_paths" in binding
        ):
            add(
                findings,
                "FAIL",
                "workflow_bindings_read_only_write_paths",
                f"{relative_to_repo(path)} bindings[{index}] cannot declare write_paths with mutation_mode read_only",
            )
            valid = False
            entry_valid = False

    if valid:
        add(findings, "PASS", "workflow_bindings_resolve", f"{relative_to_repo(path)} resolves cleanly")
        return data
    return None


def validate_local_state_map_file(path: Path, project_dir: Path, findings: list[Finding]) -> dict[str, Any] | None:
    data = load_project_mapping(path, findings, "local_state_map")
    if data is None:
        return None

    local_entries = data.get("local_entries")
    if not isinstance(local_entries, list):
        add(
            findings,
            "FAIL",
            "local_state_map_list_type",
            f"{relative_to_repo(path)} local_entries must be a list",
        )
        return None

    valid = True
    for index, entry in enumerate(local_entries, start=1):
        if not isinstance(entry, dict):
            add(
                findings,
                "FAIL",
                "local_state_map_entry_type",
                f"{relative_to_repo(path)} local_entries[{index}] must be a mapping",
            )
            valid = False
            continue

        string_subset = {key: entry.get(key) for key in ("key", "path", "purpose")}
        if not validate_required_string_fields(
            string_subset,
            ("key", "path", "purpose"),
            findings,
            f"{relative_to_repo(path)} local_entries[{index}]",
            "local_state_map",
        ):
            valid = False

        if "tracked" not in entry or not isinstance(entry["tracked"], bool):
            add(
                findings,
                "FAIL",
                "local_state_map_tracked_type",
                f"{relative_to_repo(path)} local_entries[{index}].tracked must be a bool",
            )
            valid = False

        path_value = entry.get("path")
        if isinstance(path_value, str) and not is_relative_project_path(path_value.strip(), project_dir):
            add(
                findings,
                "FAIL",
                "local_state_map_path",
                f"{relative_to_repo(path)} local_entries[{index}].path must be a relative path inside the project root",
            )
            valid = False

    if valid:
        add(findings, "PASS", "local_state_map_resolve", f"{relative_to_repo(path)} resolves cleanly")
        return data
    return None


def validate_required_string_fields(
    data: dict[str, Any], required_keys: tuple[str, ...], findings: list[Finding], location: str, code_prefix: str
) -> bool:
    valid = True
    missing_keys = [key for key in required_keys if key not in data]
    if missing_keys:
        add(
            findings,
            "FAIL",
            f"{code_prefix}_missing_keys",
            f"{location} missing required fields: " + ", ".join(missing_keys),
        )
        valid = False

    invalid_keys = [
        key for key in required_keys if key in data and (not isinstance(data[key], str) or not data[key].strip())
    ]
    if invalid_keys:
        add(
            findings,
            "FAIL",
            f"{code_prefix}_field_type",
            f"{location} requires non-empty string fields: " + ", ".join(invalid_keys),
        )
        valid = False

    return valid


def resolves_exact_repo_path(ref: str, expected_path: Path) -> bool:
    if not ref:
        return False
    if Path(ref).is_absolute():
        return False
    resolved_path = (REPO_ROOT / ref).resolve()
    try:
        resolved_path.relative_to(REPO_ROOT.resolve())
    except ValueError:
        return False
    return resolved_path == expected_path.resolve()


def resolves_owner_ref(ref: str) -> bool:
    if not ref:
        return False
    ref_path = Path(ref)
    if ref_path.is_absolute():
        return False
    if not ref_path.parts or ref_path.parts[0] not in (".agent", ".agent_class"):
        return False
    resolved_path = (REPO_ROOT / ref_path).resolve()
    allowed_root = AGENT_ROOT if ref_path.parts[0] == ".agent" else CLASS_ROOT
    try:
        resolved_path.relative_to(allowed_root.resolve())
    except ValueError:
        return False
    return resolved_path.exists()


def is_relative_project_path(path_value: str, project_dir: Path) -> bool:
    if not path_value:
        return False
    candidate = Path(path_value)
    if candidate.is_absolute():
        return False
    resolved_path = (project_dir / candidate).resolve()
    try:
        resolved_path.relative_to(project_dir.resolve())
    except ValueError:
        return False
    return True


def validate_optional_project_path_list(
    value: Any, project_dir: Path, findings: list[Finding], location: str, code_prefix: str
) -> bool:
    if not isinstance(value, list) or not value:
        add(
            findings,
            "FAIL",
            f"{code_prefix}_type",
            f"{location} must be a non-empty list of relative project paths",
        )
        return False

    valid = True
    for index, entry in enumerate(value, start=1):
        if not isinstance(entry, str) or not entry.strip():
            add(
                findings,
                "FAIL",
                f"{code_prefix}_entry_type",
                f"{location}[{index}] must be a non-empty string",
            )
            valid = False
            continue
        if not is_relative_project_path(entry.strip(), project_dir):
            add(
                findings,
                "FAIL",
                f"{code_prefix}_entry_path",
                f"{location}[{index}] must be a relative path inside the project root",
            )
            valid = False
    return valid


def build_workspace_summary(workspaces: dict[str, list[WorkspaceProjectRecord]]) -> dict[str, int]:
    bound = sum(1 for kind in WORKSPACE_KINDS for project in workspaces[kind] if project.state == "bound")
    unbound = sum(1 for kind in WORKSPACE_KINDS for project in workspaces[kind] if project.state == "unbound")
    invalid = sum(1 for kind in WORKSPACE_KINDS for project in workspaces[kind] if project.state == "invalid")
    total = sum(len(workspaces[kind]) for kind in WORKSPACE_KINDS)
    return {"bound": bound, "unbound": unbound, "invalid": invalid, "total": total}


def validate_body(
    body_data: dict[str, Any], findings: list[Finding], actual_presence_by_path: dict[str, bool]
) -> None:
    sections = body_data.get("sections")
    if not isinstance(sections, dict):
        add(findings, "FAIL", "body_sections_type", "body.yaml sections must be a mapping")
        return

    section_paths: list[str] = []
    invalid_sections: list[str] = []
    for section_name, section_value in sections.items():
        relative_path = get_body_section_path(section_value)
        if relative_path is None:
            invalid_sections.append(section_name)
            continue
        section_paths.append(relative_path)

    if invalid_sections:
        add(
            findings,
            "FAIL",
            "body_sections_path_type",
            "every body.yaml section path must be a string or mapping with path (" + ", ".join(invalid_sections) + ")",
        )
        return

    duplicates = [path for path, count in Counter(section_paths).items() if count > 1]
    if duplicates:
        duplicate_list = ", ".join(sorted(duplicates))
        add(findings, "FAIL", "body_sections_duplicate_path", f"duplicate body section paths: {duplicate_list}")
    else:
        add(findings, "PASS", "body_sections_unique", "body section paths are unique")

    missing_sections = []
    for section_name, section_value in sections.items():
        relative_path = get_body_section_path(section_value)
        if relative_path is None:
            continue
        present = resolve_body_section_path(relative_path).is_dir()
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
    for section_name, section_value in sections.items():
        relative_path = get_body_section_path(section_value)
        if relative_path is None:
            path_errors.append(section_name)
            continue
        state_entry = state_sections.get(section_name)
        if not isinstance(state_entry, dict):
            path_errors.append(section_name)
            continue
        state_path = state_entry.get("path")
        state_present = state_entry.get("present")
        if state_path != relative_path:
            path_errors.append(section_name)
        actual_present = actual_presence_by_path.get(relative_path, resolve_body_section_path(relative_path).is_dir())
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

    for key in ("active_selection", "catalog_layer"):
        expected_value = expected_body_state.get(key) if expected_body_state else None
        actual_value = body_state_data.get(key)
        if actual_value == expected_value:
            add(findings, "PASS", f"body_state_{key}", f"body_state {key} matches body definition")
        else:
            add(findings, "FAIL", f"body_state_{key}", f"body_state {key} does not match body definition")


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


def derive_result_level(warnings: list[Any], errors: list[Any]) -> str:
    if errors:
        return "FAIL"
    if warnings:
        return "WARN"
    return "PASS"


def build_diagnostics_payload(findings: list[Finding]) -> dict[str, list[dict[str, str]]]:
    warnings, errors = split_findings(findings)
    return {
        "warnings": [finding.as_dict() for finding in warnings],
        "errors": [finding.as_dict() for finding in errors],
    }


def build_ui_payload() -> dict[str, list[dict[str, Any]]]:
    return {
        "tabs": [{"id": tab_id, "label": label, "enabled": True} for tab_id, label in TAB_SPECS]
    }


def build_body_payload(body_data: dict[str, Any] | None, body_state_data: dict[str, Any] | None) -> dict[str, Any]:
    body_sections = body_data.get("sections") if isinstance(body_data, dict) else None
    state_sections = body_state_data.get("sections") if isinstance(body_state_data, dict) else None

    section_entries: list[dict[str, Any]] = []
    if isinstance(body_sections, dict):
        for section_id, section_value in body_sections.items():
            relative_path = get_body_section_path(section_value)
            if not isinstance(section_id, str) or relative_path is None:
                continue
            state_entry = state_sections.get(section_id) if isinstance(state_sections, dict) else None
            present = (
                state_entry.get("present")
                if isinstance(state_entry, dict) and isinstance(state_entry.get("present"), bool)
                else resolve_body_section_path(relative_path).is_dir()
            )
            section_entries.append(
                {
                    "id": section_id,
                    "path": relative_path,
                    "present": present,
                }
            )
    elif isinstance(state_sections, dict):
        for section_id, state_entry in state_sections.items():
            if not isinstance(section_id, str) or not isinstance(state_entry, dict):
                continue
            path_value = state_entry.get("path")
            if not isinstance(path_value, str):
                continue
            present = (
                state_entry.get("present")
                if isinstance(state_entry.get("present"), bool)
                else (AGENT_ROOT / path_value).is_dir()
            )
            section_entries.append(
                {
                    "id": section_id,
                    "path": path_value,
                    "present": present,
                }
            )

    body_id = None
    if isinstance(body_data, dict) and isinstance(body_data.get("id"), str):
        body_id = body_data["id"]
    elif isinstance(body_state_data, dict) and isinstance(body_state_data.get("body_id"), str):
        body_id = body_state_data["body_id"]

    name = body_data.get("name") if isinstance(body_data, dict) and isinstance(body_data.get("name"), str) else None

    return {
        "id": body_id,
        "name": name,
        "sections": section_entries,
    }


def records_to_sorted_payload(records: dict[str, ModuleRecord]) -> list[dict[str, Any]]:
    return [record.as_dict() for record in sorted(records.values(), key=lambda item: item.module_id)]


def workflow_dependency_status(
    workflow: ModuleRecord,
    catalog: dict[str, dict[str, ModuleRecord]],
    duplicate_ids: dict[str, set[str]],
) -> str:
    requires = workflow.requires or {key: [] for key in WORKFLOW_REQUIRE_KEYS}
    for dependency_key in WORKFLOW_REQUIRE_KEYS:
        for module_id in requires.get(dependency_key, []):
            if module_id in duplicate_ids[dependency_key]:
                return "invalid"
            if catalog[dependency_key].get(module_id) is None:
                return "invalid"
    return "resolved"


def build_class_payload(
    class_data: dict[str, Any] | None,
    loadout_data: dict[str, Any] | None,
    resolve_result: ResolveResult | None,
) -> dict[str, Any]:
    installed = {key: [] for key in REQUIRED_EQUIPPED_KEYS}
    equipped = {key: [] for key in REQUIRED_EQUIPPED_KEYS}
    tools_by_family = {family: [] for family in TOOL_FAMILIES}
    workflow_cards: list[dict[str, Any]] = []

    if resolve_result is not None:
        installed = {key: records_to_sorted_payload(resolve_result.catalog[key]) for key in REQUIRED_EQUIPPED_KEYS}
        equipped = {
            key: [record.as_dict() for record in resolve_result.equipped_resolved.get(key, [])]
            for key in REQUIRED_EQUIPPED_KEYS
        }
        for tool in sorted(resolve_result.catalog["tools"].values(), key=lambda item: item.module_id):
            if tool.family in tools_by_family:
                tools_by_family[tool.family].append(tool.as_dict())

        equipped_workflow_ids = {
            record.module_id for record in resolve_result.equipped_resolved.get("workflows", [])
        }
        for workflow in sorted(resolve_result.catalog["workflows"].values(), key=lambda item: item.module_id):
            workflow_cards.append(
                {
                    "id": workflow.module_id,
                    "name": workflow.name,
                    "version": workflow.version,
                    "description": workflow.description,
                    "entrypoint": workflow.entrypoint,
                    "equipped": workflow.module_id in equipped_workflow_ids,
                    "requires": workflow.requires or {key: [] for key in WORKFLOW_REQUIRE_KEYS},
                    "dependency_status": workflow_dependency_status(
                        workflow,
                        resolve_result.catalog,
                        resolve_result.duplicate_ids,
                    ),
                }
            )

    class_id = None
    if isinstance(class_data, dict) and isinstance(class_data.get("id"), str):
        class_id = class_data["id"]
    elif isinstance(loadout_data, dict) and isinstance(loadout_data.get("class_id"), str):
        class_id = loadout_data["class_id"]
    elif resolve_result is not None:
        class_id = resolve_result.class_id

    active_profile = None
    if isinstance(loadout_data, dict) and isinstance(loadout_data.get("active_profile"), str):
        active_profile = loadout_data["active_profile"]
    elif resolve_result is not None:
        active_profile = resolve_result.active_profile

    return {
        "id": class_id,
        "active_profile": active_profile,
        "installed": installed,
        "equipped": equipped,
        "tools_by_family": tools_by_family,
        "workflow_cards": workflow_cards,
    }


def build_project_derived_payload(project: WorkspaceProjectRecord) -> dict[str, Any]:
    return {
        "project_path": project.project_path,
        "workspace_kind": project.workspace_kind,
        "state": project.state,
        "project_agent_present": project.project_agent_present,
        "contract": {
            "project_id": project.contract.get("project_id"),
            "project_name": project.contract.get("project_name"),
            "default_loadout": project.contract.get("default_loadout"),
            "body_ref": project.contract.get("body_ref"),
            "class_ref": project.contract.get("class_ref"),
            "path": project.contract.get("path"),
            "present": project.contract.get("present"),
            "valid": project.contract.get("valid"),
        },
        "capsule_binding_count": project.capsule_bindings.get("binding_count", 0),
        "workflow_binding_count": project.workflow_bindings.get("binding_count", 0),
        "local_state_entry_count": project.local_state.get("entry_count", 0),
        "file_status": {
            "capsule_bindings": project.capsule_bindings,
            "workflow_bindings": project.workflow_bindings,
            "local_state": project.local_state,
        },
        "warnings": [finding.as_dict() for finding in project.warnings],
        "errors": [finding.as_dict() for finding in project.errors],
    }


def build_workspaces_payload(workspace_result: WorkspaceResolveResult) -> dict[str, Any]:
    return {
        "summary": workspace_result.summary,
        "company": {
            "projects": [
                build_project_derived_payload(project) for project in workspace_result.workspaces["company"]
            ]
        },
        "personal": {
            "projects": [
                build_project_derived_payload(project) for project in workspace_result.workspaces["personal"]
            ]
        },
    }


def build_overview_payload(
    body_payload: dict[str, Any],
    class_payload: dict[str, Any],
    workspace_payload: dict[str, Any],
    diagnostics_payload: dict[str, list[dict[str, str]]],
) -> dict[str, Any]:
    warnings = diagnostics_payload["warnings"]
    errors = diagnostics_payload["errors"]
    return {
        "body_id": body_payload.get("id"),
        "class_id": class_payload.get("id"),
        "active_profile": class_payload.get("active_profile"),
        "counts": {
            "body_sections_present": sum(
                1 for section in body_payload.get("sections", []) if section.get("present") is True
            ),
            "installed": {
                key: len(class_payload["installed"].get(key, [])) for key in REQUIRED_EQUIPPED_KEYS
            },
            "equipped": {
                key: len(class_payload["equipped"].get(key, [])) for key in REQUIRED_EQUIPPED_KEYS
            },
            "projects": {
                "total": workspace_payload["summary"].get("total", 0),
                "bound": workspace_payload["summary"].get("bound", 0),
                "unbound": workspace_payload["summary"].get("unbound", 0),
                "invalid": workspace_payload["summary"].get("invalid", 0),
            },
        },
        "status": {
            "result": derive_result_level(warnings, errors),
            "warning_count": len(warnings),
            "error_count": len(errors),
        },
    }


def build_derived_state_payload(
    findings: list[Finding],
    body_data: dict[str, Any] | None,
    body_state_data: dict[str, Any] | None,
    class_data: dict[str, Any] | None,
    loadout_data: dict[str, Any] | None,
    resolve_result: ResolveResult | None,
    workspace_result: WorkspaceResolveResult,
) -> dict[str, Any]:
    diagnostics_payload = build_diagnostics_payload(findings)
    body_payload = build_body_payload(body_data, body_state_data)
    class_payload = build_class_payload(class_data, loadout_data, resolve_result)
    workspace_payload = build_workspaces_payload(workspace_result)
    return {
        "ui": build_ui_payload(),
        "overview": build_overview_payload(
            body_payload,
            class_payload,
            workspace_payload,
            diagnostics_payload,
        ),
        "body": body_payload,
        "class": class_payload,
        "workspaces": workspace_payload,
        "diagnostics": diagnostics_payload,
    }


def render_derived_state_text(payload: dict[str, Any]) -> str:
    overview = payload["overview"]
    counts = overview["counts"]
    status = overview["status"]
    return "\n".join(
        [
            f"{status['result']} derive-ui-state",
            f"  body: {overview['body_id'] or '-'}",
            f"  class: {overview['class_id'] or '-'}",
            f"  active_profile: {overview['active_profile'] or '-'}",
            (
                "  installed: "
                f"skills {counts['installed']['skills']}, "
                f"tools {counts['installed']['tools']}, "
                f"workflows {counts['installed']['workflows']}, "
                f"knowledge {counts['installed']['knowledge']}"
            ),
            (
                "  equipped: "
                f"skills {counts['equipped']['skills']}, "
                f"tools {counts['equipped']['tools']}, "
                f"workflows {counts['equipped']['workflows']}, "
                f"knowledge {counts['equipped']['knowledge']}"
            ),
            (
                "  projects: "
                f"total {counts['projects']['total']}, "
                f"bound {counts['projects']['bound']}, "
                f"unbound {counts['projects']['unbound']}, "
                f"invalid {counts['projects']['invalid']}"
            ),
            f"  diagnostics: warn {status['warning_count']}, error {status['error_count']}",
        ]
    )


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


def run_resolve_workspaces(as_json: bool) -> int:
    findings: list[Finding] = []
    resolve_result = prepare_loadout_context(findings)
    workspace_result = resolve_workspace_contracts(resolve_result)
    findings.extend(workspace_result.findings)
    validation = summarize_findings(findings)
    warnings, errors = split_findings(findings)
    exit_code = 1 if validation["fail"] else 0

    if as_json:
        print(
            json.dumps(
                {
                    "command": "resolve-workspaces",
                    **workspace_result.as_dict(),
                    "warnings": [finding.as_dict() for finding in warnings],
                    "errors": [finding.as_dict() for finding in errors],
                    "validation": validation,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return exit_code

    for finding in findings:
        if finding.level in ("WARN", "FAIL"):
            print(f"{finding.level} {finding.message}")
    for workspace_kind in WORKSPACE_KINDS:
        for project in workspace_result.workspaces[workspace_kind]:
            print(f"{project.state.upper()} {project.project_path}")
    print(
        f"{validation['result']} resolve-workspaces validation: "
        f"{validation['pass']} pass, {validation['warn']} warn, {validation['fail']} fail"
    )
    print(
        "  workspace summary: "
        f"total {workspace_result.summary['total']}, "
        f"bound {workspace_result.summary['bound']}, "
        f"unbound {workspace_result.summary['unbound']}, "
        f"invalid {workspace_result.summary['invalid']}"
    )
    return exit_code


def run_validate(as_json: bool) -> int:
    findings, resolve_result, workspace_result = validate_repo()
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
        payload["resolve_workspaces"] = workspace_result.as_dict()
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        for finding in findings:
            print(f"{finding.level} {finding.message}")
        print(
            f"{summary['result']} validation summary: "
            f"{summary['pass']} pass, {summary['warn']} warn, {summary['fail']} fail"
        )
        print(
            "  workspace summary: "
            f"total {workspace_result.summary['total']}, "
            f"bound {workspace_result.summary['bound']}, "
            f"unbound {workspace_result.summary['unbound']}, "
            f"invalid {workspace_result.summary['invalid']}"
        )

    return exit_code


def run_derive_ui_state(as_json: bool) -> int:
    findings, resolve_result, workspace_result = validate_repo()
    body_data = safe_load_mapping(BODY_YAML)
    body_state_data = safe_load_mapping(BODY_STATE_YAML)
    class_data = safe_load_mapping(CLASS_YAML)
    loadout_data = safe_load_mapping(LOADOUT_YAML)
    payload = build_derived_state_payload(
        findings,
        body_data,
        body_state_data,
        class_data,
        loadout_data,
        resolve_result,
        workspace_result,
    )
    exit_code = 1 if payload["overview"]["status"]["error_count"] else 0

    if as_json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return exit_code

    print(render_derived_state_text(payload))
    return exit_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Soulforge body sync, resolve, derive, and validate local CLI."
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

    resolve_workspaces_parser = subparsers.add_parser(
        "resolve-workspaces",
        help="Resolve workspace project contracts from _workspaces and classify bound/unbound/invalid states.",
    )
    resolve_workspaces_parser.add_argument(
        "--json", action="store_true", help="Print machine-readable JSON output."
    )

    derive_parser = subparsers.add_parser(
        "derive-ui-state",
        help="Derive stable renderer input JSON from body, class/loadout, and workspace resolve results.",
    )
    derive_parser.add_argument(
        "--json", action="store_true", help="Print machine-readable JSON output."
    )

    validate_parser = subparsers.add_parser(
        "validate",
        help="Validate body/class/loadout metadata, body_state consistency, loadout resolve, and workspace project contracts.",
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
        if args.command == "resolve-workspaces":
            return run_resolve_workspaces(as_json=args.json)
        if args.command == "derive-ui-state":
            return run_derive_ui_state(as_json=args.json)
        if args.command == "validate":
            return run_validate(as_json=args.json)
    except (FileNotFoundError, YamlParseError) as error:
        print(f"FAIL {error}", file=sys.stderr)
        return 1

    parser.error(f"unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    sys.exit(main())

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, readlinkSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

const DEFAULT_BINDING_REF = "_workmeta/system/bindings/workspace_junctions.yaml";
const DEFAULT_WORKSPACE_ROOT = "_workspaces";
const DEFAULT_RESERVED_NAMES = new Set(["README.md", "system", "00_project_index.html"]);

export function auditWorkspaceJunctions(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const bindingRef = options.bindingRef ?? DEFAULT_BINDING_REF;
  const workspaceRootRef = options.workspaceRootRef ?? DEFAULT_WORKSPACE_ROOT;
  const reservedNames = new Set(options.reservedNames ?? DEFAULT_RESERVED_NAMES);
  const bindingPath = path.resolve(repoRoot, bindingRef);
  const workspaceRoot = path.resolve(repoRoot, workspaceRootRef);

  if (!existsSync(bindingPath)) {
    return {
      status: "blocked",
      reason: "junction_binding_missing",
      binding_ref: bindingRef,
      workspace_root_ref: workspaceRootRef,
      rows: [],
      problems: [],
      extras: [],
      host_local_absolute_paths_in_output: false,
    };
  }

  const binding = YAML.parse(readFileText(bindingPath));
  const entries = (binding?.junctions ?? []).filter((entry) => entry?.state === "active");
  const rows = entries.map((entry) => auditEntry({
    repoRoot,
    workspaceRoot,
    workspaceRootRef,
    entry,
  }));

  const declaredAliases = new Set(entries.map((entry) => entry.workspace_alias));
  const extras = existsSync(workspaceRoot)
    ? readdirSync(workspaceRoot)
      .filter((name) => !name.startsWith("."))
      .filter((name) => !reservedNames.has(name))
      .filter((name) => !declaredAliases.has(name))
      .map((name) => {
        const localPath = path.join(workspaceRoot, name);
        const st = lstatSync(localPath, { throwIfNoEntry: false });
        return {
          workspace_alias: name,
          observed_local_state: st?.isSymbolicLink() ? "extra_link" : "extra_entry",
          action: st?.isSymbolicLink() ? "report_gap" : "owner_decision_required",
        };
      })
    : [];

  const problems = [
    ...rows.filter((row) => row.observed_local_state !== "link_ok" || row.target_suffix_ok !== true),
    ...extras,
  ];
  const rootPrefixes = new Set(
    rows
      .filter((row) => row.target_suffix_ok && row._redacted_root_key)
      .map((row) => row._redacted_root_key),
  );

  return {
    status: problems.length === 0 ? "passed" : "gaps_found",
    reason: problems.length === 0 ? "all_declared_junctions_match_binding" : "junction_gaps_found",
    binding_ref: bindingRef,
    workspace_root_ref: workspaceRootRef,
    declared_active_count: entries.length,
    checked_count: rows.length,
    root_consistency: rootPrefixes.size <= 1 ? "single_root" : `multiple_roots_${rootPrefixes.size}`,
    rows: rows.map(stripInternalKeys),
    problems: problems.map(stripInternalKeys),
    extras,
    host_local_absolute_paths_in_output: false,
  };
}

function auditEntry({ repoRoot, workspaceRoot, workspaceRootRef, entry }) {
  const alias = entry.workspace_alias;
  const linkRef = entry.link_relative_path ?? path.join(workspaceRootRef, alias);
  const linkPath = path.resolve(repoRoot, linkRef);
  const expectedSuffix = entry.cloud_relative_path ?? "";
  const baseRow = {
    workspace_alias: alias,
    project_code: entry.project_code ?? null,
    link_relative_path: normalizeRepoPath(linkRef),
    declared_state: entry.state ?? "unknown",
    expected_target_suffix: normalizePortablePath(expectedSuffix),
  };

  const st = lstatSync(linkPath, { throwIfNoEntry: false });
  if (!st) {
    return {
      ...baseRow,
      observed_local_state: "missing",
      target_suffix_ok: false,
      action: "repair_candidate",
      notes: ["local link path is missing"],
    };
  }

  if (!st.isSymbolicLink()) {
    return {
      ...baseRow,
      observed_local_state: st.isDirectory() ? "directory_not_link" : "file_not_link",
      target_suffix_ok: false,
      action: "owner_decision_required",
      notes: ["local path exists but is not a symlink/junction pointer"],
    };
  }

  const resolvedTarget = resolveLinkTarget(linkPath);
  const targetExists = existsSync(resolvedTarget);
  const suffixOk = expectedSuffix ? targetMatchesSuffix(resolvedTarget, expectedSuffix) : false;
  const rootKey = suffixOk ? redactedRootKey(resolvedTarget, expectedSuffix) : null;

  return {
    ...baseRow,
    observed_local_state: targetExists ? "link_ok" : "link_broken",
    target_suffix_ok: suffixOk,
    actual_target_tail: redactedTail(resolvedTarget),
    action: targetExists && suffixOk ? "none" : "repair_candidate",
    notes: buildNotes({ targetExists, suffixOk }),
    _redacted_root_key: rootKey,
  };
}

function buildNotes({ targetExists, suffixOk }) {
  const notes = [];
  if (!targetExists) notes.push("link target does not exist");
  if (!suffixOk) notes.push("link target suffix does not match binding cloud_relative_path");
  return notes;
}

function resolveLinkTarget(linkPath) {
  try {
    return realpathSync.native(linkPath);
  } catch {
    const raw = readlinkSync(linkPath);
    return path.resolve(path.dirname(linkPath), raw);
  }
}

function targetMatchesSuffix(targetPath, expectedSuffix) {
  const target = normalizeForCompare(targetPath);
  const suffix = normalizeForCompare(expectedSuffix);
  return target === suffix || target.endsWith(`/${suffix}`);
}

function redactedRootKey(targetPath, expectedSuffix) {
  const target = normalizeForCompare(targetPath);
  const suffix = normalizeForCompare(expectedSuffix);
  return target.slice(0, target.length - suffix.length).replace(/\/+$/u, "");
}

function redactedTail(targetPath, maxSegments = 2) {
  const parts = normalizePortablePath(targetPath).split("/").filter(Boolean);
  return parts.slice(-maxSegments).join("/");
}

function normalizeForCompare(value) {
  const normalized = normalizePortablePath(value).replace(/\/+$/u, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function normalizePortablePath(value) {
  return String(value ?? "").normalize("NFC").split(path.sep).join("/").replace(/\\/gu, "/");
}

function normalizeRepoPath(value) {
  return normalizePortablePath(value).replace(/^\.\//u, "");
}

function stripInternalKeys(row) {
  const { _redacted_root_key, ...publicRow } = row;
  return publicRow;
}

function readFileText(filePath) {
  return readFileSync(filePath, "utf8").replace(/^\uFEFF/u, "");
}

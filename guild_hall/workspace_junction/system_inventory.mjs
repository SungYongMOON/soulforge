import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

export const SYSTEM_INVENTORY_SCHEMA_VERSION = "soulforge.workspace_system_inventory.v0";

const DEFAULT_BINDING_REF = "_workmeta/system/bindings/workspace_junctions.yaml";
const DEFAULT_SYSTEM_REF = "_workspaces/system";
const DEFAULT_MAX_DEPTH = Number.POSITIVE_INFINITY;
const DEFAULT_MAX_ENTRIES = Number.POSITIVE_INFINITY;

const CLASS_NAMES = [
  "shared_generated_view",
  "shared_fixture_candidate",
  "project_reference_payload_review",
  "project_move",
  "knowledge_move",
  "pc_local_runtime_tool",
  "pc_local_cache_temp",
  "repo_promote_review",
  "conflict_review",
  "unknown_review",
];

export function inventoryWorkspaceSystem(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const bindingRef = normalizeRepoPath(options.bindingRef ?? DEFAULT_BINDING_REF);
  const sourceRootRef = normalizeRepoPath(options.sourceRootRef ?? DEFAULT_SYSTEM_REF);
  const binding = readBinding({ repoRoot, bindingRef });
  const bindingEntry = findSystemBinding(binding.data, sourceRootRef);
  const bindingState = bindingEntry?.state ?? "missing";
  const sourceRoot = path.resolve(repoRoot, sourceRootRef);
  const observedLocalState = observeLocalState(sourceRoot);
  const maxDepth = normalizeScanLimit(options.maxDepth, DEFAULT_MAX_DEPTH);
  const maxEntries = normalizeScanLimit(options.maxEntries, DEFAULT_MAX_ENTRIES);
  const rows = observedLocalState === "missing" || observedLocalState === "file_not_link" || observedLocalState === "link_broken"
    ? []
    : listTopLevelRows({
        sourceRoot,
        sourceRootRef,
        maxDepth,
        maxEntries,
      });
  const summaryCounts = summarizeRows(rows);
  const blockers = buildBlockers({ binding, bindingState, observedLocalState, rows });
  const status = statusFor({ bindingState, observedLocalState, blockers });

  return {
    schema_version: SYSTEM_INVENTORY_SCHEMA_VERSION,
    kind: "workspace_system_inventory",
    status,
    reason: reasonFor({ bindingState, observedLocalState, blockers }),
    source_root_ref: sourceRootRef,
    binding_ref: bindingRef,
    binding_state: bindingState,
    observed_local_state: observedLocalState,
    migration_status: migrationStatusFor({ bindingState, observedLocalState, blockers }),
    scan_policy: {
      full_scan: !Number.isFinite(maxDepth) && !Number.isFinite(maxEntries),
      max_depth: formatScanLimit(maxDepth),
      max_entries: formatScanLimit(maxEntries),
      scan_limited_is_blocker: true,
    },
    boundary: {
      metadata_only: true,
      file_contents_read: false,
      host_local_absolute_paths_in_output: false,
      mutations_performed: false,
      secrets_or_sessions_read: false,
      payload_titles_or_excerpts_read: false,
    },
    counts: {
      top_level_entry_count: rows.length,
      blocker_count: blockers.length,
      ...summaryCounts,
    },
    rows,
    blockers,
    next_actions: nextActionsFor({ status, observedLocalState, blockers }),
  };
}

export function workspaceSystemWriteBlocker(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const outputRef = normalizeRepoPath(options.outputRef ?? "");
  const sourceRootRef = normalizeRepoPath(options.sourceRootRef ?? DEFAULT_SYSTEM_REF);
  if (!outputRef.startsWith(`${sourceRootRef}/`)) {
    return null;
  }

  const bindingRef = normalizeRepoPath(options.bindingRef ?? DEFAULT_BINDING_REF);
  const binding = readBinding({ repoRoot, bindingRef });
  if (!binding.exists) {
    return null;
  }

  const bindingEntry = findSystemBinding(binding.data, sourceRootRef);
  if (!bindingEntry) {
    return null;
  }

  const sourceRoot = path.resolve(repoRoot, sourceRootRef);
  const observedLocalState = observeLocalState(sourceRoot);
  const bindingState = bindingEntry.state ?? "missing";
  if (bindingState !== "active" || observedLocalState !== "link_ok") {
    return {
      code: "workspace_system_migration_required",
      message:
        "workspace_system_migration_required: use _workspaces/_local/<node_id>/system/... or complete _workspaces/system shared-link migration before writing default system outputs",
      source_root_ref: sourceRootRef,
      binding_ref: bindingRef,
      binding_state: bindingState,
      observed_local_state: observedLocalState,
    };
  }

  return null;
}

export function assertWorkspaceSystemWriteAllowed(options = {}) {
  const blocker = workspaceSystemWriteBlocker(options);
  if (!blocker) return;
  const error = new Error(blocker.message);
  error.code = blocker.code;
  error.details = blocker;
  throw error;
}

function readBinding({ repoRoot, bindingRef }) {
  const bindingPath = path.resolve(repoRoot, bindingRef);
  if (!existsSync(bindingPath)) {
    return { exists: false, data: null, parse_error: null };
  }
  try {
    const raw = readFileSync(bindingPath, "utf8").replace(/^\uFEFF/u, "");
    return { exists: true, data: YAML.parse(raw), parse_error: null };
  } catch (error) {
    return { exists: true, data: null, parse_error: error.message };
  }
}

function findSystemBinding(binding, sourceRootRef) {
  const entries = Array.isArray(binding?.junctions) ? binding.junctions : [];
  return entries.find(
    (entry) =>
      entry?.workspace_alias === "system" ||
      normalizeRepoPath(entry?.link_relative_path ?? "") === sourceRootRef,
  ) ?? null;
}

function observeLocalState(sourceRoot) {
  const st = lstatSync(sourceRoot, { throwIfNoEntry: false });
  if (!st) return "missing";
  if (st.isSymbolicLink()) return existsSync(sourceRoot) ? "link_ok" : "link_broken";
  if (st.isDirectory()) return "directory_not_link";
  if (st.isFile()) return "file_not_link";
  return "other_not_link";
}

function listTopLevelRows({ sourceRoot, sourceRootRef, maxDepth, maxEntries }) {
  if (!existsSync(sourceRoot)) return [];
  return readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const entryPath = path.join(sourceRoot, entry.name);
      const st = lstatSync(entryPath);
      const entryType = typeFor(st);
      const scan = scanEntry(entryPath, { maxDepth, maxEntries });
      const classification = classifySystemEntry(entry.name, entryType, scan);
      return {
        relative_path: normalizeRepoPath(entry.name),
        repo_relative_path: normalizeRepoPath(path.join(sourceRootRef, entry.name)),
        entry_type: entryType,
        class: classification.class_name,
        reason_codes: classification.reason_codes,
        proposed_action: classification.proposed_action,
        needs_owner_check: classification.needs_owner_check,
        blockers: classification.blockers,
        file_count: scan.file_count,
        directory_count: scan.directory_count,
        symlink_count: scan.symlink_count,
        size_bytes: scan.size_bytes,
        extension_counts: scan.extension_counts,
        visited_count: scan.visited_count,
        scan_complete: !scan.scan_limited,
        scan_limited: scan.scan_limited,
        scan_limited_reason: scan.scan_limited_reason,
        modified_at_utc: st.mtime.toISOString(),
      };
    });
}

function typeFor(st) {
  if (st.isSymbolicLink()) return "link";
  if (st.isDirectory()) return "directory";
  if (st.isFile()) return "file";
  return "other";
}

function scanEntry(entryPath, { maxDepth, maxEntries }) {
  const state = {
    file_count: 0,
    directory_count: 0,
    symlink_count: 0,
    size_bytes: 0,
    extension_counts: {},
    visited_count: 0,
    scan_limited: false,
    scan_limited_reason: null,
  };
  scanPath(entryPath, state, { depth: 0, maxDepth, maxEntries });
  state.extension_counts = Object.fromEntries(
    Object.entries(state.extension_counts).sort((left, right) => left[0].localeCompare(right[0])),
  );
  return state;
}

function scanPath(currentPath, state, { depth, maxDepth, maxEntries }) {
  if (state.scan_limited) return;
  state.visited_count += 1;
  if (state.visited_count > maxEntries) {
    state.scan_limited = true;
    state.scan_limited_reason = "max_entries_exceeded";
    return;
  }
  if (depth > maxDepth) {
    state.scan_limited = true;
    state.scan_limited_reason = "max_depth_exceeded";
    return;
  }

  const st = lstatSync(currentPath, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isSymbolicLink()) {
    state.symlink_count += 1;
    return;
  }
  if (st.isFile()) {
    state.file_count += 1;
    state.size_bytes += st.size;
    const ext = extensionFor(currentPath);
    state.extension_counts[ext] = (state.extension_counts[ext] ?? 0) + 1;
    return;
  }
  if (!st.isDirectory()) return;
  state.directory_count += 1;
  for (const child of readdirSync(currentPath)) {
    scanPath(path.join(currentPath, child), state, { depth: depth + 1, maxDepth, maxEntries });
    if (state.scan_limited) break;
  }
}

function extensionFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext || "<none>";
}

export function classifySystemEntry(name, entryType = "directory", scan = {}) {
  const normalized = name.toLowerCase();
  const extCounts = scan.extension_counts ?? {};
  const extensionNames = Object.keys(extCounts);
  if (isPcLocalRuntimeTool(normalized, entryType)) {
    return classification("pc_local_runtime_tool", ["pc_local_runtime_or_tool_name"], "move_runtime_to__workspaces_local_or_owner_approved_os_tool_location", true, [
      "pc_local_runtime_tool_under_system",
    ]);
  }
  if (normalized === "rag" || normalized === "knowledge_view") {
    return classification("shared_generated_view", ["known_generated_system_view"], "keep_shared_view_or_regenerate_after_migration", false, []);
  }
  if (isProjectReferencePayloadCandidate(normalized)) {
    return classification(
      "project_reference_payload_review",
      ["project_code_plus_reference_payload_name"],
      "owner_map_to_project_payload_relocation_or_system_fixture",
      true,
      ["project_reference_payload_candidate_under_system"],
    );
  }
  if (isPcLocalCacheTemp(normalized, extensionNames)) {
    return classification("pc_local_cache_temp", ["cache_temp_log_or_pid_pattern"], "move_to_local_or_discard_after_owner_check", true, [
      "pc_local_cache_temp_under_system",
    ]);
  }
  if (/^p\d{2}[-_]\d{3}/u.test(normalized) || /^p\d{2}[-_]\d{3}[_-]/u.test(normalized)) {
    return classification("project_move", ["project_code_like_name"], "move_to_project_workspace_after_owner_mapping", true, [
      "project_payload_candidate_under_system",
    ]);
  }
  if (normalized === "knowledge" || (normalized.includes("knowledge") && normalized !== "knowledge_view")) {
    return classification("knowledge_move", ["knowledge_payload_like_name"], "move_to_knowledge_workspace_after_owner_mapping", true, [
      "knowledge_payload_candidate_under_system",
    ]);
  }
  if (normalized === "scripts" || normalized.endsWith("_scripts")) {
    return classification("repo_promote_review", ["script_surface_under_system"], "promote_portable_script_to_repo_or_move_local", true, [
      "script_surface_under_system_requires_review",
    ]);
  }
  if (normalized.includes("conflict")) {
    return classification("conflict_review", ["conflict_name_pattern"], "preserve_all_variants_for_owner_review", true, [
      "conflict_candidate_under_system",
    ]);
  }
  if (isSharedFixtureCandidate(normalized)) {
    return classification("shared_fixture_candidate", ["fixture_reference_or_material_name"], "preserve_for_owner_classification", true, [
      "shared_fixture_candidate_requires_owner_classification",
    ]);
  }
  return classification("unknown_review", ["no_deterministic_classification_rule"], "owner_review_required", true, [
    "unknown_system_entry_requires_review",
  ]);
}

function isPcLocalRuntimeTool(name, entryType) {
  if (entryType === "file" && /\.(exe|dll|bat|cmd|ps1|pid|lock)$/u.test(name)) return true;
  return (
    name === "tools" ||
    name === "tool" ||
    name === "node_modules" ||
    name === "venv" ||
    name === ".venv" ||
    name === "env" ||
    name.includes("_venv") ||
    name.startsWith("local_") && name.includes("install") ||
    name.includes("local_llm") ||
    name.endsWith("_install")
  );
}

function isPcLocalCacheTemp(name, extensionNames) {
  return (
    name === "cache" ||
    name === "tmp" ||
    name === "temp" ||
    name === "logs" ||
    name.endsWith("_cache") ||
    name.endsWith("_tmp") ||
    name.endsWith("_temp") ||
    name.includes("scratch") ||
    name.includes("temporary") ||
    /\.(log|tmp|cache|pid|lock)$/u.test(name) ||
    extensionNames.some((ext) => [".log", ".tmp", ".cache", ".pid", ".lock"].includes(ext))
  );
}

function isSharedFixtureCandidate(name) {
  return (
    name.includes("reference_payload") ||
    name.includes("fixture") ||
    name.includes("materials") ||
    name.includes("capture_xml") ||
    name.includes("exp_xml") ||
    name.includes("page_xml") ||
    name.includes("whole_xml") ||
    name.includes("xml_harness") ||
    name.includes("allegro_folder_compare") ||
    name.includes("normalize_spec") ||
    /^lt\d+.*materials/u.test(name)
  );
}

function isProjectReferencePayloadCandidate(name) {
  return /^p\d{2}[-_]\d{3}/u.test(name) && name.includes("reference_payload");
}

function classification(className, reasonCodes, proposedAction, needsOwnerCheck, blockers) {
  return {
    class_name: className,
    reason_codes: reasonCodes,
    proposed_action: proposedAction,
    needs_owner_check: needsOwnerCheck,
    blockers,
  };
}

function summarizeRows(rows) {
  const summary = Object.fromEntries(CLASS_NAMES.map((className) => [`${className}_count`, 0]));
  let fileCount = 0;
  let directoryCount = 0;
  let sizeBytes = 0;
  let scanLimitedCount = 0;
  for (const row of rows) {
    const key = `${row.class}_count`;
    summary[key] = (summary[key] ?? 0) + 1;
    fileCount += row.file_count ?? 0;
    directoryCount += row.directory_count ?? 0;
    sizeBytes += row.size_bytes ?? 0;
    if (row.scan_limited) scanLimitedCount += 1;
  }
  return {
    ...summary,
    recursive_file_count: fileCount,
    recursive_directory_count: directoryCount,
    recursive_size_bytes: sizeBytes,
    scan_limited_count: scanLimitedCount,
    scan_complete: scanLimitedCount === 0,
  };
}

function buildBlockers({ binding, bindingState, observedLocalState, rows }) {
  const blockers = [];
  if (!binding.exists) blockers.push("workspace_junction_binding_missing");
  if (binding.parse_error) blockers.push("workspace_junction_binding_parse_error");
  if (binding.exists && bindingState === "missing") blockers.push("system_binding_row_missing");
  if (bindingState === "active" && observedLocalState !== "link_ok") blockers.push("active_system_binding_not_link_ok");
  if (bindingState === "planned" && observedLocalState !== "link_ok") blockers.push("planned_system_not_materialized_as_shared_link");
  if (observedLocalState === "directory_not_link") blockers.push("system_path_is_local_directory_not_link");
  if (observedLocalState === "file_not_link" || observedLocalState === "other_not_link") blockers.push("system_path_is_not_link_or_directory");
  if (observedLocalState === "link_broken") blockers.push("system_link_target_missing");
  for (const row of rows) {
    if (row.scan_limited) blockers.push(`system_inventory_scan_limited:${row.relative_path}`);
    blockers.push(...row.blockers.map((code) => `${code}:${row.relative_path}`));
  }
  return blockers;
}

function statusFor({ bindingState, observedLocalState, blockers }) {
  if (bindingState === "active" && observedLocalState !== "link_ok") return "blocked";
  if (observedLocalState === "missing") return "review_required";
  if (blockers.length > 0) return "review_required";
  return "passed";
}

function reasonFor({ bindingState, observedLocalState, blockers }) {
  if (bindingState === "active" && observedLocalState !== "link_ok") return "active_binding_requires_link";
  if (observedLocalState === "directory_not_link") return "migration_required_system_not_link";
  if (observedLocalState === "missing") return "system_path_missing";
  if (observedLocalState === "link_broken") return "system_link_broken";
  if (blockers.length > 0) return "system_entries_require_classification";
  return "system_inventory_clear";
}

function migrationStatusFor({ bindingState, observedLocalState, blockers }) {
  if (bindingState === "active" && observedLocalState !== "link_ok") return "invalid_active_binding";
  if (observedLocalState !== "link_ok") return "migration_required";
  if (blockers.length > 0) return "classification_required";
  return "ready_for_active_binding";
}

function nextActionsFor({ status, observedLocalState, blockers }) {
  if (status === "passed") {
    return ["keep inventory with migration evidence", "run workspace junction audit after binding is active"];
  }
  const actions = [];
  if (observedLocalState !== "link_ok") {
    actions.push("freeze default writes to _workspaces/system");
    actions.push("preserve local folder under _workspaces/_local_hold/system/<timestamp>_<node_id> before junction repair");
  }
  if (blockers.some((code) => code.includes("system_inventory_scan_limited"))) {
    actions.push("rerun workspace-system inventory as a full scan before using counts for migration or movement planning");
  }
  if (blockers.some((code) => code.includes("pc_local"))) {
    actions.push(
      "move PC-local runtime, cache, logs, and tool installs to _workspaces/_local/<node_id>/ or an owner-approved OS/tool location; recreate reinstallable repo tools separately from bootstrap docs",
    );
  }
  if (blockers.some((code) => code.includes("project_payload") || code.includes("project_reference_payload"))) {
    actions.push("map project-like material to the owning _workspaces/<project_code> payload surface before sharing");
  }
  if (blockers.some((code) => code.includes("shared_fixture_candidate") || code.includes("unknown"))) {
    actions.push("owner-classify fixture, reference, and unknown entries before activation");
  }
  return actions.length > 0 ? actions : ["owner review required before system activation"];
}

function normalizeRepoPath(value) {
  return String(value ?? "").split(path.sep).join("/").replace(/\\/gu, "/").replace(/^\.\//u, "");
}

function normalizeScanLimit(value, fallback) {
  if (value === undefined || value === null || value === false || value === "") return fallback;
  if (value === true) return fallback;
  const normalized = String(value).toLowerCase();
  if (["full", "none", "unlimited", "infinity"].includes(normalized)) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`invalid scan limit: ${value}`);
  }
  return parsed;
}

function formatScanLimit(value) {
  return Number.isFinite(value) ? value : "unlimited";
}

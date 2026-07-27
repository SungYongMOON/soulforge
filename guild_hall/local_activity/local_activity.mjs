import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  FILE_ACTIVITY_CACHE_POLICY,
  canonicalPacketDigest,
  scanWorkspace,
} from "../file_activity/file_activity.mjs";

export const HPP_LOCAL_ACTIVITY_BINDING_SCHEMA =
  "soulforge.hpp_all_project_local_activity_binding.v1";
export const HPP_LOCAL_ACTIVITY_BATCH_SCHEMA =
  "soulforge.hpp_all_project_local_activity_batch.v1";
export const BOUNDED_WORK_SNAPSHOT_SCHEMA =
  "soulforge.bounded_work_snapshot.v1";
export const FILE_INVENTORY_STATE_SCHEMA =
  "soulforge.hpp_project_file_inventory_state.v1";
export const FILE_ACTIVITY_DELTA_SCHEMA =
  "soulforge.hpp_project_file_activity_delta.v1";

const FIVE_FIELD_SCHEMA = "soulforge.five_field_capture.v0";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,119}$/u;
const SAFE_PROJECT = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_BINDING_BYTES = 1024 * 1024;
const MAX_LEDGER_BYTES = 64 * 1024 * 1024;
const MAX_LEDGER_LINE_BYTES = 32 * 1024;
const MAX_LEDGER_RECORDS = 100_000;
const MAX_SUMMARY_CHARS = 2_000;

function fail(code, message = code) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function exactObject(value, keys, label) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(`${label}_invalid`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label}_keys_invalid`);
  }
}

function safeId(value, label, pattern = SAFE_ID) {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail(`${label}_invalid`);
  }
  return value;
}

function absolutePath(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    fail(`${label}_invalid`);
  }
  return path.resolve(value);
}

function positiveInteger(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail(`${label}_invalid`);
  }
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(
    typeof value === "string" || Buffer.isBuffer(value)
      ? value
      : canonicalJson(value),
  ).digest("hex");
}

function contained(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (
    relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

export function normalizeHppLocalActivityBinding(input) {
  exactObject(input, [
    "schema_version",
    "binding_id",
    "node_id",
    "node_role",
    "state_root",
    "projects",
  ], "binding");
  if (input.schema_version !== HPP_LOCAL_ACTIVITY_BINDING_SCHEMA) {
    fail("binding_schema_invalid");
  }
  if (input.node_role !== "tool_pc") fail("binding_node_role_invalid");
  if (!Array.isArray(input.projects) || input.projects.length < 1 || input.projects.length > 128) {
    fail("binding_projects_invalid");
  }
  const stateRoot = absolutePath(input.state_root, "binding_state_root");
  const seen = new Set();
  const projects = input.projects.map((project, index) => {
    exactObject(project, [
      "project_code",
      "workspace_root",
      "workmeta_root",
      "workspace_binding_id",
      "file_activity",
      "bounded_work",
    ], `project_${index}`);
    const projectCode = safeId(project.project_code, "project_code", SAFE_PROJECT);
    if (seen.has(projectCode)) fail("binding_project_duplicate");
    seen.add(projectCode);
    const workspaceRoot = absolutePath(project.workspace_root, "project_workspace_root");
    const workmetaRoot = absolutePath(project.workmeta_root, "project_workmeta_root");
    if (path.basename(workspaceRoot) !== projectCode || path.basename(workmetaRoot) !== projectCode) {
      fail("binding_project_root_mismatch");
    }
    if (contained(workspaceRoot, stateRoot) || contained(workmetaRoot, stateRoot)) {
      fail("binding_state_root_inside_project");
    }
    exactObject(project.file_activity, [
      "enabled",
      "max_entries",
      "immediate_hash_bytes",
      "byte_budget",
      "cache_ttl_ms",
    ], `project_${index}_file_activity`);
    exactObject(project.bounded_work, [
      "enabled",
      "five_field_log",
    ], `project_${index}_bounded_work`);
    if (typeof project.file_activity.enabled !== "boolean") {
      fail("binding_file_activity_enabled_invalid");
    }
    if (typeof project.bounded_work.enabled !== "boolean") {
      fail("binding_bounded_work_enabled_invalid");
    }
    const expectedLedger = path.join(
      workmetaRoot,
      "reports",
      "procedure_capture",
      "five_field_log.jsonl",
    );
    const ledger = absolutePath(
      project.bounded_work.five_field_log,
      "project_five_field_log",
    );
    if (path.resolve(ledger) !== path.resolve(expectedLedger)) {
      fail("binding_five_field_log_not_exact_owner_path");
    }
    return {
      project_code: projectCode,
      workspace_root: workspaceRoot,
      workmeta_root: workmetaRoot,
      workspace_binding_id: safeId(
        project.workspace_binding_id,
        "workspace_binding_id",
      ),
      file_activity: {
        enabled: project.file_activity.enabled,
        max_entries: positiveInteger(
          project.file_activity.max_entries,
          "file_activity_max_entries",
          100_000,
        ),
        immediate_hash_bytes: positiveInteger(
          project.file_activity.immediate_hash_bytes,
          "file_activity_immediate_hash_bytes",
          1024 * 1024 * 1024,
        ),
        byte_budget: positiveInteger(
          project.file_activity.byte_budget,
          "file_activity_byte_budget",
          8 * 1024 * 1024 * 1024,
        ),
        cache_ttl_ms: positiveInteger(
          project.file_activity.cache_ttl_ms,
          "file_activity_cache_ttl_ms",
          FILE_ACTIVITY_CACHE_POLICY.max_verified_hash_ttl_ms,
        ),
      },
      bounded_work: {
        enabled: project.bounded_work.enabled,
        five_field_log: ledger,
      },
    };
  });
  return {
    schema_version: HPP_LOCAL_ACTIVITY_BINDING_SCHEMA,
    binding_id: safeId(input.binding_id, "binding_id"),
    node_id: safeId(input.node_id, "node_id"),
    node_role: input.node_role,
    state_root: stateRoot,
    projects: projects.sort((left, right) => (
      left.project_code.localeCompare(right.project_code, "en")
    )),
  };
}

export async function readHppLocalActivityBinding(bindingPath, expectedSha256) {
  const resolved = absolutePath(bindingPath, "binding_path");
  const before = await safeFileStat(resolved, "binding");
  if (before.size > MAX_BINDING_BYTES) fail("binding_too_large");
  const bytes = await readFile(resolved);
  const after = await safeFileStat(resolved, "binding");
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    fail("binding_changed_during_read");
  }
  const actualSha256 = digest(bytes);
  const expected = String(expectedSha256 ?? "").replace(/^sha256:/u, "").toLowerCase();
  if (!SHA256.test(expected) || actualSha256 !== expected) {
    fail("binding_digest_mismatch");
  }
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
  } catch {
    fail("binding_json_invalid");
  }
  return {
    binding: normalizeHppLocalActivityBinding(parsed),
    binding_sha256: actualSha256,
  };
}

function boundedString(value, label, maximum = MAX_SUMMARY_CHARS) {
  if (typeof value !== "string" || value.length > maximum) fail(`${label}_invalid`);
  return value.trim();
}

function normalizeStringArray(value, label, maximumItems, maximumChars) {
  if (!Array.isArray(value) || value.length > maximumItems) fail(`${label}_invalid`);
  return value.map((item) => boundedString(item, label, maximumChars));
}

function normalizeFiveFieldRecord(value, expectedProject) {
  exactObject(value, [
    "schema_version",
    "id",
    "at",
    "worker",
    "session_ref",
    "project_code",
    "request_kind",
    "input_refs",
    "judgment",
    "output",
    "verification",
    "stop_conditions",
    "needs_backfill",
    "data_label",
  ], "five_field_record");
  if (value.schema_version !== FIVE_FIELD_SCHEMA) fail("five_field_schema_invalid");
  if (value.project_code !== expectedProject) fail("five_field_project_mismatch");
  const occurredAt = new Date(value.at);
  if (!Number.isFinite(occurredAt.getTime())) fail("five_field_timestamp_invalid");
  if (![0, 1].includes(value.needs_backfill)) fail("five_field_backfill_invalid");
  const normalized = {
    schema_version: FIVE_FIELD_SCHEMA,
    id: safeId(value.id, "five_field_id"),
    at: occurredAt.toISOString(),
    worker: boundedString(value.worker, "five_field_worker", 80),
    session_ref: boundedString(value.session_ref, "five_field_session_ref", 120),
    project_code: value.project_code,
    request_kind: boundedString(value.request_kind, "five_field_request_kind", 80),
    input_refs: normalizeStringArray(value.input_refs, "five_field_input_refs", 12, 300),
    judgment: boundedString(value.judgment, "five_field_judgment"),
    output: boundedString(value.output, "five_field_output"),
    verification: boundedString(value.verification, "five_field_verification", 600),
    stop_conditions: normalizeStringArray(
      value.stop_conditions,
      "five_field_stop_conditions",
      5,
      300,
    ),
    needs_backfill: value.needs_backfill,
    data_label: boundedString(value.data_label, "five_field_data_label", 40),
  };
  return {
    normalized,
    full_record_digest: digest(normalized),
  };
}

async function readBoundedWorkLedger(project) {
  const target = project.bounded_work.five_field_log;
  let before;
  try {
    before = await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        source_availability: "not_materialized",
        records: [],
        source_digest: null,
        source_size_bytes: 0,
        held_count: 0,
      };
    }
    fail("five_field_source_stat_failed");
  }
  if (before.isSymbolicLink() || !before.isFile()) fail("five_field_source_unsafe");
  if (before.size > MAX_LEDGER_BYTES) fail("five_field_source_too_large");
  const bytes = await readFile(target);
  const after = await lstat(target);
  if (
    after.isSymbolicLink()
    || !after.isFile()
    || before.size !== after.size
    || before.mtimeMs !== after.mtimeMs
  ) {
    fail("five_field_source_changed_during_read");
  }
  const recordsById = new Map();
  const seen = new Map();
  const conflictIds = new Set();
  const lines = bytes.toString("utf8").replace(/^\uFEFF/u, "").split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    if (seen.size >= MAX_LEDGER_RECORDS) {
      fail("five_field_record_limit_exceeded");
    }
    if (Buffer.byteLength(line) > MAX_LEDGER_LINE_BYTES) {
      fail("five_field_line_too_large");
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      fail("five_field_line_json_invalid", `line ${index + 1}`);
    }
    const record = normalizeFiveFieldRecord(parsed, project.project_code);
    const prior = seen.get(record.normalized.id);
    if (prior && prior !== record.full_record_digest) {
      conflictIds.add(record.normalized.id);
      continue;
    }
    if (prior) continue;
    seen.set(record.normalized.id, record.full_record_digest);
    recordsById.set(record.normalized.id, record);
  }
  const records = [...recordsById.entries()]
    .filter(([recordId]) => !conflictIds.has(recordId))
    .map(([, record]) => record);
  records.sort((left, right) => {
    const time = left.normalized.at.localeCompare(right.normalized.at);
    return time || left.full_record_digest.localeCompare(right.full_record_digest);
  });
  return {
    source_availability: records.length > 0 ? "available" : "materialized_empty",
    records,
    source_digest: digest(bytes),
    source_size_bytes: bytes.length,
    held_count: conflictIds.size,
  };
}

function buildBoundedWorkSnapshot(project, ledger) {
  const workItems = ledger.records.map(({ normalized, full_record_digest }) => {
    const nativeOccurrenceId = `bounded_work:${full_record_digest}`;
    return {
      native_occurrence_id: nativeOccurrenceId,
      occurred_at: normalized.at,
      project_code: normalized.project_code,
      actor_ref: normalized.worker,
      session_ref: normalized.session_ref,
      request_kind: normalized.request_kind,
      work_summary: normalized.output,
      judgment_summary: normalized.judgment,
      verification_summary: normalized.verification,
      input_refs: normalized.input_refs,
      stop_conditions: normalized.stop_conditions,
      needs_backfill: normalized.needs_backfill === 1,
      data_label: normalized.data_label,
      source_record_id: normalized.id,
      source_record_digest: full_record_digest,
    };
  });
  const codexRelations = workItems
    .filter((item) => item.actor_ref.toLowerCase().startsWith("codex_"))
    .map((item) => ({
      relation_kind: "codex_execution_of_bounded_work",
      native_occurrence_id: item.native_occurrence_id,
      occurred_at: item.occurred_at,
      actor_ref: item.actor_ref,
      session_ref: item.session_ref,
      request_kind: item.request_kind,
      source_record_digest: item.source_record_digest,
    }));
  const snapshot = {
    schema_version: BOUNDED_WORK_SNAPSHOT_SCHEMA,
    project_code: project.project_code,
    source_availability: ledger.source_availability,
    source_digest: ledger.source_digest,
    source_size_bytes: ledger.source_size_bytes,
    native_occurrence_count: workItems.length,
    pc_work_projection: workItems,
    codex_run_relation_count: codexRelations.length,
    codex_run_projection: codexRelations,
    held_conflict_count: ledger.held_count,
    claim_ceiling: "project_local_candidate_projection",
    boundaries: {
      same_record_double_counted: false,
      raw_chat_read: false,
      screen_or_keyboard_captured: false,
      operating_system_surveillance_used: false,
      official_task_mutated: false,
      erp_database_mutated: false,
    },
  };
  return {
    ...snapshot,
    snapshot_digest: digest(snapshot),
  };
}

function fileStatePaths(binding, project) {
  const projectRoot = path.join(
    binding.state_root,
    "projects",
    project.project_code,
  );
  return {
    project_root: projectRoot,
    cache: path.join(projectRoot, "state", "file_scan_cache.json"),
    inventory: path.join(projectRoot, "state", "file_inventory_state.json"),
    file_delta_outbox: path.join(projectRoot, "outbox", "file_activity_delta"),
    bounded_outbox: path.join(projectRoot, "outbox", "bounded_work"),
    current: path.join(projectRoot, "current.json"),
  };
}

async function readJsonIfPresent(target) {
  try {
    const raw = await readFile(target, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/u, ""));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    fail("local_state_read_failed");
  }
}

function compactInventoryEntry(core) {
  const normalized = {
    ...core,
    hash_state: core.content_id ? "exact" : "pending",
  };
  return {
    ...normalized,
    entry_digest: digest(normalized),
  };
}

function compactFileObservation(observation) {
  const core = {
    path_fingerprint: observation.path_fingerprint,
    relative_path: observation.relative_path,
    relative_path_spelling: observation.relative_path_spelling,
    size_bytes: observation.size_bytes,
    fs_modified_at: observation.fs_modified_at,
    content_id: observation.content_id,
    hash_state: observation.content_id ? "exact" : "pending",
    withheld: observation.withheld,
  };
  return compactInventoryEntry(core);
}

function normalizePriorInventory(value, project, binding) {
  if (value === null) return null;
  exactObject(value, [
    "schema_version",
    "project_code",
    "workspace_binding_id",
    "node_id",
    "updated_at",
    "latest_scan_id",
    "listing_complete",
    "entry_count",
    "entries",
  ], "file_inventory_state");
  if (
    value.schema_version !== FILE_INVENTORY_STATE_SCHEMA
    || value.project_code !== project.project_code
    || value.workspace_binding_id !== project.workspace_binding_id
    || value.node_id !== binding.node_id
    || !Number.isFinite(Date.parse(value.updated_at))
    || typeof value.latest_scan_id !== "string"
    || typeof value.listing_complete !== "boolean"
    || !Number.isSafeInteger(value.entry_count)
    || value.entry_count < 0
    || !Array.isArray(value.entries)
    || value.entry_count !== value.entries.length
  ) {
    fail("file_inventory_state_invalid");
  }
  const seen = new Set();
  for (const entry of value.entries) {
    exactObject(entry, [
      "path_fingerprint",
      "relative_path",
      "relative_path_spelling",
      "size_bytes",
      "fs_modified_at",
      "content_id",
      "hash_state",
      "withheld",
      "entry_digest",
    ], "file_inventory_entry");
    if (
      typeof entry.path_fingerprint !== "string"
      || seen.has(entry.path_fingerprint)
      || typeof entry.entry_digest !== "string"
    ) {
      fail("file_inventory_entry_invalid");
    }
    seen.add(entry.path_fingerprint);
    const { entry_digest: declaredDigest, ...core } = entry;
    if (digest(core) !== declaredDigest) fail("file_inventory_entry_digest_invalid");
  }
  return {
    ...value,
    entries: value.entries.map(({ entry_digest, ...entry }) => (
      compactInventoryEntry(entry)
    )),
  };
}

function classifyFileDelta(prior, current) {
  if (!prior) return "first_observed";
  if (prior.content_id && current.content_id && prior.content_id !== current.content_id) {
    return "content_changed";
  }
  if (!prior.content_id && current.content_id) return "hash_completed";
  if (
    prior.size_bytes !== current.size_bytes
    || prior.fs_modified_at?.value !== current.fs_modified_at?.value
  ) {
    return "stat_changed";
  }
  return "observation_changed";
}

function buildFileActivityDelta({
  binding,
  project,
  fileResult,
  priorInventory,
  observedAt,
}) {
  if (!fileResult) {
    return {
      delta: null,
      inventory: priorInventory,
    };
  }
  const prior = normalizePriorInventory(priorInventory, project, binding);
  const priorByPath = new Map(
    (prior?.entries ?? []).map((entry) => [entry.path_fingerprint, entry]),
  );
  const observedEntries = fileResult.packet.observations
    .map(compactFileObservation)
    .sort((left, right) => left.path_fingerprint.localeCompare(right.path_fingerprint, "en"));
  const currentByPath = new Map(
    observedEntries.map((entry) => [entry.path_fingerprint, entry]),
  );
  const changedObservations = [];
  for (const observation of fileResult.packet.observations) {
    const current = currentByPath.get(observation.path_fingerprint);
    const previous = priorByPath.get(observation.path_fingerprint);
    if (previous?.entry_digest === current.entry_digest) continue;
    changedObservations.push({
      change_kind: classifyFileDelta(previous, current),
      observation,
    });
  }
  changedObservations.sort((left, right) => (
    left.observation.path_fingerprint.localeCompare(
      right.observation.path_fingerprint,
      "en",
    )
  ));

  const absenceCandidates = [];
  if (fileResult.packet.coverage.listing_complete) {
    for (const previous of prior?.entries ?? []) {
      if (currentByPath.has(previous.path_fingerprint)) continue;
      absenceCandidates.push({
        path_fingerprint: previous.path_fingerprint,
        relative_path: previous.relative_path,
        prior_entry_digest: previous.entry_digest,
        prior_content_id: previous.content_id,
        last_observed_at: prior.updated_at,
        disposition: "absence_candidate_only",
        deletion_confirmed: false,
      });
    }
  }
  absenceCandidates.sort((left, right) => (
    left.path_fingerprint.localeCompare(right.path_fingerprint, "en")
  ));

  let nextEntries = observedEntries;
  if (!fileResult.packet.coverage.listing_complete && prior) {
    for (const previous of prior.entries) {
      if (!currentByPath.has(previous.path_fingerprint)) {
        nextEntries.push(previous);
      }
    }
    nextEntries.sort((left, right) => (
      left.path_fingerprint.localeCompare(right.path_fingerprint, "en")
    ));
  }
  const inventory = {
    schema_version: FILE_INVENTORY_STATE_SCHEMA,
    project_code: project.project_code,
    workspace_binding_id: project.workspace_binding_id,
    node_id: binding.node_id,
    updated_at: observedAt,
    latest_scan_id: fileResult.packet.scan_id,
    listing_complete: fileResult.packet.coverage.listing_complete,
    entry_count: nextEntries.length,
    entries: nextEntries,
  };
  const fullPacketDigest = canonicalPacketDigest(fileResult.packet);
  const deltaCore = {
    schema_version: FILE_ACTIVITY_DELTA_SCHEMA,
    project_code: project.project_code,
    workspace_binding_id: project.workspace_binding_id,
    node_id: binding.node_id,
    node_role: binding.node_role,
    observed_at: observedAt,
    scan_id: fileResult.packet.scan_id,
    full_scan_packet_digest: fullPacketDigest,
    baseline: prior === null,
    coverage: fileResult.packet.coverage,
    full_scan_counts: fileResult.packet.counts,
    changed_observation_count: changedObservations.length,
    unchanged_observation_count: (
      fileResult.packet.observations.length - changedObservations.length
    ),
    absence_candidate_count: absenceCandidates.length,
    changed_observations: changedObservations,
    absence_candidates: absenceCandidates,
    boundaries: {
      metadata_only: true,
      file_bytes_retained: false,
      llm_used: false,
      absence_is_deletion: false,
      workmeta_canon_mutated: false,
      project_timeline_mutated: false,
    },
  };
  return {
    inventory,
    delta: {
      ...deltaCore,
      delta_digest: digest(deltaCore),
    },
  };
}

async function collectProject(binding, project, { observedAt, apply }) {
  const paths = fileStatePaths(binding, project);
  const previousCache = await readJsonIfPresent(paths.cache);
  const previousInventory = await readJsonIfPresent(paths.inventory);
  let fileResult = null;
  if (project.file_activity.enabled) {
    fileResult = await scanWorkspace({
      projectCode: project.project_code,
      workspaceBindingId: project.workspace_binding_id,
      nodeId: binding.node_id,
      nodeRole: binding.node_role,
      rootPath: project.workspace_root,
      bindingValid: true,
      operationalPrimary: false,
      observedAt,
      ingestedAt: observedAt,
      immediateHashBytes: project.file_activity.immediate_hash_bytes,
      byteBudget: project.file_activity.byte_budget,
      maxEntries: project.file_activity.max_entries,
      verifiedHashTtlMs: project.file_activity.cache_ttl_ms,
      previousCache,
    });
  }
  const fileDelta = buildFileActivityDelta({
    binding,
    project,
    fileResult,
    priorInventory: previousInventory,
    observedAt,
  });
  const ledger = project.bounded_work.enabled
    ? await readBoundedWorkLedger(project)
    : {
        source_availability: "disabled",
        records: [],
        source_digest: null,
        source_size_bytes: 0,
        held_count: 0,
      };
  const boundedSnapshot = buildBoundedWorkSnapshot(project, ledger);
  const result = {
    project_code: project.project_code,
    workspace_binding_id: project.workspace_binding_id,
    file_activity: fileResult
      ? {
          source_availability: fileResult.packet.coverage.complete
            ? "complete"
            : "partial",
          scan_id: fileResult.packet.scan_id,
          packet_digest: canonicalPacketDigest(fileResult.packet),
          counts: fileResult.packet.counts,
          coverage: fileResult.packet.coverage,
          delta_digest: fileDelta.delta.delta_digest,
          changed_observation_count: fileDelta.delta.changed_observation_count,
          unchanged_observation_count: fileDelta.delta.unchanged_observation_count,
          absence_candidate_count: fileDelta.delta.absence_candidate_count,
        }
      : {
          source_availability: "disabled",
          scan_id: null,
          packet_digest: null,
          counts: null,
          coverage: null,
          delta_digest: null,
          changed_observation_count: 0,
          unchanged_observation_count: 0,
          absence_candidate_count: 0,
        },
    bounded_work: {
      source_availability: boundedSnapshot.source_availability,
      native_occurrence_count: boundedSnapshot.native_occurrence_count,
      codex_run_relation_count: boundedSnapshot.codex_run_relation_count,
      held_conflict_count: boundedSnapshot.held_conflict_count,
      snapshot_digest: boundedSnapshot.snapshot_digest,
    },
  };
  if (apply) {
    const month = observedAt.slice(0, 7);
    if (fileResult) {
      await writeJsonImmutable(
        path.join(
          paths.file_delta_outbox,
          month,
          `${fileDelta.delta.delta_digest}.json`,
        ),
        fileDelta.delta,
      );
      await writeJsonAtomic(paths.cache, fileResult.next_cache);
      await writeJsonAtomic(paths.inventory, fileDelta.inventory);
    }
    await writeJsonImmutable(
      path.join(paths.bounded_outbox, `${boundedSnapshot.snapshot_digest}.json`),
      boundedSnapshot,
      { allowIdentical: true },
    );
    await writeJsonAtomic(paths.current, {
      schema_version: "soulforge.hpp_project_local_activity_current.v1",
      observed_at: observedAt,
      project_code: project.project_code,
      file_activity_packet_digest: result.file_activity.packet_digest,
      file_activity_delta_digest: result.file_activity.delta_digest,
      file_inventory_entry_count: fileDelta.inventory?.entry_count ?? 0,
      bounded_work_snapshot_digest: boundedSnapshot.snapshot_digest,
      boundaries: {
        local_outbox_only: true,
        full_file_snapshot_persisted_each_scan: false,
        file_delta_only_after_inventory_baseline: true,
        workmeta_canon_mutated: false,
        project_timeline_mutated: false,
        scheduler_activated: false,
      },
    });
  }
  return result;
}

export async function collectAllProjectLocalActivity({
  binding,
  bindingSha256,
  observedAt = new Date().toISOString(),
  apply = false,
}) {
  const normalized = normalizeHppLocalActivityBinding(binding);
  const timestamp = new Date(observedAt);
  if (!Number.isFinite(timestamp.getTime())) fail("observed_at_invalid");
  const canonicalObservedAt = timestamp.toISOString();
  const projects = [];
  for (const project of normalized.projects) {
    try {
      projects.push({
        status: "collected",
        error_code: null,
        ...await collectProject(normalized, project, {
          observedAt: canonicalObservedAt,
          apply,
        }),
      });
    } catch (error) {
      projects.push({
        status: "held",
        error_code: error?.code ?? "project_collection_failed",
        project_code: project.project_code,
        workspace_binding_id: project.workspace_binding_id,
        file_activity: {
          source_availability: "held",
          scan_id: null,
          packet_digest: null,
          counts: null,
          coverage: null,
          delta_digest: null,
          changed_observation_count: 0,
          unchanged_observation_count: 0,
          absence_candidate_count: 0,
        },
        bounded_work: {
          source_availability: "held",
          native_occurrence_count: 0,
          codex_run_relation_count: 0,
          held_conflict_count: 0,
          snapshot_digest: null,
        },
      });
    }
  }
  const batchCore = {
    schema_version: HPP_LOCAL_ACTIVITY_BATCH_SCHEMA,
    binding_id: normalized.binding_id,
    binding_sha256: String(bindingSha256 ?? ""),
    node_id: normalized.node_id,
    node_role: normalized.node_role,
    observed_at: canonicalObservedAt,
    apply,
    project_count: projects.length,
    projects,
    totals: {
      observed_file_count: projects.reduce(
        (total, project) => total + Number(project.file_activity.counts?.observed_file_count ?? 0),
        0,
      ),
      exact_content_count: projects.reduce(
        (total, project) => total + Number(project.file_activity.counts?.exact_content_count ?? 0),
        0,
      ),
      changed_file_observation_count: projects.reduce(
        (total, project) => total + project.file_activity.changed_observation_count,
        0,
      ),
      unchanged_file_observation_count: projects.reduce(
        (total, project) => total + project.file_activity.unchanged_observation_count,
        0,
      ),
      absence_candidate_count: projects.reduce(
        (total, project) => total + project.file_activity.absence_candidate_count,
        0,
      ),
      bounded_work_occurrence_count: projects.reduce(
        (total, project) => total + project.bounded_work.native_occurrence_count,
        0,
      ),
      codex_run_relation_count: projects.reduce(
        (total, project) => total + project.bounded_work.codex_run_relation_count,
        0,
      ),
      held_conflict_count: projects.reduce(
        (total, project) => total + project.bounded_work.held_conflict_count,
        0,
      ),
      held_project_count: projects.filter((project) => project.status === "held").length,
    },
    boundaries: {
      exact_project_allowlist_only: true,
      project_autodiscovery_used: false,
      raw_chat_read: false,
      workmeta_canon_mutated: false,
      project_timeline_mutated: false,
      erp_database_mutated: false,
      mcp_or_network_used: false,
    },
  };
  const batch = {
    ...batchCore,
    batch_digest: digest(batchCore),
  };
  if (apply) {
    const date = canonicalObservedAt.slice(0, 10);
    await writeJsonImmutable(
      path.join(
        normalized.state_root,
        "batches",
        date,
        `${batch.batch_digest}.json`,
      ),
      batch,
    );
  }
  return batch;
}

async function safeFileStat(target, label) {
  let stat;
  try {
    stat = await lstat(target);
  } catch {
    fail(`${label}_stat_failed`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${label}_unsafe`);
  return stat;
}

async function ensureSafeOutputPath(target) {
  const parent = path.dirname(path.resolve(target));
  await mkdir(parent, { recursive: true });
  const canonicalParent = await realpath(parent);
  const parentStat = await lstat(canonicalParent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    fail("local_state_parent_unsafe");
  }
  return path.join(canonicalParent, path.basename(target));
}

async function writeJsonImmutable(target, value, { allowIdentical = false } = {}) {
  const output = `${JSON.stringify(value, null, 2)}\n`;
  const safeTarget = await ensureSafeOutputPath(target);
  try {
    const handle = await open(safeTarget, "wx");
    try {
      await handle.writeFile(output, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if (!allowIdentical) fail("immutable_output_conflict");
    const current = await readFile(safeTarget, "utf8");
    if (current !== output) fail("immutable_output_conflict");
  }
}

async function writeJsonAtomic(target, value) {
  const output = `${JSON.stringify(value, null, 2)}\n`;
  const safeTarget = await ensureSafeOutputPath(target);
  const temporary = `${safeTarget}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, output, { encoding: "utf8", flag: "wx" });
  try {
    await rm(safeTarget, { force: true });
    await rename(temporary, safeTarget);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

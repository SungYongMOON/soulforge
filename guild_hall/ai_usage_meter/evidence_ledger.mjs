import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";

export const AI_WORK_RUN_SCHEMA = "soulforge.ai_work_run.v1";
export const AI_QUALITY_RESULT_SCHEMA = "soulforge.ai_quality_result.v1";
export const AI_TOOL_EVENT_SCHEMA = "soulforge.ai_tool_event.v1";
export const AI_USAGE_REPLAY_RECEIPT_SCHEMA = "soulforge.ai_usage_replay_receipt.v1";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const COMMIT_REF = /^(?:sha256:[a-f0-9]{64}|[a-f0-9]{7,64})$/u;
const SAFE_REF = /^(?:[A-Za-z0-9][A-Za-z0-9_.-]{0,119}|sha256:[a-f0-9]{64})$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const EVENT_FIELDS = Object.freeze({
  work_run: ["schema_version", "event_id", "run_id", "work_id", "run_scope", "cost_role", "variant", "task_class", "risk_class", "experiment_id", "repo_commit", "launcher_version", "topology", "cost_scope", "work_record_ref", "started_at", "completed_at", "model_id", "reasoning_effort", "usage_event_ids", "instruction_manifest_ref", "measurement_status", "authority", "metadata_only", "raw_prompt_copied", "raw_reasoning_copied", "raw_tool_payload_copied"],
  quality_result: ["schema_version", "event_id", "result_id", "run_id", "work_id", "evaluator_kind", "metric_id", "score", "scale_min", "scale_max", "decision", "evidence_refs", "occurred_at", "metadata_only", "raw_prompt_copied", "raw_reasoning_copied", "raw_tool_payload_copied"],
  tool_event: ["schema_version", "event_id", "run_id", "work_id", "tool_name", "tool_class", "tool_call_id", "attempt", "timeout", "retry_reason_code", "preflight_receipt_id", "phase", "occurred_at", "duration_ms", "outcome", "input_digest", "output_digest", "metadata_only", "raw_prompt_copied", "raw_reasoning_copied", "raw_tool_payload_copied"],
});
const KIND_CONFIG = Object.freeze({
  work_run: { directory: "work_runs", identityField: "event_id", timeField: "started_at", kind: "work_run", validate: validateAiWorkRun },
  quality_result: { directory: "quality_results", identityField: "event_id", timeField: "occurred_at", kind: "quality_result", validate: validateAiQualityResult },
  tool_event: { directory: "tool_events", identityField: "event_id", timeField: "occurred_at", kind: "tool_event", validate: validateAiToolEvent },
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

export function canonicalEvidenceJson(value) {
  return JSON.stringify(stableValue(value));
}

export function evidenceDigest(value) {
  const input = typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalEvidenceJson(value);
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function exactKeys(value, fields, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  if (Object.keys(value).sort().join("\0") !== [...fields].sort().join("\0")) fail(code);
}

function id(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
}

function nullableId(value, code) {
  if (value !== null) id(value, code);
}

function digest(value, code) {
  if (typeof value !== "string" || !DIGEST.test(value)) fail(code);
}

function nullableDigest(value, code) {
  if (value !== null) digest(value, code);
}

function timestamp(value, code) {
  if (typeof value !== "string" || !UTC.test(value) || !Number.isFinite(Date.parse(value))) fail(code);
}

function count(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
}

function nullableNonnegativeNumber(value, code) {
  if (value !== null && (!Number.isFinite(value) || value < 0)) fail(code);
}

function idList(value, pattern, code) {
  if (!Array.isArray(value) || value.length > 256 || new Set(value).size !== value.length || value.some((item) => typeof item !== "string" || !pattern.test(item))) fail(code);
}

function privacyBoundary(event) {
  if (event.metadata_only !== true || event.raw_prompt_copied !== false || event.raw_reasoning_copied !== false || event.raw_tool_payload_copied !== false) fail("evidence_event_privacy_invalid");
}

export function validateAiWorkRun(event) {
  exactKeys(event, EVENT_FIELDS.work_run, "ai_work_run_shape_invalid");
  if (event.schema_version !== AI_WORK_RUN_SCHEMA) fail("ai_work_run_schema_invalid");
  for (const field of ["event_id", "run_id", "work_id", "model_id"]) id(event[field], `ai_work_run_${field}_invalid`);
  if (!new Set(["operational", "experiment"]).has(event.run_scope)) fail("ai_work_run_scope_invalid");
  if (!new Set(["execution", "coordination", "verification", "rework", "other"]).has(event.cost_role)) fail("ai_work_run_cost_role_invalid");
  if (!new Set(["control", "candidate"]).has(event.variant)) fail("ai_work_run_variant_invalid");
  for (const field of ["task_class", "risk_class", "launcher_version"]) id(event[field], `ai_work_run_${field}_invalid`);
  nullableId(event.experiment_id, "ai_work_run_experiment_id_invalid");
  if (event.repo_commit !== null && (typeof event.repo_commit !== "string" || !COMMIT_REF.test(event.repo_commit))) fail("ai_work_run_repo_commit_invalid");
  exactKeys(event.topology, ["expected_max_depth", "expected_max_children", "reviewer_policy", "preflight_policy"], "ai_work_run_topology_shape_invalid");
  count(event.topology.expected_max_depth, "ai_work_run_topology_depth_invalid");
  count(event.topology.expected_max_children, "ai_work_run_topology_children_invalid");
  id(event.topology.reviewer_policy, "ai_work_run_topology_reviewer_policy_invalid");
  id(event.topology.preflight_policy, "ai_work_run_topology_preflight_policy_invalid");
  exactKeys(event.cost_scope, ["controller_included", "executor_included", "reviewer_included", "offline_oracle_included"], "ai_work_run_cost_scope_shape_invalid");
  if (Object.values(event.cost_scope).some((value) => typeof value !== "boolean")) fail("ai_work_run_cost_scope_invalid");
  nullableId(event.work_record_ref, "ai_work_run_work_record_ref_invalid");
  timestamp(event.started_at, "ai_work_run_started_at_invalid");
  if (event.completed_at !== null) {
    timestamp(event.completed_at, "ai_work_run_completed_at_invalid");
    if (event.completed_at < event.started_at) fail("ai_work_run_time_order_invalid");
  }
  nullableId(event.reasoning_effort, "ai_work_run_reasoning_effort_invalid");
  idList(event.usage_event_ids, SAFE_ID, "ai_work_run_usage_event_ids_invalid");
  nullableId(event.instruction_manifest_ref, "ai_work_run_instruction_manifest_ref_invalid");
  if (!new Set(["complete", "partial", "unknown"]).has(event.measurement_status)) fail("ai_work_run_measurement_status_invalid");
  if (event.authority !== "non_authoritative_measurement_projection") fail("ai_work_run_authority_invalid");
  privacyBoundary(event);
  return event;
}

export function validateAiQualityResult(event) {
  exactKeys(event, EVENT_FIELDS.quality_result, "ai_quality_result_shape_invalid");
  if (event.schema_version !== AI_QUALITY_RESULT_SCHEMA) fail("ai_quality_result_schema_invalid");
  for (const field of ["event_id", "result_id", "run_id", "work_id", "metric_id"]) id(event[field], `ai_quality_result_${field}_invalid`);
  if (!new Set(["deterministic", "human", "model"]).has(event.evaluator_kind)) fail("ai_quality_result_evaluator_invalid");
  if (!Number.isFinite(event.scale_min) || !Number.isFinite(event.scale_max) || event.scale_max <= event.scale_min) fail("ai_quality_result_scale_invalid");
  if (event.score !== null && (!Number.isFinite(event.score) || event.score < event.scale_min || event.score > event.scale_max)) fail("ai_quality_result_score_invalid");
  if (!new Set(["pass", "fail", "hold", "observed"]).has(event.decision)) fail("ai_quality_result_decision_invalid");
  if ((event.decision === "pass" || event.decision === "fail") && event.score === null) fail("ai_quality_result_score_required");
  idList(event.evidence_refs, SAFE_REF, "ai_quality_result_evidence_refs_invalid");
  timestamp(event.occurred_at, "ai_quality_result_time_invalid");
  privacyBoundary(event);
  return event;
}

export function validateAiToolEvent(event) {
  exactKeys(event, EVENT_FIELDS.tool_event, "ai_tool_event_shape_invalid");
  if (event.schema_version !== AI_TOOL_EVENT_SCHEMA) fail("ai_tool_event_schema_invalid");
  for (const field of ["event_id", "run_id", "work_id", "tool_name", "tool_class"]) id(event[field], `ai_tool_event_${field}_invalid`);
  nullableId(event.tool_call_id, "ai_tool_event_tool_call_id_invalid");
  count(event.attempt, "ai_tool_event_attempt_invalid");
  if (typeof event.timeout !== "boolean") fail("ai_tool_event_timeout_invalid");
  nullableId(event.retry_reason_code, "ai_tool_event_retry_reason_code_invalid");
  nullableId(event.preflight_receipt_id, "ai_tool_event_preflight_receipt_id_invalid");
  if (!new Set(["started", "completed", "failed"]).has(event.phase)) fail("ai_tool_event_phase_invalid");
  timestamp(event.occurred_at, "ai_tool_event_time_invalid");
  if (event.duration_ms !== null) count(event.duration_ms, "ai_tool_event_duration_invalid");
  if (!new Set(["pending", "succeeded", "failed", "blocked", "unknown"]).has(event.outcome)) fail("ai_tool_event_outcome_invalid");
  if (event.phase === "started" && event.outcome !== "pending") fail("ai_tool_event_started_outcome_invalid");
  nullableDigest(event.input_digest, "ai_tool_event_input_digest_invalid");
  nullableDigest(event.output_digest, "ai_tool_event_output_digest_invalid");
  privacyBoundary(event);
  return event;
}

export function validateAiUsageReplayReceipt(receipt) {
  const fields = ["schema_version", "receipt_id", "observed_at", "parser_digest", "rate_card_digest", "config_digest", "source_manifest_digest", "source_manifest_count", "parsed_turn_count", "excluded_or_held_session_count", "explicit_work_binding_count", "lineage_edge_count", "role_binding_count", "calculated_total", "rate_unknown_turn_count", "ledger_content_digest_before", "ledger_content_digest_after", "created_count", "updated_count", "replayed_count", "pending_count", "conflict_count", "coverage", "event_id_set_digest", "raw_payload_copied"];
  exactKeys(receipt, fields, "ai_usage_replay_receipt_shape_invalid");
  if (receipt.schema_version !== AI_USAGE_REPLAY_RECEIPT_SCHEMA) fail("ai_usage_replay_receipt_schema_invalid");
  id(receipt.receipt_id, "ai_usage_replay_receipt_id_invalid");
  timestamp(receipt.observed_at, "ai_usage_replay_receipt_time_invalid");
  for (const field of ["parser_digest", "rate_card_digest", "config_digest", "source_manifest_digest", "ledger_content_digest_before", "ledger_content_digest_after", "event_id_set_digest"]) digest(receipt[field], `ai_usage_replay_receipt_${field}_invalid`);
  for (const field of ["source_manifest_count", "parsed_turn_count", "excluded_or_held_session_count", "explicit_work_binding_count", "lineage_edge_count", "role_binding_count", "rate_unknown_turn_count", "created_count", "updated_count", "replayed_count", "pending_count", "conflict_count"]) count(receipt[field], `ai_usage_replay_receipt_${field}_invalid`);
  nullableNonnegativeNumber(receipt.calculated_total, "ai_usage_replay_receipt_calculated_total_invalid");
  exactKeys(receipt.coverage, ["source_count", "parsed_count", "issue_count", "complete"], "ai_usage_replay_receipt_coverage_shape_invalid");
  for (const field of ["source_count", "parsed_count", "issue_count"]) count(receipt.coverage[field], `ai_usage_replay_receipt_coverage_${field}_invalid`);
  if (receipt.coverage.parsed_count > receipt.coverage.source_count || typeof receipt.coverage.complete !== "boolean") fail("ai_usage_replay_receipt_coverage_invalid");
  const expectedComplete = receipt.coverage.parsed_count === receipt.coverage.source_count && receipt.coverage.issue_count === 0;
  if (receipt.coverage.complete !== expectedComplete) fail("ai_usage_replay_receipt_coverage_complete_invalid");
  if (receipt.coverage.source_count !== receipt.source_manifest_count + receipt.excluded_or_held_session_count) fail("ai_usage_replay_receipt_source_reconciliation_invalid");
  const outcomeCount = receipt.created_count + receipt.updated_count + receipt.replayed_count + receipt.pending_count + receipt.conflict_count;
  if (outcomeCount !== receipt.parsed_turn_count) fail("ai_usage_replay_receipt_turn_reconciliation_invalid");
  for (const field of ["explicit_work_binding_count", "lineage_edge_count", "role_binding_count", "rate_unknown_turn_count"]) {
    if (receipt[field] > receipt.parsed_turn_count) fail("ai_usage_replay_receipt_turn_relation_invalid");
  }
  const ledgerChanged = receipt.ledger_content_digest_before !== receipt.ledger_content_digest_after;
  if (ledgerChanged !== (receipt.created_count + receipt.updated_count > 0)) fail("ai_usage_replay_receipt_ledger_reconciliation_invalid");
  if (receipt.raw_payload_copied !== false) fail("ai_usage_replay_receipt_raw_payload_forbidden");
  return receipt;
}

async function walk(root, output = []) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return output;
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) await walk(full, output);
    else if (entry.isFile() && entry.name.endsWith(".json")) output.push(full);
  }
  return output;
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function acquireLock(lockPath) {
  const owner = { pid: process.pid, token: randomBytes(12).toString("hex"), started_at: new Date().toISOString() };
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
    return { handle, owner };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return null;
  }
}

async function withLock(root, callback) {
  await mkdir(root, { recursive: true });
  const lockPath = path.join(root, "evidence-ledger.lock");
  let lock = null;
  for (let attempt = 0; attempt < 100 && !lock; attempt += 1) {
    lock = await acquireLock(lockPath);
    if (!lock) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  if (!lock) fail("evidence_ledger_busy");
  try {
    return await callback();
  } finally {
    await lock.handle.close().catch(() => {});
    try {
      const current = JSON.parse(await readFile(lockPath, "utf8"));
      if (current?.token === lock.owner.token) await rm(lockPath, { force: true });
    } catch {
      // Missing or replaced locks must not be removed.
    }
  }
}

export async function persistStrictMonthlyRecord(stateRoot, config, record) {
  if (!config || typeof config !== "object" || typeof config.directory !== "string" || typeof config.identityField !== "string" || typeof config.timeField !== "string" || typeof config.kind !== "string" || typeof config.validate !== "function") fail("evidence_persistence_config_invalid");
  for (const field of ["directory", "identityField", "timeField", "kind"]) id(config[field], "evidence_persistence_config_invalid");
  if (config.replayProjection !== undefined && typeof config.replayProjection !== "function") fail("evidence_persistence_config_invalid");
  config.validate(record);
  const identity = record[config.identityField];
  const occurredAt = record[config.timeField];
  id(identity, "evidence_record_identity_invalid");
  timestamp(occurredAt, "evidence_record_time_invalid");
  const root = path.resolve(stateRoot);
  return withLock(root, async () => {
    const directoryRoot = path.join(root, config.directory);
    const existingFiles = await walk(directoryRoot);
    const existingPath = existingFiles.find((file) => path.basename(file) === `${identity}.json`) ?? null;
    const payloadDigest = evidenceDigest(record);
    if (existingPath) {
      const existing = JSON.parse(await readFile(existingPath, "utf8"));
      config.validate(existing);
      const existingComparable = config.replayProjection ? config.replayProjection(existing) : existing;
      const recordComparable = config.replayProjection ? config.replayProjection(record) : record;
      if (canonicalEvidenceJson(existingComparable) !== canonicalEvidenceJson(recordComparable)) fail("evidence_event_id_conflict");
      return {
        schema_version: "soulforge.ai_evidence_persistence_receipt.v1",
        status: "replayed",
        kind: config.kind,
        event_id: identity,
        event_digest: evidenceDigest(existing),
        path_ref: path.relative(root, existingPath).replaceAll("\\", "/"),
      };
    }
    const month = occurredAt.slice(0, 7);
    const target = path.join(directoryRoot, month, `${identity}.json`);
    await writeJsonAtomic(target, record);
    return {
      schema_version: "soulforge.ai_evidence_persistence_receipt.v1",
      status: "created",
      kind: config.kind,
      event_id: identity,
      event_digest: payloadDigest,
      path_ref: path.relative(root, target).replaceAll("\\", "/"),
    };
  });
}

export async function loadStrictMonthlyRecords(stateRoot, config) {
  if (!config || typeof config !== "object" || typeof config.directory !== "string" || typeof config.identityField !== "string" || typeof config.validate !== "function") fail("evidence_persistence_config_invalid");
  for (const field of ["directory", "identityField"]) id(config[field], "evidence_persistence_config_invalid");
  const files = await walk(path.join(path.resolve(stateRoot), config.directory));
  const records = [];
  const ids = new Set();
  for (const file of files.sort()) {
    const record = JSON.parse(await readFile(file, "utf8"));
    config.validate(record);
    const identity = record[config.identityField];
    id(identity, "evidence_record_identity_invalid");
    if (ids.has(identity)) fail("evidence_event_duplicate_persisted");
    ids.add(identity);
    records.push(record);
  }
  return records;
}

export async function persistEvidenceEvent(stateRoot, kind, event) {
  const config = KIND_CONFIG[kind];
  if (!config) fail("evidence_event_kind_invalid");
  return persistStrictMonthlyRecord(stateRoot, config, event);
}

export async function loadEvidenceEvents(stateRoot, kind) {
  const config = KIND_CONFIG[kind];
  if (!config) fail("evidence_event_kind_invalid");
  return loadStrictMonthlyRecords(stateRoot, config);
}

export const persistAiWorkRun = (stateRoot, event) => persistEvidenceEvent(stateRoot, "work_run", event);
export const persistAiQualityResult = (stateRoot, event) => persistEvidenceEvent(stateRoot, "quality_result", event);
export const persistAiToolEvent = (stateRoot, event) => persistEvidenceEvent(stateRoot, "tool_event", event);
export const persistAiUsageReplayReceipt = (stateRoot, receipt) => persistStrictMonthlyRecord(stateRoot, {
  directory: "receipts",
  identityField: "receipt_id",
  timeField: "observed_at",
  kind: "usage_replay_receipt",
  validate: validateAiUsageReplayReceipt,
}, receipt);
export const loadAiUsageReplayReceipts = (stateRoot) => loadStrictMonthlyRecords(stateRoot, {
  directory: "receipts",
  identityField: "receipt_id",
  kind: "usage_replay_receipt",
  validate: validateAiUsageReplayReceipt,
});

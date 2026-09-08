import { createHash } from "node:crypto";

import {
  CORRECTION_CATEGORIES,
  EFFECT_COUNTER_KEYS,
  HOURLY_SHADOW_CYCLE_SCHEMA,
  HOURLY_SHADOW_POLICY_REVISION,
  REQUIRED_SOURCE_MANIFEST,
  validateHourlyShadowCycle,
} from "./hourly_shadow_cycle_contract.mjs";
import { isValidatedWorkIntakeDocuments } from "./work_intake_documents.mjs";
import { isWorkIntakeProviderJudge, verifyWorkIntakeJudgeReceipt } from "./work_intake_judge.mjs";

// This adapter has no source readers, model client, writer, or scheduler. A scripted
// synthetic judge exercises plumbing only. Live bindings and historical replay
// require separate contracts; neither can be relabelled as a synthetic live cycle.
export const WORK_INTAKE_CLASSIFICATIONS = Object.freeze(["NEW", "FOLLOW_UP", "EVIDENCE", "NO_ACTION", "HOLD"]);
const RESULTS = new WeakSet();
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/_-]{0,127}$/;
const PROJECT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const HASH = /^[a-f0-9]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
const SOURCES = new Set(["gmail", "linear", "slack", "buzz", "file_change", "voice"]);
const REASONS = new Set(["NEW_REQUEST", "EXISTING_TASK", "SUPPORTING_EVIDENCE", "ALREADY_COMPLETED", "NO_NEW_REQUEST", "INSUFFICIENT_EVIDENCE", "UNKNOWN"]);
const INPUT_KEYS = ["run_id", "provenance", "project_ref", "window", "observed_at", "permission_refs", "source_reads", "events", "linear_view", "echo_receipts", "document_validation"];
const READ_KEYS = ["source", "scope_ref", "status", "window", "cursor_before", "cursor_after", "observed_at", "permission_ref", "evidence_refs"];
const EVENT_KEYS = ["source", "scope_ref", "event_ref", "revision_ref", "revision_sha256", "occurred_at", "observed_at", "project_ref", "project_binding_ref", "revision_state", "parse_state", "evidence_refs", "facts", "facts_sha256", "correction"];
const LINEAR_KEYS = ["scope_ref", "as_of", "status", "coverage", "evidence_refs", "tasks"];
const TASK_KEYS = ["task_ref", "project_ref", "status", "task_semantic_sha256", "evidence_refs"];
const TASK_FACT_KEYS = [...TASK_KEYS, 'facts', 'facts_sha256'];
const ECHO_KEYS = ["source", "scope_ref", "event_ref", "revision_sha256", "evidence_ref", "result_ref"];
const JUDGMENT_KEYS = ["classification", "reason_code", "matched_task_ref", "task_semantic_sha256", "action_semantic_sha256", "evidence_refs", "model_receipt"];
const RECEIPT_KEYS = ["kind", "model_ref", "receipt_ref", "input_sha256", "prompt_sha256_ref"];
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const token = (v) => typeof v === "string" && TOKEN.test(v);
const nullableToken = (v) => v === null || token(v);
const digest = (v) => typeof v === "string" && HASH.test(v);
const timestamp = (v) => typeof v === "string" && ISO.test(v) && Number.isFinite(Date.parse(v));
const exact = (v, keys) => isRecord(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const refs = (v, maximum = 32) => Array.isArray(v) && v.length <= maximum && v.every(token) && new Set(v).size === v.length;
const zeroEffects = () => Object.fromEntries(EFFECT_COUNTER_KEYS.map((key) => [key, 0]));
const unique = (values) => [...new Set(values)];

function freeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

const sha = (value) => createHash("sha256").update(canonical(value), "utf8").digest("hex");

// Snapshot ordinary bounded JSON before an await. Reject accessors/proxies that
// throw, cyclic graphs and exotic values rather than invoking arbitrary toJSON.
function snapshot(value, state = { nodes: 0, bytes: 0, ancestors: new Set() }, depth = 0) {
  if (++state.nodes > 10000 || depth > 12) throw new Error("bounds");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    state.bytes += value.length;
    if (state.bytes > 131072) throw new Error("bounds");
    return value;
  }
  if (typeof value !== "object" || state.ancestors.has(value)) throw new Error("graph");
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("prototype");
  if (Array.isArray(value) && (Object.keys(value).length !== value.length
    || Object.keys(value).some((key, index) => key !== String(index)))) throw new Error("array_shape");
  state.ancestors.add(value);
  const output = Array.isArray(value) ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !descriptor.enumerable || !Object.hasOwn(descriptor, "value") || key === "__proto__") throw new Error("descriptor");
    output[key] = snapshot(descriptor.value, state, depth + 1);
  }
  state.ancestors.delete(value);
  return output;
}

export function hashWorkIntakeFacts(facts) {
  return sha(snapshot(facts));
}

export function isWorkIntakeResult(value) {
  return isRecord(value) && RESULTS.has(value);
}

function validWindow(value) {
  return exact(value, ["start", "end"]) && timestamp(value.start) && timestamp(value.end)
    && Date.parse(value.end) > Date.parse(value.start)
    && Date.parse(value.end) - Date.parse(value.start) <= 24 * 60 * 60 * 1000;
}

function inWindow(time, window) {
  return Date.parse(time) > Date.parse(window.start) && Date.parse(time) <= Date.parse(window.end);
}

function projectRef(value) {
  return typeof value === "string" && PROJECT.test(value);
}

function validateRead(read, input) {
  if (!exact(read, READ_KEYS) || !SOURCES.has(read.source) || !token(read.scope_ref)
    || !["read", "empty", "partial", "unavailable"].includes(read.status)
    || !validWindow(read.window) || !nullableToken(read.cursor_before) || !nullableToken(read.cursor_after)
    || !timestamp(read.observed_at) || !token(read.permission_ref) || !refs(read.evidence_refs) || read.evidence_refs.length === 0) return ["INVALID_SOURCE_READ"];
  const codes = [];
  if (!input.permission_refs.includes(read.permission_ref)) codes.push("SOURCE_PERMISSION_MISSING");
  if (Date.parse(read.window.start) > Date.parse(input.window.start) || Date.parse(read.window.end) < Date.parse(input.window.end)) codes.push("SOURCE_WINDOW_GAP");
  if (Date.parse(read.observed_at) < Date.parse(input.window.end) || Date.parse(read.observed_at) > Date.parse(input.observed_at)) codes.push("SOURCE_READ_TIME_INVALID");
  if (read.status === "partial") codes.push("SOURCE_PARTIAL");
  if (read.status === "unavailable") codes.push("SOURCE_UNAVAILABLE");
  return codes;
}

function validateEvent(event, input, read) {
  if (!exact(event, EVENT_KEYS) || !SOURCES.has(event.source) || !token(event.scope_ref)
    || !token(event.event_ref) || !token(event.revision_ref) || !digest(event.revision_sha256)
    || !timestamp(event.occurred_at) || !timestamp(event.observed_at)
    || !(event.project_ref === null || projectRef(event.project_ref)) || !nullableToken(event.project_binding_ref)
    || !["current", "superseded", "refuted", "unknown"].includes(event.revision_state)
    || !["parsed", "unavailable", "failed", "not_attempted"].includes(event.parse_state)
    || !refs(event.evidence_refs) || event.evidence_refs.length === 0
    || !(event.correction === null || (exact(event.correction, ["supersedes_cycle_ref", "category"])
      && token(event.correction.supersedes_cycle_ref) && CORRECTION_CATEGORIES.includes(event.correction.category)))
    || !Array.isArray(event.facts) || event.facts.length > 24 || !digest(event.facts_sha256)
    || !event.facts.every((fact) => exact(fact, ["fact_ref", "text"]) && token(fact.fact_ref)
      && typeof fact.text === "string" && fact.text.length > 0 && fact.text.length <= 2400)) return ["INVALID_EVENT"];
  const codes = [];
  if (sha(event.facts) !== event.facts_sha256) codes.push("FACTS_DIGEST_MISMATCH");
  if (new Set(event.facts.map((fact) => fact.fact_ref)).size !== event.facts.length
    || !event.evidence_refs.includes(event.revision_ref)
    || event.facts.some((fact) => !event.evidence_refs.includes(fact.fact_ref))) codes.push("EVENT_EVIDENCE_UNBOUND");
  if (event.project_ref === null || event.project_binding_ref === null) codes.push("PROJECT_BINDING_UNKNOWN");
  else if (event.project_ref !== input.project_ref) codes.push("PROJECT_BINDING_MISMATCH");
  else if (!event.evidence_refs.includes(event.project_binding_ref)) codes.push("PROJECT_BINDING_UNPROVEN");
  if (!read || read.scope_ref !== event.scope_ref) codes.push("SOURCE_SCOPE_MISMATCH");
  else {
    if (read.status === "empty") codes.push("EMPTY_READ_HAS_EVENTS");
    if (Date.parse(event.observed_at) > Date.parse(read.observed_at)) codes.push("EVENT_AFTER_SOURCE_READ");
  }
  if (Date.parse(event.occurred_at) > Date.parse(event.observed_at) || Date.parse(event.observed_at) > Date.parse(input.observed_at)) codes.push("EVENT_TIME_INVALID");
  // Selection uses observation, while occurrence is retained for late arrivals.
  if (!inWindow(event.observed_at, input.window)) codes.push("EVENT_OUTSIDE_OBSERVATION_WINDOW");
  if (event.revision_state !== "current") codes.push({ superseded: "STALE_REVISION", refuted: "REFUTED_REVISION", unknown: "REVISION_UNKNOWN" }[event.revision_state]);
  if (event.parse_state !== "parsed") codes.push({ unavailable: "PARSE_UNAVAILABLE", failed: "PARSE_FAILED", not_attempted: "PARSE_NOT_ATTEMPTED" }[event.parse_state]);
  if (event.parse_state === "parsed" && event.facts.length === 0) codes.push("PARSED_FACTS_EMPTY");
  return codes;
}

function validateLinear(view, input, read) {
  if (!exact(view, LINEAR_KEYS) || !token(view.scope_ref) || !timestamp(view.as_of)
    || !["current", "stale", "unknown"].includes(view.status)
    || !["complete", "partial", "unavailable"].includes(view.coverage)
    || !refs(view.evidence_refs) || view.evidence_refs.length === 0
    || !Array.isArray(view.tasks) || view.tasks.length > 128
    || !view.tasks.every((task) => (exact(task, TASK_KEYS) || exact(task, TASK_FACT_KEYS)) && token(task.task_ref) && projectRef(task.project_ref)
      && ["open", "completed", "cancelled"].includes(task.status) && digest(task.task_semantic_sha256)
      && refs(task.evidence_refs) && task.evidence_refs.length > 0
      && (task.facts === undefined || Array.isArray(task.facts) && task.facts.length > 0 && task.facts.length <= 8
        && task.facts.every(fact => exact(fact, ['fact_ref', 'text']) && token(fact.fact_ref) && task.evidence_refs.includes(fact.fact_ref)
          && typeof fact.text === 'string' && fact.text.length > 0 && fact.text.length <= 2400)
        && task.facts_sha256 === sha(task.facts)))) return ["INVALID_LINEAR_VIEW"];
  const codes = [];
  if (!read || view.scope_ref !== read.scope_ref) codes.push("LINEAR_SCOPE_MISMATCH");
  if (Date.parse(view.as_of) < Date.parse(input.window.end) || Date.parse(view.as_of) > Date.parse(input.observed_at)
    || (read && Date.parse(view.as_of) > Date.parse(read.observed_at))) codes.push("LINEAR_VIEW_TIME_INVALID");
  if (view.status !== "current") codes.push(view.status === "stale" ? "LINEAR_VIEW_STALE" : "LINEAR_VIEW_UNKNOWN");
  if (view.coverage !== "complete") codes.push(view.coverage === "partial" ? "LINEAR_VIEW_PARTIAL" : "LINEAR_VIEW_UNAVAILABLE");
  if (view.tasks.some((task) => task.project_ref !== input.project_ref)) codes.push("LINEAR_PROJECT_MISMATCH");
  if (new Set(view.tasks.map((task) => task.task_ref)).size !== view.tasks.length) codes.push("DUPLICATE_LINEAR_TASK");
  if (read?.status === "empty" && view.tasks.length > 0) codes.push("EMPTY_LINEAR_READ_HAS_TASKS");
  return codes;
}

function validateJudgment(value, request, event, input, judge) {
  if (!exact(value, JUDGMENT_KEYS) || !WORK_INTAKE_CLASSIFICATIONS.includes(value.classification)
    || !REASONS.has(value.reason_code) || !nullableToken(value.matched_task_ref)
    || !(value.task_semantic_sha256 === null || digest(value.task_semantic_sha256))
    || !(value.action_semantic_sha256 === null || digest(value.action_semantic_sha256))
    || !refs(value.evidence_refs) || value.evidence_refs.length === 0
    || !exact(value.model_receipt, RECEIPT_KEYS)) return ["INVALID_JUDGE_OUTPUT"];
  const codes = [];
  const receipt = value.model_receipt;
  const providerReceipt = isWorkIntakeProviderJudge(judge) && verifyWorkIntakeJudgeReceipt(judge, receipt, request, value);
  if ((!providerReceipt && (input.provenance !== 'synthetic' || receipt.kind !== "scripted" || receipt.model_ref !== "SCRIPTED_SYNTHETIC"))
    || !token(receipt.receipt_ref) || receipt.input_sha256 !== request.input_sha256
    || !digest(receipt.prompt_sha256_ref)) codes.push("JUDGE_RECEIPT_UNBOUND");
  const allowed = new Set([...event.evidence_refs, ...input.linear_view.evidence_refs, ...input.linear_view.tasks.flatMap((task) => task.evidence_refs)]);
  if (value.evidence_refs.some((ref) => !allowed.has(ref)) || !value.evidence_refs.includes(event.revision_ref)
    || !value.evidence_refs.includes(event.project_binding_ref)) codes.push("JUDGE_EVIDENCE_UNBOUND");
  const task = input.linear_view.tasks.find((entry) => entry.task_ref === value.matched_task_ref);
  if (value.matched_task_ref !== null && !task) codes.push("MATCHED_TASK_UNKNOWN");
  if (task && (task.task_semantic_sha256 !== value.task_semantic_sha256
    || !task.evidence_refs.some((ref) => value.evidence_refs.includes(ref)))) codes.push("MATCHED_TASK_UNBOUND");
  if (["NEW", "FOLLOW_UP", "EVIDENCE"].includes(value.classification)
    && (!digest(value.task_semantic_sha256) || !digest(value.action_semantic_sha256))) codes.push("SEMANTIC_IDENTITY_REQUIRED");
  if (value.classification === "NEW" && (value.matched_task_ref !== null
    || input.linear_view.tasks.some((entry) => entry.task_semantic_sha256 === value.task_semantic_sha256))) codes.push("EXISTING_TASK_MISCLASSIFIED_NEW");
  if (["FOLLOW_UP", "EVIDENCE"].includes(value.classification) && !task) codes.push("EXISTING_TASK_REQUIRED");
  if (value.classification === "FOLLOW_UP" && task && task.status !== "open") codes.push("CLOSED_TASK_FOLLOW_UP");
  if (value.classification === "NO_ACTION" && value.action_semantic_sha256 !== null) codes.push("NO_ACTION_HAS_ACTION");
  return codes;
}

function initialAttempt(input, kind, index, event = null) {
  const identity = event && SOURCES.has(event.source) && token(event.scope_ref) && token(event.event_ref)
    ? `event_${sha([event.source, event.scope_ref, event.event_ref])}` : null;
  return {
    attempt_id: `attempt_${sha([input?.run_id ?? null, kind, index, identity])}`,
    kind,
    source: event && SOURCES.has(event.source) ? event.source : null,
    scope_ref: event && token(event.scope_ref) ? event.scope_ref : null,
    event_ref: event && token(event.event_ref) ? event.event_ref : null,
    project_binding_ref: event && token(event.project_binding_ref) ? event.project_binding_ref : null,
    event_identity: identity,
    event_revision_sha256: event && digest(event.revision_sha256) ? event.revision_sha256 : null,
    source_revision_ref: event && token(event.revision_ref) ? event.revision_ref : null,
    occurred_at: event && timestamp(event.occurred_at) ? event.occurred_at : null,
    observed_at: event && timestamp(event.observed_at) ? event.observed_at : null,
    late_arrival: event && validWindow(input?.window) && timestamp(event.occurred_at) ? Date.parse(event.occurred_at) <= Date.parse(input.window.start) : false,
    status: "HOLD", classification: "HOLD", reason_codes: [],
    task_identity: null, task_semantic_sha256: null, action_semantic_sha256: null, semantic_digest: null,
    matched_task_ref: null, evidence_refs: [], model_receipt_ref: null,
    echo_provenance: null,
    shadow_cycle: null, shadow_validation: { status: "NOT_ATTEMPTED", hold_codes: [] },
  };
}

function contractReads(input) {
  return input.source_reads.map((read) => {
    const events = input.events.filter((event) => exact(event, EVENT_KEYS) && event.source === read.source && refs(event.evidence_refs));
    const tasks = read.source === "linear" ? input.linear_view.tasks : [];
    return {
      source: read.source, status: read.status,
      cursor_before: read.cursor_before, cursor_after: read.cursor_after,
      count: events.length + tasks.length,
      latest_time: events.length ? [...events].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0].occurred_at : null,
      coverage_gap: read.status === "partial",
      source_refs: unique([...read.evidence_refs, ...events.flatMap((event) => event.evidence_refs), ...tasks.flatMap((task) => task.evidence_refs)]),
      required: REQUIRED_SOURCE_MANIFEST.required_sources.includes(read.source),
    };
  });
}

function attachCycle(attempt, event, input, judgment = null) {
  const disposition = attempt.classification === "NO_ACTION" ? "NO_ACTION" : attempt.classification === "HOLD" ? "HOLD" : "PROPOSAL";
  const type = { NEW: "task_candidate", FOLLOW_UP: "follow_up", EVIDENCE: "evidence_review" }[attempt.classification] ?? null;
  const packet = {
    cycle_id: `cycle_${sha(attempt.attempt_id)}`, project_ref: input.project_ref,
    occurred_at: event.occurred_at, observed_at: input.observed_at, kst_cutoff: input.window.end,
    model_ref: judgment?.model_receipt.model_ref ?? "UNKNOWN",
    prompt_sha256_ref: judgment?.model_receipt.prompt_sha256_ref ?? sha([]),
    policy_ref: HOURLY_SHADOW_POLICY_REVISION, output_schema_ref: HOURLY_SHADOW_CYCLE_SCHEMA,
    permission_refs: input.permission_refs, context_mode: "live_only",
    trigger_identity: attempt.event_identity,
    trigger_digest: sha([attempt.event_revision_sha256, attempt.semantic_digest, input.linear_view, input.document_validation]),
    source_reads: contractReads(input), disposition,
    why_code: disposition === "PROPOSAL" ? "NEW_DELIVERABLE_REQUESTED" : disposition === "NO_ACTION" ? "NO_NEW_EVENT" : "EVIDENCE_INSUFFICIENT",
    short_summary: "", missing_context: [], evidence_refs: attempt.evidence_refs,
    candidate_task_refs: attempt.task_identity ? [attempt.task_identity] : [],
    task_identity: attempt.task_identity, task_type: type,
    proposed_action: type ? { NEW: "REVIEW_NEW_CANDIDATE", FOLLOW_UP: "REVIEW_FOLLOW_UP", EVIDENCE: "REVIEW_EVIDENCE" }[attempt.classification] : null,
    required_authority: "A0", effect_counters: zeroEffects(), hostile_markers: [],
    supersedes_ref: event.correction?.supersedes_cycle_ref ?? null, correction_category: event.correction?.category ?? null,
    is_bot_echo: attempt.reason_codes.includes("SELF_ECHO_EXACT_READBACK"),
  };
  const checked = validateHourlyShadowCycle(packet);
  attempt.shadow_validation = { status: checked.status, hold_codes: [...checked.hold_codes] };
  attempt.shadow_cycle = checked.cycle;
  if (checked.status !== "VALIDATED") {
    attempt.status = "HOLD";
    attempt.classification = "HOLD";
    attempt.reason_codes = unique([...attempt.reason_codes, ...checked.hold_codes]);
  }
}

function finish(input, inputSha, snapshotSha, attempts, holdCodes, sourceReads = []) {
  for (const attempt of attempts) attempt.input_sha256 = inputSha;
  const decided = attempts.filter((attempt) => attempt.status === "DECIDED").length;
  const failedReads = attempts.filter((attempt) => attempt.kind === "source_read" && attempt.status === "HOLD").length;
  const judgedCycles = attempts.filter((attempt) => attempt.model_receipt_ref && attempt.shadow_cycle).map((attempt) => attempt.shadow_cycle);
  const models = unique(judgedCycles.map((cycle) => cycle.model_ref));
  const prompts = unique(judgedCycles.map((cycle) => cycle.prompt_sha256_ref));
  const result = {
    status: holdCodes.length || attempts.some((attempt) => attempt.status === "HOLD") ? "HOLD" : "COMPLETED",
    run_id: token(input?.run_id) ? input.run_id : null,
    project_ref: projectRef(input?.project_ref) ? input.project_ref : null,
    observed_at: timestamp(input?.observed_at) ? input.observed_at : null,
    provenance: ["synthetic", "source_bound", "live", "replay"].includes(input?.provenance) ? input.provenance : "unknown",
    input_sha256: inputSha, snapshot_sha256: snapshotSha,
    comparison_dimensions: { policy_ref: HOURLY_SHADOW_POLICY_REVISION,
      model_ref: models.length === 1 ? models[0] : "UNKNOWN",
      prompt_sha256_ref: prompts.length === 1 ? prompts[0] : "UNKNOWN",
      document_manifest_sha256: digest(input?.document_validation?.manifest_sha256) ? input.document_validation.manifest_sha256 : null,
      document_evidence_sha256: input?.document_validation?.checked_documents ? sha(input.document_validation.checked_documents) : null },
    hold_codes: unique(holdCodes), attempts, source_reads: sourceReads,
    cursor_proposals: sourceReads.map((read) => ({ source: read.source, scope_ref: read.scope_ref, before: read.cursor_before, after: read.cursor_after,
      eligible: holdCodes.length === 0 && ["read", "empty"].includes(read.status)
        && !attempts.some((attempt) => attempt.status === "HOLD" && (attempt.source === null || attempt.source === read.source || REQUIRED_SOURCE_MANIFEST.required_sources.includes(attempt.source))) })),
    denominators: { total_attempts: attempts.length, event_attempts: attempts.filter((attempt) => attempt.kind === "event").length,
      source_read_attempts: attempts.filter((attempt) => attempt.kind === "source_read").length,
      failed_reads: failedReads, decided, held: attempts.length - decided,
      proposals: attempts.filter((attempt) => ["NEW", "FOLLOW_UP", "EVIDENCE"].includes(attempt.classification)).length },
    effect_counters: zeroEffects(),
  };
  freeze(result);
  RESULTS.add(result);
  return result;
}

/**
 * runWorkIntake(input, { judge }) -> Promise<immutable branded result>.
 * input.document_validation must be a branded hourly_intake document result.
 * All other exact input fields are enumerated above. facts[{fact_ref,text}] are
 * ephemeral synthetic judge input; only their fingerprint survives in results.
 * judge receives a frozen packet with input_sha256; its strict response contains
 * classifications, semantic hashes, bound locator refs and a scripted receipt.
 * The outer provenance MUST accompany shadow_cycle in persistence/evaluation.
 */
export async function runWorkIntake(input, { judge, eventGate } = {}) {
  let data;
  let inputSha = null;
  let snapshotSha = null;
  let documentsValid = false;
  try {
    const documentValue = isRecord(input) ? Object.getOwnPropertyDescriptor(input, "document_validation")?.value : null;
    documentsValid = isValidatedWorkIntakeDocuments(documentValue) && documentValue.action === "hourly_intake";
    data = snapshot(input);
    inputSha = sha(data);
    const { run_id: ignoredRun, document_validation: ignoredDocuments, ...comparison } = data;
    snapshotSha = sha(comparison);
  } catch {
    return finish(null, null, null, [{ ...initialAttempt(null, "input", 0), reason_codes: ["INVALID_INPUT_GRAPH"] }], ["INVALID_INPUT_GRAPH"]);
  }
  const invalid = [];
  if (!exact(data, INPUT_KEYS) || !token(data.run_id) || !projectRef(data.project_ref)
    || !validWindow(data.window) || !timestamp(data.observed_at) || Date.parse(data.observed_at) < Date.parse(data.window.end)
    || !refs(data.permission_refs, 16) || data.permission_refs.length === 0
    || !Array.isArray(data.source_reads) || data.source_reads.length > 6
    || !Array.isArray(data.events) || data.events.length > 64
    || !Array.isArray(data.echo_receipts) || data.echo_receipts.length > 64) invalid.push("INVALID_INPUT");
  if (data.provenance !== "synthetic" && !(data.provenance === 'source_bound' && isWorkIntakeProviderJudge(judge)))
    invalid.push(data.provenance === "replay" ? "HISTORICAL_REPLAY_NOT_SUPPORTED" : data.provenance === "live" ? "LIVE_BINDING_NOT_IMPLEMENTED" : "PROVENANCE_REQUIRED");
  if (!documentsValid) invalid.push("DOCUMENT_VALIDATION_REQUIRED");
  if (invalid.length) return finish(data, inputSha, snapshotSha, [{ ...initialAttempt(data, "input", 0), reason_codes: invalid }], invalid);

  const attempts = [];
  const readCodes = new Map();
  const reads = new Map();
  const globalCodes = [];
  for (let index = 0; index < data.source_reads.length; index++) {
    const read = data.source_reads[index];
    const codes = validateRead(read, data);
    if (reads.has(read?.source)) globalCodes.push("DUPLICATE_SOURCE_READ");
    if (codes.includes("INVALID_SOURCE_READ")) globalCodes.push("INVALID_SOURCE_READ");
    reads.set(read?.source, read);
    readCodes.set(read?.source, codes);
    const attempt = initialAttempt(data, "source_read", index);
    attempt.source = SOURCES.has(read?.source) ? read.source : null;
    attempt.scope_ref = token(read?.scope_ref) ? read.scope_ref : null;
    attempt.status = codes.length ? "HOLD" : "DECIDED";
    attempt.classification = codes.length ? "HOLD" : "NO_ACTION";
    attempt.reason_codes = codes.length ? codes : ["SOURCE_READ_COMPLETE"];
    attempt.evidence_refs = refs(read?.evidence_refs) ? read.evidence_refs : [];
    attempts.push(attempt);
  }
  for (const source of REQUIRED_SOURCE_MANIFEST.required_sources) {
    if (!reads.has(source)) {
      globalCodes.push("MISSING_REQUIRED_SOURCE");
      attempts.push({ ...initialAttempt(data, "source_read", attempts.length), source, reason_codes: ["MISSING_REQUIRED_SOURCE"] });
    }
  }
  const linearCodes = validateLinear(data.linear_view, data, reads.get("linear"));
  globalCodes.push(...linearCodes);
  if (data.echo_receipts.some((receipt) => !exact(receipt, ECHO_KEYS) || !SOURCES.has(receipt.source)
    || !token(receipt.scope_ref) || !token(receipt.event_ref) || !digest(receipt.revision_sha256)
    || !token(receipt.evidence_ref) || !token(receipt.result_ref))) globalCodes.push("INVALID_ECHO_RECEIPT");
  const requiredCodes = REQUIRED_SOURCE_MANIFEST.required_sources.flatMap((source) => readCodes.get(source) ?? []);
  // The source locator bound is part of the existing contract. Never truncate
  // evidence to make an apparently complete read fit that contract.
  if (!globalCodes.length && contractReads(data).some((read) => read.source_refs.length > 64)) globalCodes.push("SOURCE_EVIDENCE_LIMIT_EXCEEDED");
  const revisions = new Map();
  for (const event of data.events) {
    if (!isRecord(event) || !SOURCES.has(event.source) || !token(event.scope_ref) || !token(event.event_ref)
      || !token(event.revision_ref) || !digest(event.revision_sha256)) continue;
    const key = canonical([event.source, event.scope_ref, event.event_ref, event.revision_ref]);
    const entry = revisions.get(key) ?? { count: 0, hashes: new Set() };
    entry.count++; entry.hashes.add(event.revision_sha256); revisions.set(key, entry);
  }
  for (let index = 0; index < data.events.length; index++) {
    const event = data.events[index];
    const attempt = initialAttempt(data, "event", index, event);
    const codes = unique([...globalCodes, ...requiredCodes, ...(readCodes.get(event?.source) ?? []), ...validateEvent(event, data, reads.get(event?.source))]);
    const revision = event && revisions.get(canonical([event.source, event.scope_ref, event.event_ref, event.revision_ref]));
    if (revision?.count > 1) codes.push(revision.hashes.size > 1 ? "SOURCE_REVISION_CONFLICT" : "DUPLICATE_SOURCE_REVISION");
    attempt.reason_codes = unique(codes);
    attempts.push(attempt);
    if (codes.length) continue;
    if (typeof eventGate === 'function') {
      let gate;
      try { gate = await eventGate(freeze(snapshot(event))); } catch { gate = null; }
      if (gate?.status !== 'READY') {
        attempt.reason_codes = refs(gate?.reason_codes) && gate.reason_codes.length ? gate.reason_codes : ['ENGINEERING_CONTEXT_REQUIRED'];
        continue;
      }
    }
    attempt.evidence_refs = [...event.evidence_refs];
    const echo = data.echo_receipts.find((receipt) => receipt.source === event.source && receipt.scope_ref === event.scope_ref
      && receipt.event_ref === event.event_ref && receipt.revision_sha256 === event.revision_sha256);
    if (echo && (!event.evidence_refs.includes(echo.evidence_ref) || !event.evidence_refs.includes(echo.result_ref))) {
      attempt.reason_codes = ["ECHO_READBACK_UNBOUND"];
      continue;
    }
    if (echo) {
      attempt.status = "DECIDED";
      attempt.classification = "NO_ACTION";
      attempt.reason_codes = ["SELF_ECHO_EXACT_READBACK"];
      attempt.echo_provenance = { source: echo.source, scope_ref: echo.scope_ref, event_ref: echo.event_ref,
        revision_sha256: echo.revision_sha256, evidence_ref: echo.evidence_ref, result_ref: echo.result_ref };
      attempt.semantic_digest = sha(["NO_ACTION", "SELF_ECHO_EXACT_READBACK", null, null]);
      attachCycle(attempt, event, data);
      continue;
    }
    if (typeof judge !== "function") {
      attempt.reason_codes = ["SEMANTIC_JUDGE_UNAVAILABLE"];
      continue;
    }
    const requestData = { schema: data.provenance === 'synthetic' ? "soulforge.work_intake.synthetic_judge.v1" : 'soulforge.work_intake.provider_judge.v1',
      provenance: data.provenance, project_ref: data.project_ref,
      window: data.window, permission_refs: data.permission_refs, event, linear_view: data.linear_view };
    const request = freeze({ ...snapshot(requestData), input_sha256: sha(requestData) });
    let judgment;
    try {
      judgment = snapshot(await judge(request));
    } catch {
      attempt.reason_codes = ["SEMANTIC_JUDGE_FAILED"];
      continue;
    }
    const judgmentCodes = validateJudgment(judgment, request, event, data, judge);
    if (judgmentCodes.length) {
      attempt.reason_codes = judgmentCodes;
      continue;
    }
    attempt.status = judgment.classification === "HOLD" ? "HOLD" : "DECIDED";
    attempt.classification = judgment.classification;
    attempt.reason_codes = [judgment.reason_code];
    attempt.task_semantic_sha256 = judgment.task_semantic_sha256;
    attempt.action_semantic_sha256 = judgment.action_semantic_sha256;
    attempt.task_identity = judgment.task_semantic_sha256 ? `task_${sha([data.project_ref, judgment.task_semantic_sha256])}` : null;
    attempt.semantic_digest = sha([data.project_ref, judgment.classification, judgment.task_semantic_sha256, judgment.action_semantic_sha256]);
    attempt.matched_task_ref = judgment.matched_task_ref;
    attempt.evidence_refs = judgment.evidence_refs;
    attempt.model_receipt_ref = judgment.model_receipt.receipt_ref;
    attachCycle(attempt, event, data, judgment);
  }
  const safeReads = data.source_reads.filter((read) => exact(read, READ_KEYS) && SOURCES.has(read.source)
    && token(read.scope_ref) && validWindow(read.window) && nullableToken(read.cursor_before) && nullableToken(read.cursor_after)
    && timestamp(read.observed_at) && token(read.permission_ref) && refs(read.evidence_refs)
    && ["read", "empty", "partial", "unavailable"].includes(read.status));
  return finish(data, inputSha, snapshotSha, attempts, unique(globalCodes), safeReads);
}

import { createHash } from "node:crypto";

import { canonicalEvidenceJson } from "../../../../guild_hall/ai_usage_meter/evidence_ledger.mjs";

export const CANARY_PACKET_SCHEMA = "soulforge.voice_first_mutation_canary_packet.v1";
export const CANARY_RECEIPT_SCHEMA = "soulforge.voice_first_mutation_canary_receipt.v1";
export const CANARY_POLICY_REVISION = "soulforge.voice_first_mutation_canary_policy.v1";

const D = Object.freeze({
  tuple: "soulforge.voice_first_mutation_canary.tuple.v1",
  approval: "soulforge.voice_first_mutation_canary.owner_approval.v1",
  c5: "soulforge.voice_first_mutation_canary.c5_evidence.v1",
  packet: "soulforge.voice_first_mutation_canary.packet.v1",
  rate: "soulforge.voice_first_mutation_canary.rate_window.v1",
  state: "soulforge.voice_first_mutation_canary.synthetic_state.v1",
  receipt: "soulforge.voice_first_mutation_canary.receipt.v1",
  stop: "soulforge.voice_first_mutation_canary.stop_conditions.v1",
});
const AUTHORITY_ACTIONS = new Map([
  ["bounded_create_only", ["create_draft_candidate"]],
  ["create_draft_only", ["create_draft_proposal"]],
  ["synthetic_canary_create_only", ["create_synthetic_todo", "create_shadow_candidate"]],
]);
const CREATE_ACTION_SET = new Set([...AUTHORITY_ACTIONS.values()].flat());
const COMPENSATION_MODE_SET = new Set(["void_created_synthetic_object", "supersede_created_synthetic_object"]);
const READBACK_MODE_SET = new Set(["exact_digest_readback"]);
const STOP_CONDITION_SET = new Set([
  "linear_dev_erp_dual_write", "missing_source_coverage", "repeated_without_no_action", "bot_effect_as_trigger",
  "unacknowledged_blind_retry", "unauthorized_external_effect", "raw_secret_ledger_store", "cross_project_contamination",
  "accepted_context_auto_promotion", "skill_self_mutation_deploy",
]);

export const ALLOWED_CREATE_ACTIONS = Object.freeze([...CREATE_ACTION_SET]);
export const ALLOWED_AUTHORITY_LEVELS = Object.freeze([...AUTHORITY_ACTIONS.keys()]);
export const ALLOWED_COMPENSATION_MODES = Object.freeze([...COMPENSATION_MODE_SET]);
export const ALLOWED_READBACK_MODES = Object.freeze([...READBACK_MODE_SET]);
export const ALLOWED_STOP_CONDITIONS = Object.freeze([...STOP_CONDITION_SET]);
export const MIN_C5_SAMPLE_COUNT = 20;

export const CANARY_HOLD_CODES = Object.freeze({
  INVALID_PACKET_SHAPE: "INVALID_PACKET_SHAPE", INVALID_SCHEMA_VERSION: "INVALID_SCHEMA_VERSION", POLICY_REVISION_MISMATCH: "POLICY_REVISION_MISMATCH", CREDENTIAL_OR_SECRET_EXPOSED: "CREDENTIAL_OR_SECRET_EXPOSED",
  INVALID_CANARY_TUPLE: "INVALID_CANARY_TUPLE", FORBIDDEN_WILDCARD_OR_BULK: "FORBIDDEN_WILDCARD_OR_BULK", FORBIDDEN_ACTION_OR_AUTHORITY: "FORBIDDEN_ACTION_OR_AUTHORITY",
  OWNER_APPROVAL_INVALID: "OWNER_APPROVAL_INVALID", OWNER_APPROVAL_DIGEST_MISMATCH: "OWNER_APPROVAL_DIGEST_MISMATCH", TRUSTED_PIN_MISSING_OR_INVALID: "TRUSTED_PIN_MISSING_OR_INVALID", TRUSTED_PIN_MISMATCH: "TRUSTED_PIN_MISMATCH",
  CLOCK_REQUIRED_OR_INVALID: "CLOCK_REQUIRED_OR_INVALID", TIME_WINDOW_INVALID_OR_EXPIRED: "TIME_WINDOW_INVALID_OR_EXPIRED", RATE_CAP_EXCEEDED: "RATE_CAP_EXCEEDED",
  C5_EVIDENCE_INVALID: "C5_EVIDENCE_INVALID", C5_QUALITY_DEFICIT: "C5_QUALITY_DEFICIT", C5_RECENCY_INVALID: "C5_RECENCY_INVALID", C5_UNATTESTED_ACTUAL_CLAIM: "C5_UNATTESTED_ACTUAL_CLAIM",
  SOLE_WRITER_COORDINATOR_INVALID: "SOLE_WRITER_COORDINATOR_INVALID", SECOND_WRITER_FORBIDDEN: "SECOND_WRITER_FORBIDDEN", IDEMPOTENCY_KEY_MISSING: "IDEMPOTENCY_KEY_MISSING", IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  CLAIM_STORE_INVALID: "CLAIM_STORE_INVALID", CLAIM_STORE_CAPACITY: "CLAIM_STORE_CAPACITY", CLAIM_PENDING: "CLAIM_PENDING", REPLAY_RECEIPT_INVALID: "REPLAY_RECEIPT_INVALID",
  READBACK_CONTRACT_INVALID: "READBACK_CONTRACT_INVALID", INITIAL_READ_INVALID: "INITIAL_READ_INVALID", INITIAL_STATE_NOT_ABSENT: "INITIAL_STATE_NOT_ABSENT", CAS_FENCING_MISMATCH: "CAS_FENCING_MISMATCH", READBACK_MISMATCH_OR_CORRUPT: "READBACK_MISMATCH_OR_CORRUPT",
  COMPENSATION_PLAN_INVALID: "COMPENSATION_PLAN_INVALID", DESTRUCTIVE_COMPENSATION_FORBIDDEN: "DESTRUCTIVE_COMPENSATION_FORBIDDEN", COMPENSATION_REHEARSAL_FAILED: "COMPENSATION_REHEARSAL_FAILED", COMPENSATED_STATE_MISMATCH: "COMPENSATED_STATE_MISMATCH",
  PROMOTION_FLAG_FORBIDDEN: "PROMOTION_FLAG_FORBIDDEN", CROSS_PROJECT_MUTATION_FORBIDDEN: "CROSS_PROJECT_MUTATION_FORBIDDEN",
  ADAPTER_MISSING_OR_DISABLED: "ADAPTER_MISSING_OR_DISABLED", UNTRUSTED_OR_LIVE_ADAPTER: "UNTRUSTED_OR_LIVE_ADAPTER", ADAPTER_CAPABILITY_ESCAPE: "ADAPTER_CAPABILITY_ESCAPE", CREATE_FAILED_OR_COLLISION: "CREATE_FAILED_OR_COLLISION", EFFECT_COUNTERS_NON_ZERO: "EFFECT_COUNTERS_NON_ZERO",
});
const C = CANARY_HOLD_CODES;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_WINDOW_MS = 4 * 60 * 60 * 1000;
const MAX_C5_RECENCY_MS = 4 * 60 * 60 * 1000;
const MAX_CLAIMS = 1024;
const SECRET_VALUE = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const SECRET_KEY = /(?:^|[:._-])(?:token|secret|credential|password|passwd|cookie|bearer)(?:[:._=-]|$)/iu;
const EFFECT_FIELDS = Object.freeze(["linear_mutations", "erp_mutations", "gmail_sends", "slack_posts", "git_commits", "task_mutations", "external_calls"]);
const ADAPTER_METHODS = new Set(["createIfAbsent", "readExact", "applyCompensation", "getEffects"]);
const FORBIDDEN_METHODS = new Set(["write", "update", "delete", "remove", "archive", "share", "send", "completetask", "complete_task", "taskcomplete", "task_complete", "mutate", "exec", "spawn", "fetch", "request", "post", "put", "patch", "mail", "slack", "linear", "calendar", "drive"]);

const F = Object.freeze({
  packet: ["schema_version", "canary_id", "canary_tuple", "owner_approval", "c5_evidence", "sole_coordinator_writer", "readback_contract", "compensating_rollback_plan", "target_payload", "promotion_flags"],
  tuple: ["project_ref", "task_type", "action", "authority", "policy_revision"],
  approval: ["approval_ref", "approval_digest", "bound_tuple_digest", "time_window", "rate_cap", "synthetic_adapter_ref", "stop_conditions"],
  time: ["valid_from", "valid_to", "observed_at"],
  c5: ["accepted_generation_ref", "shadow_quality_receipt_ref", "shadow_quality_digest", "observed_at", "adjudicated_window", "no_action_stability_rate", "required_source_coverage_rate", "unauthorized_effects_count", "cross_project_effects_count", "policy_revision", "is_synthetic_fixture"],
  window: ["start_at", "end_at", "sample_count"],
  writer: ["coordinator_ref", "writer_identity_ref", "epoch", "fencing_token_ref", "fencing_token_digest", "expected_revision", "idempotency_key", "project_ref", "action", "erp_second_writer_enabled", "provider_second_writer_enabled"],
  readback: ["target_object_ref", "expected_revision", "expected_digest", "readback_mode"],
  compensation: ["rollback_plan_ref", "owner_selected_action_ref", "compensation_mode", "is_destructive_delete", "is_archive", "expected_compensated_state_digest"],
  payload: ["item_id", "item_type", "summary", "evidence_refs"],
  promotion: ["official_completion", "worksession_promotion", "p5_promotion", "live_acceptance"],
  approvalPin: ["approval_ref", "approval_digest", "observed_at"],
  c5Pin: ["shadow_quality_receipt_ref", "shadow_quality_digest", "observed_at"],
  adapterDescriptor: ["adapter_ref", "adapter_kind", "is_synthetic", "is_live", "allows_real_mutation"],
  claimDescriptor: ["claim_store_kind", "is_synthetic", "is_live"],
  initialRead: ["exists", "object_ref", "digest", "revision", "last_writer_epoch", "last_writer_fencing_token_digest"],
  objectRead: ["exists", "object_ref", "digest", "revision", "last_writer_epoch", "last_writer_fencing_token_digest", "state", "project_ref", "task_type", "action", "authority", "policy_revision"],
  create: ["ok", "object_ref", "revision", "digest", "basis"],
  basis: ["expected_revision", "current_revision", "expected_last_writer_epoch", "current_last_writer_epoch", "expected_last_writer_fencing_token_digest", "current_last_writer_fencing_token_digest", "writer_epoch", "fencing_token_ref", "fencing_token_digest"],
  compensationResult: ["ok", "object_ref", "revision", "digest", "terminal_state", "compensation_mode", "idempotent"],
  receipt: ["receipt_id", "receipt_digest", "schema_version", "status", "evaluated_at", "packet_digest", "canary_tuple_digest", "bindings", "claim", "verification", "effect_attestation", "claim_ceiling", "actual_canary_readiness"],
  binding: ["owner_approval_ref", "owner_approval_digest", "c5_evidence_ref", "c5_evidence_digest", "writer_identity_ref", "writer_epoch", "fencing_token_ref", "fencing_token_digest", "adapter_ref", "adapter_kind", "canary_id", "stop_conditions", "stop_conditions_digest"],
  claim: ["idempotency_key", "tuple_digest", "rate_key", "claim_consumed"],
});

function proto(value) { try { return { ok: true, value: Object.getPrototypeOf(value) }; } catch { return { ok: false }; } }
function ownNames(value) { try { return { ok: true, value: Object.getOwnPropertyNames(value) }; } catch { return { ok: false }; } }
function data(value, key) { try { const d = Object.getOwnPropertyDescriptor(value, key); return d && Object.prototype.hasOwnProperty.call(d, "value") ? { ok: true, present: true, value: d.value } : { ok: true, present: false }; } catch { return { ok: false, present: false }; } }
function plain(value) { if (value === null || typeof value !== "object" || Array.isArray(value)) return false; const p = proto(value); return p.ok && (p.value === null || p.value === Object.prototype); }
function exact(value, fields) { if (!plain(value)) return false; try { const keys = Object.keys(value); return keys.length === fields.length && fields.every((field) => Object.prototype.hasOwnProperty.call(value, field)); } catch { return false; } }
function freeze(value, seen = new WeakSet()) { if (value === null || typeof value !== "object" || seen.has(value)) return value; seen.add(value); Object.keys(value).forEach((key) => freeze(value[key], seen)); return Object.freeze(value); }
function snapshot(value, seen = new WeakMap(), parents = new WeakSet(), depth = 0, count = { n: 0 }) {
  if (depth > 10 || ++count.n > 512) return { ok: false, reason: C.INVALID_PACKET_SHAPE };
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return { ok: true, value };
  if (typeof value === "string") return value.length > 4096 ? { ok: false, reason: C.INVALID_PACKET_SHAPE } : SECRET_VALUE.test(value) ? { ok: false, reason: C.CREDENTIAL_OR_SECRET_EXPOSED } : { ok: true, value };
  if (typeof value !== "object" || parents.has(value)) return { ok: false, reason: C.INVALID_PACKET_SHAPE };
  if (seen.has(value)) return { ok: true, value: seen.get(value) };
  const p = proto(value); let keys;
  try { keys = Object.keys(value); if (Object.getOwnPropertySymbols(value).length) return { ok: false, reason: C.INVALID_PACKET_SHAPE }; } catch { return { ok: false, reason: C.INVALID_PACKET_SHAPE }; }
  if (!p.ok || (!Array.isArray(value) && p.value !== null && p.value !== Object.prototype) || keys.length > 64 || (Array.isArray(value) && (keys.length !== value.length || keys.some((key, index) => key !== String(index))))) return { ok: false, reason: C.INVALID_PACKET_SHAPE };
  const copy = Array.isArray(value) ? [] : {}; seen.set(value, copy); parents.add(value);
  for (const key of keys) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") return { ok: false, reason: C.INVALID_PACKET_SHAPE };
    if (SECRET_KEY.test(key) && !["fencing_token_ref", "fencing_token_digest", "last_writer_fencing_token_digest", "expected_last_writer_fencing_token_digest", "current_last_writer_fencing_token_digest"].includes(key)) return { ok: false, reason: C.CREDENTIAL_OR_SECRET_EXPOSED };
    const d = data(value, key); if (!d.ok || !d.present) return { ok: false, reason: C.INVALID_PACKET_SHAPE };
    const child = snapshot(d.value, seen, parents, depth + 1, count); if (!child.ok) return child; copy[key] = child.value;
  }
  parents.delete(value); return { ok: true, value: copy };
}
function h(domain, content) { return `sha256:${createHash("sha256").update(canonicalEvidenceJson({ domain, content })).digest("hex")}`; }
function omit(value, field) { const copy = { ...value }; delete copy[field]; return copy; }
function validId(value) { return typeof value === "string" && SAFE_ID.test(value); }
function validHash(value) { return typeof value === "string" && SHA256.test(value); }
function epoch(value) { if (typeof value !== "string" || !UTC.test(value)) return null; const parsed = Date.parse(value); return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null; }
function hold(codes, claimConsumed = false, receipt = null) { return freeze({ status: "HOLD", hold_codes: [...codes].sort(), receipt, claim_consumed: claimConsumed === true, claim_ceiling: "rejected_or_held", actual_canary_readiness: false }); }
function option(options, key) { return plain(options) ? data(options, key) : { ok: false, present: false }; }
function pin(value, fields) { const s = snapshot(value); return s.ok && exact(s.value, fields) ? s.value : null; }
function clock(options) { const candidate = option(options, "clock"); if (!candidate.ok || !candidate.present || typeof candidate.value !== "function") return null; try { const s = snapshot(candidate.value()); return s.ok && typeof s.value === "string" && epoch(s.value) !== null ? s.value : null; } catch { return null; } }
function terminalState(mode) { return mode === "void_created_synthetic_object" ? "voided" : "superseded"; }
function exactStopConditions(value) { return Array.isArray(value) && value.length === STOP_CONDITION_SET.size && new Set(value).size === value.length && value.every((condition) => STOP_CONDITION_SET.has(condition)); }
function sortedStopConditions() { return [...STOP_CONDITION_SET].sort(); }
function wildcardToken(value) { return typeof value === "string" && ["*", "all", "bulk"].includes(value.toLowerCase()); }

function adapterSurface(adapter) {
  if (adapter === null || typeof adapter !== "object" || Array.isArray(adapter)) return { ok: false, code: C.ADAPTER_MISSING_OR_DISABLED };
  const p = proto(adapter); if (!p.ok || (p.value !== null && p.value !== Object.prototype)) return { ok: false, code: C.ADAPTER_CAPABILITY_ESCAPE };
  const names = ownNames(adapter); if (!names.ok) return { ok: false, code: C.ADAPTER_CAPABILITY_ESCAPE };
  const values = new Map();
  for (const name of names.value) { const property = data(adapter, name); if (!property.ok || !property.present || FORBIDDEN_METHODS.has(name.toLowerCase()) || (typeof property.value === "function" && !ADAPTER_METHODS.has(name))) return { ok: false, code: C.ADAPTER_CAPABILITY_ESCAPE }; values.set(name, property.value); }
  if ([...ADAPTER_METHODS].some((method) => typeof values.get(method) !== "function")) return { ok: false, code: C.ADAPTER_CAPABILITY_ESCAPE };
  const descriptor = snapshot(values.get("descriptor"));
  if (!descriptor.ok || !exact(descriptor.value, F.adapterDescriptor) || !validId(descriptor.value.adapter_ref) || descriptor.value.adapter_kind !== "synthetic_in_memory" || descriptor.value.is_synthetic !== true || descriptor.value.is_live !== false || descriptor.value.allows_real_mutation !== false || values.get("is_synthetic") !== true || values.get("is_live") !== false) return { ok: false, code: C.UNTRUSTED_OR_LIVE_ADAPTER };
  return { ok: true, adapter, descriptor: descriptor.value, methods: Object.fromEntries([...ADAPTER_METHODS].map((method) => [method, values.get(method)])) };
}
async function callAdapter(surface, method, params) { try { const s = snapshot(await surface.methods[method].call(surface.adapter, params)); return s.ok && plain(s.value) ? { ok: true, value: s.value } : { ok: false }; } catch { return { ok: false }; } }

function claimSurface(store) {
  if (store === null || typeof store !== "object" || Array.isArray(store)) return null;
  const p = proto(store); if (!p.ok || (p.value !== null && p.value !== Object.prototype)) return null;
  const d = data(store, "descriptor"); const descriptor = d.ok && d.present ? snapshot(d.value) : { ok: false };
  if (!descriptor.ok || !exact(descriptor.value, F.claimDescriptor) || descriptor.value.claim_store_kind !== "synthetic_in_memory_atomic" || descriptor.value.is_synthetic !== true || descriptor.value.is_live !== false) return null;
  const methods = {};
  for (const name of ["claim", "finalize"]) { const method = data(store, name); if (!method.ok || !method.present || typeof method.value !== "function") return null; methods[name] = method.value; }
  return { store, methods };
}
async function callStore(surface, method, params) { try { const s = snapshot(await surface.methods[method].call(surface.store, params)); return s.ok && plain(s.value) ? { ok: true, value: s.value } : { ok: false }; } catch { return { ok: false }; } }

export function createInMemoryCanaryClaimStore({ maxEntries = MAX_CLAIMS } = {}) {
  const capacity = Number.isSafeInteger(maxEntries) && maxEntries > 0 && maxEntries <= MAX_CLAIMS ? maxEntries : MAX_CLAIMS;
  const byIdempotency = new Map(); const byRateKey = new Map(); let serial = 1;
  return Object.freeze({
    descriptor: Object.freeze({ claim_store_kind: "synthetic_in_memory_atomic", is_synthetic: true, is_live: false }),
    async claim(params) {
      const s = snapshot(params); if (!s.ok || !exact(s.value, ["idempotency_key", "packet_digest", "tuple_digest", "rate_key"])) return { status: "INVALID" };
      const { idempotency_key: key, packet_digest: packetDigest, tuple_digest: tupleDigest, rate_key: rateKey } = s.value;
      if (!validId(key) || !validHash(packetDigest) || !validHash(tupleDigest) || !validHash(rateKey)) return { status: "INVALID" };
      const old = byIdempotency.get(key); if (old) return old.packet_digest === packetDigest ? old.terminal === null ? { status: "PENDING", claim_id: old.claim_id, claim_consumed: true } : { status: "REPLAY", claim_id: old.claim_id, terminal: old.terminal } : { status: "IDEMPOTENCY_CONFLICT", claim_consumed: true };
      if (byRateKey.has(rateKey)) return { status: "RATE_CAP_EXCEEDED", claim_consumed: false };
      if (byIdempotency.size >= capacity) return { status: "CAPACITY", claim_consumed: false };
      const record = { claim_id: `claim_${serial++}`, packet_digest: packetDigest, terminal: null };
      byIdempotency.set(key, record); byRateKey.set(rateKey, record.claim_id); return { status: "CLAIMED", claim_id: record.claim_id, claim_consumed: true };
    },
    async finalize(params) {
      const s = snapshot(params); if (!s.ok || !exact(s.value, ["idempotency_key", "packet_digest", "claim_id", "terminal"])) return { status: "INVALID" };
      const record = byIdempotency.get(s.value.idempotency_key); const terminal = snapshot(s.value.terminal);
      if (!record || record.packet_digest !== s.value.packet_digest || record.claim_id !== s.value.claim_id || record.terminal !== null || !terminal.ok || !plain(terminal.value)) return { status: "INVALID" };
      record.terminal = freeze(terminal.value); return { status: "FINALIZED", claim_consumed: true };
    },
  });
}
const moduleClaimStore = createInMemoryCanaryClaimStore();

function validInitial(read, target, writer) {
  if (!exact(read, F.initialRead) || read.exists !== false || read.object_ref !== target || !validHash(read.digest) || !Number.isSafeInteger(read.revision) || read.revision < 0 || !Number.isSafeInteger(read.last_writer_epoch) || read.last_writer_epoch < 0 || !validHash(read.last_writer_fencing_token_digest)) return C.INITIAL_READ_INVALID;
  if (read.digest !== h(D.state, omit(read, "digest"))) return C.INITIAL_READ_INVALID;
  if (read.revision !== writer.expected_revision || writer.epoch <= read.last_writer_epoch) return C.CAS_FENCING_MISMATCH;
  return null;
}
function validCreated(result, initial, packet) {
  const { readback_contract: rc, sole_coordinator_writer: writer } = packet;
  if (!exact(result, F.create) || result.ok !== true || result.object_ref !== rc.target_object_ref || !Number.isSafeInteger(result.revision) || !validHash(result.digest) || !exact(result.basis, F.basis)) return C.CREATE_FAILED_OR_COLLISION;
  const basis = result.basis;
  if (result.revision !== rc.expected_revision || result.revision !== initial.revision + 1 || result.digest !== rc.expected_digest) return C.READBACK_MISMATCH_OR_CORRUPT;
  return basis.expected_revision === initial.revision && basis.current_revision === initial.revision && basis.expected_last_writer_epoch === initial.last_writer_epoch && basis.current_last_writer_epoch === initial.last_writer_epoch && basis.expected_last_writer_fencing_token_digest === initial.last_writer_fencing_token_digest && basis.current_last_writer_fencing_token_digest === initial.last_writer_fencing_token_digest && basis.writer_epoch === writer.epoch && basis.fencing_token_ref === writer.fencing_token_ref && basis.fencing_token_digest === writer.fencing_token_digest ? null : C.CAS_FENCING_MISMATCH;
}
function validRead(read, packet, digest, revision, state) { const tuple = packet.canary_tuple; const ref = packet.readback_contract.target_object_ref; return exact(read, F.objectRead) && read.exists === true && read.object_ref === ref && read.digest === digest && read.revision === revision && read.state === state && read.project_ref === tuple.project_ref && read.task_type === tuple.task_type && read.action === tuple.action && read.authority === tuple.authority && read.policy_revision === tuple.policy_revision && Number.isSafeInteger(read.last_writer_epoch) && read.last_writer_epoch >= 0 && validHash(read.last_writer_fencing_token_digest); }
function validCompensation(result, packet, idempotent) { const { compensating_rollback_plan: plan, readback_contract: rc } = packet; return exact(result, F.compensationResult) && result.ok === true && result.object_ref === rc.target_object_ref && result.revision === rc.expected_revision + 1 && result.digest === plan.expected_compensated_state_digest && result.terminal_state === terminalState(plan.compensation_mode) && result.compensation_mode === plan.compensation_mode && result.idempotent === idempotent; }

function rateKey(approval, tupleDigest) { return h(D.rate, { tuple_digest: tupleDigest, approval_ref: approval.approval_ref, approval_digest: approval.approval_digest, valid_from: approval.time_window.valid_from, valid_to: approval.time_window.valid_to }); }
function receipt(packet, now, packetDigest, tupleDigest, status, verification) {
  const { owner_approval: approval, c5_evidence: c5, sole_coordinator_writer: writer } = packet;
  const stopConditions = sortedStopConditions();
  const body = { schema_version: CANARY_RECEIPT_SCHEMA, status, evaluated_at: now, packet_digest: packetDigest, canary_tuple_digest: tupleDigest,
    bindings: { owner_approval_ref: approval.approval_ref, owner_approval_digest: approval.approval_digest, c5_evidence_ref: c5.shadow_quality_receipt_ref, c5_evidence_digest: c5.shadow_quality_digest, writer_identity_ref: writer.writer_identity_ref, writer_epoch: writer.epoch, fencing_token_ref: writer.fencing_token_ref, fencing_token_digest: writer.fencing_token_digest, adapter_ref: approval.synthetic_adapter_ref, adapter_kind: "synthetic_in_memory", canary_id: packet.canary_id, stop_conditions: stopConditions, stop_conditions_digest: h(D.stop, stopConditions) },
    claim: { idempotency_key: writer.idempotency_key, tuple_digest: tupleDigest, rate_key: rateKey(approval, tupleDigest), claim_consumed: true }, verification, effect_attestation: "synthetic_adapter_attested", claim_ceiling: "synthetic_trusted_pin_consistency", actual_canary_readiness: false };
  const receiptDigest = h(D.receipt, body); return freeze({ receipt_id: `rec_canary_${createHash("sha256").update(receiptDigest).digest("hex").slice(0, 16)}`, receipt_digest: receiptDigest, ...body });
}
function failed(packet, now, packetDigest, tupleDigest, code) { return hold(new Set([code]), true, receipt(packet, now, packetDigest, tupleDigest, "SYNTHETIC_CANARY_HOLD", { terminal_failure_codes: [code] })); }
function succeeded(packet, now, packetDigest, tupleDigest, created, compensated, effects) {
  return freeze({ status: "SYNTHETIC_CANARY_VERIFIED", hold_codes: [], claim_consumed: true, claim_ceiling: "synthetic_trusted_pin_consistency", actual_canary_readiness: false,
    receipt: receipt(packet, now, packetDigest, tupleDigest, "SYNTHETIC_CANARY_VERIFIED", { created_object_ref: created.object_ref, created_revision: created.revision, created_digest: created.digest, readback_mode: "exact_digest_readback", compensation_transition_verified: true, compensated_terminal_state: compensated.terminal_state, compensated_state_digest: compensated.digest, compensation_idempotent: true, synthetic_effect_counters: Object.fromEntries(EFFECT_FIELDS.map((field) => [field, effects[field]])) }) });
}
function replay(raw, packet, packetDigest, tupleDigest) {
  const s = snapshot(raw); if (!s.ok || !plain(s.value)) return hold(new Set([C.REPLAY_RECEIPT_INVALID]), true);
  const result = s.value; const success = result.status === "SYNTHETIC_CANARY_VERIFIED"; const failure = result.status === "HOLD";
  if ((!success && !failure) || !Array.isArray(result.hold_codes) || result.claim_consumed !== true || result.actual_canary_readiness !== false || !plain(result.receipt)) return hold(new Set([C.REPLAY_RECEIPT_INVALID]), true);
  const r = result.receipt; const { owner_approval: approval, c5_evidence: c5, sole_coordinator_writer: writer } = packet;
  if (!exact(r, F.receipt) || !validId(r.receipt_id) || !validHash(r.receipt_digest) || r.schema_version !== CANARY_RECEIPT_SCHEMA || r.evaluated_at === undefined || epoch(r.evaluated_at) === null || r.packet_digest !== packetDigest || r.canary_tuple_digest !== tupleDigest || !exact(r.bindings, F.binding) || !exact(r.claim, F.claim) || r.effect_attestation !== "synthetic_adapter_attested" || r.claim_ceiling !== "synthetic_trusted_pin_consistency" || r.actual_canary_readiness !== false || (success && r.status !== "SYNTHETIC_CANARY_VERIFIED") || (failure && r.status !== "SYNTHETIC_CANARY_HOLD")) return hold(new Set([C.REPLAY_RECEIPT_INVALID]), true);
  const b = r.bindings;
  const stopConditions = sortedStopConditions();
  if (b.owner_approval_ref !== approval.approval_ref || b.owner_approval_digest !== approval.approval_digest || b.c5_evidence_ref !== c5.shadow_quality_receipt_ref || b.c5_evidence_digest !== c5.shadow_quality_digest || b.writer_identity_ref !== writer.writer_identity_ref || b.writer_epoch !== writer.epoch || b.fencing_token_ref !== writer.fencing_token_ref || b.fencing_token_digest !== writer.fencing_token_digest || b.adapter_ref !== approval.synthetic_adapter_ref || b.adapter_kind !== "synthetic_in_memory" || b.canary_id !== packet.canary_id || !Array.isArray(b.stop_conditions) || b.stop_conditions.length !== stopConditions.length || b.stop_conditions.some((condition, index) => condition !== stopConditions[index]) || b.stop_conditions_digest !== h(D.stop, stopConditions) || r.claim.idempotency_key !== writer.idempotency_key || r.claim.tuple_digest !== tupleDigest || r.claim.rate_key !== rateKey(approval, tupleDigest) || r.claim.claim_consumed !== true) return hold(new Set([C.REPLAY_RECEIPT_INVALID]), true);
  const receiptDigest = h(D.receipt, omit(omit(r, "receipt_id"), "receipt_digest")); const receiptId = `rec_canary_${createHash("sha256").update(receiptDigest).digest("hex").slice(0, 16)}`;
  if (r.receipt_digest !== receiptDigest || r.receipt_id !== receiptId || (success && result.hold_codes.length !== 0) || (failure && (!exact(r.verification, ["terminal_failure_codes"]) || !Array.isArray(r.verification.terminal_failure_codes) || r.verification.terminal_failure_codes.length !== 1 || result.hold_codes.length !== 1 || result.hold_codes[0] !== r.verification.terminal_failure_codes[0]))) return hold(new Set([C.REPLAY_RECEIPT_INVALID]), true);
  return freeze({ status: success ? "SYNTHETIC_CANARY_VERIFIED" : "HOLD", hold_codes: success ? [] : [...r.verification.terminal_failure_codes], receipt: freeze(r), claim_consumed: true, claim_ceiling: success ? "synthetic_trusted_pin_consistency" : "rejected_or_held", actual_canary_readiness: false });
}
async function persist(surface, claim, packetDigest, result) { const done = await callStore(surface, "finalize", { idempotency_key: result.receipt.claim.idempotency_key, packet_digest: packetDigest, claim_id: claim.claim_id, terminal: result }); return done.ok && exact(done.value, ["status", "claim_consumed"]) && done.value.status === "FINALIZED" && done.value.claim_consumed === true; }

async function evaluateCreateOnlyCanaryInternal(input, options = {}) {
  const s = snapshot(input); if (!s.ok || !plain(s.value)) return hold(new Set([s.reason ?? C.INVALID_PACKET_SHAPE]));
  const packet = s.value; const codes = new Set(); if (!exact(packet, F.packet)) codes.add(C.INVALID_PACKET_SHAPE); if (packet.schema_version !== CANARY_PACKET_SCHEMA) codes.add(C.INVALID_SCHEMA_VERSION); if (!validId(packet.canary_id)) codes.add(C.INVALID_PACKET_SHAPE);
  const tuple = packet.canary_tuple; let tupleDigest = null;
  if (!exact(tuple, F.tuple)) codes.add(C.INVALID_CANARY_TUPLE); else { tupleDigest = h(D.tuple, tuple); if (!validId(tuple.project_ref) || wildcardToken(tuple.project_ref) || !validId(tuple.task_type) || wildcardToken(tuple.task_type)) codes.add(C.FORBIDDEN_WILDCARD_OR_BULK); if (!CREATE_ACTION_SET.has(tuple.action) || !AUTHORITY_ACTIONS.has(tuple.authority) || !AUTHORITY_ACTIONS.get(tuple.authority).includes(tuple.action)) codes.add(C.FORBIDDEN_ACTION_OR_AUTHORITY); if (tuple.policy_revision !== CANARY_POLICY_REVISION) codes.add(C.POLICY_REVISION_MISMATCH); }
  const approval = packet.owner_approval; let approvalObserved = null;
  if (!exact(approval, F.approval)) codes.add(C.OWNER_APPROVAL_INVALID); else { if (!validId(approval.approval_ref) || !validHash(approval.approval_digest) || !validHash(approval.bound_tuple_digest) || !validId(approval.synthetic_adapter_ref) || approval.rate_cap !== 1 || !exactStopConditions(approval.stop_conditions)) codes.add(C.OWNER_APPROVAL_INVALID); if (approval.approval_digest !== h(D.approval, omit(approval, "approval_digest")) || (tupleDigest !== null && approval.bound_tuple_digest !== tupleDigest)) codes.add(C.OWNER_APPROVAL_DIGEST_MISMATCH); if (!exact(approval.time_window, F.time)) codes.add(C.TIME_WINDOW_INVALID_OR_EXPIRED); else { const from = epoch(approval.time_window.valid_from); const to = epoch(approval.time_window.valid_to); approvalObserved = epoch(approval.time_window.observed_at); if (from === null || to === null || approvalObserved === null || to <= from || to - from > MAX_WINDOW_MS || approvalObserved < from || approvalObserved > to) codes.add(C.TIME_WINDOW_INVALID_OR_EXPIRED); } }
  const c5 = packet.c5_evidence; let c5Observed = null;
  if (!exact(c5, F.c5)) codes.add(C.C5_EVIDENCE_INVALID); else { if (!validId(c5.accepted_generation_ref) || !validId(c5.shadow_quality_receipt_ref) || !validHash(c5.shadow_quality_digest) || c5.policy_revision !== CANARY_POLICY_REVISION || c5.shadow_quality_digest !== h(D.c5, omit(c5, "shadow_quality_digest"))) codes.add(C.C5_EVIDENCE_INVALID); if (c5.is_synthetic_fixture !== true) codes.add(C.C5_UNATTESTED_ACTUAL_CLAIM); if (c5.no_action_stability_rate !== 1 || c5.required_source_coverage_rate !== 1 || c5.unauthorized_effects_count !== 0 || c5.cross_project_effects_count !== 0) codes.add(C.C5_QUALITY_DEFICIT); c5Observed = epoch(c5.observed_at); if (!exact(c5.adjudicated_window, F.window)) codes.add(C.C5_EVIDENCE_INVALID); else { const start = epoch(c5.adjudicated_window.start_at); const end = epoch(c5.adjudicated_window.end_at); if (start === null || end === null || end <= start || !Number.isSafeInteger(c5.adjudicated_window.sample_count) || c5.adjudicated_window.sample_count < MIN_C5_SAMPLE_COUNT) codes.add(C.C5_QUALITY_DEFICIT); if (c5Observed === null || c5Observed !== end || approvalObserved === null || end >= approvalObserved || approvalObserved - end > MAX_C5_RECENCY_MS) codes.add(C.C5_RECENCY_INVALID); } }
  const writer = packet.sole_coordinator_writer;
  if (!exact(writer, F.writer)) codes.add(C.SOLE_WRITER_COORDINATOR_INVALID); else { if (!validId(writer.coordinator_ref) || !validId(writer.writer_identity_ref) || !Number.isSafeInteger(writer.epoch) || writer.epoch < 1 || !validId(writer.fencing_token_ref) || !validHash(writer.fencing_token_digest) || !Number.isSafeInteger(writer.expected_revision) || writer.expected_revision < 0) codes.add(C.SOLE_WRITER_COORDINATOR_INVALID); if (!validId(writer.idempotency_key)) codes.add(C.IDEMPOTENCY_KEY_MISSING); if (tuple && writer.project_ref !== tuple.project_ref) codes.add(C.CROSS_PROJECT_MUTATION_FORBIDDEN); if (tuple && writer.action !== tuple.action) codes.add(C.FORBIDDEN_ACTION_OR_AUTHORITY); if (writer.erp_second_writer_enabled !== false || writer.provider_second_writer_enabled !== false) codes.add(C.SECOND_WRITER_FORBIDDEN); }
  const payload = packet.target_payload;
  if (!exact(payload, F.payload) || !validId(payload.item_id) || !validId(payload.item_type) || typeof payload.summary !== "string" || payload.summary.trim().length === 0 || payload.summary.length > 2000 || !Array.isArray(payload.evidence_refs) || payload.evidence_refs.length === 0 || new Set(payload.evidence_refs).size !== payload.evidence_refs.length || payload.evidence_refs.some((ref) => !validId(ref))) codes.add(C.INVALID_PACKET_SHAPE);
  const rc = packet.readback_contract;
  if (!exact(rc, F.readback) || !validId(rc.target_object_ref) || !Number.isSafeInteger(rc.expected_revision) || rc.expected_revision < 1 || !validHash(rc.expected_digest) || !READBACK_MODE_SET.has(rc.readback_mode) || (payload && rc.target_object_ref !== payload.item_id) || (writer && rc.expected_revision !== writer.expected_revision + 1)) codes.add(C.READBACK_CONTRACT_INVALID);
  const plan = packet.compensating_rollback_plan;
  if (!exact(plan, F.compensation) || !validId(plan.rollback_plan_ref) || !validId(plan.owner_selected_action_ref) || !validHash(plan.expected_compensated_state_digest)) codes.add(C.COMPENSATION_PLAN_INVALID); else if (plan.is_destructive_delete !== false || plan.is_archive !== false || plan.compensation_mode === "delete" || plan.compensation_mode === "archive") codes.add(C.DESTRUCTIVE_COMPENSATION_FORBIDDEN); else if (!COMPENSATION_MODE_SET.has(plan.compensation_mode)) codes.add(C.COMPENSATION_PLAN_INVALID);
  const promotion = packet.promotion_flags; if (!exact(promotion, F.promotion)) codes.add(C.INVALID_PACKET_SHAPE); else if (promotion.official_completion !== false || promotion.worksession_promotion !== false || promotion.p5_promotion !== false || promotion.live_acceptance !== false) codes.add(C.PROMOTION_FLAG_FORBIDDEN);
  const now = clock(options); if (now === null) codes.add(C.CLOCK_REQUIRED_OR_INVALID); else { const time = epoch(now); const from = approval?.time_window ? epoch(approval.time_window.valid_from) : null; const to = approval?.time_window ? epoch(approval.time_window.valid_to) : null; if (time === null || from === null || to === null || approvalObserved === null || time < from || time > to || time < approvalObserved || time - approvalObserved > MAX_C5_RECENCY_MS) codes.add(C.TIME_WINDOW_INVALID_OR_EXPIRED); if (time === null || c5Observed === null || time < c5Observed || time - c5Observed > MAX_C5_RECENCY_MS) codes.add(C.C5_RECENCY_INVALID); }
  const approvalPinOpt = option(options, "trustedExpectedApprovalPin"); const c5PinOpt = option(options, "trustedExpectedC5Pin"); const approvalPin = approvalPinOpt.ok && approvalPinOpt.present ? pin(approvalPinOpt.value, F.approvalPin) : null; const c5Pin = c5PinOpt.ok && c5PinOpt.present ? pin(c5PinOpt.value, F.c5Pin) : null;
  const comparableApproval = exact(approval, F.approval) && exact(approval.time_window, F.time);
  const comparableC5 = exact(c5, F.c5);
  if (!approvalPin || !c5Pin) codes.add(C.TRUSTED_PIN_MISSING_OR_INVALID); else if (comparableApproval && comparableC5 && (approvalPin.approval_ref !== approval.approval_ref || approvalPin.approval_digest !== approval.approval_digest || approvalPin.observed_at !== approval.time_window.observed_at || c5Pin.shadow_quality_receipt_ref !== c5.shadow_quality_receipt_ref || c5Pin.shadow_quality_digest !== c5.shadow_quality_digest || c5Pin.observed_at !== c5.observed_at)) codes.add(C.TRUSTED_PIN_MISMATCH);
  if (codes.size) return hold(codes);
  const rawAdapter = option(options, "adapter"); const adapter = rawAdapter.ok && rawAdapter.present ? adapterSurface(rawAdapter.value) : { ok: false, code: C.ADAPTER_MISSING_OR_DISABLED }; if (!adapter.ok) return hold(new Set([adapter.code])); if (adapter.descriptor.adapter_ref !== approval.synthetic_adapter_ref) return hold(new Set([C.UNTRUSTED_OR_LIVE_ADAPTER]));
  const rawStore = option(options, "claimStore"); const store = rawStore.ok && rawStore.present ? claimSurface(rawStore.value) : claimSurface(moduleClaimStore); if (!store) return hold(new Set([C.CLAIM_STORE_INVALID]));
  const packetDigest = h(D.packet, packet); const claimRateKey = rateKey(approval, tupleDigest); const claimed = await callStore(store, "claim", { idempotency_key: writer.idempotency_key, packet_digest: packetDigest, tuple_digest: tupleDigest, rate_key: claimRateKey }); if (!claimed.ok || typeof claimed.value.status !== "string") return hold(new Set([C.CLAIM_STORE_INVALID]));
  if (claimed.value.status === "IDEMPOTENCY_CONFLICT") return hold(new Set([C.IDEMPOTENCY_CONFLICT]), claimed.value.claim_consumed === true); if (claimed.value.status === "RATE_CAP_EXCEEDED") return hold(new Set([C.RATE_CAP_EXCEEDED])); if (claimed.value.status === "CAPACITY") return hold(new Set([C.CLAIM_STORE_CAPACITY])); if (!validId(claimed.value.claim_id)) return hold(new Set([C.CLAIM_STORE_INVALID]));
  if (claimed.value.status === "PENDING") return validId(claimed.value.claim_id) ? hold(new Set([C.CLAIM_PENDING]), true) : hold(new Set([C.CLAIM_STORE_INVALID]), true);
  if (claimed.value.status === "REPLAY") { if (!Object.prototype.hasOwnProperty.call(claimed.value, "terminal")) return hold(new Set([C.CLAIM_STORE_INVALID]), true); return replay(claimed.value.terminal, packet, packetDigest, tupleDigest); }
  if (claimed.value.status !== "CLAIMED" || claimed.value.claim_consumed !== true) return hold(new Set([C.CLAIM_STORE_INVALID]));
  const finish = async (result) => await persist(store, claimed.value, packetDigest, result) ? result : hold(new Set([C.CLAIM_STORE_INVALID]), true);
  const initial = await callAdapter(adapter, "readExact", { object_ref: rc.target_object_ref }); if (!initial.ok) return finish(failed(packet, now, packetDigest, tupleDigest, C.INITIAL_READ_INVALID)); const initialIssue = validInitial(initial.value, rc.target_object_ref, writer); if (initialIssue !== null) return finish(failed(packet, now, packetDigest, tupleDigest, initial.value.exists === true ? C.INITIAL_STATE_NOT_ABSENT : initialIssue));
  const created = await callAdapter(adapter, "createIfAbsent", { project_ref: tuple.project_ref, task_type: tuple.task_type, action: tuple.action, authority: tuple.authority, policy_revision: tuple.policy_revision, item_id: payload.item_id, object_ref: rc.target_object_ref, payload, expected_revision: initial.value.revision, expected_last_writer_epoch: initial.value.last_writer_epoch, expected_last_writer_fencing_token_digest: initial.value.last_writer_fencing_token_digest, writer_epoch: writer.epoch, fencing_token_ref: writer.fencing_token_ref, fencing_token_digest: writer.fencing_token_digest }); if (!created.ok) return finish(failed(packet, now, packetDigest, tupleDigest, C.CREATE_FAILED_OR_COLLISION)); const createIssue = validCreated(created.value, initial.value, packet); if (createIssue !== null) return finish(failed(packet, now, packetDigest, tupleDigest, createIssue));
  const readback = await callAdapter(adapter, "readExact", { object_ref: rc.target_object_ref }); if (!readback.ok || !validRead(readback.value, packet, rc.expected_digest, rc.expected_revision, "created")) return finish(failed(packet, now, packetDigest, tupleDigest, C.READBACK_MISMATCH_OR_CORRUPT));
  const compensationParams = { rollback_plan_ref: plan.rollback_plan_ref, owner_selected_action_ref: plan.owner_selected_action_ref, object_ref: rc.target_object_ref, compensation_mode: plan.compensation_mode, expected_created_digest: rc.expected_digest, expected_compensated_state_digest: plan.expected_compensated_state_digest };
  const first = await callAdapter(adapter, "applyCompensation", compensationParams); if (!first.ok || !validCompensation(first.value, packet, false)) return finish(failed(packet, now, packetDigest, tupleDigest, C.COMPENSATION_REHEARSAL_FAILED));
  const compensated = await callAdapter(adapter, "readExact", { object_ref: rc.target_object_ref }); if (!compensated.ok || !validRead(compensated.value, packet, plan.expected_compensated_state_digest, rc.expected_revision + 1, terminalState(plan.compensation_mode))) return finish(failed(packet, now, packetDigest, tupleDigest, C.COMPENSATED_STATE_MISMATCH));
  const repeated = await callAdapter(adapter, "applyCompensation", compensationParams); if (!repeated.ok || !validCompensation(repeated.value, packet, true) || repeated.value.digest !== first.value.digest) return finish(failed(packet, now, packetDigest, tupleDigest, C.COMPENSATION_REHEARSAL_FAILED));
  const effects = await callAdapter(adapter, "getEffects", {}); if (!effects.ok || EFFECT_FIELDS.some((field) => effects.value[field] !== 0)) return finish(failed(packet, now, packetDigest, tupleDigest, C.EFFECT_COUNTERS_NON_ZERO));
  return finish(succeeded(packet, now, packetDigest, tupleDigest, created.value, first.value, effects.value));
}

export async function evaluateCreateOnlyCanary(input, options = {}) {
  try {
    return await evaluateCreateOnlyCanaryInternal(input, options);
  } catch {
    return hold(new Set([C.INVALID_PACKET_SHAPE]));
  }
}

function absent(objectRef) { const state = { exists: false, object_ref: objectRef, revision: 0, last_writer_epoch: 0, last_writer_fencing_token_digest: `sha256:${"0".repeat(64)}` }; return { ...state, digest: h(D.state, state) }; }
function readFrom(state) { return state.exists === false ? { exists: false, object_ref: state.object_ref, digest: state.digest, revision: state.revision, last_writer_epoch: state.last_writer_epoch, last_writer_fencing_token_digest: state.last_writer_fencing_token_digest } : { exists: true, object_ref: state.object_ref, digest: state.digest, revision: state.revision, last_writer_epoch: state.last_writer_epoch, last_writer_fencing_token_digest: state.last_writer_fencing_token_digest, state: state.state, project_ref: state.project_ref, task_type: state.task_type, action: state.action, authority: state.authority, policy_revision: state.policy_revision }; }
export function createSyntheticMutationAdapter(initialState = {}) {
  const states = new Map(); const effects = Object.fromEntries(EFFECT_FIELDS.map((field) => [field, 0])); let creates = 0; let reads = 0; let compensations = 0;
  for (const [key, value] of Object.entries(initialState)) { const s = snapshot(value); if (s.ok && plain(s.value)) states.set(key, s.value); }
  return {
    descriptor: Object.freeze({ adapter_ref: "adp_synth_in_memory_01", adapter_kind: "synthetic_in_memory", is_synthetic: true, is_live: false, allows_real_mutation: false }), is_synthetic: true, is_live: false,
    async createIfAbsent(params) {
      const s = snapshot(params); const fields = ["project_ref", "task_type", "action", "authority", "policy_revision", "item_id", "object_ref", "payload", "expected_revision", "expected_last_writer_epoch", "expected_last_writer_fencing_token_digest", "writer_epoch", "fencing_token_ref", "fencing_token_digest"]; if (!s.ok || !exact(s.value, fields)) return { ok: false, reason: "INVALID_CAS_BASIS" }; const request = s.value; const current = states.get(request.object_ref) ?? absent(request.object_ref);
      if (current.exists !== false || current.revision !== request.expected_revision || current.last_writer_epoch !== request.expected_last_writer_epoch || current.last_writer_fencing_token_digest !== request.expected_last_writer_fencing_token_digest || request.writer_epoch <= current.last_writer_epoch || !validId(request.fencing_token_ref) || !validHash(request.fencing_token_digest)) return { ok: false, reason: "CAS_OR_COLLISION" };
      const next = { exists: true, object_ref: request.object_ref, revision: current.revision + 1, last_writer_epoch: request.writer_epoch, last_writer_fencing_token_digest: request.fencing_token_digest, state: "created", project_ref: request.project_ref, task_type: request.task_type, action: request.action, authority: request.authority, policy_revision: request.policy_revision, payload: request.payload }; next.digest = h(D.state, next); states.set(next.object_ref, next); creates++;
      return { ok: true, object_ref: next.object_ref, revision: next.revision, digest: next.digest, basis: { expected_revision: request.expected_revision, current_revision: current.revision, expected_last_writer_epoch: request.expected_last_writer_epoch, current_last_writer_epoch: current.last_writer_epoch, expected_last_writer_fencing_token_digest: request.expected_last_writer_fencing_token_digest, current_last_writer_fencing_token_digest: current.last_writer_fencing_token_digest, writer_epoch: request.writer_epoch, fencing_token_ref: request.fencing_token_ref, fencing_token_digest: request.fencing_token_digest } };
    },
    async readExact(params) { const s = snapshot(params); if (!s.ok || !exact(s.value, ["object_ref"]) || !validId(s.value.object_ref)) return { invalid: true }; reads++; return readFrom(states.get(s.value.object_ref) ?? absent(s.value.object_ref)); },
    async applyCompensation(params) {
      const s = snapshot(params); const fields = ["rollback_plan_ref", "owner_selected_action_ref", "object_ref", "compensation_mode", "expected_created_digest", "expected_compensated_state_digest"]; if (!s.ok || !exact(s.value, fields)) return { ok: false, reason: "INVALID_COMPENSATION" }; const request = s.value; const current = states.get(request.object_ref); const state = terminalState(request.compensation_mode); if (!current || !COMPENSATION_MODE_SET.has(request.compensation_mode)) return { ok: false, reason: "MISSING_OR_INVALID" }; compensations++;
      if (current.state === state && current.compensation_mode === request.compensation_mode && current.digest === request.expected_compensated_state_digest) return { ok: true, object_ref: current.object_ref, revision: current.revision, digest: current.digest, terminal_state: state, compensation_mode: request.compensation_mode, idempotent: true };
      if (current.state !== "created" || current.digest !== request.expected_created_digest) return { ok: false, reason: "STATE_MISMATCH" };
      const next = { exists: true, object_ref: current.object_ref, revision: current.revision + 1, last_writer_epoch: current.last_writer_epoch, last_writer_fencing_token_digest: current.last_writer_fencing_token_digest, state, project_ref: current.project_ref, task_type: current.task_type, action: current.action, authority: current.authority, policy_revision: current.policy_revision, compensation_mode: request.compensation_mode, prior_created_digest: current.digest }; next.digest = h(D.state, next); if (next.digest !== request.expected_compensated_state_digest) return { ok: false, reason: "EXPECTED_DIGEST_MISMATCH" }; states.set(next.object_ref, next); return { ok: true, object_ref: next.object_ref, revision: next.revision, digest: next.digest, terminal_state: state, compensation_mode: request.compensation_mode, idempotent: false };
    },
    async getEffects() { return { ...effects, synthetic_creates: creates, synthetic_readbacks: reads, synthetic_compensations: compensations }; },
  };
}

export default evaluateCreateOnlyCanary;

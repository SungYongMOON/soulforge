#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeC00BPacketDigest,
  computeC00BSourceContractDigest,
  judgeC00BPacket,
} from "./task_engine_inventory_c00b_judge.mjs";

const INPUT_SCHEMA = "soulforge.task_engine_inventory_c00b_binding_input.v1";
const DESCRIPTOR_SCHEMA = "soulforge.task_engine_inventory_descriptor.v1";
const AGGREGATE_SCHEMA = "soulforge.task_engine_inventory_safe_aggregate_evidence.v1";
const PACKET_SCHEMA = "soulforge.task_engine_inventory_c00b_judge_packet.v1";
const RECEIPT_SCHEMA = "soulforge.task_engine_inventory_c00b_binding_receipt.v1";
const ERROR_SCHEMA = "soulforge.task_engine_inventory_c00b_binding_error.v1";
const LANES = ["mail", "voice", "structured_pc_work", "file", "run_log"];
const PROOFS = ["C00-LIVE-01", "C00-LIVE-02", "C00-LIVE-03", "C00-LIVE-04"];
const SAFE_REF = /^[a-z][a-z0-9_-]{1,63}(?::[a-z0-9][a-z0-9_-]{0,63})*$/;
const AGGREGATE_EVIDENCE_CARRIER = /^aggregate:[a-f0-9]{64}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const ENUM_VALUE = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,62}$/;
const EXPLICIT_OFFSET = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const SET_ARRAY_KEYS = new Set([
  "baseline_refs", "proof_scope", "evidence_refs", "authority_refs", "expected_sources",
  "required_live_proofs", "unresolved_live_proofs", "raw_sentinel_violations",
]);
const FROZEN_C00Q = Object.freeze({
  tool_blob: "379945f0e2e1d6f3566f2c4479caf2887b011998",
  tool_digest: "sha256:36e2d6e07226d3b6f24d0de33e68a06eb36d1273fdaaaebe81c378d508e5f1e5",
  test_blob: "ca20b035c14651764dc92627ce4bcd72e6a06361",
  test_digest: "sha256:36f31964f54ad667e0257631d04eca9f03af4c5f28d1a465b158390f0017d6d6",
  schema_blob: "21595a7ba61a3570221d63a45c4b90f27e4aa01c",
  schema_digest: "sha256:72bf55f30f136f1d30a83b280254eb3b0908c2a85d7e906dd10a6033e92f1f4c",
});
const PRIVATE_ARTIFACT_NAMES = Object.freeze([
  "task_engine_inventory_c00q_descriptor_v1.json",
  "task_engine_inventory_safe_aggregate_evidence_v1.json",
  "task_engine_inventory_c00b_judge_packet_v1.json",
]);

class ProducerError extends Error {
  constructor(exitCode, reasonCode) {
    super(reasonCode);
    this.exitCode = exitCode;
    this.reasonCode = reasonCode;
  }
}

const invalid = (code = "binding_input_invalid") => { throw new ProducerError(2, code); };
const blocked = (code = "binding_grant_incomplete") => { throw new ProducerError(3, code); };
const guard = (code = "binding_integrity_guard_failed") => { throw new ProducerError(4, code); };
const sentinel = (code = "raw_path_secret_sentinel") => { throw new ProducerError(5, code); };
const operational = (code = "binding_io_failed") => { throw new ProducerError(6, code); };

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, required, optional = []) {
  if (!isObject(value)) invalid();
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key))) invalid();
  if (Object.keys(value).some((key) => !allowed.has(key))) invalid();
}

function compareCodeUnits(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => canonicalize(entry));
    if (SET_ARRAY_KEYS.has(key) || normalized.every((entry) => isObject(entry))) {
      return normalized.sort((a, b) => compareCodeUnits(JSON.stringify(a), JSON.stringify(b)));
    }
    return normalized;
  }
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((childKey) => [childKey, canonicalize(value[childKey], childKey)]));
}

function digestValue(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}`;
}

export function computePrivateOutputRootDigest(path) {
  const root = resolve(path);
  if (!existsSync(root) || !statSync(root).isDirectory()) operational("output_root_missing");
  return digestValue({ private_output_root: realpathSync(root) });
}

export function computePrivateArtifactAllowlistDigest() {
  return digestValue(PRIVATE_ARTIFACT_NAMES);
}

function requireSafeRef(value) {
  if (typeof value !== "string" || !SAFE_REF.test(value) || /(?:^|[_:-])unknown(?:$|[_:-])/.test(value)) invalid("ref_invalid");
}

function requireSafeRefs(values, { min = 0 } = {}) {
  if (!Array.isArray(values) || values.length < min || new Set(values).size !== values.length) invalid("ref_set_invalid");
  for (const value of values) requireSafeRef(value);
}

function aggregateEvidenceCarriers(values) {
  return values.filter((value) => AGGREGATE_EVIDENCE_CARRIER.test(value));
}

function evidenceRefsWithoutAggregateCarrier(values) {
  return values.filter((value) => !AGGREGATE_EVIDENCE_CARRIER.test(value));
}

function requireDigest(value) {
  if (typeof value !== "string" || !SHA256.test(value)) invalid("digest_invalid");
}

function parseTime(value) {
  if (typeof value !== "string") invalid("timestamp_invalid");
  const match = EXPLICIT_OFFSET.exec(value);
  if (!match) invalid("timestamp_invalid");
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw, , zone, , offsetHourRaw, offsetMinuteRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]
      || hour > 23 || minute > 59 || second > 59
      || (zone !== "Z" && (Number(offsetHourRaw) > 23 || Number(offsetMinuteRaw) > 59))) invalid("timestamp_invalid");
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) invalid("timestamp_invalid");
  return epoch;
}

function sameSet(left, right) {
  return left.length === right.length
    && [...left].sort(compareCodeUnits).every((value, index) => value === [...right].sort(compareCodeUnits)[index]);
}

function requireProofSet(values) {
  if (!Array.isArray(values) || new Set(values).size !== values.length || !sameSet(values, PROOFS)) {
    blocked("authority_proof_gap");
  }
}

function tokenShapedSecret(value) {
  return /(?:\bsk-[A-Za-z0-9_-]{12,}|\bghp_[a-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b)/i.test(value);
}

function unsafeString(value) {
  return /(?:https?:\/\/|file:\/\/|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|-----BEGIN|\bBearer\s+)/i.test(value)
    || tokenShapedSecret(value);
}

function enforcePrivateInputSentinels(value, key = "", underLocator = false) {
  if (Array.isArray(value)) {
    for (const entry of value) enforcePrivateInputSentinels(entry, key, underLocator);
    return;
  }
  if (!isObject(value)) {
    if (typeof value === "string"
        && (tokenShapedSecret(value) || (!underLocator && unsafeString(value)))) sentinel();
    return;
  }
  for (const [childKey, child] of Object.entries(value)) {
    if (/(?:^|_)(?:body|title|transcript|password|credential|cookie|token|secret|raw_content)(?:_|$)/i.test(childKey)) sentinel();
    if (childKey === "raw_payload_copied" && child !== false) sentinel();
    enforcePrivateInputSentinels(child, childKey, underLocator || childKey === "locator" || childKey === "sqlite_path");
  }
}

function enforceNonReflectionSentinels(value) {
  if (Array.isArray(value)) {
    for (const entry of value) enforceNonReflectionSentinels(entry);
    return;
  }
  if (!isObject(value)) {
    if (typeof value === "string"
        && (/(?:[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.?[\\/])/i.test(value) || unsafeString(value))) sentinel();
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/(?:^|_)(?:body|title|transcript|password|credential|cookie|token|secret|url|hostname|account|email|raw_value|raw_content|raw_path|file_path|file_name|filename)(?:_|$)/i.test(key)) sentinel();
    if (key === "raw_payload_copied" && child !== false) sentinel();
    enforceNonReflectionSentinels(child);
  }
}

function validateApproval(value, expectedKind, evaluationEpoch, evidenceDigest = null) {
  exactKeys(value, [
    "approval_ref", "authority_kind", "bound_packet_digest", "issued_at", "expires_at", "revoked", "revocation_ref",
  ], ["bound_evidence_digest"]);
  requireSafeRef(value.approval_ref);
  requireSafeRef(value.revocation_ref);
  requireDigest(value.bound_packet_digest);
  if (value.authority_kind !== expectedKind || value.revoked !== false) blocked("approval_inactive_or_wrong_kind");
  const issued = parseTime(value.issued_at);
  const expires = parseTime(value.expires_at);
  if (issued > evaluationEpoch || expires <= evaluationEpoch || issued >= expires) blocked("approval_inactive_or_wrong_kind");
  if (evidenceDigest !== null) {
    requireDigest(value.bound_evidence_digest);
    if (value.bound_evidence_digest !== evidenceDigest) blocked("approval_evidence_binding_invalid");
  } else if (Object.hasOwn(value, "bound_evidence_digest")) {
    invalid("unexpected_evidence_binding");
  }
}

function validateInventory(value) {
  exactKeys(value, [
    "profile", "physical_owner_ref", "default_root_ref", "writer_candidates",
    "direct_caller_candidates", "consumer_candidates", "source_availability_summary",
  ]);
  if (!new Set(["synthetic", "authorized_observation"]).has(value.profile)) invalid();
  requireSafeRef(value.physical_owner_ref);
  requireSafeRef(value.default_root_ref);
  for (const key of ["writer_candidates", "direct_caller_candidates", "consumer_candidates"]) requireSafeRefs(value[key], { min: 1 });
  if (!new Set(["available", "attested_absent", "attested_gap", "unknown"]).has(value.source_availability_summary)) invalid();
}

function validateDescriptorAuthority(value, evaluationEpoch) {
  exactKeys(value, ["source_authority_ref", "issued_at", "expires_at", "proof_scope", "evidence_refs"]);
  requireSafeRef(value.source_authority_ref);
  requireProofSet(value.proof_scope);
  requireSafeRefs(value.evidence_refs, { min: 1 });
  if (aggregateEvidenceCarriers(value.evidence_refs).length !== 0) blocked("aggregate_evidence_carrier_misplaced");
  if (parseTime(value.issued_at) > evaluationEpoch || parseTime(value.expires_at) <= evaluationEpoch) {
    blocked("descriptor_authority_inactive");
  }
}

function validateQuery(value) {
  exactKeys(value, ["table_count_allowlist", "enum_count_allowlist"]);
  if (!Array.isArray(value.table_count_allowlist) || value.table_count_allowlist.length === 0
      || new Set(value.table_count_allowlist).size !== value.table_count_allowlist.length) invalid("query_allowlist_invalid");
  for (const table of value.table_count_allowlist) if (typeof table !== "string" || !IDENTIFIER.test(table)) invalid("query_allowlist_invalid");
  if (!Array.isArray(value.enum_count_allowlist)) invalid("query_allowlist_invalid");
  const enumKeys = new Set();
  for (const row of value.enum_count_allowlist) {
    exactKeys(row, ["table", "column", "values"]);
    if (!IDENTIFIER.test(row.table) || !IDENTIFIER.test(row.column) || !value.table_count_allowlist.includes(row.table)
        || !Array.isArray(row.values) || row.values.length === 0 || new Set(row.values).size !== row.values.length
        || row.values.some((entry) => typeof entry !== "string" || !ENUM_VALUE.test(entry))) invalid("query_allowlist_invalid");
    const key = `${row.table}\0${row.column}`;
    if (enumKeys.has(key)) invalid("query_allowlist_invalid");
    enumKeys.add(key);
  }
}

function validateSourceEvidenceAuthority(value, evaluationEpoch) {
  exactKeys(value, [
    "authority_ref", "authority_kind", "bound_packet_digest", "bound_source_contract_digest",
    "issued_at", "expires_at", "revoked", "revocation_ref", "proof_scope", "evidence_refs",
  ]);
  requireSafeRef(value.authority_ref);
  requireSafeRef(value.revocation_ref);
  requireDigest(value.bound_packet_digest);
  requireDigest(value.bound_source_contract_digest);
  requireProofSet(value.proof_scope);
  requireSafeRefs(value.evidence_refs, { min: 1 });
  if (aggregateEvidenceCarriers(value.evidence_refs).length > 1) blocked("aggregate_evidence_carrier_duplicate");
  if (value.authority_kind !== "c00b_source_evidence" || value.revoked !== false
      || parseTime(value.issued_at) > evaluationEpoch
      || parseTime(value.expires_at) <= evaluationEpoch) blocked("source_authority_inactive");
}

function validateQuiescence(value, adapterId, evaluationEpoch) {
  exactKeys(value, [
    "method", "authority_ref", "authority_kind", "bound_packet_digest", "bound_source_contract_digest",
    "issued_at", "expires_at", "revoked", "revocation_ref",
  ]);
  requireSafeRef(value.authority_ref);
  requireSafeRef(value.revocation_ref);
  requireDigest(value.bound_packet_digest);
  requireDigest(value.bound_source_contract_digest);
  const expectedMethod = adapterId === "sqlite_catalog_v1"
    ? "sidecar_free_exclusive_window_attested"
    : "no_source_opened_attested";
  if (value.method !== expectedMethod || value.authority_kind !== "c00b_source_quiescence"
      || value.revoked !== false || parseTime(value.issued_at) > evaluationEpoch
      || parseTime(value.expires_at) <= evaluationEpoch) blocked("quiescence_inactive_or_wrong_method");
}

function validateSource(value, evaluationEpoch) {
  exactKeys(value, [
    "lane", "source_ref", "requirement", "applicability_ref", "adapter_id", "adapter_version",
    "authority", "inventory", "max_runtime_ms", "max_result_rows", "source_evidence_authority", "quiescence",
  ], ["locator", "query"]);
  if (!LANES.includes(value.lane) || !new Set(["required", "optional", "not_applicable"]).has(value.requirement)) invalid();
  requireSafeRef(value.source_ref);
  if (value.requirement === "not_applicable") requireSafeRef(value.applicability_ref);
  else if (value.applicability_ref !== null) invalid("applicability_ref_invalid");
  if (!new Set(["attested_metadata_v1", "sqlite_catalog_v1"]).has(value.adapter_id) || value.adapter_version !== "v1") invalid("adapter_invalid");
  validateDescriptorAuthority(value.authority, evaluationEpoch);
  validateInventory(value.inventory);
  if (!Number.isSafeInteger(value.max_runtime_ms) || value.max_runtime_ms < 1 || value.max_runtime_ms > 60000
      || !Number.isSafeInteger(value.max_result_rows) || value.max_result_rows < 1 || value.max_result_rows > 10000) invalid();
  if (value.adapter_id === "sqlite_catalog_v1") {
    exactKeys(value.locator, ["sqlite_path"]);
    if (typeof value.locator.sqlite_path !== "string" || value.locator.sqlite_path.length === 0 || /[*?\[\]]/.test(value.locator.sqlite_path)) invalid("literal_locator_invalid");
    validateQuery(value.query);
  } else if (Object.hasOwn(value, "locator") || Object.hasOwn(value, "query")) {
    invalid("attested_adapter_locator_forbidden");
  }
  validateSourceEvidenceAuthority(value.source_evidence_authority, evaluationEpoch);
  if (value.authority.source_authority_ref !== value.source_evidence_authority.authority_ref) {
    blocked("descriptor_packet_authority_mismatch");
  }
  if (!sameSet(value.authority.evidence_refs, evidenceRefsWithoutAggregateCarrier(value.source_evidence_authority.evidence_refs))) {
    blocked("descriptor_packet_evidence_mismatch");
  }
  validateQuiescence(value.quiescence, value.adapter_id, evaluationEpoch);
}

function validateObservation(value, sourceByRef, evaluationEpoch) {
  exactKeys(value, [
    "source_ref", "evidence_kind", "observed_at", "business_freshness_basis", "authority_ref",
    "evidence_refs", "aggregate_counts", "last_success_at", "watermark_at", "gap_codes",
    "max_stale_sec", "raw_row_read_count", "raw_payload_copied",
  ]);
  const source = sourceByRef.get(value.source_ref);
  if (!source) blocked("aggregate_source_unknown");
  const observedEpoch = parseTime(value.observed_at);
  if (observedEpoch > evaluationEpoch) invalid("aggregate_chronology_invalid");
  requireSafeRef(value.authority_ref);
  requireSafeRefs(value.evidence_refs, { min: 1 });
  if (aggregateEvidenceCarriers(value.evidence_refs).length !== 0) blocked("aggregate_evidence_carrier_misplaced");
  if (!sameSet(value.evidence_refs, evidenceRefsWithoutAggregateCarrier(source.source_evidence_authority.evidence_refs))) {
    blocked("aggregate_evidence_ref_mismatch");
  }
  if (!Array.isArray(value.aggregate_counts) || !Array.isArray(value.gap_codes)
      || value.raw_row_read_count !== 0 || value.raw_payload_copied !== false) sentinel();
  if (!Number.isSafeInteger(value.max_stale_sec) || value.max_stale_sec < 1 || value.max_stale_sec > 2678400) invalid("aggregate_freshness_window_invalid");
  for (const row of value.aggregate_counts) {
    exactKeys(row, ["metric_ref", "count"]);
    requireSafeRef(row.metric_ref);
    if (!Number.isSafeInteger(row.count) || row.count < 0) invalid("aggregate_count_invalid");
  }
  requireSafeRefs(value.gap_codes);
  const lastSuccessEpoch = value.last_success_at === null ? null : parseTime(value.last_success_at);
  const watermarkEpoch = value.watermark_at === null ? null : parseTime(value.watermark_at);
  for (const epoch of [lastSuccessEpoch, watermarkEpoch]) {
    if (epoch !== null && (epoch > observedEpoch || epoch > evaluationEpoch)) invalid("aggregate_chronology_invalid");
  }
  if (value.evidence_kind === "source_owned_aggregate") {
    if (!new Set(["source_owned_event_time", "source_owned_commit_time"]).has(value.business_freshness_basis)
        || value.aggregate_counts.length === 0 || value.gap_codes.length !== 0
        || (lastSuccessEpoch === null && watermarkEpoch === null)) invalid("aggregate_evidence_invalid");
  } else if (value.evidence_kind === "authority_attested") {
    if (!new Set(["authority_attested_success_time", "authority_attested_watermark_time"]).has(value.business_freshness_basis)
        || (value.last_success_at === null && value.watermark_at === null) || value.gap_codes.length !== 0) invalid("aggregate_evidence_invalid");
  } else if (value.evidence_kind === "authority_attested_gap") {
    if (value.business_freshness_basis !== "not_established" || value.aggregate_counts.length !== 0
        || value.last_success_at !== null || value.watermark_at !== null || value.gap_codes.length === 0) invalid("aggregate_evidence_invalid");
  } else invalid("aggregate_evidence_invalid");
  if (value.authority_ref !== source.source_evidence_authority.authority_ref) blocked("aggregate_authority_mismatch");
  if (value.evidence_kind !== "authority_attested_gap") {
    const basisField = new Map([
      ["source_owned_event_time", watermarkEpoch],
      ["source_owned_commit_time", lastSuccessEpoch],
      ["authority_attested_success_time", lastSuccessEpoch],
      ["authority_attested_watermark_time", watermarkEpoch],
    ]);
    const freshnessEpoch = basisField.get(value.business_freshness_basis);
    if (freshnessEpoch === null || freshnessEpoch === undefined) invalid("business_freshness_basis_field_missing");
    if (evaluationEpoch - freshnessEpoch > value.max_stale_sec * 1000) blocked("business_freshness_stale");
  }
}

function expectedGrantRefs(input) {
  return [
    input.prerequisites.c00a_acceptance.approval_ref,
    input.executor.inventory_authority.approval_ref,
    ...Object.values(input.approvals).map((entry) => entry.approval_ref),
    ...input.sources.flatMap((source) => [
      source.source_evidence_authority.authority_ref,
      source.quiescence.authority_ref,
    ]),
  ];
}

export function validateBindingInput(input, { requireLiveReady = false } = {}) {
  enforcePrivateInputSentinels(input);
  exactKeys(input, [
    "schema_version", "evaluation_time", "baseline", "prerequisites", "executor", "approvals",
    "sources", "output", "binding_grant", "aggregate_observations", "raw_payload_copied",
  ]);
  if (input.schema_version !== INPUT_SCHEMA || input.raw_payload_copied !== false) invalid();
  const evaluationEpoch = parseTime(input.evaluation_time);
  exactKeys(input.baseline, ["baseline_refs", "head_commit", "origin_main_commit", "clean"]);
  requireSafeRefs(input.baseline.baseline_refs, { min: 1 });
  if (!COMMIT.test(input.baseline.head_commit) || !COMMIT.test(input.baseline.origin_main_commit)
      || input.baseline.clean !== true || input.baseline.head_commit !== input.baseline.origin_main_commit) guard("baseline_guard_failed");

  exactKeys(input.prerequisites, [
    "c00a_receipt_ref", "c00a_receipt_digest", "c00a_acceptance", "c00q_full_bv_receipt_ref",
    "c00q_full_bv_receipt_digest", "packet_id", "result", "exit_code", "required_live_proofs",
    "unresolved_live_proofs", "tracked_zero_mutation", "raw_sentinel_violations", "p1_unlocked",
  ]);
  requireSafeRef(input.prerequisites.c00a_receipt_ref);
  requireDigest(input.prerequisites.c00a_receipt_digest);
  requireSafeRef(input.prerequisites.c00q_full_bv_receipt_ref);
  requireDigest(input.prerequisites.c00q_full_bv_receipt_digest);
  if (input.prerequisites.packet_id !== "TEAX-C00A" || input.prerequisites.result !== "BLOCKED"
      || input.prerequisites.exit_code !== 3 || !sameSet(input.prerequisites.required_live_proofs, PROOFS)
      || !sameSet(input.prerequisites.unresolved_live_proofs, PROOFS)
      || input.prerequisites.tracked_zero_mutation !== true || input.prerequisites.p1_unlocked !== false
      || !Array.isArray(input.prerequisites.raw_sentinel_violations)
      || input.prerequisites.raw_sentinel_violations.length !== 0) blocked("prerequisite_state_invalid");
  validateApproval(input.prerequisites.c00a_acceptance, "c00a_acceptance", evaluationEpoch, input.prerequisites.c00a_receipt_digest);

  exactKeys(input.executor, ["node_identity_ref", "bootstrap_profile", "inventory_authority"]);
  requireSafeRef(input.executor.node_identity_ref);
  if (input.executor.bootstrap_profile !== "owner-with-state") blocked("executor_profile_invalid");
  validateApproval(input.executor.inventory_authority, "c00b_inventory", evaluationEpoch);
  exactKeys(input.approvals, ["c00q_acceptance", "c00b_execution", "c00b_judge"]);
  validateApproval(input.approvals.c00q_acceptance, "c00q_acceptance", evaluationEpoch, input.prerequisites.c00q_full_bv_receipt_digest);
  validateApproval(input.approvals.c00b_execution, "c00b_execution", evaluationEpoch);
  validateApproval(input.approvals.c00b_judge, "c00b_judge", evaluationEpoch);

  if (!Array.isArray(input.sources) || input.sources.length < LANES.length) blocked("source_set_incomplete");
  for (const source of input.sources) validateSource(source, evaluationEpoch);
  if (new Set(input.sources.map((source) => source.source_ref)).size !== input.sources.length) blocked("source_ref_duplicate");
  for (const lane of LANES) if (!input.sources.some((source) => source.lane === lane)) blocked("lane_missing");
  const sourceByRef = new Map(input.sources.map((source) => [source.source_ref, source]));

  exactKeys(input.output, ["mode", "durable_writes", "field_allowlist_ref", "retention_ref"]);
  requireSafeRef(input.output.field_allowlist_ref);
  requireSafeRef(input.output.retention_ref);
  if (input.output.mode !== "stdout_only" || input.output.durable_writes !== 0) guard("output_guard_failed");
  exactKeys(input.binding_grant, [
    "grant_ref", "binding_state", "digest_binding_approved", "descriptor_binding_state",
    "descriptor_materialization_approved",
    "approved_packet_digest", "descriptor_digest",
    "aggregate_evidence_digest", "authority_set_digest", "private_output_root_digest",
    "artifact_write_allowlist_digest", "authority_refs", "issued_at",
    "expires_at", "revoked", "revocation_ref",
  ]);
  requireSafeRef(input.binding_grant.grant_ref);
  requireSafeRef(input.binding_grant.revocation_ref);
  for (const key of [
    "approved_packet_digest", "descriptor_digest", "aggregate_evidence_digest", "authority_set_digest",
    "private_output_root_digest", "artifact_write_allowlist_digest",
  ]) {
    requireDigest(input.binding_grant[key]);
  }
  requireSafeRefs(input.binding_grant.authority_refs, { min: 1 });
  const expectedRefs = expectedGrantRefs(input);
  if (!new Set(["proposed", "approved"]).has(input.binding_grant.binding_state)
      || (input.binding_grant.binding_state === "proposed" && input.binding_grant.digest_binding_approved !== false)
      || (input.binding_grant.binding_state === "approved" && input.binding_grant.digest_binding_approved !== true)
      || !new Set(["proposed", "approved"]).has(input.binding_grant.descriptor_binding_state)
      || (input.binding_grant.descriptor_binding_state === "proposed" && input.binding_grant.descriptor_materialization_approved !== false)
      || (input.binding_grant.descriptor_binding_state === "approved" && input.binding_grant.descriptor_materialization_approved !== true)
      || input.binding_grant.revoked !== false
      || parseTime(input.binding_grant.issued_at) > evaluationEpoch || parseTime(input.binding_grant.expires_at) <= evaluationEpoch
      || new Set(expectedRefs).size !== expectedRefs.length
      || !sameSet(input.binding_grant.authority_refs, expectedRefs)) blocked("binding_grant_incomplete");

  if (!Array.isArray(input.aggregate_observations)) invalid();
  for (const observation of input.aggregate_observations) validateObservation(observation, sourceByRef, evaluationEpoch);
  if (new Set(input.aggregate_observations.map((row) => row.source_ref)).size !== input.aggregate_observations.length) blocked("aggregate_source_duplicate");
  if (requireLiveReady) {
    for (const source of input.sources.filter((row) => row.requirement !== "not_applicable")) {
      if (source.inventory.source_availability_summary !== "available") blocked("required_source_not_available");
      const evidence = input.aggregate_observations.find((row) => row.source_ref === source.source_ref);
      if (!evidence || evidence.evidence_kind === "authority_attested_gap") blocked("business_freshness_not_established");
    }
  }
  return input;
}

export function buildPrivateDescriptor(input) {
  validateBindingInput(input);
  const sources = input.sources.map((source) => {
    const row = {
      lane: source.lane,
      source_ref: source.source_ref,
      adapter_id: source.adapter_id,
      requirement: source.requirement,
      authority: structuredClone(source.authority),
      inventory: structuredClone(source.inventory),
    };
    if (source.requirement === "not_applicable") row.applicability_ref = source.applicability_ref;
    if (source.adapter_id === "sqlite_catalog_v1") {
      row.locator = structuredClone(source.locator);
      row.query = structuredClone(source.query);
    }
    return row;
  });
  return canonicalize({
    schema_version: DESCRIPTOR_SCHEMA,
    evaluation_time: input.evaluation_time,
    baseline_refs: input.baseline.baseline_refs,
    expected_sources: sources.map((source) => source.source_ref),
    sources,
  });
}

export function buildSafeAggregateEvidence(input) {
  validateBindingInput(input);
  const body = canonicalize({
    schema_version: AGGREGATE_SCHEMA,
    evaluation_time: input.evaluation_time,
    query_only: true,
    observations: structuredClone(input.aggregate_observations),
    raw_row_read_count: 0,
    raw_payload_copied: false,
  });
  return canonicalize({ ...body, evidence_digest: digestValue(body) });
}

function validateAggregateEvidenceCarrierBindings(input, aggregateEvidenceDigest, { required = false } = {}) {
  const expected = `aggregate:${aggregateEvidenceDigest.slice("sha256:".length)}`;
  for (const source of input.sources) {
    const carriers = aggregateEvidenceCarriers(source.source_evidence_authority.evidence_refs);
    if (carriers.length > 1) blocked("aggregate_evidence_carrier_duplicate");
    if (carriers.length === 1 && carriers[0] !== expected) blocked("aggregate_evidence_carrier_mismatch");
    if (required && carriers.length !== 1) blocked("aggregate_evidence_carrier_missing");
  }
  return expected;
}

function sourceContractRow(source, { expectedContractBinding = false } = {}) {
  const row = {
    lane: source.lane,
    source_ref: source.source_ref,
    requirement: source.requirement,
    applicability_ref: source.applicability_ref,
    observation_profile: "authorized_observation",
    adapter_id: source.adapter_id,
    adapter_version: source.adapter_version,
    literal_read_allowlist_digest: digestValue(source.adapter_id === "sqlite_catalog_v1" ? source.locator : { no_locator: true }),
    query_allowlist_digest: digestValue(source.adapter_id === "sqlite_catalog_v1" ? source.query : { no_query: true }),
    max_runtime_ms: source.max_runtime_ms,
    max_result_rows: source.max_result_rows,
    source_contract_digest: "sha256:" + "0".repeat(64),
    source_evidence_authority: structuredClone(source.source_evidence_authority),
    quiescence: structuredClone(source.quiescence),
  };
  row.source_contract_digest = computeC00BSourceContractDigest(row);
  if (expectedContractBinding) {
    row.source_evidence_authority.bound_source_contract_digest = row.source_contract_digest;
    row.quiescence.bound_source_contract_digest = row.source_contract_digest;
  }
  return canonicalize(row);
}

function validateManifest(input, manifest) {
  enforceNonReflectionSentinels(manifest);
  exactKeys(manifest, [
    "schema_version", "evaluation_time", "query_only", "result", "baseline_refs", "lanes",
    "source_authority_refs", "table_counts", "index_names", "trigger_names", "enum_counts",
    "raw_health_observations", "unresolved_live_proofs", "zero_mutation", "raw_sentinel_violations",
    "authority_effect", "manifest_digest",
  ]);
  if (manifest.schema_version !== "soulforge.task_engine_inventory_manifest.v1"
      || manifest.evaluation_time !== input.evaluation_time || manifest.query_only !== true
      || manifest.result !== "review_ready_manifest") blocked("manifest_not_review_ready");
  requireDigest(manifest.manifest_digest);
  const manifestBody = structuredClone(manifest);
  delete manifestBody.manifest_digest;
  if (digestValue(manifestBody) !== manifest.manifest_digest) guard("manifest_digest_mismatch");
  const sourceByRef = new Map(input.sources.map((source) => [source.source_ref, source]));
  const rowsByKind = [
    ["table", manifest.table_counts],
    ["index", manifest.index_names],
    ["trigger", manifest.trigger_names],
    ["enum", manifest.enum_counts],
  ];
  for (const [kind, rows] of rowsByKind) {
    if (!Array.isArray(rows)) invalid("manifest_aggregate_invalid");
    for (const row of rows) {
      const source = sourceByRef.get(row?.source_ref);
      if (!source || source.adapter_id !== "sqlite_catalog_v1") blocked("manifest_adapter_aggregate_mismatch");
      if (!source.query.table_count_allowlist.includes(row.table)) blocked("manifest_query_allowlist_mismatch");
      if (kind === "enum") {
        const allowed = source.query.enum_count_allowlist.find((entry) => entry.table === row.table && entry.column === row.column);
        if (!allowed || !allowed.values.includes(row.value)) blocked("manifest_query_allowlist_mismatch");
      }
    }
  }
  for (const source of input.sources) {
    const aggregateRows = rowsByKind.reduce(
      (count, [, rows]) => count + rows.filter((row) => row.source_ref === source.source_ref).length,
      0,
    );
    if (aggregateRows > source.max_result_rows) blocked("manifest_result_row_limit_exceeded");
  }
}

function packetFromInput(input, manifest, descriptor, sources, packetDigest) {
  return {
    schema_version: PACKET_SCHEMA,
    evaluation_time: input.evaluation_time,
    packet_digest: packetDigest,
    prerequisites: structuredClone(input.prerequisites),
    baseline: structuredClone(input.baseline),
    executor: structuredClone(input.executor),
    approvals: structuredClone(input.approvals),
    frozen_c00q: structuredClone(FROZEN_C00Q),
    expected_source_refs: input.sources.map((source) => ({
      lane: source.lane,
      source_ref: source.source_ref,
      requirement: source.requirement,
      applicability_ref: source.applicability_ref,
    })),
    producer_binding: {
      descriptor_digest: digestValue(descriptor),
      manifest_digest: manifest.manifest_digest,
    },
    source_authorities: sources,
    c00q_manifest: structuredClone(manifest),
    output: structuredClone(input.output),
    raw_payload_copied: false,
  };
}

export function buildBindingProposal(input, manifest) {
  validateBindingInput(input);
  validateManifest(input, manifest);
  const descriptor = buildPrivateDescriptor(input);
  const aggregate = buildSafeAggregateEvidence(input);
  validateAggregateEvidenceCarrierBindings(input, aggregate.evidence_digest);
  const sources = input.sources.map((source) => sourceContractRow(source, { expectedContractBinding: true }));
  const zero = "sha256:" + "0".repeat(64);
  const packet = packetFromInput(input, manifest, descriptor, sources, zero);
  const packetDigest = computeC00BPacketDigest(packet);
  const authorityRefs = expectedGrantRefs(input);
  return canonicalize({
    schema_version: "soulforge.task_engine_inventory_c00b_binding_proposal.v1",
    evaluation_time: input.evaluation_time,
    packet_digest: packetDigest,
    descriptor_digest: digestValue(descriptor),
    aggregate_evidence_digest: aggregate.evidence_digest,
    authority_set_digest: digestValue(authorityRefs),
    source_contracts: sources.map((source) => ({
      source_ref: source.source_ref,
      source_contract_digest: source.source_contract_digest,
    })),
    raw_payload_copied: false,
    writer_or_activation_authority_created: false,
  });
}

function requireFinalDigestBindings(input, proposal) {
  const grant = input.binding_grant;
  if (grant.binding_state !== "approved" || grant.digest_binding_approved !== true) blocked("binding_grant_not_approved");
  if (grant.approved_packet_digest !== proposal.packet_digest
      || grant.descriptor_digest !== proposal.descriptor_digest
      || grant.aggregate_evidence_digest !== proposal.aggregate_evidence_digest
      || grant.authority_set_digest !== proposal.authority_set_digest) blocked("binding_grant_digest_mismatch");
  const packetAuthorities = [
    input.prerequisites.c00a_acceptance,
    input.executor.inventory_authority,
    ...Object.values(input.approvals),
    ...input.sources.flatMap((source) => [source.source_evidence_authority, source.quiescence]),
  ];
  if (packetAuthorities.some((authority) => authority.bound_packet_digest !== proposal.packet_digest)) {
    blocked("authority_packet_binding_missing");
  }
  const contractBySource = new Map(proposal.source_contracts.map((row) => [row.source_ref, row.source_contract_digest]));
  for (const source of input.sources) {
    const expected = contractBySource.get(source.source_ref);
    if (!expected || source.source_evidence_authority.bound_source_contract_digest !== expected
        || source.quiescence.bound_source_contract_digest !== expected) blocked("authority_source_contract_binding_missing");
  }
}

export function buildC00BPacket(input, manifest) {
  validateBindingInput(input, { requireLiveReady: true });
  validateManifest(input, manifest);
  const proposal = buildBindingProposal(input, manifest);
  validateAggregateEvidenceCarrierBindings(input, proposal.aggregate_evidence_digest, { required: true });
  requireFinalDigestBindings(input, proposal);
  const descriptor = buildPrivateDescriptor(input);
  const sources = input.sources.map(sourceContractRow);
  const packet = packetFromInput(input, manifest, descriptor, sources, proposal.packet_digest);
  if (computeC00BPacketDigest(packet) !== proposal.packet_digest) guard("packet_binding_unstable");
  const canonicalPacket = canonicalize(packet);
  try {
    if (judgeC00BPacket(canonicalPacket, proposal.packet_digest).result !== "PASS") guard("packet_judge_preflight_failed");
  } catch {
    guard("packet_judge_preflight_failed");
  }
  return canonicalPacket;
}

function requireLiteralJsonPath(value) {
  if (typeof value !== "string" || value.startsWith("--") || /[*?\[\]]/.test(value) || !/\.json$/i.test(value)) invalid("cli_invalid");
  return value;
}

function parseCli(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const valueFlags = new Set(["--mode", "--binding", "--output-root", "--descriptor-output", "--aggregate-output", "--manifest", "--packet-output"]);
  const booleanFlags = new Set(["--query-only", "--json"]);
  const parsed = {};
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if ((!valueFlags.has(flag) && !booleanFlags.has(flag)) || seen.has(flag)) invalid("cli_invalid");
    seen.add(flag);
    if (valueFlags.has(flag)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) invalid("cli_invalid");
      parsed[flag.slice(2).replaceAll("-", "_")] = value;
    }
  }
  if (!seen.has("--query-only") || !seen.has("--json") || !seen.has("--mode") || !seen.has("--binding")) invalid("cli_invalid");
  if (!new Set(["descriptor", "proposal", "packet"]).has(parsed.mode)) invalid("cli_invalid");
  requireLiteralJsonPath(parsed.binding);
  let requireContainedOutput = null;
  if (parsed.mode !== "proposal") {
    if (!seen.has("--output-root")) invalid("cli_invalid");
    const outputRoot = resolve(parsed.output_root);
    if (!existsSync(outputRoot) || !statSync(outputRoot).isDirectory()) operational("output_root_missing");
    const realOutputRoot = realpathSync(outputRoot);
    parsed.private_output_root_digest = digestValue({ private_output_root: realOutputRoot });
    requireContainedOutput = (value, expectedName) => {
      requireLiteralJsonPath(value);
      const target = resolve(value);
      const parent = dirname(target);
      if (!existsSync(parent) || !statSync(parent).isDirectory()) operational("output_parent_missing");
      const realParent = realpathSync(parent);
      const rel = relative(realOutputRoot, realParent);
      if (rel.startsWith("..") || isAbsolute(rel) || basename(target) !== expectedName) guard("output_containment_guard_failed");
      return resolve(realParent, expectedName);
    };
  } else if (seen.has("--output-root")) invalid("cli_invalid");
  if (parsed.mode === "descriptor") {
    if (!seen.has("--descriptor-output") || !seen.has("--aggregate-output") || seen.has("--manifest") || seen.has("--packet-output")) invalid("cli_invalid");
    parsed.descriptor_output = requireContainedOutput(parsed.descriptor_output, "task_engine_inventory_c00q_descriptor_v1.json");
    parsed.aggregate_output = requireContainedOutput(parsed.aggregate_output, "task_engine_inventory_safe_aggregate_evidence_v1.json");
    if (resolve(parsed.descriptor_output) === resolve(parsed.aggregate_output)) invalid("cli_invalid");
  } else if (parsed.mode === "packet") {
    if (!seen.has("--manifest") || !seen.has("--packet-output") || seen.has("--descriptor-output") || seen.has("--aggregate-output")) invalid("cli_invalid");
    requireLiteralJsonPath(parsed.manifest);
    parsed.packet_output = requireContainedOutput(parsed.packet_output, "task_engine_inventory_c00b_judge_packet_v1.json");
  } else {
    if (!seen.has("--manifest") || seen.has("--descriptor-output") || seen.has("--aggregate-output") || seen.has("--packet-output")) invalid("cli_invalid");
    requireLiteralJsonPath(parsed.manifest);
  }
  return { help: false, ...parsed };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    operational();
  }
}

function writeJsonExclusive(path, value) {
  const target = resolve(path);
  const parent = dirname(target);
  if (!existsSync(parent)) operational("output_parent_missing");
  if (existsSync(target)) operational("output_already_exists");
  const bytes = `${JSON.stringify(canonicalize(value), null, 2)}\n`;
  try {
    writeFileSync(target, bytes, { encoding: "utf8", flag: "wx" });
    if (readFileSync(target, "utf8") !== bytes) guard("output_readback_mismatch");
  } catch (error) {
    if (error instanceof ProducerError) throw error;
    operational();
  }
}

function safeReceipt(fields) {
  return canonicalize({
    schema_version: RECEIPT_SCHEMA,
    result: "PASS",
    query_only: true,
    raw_payload_copied: false,
    ...fields,
  });
}

function safeError(error) {
  const exitCode = error instanceof ProducerError ? error.exitCode : 6;
  const reasonByExit = {
    2: "binding_or_cli_invalid",
    3: "authority_source_or_freshness_blocked",
    4: "digest_or_baseline_guard_failed",
    5: "raw_or_secret_sentinel",
    6: "private_packet_io_failed",
  };
  return canonicalize({
    schema_version: ERROR_SCHEMA,
    result: "BLOCKED",
    exit_code: exitCode,
    reason_code: reasonByExit[exitCode] ?? reasonByExit[6],
    query_only: true,
    files_written: exitCode === 6 ? null : 0,
    raw_payload_copied: false,
    writer_or_activation_authority_created: false,
  });
}

function usage() {
  return "Usage: node tools/task_engine_inventory_c00b_binding_producer.mjs --query-only --json --mode <descriptor|proposal|packet> --binding <private-json> [mode inputs and outputs]";
}

export function runBindingProducerCli(argv) {
  try {
    const parsed = parseCli(argv);
    if (parsed.help) return { exitCode: 0, output: usage() };
    const input = readJson(parsed.binding);
    if (parsed.mode !== "proposal"
        && (input?.binding_grant?.private_output_root_digest !== parsed.private_output_root_digest
          || input?.binding_grant?.artifact_write_allowlist_digest !== computePrivateArtifactAllowlistDigest())) {
      blocked("private_output_grant_mismatch");
    }
    if (parsed.mode === "descriptor") {
      const descriptor = buildPrivateDescriptor(input);
      const aggregate = buildSafeAggregateEvidence(input);
      if (input.binding_grant.descriptor_binding_state !== "approved"
          || input.binding_grant.descriptor_materialization_approved !== true
          || input.binding_grant.descriptor_digest !== digestValue(descriptor)
          || input.binding_grant.aggregate_evidence_digest !== aggregate.evidence_digest) {
        blocked("descriptor_materialization_not_approved");
      }
      if (existsSync(resolve(parsed.aggregate_output)) || existsSync(resolve(parsed.descriptor_output))) operational("output_already_exists");
      writeJsonExclusive(parsed.aggregate_output, aggregate);
      writeJsonExclusive(parsed.descriptor_output, descriptor);
      return {
        exitCode: 0,
        output: JSON.stringify(safeReceipt({
          mode: "descriptor",
          files_written: 2,
          descriptor_digest: digestValue(descriptor),
          aggregate_evidence_digest: aggregate.evidence_digest,
          source_count: input.sources.length,
        })),
      };
    }
    const manifest = readJson(parsed.manifest);
    if (parsed.mode === "proposal") {
      const proposal = buildBindingProposal(input, manifest);
      return {
        exitCode: 0,
        output: JSON.stringify(safeReceipt({
          mode: "proposal",
          files_written: 0,
          packet_digest: proposal.packet_digest,
          descriptor_digest: proposal.descriptor_digest,
          aggregate_evidence_digest: proposal.aggregate_evidence_digest,
          authority_set_digest: proposal.authority_set_digest,
          source_contracts: proposal.source_contracts,
          source_count: input.sources.length,
          writer_or_activation_authority_created: false,
        })),
      };
    }
    const packet = buildC00BPacket(input, manifest);
    writeJsonExclusive(parsed.packet_output, packet);
    return {
      exitCode: 0,
      output: JSON.stringify(safeReceipt({
        mode: "packet",
        files_written: 1,
        packet_digest: packet.packet_digest,
        source_count: input.sources.length,
      })),
    };
  } catch (error) {
    return {
      exitCode: error instanceof ProducerError ? error.exitCode : 6,
      output: JSON.stringify(safeError(error)),
    };
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const result = runBindingProducerCli(process.argv.slice(2));
  process.stdout.write(`${result.output}\n`);
  process.exitCode = result.exitCode;
}

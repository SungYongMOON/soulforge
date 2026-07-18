#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKET_SCHEMA = "soulforge.task_engine_inventory_c00b_judge_packet.v1";
const RECEIPT_SCHEMA = "soulforge.task_engine_inventory_c00b_receipt.v1";
const ERROR_SCHEMA = "soulforge.task_engine_inventory_c00b_judge_error.v1";
const C00Q_MANIFEST_SCHEMA = "soulforge.task_engine_inventory_manifest.v1";
const LANES = ["mail", "voice", "structured_pc_work", "file", "run_log"];
const PROOFS = ["C00-LIVE-01", "C00-LIVE-02", "C00-LIVE-03", "C00-LIVE-04"];
const REQUIREMENTS = new Set(["required", "optional", "not_applicable"]);
const SAFE_REF = /^[a-z][a-z0-9_-]{1,63}(?::[a-z0-9][a-z0-9_-]{0,63})*$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const ENUM_VALUE = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,62}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const HASH_64 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const EXPLICIT_OFFSET = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const SET_ARRAY_KEYS = new Set([
  "baseline_refs", "source_authority_refs", "source_refs", "proof_scope", "evidence_refs",
  "expected_source_refs", "required_live_proofs", "resolved_live_proofs", "unresolved_live_proofs",
  "source_contract_digests", "authority_refs", "revocation_refs", "raw_sentinel_violations",
]);
const FROZEN_C00Q = Object.freeze({
  tool_blob: "379945f0e2e1d6f3566f2c4479caf2887b011998",
  tool_digest: "sha256:36e2d6e07226d3b6f24d0de33e68a06eb36d1273fdaaaebe81c378d508e5f1e5",
  test_blob: "ca20b035c14651764dc92627ce4bcd72e6a06361",
  test_digest: "sha256:36f31964f54ad667e0257631d04eca9f03af4c5f28d1a465b158390f0017d6d6",
  schema_blob: "21595a7ba61a3570221d63a45c4b90f27e4aa01c",
  schema_digest: "sha256:72bf55f30f136f1d30a83b280254eb3b0908c2a85d7e906dd10a6033e92f1f4c",
});

class JudgeError extends Error {
  constructor(exitCode, reasonCode) {
    super(reasonCode);
    this.exitCode = exitCode;
    this.reasonCode = reasonCode;
  }
}

const invalid = (code = "packet_invalid") => { throw new JudgeError(2, code); };
const blocked = (code = "packet_blocked") => { throw new JudgeError(3, code); };
const guard = (code = "judge_guard_failed") => { throw new JudgeError(4, code); };
const sentinel = (code = "raw_path_secret_sentinel") => { throw new JudgeError(5, code); };

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, required) {
  if (!isObject(value)) invalid();
  const expected = new Set(required);
  if (required.some((key) => !Object.hasOwn(value, key))) invalid();
  if (Object.keys(value).some((key) => !expected.has(key))) invalid();
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

function compactCanonical(value) {
  return JSON.stringify(canonicalize(value));
}

function digestValue(value) {
  return `sha256:${createHash("sha256").update(compactCanonical(value)).digest("hex")}`;
}

function packetDigestDomain(value, root = false) {
  if (Array.isArray(value)) return value.map((entry) => packetDigestDomain(entry));
  if (!isObject(value)) return value;
  const entries = [];
  for (const [key, child] of Object.entries(value)) {
    if ((root && key === "packet_digest") || key === "bound_packet_digest") continue;
    entries.push([key, packetDigestDomain(child)]);
  }
  return Object.fromEntries(entries);
}

export function computeC00BPacketDigest(packet) {
  if (!isObject(packet)) invalid();
  return digestValue(packetDigestDomain(packet, true));
}

function sourceContractBody(row) {
  return {
    lane: row.lane,
    source_ref: row.source_ref,
    requirement: row.requirement,
    applicability_ref: row.applicability_ref,
    observation_profile: row.observation_profile,
    adapter_id: row.adapter_id,
    adapter_version: row.adapter_version,
    literal_read_allowlist_digest: row.literal_read_allowlist_digest,
    query_allowlist_digest: row.query_allowlist_digest,
    max_runtime_ms: row.max_runtime_ms,
    max_result_rows: row.max_result_rows,
  };
}

export function computeC00BSourceContractDigest(row) {
  return digestValue(sourceContractBody(row));
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
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] || hour > 23 || minute > 59 || second > 59) invalid("timestamp_invalid");
  if (zone !== "Z" && (Number(offsetHourRaw) > 23 || Number(offsetMinuteRaw) > 59)) invalid("timestamp_invalid");
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) invalid("timestamp_invalid");
  return epoch;
}

function requireSafeRef(value) {
  if (typeof value !== "string" || !SAFE_REF.test(value) || /(?:^|[_:-])unknown(?:$|[_:-])/.test(value)) invalid("ref_invalid");
}

function requireDigest(value) {
  if (typeof value !== "string" || !SHA256.test(value)) invalid("digest_invalid");
}

function requireUniqueStrings(values) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string") || new Set(values).size !== values.length) invalid();
}

function requireSafeRefs(values) {
  requireUniqueStrings(values);
  for (const value of values) requireSafeRef(value);
}

function sameSet(left, right) {
  return left.length === right.length && [...left].sort(compareCodeUnits).every((value, index) => value === [...right].sort(compareCodeUnits)[index]);
}

function unsafeString(value) {
  return /(?:[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.?[\\/]|https?:\/\/|file:\/\/|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|-----BEGIN|\bBearer\s+|\bsk-[A-Za-z0-9_-]{12,})/i.test(value);
}

function enforceSentinels(value) {
  if (Array.isArray(value)) {
    for (const entry of value) enforceSentinels(entry);
    return;
  }
  if (!isObject(value)) {
    if (typeof value === "string" && unsafeString(value)) sentinel();
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/(?:^|_)(?:body|title|transcript|password|credential|cookie|token|secret|url|hostname|account|email|raw_value|raw_content|raw_path|file_path|file_name|filename)(?:_|$)/i.test(key)) sentinel();
    if (key === "raw_payload_copied" && child !== false) sentinel();
    enforceSentinels(child);
  }
}

function validateAuthorityCore(authority, refKey, evaluationEpoch, expectedKind, approvedPacketDigest) {
  requireSafeRef(authority[refKey]);
  requireSafeRef(authority.revocation_ref);
  requireDigest(authority.bound_packet_digest);
  if (authority.authority_kind !== expectedKind || authority.bound_packet_digest !== approvedPacketDigest) blocked("authority_binding_invalid");
  const issued = parseTime(authority.issued_at);
  const expires = parseTime(authority.expires_at);
  if (typeof authority.revoked !== "boolean") invalid();
  if (authority.revoked || issued > evaluationEpoch || expires <= evaluationEpoch || expires <= issued) blocked("authority_inactive");
  return {
    authorityRef: authority[refKey],
    revocationRef: authority.revocation_ref,
    expiresAt: authority.expires_at,
    expiresEpoch: expires,
  };
}

function validateApproval(approval, evaluationEpoch, expectedKind, approvedPacketDigest, boundEvidenceDigest = null) {
  const keys = ["approval_ref", "authority_kind", "bound_packet_digest", "issued_at", "expires_at", "revoked", "revocation_ref"];
  if (boundEvidenceDigest !== null) keys.push("bound_evidence_digest");
  exactKeys(approval, keys);
  if (boundEvidenceDigest !== null) {
    requireDigest(approval.bound_evidence_digest);
    if (approval.bound_evidence_digest !== boundEvidenceDigest) blocked("approval_evidence_binding_invalid");
  }
  return validateAuthorityCore(approval, "approval_ref", evaluationEpoch, expectedKind, approvedPacketDigest);
}

function validatePrerequisites(value) {
  exactKeys(value, [
    "c00a_receipt_ref", "c00a_receipt_digest", "c00a_acceptance", "c00q_full_bv_receipt_ref",
    "c00q_full_bv_receipt_digest", "packet_id", "result", "exit_code", "required_live_proofs",
    "unresolved_live_proofs", "tracked_zero_mutation", "raw_sentinel_violations", "p1_unlocked",
  ]);
  requireSafeRef(value.c00a_receipt_ref);
  requireDigest(value.c00a_receipt_digest);
  requireSafeRef(value.c00q_full_bv_receipt_ref);
  requireDigest(value.c00q_full_bv_receipt_digest);
  requireUniqueStrings(value.required_live_proofs);
  requireUniqueStrings(value.unresolved_live_proofs);
  if (value.packet_id !== "TEAX-C00A" || value.result !== "BLOCKED" || value.exit_code !== 3
      || !sameSet(value.required_live_proofs, PROOFS) || !sameSet(value.unresolved_live_proofs, PROOFS)
      || value.tracked_zero_mutation !== true || !Array.isArray(value.raw_sentinel_violations)
      || value.raw_sentinel_violations.length !== 0 || value.p1_unlocked !== false) {
    blocked("c00a_receipt_state_invalid");
  }
}

function validateBaseline(value) {
  exactKeys(value, ["baseline_refs", "head_commit", "origin_main_commit", "clean"]);
  requireSafeRefs(value.baseline_refs);
  if (value.baseline_refs.length === 0 || !COMMIT.test(value.head_commit) || !COMMIT.test(value.origin_main_commit)) invalid();
  if (value.clean !== true || value.head_commit !== value.origin_main_commit) guard("baseline_guard_failed");
}

function validateFrozenC00Q(value) {
  exactKeys(value, ["tool_blob", "tool_digest", "test_blob", "test_digest", "schema_blob", "schema_digest"]);
  for (const [key, expected] of Object.entries(FROZEN_C00Q)) {
    if (value[key] !== expected) blocked("frozen_c00q_mismatch");
  }
}

function validateProducerBinding(value) {
  exactKeys(value, ["descriptor_digest", "manifest_digest"]);
  requireDigest(value.descriptor_digest);
  requireDigest(value.manifest_digest);
}

function validateOutput(value) {
  exactKeys(value, ["mode", "durable_writes", "field_allowlist_ref", "retention_ref"]);
  requireSafeRef(value.field_allowlist_ref);
  requireSafeRef(value.retention_ref);
  if (value.mode !== "stdout_only" || value.durable_writes !== 0) guard("output_guard_failed");
}

function validateExpectedSources(rows) {
  if (!Array.isArray(rows) || rows.length < LANES.length) blocked("expected_source_missing");
  const lanes = new Set();
  const sources = new Set();
  for (const row of rows) {
    exactKeys(row, ["lane", "source_ref", "requirement", "applicability_ref"]);
    if (!LANES.includes(row.lane) || !REQUIREMENTS.has(row.requirement)) invalid();
    lanes.add(row.lane);
    requireSafeRef(row.source_ref);
    if (sources.has(row.source_ref)) blocked("expected_source_duplicate");
    sources.add(row.source_ref);
    if (row.requirement === "not_applicable") requireSafeRef(row.applicability_ref);
    else if (row.applicability_ref !== null) invalid("applicability_ref_forbidden");
  }
  if (lanes.size !== LANES.length) blocked("required_lane_missing");
  return { rows, sourceRefs: [...sources] };
}

function validateLaneManifest(lanes) {
  exactKeys(lanes, LANES);
  const displayed = [];
  for (const lane of LANES) {
    const row = lanes[lane];
    exactKeys(row, [
      "physical_owner_ref", "default_root_ref", "writer_candidates", "direct_caller_candidates",
      "consumer_candidates", "source_availability_summary", "source_refs",
    ]);
    requireSafeRef(row.physical_owner_ref);
    requireSafeRef(row.default_root_ref);
    for (const key of ["writer_candidates", "direct_caller_candidates", "consumer_candidates", "source_refs"]) requireSafeRefs(row[key]);
    if (row.source_refs.length === 0) blocked("source_cardinality_invalid");
    if (!["available", "attested_absent", "attested_gap"].includes(row.source_availability_summary)) blocked("source_unavailable");
    displayed.push(...row.source_refs);
  }
  if (new Set(displayed).size !== displayed.length) blocked("source_lane_duplicate");
}

function validateLaneDisplay(lanes, expectedRows) {
  for (const lane of LANES) {
    const laneRows = expectedRows.filter((row) => row.lane === lane);
    const applicable = laneRows.filter((row) => row.requirement !== "not_applicable");
    const expectedDisplay = (applicable.length > 0 ? applicable : laneRows).map((row) => row.source_ref);
    if (!sameSet(lanes[lane].source_refs, expectedDisplay)) blocked("lane_display_source_mismatch");
  }
}

function validateFingerprint(value) {
  exactKeys(value, ["exists", "sha256", "size", "mtime"]);
  if (typeof value.exists !== "boolean") invalid();
  if (value.exists) {
    if (typeof value.sha256 !== "string" || !HASH_64.test(value.sha256)) invalid();
    if (!Number.isSafeInteger(value.size) || value.size < 0) invalid();
    parseTime(value.mtime);
  } else if (value.sha256 !== null || value.size !== null || value.mtime !== null) invalid();
}

function validateMutationProof(proof) {
  exactKeys(proof, ["source_ref", "method", "query_only_readback", "total_changes", "fingerprints", "equivalent"]);
  requireSafeRef(proof.source_ref);
  if (!['no_source_opened', 'sqlite_file_equivalence'].includes(proof.method)) guard("zero_mutation_guard_failed");
  if (proof.method === "no_source_opened") {
    if (proof.query_only_readback !== null || proof.total_changes !== null || proof.fingerprints !== null) guard("zero_mutation_guard_failed");
  } else {
    if (proof.query_only_readback !== 1 || proof.total_changes !== 0 || !isObject(proof.fingerprints)) guard("zero_mutation_guard_failed");
    exactKeys(proof.fingerprints, ["before", "after"]);
    for (const snapshot of [proof.fingerprints.before, proof.fingerprints.after]) {
      exactKeys(snapshot, ["main", "wal", "shm"]);
      for (const fingerprint of Object.values(snapshot)) validateFingerprint(fingerprint);
      if (snapshot.main.exists !== true || snapshot.wal.exists !== false || snapshot.shm.exists !== false) guard("sqlite_quiescence_fingerprint_invalid");
    }
    if (compactCanonical(proof.fingerprints.before) !== compactCanonical(proof.fingerprints.after)) guard("sqlite_fingerprint_changed");
  }
  if (proof.equivalent !== true) guard("zero_mutation_guard_failed");
}

function validateAggregateRows(rows, kind, allSourceRefs) {
  if (!Array.isArray(rows)) invalid();
  const keysByKind = {
    table: ["source_ref", "table", "count"],
    index: ["source_ref", "table", "name"],
    trigger: ["source_ref", "table", "name"],
    enum: ["source_ref", "table", "column", "value", "count"],
  };
  for (const row of rows) {
    exactKeys(row, keysByKind[kind]);
    requireSafeRef(row.source_ref);
    if (!allSourceRefs.includes(row.source_ref)) blocked("aggregate_source_unknown");
    if (!IDENTIFIER.test(row.table)) invalid("identifier_invalid");
    if ((kind === "index" || kind === "trigger") && !IDENTIFIER.test(row.name)) invalid("identifier_invalid");
    if (kind === "enum" && (!IDENTIFIER.test(row.column) || !ENUM_VALUE.test(row.value))) invalid("identifier_invalid");
    if ((kind === "table" || kind === "enum") && (!Number.isSafeInteger(row.count) || row.count < 0)) invalid();
  }
}

function validateC00QManifest(manifest, evaluationTime, baselineRefs, producerBinding) {
  exactKeys(manifest, [
    "schema_version", "evaluation_time", "query_only", "result", "baseline_refs", "lanes",
    "source_authority_refs", "table_counts", "index_names", "trigger_names", "enum_counts",
    "raw_health_observations", "unresolved_live_proofs", "zero_mutation", "raw_sentinel_violations",
    "authority_effect", "manifest_digest",
  ]);
  if (manifest.schema_version !== C00Q_MANIFEST_SCHEMA || manifest.evaluation_time !== evaluationTime
      || manifest.query_only !== true || manifest.result !== "review_ready_manifest") invalid();
  requireSafeRefs(manifest.baseline_refs);
  if (!sameSet(manifest.baseline_refs, baselineRefs)) guard("baseline_manifest_mismatch");
  requireSafeRefs(manifest.source_authority_refs);
  if (!Array.isArray(manifest.raw_health_observations) || manifest.raw_health_observations.length !== 0) blocked("detached_health_forbidden");
  if (!Array.isArray(manifest.raw_sentinel_violations) || manifest.raw_sentinel_violations.length !== 0) sentinel();
  requireUniqueStrings(manifest.unresolved_live_proofs);
  if (!sameSet(manifest.unresolved_live_proofs, PROOFS)) guard("c00q_proof_ceiling_tampered");

  exactKeys(manifest.authority_effect, [
    "review_ready", "p0_accepted", "h00_review_unlocked", "p1_adapter_execution_unlocked",
    "writer_or_activation_authority_created",
  ]);
  if (manifest.authority_effect.review_ready !== true || manifest.authority_effect.p0_accepted !== false
      || manifest.authority_effect.h00_review_unlocked !== false
      || manifest.authority_effect.p1_adapter_execution_unlocked !== false
      || manifest.authority_effect.writer_or_activation_authority_created !== false) guard("c00q_authority_ceiling_tampered");

  exactKeys(manifest.zero_mutation, ["confirmed", "sources"]);
  if (manifest.zero_mutation.confirmed !== true || !Array.isArray(manifest.zero_mutation.sources)) guard("zero_mutation_guard_failed");
  for (const proof of manifest.zero_mutation.sources) validateMutationProof(proof);
  const allSourceRefs = manifest.zero_mutation.sources.map((proof) => proof.source_ref);
  if (new Set(allSourceRefs).size !== allSourceRefs.length || allSourceRefs.length < LANES.length) blocked("manifest_source_set_invalid");
  validateLaneManifest(manifest.lanes);
  validateAggregateRows(manifest.table_counts, "table", allSourceRefs);
  validateAggregateRows(manifest.index_names, "index", allSourceRefs);
  validateAggregateRows(manifest.trigger_names, "trigger", allSourceRefs);
  validateAggregateRows(manifest.enum_counts, "enum", allSourceRefs);

  requireDigest(manifest.manifest_digest);
  const digestInput = structuredClone(manifest);
  delete digestInput.manifest_digest;
  const recomputed = digestValue(digestInput);
  if (manifest.manifest_digest !== recomputed || producerBinding.manifest_digest !== recomputed) guard("manifest_digest_mismatch");
  return allSourceRefs;
}

function validateSourceAuthorities(rows, expectedRows, manifest, evaluationEpoch, approvedPacketDigest) {
  if (!Array.isArray(rows) || rows.length !== expectedRows.length) blocked("source_authority_missing");
  const expectedBySource = new Map(expectedRows.map((row) => [row.source_ref, row]));
  const sources = new Set();
  const sourceAuthorityRefs = [];
  const sourceContractDigests = [];
  const authorityRecords = [];
  for (const row of rows) {
    exactKeys(row, [
      "lane", "source_ref", "requirement", "applicability_ref", "observation_profile", "adapter_id", "adapter_version",
      "literal_read_allowlist_digest", "query_allowlist_digest", "max_runtime_ms", "max_result_rows",
      "source_contract_digest", "source_evidence_authority", "quiescence",
    ]);
    const expected = expectedBySource.get(row.source_ref);
    if (!expected || sources.has(row.source_ref)) blocked("source_authority_set_mismatch");
    sources.add(row.source_ref);
    if (row.lane !== expected.lane || row.requirement !== expected.requirement || row.applicability_ref !== expected.applicability_ref) blocked("source_owner_rule_mismatch");
    if (row.observation_profile !== "authorized_observation") blocked("authorized_observation_required");
    if (!["attested_metadata_v1", "sqlite_catalog_v1"].includes(row.adapter_id) || row.adapter_version !== "v1") blocked("source_adapter_invalid");
    requireDigest(row.literal_read_allowlist_digest);
    requireDigest(row.query_allowlist_digest);
    if (!Number.isSafeInteger(row.max_runtime_ms) || row.max_runtime_ms <= 0
        || !Number.isSafeInteger(row.max_result_rows) || row.max_result_rows <= 0) invalid();
    requireDigest(row.source_contract_digest);
    const recomputedContract = computeC00BSourceContractDigest(row);
    if (row.source_contract_digest !== recomputedContract) guard("source_contract_digest_mismatch");

    const authority = row.source_evidence_authority;
    exactKeys(authority, [
      "authority_ref", "authority_kind", "bound_packet_digest", "bound_source_contract_digest",
      "issued_at", "expires_at", "revoked", "revocation_ref", "proof_scope", "evidence_refs",
    ]);
    requireDigest(authority.bound_source_contract_digest);
    if (authority.bound_source_contract_digest !== recomputedContract) blocked("source_authority_contract_binding_invalid");
    requireUniqueStrings(authority.proof_scope);
    requireSafeRefs(authority.evidence_refs);
    if (authority.evidence_refs.length === 0 || !sameSet(authority.proof_scope, PROOFS)) blocked("live_proof_scope_missing");
    const authorityRecord = validateAuthorityCore(authority, "authority_ref", evaluationEpoch, "c00b_source_evidence", approvedPacketDigest);

    const quiescence = row.quiescence;
    exactKeys(quiescence, [
      "method", "authority_ref", "authority_kind", "bound_packet_digest", "bound_source_contract_digest",
      "issued_at", "expires_at", "revoked", "revocation_ref",
    ]);
    if (!["no_source_opened_attested", "sidecar_free_exclusive_window_attested"].includes(quiescence.method)) blocked("quiescence_method_invalid");
    requireDigest(quiescence.bound_source_contract_digest);
    if (quiescence.bound_source_contract_digest !== recomputedContract) blocked("quiescence_contract_binding_invalid");
    const quiescenceRecord = validateAuthorityCore(quiescence, "authority_ref", evaluationEpoch, "c00b_source_quiescence", approvedPacketDigest);
    if ((row.adapter_id === "sqlite_catalog_v1") !== (quiescence.method === "sidecar_free_exclusive_window_attested")) blocked("adapter_quiescence_mismatch");

    const mutationProof = manifest.zero_mutation.sources.find((proof) => proof.source_ref === row.source_ref);
    const expectedMutationMethod = row.adapter_id === "sqlite_catalog_v1" ? "sqlite_file_equivalence" : "no_source_opened";
    if (!mutationProof || mutationProof.method !== expectedMutationMethod) guard("adapter_zero_mutation_mismatch");
    sourceAuthorityRefs.push(authority.authority_ref);
    sourceContractDigests.push(recomputedContract);
    authorityRecords.push(authorityRecord, quiescenceRecord);
  }
  if (!sameSet([...sources], expectedRows.map((row) => row.source_ref))) blocked("source_authority_set_mismatch");
  if (!sameSet(sourceAuthorityRefs, manifest.source_authority_refs)) blocked("source_authority_manifest_mismatch");
  return { sourceAuthorityRefs, sourceContractDigests, authorityRecords };
}

function earliestExpiry(records) {
  return [...records].sort((a, b) => a.expiresEpoch - b.expiresEpoch || compareCodeUnits(a.expiresAt, b.expiresAt))[0].expiresAt;
}

export function judgeC00BPacket(packet, approvedPacketDigest) {
  enforceSentinels(packet);
  if (!isObject(packet)) invalid();
  if (!Object.hasOwn(packet, "packet_digest")) blocked("packet_digest_missing");
  if (typeof approvedPacketDigest !== "string" || !SHA256.test(approvedPacketDigest)) blocked("approved_packet_digest_missing_or_invalid");
  exactKeys(packet, [
    "schema_version", "evaluation_time", "packet_digest", "prerequisites", "baseline", "executor", "approvals",
    "frozen_c00q", "expected_source_refs", "producer_binding", "source_authorities", "c00q_manifest",
    "output", "raw_payload_copied",
  ]);
  if (packet.schema_version !== PACKET_SCHEMA || packet.raw_payload_copied !== false) invalid();
  requireDigest(packet.packet_digest);
  const recomputedPacketDigest = computeC00BPacketDigest(packet);
  if (packet.packet_digest !== recomputedPacketDigest || approvedPacketDigest !== recomputedPacketDigest) blocked("packet_digest_not_approved");

  const evaluationEpoch = parseTime(packet.evaluation_time);
  validatePrerequisites(packet.prerequisites);
  validateBaseline(packet.baseline);
  validateFrozenC00Q(packet.frozen_c00q);
  validateProducerBinding(packet.producer_binding);
  validateOutput(packet.output);
  const expected = validateExpectedSources(packet.expected_source_refs);
  const manifestSourceRefs = validateC00QManifest(packet.c00q_manifest, packet.evaluation_time, packet.baseline.baseline_refs, packet.producer_binding);
  if (!sameSet(expected.sourceRefs, manifestSourceRefs)) blocked("expected_source_manifest_mismatch");
  validateLaneDisplay(packet.c00q_manifest.lanes, expected.rows);

  exactKeys(packet.executor, ["node_identity_ref", "bootstrap_profile", "inventory_authority"]);
  requireSafeRef(packet.executor.node_identity_ref);
  if (packet.executor.bootstrap_profile !== "owner-with-state") blocked("executor_profile_invalid");
  const inventoryRecord = validateApproval(packet.executor.inventory_authority, evaluationEpoch, "c00b_inventory", approvedPacketDigest);
  const c00aRecord = validateApproval(
    packet.prerequisites.c00a_acceptance,
    evaluationEpoch,
    "c00a_acceptance",
    approvedPacketDigest,
    packet.prerequisites.c00a_receipt_digest,
  );

  exactKeys(packet.approvals, ["c00q_acceptance", "c00b_execution", "c00b_judge"]);
  const c00qRecord = validateApproval(
    packet.approvals.c00q_acceptance,
    evaluationEpoch,
    "c00q_acceptance",
    approvedPacketDigest,
    packet.prerequisites.c00q_full_bv_receipt_digest,
  );
  const executionRecord = validateApproval(packet.approvals.c00b_execution, evaluationEpoch, "c00b_execution", approvedPacketDigest);
  const judgeRecord = validateApproval(packet.approvals.c00b_judge, evaluationEpoch, "c00b_judge", approvedPacketDigest);
  const sourceResult = validateSourceAuthorities(
    packet.source_authorities,
    expected.rows,
    packet.c00q_manifest,
    evaluationEpoch,
    approvedPacketDigest,
  );
  const authorityRecords = [c00aRecord, c00qRecord, executionRecord, judgeRecord, inventoryRecord, ...sourceResult.authorityRecords];
  const authorityRefs = authorityRecords.map((record) => record.authorityRef);
  if (new Set(authorityRefs).size !== authorityRefs.length) blocked("authority_ref_collision");
  const revocationRefs = [...new Set(authorityRecords.map((record) => record.revocationRef))];

  const receipt = {
    schema_version: RECEIPT_SCHEMA,
    evaluation_time: packet.evaluation_time,
    result: "PASS",
    query_only: true,
    packet_digest: recomputedPacketDigest,
    baseline_refs: packet.baseline.baseline_refs,
    c00a_receipt_digest: packet.prerequisites.c00a_receipt_digest,
    c00q_full_bv_receipt_digest: packet.prerequisites.c00q_full_bv_receipt_digest,
    frozen_c00q_tool_digest: packet.frozen_c00q.tool_digest,
    frozen_c00q_test_digest: packet.frozen_c00q.test_digest,
    frozen_c00q_schema_digest: packet.frozen_c00q.schema_digest,
    producer_descriptor_digest: packet.producer_binding.descriptor_digest,
    producer_manifest_digest: packet.producer_binding.manifest_digest,
    source_authority_refs: sourceResult.sourceAuthorityRefs,
    source_contract_digests: sourceResult.sourceContractDigests,
    authority_refs: authorityRefs,
    revocation_refs: revocationRefs,
    effective_expires_at: earliestExpiry(authorityRecords),
    required_live_proofs: [...PROOFS],
    resolved_live_proofs: [...PROOFS],
    unresolved_live_proofs: [],
    zero_mutation_confirmed: true,
    raw_sentinel_violations: [],
    output: {
      mode: "stdout_only",
      durable_writes: 0,
      field_allowlist_ref: packet.output.field_allowlist_ref,
      retention_ref: packet.output.retention_ref,
    },
    p0_accepted: true,
    next_gate: "TEAX-H00_RATIFICATION",
    h00_review_unlocked: true,
    p1_adapter_execution_unlocked: false,
    h00_ratified: false,
    d21_to_d26_authority_created: false,
    writer_or_activation_authority_created: false,
  };
  const canonical = canonicalize(receipt);
  const result = canonicalize({ ...canonical, receipt_digest: digestValue(canonical) });
  if (Object.hasOwn(result, "p1_unlocked")) guard("authority_effect_invalid");
  enforceSentinels(result);
  return result;
}

function parseCli(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const seen = new Set();
  let packetPath = null;
  let approvedPacketDigest = null;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!["--query-only", "--json", "--packet", "--approved-packet-digest"].includes(flag) || seen.has(flag)) invalid("cli_invalid");
    seen.add(flag);
    if (flag === "--packet") {
      const value = argv[++index];
      if (!value || value.startsWith("--") || /[*?\[\]]/.test(value) || !/\.json$/i.test(value)) invalid("cli_invalid");
      packetPath = value;
    } else if (flag === "--approved-packet-digest") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) blocked("approved_packet_digest_missing_or_invalid");
      approvedPacketDigest = value;
    }
  }
  if (!seen.has("--query-only") || !seen.has("--json") || !seen.has("--packet") || !packetPath) invalid("cli_invalid");
  if (!seen.has("--approved-packet-digest") || typeof approvedPacketDigest !== "string" || !SHA256.test(approvedPacketDigest)) {
    blocked("approved_packet_digest_missing_or_invalid");
  }
  if (seen.size !== 4) invalid("cli_invalid");
  return { help: false, packetPath, approvedPacketDigest };
}

function usage() {
  return "Usage: node ui-workspace/apps/dev-erp/tools/task_engine_inventory_c00b_judge.mjs --query-only --json --packet <literal-json-path> --approved-packet-digest <sha256:digest>";
}

function safeError(error) {
  const exitCode = error instanceof JudgeError ? error.exitCode : 6;
  const reasonByExit = {
    2: "packet_or_cli_invalid",
    3: "approval_authority_or_source_blocked",
    4: "digest_ceiling_or_zero_mutation_guard_failed",
    5: "raw_path_secret_sentinel",
    6: "operational_read_failed",
  };
  return canonicalize({
    schema_version: ERROR_SCHEMA,
    result: "blocked",
    exit_code: exitCode,
    reason_code: reasonByExit[exitCode] ?? reasonByExit[6],
    required_live_proofs: [...PROOFS],
    resolved_live_proofs: [],
    unresolved_live_proofs: [...PROOFS],
    zero_mutation_confirmed: false,
    p0_accepted: false,
    next_gate: null,
    h00_review_unlocked: false,
    p1_adapter_execution_unlocked: false,
    h00_ratified: false,
    d21_to_d26_authority_created: false,
    writer_or_activation_authority_created: false,
  });
}

export function runC00BJudgeCli(argv) {
  try {
    const parsed = parseCli(argv);
    if (parsed.help) return { exitCode: 0, output: usage() };
    let text;
    try {
      text = readFileSync(parsed.packetPath, "utf8");
    } catch {
      return { exitCode: 6, output: compactCanonical(safeError(new JudgeError(6, "operational_read_failed"))) };
    }
    let packet;
    try {
      packet = JSON.parse(text);
    } catch {
      invalid("packet_invalid");
    }
    return { exitCode: 0, output: compactCanonical(judgeC00BPacket(packet, parsed.approvedPacketDigest)) };
  } catch (error) {
    const envelope = safeError(error);
    return { exitCode: error instanceof JudgeError ? error.exitCode : 6, output: compactCanonical(envelope) };
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const result = runC00BJudgeCli(process.argv.slice(2));
  process.stdout.write(`${result.output}\n`);
  process.exitCode = result.exitCode;
}

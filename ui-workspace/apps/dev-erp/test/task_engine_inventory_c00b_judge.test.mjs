import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  computeC00BPacketDigest,
  computeC00BSourceContractDigest,
  judgeC00BPacket,
  runC00BJudgeCli,
} from "../tools/task_engine_inventory_c00b_judge.mjs";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default;
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = dirname(HERE);
const TOOL = join(APP, "tools", "task_engine_inventory_c00b_judge.mjs");
const C00Q_TOOL = join(APP, "tools", "task_engine_inventory.mjs");
const C00Q_TEST = join(APP, "test", "task_engine_inventory.test.mjs");
const C00Q_SCHEMA = join(APP, "docs", "contracts", "task_engine_inventory_manifest.v1.schema.json");
const SCHEMA_PATH = join(APP, "docs", "contracts", "task_engine_inventory_c00b_receipt.v1.schema.json");
const EVALUATION_TIME = "2026-07-16T12:00:00+09:00";
const LANES = ["mail", "voice", "structured_pc_work", "file", "run_log"];
const PROOFS = ["C00-LIVE-01", "C00-LIVE-02", "C00-LIVE-03", "C00-LIVE-04"];
const EMPTY_DIGEST = `sha256:${"0".repeat(64)}`;
const FROZEN = {
  tool_blob: "379945f0e2e1d6f3566f2c4479caf2887b011998",
  tool_digest: "sha256:36e2d6e07226d3b6f24d0de33e68a06eb36d1273fdaaaebe81c378d508e5f1e5",
  test_blob: "ca20b035c14651764dc92627ce4bcd72e6a06361",
  test_digest: "sha256:36f31964f54ad667e0257631d04eca9f03af4c5f28d1a465b158390f0017d6d6",
  schema_blob: "21595a7ba61a3570221d63a45c4b90f27e4aa01c",
  schema_digest: "sha256:72bf55f30f136f1d30a83b280254eb3b0908c2a85d7e906dd10a6033e92f1f4c",
};
const SET_ARRAY_KEYS = new Set([
  "baseline_refs", "source_authority_refs", "source_refs", "proof_scope", "evidence_refs",
  "expected_source_refs", "required_live_proofs", "resolved_live_proofs", "unresolved_live_proofs",
  "source_contract_digests", "authority_refs", "revocation_refs", "raw_sentinel_violations",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function clone(value) {
  return structuredClone(value);
}

function approval(ref, authorityKind, { boundEvidenceDigest = null, expiresAt = "2026-07-16T18:00:00+09:00" } = {}) {
  const value = {
    approval_ref: ref,
    authority_kind: authorityKind,
    bound_packet_digest: EMPTY_DIGEST,
    issued_at: "2026-07-16T09:00:00+09:00",
    expires_at: expiresAt,
    revoked: false,
    revocation_ref: `revocation_${ref}`,
  };
  if (boundEvidenceDigest !== null) value.bound_evidence_digest = boundEvidenceDigest;
  return value;
}

function makeSource(lane, suffix = "", requirement = "required") {
  const tag = suffix ? `${lane}_${suffix}` : lane;
  const sourceRef = `source_${tag}`;
  const applicabilityRef = requirement === "not_applicable" ? `applicability_${tag}` : null;
  return {
    lane,
    source_ref: sourceRef,
    requirement,
    applicability_ref: applicabilityRef,
    observation_profile: "authorized_observation",
    adapter_id: "attested_metadata_v1",
    adapter_version: "v1",
    literal_read_allowlist_digest: `sha256:${"3".repeat(64)}`,
    query_allowlist_digest: `sha256:${"4".repeat(64)}`,
    max_runtime_ms: 1000,
    max_result_rows: 100,
    source_contract_digest: EMPTY_DIGEST,
    source_evidence_authority: {
      authority_ref: `authority_${tag}`,
      authority_kind: "c00b_source_evidence",
      bound_packet_digest: EMPTY_DIGEST,
      bound_source_contract_digest: EMPTY_DIGEST,
      issued_at: "2026-07-16T09:00:00+09:00",
      expires_at: "2026-07-16T18:00:00+09:00",
      revoked: false,
      revocation_ref: `revocation_authority_${tag}`,
      proof_scope: [...PROOFS],
      evidence_refs: [`evidence_${tag}`],
    },
    quiescence: {
      method: "no_source_opened_attested",
      authority_ref: `quiescence_${tag}`,
      authority_kind: "c00b_source_quiescence",
      bound_packet_digest: EMPTY_DIGEST,
      bound_source_contract_digest: EMPTY_DIGEST,
      issued_at: "2026-07-16T09:00:00+09:00",
      expires_at: "2026-07-16T18:00:00+09:00",
      revoked: false,
      revocation_ref: `revocation_quiescence_${tag}`,
    },
  };
}

function expectedRow(source) {
  return {
    lane: source.lane,
    source_ref: source.source_ref,
    requirement: source.requirement,
    applicability_ref: source.applicability_ref,
  };
}

function mutationProof(sourceRef) {
  return {
    source_ref: sourceRef,
    method: "no_source_opened",
    query_only_readback: null,
    total_changes: null,
    fingerprints: null,
    equivalent: true,
  };
}

function refreshManifest(packet) {
  const digestInput = clone(packet.c00q_manifest);
  delete digestInput.manifest_digest;
  packet.c00q_manifest.manifest_digest = digestValue(digestInput);
  packet.producer_binding.manifest_digest = packet.c00q_manifest.manifest_digest;
}

function allAuthorities(packet) {
  return [
    packet.prerequisites.c00a_acceptance,
    ...Object.values(packet.approvals),
    packet.executor.inventory_authority,
    ...packet.source_authorities.flatMap((source) => [source.source_evidence_authority, source.quiescence]),
  ];
}

function finalizePacket(packet, { refreshContracts = true } = {}) {
  if (refreshContracts) {
    for (const source of packet.source_authorities) {
      const contractDigest = computeC00BSourceContractDigest(source);
      source.source_contract_digest = contractDigest;
      source.source_evidence_authority.bound_source_contract_digest = contractDigest;
      source.quiescence.bound_source_contract_digest = contractDigest;
    }
  }
  const packetDigest = computeC00BPacketDigest(packet);
  packet.packet_digest = packetDigest;
  for (const authority of allAuthorities(packet)) authority.bound_packet_digest = packetDigest;
  assert.equal(computeC00BPacketDigest(packet), packetDigest, "bound packet digests must be outside the digest domain");
  return packet;
}

function makeManifest(sources) {
  const lanes = {};
  for (const lane of LANES) {
    const laneSources = sources.filter((source) => source.lane === lane);
    const applicable = laneSources.filter((source) => source.requirement !== "not_applicable");
    const displayed = applicable.length > 0 ? applicable : laneSources;
    lanes[lane] = {
      physical_owner_ref: `owner_${lane}`,
      default_root_ref: `root_${lane}`,
      writer_candidates: [`writer_${lane}`],
      direct_caller_candidates: [`caller_${lane}`],
      consumer_candidates: [`consumer_${lane}`],
      source_availability_summary: "available",
      source_refs: displayed.map((source) => source.source_ref),
    };
  }
  const manifest = {
    schema_version: "soulforge.task_engine_inventory_manifest.v1",
    evaluation_time: EVALUATION_TIME,
    query_only: true,
    result: "review_ready_manifest",
    baseline_refs: ["baseline_c00b"],
    lanes,
    source_authority_refs: sources.map((source) => source.source_evidence_authority.authority_ref),
    table_counts: [],
    index_names: [],
    trigger_names: [],
    enum_counts: [],
    raw_health_observations: [],
    unresolved_live_proofs: [...PROOFS],
    zero_mutation: { confirmed: true, sources: sources.map((source) => mutationProof(source.source_ref)) },
    raw_sentinel_violations: [],
    authority_effect: {
      review_ready: true,
      p0_accepted: false,
      h00_review_unlocked: false,
      p1_adapter_execution_unlocked: false,
      writer_or_activation_authority_created: false,
    },
  };
  return canonicalize({ ...manifest, manifest_digest: digestValue(manifest) });
}

function makePacket() {
  const sources = LANES.map((lane) => makeSource(lane));
  const c00aReceiptDigest = `sha256:${"1".repeat(64)}`;
  const c00qFullBvDigest = `sha256:${"2".repeat(64)}`;
  const manifest = makeManifest(sources);
  const packet = {
    schema_version: "soulforge.task_engine_inventory_c00b_judge_packet.v1",
    evaluation_time: EVALUATION_TIME,
    packet_digest: EMPTY_DIGEST,
    prerequisites: {
      c00a_receipt_ref: "c00a_blocker_receipt",
      c00a_receipt_digest: c00aReceiptDigest,
      c00a_acceptance: approval("approval_c00a", "c00a_acceptance", { boundEvidenceDigest: c00aReceiptDigest }),
      c00q_full_bv_receipt_ref: "c00q_full_bv_receipt",
      c00q_full_bv_receipt_digest: c00qFullBvDigest,
      packet_id: "TEAX-C00A",
      result: "BLOCKED",
      exit_code: 3,
      required_live_proofs: [...PROOFS],
      unresolved_live_proofs: [...PROOFS],
      tracked_zero_mutation: true,
      raw_sentinel_violations: [],
      p1_unlocked: false,
    },
    baseline: {
      baseline_refs: ["baseline_c00b"],
      head_commit: "a".repeat(40),
      origin_main_commit: "a".repeat(40),
      clean: true,
    },
    executor: {
      node_identity_ref: "executor_node_primary",
      bootstrap_profile: "owner-with-state",
      inventory_authority: approval("approval_inventory_authority", "c00b_inventory"),
    },
    approvals: {
      c00q_acceptance: approval("approval_c00q", "c00q_acceptance", { boundEvidenceDigest: c00qFullBvDigest }),
      c00b_execution: approval("approval_c00b_execution", "c00b_execution"),
      c00b_judge: approval("approval_c00b_judge", "c00b_judge"),
    },
    frozen_c00q: clone(FROZEN),
    expected_source_refs: sources.map(expectedRow),
    producer_binding: {
      descriptor_digest: `sha256:${"6".repeat(64)}`,
      manifest_digest: manifest.manifest_digest,
    },
    source_authorities: sources,
    c00q_manifest: manifest,
    output: {
      mode: "stdout_only",
      durable_writes: 0,
      field_allowlist_ref: "c00b_receipt_field_allowlist",
      retention_ref: "c00b_stdout_ephemeral_retention",
    },
    raw_payload_copied: false,
  };
  return finalizePacket(packet);
}

function addSource(packet, lane, suffix, requirement) {
  const source = makeSource(lane, suffix, requirement);
  packet.source_authorities.push(source);
  packet.expected_source_refs.push(expectedRow(source));
  packet.c00q_manifest.source_authority_refs.push(source.source_evidence_authority.authority_ref);
  packet.c00q_manifest.zero_mutation.sources.push(mutationProof(source.source_ref));
  const laneExpected = packet.expected_source_refs.filter((row) => row.lane === lane);
  const applicable = laneExpected.filter((row) => row.requirement !== "not_applicable");
  packet.c00q_manifest.lanes[lane].source_refs = (applicable.length > 0 ? applicable : laneExpected).map((row) => row.source_ref);
  refreshManifest(packet);
  return finalizePacket(packet);
}

function assertReceiptMatchesSchema(receipt, schema) {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const validateReceipt = ajv.compile(schema);
  assert.equal(validateReceipt(receipt), true, JSON.stringify(validateReceipt.errors));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(receipt).sort(), [...schema.required].sort());
  for (const [key, property] of Object.entries(schema.properties)) {
    if (Object.hasOwn(property, "const")) assert.deepEqual(receipt[key], property.const, key);
  }
  const safeRef = new RegExp(schema.$defs.safe_ref.pattern);
  const digest = new RegExp(schema.$defs.digest.pattern);
  const timestamp = new RegExp(schema.$defs.timestamp.pattern);
  for (const key of [
    "packet_digest", "c00a_receipt_digest", "c00q_full_bv_receipt_digest", "frozen_c00q_tool_digest",
    "frozen_c00q_test_digest", "frozen_c00q_schema_digest", "producer_descriptor_digest",
    "producer_manifest_digest", "receipt_digest",
  ]) assert.match(receipt[key], digest, key);
  for (const key of ["baseline_refs", "source_authority_refs", "authority_refs", "revocation_refs"]) {
    for (const value of receipt[key]) assert.match(value, safeRef, key);
  }
  for (const value of receipt.source_contract_digests) assert.match(value, digest);
  assert.ok(receipt.source_authority_refs.length >= 5);
  assert.ok(receipt.authority_refs.length >= 15);
  assert.match(receipt.effective_expires_at, timestamp);
  assert.deepEqual(receipt.required_live_proofs, PROOFS);
  assert.deepEqual(receipt.resolved_live_proofs, PROOFS);
  assert.deepEqual(receipt.unresolved_live_proofs, []);
  assert.deepEqual(Object.keys(receipt.output).sort(), [...schema.properties.output.required].sort());
}

function runPacket(root, packet, name = "packet.json", approvedDigest = packet.packet_digest, includeApproved = true) {
  const packetPath = join(root, name);
  writeFileSync(packetPath, JSON.stringify(packet), "utf8");
  const argv = ["--query-only", "--json", "--packet", packetPath];
  if (includeApproved) argv.push("--approved-packet-digest", approvedDigest);
  const result = runC00BJudgeCli(argv);
  return { status: result.exitCode, stdout: `${result.output}\n`, stderr: "", packetPath };
}

function spawnPacket(root, packet, approvedDigest = packet.packet_digest) {
  const packetPath = join(root, "spawn-packet.json");
  writeFileSync(packetPath, JSON.stringify(packet), "utf8");
  const execution = spawnSync(process.execPath, [
    TOOL, "--query-only", "--json", "--packet", packetPath,
    "--approved-packet-digest", approvedDigest,
  ], { cwd: APP, encoding: "utf8", windowsHide: true });
  return { ...execution, packetPath };
}

function assertBlockedEffects(envelope) {
  assert.deepEqual(envelope.required_live_proofs, PROOFS);
  assert.deepEqual(envelope.resolved_live_proofs, []);
  assert.deepEqual(envelope.unresolved_live_proofs, PROOFS);
  assert.equal(envelope.p0_accepted, false);
  assert.equal(envelope.next_gate, null);
  assert.equal(envelope.h00_review_unlocked, false);
  assert.equal(envelope.p1_adapter_execution_unlocked, false);
  assert.equal(envelope.h00_ratified, false);
  assert.equal(envelope.d21_to_d26_authority_created, false);
  assert.equal(envelope.writer_or_activation_authority_created, false);
  assert.equal(envelope.zero_mutation_confirmed, false);
}

function assertSafeError(execution, expectedStatus) {
  assert.equal(execution.status, expectedStatus, execution.stderr || execution.stdout);
  assert.equal(execution.stderr, "");
  assert.equal(execution.stdout.split(/\r?\n/).filter(Boolean).length, 1);
  assert.equal(execution.stdout.includes(execution.packetPath), false);
  const envelope = JSON.parse(execution.stdout);
  assert.equal(envelope.schema_version, "soulforge.task_engine_inventory_c00b_judge_error.v1");
  assert.equal(envelope.exit_code, expectedStatus);
  assertBlockedEffects(envelope);
  return envelope;
}

test("owner-approved packet digest produces only the bounded PASS effect and earliest expiry", () => {
  const packet = makePacket();
  packet.prerequisites.c00a_acceptance.expires_at = "2026-07-16T13:00:00+09:00";
  finalizePacket(packet);
  const receipt = judgeC00BPacket(packet, packet.packet_digest);
  assert.equal(receipt.result, "PASS");
  assert.equal(receipt.packet_digest, packet.packet_digest);
  assert.equal(receipt.effective_expires_at, "2026-07-16T13:00:00+09:00");
  assert.equal(receipt.p0_accepted, true);
  assert.equal(receipt.next_gate, "TEAX-H00_RATIFICATION");
  assert.equal(receipt.h00_review_unlocked, true);
  assert.equal(receipt.p1_adapter_execution_unlocked, false);
  assert.equal(receipt.h00_ratified, false);
  assert.equal(receipt.d21_to_d26_authority_created, false);
  assert.equal(receipt.writer_or_activation_authority_created, false);
  assert.equal(Object.hasOwn(receipt, "p1_unlocked"), false);
  assert.equal(receipt.authority_refs.length, 15);
  assert.equal(receipt.source_contract_digests.length, 5);
});

test("receipt is schema-valid and deterministic under packet permutations", () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const first = makePacket();
  const second = clone(first);
  second.source_authorities.reverse();
  second.expected_source_refs.reverse();
  second.c00q_manifest.source_authority_refs.reverse();
  second.c00q_manifest.zero_mutation.sources.reverse();
  for (const lane of LANES) second.c00q_manifest.lanes[lane].source_refs.reverse();
  refreshManifest(second);
  finalizePacket(second);
  const a = judgeC00BPacket(first, first.packet_digest);
  const b = judgeC00BPacket(second, second.packet_digest);
  assert.equal(first.packet_digest, second.packet_digest);
  assert.deepEqual(a, b);
  assertReceiptMatchesSchema(a, schema);
  const withUnknownKey = { ...a, unexpected_authority: true };
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const validateReceipt = ajv.compile(schema);
  assert.equal(validateReceipt(withUnknownKey), false);
  assert.equal(validateReceipt.errors?.some((error) => error.keyword === "additionalProperties"), true);
  const receiptBody = clone(a);
  delete receiptBody.receipt_digest;
  assert.equal(a.receipt_digest, digestValue(receiptBody));
});

test("nonempty aggregate rows use exact identifiers and exact source membership", () => {
  const packet = makePacket();
  packet.c00q_manifest.table_counts = [{ source_ref: "source_structured_pc_work", table: "task_items", count: 3 }];
  packet.c00q_manifest.index_names = [{ source_ref: "source_structured_pc_work", table: "task_items", name: "task_items_status_idx" }];
  packet.c00q_manifest.trigger_names = [{ source_ref: "source_structured_pc_work", table: "task_items", name: "task_items_noop" }];
  packet.c00q_manifest.enum_counts = [{ source_ref: "source_structured_pc_work", table: "task_items", column: "status", value: "open:v1", count: 2 }];
  refreshManifest(packet);
  finalizePacket(packet);
  assert.equal(judgeC00BPacket(packet, packet.packet_digest).result, "PASS");

  const unknown = clone(packet);
  unknown.c00q_manifest.index_names[0].source_ref = "source_not_listed";
  refreshManifest(unknown);
  finalizePacket(unknown);
  const root = mkdtempSync(join(tmpdir(), "c00b-aggregate-"));
  try { assertSafeError(runPacket(root, unknown), 3); } finally { rmSync(root, { recursive: true, force: true }); }
});

test("six sources remain deterministic and schema-valid", () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const first = addSource(makePacket(), "mail", "secondary", "optional");
  const second = clone(first);
  second.source_authorities.reverse();
  second.expected_source_refs.reverse();
  second.c00q_manifest.source_authority_refs.reverse();
  second.c00q_manifest.zero_mutation.sources.reverse();
  second.c00q_manifest.lanes.mail.source_refs.reverse();
  refreshManifest(second);
  finalizePacket(second);
  const a = judgeC00BPacket(first, first.packet_digest);
  const b = judgeC00BPacket(second, second.packet_digest);
  assert.deepEqual(a, b);
  assert.equal(a.source_authority_refs.length, 6);
  assertReceiptMatchesSchema(a, schema);
});

test("optional and not-applicable owner rules follow applicable-lane display and reject omissions", () => {
  const packet = addSource(addSource(makePacket(), "mail", "optional", "optional"), "mail", "na", "not_applicable");
  assert.deepEqual(new Set(packet.c00q_manifest.lanes.mail.source_refs), new Set(["source_mail", "source_mail_optional"]));
  assert.equal(judgeC00BPacket(packet, packet.packet_digest).result, "PASS");
  const root = mkdtempSync(join(tmpdir(), "c00b-owner-rule-"));
  try {
    const missingAuthority = clone(packet);
    missingAuthority.source_authorities = missingAuthority.source_authorities.filter((row) => row.source_ref !== "source_mail_optional");
    finalizePacket(missingAuthority);
    assertSafeError(runPacket(root, missingAuthority, "missing-authority.json"), 3);

    const missingProof = clone(packet);
    missingProof.c00q_manifest.zero_mutation.sources = missingProof.c00q_manifest.zero_mutation.sources.filter((row) => row.source_ref !== "source_mail_na");
    refreshManifest(missingProof);
    finalizePacket(missingProof);
    assertSafeError(runPacket(root, missingProof, "missing-proof.json"), 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing or mismatched external approval digest is BLOCKED", () => {
  const root = mkdtempSync(join(tmpdir(), "c00b-approved-digest-"));
  try {
    const packet = makePacket();
    assertSafeError(runPacket(root, packet, "missing-external.json", packet.packet_digest, false), 3);
    assertSafeError(runPacket(root, packet, "wrong-external.json", `sha256:${"f".repeat(64)}`), 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("C00A acceptance expiry, revocation, evidence binding, and receipt state are BLOCKED", () => {
  const root = mkdtempSync(join(tmpdir(), "c00b-c00a-"));
  try {
    const expired = makePacket();
    expired.prerequisites.c00a_acceptance.expires_at = EVALUATION_TIME;
    finalizePacket(expired);
    assertSafeError(runPacket(root, expired, "c00a-expired.json"), 3);

    const revoked = makePacket();
    revoked.prerequisites.c00a_acceptance.revoked = true;
    finalizePacket(revoked);
    assertSafeError(runPacket(root, revoked, "c00a-revoked.json"), 3);

    const wrongBound = makePacket();
    wrongBound.prerequisites.c00a_acceptance.bound_evidence_digest = `sha256:${"f".repeat(64)}`;
    finalizePacket(wrongBound);
    assertSafeError(runPacket(root, wrongBound, "c00a-bound.json"), 3);

    const wrongState = makePacket();
    wrongState.prerequisites.result = "PASS";
    finalizePacket(wrongState);
    assertSafeError(runPacket(root, wrongState, "c00a-state.json"), 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prerequisite and frozen mutations cannot reuse an approved PASS", () => {
  const root = mkdtempSync(join(tmpdir(), "c00b-evidence-binding-"));
  try {
    const original = makePacket();
    const prerequisite = clone(original);
    prerequisite.prerequisites.c00a_receipt_digest = `sha256:${"7".repeat(64)}`;
    assertSafeError(runPacket(root, prerequisite, "prerequisite.json", original.packet_digest), 3);

    const frozen = clone(original);
    frozen.frozen_c00q.tool_digest = `sha256:${"8".repeat(64)}`;
    finalizePacket(frozen);
    assertSafeError(runPacket(root, frozen, "frozen.json"), 3);

    const newlyApproved = clone(original);
    newlyApproved.prerequisites.c00a_receipt_digest = `sha256:${"9".repeat(64)}`;
    newlyApproved.prerequisites.c00a_acceptance.bound_evidence_digest = newlyApproved.prerequisites.c00a_receipt_digest;
    finalizePacket(newlyApproved);
    const changedReceipt = judgeC00BPacket(newlyApproved, newlyApproved.packet_digest);
    const originalReceipt = judgeC00BPacket(original, original.packet_digest);
    assert.notEqual(changedReceipt.packet_digest, originalReceipt.packet_digest);
    assert.notEqual(changedReceipt.receipt_digest, originalReceipt.receipt_digest);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("authority collision, wrong kind, and wrong packet binding are BLOCKED", () => {
  const root = mkdtempSync(join(tmpdir(), "c00b-authority-"));
  try {
    const collision = makePacket();
    collision.executor.inventory_authority.approval_ref = collision.approvals.c00b_judge.approval_ref;
    finalizePacket(collision);
    assertSafeError(runPacket(root, collision, "collision.json"), 3);

    const wrongKind = makePacket();
    wrongKind.approvals.c00b_execution.authority_kind = "c00b_judge";
    finalizePacket(wrongKind);
    assertSafeError(runPacket(root, wrongKind, "kind.json"), 3);

    const wrongBinding = makePacket();
    wrongBinding.source_authorities[0].quiescence.bound_packet_digest = `sha256:${"a".repeat(64)}`;
    assertSafeError(runPacket(root, wrongBinding, "binding.json"), 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("source contract mutation is blocked even under a newly approved packet digest", () => {
  const root = mkdtempSync(join(tmpdir(), "c00b-source-contract-"));
  try {
    const packet = makePacket();
    packet.source_authorities[0].max_result_rows += 1;
    finalizePacket(packet, { refreshContracts: false });
    assertSafeError(runPacket(root, packet), 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("expiry, revocation, profile, source, and proof gaps remain BLOCKED", () => {
  const root = mkdtempSync(join(tmpdir(), "c00b-blocked-"));
  try {
    const expired = makePacket();
    expired.approvals.c00b_execution.expires_at = EVALUATION_TIME;
    finalizePacket(expired);
    assertSafeError(runPacket(root, expired, "expired.json"), 3);

    const revoked = makePacket();
    revoked.source_authorities[0].source_evidence_authority.revoked = true;
    finalizePacket(revoked);
    assertSafeError(runPacket(root, revoked, "revoked.json"), 3);

    const synthetic = makePacket();
    synthetic.source_authorities[0].observation_profile = "synthetic";
    finalizePacket(synthetic, { refreshContracts: false });
    assertSafeError(runPacket(root, synthetic, "synthetic.json"), 3);

    const proofGap = makePacket();
    proofGap.source_authorities[0].source_evidence_authority.proof_scope.pop();
    finalizePacket(proofGap);
    assertSafeError(runPacket(root, proofGap, "proof-gap.json"), 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("manifest ceiling, digest, and sqlite fingerprint/quiescence tampering are guarded", () => {
  const root = mkdtempSync(join(tmpdir(), "c00b-manifest-guard-"));
  try {
    const ceiling = makePacket();
    ceiling.c00q_manifest.authority_effect.p0_accepted = true;
    refreshManifest(ceiling);
    finalizePacket(ceiling);
    assertSafeError(runPacket(root, ceiling, "ceiling.json"), 4);

    const fingerprint = makePacket();
    const source = fingerprint.source_authorities[0];
    source.adapter_id = "sqlite_catalog_v1";
    source.quiescence.method = "sidecar_free_exclusive_window_attested";
    const present = { exists: true, sha256: "5".repeat(64), size: 1024, mtime: "2026-07-16T02:59:00.000Z" };
    const absent = { exists: false, sha256: null, size: null, mtime: null };
    const proof = fingerprint.c00q_manifest.zero_mutation.sources.find((row) => row.source_ref === source.source_ref);
    proof.method = "sqlite_file_equivalence";
    proof.query_only_readback = 1;
    proof.total_changes = 0;
    proof.fingerprints = {
      before: { main: present, wal: absent, shm: absent },
      after: { main: { ...present, size: 1025 }, wal: absent, shm: absent },
    };
    refreshManifest(fingerprint);
    finalizePacket(fingerprint);
    assertSafeError(runPacket(root, fingerprint, "fingerprint.json"), 4);

    const sidecar = makePacket();
    const sidecarSource = sidecar.source_authorities[0];
    sidecarSource.adapter_id = "sqlite_catalog_v1";
    sidecarSource.quiescence.method = "sidecar_free_exclusive_window_attested";
    const sidecarProof = sidecar.c00q_manifest.zero_mutation.sources.find((row) => row.source_ref === sidecarSource.source_ref);
    sidecarProof.method = "sqlite_file_equivalence";
    sidecarProof.query_only_readback = 1;
    sidecarProof.total_changes = 0;
    sidecarProof.fingerprints = {
      before: { main: present, wal: { ...present }, shm: absent },
      after: { main: present, wal: { ...present }, shm: absent },
    };
    refreshManifest(sidecar);
    finalizePacket(sidecar);
    assertSafeError(runPacket(root, sidecar, "sidecar.json"), 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("raw/path sentinel and CLI errors are path-safe with exact blocked effects", () => {
  const root = mkdtempSync(join(tmpdir(), "c00b-cli-"));
  try {
    const packet = makePacket();
    const fakePath = ["C:", "private", "source.db"].join("\\");
    packet.source_authorities[0].source_evidence_authority.evidence_refs = [fakePath];
    const sentinelResult = runPacket(root, packet, "sentinel.json");
    assertSafeError(sentinelResult, 5);
    assert.equal(sentinelResult.stdout.includes(fakePath), false);

    const help = spawnSync(process.execPath, [TOOL, "--help"], { cwd: APP, encoding: "utf8", windowsHide: true });
    assert.equal(help.status, 0, help.stderr || help.stdout);
    assert.match(help.stdout, /--approved-packet-digest <sha256:digest>/);

    const successPacket = makePacket();
    const success = spawnPacket(root, successPacket);
    assert.equal(success.status, 0, success.stderr || success.stdout);
    assert.equal(success.stderr, "");
    assert.equal(success.stdout.includes(success.packetPath), false);

    const malformedPath = join(root, "malformed.json");
    writeFileSync(malformedPath, "{", "utf8");
    const malformed = spawnSync(process.execPath, [
      TOOL, "--query-only", "--json", "--packet", malformedPath,
      "--approved-packet-digest", successPacket.packet_digest,
    ], { cwd: APP, encoding: "utf8", windowsHide: true });
    assertSafeError({ ...malformed, packetPath: malformedPath }, 2);

    const missingPath = join(root, "missing.json");
    const missing = spawnSync(process.execPath, [
      TOOL, "--query-only", "--json", "--packet", missingPath,
      "--approved-packet-digest", successPacket.packet_digest,
    ], { cwd: APP, encoding: "utf8", windowsHide: true });
    assertSafeError({ ...missing, packetPath: missingPath }, 6);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hard-bound frozen C00Q blob and SHA-256 constants match tracked bytes", () => {
  for (const [path, blobKey, digestKey] of [
    [C00Q_TOOL, "tool_blob", "tool_digest"],
    [C00Q_TEST, "test_blob", "test_digest"],
    [C00Q_SCHEMA, "schema_blob", "schema_digest"],
  ]) {
    const bytes = readFileSync(path);
    const blob = createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex");
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    assert.equal(blob, FROZEN[blobKey]);
    assert.equal(digest, FROZEN[digestKey]);
  }
});

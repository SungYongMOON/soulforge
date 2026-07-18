import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildInventoryManifest } from "../tools/task_engine_inventory.mjs";
import {
  buildC00BPacket,
  buildBindingProposal,
  buildPrivateDescriptor,
  buildSafeAggregateEvidence,
  computePrivateArtifactAllowlistDigest,
  computePrivateOutputRootDigest,
  runBindingProducerCli,
} from "../tools/task_engine_inventory_c00b_binding_producer.mjs";
import { judgeC00BPacket } from "../tools/task_engine_inventory_c00b_judge.mjs";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default;
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = dirname(HERE);
const INPUT_SCHEMA_PATH = join(APP, "docs", "contracts", "task_engine_inventory_c00b_binding_input.v1.schema.json");
const AGGREGATE_SCHEMA_PATH = join(APP, "docs", "contracts", "task_engine_inventory_safe_aggregate_evidence.v1.schema.json");
const EVALUATION_TIME = "2026-07-16T12:00:00+09:00";
const EXPIRES_AT = "2026-07-16T18:00:00+09:00";
const ISSUED_AT = "2026-07-16T09:00:00+09:00";
const PROOFS = ["C00-LIVE-01", "C00-LIVE-02", "C00-LIVE-03", "C00-LIVE-04"];
const LANES = ["mail", "voice", "structured_pc_work", "file", "run_log"];
const EMPTY_DIGEST = `sha256:${"0".repeat(64)}`;
const SET_ARRAY_KEYS = new Set([
  "baseline_refs", "source_authority_refs", "source_refs", "proof_scope", "evidence_refs",
  "expected_sources", "required_live_proofs", "unresolved_live_proofs", "raw_sentinel_violations",
]);

function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const rows = value.map((entry) => canonicalize(entry));
    if (SET_ARRAY_KEYS.has(key) || rows.every((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry))) {
      return rows.sort((left, right) => {
        const a = JSON.stringify(left);
        const b = JSON.stringify(right);
        return a < b ? -1 : a > b ? 1 : 0;
      });
    }
    return rows;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((childKey) => [childKey, canonicalize(value[childKey], childKey)]));
}

function digestValue(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}`;
}

function redigestManifest(manifest) {
  const body = structuredClone(manifest);
  delete body.manifest_digest;
  manifest.manifest_digest = digestValue(body);
  return manifest;
}

function approval(ref, authorityKind, boundEvidenceDigest = undefined) {
  const value = {
    approval_ref: ref,
    authority_kind: authorityKind,
    bound_packet_digest: EMPTY_DIGEST,
    issued_at: ISSUED_AT,
    expires_at: EXPIRES_AT,
    revoked: false,
    revocation_ref: `revocation_${ref}`,
  };
  if (boundEvidenceDigest !== undefined) value.bound_evidence_digest = boundEvidenceDigest;
  return value;
}

function source(lane) {
  const authorityRef = `source_authority_${lane}`;
  return {
    lane,
    source_ref: `source_${lane}`,
    requirement: "required",
    applicability_ref: null,
    adapter_id: "attested_metadata_v1",
    adapter_version: "v1",
    authority: {
      source_authority_ref: authorityRef,
      issued_at: ISSUED_AT,
      expires_at: EXPIRES_AT,
      proof_scope: [...PROOFS],
      evidence_refs: [`evidence_${lane}`],
    },
    inventory: {
      profile: "authorized_observation",
      physical_owner_ref: `owner_${lane}`,
      default_root_ref: `root_${lane}`,
      writer_candidates: [`writer_${lane}`],
      direct_caller_candidates: [`caller_${lane}`],
      consumer_candidates: [`consumer_${lane}`],
      source_availability_summary: "available",
    },
    max_runtime_ms: 1000,
    max_result_rows: 100,
    source_evidence_authority: {
      authority_ref: authorityRef,
      authority_kind: "c00b_source_evidence",
      bound_packet_digest: EMPTY_DIGEST,
      bound_source_contract_digest: EMPTY_DIGEST,
      issued_at: ISSUED_AT,
      expires_at: EXPIRES_AT,
      revoked: false,
      revocation_ref: `revocation_${authorityRef}`,
      proof_scope: [...PROOFS],
      evidence_refs: [`evidence_${lane}`],
    },
    quiescence: {
      method: "no_source_opened_attested",
      authority_ref: `quiescence_${lane}`,
      authority_kind: "c00b_source_quiescence",
      bound_packet_digest: EMPTY_DIGEST,
      bound_source_contract_digest: EMPTY_DIGEST,
      issued_at: ISSUED_AT,
      expires_at: EXPIRES_AT,
      revoked: false,
      revocation_ref: `revocation_quiescence_${lane}`,
    },
  };
}

function observation(lane) {
  return {
    source_ref: `source_${lane}`,
    evidence_kind: "authority_attested",
    observed_at: EVALUATION_TIME,
    business_freshness_basis: "authority_attested_success_time",
    authority_ref: `source_authority_${lane}`,
    evidence_refs: [`evidence_${lane}`],
    aggregate_counts: [{ metric_ref: `count_${lane}`, count: 3 }],
    last_success_at: "2026-07-16T11:30:00+09:00",
    watermark_at: null,
    gap_codes: [],
    max_stale_sec: 3600,
    raw_row_read_count: 0,
    raw_payload_copied: false,
  };
}

function makeInput() {
  const c00aDigest = `sha256:${"1".repeat(64)}`;
  const c00qDigest = `sha256:${"2".repeat(64)}`;
  const sources = LANES.map(source);
  const input = {
    schema_version: "soulforge.task_engine_inventory_c00b_binding_input.v1",
    evaluation_time: EVALUATION_TIME,
    baseline: {
      baseline_refs: ["baseline_c00b_binding"],
      head_commit: "a".repeat(40),
      origin_main_commit: "a".repeat(40),
      clean: true,
    },
    prerequisites: {
      c00a_receipt_ref: "c00a_blocker_receipt",
      c00a_receipt_digest: c00aDigest,
      c00a_acceptance: approval("approval_c00a", "c00a_acceptance", c00aDigest),
      c00q_full_bv_receipt_ref: "c00q_full_bv_receipt",
      c00q_full_bv_receipt_digest: c00qDigest,
      packet_id: "TEAX-C00A",
      result: "BLOCKED",
      exit_code: 3,
      required_live_proofs: [...PROOFS],
      unresolved_live_proofs: [...PROOFS],
      tracked_zero_mutation: true,
      raw_sentinel_violations: [],
      p1_unlocked: false,
    },
    executor: {
      node_identity_ref: "executor_primary",
      bootstrap_profile: "owner-with-state",
      inventory_authority: approval("approval_inventory", "c00b_inventory"),
    },
    approvals: {
      c00q_acceptance: approval("approval_c00q", "c00q_acceptance", c00qDigest),
      c00b_execution: approval("approval_c00b_execution", "c00b_execution"),
      c00b_judge: approval("approval_c00b_judge", "c00b_judge"),
    },
    sources,
    output: {
      mode: "stdout_only",
      durable_writes: 0,
      field_allowlist_ref: "c00b_receipt_field_allowlist",
      retention_ref: "c00b_stdout_ephemeral_retention",
    },
    binding_grant: {
      grant_ref: "owner_c00b_binding_grant",
      binding_state: "proposed",
      digest_binding_approved: false,
      descriptor_binding_state: "proposed",
      descriptor_materialization_approved: false,
      approved_packet_digest: EMPTY_DIGEST,
      descriptor_digest: EMPTY_DIGEST,
      aggregate_evidence_digest: EMPTY_DIGEST,
      authority_set_digest: EMPTY_DIGEST,
      private_output_root_digest: EMPTY_DIGEST,
      artifact_write_allowlist_digest: computePrivateArtifactAllowlistDigest(),
      authority_refs: [],
      issued_at: ISSUED_AT,
      expires_at: EXPIRES_AT,
      revoked: false,
      revocation_ref: "revocation_owner_c00b_binding_grant",
    },
    aggregate_observations: LANES.map(observation),
    raw_payload_copied: false,
  };
  input.binding_grant.authority_refs = [
    input.prerequisites.c00a_acceptance.approval_ref,
    input.executor.inventory_authority.approval_ref,
    ...Object.values(input.approvals).map((entry) => entry.approval_ref),
    ...sources.flatMap((entry) => [entry.source_evidence_authority.authority_ref, entry.quiescence.authority_ref]),
  ];
  return input;
}

function bindOutputRoot(input, root) {
  input.binding_grant.private_output_root_digest = computePrivateOutputRootDigest(root);
}

function bindInput(input, manifest) {
  const initialProposal = buildBindingProposal(input, manifest);
  const aggregateCarrier = `aggregate:${initialProposal.aggregate_evidence_digest.slice("sha256:".length)}`;
  for (const entry of input.sources) entry.source_evidence_authority.evidence_refs.push(aggregateCarrier);
  const proposal = buildBindingProposal(input, manifest);
  input.binding_grant.approved_packet_digest = proposal.packet_digest;
  input.binding_grant.descriptor_digest = proposal.descriptor_digest;
  input.binding_grant.aggregate_evidence_digest = proposal.aggregate_evidence_digest;
  input.binding_grant.authority_set_digest = proposal.authority_set_digest;
  input.binding_grant.binding_state = "approved";
  input.binding_grant.digest_binding_approved = true;
  input.binding_grant.descriptor_binding_state = "approved";
  input.binding_grant.descriptor_materialization_approved = true;
  const authorities = [
    input.prerequisites.c00a_acceptance,
    input.executor.inventory_authority,
    ...Object.values(input.approvals),
    ...input.sources.flatMap((entry) => [entry.source_evidence_authority, entry.quiescence]),
  ];
  for (const authority of authorities) authority.bound_packet_digest = proposal.packet_digest;
  const contracts = new Map(proposal.source_contracts.map((entry) => [entry.source_ref, entry.source_contract_digest]));
  for (const entry of input.sources) {
    entry.source_evidence_authority.bound_source_contract_digest = contracts.get(entry.source_ref);
    entry.quiescence.bound_source_contract_digest = contracts.get(entry.source_ref);
  }
  return proposal;
}

function approveDescriptorInput(input, manifest) {
  const proposal = buildBindingProposal(input, manifest);
  input.binding_grant.descriptor_binding_state = "approved";
  input.binding_grant.descriptor_materialization_approved = true;
  input.binding_grant.descriptor_digest = proposal.descriptor_digest;
  input.binding_grant.aggregate_evidence_digest = proposal.aggregate_evidence_digest;
  return proposal;
}

test("strict public schemas accept a structural binding proposal and aggregate packet", () => {
  const inputSchema = JSON.parse(readFileSync(INPUT_SCHEMA_PATH, "utf8"));
  const aggregateSchema = JSON.parse(readFileSync(AGGREGATE_SCHEMA_PATH, "utf8"));
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const validateInput = ajv.compile(inputSchema);
  const validateAggregate = ajv.compile(aggregateSchema);
  const input = makeInput();
  const aggregate = buildSafeAggregateEvidence(input);
  assert.equal(validateInput(input), true, JSON.stringify(validateInput.errors));
  assert.equal(validateAggregate(aggregate), true, JSON.stringify(validateAggregate.errors));
  assert.match(aggregate.evidence_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(aggregate.raw_row_read_count, 0);
  assert.equal(aggregate.raw_payload_copied, false);
});

test("producer creates a frozen-compatible descriptor and C00B packet without opening a source", () => {
  const input = makeInput();
  const descriptor = buildPrivateDescriptor(input);
  const manifest = buildInventoryManifest(descriptor);
  const initialProposal = buildBindingProposal(input, manifest);
  assert.match(initialProposal.aggregate_evidence_digest, /^sha256:[a-f0-9]{64}$/);
  assert.throws(() => buildC00BPacket(input, manifest), /aggregate_evidence_carrier_missing/);
  const proposal = bindInput(input, manifest);
  const packet = buildC00BPacket(input, manifest);
  const receipt = judgeC00BPacket(packet, packet.packet_digest);
  assert.equal(receipt.result, "PASS");
  assert.equal(receipt.query_only, true);
  assert.equal(receipt.zero_mutation_confirmed, true);
  assert.deepEqual(receipt.unresolved_live_proofs, []);
  assert.equal(receipt.next_gate, "TEAX-H00_RATIFICATION");
  assert.equal(receipt.p1_adapter_execution_unlocked, false);
  assert.equal(receipt.writer_or_activation_authority_created, false);
  const aggregateCarrier = `aggregate:${proposal.aggregate_evidence_digest.slice("sha256:".length)}`;
  assert.ok(packet.source_authorities.every((entry) => entry.source_evidence_authority.evidence_refs.includes(aggregateCarrier)));
  assert.equal(manifest.table_counts.length, 0);
  assert.ok(manifest.zero_mutation.sources.every((entry) => entry.method === "no_source_opened"));

});

test("final packet rejects a wrong aggregate evidence carrier", () => {
  const input = makeInput();
  const manifest = buildInventoryManifest(buildPrivateDescriptor(input));
  for (const entry of input.sources) entry.source_evidence_authority.evidence_refs.push(`aggregate:${"f".repeat(64)}`);
  assert.throws(() => buildC00BPacket(input, manifest), /aggregate_evidence_carrier_mismatch/);
});

test("descriptor CLI writes only explicit private outputs and never echoes locators or paths", () => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-c00b-binding-"));
  try {
    const input = makeInput();
    bindOutputRoot(input, root);
    const descriptorForBinding = buildPrivateDescriptor(input);
    const manifestForBinding = buildInventoryManifest(descriptorForBinding);
    approveDescriptorInput(input, manifestForBinding);
    const bindingPath = join(root, "binding.json");
    const descriptorPath = join(root, "task_engine_inventory_c00q_descriptor_v1.json");
    const aggregatePath = join(root, "task_engine_inventory_safe_aggregate_evidence_v1.json");
    writeFileSync(bindingPath, JSON.stringify(input), "utf8");
    const result = runBindingProducerCli([
      "--query-only", "--json", "--mode", "descriptor", "--binding", bindingPath, "--output-root", root,
      "--descriptor-output", descriptorPath, "--aggregate-output", aggregatePath,
    ]);
    assert.equal(result.exitCode, 0, result.output);
    const receipt = JSON.parse(result.output);
    assert.equal(receipt.files_written, 2);
    assert.equal(receipt.raw_payload_copied, false);
    assert.doesNotMatch(result.output, /task-engine-c00b-binding|binding\.json|descriptor_v1\.json|aggregate_evidence_v1\.json/i);
    assert.equal(JSON.parse(readFileSync(descriptorPath, "utf8")).sources.length, 5);
    assert.equal(JSON.parse(readFileSync(aggregatePath, "utf8")).observations.length, 5);
    const manifestPath = join(root, "manifest.json");
    const packetPath = join(root, "task_engine_inventory_c00b_judge_packet_v1.json");
    bindInput(input, manifestForBinding);
    writeFileSync(bindingPath, JSON.stringify(input), "utf8");
    writeFileSync(manifestPath, JSON.stringify(manifestForBinding), "utf8");
    const packetResult = runBindingProducerCli([
      "--query-only", "--json", "--mode", "packet", "--binding", bindingPath, "--output-root", root,
      "--manifest", manifestPath, "--packet-output", packetPath,
    ]);
    assert.equal(packetResult.exitCode, 0, packetResult.output);
    const packet = JSON.parse(readFileSync(packetPath, "utf8"));
    assert.equal(judgeC00BPacket(packet, packet.packet_digest).result, "PASS");
    assert.equal(readdirSync(root).some((name) => name.includes(".tmp-")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("proposed binding cannot materialize descriptor or aggregate artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-c00b-binding-"));
  try {
    const input = makeInput();
    bindOutputRoot(input, root);
    const bindingPath = join(root, "binding.json");
    const descriptorPath = join(root, "task_engine_inventory_c00q_descriptor_v1.json");
    const aggregatePath = join(root, "task_engine_inventory_safe_aggregate_evidence_v1.json");
    writeFileSync(bindingPath, JSON.stringify(input), "utf8");
    const result = runBindingProducerCli([
      "--query-only", "--json", "--mode", "descriptor", "--binding", bindingPath, "--output-root", root,
      "--descriptor-output", descriptorPath, "--aggregate-output", aggregatePath,
    ]);
    assert.equal(result.exitCode, 3);
    assert.equal(JSON.parse(result.output).files_written, 0);
    assert.throws(() => readFileSync(descriptorPath, "utf8"));
    assert.throws(() => readFileSync(aggregatePath, "utf8"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("incomplete binding grant and freshness gaps fail closed before packet output", () => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-c00b-binding-"));
  try {
    const input = makeInput();
    input.binding_grant.authority_refs.pop();
    assert.throws(() => buildPrivateDescriptor(input), /binding_grant_incomplete/);

    const gapInput = makeInput();
    bindOutputRoot(gapInput, root);
    gapInput.aggregate_observations[0] = {
      ...gapInput.aggregate_observations[0],
      evidence_kind: "authority_attested_gap",
      business_freshness_basis: "not_established",
      aggregate_counts: [],
      last_success_at: null,
      gap_codes: ["source_locator_missing"],
    };
    const descriptor = buildPrivateDescriptor(gapInput);
    const manifest = buildInventoryManifest(descriptor);
    bindInput(gapInput, manifest);
    assert.throws(() => buildC00BPacket(gapInput, manifest), /business_freshness_not_established/);

    const bindingPath = join(root, "gap-binding.json");
    const manifestPath = join(root, "manifest.json");
    const packetPath = join(root, "task_engine_inventory_c00b_judge_packet_v1.json");
    writeFileSync(bindingPath, JSON.stringify(gapInput), "utf8");
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
    const result = runBindingProducerCli([
      "--query-only", "--json", "--mode", "packet", "--binding", bindingPath, "--output-root", root,
      "--manifest", manifestPath, "--packet-output", packetPath,
    ]);
    assert.equal(result.exitCode, 3);
    assert.equal(JSON.parse(result.output).files_written, 0);
    assert.throws(() => readFileSync(packetPath, "utf8"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("manifest aggregates are confined to the source adapter and exact query allowlist", () => {
  const input = makeInput();
  const descriptor = buildPrivateDescriptor(input);
  const manifest = buildInventoryManifest(descriptor);
  const tampered = structuredClone(manifest);
  tampered.table_counts.push({ source_ref: "source_mail", table: "UnapprovedTable", count: 1 });
  const body = structuredClone(tampered);
  delete body.manifest_digest;
  tampered.manifest_digest = digestValue(body);
  assert.throws(() => buildBindingProposal(input, tampered), /manifest_adapter_aggregate_mismatch/);
});

test("digest-consistent nested manifest extras fail final preflight before packet write", () => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-c00b-binding-"));
  try {
    const input = makeInput();
    bindOutputRoot(input, root);
    const manifest = buildInventoryManifest(buildPrivateDescriptor(input));
    manifest.lanes.mail.cloned_extra = "safe_value";
    redigestManifest(manifest);
    bindInput(input, manifest);
    assert.throws(() => buildC00BPacket(input, manifest), /packet_judge_preflight_failed/);

    const bindingPath = join(root, "binding.json");
    const manifestPath = join(root, "manifest.json");
    const packetPath = join(root, "task_engine_inventory_c00b_judge_packet_v1.json");
    writeFileSync(bindingPath, JSON.stringify(input), "utf8");
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
    const result = runBindingProducerCli([
      "--query-only", "--json", "--mode", "packet", "--binding", bindingPath, "--output-root", root,
      "--manifest", manifestPath, "--packet-output", packetPath,
    ]);
    assert.equal(result.exitCode, 4);
    assert.equal(JSON.parse(result.output).files_written, 0);
    assert.throws(() => readFileSync(packetPath, "utf8"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("digest-consistent manifest extras and path or secret reflection fail closed", () => {
  const input = makeInput();
  const manifest = buildInventoryManifest(buildPrivateDescriptor(input));

  const extra = redigestManifest({ ...structuredClone(manifest), cloned_extra: "safe_value" });
  assert.throws(() => buildBindingProposal(input, extra), /binding_input_invalid/);

  const syntheticWindowsPath = "C:" + "\\private\\manifest.json";
  const pathReflection = redigestManifest({ ...structuredClone(manifest), note: syntheticWindowsPath });
  assert.throws(() => buildBindingProposal(input, pathReflection), /raw_path_secret_sentinel/);

  const secretReflection = redigestManifest({ ...structuredClone(manifest), secret_token: "do-not-reflect" });
  assert.throws(() => buildBindingProposal(input, secretReflection), /raw_path_secret_sentinel/);

  const token = `ghp_${"a".repeat(36)}`;
  const tokenReflection = structuredClone(manifest);
  tokenReflection.lanes.mail.source_refs[0] = token;
  redigestManifest(tokenReflection);
  assert.throws(() => buildBindingProposal(input, tokenReflection), /raw_path_secret_sentinel/);

  const root = mkdtempSync(join(tmpdir(), "task-engine-c00b-binding-"));
  try {
    bindOutputRoot(input, root);
    const bindingPath = join(root, "binding.json");
    const manifestPath = join(root, "manifest.json");
    const packetPath = join(root, "task_engine_inventory_c00b_judge_packet_v1.json");
    writeFileSync(bindingPath, JSON.stringify(input), "utf8");
    writeFileSync(manifestPath, JSON.stringify(pathReflection), "utf8");
    const result = runBindingProducerCli([
      "--query-only", "--json", "--mode", "packet", "--binding", bindingPath, "--output-root", root,
      "--manifest", manifestPath, "--packet-output", packetPath,
    ]);
    assert.equal(result.exitCode, 5);
    assert.equal(JSON.parse(result.output).files_written, 0);
    assert.doesNotMatch(result.output, /private|manifest\.json/i);
    assert.throws(() => readFileSync(packetPath, "utf8"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("future, stale, and authority-detached freshness evidence fail closed", () => {
  const future = makeInput();
  future.aggregate_observations[0].observed_at = "2026-07-16T12:00:01+09:00";
  assert.throws(() => buildPrivateDescriptor(future), /aggregate_chronology_invalid/);

  const stale = makeInput();
  stale.aggregate_observations[0].last_success_at = "2026-07-16T10:00:00+09:00";
  stale.aggregate_observations[0].max_stale_sec = 3599;
  assert.throws(() => buildPrivateDescriptor(stale), /business_freshness_stale/);

  const detached = makeInput();
  detached.aggregate_observations[0].evidence_refs = ["detached_evidence"];
  assert.throws(() => buildPrivateDescriptor(detached), /aggregate_evidence_ref_mismatch/);

  const basisMissing = makeInput();
  basisMissing.aggregate_observations[0].last_success_at = null;
  basisMissing.aggregate_observations[0].watermark_at = EVALUATION_TIME;
  assert.throws(() => buildPrivateDescriptor(basisMissing), /business_freshness_basis_field_missing/);

  const masked = makeInput();
  masked.aggregate_observations[0].last_success_at = "2026-07-16T10:00:00+09:00";
  masked.aggregate_observations[0].watermark_at = EVALUATION_TIME;
  assert.throws(() => buildPrivateDescriptor(masked), /business_freshness_stale/);
});

test("approval clocks and impossible calendar timestamps fail closed at the producer", () => {
  const expired = makeInput();
  expired.approvals.c00b_execution.expires_at = EVALUATION_TIME;
  assert.throws(() => buildPrivateDescriptor(expired), /approval_inactive_or_wrong_kind/);

  const notYetIssued = makeInput();
  notYetIssued.executor.inventory_authority.issued_at = "2026-07-16T12:00:01+09:00";
  assert.throws(() => buildPrivateDescriptor(notYetIssued), /approval_inactive_or_wrong_kind/);

  const impossible = makeInput();
  impossible.evaluation_time = "2026-02-30T12:00:00+09:00";
  assert.throws(() => buildPrivateDescriptor(impossible), /timestamp_invalid/);
});

test("output containment resolves junction parents and no-overwrite remains fail closed", () => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-c00b-binding-root-"));
  const outside = mkdtempSync(join(tmpdir(), "task-engine-c00b-binding-outside-"));
  try {
    const input = makeInput();
    bindOutputRoot(input, root);
    const approvedDescriptor = buildPrivateDescriptor(input);
    const approvedManifest = buildInventoryManifest(approvedDescriptor);
    bindInput(input, approvedManifest);
    const bindingPath = join(root, "binding.json");
    writeFileSync(bindingPath, JSON.stringify(input), "utf8");
    const link = join(root, "escape");
    symlinkSync(outside, link, "junction");
    const escapedDescriptor = join(link, "task_engine_inventory_c00q_descriptor_v1.json");
    const escapedAggregate = join(link, "task_engine_inventory_safe_aggregate_evidence_v1.json");
    const escaped = runBindingProducerCli([
      "--query-only", "--json", "--mode", "descriptor", "--binding", bindingPath, "--output-root", root,
      "--descriptor-output", escapedDescriptor, "--aggregate-output", escapedAggregate,
    ]);
    assert.equal(escaped.exitCode, 4);
    assert.throws(() => readFileSync(join(outside, "task_engine_inventory_c00q_descriptor_v1.json"), "utf8"));

    const descriptorPath = join(root, "task_engine_inventory_c00q_descriptor_v1.json");
    const aggregatePath = join(root, "task_engine_inventory_safe_aggregate_evidence_v1.json");
    writeFileSync(descriptorPath, "owner-preserved", "utf8");
    const existing = runBindingProducerCli([
      "--query-only", "--json", "--mode", "descriptor", "--binding", bindingPath, "--output-root", root,
      "--descriptor-output", descriptorPath, "--aggregate-output", aggregatePath,
    ]);
    assert.equal(existing.exitCode, 6);
    assert.equal(readFileSync(descriptorPath, "utf8"), "owner-preserved");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("raw payload and secret-shaped input are rejected without reflection", () => {
  const input = makeInput();
  input.raw_payload_copied = true;
  assert.throws(() => buildPrivateDescriptor(input), /raw_path_secret_sentinel/);
  const secretInput = makeInput();
  secretInput.binding_grant.secret_token = "do-not-reflect";
  const root = mkdtempSync(join(tmpdir(), "task-engine-c00b-binding-"));
  try {
    bindOutputRoot(secretInput, root);
    const bindingPath = join(root, "binding.json");
    const descriptorPath = join(root, "task_engine_inventory_c00q_descriptor_v1.json");
    const aggregatePath = join(root, "task_engine_inventory_safe_aggregate_evidence_v1.json");
    writeFileSync(bindingPath, JSON.stringify(secretInput), "utf8");
    const result = runBindingProducerCli([
      "--query-only", "--json", "--mode", "descriptor", "--binding", bindingPath, "--output-root", root,
      "--descriptor-output", descriptorPath, "--aggregate-output", aggregatePath,
    ]);
    assert.equal(result.exitCode, 5);
    assert.doesNotMatch(result.output, /do-not-reflect|secret_token/);

    const tokens = [
      `ghp_${"a".repeat(36)}`,
      `github_pat_${"b".repeat(24)}`,
      `xoxb-${"c".repeat(20)}`,
      `AKIA${"D".repeat(16)}`,
    ];
    for (const token of tokens) {
      const tokenInput = makeInput();
      tokenInput.sources[0].source_ref = token;
      assert.throws(() => buildPrivateDescriptor(tokenInput), /raw_path_secret_sentinel/);
    }
    const tokenInput = makeInput();
    const token = tokens[0];
    tokenInput.sources[0].source_ref = token;
    bindOutputRoot(tokenInput, root);
    writeFileSync(bindingPath, JSON.stringify(tokenInput), "utf8");
    const tokenResult = runBindingProducerCli([
      "--query-only", "--json", "--mode", "descriptor", "--binding", bindingPath, "--output-root", root,
      "--descriptor-output", descriptorPath, "--aggregate-output", aggregatePath,
    ]);
    assert.equal(tokenResult.exitCode, 5);
    assert.doesNotMatch(tokenResult.output, new RegExp(token));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalEvidenceJson } from "../../../../guild_hall/ai_usage_meter/evidence_ledger.mjs";
import {
  ALLOWED_AUTHORITY_LEVELS,
  ALLOWED_COMPENSATION_MODES,
  ALLOWED_CREATE_ACTIONS,
  ALLOWED_READBACK_MODES,
  ALLOWED_STOP_CONDITIONS,
  CANARY_HOLD_CODES as C,
  CANARY_PACKET_SCHEMA,
  CANARY_POLICY_REVISION,
  CANARY_RECEIPT_SCHEMA,
  MIN_C5_SAMPLE_COUNT,
  createInMemoryCanaryClaimStore,
  createSyntheticMutationAdapter,
  evaluateCreateOnlyCanary,
} from "../src/voice_first_mutation_canary_gate.mjs";

const DOMAIN = Object.freeze({
  tuple: "soulforge.voice_first_mutation_canary.tuple.v1",
  approval: "soulforge.voice_first_mutation_canary.owner_approval.v1",
  c5: "soulforge.voice_first_mutation_canary.c5_evidence.v1",
  state: "soulforge.voice_first_mutation_canary.synthetic_state.v1",
});
const hash = (content) => `sha256:${createHash("sha256").update(canonicalEvidenceJson(content)).digest("hex")}`;
const domainHash = (domain, content) => hash({ domain, content });
const digest = (char) => `sha256:${char.repeat(64)}`;
const omit = (value, field) => { const copy = { ...value }; delete copy[field]; return copy; };
const terminalState = (mode) => mode === "void_created_synthetic_object" ? "voided" : "superseded";

function expectedState({ objectRef, revision, writerEpoch, fencingDigest, state, tuple, payload, compensationMode, priorCreatedDigest }) {
  const content = {
    exists: true,
    object_ref: objectRef,
    revision,
    last_writer_epoch: writerEpoch,
    last_writer_fencing_token_digest: fencingDigest,
    state,
    ...(tuple === undefined ? {} : tuple),
    ...(payload === undefined ? {} : { payload }),
    ...(compensationMode === undefined ? {} : { compensation_mode: compensationMode }),
    ...(priorCreatedDigest === undefined ? {} : { prior_created_digest: priorCreatedDigest }),
  };
  return { ...content, digest: domainHash(DOMAIN.state, content) };
}

function packet(overrides = {}) {
  const tuple = {
    project_ref: "project_alpha_001",
    task_type: "candidate_proposal",
    action: "create_draft_candidate",
    authority: "bounded_create_only",
    policy_revision: CANARY_POLICY_REVISION,
    ...(overrides.canary_tuple ?? {}),
  };
  const payload = {
    item_id: "candidate_item_001",
    item_type: "draft_task_proposal",
    summary: "Bounded synthetic draft proposal",
    evidence_refs: ["evidence_canary_01", "evidence_canary_02"],
    ...(overrides.target_payload ?? {}),
  };
  const writer = {
    coordinator_ref: "coordinator_voice_001",
    writer_identity_ref: "writer_synthetic_001",
    epoch: 1,
    fencing_token_ref: "fence_ref_001",
    fencing_token_digest: digest("c"),
    expected_revision: 0,
    idempotency_key: "idem_canary_001",
    project_ref: tuple.project_ref,
    action: tuple.action,
    erp_second_writer_enabled: false,
    provider_second_writer_enabled: false,
    ...(overrides.sole_coordinator_writer ?? {}),
  };
  const created = expectedState({ objectRef: payload.item_id, revision: writer.expected_revision + 1, writerEpoch: writer.epoch, fencingDigest: writer.fencing_token_digest, state: "created", tuple, payload });
  const readback = {
    target_object_ref: payload.item_id,
    expected_revision: created.revision,
    expected_digest: created.digest,
    readback_mode: "exact_digest_readback",
    ...(overrides.readback_contract ?? {}),
  };
  const compensationMode = overrides.compensating_rollback_plan?.compensation_mode ?? "void_created_synthetic_object";
  const compensated = expectedState({ objectRef: payload.item_id, revision: created.revision + 1, writerEpoch: writer.epoch, fencingDigest: writer.fencing_token_digest, state: terminalState(compensationMode), tuple, compensationMode, priorCreatedDigest: created.digest });
  const plan = {
    rollback_plan_ref: "compensation_plan_001",
    owner_selected_action_ref: "compensate_draft_001",
    compensation_mode: compensationMode,
    is_destructive_delete: false,
    is_archive: false,
    expected_compensated_state_digest: compensated.digest,
    ...(overrides.compensating_rollback_plan ?? {}),
  };
  const c5Body = {
    accepted_generation_ref: "generation_accepted_001",
    shadow_quality_receipt_ref: "shadow_receipt_001",
    observed_at: "2026-08-21T21:00:00.000Z",
    adjudicated_window: { start_at: "2026-08-21T20:00:00.000Z", end_at: "2026-08-21T21:00:00.000Z", sample_count: MIN_C5_SAMPLE_COUNT },
    no_action_stability_rate: 1,
    required_source_coverage_rate: 1,
    unauthorized_effects_count: 0,
    cross_project_effects_count: 0,
    policy_revision: CANARY_POLICY_REVISION,
    is_synthetic_fixture: true,
    ...(overrides.c5_evidence ?? {}),
  };
  let c5 = { ...c5Body, shadow_quality_digest: "" };
  c5 = { ...c5, shadow_quality_digest: domainHash(DOMAIN.c5, omit(c5, "shadow_quality_digest")) };
  if (overrides.c5_evidence?.shadow_quality_digest) c5.shadow_quality_digest = overrides.c5_evidence.shadow_quality_digest;
  const approvalBody = {
    approval_ref: "approval_owner_001",
    bound_tuple_digest: domainHash(DOMAIN.tuple, tuple),
    time_window: { valid_from: "2026-08-21T21:00:00.000Z", valid_to: "2026-08-21T23:00:00.000Z", observed_at: "2026-08-21T21:30:00.000Z" },
    rate_cap: 1,
    synthetic_adapter_ref: "adp_synth_in_memory_01",
    stop_conditions: [...ALLOWED_STOP_CONDITIONS],
    ...(overrides.owner_approval ?? {}),
  };
  let approval = { ...approvalBody, approval_digest: "" };
  approval = { ...approval, approval_digest: domainHash(DOMAIN.approval, omit(approval, "approval_digest")) };
  if (overrides.owner_approval?.approval_digest) approval.approval_digest = overrides.owner_approval.approval_digest;
  return {
    schema_version: CANARY_PACKET_SCHEMA,
    canary_id: "canary_synthetic_001",
    canary_tuple: tuple,
    owner_approval: approval,
    c5_evidence: c5,
    sole_coordinator_writer: writer,
    readback_contract: readback,
    compensating_rollback_plan: plan,
    target_payload: payload,
    promotion_flags: { official_completion: false, worksession_promotion: false, p5_promotion: false, live_acceptance: false, ...(overrides.promotion_flags ?? {}) },
  };
}

function trustedPins(value) {
  return {
    trustedExpectedApprovalPin: { approval_ref: value.owner_approval.approval_ref, approval_digest: value.owner_approval.approval_digest, observed_at: value.owner_approval.time_window.observed_at },
    trustedExpectedC5Pin: { shadow_quality_receipt_ref: value.c5_evidence.shadow_quality_receipt_ref, shadow_quality_digest: value.c5_evidence.shadow_quality_digest, observed_at: value.c5_evidence.observed_at },
  };
}

function options(value, adapter = createSyntheticMutationAdapter(), claimStore = createInMemoryCanaryClaimStore()) {
  return { adapter, claimStore, clock: () => "2026-08-21T21:30:00.000Z", ...trustedPins(value) };
}

function assertHold(result, code) {
  assert.equal(result.status, "HOLD");
  assert.ok(result.hold_codes.includes(code), `expected ${code}, received ${result.hold_codes.join(", ")}`);
}

test("valid canary claims once, creates once, and ends at the non-destructive voided state", async () => {
  const value = packet({ sole_coordinator_writer: { idempotency_key: "idem_green_001" } });
  const adapter = createSyntheticMutationAdapter();
  const result = await evaluateCreateOnlyCanary(value, options(value, adapter));

  assert.equal(result.status, "SYNTHETIC_CANARY_VERIFIED", JSON.stringify(result));
  assert.equal(result.claim_consumed, true);
  assert.equal(result.receipt.schema_version, CANARY_RECEIPT_SCHEMA);
  assert.equal(result.receipt.effect_attestation, "synthetic_adapter_attested");
  assert.equal(result.receipt.claim_ceiling, "synthetic_trusted_pin_consistency");
  assert.equal(result.receipt.verification.compensated_terminal_state, "voided");
  assert.equal(result.receipt.bindings.adapter_ref, "adp_synth_in_memory_01");
  assert.equal(result.receipt.bindings.adapter_kind, "synthetic_in_memory");
  assert.equal(result.receipt.bindings.canary_id, value.canary_id);
  assert.deepEqual(result.receipt.bindings.stop_conditions, [...ALLOWED_STOP_CONDITIONS].sort());
  const finalRead = await adapter.readExact({ object_ref: value.target_payload.item_id });
  assert.equal(finalRead.exists, true);
  assert.equal(finalRead.state, "voided");
  assert.equal(finalRead.digest, value.compensating_rollback_plan.expected_compensated_state_digest);
  const effects = await adapter.getEffects();
  assert.equal(effects.synthetic_creates, 1);
  assert.equal(effects.synthetic_compensations, 2);
  assert.equal(effects.synthetic_readbacks, 4);
});

test("RED fixed: clock and both trusted pins are mandatory before any adapter effect", async () => {
  const value = packet({ sole_coordinator_writer: { idempotency_key: "idem_pins_001" } });
  const adapter = createSyntheticMutationAdapter();
  const result = await evaluateCreateOnlyCanary(value, { adapter, claimStore: createInMemoryCanaryClaimStore() });
  assertHold(result, C.CLOCK_REQUIRED_OR_INVALID);
  assertHold(result, C.TRUSTED_PIN_MISSING_OR_INVALID);
  assert.equal(result.claim_consumed, false);
  assert.equal((await adapter.getEffects()).synthetic_creates, 0);
});

test("recomputes approval and C5 digests and requires exact out-of-packet trusted pins", async () => {
  const value = packet({ sole_coordinator_writer: { idempotency_key: "idem_trusted_001" } });
  const mismatchedPins = { ...options(value), trustedExpectedApprovalPin: { ...trustedPins(value).trustedExpectedApprovalPin, approval_digest: digest("f") } };
  assertHold(await evaluateCreateOnlyCanary(value, mismatchedPins), C.TRUSTED_PIN_MISMATCH);
  const selfDeclared = packet({ owner_approval: { approval_digest: digest("f") }, sole_coordinator_writer: { idempotency_key: "idem_trusted_002" } });
  assertHold(await evaluateCreateOnlyCanary(selfDeclared, options(selfDeclared)), C.OWNER_APPROVAL_DIGEST_MISMATCH);
  const c5Tampered = packet({ c5_evidence: { shadow_quality_digest: digest("e") }, sole_coordinator_writer: { idempotency_key: "idem_trusted_003" } });
  assertHold(await evaluateCreateOnlyCanary(c5Tampered, options(c5Tampered)), C.C5_EVIDENCE_INVALID);
});

test("clock fails closed and C5 evidence must close before approval within its freshness window", async () => {
  const value = packet({ sole_coordinator_writer: { idempotency_key: "idem_time_001" } });
  assertHold(await evaluateCreateOnlyCanary(value, { ...options(value), clock: () => { throw new Error("clock unavailable"); } }), C.CLOCK_REQUIRED_OR_INVALID);
  assertHold(await evaluateCreateOnlyCanary(value, { ...options(value), clock: () => "2026-08-21T23:30:00.000Z" }), C.TIME_WINDOW_INVALID_OR_EXPIRED);
  const stale = packet({ c5_evidence: { observed_at: "2026-08-21T16:00:00.000Z", adjudicated_window: { start_at: "2026-08-21T15:00:00.000Z", end_at: "2026-08-21T16:00:00.000Z", sample_count: MIN_C5_SAMPLE_COUNT } }, sole_coordinator_writer: { idempotency_key: "idem_time_002" } });
  assertHold(await evaluateCreateOnlyCanary(stale, options(stale)), C.C5_RECENCY_INVALID);
});

test("authority action mapping and exact digest readback binding are non-interchangeable", async () => {
  const wrongAuthority = packet({ canary_tuple: { authority: "create_draft_only" }, sole_coordinator_writer: { idempotency_key: "idem_authority_001" } });
  assertHold(await evaluateCreateOnlyCanary(wrongAuthority, options(wrongAuthority)), C.FORBIDDEN_ACTION_OR_AUTHORITY);
  const badMode = packet({ readback_contract: { readback_mode: "legacy_readback_mode" }, sole_coordinator_writer: { idempotency_key: "idem_authority_002" } });
  assertHold(await evaluateCreateOnlyCanary(badMode, options(badMode)), C.READBACK_CONTRACT_INVALID);
  const unboundTarget = packet({ readback_contract: { target_object_ref: "candidate_other_001" }, sole_coordinator_writer: { idempotency_key: "idem_authority_003" } });
  assertHold(await evaluateCreateOnlyCanary(unboundTarget, options(unboundTarget)), C.READBACK_CONTRACT_INVALID);
});

test("initial state must be exact, absent, digest-bound, and CAS/fencing-current before create", async () => {
  const value = packet({ sole_coordinator_writer: { idempotency_key: "idem_initial_001" } });
  const existing = expectedState({ objectRef: value.target_payload.item_id, revision: 0, writerEpoch: 0, fencingDigest: digest("0"), state: "created", payload: { sample: true } });
  const existingAdapter = createSyntheticMutationAdapter({ [value.target_payload.item_id]: existing });
  const existingResult = await evaluateCreateOnlyCanary(value, options(value, existingAdapter));
  assertHold(existingResult, C.INITIAL_STATE_NOT_ABSENT);
  assert.equal((await existingAdapter.getEffects()).synthetic_creates, 0);

  const noDigestAdapter = createSyntheticMutationAdapter();
  noDigestAdapter.readExact = async ({ object_ref: objectRef }) => ({ exists: false, object_ref: objectRef, revision: 0, last_writer_epoch: 0, last_writer_fencing_token_digest: digest("0") });
  const noDigest = await evaluateCreateOnlyCanary(packet({ sole_coordinator_writer: { idempotency_key: "idem_initial_002" } }), options(packet({ sole_coordinator_writer: { idempotency_key: "idem_initial_002" } }), noDigestAdapter));
  assertHold(noDigest, C.INITIAL_READ_INVALID);
  assert.equal((await noDigestAdapter.getEffects()).synthetic_creates, 0);
});

test("synthetic CAS validates stale revision, writer epoch, and echoed fencing token basis", async () => {
  const staleRevision = packet({ sole_coordinator_writer: { idempotency_key: "idem_cas_001" } });
  const initialRevisionOne = { exists: false, object_ref: staleRevision.target_payload.item_id, revision: 1, last_writer_epoch: 0, last_writer_fencing_token_digest: digest("0") };
  initialRevisionOne.digest = domainHash(DOMAIN.state, initialRevisionOne);
  assertHold(await evaluateCreateOnlyCanary(staleRevision, options(staleRevision, createSyntheticMutationAdapter({ [staleRevision.target_payload.item_id]: initialRevisionOne }))), C.CAS_FENCING_MISMATCH);

  const staleEpoch = packet({ sole_coordinator_writer: { idempotency_key: "idem_cas_002" } });
  const initialEpochOne = { exists: false, object_ref: staleEpoch.target_payload.item_id, revision: 0, last_writer_epoch: 1, last_writer_fencing_token_digest: digest("0") };
  initialEpochOne.digest = domainHash(DOMAIN.state, initialEpochOne);
  assertHold(await evaluateCreateOnlyCanary(staleEpoch, options(staleEpoch, createSyntheticMutationAdapter({ [staleEpoch.target_payload.item_id]: initialEpochOne }))), C.CAS_FENCING_MISMATCH);

  const echoMismatch = packet({ sole_coordinator_writer: { idempotency_key: "idem_cas_003" } });
  const echoAdapter = createSyntheticMutationAdapter();
  const create = echoAdapter.createIfAbsent;
  echoAdapter.createIfAbsent = async (params) => {
    const result = await create(params);
    return { ...result, basis: { ...result.basis, fencing_token_digest: digest("f") } };
  };
  assertHold(await evaluateCreateOnlyCanary(echoMismatch, options(echoMismatch, echoAdapter)), C.CAS_FENCING_MISMATCH);
});

test("claimed terminal success and failure replay exactly once without adapter re-execution", async () => {
  const value = packet({ sole_coordinator_writer: { idempotency_key: "idem_replay_success_001" } });
  const adapter = createSyntheticMutationAdapter();
  const claims = createInMemoryCanaryClaimStore();
  const first = await evaluateCreateOnlyCanary(value, options(value, adapter, claims));
  const replayed = await evaluateCreateOnlyCanary(value, options(value, adapter, claims));
  assert.equal(replayed.status, "SYNTHETIC_CANARY_VERIFIED");
  assert.equal(replayed.receipt.receipt_digest, first.receipt.receipt_digest);
  assert.equal((await adapter.getEffects()).synthetic_creates, 1);

  const failedValue = packet({ sole_coordinator_writer: { idempotency_key: "idem_replay_failure_001" } });
  const failureAdapter = createSyntheticMutationAdapter(); let createCalls = 0;
  failureAdapter.createIfAbsent = async () => { createCalls++; return { ok: false, reason: "synthetic collision" }; };
  const failureClaims = createInMemoryCanaryClaimStore();
  const failure1 = await evaluateCreateOnlyCanary(failedValue, options(failedValue, failureAdapter, failureClaims));
  const failure2 = await evaluateCreateOnlyCanary(failedValue, options(failedValue, failureAdapter, failureClaims));
  assertHold(failure1, C.CREATE_FAILED_OR_COLLISION);
  assert.equal(failure1.claim_consumed, true);
  assert.notEqual(failure1.receipt, null);
  assert.equal(failure2.receipt.receipt_digest, failure1.receipt.receipt_digest);
  assert.equal(createCalls, 1);
});

test("atomic tuple claim caps rate at one across different idempotency keys, including a race", async () => {
  const first = packet({ sole_coordinator_writer: { idempotency_key: "idem_rate_first_001" } });
  const second = packet({ sole_coordinator_writer: { idempotency_key: "idem_rate_second_001" } });
  const adapter = createSyntheticMutationAdapter(); const claims = createInMemoryCanaryClaimStore();
  const [firstResult, secondResult] = await Promise.all([
    evaluateCreateOnlyCanary(first, options(first, adapter, claims)),
    evaluateCreateOnlyCanary(second, options(second, adapter, claims)),
  ]);
  assert.equal(firstResult.status, "SYNTHETIC_CANARY_VERIFIED");
  assertHold(secondResult, C.RATE_CAP_EXCEEDED);
  assert.equal(secondResult.claim_consumed, false);
  assert.equal((await adapter.getEffects()).synthetic_creates, 1);
});

test("rate claim binds the approval window, while an adapter must declare is_live false", async () => {
  const claims = createInMemoryCanaryClaimStore();
  const first = packet({ sole_coordinator_writer: { idempotency_key: "idem_window_first_001" } });
  const second = packet({ owner_approval: { approval_ref: "approval_owner_002" }, sole_coordinator_writer: { idempotency_key: "idem_window_second_001" } });
  assert.equal((await evaluateCreateOnlyCanary(first, options(first, createSyntheticMutationAdapter(), claims))).status, "SYNTHETIC_CANARY_VERIFIED");
  assert.equal((await evaluateCreateOnlyCanary(second, options(second, createSyntheticMutationAdapter(), claims))).status, "SYNTHETIC_CANARY_VERIFIED");
  const noLiveFlag = createSyntheticMutationAdapter();
  noLiveFlag.is_live = undefined;
  const noLiveFlagPacket = packet({ sole_coordinator_writer: { idempotency_key: "idem_window_live_001" } });
  assertHold(await evaluateCreateOnlyCanary(noLiveFlagPacket, options(noLiveFlagPacket, noLiveFlag)), C.UNTRUSTED_OR_LIVE_ADAPTER);
});

test("destructive compensation has a precise code and terminal compensation remains idempotent", async () => {
  const destructive = packet({ compensating_rollback_plan: { is_destructive_delete: true }, sole_coordinator_writer: { idempotency_key: "idem_destroy_001" } });
  assertHold(await evaluateCreateOnlyCanary(destructive, options(destructive)), C.DESTRUCTIVE_COMPENSATION_FORBIDDEN);
  const deleteMode = packet({ compensating_rollback_plan: { compensation_mode: "delete" }, sole_coordinator_writer: { idempotency_key: "idem_destroy_002" } });
  assertHold(await evaluateCreateOnlyCanary(deleteMode, options(deleteMode)), C.DESTRUCTIVE_COMPENSATION_FORBIDDEN);
  const superseded = packet({ compensating_rollback_plan: { compensation_mode: "supersede_created_synthetic_object" }, sole_coordinator_writer: { idempotency_key: "idem_destroy_003" } });
  const result = await evaluateCreateOnlyCanary(superseded, options(superseded));
  assert.equal(result.status, "SYNTHETIC_CANARY_VERIFIED");
  assert.equal(result.receipt.verification.compensated_terminal_state, "superseded");
});

test("replay revalidates stored receipt digest and bindings instead of returning raw stored result", async () => {
  let firstClaim = true; let stored = null;
  const claims = {
    descriptor: { claim_store_kind: "synthetic_in_memory_atomic", is_synthetic: true, is_live: false },
    async claim() { if (firstClaim) { firstClaim = false; return { status: "CLAIMED", claim_id: "claim_replay_001", claim_consumed: true }; } return { status: "REPLAY", claim_id: "claim_replay_001", terminal: stored }; },
    async finalize({ terminal }) { stored = JSON.parse(JSON.stringify(terminal)); return { status: "FINALIZED", claim_consumed: true }; },
  };
  const value = packet({ sole_coordinator_writer: { idempotency_key: "idem_receipt_001" } });
  const adapter = createSyntheticMutationAdapter();
  assert.equal((await evaluateCreateOnlyCanary(value, options(value, adapter, claims))).status, "SYNTHETIC_CANARY_VERIFIED");
  stored.receipt.receipt_digest = digest("f");
  const result = await evaluateCreateOnlyCanary(value, options(value, adapter, claims));
  assertHold(result, C.REPLAY_RECEIPT_INVALID);
  assert.equal((await adapter.getEffects()).synthetic_creates, 1);
});

test("getters and adapter capability escapes fail closed without being invoked", async () => {
  const value = packet({ sole_coordinator_writer: { idempotency_key: "idem_boundary_001" } });
  const getterOptions = options(value);
  Object.defineProperty(getterOptions, "clock", { enumerable: true, get() { throw new Error("no getter execution"); } });
  assertHold(await evaluateCreateOnlyCanary(value, getterOptions), C.CLOCK_REQUIRED_OR_INVALID);
  const getterPacket = packet({ sole_coordinator_writer: { idempotency_key: "idem_boundary_002" } });
  Object.defineProperty(getterPacket, "canary_id", { enumerable: true, get() { throw new Error("no getter execution"); } });
  assertHold(await evaluateCreateOnlyCanary(getterPacket, options(packet({ sole_coordinator_writer: { idempotency_key: "idem_boundary_002" } }))), C.INVALID_PACKET_SHAPE);
  const rogue = createSyntheticMutationAdapter(); rogue.delete = async () => {};
  assertHold(await evaluateCreateOnlyCanary(packet({ sole_coordinator_writer: { idempotency_key: "idem_boundary_003" } }), options(packet({ sole_coordinator_writer: { idempotency_key: "idem_boundary_003" } }), rogue)), C.ADAPTER_CAPABILITY_ESCAPE);
});

test("exported policy allowlists are closed and immutable", () => {
  assert.deepEqual(ALLOWED_READBACK_MODES, ["exact_digest_readback"]);
  assert.equal(Object.isFrozen(ALLOWED_CREATE_ACTIONS), true);
  assert.equal(Object.isFrozen(ALLOWED_AUTHORITY_LEVELS), true);
  assert.equal(Object.isFrozen(ALLOWED_COMPENSATION_MODES), true);
  assert.throws(() => ALLOWED_READBACK_MODES.push("legacy_readback_mode"));
});

test("RED: structurally invalid pin-bound approval and C5 fields hold without throwing", async () => {
  const baseline = packet({ sole_coordinator_writer: { idempotency_key: "idem_red_structural_001" } });
  const fixedPins = trustedPins(baseline);
  for (const [idempotencyKey, mutate] of [
    ["idem_red_structural_002", (value) => { value.owner_approval = null; }],
    ["idem_red_structural_003", (value) => { value.c5_evidence = null; }],
    ["idem_red_structural_004", (value) => { value.owner_approval.time_window = null; }],
  ]) {
    const value = packet({ sole_coordinator_writer: { idempotency_key: idempotencyKey } });
    mutate(value);
    let result;
    await assert.doesNotReject(async () => {
      result = await evaluateCreateOnlyCanary(value, {
        adapter: createSyntheticMutationAdapter(),
        claimStore: createInMemoryCanaryClaimStore(),
        clock: () => "2026-08-21T21:30:00.000Z",
        ...fixedPins,
      });
    });
    assert.equal(result.status, "HOLD");
  }
});

test("RED: incomplete stop conditions, unbound tuple state, and pending claim replay are held", async () => {
  const incomplete = packet({ owner_approval: { stop_conditions: ["linear_dev_erp_dual_write", "missing_source_coverage"] }, sole_coordinator_writer: { idempotency_key: "idem_red_stop_001" } });
  assertHold(await evaluateCreateOnlyCanary(incomplete, options(incomplete)), C.OWNER_APPROVAL_INVALID);

  const tupleBound = packet({ sole_coordinator_writer: { idempotency_key: "idem_red_tuple_001" } });
  const adapter = createSyntheticMutationAdapter();
  assert.equal((await evaluateCreateOnlyCanary(tupleBound, options(tupleBound, adapter))).status, "SYNTHETIC_CANARY_VERIFIED");
  const state = await adapter.readExact({ object_ref: tupleBound.target_payload.item_id });
  assert.equal(state.project_ref, tupleBound.canary_tuple.project_ref);

  const pendingStore = {
    descriptor: { claim_store_kind: "synthetic_in_memory_atomic", is_synthetic: true, is_live: false },
    async claim() { return { status: "PENDING", claim_id: "claim_pending_001", claim_consumed: true }; },
    async finalize() { return { status: "INVALID" }; },
  };
  const pending = packet({ sole_coordinator_writer: { idempotency_key: "idem_red_pending_001" } });
  assertHold(await evaluateCreateOnlyCanary(pending, options(pending, createSyntheticMutationAdapter(), pendingStore)), "CLAIM_PENDING");
});

test("RED: failed terminal persistence stays bounded and never reruns the adapter", async () => {
  let claimed = false;
  let finalizeCalls = 0;
  const store = {
    descriptor: { claim_store_kind: "synthetic_in_memory_atomic", is_synthetic: true, is_live: false },
    async claim() {
      if (!claimed) {
        claimed = true;
        return { status: "CLAIMED", claim_id: "claim_persist_001", claim_consumed: true };
      }
      return { status: "PENDING", claim_id: "claim_persist_001", claim_consumed: true };
    },
    async finalize() { finalizeCalls++; return { status: "INVALID" }; },
  };
  const value = packet({ sole_coordinator_writer: { idempotency_key: "idem_persist_001" } });
  const adapter = createSyntheticMutationAdapter();
  assertHold(await evaluateCreateOnlyCanary(value, options(value, adapter, store)), C.CLAIM_STORE_INVALID);
  assert.equal(finalizeCalls, 1);
  assertHold(await evaluateCreateOnlyCanary(value, options(value, adapter, store)), C.CLAIM_PENDING);
  assert.equal((await adapter.getEffects()).synthetic_creates, 1);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTHENTICATED_ARTIFACT_CUSTODY_RECEIPT_SCHEMA,
  HERMES_VAULT_SUBMISSION_HOLD_CODES,
  TRUSTED_VAULT_SUBMISSION_CURRENT_SCHEMA,
  VAULT_SUBMISSION_PROPOSAL_SCHEMA,
  admitHermesArtifactSubmission,
  digestArtifactFileManifest,
  digestAuthenticatedCustodyReceipt,
  digestTrustedSubmissionCurrentState,
} from "../src/hermes_submission_admission.mjs";
import { createVaultRevisionCore } from "../src/artifact_revision_core.mjs";

const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;
const SHA_C = `sha256:${"c".repeat(64)}`;
const TASK_REF = Object.freeze({ provider: "linear", task_id: "TASK-KVDS-001" });
const BRIEF_REF = Object.freeze({
  provider: "linear",
  task_id: TASK_REF.task_id,
  revision_id: "work-brief.kvds.001",
  content_sha256: SHA_A,
});
const POLICY_REF = Object.freeze({ revision_id: "assignment-policy.001", content_sha256: SHA_B });

function executionReceipt(overrides = {}) {
  return {
    schema_version: "soulforge.candidate_execution.receipt.v1",
    receipt_id: "candidate-receipt-000001",
    receipt_kind: "execution",
    run_id: "candidate-run-000001",
    attempt_no: 1,
    fencing_epoch: 7,
    claim: {
      task_ref: structuredClone(TASK_REF),
      work_brief_revision_ref: structuredClone(BRIEF_REF),
      action_ref: "action.kvds.design-review",
    },
    authority_ref: "authority.kvds.task-execution",
    assignment_policy_revision_ref: structuredClone(POLICY_REF),
    attribution: {
      responsible_role_ref: "role.kvds.hw",
      actor_ref: "actor.kvds.hw-agent",
      performing_agent_id: "agent.kvds.hw.ironmark-01",
      bot_ref: "bot.kvds.hw",
      executor_ref: "executor.hermes.bot-submit",
    },
    outcome: "succeeded",
    reason_code: null,
    result_ref: "result.kvds.hw.001",
    artifact_refs: [],
    evidence_refs: ["evidence.kvds.validator.001"],
    official_task_done: false,
    official_task_mutated: false,
    external_effect_evidence: {
      source: "executor.hermes.bot-submit",
      receipt_ref: "hermes-adapter-receipt.001",
      linear_writes: 0,
      network_calls: "UNKNOWN",
      filesystem_writes: "UNKNOWN",
      shell_commands: "UNKNOWN",
    },
    ...overrides,
  };
}

function unsignedCustody(overrides = {}) {
  return {
    schema_version: AUTHENTICATED_ARTIFACT_CUSTODY_RECEIPT_SCHEMA,
    status: "AUTHENTICATED_CUSTODY",
    custody_receipt_ref: "custody.kvds.hw.001",
    upload_ticket_ref: "upload-ticket.kvds.hw.001",
    authentication_receipt_ref: "upload-auth.kvds.hw.001",
    authentication_claim_digest: SHA_B,
    submission_id: "submission.kvds.hw.001",
    idempotency_key: "submission-key.kvds.hw.001",
    project_ref: "project.kvds",
    task_ref: structuredClone(TASK_REF),
    assignment_ref: "assignment.kvds.hw.001",
    assignment_epoch: 11,
    task_authority_ref: "authority.kvds.task-execution",
    assignment_policy_revision_ref: structuredClone(POLICY_REF),
    run_id: "candidate-run-000001",
    fencing_epoch: 7,
    agent_mark_ref: "agent-mark.kvds.hw.ironmark-01",
    performing_agent_id: "agent.kvds.hw.ironmark-01",
    bot_ref: "bot.kvds.hw",
    executor_ref: "executor.hermes.bot-submit",
    deployment_ref: "deployment.kvds.hw.001",
    deployment_digest: SHA_B,
    work_brief_revision_ref: structuredClone(BRIEF_REF),
    logical_artifact_id: "artifact.kvds.hw-review",
    parent_revision_id: null,
    file_manifest: [{
      relative_path: "report/review.md",
      role_ref: "artifact-role.primary",
      byte_size: 128,
      content_sha256: SHA_C,
    }],
    file_count: 1,
    total_size: 128,
    manifest_digest: "PENDING",
    content_sha256: SHA_C,
    scan_state: "clean",
    quarantine_state: "released",
    source_refs: ["source.kvds.requirement.001"],
    result_ref: "result.kvds.hw.001",
    evidence_refs: ["evidence.kvds.validator.001"],
    uploader_authority_ref: "authority.kvds.artifact-upload",
    uploader_authority_epoch: 13,
    trusted_pin_ref: "trusted-pin.kvds.vault.001",
    trusted_pin_digest: SHA_A,
    ...overrides,
  };
}

function custodyReceipt(overrides = {}) {
  const value = unsignedCustody(overrides);
  value.manifest_digest = digestArtifactFileManifest(value.file_manifest);
  return { ...value, receipt_digest: digestAuthenticatedCustodyReceipt(value) };
}

function unsignedCurrent(custody = custodyReceipt(), overrides = {}) {
  return {
    schema_version: TRUSTED_VAULT_SUBMISSION_CURRENT_SCHEMA,
    status: "TRUSTED_CURRENT",
    evaluation_ref: "vault-current.kvds.001",
    project_ref: custody.project_ref,
    task_ref: structuredClone(custody.task_ref),
    assignment_ref: custody.assignment_ref,
    current_assignment_epoch: custody.assignment_epoch,
    task_authority_ref: custody.task_authority_ref,
    assignment_policy_revision_ref: structuredClone(custody.assignment_policy_revision_ref),
    run_id: custody.run_id,
    run_state: "succeeded",
    fencing_epoch: custody.fencing_epoch,
    agent_mark_ref: custody.agent_mark_ref,
    performing_agent_id: custody.performing_agent_id,
    bot_ref: custody.bot_ref,
    executor_ref: custody.executor_ref,
    deployment_ref: custody.deployment_ref,
    deployment_digest: custody.deployment_digest,
    work_brief_revision_ref: structuredClone(custody.work_brief_revision_ref),
    logical_artifact_id: custody.logical_artifact_id,
    current_parent_revision_id: custody.parent_revision_id,
    expected_file_count: custody.file_count,
    expected_total_size: custody.total_size,
    expected_manifest_digest: custody.manifest_digest,
    expected_content_sha256: custody.content_sha256,
    expected_source_refs: [...custody.source_refs],
    expected_result_ref: custody.result_ref,
    expected_evidence_refs: [...custody.evidence_refs],
    expected_authentication_receipt_ref: custody.authentication_receipt_ref,
    expected_authentication_claim_digest: custody.authentication_claim_digest,
    uploader_authority_ref: custody.uploader_authority_ref,
    current_uploader_authority_epoch: custody.uploader_authority_epoch,
    trusted_pin_ref: custody.trusted_pin_ref,
    trusted_pin_digest: custody.trusted_pin_digest,
    consumed_custody_receipt_refs: [],
    consumed_idempotency_keys: [],
    ...overrides,
  };
}

function trustedCurrent(custody = custodyReceipt(), overrides = {}) {
  const value = unsignedCurrent(custody, overrides);
  return { ...value, evaluation_digest: digestTrustedSubmissionCurrentState(value) };
}

function request(overrides = {}) {
  const custody = overrides.upload_custody_receipt ?? custodyReceipt();
  return {
    execution_receipt: overrides.execution_receipt ?? executionReceipt(),
    upload_custody_receipt: custody,
    trusted_current_state: overrides.trusted_current_state ?? trustedCurrent(custody),
  };
}

function resealCustody(receipt, mutate) {
  const copy = structuredClone(receipt);
  delete copy.receipt_digest;
  mutate(copy);
  copy.receipt_digest = digestAuthenticatedCustodyReceipt(copy);
  return copy;
}

function resealCurrent(current, mutate) {
  const copy = structuredClone(current);
  delete copy.evaluation_digest;
  mutate(copy);
  copy.evaluation_digest = digestTrustedSubmissionCurrentState(copy);
  return copy;
}

test("execution result/evidence refs alone cannot create an artifact proposal", () => {
  const onlyResult = admitHermesArtifactSubmission({ execution_receipt: executionReceipt() });
  assert.deepEqual(onlyResult, {
    status: "HOLD",
    hold_code: HERMES_VAULT_SUBMISSION_HOLD_CODES.CUSTODY_RECEIPT_REQUIRED,
  });
  assert.equal(Object.hasOwn(onlyResult, "proposal"), false);

  const shortcut = request({ execution_receipt: executionReceipt({
    artifact_refs: ["artifact.untrusted-result-shortcut"],
  }) });
  assert.equal(admitHermesArtifactSubmission(shortcut).hold_code,
    HERMES_VAULT_SUBMISSION_HOLD_CODES.ARTIFACT_REFS_FORBIDDEN);
});

test("authenticated clean custody emits a deep-frozen Vault-compatible proposal only", () => {
  const core = createVaultRevisionCore();
  const before = core.eventLog();
  const result = admitHermesArtifactSubmission(request());

  assert.equal(result.schema_version, VAULT_SUBMISSION_PROPOSAL_SCHEMA);
  assert.equal(result.status, "PROPOSED");
  assert.equal(result.claim, "proposal_only_no_store_mutation_no_revision_no_acceptance");
  assert.deepEqual(Object.keys(result.vault_inputs.record_submission_input).sort(), [
    "actor_ref", "assignment_ref", "declared_sha256", "declared_size",
    "idempotency_key", "project_ref", "submission_id",
  ].sort());
  assert.deepEqual(Object.keys(result.vault_inputs.record_custody_receipt_input).sort(), [
    "custody_receipt_ref", "stored_sha256", "submission_id",
  ].sort());
  assert.deepEqual(result.vault_inputs.record_scan_class_input, {
    custody_receipt_ref: "custody.kvds.hw.001",
    scan_class: "clean",
  });
  assert.equal(Object.hasOwn(result.vault_inputs, "create_revision_candidate_input"), false);
  assert.equal(Object.hasOwn(result, "artifact_revision_id"), false);
  assert.equal(Object.hasOwn(result, "accepted_head"), false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.artifact_basis.file_manifest), true);
  assert.deepEqual(core.eventLog(), before, "pure admission cannot touch the Vault store");
});

test("project/task/assignment/run/Agent/WorkBrief mismatches HOLD", () => {
  const cases = [
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.PROJECT_MISMATCH,
      (c) => { c.project_ref = "project.other"; }],
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.TASK_MISMATCH,
      (c) => {
        c.task_ref.task_id = "TASK-OTHER";
        c.work_brief_revision_ref.task_id = "TASK-OTHER";
      }],
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.ASSIGNMENT_MISMATCH,
      (c) => { c.assignment_ref = "assignment.other"; }],
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.RUN_MISMATCH,
      (c) => { c.run_id = "candidate-run-other"; }],
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.AGENT_MISMATCH,
      (c) => { c.agent_mark_ref = "agent-mark.other"; }],
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.WORK_BRIEF_MISMATCH,
      (c) => { c.work_brief_revision_ref.content_sha256 = SHA_B; }],
  ];
  for (const [holdCode, mutate] of cases) {
    const custody = custodyReceipt();
    const current = resealCurrent(trustedCurrent(custody), mutate);
    assert.equal(admitHermesArtifactSubmission(request({
      upload_custody_receipt: custody,
      trusted_current_state: current,
    })).hold_code, holdCode);
  }
});

test("digest/parent/scan/quarantine/authority/pin/result/source mismatches HOLD", () => {
  const baseCustody = custodyReceipt();
  const baseCurrent = trustedCurrent(baseCustody);
  const cases = [
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.CONTENT_DIGEST_MISMATCH,
      resealCustody(baseCustody, (c) => { c.content_sha256 = SHA_B; }), baseCurrent],
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.PARENT_REVISION_MISMATCH,
      resealCustody(baseCustody, (c) => { c.parent_revision_id = "revision.other"; }), baseCurrent],
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.SCAN_NOT_CLEAN,
      resealCustody(baseCustody, (c) => { c.scan_state = "unknown"; }), baseCurrent],
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.QUARANTINE_NOT_RELEASED,
      resealCustody(baseCustody, (c) => { c.quarantine_state = "quarantined"; }), baseCurrent],
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.AUTHORITY_STALE,
      baseCustody, resealCurrent(baseCurrent, (c) => { c.current_uploader_authority_epoch += 1; })],
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.TRUSTED_PIN_MISMATCH,
      resealCustody(baseCustody, (c) => { c.trusted_pin_ref = "trusted-pin.other"; }), baseCurrent],
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.RESULT_EVIDENCE_MISMATCH,
      resealCustody(baseCustody, (c) => { c.result_ref = "result.other"; }), baseCurrent],
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.SOURCE_MISMATCH,
      resealCustody(baseCustody, (c) => { c.source_refs = ["source.other"]; }), baseCurrent],
    [HERMES_VAULT_SUBMISSION_HOLD_CODES.AUTHENTICATION_MISMATCH,
      resealCustody(baseCustody, (c) => {
        c.authentication_receipt_ref = "upload-auth.other";
      }), baseCurrent],
  ];
  for (const [holdCode, custody, current] of cases) {
    assert.equal(admitHermesArtifactSubmission(request({
      upload_custody_receipt: custody,
      trusted_current_state: current,
    })).hold_code, holdCode);
  }
});

test("bad envelope digests, file manifest drift, and replay HOLD", () => {
  const custody = custodyReceipt();
  const current = trustedCurrent(custody);

  const badReceipt = { ...custody, receipt_digest: SHA_B };
  assert.equal(admitHermesArtifactSubmission(request({
    upload_custody_receipt: badReceipt,
    trusted_current_state: current,
  })).hold_code, HERMES_VAULT_SUBMISSION_HOLD_CODES.CUSTODY_RECEIPT_DIGEST_MISMATCH);

  const badCurrent = { ...current, evaluation_digest: SHA_B };
  assert.equal(admitHermesArtifactSubmission(request({
    upload_custody_receipt: custody,
    trusted_current_state: badCurrent,
  })).hold_code, HERMES_VAULT_SUBMISSION_HOLD_CODES.CURRENT_STATE_DIGEST_MISMATCH);

  const manifestDrift = resealCustody(custody, (c) => { c.total_size += 1; });
  assert.equal(admitHermesArtifactSubmission(request({
    upload_custody_receipt: manifestDrift,
    trusted_current_state: current,
  })).hold_code, HERMES_VAULT_SUBMISSION_HOLD_CODES.MANIFEST_MISMATCH);

  const replay = resealCurrent(current, (c) => {
    c.consumed_custody_receipt_refs = [custody.custody_receipt_ref];
  });
  assert.equal(admitHermesArtifactSubmission(request({
    upload_custody_receipt: custody,
    trusted_current_state: replay,
  })).hold_code, HERMES_VAULT_SUBMISSION_HOLD_CODES.REPLAY);
});

test("absolute/local paths, unknown raw fields, accessors, and malformed relative paths fail closed", () => {
  const absolute = resealCustody(custodyReceipt(), (c) => {
    c.file_manifest[0].relative_path = ["C", ":/private/result.md"].join("");
  });
  assert.equal(admitHermesArtifactSubmission(request({
    upload_custody_receipt: absolute,
    trusted_current_state: trustedCurrent(absolute),
  })).status, "HOLD");

  const raw = custodyReceipt();
  raw.raw_payload = "forbidden";
  assert.equal(admitHermesArtifactSubmission(request({
    upload_custody_receipt: raw,
    trusted_current_state: trustedCurrent(custodyReceipt()),
  })).status, "HOLD");

  let accessed = false;
  const hostile = request();
  Object.defineProperty(hostile, "execution_receipt", {
    enumerable: true,
    get() { accessed = true; return executionReceipt(); },
  });
  assert.equal(admitHermesArtifactSubmission(hostile).status, "HOLD");
  assert.equal(accessed, false);
});

test("hostile Proxy reflection traps always return the fixed request HOLD", () => {
  const fixedHold = {
    status: "HOLD",
    hold_code: HERMES_VAULT_SUBMISSION_HOLD_CODES.REQUEST_INVALID,
  };
  let prototypeTrapCalled = false;
  const getPrototypeTrap = new Proxy({}, {
    getPrototypeOf() {
      prototypeTrapCalled = true;
      throw new Error("must not escape");
    },
  });
  assert.doesNotThrow(() => admitHermesArtifactSubmission(getPrototypeTrap));
  assert.deepEqual(admitHermesArtifactSubmission(getPrototypeTrap), fixedHold);
  assert.equal(prototypeTrapCalled, false, "Proxy is rejected before getPrototypeOf reflection");

  let ownKeysTrapCalled = false;
  const ownKeysTrap = new Proxy({}, {
    ownKeys() {
      ownKeysTrapCalled = true;
      throw new Error("must not escape");
    },
  });
  assert.doesNotThrow(() => admitHermesArtifactSubmission(ownKeysTrap));
  assert.deepEqual(admitHermesArtifactSubmission(ownKeysTrap), fixedHold);
  assert.equal(ownKeysTrapCalled, false, "Proxy is rejected before ownKeys reflection");
});

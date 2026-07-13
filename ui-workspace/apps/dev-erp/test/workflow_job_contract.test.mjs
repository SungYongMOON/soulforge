import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORKFLOW_BINDING_REVISION,
  WORKFLOW_CLAIM_CEILINGS,
  buildFixedRunnerRequest,
  evaluateWorkflowDeploymentAttestation,
  normalizeWorkflowMediaType,
  sha256Canonical,
  validatePagination,
  validatePassReceipt,
  validateResolvedWorkflowInputs,
  validateWorkflowInputUpload,
} from '../src/workflow_job_contract.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

test('fixed runner request exactly uses the shared core vocabulary', () => {
  assert.deepEqual(WORKFLOW_CLAIM_CEILINGS, ['observed', 'source_supported', 'rejected_or_blocked']);
  const request = buildFixedRunnerRequest({
    job: {
      job_id: 'wfj_' + '1'.repeat(32),
      idempotency_key: 'wfi_' + '4'.repeat(32),
      mode: 'full_authoring',
      project_code: 'P26-001',
      actor_account_id: 'acct_owner',
      report_type: 'analysis',
      audience: 'internal_review',
    },
    inputs: [
      {
        role: 'source',
        body_ref: `wjb:source:${HASH_A}`,
        body_sha256: HASH_A,
        body_size: 10,
        media_type: 'text/markdown; charset=utf-8',
      },
      {
        role: 'draft',
        body_ref: `wjb:draft:${HASH_B}`,
        body_sha256: HASH_B,
        body_size: 20,
        media_type: 'application/json',
      },
    ],
  });

  assert.equal(WORKFLOW_BINDING_REVISION, 'report_authoring_v0.binding.v1');
  assert.deepEqual(request, {
    schema: 'soulforge.workflow_job_request.v1',
    job_id: 'wfj_' + '1'.repeat(32),
    idempotency_key: 'wfi_' + '4'.repeat(32),
    workflow_id: 'report_authoring_v0',
    workflow_binding_revision: 'report_authoring_v0.binding.v1',
    mode: 'full_authoring',
    project_code: 'P26-001',
    actor_ref: 'erp-account:acct_owner',
    input_refs: [
      {
        role: 'source_material',
        payload_ref: `wjb:source:${HASH_A}`,
        sha256: HASH_A,
        size: 10,
        media_type: 'text/markdown',
      },
      {
        role: 'draft_report',
        payload_ref: `wjb:draft:${HASH_B}`,
        sha256: HASH_B,
        size: 20,
        media_type: 'application/json',
      },
    ],
    report_type: 'analysis',
    audience: 'internal_review',
    output_formats: ['md', 'html'],
    boundary_policy: 'soulforge.report.boundary.v1',
    acceptance_profile: 'soulforge.report.semantic_preservation.v1',
  });
});

test('runner input mapping fails closed for a non-canonical media type', () => {
  assert.throws(() => buildFixedRunnerRequest({
    job: {
      job_id: 'wfj_' + '2'.repeat(32),
      idempotency_key: 'wfi_' + '5'.repeat(32),
      mode: 'full_authoring',
      project_code: 'P26-001',
      actor_account_id: 'acct_owner',
      report_type: 'analysis',
      audience: 'internal_review',
    },
    inputs: [{
      role: 'source',
      body_ref: `wjb:source:${HASH_A}`,
      body_sha256: HASH_A,
      body_size: 10,
      media_type: 'text/html',
    }],
  }), /workflow_runner_input_mapping_invalid/);
});

function validPassReceipt() {
  const receipt = {
    schema: 'dev_erp.workflow_pass_receipt.v1',
    role: 'author',
    operation_id: 'wfo_' + '6'.repeat(32),
    operation_nonce_sha256: HASH_A,
    process_instance_id: 'process-author-1',
    child_pid: 1001,
    started_at: '2026-07-13T00:00:00.000Z',
    finished_at: '2026-07-13T00:00:01.000Z',
    terminated_at: '2026-07-13T00:00:02.000Z',
    bundle_sha256: HASH_B,
    input_sha256: HASH_A,
    output_sha256: HASH_C,
    permission_profile_revision: HASH_A,
    skills: [],
    instruction_sources: [],
    sandbox_mode: 'read-only',
    writable_roots: [],
    network_access: false,
    approval_policy: 'never',
    context_sha256: HASH_B,
  };
  return { ...receipt, receipt_sha256: sha256Canonical(receipt) };
}

test('pass receipt digest is recomputed instead of accepting a self-attested hash', () => {
  const receipt = validPassReceipt();
  assert.equal(validatePassReceipt(receipt, 'author'), receipt);
  assert.throws(
    () => validatePassReceipt({ ...receipt, process_instance_id: 'forged-process' }, 'author'),
    /workflow_pass_receipt_digest_invalid/,
  );
});

test('missing HTTP pagination query values use bounded defaults', () => {
  assert.deepEqual(validatePagination({ limit: null, offset: null }), { limit: 50, offset: 0 });
  assert.deepEqual(validatePagination({ limit: '10', offset: '20' }), { limit: 10, offset: 20 });
});

test('text and JSON inputs require fatal UTF-8 and reject non-UTF-8 charset declarations', () => {
  const base = { project_code: 'P26-001', role: 'source' };
  assert.equal(normalizeWorkflowMediaType('application/json; charset=UTF-8'), 'application/json');
  assert.throws(() => normalizeWorkflowMediaType('text/plain; charset=windows-1252'), /workflow_input_media_type_unsupported/);
  for (const media_type of ['text/plain; charset=utf-8', 'text/markdown; charset=utf-8', 'application/json']) {
    assert.throws(
      () => validateWorkflowInputUpload({ ...base, media_type, bytes: Buffer.from([0xc3, 0x28]) }),
      /workflow_input_utf8_invalid/,
    );
  }
});

test('core duplicate-role limit permits at most one source and one draft', () => {
  const row = (role) => ({ role, body_size: 1 });
  assert.deepEqual(validateResolvedWorkflowInputs('final_polish', [row('draft'), row('source')]), {
    total_bytes: 2, draft_count: 1, source_count: 1,
  });
  assert.throws(
    () => validateResolvedWorkflowInputs('full_authoring', [row('source'), row('source')]),
    /workflow_input_role_duplicate/,
  );
});

test('environment self-attestation cannot enable the route without an actual runtime probe', () => {
  const result = evaluateWorkflowDeploymentAttestation({
    routeEnabled: true,
    attestation: null,
    expectedAttestationSha256: HASH_A,
    sourceCommit: 'a'.repeat(40),
    expectedBundleSha256: HASH_B,
    erpIdentitySha256: HASH_A,
    workerIdentitySha256: HASH_B,
    passRunnerRelease: 'candidate',
    runnerAvailable: true,
  });
  assert.equal(result.enabled, false);
  assert.ok(result.blockers.includes('workflow_actual_probe_missing'));
});

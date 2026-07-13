import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  WORKFLOW_ARTIFACT_MEDIA_TYPES,
  WORKFLOW_ARTIFACT_ROLES,
  WORKFLOW_INPUT_TTL_MS,
  canonicalJson,
  sha256Canonical,
} from '../src/workflow_job_contract.mjs';
import { WorkflowJobPayloadStore } from '../src/workflow_job_payload_store.mjs';
import { WorkflowJobOrchestrator } from '../src/workflow_job_orchestrator.mjs';
import { WorkflowJobReceiptStore } from '../src/workflow_job_receipt_store.mjs';
import { WorkflowJobService } from '../src/workflow_job_service.mjs';
import { openStore } from '../src/store.mjs';

const BUNDLE_SHA256 = 'b'.repeat(64);

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function errorCode(error) {
  return error?.code || error?.message;
}

function fixture(t, suffix = '') {
  const backendRoot = mkdtempSync(join(tmpdir(), `dev-erp-workflow-${suffix}`));
  const store = openStore(':memory:');
  const owner = store.createAccount({
    username: `owner_${suffix || 'test'}`,
    password: 'pw123456',
    roles: ['admin'],
  }).id;
  const outsider = store.createAccount({
    username: `outsider_${suffix || 'test'}`,
    password: 'pw123456',
    roles: [],
  }).id;
  const project = store.createProject({ id: `P26-${suffix.padStart(3, '0') || '001'}`, title: 'Workflow test' }).project;
  const payloadStore = new WorkflowJobPayloadStore({ backendRoot });
  const service = new WorkflowJobService({ store, payloadStore, bundleSha256: BUNDLE_SHA256 });
  t.after(() => {
    store.db.close();
    const root = resolve(backendRoot);
    assert.ok(root.startsWith(resolve(tmpdir())));
    rmSync(root, { recursive: true, force: true });
  });
  return {
    store,
    backendRoot,
    owner,
    outsider,
    project,
    payloadStore,
    service,
    canAccessProject: (projectCode) => projectCode === project.id,
  };
}

function createQueuedJob(fx, { marker = '1', bytes = Buffer.from('# source') } = {}) {
  const uploaded = fx.service.createInput({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    project_code: fx.project.id,
    role: 'source',
    media_type: 'text/markdown; charset=utf-8',
    bytes,
  });
  const idempotencyKey = `wfi_${marker.repeat(32)}`;
  const request = {
    schema: 'dev_erp.workflow_job_create.v1',
    project_code: fx.project.id,
    mode: 'full_authoring',
    report_type: 'analysis',
    audience: 'internal_review',
    input_handles: [uploaded.input.handle_id],
  };
  const created = fx.service.createJob({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    idempotencyKey,
    request,
  });
  return { uploaded, idempotencyKey, request, created };
}

function passReceipt({ role, operationId, nonceSha256, startedAt, finishedAt, terminatedAt, inputSha256, outputSha256, pid }) {
  const payload = {
    schema: 'dev_erp.workflow_pass_receipt.v1',
    role,
    operation_id: operationId,
    operation_nonce_sha256: nonceSha256,
    process_instance_id: `process-${role}-${pid}`,
    child_pid: pid,
    started_at: startedAt,
    finished_at: finishedAt,
    terminated_at: terminatedAt,
    bundle_sha256: BUNDLE_SHA256,
    input_sha256: inputSha256,
    output_sha256: outputSha256,
    permission_profile_revision: 'e'.repeat(64),
    skills: [],
    instruction_sources: [],
    sandbox_mode: 'read-only',
    writable_roots: [],
    network_access: false,
    approval_policy: 'never',
    context_sha256: role === 'author' ? '1'.repeat(64) : '2'.repeat(64),
  };
  return { ...payload, receipt_sha256: sha256Canonical(payload) };
}

function claimAndRecordPasses(fx, created, operationMarker = '8') {
  const operationId = `wfo_${operationMarker.repeat(32)}`;
  const claimed = fx.service.claimJob({
    jobId: created.job.job_id,
    expectedStateVersion: created.job.state_version,
    operationId,
  });
  const authorNonce = Buffer.from(claimed.pass_challenges.author_nonce_base64url, 'base64url');
  const verifierNonce = Buffer.from(claimed.pass_challenges.verifier_nonce_base64url, 'base64url');
  const authorOutput = 'c'.repeat(64);
  const author = passReceipt({
    role: 'author',
    operationId: 'wfo_' + 'a'.repeat(32),
    nonceSha256: digest(authorNonce),
    startedAt: '2026-07-13T00:00:00.000Z',
    finishedAt: '2026-07-13T00:00:01.000Z',
    terminatedAt: '2026-07-13T00:00:02.000Z',
    inputSha256: '9'.repeat(64),
    outputSha256: authorOutput,
    pid: 1001,
  });
  const verifier = passReceipt({
    role: 'verifier',
    operationId: 'wfo_' + 'd'.repeat(32),
    nonceSha256: digest(verifierNonce),
    startedAt: '2026-07-13T00:00:03.000Z',
    finishedAt: '2026-07-13T00:00:04.000Z',
    terminatedAt: '2026-07-13T00:00:05.000Z',
    inputSha256: authorOutput,
    outputSha256: 'f'.repeat(64),
    pid: 1002,
  });
  const recorded = fx.service.recordPassReceipts({
    jobId: created.job.job_id,
    expectedStateVersion: claimed.state_version,
    author,
    verifier,
  });
  return { operationId, claimed, author, verifier, recorded };
}

function artifactSet() {
  return WORKFLOW_ARTIFACT_ROLES.map((role) => ({
    role,
    media_type: WORKFLOW_ARTIFACT_MEDIA_TYPES[role],
    bytes: Buffer.from(role === 'final_report_md' ? '# Final report' : canonicalJson({ role, ok: true })),
  }));
}

function coreResult(job, artifactRefs, claimCeiling = 'observed') {
  const semantic = artifactRefs.find((ref) => ref.role === 'semantic_verification');
  return {
    schema: 'soulforge.workflow_job_result.v1',
    job_id: job.job_id,
    workflow_id: 'report_authoring_v0',
    binding_revision: job.binding_revision,
    status: 'succeeded',
    artifact_refs: artifactRefs,
    preservation: {
      deterministic_status: 'pass', lexical_status: 'pass', lexical_scope: 'full_authoring_technical_content_adopted_claims',
      lexical_inventory_sha256: '1'.repeat(64), lexical_count: 1, semantic_status: 'pass',
      semantic_verdict_ref: semantic.payload_ref, semantic_verifier_actor_ref: 'actor:verifier',
      semantic_verifier_run_ref: 'run:verifier', inventory_sha256: '2'.repeat(64),
      counts: { baseline: 1, candidate: 1, matched: 1, missing: 0, changed: 0, unexpected: 0 },
    },
    identity_assurance: {
      claim: 'local_context_separation_declared', authority_ref: 'authority:test',
      authority_record_sha256: '3'.repeat(64), deployment_attestation_ref: null,
    },
    unconfirmed_codes: [],
    claim_ceiling: claimCeiling,
    boundary: {
      content_classification: 'private_work_product', raw_input_payload_copy_detected: false,
      known_secret_pattern_scan_status: 'pass', runtime_absolute_path_detected: false,
      source_owned_absolute_path_count: 0, forbidden_internal_scaffold_detected: false,
      artifact_storage_class: 'workspace_system', receipt_metadata_only: true,
    },
  };
}

test('input handles are bounded, single-owner metadata pointers and create is idempotent', (t) => {
  const fx = fixture(t, '101');
  assert.throws(() => fx.service.createInput({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    project_code: fx.project.id,
    role: 'source',
    media_type: 'text/plain; charset=utf-8',
    bytes: Buffer.alloc(393_217),
  }), (error) => errorCode(error) === 'workflow_input_too_large');

  const aggregateHandles = [0, 1].map(() => fx.service.createInput({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    project_code: fx.project.id,
    role: 'source',
    media_type: 'text/plain; charset=utf-8',
    bytes: Buffer.alloc(200_000, 0x62),
  }).input.handle_id);
  assert.throws(() => fx.service.createJob({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    idempotencyKey: 'wfi_' + '9'.repeat(32),
    request: {
      schema: 'dev_erp.workflow_job_create.v1',
      project_code: fx.project.id,
      mode: 'full_authoring',
      report_type: 'analysis',
      audience: 'internal_review',
      input_handles: aggregateHandles,
    },
  }), /workflow_input_total_too_large/);

  const queued = createQueuedJob(fx, { marker: '1', bytes: Buffer.alloc(393_216, 0x61) });
  const replayed = fx.service.createJob({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    idempotencyKey: queued.idempotencyKey,
    request: queued.request,
  });
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.job.job_id, queued.created.job.job_id);
  assert.throws(() => fx.service.createJob({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    idempotencyKey: queued.idempotencyKey,
    request: { ...queued.request, report_type: 'progress' },
  }), (error) => errorCode(error) === 'workflow_job_idempotency_conflict');

  const row = fx.store.db.prepare('SELECT * FROM workflow_job_input WHERE job_id=?').get(queued.created.job.job_id);
  assert.equal(row.body_size, 393_216);
  assert.equal(Object.values(row).some((value) => Buffer.isBuffer(value)), false);
  assert.equal(JSON.stringify(row).includes('aaaaa'), false);
  assert.throws(() => fx.service.getJob({
    accountId: fx.outsider,
    canAccessProject: () => false,
    jobId: queued.created.job.job_id,
  }), (error) => errorCode(error) === 'workflow_project_forbidden');
});

test('job pagination applies project ACL in SQL before limit and offset', (t) => {
  const fx = fixture(t, '106');
  const first = createQueuedJob(fx, { marker: '6' }).created.job;
  const second = createQueuedJob(fx, { marker: '7' }).created.job;
  const hiddenProject = fx.store.createProject({ id: 'P26-777', title: 'Hidden' }).project;
  const hiddenInput = fx.service.createInput({
    accountId: fx.owner,
    canAccessProject: () => true,
    project_code: hiddenProject.id,
    role: 'source',
    media_type: 'text/plain; charset=utf-8',
    bytes: Buffer.from('hidden source'),
  });
  const hidden = fx.service.createJob({
    accountId: fx.owner,
    canAccessProject: () => true,
    idempotencyKey: 'wfi_' + '8'.repeat(32),
    request: {
      schema: 'dev_erp.workflow_job_create.v1',
      project_code: hiddenProject.id,
      mode: 'full_authoring',
      report_type: 'analysis',
      audience: 'internal_review',
      input_handles: [hiddenInput.input.handle_id],
    },
  }).job;
  fx.store.db.prepare('UPDATE workflow_job SET created_at=? WHERE job_id=?').run('2026-07-13T00:00:00.000Z', first.job_id);
  fx.store.db.prepare('UPDATE workflow_job SET created_at=? WHERE job_id=?').run('2026-07-13T00:00:01.000Z', second.job_id);
  fx.store.db.prepare('UPDATE workflow_job SET created_at=? WHERE job_id=?').run('2026-07-13T00:00:02.000Z', hidden.job_id);

  const page = fx.service.listJobs({
    accountId: fx.owner,
    canAccessProject: (projectCode) => projectCode === fx.project.id,
    limit: 2,
    offset: 0,
  });
  assert.equal(page.jobs.length, 2);
  assert.equal(page.jobs.every((job) => job.project_code === fx.project.id), true);
  assert.equal(page.pagination.next_offset, 2);
});

test('input handles reject cross-account use, forgery, and expiry', (t) => {
  const fx = fixture(t, '107');
  let now = new Date('2026-07-13T00:00:00.000Z');
  fx.service.clock = () => now;
  const uploaded = fx.service.createInput({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    project_code: fx.project.id,
    role: 'source',
    media_type: 'text/plain; charset=utf-8',
    bytes: Buffer.from('bound source'),
  });
  const baseRequest = {
    schema: 'dev_erp.workflow_job_create.v1',
    project_code: fx.project.id,
    mode: 'full_authoring',
    report_type: 'analysis',
    audience: 'internal_review',
    input_handles: [uploaded.input.handle_id],
  };
  assert.throws(() => fx.service.createJob({
    accountId: fx.outsider,
    canAccessProject: fx.canAccessProject,
    idempotencyKey: 'wfi_' + 'a'.repeat(32),
    request: baseRequest,
  }), (error) => errorCode(error) === 'workflow_input_account_forbidden');
  assert.throws(() => fx.service.createJob({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    idempotencyKey: 'wfi_' + 'b'.repeat(32),
    request: { ...baseRequest, input_handles: ['wih_' + 'f'.repeat(32)] },
  }), /workflow_input_handle/);
  now = new Date(Date.parse('2026-07-13T00:00:00.000Z') + WORKFLOW_INPUT_TTL_MS + 1);
  assert.throws(() => fx.service.createJob({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    idempotencyKey: 'wfi_' + 'c'.repeat(32),
    request: baseRequest,
  }), /workflow_input_handle/);
});

test('final polish requires exactly one draft while full authoring requires source material', (t) => {
  const fx = fixture(t, '109');
  const upload = (role, text) => fx.service.createInput({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    project_code: fx.project.id,
    role,
    media_type: 'text/plain; charset=utf-8',
    bytes: Buffer.from(text),
  }).input.handle_id;
  const drafts = [upload('draft', 'draft one'), upload('draft', 'draft two')];
  assert.throws(() => fx.service.createJob({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    idempotencyKey: 'wfi_' + '1'.repeat(31) + '0',
    request: {
      schema: 'dev_erp.workflow_job_create.v1', project_code: fx.project.id, mode: 'final_polish',
      report_type: 'analysis', audience: 'internal_review', input_handles: drafts,
    },
  }), (error) => errorCode(error) === 'workflow_input_role_duplicate');
  const sourceOnly = upload('source', 'source only');
  assert.throws(() => fx.service.createJob({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    idempotencyKey: 'wfi_' + '2'.repeat(31) + '0',
    request: {
      schema: 'dev_erp.workflow_job_create.v1', project_code: fx.project.id, mode: 'final_polish',
      report_type: 'analysis', audience: 'internal_review', input_handles: [sourceOnly],
    },
  }), (error) => errorCode(error) === 'workflow_final_polish_draft_required');
});

test('queued cancellation is CAS-bound and foreign keys reject orphaning owners', (t) => {
  const fx = fixture(t, '108');
  const { created } = createQueuedJob(fx, { marker: 'd' });
  assert.equal(fx.store.db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.throws(() => fx.service.cancel({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    jobId: created.job.job_id,
    request: {
      schema: 'dev_erp.workflow_job_cancel.v1',
      expected_state_version: created.job.state_version + 1,
    },
  }), /workflow_job_state_conflict/);
  const cancelled = fx.service.cancel({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    jobId: created.job.job_id,
    request: {
      schema: 'dev_erp.workflow_job_cancel.v1',
      expected_state_version: created.job.state_version,
    },
  });
  assert.equal(cancelled.job.status, 'cancelled');
  assert.throws(() => fx.store.db.prepare('DELETE FROM core_account WHERE id=?').run(fx.owner), /FOREIGN KEY/);
});

test('pass receipts require server-issued nonces and recomputed immutable digests', (t) => {
  const fx = fixture(t, '102');
  const { created } = createQueuedJob(fx, { marker: '2' });
  const operationId = 'wfo_' + '2'.repeat(32);
  const claimed = fx.service.claimJob({
    jobId: created.job.job_id,
    expectedStateVersion: created.job.state_version,
    operationId,
  });
  const authorOutput = 'c'.repeat(64);
  const author = passReceipt({
    role: 'author',
    operationId: 'wfo_' + 'a'.repeat(32),
    nonceSha256: '0'.repeat(64),
    startedAt: '2026-07-13T00:00:00.000Z',
    finishedAt: '2026-07-13T00:00:01.000Z',
    terminatedAt: '2026-07-13T00:00:02.000Z',
    inputSha256: '9'.repeat(64),
    outputSha256: authorOutput,
    pid: 1001,
  });
  const verifierNonce = Buffer.from(claimed.pass_challenges.verifier_nonce_base64url, 'base64url');
  const verifier = passReceipt({
    role: 'verifier',
    operationId: 'wfo_' + 'd'.repeat(32),
    nonceSha256: digest(verifierNonce),
    startedAt: '2026-07-13T00:00:03.000Z',
    finishedAt: '2026-07-13T00:00:04.000Z',
    terminatedAt: '2026-07-13T00:00:05.000Z',
    inputSha256: authorOutput,
    outputSha256: 'f'.repeat(64),
    pid: 1002,
  });
  assert.throws(() => fx.service.recordPassReceipts({
    jobId: created.job.job_id,
    expectedStateVersion: claimed.state_version,
    author,
    verifier,
  }), (error) => errorCode(error) === 'workflow_pass_challenge_mismatch');
});

test('artifact crash is exactly adopted and only the receipt sink resumes', async (t) => {
  const fx = fixture(t, '103');
  const { created } = createQueuedJob(fx, { marker: '3' });
  const pass = claimAndRecordPasses(fx, created, '3');
  const artifacts = artifactSet();
  const preview = fx.service.previewArtifactCommit({
    jobId: created.job.job_id,
    operationId: pass.operationId,
    artifacts,
  });
  const result = coreResult(fx.service.jobRow(created.job.job_id), preview.artifact_refs);
  const originalPersist = fx.payloadStore.persistArtifactSet.bind(fx.payloadStore);
  fx.payloadStore.persistArtifactSet = (args) => {
    originalPersist(args);
    throw new Error('injected_after_atomic_rename');
  };
  assert.throws(() => fx.service.persistResult({
    jobId: created.job.job_id,
    expectedStateVersion: pass.recorded.state_version,
    operationId: pass.operationId,
    artifacts,
    result,
  }), /injected_after_atomic_rename/);
  fx.payloadStore.persistArtifactSet = originalPersist;

  const beforeRecovery = fx.service.jobRow(created.job.job_id);
  assert.equal(beforeRecovery.status, 'running');
  assert.equal(beforeRecovery.phase, 'validate');
  const recovered = fx.service.recoverInterruptedJobs();
  assert.deepEqual(recovered, { recovered: 1, adopted: 1, blocked: 0 });
  const adopted = fx.service.getJob({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    jobId: created.job.job_id,
  });
  assert.equal(adopted.job.status, 'interrupted');
  assert.equal(adopted.job.phase, 'receipt');

  let receiptCalls = 0;
  const recoveryRequest = {
    schema: 'dev_erp.workflow_job_recovery.v1',
    expected_state_version: adopted.job.state_version,
    action: 'resume_receipt',
    idempotency_key: 'wfi_' + 'e'.repeat(32),
  };
  const receiptAdapter = {
    async resumeReceipt() {
      receiptCalls += 1;
      return { receipt_ref: `wfr:${'f'.repeat(64)}`, receipt_sha256: 'f'.repeat(64) };
    },
  };
  const completed = await fx.service.resumeReceipt({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    jobId: created.job.job_id,
    request: recoveryRequest,
    receiptAdapter,
  });
  assert.equal(completed.job.status, 'succeeded');
  assert.equal(completed.job.human_review_status, 'required');
  const replayed = await fx.service.resumeReceipt({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    jobId: created.job.job_id,
    request: recoveryRequest,
    receiptAdapter,
  });
  assert.equal(replayed.replayed, true);
  assert.equal(receiptCalls, 1);
});

test('a precommit interruption is blocked for manual review and cannot masquerade as receipt recovery', async (t) => {
  const fx = fixture(t, '104');
  const { created } = createQueuedJob(fx, { marker: '4' });
  fx.service.claimJob({
    jobId: created.job.job_id,
    expectedStateVersion: created.job.state_version,
    operationId: 'wfo_' + '4'.repeat(32),
  });
  const recovered = fx.service.recoverInterruptedJobs();
  assert.deepEqual(recovered, { recovered: 1, adopted: 0, blocked: 1 });
  const blocked = fx.service.getJob({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    jobId: created.job.job_id,
  });
  assert.equal(blocked.job.status, 'blocked');
  assert.equal(blocked.job.phase, 'validate');
  await assert.rejects(fx.service.resumeReceipt({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    jobId: created.job.job_id,
    request: {
      schema: 'dev_erp.workflow_job_recovery.v1',
      expected_state_version: blocked.job.state_version,
      action: 'resume_receipt',
      idempotency_key: 'wfi_' + 'f'.repeat(32),
    },
    receiptAdapter: { async resumeReceipt() { throw new Error('must not be called'); } },
  }), (error) => errorCode(error) === 'workflow_recovery_forbidden');
});

test('server startup wires report workflow recovery and fails capability closed on recovery error', () => {
  const serverSource = readFileSync(resolve(import.meta.dirname, '../server.mjs'), 'utf8');
  assert.match(serverSource, /reportWorkflowService\.recoverInterruptedJobs\("service_restart"\)/u);
  assert.match(serverSource, /reportWorkflowStartupRecoveryStatus = "pass"/u);
  assert.match(serverSource, /reportWorkflowStartupRecoveryStatus = "failed"/u);
  assert.match(serverSource, /workflow_startup_recovery_failed/u);
});

test('orchestrator calls one shared runner path and uses ERP as the single artifact and receipt writer', async (t) => {
  const fx = fixture(t, '105');
  const { created } = createQueuedJob(fx, { marker: '5' });
  let bridgeCalls = 0;
  let barrierCalls = 0;
  let workerFactoryCalls = 0;
  const bridge = {
    async validateRequest(value) { return value; },
    async validateResult(value) { return value; },
    async validateReceipt(value) { return value; },
    async validateOutcome(value) { return value; },
    async execute({ request, adapters, expectedBundleDigest }) {
      bridgeCalls += 1;
      assert.equal(request.workflow_id, 'report_authoring_v0');
      assert.equal(expectedBundleDigest, BUNDLE_SHA256);
      for (const input of request.input_refs) assert.ok(Buffer.isBuffer(adapters.payloadAdapter.read(input)));
      let result;
      const artifactWrite = await adapters.artifactAdapter.writeArtifactSet({
        jobId: request.job_id,
        projectCode: request.project_code,
        artifacts: artifactSet().map(({ role, media_type, bytes }) => ({ role, mediaType: media_type, bytes })),
        async beforeArtifactCommit({ artifactRefs, storageAttestation }) {
          barrierCalls += 1;
          assert.equal(artifactRefs.length, WORKFLOW_ARTIFACT_ROLES.length);
          assert.equal(storageAttestation.atomic_no_overwrite, true);
          result = coreResult(fx.service.jobRow(request.job_id), artifactRefs);
          const finalDocument = {};
          const candidateDocumentSha256 = sha256Canonical(finalDocument);
          const execution = {
            result,
            finalDocument,
            finalRewriter: { document: finalDocument },
            verdict: { candidate_document_sha256: candidateDocumentSha256 },
            preservation: {}, boundaryScan: {}, storageAttestation, summaryDerivation: {}, identityAttestation: {},
          };
          await adapters.stateAdapter.recordJournal({
            jobId: request.job_id,
            name: 'prepared_execution',
            value: {
              schema: 'soulforge.workflow_prepared_execution_journal.v1',
              request_sha256: sha256Canonical(request),
              workflow_bundle_sha256: expectedBundleDigest,
              candidate_document_sha256: candidateDocumentSha256,
              execution_sha256: sha256Canonical(execution),
              execution,
            },
          });
        },
      });
      const receipt = {
        schema: 'soulforge.workflow_receipt.v1',
        job_id: request.job_id,
        workflow_id: request.workflow_id,
        binding_revision: request.workflow_binding_revision,
        request_sha256: sha256Canonical(request),
        workflow_bundle_sha256: expectedBundleDigest,
        result_sha256: sha256Canonical(result),
        input_refs: request.input_refs,
        output_refs: artifactWrite.artifact_refs,
        execution: { identity_claim: 'local_context_separation_declared' },
      };
      const receiptBytes = Buffer.from(`${canonicalJson(receipt)}\n`);
      const receiptConfirmation = await adapters.receiptAdapter.write({
        receipt,
        bytes: receiptBytes,
        projectCode: request.project_code,
      });
      return {
        schema: 'soulforge.workflow_job_outcome.v1',
        state: { job_id: request.job_id, status: 'succeeded', terminal_reason_code: 'completed' },
        result,
        receipt_confirmation: receiptConfirmation,
        error: null,
        recovery: { status: 'not_required', artifact_refs: [], reason_code: null, receipt_confirmation: null },
        replayed: false,
      };
    },
  };
  const orchestrator = new WorkflowJobOrchestrator({
    service: fx.service,
    payloadStore: fx.payloadStore,
    receiptStore: new WorkflowJobReceiptStore({ repositoryRoot: fx.backendRoot }),
    runnerBridge: bridge,
    bundleSha256: BUNDLE_SHA256,
    async buildWorkerAdapters({ passChallenges }) {
      workerFactoryCalls += 1;
      const authorOutput = 'c'.repeat(64);
      const author = passReceipt({
        role: 'author',
        operationId: 'wfo_' + 'a'.repeat(32),
        nonceSha256: digest(Buffer.from(passChallenges.author_nonce_base64url, 'base64url')),
        startedAt: '2026-07-13T00:00:00.000Z',
        finishedAt: '2026-07-13T00:00:01.000Z',
        terminatedAt: '2026-07-13T00:00:02.000Z',
        inputSha256: '9'.repeat(64),
        outputSha256: authorOutput,
        pid: 2001,
      });
      const verifier = passReceipt({
        role: 'verifier',
        operationId: 'wfo_' + 'd'.repeat(32),
        nonceSha256: digest(Buffer.from(passChallenges.verifier_nonce_base64url, 'base64url')),
        startedAt: '2026-07-13T00:00:03.000Z',
        finishedAt: '2026-07-13T00:00:04.000Z',
        terminatedAt: '2026-07-13T00:00:05.000Z',
        inputSha256: authorOutput,
        outputSha256: 'f'.repeat(64),
        pid: 2002,
      });
      return {
        stateAdapter: {
          open() {}, compareAndSwap() {}, recordJournal() {}, snapshot() {}, recoverRunning() {}, recordOutcome() {},
        },
        executorAdapter: { buildProtectedBaseline() {}, runStage() {} },
        verifierAdapter: { verify() {} },
        identityAdapter: { verifySeparation() {} },
        async getPassReceipts() { return { author, verifier }; },
      };
    },
  });
  const outcome = await orchestrator.run({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    jobId: created.job.job_id,
    expectedStateVersion: created.job.state_version,
    operationId: 'wfo_' + '5'.repeat(32),
  });
  assert.equal(outcome.state.status, 'succeeded');
  assert.equal(bridgeCalls, 1);
  assert.equal(workerFactoryCalls, 1);
  assert.equal(barrierCalls, 1);
  const job = fx.service.jobRow(created.job.job_id);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.human_review_status, 'required');
  assert.equal(job.claim_ceiling, outcome.result.claim_ceiling);
  assert.equal(job.result_json, canonicalJson(outcome.result));
  assert.equal(job.result_sha256, sha256Canonical(outcome.result));
  assert.equal(fx.store.db.prepare('SELECT COUNT(*) AS n FROM workflow_job_artifact WHERE job_id=?').get(job.job_id).n, 6);
  const receiptPath = join(fx.backendRoot, '_workmeta', fx.project.id, 'runs', job.job_id, 'workflow_receipt.json');
  assert.equal(existsSync(receiptPath), true);
  const storedReceipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(storedReceipt.result_sha256, job.result_sha256);
  assert.deepEqual(storedReceipt.output_refs, outcome.result.artifact_refs);
  assert.equal(job.receipt_sha256, digest(readFileSync(receiptPath)));
  assert.equal(existsSync(join(fx.payloadStore.root, job.job_id, 'receipt')), false);
});

test('a normal blocked core outcome converges the ERP row instead of leaving it running', async (t) => {
  const fx = fixture(t, '111');
  const { created } = createQueuedJob(fx, { marker: '6' });
  const outcome = {
    schema: 'soulforge.workflow_job_outcome.v1',
    state: { job_id: created.job.job_id, status: 'blocked', terminal_reason_code: 'synthetic_core_block' },
    result: null,
    receipt_confirmation: null,
    error: { code: 'synthetic_core_block' },
    recovery: { status: 'not_required', artifact_refs: [], reason_code: null, receipt_confirmation: null },
    replayed: false,
  };
  const bridge = {
    async validateRequest(value) { return value; },
    async validateResult(value) { return value; },
    async validateReceipt(value) { return value; },
    async validateOutcome(value) { return value; },
    async execute() { return outcome; },
  };
  const orchestrator = new WorkflowJobOrchestrator({
    service: fx.service,
    payloadStore: fx.payloadStore,
    receiptStore: new WorkflowJobReceiptStore({ repositoryRoot: fx.backendRoot }),
    runnerBridge: bridge,
    bundleSha256: BUNDLE_SHA256,
    async buildWorkerAdapters() {
      return {
        stateAdapter: { open() {}, compareAndSwap() {}, recordJournal() {}, snapshot() {}, recoverRunning() {}, recordOutcome() {} },
        executorAdapter: { buildProtectedBaseline() {}, runStage() {} },
        verifierAdapter: { verify() {} },
        identityAdapter: { verifySeparation() {} },
        async getPassReceipts() { throw new Error('passes_must_not_run'); },
      };
    },
  });
  const returned = await orchestrator.run({
    accountId: fx.owner,
    canAccessProject: fx.canAccessProject,
    jobId: created.job.job_id,
    expectedStateVersion: created.job.state_version,
    operationId: 'wfo_' + '6'.repeat(32),
  });
  assert.equal(returned, outcome);
  const job = fx.service.jobRow(created.job.job_id);
  assert.equal(job.status, 'blocked');
  assert.equal(job.terminal_reason_code, 'synthetic_core_block');
  assert.equal(job.claim_ceiling, 'rejected_or_blocked');
  assert.equal(fx.service.recoverInterruptedJobs().recovered, 0);
});

test('failed and interrupted core outcomes use the same terminal CAS convergence', (t) => {
  const fx = fixture(t, '112');
  for (const [status, marker] of [['failed', '7'], ['interrupted', 'a']]) {
    const { created } = createQueuedJob(fx, { marker });
    const operationId = `wfo_${marker.repeat(32)}`;
    const claimed = fx.service.claimJob({
      jobId: created.job.job_id,
      expectedStateVersion: created.job.state_version,
      operationId,
    });
    const reason = `synthetic_core_${status}`;
    fx.service.convergeCoreOutcome({
      jobId: created.job.job_id,
      expectedStateVersion: claimed.state_version,
      operationId,
      outcome: {
        schema: 'soulforge.workflow_job_outcome.v1',
        state: { job_id: created.job.job_id, status, terminal_reason_code: reason },
        result: null, receipt_confirmation: null, error: { code: reason },
        recovery: { status: 'not_required', artifact_refs: [], reason_code: null, receipt_confirmation: null },
        replayed: false,
      },
    });
    const row = fx.service.jobRow(created.job.job_id);
    assert.equal(row.status, status);
    assert.equal(row.terminal_reason_code, reason);
    assert.equal(row.claim_ceiling, 'rejected_or_blocked');
  }
});

test('receipt sink accepts canonical metadata only under a companion _workmeta root', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'dev-erp-receipt-'));
  const workmetaRoot = join(root, '_workmeta');
  const receiptStore = new WorkflowJobReceiptStore({ repositoryRoot: root });
  t.after(() => {
    const resolved = resolve(root);
    assert.ok(resolved.startsWith(resolve(tmpdir())));
    rmSync(resolved, { recursive: true, force: true });
  });
  const jobId = 'wfj_' + 'a'.repeat(32);
  const projectCode = 'P26-999';
  assert.throws(() => receiptStore.persist({
    projectCode,
    jobId,
    bytes: Buffer.from(`${canonicalJson({
      schema: 'soulforge.workflow_receipt.v1',
      job_id: jobId,
      content: '# report body must not be here',
    })}\n`),
  }), (error) => errorCode(error) === 'workflow_receipt_contains_body');
  assert.equal(existsSync(join(workmetaRoot, projectCode, 'runs', jobId, 'workflow_receipt.json')), false);

  const firstBytes = Buffer.from(`${canonicalJson({ schema: 'soulforge.workflow_receipt.v1', job_id: jobId, status: 'complete' })}\n`);
  receiptStore.persist({ projectCode, jobId, bytes: firstBytes });
  const finalPath = join(workmetaRoot, projectCode, 'runs', jobId, 'workflow_receipt.json');
  assert.equal(readFileSync(finalPath).equals(firstBytes), true);
  const differentBytes = Buffer.from(`${canonicalJson({ schema: 'soulforge.workflow_receipt.v1', job_id: jobId, status: 'different' })}\n`);
  assert.throws(() => receiptStore.persist({ projectCode, jobId, bytes: differentBytes }));
  assert.equal(readFileSync(finalPath).equals(firstBytes), true);
});

test('artifact store enforces the exact 393216-byte aggregate output boundary', (t) => {
  const fx = fixture(t, '110');
  const makeArtifacts = (total) => WORKFLOW_ARTIFACT_ROLES.map((role, index) => ({
    role,
    media_type: WORKFLOW_ARTIFACT_MEDIA_TYPES[role],
    bytes: Buffer.alloc(index === 0 ? total - (WORKFLOW_ARTIFACT_ROLES.length - 1) : 1, 0x61),
  }));
  const persisted = fx.payloadStore.persistArtifactSet({
    jobId: 'wfj_' + 'b'.repeat(32),
    operationId: 'wfo_' + 'b'.repeat(32),
    artifacts: makeArtifacts(393_216),
  });
  assert.equal(persisted.reduce((sum, artifact) => sum + artifact.size, 0), 393_216);
  assert.throws(() => fx.payloadStore.persistArtifactSet({
    jobId: 'wfj_' + 'c'.repeat(32),
    operationId: 'wfo_' + 'c'.repeat(32),
    artifacts: makeArtifacts(393_217),
  }), /workflow_artifact_total_too_large/);
});

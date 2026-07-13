import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { buildFixedRunnerRequest, canonicalJson, sha256Canonical } from '../src/workflow_job_contract.mjs';
import { WorkflowJobOrchestrator } from '../src/workflow_job_orchestrator.mjs';
import { WorkflowJobPayloadStore } from '../src/workflow_job_payload_store.mjs';
import { WorkflowJobReceiptStore } from '../src/workflow_job_receipt_store.mjs';
import { WorkflowJobRunnerBridge } from '../src/workflow_job_runner_bridge.mjs';
import { WorkflowJobService } from '../src/workflow_job_service.mjs';
import { openStore } from '../src/store.mjs';

const externalCoreRoot = String(process.env.DEV_ERP_TEST_CORE_ROOT || '').trim();
const coreUrl = (relativePath) => externalCoreRoot
  ? pathToFileURL(join(resolve(externalCoreRoot), ...relativePath.split('/')))
  : new URL(`../../../../${relativePath}`, import.meta.url);
const coreContractUrl = coreUrl('guild_hall/workflow_runner/contract.mjs');
const corePresent = existsSync(fileURLToPath(coreContractUrl));
const coreIndexUrl = coreUrl('guild_hall/workflow_runner/index.mjs');
const coreFixtureUrl = coreUrl('.workflow/report_authoring_v0/fixtures/synthetic_report_document.json');
const coreBindingUrl = coreUrl('.workflow/report_authoring_v0/runtime_binding.json');

const PASS_IDS = Object.freeze({
  technical_content: ['source_fidelity', 'protected_fields', 'citation_resolution', 'conditions_scope', 'authorized_changes'],
  evidence_logic: ['role_matrix', 'evidence_logic', 'claim_ceiling', 'conclusion_support', 'unconfirmed_handling'],
  derive_executive_summary: ['body_claim_paths', 'no_summary_only_claim', 'verdict_scope', 'action_support'],
  final_polish: ['grammar_tone', 'semantic_delta_none', 'reader_projection', 'technical_terms_preserved', 'no_detector_or_word_blacklist'],
});

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function passRecord(stage) {
  return {
    schema: 'soulforge.editorial_pass_record.v1',
    stage,
    status: 'pass',
    checks: PASS_IDS[stage].map((id) => ({ id, applicable: true, answer: 'yes', evidence_refs: ['fixture:source'], blocker_code: null })),
  };
}

function erpPassReceipt({ role, nonce, inputSha256, outputSha256, pid }) {
  const author = role === 'author';
  const payload = {
    schema: 'dev_erp.workflow_pass_receipt.v1',
    role,
    operation_id: `wfo_${author ? 'a' : 'd'}`.padEnd(36, author ? 'a' : 'd'),
    operation_nonce_sha256: digest(nonce),
    process_instance_id: `actual-core-${role}-${pid}`,
    child_pid: pid,
    started_at: author ? '2026-07-13T00:00:00.000Z' : '2026-07-13T00:00:03.000Z',
    finished_at: author ? '2026-07-13T00:00:01.000Z' : '2026-07-13T00:00:04.000Z',
    terminated_at: author ? '2026-07-13T00:00:02.000Z' : '2026-07-13T00:00:05.000Z',
    bundle_sha256: null,
    input_sha256: inputSha256,
    output_sha256: outputSha256,
    permission_profile_revision: 'e'.repeat(64),
    skills: [], instruction_sources: [], sandbox_mode: 'read-only', writable_roots: [],
    network_access: false, approval_policy: 'never',
    context_sha256: author ? '1'.repeat(64) : '2'.repeat(64),
  };
  return payload;
}

test('ERP fixed request passes the actual shared runner validator', { skip: !corePresent }, async () => {
  const core = await import(coreContractUrl.href);
  assert.equal(typeof core.validateWorkflowJobRequest, 'function');
  const request = buildFixedRunnerRequest({
    job: {
      job_id: 'wfj_' + '1'.repeat(32),
      idempotency_key: 'wfi_' + '2'.repeat(32),
      mode: 'final_polish',
      project_code: 'P26-001',
      actor_account_id: 'acct_owner',
      report_type: 'analysis',
      audience: 'internal_review',
    },
    inputs: [{
      role: 'draft',
      body_ref: `wjb:draft:${'a'.repeat(64)}`,
      body_sha256: 'a'.repeat(64),
      body_size: 16,
      media_type: 'text/markdown; charset=utf-8',
    }],
  });
  const validated = core.validateWorkflowJobRequest(request);
  assert.ok(validated);
  assert.equal(request.workflow_id, 'report_authoring_v0');
  assert.deepEqual(request.output_formats, ['md', 'html']);
});

test('actual core runner plus ERP adapters converges queued to terminal and survives a startup sweep', { skip: !corePresent }, async (t) => {
  const core = await import(coreIndexUrl.href);
  const document = JSON.parse(readFileSync(coreFixtureUrl, 'utf8'));
  const binding = JSON.parse(readFileSync(coreBindingUrl, 'utf8'));
  const bundleSha256 = binding.bundle_digest;
  const backendRoot = mkdtempSync(join(tmpdir(), 'dev-erp-actual-core-'));
  const store = openStore(':memory:');
  const owner = store.createAccount({ username: 'actual_core_owner', password: 'pw123456', roles: ['admin'] }).id;
  const project = store.createProject({ id: 'P26-901', title: 'Actual core candidate harness' }).project;
  const payloadStore = new WorkflowJobPayloadStore({ backendRoot });
  const service = new WorkflowJobService({ store, payloadStore, bundleSha256 });
  t.after(() => {
    store.db.close();
    const root = resolve(backendRoot);
    assert.ok(root.startsWith(resolve(tmpdir())));
    rmSync(root, { recursive: true, force: true });
  });

  document.project_code = project.id;
  const draftBytes = Buffer.from(`${canonicalJson(document)}\n`, 'utf8');
  const upload = service.createInput({
    accountId: owner,
    canAccessProject: (value) => value === project.id,
    project_code: project.id,
    role: 'draft',
    media_type: 'application/json; charset=utf-8',
    bytes: draftBytes,
  });
  const created = service.createJob({
    accountId: owner,
    canAccessProject: (value) => value === project.id,
    idempotencyKey: 'wfi_' + '9'.repeat(32),
    request: {
      schema: 'dev_erp.workflow_job_create.v1', project_code: project.id, mode: 'final_polish',
      report_type: document.report_type, audience: document.audience, input_handles: [upload.input.handle_id],
    },
  });
  let forceVerifierFailure = false;
  const bridge = new WorkflowJobRunnerBridge(externalCoreRoot ? {
    moduleLoader: async () => import(coreIndexUrl.href),
  } : {});
  const orchestrator = new WorkflowJobOrchestrator({
    service,
    payloadStore,
    receiptStore: new WorkflowJobReceiptStore({ repositoryRoot: backendRoot }),
    runnerBridge: bridge,
    bundleSha256,
    async buildWorkerAdapters({ job, passChallenges }) {
      const authorOutput = 'c'.repeat(64);
      const author = erpPassReceipt({
        role: 'author', nonce: Buffer.from(passChallenges.author_nonce_base64url, 'base64url'),
        inputSha256: '9'.repeat(64), outputSha256: authorOutput, pid: 3101,
      });
      const verifier = erpPassReceipt({
        role: 'verifier', nonce: Buffer.from(passChallenges.verifier_nonce_base64url, 'base64url'),
        inputSha256: authorOutput, outputSha256: 'f'.repeat(64), pid: 3102,
      });
      author.bundle_sha256 = bundleSha256;
      verifier.bundle_sha256 = bundleSha256;
      author.receipt_sha256 = sha256Canonical(author);
      verifier.receipt_sha256 = sha256Canonical(verifier);
      return {
        stateAdapter: core.createFilesystemStateAdapter({
          root: join(backendRoot, '_workspaces', 'system', 'dev-erp', 'workflow-state'),
          repositoryRoot: backendRoot,
        }),
        executorAdapter: {
          async buildProtectedBaseline() {
            return {
              manifest: structuredClone(document.semantic_manifest), actor_ref: 'actor:baseline',
              run_ref: `run:${job.job_id}:baseline`, context_ref: `context:${job.job_id}:baseline`,
              identity_attestation_ref: `attestation:${job.job_id}:baseline`,
            };
          },
          async runStage(context) {
            return {
              document: structuredClone(document),
              actor_ref: context.stage === 'final_polish' ? 'actor:rewriter' : `actor:${context.stage}`,
              run_ref: `run:${job.job_id}:${context.stage}`, context_ref: `context:${job.job_id}:${context.stage}`,
              identity_attestation_ref: `attestation:${job.job_id}:${context.stage}`,
              pass_record: context.stage === 'draft' ? null : passRecord(context.stage),
            };
          },
        },
        verifierAdapter: {
          async verify(context) {
            return {
              schema: 'soulforge.semantic_verifier_result.v1', status: forceVerifierFailure ? 'fail' : 'pass', actor_ref: 'actor:verifier',
              run_ref: `run:${job.job_id}:verifier`, context_ref: `context:${job.job_id}:verifier`,
              identity_attestation_ref: `attestation:${job.job_id}:verifier`,
              checked_inputs: context.checked_input_contract.map(({ role, payload_ref, sha256 }) => ({ role, payload_ref, sha256 })),
              candidate_document_sha256: sha256Canonical(context.final_document),
              baseline_manifest_sha256: sha256Canonical(context.baseline_manifest),
              reason_codes: forceVerifierFailure ? ['synthetic_semantic_mismatch'] : [],
              unresolved_differences: forceVerifierFailure ? ['candidate requires manual review'] : [],
              completed_at: '2026-07-13T00:00:30.000Z',
            };
          },
        },
        identityAdapter: {
          async verifySeparation({ finalRewriter, verifier: semanticVerifier }) {
            return {
              status: 'pass', authority_ref: 'authority:actual-core-candidate', authority_record_sha256: '3'.repeat(64),
              identity_claim: 'local_context_separation_declared', deployment_attestation_ref: null,
              author_pass_receipt_sha256: sha256Canonical(finalRewriter),
              verifier_pass_receipt_sha256: sha256Canonical(semanticVerifier),
            };
          },
        },
        async getPassReceipts() { return { author, verifier }; },
      };
    },
  });

  const outcome = await orchestrator.run({
    accountId: owner,
    canAccessProject: (value) => value === project.id,
    jobId: created.job.job_id,
    expectedStateVersion: created.job.state_version,
    operationId: 'wfo_' + '9'.repeat(32),
  });
  assert.equal(outcome.state.status, 'succeeded');
  assert.equal(outcome.result.identity_assurance.claim, 'local_context_separation_declared');
  const row = service.jobRow(created.job.job_id);
  assert.equal(row.status, 'succeeded');
  assert.equal(row.result_sha256, sha256Canonical(outcome.result));
  assert.equal(row.result_json, canonicalJson(outcome.result));
  assert.equal(row.claim_ceiling, outcome.result.claim_ceiling);
  assert.equal(row.receipt_sha256, outcome.receipt_confirmation.sha256);

  forceVerifierFailure = true;
  const blockedUpload = service.createInput({
    accountId: owner,
    canAccessProject: (value) => value === project.id,
    project_code: project.id,
    role: 'draft',
    media_type: 'application/json',
    bytes: draftBytes,
  });
  const blockedCreated = service.createJob({
    accountId: owner,
    canAccessProject: (value) => value === project.id,
    idempotencyKey: 'wfi_' + '8'.repeat(32),
    request: {
      schema: 'dev_erp.workflow_job_create.v1', project_code: project.id, mode: 'final_polish',
      report_type: document.report_type, audience: document.audience, input_handles: [blockedUpload.input.handle_id],
    },
  });
  const blockedOutcome = await orchestrator.run({
    accountId: owner,
    canAccessProject: (value) => value === project.id,
    jobId: blockedCreated.job.job_id,
    expectedStateVersion: blockedCreated.job.state_version,
    operationId: 'wfo_' + '8'.repeat(32),
  });
  assert.equal(blockedOutcome.state.status, 'blocked');
  const blockedRow = service.jobRow(blockedCreated.job.job_id);
  assert.equal(blockedRow.status, 'blocked');
  assert.equal(blockedRow.terminal_reason_code, blockedOutcome.state.terminal_reason_code);
  assert.equal(blockedRow.claim_ceiling, 'rejected_or_blocked');

  const restartedService = new WorkflowJobService({ store, payloadStore, bundleSha256 });
  assert.deepEqual(restartedService.recoverInterruptedJobs(), { recovered: 0, adopted: 0, blocked: 0 });
  assert.equal(restartedService.jobRow(created.job.job_id).status, 'succeeded');
});

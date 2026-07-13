import {
  SHA256_RE,
  WORKFLOW_OPERATION_ID_RE,
  canonicalJson,
  sha256Bytes,
  sha256Canonical,
} from './workflow_job_contract.mjs';

function fail(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  throw error;
}

function requireMethod(owner, name, code = 'workflow_worker_adapter_invalid') {
  if (!owner || typeof owner[name] !== 'function') fail(code, 503);
}

function hasExactKeys(value, keys) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function validateWorkerAdapters(value) {
  if (!value || Object.keys(value).sort().join(',') !== [
    'executorAdapter',
    'getPassReceipts',
    'identityAdapter',
    'stateAdapter',
    'verifierAdapter',
  ].sort().join(',')) fail('workflow_worker_adapter_invalid', 503);
  for (const method of ['open', 'compareAndSwap', 'recordJournal', 'snapshot', 'recoverRunning', 'recordOutcome']) {
    requireMethod(value.stateAdapter, method);
  }
  requireMethod(value.executorAdapter, 'buildProtectedBaseline');
  requireMethod(value.executorAdapter, 'runStage');
  requireMethod(value.verifierAdapter, 'verify');
  requireMethod(value.identityAdapter, 'verifySeparation');
  requireMethod(value, 'getPassReceipts');
  return value;
}

function exactArtifactInput(artifacts) {
  if (!Array.isArray(artifacts)) fail('workflow_runner_artifacts_invalid');
  return artifacts.map((artifact) => {
    if (!artifact
      || Object.keys(artifact).sort().join(',') !== 'bytes,mediaType,role'
      || !Buffer.isBuffer(artifact.bytes)
      || typeof artifact.mediaType !== 'string') {
      fail('workflow_runner_artifacts_invalid');
    }
    return { role: artifact.role, media_type: artifact.mediaType, bytes: artifact.bytes };
  });
}

export class WorkflowJobOrchestrator {
  constructor({ service, payloadStore, receiptStore, runnerBridge, bundleSha256, buildWorkerAdapters }) {
    if (!service || !payloadStore || !receiptStore || !runnerBridge || typeof buildWorkerAdapters !== 'function') {
      fail('workflow_orchestrator_configuration_invalid', 503);
    }
    this.service = service;
    this.payloadStore = payloadStore;
    this.receiptStore = receiptStore;
    this.runnerBridge = runnerBridge;
    this.bundleSha256 = bundleSha256;
    this.buildWorkerAdapters = buildWorkerAdapters;
    this.activeJobs = new Set();
  }

  async run({ accountId, canAccessProject, jobId, expectedStateVersion, operationId }) {
    if (!WORKFLOW_OPERATION_ID_RE.test(operationId)) fail('workflow_operation_id_invalid');
    if (this.activeJobs.has(jobId)) fail('workflow_job_already_running', 409);
    this.activeJobs.add(jobId);
    let serviceStateVersion = expectedStateVersion;
    let artifactWrites = 0;
    let receiptWrites = 0;
    let preparedCoreResult = null;
    let persistedReceiptConfirmation = null;
    try {
      const claimed = this.service.claimJob({ jobId, expectedStateVersion, operationId });
      serviceStateVersion = claimed.state_version;
      const dispatch = this.service.dispatchPacket({ accountId, canAccessProject, jobId });
      await this.runnerBridge.validateRequest(dispatch.request);
      const requestSha256 = sha256Canonical(dispatch.request);
      const worker = validateWorkerAdapters(await this.buildWorkerAdapters({
        job: claimed,
        request: dispatch.request,
        passChallenges: claimed.pass_challenges,
      }));
      const payloads = new Map(dispatch.payloads.map((item) => [item.descriptor.payload_ref, item]));
      const requestRefs = new Map(dispatch.request.input_refs.map((ref) => [ref.payload_ref, ref]));

      const stateAdapter = {
        open: (...args) => worker.stateAdapter.open(...args),
        compareAndSwap: (...args) => worker.stateAdapter.compareAndSwap(...args),
        snapshot: (...args) => worker.stateAdapter.snapshot(...args),
        recoverRunning: (...args) => worker.stateAdapter.recoverRunning(...args),
        recordOutcome: (...args) => worker.stateAdapter.recordOutcome(...args),
        recordJournal: async (entry) => {
          if (entry?.name === 'prepared_execution') {
            const journal = entry.value;
            if (!hasExactKeys(journal, [
              'schema', 'request_sha256', 'workflow_bundle_sha256', 'candidate_document_sha256', 'execution_sha256', 'execution',
            ])
              || journal.schema !== 'soulforge.workflow_prepared_execution_journal.v1'
              || journal.request_sha256 !== requestSha256
              || journal.workflow_bundle_sha256 !== this.bundleSha256
              || !SHA256_RE.test(journal.candidate_document_sha256)
              || !SHA256_RE.test(journal.execution_sha256)
              || !hasExactKeys(journal.execution, [
                'result', 'finalDocument', 'finalRewriter', 'verdict', 'preservation', 'boundaryScan',
                'storageAttestation', 'summaryDerivation', 'identityAttestation',
              ])
              || sha256Canonical(journal.execution) !== journal.execution_sha256
              || sha256Canonical(journal.execution.finalDocument) !== journal.candidate_document_sha256
              || sha256Canonical(journal.execution.finalRewriter?.document) !== journal.candidate_document_sha256
              || journal.execution.verdict?.candidate_document_sha256 !== journal.candidate_document_sha256) {
              fail('workflow_prepared_execution_binding_mismatch', 409);
            }
            const validated = await this.runnerBridge.validateResult(journal.execution.result);
            if (validated.job_id !== jobId
              || validated.workflow_id !== dispatch.request.workflow_id
              || validated.binding_revision !== dispatch.request.workflow_binding_revision) {
              fail('workflow_prepared_execution_binding_mismatch', 409);
            }
            if (preparedCoreResult !== null && canonicalJson(preparedCoreResult) !== canonicalJson(validated)) {
              fail('workflow_prepared_execution_conflict', 409);
            }
            preparedCoreResult = JSON.parse(canonicalJson(validated));
          }
          return worker.stateAdapter.recordJournal(entry);
        },
      };

      const payloadAdapter = {
        read: (ref) => {
          if (!ref
            || Object.keys(ref).sort().join(',') !== 'media_type,payload_ref,role,sha256,size'
            || canonicalJson(requestRefs.get(ref.payload_ref)) !== canonicalJson(ref)) {
            fail('workflow_payload_ref_unbound', 403);
          }
          const item = payloads.get(ref.payload_ref);
          if (!item
            || item.descriptor.sha256 !== ref.sha256
            || item.descriptor.size !== ref.size
            || item.bytes.length !== ref.size
            || sha256Bytes(item.bytes) !== ref.sha256) fail('workflow_payload_ref_unbound', 403);
          return Buffer.from(item.bytes);
        },
      };

      const artifactAdapter = {
        writeArtifactSet: async ({ jobId: coreJobId, projectCode, artifacts, beforeArtifactCommit }) => {
          if (coreJobId !== jobId || projectCode !== claimed.project_code || typeof beforeArtifactCommit !== 'function') {
            fail('workflow_artifact_adapter_scope_invalid', 403);
          }
          artifactWrites += 1;
          if (artifactWrites !== 1) fail('workflow_artifact_double_write', 409);
          const receipts = await worker.getPassReceipts();
          if (!receipts || Object.keys(receipts).sort().join(',') !== 'author,verifier') {
            fail('workflow_pass_receipts_missing', 409);
          }
          const recorded = this.service.recordPassReceipts({
            jobId,
            expectedStateVersion: serviceStateVersion,
            author: receipts.author,
            verifier: receipts.verifier,
          });
          serviceStateVersion = recorded.state_version;
          const serviceArtifacts = exactArtifactInput(artifacts);
          const preview = this.service.previewArtifactCommit({ jobId, operationId, artifacts: serviceArtifacts });
          await beforeArtifactCommit({
            artifactRefs: preview.artifact_refs,
            storageAttestation: preview.storage_attestation,
          });
          if (!preparedCoreResult
            || canonicalJson(preparedCoreResult.artifact_refs) !== canonicalJson(preview.artifact_refs)) {
            fail('workflow_prepared_execution_result_missing', 409);
          }
          const persisted = this.service.persistResult({
            jobId,
            expectedStateVersion: serviceStateVersion,
            operationId,
            artifacts: serviceArtifacts,
            result: preparedCoreResult,
          });
          serviceStateVersion = persisted.job.state_version;
          if (persisted.result_sha256 !== sha256Canonical(preparedCoreResult)
            || canonicalJson(persisted.result) !== canonicalJson(preparedCoreResult)) {
            fail('workflow_persisted_result_mismatch', 409);
          }
          return {
            artifact_refs: persisted.result.artifact_refs,
            storage_attestation: preview.storage_attestation,
          };
        },
        adoptArtifactSet: async ({ jobId: coreJobId, projectCode, artifactRefs }) => {
          if (coreJobId !== jobId || projectCode !== claimed.project_code) fail('workflow_artifact_adapter_scope_invalid', 403);
          const adopted = this.payloadStore.adoptArtifactSet({ jobId, operationId });
          if (canonicalJson(adopted) !== canonicalJson(artifactRefs)) fail('workflow_artifact_adoption_conflict', 409);
          return {
            artifact_refs: adopted,
            storage_attestation: {
              storage_class: 'workspace_system',
              project_code: claimed.project_code,
              owner_approval_ref: null,
              report_bodies_in_workmeta: false,
              public_repo_storage: false,
              atomic_no_overwrite: true,
            },
            adopted: true,
          };
        },
      };

      const receiptAdapter = {
        write: async ({ receipt, bytes, projectCode }) => {
          if (!receipt || projectCode !== claimed.project_code || !Buffer.isBuffer(bytes)) {
            fail('workflow_receipt_adapter_scope_invalid', 403);
          }
          receiptWrites += 1;
          if (receiptWrites !== 1) fail('workflow_receipt_double_write', 409);
          const validatedReceipt = await this.runnerBridge.validateReceipt(receipt);
          if (!Buffer.from(`${canonicalJson(validatedReceipt)}\n`, 'utf8').equals(bytes)
            || !preparedCoreResult
            || validatedReceipt.job_id !== jobId
            || validatedReceipt.workflow_id !== dispatch.request.workflow_id
            || validatedReceipt.binding_revision !== dispatch.request.workflow_binding_revision
            || validatedReceipt.request_sha256 !== requestSha256
            || validatedReceipt.workflow_bundle_sha256 !== this.bundleSha256
            || validatedReceipt.result_sha256 !== sha256Canonical(preparedCoreResult)
            || canonicalJson(validatedReceipt.input_refs) !== canonicalJson(dispatch.request.input_refs)
            || canonicalJson(validatedReceipt.output_refs) !== canonicalJson(preparedCoreResult.artifact_refs)
            || !['local_context_separation_declared', 'deployment_attested_process_separation'].includes(validatedReceipt.execution.identity_claim)) {
            fail('workflow_receipt_binding_mismatch', 409);
          }
          const confirmation = this.receiptStore.persist({
            projectCode: claimed.project_code,
            jobId,
            bytes,
          });
          persistedReceiptConfirmation = {
            payload_ref: confirmation.payload_ref,
            sha256: confirmation.sha256,
            size: confirmation.size,
            media_type: confirmation.media_type,
          };
          return persistedReceiptConfirmation;
        },
      };

      const outcome = await this.runnerBridge.execute({
        request: dispatch.request,
        adapters: {
          stateAdapter,
          payloadAdapter,
          executorAdapter: worker.executorAdapter,
          verifierAdapter: worker.verifierAdapter,
          identityAdapter: worker.identityAdapter,
          artifactAdapter,
          receiptAdapter,
        },
        expectedBundleDigest: this.bundleSha256,
      });
      await this.runnerBridge.validateOutcome(outcome);
      if (outcome.state.status === 'succeeded') {
        if (artifactWrites !== 1 || receiptWrites !== 1) fail('workflow_runner_success_without_single_commit', 409);
        if (!preparedCoreResult
          || canonicalJson(outcome.result) !== canonicalJson(preparedCoreResult)
          || sha256Canonical(outcome.result) !== sha256Canonical(preparedCoreResult)
          || canonicalJson(outcome.receipt_confirmation) !== canonicalJson(persistedReceiptConfirmation)) {
          fail('workflow_outcome_ingest_mismatch', 409);
        }
      }
      const converged = this.service.convergeCoreOutcome({
        jobId,
        expectedStateVersion: serviceStateVersion,
        operationId,
        outcome,
        persistedReceiptConfirmation,
      });
      serviceStateVersion = converged.job.state_version;
      return outcome;
    } catch (error) {
      try {
        const current = this.service.jobRow(jobId);
        if (current.status === 'running' && current.phase === 'receipt') {
          this.service.markReceiptState({
            jobId,
            expectedStateVersion: current.state_version,
            status: 'interrupted',
            reasonCode: 'runner_interrupted_after_artifact_commit',
          });
        }
      } catch {}
      throw error;
    } finally {
      this.activeJobs.delete(jobId);
    }
  }
}

export function createWorkflowJobOrchestrator(options) {
  return new WorkflowJobOrchestrator(options);
}

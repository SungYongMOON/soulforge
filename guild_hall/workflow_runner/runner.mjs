import { canonicalJson, sha256Bytes, sha256Canonical } from "./canonical.mjs";
import { loadStaticWorkflowBinding } from "./catalog.mjs";
import { validateSchemaContract } from "./schema_runtime.mjs";
import {
  validateReportDocument,
  validateSemanticVerifierResult,
  validateWorkflowJobOutcome,
  validateWorkflowJobRequest,
  validateWorkflowJobResult,
  validateWorkflowReceipt,
} from "./contract.mjs";
import { WorkflowRunnerError, fail } from "./errors.mjs";
import {
  createInitialState,
  phaseTransitionDigest,
  transitionState,
} from "./state_machine.mjs";

const OPAQUE_REF = /^[a-z][a-z0-9_-]{1,31}:[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PHASE_INDEX = new Map(["validate", "intake", "draft", "technical_content", "evidence_logic", "derive_executive_summary", "final_polish", "preservation", "semantic_verify", "document_validate", "render", "boundary", "receipt"].map((phase, index) => [phase, index]));

function exactFields(value, fields, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code, "Durable journal must be an object");
  const expected = [...fields].sort();
  if (Object.keys(value).sort().join("\u0000") !== expected.join("\u0000")) fail(code, "Durable journal fields are not exact");
}

function preparedExecutionJournal({ requestSha256, bundleDigest, execution }) {
  return {
    schema: "soulforge.workflow_prepared_execution_journal.v1",
    request_sha256: requestSha256,
    workflow_bundle_sha256: bundleDigest,
    candidate_document_sha256: sha256Canonical(execution.finalDocument),
    execution_sha256: sha256Canonical(execution),
    execution,
  };
}

function validatePreparedExecutionJournal(journal, { requestSha256, bundleDigest }) {
  exactFields(journal, ["schema", "request_sha256", "workflow_bundle_sha256", "candidate_document_sha256", "execution_sha256", "execution"], "prepared_execution_journal_invalid");
  if (journal.schema !== "soulforge.workflow_prepared_execution_journal.v1"
    || journal.request_sha256 !== requestSha256
    || journal.workflow_bundle_sha256 !== bundleDigest
    || !SHA256.test(journal.candidate_document_sha256)
    || !SHA256.test(journal.execution_sha256)) {
    fail("prepared_execution_journal_binding_mismatch", "Prepared execution journal is not bound to this request and workflow bundle");
  }
  exactFields(journal.execution, ["result", "finalDocument", "finalRewriter", "verdict", "preservation", "boundaryScan", "storageAttestation", "summaryDerivation", "identityAttestation"], "prepared_execution_payload_invalid");
  validateWorkflowJobResult(journal.execution.result);
  validateReportDocument(journal.execution.finalDocument);
  validateSemanticVerifierResult(journal.execution.verdict);
  if (sha256Canonical(journal.execution) !== journal.execution_sha256
    || sha256Canonical(journal.execution.finalDocument) !== journal.candidate_document_sha256
    || sha256Canonical(journal.execution.finalRewriter.document) !== journal.candidate_document_sha256
    || journal.execution.verdict.candidate_document_sha256 !== journal.candidate_document_sha256) {
    fail("prepared_execution_journal_hash_mismatch", "Prepared execution journal hashes do not match its exact candidate and execution");
  }
  if (canonicalJson(journal.execution.result.artifact_refs) !== canonicalJson(journal.execution.result.artifact_refs.map((ref) => ({ ...ref })))) {
    fail("prepared_execution_journal_artifact_refs_invalid", "Prepared execution artifact refs are not canonical");
  }
  return journal.execution;
}

function receiptIntentRecord({ requestSha256, bundleDigest, receipt, receiptBytes }) {
  return {
    schema: "soulforge.workflow_receipt_intent.v1",
    request_sha256: requestSha256,
    workflow_bundle_sha256: bundleDigest,
    receipt_sha256: sha256Bytes(receiptBytes),
    receipt_size: receiptBytes.length,
    receipt,
  };
}

function validateReceiptIntent(record, { requestSha256, bundleDigest, execution }) {
  exactFields(record, ["schema", "request_sha256", "workflow_bundle_sha256", "receipt_sha256", "receipt_size", "receipt"], "receipt_intent_invalid");
  validateWorkflowReceipt(record.receipt);
  const bytes = Buffer.from(`${canonicalJson(record.receipt)}\n`, "utf8");
  if (record.schema !== "soulforge.workflow_receipt_intent.v1"
    || record.request_sha256 !== requestSha256
    || record.workflow_bundle_sha256 !== bundleDigest
    || record.receipt_sha256 !== sha256Bytes(bytes)
    || record.receipt_size !== bytes.length
    || record.receipt.result_sha256 !== sha256Canonical(execution.result)
    || canonicalJson(record.receipt.output_refs) !== canonicalJson(execution.result.artifact_refs)) {
    fail("receipt_intent_binding_mismatch", "Receipt intent does not match the durable prepared execution");
  }
  return { receipt: record.receipt, bytes };
}

function receiptConfirmationRecord({ requestSha256, bundleDigest, receiptSha256, confirmation }) {
  return {
    schema: "soulforge.workflow_receipt_confirmation_journal.v1",
    request_sha256: requestSha256,
    workflow_bundle_sha256: bundleDigest,
    receipt_sha256: receiptSha256,
    confirmation,
  };
}

function validateReceiptConfirmationJournal(record, { requestSha256, bundleDigest, receiptSha256 }) {
  exactFields(record, ["schema", "request_sha256", "workflow_bundle_sha256", "receipt_sha256", "confirmation"], "receipt_confirmation_journal_invalid");
  if (record.schema !== "soulforge.workflow_receipt_confirmation_journal.v1"
    || record.request_sha256 !== requestSha256
    || record.workflow_bundle_sha256 !== bundleDigest
    || record.receipt_sha256 !== receiptSha256) {
    fail("receipt_confirmation_journal_binding_mismatch", "Receipt confirmation journal does not match the receipt intent");
  }
  return record.confirmation;
}

function terminalOutcomeIntentRecord({ requestSha256, bundleDigest, outcome }) {
  return {
    schema: "soulforge.workflow_terminal_outcome_intent.v1",
    request_sha256: requestSha256,
    workflow_bundle_sha256: bundleDigest,
    outcome_sha256: sha256Canonical(outcome),
    outcome,
  };
}

function validateTerminalOutcomeIntent(record, { requestSha256, bundleDigest }) {
  exactFields(record, ["schema", "request_sha256", "workflow_bundle_sha256", "outcome_sha256", "outcome"], "terminal_outcome_intent_invalid");
  const outcome = validateWorkflowJobOutcome(record.outcome);
  if (record.schema !== "soulforge.workflow_terminal_outcome_intent.v1"
    || record.request_sha256 !== requestSha256
    || record.workflow_bundle_sha256 !== bundleDigest
    || record.outcome_sha256 !== sha256Canonical(outcome)) {
    fail("terminal_outcome_intent_binding_mismatch", "Terminal outcome intent does not match this request and bundle");
  }
  return outcome;
}

function timestamp(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) fail("runner_clock_invalid", "Clock did not return a valid date");
  return date.toISOString();
}

function errorCode(error) {
  const value = error instanceof WorkflowRunnerError ? error.code : "workflow_runner_error";
  return /^[a-z][a-z0-9_]{0,95}$/.test(value) ? value : "workflow_runner_error";
}

function validateReceiptConfirmation(value, receiptBytes) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("receipt_confirmation_invalid", "Receipt adapter returned an invalid confirmation");
  const expected = ["payload_ref", "sha256", "size", "media_type"];
  const actual = Object.keys(value);
  if (actual.some((key) => !expected.includes(key)) || expected.some((key) => !Object.hasOwn(value, key))) {
    fail("receipt_confirmation_invalid", "Receipt confirmation fields are not exact");
  }
  if (typeof value.payload_ref !== "string" || !OPAQUE_REF.test(value.payload_ref)) fail("receipt_confirmation_ref", "Receipt confirmation ref must be opaque");
  if (typeof value.sha256 !== "string" || !SHA256.test(value.sha256) || value.sha256 !== sha256Bytes(receiptBytes)) fail("receipt_confirmation_hash", "Receipt confirmation hash mismatch");
  if (!Number.isSafeInteger(value.size) || value.size !== receiptBytes.length) fail("receipt_confirmation_size", "Receipt confirmation size mismatch");
  if (value.media_type !== "application/json") fail("receipt_confirmation_media_type", "Receipt confirmation media type must be application/json");
  return value;
}

function receiptFromExecution({ request, binding, bundleDigest, bundleIntegrityClaim, requestSha256, execution, history, startedAt, completedAt }) {
  const resultSha256 = sha256Canonical(execution.result);
  return validateWorkflowReceipt({
    schema: "soulforge.workflow_receipt.v1",
    job_id: request.job_id,
    workflow_id: "report_authoring_v0",
    request_sha256: requestSha256,
    result_sha256: resultSha256,
    workflow_bundle_sha256: bundleDigest,
    bundle_integrity_claim: bundleIntegrityClaim,
    runner_release: "workflow-runner.v1",
    binding_revision: binding.binding_revision,
    input_refs: request.input_refs.map((ref) => ({ ...ref })),
    output_refs: execution.result.artifact_refs.map((ref) => ({ ...ref })),
    execution: {
      request_actor_ref: request.actor_ref,
      final_rewriter_actor_ref: execution.finalRewriter.actor_ref,
      final_rewriter_run_ref: execution.finalRewriter.run_ref,
      final_rewriter_context_ref: execution.finalRewriter.context_ref,
      final_rewriter_identity_attestation_ref: execution.finalRewriter.identity_attestation_ref,
      semantic_verifier_actor_ref: execution.verdict.actor_ref,
      semantic_verifier_run_ref: execution.verdict.run_ref,
      semantic_verifier_context_ref: execution.verdict.context_ref,
      semantic_verifier_identity_attestation_ref: execution.verdict.identity_attestation_ref,
      identity_authority_ref: execution.identityAttestation.authority_ref,
      identity_authority_record_sha256: execution.identityAttestation.authority_record_sha256,
      identity_claim: execution.identityAttestation.identity_claim,
      deployment_attestation_ref: execution.identityAttestation.deployment_attestation_ref,
      author_pass_receipt_sha256: execution.identityAttestation.author_pass_receipt_sha256,
      verifier_pass_receipt_sha256: execution.identityAttestation.verifier_pass_receipt_sha256,
      model_ref: null,
      reasoning_ref: null,
    },
    phase_transition_digest_before_receipt_confirmation: phaseTransitionDigest(history),
    validator_summary: {
      request_contract: "pass",
      document_contract: "pass",
      deterministic_preservation: execution.preservation.status,
      lexical_guard: execution.preservation.lexical_guard.status,
      independent_semantic_verification: execution.verdict.status,
      render: "pass",
      boundary: "pass",
      counts: {
        protected_baseline: execution.preservation.counts.baseline,
        protected_candidate: execution.preservation.counts.candidate,
        protected_matched: execution.preservation.counts.matched,
        lexical_protected: execution.preservation.lexical_guard.protected_count,
        unconfirmed: execution.finalDocument.unconfirmed_items.length,
      },
    },
    boundary: {
      content_classification: execution.boundaryScan.content_classification,
      raw_input_payload_copy_detected: execution.boundaryScan.raw_input_payload_copy_detected,
      known_secret_pattern_scan_status: execution.boundaryScan.known_secret_pattern_scan_status,
      runtime_absolute_path_detected: execution.boundaryScan.runtime_absolute_path_detected,
      source_owned_absolute_path_count: execution.boundaryScan.source_owned_absolute_path_count,
      forbidden_internal_scaffold_detected: execution.boundaryScan.forbidden_internal_scaffold_detected,
      artifact_storage_class: execution.storageAttestation.storage_class,
      receipt_metadata_only: true,
    },
    started_at: startedAt,
    completed_at: completedAt,
    stop_error_code: null,
  });
}

export async function runWorkflowJob(request, adapters, { clock = () => new Date(), expectedBundleDigest = null, crashInjector = null } = {}) {
  await validateSchemaContract("request", request);
  validateWorkflowJobRequest(request);
  const { binding, handler, bundleDigest, policyBundle, integrity } = await loadStaticWorkflowBinding({ workflowId: request.workflow_id, mode: request.mode, expectedBundleDigest });
  if (request.workflow_binding_revision !== binding.binding_revision) fail("request_binding_revision_mismatch", "Request binding revision does not match the trusted bundle");
  const requestSha256 = sha256Canonical(request);
  if (!adapters.stateAdapter) fail("durable_state_adapter_missing", "A durable state adapter is required; the memory adapter is test-only");
  const stateAdapter = adapters.stateAdapter;
  const initialState = createInitialState({ jobId: request.job_id, requestSha256, clock });
  await validateSchemaContract("state", initialState);
  const opened = await stateAdapter.open({
    jobId: request.job_id,
    idempotencyKey: request.idempotency_key,
    requestSha256,
    initialState,
  });
  if (opened.replayed && opened.outcome) {
    const replayedOutcome = validateWorkflowJobOutcome({ ...opened.outcome, replayed: true });
    await validateSchemaContract("outcome", replayedOutcome);
    return replayedOutcome;
  }
  let state = opened.state;
  await validateSchemaContract("state", state);
  const journal = { ...(opened.journal ?? {}) };
  const startedAt = state.created_at;
  const setState = async ({ status, phase, terminalReasonCode = null, attempt = state.attempt }) => {
    const expectedStateVersion = state.state_version;
    const next = transitionState(state, { expectedStateVersion, status, phase, terminalReasonCode, attempt, clock });
    await validateSchemaContract("state", next);
    state = await stateAdapter.compareAndSwap({ jobId: request.job_id, expectedStateVersion, nextState: next });
    await validateSchemaContract("state", state);
    return state;
  };
  const advance = async (phase) => {
    if (state.status === "running" && PHASE_INDEX.get(phase) <= PHASE_INDEX.get(state.phase)) return state;
    return setState({ status: "running", phase, attempt: Math.max(1, state.attempt) });
  };
  const injectCrash = async (point) => {
    if (crashInjector) await crashInjector(point);
  };
  const recordTerminalOutcome = async ({ status, terminalReasonCode, result, receiptConfirmation: confirmedReceipt, error, recovery, replayed = false }) => {
    let outcome;
    let terminalIntent = journal.terminal_outcome_intent;
    if (terminalIntent) {
      outcome = validateTerminalOutcomeIntent(terminalIntent, { requestSha256, bundleDigest });
      if (outcome.state.state_version !== state.state_version + 1
        || outcome.state.status !== status
        || outcome.state.terminal_reason_code !== terminalReasonCode
        || canonicalJson(outcome.result) !== canonicalJson(result)
        || canonicalJson(outcome.receipt_confirmation) !== canonicalJson(confirmedReceipt)
        || canonicalJson(outcome.error) !== canonicalJson(error)
        || canonicalJson(outcome.recovery) !== canonicalJson(recovery)) {
        fail("terminal_outcome_intent_conflict", "Existing terminal outcome intent does not match the exact recovered execution");
      }
    } else {
      const nextState = transitionState(state, {
        expectedStateVersion: state.state_version,
        status,
        phase: state.phase,
        terminalReasonCode,
        attempt: state.attempt,
        clock,
      });
      outcome = validateWorkflowJobOutcome({
        schema: "soulforge.workflow_job_outcome.v1",
        state: nextState,
        result,
        receipt_confirmation: confirmedReceipt,
        error,
        recovery,
        replayed: false,
      });
      terminalIntent = terminalOutcomeIntentRecord({ requestSha256, bundleDigest, outcome });
      await stateAdapter.recordJournal({ jobId: request.job_id, name: "terminal_outcome_intent", value: terminalIntent });
      journal.terminal_outcome_intent = terminalIntent;
    }
    await validateSchemaContract("outcome", outcome);
    await injectCrash("after_terminal_outcome_intent");
    state = await stateAdapter.compareAndSwap({ jobId: request.job_id, expectedStateVersion: state.state_version, nextState: outcome.state });
    await injectCrash("after_terminal_state");
    await stateAdapter.recordOutcome({ jobId: request.job_id, outcome });
    await injectCrash("after_outcome_write");
    return replayed ? validateWorkflowJobOutcome({ ...outcome, replayed: true }) : outcome;
  };

  if (opened.replayed && state.status !== "queued" && state.status !== "running") {
    const terminalIntent = opened.journal?.terminal_outcome_intent;
    if (terminalIntent) {
      const intended = validateTerminalOutcomeIntent(terminalIntent, { requestSha256, bundleDigest });
      if (canonicalJson(intended.state) !== canonicalJson(state)) fail("terminal_outcome_state_mismatch", "Terminal state does not match its durable outcome intent");
      if (state.status === "succeeded") {
        const recoveredExecution = validatePreparedExecutionJournal(opened.journal?.prepared_execution, { requestSha256, bundleDigest });
        if (!adapters.artifactAdapter || typeof adapters.artifactAdapter.adoptArtifactSet !== "function") fail("artifact_adoption_adapter_missing", "Terminal recovery requires exact artifact adoption support");
        const adopted = await adapters.artifactAdapter.adoptArtifactSet({ jobId: request.job_id, projectCode: request.project_code, artifactRefs: recoveredExecution.result.artifact_refs });
        if (canonicalJson(adopted.artifact_refs) !== canonicalJson(recoveredExecution.result.artifact_refs)) fail("artifact_adoption_exact_match_failed", "Terminal recovery artifact set changed");
        const recoveredReceipt = validateReceiptIntent(opened.journal?.receipt_intent, { requestSha256, bundleDigest, execution: recoveredExecution });
        if (!adapters.receiptAdapter || typeof adapters.receiptAdapter.write !== "function") fail("receipt_sink_unavailable", "Terminal recovery requires the approved receipt sink");
        const confirmed = validateReceiptConfirmation(await adapters.receiptAdapter.write({ receipt: recoveredReceipt.receipt, bytes: recoveredReceipt.bytes, projectCode: request.project_code }), recoveredReceipt.bytes);
        const journaledConfirmation = validateReceiptConfirmationJournal(opened.journal?.receipt_confirmation, { requestSha256, bundleDigest, receiptSha256: sha256Bytes(recoveredReceipt.bytes) });
        if (canonicalJson(confirmed) !== canonicalJson(journaledConfirmation) || canonicalJson(confirmed) !== canonicalJson(intended.receipt_confirmation)) fail("receipt_confirmation_journal_conflict", "Terminal recovery receipt changed");
      }
      await stateAdapter.recordOutcome({ jobId: request.job_id, outcome: intended });
      return validateWorkflowJobOutcome({ ...intended, replayed: true });
    }
    if (state.status === "succeeded") fail("terminal_outcome_missing", "Succeeded durable state is missing its recorded outcome intent");
    return validateWorkflowJobOutcome({
      schema: "soulforge.workflow_job_outcome.v1",
      state,
      result: null,
      receipt_confirmation: null,
      error: { code: state.terminal_reason_code ?? "terminal_outcome_missing" },
      recovery: { status: "not_required", artifact_refs: [], reason_code: null, receipt_confirmation: null },
      replayed: true,
    });
  }

  let execution = null;
  let receiptConfirmed = false;
  let receiptConfirmation = null;
  try {
    if (state.status === "queued") await setState({ status: "running", phase: "validate", attempt: state.attempt + 1 });

    if (opened.replayed && journal.prepared_execution) {
      execution = validatePreparedExecutionJournal(journal.prepared_execution, { requestSha256, bundleDigest });
      if (!adapters.artifactAdapter || typeof adapters.artifactAdapter.adoptArtifactSet !== "function") {
        fail("artifact_adoption_adapter_missing", "Restart recovery requires exact artifact adoption support");
      }
      try {
        const adopted = await adapters.artifactAdapter.adoptArtifactSet({
          jobId: request.job_id,
          projectCode: request.project_code,
          artifactRefs: execution.result.artifact_refs,
        });
        if (canonicalJson(adopted.artifact_refs) !== canonicalJson(execution.result.artifact_refs)
          || canonicalJson(adopted.storage_attestation) !== canonicalJson(execution.storageAttestation)) {
          fail("artifact_adoption_exact_match_failed", "Adopted artifact attestation differs from the prepared execution journal");
        }
      } catch (error) {
        if (error?.code === "artifact_adoption_target_missing") {
          execution = null;
        } else if (error?.code === "artifact_adoption_exact_match_failed") {
          return recordTerminalOutcome({
            status: "blocked",
            terminalReasonCode: error.code,
            result: null,
            receiptConfirmation: null,
            error: { code: error.code },
            recovery: { status: "manual_required", artifact_refs: journal.prepared_execution.execution.result.artifact_refs, reason_code: "artifact_exact_match_failed", receipt_confirmation: null },
            replayed: true,
          });
        } else {
          throw error;
        }
      }
    }

    if (execution === null) {
      if (opened.replayed && state.status === "running" && adapters.preparedResultsOnly !== true) {
        const interrupted = await stateAdapter.recoverRunning({ jobId: request.job_id, clock });
        state = interrupted;
        return validateWorkflowJobOutcome({
          schema: "soulforge.workflow_job_outcome.v1",
          state,
          result: null,
          receipt_confirmation: null,
          error: { code: "runner_restart_requires_prepared_results" },
          recovery: { status: "not_required", artifact_refs: [], reason_code: null, receipt_confirmation: null },
          replayed: true,
        });
      }
      execution = await handler({
        request,
        binding,
        policyBundle,
        payloadAdapter: adapters.payloadAdapter,
        executorAdapter: adapters.executorAdapter,
        verifierAdapter: adapters.verifierAdapter,
        identityAdapter: adapters.identityAdapter,
        artifactAdapter: adapters.artifactAdapter,
        advance,
        workflowBundleSha256: bundleDigest,
        journalPreparedExecution: async (preparedExecution) => {
          const record = preparedExecutionJournal({ requestSha256, bundleDigest, execution: preparedExecution });
          await stateAdapter.recordJournal({ jobId: request.job_id, name: "prepared_execution", value: record });
          journal.prepared_execution = record;
        },
      });
      await injectCrash("after_artifact_commit");
    }

    await advance("receipt");
    if (!adapters.receiptAdapter || typeof adapters.receiptAdapter.write !== "function") {
      fail("receipt_sink_unavailable", "An approved metadata-only receipt adapter is required");
    }
    let receipt;
    let receiptBytes;
    if (journal.receipt_intent) {
      ({ receipt, bytes: receiptBytes } = validateReceiptIntent(journal.receipt_intent, { requestSha256, bundleDigest, execution }));
    } else {
      const snapshot = await stateAdapter.snapshot(request.job_id);
      receipt = receiptFromExecution({
        request,
        binding,
        bundleDigest,
        bundleIntegrityClaim: integrity.claim,
        requestSha256,
        execution,
        history: snapshot.history,
        startedAt,
        completedAt: timestamp(clock),
      });
      await validateSchemaContract("receipt", receipt);
      receiptBytes = Buffer.from(`${canonicalJson(receipt)}\n`, "utf8");
      const intent = receiptIntentRecord({ requestSha256, bundleDigest, receipt, receiptBytes });
      await stateAdapter.recordJournal({ jobId: request.job_id, name: "receipt_intent", value: intent });
      journal.receipt_intent = intent;
    }
    await injectCrash("before_receipt_write");
    receiptConfirmation = validateReceiptConfirmation(
      await adapters.receiptAdapter.write({ receipt, bytes: receiptBytes, projectCode: request.project_code }),
      receiptBytes,
    );
    await injectCrash("after_receipt_write");
    if (journal.receipt_confirmation) {
      const expectedConfirmation = validateReceiptConfirmationJournal(journal.receipt_confirmation, { requestSha256, bundleDigest, receiptSha256: sha256Bytes(receiptBytes) });
      if (canonicalJson(expectedConfirmation) !== canonicalJson(receiptConfirmation)) fail("receipt_confirmation_journal_conflict", "Recovered receipt confirmation does not match the durable journal");
    } else {
      const confirmationJournal = receiptConfirmationRecord({ requestSha256, bundleDigest, receiptSha256: sha256Bytes(receiptBytes), confirmation: receiptConfirmation });
      await stateAdapter.recordJournal({ jobId: request.job_id, name: "receipt_confirmation", value: confirmationJournal });
      journal.receipt_confirmation = confirmationJournal;
    }
    receiptConfirmed = true;
    return recordTerminalOutcome({
      status: "succeeded",
      terminalReasonCode: "completed",
      result: execution.result,
      receiptConfirmation,
      error: null,
      recovery: { status: "not_required", artifact_refs: [], reason_code: null, receipt_confirmation: null },
      replayed: opened.replayed,
    });
  } catch (error) {
    const code = errorCode(error);
    let recovery = { status: "not_required", artifact_refs: [], reason_code: null, receipt_confirmation: null };
    let recoveryExecution = execution;
    if (recoveryExecution === null && journal.prepared_execution) {
      try {
        recoveryExecution = validatePreparedExecutionJournal(journal.prepared_execution, { requestSha256, bundleDigest });
      } catch {
        recoveryExecution = null;
      }
    }
    if (recoveryExecution?.result?.artifact_refs?.length) {
      const artifactRefs = recoveryExecution.result.artifact_refs.map((ref) => ({ ...ref }));
      if (receiptConfirmed) {
        recovery = { status: "manual_required", artifact_refs: artifactRefs, reason_code: "receipt_confirmed_before_terminal_state", receipt_confirmation: receiptConfirmation };
      } else if (code === "artifact_postcommit_manual_recovery_required") {
        recovery = { status: "manual_required", artifact_refs: artifactRefs, reason_code: "artifact_postcommit_manual_recovery_required", receipt_confirmation: null };
      } else if (new Set(["receipt_existing_mismatch", "receipt_postcommit_manual_recovery_required", "receipt_confirmation_journal_conflict"]).has(code)) {
        recovery = { status: "manual_required", artifact_refs: artifactRefs, reason_code: "receipt_exact_match_failed", receipt_confirmation: null };
      } else if (!adapters.artifactAdapter || typeof adapters.artifactAdapter.rollbackArtifactSet !== "function") {
        recovery = { status: "manual_required", artifact_refs: artifactRefs, reason_code: "artifact_rollback_unavailable", receipt_confirmation: null };
      } else {
        try {
          await adapters.artifactAdapter.rollbackArtifactSet({
            jobId: request.job_id,
            projectCode: request.project_code,
            artifactRefs,
          });
          recovery = { status: "rolled_back", artifact_refs: artifactRefs, reason_code: "receipt_not_confirmed", receipt_confirmation: null };
        } catch (rollbackError) {
          recovery = rollbackError?.code === "artifact_rollback_target_missing"
            ? { status: "rolled_back", artifact_refs: artifactRefs, reason_code: "artifact_already_rolled_back", receipt_confirmation: null }
            : { status: "manual_required", artifact_refs: artifactRefs, reason_code: "artifact_rollback_failed", receipt_confirmation: null };
        }
      }
    }
    if (new Set(["blocked", "succeeded", "failed", "cancelled", "interrupted"]).has(state.status)) {
      fail("runner_terminal_state_without_outcome", "Runner reached a terminal state before recording its outcome intent");
    }
    return recordTerminalOutcome({
      status: "blocked",
      terminalReasonCode: code,
      result: null,
      receiptConfirmation: null,
      error: { code },
      recovery,
      replayed: opened.replayed,
    });
  }
}

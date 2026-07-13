import { randomBytes } from "node:crypto";

import {
  SHA256_RE,
  WORKFLOW_ARTIFACT_MEDIA_TYPES,
  WORKFLOW_ARTIFACT_ROLES,
  WORKFLOW_BINDING_REVISION,
  WORKFLOW_CLAIM_CEILINGS,
  WORKFLOW_ID,
  WORKFLOW_INPUT_TTL_MS,
  WORKFLOW_JOB_ID_RE,
  WORKFLOW_OPERATION_ID_RE,
  WORKFLOW_RAW_OUTPUT_MAX_BYTES,
  WORKFLOW_READER_ARTIFACT_ROLES,
  WorkflowJobError,
  buildFixedRunnerRequest,
  canonicalJson,
  sha256Bytes,
  sha256Canonical,
  validateCancelRequest,
  validateIdempotencyKey,
  validatePagination,
  validatePublicWorkflowJobRequest,
  validateRecoveryRequest,
  validateResolvedWorkflowInputs,
  validateSeparatedPassReceipts,
  validateStatusFilter,
  validateWorkflowInputUpload,
} from "./workflow_job_contract.mjs";

function fail(code, status = 400) {
  throw new WorkflowJobError(code, status);
}

function transaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function requireAccount(db, accountId) {
  if (!accountId) fail("workflow_account_required", 401);
  const account = db.prepare("SELECT id,status FROM core_account WHERE id=?").get(accountId);
  if (!account || account.status !== "active") fail("workflow_account_forbidden", 403);
  return account;
}

function requireProjectAccess(db, accountId, projectCode, canAccessProject) {
  requireAccount(db, accountId);
  const project = db.prepare("SELECT id FROM core_project WHERE id=?").get(projectCode);
  if (!project) fail("workflow_project_not_found", 404);
  if (typeof canAccessProject !== "function" || canAccessProject(projectCode) !== true) fail("workflow_project_forbidden", 403);
  return project;
}

function publicJob(row) {
  if (!row) return null;
  return {
    job_id: row.job_id,
    workflow_id: row.workflow_id,
    binding_revision: row.binding_revision,
    mode: row.mode,
    project_code: row.project_code,
    report_type: row.report_type,
    audience: row.audience,
    status: row.status,
    phase: row.phase,
    state_version: row.state_version,
    attempt: row.attempt,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    terminal_reason_code: row.terminal_reason_code,
    receipt_status: row.receipt_status,
    claim_ceiling: row.claim_ceiling,
    human_review_status: "required",
  };
}

function publicInput(row) {
  return {
    handle_id: row.handle_id,
    ordinal: row.ordinal,
    role: row.role,
    size: row.body_size,
    media_type: row.media_type,
    revision: row.revision,
    status: row.status,
    expires_at: row.expires_at,
  };
}

function nextTransitionSeq(db, jobId) {
  return db.prepare("SELECT COALESCE(MAX(seq),0)+1 AS seq FROM workflow_job_transition WHERE job_id=?").get(jobId).seq;
}

function insertTransition(db, {
  job,
  toStatus,
  toPhase,
  stateVersion,
  reasonCode,
  actorAccountId,
  at,
  operationId = null,
  detailsSha256 = null,
}) {
  db.prepare(
    `INSERT INTO workflow_job_transition(
      job_id,seq,from_status,to_status,from_phase,to_phase,state_version,attempt,reason_code,
      actor_account_id,at,operation_id,details_sha256
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    job.job_id,
    nextTransitionSeq(db, job.job_id),
    job.status,
    toStatus,
    job.phase,
    toPhase,
    stateVersion,
    job.attempt,
    reasonCode,
    actorAccountId,
    at,
    operationId,
    detailsSha256,
  );
}

function randomId(prefix, randomBytesFn) {
  return `${prefix}_${randomBytesFn(16).toString("hex")}`;
}

function exactReceiptConfirmation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("workflow_receipt_confirmation_invalid", 409);
  const fields = ["receipt_ref", "receipt_sha256"];
  const keys = Object.keys(value).sort();
  if (keys.join("\0") !== fields.sort().join("\0")) fail("workflow_receipt_confirmation_invalid", 409);
  if (!/^wfr:[A-Za-z0-9._:-]{1,220}$/.test(value.receipt_ref) || !SHA256_RE.test(value.receipt_sha256)) {
    fail("workflow_receipt_confirmation_invalid", 409);
  }
  return value;
}

function exactCoreReceiptConfirmation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("workflow_receipt_confirmation_invalid", 409);
  const fields = ["payload_ref", "sha256", "size", "media_type"];
  if (Object.keys(value).sort().join("\0") !== fields.sort().join("\0")
    || !/^wfr:[A-Za-z0-9._:-]{1,220}$/.test(value.payload_ref)
    || !SHA256_RE.test(value.sha256)
    || !Number.isSafeInteger(value.size)
    || value.size < 1
    || value.media_type !== "application/json") {
    fail("workflow_receipt_confirmation_invalid", 409);
  }
  return value;
}

function planArtifactMetadata(jobId, artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length !== WORKFLOW_ARTIFACT_ROLES.length) {
    fail("workflow_artifact_set_invalid");
  }
  const roles = new Set();
  let total = 0;
  const metadata = artifacts.map((artifact) => {
    if (!artifact
      || !WORKFLOW_ARTIFACT_ROLES.includes(artifact.role)
      || roles.has(artifact.role)
      || !Buffer.isBuffer(artifact.bytes)) {
      fail("workflow_artifact_set_invalid");
    }
    if (artifact.media_type !== WORKFLOW_ARTIFACT_MEDIA_TYPES[artifact.role]) {
      fail("workflow_artifact_media_type_invalid");
    }
    roles.add(artifact.role);
    total += artifact.bytes.length;
    const sha256 = sha256Bytes(artifact.bytes);
    return {
      role: artifact.role,
      payload_ref: `wja:${jobId}:${artifact.role}:${sha256}`,
      sha256,
      size: artifact.bytes.length,
      media_type: artifact.media_type,
    };
  }).sort((a, b) => a.role.localeCompare(b.role));
  if (WORKFLOW_ARTIFACT_ROLES.some((role) => !roles.has(role))) fail("workflow_artifact_set_invalid");
  if (total > WORKFLOW_RAW_OUTPUT_MAX_BYTES) fail("workflow_artifact_total_too_large", 413);
  return metadata;
}

function assertPersistedArtifactMetadata(expected, actual) {
  if (canonicalJson(expected) !== canonicalJson(actual)) fail("workflow_artifact_adoption_conflict", 409);
}

function assertCoreResultBinding(job, result, planned) {
  if (!result
    || result.schema !== "soulforge.workflow_job_result.v1"
    || result.job_id !== job.job_id
    || result.workflow_id !== WORKFLOW_ID
    || result.binding_revision !== job.binding_revision
    || result.status !== "succeeded"
    || !WORKFLOW_CLAIM_CEILINGS.includes(result.claim_ceiling)
    || canonicalJson(result.artifact_refs) !== canonicalJson(planned)) {
    fail("workflow_core_result_binding_mismatch", 409);
  }
  return result;
}

export class WorkflowJobService {
  constructor({
    store,
    payloadStore,
    bundleSha256,
    bindingRevision = WORKFLOW_BINDING_REVISION,
    clock = () => new Date(),
    randomBytesFn = randomBytes,
  }) {
    if (!store?.db || !payloadStore) fail("workflow_service_configuration_invalid", 503);
    if (!SHA256_RE.test(String(bundleSha256 || ""))) fail("workflow_bundle_digest_unpinned", 503);
    if (bindingRevision !== WORKFLOW_BINDING_REVISION) fail("workflow_binding_revision_mismatch", 503);
    this.store = store;
    this.db = store.db;
    this.payloadStore = payloadStore;
    this.bundleSha256 = bundleSha256;
    this.bindingRevision = bindingRevision;
    this.clock = clock;
    this.randomBytesFn = randomBytesFn;
    this.passChallenges = new Map();
  }

  now() {
    const value = this.clock();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) fail("workflow_clock_invalid", 500);
    return date;
  }

  createInput({ accountId, canAccessProject, project_code, role, media_type, bytes }) {
    const input = validateWorkflowInputUpload({ project_code, role, media_type, bytes });
    requireProjectAccess(this.db, accountId, project_code, canAccessProject);
    const handleId = randomId("wih", this.randomBytesFn);
    const now = this.now();
    const expiresAt = new Date(now.getTime() + WORKFLOW_INPUT_TTL_MS).toISOString();
    const body = this.payloadStore.createInputBody({ handleId, bytes: input.bytes });
    try {
      this.db.prepare(
        `INSERT INTO workflow_job_input(
          handle_id,job_id,ordinal,account_id,project_code,role,source_owner_ref,body_ref,body_sha256,
          body_size,media_type,revision,status,created_at,expires_at
        ) VALUES(?,NULL,NULL,?,?,?,?,?,?,?,?,1,'active',?,?)`,
      ).run(
        handleId,
        accountId,
        project_code,
        role,
        `erp-account:${accountId}`,
        body.body_ref,
        body.body_sha256,
        body.body_size,
        input.media_type,
        now.toISOString(),
        expiresAt,
      );
    } catch (error) {
      this.payloadStore.removeInputBody(handleId);
      throw error;
    }
    return {
      schema: "dev_erp.workflow_input_created.v1",
      input: { handle_id: handleId, project_code, role, size: body.body_size, media_type: input.media_type, expires_at: expiresAt },
    };
  }

  createJob({ accountId, canAccessProject, idempotencyKey, request }) {
    validatePublicWorkflowJobRequest(request);
    validateIdempotencyKey(idempotencyKey);
    requireProjectAccess(this.db, accountId, request.project_code, canAccessProject);
    const requestSha256 = sha256Canonical({
      schema: request.schema,
      account_id: accountId,
      project_code: request.project_code,
      mode: request.mode,
      report_type: request.report_type,
      audience: request.audience,
      input_handles: request.input_handles,
    });
    return transaction(this.db, () => {
      const replay = this.db.prepare("SELECT * FROM workflow_job WHERE idempotency_key=?").get(idempotencyKey);
      if (replay) {
        if (replay.request_sha256 !== requestSha256) fail("workflow_job_idempotency_conflict", 409);
        if (replay.actor_account_id !== accountId || replay.project_code !== request.project_code) fail("workflow_job_idempotency_conflict", 409);
        return { replayed: true, job: publicJob(replay) };
      }

      const placeholders = request.input_handles.map(() => "?").join(",");
      const rows = this.db.prepare(`SELECT * FROM workflow_job_input WHERE handle_id IN (${placeholders})`).all(...request.input_handles);
      if (rows.length !== request.input_handles.length) fail("workflow_input_handle_not_found", 404);
      const byId = new Map(rows.map((row) => [row.handle_id, row]));
      const inputs = request.input_handles.map((handle) => byId.get(handle));
      const now = this.now();
      for (const input of inputs) {
        if (input.account_id !== accountId) fail("workflow_input_account_forbidden", 403);
        if (input.project_code !== request.project_code) fail("workflow_input_project_forbidden", 403);
        if (input.status !== "active" || input.job_id !== null) fail("workflow_input_handle_stale", 409);
        if (Date.parse(input.expires_at) <= now.getTime()) fail("workflow_input_handle_expired", 409);
        this.payloadStore.readInputBody(input);
      }
      validateResolvedWorkflowInputs(request.mode, inputs);

      let jobId;
      do { jobId = randomId("wfj", this.randomBytesFn); }
      while (this.db.prepare("SELECT 1 FROM workflow_job WHERE job_id=?").get(jobId));
      const at = now.toISOString();
      this.db.prepare(
        `INSERT INTO workflow_job(
          job_id,idempotency_key,request_sha256,workflow_id,binding_revision,bundle_sha256,mode,
          actor_account_id,project_code,report_type,audience,status,phase,state_version,attempt,
          created_at,updated_at,human_review_status,claim_ceiling
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,'queued','validate',1,0,?,?,'required','observed')`,
      ).run(
        jobId,
        idempotencyKey,
        requestSha256,
        WORKFLOW_ID,
        this.bindingRevision,
        this.bundleSha256,
        request.mode,
        accountId,
        request.project_code,
        request.report_type,
        request.audience,
        at,
        at,
      );
      inputs.forEach((input, ordinal) => {
        const changed = this.db.prepare(
          "UPDATE workflow_job_input SET job_id=?,ordinal=?,status='consumed' WHERE handle_id=? AND status='active' AND job_id IS NULL",
        ).run(jobId, ordinal, input.handle_id).changes;
        if (changed !== 1) fail("workflow_input_handle_state_conflict", 409);
      });
      const job = this.db.prepare("SELECT * FROM workflow_job WHERE job_id=?").get(jobId);
      insertTransition(this.db, {
        job: { ...job, status: null, phase: null },
        toStatus: "queued",
        toPhase: "validate",
        stateVersion: 1,
        reasonCode: "submitted",
        actorAccountId: accountId,
        at,
      });
      return { replayed: false, job: publicJob(job) };
    });
  }

  listJobs({ accountId, canAccessProject, projectCode = null, status = null, limit, offset }) {
    requireAccount(this.db, accountId);
    const page = validatePagination({ limit, offset });
    const statusFilter = validateStatusFilter(status);
    const conditions = [];
    const args = [];
    if (projectCode) {
      requireProjectAccess(this.db, accountId, projectCode, canAccessProject);
      conditions.push("project_code=?");
      args.push(projectCode);
    } else {
      const allowedProjectCodes = this.db.prepare("SELECT id FROM core_project ORDER BY id")
        .all()
        .map((row) => row.id)
        .filter((candidate) => canAccessProject(candidate) === true);
      if (!allowedProjectCodes.length) {
        return {
          schema: "dev_erp.workflow_job_list.v1",
          jobs: [],
          pagination: { limit: page.limit, offset: page.offset, next_offset: null },
        };
      }
      conditions.push(`project_code IN (${allowedProjectCodes.map(() => "?").join(",")})`);
      args.push(...allowedProjectCodes);
    }
    if (statusFilter) {
      conditions.push("status=?");
      args.push(statusFilter);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const candidates = this.db.prepare(
      `SELECT * FROM workflow_job ${where} ORDER BY created_at DESC,job_id DESC LIMIT ? OFFSET ?`,
    ).all(...args, page.limit, page.offset);
    const rows = candidates.map(publicJob);
    return {
      schema: "dev_erp.workflow_job_list.v1",
      jobs: rows,
      pagination: { limit: page.limit, offset: page.offset, next_offset: candidates.length === page.limit ? page.offset + page.limit : null },
    };
  }

  jobRow(jobId) {
    if (!WORKFLOW_JOB_ID_RE.test(String(jobId || ""))) fail("workflow_job_id_invalid");
    const job = this.db.prepare("SELECT * FROM workflow_job WHERE job_id=?").get(jobId);
    if (!job) fail("workflow_job_not_found", 404);
    return job;
  }

  getJob({ accountId, canAccessProject, jobId }) {
    requireAccount(this.db, accountId);
    const job = this.jobRow(jobId);
    requireProjectAccess(this.db, accountId, job.project_code, canAccessProject);
    const inputs = this.db.prepare("SELECT * FROM workflow_job_input WHERE job_id=? ORDER BY ordinal").all(jobId).map(publicInput);
    const transitions = this.db.prepare(
      "SELECT seq,from_status,to_status,from_phase,to_phase,state_version,attempt,reason_code,at,operation_id FROM workflow_job_transition WHERE job_id=? ORDER BY seq",
    ).all(jobId);
    const passes = this.db.prepare(
      "SELECT attempt,role,operation_id,process_instance_id,child_pid,started_at,finished_at,terminated_at,bundle_sha256,input_sha256,output_sha256,permission_profile_revision,context_sha256,receipt_sha256 FROM workflow_job_pass WHERE job_id=? ORDER BY attempt,role",
    ).all(jobId);
    const artifacts = this.db.prepare(
      "SELECT role,payload_ref,sha256,size,media_type,persisted_at FROM workflow_job_artifact WHERE job_id=? ORDER BY role",
    ).all(jobId);
    return {
      schema: "dev_erp.workflow_job_view.v1",
      job: publicJob(job),
      inputs,
      transitions,
      passes,
      artifacts,
      actions: {
        can_cancel: job.status === "queued",
        can_recover: ["blocked", "interrupted"].includes(job.status)
          && job.phase === "receipt"
          && job.receipt_status === "failed",
        can_publish: false,
        can_send: false,
      },
    };
  }

  result({ accountId, canAccessProject, jobId }) {
    const view = this.getJob({ accountId, canAccessProject, jobId });
    const job = this.jobRow(jobId);
    return {
      schema: "dev_erp.workflow_job_result_view.v1",
      job_id: jobId,
      status: job.status,
      phase: job.phase,
      result_sha256: job.result_sha256,
      result: job.result_json ? safeJson(job.result_json, null) : null,
      artifacts: view.artifacts,
      receipt: job.receipt_status === "confirmed" ? { status: "confirmed", receipt_ref: job.receipt_ref, receipt_sha256: job.receipt_sha256 } : { status: job.receipt_status },
      claim_ceiling: job.claim_ceiling,
      human_review_status: "required",
      publication_status: "not_publishable_without_human_review",
    };
  }

  cancel({ accountId, canAccessProject, jobId, request }) {
    validateCancelRequest(request);
    const current = this.jobRow(jobId);
    requireProjectAccess(this.db, accountId, current.project_code, canAccessProject);
    if (current.actor_account_id !== accountId && !this.store.isAdmin(accountId)) fail("workflow_cancel_forbidden", 403);
    if (current.status !== "queued") fail("workflow_cancel_running_disabled", 409);
    const at = this.now().toISOString();
    return transaction(this.db, () => {
      const job = this.jobRow(jobId);
      if (job.state_version !== request.expected_state_version || job.status !== "queued") fail("workflow_job_state_conflict", 409);
      const nextVersion = job.state_version + 1;
      const changed = this.db.prepare(
        `UPDATE workflow_job SET status='cancelled',state_version=state_version+1,updated_at=?,finished_at=?,terminal_reason_code='cancelled_by_requester'
         WHERE job_id=? AND state_version=? AND status='queued'`,
      ).run(at, at, jobId, request.expected_state_version).changes;
      if (changed !== 1) fail("workflow_job_state_conflict", 409);
      insertTransition(this.db, {
        job,
        toStatus: "cancelled",
        toPhase: job.phase,
        stateVersion: nextVersion,
        reasonCode: "cancelled_by_requester",
        actorAccountId: accountId,
        at,
      });
      return { schema: "dev_erp.workflow_job_cancelled.v1", job: publicJob(this.jobRow(jobId)) };
    });
  }

  claimJob({ jobId, expectedStateVersion, operationId }) {
    if (!WORKFLOW_OPERATION_ID_RE.test(operationId)) fail("workflow_operation_id_invalid");
    const authorNonce = this.randomBytesFn(32);
    const verifierNonce = this.randomBytesFn(32);
    if (!Buffer.isBuffer(authorNonce) || authorNonce.length !== 32
      || !Buffer.isBuffer(verifierNonce) || verifierNonce.length !== 32) {
      fail("workflow_pass_challenge_generation_failed", 503);
    }
    const authorNonceSha256 = sha256Bytes(authorNonce);
    const verifierNonceSha256 = sha256Bytes(verifierNonce);
    const at = this.now().toISOString();
    const claimed = transaction(this.db, () => {
      const job = this.jobRow(jobId);
      if (job.state_version !== expectedStateVersion || job.status !== "queued" || job.phase !== "validate") fail("workflow_job_state_conflict", 409);
      const nextVersion = job.state_version + 1;
      const changed = this.db.prepare(
        `UPDATE workflow_job SET status='running',state_version=state_version+1,attempt=attempt+1,updated_at=?,started_at=COALESCE(started_at,?),
          operation_id=?,author_operation_nonce_sha256=?,verifier_operation_nonce_sha256=?
         WHERE job_id=? AND state_version=? AND status='queued' AND phase='validate'`,
      ).run(at, at, operationId, authorNonceSha256, verifierNonceSha256, jobId, expectedStateVersion).changes;
      if (changed !== 1) fail("workflow_job_state_conflict", 409);
      insertTransition(this.db, {
        job: { ...job, attempt: job.attempt + 1 },
        toStatus: "running",
        toPhase: "validate",
        stateVersion: nextVersion,
        reasonCode: "claimed",
        actorAccountId: job.actor_account_id,
        at,
        operationId,
      });
      return this.jobRow(jobId);
    });
    const challengeKey = `${jobId}:${claimed.attempt}`;
    const passChallenges = {
      author_nonce_base64url: authorNonce.toString("base64url"),
      verifier_nonce_base64url: verifierNonce.toString("base64url"),
    };
    this.passChallenges.set(challengeKey, { operationId, ...passChallenges });
    return { ...claimed, pass_challenges: passChallenges };
  }

  dispatchPacket({ accountId, canAccessProject, jobId }) {
    const job = this.jobRow(jobId);
    requireProjectAccess(this.db, accountId, job.project_code, canAccessProject);
    if (job.actor_account_id !== accountId && !this.store.isAdmin(accountId)) fail("workflow_dispatch_forbidden", 403);
    if (job.status !== "running") fail("workflow_job_state_conflict", 409);
    const passChallenges = this.passChallenges.get(`${jobId}:${job.attempt}`);
    if (!passChallenges || passChallenges.operationId !== job.operation_id) fail("workflow_pass_challenge_unavailable", 409);
    const inputs = this.db.prepare("SELECT * FROM workflow_job_input WHERE job_id=? ORDER BY ordinal").all(jobId);
    validateResolvedWorkflowInputs(job.mode, inputs);
    const payloads = inputs.map((input) => ({
      descriptor: {
        ordinal: input.ordinal,
        role: input.role,
        payload_ref: input.body_ref,
        sha256: input.body_sha256,
        size: input.body_size,
        media_type: input.media_type,
      },
      bytes: this.payloadStore.readInputBody(input),
    }));
    return {
      request: buildFixedRunnerRequest({ job, inputs }),
      payloads,
      pass_challenges: {
        author_nonce_base64url: passChallenges.author_nonce_base64url,
        verifier_nonce_base64url: passChallenges.verifier_nonce_base64url,
      },
    };
  }

  recordPassReceipts({ jobId, expectedStateVersion, author, verifier }) {
    const job = this.jobRow(jobId);
    if (job.status !== "running") fail("workflow_job_state_conflict", 409);
    validateSeparatedPassReceipts(author, verifier, job.bundle_sha256);
    if (author.operation_nonce_sha256 !== job.author_operation_nonce_sha256
      || verifier.operation_nonce_sha256 !== job.verifier_operation_nonce_sha256) {
      fail("workflow_pass_challenge_mismatch", 409);
    }
    const at = this.now().toISOString();
    const recorded = transaction(this.db, () => {
      const current = this.jobRow(jobId);
      if (current.state_version !== expectedStateVersion || current.status !== "running") fail("workflow_job_state_conflict", 409);
      for (const receipt of [author, verifier]) {
        this.db.prepare(
          `INSERT INTO workflow_job_pass(
            job_id,attempt,role,operation_id,operation_nonce_sha256,process_instance_id,child_pid,
            started_at,finished_at,terminated_at,bundle_sha256,input_sha256,output_sha256,
            permission_profile_revision,skills_json,instruction_sources_json,sandbox_mode,writable_roots_json,
            network_access,approval_policy,context_sha256,receipt_sha256
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'[]','[]','read-only','[]',0,'never',?,?)`,
        ).run(
          jobId,
          current.attempt,
          receipt.role,
          receipt.operation_id,
          receipt.operation_nonce_sha256,
          receipt.process_instance_id,
          receipt.child_pid,
          receipt.started_at,
          receipt.finished_at,
          receipt.terminated_at,
          receipt.bundle_sha256,
          receipt.input_sha256,
          receipt.output_sha256,
          receipt.permission_profile_revision,
          receipt.context_sha256,
          receipt.receipt_sha256,
        );
      }
      const nextVersion = current.state_version + 1;
      const changed = this.db.prepare("UPDATE workflow_job SET state_version=state_version+1,updated_at=? WHERE job_id=? AND state_version=? AND status='running'")
        .run(at, jobId, expectedStateVersion).changes;
      if (changed !== 1) fail("workflow_job_state_conflict", 409);
      insertTransition(this.db, {
        job: current,
        toStatus: current.status,
        toPhase: current.phase,
        stateVersion: nextVersion,
        reasonCode: "pass_receipts_recorded",
        actorAccountId: current.actor_account_id,
        at,
        detailsSha256: sha256Canonical({ author: author.receipt_sha256, verifier: verifier.receipt_sha256 }),
      });
      return publicJob(this.jobRow(jobId));
    });
    this.passChallenges.delete(`${jobId}:${job.attempt}`);
    return recorded;
  }

  previewArtifactCommit({ jobId, operationId, artifacts }) {
    const job = this.jobRow(jobId);
    if (job.status !== "running" || job.operation_id !== operationId) fail("workflow_job_state_conflict", 409);
    const passes = this.db.prepare(
      "SELECT role,operation_nonce_sha256 FROM workflow_job_pass WHERE job_id=? AND attempt=? ORDER BY role",
    ).all(jobId, job.attempt);
    if (passes.length !== 2
      || passes[0].role !== "author"
      || passes[1].role !== "verifier"
      || passes[0].operation_nonce_sha256 !== job.author_operation_nonce_sha256
      || passes[1].operation_nonce_sha256 !== job.verifier_operation_nonce_sha256) {
      fail("workflow_pass_receipts_missing", 409);
    }
    return {
      artifact_refs: planArtifactMetadata(jobId, artifacts),
      storage_attestation: {
        storage_class: "workspace_system",
        project_code: job.project_code,
        owner_approval_ref: null,
        report_bodies_in_workmeta: false,
        public_repo_storage: false,
        atomic_no_overwrite: true,
      },
    };
  }

  persistResult({ jobId, expectedStateVersion, operationId, artifacts, result }) {
    const job = this.jobRow(jobId);
    if (job.status !== "running" || !["render", "semantic_verify", "preservation", "final_polish", "draft", "validate"].includes(job.phase)) {
      fail("workflow_job_state_conflict", 409);
    }
    if (job.operation_id !== operationId) fail("workflow_operation_mismatch", 409);
    const passes = this.db.prepare(
      "SELECT role,operation_nonce_sha256,receipt_sha256 FROM workflow_job_pass WHERE job_id=? AND attempt=? ORDER BY role",
    ).all(jobId, job.attempt);
    if (passes.length !== 2
      || passes[0].role !== "author"
      || passes[1].role !== "verifier"
      || passes[0].operation_nonce_sha256 !== job.author_operation_nonce_sha256
      || passes[1].operation_nonce_sha256 !== job.verifier_operation_nonce_sha256) {
      fail("workflow_pass_receipts_missing", 409);
    }
    const planned = planArtifactMetadata(jobId, artifacts);
    assertCoreResultBinding(job, result, planned);
    const resultSha256 = sha256Canonical(result);
    const artifactsJson = canonicalJson(planned);
    const artifactsSha256 = sha256Canonical(planned);
    const at = this.now().toISOString();
    transaction(this.db, () => {
      const current = this.jobRow(jobId);
      if (current.state_version !== expectedStateVersion
        || current.status !== "running"
        || current.operation_id !== operationId) fail("workflow_job_state_conflict", 409);
      const existing = this.db.prepare("SELECT * FROM workflow_job_artifact_commit WHERE job_id=?").get(jobId);
      if (existing) {
        if (existing.attempt !== current.attempt
          || existing.operation_id !== operationId
          || existing.expected_state_version !== expectedStateVersion
          || existing.result_sha256 !== resultSha256
          || existing.result_json !== canonicalJson(result)
          || existing.artifacts_sha256 !== artifactsSha256
          || existing.artifacts_json !== artifactsJson) {
          fail("workflow_artifact_commit_conflict", 409);
        }
      } else {
        this.db.prepare(
          `INSERT INTO workflow_job_artifact_commit(
            job_id,attempt,operation_id,expected_state_version,result_sha256,result_json,
            artifacts_sha256,artifacts_json,status,created_at
          ) VALUES(?,?,?,?,?,?,?,?,'planned',?)`,
        ).run(
          jobId,
          current.attempt,
          operationId,
          expectedStateVersion,
          resultSha256,
          canonicalJson(result),
          artifactsSha256,
          artifactsJson,
          at,
        );
      }
    });

    const persisted = this.payloadStore.persistArtifactSet({ jobId, operationId, artifacts });
    assertPersistedArtifactMetadata(planned, persisted);

    return transaction(this.db, () => {
      const current = this.jobRow(jobId);
      const journal = this.db.prepare("SELECT * FROM workflow_job_artifact_commit WHERE job_id=?").get(jobId);
      if (current.state_version !== expectedStateVersion
        || current.status !== "running"
        || current.operation_id !== operationId
        || !journal
        || journal.status !== "planned"
        || journal.result_sha256 !== resultSha256
        || journal.artifacts_sha256 !== artifactsSha256) {
        fail("workflow_job_state_conflict", 409);
      }
      for (const artifact of persisted) {
        this.db.prepare(
          "INSERT INTO workflow_job_artifact(job_id,role,payload_ref,sha256,size,media_type,persisted_at) VALUES(?,?,?,?,?,?,?)",
        ).run(jobId, artifact.role, artifact.payload_ref, artifact.sha256, artifact.size, artifact.media_type, at);
      }
      const nextVersion = current.state_version + 1;
      const changed = this.db.prepare(
        `UPDATE workflow_job SET phase='receipt',state_version=state_version+1,updated_at=?,result_sha256=?,result_json=?,claim_ceiling=?
         WHERE job_id=? AND state_version=? AND status='running' AND operation_id=?`,
      ).run(at, resultSha256, canonicalJson(result), result.claim_ceiling, jobId, expectedStateVersion, operationId).changes;
      if (changed !== 1) fail("workflow_job_state_conflict", 409);
      this.db.prepare(
        "UPDATE workflow_job_artifact_commit SET status='committed',committed_at=? WHERE job_id=? AND status='planned'",
      ).run(at, jobId);
      insertTransition(this.db, {
        job: current,
        toStatus: "running",
        toPhase: "receipt",
        stateVersion: nextVersion,
        reasonCode: "artifacts_persisted",
        actorAccountId: current.actor_account_id,
        at,
        operationId,
        detailsSha256: resultSha256,
      });
      return { job: publicJob(this.jobRow(jobId)), result, result_sha256: resultSha256 };
    });
  }

  convergeCoreOutcome({ jobId, expectedStateVersion, operationId, outcome, persistedReceiptConfirmation = null }) {
    if (!WORKFLOW_OPERATION_ID_RE.test(operationId)) fail("workflow_operation_id_invalid");
    if (!outcome
      || outcome.schema !== "soulforge.workflow_job_outcome.v1"
      || outcome.state?.job_id !== jobId
      || !["succeeded", "blocked", "failed", "interrupted"].includes(outcome.state?.status)) {
      fail("workflow_core_outcome_invalid", 409);
    }
    const at = this.now().toISOString();
    return transaction(this.db, () => {
      const job = this.jobRow(jobId);
      const coreStatus = outcome.state.status;
      if (job.status !== "running" || job.state_version !== expectedStateVersion || job.operation_id !== operationId) {
        if (job.status === coreStatus && job.terminal_reason_code === outcome.state.terminal_reason_code) {
          return { replayed: true, job: publicJob(job) };
        }
        fail("workflow_job_state_conflict", 409);
      }

      const storedResult = job.result_json ? safeJson(job.result_json, null) : null;
      const storedArtifacts = this.db.prepare(
        "SELECT role,payload_ref,sha256,size,media_type FROM workflow_job_artifact WHERE job_id=? ORDER BY role",
      ).all(jobId);
      if (outcome.result !== null) {
        if (!storedResult
          || canonicalJson(outcome.result) !== canonicalJson(storedResult)
          || sha256Canonical(outcome.result) !== job.result_sha256
          || canonicalJson([...outcome.result.artifact_refs].sort((a, b) => a.role.localeCompare(b.role))) !== canonicalJson(storedArtifacts)) {
          fail("workflow_core_outcome_result_mismatch", 409);
        }
      }

      const nextVersion = job.state_version + 1;
      if (coreStatus === "succeeded") {
        if (job.phase !== "receipt" || !storedResult || outcome.result === null || outcome.receipt_confirmation === null) {
          fail("workflow_core_outcome_result_mismatch", 409);
        }
        const persisted = exactCoreReceiptConfirmation(persistedReceiptConfirmation);
        if (canonicalJson(outcome.receipt_confirmation) !== canonicalJson(persisted)) {
          fail("workflow_core_outcome_receipt_mismatch", 409);
        }
        const changed = this.db.prepare(
          `UPDATE workflow_job SET status='succeeded',state_version=state_version+1,updated_at=?,finished_at=?,
            terminal_reason_code=?,receipt_status='confirmed',receipt_ref=?,receipt_sha256=?,human_review_status='required'
           WHERE job_id=? AND state_version=? AND status='running' AND phase='receipt' AND operation_id=?`,
        ).run(
          at,
          at,
          outcome.state.terminal_reason_code,
          persisted.payload_ref,
          persisted.sha256,
          jobId,
          expectedStateVersion,
          operationId,
        ).changes;
        if (changed !== 1) fail("workflow_job_state_conflict", 409);
        insertTransition(this.db, {
          job,
          toStatus: "succeeded",
          toPhase: "receipt",
          stateVersion: nextVersion,
          reasonCode: outcome.state.terminal_reason_code,
          actorAccountId: job.actor_account_id,
          at,
          operationId,
          detailsSha256: job.result_sha256,
        });
        return { replayed: false, job: publicJob(this.jobRow(jobId)) };
      }

      if (outcome.receipt_confirmation !== null) fail("workflow_core_outcome_receipt_mismatch", 409);
      if (outcome.result !== null && !storedResult) fail("workflow_core_outcome_result_mismatch", 409);
      let receiptStatus = storedResult ? "failed" : job.receipt_status;
      let receiptRef = null;
      let receiptSha256 = null;
      if (persistedReceiptConfirmation !== null) {
        const persisted = exactCoreReceiptConfirmation(persistedReceiptConfirmation);
        if (outcome.recovery?.status !== "manual_required"
          || canonicalJson(outcome.recovery.receipt_confirmation) !== canonicalJson(persisted)) {
          fail("workflow_core_outcome_receipt_mismatch", 409);
        }
        receiptStatus = "confirmed";
        receiptRef = persisted.payload_ref;
        receiptSha256 = persisted.sha256;
      } else if (outcome.recovery?.receipt_confirmation !== null) {
        fail("workflow_core_outcome_receipt_mismatch", 409);
      }
      const changed = this.db.prepare(
        `UPDATE workflow_job SET status=?,state_version=state_version+1,updated_at=?,finished_at=?,
          terminal_reason_code=?,receipt_status=?,receipt_ref=?,receipt_sha256=?,claim_ceiling='rejected_or_blocked'
         WHERE job_id=? AND state_version=? AND status='running' AND operation_id=?`,
      ).run(
        coreStatus,
        at,
        at,
        outcome.state.terminal_reason_code,
        receiptStatus,
        receiptRef,
        receiptSha256,
        jobId,
        expectedStateVersion,
        operationId,
      ).changes;
      if (changed !== 1) fail("workflow_job_state_conflict", 409);
      insertTransition(this.db, {
        job,
        toStatus: coreStatus,
        toPhase: job.phase,
        stateVersion: nextVersion,
        reasonCode: outcome.state.terminal_reason_code,
        actorAccountId: job.actor_account_id,
        at,
        operationId,
        detailsSha256: sha256Canonical(outcome),
      });
      return { replayed: false, job: publicJob(this.jobRow(jobId)) };
    });
  }

  markReceiptState({ jobId, expectedStateVersion, status, reasonCode }) {
    if (!new Set(["blocked", "interrupted"]).has(status)) fail("workflow_terminal_state_invalid");
    const at = this.now().toISOString();
    return transaction(this.db, () => {
      const job = this.jobRow(jobId);
      if (job.state_version !== expectedStateVersion || job.status !== "running" || job.phase !== "receipt") fail("workflow_job_state_conflict", 409);
      const nextVersion = job.state_version + 1;
      const changed = this.db.prepare(
        "UPDATE workflow_job SET status=?,state_version=state_version+1,updated_at=?,finished_at=?,terminal_reason_code=?,receipt_status='failed' WHERE job_id=? AND state_version=? AND status='running' AND phase='receipt'",
      ).run(status, at, at, reasonCode, jobId, expectedStateVersion).changes;
      if (changed !== 1) fail("workflow_job_state_conflict", 409);
      insertTransition(this.db, {
        job,
        toStatus: status,
        toPhase: "receipt",
        stateVersion: nextVersion,
        reasonCode,
        actorAccountId: job.actor_account_id,
        at,
      });
      return publicJob(this.jobRow(jobId));
    });
  }

  async resumeReceipt({ accountId, canAccessProject, jobId, request, receiptAdapter }) {
    validateRecoveryRequest(request);
    const job = this.jobRow(jobId);
    requireProjectAccess(this.db, accountId, job.project_code, canAccessProject);
    if (!this.store.isAdmin(accountId) && job.actor_account_id !== accountId) fail("workflow_recovery_forbidden", 403);
    const requestSha256 = sha256Canonical({
      schema: request.schema,
      job_id: jobId,
      expected_state_version: request.expected_state_version,
      action: request.action,
    });
    const startedAt = this.now().toISOString();
    const existing = transaction(this.db, () => {
      const recovery = this.db.prepare("SELECT * FROM workflow_job_recovery WHERE job_id=? AND idempotency_key=?").get(jobId, request.idempotency_key);
      if (recovery) {
        if (recovery.request_sha256 !== requestSha256) fail("workflow_recovery_idempotency_conflict", 409);
        return recovery;
      }
      const current = this.jobRow(jobId);
      if (current.state_version !== request.expected_state_version
        || current.phase !== "receipt"
        || current.receipt_status !== "failed"
        || !["blocked", "interrupted"].includes(current.status)) fail("workflow_recovery_forbidden", 409);
      if (!current.result_sha256 || this.db.prepare("SELECT COUNT(*) AS n FROM workflow_job_artifact WHERE job_id=?").get(jobId).n < 1) {
        fail("workflow_recovery_artifacts_missing", 409);
      }
      this.db.prepare(
        `INSERT INTO workflow_job_recovery(
          job_id,idempotency_key,request_sha256,expected_state_version,action,status,created_at,updated_at
        ) VALUES(?,?,?,?,?,'started',?,?)`,
      ).run(jobId, request.idempotency_key, requestSha256, request.expected_state_version, request.action, startedAt, startedAt);
      return null;
    });
    if (existing?.status === "completed") {
      return { replayed: true, job: publicJob(this.jobRow(jobId)) };
    }
    if (!receiptAdapter || typeof receiptAdapter.resumeReceipt !== "function") fail("workflow_receipt_sink_unavailable", 503);

    let confirmation;
    try {
      const artifacts = this.db.prepare("SELECT role,payload_ref,sha256,size,media_type FROM workflow_job_artifact WHERE job_id=? ORDER BY role").all(jobId);
      confirmation = exactReceiptConfirmation(await receiptAdapter.resumeReceipt({
        job: publicJob(this.jobRow(jobId)),
        result_sha256: this.jobRow(jobId).result_sha256,
        artifacts,
      }));
    } catch (error) {
      const at = this.now().toISOString();
      this.db.prepare(
        "UPDATE workflow_job_recovery SET status='blocked',reason_code='receipt_resume_failed',updated_at=? WHERE job_id=? AND idempotency_key=? AND status='started'",
      ).run(at, jobId, request.idempotency_key);
      throw error;
    }

    const completedAt = this.now().toISOString();
    return transaction(this.db, () => {
      const current = this.jobRow(jobId);
      const recovery = this.db.prepare("SELECT * FROM workflow_job_recovery WHERE job_id=? AND idempotency_key=?").get(jobId, request.idempotency_key);
      if (recovery.request_sha256 !== requestSha256) fail("workflow_recovery_idempotency_conflict", 409);
      if (recovery.status === "completed") return { replayed: true, job: publicJob(current) };
      if (current.state_version !== request.expected_state_version
        || current.phase !== "receipt"
        || current.receipt_status !== "failed"
        || !["blocked", "interrupted"].includes(current.status)) fail("workflow_job_state_conflict", 409);
      const nextVersion = current.state_version + 1;
      const changed = this.db.prepare(
        `UPDATE workflow_job SET status='succeeded',state_version=state_version+1,updated_at=?,finished_at=?,terminal_reason_code='completed',
          receipt_status='confirmed',receipt_ref=?,receipt_sha256=?,human_review_status='required'
         WHERE job_id=? AND state_version=? AND phase='receipt' AND status IN ('blocked','interrupted')`,
      ).run(completedAt, completedAt, confirmation.receipt_ref, confirmation.receipt_sha256, jobId, request.expected_state_version).changes;
      if (changed !== 1) fail("workflow_job_state_conflict", 409);
      this.db.prepare(
        `UPDATE workflow_job_recovery SET status='completed',result_state_version=?,receipt_ref=?,receipt_sha256=?,reason_code=NULL,updated_at=?
         WHERE job_id=? AND idempotency_key=? AND request_sha256=?`,
      ).run(nextVersion, confirmation.receipt_ref, confirmation.receipt_sha256, completedAt, jobId, request.idempotency_key, requestSha256);
      insertTransition(this.db, {
        job: current,
        toStatus: "succeeded",
        toPhase: "receipt",
        stateVersion: nextVersion,
        reasonCode: "receipt_resumed",
        actorAccountId: accountId,
        at: completedAt,
        detailsSha256: requestSha256,
      });
      return { replayed: false, job: publicJob(this.jobRow(jobId)) };
    });
  }

  readArtifact({ accountId, canAccessProject, jobId, role, auditAllowed = false }) {
    if (!WORKFLOW_ARTIFACT_ROLES.includes(role)) fail("workflow_artifact_role_invalid");
    const job = this.jobRow(jobId);
    requireProjectAccess(this.db, accountId, job.project_code, canAccessProject);
    if (!WORKFLOW_READER_ARTIFACT_ROLES.includes(role) && auditAllowed !== true) fail("workflow_artifact_forbidden", 403);
    const artifact = this.db.prepare("SELECT * FROM workflow_job_artifact WHERE job_id=? AND role=?").get(jobId, role);
    if (!artifact) fail("workflow_artifact_not_found", 404);
    const bytes = this.payloadStore.readArtifact(artifact);
    return {
      bytes,
      media_type: WORKFLOW_ARTIFACT_MEDIA_TYPES[role],
      sha256: artifact.sha256,
      filename: role === "final_report_md" ? "report.md" : role === "final_report_html" ? "report.html" : `${role}.json`,
    };
  }

  adoptPlannedArtifactCommit(job, at) {
    const journal = this.db.prepare(
      "SELECT * FROM workflow_job_artifact_commit WHERE job_id=? AND status='planned'",
    ).get(job.job_id);
    if (!journal
      || journal.attempt !== job.attempt
      || journal.operation_id !== job.operation_id
      || journal.expected_state_version !== job.state_version) return false;

    let expectedArtifacts;
    let result;
    try {
      expectedArtifacts = JSON.parse(journal.artifacts_json);
      result = JSON.parse(journal.result_json);
    } catch {
      fail("workflow_artifact_commit_journal_invalid", 409);
    }
    if (canonicalJson(expectedArtifacts) !== journal.artifacts_json
      || sha256Canonical(expectedArtifacts) !== journal.artifacts_sha256
      || canonicalJson(result) !== journal.result_json
      || sha256Canonical(result) !== journal.result_sha256) {
      fail("workflow_artifact_commit_journal_invalid", 409);
    }
    assertCoreResultBinding(job, result, expectedArtifacts);
    const persisted = this.payloadStore.adoptArtifactSet({
      jobId: job.job_id,
      operationId: job.operation_id,
    });
    assertPersistedArtifactMetadata(expectedArtifacts, persisted);

    return transaction(this.db, () => {
      const current = this.jobRow(job.job_id);
      const currentJournal = this.db.prepare(
        "SELECT * FROM workflow_job_artifact_commit WHERE job_id=? AND status='planned'",
      ).get(job.job_id);
      if (current.status !== "running"
        || current.state_version !== job.state_version
        || !currentJournal
        || currentJournal.result_sha256 !== journal.result_sha256) {
        fail("workflow_job_state_conflict", 409);
      }
      for (const artifact of persisted) {
        this.db.prepare(
          "INSERT INTO workflow_job_artifact(job_id,role,payload_ref,sha256,size,media_type,persisted_at) VALUES(?,?,?,?,?,?,?)",
        ).run(job.job_id, artifact.role, artifact.payload_ref, artifact.sha256, artifact.size, artifact.media_type, at);
      }
      const nextVersion = current.state_version + 1;
      const changed = this.db.prepare(
        `UPDATE workflow_job SET status='interrupted',phase='receipt',state_version=state_version+1,updated_at=?,finished_at=?,
          terminal_reason_code='artifact_commit_adopted_receipt_pending',result_sha256=?,result_json=?,
          claim_ceiling=?,receipt_status='failed'
         WHERE job_id=? AND state_version=? AND status='running' AND operation_id=?`,
      ).run(
        at,
        at,
        journal.result_sha256,
        journal.result_json,
        result.claim_ceiling,
        job.job_id,
        job.state_version,
        job.operation_id,
      ).changes;
      if (changed !== 1) fail("workflow_job_state_conflict", 409);
      this.db.prepare(
        "UPDATE workflow_job_artifact_commit SET status='committed',committed_at=? WHERE job_id=? AND status='planned'",
      ).run(at, job.job_id);
      insertTransition(this.db, {
        job: current,
        toStatus: "interrupted",
        toPhase: "receipt",
        stateVersion: nextVersion,
        reasonCode: "artifact_commit_adopted_receipt_pending",
        actorAccountId: current.actor_account_id,
        at,
        operationId: current.operation_id,
        detailsSha256: journal.result_sha256,
      });
      return true;
    });
  }

  recoverInterruptedJobs(reasonCode = "service_interrupted") {
    const running = this.db.prepare("SELECT * FROM workflow_job WHERE status='running' ORDER BY created_at,job_id").all();
    if (!running.length) return { recovered: 0, adopted: 0, blocked: 0 };
    const at = this.now().toISOString();
    let recovered = 0;
    let adopted = 0;
    let blocked = 0;
    for (const job of running) {
      if (job.phase !== "receipt") {
        try {
          if (this.adoptPlannedArtifactCommit(job, at)) {
            recovered += 1;
            adopted += 1;
            continue;
          }
        } catch {
          // A forged or incomplete commit is never adopted. It falls through to manual review.
        }
        transaction(this.db, () => {
          const current = this.jobRow(job.job_id);
          if (current.status !== "running" || current.state_version !== job.state_version) fail("workflow_job_state_conflict", 409);
          const nextVersion = current.state_version + 1;
          const changed = this.db.prepare(
            `UPDATE workflow_job SET status='blocked',state_version=state_version+1,updated_at=?,finished_at=?,
              terminal_reason_code='precommit_interrupted_manual_review',claim_ceiling='rejected_or_blocked'
             WHERE job_id=? AND state_version=? AND status='running'`,
          ).run(at, at, job.job_id, job.state_version).changes;
          if (changed !== 1) fail("workflow_job_state_conflict", 409);
          insertTransition(this.db, {
            job: current,
            toStatus: "blocked",
            toPhase: current.phase,
            stateVersion: nextVersion,
            reasonCode: "precommit_interrupted_manual_review",
            actorAccountId: current.actor_account_id,
            at,
          });
        });
        recovered += 1;
        blocked += 1;
        continue;
      }
      transaction(this.db, () => {
        const current = this.jobRow(job.job_id);
        if (current.status !== "running" || current.state_version !== job.state_version) fail("workflow_job_state_conflict", 409);
        const nextVersion = job.state_version + 1;
        const changed = this.db.prepare(
          `UPDATE workflow_job SET status='interrupted',state_version=state_version+1,updated_at=?,finished_at=?,
            terminal_reason_code=?,receipt_status='failed'
           WHERE job_id=? AND state_version=? AND status='running' AND phase='receipt'`,
        ).run(at, at, reasonCode, job.job_id, job.state_version).changes;
        if (changed !== 1) fail("workflow_job_state_conflict", 409);
        insertTransition(this.db, {
          job,
          toStatus: "interrupted",
          toPhase: job.phase,
          stateVersion: nextVersion,
          reasonCode,
          actorAccountId: job.actor_account_id,
          at,
        });
      });
      recovered += 1;
    }
    return { recovered, adopted, blocked };
  }
}

export function createWorkflowJobService(options) {
  return new WorkflowJobService(options);
}

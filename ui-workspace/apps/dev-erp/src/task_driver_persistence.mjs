import { createHash } from "node:crypto";

import {
  TASK_DRIVER_OWNER_SURFACE,
  TASK_OWNER_SURFACE,
  canonicalStringify,
  replayTaskDriverContract,
  taskDriverRef,
  taskIntentRef,
  typedRef,
  validateTaskDriver,
  validateTaskDriverEvent,
  validateTaskDriverPolicy,
  validateTaskDriverPolicyRevocation,
  validateTaskIntent,
} from "./task_driver.mjs";

export const TASK_DRIVER_CANDIDATE_SCHEMA_VERSION =
  "soulforge.task_candidate_spec.v1";
export const TASK_DRIVER_PERSISTENCE_SCHEMA_VERSION =
  "soulforge.task_driver_persistence.v1";
export const TASK_DRIVER_WRITER_ATTESTATION_SCHEMA_VERSION =
  "soulforge.task_driver_writer_attestation.v1";

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const STRICT_UTC_MS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SAFE_OPTIONAL_CODE_RE = /^[a-z][a-z0-9_]{0,63}$/u;
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;
const APPLY_OPERATION = "task_driver_decision_set_apply";

const LEDGER_TABLES = Object.freeze([
  "task_driver_candidate",
  "task_driver_intent",
  "task_driver_record",
  "task_driver_policy",
  "task_driver_policy_revocation",
  "task_driver_event",
  "task_driver_authority_attestation",
  "task_driver_writer_attestation",
  "task_driver_task_baseline",
  "task_driver_apply_receipt",
]);

const DDL = `
CREATE TABLE IF NOT EXISTS task_driver_candidate (
  candidate_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES core_project(id),
  candidate_digest TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(candidate_digest)
);
CREATE TABLE IF NOT EXISTS task_driver_intent (
  intent_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES core_project(id),
  intent_digest TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_driver_record (
  driver_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES core_project(id),
  target_intent_id TEXT NOT NULL REFERENCES task_driver_intent(intent_id),
  idempotency_key TEXT NOT NULL UNIQUE,
  driver_digest TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_driver_policy (
  policy_ref_key TEXT PRIMARY KEY,
  policy_digest TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_driver_policy_revocation (
  revocation_ref_key TEXT PRIMARY KEY,
  policy_ref_key TEXT NOT NULL REFERENCES task_driver_policy(policy_ref_key),
  revocation_digest TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_driver_event (
  event_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES core_project(id),
  driver_id TEXT NOT NULL REFERENCES task_driver_record(driver_id),
  event_sequence INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_digest TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(project_id, event_sequence)
);
CREATE TABLE IF NOT EXISTS task_driver_authority_attestation (
  event_id TEXT PRIMARY KEY REFERENCES task_driver_event(event_id),
  evidence_digest TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_driver_writer_attestation (
  evidence_digest TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES core_project(id),
  driver_id TEXT NOT NULL REFERENCES task_driver_record(driver_id),
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_driver_task_baseline (
  task_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES core_project(id),
  task_revision_ref_json TEXT,
  work_status TEXT NOT NULL,
  baseline_digest TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_driver_apply_receipt (
  event_id TEXT PRIMARY KEY REFERENCES task_driver_event(event_id),
  project_id TEXT NOT NULL REFERENCES core_project(id),
  task_id TEXT NOT NULL,
  before_work_status TEXT,
  after_work_status TEXT NOT NULL,
  core_event_log_id INTEGER NOT NULL REFERENCES event_log(id),
  receipt_digest TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_driver_event_project_sequence
  ON task_driver_event(project_id, event_sequence);
CREATE INDEX IF NOT EXISTS idx_task_driver_record_project
  ON task_driver_record(project_id, driver_id);
`;

export class TaskDriverPersistenceError extends Error {
  constructor(code, details = undefined) {
    super(code);
    this.name = "TaskDriverPersistenceError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, details) {
  throw new TaskDriverPersistenceError(code, details);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expected, code) {
  if (!isPlainObject(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) fail(code);
}

function digest(value, domain) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\u0000${canonicalStringify(value)}`, "utf8")
    .digest("hex")}`;
}

function normalizeDigest(value, code) {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) fail(code);
  return value;
}

function refKey(ref) {
  return `${ref.entity_type}\u0000${ref.owner_surface}\u0000${ref.entity_id}`;
}

function refsEqual(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function normalizeText(value, code, maximum) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximum
    || value !== value.normalize("NFC")
    || value !== value.trim()
    || CONTROL_RE.test(value)
  ) fail(code);
  return value;
}

function normalizeOptionalText(value, code, maximum) {
  if (value === null) return null;
  return normalizeText(value, code, maximum);
}

function normalizeCandidateFields(input) {
  const candidateRef = typedRef(
    input.candidate_ref?.entity_type,
    input.candidate_ref?.owner_surface,
    input.candidate_ref?.entity_id,
  );
  if (
    candidateRef.entity_type !== "task_candidate"
    || candidateRef.owner_surface !== TASK_DRIVER_OWNER_SURFACE
  ) fail("task_driver_candidate_ref_invalid");
  const projectRef = typedRef(
    input.project_ref?.entity_type,
    input.project_ref?.owner_surface,
    input.project_ref?.entity_id,
  );
  if (projectRef.entity_type !== "project" || projectRef.owner_surface !== TASK_OWNER_SURFACE) {
    fail("task_driver_candidate_project_ref_invalid");
  }
  const initialWorkStatus = normalizeText(
    input.initial_work_status,
    "task_driver_candidate_status_invalid",
    32,
  );
  if (initialWorkStatus !== "not_started") {
    fail("task_driver_candidate_initial_status_unsupported");
  }
  const due = input.due === null
    ? null
    : normalizeText(input.due, "task_driver_candidate_due_invalid", 10);
  if (due !== null && !DATE_RE.test(due)) fail("task_driver_candidate_due_invalid");
  const workType = input.work_type === null
    ? null
    : normalizeText(input.work_type, "task_driver_candidate_work_type_invalid", 64);
  if (workType !== null && !SAFE_OPTIONAL_CODE_RE.test(workType)) {
    fail("task_driver_candidate_work_type_invalid");
  }
  if (!Array.isArray(input.source_revision_refs) || input.source_revision_refs.length > 64) {
    fail("task_driver_candidate_source_refs_invalid");
  }
  const sourceRevisionRefs = input.source_revision_refs.map((value) => {
    const ref = typedRef(value?.entity_type, value?.owner_surface, value?.entity_id);
    if (ref.entity_type !== "source_revision") {
      fail("task_driver_candidate_source_refs_invalid");
    }
    return ref;
  }).sort((left, right) => refKey(left).localeCompare(refKey(right), "en"));
  if (new Set(sourceRevisionRefs.map(refKey)).size !== sourceRevisionRefs.length) {
    fail("task_driver_candidate_source_refs_invalid");
  }
  return {
    candidateRef,
    projectRef,
    title: normalizeText(input.title, "task_driver_candidate_title_invalid", 500),
    initialWorkStatus,
    due,
    workType,
    completionCriteria: normalizeOptionalText(
      input.completion_criteria,
      "task_driver_candidate_completion_criteria_invalid",
      2000,
    ),
    sourceRevisionRefs,
    createdAt: normalizeText(input.created_at, "task_driver_candidate_created_at_invalid", 32),
  };
}

function candidatePayload(fields) {
  return {
    schema_version: TASK_DRIVER_CANDIDATE_SCHEMA_VERSION,
    candidate_ref: fields.candidateRef,
    project_ref: fields.projectRef,
    title: fields.title,
    initial_work_status: fields.initialWorkStatus,
    due: fields.due,
    work_type: fields.workType,
    completion_criteria: fields.completionCriteria,
    source_revision_refs: fields.sourceRevisionRefs,
    created_at: fields.createdAt,
  };
}

export function buildTaskCandidateSpec(input) {
  assertExactKeys(input, [
    "candidate_ref",
    "project_ref",
    "title",
    "initial_work_status",
    "due",
    "work_type",
    "completion_criteria",
    "source_revision_refs",
    "created_at",
  ], "task_driver_candidate_shape_invalid");
  const fields = normalizeCandidateFields(input);
  if (
    !STRICT_UTC_MS_RE.test(fields.createdAt)
    || !Number.isFinite(Date.parse(fields.createdAt))
  ) fail("task_driver_candidate_created_at_invalid");
  const payload = candidatePayload(fields);
  return Object.freeze({
    ...payload,
    candidate_digest: digest(payload, "soulforge.task_driver.candidate.v1"),
  });
}

export function validateTaskCandidateSpec(value) {
  assertExactKeys(value, [
    "schema_version",
    "candidate_ref",
    "project_ref",
    "title",
    "initial_work_status",
    "due",
    "work_type",
    "completion_criteria",
    "source_revision_refs",
    "created_at",
    "candidate_digest",
  ], "task_driver_candidate_shape_invalid");
  if (value.schema_version !== TASK_DRIVER_CANDIDATE_SCHEMA_VERSION) {
    fail("task_driver_candidate_version_invalid");
  }
  const fields = normalizeCandidateFields(value);
  if (
    !STRICT_UTC_MS_RE.test(fields.createdAt)
    || !Number.isFinite(Date.parse(fields.createdAt))
  ) fail("task_driver_candidate_created_at_invalid");
  const payload = candidatePayload(fields);
  const candidateDigest = normalizeDigest(
    value.candidate_digest,
    "task_driver_candidate_digest_invalid",
  );
  if (candidateDigest !== digest(payload, "soulforge.task_driver.candidate.v1")) {
    fail("task_driver_candidate_digest_mismatch");
  }
  return Object.freeze({ ...payload, candidate_digest: candidateDigest });
}

export function installTaskDriverPersistence(db) {
  if (!db || typeof db.exec !== "function" || typeof db.prepare !== "function") {
    fail("task_driver_persistence_db_invalid");
  }
  db.exec("PRAGMA foreign_keys=ON;");
  db.exec(DDL);
  for (const table of LEDGER_TABLES) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS ${table}_append_only_update
      BEFORE UPDATE ON ${table}
      BEGIN SELECT RAISE(ABORT, 'task_driver_append_only'); END;
      CREATE TRIGGER IF NOT EXISTS ${table}_append_only_delete
      BEFORE DELETE ON ${table}
      BEGIN SELECT RAISE(ABORT, 'task_driver_append_only'); END;
    `);
  }
  const meta = db.prepare("SELECT value FROM meta WHERE key=?").get(
    "task_driver_persistence_schema_version",
  );
  if (meta && meta.value !== TASK_DRIVER_PERSISTENCE_SCHEMA_VERSION) {
    fail("task_driver_persistence_schema_version_conflict");
  }
  if (!meta) {
    db.prepare("INSERT INTO meta(key,value) VALUES(?,?)").run(
      "task_driver_persistence_schema_version",
      TASK_DRIVER_PERSISTENCE_SCHEMA_VERSION,
    );
  }
  return {
    schema_version: TASK_DRIVER_PERSISTENCE_SCHEMA_VERSION,
    tables: [...LEDGER_TABLES],
  };
}

function loadJsonRows(db, table, whereSql = "", args = []) {
  return db.prepare(`SELECT payload_json FROM ${table} ${whereSql}`).all(...args)
    .map((row) => JSON.parse(row.payload_json));
}

function insertImmutable(db, specification) {
  const existing = db.prepare(
    `SELECT ${specification.digestColumn} AS digest, payload_json
       FROM ${specification.table} WHERE ${specification.keyColumn}=?`,
  ).get(specification.key);
  const payloadJson = canonicalStringify(specification.payload);
  if (existing) {
    if (existing.digest !== specification.digest || existing.payload_json !== payloadJson) {
      fail(specification.conflictCode);
    }
    return false;
  }
  const columns = Object.keys(specification.columns);
  db.prepare(
    `INSERT INTO ${specification.table}(${columns.join(",")})
     VALUES(${columns.map(() => "?").join(",")})`,
  ).run(...columns.map((column) => specification.columns[column]));
  return true;
}

const CORE_TO_WORK_STATUS = Object.freeze({
  open: "not_started",
  doing: "in_progress",
  waiting: "waiting",
  blocked: "blocked",
  done: "done",
  archived: "archived",
});
const WORK_TO_CORE_STATUS = Object.freeze({
  not_started: "open",
  in_progress: "doing",
  waiting: "waiting",
  blocked: "blocked",
  done: "done",
  cancelled: "archived",
  merged: "archived",
  archived: "archived",
});

function baselinePayload(projectRef, taskRef, workStatus) {
  return {
    project_ref: projectRef,
    task_ref: taskRef,
    current_task_revision_ref: null,
    work_status: workStatus,
  };
}

function ensureBaseline(db, projectRef, taskRef) {
  const createdByLedger = db.prepare(
    "SELECT 1 FROM task_driver_apply_receipt WHERE task_id=? LIMIT 1",
  ).get(taskRef.entity_id);
  if (createdByLedger) return null;
  const existing = db.prepare(
    "SELECT payload_json FROM task_driver_task_baseline WHERE task_id=?",
  ).get(taskRef.entity_id);
  if (existing) return JSON.parse(existing.payload_json);
  const item = db.prepare(
    "SELECT id, project_id, status FROM core_item WHERE id=?",
  ).get(taskRef.entity_id);
  if (!item) fail("task_driver_persistence_task_not_found");
  if (item.project_id !== projectRef.entity_id) {
    fail("task_driver_persistence_task_project_mismatch");
  }
  const workStatus = CORE_TO_WORK_STATUS[item.status];
  if (!workStatus) fail("task_driver_persistence_core_status_unsupported");
  const payload = baselinePayload(projectRef, taskRef, workStatus);
  const baselineDigest = digest(payload, "soulforge.task_driver.task_baseline.v1");
  insertImmutable(db, {
    table: "task_driver_task_baseline",
    keyColumn: "task_id",
    key: taskRef.entity_id,
    digestColumn: "baseline_digest",
    digest: baselineDigest,
    payload,
    conflictCode: "task_driver_persistence_baseline_conflict",
    columns: {
      task_id: taskRef.entity_id,
      project_id: projectRef.entity_id,
      task_revision_ref_json: null,
      work_status: workStatus,
      baseline_digest: baselineDigest,
      payload_json: canonicalStringify(payload),
    },
  });
  return payload;
}

function normalizeWriterAttestation(value, request) {
  assertExactKeys(value, [
    "schema_version",
    "project_ref",
    "writer_ref",
    "driver_ref",
    "driver_digest",
    "event_digests",
    "candidate_digest",
    "operation",
    "node_role",
    "sole_writer",
    "approved",
    "authority_basis_digest",
    "evidence_digest",
  ], "task_driver_writer_attestation_invalid");
  const payload = { ...value };
  delete payload.evidence_digest;
  if (
    payload.schema_version !== TASK_DRIVER_WRITER_ATTESTATION_SCHEMA_VERSION
    || !refsEqual(payload.project_ref, request.project_ref)
    || !refsEqual(payload.writer_ref, request.writer_ref)
    || !refsEqual(payload.driver_ref, request.driver_ref)
    || payload.driver_digest !== request.driver_digest
    || canonicalStringify(payload.event_digests) !== canonicalStringify(request.event_digests)
    || payload.candidate_digest !== request.candidate_digest
    || payload.operation !== APPLY_OPERATION
    || payload.node_role !== "operational_primary"
    || payload.sole_writer !== true
    || payload.approved !== true
  ) fail("task_driver_writer_attestation_binding_mismatch");
  normalizeDigest(
    payload.authority_basis_digest,
    "task_driver_writer_authority_basis_digest_invalid",
  );
  const evidenceDigest = normalizeDigest(
    value.evidence_digest,
    "task_driver_writer_evidence_digest_invalid",
  );
  if (
    evidenceDigest
    !== digest(payload, "soulforge.task_driver.writer_attestation.v1")
  ) fail("task_driver_writer_evidence_digest_mismatch");
  return Object.freeze({ ...payload, evidence_digest: evidenceDigest });
}

function resolveWriterAuthority(resolver, request) {
  if (typeof resolver !== "function") fail("task_driver_trusted_writer_resolver_required");
  let value;
  try {
    value = resolver(Object.freeze(request));
  } catch {
    fail("task_driver_writer_resolution_failed");
  }
  return normalizeWriterAttestation(value, request);
}

function writerRequest(driver, intent, events, candidate) {
  const writerRefs = new Map(events.map((event) => [refKey(event.writer_ref), event.writer_ref]));
  if (writerRefs.size !== 1) fail("task_driver_persistence_writer_ref_conflict");
  return {
    project_ref: driver.project_ref,
    writer_ref: [...writerRefs.values()][0],
    driver_ref: taskDriverRef(driver, intent),
    driver_digest: driver.driver_digest,
    event_digests: events.map((event) => event.event_digest).sort(),
    candidate_digest: candidate?.candidate_digest ?? null,
    operation: APPLY_OPERATION,
  };
}

function replayInput(db, projectId, incoming, cutoff) {
  return {
    intents: [
      ...loadJsonRows(db, "task_driver_intent", "WHERE project_id=?", [projectId]),
      incoming.intent,
    ],
    drivers: [
      ...loadJsonRows(db, "task_driver_record", "WHERE project_id=?", [projectId]),
      incoming.driver,
    ],
    policies: [
      ...loadJsonRows(db, "task_driver_policy"),
      ...incoming.policies,
    ],
    policy_revocations: [
      ...loadJsonRows(db, "task_driver_policy_revocation"),
      ...incoming.policyRevocations,
    ],
    events: [
      ...loadJsonRows(db, "task_driver_event", "WHERE project_id=?", [projectId]),
      ...incoming.events,
    ],
    initial_tasks: loadJsonRows(
      db,
      "task_driver_task_baseline",
      "WHERE project_id=?",
      [projectId],
    ),
    cutoff,
  };
}

function insertCandidate(db, candidate) {
  if (candidate === null) return false;
  return insertImmutable(db, {
    table: "task_driver_candidate",
    keyColumn: "candidate_id",
    key: candidate.candidate_ref.entity_id,
    digestColumn: "candidate_digest",
    digest: candidate.candidate_digest,
    payload: candidate,
    conflictCode: "task_driver_persistence_candidate_conflict",
    columns: {
      candidate_id: candidate.candidate_ref.entity_id,
      project_id: candidate.project_ref.entity_id,
      candidate_digest: candidate.candidate_digest,
      payload_json: canonicalStringify(candidate),
    },
  });
}

function insertIntent(db, intent) {
  return insertImmutable(db, {
    table: "task_driver_intent",
    keyColumn: "intent_id",
    key: intent.intent_id,
    digestColumn: "intent_digest",
    digest: intent.intent_digest,
    payload: intent,
    conflictCode: "task_driver_persistence_intent_conflict",
    columns: {
      intent_id: intent.intent_id,
      project_id: intent.project_ref.entity_id,
      intent_digest: intent.intent_digest,
      payload_json: canonicalStringify(intent),
    },
  });
}

function insertDriver(db, driver) {
  return insertImmutable(db, {
    table: "task_driver_record",
    keyColumn: "driver_id",
    key: driver.driver_id,
    digestColumn: "driver_digest",
    digest: driver.driver_digest,
    payload: driver,
    conflictCode: "task_driver_persistence_driver_conflict",
    columns: {
      driver_id: driver.driver_id,
      project_id: driver.project_ref.entity_id,
      target_intent_id: driver.target_intent_ref.entity_id,
      idempotency_key: driver.idempotency_key,
      driver_digest: driver.driver_digest,
      payload_json: canonicalStringify(driver),
    },
  });
}

function insertPolicy(db, policy) {
  return insertImmutable(db, {
    table: "task_driver_policy",
    keyColumn: "policy_ref_key",
    key: refKey(policy.policy_ref),
    digestColumn: "policy_digest",
    digest: policy.policy_digest,
    payload: policy,
    conflictCode: "task_driver_persistence_policy_conflict",
    columns: {
      policy_ref_key: refKey(policy.policy_ref),
      policy_digest: policy.policy_digest,
      payload_json: canonicalStringify(policy),
    },
  });
}

function insertPolicyRevocation(db, revocation) {
  return insertImmutable(db, {
    table: "task_driver_policy_revocation",
    keyColumn: "revocation_ref_key",
    key: refKey(revocation.revocation_ref),
    digestColumn: "revocation_digest",
    digest: revocation.revocation_digest,
    payload: revocation,
    conflictCode: "task_driver_persistence_policy_revocation_conflict",
    columns: {
      revocation_ref_key: refKey(revocation.revocation_ref),
      policy_ref_key: refKey(revocation.policy_ref),
      revocation_digest: revocation.revocation_digest,
      payload_json: canonicalStringify(revocation),
    },
  });
}

function insertEvent(db, projectId, driverId, event) {
  return insertImmutable(db, {
    table: "task_driver_event",
    keyColumn: "event_id",
    key: event.event_id,
    digestColumn: "event_digest",
    digest: event.event_digest,
    payload: event,
    conflictCode: "task_driver_persistence_event_conflict",
    columns: {
      event_id: event.event_id,
      project_id: projectId,
      driver_id: driverId,
      event_sequence: event.event_sequence,
      idempotency_key: event.idempotency_key,
      event_digest: event.event_digest,
      payload_json: canonicalStringify(event),
    },
  });
}

function applyCoreProjection(db, { candidate, intent, driver, applyEvent, projection, writer }) {
  const taskProjection = projection.tasks.find((task) => (
    task.task_ref.entity_id === applyEvent.result_task_ref.entity_id
  ));
  if (!taskProjection) fail("task_driver_persistence_projection_task_missing");
  const nextCoreStatus = WORK_TO_CORE_STATUS[taskProjection.work_status];
  if (!nextCoreStatus) fail("task_driver_persistence_projection_status_unsupported");
  const existingReceipt = db.prepare(
    "SELECT payload_json FROM task_driver_apply_receipt WHERE event_id=?",
  ).get(applyEvent.event_id);
  if (existingReceipt) return JSON.parse(existingReceipt.payload_json);

  const taskId = taskProjection.task_ref.entity_id;
  const beforeItem = db.prepare(
    "SELECT id, project_id, status FROM core_item WHERE id=?",
  ).get(taskId);
  let beforeWorkStatus = null;
  if (intent.intent_kind === "task_create") {
    if (candidate === null || !refsEqual(candidate.candidate_ref, intent.task_candidate_ref)) {
      fail("task_driver_persistence_candidate_binding_mismatch");
    }
    if (beforeItem) fail("task_driver_persistence_task_create_conflict");
    db.prepare(
      `INSERT INTO core_item(
        id,project_id,title,origin,spawn_kind,encounter_role,difficulty,urgency,
        automation_level,status,due,created_by,work_type,completion_criteria,
        source_candidate_ref,source_lineage_ref,generation_run_ref,created_at,data_label
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      taskId,
      candidate.project_ref.entity_id,
      candidate.title,
      "task_driver",
      "spawned",
      "normal",
      2,
      "normal",
      "assisted",
      nextCoreStatus,
      candidate.due,
      applyEvent.actor_ref.entity_id,
      candidate.work_type,
      candidate.completion_criteria,
      candidate.candidate_ref.entity_id,
      canonicalStringify(candidate.source_revision_refs),
      driver.driver_id,
      applyEvent.recorded_at,
      "real",
    );
  } else {
    if (!beforeItem) fail("task_driver_persistence_task_not_found");
    if (beforeItem.project_id !== driver.project_ref.entity_id) {
      fail("task_driver_persistence_task_project_mismatch");
    }
    beforeWorkStatus = CORE_TO_WORK_STATUS[beforeItem.status];
    if (!beforeWorkStatus) fail("task_driver_persistence_core_status_unsupported");
    const doneAt = nextCoreStatus === "done" ? applyEvent.recorded_at : null;
    db.prepare("UPDATE core_item SET status=?, done_at=? WHERE id=?").run(
      nextCoreStatus,
      doneAt,
      taskId,
    );
  }

  const eventLogResult = db.prepare(
    `INSERT INTO event_log(
      at,actor_ref,actor_kind,item_ref,kind,from_val,to_val,used_refs,
      data_label,note,project_ref
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    applyEvent.recorded_at,
    applyEvent.actor_ref.entity_id,
    applyEvent.actor_kind === "human" ? "human" : "system",
    taskId,
    "task_driver_apply",
    beforeWorkStatus,
    taskProjection.work_status,
    JSON.stringify([
      `task_intent:${intent.intent_id}`,
      `task_driver:${driver.driver_id}`,
      `task_driver_event:${applyEvent.event_id}`,
      `authority:${writer.evidence_digest}`,
    ]),
    "real",
    null,
    driver.project_ref.entity_id,
  );
  const payload = {
    schema_version: "soulforge.task_driver_apply_receipt.v1",
    event_ref: typedRef("event", TASK_DRIVER_OWNER_SURFACE, applyEvent.event_id),
    event_digest: applyEvent.event_digest,
    project_ref: driver.project_ref,
    task_ref: taskProjection.task_ref,
    before_work_status: beforeWorkStatus,
    after_work_status: taskProjection.work_status,
    core_event_log_id: Number(eventLogResult.lastInsertRowid),
    writer_evidence_digest: writer.evidence_digest,
  };
  const receiptDigest = digest(payload, "soulforge.task_driver.apply_receipt.v1");
  db.prepare(
    `INSERT INTO task_driver_apply_receipt(
      event_id,project_id,task_id,before_work_status,after_work_status,
      core_event_log_id,receipt_digest,payload_json
    ) VALUES(?,?,?,?,?,?,?,?)`,
  ).run(
    applyEvent.event_id,
    driver.project_ref.entity_id,
    taskId,
    beforeWorkStatus,
    taskProjection.work_status,
    Number(eventLogResult.lastInsertRowid),
    receiptDigest,
    canonicalStringify({ ...payload, receipt_digest: receiptDigest }),
  );
  return { ...payload, receipt_digest: receiptDigest };
}

export function applyTaskDriverDecisionSet(db, input, options = {}) {
  assertExactKeys(input, [
    "candidate",
    "intent",
    "driver",
    "policies",
    "policy_revocations",
    "events",
    "cutoff",
  ], "task_driver_persistence_input_invalid");
  assertExactKeys(options, [
    "trusted_authority_resolver",
    "trusted_writer_resolver",
  ], "task_driver_persistence_options_invalid");
  if (!db || typeof db.exec !== "function" || typeof db.prepare !== "function") {
    fail("task_driver_persistence_db_invalid");
  }
  const candidate = input.candidate === null
    ? null
    : validateTaskCandidateSpec(input.candidate);
  const intent = validateTaskIntent(input.intent);
  const driver = validateTaskDriver(input.driver, intent);
  if (candidate !== null) {
    if (
      !refsEqual(candidate.project_ref, intent.project_ref)
      || !refsEqual(candidate.candidate_ref, intent.task_candidate_ref)
      || candidate.initial_work_status !== intent.proposed_to_state_or_patch.initial_work_status
    ) fail("task_driver_persistence_candidate_binding_mismatch");
  } else if (intent.intent_kind === "task_create") {
    fail("task_driver_persistence_candidate_required");
  }
  if (!Array.isArray(input.policies) || !Array.isArray(input.policy_revocations)) {
    fail("task_driver_persistence_policy_collection_invalid");
  }
  const policies = input.policies.map(validateTaskDriverPolicy);
  const policyRevocations = input.policy_revocations.map(
    validateTaskDriverPolicyRevocation,
  );
  if (!Array.isArray(input.events) || input.events.length === 0) {
    fail("task_driver_persistence_events_required");
  }
  const events = input.events.map((event) => validateTaskDriverEvent(event, driver, intent));
  if (new Set(events.map((event) => event.event_id)).size !== events.length) {
    fail("task_driver_persistence_event_duplicate");
  }
  const applyEvents = events.filter((event) => event.event_kind === "apply");
  if (applyEvents.length > 1) fail("task_driver_persistence_multiple_apply_events");
  if (driver.project_ref.entity_id !== intent.project_ref.entity_id) {
    fail("task_driver_persistence_project_binding_mismatch");
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const project = db.prepare("SELECT id FROM core_project WHERE id=?").get(
      driver.project_ref.entity_id,
    );
    if (!project) fail("task_driver_persistence_project_not_found");
    if (
      applyEvents.length === 1
      && intent.intent_kind !== "task_create"
      && intent.task_ref !== null
    ) ensureBaseline(db, driver.project_ref, intent.task_ref);

    const request = writerRequest(driver, intent, events, candidate);
    const writer = resolveWriterAuthority(options.trusted_writer_resolver, request);
    const storedAttestations = new Map(
      db.prepare(
        `SELECT a.event_id,a.payload_json FROM task_driver_authority_attestation a
         JOIN task_driver_event e ON e.event_id=a.event_id WHERE e.project_id=?`,
      ).all(driver.project_ref.entity_id).map((row) => [row.event_id, JSON.parse(row.payload_json)]),
    );
    const newAttestations = new Map();
    const authorityResolver = (authorityRequest) => {
      const eventId = authorityRequest.event_ref.entity_id;
      const stored = storedAttestations.get(eventId);
      if (stored) return stored;
      if (typeof options.trusted_authority_resolver !== "function") {
        fail("task_driver_trusted_authority_resolver_required");
      }
      const attestation = options.trusted_authority_resolver(authorityRequest);
      newAttestations.set(eventId, attestation);
      return attestation;
    };
    const projection = replayTaskDriverContract(
      replayInput(db, driver.project_ref.entity_id, {
        intent,
        driver,
        policies,
        policyRevocations,
        events,
      }, input.cutoff),
      { trusted_authority_resolver: authorityResolver },
    );

    insertCandidate(db, candidate);
    insertIntent(db, intent);
    insertDriver(db, driver);
    for (const policy of policies) insertPolicy(db, policy);
    for (const revocation of policyRevocations) insertPolicyRevocation(db, revocation);
    for (const event of events) insertEvent(
      db,
      driver.project_ref.entity_id,
      driver.driver_id,
      event,
    );
    for (const [eventId, attestation] of newAttestations) {
      insertImmutable(db, {
        table: "task_driver_authority_attestation",
        keyColumn: "event_id",
        key: eventId,
        digestColumn: "evidence_digest",
        digest: attestation.evidence_digest,
        payload: attestation,
        conflictCode: "task_driver_persistence_authority_conflict",
        columns: {
          event_id: eventId,
          evidence_digest: attestation.evidence_digest,
          payload_json: canonicalStringify(attestation),
        },
      });
    }
    insertImmutable(db, {
      table: "task_driver_writer_attestation",
      keyColumn: "evidence_digest",
      key: writer.evidence_digest,
      digestColumn: "evidence_digest",
      digest: writer.evidence_digest,
      payload: writer,
      conflictCode: "task_driver_persistence_writer_authority_conflict",
      columns: {
        evidence_digest: writer.evidence_digest,
        project_id: driver.project_ref.entity_id,
        driver_id: driver.driver_id,
        payload_json: canonicalStringify(writer),
      },
    });
    const applyReceipt = applyEvents.length === 0
      ? null
      : applyCoreProjection(db, {
          candidate,
          intent,
          driver,
          applyEvent: applyEvents[0],
          projection,
          writer,
        });
    db.exec("COMMIT");
    return Object.freeze({
      schema_version: TASK_DRIVER_PERSISTENCE_SCHEMA_VERSION,
      project_ref: driver.project_ref,
      driver_ref: taskDriverRef(driver, intent),
      driver_digest: driver.driver_digest,
      projection_digest: projection.projection_digest,
      writer_evidence_digest: writer.evidence_digest,
      apply_receipt: applyReceipt,
    });
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Preserve the authoritative original failure.
    }
    throw error;
  }
}

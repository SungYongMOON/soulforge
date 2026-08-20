import { createHash } from "node:crypto";
import { types } from "node:util";

export const LINEAR_LB1_V2_SNAPSHOT_SCHEMA_VERSION = "soulforge.backup_controller.linear_lb1.snapshot.v2";
export const LINEAR_LB1_V2_COLLECTION_SCHEMA_VERSION = "soulforge.backup_controller.linear_lb1.collection.v2";
export const LINEAR_LB1_V2_MANIFEST_SCHEMA_VERSION = "soulforge.backup_controller.linear_lb1.manifest.v2";
export const LINEAR_LB1_V2_RUN_SCHEMA_VERSION = "soulforge.backup_controller.linear_lb1.run.v2";
export const LINEAR_LB1_V2_RESTORE_CHECK_SCHEMA_VERSION = "soulforge.backup_controller.linear_lb1.restore_check.v2";

export const LINEAR_LB1_V2_DIMENSIONS = Object.freeze([
  "issue",
  "team",
  "project",
  "assignee",
  "status",
  "timestamps",
  "due",
  "relations",
  "description",
  "comments",
  "state_history",
  "assignee_history",
  "project_history",
  "due_history",
  "waiting_info",
  "completion_record",
  "evidence_refs",
  "cutoff_completeness",
]);

export const LINEAR_LB1_ZERO_EFFECTS = Object.freeze({
  provider_calls: 0,
  storage_writes: 0,
  network_calls: 0,
  filesystem_writes: 0,
  scheduler_changes: 0,
});

export class LinearLb1V2Error extends Error {
  constructor(code) {
    super(code);
    this.name = "LinearLb1V2Error";
    this.code = code;
  }
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const HUMAN_ID = /^[A-Z0-9]{1,16}-[0-9]{1,10}$/;
const ERROR_CODE = /^[a-z][a-z0-9_-]{2,63}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REVISION_ID_DOMAIN = "soulforge.backup_controller.linear_lb1.revision.v2";
const COLLECTION_STATUSES = new Set(["complete", "partial", "failed"]);
const TABULAR_ARTIFACT_KINDS = new Set(["sheet", "csv"]);
const UNSAFE_ERROR_CODE_SEGMENTS = new Set([
  "raw", "payload", "secret", "token", "password", "credential", "cookie", "session", "private", "path",
]);

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const LOCAL_PATH = /(?:^|[\s"'])(?:[A-Za-z]:[\\/]|file:\/\/\/|\/(?:home|Users)\/|\\\\)/u;
const SECRET = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const MAX_CAPS = Object.freeze({
  string_len: 4096,
  array_len: 500,
  object_keys: 64,
  depth: 20,
  values: 10000,
});

function codepointCompare(a, b) {
  const sa = String(a ?? "");
  const sb = String(b ?? "");
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function hexSeed(seed) {
  return createHash("sha256").update(String(seed)).digest("hex");
}

function makePinnedRef(seed) {
  const h = hexSeed(seed);
  return Object.freeze({
    entity_id: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`,
    revision_id: `${h.slice(32, 40)}-${h.slice(40, 44)}-4${h.slice(45, 48)}-9${h.slice(49, 52)}-${h.slice(52, 64)}`,
    content_id: `sha256:${h}`,
    content_hash_alg: "sha256",
  });
}

function fail(code) {
  throw new LinearLb1V2Error(code);
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeString(value, code) {
  if (typeof value !== "string" || value.length > MAX_CAPS.string_len) fail(code);
  if (value.normalize("NFC") !== value || CONTROL.test(value) || LOCAL_PATH.test(value) || SECRET.test(value)) {
    fail(code);
  }
  return value;
}

function safeBodyString(value, code) {
  if (typeof value !== "string" || value.length > MAX_CAPS.string_len) fail(code);
  if (value.normalize("NFC") !== value || CONTROL.test(value)) {
    fail(code);
  }
  return value;
}

function exactKeys(value, expected, code) {
  if (!isPlainRecord(value)) fail(code);
  const actual = Object.keys(value).sort(codepointCompare);
  const wanted = [...expected].sort(codepointCompare);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function stableJson(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value).sort(codepointCompare).map((key) => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function sha256Utf8(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function deterministicRevisionId({ runKey, collectionStatus, snapshotSha256, manifestSha256 }) {
  return "linear-lb1-v2-revision-" + sha256({
    revision_domain: REVISION_ID_DOMAIN,
    run_key: runKey,
    collection_status: collectionStatus,
    snapshot_sha256: snapshotSha256,
    manifest_sha256: manifestSha256,
  });
}

function snapshotPlainData(root, errorCode = "linear_lb1_v2_shape_invalid") {
  const seen = new WeakSet();
  let values = 0;
  function walk(value, depth) {
    values += 1;
    if (values > MAX_CAPS.values || depth > MAX_CAPS.depth) fail(errorCode);
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.length > MAX_CAPS.string_len || value.normalize("NFC") !== value || CONTROL.test(value)) {
        fail(errorCode);
      }
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) fail(errorCode);
      return value;
    }
    if (typeof value !== "object" || types.isProxy(value) || seen.has(value)) {
      fail(errorCode);
    }
    seen.add(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_CAPS.array_len) {
        fail(errorCode);
      }
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys.some((key, index) => (
        index < value.length ? key !== String(index) : key !== "length"
      ))) fail(errorCode);
      return value.map((entry) => walk(entry, depth + 1));
    }
    if (!isPlainRecord(value)) fail(errorCode);
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_CAPS.object_keys || keys.some((key) => typeof key !== "string")) {
      fail(errorCode);
    }
    const output = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail(errorCode);
      }
      Object.defineProperty(output, key, {
        value: walk(descriptor.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return output;
  }
  return walk(root, 0);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function requireId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return safeString(value, code);
}

function requireNullableId(value, code) {
  if (value === null) return null;
  return requireId(value, code);
}

function requireHumanId(value, code) {
  if (typeof value !== "string" || !HUMAN_ID.test(value)) fail(code);
  return safeString(value, code);
}

function requireErrorCode(value, code) {
  if (typeof value !== "string" || !ERROR_CODE.test(value)) fail(code);
  if (value.split(/[-_]+/).some((segment) => UNSAFE_ERROR_CODE_SEGMENTS.has(segment))) fail(code);
  return value;
}

function requireIso(value, code) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code);
  return value;
}

function requireNullableIso(value, code) {
  if (value === null) return null;
  return requireIso(value, code);
}

function requireSha256(value, code) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(code);
  return value;
}

function requireArray(value, code) {
  if (!Array.isArray(value)) fail(code);
  return value;
}

function assertUnique(records, key, code) {
  const seen = new Set();
  for (const record of records) {
    const val = record[key];
    if (val !== null && val !== undefined) {
      if (seen.has(val)) fail(code);
      seen.add(val);
    }
  }
}

function sortBy(records, key) {
  records.sort((left, right) => codepointCompare(left[key], right[key]));
}

function validateRelation(relation) {
  exactKeys(relation, ["relation_id", "relation_type", "target_issue_id"], "linear_lb1_v2_relation_shape_invalid");
  requireId(relation.relation_id, "linear_lb1_v2_relation_id_invalid");
  requireId(relation.target_issue_id, "linear_lb1_v2_relation_target_invalid");
  if (typeof relation.relation_type !== "string" || !/^[a-z][a-z0-9_]{1,63}$/.test(relation.relation_type)) {
    fail("linear_lb1_v2_relation_type_invalid");
  }
}

function validateDescription(desc) {
  exactKeys(desc, ["revision_id", "body", "content_sha256", "updated_at", "author_id", "tombstone"], "linear_lb1_v2_description_shape_invalid");
  requireId(desc.revision_id, "linear_lb1_v2_description_revision_id_invalid");
  safeBodyString(desc.body, "linear_lb1_v2_description_body_invalid");
  requireSha256(desc.content_sha256, "linear_lb1_v2_description_hash_invalid");
  if (sha256Utf8(desc.body) !== desc.content_sha256) fail("linear_lb1_v2_description_hash_mismatch");
  requireIso(desc.updated_at, "linear_lb1_v2_description_timestamp_invalid");
  requireId(desc.author_id, "linear_lb1_v2_description_author_invalid");
  if (desc.tombstone !== null) {
    exactKeys(desc.tombstone, ["deleted_at", "actor_id"], "linear_lb1_v2_description_tombstone_invalid");
    requireIso(desc.tombstone.deleted_at, "linear_lb1_v2_description_tombstone_timestamp_invalid");
    requireId(desc.tombstone.actor_id, "linear_lb1_v2_description_tombstone_actor_invalid");
  }
}

function validateComment(comment) {
  exactKeys(comment, [
    "comment_id", "revision_id", "body", "content_sha256", "author_id",
    "parent_comment_id", "created_at", "edited_at", "updated_at", "archived_at", "resolved_at", "tombstone",
  ], "linear_lb1_v2_comment_shape_invalid");
  requireId(comment.comment_id, "linear_lb1_v2_comment_id_invalid");
  requireId(comment.revision_id, "linear_lb1_v2_comment_revision_invalid");
  safeBodyString(comment.body, "linear_lb1_v2_comment_body_invalid");
  requireSha256(comment.content_sha256, "linear_lb1_v2_comment_hash_invalid");
  if (sha256Utf8(comment.body) !== comment.content_sha256) fail("linear_lb1_v2_comment_hash_mismatch");
  requireId(comment.author_id, "linear_lb1_v2_comment_author_invalid");
  requireNullableId(comment.parent_comment_id, "linear_lb1_v2_comment_parent_invalid");
  requireIso(comment.created_at, "linear_lb1_v2_comment_timestamp_invalid");
  requireNullableIso(comment.edited_at, "linear_lb1_v2_comment_timestamp_invalid");
  requireIso(comment.updated_at, "linear_lb1_v2_comment_timestamp_invalid");
  requireNullableIso(comment.archived_at, "linear_lb1_v2_comment_timestamp_invalid");
  requireNullableIso(comment.resolved_at, "linear_lb1_v2_comment_timestamp_invalid");
  if (comment.tombstone !== null) {
    exactKeys(comment.tombstone, ["deleted_at", "actor_id"], "linear_lb1_v2_comment_tombstone_invalid");
    requireIso(comment.tombstone.deleted_at, "linear_lb1_v2_comment_tombstone_timestamp_invalid");
    requireId(comment.tombstone.actor_id, "linear_lb1_v2_comment_tombstone_actor_invalid");
  }
}

function validateStateHistory(history) {
  exactKeys(history, ["history_id", "from_status_id", "to_status_id", "actor_id", "occurred_at"], "linear_lb1_v2_state_history_shape_invalid");
  requireId(history.history_id, "linear_lb1_v2_history_id_invalid");
  requireId(history.from_status_id, "linear_lb1_v2_history_status_invalid");
  requireId(history.to_status_id, "linear_lb1_v2_history_status_invalid");
  requireId(history.actor_id, "linear_lb1_v2_history_actor_invalid");
  requireIso(history.occurred_at, "linear_lb1_v2_history_timestamp_invalid");
}

function validateAssigneeHistory(history) {
  exactKeys(history, ["history_id", "from_assignee_id", "to_assignee_id", "actor_id", "occurred_at"], "linear_lb1_v2_assignee_history_shape_invalid");
  requireId(history.history_id, "linear_lb1_v2_history_id_invalid");
  requireNullableId(history.from_assignee_id, "linear_lb1_v2_history_assignee_invalid");
  requireNullableId(history.to_assignee_id, "linear_lb1_v2_history_assignee_invalid");
  requireId(history.actor_id, "linear_lb1_v2_history_actor_invalid");
  requireIso(history.occurred_at, "linear_lb1_v2_history_timestamp_invalid");
}

function validateProjectHistory(history) {
  exactKeys(history, ["history_id", "from_project_id", "to_project_id", "actor_id", "occurred_at"], "linear_lb1_v2_project_history_shape_invalid");
  requireId(history.history_id, "linear_lb1_v2_history_id_invalid");
  requireNullableId(history.from_project_id, "linear_lb1_v2_history_project_invalid");
  requireNullableId(history.to_project_id, "linear_lb1_v2_history_project_invalid");
  requireId(history.actor_id, "linear_lb1_v2_history_actor_invalid");
  requireIso(history.occurred_at, "linear_lb1_v2_history_timestamp_invalid");
}

function validateDueHistory(history) {
  exactKeys(history, ["history_id", "from_due_at", "to_due_at", "actor_id", "occurred_at"], "linear_lb1_v2_due_history_shape_invalid");
  requireId(history.history_id, "linear_lb1_v2_history_id_invalid");
  requireNullableIso(history.from_due_at, "linear_lb1_v2_history_timestamp_invalid");
  requireNullableIso(history.to_due_at, "linear_lb1_v2_history_timestamp_invalid");
  requireId(history.actor_id, "linear_lb1_v2_history_actor_invalid");
  requireIso(history.occurred_at, "linear_lb1_v2_history_timestamp_invalid");
}

function validateWaitingInfo(w) {
  exactKeys(w, [
    "ref_id", "reason", "required_input", "next_action_owner_id", "due_at",
    "reply_due_at", "manager_decision_required", "captured_at",
  ], "linear_lb1_v2_waiting_shape_invalid");
  requireId(w.ref_id, "linear_lb1_v2_waiting_id_invalid");
  safeString(w.reason, "linear_lb1_v2_waiting_reason_invalid");
  safeString(w.required_input, "linear_lb1_v2_waiting_input_invalid");
  requireId(w.next_action_owner_id, "linear_lb1_v2_waiting_owner_invalid");
  requireNullableIso(w.due_at, "linear_lb1_v2_waiting_timestamp_invalid");
  requireNullableIso(w.reply_due_at, "linear_lb1_v2_waiting_timestamp_invalid");
  if (typeof w.manager_decision_required !== "boolean") fail("linear_lb1_v2_waiting_decision_invalid");
  requireIso(w.captured_at, "linear_lb1_v2_waiting_timestamp_invalid");
}

function validateCompletionRecord(c) {
  exactKeys(c, [
    "ref_id", "executor_succeeded_at", "business_completed_at", "official_task_done_at",
    "completion_criteria_met", "result", "evidence_refs", "captured_at",
  ], "linear_lb1_v2_completion_shape_invalid");
  requireId(c.ref_id, "linear_lb1_v2_completion_id_invalid");
  requireNullableIso(c.executor_succeeded_at, "linear_lb1_v2_completion_timestamp_invalid");
  requireNullableIso(c.business_completed_at, "linear_lb1_v2_completion_timestamp_invalid");
  requireNullableIso(c.official_task_done_at, "linear_lb1_v2_completion_timestamp_invalid");
  if (typeof c.completion_criteria_met !== "boolean") fail("linear_lb1_v2_completion_criteria_invalid");
  safeString(c.result, "linear_lb1_v2_completion_result_invalid");
  for (const ref of requireArray(c.evidence_refs, "linear_lb1_v2_completion_refs_invalid")) {
    requireId(ref, "linear_lb1_v2_completion_ref_id_invalid");
  }
  requireIso(c.captured_at, "linear_lb1_v2_completion_timestamp_invalid");
}

function validateEvidenceRef(e) {
  exactKeys(e, [
    "ref_id", "uri", "kind", "title", "mime_type", "size", "content_sha256", "captured_at", "availability",
  ], "linear_lb1_v2_evidence_shape_invalid");
  requireId(e.ref_id, "linear_lb1_v2_evidence_id_invalid");
  safeString(e.uri, "linear_lb1_v2_evidence_uri_invalid");
  requireId(e.kind, "linear_lb1_v2_evidence_kind_invalid");
  safeString(e.title, "linear_lb1_v2_evidence_title_invalid");
  safeString(e.mime_type, "linear_lb1_v2_evidence_mime_invalid");
  if (!Number.isSafeInteger(e.size) || e.size < 0) fail("linear_lb1_v2_evidence_size_invalid");
  requireSha256(e.content_sha256, "linear_lb1_v2_evidence_hash_invalid");
  requireIso(e.captured_at, "linear_lb1_v2_evidence_timestamp_invalid");
  if (e.availability !== "available" && e.availability !== "unavailable" && e.availability !== "unknown") {
    fail("linear_lb1_v2_evidence_availability_invalid");
  }
}

function validateIssue(issue) {
  exactKeys(issue, [
    "issue_id", "human_id", "title", "priority", "team_id", "project_id", "assignee_id",
    "status_id", "parent_issue_id", "created_at", "updated_at", "started_at", "completed_at",
    "canceled_at", "archived_at", "due_at", "tombstone", "relations", "description",
    "comments", "state_history", "assignee_history", "project_history", "due_history",
    "waiting_info", "completion_records", "evidence_refs",
  ], "linear_lb1_v2_issue_shape_invalid");
  requireId(issue.issue_id, "linear_lb1_v2_issue_id_invalid");
  requireHumanId(issue.human_id, "linear_lb1_v2_issue_human_id_invalid");
  safeString(issue.title, "linear_lb1_v2_issue_title_invalid");
  if (!Number.isSafeInteger(issue.priority) || issue.priority < 0 || issue.priority > 5) {
    fail("linear_lb1_v2_issue_priority_invalid");
  }
  requireId(issue.team_id, "linear_lb1_v2_issue_team_invalid");
  requireNullableId(issue.project_id, "linear_lb1_v2_issue_project_invalid");
  requireNullableId(issue.assignee_id, "linear_lb1_v2_issue_assignee_invalid");
  requireId(issue.status_id, "linear_lb1_v2_issue_status_invalid");
  requireNullableId(issue.parent_issue_id, "linear_lb1_v2_issue_parent_invalid");
  if (issue.parent_issue_id === issue.issue_id) fail("linear_lb1_v2_issue_self_parent");
  requireIso(issue.created_at, "linear_lb1_v2_issue_timestamp_invalid");
  requireIso(issue.updated_at, "linear_lb1_v2_issue_timestamp_invalid");
  requireNullableIso(issue.started_at, "linear_lb1_v2_issue_timestamp_invalid");
  requireNullableIso(issue.completed_at, "linear_lb1_v2_issue_timestamp_invalid");
  requireNullableIso(issue.canceled_at, "linear_lb1_v2_issue_timestamp_invalid");
  requireNullableIso(issue.archived_at, "linear_lb1_v2_issue_timestamp_invalid");
  requireNullableIso(issue.due_at, "linear_lb1_v2_issue_due_invalid");
  if (issue.tombstone !== null) {
    exactKeys(issue.tombstone, ["deleted_at", "actor_id"], "linear_lb1_v2_issue_tombstone_invalid");
    requireIso(issue.tombstone.deleted_at, "linear_lb1_v2_issue_tombstone_timestamp_invalid");
    requireId(issue.tombstone.actor_id, "linear_lb1_v2_issue_tombstone_actor_invalid");
  }

  validateDescription(issue.description);
  for (const relation of requireArray(issue.relations, "linear_lb1_v2_relations_invalid")) validateRelation(relation);
  for (const comment of requireArray(issue.comments, "linear_lb1_v2_comments_invalid")) validateComment(comment);
  for (const history of requireArray(issue.state_history, "linear_lb1_v2_state_history_invalid")) validateStateHistory(history);
  for (const history of requireArray(issue.assignee_history, "linear_lb1_v2_assignee_history_invalid")) validateAssigneeHistory(history);
  for (const history of requireArray(issue.project_history, "linear_lb1_v2_project_history_invalid")) validateProjectHistory(history);
  for (const history of requireArray(issue.due_history, "linear_lb1_v2_due_history_invalid")) validateDueHistory(history);
  for (const item of requireArray(issue.waiting_info, "linear_lb1_v2_waiting_invalid")) validateWaitingInfo(item);
  for (const item of requireArray(issue.completion_records, "linear_lb1_v2_completion_invalid")) validateCompletionRecord(item);
  for (const item of requireArray(issue.evidence_refs, "linear_lb1_v2_evidence_invalid")) validateEvidenceRef(item);

  assertUnique(issue.relations, "relation_id", "linear_lb1_v2_relation_duplicate");
  assertUnique(issue.comments, "comment_id", "linear_lb1_v2_comment_duplicate");
  assertUnique(issue.state_history, "history_id", "linear_lb1_v2_state_history_duplicate");
  assertUnique(issue.assignee_history, "history_id", "linear_lb1_v2_assignee_history_duplicate");
  assertUnique(issue.project_history, "history_id", "linear_lb1_v2_project_history_duplicate");
  assertUnique(issue.due_history, "history_id", "linear_lb1_v2_due_history_duplicate");
  assertUnique(issue.waiting_info, "ref_id", "linear_lb1_v2_waiting_duplicate");
  assertUnique(issue.completion_records, "ref_id", "linear_lb1_v2_completion_duplicate");
  assertUnique(issue.evidence_refs, "ref_id", "linear_lb1_v2_evidence_duplicate");

  // Verify internal comment thread references
  const commentIds = new Set(issue.comments.map((c) => c.comment_id));
  for (const comment of issue.comments) {
    if (comment.parent_comment_id !== null && !commentIds.has(comment.parent_comment_id)) {
      fail("linear_lb1_v2_comment_parent_uncovered");
    }
  }
}

export function normalizeLinearLb1V2Snapshot(snapshot) {
  const copy = snapshotPlainData(snapshot, "linear_lb1_v2_snapshot_shape_invalid");
  exactKeys(copy, [
    "schema_version", "snapshot_id", "collected_at", "source_scope", "teams",
    "projects", "assignees", "statuses", "cutoff", "issues",
  ], "linear_lb1_v2_snapshot_shape_invalid");

  if (copy.schema_version !== LINEAR_LB1_V2_SNAPSHOT_SCHEMA_VERSION) {
    fail("linear_lb1_v2_snapshot_schema_invalid");
  }
  requireId(copy.snapshot_id, "linear_lb1_v2_snapshot_id_invalid");
  requireIso(copy.collected_at, "linear_lb1_v2_snapshot_timestamp_invalid");

  exactKeys(copy.source_scope, ["kind", "workspace_id", "scope_mode", "team_ids", "project_ids"], "linear_lb1_v2_scope_shape_invalid");
  if (copy.source_scope.kind !== "public_synthetic_fixture") fail("linear_lb1_v2_scope_kind_invalid");
  requireId(copy.source_scope.workspace_id, "linear_lb1_v2_scope_workspace_invalid");
  if (copy.source_scope.scope_mode !== "entire_workspace" && copy.source_scope.scope_mode !== "allowlist") {
    fail("linear_lb1_v2_scope_mode_invalid");
  }
  requireArray(copy.source_scope.team_ids, "linear_lb1_v2_scope_team_ids_invalid");
  requireArray(copy.source_scope.project_ids, "linear_lb1_v2_scope_project_ids_invalid");
  for (const tid of copy.source_scope.team_ids) requireId(tid, "linear_lb1_v2_scope_team_id_invalid");
  for (const pid of copy.source_scope.project_ids) requireId(pid, "linear_lb1_v2_scope_project_id_invalid");

  if (copy.source_scope.scope_mode === "entire_workspace" && (copy.source_scope.team_ids.length !== 0 || copy.source_scope.project_ids.length !== 0)) {
    fail("linear_lb1_v2_scope_entire_workspace_has_filter");
  }
  if (copy.source_scope.scope_mode === "allowlist" && copy.source_scope.team_ids.length === 0 && copy.source_scope.project_ids.length === 0) {
    fail("linear_lb1_v2_scope_allowlist_empty");
  }

  // Catalogs
  for (const team of requireArray(copy.teams, "linear_lb1_v2_teams_invalid")) {
    exactKeys(team, ["team_id", "name", "key", "updated_at"], "linear_lb1_v2_team_shape_invalid");
    requireId(team.team_id, "linear_lb1_v2_team_id_invalid");
    safeString(team.name, "linear_lb1_v2_team_name_invalid");
    safeString(team.key, "linear_lb1_v2_team_key_invalid");
    requireIso(team.updated_at, "linear_lb1_v2_team_timestamp_invalid");
  }

  for (const project of requireArray(copy.projects, "linear_lb1_v2_projects_invalid")) {
    exactKeys(project, ["project_id", "name", "team_id", "updated_at"], "linear_lb1_v2_project_shape_invalid");
    requireId(project.project_id, "linear_lb1_v2_project_id_invalid");
    safeString(project.name, "linear_lb1_v2_project_name_invalid");
    requireId(project.team_id, "linear_lb1_v2_project_team_invalid");
    requireIso(project.updated_at, "linear_lb1_v2_project_timestamp_invalid");
  }

  for (const assignee of requireArray(copy.assignees, "linear_lb1_v2_assignees_invalid")) {
    exactKeys(assignee, ["assignee_id", "name", "email", "updated_at"], "linear_lb1_v2_assignee_shape_invalid");
    requireId(assignee.assignee_id, "linear_lb1_v2_assignee_id_invalid");
    safeString(assignee.name, "linear_lb1_v2_assignee_name_invalid");
    safeString(assignee.email, "linear_lb1_v2_assignee_email_invalid");
    requireIso(assignee.updated_at, "linear_lb1_v2_assignee_timestamp_invalid");
  }

  for (const status of requireArray(copy.statuses, "linear_lb1_v2_statuses_invalid")) {
    exactKeys(status, ["status_id", "name", "type", "team_id"], "linear_lb1_v2_status_shape_invalid");
    requireId(status.status_id, "linear_lb1_v2_status_id_invalid");
    safeString(status.name, "linear_lb1_v2_status_name_invalid");
    safeString(status.type, "linear_lb1_v2_status_type_invalid");
    requireId(status.team_id, "linear_lb1_v2_status_team_invalid");
  }

  // Cutoff & Pagination
  exactKeys(copy.cutoff, ["cutoff_at", "page_count", "total_issues", "pagination_complete"], "linear_lb1_v2_cutoff_shape_invalid");
  requireIso(copy.cutoff.cutoff_at, "linear_lb1_v2_cutoff_timestamp_invalid");
  if (!Number.isSafeInteger(copy.cutoff.page_count) || copy.cutoff.page_count < 1) {
    fail("linear_lb1_v2_cutoff_page_count_invalid");
  }
  if (!Number.isSafeInteger(copy.cutoff.total_issues) || copy.cutoff.total_issues < 0) {
    fail("linear_lb1_v2_cutoff_total_issues_invalid");
  }
  if (copy.cutoff.pagination_complete !== true) {
    fail("linear_lb1_v2_cutoff_pagination_incomplete");
  }

  for (const issue of requireArray(copy.issues, "linear_lb1_v2_issues_invalid")) validateIssue(issue);

  if (copy.teams.length === 0 || copy.statuses.length === 0 || copy.issues.length === 0) {
    fail("linear_lb1_v2_snapshot_empty_dimension");
  }
  if (copy.cutoff.total_issues !== copy.issues.length) {
    fail("linear_lb1_v2_cutoff_count_mismatch");
  }

  assertUnique(copy.teams, "team_id", "linear_lb1_v2_team_duplicate");
  assertUnique(copy.projects, "project_id", "linear_lb1_v2_project_duplicate");
  assertUnique(copy.assignees, "assignee_id", "linear_lb1_v2_assignee_duplicate");
  assertUnique(copy.statuses, "status_id", "linear_lb1_v2_status_duplicate");
  assertUnique(copy.issues, "issue_id", "linear_lb1_v2_issue_duplicate");
  assertUnique(copy.issues, "human_id", "linear_lb1_v2_human_id_duplicate");

  const teamIds = new Set(copy.teams.map((t) => t.team_id));
  const projectIds = new Set(copy.projects.map((p) => p.project_id));
  const assigneeIds = new Set(copy.assignees.map((a) => a.assignee_id));
  const statusIds = new Set(copy.statuses.map((s) => s.status_id));
  const issueIds = new Set(copy.issues.map((i) => i.issue_id));

  // Verify catalog foreign keys
  for (const project of copy.projects) {
    if (!teamIds.has(project.team_id)) fail("linear_lb1_v2_project_team_uncovered");
  }
  for (const status of copy.statuses) {
    if (!teamIds.has(status.team_id)) fail("linear_lb1_v2_status_team_uncovered");
  }

  // Verify issue associations
  for (const issue of copy.issues) {
    if (!teamIds.has(issue.team_id)) fail("linear_lb1_v2_issue_team_uncovered");
    if (issue.project_id !== null && !projectIds.has(issue.project_id)) fail("linear_lb1_v2_issue_project_uncovered");
    if (issue.assignee_id !== null && !assigneeIds.has(issue.assignee_id)) fail("linear_lb1_v2_issue_assignee_uncovered");
    if (!statusIds.has(issue.status_id)) fail("linear_lb1_v2_issue_status_uncovered");
    if (issue.parent_issue_id !== null && !issueIds.has(issue.parent_issue_id)) fail("linear_lb1_v2_issue_parent_uncovered");
    if (!assigneeIds.has(issue.description.author_id)) fail("linear_lb1_v2_description_author_uncovered");

    for (const relation of issue.relations) {
      if (!issueIds.has(relation.target_issue_id)) fail("linear_lb1_v2_relation_target_uncovered");
    }
    for (const comment of issue.comments) {
      if (!assigneeIds.has(comment.author_id)) fail("linear_lb1_v2_comment_author_uncovered");
    }
    for (const hist of issue.state_history) {
      if (!statusIds.has(hist.from_status_id) || !statusIds.has(hist.to_status_id)) fail("linear_lb1_v2_history_status_uncovered");
      if (!assigneeIds.has(hist.actor_id)) fail("linear_lb1_v2_history_actor_uncovered");
    }
    for (const hist of issue.assignee_history) {
      if (hist.from_assignee_id !== null && !assigneeIds.has(hist.from_assignee_id)) fail("linear_lb1_v2_history_assignee_uncovered");
      if (hist.to_assignee_id !== null && !assigneeIds.has(hist.to_assignee_id)) fail("linear_lb1_v2_history_assignee_uncovered");
      if (!assigneeIds.has(hist.actor_id)) fail("linear_lb1_v2_history_actor_uncovered");
    }
    for (const hist of issue.project_history) {
      if (hist.from_project_id !== null && !projectIds.has(hist.from_project_id)) fail("linear_lb1_v2_history_project_uncovered");
      if (hist.to_project_id !== null && !projectIds.has(hist.to_project_id)) fail("linear_lb1_v2_history_project_uncovered");
      if (!assigneeIds.has(hist.actor_id)) fail("linear_lb1_v2_history_actor_uncovered");
    }
    for (const waiting of issue.waiting_info) {
      if (!assigneeIds.has(waiting.next_action_owner_id)) fail("linear_lb1_v2_waiting_owner_uncovered");
    }
  }

  // Canonical sorting
  sortBy(copy.teams, "team_id");
  sortBy(copy.projects, "project_id");
  sortBy(copy.assignees, "assignee_id");
  sortBy(copy.statuses, "status_id");
  sortBy(copy.issues, "issue_id");

  for (const issue of copy.issues) {
    sortBy(issue.relations, "relation_id");
    sortBy(issue.comments, "comment_id");
    sortBy(issue.state_history, "history_id");
    sortBy(issue.assignee_history, "history_id");
    sortBy(issue.project_history, "history_id");
    sortBy(issue.due_history, "history_id");
    sortBy(issue.waiting_info, "ref_id");
    sortBy(issue.completion_records, "ref_id");
    sortBy(issue.evidence_refs, "ref_id");
  }

  return deepFreeze(copy);
}

function normalizeDimensions(dimensions, code) {
  requireArray(dimensions, code);
  const selected = new Set();
  for (const dimension of dimensions) {
    if (!LINEAR_LB1_V2_DIMENSIONS.includes(dimension) || selected.has(dimension)) fail(code);
    selected.add(dimension);
  }
  return LINEAR_LB1_V2_DIMENSIONS.filter((dimension) => selected.has(dimension));
}

function normalizeErrors(errors) {
  const copy = snapshotPlainData(errors, "linear_lb1_v2_errors_invalid");
  requireArray(copy, "linear_lb1_v2_errors_invalid");
  const codes = new Set();
  for (const error of copy) {
    exactKeys(error, ["code"], "linear_lb1_v2_error_shape_invalid");
    requireErrorCode(error.code, "linear_lb1_v2_error_code_invalid");
    if (codes.has(error.code)) fail("linear_lb1_v2_error_duplicate");
    codes.add(error.code);
  }
  copy.sort((left, right) => codepointCompare(left.code, right.code));
  return copy;
}

function collectionEnvelope(collectionStatus, snapshot, missingDimensions, errors) {
  return deepFreeze({
    schema_version: LINEAR_LB1_V2_COLLECTION_SCHEMA_VERSION,
    collector: {
      kind: "public_synthetic_fixture",
      feature_state: "off",
      provider_calls: 0,
      storage_writes: 0,
    },
    collection_status: collectionStatus,
    snapshot,
    declared_missing_dimensions: missingDimensions,
    errors,
    effects: LINEAR_LB1_ZERO_EFFECTS,
  });
}

export function collectFeatureOffLinearLb1V2Fixture(snapshot, options = {}) {
  const status = options.status === undefined ? "complete" : options.status;
  if (status !== "complete" && status !== "partial") fail("linear_lb1_v2_collection_status_invalid");
  const normalizedSnapshot = normalizeLinearLb1V2Snapshot(snapshot);
  const missingDimensions = normalizeDimensions(options.missing_dimensions === undefined ? [] : options.missing_dimensions, "linear_lb1_v2_missing_dimensions_invalid");
  const errors = normalizeErrors(options.errors === undefined ? [] : options.errors);
  if (status === "complete" && (missingDimensions.length !== 0 || errors.length !== 0)) fail("linear_lb1_v2_complete_collection_incomplete");
  if (status === "partial" && missingDimensions.length === 0) fail("linear_lb1_v2_partial_collection_without_missing_dimension");
  return collectionEnvelope(status, normalizedSnapshot, missingDimensions, deepFreeze(errors));
}

export function createFailedFeatureOffLinearLb1V2Collection({ errors }) {
  const normalizedErrors = normalizeErrors(errors);
  if (normalizedErrors.length === 0) fail("linear_lb1_v2_failed_collection_without_error");
  return collectionEnvelope("failed", null, [...LINEAR_LB1_V2_DIMENSIONS], deepFreeze(normalizedErrors));
}

function validateZeroEffects(effects) {
  exactKeys(effects, ["provider_calls", "storage_writes", "network_calls", "filesystem_writes", "scheduler_changes"], "linear_lb1_v2_effects_shape_invalid");
  for (const value of Object.values(effects)) {
    if (value !== 0) fail("linear_lb1_v2_effects_not_zero");
  }
}

function normalizeFeatureOffCollection(collection) {
  exactKeys(collection, ["schema_version", "collector", "collection_status", "snapshot", "declared_missing_dimensions", "errors", "effects"], "linear_lb1_v2_collection_shape_invalid");
  if (collection.schema_version !== LINEAR_LB1_V2_COLLECTION_SCHEMA_VERSION || !COLLECTION_STATUSES.has(collection.collection_status)) fail("linear_lb1_v2_collection_schema_invalid");
  exactKeys(collection.collector, ["kind", "feature_state", "provider_calls", "storage_writes"], "linear_lb1_v2_collector_shape_invalid");
  if (collection.collector.kind !== "public_synthetic_fixture" || collection.collector.feature_state !== "off" || collection.collector.provider_calls !== 0 || collection.collector.storage_writes !== 0) fail("linear_lb1_v2_collector_not_feature_off");
  validateZeroEffects(collection.effects);
  const missingDimensions = normalizeDimensions(collection.declared_missing_dimensions, "linear_lb1_v2_missing_dimensions_invalid");
  const errors = normalizeErrors(collection.errors);
  let normalizedSnapshot = null;
  if (collection.collection_status === "failed") {
    if (collection.snapshot !== null || errors.length === 0 || missingDimensions.length !== LINEAR_LB1_V2_DIMENSIONS.length) fail("linear_lb1_v2_failed_collection_invalid");
  } else {
    normalizedSnapshot = normalizeLinearLb1V2Snapshot(collection.snapshot);
    if (collection.collection_status === "complete" && (missingDimensions.length !== 0 || errors.length !== 0)) fail("linear_lb1_v2_complete_collection_incomplete");
    if (collection.collection_status === "partial" && missingDimensions.length === 0) fail("linear_lb1_v2_partial_collection_without_missing_dimension");
  }
  return collectionEnvelope(collection.collection_status, normalizedSnapshot, missingDimensions, deepFreeze(errors));
}

function emptyCounts() {
  return {
    teams: 0,
    projects: 0,
    assignees: 0,
    statuses: 0,
    issues: 0,
    relations: 0,
    descriptions: 0,
    comments: 0,
    state_history: 0,
    assignee_history: 0,
    project_history: 0,
    due_history: 0,
    waiting_info: 0,
    completion_records: 0,
    evidence_refs: 0,
  };
}

function snapshotCounts(snapshot) {
  if (snapshot === null) return emptyCounts();
  const counts = emptyCounts();
  counts.teams = snapshot.teams.length;
  counts.projects = snapshot.projects.length;
  counts.assignees = snapshot.assignees.length;
  counts.statuses = snapshot.statuses.length;
  counts.issues = snapshot.issues.length;
  for (const issue of snapshot.issues) {
    counts.relations += issue.relations.length;
    counts.descriptions += 1;
    counts.comments += issue.comments.length;
    counts.state_history += issue.state_history.length;
    counts.assignee_history += issue.assignee_history.length;
    counts.project_history += issue.project_history.length;
    counts.due_history += issue.due_history.length;
    counts.waiting_info += issue.waiting_info.length;
    counts.completion_records += issue.completion_records.length;
    counts.evidence_refs += issue.evidence_refs.length;
  }
  return counts;
}

function snapshotTimestampRange(snapshot) {
  if (snapshot === null) return { min: null, max: null };
  const values = [snapshot.collected_at, snapshot.cutoff.cutoff_at];
  for (const team of snapshot.teams) values.push(team.updated_at);
  for (const project of snapshot.projects) values.push(project.updated_at);
  for (const assignee of snapshot.assignees) values.push(assignee.updated_at);
  for (const issue of snapshot.issues) {
    values.push(issue.created_at, issue.updated_at, issue.description.updated_at);
    if (issue.started_at !== null) values.push(issue.started_at);
    if (issue.completed_at !== null) values.push(issue.completed_at);
    if (issue.canceled_at !== null) values.push(issue.canceled_at);
    if (issue.archived_at !== null) values.push(issue.archived_at);
    if (issue.due_at !== null) values.push(issue.due_at);
    for (const comment of issue.comments) {
      values.push(comment.created_at, comment.updated_at);
      if (comment.edited_at !== null) values.push(comment.edited_at);
      if (comment.archived_at !== null) values.push(comment.archived_at);
      if (comment.resolved_at !== null) values.push(comment.resolved_at);
    }
    for (const history of issue.state_history) values.push(history.occurred_at);
    for (const history of issue.assignee_history) values.push(history.occurred_at);
    for (const history of issue.project_history) values.push(history.occurred_at);
    for (const history of issue.due_history) values.push(history.occurred_at);
    for (const waiting of issue.waiting_info) {
      values.push(waiting.captured_at);
      if (waiting.due_at !== null) values.push(waiting.due_at);
      if (waiting.reply_due_at !== null) values.push(waiting.reply_due_at);
    }
    for (const comp of issue.completion_records) {
      values.push(comp.captured_at);
      if (comp.executor_succeeded_at !== null) values.push(comp.executor_succeeded_at);
      if (comp.business_completed_at !== null) values.push(comp.business_completed_at);
      if (comp.official_task_done_at !== null) values.push(comp.official_task_done_at);
    }
    for (const ev of issue.evidence_refs) values.push(ev.captured_at);
  }
  values.sort(codepointCompare);
  return { min: values[0], max: values[values.length - 1] };
}

function coverageForSnapshot(snapshot, missingDimensions) {
  const missingSet = new Set(missingDimensions);
  return {
    requested_dimensions: [...LINEAR_LB1_V2_DIMENSIONS],
    covered_dimensions: LINEAR_LB1_V2_DIMENSIONS.filter((dimension) => !missingSet.has(dimension)),
    missing_dimensions: [...missingDimensions],
    counts: snapshotCounts(snapshot),
    timestamp_range: snapshotTimestampRange(snapshot),
  };
}

function coverageFor(collection) {
  return coverageForSnapshot(collection.snapshot, collection.declared_missing_dimensions);
}

function validateManifestCoverage(coverage, snapshot, runStatus) {
  if (!isPlainRecord(coverage)) fail("linear_lb1_v2_manifest_coverage_invalid");
  const missingDimensions = normalizeDimensions(coverage.missing_dimensions, "linear_lb1_v2_manifest_coverage_invalid");
  const expected = coverageForSnapshot(snapshot, missingDimensions);
  if (stableJson(coverage) !== stableJson(expected)) fail("linear_lb1_v2_manifest_coverage_invalid");
  if (runStatus === "complete" && missingDimensions.length !== 0) fail("linear_lb1_v2_manifest_coverage_invalid");
  if (runStatus === "partial" && missingDimensions.length === 0) fail("linear_lb1_v2_manifest_coverage_invalid");
  if (runStatus === "failed" && missingDimensions.length !== LINEAR_LB1_V2_DIMENSIONS.length) fail("linear_lb1_v2_manifest_coverage_invalid");
  return expected;
}

function validateManifestErrorCodes(errorCodes, runStatus) {
  requireArray(errorCodes, "linear_lb1_v2_manifest_error_codes_invalid");
  const normalized = [];
  const seen = new Set();
  for (const errorCode of errorCodes) {
    requireErrorCode(errorCode, "linear_lb1_v2_manifest_error_codes_invalid");
    if (seen.has(errorCode)) fail("linear_lb1_v2_manifest_error_codes_invalid");
    seen.add(errorCode);
    normalized.push(errorCode);
  }
  normalized.sort(codepointCompare);
  if (stableJson(errorCodes) !== stableJson(normalized)) fail("linear_lb1_v2_manifest_error_codes_invalid");
  if (runStatus === "complete" && normalized.length !== 0) fail("linear_lb1_v2_manifest_error_codes_invalid");
  if (runStatus === "failed" && normalized.length === 0) fail("linear_lb1_v2_manifest_error_codes_invalid");
  return normalized;
}

export function buildImmutableLinearLb1BackupRunV2({ run_key: runKey, collection }) {
  requireId(runKey, "linear_lb1_v2_run_key_invalid");
  const normalizedCollection = normalizeFeatureOffCollection(collection);
  const coverage = coverageFor(normalizedCollection);
  const snapshotSha256 = normalizedCollection.snapshot === null ? null : sha256(normalizedCollection.snapshot);
  const manifestBody = {
    schema_version: LINEAR_LB1_V2_MANIFEST_SCHEMA_VERSION,
    run_key: runKey,
    source_kind: "public_synthetic_fixture",
    feature_state: "off",
    collection_status: normalizedCollection.collection_status,
    snapshot_sha256: snapshotSha256,
    coverage,
    error_codes: normalizedCollection.errors.map((error) => error.code),
  };
  const manifestSha256 = sha256(manifestBody);
  const manifest = deepFreeze({ ...manifestBody, manifest_sha256: manifestSha256 });
  let revision = null;
  if (normalizedCollection.snapshot !== null) {
    const revisionId = deterministicRevisionId({
      runKey,
      collectionStatus: normalizedCollection.collection_status,
      snapshotSha256,
      manifestSha256,
    });
    const revisionBody = {
      revision_id: revisionId,
      collection_status: normalizedCollection.collection_status,
      snapshot_sha256: snapshotSha256,
      manifest_sha256: manifestSha256,
    };
    revision = deepFreeze({
      ...revisionBody,
      revision_sha256: sha256(revisionBody),
      snapshot: normalizedCollection.snapshot,
    });
  }
  return deepFreeze({
    schema_version: LINEAR_LB1_V2_RUN_SCHEMA_VERSION,
    feature_state: "off",
    run_key: runKey,
    run_status: normalizedCollection.collection_status,
    revision,
    manifest,
    effects: LINEAR_LB1_ZERO_EFFECTS,
  });
}

function validateBackupRunV2(run) {
  exactKeys(run, ["schema_version", "feature_state", "run_key", "run_status", "revision", "manifest", "effects"], "linear_lb1_v2_run_shape_invalid");
  if (run.schema_version !== LINEAR_LB1_V2_RUN_SCHEMA_VERSION || run.feature_state !== "off" || !COLLECTION_STATUSES.has(run.run_status)) {
    fail("linear_lb1_v2_run_schema_invalid");
  }
  requireId(run.run_key, "linear_lb1_v2_run_key_invalid");
  validateZeroEffects(run.effects);
  exactKeys(run.manifest, [
    "schema_version", "run_key", "source_kind", "feature_state", "collection_status",
    "snapshot_sha256", "coverage", "error_codes", "manifest_sha256",
  ], "linear_lb1_v2_manifest_shape_invalid");
  if (run.manifest.schema_version !== LINEAR_LB1_V2_MANIFEST_SCHEMA_VERSION || run.manifest.run_key !== run.run_key
      || run.manifest.source_kind !== "public_synthetic_fixture" || run.manifest.feature_state !== "off"
      || run.manifest.collection_status !== run.run_status) {
    fail("linear_lb1_v2_manifest_identity_invalid");
  }
  if ((run.manifest.snapshot_sha256 !== null && !SHA256.test(run.manifest.snapshot_sha256)) || !SHA256.test(run.manifest.manifest_sha256)) {
    fail("linear_lb1_v2_manifest_hash_invalid");
  }
  const manifestBody = {
    schema_version: run.manifest.schema_version,
    run_key: run.manifest.run_key,
    source_kind: run.manifest.source_kind,
    feature_state: run.manifest.feature_state,
    collection_status: run.manifest.collection_status,
    snapshot_sha256: run.manifest.snapshot_sha256,
    coverage: run.manifest.coverage,
    error_codes: run.manifest.error_codes,
  };
  validateManifestErrorCodes(run.manifest.error_codes, run.run_status);
  if (sha256(manifestBody) !== run.manifest.manifest_sha256) fail("linear_lb1_v2_manifest_digest_invalid");

  if (run.revision === null) {
    validateManifestCoverage(run.manifest.coverage, null, run.run_status);
    if (run.run_status !== "failed" || run.manifest.snapshot_sha256 !== null) fail("linear_lb1_v2_failed_run_revision_invalid");
    return run;
  }
  if (run.run_status === "failed") fail("linear_lb1_v2_failed_run_revision_invalid");
  exactKeys(run.revision, ["revision_id", "collection_status", "snapshot_sha256", "manifest_sha256", "revision_sha256", "snapshot"], "linear_lb1_v2_revision_shape_invalid");
  requireId(run.revision.revision_id, "linear_lb1_v2_revision_id_invalid");
  requireSha256(run.revision.snapshot_sha256, "linear_lb1_v2_revision_hash_invalid");
  requireSha256(run.revision.manifest_sha256, "linear_lb1_v2_revision_hash_invalid");
  requireSha256(run.revision.revision_sha256, "linear_lb1_v2_revision_hash_invalid");

  if (run.revision.collection_status !== run.run_status || run.revision.collection_status !== run.manifest.collection_status) {
    fail("linear_lb1_v2_revision_status_invalid");
  }
  if (run.revision.snapshot_sha256 !== run.manifest.snapshot_sha256 || run.revision.manifest_sha256 !== run.manifest.manifest_sha256) {
    fail("linear_lb1_v2_revision_identity_invalid");
  }
  if (run.revision.revision_id !== deterministicRevisionId({
    runKey: run.run_key,
    collectionStatus: run.revision.collection_status,
    snapshotSha256: run.revision.snapshot_sha256,
    manifestSha256: run.revision.manifest_sha256,
  })) fail("linear_lb1_v2_revision_id_invalid");

  const normalizedSnapshot = normalizeLinearLb1V2Snapshot(run.revision.snapshot);
  if (sha256(normalizedSnapshot) !== run.revision.snapshot_sha256) fail("linear_lb1_v2_snapshot_digest_invalid");
  validateManifestCoverage(run.manifest.coverage, normalizedSnapshot, run.run_status);

  const revisionBody = {
    revision_id: run.revision.revision_id,
    collection_status: run.revision.collection_status,
    snapshot_sha256: run.revision.snapshot_sha256,
    manifest_sha256: run.revision.manifest_sha256,
  };
  if (sha256(revisionBody) !== run.revision.revision_sha256) fail("linear_lb1_v2_revision_digest_invalid");
  return run;
}

export function registerImmutableLinearLb1BackupRunV2(existingRuns, candidateRun) {
  if (!Array.isArray(existingRuns)) fail("linear_lb1_v2_registry_invalid");
  const existingRunKeys = new Set();
  for (const existing of existingRuns) {
    validateBackupRunV2(existing);
    if (existingRunKeys.has(existing.run_key)) fail("linear_lb1_v2_registry_duplicate_run_key");
    existingRunKeys.add(existing.run_key);
  }
  validateBackupRunV2(candidateRun);
  const existing = existingRuns.find((run) => run.run_key === candidateRun.run_key);
  if (existing) {
    const outcome = existing.manifest.manifest_sha256 === candidateRun.manifest.manifest_sha256 ? "duplicate" : "conflict";
    return deepFreeze({
      outcome,
      run: existing,
      runs: [...existingRuns],
      effects: LINEAR_LB1_ZERO_EFFECTS,
    });
  }
  return deepFreeze({
    outcome: "created",
    run: candidateRun,
    runs: [...existingRuns, candidateRun],
    effects: LINEAR_LB1_ZERO_EFFECTS,
  });
}

function projectionV2(snapshot, dimension) {
  switch (dimension) {
    case "issue":
      return snapshot.issues.map((i) => ({
        issue_id: i.issue_id,
        human_id: i.human_id,
        title: i.title,
        priority: i.priority,
        team_id: i.team_id,
        project_id: i.project_id,
        assignee_id: i.assignee_id,
        status_id: i.status_id,
        parent_issue_id: i.parent_issue_id,
        tombstone: i.tombstone,
      }));
    case "team":
      return snapshot.teams;
    case "project":
      return snapshot.projects;
    case "assignee":
      return snapshot.assignees;
    case "status":
      return snapshot.statuses;
    case "timestamps":
      return {
        collected_at: snapshot.collected_at,
        cutoff_at: snapshot.cutoff.cutoff_at,
        teams: snapshot.teams.map((t) => ({ team_id: t.team_id, updated_at: t.updated_at })),
        projects: snapshot.projects.map((p) => ({ project_id: p.project_id, updated_at: p.updated_at })),
        assignees: snapshot.assignees.map((a) => ({ assignee_id: a.assignee_id, updated_at: a.updated_at })),
        issues: snapshot.issues.map((i) => ({
          issue_id: i.issue_id,
          created_at: i.created_at,
          updated_at: i.updated_at,
          started_at: i.started_at,
          completed_at: i.completed_at,
          canceled_at: i.canceled_at,
          archived_at: i.archived_at,
          desc_updated_at: i.description.updated_at,
          comments: i.comments.map((c) => ({
            comment_id: c.comment_id,
            created_at: c.created_at,
            edited_at: c.edited_at,
            updated_at: c.updated_at,
            archived_at: c.archived_at,
            resolved_at: c.resolved_at,
          })),
        })),
      };
    case "due":
      return snapshot.issues.map((i) => ({
        issue_id: i.issue_id,
        due_at: i.due_at,
        due_history: i.due_history,
      }));
    case "relations":
      return snapshot.issues.map((i) => ({
        issue_id: i.issue_id,
        relations: i.relations,
      }));
    case "description":
      return snapshot.issues.map((i) => ({
        issue_id: i.issue_id,
        description: i.description,
      }));
    case "comments":
      return snapshot.issues.map((i) => ({
        issue_id: i.issue_id,
        comments: i.comments,
      }));
    case "state_history":
      return snapshot.issues.map((i) => ({
        issue_id: i.issue_id,
        state_history: i.state_history,
      }));
    case "assignee_history":
      return snapshot.issues.map((i) => ({
        issue_id: i.issue_id,
        assignee_history: i.assignee_history,
      }));
    case "project_history":
      return snapshot.issues.map((i) => ({
        issue_id: i.issue_id,
        project_history: i.project_history,
      }));
    case "due_history":
      return snapshot.issues.map((i) => ({
        issue_id: i.issue_id,
        due_history: i.due_history,
      }));
    case "waiting_info":
      return snapshot.issues.map((i) => ({
        issue_id: i.issue_id,
        waiting_info: i.waiting_info,
      }));
    case "completion_record":
      return snapshot.issues.map((i) => ({
        issue_id: i.issue_id,
        completion_records: i.completion_records,
      }));
    case "evidence_refs":
      return snapshot.issues.map((i) => ({
        issue_id: i.issue_id,
        evidence_refs: i.evidence_refs,
      }));
    case "cutoff_completeness":
      return snapshot.cutoff;
    default:
      fail("linear_lb1_v2_projection_dimension_invalid");
  }
}

function normalizeArtifactKinds(artifactKinds) {
  requireArray(artifactKinds, "linear_lb1_v2_artifact_kinds_invalid");
  const values = new Set();
  for (const artifactKind of artifactKinds) {
    requireId(artifactKind, "linear_lb1_v2_artifact_kind_invalid");
    values.add(artifactKind);
  }
  return [...values].sort(codepointCompare);
}

function orderedMissingDimensions(missing) {
  return [
    ...LINEAR_LB1_V2_DIMENSIONS.filter((dimension) => missing.has(dimension)),
    ...[...missing].filter((dimension) => !LINEAR_LB1_V2_DIMENSIONS.includes(dimension)).sort(codepointCompare),
  ];
}

export function checkLinearLb1RestoreV2(backupRun, restoredSnapshot, options = {}) {
  validateBackupRunV2(backupRun);
  const artifactKinds = normalizeArtifactKinds(options.artifact_kinds === undefined ? ["immutable_revision"] : options.artifact_kinds);
  const restored = restoredSnapshot === null ? null : normalizeLinearLb1V2Snapshot(restoredSnapshot);
  const missing = new Set(backupRun.manifest.coverage.missing_dimensions);
  const reconstructable = [];
  if (backupRun.revision === null || restored === null) {
    for (const dimension of backupRun.manifest.coverage.covered_dimensions) missing.add(dimension);
  } else {
    for (const dimension of backupRun.manifest.coverage.covered_dimensions) {
      if (stableJson(projectionV2(backupRun.revision.snapshot, dimension)) === stableJson(projectionV2(restored, dimension))) {
        reconstructable.push(dimension);
      } else {
        missing.add(dimension);
      }
    }
  }
  const hasImmutableRevision = artifactKinds.includes("immutable_revision");
  const tabularOnly = artifactKinds.length > 0 && artifactKinds.every((artifactKind) => TABULAR_ARTIFACT_KINDS.has(artifactKind));
  if (!hasImmutableRevision) missing.add("immutable_revision");
  if (tabularOnly) missing.add("tabular_export_only");
  const missingDimensions = orderedMissingDimensions(missing);
  return deepFreeze({
    schema_version: LINEAR_LB1_V2_RESTORE_CHECK_SCHEMA_VERSION,
    run_key: backupRun.run_key,
    revision_id: backupRun.revision === null ? null : backupRun.revision.revision_id,
    artifact_kinds: artifactKinds,
    reconstructable_dimensions: reconstructable,
    missing_dimensions: missingDimensions,
    complete: backupRun.run_status === "complete"
      && hasImmutableRevision
      && reconstructable.length === LINEAR_LB1_V2_DIMENSIONS.length
      && missingDimensions.length === 0,
    human_accepted: false,
    effects: LINEAR_LB1_ZERO_EFFECTS,
  });
}

export function serializeBackupRunV2(backupRun) {
  validateBackupRunV2(backupRun);
  return Buffer.from(stableJson(backupRun), "utf8");
}

export function deserializeBackupRunV2(bytes) {
  try {
    const raw = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes);
    const parsed = JSON.parse(raw);
    return validateBackupRunV2(parsed);
  } catch (error) {
    if (error instanceof LinearLb1V2Error) throw error;
    fail("linear_lb1_v2_deserialize_invalid");
  }
}

export const HELD_LINEAR_LB1_V2_PROVIDER_ADAPTER = Object.freeze({
  adapter_kind: "linear_provider",
  feature_state: "off",
  authority_state: "hold",
  adapter_ref: makePinnedRef("held_linear_lb1_v2_provider_ref"),
  collect_current_snapshot() {
    fail("linear_lb1_v2_provider_hold");
  },
});

export const HELD_LINEAR_LB1_V2_STORAGE_ADAPTER = Object.freeze({
  adapter_kind: "backup_storage",
  feature_state: "off",
  authority_state: "hold",
  adapter_ref: makePinnedRef("held_linear_lb1_v2_storage_ref"),
  write_revision() {
    fail("linear_lb1_v2_storage_hold");
  },
});

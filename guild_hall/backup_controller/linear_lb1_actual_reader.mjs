import { createHash } from "node:crypto";
import { types } from "node:util";

import {
  LINEAR_LB1_V2_DIMENSIONS,
  LINEAR_LB1_V2_SNAPSHOT_SCHEMA_VERSION,
  collectActualLinearLb1V2Snapshot,
  createFailedActualLinearLb1V2Collection,
} from "./linear_lb1_v2.mjs";
import { snapshotPlainData } from "./linear_lb1_owner_gate_v2.mjs";

export const LINEAR_LB1_ACTUAL_READER_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.actual_reader.v0";
export const LINEAR_LB1_ACTUAL_PAGE_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.actual_provider_page.v0";

export const LINEAR_LB1_ACTUAL_DIMENSION_MATRIX = Object.freeze({
  issue: "partial",
  team: "supported",
  project: "supported",
  assignee: "supported",
  status: "supported",
  timestamps: "supported",
  due: "supported",
  relations: "supported",
  description: "partial",
  comments: "partial",
  state_history: "supported",
  assignee_history: "supported",
  project_history: "supported",
  due_history: "supported",
  waiting_info: "missing",
  completion_record: "missing",
  evidence_refs: "partial",
  cutoff_completeness: "partial",
});

export class LinearLb1ActualReaderError extends Error {
  constructor(code) {
    super(code);
    this.name = "LinearLb1ActualReaderError";
    this.code = code;
  }
}

const CONFIG_FIELDS = Object.freeze([
  "adapter_ref", "approved_attachment_ids", "attachment_policy_ref", "clock", "credential_ref", "feature_state",
  "readPage", "resource_limits", "workspace_ref",
]);
const REF_FIELDS = Object.freeze(["content_hash_alg", "content_id", "entity_id", "revision_id"]);
const SCOPE_FIELDS = Object.freeze([
  "credential_ref", "credential_scope", "dimensions", "project_ids", "provider", "scope_mode", "team_ids", "workspace_ref",
]);
const LIMIT_FIELDS = Object.freeze(["max_issues", "max_pages", "max_runtime_ms", "max_total_bytes"]);
const PAGE_FIELDS = Object.freeze([
  "catalog", "coverage", "cursor", "cutoff_at", "has_more", "issues", "next_cursor", "schema_version", "workspace_id",
]);
const CATALOG_FIELDS = Object.freeze(["labels", "projects", "statuses", "teams", "users"]);
const TEAM_FIELDS = Object.freeze(["id", "key", "name", "updated_at"]);
const PROJECT_FIELDS = Object.freeze(["id", "name", "team_id", "updated_at"]);
const USER_FIELDS = Object.freeze(["email", "id", "name", "updated_at"]);
const STATUS_FIELDS = Object.freeze(["id", "name", "team_id", "type"]);
const LABEL_FIELDS = Object.freeze(["id", "name", "updated_at"]);
const RELATION_FIELDS = Object.freeze(["id", "related_issue_id", "type"]);
const DESCRIPTION_FIELDS = Object.freeze(["author_id", "body", "content_sha256", "deletion", "revision_id", "updated_at"]);
const COMMENT_FIELDS = Object.freeze([
  "archived_at", "author_id", "body", "content_sha256", "created_at", "deletion", "edited_at", "id",
  "parent_id", "resolved_at", "revision_id", "updated_at",
]);
const STATE_HISTORY_FIELDS = Object.freeze(["actor_id", "from_status_id", "id", "occurred_at", "to_status_id"]);
const ASSIGNEE_HISTORY_FIELDS = Object.freeze(["actor_id", "from_assignee_id", "id", "occurred_at", "to_assignee_id"]);
const PROJECT_HISTORY_FIELDS = Object.freeze(["actor_id", "from_project_id", "id", "occurred_at", "to_project_id"]);
const DUE_HISTORY_FIELDS = Object.freeze(["actor_id", "from_due_at", "id", "occurred_at", "to_due_at"]);
const WAITING_INFO_FIELDS = Object.freeze([
  "captured_at", "due_at", "manager_decision_required", "next_action_owner_id", "reason", "ref_id",
  "reply_due_at", "required_input",
]);
const COMPLETION_RECORD_FIELDS = Object.freeze([
  "business_completed_at", "captured_at", "completion_criteria_met", "evidence_refs", "executor_succeeded_at",
  "official_task_done_at", "ref_id", "result",
]);
const EVIDENCE_REF_FIELDS = Object.freeze([
  "availability", "captured_at", "content_sha256", "kind", "mime_type", "ref_id", "size", "title", "uri",
]);
const ATTACHMENT_FIELDS = Object.freeze([
  "availability", "content_sha256", "created_at", "id", "mime_type", "size", "source_url", "title", "updated_at",
]);
const COVERAGE_FIELDS = Object.freeze([
  "approved_attachments", "assignee_history", "comment_revisions", "completion_record", "deletion_tombstones",
  "description_revisions", "due_history", "project_history", "state_history", "waiting_info",
]);
const RAW_ISSUE_FIELDS = Object.freeze([
  "archived_at", "assignee_history", "assignee_id", "attachments", "canceled_at", "comments", "completed_at",
  "completion_records", "created_at", "deletion", "description", "due_at", "due_history", "evidence_refs", "id",
  "identifier", "label_ids", "parent_id", "priority", "project_history", "project_id", "relations", "started_at",
  "state_history", "status_id", "team_id", "title", "updated_at", "waiting_info",
]);
const HASH_REF = /^sha256:[a-f0-9]{64}$/u;
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const DATA_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

function codepointCompare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code) { throw new LinearLb1ActualReaderError(code); }
function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function exactKeys(value, expected) {
  if (!isPlainRecord(value)) return false;
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) return false;
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) return false;
  }
  actual.sort(codepointCompare);
  const wanted = [...expected].sort(codepointCompare);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}
function snapshotProviderData(root, limits) {
  const seen = new WeakSet();
  const maxArray = Math.min(100_000, Math.max(10_000, limits.max_issues));
  const maxValues = Math.min(5_000_000, Math.max(20_000, Math.ceil(limits.max_total_bytes / 8)));
  let values = 0;
  function walk(value, depth) {
    values += 1;
    if (values > maxValues || depth > 24) fail("provider_page_shape_invalid");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.length > 4096 || value.normalize("NFC") !== value || DATA_CONTROL.test(value)) fail("provider_page_shape_invalid");
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) fail("provider_page_shape_invalid");
      return value;
    }
    if (typeof value !== "object" || types.isProxy(value) || seen.has(value)) fail("provider_page_shape_invalid");
    seen.add(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > maxArray) fail("provider_page_shape_invalid");
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys.some((key, index) => (
        index < value.length ? key !== String(index) : key !== "length"
      ))) fail("provider_page_shape_invalid");
      return value.map((entry) => walk(entry, depth + 1));
    }
    if (!isPlainRecord(value)) fail("provider_page_shape_invalid");
    const keys = Reflect.ownKeys(value);
    if (keys.length > 64 || keys.some((key) => typeof key !== "string")) fail("provider_page_shape_invalid");
    const output = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) {
        fail("provider_page_shape_invalid");
      }
      output[key] = walk(descriptor.value, depth + 1);
    }
    return output;
  }
  return walk(root, 0);
}
function exactRef(value) {
  return exactKeys(value, REF_FIELDS) && UUID_V4.test(value.entity_id) && UUID_V4.test(value.revision_id)
    && HASH_REF.test(value.content_id) && value.content_hash_alg === "sha256";
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort(codepointCompare).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function sha256(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function safeId(value) { return typeof value === "string" && SAFE_ID.test(value) && !CONTROL.test(value); }
function strictIso(value) {
  return typeof value === "string" && ISO_UTC.test(value) && Number.isSafeInteger(Date.parse(value))
    && new Date(Date.parse(value)).toISOString() === value;
}
function sameRef(left, right) { return exactRef(left) && exactRef(right) && stableJson(left) === stableJson(right); }
function frozenClone(value) {
  const copy = snapshotPlainData(value);
  if (copy === null) return null;
  const freeze = (entry) => {
    if (entry !== null && typeof entry === "object") {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
}
function clockSnapshot(clock) {
  try {
    const nowIso = clock.nowIso();
    const nowMs = clock.nowMs();
    return strictIso(nowIso) && Number.isSafeInteger(nowMs) && Date.parse(nowIso) === nowMs ? { nowIso, nowMs } : null;
  } catch { return null; }
}
function exactSafeIds(value) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys.some((key, index) => (
    index < value.length ? key !== String(index) : key !== "length"
  ))) return null;
  const copy = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) return null;
    copy.push(descriptor.value);
  }
  if (copy.some((id) => !safeId(id)) || new Set(copy).size !== copy.length) return null;
  copy.sort(codepointCompare);
  return Object.freeze(copy);
}

export function linearLb1AttachmentAllowlistContentId(value) {
  const ids = exactSafeIds(value);
  if (!ids) fail("linear_lb1_actual_reader_attachment_policy_invalid");
  return `sha256:${sha256(stableJson({
    schema_version: "soulforge.backup_controller.linear_lb1.attachment_allowlist.v0",
    approved_attachment_ids: ids,
  }))}`;
}
function withinBudget(clock, startMs, maxRuntimeMs) {
  try {
    const elapsed = clock.nowMs() - startMs;
    return Number.isSafeInteger(elapsed) && elapsed >= 0 && elapsed <= maxRuntimeMs;
  } catch { return false; }
}

function validateScope(value, workspaceRef, credentialRef) {
  const scope = snapshotPlainData(value);
  if (!scope || !exactKeys(scope, SCOPE_FIELDS) || scope.provider !== "linear"
      || scope.scope_mode !== "entire_workspace" || scope.team_ids?.length !== 0 || scope.project_ids?.length !== 0
      || scope.credential_scope !== "read_only" || !sameRef(scope.workspace_ref, workspaceRef)
      || !sameRef(scope.credential_ref, credentialRef) || !Array.isArray(scope.dimensions)
      || scope.dimensions.length !== LINEAR_LB1_V2_DIMENSIONS.length
      || !scope.dimensions.every((dimension, index) => dimension === LINEAR_LB1_V2_DIMENSIONS[index])) return null;
  return frozenClone(scope);
}

function validateLimits(value) {
  const limits = snapshotPlainData(value);
  if (!limits || !exactKeys(limits, LIMIT_FIELDS)
      || !Number.isSafeInteger(limits.max_pages) || limits.max_pages < 1 || limits.max_pages > 10_000
      || !Number.isSafeInteger(limits.max_issues) || limits.max_issues < 1 || limits.max_issues > 100_000
      || !Number.isSafeInteger(limits.max_total_bytes) || limits.max_total_bytes < 1 || limits.max_total_bytes > 1_073_741_824
      || !Number.isSafeInteger(limits.max_runtime_ms) || limits.max_runtime_ms < 1_000 || limits.max_runtime_ms > 3_600_000) {
    fail("linear_lb1_actual_resource_limits_invalid");
  }
  return Object.freeze(limits);
}

const COVERAGE_VALUES = Object.freeze({
  deletion_tombstones: new Set(["complete", "partial", "missing"]),
  description_revisions: new Set(["complete", "current_only", "missing"]),
  comment_revisions: new Set(["complete", "current_only", "missing"]),
  state_history: new Set(["complete", "partial", "missing"]),
  assignee_history: new Set(["complete", "partial", "missing"]),
  project_history: new Set(["complete", "partial", "missing"]),
  due_history: new Set(["complete", "partial", "missing"]),
  waiting_info: new Set(["complete", "missing"]),
  completion_record: new Set(["complete", "missing"]),
  approved_attachments: new Set(["bytes_complete", "metadata_only", "missing"]),
});
const COVERAGE_RANK = Object.freeze({ complete: 0, bytes_complete: 0, partial: 1, current_only: 1, metadata_only: 1, missing: 2 });
function validateCoverage(value) {
  const coverage = snapshotPlainData(value);
  if (!coverage || !exactKeys(coverage, COVERAGE_FIELDS)) return null;
  for (const field of COVERAGE_FIELDS) if (!COVERAGE_VALUES[field].has(coverage[field])) return null;
  return coverage;
}
function mergeCoverage(current, next) {
  if (current === null) return { ...next };
  const output = {};
  for (const field of COVERAGE_FIELDS) output[field] = COVERAGE_RANK[next[field]] > COVERAGE_RANK[current[field]] ? next[field] : current[field];
  return output;
}
function missingDimensions(coverage) {
  const missing = new Set();
  if (coverage.deletion_tombstones !== "complete") missing.add("issue");
  if (coverage.description_revisions !== "complete") missing.add("description");
  if (coverage.comment_revisions !== "complete") missing.add("comments");
  if (coverage.state_history !== "complete") missing.add("state_history");
  if (coverage.assignee_history !== "complete") missing.add("assignee_history");
  if (coverage.project_history !== "complete") missing.add("project_history");
  if (coverage.due_history !== "complete") missing.add("due_history");
  if (coverage.waiting_info !== "complete") missing.add("waiting_info");
  if (coverage.completion_record !== "complete") missing.add("completion_record");
  if (coverage.approved_attachments !== "bytes_complete") missing.add("evidence_refs");
  for (const [dimension, support] of Object.entries(LINEAR_LB1_ACTUAL_DIMENSION_MATRIX)) {
    if (support !== "supported") missing.add(dimension);
  }
  return LINEAR_LB1_V2_DIMENSIONS.filter((dimension) => missing.has(dimension));
}

function mapDeletion(value) {
  if (value === null) return null;
  if (!isPlainRecord(value) || !exactKeys(value, ["actor_id", "deleted_at"])) fail("provider_page_shape_invalid");
  return { deleted_at: value.deleted_at, actor_id: value.actor_id };
}
function exactRecord(value, fields) {
  if (!isPlainRecord(value) || !exactKeys(value, fields)) fail("provider_page_shape_invalid");
  return value;
}
function exactRows(value, fields) {
  if (!Array.isArray(value)) fail("provider_page_shape_invalid");
  return value.map((row) => exactRecord(row, fields));
}
function mapCatalog(value) {
  if (!isPlainRecord(value) || !exactKeys(value, CATALOG_FIELDS)) fail("provider_page_shape_invalid");
  return {
    teams: exactRows(value.teams, TEAM_FIELDS).map((row) => ({ team_id: row.id, name: row.name, key: row.key, updated_at: row.updated_at })),
    projects: exactRows(value.projects, PROJECT_FIELDS).map((row) => ({ project_id: row.id, name: row.name, team_id: row.team_id, updated_at: row.updated_at })),
    assignees: exactRows(value.users, USER_FIELDS).map((row) => ({ assignee_id: row.id, name: row.name, email: row.email, updated_at: row.updated_at })),
    statuses: exactRows(value.statuses, STATUS_FIELDS).map((row) => ({ status_id: row.id, name: row.name, type: row.type, team_id: row.team_id })),
    labels: exactRows(value.labels, LABEL_FIELDS).map((row) => ({ label_id: row.id, name: row.name, updated_at: row.updated_at })),
  };
}
function mapIssue(raw, attachmentPolicy) {
  if (!isPlainRecord(raw) || !exactKeys(raw, RAW_ISSUE_FIELDS)) fail("provider_page_shape_invalid");
  const description = exactRecord(raw.description, DESCRIPTION_FIELDS);
  const approvedAttachments = exactRows(raw.attachments, ATTACHMENT_FIELDS)
    .filter((attachment) => attachmentPolicy.approvedIds.has(attachment.id))
    .map((attachment) => ({
    attachment_id: attachment.id,
    title: attachment.title,
    source_url: attachment.source_url,
    mime_type: attachment.mime_type,
    size: attachment.size,
    content_sha256: null,
    created_at: attachment.created_at,
    updated_at: attachment.updated_at,
    availability: attachment.availability,
    approval_ref: attachmentPolicy.policyRef.entity_id,
    bytes_captured: false,
  }));
  const comments = exactRows(raw.comments, COMMENT_FIELDS);
  const stateHistory = exactRows(raw.state_history, STATE_HISTORY_FIELDS);
  const assigneeHistory = exactRows(raw.assignee_history, ASSIGNEE_HISTORY_FIELDS);
  const projectHistory = exactRows(raw.project_history, PROJECT_HISTORY_FIELDS);
  const dueHistory = exactRows(raw.due_history, DUE_HISTORY_FIELDS);
  const waitingInfo = exactRows(raw.waiting_info, WAITING_INFO_FIELDS);
  const completionRecords = exactRows(raw.completion_records, COMPLETION_RECORD_FIELDS);
  const evidenceRefs = exactRows(raw.evidence_refs, EVIDENCE_REF_FIELDS);
  return {
    issue_id: raw.id,
    human_id: raw.identifier,
    title: raw.title,
    priority: raw.priority,
    team_id: raw.team_id,
    project_id: raw.project_id,
    assignee_id: raw.assignee_id,
    status_id: raw.status_id,
    parent_issue_id: raw.parent_id,
    label_ids: raw.label_ids,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    started_at: raw.started_at,
    completed_at: raw.completed_at,
    canceled_at: raw.canceled_at,
    archived_at: raw.archived_at,
    due_at: raw.due_at,
    tombstone: mapDeletion(raw.deletion),
    relations: exactRows(raw.relations, RELATION_FIELDS).map((row) => ({ relation_id: row.id, relation_type: row.type, target_issue_id: row.related_issue_id })),
    description: {
      revision_id: description.revision_id,
      body: description.body,
      content_sha256: description.content_sha256,
      updated_at: description.updated_at,
      author_id: description.author_id,
      tombstone: mapDeletion(description.deletion),
    },
    comments: comments.map((row) => ({
      comment_id: row.id,
      revision_id: row.revision_id,
      body: row.body,
      content_sha256: row.content_sha256,
      author_id: row.author_id,
      parent_comment_id: row.parent_id,
      created_at: row.created_at,
      edited_at: row.edited_at,
      updated_at: row.updated_at,
      archived_at: row.archived_at,
      resolved_at: row.resolved_at,
      tombstone: mapDeletion(row.deletion),
    })),
    state_history: stateHistory.map((row) => ({ history_id: row.id, from_status_id: row.from_status_id, to_status_id: row.to_status_id, actor_id: row.actor_id, occurred_at: row.occurred_at })),
    assignee_history: assigneeHistory.map((row) => ({ history_id: row.id, from_assignee_id: row.from_assignee_id, to_assignee_id: row.to_assignee_id, actor_id: row.actor_id, occurred_at: row.occurred_at })),
    project_history: projectHistory.map((row) => ({ history_id: row.id, from_project_id: row.from_project_id, to_project_id: row.to_project_id, actor_id: row.actor_id, occurred_at: row.occurred_at })),
    due_history: dueHistory.map((row) => ({ history_id: row.id, from_due_at: row.from_due_at, to_due_at: row.to_due_at, actor_id: row.actor_id, occurred_at: row.occurred_at })),
    waiting_info: waitingInfo,
    completion_records: completionRecords,
    evidence_refs: evidenceRefs,
    attachments: approvedAttachments,
  };
}

export const HELD_LINEAR_LB1_ACTUAL_READER = Object.freeze({
  adapter_kind: "linear_lb1_actual_reader",
  feature_state: "off",
  authority_state: "hold",
  collectSnapshot() { throw new LinearLb1ActualReaderError("linear_lb1_actual_reader_hold"); },
  getEffects() { return Object.freeze({ provider_calls: 0, network_calls: 0, linear_mutations: 0, mutation_evidence: "attested_feature_off" }); },
});

export function createLinearLb1ActualReader(config = {}) {
  if (!isPlainRecord(config) || !exactKeys(config, CONFIG_FIELDS)) fail("linear_lb1_actual_reader_config_invalid");
  if (config.feature_state !== "actual_read_only") fail("linear_lb1_actual_reader_feature_off");
  if (!exactRef(config.adapter_ref) || !exactRef(config.workspace_ref) || !exactRef(config.credential_ref)) {
    fail("linear_lb1_actual_reader_binding_invalid");
  }
  if (!exactRef(config.attachment_policy_ref)) fail("linear_lb1_actual_reader_attachment_policy_invalid");
  const approvedAttachmentIds = exactSafeIds(config.approved_attachment_ids);
  if (!approvedAttachmentIds) fail("linear_lb1_actual_reader_attachment_policy_invalid");
  const attachmentAllowlistSha256 = linearLb1AttachmentAllowlistContentId(approvedAttachmentIds);
  if (config.attachment_policy_ref.content_id !== attachmentAllowlistSha256) {
    fail("linear_lb1_actual_reader_attachment_policy_invalid");
  }
  if (typeof config.readPage !== "function" || !config.clock || typeof config.clock.nowIso !== "function" || typeof config.clock.nowMs !== "function") {
    fail("linear_lb1_actual_reader_runtime_invalid");
  }
  const adapterRef = frozenClone(config.adapter_ref);
  const workspaceRef = frozenClone(config.workspace_ref);
  const credentialRef = frozenClone(config.credential_ref);
  const attachmentPolicy = Object.freeze({
    policyRef: frozenClone(config.attachment_policy_ref),
    approvedIds: new Set(approvedAttachmentIds),
  });
  const limits = validateLimits(config.resource_limits);
  let providerCalls = 0;
  function failureCollector({
    pageCount = 0, issueCount = 0, ledger = [], cutoffAt = null, terminalCursor = null, providerCallCount = 0,
  } = {}) {
    return {
      kind: "linear_read_only_provider",
      feature_state: "actual_read_only",
      adapter_ref: adapterRef,
      attachment_policy_ref: attachmentPolicy.policyRef,
      attachment_allowlist_sha256: attachmentAllowlistSha256,
      provider_calls: providerCallCount,
      network_calls: providerCallCount,
      storage_writes: 0,
      cursor_ledger_sha256: ledger.length === 0 ? null : sha256(stableJson(ledger)),
      cutoff_at: cutoffAt,
      page_count: pageCount,
      observed_issue_count: issueCount,
      source_count: null,
      count_reconciled: false,
      terminal_cursor: terminalCursor,
      terminal_page_observed: false,
    };
  }
  function failedCollection(code, evidence = {}) {
    return createFailedActualLinearLb1V2Collection({ errors: [{ code }], collector: failureCollector(evidence) });
  }
  return Object.freeze({
    schema_version: LINEAR_LB1_ACTUAL_READER_SCHEMA_VERSION,
    adapter_kind: "linear_lb1_actual_reader",
    feature_state: "actual_read_only",
    authority_state: "read_only_ref_bound",
    adapter_ref: adapterRef,
    attachment_policy_ref: attachmentPolicy.policyRef,
    attachment_allowlist_sha256: attachmentAllowlistSha256,
    async collectSnapshot(sourceScope) {
      const callProviderStart = providerCalls;
      const scope = validateScope(sourceScope, workspaceRef, credentialRef);
      if (!scope) return failedCollection("read_failed");
      const start = clockSnapshot(config.clock);
      if (!start) return failedCollection("read_failed");
      const issues = [];
      const seenCursors = new Set();
      const cursorLedger = [];
      let cursor = null;
      let catalog = null;
      let mergedCoverage = null;
      let cutoffAt = null;
      let pageCount = 0;
      let totalBytes = 0;
      const evidence = () => ({
        pageCount,
        issueCount: issues.length,
        ledger: cursorLedger,
        cutoffAt,
        terminalCursor: cursor,
        providerCallCount: providerCalls - callProviderStart,
      });
      try {
        while (true) {
          if (pageCount >= limits.max_pages || !withinBudget(config.clock, start.nowMs, limits.max_runtime_ms)) {
            return failedCollection("provider_timeout", evidence());
          }
          providerCalls += 1;
          const raw = await config.readPage(Object.freeze({ cursor, scope: frozenClone(scope) }));
          const page = snapshotProviderData(raw, limits);
          if (!page || !exactKeys(page, PAGE_FIELDS) || page.schema_version !== LINEAR_LB1_ACTUAL_PAGE_SCHEMA_VERSION
              || page.workspace_id !== workspaceRef.entity_id || page.cursor !== cursor || typeof page.has_more !== "boolean"
              || !(page.next_cursor === null || safeId(page.next_cursor)) || !strictIso(page.cutoff_at)
              || !Array.isArray(page.issues) || !page.issues.every((issue) => isPlainRecord(issue))) {
            return failedCollection("provider_page_shape_invalid", evidence());
          }
          const pageJson = stableJson(page);
          totalBytes += Buffer.byteLength(pageJson, "utf8");
          if (totalBytes > limits.max_total_bytes) return failedCollection("resource_limit_exceeded", evidence());
          if (cutoffAt === null) cutoffAt = page.cutoff_at;
          else if (cutoffAt !== page.cutoff_at) return failedCollection("provider_page_invalid", evidence());
          const pageCoverage = validateCoverage(page.coverage);
          if (!pageCoverage) return failedCollection("provider_page_shape_invalid", evidence());
          mergedCoverage = mergeCoverage(mergedCoverage, pageCoverage);
          if (page.catalog !== null) {
            const mappedCatalog = mapCatalog(page.catalog);
            if (catalog === null) catalog = mappedCatalog;
            else if (stableJson(catalog) !== stableJson(mappedCatalog)) return failedCollection("provider_page_invalid", evidence());
          }
          for (const issue of page.issues) issues.push(mapIssue(issue, attachmentPolicy));
          if (issues.length > limits.max_issues) return failedCollection("resource_limit_exceeded", evidence());
          pageCount += 1;
          cursorLedger.push({
            cursor,
            next_cursor: page.next_cursor,
            issue_count: page.issues.length,
            page_sha256: sha256(pageJson),
          });
          if (!page.has_more) {
            if (page.next_cursor !== null) return failedCollection("provider_page_invalid", evidence());
            break;
          }
          if (page.next_cursor === null || seenCursors.has(page.next_cursor)) return failedCollection("provider_page_invalid", evidence());
          seenCursors.add(page.next_cursor);
          cursor = page.next_cursor;
        }
      } catch {
        return failedCollection("provider_error", evidence());
      }
      if (!catalog || !mergedCoverage || cutoffAt === null || !withinBudget(config.clock, start.nowMs, limits.max_runtime_ms)) {
        return failedCollection("provider_timeout", evidence());
      }
      const now = clockSnapshot(config.clock);
      if (!now) return failedCollection("provider_timeout", evidence());
      const snapshot = {
        schema_version: LINEAR_LB1_V2_SNAPSHOT_SCHEMA_VERSION,
        snapshot_id: `linear-actual-${sha256(stableJson({ cutoffAt, issues, workspace: workspaceRef.entity_id })).slice(0, 48)}`,
        collected_at: now.nowIso,
        source_scope: {
          kind: "linear_read_only_provider",
          workspace_id: workspaceRef.entity_id,
          scope_mode: "entire_workspace",
          team_ids: [],
          project_ids: [],
        },
        ...catalog,
        cutoff: { cutoff_at: cutoffAt, page_count: pageCount, total_issues: issues.length, pagination_complete: true },
        issues,
      };
      if (Buffer.byteLength(stableJson(snapshot), "utf8") > limits.max_total_bytes) {
        return failedCollection("resource_limit_exceeded", evidence());
      }
      const missing = missingDimensions(mergedCoverage);
      try {
        return collectActualLinearLb1V2Snapshot(snapshot, {
          status: missing.length === 0 ? "complete" : "partial",
          missing_dimensions: missing,
          errors: [],
          collector: {
            ...failureCollector(evidence()),
            terminal_page_observed: true,
          },
        });
      } catch {
        return failedCollection("provider_error", evidence());
      }
    },
    getEffects() {
      return Object.freeze({
        provider_calls: providerCalls,
        network_calls: providerCalls,
        linear_mutations: null,
        mutation_evidence: "unknown_injected_provider",
      });
    },
  });
}

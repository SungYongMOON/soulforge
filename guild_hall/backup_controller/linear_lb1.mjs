import { createHash } from "node:crypto";

export const LINEAR_LB1_SNAPSHOT_SCHEMA_VERSION = "soulforge.backup_controller.linear_lb1.snapshot.v1";
export const LINEAR_LB1_COLLECTION_SCHEMA_VERSION = "soulforge.backup_controller.linear_lb1.collection.v1";
export const LINEAR_LB1_MANIFEST_SCHEMA_VERSION = "soulforge.backup_controller.linear_lb1.manifest.v1";
export const LINEAR_LB1_RUN_SCHEMA_VERSION = "soulforge.backup_controller.linear_lb1.run.v1";
export const LINEAR_LB1_RESTORE_CHECK_SCHEMA_VERSION = "soulforge.backup_controller.linear_lb1.restore_check.v1";

export const LINEAR_LB1_DIMENSIONS = Object.freeze([
  "issue",
  "project",
  "assignee",
  "status",
  "timestamps",
  "due",
  "relations",
  "description_revision",
  "comments",
  "state_history",
  "waiting_refs",
  "completion_refs",
  "evidence_refs",
]);

export const LINEAR_LB1_ZERO_EFFECTS = Object.freeze({
  provider_calls: 0,
  storage_writes: 0,
  network_calls: 0,
  filesystem_writes: 0,
  scheduler_changes: 0,
});

export class LinearLb1Error extends Error {
  constructor(code) {
    super(code);
    this.name = "LinearLb1Error";
    this.code = code;
  }
}

const SAFE_ID = /^[a-z][a-z0-9._-]{2,127}$/;
const ERROR_CODE = /^[a-z][a-z0-9_-]{2,63}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REVISION_ID_DOMAIN = "soulforge.backup_controller.linear_lb1.revision.v1";
const COLLECTION_STATUSES = new Set(["complete", "partial", "failed"]);
const TABULAR_ARTIFACT_KINDS = new Set(["sheet", "csv"]);
const UNSAFE_ERROR_CODE_SEGMENTS = new Set(["raw", "payload", "secret", "token", "password", "credential", "cookie", "session", "private", "path"]);

function fail(code) {
  throw new LinearLb1Error(code);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, code) {
  if (!isRecord(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function stableJson(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (isRecord(value)) return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function deterministicRevisionId({ runKey, collectionStatus, snapshotSha256, manifestSha256 }) {
  return "linear-lb1-revision-" + sha256({
    revision_domain: REVISION_ID_DOMAIN,
    run_key: runKey,
    collection_status: collectionStatus,
    snapshot_sha256: snapshotSha256,
    manifest_sha256: manifestSha256,
  });
}

function cloneJson(value, code) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) fail(code);
    return JSON.parse(serialized);
  } catch (error) {
    if (error instanceof LinearLb1Error) throw error;
    fail(code);
  }
}

function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return Object.freeze(value);
}

function requireId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return value;
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
  if (value === null) return value;
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
    if (seen.has(record[key])) fail(code);
    seen.add(record[key]);
  }
}

function sortBy(records, key) {
  records.sort((left, right) => left[key].localeCompare(right[key]));
}

function validateReference(reference) {
  exactKeys(reference, ["ref_id", "captured_at"], "linear_lb1_reference_shape_invalid");
  requireId(reference.ref_id, "linear_lb1_reference_id_invalid");
  requireIso(reference.captured_at, "linear_lb1_reference_timestamp_invalid");
}

function validateRelation(relation) {
  exactKeys(relation, ["relation_id", "relation_type", "target_issue_id"], "linear_lb1_relation_shape_invalid");
  requireId(relation.relation_id, "linear_lb1_relation_id_invalid");
  requireId(relation.target_issue_id, "linear_lb1_relation_target_invalid");
  if (typeof relation.relation_type !== "string" || !/^[a-z][a-z0-9_]{1,63}$/.test(relation.relation_type)) fail("linear_lb1_relation_type_invalid");
}

function validateComment(comment) {
  exactKeys(comment, ["comment_id", "revision_id", "content_sha256", "created_at", "updated_at"], "linear_lb1_comment_shape_invalid");
  requireId(comment.comment_id, "linear_lb1_comment_id_invalid");
  requireId(comment.revision_id, "linear_lb1_comment_revision_invalid");
  requireSha256(comment.content_sha256, "linear_lb1_comment_hash_invalid");
  requireIso(comment.created_at, "linear_lb1_comment_timestamp_invalid");
  requireIso(comment.updated_at, "linear_lb1_comment_timestamp_invalid");
}

function validateStateHistory(history) {
  exactKeys(history, ["history_id", "from_status_id", "to_status_id", "occurred_at"], "linear_lb1_history_shape_invalid");
  requireId(history.history_id, "linear_lb1_history_id_invalid");
  requireId(history.from_status_id, "linear_lb1_history_status_invalid");
  requireId(history.to_status_id, "linear_lb1_history_status_invalid");
  requireIso(history.occurred_at, "linear_lb1_history_timestamp_invalid");
}

function validateDescriptionRevision(revision) {
  exactKeys(revision, ["revision_id", "content_sha256", "updated_at"], "linear_lb1_description_revision_shape_invalid");
  requireId(revision.revision_id, "linear_lb1_description_revision_id_invalid");
  requireSha256(revision.content_sha256, "linear_lb1_description_revision_hash_invalid");
  requireIso(revision.updated_at, "linear_lb1_description_revision_timestamp_invalid");
}

function validateIssue(issue) {
  exactKeys(issue, [
    "issue_id",
    "project_id",
    "assignee_id",
    "status_id",
    "created_at",
    "updated_at",
    "due_at",
    "relations",
    "description_revision",
    "comments",
    "state_history",
    "waiting_refs",
    "completion_refs",
    "evidence_refs",
  ], "linear_lb1_issue_shape_invalid");
  requireId(issue.issue_id, "linear_lb1_issue_id_invalid");
  requireId(issue.project_id, "linear_lb1_issue_project_invalid");
  requireId(issue.assignee_id, "linear_lb1_issue_assignee_invalid");
  requireId(issue.status_id, "linear_lb1_issue_status_invalid");
  requireIso(issue.created_at, "linear_lb1_issue_timestamp_invalid");
  requireIso(issue.updated_at, "linear_lb1_issue_timestamp_invalid");
  requireNullableIso(issue.due_at, "linear_lb1_issue_due_invalid");
  validateDescriptionRevision(issue.description_revision);
  for (const relation of requireArray(issue.relations, "linear_lb1_relations_invalid")) validateRelation(relation);
  for (const comment of requireArray(issue.comments, "linear_lb1_comments_invalid")) validateComment(comment);
  for (const history of requireArray(issue.state_history, "linear_lb1_history_invalid")) validateStateHistory(history);
  for (const reference of requireArray(issue.waiting_refs, "linear_lb1_waiting_refs_invalid")) validateReference(reference);
  for (const reference of requireArray(issue.completion_refs, "linear_lb1_completion_refs_invalid")) validateReference(reference);
  for (const reference of requireArray(issue.evidence_refs, "linear_lb1_evidence_refs_invalid")) validateReference(reference);
  assertUnique(issue.relations, "relation_id", "linear_lb1_relation_duplicate");
  assertUnique(issue.comments, "comment_id", "linear_lb1_comment_duplicate");
  assertUnique(issue.state_history, "history_id", "linear_lb1_history_duplicate");
  assertUnique(issue.waiting_refs, "ref_id", "linear_lb1_waiting_reference_duplicate");
  assertUnique(issue.completion_refs, "ref_id", "linear_lb1_completion_reference_duplicate");
  assertUnique(issue.evidence_refs, "ref_id", "linear_lb1_evidence_reference_duplicate");
}

export function normalizeLinearLb1Snapshot(snapshot) {
  const copy = cloneJson(snapshot, "linear_lb1_snapshot_clone_invalid");
  exactKeys(copy, ["schema_version", "snapshot_id", "collected_at", "source_scope", "projects", "assignees", "statuses", "issues"], "linear_lb1_snapshot_shape_invalid");
  if (copy.schema_version !== LINEAR_LB1_SNAPSHOT_SCHEMA_VERSION) fail("linear_lb1_snapshot_schema_invalid");
  requireId(copy.snapshot_id, "linear_lb1_snapshot_id_invalid");
  requireIso(copy.collected_at, "linear_lb1_snapshot_timestamp_invalid");
  exactKeys(copy.source_scope, ["kind", "workspace_id", "team_id", "project_id"], "linear_lb1_scope_shape_invalid");
  if (copy.source_scope.kind !== "public_synthetic_fixture") fail("linear_lb1_scope_kind_invalid");
  requireId(copy.source_scope.workspace_id, "linear_lb1_scope_workspace_invalid");
  requireId(copy.source_scope.team_id, "linear_lb1_scope_team_invalid");
  requireId(copy.source_scope.project_id, "linear_lb1_scope_project_invalid");

  for (const project of requireArray(copy.projects, "linear_lb1_projects_invalid")) {
    exactKeys(project, ["project_id", "updated_at"], "linear_lb1_project_shape_invalid");
    requireId(project.project_id, "linear_lb1_project_id_invalid");
    requireIso(project.updated_at, "linear_lb1_project_timestamp_invalid");
  }
  for (const assignee of requireArray(copy.assignees, "linear_lb1_assignees_invalid")) {
    exactKeys(assignee, ["assignee_id"], "linear_lb1_assignee_shape_invalid");
    requireId(assignee.assignee_id, "linear_lb1_assignee_id_invalid");
  }
  for (const status of requireArray(copy.statuses, "linear_lb1_statuses_invalid")) {
    exactKeys(status, ["status_id"], "linear_lb1_status_shape_invalid");
    requireId(status.status_id, "linear_lb1_status_id_invalid");
  }
  for (const issue of requireArray(copy.issues, "linear_lb1_issues_invalid")) validateIssue(issue);
  if (copy.projects.length === 0 || copy.assignees.length === 0 || copy.statuses.length === 0 || copy.issues.length === 0) fail("linear_lb1_snapshot_empty_dimension");
  assertUnique(copy.projects, "project_id", "linear_lb1_project_duplicate");
  assertUnique(copy.assignees, "assignee_id", "linear_lb1_assignee_duplicate");
  assertUnique(copy.statuses, "status_id", "linear_lb1_status_duplicate");
  assertUnique(copy.issues, "issue_id", "linear_lb1_issue_duplicate");

  const projectIds = new Set(copy.projects.map((project) => project.project_id));
  const assigneeIds = new Set(copy.assignees.map((assignee) => assignee.assignee_id));
  const statusIds = new Set(copy.statuses.map((status) => status.status_id));
  const issueIds = new Set(copy.issues.map((issue) => issue.issue_id));
  if (!projectIds.has(copy.source_scope.project_id)) fail("linear_lb1_scope_project_uncovered");
  for (const issue of copy.issues) {
    if (!projectIds.has(issue.project_id)) fail("linear_lb1_issue_project_uncovered");
    if (!assigneeIds.has(issue.assignee_id)) fail("linear_lb1_issue_assignee_uncovered");
    if (!statusIds.has(issue.status_id)) fail("linear_lb1_issue_status_uncovered");
    for (const relation of issue.relations) {
      if (!issueIds.has(relation.target_issue_id)) fail("linear_lb1_relation_target_uncovered");
    }
    for (const history of issue.state_history) {
      if (!statusIds.has(history.from_status_id) || !statusIds.has(history.to_status_id)) fail("linear_lb1_history_status_uncovered");
    }
  }

  sortBy(copy.projects, "project_id");
  sortBy(copy.assignees, "assignee_id");
  sortBy(copy.statuses, "status_id");
  sortBy(copy.issues, "issue_id");
  for (const issue of copy.issues) {
    sortBy(issue.relations, "relation_id");
    sortBy(issue.comments, "comment_id");
    sortBy(issue.state_history, "history_id");
    sortBy(issue.waiting_refs, "ref_id");
    sortBy(issue.completion_refs, "ref_id");
    sortBy(issue.evidence_refs, "ref_id");
  }
  return deepFreeze(copy);
}

function normalizeDimensions(dimensions, code) {
  requireArray(dimensions, code);
  const selected = new Set();
  for (const dimension of dimensions) {
    if (!LINEAR_LB1_DIMENSIONS.includes(dimension) || selected.has(dimension)) fail(code);
    selected.add(dimension);
  }
  return LINEAR_LB1_DIMENSIONS.filter((dimension) => selected.has(dimension));
}

function normalizeErrors(errors) {
  const copy = cloneJson(errors, "linear_lb1_errors_clone_invalid");
  requireArray(copy, "linear_lb1_errors_invalid");
  const codes = new Set();
  for (const error of copy) {
    exactKeys(error, ["code"], "linear_lb1_error_shape_invalid");
    requireErrorCode(error.code, "linear_lb1_error_code_invalid");
    if (codes.has(error.code)) fail("linear_lb1_error_duplicate");
    codes.add(error.code);
  }
  copy.sort((left, right) => left.code.localeCompare(right.code));
  return copy;
}

function validateManifestErrorCodes(errorCodes, runStatus) {
  requireArray(errorCodes, "linear_lb1_manifest_error_codes_invalid");
  const normalized = [];
  const seen = new Set();
  for (const errorCode of errorCodes) {
    requireErrorCode(errorCode, "linear_lb1_manifest_error_codes_invalid");
    if (seen.has(errorCode)) fail("linear_lb1_manifest_error_codes_invalid");
    seen.add(errorCode);
    normalized.push(errorCode);
  }
  normalized.sort();
  if (stableJson(errorCodes) !== stableJson(normalized)) fail("linear_lb1_manifest_error_codes_invalid");
  if (runStatus === "complete" && normalized.length !== 0) fail("linear_lb1_manifest_error_codes_invalid");
  if (runStatus === "failed" && normalized.length === 0) fail("linear_lb1_manifest_error_codes_invalid");
  return normalized;
}

function collectionEnvelope(collectionStatus, snapshot, missingDimensions, errors) {
  return deepFreeze({
    schema_version: LINEAR_LB1_COLLECTION_SCHEMA_VERSION,
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

export function collectFeatureOffLinearLb1Fixture(snapshot, options = {}) {
  const status = options.status === undefined ? "complete" : options.status;
  if (status !== "complete" && status !== "partial") fail("linear_lb1_collection_status_invalid");
  const normalizedSnapshot = normalizeLinearLb1Snapshot(snapshot);
  const missingDimensions = normalizeDimensions(options.missing_dimensions === undefined ? [] : options.missing_dimensions, "linear_lb1_missing_dimensions_invalid");
  const errors = normalizeErrors(options.errors === undefined ? [] : options.errors);
  if (status === "complete" && (missingDimensions.length !== 0 || errors.length !== 0)) fail("linear_lb1_complete_collection_incomplete");
  if (status === "partial" && missingDimensions.length === 0) fail("linear_lb1_partial_collection_without_missing_dimension");
  return collectionEnvelope(status, normalizedSnapshot, missingDimensions, deepFreeze(errors));
}

export function createFailedFeatureOffLinearLb1Collection({ errors }) {
  const normalizedErrors = normalizeErrors(errors);
  if (normalizedErrors.length === 0) fail("linear_lb1_failed_collection_without_error");
  return collectionEnvelope("failed", null, [...LINEAR_LB1_DIMENSIONS], deepFreeze(normalizedErrors));
}

function validateZeroEffects(effects) {
  exactKeys(effects, ["provider_calls", "storage_writes", "network_calls", "filesystem_writes", "scheduler_changes"], "linear_lb1_effects_shape_invalid");
  for (const value of Object.values(effects)) {
    if (value !== 0) fail("linear_lb1_effects_not_zero");
  }
}

function normalizeFeatureOffCollection(collection) {
  exactKeys(collection, ["schema_version", "collector", "collection_status", "snapshot", "declared_missing_dimensions", "errors", "effects"], "linear_lb1_collection_shape_invalid");
  if (collection.schema_version !== LINEAR_LB1_COLLECTION_SCHEMA_VERSION || !COLLECTION_STATUSES.has(collection.collection_status)) fail("linear_lb1_collection_schema_invalid");
  exactKeys(collection.collector, ["kind", "feature_state", "provider_calls", "storage_writes"], "linear_lb1_collector_shape_invalid");
  if (collection.collector.kind !== "public_synthetic_fixture" || collection.collector.feature_state !== "off" || collection.collector.provider_calls !== 0 || collection.collector.storage_writes !== 0) fail("linear_lb1_collector_not_feature_off");
  validateZeroEffects(collection.effects);
  const missingDimensions = normalizeDimensions(collection.declared_missing_dimensions, "linear_lb1_missing_dimensions_invalid");
  const errors = normalizeErrors(collection.errors);
  let normalizedSnapshot = null;
  if (collection.collection_status === "failed") {
    if (collection.snapshot !== null || errors.length === 0 || missingDimensions.length !== LINEAR_LB1_DIMENSIONS.length) fail("linear_lb1_failed_collection_invalid");
  } else {
    normalizedSnapshot = normalizeLinearLb1Snapshot(collection.snapshot);
    if (collection.collection_status === "complete" && (missingDimensions.length !== 0 || errors.length !== 0)) fail("linear_lb1_complete_collection_incomplete");
    if (collection.collection_status === "partial" && missingDimensions.length === 0) fail("linear_lb1_partial_collection_without_missing_dimension");
  }
  return collectionEnvelope(collection.collection_status, normalizedSnapshot, missingDimensions, deepFreeze(errors));
}

function emptyCounts() {
  return {
    issues: 0,
    projects: 0,
    assignees: 0,
    statuses: 0,
    relations: 0,
    description_revisions: 0,
    comments: 0,
    state_history: 0,
    waiting_refs: 0,
    completion_refs: 0,
    evidence_refs: 0,
  };
}

function snapshotCounts(snapshot) {
  if (snapshot === null) return emptyCounts();
  const counts = emptyCounts();
  counts.issues = snapshot.issues.length;
  counts.projects = snapshot.projects.length;
  counts.assignees = snapshot.assignees.length;
  counts.statuses = snapshot.statuses.length;
  for (const issue of snapshot.issues) {
    counts.relations += issue.relations.length;
    counts.description_revisions += 1;
    counts.comments += issue.comments.length;
    counts.state_history += issue.state_history.length;
    counts.waiting_refs += issue.waiting_refs.length;
    counts.completion_refs += issue.completion_refs.length;
    counts.evidence_refs += issue.evidence_refs.length;
  }
  return counts;
}

function snapshotTimestampRange(snapshot) {
  if (snapshot === null) return { min: null, max: null };
  const values = [snapshot.collected_at];
  for (const project of snapshot.projects) values.push(project.updated_at);
  for (const issue of snapshot.issues) {
    values.push(issue.created_at, issue.updated_at, issue.description_revision.updated_at);
    if (issue.due_at !== null) values.push(issue.due_at);
    for (const comment of issue.comments) values.push(comment.created_at, comment.updated_at);
    for (const history of issue.state_history) values.push(history.occurred_at);
    for (const reference of issue.waiting_refs) values.push(reference.captured_at);
    for (const reference of issue.completion_refs) values.push(reference.captured_at);
    for (const reference of issue.evidence_refs) values.push(reference.captured_at);
  }
  values.sort();
  return { min: values[0], max: values[values.length - 1] };
}

function coverageForSnapshot(snapshot, missingDimensions) {
  const missingSet = new Set(missingDimensions);
  return {
    requested_dimensions: [...LINEAR_LB1_DIMENSIONS],
    covered_dimensions: LINEAR_LB1_DIMENSIONS.filter((dimension) => !missingSet.has(dimension)),
    missing_dimensions: [...missingDimensions],
    counts: snapshotCounts(snapshot),
    timestamp_range: snapshotTimestampRange(snapshot),
  };
}

function coverageFor(collection) {
  return coverageForSnapshot(collection.snapshot, collection.declared_missing_dimensions);
}

function validateManifestCoverage(coverage, snapshot, runStatus) {
  if (!isRecord(coverage)) fail("linear_lb1_manifest_coverage_invalid");
  const missingDimensions = normalizeDimensions(coverage.missing_dimensions, "linear_lb1_manifest_coverage_invalid");
  const expected = coverageForSnapshot(snapshot, missingDimensions);
  if (stableJson(coverage) !== stableJson(expected)) fail("linear_lb1_manifest_coverage_invalid");
  if (runStatus === "complete" && missingDimensions.length !== 0) fail("linear_lb1_manifest_coverage_invalid");
  if (runStatus === "partial" && missingDimensions.length === 0) fail("linear_lb1_manifest_coverage_invalid");
  if (runStatus === "failed" && missingDimensions.length !== LINEAR_LB1_DIMENSIONS.length) fail("linear_lb1_manifest_coverage_invalid");
  return expected;
}

export function buildImmutableLinearLb1BackupRun({ run_key: runKey, collection }) {
  requireId(runKey, "linear_lb1_run_key_invalid");
  const normalizedCollection = normalizeFeatureOffCollection(collection);
  const coverage = coverageFor(normalizedCollection);
  const snapshotSha256 = normalizedCollection.snapshot === null ? null : sha256(normalizedCollection.snapshot);
  const manifestBody = {
    schema_version: LINEAR_LB1_MANIFEST_SCHEMA_VERSION,
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
    schema_version: LINEAR_LB1_RUN_SCHEMA_VERSION,
    feature_state: "off",
    run_key: runKey,
    run_status: normalizedCollection.collection_status,
    revision,
    manifest,
    effects: LINEAR_LB1_ZERO_EFFECTS,
  });
}

function validateBackupRun(run) {
  exactKeys(run, ["schema_version", "feature_state", "run_key", "run_status", "revision", "manifest", "effects"], "linear_lb1_run_shape_invalid");
  if (run.schema_version !== LINEAR_LB1_RUN_SCHEMA_VERSION || run.feature_state !== "off" || !COLLECTION_STATUSES.has(run.run_status)) fail("linear_lb1_run_schema_invalid");
  requireId(run.run_key, "linear_lb1_run_key_invalid");
  validateZeroEffects(run.effects);
  exactKeys(run.manifest, ["schema_version", "run_key", "source_kind", "feature_state", "collection_status", "snapshot_sha256", "coverage", "error_codes", "manifest_sha256"], "linear_lb1_manifest_shape_invalid");
  if (run.manifest.schema_version !== LINEAR_LB1_MANIFEST_SCHEMA_VERSION || run.manifest.run_key !== run.run_key || run.manifest.source_kind !== "public_synthetic_fixture" || run.manifest.feature_state !== "off" || run.manifest.collection_status !== run.run_status) fail("linear_lb1_manifest_identity_invalid");
  if ((run.manifest.snapshot_sha256 !== null && !SHA256.test(run.manifest.snapshot_sha256)) || !SHA256.test(run.manifest.manifest_sha256)) fail("linear_lb1_manifest_hash_invalid");
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
  if (sha256(manifestBody) !== run.manifest.manifest_sha256) fail("linear_lb1_manifest_digest_invalid");
  if (run.revision === null) {
    validateManifestCoverage(run.manifest.coverage, null, run.run_status);
    if (run.run_status !== "failed" || run.manifest.snapshot_sha256 !== null) fail("linear_lb1_failed_run_revision_invalid");
    return run;
  }
  if (run.run_status === "failed") fail("linear_lb1_failed_run_revision_invalid");
  exactKeys(run.revision, ["revision_id", "collection_status", "snapshot_sha256", "manifest_sha256", "revision_sha256", "snapshot"], "linear_lb1_revision_shape_invalid");
  requireId(run.revision.revision_id, "linear_lb1_revision_id_invalid");
  requireSha256(run.revision.snapshot_sha256, "linear_lb1_revision_hash_invalid");
  requireSha256(run.revision.manifest_sha256, "linear_lb1_revision_hash_invalid");
  requireSha256(run.revision.revision_sha256, "linear_lb1_revision_hash_invalid");
  if (run.revision.collection_status !== run.run_status || run.revision.collection_status !== run.manifest.collection_status) fail("linear_lb1_revision_status_invalid");
  if (run.revision.snapshot_sha256 !== run.manifest.snapshot_sha256 || run.revision.manifest_sha256 !== run.manifest.manifest_sha256) fail("linear_lb1_revision_identity_invalid");
  if (run.revision.revision_id !== deterministicRevisionId({
    runKey: run.run_key,
    collectionStatus: run.revision.collection_status,
    snapshotSha256: run.revision.snapshot_sha256,
    manifestSha256: run.revision.manifest_sha256,
  })) fail("linear_lb1_revision_id_invalid");
  const normalizedSnapshot = normalizeLinearLb1Snapshot(run.revision.snapshot);
  if (sha256(normalizedSnapshot) !== run.revision.snapshot_sha256) fail("linear_lb1_snapshot_digest_invalid");
  validateManifestCoverage(run.manifest.coverage, normalizedSnapshot, run.run_status);
  const revisionBody = {
    revision_id: run.revision.revision_id,
    collection_status: run.revision.collection_status,
    snapshot_sha256: run.revision.snapshot_sha256,
    manifest_sha256: run.revision.manifest_sha256,
  };
  if (sha256(revisionBody) !== run.revision.revision_sha256) fail("linear_lb1_revision_digest_invalid");
  return run;
}

export function registerImmutableLinearLb1BackupRun(existingRuns, candidateRun) {
  if (!Array.isArray(existingRuns)) fail("linear_lb1_registry_invalid");
  const existingRunKeys = new Set();
  for (const existing of existingRuns) {
    validateBackupRun(existing);
    if (existingRunKeys.has(existing.run_key)) fail("linear_lb1_registry_duplicate_run_key");
    existingRunKeys.add(existing.run_key);
  }
  validateBackupRun(candidateRun);
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

function projection(snapshot, dimension) {
  switch (dimension) {
    case "issue":
      return snapshot.issues.map((issue) => issue.issue_id);
    case "project":
      return {
        projects: snapshot.projects,
        issue_projects: snapshot.issues.map((issue) => ({ issue_id: issue.issue_id, project_id: issue.project_id })),
      };
    case "assignee":
      return {
        assignees: snapshot.assignees,
        issue_assignees: snapshot.issues.map((issue) => ({ issue_id: issue.issue_id, assignee_id: issue.assignee_id })),
      };
    case "status":
      return {
        statuses: snapshot.statuses,
        issue_statuses: snapshot.issues.map((issue) => ({ issue_id: issue.issue_id, status_id: issue.status_id })),
      };
    case "timestamps":
      return {
        collected_at: snapshot.collected_at,
        projects: snapshot.projects.map((project) => ({ project_id: project.project_id, updated_at: project.updated_at })),
        issues: snapshot.issues.map((issue) => ({
          issue_id: issue.issue_id,
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          description_updated_at: issue.description_revision.updated_at,
          comments: issue.comments.map((comment) => ({ comment_id: comment.comment_id, created_at: comment.created_at, updated_at: comment.updated_at })),
          history: issue.state_history.map((history) => ({ history_id: history.history_id, occurred_at: history.occurred_at })),
        })),
      };
    case "due":
      return snapshot.issues.map((issue) => ({ issue_id: issue.issue_id, due_at: issue.due_at }));
    case "relations":
      return snapshot.issues.map((issue) => ({ issue_id: issue.issue_id, relations: issue.relations }));
    case "description_revision":
      return snapshot.issues.map((issue) => ({ issue_id: issue.issue_id, description_revision: issue.description_revision }));
    case "comments":
      return snapshot.issues.map((issue) => ({ issue_id: issue.issue_id, comments: issue.comments }));
    case "state_history":
      return snapshot.issues.map((issue) => ({ issue_id: issue.issue_id, state_history: issue.state_history }));
    case "waiting_refs":
      return snapshot.issues.map((issue) => ({ issue_id: issue.issue_id, waiting_refs: issue.waiting_refs }));
    case "completion_refs":
      return snapshot.issues.map((issue) => ({ issue_id: issue.issue_id, completion_refs: issue.completion_refs }));
    case "evidence_refs":
      return snapshot.issues.map((issue) => ({ issue_id: issue.issue_id, evidence_refs: issue.evidence_refs }));
    default:
      fail("linear_lb1_projection_dimension_invalid");
  }
}

function normalizeArtifactKinds(artifactKinds) {
  requireArray(artifactKinds, "linear_lb1_artifact_kinds_invalid");
  const values = new Set();
  for (const artifactKind of artifactKinds) {
    requireId(artifactKind, "linear_lb1_artifact_kind_invalid");
    values.add(artifactKind);
  }
  return [...values].sort();
}

function orderedMissingDimensions(missing) {
  return [
    ...LINEAR_LB1_DIMENSIONS.filter((dimension) => missing.has(dimension)),
    ...[...missing].filter((dimension) => !LINEAR_LB1_DIMENSIONS.includes(dimension)).sort(),
  ];
}

export function checkLinearLb1Restore(backupRun, restoredSnapshot, options = {}) {
  validateBackupRun(backupRun);
  const artifactKinds = normalizeArtifactKinds(options.artifact_kinds === undefined ? ["immutable_revision"] : options.artifact_kinds);
  const restored = restoredSnapshot === null ? null : normalizeLinearLb1Snapshot(restoredSnapshot);
  const missing = new Set(backupRun.manifest.coverage.missing_dimensions);
  const reconstructable = [];
  if (backupRun.revision === null || restored === null) {
    for (const dimension of backupRun.manifest.coverage.covered_dimensions) missing.add(dimension);
  } else {
    for (const dimension of backupRun.manifest.coverage.covered_dimensions) {
      if (stableJson(projection(backupRun.revision.snapshot, dimension)) === stableJson(projection(restored, dimension))) reconstructable.push(dimension);
      else missing.add(dimension);
    }
  }
  const hasImmutableRevision = artifactKinds.includes("immutable_revision");
  const tabularOnly = artifactKinds.length > 0 && artifactKinds.every((artifactKind) => TABULAR_ARTIFACT_KINDS.has(artifactKind));
  if (!hasImmutableRevision) missing.add("immutable_revision");
  if (tabularOnly) missing.add("tabular_export_only");
  const missingDimensions = orderedMissingDimensions(missing);
  return deepFreeze({
    schema_version: LINEAR_LB1_RESTORE_CHECK_SCHEMA_VERSION,
    run_key: backupRun.run_key,
    revision_id: backupRun.revision === null ? null : backupRun.revision.revision_id,
    artifact_kinds: artifactKinds,
    reconstructable_dimensions: reconstructable,
    missing_dimensions: missingDimensions,
    complete: backupRun.run_status === "complete"
      && hasImmutableRevision
      && reconstructable.length === LINEAR_LB1_DIMENSIONS.length
      && missingDimensions.length === 0,
    effects: LINEAR_LB1_ZERO_EFFECTS,
  });
}

export const HELD_LINEAR_LB1_PROVIDER_ADAPTER = Object.freeze({
  adapter_kind: "linear_provider",
  feature_state: "off",
  authority_state: "hold",
  collect_current_snapshot() {
    fail("linear_lb1_provider_hold");
  },
});

export const HELD_LINEAR_LB1_STORAGE_ADAPTER = Object.freeze({
  adapter_kind: "backup_storage",
  feature_state: "off",
  authority_state: "hold",
  write_revision() {
    fail("linear_lb1_storage_hold");
  },
});

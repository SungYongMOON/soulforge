import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  HELD_LINEAR_LB1_PROVIDER_ADAPTER,
  HELD_LINEAR_LB1_STORAGE_ADAPTER,
  LINEAR_LB1_COLLECTION_SCHEMA_VERSION,
  LINEAR_LB1_DIMENSIONS,
  LINEAR_LB1_ZERO_EFFECTS,
  LinearLb1Error,
  buildImmutableLinearLb1BackupRun,
  checkLinearLb1Restore,
  collectFeatureOffLinearLb1Fixture,
  createFailedFeatureOffLinearLb1Collection,
  registerImmutableLinearLb1BackupRun,
} from "./linear_lb1.mjs";
import { makeCommentChangedLinearLb1Fixture, makeCompleteLinearLb1Fixture } from "./linear_lb1_fixture.mjs";

function stableJsonForForgery(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJsonForForgery).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableJsonForForgery(value[key])).join(",") + "}";
  return JSON.stringify(value);
}

function sha256ForForgery(value) {
  return createHash("sha256").update(stableJsonForForgery(value)).digest("hex");
}

function manifestBodyForForgery(forged) {
  return {
    schema_version: forged.manifest.schema_version,
    run_key: forged.manifest.run_key,
    source_kind: forged.manifest.source_kind,
    feature_state: forged.manifest.feature_state,
    collection_status: forged.manifest.collection_status,
    snapshot_sha256: forged.manifest.snapshot_sha256,
    coverage: forged.manifest.coverage,
    error_codes: forged.manifest.error_codes,
  };
}

function revisionBodyForForgery(revision) {
  return {
    revision_id: revision.revision_id,
    ...(Object.hasOwn(revision, "collection_status") ? { collection_status: revision.collection_status } : {}),
    snapshot_sha256: revision.snapshot_sha256,
    manifest_sha256: revision.manifest_sha256,
  };
}

function deterministicRevisionIdForForgery(forged) {
  return "linear-lb1-revision-" + sha256ForForgery({
    revision_domain: "soulforge.backup_controller.linear_lb1.revision.v1",
    run_key: forged.run_key,
    collection_status: forged.revision.collection_status,
    snapshot_sha256: forged.revision.snapshot_sha256,
    manifest_sha256: forged.revision.manifest_sha256,
  });
}

function refreshForgedRunHashes(forged, { deriveRevisionId = false } = {}) {
  forged.manifest.manifest_sha256 = sha256ForForgery(manifestBodyForForgery(forged));
  forged.revision.manifest_sha256 = forged.manifest.manifest_sha256;
  if (deriveRevisionId) forged.revision.revision_id = deterministicRevisionIdForForgery(forged);
  forged.revision.revision_sha256 = sha256ForForgery(revisionBodyForForgery(forged.revision));
  return forged;
}

function makeSchemaValidCallerCollection() {
  const snapshot = makeCompleteLinearLb1Fixture();
  snapshot.projects.push({ project_id: "synthetic-project-002", updated_at: "2026-08-20T08:05:00.000Z" });
  snapshot.assignees.push({ assignee_id: "synthetic-assignee-002" });
  snapshot.issues[1].project_id = "synthetic-project-002";
  snapshot.issues[1].assignee_id = "synthetic-assignee-002";
  snapshot.issues[0].relations.push({ relation_id: "relation-002", relation_type: "relates_to", target_issue_id: "issue-002" });
  snapshot.issues[0].comments.push({
    comment_id: "comment-002",
    revision_id: "comment-revision-002",
    content_sha256: "e".repeat(64),
    created_at: "2026-08-20T08:11:00.000Z",
    updated_at: "2026-08-20T08:12:00.000Z",
  });
  snapshot.issues[0].state_history.push({
    history_id: "history-002",
    from_status_id: "status-in-progress",
    to_status_id: "status-done",
    occurred_at: "2026-08-20T08:24:00.000Z",
  });
  snapshot.issues[0].waiting_refs.push({ ref_id: "waiting-ref-002", captured_at: "2026-08-20T08:24:30.000Z" });
  snapshot.issues[0].completion_refs.push({ ref_id: "completion-ref-002", captured_at: "2026-08-20T08:24:40.000Z" });
  snapshot.issues[0].evidence_refs.push({ ref_id: "evidence-ref-003", captured_at: "2026-08-20T08:24:50.000Z" });
  return {
    schema_version: LINEAR_LB1_COLLECTION_SCHEMA_VERSION,
    collector: {
      kind: "public_synthetic_fixture",
      feature_state: "off",
      provider_calls: 0,
      storage_writes: 0,
    },
    collection_status: "complete",
    snapshot,
    declared_missing_dimensions: [],
    errors: [],
    effects: { ...LINEAR_LB1_ZERO_EFFECTS },
  };
}

function reorderSemanticCollections(collection) {
  const copy = JSON.parse(JSON.stringify(collection));
  copy.snapshot.projects.reverse();
  copy.snapshot.assignees.reverse();
  copy.snapshot.statuses.reverse();
  copy.snapshot.issues.reverse();
  for (const issue of copy.snapshot.issues) {
    issue.relations.reverse();
    issue.comments.reverse();
    issue.state_history.reverse();
    issue.waiting_refs.reverse();
    issue.completion_refs.reverse();
    issue.evidence_refs.reverse();
  }
  return copy;
}

function forgeSelfConsistentEmptyCoverage(run) {
  const forged = JSON.parse(JSON.stringify(run));
  forged.manifest.coverage = {
    requested_dimensions: [...LINEAR_LB1_DIMENSIONS],
    covered_dimensions: [],
    missing_dimensions: [],
    counts: {
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
    },
    timestamp_range: { min: null, max: null },
  };
  return refreshForgedRunHashes(forged, { deriveRevisionId: true });
}

function forgeSelfConsistentRawErrorCodes(run) {
  const forged = JSON.parse(JSON.stringify(run));
  forged.manifest.error_codes = ["raw-payload-marker", "/synthetic/private/path"];
  return refreshForgedRunHashes(forged, { deriveRevisionId: true });
}

function forgeSelfConsistentRevisionId(run, revisionId) {
  const forged = JSON.parse(JSON.stringify(run));
  forged.revision.revision_id = revisionId;
  return refreshForgedRunHashes(forged);
}

function forgeSelfConsistentStatusDowngrade(run) {
  const forged = JSON.parse(JSON.stringify(run));
  forged.run_status = "partial";
  forged.manifest.collection_status = "partial";
  forged.manifest.coverage = {
    ...forged.manifest.coverage,
    covered_dimensions: LINEAR_LB1_DIMENSIONS.filter((dimension) => dimension !== "comments"),
    missing_dimensions: ["comments"],
  };
  return refreshForgedRunHashes(forged, { deriveRevisionId: true });
}

test("feature-OFF fixture collector covers all requested synthetic dimensions without effects", () => {
  const source = makeCompleteLinearLb1Fixture();
  const collection = collectFeatureOffLinearLb1Fixture(source);
  assert.equal(collection.collector.kind, "public_synthetic_fixture");
  assert.equal(collection.collector.feature_state, "off");
  assert.deepEqual(collection.declared_missing_dimensions, []);
  assert.deepEqual(collection.effects, LINEAR_LB1_ZERO_EFFECTS);
  assert.deepEqual(Object.keys(collection.snapshot.issues[0]).sort(), [
    "assignee_id",
    "comments",
    "completion_refs",
    "created_at",
    "description_revision",
    "due_at",
    "evidence_refs",
    "issue_id",
    "project_id",
    "relations",
    "state_history",
    "status_id",
    "updated_at",
    "waiting_refs",
  ]);
  assert.equal(Object.isFrozen(collection.snapshot.issues), true);
  source.issues[0].status_id = "status-done";
  assert.equal(collection.snapshot.issues[0].status_id, "status-in-progress");
});

test("schema-valid caller collection ordering cannot change revision or manifest identity", () => {
  const canonical = buildImmutableLinearLb1BackupRun({
    run_key: "linear-lb1-run-canonical",
    collection: makeSchemaValidCallerCollection(),
  });
  const reordered = buildImmutableLinearLb1BackupRun({
    run_key: "linear-lb1-run-canonical",
    collection: reorderSemanticCollections(makeSchemaValidCallerCollection()),
  });
  assert.equal(reordered.revision.snapshot_sha256, canonical.revision.snapshot_sha256);
  assert.equal(reordered.manifest.manifest_sha256, canonical.manifest.manifest_sha256);
});

test("immutable manifest is deterministic and duplicate versus conflict replays are explicit", () => {
  const first = buildImmutableLinearLb1BackupRun({
    run_key: "linear-lb1-run-001",
    collection: collectFeatureOffLinearLb1Fixture(makeCompleteLinearLb1Fixture()),
  });
  const shuffled = makeCompleteLinearLb1Fixture();
  shuffled.issues.reverse();
  shuffled.statuses.reverse();
  const duplicateCandidate = buildImmutableLinearLb1BackupRun({
    run_key: "linear-lb1-run-001",
    collection: collectFeatureOffLinearLb1Fixture(shuffled),
  });
  assert.equal(first.manifest.manifest_sha256, duplicateCandidate.manifest.manifest_sha256);
  assert.equal(first.revision.snapshot_sha256, duplicateCandidate.revision.snapshot_sha256);
  assert.equal(first.manifest.coverage.counts.issues, 2);
  assert.equal(first.manifest.coverage.counts.comments, 1);
  assert.equal(first.manifest.coverage.timestamp_range.min, "2026-08-19T09:00:00.000Z");
  assert.equal(first.manifest.coverage.timestamp_range.max, "2026-08-25T00:00:00.000Z");

  const created = registerImmutableLinearLb1BackupRun([], first);
  assert.equal(created.outcome, "created");
  assert.equal(created.runs.length, 1);
  const duplicate = registerImmutableLinearLb1BackupRun(created.runs, duplicateCandidate);
  assert.equal(duplicate.outcome, "duplicate");
  assert.equal(duplicate.runs.length, 1);

  const changed = buildImmutableLinearLb1BackupRun({
    run_key: "linear-lb1-run-001",
    collection: collectFeatureOffLinearLb1Fixture(makeCommentChangedLinearLb1Fixture()),
  });
  const conflict = registerImmutableLinearLb1BackupRun(created.runs, changed);
  assert.equal(conflict.outcome, "conflict");
  assert.equal(conflict.runs.length, 1);
  assert.equal(conflict.run.manifest.manifest_sha256, first.manifest.manifest_sha256);
  assert.throws(() => {
    first.revision.snapshot.issues[0].status_id = "status-done";
  }, TypeError);
});

test("restore rejects a self-consistent forged coverage manifest before it can claim complete", () => {
  const run = buildImmutableLinearLb1BackupRun({
    run_key: "linear-lb1-run-forged-coverage",
    collection: collectFeatureOffLinearLb1Fixture(makeCompleteLinearLb1Fixture()),
  });
  const forged = forgeSelfConsistentEmptyCoverage(run);
  assert.throws(
    () => checkLinearLb1Restore(forged, makeCommentChangedLinearLb1Fixture(), {
      artifact_kinds: ["immutable_revision"],
    }),
    (error) => error instanceof LinearLb1Error && error.code === "linear_lb1_manifest_coverage_invalid",
  );
});

test("restore and registry reject self-consistent raw or path-like manifest error codes", () => {
  const run = buildImmutableLinearLb1BackupRun({
    run_key: "linear-lb1-run-forged-errors",
    collection: collectFeatureOffLinearLb1Fixture(makeCompleteLinearLb1Fixture()),
  });
  const forged = forgeSelfConsistentRawErrorCodes(run);
  assert.throws(
    () => checkLinearLb1Restore(forged, makeCompleteLinearLb1Fixture()),
    (error) => error instanceof LinearLb1Error && error.code === "linear_lb1_manifest_error_codes_invalid",
  );
  assert.throws(
    () => registerImmutableLinearLb1BackupRun([], forged),
    (error) => error instanceof LinearLb1Error && error.code === "linear_lb1_manifest_error_codes_invalid",
  );
});

test("restore and registry reject self-consistent raw or path-like revision identities", () => {
  const run = buildImmutableLinearLb1BackupRun({
    run_key: "linear-lb1-run-forged-revision-id",
    collection: collectFeatureOffLinearLb1Fixture(makeCompleteLinearLb1Fixture()),
  });
  for (const revisionId of ["raw-revision-marker", "/synthetic/raw-revision"]) {
    const forged = forgeSelfConsistentRevisionId(run, revisionId);
    assert.throws(
      () => checkLinearLb1Restore(forged, makeCompleteLinearLb1Fixture()),
      (error) => error instanceof LinearLb1Error && error.code === "linear_lb1_revision_id_invalid",
    );
    assert.throws(
      () => registerImmutableLinearLb1BackupRun([], forged),
      (error) => error instanceof LinearLb1Error && error.code === "linear_lb1_revision_id_invalid",
    );
  }
});

test("restore and registry reject a self-consistent revision status downgrade", () => {
  const run = buildImmutableLinearLb1BackupRun({
    run_key: "linear-lb1-run-forged-revision-status",
    collection: collectFeatureOffLinearLb1Fixture(makeCompleteLinearLb1Fixture()),
  });
  const forged = forgeSelfConsistentStatusDowngrade(run);
  assert.throws(
    () => checkLinearLb1Restore(forged, makeCompleteLinearLb1Fixture()),
    (error) => error instanceof LinearLb1Error && error.code === "linear_lb1_revision_status_invalid",
  );
  assert.throws(
    () => registerImmutableLinearLb1BackupRun([], forged),
    (error) => error instanceof LinearLb1Error && error.code === "linear_lb1_revision_status_invalid",
  );
});

test("registry rejects pre-existing duplicate run keys before replay classification", () => {
  const first = buildImmutableLinearLb1BackupRun({
    run_key: "linear-lb1-run-corrupt-registry",
    collection: collectFeatureOffLinearLb1Fixture(makeCompleteLinearLb1Fixture()),
  });
  const sameKey = buildImmutableLinearLb1BackupRun({
    run_key: "linear-lb1-run-corrupt-registry",
    collection: collectFeatureOffLinearLb1Fixture(makeCompleteLinearLb1Fixture()),
  });
  assert.throws(
    () => registerImmutableLinearLb1BackupRun([first, sameKey], first),
    (error) => error instanceof LinearLb1Error && error.code === "linear_lb1_registry_duplicate_run_key",
  );
});

test("partial and failed collections retain coverage gaps and errors without creating a false complete revision", () => {
  const partialCollection = collectFeatureOffLinearLb1Fixture(makeCompleteLinearLb1Fixture(), {
    status: "partial",
    missing_dimensions: ["comments", "evidence_refs"],
    errors: [{ code: "synthetic-comments-held" }],
  });
  const partialRun = buildImmutableLinearLb1BackupRun({
    run_key: "linear-lb1-run-partial",
    collection: partialCollection,
  });
  assert.equal(partialRun.run_status, "partial");
  assert.deepEqual(partialRun.manifest.coverage.missing_dimensions, ["comments", "evidence_refs"]);
  assert.deepEqual(partialRun.manifest.error_codes, ["synthetic-comments-held"]);
  const partialRestore = checkLinearLb1Restore(partialRun, makeCompleteLinearLb1Fixture());
  assert.equal(partialRestore.complete, false);
  assert.deepEqual(partialRestore.missing_dimensions, ["comments", "evidence_refs"]);

  const failedRun = buildImmutableLinearLb1BackupRun({
    run_key: "linear-lb1-run-failed",
    collection: createFailedFeatureOffLinearLb1Collection({ errors: [{ code: "synthetic-provider-held" }] }),
  });
  assert.equal(failedRun.run_status, "failed");
  assert.equal(failedRun.revision, null);
  assert.equal(failedRun.manifest.snapshot_sha256, null);
  assert.deepEqual(failedRun.manifest.coverage.missing_dimensions, LINEAR_LB1_DIMENSIONS);
  assert.equal(failedRun.manifest.coverage.counts.issues, 0);
  const failedRestore = checkLinearLb1Restore(failedRun, null);
  assert.equal(failedRestore.complete, false);
  assert.deepEqual(failedRestore.missing_dimensions, LINEAR_LB1_DIMENSIONS);
});

test("restore-check compares reconstructable fields and rejects tabular exports as complete backups", () => {
  const run = buildImmutableLinearLb1BackupRun({
    run_key: "linear-lb1-run-restore",
    collection: collectFeatureOffLinearLb1Fixture(makeCompleteLinearLb1Fixture()),
  });
  const restored = checkLinearLb1Restore(run, makeCompleteLinearLb1Fixture(), {
    artifact_kinds: ["immutable_revision"],
  });
  assert.equal(restored.complete, true);
  assert.deepEqual(restored.reconstructable_dimensions, LINEAR_LB1_DIMENSIONS);
  assert.deepEqual(restored.missing_dimensions, []);

  const commentMismatch = checkLinearLb1Restore(run, makeCommentChangedLinearLb1Fixture(), {
    artifact_kinds: ["immutable_revision"],
  });
  assert.equal(commentMismatch.complete, false);
  assert.deepEqual(commentMismatch.missing_dimensions, ["comments"]);

  const tabularOnly = checkLinearLb1Restore(run, makeCompleteLinearLb1Fixture(), {
    artifact_kinds: ["sheet", "csv"],
  });
  assert.equal(tabularOnly.complete, false);
  assert.equal(tabularOnly.missing_dimensions.includes("immutable_revision"), true);
  assert.equal(tabularOnly.missing_dimensions.includes("tabular_export_only"), true);
});

test("actual provider and storage adapters remain feature-OFF HOLD stubs", () => {
  assert.deepEqual(LINEAR_LB1_ZERO_EFFECTS, {
    provider_calls: 0,
    storage_writes: 0,
    network_calls: 0,
    filesystem_writes: 0,
    scheduler_changes: 0,
  });
  assert.equal(HELD_LINEAR_LB1_PROVIDER_ADAPTER.authority_state, "hold");
  assert.equal(HELD_LINEAR_LB1_STORAGE_ADAPTER.authority_state, "hold");
  assert.throws(() => HELD_LINEAR_LB1_PROVIDER_ADAPTER.collect_current_snapshot(), (error) => error instanceof LinearLb1Error && error.code === "linear_lb1_provider_hold");
  assert.throws(() => HELD_LINEAR_LB1_STORAGE_ADAPTER.write_revision(), (error) => error instanceof LinearLb1Error && error.code === "linear_lb1_storage_hold");
});

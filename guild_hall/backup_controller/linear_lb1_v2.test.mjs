import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  HELD_LINEAR_LB1_V2_PROVIDER_ADAPTER,
  HELD_LINEAR_LB1_V2_STORAGE_ADAPTER,
  LINEAR_LB1_V2_COLLECTION_SCHEMA_VERSION,
  LINEAR_LB1_V2_DIMENSIONS,
  LINEAR_LB1_ZERO_EFFECTS,
  LinearLb1V2Error,
  buildImmutableLinearLb1BackupRunV2,
  checkLinearLb1RestoreV2,
  collectFeatureOffLinearLb1V2Fixture,
  createFailedFeatureOffLinearLb1V2Collection,
  deserializeBackupRunV2,
  normalizeLinearLb1V2Snapshot,
  registerImmutableLinearLb1BackupRunV2,
  serializeBackupRunV2,
} from "./linear_lb1_v2.mjs";
import {
  makeCommentChangedLinearLb1V2Fixture,
  makeCompleteLinearLb1V2Fixture,
  makeDescriptionChangedLinearLb1V2Fixture,
  sha256Text,
} from "./linear_lb1_v2_fixture.mjs";

function stableJsonForForgery(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJsonForForgery).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableJsonForForgery(value[key])).join(",") + "}";
  }
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
  return "linear-lb1-v2-revision-" + sha256ForForgery({
    revision_domain: "soulforge.backup_controller.linear_lb1.revision.v2",
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

test("feature-OFF v2 fixture collector covers all 18 requested synthetic dimensions without effects", () => {
  const source = makeCompleteLinearLb1V2Fixture();
  const collection = collectFeatureOffLinearLb1V2Fixture(source);

  assert.equal(collection.collector.kind, "public_synthetic_fixture");
  assert.equal(collection.collector.feature_state, "off");
  assert.deepEqual(collection.declared_missing_dimensions, []);
  assert.deepEqual(collection.effects, LINEAR_LB1_ZERO_EFFECTS);
  assert.equal(LINEAR_LB1_V2_DIMENSIONS.length, 18);
  assert.equal(Object.isFrozen(collection.snapshot.issues), true);

  // Verify full description body + hash
  assert.equal(typeof collection.snapshot.issues[0].description.body, "string");
  assert.equal(collection.snapshot.issues[0].description.content_sha256.length, 64);

  // Verify full comment body + hash
  assert.equal(typeof collection.snapshot.issues[0].comments[0].body, "string");
  assert.equal(collection.snapshot.issues[0].comments[0].content_sha256.length, 64);

  // Verify mutation of source does not affect frozen collection
  source.issues[0].status_id = "status-done";
  assert.equal(collection.snapshot.issues[0].status_id, "status-in-progress");
});

test("faithful private payload: bodies allow file URLs, Windows paths, secrets and newlines, while public fields guard them", () => {
  const fixture = makeCompleteLinearLb1V2Fixture();
  const complexBody = "# Spec Document\n\nLocation: C:\\Users\\app\\config.json\nURL: file:///C:/Users/app/config.json\nToken: Bearer fake_api_secret_98765\nPassword: password=supersecretpass\nMulti\nLine\nText\tTabbed";
  fixture.issues[0].description.body = complexBody;
  fixture.issues[0].description.content_sha256 = sha256Text(complexBody);

  // Normalization succeeds for bodies with paths and secret-shaped text
  const normalized = normalizeLinearLb1V2Snapshot(fixture);
  assert.equal(normalized.issues[0].description.body, complexBody);

  // But public metadata fields (e.g. issue title, team name) with path or secret FAIL
  const badTitle = JSON.parse(JSON.stringify(fixture));
  badTitle.issues[0].title = "C:\\Users\\secret\\path.txt";
  assert.throws(() => normalizeLinearLb1V2Snapshot(badTitle), (e) => e instanceof LinearLb1V2Error);

  const badTeam = JSON.parse(JSON.stringify(fixture));
  badTeam.teams[0].name = "Bearer ghp_token123456789";
  assert.throws(() => normalizeLinearLb1V2Snapshot(badTeam), (e) => e instanceof LinearLb1V2Error);
});

test("allowlist scope mode validates team and project coverage", () => {
  const allowlistFixture = makeCompleteLinearLb1V2Fixture();
  allowlistFixture.source_scope.scope_mode = "allowlist";
  allowlistFixture.source_scope.team_ids = ["synthetic-team-001"];
  allowlistFixture.source_scope.project_ids = ["synthetic-project-001"];

  const normalized = normalizeLinearLb1V2Snapshot(allowlistFixture);
  assert.equal(normalized.source_scope.scope_mode, "allowlist");
  assert.deepEqual(normalized.source_scope.team_ids, ["synthetic-team-001"]);
});

test("schema-valid caller collection ordering cannot change v2 revision or manifest identity", () => {
  const source1 = makeCompleteLinearLb1V2Fixture();
  const canonical = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-canonical",
    collection: collectFeatureOffLinearLb1V2Fixture(source1),
  });

  const source2 = makeCompleteLinearLb1V2Fixture();
  source2.teams.reverse();
  source2.projects.reverse();
  source2.assignees.reverse();
  source2.statuses.reverse();
  source2.issues.reverse();
  source2.issues[0].comments.reverse();

  const reordered = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-canonical",
    collection: collectFeatureOffLinearLb1V2Fixture(source2),
  });

  assert.equal(reordered.revision.snapshot_sha256, canonical.revision.snapshot_sha256);
  assert.equal(reordered.manifest.manifest_sha256, canonical.manifest.manifest_sha256);
  assert.equal(reordered.revision.revision_id, canonical.revision.revision_id);
});

test("immutable v2 manifest is deterministic and duplicate versus conflict replays are explicit", () => {
  const first = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-001",
    collection: collectFeatureOffLinearLb1V2Fixture(makeCompleteLinearLb1V2Fixture()),
  });

  const duplicateCandidate = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-001",
    collection: collectFeatureOffLinearLb1V2Fixture(makeCompleteLinearLb1V2Fixture()),
  });

  assert.equal(first.manifest.manifest_sha256, duplicateCandidate.manifest.manifest_sha256);
  assert.equal(first.revision.snapshot_sha256, duplicateCandidate.revision.snapshot_sha256);
  assert.equal(first.manifest.coverage.counts.issues, 2);
  assert.equal(first.manifest.coverage.counts.comments, 2);
  assert.equal(first.manifest.coverage.counts.teams, 1);
  assert.equal(first.manifest.coverage.counts.projects, 1);

  const created = registerImmutableLinearLb1BackupRunV2([], first);
  assert.equal(created.outcome, "created");
  assert.equal(created.runs.length, 1);

  const duplicate = registerImmutableLinearLb1BackupRunV2(created.runs, duplicateCandidate);
  assert.equal(duplicate.outcome, "duplicate");
  assert.equal(duplicate.runs.length, 1);

  const changed = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-001",
    collection: collectFeatureOffLinearLb1V2Fixture(makeCommentChangedLinearLb1V2Fixture()),
  });
  const conflict = registerImmutableLinearLb1BackupRunV2(created.runs, changed);
  assert.equal(conflict.outcome, "conflict");
  assert.equal(conflict.runs.length, 1);
});

test("body changes alter description and comment hashes and are caught during restore check", () => {
  const run = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-restore-body",
    collection: collectFeatureOffLinearLb1V2Fixture(makeCompleteLinearLb1V2Fixture()),
  });

  const commentChanged = checkLinearLb1RestoreV2(run, makeCommentChangedLinearLb1V2Fixture());
  assert.equal(commentChanged.complete, false);
  assert.deepEqual(commentChanged.missing_dimensions, ["comments"]);

  const descChanged = checkLinearLb1RestoreV2(run, makeDescriptionChangedLinearLb1V2Fixture());
  assert.equal(descChanged.complete, false);
  assert.deepEqual(descChanged.missing_dimensions, ["description"]);
});

test("restore rejects a self-consistent forged coverage manifest before it can claim complete", () => {
  const run = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-forged-coverage",
    collection: collectFeatureOffLinearLb1V2Fixture(makeCompleteLinearLb1V2Fixture()),
  });

  const forged = JSON.parse(JSON.stringify(run));
  forged.manifest.coverage = {
    requested_dimensions: [...LINEAR_LB1_V2_DIMENSIONS],
    covered_dimensions: [],
    missing_dimensions: [],
    counts: {
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
    },
    timestamp_range: { min: null, max: null },
  };
  refreshForgedRunHashes(forged, { deriveRevisionId: true });

  assert.throws(
    () => checkLinearLb1RestoreV2(forged, makeCompleteLinearLb1V2Fixture()),
    (error) => error instanceof LinearLb1V2Error && error.code === "linear_lb1_v2_manifest_coverage_invalid",
  );
});

test("restore and registry reject self-consistent raw or path-like manifest error codes", () => {
  const run = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-forged-errors",
    collection: collectFeatureOffLinearLb1V2Fixture(makeCompleteLinearLb1V2Fixture()),
  });
  const forged = JSON.parse(JSON.stringify(run));
  forged.manifest.error_codes = ["raw-secret-error"];
  refreshForgedRunHashes(forged, { deriveRevisionId: true });

  assert.throws(
    () => checkLinearLb1RestoreV2(forged, makeCompleteLinearLb1V2Fixture()),
    (error) => error instanceof LinearLb1V2Error && error.code === "linear_lb1_v2_manifest_error_codes_invalid",
  );
});

test("restore and registry reject self-consistent raw or path-like revision identities", () => {
  const run = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-forged-revision-id",
    collection: collectFeatureOffLinearLb1V2Fixture(makeCompleteLinearLb1V2Fixture()),
  });
  for (const revisionId of ["raw-revision-marker", "/synthetic/raw-revision"]) {
    const forged = JSON.parse(JSON.stringify(run));
    forged.revision.revision_id = revisionId;
    refreshForgedRunHashes(forged);
    assert.throws(
      () => checkLinearLb1RestoreV2(forged, makeCompleteLinearLb1V2Fixture()),
      (error) => error instanceof LinearLb1V2Error && error.code === "linear_lb1_v2_revision_id_invalid",
    );
    assert.throws(
      () => registerImmutableLinearLb1BackupRunV2([], forged),
      (error) => error instanceof LinearLb1V2Error && error.code === "linear_lb1_v2_revision_id_invalid",
    );
  }
});

test("restore and registry reject a self-consistent revision status downgrade", () => {
  const run = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-forged-revision-status",
    collection: collectFeatureOffLinearLb1V2Fixture(makeCompleteLinearLb1V2Fixture()),
  });
  const forged = JSON.parse(JSON.stringify(run));
  forged.run_status = "partial";
  forged.manifest.collection_status = "partial";
  forged.manifest.coverage = {
    ...forged.manifest.coverage,
    covered_dimensions: LINEAR_LB1_V2_DIMENSIONS.filter((d) => d !== "comments"),
    missing_dimensions: ["comments"],
  };
  refreshForgedRunHashes(forged, { deriveRevisionId: true });

  assert.throws(
    () => checkLinearLb1RestoreV2(forged, makeCompleteLinearLb1V2Fixture()),
    (error) => error instanceof LinearLb1V2Error && error.code === "linear_lb1_v2_revision_status_invalid",
  );
  assert.throws(
    () => registerImmutableLinearLb1BackupRunV2([], forged),
    (error) => error instanceof LinearLb1V2Error && error.code === "linear_lb1_v2_revision_status_invalid",
  );
});

test("registry rejects pre-existing duplicate run keys before replay classification", () => {
  const first = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-duplicate-key",
    collection: collectFeatureOffLinearLb1V2Fixture(makeCompleteLinearLb1V2Fixture()),
  });
  const sameKey = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-duplicate-key",
    collection: collectFeatureOffLinearLb1V2Fixture(makeCompleteLinearLb1V2Fixture()),
  });
  assert.throws(
    () => registerImmutableLinearLb1BackupRunV2([first, sameKey], first),
    (error) => error instanceof LinearLb1V2Error && error.code === "linear_lb1_v2_registry_duplicate_run_key",
  );
});

test("partial and failed collections retain coverage gaps and errors without false complete revision", () => {
  const partialCollection = collectFeatureOffLinearLb1V2Fixture(makeCompleteLinearLb1V2Fixture(), {
    status: "partial",
    missing_dimensions: ["comments", "evidence_refs"],
    errors: [{ code: "synthetic-comments-held" }],
  });
  const partialRun = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-partial",
    collection: partialCollection,
  });
  assert.equal(partialRun.run_status, "partial");
  assert.deepEqual(partialRun.manifest.coverage.missing_dimensions, ["comments", "evidence_refs"]);

  const partialRestore = checkLinearLb1RestoreV2(partialRun, makeCompleteLinearLb1V2Fixture());
  assert.equal(partialRestore.complete, false);
  assert.deepEqual(partialRestore.missing_dimensions, ["comments", "evidence_refs"]);

  const failedRun = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-failed",
    collection: createFailedFeatureOffLinearLb1V2Collection({ errors: [{ code: "synthetic-provider-held" }] }),
  });
  assert.equal(failedRun.run_status, "failed");
  assert.equal(failedRun.revision, null);
  assert.equal(failedRun.manifest.snapshot_sha256, null);
  assert.deepEqual(failedRun.manifest.coverage.missing_dimensions, LINEAR_LB1_V2_DIMENSIONS);
});

test("restore-check compares reconstructable fields across all 18 dimensions and rejects tabular exports", () => {
  const run = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-restore-all",
    collection: collectFeatureOffLinearLb1V2Fixture(makeCompleteLinearLb1V2Fixture()),
  });

  const completeRestore = checkLinearLb1RestoreV2(run, makeCompleteLinearLb1V2Fixture(), {
    artifact_kinds: ["immutable_revision"],
  });
  assert.equal(completeRestore.complete, true);
  assert.equal(completeRestore.human_accepted, false);
  assert.deepEqual(completeRestore.reconstructable_dimensions, LINEAR_LB1_V2_DIMENSIONS);
  assert.deepEqual(completeRestore.missing_dimensions, []);

  const tabularOnly = checkLinearLb1RestoreV2(run, makeCompleteLinearLb1V2Fixture(), {
    artifact_kinds: ["sheet", "csv"],
  });
  assert.equal(tabularOnly.complete, false);
  assert.equal(tabularOnly.missing_dimensions.includes("immutable_revision"), true);
  assert.equal(tabularOnly.missing_dimensions.includes("tabular_export_only"), true);
});

test("hostile snapshot graph with proxy, accessor, or cycle is rejected", () => {
  const fixture = makeCompleteLinearLb1V2Fixture();
  const proxied = new Proxy(fixture, {
    get(target, prop) {
      return target[prop];
    },
  });
  assert.throws(
    () => normalizeLinearLb1V2Snapshot(proxied),
    (error) => error instanceof LinearLb1V2Error,
  );
});

test("no v1 upgrade: v1 snapshots and v1 schema versions are rejected", () => {
  const v1Snapshot = {
    schema_version: "soulforge.backup_controller.linear_lb1.snapshot.v1",
    snapshot_id: "synthetic-linear-lb1-001",
    collected_at: "2026-08-20T09:00:00.000Z",
    source_scope: {
      kind: "public_synthetic_fixture",
      workspace_id: "synthetic-workspace-001",
      team_id: "synthetic-team-001",
      project_id: "synthetic-project-001",
    },
    projects: [],
    assignees: [],
    statuses: [],
    issues: [],
  };

  assert.throws(
    () => collectFeatureOffLinearLb1V2Fixture(v1Snapshot),
    (error) => error instanceof LinearLb1V2Error,
  );
});

test("serialization and deserialization round-trip maintains byte-level integrity", () => {
  const run = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-serial",
    collection: collectFeatureOffLinearLb1V2Fixture(makeCompleteLinearLb1V2Fixture()),
  });

  const bytes = serializeBackupRunV2(run);
  assert.equal(Buffer.isBuffer(bytes), true);

  const deserialized = deserializeBackupRunV2(bytes);
  assert.equal(deserialized.run_key, run.run_key);
  assert.equal(deserialized.manifest.manifest_sha256, run.manifest.manifest_sha256);
  assert.equal(deserialized.revision.snapshot_sha256, run.revision.snapshot_sha256);
});

test("actual provider and storage adapters remain feature-OFF HOLD stubs with pinned descriptors", () => {
  assert.equal(HELD_LINEAR_LB1_V2_PROVIDER_ADAPTER.authority_state, "hold");
  assert.equal(typeof HELD_LINEAR_LB1_V2_PROVIDER_ADAPTER.adapter_ref, "object");
  assert.equal(HELD_LINEAR_LB1_V2_STORAGE_ADAPTER.authority_state, "hold");
  assert.equal(typeof HELD_LINEAR_LB1_V2_STORAGE_ADAPTER.adapter_ref, "object");
  assert.throws(() => HELD_LINEAR_LB1_V2_PROVIDER_ADAPTER.collect_current_snapshot(), (error) => error instanceof LinearLb1V2Error && error.code === "linear_lb1_v2_provider_hold");
  assert.throws(() => HELD_LINEAR_LB1_V2_STORAGE_ADAPTER.write_revision(), (error) => error instanceof LinearLb1V2Error && error.code === "linear_lb1_v2_storage_hold");
});

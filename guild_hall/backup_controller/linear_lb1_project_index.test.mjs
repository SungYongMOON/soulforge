import assert from "node:assert/strict";
import test from "node:test";

import { makeCompleteLinearLb1V2Fixture } from "./linear_lb1_v2_fixture.mjs";
import {
  buildLinearLb1ProjectIndex,
  verifyLinearLb1ProjectIndex,
} from "./linear_lb1_project_index.mjs";

const SOURCE_DIGEST = `sha256:${"a".repeat(64)}`;
const MANIFEST_DIGEST = `sha256:${"b".repeat(64)}`;
const binding = Object.freeze({
  source_generation_digest: SOURCE_DIGEST,
  source_manifest_sha256: MANIFEST_DIGEST,
});

function multiProjectFixture() {
  const fixture = structuredClone(makeCompleteLinearLb1V2Fixture());
  fixture.projects.push({
    project_id: "synthetic-project-empty",
    name: "Empty Project Still Cataloged",
    team_id: "synthetic-team-001",
    updated_at: "2026-08-20T08:00:00.000Z",
  });
  fixture.issues[1].project_id = null;
  fixture.issues[1].project_history = [];
  return fixture;
}

test("entire workspace is indexed into every catalog project plus an unassigned bucket", () => {
  const index = buildLinearLb1ProjectIndex(multiProjectFixture(), binding);
  assert.equal(index.project_count, 2);
  assert.equal(index.total_issue_count, 2);
  assert.equal(index.classified_issue_count, 1);
  assert.equal(index.unassigned_issue_count, 1);
  assert.deepEqual(index.projects.map((entry) => [entry.project_id, entry.issue_count]), [
    ["synthetic-project-001", 1],
    ["synthetic-project-empty", 0],
  ]);
  assert.deepEqual(index.unassigned.issue_ids, ["issue-002"]);
  assert.equal(index.source_generation_digest, SOURCE_DIGEST);
  assert.equal(index.source_manifest_sha256, MANIFEST_DIGEST);
});

test("project paths use stable digest keys, not mutable project names", () => {
  const fixture = multiProjectFixture();
  const first = buildLinearLb1ProjectIndex(fixture, binding);
  fixture.projects[0].name = "Renamed Display Label";
  fixture.projects[0].updated_at = "2026-08-20T08:30:00.000Z";
  const renamed = buildLinearLb1ProjectIndex(fixture, binding);
  assert.equal(first.projects[0].project_storage_key, renamed.projects[0].project_storage_key);
  assert.equal(first.projects[0].project_storage_key.includes("Core"), false);
  assert.match(first.projects[0].project_storage_key, /^project-[a-f0-9]{32}$/u);
  assert.notEqual(first.project_index_sha256, renamed.project_index_sha256,
    "display metadata remains revision-sensitive even though the storage key is stable");
});

test("the index stores refs and counts only, never issue descriptions or comments", () => {
  const fixture = multiProjectFixture();
  const index = buildLinearLb1ProjectIndex(fixture, binding);
  const text = JSON.stringify(index);
  assert.equal(text.includes(fixture.issues[0].description.body), false);
  assert.equal(text.includes(fixture.issues[0].comments[0].body), false);
  assert.equal(text.includes("description"), false);
  assert.equal(text.includes("comments"), false);
});

test("the index is deterministic, deeply frozen, and exact-snapshot verifiable", () => {
  const fixture = multiProjectFixture();
  const first = buildLinearLb1ProjectIndex(fixture, binding);
  const second = buildLinearLb1ProjectIndex(structuredClone(fixture), { ...binding });
  assert.deepEqual(second, first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.projects[0].issue_ids), true);
  assert.equal(verifyLinearLb1ProjectIndex(first, fixture, binding), true);
  const tampered = structuredClone(first);
  tampered.projects[0].issue_ids = [];
  assert.equal(verifyLinearLb1ProjectIndex(tampered, fixture, binding), false);
});

test("allowlist snapshots, invalid bindings, and hostile inputs fail closed", () => {
  const allowlist = multiProjectFixture();
  allowlist.source_scope.scope_mode = "allowlist";
  allowlist.source_scope.project_ids = ["synthetic-project-001"];
  assert.throws(() => buildLinearLb1ProjectIndex(allowlist, binding), /workspace_scope_required/u);
  assert.throws(() => buildLinearLb1ProjectIndex(multiProjectFixture(), {
    ...binding, source_generation_digest: "not-a-digest",
  }), /binding_invalid/u);
  const hostile = new Proxy({}, { ownKeys() { throw new Error("trap"); } });
  assert.throws(() => buildLinearLb1ProjectIndex(hostile, binding), /snapshot_invalid/u);
  assert.equal(verifyLinearLb1ProjectIndex(hostile, multiProjectFixture(), binding), false);
});

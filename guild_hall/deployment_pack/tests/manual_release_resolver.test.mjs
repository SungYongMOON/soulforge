import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RUNBOOK_CATALOG } from "../src/deployment_pack_contract.mjs";
import {
  MANUAL_RELEASE_CATALOG_SCHEMA,
  isReleaseVersionCompatible,
  resolveManualRelease,
  validateManualReleaseCatalog,
} from "../src/manual_release_resolver.mjs";

const MODULE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_PATH = join(MODULE_ROOT, "manuals", "manual_release_catalog.v0.json");

function catalog() {
  return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
}

function readyCatalog() {
  const candidate = catalog();
  candidate.catalog_state = "ready";
  candidate.manuals = candidate.manuals.map((manual, index) => ({
    ...manual,
    state: "ready",
    artifact_ref: `artifact.manual.${manual.semantic_role}.v0_1_0`,
    content_digest: `sha256:${String(index % 10).repeat(64)}`,
    compatibility_range: ">=0.1.0 <1.0.0",
    last_verified_release: "0.1.0",
    stale_state: "current",
    exercise_receipt_ref: `receipt.exercise.${manual.semantic_role}.v0_1_0`,
  }));
  return candidate;
}

function hppRequest(overrides = {}) {
  return {
    pack_id: "hpp_server_pack",
    version: "0.1.0",
    install_manual_ref: "manual.install.hpp_server_pack",
    upgrade_manual_ref: "manual.upgrade.hpp_server_pack",
    rollback_manual_ref: "manual.rollback.hpp_server_pack",
    ...overrides,
  };
}

function hppManual(candidate) {
  return candidate.manuals.find((manual) => manual.semantic_role === "hpp_server_operator");
}

test("the tracked public catalog keeps all 16 semantic rows visible without inventing a completed manual", () => {
  const tracked = catalog();
  assert.equal(tracked.schema, MANUAL_RELEASE_CATALOG_SCHEMA);
  assert.equal(tracked.catalog_version, "0.1.0");
  assert.equal(tracked.catalog_state, "release_hold");
  assert.deepEqual(tracked.manuals.map((manual) => manual.semantic_role), RUNBOOK_CATALOG);
  assert.deepEqual(validateManualReleaseCatalog(tracked), { ok: true, problems: [] });
  for (const manual of tracked.manuals) {
    assert.equal(manual.state, "hold", manual.semantic_role);
    assert.equal(manual.artifact_ref, null, manual.semantic_role);
    assert.equal(manual.content_digest, null, manual.semantic_role);
    assert.equal(manual.stale_state, "manual_absent", manual.semantic_role);
    assert.equal(manual.exercise_receipt_ref, null, manual.semantic_role);
  }
});

test("the resolver maps explicit draft-manifest procedure refs, but the tracked HOLD catalog stops release claims", () => {
  const result = resolveManualRelease(catalog(), hppRequest());
  assert.equal(result.ok, false);
  assert.equal(result.status, "hold");
  for (const expected of ["catalog_release_hold", "manual_absent"]) {
    assert.equal(result.problems.includes(expected), true, expected);
  }
  assert.deepEqual(result.required_roles, ["hpp_server_operator"]);
  assert.deepEqual(result.resolutions.map((resolution) => resolution.procedure_ref), [
    "manual.install.hpp_server_pack",
    "manual.upgrade.hpp_server_pack",
    "manual.rollback.hpp_server_pack",
  ]);
  for (const resolution of result.resolutions) {
    assert.equal(resolution.semantic_role, "hpp_server_operator");
    assert.equal(resolution.artifact_ref, null);
    assert.equal(resolution.content_digest, null);
    assert.equal(resolution.stale_state, "manual_absent");
  }
});

test("a fully verified synthetic catalog resolves opaque procedure refs to the release artifact and exercise evidence", () => {
  const fixture = readyCatalog();
  const before = JSON.stringify(fixture);
  assert.deepEqual(validateManualReleaseCatalog(fixture), { ok: true, problems: [] });
  const result = resolveManualRelease(fixture, hppRequest());
  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.resolutions.length, 3);
  for (const resolution of result.resolutions) {
    assert.equal(resolution.semantic_role, "hpp_server_operator");
    assert.equal(resolution.artifact_ref, "artifact.manual.hpp_server_operator.v0_1_0");
    assert.match(resolution.content_digest, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(resolution.compatibility_range, ">=0.1.0 <1.0.0");
    assert.equal(resolution.last_verified_release, "0.1.0");
    assert.equal(resolution.stale_state, "current");
    assert.equal(resolution.exercise_receipt_ref, "receipt.exercise.hpp_server_operator.v0_1_0");
  }
  assert.equal(JSON.stringify(fixture), before, "the pure resolver does not mutate the catalog input");
  assert.equal(isReleaseVersionCompatible("0.1.0", ">=0.1.0 <1.0.0"), true);
  assert.equal(isReleaseVersionCompatible("1.0.0", ">=0.1.0 <1.0.0"), false);
});

test("hostile catalog and request states fail closed for digest, version, mapping, stale, absent, compatibility, exercise, and required-role gaps", () => {
  const malformed = readyCatalog();
  malformed.manuals[0] = null;
  assert.doesNotThrow(() => validateManualReleaseCatalog(malformed));
  assert.equal(validateManualReleaseCatalog(malformed).problems.includes("manual_shape_invalid"), true);

  const digestInvalid = readyCatalog();
  hppManual(digestInvalid).content_digest = "sha256:not-a-digest";
  assert.equal(validateManualReleaseCatalog(digestInvalid).problems.includes("manual_content_digest_invalid"), true);
  assert.equal(resolveManualRelease(digestInvalid, hppRequest()).ok, false);

  const invalidVersion = resolveManualRelease(readyCatalog(), hppRequest({ version: "0.1" }));
  assert.equal(invalidVersion.problems.includes("release_version_invalid"), true);

  const incompatible = readyCatalog();
  hppManual(incompatible).compatibility_range = ">=0.2.0 <1.0.0";
  assert.equal(resolveManualRelease(incompatible, hppRequest()).problems.includes("release_incompatible"), true);

  const stale = readyCatalog();
  hppManual(stale).stale_state = "stale";
  assert.equal(resolveManualRelease(stale, hppRequest()).problems.includes("manual_stale"), true);

  const noExercise = readyCatalog();
  hppManual(noExercise).exercise_receipt_ref = null;
  assert.deepEqual(validateManualReleaseCatalog(noExercise), { ok: true, problems: [] });
  assert.equal(resolveManualRelease(noExercise, hppRequest()).problems.includes("manual_exercise_missing"), true);

  const unmapped = resolveManualRelease(readyCatalog(), {
    pack_id: "hpp_server_pack",
    version: "0.1.0",
    procedure_refs: ["manual.unknown.hpp_server_pack"],
  });
  assert.equal(unmapped.problems.includes("procedure_mapping_missing"), true);
  assert.equal(unmapped.problems.includes("required_role_unresolved"), true);

  const roleGap = resolveManualRelease(readyCatalog(), hppRequest({
    required_roles: ["path_registry_resolver"],
  }));
  assert.equal(roleGap.problems.includes("required_role_unresolved"), true);

  const publicUnsafe = readyCatalog();
  hppManual(publicUnsafe).artifact_ref = "artifact.password-material";
  assert.equal(validateManualReleaseCatalog(publicUnsafe).problems.includes("catalog_public_material_forbidden"), true);

  const localPath = readyCatalog();
  hppManual(localPath).artifact_ref = "c" + ":/local-artifact";
  assert.equal(validateManualReleaseCatalog(localPath).problems.includes("manual_artifact_ref_invalid"), true);
  assert.equal(validateManualReleaseCatalog(localPath).problems.includes("catalog_local_path_forbidden"), true);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE,
  ACTUAL_SHADOW_NATIVE_OCCURRENCE_TYPE_BY_HISTORY_LANE,
} from "../../../../guild_hall/shared/project_history_actual_shadow.mjs";
import {
  PROJECT_HISTORY_LANES,
  canonicalJson,
  sha256Canonical,
} from "../../../../guild_hall/shared/project_history_envelope.mjs";
import {
  PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION,
  PROJECT_HISTORY_SHADOW_ADAPTER_AUTHORITY_RECORD_SCHEMA_VERSION,
  STAGING_RECEIPT_SCHEMA_VERSION,
} from "../../../../guild_hall/shared/project_history_receipt_adapter_v2.mjs";
import {
  createProjectHistoryCopyBinding,
  resolveProjectHistoryCopyArtifactPaths,
  writeProjectHistoryCopyBinding,
} from "../tools/project_history_copy_binding.mjs";
import {
  runProjectHistoryCopyOneShot,
} from "../tools/project_history_copy_one_shot.mjs";

const windowsPathLockTest = process.platform === "win32"
  ? test
  : (name, fn) => test(name, { skip: "requires the Windows identity-bound path lock" }, fn);

function ref(entityType, ownerSurface, entityId) {
  return { entity_type: entityType, owner_surface: ownerSurface, entity_id: entityId };
}

function bareDigest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function byteDigest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stagingIdentity(lane, owner, key) {
  return createHash("sha256")
    .update("soulforge.ingress.source_identity.v1\0", "utf8")
    .update(lane, "utf8")
    .update("\0", "utf8")
    .update(owner, "utf8")
    .update("\0", "utf8")
    .update(key, "utf8")
    .digest("hex");
}

function databaseDigest(dbPath) {
  return byteDigest(readFileSync(dbPath));
}

function createFixture(t, { authorityExpiresInMs = null } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "sf-ph-one-shot-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const receiptRoot = path.join(root, "private-receipts");
  const dbPath = path.join(root, "pilot-copy.sqlite");
  const projectionRoot = path.join(root, "artifacts");
  const bindingPath = path.join(root, "private-binding.json");
  const requestPath = path.join(root, "private-adapter-request.json");
  const authorityPath = path.join(root, "private-shadow-authority.json");
  mkdirSync(projectionRoot);

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE accepted_project_history_current (
      pointer_name TEXT PRIMARY KEY,
      generation_id TEXT NOT NULL
    ) STRICT;
    INSERT INTO accepted_project_history_current VALUES ('accepted', 'accepted-history-sentinel');
  `);
  db.close();

  const projectRef = ref("project", "private_project_registry", "project:p26-016");
  const sourceOwners = Object.fromEntries(PROJECT_HISTORY_LANES.map((lane) => [
    lane,
    ref("source_owner", "private_source_registry", `owner_${lane}`),
  ]));
  const receiptRelativePaths = [];
  const occurrences = PROJECT_HISTORY_LANES.map((lane, index) => {
    const suffix = String(index + 1).padStart(2, "0");
    const custodyLane = ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE[lane];
    const sourceKey = `${lane}_${suffix}`;
    const sourceDigest = bareDigest(`synthetic-one-shot-source:${lane}`);
    const receipt = {
      schema_version: STAGING_RECEIPT_SCHEMA_VERSION,
      lane: custodyLane,
      source_owner_ref: sourceOwners[lane].entity_id,
      source_key: sourceKey,
      source_identity_digest: stagingIdentity(custodyLane, sourceOwners[lane].entity_id, sourceKey),
      sha256: sourceDigest,
      size: 31 + index,
      storage_ref: `ingress/${custodyLane}/${sourceDigest}`,
      checkpoint_ref: `state/checkpoints/${custodyLane}/${sourceDigest}.json`,
      project_state: "unclassified",
      source_deleted: false,
      source_overwritten: false,
    };
    const receiptBytes = Buffer.from(`${canonicalJson(receipt)}\n`, "utf8");
    const receiptRelativePath = `receipts/${lane}/${suffix}.json`;
    const receiptPath = path.join(receiptRoot, ...receiptRelativePath.split("/"));
    mkdirSync(path.dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, receiptBytes);
    receiptRelativePaths.push(receiptRelativePath);
    return {
      lane,
      project_ref: projectRef,
      receipt_path: receiptRelativePath,
      expected_receipt_digest: byteDigest(receiptBytes),
      custody_receipt_ref: ref("custody_receipt", "private_custody_registry", `receipt:${lane}:${suffix}`),
      source_owner_ref: sourceOwners[lane],
      native_occurrence_ref: ref(
        ACTUAL_SHADOW_NATIVE_OCCURRENCE_TYPE_BY_HISTORY_LANE[lane],
        `private_${lane}_owner`,
        `native:${lane}:${suffix}`,
      ),
      event_ref: ref("event", "private_shadow_writer", `event:${lane}:${suffix}`),
      source_revision_ref: ref("source_revision", `private_${lane}_owner`, `revision:${lane}:${suffix}`),
      content_ref: ref("content", "private_content_registry", `sha256:${sourceDigest}`),
      event_at: `2026-07-20T00:01:${suffix}.000Z`,
      valid_at: `2026-07-20T00:01:${suffix}.000Z`,
      observed_at: `2026-07-20T00:04:${suffix}.000Z`,
      known_at: `2026-07-20T00:03:${suffix}.000Z`,
      recorded_at: `2026-07-20T00:02:${suffix}.000Z`,
      classification_evidence_ref: ref(
        "classification_evidence",
        "private_shadow_classifier",
        `classification:${lane}:${suffix}`,
      ),
    };
  });

  const dynamicAuthority = authorityExpiresInMs === null ? null : {
    issued_at: new Date(Date.now() - 5_000).toISOString(),
    generated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + authorityExpiresInMs).toISOString(),
  };
  const request = {
    schema_version: PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION,
    feature_state: "off",
    generation_id: "generation:p26-016:one-shot:001",
    generated_at: dynamicAuthority?.generated_at ?? "2026-07-20T12:00:00.000Z",
    receipt_root: receiptRoot,
    project_ref: projectRef,
    window_start: "2026-07-20T00:00:00.000Z",
    window_end: "2026-07-21T00:00:00.000Z",
    classification_state: "shadow",
    required_writer_epoch: 7,
    writer_authority: {
      epoch: 7,
      digest: sha256Canonical({ writer: "synthetic-one-shot", epoch: 7 }),
      node_id: "synthetic-one-shot-node",
      issued_at: dynamicAuthority?.issued_at ?? "2026-07-20T00:00:00.000Z",
      expires_at: dynamicAuthority?.expires_at ?? "2100-07-21T00:00:00.000Z",
      revoked: false,
    },
    coverage: PROJECT_HISTORY_LANES.map((lane) => ({
      lane,
      source_owner_ref: sourceOwners[lane],
      project_ref: projectRef,
      state: "complete_with_events",
      gap_codes: [],
    })),
    occurrences,
    raw_payload_copied: false,
    accepted_history: false,
  };
  const authorityRecord = {
    schema_version: PROJECT_HISTORY_SHADOW_ADAPTER_AUTHORITY_RECORD_SCHEMA_VERSION,
    authority_scope: "project_history_shadow_adapter",
    feature_state: "off",
    classification_state: "shadow",
    epoch: request.writer_authority.epoch,
    node_id: request.writer_authority.node_id,
    not_before: request.writer_authority.issued_at,
    expires_at: request.writer_authority.expires_at,
    revoked: false,
    owner_approval_ref: ref("owner_approval", "private_project_history_authority", "approval:synthetic-one-shot"),
    classification_epoch: null,
    projector_epoch: null,
    production_authority_granted: false,
    raw_ingress_authority_reused: false,
    accepted_history: false,
  };
  const authorityBytes = Buffer.from(`${canonicalJson(authorityRecord)}\n`, "utf8");
  const authorityDigest = byteDigest(authorityBytes);
  request.writer_authority.digest = authorityDigest;
  writeFileSync(authorityPath, authorityBytes);
  writeFileSync(requestPath, `${canonicalJson(request)}\n`, "utf8");
  const binding = createProjectHistoryCopyBinding({
    dbPath,
    projectionRoot,
    allowedProjectIds: [projectRef.entity_id],
  });
  writeProjectHistoryCopyBinding(bindingPath, binding);
  const artifactPaths = resolveProjectHistoryCopyArtifactPaths(binding, {
    projectId: projectRef.entity_id,
    generationId: request.generation_id,
  });
  return {
    root,
    receiptRoot,
    receiptRelativePaths,
    dbPath,
    projectionRoot,
    bindingPath,
    requestPath,
    authorityPath,
    authorityBytes,
    authorityDigest,
    request,
    binding,
    artifactPaths,
  };
}

async function runPilotCopy(fixture, projectionTestHooks = null) {
  return runProjectHistoryCopyOneShot({
    request: fixture.request,
    authorityPath: fixture.authorityPath,
    authorityDigest: fixture.authorityDigest,
    bindingPath: fixture.bindingPath,
    bindingDigest: fixture.binding.binding_digest,
    pilotCopy: true,
    projectionTestHooks,
  });
}

test("one-shot defaults to a locator-free dry run without changing the copied DB", async (t) => {
  const fixture = createFixture(t);
  const before = databaseDigest(fixture.dbPath);
  const result = await runProjectHistoryCopyOneShot({
    request: fixture.request,
    authorityPath: fixture.authorityPath,
    authorityDigest: fixture.authorityDigest,
    bindingPath: fixture.bindingPath,
    bindingDigest: fixture.binding.binding_digest,
  });
  assert.equal(result.mode, "dry_run");
  assert.equal(result.status, "dry_run_validated");
  assert.equal(result.event_count, 5);
  assert.equal(result.coverage_count, 5);
  assert.equal(result.raw_payload_copied, false);
  assert.equal(result.accepted_history, false);
  assert.equal(databaseDigest(fixture.dbPath), before);
  assert.equal(existsSync(fixture.artifactPaths.directory), false);
  const serialized = JSON.stringify(result);
  for (const locator of [
    fixture.root,
    fixture.receiptRoot,
    ...fixture.receiptRelativePaths,
    fixture.dbPath,
    fixture.bindingPath,
    fixture.authorityPath,
  ]) assert.equal(serialized.includes(locator), false);
});

test("one-shot refuses missing authority evidence and authority replacement before projection", async (t) => {
  const missing = createFixture(t);
  await assert.rejects(
    runProjectHistoryCopyOneShot({
      request: missing.request,
      bindingPath: missing.bindingPath,
      bindingDigest: missing.binding.binding_digest,
    }),
    (error) => error.code === "authority_path_required",
  );
  await assert.rejects(
    runProjectHistoryCopyOneShot({
      request: missing.request,
      authorityPath: missing.authorityPath,
      bindingPath: missing.bindingPath,
      bindingDigest: missing.binding.binding_digest,
    }),
    (error) => error.code === "authority_digest_required",
  );

  const raced = createFixture(t);
  const before = databaseDigest(raced.dbPath);
  await assert.rejects(
    runProjectHistoryCopyOneShot({
      request: raced.request,
      authorityPath: raced.authorityPath,
      authorityDigest: raced.authorityDigest,
      bindingPath: raced.bindingPath,
      bindingDigest: raced.binding.binding_digest,
      beforeProjectionAuthorityRecheck: async () => {
        renameSync(raced.authorityPath, `${raced.authorityPath}.old`);
        writeFileSync(raced.authorityPath, raced.authorityBytes);
      },
    }),
    (error) => error.code === "shadow_authority_identity_changed",
  );
  assert.equal(databaseDigest(raced.dbPath), before);
  assert.equal(existsSync(raced.artifactPaths.directory), false);
});

test("authorized one-shot rejects a binding that authorizes more than one project", async (t) => {
  const fixture = createFixture(t);
  const binding = createProjectHistoryCopyBinding({
    dbPath: fixture.dbPath,
    projectionRoot: fixture.projectionRoot,
    allowedProjectIds: [fixture.request.project_ref.entity_id, "project:other"],
  });
  writeProjectHistoryCopyBinding(fixture.bindingPath, binding, { overwrite: true });
  await assert.rejects(
    runProjectHistoryCopyOneShot({
      request: fixture.request,
      authorityPath: fixture.authorityPath,
      authorityDigest: fixture.authorityDigest,
      bindingPath: fixture.bindingPath,
      bindingDigest: binding.binding_digest,
    }),
    (error) => error.code === "one_shot_single_project_binding_required",
  );
  assert.equal(existsSync(fixture.artifactPaths.directory), false);
});

windowsPathLockTest("explicit pilot-copy one-shot generates DB, CSV, XLSX/readback, and verifier evidence", (t) => {
  const fixture = createFixture(t);
  const toolPath = fileURLToPath(new URL("../tools/project_history_copy_one_shot.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [
    toolPath,
    "--request", fixture.requestPath,
    "--authority", fixture.authorityPath,
    "--authority-digest", fixture.authorityDigest,
    "--binding", fixture.bindingPath,
    "--binding-digest", fixture.binding.binding_digest,
    "--pilot-copy",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.mode, "pilot_copy");
  assert.equal(receipt.status, "verified_insert");
  assert.equal(receipt.query_only_verification, true);
  assert.equal(receipt.db_csv_parity, true);
  assert.equal(receipt.db_xlsx_input_parity, true);
  assert.equal(receipt.db_xlsx_parity, true);
  assert.equal(receipt.xlsx_readback, "verified_from_workbook");
  assert.equal(receipt.raw_payload_copied, false);
  assert.equal(receipt.accepted_history, false);
  for (const locator of [
    fixture.root,
    fixture.receiptRoot,
    ...fixture.receiptRelativePaths,
    fixture.dbPath,
    fixture.bindingPath,
    fixture.authorityPath,
  ]) assert.equal(`${result.stdout}${result.stderr}`.includes(locator), false);
  for (const artifactPath of [
    fixture.artifactPaths.csvPath,
    fixture.artifactPaths.xlsxInputPath,
    fixture.artifactPaths.xlsxPath,
    fixture.artifactPaths.xlsxReadbackPath,
    fixture.artifactPaths.artifactManifestPath,
  ]) assert.equal(existsSync(artifactPath), true);
  const manifest = JSON.parse(readFileSync(fixture.artifactPaths.artifactManifestPath, "utf8"));
  assert.equal(manifest.artifact_manifest_digest, receipt.artifact_manifest_digest);

  const db = new DatabaseSync(fixture.dbPath, { readOnly: true });
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_generation").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_event").get().count, 5);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_coverage").get().count, 5);
    assert.equal(
      db.prepare("SELECT generation_id FROM accepted_project_history_current").get().generation_id,
      "accepted-history-sentinel",
    );
  } finally {
    db.close();
  }
});

windowsPathLockTest("one-shot replays the identical binding and request after final bundle rename failure", async (t) => {
  const fixture = createFixture(t);
  await assert.rejects(
    runPilotCopy(fixture, {
      beforeArtifactBundlePublish() {
        const error = new Error("synthetic final rename failure");
        error.code = "synthetic_final_rename_failure";
        throw error;
      },
    }),
    (error) => error.code === "synthetic_final_rename_failure",
  );
  assert.equal(existsSync(fixture.artifactPaths.directory), false);

  const replayed = await runPilotCopy(fixture);
  assert.equal(replayed.status, "verified_replay");
  assert.equal(replayed.binding_digest, fixture.binding.binding_digest);
  const db = new DatabaseSync(fixture.dbPath, { readOnly: true });
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_generation").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_publication_outbox").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_publication_replay_guard").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_publication_receipt").get().count, 1);
  } finally {
    db.close();
  }
});

windowsPathLockTest("one-shot replays the identical binding and request after a post-manifest crash", async (t) => {
  const fixture = createFixture(t);
  await assert.rejects(
    runPilotCopy(fixture, {
      afterArtifactManifestPublish() {
        const error = new Error("synthetic post-manifest crash");
        error.code = "synthetic_post_manifest_crash";
        throw error;
      },
    }),
    (error) => error.code === "synthetic_post_manifest_crash",
  );
  assert.equal(existsSync(fixture.artifactPaths.artifactManifestPath), true);

  const replayed = await runPilotCopy(fixture);
  assert.equal(replayed.status, "verified_replay");
  assert.equal(replayed.binding_digest, fixture.binding.binding_digest);
});

windowsPathLockTest("pending same-binding replay rejects unrelated DB mutation, guard tamper, and authority expiry", async (t) => {
  await t.test("unrelated DB mutation", async (t) => {
    const fixture = createFixture(t);
    await assert.rejects(
      runPilotCopy(fixture, {
        beforeArtifactBundlePublish() {
          const error = new Error("synthetic final rename failure");
          error.code = "synthetic_final_rename_failure";
          throw error;
        },
      }),
      (error) => error.code === "synthetic_final_rename_failure",
    );
    const db = new DatabaseSync(fixture.dbPath);
    try {
      db.exec("UPDATE accepted_project_history_current SET generation_id = 'unrelated-change'");
    } finally {
      db.close();
    }
    await assert.rejects(
      runPilotCopy(fixture),
      (error) => error.code === "pending_replay_database_state_mismatch",
    );
  });

  await t.test("replay-guard tamper", async (t) => {
    const fixture = createFixture(t);
    await assert.rejects(
      runPilotCopy(fixture, {
        beforeArtifactBundlePublish() {
          const error = new Error("synthetic final rename failure");
          error.code = "synthetic_final_rename_failure";
          throw error;
        },
      }),
      (error) => error.code === "synthetic_final_rename_failure",
    );
    const db = new DatabaseSync(fixture.dbPath);
    try {
      db.exec(`
        DROP TRIGGER project_history_publication_replay_guard_no_update;
        UPDATE project_history_publication_replay_guard
           SET binding_digest = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      `);
    } finally {
      db.close();
    }
    await assert.rejects(
      runPilotCopy(fixture),
      (error) => ["projection_schema_conflict", "pending_replay_guard_conflict"].includes(error.code),
    );
  });

  await t.test("authority expiry", async (t) => {
    const fixture = createFixture(t, { authorityExpiresInMs: 300_000 });
    await assert.rejects(
      runPilotCopy(fixture, {
        beforeArtifactBundlePublish() {
          const error = new Error("synthetic final rename failure");
          error.code = "synthetic_final_rename_failure";
          throw error;
        },
      }),
      (error) => error.code === "synthetic_final_rename_failure",
    );
    const realDateNow = Date.now;
    Date.now = () => Date.parse(fixture.request.writer_authority.expires_at);
    try {
      await assert.rejects(
        runPilotCopy(fixture),
        (error) => error.code === "stale_writer_authority",
      );
    } finally {
      Date.now = realDateNow;
    }
  });
});

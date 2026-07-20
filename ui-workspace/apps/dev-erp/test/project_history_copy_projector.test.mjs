import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION,
} from "../../../../guild_hall/shared/project_history_actual_shadow.mjs";
import {
  PROJECT_HISTORY_LANES,
  sha256Canonical,
} from "../../../../guild_hall/shared/project_history_envelope.mjs";
import {
  PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION,
  PROJECT_HISTORY_SHADOW_ADAPTER_AUTHORITY_RECORD_SCHEMA_VERSION,
  openProjectHistoryShadowAdapterAuthorityV1,
} from "../../../../guild_hall/shared/project_history_receipt_adapter_v2.mjs";
import {
  buildSyntheticFiveLaneShadowFixture,
  buildSyntheticH06CoverageFixture,
} from "../../../../guild_hall/shared/project_history_readiness.mjs";
import {
  PROJECT_HISTORY_COPY_COLUMNS,
  PROJECT_HISTORY_COPY_PROJECTION_CLAIM_CEILING,
  inspectStandaloneSqliteCopy,
  productionLookingPathReasons,
  projectCopiedErpHistory,
  protectSpreadsheetFormula,
} from "../tools/project_history_copy_projector.mjs";
import {
  verifyCopiedProjectHistoryProjection,
} from "../tools/project_history_copy_verifier.mjs";
import {
  createProjectHistoryCopyBinding,
  resolveProjectHistoryCopyArtifactPaths,
  writeProjectHistoryCopyBinding,
} from "../tools/project_history_copy_binding.mjs";

const TEST_WAIT_CELL = new Int32Array(new SharedArrayBuffer(4));

function makeGeneration(overrides = {}) {
  const shadow = buildSyntheticFiveLaneShadowFixture();
  const coverage = buildSyntheticH06CoverageFixture(shadow.envelopes);
  return {
    schema_version: ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION,
    generation_id: "-copied-erp-shadow-generation",
    project_ref: shadow.project_ref,
    classification_state: "shadow",
    envelopes: shadow.envelopes,
    coverage_receipts: coverage.receipts,
    ordered_event_digest: sha256Canonical(shadow.envelopes.map((envelope) => envelope.metadata_digest)),
    source_attestation_digest: sha256Canonical({ source: "synthetic-copy-attestation" }),
    raw_payload_copied: false,
    accepted_history: false,
    ...overrides,
  };
}

function createCopiedDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE accepted_project_history_current (
        pointer_name TEXT PRIMARY KEY,
        generation_id TEXT NOT NULL
      ) STRICT;
      INSERT INTO accepted_project_history_current VALUES ('accepted', 'production-generation-sentinel');
    `);
  } finally {
    db.close();
  }
}

function authorityRef(entityType, ownerSurface, entityId) {
  return { entity_type: entityType, owner_surface: ownerSurface, entity_id: entityId };
}

function createAuthorityCapability(root, projectRef, { expiresInMs = 60 * 60 * 1000 } = {}) {
  const now = Date.now();
  const issuedAt = new Date(now - 60 * 60 * 1000).toISOString();
  const expiresAt = new Date(now + expiresInMs).toISOString();
  const request = {
    schema_version: PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION,
    feature_state: "off",
    generation_id: "generation:projector-authority:test",
    generated_at: new Date(now).toISOString(),
    receipt_root: path.resolve(root),
    project_ref: projectRef,
    window_start: new Date(now - 1000).toISOString(),
    window_end: new Date(now + 1000).toISOString(),
    classification_state: "shadow",
    required_writer_epoch: 11,
    writer_authority: {
      epoch: 11,
      digest: sha256Canonical({ pending: true }),
      node_id: "projector-test-node",
      issued_at: issuedAt,
      expires_at: expiresAt,
      revoked: false,
    },
    coverage: PROJECT_HISTORY_LANES.map((lane) => ({
      lane,
      source_owner_ref: authorityRef("source_owner", "private_projector_test", `owner-${lane}`),
      project_ref: projectRef,
      state: "complete_no_events",
      gap_codes: [],
    })),
    occurrences: [],
    raw_payload_copied: false,
    accepted_history: false,
  };
  const record = {
    schema_version: PROJECT_HISTORY_SHADOW_ADAPTER_AUTHORITY_RECORD_SCHEMA_VERSION,
    authority_scope: "project_history_shadow_adapter",
    feature_state: "off",
    classification_state: "shadow",
    epoch: 11,
    node_id: "projector-test-node",
    not_before: issuedAt,
    expires_at: expiresAt,
    revoked: false,
    owner_approval_ref: authorityRef(
      "owner_approval",
      "private_projector_authority",
      "approval:projector-test",
    ),
    classification_epoch: null,
    projector_epoch: null,
    production_authority_granted: false,
    raw_ingress_authority_reused: false,
    accepted_history: false,
  };
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
  const authorityPath = path.join(root, "private-projector-authority.json");
  writeFileSync(authorityPath, bytes);
  const authorityDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  request.writer_authority.digest = authorityDigest;
  return Object.freeze({
    authorityPath,
    authorityDigest,
    bytes,
    record,
    request,
    authoritySnapshot: openProjectHistoryShadowAdapterAuthorityV1({
      authorityPath,
      authorityDigest,
      request,
    }),
  });
}

function makeFixture(
  t,
  directoryName = "copy",
  { bind = true, authorityOptions = {} } = {},
) {
  const root = mkdtempSync(path.join(os.tmpdir(), "soulforge-ph-copy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, directoryName);
  const dbPath = path.join(directory, "pilot-copy.sqlite");
  const projectionRoot = path.join(root, "artifacts");
  const bindingPath = path.join(root, "private-binding.json");
  const parent = path.dirname(dbPath);
  mkdirSync(parent, { recursive: true });
  mkdirSync(projectionRoot, { recursive: true });
  createCopiedDatabase(dbPath);
  const authority = createAuthorityCapability(
    root,
    makeGeneration().project_ref,
    authorityOptions,
  );
  const fixture = {
    root,
    dbPath,
    projectionRoot,
    bindingPath,
    authoritySnapshot: authority.authoritySnapshot,
    authority,
  };
  if (!bind) return fixture;
  return refreshBinding(fixture);
}

function waitUntilAuthorityExpires(authority) {
  const expiresAt = Date.parse(authority.record.expires_at);
  while (Date.now() < expiresAt + 25) {
    Atomics.wait(TEST_WAIT_CELL, 0, 0, Math.min(50, expiresAt + 25 - Date.now()));
  }
}

function refreshBinding(fixture) {
  const generation = makeGeneration();
  const binding = createProjectHistoryCopyBinding({
    dbPath: fixture.dbPath,
    projectionRoot: fixture.projectionRoot,
    allowedProjectIds: [generation.project_ref.entity_id],
  });
  writeProjectHistoryCopyBinding(fixture.bindingPath, binding, { overwrite: true });
  const paths = resolveProjectHistoryCopyArtifactPaths(binding, {
    projectId: generation.project_ref.entity_id,
    generationId: generation.generation_id,
  });
  return Object.assign(fixture, paths, {
    binding,
    bindingDigest: binding.binding_digest,
    readbackPath: paths.xlsxReadbackPath,
  });
}

test("projects one immutable generation into an existing copied DB and replays byte-identically", (t) => {
  assert.deepEqual(PROJECT_HISTORY_COPY_PROJECTION_CLAIM_CEILING, {
    scope: "windows_current_fixture_feature_off_shadow_pilot",
    supported_platform: "win32",
    production_ready: false,
    cross_platform_publication: false,
    accepted_history: false,
  });
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  const attestation = sha256Canonical(generation);

  const inserted = projectCopiedErpHistory({
    ...fixture,
    generation,
    pilotCopy: true,
    attestation,
  });
  assert.equal(inserted.status, "inserted");
  assert.equal(inserted.event_count, 5);
  assert.equal(inserted.coverage_count, 5);
  assert.equal(inserted.accepted_history, false);
  assert.equal(inserted.raw_payload_copied, false);

  const firstCsv = readFileSync(fixture.csvPath);
  const firstXlsxInput = readFileSync(fixture.xlsxInputPath);
  const firstXlsx = readFileSync(fixture.xlsxPath);
  const xlsxInput = JSON.parse(firstXlsxInput.toString("utf8"));
  assert.deepEqual(xlsxInput.columns, PROJECT_HISTORY_COPY_COLUMNS);
  assert.equal(xlsxInput.rows.length, 5);
  assert.equal(xlsxInput.rows[0].generation_id, "'-copied-erp-shadow-generation");
  assert.equal(xlsxInput.hidden_sheets, false);
  assert.equal(xlsxInput.external_links, false);
  assert.equal(xlsxInput.formula_cells, false);

  refreshBinding(fixture);
  const replayed = projectCopiedErpHistory({
    ...fixture,
    generation,
    pilotCopy: true,
    attestation,
  });
  assert.equal(replayed.status, "replayed");
  assert.deepEqual(readFileSync(fixture.csvPath), firstCsv);
  assert.deepEqual(readFileSync(fixture.xlsxInputPath), firstXlsxInput);
  assert.deepEqual(readFileSync(fixture.xlsxPath), firstXlsx);

  const db = new DatabaseSync(fixture.dbPath);
  try {
    const pointer = db.prepare("SELECT generation_id FROM accepted_project_history_current").get();
    assert.equal(pointer.generation_id, "production-generation-sentinel");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_generation").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_event").get().count, 5);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_coverage").get().count, 5);
    assert.throws(
      () => db.exec("UPDATE project_history_generation SET classification_state = 'shadow'"),
      /immutable/u,
    );
    assert.throws(
      () => db.exec("DELETE FROM project_history_event"),
      /immutable/u,
    );
    assert.throws(
      () => db.prepare(`
        INSERT OR REPLACE INTO project_history_generation (
          generation_id, schema_version, project_id, project_ref_json, classification_state,
          event_count, coverage_count, ordered_event_digest, source_attestation_digest,
          packet_digest, raw_payload_copied, accepted_history
        ) SELECT generation_id, schema_version, project_id, project_ref_json, classification_state,
                 event_count, coverage_count, ordered_event_digest, source_attestation_digest,
                 packet_digest, raw_payload_copied, accepted_history
            FROM project_history_generation LIMIT 1
      `).run(),
      /immutable/u,
    );
  } finally {
    db.close();
  }

  const verified = verifyCopiedProjectHistoryProjection({
    ...fixture,
    generationId: generation.generation_id,
    pilotCopy: true,
    attestation,
    artifactManifestDigest: replayed.artifact_manifest_digest,
  });
  assert.equal(verified.query_only, true);
  assert.equal(verified.sqlite_total_changes, 0);
  assert.equal(verified.db_csv_parity, true);
  assert.equal(verified.db_xlsx_input_parity, true);
  assert.equal(verified.db_xlsx_parity, true);
  assert.equal(verified.xlsx_readback, "verified_from_workbook");
});

test("fails closed on conflicting generation digest without touching accepted pointers", (t) => {
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  projectCopiedErpHistory({
    ...fixture,
    generation,
    pilotCopy: true,
    attestation: sha256Canonical(generation),
  });
  refreshBinding(fixture);

  const conflict = makeGeneration({
    source_attestation_digest: sha256Canonical({ source: "different-synthetic-attestation" }),
  });
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation: conflict,
      pilotCopy: true,
      attestation: sha256Canonical(conflict),
    }),
    (error) => error.code === "generation_digest_conflict",
  );

  const db = new DatabaseSync(fixture.dbPath, { readOnly: true });
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_generation").get().count, 1);
    assert.equal(
      db.prepare("SELECT generation_id FROM accepted_project_history_current").get().generation_id,
      "production-generation-sentinel",
    );
  } finally {
    db.close();
  }
});

test("requires an exact private binding and rejects sidecars or live paths before DB writes", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "soulforge-ph-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const missingPath = path.join(root, "missing.sqlite");
  const projectionRoot = path.join(root, "artifacts");
  mkdirSync(projectionRoot);
  const generation = makeGeneration();
  assert.throws(
    () => createProjectHistoryCopyBinding({
      dbPath: missingPath,
      projectionRoot,
      allowedProjectIds: [generation.project_ref.entity_id],
    }),
    (error) => error.code === "sqlite_copy_missing",
  );
  assert.equal(readFileDoesNotExist(missingPath), true);

  const fixture = makeFixture(t);
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation,
      authoritySnapshot: null,
      attestation: sha256Canonical(generation),
    }),
    (error) => error.code === "shadow_authority_evidence_required",
  );
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation,
      bindingPath: "",
      attestation: sha256Canonical(generation),
    }),
    (error) => error.code === "binding_required",
  );
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation,
      pilotCopy: true,
      attestation: null,
    }),
    (error) => error.code === "digest_invalid",
  );
  writeFileSync(`${fixture.dbPath}-wal`, "synthetic sidecar sentinel", "utf8");
  assert.throws(
    () => inspectStandaloneSqliteCopy(fixture.dbPath),
    (error) => error.code === "sqlite_sidecar_present",
  );

  const live = makeFixture(t, "production", { bind: false });
  assert(productionLookingPathReasons(live.dbPath).includes("production_segment"));
  assert.throws(
    () => createProjectHistoryCopyBinding({
      dbPath: live.dbPath,
      projectionRoot: live.projectionRoot,
      allowedProjectIds: [generation.project_ref.entity_id],
    }),
    (error) => error.code === "production_database_refused",
  );
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      dbPath: live.dbPath,
      generation,
      pilotCopy: true,
      attestation: sha256Canonical(generation),
    }),
    (error) => error.code === "database_path_mismatch",
  );
  const liveDb = new DatabaseSync(live.dbPath, { readOnly: true });
  try {
    assert.equal(liveDb.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE 'project_history_%'",
    ).get().count, 0);
  } finally {
    liveDb.close();
  }
});

test("classifies a non-system Windows drive without embedding a host locator", () => {
  if (process.platform !== "win32") return;
  const systemDrive = path.parse(process.env.SystemRoot ?? "").root.slice(0, 1).toUpperCase();
  const alternateDrive = systemDrive === "Z" ? "Y" : "Z";
  const candidate = `${alternateDrive}:${path.sep}isolated-pilot${path.sep}copy.sqlite`;
  assert(productionLookingPathReasons(candidate).includes("live_drive"));
});

test("standalone-copy inspection rejects hardlinked database aliases", (t) => {
  const fixture = makeFixture(t);
  const aliasPath = path.join(fixture.root, "copy-hardlink.sqlite");
  linkSync(fixture.dbPath, aliasPath);
  assert.throws(
    () => inspectStandaloneSqliteCopy(aliasPath),
    (error) => error.code === "sqlite_copy_hardlink_forbidden",
  );
});

test("weakened lookalike projection schema rolls back all newly created schema", (t) => {
  const fixture = makeFixture(t);
  const db = new DatabaseSync(fixture.dbPath);
  try {
    db.exec("CREATE TABLE project_history_generation (generation_id TEXT PRIMARY KEY)");
  } finally {
    db.close();
  }
  refreshBinding(fixture);
  const generation = makeGeneration();
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation,
      pilotCopy: true,
      attestation: sha256Canonical(generation),
    }),
    (error) => error.code === "projection_schema_conflict",
  );
  const readback = new DatabaseSync(fixture.dbPath, { readOnly: true });
  try {
    const names = readback.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'project_history_%' ORDER BY name",
    ).all().map((row) => row.name);
    assert.deepEqual(names, ["project_history_generation"]);
  } finally {
    readback.close();
  }
});

test("trusted-clock expiry at the in-transaction commit fence rolls back every Shadow DB mutation", (t) => {
  let now = Date.parse("2026-07-20T08:00:00.000Z");
  t.mock.method(Date, "now", () => now);
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation,
      attestation: sha256Canonical(generation),
      testHooks: {
        beforeDatabaseCommit() {
          now = Date.parse(fixture.authority.record.expires_at);
        },
      },
    }),
    (error) => error.code === "stale_writer_authority",
  );
  assert.equal(existsSync(fixture.directory), false);
  const db = new DatabaseSync(fixture.dbPath, { readOnly: true });
  try {
    assert.equal(db.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE 'project_history_%'",
    ).get().count, 0);
    assert.equal(
      db.prepare("SELECT generation_id FROM accepted_project_history_current").get().generation_id,
      "production-generation-sentinel",
    );
  } finally {
    db.close();
  }
});

test("authority replacement immediately before the publication helper opens fails closed", (t) => {
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation,
      attestation: sha256Canonical(generation),
      testHooks: {
        afterArtifactParentCheckBeforeMutation({ boundary }) {
          if (boundary === "acquire_publication_authority_lock") {
            renameSync(fixture.authority.authorityPath, `${fixture.authority.authorityPath}.old`);
            writeFileSync(fixture.authority.authorityPath, fixture.authority.bytes);
          }
        },
      },
    }),
    (error) => error.code === "secure_path_lock_failed",
  );
  assert.equal(existsSync(fixture.directory), false);
  assert.equal(existsSync(fixture.artifactManifestPath), false);
  const db = new DatabaseSync(fixture.dbPath, { readOnly: true });
  try {
    assert.equal(db.prepare(
      "SELECT COUNT(*) AS count FROM project_history_generation WHERE accepted_history = 0",
    ).get().count, 1);
    assert.equal(
      db.prepare("SELECT generation_id FROM accepted_project_history_current").get().generation_id,
      "production-generation-sentinel",
    );
  } finally {
    db.close();
  }
});

test("retained authority handle keeps new and replay publication on one immutable record", (t) => {
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  const attestation = sha256Canonical(generation);
  const replacementResults = new Map();
  const project = (boundary) => {
    try {
      renameSync(
        fixture.authority.authorityPath,
        `${fixture.authority.authorityPath}.${boundary}.old`,
      );
      replacementResults.set(boundary, "succeeded");
    } catch (error) {
      replacementResults.set(boundary, error.code);
    }
  };
  const inserted = projectCopiedErpHistory({
    ...fixture,
    generation,
    attestation,
    testHooks: {
      afterArtifactParentCheckBeforeMutation({ boundary }) {
        if (boundary === "publish_bundle_handle_rename") project(boundary);
      },
    },
  });
  assert.equal(inserted.status, "inserted");
  refreshBinding(fixture);
  const replayed = projectCopiedErpHistory({
    ...fixture,
    generation,
    attestation,
    testHooks: {
      afterArtifactParentCheckBeforeMutation({ boundary }) {
        if (boundary === "publish_replay_manifest_handle_rename") project(boundary);
      },
    },
  });
  assert.equal(replayed.status, "replayed");
  for (const boundary of [
    "publish_bundle_handle_rename",
    "publish_replay_manifest_handle_rename",
  ]) {
    assert(["EBUSY", "EPERM", "EACCES"].includes(replacementResults.get(boundary)));
  }
  assert.equal(existsSync(fixture.artifactManifestPath), true);
});

test("retained authority expiry prevents a new artifact bundle publication", (t) => {
  const fixture = makeFixture(t, "copy", {
    authorityOptions: { expiresInMs: 20_000 },
  });
  const generation = makeGeneration();
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation,
      attestation: sha256Canonical(generation),
      testHooks: {
        afterArtifactParentCheckBeforeMutation({ boundary }) {
          if (boundary === "publish_bundle_handle_rename") {
            waitUntilAuthorityExpires(fixture.authority);
          }
        },
      },
    }),
    (error) => error.code === "secure_handle_rename_failed",
  );
  assert.equal(existsSync(fixture.directory), false);
  assert.equal(existsSync(fixture.artifactManifestPath), false);
});

test("retained authority expiry leaves the replay manifest unchanged", (t) => {
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  const attestation = sha256Canonical(generation);
  projectCopiedErpHistory({ ...fixture, generation, attestation });
  const originalManifest = readFileSync(fixture.artifactManifestPath);
  refreshBinding(fixture);
  const replayAuthority = createAuthorityCapability(
    fixture.root,
    generation.project_ref,
    { expiresInMs: 20_000 },
  );
  fixture.authority = replayAuthority;
  fixture.authoritySnapshot = replayAuthority.authoritySnapshot;
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation,
      attestation,
      testHooks: {
        afterArtifactParentCheckBeforeMutation({ boundary }) {
          if (boundary === "publish_replay_manifest_handle_rename") {
            waitUntilAuthorityExpires(replayAuthority);
          }
        },
      },
    }),
    (error) => error.code === "secure_handle_rename_failed",
  );
  assert.deepEqual(readFileSync(fixture.artifactManifestPath), originalManifest);
});

test("existing junction component is rejected before DB writes and creates no escaped child", (t) => {
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  const projectDirectory = path.dirname(fixture.directory);
  const escapedDirectory = path.join(fixture.root, "escaped-static-target");
  mkdirSync(escapedDirectory);
  symlinkSync(
    escapedDirectory,
    projectDirectory,
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation,
      attestation: sha256Canonical(generation),
    }),
    (error) => error.code === "projection_directory_not_direct",
  );
  assert.equal(existsSync(path.join(escapedDirectory, path.basename(fixture.directory))), false);
  const db = new DatabaseSync(fixture.dbPath, { readOnly: true });
  try {
    assert.equal(db.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE 'project_history_%'",
    ).get().count, 0);
  } finally {
    db.close();
  }
});

test("root swap after identity check but before native lock acquisition fails without escaped output", (t) => {
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  const heldRootDirectory = path.join(fixture.root, "held-root-before-lock");
  const escapedDirectory = path.join(fixture.root, "escaped-before-lock");
  mkdirSync(escapedDirectory);
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation,
      attestation: sha256Canonical(generation),
      testHooks: {
        afterArtifactParentCheckBeforeMutation({ boundary }) {
          if (boundary !== "acquire_root_identity_lock") return;
          renameSync(fixture.projectionRoot, heldRootDirectory);
          symlinkSync(
            escapedDirectory,
            fixture.projectionRoot,
            process.platform === "win32" ? "junction" : "dir",
          );
        },
      },
    }),
    (error) => error.code === "secure_path_lock_failed",
  );
  assert.equal(existsSync(path.join(escapedDirectory, path.basename(fixture.directory))), false);
  assert.equal(existsSync(fixture.artifactManifestPath), false);
});

test("identity-bound directory handles block root and project swaps in post-check mutation gaps", (t) => {
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  const projectDirectory = path.dirname(fixture.directory);
  const heldRootDirectory = path.join(fixture.root, "held-projection-root");
  const heldProjectDirectory = path.join(fixture.root, "held-project-directory");
  const escapedDirectory = path.join(fixture.root, "escaped-race-target");
  mkdirSync(escapedDirectory);
  const swapResults = new Map();
  const projected = projectCopiedErpHistory({
    ...fixture,
    generation,
    attestation: sha256Canonical(generation),
    testHooks: {
      afterArtifactParentCheckBeforeMutation({ boundary }) {
        if (boundary === "mkdir_component") {
          try {
            renameSync(fixture.projectionRoot, heldRootDirectory);
            symlinkSync(
              escapedDirectory,
              fixture.projectionRoot,
              process.platform === "win32" ? "junction" : "dir",
            );
            swapResults.set(boundary, "succeeded");
          } catch (error) {
            swapResults.set(boundary, error.code);
          }
        } else if (boundary === "publish_bundle_handle_rename") {
          try {
            renameSync(projectDirectory, heldProjectDirectory);
            symlinkSync(
              escapedDirectory,
              projectDirectory,
              process.platform === "win32" ? "junction" : "dir",
            );
            swapResults.set(boundary, "succeeded");
          } catch (error) {
            swapResults.set(boundary, error.code);
          }
        }
      },
    },
  });
  assert.equal(projected.status, "inserted");
  for (const boundary of ["mkdir_component", "publish_bundle_handle_rename"]) {
    assert(["EBUSY", "EPERM", "EACCES"].includes(swapResults.get(boundary)));
  }
  assert.equal(existsSync(path.join(escapedDirectory, path.basename(fixture.directory))), false);
  assert.equal(existsSync(fixture.artifactManifestPath), true);
  const db = new DatabaseSync(fixture.dbPath, { readOnly: true });
  try {
    assert.equal(db.prepare(
      "SELECT COUNT(*) AS count FROM project_history_generation WHERE accepted_history = 0",
    ).get().count, 1);
  } finally {
    db.close();
  }
});

test("verifier requires manifest-bound artifact hashes before parsing caller readback", (t) => {
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  const attestation = sha256Canonical(generation);
  const projected = projectCopiedErpHistory({ ...fixture, generation, pilotCopy: true, attestation });

  const originalCsv = readFileSync(fixture.csvPath, "utf8");
  writeFileSync(fixture.csvPath, originalCsv.replace(",mail,", ",voice,"), "utf8");
  assert.throws(
    () => verifyCopiedProjectHistoryProjection({
      ...fixture,
      generationId: generation.generation_id,
      pilotCopy: true,
      attestation,
      artifactManifestDigest: projected.artifact_manifest_digest,
    }),
    (error) => error.code === "artifact_hash_mismatch",
  );

  writeFileSync(fixture.csvPath, originalCsv, "utf8");
  const readback = JSON.parse(readFileSync(fixture.xlsxReadbackPath, "utf8"));
  readback.hidden_sheet_count = 1;
  writeFileSync(fixture.xlsxReadbackPath, JSON.stringify(readback), "utf8");
  assert.throws(
    () => verifyCopiedProjectHistoryProjection({
      ...fixture,
      generationId: generation.generation_id,
      pilotCopy: true,
      attestation,
      artifactManifestDigest: projected.artifact_manifest_digest,
    }),
    (error) => error.code === "artifact_hash_mismatch",
  );
});

test("formula protection neutralizes every spreadsheet execution prefix", () => {
  for (const value of ["=1+1", "+cmd", "-2+3", "@SUM(A1:A2)", "  =HYPERLINK(\"x\")"]) {
    const protectedValue = protectSpreadsheetFormula(value);
    assert(protectedValue.startsWith("'"));
    assert(!/^[\t\r\n ]*[=+\-@]/u.test(protectedValue));
  }
  assert.equal(protectSpreadsheetFormula("2026-07-19T00:00:00.000Z"), "2026-07-19T00:00:00.000Z");
});

test("standalone projector CLI is validation-only and the authorized API remains verifier-compatible", (t) => {
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  const attestation = sha256Canonical(generation);
  const packetPath = path.join(fixture.root, "actual-generation.json");
  writeFileSync(packetPath, `${JSON.stringify(generation)}\n`, "utf8");
  const projectorPath = fileURLToPath(new URL("../tools/project_history_copy_projector.mjs", import.meta.url));
  const verifierPath = fileURLToPath(new URL("../tools/project_history_copy_verifier.mjs", import.meta.url));

  const validated = spawnSync(process.execPath, [
    projectorPath,
    "--binding", fixture.bindingPath,
    "--binding-digest", fixture.bindingDigest,
    "--attestation", attestation,
    "--db", fixture.dbPath,
    "--packet", packetPath,
    "--csv", fixture.csvPath,
    "--xlsx-input", fixture.xlsxInputPath,
    "--xlsx", fixture.xlsxPath,
    "--xlsx-readback", fixture.xlsxReadbackPath,
    "--artifact-manifest", fixture.artifactManifestPath,
  ], { encoding: "utf8" });
  assert.equal(validated.status, 0, validated.stderr);
  assert.equal(JSON.parse(validated.stdout).status, "validation_only_no_write");
  assert.equal(existsSync(fixture.directory), false);

  const refused = spawnSync(process.execPath, [
    projectorPath,
    "--pilot-copy",
    "--binding", fixture.bindingPath,
    "--binding-digest", fixture.bindingDigest,
    "--attestation", attestation,
    "--db", fixture.dbPath,
    "--packet", packetPath,
    "--csv", fixture.csvPath,
    "--xlsx-input", fixture.xlsxInputPath,
    "--xlsx", fixture.xlsxPath,
    "--xlsx-readback", fixture.xlsxReadbackPath,
    "--artifact-manifest", fixture.artifactManifestPath,
  ], { encoding: "utf8" });
  assert.equal(refused.status, 1);
  assert.equal(JSON.parse(refused.stderr).code, "standalone_projection_mutation_forbidden");
  assert.equal(existsSync(fixture.directory), false);

  const projectionReceipt = projectCopiedErpHistory({
    ...fixture,
    generation,
    pilotCopy: true,
    attestation,
  });
  assert.equal(projectionReceipt.status, "inserted");

  const verified = spawnSync(process.execPath, [
    verifierPath,
    "--pilot-copy",
    "--binding", fixture.bindingPath,
    "--binding-digest", fixture.bindingDigest,
    "--attestation", attestation,
    "--db", fixture.dbPath,
    "--generation-id", generation.generation_id,
    "--csv", fixture.csvPath,
    "--xlsx-input", fixture.xlsxInputPath,
    "--xlsx", fixture.xlsxPath,
    "--xlsx-readback", fixture.xlsxReadbackPath,
    "--artifact-manifest", fixture.artifactManifestPath,
    "--artifact-manifest-digest", projectionReceipt.artifact_manifest_digest,
  ], { encoding: "utf8" });
  assert.equal(verified.status, 0, verified.stderr);
  const receipt = JSON.parse(verified.stdout);
  assert.equal(receipt.query_only, true);
  assert.equal(receipt.db_csv_parity, true);
  assert.equal(receipt.db_xlsx_input_parity, true);
  assert.equal(receipt.db_xlsx_parity, true);
});

function readFileDoesNotExist(filePath) {
  try {
    readFileSync(filePath);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

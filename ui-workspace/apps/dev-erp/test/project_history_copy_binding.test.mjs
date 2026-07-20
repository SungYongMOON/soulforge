import assert from "node:assert/strict";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  assertProjectHistoryCopyBindingTarget,
  createProjectHistoryCopyBinding,
  inspectStandaloneProjectHistoryCopy,
  readProjectHistoryCopyBinding,
  resolveProjectHistoryCopyArtifactPaths,
  verifyProjectHistoryCopyBinding,
  writeProjectHistoryCopyBinding,
} from "../tools/project_history_copy_binding.mjs";

function createDatabase(dbPath, marker = "initial") {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("CREATE TABLE sentinel (value TEXT NOT NULL) STRICT");
    db.prepare("INSERT INTO sentinel VALUES (?)").run(marker);
  } finally {
    db.close();
  }
}

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "sf-ph-binding-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dbPath = path.join(root, "copied-erp.sqlite");
  const projectionRoot = path.join(root, "artifacts");
  const bindingPath = path.join(root, "private-binding.json");
  mkdirSync(projectionRoot);
  createDatabase(dbPath);
  const binding = createProjectHistoryCopyBinding({
    dbPath,
    projectionRoot,
    allowedProjectIds: ["project-b", "project-a"],
  });
  writeProjectHistoryCopyBinding(bindingPath, binding);
  return { root, dbPath, projectionRoot, bindingPath, binding };
}

test("binding pins exact standalone DB identity/hash, root identity, allowlist, and OFF state", (t) => {
  const value = fixture(t);
  const { binding } = value;
  assert.equal(binding.enabled, true);
  assert.equal(binding.accepted_history, false);
  assert.deepEqual(binding.allowed_project_ids, ["project-a", "project-b"]);
  assert.equal(binding.database_identity.nlink, 1);
  assert.match(binding.database_identity.dev, /^(?:0|[1-9]\d*)$/u);
  assert.match(binding.database_identity.ino, /^(?:0|[1-9]\d*)$/u);
  assert.equal(
    binding.database_identity.file_id,
    `${binding.database_identity.dev}:${binding.database_identity.ino}`,
  );
  assert.match(binding.database_sha256, /^sha256:[0-9a-f]{64}$/u);
  assert.match(binding.binding_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(verifyProjectHistoryCopyBinding(binding), binding);
  assert.deepEqual(
    readProjectHistoryCopyBinding(value.bindingPath, { expectedDigest: binding.binding_digest }),
    binding,
  );
});

test("binding rejects wrong project and any artifact path outside its exact project/generation root", (t) => {
  const value = fixture(t);
  assert.throws(
    () => resolveProjectHistoryCopyArtifactPaths(value.binding, {
      projectId: "project-c",
      generationId: "generation-1",
    }),
    (error) => error.code === "project_not_allowed",
  );
  const paths = resolveProjectHistoryCopyArtifactPaths(value.binding, {
    projectId: "project-a",
    generationId: "generation-1",
  });
  assert.throws(
    () => assertProjectHistoryCopyBindingTarget(value.binding, {
      bindingDigest: value.binding.binding_digest,
      dbPath: value.dbPath,
      projectId: "project-a",
      generationId: "generation-1",
      artifactPaths: { csvPath: path.join(value.root, "outside.csv") },
    }),
    (error) => error.code === "projection_root_mismatch",
  );
  assert.equal(paths.csvPath.startsWith(value.projectionRoot), true);
});

test("binding detects same-path DB replacement by physical identity before any projection open", (t) => {
  const value = fixture(t);
  const oldPath = path.join(value.root, "old-copy.sqlite");
  renameSync(value.dbPath, oldPath);
  createDatabase(value.dbPath, "replacement");
  const paths = resolveProjectHistoryCopyArtifactPaths(value.binding, {
    projectId: "project-a",
    generationId: "generation-1",
  });
  assert.throws(
    () => assertProjectHistoryCopyBindingTarget(value.binding, {
      bindingDigest: value.binding.binding_digest,
      dbPath: value.dbPath,
      projectId: "project-a",
      generationId: "generation-1",
      artifactPaths: paths,
    }),
    (error) => error.code === "database_identity_mismatch",
  );
});

test("binding rejects a same-path replacement between direct inspection and descriptor open", (t) => {
  const value = fixture(t);
  const originalPath = path.join(value.root, "original-copy.sqlite");
  const replacementPath = path.join(value.root, "replacement-copy.sqlite");
  createDatabase(replacementPath, "pre-open-replacement");
  assert.throws(
    () => inspectStandaloneProjectHistoryCopy(value.dbPath, {
      expectedIdentity: value.binding.database_identity,
      expectedSha256: value.binding.database_sha256,
      beforeDatabaseOpen() {
        renameSync(value.dbPath, originalPath);
        renameSync(replacementPath, value.dbPath);
      },
    }),
    (error) => error.code === "database_identity_mismatch",
  );
});

test("binding detects projection-root replacement and standalone-copy aliases or sidecars", (t) => {
  const value = fixture(t);
  const movedRoot = path.join(value.root, "moved-artifacts");
  renameSync(value.projectionRoot, movedRoot);
  mkdirSync(value.projectionRoot);
  assert.throws(
    () => resolveProjectHistoryCopyArtifactPaths(value.binding, {
      projectId: "project-a",
      generationId: "generation-1",
    }),
    (error) => error.code === "projection_root_identity_mismatch",
  );

  rmSync(value.projectionRoot, { recursive: true, force: true });
  renameSync(movedRoot, value.projectionRoot);
  const hardlink = path.join(value.root, "copy-alias.sqlite");
  linkSync(value.dbPath, hardlink);
  assert.throws(
    () => createProjectHistoryCopyBinding({
      dbPath: value.dbPath,
      projectionRoot: value.projectionRoot,
      allowedProjectIds: ["project-a"],
    }),
    (error) => error.code === "sqlite_copy_hardlink_forbidden",
  );
  unlinkSync(hardlink);
  writeFileSync(`${value.dbPath}-shm`, "synthetic-sidecar", "utf8");
  assert.throws(
    () => createProjectHistoryCopyBinding({
      dbPath: value.dbPath,
      projectionRoot: value.projectionRoot,
      allowedProjectIds: ["project-a"],
    }),
    (error) => error.code === "sqlite_sidecar_present",
  );
});

test("binding creation rejects a DB symlink when the platform permits the fixture", (t) => {
  const value = fixture(t);
  const alias = path.join(value.root, "copy-symlink.sqlite");
  try {
    symlinkSync(value.dbPath, alias, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) {
      t.skip(`symlink fixture unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  assert.throws(
    () => createProjectHistoryCopyBinding({
      dbPath: alias,
      projectionRoot: value.projectionRoot,
      allowedProjectIds: ["project-a"],
    }),
    (error) => error.code === "sqlite_copy_not_standalone_file",
  );
});

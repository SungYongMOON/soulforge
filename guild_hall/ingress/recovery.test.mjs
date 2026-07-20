import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  appendFile,
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  createIngressRecoverySnapshot,
  verifyIngressRecoveryRestore,
} from "./recovery.mjs";
import { runRecoveryCli } from "./recovery_cli.mjs";

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fixture({ sqlite = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "soulforge-ingress-recovery-"));
  const sourceRoot = join(root, "source");
  const backupRoot = join(root, "backup");
  const restoreRoot = join(root, "restore");
  await Promise.all([sourceRoot, backupRoot, restoreRoot].map((path) => mkdir(path)));
  await writeJson(join(sourceRoot, "storage_manifest.json"), {
    schema_version: "synthetic.storage_manifest.v1",
    source_preserving: true,
  });
  await mkdir(join(sourceRoot, "ingress", "team_files", "incoming"), { recursive: true });
  await writeFile(join(sourceRoot, "ingress", "team_files", "incoming", "payload.bin"), "payload-v1", "utf8");
  await mkdir(join(sourceRoot, "ingress", "voice", "live_workspace_capture", "sessions", "session-001"), { recursive: true });
  await writeFile(
    join(sourceRoot, "ingress", "voice", "live_workspace_capture", "sessions", "session-001", "audio.bin"),
    "synthetic-voice-session",
    "utf8",
  );
  await writeJson(join(sourceRoot, "state", "leases", "continuous_ingress", "epoch.json"), {
    schema_version: "soulforge.ingress.continuous_epoch.v1",
    last_epoch: 4,
  });
  await writeJson(join(sourceRoot, "state", "leases", "continuous_ingress", "stale-synthetic.json"), {
    schema_version: "soulforge.ingress.continuous_lease.v1",
    lease_epoch: 7,
  });
  await writeJson(join(sourceRoot, "state", "leases", "continuous_ingress", "active.lock.json"), {
    schema_version: "soulforge.ingress.continuous_lease.v1",
    lease_epoch: 99,
    expires_at: "2000-01-01T00:00:00.000Z",
  });
  await writeJson(join(sourceRoot, "state", "checkpoints", "team_files", "checkpoint.json"), {
    schema_version: "synthetic.checkpoint.v1",
    lease_epoch: 6,
  });
  await writeFile(join(sourceRoot, ".env"), "SYNTHETIC_SECRET=must-not-copy\n", "utf8");
  await writeJson(join(sourceRoot, "api-credentials.json"), { value: "must-not-copy" });
  await writeFile(join(sourceRoot, "browser-auth.session"), "must-not-copy", "utf8");
  await mkdir(join(sourceRoot, "backups", "prior"), { recursive: true });
  await writeFile(join(sourceRoot, "backups", "prior", "old.db"), "old-backup", "utf8");

  let database = null;
  let sqlitePath = null;
  if (sqlite) {
    await mkdir(join(sourceRoot, "projection"), { recursive: true });
    sqlitePath = join(sourceRoot, "projection", "ingress.sqlite3");
    database = new DatabaseSync(sqlitePath);
    database.exec("PRAGMA journal_mode=WAL");
    database.exec("CREATE TABLE ingress_event(id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT");
    database.exec("INSERT INTO ingress_event(value) VALUES ('synthetic')");
  }
  return {
    root,
    sourceRoot,
    backupRoot,
    restoreRoot,
    sqlitePath,
    database,
    async cleanup() {
      try { database?.close(); } catch { /* test cleanup */ }
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("snapshot excludes stale active locks and secrets, carries custody epochs, and restores a VACUUM INTO DB", async () => {
  const f = await fixture({ sqlite: true });
  try {
    const dryRun = await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
      sqlitePath: f.sqlitePath,
    });
    assert.equal(dryRun.status, "dry_run_no_write");
    assert.equal(dryRun.writes_performed, 0);
    assert.equal(dryRun.max_observed_custody_epoch, 7);
    assert.equal(dryRun.checkpoint_count, 1);
    assert.equal(dryRun.exclusions.active_lock_files, 1);
    assert.equal(dryRun.exclusions.secret_like_entries, 3);
    assert.equal(dryRun.exclusions.prior_backup_roots, 1);
    assert.equal((await readdir(f.backupRoot)).length, 0);

    const approvalRef = "TASK-ENGINE-HPP-PRODUCTION-INGRESS-CUTOVER-V1";
    const applied = await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
      sqlitePath: f.sqlitePath,
      generationId: "igr_synthetic_epoch_carry",
      apply: true,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef,
      now: new Date("2026-07-20T00:00:00.000Z"),
    });
    assert.equal(applied.status, "snapshot_created");
    assert.equal(applied.database_included, true);
    assert.equal(applied.max_observed_custody_epoch, 7);

    const generationRoot = join(f.backupRoot, "generations", applied.generation_id);
    const manifest = JSON.parse(await readFile(join(generationRoot, "manifest.json"), "utf8"));
    const refs = manifest.inventory.map((item) => item.restore_ref);
    assert.ok(refs.includes("state/leases/continuous_ingress/epoch.json"));
    assert.ok(refs.includes("state/leases/continuous_ingress/stale-synthetic.json"));
    assert.ok(refs.includes("ingress/voice/live_workspace_capture/sessions/session-001/audio.bin"));
    assert.ok(!refs.includes("state/leases/continuous_ingress/active.lock.json"));
    assert.ok(!refs.some((ref) => ref.includes(".env") || ref.includes("credentials")));
    assert.ok(!refs.some((ref) => ref.startsWith("backups/")));
    assert.ok(!refs.some((ref) => /\.sqlite3(?:-|$)/u.test(ref)));
    assert.equal(manifest.custody.max_observed_epoch, 7);
    assert.equal(manifest.database_snapshot.kind, "sqlite_vacuum_snapshot");
    assert.ok(!JSON.stringify(manifest.database_snapshot).includes(f.sqlitePath));

    const dryRestore = await verifyIngressRecoveryRestore({
      backupRoot: f.backupRoot,
      generationId: applied.generation_id,
      restoreRoot: f.restoreRoot,
    });
    assert.equal(dryRestore.status, "dry_run_verified_no_write");
    assert.equal((await readdir(f.restoreRoot)).length, 0);

    const restored = await verifyIngressRecoveryRestore({
      backupRoot: f.backupRoot,
      generationId: applied.generation_id,
      restoreRoot: f.restoreRoot,
      apply: true,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef,
    });
    assert.equal(restored.status, "restore_verified");
    assert.equal(restored.live_root_overwritten, false);
    assert.equal(restored.restore_subdirectory, "restored");
    const restoredRoot = join(f.restoreRoot, restored.restore_subdirectory);
    assert.equal(await exists(join(restoredRoot, "state", "leases", "continuous_ingress", "active.lock.json")), false);
    assert.equal(await exists(join(restoredRoot, ".env")), false);
    assert.equal(await exists(join(restoredRoot, "api-credentials.json")), false);
    assert.equal(await exists(join(restoredRoot, "browser-auth.session")), false);
    assert.equal(
      await readFile(join(restoredRoot, "ingress", "voice", "live_workspace_capture", "sessions", "session-001", "audio.bin"), "utf8"),
      "synthetic-voice-session",
    );
    const custody = JSON.parse(await readFile(
      join(restoredRoot, ".ingress-recovery", "custody_checkpoint.json"),
      "utf8",
    ));
    assert.equal(custody.max_observed_custody_epoch, 7);
    const restoredDb = new DatabaseSync(
      join(restoredRoot, ".ingress-recovery", "sqlite", "database.sqlite3"),
      { readOnly: true },
    );
    try {
      assert.equal(restoredDb.prepare("PRAGMA quick_check").get().quick_check, "ok");
      assert.equal(restoredDb.prepare("SELECT value FROM ingress_event").get().value, "synthetic");
    } finally {
      restoredDb.close();
    }
    assert.equal(await readFile(join(f.sourceRoot, ".env"), "utf8"), "SYNTHETIC_SECRET=must-not-copy\n");
    assert.equal(await exists(join(f.sourceRoot, "state", "leases", "continuous_ingress", "active.lock.json")), true);
  } finally {
    await f.cleanup();
  }
});

test("one owned generation deduplicates repeated source bytes without reopening a partial object", async () => {
  const f = await fixture();
  try {
    const duplicate = join(f.sourceRoot, "ingress", "team_files", "incoming", "payload-copy.bin");
    await writeFile(duplicate, "payload-v1", "utf8");
    const dryRun = await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
    });
    const applied = await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
      generationId: "igr_synthetic_duplicate_bytes",
      apply: true,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef: "TASK-ENGINE-HPP-PRODUCTION-INGRESS-CUTOVER-V1",
    });
    const generationRoot = join(f.backupRoot, "generations", applied.generation_id);
    const manifest = JSON.parse(await readFile(join(generationRoot, "manifest.json"), "utf8"));
    const originals = manifest.inventory.filter((item) => item.restore_ref.endsWith("payload.bin"));
    const copies = manifest.inventory.filter((item) => item.restore_ref.endsWith("payload-copy.bin"));
    assert.equal(originals.length, 1);
    assert.equal(copies.length, 1);
    assert.equal(originals[0].object_ref, copies[0].object_ref);
    assert.equal(originals[0].sha256, copies[0].sha256);
  } finally {
    await f.cleanup();
  }
});

test("restore verification fails closed after an immutable object is tampered", async () => {
  const f = await fixture();
  try {
    const dryRun = await createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot });
    const applied = await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
      generationId: "igr_synthetic_tamper",
      apply: true,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef: "synthetic-approved",
    });
    const generationRoot = join(f.backupRoot, "generations", applied.generation_id);
    const manifest = JSON.parse(await readFile(join(generationRoot, "manifest.json"), "utf8"));
    const target = join(generationRoot, ...manifest.inventory[0].object_ref.split("/"));
    await appendFile(target, "tampered", "utf8");
    await assert.rejects(
      verifyIngressRecoveryRestore({
        backupRoot: f.backupRoot,
        generationId: applied.generation_id,
        restoreRoot: f.restoreRoot,
      }),
      { code: "recovery_backup_object_hash_mismatch" },
    );
    assert.equal((await readdir(f.restoreRoot)).length, 0);
  } finally {
    await f.cleanup();
  }
});

test("failed restore cleanup removes only its owned staging directory", async () => {
  const f = await fixture();
  try {
    const dryRun = await createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot });
    const approvalRef = "synthetic-owned-cleanup";
    const applied = await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
      generationId: "igr_synthetic_owned_cleanup",
      apply: true,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef,
    });
    await assert.rejects(
      verifyIngressRecoveryRestore({
        backupRoot: f.backupRoot,
        generationId: applied.generation_id,
        restoreRoot: f.restoreRoot,
        apply: true,
        expectedSourceIdentity: dryRun.source_identity_digest,
        expectedSourceDigest: dryRun.source_digest,
        approvalRef,
        testHooks: {
          afterRestoreObject: async () => {
            await writeFile(join(f.restoreRoot, "external-owned.txt"), "external", "utf8");
            const error = new Error("synthetic_restore_failure");
            error.code = "synthetic_restore_failure";
            throw error;
          },
        },
      }),
      { code: "synthetic_restore_failure" },
    );
    assert.deepEqual(await readdir(f.restoreRoot), ["external-owned.txt"]);
    assert.equal(await readFile(join(f.restoreRoot, "external-owned.txt"), "utf8"), "external");
  } finally {
    await f.cleanup();
  }
});

test("failed snapshot cleanup preserves a replacement after staging identity drift", async () => {
  const f = await fixture();
  try {
    const dryRun = await createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot });
    let replacementRoot = null;
    await assert.rejects(
      createIngressRecoverySnapshot({
        sourceRoot: f.sourceRoot,
        backupRoot: f.backupRoot,
        generationId: "igr_synthetic_snapshot_cleanup_identity",
        apply: true,
        expectedSourceIdentity: dryRun.source_identity_digest,
        expectedSourceDigest: dryRun.source_digest,
        approvalRef: "synthetic-snapshot-cleanup",
        testHooks: {
          afterSnapshotStagingCreated: async ({ path }) => {
            replacementRoot = path;
            await rename(path, `${path}.displaced-owned`);
            await mkdir(path);
            await writeFile(join(path, "foreign-owned.txt"), "foreign", "utf8");
            const error = new Error("synthetic_snapshot_failure");
            error.code = "synthetic_snapshot_failure";
            throw error;
          },
        },
      }),
      { code: "recovery_snapshot_cleanup_unsafe" },
    );
    assert.ok(replacementRoot);
    assert.equal(await readFile(join(replacementRoot, "foreign-owned.txt"), "utf8"), "foreign");
  } finally {
    await f.cleanup();
  }
});

test("dry-run and a no-journal snapshot do not manufacture SQLite sidecars", async () => {
  const f = await fixture({ sqlite: true });
  try {
    f.database.close();
    const projectionRoot = dirname(f.sqlitePath);
    const before = (await readdir(projectionRoot)).sort();
    assert.deepEqual(before, ["ingress.sqlite3"]);
    const dryRun = await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
      sqlitePath: f.sqlitePath,
    });
    assert.deepEqual((await readdir(projectionRoot)).sort(), before);
    await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
      sqlitePath: f.sqlitePath,
      generationId: "igr_synthetic_no_sidecars",
      apply: true,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef: "synthetic-approved",
    });
    assert.deepEqual((await readdir(projectionRoot)).sort(), before);
  } finally {
    await f.cleanup();
  }
});

test("source/backup and backup/restore path overlap is rejected before writes", async () => {
  const f = await fixture();
  try {
    const nestedBackup = join(f.sourceRoot, "nested-backup");
    await mkdir(nestedBackup);
    await assert.rejects(
      createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: nestedBackup }),
      { code: "recovery_source_backup_overlap" },
    );
    const nestedRestore = join(f.backupRoot, "nested-restore");
    await mkdir(nestedRestore);
    await assert.rejects(
      verifyIngressRecoveryRestore({
        backupRoot: f.backupRoot,
        generationId: "igr_missing",
        restoreRoot: nestedRestore,
      }),
      { code: "recovery_backup_restore_overlap" },
    );
  } finally {
    await f.cleanup();
  }
});

test("apply requires exact source identity, digest, and approval reference", async () => {
  const f = await fixture();
  try {
    const dryRun = await createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot });
    await assert.rejects(
      createIngressRecoverySnapshot({
        sourceRoot: f.sourceRoot,
        backupRoot: f.backupRoot,
        apply: true,
        expectedSourceIdentity: "0".repeat(64),
        expectedSourceDigest: dryRun.source_digest,
        approvalRef: "synthetic-approved",
      }),
      { code: "recovery_source_identity_mismatch" },
    );
    await assert.rejects(
      createIngressRecoverySnapshot({
        sourceRoot: f.sourceRoot,
        backupRoot: f.backupRoot,
        apply: true,
        expectedSourceIdentity: dryRun.source_identity_digest,
        expectedSourceDigest: dryRun.source_digest,
      }),
      { code: "recovery_approval_ref_required" },
    );
    assert.equal((await readdir(f.backupRoot)).length, 0);
  } finally {
    await f.cleanup();
  }
});

test("undeclared SQLite and source symlinks fail closed, while CLI output remains sanitized", async (t) => {
  const f = await fixture();
  try {
    await writeFile(join(f.sourceRoot, "undeclared.db"), "not-a-live-copy", "utf8");
    await assert.rejects(
      createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot }),
      { code: "recovery_sqlite_must_be_declared" },
    );
    await rm(join(f.sourceRoot, "undeclared.db"));
    const output = await runRecoveryCli([
      "snapshot",
      "--source-root", f.sourceRoot,
      "--backup-root", f.backupRoot,
    ]);
    const rendered = JSON.stringify(output);
    assert.equal(output.status, "dry_run_no_write");
    assert.ok(!rendered.includes(f.root));
    assert.ok(!rendered.includes("api-credentials.json"));

    const link = join(f.sourceRoot, "linked-payload");
    try {
      await symlink(join(f.sourceRoot, "storage_manifest.json"), link, "file");
    } catch (error) {
      if (error?.code === "EPERM" || error?.code === "EACCES") {
        try {
          await symlink(join(f.sourceRoot, "state"), link, "junction");
        } catch (junctionError) {
          if (junctionError?.code === "EPERM" || junctionError?.code === "EACCES") {
            t.skip("symlink and junction creation are unavailable on this Windows profile");
            return;
          }
          throw junctionError;
        }
      } else {
        throw error;
      }
    }
    await assert.rejects(
      createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot }),
      { code: "recovery_source_link_forbidden" },
    );
  } finally {
    await f.cleanup();
  }
});

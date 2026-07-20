import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  createIngressRecoverySnapshot as createIngressRecoverySnapshotImpl,
  verifyIngressRecoveryRestore as verifyIngressRecoveryRestoreImpl,
} from "./recovery.mjs";
import { runRecoveryCli } from "./recovery_cli.mjs";

const recoveryPolicyBySource = new Map();
const recoveryPolicyByBackup = new Map();

function createIngressRecoverySnapshot(options) {
  return createIngressRecoverySnapshotImpl({
    ...options,
    recoveryPolicyPath: options.recoveryPolicyPath ?? recoveryPolicyBySource.get(options.sourceRoot),
  });
}

function verifyIngressRecoveryRestore(options) {
  return verifyIngressRecoveryRestoreImpl({
    ...options,
    recoveryPolicyPath: options.recoveryPolicyPath ?? recoveryPolicyByBackup.get(options.backupRoot),
  });
}

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

function storageManifest() {
  const lanes = {
    mail: ["ingress/mailbox", "state/receipts/mail", "state/checkpoints/mail", "quarantine/mail"],
    voice: ["ingress/voice", "state/receipts/voice", "state/checkpoints/voice", "quarantine/voice"],
    team_files: ["ingress/team_files", "state/receipts/team_files", "state/checkpoints/team_files", "quarantine/team_files"],
    pc_activity: ["ingress/pc_activity", "state/receipts/pc_activity", "state/checkpoints/pc_activity", "quarantine/pc_activity"],
    run_logs: ["ingress/run_logs", "state/receipts/run_logs", "state/checkpoints/run_logs", "quarantine/run_logs"],
  };
  return {
    schema_version: "soulforge.hpp_private_custody.v1",
    custody_role: "hpp_sole_writer",
    cloud_sync_allowed: false,
    remote_direct_disk_access_allowed: false,
    payload_roots: Object.fromEntries(Object.entries(lanes).map(([lane, [payload]]) => [lane, payload])),
    state_roots: {
      receipts: "state/receipts",
      checkpoints: "state/checkpoints",
      leases: "state/leases",
      mail_candidate: "state/mail_candidate",
      outbox: "state/outbox",
    },
    lane_contracts: Object.fromEntries(Object.entries(lanes).map(([lane, [payload, receipt, checkpoint, quarantine]]) => [lane, {
      payload,
      receipt,
      checkpoint,
      quarantine,
      ...(lane === "voice" ? { acceptance_state: "state/receipts/voice" } : {}),
    }])),
    classification_policy: "stable_object_identity_with_project_binding_events",
    raw_in_workmeta_allowed: false,
    workspace_or_workmeta_relocation: false,
    config_roots: { mail_private: "config/mail_private" },
    runtime_roots: {
      erp: "runtime/erp",
      file_activity: "runtime/file_activity",
      mail_fetch: "runtime/mail_fetch",
      mcp: "ingress-mcp",
      voice: "runtime/voice",
    },
    voice_transfer_service_enabled: true,
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function recoveryPolicy(storageManifestSha256, writerAuthority = {}) {
  return {
    schema_version: "soulforge.hpp_ingress_recovery_policy.v1",
    policy_id: "task-engine-hpp-five-lane-ingress-recovery",
    scope: "five_lane_ingress_custody_continuity",
    guard_profile: "soulforge.ingress_recovery.fixed_guards.v1",
    storage_manifest: {
      ref: "storage_manifest.json",
      schema_version: "soulforge.hpp_private_custody.v1",
      sha256: storageManifestSha256,
    },
    lane_refs: [
      { writer_lane: "mail", manifest_lane: "mail", payload_ref: "ingress/mailbox", quarantine_ref: "quarantine/mail" },
      { writer_lane: "voice", manifest_lane: "voice", payload_ref: "ingress/voice", quarantine_ref: "quarantine/voice" },
      { writer_lane: "structured_pc_work", manifest_lane: "pc_activity", payload_ref: "ingress/pc_activity", quarantine_ref: "quarantine/pc_activity" },
      { writer_lane: "team_files", manifest_lane: "team_files", payload_ref: "ingress/team_files", quarantine_ref: "quarantine/team_files" },
      { writer_lane: "run_logs", manifest_lane: "run_logs", payload_ref: "ingress/run_logs", quarantine_ref: "quarantine/run_logs" },
    ],
    stable_state_refs: [
      { ref: "state/receipts", required: true },
      { ref: "state/checkpoints", required: true },
      { ref: "state/leases", required: true },
      { ref: "state/mail_candidate", required: true },
      { ref: "state/outbox", required: true },
    ],
    legacy_empty_refs: [
      { ref: "quarantine/files", required_empty: true },
    ],
    writer_authority: {
      record_ref: "state/writer_authority/active.json",
      schema_version: "soulforge.ingress.writer_authority.v1",
      required: writerAuthority.required ?? false,
      expected_sha256: writerAuthority.expected_sha256 ?? null,
    },
    excluded_refs: [
      "README.private.md",
      "backups",
      "config",
      "ingress-mcp",
      "manifests",
      "runtime",
      "state/backup_controller",
      "state/health",
    ],
    forbidden_capture_roots: [
      "backups",
      "config",
      "ingress-mcp",
      "manifests",
      "runtime",
      "state/backup_controller",
      "state/health",
    ],
  };
}

function writerAuthorityRecord() {
  const body = {
    schema_version: "soulforge.ingress.writer_authority.v1",
    authority_id: "task-engine-hpp-production-ingress",
    authority_scope: "raw_ingress_custody_only",
    epoch: 3,
    transition: "promote",
    mode: "primary",
    node_id: "hpp-test-node",
    primary_node_id: "hpp-test-node",
    fallback_node_id: "fallback-test-node",
    lanes: ["mail", "voice", "structured_pc_work", "team_files", "run_logs"],
    not_before: "2026-07-20T00:00:00.000Z",
    expires_at: "2026-07-21T00:00:00.000Z",
    owner_approval_ref: "OWNER-APPROVAL-SYNTHETIC",
    previous_digest: "1".repeat(64),
    revoked_digest: null,
    revoked_epoch: null,
    revoked_mode: null,
    revoked_node_id: null,
    request_digest: "2".repeat(64),
  };
  return { ...body, record_digest: sha256(JSON.stringify(Object.fromEntries(Object.entries(body).sort()))) };
}

async function resealManifest(generationRoot, mutate) {
  const manifestPath = join(generationRoot, "manifest.json");
  const commitPath = join(generationRoot, "COMMITTED.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  mutate(manifest);
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(manifestPath, bytes);
  const commit = JSON.parse(await readFile(commitPath, "utf8"));
  commit.manifest_sha256 = sha256(bytes);
  await writeJson(commitPath, commit);
  return commit.manifest_sha256;
}

function networkMetadataHydration({ phase, identity }) {
  return phase === "before" ? identity : {
    ...identity,
    ino: identity.ino + 1n,
    ctimeNs: identity.ctimeNs + 1n,
  };
}

function networkMtimeDrift({ phase, identity }) {
  return phase === "before" ? identity : {
    ...identity,
    mtimeNs: identity.mtimeNs + 1n,
  };
}

async function fixture({ sqlite = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "soulforge-ingress-recovery-"));
  const sourceRoot = join(root, "source");
  const backupRoot = join(root, "backup");
  const restoreRoot = join(root, "restore");
  const recoveryPolicyPath = join(root, "recovery-policy.json");
  await Promise.all([sourceRoot, backupRoot, restoreRoot].map((path) => mkdir(path)));
  for (const name of ["backups", "config", "ingress", "ingress-mcp", "manifests", "quarantine", "runtime", "state"]) {
    await mkdir(join(sourceRoot, name));
  }
  await writeFile(join(sourceRoot, "README.private.md"), "Synthetic private-custody root.\n", "utf8");
  const manifestBytes = Buffer.from(`${JSON.stringify(storageManifest(), null, 2)}\n`, "utf8");
  await writeFile(join(sourceRoot, "storage_manifest.json"), manifestBytes);
  await writeJson(recoveryPolicyPath, recoveryPolicy(sha256(manifestBytes)));
  for (const name of ["mailbox", "voice", "pc_activity", "team_files", "run_logs"]) {
    await mkdir(join(sourceRoot, "ingress", name));
  }
  for (const name of ["mail", "voice", "pc_activity", "team_files", "run_logs"]) {
    await mkdir(join(sourceRoot, "quarantine", name));
    await writeJson(join(sourceRoot, "quarantine", name, "synthetic.json"), { lane: name });
  }
  await mkdir(join(sourceRoot, "quarantine", "files"));
  for (const name of ["receipts", "checkpoints", "leases", "mail_candidate", "outbox", "health"]) {
    await mkdir(join(sourceRoot, "state", name));
  }
  await writeJson(join(sourceRoot, "ingress", "mailbox", "synthetic.json"), { lane: "mail" });
  await writeJson(join(sourceRoot, "ingress", "pc_activity", "synthetic.json"), { lane: "pc_activity" });
  await writeJson(join(sourceRoot, "ingress", "run_logs", "synthetic.json"), { lane: "run_logs" });
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
  await writeFile(join(sourceRoot, "state", "leases", "continuous_ingress", "active.lock.json.recovery"), "ephemeral", "utf8");
  await writeFile(join(sourceRoot, "state", "leases", "continuous_ingress", "active.lock.json.candidate-synthetic"), "ephemeral", "utf8");
  await writeFile(join(sourceRoot, "state", "leases", "continuous_ingress", "writer.json.cas.lock"), "ephemeral", "utf8");
  await writeFile(join(sourceRoot, "state", "leases", "continuous_ingress", "writer.json.cas.lock.recovery"), "ephemeral", "utf8");
  await writeFile(join(sourceRoot, "state", "leases", "continuous_ingress", "ingress-mcp.lock"), "ephemeral", "utf8");
  await writeFile(join(sourceRoot, "state", "leases", "continuous_ingress", "ingress-mcp.partial"), "ephemeral", "utf8");
  await writeFile(join(sourceRoot, "ingress", "team_files", "incoming", "payload.bin.partial-synthetic"), "ephemeral", "utf8");
  await writeJson(join(sourceRoot, "state", "checkpoints", "team_files", "checkpoint.json"), {
    schema_version: "synthetic.checkpoint.v1",
    lease_epoch: 6,
  });
  await writeJson(join(sourceRoot, "state", "receipts", "mail", "synthetic.json"), { lane: "mail" });
  await writeJson(join(sourceRoot, "state", "mail_candidate", "synthetic.json"), { state: "candidate" });
  await writeJson(join(sourceRoot, "state", "outbox", "synthetic.json"), { state: "outbox" });
  const configRoot = join(sourceRoot, "config", "private");
  await mkdir(configRoot, { recursive: true });
  await writeFile(join(configRoot, ".env"), "SYNTHETIC_SECRET=must-not-copy\n", "utf8");
  await writeJson(join(configRoot, "api-credentials.json"), { value: "must-not-copy" });
  await writeFile(join(configRoot, "browser-auth.session"), "must-not-copy", "utf8");
  await writeFile(join(sourceRoot, "state", "health", "api-token.json"), "excluded-health", "utf8");
  await mkdir(join(sourceRoot, "backups", "prior"), { recursive: true });
  await writeFile(join(sourceRoot, "backups", "prior", "old.db"), "old-backup", "utf8");

  let database = null;
  let sqlitePath = null;
  if (sqlite) {
    await mkdir(join(root, "database"), { recursive: true });
    sqlitePath = join(root, "database", "ingress.sqlite3");
    database = new DatabaseSync(sqlitePath);
    database.exec("PRAGMA journal_mode=WAL");
    database.exec("CREATE TABLE ingress_event(id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT");
    database.exec("INSERT INTO ingress_event(value) VALUES ('synthetic')");
  }
  recoveryPolicyBySource.set(sourceRoot, recoveryPolicyPath);
  recoveryPolicyByBackup.set(backupRoot, recoveryPolicyPath);
  return {
    root,
    sourceRoot,
    backupRoot,
    restoreRoot,
    recoveryPolicyPath,
    sqlitePath,
    database,
    async rewriteRecoveryPolicy(writerAuthority = {}) {
      const bytes = await readFile(join(sourceRoot, "storage_manifest.json"));
      await writeJson(recoveryPolicyPath, recoveryPolicy(sha256(bytes), writerAuthority));
    },
    async cleanup() {
      recoveryPolicyBySource.delete(sourceRoot);
      recoveryPolicyByBackup.delete(backupRoot);
      try { database?.close(); } catch { /* test cleanup */ }
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("snapshot requires an external exact recovery policy and its storage-manifest byte pin", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      createIngressRecoverySnapshotImpl({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot }),
      { code: "recovery_policy_path_absolute_required" },
    );
    const policy = JSON.parse(await readFile(f.recoveryPolicyPath, "utf8"));
    await writeJson(f.recoveryPolicyPath, { ...policy, unexpected: true });
    await assert.rejects(
      createIngressRecoverySnapshotImpl({
        sourceRoot: f.sourceRoot,
        backupRoot: f.backupRoot,
        recoveryPolicyPath: f.recoveryPolicyPath,
      }),
      { code: "recovery_policy_invalid" },
    );
    await f.rewriteRecoveryPolicy();
    await appendFile(join(f.sourceRoot, "storage_manifest.json"), "\n", "utf8");
    await assert.rejects(
      createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot }),
      { code: "recovery_storage_manifest_sha256_mismatch" },
    );
  } finally {
    await f.cleanup();
  }
});

test("unknown state children fail before included files open and secret-like included entries fail closed", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.sourceRoot, "state", "unknown_state"));
    let includedFileOpened = false;
    await assert.rejects(
      createIngressRecoverySnapshot({
        sourceRoot: f.sourceRoot,
        backupRoot: f.backupRoot,
        testHooks: { beforeIncludedFileRead: () => { includedFileOpened = true; } },
      }),
      { code: "recovery_state_child_undeclared" },
    );
    assert.equal(includedFileOpened, false);
    await rm(join(f.sourceRoot, "state", "unknown_state"), { recursive: true });
    await writeFile(
      join(f.sourceRoot, "ingress", "team_files", "incoming", "api-token.json"),
      "must-not-capture",
      "utf8",
    );
    await assert.rejects(
      createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot }),
      { code: "recovery_included_secret_like_entry" },
    );
    assert.deepEqual(await readdir(f.backupRoot), []);
  } finally {
    await f.cleanup();
  }
});

test("declared legacy quarantine/files must be a plain empty directory before included content opens", async () => {
  const f = await fixture();
  try {
    const positive = await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
    });
    assert.equal(positive.status, "dry_run_no_write");
    await writeFile(join(f.sourceRoot, "quarantine", "files", "legacy.bin"), "legacy", "utf8");
    let includedFileOpened = false;
    await assert.rejects(
      createIngressRecoverySnapshot({
        sourceRoot: f.sourceRoot,
        backupRoot: f.backupRoot,
        testHooks: { beforeIncludedFileRead: () => { includedFileOpened = true; } },
      }),
      { code: "recovery_legacy_empty_ref_not_empty" },
    );
    assert.equal(includedFileOpened, false);
    assert.deepEqual(await readdir(f.backupRoot), []);
  } finally {
    await f.cleanup();
  }
});

test("writer authority is optional when absent and exact-required when pinned", async () => {
  const f = await fixture();
  try {
    const optional = await createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot });
    assert.equal(optional.writer_authority_present, false);
    await f.rewriteRecoveryPolicy({ required: true });
    await assert.rejects(
      createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot }),
      { code: "recovery_writer_authority_missing" },
    );
    const record = writerAuthorityRecord();
    const recordPath = join(f.sourceRoot, "state", "writer_authority", "active.json");
    await writeJson(recordPath, record);
    const recordSha256 = sha256(await readFile(recordPath));
    await f.rewriteRecoveryPolicy({ required: true, expected_sha256: recordSha256 });
    const dryRun = await createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot });
    assert.equal(dryRun.writer_authority_present, true);
    assert.equal(dryRun.writer_authority_epoch, 3);
    assert.equal(dryRun.writer_authority_digest, record.record_digest);
    await f.rewriteRecoveryPolicy({ required: true, expected_sha256: "0".repeat(64) });
    await assert.rejects(
      createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot }),
      { code: "recovery_writer_authority_sha256_mismatch" },
    );
    await f.rewriteRecoveryPolicy({ required: true, expected_sha256: recordSha256 });
    const approvalRef = "synthetic-writer-authority";
    const applied = await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
      generationId: "igr_synthetic_writer_authority",
      apply: true,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef,
    });
    const restored = await verifyIngressRecoveryRestore({
      backupRoot: f.backupRoot,
      generationId: applied.generation_id,
      restoreRoot: f.restoreRoot,
      apply: true,
      expectedManifestSha256: applied.manifest_sha256,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef,
    });
    assert.equal(restored.writer_authority_epoch, 3);
    assert.deepEqual(
      JSON.parse(await readFile(join(f.restoreRoot, "restored", "state", "writer_authority", "active.json"), "utf8")),
      record,
    );
  } finally {
    await f.cleanup();
  }
});

test("apply rejects a mixed-time source drift between object copy and exact rescan", async () => {
  const f = await fixture();
  try {
    const dryRun = await createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot });
    let scanCount = 0;
    await assert.rejects(
      createIngressRecoverySnapshot({
        sourceRoot: f.sourceRoot,
        backupRoot: f.backupRoot,
        generationId: "igr_synthetic_mixed_time_drift",
        apply: true,
        expectedSourceIdentity: dryRun.source_identity_digest,
        expectedSourceDigest: dryRun.source_digest,
        approvalRef: "synthetic-mixed-time-drift",
        testHooks: {
          beforeIncludedFileRead: async ({ ref }) => {
            if (ref !== "storage_manifest.json" || ++scanCount !== 2) return;
            await writeFile(
              join(f.sourceRoot, "ingress", "team_files", "incoming", "payload.bin"),
              "payload-v2",
              "utf8",
            );
          },
        },
      }),
      { code: "recovery_source_changed_during_snapshot" },
    );
  } finally {
    await f.cleanup();
  }
});

test("snapshot restores five lanes, quarantines, and stable state while excluded roots remain metadata-only", async () => {
  const f = await fixture({ sqlite: true });
  try {
    assert.equal(Object.keys(storageManifest()).length, 13);
    assert.equal((await readdir(f.sourceRoot)).length, 10);
    assert.equal((await readdir(join(f.sourceRoot, "state"))).length, 6);
    assert.equal((await readdir(join(f.sourceRoot, "ingress"))).length, 5);
    assert.equal((await readdir(join(f.sourceRoot, "quarantine"))).length, 6);
    assert.deepEqual(await readdir(join(f.sourceRoot, "quarantine", "files")), []);
    await mkdir(join(f.sourceRoot, "state", "backup_controller"));
    await writeJson(join(f.sourceRoot, "state", "backup_controller", "controller-ledger.json"), {
      schema_version: "synthetic.backup_controller.v1",
      reseed_source: "external_receipts",
    });
    await writeFile(join(f.sourceRoot, "state", "backup_controller", "api-token.json"), "must-not-open", "utf8");
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
    assert.equal(dryRun.exclusions.ephemeral_files, 7);
    assert.equal(dryRun.exclusions.secret_like_entries, 0);
    assert.equal(dryRun.exclusions.prior_backup_roots, 1);
    assert.equal(dryRun.writer_authority_present, false);
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
    for (const ref of [
      "ingress/mailbox/synthetic.json",
      "ingress/pc_activity/synthetic.json",
      "ingress/run_logs/synthetic.json",
      "quarantine/mail/synthetic.json",
      "quarantine/voice/synthetic.json",
      "quarantine/pc_activity/synthetic.json",
      "quarantine/team_files/synthetic.json",
      "quarantine/run_logs/synthetic.json",
      "state/receipts/mail/synthetic.json",
      "state/checkpoints/team_files/checkpoint.json",
      "state/leases/continuous_ingress/epoch.json",
      "state/mail_candidate/synthetic.json",
      "state/outbox/synthetic.json",
    ]) assert.ok(refs.includes(ref), ref);
    assert.ok(!refs.includes("state/leases/continuous_ingress/active.lock.json"));
    assert.ok(!refs.some((ref) => /(?:\.cas\.lock|\.candidate-|\.recovery$|\.partial(?:-|$)|\.lock$)/u.test(ref)));
    assert.ok(!refs.some((ref) => ref.includes(".env") || ref.includes("credentials")));
    assert.ok(!refs.some((ref) => ref.startsWith("backups/")));
    assert.ok(!refs.some((ref) => ref.startsWith("quarantine/files/")));
    assert.ok(!refs.some((ref) => ref.startsWith("config/")
      || ref.startsWith("state/backup_controller/")
      || ref.startsWith("state/health/")));
    assert.ok(!refs.some((ref) => /\.sqlite3(?:-|$)/u.test(ref)));
    assert.equal(manifest.custody.max_observed_epoch, 7);
    assert.equal(manifest.database_snapshot.kind, "sqlite_vacuum_snapshot");
    assert.equal(manifest.recovery_policy.sha256, dryRun.recovery_policy_sha256);
    assert.deepEqual(manifest.recovery_policy.legacy_empty_refs, [
      { ref: "quarantine/files", required_empty: true },
    ]);
    assert.equal(manifest.storage_manifest.sha256, dryRun.storage_manifest_sha256);
    assert.ok(!JSON.stringify(manifest.database_snapshot).includes(f.sqlitePath));

    const dryRestore = await verifyIngressRecoveryRestore({
      backupRoot: f.backupRoot,
      generationId: applied.generation_id,
      restoreRoot: f.restoreRoot,
    });
    assert.equal(dryRestore.status, "observed_unanchored_no_write");
    assert.equal(dryRestore.manifest_sha256, applied.manifest_sha256);
    assert.equal((await readdir(f.restoreRoot)).length, 0);

    await assert.rejects(
      verifyIngressRecoveryRestore({
        backupRoot: f.backupRoot,
        generationId: applied.generation_id,
        restoreRoot: f.restoreRoot,
        apply: true,
        expectedSourceIdentity: dryRun.source_identity_digest,
        expectedSourceDigest: dryRun.source_digest,
        approvalRef,
      }),
      { code: "recovery_expected_manifest_sha256_required" },
    );

    const restored = await verifyIngressRecoveryRestore({
      backupRoot: f.backupRoot,
      generationId: applied.generation_id,
      restoreRoot: f.restoreRoot,
      apply: true,
      expectedManifestSha256: applied.manifest_sha256,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef,
    });
    assert.equal(restored.status, "restore_verified");
    assert.equal(restored.live_root_overwritten, false);
    assert.equal(restored.restore_subdirectory, "restored");
    const restoredRoot = join(f.restoreRoot, restored.restore_subdirectory);
    assert.equal(await exists(join(restoredRoot, "state", "leases", "continuous_ingress", "active.lock.json")), false);
    assert.equal(await exists(join(restoredRoot, "config")), false);
    assert.equal(await exists(join(restoredRoot, "quarantine", "files")), false);
    assert.equal(await exists(join(restoredRoot, "state", "backup_controller")), false);
    assert.equal(await exists(join(restoredRoot, "state", "health")), false);
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
    assert.equal(
      await readFile(join(f.sourceRoot, "config", "private", ".env"), "utf8"),
      "SYNTHETIC_SECRET=must-not-copy\n",
    );
    assert.equal(await exists(join(f.sourceRoot, "state", "leases", "continuous_ingress", "active.lock.json")), true);
    assert.equal(await exists(join(f.sourceRoot, "state", "backup_controller", "controller-ledger.json")), true);
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
        expectedManifestSha256: applied.manifest_sha256,
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

test("restore staging identity failure reports that cleanup was not confirmed", async () => {
  const f = await fixture();
  try {
    const dryRun = await createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot });
    const approvalRef = "synthetic-restore-mkdir-identity";
    const applied = await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
      generationId: "igr_synthetic_restore_mkdir_identity",
      apply: true,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef,
    });
    let replacementRoot = null;
    await assert.rejects(
      verifyIngressRecoveryRestore({
        backupRoot: f.backupRoot,
        generationId: applied.generation_id,
        restoreRoot: f.restoreRoot,
        apply: true,
        expectedManifestSha256: applied.manifest_sha256,
        expectedSourceIdentity: dryRun.source_identity_digest,
        expectedSourceDigest: dryRun.source_digest,
        approvalRef,
        testHooks: {
          afterRestoreStagingMkdir: async ({ path }) => {
            replacementRoot = path;
            await rename(path, `${path}.displaced-owned`);
            await mkdir(path);
            await writeFile(join(path, "foreign-owned.txt"), "foreign", "utf8");
          },
        },
      }),
      (error) => {
        assert.equal(error.code, "recovery_restore_cleanup_unsafe");
        assert.equal(error.mutationStatus, "cleanup_not_confirmed");
        return true;
      },
    );
    assert.ok(replacementRoot);
    assert.equal(await readFile(join(replacementRoot, "foreign-owned.txt"), "utf8"), "foreign");
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
          afterSnapshotStagingMkdir: async ({ path }) => {
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
      (error) => {
        assert.equal(error.code, "recovery_snapshot_cleanup_unsafe");
        assert.equal(error.mutationStatus, "cleanup_not_confirmed");
        return true;
      },
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
    const undeclaredDatabase = join(f.sourceRoot, "ingress", "team_files", "undeclared.db");
    await writeFile(undeclaredDatabase, "not-a-live-copy", "utf8");
    await assert.rejects(
      createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot }),
      { code: "recovery_sqlite_must_be_declared" },
    );
    await rm(undeclaredDatabase);
    const output = await runRecoveryCli([
      "snapshot",
      "--source-root", f.sourceRoot,
      "--backup-root", f.backupRoot,
      "--recovery-policy", f.recoveryPolicyPath,
    ]);
    const rendered = JSON.stringify(output);
    assert.equal(output.status, "dry_run_no_write");
    assert.ok(!rendered.includes(f.root));
    assert.ok(!rendered.includes("api-credentials.json"));

    const link = join(f.sourceRoot, "ingress", "team_files", "incoming", "linked-payload");
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

test("snapshot requires the exact HPP storage manifest and rejects undeclared top-level config", async () => {
  const f = await fixture();
  try {
    await writeJson(join(f.sourceRoot, "storage_manifest.json"), {
      ...storageManifest(),
      unexpected: true,
    });
    await f.rewriteRecoveryPolicy();
    await assert.rejects(
      createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot }),
      { code: "recovery_storage_manifest_invalid" },
    );
    await writeJson(join(f.sourceRoot, "storage_manifest.json"), storageManifest());
    await f.rewriteRecoveryPolicy();
    await writeFile(join(f.sourceRoot, "settings.json"), "synthetic-config-must-not-be-read", "utf8");
    await assert.rejects(
      createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot }),
      { code: "recovery_source_top_level_undeclared" },
    );
    assert.deepEqual(await readdir(f.backupRoot), []);
  } finally {
    await f.cleanup();
  }
});

test("resealed manifest is rejected by the caller's external anchor before restore writes", async () => {
  const f = await fixture();
  try {
    const dryRun = await createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot });
    const approvalRef = "synthetic-external-anchor";
    const applied = await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
      generationId: "igr_synthetic_resealed_anchor",
      apply: true,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef,
    });
    const generationRoot = join(f.backupRoot, "generations", applied.generation_id);
    const resealedSha256 = await resealManifest(generationRoot, (manifest) => {
      manifest.created_at = "2026-07-20T01:00:00.000Z";
    });
    assert.notEqual(resealedSha256, applied.manifest_sha256);
    const observed = await verifyIngressRecoveryRestore({
      backupRoot: f.backupRoot,
      generationId: applied.generation_id,
      restoreRoot: f.restoreRoot,
    });
    assert.equal(observed.status, "observed_unanchored_no_write");
    assert.equal(observed.manifest_sha256, resealedSha256);
    await assert.rejects(
      verifyIngressRecoveryRestore({
        backupRoot: f.backupRoot,
        generationId: applied.generation_id,
        restoreRoot: f.restoreRoot,
        apply: true,
        expectedManifestSha256: applied.manifest_sha256,
        expectedSourceIdentity: dryRun.source_identity_digest,
        expectedSourceDigest: dryRun.source_digest,
        approvalRef,
      }),
      { code: "recovery_manifest_sha256_mismatch" },
    );
    assert.deepEqual(await readdir(f.restoreRoot), []);
  } finally {
    await f.cleanup();
  }
});

test("v2 source digest is recomputed from its canonical manifest basis", async () => {
  const f = await fixture();
  try {
    const dryRun = await createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot });
    const applied = await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
      generationId: "igr_synthetic_source_digest_reseal",
      apply: true,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef: "synthetic-source-digest",
    });
    const generationRoot = join(f.backupRoot, "generations", applied.generation_id);
    await resealManifest(generationRoot, (manifest) => { manifest.source_digest = "0".repeat(64); });
    await assert.rejects(
      verifyIngressRecoveryRestore({
        backupRoot: f.backupRoot,
        generationId: applied.generation_id,
        restoreRoot: f.restoreRoot,
      }),
      { code: "recovery_manifest_source_digest_mismatch" },
    );
  } finally {
    await f.cleanup();
  }
});

test("snapshot and restore publication reject an injected extra tree entry", async () => {
  const snapshotFixture = await fixture();
  try {
    const dryRun = await createIngressRecoverySnapshot({
      sourceRoot: snapshotFixture.sourceRoot,
      backupRoot: snapshotFixture.backupRoot,
    });
    await assert.rejects(
      createIngressRecoverySnapshot({
        sourceRoot: snapshotFixture.sourceRoot,
        backupRoot: snapshotFixture.backupRoot,
        generationId: "igr_synthetic_snapshot_extra",
        apply: true,
        expectedSourceIdentity: dryRun.source_identity_digest,
        expectedSourceDigest: dryRun.source_digest,
        approvalRef: "synthetic-snapshot-extra",
        testHooks: {
          beforeSnapshotPublication: async ({ path }) => writeFile(join(path, "injected-extra"), "extra", "utf8"),
        },
      }),
      { code: "recovery_generation_tree_mismatch" },
    );
    assert.deepEqual(await readdir(join(snapshotFixture.backupRoot, "generations")), []);
    await assert.rejects(
      createIngressRecoverySnapshot({
        sourceRoot: snapshotFixture.sourceRoot,
        backupRoot: snapshotFixture.backupRoot,
        generationId: "igr_synthetic_snapshot_verify_race",
        apply: true,
        expectedSourceIdentity: dryRun.source_identity_digest,
        expectedSourceDigest: dryRun.source_digest,
        approvalRef: "synthetic-snapshot-verify-race",
        testHooks: {
          afterSnapshotVerificationBeforePublication: async ({ path }) => writeFile(
            join(path, "injected-after-verification"),
            "extra",
            "utf8",
          ),
        },
      }),
      { code: "recovery_generation_tree_mismatch" },
    );
    assert.deepEqual(await readdir(join(snapshotFixture.backupRoot, "generations")), []);
    await assert.rejects(
      createIngressRecoverySnapshot({
        sourceRoot: snapshotFixture.sourceRoot,
        backupRoot: snapshotFixture.backupRoot,
        generationId: "igr_synthetic_snapshot_final_marker_race",
        apply: true,
        expectedSourceIdentity: dryRun.source_identity_digest,
        expectedSourceDigest: dryRun.source_digest,
        approvalRef: "synthetic-snapshot-final-marker-race",
        testHooks: {
          afterSnapshotRenameBeforeCommitVerification: async ({ path }) => writeFile(
            join(path, "injected-after-rename"),
            "extra",
            "utf8",
          ),
        },
      }),
      (error) => {
        assert.equal(error.code, "recovery_generation_tree_mismatch");
        assert.equal(error.mutationStatus, "renamed_uncommitted_generation");
        return true;
      },
    );
    const uncommitted = join(
      snapshotFixture.backupRoot,
      "generations",
      "igr_synthetic_snapshot_final_marker_race",
    );
    assert.equal(await exists(join(uncommitted, "COMMITTED.json")), false);
  } finally {
    await snapshotFixture.cleanup();
  }

  const restoreFixture = await fixture();
  try {
    const dryRun = await createIngressRecoverySnapshot({
      sourceRoot: restoreFixture.sourceRoot,
      backupRoot: restoreFixture.backupRoot,
    });
    const approvalRef = "synthetic-restore-extra";
    const applied = await createIngressRecoverySnapshot({
      sourceRoot: restoreFixture.sourceRoot,
      backupRoot: restoreFixture.backupRoot,
      generationId: "igr_synthetic_restore_extra",
      apply: true,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef,
    });
    await assert.rejects(
      verifyIngressRecoveryRestore({
        backupRoot: restoreFixture.backupRoot,
        generationId: applied.generation_id,
        restoreRoot: restoreFixture.restoreRoot,
        apply: true,
        expectedManifestSha256: applied.manifest_sha256,
        expectedSourceIdentity: dryRun.source_identity_digest,
        expectedSourceDigest: dryRun.source_digest,
        approvalRef,
        testHooks: {
          beforeRestorePublication: async ({ path }) => writeFile(join(path, "injected-extra"), "extra", "utf8"),
        },
      }),
      { code: "recovery_restored_tree_mismatch" },
    );
    assert.deepEqual(await readdir(restoreFixture.restoreRoot), []);
    await assert.rejects(
      verifyIngressRecoveryRestore({
        backupRoot: restoreFixture.backupRoot,
        generationId: applied.generation_id,
        restoreRoot: restoreFixture.restoreRoot,
        apply: true,
        expectedManifestSha256: applied.manifest_sha256,
        expectedSourceIdentity: dryRun.source_identity_digest,
        expectedSourceDigest: dryRun.source_digest,
        approvalRef,
        testHooks: {
          afterRestoreVerificationBeforePublication: async ({ path }) => writeFile(
            join(path, "injected-after-verification"),
            "extra",
            "utf8",
          ),
        },
      }),
      { code: "recovery_restored_tree_mismatch" },
    );
    assert.deepEqual(await readdir(restoreFixture.restoreRoot), []);
    await assert.rejects(
      verifyIngressRecoveryRestore({
        backupRoot: restoreFixture.backupRoot,
        generationId: applied.generation_id,
        restoreRoot: restoreFixture.restoreRoot,
        apply: true,
        expectedManifestSha256: applied.manifest_sha256,
        expectedSourceIdentity: dryRun.source_identity_digest,
        expectedSourceDigest: dryRun.source_digest,
        approvalRef,
        testHooks: {
          afterRestoreRenameBeforeVerification: async ({ path }) => writeFile(
            join(path, "injected-after-rename"),
            "extra",
            "utf8",
          ),
        },
      }),
      (error) => {
        assert.equal(error.code, "recovery_restored_tree_mismatch");
        assert.equal(error.mutationStatus, "published_restore_quarantined");
        return true;
      },
    );
    const quarantined = await readdir(restoreFixture.restoreRoot);
    assert.equal(quarantined.length, 1);
    assert.match(quarantined[0], /^\.rejected-ingress-restore-/u);
    assert.equal(await exists(join(restoreFixture.restoreRoot, "restored")), false);
  } finally {
    await restoreFixture.cleanup();
  }
});

test("hash-pinned network reads allow only anchored inode/ctime hydration", async () => {
  const f = await fixture();
  try {
    const dryRun = await createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot });
    const approvalRef = "synthetic-network-metadata-hydration";
    const applied = await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
      generationId: "igr_synthetic_metadata_hydration",
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
        testHooks: { backupStatFixture: networkMetadataHydration },
      }),
      { code: "recovery_commit_unsafe" },
    );
    const anchoredDryRun = await verifyIngressRecoveryRestore({
      backupRoot: f.backupRoot,
      generationId: applied.generation_id,
      restoreRoot: f.restoreRoot,
      expectedManifestSha256: applied.manifest_sha256,
      testHooks: { backupStatFixture: networkMetadataHydration },
    });
    assert.equal(anchoredDryRun.status, "dry_run_verified_no_write");
    await assert.rejects(
      verifyIngressRecoveryRestore({
        backupRoot: f.backupRoot,
        generationId: applied.generation_id,
        restoreRoot: f.restoreRoot,
        expectedManifestSha256: applied.manifest_sha256,
        testHooks: { backupStatFixture: networkMtimeDrift },
      }),
      { code: "recovery_commit_unsafe" },
    );
    const restored = await verifyIngressRecoveryRestore({
      backupRoot: f.backupRoot,
      generationId: applied.generation_id,
      restoreRoot: f.restoreRoot,
      apply: true,
      expectedManifestSha256: applied.manifest_sha256,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef,
      testHooks: { backupStatFixture: networkMetadataHydration },
    });
    assert.equal(restored.status, "restore_verified");
  } finally {
    await f.cleanup();
  }
});

test("legacy v1 generation remains usable only with an external manifest anchor", async () => {
  const f = await fixture();
  try {
    const dryRun = await createIngressRecoverySnapshot({ sourceRoot: f.sourceRoot, backupRoot: f.backupRoot });
    const approvalRef = "synthetic-legacy-anchor";
    const applied = await createIngressRecoverySnapshot({
      sourceRoot: f.sourceRoot,
      backupRoot: f.backupRoot,
      generationId: "igr_synthetic_legacy_v1",
      apply: true,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef,
    });
    const generationRoot = join(f.backupRoot, "generations", applied.generation_id);
    const legacySha256 = await resealManifest(generationRoot, (manifest) => {
      manifest.schema_version = "soulforge.ingress.recovery_manifest.v1";
      delete manifest.source_database;
      delete manifest.recovery_policy;
      delete manifest.storage_manifest;
      delete manifest.writer_authority;
    });
    const anchored = await verifyIngressRecoveryRestoreImpl({
      backupRoot: f.backupRoot,
      generationId: applied.generation_id,
      restoreRoot: f.restoreRoot,
      expectedManifestSha256: legacySha256,
    });
    assert.equal(anchored.status, "dry_run_verified_no_write");
    assert.equal(anchored.manifest_validation, "legacy_external_anchor_required");
    const restored = await verifyIngressRecoveryRestoreImpl({
      backupRoot: f.backupRoot,
      generationId: applied.generation_id,
      restoreRoot: f.restoreRoot,
      apply: true,
      expectedManifestSha256: legacySha256,
      expectedSourceIdentity: dryRun.source_identity_digest,
      expectedSourceDigest: dryRun.source_digest,
      approvalRef,
    });
    assert.equal(restored.status, "restore_verified");
  } finally {
    await f.cleanup();
  }
});

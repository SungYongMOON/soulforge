import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  createAttachmentManifest,
  createAttachmentManifestRecord,
  createOpaqueAttachmentId,
} from "../src/codex_attachment_registry.mjs";
import { createCodexMessagePayloadStore } from "../src/codex_message_payload_store.mjs";
import {
  CODEX_PAYLOAD_BACKUP_SCHEMA,
  CodexPayloadBackupError,
  createCodexPayloadBackup,
  parseCodexPayloadBackupCli,
  restoreAndVerifyCodexPayloadBackup,
} from "../tools/codex_payload_backup.mjs";
import { runRuntimeReleaseAudit } from "../tools/runtime_release_audit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = resolve(HERE, "..", "tools", "codex_payload_backup.mjs");
const MESSAGE_TEXT = "private message body that must never enter backup reports";
const ATTACHMENT_NAME = "private-source-name.txt";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function findNamed(root, name, output = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const candidate = join(root, entry.name);
    if (entry.isDirectory()) findNamed(candidate, name, output);
    else if (entry.name === name) output.push(candidate);
  }
  return output;
}

function expectBackupError(fn, codes) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof CodexPayloadBackupError);
    assert.ok(new Set(codes).has(error.code), `unexpected error code: ${error.code}`);
    assert.equal(error.message, error.code);
    return true;
  });
}

async function createFixture({ nasNamespaces = false } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "dev-erp-codex-backup-"));
  const databaseDir = join(root, "database");
  const attachmentRoot = join(root, "attachments");
  const messageRoot = join(root, "message-owner");
  const nasRoot = join(root, "nas");
  const backupRoot = nasNamespaces ? join(nasRoot, "03_codex_payload_backups") : join(root, "backups");
  const restoreRoot = nasNamespaces ? join(nasRoot, "04_codex_payload_restore_tests") : join(root, "restores");
  for (const directory of [databaseDir, attachmentRoot, messageRoot, backupRoot, restoreRoot]) {
    mkdirSync(directory, { recursive: true });
  }

  const itemId = "IT-001";
  const payloadStore = await createCodexMessagePayloadStore({ root: messageRoot });
  const payload = await payloadStore.writeMessagePayload({ itemId, role: "user", text: MESSAGE_TEXT });
  const dbPath = join(databaseDir, "dev-erp.db");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec(`CREATE TABLE codex_thread_message (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    payload_ref TEXT,
    payload_byte_length INTEGER,
    payload_sha256 TEXT
  )`);
  db.prepare(
    `INSERT INTO codex_thread_message(item_id,role,text,payload_ref,payload_byte_length,payload_sha256)
     VALUES(?,?,?,?,?,?)`,
  ).run(itemId, "user", payload.payload_ref, payload.payload_ref, payload.byte_length, payload.sha256);

  const attachmentBytes = Buffer.from("immutable attachment payload", "utf8");
  const attachmentId = createOpaqueAttachmentId();
  const storedName = `${attachmentId}.txt`;
  const itemAttachmentDirectory = join(attachmentRoot, itemId);
  mkdirSync(itemAttachmentDirectory);
  const attachmentPath = join(itemAttachmentDirectory, storedName);
  writeFileSync(attachmentPath, attachmentBytes, { flag: "wx", mode: 0o600 });
  const record = createAttachmentManifestRecord({
    attachment_id: attachmentId,
    item_id: itemId,
    name: ATTACHMENT_NAME,
    stored_name: storedName,
    size: attachmentBytes.length,
    sha256: sha256(attachmentBytes),
    type: "localFile",
  });
  const manifest = createAttachmentManifest({ item_id: itemId, attachments: [record] });
  writeFileSync(
    join(itemAttachmentDirectory, "codex-attachment-manifest.v1.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );

  return {
    root,
    db,
    dbPath,
    itemId,
    payload,
    attachmentId,
    storedName,
    attachmentPath,
    attachmentRoot,
    messageRoot,
    nasRoot,
    backupRoot,
    restoreRoot,
  };
}

function backupFixture(fixture, generationId) {
  return createCodexPayloadBackup({
    dbPath: fixture.dbPath,
    attachmentRoot: fixture.attachmentRoot,
    messagePayloadRoot: fixture.messageRoot,
    backupRoot: fixture.backupRoot,
    generationId,
    now: new Date("2026-07-10T01:02:03.000Z"),
  });
}

test("payload backup is WAL-safe, pointer-coherent, metadata-only, and atomically restorable", async (t) => {
  const fixture = await createFixture();
  t.after(() => {
    try { fixture.db.close(); } catch {}
    rmSync(fixture.root, { recursive: true, force: true });
  });
  const generationId = "cpb_wal_restore_0001";

  // The writer connection deliberately stays open in WAL mode while VACUUM INTO snapshots it.
  const backup = backupFixture(fixture, generationId);
  assert.equal(backup.ok, true);
  assert.equal(backup.database.quick_check, "ok");
  assert.deepEqual(backup.messages, { count: 1, bytes: Buffer.byteLength(MESSAGE_TEXT) });
  assert.deepEqual(backup.attachments, { count: 1, bytes: Buffer.byteLength("immutable attachment payload") });
  assert.match(backup.manifest_sha256, /^[a-f0-9]{64}$/);

  const publicJson = JSON.stringify(backup);
  for (const forbidden of [fixture.root, fixture.dbPath, MESSAGE_TEXT, ATTACHMENT_NAME, fixture.storedName]) {
    assert.equal(publicJson.includes(forbidden), false);
  }
  const generationDirectory = join(fixture.backupRoot, generationId);
  assert.equal(existsSync(join(generationDirectory, "COMMITTED")), true);
  assert.equal(readdirSync(fixture.backupRoot).some((name) => name.startsWith(".partial-")), false);
  const manifestText = readFileSync(join(generationDirectory, "generation-manifest.v1.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.schema, CODEX_PAYLOAD_BACKUP_SCHEMA);
  assert.equal(manifestText.includes(MESSAGE_TEXT), false);
  assert.equal(manifestText.includes(ATTACHMENT_NAME), false);
  assert.equal(manifestText.includes(fixture.root), false);

  fixture.db.close();
  rmSync(fixture.dbPath, { force: true });
  rmSync(`${fixture.dbPath}-wal`, { force: true });
  rmSync(`${fixture.dbPath}-shm`, { force: true });
  rmSync(fixture.messageRoot, { recursive: true, force: true });
  rmSync(fixture.attachmentRoot, { recursive: true, force: true });

  const restored = restoreAndVerifyCodexPayloadBackup({
    backupRoot: fixture.backupRoot,
    generationId,
    restoreRoot: fixture.restoreRoot,
    now: new Date("2026-07-10T01:03:04.000Z"),
  });
  assert.equal(restored.ok, true);
  assert.equal(restored.database.quick_check, "ok");
  assert.deepEqual(restored.messages, backup.messages);
  assert.deepEqual(restored.attachments, backup.attachments);
  const restoredJson = JSON.stringify(restored);
  assert.equal(restoredJson.includes(fixture.root), false);
  assert.equal(restoredJson.includes(MESSAGE_TEXT), false);
  assert.equal(restoredJson.includes(ATTACHMENT_NAME), false);

  const restoredDirectory = join(fixture.restoreRoot, generationId);
  const restoredDb = new DatabaseSync(join(restoredDirectory, "database.sqlite"), { readOnly: true });
  assert.equal(restoredDb.prepare("PRAGMA quick_check").get().quick_check, "ok");
  assert.equal(restoredDb.prepare("SELECT payload_ref FROM codex_thread_message").get().payload_ref, fixture.payload.payload_ref);
  restoredDb.close();
  const payloadFiles = findNamed(restoredDirectory, "payload.json");
  assert.equal(payloadFiles.length, 1);
  assert.equal(JSON.parse(readFileSync(payloadFiles[0], "utf8")).text, MESSAGE_TEXT);
  assert.equal(findNamed(restoredDirectory, fixture.storedName).length, 1);
  assert.equal(existsSync(join(restoredDirectory, "RESTORE_VERIFIED")), true);
});

test("runtime release audit accepts only the latest hash-bound coherent payload generation and matching restore marker", async (t) => {
  const fixture = await createFixture({ nasNamespaces: true });
  t.after(() => {
    try { fixture.db.close(); } catch {}
    rmSync(fixture.root, { recursive: true, force: true });
  });
  const generationId = "cpb_audit_valid_0001";
  backupFixture(fixture, "cpb_audit_valid_0000");
  const backup = backupFixture(fixture, generationId);
  restoreAndVerifyCodexPayloadBackup({
    backupRoot: fixture.backupRoot,
    generationId,
    restoreRoot: fixture.restoreRoot,
    now: new Date("2026-07-10T01:03:04.000Z"),
  });

  const audit = await runRuntimeReleaseAudit({
    sourceRoot: fixture.root,
    runtimeRoot: fixture.root,
    appRoot: resolve(HERE, ".."),
    dbPath: fixture.dbPath,
    metaPath: join(fixture.root, "missing-real-meta.json"),
    workspacesDir: join(fixture.root, "_workspaces"),
    nasRoot: fixture.nasRoot,
    skipGit: true,
    targetMembers: 0,
  });
  const evidence = audit.checks.nas_backup.codex_payload;
  assert.equal(evidence.generation_count, 2);
  assert.equal(evidence.committed_generation_count, 2);
  assert.equal(evidence.latest.generation_id, generationId);
  assert.equal(evidence.latest.manifest_sha256, backup.manifest_sha256);
  assert.equal(evidence.latest.database.quick_check, "ok");
  assert.deepEqual(evidence.latest.totals, {
    message_count: 1,
    message_bytes: Buffer.byteLength(MESSAGE_TEXT),
    attachment_count: 1,
    attachment_bytes: Buffer.byteLength("immutable attachment payload"),
    generation_payload_bytes: evidence.latest.totals.generation_payload_bytes,
  });
  assert.equal(evidence.latest.restore_verified, true);
  assert.deepEqual(
    [...audit.blockers, ...audit.warnings]
      .filter((issue) => issue.code.startsWith("codex_payload_backup_") || issue.code.startsWith("codex_payload_restore_"))
      .map((issue) => issue.code),
    [],
  );
  const publicEvidence = JSON.stringify(evidence);
  for (const forbidden of [fixture.root, MESSAGE_TEXT, ATTACHMENT_NAME, fixture.storedName]) {
    assert.equal(publicEvidence.includes(forbidden), false);
  }
});

test("runtime release audit makes missing matching payload restore evidence a live blocker", async (t) => {
  const fixture = await createFixture({ nasNamespaces: true });
  t.after(() => {
    try { fixture.db.close(); } catch {}
    rmSync(fixture.root, { recursive: true, force: true });
  });
  const generationId = "cpb_audit_unrestored_01";
  backupFixture(fixture, generationId);

  const audit = await runRuntimeReleaseAudit({
    sourceRoot: fixture.root,
    runtimeRoot: fixture.root,
    appRoot: resolve(HERE, ".."),
    dbPath: fixture.dbPath,
    metaPath: join(fixture.root, "missing-real-meta.json"),
    workspacesDir: join(fixture.root, "_workspaces"),
    nasRoot: fixture.nasRoot,
    requireLive: true,
    port: 65534,
  });
  const issue = audit.blockers.find((entry) => entry.code === "codex_payload_restore_verification_invalid");
  assert.equal(issue?.generation_id, generationId);
  assert.equal(issue?.error_code, "restore_generation_invalid");
  assert.match(issue?.manifest_sha256 || "", /^[a-f0-9]{64}$/);
});

test("backup rejects a DB pointer whose size or hash does not match its immutable message payload", async (t) => {
  const fixture = await createFixture();
  t.after(() => {
    try { fixture.db.close(); } catch {}
    rmSync(fixture.root, { recursive: true, force: true });
  });
  fixture.db.prepare("UPDATE codex_thread_message SET payload_sha256=?").run("0".repeat(64));
  expectBackupError(() => backupFixture(fixture, "cpb_pointer_mismatch_01"), ["message_payload_hash_mismatch"]);
  assert.equal(existsSync(join(fixture.backupRoot, "cpb_pointer_mismatch_01")), false);
  assert.equal(readdirSync(fixture.backupRoot).some((name) => name.startsWith(".partial-")), false);
});

test("backup rejects hard-linked attachment payloads", async (t) => {
  const fixture = await createFixture();
  t.after(() => {
    try { fixture.db.close(); } catch {}
    rmSync(fixture.root, { recursive: true, force: true });
  });
  try {
    linkSync(fixture.attachmentPath, join(dirname(fixture.attachmentPath), "alias-hardlink.bin"));
  } catch (error) {
    t.skip(`hard links unavailable: ${error.code || "unknown"}`);
    return;
  }
  expectBackupError(() => backupFixture(fixture, "cpb_hardlink_reject_01"), ["source_hardlink_forbidden"]);
});

test("backup rejects symlinked attachment payloads without following them", async (t) => {
  const fixture = await createFixture();
  t.after(() => {
    try { fixture.db.close(); } catch {}
    rmSync(fixture.root, { recursive: true, force: true });
  });
  const outside = join(fixture.root, "outside-payload.bin");
  writeFileSync(outside, "immutable attachment payload");
  unlinkSync(fixture.attachmentPath);
  try {
    symlinkSync(outside, fixture.attachmentPath, "file");
  } catch (error) {
    t.skip(`symbolic links unavailable: ${error.code || "unknown"}`);
    return;
  }
  expectBackupError(() => backupFixture(fixture, "cpb_symlink_reject_01"), ["source_symlink_forbidden"]);
});

test("restore verification detects tampered attachment objects before publication", async (t) => {
  const fixture = await createFixture();
  t.after(() => {
    try { fixture.db.close(); } catch {}
    rmSync(fixture.root, { recursive: true, force: true });
  });
  const generationId = "cpb_tamper_detect_001";
  backupFixture(fixture, generationId);
  const objectPath = join(
    fixture.backupRoot,
    generationId,
    "attachment-objects",
    `${fixture.attachmentId}.payload`,
  );
  writeFileSync(objectPath, "tampered");
  expectBackupError(
    () => restoreAndVerifyCodexPayloadBackup({
      backupRoot: fixture.backupRoot,
      generationId,
      restoreRoot: fixture.restoreRoot,
    }),
    ["source_file_size_mismatch", "source_file_hash_mismatch"],
  );
  assert.equal(existsSync(join(fixture.restoreRoot, generationId)), false);
  assert.equal(readdirSync(fixture.restoreRoot).some((name) => name.startsWith(".partial-restore-")), false);
});

test("restore verification checks every DB-bound message object hash and size", async (t) => {
  const fixture = await createFixture();
  t.after(() => {
    try { fixture.db.close(); } catch {}
    rmSync(fixture.root, { recursive: true, force: true });
  });
  const generationId = "cpb_message_tamper_01";
  backupFixture(fixture, generationId);
  const objectPath = join(
    fixture.backupRoot,
    generationId,
    "message-objects",
    `${fixture.payload.payload_ref}.payload`,
  );
  const original = readFileSync(objectPath);
  const tampered = Buffer.from(original);
  tampered[tampered.length - 2] ^= 1;
  writeFileSync(objectPath, tampered);
  expectBackupError(
    () => restoreAndVerifyCodexPayloadBackup({
      backupRoot: fixture.backupRoot,
      generationId,
      restoreRoot: fixture.restoreRoot,
    }),
    ["message_object_hash_mismatch"],
  );
  assert.equal(existsSync(join(fixture.restoreRoot, generationId)), false);
});

test("restore rejects uncommitted generations and the CLI surface stays path-free", async (t) => {
  const fixture = await createFixture();
  t.after(() => {
    try { fixture.db.close(); } catch {}
    rmSync(fixture.root, { recursive: true, force: true });
  });
  const generationId = "cpb_commit_reject_001";
  backupFixture(fixture, generationId);
  unlinkSync(join(fixture.backupRoot, generationId, "COMMITTED"));
  expectBackupError(
    () => restoreAndVerifyCodexPayloadBackup({
      backupRoot: fixture.backupRoot,
      generationId,
      restoreRoot: fixture.restoreRoot,
    }),
    ["source_file_unavailable"],
  );

  assert.deepEqual(parseCodexPayloadBackupCli([
    "restore-verify",
    "--backup-root", "backup-root",
    "--generation-id", generationId,
    "--restore-root", "restore-root",
  ]), {
    command: "restore-verify",
    help: false,
    dbPath: null,
    attachmentRoot: null,
    messagePayloadRoot: null,
    backupRoot: "backup-root",
    generationId,
    restoreRoot: "restore-root",
  });
  const help = spawnSync(process.execPath, [TOOL, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /restore-verify/);
  assert.equal(help.stdout.includes(fixture.root), false);
});

test("required roots are explicit and backup/restore roots cannot overlap protected inputs", async (t) => {
  const fixture = await createFixture();
  t.after(() => {
    try { fixture.db.close(); } catch {}
    rmSync(fixture.root, { recursive: true, force: true });
  });
  expectBackupError(() => createCodexPayloadBackup(), ["database_path_required"]);
  expectBackupError(() => createCodexPayloadBackup({
    dbPath: fixture.dbPath,
    attachmentRoot: fixture.attachmentRoot,
    messagePayloadRoot: fixture.messageRoot,
    backupRoot: fixture.attachmentRoot,
    generationId: "cpb_overlap_reject_01",
  }), ["backup_root_overlaps_source"]);
  const generationId = "cpb_restore_overlap_01";
  backupFixture(fixture, generationId);
  expectBackupError(() => restoreAndVerifyCodexPayloadBackup({
    backupRoot: fixture.backupRoot,
    generationId,
    restoreRoot: fixture.backupRoot,
  }), ["restore_root_overlaps_backup"]);
});

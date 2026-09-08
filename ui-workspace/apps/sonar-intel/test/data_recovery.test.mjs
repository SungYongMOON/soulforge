import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { backupData, restoreData, verifyBackup, RESTORE_COLLECTION_MARKER } from "../src/data_recovery.mjs";
import { acquireDataLease } from "../src/runtime_paths.mjs";
import { openBudgetJournal } from "../src/collectors/budget_journal.mjs";
import { openStore } from "../src/store.mjs";
import { runDataRecovery } from "../tools/data_recovery.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "sonar-data-recovery-"));
  t.after(() => {
    assert.ok(path.resolve(root).startsWith(`${path.resolve(tmpdir())}${path.sep}sonar-data-recovery-`));
    rmSync(root, { recursive: true, force: true });
  });
  const source = path.join(root, "source"), backup = path.join(root, "backup"), restored = path.join(root, "restored");
  mkdirSync(source);
  return { root, source, backup, restored };
}
function jsonl(f) {
  const bytes = Buffer.from('{"id":"synthetic-1","title":"자료"}\r\n{"id":"synthetic-2"}\n');
  writeFileSync(path.join(f.source, "intel.jsonl"), bytes);
  return bytes;
}
function rewriteManifest(backup, mutate) {
  const file = path.join(backup, "manifest.json");
  const manifest = JSON.parse(readFileSync(file)); mutate(manifest);
  const bytes = Buffer.from(JSON.stringify(manifest));
  writeFileSync(file, bytes);
  const commitFile = path.join(backup, "COMMITTED.json");
  const commit = JSON.parse(readFileSync(commitFile)); commit.manifestSha256 = hash(bytes);
  writeFileSync(commitFile, JSON.stringify(commit));
}

test("JSONL generation preserves all working bytes, excludes derived/runtime files, and restores with collection disabled", async (t) => {
  const f = fixture(t), core = jsonl(f);
  const observation = { contractDigest: "a".repeat(64), observedAt: "2026-09-08T00:00:00.000Z", resetAt: "2026-09-09T00:00:00.000Z", remaining: 14, remainingRequests: 3, requestCeiling: 1, unit: "requests" };
  const auxiliary = { "analysis.json": '{"phase":"synthetic"}\n', "last_run.json": '{"complete":true}\n' };
  for (const source of ["openalex", "semantic_scholar", "epo_ops", "kipris"]) auxiliary[`budget-${source}.json`] = JSON.stringify(observation);
  for (const [name, bytes] of Object.entries(auxiliary)) writeFileSync(path.join(f.source, name), bytes);
  mkdirSync(path.join(f.source, "export")); writeFileSync(path.join(f.source, "export", "derived.csv"), "rebuildable\n");
  writeFileSync(path.join(f.source, "analysis.123.tmp"), "incomplete");
  writeFileSync(path.join(f.source, "budget-openalex.json.lock"), "");
  writeFileSync(path.join(f.source, RESTORE_COLLECTION_MARKER), "");
  const captured = await backupData({ dataDir: f.source, backupDir: f.backup });
  assert.equal(captured.fileCount, 7); assert.equal(captured.excluded.rebuildable, 1); assert.equal(captured.excluded.runtime, 4);
  assert.deepEqual(readFileSync(path.join(f.backup, "data", "intel.jsonl")), core);
  assert.equal(existsSync(path.join(f.source, "data-operation.lock")), false);
  const restored = restoreData({ backupDir: f.backup, dataDir: f.restored, expectedManifestSha256: captured.manifestSha256 });
  assert.equal(restored.collection_disabled, true); assert.equal(restored.budget_reconciliation_required, true);
  assert.equal(readFileSync(path.join(f.restored, RESTORE_COLLECTION_MARKER)).length, 0);
  for (const [name, bytes] of Object.entries(auxiliary)) assert.equal(readFileSync(path.join(f.restored, name), "utf8"), bytes);
  assert.deepEqual(readdirSync(f.restored).sort(), [...Object.keys(auxiliary), "intel.jsonl", RESTORE_COLLECTION_MARKER].sort());
  const journal = openBudgetJournal(path.join(f.restored, "budget-kipris.json"), observation);
  assert.deepEqual(journal.state, observation, "restoration cannot replenish or renew the prior observation");
  assert.throws(() => journal.reserve({ ...observation, remaining: 15 }), /budget_must_only_decrease/);
  journal.close();
  const again = await backupData({ dataDir: f.restored, backupDir: path.join(f.root, "again") });
  assert.deepEqual(again.files, captured.files, "restoration control is excluded from later generations");
});

test("SQLite logical export includes committed live WAL rows and exact restored bytes", async (t) => {
  const f = fixture(t), dbFile = path.join(f.source, "intel.db");
  const db = new DatabaseSync(dbFile);
  try {
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE items(id TEXT PRIMARY KEY, title TEXT); INSERT INTO items VALUES ('first','합성 자료'),('second','retained');");
  const rows = db.prepare("SELECT * FROM items ORDER BY id").all().map((row) => ({ ...row }));
  const wal = readFileSync(`${dbFile}-wal`);
  assert.ok(wal.length > 0);
  const captured = await backupData({ dataDir: f.source, backupDir: f.backup });
  assert.equal(captured.backend, "sqlite");
  assert.deepEqual(readFileSync(`${dbFile}-wal`), wal, "logical exporter did not checkpoint the existing WAL writer");
  assert.deepEqual(readdirSync(path.join(f.backup, "data")), ["intel.db"]);
  restoreData({ backupDir: f.backup, dataDir: f.restored });
  const restoredFile = path.join(f.restored, "intel.db"), restored = new DatabaseSync(restoredFile, { readOnly: true });
  try {
    assert.equal(restored.prepare("PRAGMA quick_check").get().quick_check, "ok");
    assert.deepEqual(restored.prepare("SELECT * FROM items ORDER BY id").all().map((row) => ({ ...row })), rows);
  } finally { restored.close(); }
  assert.equal(hash(readFileSync(restoredFile)), captured.files[0].sha256);
  assert.equal(existsSync(path.join(f.backup, ".sqlite-staging")), false);
  } finally { db.close(); }
});

test("source shape fails closed before destination creation without opening unknown bodies", async (t) => {
  const f = fixture(t); jsonl(f);
  mkdirSync(path.join(f.source, "unknown"));
  writeFileSync(path.join(f.source, "unknown", "do-not-read.txt"), "private-shaped synthetic body");
  await assert.rejects(backupData({ dataDir: f.source, backupDir: f.backup }), (error) => error.code === "recovery_unclassified_entries" && error.unknownCount === 1);
  assert.equal(existsSync(f.backup), false);
  assert.equal(existsSync(path.join(f.source, "data-operation.lock")), false);
  unlinkSync(path.join(f.source, "intel.jsonl"));
  rmSync(path.join(f.source, "unknown"), { recursive: true });
  await assert.rejects(backupData({ dataDir: f.source, backupDir: f.backup }), /recovery_core_missing/);
  jsonl(f); writeFileSync(path.join(f.source, "intel.db"), "not opened");
  await assert.rejects(backupData({ dataDir: f.source, backupDir: f.backup }), /recovery_core_ambiguous/);
  assert.equal(existsSync(f.backup), false);
});

test("writer lease and writable store exclude backup without losing the existing lock", async (t) => {
  const f = fixture(t); jsonl(f);
  const release = acquireDataLease(f.source);
  await assert.rejects(backupData({ dataDir: f.source, backupDir: f.backup }), /data_directory_busy/);
  assert.equal(existsSync(path.join(f.source, "data-operation.lock")), true);
  release();
  const store = await openStore({ dataDir: f.source, backend: "jsonl" });
  try { await assert.rejects(backupData({ dataDir: f.source, backupDir: f.backup }), /data_directory_busy/); }
  finally { store.close(); }
  assert.equal(existsSync(f.backup), false);
  await backupData({ dataDir: f.source, backupDir: f.backup });
});

test("backup holds the shared lease through SQLite export and failed export never commits a generation", async (t) => {
  const f = fixture(t), store = await openStore({ dataDir: f.source, backend: "sqlite" });
  store.upsertItem({ id: "synthetic", type: "paper", source: "fixture", title: "No external data" });
  store.close();
  const pending = backupData({ dataDir: f.source, backupDir: f.backup });
  await assert.rejects(openStore({ dataDir: f.source, backend: "sqlite" }), /data_directory_busy/);
  await pending;
  const broken = fixture(t);
  writeFileSync(path.join(broken.source, "intel.db"), "invalid synthetic SQLite bytes");
  await assert.rejects(backupData({ dataDir: broken.source, backupDir: broken.backup }));
  assert.equal(existsSync(path.join(broken.source, "data-operation.lock")), false);
  assert.equal(existsSync(path.join(broken.backup, "COMMITTED.json")), false);
  assert.throws(() => restoreData({ backupDir: broken.backup, dataDir: broken.restored }), /recovery_generation_incomplete_or_extra/);
  assert.equal(existsSync(broken.restored), false);
});

test("absolute external disjoint create-only destinations reject overlap and existing empty roots", async (t) => {
  const f = fixture(t); jsonl(f);
  for (const backupDir of [f.source, path.join(f.source, "nested"), f.root]) await assert.rejects(backupData({ dataDir: f.source, backupDir }), /recovery_destination_exists|recovery_directory_overlap/);
  await assert.rejects(backupData({ dataDir: "relative", backupDir: f.backup }), /data_directory_must_be_absolute/);
  await assert.rejects(backupData({ dataDir: f.source, backupDir: path.join(f.root, "_workmeta", "forbidden") }), /canonical_data_directory_forbidden/);
  await assert.rejects(backupData({ dataDir: f.source, backupDir: path.resolve("ui-workspace/apps/sonar-intel/data") }), /runtime_data_overlap/);
  await backupData({ dataDir: f.source, backupDir: f.backup });
  const previous = readFileSync(path.join(f.backup, "manifest.json"));
  await assert.rejects(backupData({ dataDir: f.source, backupDir: f.backup }), /recovery_destination_exists/);
  assert.deepEqual(readFileSync(path.join(f.backup, "manifest.json")), previous);
  mkdirSync(f.restored);
  assert.throws(() => restoreData({ backupDir: f.backup, dataDir: f.restored }), /recovery_destination_exists/);
  assert.throws(() => restoreData({ backupDir: f.backup, dataDir: path.join(f.backup, "nested") }), /recovery_directory_overlap/);
});

test("linked roots, linked payloads and hardlinked source files are rejected", async (t) => {
  const f = fixture(t); jsonl(f);
  const alias = path.join(f.root, "alias");
  symlinkSync(f.source, alias, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(backupData({ dataDir: alias, backupDir: f.backup }), /link_forbidden|recovery_directory_unsafe/);
  await assert.rejects(backupData({ dataDir: f.source, backupDir: path.join(alias, "new") }), /link_forbidden|recovery_directory_unsafe/);
  const linked = path.join(f.root, "linked-core");
  linkSync(path.join(f.source, "intel.jsonl"), linked);
  await assert.rejects(backupData({ dataDir: f.source, backupDir: f.backup }), /data_file_link_forbidden/);
  unlinkSync(linked);
  await backupData({ dataDir: f.source, backupDir: f.backup });
  linkSync(path.join(f.backup, "data", "intel.jsonl"), linked);
  assert.throws(() => restoreData({ backupDir: f.backup, dataDir: f.restored }), /data_file_link_forbidden/);
  assert.equal(existsSync(f.restored), false);
});

test("corrupt, extra and incomplete backup generations cannot create a restore", async (t) => {
  for (const damage of ["bytes", "extra-root", "extra-data", "missing-commit", "commit"]) {
    const f = fixture(t); jsonl(f); await backupData({ dataDir: f.source, backupDir: f.backup });
    if (damage === "bytes") writeFileSync(path.join(f.backup, "data", "intel.jsonl"), "damaged");
    if (damage === "extra-root") writeFileSync(path.join(f.backup, "unknown.json"), "never read");
    if (damage === "extra-data") writeFileSync(path.join(f.backup, "data", "unknown.json"), "never read");
    if (damage === "missing-commit") unlinkSync(path.join(f.backup, "COMMITTED.json"));
    if (damage === "commit") writeFileSync(path.join(f.backup, "COMMITTED.json"), '{"format":"wrong","manifestSha256":"wrong"}');
    assert.throws(() => restoreData({ backupDir: f.backup, dataDir: f.restored }), /recovery_/);
    assert.equal(existsSync(f.restored), false, damage);
  }
});

test("strict metadata rejects forged paths, duplicates, ambiguous CORE and foreign format even with a matching commit", async (t) => {
  for (const mutate of [
    (manifest) => { manifest.files[0].path = "../outside"; },
    (manifest) => { manifest.files.push({ ...manifest.files[0] }); },
    (manifest) => { manifest.core = "sqlite"; },
    (manifest) => { manifest.format = "future-format"; },
    (manifest) => { manifest.extra = true; },
    (manifest) => { manifest.files[0].size = -1; },
  ]) {
    const f = fixture(t); jsonl(f); await backupData({ dataDir: f.source, backupDir: f.backup });
    rewriteManifest(f.backup, mutate);
    assert.throws(() => restoreData({ backupDir: f.backup, dataDir: f.restored }), /recovery_metadata_invalid|recovery_core_ambiguous/);
    assert.equal(existsSync(f.restored), false);
  }
  const f = fixture(t); jsonl(f); await backupData({ dataDir: f.source, backupDir: f.backup });
  assert.throws(() => verifyBackup({ backupDir: f.backup, expectedManifestSha256: "b".repeat(64) }), /recovery_manifest_digest_mismatch/);
});

test("CLI help and exact arguments perform only explicitly selected local operations", async (t) => {
  const f = fixture(t); jsonl(f);
  assert.match(await runDataRecovery(["--help"]), /disables collection/);
  for (const args of [[], ["backup"], ["verify", "--data-dir", f.source], ["backup", "--data-dir", f.source, "--data-dir", f.source], ["backup", "--backup-dir"]]) await assert.rejects(runDataRecovery(args), /recovery_/);
  const saved = await runDataRecovery(["backup", "--data-dir", f.source, "--backup-dir", f.backup]);
  const checked = await runDataRecovery(["verify", "--backup-dir", f.backup, "--expected-manifest-sha256", saved.manifestSha256]);
  assert.equal(checked.ok, true);
  const restored = await runDataRecovery(["restore", "--backup-dir", f.backup, "--data-dir", f.restored, "--expected-manifest-sha256", saved.manifestSha256]);
  assert.equal(restored.collection_disabled, true);
  assert.equal(JSON.stringify(restored).includes(f.root), false, "receipt contains no private host path or data body");
});

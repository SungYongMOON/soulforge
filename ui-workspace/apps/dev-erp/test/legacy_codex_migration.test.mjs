import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createCodexMessagePayloadStore } from "../src/codex_message_payload_store.mjs";
import {
  LEGACY_CODEX_OWNER_MAPPING_SCHEMA,
  LEGACY_CODEX_RETIRE_ALL_CANDIDATE_SCHEMA,
  planLegacyCodexRetireAllCandidate,
  preflightLegacyCodexMigration,
  runLegacyCodexMigration,
  validateLegacyCodexOwnerMapping,
} from "../tools/legacy_codex_migration.mjs";

const roots = [];
const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "..", "tools", "legacy_codex_migration.mjs");
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const THREAD_REF = `dwr2.ref-old.${"A".repeat(16)}.A.${"B".repeat(22)}`;
const PRIVATE_PATH_SENTINEL = ["C:", "team", "private"].join("\\");

afterEach(async () => {
  while (roots.length) await rm(roots.pop(), { recursive: true, force: true });
});

function fixture({ includeRetire = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-legacy-codex-"));
  roots.push(root);
  const dbPath = join(root, "runtime.db");
  const payloadRoot = join(root, "payload-owner");
  const mappingPath = join(root, "owner-mapping.json");
  const fs = new DatabaseSync(dbPath);
  fs.exec(`
    CREATE TABLE core_item(id TEXT PRIMARY KEY, project_id TEXT);
    CREATE TABLE codex_thread_binding(
      item_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      thread_title TEXT NOT NULL,
      project_id TEXT,
      workspace_id TEXT,
      workspace_revision TEXT,
      workspace_root_fingerprint TEXT,
      mode TEXT,
      sync_state TEXT,
      last_sync_at TEXT,
      data_label TEXT
    );
    CREATE TABLE codex_thread_message(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      item_id TEXT NOT NULL,
      thread_id TEXT,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      payload_ref TEXT,
      payload_byte_length INTEGER,
      payload_sha256 TEXT,
      actor_ref TEXT,
      mode TEXT,
      data_label TEXT
    );
  `);
  fs.prepare("INSERT INTO core_item(id,project_id) VALUES(?,?)").run("item_bind", "P26-A");
  fs.prepare("INSERT INTO core_item(id,project_id) VALUES(?,?)").run("item_retire", "P26-B");
  fs.prepare(
    `INSERT INTO codex_thread_binding(
       item_id,thread_id,thread_title,project_id,workspace_id,workspace_revision,workspace_root_fingerprint,
       mode,sync_state,last_sync_at,data_label
     ) VALUES(?,?,?,NULL,NULL,NULL,NULL,'app-server','linked',?,'meta')`,
  ).run("item_bind", THREAD_REF, "bind", new Date(0).toISOString());
  if (includeRetire) {
    fs.prepare(
      `INSERT INTO codex_thread_binding(
         item_id,thread_id,thread_title,project_id,workspace_id,workspace_revision,workspace_root_fingerprint,
         mode,sync_state,last_sync_at,data_label
       ) VALUES(?,?,?,NULL,NULL,NULL,NULL,'app-server','linked',?,'meta')`,
    ).run("item_retire", "thread-retire", "retire", new Date(0).toISOString());
  }
  const secretBody = `sensitive-body ${PRIVATE_PATH_SENTINEL} token=do-not-echo`;
  const secondBody = "assistant payload must remain private";
  fs.prepare(
    `INSERT INTO codex_thread_message(at,item_id,thread_id,role,text,data_label)
     VALUES(?,?,?,?,?,'real')`,
  ).run(new Date(0).toISOString(), "item_bind", THREAD_REF, "user", secretBody);
  fs.prepare(
    `INSERT INTO codex_thread_message(at,item_id,thread_id,role,text,data_label)
     VALUES(?,?,?,?,?,'real')`,
  ).run(new Date(0).toISOString(), "item_retire", "thread-retire", "assistant", secondBody);
  fs.close();
  mkdirSync(payloadRoot);

  const bindings = [{
    action: "bind",
    item_id: "item_bind",
    project_id: "P26-A",
    workspace_id: "team_a",
    workspace_revision: HASH_A,
    workspace_root_fingerprint: HASH_B,
  }];
  if (includeRetire) {
    bindings.push({
      action: "retire",
      item_id: "item_retire",
      project_id: "P26-B",
      reason_code: "owner_retired_legacy_thread",
    });
  }
  const mapping = {
    schema: LEGACY_CODEX_OWNER_MAPPING_SCHEMA,
    owner_ref: "owner",
    approved_at: "2026-07-10T00:00:00.000Z",
    message_action: "migrate",
    bindings,
  };
  writeFileSync(mappingPath, JSON.stringify(mapping), "utf8");
  return { root, dbPath, payloadRoot, mappingPath, mapping, secretBody, secondBody };
}

function openReadOnly(path) {
  return new DatabaseSync(path, { readOnly: true });
}

function assertReportRedacted(value, fixtureValue) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    fixtureValue.root,
    fixtureValue.dbPath,
    fixtureValue.payloadRoot,
    fixtureValue.secretBody,
    fixtureValue.secondBody,
    "do-not-echo",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
}

function countPayloadRefDirectories(root) {
  let count = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("cmp_")) count += 1;
    count += countPayloadRefDirectories(join(root, entry.name));
  }
  return count;
}

test("legacy Codex migration: dry-run reports counts without changing DB or payload root", async () => {
  const f = fixture();
  const result = await preflightLegacyCodexMigration({
    dbPath: f.dbPath,
    payloadRoot: f.payloadRoot,
    mapping: f.mapping,
  });
  assert.equal(result.mode, "dry_run");
  assert.equal(result.status, "ready");
  assert.equal(result.preflight.counts.legacy_messages, 2);
  assert.equal(result.preflight.counts.legacy_bindings, 2);
  assert.deepEqual(result.applied_counts, {
    migrated_messages: 0,
    bound_bindings: 0,
    retired_bindings: 0,
  });
  assert.deepEqual(readdirSync(f.payloadRoot), []);
  const db = openReadOnly(f.dbPath);
  try {
    assert.equal(db.prepare("SELECT text FROM codex_thread_message WHERE id=1").get().text, f.secretBody);
    assert.equal(db.prepare("SELECT workspace_id FROM codex_thread_binding WHERE item_id='item_bind'").get().workspace_id, null);
  } finally {
    db.close();
  }
  assert.equal(countPayloadRefDirectories(f.payloadRoot), 0);
  assertReportRedacted(result, f);
});

test("legacy Codex migration: --apply stores verified payload pointers, binds or retires exactly, and reruns idempotently", async () => {
  const f = fixture();
  const first = await runLegacyCodexMigration({
    dbPath: f.dbPath,
    payloadRoot: f.payloadRoot,
    mapping: f.mapping,
    apply: true,
    now: () => "2026-07-10T00:01:00.000Z",
  });
  assert.equal(first.status, "applied");
  assert.deepEqual(first.applied_counts, {
    migrated_messages: 2,
    bound_bindings: 1,
    retired_bindings: 1,
  });
  assert.equal(first.verification.status, "passed");
  assert.equal(first.verification.counts.legacy_messages, 0);
  assert.equal(first.verification.counts.legacy_bindings, 0);
  assertReportRedacted(first, f);

  const db = openReadOnly(f.dbPath);
  let messages;
  try {
    messages = db.prepare(
      "SELECT item_id,role,text,payload_ref,payload_byte_length,payload_sha256 FROM codex_thread_message ORDER BY id",
    ).all();
    assert.ok(messages.every((row) => row.text === row.payload_ref && /^cmp_/.test(row.payload_ref)));
    assert.ok(messages.every((row) => Number.isSafeInteger(row.payload_byte_length) && /^[a-f0-9]{64}$/.test(row.payload_sha256)));
    const binding = db.prepare("SELECT * FROM codex_thread_binding WHERE item_id='item_bind'").get();
    assert.equal(binding.project_id, "P26-A");
    assert.equal(binding.workspace_id, "team_a");
    assert.equal(binding.workspace_revision, HASH_A);
    assert.equal(binding.workspace_root_fingerprint, HASH_B);
    assert.equal(db.prepare("SELECT 1 FROM codex_thread_binding WHERE item_id='item_retire'").get(), undefined);
    const receipt = db.prepare(
      "SELECT reason_code,data_label FROM codex_legacy_migration_receipt WHERE entity_key='item_retire' AND action='retire'",
    ).get();
    assert.deepEqual({ ...receipt }, { reason_code: "owner_retired_legacy_thread", data_label: "meta" });
  } finally {
    db.close();
  }

  const payloadStore = await createCodexMessagePayloadStore({ root: f.payloadRoot });
  const resolvedFirst = await payloadStore.resolveAuthorizedMessagePayload({
    itemId: messages[0].item_id,
    payloadRef: messages[0].payload_ref,
  });
  const resolvedSecond = await payloadStore.resolveAuthorizedMessagePayload({
    itemId: messages[1].item_id,
    payloadRef: messages[1].payload_ref,
  });
  assert.equal(resolvedFirst.ok, true);
  assert.equal(resolvedFirst.payload.text, f.secretBody);
  assert.equal(resolvedSecond.ok, true);
  assert.equal(resolvedSecond.payload.text, f.secondBody);

  const rerun = await runLegacyCodexMigration({
    dbPath: f.dbPath,
    payloadRoot: f.payloadRoot,
    mapping: f.mapping,
    apply: true,
  });
  assert.equal(rerun.status, "applied");
  assert.deepEqual(rerun.applied_counts, {
    migrated_messages: 0,
    bound_bindings: 0,
    retired_bindings: 0,
  });
  assertReportRedacted(rerun, f);
});

test("legacy Codex migration refuses to bind a raw thread id that the dedicated worker cannot resume", async () => {
  const fx = fixture({ includeRetire: false });
  const db = new DatabaseSync(fx.dbPath);
  db.prepare("UPDATE codex_thread_binding SET thread_id='thread-bind' WHERE item_id='item_bind'").run();
  db.close();
  const preflight = await preflightLegacyCodexMigration({
    dbPath: fx.dbPath,
    payloadRoot: fx.payloadRoot,
    mapping: fx.mapping,
  });
  assert.equal(preflight.preflight.status, "blocked");
  assert.ok(preflight.preflight.codes.includes("mapping_binding_conflict"));
});

test("legacy Codex migration: missing owner decision blocks apply without mutations", async () => {
  const f = fixture();
  const incomplete = { ...f.mapping, bindings: f.mapping.bindings.slice(0, 1) };
  const result = await runLegacyCodexMigration({
    dbPath: f.dbPath,
    payloadRoot: f.payloadRoot,
    mapping: incomplete,
    apply: true,
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.codes.includes("legacy_binding_unmapped"));
  assert.deepEqual(readdirSync(f.payloadRoot), []);
  const db = openReadOnly(f.dbPath);
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM codex_thread_binding").get().n, 2);
    assert.equal(db.prepare("SELECT payload_ref FROM codex_thread_message WHERE id=1").get().payload_ref, null);
  } finally {
    db.close();
  }
  assertReportRedacted(result, f);
});

test("legacy Codex migration: DB update failure rolls back and never echoes body or SQLite error", async () => {
  const f = fixture({ includeRetire: false });
  const writable = new DatabaseSync(f.dbPath);
  const triggerMessage = f.secretBody.replaceAll("'", "''");
  writable.exec(`
    CREATE TRIGGER reject_legacy_pointer_update
    BEFORE UPDATE OF payload_ref ON codex_thread_message
    WHEN OLD.id=2
    BEGIN
      SELECT RAISE(ABORT, '${triggerMessage}');
    END;
  `);
  writable.close();

  const result = await runLegacyCodexMigration({
    dbPath: f.dbPath,
    payloadRoot: f.payloadRoot,
    mapping: f.mapping,
    apply: true,
  });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.codes, ["message_database_update_failed"]);
  const db = openReadOnly(f.dbPath);
  try {
    const row = db.prepare("SELECT text,payload_ref,payload_byte_length,payload_sha256 FROM codex_thread_message WHERE id=1").get();
    assert.deepEqual({ ...row }, {
      text: f.secretBody,
      payload_ref: null,
      payload_byte_length: null,
      payload_sha256: null,
    });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM codex_thread_message WHERE payload_ref IS NOT NULL").get().n, 0);
  } finally {
    db.close();
  }
  assert.equal(countPayloadRefDirectories(f.payloadRoot), 0);
  assertReportRedacted(result, f);
});

test("legacy Codex migration cleans underscore-tag payloads after a later DB failure rolls back", async () => {
  const f = fixture({ includeRetire: false });
  const adversarialItemId = "synthetic_underscore_tag_10";
  const writable = new DatabaseSync(f.dbPath);
  writable.exec("BEGIN");
  writable.prepare("UPDATE core_item SET id=? WHERE id='item_bind'").run(adversarialItemId);
  writable.prepare("UPDATE codex_thread_binding SET item_id=? WHERE item_id='item_bind'").run(adversarialItemId);
  writable.prepare("UPDATE codex_thread_message SET item_id=? WHERE item_id='item_bind'").run(adversarialItemId);
  writable.exec(`
    CREATE TRIGGER reject_later_pointer_update
    BEFORE UPDATE OF payload_ref ON codex_thread_message
    WHEN OLD.id=2
    BEGIN
      SELECT RAISE(ABORT, 'private later failure must not escape');
    END;
  `);
  writable.exec("COMMIT");
  writable.close();
  const mapping = {
    ...f.mapping,
    bindings: f.mapping.bindings.map((entry) => (
      entry.item_id === "item_bind" ? { ...entry, item_id: adversarialItemId } : entry
    )),
  };

  const result = await runLegacyCodexMigration({
    dbPath: f.dbPath,
    payloadRoot: f.payloadRoot,
    mapping,
    apply: true,
  });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.codes, ["message_database_update_failed"]);
  assert.equal(countPayloadRefDirectories(f.payloadRoot), 0);
  const db = openReadOnly(f.dbPath);
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM codex_thread_message WHERE payload_ref IS NOT NULL").get().n, 0);
  } finally {
    db.close();
  }
  assertReportRedacted(result, f);
});

test("legacy Codex migration CLI is dry-run by default and mutates only with --apply", () => {
  const f = fixture();
  const baseArgs = [TOOL, "--db", f.dbPath, "--payload-root", f.payloadRoot, "--mapping", f.mappingPath];
  const dry = spawnSync(process.execPath, baseArgs, { encoding: "utf8" });
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(JSON.parse(dry.stdout).status, "ready");
  assert.deepEqual(readdirSync(f.payloadRoot), []);

  const applied = spawnSync(process.execPath, [...baseArgs, "--apply"], { encoding: "utf8" });
  assert.equal(applied.status, 0, applied.stderr);
  const result = JSON.parse(applied.stdout);
  assert.equal(result.status, "applied");
  assert.equal(result.applied_counts.migrated_messages, 2);
  assertReportRedacted(result, f);
  assert.equal(readFileSync(f.mappingPath, "utf8"), JSON.stringify(f.mapping));
});

test("retire-all planner emits only incomplete bindings from authoritative projects with a deterministic candidate hash", async () => {
  const f = fixture();
  const db = new DatabaseSync(f.dbPath);
  db.prepare("INSERT INTO core_item(id,project_id) VALUES(?,?)").run("item_complete", "P26-C");
  db.prepare(
    `INSERT INTO codex_thread_binding(
       item_id,thread_id,thread_title,project_id,workspace_id,workspace_revision,workspace_root_fingerprint,
       mode,sync_state,last_sync_at,data_label
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "item_complete",
    THREAD_REF,
    "complete",
    "P26-C",
    "team_complete",
    HASH_A,
    HASH_B,
    "app-server",
    "linked",
    new Date(0).toISOString(),
    "meta",
  );
  db.close();

  const first = await planLegacyCodexRetireAllCandidate({ dbPath: f.dbPath, expectedCount: 2 });
  const second = await planLegacyCodexRetireAllCandidate({ dbPath: f.dbPath, expectedCount: 2 });
  assert.equal(first.status, "ready");
  assert.equal(first.candidate.schema, LEGACY_CODEX_RETIRE_ALL_CANDIDATE_SCHEMA);
  assert.equal(first.candidate.candidate_only, true);
  assert.equal(first.candidate.approval_status, "owner_decision_required");
  assert.equal(first.candidate.expected_legacy_binding_count, 2);
  assert.equal(first.candidate.excluded_complete_binding_count, 1);
  assert.equal(first.candidate.binding_project_mismatch_count, 0);
  assert.deepEqual(first.candidate.retirements.map((row) => row.item_id), ["item_bind", "item_retire"]);
  assert.deepEqual(first.candidate.retirements.map((row) => row.project_id), ["P26-A", "P26-B"]);
  assert.deepEqual(first.candidate.retirements.map((row) => row.observed_binding_project_id), [null, null]);
  assert.deepEqual(first.candidate.retirements.map((row) => row.binding_project_status), ["missing", "missing"]);
  assert.equal(first.candidate.candidate_sha256, second.candidate.candidate_sha256);
  assert.match(first.candidate.candidate_sha256, /^[a-f0-9]{64}$/);
  assert.throws(() => validateLegacyCodexOwnerMapping(first.candidate), /mapping_invalid/);
  assertReportRedacted(first, f);

  const unchanged = openReadOnly(f.dbPath);
  try {
    assert.equal(unchanged.prepare("SELECT COUNT(*) AS n FROM codex_thread_binding").get().n, 3);
    assert.equal(unchanged.prepare("SELECT COUNT(*) AS n FROM codex_thread_message").get().n, 2);
  } finally {
    unchanged.close();
  }

  const driftDb = new DatabaseSync(f.dbPath);
  driftDb.prepare("UPDATE core_item SET project_id='P26-Z' WHERE id='item_retire'").run();
  driftDb.close();
  const drift = await planLegacyCodexRetireAllCandidate({
    dbPath: f.dbPath,
    expectedCount: 2,
    expectedCandidateSha256: first.candidate.candidate_sha256,
  });
  assert.equal(drift.status, "blocked");
  assert.deepEqual(drift.codes, ["retire_candidate_drift"]);
});

test("retire-all planner hash-pins valid stale binding projects without weakening invalid-project rejection", async () => {
  const f = fixture();
  const db = new DatabaseSync(f.dbPath);
  db.prepare("UPDATE codex_thread_binding SET project_id='P26-A' WHERE item_id='item_bind'").run();
  db.prepare("UPDATE codex_thread_binding SET project_id='P26-X' WHERE item_id='item_retire'").run();
  db.close();

  const first = await planLegacyCodexRetireAllCandidate({ dbPath: f.dbPath, expectedCount: 2 });
  assert.equal(first.status, "ready");
  assert.equal(first.candidate.binding_project_mismatch_count, 1);
  assert.deepEqual(
    first.candidate.retirements.map((row) => row.observed_binding_project_id),
    ["P26-A", "P26-X"],
  );
  assert.deepEqual(first.candidate.retirements.map((row) => row.binding_project_status), ["match", "mismatch"]);
  assert.deepEqual(first.candidate.retirements.map((row) => row.project_id), ["P26-A", "P26-B"]);

  const pinned = await planLegacyCodexRetireAllCandidate({
    dbPath: f.dbPath,
    expectedCount: 2,
    expectedCandidateSha256: first.candidate.candidate_sha256,
  });
  assert.equal(pinned.status, "ready");
  assert.equal(pinned.candidate.candidate_sha256, first.candidate.candidate_sha256);
  assertReportRedacted(first, f);

  const changedObservedProjectDb = new DatabaseSync(f.dbPath);
  changedObservedProjectDb.prepare("UPDATE codex_thread_binding SET project_id='P26-Y' WHERE item_id='item_retire'").run();
  changedObservedProjectDb.close();
  const changedObservedProject = await planLegacyCodexRetireAllCandidate({
    dbPath: f.dbPath,
    expectedCount: 2,
    expectedCandidateSha256: first.candidate.candidate_sha256,
  });
  assert.equal(changedObservedProject.status, "blocked");
  assert.deepEqual(changedObservedProject.codes, ["retire_candidate_drift"]);

  const invalidDb = new DatabaseSync(f.dbPath);
  invalidDb.prepare("UPDATE codex_thread_binding SET project_id='invalid project' WHERE item_id='item_retire'").run();
  invalidDb.close();
  const invalid = await planLegacyCodexRetireAllCandidate({ dbPath: f.dbPath, expectedCount: 2 });
  assert.equal(invalid.status, "failed");
  assert.deepEqual(invalid.codes, ["retire_candidate_binding_project_invalid"]);
});

test("retire-all planner fails closed when only project mismatch prevents a complete binding", async () => {
  const f = fixture();
  const db = new DatabaseSync(f.dbPath);
  db.prepare(
    `UPDATE codex_thread_binding
        SET project_id=?, workspace_id=?, workspace_revision=?, workspace_root_fingerprint=?
      WHERE item_id=?`,
  ).run("P26-X", "team_complete", HASH_A, HASH_B, "item_bind");
  db.close();

  const result = await planLegacyCodexRetireAllCandidate({ dbPath: f.dbPath, expectedCount: 2 });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.codes, ["retire_candidate_project_mismatch"]);
  assertReportRedacted(result, f);
});

test("legacy Codex mapping still rejects a stale binding project for bind decisions", async () => {
  const f = fixture({ includeRetire: false });
  const db = new DatabaseSync(f.dbPath);
  db.prepare("UPDATE codex_thread_binding SET project_id='P26-X' WHERE item_id='item_bind'").run();
  db.close();

  const result = await preflightLegacyCodexMigration({
    dbPath: f.dbPath,
    payloadRoot: f.payloadRoot,
    mapping: f.mapping,
  });
  assert.equal(result.preflight.status, "blocked");
  assert.ok(result.preflight.codes.includes("mapping_binding_conflict"));
  assertReportRedacted(result, f);
});

test("legacy Codex retire mapping accepts only the current item project when the binding project is stale", async () => {
  const f = fixture();
  const db = new DatabaseSync(f.dbPath);
  db.prepare("UPDATE codex_thread_binding SET project_id='P26-X' WHERE item_id='item_retire'").run();
  db.close();

  const staleProjectMapping = {
    ...f.mapping,
    bindings: f.mapping.bindings.map((entry) => (
      entry.action === "retire" ? { ...entry, project_id: "P26-X" } : entry
    )),
  };
  const blocked = await preflightLegacyCodexMigration({
    dbPath: f.dbPath,
    payloadRoot: f.payloadRoot,
    mapping: staleProjectMapping,
  });
  assert.equal(blocked.preflight.status, "blocked");
  assert.ok(blocked.preflight.codes.includes("mapping_project_mismatch"));

  const ready = await preflightLegacyCodexMigration({
    dbPath: f.dbPath,
    payloadRoot: f.payloadRoot,
    mapping: f.mapping,
  });
  assert.equal(ready.preflight.status, "ready");

  const applied = await runLegacyCodexMigration({
    dbPath: f.dbPath,
    payloadRoot: f.payloadRoot,
    mapping: f.mapping,
    apply: true,
  });
  assert.equal(applied.status, "applied");
  assert.equal(applied.applied_counts.retired_bindings, 1);
  assert.equal(applied.verification.status, "passed");
  const verified = openReadOnly(f.dbPath);
  try {
    assert.equal(verified.prepare("SELECT 1 FROM codex_thread_binding WHERE item_id='item_retire'").get(), undefined);
  } finally {
    verified.close();
  }
  assertReportRedacted(blocked, f);
  assertReportRedacted(ready, f);
  assertReportRedacted(applied, f);
});

test("retire-all planner CLI is read-only and cannot be combined with apply", () => {
  const f = fixture();
  const before = readFileSync(f.dbPath);
  const planned = spawnSync(process.execPath, [
    TOOL,
    "--plan-retire-all",
    "--db", f.dbPath,
    "--expected-count", "2",
  ], { encoding: "utf8" });
  assert.equal(planned.status, 0, planned.stderr);
  const result = JSON.parse(planned.stdout);
  assert.equal(result.status, "ready");
  assert.equal(result.candidate.retirements.length, 2);

  const rejected = spawnSync(process.execPath, [
    TOOL,
    "--plan-retire-all",
    "--db", f.dbPath,
    "--expected-count", "2",
    "--apply",
  ], { encoding: "utf8" });
  assert.equal(rejected.status, 1);
  assert.equal(JSON.parse(rejected.stdout).status, "failed");
  assert.deepEqual(readFileSync(f.dbPath), before);
  assert.deepEqual(readdirSync(f.payloadRoot), []);
});

test("binding-plan failure rolls back DB changes and removes every newly written payload", async () => {
  const f = fixture();
  const db = new DatabaseSync(f.dbPath);
  db.exec(`
    CREATE TRIGGER reject_binding_plan
    BEFORE UPDATE OF workspace_id ON codex_thread_binding
    BEGIN
      SELECT RAISE(ABORT, 'private binding failure must not escape');
    END;
  `);
  db.close();
  const result = await runLegacyCodexMigration({
    dbPath: f.dbPath,
    payloadRoot: f.payloadRoot,
    mapping: f.mapping,
    apply: true,
  });
  assert.equal(result.status, "failed");
  assert.ok(result.codes.includes("binding_database_update_failed"));
  assert.equal(countPayloadRefDirectories(f.payloadRoot), 0);
  const check = openReadOnly(f.dbPath);
  try {
    assert.equal(check.prepare("SELECT COUNT(*) AS n FROM codex_thread_message WHERE payload_ref IS NOT NULL").get().n, 0);
    assert.equal(check.prepare("SELECT COUNT(*) AS n FROM codex_thread_binding").get().n, 2);
  } finally {
    check.close();
  }
  assertReportRedacted(result, f);
});

test("cleanup failure is a redacted explicit blocker and does not hide the primary DB failure", async () => {
  const f = fixture({ includeRetire: false });
  const db = new DatabaseSync(f.dbPath);
  db.exec(`
    CREATE TRIGGER reject_pointer_update_for_cleanup_failure
    BEFORE UPDATE OF payload_ref ON codex_thread_message
    WHEN OLD.id=2
    BEGIN
      SELECT RAISE(ABORT, 'private cleanup failure sentinel');
    END;
  `);
  db.close();
  let cleanupCalls = 0;
  const payloadStoreFactory = async (options) => {
    const store = await createCodexMessagePayloadStore(options);
    return Object.freeze({
      ...store,
      async removeVerifiedMessagePayload() {
        cleanupCalls += 1;
        throw new Error("private injected cleanup failure");
      },
    });
  };
  const result = await runLegacyCodexMigration({
    dbPath: f.dbPath,
    payloadRoot: f.payloadRoot,
    mapping: f.mapping,
    apply: true,
    payloadStoreFactory,
  });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.codes, ["message_database_update_failed", "payload_cleanup_failed"]);
  assert.equal(cleanupCalls, 2);
  assert.ok(countPayloadRefDirectories(f.payloadRoot) > 0);
  assertReportRedacted(result, f);
  assert.equal(JSON.stringify(result).includes("private injected cleanup failure"), false);
});

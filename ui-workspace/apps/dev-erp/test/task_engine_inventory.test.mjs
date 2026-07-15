import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  evaluateMailSyntheticHealth,
  evaluateVoiceSyntheticHealth,
  openQueryOnlyDatabase,
  runInventoryCli,
} from "../tools/task_engine_inventory.mjs";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default;
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = dirname(HERE);
const TOOL = join(APP, "tools", "task_engine_inventory.mjs");
const SCHEMA_PATH = join(APP, "docs", "contracts", "task_engine_inventory_manifest.v1.schema.json");
const EVALUATION_TIME = "2026-07-16T12:00:00+09:00";
const ALL_PROOFS = ["C00-LIVE-01", "C00-LIVE-02", "C00-LIVE-03", "C00-LIVE-04"];

function clone(value) {
  return structuredClone(value);
}

function fileState(path) {
  if (!existsSync(path)) return { exists: false };
  const stat = statSync(path);
  return {
    exists: true,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    size: stat.size,
    mtime: stat.mtime.toISOString(),
  };
}

function sqliteState(path) {
  return { main: fileState(path), wal: fileState(`${path}-wal`), shm: fileState(`${path}-shm`) };
}

function makeRun({
  startedAt = "2026-07-16T11:58:00+09:00",
  finishedAt = "2026-07-16T11:59:00+09:00",
  partial = false,
  errors = [],
  fetched = 2,
  newEvents = 1,
  duplicates = 1,
} = {}) {
  return {
    started_at: startedAt,
    finished_at: finishedAt,
    partial,
    sources: [{
      source_ref: "mailbox_primary",
      fetched,
      new_events: newEvents,
      duplicates,
      raw_written: newEvents,
      event_written: newEvents,
      partial,
      error_codes: [...errors],
    }],
    totals: {
      fetched,
      new_events: newEvents,
      duplicates,
      raw_written: newEvents,
      event_written: newEvents,
    },
    error_codes: [...errors],
  };
}

function makeMailObservation() {
  return {
    source_ref: "source_mail",
    observed_at: EVALUATION_TIME,
    max_stale_sec: 300,
    fail_streak_threshold: 2,
    partial_streak_threshold: 2,
    run_summary: makeRun(),
    recent_runs: [makeRun()],
    raw_payload_copied: false,
  };
}

function makeVoiceObservation() {
  return {
    source_ref: "source_voice",
    observed_at: EVALUATION_TIME,
    max_stale_sec: 300,
    recording_present: true,
    route_selected: true,
    session_bound: true,
    bundle_ready: true,
    source_hash: "a".repeat(64),
    source_size_bytes: 4096,
    stage: "plaud_import_ready",
    recording_id: "recording_001",
    receipt_summary: {
      receipt_present: true,
      receipt_matches: true,
      ack_present: true,
      ack_matches: true,
      delivery_confirmed: true,
      receipt_count: 1,
      ack_count: 1,
      session_count: 1,
      bundle_count: 1,
      producer_ref: "producer_voice",
      consumer_ref: "consumer_voice",
      produced_at: "2026-07-16T11:58:00+09:00",
      acknowledged_at: "2026-07-16T11:59:00+09:00",
    },
    raw_payload_copied: false,
  };
}

function makeAuthority(lane) {
  return {
    source_authority_ref: `authority_${lane}`,
    issued_at: "2026-07-16T09:00:00+09:00",
    expires_at: "2026-07-16T18:00:00+09:00",
    proof_scope: [...ALL_PROOFS],
    evidence_refs: [`evidence_${lane}_a`, `evidence_${lane}_b`],
  };
}

function makeInventory(lane) {
  return {
    profile: "synthetic",
    physical_owner_ref: `owner_${lane}`,
    default_root_ref: `root_${lane}`,
    writer_candidates: [`writer_${lane}_b`, `writer_${lane}_a`],
    direct_caller_candidates: [`caller_${lane}_b`, `caller_${lane}_a`],
    consumer_candidates: [`consumer_${lane}_b`, `consumer_${lane}_a`],
    source_availability_summary: "available",
  };
}

function makeSource(lane) {
  const source = {
    lane,
    source_ref: `source_${lane}`,
    adapter_id: "attested_metadata_v1",
    requirement: "required",
    authority: makeAuthority(lane),
    inventory: makeInventory(lane),
  };
  if (lane === "mail") source.synthetic_health_observation = makeMailObservation();
  if (lane === "voice") source.synthetic_health_observation = makeVoiceObservation();
  return source;
}

function seedDatabase(path) {
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      CREATE TABLE task_items(id INTEGER PRIMARY KEY, status TEXT NOT NULL);
      CREATE INDEX task_items_status_idx ON task_items(status);
      CREATE TRIGGER task_items_noop AFTER UPDATE ON task_items BEGIN SELECT 1; END;
      INSERT INTO task_items(status) VALUES ('open'), ('done'), ('open');
    `);
  } finally {
    db.close();
  }
}

function makeDescriptor(dbPath) {
  const sources = ["mail", "voice", "structured_pc_work", "file", "run_log"].map(makeSource);
  const structured = sources.find((source) => source.lane === "structured_pc_work");
  structured.adapter_id = "sqlite_catalog_v1";
  structured.locator = { sqlite_path: dbPath };
  structured.query = {
    table_count_allowlist: ["task_items"],
    enum_count_allowlist: [{ table: "task_items", column: "status", values: ["open", "done"] }],
  };
  return {
    schema_version: "soulforge.task_engine_inventory_descriptor.v1",
    evaluation_time: EVALUATION_TIME,
    baseline_refs: ["baseline_c00q"],
    expected_sources: sources.map((source) => source.source_ref),
    sources,
  };
}

function addOptionalMailSource(descriptor, suffix, availability) {
  const extra = clone(descriptor.sources.find((source) => source.lane === "mail"));
  extra.source_ref = `source_mail_${suffix}`;
  extra.requirement = "optional";
  extra.authority.source_authority_ref = `authority_mail_${suffix}`;
  extra.authority.evidence_refs = [`evidence_mail_${suffix}`];
  extra.inventory.source_availability_summary = availability;
  delete extra.synthetic_health_observation;
  descriptor.sources.push(extra);
  descriptor.expected_sources.push(extra.source_ref);
}

function runCli(root, descriptor, args = null) {
  const descriptorPath = join(root, `descriptor-${Math.random().toString(16).slice(2)}.json`);
  writeFileSync(descriptorPath, JSON.stringify(descriptor), "utf8");
  const argv = args ?? [TOOL, "--query-only", "--json", "--descriptor", descriptorPath];
  const result = runInventoryCli(argv[0] === TOOL ? argv.slice(1) : argv);
  return { status: result.exitCode, stdout: `${result.output}\n`, stderr: "", descriptorPath };
}

function spawnCli(root, descriptor) {
  const descriptorPath = join(root, "descriptor-spawn.json");
  writeFileSync(descriptorPath, JSON.stringify(descriptor), "utf8");
  const execution = spawnSync(process.execPath, [
    TOOL, "--query-only", "--json", "--descriptor", descriptorPath,
  ], { cwd: APP, encoding: "utf8", windowsHide: true });
  return { ...execution, descriptorPath };
}

function assertSafeEnvelope(execution, expectedStatus) {
  assert.equal(execution.status, expectedStatus, execution.stderr || execution.stdout);
  assert.equal(execution.stderr, "");
  assert.equal(execution.stdout.split(/\r?\n/).filter(Boolean).length, 1);
  const envelope = JSON.parse(execution.stdout);
  assert.equal(envelope.schema_version, "soulforge.task_engine_inventory_error.v1");
  assert.equal(envelope.result, "blocked");
  assert.equal(JSON.stringify(envelope).includes(execution.descriptorPath), false);
  return envelope;
}

test("strict Ajv 2020 schema compiles and a five-lane query-only manifest validates", () => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-inventory-valid-"));
  try {
    const dbPath = join(root, "synthetic.sqlite");
    seedDatabase(dbPath);
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const validateManifest = ajv.compile(schema);
    const validateDescriptor = ajv.getSchema(`${schema.$id}#/$defs/input_descriptor`);
    assert.equal(typeof validateDescriptor, "function");

    const descriptor = makeDescriptor(dbPath);
    assert.equal(validateDescriptor(descriptor), true, JSON.stringify(validateDescriptor.errors));
    const execution = spawnCli(root, descriptor);
    assert.equal(execution.status, 0, execution.stderr || execution.stdout);
    assert.equal(execution.stderr, "");
    assert.equal(execution.stdout.split(/\r?\n/).filter(Boolean).length, 1);
    const manifest = JSON.parse(execution.stdout);
    assert.equal(validateManifest(manifest), true, JSON.stringify(validateManifest.errors));
    assert.equal(manifest.result, "review_ready_manifest");
    assert.equal(manifest.query_only, true);
    assert.deepEqual(Object.keys(manifest.lanes).sort(), ["file", "mail", "run_log", "structured_pc_work", "voice"]);
    assert.equal(manifest.table_counts[0].count, 3);
    assert.deepEqual(manifest.enum_counts.map((row) => [row.value, row.count]), [["done", 1], ["open", 2]]);
    assert.equal(manifest.zero_mutation.confirmed, true);
    assert.equal(manifest.zero_mutation.sources.length, descriptor.sources.length);
    assert.deepEqual(manifest.zero_mutation.sources.map((proof) => proof.method).sort(), [
      "no_source_opened",
      "no_source_opened",
      "no_source_opened",
      "no_source_opened",
      "sqlite_file_equivalence",
    ]);
    assert.deepEqual(manifest.unresolved_live_proofs, ALL_PROOFS);
    assert.equal(manifest.unresolved_live_proofs.length, 4, "synthetic inventory must not claim live proof closure");
    assert.equal(/live_(?:closure|proofs?)_complete/.test(execution.stdout), false);
    const blockedManifest = clone(manifest);
    blockedManifest.result = "blocked";
    assert.equal(validateManifest(blockedManifest), false, "blocked results belong to the separate error envelope");
    const missingLiveProofs = clone(manifest);
    missingLiveProofs.unresolved_live_proofs = [];
    assert.equal(validateManifest(missingLiveProofs), false, "schema must retain the exact unresolved C00-LIVE proof list");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stdout bytes and manifest digest are deterministic under input permutations", () => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-inventory-deterministic-"));
  try {
    const dbPath = join(root, "synthetic.sqlite");
    seedDatabase(dbPath);
    const first = makeDescriptor(dbPath);
    const second = clone(first);
    second.sources.reverse();
    second.expected_sources.reverse();
    for (const source of second.sources) {
      source.authority.proof_scope.reverse();
      source.authority.evidence_refs.reverse();
      source.inventory.writer_candidates.reverse();
      source.inventory.direct_caller_candidates.reverse();
      source.inventory.consumer_candidates.reverse();
      if (source.query) source.query.enum_count_allowlist[0].values.reverse();
    }
    const a = runCli(root, first);
    const b = runCli(root, second);
    assert.equal(a.status, 0, a.stderr || a.stdout);
    assert.equal(b.status, 0, b.stderr || b.stdout);
    assert.equal(a.stdout, b.stdout);
    const manifest = JSON.parse(a.stdout);
    const digest = manifest.manifest_digest;
    delete manifest.manifest_digest;
    assert.equal(digest, `sha256:${createHash("sha256").update(JSON.stringify(manifest)).digest("hex")}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mixed-case identifiers and enums remain code-unit deterministic across source permutations", () => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-inventory-code-unit-"));
  try {
    const dbPath = join(root, "synthetic.sqlite");
    seedDatabase(dbPath);
    const writable = new DatabaseSync(dbPath);
    try {
      writable.exec(`
        CREATE TABLE ZetaItems(id INTEGER PRIMARY KEY, stateCode TEXT NOT NULL);
        CREATE TABLE alpha_items(id INTEGER PRIMARY KEY, stateCode TEXT NOT NULL);
        INSERT INTO ZetaItems(stateCode) VALUES ('Open'), ('open');
        INSERT INTO alpha_items(stateCode) VALUES ('Open'), ('open');
      `);
    } finally {
      writable.close();
    }
    const first = makeDescriptor(dbPath);
    const query = first.sources.find((source) => source.adapter_id === "sqlite_catalog_v1").query;
    query.table_count_allowlist = ["alpha_items", "ZetaItems"];
    query.enum_count_allowlist = [{ table: "ZetaItems", column: "stateCode", values: ["open", "Open"] }];
    const second = clone(first);
    second.sources.reverse();
    second.expected_sources.reverse();
    const secondQuery = second.sources.find((source) => source.adapter_id === "sqlite_catalog_v1").query;
    secondQuery.table_count_allowlist.reverse();
    secondQuery.enum_count_allowlist[0].values.reverse();

    const a = runCli(root, first);
    const b = runCli(root, second);
    assert.equal(a.status, 0, a.stderr || a.stdout);
    assert.equal(b.status, 0, b.stderr || b.stdout);
    assert.equal(a.stdout, b.stdout);
    const manifest = JSON.parse(a.stdout);
    assert.deepEqual(manifest.table_counts.map((row) => row.table), ["ZetaItems", "alpha_items"]);
    assert.deepEqual(manifest.enum_counts.map((row) => row.value), ["Open", "open"]);
    assert.equal(JSON.parse(a.stdout).manifest_digest, JSON.parse(b.stdout).manifest_digest);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SQLite opens read-only/query-only, rejects writes, and preserves main/WAL/SHM", () => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-inventory-sqlite-"));
  try {
    const dbPath = join(root, "synthetic.sqlite");
    seedDatabase(dbPath);
    const before = sqliteState(dbPath);
    const db = openQueryOnlyDatabase(dbPath);
    try {
      assert.equal(Number(db.prepare("PRAGMA query_only").get().query_only), 1);
      assert.equal(Number(db.prepare("SELECT total_changes() AS n").get().n), 0);
      assert.throws(() => db.exec("CREATE TABLE forbidden_write(id INTEGER)"), /read.?only/i);
      assert.equal(Number(db.prepare("SELECT total_changes() AS n").get().n), 0);
    } finally {
      db.close();
    }
    assert.deepEqual(sqliteState(dbPath), before);

    const execution = runCli(root, makeDescriptor(dbPath));
    assert.equal(execution.status, 0, execution.stderr || execution.stdout);
    assert.deepEqual(sqliteState(dbPath), before);
    assert.equal(execution.stdout.includes(dbPath), false, "locator must remain input-only");
    const toolText = readFileSync(TOOL, "utf8");
    assert.equal(toolText.includes("src/store.mjs"), false);
    assert.equal(toolText.includes("writeFile"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SQLite WAL or SHM sidecars block before open without creating or changing sidecars", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-inventory-sidecar-"));
  try {
    await t.test("WAL present and SHM absent", () => {
      const dbPath = join(root, "wal-present.sqlite");
      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE task_items(id INTEGER PRIMARY KEY, status TEXT); INSERT INTO task_items(status) VALUES ('open');");
      const walBytes = readFileSync(`${dbPath}-wal`);
      db.close();
      writeFileSync(`${dbPath}-wal`, walBytes);
      rmSync(`${dbPath}-shm`, { force: true });
      assert.equal(existsSync(`${dbPath}-wal`), true);
      assert.equal(existsSync(`${dbPath}-shm`), false);
      const before = sqliteState(dbPath);
      assertSafeEnvelope(runCli(root, makeDescriptor(dbPath)), 3);
      assert.deepEqual(sqliteState(dbPath), before);
      assert.equal(existsSync(`${dbPath}-shm`), false, "blocked inspection must not create SHM");
    });
    await t.test("SHM present", () => {
      const dbPath = join(root, "shm-present.sqlite");
      seedDatabase(dbPath);
      writeFileSync(`${dbPath}-shm`, Buffer.alloc(32768, 0xa5));
      const before = sqliteState(dbPath);
      assertSafeEnvelope(runCli(root, makeDescriptor(dbPath)), 3);
      assert.deepEqual(sqliteState(dbPath), before);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("authority, source, proof, and adapter gaps exit BLOCKED without leaking inputs", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-inventory-blocked-"));
  try {
    const dbPath = join(root, "synthetic.sqlite");
    seedDatabase(dbPath);
    const cases = [
      ["expired authority", (d) => { d.sources[0].authority.expires_at = "2026-07-16T11:00:00+09:00"; }],
      ["authority expires at evaluation time", (d) => { d.sources[0].authority.expires_at = EVALUATION_TIME; }],
      ["missing evidence", (d) => { d.sources[0].authority.evidence_refs = []; }],
      ["proof gap", (d) => { d.sources[0].authority.proof_scope.pop(); }],
      ["unknown authority", (d) => { d.sources[0].authority.source_authority_ref = "authority_unknown"; }],
      ["missing expected source", (d) => { d.sources.pop(); }],
      ["unknown source", (d) => { d.expected_sources.pop(); }],
      ["unknown adapter", (d) => { d.sources[0].adapter_id = "unknown_adapter_v1"; }],
      ["required source unavailable", (d) => {
        d.sources[0].inventory.source_availability_summary = "unknown";
        delete d.sources[0].synthetic_health_observation;
      }],
    ];
    for (const [name, mutate] of cases) {
      await t.test(name, () => {
        const descriptor = makeDescriptor(dbPath);
        mutate(descriptor);
        assertSafeEnvelope(runCli(root, descriptor), 3);
      });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("impossible calendar dates are rejected before authority or health evaluation", () => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-inventory-calendar-"));
  try {
    const dbPath = join(root, "synthetic.sqlite");
    seedDatabase(dbPath);
    const descriptor = makeDescriptor(dbPath);
    descriptor.sources[0].authority.issued_at = "2026-02-31T09:00:00+09:00";
    assertSafeEnvelope(runCli(root, descriptor), 2);
    const health = makeMailObservation();
    health.observed_at = "2026-02-31T12:00:00+09:00";
    assert.throws(() => evaluateMailSyntheticHealth(health, EVALUATION_TIME));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("required attested findings remain review-ready and lane availability rolls up conservatively", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-inventory-availability-"));
  try {
    const dbPath = join(root, "synthetic.sqlite");
    seedDatabase(dbPath);
    const contradiction = makeDescriptor(dbPath);
    contradiction.sources.find((source) => source.lane === "mail").inventory.source_availability_summary = "attested_absent";
    const contradictionExecution = runCli(root, contradiction);
    assertSafeEnvelope(contradictionExecution, 2);
    assert.equal(contradictionExecution.stdout.includes("NORMAL"), false);
    for (const availability of ["attested_absent", "attested_gap"]) {
      await t.test(`required ${availability}`, () => {
        const descriptor = makeDescriptor(dbPath);
        const mail = descriptor.sources.find((source) => source.lane === "mail");
        mail.inventory.source_availability_summary = availability;
        delete mail.synthetic_health_observation;
        const execution = runCli(root, descriptor);
        assert.equal(execution.status, 0, execution.stderr || execution.stdout);
        assert.equal(JSON.parse(execution.stdout).lanes.mail.source_availability_summary, availability);
      });
    }
    const rollups = [
      ["attested_absent", [["absent", "attested_absent"]]],
      ["attested_gap", [["absent", "attested_absent"], ["gap", "attested_gap"]]],
      ["unknown", [["gap", "attested_gap"], ["pending", "unknown"]]],
    ];
    for (const [expected, additions] of rollups) {
      await t.test(`mixed sources roll up to ${expected}`, () => {
        const descriptor = makeDescriptor(dbPath);
        for (const [suffix, availability] of additions) addOptionalMailSource(descriptor, suffix, availability);
        const execution = runCli(root, descriptor);
        assert.equal(execution.status, 0, execution.stderr || execution.stdout);
        assert.equal(JSON.parse(execution.stdout).lanes.mail.source_availability_summary, expected);
      });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing legacy table blocks without repair", () => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-inventory-legacy-"));
  try {
    const dbPath = join(root, "legacy.sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE legacy_items(id INTEGER PRIMARY KEY)");
    db.close();
    const before = sqliteState(dbPath);
    const execution = runCli(root, makeDescriptor(dbPath));
    assertSafeEnvelope(execution, 3);
    assert.deepEqual(sqliteState(dbPath), before);
    const verify = new DatabaseSync(dbPath, { readOnly: true });
    try {
      assert.equal(Number(verify.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table' AND name='task_items'").get().n), 0);
    } finally {
      verify.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conflicting inventory, invalid catalog identifiers, missing columns, and corrupt databases fail closed", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-inventory-fail-closed-"));
  try {
    const dbPath = join(root, "synthetic.sqlite");
    seedDatabase(dbPath);
    await t.test("conflicting owner", () => {
      const descriptor = makeDescriptor(dbPath);
      const extra = clone(descriptor.sources[0]);
      extra.source_ref = "source_mail_extra";
      extra.authority.source_authority_ref = "authority_mail_extra";
      extra.authority.evidence_refs = ["evidence_mail_extra"];
      extra.inventory.physical_owner_ref = "owner_mail_extra";
      delete extra.synthetic_health_observation;
      descriptor.sources.push(extra);
      descriptor.expected_sources.push(extra.source_ref);
      assertSafeEnvelope(runCli(root, descriptor), 3);
    });
    await t.test("invalid table identifier", () => {
      const descriptor = makeDescriptor(dbPath);
      descriptor.sources.find((source) => source.query).query.table_count_allowlist = ["task-items"];
      assertSafeEnvelope(runCli(root, descriptor), 3);
    });
    await t.test("missing column", () => {
      const descriptor = makeDescriptor(dbPath);
      descriptor.sources.find((source) => source.query).query.enum_count_allowlist[0].column = "missing_status";
      assertSafeEnvelope(runCli(root, descriptor), 3);
    });
    await t.test("redacted operational failure", () => {
      const corruptPath = join(root, "corrupt.sqlite");
      writeFileSync(corruptPath, "synthetic-not-a-database", "utf8");
      const descriptor = makeDescriptor(corruptPath);
      const execution = runCli(root, descriptor);
      const envelope = assertSafeEnvelope(execution, 6);
      assert.equal(JSON.stringify(envelope).includes("corrupt"), false);
      assert.equal(JSON.stringify(envelope).includes("not-a-database"), false);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("not_applicable requires applicability_ref and forbids it otherwise", () => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-inventory-applicability-"));
  try {
    const dbPath = join(root, "synthetic.sqlite");
    seedDatabase(dbPath);
    const missing = makeDescriptor(dbPath);
    missing.sources[0].requirement = "not_applicable";
    assertSafeEnvelope(runCli(root, missing), 2);
    const forbidden = makeDescriptor(dbPath);
    forbidden.sources[0].applicability_ref = "applicability_mail";
    assertSafeEnvelope(runCli(root, forbidden), 2);
    const valid = makeDescriptor(dbPath);
    valid.sources[0].requirement = "not_applicable";
    valid.sources[0].applicability_ref = "applicability_mail";
    valid.sources[0].authority.proof_scope = [];
    valid.sources[0].inventory.source_availability_summary = "attested_absent";
    delete valid.sources[0].synthetic_health_observation;
    const execution = runCli(root, valid);
    assert.equal(execution.status, 0, execution.stderr || execution.stdout);
    assert.equal(JSON.parse(execution.stdout).lanes.mail.source_availability_summary, "attested_absent");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI grammar and raw/path/secret sentinels fail closed with compact safe envelopes", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-inventory-cli-"));
  try {
    const dbPath = join(root, "synthetic.sqlite");
    seedDatabase(dbPath);
    const cliCases = [
      ["missing required flag", [TOOL, "--query-only", "--json"]],
      ["unknown flag", [TOOL, "--query-only", "--json", "--descriptor", "fixture.json", "--db", "x"]],
      ["duplicate flag", [TOOL, "--query-only", "--query-only", "--json", "--descriptor", "fixture.json"]],
      ["missing descriptor value", [TOOL, "--query-only", "--json", "--descriptor"]],
      ["glob descriptor", [TOOL, "--query-only", "--json", "--descriptor", "*.json"]],
    ];
    for (const [name, args] of cliCases) {
      await t.test(name, () => assertSafeEnvelope(runCli(root, makeDescriptor(dbPath), args), 2));
    }

    const sentinels = [
      ["raw copied", (d) => { d.sources[0].synthetic_health_observation.raw_payload_copied = true; }],
      ["path field", (d) => { d.sources[0].synthetic_health_observation.raw_path = "C:\\sensitive\\mail.eml"; }],
      ["secret field", (d) => { d.sources[0].synthetic_health_observation.secret_token = "sk-synthetic-not-real-123456"; }],
    ];
    for (const [name, mutate] of sentinels) {
      await t.test(name, () => {
        const descriptor = makeDescriptor(dbPath);
        mutate(descriptor);
        const execution = runCli(root, descriptor);
        const envelope = assertSafeEnvelope(execution, 5);
        assert.equal(JSON.stringify(envelope).includes("sensitive"), false);
        assert.equal(JSON.stringify(envelope).includes("sk-synthetic"), false);
      });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("authority effect cannot grant P0, H00, P1 adapter, writer, or activation authority", () => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-inventory-ceiling-"));
  try {
    const dbPath = join(root, "synthetic.sqlite");
    seedDatabase(dbPath);
    const execution = runCli(root, makeDescriptor(dbPath));
    assert.equal(execution.status, 0, execution.stderr || execution.stdout);
    const manifest = JSON.parse(execution.stdout);
    assert.deepEqual(manifest.authority_effect, {
      h00_review_unlocked: false,
      p0_accepted: false,
      p1_adapter_execution_unlocked: false,
      review_ready: true,
      writer_or_activation_authority_created: false,
    });
    assert.equal(/p1_unlocked|approval_grant|ratification_grant|activation_grant|writer_grant/.test(execution.stdout), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("authorized observations still leave every C00-LIVE proof unresolved for the C00B judge", () => {
  const root = mkdtempSync(join(tmpdir(), "task-engine-inventory-live-proof-"));
  try {
    const dbPath = join(root, "synthetic.sqlite");
    seedDatabase(dbPath);
    const descriptor = makeDescriptor(dbPath);
    for (const source of descriptor.sources) {
      source.inventory.profile = "authorized_observation";
      delete source.synthetic_health_observation;
    }
    const execution = runCli(root, descriptor);
    assert.equal(execution.status, 0, execution.stderr || execution.stdout);
    const manifest = JSON.parse(execution.stdout);
    assert.deepEqual(manifest.unresolved_live_proofs, ALL_PROOFS);
    assert.equal(manifest.result, "review_ready_manifest");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mail synthetic evaluator applies precedence and never claims healthy zero-event completeness", async (t) => {
  const normal = evaluateMailSyntheticHealth(makeMailObservation(), EVALUATION_TIME);
  assert.equal(normal.status, "NORMAL");
  assert.equal(normal.observation_profile, "synthetic");
  assert.deepEqual(normal.reason_codes, ["mail_observation_current"]);
  assert.equal(JSON.stringify(normal).includes("complete_no_events"), false);
  assert.equal(normal.coverage_eligible, false);
  assert.deepEqual(normal.blockers, ["d25_policy_missing", "d26_mail_binding_missing"]);

  const zero = makeMailObservation();
  zero.run_summary = makeRun({ fetched: 0, newEvents: 0, duplicates: 0 });
  zero.recent_runs = [clone(zero.run_summary)];
  const zeroResult = evaluateMailSyntheticHealth(zero, EVALUATION_TIME);
  assert.equal(zeroResult.status, "NORMAL");
  assert.equal(JSON.stringify(zeroResult).includes("complete_no_events"), false);

  const cases = [
    ["missing", (o) => { delete o.run_summary; }, "CRITICAL", "mail_run_summary_missing"],
    ["stale", (o) => { o.run_summary = makeRun({ startedAt: "2026-07-16T11:00:00+09:00", finishedAt: "2026-07-16T11:01:00+09:00" }); }, "CRITICAL", "mail_run_summary_stale"],
    ["fail streak", (o) => { o.recent_runs = [makeRun({ partial: true, errors: ["mail_failure"] }), makeRun({ startedAt: "2026-07-16T11:56:00+09:00", finishedAt: "2026-07-16T11:57:00+09:00", partial: true, errors: ["mail_failure"] })]; }, "CRITICAL", "mail_fail_streak_threshold"],
    ["partial streak", (o) => { o.recent_runs = [makeRun({ partial: true }), makeRun({ startedAt: "2026-07-16T11:56:00+09:00", finishedAt: "2026-07-16T11:57:00+09:00", partial: true })]; }, "WARN", "mail_partial_streak_threshold"],
  ];
  for (const [name, mutate, status, reason] of cases) {
    await t.test(name, () => {
      const observation = makeMailObservation();
      mutate(observation);
      const result = evaluateMailSyntheticHealth(observation, EVALUATION_TIME);
      assert.equal(result.status, status);
      assert.deepEqual(result.reason_codes, [reason]);
      assert.equal(result.raw_payload_copied, false);
    });
  }
});

test("mail synthetic evaluator rejects invalid counts, chronology, projection, and secrets", () => {
  const count = makeMailObservation();
  count.run_summary.totals.fetched = 99;
  assert.throws(() => evaluateMailSyntheticHealth(count, EVALUATION_TIME));
  const equation = makeMailObservation();
  equation.run_summary.sources[0].duplicates = 0;
  equation.run_summary.totals.duplicates = 0;
  assert.throws(() => evaluateMailSyntheticHealth(equation, EVALUATION_TIME));
  const chronology = makeMailObservation();
  chronology.run_summary.finished_at = "2026-07-16T11:00:00+09:00";
  chronology.run_summary.started_at = "2026-07-16T11:10:00+09:00";
  assert.throws(() => evaluateMailSyntheticHealth(chronology, EVALUATION_TIME));
  const nonPartialError = makeMailObservation();
  nonPartialError.run_summary = makeRun({ errors: ["mail_failure"] });
  assert.throws(() => evaluateMailSyntheticHealth(nonPartialError, EVALUATION_TIME));
  const path = makeMailObservation();
  path.raw_path = "C:\\synthetic\\mail.eml";
  assert.throws(() => evaluateMailSyntheticHealth(path, EVALUATION_TIME));
  const raw = makeMailObservation();
  raw.raw_payload_copied = true;
  assert.throws(() => evaluateMailSyntheticHealth(raw, EVALUATION_TIME));
});

test("voice synthetic evaluator covers ready, no-ack, missing, mismatch, stale, and occurrence rules", async (t) => {
  const delivered = evaluateVoiceSyntheticHealth(makeVoiceObservation(), EVALUATION_TIME);
  assert.equal(delivered.status, "NORMAL");
  assert.equal(delivered.observation_profile, "synthetic");
  assert.equal(delivered.receipt_state, "delivered");
  assert.equal(delivered.history_event_count, null);
  assert.equal(delivered.aggregate_metrics.native_occurrence_candidate_count, 1);
  for (const key of ["receipt_occurrence_contribution", "ack_occurrence_contribution", "session_occurrence_contribution", "bundle_occurrence_contribution"]) {
    assert.equal(delivered.aggregate_metrics[key], 0);
  }
  assert.equal(delivered.coverage_eligible, false);
  assert.deepEqual(delivered.blockers, ["d25_policy_missing", "d26_voice_event_revision_mapping_missing"]);

  const cases = [
    ["ready", (o) => { o.receipt_summary.delivery_confirmed = false; }, "ready", "NORMAL"],
    ["no ack", (o) => { Object.assign(o.receipt_summary, { ack_present: false, ack_matches: false, delivery_confirmed: false, ack_count: 0, acknowledged_at: null }); }, "no_ack", "WARN"],
    ["missing receipt", (o) => { Object.assign(o.receipt_summary, { receipt_present: false, receipt_matches: false, receipt_count: 0, ack_present: false, ack_matches: false, ack_count: 0, delivery_confirmed: false, acknowledged_at: null }); }, "missing", "CRITICAL"],
    ["mismatch", (o) => { o.receipt_summary.receipt_matches = false; o.receipt_summary.delivery_confirmed = false; }, "mismatch", "CRITICAL"],
    ["stale", (o) => { o.max_stale_sec = 30; o.receipt_summary.delivery_confirmed = false; }, "stale", "WARN"],
    ["route missing", (o) => { o.route_selected = false; }, "missing", "CRITICAL"],
  ];
  for (const [name, mutate, state, status] of cases) {
    await t.test(name, () => {
      const observation = makeVoiceObservation();
      mutate(observation);
      const result = evaluateVoiceSyntheticHealth(observation, EVALUATION_TIME);
      assert.equal(result.receipt_state, state);
      assert.equal(result.status, status);
      assert.equal(result.raw_payload_copied, false);
      assert.equal(/gap_codes|known_at|coverage_window|complete/.test(JSON.stringify(result)), false);
    });
  }
});

test("voice synthetic evaluator rejects hash, size, identity, clock, path, raw, and forbidden projection fields", () => {
  const cases = [
    (o) => { o.source_hash = "A".repeat(64); },
    (o) => { o.source_size_bytes = -1; },
    (o) => { o.receipt_summary.consumer_ref = o.receipt_summary.producer_ref; },
    (o) => { o.receipt_summary.acknowledged_at = "2026-07-16T11:00:00+09:00"; },
    (o) => { o.raw_payload_copied = true; },
    (o) => { o.transcript = "synthetic words"; },
    (o) => { o.raw_path = "C:\\synthetic\\voice.wav"; },
  ];
  for (const mutate of cases) {
    const observation = makeVoiceObservation();
    mutate(observation);
    assert.throws(() => evaluateVoiceSyntheticHealth(observation, EVALUATION_TIME));
  }
});

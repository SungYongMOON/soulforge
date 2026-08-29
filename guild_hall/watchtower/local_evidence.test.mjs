import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LOCAL_EVIDENCE_LANES,
  persistLocalEvidenceReceipt,
  validateFiveFieldLedgerSet,
  validateWatchtowerExecution,
  validateWorkmetaStore,
} from "./local_evidence.mjs";
import { composeTopologyHealth } from "./watchtower.mjs";

async function tempRoot() {
  return mkdtemp(path.join(os.tmpdir(), "soulforge-local-evidence-"));
}

function fiveFieldRecord(overrides = {}) {
  return {
    schema_version: "soulforge.five_field_capture.v0",
    id: "synthetic_session:123456789abc",
    at: "2026-08-14T00:00:00.000Z",
    occurred_at: "2026-08-14T00:00:00.000Z",
    recorded_at: "2026-08-14T00:00:00.000Z",
    worker: "synthetic_worker",
    session_ref: "synthetic_session",
    project_code: "system",
    request_kind: "test/health",
    input_refs: ["synthetic_ref"],
    judgment: "synthetic judgment",
    output: "synthetic output",
    verification: "synthetic pass",
    stop_conditions: ["none"],
    needs_backfill: 0,
    data_label: "ai_draft",
    ...overrides,
  };
}

test("five-field evidence validates bounded exact metadata ledgers", async () => {
  const root = await tempRoot();
  const directory = path.join(root, "system", "reports", "procedure_capture");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "five_field_log.jsonl"), `${JSON.stringify(fiveFieldRecord())}\n`);
  const result = await validateFiveFieldLedgerSet({ workmetaRoot: root });
  assert.equal(result.ok, true);
  assert.equal(result.validated_count, 1);
  assert.match(result.validation_digest, /^[0-9a-f]{64}$/u);
});

test("five-field evidence accepts the bounded legacy plus separator but rejects email identity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-five-field-legacy-"));
  const ledger = path.join(root, "system", "reports", "procedure_capture", "five_field_log.jsonl");
  await mkdir(path.dirname(ledger), { recursive: true });
  const legacy = fiveFieldRecord({
    id: "synthetic+legacy:123456789abc",
    session_ref: "synthetic+legacy",
  });
  await writeFile(ledger, `${JSON.stringify(legacy)}\n`);
  assert.equal((await validateFiveFieldLedgerSet({ workmetaRoot: root })).ok, true);
  legacy.id = "operator@example.invalid:123456789abc";
  legacy.session_ref = "operator@example.invalid";
  await writeFile(ledger, `${JSON.stringify(legacy)}\n`);
  assert.deepEqual(await validateFiveFieldLedgerSet({ workmetaRoot: root }), {
    ok: false, error_codes: ["five_field_record_invalid"], validated_count: 0,
  });
});

test("five-field evidence accepts the exact SYSTEM legacy alias inside the canonical system directory", async () => {
  const root = await tempRoot();
  const directory = path.join(root, "system", "reports", "procedure_capture");
  await mkdir(directory, { recursive: true });
  const legacyAlias = fiveFieldRecord({ project_code: "SYSTEM" });
  await writeFile(path.join(directory, "five_field_log.jsonl"), `${JSON.stringify(legacyAlias)}\n`);
  const result = await validateFiveFieldLedgerSet({ workmetaRoot: root });
  assert.equal(result.ok, true);
  assert.equal(result.validated_count, 1);
});

test("five-field evidence rejects every other project/directory case mismatch", async () => {
  const root = await tempRoot();
  const directory = path.join(root, "system", "reports", "procedure_capture");
  await mkdir(directory, { recursive: true });
  const wrongCase = fiveFieldRecord({ project_code: "System" });
  await writeFile(path.join(directory, "five_field_log.jsonl"), `${JSON.stringify(wrongCase)}\n`);
  assert.deepEqual(await validateFiveFieldLedgerSet({ workmetaRoot: root }), {
    ok: false, error_codes: ["five_field_record_invalid"], validated_count: 0,
  });

  const otherRoot = await tempRoot();
  const otherDirectory = path.join(otherRoot, "widget", "reports", "procedure_capture");
  await mkdir(otherDirectory, { recursive: true });
  const otherAlias = fiveFieldRecord({ project_code: "WIDGET" });
  await writeFile(path.join(otherDirectory, "five_field_log.jsonl"), `${JSON.stringify(otherAlias)}\n`);
  assert.deepEqual(await validateFiveFieldLedgerSet({ workmetaRoot: otherRoot }), {
    ok: false, error_codes: ["five_field_record_invalid"], validated_count: 0,
  });
});

test("five-field evidence fails closed on malformed or conflicting rows", async () => {
  const root = await tempRoot();
  const directory = path.join(root, "system", "reports", "procedure_capture");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "five_field_log.jsonl"), "{not-json}\n");
  assert.deepEqual(
    (await validateFiveFieldLedgerSet({ workmetaRoot: root })).error_codes,
    ["five_field_json_invalid"],
  );
  await writeFile(path.join(directory, "five_field_log.jsonl"), [
    JSON.stringify(fiveFieldRecord()),
    JSON.stringify(fiveFieldRecord({ output: "different" })),
    "",
  ].join("\n"));
  assert.deepEqual(
    (await validateFiveFieldLedgerSet({ workmetaRoot: root })).error_codes,
    ["five_field_identity_conflict"],
  );
});

test("workmeta evidence exposes only counts and digest", async () => {
  const root = await tempRoot();
  const workmetaRoot = path.join(root, "_workmeta");
  await mkdir(path.join(workmetaRoot, "system", "reports"), { recursive: true });
  await writeFile(path.join(workmetaRoot, "system", "reports", "safe.yaml"), "schema: synthetic\n");
  const result = await validateWorkmetaStore({ repoRoot: root, workmetaRoot });
  assert.equal(result.ok, true);
  assert.equal(result.validated_count, 1);
  assert.deepEqual(Object.keys(result).sort(), [
    "error_codes", "ok", "validated_count", "validation_digest",
  ]);
});

test("Watchtower execution evidence requires the exact declared graph", async () => {
  const snapshot = await composeTopologyHealth({
    schema_version: "soulforge.watchtower.binding.v1",
    state_root: path.join(await tempRoot(), "state"),
    probes: {},
  }, { now: Date.parse("2026-08-14T00:00:00.000Z") });
  assert.equal(validateWatchtowerExecution(snapshot).ok, true);
  assert.deepEqual(
    validateWatchtowerExecution({ ...snapshot, nodes: snapshot.nodes.slice(1) }).error_codes,
    ["watchtower_snapshot_invalid"],
  );
});

test("receipt is atomic, retains last good, and distinguishes idle from change", async () => {
  const root = await tempRoot();
  const result = { ok: true, validation_digest: "a".repeat(64), validated_count: 3, error_codes: [] };
  const first = await persistLocalEvidenceReceipt({
    evidenceRoot: root, lane: "gate_five_field", result,
    attemptedAt: "2026-08-14T00:00:00.000Z",
    now: () => new Date("2026-08-14T00:00:01.000Z"),
  });
  assert.equal(first.activity_changed, null);
  const second = await persistLocalEvidenceReceipt({
    evidenceRoot: root, lane: "gate_five_field", result,
    attemptedAt: "2026-08-14T00:05:00.000Z",
    now: () => new Date("2026-08-14T00:05:01.000Z"),
  });
  assert.equal(second.activity_changed, false);
  const failed = await persistLocalEvidenceReceipt({
    evidenceRoot: root, lane: "gate_five_field",
    result: { ok: false, error_codes: ["five_field_json_invalid"] },
    attemptedAt: "2026-08-14T00:10:00.000Z",
    now: () => new Date("2026-08-14T00:10:01.000Z"),
  });
  assert.equal(failed.status, "error");
  assert.equal(failed.last_success_at, second.last_success_at);
  const disk = JSON.parse(await readFile(path.join(root, "gate_five_field.json"), "utf8"));
  assert.equal(disk.validation_scope, LOCAL_EVIDENCE_LANES.gate_five_field);
});

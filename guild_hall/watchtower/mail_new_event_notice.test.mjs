import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  CONNECTION_TEST_TEXT, SNAPSHOT_MAX_AGE_SECONDS, decideNotice, main,
} from "./mail_new_event_notice.mjs";

const T0 = Date.parse("2026-09-19T10:00:00.000Z");
const MIN = 60_000;

function snapshot(now, reasons = [], state = reasons.length ? "degraded" : "ok") {
  return {
    schema_version: "soulforge.watchtower.topology_health.v2",
    observed_at: new Date(now - MIN).toISOString(),
    nodes: [
      { id: "store_mail_events", label: "메일 event 원장", health: { state, reasons, age_seconds: 60 } },
      { id: "ingress_supervisor", health: { state: "ok", reasons: [], age_seconds: 30 } },
    ],
  };
}
const MISMATCH = ["count_store_unchanged_new_event_count_2"];
const receipt = (state, completedAt) => ({
  schema_version: "soulforge.ingress.store_validity.v1",
  status: "ok",
  completed_at: new Date(completedAt).toISOString(),
  new_event_store_check: {
    state, reason_code: null, reported_new_events: state === "no_new_events_reported" ? 0 : 2,
    store_unchanged_new_event_count: state === "store_unchanged" ? 2 : 0, comparison_scope: "a".repeat(64),
  },
});

// Runs a sequence of ticks, carrying the ledger like the cron job does.
function run(ticks) {
  let ledger = null;
  return ticks.map(({ at, snap, rec }) => {
    const result = decideNotice({ snapshot: snap, receipt: rec, ledger, now: at });
    ledger = result.ledger;
    return result;
  });
}

test("quiet while the store check is healthy; nothing is sent for normal heartbeats", () => {
  const results = run([
    { at: T0, snap: snapshot(T0), rec: receipt("no_new_events_reported", T0 - 2 * MIN) },
    { at: T0 + 15 * MIN, snap: snapshot(T0 + 15 * MIN), rec: receipt("store_changed", T0 + 13 * MIN) },
  ]);
  assert.deepEqual(results.map((r) => r.text), [null, null]);
});

test("a mismatch is sent once, then suppressed while unchanged", () => {
  const results = run([
    { at: T0, snap: snapshot(T0, MISMATCH), rec: receipt("store_unchanged", T0 - 2 * MIN) },
    { at: T0 + 5 * MIN, snap: snapshot(T0 + 5 * MIN, MISMATCH), rec: receipt("store_unchanged", T0 - 2 * MIN) },
  ]);
  assert.match(results[0].text, /^\[살핌이·운영감시\] 메일 신규 보고와 저장소 관측이 맞지 않습니다\./u);
  assert.match(results[0].text, /신규 메일: 2건/u);
  assert.match(results[0].text, /원인·누락 건수는 확정하지 않았습니다/u);
  assert.equal(results[1].text, null);
  assert.equal(results[1].decision, "suppressed_open");
});

test("no new events or not_comparable later does not resolve; the reminder follows the existing backoff", () => {
  const results = run([
    { at: T0, snap: snapshot(T0, MISMATCH), rec: receipt("store_unchanged", T0 - 2 * MIN) },
    { at: T0 + 15 * MIN, snap: snapshot(T0 + 15 * MIN), rec: receipt("no_new_events_reported", T0 + 13 * MIN) },
    { at: T0 + 30 * MIN, snap: snapshot(T0 + 30 * MIN), rec: receipt("not_comparable", T0 + 28 * MIN) },
    { at: T0 + 61 * MIN, snap: snapshot(T0 + 61 * MIN), rec: receipt("no_new_events_reported", T0 + 58 * MIN) },
  ]);
  assert.equal(results[1].text, null);
  assert.equal(results[2].text, null);
  assert.equal(results[1].ledger.mail_new_event_latch.open, true);
  assert.equal(results[2].ledger.mail_new_event_latch.open, true);
  assert.match(results[3].text, /아직 해소되지 않았습니다 \(1시간째\)/u);
  assert.doesNotMatch(results.map((r) => r.text ?? "").join("\n"), /해소됐습니다/u);
});

test("only a later store_changed resolves it, and the recovery line makes no completeness claim", () => {
  const results = run([
    { at: T0, snap: snapshot(T0, MISMATCH), rec: receipt("store_unchanged", T0 - 2 * MIN) },
    { at: T0 + 15 * MIN, snap: snapshot(T0 + 15 * MIN), rec: receipt("store_changed", T0 + 13 * MIN) },
    { at: T0 + 30 * MIN, snap: snapshot(T0 + 30 * MIN), rec: receipt("store_changed", T0 + 28 * MIN) },
  ]);
  assert.match(results[1].text, /불일치가 해소됐습니다/u);
  assert.match(results[1].text, /모두 저장됐거나 core_mail에 적재됐다는 뜻이 아닙니다/u);
  assert.equal(results[1].ledger.mail_new_event_latch.open, false);
  assert.equal(results[2].text, null);
});

test("a store_changed receipt older than the latch does not resolve it", () => {
  const results = run([
    { at: T0, snap: snapshot(T0, MISMATCH), rec: receipt("store_unchanged", T0 - 2 * MIN) },
    { at: T0 + 5 * MIN, snap: snapshot(T0 + 5 * MIN), rec: receipt("store_changed", T0 - 10 * MIN) },
  ]);
  assert.equal(results[1].ledger.mail_new_event_latch.open, true);
  assert.equal(results[1].text, null);
});

test("a stale or unreadable snapshot decides nothing and keeps the ledger", () => {
  const first = decideNotice({ snapshot: snapshot(T0, MISMATCH), receipt: receipt("store_unchanged", T0), ledger: null, now: T0 });
  const later = T0 + (SNAPSHOT_MAX_AGE_SECONDS + 600) * 1000;
  const stale = decideNotice({ snapshot: snapshot(T0, []), receipt: receipt("store_changed", later), ledger: first.ledger, now: later });
  assert.equal(stale.text, null);
  assert.equal(stale.decision, "snapshot_not_current");
  assert.equal(stale.ledger, null, "nothing is written on an unusable snapshot");
  const unreadable = decideNotice({ snapshot: null, receipt: null, ledger: first.ledger, now: T0 });
  assert.equal(unreadable.decision, "snapshot_invalid");
  assert.equal(unreadable.ledger, null);
});

test("older receipts without the cross-check never open or close anything", () => {
  const old = { schema_version: "soulforge.ingress.store_validity.v1", status: "ok", completed_at: new Date(T0).toISOString() };
  const results = run([{ at: T0, snap: snapshot(T0), rec: old }]);
  assert.equal(results[0].text, null);
  assert.equal(results[0].ledger.mail_new_event_latch.open, false);
});

test("the CLI prints only fixed text, keeps paths out, and persists the ledger", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mail-notice-"));
  try {
    const files = { snap: path.join(root, "snap.json"), rec: path.join(root, "rec.json"), ledger: path.join(root, "state", "ledger.json") };
    await writeFile(files.snap, JSON.stringify(snapshot(T0, MISMATCH)));
    await writeFile(files.rec, JSON.stringify(receipt("store_unchanged", T0 - MIN)));
    let out = "";
    const code = await main(["--snapshot", files.snap, "--receipt", files.rec, "--ledger", files.ledger],
      { now: T0, stdout: { write: (text) => { out += text; } } });
    assert.equal(code, 0);
    assert.match(out, /맞지 않습니다/u);
    assert.equal(out.includes(root), false);
    assert.equal(/[A-Za-z]:[\\/]|sha256|comparison_scope/u.test(out), false);
    const ledger = JSON.parse(await readFile(files.ledger, "utf8"));
    assert.equal(ledger.schema_version, "soulforge.watchtower.alert_ledger.v1");
    assert.equal(ledger.mail_new_event_latch.open, true);

    let again = "";
    await main(["--snapshot", files.snap, "--receipt", files.rec, "--ledger", files.ledger],
      { now: T0 + MIN, stdout: { write: (text) => { again += text; } } });
    assert.equal(again, "", "the same fault is not sent twice");

    let test = "";
    await main(["--connection-test"], { stdout: { write: (text) => { test += text; } } });
    assert.equal(test, `${CONNECTION_TEST_TEXT}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the Hermes shim passes the module's stdout through and fails with a fixed code only", async (t) => {
  const { spawnSync } = await import("node:child_process");
  const { copyFile, mkdir: mk } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const python = ["python", "python3"].find((cmd) => spawnSync(cmd, ["--version"]).status === 0);
  if (!python) { t.skip("python unavailable"); return; }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const root = await mkdtemp(path.join(os.tmpdir(), "mail-notice-shim-"));
  try {
    const scripts = path.join(root, "scripts");
    await mk(scripts, { recursive: true });
    const shim = path.join(scripts, "salpi_mail_new_event_notice.py");
    await copyFile(path.join(repoRoot, "guild_hall", "watchtower", "ops", "salpi_mail_new_event_notice.py"), shim);
    const runShim = (args = []) => spawnSync(python, [shim, ...args], { encoding: "utf8" });

    const missing = runShim();
    assert.equal(missing.status, 1);
    assert.equal(missing.stdout, "mail_new_event_notice_failed:config_unreadable\n");

    const snap = path.join(root, "snap.json");
    const rec = path.join(root, "rec.json");
    await writeFile(snap, JSON.stringify(snapshot(Date.now(), MISMATCH)));
    await writeFile(rec, JSON.stringify(receipt("store_unchanged", Date.now() - MIN)));
    await writeFile(path.join(scripts, "salpi_mail_new_event_notice.config.json"), JSON.stringify({
      node: process.execPath, lane_root: repoRoot, snapshot: snap, receipt: rec, ledger: path.join(root, "ledger.json"),
    }));
    const first = runShim();
    assert.equal(first.status, 0, first.stdout);
    assert.match(first.stdout, /^\[살핌이·운영감시\] 메일 신규 보고와 저장소 관측이 맞지 않습니다\./u);
    assert.equal(first.stdout.includes(root), false);
    const second = runShim();
    assert.equal(second.status, 0);
    assert.equal(second.stdout, "");
    const connection = runShim(["--connection-test"]);
    assert.equal(connection.stdout, `${CONNECTION_TEST_TEXT}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("review: the fault is anchored to the observed mismatch, so a store change right after it resolves", () => {
  // Snapshot still shows the old mismatch while the receipt already has a later store change.
  const results = run([
    { at: T0 + 20 * MIN, snap: snapshot(T0 + 20 * MIN, MISMATCH), rec: receipt("store_unchanged", T0) },
    { at: T0 + 25 * MIN, snap: snapshot(T0 + 25 * MIN), rec: receipt("store_changed", T0 + 16 * MIN) },
  ]);
  assert.equal(results[0].ledger.mail_new_event_latch.opened_at, new Date(T0).toISOString());
  assert.match(results[1].text, /해소됐습니다/u);
});

test("review: a store change seen between ticks is remembered even if a later run overwrites the receipt", () => {
  const results = run([
    { at: T0, snap: snapshot(T0, MISMATCH), rec: receipt("store_unchanged", T0 - MIN) },
    // Snapshot still carries the mismatch, but the receipt already shows the later store change.
    { at: T0 + 10 * MIN, snap: snapshot(T0 + 10 * MIN, MISMATCH), rec: receipt("store_changed", T0 + 8 * MIN) },
    // Next tick: that receipt was overwritten by a no-new-events run.
    { at: T0 + 25 * MIN, snap: snapshot(T0 + 25 * MIN), rec: receipt("no_new_events_reported", T0 + 23 * MIN) },
  ]);
  assert.equal(results[1].text, null);
  assert.match(results[2].text, /해소됐습니다/u);
});

test("review: a lost latch with a reported open fault stays open, never recovered", () => {
  const first = decideNotice({ snapshot: snapshot(T0, MISMATCH), receipt: receipt("store_unchanged", T0 - MIN), ledger: null, now: T0 });
  const damaged = { ...first.ledger };
  delete damaged.mail_new_event_latch;
  const next = decideNotice({ snapshot: snapshot(T0 + 15 * MIN), receipt: receipt("no_new_events_reported", T0 + 13 * MIN), ledger: damaged, now: T0 + 15 * MIN });
  assert.equal(next.ledger.mail_new_event_latch.open, true);
  assert.equal(next.text, null);
});

test("review: a corrupt ledger fails closed instead of being reset", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mail-notice-ledger-"));
  try {
    const files = { snap: path.join(root, "snap.json"), rec: path.join(root, "rec.json"), ledger: path.join(root, "ledger.json") };
    await writeFile(files.snap, JSON.stringify(snapshot(T0)));
    await writeFile(files.rec, JSON.stringify(receipt("no_new_events_reported", T0)));
    await writeFile(files.ledger, "{ truncated");
    await assert.rejects(main(["--snapshot", files.snap, "--receipt", files.rec, "--ledger", files.ledger], { now: T0, stdout: { write() {} } }),
      (error) => error.code === "ledger_invalid");
    assert.equal(await readFile(files.ledger, "utf8"), "{ truncated", "the ledger is left untouched");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

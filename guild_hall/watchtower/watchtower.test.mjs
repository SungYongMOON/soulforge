import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, utimes, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  validateWatchtowerBinding,
  runProbe,
  composeTopologyHealth,
  assertSnapshotPathFree,
  writeTopologyHealthSnapshot,
  WatchtowerError,
  WATCHTOWER_BINDING_SCHEMA_VERSION,
  WATCHTOWER_SNAPSHOT_SCHEMA_VERSION,
} from "./watchtower.mjs";
import { TOPOLOGY_NODES } from "./topology.mjs";

const NOW = Date.parse("2026-08-07T12:00:00.000Z");

async function tempRoot() {
  return mkdtemp(path.join(os.tmpdir(), "soulforge-watchtower-"));
}

function baseBinding(stateRoot, probes = {}) {
  return {
    schema_version: WATCHTOWER_BINDING_SCHEMA_VERSION,
    state_root: stateRoot,
    probes,
  };
}

test("binding validation is fail-closed", () => {
  assert.throws(
    () => validateWatchtowerBinding({ schema_version: "wrong", state_root: "x", probes: {} }),
    (error) => error instanceof WatchtowerError && error.code === "binding_schema_invalid",
  );
  assert.throws(
    () => validateWatchtowerBinding(baseBinding("root", { bad: { kind: "nope", period_seconds: 60, grace_seconds: 0 } })),
    (error) => error instanceof WatchtowerError && error.code === "probe_kind_invalid",
  );
  assert.throws(
    () => validateWatchtowerBinding(baseBinding("root", {
      a: { kind: "json_file", path: "p", period_seconds: 0, grace_seconds: 0 },
    })),
    (error) => error instanceof WatchtowerError && error.code === "probe_window_invalid",
  );
});

test("json_file probe judges fresh, late, stale, status, and numeric degrades", async () => {
  const root = await tempRoot();
  const file = path.join(root, "health.json");
  const probe = {
    kind: "json_file",
    path: file,
    timestamp_field: "observed_at",
    status_field: "status",
    ok_values: ["ok"],
    degrade_when: [{ field: "result.failed_count", above: 0 }],
    period_seconds: 600,
    grace_seconds: 300,
  };

  await writeFile(file, JSON.stringify({
    observed_at: new Date(NOW - 60_000).toISOString(),
    status: "ok",
    result: { failed_count: 0 },
  }));
  assert.deepEqual(await runProbe(probe, { now: NOW }), { state: "ok", reasons: [], age_seconds: 60 });

  await writeFile(file, JSON.stringify({
    observed_at: new Date(NOW - 700_000).toISOString(),
    status: "ok",
    result: { failed_count: 0 },
  }));
  const late = await runProbe(probe, { now: NOW });
  assert.equal(late.state, "degraded");
  assert.deepEqual(late.reasons, ["heartbeat_late"]);

  await writeFile(file, JSON.stringify({
    observed_at: new Date(NOW - 3_600_000).toISOString(),
    status: "ok",
  }));
  const stale = await runProbe(probe, { now: NOW });
  assert.equal(stale.state, "stale");
  assert.deepEqual(stale.reasons, ["heartbeat_stale"]);

  await writeFile(file, JSON.stringify({
    observed_at: new Date(NOW - 60_000).toISOString(),
    status: "degraded",
    result: { failed_count: 5 },
  }));
  const degraded = await runProbe(probe, { now: NOW });
  assert.equal(degraded.state, "degraded");
  assert.deepEqual(degraded.reasons, ["status_degraded", "count_failed_count_5"]);
});

test("jsonl_tail probe reads the last record and fails closed on missing sources", async () => {
  const root = await tempRoot();
  const file = path.join(root, "heartbeats.jsonl");
  const probe = {
    kind: "jsonl_tail",
    path: file,
    timestamp_field: "observed_at",
    status_field: "status",
    ok_values: ["ok"],
    period_seconds: 1200,
    grace_seconds: 600,
  };

  const missing = await runProbe(probe, { now: NOW });
  assert.equal(missing.state, "down");

  const lines = [
    { observed_at: new Date(NOW - 7_200_000).toISOString(), status: "ok" },
    {
      observed_at: new Date(NOW - 120_000).toISOString(),
      status: "degraded",
      error_codes: [
        "auth_failed__acc_hiworks_team",
        "mail_capsule_nested_credential_preload_empty__acc_hiworks_team",
        "C:\\private\\path detail",
        "Bad Code",
      ],
    },
  ].map((entry) => JSON.stringify(entry)).join("\n");
  await writeFile(file, lines + "\n");
  const result = await runProbe(probe, { now: NOW });
  assert.equal(result.state, "degraded");
  assert.deepEqual(result.reasons, [
    "status_degraded",
    "auth_failed__acc_hiworks_team",
    "mail_capsule_nested_credential_preload_empty__acc_hiworks_team",
  ]);
  assert.equal(result.age_seconds, 120);
});

test("dir_latest_mtime probe uses the newest file under the root", async () => {
  const root = await tempRoot();
  const nested = path.join(root, "batches", "2026-08-07");
  await mkdir(nested, { recursive: true });
  const oldFile = path.join(root, "old.json");
  const newFile = path.join(nested, "new.json");
  await writeFile(oldFile, "{}");
  await writeFile(newFile, "{}");
  await utimes(oldFile, new Date(NOW - 9_000_000), new Date(NOW - 9_000_000));
  await utimes(newFile, new Date(NOW - 300_000), new Date(NOW - 300_000));

  const probe = { kind: "dir_latest_mtime", path: root, period_seconds: 1800, grace_seconds: 600 };
  const result = await runProbe(probe, { now: NOW });
  assert.equal(result.state, "ok");
  assert.equal(result.age_seconds, 300);
});

test("schtask probe and resident_task disambiguation", async () => {
  const running = async () => "상태: 실행 중";
  const ready = async () => "상태: 준비";
  const failed = async () => null;

  const taskProbe = { kind: "schtask", task_name: "Soulforge-Test", period_seconds: 60, grace_seconds: 0 };
  assert.equal((await runProbe(taskProbe, { now: NOW, run_schtasks: running })).state, "ok");
  assert.equal((await runProbe(taskProbe, { now: NOW, run_schtasks: ready })).state, "down");
  assert.equal((await runProbe(taskProbe, { now: NOW, run_schtasks: failed })).state, "down");

  const root = await tempRoot();
  const file = path.join(root, "health.json");
  await writeFile(file, JSON.stringify({ observed_at: new Date(NOW - 7_200_000).toISOString(), status: "ok" }));
  const residentProbe = {
    kind: "json_file",
    path: file,
    timestamp_field: "observed_at",
    period_seconds: 900,
    grace_seconds: 300,
    resident_task: "Soulforge-Test",
  };
  const staleButRunning = await runProbe(residentProbe, { now: NOW, run_schtasks: running });
  assert.equal(staleButRunning.state, "stale");
  const staleAndDead = await runProbe(residentProbe, { now: NOW, run_schtasks: ready });
  assert.equal(staleAndDead.state, "down");
  assert.ok(staleAndDead.reasons.includes("task_not_running"));
});

test("composeTopologyHealth covers every node and never leaks paths", async () => {
  const root = await tempRoot();
  const healthFile = path.join(root, "voice-health.json");
  await writeFile(healthFile, JSON.stringify({
    last_completed_at: new Date(NOW - 120_000).toISOString(),
    status: "ok",
  }));

  const binding = baseBinding(path.join(root, "state"), {
    voice_label_worker: {
      kind: "json_file",
      path: healthFile,
      timestamp_field: "last_completed_at",
      status_field: "status",
      ok_values: ["ok"],
      period_seconds: 1200,
      grace_seconds: 1800,
    },
  });

  const snapshot = await composeTopologyHealth(binding, { now: NOW, run_schtasks: async () => "실행" });
  assert.equal(snapshot.schema_version, WATCHTOWER_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snapshot.nodes.length, TOPOLOGY_NODES.length);
  const voice = snapshot.nodes.find((node) => node.id === "voice_label_worker");
  assert.equal(voice.health.state, "ok");
  const unbound = snapshot.nodes.find((node) => node.id === "slack_batch");
  assert.equal(unbound.health.state, "unmonitored");
  assert.deepEqual(unbound.health.reasons, ["probe_unbound"]);
  const total = Object.values(snapshot.summary).reduce((sum, count) => sum + count, 0);
  assert.equal(total, TOPOLOGY_NODES.length);

  assert.equal(assertSnapshotPathFree(snapshot, binding), snapshot);
  const leaky = structuredClone(snapshot);
  leaky.nodes[0].health.reasons.push("C:\\Soulforge\\secret");
  assert.throws(
    () => assertSnapshotPathFree(leaky, binding),
    (error) => error instanceof WatchtowerError && error.code === "snapshot_path_leak",
  );
});

test("snapshot write is atomic into the binding state_root", async () => {
  const root = await tempRoot();
  const binding = baseBinding(path.join(root, "state"), {});
  const snapshot = await composeTopologyHealth(binding, { now: NOW, run_schtasks: async () => "실행" });
  const target = await writeTopologyHealthSnapshot(binding, snapshot);
  const persisted = JSON.parse(await readFile(target, "utf8"));
  assert.equal(persisted.schema_version, WATCHTOWER_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(persisted.nodes.length, TOPOLOGY_NODES.length);
});

test("mail account detail names the failing account without addresses or paths", async () => {
  const root = await tempRoot();
  const mailboxes = path.join(root, "mailboxes");
  const mkAccount = async (alias, summary) => {
    const dir = path.join(mailboxes, alias, "logs");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "last_run_summary.json"), JSON.stringify(summary));
  };
  await mkAccount("acc_failing", {
    partial: true,
    sources: [{ source: "hiworks", partial: true, error_codes: ["auth_failed"] }],
  });
  await mkAccount("acc_clean", { partial: false, sources: [{ source: "hiworks", partial: false, error_codes: [] }] });
  await mkAccount("acc_flaky", { partial: false, errors: [{ code: "fetch_timeout" }] });

  const { collectMailAccountDetails } = await import("./watchtower.mjs");
  const details = await collectMailAccountDetails({
    kind: "mail_account_summaries",
    path: mailboxes,
    account_labels: { acc_failing: "김민재" },
  });
  assert.equal(details.scanned, 3);
  assert.deepEqual(details.reasons, [
    "메일 계정 acc_flaky: fetch_timeout",
    "메일 계정 김민재: auth_failed",
  ]);

  const healthFile = path.join(root, "hb.jsonl");
  await writeFile(healthFile, JSON.stringify({
    observed_at: new Date(NOW - 60_000).toISOString(),
    status: "degraded",
  }) + "\n");
  const probe = {
    kind: "jsonl_tail",
    path: healthFile,
    timestamp_field: "observed_at",
    status_field: "status",
    ok_values: ["ok"],
    period_seconds: 1200,
    grace_seconds: 1200,
    detail: { kind: "mail_account_summaries", path: mailboxes, account_labels: { acc_failing: "김민재" } },
  };
  const result = await runProbe(probe, { now: NOW });
  assert.equal(result.state, "degraded");
  assert.ok(result.reasons.includes("메일 계정 김민재: auth_failed"));

  assert.throws(
    () => validateWatchtowerBinding(baseBinding("root", {
      a: {
        kind: "json_file", path: "p", period_seconds: 60, grace_seconds: 0,
        detail: { kind: "mail_account_summaries", path: "m", account_labels: { acc_x: "user@example.com" } },
      },
    })),
    (error) => error instanceof WatchtowerError && error.code === "probe_detail_invalid",
  );
});

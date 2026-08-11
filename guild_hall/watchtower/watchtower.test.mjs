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
import {
  TOPOLOGY_EDGES,
  TOPOLOGY_NODES,
  validateTopologyDefinition,
  edgeDeliveryVerdict,
  summariseEdgeDelivery,
  EDGE_DELIVERY_STATES,
} from "./topology.mjs";

const NOW = Date.parse("2026-08-07T12:00:00.000Z");

test("topology models actual hybrid on-demand usage producers and structural routes", () => {
  const nodesById = new Map(TOPOLOGY_NODES.map((node) => [node.id, node]));
  assert.equal(nodesById.size, TOPOLOGY_NODES.length);
  assert.equal(TOPOLOGY_NODES.length, 27);
  assert.equal(TOPOLOGY_EDGES.length, 33);
  assert.equal(validateTopologyDefinition().nodes, TOPOLOGY_NODES);
  for (const edge of TOPOLOGY_EDGES) {
    assert.ok(nodesById.has(edge.from), `missing source ${edge.from}`);
    assert.ok(nodesById.has(edge.to), `missing target ${edge.to}`);
    assert.ok(nodesById.get(edge.from).col <= nodesById.get(edge.to).col, `${edge.from} must not route backward to ${edge.to}`);
    assert.equal(Object.hasOwn(edge, "health"), false);
    assert.equal(Object.hasOwn(edge, "state"), false);
  }

  // 이 단정은 경로만 본다. 전달 근거 필드는 별개 관심사이므로 아래 별도 test 가 검사한다.
  const usageRoutes = TOPOLOGY_EDGES
    .filter((edge) => edge.from.startsWith("src_") && edge.to.startsWith("usage_")
      || edge.from.startsWith("usage_") && ["usage_meter", "store_usage_ledger", "watchtower_self"].includes(edge.to)
      || edge.from === "store_usage_ledger" && edge.to === "consumer_board")
    .map(({ from, to, label, flow, scope }) => (scope === undefined
      ? { from, to, label, flow }
      : { from, to, label, flow, scope }));
  assert.deepEqual(usageRoutes, [
    { from: "src_codex", to: "usage_codex_collector", label: "on-demand read", flow: "data" },
    { from: "src_claude", to: "usage_claude_collector", label: "on-demand read", flow: "data" },
    { from: "src_antigravity", to: "usage_antigravity_collector", label: "on-demand read", flow: "data" },
    { from: "usage_codex_collector", to: "usage_meter", label: "usage event", flow: "data" },
    { from: "usage_claude_collector", to: "usage_meter", label: "usage event", flow: "data" },
    { from: "usage_antigravity_collector", to: "usage_meter", label: "usage event", flow: "data" },
    { from: "usage_meter", to: "store_usage_ledger", label: "validated append", flow: "data" },
    { from: "store_usage_ledger", to: "consumer_board", label: "read-only usage snapshot", flow: "data" },
    { from: "usage_codex_collector", to: "watchtower_self", label: "Codex collector health 관찰", flow: "control", scope: "usage_collector_health_only" },
    { from: "usage_claude_collector", to: "watchtower_self", label: "Claude collector health 관찰", flow: "control", scope: "usage_collector_health_only" },
    { from: "usage_meter", to: "watchtower_self", label: "usage ledger validation health 관찰", flow: "control", scope: "usage_meter_health_only" },
  ]);
  for (const provider of ["codex", "claude", "antigravity"]) {
    const source = nodesById.get(`src_${provider}`);
    const collector = nodesById.get(`usage_${provider}_collector`);
    assert.equal(source.provider, provider);
    assert.equal(source.health_scope, "provider");
    assert.equal(source.operation_mode, "structural");
    assert.equal(collector.provider, provider);
    assert.equal(collector.health_scope, "collector");
    assert.equal(collector.operation_mode, provider === "antigravity" ? "on_demand" : "scheduled");
  }
  assert.equal(nodesById.get("usage_meter").health_scope, "aggregate");
  assert.equal(nodesById.get("usage_meter").operation_mode, "on_demand");
  assert.equal(nodesById.get("usage_meter").probe, "usage_meter");
  for (const storeId of ["store_mail_events", "store_voice_custody", "store_slack_custody"]) {
    const store = nodesById.get(storeId);
    assert.equal(store.kind, "store");
    assert.equal(store.probe, storeId);
    assert.equal(store.health_scope, "node");
    assert.equal(store.unmonitored_reason, "independent_evidence_absent");
  }

  const watchtowerInputs = TOPOLOGY_EDGES.filter((edge) => edge.to === "watchtower_self");
  const watchtowerOutputs = TOPOLOGY_EDGES.filter((edge) => edge.from === "watchtower_self");
  assert.equal(watchtowerInputs.length, 8);
  assert.ok(watchtowerInputs.every((edge) => edge.flow === "control" && typeof edge.scope === "string"));
  assert.deepEqual(watchtowerOutputs.map(({ from, to, label, flow }) => ({ from, to, label, flow })), [
    { from: "watchtower_self", to: "consumer_board", label: "판정 스냅샷", flow: "data" },
  ]);
});

test("topology validation rejects duplicate, dangling, unsupported, and runtime-state edges", () => {
  assert.throws(
    () => validateTopologyDefinition({ nodes: [...TOPOLOGY_NODES, { ...TOPOLOGY_NODES[0] }], edges: TOPOLOGY_EDGES }),
    (error) => error?.code === "topology_node_duplicate",
  );
  assert.throws(
    () => validateTopologyDefinition({ nodes: TOPOLOGY_NODES, edges: [...TOPOLOGY_EDGES, { ...TOPOLOGY_EDGES[0] }] }),
    (error) => error?.code === "topology_edge_duplicate",
  );
  assert.throws(
    () => validateTopologyDefinition({ nodes: TOPOLOGY_NODES, edges: [{ from: "missing", to: "consumer_board", label: "x", flow: "data" }] }),
    (error) => error?.code === "topology_edge_dangling",
  );
  assert.throws(
    () => validateTopologyDefinition({ nodes: TOPOLOGY_NODES, edges: [{ from: "src_codex", to: "store_usage_ledger", label: "x", flow: "control" }] }),
    (error) => error?.code === "topology_kind_flow_unsupported",
  );
  assert.throws(
    () => validateTopologyDefinition({ nodes: TOPOLOGY_NODES, edges: [{ ...TOPOLOGY_EDGES[0], health: { state: "ok" } }] }),
    (error) => error?.code === "topology_edge_runtime_state_forbidden",
  );
  assert.throws(
    () => validateTopologyDefinition({
      nodes: TOPOLOGY_NODES,
      edges: [{ from: "usage_meter", to: "watchtower_self", label: "wrong subject", flow: "control", scope: "usage_collector_health_only" }],
    }),
    (error) => error?.code === "topology_edge_scope_subject_invalid",
  );
  assert.throws(
    () => validateTopologyDefinition({
      nodes: TOPOLOGY_NODES,
      edges: [{ from: "usage_codex_collector", to: "watchtower_self", label: "wrong subject", flow: "control", scope: "usage_contract_structure_only" }],
    }),
    (error) => error?.code === "topology_edge_scope_subject_invalid",
  );
});

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

test("sanitized JSON receipt contracts fail closed on schema and required field defects", async () => {
  const root = await tempRoot();
  const file = path.join(root, "receipt.json");
  const probe = {
    kind: "json_file", path: file, expected_schema_version: "soulforge.test_health.v1",
    required_fields: ["attempted_at", "completed_at", "last_success_at", "status"],
    required_string_fields: ["status"],
    expected_field_values: { lane: "store_test", validation_scope: "test_validity" },
    required_timestamp_fields: ["attempted_at", "completed_at"],
    nullable_timestamp_fields: ["last_success_at"], timestamp_field: "completed_at",
    status_field: "status", ok_values: ["ok"], period_seconds: 300, grace_seconds: 300,
    missing_is_unmonitored: true,
  };
  const good = {
    schema_version: "soulforge.test_health.v1", lane: "store_test", validation_scope: "test_validity", attempted_at: new Date(NOW - 30_000).toISOString(),
    completed_at: new Date(NOW - 20_000).toISOString(), last_success_at: null, status: "ok",
  };
  await writeFile(file, JSON.stringify(good));
  assert.equal((await runProbe(probe, { now: NOW })).state, "ok");
  for (const bad of [
    { ...good, schema_version: "wrong" },
    { ...good, attempted_at: "invalid" },
    { ...good, completed_at: undefined },
    { ...good, last_success_at: 42 },
    { ...good, status: undefined },
    { ...good, status: 42 },
    { ...good, lane: "store_other" },
    { ...good, validation_scope: "wrong_validity" },
  ]) {
    await writeFile(file, JSON.stringify(bad));
    assert.equal((await runProbe(probe, { now: NOW })).state, "unmonitored");
  }
  await writeFile(file, "{");
  assert.equal((await runProbe(probe, { now: NOW })).state, "unmonitored");
});

test("usage heartbeat is unknown when absent, degrades within grace, and is down only with explicit task stop", async () => {
  const root = await tempRoot();
  const file = path.join(root, "usage-heartbeat.json");
  const probe = {
    kind: "json_file", path: file, timestamp_field: "last_success_at", status_field: "status",
    ok_values: ["ok"], period_seconds: 300, grace_seconds: 600,
    resident_task: "Soulforge-TeamOpsBoard-ReadOnly-v1", missing_is_unmonitored: true,
  };
  assert.deepEqual(await runProbe(probe, { now: NOW }), {
    state: "unmonitored", reasons: ["heartbeat_receipt_unavailable", "source_missing"], age_seconds: null,
  });
  assert.deepEqual(await runProbe(probe, { now: NOW, run_schtasks: async () => "Ready" }), {
    state: "down", reasons: ["task_not_running"], age_seconds: null,
  });
  assert.deepEqual(await runProbe(probe, { now: NOW, run_schtasks: async () => null }), {
    state: "unmonitored", reasons: ["task_state_unknown"], age_seconds: null,
  });
  await writeFile(file, JSON.stringify({ last_success_at: new Date(NOW - 600_000).toISOString(), status: "error", error_codes: ["collector_failed"], activity_changed: false }));
  const degraded = await runProbe(probe, { now: NOW });
  assert.equal(degraded.state, "degraded");
  assert.ok(degraded.reasons.includes("collector_failed"));
  await writeFile(file, JSON.stringify({ last_success_at: new Date(NOW - 901_000).toISOString(), status: "ok", activity_changed: false }));
  assert.equal((await runProbe(probe, { now: NOW, run_schtasks: async () => "Running" })).state, "stale");
  assert.equal((await runProbe(probe, { now: NOW, run_schtasks: async () => "Ready" })).state, "down");
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
        ["C:", "private", "path detail"].join("\\"),
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
  assert.equal((await runProbe(taskProbe, { now: NOW, run_schtasks: failed })).state, "unmonitored");

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

test("task ownership judges Ready, Running, Disabled, query failure, and unknown explicitly", async () => {
  const taskStates = {
    running: async () => "State: Running",
    ready: async () => "State: Ready",
    disabled: async () => "State: Disabled",
    failed: async () => null,
    unknown: async () => "State: Unrecognized",
  };
  const bare = { kind: "schtask", task_name: "Soulforge-Test", period_seconds: 60, grace_seconds: 0 };
  for (const [name, expected] of Object.entries({ running: "ok", ready: "down", disabled: "down", failed: "unmonitored", unknown: "unmonitored" })) {
    assert.equal((await runProbe(bare, { now: NOW, run_schtasks: taskStates[name] })).state, expected, `bare ${name}`);
  }
  const scheduled = { ...bare, operation_mode: "scheduled" };
  for (const [name, expected] of Object.entries({ running: "ok", ready: "ok", disabled: "down", failed: "unmonitored", unknown: "unmonitored" })) {
    assert.equal((await runProbe(scheduled, { now: NOW, run_schtasks: taskStates[name] })).state, expected, `scheduled ${name}`);
  }

  const root = await tempRoot();
  const file = path.join(root, "scheduled-health.json");
  await writeFile(file, JSON.stringify({ observed_at: new Date(NOW - 7_200_000).toISOString(), status: "ok", activity_changed: false }));
  const receipt = {
    kind: "json_file", path: file, timestamp_field: "observed_at", status_field: "status",
    ok_values: ["ok"], period_seconds: 1800, grace_seconds: 600,
    scheduled_task: "Soulforge-Test", missing_is_unmonitored: true,
  };
  for (const [name, expected] of Object.entries({ running: "stale", ready: "stale", disabled: "down", failed: "unmonitored", unknown: "unmonitored" })) {
    assert.equal((await runProbe(receipt, { now: NOW, run_schtasks: taskStates[name] })).state, expected, `receipt ${name}`);
  }
});

test("provider evidence absence stays catalog-only and never becomes green", async () => {
  const root = await tempRoot();
  const snapshot = await composeTopologyHealth(baseBinding(path.join(root, "state")), {
    now: NOW,
    run_schtasks: async () => "실행",
  });

  assert.equal(Object.hasOwn(snapshot, "provider_summary"), false);
  for (const provider of ["codex", "claude", "antigravity"]) {
    const source = snapshot.nodes.find((node) => node.id === `src_${provider}`);
    assert.equal(source.provider, provider);
    assert.equal(source.health_scope, "provider");
    assert.deepEqual(source.health, {
      state: "unmonitored",
      reasons: ["provider_evidence_absent"],
      age_seconds: null,
    });
  }

  for (const provider of ["antigravity"]) {
    const collector = snapshot.nodes.find((node) => node.id === `usage_${provider}_collector`);
    assert.equal(collector.operation_mode, "on_demand");
    assert.equal(collector.health_scope, "collector");
    assert.deepEqual(collector.health, {
      state: "unmonitored",
      reasons: ["catalog_only_on_demand"],
      age_seconds: null,
    });
  }
});

test("separate producer heartbeats cannot green provider evidence", async () => {
  const root = await tempRoot();
  const healthFile = path.join(root, "usage-health.json");
  await writeFile(healthFile, JSON.stringify({
    observed_at: new Date(NOW - 30_000).toISOString(),
    status: "ok",
  }));
  const binding = baseBinding(path.join(root, "state"), {
    usage_codex_collector: {
      kind: "json_file",
      path: healthFile,
      timestamp_field: "observed_at",
      status_field: "status",
      ok_values: ["ok"],
      period_seconds: 300,
      grace_seconds: 300,
    },
    store_usage_ledger: {
      kind: "json_file", path: healthFile, timestamp_field: "observed_at", status_field: "status",
      ok_values: ["ok"], period_seconds: 300, grace_seconds: 300,
    },
  });
  const snapshot = await composeTopologyHealth(binding, { now: NOW });
  const collector = snapshot.nodes.find((node) => node.id === "usage_codex_collector");
  const provider = snapshot.nodes.find((node) => node.id === "src_codex");
  const aggregate = snapshot.nodes.find((node) => node.id === "usage_meter");
  const ledger = snapshot.nodes.find((node) => node.id === "store_usage_ledger");

  assert.equal(collector.health_scope, "collector");
  assert.equal(collector.health.state, "ok");
  assert.deepEqual(provider.health, {
    state: "unmonitored",
    reasons: ["provider_evidence_absent"],
    age_seconds: null,
  });
  assert.equal(aggregate.health_scope, "aggregate");
  assert.deepEqual(aggregate.health, {
    state: "unmonitored",
    reasons: ["independent_evidence_absent", "probe_unbound"],
    age_seconds: null,
  });
  assert.equal(ledger.health.state, "ok");
  assert.equal(snapshot.edges.every((edge) => edge.delivery.state === "unreceipted" && edge.delivery.proves_delivery === false), true);
  // 스냅샷 간선은 정의상의 전달 근거를 함께 나른다. 보드가 근거 없는 선을 초록으로 그리지
  // 않으려면 이 필드를 받아야 한다.
  const contractEdge = snapshot.edges.find((edge) => edge.scope === "usage_meter_health_only");
  assert.deepEqual(contractEdge, {
    from: "usage_meter",
    to: "watchtower_self",
    label: "usage ledger validation health 관찰",
    flow: "control",
    scope: "usage_meter_health_only",
    receipt: null,
    unreceipted_reason: "probe_observation_only",
    delivery: {
      state: "unreceipted",
      reason: "probe_observation_only",
      proves_delivery: false,
    },
  });
  assert.equal(Object.hasOwn(contractEdge, "health"), false);
  assert.equal(Object.hasOwn(contractEdge, "state"), false);
  assert.equal(snapshot.edge_delivery.delivery_proven, 0);
  assert.equal(snapshot.edge_delivery.delivery_unproven, TOPOLOGY_EDGES.length);
  assert.equal(snapshot.summary.ok, 2);
});

test("watchtower self stays unmonitored even if a same-named binding is supplied", async () => {
  const root = await tempRoot();
  const healthFile = path.join(root, "watchtower-health.json");
  await writeFile(healthFile, JSON.stringify({
    observed_at: new Date(NOW - 30_000).toISOString(),
    status: "ok",
  }));
  const snapshot = await composeTopologyHealth(baseBinding(path.join(root, "state"), {
    watchtower_self: {
      kind: "json_file",
      path: healthFile,
      timestamp_field: "observed_at",
      status_field: "status",
      ok_values: ["ok"],
      period_seconds: 300,
      grace_seconds: 300,
    },
  }), { now: NOW });
  const self = snapshot.nodes.find((node) => node.id === "watchtower_self");
  assert.equal(self.health_scope, "self");
  assert.deepEqual(self.health, {
    state: "unmonitored",
    reasons: ["independent_evidence_absent"],
    age_seconds: null,
  });
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
  assert.deepEqual(unbound.health.reasons, ["collector_evidence_absent", "probe_unbound"]);
  const total = Object.values(snapshot.summary).reduce((sum, count) => sum + count, 0);
  assert.equal(total, TOPOLOGY_NODES.length);

  assert.equal(assertSnapshotPathFree(snapshot, binding), snapshot);
  const leaky = structuredClone(snapshot);
  leaky.nodes[0].health.reasons.push(["C:", "Soulforge", "secret"].join("\\"));
  assert.throws(
    () => assertSnapshotPathFree(leaky, binding),
    (error) => error instanceof WatchtowerError && error.code === "snapshot_path_leak",
  );
  const posixLeaky = structuredClone(snapshot);
  posixLeaky.nodes[0].health.reasons.push(["", "Users", "owner", "private", "source.json"].join("/"));
  assert.throws(
    () => assertSnapshotPathFree(posixLeaky, binding),
    (error) => error instanceof WatchtowerError && error.code === "snapshot_path_leak",
  );
  const rawFieldLeaky = structuredClone(snapshot);
  rawFieldLeaky.nodes[0].prompt = "must not be projected";
  assert.throws(
    () => assertSnapshotPathFree(rawFieldLeaky, binding),
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

// 간선 전달 근거 — 노드가 살아 있다는 것과 그 선이 데이터를 옮겼다는 것은 다른 주장이다.

test("every edge declares delivery evidence or an explicit reason for having none", () => {
  validateTopologyDefinition();
  for (const edge of TOPOLOGY_EDGES) {
    const where = `${edge.from}>${edge.to}`;
    assert.ok(Object.hasOwn(edge, "receipt"), `${where} declares no receipt field`);
    if (edge.receipt === null) {
      assert.ok(
        ["receipt_channel_absent", "probe_observation_only", "structural_only"].includes(edge.unreceipted_reason),
        `${where} has no valid unreceipted_reason`,
      );
    }
  }
});

test("edge definition rejects a missing receipt field, a bad reason, and a receipt with a reason", () => {
  const base = TOPOLOGY_EDGES.filter((edge) => !(edge.from === "src_hiworks" && edge.to === "ingress_supervisor"));
  const withFirst = (over) => [...base, { from: "src_hiworks", to: "ingress_supervisor", label: "POP3 수집", flow: "data", ...over }];

  assert.throws(
    () => validateTopologyDefinition({ edges: withFirst({}) }),
    (error) => error?.code === "topology_edge_receipt_absent",
  );
  assert.throws(
    () => validateTopologyDefinition({ edges: withFirst({ receipt: null, unreceipted_reason: "probably_fine" }) }),
    (error) => error?.code === "topology_edge_unreceipted_reason_invalid",
  );
  assert.throws(
    () => validateTopologyDefinition({ edges: withFirst({ receipt: "mail_delivery", unreceipted_reason: "receipt_channel_absent" }) }),
    (error) => error?.code === "topology_edge_receipt_reason_conflict",
  );
  // 근거로 probe 를 내세우려면 그 노드에 probe 가 있어야 한다.
  const noProbe = TOPOLOGY_EDGES
    .filter((edge) => !(edge.from === "usage_meter" && edge.to === "watchtower_self"))
    .concat({
      from: "usage_antigravity_collector", to: "watchtower_self", label: "unavailable collector health",
      flow: "control", scope: "usage_collector_health_only",
      receipt: null, unreceipted_reason: "probe_observation_only",
    });
  assert.throws(
    () => validateTopologyDefinition({ edges: noProbe }),
    (error) => error?.code === "topology_edge_scope_subject_invalid",
  );
  // 유효한 영수증 키는 통과한다.
  assert.doesNotThrow(() => validateTopologyDefinition({ edges: withFirst({ receipt: "mail_delivery" }) }));
});

test("delivery verdict applies the same period and grace window as a node probe", () => {
  const windows = { mail_delivery: { period_seconds: 600, grace_seconds: 300 } };
  const edge = { from: "a", to: "b", label: "x", flow: "data", receipt: "mail_delivery" };
  const delivered = (ageSeconds) => ({
    receipts: { mail_delivery: { outcome: "delivered", observed_at_ms: NOW - ageSeconds * 1000 } },
    windows, now: NOW,
  });

  assert.equal(edgeDeliveryVerdict(edge, delivered(0)).state, "delivering");
  assert.equal(edgeDeliveryVerdict(edge, delivered(600)).state, "delivering");
  assert.equal(edgeDeliveryVerdict(edge, delivered(601)).state, "late");
  assert.equal(edgeDeliveryVerdict(edge, delivered(900)).state, "late");

  // 윈도를 벗어난 영수증은 과거의 전달만 증명한다. 이 규칙이 없으면 한 번 성공한 선이 영원히
  // 초록으로 남는다.
  const stale = edgeDeliveryVerdict(edge, delivered(901));
  assert.equal(stale.state, "stale");
  assert.equal(stale.proves_delivery, false);
  const threeWeeks = edgeDeliveryVerdict(edge, delivered(21 * 86400));
  assert.equal(threeWeeks.state, "stale");
  assert.equal(threeWeeks.proves_delivery, false);

  // 등록됐지만 한 번도 전달되지 않은 상태는 미등록과 구별된다.
  assert.equal(edgeDeliveryVerdict(edge, { receipts: {}, windows, now: NOW }).state, "registered_no_delivery");
  assert.equal(
    edgeDeliveryVerdict(edge, {
      receipts: { mail_delivery: { outcome: "failed", failure_code: "auth_failed" } }, windows, now: NOW,
    }).state,
    "failed",
  );
  assert.throws(() => edgeDeliveryVerdict(edge, { receipts: {}, windows: {}, now: NOW }),
    (error) => error?.code === "edge_delivery_window_absent");
});

test("delivery verdict ignores node health entirely", () => {
  // 규칙을 행동으로 검사한다: 노드 상태를 옵션에 밀어넣어도 판정이 달라지지 않아야 한다.
  const windows = { d: { period_seconds: 600, grace_seconds: 300 } };
  const edge = { from: "a", to: "b", label: "x", flow: "data", receipt: "d" };
  const plain = edgeDeliveryVerdict(edge, { receipts: {}, windows, now: NOW });
  const withNodeHealth = edgeDeliveryVerdict(edge, {
    receipts: {}, windows, now: NOW,
    nodeHealth: "ok", fromHealth: "ok", toHealth: "ok", health: { state: "ok" },
  });
  assert.deepEqual(withNodeHealth, plain);
  assert.equal(plain.state, "registered_no_delivery");

  const unreceipted = edgeDeliveryVerdict(
    { from: "a", to: "b", label: "x", flow: "control", receipt: null, unreceipted_reason: "probe_observation_only" },
    { receipts: {}, windows: {}, now: NOW },
  );
  assert.equal(unreceipted.state, "unreceipted");
  assert.equal(unreceipted.proves_delivery, false);
  assert.equal(unreceipted.reason, "probe_observation_only");
});

test("the current definition claims no proven delivery, because no receipt channel exists yet", () => {
  const summary = summariseEdgeDelivery(TOPOLOGY_EDGES, { receipts: {}, windows: {}, now: NOW });
  assert.equal(summary.total, TOPOLOGY_EDGES.length);
  assert.equal(summary.delivery_proven, 0);
  assert.equal(summary.delivery_unproven, TOPOLOGY_EDGES.length);
  assert.equal(summary.counts.unreceipted, TOPOLOGY_EDGES.length);
  assert.match(summary.claim, /전달이 증명된 것은 없습니다/);
  for (const state of EDGE_DELIVERY_STATES) assert.ok(Object.hasOwn(summary.counts, state));
});

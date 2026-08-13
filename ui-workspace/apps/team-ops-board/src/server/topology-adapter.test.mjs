import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createTopologyAdapter,
  readBoundTopologySnapshot,
  validateTopologyHealthSnapshot,
  runWatchtowerProbe,
} from "./topology-adapter.mjs";

const NOW = Date.parse("2026-08-08T06:00:00.000Z");

function tracking(nodeId, reasonCode, {
  evidenceOwner = "declared_node_owner",
  lastCheckedAt = "2026-08-08T06:00:00.000Z",
  nextCheckAt = "2026-08-08T06:05:00.000Z",
  nextEvidenceDueAt = null,
  repairability = "not_available",
  verificationState = "evidence_absent",
  escalationOwner = "node_owner",
} = {}) {
  return {
    node_id: nodeId,
    reason_code: reasonCode,
    evidence_owner: evidenceOwner,
    last_checked_at: lastCheckedAt,
    next_check_at: nextCheckAt,
    next_evidence_due_at: nextEvidenceDueAt,
    repairability,
    repair_action: null,
    verification_state: verificationState,
    escalation_owner: escalationOwner,
  };
}

function providerNode(id, provider, state = "unmonitored", reasons = ["provider_evidence_absent"], ageSeconds = null) {
  return {
    id,
    label: `${provider} source`,
    kind: "external",
    group: "외부 소스",
    col: 0,
    row: provider === "codex" ? 0 : provider === "claude" ? 1 : 2,
    operation_mode: "structural",
    provider,
    health_scope: "provider",
    health: { state, reasons, age_seconds: ageSeconds },
    tracking: tracking(id, reasons[0], {
      evidenceOwner: `${provider}_provider_owner`,
      escalationOwner: `${provider}_provider_owner`,
    }),
  };
}

function sampleSnapshot() {
  return {
    schema_version: "soulforge.watchtower.topology_health.v2",
    observed_at: "2026-08-08T06:00:00.000Z",
    summary: { ok: 1, degraded: 0, stale: 0, down: 0, unmonitored: 7 },
    edge_delivery: {
      counts: { delivering: 0, late: 0, stale: 0, failed: 0, registered_no_delivery: 0, unreceipted: 4 },
      total: 4,
      delivery_proven: 0,
      delivery_unproven: 4,
      claim: "표시된 간선 중 현재 전달이 증명된 것은 없습니다",
    },
    nodes: [
      providerNode("src_codex", "codex"),
      providerNode("src_claude", "claude"),
      providerNode("src_antigravity", "antigravity"),
      {
        id: "usage_codex_collector",
        label: "Codex collector",
        kind: "worker",
        group: "AI 사용량 수집",
        col: 1,
        row: 0,
        operation_mode: "on_demand",
        provider: "codex",
        health_scope: "collector",
        health: { state: "ok", reasons: [], age_seconds: 30 },
      },
      {
        id: "usage_meter",
        label: "Common usage meter",
        kind: "worker",
        group: "관측",
        col: 2,
        row: 0,
        operation_mode: "on_demand",
        health_scope: "aggregate",
        health: { state: "unmonitored", reasons: ["independent_evidence_absent"], age_seconds: null },
        tracking: tracking("usage_meter", "independent_evidence_absent"),
      },
      {
        id: "watchtower_self",
        label: "Watchtower",
        kind: "gate",
        group: "관측",
        col: 3,
        row: 0,
        operation_mode: "scheduled",
        health_scope: "self",
        health: { state: "unmonitored", reasons: ["independent_evidence_absent"], age_seconds: null },
        tracking: tracking("watchtower_self", "independent_evidence_absent", {
          evidenceOwner: "independent_watchdog",
          escalationOwner: "watchtower_owner",
        }),
      },
      {
        id: "gate_five_field",
        label: "five-field validation",
        kind: "gate",
        group: "게이트",
        col: 2,
        row: 1,
        operation_mode: "scheduled",
        health_scope: "node",
        health: { state: "unmonitored", reasons: ["independent_evidence_absent"], age_seconds: null },
        tracking: tracking("gate_five_field", "event_validation_receipt_absent", {
          evidenceOwner: "five_field_event_validator",
          escalationOwner: "five_field_owner",
        }),
      },
      {
        id: "store_workmeta",
        label: "workmeta ledger",
        kind: "store",
        group: "데이터 평면",
        col: 2,
        row: 2,
        operation_mode: "structural",
        health_scope: "node",
        health: { state: "unmonitored", reasons: ["independent_evidence_absent"], age_seconds: null },
        tracking: tracking("store_workmeta", "owner_bounded_validation_receipt_absent", {
          evidenceOwner: "workmeta_owner_bounded_validator",
          escalationOwner: "workmeta_owner",
        }),
      },
    ],
    edges: [
      { from: "src_codex", to: "usage_codex_collector", label: "catalog relation", flow: "data" },
      { from: "usage_codex_collector", to: "usage_meter", label: "aggregate output", flow: "data" },
      { from: "usage_codex_collector", to: "watchtower_self", label: "collector health", flow: "control", scope: "usage_collector_health_only" },
      { from: "usage_meter", to: "watchtower_self", label: "contract structure", flow: "control", scope: "usage_contract_structure_only" },
    ].map((edge) => ({
      ...edge,
      receipt: null,
      unreceipted_reason: edge.scope ? "structural_only" : "receipt_channel_absent",
      delivery: {
        state: "unreceipted",
        reason: edge.scope ? "structural_only" : "receipt_channel_absent",
        proves_delivery: false,
      },
    })),
  };
}

function expectInvalid(mutator, code) {
  const snapshot = structuredClone(sampleSnapshot());
  mutator(snapshot);
  assert.throws(
    () => validateTopologyHealthSnapshot(snapshot, { now: NOW }),
    (error) => error instanceof Error && error.message === code,
  );
}

test("strict validation keeps provider sources and aggregate unmonitored while Codex collector is observed", () => {
  const snapshot = sampleSnapshot();
  assert.equal(validateTopologyHealthSnapshot(snapshot, { now: NOW }), snapshot);
  assert.deepEqual(snapshot.summary, { ok: 1, degraded: 0, stale: 0, down: 0, unmonitored: 7 });
  const aggregate = snapshot.nodes.find((node) => node.id === "usage_meter");
  assert.deepEqual(
    { scope: aggregate.health_scope, state: aggregate.health.state, reasons: aggregate.health.reasons },
    { scope: "aggregate", state: "unmonitored", reasons: ["independent_evidence_absent"] },
  );
  assert.equal(snapshot.nodes.find((node) => node.id === "usage_codex_collector").health.state, "ok");
});

test("protected source and aggregate nodes reject inferred or copied observed health", () => {
  expectInvalid((snapshot) => {
    snapshot.nodes.find((node) => node.id === "src_codex").health = { state: "ok", reasons: [], age_seconds: 1 };
  }, "topology_snapshot_protected_node_invalid");
  expectInvalid((snapshot) => {
    snapshot.nodes.find((node) => node.id === "src_claude").health = {
      state: "stale", reasons: ["heartbeat_stale"], age_seconds: 7200,
    };
  }, "topology_snapshot_protected_node_invalid");
  expectInvalid((snapshot) => {
    snapshot.nodes.find((node) => node.id === "usage_meter").health = { state: "ok", reasons: [], age_seconds: 0 };
  }, "topology_snapshot_protected_node_invalid");
});

test("protected nodes require exact metadata and exact absence reasons", () => {
  expectInvalid((snapshot) => {
    delete snapshot.nodes.find((node) => node.id === "src_codex").operation_mode;
  }, "topology_snapshot_protected_node_invalid");
  expectInvalid((snapshot) => {
    delete snapshot.nodes.find((node) => node.id === "src_claude").provider;
  }, "topology_snapshot_protected_node_invalid");
  expectInvalid((snapshot) => {
    delete snapshot.nodes.find((node) => node.id === "usage_meter").health_scope;
  }, "topology_snapshot_protected_node_invalid");
  expectInvalid((snapshot) => {
    delete snapshot.nodes.find((node) => node.id === "watchtower_self").health_scope;
  }, "topology_snapshot_protected_node_invalid");
  expectInvalid((snapshot) => {
    snapshot.nodes.find((node) => node.id === "src_antigravity").health.reasons.push("probe_unbound");
  }, "topology_snapshot_protected_node_invalid");
  expectInvalid((snapshot) => {
    snapshot.nodes.find((node) => node.id === "usage_meter").health.reasons = ["structural_only"];
  }, "topology_snapshot_protected_node_invalid");
  expectInvalid((snapshot) => {
    snapshot.nodes = snapshot.nodes.filter((node) => node.id !== "src_claude");
  }, "topology_snapshot_protected_node_missing");
});

test("health and structural observation scopes remain bound to their exact subjects", () => {
  expectInvalid((snapshot) => {
    delete snapshot.edges.find((edge) => edge.scope === "usage_collector_health_only").scope;
  }, "topology_snapshot_edge_scope_invalid");
  expectInvalid((snapshot) => {
    snapshot.edges.find((edge) => edge.scope === "usage_collector_health_only").from = "usage_meter";
  }, "topology_snapshot_edge_scope_invalid");
  expectInvalid((snapshot) => {
    snapshot.edges.find((edge) => edge.scope === "usage_contract_structure_only").from = "usage_codex_collector";
  }, "topology_snapshot_edge_scope_invalid");
});

test("invalid or future observed_at fails closed", () => {
  expectInvalid((snapshot) => { snapshot.observed_at = "not-a-timestamp"; }, "topology_snapshot_observed_at_invalid");
  expectInvalid((snapshot) => { snapshot.observed_at = "2026-08-08T06:00:00.001Z"; }, "topology_snapshot_observed_at_invalid");
});

test("duplicate and dangling nodes or edges fail closed", () => {
  expectInvalid((snapshot) => { snapshot.nodes.push({ ...snapshot.nodes[0], health: { ...snapshot.nodes[0].health } }); }, "topology_snapshot_node_duplicate");
  expectInvalid((snapshot) => { snapshot.edges[0].to = "missing_node"; }, "topology_snapshot_edge_dangling");
  expectInvalid((snapshot) => { snapshot.edges.push({ ...snapshot.edges[0], label: "label variation" }); }, "topology_snapshot_edge_duplicate");
});

test("unsupported node kind or edge flow fails closed", () => {
  expectInvalid((snapshot) => { snapshot.nodes[0].kind = "provider"; }, "topology_snapshot_node_invalid");
  expectInvalid((snapshot) => { snapshot.edges[0].flow = "inferred"; }, "topology_snapshot_edge_invalid");
  expectInvalid((snapshot) => { snapshot.edges[0].to = "src_claude"; }, "topology_snapshot_edge_kind_flow_invalid");
});

test("summary mismatch fails closed", () => {
  expectInvalid((snapshot) => { snapshot.summary.ok = 0; }, "topology_snapshot_summary_mismatch");
});

test("non-green tracking validates exact fields, enums, timestamps, and reason support", () => {
  expectInvalid((snapshot) => {
    snapshot.nodes.find((node) => node.id === "src_codex").tracking.last_checked_at = null;
  }, "topology_snapshot_tracking_state_invalid");
  expectInvalid((snapshot) => {
    snapshot.nodes.find((node) => node.id === "src_codex").tracking.next_check_at = null;
  }, "topology_snapshot_tracking_state_invalid");
  expectInvalid((snapshot) => {
    delete snapshot.nodes.find((node) => node.id === "src_codex").tracking.next_check_at;
  }, "topology_snapshot_tracking_invalid");
  expectInvalid((snapshot) => {
    delete snapshot.nodes.find((node) => node.id === "src_codex").tracking.next_evidence_due_at;
  }, "topology_snapshot_tracking_invalid");
  expectInvalid((snapshot) => {
    snapshot.nodes.find((node) => node.id === "src_codex").tracking.node_id = "src_claude";
  }, "topology_snapshot_tracking_invalid");
  expectInvalid((snapshot) => {
    snapshot.nodes.find((node) => node.id === "src_codex").tracking.repairability = "maybe";
  }, "topology_snapshot_tracking_invalid");
  expectInvalid((snapshot) => {
    snapshot.nodes.find((node) => node.id === "src_codex").tracking.repair_action = "restart_task";
  }, "topology_snapshot_tracking_invalid");
  expectInvalid((snapshot) => {
    snapshot.nodes.find((node) => node.id === "src_codex").tracking.next_check_at = "2026-08-08T05:59:59.000Z";
  }, "topology_snapshot_tracking_state_invalid");
  expectInvalid((snapshot) => {
    snapshot.nodes.find((node) => node.id === "src_codex").tracking.reason_code = "source_missing";
  }, "topology_snapshot_tracking_reason_invalid");
  expectInvalid((snapshot) => {
    snapshot.nodes.find((node) => node.id === "usage_codex_collector").tracking = tracking(
      "usage_codex_collector", "health_ok",
    );
  }, "topology_snapshot_tracking_unexpected");
});

test("self, five-field, and workmeta tracking boundaries stay evidence-owned and non-green", () => {
  const snapshot = sampleSnapshot();
  const self = snapshot.nodes.find((node) => node.id === "watchtower_self");
  const fiveField = snapshot.nodes.find((node) => node.id === "gate_five_field");
  const workmeta = snapshot.nodes.find((node) => node.id === "store_workmeta");
  assert.equal(validateTopologyHealthSnapshot(snapshot, { now: NOW }), snapshot);
  assert.deepEqual(
    [self.health.state, self.tracking.reason_code, self.tracking.evidence_owner],
    ["unmonitored", "independent_evidence_absent", "independent_watchdog"],
  );
  assert.deepEqual(
    [fiveField.tracking.evidence_owner, fiveField.tracking.next_evidence_due_at],
    ["five_field_event_validator", null],
  );
  assert.deepEqual(
    [workmeta.tracking.evidence_owner, workmeta.tracking.next_evidence_due_at],
    ["workmeta_owner_bounded_validator", null],
  );
  expectInvalid((candidate) => {
    candidate.nodes.find((node) => node.id === "gate_five_field").tracking.evidence_owner = "watchtower_probe";
  }, "topology_snapshot_protected_node_invalid");
  expectInvalid((candidate) => {
    candidate.nodes.find((node) => node.id === "store_workmeta").tracking.repairability = "automatic";
  }, "topology_snapshot_protected_node_invalid");
});

test("healthy self, five-field, and workmeta nodes omit non-green tracking", () => {
  const snapshot = sampleSnapshot();
  for (const id of ["watchtower_self", "gate_five_field", "store_workmeta"]) {
    const node = snapshot.nodes.find((candidate) => candidate.id === id);
    node.health = { state: "ok", reasons: [], age_seconds: 5 };
    delete node.tracking;
  }
  snapshot.summary = { ok: 4, degraded: 0, stale: 0, down: 0, unmonitored: 4 };
  assert.equal(validateTopologyHealthSnapshot(snapshot, { now: NOW }), snapshot);
});

test("privacy, raw, secret, and path sentinels fail closed", () => {
  expectInvalid((snapshot) => { snapshot.raw_payload = "hidden"; }, "topology_snapshot_privacy_sentinel");
  expectInvalid((snapshot) => { snapshot.nodes[0].health.reasons = ["token=not-public"]; }, "topology_snapshot_privacy_sentinel");
  expectInvalid((snapshot) => {
    snapshot.nodes[0].health.reasons = [["C:", "private", "binding.json"].join("\\")];
  }, "topology_snapshot_privacy_sentinel");
  expectInvalid((snapshot) => {
    snapshot.nodes[0].tracking.raw_ref = "private/provider/receipt";
  }, "topology_snapshot_privacy_sentinel");
});

test("read-only pilot reads a strict existing snapshot without Watchtower probes", async () => {
  let bindingReads = 0;
  let probeCalls = 0;
  let snapshotReads = 0;
  const adapter = createTopologyAdapter({
    readOnlyPilot: true,
    now: () => NOW,
    resolveBinding: async () => {
      bindingReads += 1;
      return "configured";
    },
    runProbe: async () => {
      probeCalls += 1;
      return sampleSnapshot();
    },
    readSnapshot: async ({ resolveBinding }) => {
      snapshotReads += 1;
      await resolveBinding();
      return sampleSnapshot();
    },
  });

  for (const force of [false, true]) {
    const projection = await adapter.readProjection({ force });
    assert.equal(projection.refresh_state, "stale");
    assert.equal(projection.snapshot.schema_version, "soulforge.watchtower.topology_health.v2");
    assert.equal(projection.refresh_metadata.reason, "snapshot_only");
    assert.equal(projection.refresh_metadata.snapshot_age_seconds, 0);
  }
  assert.equal(bindingReads, 2);
  assert.equal(snapshotReads, 2);
  assert.equal(probeCalls, 0);
});

test("bound snapshot reader follows the canonical pointer and state-root snapshot contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "board-topology-"));
  try {
    const stateRoot = join(root, "state");
    const bindingPath = join(root, "binding.json");
    const pointerPath = join(root, "pointer.json");
    await mkdir(join(stateRoot, "snapshot"), { recursive: true });
    await writeFile(bindingPath, JSON.stringify({ state_root: stateRoot }), "utf8");
    await writeFile(pointerPath, JSON.stringify({ binding_path: bindingPath }), "utf8");
    await writeFile(
      join(stateRoot, "snapshot", "topology_health.v2.json"),
      JSON.stringify(sampleSnapshot()),
      "utf8",
    );
    const snapshot = await readBoundTopologySnapshot({ pointerPath, now: () => NOW });
    assert.equal(snapshot.schema_version, "soulforge.watchtower.topology_health.v2");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("read-only pilot missing or invalid first snapshot fails closed as unconfigured", async () => {
  for (const failure of [new Error("missing"), { schema_version: "invalid" }]) {
    let probes = 0;
    const adapter = createTopologyAdapter({
      readOnlyPilot: true,
      now: () => NOW,
      readSnapshot: async () => {
        if (failure instanceof Error) throw failure;
        return validateTopologyHealthSnapshot(failure, { now: NOW });
      },
      runProbe: async () => { probes += 1; return sampleSnapshot(); },
    });
    const projection = await adapter.readProjection({ force: true });
    assert.equal(projection.refresh_state, "unconfigured");
    assert.equal(projection.snapshot, null);
    assert.equal(projection.refresh_metadata.reason, "snapshot_unavailable");
    assert.equal(probes, 0);
  }
});

test("read-only pilot failed reread retains last-good only as stale HOLD evidence", async () => {
  let clock = NOW;
  let reads = 0;
  let probes = 0;
  const adapter = createTopologyAdapter({
    readOnlyPilot: true,
    now: () => clock,
    readSnapshot: async () => {
      reads += 1;
      if (reads > 1) throw new Error("snapshot unavailable");
      return sampleSnapshot();
    },
    runProbe: async () => { probes += 1; return sampleSnapshot(); },
  });
  const first = await adapter.readProjection();
  clock += 5_000;
  const retained = await adapter.readProjection({ force: true });
  assert.equal(first.refresh_state, "stale");
  assert.equal(retained.refresh_state, "stale");
  assert.equal(retained.snapshot, first.snapshot);
  assert.deepEqual(retained.refresh_metadata, {
    last_success_age_seconds: 5,
    last_failure_age_seconds: 0,
    snapshot_age_seconds: 5,
    reason: "snapshot_refresh_failed",
    // reason 은 범주만 말한다. 실제로 무엇이 실패했는지는 코드가 말해야 하고, "snapshot
    // unavailable" 은 코드 형태가 아니므로 분류 불가로 표시된다.
    last_failure_code: "refresh_failed_unclassified",
  });
  assert.equal(probes, 0);
});

test("non-pilot behavior still resolves binding and runs the probe", async () => {
  let bindingReads = 0;
  let probeCalls = 0;
  let snapshotReads = 0;
  const adapter = createTopologyAdapter({
    now: () => NOW,
    resolveBinding: async () => { bindingReads += 1; return "configured"; },
    runProbe: async () => { probeCalls += 1; return sampleSnapshot(); },
    readSnapshot: async () => { snapshotReads += 1; return sampleSnapshot(); },
  });
  assert.equal((await adapter.readProjection()).refresh_state, "ready");
  assert.equal(bindingReads, 1);
  assert.equal(probeCalls, 1);
  assert.equal(snapshotReads, 0);
});

test("failed refresh retains lastGood only as stale with public-safe success and failure ages", async () => {
  let clock = NOW;
  let calls = 0;
  let rejectRefresh;
  const adapter = createTopologyAdapter({
    now: () => clock,
    resolveBinding: async () => "configured",
    runProbe: async () => {
      calls += 1;
      if (calls === 1) return sampleSnapshot();
      return new Promise((_resolve, reject) => { rejectRefresh = reject; });
    },
    limits: { debounceMs: 60_000 },
  });

  const ready = await adapter.readProjection();
  assert.equal(ready.refresh_state, "ready");
  assert.deepEqual(ready.refresh_metadata, {
    last_success_age_seconds: 0,
    last_failure_age_seconds: null,
    last_failure_code: null,
  });

  clock += 30_000;
  const refreshing = await adapter.readProjection({ force: true });
  assert.equal(refreshing.refresh_state, "refreshing");
  rejectRefresh(new Error("synthetic failure"));
  await new Promise((resolve) => setImmediate(resolve));

  const stale = await adapter.readProjection();
  assert.equal(stale.refresh_state, "stale");
  assert.equal(stale.snapshot, ready.snapshot);
  assert.deepEqual(stale.refresh_metadata, {
    last_success_age_seconds: 30,
    last_failure_age_seconds: 0,
    // "synthetic failure" 는 코드 형태가 아니므로 원문 대신 분류 불가 코드가 나온다.
    last_failure_code: "refresh_failed_unclassified",
  });

  clock += 5_000;
  const aged = await adapter.readProjection();
  assert.equal(aged.refresh_state, "stale");
  assert.deepEqual(aged.refresh_metadata, {
    last_success_age_seconds: 35,
    last_failure_age_seconds: 5,
    last_failure_code: "refresh_failed_unclassified",
  });
});

test("failed first refresh is hold without a retained snapshot", async () => {
  const adapter = createTopologyAdapter({
    now: () => NOW,
    resolveBinding: async () => "configured",
    runProbe: async () => { throw new Error("synthetic failure"); },
  });
  const projection = await adapter.readProjection();
  assert.equal(projection.refresh_state, "hold");
  assert.equal(projection.snapshot, null);
  assert.deepEqual(projection.refresh_metadata, {
    last_success_age_seconds: null,
    last_failure_age_seconds: 0,
    last_failure_code: "refresh_failed_unclassified",
  });
});

test("binding resolution failure after success retains lastGood as stale", async () => {
  let clock = NOW;
  let bindingAvailable = true;
  const adapter = createTopologyAdapter({
    now: () => clock,
    resolveBinding: async () => {
      if (!bindingAvailable) throw new Error("pointer unavailable");
      return "configured";
    },
    runProbe: async () => sampleSnapshot(),
  });
  const ready = await adapter.readProjection();
  bindingAvailable = false;
  clock += 10_000;
  const stale = await adapter.readProjection();
  assert.equal(stale.refresh_state, "stale");
  assert.equal(stale.snapshot, ready.snapshot);
  assert.deepEqual(stale.refresh_metadata, {
    last_success_age_seconds: 10,
    last_failure_age_seconds: 0,
    // pointer 해석 실패는 probe 실패와 조치가 다르므로 코드도 달라야 한다.
    last_failure_code: "binding_unresolved",
  });
});

test("a later success at the same timestamp authoritatively clears stale refresh state", async () => {
  let calls = 0;
  const adapter = createTopologyAdapter({
    now: () => NOW,
    resolveBinding: async () => "configured",
    runProbe: async () => {
      calls += 1;
      if (calls === 2) throw new Error("synthetic failure");
      return sampleSnapshot();
    },
    limits: { debounceMs: 60_000 },
  });
  assert.equal((await adapter.readProjection()).refresh_state, "ready");
  await adapter.readProjection({ force: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await adapter.readProjection()).refresh_state, "stale");
  await adapter.readProjection({ force: true });
  await new Promise((resolve) => setImmediate(resolve));
  const recovered = await adapter.readProjection();
  assert.equal(recovered.refresh_state, "ready");
  assert.deepEqual(recovered.refresh_metadata, {
    last_success_age_seconds: 0,
    last_failure_age_seconds: 0,
    // 복구되면 사유가 지워져야 한다. 남아 있으면 화면이 이미 해결된 문제를 계속 보고한다.
    last_failure_code: null,
  });
});

test("the board probes read-only and never writes the shared runtime snapshot", async () => {
  // 보드는 읽기 표면이다. stdout 만 쓰므로 CLI 가 공유 스냅샷을 덮어쓸 이유가 없고, 덮어쓰면
  // 새로고침 한 번이 다른 체크아웃이 서빙 중인 상태를 바꿀 수 있다. 이 단정이 없으면 플래그가
  // 조용히 사라져도 아무 것도 빨개지지 않는다.
  let capturedArgs = null;
  const fakeChild = {
    stdout: { on() {} },
    once(event, handler) { if (event === "exit") setImmediate(() => handler(1)); },
    kill() {},
  };
  await runWatchtowerProbe({
    bindingPath: "configured",
    spawnImpl: (_exe, args) => { capturedArgs = args; return fakeChild; },
  }).catch(() => {});

  assert.ok(capturedArgs !== null, "spawn was not attempted");
  assert.ok(capturedArgs.includes("--no-write"), `probe must be read-only, got ${JSON.stringify(capturedArgs)}`);
  assert.ok(capturedArgs.includes("--json"));
  assert.equal(capturedArgs.indexOf("probe"), 1);
});

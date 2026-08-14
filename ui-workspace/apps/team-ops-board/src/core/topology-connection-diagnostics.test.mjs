import test from "node:test";
import assert from "node:assert/strict";

import {
  TOPOLOGY_CONNECTION_DIAGNOSTIC_SCHEMA,
  TOPOLOGY_DIAGNOSTIC_ACCOUNT_STATES,
  TOPOLOGY_DIAGNOSTIC_LOCAL_STATES,
  TOPOLOGY_DIAGNOSTIC_NODE_IDS,
  TOPOLOGY_DIAGNOSTIC_OBSERVATION_STATES,
  buildTopologyConnectionDiagnostic,
  isTopologyDiagnosticNode,
} from "./topology-connection-diagnostics.mjs";
import { buildTopologyViewModel } from "./topology-view.mjs";

const NOW_MS = Date.parse("2026-08-14T09:00:00.000Z");
const OBSERVED_AT = "2026-08-14T08:59:30.000Z";

const UNMONITORED = Object.freeze([
  ["src_hiworks", "외부 소스", "external", "node", "structural_only"],
  ["src_plaud", "외부 소스", "external", "node", "structural_only"],
  ["src_slack", "외부 소스", "external", "node", "structural_only"],
  ["src_onedrive", "외부 소스", "external", "node", "structural_only"],
  ["src_codex", "AI 공급자 소스", "external", "provider", "provider_evidence_absent"],
  ["src_claude", "AI 공급자 소스", "external", "provider", "provider_evidence_absent"],
  ["src_antigravity", "AI 공급자 소스", "external", "provider", "provider_evidence_absent"],
  ["src_gmail", "후처리", "consumer", "node", "structural_only"],
  ["consumer_timeline", "소비", "consumer", "node", "structural_only"],
]);

const COLLECTORS = Object.freeze([
  "ingress_supervisor", "mail_forwarder", "slack_batch", "local_activity",
  "usage_codex_collector", "usage_claude_collector", "usage_antigravity_collector",
]);

function healthSnapshot({ collectorState = "ok", overrides = {} } = {}) {
  const nodes = [
    ...UNMONITORED.map(([id, group, kind, healthScope, reason], index) => ({
      id,
      label: id,
      kind,
      group,
      col: 0,
      row: index,
      health_scope: healthScope,
      health: { state: "unmonitored", reasons: [reason], age_seconds: null },
    })),
    ...COLLECTORS.map((id, index) => ({
      id,
      label: id,
      kind: "worker",
      group: "수집",
      col: 1,
      row: index,
      health_scope: "node",
      health: { state: collectorState, reasons: [], age_seconds: 30 },
    })),
  ].map((node) => (overrides[node.id] === undefined
    ? node
    : { ...node, ...overrides[node.id], health: { ...node.health, ...(overrides[node.id].health ?? {}) } }));
  return { observed_at: OBSERVED_AT, nodes, edges: [] };
}

function projection(options = {}) {
  return { refresh_state: options.refreshState ?? "ready", snapshot: healthSnapshot(options) };
}

function claudeLimits({ freshness = "fresh", captureStatus = "accepted" } = {}) {
  return {
    limits: {
      claude_official: {
        capture_status: captureStatus,
        freshness,
        source_kind: "claude_code_statusline_rate_limits",
        observed_at: OBSERVED_AT,
        five_hour: {
          limit_id: "claude_five_hour",
          percentage_kind: "used_percentage",
          percentage: 12,
          window_minutes: 300,
          resets_at: "2026-08-14T12:00:00.000Z",
        },
        weekly: {
          limit_id: "claude_weekly",
          percentage_kind: "used_percentage",
          percentage: 34,
          window_minutes: 10_080,
          resets_at: "2026-08-18T12:00:00.000Z",
        },
        fable_weekly: null,
      },
    },
  };
}

function antigravityQuota(freshness = "current") {
  return {
    antigravityQuota: {
      schema_version: "soulforge.team_ops_board_antigravity_quota.v1",
      observed_at: OBSERVED_AT,
      freshness,
      source_kind: "antigravity_sanitized_loopback_receipt",
      groups: [{ label: "Gemini Models", buckets: [{ window: "weekly", remaining_fraction: 0.62, resets_at: "2026-08-18T12:00:00.000Z" }] }],
    },
  };
}

function codexLimits(observedAt = OBSERVED_AT) {
  return { limits: { codex: { primary: { used_percent: 18, window_minutes: 300, resets_at_epoch_s: 1 }, secondary: null, plan_type: "pro", observed_at: observedAt } } };
}

function diagnose(nodeId, options = {}) {
  return buildTopologyConnectionDiagnostic({
    nodeId,
    healthProjection: options.healthProjection === undefined ? projection(options) : options.healthProjection,
    providerSnapshots: options.providerSnapshots ?? null,
    nowMs: options.nowMs ?? NOW_MS,
  });
}

test("every allowlisted node returns a strict-enum diagnostic", () => {
  assert.equal(TOPOLOGY_DIAGNOSTIC_NODE_IDS.length, 9);
  for (const nodeId of TOPOLOGY_DIAGNOSTIC_NODE_IDS) {
    const result = diagnose(nodeId);
    assert.equal(result.schema_version, TOPOLOGY_CONNECTION_DIAGNOSTIC_SCHEMA, nodeId);
    assert.equal(result.available, true, nodeId);
    assert.equal(result.node_id, nodeId);
    assert.equal(typeof result.node_label, "string");
    assert.ok(TOPOLOGY_DIAGNOSTIC_ACCOUNT_STATES.includes(result.account.state), nodeId);
    assert.ok(TOPOLOGY_DIAGNOSTIC_LOCAL_STATES.includes(result.local_source.state), nodeId);
    assert.ok(TOPOLOGY_DIAGNOSTIC_OBSERVATION_STATES.includes(result.last_safe_observation.state), nodeId);
    assert.equal(result.runtime_authority, false, nodeId);
    assert.equal(result.repair_execution_authority, false, nodeId);
    assert.ok(result.evidence.limits.length > 0, nodeId);
    assert.ok(result.account.reason_label.length > 0, nodeId);
    assert.ok(result.local_source.reason_label.length > 0, nodeId);
    assert.notEqual(result.account.reason_label, "설명 없는 사유", nodeId);
    assert.notEqual(result.local_source.reason_label, "설명 없는 사유", nodeId);
  }
});

test("producer and session-file nodes never claim account connection from local evidence", () => {
  for (const nodeId of ["src_hiworks", "src_plaud", "src_slack", "src_onedrive", "src_gmail", "src_codex"]) {
    const result = diagnose(nodeId, { providerSnapshots: { ...codexLimits(), ...antigravityQuota() } });
    assert.equal(result.account.state, "unverifiable", nodeId);
    assert.ok(
      ["producer_evidence_local_only", "local_source_only_not_login_proof"].includes(result.account.reason_code),
      `${nodeId} ${result.account.reason_code}`,
    );
    assert.equal(result.local_source.state, "ok", nodeId);
  }
});

test("healthy collectors report local source ok while node health stays unmonitored", () => {
  const result = diagnose("src_hiworks");
  assert.equal(result.local_source.state, "ok");
  assert.equal(result.local_source.reason_code, "collector_health_observed");
  assert.equal(result.node_health.state, "unmonitored");
  assert.deepEqual(result.evidence.owners, ["ingress_supervisor", "mail_forwarder"]);
  assert.ok(result.evidence.limits.some((limit) => limit.includes("공급자 로그인 증명이 아닙니다")));
  assert.ok(result.evidence.limits.some((limit) => limit.includes("토폴로지 상태 색과 판정은 이 진단으로 바뀌지 않습니다")));
});

test("fresh provider quota confirms account connection without turning the node green", () => {
  const claude = diagnose("src_claude", { providerSnapshots: claudeLimits() });
  assert.equal(claude.account.state, "confirmed");
  assert.equal(claude.account.reason_code, "provider_issued_quota_observed");
  assert.equal(claude.node_health.state, "unmonitored");
  assert.equal(claude.node_health.state_label, "미감시");
  assert.ok(claude.evidence.scopes.includes("provider_issued_quota_receipt"));
  assert.ok(claude.evidence.limits.some((limit) => limit.includes("현재 순간을 보장하지 않습니다")));

  const antigravity = diagnose("src_antigravity", { providerSnapshots: antigravityQuota() });
  assert.equal(antigravity.account.state, "confirmed");
  assert.equal(antigravity.node_health.state, "unmonitored");
});

test("retained provider quota degrades to 확인 불가 instead of confirmed", () => {
  const claude = diagnose("src_claude", { providerSnapshots: claudeLimits({ freshness: "stale", captureStatus: "hold" }) });
  assert.equal(claude.account.state, "unverifiable");
  assert.equal(claude.account.reason_code, "provider_quota_retained");
  assert.equal(claude.local_source.state, "ok");
  assert.equal(claude.local_source.reason_code, "collector_health_observed");

  const antigravity = diagnose("src_antigravity", { providerSnapshots: antigravityQuota("stale") });
  assert.equal(antigravity.account.state, "unverifiable");
  assert.equal(antigravity.account.reason_code, "provider_quota_retained");
});

test("missing provider evidence separates not-loaded from absent", () => {
  const notLoaded = diagnose("src_claude");
  assert.equal(notLoaded.account.state, "unverifiable");
  assert.equal(notLoaded.account.reason_code, "provider_evidence_not_loaded");

  const absent = diagnose("src_claude", { providerSnapshots: { limits: null, antigravityQuota: null } });
  assert.equal(absent.account.state, "unverifiable");
  assert.equal(absent.account.reason_code, "provider_quota_evidence_absent");
});

test("provider quota receipts never stand in for local session or DB availability", () => {
  // 한도 영수증이 아무리 신선해도 수집기 근거가 없으면 로컬 소스는 확인 불가다.
  for (const [nodeId, snapshots] of [
    ["src_codex", codexLimits()],
    ["src_claude", claudeLimits()],
    ["src_antigravity", antigravityQuota()],
  ]) {
    const result = diagnose(nodeId, { collectorState: "unmonitored", providerSnapshots: snapshots });
    assert.equal(result.local_source.state, "unverifiable", nodeId);
    assert.equal(result.local_source.reason_code, "collector_evidence_absent", nodeId);
    assert.equal(result.evidence.scopes.includes("local_source_receipt_only"), false, nodeId);
    assert.deepEqual(result.evidence.owners, [], nodeId);
  }
});

test("codex keeps no account lane and gains nothing from its rate-limit receipt", () => {
  const result = diagnose("src_codex", { providerSnapshots: codexLimits() });
  assert.equal(result.account.state, "unverifiable");
  assert.equal(result.account.reason_code, "local_source_only_not_login_proof");
  assert.deepEqual(result.evidence.scopes, ["watchtower_local_collector_health"]);
});

test("a retained or non-ready projection can never make local source green", () => {
  for (const refreshState of ["refreshing", "stale", "hold", "unconfigured", "absent"]) {
    for (const nodeId of TOPOLOGY_DIAGNOSTIC_NODE_IDS) {
      const result = diagnose(nodeId, { refreshState });
      assert.notEqual(result.local_source.state, "ok", `${nodeId}/${refreshState}`);
    }
    const hiworks = diagnose("src_hiworks", { refreshState });
    assert.equal(hiworks.local_source.state, "attention", refreshState);
    assert.equal(hiworks.local_source.reason_code, "collector_health_retained", refreshState);
    assert.equal(hiworks.last_safe_observation.state, "retained", refreshState);
    assert.equal(hiworks.last_safe_observation.observed_at, OBSERVED_AT, refreshState);
  }
});

test("collector attention is reported even when the account lane is confirmed", () => {
  const result = diagnose("src_antigravity", {
    collectorState: "down",
    providerSnapshots: antigravityQuota(),
  });
  assert.equal(result.local_source.state, "attention");
  assert.equal(result.local_source.reason_code, "collector_health_attention");
  assert.equal(result.account.state, "confirmed");
});

test("unmonitored collectors leave local source 확인 불가", () => {
  const result = diagnose("src_slack", { collectorState: "unmonitored" });
  assert.equal(result.local_source.state, "unverifiable");
  assert.equal(result.local_source.reason_code, "collector_evidence_absent");
  assert.equal(result.last_safe_observation.state, "absent");
});

test("provider-scope down health becomes an account failure signal", () => {
  const result = diagnose("src_claude", {
    overrides: { src_claude: { health: { state: "down", reasons: ["heartbeat_stale"], age_seconds: 900 } } },
    providerSnapshots: claudeLimits(),
  });
  assert.equal(result.account.state, "failure_signal");
  assert.equal(result.account.reason_code, "provider_scope_health_failure");
  assert.equal(result.node_health.state, "down");
});

test("structural node down health does not become an account failure signal", () => {
  const result = diagnose("src_hiworks", {
    overrides: { src_hiworks: { health: { state: "down", reasons: ["heartbeat_stale"], age_seconds: 900 } } },
  });
  assert.equal(result.account.state, "unverifiable");
  assert.equal(result.account.reason_code, "producer_evidence_local_only");
});

test("timeline consumer has no account surface and no deployed receipt", () => {
  const result = diagnose("consumer_timeline");
  assert.equal(result.account.state, "not_applicable");
  assert.equal(result.account.reason_code, "account_surface_absent");
  assert.equal(result.local_source.state, "unverifiable");
  assert.equal(result.local_source.reason_code, "runtime_not_deployed");
  assert.deepEqual(result.evidence.owners, []);
  assert.deepEqual(result.evidence.scopes, []);
});

test("unavailable or non-current health projections fail closed", () => {
  for (const healthProjection of [null, undefined, {}, { refresh_state: "unconfigured", snapshot: null }, { refresh_state: "ready", snapshot: { nodes: [], edges: [] } }]) {
    const result = buildTopologyConnectionDiagnostic({ nodeId: "src_hiworks", healthProjection, nowMs: NOW_MS });
    assert.equal(result.available, true);
    assert.equal(result.account.state, "unverifiable");
    assert.equal(result.account.reason_code, "health_snapshot_unavailable");
    assert.equal(result.local_source.state, "unverifiable");
    assert.equal(result.last_safe_observation.observed_at, null);
  }
});

test("retained health observation is labelled 보존 관측 rather than current", () => {
  const result = diagnose("src_hiworks", { refreshState: "stale" });
  assert.equal(result.last_safe_observation.state, "retained");
  assert.equal(result.last_safe_observation.state_label, "보존 관측");
  assert.equal(result.last_safe_observation.observed_at, OBSERVED_AT);
  assert.equal(result.last_safe_observation.age_label, "30초 전");
});

test("unknown, malformed and unsafe node ids fail closed", () => {
  const cases = [
    null, undefined, 42, "", "SRC_CLAUDE", " src_claude", "src_claude ", "watchtower_self",
    "consumer_board", "__proto__", "constructor", "toString", "src_claude\u0000",
    { toString: () => "src_claude" }, ["src_claude"],
  ];
  for (const nodeId of cases) {
    const result = buildTopologyConnectionDiagnostic({ nodeId, healthProjection: projection() });
    assert.equal(result.available, false, String(nodeId));
    assert.equal(result.node_id, null, String(nodeId));
    assert.equal(result.node_label, null, String(nodeId));
    assert.equal(result.account.state, "unverifiable", String(nodeId));
    assert.equal(result.account.reason_code, "node_id_not_allowlisted", String(nodeId));
    assert.equal(result.local_source.state, "unverifiable", String(nodeId));
    assert.equal(result.runtime_authority, false, String(nodeId));
    assert.equal(result.repair_execution_authority, false, String(nodeId));
  }
  assert.equal(isTopologyDiagnosticNode("src_claude"), true);
  assert.equal(isTopologyDiagnosticNode("watchtower_self"), false);
  assert.equal(isTopologyDiagnosticNode(null), false);
});

test("no argument and non-finite clock inputs fail closed", () => {
  assert.equal(buildTopologyConnectionDiagnostic().available, false);
  const nanClock = buildTopologyConnectionDiagnostic({ nodeId: "src_hiworks", healthProjection: projection(), nowMs: Number.NaN });
  assert.equal(nanClock.available, false);
  assert.equal(nanClock.diagnosed_at, null);
});

test("upstream raw values never reach the diagnostic surface", () => {
  // 로컬 절대경로 리터럴을 tracked 파일에 남기지 않도록 조각에서 만든다.
  const localPathish = ["C:", "Users", "owner", "token.json"].join("\\");
  const poisoned = projection();
  poisoned.snapshot.nodes[0].label = localPathish;
  poisoned.snapshot.nodes[0].health.reasons = ["password=hunter2"];
  poisoned.snapshot.observed_at = OBSERVED_AT;
  const result = buildTopologyConnectionDiagnostic({ nodeId: "src_hiworks", healthProjection: poisoned, nowMs: NOW_MS });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("hunter2"), false);
  assert.equal(serialized.includes("token.json"), false);
  assert.equal(serialized.includes(JSON.stringify(localPathish).slice(1, -1)), false);
  assert.equal(result.node_label, "Hiworks 메일");
});

test("provider snapshots carrying unexpected keys cannot create a confirmed account", () => {
  const result = buildTopologyConnectionDiagnostic({
    nodeId: "src_claude",
    healthProjection: projection(),
    providerSnapshots: {
      limits: { claude_official: { capture_status: "accepted", freshness: "fresh", source_kind: "attacker_supplied", observed_at: OBSERVED_AT, five_hour: {}, weekly: {} } },
      access_token: "should-never-be-read",
    },
    nowMs: NOW_MS,
  });
  assert.equal(result.account.state, "unverifiable");
  assert.equal(result.account.reason_code, "provider_quota_evidence_absent");
  assert.equal(JSON.stringify(result).includes("should-never-be-read"), false);
});

test("diagnostics leave topology health totals and edges untouched", () => {
  const before = projection();
  const snapshotJson = JSON.stringify(before.snapshot);
  const beforeModel = buildTopologyViewModel(before.snapshot);
  for (const nodeId of TOPOLOGY_DIAGNOSTIC_NODE_IDS) {
    buildTopologyConnectionDiagnostic({
      nodeId,
      healthProjection: before,
      providerSnapshots: { ...claudeLimits(), ...antigravityQuota(), ...codexLimits() },
      nowMs: NOW_MS,
    });
  }
  const afterModel = buildTopologyViewModel(before.snapshot);
  assert.equal(JSON.stringify(before.snapshot), snapshotJson);
  assert.deepEqual(afterModel.summary, beforeModel.summary);
  assert.deepEqual(afterModel.summary, { ok: 7, degraded: 0, stale: 0, down: 0, unmonitored: 9 });
  assert.deepEqual(afterModel.edges, beforeModel.edges);
  assert.deepEqual(
    afterModel.nodes.map((node) => `${node.id}:${node.state}`),
    beforeModel.nodes.map((node) => `${node.id}:${node.state}`),
  );
});

test("results are frozen so a caller cannot promote a lane after the fact", () => {
  const result = diagnose("src_claude", { providerSnapshots: claudeLimits() });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.account), true);
  assert.equal(Object.isFrozen(result.evidence), true);
  assert.throws(() => {
    "use strict";
    result.account.state = "confirmed";
  }, TypeError);
});

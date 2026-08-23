/**
 * The Board view over the Agent Observation evidence.
 *
 * These tests feed the view the real projections from `guild_hall/agent_observation` rather than
 * hand-written shapes. A view tested against a fixture the view's own author invented proves the
 * two agree with each other, not that either matches the contract.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  createObservationStore,
  observeRun,
  projectDeliveryEdges,
  projectStoreCounts,
  recordDeliveryEdge,
  recordResultReceipt,
  registerAgent,
} from "../../../../../guild_hall/agent_observation/agent_observation.mjs";
import { projectBoardHealth } from "../../../../../guild_hall/agent_observation/board_health_projection.mjs";
import { projectMeterLineage } from "../../../../../guild_hall/agent_observation/meter_lineage_projection.mjs";

import {
  buildAgentObservationViewModel,
  lookupObservationHoldLabel,
} from "./agent-observation-view.mjs";

const REQUESTER = "agent.view.systems-engineering.v1";
const CRAFTSMAN = "agent.view.spreadsheet.v1";
const REQUESTER_RUN = "run-view-requester-0001";
const CRAFTSMAN_RUN = "run-view-craftsman-0001";
const ARTIFACT = "artifact://view/workbook-0001";

const agentInput = (over = {}) => ({
  agent_id: REQUESTER,
  agent_kind: "project_isolated_functional",
  functional_role: "systems_engineering",
  project_id: "proj-view",
  provider_identities: [{ provider: "codex", id_kind: "thread_id", id_value: "th-view-0001" }],
  authority_scope: { allowed_projects: ["proj-view"], allowed_actions: ["read"] },
  memory_class: "cache_only",
  registered_at: "2026-08-23T00:00:00.000Z",
  ...over,
});

const runInput = (over = {}) => ({
  run_id: REQUESTER_RUN,
  parent_run_id: null,
  agent_id: REQUESTER,
  task_id: "task-view-0001",
  project_id: "proj-view",
  work_unit_id: "wu-view-0001",
  lifecycle: "running",
  provider: "codex",
  model_id: "model-view",
  reasoning_effort: "high",
  authority: "read_only",
  started_at: "2026-08-23T01:00:00.000Z",
  heartbeat_at: "2026-08-23T01:14:00.000Z",
  ended_at: null,
  result_state: "result_pending",
  side_effect_evidence_refs: [],
  ...over,
});

/** A requester, a craftsman that delivered, and the edge between them. */
function seededStore({ withEdge = true, structuralOnly = false } = {}) {
  const store = createObservationStore();
  assert.equal(registerAgent(store, agentInput()).status, "REGISTERED");
  assert.equal(registerAgent(store, agentInput({
    agent_id: CRAFTSMAN,
    agent_kind: "tool_specialist_craftsman",
    functional_role: "spreadsheet",
    provider_identities: [{ provider: "codex", id_kind: "thread_id", id_value: "th-view-0002" }],
  })).status, "REGISTERED");
  assert.equal(observeRun(store, runInput()).status, "OBSERVED");
  assert.equal(observeRun(store, runInput({
    run_id: CRAFTSMAN_RUN,
    agent_id: CRAFTSMAN,
    task_id: "task-view-0002",
    work_unit_id: "wu-view-0002",
    lifecycle: "terminal",
    started_at: "2026-08-23T01:02:00.000Z",
    heartbeat_at: "2026-08-23T01:09:00.000Z",
    ended_at: "2026-08-23T01:10:00.000Z",
    result_state: "result_observed",
    side_effect_evidence_refs: [{ ref_kind: "artifact", ref_value: ARTIFACT }],
  })).status, "OBSERVED");
  assert.equal(recordResultReceipt(store, {
    receipt_id: "rcpt-view-0001",
    run_id: CRAFTSMAN_RUN,
    agent_id: CRAFTSMAN,
    receipt_kind: "delivery",
    producer_evidence_kind: "producer_observed",
    refs: [{ ref_kind: "artifact", ref_value: ARTIFACT }],
    observed_at: "2026-08-23T01:11:00.000Z",
  }).status, "RECORDED");
  if (withEdge) {
    assert.equal(recordDeliveryEdge(store, {
      edge_id: "edge-view-0001",
      producer_run_id: CRAFTSMAN_RUN,
      producer_agent_id: CRAFTSMAN,
      consumer_run_id: REQUESTER_RUN,
      consumer_agent_id: REQUESTER,
      edge_kind: structuralOnly ? "structural" : "delivery",
      receipt_id: structuralOnly ? null : "rcpt-view-0001",
      observed_at: "2026-08-23T01:12:00.000Z",
    }).status, "RECORDED");
  }
  return store;
}

const viewFor = (store, extra = {}) => buildAgentObservationViewModel({
  storeCounts: projectStoreCounts(store),
  deliveryEdges: projectDeliveryEdges(store),
  boardHealth: projectBoardHealth(store),
  ...extra,
});

test("a caller with no projections gets four unavailable panels, not four empty ones", () => {
  // "nothing to show" and "we could not look" mean opposite things to a reader, so the view must
  // never render the second as the first.
  const model = buildAgentObservationViewModel();
  assert.equal(model.available, false);
  assert.equal(model.unavailable_panel_count, 4);
  assert.equal(model.counts, null);
  for (const panel of [model.privacy, model.delivery, model.health, model.lineage]) {
    assert.equal(panel.available, false);
    assert.equal(panel.reason, "관찰 증거 없음");
  }
});

test("a held projection is shown as that hold, not as an empty panel", () => {
  const foreign = Object.freeze({ kind: "soulforge.agent_observation.store.v1" });
  const model = buildAgentObservationViewModel({
    storeCounts: projectStoreCounts(foreign),
    deliveryEdges: projectDeliveryEdges(foreign),
    boardHealth: projectBoardHealth(foreign),
  });
  assert.equal(model.privacy.available, false);
  assert.equal(model.privacy.reason, "관찰 store를 알 수 없음 · 표시 보류");
  assert.equal(model.delivery.reason, "관찰 store를 알 수 없음 · 표시 보류");
  assert.equal(model.health.reason, "관찰 store를 알 수 없음 · 표시 보류");

  // An unrecognised code still surfaces rather than collapsing into the generic label.
  assert.equal(lookupObservationHoldLabel("SOMETHING_NEW"), "보류 · SOMETHING_NEW");
  assert.equal(lookupObservationHoldLabel(""), "관찰 증거 없음");
});

test("the real store's counts and privacy audit reach the panel", () => {
  const model = viewFor(seededStore());
  assert.equal(model.available, true);
  assert.deepEqual(model.counts, {
    agents: 2, runs: 2, usage_events: 0, receipts: 1, delivery_edges: 1,
  });

  assert.equal(model.privacy.available, true);
  assert.deepEqual(model.privacy.totals, {
    raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0,
  });
  // Three zeroes read the same whether every family was audited or none were, so the panel names
  // the families and says outright when one is missing.
  assert.deepEqual(model.privacy.families.map((entry) => entry.key),
    ["agents", "runs", "usage", "receipts", "delivery_edges"]);
  assert.deepEqual(model.privacy.unaudited_families, []);
  assert.equal(model.privacy.clean, true);
});

test("the privacy panel refuses to call itself clean when a family went unaudited", () => {
  // Simulating the store dropping a family from its own audit list: the counters stay at zero, and
  // that is exactly the case the panel must not report as clean.
  const counts = projectStoreCounts(seededStore());
  const model = buildAgentObservationViewModel({
    storeCounts: { ...counts, privacy_audited_families: ["agents", "runs", "usage", "receipts"] },
  });
  assert.equal(model.privacy.available, true);
  assert.deepEqual(model.privacy.totals, {
    raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0,
  });
  assert.equal(model.privacy.clean, false, "zero counters with a missing family is not clean");
  assert.deepEqual(model.privacy.unaudited_families, [{ key: "delivery_edges", label: "전달 간선" }]);
});

test("adjacency is never drawn as delivery", () => {
  const delivered = viewFor(seededStore()).delivery;
  assert.equal(delivered.delivery_count, 1);
  assert.equal(delivered.structural_count, 0);
  assert.equal(delivered.consumers[0].adjacent_only, false);
  // Each ref carries the producer that supplied it.
  assert.deepEqual(delivered.consumers[0].evidence, [
    { producer_agent_id: CRAFTSMAN, ref_label: `artifact:${ARTIFACT}` },
  ]);

  const structural = viewFor(seededStore({ structuralOnly: true })).delivery;
  assert.equal(structural.delivery_count, 0, "a structural edge must never raise the delivery count");
  assert.equal(structural.structural_count, 1);
  assert.deepEqual(structural.consumers[0].evidence, [], "adjacency evidences nothing");
  assert.equal(structural.consumers[0].adjacent_only, true);
});

test("the health panel speaks the Board's own closed vocabulary", () => {
  const model = viewFor(seededStore());
  assert.equal(model.health.available, true);
  // The craftsman claimed a result and has a delivery receipt, so the gate reads available; the
  // requester has no receipt but never claimed one.
  assert.equal(model.health.result_gate.value, "available");
  assert.equal(model.health.result_gate.label, "가용");
  assert.equal(model.health.binding_coverage.value, "exact");
  assert.equal(model.health.binding_coverage.label, "정확 바인딩");
  assert.ok(model.health.evidence.run_count >= 2);
});

test("the lineage panel lists only agents that actually dispatched work", () => {
  const lineage = projectMeterLineage([
    { key: "root", turns: 100, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 },
    { key: "/root/a", turns: 10, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 },
    { key: "/root/a/x", turns: 3, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 },
    { key: "Solo", turns: 7, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 },
  ]);
  const model = buildAgentObservationViewModel({ meterLineage: lineage });
  assert.equal(model.lineage.available, true);

  const keys = model.lineage.agents.map((agent) => agent.agent_key);
  assert.deepEqual(keys, ["root", "/root/a"], "a leaf and a childless root are not dispatchers");

  const rootRow = model.lineage.agents[0];
  assert.equal(rootRow.self_turns, 100);
  assert.equal(rootRow.child_direct_turns, 10);
  assert.equal(rootRow.subtree_turns, 113);
  // Only true where a grandchild exists, which is the case the three rollups exist to separate.
  assert.equal(rootRow.has_descendants_beyond_children, true);
  assert.equal(model.lineage.agents[1].has_descendants_beyond_children, false);
});

test("the lineage panel says when it truncated and when the source list was incomplete", () => {
  const rows = [{ key: "root", turns: 1000, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 }];
  for (let index = 0; index < 6; index += 1) {
    rows.push({ key: `/root/p${index}/leaf`, turns: 5, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 });
  }
  const lineage = projectMeterLineage(rows);
  const model = buildAgentObservationViewModel({ meterLineage: lineage, lineageLimit: 3 });

  assert.equal(model.lineage.truncated, true, "a cut list must say it was cut");
  assert.equal(model.lineage.agents.length, 3);
  // Six intermediate parents the source never emitted a row for.
  assert.equal(model.lineage.materialised_parent_count, 6);

  const wholeList = buildAgentObservationViewModel({ meterLineage: lineage, lineageLimit: 50 });
  assert.equal(wholeList.lineage.truncated, false);
});

test("the view declares and keeps a read-only boundary", () => {
  const model = viewFor(seededStore());
  assert.deepEqual(model.authority_boundary, {
    read_only: true,
    writes_observation_store: false,
    writes_result_gate: false,
  });
  assert.equal(model.schema_version, "soulforge.team_ops_board.agent_observation_view.v1");

  // Building the view twice from one store must not change the store.
  const store = seededStore();
  const before = projectStoreCounts(store);
  viewFor(store);
  viewFor(store);
  assert.deepEqual(projectStoreCounts(store), before);
});

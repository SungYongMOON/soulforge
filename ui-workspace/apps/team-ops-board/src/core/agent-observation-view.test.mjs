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
    delivery_target: {
      target_run_id: REQUESTER_RUN,
      target_agent_id: REQUESTER,
      target_work_unit_id: "wu-view-0001",
    },
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

  // A code this view has no label for is producer-controlled text. It is held under the fixed
  // unknown-enum label rather than interpolated, which is the same rule `closedVocabulary` already
  // applies to every other producer-supplied enum on this screen.
  assert.equal(lookupObservationHoldLabel("SOMETHING_NEW"), UNKNOWN_ENUM_LABEL);
  assert.equal(lookupObservationHoldLabel("SOMETHING_NEW").includes("SOMETHING_NEW"), false);
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

/**
 * A projection is evidence the view did not produce, so the view treats it as input rather than as
 * truth. These tests hand the builder shapes the real producer would never emit — a malformed ref
 * list, a value outside a closed vocabulary, a count that is not a count, an object that answers a
 * read with a throw — and require the same two outcomes each time: no exception escapes, and no
 * producer-controlled text reaches the model.
 */

const HOSTILE_REASON = "입력 거부됨 · 표시 보류";
const UNKNOWN_ENUM_LABEL = "알 수 없는 상태 · 표시 보류";

/** The whole model as text, so an echo anywhere in it is visible to one assertion. */
const modelText = (model) => JSON.stringify(model);

const consumerWith = (over) => {
  const edges = projectDeliveryEdges(seededStore());
  return { ...edges, consumers: [{ ...edges.consumers[0], ...over }] };
};

test("a producer_evidence_refs string is refused instead of thrown on", () => {
  // `.map` on a string throws, and a panel that crashes on malformed evidence tells a reader nothing.
  let model;
  assert.doesNotThrow(() => {
    model = buildAgentObservationViewModel({
      deliveryEdges: consumerWith({ producer_evidence_refs: ARTIFACT }),
    });
  });
  assert.equal(model.delivery.available, true);
  assert.deepEqual(model.delivery.consumers[0].evidence, []);
  assert.equal(model.delivery.consumers[0].evidence_withheld, true);
});

test("only a well-formed ref of a known kind becomes an evidence row", () => {
  const model = buildAgentObservationViewModel({
    deliveryEdges: consumerWith({
      producer_evidence_refs: [
        null,
        ARTIFACT,
        { producer_agent_id: CRAFTSMAN, ref_kind: "artifact" },
        { producer_agent_id: CRAFTSMAN, ref_kind: "raw_prompt", ref_value: ARTIFACT },
        { producer_agent_id: CRAFTSMAN, ref_kind: "artifact", ref_value: ARTIFACT },
      ],
    }),
  });
  assert.deepEqual(model.delivery.consumers[0].evidence, [
    { producer_agent_id: CRAFTSMAN, ref_label: `artifact:${ARTIFACT}` },
  ]);
  assert.equal(model.delivery.consumers[0].evidence_withheld, true, "dropped refs must be declared");
  assert.equal(modelText(model).includes("raw_prompt"), false, "an unknown ref kind is not echoed");
});

test("a local path, a secret, or a raw value in a ref never reaches the model", () => {
  // The absolute paths are assembled from fragments so the fixture stays hostile at runtime
  // without this source file itself carrying a literal local absolute path.
  const hostile = [
    `${"C:"}\\Users\\owner\\notes.txt`,
    `${"/"}${"Users"}/owner/tokens.json`,
    "sk-abcdefgh12345678",
    "Bearer abcdefgh12345678",
    "_workmeta/proj/secret.json",
  ];
  const model = buildAgentObservationViewModel({
    deliveryEdges: consumerWith({
      producer_evidence_refs: hostile.map((value) => ({
        producer_agent_id: CRAFTSMAN,
        ref_kind: "artifact",
        ref_value: value,
      })),
    }),
  });
  assert.deepEqual(model.delivery.consumers[0].evidence, []);
  assert.equal(model.delivery.consumers[0].evidence_withheld, true);
  const text = modelText(model);
  for (const value of hostile) {
    assert.equal(text.includes(value.slice(0, 8)), false, `${value} must not be echoed`);
  }
});

test("a consumer whose own identifiers are unsafe is withheld rather than rendered", () => {
  const model = buildAgentObservationViewModel({
    deliveryEdges: consumerWith({ consumer_agent_id: "sk-abcdefgh12345678" }),
  });
  assert.deepEqual(model.delivery.consumers, []);
  assert.equal(model.delivery.withheld_consumer_count, 1);
  assert.equal(modelText(model).includes("sk-abcde"), false);
});

test("a health value outside the Board's closed vocabulary is held, not echoed", () => {
  const health = projectBoardHealth(seededStore());
  const model = buildAgentObservationViewModel({
    boardHealth: {
      ...health,
      scope: { result_gate_health: "<img src=x onerror=alert(1)>", binding_coverage: "partial" },
    },
  });
  assert.equal(model.health.available, true);
  assert.equal(model.health.result_gate.value, null);
  assert.equal(model.health.result_gate.label, UNKNOWN_ENUM_LABEL);
  assert.equal(model.health.binding_coverage.value, null);
  assert.equal(model.health.binding_coverage.label, UNKNOWN_ENUM_LABEL);
  assert.equal(modelText(model).includes("<img"), false);
  assert.equal(modelText(model).includes("partial"), false);
});

test("the health evidence block carries only the counts it is named for", () => {
  const health = projectBoardHealth(seededStore());
  const model = buildAgentObservationViewModel({
    boardHealth: {
      ...health,
      evidence: { ...health.evidence, run_count: -3, "sk-abcdefgh12345678": 1 },
    },
  });
  assert.equal(model.health.evidence.run_count, null, "a negative count is not a count");
  assert.equal(
    Object.prototype.hasOwnProperty.call(model.health.evidence, "sk-abcdefgh12345678"),
    false,
  );
  assert.equal(modelText(model).includes("sk-abcde"), false);
  assert.equal(model.health.evidence.agent_count, 2, "the valid counts survive");
});

test("counts that are not counts read as unknown rather than as zero", () => {
  const counts = projectStoreCounts(seededStore());
  const model = buildAgentObservationViewModel({
    storeCounts: {
      ...counts,
      agents: -1,
      runs: "many",
      usage_events: 1.5,
      receipts: Number.MAX_SAFE_INTEGER,
      delivery_edges: 3,
    },
  });
  // Zero would assert something false: that the store held nothing.
  assert.deepEqual(model.counts, {
    agents: null, runs: null, usage_events: null, receipts: null, delivery_edges: 3,
  });
  assert.equal(modelText(model).includes("many"), false);
});

test("an unusable privacy or delivery counter is unknown and never clean", () => {
  const counts = projectStoreCounts(seededStore());
  const privacyModel = buildAgentObservationViewModel({
    storeCounts: { ...counts, privacy: { ...counts.privacy, secret_fields_stored: "0" } },
  });
  assert.equal(privacyModel.privacy.totals.secret_fields_stored, null);
  assert.equal(privacyModel.privacy.clean, false, "an unreadable counter cannot prove cleanliness");

  const edges = projectDeliveryEdges(seededStore());
  const deliveryModel = buildAgentObservationViewModel({
    deliveryEdges: { ...edges, delivery_edge_count: -2, structural_edge_count: "1" },
  });
  assert.equal(deliveryModel.delivery.delivery_count, null);
  assert.equal(deliveryModel.delivery.structural_count, null);
  assert.equal(deliveryModel.delivery.consumers[0].adjacent_only, false, "unknown is not adjacency");
});

test("an accessor-backed or hostile projection is refused, not read", () => {
  const counts = projectStoreCounts(seededStore());
  const accessorModel = buildAgentObservationViewModel({
    storeCounts: { ...counts, get agents() { return 2; } },
  });
  assert.equal(accessorModel.privacy.available, false);
  assert.equal(accessorModel.privacy.reason, HOSTILE_REASON);
  assert.equal(accessorModel.counts, null);

  const throwingProxy = new Proxy({ status: "PROJECTED" }, {
    ownKeys() { throw new Error("hostile"); },
    getOwnPropertyDescriptor() { throw new Error("hostile"); },
  });
  const revocable = Proxy.revocable({ status: "PROJECTED" }, {});
  revocable.revoke();

  let model;
  assert.doesNotThrow(() => {
    model = buildAgentObservationViewModel({
      storeCounts: throwingProxy,
      deliveryEdges: revocable.proxy,
      boardHealth: Object.create({ status: "PROJECTED" }),
    });
  });
  assert.equal(model.privacy.reason, HOSTILE_REASON);
  assert.equal(model.delivery.reason, HOSTILE_REASON);
  // A status carried on a prototype is not a projection: the guards read own properties.
  assert.equal(model.health.available, false);
  assert.equal(model.available, false);
});

test("a list longer than the scan bound is held before it is walked", () => {
  // An array's `length` is a settable number decoupled from its contents, so this costs nothing to
  // construct and would otherwise buy four billion iterations inside the view.
  const consumers = [];
  consumers.length = 4294967294;
  const model = buildAgentObservationViewModel({
    deliveryEdges: { ...projectDeliveryEdges(seededStore()), consumers },
  });
  assert.equal(model.delivery.available, false);
  assert.equal(model.delivery.reason, "입력이 한도를 넘음 · 표시 보류");
});

test("an unusable lineageLimit falls back to the default instead of cutting arbitrarily", () => {
  const rows = [{ key: "root", turns: 1000, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 }];
  for (let index = 0; index < 6; index += 1) {
    rows.push({ key: `/root/p${index}/leaf`, turns: 5, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 });
  }
  const lineage = projectMeterLineage(rows);
  assert.equal(buildAgentObservationViewModel({ meterLineage: lineage }).lineage.agents.length, 7);

  for (const lineageLimit of [-1, 0, 1.5, NaN, Infinity, "3", null, {}]) {
    const model = buildAgentObservationViewModel({ meterLineage: lineage, lineageLimit });
    assert.equal(model.lineage.agents.length, 7, `limit ${String(lineageLimit)} must use the default`);
    assert.equal(model.lineage.truncated, false, `limit ${String(lineageLimit)} must not claim a cut`);
  }
});

test("a lineage row the projection could not have produced is dropped", () => {
  const lineage = projectMeterLineage([
    { key: "root", turns: 100, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 },
    { key: "/root/a", turns: 10, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 },
  ]);
  const model = buildAgentObservationViewModel({
    meterLineage: {
      ...lineage,
      agent_count: -4,
      materialised_parent_count: "6",
      agents: [
        ...lineage.agents,
        { agent_key: "sk-abcdefgh12345678", depth: 1, child_keys: [], self_usage: { turns: 0 }, child_direct_usage: { turns: 0 }, subtree_usage: { turns: 9 } },
        { agent_key: "ghost", depth: 1, child_keys: [], self_usage: { turns: "0" }, child_direct_usage: { turns: 0 }, subtree_usage: { turns: 5 } },
      ],
    },
  });
  assert.deepEqual(model.lineage.agents.map((agent) => agent.agent_key), ["root"]);
  assert.equal(model.lineage.agent_count, null);
  assert.equal(model.lineage.materialised_parent_count, null);
  const text = modelText(model);
  assert.equal(text.includes("sk-abcde"), false);
  assert.equal(text.includes("ghost"), false);
});

/**
 * A `hold_code` is producer-controlled text. It arrives on the same projections every other value on
 * this screen arrives on, and the view has no more reason to trust it than it trusts a health enum
 * or a ref value. The tests below hold the hold label to the closed-vocabulary rule the rest of the
 * view already follows: a code with a label is labelled, and a code without one is held.
 */

// Assembled from fragments so this file carries no literal local absolute path while the fixture is
// still hostile at runtime.
const HOSTILE_HOLD_CODES = [
  `${"sk-"}abcdefgh12345678`,
  `${"C:"}\\Users\\ownercode\\notes.txt`,
  `${"/"}${"Users"}/ownercode/tokens.json`,
  `${"/"}${"home"}/ownercode/.netrc`,
  "<img src=x onerror=alert(1)>",
  `${"Bearer"} abcdefgh12345678`,
];

test("an unknown hold code is held under the fixed label rather than interpolated", () => {
  // The four codes the view has labels for are unaffected; only an unrecognised one is held.
  assert.equal(lookupObservationHoldLabel("UNKNOWN_STORE"), "관찰 store를 알 수 없음 · 표시 보류");
  assert.equal(lookupObservationHoldLabel("INPUT_TOO_LARGE"), "입력이 한도를 넘음 · 표시 보류");

  for (const code of ["SOMETHING_NEW", "DELIVERY_TARGET_MISMATCH", "AGENT_RUN_MISMATCH"]) {
    const label = lookupObservationHoldLabel(code);
    assert.equal(label, UNKNOWN_ENUM_LABEL, code);
    assert.equal(label.includes(code), false, `${code} must not be echoed into the label`);
  }

  for (const code of HOSTILE_HOLD_CODES) {
    const label = lookupObservationHoldLabel(code);
    assert.equal(label, UNKNOWN_ENUM_LABEL, code);
    assert.equal(label.includes(code.slice(0, 8)), false, `${code} must not be echoed into the label`);
  }
});

test("a hostile hold code carried on a real HOLD projection never reaches the model", () => {
  // Not a hand-written shape: this is the store's own refusal, with only the code swapped for one a
  // compromised or future producer could emit. Every panel takes its reason from that same code.
  const foreign = Object.freeze({ kind: "soulforge.agent_observation.store.v1" });
  const realHold = projectStoreCounts(foreign);
  assert.equal(realHold.status, "HOLD");

  for (const code of HOSTILE_HOLD_CODES) {
    const held = { ...realHold, hold_code: code };
    const model = buildAgentObservationViewModel({
      storeCounts: held,
      deliveryEdges: held,
      boardHealth: held,
      meterLineage: held,
    });
    assert.equal(model.available, false, code);
    assert.equal(model.unavailable_panel_count, 4, code);
    for (const panel of [model.privacy, model.delivery, model.health, model.lineage]) {
      assert.equal(panel.available, false, code);
      assert.equal(panel.reason, UNKNOWN_ENUM_LABEL, code);
    }
    // Checked in the encoded form too: a backslash path would otherwise be escaped inside the JSON
    // and slip past a raw substring test that reads as if it had covered it.
    const text = modelText(model);
    const encoded = JSON.stringify(code).slice(1, -1);
    assert.equal(text.includes(encoded), false, `${code} must not reach the model`);
    assert.equal(text.includes(code.slice(0, 8)), false, `${code} must not reach the model`);
  }
});

/**
 * The lineage key is charset-checked because `/root/…` is both a legitimate meter key and a POSIX
 * root, so the whole-path refusal every other string on this screen gets was never applied to it.
 * That leaves a concrete local path — a home directory, a mount — displayable as an agent key.
 */
test("a lineage key shaped like a concrete local path is withheld, and the meter's own root is not", () => {
  const HOSTILE_LINEAGE_KEYS = [
    `${"/"}${"Users"}/ownerkeya`,
    `${"/"}${"home"}/ownerkeyb`,
    `${"/"}${"mnt"}/ownerkeyc`,
    `${"/root"}${"/"}${"Users"}/ownerkeyd`,
    `${"/root"}${"/"}${"_workmeta"}/ownerkeye`,
  ];
  const measures = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 };
  const rows = [
    // The legitimate shape the meter actually emits: a bare root and a `/root/…` descendant.
    { key: "root", turns: 100, ...measures },
    { key: "/root/a", turns: 10, ...measures },
    { key: "/root/a/x", turns: 3, ...measures },
  ];
  for (const key of HOSTILE_LINEAGE_KEYS) {
    // Each hostile parent gets a child so it ranks as a dispatcher and would otherwise be listed.
    rows.push({ key, turns: 50, ...measures });
    rows.push({ key: `${key}/leaf`, turns: 5, ...measures });
  }
  const model = buildAgentObservationViewModel({ meterLineage: projectMeterLineage(rows), lineageLimit: 50 });
  assert.equal(model.lineage.available, true);

  const keys = model.lineage.agents.map((agent) => agent.agent_key);
  // The meter key root and its `/root/…` descendants are not local paths and must still be shown.
  assert.ok(keys.includes("root"), "the meter's own root key must remain allowed");
  assert.ok(keys.includes("/root/a"), "/root/… must remain allowed");

  const text = modelText(model);
  for (const key of HOSTILE_LINEAGE_KEYS) {
    assert.equal(keys.includes(key), false, `${key} must not be listed as an agent`);
    assert.equal(keys.includes(`${key}/leaf`), false, `${key}/leaf must not be listed as an agent`);
    assert.equal(text.includes(key), false, `${key} must not reach the model`);
  }
});

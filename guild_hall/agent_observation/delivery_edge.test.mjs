/**
 * The delivery edge: who handed what to whom, and on whose evidence.
 *
 * A result receipt is single-ended. It records that a run produced these refs and says nothing
 * about who received them, so the Functional Agent to Spreadsheet Craftsman handoff existed only as
 * a fixture pairing two ids. These tests hold the edge to the distinction that makes it worth
 * recording at all: adjacency in a graph is not delivery, and only a producer-observed receipt on
 * the producer's own run turns one into the other.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DELIVERY_EDGE_KINDS,
  DELIVERY_EDGE_SCHEMA,
  OBSERVATION_HOLD_CODES as C,
  createObservationStore,
  listDeliveryEdges,
  observeRun,
  projectDeliveryEdges,
  projectStoreCounts,
  recordDeliveryEdge,
  recordResultReceipt,
  registerAgent,
} from './agent_observation.mjs';

const REQUESTER = 'agent.edge.systems-engineering.v1';
const CRAFTSMAN = 'agent.edge.spreadsheet.v1';
const REQUESTER_RUN = 'run-edge-requester-0001';
const CRAFTSMAN_RUN = 'run-edge-craftsman-0001';
const ARTIFACT = 'artifact://edge/workbook-0001';

const agentInput = (over = {}) => ({
  agent_id: REQUESTER,
  agent_kind: 'project_isolated_functional',
  functional_role: 'systems_engineering',
  project_id: 'proj-edge',
  provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-edge-0001' }],
  authority_scope: { allowed_projects: ['proj-edge'], allowed_actions: ['read'] },
  memory_class: 'cache_only',
  registered_at: '2026-08-22T00:00:00.000Z',
  ...over,
});

const runInput = (over = {}) => ({
  run_id: REQUESTER_RUN,
  parent_run_id: null,
  agent_id: REQUESTER,
  task_id: 'task-edge-0001',
  project_id: 'proj-edge',
  work_unit_id: 'wu-edge-0001',
  lifecycle: 'terminal',
  provider: 'codex',
  model_id: 'model-edge',
  reasoning_effort: 'high',
  authority: 'read_only',
  started_at: '2026-08-22T01:00:00.000Z',
  heartbeat_at: '2026-08-22T01:05:00.000Z',
  ended_at: '2026-08-22T01:10:00.000Z',
  result_state: 'result_pending',
  side_effect_evidence_refs: [],
  ...over,
});

const receiptInput = (over = {}) => ({
  receipt_id: 'rcpt-edge-0001',
  run_id: CRAFTSMAN_RUN,
  agent_id: CRAFTSMAN,
  receipt_kind: 'delivery',
  producer_evidence_kind: 'producer_observed',
  refs: [{ ref_kind: 'artifact', ref_value: ARTIFACT }],
  observed_at: '2026-08-22T01:11:00.000Z',
  ...over,
});

const edgeInput = (over = {}) => ({
  edge_id: 'edge-craftsman-to-requester-0001',
  producer_run_id: CRAFTSMAN_RUN,
  producer_agent_id: CRAFTSMAN,
  consumer_run_id: REQUESTER_RUN,
  consumer_agent_id: REQUESTER,
  edge_kind: 'delivery',
  receipt_id: 'rcpt-edge-0001',
  observed_at: '2026-08-22T01:12:00.000Z',
  ...over,
});

/** A requester and a craftsman in one project, the craftsman holding a delivery receipt. */
function seeded({ receipt = {}, withReceipt = true } = {}) {
  const store = createObservationStore();
  assert.equal(registerAgent(store, agentInput()).status, 'REGISTERED');
  assert.equal(registerAgent(store, agentInput({
    agent_id: CRAFTSMAN,
    agent_kind: 'tool_specialist_craftsman',
    functional_role: 'spreadsheet',
    provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-edge-0002' }],
  })).status, 'REGISTERED');
  assert.equal(observeRun(store, runInput()).status, 'OBSERVED');
  assert.equal(observeRun(store, runInput({
    run_id: CRAFTSMAN_RUN,
    agent_id: CRAFTSMAN,
    task_id: 'task-edge-0002',
    work_unit_id: 'wu-edge-0002',
    result_state: 'result_observed',
    side_effect_evidence_refs: [{ ref_kind: 'artifact', ref_value: ARTIFACT }],
  })).status, 'OBSERVED');
  if (withReceipt) assert.equal(recordResultReceipt(store, receiptInput(receipt)).status, 'RECORDED');
  return store;
}

test('the contract surface is pinned', () => {
  assert.equal(DELIVERY_EDGE_SCHEMA, 'soulforge.agent_observation.delivery_edge.v1');
  assert.deepEqual([...DELIVERY_EDGE_KINDS], ['delivery', 'structural']);
});

test('a delivery edge records both ends and carries the producer evidence across', () => {
  const store = seeded();
  const result = recordDeliveryEdge(store, edgeInput());
  assert.equal(result.status, 'RECORDED');
  assert.equal(result.record.producer_agent_id, CRAFTSMAN);
  assert.equal(result.record.consumer_agent_id, REQUESTER);
  assert.equal(result.record.edge_kind, 'delivery');

  const view = projectDeliveryEdges(store);
  assert.equal(view.edge_count, 1);
  assert.equal(view.delivery_edge_count, 1);
  assert.equal(view.structural_edge_count, 0);
  assert.deepEqual(view.consumers, [{
    consumer_run_id: REQUESTER_RUN,
    consumer_agent_id: REQUESTER,
    delivery_count: 1,
    structural_count: 0,
    producer_evidence_refs: [`artifact:${ARTIFACT}`],
  }]);
});

test('adjacency is not delivery: a structural edge is counted apart and carries no receipt', () => {
  const store = seeded();
  const structural = recordDeliveryEdge(store, edgeInput({
    edge_id: 'edge-structural-0001', edge_kind: 'structural', receipt_id: null,
  }));
  assert.equal(structural.status, 'RECORDED');

  const view = projectDeliveryEdges(store);
  assert.equal(view.delivery_edge_count, 0, 'a structural edge must never be read as a delivery');
  assert.equal(view.structural_edge_count, 1);
  assert.deepEqual(view.consumers[0].producer_evidence_refs, [], 'adjacency produces no evidence');

  // A structural edge naming a receipt would be borrowing evidence for a handover that did not
  // happen, so the receipt field must be empty on that kind.
  const borrowed = recordDeliveryEdge(store, edgeInput({
    edge_id: 'edge-structural-0002', edge_kind: 'structural', receipt_id: 'rcpt-edge-0001',
  }));
  assert.equal(borrowed.hold_code, C.STRUCTURAL_EDGE_CARRIES_NO_RECEIPT);
});

test('a delivery edge needs a producer-observed receipt, not merely a structural one', () => {
  const structuralReceipt = seeded({
    receipt: { receipt_kind: 'result', producer_evidence_kind: 'structural_only' },
  });
  const result = recordDeliveryEdge(structuralReceipt, edgeInput());
  assert.equal(result.hold_code, C.STRUCTURAL_EDGE_NOT_DELIVERY);

  // A receipt of a kind other than delivery is also not a handover.
  for (const kind of ['result', 'artifact', 'approval', 'validation', 'recovery']) {
    const store = seeded({ receipt: { receipt_kind: kind } });
    const held = recordDeliveryEdge(store, edgeInput());
    assert.equal(held.hold_code, C.STRUCTURAL_EDGE_NOT_DELIVERY, kind);
    assert.equal(held.detail, 'receipt_kind', kind);
  }
});

test('an edge cannot borrow a receipt that belongs to another run or agent', () => {
  const store = seeded();
  // The requester's own receipt cannot evidence the craftsman's delivery.
  assert.equal(recordResultReceipt(store, receiptInput({
    receipt_id: 'rcpt-edge-other-0001', run_id: REQUESTER_RUN, agent_id: REQUESTER,
  })).status, 'RECORDED');

  const borrowed = recordDeliveryEdge(store, edgeInput({ receipt_id: 'rcpt-edge-other-0001' }));
  assert.equal(borrowed.hold_code, C.RECEIPT_RUN_MISMATCH);

  assert.equal(recordDeliveryEdge(store, edgeInput({ receipt_id: 'rcpt-absent-0001' })).hold_code, C.UNKNOWN_RECEIPT);
});

test('an edge cannot cross a project boundary or point at itself', () => {
  const store = seeded();
  assert.equal(registerAgent(store, agentInput({
    agent_id: 'agent.other-project.spreadsheet.v1',
    functional_role: 'spreadsheet',
    project_id: 'proj-other',
    authority_scope: { allowed_projects: ['proj-other'], allowed_actions: ['read'] },
    provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-other-0001' }],
  })).status, 'REGISTERED');
  assert.equal(observeRun(store, runInput({
    run_id: 'run-other-0001',
    agent_id: 'agent.other-project.spreadsheet.v1',
    project_id: 'proj-other',
    task_id: 'task-other-0001',
    work_unit_id: 'wu-other-0001',
  })).status, 'OBSERVED');

  const crossed = recordDeliveryEdge(store, edgeInput({
    consumer_run_id: 'run-other-0001', consumer_agent_id: 'agent.other-project.spreadsheet.v1',
  }));
  assert.equal(crossed.hold_code, C.PROJECT_BINDING_MISMATCH);
  assert.equal(crossed.detail, 'edge');

  const self = recordDeliveryEdge(store, edgeInput({
    consumer_run_id: CRAFTSMAN_RUN, consumer_agent_id: CRAFTSMAN,
  }));
  assert.equal(self.hold_code, C.SELF_DELIVERY_FORBIDDEN);
});

test('both ends must be observed runs whose agents match', () => {
  const store = seeded();
  assert.equal(recordDeliveryEdge(store, edgeInput({ producer_run_id: 'run-absent-0001' })).hold_code, C.UNKNOWN_RUN);
  assert.equal(recordDeliveryEdge(store, edgeInput({ producer_run_id: 'run-absent-0001' })).detail, 'producer_run_id');
  assert.equal(recordDeliveryEdge(store, edgeInput({ consumer_run_id: 'run-absent-0001' })).detail, 'consumer_run_id');

  const wrongProducer = recordDeliveryEdge(store, edgeInput({ producer_agent_id: REQUESTER }));
  assert.equal(wrongProducer.hold_code, C.AGENT_RUN_MISMATCH);
});

test('an edge observed before its own evidence or either run is a temporal hold', () => {
  const store = seeded();
  const beforeReceipt = recordDeliveryEdge(store, edgeInput({ observed_at: '2026-08-22T01:10:30.000Z' }));
  assert.equal(beforeReceipt.hold_code, C.TEMPORAL_ORDER_INVALID);
  assert.equal(beforeReceipt.detail, 'edge_before_receipt');

  const beforeRun = recordDeliveryEdge(store, edgeInput({
    edge_id: 'edge-structural-early', edge_kind: 'structural', receipt_id: null,
    observed_at: '2026-08-22T00:30:00.000Z',
  }));
  assert.equal(beforeRun.hold_code, C.TEMPORAL_ORDER_INVALID);
});

test('an identical edge replay is a no-op and a divergent one is a conflict', () => {
  const store = seeded();
  assert.equal(recordDeliveryEdge(store, edgeInput()).status, 'RECORDED');
  assert.equal(recordDeliveryEdge(store, edgeInput()).status, 'NO_OP');
  assert.equal(projectDeliveryEdges(store).edge_count, 1, 'a replay must not double the ledger');

  const divergent = recordDeliveryEdge(store, edgeInput({ observed_at: '2026-08-22T01:13:00.000Z' }));
  assert.equal(divergent.hold_code, C.DELIVERY_EDGE_CONFLICT);
  assert.equal(projectDeliveryEdges(store).edge_count, 1);
});

test('edges join the store counts and the privacy audit rather than sitting outside them', () => {
  const store = seeded();
  assert.equal(recordDeliveryEdge(store, edgeInput()).status, 'RECORDED');
  const counts = projectStoreCounts(store);
  assert.equal(counts.status, 'PROJECTED');
  assert.equal(counts.delivery_edges, 1, 'a fifth record family must be counted like the other four');
  assert.deepEqual(counts.privacy, { raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0 });

  // The audit has to actually cover this family: a stored record is frozen and key-checked.
  const [record] = listDeliveryEdges(store);
  assert.equal(Object.isFrozen(record), true);
  assert.throws(() => { record.edge_kind = 'structural'; }, TypeError);
});

test('a hostile edge input is refused by the same guards every other entry point uses', () => {
  const store = seeded();
  assert.equal(recordDeliveryEdge(store, { ...edgeInput(), extra: 1 }).hold_code, C.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);
  assert.equal(recordDeliveryEdge(store, edgeInput({ edge_id: 'sk-abcdefgh12345678' })).hold_code, C.SECRET_VALUE_FORBIDDEN);
  assert.equal(recordDeliveryEdge(store, null).hold_code, C.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);
  assert.equal(recordDeliveryEdge(Object.freeze({ kind: 'x' }), edgeInput()).hold_code, C.UNKNOWN_STORE);

  let reads = 0;
  const accessor = Object.defineProperty(edgeInput(), 'edge_id', {
    enumerable: true, configurable: true, get() { reads += 1; return 'sk-abcdefgh12345678'; },
  });
  assert.equal(recordDeliveryEdge(store, accessor).hold_code, C.ACCESSOR_PROPERTY_FORBIDDEN);
  assert.equal(reads, 0);

  let gets = 0;
  const proxied = new Proxy(edgeInput(), {
    get(target, key, receiver) {
      if (key === 'edge_id') { gets += 1; return 'sk-PROXYPAYLOAD123'; }
      return Reflect.get(target, key, receiver);
    },
  });
  const viaProxy = recordDeliveryEdge(store, proxied);
  assert.equal(viaProxy.status, 'RECORDED');
  assert.equal(gets, 0, 'the lying trap must never fire');
  assert.equal(viaProxy.record.edge_id, 'edge-craftsman-to-requester-0001');
});

test('the edge surface opens no external effect and reads no clock', () => {
  const text = readFileSync(new URL('./agent_observation.mjs', import.meta.url), 'utf8');
  assert.equal(text.includes('Date.now'), false);
  assert.equal(text.includes('Math.random'), false);
});

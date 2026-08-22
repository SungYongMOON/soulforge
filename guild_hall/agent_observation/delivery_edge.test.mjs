/**
 * The delivery edge: who handed what to whom, and on whose evidence.
 *
 * A result receipt is single-ended. It records that a run produced these refs and says nothing
 * about who received them, so the Functional Agent to Spreadsheet Craftsman handoff existed only as
 * a fixture pairing two ids. These tests hold the edge to the distinction that makes it worth
 * recording at all: adjacency in a graph is not delivery, and only a producer-observed receipt on
 * the producer's own run turns one into the other.
 *
 * Every guard below is exercised by an input that reaches it and by nothing else, because a review
 * showed six guards could each be deleted with the whole suite still green. A test that passes for
 * a reason other than the one it names is not coverage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DELIVERY_EDGE_KINDS,
  DELIVERY_EDGE_SCHEMA,
  OBSERVATION_HOLD_CODES as C,
  RECORD_KEY_ALLOWLIST,
  auditRecordPrivacy,
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

// The two runs start at different times on purpose. With a shared start, deleting either endpoint's
// temporal check leaves the suite green because the other one catches the same input.
const REQUESTER_START = '2026-08-22T01:00:00.000Z';
const CRAFTSMAN_START = '2026-08-22T01:02:00.000Z';

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
  lifecycle: 'running',
  provider: 'codex',
  model_id: 'model-edge',
  reasoning_effort: 'high',
  authority: 'read_only',
  started_at: REQUESTER_START,
  heartbeat_at: '2026-08-22T01:14:00.000Z',
  // The consumer is still open when the hand-off lands. A fixture whose consumer had already ended
  // would make the canonical example a delivery to a terminated run.
  ended_at: null,
  result_state: 'result_pending',
  side_effect_evidence_refs: [],
  ...over,
});

const craftsmanRun = (over = {}) => runInput({
  run_id: CRAFTSMAN_RUN,
  agent_id: CRAFTSMAN,
  task_id: 'task-edge-0002',
  work_unit_id: 'wu-edge-0002',
  lifecycle: 'terminal',
  started_at: CRAFTSMAN_START,
  heartbeat_at: '2026-08-22T01:09:00.000Z',
  ended_at: '2026-08-22T01:10:00.000Z',
  result_state: 'result_observed',
  side_effect_evidence_refs: [{ ref_kind: 'artifact', ref_value: ARTIFACT }],
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

const craftsmanAgent = (over = {}) => agentInput({
  agent_id: CRAFTSMAN,
  agent_kind: 'tool_specialist_craftsman',
  functional_role: 'spreadsheet',
  provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-edge-0002' }],
  ...over,
});

/** A requester still running and a craftsman that finished, holding a delivery receipt. */
function seeded({ receipt = {}, withReceipt = true } = {}) {
  const store = createObservationStore();
  assert.equal(registerAgent(store, agentInput()).status, 'REGISTERED');
  assert.equal(registerAgent(store, craftsmanAgent()).status, 'REGISTERED');
  assert.equal(observeRun(store, runInput()).status, 'OBSERVED');
  assert.equal(observeRun(store, craftsmanRun()).status, 'OBSERVED');
  if (withReceipt) assert.equal(recordResultReceipt(store, receiptInput(receipt)).status, 'RECORDED');
  return store;
}

test('the contract surface is pinned', () => {
  assert.equal(DELIVERY_EDGE_SCHEMA, 'soulforge.agent_observation.delivery_edge.v1');
  assert.deepEqual([...DELIVERY_EDGE_KINDS], ['delivery', 'structural']);
});

test('a delivery edge records both ends and attributes the evidence to its producer', () => {
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
    // A pooled list of refs would say the consumer received these artifacts without saying from
    // whom, which is not attribution.
    producer_evidence_refs: [{
      producer_run_id: CRAFTSMAN_RUN,
      producer_agent_id: CRAFTSMAN,
      ref_kind: 'artifact',
      ref_value: ARTIFACT,
    }],
  }]);
});

test('the stored record carries exactly the allowlisted keys', () => {
  const store = seeded();
  assert.equal(recordDeliveryEdge(store, edgeInput()).status, 'RECORDED');
  const [record] = listDeliveryEdges(store);
  assert.deepEqual(Object.keys(record).sort(), [...RECORD_KEY_ALLOWLIST.deliveryEdge].sort());
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
  // happen, so the receipt field must be empty on that kind. An omitted field is not the same as
  // an explicit null and is refused as an invalid value, not as a smuggled receipt.
  const borrowed = recordDeliveryEdge(store, edgeInput({
    edge_id: 'edge-structural-0002', edge_kind: 'structural', receipt_id: 'rcpt-edge-0001',
  }));
  assert.equal(borrowed.hold_code, C.STRUCTURAL_EDGE_CARRIES_NO_RECEIPT);
});

test('an unrecognised edge kind is refused rather than filed as structural', () => {
  // Without this guard an arbitrary string is stored as a valid record and lands in the
  // projection's else branch, i.e. silently counted as adjacency.
  const store = seeded();
  for (const kind of ['delivered', 'DELIVERY', '', 'handoff', null, 42]) {
    const result = recordDeliveryEdge(store, edgeInput({ edge_kind: kind, receipt_id: null }));
    assert.equal(result.status, 'HOLD', String(kind));
    assert.equal(result.hold_code, C.INVALID_FIELD_VALUE, String(kind));
    assert.equal(result.detail, 'edge_kind', String(kind));
  }
  assert.equal(projectDeliveryEdges(store).edge_count, 0);
});

test('a delivery edge needs a receipt of the delivery kind', () => {
  for (const kind of ['result', 'artifact', 'approval', 'validation', 'recovery']) {
    const store = seeded({ receipt: { receipt_kind: kind } });
    const held = recordDeliveryEdge(store, edgeInput());
    assert.equal(held.hold_code, C.EDGE_RECEIPT_NOT_DELIVERY, kind);
  }
  // The evidence kind needs no separate check here: `recordResultReceipt` already refuses a
  // delivery receipt carrying `structural_only`, so a stored delivery receipt is always
  // producer-observed. That refusal is proven in agent_observation.test.mjs.
  const structural = seeded({ withReceipt: false });
  assert.equal(recordResultReceipt(structural, receiptInput({
    producer_evidence_kind: 'structural_only',
  })).hold_code, C.STRUCTURAL_EDGE_NOT_DELIVERY);
});

test('an edge cannot borrow a receipt from another run, even under the same agent', () => {
  const store = seeded();
  // A second run by the SAME craftsman, holding its own receipt. This is the case the run check
  // alone catches: the agent matches, so an agent-only check would let it through.
  assert.equal(observeRun(store, craftsmanRun({
    run_id: 'run-edge-craftsman-0002', task_id: 'task-edge-0003', work_unit_id: 'wu-edge-0003',
  })).status, 'OBSERVED');
  assert.equal(recordResultReceipt(store, receiptInput({
    receipt_id: 'rcpt-edge-0002', run_id: 'run-edge-craftsman-0002',
  })).status, 'RECORDED');

  const borrowed = recordDeliveryEdge(store, edgeInput({ receipt_id: 'rcpt-edge-0002' }));
  assert.equal(borrowed.hold_code, C.RECEIPT_RUN_MISMATCH);
  assert.equal(borrowed.detail, undefined, 'the run check is the load-bearing one');

  assert.equal(recordDeliveryEdge(store, edgeInput({ receipt_id: 'rcpt-absent-0001' })).hold_code, C.UNKNOWN_RECEIPT);
});

test('one receipt evidences one hand-over', () => {
  // Two edges citing the same receipt would double both the delivery count and the evidence refs
  // for a consumer, which is the silent doubling the usage ledger keeps a content index to prevent.
  const store = seeded();
  assert.equal(recordDeliveryEdge(store, edgeInput()).status, 'RECORDED');

  const second = recordDeliveryEdge(store, edgeInput({ edge_id: 'edge-second-0001' }));
  assert.equal(second.hold_code, C.RECEIPT_ALREADY_EVIDENCED);

  const view = projectDeliveryEdges(store);
  assert.equal(view.delivery_edge_count, 1);
  assert.equal(view.consumers[0].producer_evidence_refs.length, 1);
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

test('both ends must be observed runs, and both agents must match their own run', () => {
  const store = seeded();
  assert.equal(recordDeliveryEdge(store, edgeInput({ producer_run_id: 'run-absent-0001' })).detail, 'producer_run_id');
  assert.equal(recordDeliveryEdge(store, edgeInput({ consumer_run_id: 'run-absent-0001' })).detail, 'consumer_run_id');

  // Each end's agent is checked against its own run, so the two checks are distinguished by detail
  // rather than sharing one assertion.
  const wrongProducer = recordDeliveryEdge(store, edgeInput({ producer_agent_id: REQUESTER }));
  assert.equal(wrongProducer.hold_code, C.AGENT_RUN_MISMATCH);
  assert.equal(wrongProducer.detail, 'producer');

  const wrongConsumer = recordDeliveryEdge(store, edgeInput({ consumer_agent_id: CRAFTSMAN }));
  assert.equal(wrongConsumer.hold_code, C.AGENT_RUN_MISMATCH);
  assert.equal(wrongConsumer.detail, 'consumer');
});

test('each temporal bound is reachable on its own end', () => {
  const store = seeded();
  const beforeReceipt = recordDeliveryEdge(store, edgeInput({ observed_at: '2026-08-22T01:10:30.000Z' }));
  assert.equal(beforeReceipt.hold_code, C.TEMPORAL_ORDER_INVALID);
  assert.equal(beforeReceipt.detail, 'edge_before_receipt');

  // The craftsman starts at 01:02 and the requester at 01:00, so a structural edge between them
  // reaches exactly one bound at a time.
  const beforeProducer = recordDeliveryEdge(store, edgeInput({
    edge_id: 'edge-early-producer', edge_kind: 'structural', receipt_id: null,
    observed_at: '2026-08-22T01:01:00.000Z',
  }));
  assert.equal(beforeProducer.detail, 'edge_before_producer_start');

  const beforeConsumer = recordDeliveryEdge(store, edgeInput({
    edge_id: 'edge-early-consumer', edge_kind: 'structural', receipt_id: null,
    producer_run_id: REQUESTER_RUN, producer_agent_id: REQUESTER,
    consumer_run_id: CRAFTSMAN_RUN, consumer_agent_id: CRAFTSMAN,
    observed_at: '2026-08-22T01:01:00.000Z',
  }));
  assert.equal(beforeConsumer.detail, 'edge_before_consumer_start');
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

test('the privacy audit actually covers this family rather than reporting a shared zero', () => {
  // The wiring cannot be proven by asserting all-zero counters: that is true whether or not the
  // family is in the audit list. A record that is genuinely dirty must score on every axis, and the
  // allowlist used must be this family's own.
  const dirty = [{
    schema_version: 'soulforge.agent_observation.delivery_edge.v1',
    edge_id: 'edge-dirty-0001',
    raw_transcript: 'this key is not on the allowlist',
    producer_run_id: 'sk-abcdefgh12345678',
    consumer_run_id: ['C:', 'Soulforge', 'secret.txt'].join('\\'),
  }];
  const audit = auditRecordPrivacy(dirty, RECORD_KEY_ALLOWLIST.deliveryEdge);
  assert.ok(audit.raw_fields_stored > 0, 'an unknown key must be counted');
  assert.ok(audit.secret_fields_stored > 0, 'a credential-shaped value must be counted');
  assert.ok(audit.local_path_fields_stored > 0, 'a local absolute path must be counted');

  // And the store's own projection must actually run that audit. All-zero counters are true whether
  // or not the family is on the audit list, so the projection reports which families it covered,
  // from the same list that drives the audits. Dropping one is then observable.
  const store = seeded();
  assert.equal(recordDeliveryEdge(store, edgeInput()).status, 'RECORDED');
  const counts = projectStoreCounts(store);
  assert.equal(counts.delivery_edges, 1, 'a fifth record family must be counted like the other four');
  assert.deepEqual(counts.privacy, { raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0 });
  assert.deepEqual(counts.privacy_audited_families, ['agents', 'runs', 'usage', 'receipts', 'delivery_edges']);

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

test('the projection holds on a foreign handle and cannot be tripped by a hostile receipt id', () => {
  assert.equal(projectDeliveryEdges(Object.freeze({ kind: 'x' })).hold_code, C.UNKNOWN_STORE);
  assert.equal(listDeliveryEdges(Object.freeze({ kind: 'x' })), null);

  // The receipt store is a Map, so a prototype key name is a miss rather than an inherited method.
  const store = seeded();
  for (const receiptId of ['constructor', 'toString', 'hasOwnProperty']) {
    assert.equal(recordDeliveryEdge(store, edgeInput({ receipt_id: receiptId })).hold_code, C.UNKNOWN_RECEIPT, receiptId);
  }
});

test('the edge surface opens no external effect and reads no clock', () => {
  const text = readFileSync(new URL('./agent_observation.mjs', import.meta.url), 'utf8');
  assert.equal(text.includes('Date.now'), false);
  assert.equal(text.includes('Math.random'), false);
});

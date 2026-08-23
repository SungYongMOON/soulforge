/**
 * The four Agent Observation module seams, tested across their own public interfaces.
 *
 * `agent_observation.mjs` grew into one file that owned the Agent Registry, Run Observation, the
 * Usage Ledger and the Evidence/Receipt surface including the delivery edge. Those are four
 * different contracts with four different reasons to change, and while they shared one file nothing
 * stopped one contract's guard from quietly reading another's internals.
 *
 * These tests do two things a file-splitting exercise cannot fake. They drive one shared store
 * through all four seams using only each seam's own imports, so a seam that stopped owning its
 * behavior would fail here rather than in the barrel. And they check ownership at source level: the
 * decision that belongs to a seam must be written in that seam's file, exactly once in the owner,
 * and must not be written in the compatibility barrel. A set of re-export wrappers passes neither.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  AGENT_RECORD_SCHEMA,
  listAgents,
  registerAgent,
} from './agent_registry.mjs';
import {
  RUN_RECORD_SCHEMA,
  listChildRunIds,
  listDescendantRunIds,
  listRuns,
  observeRun,
} from './run_observation.mjs';
import {
  USAGE_EVENT_SCHEMA,
  listUsageEvents,
  projectUsageRollup,
  recordDirectUsage,
} from './usage_ledger.mjs';
import {
  DELIVERY_EDGE_SCHEMA,
  RESULT_RECEIPT_SCHEMA,
  listDeliveryEdges,
  listReceipts,
  projectDeliveryEdges,
  recordDeliveryEdge,
  recordResultReceipt,
} from './delivery_evidence.mjs';

import * as barrel from './agent_observation.mjs';
import { OBSERVATION_HOLD_CODES, createObservationStore } from './agent_observation.mjs';

const C = OBSERVATION_HOLD_CODES;
const PROJECT = 'proj-seam';
const REQUESTER = 'agent.seam.systems_engineering.v1';
const CRAFTSMAN = 'agent.seam.spreadsheet.v1';
const REQUESTER_RUN = 'run-seam-requester-0001';
const CHILD_RUN = 'run-seam-child-0001';
const CRAFTSMAN_RUN = 'run-seam-craftsman-0001';
const ARTIFACT = 'artifact://seam/workbook-0001';

const HERE = new URL('./', import.meta.url);
const sourceOf = (name) => readFileSync(new URL(name, HERE), 'utf8');

/** The four seams, the entry point each one owns, and a decision only that seam may make. */
const SEAMS = Object.freeze([
  Object.freeze({
    file: 'agent_registry.mjs',
    entry: 'registerAgent',
    decision: 'PROVIDER_IDENTITY_CROSSWALK_CONFLICT',
  }),
  Object.freeze({
    file: 'run_observation.mjs',
    entry: 'observeRun',
    decision: 'PARENT_PROJECT_MISMATCH',
  }),
  Object.freeze({
    file: 'usage_ledger.mjs',
    entry: 'recordDirectUsage',
    decision: 'USAGE_CONTENT_DUPLICATE',
  }),
  Object.freeze({
    file: 'delivery_evidence.mjs',
    entry: 'recordResultReceipt',
    decision: 'RECEIPT_ALREADY_EVIDENCED',
  }),
]);

const INTERNALS = 'observation_internals.mjs';
const BARREL = 'agent_observation.mjs';

const agentInput = (over = {}) => ({
  agent_id: REQUESTER,
  agent_kind: 'project_isolated_functional',
  functional_role: 'systems_engineering',
  project_id: PROJECT,
  provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-seam-0001' }],
  authority_scope: { allowed_projects: [PROJECT], allowed_actions: ['read'] },
  memory_class: 'cache_only',
  registered_at: '2026-08-23T00:00:00.000Z',
  ...over,
});

const runInput = (over = {}) => ({
  run_id: REQUESTER_RUN,
  parent_run_id: null,
  agent_id: REQUESTER,
  task_id: 'task-seam-0001',
  project_id: PROJECT,
  work_unit_id: 'wu-seam-0001',
  lifecycle: 'running',
  provider: 'codex',
  model_id: 'model-seam',
  reasoning_effort: 'high',
  authority: 'read_only',
  started_at: '2026-08-23T01:00:00.000Z',
  heartbeat_at: '2026-08-23T01:14:00.000Z',
  ended_at: null,
  result_state: 'result_pending',
  side_effect_evidence_refs: [],
  ...over,
});

const usageInput = (over = {}) => ({
  event_id: 'usage-seam-0001',
  run_id: REQUESTER_RUN,
  agent_id: REQUESTER,
  provider: 'codex',
  model_id: 'model-seam',
  attribution_kind: 'direct',
  tokens: { input: 100, cached_input: 0, cache_write_input: 0, output: 50, reasoning_output: 0 },
  cost_basis: 'token_proxy',
  cost_evidence_refs: [],
  observed_at: '2026-08-23T01:05:00.000Z',
  ...over,
});

const deliveryTarget = Object.freeze({
  target_run_id: REQUESTER_RUN,
  target_agent_id: REQUESTER,
  target_work_unit_id: 'wu-seam-0001',
});

/** One store carried through all four seams, each step taken through that seam's own module. */
function seededStore() {
  const store = createObservationStore();

  // A: Agent Registry
  assert.equal(registerAgent(store, agentInput()).status, 'REGISTERED');
  assert.equal(registerAgent(store, agentInput({
    agent_id: CRAFTSMAN,
    agent_kind: 'tool_specialist_craftsman',
    functional_role: 'spreadsheet',
    provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-seam-0002' }],
  })).status, 'REGISTERED');

  // B: Run Observation
  assert.equal(observeRun(store, runInput()).status, 'OBSERVED');
  assert.equal(observeRun(store, runInput({
    run_id: CHILD_RUN,
    parent_run_id: REQUESTER_RUN,
    task_id: 'task-seam-0002',
    work_unit_id: 'wu-seam-0002',
    started_at: '2026-08-23T01:01:00.000Z',
    heartbeat_at: '2026-08-23T01:06:00.000Z',
  })).status, 'OBSERVED');
  assert.equal(observeRun(store, runInput({
    run_id: CRAFTSMAN_RUN,
    agent_id: CRAFTSMAN,
    task_id: 'task-seam-0003',
    work_unit_id: 'wu-seam-0003',
    lifecycle: 'terminal',
    started_at: '2026-08-23T01:02:00.000Z',
    heartbeat_at: '2026-08-23T01:09:00.000Z',
    ended_at: '2026-08-23T01:10:00.000Z',
    result_state: 'result_observed',
    side_effect_evidence_refs: [{ ref_kind: 'artifact', ref_value: ARTIFACT }],
  })).status, 'OBSERVED');

  // C: Usage Ledger
  assert.equal(recordDirectUsage(store, usageInput()).status, 'RECORDED');
  assert.equal(recordDirectUsage(store, usageInput({
    event_id: 'usage-seam-0002',
    run_id: CHILD_RUN,
    tokens: { input: 10, cached_input: 0, cache_write_input: 0, output: 5, reasoning_output: 0 },
    observed_at: '2026-08-23T01:07:00.000Z',
  })).status, 'RECORDED');

  // D: Evidence/Receipt including the delivery edge
  assert.equal(recordResultReceipt(store, {
    receipt_id: 'rcpt-seam-0001',
    run_id: CRAFTSMAN_RUN,
    agent_id: CRAFTSMAN,
    receipt_kind: 'delivery',
    producer_evidence_kind: 'producer_observed',
    delivery_target: { ...deliveryTarget },
    refs: [{ ref_kind: 'artifact', ref_value: ARTIFACT }],
    observed_at: '2026-08-23T01:11:00.000Z',
  }).status, 'RECORDED');
  assert.equal(recordDeliveryEdge(store, {
    edge_id: 'edge-seam-0001',
    producer_run_id: CRAFTSMAN_RUN,
    producer_agent_id: CRAFTSMAN,
    consumer_run_id: REQUESTER_RUN,
    consumer_agent_id: REQUESTER,
    edge_kind: 'delivery',
    receipt_id: 'rcpt-seam-0001',
    observed_at: '2026-08-23T01:12:00.000Z',
  }).status, 'RECORDED');

  return store;
}

test('one store carries all four seams and each seam reads the others through their public interfaces', () => {
  const store = seededStore();

  // Each seam reads back its own family from the one shared store.
  assert.equal(listAgents(store).length, 2);
  assert.equal(listAgents(store)[0].schema_version, AGENT_RECORD_SCHEMA);
  assert.equal(listRuns(store).length, 3);
  assert.equal(listRuns(store)[0].schema_version, RUN_RECORD_SCHEMA);
  assert.equal(listUsageEvents(store).length, 2);
  assert.equal(listUsageEvents(store)[0].schema_version, USAGE_EVENT_SCHEMA);
  assert.equal(listReceipts(store).length, 1);
  assert.equal(listReceipts(store)[0].schema_version, RESULT_RECEIPT_SCHEMA);
  assert.equal(listDeliveryEdges(store).length, 1);
  assert.equal(listDeliveryEdges(store)[0].schema_version, DELIVERY_EDGE_SCHEMA);

  // B owns the run graph, and C's rollup is that graph applied to the ledger rather than a second
  // parentage walk kept in the usage seam.
  assert.deepEqual(listChildRunIds(store, REQUESTER_RUN), [CHILD_RUN]);
  assert.deepEqual([...listDescendantRunIds(store, REQUESTER_RUN)], [CHILD_RUN]);
  const rollup = projectUsageRollup(store, { run_id: REQUESTER_RUN });
  assert.equal(rollup.status, 'PROJECTED');
  assert.equal(rollup.self_usage.total_tokens, 150);
  assert.equal(rollup.child_direct_usage.total_tokens, 15);
  assert.equal(rollup.subtree_usage.total_tokens, 165);

  // D carries the producer's evidence to the consumer it named.
  const delivery = projectDeliveryEdges(store);
  assert.equal(delivery.delivery_edge_count, 1);
  assert.equal(delivery.structural_edge_count, 0);
  assert.equal(delivery.consumers.length, 1);
  assert.equal(delivery.consumers[0].consumer_run_id, REQUESTER_RUN);
  assert.deepEqual(delivery.consumers[0].producer_evidence_refs, [{
    producer_run_id: CRAFTSMAN_RUN,
    producer_agent_id: CRAFTSMAN,
    ref_kind: 'artifact',
    ref_value: ARTIFACT,
  }]);

  // The barrel is a projection over the same four seams, not a fifth ledger.
  const counts = barrel.projectStoreCounts(store);
  assert.equal(counts.status, 'PROJECTED');
  assert.deepEqual(
    [counts.agents, counts.runs, counts.usage_events, counts.receipts, counts.delivery_edges],
    [2, 3, 2, 1, 1],
  );
  assert.deepEqual(counts.privacy, {
    raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0,
  });
  assert.deepEqual(counts.privacy_audited_families, ['agents', 'runs', 'usage', 'receipts', 'delivery_edges']);
});

test('a seam guard still refuses what another seam never observed', () => {
  const store = createObservationStore();
  assert.equal(registerAgent(store, agentInput()).status, 'REGISTERED');

  // B against A: a run may not claim a project its agent was not registered into.
  assert.equal(observeRun(store, runInput({ project_id: 'proj-other' })).hold_code, C.PROJECT_BINDING_MISMATCH);
  assert.equal(observeRun(store, runInput({ agent_id: 'agent.seam.unknown.v1' })).hold_code, C.UNKNOWN_AGENT);
  assert.equal(observeRun(store, runInput()).status, 'OBSERVED');

  // C against B: usage may not be attributed to a run nobody observed.
  assert.equal(recordDirectUsage(store, usageInput({ run_id: 'run-seam-missing' })).hold_code, C.UNKNOWN_RUN);

  // D against B: a delivery may not be targeted at a run nobody observed, and the receipt's target
  // binding is checked before any edge exists that could carry the hand-over.
  assert.equal(registerAgent(store, agentInput({
    agent_id: CRAFTSMAN,
    agent_kind: 'tool_specialist_craftsman',
    functional_role: 'spreadsheet',
    provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-seam-0002' }],
  })).status, 'REGISTERED');
  assert.equal(observeRun(store, runInput({
    run_id: CRAFTSMAN_RUN, agent_id: CRAFTSMAN, work_unit_id: 'wu-seam-0003',
  })).status, 'OBSERVED');
  const receipt = (over = {}) => ({
    receipt_id: 'rcpt-seam-guard',
    run_id: CRAFTSMAN_RUN,
    agent_id: CRAFTSMAN,
    receipt_kind: 'delivery',
    producer_evidence_kind: 'producer_observed',
    delivery_target: { ...deliveryTarget },
    refs: [{ ref_kind: 'artifact', ref_value: ARTIFACT }],
    observed_at: '2026-08-23T01:11:00.000Z',
    ...over,
  });
  assert.equal(recordResultReceipt(store, receipt({
    delivery_target: { ...deliveryTarget, target_run_id: 'run-seam-missing' },
  })).hold_code, C.UNKNOWN_RUN);
  assert.equal(recordResultReceipt(store, receipt({
    delivery_target: { ...deliveryTarget, target_work_unit_id: 'wu-seam-wrong' },
  })).hold_code, C.DELIVERY_TARGET_WORK_UNIT_MISMATCH);
  assert.equal(recordResultReceipt(store, receipt()).status, 'RECORDED');
  assert.equal(listReceipts(store).length, 1);

  // An unknown handle is a hold everywhere, never an empty store.
  const foreign = Object.freeze({ kind: 'not-a-store' });
  assert.equal(registerAgent(foreign, agentInput()).hold_code, C.UNKNOWN_STORE);
  assert.equal(observeRun(foreign, runInput()).hold_code, C.UNKNOWN_STORE);
  assert.equal(recordDirectUsage(foreign, usageInput()).hold_code, C.UNKNOWN_STORE);
  assert.equal(recordResultReceipt(foreign, receipt()).hold_code, C.UNKNOWN_STORE);
  assert.equal(projectUsageRollup(foreign, { run_id: REQUESTER_RUN }).hold_code, C.UNKNOWN_STORE);
  assert.equal(projectDeliveryEdges(foreign).hold_code, C.UNKNOWN_STORE);
  assert.equal(barrel.projectStoreCounts(foreign).hold_code, C.UNKNOWN_STORE);
});

test('each seam owns its decisions in its own source and the barrel implements none of them', () => {
  const barrelSource = sourceOf(BARREL);
  for (const seam of SEAMS) {
    const source = sourceOf(seam.file);

    // A wrapper that only forwards would satisfy neither line: the seam declares its entry point
    // itself and reaches the shared store itself.
    assert.match(source, new RegExp(`export function ${seam.entry}\\s*\\(`, 'u'), `${seam.file} must declare ${seam.entry}`);
    assert.match(source, /\bstateOf\s*\(/u, `${seam.file} must reach the shared store itself`);
    assert.equal(/^export \*/mu.test(source), false, `${seam.file} must not be a re-export wrapper`);

    // The decision lives with the seam that makes it, and nowhere else among the seams.
    for (const other of SEAMS) {
      const otherSource = other.file === seam.file ? source : sourceOf(other.file);
      assert.equal(
        otherSource.includes(seam.decision),
        other.file === seam.file,
        `${seam.decision} belongs to ${seam.file} alone, found in ${other.file}`,
      );
    }

    assert.equal(barrelSource.includes(seam.decision), false, `the barrel must not decide ${seam.decision}`);
    assert.equal(
      new RegExp(`function ${seam.entry}\\s*\\(`, 'u').test(barrelSource),
      false,
      `the barrel must not implement ${seam.entry}`,
    );
  }

  // The barrel projects over the seams' public interfaces, so it never touches store state.
  assert.equal(/\bstateOf\s*\(/u.test(barrelSource), false, 'the barrel must not reach store state');
});

test('there is one ledger and one implementation of each entry point in this owner', () => {
  const files = readdirSync(HERE).filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs'));
  assert.ok(files.includes(INTERNALS));
  for (const seam of SEAMS) assert.ok(files.includes(seam.file), `${seam.file} must exist`);

  const holders = (pattern, scope = files) => scope.filter((name) => pattern.test(sourceOf(name)));
  // `resource_job_shop.mjs` keeps its own unrelated store, so the single-ledger claim is made about
  // the observation store's own files rather than about every WeakMap in the directory.
  const observationFiles = [...SEAMS.map((seam) => seam.file), INTERNALS, BARREL];

  // The store handle and the WeakMap-held state behind it exist once, in the private internals
  // module. Two of either would be two ledgers wearing one name.
  assert.deepEqual(holders(/new WeakMap\s*\(/u, observationFiles), [INTERNALS]);
  assert.deepEqual(holders(/const STATE\b/u, observationFiles), [INTERNALS]);
  assert.deepEqual(holders(/function createObservationStore\s*\(/u), [INTERNALS]);

  for (const seam of SEAMS) {
    assert.deepEqual(
      holders(new RegExp(`function ${seam.entry}\\s*\\(`, 'u')),
      [seam.file],
      `${seam.entry} must be implemented once`,
    );
  }
});

test('every existing import path and behavior still resolves through the barrel', () => {
  // Same functions, not re-implementations that happen to agree today.
  assert.equal(barrel.registerAgent, registerAgent);
  assert.equal(barrel.observeRun, observeRun);
  assert.equal(barrel.recordDirectUsage, recordDirectUsage);
  assert.equal(barrel.recordResultReceipt, recordResultReceipt);
  assert.equal(barrel.recordDeliveryEdge, recordDeliveryEdge);
  assert.equal(barrel.projectUsageRollup, projectUsageRollup);
  assert.equal(barrel.projectDeliveryEdges, projectDeliveryEdges);
  assert.equal(barrel.listAgents, listAgents);
  assert.equal(barrel.listRuns, listRuns);
  assert.equal(barrel.listUsageEvents, listUsageEvents);
  assert.equal(barrel.listReceipts, listReceipts);
  assert.equal(barrel.listDeliveryEdges, listDeliveryEdges);

  // The receipt shape stays at v2: a delivery receipt names the consumer it was produced for.
  assert.equal(barrel.RESULT_RECEIPT_SCHEMA, 'soulforge.agent_observation.result_receipt.v2');
  assert.equal(barrel.RECORD_KEY_ALLOWLIST.receipt.includes('delivery_target'), true);
  const stored = listReceipts(seededStore())[0];
  assert.deepEqual(stored.delivery_target, { ...deliveryTarget });

  for (const name of [
    'AGENT_RECORD_SCHEMA', 'RUN_RECORD_SCHEMA', 'USAGE_EVENT_SCHEMA', 'DELIVERY_EDGE_SCHEMA',
    'AGENT_KINDS', 'FUNCTIONAL_ROLES', 'RUN_LIFECYCLES', 'RUN_AUTHORITIES', 'RUN_RESULT_STATES',
    'COST_BASES', 'COST_BASES_REQUIRING_EVIDENCE', 'RECEIPT_KINDS', 'PRODUCER_EVIDENCE_KINDS',
    'DELIVERY_EDGE_KINDS', 'RECORD_KEY_ALLOWLIST', 'OBSERVATION_HOLD_CODES',
    'createObservationStore', 'auditRecordPrivacy', 'projectStoreCounts',
  ]) {
    assert.notEqual(barrel[name], undefined, `${name} must stay exported from the barrel`);
  }
});

test('the new seam modules open no external effect surface and read no clock', () => {
  for (const name of [...SEAMS.map((seam) => seam.file), INTERNALS, BARREL]) {
    const source = sourceOf(name);
    assert.equal(source.includes(String.fromCharCode(0)), false, `${name} must stay plain text for grep-based validators`);
    for (const forbidden of [
      'node:fs', 'node:net', 'node:http', 'node:https', 'node:child_process', 'node:dgram',
      'node:worker_threads', 'node:cluster', 'node:v8', 'node:vm',
    ]) {
      assert.equal(source.includes(forbidden), false, `${name} must not import ${forbidden}`);
    }
    for (const pattern of [
      /\brequire\s*\(/u, /\bimport\s*\(/u, /\bfetch\s*\(/u, /\beval\s*\(/u, /new\s+Function\s*\(/u,
      /\bprocess\./u, /\bglobalThis\./u, /\bXMLHttpRequest\b/u, /\bDate\.now\s*\(/u, /new\s+Date\s*\(/u,
      /\bMath\.random\s*\(/u,
    ]) {
      assert.equal(pattern.test(source), false, `${name} must not use ${pattern}`);
    }
  }
});

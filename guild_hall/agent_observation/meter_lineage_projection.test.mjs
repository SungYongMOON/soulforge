import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LINEAGE_MEASURES,
  METER_LINEAGE_HOLD_CODES as M,
  parentAgentKey,
  projectMeterLineage,
} from './meter_lineage_projection.mjs';

const row = (key, turns, over = {}) => ({
  key,
  turns,
  input_tokens: turns * 10,
  cached_input_tokens: turns * 4,
  output_tokens: turns * 2,
  credits: turns * 0.5,
  credit_unknown_turns: 0,
  model_invocations: turns,
  ...over,
});

const byKey = (result, key) => result.agents.find((agent) => agent.agent_key === key);

test('the measure set and the parent rule are pinned', () => {
  assert.deepEqual([...LINEAGE_MEASURES], [
    'turns', 'input_tokens', 'cached_input_tokens', 'output_tokens',
    'credits', 'credit_unknown_turns', 'model_invocations',
  ]);

  assert.equal(parentAgentKey('/root/a/b'), '/root/a');
  assert.equal(parentAgentKey('/root/a'), 'root', 'the tree root is the bare first segment');
  assert.equal(parentAgentKey('/root'), null);
  // A bare name is a peer, not a child. Inferring a parent from a naming coincidence is exactly the
  // guess the observation contract forbids.
  assert.equal(parentAgentKey('Faraday'), null);
  assert.equal(parentAgentKey('root'), null);
  assert.equal(parentAgentKey(''), null);
  assert.equal(parentAgentKey(null), null);
});

test('self, child-direct and subtree are three different answers', () => {
  const result = projectMeterLineage([
    row('root', 100),
    row('/root/a', 10),
    row('/root/b', 20),
    row('/root/a/x', 3),
    row('/root/a/y', 4),
  ]);
  assert.equal(result.status, 'PROJECTED');

  const rootAgent = byKey(result, 'root');
  assert.equal(rootAgent.self_usage.turns, 100);
  // Only the immediate children. A manager reading "my children cost this" must not silently
  // absorb a generation it did not dispatch.
  assert.equal(rootAgent.child_direct_usage.turns, 30);
  assert.equal(rootAgent.subtree_usage.turns, 137);
  assert.deepEqual(rootAgent.child_keys, ['/root/a', '/root/b']);

  const a = byKey(result, '/root/a');
  assert.equal(a.self_usage.turns, 10);
  assert.equal(a.child_direct_usage.turns, 7);
  assert.equal(a.subtree_usage.turns, 17);

  const leaf = byKey(result, '/root/a/x');
  assert.equal(leaf.child_direct_usage.turns, 0);
  assert.equal(leaf.subtree_usage.turns, leaf.self_usage.turns, 'a leaf subtree is itself');
});

test('every measure is rolled up, not just turns', () => {
  const result = projectMeterLineage([row('root', 2), row('/root/a', 3)]);
  const rootAgent = byKey(result, 'root');
  for (const measure of LINEAGE_MEASURES) {
    assert.equal(
      rootAgent.subtree_usage[measure],
      rootAgent.self_usage[measure] + rootAgent.child_direct_usage[measure],
      measure,
    );
  }
  assert.equal(rootAgent.subtree_usage.credits, 2.5);
});

test('a parent named only by its children is materialised with zeroes', () => {
  // The ledger emits a row per agent that recorded turns. An intermediate agent that recorded none
  // is absent, and dropping it would make its children vanish from every subtree above them.
  const result = projectMeterLineage([row('/root/mid/leaf', 5)]);
  assert.equal(result.status, 'PROJECTED');
  assert.equal(result.materialised_parent_count, 2, 'both /root/mid and root are implied');

  const mid = byKey(result, '/root/mid');
  assert.equal(mid.self_usage.turns, 0);
  assert.equal(mid.subtree_usage.turns, 5);
  assert.equal(byKey(result, 'root').subtree_usage.turns, 5);
});

test('bare-named agents are their own roots and never adopted', () => {
  const result = projectMeterLineage([row('Faraday', 7), row('Mill', 9), row('root', 1)]);
  assert.deepEqual(result.root_keys, ['Faraday', 'Mill', 'root']);
  for (const key of ['Faraday', 'Mill']) {
    assert.equal(byKey(result, key).parent_agent_key, null);
    assert.equal(byKey(result, key).child_direct_usage.turns, 0);
  }
});

test('the roots partition the ledger exactly', () => {
  const rows = [row('root', 5), row('/root/a', 2), row('/root/a/b', 1), row('Solo', 4)];
  const result = projectMeterLineage(rows);
  const rootSum = result.root_keys
    .map((key) => byKey(result, key).subtree_usage.turns)
    .reduce((total, value) => total + value, 0);
  const ledgerTotal = rows.reduce((total, entry) => total + entry.turns, 0);
  assert.equal(rootSum, ledgerTotal, 'no turn may be counted twice or lost');
});

test('malformed input holds rather than producing a partial tree', () => {
  assert.equal(projectMeterLineage(null).hold_code, M.INVALID_ROWS);
  assert.equal(projectMeterLineage('rows').hold_code, M.INVALID_ROWS);
  assert.equal(projectMeterLineage([{ turns: 1 }]).hold_code, M.INVALID_ROW_SHAPE);
  assert.equal(projectMeterLineage([{ key: '', turns: 1 }]).hold_code, M.INVALID_ROW_SHAPE);
  assert.equal(projectMeterLineage([row('a', 1), row('a', 2)]).hold_code, M.DUPLICATE_AGENT_KEY);

  // A non-numeric measure is ignored rather than turning the whole rollup into NaN.
  const result = projectMeterLineage([row('root', 1, { credits: 'lots' })]);
  assert.equal(result.status, 'PROJECTED');
  assert.equal(byKey(result, 'root').self_usage.credits, 0);
});

test('the shape the live ledger actually has is what this module was built for', () => {
  // Measured against the real ledger once, then frozen here as a fixture. The state file is
  // gitignored, so a test that read it would pass on this machine and fail on every other one.
  // What was measured: 29,898 turns across 744 agent rows, all on a single `local-node`, with 680
  // path-shaped ids at depth 2 or 3 under one `root` and 64 bare names. Nothing in the ledger
  // answered "what did this agent's subtree cost" — `by_agent` counts each key alone.
  const ledgerShaped = [
    { key: 'root', turns: 28493, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 },
    { key: '/root/ax_board_recovery_worker', turns: 300, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 },
    { key: '/root/opus_ingest_vertical', turns: 200, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 },
    { key: '/root/opus_ingest_vertical/child', turns: 46, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 },
    { key: 'Faraday', turns: 45, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 },
    { key: 'Mill', turns: 45, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, credits: 0, credit_unknown_turns: 0, model_invocations: 0 },
  ];
  const result = projectMeterLineage(ledgerShaped);
  assert.equal(result.status, 'PROJECTED');

  const ledgerTotal = ledgerShaped.reduce((total, entry) => total + entry.turns, 0);
  const rootSum = result.root_keys
    .map((key) => byKey(result, key).subtree_usage.turns)
    .reduce((total, value) => total + value, 0);
  assert.equal(rootSum, ledgerTotal, 'the derived tree must partition the ledger exactly');

  // The three bare names stay separate roots; only the path-shaped ids form a tree.
  assert.deepEqual(result.root_keys, ['Faraday', 'Mill', 'root']);

  const rootAgent = byKey(result, 'root');
  assert.equal(rootAgent.self_usage.turns, 28493, 'the ledger row alone');
  assert.equal(rootAgent.child_direct_usage.turns, 500, 'immediate children only');
  assert.equal(rootAgent.subtree_usage.turns, 29039, 'and the grandchild too');
  assert.notEqual(rootAgent.subtree_usage.turns,
    rootAgent.self_usage.turns + rootAgent.child_direct_usage.turns,
    'a grandchild must make subtree differ from self plus child-direct');
});

test('the projection opens no external effect and reads no clock', () => {
  const text = readFileSync(new URL('./meter_lineage_projection.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['readFile', 'writeFile', 'node:fs', 'fetch(', 'execFile', 'process.env']) {
    assert.equal(text.includes(forbidden), false, `${forbidden} must not appear`);
  }
  assert.equal(text.includes('Date.now'), false);
  assert.equal(text.includes('Math.random'), false);
});

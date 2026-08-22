import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  P0S1_VERTICAL_SCHEMA,
  P0S1_SYNTHETIC_FIXTURE,
  VERTICAL_HOLD_CODES,
  runP0S1Vertical,
} from './p0s1_vertical.mjs';

// Built from parts so the repository stores no literal local absolute path, while the guard still
// sees the exact shape it must reject.
const winPath = (...parts) => parts.join('\\');

const V = VERTICAL_HOLD_CODES;
const withRequester = (over) => ({
  ...P0S1_SYNTHETIC_FIXTURE,
  requester: { ...P0S1_SYNTHETIC_FIXTURE.requester, ...over },
});
const holdCodes = (result) => result.holds.map((h) => h.hold_code);

test('the vertical result schema is pinned', () => {
  assert.equal(P0S1_VERTICAL_SCHEMA, 'soulforge.agent_observation.p0s1_vertical_result.v1');
});

test('the fixture is public-safe synthetic and names no real project or provider account', () => {
  const serialized = JSON.stringify(P0S1_SYNTHETIC_FIXTURE);
  assert.match(P0S1_SYNTHETIC_FIXTURE.requester.project_id, /^proj-synthetic-/u);
  assert.match(P0S1_SYNTHETIC_FIXTURE.craftsman.project_id, /^proj-synthetic-/u);
  for (const forbidden of [
    /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]/u, /\/Users\//u, /\bBearer\s/u,
    /\bsk-[A-Za-z0-9]{8,}/u, /\bghp_/u, /\bAKIA[0-9A-Z]{16}\b/u, /@/u,
  ]) {
    assert.equal(forbidden.test(serialized), false, `fixture must not contain ${forbidden}`);
  }
});

test('the smallest vertical passes end to end with exactly one of each record', () => {
  const result = runP0S1Vertical(P0S1_SYNTHETIC_FIXTURE);
  assert.equal(result.schema_version, P0S1_VERTICAL_SCHEMA);
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.holds, []);

  assert.equal(result.counts.agents, 2);
  assert.equal(result.counts.runs, 2);
  assert.equal(result.counts.requester_runs, 1);
  assert.equal(result.counts.usage_events, 2);
  assert.equal(result.counts.requester_direct_usage_events, 1);
  assert.equal(result.counts.receipts, 1);
  assert.equal(result.counts.resources, 1);
  assert.equal(result.counts.resource_capacity, 1);
  assert.equal(result.counts.leases_granted, 1);
  assert.equal(result.counts.recorded_completions, 1);
  assert.equal(result.counts.fenced_completion_attempts, 0);
  assert.equal(result.counts.duplicate_completion_holds, 0);
});

test('the manager run keeps its own direct usage separate from the craftsman child', () => {
  const { usage_rollup: rollup } = runP0S1Vertical(P0S1_SYNTHETIC_FIXTURE);
  assert.equal(rollup.self_usage.event_count, 1);
  assert.equal(rollup.child_direct_usage.event_count, 1);
  assert.equal(rollup.self_usage.total_tokens, 2250);
  assert.equal(rollup.child_direct_usage.total_tokens, 960);
  assert.equal(rollup.subtree_usage.total_tokens, 3210);
  assert.notEqual(rollup.self_usage.total_tokens, rollup.subtree_usage.total_tokens);
});

test('a replayed usage event does not increase any usage total', () => {
  const base = runP0S1Vertical(P0S1_SYNTHETIC_FIXTURE);
  const replayed = runP0S1Vertical({ ...P0S1_SYNTHETIC_FIXTURE, replay_usage_event: true });
  assert.equal(replayed.status, 'PASS');
  assert.equal(replayed.counts.usage_events, base.counts.usage_events);
  assert.deepEqual(replayed.usage_rollup, base.usage_rollup);
  assert.equal(replayed.counts.usage_replay_no_ops, 1);
  assert.equal(base.counts.usage_replay_no_ops, 0);
});

test('a conflicting usage replay puts the vertical on HOLD without changing totals', () => {
  const base = runP0S1Vertical(P0S1_SYNTHETIC_FIXTURE);
  const conflicted = runP0S1Vertical({ ...P0S1_SYNTHETIC_FIXTURE, conflicting_usage_replay: true });
  assert.equal(conflicted.status, 'HOLD');
  assert.ok(holdCodes(conflicted).includes('USAGE_EVENT_CONFLICT'));
  assert.equal(conflicted.counts.usage_events, base.counts.usage_events);
  assert.deepEqual(conflicted.usage_rollup, base.usage_rollup);
});

test('an unknown parent run or unknown project holds instead of being inferred', () => {
  const unknownParent = runP0S1Vertical({ ...P0S1_SYNTHETIC_FIXTURE, unknown_parent_run: true });
  assert.equal(unknownParent.status, 'HOLD');
  assert.ok(holdCodes(unknownParent).includes('UNKNOWN_PARENT_RUN'));
  assert.equal(unknownParent.board_rows.length, 0);

  const unknownProject = runP0S1Vertical({ ...P0S1_SYNTHETIC_FIXTURE, unknown_project: true });
  assert.equal(unknownProject.status, 'HOLD');
  assert.ok(holdCodes(unknownProject).includes('UNKNOWN_PROJECT'));
  assert.equal(unknownProject.counts.agents, 0);
  assert.equal(unknownProject.usage_rollup, null);
});

test('an unexpected fixture key is refused before anything is observed', () => {
  const result = runP0S1Vertical({ ...P0S1_SYNTHETIC_FIXTURE, transcript: 'raw chain of thought' });
  assert.equal(result.status, 'HOLD');
  assert.deepEqual(holdCodes(result), [V.RAW_OR_UNKNOWN_FIELD_FORBIDDEN]);
  assert.equal(result.counts, null);
  assert.equal(result.board_rows.length, 0);

  const nestedExtra = runP0S1Vertical({ ...P0S1_SYNTHETIC_FIXTURE, job: { ...P0S1_SYNTHETIC_FIXTURE.job, cwd: 'x' } });
  assert.deepEqual(holdCodes(nestedExtra), [V.RAW_OR_UNKNOWN_FIELD_FORBIDDEN]);

  const badFlag = runP0S1Vertical({ ...P0S1_SYNTHETIC_FIXTURE, replay_usage_event: 'yes' });
  assert.deepEqual(holdCodes(badFlag), [V.INVALID_FIELD_VALUE]);
});

test('a Board-facing display label carrying a path, a credential or markup is refused', () => {
  const cases = [
    [winPath('C:', 'Users', 'user', 'OneDrive', 'plan.hwpx'), V.LOCAL_PATH_VALUE_FORBIDDEN],
    ['Bearer sk-live-abcdefgh12345678', V.SECRET_VALUE_FORBIDDEN],
    ['<내부 대화 원문>', V.UNSAFE_DISPLAY_LABEL],
    ['label\nwith newline', V.UNSAFE_DISPLAY_LABEL],
    ['a'.repeat(200), V.UNSAFE_DISPLAY_LABEL],
    ['', V.UNSAFE_DISPLAY_LABEL],
  ];
  for (const [label, expected] of cases) {
    const result = runP0S1Vertical(withRequester({ display_label: label }));
    assert.equal(result.status, 'HOLD', label);
    assert.deepEqual(holdCodes(result), [expected], label);
    assert.equal(result.board_rows.length, 0, label);
  }
});

test('the vertical stores zero raw, private or secret fields', () => {
  const result = runP0S1Vertical(P0S1_SYNTHETIC_FIXTURE);
  assert.deepEqual(result.privacy, {
    raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0,
  });
  const serialized = JSON.stringify(result);
  for (const forbidden of ['transcript', 'chain_of_thought', 'reasoning_content', 'reasoning_text', 'prompt', 'tool_input', 'tool_output', 'credential', 'cwd']) {
    assert.equal(serialized.includes(forbidden), false, `result must not carry ${forbidden}`);
  }
});

test('the declared effect boundary is reported as a declaration, and no network global is touched', () => {
  const result = runP0S1Vertical(P0S1_SYNTHETIC_FIXTURE);
  assert.deepEqual(result.declared_effect_boundary, {
    erp_world_tree_writes: 0,
    board_enrollment_writes: 0,
    result_gate_writes: 0,
    file_writes: 0,
    external_calls: 0,
    spreadsheet_app_invocations: 0,
  });

  // Measured, not declared: run the whole vertical with the network globals replaced by counters.
  const originals = { fetch: globalThis.fetch, XMLHttpRequest: globalThis.XMLHttpRequest };
  let networkCalls = 0;
  try {
    globalThis.fetch = () => { networkCalls += 1; throw new Error('network is forbidden in this slice'); };
    globalThis.XMLHttpRequest = function BlockedXhr() { networkCalls += 1; throw new Error('network is forbidden in this slice'); };
    assert.equal(runP0S1Vertical(P0S1_SYNTHETIC_FIXTURE).status, 'PASS');
  } finally {
    globalThis.fetch = originals.fetch;
    globalThis.XMLHttpRequest = originals.XMLHttpRequest;
  }
  assert.equal(networkCalls, 0);
});

test('exactly one Board row is projected by exact ID and stays metadata only', () => {
  const result = runP0S1Vertical(P0S1_SYNTHETIC_FIXTURE);
  assert.equal(result.board_rows.length, 1);
  const row = result.board_rows[0];
  assert.deepEqual(Object.keys(row).sort(), [
    'agent_id', 'display_label', 'organization_group_id', 'project_id',
    'result_gate_state', 'row_kind', 'run_id', 'status_label',
  ]);
  assert.equal(row.row_kind, 'agent_run');
  assert.equal(row.agent_id, P0S1_SYNTHETIC_FIXTURE.requester.agent_id);
  assert.equal(row.run_id, P0S1_SYNTHETIC_FIXTURE.requester.run_id);
  assert.equal(row.result_gate_state, 'result_ready_parent');
  assert.equal(row.status_label, '하위 결과 도착/취합 중');
  assert.equal(row.display_label, P0S1_SYNTHETIC_FIXTURE.requester.display_label);
});

test('the delivery receipt is producer evidenced, and no row appears without one', () => {
  const result = runP0S1Vertical(P0S1_SYNTHETIC_FIXTURE);
  assert.equal(result.delivery_evidence.producer_evidence_kind, 'producer_observed');
  assert.equal(result.delivery_evidence.structural_edge_marked_as_delivery, false);
  assert.equal(result.counts.receipts, 1);

  const held = runP0S1Vertical({ ...P0S1_SYNTHETIC_FIXTURE, unknown_parent_run: true });
  assert.equal(held.delivery_evidence.producer_evidence_kind, 'none');
  assert.equal(held.counts.receipts, 0);
  assert.equal(held.board_rows.length, 0);
});

test('a malformed nested fixture shape returns a HOLD result and never throws', () => {
  const F = P0S1_SYNTHETIC_FIXTURE;
  const cases = [
    ['provider_identities as a string', { ...F, requester: { ...F.requester, provider_identities: 'x' } }],
    ['provider_identities null', { ...F, requester: { ...F.requester, provider_identities: null } }],
    ['provider_identities as an object', { ...F, requester: { ...F.requester, provider_identities: { a: 1 } } }],
    ['provider_identities empty', { ...F, requester: { ...F.requester, provider_identities: [] } }],
    ['identity entry not an object', { ...F, requester: { ...F.requester, provider_identities: ['x'] } }],
    ['tokens missing', { ...F, craftsman: { ...F.craftsman, tokens: null } }],
    ['tokens not numeric', { ...F, craftsman: { ...F.craftsman, tokens: { input: 'x', cached_input: 0, cache_write_input: 0, output: 0, reasoning_output: 0 } } }],
    ['host.capability_kinds null', { ...F, host: { ...F.host, capability_kinds: null } }],
    ['host.host_id invalid', { ...F, host: { ...F.host, host_id: 'has space' } }],
    ['resource.capacity zero', { ...F, resource: { ...F.resource, capacity: 0 } }],
    ['job.priority invalid', { ...F, job: { ...F.job, priority: 'made_up' } }],
    ['job.submitted_seq negative', { ...F, job: { ...F.job, submitted_seq: -1 } }],
    ['host null', { ...F, host: null }],
    ['requester null', { ...F, requester: null }],
    ['fixture null', null],
  ];
  for (const [label, fixture] of cases) {
    let result;
    assert.doesNotThrow(() => { result = runP0S1Vertical(fixture); }, `${label} must not throw`);
    assert.equal(result.status, 'HOLD', label);
    assert.equal(result.holds.length, 1, label);
    assert.equal(result.counts, null, label);
    assert.equal(result.board_rows.length, 0, label);
  }
});

test('a fixture nested deeper than the scan bound fails closed', () => {
  let deep = 'leaf';
  for (let i = 0; i < 60_000; i += 1) deep = { nested: deep };
  let result;
  assert.doesNotThrow(() => { result = runP0S1Vertical({ ...P0S1_SYNTHETIC_FIXTURE, job: deep }); });
  assert.equal(result.status, 'HOLD');
  assert.deepEqual(holdCodes(result), [V.INPUT_TOO_DEEP]);
});

test('a HOLD result carries no raw key, path or credential either', () => {
  const hostileKey = winPath('C:', 'Users', 'user', 'OneDrive', 'secret.xlsx');
  const results = [
    runP0S1Vertical({ ...P0S1_SYNTHETIC_FIXTURE, [hostileKey]: 1 }),
    runP0S1Vertical({ ...P0S1_SYNTHETIC_FIXTURE, ['Bearer abcdef0123456789']: 1 }),
    runP0S1Vertical({ ...P0S1_SYNTHETIC_FIXTURE, transcript: 'raw chain of thought' }),
    runP0S1Vertical({ ...P0S1_SYNTHETIC_FIXTURE, unknown_parent_run: true }),
    runP0S1Vertical({ ...P0S1_SYNTHETIC_FIXTURE, unknown_project: true }),
  ];
  for (const result of results) {
    assert.equal(result.status, 'HOLD');
    const serialized = JSON.stringify(result);
    for (const forbidden of ['transcript', 'chain_of_thought', 'reasoning_content', 'prompt', 'tool_input', 'tool_output', 'credential', 'cwd', 'Bearer ', 'OneDrive', 'Users']) {
      assert.equal(serialized.includes(forbidden), false, `HOLD result must not carry ${forbidden}`);
    }
    assert.equal(/(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]/u.test(serialized), false);
  }
});

test('the vertical module opens no external effect surface', () => {
  const source = readFileSync(new URL('./p0s1_vertical.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('\u0000'), false, 'must stay plain text for grep-based validators');
  for (const forbidden of [
    'node:fs', 'node:net', 'node:http', 'node:https', 'node:child_process', 'node:dgram',
    'node:worker_threads', 'node:cluster', 'node:v8', 'node:vm',
  ]) {
    assert.equal(source.includes(forbidden), false, `must not import ${forbidden}`);
  }
  for (const pattern of [/\brequire\s*\(/u, /\bimport\s*\(/u, /\bfetch\s*\(/u, /\beval\s*\(/u, /new\s+Function\s*\(/u, /\bprocess\./u, /\bglobalThis\./u, /\bDate\.now\s*\(/u]) {
    assert.equal(pattern.test(source), false, `must not use ${pattern}`);
  }
});

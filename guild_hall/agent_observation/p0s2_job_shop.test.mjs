import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  P0S2_RESULT_SCHEMA,
  CONTEXT_CAPSULE_SCHEMA,
  P0S2_HOLD_CODES,
  P0S2_SYNTHETIC_FIXTURE,
  auditProjectionPrivacy,
  measureProjectIsolation,
  runP0S2JobShop,
} from './p0s2_job_shop.mjs';

// Built from parts so the repository stores no literal local absolute path.
const fileUri = (...parts) => ['file:', '', '', ...parts].join('/');
const winPath = (...parts) => parts.join('\\');

const S = P0S2_HOLD_CODES;
const F = P0S2_SYNTHETIC_FIXTURE;
const holdCodes = (result) => result.holds.map((h) => h.hold_code);
const withFlag = (flag) => runP0S2JobShop({ ...F, [flag]: true });

test('the schemas are pinned', () => {
  assert.equal(P0S2_RESULT_SCHEMA, 'soulforge.agent_observation.p0s2_job_shop_result.v1');
  assert.equal(CONTEXT_CAPSULE_SCHEMA, 'soulforge.agent_observation.context_capsule.v1');
});

test('the fixture holds three distinct synthetic projects and no real identifiers', () => {
  const projectIds = F.projects.map((p) => p.project_id);
  assert.equal(projectIds.length, 3);
  assert.equal(new Set(projectIds).size, 3);
  for (const id of projectIds) assert.match(id, /^proj-synthetic-/u);

  const serialized = JSON.stringify(F);
  for (const forbidden of [
    /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]/u, /\/Users\//u, /\bBearer\s/u,
    /\bsk-[A-Za-z0-9]{8,}/u, /\bghp_/u, /\bAKIA[0-9A-Z]{16}\b/u, /@/u,
  ]) {
    assert.equal(forbidden.test(serialized), false, `fixture must not contain ${forbidden}`);
  }
});

// ------------------------------------------------------------------ O1, O2: isolated registration

test('three projects each register their own functional agent and craftsman', () => {
  const result = runP0S2JobShop(F);
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.holds, []);
  assert.equal(result.counts.projects, 3);
  assert.equal(result.counts.agents, 6, 'one functional agent and one craftsman per project');
  assert.equal(result.counts.runs, 6, 'a requester run and a craftsman run per project');
  assert.equal(result.per_project.length, 3);
  assert.equal(new Set(result.per_project.map((p) => p.agent_id)).size, 3);
  assert.equal(new Set(result.per_project.map((p) => p.craftsman_agent_id)).size, 3);
});

test('a craftsman run cannot be parented to another project run', () => {
  const result = withFlag('cross_project_parent');
  assert.equal(result.status, 'HOLD');
  assert.ok(holdCodes(result).includes('PARENT_PROJECT_MISMATCH'));
});

// ------------------------------------------------------------------ O3, O4, O5: queue behaviour

test('three jobs queue against one capacity-1 spreadsheet resource', () => {
  const result = runP0S2JobShop(F);
  assert.equal(result.counts.resources, 1);
  assert.equal(result.counts.resource_capacity, 1);
  assert.equal(result.counts.jobs_submitted, 3);
  assert.equal(result.queue_depth_before_dispatch, 3);
  assert.equal(result.max_concurrent_leases, 1, 'capacity 1 must never be exceeded');
});

test('dispatch order is priority then FIFO, and is not the submission order', () => {
  const result = runP0S2JobShop(F);
  const submitted = F.projects.map((p) => p.job.job_id);
  assert.deepEqual(result.submission_order, submitted);
  assert.notDeepEqual(result.dispatch_order, submitted, 'submission order alone must not explain dispatch');

  const priorityOf = new Map(F.projects.map((p) => [p.job.job_id, p.job.priority]));
  const rank = { urgent: 0, high: 1, normal: 2 };
  const ranks = result.dispatch_order.map((id) => rank[priorityOf.get(id)]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'dispatch must be ordered by priority');
});

test('the lowest priority job still runs once the finite batch drains, and runs last', () => {
  const result = runP0S2JobShop(F);
  const normalJob = F.projects.find((p) => p.job.priority === 'normal').job.job_id;
  assert.equal(result.starvation.lowest_priority_job_id, normalJob);
  assert.equal(result.starvation.dispatched, true);
  assert.equal(result.starvation.dispatch_index, 2);
  assert.equal(result.queue_depth_after_drain, 0);
});

// ------------------------------------------------------- O6, O7, O8: crash, reclaim, replay, TTL

test('a crashed lease is reclaimed at a higher epoch and the stale completion is refused', () => {
  const result = runP0S2JobShop(F);
  assert.equal(result.crash_recovery.crashed_job_id, result.dispatch_order[0]);
  assert.equal(result.crash_recovery.first_epoch, 1);
  assert.ok(result.crash_recovery.reclaim_epoch > result.crash_recovery.first_epoch);
  assert.equal(result.crash_recovery.stale_completion_hold_code, 'LEASE_FENCED_OUT');
  assert.equal(result.counts.fenced_completion_attempts, 1);
});

test('no job records more than one completion across crash, reclaim and replay', () => {
  const result = runP0S2JobShop(F);
  assert.equal(result.counts.recorded_completions, 3);
  assert.equal(result.counts.duplicate_completions, 0);
  assert.equal(result.counts.completion_replay_no_ops, 1);
  for (const project of result.per_project) {
    assert.equal(project.completion_count, 1, `${project.project_id} must complete once`);
  }
});

test('a timed-out lease cannot record a completion even while the resource sits idle', () => {
  const result = withFlag('timeout_without_reclaim');
  assert.equal(result.status, 'HOLD');
  assert.ok(holdCodes(result).includes('LEASE_FENCED_OUT'));
  assert.ok(result.counts.recorded_completions < 3);
  assert.equal(result.counts.duplicate_completions, 0);
});

// --------------------------------------------------------- O9, O10: context capsule isolation

test('each project binds only its own context capsule', () => {
  const result = runP0S2JobShop(F);
  assert.equal(result.counts.capsule_bindings, 3);
  assert.equal(result.counts.capsule_cross_project_holds, 0);
  for (const project of result.per_project) {
    assert.equal(project.capsule.project_id, project.project_id);
    assert.equal(project.capsule.work_unit_id, project.work_unit_id);
    assert.equal(project.capsule.authority_class, 'cache_only');
    assert.equal(project.capsule.not_authority, true);
  }
});

test("a capsule from another project is refused and binds nothing", () => {
  const result = withFlag('cross_project_capsule');
  assert.equal(result.status, 'HOLD');
  assert.ok(holdCodes(result).includes(S.CAPSULE_PROJECT_MISMATCH));
  assert.equal(result.counts.capsule_cross_project_holds, 1);
  assert.ok(result.counts.capsule_bindings < 3);
});

test('an expired capsule is refused', () => {
  const result = withFlag('expired_capsule');
  assert.equal(result.status, 'HOLD');
  assert.ok(holdCodes(result).includes(S.CAPSULE_EXPIRED));
});

test('a capsule carries refs only, never a source body', () => {
  const result = withFlag('capsule_with_body');
  assert.equal(result.status, 'HOLD');
  assert.ok(holdCodes(result).includes(S.RAW_OR_UNKNOWN_FIELD_FORBIDDEN));

  const clean = runP0S2JobShop(F);
  for (const project of clean.per_project) {
    assert.deepEqual(Object.keys(project.capsule).sort(), [
      'authority_class', 'capsule_id', 'expires_at', 'not_authority', 'project_id',
      'schema_version', 'source_refs', 'work_unit_id',
    ]);
    for (const ref of project.capsule.source_refs) {
      assert.deepEqual(Object.keys(ref).sort(), ['ref_kind', 'ref_value']);
    }
  }
});

// ------------------------------------------------------------- O11: no cross-project contamination

test('no project result carries another project identifier', () => {
  const result = runP0S2JobShop(F);
  const ids = F.projects.map((p) => p.project_id);
  for (const project of result.per_project) {
    const others = ids.filter((id) => id !== project.project_id);
    const serialized = JSON.stringify(project);
    for (const other of others) {
      assert.equal(serialized.includes(other), false, `${project.project_id} leaked ${other}`);
    }
  }
});

test('usage attribution stays inside each project subtree', () => {
  const result = runP0S2JobShop(F);
  assert.deepEqual(result.isolation, {
    cross_project_capsule_bindings: 0,
    cross_project_parent_links: 0,
    cross_project_usage_attribution: 0,
  });
  for (const project of result.per_project) {
    assert.equal(project.usage.self_usage.event_count, 1);
    assert.equal(project.usage.child_direct_usage.event_count, 1);
    assert.equal(
      project.usage.subtree_usage.total_tokens,
      project.usage.self_usage.total_tokens + project.usage.child_direct_usage.total_tokens,
    );
  }
});

test('exactly one Board row per project, metadata only', () => {
  const result = runP0S2JobShop(F);
  assert.equal(result.board_rows.length, 3);
  assert.equal(new Set(result.board_rows.map((r) => r.project_id)).size, 3);
  for (const row of result.board_rows) {
    assert.deepEqual(Object.keys(row).sort(), [
      'agent_id', 'display_label', 'organization_group_id', 'project_id',
      'result_gate_state', 'row_kind', 'run_id', 'status_label',
    ]);
    assert.equal(row.result_gate_state, 'result_ready_parent');
  }
});

// -------------------------------------------------------------------- O12: boundaries and hygiene

test('the run stores no raw, secret or local path field', () => {
  const result = runP0S2JobShop(F);
  assert.deepEqual(result.privacy, {
    raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0,
  });
  const serialized = JSON.stringify(result);
  for (const forbidden of ['transcript', 'chain_of_thought', 'reasoning_content', 'prompt', 'tool_input', 'tool_output', 'credential', 'cwd']) {
    assert.equal(serialized.includes(forbidden), false, `result must not carry ${forbidden}`);
  }
  assert.equal(/(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]/u.test(serialized), false);
});

test('no spreadsheet app is invoked and no external effect is declared', () => {
  const result = runP0S2JobShop(F);
  assert.deepEqual(result.declared_effect_boundary, {
    erp_world_tree_writes: 0,
    board_enrollment_writes: 0,
    result_gate_writes: 0,
    file_writes: 0,
    external_calls: 0,
    spreadsheet_app_invocations: 0,
  });

  const originals = { fetch: globalThis.fetch, XMLHttpRequest: globalThis.XMLHttpRequest };
  let networkCalls = 0;
  try {
    globalThis.fetch = () => { networkCalls += 1; throw new Error('network is forbidden in this slice'); };
    globalThis.XMLHttpRequest = function BlockedXhr() { networkCalls += 1; throw new Error('network is forbidden in this slice'); };
    assert.equal(runP0S2JobShop(F).status, 'PASS');
  } finally {
    globalThis.fetch = originals.fetch;
    globalThis.XMLHttpRequest = originals.XMLHttpRequest;
  }
  assert.equal(networkCalls, 0);
});

test('a malformed fixture returns a HOLD result and never throws', () => {
  const cases = [
    ['null fixture', null],
    ['unexpected key', { ...F, transcript: 'raw chain of thought' }],
    ['projects not an array', { ...F, projects: 'x' }],
    ['two projects only', { ...F, projects: F.projects.slice(0, 2) }],
    ['duplicate project ids', { ...F, projects: [
      F.projects[0],
      { ...F.projects[0], delivery_receipt_id: 'rcpt-synthetic-distinct-0001' },
      F.projects[2],
    ] }],
    ['non-boolean flag', { ...F, cross_project_capsule: 'yes' }],
  ];
  for (const [label, fixture] of cases) {
    let result;
    assert.doesNotThrow(() => { result = runP0S2JobShop(fixture); }, `${label} must not throw`);
    assert.equal(result.status, 'HOLD', label);
    assert.equal(result.per_project.length, 0, label);
    assert.equal(result.board_rows.length, 0, label);
  }
});

test('the run is deterministic: the same fixture yields the same result', () => {
  assert.deepEqual(runP0S2JobShop(F), runP0S2JobShop(F));
  assert.deepEqual(withFlag('cross_project_capsule'), withFlag('cross_project_capsule'));
});


// ------------------------------------------------- negative fixtures for the capsule and capacity

const withProjectZero = (over) => ({
  ...F,
  projects: [{ ...F.projects[0], ...over }, F.projects[1], F.projects[2]],
});
const withCapsule = (over) => withProjectZero({ capsule: { ...F.projects[0].capsule, ...over } });

test('a capsule bound to the wrong work unit is refused', () => {
  const result = runP0S2JobShop(withCapsule({ work_unit_id: 'wu-synthetic-other-0001' }));
  assert.equal(result.status, 'HOLD');
  assert.ok(holdCodes(result).includes(S.CAPSULE_WORK_UNIT_MISMATCH));
  assert.ok(result.counts.capsule_bindings < 3);
});

test('a capsule that does not declare itself a non-authoritative cache is refused', () => {
  for (const over of [{ authority_class: 'long_term_authority' }, { not_authority: false }]) {
    const result = runP0S2JobShop(withCapsule(over));
    assert.equal(result.status, 'HOLD', JSON.stringify(over));
    assert.ok(holdCodes(result).includes(S.CAPSULE_NOT_A_CACHE), JSON.stringify(over));
  }
});

test('a capsule source ref carrying a path, a credential or a bad kind is refused', () => {
  const pathRef = runP0S2JobShop(withCapsule({
    source_refs: [{ ref_kind: 'validation', ref_value: fileUri('C:', 'Users', 'user', 'req.xlsx') }],
  }));
  assert.equal(pathRef.status, 'HOLD');
  assert.ok(holdCodes(pathRef).includes(S.LOCAL_PATH_VALUE_FORBIDDEN));

  const secretRef = runP0S2JobShop(withCapsule({
    source_refs: [{ ref_kind: 'validation', ref_value: 'Bearer abcdefgh12345678' }],
  }));
  assert.equal(secretRef.status, 'HOLD');
  assert.ok(holdCodes(secretRef).includes(S.SECRET_VALUE_FORBIDDEN));

  const badKind = runP0S2JobShop(withCapsule({
    source_refs: [{ ref_kind: 'made_up', ref_value: 'context://synthetic/x' }],
  }));
  assert.equal(badKind.status, 'HOLD');
  assert.ok(holdCodes(badKind).includes(S.INVALID_FIELD_VALUE));

  const emptyRefs = runP0S2JobShop(withCapsule({ source_refs: [] }));
  assert.ok(holdCodes(emptyRefs).includes(S.INVALID_FIELD_VALUE));

  // The deep path and secret scans catch the two cases above on their own. These two are what
  // the per-ref grammar check is actually for.
  const spaced = runP0S2JobShop(withCapsule({
    source_refs: [{ ref_kind: 'validation', ref_value: 'context://synthetic/with space' }],
  }));
  assert.equal(spaced.status, 'HOLD');
  assert.ok(holdCodes(spaced).includes(S.INVALID_FIELD_VALUE));

  const overLong = runP0S2JobShop(withCapsule({
    source_refs: [{ ref_kind: 'validation', ref_value: `context://synthetic/${'a'.repeat(220)}` }],
  }));
  assert.equal(overLong.status, 'HOLD');
  assert.ok(holdCodes(overLong).includes(S.INVALID_FIELD_VALUE));

  const nonString = runP0S2JobShop(withCapsule({
    source_refs: [{ ref_kind: 'validation', ref_value: { transcript: 'RAW BODY' } }],
  }));
  assert.equal(nonString.status, 'HOLD');
});

test('this stage models exactly one spreadsheet seat, so any other capacity is refused', () => {
  for (const capacity of [2, 0, 3]) {
    const result = runP0S2JobShop({ ...F, resource: { ...F.resource, capacity } });
    assert.equal(result.status, 'HOLD', `capacity ${capacity}`);
    assert.ok(holdCodes(result).includes(S.INVALID_FIELD_VALUE), `capacity ${capacity}`);
    assert.equal(result.per_project.length, 0, `capacity ${capacity}`);
  }
});

test('the crashed job is genuinely reclaimed and dispatched, not silently dropped', () => {
  const result = runP0S2JobShop(F);
  assert.equal(result.dispatch_order.length, 3, 'all three jobs reach a worker');
  assert.equal(result.counts.leases_granted, 4, 'three dispatch rounds plus the reclaim');
  assert.equal(result.counts.recorded_completions, 3);
  assert.equal(result.crash_recovery.reclaim_epoch, 2);
  assert.equal(result.queue_depth_after_drain, 0);
});

// ------------------------------------------------------- the isolation measurement is a measurement

const isoAgent = (id, projectId) => ({ agent_id: id, project_id: projectId });
const isoRun = (id, agentId, projectId, parent) => ({ run_id: id, agent_id: agentId, project_id: projectId, parent_run_id: parent });
const isoInput = (over = {}) => ({
  agents: [isoAgent('a.alpha', 'proj-synthetic-alpha'), isoAgent('a.beta', 'proj-synthetic-beta')],
  runs: [
    isoRun('r.alpha', 'a.alpha', 'proj-synthetic-alpha', null),
    isoRun('r.beta', 'a.beta', 'proj-synthetic-beta', null),
  ],
  usage_events: [{ event_id: 'u1', run_id: 'r.alpha', agent_id: 'a.alpha' }],
  capsule_bindings: [{ bound_for_project_id: 'proj-synthetic-alpha', capsule: { project_id: 'proj-synthetic-alpha' } }],
  ...over,
});

test('the isolation measurement detects inconsistent input rather than always reporting zero', () => {
  assert.deepEqual(measureProjectIsolation(isoInput()), {
    cross_project_capsule_bindings: 0,
    cross_project_parent_links: 0,
    cross_project_usage_attribution: 0,
  });

  const badCapsule = measureProjectIsolation(isoInput({
    capsule_bindings: [{ bound_for_project_id: 'proj-synthetic-alpha', capsule: { project_id: 'proj-synthetic-beta' } }],
  }));
  assert.equal(badCapsule.cross_project_capsule_bindings, 1);

  const badParent = measureProjectIsolation(isoInput({
    runs: [
      isoRun('r.alpha', 'a.alpha', 'proj-synthetic-alpha', null),
      isoRun('r.beta', 'a.beta', 'proj-synthetic-beta', 'r.alpha'),
    ],
  }));
  assert.equal(badParent.cross_project_parent_links, 1);

  const badUsage = measureProjectIsolation(isoInput({
    usage_events: [{ event_id: 'u1', run_id: 'r.alpha', agent_id: 'a.beta' }],
  }));
  assert.equal(badUsage.cross_project_usage_attribution, 1);

  const orphanUsage = measureProjectIsolation(isoInput({
    usage_events: [{ event_id: 'u1', run_id: 'r.missing', agent_id: 'a.alpha' }],
  }));
  assert.equal(orphanUsage.cross_project_usage_attribution, 1);
});


// ------------------------------------------- the projection reads the ledger, not the fixture

test('a project that never records a completion produces no row and no artifact claim', () => {
  // Alpha drops out at capsule binding, beta at its cross-project parent, and gamma is dispatched
  // but its lease times out before it can record. Nothing completed.
  const result = runP0S2JobShop({
    ...F, cross_project_capsule: true, cross_project_parent: true, timeout_without_reclaim: true,
  });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.counts.recorded_completions, 0);
  assert.equal(result.counts.completed_projects, 0);
  assert.equal(result.counts.dispatched_without_completion, 1, 'gamma reached a worker but recorded nothing');
  assert.equal(result.per_project.length, 0, 'a dispatched-but-uncompleted job is not a completed project');
  assert.equal(result.board_rows.length, 0);
});

test('a project row exists only when the ledger recorded its completion', () => {
  // Renamed from a claim about the result ref's *value*. The runner always completes a job with the
  // spec's own artifact ref, so ledger and spec agree on the value for every reachable input and no
  // test can separate them. What the ledger read genuinely decides is presence: no recorded
  // completion, no row. That is what this proves.
  const result = runP0S2JobShop(F);
  for (const entry of result.per_project) {
    assert.equal(entry.completion_count, 1);
    assert.equal(entry.result_ref, F.projects.find((p) => p.project_id === entry.project_id).artifact_ref);
  }
  const refs = result.per_project.map((entry) => entry.result_ref);
  assert.equal(new Set(refs).size, 3, 'each project reports its own artifact, not a shared one');
});

test('two projects cannot share a delivery receipt id', () => {
  const result = runP0S2JobShop({
    ...F,
    projects: [
      F.projects[0],
      { ...F.projects[1], delivery_receipt_id: F.projects[0].delivery_receipt_id },
      F.projects[2],
    ],
  });
  assert.equal(result.status, 'HOLD');
  assert.deepEqual(holdCodes(result), [S.DUPLICATE_DELIVERY_RECEIPT_ID]);
  assert.equal(result.per_project.length, 0);
  assert.equal(result.board_rows.length, 0);
});

// --------------------------------------------------- HOLD-path values are reported, not assumed

test('a held run reports its real queue depth, starvation state and replay count', () => {
  const held = runP0S2JobShop({ ...F, timeout_without_reclaim: true });
  assert.equal(held.status, 'HOLD');
  assert.equal(held.starvation.dispatched, false, 'the normal-priority job never reached a worker');
  assert.equal(held.starvation.dispatch_index, -1);
  assert.equal(held.queue_depth_after_drain, 1, 'outstanding work stays visible');
  assert.equal(held.counts.completion_replay_no_ops, 0, 'no replay was attempted on this path');

  const pass = runP0S2JobShop(F);
  assert.equal(pass.starvation.dispatched, true);
  assert.equal(pass.queue_depth_after_drain, 0);
  assert.equal(pass.counts.completion_replay_no_ops, 1);
});

test('submission order reports what was queued, not what the fixture declared', () => {
  const held = runP0S2JobShop({ ...F, cross_project_capsule: true });
  assert.equal(held.counts.jobs_submitted, 2);
  assert.equal(held.submission_order.length, 2);
  assert.equal(held.submission_order.includes(F.projects[0].job.job_id), false, 'alpha never queued');
  assert.equal(held.queue_depth_before_dispatch, 2);
});

// ------------------------------------------------------------------ capsule guards left untested

test('a capsule without a usable expiry timestamp is refused', () => {
  for (const expires of [null, undefined, '2026-08-22', 0, '2026-08-22T04:00:00Z']) {
    const result = runP0S2JobShop(withCapsule({ expires_at: expires }));
    assert.equal(result.status, 'HOLD', String(expires));
    assert.ok(
      holdCodes(result).some((code) => code === S.INVALID_FIELD_VALUE || code === S.RAW_OR_UNKNOWN_FIELD_FORBIDDEN),
      `${String(expires)} produced ${holdCodes(result).join(',')}`,
    );
    assert.equal(result.counts.capsule_bindings, 2);
  }
});

test('a capsule expiring exactly at the bind instant is refused', () => {
  const atInstant = runP0S2JobShop(withCapsule({ expires_at: '2026-08-22T03:00:00.000Z' }));
  assert.equal(atInstant.status, 'HOLD');
  assert.ok(holdCodes(atInstant).includes(S.CAPSULE_EXPIRED));

  const justAfter = runP0S2JobShop(withCapsule({ expires_at: '2026-08-22T03:00:00.001Z' }));
  assert.equal(justAfter.status, 'PASS');
  assert.equal(justAfter.counts.capsule_bindings, 3);
});

test('a Board-facing display label carrying markup, a path or a credential is refused', () => {
  const cases = [
    ['<script>alert(1)</script>', S.UNSAFE_DISPLAY_LABEL],
    ['  padded  ', S.UNSAFE_DISPLAY_LABEL],
    ['a'.repeat(200), S.UNSAFE_DISPLAY_LABEL],
    [winPath('C:', 'Users', 'user', 'plan.hwpx'), S.LOCAL_PATH_VALUE_FORBIDDEN],
    ['Bearer abcdefgh12345678', S.SECRET_VALUE_FORBIDDEN],
  ];
  for (const [label, expected] of cases) {
    const result = runP0S2JobShop(withProjectZero({
      requester: { ...F.projects[0].requester, display_label: label },
    }));
    assert.equal(result.status, 'HOLD', label);
    assert.ok(holdCodes(result).includes(expected), `${label} produced ${holdCodes(result).join(',')}`);
    assert.equal(result.board_rows.length, 0, label);
  }
});

// ----------------------------------------------------------------- HOLD-path hygiene and depth

test('a HOLD result carries no raw key, path or credential', () => {
  const hostileKey = winPath('C:', 'Users', 'user', 'OneDrive', 'secret.xlsx');
  const results = [
    runP0S2JobShop({ ...F, [hostileKey]: 1 }),
    runP0S2JobShop({ ...F, ['Bearer abcdefgh12345678']: 1 }),
    runP0S2JobShop({ ...F, transcript: 'raw chain of thought' }),
    runP0S2JobShop({ ...F, cross_project_capsule: true }),
    runP0S2JobShop({ ...F, timeout_without_reclaim: true }),
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

test('a fixture nested deeper than the scan bound fails closed', () => {
  let deep = 'leaf';
  for (let i = 0; i < 60_000; i += 1) deep = { nested: deep };
  for (const fixture of [{ ...F, host: deep }, { ...F, projects: [{ ...F.projects[0], capsule: deep }, F.projects[1], F.projects[2]] }]) {
    let result;
    assert.doesNotThrow(() => { result = runP0S2JobShop(fixture); });
    assert.equal(result.status, 'HOLD');
    assert.ok(holdCodes(result).includes(S.INPUT_TOO_DEEP));
  }
});

test('a duplicate project id is refused on its own, not by another guard', () => {
  const result = runP0S2JobShop({ ...F, projects: [
    F.projects[0],
    { ...F.projects[0], delivery_receipt_id: 'rcpt-synthetic-distinct-0001' },
    F.projects[2],
  ] });
  assert.equal(result.status, 'HOLD');
  assert.deepEqual(holdCodes(result), [S.DUPLICATE_PROJECT_ID]);
});

test('the isolation measurement refuses malformed input instead of throwing', () => {
  for (const bad of [undefined, null, 'x', 42, {}, { agents: [], runs: [], usage_events: [] }, { agents: 'x', runs: [], usage_events: [], capsule_bindings: [] }]) {
    let result;
    assert.doesNotThrow(() => { result = measureProjectIsolation(bad); }, String(bad));
    assert.equal(result.status, 'HOLD', String(bad));
    assert.equal(result.hold_code, S.INVALID_FIELD_VALUE, String(bad));
  }
  assert.equal(measureProjectIsolation(isoInput({ capsule_bindings: [{ bound_for_project_id: 'p' }] })).hold_code, S.INVALID_FIELD_VALUE);
  assert.equal(measureProjectIsolation(isoInput({ runs: ['x'] })).hold_code, S.INVALID_FIELD_VALUE);
});


// ------------------------------------------------ a validated value must be the value that stores

test('an accessor property is refused rather than validated as a moving target', () => {
  // The guard and the record builder read the input at different moments. An accessor can hand the
  // guard a clean string and the builder a payload, so accessors are refused outright.
  let reads = 0;
  const ref = {
    ref_kind: 'validation',
    get ref_value() {
      reads += 1;
      return reads > 4 ? 'RAW REQUIREMENT BODY Bearer abcdefgh12345678' : 'context://synthetic/alpha-requirements';
    },
  };
  const result = runP0S2JobShop(withCapsule({ source_refs: [ref] }));
  assert.equal(result.status, 'HOLD');
  assert.ok(holdCodes(result).includes(S.ACCESSOR_PROPERTY_FORBIDDEN));
  assert.equal(result.per_project.length, 0);

  const topLevel = runP0S2JobShop(Object.defineProperty({ ...F }, 'organization_group_id', {
    enumerable: true, get: () => 'org-synthetic-development1',
  }));
  assert.equal(topLevel.status, 'HOLD');
  assert.deepEqual(holdCodes(topLevel), [S.ACCESSOR_PROPERTY_FORBIDDEN]);
});


test('the reported privacy is the sum of the store audit and the projection audit', () => {
  const result = runP0S2JobShop(F);
  assert.deepEqual(result.privacy_sources.store, {
    raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0,
  });
  assert.deepEqual(
    result.privacy_sources.projection,
    auditProjectionPrivacy(result.per_project, result.board_rows),
    'the reported projection component must be the audit of this run projection',
  );
  for (const axis of ['raw_fields_stored', 'secret_fields_stored', 'local_path_fields_stored']) {
    assert.equal(
      result.privacy[axis],
      result.privacy_sources.store[axis] + result.privacy_sources.projection[axis],
      `${axis} must be the sum of both audits, not one of them`,
    );
  }
});

test('the projection privacy audit can see the capsule and the Board row', () => {
  const clean = runP0S2JobShop(F);
  assert.deepEqual(clean.privacy, {
    raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0,
  });

  // The audit is a function over the projection, so a deliberately bad projection must be detected.
  const bad = auditProjectionPrivacy(
    [{ capsule: { schema_version: 'x', source_refs: [{ ref_kind: 'validation', ref_value: 'Bearer abcdefgh12345678' }] } }],
    [{ display_label: fileUri('C:', 'Users', 'user', 'plan.xlsx') }],
  );
  assert.equal(bad.secret_fields_stored, 1);
  assert.equal(bad.local_path_fields_stored, 1);

  const rawKey = auditProjectionPrivacy([{ capsule: { transcript: 'RAW BODY' } }], []);
  assert.equal(rawKey.raw_fields_stored, 1);

  assert.equal(auditProjectionPrivacy('x', []).raw_fields_stored, 1);
  const sparse = [];
  sparse.length = 2;
  assert.equal(auditProjectionPrivacy(sparse, []).raw_fields_stored, 1);
});

test('the isolation measurement refuses a sparse array rather than dereferencing a hole', () => {
  const sparseBindings = [];
  sparseBindings.length = 1;
  assert.equal(
    measureProjectIsolation({ agents: [], runs: [], usage_events: [], capsule_bindings: sparseBindings }).hold_code,
    S.INVALID_FIELD_VALUE,
  );

  const trailingHole = [{ bound_for_project_id: 'p', capsule: { project_id: 'p' } }];
  trailingHole.length = 2;
  assert.equal(measureProjectIsolation(isoInput({ capsule_bindings: trailingHole })).hold_code, S.INVALID_FIELD_VALUE);

  const sparseRuns = [];
  sparseRuns.length = 1;
  assert.equal(measureProjectIsolation(isoInput({ runs: sparseRuns })).hold_code, S.INVALID_FIELD_VALUE);
});

// ------------------------------------------------------- isolation markers, not just agent counts

test('each project registers an isolated functional agent and a craftsman with its own scope', () => {
  const result = runP0S2JobShop(F);
  const kindOf = new Map(result.agent_roster.map((row) => [row.agent_id, row]));
  for (const entry of result.per_project) {
    const requester = kindOf.get(entry.agent_id);
    const craftsman = kindOf.get(entry.craftsman_agent_id);
    assert.equal(requester.agent_kind, 'project_isolated_functional');
    assert.equal(craftsman.agent_kind, 'tool_specialist_craftsman');
    for (const row of [requester, craftsman]) {
      assert.equal(row.project_id, entry.project_id);
      assert.deepEqual(row.allowed_projects, [entry.project_id],
        'an agent may only be scoped to its own project');
    }
  }
});

test('a delivery receipt carries only its own project artifact', () => {
  const result = runP0S2JobShop(F);
  for (const entry of result.per_project) {
    assert.deepEqual(entry.delivery_refs, [entry.result_ref],
      'the receipt refs must point at this project artifact, not another');
  }
  const allRefs = result.per_project.flatMap((entry) => entry.delivery_refs);
  assert.equal(new Set(allRefs).size, 3);
});

test('the job ledger rows carry the project and resource they belong to', () => {
  const result = runP0S2JobShop(F);
  for (const entry of result.per_project) {
    const row = result.job_rows.find((job) => job.job_id === entry.job_id);
    assert.equal(row.project_id, entry.project_id);
    assert.equal(row.resource_id, F.resource.resource_id);
    assert.equal(row.state, 'completed');
    assert.equal(row.recorded_completions, 1);
  }
});

test('an unsafe organization group id is refused before any row is built', () => {
  for (const bad of ['<script>', 'a'.repeat(200), 'has space']) {
    const result = runP0S2JobShop({ ...F, organization_group_id: bad });
    assert.equal(result.status, 'HOLD', bad);
    assert.ok(holdCodes(result).includes(S.INVALID_FIELD_VALUE), bad);
    assert.equal(result.board_rows.length, 0, bad);
  }
});

test('the stored capsule mirrors the fixture capsule, not a synthesized stub', () => {
  const result = runP0S2JobShop(F);
  for (const entry of result.per_project) {
    const declared = F.projects.find((p) => p.project_id === entry.project_id).capsule;
    assert.equal(entry.capsule.capsule_id, declared.capsule_id);
    assert.equal(entry.capsule.expires_at, declared.expires_at);
    assert.deepEqual(entry.capsule.source_refs, declared.source_refs.map((ref) => ({ ...ref })));
    assert.ok(entry.capsule.source_refs.length > 0);
  }
});

test('a held result still declares the zero effect boundary', () => {
  const held = runP0S2JobShop(null);
  assert.equal(held.status, 'HOLD');
  assert.deepEqual(held.declared_effect_boundary, {
    erp_world_tree_writes: 0,
    board_enrollment_writes: 0,
    result_gate_writes: 0,
    file_writes: 0,
    external_calls: 0,
    spreadsheet_app_invocations: 0,
  });
});


test('a hidden or proxied fixture field cannot reach a Board row', () => {
  const hidden = Object.defineProperty({ ...F }, 'organization_group_id', {
    value: 'sk-abcdefgh12345678', enumerable: false, configurable: true,
  });
  const hiddenResult = runP0S2JobShop(hidden);
  assert.equal(hiddenResult.status, 'HOLD');
  assert.ok(holdCodes(hiddenResult).includes(S.SECRET_VALUE_FORBIDDEN));
  assert.equal(hiddenResult.board_rows.length, 0);

  let reads = 0;
  const moving = Object.defineProperty({ ...F }, 'organization_group_id', {
    enumerable: false,
    configurable: true,
    get() { reads += 1; return reads > 1 ? 'sk-PAYLOADabcdefgh' : 'org-synthetic-development1'; },
  });
  const movingResult = runP0S2JobShop(moving);
  assert.equal(movingResult.status, 'HOLD');
  assert.ok(holdCodes(movingResult).includes(S.ACCESSOR_PROPERTY_FORBIDDEN));
  assert.equal(reads, 0);

  let gets = 0;
  const proxied = new Proxy({ ...F }, {
    get(target, key, receiver) {
      if (key === 'organization_group_id') {
        gets += 1;
        return gets > 1 ? 'sk-PROXYPAYLOAD123' : 'org-synthetic-development1';
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const proxiedResult = runP0S2JobShop(proxied);
  assert.equal(proxiedResult.status, 'PASS');
  assert.equal(gets, 0, 'the lying trap must never fire');
  for (const row of proxiedResult.board_rows) {
    assert.equal(row.organization_group_id, 'org-synthetic-development1');
  }
});

test('two projects cannot share an artifact, a work unit or a capsule id', () => {
  const cases = [
    ['artifact_ref', { artifact_ref: F.projects[0].artifact_ref }],
    ['work_unit_id', { work_unit_id: F.projects[0].work_unit_id }],
    ['capsule_id', { capsule: { ...F.projects[1].capsule, capsule_id: F.projects[0].capsule.capsule_id } }],
  ];
  for (const [field, over] of cases) {
    const result = runP0S2JobShop({
      ...F, projects: [F.projects[0], { ...F.projects[1], ...over }, F.projects[2]],
    });
    assert.equal(result.status, 'HOLD', field);
    assert.deepEqual(holdCodes(result), [S.DUPLICATE_PROJECT_IDENTIFIER], field);
    assert.equal(result.per_project.length, 0, field);
  }
});

test('an unexpected key on a project or a participant is refused', () => {
  const onProject = runP0S2JobShop({
    ...F, projects: [{ ...F.projects[0], transcript: 'raw body' }, F.projects[1], F.projects[2]],
  });
  assert.equal(onProject.status, 'HOLD');
  assert.deepEqual(holdCodes(onProject), [S.RAW_OR_UNKNOWN_FIELD_FORBIDDEN]);

  const onParticipant = runP0S2JobShop(withProjectZero({
    requester: { ...F.projects[0].requester, reasoning_content: 'chain of thought' },
  }));
  assert.equal(onParticipant.status, 'HOLD');
  assert.deepEqual(holdCodes(onParticipant), [S.RAW_OR_UNKNOWN_FIELD_FORBIDDEN]);
  assert.equal(JSON.stringify(onParticipant).includes('reasoning_content'), false);
});

test('the projection audit refuses a malformed projection instead of throwing', () => {
  for (const bad of [[null], [42], ['x']]) {
    let counters;
    assert.doesNotThrow(() => { counters = auditProjectionPrivacy(bad, []); });
    assert.equal(counters.raw_fields_stored, 1);
  }
  let rowCounters;
  assert.doesNotThrow(() => { rowCounters = auditProjectionPrivacy([], [null]); });
  assert.equal(rowCounters.raw_fields_stored, 1);
});

test('the module opens no external effect surface', () => {
  const source = readFileSync(new URL('./p0s2_job_shop.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('\u0000'), false, 'must stay plain text for grep-based validators');
  for (const forbidden of [
    'node:fs', 'node:net', 'node:http', 'node:https', 'node:child_process', 'node:dgram',
    'node:worker_threads', 'node:cluster', 'node:v8', 'node:vm',
  ]) {
    assert.equal(source.includes(forbidden), false, `must not import ${forbidden}`);
  }
  for (const pattern of [/\brequire\s*\(/u, /\bimport\s*\(/u, /\bfetch\s*\(/u, /\beval\s*\(/u, /new\s+Function\s*\(/u, /\bprocess\./u, /\bglobalThis\./u, /\bDate\.now\s*\(/u, /new\s+Date\s*\(/u]) {
    assert.equal(pattern.test(source), false, `must not use ${pattern}`);
  }
});

test('two projects that both omit a capsule are not reported as duplicate identifiers', () => {
  // `capsule?.capsule_id` is `undefined` for a project with no capsule. Comparing those two
  // absences as a collision named the wrong reason for the refusal: nothing was duplicated, a
  // field was simply missing. The duplicate scan now skips absences.
  const capsuleless = {
    ...F,
    projects: F.projects.map((project) => {
      const { capsule, ...rest } = project;
      return rest;
    }),
  };
  const result = runP0S2JobShop(capsuleless);
  const codes = result.holds.map((entry) => entry.hold_code);
  assert.equal(codes.includes(S.DUPLICATE_PROJECT_IDENTIFIER), false, JSON.stringify(result.holds));

  // A genuine collision on a present capsule id is still caught.
  const collided = {
    ...F,
    projects: F.projects.map((project, index) => (index === 0 ? project : {
      ...project,
      capsule: { ...project.capsule, capsule_id: F.projects[0].capsule.capsule_id },
    })),
  };
  const collision = runP0S2JobShop(collided);
  assert.deepEqual(collision.holds.map((entry) => entry.hold_code), [S.DUPLICATE_PROJECT_IDENTIFIER]);
  assert.equal(collision.holds[0].detail, 'capsule_id');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createObservationStore, registerAgent, observeRun, recordDirectUsage, projectStoreCounts } from '../../../../guild_hall/agent_observation/agent_observation.mjs';
import { AI_WORK_RUN_SCHEMA, AI_QUALITY_RESULT_SCHEMA, AI_TOOL_EVENT_SCHEMA } from '../../../../guild_hall/ai_usage_meter/evidence_ledger.mjs';
import { evaluateWorkIntakeCostCohort } from '../src/work_intake_cost_evaluation.mjs';

// Arithmetic frozen by non-author followup_expectations before consumer output:
// 3 works, 8 direct bills 1+2+3+1+2+4+1+2=16; tool3+infra1+active human30=50;
// A revisions r1/r2 and B r1 => 2 reviewed unique works => 25 per work.
const NOW = '2026-09-08T06:00:00.000Z', START = '2026-09-08T05:00:00.000Z';
const privacy = { metadata_only: true, raw_prompt_copied: false, raw_reasoning_copied: false, raw_tool_payload_copied: false };
const hash = (v) => `sha256:${createHash('sha256').update(v).digest('hex')}`;
function fixture({ duplicateBill = false, unknownBilling = false } = {}) {
  const observationStore = createObservationStore();
  assert.equal(registerAgent(observationStore, { agent_id: 'agent.synthetic', agent_kind: 'project_isolated_functional', functional_role: 'systems_engineering',
    project_id: 'P01', provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'thread.synthetic' }],
    authority_scope: { allowed_projects: ['P01'], allowed_actions: ['synthetic_read'] }, memory_class: 'cache_only', registered_at: START }).status, 'REGISTERED');
  const data = new Map(), workRuns = [], attempts = [];
  const definitions = [['A', 'coordination', 1], ['A', 'execution', 2], ['A', 'execution', 3], ['A', 'verification', 1],
    ['A', 'rework', 2], ['B', 'execution', 4], ['B', 'verification', 1], ['C', 'execution', 2]];
  const resultFor = { 2: ['A-result1', 'A-r1'], 4: ['A-result2', 'A-r2'], 5: ['B-result1', 'B-r1'] };
  for (const [index, [work, role, amount]] of definitions.entries()) {
    const run = `run.${index}`, event = `usage.${index}`, bill = `bill.${index}`, workRef = `workrun.${index}`;
    const started = `2026-09-08T05:${String(index).padStart(2, '0')}:00.000Z`;
    assert.equal(observeRun(observationStore, { run_id: run, parent_run_id: index === 0 ? null : 'run.0', agent_id: 'agent.synthetic',
      task_id: `task.${work}`, project_id: 'P01', work_unit_id: work, lifecycle: 'terminal', provider: 'codex', model_id: 'model.synthetic',
      reasoning_effort: 'high', authority: 'read_only', started_at: started, heartbeat_at: '2026-09-08T05:30:00.000Z',
      ended_at: '2026-09-08T05:30:00.000Z', result_state: 'result_pending', side_effect_evidence_refs: [] }).status, 'OBSERVED');
    const billRefs = [{ ref_kind: 'artifact', ref_value: bill }];
    if (duplicateBill && index === 2) billRefs.push({ ref_kind: 'artifact', ref_value: 'bill.copy' });
    assert.equal(recordDirectUsage(observationStore, { event_id: event, run_id: run, agent_id: 'agent.synthetic', provider: 'codex',
      model_id: 'model.synthetic', attribution_kind: 'direct', tokens: { input: 100, cached_input: 20, cache_write_input: 0, output: 10, reasoning_output: 2 },
      cost_basis: unknownBilling && index === 1 ? 'token_proxy' : 'billed_cost', cost_evidence_refs: unknownBilling && index === 1 ? [] : billRefs,
      observed_at: '2026-09-08T05:30:00.000Z' }).status, 'RECORDED');
    data.set(bill, { provenance: 'synthetic', kind: 'model_billing', receipt_ref: bill, provider: 'codex', provider_call_ref: `call.${index}`,
      run_id: run, usage_event_ids: [event], currency: 'USD', amount_microusd: amount * 1_000_000, measurement: 'billed', observed_at: NOW });
    if (duplicateBill && index === 2) data.set('bill.copy', { ...data.get(bill), receipt_ref: 'bill.copy' });
    data.set(workRef, { schema_version: AI_WORK_RUN_SCHEMA, event_id: workRef, run_id: run, work_id: work, run_scope: 'experiment',
      cost_role: role, variant: 'candidate', task_class: 'synthetic', risk_class: 'low', experiment_id: 'cohort.synthetic', repo_commit: '9135d5cb',
      launcher_version: 'synthetic-v1', topology: { expected_max_depth: 1, expected_max_children: 7, reviewer_policy: 'independent', preflight_policy: 'synthetic' },
      cost_scope: { controller_included: true, executor_included: true, reviewer_included: true, offline_oracle_included: false },
      work_record_ref: `work.${work}`, started_at: started, completed_at: '2026-09-08T05:30:00.000Z', model_id: 'model.synthetic',
      reasoning_effort: 'high', usage_event_ids: [event], instruction_manifest_ref: null, measurement_status: 'complete',
      authority: 'non_authoritative_measurement_projection', ...privacy });
    workRuns.push(workRef);
    attempts.push({ attempt_id: `attempt.${index}`, run_id: run, retry_of_attempt_id: index === 2 ? 'attempt.1' : null,
      status: [1, 7].includes(index) ? 'failed' : 'succeeded', result_id: resultFor[index]?.[0] ?? null,
      result_revision_ref: resultFor[index]?.[1] ?? null, result_sha256: resultFor[index] ? hash(resultFor[index][1]) : null, producer_ref: `producer.${index}` });
  }
  const reviews = [];
  for (const index of [2, 4, 5]) {
    const a = attempts[index], qref = `quality.${index}`, work = definitions[index][0];
    data.set(qref, { schema_version: AI_QUALITY_RESULT_SCHEMA, event_id: qref, result_id: a.result_id, run_id: a.run_id, work_id: work,
      evaluator_kind: 'human', metric_id: 'criterion.v1', score: 1, scale_min: 0, scale_max: 1, decision: 'pass',
      evidence_refs: [a.result_revision_ref, a.result_sha256], occurred_at: '2026-09-08T05:45:00.000Z', ...privacy });
    reviews.push({ quality_ref: qref, attempt_id: a.attempt_id, reviewer_ref: 'independent.reviewer', criterion_ref: 'criterion.v1',
      result_revision_ref: a.result_revision_ref, result_sha256: a.result_sha256 });
  }
  data.set('tool.event', { schema_version: AI_TOOL_EVENT_SCHEMA, event_id: 'tool.event', run_id: 'run.1', work_id: 'A', tool_name: 'synthetic_tool',
    tool_class: 'test', tool_call_id: 'tool.call', attempt: 1, timeout: true, retry_reason_code: 'timeout', preflight_receipt_id: null,
    phase: 'failed', occurred_at: '2026-09-08T05:25:00.000Z', duration_ms: 100, outcome: 'failed', input_digest: hash('input'), output_digest: null, ...privacy });
  data.set('expense.tool', { provenance: 'synthetic', kind: 'expense', receipt_ref: 'expense.tool', cohort_ref: 'cohort.synthetic', charge_ref: 'tool.charge',
    category: 'tool', work_id: 'A', attempt_id: 'attempt.1', tool_event_ref: 'tool.event', currency: 'USD', amount_microusd: 3_000_000, observed_at: NOW });
  data.set('expense.infra', { ...data.get('expense.tool'), receipt_ref: 'expense.infra', charge_ref: 'infra.charge', category: 'infrastructure',
    work_id: null, attempt_id: null, tool_event_ref: null, amount_microusd: 1_000_000 });
  data.set('human.active', { provenance: 'synthetic', kind: 'human_time', receipt_ref: 'human.active', cohort_ref: 'cohort.synthetic', time_entry_ref: 'time.1',
    work_id: 'A', attempt_id: 'attempt.4', review_quality_ref: 'quality.4', active_seconds: 1800, waiting_seconds: 3600,
    hourly_rate_microusd: 60_000_000, rate_ref: 'synthetic.rate', observed_at: NOW });
  const input = { provenance: 'synthetic', cohort_ref: 'cohort.synthetic', project_ref: 'P01', work_ids: ['A', 'B', 'C'], work_run_refs: workRuns, attempts,
    review_bindings: reviews, usage_selection: [{ kind: 'subtree', ref: 'run.0' }, ...definitions.map((_, i) => ({ kind: 'direct', ref: `usage.${i}` }))],
    expense_refs: ['expense.tool', 'expense.infra'], human_refs: ['human.active'], coverage_ref: 'coverage.synthetic', observed_at: NOW };
  data.set(input.coverage_ref, { provenance: 'synthetic', kind: 'cohort_coverage', receipt_ref: input.coverage_ref, cohort_ref: input.cohort_ref, project_ref: 'P01',
    work_ids: [...input.work_ids], work_run_refs: [...input.work_run_refs], expense_refs: [...input.expense_refs], human_refs: [...input.human_refs],
    model_billing_complete: true, tool_cost_complete: true, infrastructure_cost_complete: true, human_time_complete: true, observed_at: NOW });
  return { input, data, observationStore, run: () => evaluateWorkIntakeCostCohort(input, { observationStore, resolveEvidence: async (ref) => data.get(ref) ?? null }) };
}

test('frozen independent arithmetic joins all roles/failures and counts reviewed work once across revisions', async () => {
  const f = fixture(); const before = projectStoreCounts(f.observationStore); const result = await f.run();
  assert.equal(result.status, 'EVALUATED', JSON.stringify(result));
  assert.equal(result.counts.unique_work_count, 3); assert.equal(result.counts.attempts, 8);
  assert.equal(result.counts.failed_attempts, 2); assert.equal(result.counts.retry_attempts, 1);
  assert.equal(result.counts.rework_attempts, 1); assert.equal(result.counts.coordination_attempts, 1); assert.equal(result.counts.verification_attempts, 2);
  assert.equal(result.counts.passed_revision_count, 3); assert.equal(result.counts.reviewed_unique_work_count, 2);
  assert.deepEqual(result.observed_subtotals_usd, { model: 16, tool: 3, infrastructure: 1, human_active: 30, partial: 50 });
  assert.equal(result.total_cost_usd, 50); assert.equal(result.cost_per_reviewed_work_usd, 25);
  assert.deepEqual(result.role_model_cost_usd, { execution: 11, coordination: 1, verification: 2, rework: 2, other: 0 });
  assert.equal(result.active_human_minutes, 30); assert.equal(result.waiting_human_minutes, 60);
  assert.equal(result.roi, 'UNKNOWN'); assert.equal(result.actual_cost_or_roi_measured, false);
  assert.deepEqual(projectStoreCounts(f.observationStore), before);
});

test('parent subtree plus child direct, duplicate receipts/selections/reviews and retries never add twice', async () => {
  const f = fixture({ duplicateBill: true }); f.input.usage_selection.push({ kind: 'direct', ref: 'usage.2' }, { kind: 'subtree', ref: 'run.0' });
  f.input.work_run_refs.push('workrun.2'); f.input.expense_refs.push('expense.tool'); f.input.human_refs.push('human.active'); f.input.review_bindings.push(f.input.review_bindings[0]);
  const r = await f.run(); assert.equal(r.status, 'EVALUATED', JSON.stringify(r));
  assert.equal(r.counts.unique_direct_usage_events, 8); assert.equal(r.counts.unique_model_charges, 8);
  assert.equal(r.counts.reviewed_unique_work_count, 2); assert.equal(r.total_cost_usd, 50);
});

test('a conflicting second receipt for the same provider call cannot silently replace or double its charge', async () => {
  const f = fixture({ duplicateBill: true }); f.data.get('bill.copy').amount_microusd++;
  assert.ok((await f.run()).hold_codes.includes('COST_CHARGE_CONFLICT'));
});

test('zero independently reviewed works retains observed parts but total and per-work cost stay UNKNOWN', async () => {
  const f = fixture(); for (const q of f.input.review_bindings) f.data.get(q.quality_ref).decision = 'fail';
  const r = await f.run(); assert.equal(r.status, 'EVALUATED'); assert.equal(r.counts.reviewed_unique_work_count, 0);
  assert.equal(r.observed_subtotals_usd.partial, 50); assert.equal(r.total_cost_usd, 'UNKNOWN');
  assert.equal(r.cost_per_reviewed_work_usd, 'UNKNOWN'); assert.equal(r.roi, 'UNKNOWN');
});

test('missing billing, human time or explicit hourly rate preserves partial observations and UNKNOWN totals', async () => {
  for (const alter of [f => f.data.delete('bill.1'), f => f.data.delete('human.active'), f => { f.data.get('human.active').hourly_rate_microusd = null; f.data.get('human.active').rate_ref = null; }]) {
    const f = fixture(); alter(f); const r = await f.run(); assert.equal(r.status, 'EVALUATED', JSON.stringify(r));
    assert.equal(r.total_cost_usd, 'UNKNOWN'); assert.equal(r.cost_per_reviewed_work_usd, 'UNKNOWN'); assert.equal(r.roi, 'UNKNOWN');
  }
  assert.equal((await fixture({ unknownBilling: true }).run()).total_cost_usd, 'UNKNOWN');
});

test('unobserved tool/infrastructure costs and incomplete coverage cannot become zero', async () => {
  for (const alter of [f => f.data.delete('expense.tool'), f => f.data.delete('expense.infra'), f => { f.data.get('coverage.synthetic').human_time_complete = false; }]) {
    const f = fixture(); alter(f); const r = await f.run(); assert.equal(r.status, 'EVALUATED'); assert.equal(r.total_cost_usd, 'UNKNOWN');
  }
});

test('self/orphan/wrong revision/criterion reviews do not create reviewed work', async () => {
  for (const alter of [f => { f.input.review_bindings[0].reviewer_ref = 'producer.2'; },
    f => { f.input.review_bindings[0].attempt_id = 'missing'; }, f => { f.input.review_bindings[0].result_sha256 = hash('other'); },
    f => { f.input.review_bindings[0].criterion_ref = 'criterion.wrong'; }, f => { f.input.attempts[2].status = 'failed'; }]) {
    const f = fixture(); alter(f); assert.equal((await f.run()).status, 'HOLD');
  }
});

test('deterministic PASS is not independent review or human acceptance', async () => {
  const f = fixture(); for (const b of f.input.review_bindings) f.data.get(b.quality_ref).evaluator_kind = 'deterministic';
  const r = await f.run(); assert.equal(r.counts.deterministic_pass_count, 3); assert.equal(r.counts.reviewed_unique_work_count, 0);
  assert.equal(r.total_cost_usd, 'UNKNOWN');
});

test('cohort omission, usage attribution, retry lineage and evidence scope are pinned', async () => {
  for (const alter of [f => f.input.work_ids.pop(), f => f.input.attempts.pop(),
    f => { f.input.usage_selection = [{ kind: 'direct', ref: 'usage.0' }]; },
    f => { f.input.attempts[2].retry_of_attempt_id = 'attempt.5'; },
    f => { f.data.get('bill.1').run_id = 'run.2'; },
    f => { f.data.get('workrun.1').usage_event_ids = ['usage.2']; },
    f => { f.data.get('human.active').review_quality_ref = 'quality.5'; }]) {
    const f = fixture(); alter(f); assert.equal((await f.run()).status, 'HOLD');
  }
});

test('consumer refuses forged store/live input/raw evidence fields and snapshots input before awaits', async () => {
  const f = fixture(); assert.equal((await evaluateWorkIntakeCostCohort(f.input, { observationStore: {}, resolveEvidence: async r => f.data.get(r) })).status, 'HOLD');
  f.input.provenance = 'live'; assert.equal((await f.run()).status, 'HOLD'); f.input.provenance = 'synthetic';
  f.data.get('bill.1').raw_body = 'not allowed'; assert.equal((await f.run()).status, 'HOLD'); delete f.data.get('bill.1').raw_body;
  const pending = evaluateWorkIntakeCostCohort(f.input, { observationStore: f.observationStore, resolveEvidence: async r => { await Promise.resolve(); return f.data.get(r); } });
  f.input.work_ids.pop(); assert.equal((await pending).total_cost_usd, 50);
});

test('borrowing another run usage ref or omitting a failed run charge cannot fake complete coverage', async () => {
  const f = fixture(); f.data.get('workrun.7').usage_event_ids = ['usage.1'];
  f.input.usage_selection = f.input.usage_selection.filter((s) => s.kind === 'direct' && s.ref !== 'usage.7');
  assert.ok((await f.run()).hold_codes.includes('COST_RUN_USAGE_COVERAGE_MISMATCH'));
  const foreign = fixture(); foreign.input.project_ref = 'P02'; foreign.data.get('coverage.synthetic').project_ref = 'P02';
  assert.ok((await foreign.run()).hold_codes.includes('COST_OBSERVATION_RUN_UNBOUND'));
});

test('latest result failing review retires older passed revision from the unique-work denominator', async () => {
  const f = fixture(); f.data.get('quality.4').decision = 'fail';
  const r = await f.run(); assert.equal(r.status, 'EVALUATED'); assert.equal(r.counts.passed_revision_count, 2);
  assert.deepEqual(r.reviewed_work_ids, ['B']); assert.equal(r.cost_per_reviewed_work_usd, 50);
});

test('cancelled attempts cost money but no independent reviewed work; duplicate review binding cannot change reviewer', async () => {
  const f = fixture(); f.input.attempts[7].status = 'cancelled';
  const r = await f.run(); assert.equal(r.counts.cancelled_attempts, 1); assert.equal(r.total_cost_usd, 50);
  f.input.review_bindings.push({ ...f.input.review_bindings[0], reviewer_ref: 'different.reviewer' });
  assert.ok((await f.run()).hold_codes.includes('COST_REVIEW_BINDING_CONFLICT'));
});

test('resolved evidence revisions and immutable usage snapshots remain distinguishable from input reference hashes', async () => {
  const f = fixture(); const first = await f.run(); f.data.get('bill.1').amount_microusd = 1_000_000;
  const second = await f.run(); assert.equal(first.input_sha256, second.input_sha256);
  assert.notEqual(first.evidence_snapshots.find((r) => r.ref === 'bill.1').sha256, second.evidence_snapshots.find((r) => r.ref === 'bill.1').sha256);
  assert.equal(first.usage_snapshot_sha256, second.usage_snapshot_sha256);
  f.data.delete('bill.1'); const missing = await f.run();
  assert.deepEqual(missing.evidence_snapshots.find((r) => r.ref === 'bill.1'), { ref: 'bill.1', availability: 'unavailable', sha256: null });
});

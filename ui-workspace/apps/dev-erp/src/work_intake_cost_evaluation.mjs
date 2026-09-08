import { listRuns, listUsageEvents, projectUsageRollup } from '../../../../guild_hall/agent_observation/agent_observation.mjs';
import { listDescendantRunIds } from '../../../../guild_hall/agent_observation/run_observation.mjs';
import { validateAiWorkRun, validateAiQualityResult, validateAiToolEvent, evidenceDigest } from '../../../../guild_hall/ai_usage_meter/evidence_ledger.mjs';

// A read-only app-local join, not another usage ledger or billing authority.
// Only caller-provided synthetic metadata is accepted. No price lookup or writer.
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const SHA = /^sha256:[a-f0-9]{64}$/u;
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const id = (v) => typeof v === 'string' && ID.test(v);
const time = (v) => typeof v === 'string' && AT.test(v) && Number.isFinite(Date.parse(v));
const count = (v) => Number.isSafeInteger(v) && v >= 0;
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => object(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const ids = (v, unique = true) => Array.isArray(v) && v.length <= 128 && v.every(id) && (!unique || new Set(v).size === v.length);
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
const stop = (code) => { throw Object.assign(new Error(code), { code }); };
const requireValue = (ok, code) => { if (!ok) stop(code); };
const freeze = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const sum = (values) => values.reduce((n, value) => { requireValue(count(n + value), 'COST_ARITHMETIC_OVERFLOW'); return n + value; }, 0);
const usd = (v) => v / 1_000_000;
function copy(value, state = { nodes: 0, chars: 0, seen: new Set() }, depth = 0) {
  requireValue(++state.nodes <= 16000 && depth <= 12, 'COST_INPUT_BOUNDS');
  if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (typeof value === 'string') { state.chars += value.length; requireValue(state.chars <= 262144, 'COST_INPUT_BOUNDS'); return value; }
  requireValue(object(value) || Array.isArray(value), 'COST_INPUT_INVALID');
  requireValue(!state.seen.has(value) && (Array.isArray(value) || [Object.prototype, null].includes(Object.getPrototypeOf(value))), 'COST_INPUT_INVALID');
  state.seen.add(value); const result = Array.isArray(value) ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireValue(typeof key === 'string' && key !== '__proto__' && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'COST_INPUT_INVALID');
    result[key] = copy(descriptor.value, state, depth + 1);
  }
  state.seen.delete(value); return result;
}

/** Resolves immutable synthetic evidence refs, validates existing work/quality/tool
 * contracts, and reads direct usage from the existing branded Observation store.
 * Monetary/time receipt shapes below are local consumer inputs, never persisted.
 */
export async function evaluateWorkIntakeCostCohort(raw, { observationStore, resolveEvidence } = {}) {
  try {
    const input = freeze(copy(raw));
    requireValue(exact(input, ['provenance', 'cohort_ref', 'project_ref', 'work_ids', 'work_run_refs', 'attempts', 'review_bindings',
      'usage_selection', 'expense_refs', 'human_refs', 'coverage_ref', 'observed_at'])
      && input.provenance === 'synthetic' && id(input.cohort_ref) && id(input.project_ref) && ids(input.work_ids) && input.work_ids.length > 0
      && ids(input.work_run_refs, false) && input.work_run_refs.length > 0 && ids(input.expense_refs, false)
      && ids(input.human_refs, false) && id(input.coverage_ref) && time(input.observed_at)
      && [input.attempts, input.review_bindings, input.usage_selection].every((v) => Array.isArray(v) && v.length <= 128)
      && typeof resolveEvidence === 'function', 'COST_INPUT_INVALID');
    // Snapshot the genuine store before the first asynchronous evidence read.
    const usage = listUsageEvents(observationStore), runRecords = listRuns(observationStore);
    requireValue(Array.isArray(usage) && Array.isArray(runRecords), 'COST_USAGE_STORE_UNKNOWN');
    const subtreeSnapshots = new Map();
    for (const selection of input.usage_selection) {
      requireValue(exact(selection, ['kind', 'ref']) && id(selection.ref) && ['direct', 'subtree'].includes(selection.kind), 'COST_USAGE_SELECTION_INVALID');
      if (selection.kind === 'subtree') subtreeSnapshots.set(selection.ref, {
        projected: projectUsageRollup(observationStore, { run_id: selection.ref }),
        descendants: new Set([selection.ref, ...listDescendantRunIds(observationStore, selection.ref)]),
      });
    }
    const cache = new Map(), missing = new Set(), unknown = new Set();
    async function read(ref) {
      requireValue(id(ref), 'COST_EVIDENCE_REF_INVALID');
      if (cache.has(ref)) return cache.get(ref);
      let value; try { value = await resolveEvidence(ref); } catch { value = null; }
      if (value === null || value === undefined) { missing.add(ref); cache.set(ref, null); return null; }
      const snapshot = freeze(copy(value)); cache.set(ref, snapshot); return snapshot;
    }
    function syntheticEvidence(value, kind, ref, fields) {
      requireValue(exact(value, ['provenance', 'kind', 'receipt_ref', ...fields]) && value.provenance === 'synthetic'
        && value.kind === kind && value.receipt_ref === ref && time(value.observed_at)
        && value.observed_at <= input.observed_at, 'COST_EVIDENCE_INVALID');
    }
    const coverage = await read(input.coverage_ref);
    requireValue(coverage, 'COST_COHORT_COVERAGE_UNAVAILABLE');
    syntheticEvidence(coverage, 'cohort_coverage', input.coverage_ref, ['cohort_ref', 'project_ref', 'work_ids', 'work_run_refs',
      'expense_refs', 'human_refs', 'model_billing_complete', 'tool_cost_complete', 'infrastructure_cost_complete', 'human_time_complete', 'observed_at']);
    requireValue(coverage.cohort_ref === input.cohort_ref && coverage.project_ref === input.project_ref && ids(coverage.work_ids) && ids(coverage.work_run_refs)
      && ids(coverage.expense_refs) && ids(coverage.human_refs)
      && sameSet(coverage.work_ids, input.work_ids) && sameSet(coverage.work_run_refs, [...new Set(input.work_run_refs)])
      && sameSet(coverage.expense_refs, [...new Set(input.expense_refs)]) && sameSet(coverage.human_refs, [...new Set(input.human_refs)]), 'COST_COHORT_COVERAGE_MISMATCH');
    for (const key of ['model_billing_complete', 'tool_cost_complete', 'infrastructure_cost_complete', 'human_time_complete']) {
      requireValue(typeof coverage[key] === 'boolean', 'COST_COHORT_COVERAGE_INVALID');
      if (!coverage[key]) unknown.add(key.toUpperCase());
    }
    const workRuns = new Map();
    for (const ref of new Set(input.work_run_refs)) {
      const event = await read(ref); requireValue(event, 'COST_WORK_EVIDENCE_UNAVAILABLE'); validateAiWorkRun(event);
      requireValue(event.event_id === ref && event.run_scope === 'experiment' && input.work_ids.includes(event.work_id)
        && event.started_at <= input.observed_at && (event.completed_at === null || event.completed_at <= input.observed_at), 'COST_WORK_EVIDENCE_UNBOUND');
      requireValue(!workRuns.has(event.run_id), 'COST_DUPLICATE_RUN_BINDING');
      const observed = runRecords.find((r) => r.run_id === event.run_id);
      requireValue(observed && observed.model_id === event.model_id && observed.work_unit_id === event.work_id
        && observed.project_id === input.project_ref, 'COST_OBSERVATION_RUN_UNBOUND');
      if (event.measurement_status !== 'complete') unknown.add('WORK_MEASUREMENT_INCOMPLETE');
      workRuns.set(event.run_id, event);
    }
    requireValue(input.work_ids.every((work) => [...workRuns.values()].some((run) => run.work_id === work)), 'COST_WORK_ATTEMPTS_MISSING');
    const attempts = new Map(), byRun = new Map();
    for (const a of input.attempts) {
      requireValue(exact(a, ['attempt_id', 'run_id', 'retry_of_attempt_id', 'status', 'result_id', 'result_revision_ref', 'result_sha256', 'producer_ref'])
        && id(a.attempt_id) && id(a.run_id) && workRuns.has(a.run_id) && id(a.producer_ref)
        && (a.retry_of_attempt_id === null || id(a.retry_of_attempt_id)) && ['succeeded', 'failed', 'cancelled', 'unknown'].includes(a.status)
        && !attempts.has(a.attempt_id) && !byRun.has(a.run_id), 'COST_ATTEMPT_INVALID');
      const hasResult = a.result_id !== null;
      requireValue(hasResult ? id(a.result_id) && id(a.result_revision_ref) && SHA.test(a.result_sha256)
        : a.result_revision_ref === null && a.result_sha256 === null, 'COST_RESULT_REVISION_INVALID');
      attempts.set(a.attempt_id, a); byRun.set(a.run_id, a);
    }
    requireValue(byRun.size === workRuns.size, 'COST_ATTEMPT_COVERAGE_MISMATCH');
    for (const a of attempts.values()) {
      const seen = new Set([a.attempt_id]); let current = a;
      while (current.retry_of_attempt_id !== null) {
        const previous = attempts.get(current.retry_of_attempt_id);
        requireValue(previous && !seen.has(previous.attempt_id) && workRuns.get(previous.run_id).work_id === workRuns.get(a.run_id).work_id
          && workRuns.get(previous.run_id).started_at <= workRuns.get(current.run_id).started_at, 'COST_RETRY_LINEAGE_INVALID');
        seen.add(previous.attempt_id); current = previous;
      }
    }
    const selected = new Set(), projectionRefs = [];
    for (const selection of input.usage_selection) {
      requireValue(exact(selection, ['kind', 'ref']) && id(selection.ref) && ['direct', 'subtree'].includes(selection.kind), 'COST_USAGE_SELECTION_INVALID');
      if (selection.kind === 'direct') {
        requireValue(usage.some((u) => u.event_id === selection.ref), 'COST_USAGE_REF_UNKNOWN'); selected.add(selection.ref);
      } else {
        requireValue(workRuns.has(selection.ref), 'COST_SUBTREE_ROOT_UNBOUND');
        const { projected, descendants } = subtreeSnapshots.get(selection.ref);
        requireValue(projected.status === 'PROJECTED', 'COST_SUBTREE_UNAVAILABLE');
        for (const u of usage) if (descendants.has(u.run_id)) selected.add(u.event_id);
        projectionRefs.push(selection.ref); // Informational: never add rollup totals.
      }
    }
    const declaredUsage = [...new Set([...workRuns.values()].flatMap((r) => r.usage_event_ids))];
    requireValue(sameSet([...selected], declaredUsage), 'COST_USAGE_COVERAGE_MISMATCH');
    requireValue([...workRuns.values()].every((r) => r.usage_event_ids.every((ref) => usage.some((u) => u.event_id === ref && u.run_id === r.run_id)))
      && usage.filter((u) => workRuns.has(u.run_id)).every((u) => selected.has(u.event_id)), 'COST_RUN_USAGE_COVERAGE_MISMATCH');
    const direct = usage.filter((u) => selected.has(u.event_id));
    requireValue(direct.every((u) => u.attribution_kind === 'direct' && workRuns.has(u.run_id)
      && workRuns.get(u.run_id).usage_event_ids.includes(u.event_id) && u.observed_at <= input.observed_at), 'COST_DIRECT_USAGE_UNBOUND');
    const charges = new Map(), billedUsage = new Set();
    function charge(key, value) {
      const old = charges.get(key);
      requireValue(!old || evidenceDigest(old.binding) === evidenceDigest(value.binding), 'COST_CHARGE_CONFLICT');
      if (!old) charges.set(key, value);
    }
    for (const u of direct) {
      if (u.cost_basis !== 'billed_cost') { unknown.add('MODEL_BILLING_UNOBSERVED'); continue; }
      for (const evidenceRef of u.cost_evidence_refs) {
        const ref = evidenceRef.ref_value; const bill = await read(ref);
        if (!bill) { unknown.add('MODEL_BILLING_UNOBSERVED'); continue; }
        syntheticEvidence(bill, 'model_billing', ref, ['provider', 'provider_call_ref', 'run_id', 'usage_event_ids', 'currency', 'amount_microusd', 'measurement', 'observed_at']);
        requireValue(bill.provider === u.provider && id(bill.provider_call_ref) && bill.run_id === u.run_id && ids(bill.usage_event_ids)
          && bill.usage_event_ids.includes(u.event_id) && bill.usage_event_ids.every((x) => selected.has(x)
            && direct.some((record) => record.event_id === x && record.run_id === bill.run_id && record.provider === bill.provider
              && record.cost_evidence_refs.some((e) => e.ref_value === ref)))
          && bill.currency === 'USD' && count(bill.amount_microusd) && bill.measurement === 'billed', 'COST_BILLING_UNBOUND');
        const workRun = workRuns.get(u.run_id);
        charge(`model:${bill.provider}:${bill.provider_call_ref}`, { category: 'model', role: workRun.cost_role, amount: bill.amount_microusd,
          binding: { provider: bill.provider, call: bill.provider_call_ref, run: bill.run_id, amount: bill.amount_microusd,
            usage: [...bill.usage_event_ids].sort() } });
        billedUsage.add(u.event_id);
      }
    }
    if (direct.some((u) => !billedUsage.has(u.event_id)) || [...workRuns.values()].some((r) => r.usage_event_ids.length === 0)) unknown.add('MODEL_BILLING_UNOBSERVED');
    for (const ref of input.expense_refs) {
      const expense = await read(ref);
      if (!expense) { unknown.add('EXPENSE_UNOBSERVED'); continue; }
      syntheticEvidence(expense, 'expense', ref, ['cohort_ref', 'charge_ref', 'category', 'work_id', 'attempt_id', 'tool_event_ref', 'currency', 'amount_microusd', 'observed_at']);
      requireValue(expense.cohort_ref === input.cohort_ref && id(expense.charge_ref) && ['tool', 'infrastructure'].includes(expense.category)
        && (expense.work_id === null || input.work_ids.includes(expense.work_id)) && expense.currency === 'USD' && count(expense.amount_microusd)
        && (expense.attempt_id === null || (attempts.has(expense.attempt_id) && workRuns.get(attempts.get(expense.attempt_id).run_id).work_id === expense.work_id)), 'COST_EXPENSE_UNBOUND');
      if (expense.category === 'tool') {
        requireValue(id(expense.tool_event_ref) && attempts.has(expense.attempt_id), 'COST_TOOL_REF_REQUIRED');
        const tool = await read(expense.tool_event_ref); requireValue(tool, 'COST_TOOL_EVIDENCE_UNAVAILABLE'); validateAiToolEvent(tool);
        requireValue(tool.event_id === expense.tool_event_ref && tool.run_id === attempts.get(expense.attempt_id).run_id
          && tool.work_id === expense.work_id, 'COST_TOOL_EVIDENCE_UNBOUND');
      } else requireValue(expense.tool_event_ref === null, 'COST_INFRA_TOOL_REF_FORBIDDEN');
      charge(`${expense.category}:${expense.charge_ref}`, { category: expense.category, amount: expense.amount_microusd,
        binding: { category: expense.category, charge: expense.charge_ref, work: expense.work_id, attempt: expense.attempt_id, amount: expense.amount_microusd } });
    }
    const reviewed = new Map(), reviewIds = new Set(), reviewAttempts = new Map(), reviewDigests = new Map(); let deterministicPasses = 0;
    for (const binding of input.review_bindings) {
      requireValue(exact(binding, ['quality_ref', 'attempt_id', 'reviewer_ref', 'criterion_ref', 'result_revision_ref', 'result_sha256'])
        && id(binding.quality_ref) && attempts.has(binding.attempt_id) && id(binding.reviewer_ref) && id(binding.criterion_ref), 'COST_REVIEW_BINDING_INVALID');
      const attempt = attempts.get(binding.attempt_id), run = workRuns.get(attempt.run_id);
      const quality = await read(binding.quality_ref); requireValue(quality, 'COST_QUALITY_EVIDENCE_UNAVAILABLE'); validateAiQualityResult(quality);
      requireValue(quality.event_id === binding.quality_ref && quality.run_id === run.run_id && quality.work_id === run.work_id
        && quality.result_id === attempt.result_id && binding.result_revision_ref === attempt.result_revision_ref
        && binding.result_sha256 === attempt.result_sha256 && quality.metric_id === binding.criterion_ref
        && quality.evidence_refs.includes(binding.result_revision_ref) && quality.evidence_refs.includes(binding.result_sha256)
        && (quality.decision !== 'pass' || attempt.status === 'succeeded') && run.completed_at !== null
        && quality.occurred_at >= run.completed_at && quality.occurred_at <= input.observed_at, 'COST_QUALITY_REVISION_UNBOUND');
      const bindingDigest = evidenceDigest(binding);
      requireValue(!reviewDigests.has(quality.event_id) || reviewDigests.get(quality.event_id) === bindingDigest, 'COST_REVIEW_BINDING_CONFLICT');
      reviewDigests.set(quality.event_id, bindingDigest);
      if (quality.evaluator_kind !== 'deterministic') requireValue(binding.reviewer_ref !== attempt.producer_ref, 'COST_REVIEW_NOT_INDEPENDENT');
      if (reviewIds.has(quality.event_id)) continue;
      reviewIds.add(quality.event_id);
      reviewAttempts.set(quality.event_id, attempt.attempt_id);
      if (quality.evaluator_kind === 'deterministic') { if (quality.decision === 'pass') deterministicPasses++; continue; }
      const key = `${run.work_id}:${attempt.result_revision_ref}`;
      const previous = reviewed.get(key);
      requireValue(!previous || (previous.hash === attempt.result_sha256 && previous.result === attempt.result_id), 'COST_RESULT_REVISION_CONFLICT');
      if (previous && previous.at === quality.occurred_at) requireValue(previous.decision === quality.decision, 'COST_REVIEW_CONFLICT');
      if (!previous || previous.at <= quality.occurred_at) reviewed.set(key, { work: run.work_id, result: attempt.result_id,
        revision: attempt.result_revision_ref, hash: attempt.result_sha256, decision: quality.decision, at: quality.occurred_at });
    }
    const timeEntries = new Map();
    for (const ref of input.human_refs) {
      const entry = await read(ref); if (!entry) { unknown.add('HUMAN_TIME_UNOBSERVED'); continue; }
      syntheticEvidence(entry, 'human_time', ref, ['cohort_ref', 'time_entry_ref', 'work_id', 'attempt_id', 'review_quality_ref',
        'active_seconds', 'waiting_seconds', 'hourly_rate_microusd', 'rate_ref', 'observed_at']);
      requireValue(entry.cohort_ref === input.cohort_ref && id(entry.time_entry_ref) && input.work_ids.includes(entry.work_id)
        && attempts.has(entry.attempt_id) && workRuns.get(attempts.get(entry.attempt_id).run_id).work_id === entry.work_id
        && (entry.review_quality_ref === null || reviewAttempts.get(entry.review_quality_ref) === entry.attempt_id) && count(entry.active_seconds) && count(entry.waiting_seconds)
        && (entry.hourly_rate_microusd === null ? entry.rate_ref === null : count(entry.hourly_rate_microusd) && id(entry.rate_ref)), 'COST_HUMAN_TIME_UNBOUND');
      const { receipt_ref, observed_at, ...natural } = entry;
      const previous = timeEntries.get(entry.time_entry_ref);
      requireValue(!previous || evidenceDigest(previous.natural) === evidenceDigest(natural), 'COST_HUMAN_TIME_CONFLICT');
      if (!previous) timeEntries.set(entry.time_entry_ref, { entry, natural });
      if (entry.hourly_rate_microusd === null) unknown.add('HUMAN_RATE_UNOBSERVED');
    }
    const passedRevisions = [...reviewed.values()].filter((r) => r.decision === 'pass');
    const latestResults = new Map();
    for (const a of attempts.values()) if (a.result_id !== null) {
      const run = workRuns.get(a.run_id), previous = latestResults.get(run.work_id);
      requireValue(!previous || previous.started_at !== run.started_at
        || (previous.revision === a.result_revision_ref && previous.hash === a.result_sha256), 'COST_LATEST_RESULT_AMBIGUOUS');
      if (!previous || previous.started_at <= run.started_at) latestResults.set(run.work_id,
        { revision: a.result_revision_ref, hash: a.result_sha256, started_at: run.started_at });
    }
    const passedWorks = [...new Set(passedRevisions.filter((r) => latestResults.get(r.work)?.revision === r.revision
      && latestResults.get(r.work)?.hash === r.hash).map((r) => r.work))].sort();
    if (passedWorks.length === 0) unknown.add('ZERO_REVIEWED_WORKS');
    if (timeEntries.size === 0) unknown.add('HUMAN_TIME_UNOBSERVED');
    if (![...charges.values()].some((c) => c.category === 'tool')) unknown.add('TOOL_COST_UNOBSERVED');
    if (![...charges.values()].some((c) => c.category === 'infrastructure')) unknown.add('INFRASTRUCTURE_COST_UNOBSERVED');
    const model = sum([...charges.values()].filter((c) => c.category === 'model').map((c) => c.amount));
    const tool = sum([...charges.values()].filter((c) => c.category === 'tool').map((c) => c.amount));
    const infrastructure = sum([...charges.values()].filter((c) => c.category === 'infrastructure').map((c) => c.amount));
    const human = sum([...timeEntries.values()].filter(({ entry }) => entry.hourly_rate_microusd !== null).map(({ entry }) => {
      requireValue(count(entry.active_seconds * entry.hourly_rate_microusd), 'COST_ARITHMETIC_OVERFLOW');
      return Math.round(entry.active_seconds * entry.hourly_rate_microusd / 3600);
    }));
    const partial = sum([model, tool, infrastructure, human]);
    const counts = { unique_work_count: input.work_ids.length, attempts: attempts.size,
      failed_attempts: [...attempts.values()].filter((a) => a.status === 'failed').length,
      cancelled_attempts: [...attempts.values()].filter((a) => a.status === 'cancelled').length,
      unknown_attempts: [...attempts.values()].filter((a) => a.status === 'unknown').length,
      retry_attempts: [...attempts.values()].filter((a) => a.retry_of_attempt_id !== null).length,
      rework_attempts: [...workRuns.values()].filter((r) => r.cost_role === 'rework').length,
      coordination_attempts: [...workRuns.values()].filter((r) => r.cost_role === 'coordination').length,
      verification_attempts: [...workRuns.values()].filter((r) => r.cost_role === 'verification').length,
      reviewed_unique_work_count: passedWorks.length, passed_revision_count: passedRevisions.length,
      deterministic_pass_count: deterministicPasses, unique_direct_usage_events: direct.length,
      unique_model_charges: [...charges.values()].filter((c) => c.category === 'model').length };
    return freeze({ status: 'EVALUATED', provenance: 'synthetic', claim: 'cost_join_rehearsal_only', actual_cost_or_roi_measured: false,
      cohort_ref: input.cohort_ref, input_sha256: evidenceDigest(input), counts, reviewed_work_ids: passedWorks,
      role_model_cost_usd: Object.fromEntries(['execution', 'coordination', 'verification', 'rework', 'other'].map((role) => [role,
        usd(sum([...charges.values()].filter((c) => c.category === 'model' && c.role === role).map((c) => c.amount)))])),
      observed_subtotals_usd: { model: usd(model), tool: usd(tool), infrastructure: usd(infrastructure), human_active: usd(human), partial: usd(partial) },
      active_human_minutes: sum([...timeEntries.values()].map(({ entry }) => entry.active_seconds)) / 60,
      waiting_human_minutes: sum([...timeEntries.values()].map(({ entry }) => entry.waiting_seconds)) / 60,
      total_cost_usd: unknown.size ? 'UNKNOWN' : usd(partial),
      cost_per_reviewed_work_usd: unknown.size ? 'UNKNOWN' : usd(partial) / passedWorks.length,
      roi: 'UNKNOWN', roi_reason: 'BENEFIT_AND_ACTUAL_USE_UNOBSERVED',
      unknown_reasons: [...unknown].sort(), missing_evidence_refs: [...missing].sort(),
      consumed_evidence_refs: [...cache.keys()].sort(), direct_usage_refs: direct.map((u) => u.event_id).sort(),
      evidence_snapshots: [...cache.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ref, value]) => ({ ref,
        availability: value === null ? 'unavailable' : 'read', sha256: value === null ? null : evidenceDigest(value) })),
      usage_snapshot_sha256: evidenceDigest(direct),
      run_snapshot_sha256: evidenceDigest(runRecords.filter((r) => workRuns.has(r.run_id))),
      informational_subtree_refs: [...new Set(projectionRefs)].sort(), external_effects: 0 });
  } catch (error) {
    return freeze({ status: 'HOLD', provenance: 'synthetic', hold_codes: [error?.code?.startsWith('COST_') ? error.code : 'COST_SOURCE_OR_INPUT_INVALID'], report: null });
  }
}

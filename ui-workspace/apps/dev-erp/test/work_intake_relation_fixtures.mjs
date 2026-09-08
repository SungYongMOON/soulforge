import { createHash } from 'node:crypto';
import { hashWorkIntakeFacts } from '../src/work_intake_adapter.mjs';
import { syntheticInput, scriptedJudge } from './work_intake_test_helpers.mjs';

// Independent synthetic expectations, frozen before follow-up implementation
// outputs. This is test data and an answer control, never a semantic judge.
export function canonicalFixtureBytes(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalFixtureBytes).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalFixtureBytes(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const hashFixtureValue = (value) => createHash('sha256')
  .update(canonicalFixtureBytes(value), 'utf8').digest('hex');
const hashBytes = (bytes) => createHash('sha256').update(bytes, 'utf8').digest('hex');
const TASK_MEANING = hashFixtureValue('Synthetic goal: draft a review checklist.');
const ACTION_MEANING = hashFixtureValue('Synthetic action: prepare the review checklist draft.');
const FROZEN_AT = '2026-09-08T04:57:36.000Z';
const SPECIFICATION = {
  revision: 'work-intake-relations-v1', frozen_at: FROZEN_AT,
  author_ref: 'fixture:independent-expectations',
  observation_window: { start: '2026-09-08T05:00:00.000Z', end: '2026-09-08T06:00:00.000Z' },
  event_observed_at: '2026-09-08T05:55:00.000Z',
  cases: [
    { id: 'paraphrase', before: 'Please draft a review checklist.',
      after: 'Prepare a draft checklist for the review, please.',
      before_task: null, after_task: null, expected: ['NEW', 'NEW'], relation: 'PRESERVE' },
    { id: 'withdrawal', before: 'Please draft a review checklist.',
      after: 'I withdraw my earlier request. Do not draft the review checklist; no action is needed.',
      before_task: null, after_task: null, expected: ['NEW', 'NO_ACTION'], relation: 'CHANGE' },
    { id: 'task_context', before: 'Please draft a review checklist.',
      after: 'Please draft a review checklist.', before_task: null, after_task: 'open',
      expected: ['NEW', 'FOLLOW_UP'], relation: 'CHANGE' },
  ],
  completed_observation: { expected: ['NEW', 'NO_ACTION'], relation: 'CHANGE', task_status: 'completed' },
};
export const fixtureRevisionCanonicalBytes = canonicalFixtureBytes(SPECIFICATION);
export const fixtureRevisionSha256 = hashBytes(fixtureRevisionCanonicalBytes);

function freeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function makeInput(id, side, text, taskStatus, revision) {
  const input = syntheticInput(`run:${id}:${side}`);
  input.window = { ...SPECIFICATION.observation_window };
  input.observed_at = input.window.end;
  for (const read of input.source_reads) {
    read.window = { ...input.window };
    read.observed_at = input.observed_at;
  }
  input.linear_view.as_of = input.observed_at;
  const event = input.events[0];
  event.occurred_at = SPECIFICATION.event_observed_at;
  event.observed_at = event.occurred_at;
  event.event_ref = `event:${id}`;
  event.revision_ref = `ev:${id}:${revision}`;
  event.project_binding_ref = `ev:${id}:binding`;
  event.facts = [{ fact_ref: `ev:${id}:fact`, text }];
  event.facts_sha256 = hashWorkIntakeFacts(event.facts);
  event.evidence_refs = [event.revision_ref, event.project_binding_ref, event.facts[0].fact_ref];
  const sourceRevisionCanonicalBytes = canonicalFixtureBytes({ source: event.source,
    scope_ref: event.scope_ref, event_ref: event.event_ref, revision_ref: event.revision_ref,
    project_ref: event.project_ref, facts: event.facts });
  event.revision_sha256 = hashBytes(sourceRevisionCanonicalBytes);
  if (taskStatus !== null) {
    input.source_reads.find((read) => read.source === 'linear').status = 'read';
    input.linear_view.tasks = [{ task_ref: 'linear:checklist', project_ref: input.project_ref,
      status: taskStatus, task_semantic_sha256: TASK_MEANING,
      evidence_refs: [`linear:checklist:${taskStatus}:revision`] }];
  }
  return { input, sourceRevisionCanonicalBytes };
}

function correctAnswer(input, classification) {
  return freeze({ classification,
    reason_code: { NEW: 'NEW_REQUEST', FOLLOW_UP: 'EXISTING_TASK',
      NO_ACTION: input.linear_view.tasks.length ? 'ALREADY_COMPLETED' : 'NO_NEW_REQUEST' }[classification],
    matched_task_ref: input.linear_view.tasks[0]?.task_ref ?? null,
    task_semantic_sha256: TASK_MEANING,
    action_semantic_sha256: classification === 'NO_ACTION' ? null : ACTION_MEANING,
    evidence_refs: [...input.events[0].evidence_refs,
      ...input.linear_view.tasks.flatMap((task) => task.evidence_refs)],
  });
}

function assemble(spec, afterTask = spec.after_task, suffix = '') {
  const id = `${spec.id}${suffix}`;
  const before = makeInput(spec.id, 'before', spec.before, spec.before_task, 'v1');
  const after = makeInput(spec.id, `after${suffix}`, spec.after, afterTask,
    spec.before === spec.after ? 'v1' : 'v2');
  const expected = suffix ? SPECIFICATION.completed_observation.expected : spec.expected;
  const event = before.input.events[0];
  const contract = freeze({ contract_ref: `fixture:${id}:v1`, pair_id: id,
    provenance: { kind: 'independent_synthetic_fixture', author_ref: SPECIFICATION.author_ref,
      producer_author_ref: 'implementation:relation-evaluator', frozen_at: FROZEN_AT },
    fixture_revision_sha256: fixtureRevisionSha256,
    before_input_sha256: hashFixtureValue(before.input), after_input_sha256: hashFixtureValue(after.input),
    expected_before: expected[0], expected_after: expected[1], relation: spec.relation,
    semantic_relation: { task: 'SAME', action: expected[1] === 'NO_ACTION' ? 'DIFFERENT' : 'SAME' },
    changed_dimensions: ['run_id', ...(spec.before !== spec.after ? ['event_revision', 'event_facts'] : []),
      ...(afterTask !== null ? ['linear_tasks', 'source_reads'] : [])],
    invariant_pins: { project_ref: before.input.project_ref,
      event_identity: { source: event.source, scope_ref: event.scope_ref, event_ref: event.event_ref },
      window: { ...before.input.window }, observed_at: before.input.observed_at,
      permission_refs: [...before.input.permission_refs],
      ...(spec.before === spec.after ? { event_revision_sha256: event.revision_sha256,
        event_facts_sha256: event.facts_sha256 } : {}) },
  });
  return { id, beforeInput: before.input, afterInput: after.input, contract,
    contract_sha256: hashFixtureValue(contract),
    sourceRevisionCanonicalBytes: { before: before.sourceRevisionCanonicalBytes, after: after.sourceRevisionCanonicalBytes },
    correctAnswers: { before: correctAnswer(before.input, expected[0]), after: correctAnswer(after.input, expected[1]) } };
}

export function workIntakeRelationFixtures() {
  return SPECIFICATION.cases.map((spec) => {
    const pair = assemble(spec);
    if (spec.id === 'task_context') pair.completedObservation = assemble(spec, 'completed', '_completed');
    return pair;
  });
}

// The input provider never receives this table. Only tests explicitly select an
// answer control. The receipt is synthetic and bound to the adapter request.
export function correctScriptedJudge(answer) {
  return scriptedJudge(answer);
}

export const constantNewScriptedJudge = () => scriptedJudge();
export function missingEvidenceScriptedJudge(answer) {
  return scriptedJudge({ ...answer, evidence_refs: [] });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  computeRequirementCoverage,
  requirementKeyFromRef,
  RequirementCoverageError,
  REQUIREMENT_COVERAGE_SCHEMA_VERSION,
  ERROR_CODES,
} from './requirement_coverage.mjs';

const FIXTURE_URL = new URL(
  '../../docs/architecture/workspace/examples/project_requirement_trace/requirement_coverage_synthetic_v0.json',
  import.meta.url,
);
const FIXTURE = JSON.parse(readFileSync(FIXTURE_URL, 'utf8'));

const fixtureInput = () => structuredClone(FIXTURE.input);
const cellOf = (result, requirementId, artifactTypeId, relation) => result.cells.find(
  (cell) => cell.requirement_id === requirementId
    && cell.needed_artifact_type_id === artifactTypeId
    && cell.needed_relation === relation,
);
const stateOf = (result, requirementId) => result.requirement_states
  .find((row) => row.requirement_id === requirementId)?.state;
const readinessOf = (result, stageCode) => result.stage_readiness
  .find((row) => row.stage_code === stageCode);

// ---------------------------------------------------------------- fixture conformance

test('the synthetic fixture produces exactly the hand derived projection', () => {
  const result = computeRequirementCoverage(fixtureInput());

  assert.equal(result.schema_version, REQUIREMENT_COVERAGE_SCHEMA_VERSION);
  assert.deepEqual(result.counts, FIXTURE.expected.counts);
  assert.deepEqual(result.receipt.replayed_row_counts, FIXTURE.expected.replayed_row_counts);
  assert.deepEqual(result.receipt.input_row_counts, {
    requirements: FIXTURE.input.requirements.length,
    needs: FIXTURE.input.needs.length,
    observations: FIXTURE.input.observations.length,
    risks: FIXTURE.input.risks.length,
    stages: FIXTURE.input.stages.length,
  });

  for (const expected of FIXTURE.expected.requirement_states) {
    assert.equal(stateOf(result, expected.requirement_id), expected.state,
      `requirement state for ${expected.requirement_id}`);
  }
  assert.equal(result.requirement_states.length, FIXTURE.expected.requirement_states.length);

  assert.equal(result.cells.length, FIXTURE.expected.cells.length);
  for (const expected of FIXTURE.expected.cells) {
    const cell = cellOf(result, expected.requirement_id, expected.needed_artifact_type_id, expected.needed_relation);
    assert.ok(cell, `cell for ${expected.requirement_id}`);
    assert.equal(cell.state, expected.state, `cell state for ${expected.requirement_id}`);
    assert.equal(cell.reason, expected.reason, `cell reason for ${expected.requirement_id}`);
    assert.deepEqual(cell.observation_ids, expected.observation_ids);
    assert.match(cell.cell_id, /^[0-9a-f]{64}$/u);
  }

  for (const expected of FIXTURE.expected.stage_readiness) {
    const readiness = readinessOf(result, expected.stage_code);
    assert.ok(readiness, `readiness for ${expected.stage_code}`);
    for (const [field, value] of Object.entries(expected)) {
      assert.deepEqual(readiness[field], value, `${expected.stage_code}.${field}`);
    }
  }

  // A cell identity may not depend on a clock, a path, or a physical ledger ref (section 5.3
  // step 2), so two cells of the same requirement differ only through the declared need.
  assert.equal(new Set(result.cells.map((cell) => cell.cell_id)).size, result.cells.length);
});

// ---------------------------------------------------------------- 1. determinism

test('the same input twice produces the same digests, and input order does not reach the projection', () => {
  const first = computeRequirementCoverage(fixtureInput());
  const second = computeRequirementCoverage(fixtureInput());

  assert.equal(first.receipt.input_digest_sha256, second.receipt.input_digest_sha256);
  assert.equal(first.receipt.output_digest_sha256, second.receipt.output_digest_sha256);
  assert.match(first.receipt.input_digest_sha256, /^[0-9a-f]{64}$/u);
  assert.match(first.receipt.output_digest_sha256, /^[0-9a-f]{64}$/u);
  assert.notEqual(first.receipt.input_digest_sha256, first.receipt.output_digest_sha256);
  assert.equal(JSON.stringify(first), JSON.stringify(second));

  // The receipt binds the input as supplied, so reordering the supplied rows changes the
  // input digest. It must not change the projection: the coverage answer is a function of
  // the rows, not of the order they arrived in.
  const reordered = fixtureInput();
  reordered.requirements.reverse();
  reordered.needs.reverse();
  reordered.observations.reverse();
  const shuffled = computeRequirementCoverage(reordered);
  assert.notEqual(shuffled.receipt.input_digest_sha256, first.receipt.input_digest_sha256);
  assert.equal(shuffled.receipt.output_digest_sha256, first.receipt.output_digest_sha256);

  assert.equal(first.receipt.deterministic, true);
  assert.equal(first.receipt.claim_ceiling, 'observed');
  for (const [name, value] of Object.entries(first.receipt.effects)) {
    assert.equal(value, 0, `effect ${name} must be zero`);
  }
});

// ---------------------------------------------------------------- 2. bitemporal replay

test('a correction learned later does not leak into a query at an earlier known_at', () => {
  const base = computeRequirementCoverage(fixtureInput());

  // obs-006 confirmed the absence of req-beta-three's design document. A later attempt
  // finds it after all and supersedes that record — but only becomes known in September.
  const corrected = fixtureInput();
  const absence = corrected.observations.find((row) => row.observation_id === 'obs-006');
  corrected.observations.push({
    ...structuredClone(absence),
    observation_id: 'obs-008',
    presence_state: 'present',
    observation_attempt_ref: 'attempt-obs-008',
    supersedes_ref: 'obs-006',
    known_at: '2026-09-01T00:00:00.000Z',
  });

  const asOfAugust = computeRequirementCoverage(corrected);
  assert.equal(stateOf(asOfAugust, 'req-beta-three'), 'gap_missing');
  assert.equal(cellOf(asOfAugust, 'req-beta-three', 'design_document', 'covers').reason, 'absence_confirmed');
  assert.equal(asOfAugust.receipt.replayed_row_counts.observations, 7);
  // The September row is present in the input but outside the cutoff, so the input digest
  // moves and the projection does not.
  assert.notEqual(asOfAugust.receipt.input_digest_sha256, base.receipt.input_digest_sha256);
  assert.equal(asOfAugust.receipt.output_digest_sha256, base.receipt.output_digest_sha256);

  const asOfOctober = computeRequirementCoverage({
    ...corrected,
    cutoffs: { valid_at: '2026-10-01T00:00:00.000Z', known_at: '2026-10-01T00:00:00.000Z' },
  });
  assert.equal(stateOf(asOfOctober, 'req-beta-three'), 'satisfied');
  assert.deepEqual(cellOf(asOfOctober, 'req-beta-three', 'design_document', 'covers').observation_ids, ['obs-008']);
  // Only the tail of the supersession chain survives the replay.
  assert.equal(asOfOctober.receipt.replayed_row_counts.observations, 7);
  assert.equal(asOfOctober.counts.gap_missing, 0);
  assert.equal(asOfOctober.counts.satisfied, 2);
});

test('a validity interval that has closed before the valid_at cutoff drops out of the replay', () => {
  const retired = fixtureInput();
  retired.requirements.find((row) => row.requirement_id === 'req-beta-four')
    .valid_to = '2026-07-15T00:00:00.000Z';

  const result = computeRequirementCoverage(retired);
  assert.equal(stateOf(result, 'req-beta-four'), undefined);
  assert.equal(result.receipt.replayed_row_counts.requirements, 5);
  assert.equal(result.counts.gap_unknown, 1);
});

// ---------------------------------------------------------------- 3. fail closed

test('an unobserved need is unknown rather than missing', () => {
  const result = computeRequirementCoverage(fixtureInput());
  const cell = cellOf(result, 'req-beta-two', 'verification_report', 'verifies');
  assert.equal(cell.state, 'gap_unknown');
  assert.equal(cell.reason, 'coverage_not_attempted');
  assert.deepEqual(cell.observation_ids, []);
});

test('a requirement ref naming no revision is refused instead of being read as "latest"', () => {
  const floating = fixtureInput();
  delete floating.requirements[0].requirement_ref.revision_id;

  assert.throws(() => computeRequirementCoverage(floating), (error) => {
    assert.ok(error instanceof RequirementCoverageError);
    assert.equal(error.code, ERROR_CODES.REFERENCE_INVALID);
    assert.equal(error.code, 'AX_SE_REFERENCE_INVALID');
    assert.equal(error.detail.resolution, 'invalid_floating_ref');
    return true;
  });
});

test('a need ref naming no revision is refused on the same terms', () => {
  const floating = fixtureInput();
  delete floating.needs[0].requirement_ref.revision_id;

  assert.throws(() => computeRequirementCoverage(floating),
    (error) => error.code === ERROR_CODES.REFERENCE_INVALID && error.detail.resolution === 'invalid_floating_ref');
});

test('two sources disagreeing stay a conflict and are not folded into an absence', () => {
  const result = computeRequirementCoverage(fixtureInput());
  const cell = cellOf(result, 'req-beta-one', 'design_document', 'covers');

  assert.equal(cell.state, 'gap_conflict');
  assert.equal(cell.reason, 'observation_disagreement');
  assert.notEqual(cell.state, 'gap_missing');
  assert.notEqual(cell.state, 'satisfied');
  // Both sides of the disagreement are carried, not resolved.
  assert.deepEqual(cell.observation_ids, ['obs-003', 'obs-004']);
  assert.equal(stateOf(result, 'req-beta-one'), 'gap_conflict');
});

test('a conflict outranks a satisfied sibling cell in the requirement roll up', () => {
  const input = fixtureInput();
  // Give req-beta-one a second, fully satisfied need. Worst first must still win.
  input.needs.push({
    ...structuredClone(input.needs.find((row) => row.need_id === 'need-beta-one-covers')),
    need_id: 'need-beta-one-verifies',
    needed_artifact_type_id: 'verification_report',
    needed_relation: 'verifies',
  });
  input.observations.push({
    ...structuredClone(input.observations.find((row) => row.observation_id === 'obs-003')),
    observation_id: 'obs-009',
    artifact_type_id: 'verification_report',
    relation: 'verifies',
    observation_attempt_ref: 'attempt-obs-009',
  });

  const result = computeRequirementCoverage(input);
  assert.equal(cellOf(result, 'req-beta-one', 'verification_report', 'verifies').state, 'satisfied');
  assert.equal(stateOf(result, 'req-beta-one'), 'gap_conflict');
});

test('a requirement with no declared need is unknown, not silently covered', () => {
  const result = computeRequirementCoverage(fixtureInput());
  const cell = result.cells.find((row) => row.requirement_id === 'req-beta-four');

  assert.equal(cell.state, 'gap_unknown');
  assert.equal(cell.reason, 'needs_undeclared');
  assert.equal(cell.needed_artifact_type_id, undefined);
  assert.equal(cell.needed_relation, undefined);
  assert.equal(stateOf(result, 'req-beta-four'), 'gap_unknown');
});

test('duplicate identifiers, unknown fields, and unbound stage codes are refused', () => {
  const duplicate = fixtureInput();
  duplicate.requirements.push(structuredClone(duplicate.requirements[0]));
  assert.throws(() => computeRequirementCoverage(duplicate),
    (error) => error.code === ERROR_CODES.DUPLICATE_ID);

  const extraField = fixtureInput();
  extraField.requirements[0].confidence = 'high';
  assert.throws(() => computeRequirementCoverage(extraField),
    (error) => error.code === ERROR_CODES.REQUEST_INVALID);

  const unboundStage = fixtureInput();
  unboundStage.requirements[0].stage_code = '120_CDR';
  assert.throws(() => computeRequirementCoverage(unboundStage),
    (error) => error.code === ERROR_CODES.STAGE_BINDING_INVALID);

  const privatePath = fixtureInput();
  privatePath.observations[0].observation_attempt_ref = '_workmeta/attempt';
  assert.throws(() => computeRequirementCoverage(privatePath),
    (error) => error.code === ERROR_CODES.INPUT_UNSAFE);

  const uncountedTime = fixtureInput();
  uncountedTime.cutoffs.known_at = '2026-08-17';
  assert.throws(() => computeRequirementCoverage(uncountedTime),
    (error) => error.code === ERROR_CODES.REQUEST_INVALID);
});

// ---------------------------------------------------------------- 4. outdated coverage

test('coverage of a superseded requirement revision is unknown with a stale reason', () => {
  const result = computeRequirementCoverage(fixtureInput());
  const cell = cellOf(result, 'req-beta-two', 'design_document', 'covers');

  assert.equal(cell.state, 'gap_unknown');
  assert.equal(cell.reason, 'coverage_revision_stale');
  // Neither of the two unsafe folds: not an invented gap, not invented assurance.
  assert.notEqual(cell.state, 'gap_missing');
  assert.notEqual(cell.state, 'satisfied');
  assert.deepEqual(cell.observation_ids, ['obs-005']);

  // Pointing the same observation at the current revision closes it, which shows the
  // stale reason came from the revision comparison and from nothing else.
  const current = fixtureInput();
  current.observations.find((row) => row.observation_id === 'obs-005').covered_requirement_revision_id = 'rev-2';
  assert.equal(cellOf(computeRequirementCoverage(current), 'req-beta-two', 'design_document', 'covers').state, 'satisfied');
});

test('a present observation whose artifact ref names no revision is unknown, not satisfied', () => {
  const floatingArtifact = fixtureInput();
  delete floatingArtifact.observations.find((row) => row.observation_id === 'obs-001').artifact_revision_ref.revision_id;

  const cell = cellOf(computeRequirementCoverage(floatingArtifact), 'req-alpha-one', 'design_document', 'covers');
  assert.equal(cell.state, 'gap_unknown');
  assert.equal(cell.reason, 'artifact_ref_floating');
});

// ---------------------------------------------------------------- 5. orphans

test('an observation covering a requirement outside the baseline is counted, not deleted', () => {
  const result = computeRequirementCoverage(fixtureInput());

  assert.equal(result.orphans.length, 1);
  assert.equal(result.orphans[0].observation_id, 'obs-007');
  assert.equal(result.orphans[0].state, 'unexpected_observed');
  assert.equal(result.orphans[0].presence_state, 'present');
  assert.equal(result.counts.unexpected_observed, 1);
  // It is not quietly promoted into a coverage cell either.
  assert.equal(result.cells.some((cell) => cell.requirement_key === result.orphans[0].requirement_key), false);
  // And it cannot satisfy a gate entry criterion on anyone's behalf.
  assert.equal(readinessOf(result, '090_PDR').entry_ok, false);
});

// ---------------------------------------------------------------- 6. gate readiness

const minimalStage = (overrides = {}) => ({
  stage_code: '060_SFR',
  sequence: 1,
  entry_criteria: [],
  success_criteria: [{ criterion_id: 'exit-owner-approval', needed_artifact_type_id: 'decision_record' }],
  ...overrides,
});

const minimalRef = (entity) => ({
  entity_id: entity,
  revision_id: 'rev-1',
  content_id: `sha256-of-${entity}`,
  content_hash_alg: 'sha256',
});

function minimalInput({ presence = 'present', risks = [] } = {}) {
  const requirementRef = minimalRef('requirement-gate');
  return {
    cutoffs: { valid_at: '2026-08-17T00:00:00.000Z', known_at: '2026-08-17T00:00:00.000Z' },
    stages: [minimalStage()],
    requirements: [{
      requirement_id: 'req-gate',
      requirement_ref: requirementRef,
      requirement_kind: 'functional',
      normative_force: 'must',
      authority_family: 'project_contract_baseline',
      applicability: true,
      stage_code: '060_SFR',
      valid_at: '2026-06-01T00:00:00.000Z',
      known_at: '2026-06-01T00:00:00.000Z',
    }],
    needs: [{
      need_id: 'need-gate',
      requirement_ref: requirementRef,
      needed_artifact_type_id: 'design_document',
      needed_relation: 'covers',
      policy_ref: minimalRef('needs-policy'),
    }],
    observations: [{
      observation_id: 'obs-gate',
      requirement_key: requirementKeyFromRef(requirementRef),
      artifact_type_id: 'design_document',
      relation: 'covers',
      presence_state: presence,
      observation_attempt_ref: 'attempt-gate',
      artifact_revision_ref: minimalRef('artifact-gate'),
      covered_requirement_revision_id: 'rev-1',
      evidence_refs: [minimalRef('evidence-gate')],
      valid_at: '2026-07-01T00:00:00.000Z',
      known_at: '2026-07-01T00:00:00.000Z',
    }],
    risks,
  };
}

test('gate readiness has exactly three outcomes and never mints a cleared state', () => {
  const ready = readinessOf(computeRequirementCoverage(fixtureInput()), '030_SRR');
  assert.equal(ready.assessment, 'READY_FOR_OWNER_REVIEW');
  assert.equal(ready.floor_status, 'active');

  const unknown = readinessOf(computeRequirementCoverage(fixtureInput()), '090_PDR');
  assert.equal(unknown.assessment, 'UNKNOWN');
  assert.equal(unknown.floor_status, 'blocked');

  // An absence turns the same stage into HOLD rather than UNKNOWN, because a confirmed
  // absence is a decided gap and not an open question.
  const missing = computeRequirementCoverage(minimalInput({ presence: 'absence_confirmed' }));
  assert.equal(readinessOf(missing, '060_SFR').assessment, 'HOLD');
  assert.equal(readinessOf(missing, '060_SFR').floor_status, 'blocked');

  // A single open risk holds a stage whose requirements are all satisfied.
  const risked = computeRequirementCoverage(minimalInput({
    risks: [{ risk_id: 'risk-open', stage_code: '060_SFR', state: 'open', severity: 'medium' }],
  }));
  assert.equal(readinessOf(risked, '060_SFR').requirement_counts.satisfied, 1);
  assert.equal(readinessOf(risked, '060_SFR').assessment, 'HOLD');
  assert.equal(readinessOf(risked, '060_SFR').open_risk_count, 1);

  // A closed risk does not.
  const closed = computeRequirementCoverage(minimalInput({
    risks: [{ risk_id: 'risk-closed', stage_code: '060_SFR', state: 'closed', severity: 'medium' }],
  }));
  assert.equal(readinessOf(closed, '060_SFR').assessment, 'READY_FOR_OWNER_REVIEW');
  assert.equal(readinessOf(closed, '060_SFR').open_risk_count, 0);

  const everyFloor = new Set([ready, unknown, missing, risked, closed]
    .flatMap((result) => (result.stage_readiness ?? [result]).map((row) => row.floor_status)));
  assert.deepEqual([...everyFloor].sort(), ['active', 'blocked']);

  const rendered = JSON.stringify(computeRequirementCoverage(fixtureInput()));
  assert.equal(rendered.includes('cleared'), false);
  assert.equal(rendered.includes('boss_clear_candidate'), false);
});

test('entry criteria are judged on artifact presence and stay separate from the success axis', () => {
  const withEntry = minimalInput();
  withEntry.stages = [minimalStage({
    entry_criteria: [
      { criterion_id: 'entry-design-draft', needed_artifact_type_id: 'design_document' },
      { criterion_id: 'entry-verification-plan', needed_artifact_type_id: 'verification_report' },
    ],
  })];

  const readiness = readinessOf(computeRequirementCoverage(withEntry), '060_SFR');
  assert.equal(readiness.entry_ok, false);
  assert.deepEqual(readiness.entry_unmet_criterion_ids, ['entry-verification-plan']);
  // The success criteria are carried and counted, and deliberately not judged here.
  assert.equal(readiness.success_criteria_count, 1);
  assert.equal(Object.hasOwn(readiness, 'success_ok'), false);

  // Entry can be met while the assessment still blocks: the two axes do not collapse.
  const absent = minimalInput({ presence: 'absence_confirmed' });
  const absentReadiness = readinessOf(computeRequirementCoverage(absent), '060_SFR');
  assert.equal(absentReadiness.entry_ok, true);
  assert.equal(absentReadiness.assessment, 'HOLD');
});

// ---------------------------------------------------------------- 7. purity of the call

test('the input is not mutated and the output is deep frozen', () => {
  const input = fixtureInput();
  const before = JSON.stringify(input);
  const result = computeRequirementCoverage(input);
  assert.equal(JSON.stringify(input), before);

  const frozen = [
    result, result.cutoffs, result.counts, result.cells, result.requirement_states,
    result.orphans, result.stage_readiness, result.receipt, result.receipt.effects,
    result.receipt.input_row_counts, result.cells[0], result.cells[0].observation_ids,
    result.stage_readiness[0], result.stage_readiness[0].requirement_counts,
    result.stage_readiness[0].entry_unmet_criterion_ids, result.orphans[0],
  ];
  for (const value of frozen) assert.equal(Object.isFrozen(value), true);

  assert.throws(() => { result.counts.satisfied = 99; }, TypeError);
  assert.throws(() => { result.cells.push({}); }, TypeError);
  assert.equal(result.counts.satisfied, FIXTURE.expected.counts.satisfied);
});

// ---------------------------------------------------------------- 8. static effect pin

test('the module and everything it imports read no file, clock, network, or model', () => {
  const FORBIDDEN = [
    'node:fs', 'node:net', 'node:http', 'node:https', 'node:dns', 'node:child_process',
    'node:worker_threads', 'node:process', 'node:os', 'node:readline',
    'Date.now', 'new Date', 'Math.random', 'process.env', 'process.argv',
    'process.hrtime', 'performance.now', 'fetch(', 'XMLHttpRequest', 'require(',
  ];
  const ALLOWED_BARE_SPECIFIERS = new Set(['node:crypto']);

  const seen = new Map();
  const walk = (url) => {
    const href = url.href;
    if (seen.has(href)) return;
    const source = readFileSync(url, 'utf8');
    seen.set(href, source);
    for (const match of source.matchAll(/\bfrom\s+'([^']+)'/gu)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) walk(new URL(specifier, url));
      else assert.ok(ALLOWED_BARE_SPECIFIERS.has(specifier), `unexpected bare import "${specifier}" in ${href}`);
    }
  };
  walk(new URL('./requirement_coverage.mjs', import.meta.url));

  assert.ok(seen.size >= 2, 'the import graph should include the kernel modules it reuses');
  for (const [href, source] of seen) {
    for (const token of FORBIDDEN) {
      assert.equal(source.includes(token), false, `${href} must not contain "${token}"`);
    }
  }

  // The entry module additionally declares no command line and no top level side effect.
  const entry = seen.get(new URL('./requirement_coverage.mjs', import.meta.url).href);
  assert.equal(entry.includes('import.meta.main'), false);
  assert.equal(entry.includes('process.'), false);
});

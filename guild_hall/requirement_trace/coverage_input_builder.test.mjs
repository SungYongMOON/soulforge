import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import {
  buildRequirementCoverageInput,
  projectRequirementCoverageFromIndex,
  CoverageInputBuilderError,
  BUILDER_ERROR_CODES,
  HOLD_REASONS,
  PRESENCE_SEMANTICS,
  COVERAGE_INPUT_BUILDER_SCHEMA_VERSION,
} from './coverage_input_builder.mjs';
import { computeRequirementCoverage } from './requirement_coverage.mjs';

const FIXTURE_URL = new URL(
  '../../docs/architecture/workspace/examples/project_requirement_trace/coverage_input_builder_synthetic_v0.json',
  import.meta.url,
);
const FIXTURE = JSON.parse(readFileSync(FIXTURE_URL, 'utf8'));

const fixtureRequest = () => structuredClone(FIXTURE.request);

// Written with `fromCharCode` rather than as an escape so this file carries no raw control
// byte of its own while still re-deriving the separators the module documents.
const NUL = String.fromCharCode(0);

const satisfiesRequest = () => {
  const request = fixtureRequest();
  request.needs_policy.artifact_presence_semantics = PRESENCE_SEMANTICS.SATISFIES;
  return request;
};

const stateOf = (coverage, requirementId) => coverage.requirement_states
  .find((row) => row.requirement_id === requirementId)?.state;
const cellOf = (coverage, requirementId, artifactTypeId, relation) => coverage.cells.find(
  (cell) => cell.requirement_id === requirementId
    && cell.needed_artifact_type_id === artifactTypeId
    && cell.needed_relation === relation,
);
const readinessOf = (coverage, stageCode) => coverage.stage_readiness
  .find((row) => row.stage_code === stageCode);
const requirementOf = (built, requirementId) => built.input.requirements
  .find((row) => row.requirement_id === requirementId);
const manifestRowOf = (built, requirementId) => built.manifest.requirements
  .find((row) => row.requirement_id === requirementId);
const holdReasonsById = (built) => built.manifest.holds
  .map((hold) => `${hold.requirement_id}|${hold.reason}`).sort();

function assertCoverageMatches(coverage, expected, label) {
  assert.deepEqual(coverage.counts, expected.counts, `${label}: counts`);
  for (const row of expected.requirement_states) {
    assert.equal(stateOf(coverage, row.requirement_id), row.state,
      `${label}: state of ${row.requirement_id}`);
  }
  assert.equal(coverage.requirement_states.length, expected.requirement_states.length, `${label}: state count`);

  assert.equal(coverage.cells.length, expected.cells.length, `${label}: cell count`);
  for (const expectedCell of expected.cells) {
    const cell = cellOf(coverage, expectedCell.requirement_id,
      expectedCell.needed_artifact_type_id, expectedCell.needed_relation);
    assert.ok(cell, `${label}: cell for ${expectedCell.requirement_id}`);
    assert.equal(cell.state, expectedCell.state, `${label}: cell state for ${expectedCell.requirement_id}`);
    // A satisfied cell carries no reason at all, because `null` is forbidden in canonical
    // input and an absent reason is an absent key.
    assert.equal(cell.reason, expectedCell.reason, `${label}: cell reason for ${expectedCell.requirement_id}`);
  }

  for (const expectedStage of expected.stage_readiness) {
    const readiness = readinessOf(coverage, expectedStage.stage_code);
    assert.ok(readiness, `${label}: readiness for ${expectedStage.stage_code}`);
    for (const [field, value] of Object.entries(expectedStage)) {
      assert.deepEqual(readiness[field], value, `${label}: ${expectedStage.stage_code}.${field}`);
    }
  }
}

// ---------------------------------------------------------------- 1. fixture conformance

test('the synthetic fixture builds exactly the hand derived input and manifest', () => {
  const built = buildRequirementCoverageInput(fixtureRequest());
  const expected = FIXTURE.expected;

  assert.equal(built.manifest.schema_version, COVERAGE_INPUT_BUILDER_SCHEMA_VERSION);
  assert.deepEqual(built.manifest.holds, expected.holds);
  assert.deepEqual(built.receipt.counts, expected.counts);
  assert.deepEqual(built.input.requirements.map((row) => row.requirement_id), expected.requirement_ids_admitted);
  assert.deepEqual(built.manifest.requirements.map((row) => row.requirement_id), expected.requirement_ids_admitted);
  assert.deepEqual(
    built.input.needs.map((need) => ({
      requirement_id: built.input.requirements
        .find((row) => row.requirement_ref.entity_id === need.requirement_ref.entity_id).requirement_id,
      needed_artifact_type_id: need.needed_artifact_type_id,
      needed_relation: need.needed_relation,
    })),
    expected.needs_by_requirement_id,
  );
  assert.deepEqual(built.manifest.needs_undeclared_by_group, expected.needs_undeclared_by_group);
  assert.deepEqual(built.manifest.unbound_artifact_observations, expected.unbound_artifact_observations);
  assert.deepEqual(built.manifest.fan_out, expected.fan_out);

  // Provenance R1 refuses to carry stays in the manifest and nowhere else.
  assert.deepEqual(built.manifest.not_in_baseline, {
    mention_only_ids: FIXTURE.request.requirement_index.mention_only_ids,
    malformed_label_count: FIXTURE.request.requirement_index.malformed_labels.length,
    index_declared_duplicate_ids: FIXTURE.request.requirement_index.duplicate_ids,
  });
  assert.equal(built.manifest.document.row_count, FIXTURE.request.requirement_index.row_count);
  assert.equal(built.manifest.policy.stage_code, FIXTURE.request.baseline_binding.stage_code);
  assert.equal(built.manifest.policy.policy_status, 'candidate');
  assert.deepEqual(built.manifest.policy.extends, FIXTURE.request.needs_policy.extends);
  // D37: every admitted row is a candidate, and there is no other value this can take.
  for (const row of built.manifest.requirements) {
    assert.equal(row.confirmation_state, 'observed_candidate');
  }
});

test('the built input projects to exactly the hand derived coverage', () => {
  const projected = projectRequirementCoverageFromIndex(fixtureRequest());
  assertCoverageMatches(projected.coverage, FIXTURE.expected.coverage, 'default semantics');

  // The two receipts stay side by side; neither absorbs the other.
  assert.equal(projected.receipt.schema_version, COVERAGE_INPUT_BUILDER_SCHEMA_VERSION);
  assert.equal(projected.receipt.coverage_receipt.claim_ceiling, 'observed');
  assert.match(projected.receipt.coverage_receipt.output_digest_sha256, /^[0-9a-f]{64}$/u);
  assert.notEqual(projected.receipt.output_digests.coverage_input,
    projected.receipt.coverage_receipt.output_digest_sha256);
});

// ---------------------------------------------------------------- 2. determinism

test('the same request twice mints the same identifiers and the same digests', () => {
  const first = buildRequirementCoverageInput(fixtureRequest());
  const second = buildRequirementCoverageInput(fixtureRequest());

  assert.deepEqual(first.receipt.output_digests, second.receipt.output_digests);
  assert.deepEqual(first.receipt.input_digests, second.receipt.input_digests);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  for (const digest of [...Object.values(first.receipt.input_digests), ...Object.values(first.receipt.output_digests)]) {
    assert.match(digest, /^[0-9a-f]{64}$/u);
  }
  // Ten different claims, ten different domains: no digest may equal another.
  const allDigests = [...Object.values(first.receipt.input_digests), ...Object.values(first.receipt.output_digests)];
  assert.equal(new Set(allDigests).size, allDigests.length);
});

test('the order the index rows arrive in does not reach the projection', () => {
  const first = projectRequirementCoverageFromIndex(fixtureRequest());

  const reordered = fixtureRequest();
  reordered.requirement_index.rows.reverse();
  reordered.artifact_observations.reverse();
  const shuffled = projectRequirementCoverageFromIndex(reordered);

  // The receipt binds the index as supplied, so the input digest moves.
  assert.notEqual(shuffled.receipt.input_digests.requirement_index, first.receipt.input_digests.requirement_index);
  // The answer does not. The emitted input is sorted by identifier, so it is byte identical,
  // and so is everything R1 derives from it.
  assert.equal(shuffled.receipt.output_digests.coverage_input, first.receipt.output_digests.coverage_input);
  assert.equal(shuffled.coverage.receipt.output_digest_sha256, first.coverage.receipt.output_digest_sha256);
  // The same rows are held for the same reasons, at their new row indices.
  assert.deepEqual(holdReasonsById(shuffled), holdReasonsById(first));
  assert.notEqual(shuffled.receipt.output_digests.manifest, first.receipt.output_digests.manifest);
});

// ---------------------------------------------------------------- 3. duplicate identifiers

test('every row of a duplicated requirement id is held and none of them wins', () => {
  const built = buildRequirementCoverageInput(fixtureRequest());
  const duplicated = built.manifest.holds
    .filter((hold) => hold.reason === HOLD_REASONS.DUPLICATE_REQUIREMENT_ID);

  assert.equal(duplicated.length, 2);
  assert.deepEqual([...new Set(duplicated.map((hold) => hold.requirement_id))], ['Q-ZZ_BETA-SWF-002']);
  assert.deepEqual(duplicated.map((hold) => hold.row_index), [6, 7]);
  assert.equal(requirementOf(built, 'Q-ZZ_BETA-SWF-002'), undefined);

  // The index's own duplicate report is empty; the builder recomputed from the rows and
  // still held both. A report is not the rows.
  assert.deepEqual(built.manifest.not_in_baseline.index_declared_duplicate_ids, []);

  // A separator variant of the same family is a different identifier, never a merge target.
  assert.ok(requirementOf(built, 'Q-ZZ_BETA-SWF-001'));
  assert.ok(requirementOf(built, 'Q_ZZ_BETA-SWF-001'));
  assert.notEqual(
    requirementOf(built, 'Q-ZZ_BETA-SWF-001').requirement_ref.entity_id,
    requirementOf(built, 'Q_ZZ_BETA-SWF-001').requirement_ref.entity_id,
  );
});

test('a row that fails several checks reports all of them and the duplicate is never masked', () => {
  // The two sides of the duplicated identifier are also moved onto an out of scope device.
  // Reporting only one reason per row would file both under the scope problem, and the D40
  // signal — the one an owner has to decide about rather than fix in a map — would vanish
  // from the count entirely.
  const dualFault = fixtureRequest();
  for (const rowIndex of [6, 7]) {
    dualFault.requirement_index.rows[rowIndex].id_family = 'Q-ZZ_GAMMA-SWF';
  }
  const built = buildRequirementCoverageInput(dualFault);
  const both = built.manifest.holds.filter((row) => row.requirement_id === 'Q-ZZ_BETA-SWF-002');

  assert.equal(both.length, 2);
  for (const row of both) {
    assert.equal(row.reason, HOLD_REASONS.DUPLICATE_REQUIREMENT_ID);
    assert.deepEqual(row.faults.map((fault) => fault.reason),
      [HOLD_REASONS.DUPLICATE_REQUIREMENT_ID, HOLD_REASONS.DEVICE_OUT_OF_SCOPE]);
    assert.equal(row.faults[1].detail, 'device_code=GAMMA');
  }

  // `held` files each row once, under its headline reason, and still sums to the held rows.
  assert.deepEqual(built.receipt.counts.held, FIXTURE.expected.counts.held);
  assert.equal(Object.values(built.receipt.counts.held).reduce((a, b) => a + b, 0), built.manifest.holds.length);
  // `held_faults` counts every reason that applied, so the extra scope faults are visible
  // and the duplicate count is unchanged by them.
  assert.equal(built.receipt.counts.held_faults[HOLD_REASONS.DEVICE_OUT_OF_SCOPE], 3);
  assert.equal(built.receipt.counts.held_faults[HOLD_REASONS.DUPLICATE_REQUIREMENT_ID], 2);
});

// ---------------------------------------------------------------- 4. the other four holds

test('an unparseable family, an unmapped device, an out of scope device and an unmapped function all hold', () => {
  const built = buildRequirementCoverageInput(fixtureRequest());
  const reasonOf = (requirementId) => built.manifest.holds
    .find((hold) => hold.requirement_id === requirementId)?.reason;

  assert.equal(reasonOf('Q-YY_ALPHA-MEC-003'), HOLD_REASONS.FAMILY_UNPARSEABLE);
  assert.equal(reasonOf('Q-ZZ_XXXX-MEC-001'), HOLD_REASONS.DEVICE_CODE_UNMAPPED);
  assert.equal(reasonOf('Q-ZZ_GAMMA-ELE-001'), HOLD_REASONS.DEVICE_OUT_OF_SCOPE);
  assert.equal(reasonOf('Q-ZZ_ALPHA-ZZZ-001'), HOLD_REASONS.FUNCTION_CODE_UNMAPPED);

  // Nothing is dropped: every row is either admitted or held, exactly once.
  assert.equal(
    built.manifest.requirements.length + built.manifest.holds.length,
    FIXTURE.request.requirement_index.row_count,
  );
  assert.equal(new Set(built.manifest.holds.map((hold) => hold.row_index)).size, built.manifest.holds.length);

  // A held row's open marks are not counted into the baseline either.
  assert.equal(built.receipt.counts.tbc, 2);
  assert.equal(built.receipt.counts.tbd, 1);
});

// ---------------------------------------------------------------- 5. undeclared needs

test('a requirement the policy declares no need for reaches R1 as needs_undeclared', () => {
  const projected = projectRequirementCoverageFromIndex(fixtureRequest());

  assert.equal(manifestRowOf(projected, 'Q-ZZ_BETA-GEN-001').needs_count, 0);
  // The per-row count and the per-group roll-up name the same requirements, so a bug that
  // moved one without the other cannot pass.
  assert.deepEqual(
    projected.manifest.requirements.filter((row) => row.needs_count === 0).map((row) => row.requirement_id),
    FIXTURE.expected.needs_undeclared_ids,
  );
  assert.deepEqual(projected.manifest.needs_undeclared_by_group,
    [{ device_code: 'BETA', function_code: 'GEN', requirement_count: 1 }]);
  assert.equal(projected.receipt.counts.requirements_without_needs, 1);

  const cell = projected.coverage.cells.find((row) => row.requirement_id === 'Q-ZZ_BETA-GEN-001');
  assert.equal(cell.state, 'gap_unknown');
  assert.equal(cell.reason, 'needs_undeclared');
  assert.equal(stateOf(projected.coverage, 'Q-ZZ_BETA-GEN-001'), 'gap_unknown');

  // The policy does declare a need for that group — at the later stage. A stage this build
  // is not assessing must not leak its expectations into this one.
  assert.ok(FIXTURE.request.needs_policy.needs.some((entry) => entry.device_code === 'BETA'
    && entry.function_code === 'GEN' && entry.stage_code === '120_CDR'));
});

// ---------------------------------------------------------------- 6. presence semantics

test('the default semantics refuse to read a present file as coverage', () => {
  const built = buildRequirementCoverageInput(fixtureRequest());
  const fromPresentArtifact = built.input.observations
    .filter((row) => row.artifact_type_id === 'design_document');

  assert.equal(fromPresentArtifact.length, 4);
  for (const observation of fromPresentArtifact) {
    assert.equal(observation.presence_state, 'unknown');
  }
  assert.equal(built.receipt.artifact_presence_semantics, PRESENCE_SEMANTICS.INCONCLUSIVE);

  const projected = projectRequirementCoverageFromIndex(fixtureRequest());
  const cell = cellOf(projected.coverage, 'Q-ZZ_ALPHA-MEC-001', 'design_document', 'covers');
  assert.equal(cell.state, 'gap_unknown');
  assert.equal(cell.reason, 'observation_inconclusive');
  assert.equal(projected.coverage.counts.satisfied, 0);
});

test('the owner declared semantics read a present file as coverage and nothing else changes', () => {
  const built = buildRequirementCoverageInput(satisfiesRequest());
  for (const observation of built.input.observations.filter((row) => row.artifact_type_id === 'design_document')) {
    assert.equal(observation.presence_state, 'present');
  }
  // Only the reading of "present" moved. The absence stays an absence.
  for (const observation of built.input.observations.filter((row) => row.artifact_type_id === 'verification_report')) {
    assert.equal(observation.presence_state, 'absence_confirmed');
  }
  assert.equal(built.receipt.artifact_presence_semantics, PRESENCE_SEMANTICS.SATISFIES);
  assert.deepEqual(built.receipt.counts, FIXTURE.expected.counts);

  const projected = projectRequirementCoverageFromIndex(satisfiesRequest());
  assertCoverageMatches(projected.coverage, FIXTURE.expected_presence_satisfies.coverage, 'presence satisfies');
  assert.equal(stateOf(projected.coverage, 'Q-ZZ_BETA-SWF-001'), 'satisfied');
});

// ---------------------------------------------------------------- 7. fail closed cells

test('absence is missing, an unobserved need is unknown, and stale coverage is neither', () => {
  const projected = projectRequirementCoverageFromIndex(satisfiesRequest());

  const missing = cellOf(projected.coverage, 'Q-ZZ_ALPHA-MEC-001', 'verification_report', 'verifies');
  assert.equal(missing.state, 'gap_missing');
  assert.equal(missing.reason, 'absence_confirmed');

  const notAttempted = cellOf(projected.coverage, 'Q-ZZ_ALPHA-ELE-001', 'qualification_plan', 'verifies');
  assert.equal(notAttempted.state, 'gap_unknown');
  assert.equal(notAttempted.reason, 'coverage_not_attempted');
  assert.deepEqual(notAttempted.observation_ids, []);

  // The interface sheet was recorded against an older document revision. The builder keeps
  // that revision verbatim rather than restamping it, so R1 can see it is stale.
  const stale = cellOf(projected.coverage, 'Q-ZZ_ALPHA-ELE-001', 'interface_sheet', 'covers');
  assert.equal(stale.state, 'gap_unknown');
  assert.equal(stale.reason, 'coverage_revision_stale');
  assert.notEqual(stale.state, 'gap_missing');
  assert.notEqual(stale.state, 'satisfied');

  const staleObservation = projected.input.observations.find((row) => row.artifact_type_id === 'interface_sheet');
  assert.equal(staleObservation.covered_requirement_revision_id, 'doc-rev-1');
  const freshObservation = projected.input.observations.find((row) => row.artifact_type_id === 'design_document');
  const covered = projected.input.requirements
    .find((row) => row.requirement_ref.revision_id === freshObservation.covered_requirement_revision_id);
  assert.ok(covered, 'a fresh observation names the minted requirement revision, not the document revision');
});

test('a revision label from a different document is not freshness', () => {
  // artifact-obs-005 was recorded against another document that happens to label its
  // revision `doc-rev-2`, exactly as the bound document does. Comparing labels alone would
  // restamp it onto the current requirement revision and report it as satisfied.
  const projected = projectRequirementCoverageFromIndex(satisfiesRequest());
  const emitted = projected.input.observations.find((row) => row.artifact_type_id === 'installation_note');

  assert.equal(emitted.presence_state, 'present');
  assert.equal(emitted.covered_requirement_revision_id, 'doc-rev-2');
  assert.equal(projected.input.requirements
    .some((row) => row.requirement_ref.revision_id === emitted.covered_requirement_revision_id), false);

  const cell = cellOf(projected.coverage, 'Q-ZZ_ALPHA-ELE-001', 'installation_note', 'covers');
  assert.equal(cell.state, 'gap_unknown');
  assert.equal(cell.reason, 'coverage_revision_stale');
  assert.notEqual(cell.state, 'satisfied');

  // Pointing the same observation at the bound document — same entity, same revision —
  // closes it, which shows the refusal came from the identity comparison and nothing else.
  const boundDocument = FIXTURE.request.document_binding.document_ref;
  const sameDocument = satisfiesRequest();
  sameDocument.artifact_observations.find((row) => row.observation_id === 'artifact-obs-005')
    .covered_document_ref = { entity_id: boundDocument.entity_id, revision_id: boundDocument.revision_id };
  const closed = projectRequirementCoverageFromIndex(sameDocument);
  assert.equal(cellOf(closed.coverage, 'Q-ZZ_ALPHA-ELE-001', 'installation_note', 'covers').state, 'satisfied');
});

// ---------------------------------------------------------------- 7b. cutoff binding

test('a document binding outside the query cutoffs is refused instead of reading empty', () => {
  // Every emitted requirement is stamped with the document binding's instants. Outside the
  // cutoffs R1 replays none of them, so there is no cell, no gap, and an empty stage reports
  // READY_FOR_OWNER_REVIEW. An empty sheet claiming readiness is the worst possible failure
  // mode for this seam, so the combination never gets that far.
  const laterKnownAt = fixtureRequest();
  laterKnownAt.cutoffs.known_at = '2026-08-16T00:00:00.000Z';
  assert.throws(() => buildRequirementCoverageInput(laterKnownAt), (error) => {
    assert.ok(error instanceof CoverageInputBuilderError);
    assert.equal(error.code, BUILDER_ERROR_CODES.BINDING_INCOMPLETE);
    assert.equal(error.detail.cutoff_known_at, '2026-08-16T00:00:00.000Z');
    return true;
  });

  const laterValidAt = fixtureRequest();
  laterValidAt.cutoffs.valid_at = '2026-05-03T00:00:00.000Z';
  assert.throws(() => buildRequirementCoverageInput(laterValidAt), (error) => {
    assert.equal(error.code, BUILDER_ERROR_CODES.BINDING_INCOMPLETE);
    assert.equal(error.detail.cutoff_valid_at, '2026-05-03T00:00:00.000Z');
    return true;
  });

  // Equality is inside the window, exactly as R1's replay reads it.
  const exactlyAtTheCutoffs = fixtureRequest();
  exactlyAtTheCutoffs.cutoffs = {
    valid_at: FIXTURE.request.document_binding.valid_at,
    known_at: FIXTURE.request.document_binding.known_at,
  };
  assert.equal(projectRequirementCoverageFromIndex(exactlyAtTheCutoffs).coverage.requirement_states.length, 6);

  // An artifact observation later than the cutoffs is ordinary bitemporal drop-out and stays
  // the caller's business: the build succeeds and R1 simply does not replay it.
  const lateObservation = fixtureRequest();
  lateObservation.artifact_observations[0].known_at = '2026-12-01T00:00:00.000Z';
  const projected = projectRequirementCoverageFromIndex(lateObservation);
  assert.equal(projected.coverage.counts.gap_unknown, 6);
  assert.equal(cellOf(projected.coverage, 'Q-ZZ_ALPHA-MEC-001', 'design_document', 'covers').reason,
    'coverage_not_attempted');
});

// ---------------------------------------------------------------- 8. unbound observations

test('an artifact type nobody declared a need for is reported rather than emitted', () => {
  const projected = projectRequirementCoverageFromIndex(fixtureRequest());

  assert.equal(projected.input.observations.some((row) => row.artifact_type_id === 'test_procedure'), false);
  assert.deepEqual(projected.manifest.unbound_artifact_observations, [{
    observation_id: 'artifact-obs-004',
    artifact_type_id: 'test_procedure',
    presence_state: 'present',
    reason: 'no_declared_need_for_artifact_type',
  }]);
  assert.deepEqual(projected.manifest.fan_out.find((row) => row.source_observation_id === 'artifact-obs-004'),
    { source_observation_id: 'artifact-obs-004', emitted_observation_count: 0 });
  // R1 never sees it, so it cannot show up as an orphan either — which is exactly why the
  // manifest has to say it existed.
  assert.equal(projected.coverage.counts.unexpected_observed, 0);
});

// ---------------------------------------------------------------- 9. binding refusals

test('a document binding that does not name the indexed bytes is refused', () => {
  const mismatched = fixtureRequest();
  mismatched.document_binding.document_ref.content_id = `sha256:${'0'.repeat(64)}`;

  assert.throws(() => buildRequirementCoverageInput(mismatched), (error) => {
    assert.ok(error instanceof CoverageInputBuilderError);
    assert.equal(error.code, BUILDER_ERROR_CODES.DOCUMENT_BINDING_MISMATCH);
    return true;
  });
});

test('a baseline stage nobody declared is refused by both halves of the binding', () => {
  const undeclaredStage = fixtureRequest();
  undeclaredStage.baseline_binding.stage_code = '150_TRR';
  assert.throws(() => buildRequirementCoverageInput(undeclaredStage),
    (error) => error.code === BUILDER_ERROR_CODES.STAGE_MISMATCH);

  const notInPolicy = fixtureRequest();
  notInPolicy.needs_policy.stages = notInPolicy.needs_policy.stages
    .filter((stage) => stage.stage_code !== '090_PDR');
  notInPolicy.needs_policy.needs = notInPolicy.needs_policy.needs
    .filter((entry) => entry.stage_code !== '090_PDR');
  assert.throws(() => buildRequirementCoverageInput(notInPolicy),
    (error) => error.code === BUILDER_ERROR_CODES.STAGE_MISMATCH);
});

test('the same artifact type and relation declared twice for one requirement is refused', () => {
  const ambiguous = fixtureRequest();
  ambiguous.needs_policy.needs.push({
    stage_code: '090_PDR',
    device_code: 'ALPHA',
    function_code: 'MEC',
    needed_artifact_type_id: 'design_document',
    needed_relation: 'covers',
    basis: 'a second synthetic row that duplicates the first',
    confidence: 'low',
  });

  assert.throws(() => buildRequirementCoverageInput(ambiguous), (error) => {
    assert.equal(error.code, BUILDER_ERROR_CODES.NEED_DECLARATION_AMBIGUOUS);
    assert.equal(error.detail.needed_artifact_type_id, 'design_document');
    return true;
  });
});

// ---------------------------------------------------------------- 10. contract refusals

test('a malformed policy and an index without the extended profile are refused separately', () => {
  const unknownKey = fixtureRequest();
  unknownKey.needs_policy.owner = 'someone';
  assert.throws(() => buildRequirementCoverageInput(unknownKey),
    (error) => error.code === BUILDER_ERROR_CODES.POLICY_INVALID);

  const badRelation = fixtureRequest();
  badRelation.needs_policy.needs[0].needed_relation = 'validates';
  assert.throws(() => buildRequirementCoverageInput(badRelation),
    (error) => error.code === BUILDER_ERROR_CODES.POLICY_INVALID);

  const positionalGroups = fixtureRequest();
  positionalGroups.needs_policy.family_pattern = '^Q[-_]ZZ_([A-Z]+)-([A-Z]{3})$';
  assert.throws(() => buildRequirementCoverageInput(positionalGroups),
    (error) => error.code === BUILDER_ERROR_CODES.POLICY_INVALID);

  const uncompilable = fixtureRequest();
  uncompilable.needs_policy.family_pattern = '^Q[-_]ZZ_(?<device>[A-Z]+-(?<function>[A-Z]{3})$';
  assert.throws(() => buildRequirementCoverageInput(uncompilable),
    (error) => error.code === BUILDER_ERROR_CODES.POLICY_INVALID);

  // A quantified group is how a bounded match becomes an unbounded one, and the policy is
  // owner-authored data run once per index row.
  for (const quantified of [
    '^Q[-_]ZZ_(?<device>[A-Z]+)-(?<function>[A-Z]{3})*$',
    '^(?:Q[-_])+ZZ_(?<device>[A-Z]+)-(?<function>[A-Z]{3})$',
    '^Q[-_]ZZ_(?<device>[A-Z]+)?-(?<function>[A-Z]{3})$',
    '^Q[-_]ZZ_(?<device>[A-Z]+)-(?<function>[A-Z]{3}){1,4}$',
  ]) {
    const quantifiedGroup = fixtureRequest();
    quantifiedGroup.needs_policy.family_pattern = quantified;
    assert.throws(() => buildRequirementCoverageInput(quantifiedGroup),
      (error) => error.code === BUILDER_ERROR_CODES.POLICY_INVALID, `pattern "${quantified}"`);
  }

  const tooLong = fixtureRequest();
  tooLong.needs_policy.family_pattern = `^Q[-_]ZZ_(?<device>[A-Z]+)-(?<function>[A-Z]{3})${'#'.repeat(256)}$`;
  assert.throws(() => buildRequirementCoverageInput(tooLong),
    (error) => error.code === BUILDER_ERROR_CODES.POLICY_INVALID);

  const notAnExtension = fixtureRequest();
  notAnExtension.needs_policy.extends.schema_version = 'some_new_policy_store_v0';
  assert.throws(() => buildRequirementCoverageInput(notAnExtension),
    (error) => error.code === BUILDER_ERROR_CODES.POLICY_INVALID);

  // The v0 profile carries no `id_family`, so there is nothing to resolve a device and a
  // function code from and the request is refused rather than guessed at.
  const baseProfile = fixtureRequest();
  delete baseProfile.requirement_index.rows[0].id_family;
  assert.throws(() => buildRequirementCoverageInput(baseProfile), (error) => {
    assert.equal(error.code, BUILDER_ERROR_CODES.REQUEST_INVALID);
    assert.equal(error.detail.field, 'id_family');
    return true;
  });

  const applicabilityFalse = fixtureRequest();
  applicabilityFalse.baseline_binding.applicability_default = false;
  assert.throws(() => buildRequirementCoverageInput(applicabilityFalse),
    (error) => error.code === BUILDER_ERROR_CODES.REQUEST_INVALID);

  const extraRootField = fixtureRequest();
  extraRootField.confidence = 'high';
  assert.throws(() => buildRequirementCoverageInput(extraRootField),
    (error) => error.code === BUILDER_ERROR_CODES.REQUEST_INVALID);
});

test('a private plane path anywhere in the request fails the call before anything is emitted', () => {
  const privatePath = fixtureRequest();
  privatePath.artifact_observations[0].observation_attempt_ref = '_workmeta/attempt';

  assert.throws(() => buildRequirementCoverageInput(privatePath), (error) => {
    assert.ok(error instanceof CoverageInputBuilderError);
    assert.equal(error.code, BUILDER_ERROR_CODES.REQUEST_INVALID);
    return true;
  });

  const inThePolicy = fixtureRequest();
  inThePolicy.needs_policy.needs[0].basis = 'derived from _workspaces/notes';
  assert.throws(() => buildRequirementCoverageInput(inThePolicy),
    (error) => error instanceof CoverageInputBuilderError);
});

// ---------------------------------------------------------------- 11. R1 accepts the output

test('R1 accepts the emitted input and every emitted row binds to an emitted requirement', () => {
  const built = buildRequirementCoverageInput(fixtureRequest());

  // The point of the slice: R1 does not refuse what this builder produced.
  assert.doesNotThrow(() => computeRequirementCoverage(structuredClone(built.input)));

  const requirementKeys = new Set(built.manifest.requirements.map((row) => row.requirement_key));
  assert.equal(requirementKeys.size, built.input.requirements.length);
  for (const observation of built.input.observations) {
    assert.equal(requirementKeys.has(observation.requirement_key), true);
  }
  for (const need of built.input.needs) {
    const ref = need.requirement_ref;
    assert.equal(requirementKeys.has([ref.entity_id, ref.revision_id, ref.content_id, ref.content_hash_alg]
      .join(String.fromCharCode(31))), true);
  }
  // R1 silently ignores a need whose requirement it cannot find, so a wrong binding would
  // show up as a missing cell rather than an error. Nothing went missing.
  const coverage = computeRequirementCoverage(structuredClone(built.input));
  assert.equal(coverage.counts.unexpected_observed, 0);
  assert.equal(coverage.cells.length, built.input.needs.length + 1);
  assert.deepEqual(built.input.stages, FIXTURE.request.stage_declarations);
  assert.deepEqual(built.input.risks, FIXTURE.request.risks);
  assert.deepEqual(built.input.cutoffs, FIXTURE.request.cutoffs);
});

// ---------------------------------------------------------------- 12. minted identity

test('every minted identifier is a pure function of the request and can be re-derived', () => {
  const built = buildRequirementCoverageInput(fixtureRequest());
  const hex = (domain, parts) => createHash('sha256')
    .update(`${domain}${NUL}${parts.join(NUL)}`, 'utf8').digest('hex');
  const uuid = (domain, parts) => {
    const digest = hex(domain, parts).slice(0, 32);
    return [digest.slice(0, 8), digest.slice(8, 12), digest.slice(12, 16), digest.slice(16, 20), digest.slice(20, 32)]
      .join('-');
  };

  const documentRef = FIXTURE.request.document_binding.document_ref;
  const row = FIXTURE.request.requirement_index.rows
    .find((candidate) => candidate.requirement_id === 'Q-ZZ_ALPHA-MEC-001');
  const requirement = requirementOf(built, 'Q-ZZ_ALPHA-MEC-001');

  assert.equal(requirement.requirement_ref.entity_id,
    uuid('soulforge.requirement_trace.candidate_requirement.entity.v0',
      [documentRef.entity_id, 'Q-ZZ_ALPHA-MEC-001']));
  assert.equal(requirement.requirement_ref.revision_id,
    uuid('soulforge.requirement_trace.candidate_requirement.revision.v0',
      [documentRef.revision_id, row.block_text_sha256]));
  // The block digest already is the byte identity of the requirement text.
  assert.equal(requirement.requirement_ref.content_id, row.block_text_sha256);
  assert.equal(requirement.requirement_ref.content_hash_alg, 'sha256');

  const requirementKey = manifestRowOf(built, 'Q-ZZ_ALPHA-MEC-001').requirement_key;
  const need = built.input.needs.find((candidate) => candidate.requirement_ref.entity_id
    === requirement.requirement_ref.entity_id && candidate.needed_artifact_type_id === 'design_document');
  assert.equal(need.need_id,
    `need:${hex('soulforge.requirement_trace.need.v0', [requirementKey, 'design_document', 'covers']).slice(0, 24)}`);

  const observation = built.input.observations.find((candidate) => candidate.requirement_key === requirementKey
    && candidate.artifact_type_id === 'design_document');
  assert.equal(observation.observation_id,
    `obs:${hex('soulforge.requirement_trace.observation.v0',
      ['artifact-obs-001', requirementKey, 'design_document', 'covers']).slice(0, 24)}`);

  // The entity persists across document revisions; the revision does not.
  const nextRevision = fixtureRequest();
  nextRevision.document_binding.document_ref.revision_id = 'doc-rev-3';
  const rebuilt = buildRequirementCoverageInput(nextRevision);
  const same = requirementOf(rebuilt, 'Q-ZZ_ALPHA-MEC-001');
  assert.equal(same.requirement_ref.entity_id, requirement.requirement_ref.entity_id);
  assert.notEqual(same.requirement_ref.revision_id, requirement.requirement_ref.revision_id);

  for (const ref of [requirement.requirement_ref, need.policy_ref]) {
    assert.match(ref.entity_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    assert.match(ref.revision_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    assert.match(ref.content_id, /^sha256:[0-9a-f]{64}$/u);
  }
  // Relabelling a policy revision does not change the bytes a coverage cell rests on.
  const relabelled = fixtureRequest();
  relabelled.needs_policy.policy_identity.revision_label = 'r2';
  const relabelledPolicyRef = buildRequirementCoverageInput(relabelled).manifest.policy.policy_ref;
  assert.equal(relabelledPolicyRef.content_id, built.manifest.policy.policy_ref.content_id);
  assert.notEqual(relabelledPolicyRef.revision_id, built.manifest.policy.policy_ref.revision_id);
});

test('writing the same policy declarations in another order is the same policy', () => {
  const first = buildRequirementCoverageInput(fixtureRequest());

  // R1 hashes policy_ref.content_id into every cell id, so an order-sensitive policy digest
  // would renumber the whole coverage sheet on an edit that declared nothing new.
  const reordered = fixtureRequest();
  reordered.needs_policy.needs.reverse();
  reordered.needs_policy.device_code_map.reverse();
  reordered.needs_policy.function_code_map.reverse();
  reordered.needs_policy.stages.reverse();
  const second = buildRequirementCoverageInput(reordered);

  assert.deepEqual(second.manifest.policy.policy_ref, first.manifest.policy.policy_ref);
  assert.equal(second.receipt.output_digests.coverage_input, first.receipt.output_digests.coverage_input);
  assert.deepEqual(second.input.needs, first.input.needs);
  // The receipt still binds the policy as supplied, so that digest does move: "the same
  // declarations" and "the same bytes on the wire" are different claims and stay separate.
  assert.notEqual(second.receipt.input_digests.needs_policy, first.receipt.input_digests.needs_policy);

  // Changing an actual declaration does change the identity.
  const changed = fixtureRequest();
  changed.needs_policy.needs[0].needed_artifact_type_id = 'design_review_record';
  assert.notEqual(buildRequirementCoverageInput(changed).manifest.policy.policy_ref.content_id,
    first.manifest.policy.policy_ref.content_id);
});

// ---------------------------------------------------------------- 13. separator variants

test('a family pattern that names its separator records the variant and still keeps them apart', () => {
  const withSeparator = fixtureRequest();
  withSeparator.needs_policy.family_pattern = '^Q(?<sep>[-_])ZZ_(?<device>[A-Z]+)-(?<function>[A-Z]{3})$';
  const built = buildRequirementCoverageInput(withSeparator);

  assert.equal(manifestRowOf(built, 'Q-ZZ_BETA-SWF-001').separator_variant, '-');
  assert.equal(manifestRowOf(built, 'Q_ZZ_BETA-SWF-001').separator_variant, '_');
  assert.equal(built.receipt.counts.admitted, FIXTURE.expected.counts.admitted);

  // Without a declared `sep` group the key is simply absent rather than null.
  const plain = buildRequirementCoverageInput(fixtureRequest());
  assert.equal(Object.hasOwn(manifestRowOf(plain, 'Q-ZZ_BETA-SWF-001'), 'separator_variant'), false);
});

// ---------------------------------------------------------------- 14. purity of the call

test('the request is not mutated and both returned shapes are deep frozen', () => {
  const request = fixtureRequest();
  const before = JSON.stringify(request);
  const built = buildRequirementCoverageInput(request);
  assert.equal(JSON.stringify(request), before);
  assert.equal(Object.isFrozen(request), false);
  assert.equal(Object.isFrozen(request.risks), false);

  const projected = projectRequirementCoverageFromIndex(request);
  assert.equal(JSON.stringify(request), before);

  const frozen = [
    built, built.input, built.input.requirements, built.input.requirements[0],
    built.input.requirements[0].requirement_ref, built.input.needs, built.input.observations,
    built.input.observations[0].evidence_refs, built.input.risks, built.input.stages, built.input.cutoffs,
    built.manifest, built.manifest.holds, built.manifest.holds[0], built.manifest.requirements[0],
    built.manifest.not_in_baseline, built.manifest.fan_out, built.receipt, built.receipt.effects,
    built.receipt.counts, built.receipt.counts.held, built.receipt.input_digests, built.receipt.output_digests,
    projected, projected.coverage, projected.receipt, projected.receipt.coverage_receipt,
  ];
  for (const value of frozen) assert.equal(Object.isFrozen(value), true);

  assert.throws(() => { built.receipt.counts.admitted = 99; }, TypeError);
  assert.throws(() => { built.manifest.holds.push({}); }, TypeError);
  assert.equal(built.receipt.counts.admitted, FIXTURE.expected.counts.admitted);
});

// ---------------------------------------------------------------- 15. the receipt

test('the receipt claims nothing above observed and reports no effect at all', () => {
  const built = buildRequirementCoverageInput(fixtureRequest());

  assert.equal(built.receipt.builder_version, 'v0');
  assert.equal(built.receipt.deterministic, true);
  assert.equal(built.receipt.claim_ceiling, 'observed');
  assert.equal(built.receipt.d37, 'requirement_ids_are_observed_candidates_only');
  assert.equal(built.receipt.d38, 'needs_from_policy_extending_stage_expected_artifact_policy');
  assert.equal(built.receipt.policy_status, 'candidate');
  for (const [name, value] of Object.entries(built.receipt.effects)) {
    assert.equal(value, 0, `effect ${name} must be zero`);
  }
  assert.deepEqual(Object.keys(built.receipt.input_digests).sort(), [
    'artifact_observations', 'baseline_binding', 'cutoffs', 'document_binding',
    'needs_policy', 'requirement_index', 'risks', 'stage_declarations',
  ]);
  assert.deepEqual(Object.keys(built.receipt.output_digests).sort(), ['coverage_input', 'manifest']);
  // A hold reason with no rows is reported as zero rather than omitted, so a reader cannot
  // mistake "not counted" for "did not happen". Both tallies carry the full key set.
  assert.deepEqual(Object.keys(built.receipt.counts.held).sort(), Object.values(HOLD_REASONS).sort());
  assert.deepEqual(Object.keys(built.receipt.counts.held_faults).sort(), Object.values(HOLD_REASONS).sort());

  // The receipt carries no requirement text, no title, and no document body.
  const rendered = JSON.stringify(built.receipt);
  for (const row of FIXTURE.request.requirement_index.rows) {
    if (row.title !== null) assert.equal(rendered.includes(row.title), false);
  }
});

// ---------------------------------------------------------------- 16. static effect pin

test('the builder and everything it imports read no file, clock, network, or model', () => {
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
  walk(new URL('./coverage_input_builder.mjs', import.meta.url));

  // R1 and the kernel modules it reuses are inside the graph, so the pin covers them too.
  assert.ok(seen.size >= 3, 'the import graph should include R1 and the kernel modules it reuses');
  assert.ok(seen.has(new URL('./requirement_coverage.mjs', import.meta.url).href));
  for (const [href, source] of seen) {
    for (const token of FORBIDDEN) {
      assert.equal(source.includes(token), false, `${href} must not contain "${token}"`);
    }
  }

  const entry = seen.get(new URL('./coverage_input_builder.mjs', import.meta.url).href);
  assert.equal(entry.includes('import.meta.main'), false);
  assert.equal(entry.includes('process.'), false);
});

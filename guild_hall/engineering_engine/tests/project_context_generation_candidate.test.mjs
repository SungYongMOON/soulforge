import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canonicalise } from '../kernel/canonical.mjs';
import {
  buildProjectContextGenerationCandidate,
} from '../kernel/project_context_generation_candidate.mjs';

const VALID_AT = '2026-08-01T00:00:00.000Z';
const KNOWN_AT = '2026-08-02T00:00:00.000Z';
const CUTOFF_VALID_AT = '2026-08-05T00:00:00.000Z';
const CUTOFF_KNOWN_AT = '2026-08-06T00:00:00.000Z';
const MODULE_URL = new URL('../kernel/project_context_generation_candidate.mjs', import.meta.url);

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function digestRef(seed) {
  return `sha256:${digest(seed)}`;
}

function exactRef(seed, contentId = digestRef(`ref:${seed}`)) {
  const token = String(seed).padStart(12, '0');
  return {
    entity_id: `00000000-0000-4000-8000-${token}`,
    revision_id: `10000000-0000-4000-8000-${token}`,
    content_id: contentId,
    content_hash_alg: 'sha256',
  };
}

function cloneRef(ref) {
  return structuredClone(ref);
}

function canonicalDigest(domain, value, rules = {}) {
  return `sha256:${digest(`${domain}\0${canonicalise(value, rules)}`)}`;
}

function refreshTimelineDigest(input) {
  input.timeline.ordered_entry_digest_sha256 = canonicalDigest(
    'soulforge.project_context_generation.timeline_entries.v0',
    input.timeline.entries,
    { '': 'insertion_ordered' },
  );
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function assertHold(result, expectedCode) {
  assert.equal(result.receipt.status, 'HOLD');
  assert.ok(result.receipt.blocker_codes.includes(expectedCode));
  assert.deepEqual(result.receipt.effects, {
    persistent_writes: 0,
    model_calls: 0,
    network_calls: 0,
    erp_writes: 0,
    taskdriver_activations: 0,
    task_calls: 0,
    hpp_writer_calls: 0,
    legacy_csv_writer_calls: 0,
  });
  assert.equal(result.receipt.authority.accepted, false);
  assert.equal(result.receipt.authority.generation_advanced, false);
}

function fixture() {
  const projectBindingRef = exactRef(1);
  const p4DocumentRevisionRef = exactRef(2);
  const commonRevisionRef = exactRef(3);
  const sourceRevisionRefs = [4, 5, 6, 7, 8, 9].map((seed) => exactRef(seed));
  const provenanceEvidenceRefs = [40, 41, 42, 43].map((seed) => exactRef(seed));
  const sourceLanes = [
    'mail', 'slack', 'voice', 'structured_pc_work', 'team_files', 'run_logs',
  ];
  const p4SourceReceipt = digestRef('p4-source-receipt');
  const p4SourceRevisionSet = [{
    source_revision_receipt_sha256: p4SourceReceipt,
    document_revision_ref: cloneRef(p4DocumentRevisionRef),
  }];
  const p4SourceRevisionSetSha256 = canonicalDigest(
    'soulforge.project_pdf_knowledge.p5_input.v0',
    p4SourceRevisionSet,
    { '': 'insertion_ordered' },
  );
  const timelineProjectRef = 'project:synthetic-alpha';
  const projectContextRef = 'project-context:synthetic-alpha';
  const timelineProjectionDigest = digestRef('timeline-projection');
  const reviewProposalRef = exactRef(30);
  const timelineEntries = sourceLanes.map((sourceLane, index) => ({
    entry_ref: `timeline-entry:${index + 1}`,
    source_lane: sourceLane,
    source_revision_ref: cloneRef(sourceRevisionRefs[index]),
    source_span_ref: `source-span:${index + 1}`,
    context_event_ref: `context-event:${index + 1}`,
    context_unit_ref: `context-unit:${Math.floor(index / 2) + 1}`,
    context_branch_ref: `context-branch:${Math.floor(index / 2) + 1}`,
    project_context_ref: projectContextRef,
    correction_state: 'original',
    valid_at: VALID_AT,
    known_at: KNOWN_AT,
  }));
  const timelineOrderedEntryDigest = canonicalDigest(
    'soulforge.project_context_generation.timeline_entries.v0',
    timelineEntries,
    { '': 'insertion_ordered' },
  );
  const crosswalkMaterial = {
    p4_project_binding_ref: cloneRef(projectBindingRef),
    m2_project_binding_ref: cloneRef(projectBindingRef),
    timeline_project_ref: timelineProjectRef,
    project_context_ref: projectContextRef,
    p4_source_revision_set_sha256: p4SourceRevisionSetSha256,
    timeline_projection_digest_sha256: timelineProjectionDigest,
    timeline_ordered_entry_digest_sha256: timelineOrderedEntryDigest,
    valid_at: VALID_AT,
    known_at: KNOWN_AT,
  };
  const crosswalkDigest = canonicalDigest(
    'soulforge.project_context_generation.crosswalk.v0',
    crosswalkMaterial,
  );
  const sourceRevisionSet = [
    {
      scope: 'project',
      source_revision_ref: cloneRef(p4DocumentRevisionRef),
      source_revision_receipt_sha256: p4SourceReceipt,
      inclusion_state: 'included',
      correction_state: 'original',
      valid_at: VALID_AT,
      known_at: KNOWN_AT,
    },
    {
      scope: 'common',
      source_revision_ref: cloneRef(commonRevisionRef),
      source_revision_receipt_sha256: digestRef('common-source-receipt'),
      inclusion_state: 'included',
      correction_state: 'original',
      valid_at: VALID_AT,
      known_at: KNOWN_AT,
    },
    ...sourceRevisionRefs.map((sourceRevisionRef) => ({
      scope: 'project',
      source_revision_ref: cloneRef(sourceRevisionRef),
      source_revision_receipt_sha256: digestRef(sourceRevisionRef.entity_id),
      inclusion_state: 'included',
      correction_state: 'original',
      valid_at: VALID_AT,
      known_at: KNOWN_AT,
    })),
  ];
  const memberships = [
    {
      source_span_ref: 'source-span:knowledge',
      source_revision_ref: cloneRef(p4DocumentRevisionRef),
      source_lane: 'knowledge',
      evidence_ref: exactRef(70),
      context_event_ref: 'context-event:knowledge',
      context_unit_ref: 'context-unit:knowledge',
      context_branch_ref: 'context-branch:knowledge',
      project_context_ref: projectContextRef,
      correction_state: 'original',
      review_requirement: 'not_required',
      valid_at: VALID_AT,
      known_at: KNOWN_AT,
    },
    {
      source_span_ref: 'source-span:common',
      source_revision_ref: cloneRef(commonRevisionRef),
      source_lane: 'common',
      evidence_ref: exactRef(71),
      context_event_ref: 'context-event:common',
      context_unit_ref: 'context-unit:common',
      context_branch_ref: 'context-branch:common',
      project_context_ref: projectContextRef,
      correction_state: 'original',
      review_requirement: 'required',
      review_proposal_ref: cloneRef(reviewProposalRef),
      valid_at: VALID_AT,
      known_at: KNOWN_AT,
    },
    ...timelineEntries.map((entry, index) => ({
      source_span_ref: entry.source_span_ref,
      source_revision_ref: cloneRef(entry.source_revision_ref),
      source_lane: entry.source_lane,
      evidence_ref: cloneRef(provenanceEvidenceRefs[index] ?? exactRef(80 + index)),
      context_event_ref: entry.context_event_ref,
      context_unit_ref: entry.context_unit_ref,
      context_branch_ref: entry.context_branch_ref,
      project_context_ref: entry.project_context_ref,
      correction_state: entry.correction_state,
      review_requirement: 'not_required',
      valid_at: entry.valid_at,
      known_at: entry.known_at,
    })),
  ];

  return deepFreeze({
    schema_version: 'soulforge.project_context_generation_candidate_request.v0',
    p4: {
      schema_version: 'soulforge.project_pdf_p5_input_candidate.v0',
      p4_candidate_ref: exactRef(20, digestRef('p4-candidate')),
      p4_candidate_sha256: digestRef('p4-candidate'),
      status: 'candidate_not_accepted',
      feature_state: 'off',
      project_binding_ref: cloneRef(projectBindingRef),
      source_revision_set: p4SourceRevisionSet,
      source_revision_set_sha256: p4SourceRevisionSetSha256,
      acceptance_allowed: false,
      accepted_generation_created: false,
      missing_acceptance_requirements: [
        'bitemporal_stamps',
        'coverage_and_gap',
        'unresolved_supersession',
        'reviewer_state',
        'writer_epoch',
      ],
      valid_at: VALID_AT,
      known_at: KNOWN_AT,
    },
    m2: {
      schema_version: 'soulforge.project_context_generation_m2_witness.v0',
      assessment_ref: exactRef(21, digestRef('m2-assessment')),
      assessment_digest_sha256: digestRef('m2-assessment'),
      project_binding_ref: cloneRef(projectBindingRef),
      status: 'assessed',
      claim_ceiling: 'observed',
      source_content_membership_verified: false,
      source_truth_validated: false,
      freshness_validated: false,
      terminal_provenance_validated: false,
      provenance_evidence: [
        'source_content_membership',
        'source_truth',
        'freshness',
        'terminal_provenance',
      ].map((claim, index) => ({
        claim,
        evidence_ref: cloneRef(provenanceEvidenceRefs[index]),
        source_revision_ref: cloneRef(sourceRevisionRefs[index]),
        state: 'satisfied',
        valid_at: VALID_AT,
        known_at: KNOWN_AT,
      })),
      valid_at: VALID_AT,
      known_at: KNOWN_AT,
    },
    timeline: {
      schema_version: 'soulforge.project_context_generation_timeline_input.v0',
      timeline_projection_ref: exactRef(22, timelineProjectionDigest),
      timeline_projection_digest_sha256: timelineProjectionDigest,
      projection_generation_id: 'timeline-generation:synthetic-1',
      project_ref: timelineProjectRef,
      ordered_entry_digest_sha256: timelineOrderedEntryDigest,
      entries: timelineEntries,
      valid_at: VALID_AT,
      known_at: KNOWN_AT,
    },
    project_crosswalk: {
      schema_version: 'soulforge.project_context_generation_crosswalk.v0',
      crosswalk_ref: exactRef(23, crosswalkDigest),
      crosswalk_digest_sha256: crosswalkDigest,
      ...crosswalkMaterial,
    },
    source_revision_set: sourceRevisionSet,
    memberships,
    coverage: {
      schema_version: 'soulforge.project_context_generation_coverage.v0',
      source_lanes: sourceLanes.map((source_lane) => ({
        source_lane,
        state: 'covered',
        valid_at: VALID_AT,
        known_at: KNOWN_AT,
      })),
    },
    reviews: [{
      proposal_ref: cloneRef(reviewProposalRef),
      reviewer_state: 'pending_registered_human_review',
      valid_at: VALID_AT,
      known_at: KNOWN_AT,
    }],
    writer: {
      schema_version: 'soulforge.project_context_generation_writer_witness.v0',
      hpp_writer_ref: exactRef(24),
      sole_writer: true,
      writer_epoch_ref: exactRef(25),
      writer_epoch: 4,
      project_binding_ref: cloneRef(projectBindingRef),
      status: 'bound',
      valid_at: VALID_AT,
      known_at: KNOWN_AT,
    },
    lineage: {
      schema_version: 'soulforge.project_context_generation_lineage.v0',
      prior_generation: {
        generation: 3,
        generation_ref: exactRef(26),
        accepted_input_set_digest_sha256: digestRef('prior-input-set'),
        cas_fingerprint_sha256: digestRef('prior-cas'),
        supersession_state: 'superseded_by_current_proposal',
        valid_at: VALID_AT,
        known_at: KNOWN_AT,
      },
      current_generation: {
        generation: 4,
        generation_ref: exactRef(27),
        supersedes_generation_ref: exactRef(26),
        valid_at: VALID_AT,
        known_at: KNOWN_AT,
      },
      observed_prior_cas_fingerprint_sha256: digestRef('prior-cas'),
      generation_cutoff: {
        valid_at: CUTOFF_VALID_AT,
        known_at: CUTOFF_KNOWN_AT,
      },
    },
  });
}

test('builds a deterministic P5 candidate that is ready for registered-human review only', () => {
  const result = buildProjectContextGenerationCandidate(fixture());

  assert.deepEqual(result.receipt.blocker_codes, []);
  assert.equal(result.candidate.status, 'ready_for_registered_human_review');
  assert.equal(result.receipt.status, 'ready_for_registered_human_review');
  assert.equal(result.candidate.candidate_only, true);
  assert.equal(result.candidate.project_context.project_context_ref, 'project-context:synthetic-alpha');
  assert.equal(result.candidate.project_context.source_revision_membership.length, 8);
  assert.equal(result.candidate.project_context.memberships.length, 8);
  assert.deepEqual(
    result.candidate.project_context.coverage.map((entry) => entry.state),
    ['covered', 'covered', 'covered', 'covered', 'covered', 'covered'],
  );
  assert.equal(result.candidate.accepted_input_set_candidate.acceptance_allowed, false);
  assert.equal(result.candidate.writer_anchor.sole_writer, true);
  assert.equal(result.candidate.writer_anchor.writer_epoch, 4);
  assert.equal(
    result.candidate.input_crosswalk.p4_candidate_ref.content_id,
    result.candidate.input_crosswalk.p4_candidate_sha256,
  );
  assert.equal(
    result.candidate.input_crosswalk.m2_assessment_ref.content_id,
    result.candidate.input_crosswalk.m2_assessment_digest_sha256,
  );
  assert.match(
    result.candidate.input_crosswalk.m2_provenance_evidence_digest_sha256,
    /^sha256:[0-9a-f]{64}$/u,
  );
  assert.equal(Object.values(result.candidate.authority).every((value) => value === false), true);
  assert.equal(result.candidate.authority.accepted, false);
  assert.equal(result.candidate.authority.generation_advanced, false);
  assert.deepEqual(result.candidate.effects, {
    persistent_writes: 0,
    model_calls: 0,
    network_calls: 0,
    erp_writes: 0,
    taskdriver_activations: 0,
    task_calls: 0,
    hpp_writer_calls: 0,
    legacy_csv_writer_calls: 0,
  });
  assert.equal(result.receipt.blocker_codes.length, 0);
  assert.match(result.receipt.source_revision_set_digest_sha256, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.receipt.membership_digest_sha256, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.candidate.accepted_input_set_candidate.digest_sha256, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.candidate.generation_proposal.cas_fingerprint_sha256, /^sha256:[0-9a-f]{64}$/u);
  assertDeepFrozen(result);
});

test('rejects known_at before valid_at even when each timestamp is inside its cutoff', () => {
  const input = structuredClone(fixture());
  input.m2.valid_at = '2026-08-04T00:00:00.000Z';

  const result = buildProjectContextGenerationCandidate(input);

  assertHold(result, 'P5_CONTEXT_BITEMPORAL_INVALID');
});

test('replays the same candidate and receipt when set-like inputs are reordered', () => {
  const ordered = buildProjectContextGenerationCandidate(fixture());
  const reorderedInput = structuredClone(fixture());
  reorderedInput.source_revision_set.reverse();
  reorderedInput.memberships.reverse();
  reorderedInput.coverage.source_lanes.reverse();
  const reordered = buildProjectContextGenerationCandidate(reorderedInput);

  assert.deepEqual(reordered, ordered);
});

test('holds a reordered timeline whose externally declared ordered digest was not replayed', () => {
  const input = structuredClone(fixture());
  input.timeline.entries.reverse();

  assertHold(
    buildProjectContextGenerationCandidate(input),
    'P5_CONTEXT_TIMELINE_DIGEST_MISMATCH',
  );
});

test('holds a graph whose opaque project-context ref is not the crosswalk-bound project', () => {
  const input = structuredClone(fixture());
  for (const membership of input.memberships) {
    membership.project_context_ref = 'project-context:synthetic-beta';
  }
  for (const entry of input.timeline.entries) {
    entry.project_context_ref = 'project-context:synthetic-beta';
  }

  assertHold(
    buildProjectContextGenerationCandidate(input),
    'P5_CONTEXT_CROSSWALK_MISMATCH',
  );
});

test('holds a self-consistent timeline wrapper that is not bound by the external crosswalk', () => {
  const input = structuredClone(fixture());
  input.timeline.entries[0].source_span_ref = 'source-span:forged';
  input.memberships[2].source_span_ref = 'source-span:forged';
  refreshTimelineDigest(input);

  assertHold(
    buildProjectContextGenerationCandidate(input),
    'P5_CONTEXT_TIMELINE_PROJECT_MISMATCH',
  );
});

test('binds writer, prior-generation, M2 evidence, and timeline generation anchors into input and CAS digests', () => {
  const baseline = buildProjectContextGenerationCandidate(fixture());
  const cases = [
    {
      name: 'HPP writer identity',
      mutate(input) { input.writer.hpp_writer_ref = exactRef(993); },
    },
    {
      name: 'prior accepted input set',
      mutate(input) { input.lineage.prior_generation.accepted_input_set_digest_sha256 = digestRef('other-prior-input'); },
    },
    {
      name: 'prior CAS',
      mutate(input) {
        input.lineage.prior_generation.cas_fingerprint_sha256 = digestRef('other-prior-cas');
        input.lineage.observed_prior_cas_fingerprint_sha256 = digestRef('other-prior-cas');
      },
    },
    {
      name: 'M2 claim-to-evidence mapping',
      mutate(input) {
        const first = input.m2.provenance_evidence[0].claim;
        input.m2.provenance_evidence[0].claim = input.m2.provenance_evidence[1].claim;
        input.m2.provenance_evidence[1].claim = first;
      },
    },
    {
      name: 'timeline projection generation',
      mutate(input) { input.timeline.projection_generation_id = 'timeline-generation:synthetic-2'; },
    },
  ];
  for (const entry of cases) {
    const input = structuredClone(fixture());
    entry.mutate(input);
    const candidate = buildProjectContextGenerationCandidate(input);
    assert.equal(candidate.candidate.status, 'ready_for_registered_human_review', entry.name);
    assert.notEqual(
      candidate.candidate.accepted_input_set_candidate.digest_sha256,
      baseline.candidate.accepted_input_set_candidate.digest_sha256,
      entry.name,
    );
    assert.notEqual(
      candidate.candidate.generation_proposal.cas_fingerprint_sha256,
      baseline.candidate.generation_proposal.cas_fingerprint_sha256,
      entry.name,
    );
  }
});

test('binds each top-level bitemporal witness into input and CAS digests', () => {
  const baseline = buildProjectContextGenerationCandidate(fixture());
  const cases = [
    {
      name: 'P4 witness valid_at',
      mutate(input) { input.p4.valid_at = '2026-08-01T12:00:00.000Z'; },
    },
    {
      name: 'M2 witness known_at',
      mutate(input) { input.m2.known_at = '2026-08-03T00:00:00.000Z'; },
    },
    {
      name: 'timeline witness known_at',
      mutate(input) { input.timeline.known_at = '2026-08-03T00:00:00.000Z'; },
    },
    {
      name: 'writer witness known_at',
      mutate(input) { input.writer.known_at = '2026-08-03T00:00:00.000Z'; },
    },
    {
      name: 'current generation known_at',
      mutate(input) { input.lineage.current_generation.known_at = '2026-08-03T00:00:00.000Z'; },
    },
  ];
  for (const entry of cases) {
    const input = structuredClone(fixture());
    entry.mutate(input);
    const candidate = buildProjectContextGenerationCandidate(input);
    assert.equal(candidate.candidate.status, 'ready_for_registered_human_review', entry.name);
    assert.notEqual(
      candidate.candidate.accepted_input_set_candidate.digest_sha256,
      baseline.candidate.accepted_input_set_candidate.digest_sha256,
      entry.name,
    );
    assert.notEqual(
      candidate.candidate.generation_proposal.cas_fingerprint_sha256,
      baseline.candidate.generation_proposal.cas_fingerprint_sha256,
      entry.name,
    );
  }
});

test('holds mismatched, stale, foreign, duplicate, and unbound minimum inputs before effects', () => {
  const cases = [
    {
      name: 'missing root member',
      mutate(input) { delete input.m2; },
      code: 'P5_CONTEXT_INPUT_INVALID',
    },
    {
      name: 'mixed P4 and M2 project bindings',
      mutate(input) { input.m2.project_binding_ref = exactRef(500); },
      code: 'P5_CONTEXT_M2_PROJECT_MISMATCH',
    },
    {
      name: 'stale contributor known cutoff',
      mutate(input) { input.timeline.entries[0].known_at = '2026-08-07T00:00:00.000Z'; },
      code: 'P5_CONTEXT_BITEMPORAL_STALE',
    },
    {
      name: 'foreign revision membership',
      mutate(input) { input.memberships[0].source_revision_ref = exactRef(501); },
      code: 'P5_CONTEXT_MEMBERSHIP_FOREIGN',
    },
    {
      name: 'duplicate exact source revision',
      mutate(input) { input.source_revision_set.push(structuredClone(input.source_revision_set[0])); },
      code: 'P5_CONTEXT_MEMBERSHIP_DUPLICATE',
    },
    {
      name: 'unbound HPP writer epoch',
      mutate(input) { input.writer.status = 'unbound'; },
      code: 'P5_CONTEXT_WRITER_UNBOUND',
    },
    {
      name: 'writer is not the sole HPP context writer',
      mutate(input) { input.writer.sole_writer = false; },
      code: 'P5_CONTEXT_WRITER_UNBOUND',
    },
    {
      name: 'CAS mismatch on the prior generation',
      mutate(input) { input.lineage.observed_prior_cas_fingerprint_sha256 = digestRef('wrong-cas'); },
      code: 'P5_CONTEXT_CAS_MISMATCH',
    },
  ];

  for (const entry of cases) {
    const input = structuredClone(fixture());
    entry.mutate(input);
    assertHold(buildProjectContextGenerationCandidate(input), entry.code);
  }
});

test('requires every root-level minimum input before it can make a candidate', () => {
  for (const field of [
    'p4',
    'm2',
    'timeline',
    'project_crosswalk',
    'source_revision_set',
    'memberships',
    'coverage',
    'reviews',
    'writer',
    'lineage',
  ]) {
    const input = structuredClone(fixture());
    delete input[field];
    const result = buildProjectContextGenerationCandidate(input);
    assertHold(result, 'P5_CONTEXT_INPUT_INVALID');
    assert.equal(result.candidate, null);
  }
});

test('holds broken P4, crosswalk, coverage, review, lineage, and classification contracts', () => {
  const cases = [
    {
      name: 'P4 source-set digest',
      mutate(input) { input.p4.source_revision_set_sha256 = digestRef('wrong-p4-set'); },
      code: 'P5_CONTEXT_P4_INVALID',
    },
    {
      name: 'P4 ref to digest binding',
      mutate(input) { input.p4.p4_candidate_ref.content_id = digestRef('wrong-p4-ref'); },
      code: 'P5_CONTEXT_P4_INVALID',
    },
    {
      name: 'M2 ref to digest binding',
      mutate(input) { input.m2.assessment_ref.content_id = digestRef('wrong-m2-ref'); },
      code: 'P5_CONTEXT_M2_INVALID',
    },
    {
      name: 'timeline ref to projection digest binding',
      mutate(input) { input.timeline.timeline_projection_ref.content_id = digestRef('wrong-timeline-ref'); },
      code: 'P5_CONTEXT_TIMELINE_INVALID',
    },
    {
      name: 'crosswalk digest',
      mutate(input) { input.project_crosswalk.crosswalk_digest_sha256 = digestRef('wrong-crosswalk'); },
      code: 'P5_CONTEXT_CROSSWALK_INVALID',
    },
    {
      name: 'timeline project crosswalk',
      mutate(input) { input.timeline.project_ref = 'project:synthetic-beta'; },
      code: 'P5_CONTEXT_TIMELINE_PROJECT_MISMATCH',
    },
    {
      name: 'undeclared source-lane absence',
      mutate(input) { input.coverage.source_lanes.pop(); },
      code: 'P5_CONTEXT_COVERAGE_LANE_MISSING',
    },
    {
      name: 'missing reviewer state',
      mutate(input) { delete input.reviews[0].reviewer_state; },
      code: 'P5_CONTEXT_REVIEW_INVALID',
    },
    {
      name: 'prior-generation supersession link',
      mutate(input) { input.lineage.current_generation.supersedes_generation_ref = exactRef(990); },
      code: 'P5_CONTEXT_LINEAGE_INVALID',
    },
    {
      name: 'prior-generation known-time regression',
      mutate(input) { input.lineage.current_generation.known_at = '2026-08-01T00:00:00.000Z'; },
      code: 'P5_CONTEXT_LINEAGE_SUPERSESSION_INVALID',
    },
    {
      name: 'declared unclassified revision',
      mutate(input) { input.source_revision_set[0].inclusion_state = 'unclassified'; },
      code: 'P5_CONTEXT_MEMBERSHIP_UNCLASSIFIED',
    },
    {
      name: 'declared held conflict revision',
      mutate(input) { input.source_revision_set[0].inclusion_state = 'held_conflict'; },
      code: 'P5_CONTEXT_MEMBERSHIP_HELD_CONFLICT',
    },
  ];

  for (const entry of cases) {
    const input = structuredClone(fixture());
    entry.mutate(input);
    assertHold(buildProjectContextGenerationCandidate(input), entry.code);
  }
});

test('holds a source correction that regresses its predecessor known_at', () => {
  const input = structuredClone(fixture());
  const predecessorRevisionRef = exactRef(991);
  input.source_revision_set[1].correction_state = 'corrected';
  input.source_revision_set[1].predecessor_revision_ref = predecessorRevisionRef;
  input.source_revision_set.push({
    scope: 'common',
    source_revision_ref: structuredClone(predecessorRevisionRef),
    source_revision_receipt_sha256: digestRef('common-predecessor-receipt'),
    inclusion_state: 'included',
    correction_state: 'original',
    valid_at: VALID_AT,
    known_at: '2026-08-03T00:00:00.000Z',
  });
  const predecessorMembership = structuredClone(input.memberships[1]);
  predecessorMembership.source_span_ref = 'source-span:common-predecessor';
  predecessorMembership.source_revision_ref = structuredClone(predecessorRevisionRef);
  predecessorMembership.review_requirement = 'not_required';
  delete predecessorMembership.review_proposal_ref;
  input.memberships.push(predecessorMembership);

  assertHold(
    buildProjectContextGenerationCandidate(input),
    'P5_CONTEXT_LINEAGE_SUPERSESSION_INVALID',
  );
});

test('holds source and source-span correction cycles before candidate construction', () => {
  const sourceCycle = structuredClone(fixture());
  const firstSourceRef = structuredClone(sourceCycle.source_revision_set[0].source_revision_ref);
  const secondSourceRef = structuredClone(sourceCycle.source_revision_set[1].source_revision_ref);
  sourceCycle.source_revision_set[0].correction_state = 'corrected';
  sourceCycle.source_revision_set[0].predecessor_revision_ref = secondSourceRef;
  sourceCycle.source_revision_set[1].correction_state = 'corrected';
  sourceCycle.source_revision_set[1].predecessor_revision_ref = firstSourceRef;
  assertHold(
    buildProjectContextGenerationCandidate(sourceCycle),
    'P5_CONTEXT_LINEAGE_SUPERSESSION_INVALID',
  );

  const spanCycle = structuredClone(fixture());
  const firstSpan = spanCycle.memberships[0].source_span_ref;
  const secondSpan = spanCycle.memberships[1].source_span_ref;
  spanCycle.memberships[0].correction_state = 'corrected';
  spanCycle.memberships[0].predecessor_source_span_ref = secondSpan;
  spanCycle.memberships[1].correction_state = 'corrected';
  spanCycle.memberships[1].predecessor_source_span_ref = firstSpan;
  assertHold(
    buildProjectContextGenerationCandidate(spanCycle),
    'P5_CONTEXT_LINEAGE_SUPERSESSION_INVALID',
  );
});

test('holds competing correction forks over one predecessor revision or source span', () => {
  const sourceFork = structuredClone(fixture());
  const forkRef = exactRef(994);
  const forkRef2 = exactRef(996);
  sourceFork.source_revision_set.push({
    scope: 'project',
    source_revision_ref: structuredClone(forkRef),
    source_revision_receipt_sha256: digestRef('fork-receipt'),
    inclusion_state: 'included',
    correction_state: 'corrected',
    predecessor_revision_ref: structuredClone(sourceFork.source_revision_set[0].source_revision_ref),
    valid_at: VALID_AT,
    known_at: KNOWN_AT,
  });
  sourceFork.source_revision_set.push({
    scope: 'project',
    source_revision_ref: structuredClone(forkRef2),
    source_revision_receipt_sha256: digestRef('fork-receipt-2'),
    inclusion_state: 'included',
    correction_state: 'corrected',
    predecessor_revision_ref: structuredClone(sourceFork.source_revision_set[0].source_revision_ref),
    valid_at: VALID_AT,
    known_at: KNOWN_AT,
  });
  const forkMembership = structuredClone(sourceFork.memberships[0]);
  forkMembership.source_span_ref = 'source-span:fork';
  forkMembership.source_revision_ref = structuredClone(forkRef);
  forkMembership.correction_state = 'corrected';
  forkMembership.predecessor_source_span_ref = 'source-span:knowledge';
  sourceFork.memberships.push(forkMembership);
  const forkMembership2 = structuredClone(forkMembership);
  forkMembership2.source_span_ref = 'source-span:fork-2';
  forkMembership2.source_revision_ref = structuredClone(forkRef2);
  sourceFork.memberships.push(forkMembership2);
  assertHold(
    buildProjectContextGenerationCandidate(sourceFork),
    'P5_CONTEXT_LINEAGE_SUPERSESSION_INVALID',
  );

  const spanFork = structuredClone(fixture());
  const spanForkRef = exactRef(995);
  spanFork.source_revision_set.push({
    scope: 'project',
    source_revision_ref: structuredClone(spanForkRef),
    source_revision_receipt_sha256: digestRef('span-fork-receipt'),
    inclusion_state: 'included',
    correction_state: 'corrected',
    predecessor_revision_ref: structuredClone(spanFork.source_revision_set[0].source_revision_ref),
    valid_at: VALID_AT,
    known_at: KNOWN_AT,
  });
  for (const sourceSpanRef of ['source-span:fork-left', 'source-span:fork-right']) {
    const membership = structuredClone(spanFork.memberships[0]);
    membership.source_span_ref = sourceSpanRef;
    membership.source_revision_ref = structuredClone(spanForkRef);
    membership.correction_state = 'corrected';
    membership.predecessor_source_span_ref = 'source-span:knowledge';
    spanFork.memberships.push(membership);
  }
  assertHold(
    buildProjectContextGenerationCandidate(spanFork),
    'P5_CONTEXT_LINEAGE_SUPERSESSION_INVALID',
  );
});

test('binds correction state and predecessor lineage across source, membership, and timeline', () => {
  const sourceMembershipMismatch = structuredClone(fixture());
  sourceMembershipMismatch.source_revision_set[0].correction_state = 'corrected';
  sourceMembershipMismatch.source_revision_set[0].predecessor_revision_ref = structuredClone(
    sourceMembershipMismatch.source_revision_set[1].source_revision_ref,
  );
  assertHold(
    buildProjectContextGenerationCandidate(sourceMembershipMismatch),
    'P5_CONTEXT_LINEAGE_SUPERSESSION_INVALID',
  );

  const timelineMembershipMismatch = structuredClone(fixture());
  timelineMembershipMismatch.timeline.entries[0].correction_state = 'corrected';
  refreshTimelineDigest(timelineMembershipMismatch);
  assertHold(
    buildProjectContextGenerationCandidate(timelineMembershipMismatch),
    'P5_CONTEXT_LINEAGE_SUPERSESSION_INVALID',
  );
});

test('requires exact evidence before each M2-2 false provenance value can leave HOLD', () => {
  const cases = [
    ['source_content_membership', 'P5_CONTEXT_M2_SOURCE_MEMBERSHIP_UNPROVEN'],
    ['source_truth', 'P5_CONTEXT_M2_SOURCE_TRUTH_UNPROVEN'],
    ['freshness', 'P5_CONTEXT_M2_FRESHNESS_UNPROVEN'],
    ['terminal_provenance', 'P5_CONTEXT_M2_TERMINAL_PROVENANCE_UNPROVEN'],
  ];
  for (const [claim, code] of cases) {
    const input = structuredClone(fixture());
    input.m2.provenance_evidence = input.m2.provenance_evidence.filter(
      (entry) => entry.claim !== claim,
    );
    assertHold(buildProjectContextGenerationCandidate(input), code);
  }
});

test('refuses a forged M2-2 witness that flips observed false provenance flags', () => {
  const input = structuredClone(fixture());
  input.m2.source_content_membership_verified = true;
  input.m2.source_truth_validated = true;
  input.m2.freshness_validated = true;
  input.m2.terminal_provenance_validated = true;
  input.m2.provenance_evidence = [];

  assertHold(buildProjectContextGenerationCandidate(input), 'P5_CONTEXT_M2_INVALID');
});

test('requires M2 provenance evidence to bind an exact source-span membership', () => {
  const input = structuredClone(fixture());
  const evidence = input.m2.provenance_evidence.find((entry) => entry.claim === 'source_truth');
  evidence.evidence_ref = exactRef(992);

  assertHold(
    buildProjectContextGenerationCandidate(input),
    'P5_CONTEXT_M2_SOURCE_TRUTH_UNPROVEN',
  );
});

test('refuses alias, getter, proxy, and cycle inputs without invoking their traps', () => {
  const alias = structuredClone(fixture());
  alias.m2.assessment_ref = alias.p4.p4_candidate_ref;
  const aliasResult = buildProjectContextGenerationCandidate(alias);
  assertHold(aliasResult, 'P5_CONTEXT_INPUT_INVALID');
  assert.equal(aliasResult.candidate, null);

  const getter = structuredClone(fixture());
  let getterCalls = 0;
  Object.defineProperty(getter, 'p4', {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      return fixture().p4;
    },
  });
  assertHold(buildProjectContextGenerationCandidate(getter), 'P5_CONTEXT_INPUT_INVALID');
  assert.equal(getterCalls, 0);

  let proxyTrapCalls = 0;
  const proxy = new Proxy(structuredClone(fixture()), {
    ownKeys() {
      proxyTrapCalls += 1;
      return [];
    },
  });
  assertHold(buildProjectContextGenerationCandidate(proxy), 'P5_CONTEXT_INPUT_INVALID');
  assert.equal(proxyTrapCalls, 0);

  const cycle = structuredClone(fixture());
  cycle.writer.cycle = cycle;
  assertHold(buildProjectContextGenerationCandidate(cycle), 'P5_CONTEXT_INPUT_INVALID');
});

test('keeps forbidden source payload markers out of a HOLD receipt', () => {
  const marker = 'PRIVATE_PAYLOAD_MUST_NOT_ESCAPE_7f3d';
  const input = structuredClone(fixture());
  input.m2.raw_body = marker;

  const result = buildProjectContextGenerationCandidate(input);

  assertHold(result, 'P5_CONTEXT_INPUT_INVALID');
  assert.equal(JSON.stringify(result).includes(marker), false);
});

test('refuses a drive-shaped metadata reference without echoing it', () => {
  const input = structuredClone(fixture());
  const marker = 'C:';
  input.m2.assessment_ref.entity_id = marker;

  const result = buildProjectContextGenerationCandidate(input);

  assertHold(result, 'P5_CONTEXT_M2_INVALID');
  assert.equal(JSON.stringify(result).includes(marker), false);
});

test('refuses a drive-relative opaque graph reference without echoing it', () => {
  const input = structuredClone(fixture());
  const marker = 'C:private-marker';
  input.timeline.entries[0].project_context_ref = marker;

  const result = buildProjectContextGenerationCandidate(input);

  assertHold(result, 'P5_CONTEXT_TIMELINE_INVALID');
  assert.equal(JSON.stringify(result).includes(marker), false);
});

test('does not import an acceptance, advance, writer, or effect surface', () => {
  const source = readFileSync(MODULE_URL, 'utf8');
  for (const forbidden of [
    'evaluateP5Acceptance',
    'evaluateGenerationAdvance',
    'pipeline.mjs',
    'context_receipt.mjs',
    'haengbogwan_project_context',
    "node:fs",
    "node:net",
    "node:http",
    "node:child_process",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

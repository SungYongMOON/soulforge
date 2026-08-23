import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canonicalise } from '../kernel/canonical.mjs';
import { sha256Canonical } from '../../shared/project_history_envelope.mjs';
import { buildProjectPdfKnowledgeCandidate } from '../../rag/project_pdf_knowledge_projection.mjs';
import {
  buildProjectContextGenerationCandidate,
  computeProjectContextReviewContentDigest,
} from '../kernel/project_context_generation_candidate.mjs';
import {
  PROJECT_CONTEXT_ACCEPTED_GENERATION_SCHEMA,
  PROJECT_CONTEXT_ACCEPTED_GENERATION_RECEIPT_SCHEMA,
  PROJECT_CONTEXT_ACCEPTANCE_SUBMISSION_SCHEMA,
  PROJECT_CONTEXT_ACCEPTANCE_CODES,
  createInMemoryAcceptedContextGenerationStore,
  evaluateProjectContextAcceptance,
  verifyAcceptedGenerationManifest,
} from '../kernel/project_context_acceptance_gate.mjs';

const VALID = '2026-08-01T00:00:00.000Z';
const KNOWN = '2026-08-02T00:00:00.000Z';
const CUTOFF_VALID = '2026-08-05T00:00:00.000Z';
const CUTOFF_KNOWN = '2026-08-06T00:00:00.000Z';
const REVIEW_TIME = '2026-08-07T12:00:00.000Z';
const MODULE_URL = new URL('../kernel/project_context_acceptance_gate.mjs', import.meta.url);

function hex(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function hash(value) { return 'sha256:' + hex(value); }
function ref(seed, content = hash('ref:' + seed)) {
  const token = String(seed).padStart(12, '0');
  return { entity_id: '00000000-0000-4000-8000-' + token, revision_id: '10000000-0000-4000-8000-' + token, content_id: content, content_hash_alg: 'sha256' };
}
function copy(value) { return structuredClone(value); }
function freeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function rules(value, path, out) {
  const target = out || {};
  const current = path || '';
  if (Array.isArray(value)) {
    target[current] = 'insertion_ordered';
    value.forEach(function (item) { rules(item, current + '[]', target); });
  } else if (value !== null && typeof value === 'object') {
    Object.entries(value).forEach(function (entry) { rules(entry[1], current ? current + '.' + entry[0] : entry[0], target); });
  }
  return target;
}
function domainDigest(domain, value) { return 'sha256:' + hex(domain + '\0' + canonicalise(value, rules(value))); }

function trustedP4Receipt(admitted) {
  const a = admitted.admission;
  const x = admitted.ingest_candidate.extraction;
  const binding = {
    feature_state: 'off',
    project_binding_ref: a.project_binding_ref,
    document_revision_ref: a.document_revision_ref,
    document_read_grant_ref: a.document_read_grant_ref,
    knowledge_scope_fingerprint_sha256: a.knowledge_scope_fingerprint_sha256,
    local_admission_fingerprint_sha256: a.local_admission_fingerprint_sha256,
    portable_material_fingerprint_sha256: a.portable_material_fingerprint_sha256,
    relative_locator_fingerprint_sha256: a.relative_locator_fingerprint_sha256,
    source_content_sha256: 'sha256:' + admitted.ingest_candidate.source.sha256,
    extraction_text_sha256: 'sha256:' + x.text_sha256,
    page_count: x.page_count,
    character_count: x.character_count,
  };
  const bindingHash = domainDigest('soulforge.project_pdf_source_revision_binding.v0', binding);
  return domainDigest('soulforge.project_pdf_source_revision_receipt.v0', {
    schema_version: 'soulforge.project_pdf_source_revision_receipt.v0',
    kind: 'project_pdf_source_revision_receipt',
    status: 'candidate',
    feature_state: 'off',
    ...binding,
    source_revision_binding_sha256: bindingHash,
    supersession_status: 'not_evaluated',
    project_count: 1,
  });
}

function actualP4(projectRef) {
  const documentHash = hex('public-synthetic-p4-document');
  const pageTexts = ['Synthetic P4 requirement evidence.', 'Synthetic P4 verification evidence.'];
  const pages = pageTexts.map(function (text, index) { return { page_number: index + 1, text: text }; });
  const admitted = freeze({
    schema_version: 'soulforge.admitted_project_pdf_candidate.v0',
    kind: 'admitted_project_pdf_candidate',
    status: 'candidate',
    feature_state: 'off',
    route: 'validation_only',
    admission: {
      project_binding_ref: copy(projectRef),
      document_revision_ref: ref(2, 'sha256:' + documentHash),
      document_read_grant_ref: ref(3),
      knowledge_scope_fingerprint_sha256: hash('p4-scope'),
      local_admission_fingerprint_sha256: hash('p4-local'),
      portable_material_fingerprint_sha256: hash('p4-portable'),
      relative_locator_fingerprint_sha256: hash('p4-locator'),
      knowledge_view_project_read_allowed: false,
      document_read_grant_binding_verified: true,
    },
    ingest_candidate: {
      schema_version: 'soulforge.project_document_ingest_candidate.v0',
      status: 'candidate',
      source: { media_type: 'application/pdf', sha256: documentHash, byte_count: 101 },
      extraction: { engine: 'pymupdf', page_count: pages.length, character_count: pageTexts.join('').length, text_sha256: hex(pageTexts.join('')), pages: pages },
      authority: { source_truth: false, canon: false, project_state: false, approval: false },
      effects: { persistent_writes: 0, network_calls: 0, model_calls: 0, rag_index_writes: 0, wiki_writes: 0 },
    },
    authority: { source_truth: false, canon: false, project_state: false, approval: false, engine_input_allowed: false, activation_allowed: false, wiki_write_allowed: false, rag_write_allowed: false, erp_write_allowed: false, taskdriver_allowed: false },
    effects: { persistent_writes: 0, network_calls: 0, model_calls: 0, rag_index_writes: 0, wiki_writes: 0, engine_calls: 0 },
  });
  const result = buildProjectPdfKnowledgeCandidate({
    admitted_candidate: admitted,
    expected_project_binding_ref: copy(admitted.admission.project_binding_ref),
    expected_document_revision_ref: copy(admitted.admission.document_revision_ref),
    trusted_source_revision_receipt_sha256: trustedP4Receipt(admitted),
  });
  assert.ok(result.candidate);
  return JSON.parse(JSON.stringify(result));
}

function actualM2(projectRef, commonRef, manifestRef) {
  return {
    schema_version: 'soulforge.ax_se_project_context_pilot_assessment.v0',
    pilot_policy_revision: 'soulforge.ax_se_project_context_pilot_policy.v0',
    feature_state: 'off',
    mode: 'owner_frozen_manual_zero_write',
    status: 'assessed',
    claim_ceiling: 'observed',
    pilot_grant_ref: ref(30),
    project_binding_ref: copy(projectRef),
    knowledge_view: {
      authority_grant_ref: ref(31), policy_ref: ref(32), common_revision_refs: [copy(commonRef)],
      knowledge_scope_fingerprint_sha256: hash('m2-scope'),
      common_projection_bindings_fingerprint_sha256: hash('m2-common'),
      project_count: 1, common_revision_count: 1, common_projection_binding_count: 1,
      exact_project_binding_verified: true, policy_binding_verified: true,
      common_projection_binding_verified: true, engine_input_binding_verified: true,
      root_metadata_revalidated: true, root_relation: 'disjoint',
      body_loaded: false, retrieval_performed: false, enumeration_performed: false, foreign_lookup_performed: false,
    },
    project_source_binding: {
      manifest_ref: copy(manifestRef), manifest_binding_verified: true, exact_partition_verified: true,
      project_material_revision_count: 0, source_bodies_opened: false,
      source_content_membership_verified: false, source_truth_validated: false,
      freshness_validated: false, terminal_provenance_validated: false,
    },
    current_stage_code: 'synthetic-stage',
    role_bound_assessment: { schema_version: 'synthetic-role-bound-v0' },
    authority: { candidate_only: true, engine_input_general_authority: false, owner_decision_made: false, stage_cleared: false, assignment_made: false, task_intent_created: false, canon_promotion_allowed: false, live_current_claimed: false },
    gates: { actual_project_activation_allowed: false, stage_clear_allowed: false, taskdriver_activation_allowed: false, erp_write_allowed: false, wiki_write_allowed: false, rag_write_allowed: false, llm_activation_allowed: false },
    effects: { filesystem_writes: 0, explicit_network_calls: 0, model_calls: 0, rag_calls: 0, wiki_calls: 0, erp_writes: 0, taskdriver_activations: 0 },
  };
}

function actualTimeline(projectRef) {
  const entries = ['mail', 'slack', 'voice', 'structured_pc_work', 'team_files', 'run_logs'].map(function (lane, index) {
    const n = String(index + 1);
    return {
      entry_id: 'timeline-entry:' + n, annotation_revision_id: 'annotation:' + n, binding_id: 'binding:' + n,
      binding_known_at: KNOWN, binding_recorded_at: KNOWN, route_bucket: 'project_confirmed',
      occurred_at: '2026-08-01T09:0' + index + ':00+09:00', source_lane: lane,
      source_revision_ref: 'timeline-revision:' + n, source_body_sha256: hex('timeline-body:' + n),
      source_span_ref: 'timeline-span:' + n, project_ref: projectRef,
      project_resolution_state: 'confirmed',
    };
  });
  const timeline = { project_ref: projectRef, entries: entries, ordered_entry_digest: sha256Canonical(entries) };
  const projection = {
    schema_version: 'soulforge.project_timeline_projection.v1',
    generation_id: 'timeline-generation:1',
    generated_at: KNOWN,
    system_receipts: [],
    project_timelines: [timeline],
    routing: { candidate: [], unassigned: [], common: [], restricted: [], conflict: [] },
    projection_digest: '',
    boundaries: { raw_body_copied: false, official_task_mutated: false, official_project_assignment_mutated: false, source_annotations_mutated: false },
  };
  const material = copy(projection);
  delete material.projection_digest;
  projection.projection_digest = sha256Canonical(material);
  return projection;
}

function authenticFixture(opts = {}) {
  const projectBindingRef = opts.projectBindingRef || ref(1);
  const timelineProjectRef = opts.timelineProjectRef || 'project:synthetic-alpha';
  const projectContextRef = opts.projectContextRef || 'project-context:synthetic-alpha';
  const commonRef = opts.commonRef || ref(4);
  const manifestRef = opts.manifestRef || ref(5);
  const p4Result = actualP4(projectBindingRef);
  const p4Candidate = p4Result.candidate;
  const p4Digest = p4Candidate.candidate_sha256;
  const m2 = actualM2(projectBindingRef, commonRef, manifestRef);
  const m2Digest = sha256Canonical({ domain: 'soulforge.project_context_generation.m2_assessment.v1', assessment: m2 });
  const projection = actualTimeline(timelineProjectRef);
  const timelineDigest = projection.projection_digest;
  const reviewerRef = opts.reviewerRef || ref(40);
  const reviewerEpochRef = opts.reviewerEpochRef || ref(41);
  const writerRef = opts.writerRef || ref(42);
  const writerEpochRef = opts.writerEpochRef || ref(43);
  const priorRef = opts.priorRef || ref(44);
  const currentRef = opts.currentRef || ref(45);
  const writerEpoch = opts.writerEpoch !== undefined ? opts.writerEpoch : 7;
  const priorGenerationNum = opts.priorGenerationNum !== undefined ? opts.priorGenerationNum : 3;
  const currentGenerationNum = opts.currentGenerationNum !== undefined ? opts.currentGenerationNum : 4;
  const priorCas = opts.priorCas || hash('prior-cas');

  const p4DocumentRef = copy(p4Candidate.document_revision_ref);
  const p4SourceReceipt = p4Candidate.p5_input_candidate.source_revision_set[0].source_revision_receipt_sha256;
  const timelineSources = projection.project_timelines[0].entries.map(function (entry, index) {
    return {
      source_kind: 'timeline', scope: 'project', source_revision_ref: ref(100 + index),
      source_revision_receipt_sha256: hash('timeline-receipt:' + index),
      inclusion_state: 'included', correction_state: 'original', valid_at: VALID, known_at: KNOWN,
      timeline_entry_id: entry.entry_id, timeline_source_revision_ref: entry.source_revision_ref,
    };
  });
  const sourceRows = [
    { source_kind: 'p4', scope: 'project', source_revision_ref: copy(p4DocumentRef), source_revision_receipt_sha256: p4SourceReceipt, inclusion_state: 'included', correction_state: 'original', valid_at: VALID, known_at: KNOWN },
    { source_kind: 'm2_common', scope: 'common', source_revision_ref: copy(commonRef), source_revision_receipt_sha256: hash('common-receipt'), inclusion_state: 'included', correction_state: 'original', valid_at: VALID, known_at: KNOWN },
  ].concat(timelineSources);
  const commonProposal = ref(50);
  const memberships = [
    { source_span_ref: 'knowledge-span', source_revision_ref: copy(p4DocumentRef), source_lane: 'knowledge', evidence_ref: ref(60), context_event_ref: 'event:knowledge', context_unit_ref: 'unit:knowledge', context_branch_ref: 'branch:knowledge', project_context_ref: projectContextRef, membership_state: 'active', correction_state: 'original', review_requirement: 'not_required', valid_at: VALID, known_at: KNOWN },
    { source_span_ref: 'common-span', source_revision_ref: copy(commonRef), source_lane: 'common', evidence_ref: ref(61), context_event_ref: 'event:common', context_unit_ref: 'unit:common', context_branch_ref: 'branch:common', project_context_ref: projectContextRef, membership_state: 'active', correction_state: 'original', review_requirement: 'required', review_proposal_ref: copy(commonProposal), valid_at: VALID, known_at: KNOWN },
  ].concat(projection.project_timelines[0].entries.map(function (entry, index) {
    const source = timelineSources[index];
    return { source_span_ref: entry.source_span_ref, source_revision_ref: copy(source.source_revision_ref), source_lane: entry.source_lane, evidence_ref: ref(70 + index), context_event_ref: 'event:timeline:' + index, context_unit_ref: 'unit:timeline:' + index, context_branch_ref: 'branch:timeline:' + index, project_context_ref: projectContextRef, membership_state: 'active', correction_state: 'original', review_requirement: 'not_required', valid_at: VALID, known_at: KNOWN, timeline_entry_id: entry.entry_id, timeline_source_revision_ref: entry.source_revision_ref };
  }));
  const evidence = ['source_content_membership', 'source_truth', 'freshness', 'terminal_provenance'].map(function (claim, index) {
    const member = memberships[index + 2];
    return { claim: claim, evidence_ref: copy(member.evidence_ref), source_revision_ref: copy(member.source_revision_ref), state: 'satisfied', valid_at: VALID, known_at: KNOWN };
  });

  const request = {
    schema_version: 'soulforge.project_context_generation_candidate_request.v1',
    producer_outputs: {
      p4: { result: p4Result, material_pin: { result_ref: ref(20, p4Digest), expected_candidate_sha256: p4Digest, valid_at: VALID, known_at: KNOWN } },
      m2: { assessment: m2, material_pin: { assessment_ref: ref(21, m2Digest), expected_assessment_sha256: m2Digest, valid_at: VALID, known_at: KNOWN } },
      timeline: { projection: projection, projection_pin: { projection_ref: ref(22, timelineDigest), expected_projection_sha256: timelineDigest, valid_at: VALID, known_at: KNOWN }, selected_project_ref: timelineProjectRef },
    },
    owner_context_contract: {
      contract_ref: ref(23),
      crosswalk: { project_binding_ref: copy(projectBindingRef), timeline_project_ref: timelineProjectRef, project_context_ref: projectContextRef, m2_manifest_ref: copy(manifestRef), reviewer_authority_ref: copy(reviewerRef), reviewer_epoch_ref: copy(reviewerEpochRef), reviewer_epoch: 3, valid_at: VALID, known_at: KNOWN },
      bitemporal_cutoffs: { valid_at: CUTOFF_VALID, known_at: CUTOFF_KNOWN },
      source_ref_crosswalk: sourceRows,
      memberships: memberships,
      provenance_evidence: evidence,
      coverage: { schema_version: 'soulforge.project_context_generation_coverage.v0', source_lanes: ['mail', 'slack', 'voice', 'structured_pc_work', 'team_files', 'run_logs'].map(function (lane) { return { source_lane: lane, state: 'covered', valid_at: VALID, known_at: KNOWN }; }) },
      reviews: [{ proposal_ref: copy(commonProposal), reviewer_state: 'pending_registered_human_review', valid_at: VALID, known_at: KNOWN }],
      writer: { schema_version: 'soulforge.project_context_generation_writer_witness.v0', hpp_writer_ref: copy(writerRef), sole_writer: true, writer_epoch_ref: copy(writerEpochRef), writer_epoch: writerEpoch, project_binding_ref: copy(projectBindingRef), status: 'bound', valid_at: VALID, known_at: KNOWN },
      lineage: { schema_version: 'soulforge.project_context_generation_lineage.v0', prior_generation: { generation: priorGenerationNum, generation_ref: copy(priorRef), accepted_input_set_digest_sha256: hash('prior-input'), cas_fingerprint_sha256: priorCas, supersession_state: 'superseded_by_current_proposal', valid_at: VALID, known_at: KNOWN }, current_generation: { generation: currentGenerationNum, generation_ref: copy(currentRef), supersedes_generation_ref: copy(priorRef), valid_at: VALID, known_at: KNOWN }, observed_prior_cas_fingerprint_sha256: priorCas, generation_cutoff: { valid_at: CUTOFF_VALID, known_at: CUTOFF_KNOWN } },
    },
  };

  const pin = {
    material_ref: ref(24, hash('placeholder')),
    expected_material_sha256: hash('placeholder'),
    expected_project_binding_ref: copy(projectBindingRef),
    valid_at: VALID,
    known_at: KNOWN,
  };
  const preview = buildProjectContextGenerationCandidate(copy(request), copy(pin));
  pin.expected_material_sha256 = preview.receipt.observed_material_sha256;
  pin.material_ref.content_id = preview.receipt.observed_material_sha256;

  const built = buildProjectContextGenerationCandidate(request, pin);
  assert.equal(built.candidate.status, 'ready_for_registered_human_review');

  const submission = {
    schema_version: PROJECT_CONTEXT_ACCEPTANCE_SUBMISSION_SCHEMA,
    candidate: built.candidate,
    registered_human_review: {
      reviewer_ref: copy(reviewerRef),
      reviewer_epoch_ref: copy(reviewerEpochRef),
      reviewer_epoch: 3,
      verdict: 'approved',
      reviewed_candidate_digest: built.candidate.review_content_digest_sha256,
      reviewed_membership_refs: built.candidate.project_context.memberships.filter(function (member) { return member.review_requirement === 'required'; }).map(function (member) { return { source_span_ref: member.source_span_ref, source_revision_ref: copy(member.source_revision_ref) }; }),
      decision_ref: ref(80),
      reviewed_at: REVIEW_TIME,
    },
    writer_witness: {
      hpp_writer_ref: copy(writerRef),
      writer_epoch_ref: copy(writerEpochRef),
      writer_epoch: writerEpoch,
      witnessed_at: REVIEW_TIME,
    },
    expected_prior_generation_ref: copy(priorRef),
  };

  return {
    projectBindingRef,
    projectContextRef,
    priorRef,
    currentRef,
    priorCas,
    writerRef,
    writerEpoch,
    reviewerRef,
    builtCandidate: built.candidate,
    submission,
  };
}

function createBoundStore(fixture, overrides = {}) {
  return createInMemoryAcceptedContextGenerationStore({
    project_ref: fixture.projectBindingRef,
    project_context_ref: fixture.projectContextRef,
    initial_generation_ref: fixture.priorRef,
    initial_cas_fingerprint: fixture.priorCas,
    initial_epoch: 1,
    initial_generation_number: fixture.builtCandidate.generation_proposal.prior_generation_number,
    reviewer_anchor: fixture.builtCandidate.reviewer_anchor,
    writer_anchor: fixture.builtCandidate.writer_anchor,
    ...overrides,
  });
}

test('accepts authentic candidate into in-memory store and advances pointer CAS', () => {
  const f = authenticFixture();
  const store = createBoundStore(f);

  const before = store.getCurrentPointer();
  assert.deepEqual(before.generation_ref, f.priorRef);
  assert.equal(before.writer_epoch, 1);

  const result = store.acceptCandidate(f.submission);
  assert.equal(result.status, 'ACCEPTED');
  assert.deepEqual(result.accepted_generation_ref, f.currentRef);
  assert.equal(result.claim_ceiling, 'observed');
  assert.match(result.manifest_digest_sha256, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.receipt_digest_sha256, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(result.manifest.authority.writer_called, false);
  assert.equal(result.manifest.authority.generation_advanced, false);
  assert.deepEqual(result.execution_evidence, { writer_witness_verified: true, in_memory_pointer_advanced: true, synthetic_store_write: true });

  const after = store.getCurrentPointer();
  assert.deepEqual(after.generation_ref, f.currentRef);
  assert.equal(after.writer_epoch, f.writerEpoch);
  assert.equal(after.cas_fingerprint, f.builtCandidate.generation_proposal.cas_fingerprint_sha256);

  assert.equal(store.hasGeneration(f.currentRef), true);
  const gen = store.getGeneration(f.currentRef);
  assert.equal(gen.schema_version, PROJECT_CONTEXT_ACCEPTED_GENERATION_SCHEMA);
  assert.equal(gen.status, 'accepted');
  assert.deepEqual(gen.prior_generation_ref, f.priorRef);

  const receipt = store.getReceipt(f.currentRef);
  assert.equal(receipt.schema_version, PROJECT_CONTEXT_ACCEPTED_GENERATION_RECEIPT_SCHEMA);
  assert.equal(receipt.status, 'accepted');

  assert.equal(verifyAcceptedGenerationManifest(gen, result.manifest_digest_sha256), true);
});

test('idempotent replay of exact same acceptance returns identical result without advancing pointer', () => {
  const f = authenticFixture();
  const store = createBoundStore(f);

  const first = store.acceptCandidate(f.submission);
  assert.equal(first.status, 'ACCEPTED');
  const pointerAfterFirst = store.getCurrentPointer();

  const second = store.acceptCandidate(f.submission);
  assert.equal(second.status, 'ACCEPTED');
  assert.equal(second.manifest_digest_sha256, first.manifest_digest_sha256);
  assert.equal(second.receipt_digest_sha256, first.receipt_digest_sha256);
  assert.deepEqual(store.getCurrentPointer(), pointerAfterFirst);
});

test('rejects unapproved review verdicts with HOLD', () => {
  const verdicts = ['rejected', 'pending', 'held_for_audit', 'unknown'];
  for (const verdict of verdicts) {
    const f = authenticFixture();
    const store = createBoundStore(f);
    const sub = copy(f.submission);
    sub.registered_human_review.verdict = verdict;
    const result = store.acceptCandidate(sub);
    assert.equal(result.status, 'HOLD');
    assert.ok(result.blocker_codes.includes(PROJECT_CONTEXT_ACCEPTANCE_CODES.REVIEW_REJECTED));
    assert.deepEqual(store.getCurrentPointer().generation_ref, f.priorRef);
  }
});

test('rejects candidate digest mismatch in registered human review', () => {
  const f = authenticFixture();
  const store = createBoundStore(f);
  const sub = copy(f.submission);
  sub.registered_human_review.reviewed_candidate_digest = hash('tampered-digest');
  const result = store.acceptCandidate(sub);
  assert.equal(result.status, 'HOLD');
  assert.ok(result.blocker_codes.includes(PROJECT_CONTEXT_ACCEPTANCE_CODES.REVIEW_DIGEST_MISMATCH));
});

test('requires an exact reviewer membership coverage set before synthetic acceptance', () => {
  const f = authenticFixture();
  const store = createBoundStore(f);
  const submission = copy(f.submission);
  submission.registered_human_review.reviewed_membership_refs = [];
  const result = store.acceptCandidate(submission);
  assert.equal(result.status, 'HOLD');
  assert.ok(result.blocker_codes.includes(PROJECT_CONTEXT_ACCEPTANCE_CODES.REVIEW_INVALID));
});

test('holds an incomplete coverage receipt even when the review content digest is recomputed', () => {
  const f = authenticFixture();
  const store = createBoundStore(f);
  const submission = copy(f.submission);
  submission.candidate.coverage_gap_receipt.coverage_complete = false;
  submission.candidate.coverage_gap_receipt.unresolved_gap_codes = ['lane:mail'];
  submission.candidate.review_content_digest_sha256 = computeProjectContextReviewContentDigest(submission.candidate);
  submission.candidate.coverage_gap_receipt.review_content_digest_sha256 = submission.candidate.review_content_digest_sha256;
  submission.registered_human_review.reviewed_candidate_digest = submission.candidate.review_content_digest_sha256;
  const result = store.acceptCandidate(submission);
  assert.equal(result.status, 'HOLD');
  assert.ok(result.blocker_codes.includes(PROJECT_CONTEXT_ACCEPTANCE_CODES.COVERAGE_GAP_REJECTED));
});

test('rejects a membership changed after human review even when the opaque input digest is retained', () => {
  const f = authenticFixture();
  const store = createBoundStore(f);
  const submission = copy(f.submission);
  submission.candidate.project_context.memberships[0].context_branch_ref = 'branch:tampered';
  const result = store.acceptCandidate(submission);
  assert.equal(result.status, 'HOLD');
  assert.ok(result.blocker_codes.includes(PROJECT_CONTEXT_ACCEPTANCE_CODES.CANDIDATE_CONTENT_MISMATCH));
});

test('rejects reviewer anchor mismatch and writer anchor mismatch', () => {
  const f = authenticFixture();
  const store = createBoundStore(f);

  const subReviewer = copy(f.submission);
  subReviewer.registered_human_review.reviewer_ref = ref(999);
  assert.equal(store.acceptCandidate(subReviewer).status, 'HOLD');

  const subWriter = copy(f.submission);
  subWriter.writer_witness.hpp_writer_ref = ref(998);
  assert.equal(store.acceptCandidate(subWriter).status, 'HOLD');
});

test('rejects stale or regressed writer epoch against store epoch', () => {
  const f = authenticFixture({ writerEpoch: 5 });
  const store = createBoundStore(f, { initial_epoch: 10 });
  const result = store.acceptCandidate(f.submission);
  assert.equal(result.status, 'HOLD');
  assert.ok(result.blocker_codes.includes(PROJECT_CONTEXT_ACCEPTANCE_CODES.WRITER_EPOCH_STALE));
});

test('rejects CAS mismatch when expected prior generation ref does not match store pointer', () => {
  const f = authenticFixture();
  const store = createBoundStore(f, { initial_generation_ref: ref(888), initial_cas_fingerprint: hash('other-cas') });
  const result = store.acceptCandidate(f.submission);
  assert.equal(result.status, 'HOLD');
  assert.ok(result.blocker_codes.includes(PROJECT_CONTEXT_ACCEPTANCE_CODES.CAS_MISMATCH));
  assert.deepEqual(store.getCurrentPointer().generation_ref, ref(888));
});

test('rejects unproven candidate or bare ready flag without authentic candidate contract', () => {
  const f = authenticFixture();
  const store = createBoundStore(f);

  const bare = {
    schema_version: PROJECT_CONTEXT_ACCEPTANCE_SUBMISSION_SCHEMA,
    candidate: { status: 'ready_for_registered_human_review', candidate_only: true },
    registered_human_review: f.submission.registered_human_review,
    writer_witness: f.submission.writer_witness,
    expected_prior_generation_ref: f.priorRef,
  };
  assert.equal(store.acceptCandidate(bare).status, 'HOLD');
});

test('rejects candidate belonging to a different project than bound store', () => {
  const f = authenticFixture();
  const otherProjectRef = ref(99);
  const store = createBoundStore(f, { project_ref: otherProjectRef, project_context_ref: 'project-context:other' });
  const result = store.acceptCandidate(f.submission);
  assert.equal(result.status, 'HOLD');
  assert.ok(result.blocker_codes.includes(PROJECT_CONTEXT_ACCEPTANCE_CODES.PROJECT_MISMATCH));
});

test('preserves previous generations on successive acceptance advances', () => {
  const f1 = authenticFixture({
    priorRef: ref(10), currentRef: ref(11),
    priorGenerationNum: 0, currentGenerationNum: 1,
    priorCas: hash('genesis-cas'),
    writerEpoch: 2,
  });
  const store = createBoundStore(f1);

  const res1 = store.acceptCandidate(f1.submission);
  assert.equal(res1.status, 'ACCEPTED');

  const f2 = authenticFixture({
    projectBindingRef: f1.projectBindingRef,
    projectContextRef: f1.projectContextRef,
    priorRef: f1.currentRef,
    currentRef: ref(12),
    priorGenerationNum: 1, currentGenerationNum: 2,
    priorCas: f1.builtCandidate.generation_proposal.cas_fingerprint_sha256,
    writerEpoch: 4,
  });

  const res2 = store.acceptCandidate(f2.submission);
  assert.equal(res2.status, 'ACCEPTED');

  assert.equal(store.hasGeneration(f1.currentRef), true);
  assert.equal(store.hasGeneration(f2.currentRef), true);
  assert.deepEqual(store.getGeneration(f1.currentRef).accepted_generation_ref, f1.currentRef);
  assert.deepEqual(store.getGeneration(f2.currentRef).accepted_generation_ref, f2.currentRef);
  assert.deepEqual(store.getCurrentPointer().generation_ref, f2.currentRef);
});

test('replays only an exact canonical submission and fully evaluates every mutation', () => {
  const f = authenticFixture();
  const store = createBoundStore(f);
  const first = store.acceptCandidate(f.submission);
  assert.equal(first.status, 'ACCEPTED');
  const pointer = store.getCurrentPointer();
  const mutations = [
    { code: PROJECT_CONTEXT_ACCEPTANCE_CODES.REVIEWER_ANCHOR_MISMATCH, apply: function (submission) { submission.registered_human_review.reviewer_ref = ref(900); } },
    { code: PROJECT_CONTEXT_ACCEPTANCE_CODES.WRITER_ANCHOR_MISMATCH, apply: function (submission) { submission.writer_witness.hpp_writer_ref = ref(901); } },
    { code: PROJECT_CONTEXT_ACCEPTANCE_CODES.PROJECT_MISMATCH, apply: function (submission) {
      submission.candidate.project_binding_ref = ref(902);
      submission.candidate.review_content_digest_sha256 = computeProjectContextReviewContentDigest(submission.candidate);
      submission.candidate.coverage_gap_receipt.review_content_digest_sha256 = submission.candidate.review_content_digest_sha256;
      submission.registered_human_review.reviewed_candidate_digest = submission.candidate.review_content_digest_sha256;
    } },
    { code: PROJECT_CONTEXT_ACCEPTANCE_CODES.CAS_MISMATCH, apply: function (submission) { submission.expected_prior_generation_ref = ref(903); } },
  ];
  for (const mutation of mutations) {
    const submission = copy(f.submission);
    mutation.apply(submission);
    const result = store.acceptCandidate(submission);
    assert.equal(result.status, 'HOLD');
    assert.ok(result.blocker_codes.includes(mutation.code), JSON.stringify(result.blocker_codes));
    assert.notEqual(result.idempotent_replay, true);
    assert.deepEqual(store.getCurrentPointer(), pointer);
  }
  const replay = store.acceptCandidate(f.submission);
  assert.equal(replay.status, 'ACCEPTED');
  assert.equal(replay.idempotent_replay, true);
});

test('rejects a duplicate generation key without rolling pointer or replacing append-only records', () => {
  const f1 = authenticFixture({ priorRef: ref(10), currentRef: ref(11), priorGenerationNum: 0, currentGenerationNum: 1, priorCas: hash('genesis-cas'), writerEpoch: 2 });
  const store = createBoundStore(f1);
  assert.equal(store.acceptCandidate(f1.submission).status, 'ACCEPTED');
  const f2 = authenticFixture({ projectBindingRef: f1.projectBindingRef, projectContextRef: f1.projectContextRef, priorRef: f1.currentRef, currentRef: ref(12), priorGenerationNum: 1, currentGenerationNum: 2, priorCas: f1.builtCandidate.generation_proposal.cas_fingerprint_sha256, writerEpoch: 4 });
  assert.equal(store.acceptCandidate(f2.submission).status, 'ACCEPTED');
  const beforePointer = store.getCurrentPointer();
  const xManifest = store.getGeneration(f1.currentRef);
  const xReceipt = store.getReceipt(f1.currentRef);
  const yManifest = store.getGeneration(f2.currentRef);
  const yReceipt = store.getReceipt(f2.currentRef);
  const rollback = authenticFixture({ projectBindingRef: f1.projectBindingRef, projectContextRef: f1.projectContextRef, priorRef: f2.currentRef, currentRef: f1.currentRef, priorGenerationNum: 2, currentGenerationNum: 3, priorCas: f2.builtCandidate.generation_proposal.cas_fingerprint_sha256, writerEpoch: 6 });
  const result = store.acceptCandidate(rollback.submission);
  assert.equal(result.status, 'HOLD');
  assert.deepEqual(result.blocker_codes, [PROJECT_CONTEXT_ACCEPTANCE_CODES.GENERATION_ALREADY_EXISTS, PROJECT_CONTEXT_ACCEPTANCE_CODES.STORE_CONFLICT_HOLD].sort());
  assert.deepEqual(store.getCurrentPointer(), beforePointer);
  assert.deepEqual(store.getGeneration(f1.currentRef), xManifest);
  assert.deepEqual(store.getReceipt(f1.currentRef), xReceipt);
  assert.deepEqual(store.getGeneration(f2.currentRef), yManifest);
  assert.deepEqual(store.getReceipt(f2.currentRef), yReceipt);
});

test('rejects tampered manifests and isolates getter/proxy caller inputs from the store', () => {
  const f = authenticFixture();
  const store = createBoundStore(f);
  const accepted = store.acceptCandidate(f.submission);
  assert.equal(accepted.status, 'ACCEPTED');
  const manifest = copy(accepted.manifest);
  manifest.authority.writer_called = true;
  assert.equal(verifyAcceptedGenerationManifest(manifest, accepted.manifest_digest_sha256), false);
  const read = store.getGeneration(f.currentRef);
  assert.throws(function () { read.project_context.memberships[0].context_branch_ref = 'branch:caller-mutation'; });
  assert.notEqual(store.getGeneration(f.currentRef).project_context.memberships[0].context_branch_ref, 'branch:caller-mutation');
  const getterSubmission = {};
  for (const [key, value] of Object.entries(f.submission)) {
    Object.defineProperty(getterSubmission, key, { enumerable: true, get: function () { return value; } });
  }
  const held = store.acceptCandidate(getterSubmission);
  assert.equal(held.status, 'HOLD');
  assert.deepEqual(held.blocker_codes, [PROJECT_CONTEXT_ACCEPTANCE_CODES.INPUT_INVALID]);
  assert.equal(Object.isFrozen(getterSubmission), false);
  assert.throws(function () { createInMemoryAcceptedContextGenerationStore(new Proxy({}, {})); });
});

test('standalone evaluation without an exact bound pointer is always a HOLD', () => {
  const f = authenticFixture();
  const result = evaluateProjectContextAcceptance(null, f.submission);
  assert.equal(result.status, 'HOLD');
  assert.ok(result.blocker_codes.includes(PROJECT_CONTEXT_ACCEPTANCE_CODES.STORE_UNBOUND));
});

test('has zero filesystem, network, child_process, or external effects', () => {
  const source = readFileSync(MODULE_URL, 'utf8');
  [
    'node:fs',
    'node:net',
    'node:http',
    'node:child_process',
    'fetch',
    'XMLHttpRequest',
    'eval(',
    'Function(',
  ].forEach(function (forbidden) {
    assert.equal(source.includes(forbidden), false, forbidden);
  });
});

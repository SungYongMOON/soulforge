import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canonicalise } from '../../../core/validators/canonical.mjs';
import { sha256Canonical } from '../../../../shared/project_history_envelope.mjs';
import { buildProjectPdfKnowledgeCandidate } from '../../../../rag/project_pdf_knowledge_projection.mjs';
import {
  buildProjectContextGenerationCandidate,
  computeProjectContextReviewContentDigest,
  computeProjectContextExportedMembershipDigest,
  computeProjectContextExportedSourceRevisionSetDigest,
  canonicalInstantEpoch,
} from '../../../core/validators/project_context_generation_candidate.mjs';

const VALID = '2026-08-01T00:00:00.000Z';
const KNOWN = '2026-08-02T00:00:00.000Z';
const CUTOFF_VALID = '2026-08-05T00:00:00.000Z';
const CUTOFF_KNOWN = '2026-08-06T00:00:00.000Z';
const MODULE_URL = new URL('../../../core/validators/project_context_generation_candidate.mjs', import.meta.url);
const LANES = ['mail', 'slack', 'voice', 'structured_pc_work', 'team_files', 'run_logs'];

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
function assertHold(result, code) {
  assert.equal(result.receipt.status, 'HOLD');
  assert.ok(result.receipt.blocker_codes.includes(code), JSON.stringify(result.receipt.blocker_codes));
  assert.equal(result.receipt.authority.accepted, false);
  assert.equal(result.receipt.authority.generation_advanced, false);
  assert.equal(result.receipt.effects.persistent_writes, 0);
  assert.equal(result.receipt.effects.writer_calls, 0);
}
function assertFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  Object.values(value).forEach(assertFrozen);
}

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

function rawFixture() {
  const projectBindingRef = ref(1);
  const timelineProjectRef = 'project:synthetic-alpha';
  const projectContextRef = 'project-context:synthetic-alpha';
  const commonRef = ref(4);
  const manifestRef = ref(5);
  const p4Result = actualP4(projectBindingRef);
  const p4Candidate = p4Result.candidate;
  const p4Digest = p4Candidate.candidate_sha256;
  const m2 = actualM2(projectBindingRef, commonRef, manifestRef);
  const m2Digest = sha256Canonical({ domain: 'soulforge.project_context_generation.m2_assessment.v1', assessment: m2 });
  const projection = actualTimeline(timelineProjectRef);
  const timelineDigest = projection.projection_digest;
  const reviewerRef = ref(40);
  const reviewerEpochRef = ref(41);
  const writerRef = ref(42);
  const writerEpochRef = ref(43);
  const priorRef = ref(44);
  const currentRef = ref(45);
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
  const wholePlaceholder = hash('whole-placeholder');
  return {
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
      coverage: { schema_version: 'soulforge.project_context_generation_coverage.v0', source_lanes: LANES.map(function (lane) { return { source_lane: lane, state: 'covered', valid_at: VALID, known_at: KNOWN }; }) },
      reviews: [{ proposal_ref: copy(commonProposal), reviewer_state: 'pending_registered_human_review', valid_at: VALID, known_at: KNOWN }],
      writer: { schema_version: 'soulforge.project_context_generation_writer_witness.v0', hpp_writer_ref: copy(writerRef), sole_writer: true, writer_epoch_ref: copy(writerEpochRef), writer_epoch: 7, project_binding_ref: copy(projectBindingRef), status: 'bound', valid_at: VALID, known_at: KNOWN },
      lineage: { schema_version: 'soulforge.project_context_generation_lineage.v0', prior_generation: { generation: 3, generation_ref: copy(priorRef), accepted_input_set_digest_sha256: hash('prior-input'), cas_fingerprint_sha256: hash('prior-cas'), supersession_state: 'superseded_by_current_proposal', valid_at: VALID, known_at: KNOWN }, current_generation: { generation: 4, generation_ref: copy(currentRef), supersedes_generation_ref: copy(priorRef), valid_at: VALID, known_at: KNOWN }, observed_prior_cas_fingerprint_sha256: hash('prior-cas'), generation_cutoff: { valid_at: CUTOFF_VALID, known_at: CUTOFF_KNOWN } },
    },
  };
}

function expectedPin(request, expected) {
  return {
    material_ref: ref(24, expected),
    expected_material_sha256: expected,
    expected_project_binding_ref: copy(request.owner_context_contract.crosswalk.project_binding_ref),
    valid_at: VALID,
    known_at: KNOWN,
  };
}

function fixture() {
  const value = rawFixture();
  const pin = expectedPin(value, hash('whole-placeholder'));
  const preview = buildProjectContextGenerationCandidate(copy(value), copy(pin));
  assert.equal(preview.receipt.status, 'HOLD');
  const material = preview.receipt.observed_material_sha256;
  assert.match(material, /^sha256:[0-9a-f]{64}$/u, JSON.stringify(preview.receipt));
  pin.expected_material_sha256 = material;
  pin.material_ref.content_id = material;
  return { request: freeze(value), pin: freeze(pin) };
}

test('normalizes authentic P4, M2, and timeline outputs under one pinned owner contract', () => {
  const bundle = fixture();
  assert.equal(Object.hasOwn(bundle.request, 'whole_material_pin'), false);
  const result = buildProjectContextGenerationCandidate(bundle.request, bundle.pin);
  assert.equal(result.candidate.status, 'ready_for_registered_human_review');
  assert.equal(result.receipt.status, 'ready_for_registered_human_review');
  assert.equal(result.candidate.authority.accepted, false);
  assert.equal(result.candidate.authority.generation_advanced, false);
  assert.equal(result.candidate.effects.writer_calls, 0);
  assert.match(result.candidate.accepted_input_set_candidate.digest_sha256, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.candidate.review_content_digest_sha256, /^sha256:[0-9a-f]{64}$/u);
  assert.deepEqual(result.candidate.bitemporal_cutoff, { valid_at: CUTOFF_VALID, known_at: CUTOFF_KNOWN });
  assert.equal(result.candidate.generation_proposal.prior_generation_number, 3);
  assert.equal(result.candidate.generation_proposal.current_generation_number, 4);
  assert.ok(result.candidate.project_context.memberships.every(function (member) { return member.scope === 'project' || member.scope === 'common'; }));
  assert.equal(result.candidate.project_context.exported_membership_digest_sha256, computeProjectContextExportedMembershipDigest(result.candidate.project_context.memberships));
  assert.equal(result.candidate.project_context.exported_source_revision_set_digest_sha256, computeProjectContextExportedSourceRevisionSetDigest(result.candidate.project_context.memberships));
  assert.equal(result.candidate.coverage_gap_receipt.coverage_complete, true);
  assert.deepEqual(result.candidate.coverage_gap_receipt.unresolved_gap_codes, []);
  assertFrozen(result);
});

test('binds the reviewer digest to exported candidate content, including normalized memberships', () => {
  const bundle = fixture();
  const result = buildProjectContextGenerationCandidate(bundle.request, bundle.pin);
  const tampered = copy(result.candidate);
  tampered.project_context.memberships[0].context_branch_ref = 'branch:tampered';
  assert.notEqual(computeProjectContextReviewContentDigest(tampered), result.candidate.review_content_digest_sha256);
});

test('uses one canonical UTC epoch rule and rejects offset-form bitemporal values', () => {
  assert.equal(canonicalInstantEpoch(VALID), Date.parse(VALID));
  assert.equal(canonicalInstantEpoch('2026-08-01T09:00:00.000+09:00'), null);
  const bundle = fixture();
  const request = copy(bundle.request);
  request.owner_context_contract.bitemporal_cutoffs.valid_at = '2026-08-01T09:00:00.000+09:00';
  assertHold(buildProjectContextGenerationCandidate(request, bundle.pin), 'P5_CONTEXT_BITEMPORAL_INVALID');
});

test('holds legacy caller-assembled P4 witness and a missing whole material pin', () => {
  const legacy = rawFixture();
  legacy.producer_outputs.p4 = {
    schema_version: 'soulforge.project_pdf_p5_input_candidate.v0',
    p4_candidate_ref: ref(999), p4_candidate_sha256: hash('legacy'),
  };
  const legacyResult = buildProjectContextGenerationCandidate(legacy);
  assertHold(legacyResult, 'P5_CONTEXT_P4_PRODUCER_INVALID');

  const missingPin = rawFixture();
  assert.equal(buildProjectContextGenerationCandidate(missingPin).receipt.status, 'HOLD');
});

test('holds unchanged external pin when any producer or owner material changes', () => {
  const cases = [
    function (input) { input.producer_outputs.m2.assessment.project_source_binding.manifest_ref = ref(300); },
    function (input) { input.producer_outputs.timeline.projection.project_timelines[0].entries[0].source_body_sha256 = 'x'.repeat(64); },
    function (input) { input.owner_context_contract.writer.writer_epoch = 8; },
    function (input) { input.owner_context_contract.lineage.observed_prior_cas_fingerprint_sha256 = hash('wrong-cas'); },
  ];
  for (const mutate of cases) {
    const bundle = fixture();
    const input = copy(bundle.request);
    mutate(input);
    assert.equal(buildProjectContextGenerationCandidate(input, bundle.pin).receipt.status, 'HOLD');
  }
});

test('requires included sources for membership, timeline mapping, and M2 evidence', () => {
  const bundle = fixture();
  const input = copy(bundle.request);
  input.owner_context_contract.source_ref_crosswalk[2].inclusion_state = 'gap';
  assertHold(buildProjectContextGenerationCandidate(input, bundle.pin), 'P5_CONTEXT_SOURCE_NOT_INCLUDED');
});

test('rejects supersession valid_at or known_at inversion and active predecessors', () => {
  const bundle = fixture();
  const input = copy(bundle.request);
  const predecessor = input.owner_context_contract.memberships[2];
  predecessor.membership_state = 'active';
  const successor = copy(predecessor);
  successor.source_span_ref = 'timeline-successor';
  successor.membership_state = 'active';
  successor.correction_state = 'corrected';
  successor.predecessor_source_span_ref = predecessor.source_span_ref;
  successor.valid_at = '2026-07-31T00:00:00.000Z';
  input.owner_context_contract.memberships.push(successor);
  assertHold(buildProjectContextGenerationCandidate(input, bundle.pin), 'P5_CONTEXT_SUPERSESSION_INVALID');

  const cycle = copy(bundle.request);
  const first = cycle.owner_context_contract.memberships[0];
  const second = copy(first);
  second.source_span_ref = 'membership-cycle-second';
  first.membership_state = 'superseded';
  first.correction_state = 'corrected';
  first.predecessor_source_span_ref = second.source_span_ref;
  second.membership_state = 'superseded';
  second.correction_state = 'corrected';
  second.predecessor_source_span_ref = first.source_span_ref;
  cycle.owner_context_contract.memberships.push(second);
  assertHold(buildProjectContextGenerationCandidate(cycle, bundle.pin), 'P5_CONTEXT_SUPERSESSION_INVALID');
});

test('rejects JWT/token-shaped producer metadata without echoing it', () => {
  const bundle = fixture();
  const input = copy(bundle.request);
  const marker = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJwdWJsaWMifQ.detached';
  input.producer_outputs.m2.assessment.pilot_grant_ref.entity_id = marker;
  const result = buildProjectContextGenerationCandidate(input, bundle.pin);
  assert.equal(result.receipt.status, 'HOLD');
  assert.equal(JSON.stringify(result).includes(marker), false);
});

test('rejects opaque timeline crosswalk swaps and non-hash source body metadata', () => {
  const bundle = fixture();
  const input = copy(bundle.request);
  const first = input.owner_context_contract.source_ref_crosswalk[2];
  const second = input.owner_context_contract.source_ref_crosswalk[3];
  const saved = first.timeline_entry_id;
  first.timeline_entry_id = second.timeline_entry_id;
  second.timeline_entry_id = saved;
  assertHold(buildProjectContextGenerationCandidate(input, bundle.pin), 'P5_CONTEXT_CROSSWALK_MISMATCH');

  const badHash = copy(bundle.request);
  const marker = 'token:opaque-private-marker';
  badHash.producer_outputs.timeline.projection.project_timelines[0].entries[0].source_body_sha256 = marker;
  const result = buildProjectContextGenerationCandidate(badHash, bundle.pin);
  assert.equal(result.receipt.status, 'HOLD');
  assert.equal(JSON.stringify(result).includes(marker), false);
});

test('holds coherently re-pinned request material against an unchanged trusted expected pin', () => {
  const bundle = fixture();
  const request = copy(bundle.request);
  const assessment = request.producer_outputs.m2.assessment;
  const changedManifestRef = ref(401);
  assessment.project_source_binding.manifest_ref = copy(changedManifestRef);
  request.owner_context_contract.crosswalk.m2_manifest_ref = copy(changedManifestRef);
  const digest = sha256Canonical({ domain: 'soulforge.project_context_generation.m2_assessment.v1', assessment: assessment });
  request.producer_outputs.m2.material_pin.expected_assessment_sha256 = digest;
  request.producer_outputs.m2.material_pin.assessment_ref.content_id = digest;
  const held = buildProjectContextGenerationCandidate(request, bundle.pin);
  assertHold(held, 'P5_CONTEXT_OUTER_MATERIAL_MISMATCH');

  const changedPin = copy(bundle.pin);
  changedPin.expected_material_sha256 = held.receipt.observed_material_sha256;
  changedPin.material_ref.content_id = held.receipt.observed_material_sha256;
  const candidate = buildProjectContextGenerationCandidate(request, changedPin);
  assert.equal(candidate.candidate.status, 'ready_for_registered_human_review');
  assert.notEqual(candidate.candidate.accepted_input_set_candidate.digest_sha256, buildProjectContextGenerationCandidate(bundle.request, bundle.pin).candidate.accepted_input_set_candidate.digest_sha256);
});

test('commits the complete snapshotted request, including P4 receipt and every lineage field', () => {
  const cases = [
    function (request) { request.producer_outputs.p4.result.receipt.source_count = 2; },
    function (request) {
      request.owner_context_contract.lineage.prior_generation.generation = 2;
      request.owner_context_contract.lineage.current_generation.generation = 3;
    },
    function (request) { request.owner_context_contract.lineage.prior_generation.accepted_input_set_digest_sha256 = hash('changed-prior-input'); },
  ];
  for (const mutate of cases) {
    const bundle = fixture();
    const request = copy(bundle.request);
    mutate(request);
    assertHold(buildProjectContextGenerationCandidate(request, bundle.pin), 'P5_CONTEXT_OUTER_MATERIAL_MISMATCH');
  }
});

test('has no acceptance, advance, writer, filesystem, network, or legacy CSV import surface', () => {
  const source = readFileSync(MODULE_URL, 'utf8');
  [
    'evaluateP5Acceptance',
    'evaluateGenerationAdvance',
    'pipeline.mjs',
    'context_receipt.mjs',
    'haengbogwan_project_context',
    'node:fs',
    'node:net',
    'node:http',
    'node:child_process',
  ].forEach(function (forbidden) { assert.equal(source.includes(forbidden), false, forbidden); });
});

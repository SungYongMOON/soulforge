// Synthetic fixtures adapted from the existing acceptance regression inputs.
// Only tests create candidates/reviews; runtime consumers never import this file.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canonicalise } from '../../../engineering_engine/core/validators/canonical.mjs';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { buildProjectPdfKnowledgeCandidate } from '../../../rag/project_pdf_knowledge_projection.mjs';
import {
  buildProjectContextGenerationCandidate,
} from '../../../engineering_engine/core/validators/project_context_generation_candidate.mjs';
import {
  PROJECT_CONTEXT_ACCEPTANCE_SUBMISSION_SCHEMA,
  createInMemoryAcceptedContextGenerationStore,
} from '../../../engineering_engine/core/validators/project_context_acceptance_gate.mjs';

const VALID = '2026-08-01T00:00:00.000Z';
const KNOWN = '2026-08-02T00:00:00.000Z';
const CUTOFF_VALID = '2026-08-05T00:00:00.000Z';
const CUTOFF_KNOWN = '2026-08-06T00:00:00.000Z';
const REVIEW_TIME = '2026-08-07T12:00:00.000Z';

function hex(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
export function hash(value) { return 'sha256:' + hex(value); }
export function ref(seed, content = hash('ref:' + seed)) {
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

export function authenticFixture(opts = {}) {
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

  if (opts.transformRequest) opts.transformRequest(request);

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
  assert.equal(built.candidate?.status, 'ready_for_registered_human_review', JSON.stringify(built.receipt.blocker_codes));

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
    request,
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

export function createBoundStore(fixture, overrides = {}) {
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

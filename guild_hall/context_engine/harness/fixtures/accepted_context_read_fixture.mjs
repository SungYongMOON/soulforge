import assert from 'node:assert/strict';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { createAcceptedContextReader } from '../../src/runtime/accepted_context_reader.mjs';
import { authenticFixture, createBoundStore, ref, hash } from './accepted_context_fixture.mjs';

export function correctTimeline(request) {
  const owner = request.owner_context_contract;
  const timeline = request.producer_outputs.timeline;
  const oldEntry = timeline.projection.project_timelines[0].entries[0];
  const entry = { ...oldEntry, entry_id: 'timeline-entry:corrected', source_span_ref: 'timeline-span:corrected',
    source_revision_ref: 'timeline-revision:corrected', source_body_sha256: hash('corrected-synthetic-content').slice(7) };
  timeline.projection.project_timelines[0].entries.push(entry);
  timeline.projection.project_timelines[0].ordered_entry_digest = sha256Canonical(timeline.projection.project_timelines[0].entries);
  const material = structuredClone(timeline.projection); delete material.projection_digest;
  timeline.projection.projection_digest = sha256Canonical(material);
  timeline.projection_pin.expected_projection_sha256 = timeline.projection.projection_digest;
  timeline.projection_pin.projection_ref = ref(902, timeline.projection.projection_digest);
  const predecessor = owner.source_ref_crosswalk[2];
  const successor = { ...predecessor, source_revision_ref: ref(901), source_revision_receipt_sha256: hash('corrected-source-receipt'),
    correction_state: 'corrected', predecessor_revision_ref: structuredClone(predecessor.source_revision_ref),
    timeline_entry_id: entry.entry_id, timeline_source_revision_ref: entry.source_revision_ref };
  predecessor.inclusion_state = 'superseded';
  owner.source_ref_crosswalk.push(successor);
  const oldMember = owner.memberships[2];
  const member = { ...structuredClone(oldMember), source_span_ref: entry.source_span_ref, source_revision_ref: structuredClone(successor.source_revision_ref),
    correction_state: 'corrected', predecessor_source_span_ref: oldMember.source_span_ref,
    context_event_ref: 'event:corrected', context_unit_ref: 'unit:corrected', evidence_ref: ref(903),
    review_requirement: 'required', review_proposal_ref: ref(904),
    timeline_entry_id: entry.entry_id, timeline_source_revision_ref: entry.source_revision_ref };
  oldMember.membership_state = 'superseded';
  owner.memberships.push(member);
  owner.reviews.push({ proposal_ref: ref(904), reviewer_state: 'pending_registered_human_review',
    valid_at: member.valid_at, known_at: member.known_at });
  owner.provenance_evidence[0].source_revision_ref = structuredClone(member.source_revision_ref);
  owner.provenance_evidence[0].evidence_ref = structuredClone(member.evidence_ref);
}

export function sourceMetadata(f) {
  const producer = f.request.producer_outputs;
  return { project_ref: f.projectBindingRef, producer_binding_ref: ref(800),
    producer_refs: { p4_result_ref: producer.p4.material_pin.result_ref,
      p4_candidate_sha256: producer.p4.material_pin.expected_candidate_sha256,
      m2_assessment_ref: producer.m2.material_pin.assessment_ref,
      m2_assessment_sha256: producer.m2.material_pin.expected_assessment_sha256,
      timeline_projection_ref: producer.timeline.projection_pin.projection_ref,
      timeline_projection_sha256: producer.timeline.projection_pin.expected_projection_sha256 },
    source_revision_refs: f.request.owner_context_contract.memberships.map(member => ({
      scope: f.request.owner_context_contract.source_ref_crosswalk.find(row =>
        exactRefIdentityKey(row.source_revision_ref) === exactRefIdentityKey(member.source_revision_ref)).scope,
      source_revision_ref: member.source_revision_ref,
    })) };
}

export function fixture() {
  const f = authenticFixture({ priorRef: ref(10), currentRef: ref(11), priorGenerationNum: 0, currentGenerationNum: 1, writerEpoch: 2 });
  const store = createBoundStore(f);
  assert.equal(store.acceptCandidate(f.submission).status, 'ACCEPTED');
  const grant = { grant_revision_ref: ref(701), allowed_projects: new Set([exactRefIdentityKey(f.projectBindingRef)]),
    allowed_scopes: new Set(['project', 'common']), allowed_purposes: new Set(['pilot_context_query']),
    field_allowed: true, chunk_allowed: true, locator_allowed: true };
  const state = { source: sourceMetadata(f), acl: { actors: new Map([['actor:alpha', grant]]), revoked_actors: new Set(), revoked_generations: new Set() } };
  const binding = { project_ref: f.projectBindingRef, producer_binding_ref: ref(800) };
  const providers = { currentPointer: () => store.getCurrentPointer(), currentSourceRevisions: () => state.source,
    currentAclPolicy: () => state.acl, readAcceptedGeneration: async (_project, generation) =>
      ({ manifest: store.getGeneration(generation), receipt: store.getReceipt(generation) }) };
  const request = { actor_ref: 'actor:alpha', project_ref: f.projectBindingRef, accepted_generation_ref: f.currentRef,
    scope: 'project', as_of: '2026-08-06T00:00:00.000Z', purpose: 'pilot_context_query', budget: { max_units: 2 }, cursor: null };
  return { f, store, state, binding, providers, request,
    reader: createAcceptedContextReader({ enabled: true, binding, providers }) };
}

export function correctedFixture(f) {
  return authenticFixture({ projectBindingRef: f.projectBindingRef, projectContextRef: f.projectContextRef,
    priorRef: f.currentRef, currentRef: ref(12), priorGenerationNum: 1, currentGenerationNum: 2,
    priorCas: f.builtCandidate.generation_proposal.cas_fingerprint_sha256, writerEpoch: 4, transformRequest: correctTimeline });
}

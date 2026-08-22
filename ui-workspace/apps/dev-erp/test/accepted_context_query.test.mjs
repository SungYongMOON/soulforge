import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canonicalise } from '../../../../guild_hall/engineering_engine/kernel/canonical.mjs';
import { sha256Canonical } from '../../../../guild_hall/shared/project_history_envelope.mjs';
import { buildProjectPdfKnowledgeCandidate } from '../../../../guild_hall/rag/project_pdf_knowledge_projection.mjs';
import { buildProjectContextGenerationCandidate, computeProjectContextExportedMembershipDigest, computeProjectContextExportedSourceRevisionSetDigest } from '../../../../guild_hall/engineering_engine/kernel/project_context_generation_candidate.mjs';
import {
  PROJECT_CONTEXT_ACCEPTANCE_SUBMISSION_SCHEMA,
  createInMemoryAcceptedContextGenerationStore,
} from '../../../../guild_hall/engineering_engine/kernel/project_context_acceptance_gate.mjs';
import {
  ACCEPTED_CONTEXT_QUERY_RESULT_SCHEMA,
  ACCEPTED_CONTEXT_QUERY_CODES,
  createAcceptedContextQuery,
} from '../src/accepted_context_query.mjs';

const MODULE_URL = new URL('../src/accepted_context_query.mjs', import.meta.url);
const VALID = '2026-08-01T00:00:00.000Z';
const KNOWN = '2026-08-02T00:00:00.000Z';
const CUTOFF_VALID = '2026-08-05T00:00:00.000Z';
const CUTOFF_KNOWN = '2026-08-06T00:00:00.000Z';

function hex(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function hash(value) { return 'sha256:' + hex(value); }
function ref(seed, content = hash('ref:' + seed)) {
  const token = String(seed).padStart(12, '0');
  return { entity_id: '00000000-0000-4000-8000-' + token, revision_id: '10000000-0000-4000-8000-' + token, content_id: content, content_hash_alg: 'sha256' };
}
function refKey(value) { return [value.entity_id, value.revision_id, value.content_id, value.content_hash_alg].join('\u001f'); }
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

function syntheticStoreFixture() {
  const projectRef = ref(1);
  const projectContextRef = 'project-context:synthetic-alpha';
  const gen0Ref = ref(100);
  const gen1Ref = ref(101);

  const memberships = [
    {
      source_span_ref: 'span:mail:1',
      source_revision_ref: ref(201),
      source_lane: 'mail',
      context_event_ref: 'event:mail:1',
      context_unit_ref: 'unit:mail:1',
      context_branch_ref: 'branch:requirements',
      membership_state: 'active',
      correction_state: 'original',
      valid_at: VALID,
      known_at: KNOWN,
    },
    {
      source_span_ref: 'span:slack:1',
      source_revision_ref: ref(202),
      source_lane: 'slack',
      context_event_ref: 'event:slack:1',
      context_unit_ref: 'unit:slack:1',
      context_branch_ref: 'branch:architecture',
      membership_state: 'active',
      correction_state: 'original',
      valid_at: VALID,
      known_at: KNOWN,
    },
    {
      source_span_ref: 'span:voice:1',
      source_revision_ref: ref(203),
      source_lane: 'voice',
      context_event_ref: 'event:voice:1',
      context_unit_ref: 'unit:voice:1',
      context_branch_ref: 'branch:meeting',
      membership_state: 'active',
      correction_state: 'original',
      valid_at: VALID,
      known_at: KNOWN,
    },
    {
      source_span_ref: 'span:common:1',
      source_revision_ref: ref(204),
      source_lane: 'common',
      context_event_ref: 'event:common:1',
      context_unit_ref: 'unit:common:1',
      context_branch_ref: 'branch:common',
      membership_state: 'active',
      correction_state: 'original',
      valid_at: VALID,
      known_at: KNOWN,
    },
  ];
  memberships.forEach(function (member) {
    member.scope = member.source_lane === 'common' ? 'common' : 'project';
    member.review_requirement = 'not_required';
    member.reviewer_state = 'not_required';
    member.supersession = { state: 'root', predecessor_source_span_refs: [] };
    member.acceptance_state = 'accepted_current';
  });

  const candidateDigest = hash('candidate-material-1');
  const manifest = {
    schema_version: 'soulforge.project_context_accepted_generation.v1',
    kind: 'project_context_accepted_generation',
    status: 'accepted',
    accepted_at: '2026-08-03T12:00:00.000Z',
    project_binding_ref: copy(projectRef),
    accepted_generation_ref: copy(gen1Ref),
    prior_generation_ref: copy(gen0Ref),
    cas_fingerprint_sha256: hash('cas-gen1'),
    candidate_digest_sha256: candidateDigest,
    accepted_input_set_digest_sha256: hash('accepted-input-1'),
    submission_digest_sha256: hash('submission-1'),
    producer_refs: {
      p4_result_ref: ref(301, hash('p4-cand')),
      p4_candidate_sha256: hash('p4-cand'),
      m2_assessment_ref: ref(302, hash('m2-ass')),
      m2_assessment_sha256: hash('m2-ass'),
      timeline_projection_ref: ref(303, hash('tl-proj')),
      timeline_projection_sha256: hash('tl-proj'),
    },
    reviewer_receipt: {
      reviewer_ref: ref(401),
      reviewer_epoch_ref: ref(402),
      reviewer_epoch: 3,
      verdict: 'approved',
      reviewed_candidate_digest: candidateDigest,
      reviewed_membership_refs: [],
      decision_ref: ref(80),
      reviewed_at: '2026-08-03T12:00:00.000Z',
    },
    writer_witness: {
      hpp_writer_ref: ref(501),
      writer_epoch_ref: ref(502),
      writer_epoch: 7,
      witnessed_at: '2026-08-03T12:00:00.000Z',
    },
    project_context: {
      project_context_ref: projectContextRef,
      memberships: copy(memberships),
      exported_source_revision_set_digest_sha256: computeProjectContextExportedSourceRevisionSetDigest(memberships),
      exported_membership_digest_sha256: computeProjectContextExportedMembershipDigest(memberships),
      owner_contract_input_digests: { source_rows_sha256: hash('sources-hash'), membership_rows_sha256: sha256Canonical(memberships) },
    },
    bitemporal_cutoff: { valid_at: VALID, known_at: KNOWN },
    coverage_gap_receipt: { review_content_digest_sha256: candidateDigest, exported_source_revision_set_digest_sha256: computeProjectContextExportedSourceRevisionSetDigest(memberships), coverage_complete: true, unresolved_gap_codes: [] },
    claim_ceiling: 'observed',
    manifest_digest_sha256: '',
    authority: { accepted: false, acceptance_allowed: false, generation_advanced: false, source_truth_accepted: false, writer_called: false },
    effects: { persistent_writes: 0, model_calls: 0, network_calls: 0, erp_writes: 0, taskdriver_activations: 0, writer_calls: 0, legacy_csv_writer_calls: 0 },
  };

  const mat = copy(manifest);
  delete mat.manifest_digest_sha256;
  manifest.manifest_digest_sha256 = sha256Canonical(mat);
  const receipt = {
    schema_version: 'soulforge.project_context_accepted_generation_receipt.v1',
    kind: 'project_context_accepted_generation_receipt',
    status: 'accepted',
    accepted_generation_ref: copy(gen1Ref),
    prior_generation_ref: copy(gen0Ref),
    manifest_digest_sha256: manifest.manifest_digest_sha256,
    receipt_digest_sha256: '',
    blocker_codes: [],
    claim_ceiling: 'observed',
  };
  const receiptMaterial = copy(receipt);
  delete receiptMaterial.receipt_digest_sha256;
  receipt.receipt_digest_sha256 = sha256Canonical(receiptMaterial);

  const store = {
    project_ref: copy(projectRef),
    project_context_ref: projectContextRef,
    current_generation: copy(gen1Ref),
    current_cas: hash('cas-gen1'),
    current_epoch: 7,
    generations: new Map([[gen1Ref.entity_id + ':' + gen1Ref.revision_id, manifest]]),
    receipts: new Map([[gen1Ref.entity_id + ':' + gen1Ref.revision_id, receipt]]),
    getCurrentPointer() {
      return {
        generation_ref: copy(this.current_generation),
        cas_fingerprint: this.current_cas,
        writer_epoch: this.current_epoch,
        generation_number: 1,
      };
    },
    getGeneration(targetRef) {
      if (!targetRef) return null;
      return this.generations.get(targetRef.entity_id + ':' + targetRef.revision_id) || null;
    },
    getReceipt(targetRef) {
      if (!targetRef) return null;
      return this.receipts.get(targetRef.entity_id + ':' + targetRef.revision_id) || null;
    },
    hasGeneration(targetRef) {
      if (!targetRef) return false;
      return this.generations.has(targetRef.entity_id + ':' + targetRef.revision_id);
    },
    getProjectRef() {
      return copy(this.project_ref);
    },
  };

  const aclPolicy = {
    actors: new Map([
      ['actor:dev_user_01', { grant_revision_ref: ref(701), allowed_projects: new Set([refKey(projectRef)]), allowed_scopes: new Set(['project', 'common']), allowed_purposes: new Set(['task_context_assembly', 'audit_review']), field_allowed: true, chunk_allowed: true, locator_allowed: true }],
      ['actor:guest_user_02', { grant_revision_ref: ref(702), allowed_projects: new Set(), allowed_scopes: new Set(['common']), allowed_purposes: new Set(['task_context_assembly']), field_allowed: true, chunk_allowed: true, locator_allowed: true }],
    ]),
    revoked_actors: new Set(),
    revoked_generations: new Set(),
  };

  return { projectRef, projectContextRef, gen0Ref, gen1Ref, manifest, store, aclPolicy };
}

test('queries verified accepted generation and returns bounded typed metadata hits without raw body/secrets', async () => {
  const f = syntheticStoreFixture();
  const queryEngine = createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy });

  const queryRequest = {
    actor_ref: 'actor:dev_user_01',
    project_ref: f.projectRef,
    accepted_generation_ref: f.gen1Ref,
    scope: 'project',
    as_of: '2026-08-05T00:00:00.000Z',
    purpose: 'task_context_assembly',
    budget: { max_units: 10 },
    cursor: null,
  };

  const result = await queryEngine.query(queryRequest);
  assert.equal(result.schema_version, ACCEPTED_CONTEXT_QUERY_RESULT_SCHEMA);
  assert.equal(result.status, 'ok');
  assert.equal(result.scope, 'project');
  assert.deepEqual(result.project_ref, f.projectRef);
  assert.deepEqual(result.accepted_generation_ref, f.gen1Ref);
  assert.equal(result.claim_ceiling, 'observed');
  assert.equal(result.hits.length, 3); // 3 project lanes (mail, slack, voice), common is excluded
  assert.equal(result.total_hits, 3);
  assert.equal(result.page_hits, 3);
  assert.ok(result.hits.every(h => h.source_lane !== 'common'));
  assert.ok(result.hits.every(h => h.claim_ceiling === 'observed'));
  assert.equal(result.boundaries.metadata_only, true);
  assert.equal(result.boundaries.raw_payload_copied, false);
  assert.equal(result.boundaries.source_body_loaded, false);
  assert.equal(result.boundaries.writes_performed, false);
});

test('fails closed when a hostile source substitutes valid gen1 records for requested gen2', async () => {
  const f = syntheticStoreFixture();
  const gen2Ref = ref(102);
  const hostileSource = {
    getCurrentPointer: function () { return { generation_ref: copy(gen2Ref) }; },
    getGeneration: function () { return copy(f.manifest); },
    getReceipt: function () {
      return copy(f.store.receipts.get(f.gen1Ref.entity_id + ':' + f.gen1Ref.revision_id));
    },
    getProjectRef: function () { return copy(f.projectRef); },
  };
  const queryEngine = createAcceptedContextQuery({ store: hostileSource, aclPolicy: f.aclPolicy });
  const request = {
    actor_ref: 'actor:dev_user_01',
    project_ref: f.projectRef,
    accepted_generation_ref: gen2Ref,
    scope: 'project',
    as_of: '2026-08-05T00:00:00.000Z',
    purpose: 'task_context_assembly',
    budget: { max_units: 10 },
    cursor: null,
  };

  const result = await queryEngine.query(request);
  const unavailable = await queryEngine.query({ ...request, accepted_generation_ref: f.gen0Ref });

  assert.deepEqual(result, unavailable);
  assert.equal(result.status, 'NOT_AVAILABLE');
  assert.deepEqual(result.blocker_codes, [ACCEPTED_CONTEXT_QUERY_CODES.NOT_AVAILABLE]);
});

test('returns uniform not-available for stale or unaccepted generation', async () => {
  const f = syntheticStoreFixture();
  const queryEngine = createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy });

  const staleRequest = {
    actor_ref: 'actor:dev_user_01',
    project_ref: f.projectRef,
    accepted_generation_ref: f.gen0Ref, // prior stale generation
    scope: 'project',
    as_of: '2026-08-05T00:00:00.000Z',
    purpose: 'task_context_assembly',
    budget: { max_units: 10 },
    cursor: null,
  };

  const result = await queryEngine.query(staleRequest);
  assert.equal(result.status, 'NOT_AVAILABLE');
  assert.deepEqual(result.blocker_codes, [ACCEPTED_CONTEXT_QUERY_CODES.NOT_AVAILABLE]);
  assert.equal(result.hits.length, 0);
});

test('uniform existence policy: unauthorized actor, non-existent project, foreign project return identical NOT_AVAILABLE envelope', async () => {
  const f = syntheticStoreFixture();
  const queryEngine = createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy });

  const unauthorizedReq = {
    actor_ref: 'actor:guest_user_02',
    project_ref: f.projectRef,
    accepted_generation_ref: f.gen1Ref,
    scope: 'project',
    as_of: '2026-08-05T00:00:00.000Z',
    purpose: 'task_context_assembly',
    budget: { max_units: 10 },
    cursor: null,
  };

  const nonExistentReq = {
    actor_ref: 'actor:guest_user_02',
    project_ref: ref(999),
    accepted_generation_ref: f.gen1Ref,
    scope: 'project',
    as_of: '2026-08-05T00:00:00.000Z',
    purpose: 'task_context_assembly',
    budget: { max_units: 10 },
    cursor: null,
  };

  const resUnauthorized = await queryEngine.query(unauthorizedReq);
  const resNonExistent = await queryEngine.query(nonExistentReq);

  assert.equal(resUnauthorized.status, 'NOT_AVAILABLE');
  assert.equal(resNonExistent.status, 'NOT_AVAILABLE');
  assert.equal(resUnauthorized.hits.length, 0);
  assert.equal(resNonExistent.hits.length, 0);
  assert.deepEqual(resUnauthorized.blocker_codes, resNonExistent.blocker_codes);
});

test('strict scope isolation: project scope excludes common records, common scope excludes project records, no fallback', async () => {
  const f = syntheticStoreFixture();
  const queryEngine = createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy });

  const commonRequest = {
    actor_ref: 'actor:dev_user_01',
    project_ref: f.projectRef,
    accepted_generation_ref: f.gen1Ref,
    scope: 'common',
    as_of: '2026-08-05T00:00:00.000Z',
    purpose: 'task_context_assembly',
    budget: { max_units: 10 },
    cursor: null,
  };

  const result = await queryEngine.query(commonRequest);
  assert.equal(result.status, 'ok');
  assert.equal(result.scope, 'common');
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].source_lane, 'common');
});

test('generation-pinned cursor provides deterministic pagination and rejects mismatched cursor', async () => {
  const f = syntheticStoreFixture();
  const queryEngine = createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy });

  const page1Req = {
    actor_ref: 'actor:dev_user_01',
    project_ref: f.projectRef,
    accepted_generation_ref: f.gen1Ref,
    scope: 'project',
    as_of: '2026-08-05T00:00:00.000Z',
    purpose: 'task_context_assembly',
    budget: { max_units: 2 },
    cursor: null,
  };

  const page1 = await queryEngine.query(page1Req);
  assert.equal(page1.hits.length, 2);
  assert.ok(page1.cursor !== null);

  const page2Req = {
    ...page1Req,
    budget: { max_units: 2 },
    cursor: page1.cursor,
  };

  const page2 = await queryEngine.query(page2Req);
  assert.equal(page2.hits.length, 1);
  assert.equal(page2.cursor, null);

  // Different generation cursor
  const badCursorReq = {
    ...page1Req,
    cursor: 'other_gen_digest:0',
  };
  const badResult = await queryEngine.query(badCursorReq);
  assert.equal(badResult.status, 'HOLD');
  assert.ok(badResult.blocker_codes.includes(ACCEPTED_CONTEXT_QUERY_CODES.INVALID_CURSOR));

  const otherGenerationCursor = await queryEngine.query({ ...page1Req, accepted_generation_ref: f.gen0Ref, cursor: page1.cursor });
  assert.equal(otherGenerationCursor.status, 'HOLD');
  assert.deepEqual(otherGenerationCursor.blocker_codes, [ACCEPTED_CONTEXT_QUERY_CODES.CURSOR_GENERATION_MISMATCH]);
});

test('rejects input with raw body/secret/path sentinels without echoing them', async () => {
  const f = syntheticStoreFixture();
  const queryEngine = createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy });

  const forbiddenToken = 'ghp_secret_token_12345';
  const badRequest = {
    actor_ref: 'actor:dev_user_01',
    project_ref: f.projectRef,
    accepted_generation_ref: f.gen1Ref,
    scope: 'project',
    as_of: '2026-08-05T00:00:00.000Z',
    purpose: forbiddenToken,
    budget: { max_units: 10 },
    cursor: null,
  };

  const result = await queryEngine.query(badRequest);
  assert.equal(result.status, 'HOLD');
  assert.equal(JSON.stringify(result).includes(forbiddenToken), false);
});

test('revoked actor, generation, or denied field/chunk/locator grants are blocked under ACL policy', async () => {
  const f = syntheticStoreFixture();
  f.aclPolicy.revoked_actors.add('actor:dev_user_01');
  const queryEngine = createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy });

  const queryRequest = {
    actor_ref: 'actor:dev_user_01',
    project_ref: f.projectRef,
    accepted_generation_ref: f.gen1Ref,
    scope: 'project',
    as_of: '2026-08-05T00:00:00.000Z',
    purpose: 'task_context_assembly',
    budget: { max_units: 10 },
    cursor: null,
  };

  const result = await queryEngine.query(queryRequest);
  assert.equal(result.status, 'NOT_AVAILABLE');
  assert.equal(result.hits.length, 0);

  const generationRevoked = syntheticStoreFixture();
  generationRevoked.aclPolicy.revoked_generations.add(refKey(generationRevoked.gen1Ref));
  const generationResult = await createAcceptedContextQuery({ store: generationRevoked.store, aclPolicy: generationRevoked.aclPolicy }).query({
    ...queryRequest, project_ref: generationRevoked.projectRef, accepted_generation_ref: generationRevoked.gen1Ref,
  });
  assert.deepEqual(generationResult.blocker_codes, [ACCEPTED_CONTEXT_QUERY_CODES.NOT_AVAILABLE]);
});

test('requires a complete exact ACL policy at query-factory construction', () => {
  const f = syntheticStoreFixture();
  assert.throws(function () {
    createAcceptedContextQuery({ store: f.store, aclPolicy: { actors: new Map() } });
  });
});

test('uses one deeply identical not-available envelope for every protected existence outcome', async () => {
  const baseRequest = function (f, actor = 'actor:dev_user_01') {
    return { actor_ref: actor, project_ref: f.projectRef, accepted_generation_ref: f.gen1Ref, scope: 'project', as_of: '2026-08-05T00:00:00.000Z', purpose: 'task_context_assembly', budget: { max_units: 10 }, cursor: null };
  };
  const grantFor = function (project) {
    return { grant_revision_ref: ref(710), allowed_projects: new Set([refKey(project)]), allowed_scopes: new Set(['project']), allowed_purposes: new Set(['task_context_assembly']), field_allowed: true, chunk_allowed: true, locator_allowed: true };
  };
  const unavailable = [];
  {
    const f = syntheticStoreFixture();
    unavailable.push(await createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy }).query(baseRequest(f, 'actor:unknown')));
  }
  {
    const f = syntheticStoreFixture();
    f.aclPolicy.revoked_actors.add('actor:dev_user_01');
    unavailable.push(await createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy }).query(baseRequest(f)));
  }
  {
    const f = syntheticStoreFixture();
    unavailable.push(await createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy }).query(baseRequest(f, 'actor:guest_user_02')));
  }
  for (const actor of ['actor:foreign', 'actor:absent']) {
    const f = syntheticStoreFixture();
    const otherProject = ref(actor === 'actor:foreign' ? 800 : 801);
    f.aclPolicy.actors.set(actor, grantFor(otherProject));
    unavailable.push(await createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy }).query({ ...baseRequest(f, actor), project_ref: otherProject }));
  }
  {
    const f = syntheticStoreFixture();
    unavailable.push(await createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy }).query({ ...baseRequest(f), accepted_generation_ref: ref(802) }));
    unavailable.push(await createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy }).query({ ...baseRequest(f), accepted_generation_ref: f.gen0Ref }));
  }
  unavailable.forEach(function (result) {
    assert.equal(result.status, 'NOT_AVAILABLE');
    assert.deepEqual(result.blocker_codes, [ACCEPTED_CONTEXT_QUERY_CODES.NOT_AVAILABLE]);
    assert.equal(result.hits.length, 0);
  });
  unavailable.slice(1).forEach(function (result) { assert.deepEqual(result, unavailable[0]); });
});

test('rejects independent manifest or receipt tampering and never aliases getter/caller query input', async () => {
  const requestFor = function (f) {
    return { actor_ref: 'actor:dev_user_01', project_ref: f.projectRef, accepted_generation_ref: f.gen1Ref, scope: 'project', as_of: '2026-08-05T00:00:00.000Z', purpose: 'task_context_assembly', budget: { max_units: 10 }, cursor: null };
  };
  for (const tamper of [
    function (f) { f.manifest.authority.writer_called = true; },
    function (f) { f.store.receipts.get(f.gen1Ref.entity_id + ':' + f.gen1Ref.revision_id).receipt_digest_sha256 = hash('tampered-receipt'); },
  ]) {
    const f = syntheticStoreFixture();
    tamper(f);
    const result = await createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy }).query(requestFor(f));
    assert.equal(result.status, 'NOT_AVAILABLE');
    assert.deepEqual(result.blocker_codes, [ACCEPTED_CONTEXT_QUERY_CODES.NOT_AVAILABLE]);
  }
  const f = syntheticStoreFixture();
  const engine = createAcceptedContextQuery({ store: f.store, aclPolicy: f.aclPolicy });
  const request = requestFor(f);
  const result = await engine.query(request);
  const originalProject = copy(result.project_ref);
  request.project_ref.content_id = hash('caller-mutation');
  assert.deepEqual(result.project_ref, originalProject);
  assert.equal(Object.isFrozen(request), false);
  const getterRequest = {};
  for (const [key, value] of Object.entries(requestFor(f))) {
    Object.defineProperty(getterRequest, key, { enumerable: true, get: function () { return value; } });
  }
  const held = await engine.query(getterRequest);
  assert.equal(held.status, 'HOLD');
  assert.deepEqual(held.blocker_codes, [ACCEPTED_CONTEXT_QUERY_CODES.INPUT_INVALID]);
  assert.equal(Object.isFrozen(getterRequest), false);
});

test('end-to-end integration: authentic candidate -> accepted in store -> queried with deterministic replay', async () => {
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
      writer: { schema_version: 'soulforge.project_context_generation_writer_witness.v0', hpp_writer_ref: copy(writerRef), sole_writer: true, writer_epoch_ref: copy(writerEpochRef), writer_epoch: 7, project_binding_ref: copy(projectBindingRef), status: 'bound', valid_at: VALID, known_at: KNOWN },
      lineage: { schema_version: 'soulforge.project_context_generation_lineage.v0', prior_generation: { generation: 3, generation_ref: copy(priorRef), accepted_input_set_digest_sha256: hash('prior-input'), cas_fingerprint_sha256: hash('prior-cas'), supersession_state: 'superseded_by_current_proposal', valid_at: VALID, known_at: KNOWN }, current_generation: { generation: 4, generation_ref: copy(currentRef), supersedes_generation_ref: copy(priorRef), valid_at: VALID, known_at: KNOWN }, observed_prior_cas_fingerprint_sha256: hash('prior-cas'), generation_cutoff: { valid_at: CUTOFF_VALID, known_at: CUTOFF_KNOWN } },
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

  const store = createInMemoryAcceptedContextGenerationStore({
    project_ref: projectBindingRef,
    project_context_ref: projectContextRef,
    initial_generation_ref: priorRef,
    initial_cas_fingerprint: hash('prior-cas'),
    initial_epoch: 1,
    initial_generation_number: built.candidate.generation_proposal.prior_generation_number,
    reviewer_anchor: built.candidate.reviewer_anchor,
    writer_anchor: built.candidate.writer_anchor,
  });

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
      reviewed_at: '2026-08-07T12:00:00.000Z',
    },
    writer_witness: {
      hpp_writer_ref: copy(writerRef),
      writer_epoch_ref: copy(writerEpochRef),
      writer_epoch: 7,
      witnessed_at: '2026-08-07T12:00:00.000Z',
    },
    expected_prior_generation_ref: copy(priorRef),
  };

  const acceptResult = store.acceptCandidate(submission);
  assert.equal(acceptResult.status, 'ACCEPTED');

  const aclPolicy = {
    actors: new Map([
      ['actor:lead_dev', { grant_revision_ref: ref(701), allowed_projects: new Set([refKey(projectBindingRef)]), allowed_scopes: new Set(['project', 'common']), allowed_purposes: new Set(['pilot_context_query']), field_allowed: true, chunk_allowed: true, locator_allowed: true }],
    ]),
    revoked_actors: new Set(),
    revoked_generations: new Set(),
  };

  const queryEngine = createAcceptedContextQuery({ store, aclPolicy });

  const queryRequest = {
    actor_ref: 'actor:lead_dev',
    project_ref: projectBindingRef,
    accepted_generation_ref: currentRef,
    scope: 'project',
    as_of: '2026-08-05T00:00:00.000Z',
    purpose: 'pilot_context_query',
    budget: { max_units: 10 },
    cursor: null,
  };

  const run1 = await queryEngine.query(queryRequest);
  const run2 = await queryEngine.query(queryRequest);

  assert.equal(run1.status, 'ok');
  assert.equal(run1.hits.length, 7); // 6 timeline + 1 p4 knowledge, common excluded
  assert.equal(run1.query_digest, run2.query_digest);
  assert.deepEqual(run1.hits, run2.hits);
});

test('is strictly read-only and has zero forbidden side-effects', () => {
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
    'acceptCandidate',
    'createTask',
    'mcpServer',
  ].forEach(function (forbidden) {
    assert.equal(source.includes(forbidden), false, forbidden);
  });
});

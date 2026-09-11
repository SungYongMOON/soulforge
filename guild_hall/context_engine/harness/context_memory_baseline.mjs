// Test-only adapter: synthetic accepted snapshots, production reader/query.
// This does not accept generations, read operational stores, or assemble answers.
import { createHash } from 'node:crypto';
import { createAcceptedContextReader } from '../src/runtime/accepted_context_reader.mjs';
import { createAcceptedContextQuery } from '../src/guards/accepted_context_query.mjs';
import { sha256Canonical } from '../../shared/project_history_envelope.mjs';
import { exactRefIdentityKey } from '../../engineering_engine/kernel/identity.mjs';
import { computeProjectContextExportedMembershipDigest as membershipDigest,
  computeProjectContextExportedSourceRevisionSetDigest as sourceDigest } from '../../engineering_engine/kernel/project_context_generation_candidate.mjs';

const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const ref = (id, material = id) => ({ entity_id: id, revision_id: id + ':v1',
  content_id: hash(material), content_hash_alg: 'sha256' });
const clone = value => structuredClone(value);
const instant = value => new Date(value).toISOString();
const seal = (value, field) => { value[field] = sha256Canonical(value); return value; };

export function makeBaseline(input) {
  const { request, sources } = input;
  const project = ref('P-A'), generation = ref('generation:' + request.id);
  const producer = ref('producer:synthetic');
  const at = '2026-09-01T00:00:00.000Z';
  // Scenario corpus is supplied without evaluation data. Partition assignment is
  // fixture setup, not a measured search/ranking or authority decision.
  const local = sources.filter(source => source.project === 'P-A');
  const memberships = local.map(source => ({
    source_span_ref: source.id,
    source_revision_ref: { ...ref(source.id, source.body), revision_id: source.revision },
    source_lane: 'mail', scope: 'project', context_event_ref: 'event:' + source.id,
    context_unit_ref: 'unit:' + source.id, context_branch_ref: 'branch:T-A1',
    membership_state: ['superseded', 'retracted'].includes(source.state) ? source.state : 'active',
    correction_state: source.state === 'retracted' ? 'retracted' : 'original',
    review_requirement: 'not_required', reviewer_state: 'not_required',
    supersession: { state: ['superseded', 'retracted'].includes(source.state) ? source.state : 'root', predecessor_source_span_refs: [] },
    valid_at: instant(source.valid_at), known_at: instant(source.known_at),
    acceptance_state: ['superseded', 'retracted'].includes(source.state) ? 'excluded_historical' : 'accepted_current',
  }));
  const candidate = hash('candidate:' + request.id);
  const manifest = seal({
    schema_version: 'soulforge.project_context_accepted_generation.v1', kind: 'project_context_accepted_generation',
    status: 'accepted', accepted_at: at, project_binding_ref: project,
    accepted_generation_ref: generation, prior_generation_ref: ref('generation:prior'),
    cas_fingerprint_sha256: hash('cas'), candidate_digest_sha256: candidate,
    accepted_input_set_digest_sha256: hash('input'), submission_digest_sha256: hash('submission'),
    producer_refs: { p4_result_ref: ref('p4'), p4_candidate_sha256: hash('p4'),
      m2_assessment_ref: ref('m2'), m2_assessment_sha256: hash('m2'),
      timeline_projection_ref: ref('timeline'), timeline_projection_sha256: hash('timeline') },
    reviewer_receipt: { reviewer_ref: ref('reviewer'), reviewer_epoch_ref: ref('reviewer:epoch'), reviewer_epoch: 1,
      verdict: 'approved', reviewed_candidate_digest: candidate, reviewed_membership_refs: [],
      decision_ref: ref('decision'), reviewed_at: at },
    writer_witness: { hpp_writer_ref: ref('writer'), writer_epoch_ref: ref('writer:epoch'), writer_epoch: 1, witnessed_at: at },
    project_context: { project_context_ref: 'context:P-A', memberships,
      exported_source_revision_set_digest_sha256: sourceDigest(memberships),
      exported_membership_digest_sha256: membershipDigest(memberships),
      owner_contract_input_digests: { source_rows_sha256: hash(JSON.stringify(local)), membership_rows_sha256: sha256Canonical(memberships) } },
    bitemporal_cutoff: { valid_at: instant(request.valid_at), known_at: instant(request.known_at) },
    // This is the existing snapshot acceptance contract, not evidence that the
    // requested historical corpus has complete coverage (Q12 probes that gap).
    coverage_gap_receipt: { review_content_digest_sha256: candidate,
      exported_source_revision_set_digest_sha256: sourceDigest(memberships), coverage_complete: true, unresolved_gap_codes: [] },
    claim_ceiling: 'observed',
    authority: { accepted: false, acceptance_allowed: false, generation_advanced: false, source_truth_accepted: false, writer_called: false },
    effects: { persistent_writes: 0, model_calls: 0, network_calls: 0, erp_writes: 0,
      taskdriver_activations: 0, writer_calls: 0, legacy_csv_writer_calls: 0 },
  }, 'manifest_digest_sha256');
  const receipt = seal({ schema_version: 'soulforge.project_context_accepted_generation_receipt.v1',
    kind: 'project_context_accepted_generation_receipt', status: 'accepted',
    accepted_generation_ref: generation, prior_generation_ref: manifest.prior_generation_ref,
    manifest_digest_sha256: manifest.manifest_digest_sha256, blocker_codes: [], claim_ceiling: 'observed',
  }, 'receipt_digest_sha256');
  const acl = { actors: new Map([['actor-a', { grant_revision_ref: ref('grant:a'),
    allowed_projects: new Set([exactRefIdentityKey(project)]), allowed_scopes: new Set(['project']),
    allowed_purposes: new Set(['work', 'improvement']), field_allowed: true, chunk_allowed: true, locator_allowed: true }]]),
  revoked_actors: new Set(), revoked_generations: new Set() };
  const pointer = { project_ref: project, generation_ref: generation, cas_fingerprint: manifest.cas_fingerprint_sha256,
    writer_epoch: 1, project_context_ref: 'context:P-A', generation_number: 1 };
  const counts = { accepted_bundle_reads: 0, source_body_reads: 0 };
  const providers = {
    currentPointer: () => clone(pointer), currentAclPolicy: () => clone(acl),
    currentSourceRevisions: () => clone({ project_ref: project, producer_binding_ref: producer,
      producer_refs: manifest.producer_refs, source_revision_refs: memberships.map(row => ({ scope: row.scope, source_revision_ref: row.source_revision_ref })) }),
    readAcceptedGeneration: () => { counts.accepted_bundle_reads += 1; return clone({ manifest, receipt }); },
  };
  const reader = createAcceptedContextReader({ enabled: true,
    binding: { project_ref: project, producer_binding_ref: producer }, providers });
  const query = createAcceptedContextQuery({ aclPolicy: acl, readModel: {
    getCurrentPointer: () => clone(pointer), getProjectRef: () => clone(project),
    getGeneration: () => clone(manifest), getReceipt: () => clone(receipt),
  } });
  const queryRequest = { actor_ref: request.actor, project_ref: request.project ? ref(request.project) : null,
    accepted_generation_ref: generation, scope: 'project', as_of: instant(request.known_at),
    purpose: request.purpose, budget: { max_units: input.budget.evidence }, cursor: null };
  return { reader, query, queryRequest, counts, providers,
    binding: { project_ref: project, producer_binding_ref: producer }, acl, memberships };
}

export async function runBaseline(input) {
  const f = makeBaseline(input);
  const start = performance.now();
  const raw = await f.reader.query(f.queryRequest);
  const replay = await f.reader.query(f.queryRequest);
  return {
    status: raw.status === 'ok' ? 'OK' : raw.status,
    returned_refs: raw.hits.map(hit => hit.source_span_ref), used_refs: null,
    query_digest: raw.query_digest, result_digest: hash(JSON.stringify(raw)),
    response: raw, replay_equal: JSON.stringify(raw) === JSON.stringify(replay),
    measurements: { output_chars: Array.from(JSON.stringify(raw)).length, evidence: raw.hits.length,
      paths: 0, additional_source_reads: f.counts.source_body_reads,
      accepted_bundle_reads: f.counts.accepted_bundle_reads, elapsed_ms: performance.now() - start,
      tokens: 'UNKNOWN', cost: 'UNKNOWN', model_calls: 0 },
    capability_gaps: ['typed_answer', 'source_locator_resolution', 'separate_valid_known_query',
      'coverage_explanation', 'conflict_explanation', 'full_pack_budget'],
  };
}

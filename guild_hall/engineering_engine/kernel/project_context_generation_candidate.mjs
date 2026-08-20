// One pure P5 pre-acceptance Interface. It normalizes producer envelopes and
// an externally supplied owner contract; it never accepts, advances, or writes.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalise, compareCodePoints, inspectInstant } from './canonical.mjs';
import { exactRefIdentityKey, sameExactRef } from './identity.mjs';
import { sha256Canonical } from '../../shared/project_history_envelope.mjs';

export const PROJECT_CONTEXT_GENERATION_CANDIDATE_REQUEST_SCHEMA = 'soulforge.project_context_generation_candidate_request.v1';
export const PROJECT_CONTEXT_GENERATION_CANDIDATE_SCHEMA = 'soulforge.project_context_generation_candidate.v1';
export const PROJECT_CONTEXT_GENERATION_CANDIDATE_RECEIPT_SCHEMA = 'soulforge.project_context_generation_candidate_receipt.v1';
export const PROJECT_CONTEXT_GENERATION_CANDIDATE_CODES = Object.freeze({
  INPUT_INVALID: 'P5_CONTEXT_INPUT_INVALID',
  OUTER_ANCHOR_REQUIRED: 'P5_CONTEXT_OUTER_ANCHOR_REQUIRED',
  OUTER_ANCHOR_INVALID: 'P5_CONTEXT_OUTER_ANCHOR_INVALID',
  OUTER_MATERIAL_MISMATCH: 'P5_CONTEXT_OUTER_MATERIAL_MISMATCH',
  P4_PRODUCER_INVALID: 'P5_CONTEXT_P4_PRODUCER_INVALID',
  M2_PRODUCER_INVALID: 'P5_CONTEXT_M2_PRODUCER_INVALID',
  TIMELINE_PRODUCER_INVALID: 'P5_CONTEXT_TIMELINE_PRODUCER_INVALID',
  TIMELINE_DIGEST_MISMATCH: 'P5_CONTEXT_TIMELINE_DIGEST_MISMATCH',
  CONTRACT_INVALID: 'P5_CONTEXT_CONTRACT_INVALID',
  CROSSWALK_INVALID: 'P5_CONTEXT_CROSSWALK_INVALID',
  CROSSWALK_MISMATCH: 'P5_CONTEXT_CROSSWALK_MISMATCH',
  SOURCE_NOT_INCLUDED: 'P5_CONTEXT_SOURCE_NOT_INCLUDED',
  SOURCE_INVALID: 'P5_CONTEXT_SOURCE_INVALID',
  MEMBERSHIP_INVALID: 'P5_CONTEXT_MEMBERSHIP_INVALID',
  BITEMPORAL_INVALID: 'P5_CONTEXT_BITEMPORAL_INVALID',
  BITEMPORAL_STALE: 'P5_CONTEXT_BITEMPORAL_STALE',
  SUPERSESSION_INVALID: 'P5_CONTEXT_SUPERSESSION_INVALID',
  COVERAGE_INVALID: 'P5_CONTEXT_COVERAGE_INVALID',
  REVIEW_INVALID: 'P5_CONTEXT_REVIEW_INVALID',
  WRITER_INVALID: 'P5_CONTEXT_WRITER_INVALID',
  LINEAGE_INVALID: 'P5_CONTEXT_LINEAGE_INVALID',
  CAS_MISMATCH: 'P5_CONTEXT_CAS_MISMATCH',
  PROVENANCE_UNPROVEN: 'P5_CONTEXT_PROVENANCE_UNPROVEN',
});

const C = PROJECT_CONTEXT_GENERATION_CANDIDATE_CODES;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const HEX = /^[0-9a-f]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const JWT = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}$/u;
const SECRET = /(?:^|[:._-])(?:token|secret|credential|password|passwd|cookie|bearer)(?:[:._=-]|$)/iu;
const CREDENTIAL = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const FORBIDDEN = /(?:^|_)(?:body|payload|raw|text|query|explanation|private_path|absolute_path|source_path|secret|credential|password|cookie|token)(?:_|$)/u;
const LANES = ['mail', 'slack', 'voice', 'structured_pc_work', 'team_files', 'run_logs'];
const MEMBER_LANES = new Set(LANES.concat(['knowledge', 'common']));
const GAPS = ['bitemporal_stamps', 'coverage_and_gap', 'unresolved_supersession', 'reviewer_state', 'writer_epoch'];
const CLAIMS = ['source_content_membership', 'source_truth', 'freshness', 'terminal_provenance'];
const P4_AUTH = ['source_truth', 'canon', 'project_state', 'approval', 'accepted_context', 'persistent_write_allowed', 'activation_allowed', 'engine_input_allowed', 'erp_write_allowed', 'taskdriver_allowed'];
const P4_EFFECT = ['persistent_writes', 'network_calls', 'model_calls', 'rag_index_writes', 'wiki_writes', 'engine_calls', 'erp_writes'];
const M2_AUTH = ['candidate_only', 'engine_input_general_authority', 'owner_decision_made', 'stage_cleared', 'assignment_made', 'task_intent_created', 'canon_promotion_allowed', 'live_current_claimed'];
const M2_GATES = ['actual_project_activation_allowed', 'stage_clear_allowed', 'taskdriver_activation_allowed', 'erp_write_allowed', 'wiki_write_allowed', 'rag_write_allowed', 'llm_activation_allowed'];
const M2_EFFECT = ['filesystem_writes', 'explicit_network_calls', 'model_calls', 'rag_calls', 'wiki_calls', 'erp_writes', 'taskdriver_activations'];
const P4_TOP = ['schema_version', 'kind', 'status', 'feature_state', 'route', 'project_binding_ref', 'document_revision_ref', 'source_revision_receipt', 'rag_candidate', 'thin_wiki_candidate', 'p5_input_candidate', 'authority', 'effects', 'candidate_sha256'];
const P4_RECEIPT = ['schema_version', 'kind', 'operation', 'status', 'feature_state', 'route', 'blocker', 'source_count', 'project_count', 'retrieval_unit_count', 'searched_unit_count', 'selected_citation_count', 'provenance', 'effects'];
const M2_TOP = ['schema_version', 'pilot_policy_revision', 'feature_state', 'mode', 'status', 'claim_ceiling', 'pilot_grant_ref', 'project_binding_ref', 'knowledge_view', 'project_source_binding', 'current_stage_code', 'role_bound_assessment', 'authority', 'gates', 'effects'];
const M2_VIEW = ['authority_grant_ref', 'policy_ref', 'common_revision_refs', 'knowledge_scope_fingerprint_sha256', 'common_projection_bindings_fingerprint_sha256', 'project_count', 'common_revision_count', 'common_projection_binding_count', 'exact_project_binding_verified', 'policy_binding_verified', 'common_projection_binding_verified', 'engine_input_binding_verified', 'root_metadata_revalidated', 'root_relation', 'body_loaded', 'retrieval_performed', 'enumeration_performed', 'foreign_lookup_performed'];
const M2_BINDING = ['manifest_ref', 'manifest_binding_verified', 'exact_partition_verified', 'project_material_revision_count', 'source_bodies_opened', 'source_content_membership_verified', 'source_truth_validated', 'freshness_validated', 'terminal_provenance_validated'];
const TL_TOP = ['schema_version', 'generation_id', 'generated_at', 'system_receipts', 'project_timelines', 'routing', 'projection_digest', 'boundaries'];
const TL_PROJECT = ['project_ref', 'entries', 'ordered_entry_digest'];
const TL_BOUNDARIES = ['raw_body_copied', 'official_task_mutated', 'official_project_assignment_mutated', 'source_annotations_mutated'];
const ROOT = ['schema_version', 'producer_outputs', 'owner_context_contract'];
const PRODUCERS = ['p4', 'm2', 'timeline'];
const OWNER = ['contract_ref', 'crosswalk', 'bitemporal_cutoffs', 'source_ref_crosswalk', 'memberships', 'provenance_evidence', 'coverage', 'reviews', 'writer', 'lineage'];
const WHOLE = ['material_ref', 'expected_material_sha256', 'expected_project_binding_ref', 'valid_at', 'known_at'];
const CROSS = ['project_binding_ref', 'timeline_project_ref', 'project_context_ref', 'm2_manifest_ref', 'reviewer_authority_ref', 'reviewer_epoch_ref', 'reviewer_epoch', 'valid_at', 'known_at'];
const TIME = ['valid_at', 'known_at'];

function keys(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === fields.length && fields.every(function (field) { return Object.hasOwn(value, field); });
}
function hash(value) { return typeof value === 'string' && HASH.test(value); }
function token(value) {
  return typeof value === 'string' && TOKEN.test(value) && value.normalize('NFC') === value
    && !/^[A-Za-z]:/u.test(value) && !JWT.test(value) && !SECRET.test(value) && !CREDENTIAL.test(value);
}
function ref(value) {
  if (!keys(value, ['entity_id', 'revision_id', 'content_id', 'content_hash_alg'])
      || !token(value.entity_id) || !token(value.revision_id) || !hash(value.content_id)
      || value.content_hash_alg !== 'sha256') return null;
  return exactRefIdentityKey(value) === null ? null : {
    entity_id: value.entity_id, revision_id: value.revision_id,
    content_id: value.content_id, content_hash_alg: value.content_hash_alg,
  };
}
function clone(value) { return { entity_id: value.entity_id, revision_id: value.revision_id, content_id: value.content_id, content_hash_alg: value.content_hash_alg }; }
function instant(value) { return inspectInstant(value).valid; }
function temporal(value) { return instant(value && value.validAt) && instant(value && value.knownAt) && compareCodePoints(value.validAt, value.knownAt) <= 0; }
function allFalse(value, fields) { return keys(value, fields) && fields.every(function (field) { return value[field] === false; }); }
function allZero(value, fields) { return keys(value, fields) && fields.every(function (field) { return value[field] === 0; }); }
function arrays(value, path, output) {
  if (Array.isArray(value)) {
    output[path] = 'insertion_ordered';
    value.forEach(function (item) { arrays(item, path + '[]', output); });
  } else if (value !== null && typeof value === 'object') {
    Object.entries(value).forEach(function (entry) { arrays(entry[1], path ? path + '.' + entry[0] : entry[0], output); });
  }
  return output;
}
function digest(domain, value) {
  return 'sha256:' + createHash('sha256').update(domain + '\0' + canonicalise(value, arrays(value, '', {})), 'utf8').digest('hex');
}
function freeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function allowedProducerKey(path, key) {
  return (key === 'body_included' && (path.endsWith('p4.result.candidate.rag_candidate') || path.endsWith('p4.result.candidate.thin_wiki_candidate')))
    || (key === 'token_fingerprints' && path.endsWith('p4.result.candidate.rag_candidate.retrieval_units[]'))
    || (key === 'extraction_text_sha256' && path.endsWith('p4.result.candidate.source_revision_receipt'))
    || (key === 'body_loaded' && path.endsWith('m2.assessment.knowledge_view'))
    || (key === 'source_body_sha256' && path.indexOf('timeline.projection') >= 0)
    || (key === 'raw_body_copied' && path.endsWith('timeline.projection.boundaries'));
}
function nullProducerPath(path) {
  return path.indexOf('producer_outputs.p4.result') === 0
    || path.indexOf('producer_outputs.m2.assessment') === 0
    || path.indexOf('producer_outputs.timeline.projection') === 0;
}
function snapshot(root) {
  const seen = new WeakSet();
  let count = 0;
  const walk = function (value, depth, path) {
    count += 1;
    if (count > 1200000 || depth > 40) throw new Error('unsafe');
    if (value === null) {
      if (nullProducerPath(path)) return null;
      throw new Error('unsafe');
    }
    if (typeof value === 'string') {
      if (value.length === 0 || value.length > 4096 || value.normalize('NFC') !== value
          || /[\u0000-\u001f\u007f]/u.test(value) || /[\\/]/u.test(value)
          || JWT.test(value) || SECRET.test(value) || CREDENTIAL.test(value)) throw new Error('unsafe');
      return value;
    }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    if (typeof value !== 'object' || types.isProxy(value) || seen.has(value)) throw new Error('unsafe');
    seen.add(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 4096) throw new Error('unsafe');
      const desc = Object.getOwnPropertyDescriptors(value);
      const out = [];
      for (let index = 0; index < value.length; index += 1) {
        const item = desc[String(index)];
        if (!item || !Object.hasOwn(item, 'value') || item.enumerable !== true) throw new Error('unsafe');
        out.push(walk(item.value, depth + 1, path + '[]'));
      }
      return out;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error('unsafe');
    const desc = Object.getOwnPropertyDescriptors(value);
    const list = Reflect.ownKeys(desc);
    if (list.length > 64 || list.some(function (key) { return typeof key !== 'string'; })) throw new Error('unsafe');
    const out = {};
    list.sort(compareCodePoints).forEach(function (key) {
      const item = desc[key];
      if ((!allowedProducerKey(path, key) && FORBIDDEN.test(key)) || !item || !Object.hasOwn(item, 'value') || item.enumerable !== true) throw new Error('unsafe');
      out[key] = walk(item.value, depth + 1, path ? path + '.' + key : key);
    });
    return out;
  };
  try { return walk(root, 0, ''); } catch { return null; }
}

function parseP4(value, blockers) {
  const pin = value && value.material_pin;
  const result = value && value.result;
  const candidate = result && result.candidate;
  const receipt = result && result.receipt;
  if (!keys(value, ['result', 'material_pin']) || !keys(pin, ['result_ref', 'expected_candidate_sha256', 'valid_at', 'known_at'])
      || !ref(pin.result_ref) || !hash(pin.expected_candidate_sha256) || pin.result_ref.content_id !== pin.expected_candidate_sha256
      || !keys(candidate, P4_TOP) || !keys(receipt, P4_RECEIPT)
      || !candidate || candidate.schema_version !== 'soulforge.project_pdf_knowledge_candidate.v0'
      || candidate.kind !== 'project_pdf_knowledge_candidate' || candidate.status !== 'candidate'
      || candidate.feature_state !== 'off' || candidate.route !== 'project_local_candidate_only'
      || !ref(candidate.project_binding_ref) || !ref(candidate.document_revision_ref)
      || !hash(candidate.candidate_sha256) || candidate.candidate_sha256 !== pin.expected_candidate_sha256
      || !allFalse(candidate.authority, P4_AUTH) || !allZero(candidate.effects, P4_EFFECT)
      || !candidate.source_revision_receipt || candidate.source_revision_receipt.kind !== 'project_pdf_source_revision_receipt'
      || candidate.source_revision_receipt.status !== 'candidate' || candidate.source_revision_receipt.feature_state !== 'off'
      || !hash(candidate.source_revision_receipt.source_revision_receipt_sha256)
      || !candidate.p5_input_candidate || candidate.p5_input_candidate.schema_version !== 'soulforge.project_pdf_p5_input_candidate.v0'
      || candidate.p5_input_candidate.status !== 'candidate_not_accepted'
      || candidate.p5_input_candidate.acceptance_allowed !== false || candidate.p5_input_candidate.accepted_generation_created !== false
      || !Array.isArray(candidate.p5_input_candidate.source_revision_set) || candidate.p5_input_candidate.source_revision_set.length !== 1
      || !hash(candidate.p5_input_candidate.source_revision_set_sha256)
      || !Array.isArray(candidate.p5_input_candidate.missing_acceptance_requirements)
      || candidate.p5_input_candidate.missing_acceptance_requirements.length !== GAPS.length
      || candidate.p5_input_candidate.missing_acceptance_requirements.some(function (entry, index) { return entry !== GAPS[index]; })
      || !candidate.rag_candidate || candidate.rag_candidate.body_included !== false || candidate.rag_candidate.source_truth !== false
      || !Array.isArray(candidate.rag_candidate.retrieval_units)
      || !candidate.thin_wiki_candidate || candidate.thin_wiki_candidate.body_included !== false
      || candidate.thin_wiki_candidate.source_truth !== false || candidate.thin_wiki_candidate.canon !== false
      || !Array.isArray(candidate.thin_wiki_candidate.pages)
      || !receipt || receipt.operation !== 'build' || receipt.status !== 'candidate_built' || !allZero(receipt.effects, P4_EFFECT)) {
    blockers.add(C.P4_PRODUCER_INVALID); return null;
  }
  const source = candidate.p5_input_candidate.source_revision_set[0];
  if (!source || source.source_revision_receipt_sha256 !== candidate.source_revision_receipt.source_revision_receipt_sha256
      || !sameExactRef(source.document_revision_ref, candidate.document_revision_ref)
      || digest('soulforge.project_pdf_knowledge.p5_input.v0', candidate.p5_input_candidate.source_revision_set) !== candidate.p5_input_candidate.source_revision_set_sha256
      || !candidate.rag_candidate.retrieval_units.every(function (unit) { return Array.isArray(unit.token_fingerprints) && unit.token_fingerprints.every(hash) && hash(unit.unit_sha256) && hash(unit.excerpt_sha256); })
      || !candidate.thin_wiki_candidate.pages.every(function (page) { return token(page.page_id) && token(page.page_kind) && Array.isArray(page.citations) && page.citations.every(function (citation) { return token(citation.citation_id) && hash(citation.excerpt_sha256) && hash(citation.unit_sha256) && sameExactRef(citation.document_revision_ref, candidate.document_revision_ref); }); })) {
    blockers.add(C.P4_PRODUCER_INVALID); return null;
  }
  const material = Object.assign({}, candidate);
  delete material.candidate_sha256;
  if (digest('soulforge.project_pdf_knowledge_candidate.v0', material) !== candidate.candidate_sha256) {
    blockers.add(C.P4_PRODUCER_INVALID); return null;
  }
  return { resultRef: clone(pin.result_ref), candidateDigest: candidate.candidate_sha256,
    projectRef: clone(candidate.project_binding_ref), documentRef: clone(candidate.document_revision_ref),
    sourceReceipt: source.source_revision_receipt_sha256, sourceSetDigest: candidate.p5_input_candidate.source_revision_set_sha256,
    validAt: pin.valid_at, knownAt: pin.known_at };
}

function parseM2(value, blockers) {
  const assessment = value && value.assessment;
  const pin = value && value.material_pin;
  if (!keys(value, ['assessment', 'material_pin']) || !keys(pin, ['assessment_ref', 'expected_assessment_sha256', 'valid_at', 'known_at'])
      || !ref(pin.assessment_ref) || !hash(pin.expected_assessment_sha256) || pin.assessment_ref.content_id !== pin.expected_assessment_sha256
      || !keys(assessment, M2_TOP)
      || !assessment || assessment.schema_version !== 'soulforge.ax_se_project_context_pilot_assessment.v0'
      || assessment.feature_state !== 'off' || assessment.mode !== 'owner_frozen_manual_zero_write'
      || assessment.status !== 'assessed' || assessment.claim_ceiling !== 'observed'
      || !ref(assessment.pilot_grant_ref) || !ref(assessment.project_binding_ref)
      || !keys(assessment.knowledge_view, M2_VIEW) || assessment.knowledge_view.body_loaded !== false
      || !Array.isArray(assessment.knowledge_view.common_revision_refs)
      || assessment.knowledge_view.common_revision_refs.some(function (entry) { return !ref(entry); })
      || !keys(assessment.project_source_binding, M2_BINDING) || !ref(assessment.project_source_binding.manifest_ref)
      || assessment.project_source_binding.source_content_membership_verified !== false
      || assessment.project_source_binding.source_truth_validated !== false
      || assessment.project_source_binding.freshness_validated !== false
      || assessment.project_source_binding.terminal_provenance_validated !== false
      || !keys(assessment.authority, M2_AUTH) || assessment.authority.candidate_only !== true
      || !M2_AUTH.filter(function (field) { return field !== 'candidate_only'; }).every(function (field) { return assessment.authority[field] === false; })
      || !allFalse(assessment.gates, M2_GATES) || !allZero(assessment.effects, M2_EFFECT)) {
    blockers.add(C.M2_PRODUCER_INVALID); return null;
  }
  const resultDigest = sha256Canonical({ domain: 'soulforge.project_context_generation.m2_assessment.v1', assessment: assessment });
  if (resultDigest !== pin.expected_assessment_sha256) { blockers.add(C.M2_PRODUCER_INVALID); return null; }
  const commons = assessment.knowledge_view.common_revision_refs.map(clone);
  if (new Set(commons.map(exactRefIdentityKey)).size !== commons.length) { blockers.add(C.M2_PRODUCER_INVALID); return null; }
  return { assessmentRef: clone(pin.assessment_ref), digest: resultDigest, projectRef: clone(assessment.project_binding_ref),
    manifestRef: clone(assessment.project_source_binding.manifest_ref), commons: commons.sort(function (left, right) { return compareCodePoints(exactRefIdentityKey(left), exactRefIdentityKey(right)); }),
    projectMaterialCount: assessment.project_source_binding.project_material_revision_count,
    validAt: pin.valid_at, knownAt: pin.known_at };
}

function parseTimeline(value, blockers) {
  const projection = value && value.projection;
  const pin = value && value.projection_pin;
  if (!keys(value, ['projection', 'projection_pin', 'selected_project_ref']) || !keys(pin, ['projection_ref', 'expected_projection_sha256', 'valid_at', 'known_at'])
      || !ref(pin.projection_ref) || !hash(pin.expected_projection_sha256) || pin.projection_ref.content_id !== pin.expected_projection_sha256
      || !keys(projection, TL_TOP)
      || !token(value.selected_project_ref) || !projection || projection.schema_version !== 'soulforge.project_timeline_projection.v1'
      || !token(projection.generation_id) || !instant(projection.generated_at) || !Array.isArray(projection.project_timelines)
      || !hash(projection.projection_digest) || !keys(projection.boundaries, TL_BOUNDARIES)
      || projection.boundaries.raw_body_copied !== false || projection.boundaries.official_task_mutated !== false
      || projection.boundaries.official_project_assignment_mutated !== false || projection.boundaries.source_annotations_mutated !== false
      || !keys(projection.routing, ['candidate', 'unassigned', 'common', 'restricted', 'conflict'])
      || !Object.values(projection.routing).every(Array.isArray)) {
    blockers.add(C.TIMELINE_PRODUCER_INVALID); return null;
  }
  const material = Object.assign({}, projection);
  delete material.projection_digest;
  let digestValue;
  try { digestValue = sha256Canonical(material); } catch { blockers.add(C.TIMELINE_PRODUCER_INVALID); return null; }
  if (digestValue !== projection.projection_digest || digestValue !== pin.expected_projection_sha256) {
    blockers.add(C.TIMELINE_DIGEST_MISMATCH); return null;
  }
  const matches = projection.project_timelines.filter(function (timeline) { return timeline && timeline.project_ref === value.selected_project_ref; });
  if (matches.length !== 1 || !keys(matches[0], TL_PROJECT) || !Array.isArray(matches[0].entries) || !hash(matches[0].ordered_entry_digest)
      || sha256Canonical(matches[0].entries) !== matches[0].ordered_entry_digest) {
    blockers.add(C.TIMELINE_PRODUCER_INVALID); return null;
  }
  const ids = new Set();
  const entries = [];
  for (const entry of matches[0].entries) {
    if (!token(entry && entry.entry_id) || !token(entry.annotation_revision_id) || !token(entry.binding_id)
        || !instant(entry.binding_known_at) || !instant(entry.binding_recorded_at)
        || entry.route_bucket !== 'project_confirmed' || !LANES.includes(entry.source_lane)
        || !token(entry.source_revision_ref) || !HEX.test(entry.source_body_sha256 || '')
        || !token(entry.source_span_ref) || entry.project_ref !== value.selected_project_ref
        || entry.project_resolution_state !== 'confirmed' || ids.has(entry.entry_id)) {
      blockers.add(C.TIMELINE_PRODUCER_INVALID); return null;
    }
    ids.add(entry.entry_id);
    entries.push({ id: entry.entry_id, lane: entry.source_lane, opaqueRef: entry.source_revision_ref, span: entry.source_span_ref,
      bindingKnownAt: entry.binding_known_at, bindingRecordedAt: entry.binding_recorded_at });
  }
  return { projectionRef: clone(pin.projection_ref), digest: digestValue, projectRef: value.selected_project_ref,
    generationId: projection.generation_id, orderedDigest: matches[0].ordered_entry_digest, entries: entries,
    validAt: pin.valid_at, knownAt: pin.known_at };
}

function parseSources(value, blockers) {
  if (!Array.isArray(value) || value.length === 0) { blockers.add(C.SOURCE_INVALID); return null; }
  const rows = [];
  const byRef = new Map();
  const successor = new Map();
  for (const entry of value) {
    const corrected = entry && entry.correction_state === 'corrected';
    const timeline = entry && entry.source_kind === 'timeline';
    const fields = ['source_kind', 'scope', 'source_revision_ref', 'source_revision_receipt_sha256', 'inclusion_state', 'correction_state', 'valid_at', 'known_at'].concat(corrected ? ['predecessor_revision_ref'] : []).concat(timeline ? ['timeline_entry_id', 'timeline_source_revision_ref'] : []);
    if (!keys(entry, fields) || ['p4', 'm2_project', 'm2_common', 'timeline'].indexOf(entry.source_kind) < 0
        || ['project', 'common'].indexOf(entry.scope) < 0 || !ref(entry.source_revision_ref)
        || !hash(entry.source_revision_receipt_sha256) || ['included', 'gap', 'unclassified', 'held_conflict', 'superseded'].indexOf(entry.inclusion_state) < 0
        || ['original', 'corrected'].indexOf(entry.correction_state) < 0
        || (corrected && !ref(entry.predecessor_revision_ref))
        || (timeline && (!token(entry.timeline_entry_id) || !token(entry.timeline_source_revision_ref)))) {
      blockers.add(C.SOURCE_INVALID); return null;
    }
    const key = exactRefIdentityKey(entry.source_revision_ref);
    if (byRef.has(key)) { blockers.add(C.SOURCE_INVALID); return null; }
    const row = { kind: entry.source_kind, scope: entry.scope, ref: clone(entry.source_revision_ref), receipt: entry.source_revision_receipt_sha256,
      inclusion: entry.inclusion_state, correction: entry.correction_state, predecessor: corrected ? clone(entry.predecessor_revision_ref) : undefined,
      entryId: timeline ? entry.timeline_entry_id : undefined, opaqueRef: timeline ? entry.timeline_source_revision_ref : undefined,
      validAt: entry.valid_at, knownAt: entry.known_at };
    rows.push(row); byRef.set(key, row);
  }
  rows.forEach(function (row) {
    if (row.correction !== 'corrected') return;
    const key = exactRefIdentityKey(row.predecessor);
    const prior = byRef.get(key);
    if (!prior || prior.inclusion !== 'superseded' || !temporal(row) || !temporal(prior)
        || compareCodePoints(row.validAt, prior.validAt) < 0 || compareCodePoints(row.knownAt, prior.knownAt) < 0
        || successor.has(key)) blockers.add(C.SUPERSESSION_INVALID);
    else successor.set(key, exactRefIdentityKey(row.ref));
  });
  for (const start of successor.keys()) {
    const visited = new Set();
    let current = start;
    while (successor.has(current)) {
      if (visited.has(current)) { blockers.add(C.SUPERSESSION_INVALID); break; }
      visited.add(current); current = successor.get(current);
    }
  }
  return { rows: rows, byRef: byRef };
}

function parseMemberships(value, blockers) {
  if (!Array.isArray(value) || value.length === 0) { blockers.add(C.MEMBERSHIP_INVALID); return null; }
  const rows = [];
  const bySpan = new Map();
  const successor = new Map();
  for (const entry of value) {
    const corrected = entry && entry.correction_state === 'corrected';
    const review = entry && entry.review_requirement === 'required';
    const timeline = LANES.indexOf(entry && entry.source_lane) >= 0;
    const fields = ['source_span_ref', 'source_revision_ref', 'source_lane', 'evidence_ref', 'context_event_ref', 'context_unit_ref', 'context_branch_ref', 'project_context_ref', 'membership_state', 'correction_state', 'review_requirement', 'valid_at', 'known_at'].concat(corrected ? ['predecessor_source_span_ref'] : []).concat(review ? ['review_proposal_ref'] : []).concat(timeline ? ['timeline_entry_id', 'timeline_source_revision_ref'] : []);
    if (!keys(entry, fields) || !token(entry.source_span_ref) || !ref(entry.source_revision_ref) || !MEMBER_LANES.has(entry.source_lane)
        || !ref(entry.evidence_ref) || !token(entry.context_event_ref) || !token(entry.context_unit_ref)
        || !token(entry.context_branch_ref) || !token(entry.project_context_ref)
        || ['active', 'superseded'].indexOf(entry.membership_state) < 0
        || ['original', 'corrected'].indexOf(entry.correction_state) < 0
        || ['not_required', 'required'].indexOf(entry.review_requirement) < 0
        || (corrected && !token(entry.predecessor_source_span_ref))
        || (review && !ref(entry.review_proposal_ref))
        || (timeline && (!token(entry.timeline_entry_id) || !token(entry.timeline_source_revision_ref)))
        || bySpan.has(entry.source_span_ref)) {
      blockers.add(C.MEMBERSHIP_INVALID); return null;
    }
    const row = { span: entry.source_span_ref, ref: clone(entry.source_revision_ref), lane: entry.source_lane, evidence: clone(entry.evidence_ref),
      event: entry.context_event_ref, unit: entry.context_unit_ref, branch: entry.context_branch_ref, project: entry.project_context_ref,
      state: entry.membership_state, correction: entry.correction_state, predecessor: corrected ? entry.predecessor_source_span_ref : undefined,
      review: review ? clone(entry.review_proposal_ref) : undefined, entryId: timeline ? entry.timeline_entry_id : undefined,
      opaqueRef: timeline ? entry.timeline_source_revision_ref : undefined, validAt: entry.valid_at, knownAt: entry.known_at };
    rows.push(row); bySpan.set(row.span, row);
  }
  rows.forEach(function (row) {
    if (row.correction !== 'corrected') return;
    const prior = bySpan.get(row.predecessor);
    if (!prior || prior.state !== 'superseded' || !temporal(row) || !temporal(prior)
        || compareCodePoints(row.validAt, prior.validAt) < 0 || compareCodePoints(row.knownAt, prior.knownAt) < 0
        || successor.has(row.predecessor)) blockers.add(C.SUPERSESSION_INVALID);
    else successor.set(row.predecessor, row.span);
  });
  for (const start of successor.keys()) {
    const visited = new Set();
    let current = start;
    while (successor.has(current)) {
      if (visited.has(current)) { blockers.add(C.SUPERSESSION_INVALID); break; }
      visited.add(current);
      current = successor.get(current);
    }
  }
  return { rows: rows, bySpan: bySpan };
}

function parseEvidence(value, blockers) {
  if (!Array.isArray(value)) { blockers.add(C.PROVENANCE_UNPROVEN); return null; }
  const rows = []; const seen = new Set();
  for (const entry of value) {
    if (!keys(entry, ['claim', 'evidence_ref', 'source_revision_ref', 'state', 'valid_at', 'known_at'])
        || CLAIMS.indexOf(entry.claim) < 0 || !ref(entry.evidence_ref) || !ref(entry.source_revision_ref)
        || entry.state !== 'satisfied' || seen.has(entry.claim)) { blockers.add(C.PROVENANCE_UNPROVEN); return null; }
    seen.add(entry.claim); rows.push({ claim: entry.claim, evidence: clone(entry.evidence_ref), ref: clone(entry.source_revision_ref), validAt: entry.valid_at, knownAt: entry.known_at });
  }
  return rows.sort(function (left, right) { return compareCodePoints(left.claim, right.claim); });
}

function parseSimple(value, blockers) {
  if (!keys(value.coverage, ['schema_version', 'source_lanes']) || value.coverage.schema_version !== 'soulforge.project_context_generation_coverage.v0'
      || !Array.isArray(value.coverage.source_lanes) || !Array.isArray(value.reviews)
      || !keys(value.writer, ['schema_version', 'hpp_writer_ref', 'sole_writer', 'writer_epoch_ref', 'writer_epoch', 'project_binding_ref', 'status', 'valid_at', 'known_at'])
      || !keys(value.lineage, ['schema_version', 'prior_generation', 'current_generation', 'observed_prior_cas_fingerprint_sha256', 'generation_cutoff'])) {
    blockers.add(C.CONTRACT_INVALID); return null;
  }
  const coverage = []; const covered = new Set();
  for (const row of value.coverage.source_lanes) {
    if (!keys(row, ['source_lane', 'state', 'valid_at', 'known_at']) || LANES.indexOf(row.source_lane) < 0
        || ['covered', 'gap'].indexOf(row.state) < 0 || covered.has(row.source_lane)) { blockers.add(C.COVERAGE_INVALID); return null; }
    covered.add(row.source_lane); coverage.push({ lane: row.source_lane, state: row.state, validAt: row.valid_at, knownAt: row.known_at });
  }
  if (covered.size !== LANES.length) blockers.add(C.COVERAGE_INVALID);
  const reviews = []; const reviewRefs = new Set();
  for (const row of value.reviews) {
    if (!keys(row, ['proposal_ref', 'reviewer_state', 'valid_at', 'known_at']) || !ref(row.proposal_ref)
        || ['pending_registered_human_review', 'reviewed'].indexOf(row.reviewer_state) < 0) { blockers.add(C.REVIEW_INVALID); return null; }
    const key = exactRefIdentityKey(row.proposal_ref); if (reviewRefs.has(key)) { blockers.add(C.REVIEW_INVALID); return null; }
    reviewRefs.add(key); reviews.push({ ref: clone(row.proposal_ref), state: row.reviewer_state, validAt: row.valid_at, knownAt: row.known_at });
  }
  const writer = value.writer;
  if (writer.schema_version !== 'soulforge.project_context_generation_writer_witness.v0' || !ref(writer.hpp_writer_ref)
      || writer.sole_writer !== true || !ref(writer.writer_epoch_ref) || !Number.isSafeInteger(writer.writer_epoch)
      || writer.writer_epoch < 1 || !ref(writer.project_binding_ref) || writer.status !== 'bound') { blockers.add(C.WRITER_INVALID); return null; }
  const prior = value.lineage.prior_generation; const current = value.lineage.current_generation;
  if (!keys(prior, ['generation', 'generation_ref', 'accepted_input_set_digest_sha256', 'cas_fingerprint_sha256', 'supersession_state', 'valid_at', 'known_at'])
      || !keys(current, ['generation', 'generation_ref', 'supersedes_generation_ref', 'valid_at', 'known_at'])
      || !keys(value.lineage.generation_cutoff, ['valid_at', 'known_at'])
      || !Number.isSafeInteger(prior.generation) || !Number.isSafeInteger(current.generation)
      || current.generation !== prior.generation + 1 || !ref(prior.generation_ref) || !ref(current.generation_ref)
      || !ref(current.supersedes_generation_ref) || sameExactRef(prior.generation_ref, current.generation_ref)
      || !sameExactRef(prior.generation_ref, current.supersedes_generation_ref)
      || !hash(prior.accepted_input_set_digest_sha256) || !hash(prior.cas_fingerprint_sha256)
      || prior.supersession_state !== 'superseded_by_current_proposal'
      || value.lineage.observed_prior_cas_fingerprint_sha256 !== prior.cas_fingerprint_sha256) { blockers.add(C.LINEAGE_INVALID); return null; }
  return { coverage: coverage, reviews: reviews, writer: { ref: clone(writer.hpp_writer_ref), epochRef: clone(writer.writer_epoch_ref), epoch: writer.writer_epoch, projectRef: clone(writer.project_binding_ref), validAt: writer.valid_at, knownAt: writer.known_at },
    lineage: { prior: { ref: clone(prior.generation_ref), cas: prior.cas_fingerprint_sha256, validAt: prior.valid_at, knownAt: prior.known_at }, current: { ref: clone(current.generation_ref), validAt: current.valid_at, knownAt: current.known_at }, cutoff: { validAt: value.lineage.generation_cutoff.valid_at, knownAt: value.lineage.generation_cutoff.known_at } } };
}

function parseOwner(value, blockers) {
  if (!keys(value, OWNER) || !ref(value.contract_ref) || !keys(value.crosswalk, ['project_binding_ref', 'timeline_project_ref', 'project_context_ref', 'm2_manifest_ref', 'reviewer_authority_ref', 'reviewer_epoch_ref', 'reviewer_epoch', 'valid_at', 'known_at'])
      || !keys(value.bitemporal_cutoffs, ['valid_at', 'known_at']) || !ref(value.crosswalk.project_binding_ref)
      || !token(value.crosswalk.timeline_project_ref) || !token(value.crosswalk.project_context_ref)
      || !ref(value.crosswalk.m2_manifest_ref) || !ref(value.crosswalk.reviewer_authority_ref)
      || !ref(value.crosswalk.reviewer_epoch_ref) || !Number.isSafeInteger(value.crosswalk.reviewer_epoch) || value.crosswalk.reviewer_epoch < 1) {
    blockers.add(C.CONTRACT_INVALID); return null;
  }
  const sources = parseSources(value.source_ref_crosswalk, blockers);
  const memberships = parseMemberships(value.memberships, blockers);
  const evidence = parseEvidence(value.provenance_evidence, blockers);
  const simple = parseSimple(value, blockers);
  if (!sources || !memberships || !evidence || !simple) return null;
  return { contractRef: clone(value.contract_ref), cross: { projectRef: clone(value.crosswalk.project_binding_ref), timelineProject: value.crosswalk.timeline_project_ref, projectContext: value.crosswalk.project_context_ref, manifestRef: clone(value.crosswalk.m2_manifest_ref), reviewerRef: clone(value.crosswalk.reviewer_authority_ref), reviewerEpochRef: clone(value.crosswalk.reviewer_epoch_ref), reviewerEpoch: value.crosswalk.reviewer_epoch, validAt: value.crosswalk.valid_at, knownAt: value.crosswalk.known_at }, cutoff: { validAt: value.bitemporal_cutoffs.valid_at, knownAt: value.bitemporal_cutoffs.known_at }, sources: sources, memberships: memberships, evidence: evidence, coverage: simple.coverage, reviews: simple.reviews, writer: simple.writer, lineage: simple.lineage };
}

function parseWhole(value, blockers) {
  if (!keys(value, WHOLE) || !ref(value.material_ref)
      || !hash(value.expected_material_sha256) || value.material_ref.content_id !== value.expected_material_sha256
      || !ref(value.expected_project_binding_ref)) {
    blockers.add(C.OUTER_ANCHOR_INVALID); return null;
  }
  return { materialRef: clone(value.material_ref), expected: value.expected_material_sha256,
    projectRef: clone(value.expected_project_binding_ref), validAt: value.valid_at, knownAt: value.known_at };
}

function temporalGate(blockers, cutoff, records) {
  if (!temporal(cutoff)) { blockers.add(C.BITEMPORAL_INVALID); return; }
  records.flat().forEach(function (record) {
    if (!temporal(record)) { blockers.add(C.BITEMPORAL_INVALID); return; }
    if (compareCodePoints(record.validAt, cutoff.validAt) > 0 || compareCodePoints(record.knownAt, cutoff.knownAt) > 0) blockers.add(C.BITEMPORAL_STALE);
  });
}

function bind(outer, p4, m2, timeline, owner, blockers) {
  if (!sameExactRef(outer.projectRef, owner.cross.projectRef) || !sameExactRef(outer.projectRef, p4.projectRef) || !sameExactRef(outer.projectRef, m2.projectRef)
      || owner.cross.timelineProject !== timeline.projectRef || !sameExactRef(owner.cross.manifestRef, m2.manifestRef)
      || !sameExactRef(owner.writer.projectRef, outer.projectRef)) blockers.add(C.CROSSWALK_MISMATCH);
  const p4Rows = owner.sources.rows.filter(function (row) { return row.kind === 'p4'; });
  if (p4Rows.length !== 1 || p4Rows[0].inclusion !== 'included' || !sameExactRef(p4Rows[0].ref, p4.documentRef) || p4Rows[0].receipt !== p4.sourceReceipt) blockers.add(C.CROSSWALK_MISMATCH);
  const commonRows = owner.sources.rows.filter(function (row) { return row.kind === 'm2_common'; });
  if (commonRows.length !== m2.commons.length || commonRows.some(function (row) { return row.scope !== 'common' || row.inclusion !== 'included'; }) || m2.commons.some(function (item) { return !commonRows.some(function (row) { return sameExactRef(row.ref, item); }); })) blockers.add(C.CROSSWALK_MISMATCH);
  const m2ProjectRows = owner.sources.rows.filter(function (row) { return row.kind === 'm2_project'; });
  if (m2ProjectRows.length !== m2.projectMaterialCount
      || m2ProjectRows.some(function (row) { return row.scope !== 'project' || row.inclusion !== 'included'; })) blockers.add(C.CROSSWALK_MISMATCH);
  timeline.entries.forEach(function (entry) {
    const rows = owner.sources.rows.filter(function (row) { return row.kind === 'timeline' && row.entryId === entry.id && row.opaqueRef === entry.opaqueRef && row.inclusion === 'included'; });
    if (rows.length !== 1) blockers.add(C.CROSSWALK_MISMATCH);
  });
  owner.memberships.rows.forEach(function (member) {
    const source = owner.sources.byRef.get(exactRefIdentityKey(member.ref));
    if (!source || source.inclusion !== 'included') { blockers.add(C.SOURCE_NOT_INCLUDED); return; }
    if (member.project !== owner.cross.projectContext) blockers.add(C.CROSSWALK_MISMATCH);
    if (LANES.indexOf(member.lane) >= 0) {
      const entry = timeline.entries.find(function (item) { return item.id === member.entryId; });
      if (!entry || entry.lane !== member.lane || entry.span !== member.span || entry.opaqueRef !== member.opaqueRef) blockers.add(C.CROSSWALK_MISMATCH);
    }
  });
  CLAIMS.forEach(function (claim) {
    const evidence = owner.evidence.find(function (row) { return row.claim === claim; });
    const source = evidence && owner.sources.byRef.get(exactRefIdentityKey(evidence.ref));
    const member = evidence && owner.memberships.rows.find(function (row) { return sameExactRef(row.ref, evidence.ref) && sameExactRef(row.evidence, evidence.evidence) && row.validAt === evidence.validAt && row.knownAt === evidence.knownAt; });
    if (!evidence || !source || source.inclusion !== 'included' || !member) blockers.add(C.PROVENANCE_UNPROVEN);
  });
  LANES.forEach(function (lane) {
    const coverage = owner.coverage.find(function (row) { return row.lane === lane; });
    const count = timeline.entries.filter(function (entry) { return entry.lane === lane; }).length;
    if (!coverage || (coverage.state === 'covered' && count === 0) || (coverage.state === 'gap' && count !== 0)) blockers.add(C.COVERAGE_INVALID);
  });
  owner.memberships.rows.filter(function (row) { return row.review; }).forEach(function (row) {
    if (!owner.reviews.some(function (review) { return sameExactRef(review.ref, row.review); })) blockers.add(C.REVIEW_INVALID);
  });
  if (!temporal(owner.lineage.prior) || !temporal(owner.lineage.current) || compareCodePoints(owner.lineage.current.validAt, owner.lineage.prior.validAt) < 0 || compareCodePoints(owner.lineage.current.knownAt, owner.lineage.prior.knownAt) < 0) blockers.add(C.SUPERSESSION_INVALID);
  temporalGate(blockers, owner.cutoff, [outer, p4, m2, timeline, owner.cross, owner.writer, owner.lineage.prior, owner.lineage.current, owner.sources.rows, owner.memberships.rows, owner.evidence, owner.coverage, owner.reviews]);
}

function authority() { return { accepted: false, acceptance_allowed: false, generation_advanced: false, source_truth_accepted: false, writer_called: false }; }
function effects() { return { persistent_writes: 0, model_calls: 0, network_calls: 0, erp_writes: 0, taskdriver_activations: 0, writer_calls: 0, legacy_csv_writer_calls: 0 }; }
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value !== null && typeof value === 'object') {
    const output = {};
    Object.entries(value).forEach(function (entry) {
      if (entry[1] !== undefined) output[entry[0]] = clean(entry[1]);
    });
    return output;
  }
  return value;
}
function makeReceipt(status, blockers, observed) {
  const value = { schema_version: PROJECT_CONTEXT_GENERATION_CANDIDATE_RECEIPT_SCHEMA, kind: 'project_context_generation_candidate_receipt', status: status, blocker_codes: Array.from(blockers).sort(compareCodePoints), authority: authority(), effects: effects() };
  if (observed) value.observed_material_sha256 = observed;
  return freeze(value);
}

export function buildProjectContextGenerationCandidate(request, trustedExpectedPin) {
  const safe = snapshot(request);
  if (!safe || !keys(safe, ROOT) || safe.schema_version !== PROJECT_CONTEXT_GENERATION_CANDIDATE_REQUEST_SCHEMA || !keys(safe.producer_outputs, PRODUCERS)) {
    return freeze({ candidate: null, receipt: makeReceipt('HOLD', [C.INPUT_INVALID]) });
  }
  const blockers = new Set();
  const safePin = snapshot(trustedExpectedPin);
  const outer = safePin === null ? null : parseWhole(safePin, blockers);
  if (!outer) blockers.add(C.OUTER_ANCHOR_REQUIRED);
  const p4 = parseP4(safe.producer_outputs.p4, blockers);
  const m2 = parseM2(safe.producer_outputs.m2, blockers);
  const timeline = parseTimeline(safe.producer_outputs.timeline, blockers);
  const owner = parseOwner(safe.owner_context_contract, blockers);
  let observed;
  if (outer && p4 && m2 && timeline && owner) {
    bind(outer, p4, m2, timeline, owner, blockers);
    try {
      observed = sha256Canonical({
        domain: 'soulforge.project_context_generation.accepted_request.v1',
        request: safe,
      });
      if (observed !== outer.expected) blockers.add(C.OUTER_MATERIAL_MISMATCH);
    } catch { blockers.add(C.OUTER_MATERIAL_MISMATCH); }
  }
  if (blockers.size !== 0) {
    return freeze({ candidate: { schema_version: PROJECT_CONTEXT_GENERATION_CANDIDATE_SCHEMA, kind: 'project_context_generation_candidate', candidate_only: true, status: 'HOLD', claim_ceiling: 'observed', blocker_codes: Array.from(blockers).sort(compareCodePoints), authority: authority(), effects: effects() }, receipt: makeReceipt('HOLD', blockers, observed) });
  }
  const candidate = {
    schema_version: PROJECT_CONTEXT_GENERATION_CANDIDATE_SCHEMA, kind: 'project_context_generation_candidate',
    candidate_only: true, status: 'ready_for_registered_human_review', claim_ceiling: 'observed',
    project_binding_ref: clone(owner.cross.projectRef),
    whole_material_pin: { material_ref: clone(outer.materialRef), material_sha256: observed },
    producer_refs: { p4_result_ref: clone(p4.resultRef), p4_candidate_sha256: p4.candidateDigest, m2_assessment_ref: clone(m2.assessmentRef), m2_assessment_sha256: m2.digest, timeline_projection_ref: clone(timeline.projectionRef), timeline_projection_sha256: timeline.digest },
    reviewer_anchor: { authority_ref: clone(owner.cross.reviewerRef), epoch_ref: clone(owner.cross.reviewerEpochRef), epoch: owner.cross.reviewerEpoch },
    writer_anchor: { hpp_writer_ref: clone(owner.writer.ref), writer_epoch_ref: clone(owner.writer.epochRef), writer_epoch: owner.writer.epoch },
    accepted_input_set_candidate: { candidate_ref: observed, digest_sha256: observed, acceptance_allowed: false },
    generation_proposal: { prior_generation_ref: clone(owner.lineage.prior.ref), current_generation_ref: clone(owner.lineage.current.ref), cas_fingerprint_sha256: sha256Canonical({ material_sha256: observed, prior_cas: owner.lineage.prior.cas }) },
    project_context: { project_context_ref: owner.cross.projectContext, memberships: owner.memberships.rows.map(function (row) { return { source_span_ref: row.span, source_revision_ref: clone(row.ref), source_lane: row.lane, context_event_ref: row.event, context_unit_ref: row.unit, context_branch_ref: row.branch, membership_state: row.state, correction_state: row.correction, valid_at: row.validAt, known_at: row.knownAt }; }), source_revision_set_digest_sha256: sha256Canonical(clean(owner.sources.rows)), membership_digest_sha256: sha256Canonical(clean(owner.memberships.rows)) },
    authority: authority(), effects: effects(), blocker_codes: [],
  };
  return freeze({ candidate: candidate, receipt: makeReceipt('ready_for_registered_human_review', [], observed) });
}

// One pure P5 Accepted Generation Gate and in-memory append-only store.
// Strictly public-synthetic, zero filesystem/network/ERP mutation, deterministic.

import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalise, compareCodePoints } from './canonical.mjs';
import { exactRefIdentityKey, sameExactRef } from './identity.mjs';
import { sha256Canonical } from '../../shared/project_history_envelope.mjs';
import { canonicalInstantEpoch, computeProjectContextReviewContentDigest, computeProjectContextExportedMembershipDigest, computeProjectContextExportedSourceRevisionSetDigest } from './project_context_generation_candidate.mjs';

export const PROJECT_CONTEXT_ACCEPTED_GENERATION_SCHEMA = 'soulforge.project_context_accepted_generation.v1';
export const PROJECT_CONTEXT_ACCEPTED_GENERATION_RECEIPT_SCHEMA = 'soulforge.project_context_accepted_generation_receipt.v1';
export const PROJECT_CONTEXT_ACCEPTANCE_SUBMISSION_SCHEMA = 'soulforge.project_context_acceptance_submission.v1';

export const PROJECT_CONTEXT_ACCEPTANCE_CODES = Object.freeze({
  INPUT_INVALID: 'P5_ACCEPTANCE_INPUT_INVALID',
  PROJECT_MISMATCH: 'P5_ACCEPTANCE_PROJECT_MISMATCH',
  CANDIDATE_UNPROVEN: 'P5_ACCEPTANCE_CANDIDATE_UNPROVEN',
  CANDIDATE_STATUS_INVALID: 'P5_ACCEPTANCE_CANDIDATE_STATUS_INVALID',
  DIGEST_MISMATCH: 'P5_ACCEPTANCE_DIGEST_MISMATCH',
  REVIEW_INVALID: 'P5_ACCEPTANCE_REVIEW_INVALID',
  REVIEW_REJECTED: 'P5_ACCEPTANCE_REVIEW_REJECTED',
  REVIEW_DIGEST_MISMATCH: 'P5_ACCEPTANCE_REVIEW_DIGEST_MISMATCH',
  REVIEWER_ANCHOR_MISMATCH: 'P5_ACCEPTANCE_REVIEWER_ANCHOR_MISMATCH',
  WRITER_INVALID: 'P5_ACCEPTANCE_WRITER_INVALID',
  WRITER_ANCHOR_MISMATCH: 'P5_ACCEPTANCE_WRITER_ANCHOR_MISMATCH',
  WRITER_EPOCH_STALE: 'P5_ACCEPTANCE_WRITER_EPOCH_STALE',
  CAS_MISMATCH: 'P5_ACCEPTANCE_CAS_MISMATCH',
  COVERAGE_GAP_REJECTED: 'P5_ACCEPTANCE_COVERAGE_GAP_REJECTED',
  BITEMPORAL_INVALID: 'P5_ACCEPTANCE_BITEMPORAL_INVALID',
  BITEMPORAL_STALE: 'P5_ACCEPTANCE_BITEMPORAL_STALE',
  STORE_CONFLICT_HOLD: 'P5_ACCEPTANCE_STORE_CONFLICT_HOLD',
  RAW_PAYLOAD_FORBIDDEN: 'P5_ACCEPTANCE_RAW_PAYLOAD_FORBIDDEN',
  REPLAY_IDEMPOTENT: 'P5_ACCEPTANCE_REPLAY_IDEMPOTENT',
  STORE_UNBOUND: 'P5_ACCEPTANCE_STORE_UNBOUND',
  GENERATION_ALREADY_EXISTS: 'P5_ACCEPTANCE_GENERATION_ALREADY_EXISTS',
  CANDIDATE_CONTENT_MISMATCH: 'P5_ACCEPTANCE_CANDIDATE_CONTENT_MISMATCH',
  CANDIDATE_BINDING_MISMATCH: 'P5_ACCEPTANCE_CANDIDATE_BINDING_MISMATCH',
});

const C = PROJECT_CONTEXT_ACCEPTANCE_CODES;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const JWT = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}$/u;
const SECRET = /(?:^|[:._-])(?:token|secret|credential|password|passwd|cookie|bearer)(?:[:._=-]|$)/iu;
const CREDENTIAL = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const FORBIDDEN = /(?:^|_)(?:body|payload|raw|text|query|explanation|private_path|absolute_path|source_path|secret|credential|password|cookie|token)(?:_|$)/u;

const CANDIDATE_TOP_FIELDS = [
  'schema_version', 'kind', 'candidate_only', 'status', 'claim_ceiling',
  'project_binding_ref', 'whole_material_pin', 'producer_refs', 'reviewer_anchor',
  'writer_anchor', 'accepted_input_set_candidate', 'generation_proposal',
  'project_context', 'bitemporal_cutoff', 'review_content_digest_sha256',
  'coverage_gap_receipt',
  'authority', 'effects', 'blocker_codes',
];

const SUBMISSION_FIELDS = [
  'schema_version', 'candidate', 'registered_human_review', 'writer_witness', 'expected_prior_generation_ref',
];

const POINTER_FIELDS = [
  'project_ref', 'project_context_ref', 'generation_ref', 'cas_fingerprint', 'writer_epoch', 'generation_number',
  'reviewer_anchor', 'writer_anchor',
];
const STORE_BINDING_FIELDS = [
  'project_ref', 'project_context_ref', 'initial_generation_ref', 'initial_cas_fingerprint',
  'initial_epoch', 'initial_generation_number', 'reviewer_anchor', 'writer_anchor',
];
const MEMBERSHIP_FIELDS = [
  'source_span_ref', 'source_revision_ref', 'source_lane', 'scope', 'context_event_ref', 'context_unit_ref',
  'context_branch_ref', 'membership_state', 'correction_state', 'review_requirement', 'reviewer_state', 'supersession', 'valid_at', 'known_at',
];
const MANIFEST_FIELDS = [
  'schema_version', 'kind', 'status', 'accepted_at', 'project_binding_ref', 'accepted_generation_ref',
  'prior_generation_ref', 'cas_fingerprint_sha256', 'candidate_digest_sha256',
  'accepted_input_set_digest_sha256', 'submission_digest_sha256', 'producer_refs', 'reviewer_receipt',
  'writer_witness', 'project_context', 'bitemporal_cutoff', 'claim_ceiling',
  'coverage_gap_receipt', 'manifest_digest_sha256', 'authority', 'effects',
];

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

function clone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = clone(v);
  }
  return out;
}

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function instant(value) { return canonicalInstantEpoch(value) !== null; }
function epoch(value) { return canonicalInstantEpoch(value); }

function reviewerAnchor(value) {
  if (!keys(value, ['authority_ref', 'epoch_ref', 'epoch'])
      || !ref(value.authority_ref) || !ref(value.epoch_ref)
      || !Number.isSafeInteger(value.epoch) || value.epoch < 1) return null;
  return { authority_ref: clone(value.authority_ref), epoch_ref: clone(value.epoch_ref), epoch: value.epoch };
}

function writerAnchor(value) {
  if (!keys(value, ['hpp_writer_ref', 'writer_epoch_ref', 'writer_epoch'])
      || !ref(value.hpp_writer_ref) || !ref(value.writer_epoch_ref)
      || !Number.isSafeInteger(value.writer_epoch) || value.writer_epoch < 1) return null;
  return { hpp_writer_ref: clone(value.hpp_writer_ref), writer_epoch_ref: clone(value.writer_epoch_ref), writer_epoch: value.writer_epoch };
}

function sameReviewerAnchor(left, right) {
  return Boolean(left && right && sameExactRef(left.authority_ref, right.authority_ref)
    && sameExactRef(left.epoch_ref, right.epoch_ref) && left.epoch === right.epoch);
}

function sameWriterAnchor(left, right) {
  return Boolean(left && right && sameExactRef(left.hpp_writer_ref, right.hpp_writer_ref)
    && sameExactRef(left.writer_epoch_ref, right.writer_epoch_ref));
}

function parseMemberships(value, blockers) {
  if (!Array.isArray(value) || value.length > 4096) {
    blockers.add(C.CANDIDATE_UNPROVEN);
    return null;
  }
  const seen = new Set();
  const rows = [];
  for (const member of value) {
    if (!keys(member, MEMBERSHIP_FIELDS) || !token(member.source_span_ref) || !ref(member.source_revision_ref)
        || !token(member.source_lane) || !token(member.context_event_ref) || !token(member.context_unit_ref)
        || !token(member.context_branch_ref) || !['active', 'superseded', 'retracted'].includes(member.membership_state)
        || !['original', 'corrected', 'retracted'].includes(member.correction_state)
        || !['project', 'common'].includes(member.scope)
        || (member.scope === 'common' && member.source_lane !== 'common') || (member.scope === 'project' && member.source_lane === 'common')
        || !['not_required', 'required'].includes(member.review_requirement)
        || !['not_required', 'pending_registered_human_review', 'reviewed'].includes(member.reviewer_state)
        || (member.review_requirement === 'not_required' && member.reviewer_state !== 'not_required')
        || (member.review_requirement === 'required' && !['pending_registered_human_review', 'reviewed'].includes(member.reviewer_state))
        || !keys(member.supersession, ['state', 'predecessor_source_span_refs'])
        || !['root', 'resolved_successor', 'superseded', 'retracted'].includes(member.supersession.state)
        || !Array.isArray(member.supersession.predecessor_source_span_refs)
        || member.supersession.predecessor_source_span_refs.some(function (value) { return !token(value); })
        || (member.supersession.state === 'resolved_successor' && member.supersession.predecessor_source_span_refs.length !== 1)
        || (member.supersession.state !== 'resolved_successor' && member.supersession.predecessor_source_span_refs.length !== 0)
        || !instant(member.valid_at) || !instant(member.known_at) || epoch(member.valid_at) > epoch(member.known_at)) {
      blockers.add(C.CANDIDATE_UNPROVEN);
      return null;
    }
    const identity = member.source_span_ref + '\u001f' + exactRefIdentityKey(member.source_revision_ref);
    if (seen.has(identity)) {
      blockers.add(C.CANDIDATE_UNPROVEN);
      return null;
    }
    seen.add(identity);
    rows.push(clone(member));
  }
  for (const member of rows) {
    if (member.supersession.state !== 'resolved_successor') continue;
    const predecessor = rows.find(function (item) { return item.source_span_ref === member.supersession.predecessor_source_span_refs[0]; });
    if (!predecessor || predecessor.membership_state !== 'superseded' || predecessor.supersession.state !== 'superseded') {
      blockers.add(C.CANDIDATE_UNPROVEN);
      return null;
    }
  }
  return rows;
}

function parsePointer(value) {
  if (!keys(value, POINTER_FIELDS) || !ref(value.project_ref) || !token(value.project_context_ref) || !ref(value.generation_ref)
      || !hash(value.cas_fingerprint) || !Number.isSafeInteger(value.writer_epoch) || value.writer_epoch < 0
      || !Number.isSafeInteger(value.generation_number) || value.generation_number < 0) return null;
  const reviewer = reviewerAnchor(value.reviewer_anchor);
  const writer = writerAnchor(value.writer_anchor);
  if (!reviewer || !writer) return null;
  return {
    project_ref: clone(value.project_ref), project_context_ref: value.project_context_ref, generation_ref: clone(value.generation_ref),
    cas_fingerprint: value.cas_fingerprint, writer_epoch: value.writer_epoch,
    generation_number: value.generation_number, reviewer_anchor: reviewer, writer_anchor: writer,
  };
}

function snapshot(root) {
  const seen = new WeakSet();
  let count = 0;
  const walk = function (value, depth, path) {
    count += 1;
    if (count > 1200000 || depth > 40) throw new Error('unsafe');
    if (value === null) return null;
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
      if (FORBIDDEN.test(key) || !item || !Object.hasOwn(item, 'value') || item.enumerable !== true) throw new Error('unsafe');
      out[key] = walk(item.value, depth + 1, path ? path + '.' + key : key);
    });
    return out;
  };
  try { return walk(root, 0, ''); } catch { return null; }
}

function authority() {
  return {
    accepted: false,
    acceptance_allowed: false,
    generation_advanced: false,
    source_truth_accepted: false,
    writer_called: false,
  };
}

function effects() {
  return {
    persistent_writes: 0,
    model_calls: 0,
    network_calls: 0,
    erp_writes: 0,
    taskdriver_activations: 0,
    writer_calls: 0,
    legacy_csv_writer_calls: 0,
  };
}

function parseCandidate(value, blockers) {
  if (!keys(value, CANDIDATE_TOP_FIELDS)
      || value.schema_version !== 'soulforge.project_context_generation_candidate.v1'
      || value.kind !== 'project_context_generation_candidate'
      || value.candidate_only !== true
      || value.status !== 'ready_for_registered_human_review'
      || value.claim_ceiling !== 'observed'
      || !Array.isArray(value.blocker_codes) || value.blocker_codes.length !== 0
      || !ref(value.project_binding_ref)
      || !keys(value.whole_material_pin, ['material_ref', 'material_sha256'])
      || !ref(value.whole_material_pin.material_ref) || !hash(value.whole_material_pin.material_sha256)
      || value.whole_material_pin.material_ref.content_id !== value.whole_material_pin.material_sha256
      || !keys(value.producer_refs, ['p4_result_ref', 'p4_candidate_sha256', 'm2_assessment_ref', 'm2_assessment_sha256', 'timeline_projection_ref', 'timeline_projection_sha256'])
      || !ref(value.producer_refs.p4_result_ref) || !hash(value.producer_refs.p4_candidate_sha256)
      || !ref(value.producer_refs.m2_assessment_ref) || !hash(value.producer_refs.m2_assessment_sha256)
      || !ref(value.producer_refs.timeline_projection_ref) || !hash(value.producer_refs.timeline_projection_sha256)
      || value.producer_refs.p4_result_ref.content_id !== value.producer_refs.p4_candidate_sha256
      || value.producer_refs.m2_assessment_ref.content_id !== value.producer_refs.m2_assessment_sha256
      || value.producer_refs.timeline_projection_ref.content_id !== value.producer_refs.timeline_projection_sha256
      || !reviewerAnchor(value.reviewer_anchor) || !writerAnchor(value.writer_anchor)
      || !keys(value.accepted_input_set_candidate, ['candidate_ref', 'digest_sha256', 'acceptance_allowed'])
      || !hash(value.accepted_input_set_candidate.candidate_ref) || !hash(value.accepted_input_set_candidate.digest_sha256)
      || value.accepted_input_set_candidate.candidate_ref !== value.accepted_input_set_candidate.digest_sha256
      || value.accepted_input_set_candidate.acceptance_allowed !== false
      || value.accepted_input_set_candidate.digest_sha256 !== value.whole_material_pin.material_sha256
      || !keys(value.generation_proposal, ['prior_generation_ref', 'current_generation_ref', 'prior_generation_number', 'current_generation_number', 'cas_fingerprint_sha256'])
      || !ref(value.generation_proposal.prior_generation_ref) || !ref(value.generation_proposal.current_generation_ref)
      || sameExactRef(value.generation_proposal.prior_generation_ref, value.generation_proposal.current_generation_ref)
      || !Number.isSafeInteger(value.generation_proposal.prior_generation_number) || value.generation_proposal.prior_generation_number < 0
      || !Number.isSafeInteger(value.generation_proposal.current_generation_number)
      || value.generation_proposal.current_generation_number !== value.generation_proposal.prior_generation_number + 1
      || !hash(value.generation_proposal.cas_fingerprint_sha256)
      || !keys(value.project_context, ['project_context_ref', 'memberships', 'source_revision_set_digest_sha256', 'membership_digest_sha256', 'exported_source_revision_set_digest_sha256', 'exported_membership_digest_sha256'])
      || !token(value.project_context.project_context_ref) || !Array.isArray(value.project_context.memberships)
      || !hash(value.project_context.source_revision_set_digest_sha256) || !hash(value.project_context.membership_digest_sha256)
      || !hash(value.project_context.exported_source_revision_set_digest_sha256) || !hash(value.project_context.exported_membership_digest_sha256)
      || !keys(value.bitemporal_cutoff, ['valid_at', 'known_at'])
      || !instant(value.bitemporal_cutoff.valid_at) || !instant(value.bitemporal_cutoff.known_at)
      || epoch(value.bitemporal_cutoff.valid_at) > epoch(value.bitemporal_cutoff.known_at)
      || !hash(value.review_content_digest_sha256)
      || !keys(value.coverage_gap_receipt, ['review_content_digest_sha256', 'exported_source_revision_set_digest_sha256', 'coverage_complete', 'unresolved_gap_codes'])
      || !hash(value.coverage_gap_receipt.review_content_digest_sha256) || !hash(value.coverage_gap_receipt.exported_source_revision_set_digest_sha256)
      || typeof value.coverage_gap_receipt.coverage_complete !== 'boolean' || !Array.isArray(value.coverage_gap_receipt.unresolved_gap_codes)
      || value.coverage_gap_receipt.unresolved_gap_codes.some(function (code) { return !token(code); })) {
    blockers.add(C.CANDIDATE_UNPROVEN);
    return null;
  }
  const memberships = parseMemberships(value.project_context.memberships, blockers);
  if (!memberships) return null;
  if (computeProjectContextExportedMembershipDigest(memberships) !== value.project_context.exported_membership_digest_sha256
      || computeProjectContextExportedSourceRevisionSetDigest(memberships) !== value.project_context.exported_source_revision_set_digest_sha256
      || value.coverage_gap_receipt.exported_source_revision_set_digest_sha256 !== value.project_context.exported_source_revision_set_digest_sha256
      || value.coverage_gap_receipt.review_content_digest_sha256 !== value.review_content_digest_sha256) {
    blockers.add(C.CANDIDATE_CONTENT_MISMATCH);
    return null;
  }
  if (memberships.some(function (member) {
    return epoch(member.valid_at) > epoch(value.bitemporal_cutoff.valid_at)
      || epoch(member.known_at) > epoch(value.bitemporal_cutoff.known_at);
  })) {
    blockers.add(C.BITEMPORAL_STALE);
    return null;
  }
  let reviewContent;
  try { reviewContent = computeProjectContextReviewContentDigest(value); } catch { reviewContent = null; }
  if (reviewContent !== value.review_content_digest_sha256) {
    blockers.add(C.CANDIDATE_CONTENT_MISMATCH);
    return null;
  }
  return {
    schema_version: value.schema_version,
    kind: value.kind,
    project_binding_ref: clone(value.project_binding_ref),
    whole_material_pin: clone(value.whole_material_pin),
    producer_refs: clone(value.producer_refs),
    reviewer_anchor: reviewerAnchor(value.reviewer_anchor),
    writer_anchor: writerAnchor(value.writer_anchor),
    accepted_input_set_candidate: clone(value.accepted_input_set_candidate),
    generation_proposal: clone(value.generation_proposal),
    project_context: {
      project_context_ref: value.project_context.project_context_ref,
      memberships: memberships,
      source_revision_set_digest_sha256: value.project_context.source_revision_set_digest_sha256,
      membership_digest_sha256: value.project_context.membership_digest_sha256,
      exported_source_revision_set_digest_sha256: value.project_context.exported_source_revision_set_digest_sha256,
      exported_membership_digest_sha256: value.project_context.exported_membership_digest_sha256,
    },
    bitemporal_cutoff: clone(value.bitemporal_cutoff),
    review_content_digest_sha256: value.review_content_digest_sha256,
    coverage_gap_receipt: clone(value.coverage_gap_receipt),
    claim_ceiling: value.claim_ceiling,
  };
}

function parseReview(value, blockers) {
  if (!keys(value, ['reviewer_ref', 'reviewer_epoch_ref', 'reviewer_epoch', 'verdict', 'reviewed_candidate_digest', 'reviewed_membership_refs', 'decision_ref', 'reviewed_at'])
      || !ref(value.reviewer_ref) || !ref(value.reviewer_epoch_ref) || !Number.isSafeInteger(value.reviewer_epoch) || value.reviewer_epoch < 1
      || !token(value.verdict) || !hash(value.reviewed_candidate_digest) || !Array.isArray(value.reviewed_membership_refs) || !ref(value.decision_ref)
      || !instant(value.reviewed_at)) {
    blockers.add(C.REVIEW_INVALID);
    return null;
  }
  if (value.verdict !== 'approved') {
    blockers.add(C.REVIEW_REJECTED);
  }
  return {
    reviewer_ref: clone(value.reviewer_ref),
    reviewer_epoch_ref: clone(value.reviewer_epoch_ref),
    reviewer_epoch: value.reviewer_epoch,
    verdict: value.verdict,
    reviewed_candidate_digest: value.reviewed_candidate_digest,
    reviewed_membership_refs: clone(value.reviewed_membership_refs),
    decision_ref: clone(value.decision_ref),
    reviewed_at: value.reviewed_at,
  };
}

function parseWriterWitness(value, blockers) {
  if (!keys(value, ['hpp_writer_ref', 'writer_epoch_ref', 'writer_epoch', 'witnessed_at'])
      || !ref(value.hpp_writer_ref) || !ref(value.writer_epoch_ref) || !Number.isSafeInteger(value.writer_epoch) || value.writer_epoch < 1
      || !instant(value.witnessed_at)) {
    blockers.add(C.WRITER_INVALID);
    return null;
  }
  return {
    hpp_writer_ref: clone(value.hpp_writer_ref),
    writer_epoch_ref: clone(value.writer_epoch_ref),
    writer_epoch: value.writer_epoch,
    witnessed_at: value.witnessed_at,
  };
}

export function evaluateProjectContextAcceptance(storePointer, submission) {
  const safe = snapshot(submission);
  if (!safe || !keys(safe, SUBMISSION_FIELDS) || safe.schema_version !== PROJECT_CONTEXT_ACCEPTANCE_SUBMISSION_SCHEMA) {
    const blockers = [C.INPUT_INVALID];
    return freeze({
      status: 'HOLD',
      blocker_codes: blockers,
      receipt: {
        schema_version: PROJECT_CONTEXT_ACCEPTED_GENERATION_RECEIPT_SCHEMA,
        kind: 'project_context_accepted_generation_receipt',
        status: 'HOLD',
        accepted_generation_ref: null,
        prior_generation_ref: null,
        manifest_digest_sha256: null,
        receipt_digest_sha256: null,
        blocker_codes: blockers,
        claim_ceiling: 'observed',
      },
    });
  }

  const blockers = new Set();
  const pointer = parsePointer(snapshot(storePointer));
  if (!pointer) blockers.add(C.STORE_UNBOUND);
  const candidate = parseCandidate(safe.candidate, blockers);
  const review = parseReview(safe.registered_human_review, blockers);
  const writerWitness = parseWriterWitness(safe.writer_witness, blockers);
  const expectedPrior = ref(safe.expected_prior_generation_ref);
  if (!expectedPrior) {
    blockers.add(C.INPUT_INVALID);
  }

  if (candidate && review && writerWitness && expectedPrior && pointer) {
    if (candidate.coverage_gap_receipt.coverage_complete !== true || candidate.coverage_gap_receipt.unresolved_gap_codes.length !== 0) {
      blockers.add(C.COVERAGE_GAP_REJECTED);
    }
    const requiredMemberships = candidate.project_context.memberships.filter(function (member) {
      return member.review_requirement === 'required' && ['pending_registered_human_review', 'reviewed'].includes(member.reviewer_state);
    });
    const reviewedKeys = new Set();
    for (const reviewed of review.reviewed_membership_refs) {
      if (!keys(reviewed, ['source_span_ref', 'source_revision_ref']) || !token(reviewed.source_span_ref) || !ref(reviewed.source_revision_ref)) {
        blockers.add(C.REVIEW_INVALID);
        continue;
      }
      reviewedKeys.add(reviewed.source_span_ref + '\u001f' + exactRefIdentityKey(reviewed.source_revision_ref));
    }
    if (reviewedKeys.size !== review.reviewed_membership_refs.length || reviewedKeys.size !== requiredMemberships.length || requiredMemberships.some(function (member) {
      return !reviewedKeys.has(member.source_span_ref + '\u001f' + exactRefIdentityKey(member.source_revision_ref));
    })) blockers.add(C.REVIEW_INVALID);
    if (!sameReviewerAnchor(candidate.reviewer_anchor, pointer.reviewer_anchor)
        || !sameExactRef(candidate.reviewer_anchor.authority_ref, review.reviewer_ref)
        || !sameExactRef(candidate.reviewer_anchor.epoch_ref, review.reviewer_epoch_ref)
        || candidate.reviewer_anchor.epoch !== review.reviewer_epoch) {
      blockers.add(C.REVIEWER_ANCHOR_MISMATCH);
    }
    if (review.reviewed_candidate_digest !== candidate.review_content_digest_sha256) {
      blockers.add(C.REVIEW_DIGEST_MISMATCH);
    }
    if (!sameWriterAnchor(candidate.writer_anchor, pointer.writer_anchor)
        || !sameExactRef(candidate.writer_anchor.hpp_writer_ref, writerWitness.hpp_writer_ref)
        || !sameExactRef(candidate.writer_anchor.writer_epoch_ref, writerWitness.writer_epoch_ref)
        || candidate.writer_anchor.writer_epoch !== writerWitness.writer_epoch) {
      blockers.add(C.WRITER_ANCHOR_MISMATCH);
    }
    if (!sameExactRef(candidate.generation_proposal.prior_generation_ref, expectedPrior)
        || !sameExactRef(expectedPrior, pointer.generation_ref)
        || candidate.generation_proposal.prior_generation_number !== pointer.generation_number
        || candidate.generation_proposal.current_generation_number !== pointer.generation_number + 1
        || candidate.generation_proposal.cas_fingerprint_sha256 !== sha256Canonical({
          material_sha256: candidate.whole_material_pin.material_sha256,
          prior_cas: pointer.cas_fingerprint,
        })) {
      blockers.add(C.CAS_MISMATCH);
    }
    if (!sameExactRef(candidate.project_binding_ref, pointer.project_ref)
        || candidate.project_context.project_context_ref !== pointer.project_context_ref) {
      blockers.add(C.PROJECT_MISMATCH);
    }
    if (writerWitness.writer_epoch <= pointer.writer_epoch) {
      blockers.add(C.WRITER_EPOCH_STALE);
    }
    if (epoch(review.reviewed_at) < epoch(candidate.bitemporal_cutoff.known_at)
        || epoch(writerWitness.witnessed_at) < epoch(review.reviewed_at)) {
      blockers.add(C.BITEMPORAL_INVALID);
    }
  }

  if (blockers.size !== 0) {
    const sorted = Array.from(blockers).sort(compareCodePoints);
    return freeze({
      status: 'HOLD',
      blocker_codes: sorted,
      receipt: {
        schema_version: PROJECT_CONTEXT_ACCEPTED_GENERATION_RECEIPT_SCHEMA,
        kind: 'project_context_accepted_generation_receipt',
        status: 'HOLD',
        accepted_generation_ref: candidate ? clone(candidate.generation_proposal.current_generation_ref) : null,
        prior_generation_ref: expectedPrior ? clone(expectedPrior) : null,
        manifest_digest_sha256: null,
        receipt_digest_sha256: null,
        blocker_codes: sorted,
        claim_ceiling: 'observed',
      },
    });
  }

  const acceptedMemberships = candidate.project_context.memberships.map(function (member) {
    const current = member.membership_state === 'active'
      && (member.correction_state === 'original' || member.supersession.state === 'resolved_successor');
    return Object.assign({}, clone(member), {
      reviewer_state: member.review_requirement === 'required' ? 'reviewed' : 'not_required',
      acceptance_state: current ? 'accepted_current' : 'excluded_historical',
    });
  });
  const acceptedProjectContext = {
    project_context_ref: candidate.project_context.project_context_ref,
    memberships: acceptedMemberships,
    exported_membership_digest_sha256: computeProjectContextExportedMembershipDigest(acceptedMemberships),
    exported_source_revision_set_digest_sha256: computeProjectContextExportedSourceRevisionSetDigest(acceptedMemberships),
    owner_contract_input_digests: {
      source_rows_sha256: candidate.project_context.source_revision_set_digest_sha256,
      membership_rows_sha256: candidate.project_context.membership_digest_sha256,
    },
  };
  const manifest = {
    schema_version: PROJECT_CONTEXT_ACCEPTED_GENERATION_SCHEMA,
    kind: 'project_context_accepted_generation',
    status: 'accepted',
    accepted_at: review.reviewed_at,
    project_binding_ref: clone(candidate.project_binding_ref),
    accepted_generation_ref: clone(candidate.generation_proposal.current_generation_ref),
    prior_generation_ref: clone(candidate.generation_proposal.prior_generation_ref),
    cas_fingerprint_sha256: candidate.generation_proposal.cas_fingerprint_sha256,
    candidate_digest_sha256: candidate.review_content_digest_sha256,
    accepted_input_set_digest_sha256: candidate.accepted_input_set_candidate.digest_sha256,
    submission_digest_sha256: sha256Canonical({
      domain: 'soulforge.project_context_acceptance_submission.v1',
      submission: safe,
    }),
    producer_refs: clone(candidate.producer_refs),
    reviewer_receipt: {
      reviewer_ref: clone(review.reviewer_ref),
      reviewer_epoch_ref: clone(review.reviewer_epoch_ref),
      reviewer_epoch: review.reviewer_epoch,
      verdict: review.verdict,
      reviewed_candidate_digest: review.reviewed_candidate_digest,
      reviewed_membership_refs: clone(review.reviewed_membership_refs),
      decision_ref: clone(review.decision_ref),
      reviewed_at: review.reviewed_at,
    },
    writer_witness: {
      hpp_writer_ref: clone(writerWitness.hpp_writer_ref),
      writer_epoch_ref: clone(writerWitness.writer_epoch_ref),
      writer_epoch: writerWitness.writer_epoch,
      witnessed_at: writerWitness.witnessed_at,
    },
    project_context: acceptedProjectContext,
    bitemporal_cutoff: clone(candidate.bitemporal_cutoff),
    coverage_gap_receipt: clone(candidate.coverage_gap_receipt),
    claim_ceiling: 'observed',
    manifest_digest_sha256: '',
    authority: authority(),
    effects: effects(),
  };

  const material = Object.assign({}, manifest);
  delete material.manifest_digest_sha256;
  manifest.manifest_digest_sha256 = sha256Canonical(material);

  const receipt = {
    schema_version: PROJECT_CONTEXT_ACCEPTED_GENERATION_RECEIPT_SCHEMA,
    kind: 'project_context_accepted_generation_receipt',
    status: 'accepted',
    accepted_generation_ref: clone(manifest.accepted_generation_ref),
    prior_generation_ref: clone(manifest.prior_generation_ref),
    manifest_digest_sha256: manifest.manifest_digest_sha256,
    receipt_digest_sha256: '',
    blocker_codes: [],
    claim_ceiling: 'observed',
  };

  const receiptMaterial = Object.assign({}, receipt);
  delete receiptMaterial.receipt_digest_sha256;
  receipt.receipt_digest_sha256 = sha256Canonical(receiptMaterial);

  return freeze({
    status: 'ACCEPTED',
    accepted_generation_ref: clone(manifest.accepted_generation_ref),
    manifest: freeze(manifest),
    receipt: freeze(receipt),
    manifest_digest_sha256: manifest.manifest_digest_sha256,
    receipt_digest_sha256: receipt.receipt_digest_sha256,
    claim_ceiling: 'observed',
    blocker_codes: [],
  });
}

export function verifyAcceptedGenerationManifest(manifest, expectedDigest) {
  const safe = snapshot(manifest);
  if (!safe || !keys(safe, MANIFEST_FIELDS) || safe.schema_version !== PROJECT_CONTEXT_ACCEPTED_GENERATION_SCHEMA
      || safe.kind !== 'project_context_accepted_generation' || safe.status !== 'accepted' || !instant(safe.accepted_at)
      || !ref(safe.project_binding_ref) || !ref(safe.accepted_generation_ref) || !ref(safe.prior_generation_ref)
      || !hash(safe.cas_fingerprint_sha256) || !hash(safe.candidate_digest_sha256)
      || !hash(safe.accepted_input_set_digest_sha256) || !hash(safe.submission_digest_sha256)
      || !hash(safe.manifest_digest_sha256) || safe.claim_ceiling !== 'observed'
      || !keys(safe.producer_refs, ['p4_result_ref', 'p4_candidate_sha256', 'm2_assessment_ref', 'm2_assessment_sha256', 'timeline_projection_ref', 'timeline_projection_sha256'])
      || !ref(safe.producer_refs.p4_result_ref) || safe.producer_refs.p4_result_ref.content_id !== safe.producer_refs.p4_candidate_sha256
      || !ref(safe.producer_refs.m2_assessment_ref) || safe.producer_refs.m2_assessment_ref.content_id !== safe.producer_refs.m2_assessment_sha256
      || !ref(safe.producer_refs.timeline_projection_ref) || safe.producer_refs.timeline_projection_ref.content_id !== safe.producer_refs.timeline_projection_sha256
      || !keys(safe.reviewer_receipt, ['reviewer_ref', 'reviewer_epoch_ref', 'reviewer_epoch', 'verdict', 'reviewed_candidate_digest', 'reviewed_membership_refs', 'decision_ref', 'reviewed_at'])
      || !ref(safe.reviewer_receipt.reviewer_ref) || !ref(safe.reviewer_receipt.reviewer_epoch_ref)
      || !Number.isSafeInteger(safe.reviewer_receipt.reviewer_epoch) || safe.reviewer_receipt.reviewer_epoch < 1
      || safe.reviewer_receipt.verdict !== 'approved' || safe.reviewer_receipt.reviewed_candidate_digest !== safe.candidate_digest_sha256 || !Array.isArray(safe.reviewer_receipt.reviewed_membership_refs)
      || !ref(safe.reviewer_receipt.decision_ref) || !instant(safe.reviewer_receipt.reviewed_at)
      || !keys(safe.writer_witness, ['hpp_writer_ref', 'writer_epoch_ref', 'writer_epoch', 'witnessed_at'])
      || !ref(safe.writer_witness.hpp_writer_ref) || !ref(safe.writer_witness.writer_epoch_ref)
      || !Number.isSafeInteger(safe.writer_witness.writer_epoch) || safe.writer_witness.writer_epoch < 1 || !instant(safe.writer_witness.witnessed_at)
      || !keys(safe.project_context, ['project_context_ref', 'memberships', 'exported_source_revision_set_digest_sha256', 'exported_membership_digest_sha256', 'owner_contract_input_digests'])
      || !token(safe.project_context.project_context_ref) || !Array.isArray(safe.project_context.memberships)
      || !hash(safe.project_context.exported_source_revision_set_digest_sha256) || !hash(safe.project_context.exported_membership_digest_sha256)
      || !keys(safe.project_context.owner_contract_input_digests, ['source_rows_sha256', 'membership_rows_sha256'])
      || !hash(safe.project_context.owner_contract_input_digests.source_rows_sha256) || !hash(safe.project_context.owner_contract_input_digests.membership_rows_sha256)
      || !keys(safe.bitemporal_cutoff, ['valid_at', 'known_at']) || !instant(safe.bitemporal_cutoff.valid_at)
      || !instant(safe.bitemporal_cutoff.known_at) || epoch(safe.bitemporal_cutoff.valid_at) > epoch(safe.bitemporal_cutoff.known_at)
      || epoch(safe.reviewer_receipt.reviewed_at) < epoch(safe.bitemporal_cutoff.known_at)
      || epoch(safe.writer_witness.witnessed_at) < epoch(safe.reviewer_receipt.reviewed_at)
      || !keys(safe.coverage_gap_receipt, ['review_content_digest_sha256', 'exported_source_revision_set_digest_sha256', 'coverage_complete', 'unresolved_gap_codes'])
      || safe.coverage_gap_receipt.coverage_complete !== true || !Array.isArray(safe.coverage_gap_receipt.unresolved_gap_codes) || safe.coverage_gap_receipt.unresolved_gap_codes.length !== 0
      || safe.coverage_gap_receipt.review_content_digest_sha256 !== safe.candidate_digest_sha256
      || safe.coverage_gap_receipt.exported_source_revision_set_digest_sha256 !== safe.project_context.exported_source_revision_set_digest_sha256
      || !keys(safe.authority, ['accepted', 'acceptance_allowed', 'generation_advanced', 'source_truth_accepted', 'writer_called'])
      || safe.authority.accepted !== false || safe.authority.acceptance_allowed !== false
      || safe.authority.generation_advanced !== false || safe.authority.source_truth_accepted !== false || safe.authority.writer_called !== false
      || !keys(safe.effects, ['persistent_writes', 'model_calls', 'network_calls', 'erp_writes', 'taskdriver_activations', 'writer_calls', 'legacy_csv_writer_calls'])
      || Object.values(safe.effects).some(function (value) { return value !== 0; })) return false;
  if (computeProjectContextExportedMembershipDigest(safe.project_context.memberships) !== safe.project_context.exported_membership_digest_sha256
      || computeProjectContextExportedSourceRevisionSetDigest(safe.project_context.memberships) !== safe.project_context.exported_source_revision_set_digest_sha256) return false;
  const mat = Object.assign({}, safe);
  delete mat.manifest_digest_sha256;
  const computed = sha256Canonical(mat);
  if (computed !== safe.manifest_digest_sha256) return false;
  if (expectedDigest && computed !== expectedDigest) return false;
  return true;
}

export function createInMemoryAcceptedContextGenerationStore(binding) {
  const safeBinding = snapshot(binding);
  if (!safeBinding || !keys(safeBinding, STORE_BINDING_FIELDS)
      || !ref(safeBinding.project_ref) || !token(safeBinding.project_context_ref)
      || !ref(safeBinding.initial_generation_ref) || !hash(safeBinding.initial_cas_fingerprint)
      || !Number.isSafeInteger(safeBinding.initial_epoch) || safeBinding.initial_epoch < 0
      || !Number.isSafeInteger(safeBinding.initial_generation_number) || safeBinding.initial_generation_number < 0
      || !reviewerAnchor(safeBinding.reviewer_anchor) || !writerAnchor(safeBinding.writer_anchor)) {
    throw new Error('Invalid store binding');
  }

  const boundProjectRef = clone(safeBinding.project_ref);
  const boundProjectContextRef = safeBinding.project_context_ref;
  const boundReviewerAnchor = reviewerAnchor(safeBinding.reviewer_anchor);
  const boundWriterAnchor = writerAnchor(safeBinding.writer_anchor);
  let currentGenerationRef = clone(safeBinding.initial_generation_ref);
  let currentCasFingerprint = safeBinding.initial_cas_fingerprint;
  let currentWriterEpoch = safeBinding.initial_epoch;
  let generationNumber = safeBinding.initial_generation_number;

  const generations = new Map();
  const receipts = new Map();
  const acceptedBySubmissionDigest = new Map();

  return {
    getProjectRef() {
      return clone(boundProjectRef);
    },
    getProjectContextRef() {
      return boundProjectContextRef;
    },
    getCurrentPointer() {
      return freeze({
        project_ref: clone(boundProjectRef),
        project_context_ref: boundProjectContextRef,
        generation_ref: clone(currentGenerationRef),
        cas_fingerprint: currentCasFingerprint,
        writer_epoch: currentWriterEpoch,
        generation_number: generationNumber,
        reviewer_anchor: clone(boundReviewerAnchor),
        writer_anchor: clone(boundWriterAnchor),
      });
    },
    hasGeneration(targetRef) {
      const key = exactRefIdentityKey(targetRef);
      return key !== null && generations.has(key);
    },
    getGeneration(targetRef) {
      const key = exactRefIdentityKey(targetRef);
      return key !== null && generations.has(key) ? freeze(clone(generations.get(key))) : null;
    },
    getReceipt(targetRef) {
      const key = exactRefIdentityKey(targetRef);
      return key !== null && receipts.has(key) ? freeze(clone(receipts.get(key))) : null;
    },
    listGenerations() {
      return Array.from(generations.values()).map(function (g) { return clone(g.accepted_generation_ref); });
    },
    acceptCandidate(submission) {
      const safe = snapshot(submission);
      let submissionDigest = null;
      try {
        if (safe && keys(safe, SUBMISSION_FIELDS) && safe.schema_version === PROJECT_CONTEXT_ACCEPTANCE_SUBMISSION_SCHEMA) {
          submissionDigest = sha256Canonical({
            domain: 'soulforge.project_context_acceptance_submission.v1',
            submission: safe,
          });
        }
      } catch { submissionDigest = null; }
      if (submissionDigest && acceptedBySubmissionDigest.has(submissionDigest)) {
        const existing = acceptedBySubmissionDigest.get(submissionDigest);
        return freeze({
          status: 'ACCEPTED',
          accepted_generation_ref: clone(existing.manifest.accepted_generation_ref),
          manifest: freeze(clone(existing.manifest)),
          receipt: freeze(clone(existing.receipt)),
          manifest_digest_sha256: existing.manifest.manifest_digest_sha256,
          receipt_digest_sha256: existing.receipt.receipt_digest_sha256,
          prior_pointer: clone(existing.manifest.prior_generation_ref),
          current_pointer: this.getCurrentPointer(),
          claim_ceiling: 'observed',
          idempotent_replay: true,
          execution_evidence: { writer_witness_verified: true, in_memory_pointer_advanced: false, synthetic_store_write: false },
          blocker_codes: [],
        });
      }

      const pointer = this.getCurrentPointer();
      const evalResult = evaluateProjectContextAcceptance(pointer, submission);
      if (evalResult.status !== 'ACCEPTED') {
        return evalResult;
      }

      const manifest = evalResult.manifest;
      const receipt = evalResult.receipt;
      const genKey = exactRefIdentityKey(manifest.accepted_generation_ref);
      const priorPointer = currentGenerationRef ? clone(currentGenerationRef) : null;

      if (!genKey || generations.has(genKey)) {
        const blockers = [C.GENERATION_ALREADY_EXISTS, C.STORE_CONFLICT_HOLD].sort(compareCodePoints);
        return freeze({
          status: 'HOLD',
          blocker_codes: blockers,
          receipt: freeze({
            schema_version: PROJECT_CONTEXT_ACCEPTED_GENERATION_RECEIPT_SCHEMA,
            kind: 'project_context_accepted_generation_receipt',
            status: 'HOLD',
            accepted_generation_ref: clone(manifest.accepted_generation_ref),
            prior_generation_ref: clone(manifest.prior_generation_ref),
            manifest_digest_sha256: null,
            receipt_digest_sha256: null,
            blocker_codes: blockers,
            claim_ceiling: 'observed',
          }),
        });
      }

      const storedManifest = freeze(clone(manifest));
      const storedReceipt = freeze(clone(receipt));
      generations.set(genKey, storedManifest);
      receipts.set(genKey, storedReceipt);
      acceptedBySubmissionDigest.set(manifest.submission_digest_sha256, { manifest: storedManifest, receipt: storedReceipt });

      currentGenerationRef = clone(manifest.accepted_generation_ref);
      currentCasFingerprint = manifest.cas_fingerprint_sha256;
      currentWriterEpoch = manifest.writer_witness.writer_epoch;
      generationNumber += 1;

      return freeze({
        status: 'ACCEPTED',
        accepted_generation_ref: clone(manifest.accepted_generation_ref),
        manifest: freeze(clone(storedManifest)),
        receipt: freeze(clone(storedReceipt)),
        manifest_digest_sha256: manifest.manifest_digest_sha256,
        receipt_digest_sha256: receipt.receipt_digest_sha256,
        prior_pointer: priorPointer,
        current_pointer: this.getCurrentPointer(),
        claim_ceiling: 'observed',
        idempotent_replay: false,
        execution_evidence: { writer_witness_verified: true, in_memory_pointer_advanced: true, synthetic_store_write: true },
        blocker_codes: [],
      });
    },
  };
}

// P5 pre-acceptance context candidate builder.
//
// This Module is deliberately a pure, metadata-only seam. It assembles a
// deterministic candidate for a registered human to review; it neither accepts
// a context nor advances a generation or invokes a project-context writer.

import { createHash } from 'node:crypto';
import { types } from 'node:util';

import { canonicalise, compareCodePoints, inspectInstant } from './canonical.mjs';
import { exactRefIdentityKey, sameExactRef } from './identity.mjs';

export const PROJECT_CONTEXT_GENERATION_CANDIDATE_REQUEST_SCHEMA =
  'soulforge.project_context_generation_candidate_request.v0';
export const PROJECT_CONTEXT_GENERATION_CANDIDATE_SCHEMA =
  'soulforge.project_context_generation_candidate.v0';
export const PROJECT_CONTEXT_GENERATION_CANDIDATE_RECEIPT_SCHEMA =
  'soulforge.project_context_generation_candidate_receipt.v0';

export const PROJECT_CONTEXT_GENERATION_CANDIDATE_CODES = Object.freeze({
  INPUT_INVALID: 'P5_CONTEXT_INPUT_INVALID',
  P4_INVALID: 'P5_CONTEXT_P4_INVALID',
  P4_PROJECT_MISMATCH: 'P5_CONTEXT_P4_PROJECT_MISMATCH',
  P4_SOURCE_SET_MISMATCH: 'P5_CONTEXT_P4_SOURCE_SET_MISMATCH',
  M2_INVALID: 'P5_CONTEXT_M2_INVALID',
  M2_PROJECT_MISMATCH: 'P5_CONTEXT_M2_PROJECT_MISMATCH',
  TIMELINE_INVALID: 'P5_CONTEXT_TIMELINE_INVALID',
  TIMELINE_DIGEST_MISMATCH: 'P5_CONTEXT_TIMELINE_DIGEST_MISMATCH',
  TIMELINE_PROJECT_MISMATCH: 'P5_CONTEXT_TIMELINE_PROJECT_MISMATCH',
  CROSSWALK_INVALID: 'P5_CONTEXT_CROSSWALK_INVALID',
  CROSSWALK_MISMATCH: 'P5_CONTEXT_CROSSWALK_MISMATCH',
  MEMBERSHIP_INVALID: 'P5_CONTEXT_MEMBERSHIP_INVALID',
  MEMBERSHIP_DUPLICATE: 'P5_CONTEXT_MEMBERSHIP_DUPLICATE',
  MEMBERSHIP_FOREIGN: 'P5_CONTEXT_MEMBERSHIP_FOREIGN',
  MEMBERSHIP_UNCLASSIFIED: 'P5_CONTEXT_MEMBERSHIP_UNCLASSIFIED',
  MEMBERSHIP_HELD_CONFLICT: 'P5_CONTEXT_MEMBERSHIP_HELD_CONFLICT',
  BITEMPORAL_INVALID: 'P5_CONTEXT_BITEMPORAL_INVALID',
  BITEMPORAL_STALE: 'P5_CONTEXT_BITEMPORAL_STALE',
  COVERAGE_INVALID: 'P5_CONTEXT_COVERAGE_INVALID',
  COVERAGE_LANE_MISSING: 'P5_CONTEXT_COVERAGE_LANE_MISSING',
  COVERAGE_SILENT_OMISSION: 'P5_CONTEXT_COVERAGE_SILENT_OMISSION',
  M2_SOURCE_MEMBERSHIP_UNPROVEN: 'P5_CONTEXT_M2_SOURCE_MEMBERSHIP_UNPROVEN',
  M2_SOURCE_TRUTH_UNPROVEN: 'P5_CONTEXT_M2_SOURCE_TRUTH_UNPROVEN',
  M2_FRESHNESS_UNPROVEN: 'P5_CONTEXT_M2_FRESHNESS_UNPROVEN',
  M2_TERMINAL_PROVENANCE_UNPROVEN: 'P5_CONTEXT_M2_TERMINAL_PROVENANCE_UNPROVEN',
  REVIEW_INVALID: 'P5_CONTEXT_REVIEW_INVALID',
  REVIEW_REQUIRED_UNDECLARED: 'P5_CONTEXT_REVIEW_REQUIRED_UNDECLARED',
  REVIEW_REJECTED: 'P5_CONTEXT_REVIEW_REJECTED',
  WRITER_INVALID: 'P5_CONTEXT_WRITER_INVALID',
  WRITER_UNBOUND: 'P5_CONTEXT_WRITER_UNBOUND',
  LINEAGE_INVALID: 'P5_CONTEXT_LINEAGE_INVALID',
  LINEAGE_SUPERSESSION_INVALID: 'P5_CONTEXT_LINEAGE_SUPERSESSION_INVALID',
  CAS_MISMATCH: 'P5_CONTEXT_CAS_MISMATCH',
});

const C = PROJECT_CONTEXT_GENERATION_CANDIDATE_CODES;
const SHA256_REF = /^sha256:[0-9a-f]{64}$/u;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const SOURCE_LANES = Object.freeze([
  'mail', 'slack', 'voice', 'structured_pc_work', 'team_files', 'run_logs',
]);
const MEMBERSHIP_LANES = new Set([...SOURCE_LANES, 'knowledge', 'common']);
const P4_GAPS = Object.freeze([
  'bitemporal_stamps',
  'coverage_and_gap',
  'unresolved_supersession',
  'reviewer_state',
  'writer_epoch',
]);
const PROVENANCE_CLAIMS = Object.freeze([
  'source_content_membership',
  'source_truth',
  'freshness',
  'terminal_provenance',
]);
const PROVENANCE_BLOCKERS = Object.freeze({
  source_content_membership: C.M2_SOURCE_MEMBERSHIP_UNPROVEN,
  source_truth: C.M2_SOURCE_TRUTH_UNPROVEN,
  freshness: C.M2_FRESHNESS_UNPROVEN,
  terminal_provenance: C.M2_TERMINAL_PROVENANCE_UNPROVEN,
});
const FORBIDDEN_KEYS = /(?:^|_)(?:body|payload|raw|text|query|explanation|private_path|absolute_path|source_path|secret|credential|password|cookie|token)(?:_|$)/u;
const SECRET_PATTERN = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const MAX = Object.freeze({ depth: 32, values: 50000, array: 4096, keys: 48, string: 4096 });

const ROOT_FIELDS = Object.freeze([
  'schema_version', 'p4', 'm2', 'timeline', 'project_crosswalk',
  'source_revision_set', 'memberships', 'coverage', 'reviews', 'writer', 'lineage',
]);
const P4_FIELDS = Object.freeze([
  'schema_version', 'p4_candidate_ref', 'p4_candidate_sha256', 'status', 'feature_state',
  'project_binding_ref', 'source_revision_set', 'source_revision_set_sha256',
  'acceptance_allowed', 'accepted_generation_created', 'missing_acceptance_requirements',
  'valid_at', 'known_at',
]);
const P4_SOURCE_FIELDS = Object.freeze([
  'source_revision_receipt_sha256', 'document_revision_ref',
]);
const M2_FIELDS = Object.freeze([
  'schema_version', 'assessment_ref', 'assessment_digest_sha256', 'project_binding_ref',
  'status', 'claim_ceiling', 'source_content_membership_verified',
  'source_truth_validated', 'freshness_validated', 'terminal_provenance_validated',
  'provenance_evidence', 'valid_at', 'known_at',
]);
const M2_EVIDENCE_FIELDS = Object.freeze([
  'claim', 'evidence_ref', 'source_revision_ref', 'state', 'valid_at', 'known_at',
]);
const TIMELINE_FIELDS = Object.freeze([
  'schema_version', 'timeline_projection_ref', 'timeline_projection_digest_sha256',
  'projection_generation_id', 'project_ref', 'ordered_entry_digest_sha256', 'entries',
  'valid_at', 'known_at',
]);
const TIMELINE_ENTRY_FIELDS = Object.freeze([
  'entry_ref', 'source_lane', 'source_revision_ref', 'source_span_ref',
  'context_event_ref', 'context_unit_ref', 'context_branch_ref', 'project_context_ref',
  'correction_state', 'valid_at', 'known_at',
]);
const CROSSWALK_FIELDS = Object.freeze([
  'schema_version', 'crosswalk_ref', 'crosswalk_digest_sha256', 'p4_project_binding_ref',
  'm2_project_binding_ref', 'timeline_project_ref', 'project_context_ref', 'p4_source_revision_set_sha256',
  'timeline_projection_digest_sha256', 'timeline_ordered_entry_digest_sha256', 'valid_at', 'known_at',
]);
const SOURCE_REVISION_BASE_FIELDS = Object.freeze([
  'scope', 'source_revision_ref', 'source_revision_receipt_sha256', 'inclusion_state',
  'correction_state', 'valid_at', 'known_at',
]);
const MEMBERSHIP_BASE_FIELDS = Object.freeze([
  'source_span_ref', 'source_revision_ref', 'source_lane', 'evidence_ref', 'context_event_ref',
  'context_unit_ref', 'context_branch_ref', 'project_context_ref', 'correction_state',
  'review_requirement', 'valid_at', 'known_at',
]);
const COVERAGE_FIELDS = Object.freeze(['schema_version', 'source_lanes']);
const COVERAGE_LANE_FIELDS = Object.freeze(['source_lane', 'state', 'valid_at', 'known_at']);
const REVIEW_BASE_FIELDS = Object.freeze(['proposal_ref', 'reviewer_state', 'valid_at', 'known_at']);
const WRITER_FIELDS = Object.freeze([
  'schema_version', 'hpp_writer_ref', 'sole_writer', 'writer_epoch_ref', 'writer_epoch',
  'project_binding_ref', 'status', 'valid_at', 'known_at',
]);
const LINEAGE_FIELDS = Object.freeze([
  'schema_version', 'prior_generation', 'current_generation',
  'observed_prior_cas_fingerprint_sha256', 'generation_cutoff',
]);
const PRIOR_GENERATION_FIELDS = Object.freeze([
  'generation', 'generation_ref', 'accepted_input_set_digest_sha256',
  'cas_fingerprint_sha256', 'supersession_state', 'valid_at', 'known_at',
]);
const CURRENT_GENERATION_FIELDS = Object.freeze([
  'generation', 'generation_ref', 'supersedes_generation_ref', 'valid_at', 'known_at',
]);
const CUTOFF_FIELDS = Object.freeze(['valid_at', 'known_at']);

function sha256Ref(domain, value) {
  return `sha256:${createHash('sha256').update(`${domain}\0${canonicalise(value, arrayRules(value))}`, 'utf8').digest('hex')}`;
}

function arrayRules(value, path = '', rules = {}) {
  if (Array.isArray(value)) {
    rules[path] = 'insertion_ordered';
    for (const child of value) arrayRules(child, `${path}[]`, rules);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      arrayRules(child, path ? `${path}.${key}` : key, rules);
    }
  }
  return rules;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function cloneRef(ref) {
  return {
    entity_id: ref.entity_id,
    revision_id: ref.revision_id,
    content_id: ref.content_id,
    content_hash_alg: ref.content_hash_alg,
  };
}

function compareRef(left, right) {
  return compareCodePoints(exactRefIdentityKey(left), exactRefIdentityKey(right));
}

function uniqueSorted(values, key) {
  return [...values].sort((left, right) => compareCodePoints(key(left), key(right)));
}

function hasPredecessorCycle(predecessorByCurrent) {
  for (const start of predecessorByCurrent.keys()) {
    const visited = new Set();
    let current = start;
    while (predecessorByCurrent.has(current)) {
      if (visited.has(current)) return true;
      visited.add(current);
      current = predecessorByCurrent.get(current);
    }
  }
  return false;
}

function isHash(value) {
  return typeof value === 'string' && SHA256_REF.test(value);
}

function isSafeToken(value) {
  return typeof value === 'string'
    && SAFE_TOKEN.test(value)
    && value.normalize('NFC') === value
    && !/^[A-Za-z]:/u.test(value)
    && !SECRET_PATTERN.test(value);
}

function exactKeys(value, expected) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length
    && expected.every((key) => Object.hasOwn(value, key));
}

function readExactRef(value) {
  if (!exactKeys(value, ['entity_id', 'revision_id', 'content_id', 'content_hash_alg'])) return null;
  if (!isSafeToken(value.entity_id) || !isSafeToken(value.revision_id)
      || !isHash(value.content_id) || value.content_hash_alg !== 'sha256') return null;
  return exactRefIdentityKey(value) === null ? null : cloneRef(value);
}

function validInstant(value) {
  return inspectInstant(value).valid;
}

function hasBitemporalCutoffs(validAt, knownAt) {
  // They remain separate query axes, but this asserted context record cannot
  // claim knowledge before it says the fact was valid.
  return validInstant(validAt) && validInstant(knownAt)
    && compareCodePoints(validAt, knownAt) <= 0;
}

function snapshotPlainData(root) {
  const seen = new WeakSet();
  let values = 0;

  const walk = (value, depth) => {
    values += 1;
    if (values > MAX.values || depth > MAX.depth) throw new Error('unsafe');
    if (typeof value === 'string') {
      if (value.length === 0 || value.length > MAX.string || value.normalize('NFC') !== value
          || /[\u0000-\u001f\u007f]/u.test(value) || SECRET_PATTERN.test(value)
          || /[\\/]/u.test(value)) throw new Error('unsafe');
      return value;
    }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    if (value === null || typeof value !== 'object' || types.isProxy(value) || seen.has(value)) {
      throw new Error('unsafe');
    }
    seen.add(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX.array) throw new Error('unsafe');
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const ownKeys = Reflect.ownKeys(descriptors);
      if (ownKeys.some((key) => typeof key !== 'string') || ownKeys.length !== value.length + 1) {
        throw new Error('unsafe');
      }
      const lengthDescriptor = descriptors.length;
      if (lengthDescriptor === undefined || !Object.hasOwn(lengthDescriptor, 'value')
          || lengthDescriptor.value !== value.length || lengthDescriptor.enumerable !== false) {
        throw new Error('unsafe');
      }
      const output = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')
            || descriptor.enumerable !== true) throw new Error('unsafe');
        output.push(walk(descriptor.value, depth + 1));
      }
      return output;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error('unsafe');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.length > MAX.keys || ownKeys.some((key) => typeof key !== 'string')) throw new Error('unsafe');
    const output = {};
    for (const key of ownKeys.sort(compareCodePoints)) {
      const descriptor = descriptors[key];
      if (FORBIDDEN_KEYS.test(key) || descriptor === undefined || !Object.hasOwn(descriptor, 'value')
          || descriptor.enumerable !== true) throw new Error('unsafe');
      output[key] = walk(descriptor.value, depth + 1);
    }
    return output;
  };

  try {
    return walk(root, 0);
  } catch {
    return null;
  }
}

function parseP4(value, blockers) {
  if (!exactKeys(value, P4_FIELDS)
      || value.schema_version !== 'soulforge.project_pdf_p5_input_candidate.v0'
      || !readExactRef(value.p4_candidate_ref) || !isHash(value.p4_candidate_sha256)
      || value.p4_candidate_ref.content_id !== value.p4_candidate_sha256
      || value.status !== 'candidate_not_accepted' || value.feature_state !== 'off'
      || !readExactRef(value.project_binding_ref) || !Array.isArray(value.source_revision_set)
      || value.source_revision_set.length === 0 || !isHash(value.source_revision_set_sha256)
      || value.acceptance_allowed !== false || value.accepted_generation_created !== false
      || !Array.isArray(value.missing_acceptance_requirements)
      || value.missing_acceptance_requirements.length !== P4_GAPS.length
      || value.missing_acceptance_requirements.some((gap, index) => gap !== P4_GAPS[index])) {
    blockers.add(C.P4_INVALID);
    return null;
  }
  const sourceSet = [];
  for (const entry of value.source_revision_set) {
    if (!exactKeys(entry, P4_SOURCE_FIELDS) || !isHash(entry.source_revision_receipt_sha256)
        || !readExactRef(entry.document_revision_ref)) {
      blockers.add(C.P4_INVALID);
      return null;
    }
    sourceSet.push({
      source_revision_receipt_sha256: entry.source_revision_receipt_sha256,
      document_revision_ref: cloneRef(entry.document_revision_ref),
    });
  }
  const recomputed = sha256Ref('soulforge.project_pdf_knowledge.p5_input.v0', sourceSet);
  if (recomputed !== value.source_revision_set_sha256) {
    blockers.add(C.P4_INVALID);
    return null;
  }
  return {
    candidateRef: cloneRef(value.p4_candidate_ref),
    candidateDigest: value.p4_candidate_sha256,
    projectBindingRef: cloneRef(value.project_binding_ref),
    sourceSet,
    sourceSetDigest: value.source_revision_set_sha256,
    validAt: value.valid_at,
    knownAt: value.known_at,
  };
}

function parseM2(value, blockers) {
  if (!exactKeys(value, M2_FIELDS)
      || value.schema_version !== 'soulforge.project_context_generation_m2_witness.v0'
      || !readExactRef(value.assessment_ref) || !isHash(value.assessment_digest_sha256)
      || value.assessment_ref.content_id !== value.assessment_digest_sha256
      || !readExactRef(value.project_binding_ref) || value.status !== 'assessed'
      || value.claim_ceiling !== 'observed'
      || value.source_content_membership_verified !== false
      || value.source_truth_validated !== false
      || value.freshness_validated !== false
      || value.terminal_provenance_validated !== false
      || PROVENANCE_CLAIMS.some((claim) => typeof value[`${claim === 'source_content_membership'
        ? 'source_content_membership_verified'
        : claim === 'source_truth' ? 'source_truth_validated'
          : claim === 'freshness' ? 'freshness_validated' : 'terminal_provenance_validated'}`] !== 'boolean')
      || !Array.isArray(value.provenance_evidence)) {
    blockers.add(C.M2_INVALID);
    return null;
  }
  const evidence = [];
  const seen = new Set();
  for (const entry of value.provenance_evidence) {
    if (!exactKeys(entry, M2_EVIDENCE_FIELDS) || !PROVENANCE_CLAIMS.includes(entry.claim)
        || !readExactRef(entry.evidence_ref) || !readExactRef(entry.source_revision_ref)
        || entry.state !== 'satisfied' || seen.has(entry.claim)) {
      blockers.add(C.M2_INVALID);
      return null;
    }
    seen.add(entry.claim);
    evidence.push({
      claim: entry.claim,
      evidenceRef: cloneRef(entry.evidence_ref),
      sourceRevisionRef: cloneRef(entry.source_revision_ref),
      state: entry.state,
      validAt: entry.valid_at,
      knownAt: entry.known_at,
    });
  }
  return {
    assessmentRef: cloneRef(value.assessment_ref),
    assessmentDigest: value.assessment_digest_sha256,
    projectBindingRef: cloneRef(value.project_binding_ref),
    observed: {
      source_content_membership: value.source_content_membership_verified,
      source_truth: value.source_truth_validated,
      freshness: value.freshness_validated,
      terminal_provenance: value.terminal_provenance_validated,
    },
    evidence: uniqueSorted(evidence, (entry) => entry.claim),
    validAt: value.valid_at,
    knownAt: value.known_at,
  };
}

function timelineEntryDigestMaterial(entry) {
  return {
    entry_ref: entry.entryRef,
    source_lane: entry.sourceLane,
    source_revision_ref: entry.sourceRevisionRef,
    source_span_ref: entry.sourceSpanRef,
    context_event_ref: entry.contextEventRef,
    context_unit_ref: entry.contextUnitRef,
    context_branch_ref: entry.contextBranchRef,
    project_context_ref: entry.projectContextRef,
    correction_state: entry.correctionState,
    valid_at: entry.validAt,
    known_at: entry.knownAt,
  };
}

function parseTimeline(value, blockers) {
  if (!exactKeys(value, TIMELINE_FIELDS)
      || value.schema_version !== 'soulforge.project_context_generation_timeline_input.v0'
      || !readExactRef(value.timeline_projection_ref)
      || !isHash(value.timeline_projection_digest_sha256)
      || value.timeline_projection_ref.content_id !== value.timeline_projection_digest_sha256
      || !isSafeToken(value.projection_generation_id) || !isSafeToken(value.project_ref)
      || !isHash(value.ordered_entry_digest_sha256) || !Array.isArray(value.entries)) {
    blockers.add(C.TIMELINE_INVALID);
    return null;
  }
  const entries = [];
  const seen = new Set();
  for (const entry of value.entries) {
    if (!exactKeys(entry, TIMELINE_ENTRY_FIELDS) || !isSafeToken(entry.entry_ref)
        || !SOURCE_LANES.includes(entry.source_lane) || !readExactRef(entry.source_revision_ref)
        || !isSafeToken(entry.source_span_ref) || !isSafeToken(entry.context_event_ref)
        || !isSafeToken(entry.context_unit_ref) || !isSafeToken(entry.context_branch_ref)
        || !isSafeToken(entry.project_context_ref)
        || !['original', 'corrected'].includes(entry.correction_state)
        || seen.has(entry.entry_ref)) {
      blockers.add(seen.has(entry.entry_ref) ? C.MEMBERSHIP_DUPLICATE : C.TIMELINE_INVALID);
      return null;
    }
    seen.add(entry.entry_ref);
    entries.push({
      entryRef: entry.entry_ref,
      sourceLane: entry.source_lane,
      sourceRevisionRef: cloneRef(entry.source_revision_ref),
      sourceSpanRef: entry.source_span_ref,
      contextEventRef: entry.context_event_ref,
      contextUnitRef: entry.context_unit_ref,
      contextBranchRef: entry.context_branch_ref,
      projectContextRef: entry.project_context_ref,
      correctionState: entry.correction_state,
      validAt: entry.valid_at,
      knownAt: entry.known_at,
    });
  }
  const orderedEntryDigest = sha256Ref(
    'soulforge.project_context_generation.timeline_entries.v0',
    entries.map(timelineEntryDigestMaterial),
  );
  if (orderedEntryDigest !== value.ordered_entry_digest_sha256) {
    blockers.add(C.TIMELINE_DIGEST_MISMATCH);
  }
  return {
    projectionRef: cloneRef(value.timeline_projection_ref),
    projectionDigest: value.timeline_projection_digest_sha256,
    generationId: value.projection_generation_id,
    projectRef: value.project_ref,
    orderedEntryDigest: value.ordered_entry_digest_sha256,
    entries,
    validAt: value.valid_at,
    knownAt: value.known_at,
  };
}

function parseCrosswalk(value, blockers) {
  if (!exactKeys(value, CROSSWALK_FIELDS)
      || value.schema_version !== 'soulforge.project_context_generation_crosswalk.v0'
      || !readExactRef(value.crosswalk_ref) || !isHash(value.crosswalk_digest_sha256)
      || !readExactRef(value.p4_project_binding_ref) || !readExactRef(value.m2_project_binding_ref)
      || !isSafeToken(value.timeline_project_ref) || !isSafeToken(value.project_context_ref)
      || !isHash(value.p4_source_revision_set_sha256)
      || !isHash(value.timeline_projection_digest_sha256)
      || !isHash(value.timeline_ordered_entry_digest_sha256)) {
    blockers.add(C.CROSSWALK_INVALID);
    return null;
  }
  const material = {
    p4_project_binding_ref: value.p4_project_binding_ref,
    m2_project_binding_ref: value.m2_project_binding_ref,
    timeline_project_ref: value.timeline_project_ref,
    project_context_ref: value.project_context_ref,
    p4_source_revision_set_sha256: value.p4_source_revision_set_sha256,
    timeline_projection_digest_sha256: value.timeline_projection_digest_sha256,
    timeline_ordered_entry_digest_sha256: value.timeline_ordered_entry_digest_sha256,
    valid_at: value.valid_at,
    known_at: value.known_at,
  };
  const digest = sha256Ref('soulforge.project_context_generation.crosswalk.v0', material);
  if (digest !== value.crosswalk_digest_sha256 || value.crosswalk_ref.content_id !== digest) {
    blockers.add(C.CROSSWALK_INVALID);
    return null;
  }
  return {
    crosswalkRef: cloneRef(value.crosswalk_ref),
    digest,
    p4ProjectBindingRef: cloneRef(value.p4_project_binding_ref),
    m2ProjectBindingRef: cloneRef(value.m2_project_binding_ref),
    timelineProjectRef: value.timeline_project_ref,
    projectContextRef: value.project_context_ref,
    p4SourceSetDigest: value.p4_source_revision_set_sha256,
    timelineProjectionDigest: value.timeline_projection_digest_sha256,
    timelineOrderedEntryDigest: value.timeline_ordered_entry_digest_sha256,
    validAt: value.valid_at,
    knownAt: value.known_at,
  };
}

function parseSourceRevisionSet(value, blockers) {
  if (!Array.isArray(value) || value.length === 0) {
    blockers.add(C.MEMBERSHIP_INVALID);
    return null;
  }
  const records = [];
  const seenExact = new Set();
  const seenLogical = new Map();
  for (const entry of value) {
    const corrected = entry?.correction_state === 'corrected';
    const expected = corrected
      ? [...SOURCE_REVISION_BASE_FIELDS, 'predecessor_revision_ref']
      : SOURCE_REVISION_BASE_FIELDS;
    if (!exactKeys(entry, expected) || !['project', 'common'].includes(entry.scope)
        || !readExactRef(entry.source_revision_ref) || !isHash(entry.source_revision_receipt_sha256)
        || !['included', 'gap', 'unclassified', 'held_conflict'].includes(entry.inclusion_state)
        || !['original', 'corrected'].includes(entry.correction_state)
        || (corrected && !readExactRef(entry.predecessor_revision_ref))) {
      blockers.add(C.MEMBERSHIP_INVALID);
      return null;
    }
    const exact = exactRefIdentityKey(entry.source_revision_ref);
    const logical = `${entry.source_revision_ref.entity_id}\u001f${entry.source_revision_ref.revision_id}`;
    if (seenExact.has(exact)) {
      blockers.add(C.MEMBERSHIP_DUPLICATE);
      return null;
    }
    if (seenLogical.has(logical) && seenLogical.get(logical) !== exact) {
      blockers.add(C.MEMBERSHIP_HELD_CONFLICT);
      return null;
    }
    seenExact.add(exact);
    seenLogical.set(logical, exact);
    records.push({
      scope: entry.scope,
      sourceRevisionRef: cloneRef(entry.source_revision_ref),
      sourceRevisionReceipt: entry.source_revision_receipt_sha256,
      inclusionState: entry.inclusion_state,
      correctionState: entry.correction_state,
      predecessorRevisionRef: corrected ? cloneRef(entry.predecessor_revision_ref) : undefined,
      validAt: entry.valid_at,
      knownAt: entry.known_at,
    });
  }
  const byExact = new Map(records.map((record) => [exactRefIdentityKey(record.sourceRevisionRef), record]));
  const predecessorByCurrent = new Map();
  const successorByPredecessor = new Map();
  for (const record of records) {
    if (record.correctionState === 'corrected') {
      const predecessor = exactRefIdentityKey(record.predecessorRevisionRef);
      const predecessorRecord = byExact.get(predecessor);
      if (predecessor === exactRefIdentityKey(record.sourceRevisionRef) || predecessorRecord === undefined
          || (validInstant(record.knownAt) && validInstant(predecessorRecord.knownAt)
            && compareCodePoints(record.knownAt, predecessorRecord.knownAt) < 0)) {
        blockers.add(C.LINEAGE_SUPERSESSION_INVALID);
      }
      predecessorByCurrent.set(exactRefIdentityKey(record.sourceRevisionRef), predecessor);
      if (successorByPredecessor.has(predecessor)
          && successorByPredecessor.get(predecessor) !== exactRefIdentityKey(record.sourceRevisionRef)) {
        blockers.add(C.LINEAGE_SUPERSESSION_INVALID);
      }
      successorByPredecessor.set(predecessor, exactRefIdentityKey(record.sourceRevisionRef));
    }
    if (record.inclusionState === 'unclassified') blockers.add(C.MEMBERSHIP_UNCLASSIFIED);
    if (record.inclusionState === 'held_conflict') blockers.add(C.MEMBERSHIP_HELD_CONFLICT);
  }
  if (hasPredecessorCycle(predecessorByCurrent)) blockers.add(C.LINEAGE_SUPERSESSION_INVALID);
  return { records: uniqueSorted(records, (record) => exactRefIdentityKey(record.sourceRevisionRef)), byExact };
}

function parseMemberships(value, blockers) {
  if (!Array.isArray(value) || value.length === 0) {
    blockers.add(C.MEMBERSHIP_INVALID);
    return null;
  }
  const records = [];
  const spans = new Set();
  const eventUnit = new Map();
  const unitBranch = new Map();
  const branchProject = new Map();
  for (const entry of value) {
    const required = entry?.review_requirement === 'required';
    const corrected = entry?.correction_state === 'corrected';
    const expected = [
      ...MEMBERSHIP_BASE_FIELDS,
      ...(required ? ['review_proposal_ref'] : []),
      ...(corrected ? ['predecessor_source_span_ref'] : []),
    ];
    if (!exactKeys(entry, expected) || !readExactRef(entry.source_revision_ref)
        || !readExactRef(entry.evidence_ref)
        || !MEMBERSHIP_LANES.has(entry.source_lane) || !isSafeToken(entry.source_span_ref)
        || !isSafeToken(entry.context_event_ref) || !isSafeToken(entry.context_unit_ref)
        || !isSafeToken(entry.context_branch_ref) || !isSafeToken(entry.project_context_ref)
        || !['original', 'corrected'].includes(entry.correction_state)
        || !['not_required', 'required'].includes(entry.review_requirement)
        || (required && !readExactRef(entry.review_proposal_ref))
        || (corrected && !isSafeToken(entry.predecessor_source_span_ref))) {
      blockers.add(C.MEMBERSHIP_INVALID);
      return null;
    }
    if (spans.has(entry.source_span_ref)) {
      blockers.add(C.MEMBERSHIP_DUPLICATE);
      return null;
    }
    spans.add(entry.source_span_ref);
    const pairs = [
      [eventUnit, entry.context_event_ref, entry.context_unit_ref],
      [unitBranch, entry.context_unit_ref, entry.context_branch_ref],
      [branchProject, entry.context_branch_ref, entry.project_context_ref],
    ];
    if (pairs.some(([map, key, target]) => map.has(key) && map.get(key) !== target)) {
      blockers.add(C.MEMBERSHIP_FOREIGN);
      return null;
    }
    for (const [map, key, target] of pairs) map.set(key, target);
    records.push({
      sourceSpanRef: entry.source_span_ref,
      sourceRevisionRef: cloneRef(entry.source_revision_ref),
      sourceLane: entry.source_lane,
      evidenceRef: cloneRef(entry.evidence_ref),
      contextEventRef: entry.context_event_ref,
      contextUnitRef: entry.context_unit_ref,
      contextBranchRef: entry.context_branch_ref,
      projectContextRef: entry.project_context_ref,
      correctionState: entry.correction_state,
      predecessorSourceSpanRef: corrected ? entry.predecessor_source_span_ref : undefined,
      reviewRequirement: entry.review_requirement,
      reviewProposalRef: required ? cloneRef(entry.review_proposal_ref) : undefined,
      validAt: entry.valid_at,
      knownAt: entry.known_at,
    });
  }
  const bySpan = new Map(records.map((record) => [record.sourceSpanRef, record]));
  const predecessorByCurrent = new Map();
  const successorByPredecessor = new Map();
  for (const record of records) {
    if (record.correctionState === 'corrected'
        && (record.predecessorSourceSpanRef === record.sourceSpanRef
          || !bySpan.has(record.predecessorSourceSpanRef))) {
      blockers.add(C.LINEAGE_SUPERSESSION_INVALID);
    }
    if (record.correctionState === 'corrected') {
      predecessorByCurrent.set(record.sourceSpanRef, record.predecessorSourceSpanRef);
      if (successorByPredecessor.has(record.predecessorSourceSpanRef)
          && successorByPredecessor.get(record.predecessorSourceSpanRef) !== record.sourceSpanRef) {
        blockers.add(C.LINEAGE_SUPERSESSION_INVALID);
      }
      successorByPredecessor.set(record.predecessorSourceSpanRef, record.sourceSpanRef);
    }
  }
  if (hasPredecessorCycle(predecessorByCurrent)) blockers.add(C.LINEAGE_SUPERSESSION_INVALID);
  return { records: uniqueSorted(records, (record) => record.sourceSpanRef), bySpan };
}

function parseCoverage(value, blockers) {
  if (!exactKeys(value, COVERAGE_FIELDS)
      || value.schema_version !== 'soulforge.project_context_generation_coverage.v0'
      || !Array.isArray(value.source_lanes)) {
    blockers.add(C.COVERAGE_INVALID);
    return null;
  }
  const lanes = [];
  const seen = new Set();
  for (const entry of value.source_lanes) {
    if (!exactKeys(entry, COVERAGE_LANE_FIELDS) || !SOURCE_LANES.includes(entry.source_lane)
        || !['covered', 'gap'].includes(entry.state) || seen.has(entry.source_lane)) {
      blockers.add(C.COVERAGE_INVALID);
      return null;
    }
    seen.add(entry.source_lane);
    lanes.push({ sourceLane: entry.source_lane, state: entry.state, validAt: entry.valid_at, knownAt: entry.known_at });
  }
  for (const lane of SOURCE_LANES) if (!seen.has(lane)) blockers.add(C.COVERAGE_LANE_MISSING);
  return uniqueSorted(lanes, (entry) => entry.sourceLane);
}

function parseReviews(value, blockers) {
  if (!Array.isArray(value)) {
    blockers.add(C.REVIEW_INVALID);
    return null;
  }
  const records = [];
  const seen = new Set();
  for (const entry of value) {
    const isPending = entry?.reviewer_state === 'pending_registered_human_review';
    const expected = isPending ? REVIEW_BASE_FIELDS : [...REVIEW_BASE_FIELDS, 'review_ref'];
    if (!exactKeys(entry, expected) || !readExactRef(entry.proposal_ref)
        || !['pending_registered_human_review', 'reviewed', 'rejected'].includes(entry.reviewer_state)
        || (!isPending && !readExactRef(entry.review_ref))) {
      blockers.add(C.REVIEW_INVALID);
      return null;
    }
    const key = exactRefIdentityKey(entry.proposal_ref);
    if (seen.has(key)) {
      blockers.add(C.REVIEW_INVALID);
      return null;
    }
    seen.add(key);
    if (entry.reviewer_state === 'rejected') blockers.add(C.REVIEW_REJECTED);
    records.push({
      proposalRef: cloneRef(entry.proposal_ref),
      reviewerState: entry.reviewer_state,
      reviewRef: isPending ? undefined : cloneRef(entry.review_ref),
      validAt: entry.valid_at,
      knownAt: entry.known_at,
    });
  }
  return { records: uniqueSorted(records, (record) => exactRefIdentityKey(record.proposalRef)), byProposal: new Map(records.map((record) => [exactRefIdentityKey(record.proposalRef), record])) };
}

function parseWriter(value, blockers) {
  if (!exactKeys(value, WRITER_FIELDS)
      || value.schema_version !== 'soulforge.project_context_generation_writer_witness.v0'
      || !readExactRef(value.hpp_writer_ref) || !readExactRef(value.writer_epoch_ref)
      || !Number.isSafeInteger(value.writer_epoch) || value.writer_epoch < 1
      || typeof value.sole_writer !== 'boolean' || !readExactRef(value.project_binding_ref)
      || !['bound', 'unbound'].includes(value.status)) {
    blockers.add(C.WRITER_INVALID);
    return null;
  }
  if (value.status !== 'bound' || value.sole_writer !== true) blockers.add(C.WRITER_UNBOUND);
  return {
    writerRef: cloneRef(value.hpp_writer_ref),
    writerEpochRef: cloneRef(value.writer_epoch_ref),
    writerEpoch: value.writer_epoch,
    soleWriter: value.sole_writer,
    projectBindingRef: cloneRef(value.project_binding_ref),
    status: value.status,
    validAt: value.valid_at,
    knownAt: value.known_at,
  };
}

function parseLineage(value, blockers) {
  if (!exactKeys(value, LINEAGE_FIELDS)
      || value.schema_version !== 'soulforge.project_context_generation_lineage.v0'
      || !exactKeys(value.prior_generation, PRIOR_GENERATION_FIELDS)
      || !exactKeys(value.current_generation, CURRENT_GENERATION_FIELDS)
      || !exactKeys(value.generation_cutoff, CUTOFF_FIELDS)) {
    blockers.add(C.LINEAGE_INVALID);
    return null;
  }
  const prior = value.prior_generation;
  const current = value.current_generation;
  if (!Number.isSafeInteger(prior.generation) || prior.generation < 0
      || !readExactRef(prior.generation_ref) || !isHash(prior.accepted_input_set_digest_sha256)
      || !isHash(prior.cas_fingerprint_sha256)
      || prior.supersession_state !== 'superseded_by_current_proposal'
      || !Number.isSafeInteger(current.generation) || current.generation !== prior.generation + 1
      || !readExactRef(current.generation_ref) || !readExactRef(current.supersedes_generation_ref)
      || !isHash(value.observed_prior_cas_fingerprint_sha256)
      || !sameExactRef(current.supersedes_generation_ref, prior.generation_ref)) {
    blockers.add(C.LINEAGE_INVALID);
    return null;
  }
  if (value.observed_prior_cas_fingerprint_sha256 !== prior.cas_fingerprint_sha256) {
    blockers.add(C.CAS_MISMATCH);
  }
  if (validInstant(prior.known_at) && validInstant(current.known_at)
      && compareCodePoints(current.known_at, prior.known_at) < 0) {
    blockers.add(C.LINEAGE_SUPERSESSION_INVALID);
  }
  return {
    prior: {
      generation: prior.generation,
      generationRef: cloneRef(prior.generation_ref),
      acceptedInputSetDigest: prior.accepted_input_set_digest_sha256,
      casFingerprint: prior.cas_fingerprint_sha256,
      supersessionState: prior.supersession_state,
      validAt: prior.valid_at,
      knownAt: prior.known_at,
    },
    current: {
      generation: current.generation,
      generationRef: cloneRef(current.generation_ref),
      supersedesGenerationRef: cloneRef(current.supersedes_generation_ref),
      validAt: current.valid_at,
      knownAt: current.known_at,
    },
    cutoff: { validAt: value.generation_cutoff.valid_at, knownAt: value.generation_cutoff.known_at },
  };
}

function validateBitemporal(records, cutoff, blockers) {
  if (!cutoff || !hasBitemporalCutoffs(cutoff.validAt, cutoff.knownAt)) {
    blockers.add(C.BITEMPORAL_INVALID);
    return;
  }
  for (const record of records) {
    if (!record || !hasBitemporalCutoffs(record.validAt, record.knownAt)) {
      blockers.add(C.BITEMPORAL_INVALID);
      continue;
    }
    if (compareCodePoints(record.validAt, cutoff.validAt) > 0
        || compareCodePoints(record.knownAt, cutoff.knownAt) > 0) {
      blockers.add(C.BITEMPORAL_STALE);
    }
  }
}

function candidateAuthority() {
  return {
    accepted: false,
    acceptance_allowed: false,
    generation_advanced: false,
    hpp_writer_called: false,
    source_truth_accepted: false,
  };
}

function zeroEffects() {
  return {
    persistent_writes: 0,
    model_calls: 0,
    network_calls: 0,
    erp_writes: 0,
    taskdriver_activations: 0,
    task_calls: 0,
    hpp_writer_calls: 0,
    legacy_csv_writer_calls: 0,
  };
}

function makeReceipt({
  status,
  blockers,
  sourceRevisionCount = 0,
  membershipCount = 0,
  timelineEntryCount = 0,
  sourceRevisionSetDigest = undefined,
  membershipDigest = undefined,
  timelineMembershipDigest = undefined,
  acceptedInputSetDigest = undefined,
  casFingerprint = undefined,
}) {
  const receipt = {
    schema_version: PROJECT_CONTEXT_GENERATION_CANDIDATE_RECEIPT_SCHEMA,
    kind: 'project_context_generation_candidate_receipt',
    status,
    candidate_only: true,
    blocker_codes: [...blockers].sort(compareCodePoints),
    source_revision_count: sourceRevisionCount,
    membership_count: membershipCount,
    timeline_entry_count: timelineEntryCount,
    authority: candidateAuthority(),
    effects: zeroEffects(),
  };
  if (sourceRevisionSetDigest !== undefined) receipt.source_revision_set_digest_sha256 = sourceRevisionSetDigest;
  if (membershipDigest !== undefined) receipt.membership_digest_sha256 = membershipDigest;
  if (timelineMembershipDigest !== undefined) receipt.timeline_membership_digest_sha256 = timelineMembershipDigest;
  if (acceptedInputSetDigest !== undefined) receipt.accepted_input_set_digest_sha256 = acceptedInputSetDigest;
  if (casFingerprint !== undefined) receipt.generation_cas_fingerprint_sha256 = casFingerprint;
  return deepFreeze(receipt);
}

function inputHold(blockers) {
  return deepFreeze({
    candidate: null,
    receipt: makeReceipt({ status: 'HOLD', blockers }),
  });
}

function contextGraph(memberships) {
  const events = new Map();
  const units = new Map();
  const branches = new Map();
  for (const membership of memberships) {
    const event = events.get(membership.contextEventRef) ?? { context_event_ref: membership.contextEventRef, source_span_refs: [] };
    event.source_span_refs.push(membership.sourceSpanRef);
    events.set(membership.contextEventRef, event);
    if (!units.has(membership.contextUnitRef)) {
      units.set(membership.contextUnitRef, {
        context_unit_ref: membership.contextUnitRef,
        context_event_refs: [],
        context_branch_ref: membership.contextBranchRef,
      });
    }
    units.get(membership.contextUnitRef).context_event_refs.push(membership.contextEventRef);
    if (!branches.has(membership.contextBranchRef)) {
      branches.set(membership.contextBranchRef, {
        context_branch_ref: membership.contextBranchRef,
        context_unit_refs: [],
        project_context_ref: membership.projectContextRef,
      });
    }
    branches.get(membership.contextBranchRef).context_unit_refs.push(membership.contextUnitRef);
  }
  const sourceSpans = memberships.map((membership) => ({
    source_span_ref: membership.sourceSpanRef,
    source_revision_ref: cloneRef(membership.sourceRevisionRef),
    evidence_ref: cloneRef(membership.evidenceRef),
    source_lane: membership.sourceLane,
    valid_at: membership.validAt,
    known_at: membership.knownAt,
  })).sort((left, right) => compareCodePoints(left.source_span_ref, right.source_span_ref));
  const normaliseList = (items, key) => [...items.values()]
    .map((item) => ({
      ...item,
      [key]: [...new Set(item[key])].sort(compareCodePoints),
    }))
    .sort((left, right) => compareCodePoints(left[Object.keys(left)[0]], right[Object.keys(right)[0]]));
  const eventRows = normaliseList(events, 'source_span_refs');
  const unitRows = normaliseList(units, 'context_event_refs');
  const branchRows = normaliseList(branches, 'context_unit_refs');
  const projectContextRefs = [...new Set(memberships.map((membership) => membership.projectContextRef))];
  return {
    project_context_ref: projectContextRefs.length === 1 ? projectContextRefs[0] : undefined,
    source_spans: sourceSpans,
    context_events: eventRows,
    context_units: unitRows,
    context_branches: branchRows,
  };
}

function sourceRevisionMembershipRows(records) {
  return records.map((record) => ({
    scope: record.scope,
    source_revision_ref: cloneRef(record.sourceRevisionRef),
    source_revision_receipt_sha256: record.sourceRevisionReceipt,
    inclusion_state: record.inclusionState,
    correction_state: record.correctionState,
    ...(record.predecessorRevisionRef === undefined ? {} : {
      predecessor_revision_ref: cloneRef(record.predecessorRevisionRef),
    }),
    valid_at: record.validAt,
    known_at: record.knownAt,
  }));
}

function membershipRows(records) {
  return records.map((record) => ({
    source_span_ref: record.sourceSpanRef,
    source_revision_ref: cloneRef(record.sourceRevisionRef),
    evidence_ref: cloneRef(record.evidenceRef),
    source_lane: record.sourceLane,
    context_event_ref: record.contextEventRef,
    context_unit_ref: record.contextUnitRef,
    context_branch_ref: record.contextBranchRef,
    project_context_ref: record.projectContextRef,
    correction_state: record.correctionState,
    ...(record.predecessorSourceSpanRef === undefined ? {} : {
      predecessor_source_span_ref: record.predecessorSourceSpanRef,
    }),
    review_requirement: record.reviewRequirement,
    ...(record.reviewProposalRef === undefined ? {} : {
      review_proposal_ref: cloneRef(record.reviewProposalRef),
    }),
    valid_at: record.validAt,
    known_at: record.knownAt,
  }));
}

function coverageRows(records) {
  return records.map((record) => ({
    source_lane: record.sourceLane,
    state: record.state,
    valid_at: record.validAt,
    known_at: record.knownAt,
  }));
}

function reviewRows(records) {
  return records.map((record) => ({
    proposal_ref: cloneRef(record.proposalRef),
    reviewer_state: record.reviewerState,
    ...(record.reviewRef === undefined ? {} : { review_ref: cloneRef(record.reviewRef) }),
    valid_at: record.validAt,
    known_at: record.knownAt,
  }));
}

function buildDigests({ p4, m2, timeline, crosswalk, sourceSet, memberships, coverage, reviews, writer, lineage }) {
  if (!p4 || !m2 || !timeline || !crosswalk || !sourceSet || !memberships || !coverage || !reviews || !writer || !lineage) return {};
  const sourceRevisionSetDigest = sha256Ref('soulforge.project_context_generation.source_revision_set.v0',
    sourceSet.records.map((record) => ({
      scope: record.scope,
      source_revision_ref: record.sourceRevisionRef,
      source_revision_receipt_sha256: record.sourceRevisionReceipt,
      inclusion_state: record.inclusionState,
      correction_state: record.correctionState,
      ...(record.predecessorRevisionRef === undefined ? {} : { predecessor_revision_ref: record.predecessorRevisionRef }),
      valid_at: record.validAt,
      known_at: record.knownAt,
    })));
  const membershipDigest = sha256Ref('soulforge.project_context_generation.membership.v0',
    memberships.records.map((record) => ({
      source_span_ref: record.sourceSpanRef,
      source_revision_ref: record.sourceRevisionRef,
      evidence_ref: record.evidenceRef,
      source_lane: record.sourceLane,
      context_event_ref: record.contextEventRef,
      context_unit_ref: record.contextUnitRef,
      context_branch_ref: record.contextBranchRef,
      project_context_ref: record.projectContextRef,
      correction_state: record.correctionState,
      ...(record.predecessorSourceSpanRef === undefined ? {} : { predecessor_source_span_ref: record.predecessorSourceSpanRef }),
      review_requirement: record.reviewRequirement,
      ...(record.reviewProposalRef === undefined ? {} : { review_proposal_ref: record.reviewProposalRef }),
      valid_at: record.validAt,
      known_at: record.knownAt,
    })));
  const timelineMembershipDigest = sha256Ref('soulforge.project_context_generation.timeline_membership.v0',
    timeline.entries.map((entry) => ({
      entry_ref: entry.entryRef,
      source_lane: entry.sourceLane,
      source_revision_ref: entry.sourceRevisionRef,
      source_span_ref: entry.sourceSpanRef,
      context_event_ref: entry.contextEventRef,
      context_unit_ref: entry.contextUnitRef,
      context_branch_ref: entry.contextBranchRef,
      project_context_ref: entry.projectContextRef,
      correction_state: entry.correctionState,
      valid_at: entry.validAt,
      known_at: entry.knownAt,
    })));
  const m2ProvenanceEvidenceDigest = sha256Ref(
    'soulforge.project_context_generation.m2_provenance_evidence.v0',
    m2.evidence.map((entry) => ({
      claim: entry.claim,
      evidence_ref: entry.evidenceRef,
      source_revision_ref: entry.sourceRevisionRef,
      state: entry.state,
      valid_at: entry.validAt,
      known_at: entry.knownAt,
    })),
  );
  const acceptedInputSetDigest = sha256Ref('soulforge.project_context_generation.accepted_input_set_candidate.v0', {
    p4_witness: {
      candidate_ref: p4.candidateRef,
      candidate_sha256: p4.candidateDigest,
      valid_at: p4.validAt,
      known_at: p4.knownAt,
    },
    m2_witness: {
      assessment_ref: m2.assessmentRef,
      assessment_digest_sha256: m2.assessmentDigest,
      valid_at: m2.validAt,
      known_at: m2.knownAt,
    },
    m2_provenance_evidence_digest_sha256: m2ProvenanceEvidenceDigest,
    timeline_witness: {
      projection_ref: timeline.projectionRef,
      projection_digest_sha256: timeline.projectionDigest,
      ordered_entry_digest_sha256: timeline.orderedEntryDigest,
      projection_generation_id: timeline.generationId,
      project_ref: timeline.projectRef,
      valid_at: timeline.validAt,
      known_at: timeline.knownAt,
    },
    crosswalk_ref: crosswalk.crosswalkRef,
    crosswalk_digest_sha256: crosswalk.digest,
    source_revision_set_digest_sha256: sourceRevisionSetDigest,
    membership_digest_sha256: membershipDigest,
    timeline_membership_digest_sha256: timelineMembershipDigest,
    coverage: coverage,
    review_state_digest_sha256: sha256Ref('soulforge.project_context_generation.review_state.v0', reviews.records.map((record) => ({
      proposal_ref: record.proposalRef,
      reviewer_state: record.reviewerState,
      ...(record.reviewRef === undefined ? {} : { review_ref: record.reviewRef }),
      valid_at: record.validAt,
      known_at: record.knownAt,
    }))),
    writer_anchor: {
      hpp_writer_ref: writer.writerRef,
      sole_writer: writer.soleWriter,
      writer_epoch_ref: writer.writerEpochRef,
      writer_epoch: writer.writerEpoch,
      project_binding_ref: writer.projectBindingRef,
      status: writer.status,
      valid_at: writer.validAt,
      known_at: writer.knownAt,
    },
    prior_generation: {
      generation: lineage.prior.generation,
      generation_ref: lineage.prior.generationRef,
      accepted_input_set_digest_sha256: lineage.prior.acceptedInputSetDigest,
      cas_fingerprint_sha256: lineage.prior.casFingerprint,
      supersession_state: lineage.prior.supersessionState,
      valid_at: lineage.prior.validAt,
      known_at: lineage.prior.knownAt,
    },
    current_generation: {
      generation: lineage.current.generation,
      generation_ref: lineage.current.generationRef,
      supersedes_generation_ref: lineage.current.supersedesGenerationRef,
      valid_at: lineage.current.validAt,
      known_at: lineage.current.knownAt,
    },
    generation_cutoff: { valid_at: lineage.cutoff.validAt, known_at: lineage.cutoff.knownAt },
  });
  const casFingerprint = sha256Ref('soulforge.project_context_generation.cas.v0', {
    project_binding_ref: p4.projectBindingRef,
    prior_generation_ref: lineage.prior.generationRef,
    current_generation_ref: lineage.current.generationRef,
    accepted_input_set_candidate_digest_sha256: acceptedInputSetDigest,
    generation_cutoff: { valid_at: lineage.cutoff.validAt, known_at: lineage.cutoff.knownAt },
  });
  return {
    sourceRevisionSetDigest,
    membershipDigest,
    timelineMembershipDigest,
    m2ProvenanceEvidenceDigest,
    acceptedInputSetDigest,
    casFingerprint,
  };
}

function checkRelationships({ p4, m2, timeline, crosswalk, sourceSet, memberships, coverage, reviews, writer, lineage, blockers }) {
  if (p4 && m2 && !sameExactRef(p4.projectBindingRef, m2.projectBindingRef)) blockers.add(C.M2_PROJECT_MISMATCH);
  if (p4 && crosswalk && (!sameExactRef(p4.projectBindingRef, crosswalk.p4ProjectBindingRef)
      || p4.sourceSetDigest !== crosswalk.p4SourceSetDigest)) blockers.add(C.CROSSWALK_MISMATCH);
  if (m2 && crosswalk && !sameExactRef(m2.projectBindingRef, crosswalk.m2ProjectBindingRef)) blockers.add(C.CROSSWALK_MISMATCH);
  if (timeline && crosswalk && (timeline.projectRef !== crosswalk.timelineProjectRef
      || timeline.projectionDigest !== crosswalk.timelineProjectionDigest
      || timeline.orderedEntryDigest !== crosswalk.timelineOrderedEntryDigest)) blockers.add(C.TIMELINE_PROJECT_MISMATCH);
  if (timeline && crosswalk && timeline.entries.some(
    (entry) => entry.projectContextRef !== crosswalk.projectContextRef,
  )) blockers.add(C.CROSSWALK_MISMATCH);
  if (memberships && crosswalk && memberships.records.some(
    (record) => record.projectContextRef !== crosswalk.projectContextRef,
  )) blockers.add(C.CROSSWALK_MISMATCH);
  if (p4 && writer && !sameExactRef(p4.projectBindingRef, writer.projectBindingRef)) blockers.add(C.WRITER_INVALID);
  if (p4 && sourceSet) {
    for (const source of p4.sourceSet) {
      const record = sourceSet.byExact.get(exactRefIdentityKey(source.document_revision_ref));
      if (!record || record.scope !== 'project'
          || record.sourceRevisionReceipt !== source.source_revision_receipt_sha256) {
        blockers.add(C.P4_SOURCE_SET_MISMATCH);
      }
    }
  }
  if (m2) {
    for (const claim of PROVENANCE_CLAIMS) {
      const evidence = m2.evidence.find((entry) => entry.claim === claim);
      const membership = evidence === undefined ? undefined : memberships?.records.find((record) => (
        sameExactRef(record.sourceRevisionRef, evidence.sourceRevisionRef)
          && sameExactRef(record.evidenceRef, evidence.evidenceRef)
          && record.validAt === evidence.validAt
          && record.knownAt === evidence.knownAt
      ));
      if (!evidence || !sourceSet?.byExact.has(exactRefIdentityKey(evidence.sourceRevisionRef))
          || membership === undefined) {
        blockers.add(PROVENANCE_BLOCKERS[claim]);
      }
    }
  }
  if (sourceSet && memberships) {
    for (const membership of memberships.records) {
      const source = sourceSet.byExact.get(exactRefIdentityKey(membership.sourceRevisionRef));
      if (!source) {
        blockers.add(C.MEMBERSHIP_FOREIGN);
        continue;
      }
      if (source.correctionState !== membership.correctionState) {
        blockers.add(C.LINEAGE_SUPERSESSION_INVALID);
      }
      if (membership.correctionState === 'corrected') {
        const predecessorMembership = memberships.bySpan.get(membership.predecessorSourceSpanRef);
        if (!source.predecessorRevisionRef || !predecessorMembership
            || !sameExactRef(predecessorMembership.sourceRevisionRef, source.predecessorRevisionRef)) {
          blockers.add(C.LINEAGE_SUPERSESSION_INVALID);
        }
      }
    }
    for (const source of sourceSet.records) {
      if (!memberships.records.some((membership) => sameExactRef(membership.sourceRevisionRef, source.sourceRevisionRef))) {
        blockers.add(C.COVERAGE_SILENT_OMISSION);
      }
    }
  }
  if (timeline && memberships) {
    for (const entry of timeline.entries) {
      const match = memberships.bySpan.get(entry.sourceSpanRef);
      if (!match || !sameExactRef(match.sourceRevisionRef, entry.sourceRevisionRef)
          || match.sourceLane !== entry.sourceLane || match.contextEventRef !== entry.contextEventRef
          || match.contextUnitRef !== entry.contextUnitRef || match.contextBranchRef !== entry.contextBranchRef
          || match.projectContextRef !== entry.projectContextRef) {
        blockers.add(C.TIMELINE_INVALID);
      }
      if (match && match.correctionState !== entry.correctionState) {
        blockers.add(C.LINEAGE_SUPERSESSION_INVALID);
      }
    }
  }
  if (timeline && coverage) {
    for (const lane of SOURCE_LANES) {
      const record = coverage.find((entry) => entry.sourceLane === lane);
      const entryCount = timeline.entries.filter((entry) => entry.sourceLane === lane).length;
      if (record && ((record.state === 'covered' && entryCount === 0)
          || (record.state === 'gap' && entryCount !== 0))) {
        blockers.add(C.COVERAGE_SILENT_OMISSION);
      }
    }
  }
  if (memberships && reviews) {
    for (const membership of memberships.records.filter((record) => record.reviewRequirement === 'required')) {
      if (!reviews.byProposal.has(exactRefIdentityKey(membership.reviewProposalRef))) {
        blockers.add(C.REVIEW_REQUIRED_UNDECLARED);
      }
    }
  }
  if (lineage && lineage.prior.generationRef && lineage.current.supersedesGenerationRef
      && !sameExactRef(lineage.prior.generationRef, lineage.current.supersedesGenerationRef)) {
    blockers.add(C.LINEAGE_SUPERSESSION_INVALID);
  }
}

/**
 * Creates a deterministic, body-free P5 context-generation candidate.
 *
 * The returned status only says whether the supplied metadata is ready to be
 * reviewed by a registered human. It is never an acceptance or a generation advance.
 */
export function buildProjectContextGenerationCandidate(request) {
  const safe = snapshotPlainData(request);
  if (safe === null || !exactKeys(safe, ROOT_FIELDS)
      || safe.schema_version !== PROJECT_CONTEXT_GENERATION_CANDIDATE_REQUEST_SCHEMA) {
    return inputHold([C.INPUT_INVALID]);
  }

  const blockers = new Set();
  const p4 = parseP4(safe.p4, blockers);
  const m2 = parseM2(safe.m2, blockers);
  const timeline = parseTimeline(safe.timeline, blockers);
  const crosswalk = parseCrosswalk(safe.project_crosswalk, blockers);
  const sourceSet = parseSourceRevisionSet(safe.source_revision_set, blockers);
  const memberships = parseMemberships(safe.memberships, blockers);
  const coverage = parseCoverage(safe.coverage, blockers);
  const reviews = parseReviews(safe.reviews, blockers);
  const writer = parseWriter(safe.writer, blockers);
  const lineage = parseLineage(safe.lineage, blockers);

  if (lineage) {
    const dated = [
      p4, m2, timeline, crosswalk, writer,
      ...(sourceSet?.records ?? []),
      ...(memberships?.records ?? []),
      ...(coverage ?? []),
      ...(reviews?.records ?? []),
      ...(m2?.evidence ?? []),
      ...(timeline?.entries ?? []),
      lineage.prior, lineage.current,
    ];
    validateBitemporal(dated, lineage.cutoff, blockers);
  }

  checkRelationships({ p4, m2, timeline, crosswalk, sourceSet, memberships, coverage, reviews, writer, lineage, blockers });
  const digests = buildDigests({ p4, m2, timeline, crosswalk, sourceSet, memberships, coverage, reviews, writer, lineage });
  const blockerCodes = [...blockers].sort(compareCodePoints);
  const status = blockerCodes.length === 0 ? 'ready_for_registered_human_review' : 'HOLD';
  const counts = {
    sourceRevisionCount: sourceSet?.records.length ?? 0,
    membershipCount: memberships?.records.length ?? 0,
    timelineEntryCount: timeline?.entries.length ?? 0,
  };

  if (status === 'HOLD') {
    return deepFreeze({
      candidate: {
        schema_version: PROJECT_CONTEXT_GENERATION_CANDIDATE_SCHEMA,
        kind: 'project_context_generation_candidate',
        status,
        candidate_only: true,
        claim_ceiling: 'observed',
        blocker_codes: blockerCodes,
        authority: candidateAuthority(),
        effects: zeroEffects(),
      },
      receipt: makeReceipt({ status, blockers: blockerCodes, ...counts, ...digests }),
    });
  }

  const graph = contextGraph(memberships.records);
  if (graph.project_context_ref === undefined) {
    return deepFreeze({
      candidate: {
        schema_version: PROJECT_CONTEXT_GENERATION_CANDIDATE_SCHEMA,
        kind: 'project_context_generation_candidate',
        status: 'HOLD',
        candidate_only: true,
        claim_ceiling: 'observed',
        blocker_codes: [C.MEMBERSHIP_FOREIGN],
        authority: candidateAuthority(),
        effects: zeroEffects(),
      },
      receipt: makeReceipt({ status: 'HOLD', blockers: [C.MEMBERSHIP_FOREIGN], ...counts, ...digests }),
    });
  }
  const candidate = {
    schema_version: PROJECT_CONTEXT_GENERATION_CANDIDATE_SCHEMA,
    kind: 'project_context_generation_candidate',
    status,
    candidate_only: true,
    claim_ceiling: 'observed',
    project_binding_ref: cloneRef(p4.projectBindingRef),
    project_context: {
      ...graph,
      source_revision_set_digest_sha256: digests.sourceRevisionSetDigest,
      membership_digest_sha256: digests.membershipDigest,
      timeline_membership_digest_sha256: digests.timelineMembershipDigest,
      source_revision_membership: sourceRevisionMembershipRows(sourceSet.records),
      memberships: membershipRows(memberships.records),
      coverage: coverageRows(coverage),
      review_plan: reviewRows(reviews.records),
    },
    input_crosswalk: {
      crosswalk_ref: cloneRef(crosswalk.crosswalkRef),
      crosswalk_digest_sha256: crosswalk.digest,
      p4_candidate_ref: cloneRef(p4.candidateRef),
      p4_candidate_sha256: p4.candidateDigest,
      m2_assessment_ref: cloneRef(m2.assessmentRef),
      m2_assessment_digest_sha256: m2.assessmentDigest,
      m2_provenance_evidence_digest_sha256: digests.m2ProvenanceEvidenceDigest,
      timeline_projection_ref: cloneRef(timeline.projectionRef),
      timeline_projection_digest_sha256: timeline.projectionDigest,
      timeline_ordered_entry_digest_sha256: timeline.orderedEntryDigest,
    },
    accepted_input_set_candidate: {
      candidate_ref: digests.acceptedInputSetDigest,
      digest_sha256: digests.acceptedInputSetDigest,
      acceptance_allowed: false,
    },
    writer_anchor: {
      hpp_writer_ref: cloneRef(writer.writerRef),
      sole_writer: writer.soleWriter,
      writer_epoch_ref: cloneRef(writer.writerEpochRef),
      writer_epoch: writer.writerEpoch,
    },
    generation_proposal: {
      prior_generation: {
        generation: lineage.prior.generation,
        generation_ref: cloneRef(lineage.prior.generationRef),
        accepted_input_set_digest_sha256: lineage.prior.acceptedInputSetDigest,
      },
      current_generation: {
        generation: lineage.current.generation,
        generation_ref: cloneRef(lineage.current.generationRef),
        supersedes_generation_ref: cloneRef(lineage.current.supersedesGenerationRef),
      },
      cas_fingerprint_sha256: digests.casFingerprint,
    },
    authority: candidateAuthority(),
    effects: zeroEffects(),
    blocker_codes: [],
  };
  return deepFreeze({
    candidate,
    receipt: makeReceipt({ status, blockers: [], ...counts, ...digests }),
  });
}

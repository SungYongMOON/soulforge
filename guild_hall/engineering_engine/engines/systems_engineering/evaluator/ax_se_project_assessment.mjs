// Read-only AX/SE project assessment.
//
// This subject converts an exact, source-bound project snapshot into one bounded stage
// candidate and at most three mission candidates. It never clears a stage, assigns a
// person, creates a TaskIntent, activates TaskDriver, writes ERP, or calls a learned model.

import { types } from 'node:util';

import { recordSourceConflict, AUTHORITY_FAMILIES } from '../../../core/validators/authority.mjs';
import { canonicalise, compareCodePoints, inspectInstant } from '../../../core/validators/canonical.mjs';
import { assertEvidenceCeiling } from '../../../core/validators/ceilings.mjs';
import { PRESENCE } from '../../../core/validators/custody.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { isWellFormedRef, sameExactRef } from '../../../core/validators/identity.mjs';
import { candidateHandle } from '../../../core/validators/minting.mjs';
import { AXIS, GAP_TYPE, compareStates } from '../../../core/validators/snapshot.mjs';

export const AX_SE_INPUT_SCHEMA = 'soulforge.ax_se_project_assessment_input.v0';
export const AX_SE_ASSESSMENT_SCHEMA = 'soulforge.ax_se_project_assessment.v0';
export const AX_SE_POLICY_REVISION = 'soulforge.ax_se_project_assessment_policy.v0';
export const AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA = 'soulforge.ax_se_project_context_packet.v0';

export const CODES = Object.freeze({
  INPUT_INVALID: 'AX_SE_INPUT_INVALID',
  INPUT_UNSAFE: 'AX_SE_INPUT_UNSAFE',
  INPUT_UNBOUNDED: 'AX_SE_INPUT_UNBOUNDED',
  REFERENCE_INVALID: 'AX_SE_REFERENCE_INVALID',
  POLICY_HASH_MISMATCH: 'AX_SE_POLICY_HASH_MISMATCH',
  SNAPSHOT_HASH_MISMATCH: 'AX_SE_SNAPSHOT_HASH_MISMATCH',
  POLICY_BINDING_MISMATCH: 'AX_SE_POLICY_BINDING_MISMATCH',
  PROJECT_BINDING_MISMATCH: 'AX_SE_PROJECT_BINDING_MISMATCH',
  EVIDENCE_REQUIRED: 'AX_SE_EVIDENCE_REQUIRED',
  CONFLICT_INVALID: 'AX_SE_CONFLICT_INVALID',
});

const POLICY_SCHEMA = 'soulforge.ax_se_stage_policy.v0';
const SNAPSHOT_SCHEMA = 'soulforge.ax_se_project_snapshot.v0';
const SNAPSHOT_HASH_DOMAIN = SNAPSHOT_SCHEMA;
const INPUT_HASH_DOMAIN = 'soulforge.ax_se_project_assessment.input.v0';
const SHA256_CONTENT_ID = /^sha256:([0-9a-f]{64})$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const STAGE_CODE = new Set([
  '000_REF', '020_MGMT', '030_SRR', '060_SFR', '090_PDR', '120_CDR',
  '150_TRR_DT', '180_FCA_OT', '210_PCA', '240_LL', '270_UNCLASSIFIED',
]);
const AUTHORITY_FAMILY = new Set(AUTHORITY_FAMILIES.map((row) => row.key));
const RISK_SEVERITY = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });
const GAP_KEY = Object.freeze({
  [GAP_TYPE.CONFLICT]: 'conflict',
  [GAP_TYPE.MISSING]: 'missing',
  [GAP_TYPE.SATISFIED]: 'satisfied',
  [GAP_TYPE.UNKNOWN]: 'unknown',
});
const ISSUE_RANK = Object.freeze({ conflict: '00', unknown: '10', risk: '20', missing: '30' });
const ROOT_FIELDS = Object.freeze([
  'schema_version', 'policy_revision', 'project_binding_ref', 'objective_ref',
  'policy', 'snapshot', 'roles',
]);
const REQUEST_FIELDS = Object.freeze(['contextPacket', 'expectedProjectBindingRef', 'policy', 'roles']);
const CONTEXT_PACKET_FIELDS = Object.freeze([
  'schema_version', 'project_binding_ref', 'objective_ref', 'policy_ref',
  'project_snapshot_identity', 'observations', 'risks',
]);
// Identity only. Which snapshot and which revision are the caller's to state; which bytes is not.
const SNAPSHOT_IDENTITY_FIELDS = Object.freeze(['entity_id', 'revision_id']);
const POLICY_FIELDS = Object.freeze(['schema_version', 'policy_ref', 'stages']);
const STAGE_FIELDS = Object.freeze(['stage_code', 'stage_label', 'sequence', 'requirements']);
const REQUIREMENT_FIELDS = Object.freeze([
  'requirement_id', 'requirement_kind', 'required_capability', 'requirement_ref',
  'authority_family', 'applicability', 'valid_at', 'known_at',
]);
const SNAPSHOT_FIELDS = Object.freeze([
  'schema_version', 'project_snapshot_ref', 'policy_ref', 'observations', 'risks',
]);
const OBSERVATION_REQUIRED_FIELDS = Object.freeze([
  'requirement_id', 'presence_state', 'observation_attempt_ref', 'artifact_revision_ref',
  'valid_at', 'known_at', 'evidence_refs',
]);
const OBSERVATION_OPTIONAL_FIELDS = Object.freeze(['conflict_claims']);
const RISK_FIELDS = Object.freeze([
  'risk_id', 'risk_ref', 'stage_code', 'state', 'severity',
  'required_capability', 'evidence_refs',
]);
const ROLE_FIELDS = Object.freeze(['role_id', 'availability_state', 'capabilities']);
const REF_FIELDS = Object.freeze(['entity_id', 'revision_id', 'content_id', 'content_hash_alg']);
const CLAIM_FIELDS = Object.freeze([
  'claim_id', 'authority_family', 'source_revision_ref', 'lineage_ref',
  'applicability', 'asserted_value', 'valid_at', 'known_at',
]);
const FORBIDDEN_KEYS = new Set([
  'raw', 'raw_text', 'source_text', 'chunk', 'chunks', 'answer', 'answer_text',
  'body', 'payload', 'prompt', 'completion', 'private_path', 'absolute_path',
  'source_path', 'secret', 'credential', 'password', 'cookie', 'token',
]);
const FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
  /(?:^|[^A-Za-z0-9_])\/(?:tmp|temp|var|etc|opt|srv|usr|bin|sbin|lib|dev|proc|sys|root|home|users|mnt|media|private|data|Applications|Library|Volumes)\/\S/iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
]);
const MAX = Object.freeze({ depth: 18, values: 20000, array: 512, keys: 32, string: 512 });

function fail(code, message, detail = {}) {
  throw new ContractError(code, message, detail);
}

function assertSafeString(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX.string
      || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(CODES.INPUT_UNSAFE, 'input strings must be bounded non-empty NFC text without controls', { field });
  }
  if (FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
    fail(CODES.INPUT_UNSAFE, 'private paths, credentials, and payload-bearing strings are forbidden', { field });
  }
  return value;
}

function snapshotPlainData(root) {
  const seen = new WeakSet();
  let values = 0;

  const walk = (value, depth, field) => {
    values += 1;
    if (values > MAX.values || depth > MAX.depth) {
      fail(CODES.INPUT_UNBOUNDED, 'input exceeds the bounded plain-data limits');
    }
    if (typeof value === 'string') return assertSafeString(value, field);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) fail(CODES.INPUT_UNSAFE, 'only safe integers are accepted', { field });
      return value;
    }
    if (value === null || typeof value !== 'object') {
      fail(CODES.INPUT_UNSAFE, 'only non-null plain JSON data is accepted', { field });
    }
    if (types.isProxy(value)) {
      fail(CODES.INPUT_UNSAFE, 'Proxy input is refused before reflective access', { field });
    }
    if (seen.has(value)) fail(CODES.INPUT_UNSAFE, 'cyclic and aliased object graphs are refused', { field });
    seen.add(value);

    const array = Array.isArray(value);
    let prototype;
    let descriptors;
    try {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      fail(CODES.INPUT_UNSAFE, 'input reflection failed without exposing caller text', { field });
    }
    if ((array && prototype !== Array.prototype) || (!array && prototype !== Object.prototype)) {
      fail(CODES.INPUT_UNSAFE, 'custom prototypes and host objects are refused', { field });
    }
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) {
      fail(CODES.INPUT_UNSAFE, 'symbol properties are not accepted', { field });
    }
    const dataKeys = array ? keys.filter((key) => key !== 'length') : keys;
    const arrayLength = array ? descriptors.length?.value : undefined;
    if (array) {
      if (!Number.isSafeInteger(arrayLength) || arrayLength < 0 || arrayLength > MAX.array) {
        fail(CODES.INPUT_UNBOUNDED, 'arrays must be dense, unnamed, and within the item limit', { field });
      }
      const expected = new Set(Array.from({ length: arrayLength }, (_, index) => String(index)));
      if (dataKeys.length !== expected.size || dataKeys.some((key) => !expected.has(key))) {
        fail(CODES.INPUT_UNBOUNDED, 'arrays must be dense, unnamed, and within the item limit', { field });
      }
    } else if (dataKeys.length > MAX.keys) {
      fail(CODES.INPUT_UNBOUNDED, 'an input object exceeds the field limit', { field });
    }

    const copy = array ? new Array(arrayLength) : {};
    for (const key of dataKeys) {
      if (key.length > 80 || key.normalize('NFC') !== key || FORBIDDEN_KEYS.has(key.toLowerCase())) {
        fail(CODES.INPUT_UNSAFE, 'payload-bearing, unsafe, or unbounded field name refused', {
          field,
          key_length: key.length,
        });
      }
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail(CODES.INPUT_UNSAFE, 'accessors and hidden fields are refused', { field });
      }
      Object.defineProperty(copy, key, {
        value: walk(descriptor.value, depth + 1, array ? `${field}[]` : `${field}.*`),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return copy;
  };

  return walk(root, 0, 'input');
}

function assertExactKeys(value, required, optional = [], label = 'object') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(CODES.INPUT_INVALID, `${label} must be an object`);
  }
  const actual = Object.keys(value).sort(compareCodePoints);
  const allowed = [...required, ...optional].sort(compareCodePoints);
  if (actual.some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) {
    fail(CODES.INPUT_INVALID, `${label} has missing or unexpected fields`, {
      missing: required.filter((key) => !Object.hasOwn(value, key)),
      unexpected_count: actual.filter((key) => !allowed.includes(key)).length,
    });
  }
}

function assertToken(value, field) {
  if (typeof value !== 'string' || !TOKEN.test(value)) {
    fail(CODES.INPUT_INVALID, `${field} must be a bounded stable token`, { field });
  }
}

function assertCanonicalInstant(value, field) {
  if (!inspectInstant(value).valid) fail(CODES.INPUT_INVALID, `${field} must be a canonical instant`, { field });
}

/**
 * Refuses a record that claims to have been known before the fact it asserts was dated.
 *
 * Both instants are canonical fixed-width UTC by the time this runs, so code point order is
 * chronological order. The pair is refused rather than reordered, and the failure names only
 * the static field label: an incoherent record must not travel back to the caller inside the
 * error it caused.
 */
function assertKnownAtNotBeforeValidAt(validAt, knownAt, code, field) {
  if (compareCodePoints(knownAt, validAt) < 0) {
    fail(code, `${field} known_at cannot precede valid_at`, { field });
  }
}

function assertExactRef(ref, field) {
  assertExactKeys(ref, REF_FIELDS, [], field);
  if (!isWellFormedRef(ref) || !SHA256_CONTENT_ID.test(ref.content_id)) {
    fail(CODES.REFERENCE_INVALID, `${field} must be an exact sha256-bound revision ref`, { field });
  }
  return ref;
}

function assertSortedUnique(rows, keyOf, field) {
  const keys = rows.map((row) => {
    const key = row !== null && typeof row === 'object' && !Array.isArray(row) ? keyOf(row) : row;
    if (typeof key !== 'string') {
      fail(CODES.INPUT_INVALID, `${field} rows must expose a string ordering key`, { field });
    }
    return key;
  });
  for (let index = 1; index < keys.length; index += 1) {
    if (compareCodePoints(keys[index - 1], keys[index]) >= 0) {
      fail(CODES.INPUT_INVALID, `${field} must be strictly sorted and unique`, { field, index });
    }
  }
}

// The exact-tuple identity of a revision ref: which subject, which revision, which bytes.
// Ordering and uniqueness read the same tuple, so a duplicate cannot be sorted into a position
// where the uniqueness check no longer sees it.
function refTupleKey(ref) {
  if (ref === null || typeof ref !== 'object' || Array.isArray(ref)) return undefined;
  const tuple = [ref.entity_id, ref.revision_id, ref.content_id];
  return tuple.every((part) => typeof part === 'string') ? tuple.join('\u001f') : undefined;
}

/**
 * Returns a stably sorted copy of rows whose order carries no caller meaning.
 *
 * Duplicates are kept rather than collapsed: a repeated key is a contradiction the sorted-unique
 * validators must still see, and dropping one side here would decide between two records that
 * nothing at this layer has the authority to choose between.
 */
function sortByKey(rows, keyOf, field) {
  if (!Array.isArray(rows)) fail(CODES.INPUT_INVALID, `${field} must be an explicit array`, { field });
  const keyed = rows.map((row) => {
    const key = keyOf(row);
    if (typeof key !== 'string') {
      fail(CODES.INPUT_INVALID, `${field} rows must expose a string ordering key`, { field });
    }
    return { key, row };
  });
  keyed.sort((left, right) => compareCodePoints(left.key, right.key));
  return keyed.map((entry) => entry.row);
}

function arrayOrderRules(value) {
  const rules = {};
  const visit = (row, path = '') => {
    if (Array.isArray(row)) {
      rules[path] = 'insertion_ordered';
      for (const child of row) visit(child, `${path}[]`);
    } else if (row !== null && typeof row === 'object') {
      for (const [key, child] of Object.entries(row)) visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(value);
  return rules;
}

function canonicalDigest(domain, value) {
  let canonical;
  try {
    canonical = canonicalise(value, arrayOrderRules(value));
  } catch {
    // The canonical layer names the offending path and echoes the rejected value back in its
    // detail. Neither belongs in an AX/SE refusal, so every canonical failure collapses into
    // one fixed code and message that carry no caller content.
    fail(CODES.INPUT_INVALID, 'assessment material is not canonically serialisable');
  }
  return sha256Hex(`${domain}\n${canonical}`);
}

function digestFromRef(ref) {
  return SHA256_CONTENT_ID.exec(ref.content_id)?.[1] ?? null;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function validatePolicy(policy, policyRevision) {
  assertExactKeys(policy, POLICY_FIELDS, [], 'policy');
  if (policy.schema_version !== POLICY_SCHEMA || policyRevision !== AX_SE_POLICY_REVISION) {
    fail(CODES.INPUT_INVALID, 'the input must use the frozen AX/SE policy revision');
  }
  assertExactRef(policy.policy_ref, 'policy.policy_ref');
  if (!Array.isArray(policy.stages) || policy.stages.length === 0) {
    fail(CODES.INPUT_INVALID, 'policy.stages must contain at least one stage');
  }
  const requirementIds = new Set();
  const stageCodes = new Set();
  let priorSequence = -1;
  for (const stage of policy.stages) {
    assertExactKeys(stage, STAGE_FIELDS, [], 'policy stage');
    if (!STAGE_CODE.has(stage.stage_code) || typeof stage.stage_label !== 'string') {
      fail(CODES.INPUT_INVALID, 'stage code or label is invalid', { field: 'policy.stage_code' });
    }
    if (stageCodes.has(stage.stage_code)) {
      fail(CODES.INPUT_INVALID, 'stage codes must be lifecycle-unique', { field: 'policy.stage_code' });
    }
    stageCodes.add(stage.stage_code);
    if (!Number.isSafeInteger(stage.sequence) || stage.sequence <= priorSequence) {
      fail(CODES.INPUT_INVALID, 'stage sequence must be strictly increasing');
    }
    priorSequence = stage.sequence;
    if (!Array.isArray(stage.requirements) || stage.requirements.length === 0) {
      fail(CODES.INPUT_INVALID, 'each stage must own at least one requirement', { field: 'policy.requirements' });
    }
    assertSortedUnique(stage.requirements, (row) => row.requirement_id, 'stage requirements');
    for (const requirement of stage.requirements) {
      assertExactKeys(requirement, REQUIREMENT_FIELDS, [], 'stage requirement');
      for (const [field, value] of [
        ['requirement_id', requirement.requirement_id],
        ['requirement_kind', requirement.requirement_kind],
        ['required_capability', requirement.required_capability],
      ]) assertToken(value, field);
      if (requirementIds.has(requirement.requirement_id)) {
        fail(CODES.INPUT_INVALID, 'requirement ids must be lifecycle-unique');
      }
      requirementIds.add(requirement.requirement_id);
      assertExactRef(requirement.requirement_ref, 'requirement_ref');
      if (!AUTHORITY_FAMILY.has(requirement.authority_family)
          || ![true, false, 'unknown'].includes(requirement.applicability)) {
        fail(CODES.INPUT_INVALID, 'requirement authority or applicability is invalid');
      }
      assertCanonicalInstant(requirement.valid_at, 'requirement.valid_at');
      assertCanonicalInstant(requirement.known_at, 'requirement.known_at');
      assertKnownAtNotBeforeValidAt(requirement.valid_at, requirement.known_at, CODES.INPUT_INVALID, 'requirement');
    }
    if (stage.requirements.every((requirement) => requirement.applicability === false)) {
      fail(CODES.INPUT_INVALID,
        'each stage must retain at least one applicable or unresolved requirement',
        { field: 'policy.requirements' });
    }
  }
  const material = {
    schema_version: policy.schema_version,
    policy_revision: policyRevision,
    stages: policy.stages,
  };
  if (digestFromRef(policy.policy_ref) !== canonicalDigest(AX_SE_POLICY_REVISION, material)) {
    fail(CODES.POLICY_HASH_MISMATCH, 'policy_ref does not bind the exact supplied policy material');
  }
  return requirementIds;
}

function validateEvidenceRefs(refs, field, { required = false } = {}) {
  if (!Array.isArray(refs) || (required && refs.length === 0)) {
    fail(required ? CODES.EVIDENCE_REQUIRED : CODES.INPUT_INVALID,
      `${field} must be an explicit${required ? ' non-empty' : ''} array`);
  }
  for (const ref of refs) assertExactRef(ref, field);
  assertSortedUnique(refs, refTupleKey, field);
}

function validateConflictClaims(claims, observation) {
  if (claims === undefined) return null;
  // Only something that was actually read can disagree with itself. A confirmed absence or an
  // unmade observation carrying claims is a contradiction in the input, so it fails closed here
  // rather than being resolved into whichever gap type the comparison happens to reach first.
  if (observation.presence_state !== PRESENCE.PRESENT) {
    fail(CODES.CONFLICT_INVALID,
      'only a present observation may carry source claims; an absent or unmade observation fails closed',
      { field: 'observation.presence_state' });
  }
  if (!Array.isArray(claims) || claims.length < 2) {
    fail(CODES.CONFLICT_INVALID, 'a conflict record requires at least two complete claims');
  }
  assertSortedUnique(claims, (claim) => claim.claim_id, 'conflict_claims');
  for (const claim of claims) {
    assertExactKeys(claim, CLAIM_FIELDS, [], 'conflict claim');
    assertToken(claim.claim_id, 'claim_id');
    if (!AUTHORITY_FAMILY.has(claim.authority_family)) {
      fail(CODES.CONFLICT_INVALID, 'conflict authority family is unregistered');
    }
    assertExactRef(claim.source_revision_ref, 'source_revision_ref');
    assertToken(claim.lineage_ref, 'lineage_ref');
    assertToken(claim.asserted_value, 'asserted_value');
    // Exactly the three applicability values. "unknown" is not a weaker yes and anything else
    // is not a fourth state: an unrecognised value would otherwise reach precedence resolution
    // and could hand the win to a source that was never established to apply.
    if (![true, false, 'unknown'].includes(claim.applicability)) {
      fail(CODES.CONFLICT_INVALID, 'claim applicability must be exactly true, false, or "unknown"',
        { field: 'applicability' });
    }
    assertCanonicalInstant(claim.valid_at, 'claim.valid_at');
    assertCanonicalInstant(claim.known_at, 'claim.known_at');
    assertKnownAtNotBeforeValidAt(claim.valid_at, claim.known_at, CODES.CONFLICT_INVALID, 'conflict claim');
  }
  try {
    return recordSourceConflict(claims);
  } catch {
    fail(CODES.CONFLICT_INVALID, 'source conflict validation failed without exposing claim content');
  }
}

function validateSnapshot(snapshot, policy, requirementIds) {
  assertExactKeys(snapshot, SNAPSHOT_FIELDS, [], 'snapshot');
  if (snapshot.schema_version !== SNAPSHOT_SCHEMA) fail(CODES.INPUT_INVALID, 'snapshot schema is unsupported');
  assertExactRef(snapshot.project_snapshot_ref, 'snapshot.project_snapshot_ref');
  assertExactRef(snapshot.policy_ref, 'snapshot.policy_ref');
  if (!sameExactRef(snapshot.policy_ref, policy.policy_ref)) {
    fail(CODES.POLICY_BINDING_MISMATCH, 'snapshot policy ref must exactly match the assessed policy ref');
  }
  if (!Array.isArray(snapshot.observations) || !Array.isArray(snapshot.risks)) {
    fail(CODES.INPUT_INVALID, 'snapshot observations and risks must be explicit arrays');
  }
  assertSortedUnique(snapshot.observations, (row) => row.requirement_id, 'snapshot observations');
  for (const observation of snapshot.observations) {
    assertExactKeys(observation, OBSERVATION_REQUIRED_FIELDS, OBSERVATION_OPTIONAL_FIELDS, 'observation');
    assertToken(observation.requirement_id, 'observation.requirement_id');
    assertToken(observation.observation_attempt_ref, 'observation_attempt_ref');
    if (!requirementIds.has(observation.requirement_id)
        || !Object.values(PRESENCE).includes(observation.presence_state)) {
      fail(CODES.INPUT_INVALID, 'observation is not bound to one policy requirement');
    }
    assertExactRef(observation.artifact_revision_ref, 'artifact_revision_ref');
    assertCanonicalInstant(observation.valid_at, 'observation.valid_at');
    assertCanonicalInstant(observation.known_at, 'observation.known_at');
    assertKnownAtNotBeforeValidAt(observation.valid_at, observation.known_at, CODES.INPUT_INVALID, 'observation');
    validateEvidenceRefs(observation.evidence_refs, 'observation.evidence_refs', {
      required: observation.presence_state !== PRESENCE.UNKNOWN,
    });
    validateConflictClaims(observation.conflict_claims, observation);
  }

  const stageCodes = new Set(policy.stages.map((stage) => stage.stage_code));
  assertSortedUnique(snapshot.risks, (row) => row.risk_id, 'snapshot risks');
  for (const risk of snapshot.risks) {
    assertExactKeys(risk, RISK_FIELDS, [], 'risk');
    assertToken(risk.risk_id, 'risk_id');
    assertToken(risk.required_capability, 'risk.required_capability');
    assertExactRef(risk.risk_ref, 'risk.risk_ref');
    if (!stageCodes.has(risk.stage_code) || !['open', 'closed'].includes(risk.state)
        || !Object.hasOwn(RISK_SEVERITY, risk.severity)) {
      fail(CODES.INPUT_INVALID, 'risk state, severity, or stage binding is invalid');
    }
    validateEvidenceRefs(risk.evidence_refs, 'risk.evidence_refs', { required: true });
  }

  const material = {
    schema_version: snapshot.schema_version,
    policy_ref: snapshot.policy_ref,
    observations: snapshot.observations,
    risks: snapshot.risks,
  };
  if (digestFromRef(snapshot.project_snapshot_ref) !== canonicalDigest(SNAPSHOT_HASH_DOMAIN, material)) {
    fail(CODES.SNAPSHOT_HASH_MISMATCH, 'project_snapshot_ref does not bind the supplied snapshot material');
  }
}

function validateRoles(roles) {
  if (!Array.isArray(roles)) fail(CODES.INPUT_INVALID, 'roles must be an explicit array');
  assertSortedUnique(roles, (role) => role.role_id, 'roles');
  for (const role of roles) {
    assertExactKeys(role, ROLE_FIELDS, [], 'role');
    assertToken(role.role_id, 'role_id');
    if (!['available', 'unavailable'].includes(role.availability_state)
        || !Array.isArray(role.capabilities) || role.capabilities.length === 0) {
      fail(CODES.INPUT_INVALID, 'role availability or capabilities are invalid');
    }
    for (const capability of role.capabilities) assertToken(capability, 'capability');
    assertSortedUnique(role.capabilities, (capability) => capability, 'role.capabilities');
  }
}

function sanitizeConflict(record) {
  return {
    claim_count: record.claim_count,
    governing_authority_family: record.governing_authority_family,
    retained_claim_refs: record.retained_claims.map((claim) => ({
      claim_id: claim.claim_id,
      authority_family: claim.authority_family,
      source_revision_ref: claim.source_revision_ref,
      lineage_ref: claim.lineage_ref,
      applicability: claim.applicability,
      valid_at: claim.valid_at,
      known_at: claim.known_at,
    })),
    sides_dropped: record.sides_dropped,
  };
}

function issueHandle(projectBindingRef, material) {
  // Issues are project-scoped and intentionally stable across objective views of that project.
  return candidateHandle(canonicalDigest(`${AX_SE_POLICY_REVISION}.issue`, {
    project_binding_ref: projectBindingRef,
    ...material,
  }));
}

function gapKey(gapType) {
  const key = GAP_KEY[gapType];
  if (key === undefined) fail(CODES.INPUT_INVALID, 'the comparison returned an unmapped gap type');
  return key;
}

function requirementApplicabilityIssue(stage, requirement, projectBindingRef) {
  const material = {
    issue_kind: 'unknown',
    stage_code: stage.stage_code,
    subject_id: requirement.requirement_id,
    reason_code: 'requirement_applicability_unknown',
    required_capability: requirement.required_capability,
    evidence_refs: [requirement.requirement_ref],
  };
  return {
    issue_handle: issueHandle(projectBindingRef, material),
    ...material,
    evidence_claim_ceiling: assertEvidenceCeiling('unknown'),
  };
}

function requirementIssue(stage, requirement, observation, projectBindingRef) {
  if (requirement.applicability === false) {
    return { countKey: 'not_applicable', issue: null };
  }
  if (requirement.applicability === 'unknown') {
    return {
      countKey: 'unknown',
      issue: requirementApplicabilityIssue(stage, requirement, projectBindingRef),
    };
  }
  const expected = {
    element_id: `exp_${requirement.requirement_id}`,
    axis: AXIS.EXPECTED,
    requirement_ref: requirement.requirement_ref,
    authority_family: requirement.authority_family,
    applicability: requirement.applicability,
    valid_at: requirement.valid_at,
    known_at: requirement.known_at,
  };
  const conflictRecord = observation?.conflict_claims
    ? validateConflictClaims(observation.conflict_claims, observation)
    : null;
  const observed = observation ? {
    element_id: `obs_${requirement.requirement_id}`,
    axis: AXIS.OBSERVED,
    artifact_revision_ref: observation.artifact_revision_ref,
    presence_state: observation.presence_state,
    valid_at: observation.valid_at,
    known_at: observation.known_at,
  } : undefined;
  const gap = compareStates({ expected, observed, conflicts: conflictRecord !== null });
  // The comparison answers presence before it answers disagreement, so a retained conflict that
  // came back as any other gap type would be silently relabelled — a confirmed absence reported
  // as `absence_confirmed` while still carrying two disagreeing sides. That coupling is refused
  // here as well as at validation, so neither side of it can be relaxed alone.
  if (conflictRecord !== null && gap.gap_type !== GAP_TYPE.CONFLICT) {
    fail(CODES.CONFLICT_INVALID, 'a retained source conflict must not be reported as another gap type',
      { field: 'observation.conflict_claims' });
  }
  const kind = gapKey(gap.gap_type);
  if (kind === 'satisfied') return { countKey: kind, issue: null };
  const reasonCode = observation === undefined
    ? 'observation_not_available'
    : {
      [GAP_TYPE.MISSING]: 'absence_confirmed',
      [GAP_TYPE.UNKNOWN]: 'observation_inconclusive',
      [GAP_TYPE.CONFLICT]: 'source_claims_disagree',
    }[gap.gap_type];
  const evidenceClaimCeiling = assertEvidenceCeiling({
    missing: 'source_referenced',
    unknown: 'unknown',
    conflict: 'contradicted',
  }[kind]);
  const material = {
    issue_kind: kind,
    stage_code: stage.stage_code,
    subject_id: requirement.requirement_id,
    reason_code: reasonCode,
    required_capability: requirement.required_capability,
    evidence_refs: observation?.evidence_refs ?? [],
    ...(conflictRecord ? { source_conflict: sanitizeConflict(conflictRecord) } : {}),
  };
  return {
    countKey: kind,
    issue: {
      issue_handle: issueHandle(projectBindingRef, material),
      ...material,
      evidence_claim_ceiling: evidenceClaimCeiling,
      ...(observation ? { observation_attempt_ref: observation.observation_attempt_ref } : {}),
    },
  };
}

function riskIssue(risk, projectBindingRef) {
  const material = {
    issue_kind: 'risk',
    stage_code: risk.stage_code,
    subject_id: risk.risk_id,
    reason_code: 'open_risk_observed',
    severity: risk.severity,
    required_capability: risk.required_capability,
    evidence_refs: risk.evidence_refs,
    risk_ref: risk.risk_ref,
  };
  return {
    issue_handle: issueHandle(projectBindingRef, material),
    ...material,
    evidence_claim_ceiling: assertEvidenceCeiling('source_referenced'),
  };
}

function roleCandidate(requiredCapability, roles) {
  const eligible = roles.filter((role) => role.availability_state === 'available'
    && role.capabilities.includes(requiredCapability));
  if (eligible.length === 1) {
    return {
      state: 'candidate',
      role_id: eligible[0].role_id,
      required_capability: requiredCapability,
      assignment_made: false,
    };
  }
  if (eligible.length === 0) {
    return {
      reason_code: 'capability_unmapped',
      required_capability: requiredCapability,
      state: 'HOLD',
    };
  }
  return {
    eligible_role_ids: eligible.map((role) => role.role_id),
    reason_code: 'capability_ambiguous',
    required_capability: requiredCapability,
    state: 'HOLD',
  };
}

const MISSION_CONTRACT = Object.freeze({
  conflict: Object.freeze({
    mission_kind: 'resolve_source_conflict',
    done: Object.freeze([
      'both_conflict_sides_retained',
      'authorized_precedence_decision_recorded',
      'stage_reassessment_completed',
    ]),
    hold: Object.freeze([
      'source_side_unavailable',
      'authority_applicability_unknown',
      'authorized_decision_missing',
    ]),
  }),
  risk: Object.freeze({
    mission_kind: 'disposition_open_risk',
    done: Object.freeze([
      'risk_disposition_evidence_accepted',
      'residual_risk_state_recorded',
      'stage_reassessment_completed',
    ]),
    hold: Object.freeze([
      'risk_evidence_stale',
      'risk_owner_decision_required',
      'risk_authority_unknown',
    ]),
  }),
  missing: Object.freeze({
    mission_kind: 'close_confirmed_gap',
    done: Object.freeze([
      'required_artifact_evidence_accepted',
      'requirement_reobserved_present',
      'stage_reassessment_completed',
    ]),
    hold: Object.freeze([
      'source_access_unavailable',
      'artifact_authority_unknown',
      'review_evidence_missing',
    ]),
  }),
  unknown: Object.freeze({
    mission_kind: 'acquire_requirement_evidence',
    done: Object.freeze([
      'observation_attempt_completed',
      'exact_revision_evidence_recorded',
      'stage_reassessment_completed',
    ]),
    hold: Object.freeze([
      'observation_blocked',
      'source_revision_unknown',
      'access_authority_unavailable',
    ]),
  }),
});

function issueSortKey(issue) {
  const rank = ISSUE_RANK[issue.issue_kind];
  if (rank === undefined) fail(CODES.INPUT_INVALID, 'an issue kind is not orderable');
  const severity = issue.issue_kind === 'risk' ? String(RISK_SEVERITY[issue.severity]) : '0';
  return `${rank}\u001f${severity}\u001f${issue.subject_id}\u001f${issue.issue_handle}`;
}

function missionCandidate(issue, roles, rank) {
  const contract = MISSION_CONTRACT[issue.issue_kind];
  const role = roleCandidate(issue.required_capability, roles);
  const material = {
    issue_handle: issue.issue_handle,
    mission_kind: contract.mission_kind,
    role_candidate: role,
    policy_revision: AX_SE_POLICY_REVISION,
  };
  return {
    mission_candidate_handle: candidateHandle(canonicalDigest(`${AX_SE_POLICY_REVISION}.mission`, material)),
    rank,
    mission_kind: contract.mission_kind,
    stage_code: issue.stage_code,
    subject_id: issue.subject_id,
    issue_handle: issue.issue_handle,
    evidence_refs: issue.evidence_refs,
    evidence_claim_ceiling: issue.evidence_claim_ceiling,
    role_candidate: role,
    done_conditions: [...contract.done],
    hold_conditions: [...contract.hold],
    ...(issue.source_conflict ? { source_conflict: issue.source_conflict } : {}),
    candidate_only: true,
    task_intent_created: false,
    erp_delta: 0,
  };
}

function buildStageAssessments(input) {
  const observedByRequirement = new Map(input.snapshot.observations.map((row) => [row.requirement_id, row]));
  const risksByStage = new Map(input.policy.stages.map((stage) => [stage.stage_code, []]));
  for (const risk of input.snapshot.risks) {
    if (risk.state === 'open') risksByStage.get(risk.stage_code).push(risk);
  }

  return input.policy.stages.map((stage) => {
    const counts = { conflict: 0, missing: 0, not_applicable: 0, satisfied: 0, unknown: 0 };
    const issues = [];
    for (const requirement of stage.requirements) {
      const { countKey, issue } = requirementIssue(
        stage,
        requirement,
        observedByRequirement.get(requirement.requirement_id),
        input.project_binding_ref,
      );
      counts[countKey] += 1;
      if (issue) issues.push(issue);
    }
    for (const risk of risksByStage.get(stage.stage_code)) {
      issues.push(riskIssue(risk, input.project_binding_ref));
    }
    return {
      stage_code: stage.stage_code,
      stage_label: stage.stage_label,
      sequence: stage.sequence,
      requirement_counts: counts,
      open_risk_count: risksByStage.get(stage.stage_code).length,
      issues,
    };
  });
}

/**
 * Returns a deterministic, deeply frozen assessment candidate from one exact input packet.
 * The caller owns all actual file access, context acceptance, assignment, TaskDriver, and ERP
 * effects; this function owns only bounded comparison and candidate projection.
 */
export function assessAxSeProject(input) {
  const packet = snapshotPlainData(input);
  assertExactKeys(packet, ROOT_FIELDS, [], 'assessment input');
  if (packet.schema_version !== AX_SE_INPUT_SCHEMA || packet.policy_revision !== AX_SE_POLICY_REVISION) {
    fail(CODES.INPUT_INVALID, 'assessment input schema or policy revision is unsupported');
  }
  assertExactRef(packet.project_binding_ref, 'project_binding_ref');
  assertExactRef(packet.objective_ref, 'objective_ref');
  const requirementIds = validatePolicy(packet.policy, packet.policy_revision);
  validateSnapshot(packet.snapshot, packet.policy, requirementIds);
  validateRoles(packet.roles);

  const inputFingerprint = canonicalDigest(INPUT_HASH_DOMAIN, packet);
  const stages = buildStageAssessments(packet);
  const current = stages.find((stage) => stage.issues.length > 0) ?? stages.at(-1);
  const orderedIssues = [...current.issues]
    .sort((left, right) => compareCodePoints(issueSortKey(left), issueSortKey(right)));
  const eligibleCount = orderedIssues.length;
  const selected = orderedIssues.slice(0, 3);
  const missions = selected.map((issue, index) => missionCandidate(issue, packet.roles, index + 1));
  const hasUnknown = current.requirement_counts.unknown > 0;
  const hasIssue = orderedIssues.length > 0;
  const assessmentState = hasUnknown ? 'UNKNOWN' : hasIssue ? 'HOLD' : 'READY_FOR_OWNER_REVIEW';
  const evidenceClaimCeiling = assertEvidenceCeiling(
    hasUnknown ? 'unknown' : orderedIssues.some((issue) => issue.issue_kind === 'conflict')
      ? 'contradicted' : 'source_referenced',
  );

  const result = {
    schema_version: AX_SE_ASSESSMENT_SCHEMA,
    policy_revision: AX_SE_POLICY_REVISION,
    assessment_handle: candidateHandle(inputFingerprint),
    input_fingerprint_sha256: inputFingerprint,
    project_binding_ref: packet.project_binding_ref,
    objective_ref: packet.objective_ref,
    policy_ref: packet.policy.policy_ref,
    project_snapshot_ref: packet.snapshot.project_snapshot_ref,
    assessment_state: assessmentState,
    evidence_claim_ceiling: evidenceClaimCeiling,
    current_stage: {
      stage_code: current.stage_code,
      stage_label: current.stage_label,
      floor_status: hasIssue ? 'blocked' : 'active',
      assessment_resolution: assessmentState,
      requirement_counts: current.requirement_counts,
      open_risk_count: current.open_risk_count,
    },
    issues: orderedIssues,
    next_mission_candidates: missions,
    candidate_truncation: {
      eligible_count: eligibleCount,
      emitted_count: missions.length,
      omitted_count: eligibleCount - missions.length,
      maximum: 3,
    },
    authority: {
      stage_cleared: false,
      owner_decision_made: false,
      person_assigned: false,
      task_intent_created: false,
    },
    gates: {
      stage_clear_allowed: false,
      taskdriver_activation_allowed: false,
      erp_write_allowed: false,
      canon_promotion_allowed: false,
    },
    effects: {
      erp_writes: 0,
      filesystem_writes: 0,
      model_calls: 0,
      network_calls: 0,
      taskdriver_activated: false,
    },
  };
  return deepFreeze(result);
}

/**
 * Binds one already source-bound context packet into the exact input `assessAxSeProject` reads.
 *
 * The builder normalises only the orders that carry no caller meaning and computes the one value
 * the caller may not assert: the snapshot content id. It never repairs, dedupes, infers a missing
 * fact, or reaches a file, ERP surface, network, or model.
 */
export function buildAxSeAssessmentInput(request) {
  // One pass over the whole argument graph before any semantic read, so a Proxy, accessor, custom
  // prototype, cycle, alias, or payload-bearing field is refused before anything trusts it.
  const safe = snapshotPlainData(request);
  assertExactKeys(safe, REQUEST_FIELDS, [], 'assessment input request');
  const { contextPacket, policy, roles: suppliedRoles, expectedProjectBindingRef } = safe;

  assertExactKeys(contextPacket, CONTEXT_PACKET_FIELDS, [], 'context packet');
  if (contextPacket.schema_version !== AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA) {
    fail(CODES.INPUT_INVALID, 'the context packet schema is unsupported');
  }
  assertExactRef(contextPacket.project_binding_ref, 'context packet project_binding_ref');
  assertExactRef(contextPacket.objective_ref, 'context packet objective_ref');
  assertExactRef(contextPacket.policy_ref, 'context packet policy_ref');
  assertExactRef(expectedProjectBindingRef, 'expected project binding ref');
  // A packet bound to another project is refused without naming either side: a rejected
  // identifier must not travel back to the caller inside the error it caused.
  if (!sameExactRef(contextPacket.project_binding_ref, expectedProjectBindingRef)) {
    fail(CODES.PROJECT_BINDING_MISMATCH,
      'the context packet is bound to a different exact project revision than the caller expects');
  }

  // The policy arrives already source-bound, so it is validated exactly as supplied and is never
  // reordered or repaired into agreement with its own ref.
  const requirementIds = validatePolicy(policy, AX_SE_POLICY_REVISION);
  if (!sameExactRef(contextPacket.policy_ref, policy.policy_ref)) {
    fail(CODES.POLICY_BINDING_MISMATCH,
      'the context packet policy ref must exactly match the assessed policy ref');
  }

  // The snapshot content id is this builder's own conclusion about the material it assembles
  // below, so a caller-supplied hash is refused even when it happens to be the right one.
  const identity = contextPacket.project_snapshot_identity;
  assertExactKeys(identity, SNAPSHOT_IDENTITY_FIELDS, [], 'project snapshot identity');
  assertToken(identity.entity_id, 'project_snapshot_identity.entity_id');
  assertToken(identity.revision_id, 'project_snapshot_identity.revision_id');

  // Only unordered data is sorted. Every value, omission, and unknown state is carried through
  // untouched, so a requirement the packet never observed stays unobserved rather than becoming
  // a confirmed absence.
  const observations = sortByKey(contextPacket.observations, (row) => row?.requirement_id, 'observations');
  for (const row of observations) {
    if (Array.isArray(row.evidence_refs)) {
      row.evidence_refs = sortByKey(row.evidence_refs, refTupleKey, 'observation.evidence_refs');
    }
    if (Array.isArray(row.conflict_claims)) {
      row.conflict_claims = sortByKey(row.conflict_claims, (claim) => claim?.claim_id, 'conflict_claims');
    }
  }
  const risks = sortByKey(contextPacket.risks, (row) => row?.risk_id, 'risks');
  for (const row of risks) {
    if (Array.isArray(row.evidence_refs)) {
      row.evidence_refs = sortByKey(row.evidence_refs, refTupleKey, 'risk.evidence_refs');
    }
  }
  const roles = sortByKey(suppliedRoles, (row) => row?.role_id, 'roles');
  for (const row of roles) {
    if (Array.isArray(row.capabilities)) {
      row.capabilities = sortByKey(row.capabilities, (capability) => capability, 'role.capabilities');
    }
  }

  const material = {
    schema_version: SNAPSHOT_SCHEMA,
    policy_ref: contextPacket.policy_ref,
    observations,
    risks,
  };
  const input = {
    schema_version: AX_SE_INPUT_SCHEMA,
    policy_revision: AX_SE_POLICY_REVISION,
    project_binding_ref: contextPacket.project_binding_ref,
    objective_ref: contextPacket.objective_ref,
    policy,
    snapshot: {
      schema_version: material.schema_version,
      project_snapshot_ref: {
        entity_id: identity.entity_id,
        revision_id: identity.revision_id,
        content_id: `sha256:${canonicalDigest(SNAPSHOT_HASH_DOMAIN, material)}`,
        content_hash_alg: 'sha256',
      },
      policy_ref: material.policy_ref,
      observations: material.observations,
      risks: material.risks,
    },
    roles,
  };
  validateSnapshot(input.snapshot, policy, requirementIds);
  validateRoles(input.roles);
  return deepFreeze(input);
}

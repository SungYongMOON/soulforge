// Requirement coverage projection — R1 of
// `docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md`.
//
// One call takes plain requirement / need / observation / risk / stage data plus the two
// query cutoffs and returns one deep frozen coverage projection with a payload free
// receipt, or fails closed with a coded error. It is the §5.3 pseudocode and nothing
// else: it reads no file, opens no socket, calls no model, reads no clock, keeps no state
// between calls, and has no command line. The cutoffs are supplied by the caller for
// exactly that reason: a projection that read the host clock could not be replayed, so
// the two query instants are input and never observed here.
//
// This module is a projection, not a writer. It never appends to, corrects, or deletes a
// ledger row, and it never produces `cleared` or `boss_clear_candidate`: those need an
// owner decision packet, terminal provenance, and a fresh snapshot (§2.4).
//
// The vocabularies are imported from the Engineering Engine kernel rather than restated,
// so a value renamed there cannot silently diverge here.
import { createHash } from 'node:crypto';

import { canonicalise, compareCodePoints, isCanonicalInstant } from '../engineering_engine/kernel/canonical.mjs';
import { CANONICAL, REF_REQUIRED_FIELDS } from '../engineering_engine/kernel/contract_config.mjs';
import { classifyRef, exactRefIdentityKey, RESOLUTION } from '../engineering_engine/kernel/identity.mjs';
import { AUTHORITY_FAMILIES, APPLICABILITY } from '../engineering_engine/kernel/authority.mjs';
import { PRESENCE } from '../engineering_engine/kernel/custody.mjs';
import { GAP_TYPE } from '../engineering_engine/kernel/snapshot.mjs';

export const REQUIREMENT_COVERAGE_SCHEMA_VERSION = 'soulforge.requirement_coverage.v0';

// Three hash domains. A cell identity, an input binding, and an output binding are
// different claims, so none of them may ever be computed under another's domain.
const CELL_ID_DOMAIN = 'soulforge.requirement_coverage.cell.v0';
const INPUT_DIGEST_DOMAIN = 'soulforge.requirement_coverage.input.v0';
const OUTPUT_DIGEST_DOMAIN = 'soulforge.requirement_coverage.output.v0';

// The canonicalisation revision that the cell identity is bound to (§5.3 step 2). It is
// the kernel's, not a second one invented here.
const CANONICALIZATION_VERSION = CANONICAL.version;

// The exact-ref identity key joins its four fields with a unit separator (kernel
// `exactRefIdentityKey`). A `requirement_key` therefore legitimately carries U+001F and is
// the one input string exempt from the control-character guard below.
const KEY_SEPARATOR = '\u001f';

export const ERROR_CODES = Object.freeze({
  REQUEST_INVALID: 'REQUIREMENT_COVERAGE_REQUEST_INVALID',
  INPUT_UNSAFE: 'REQUIREMENT_COVERAGE_INPUT_UNSAFE',
  DUPLICATE_ID: 'REQUIREMENT_COVERAGE_DUPLICATE_ID',
  REFERENCE_INVALID: 'AX_SE_REFERENCE_INVALID',
  STAGE_BINDING_INVALID: 'REQUIREMENT_COVERAGE_STAGE_BINDING_INVALID',
  NEED_DECLARATION_AMBIGUOUS: 'REQUIREMENT_COVERAGE_NEED_DECLARATION_AMBIGUOUS',
});

export class RequirementCoverageError extends Error {
  constructor(code, message, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'RequirementCoverageError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail = {}) => {
  throw new RequirementCoverageError(code, message, detail);
};

// ---------------------------------------------------------------- declared shapes

const ROOT_FIELDS = Object.freeze(['requirements', 'needs', 'observations', 'risks', 'stages', 'cutoffs']);
const CUTOFF_FIELDS = Object.freeze(['valid_at', 'known_at']);

// `valid_to` is optional on the two replayed record kinds because §5.3 step 0 closes the
// validity interval with it. Everything else is §2.1 verbatim.
const REQUIREMENT_FIELDS = Object.freeze([
  'requirement_id', 'requirement_ref', 'requirement_kind', 'normative_force',
  'authority_family', 'applicability', 'stage_code', 'valid_at', 'known_at',
]);
const REQUIREMENT_OPTIONAL_FIELDS = Object.freeze(['supersedes_ref', 'valid_to']);
const NEED_FIELDS = Object.freeze([
  'need_id', 'requirement_ref', 'needed_artifact_type_id', 'needed_relation', 'policy_ref',
]);
const OBSERVATION_FIELDS = Object.freeze([
  'observation_id', 'requirement_key', 'artifact_type_id', 'relation', 'presence_state',
  'observation_attempt_ref', 'artifact_revision_ref', 'covered_requirement_revision_id',
  'evidence_refs', 'valid_at', 'known_at',
]);
const OBSERVATION_OPTIONAL_FIELDS = Object.freeze(['supersedes_ref', 'valid_to']);
const RISK_FIELDS = Object.freeze(['risk_id', 'stage_code', 'state', 'severity']);
const STAGE_FIELDS = Object.freeze(['stage_code', 'sequence', 'entry_criteria', 'success_criteria']);
const CRITERION_FIELDS = Object.freeze(['criterion_id', 'needed_artifact_type_id']);

const NORMATIVE_FORCE = Object.freeze(['must', 'should', 'may', 'informational']);
const NEEDED_RELATION = Object.freeze(['covers', 'verifies']);
const RISK_STATES = Object.freeze(['open', 'closed']);
const RISK_SEVERITIES = Object.freeze(['critical', 'high', 'medium', 'low']);
const AUTHORITY_FAMILY_KEYS = new Set(AUTHORITY_FAMILIES.map((row) => row.key));
const APPLICABILITY_VALUES = new Set(Object.values(APPLICABILITY));
const PRESENCE_VALUES = new Set(Object.values(PRESENCE));

// Bounds belong to this seam, not to the request: a caller that could raise them could
// turn one call into an unbounded one.
const MAX = Object.freeze({ string: 512, array: 20000, evidence: 128, sequence: 1000000 });

// This projection travels into public-safe surfaces, so the input may not carry a private
// plane path, a host-local path, or a credential. This is a boundary guard, not a secret
// scanner: it refuses the shapes that would make the output unpublishable.
const FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
]);

// PC-11.4: every array that can appear in canonical input declares its ordering. The
// input arrays are insertion ordered because the receipt binds the input as supplied; the
// output arrays are insertion ordered because this module has already sorted them.
const INPUT_ARRAY_ORDER_RULES = Object.freeze({
  requirements: 'insertion_ordered',
  needs: 'insertion_ordered',
  observations: 'insertion_ordered',
  'observations[].evidence_refs': 'insertion_ordered',
  risks: 'insertion_ordered',
  stages: 'insertion_ordered',
  'stages[].entry_criteria': 'insertion_ordered',
  'stages[].success_criteria': 'insertion_ordered',
});
const OUTPUT_ARRAY_ORDER_RULES = Object.freeze({
  cells: 'insertion_ordered',
  'cells[].observation_ids': 'insertion_ordered',
  requirement_states: 'insertion_ordered',
  orphans: 'insertion_ordered',
  stage_readiness: 'insertion_ordered',
  'stage_readiness[].entry_unmet_criterion_ids': 'insertion_ordered',
});

// §5.2 reason codes. `coverage_revision_stale` is the RTM `outdated` case, folded to
// `gap_unknown` on purpose: an artifact covering an older revision neither confirms nor
// denies the current one, so folding it to missing invents a gap and folding it to
// satisfied invents assurance.
const REASON = Object.freeze({
  NEEDS_UNDECLARED: 'needs_undeclared',
  NOT_ATTEMPTED: 'coverage_not_attempted',
  DISAGREEMENT: 'observation_disagreement',
  ABSENCE_CONFIRMED: 'absence_confirmed',
  INCONCLUSIVE: 'observation_inconclusive',
  REVISION_STALE: 'coverage_revision_stale',
  REF_FLOATING: 'artifact_ref_floating',
  REF_MALFORMED: 'artifact_ref_malformed',
  BYTES_UNRESOLVABLE: 'artifact_bytes_unresolvable',
});

// The order in which a present observation's defects are reported. `firstMark` in §5.3 is
// resolved against this table rather than against arrival order, so the reported reason
// does not depend on how the caller happened to sort its observations.
const MARK_ORDER = Object.freeze([
  REASON.REVISION_STALE, REASON.REF_FLOATING, REASON.REF_MALFORMED, REASON.BYTES_UNRESOLVABLE,
]);

const MARK_BY_RESOLUTION = Object.freeze({
  [RESOLUTION.FLOATING]: REASON.REF_FLOATING,
  [RESOLUTION.MALFORMED]: REASON.REF_MALFORMED,
  [RESOLUTION.UNKNOWN]: REASON.BYTES_UNRESOLVABLE,
  [RESOLUTION.MISSING]: REASON.BYTES_UNRESOLVABLE,
});

// §5.3 step 5. Worst first: a conflict must never be averaged away by a sibling cell that
// happens to be satisfied.
const STATE_RANK = Object.freeze({
  [GAP_TYPE.CONFLICT]: 0,
  [GAP_TYPE.UNKNOWN]: 1,
  [GAP_TYPE.MISSING]: 2,
  [GAP_TYPE.SATISFIED]: 3,
});

const NOT_APPLICABLE = 'not_applicable';

export const ASSESSMENT = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  HOLD: 'HOLD',
  READY: 'READY_FOR_OWNER_REVIEW',
});

// ---------------------------------------------------------------- primitive guards

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

function assertPlainObject(value, where) {
  if (!isPlainObject(value)) fail(ERROR_CODES.REQUEST_INVALID, 'value must be a plain object', { where });
}

function assertExactKeys(value, required, optional, where) {
  assertPlainObject(value, where);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(ERROR_CODES.REQUEST_INVALID, 'unexpected field', { where, field: key });
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(ERROR_CODES.REQUEST_INVALID, 'required field is missing', { where, field: key });
  }
}

function assertSafeString(value, where) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX.string
      || value.normalize(CANONICAL.unicodeNormalization) !== value
      || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(ERROR_CODES.INPUT_UNSAFE, 'strings must be bounded non-empty NFC text without control characters', { where });
  }
  if (FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
    fail(ERROR_CODES.INPUT_UNSAFE, 'private plane paths, host-local paths, and credential shapes are forbidden', { where });
  }
  return value;
}

function assertEnum(value, allowed, where) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    fail(ERROR_CODES.REQUEST_INVALID, `value must be one of ${allowed.join(', ')}`, { where });
  }
  return value;
}

function assertInstant(value, where) {
  if (!isCanonicalInstant(value)) {
    fail(ERROR_CODES.REQUEST_INVALID, 'value must be a canonical instant with three fractional digits', { where });
  }
  return value;
}

function assertArray(value, where) {
  if (!Array.isArray(value) || value.length > MAX.array) {
    fail(ERROR_CODES.REQUEST_INVALID, 'value must be an explicit array within the declared bound', { where });
  }
  return value;
}

// A ref whose four fields are all present and safe. Used wherever §5.3 requires an exact
// revision: a floating or malformed ref is a defect, not an identifier, so it is refused
// rather than downgraded.
function assertResolvableRef(ref, where) {
  assertPlainObject(ref, where);
  for (const key of Object.keys(ref)) {
    if (!REF_REQUIRED_FIELDS.includes(key)) fail(ERROR_CODES.REQUEST_INVALID, 'unexpected ref field', { where, field: key });
  }
  for (const field of REF_REQUIRED_FIELDS) {
    if (Object.hasOwn(ref, field)) assertSafeString(ref[field], `${where}.${field}`);
  }
  const resolution = classifyRef(ref, { bytesAvailable: true });
  if (resolution !== RESOLUTION.RESOLVABLE) {
    fail(ERROR_CODES.REFERENCE_INVALID, 'an exact revision ref is required; a ref naming no revision is a defect, not "latest"',
      { where, resolution });
  }
  return ref;
}

// The observation's artifact ref is deliberately *not* required to be resolvable: §5.3
// step 3 classifies it and marks the observation, because a broken artifact ref makes the
// coverage claim unusable without making the observation itself disappear.
function assertRefShape(ref, where) {
  assertPlainObject(ref, where);
  for (const key of Object.keys(ref)) {
    if (!REF_REQUIRED_FIELDS.includes(key)) fail(ERROR_CODES.REQUEST_INVALID, 'unexpected ref field', { where, field: key });
  }
  for (const field of REF_REQUIRED_FIELDS) {
    if (Object.hasOwn(ref, field)) assertSafeString(ref[field], `${where}.${field}`);
  }
  return ref;
}

/**
 * The requirement key of an exact revision ref, as §5.3 step 1 defines it.
 *
 * Exported so a caller can build an observation's `requirement_key` without having to know
 * how the kernel joins the four fields.
 */
export function requirementKeyFromRef(ref, where = 'requirement_ref') {
  assertResolvableRef(ref, where);
  const key = exactRefIdentityKey(ref);
  if (key === null) {
    fail(ERROR_CODES.REFERENCE_INVALID, 'ref does not resolve to an exact identity key', { where });
  }
  return key;
}

// A `requirement_key` arrives as a string rather than as a ref, so it is checked against
// the shape the kernel produces instead of against the generic string guard.
function assertRequirementKey(value, where) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX.string
      || value.normalize(CANONICAL.unicodeNormalization) !== value) {
    fail(ERROR_CODES.INPUT_UNSAFE, 'requirement_key must be bounded non-empty NFC text', { where });
  }
  const segments = value.split(KEY_SEPARATOR);
  if (segments.length !== REF_REQUIRED_FIELDS.length
      || segments.some((segment) => segment.length === 0)
      || segments[REF_REQUIRED_FIELDS.indexOf('content_hash_alg')] !== CANONICAL.hashAlgorithm) {
    fail(ERROR_CODES.REFERENCE_INVALID, 'requirement_key must be the four field exact ref identity key', { where });
  }
  for (const segment of segments) assertSafeString(segment, where);
  return value;
}

// ---------------------------------------------------------------- digests

// Length prefixed so that no field's content can be read as a separator. Joining on a
// character would make two different tuples collide as soon as one field contained it —
// and `requirement_key` contains the unit separator by construction.
function domainDigest(domain, parts) {
  const body = parts.map((part) => `${part.length}:${part}`).join('|');
  return createHash(CANONICAL.hashAlgorithm).update(`${domain}|${body}`, 'utf8').digest('hex');
}

function canonicalDigest(domain, value, arrayOrderRules) {
  return createHash(CANONICAL.hashAlgorithm)
    .update(`${domain}|${canonicalise(value, arrayOrderRules)}`, 'utf8')
    .digest('hex');
}

// ---------------------------------------------------------------- input validation

function validateCutoffs(cutoffs) {
  assertExactKeys(cutoffs, CUTOFF_FIELDS, [], 'cutoffs');
  assertInstant(cutoffs.valid_at, 'cutoffs.valid_at');
  assertInstant(cutoffs.known_at, 'cutoffs.known_at');
  return { valid_at: cutoffs.valid_at, known_at: cutoffs.known_at };
}

// The two bitemporal stamps are independent axes and are deliberately not ordered against
// each other: a baseline can be recorded before it takes effect, so requiring
// `known_at >= valid_at` would refuse a legitimate future-effective requirement.
function validateRecordTimes(record, where) {
  assertInstant(record.valid_at, `${where}.valid_at`);
  assertInstant(record.known_at, `${where}.known_at`);
  if (Object.hasOwn(record, 'valid_to')) {
    assertInstant(record.valid_to, `${where}.valid_to`);
    if (record.valid_to <= record.valid_at) {
      fail(ERROR_CODES.REQUEST_INVALID, 'valid_to must close the interval after valid_at', { where });
    }
  }
}

function validateSupersedesRef(record, idField, where) {
  if (!Object.hasOwn(record, 'supersedes_ref')) return;
  assertSafeString(record.supersedes_ref, `${where}.supersedes_ref`);
  if (record.supersedes_ref === record[idField]) {
    fail(ERROR_CODES.REQUEST_INVALID, 'a record cannot supersede itself', { where });
  }
}

function assertUniqueId(seen, id, where) {
  if (seen.has(id)) fail(ERROR_CODES.DUPLICATE_ID, 'record identifier is declared twice', { where, id });
  seen.add(id);
}

function validateInput(input) {
  assertExactKeys(input, ROOT_FIELDS, [], 'input');
  const cutoffs = validateCutoffs(input.cutoffs);

  for (const field of ['requirements', 'needs', 'observations', 'risks', 'stages']) {
    assertArray(input[field], `input.${field}`);
  }

  // Stages first: the requirement and risk stage bindings are checked against them.
  const stageCodes = new Set();
  let previousSequence = null;
  for (const stage of input.stages) {
    assertExactKeys(stage, STAGE_FIELDS, [], 'stage');
    assertSafeString(stage.stage_code, 'stage.stage_code');
    assertUniqueId(stageCodes, stage.stage_code, 'stage.stage_code');
    if (!Number.isSafeInteger(stage.sequence) || stage.sequence < 0 || stage.sequence > MAX.sequence) {
      fail(ERROR_CODES.REQUEST_INVALID, 'stage sequence must be a bounded non-negative integer', { stage_code: stage.stage_code });
    }
    if (previousSequence !== null && stage.sequence <= previousSequence) {
      fail(ERROR_CODES.REQUEST_INVALID, 'stages must be supplied in strictly increasing sequence order', { stage_code: stage.stage_code });
    }
    previousSequence = stage.sequence;
    for (const field of ['entry_criteria', 'success_criteria']) {
      assertArray(stage[field], `stage.${field}`);
      const criterionIds = new Set();
      for (const criterion of stage[field]) {
        assertExactKeys(criterion, CRITERION_FIELDS, [], `stage.${field}`);
        assertSafeString(criterion.criterion_id, `stage.${field}.criterion_id`);
        assertSafeString(criterion.needed_artifact_type_id, `stage.${field}.needed_artifact_type_id`);
        assertUniqueId(criterionIds, criterion.criterion_id, `stage.${field}.criterion_id`);
      }
    }
  }

  const requirementIds = new Set();
  for (const requirement of input.requirements) {
    assertExactKeys(requirement, REQUIREMENT_FIELDS, REQUIREMENT_OPTIONAL_FIELDS, 'requirement');
    assertSafeString(requirement.requirement_id, 'requirement.requirement_id');
    assertUniqueId(requirementIds, requirement.requirement_id, 'requirement.requirement_id');
    assertResolvableRef(requirement.requirement_ref, 'requirement.requirement_ref');
    assertSafeString(requirement.requirement_kind, 'requirement.requirement_kind');
    assertEnum(requirement.normative_force, NORMATIVE_FORCE, 'requirement.normative_force');
    if (!AUTHORITY_FAMILY_KEYS.has(requirement.authority_family)) {
      fail(ERROR_CODES.REQUEST_INVALID, 'authority_family must be a registered family key', { requirement_id: requirement.requirement_id });
    }
    if (!APPLICABILITY_VALUES.has(requirement.applicability)) {
      fail(ERROR_CODES.REQUEST_INVALID, 'applicability must be true, false, or "unknown"', { requirement_id: requirement.requirement_id });
    }
    assertSafeString(requirement.stage_code, 'requirement.stage_code');
    if (!stageCodes.has(requirement.stage_code)) {
      fail(ERROR_CODES.STAGE_BINDING_INVALID, 'requirement stage_code is not a declared stage', { requirement_id: requirement.requirement_id });
    }
    validateRecordTimes(requirement, 'requirement');
    validateSupersedesRef(requirement, 'requirement_id', 'requirement');
  }

  const needIds = new Set();
  for (const need of input.needs) {
    assertExactKeys(need, NEED_FIELDS, [], 'need');
    assertSafeString(need.need_id, 'need.need_id');
    assertUniqueId(needIds, need.need_id, 'need.need_id');
    assertResolvableRef(need.requirement_ref, 'need.requirement_ref');
    assertSafeString(need.needed_artifact_type_id, 'need.needed_artifact_type_id');
    assertEnum(need.needed_relation, NEEDED_RELATION, 'need.needed_relation');
    assertResolvableRef(need.policy_ref, 'need.policy_ref');
  }

  const observationIds = new Set();
  for (const observation of input.observations) {
    assertExactKeys(observation, OBSERVATION_FIELDS, OBSERVATION_OPTIONAL_FIELDS, 'observation');
    assertSafeString(observation.observation_id, 'observation.observation_id');
    assertUniqueId(observationIds, observation.observation_id, 'observation.observation_id');
    assertRequirementKey(observation.requirement_key, 'observation.requirement_key');
    assertSafeString(observation.artifact_type_id, 'observation.artifact_type_id');
    assertEnum(observation.relation, NEEDED_RELATION, 'observation.relation');
    if (!PRESENCE_VALUES.has(observation.presence_state)) {
      fail(ERROR_CODES.REQUEST_INVALID, 'presence_state must be present, unknown, or absence_confirmed',
        { observation_id: observation.observation_id });
    }
    assertSafeString(observation.observation_attempt_ref, 'observation.observation_attempt_ref');
    assertRefShape(observation.artifact_revision_ref, 'observation.artifact_revision_ref');
    assertSafeString(observation.covered_requirement_revision_id, 'observation.covered_requirement_revision_id');
    assertArray(observation.evidence_refs, 'observation.evidence_refs');
    if (observation.evidence_refs.length > MAX.evidence) {
      fail(ERROR_CODES.REQUEST_INVALID, 'evidence_refs exceeds the declared bound', { observation_id: observation.observation_id });
    }
    // A claim that something is present, or positively absent, has to carry what was
    // looked at. Only an inconclusive attempt may carry nothing.
    if (observation.presence_state !== PRESENCE.UNKNOWN && observation.evidence_refs.length === 0) {
      fail(ERROR_CODES.REQUEST_INVALID, 'a present or absence_confirmed observation must carry evidence',
        { observation_id: observation.observation_id });
    }
    for (const ref of observation.evidence_refs) assertResolvableRef(ref, 'observation.evidence_refs[]');
    validateRecordTimes(observation, 'observation');
    validateSupersedesRef(observation, 'observation_id', 'observation');
  }

  const riskIds = new Set();
  for (const risk of input.risks) {
    assertExactKeys(risk, RISK_FIELDS, [], 'risk');
    assertSafeString(risk.risk_id, 'risk.risk_id');
    assertUniqueId(riskIds, risk.risk_id, 'risk.risk_id');
    assertSafeString(risk.stage_code, 'risk.stage_code');
    if (!stageCodes.has(risk.stage_code)) {
      fail(ERROR_CODES.STAGE_BINDING_INVALID, 'risk stage_code is not a declared stage', { risk_id: risk.risk_id });
    }
    assertEnum(risk.state, RISK_STATES, 'risk.state');
    assertEnum(risk.severity, RISK_SEVERITIES, 'risk.severity');
  }

  return cutoffs;
}

// ---------------------------------------------------------------- 0. ledger replay

/**
 * §5.3 step 0. Reads the supplied rows and returns the live set at the two cutoffs.
 *
 * Instants compare as strings because a canonical instant is fixed width UTC.
 *
 * Supersession is applied as a second pass over the rows that survived the cutoff, rather
 * than as a pop during a single ordered walk. The two agree on a normal chain, and the
 * second pass additionally cannot depend on the order records arrive in. A correction that
 * is not yet known at the query's `known_at` is simply not in `rows`, so the record it
 * supersedes correctly stays live — that is the whole point of the known_at axis.
 */
function replay(records, cutoffs, idField, logicalKeyOf) {
  const rows = records.filter((record) => record.known_at <= cutoffs.known_at
    && record.valid_at <= cutoffs.valid_at
    && (!Object.hasOwn(record, 'valid_to') || cutoffs.valid_at < record.valid_to));

  const sorted = [...rows].sort((a, b) => compareCodePoints(logicalKeyOf(a), logicalKeyOf(b))
    || compareCodePoints(a.known_at, b.known_at)
    || compareCodePoints(a[idField], b[idField]));

  const live = new Map();
  for (const record of sorted) live.set(record[idField], record);
  // Mutual supersession is a contradictory ledger; dropping both sides is the fail-closed
  // reading, and self-supersession is already refused at validation.
  for (const record of sorted) {
    if (Object.hasOwn(record, 'supersedes_ref')) live.delete(record.supersedes_ref);
  }
  return [...live.values()];
}

// ---------------------------------------------------------------- 2/3. cells

function markPresentObservation(observation, requirementRevisionId) {
  const marks = [];
  if (observation.covered_requirement_revision_id !== requirementRevisionId) {
    marks.push(REASON.REVISION_STALE);
  }
  const resolution = classifyRef(observation.artifact_revision_ref, { bytesAvailable: true });
  if (resolution !== RESOLUTION.RESOLVABLE) marks.push(MARK_BY_RESOLUTION[resolution]);
  return marks;
}

/**
 * §5.3 step 3. Conflict is decided before anything else, so two sources that disagree can
 * never be collapsed into either an absence or a coverage claim.
 */
function cellState(observations, requirementRevisionId) {
  if (observations.length === 0) return { state: GAP_TYPE.UNKNOWN, reason: REASON.NOT_ATTEMPTED };

  const hasPresent = observations.some((o) => o.presence_state === PRESENCE.PRESENT);
  const hasAbsence = observations.some((o) => o.presence_state === PRESENCE.ABSENCE_CONFIRMED);
  if (hasPresent && hasAbsence) return { state: GAP_TYPE.CONFLICT, reason: REASON.DISAGREEMENT };

  const present = observations.filter((o) => o.presence_state === PRESENCE.PRESENT);
  const marks = new Set();
  let fresh = 0;
  for (const observation of present) {
    const observationMarks = markPresentObservation(observation, requirementRevisionId);
    if (observationMarks.length === 0) fresh += 1;
    for (const mark of observationMarks) marks.add(mark);
  }

  if (fresh > 0) return { state: GAP_TYPE.SATISFIED, reason: null };
  if (present.length > 0) {
    return { state: GAP_TYPE.UNKNOWN, reason: MARK_ORDER.find((mark) => marks.has(mark)) };
  }
  if (observations.every((o) => o.presence_state === PRESENCE.ABSENCE_CONFIRMED)) {
    return { state: GAP_TYPE.MISSING, reason: REASON.ABSENCE_CONFIRMED };
  }
  return { state: GAP_TYPE.UNKNOWN, reason: REASON.INCONCLUSIVE };
}

const observationBucketKey = (requirementKey, artifactTypeId, relation) => domainDigest(
  `${CELL_ID_DOMAIN}.bucket`, [requirementKey, artifactTypeId, relation],
);

// ---------------------------------------------------------------- output shaping

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

const byCellOrder = (a, b) => compareCodePoints(a.requirement_key, b.requirement_key)
  || compareCodePoints(a.needed_artifact_type_id ?? '', b.needed_artifact_type_id ?? '')
  || compareCodePoints(a.needed_relation ?? '', b.needed_relation ?? '');

// ---------------------------------------------------------------- entry point

/**
 * Computes the requirement coverage projection for one bitemporal query.
 *
 * @param input `{ requirements, needs, observations, risks, stages, cutoffs }` — plain
 *   data only. Nothing is read from disk, a clock, a network, or a model.
 * @returns a deep frozen projection with a payload free receipt.
 * @throws {RequirementCoverageError} on any invalid input. Every refusal is deterministic
 *   and carries a stable `code`.
 */
export function computeRequirementCoverage(input) {
  const cutoffs = validateInput(input);
  const inputDigest = canonicalDigest(INPUT_DIGEST_DOMAIN, input, INPUT_ARRAY_ORDER_RULES);

  // ---- 0. replay
  const liveRequirements = replay(input.requirements, cutoffs, 'requirement_id',
    (record) => record.requirement_ref.entity_id);
  const liveObservations = replay(input.observations, cutoffs, 'observation_id',
    (record) => record.requirement_key);

  // ---- 1. requirement identity
  const requirementsByKey = new Map();
  for (const requirement of liveRequirements) {
    const key = requirementKeyFromRef(requirement.requirement_ref, 'requirement.requirement_ref');
    if (requirementsByKey.has(key)) {
      fail(ERROR_CODES.DUPLICATE_ID, 'two live requirement records name the same exact revision',
        { requirement_id: requirement.requirement_id });
    }
    requirementsByKey.set(key, { key, record: requirement });
  }

  // Needs are declared against an exact requirement revision (§2.1). Resolving them by
  // `requirement_kind` x stage x artifact type is the D38 policy store's job and is not
  // invented here.
  const needsByRequirementKey = new Map();
  for (const need of input.needs) {
    const key = requirementKeyFromRef(need.requirement_ref, 'need.requirement_ref');
    if (!needsByRequirementKey.has(key)) needsByRequirementKey.set(key, []);
    const bucket = needsByRequirementKey.get(key);
    if (bucket.some((row) => row.needed_artifact_type_id === need.needed_artifact_type_id
      && row.needed_relation === need.needed_relation)) {
      fail(ERROR_CODES.NEED_DECLARATION_AMBIGUOUS,
        'the same artifact type and relation is declared twice for one requirement revision', { need_id: need.need_id });
    }
    bucket.push(need);
  }

  const observationsByBucket = new Map();
  for (const observation of liveObservations) {
    const bucket = observationBucketKey(observation.requirement_key, observation.artifact_type_id, observation.relation);
    if (!observationsByBucket.has(bucket)) observationsByBucket.set(bucket, []);
    observationsByBucket.get(bucket).push(observation);
  }

  // ---- 2/3. cells and cell states
  const cells = [];
  const requirementStates = [];
  for (const { key, record } of requirementsByKey.values()) {
    if (record.applicability === APPLICABILITY.NO) {
      requirementStates.push({
        requirement_id: record.requirement_id,
        requirement_key: key,
        stage_code: record.stage_code,
        state: NOT_APPLICABLE,
      });
      continue;
    }

    const needs = needsByRequirementKey.get(key) ?? [];
    const requirementCells = [];
    if (needs.length === 0) {
      requirementCells.push({
        cell_id: domainDigest(CELL_ID_DOMAIN, ['needs_undeclared', key, CANONICALIZATION_VERSION]),
        requirement_id: record.requirement_id,
        requirement_key: key,
        stage_code: record.stage_code,
        state: GAP_TYPE.UNKNOWN,
        reason: REASON.NEEDS_UNDECLARED,
        observation_ids: [],
      });
    } else {
      const orderedNeeds = [...needs].sort((a, b) => compareCodePoints(a.needed_artifact_type_id, b.needed_artifact_type_id)
        || compareCodePoints(a.needed_relation, b.needed_relation));
      for (const need of orderedNeeds) {
        const bucket = observationBucketKey(key, need.needed_artifact_type_id, need.needed_relation);
        const observations = observationsByBucket.get(bucket) ?? [];
        const { state, reason } = cellState(observations, record.requirement_ref.revision_id);
        const cell = {
          cell_id: domainDigest(CELL_ID_DOMAIN, [
            'declared_need', key, need.needed_artifact_type_id, need.needed_relation,
            need.policy_ref.content_id, CANONICALIZATION_VERSION,
          ]),
          requirement_id: record.requirement_id,
          requirement_key: key,
          stage_code: record.stage_code,
          need_id: need.need_id,
          needed_artifact_type_id: need.needed_artifact_type_id,
          needed_relation: need.needed_relation,
          state,
          observation_ids: [...observations].map((o) => o.observation_id).sort(compareCodePoints),
        };
        // `null` is forbidden in canonical input, so an absent reason is an absent key.
        if (reason !== null) cell.reason = reason;
        requirementCells.push(cell);
      }
    }

    // §5.3 step 5: worst first.
    const worst = requirementCells.reduce((a, b) => (STATE_RANK[b.state] < STATE_RANK[a.state] ? b : a));
    requirementStates.push({
      requirement_id: record.requirement_id,
      requirement_key: key,
      stage_code: record.stage_code,
      state: worst.state,
    });
    cells.push(...requirementCells);
  }

  // ---- 4. orphans. An observation naming a requirement outside the replayed baseline is
  // kept and counted; deleting it would erase the only trace of a coverage claim nobody
  // asked for.
  const orphans = liveObservations
    .filter((observation) => !requirementsByKey.has(observation.requirement_key))
    .map((observation) => ({
      observation_id: observation.observation_id,
      requirement_key: observation.requirement_key,
      artifact_type_id: observation.artifact_type_id,
      relation: observation.relation,
      presence_state: observation.presence_state,
      state: GAP_TYPE.UNEXPECTED,
    }))
    .sort((a, b) => compareCodePoints(a.observation_id, b.observation_id));

  cells.sort(byCellOrder);
  requirementStates.sort((a, b) => compareCodePoints(a.requirement_key, b.requirement_key));

  const counts = {
    satisfied: 0, gap_missing: 0, gap_unknown: 0, gap_conflict: 0,
    unexpected_observed: orphans.length, not_applicable: 0,
  };
  for (const row of requirementStates) counts[row.state] += 1;

  // ---- 6. gate readiness
  const presentTypesByStage = new Map();
  for (const stage of input.stages) presentTypesByStage.set(stage.stage_code, new Set());
  for (const observation of liveObservations) {
    if (observation.presence_state !== PRESENCE.PRESENT) continue;
    const requirement = requirementsByKey.get(observation.requirement_key);
    if (requirement === undefined) continue;
    presentTypesByStage.get(requirement.record.stage_code).add(observation.artifact_type_id);
  }

  const stageReadiness = input.stages.map((stage) => {
    const tally = { satisfied: 0, gap_missing: 0, gap_unknown: 0, gap_conflict: 0, not_applicable: 0 };
    for (const row of requirementStates) {
      if (row.stage_code === stage.stage_code) tally[row.state] += 1;
    }
    const openRiskCount = input.risks.filter((risk) => risk.stage_code === stage.stage_code
      && risk.state === 'open').length;
    const presentTypes = presentTypesByStage.get(stage.stage_code);
    const entryUnmet = stage.entry_criteria
      .filter((criterion) => !presentTypes.has(criterion.needed_artifact_type_id))
      .map((criterion) => criterion.criterion_id)
      .sort(compareCodePoints);

    let assessment = ASSESSMENT.READY;
    if (tally.gap_unknown > 0) assessment = ASSESSMENT.UNKNOWN;
    else if (tally.gap_conflict > 0 || tally.gap_missing > 0 || openRiskCount > 0) assessment = ASSESSMENT.HOLD;

    return {
      stage_code: stage.stage_code,
      sequence: stage.sequence,
      assessment,
      // Only `blocked` and `active` are producible here. `cleared` and
      // `boss_clear_candidate` need an owner decision packet and are never minted by a
      // projection (§2.4).
      floor_status: assessment === ASSESSMENT.READY ? 'active' : 'blocked',
      entry_ok: entryUnmet.length === 0,
      entry_unmet_criterion_ids: entryUnmet,
      // Entry and success are stored and reported separately on purpose (§2.4). The
      // success axis is an owner judgement, so this projection counts the declared
      // criteria and does not evaluate them.
      success_criteria_count: stage.success_criteria.length,
      open_risk_count: openRiskCount,
      requirement_counts: tally,
    };
  });

  const body = {
    schema_version: REQUIREMENT_COVERAGE_SCHEMA_VERSION,
    cutoffs,
    cells,
    requirement_states: requirementStates,
    orphans,
    stage_readiness: stageReadiness,
    counts,
  };

  return deepFreeze({
    ...body,
    receipt: {
      input_digest_sha256: inputDigest,
      // Bound over the projection body only: the digest cannot be one of the fields it
      // covers.
      output_digest_sha256: canonicalDigest(OUTPUT_DIGEST_DOMAIN, body, OUTPUT_ARRAY_ORDER_RULES),
      canonicalization_version: CANONICALIZATION_VERSION,
      input_row_counts: {
        requirements: input.requirements.length,
        needs: input.needs.length,
        observations: input.observations.length,
        risks: input.risks.length,
        stages: input.stages.length,
      },
      replayed_row_counts: {
        requirements: liveRequirements.length,
        observations: liveObservations.length,
      },
      deterministic: true,
      claim_ceiling: 'observed',
      effects: {
        files_read: 0,
        files_written: 0,
        network_calls: 0,
        model_calls: 0,
        ledger_writes: 0,
        projection_writes: 0,
        erp_writes: 0,
        task_intents: 0,
      },
    },
  });
}

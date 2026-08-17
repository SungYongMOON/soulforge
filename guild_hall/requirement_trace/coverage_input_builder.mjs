// Requirement coverage input builder — the R2 preparation slice of
// `docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md` §8.
//
// One call turns three things a project already has — a deterministic requirement-id index
// of one contract document revision, a Needs policy, and artifact-level presence
// observations — into the exact input `computeRequirementCoverage` accepts, plus a manifest
// that carries everything R1 refuses to look at and a payload-free receipt.
//
// It is a reader and a shaper, nothing else. It appends no ledger row, writes no file,
// reads no clock, opens no socket, calls no model, and keeps no state between calls. Every
// instant in the output came from the request, which is what makes a build replayable.
//
// Two owner decisions are expressed here as structure rather than as prose.
//
// D37 (decided 2026-08-17): an automatically extracted requirement id is an `observed`
// candidate and nothing more. Every admitted row is reported with
// `confirmation_state: 'observed_candidate'`, the receipt's `claim_ceiling` is `observed`,
// and no path in this module promotes a candidate to a confirmed requirement. Confirmation
// is a human act and this module cannot perform it.
//
// D38 (decided 2026-08-17): Needs are declared by extending the existing
// `stage_expected_artifact_policy`, not by inventing a second policy store. The policy this
// builder reads therefore names the base policy revision it extends (`extends.policy_ref`),
// and the minted `policy_ref` on every emitted need binds the extension bytes so a coverage
// cell can be traced back to the declaration that produced it.
//
// D40 stays open, so nothing here merges anything. A requirement id that appears on more
// than one row holds *every* one of those rows: picking a winner is exactly the judgement
// D40 has not been made about. Separator variants of one family are likewise distinct ids,
// never folded together.
//
// Fail-closed is the default in both directions. A row this module cannot fully explain is
// held rather than admitted, and a need or observation it cannot bind to an admitted
// requirement is refused rather than emitted — because R1 silently ignores a need whose
// requirement it cannot find, and a silently ignored need is an invisible gap.
//
// ---------------------------------------------------------------- minted identity
//
// Nothing is random and nothing is drawn from a clock, so the same request always mints the
// same identifiers. Each kind has its own hash domain; a value computed under one domain is
// never valid under another.
//
//   requirement entity    soulforge.requirement_trace.candidate_requirement.entity.v0
//                         over [document_ref.entity_id, requirement_id]
//                         — the subject persists across document revisions
//   requirement revision  soulforge.requirement_trace.candidate_requirement.revision.v0
//                         over [document_ref.revision_id, row.block_text_sha256]
//   requirement content   row.block_text_sha256 verbatim; the block digest already is the
//                         byte identity of the requirement text, so re-hashing it would
//                         only add a second name for the same bytes
//   need                  soulforge.requirement_trace.need.v0
//                         over [requirement_key, needed_artifact_type_id, needed_relation]
//   fan-out observation   soulforge.requirement_trace.observation.v0
//                         over [source observation_id, requirement_key, artifact_type_id,
//                         relation]
//   policy entity         soulforge.requirement_trace.needs_policy.entity.v0
//   policy revision       soulforge.requirement_trace.needs_policy.revision.v0
//
// The policy content id is the canonical digest of the policy without its identity block,
// so relabelling a revision cannot change which bytes a coverage cell rests on.
import { createHash } from 'node:crypto';

import { canonicalise, compareCodePoints, isCanonicalInstant } from '../engineering_engine/kernel/canonical.mjs';
import { CANONICAL, REF_REQUIRED_FIELDS } from '../engineering_engine/kernel/contract_config.mjs';
import { classifyRef, RESOLUTION } from '../engineering_engine/kernel/identity.mjs';
import { AUTHORITY_FAMILIES, APPLICABILITY } from '../engineering_engine/kernel/authority.mjs';
import { PRESENCE } from '../engineering_engine/kernel/custody.mjs';
import { computeRequirementCoverage, requirementKeyFromRef } from './requirement_coverage.mjs';

export const COVERAGE_INPUT_BUILDER_SCHEMA_VERSION = 'soulforge.requirement_coverage_input_builder.v0';
export const REQUIREMENT_NEEDS_POLICY_SCHEMA_VERSION = 'soulforge.requirement_needs_policy.v0';

// The producer this builder reads. Restated rather than imported: that module opens files,
// so importing it would put a filesystem seam inside a pure module's import graph.
const REQUIREMENT_INDEX_SCHEMA_VERSION = 'soulforge.project_pdf_requirement_index.v0';

// D38: the policy this extension is an extension *of*.
const BASE_POLICY_SCHEMA_VERSION = 'se_stage_expected_artifact_policy_v0';

export const BUILDER_ERROR_CODES = Object.freeze({
  REQUEST_INVALID: 'REQUIREMENT_COVERAGE_BUILDER_REQUEST_INVALID',
  DOCUMENT_BINDING_MISMATCH: 'REQUIREMENT_COVERAGE_BUILDER_DOCUMENT_BINDING_MISMATCH',
  POLICY_INVALID: 'REQUIREMENT_COVERAGE_BUILDER_POLICY_INVALID',
  STAGE_MISMATCH: 'REQUIREMENT_COVERAGE_BUILDER_STAGE_MISMATCH',
  NEED_DECLARATION_AMBIGUOUS: 'REQUIREMENT_COVERAGE_BUILDER_NEED_DECLARATION_AMBIGUOUS',
  BINDING_INCOMPLETE: 'REQUIREMENT_COVERAGE_BUILDER_BINDING_INCOMPLETE',
});

export class CoverageInputBuilderError extends Error {
  constructor(code, message, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'CoverageInputBuilderError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail = {}) => {
  throw new CoverageInputBuilderError(code, message, detail);
};

/**
 * Why a row did not become a requirement.
 *
 * Every hold is reported with the row it came from. A row that is neither admitted nor held
 * would be a requirement that vanished, which is the one outcome this seam exists to make
 * impossible.
 */
export const HOLD_REASONS = Object.freeze({
  DUPLICATE_REQUIREMENT_ID: 'duplicate_requirement_id_conflict',
  FAMILY_UNPARSEABLE: 'family_unparseable',
  DEVICE_CODE_UNMAPPED: 'device_code_unmapped',
  FUNCTION_CODE_UNMAPPED: 'function_code_unmapped',
  DEVICE_OUT_OF_SCOPE: 'device_out_of_scope',
});

// The order a row's defects are reported in. Resolved against this table rather than
// against evaluation order so the reported reason does not depend on how the checks happen
// to be written. A row can fail more than one of them; it is held either way, and the
// reported reason is the first one in this list that applies.
const HOLD_ORDER = Object.freeze([
  HOLD_REASONS.FAMILY_UNPARSEABLE,
  HOLD_REASONS.DEVICE_CODE_UNMAPPED,
  HOLD_REASONS.DEVICE_OUT_OF_SCOPE,
  HOLD_REASONS.FUNCTION_CODE_UNMAPPED,
  HOLD_REASONS.DUPLICATE_REQUIREMENT_ID,
]);

/**
 * What "the artifact is there" is allowed to mean.
 *
 * The default is the fail-closed one: a file existing says an attempt found something, not
 * that the something covers the requirement, so a present artifact becomes an `unknown`
 * observation and R1 reports `observation_inconclusive`. The owner's current working basis
 * — 파일 있고 없고 — is the other value, and it is opt-in per policy so that reading a
 * coverage sheet always answers "under which rule was this satisfied".
 */
export const PRESENCE_SEMANTICS = Object.freeze({
  INCONCLUSIVE: 'presence_is_inconclusive',
  SATISFIES: 'presence_satisfies_need',
});

// ---------------------------------------------------------------- hash domains

const UUID_DOMAIN = Object.freeze({
  REQUIREMENT_ENTITY: 'soulforge.requirement_trace.candidate_requirement.entity.v0',
  REQUIREMENT_REVISION: 'soulforge.requirement_trace.candidate_requirement.revision.v0',
  NEED: 'soulforge.requirement_trace.need.v0',
  OBSERVATION: 'soulforge.requirement_trace.observation.v0',
  POLICY_ENTITY: 'soulforge.requirement_trace.needs_policy.entity.v0',
  POLICY_REVISION: 'soulforge.requirement_trace.needs_policy.revision.v0',
});

const digestDomain = (name) => `soulforge.requirement_coverage_input_builder.${name}.v0`;

const NEED_ID_PREFIX = 'need:';
const OBSERVATION_ID_PREFIX = 'obs:';
const MINTED_TOKEN_HEX = 24;

// ---------------------------------------------------------------- declared shapes

const REQUEST_FIELDS = Object.freeze([
  'requirement_index', 'document_binding', 'baseline_binding', 'needs_policy',
  'artifact_observations', 'stage_declarations', 'risks', 'cutoffs',
]);
const DOCUMENT_BINDING_FIELDS = Object.freeze(['document_ref', 'valid_at', 'known_at']);
const BASELINE_BINDING_FIELDS = Object.freeze([
  'stage_code', 'authority_family', 'default_normative_force', 'applicability_default',
]);
const CUTOFF_FIELDS = Object.freeze(['valid_at', 'known_at']);

const INDEX_FIELDS = Object.freeze([
  'schema_version', 'profile_id', 'document', 'rows', 'duplicate_ids', 'mention_only_ids', 'row_count',
]);
const INDEX_OPTIONAL_FIELDS = Object.freeze(['mentions_by_id', 'malformed_labels']);
const INDEX_DOCUMENT_FIELDS = Object.freeze(['sha256', 'page_count', 'character_count', 'text_sha256']);
const ROW_FIELDS = Object.freeze([
  'requirement_id', 'id_family', 'section', 'title', 'page_number', 'span', 'tbc', 'tbd',
  'block_char_count', 'block_text_sha256',
]);
const SPAN_FIELDS = Object.freeze(['start', 'end']);
const MALFORMED_LABEL_FIELDS = Object.freeze(['page_number', 'span']);

const POLICY_FIELDS = Object.freeze([
  'schema_version', 'policy_identity', 'policy_status', 'extends', 'family_pattern',
  'device_code_map', 'function_code_map', 'artifact_presence_semantics', 'stages', 'needs',
]);
const POLICY_IDENTITY_FIELDS = Object.freeze(['policy_id', 'revision_label']);
const POLICY_EXTENDS_FIELDS = Object.freeze(['schema_version', 'policy_ref']);
const DEVICE_MAP_FIELDS = Object.freeze(['device_code', 'label', 'in_scope']);
const FUNCTION_MAP_FIELDS = Object.freeze(['function_code', 'requirement_kind', 'label', 'source_locator']);
const SOURCE_LOCATOR_FIELDS = Object.freeze(['section', 'page_number']);
const POLICY_STAGE_FIELDS = Object.freeze(['stage_code', 'sequence']);
const POLICY_NEED_FIELDS = Object.freeze([
  'stage_code', 'device_code', 'function_code', 'needed_artifact_type_id', 'needed_relation',
  'basis', 'confidence',
]);

const ARTIFACT_OBSERVATION_FIELDS = Object.freeze([
  'observation_id', 'artifact_type_id', 'presence_state', 'observation_attempt_ref',
  'artifact_revision_ref', 'covered_document_revision_id', 'evidence_refs', 'valid_at', 'known_at',
]);

const NORMATIVE_FORCE = Object.freeze(['must', 'should', 'may', 'informational']);
const NEEDED_RELATION = Object.freeze(['covers', 'verifies']);
const POLICY_STATUS = Object.freeze(['candidate', 'owner_confirmed']);
const CONFIDENCE = Object.freeze(['high', 'medium', 'low']);
const AUTHORITY_FAMILY_KEYS = new Set(AUTHORITY_FAMILIES.map((row) => row.key));
const PRESENCE_VALUES = new Set(Object.values(PRESENCE));
const PRESENCE_SEMANTICS_VALUES = new Set(Object.values(PRESENCE_SEMANTICS));

// D37: the only confirmation state this module can produce.
const CONFIRMATION_STATE = 'observed_candidate';
const UNBOUND_REASON = 'no_declared_need_for_artifact_type';

// Bounds belong to this seam, not to the request: a caller that could raise them could turn
// one call into an unbounded one. They match R1's, because the output has to survive R1.
const MAX = Object.freeze({ string: 512, array: 20000, evidence: 128, pattern: 256, depth: 12 });

const SHA256_TAGGED = /^sha256:[0-9a-f]{64}$/u;
const DEVICE_GROUP = '(?<device>';
const FUNCTION_GROUP = '(?<function>';

// R1 refuses these shapes on its own input. They are restated here rather than imported —
// R1 does not export the guard — because the manifest never reaches R1, and a manifest is
// exactly the surface that would otherwise carry a private plane path into a public
// artifact.
const FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
]);

// PC-11.4: every array that can appear in a canonicalised value declares its ordering.
const POLICY_ORDER_RULES = Object.freeze({
  device_code_map: 'insertion_ordered',
  function_code_map: 'insertion_ordered',
  stages: 'insertion_ordered',
  needs: 'insertion_ordered',
});
const INDEX_PROJECTION_ORDER_RULES = Object.freeze({
  rows: 'insertion_ordered',
  duplicate_ids: 'insertion_ordered',
  mention_only_ids: 'insertion_ordered',
});
const ARTIFACT_OBSERVATION_ORDER_RULES = Object.freeze({
  '': 'insertion_ordered',
  '[].evidence_refs': 'insertion_ordered',
});
const STAGE_DECLARATION_ORDER_RULES = Object.freeze({
  '': 'insertion_ordered',
  '[].entry_criteria': 'insertion_ordered',
  '[].success_criteria': 'insertion_ordered',
});
const RISK_ORDER_RULES = Object.freeze({ '': 'insertion_ordered' });
const NO_ARRAY_RULES = Object.freeze({});
const COVERAGE_INPUT_ORDER_RULES = Object.freeze({
  requirements: 'insertion_ordered',
  needs: 'insertion_ordered',
  observations: 'insertion_ordered',
  'observations[].evidence_refs': 'insertion_ordered',
  risks: 'insertion_ordered',
  stages: 'insertion_ordered',
  'stages[].entry_criteria': 'insertion_ordered',
  'stages[].success_criteria': 'insertion_ordered',
});
const MANIFEST_ORDER_RULES = Object.freeze({
  requirements: 'insertion_ordered',
  holds: 'insertion_ordered',
  needs_undeclared_by_group: 'insertion_ordered',
  unbound_artifact_observations: 'insertion_ordered',
  fan_out: 'insertion_ordered',
  'not_in_baseline.mention_only_ids': 'insertion_ordered',
  'not_in_baseline.index_declared_duplicate_ids': 'insertion_ordered',
});

// ---------------------------------------------------------------- primitive guards

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

function assertPlainObject(value, where) {
  if (!isPlainObject(value)) fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'value must be a plain object', { where });
}

function assertExactKeys(value, required, optional, where, code = BUILDER_ERROR_CODES.REQUEST_INVALID) {
  assertPlainObject(value, where);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(code, 'unexpected field', { where, field: key });
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(code, 'required field is missing', { where, field: key });
  }
}

function assertSafeString(value, where, code = BUILDER_ERROR_CODES.REQUEST_INVALID) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX.string
      || value.normalize(CANONICAL.unicodeNormalization) !== value
      || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(code, 'strings must be bounded non-empty NFC text without control characters', { where });
  }
  if (FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
    fail(code, 'private plane paths, host-local paths, and credential shapes are forbidden', { where });
  }
  return value;
}

function assertEnum(value, allowed, where, code = BUILDER_ERROR_CODES.REQUEST_INVALID) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    fail(code, `value must be one of ${allowed.join(', ')}`, { where });
  }
  return value;
}

function assertCount(value, where, code = BUILDER_ERROR_CODES.REQUEST_INVALID) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(code, 'value must be a non-negative safe integer', { where });
  }
  return value;
}

function assertBoolean(value, where, code = BUILDER_ERROR_CODES.REQUEST_INVALID) {
  if (typeof value !== 'boolean') fail(code, 'value must be a boolean', { where });
  return value;
}

function assertInstant(value, where) {
  if (!isCanonicalInstant(value)) {
    fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'value must be a canonical instant with three fractional digits', { where });
  }
  return value;
}

function assertArray(value, where, code = BUILDER_ERROR_CODES.REQUEST_INVALID) {
  if (!Array.isArray(value) || value.length > MAX.array) {
    fail(code, 'value must be an explicit array within the declared bound', { where });
  }
  return value;
}

// A ref whose four fields are all present, safe, and name an exact revision. A floating or
// malformed ref is a defect, not an identifier, so it is refused here rather than handed to
// R1 to refuse later — the builder would otherwise have already minted identity around it.
function assertResolvableRef(ref, where, code = BUILDER_ERROR_CODES.REQUEST_INVALID) {
  assertPlainObject(ref, where);
  for (const key of Object.keys(ref)) {
    if (!REF_REQUIRED_FIELDS.includes(key)) fail(code, 'unexpected ref field', { where, field: key });
  }
  for (const field of REF_REQUIRED_FIELDS) {
    if (Object.hasOwn(ref, field)) assertSafeString(ref[field], `${where}.${field}`, code);
  }
  if (classifyRef(ref, { bytesAvailable: true }) !== RESOLUTION.RESOLVABLE) {
    fail(code, 'an exact revision ref is required; a ref naming no revision is a defect, not "latest"', { where });
  }
  return ref;
}

// The observation's artifact ref is deliberately not required to be resolvable: R1 §5.3
// step 3 classifies it and marks the observation, so a broken artifact ref must survive as
// far as R1 rather than being repaired or dropped here.
function assertRefShape(ref, where) {
  assertPlainObject(ref, where);
  for (const key of Object.keys(ref)) {
    if (!REF_REQUIRED_FIELDS.includes(key)) {
      fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'unexpected ref field', { where, field: key });
    }
  }
  for (const field of REF_REQUIRED_FIELDS) {
    if (Object.hasOwn(ref, field)) assertSafeString(ref[field], `${where}.${field}`);
  }
  return ref;
}

/**
 * Walks an arbitrary request subtree and refuses anything that could not be published.
 *
 * Applied before a single identifier is minted, so a request carrying a private plane path
 * fails before anything is emitted rather than after the manifest already holds it. `null`
 * is refused here on purpose: it is forbidden in canonical input, and the two places a
 * `null` legitimately appears — an index row's `section` and `title` — are handled by the
 * index validator, which never walks through this function.
 */
function assertSafeTree(value, where, depth = 0) {
  if (depth > MAX.depth) {
    fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'value nests deeper than the declared bound', { where });
  }
  if (typeof value === 'string') return assertSafeString(value, where);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return assertCount(value, where);
  if (Array.isArray(value)) {
    assertArray(value, where);
    value.forEach((element, index) => assertSafeTree(element, `${where}[${index}]`, depth + 1));
    return value;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      assertSafeString(key, `${where}.<key>`);
      assertSafeTree(value[key], `${where}.${key}`, depth + 1);
    }
    return value;
  }
  return fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'unsupported value in request', { where });
}

// ---------------------------------------------------------------- digests

function sha256Hex(text) {
  return createHash(CANONICAL.hashAlgorithm).update(text, 'utf8').digest('hex');
}

// Domain, NUL, then the parts joined by NUL. No identifier may contain a control character
// (every one of them passed `assertSafeString`), so no two different tuples can join into
// one string.
function domainHex(domain, parts) {
  return sha256Hex(`${domain}\u0000${parts.join('\u0000')}`);
}

/** Layout only: a stable 8-4-4-4-12 hex rendering of a domain separated digest. */
function uuidFromDigest(domain, parts) {
  const hex = domainHex(domain, parts).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const mintedToken = (prefix, domain, parts) => `${prefix}${domainHex(domain, parts).slice(0, MINTED_TOKEN_HEX)}`;

// A digest of a canonical value under one named domain. `canonicalise` raises its own
// contract error class; it is translated here so a caller of this module only ever has to
// catch one error type.
function canonicalDigest(name, value, arrayOrderRules) {
  let canonical;
  try {
    canonical = canonicalise(value, arrayOrderRules);
  } catch (error) {
    return fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'value is not canonicalisable',
      { where: name, contract_code: error?.code ?? null });
  }
  return sha256Hex(`${digestDomain(name)}\n${canonical}`);
}

// ---------------------------------------------------------------- copying and freezing

// Pass-through arrays are copied rather than referenced. Deep freezing a value the caller
// still holds would be a visible mutation of the request, and the request must come back
// untouched.
function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (value !== null && typeof value === 'object') {
    const copy = {};
    for (const key of Object.keys(value)) copy[key] = clonePlain(value[key]);
    return copy;
  }
  return value;
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

// ---------------------------------------------------------------- index validation

/**
 * Validates the requirement index.
 *
 * `title` is the one field deliberately never read for its content. A bracket title is
 * document text, and document text may not reach a public-safe manifest, digest, or
 * identifier. Only whether a title was carried at all is observed, and only so the index
 * digest can distinguish two indexes that differ there.
 */
function validateRequirementIndex(index) {
  assertExactKeys(index, INDEX_FIELDS, INDEX_OPTIONAL_FIELDS, 'requirement_index');
  if (index.schema_version !== REQUIREMENT_INDEX_SCHEMA_VERSION) {
    fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'requirement_index carries an unknown schema version',
      { where: 'requirement_index.schema_version' });
  }
  assertSafeString(index.profile_id, 'requirement_index.profile_id');

  assertExactKeys(index.document, INDEX_DOCUMENT_FIELDS, [], 'requirement_index.document');
  for (const field of ['sha256', 'text_sha256']) {
    assertSafeString(index.document[field], `requirement_index.document.${field}`);
    if (!SHA256_TAGGED.test(index.document[field])) {
      fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'value must be a tagged lowercase sha256 digest',
        { where: `requirement_index.document.${field}` });
    }
  }
  assertCount(index.document.page_count, 'requirement_index.document.page_count');
  assertCount(index.document.character_count, 'requirement_index.document.character_count');

  assertArray(index.rows, 'requirement_index.rows');
  index.rows.forEach((row, rowIndex) => {
    const where = `requirement_index.rows[${rowIndex}]`;
    assertExactKeys(row, ROW_FIELDS, [], where);
    assertSafeString(row.requirement_id, `${where}.requirement_id`);
    // The v0_1 profile is required. Without `id_family` there is nothing to resolve a
    // device and a function code from, and guessing them from the identifier here would
    // duplicate the producer's recognition contract in a second, divergent place.
    assertSafeString(row.id_family, `${where}.id_family`);
    if (row.section !== null) assertSafeString(row.section, `${where}.section`);
    if (row.title !== null && typeof row.title !== 'string') {
      fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'title must be a string or null', { where: `${where}.title` });
    }
    assertCount(row.page_number, `${where}.page_number`);
    assertExactKeys(row.span, SPAN_FIELDS, [], `${where}.span`);
    assertCount(row.span.start, `${where}.span.start`);
    assertCount(row.span.end, `${where}.span.end`);
    if (row.span.end < row.span.start) {
      fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'span must not end before it starts', { where: `${where}.span` });
    }
    assertBoolean(row.tbc, `${where}.tbc`);
    assertBoolean(row.tbd, `${where}.tbd`);
    assertCount(row.block_char_count, `${where}.block_char_count`);
    assertSafeString(row.block_text_sha256, `${where}.block_text_sha256`);
    if (!SHA256_TAGGED.test(row.block_text_sha256)) {
      fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'block_text_sha256 must be a tagged lowercase sha256 digest',
        { where: `${where}.block_text_sha256` });
    }
  });

  for (const field of ['duplicate_ids', 'mention_only_ids']) {
    assertArray(index[field], `requirement_index.${field}`);
    index[field].forEach((id, i) => assertSafeString(id, `requirement_index.${field}[${i}]`));
  }
  if (index.row_count !== index.rows.length) {
    fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'row_count does not agree with the rows supplied',
      { where: 'requirement_index.row_count' });
  }

  if (Object.hasOwn(index, 'mentions_by_id')) {
    assertPlainObject(index.mentions_by_id, 'requirement_index.mentions_by_id');
    for (const [id, pages] of Object.entries(index.mentions_by_id)) {
      assertSafeString(id, 'requirement_index.mentions_by_id.<key>');
      assertArray(pages, `requirement_index.mentions_by_id.${id}`);
      pages.forEach((page, i) => assertCount(page, `requirement_index.mentions_by_id.${id}[${i}]`));
    }
  }
  if (Object.hasOwn(index, 'malformed_labels')) {
    assertArray(index.malformed_labels, 'requirement_index.malformed_labels');
    index.malformed_labels.forEach((label, i) => {
      const where = `requirement_index.malformed_labels[${i}]`;
      assertExactKeys(label, MALFORMED_LABEL_FIELDS, [], where);
      assertCount(label.page_number, `${where}.page_number`);
      assertExactKeys(label.span, SPAN_FIELDS, [], `${where}.span`);
      assertCount(label.span.start, `${where}.span.start`);
      assertCount(label.span.end, `${where}.span.end`);
    });
  }
  return index;
}

/**
 * The digestible projection of the index.
 *
 * Rows are never canonicalised as supplied: `title` may be `null`, which canonical input
 * forbids, and when it is not null it is document text, which a public-safe digest input
 * may not carry. The projection therefore keeps every structural field and reduces the
 * title to whether one was carried.
 */
function indexDigestProjection(index) {
  return {
    schema_version: index.schema_version,
    profile_id: index.profile_id,
    document: { ...index.document },
    row_count: index.row_count,
    rows: index.rows.map((row) => {
      const projected = {
        requirement_id: row.requirement_id,
        id_family: row.id_family,
        title_present: row.title !== null,
        page_number: row.page_number,
        span: { start: row.span.start, end: row.span.end },
        tbc: row.tbc,
        tbd: row.tbd,
        block_char_count: row.block_char_count,
        block_text_sha256: row.block_text_sha256,
      };
      if (row.section !== null) projected.section = row.section;
      return projected;
    }),
    duplicate_ids: [...index.duplicate_ids],
    mention_only_ids: [...index.mention_only_ids],
    mentions_by_id_key_count: Object.keys(index.mentions_by_id ?? {}).length,
    malformed_label_count: (index.malformed_labels ?? []).length,
  };
}

// ---------------------------------------------------------------- policy validation

function validateNeedsPolicy(policy) {
  assertExactKeys(policy, POLICY_FIELDS, [], 'needs_policy', BUILDER_ERROR_CODES.POLICY_INVALID);
  if (policy.schema_version !== REQUIREMENT_NEEDS_POLICY_SCHEMA_VERSION) {
    fail(BUILDER_ERROR_CODES.POLICY_INVALID, 'needs_policy carries an unknown schema version',
      { where: 'needs_policy.schema_version' });
  }
  assertExactKeys(policy.policy_identity, POLICY_IDENTITY_FIELDS, [], 'needs_policy.policy_identity',
    BUILDER_ERROR_CODES.POLICY_INVALID);
  assertSafeString(policy.policy_identity.policy_id, 'needs_policy.policy_identity.policy_id',
    BUILDER_ERROR_CODES.POLICY_INVALID);
  assertSafeString(policy.policy_identity.revision_label, 'needs_policy.policy_identity.revision_label',
    BUILDER_ERROR_CODES.POLICY_INVALID);
  assertEnum(policy.policy_status, POLICY_STATUS, 'needs_policy.policy_status', BUILDER_ERROR_CODES.POLICY_INVALID);

  // D38. The extension has to name the base policy revision it extends, or "this extends
  // the existing policy" is a claim with nothing behind it.
  assertExactKeys(policy.extends, POLICY_EXTENDS_FIELDS, [], 'needs_policy.extends', BUILDER_ERROR_CODES.POLICY_INVALID);
  if (policy.extends.schema_version !== BASE_POLICY_SCHEMA_VERSION) {
    fail(BUILDER_ERROR_CODES.POLICY_INVALID,
      'a needs policy extends the existing stage expected artifact policy and nothing else',
      { where: 'needs_policy.extends.schema_version' });
  }
  assertResolvableRef(policy.extends.policy_ref, 'needs_policy.extends.policy_ref', BUILDER_ERROR_CODES.POLICY_INVALID);

  assertSafeString(policy.family_pattern, 'needs_policy.family_pattern', BUILDER_ERROR_CODES.POLICY_INVALID);
  if (policy.family_pattern.length > MAX.pattern) {
    fail(BUILDER_ERROR_CODES.POLICY_INVALID, 'family_pattern exceeds the declared bound',
      { where: 'needs_policy.family_pattern' });
  }
  if (!policy.family_pattern.includes(DEVICE_GROUP) || !policy.family_pattern.includes(FUNCTION_GROUP)) {
    fail(BUILDER_ERROR_CODES.POLICY_INVALID,
      'family_pattern must declare named groups "device" and "function"; a positional group would make the mapping depend on how the pattern was written',
      { where: 'needs_policy.family_pattern' });
  }
  let pattern;
  try {
    pattern = new RegExp(policy.family_pattern, 'u');
  } catch {
    fail(BUILDER_ERROR_CODES.POLICY_INVALID, 'family_pattern does not compile',
      { where: 'needs_policy.family_pattern' });
  }

  const deviceCodes = new Map();
  assertArray(policy.device_code_map, 'needs_policy.device_code_map', BUILDER_ERROR_CODES.POLICY_INVALID);
  policy.device_code_map.forEach((entry, i) => {
    const where = `needs_policy.device_code_map[${i}]`;
    assertExactKeys(entry, DEVICE_MAP_FIELDS, [], where, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertSafeString(entry.device_code, `${where}.device_code`, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertSafeString(entry.label, `${where}.label`, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertBoolean(entry.in_scope, `${where}.in_scope`, BUILDER_ERROR_CODES.POLICY_INVALID);
    if (deviceCodes.has(entry.device_code)) {
      fail(BUILDER_ERROR_CODES.POLICY_INVALID, 'device_code is declared twice', { where, device_code: entry.device_code });
    }
    deviceCodes.set(entry.device_code, entry);
  });

  const functionCodes = new Map();
  assertArray(policy.function_code_map, 'needs_policy.function_code_map', BUILDER_ERROR_CODES.POLICY_INVALID);
  policy.function_code_map.forEach((entry, i) => {
    const where = `needs_policy.function_code_map[${i}]`;
    assertExactKeys(entry, FUNCTION_MAP_FIELDS, [], where, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertSafeString(entry.function_code, `${where}.function_code`, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertSafeString(entry.requirement_kind, `${where}.requirement_kind`, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertSafeString(entry.label, `${where}.label`, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertExactKeys(entry.source_locator, SOURCE_LOCATOR_FIELDS, [], `${where}.source_locator`,
      BUILDER_ERROR_CODES.POLICY_INVALID);
    assertSafeString(entry.source_locator.section, `${where}.source_locator.section`, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertCount(entry.source_locator.page_number, `${where}.source_locator.page_number`, BUILDER_ERROR_CODES.POLICY_INVALID);
    if (functionCodes.has(entry.function_code)) {
      fail(BUILDER_ERROR_CODES.POLICY_INVALID, 'function_code is declared twice', { where, function_code: entry.function_code });
    }
    functionCodes.set(entry.function_code, entry);
  });

  assertEnum(policy.artifact_presence_semantics, [...PRESENCE_SEMANTICS_VALUES],
    'needs_policy.artifact_presence_semantics', BUILDER_ERROR_CODES.POLICY_INVALID);

  const policyStages = new Set();
  assertArray(policy.stages, 'needs_policy.stages', BUILDER_ERROR_CODES.POLICY_INVALID);
  policy.stages.forEach((entry, i) => {
    const where = `needs_policy.stages[${i}]`;
    assertExactKeys(entry, POLICY_STAGE_FIELDS, [], where, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertSafeString(entry.stage_code, `${where}.stage_code`, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertCount(entry.sequence, `${where}.sequence`, BUILDER_ERROR_CODES.POLICY_INVALID);
    if (policyStages.has(entry.stage_code)) {
      fail(BUILDER_ERROR_CODES.POLICY_INVALID, 'stage_code is declared twice', { where, stage_code: entry.stage_code });
    }
    policyStages.add(entry.stage_code);
  });

  assertArray(policy.needs, 'needs_policy.needs', BUILDER_ERROR_CODES.POLICY_INVALID);
  policy.needs.forEach((entry, i) => {
    const where = `needs_policy.needs[${i}]`;
    assertExactKeys(entry, POLICY_NEED_FIELDS, [], where, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertSafeString(entry.stage_code, `${where}.stage_code`, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertSafeString(entry.device_code, `${where}.device_code`, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertSafeString(entry.function_code, `${where}.function_code`, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertSafeString(entry.needed_artifact_type_id, `${where}.needed_artifact_type_id`, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertEnum(entry.needed_relation, NEEDED_RELATION, `${where}.needed_relation`, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertSafeString(entry.basis, `${where}.basis`, BUILDER_ERROR_CODES.POLICY_INVALID);
    assertEnum(entry.confidence, CONFIDENCE, `${where}.confidence`, BUILDER_ERROR_CODES.POLICY_INVALID);
    if (!policyStages.has(entry.stage_code)) {
      fail(BUILDER_ERROR_CODES.POLICY_INVALID, 'a needs entry names a stage the policy does not declare',
        { where, stage_code: entry.stage_code });
    }
    if (!deviceCodes.has(entry.device_code)) {
      fail(BUILDER_ERROR_CODES.POLICY_INVALID, 'a needs entry names a device code the policy does not map',
        { where, device_code: entry.device_code });
    }
    if (!functionCodes.has(entry.function_code)) {
      fail(BUILDER_ERROR_CODES.POLICY_INVALID, 'a needs entry names a function code the policy does not map',
        { where, function_code: entry.function_code });
    }
  });

  return { pattern, deviceCodes, functionCodes, policyStages };
}

/**
 * The exact ref of the policy bytes.
 *
 * The content id is taken over the policy *without* its identity block, so two revisions
 * that differ only in their label are recognisably the same bytes, and a relabelled policy
 * cannot silently change what a coverage cell rests on.
 */
function mintPolicyRef(policy) {
  const { policy_identity: identity, ...withoutIdentity } = policy;
  let canonical;
  try {
    canonical = canonicalise(withoutIdentity, POLICY_ORDER_RULES);
  } catch (error) {
    return fail(BUILDER_ERROR_CODES.POLICY_INVALID, 'needs_policy is not canonicalisable',
      { where: 'needs_policy', contract_code: error?.code ?? null });
  }
  const contentId = `sha256:${sha256Hex(canonical)}`;
  return {
    entity_id: uuidFromDigest(UUID_DOMAIN.POLICY_ENTITY, [identity.policy_id]),
    revision_id: uuidFromDigest(UUID_DOMAIN.POLICY_REVISION, [identity.policy_id, identity.revision_label, contentId]),
    content_id: contentId,
    content_hash_alg: CANONICAL.hashAlgorithm,
  };
}

// ---------------------------------------------------------------- request validation

function validateRequest(request) {
  assertExactKeys(request, REQUEST_FIELDS, [], 'request');

  // The whole request is swept for unpublishable strings before anything is minted, so a
  // forbidden path fails the call rather than reaching the manifest. The index is swept by
  // its own validator, which is the one place `title` is stepped over.
  validateRequirementIndex(request.requirement_index);
  for (const field of ['document_binding', 'baseline_binding', 'needs_policy', 'artifact_observations',
    'stage_declarations', 'risks', 'cutoffs']) {
    assertSafeTree(request[field], field);
  }

  assertExactKeys(request.document_binding, DOCUMENT_BINDING_FIELDS, [], 'document_binding');
  assertResolvableRef(request.document_binding.document_ref, 'document_binding.document_ref');
  assertInstant(request.document_binding.valid_at, 'document_binding.valid_at');
  assertInstant(request.document_binding.known_at, 'document_binding.known_at');
  if (request.document_binding.document_ref.content_id !== request.requirement_index.document.sha256) {
    fail(BUILDER_ERROR_CODES.DOCUMENT_BINDING_MISMATCH,
      'the bound document revision does not name the bytes the index was read from',
      { where: 'document_binding.document_ref.content_id' });
  }

  assertExactKeys(request.baseline_binding, BASELINE_BINDING_FIELDS, [], 'baseline_binding');
  assertSafeString(request.baseline_binding.stage_code, 'baseline_binding.stage_code');
  if (!AUTHORITY_FAMILY_KEYS.has(request.baseline_binding.authority_family)) {
    fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'authority_family must be a registered family key',
      { where: 'baseline_binding.authority_family' });
  }
  assertEnum(request.baseline_binding.default_normative_force, NORMATIVE_FORCE,
    'baseline_binding.default_normative_force');
  // `false` is deliberately not accepted. Defaulting a whole baseline to "does not apply"
  // would make every requirement in it disappear from coverage without a single gap being
  // reported, and applicability is a per-requirement owner judgement in any case. tbc and
  // tbd rows are flagged in the manifest instead.
  if (request.baseline_binding.applicability_default !== APPLICABILITY.YES
      && request.baseline_binding.applicability_default !== APPLICABILITY.UNKNOWN) {
    fail(BUILDER_ERROR_CODES.REQUEST_INVALID,
      'applicability_default must be stated as true or "unknown"; a default of false would erase coverage rather than report it',
      { where: 'baseline_binding.applicability_default' });
  }

  assertExactKeys(request.cutoffs, CUTOFF_FIELDS, [], 'cutoffs');
  assertInstant(request.cutoffs.valid_at, 'cutoffs.valid_at');
  assertInstant(request.cutoffs.known_at, 'cutoffs.known_at');

  assertArray(request.stage_declarations, 'stage_declarations');
  const declaredStages = new Set();
  request.stage_declarations.forEach((stage, i) => {
    assertPlainObject(stage, `stage_declarations[${i}]`);
    assertSafeString(stage.stage_code, `stage_declarations[${i}].stage_code`);
    declaredStages.add(stage.stage_code);
  });
  assertArray(request.risks, 'risks');

  const policyShape = validateNeedsPolicy(request.needs_policy);
  if (!declaredStages.has(request.baseline_binding.stage_code)) {
    fail(BUILDER_ERROR_CODES.STAGE_MISMATCH, 'the baseline stage is not one of the declared stages',
      { stage_code: request.baseline_binding.stage_code });
  }
  if (!policyShape.policyStages.has(request.baseline_binding.stage_code)) {
    fail(BUILDER_ERROR_CODES.STAGE_MISMATCH, 'the needs policy declares no needs for the baseline stage',
      { stage_code: request.baseline_binding.stage_code });
  }

  const observationIds = new Set();
  assertArray(request.artifact_observations, 'artifact_observations');
  request.artifact_observations.forEach((observation, i) => {
    const where = `artifact_observations[${i}]`;
    assertExactKeys(observation, ARTIFACT_OBSERVATION_FIELDS, [], where);
    assertSafeString(observation.observation_id, `${where}.observation_id`);
    if (observationIds.has(observation.observation_id)) {
      fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'artifact observation identifier is declared twice',
        { where, observation_id: observation.observation_id });
    }
    observationIds.add(observation.observation_id);
    assertSafeString(observation.artifact_type_id, `${where}.artifact_type_id`);
    if (!PRESENCE_VALUES.has(observation.presence_state)) {
      fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'presence_state must be present, unknown, or absence_confirmed', { where });
    }
    assertSafeString(observation.observation_attempt_ref, `${where}.observation_attempt_ref`);
    assertRefShape(observation.artifact_revision_ref, `${where}.artifact_revision_ref`);
    assertSafeString(observation.covered_document_revision_id, `${where}.covered_document_revision_id`);
    assertArray(observation.evidence_refs, `${where}.evidence_refs`);
    if (observation.evidence_refs.length > MAX.evidence) {
      fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'evidence_refs exceeds the declared bound', { where });
    }
    // A claim that something is present, or positively absent, has to carry what was looked
    // at. Only an inconclusive attempt may carry nothing. Checked here as well as in R1,
    // because the builder fans one artifact fact out over many requirements and a defect
    // multiplied by the fan-out is harder to read than the same defect refused once.
    if (observation.presence_state !== PRESENCE.UNKNOWN && observation.evidence_refs.length === 0) {
      fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'a present or absence_confirmed observation must carry evidence', { where });
    }
    observation.evidence_refs.forEach((ref, j) => assertResolvableRef(ref, `${where}.evidence_refs[${j}]`));
    assertInstant(observation.valid_at, `${where}.valid_at`);
    assertInstant(observation.known_at, `${where}.known_at`);
  });

  return policyShape;
}

// ---------------------------------------------------------------- row admission

function admitRows(request, policyShape) {
  const index = request.requirement_index;
  const documentRef = request.document_binding.document_ref;

  // Computed over every row first, and recomputed rather than read off
  // `index.duplicate_ids`: the index's own list is a report, and a builder that trusted a
  // report instead of the rows would admit a duplicate the moment the two disagreed.
  const occurrences = new Map();
  for (const row of index.rows) {
    occurrences.set(row.requirement_id, (occurrences.get(row.requirement_id) ?? 0) + 1);
  }

  const admitted = [];
  const holds = [];
  for (let rowIndex = 0; rowIndex < index.rows.length; rowIndex += 1) {
    const row = index.rows[rowIndex];
    const match = policyShape.pattern.exec(row.id_family);
    const groups = match?.groups ?? {};
    const deviceEntry = groups.device === undefined ? undefined : policyShape.deviceCodes.get(groups.device);
    const functionEntry = groups.function === undefined ? undefined : policyShape.functionCodes.get(groups.function);

    const faults = new Map();
    if (match === null || groups.device === undefined || groups.function === undefined) {
      faults.set(HOLD_REASONS.FAMILY_UNPARSEABLE, 'id_family does not match the declared family pattern');
    } else {
      if (deviceEntry === undefined) {
        faults.set(HOLD_REASONS.DEVICE_CODE_UNMAPPED, `device_code=${groups.device}`);
      } else if (deviceEntry.in_scope !== true) {
        faults.set(HOLD_REASONS.DEVICE_OUT_OF_SCOPE, `device_code=${groups.device}`);
      }
      if (functionEntry === undefined) {
        faults.set(HOLD_REASONS.FUNCTION_CODE_UNMAPPED, `function_code=${groups.function}`);
      }
    }
    if (occurrences.get(row.requirement_id) > 1) {
      faults.set(HOLD_REASONS.DUPLICATE_REQUIREMENT_ID,
        `row_count_for_this_id=${occurrences.get(row.requirement_id)}`);
    }

    if (faults.size > 0) {
      const reason = HOLD_ORDER.find((candidate) => faults.has(candidate));
      holds.push({
        row_index: rowIndex,
        requirement_id: row.requirement_id,
        id_family: row.id_family,
        reason,
        detail: faults.get(reason),
      });
      continue;
    }

    const entityId = uuidFromDigest(UUID_DOMAIN.REQUIREMENT_ENTITY, [documentRef.entity_id, row.requirement_id]);
    const revisionId = uuidFromDigest(UUID_DOMAIN.REQUIREMENT_REVISION, [documentRef.revision_id, row.block_text_sha256]);
    const requirementRef = {
      entity_id: entityId,
      revision_id: revisionId,
      content_id: row.block_text_sha256,
      content_hash_alg: CANONICAL.hashAlgorithm,
    };
    const record = {
      requirement_id: row.requirement_id,
      requirement_ref: requirementRef,
      requirement_kind: functionEntry.requirement_kind,
      normative_force: request.baseline_binding.default_normative_force,
      authority_family: request.baseline_binding.authority_family,
      applicability: request.baseline_binding.applicability_default,
      stage_code: request.baseline_binding.stage_code,
      valid_at: request.document_binding.valid_at,
      known_at: request.document_binding.known_at,
    };
    const manifestRow = {
      requirement_id: row.requirement_id,
      requirement_key: requirementKeyFromRef(requirementRef, 'requirement_ref'),
      id_family: row.id_family,
      device_code: groups.device,
      function_code: groups.function,
      requirement_kind: functionEntry.requirement_kind,
      page_number: row.page_number,
      span: { start: row.span.start, end: row.span.end },
      tbc: row.tbc,
      tbd: row.tbd,
      block_char_count: row.block_char_count,
      // D37. Every admitted row is a candidate and this module has no path that changes it.
      confirmation_state: CONFIRMATION_STATE,
      needs_count: 0,
    };
    // `null` is forbidden in canonical input, so an absent value is an absent key. D40: the
    // separator a family was written with is recorded and never normalised away.
    if (row.section !== null) manifestRow.section = row.section;
    if (typeof groups.sep === 'string') manifestRow.separator_variant = groups.sep;

    admitted.push({ record, manifestRow, deviceCode: groups.device, functionCode: groups.function, row });
  }

  // Two admitted rows can no longer share an identifier — every duplicate was held — so
  // this sort is total and the emitted order is a function of the identifiers alone.
  admitted.sort((a, b) => compareCodePoints(a.record.requirement_id, b.record.requirement_id));
  return { admitted, holds };
}

// ---------------------------------------------------------------- needs expansion

function expandNeeds(request, admitted, policyRef) {
  const stageCode = request.baseline_binding.stage_code;
  const applicable = request.needs_policy.needs.filter((entry) => entry.stage_code === stageCode);

  // Each entry keeps the requirement identifier beside the record so the emitted order can
  // be the declared one — requirement id, then artifact type, then relation. Sorting on the
  // minted entity id instead would order the sheet by a hash, which is stable but says
  // nothing a reader can follow.
  const entries = [];
  const undeclaredByGroup = new Map();
  const neededTypes = new Map();

  for (const candidate of admitted) {
    const matching = applicable.filter((entry) => entry.device_code === candidate.deviceCode
      && entry.function_code === candidate.functionCode);
    if (matching.length === 0) {
      const groupKey = `${candidate.deviceCode}\u001f${candidate.functionCode}`;
      const group = undeclaredByGroup.get(groupKey)
        ?? { device_code: candidate.deviceCode, function_code: candidate.functionCode, requirement_count: 0 };
      group.requirement_count += 1;
      undeclaredByGroup.set(groupKey, group);
      continue;
    }

    const requirementKey = candidate.manifestRow.requirement_key;
    const seen = new Set();
    for (const entry of matching) {
      const pair = `${entry.needed_artifact_type_id}\u001f${entry.needed_relation}`;
      if (seen.has(pair)) {
        // R1 raises the same refusal when it sees the duplicate itself. Raising it here
        // names the policy entry that produced it, which is the thing an owner can fix.
        fail(BUILDER_ERROR_CODES.NEED_DECLARATION_AMBIGUOUS,
          'the policy declares the same artifact type and relation twice for one requirement',
          {
            requirement_id: candidate.record.requirement_id,
            needed_artifact_type_id: entry.needed_artifact_type_id,
            needed_relation: entry.needed_relation,
          });
      }
      seen.add(pair);
      entries.push({
        requirement_id: candidate.record.requirement_id,
        need: {
          need_id: mintedToken(NEED_ID_PREFIX, UUID_DOMAIN.NEED,
            [requirementKey, entry.needed_artifact_type_id, entry.needed_relation]),
          requirement_ref: { ...candidate.record.requirement_ref },
          needed_artifact_type_id: entry.needed_artifact_type_id,
          needed_relation: entry.needed_relation,
          policy_ref: { ...policyRef },
        },
      });
      if (!neededTypes.has(entry.needed_artifact_type_id)) neededTypes.set(entry.needed_artifact_type_id, []);
      neededTypes.get(entry.needed_artifact_type_id).push({
        candidate,
        relation: entry.needed_relation,
        requirementKey,
      });
    }
    candidate.manifestRow.needs_count = seen.size;
  }

  entries.sort((a, b) => compareCodePoints(a.requirement_id, b.requirement_id)
    || compareCodePoints(a.need.needed_artifact_type_id, b.need.needed_artifact_type_id)
    || compareCodePoints(a.need.needed_relation, b.need.needed_relation));
  const needs = entries.map((entry) => entry.need);

  const needsUndeclaredByGroup = [...undeclaredByGroup.values()]
    .sort((a, b) => compareCodePoints(a.device_code, b.device_code)
      || compareCodePoints(a.function_code, b.function_code));

  return { needs, needsUndeclaredByGroup, neededTypes };
}

// ---------------------------------------------------------------- observation fan-out

function fanOutObservations(request, neededTypes) {
  const semantics = request.needs_policy.artifact_presence_semantics;
  const documentRevisionId = request.document_binding.document_ref.revision_id;

  const observations = [];
  const unbound = [];
  const fanOut = [];

  for (const source of request.artifact_observations) {
    const targets = neededTypes.get(source.artifact_type_id) ?? [];
    for (const target of targets) {
      // Fail-closed by default: a file being there is an attempt that found something, not
      // a statement that it covers the requirement. Only the owner-declared
      // `presence_satisfies_need` basis reads a present artifact as coverage.
      const presenceState = source.presence_state === PRESENCE.PRESENT
        && semantics !== PRESENCE_SEMANTICS.SATISFIES
        ? PRESENCE.UNKNOWN
        : source.presence_state;
      // An artifact recorded against a different document revision keeps naming that
      // revision. R1 then reports `coverage_revision_stale` rather than being handed a
      // freshness this builder cannot vouch for.
      const coveredRevisionId = source.covered_document_revision_id === documentRevisionId
        ? target.candidate.record.requirement_ref.revision_id
        : source.covered_document_revision_id;

      observations.push({
        observation_id: mintedToken(OBSERVATION_ID_PREFIX, UUID_DOMAIN.OBSERVATION,
          [source.observation_id, target.requirementKey, source.artifact_type_id, target.relation]),
        requirement_key: target.requirementKey,
        artifact_type_id: source.artifact_type_id,
        relation: target.relation,
        presence_state: presenceState,
        observation_attempt_ref: source.observation_attempt_ref,
        artifact_revision_ref: clonePlain(source.artifact_revision_ref),
        covered_requirement_revision_id: coveredRevisionId,
        evidence_refs: clonePlain(source.evidence_refs),
        valid_at: source.valid_at,
        known_at: source.known_at,
      });
    }
    if (targets.length === 0) {
      // R1 would carry this as an orphan only if it named a requirement; an artifact type
      // nobody declared a need for produces no cell at all, so it is reported here instead
      // of being emitted into a projection that would drop it.
      unbound.push({
        observation_id: source.observation_id,
        artifact_type_id: source.artifact_type_id,
        presence_state: source.presence_state,
        reason: UNBOUND_REASON,
      });
    }
    fanOut.push({ source_observation_id: source.observation_id, emitted_observation_count: targets.length });
  }

  observations.sort((a, b) => compareCodePoints(a.observation_id, b.observation_id));
  unbound.sort((a, b) => compareCodePoints(a.observation_id, b.observation_id));
  fanOut.sort((a, b) => compareCodePoints(a.source_observation_id, b.source_observation_id));
  return { observations, unbound, fanOut };
}

// ---------------------------------------------------------------- entry points

/**
 * Builds the R1 coverage input from an index, a Needs policy, and artifact observations.
 *
 * @param request see the module header and §2.1 of the design packet. Plain data only:
 *   nothing is read from disk, a clock, a network, or a model, and every instant in the
 *   output was supplied here.
 * @returns a deep frozen `{ input, manifest, receipt }`. `input` is exactly what
 *   `computeRequirementCoverage` accepts; `manifest` carries the provenance R1 refuses;
 *   `receipt` is payload free.
 * @throws {CoverageInputBuilderError} on any refusal. Every one is deterministic and
 *   carries a stable `code`.
 */
export function buildRequirementCoverageInput(request) {
  const policyShape = validateRequest(request);
  const policyRef = mintPolicyRef(request.needs_policy);

  const { admitted, holds } = admitRows(request, policyShape);
  const { needs, needsUndeclaredByGroup, neededTypes } = expandNeeds(request, admitted, policyRef);
  const { observations, unbound, fanOut } = fanOutObservations(request, neededTypes);

  const input = {
    requirements: admitted.map((candidate) => clonePlain(candidate.record)),
    needs,
    observations,
    risks: clonePlain(request.risks),
    stages: clonePlain(request.stage_declarations),
    cutoffs: { valid_at: request.cutoffs.valid_at, known_at: request.cutoffs.known_at },
  };

  // Self-check. R1 silently ignores a need or an observation whose requirement key it
  // cannot find, so a binding this builder got wrong would show up as a missing cell rather
  // than as an error. It is checked here instead, where it is still an error.
  const emittedKeys = new Set(admitted.map((candidate) => candidate.manifestRow.requirement_key));
  for (const need of needs) {
    if (!emittedKeys.has(requirementKeyFromRef(need.requirement_ref, 'need.requirement_ref'))) {
      fail(BUILDER_ERROR_CODES.BINDING_INCOMPLETE, 'an emitted need names a requirement that was not emitted',
        { need_id: need.need_id });
    }
  }
  for (const observation of observations) {
    if (!emittedKeys.has(observation.requirement_key)) {
      fail(BUILDER_ERROR_CODES.BINDING_INCOMPLETE, 'an emitted observation names a requirement that was not emitted',
        { observation_id: observation.observation_id });
    }
  }
  for (const [field, value] of Object.entries(input)) {
    if (Array.isArray(value) && value.length > MAX.array) {
      fail(BUILDER_ERROR_CODES.REQUEST_INVALID, 'an emitted array exceeds the declared bound', { where: `input.${field}` });
    }
  }

  const index = request.requirement_index;
  const held = Object.fromEntries(Object.values(HOLD_REASONS).map((reason) => [reason, 0]));
  for (const hold of holds) held[hold.reason] += 1;

  const manifest = {
    schema_version: COVERAGE_INPUT_BUILDER_SCHEMA_VERSION,
    document: {
      document_ref: clonePlain(request.document_binding.document_ref),
      index_schema_version: index.schema_version,
      profile_id: index.profile_id,
      page_count: index.document.page_count,
      row_count: index.row_count,
    },
    policy: {
      policy_ref: { ...policyRef },
      policy_status: request.needs_policy.policy_status,
      extends: clonePlain(request.needs_policy.extends),
      artifact_presence_semantics: request.needs_policy.artifact_presence_semantics,
      stage_code: request.baseline_binding.stage_code,
    },
    requirements: admitted.map((candidate) => candidate.manifestRow),
    holds,
    not_in_baseline: {
      mention_only_ids: [...index.mention_only_ids],
      malformed_label_count: (index.malformed_labels ?? []).length,
      index_declared_duplicate_ids: [...index.duplicate_ids],
    },
    needs_undeclared_by_group: needsUndeclaredByGroup,
    unbound_artifact_observations: unbound,
    fan_out: fanOut,
  };

  const receipt = {
    schema_version: COVERAGE_INPUT_BUILDER_SCHEMA_VERSION,
    builder_version: 'v0',
    deterministic: true,
    // D37: an extracted requirement id is an observation about a document, never a
    // confirmed requirement, so nothing this module emits may be read above `observed`.
    claim_ceiling: 'observed',
    d37: 'requirement_ids_are_observed_candidates_only',
    d38: 'needs_from_policy_extending_stage_expected_artifact_policy',
    input_digests: {
      requirement_index: canonicalDigest('requirement_index', indexDigestProjection(index), INDEX_PROJECTION_ORDER_RULES),
      needs_policy: canonicalDigest('needs_policy', request.needs_policy, POLICY_ORDER_RULES),
      artifact_observations: canonicalDigest('artifact_observations', request.artifact_observations,
        ARTIFACT_OBSERVATION_ORDER_RULES),
      document_binding: canonicalDigest('document_binding', request.document_binding, NO_ARRAY_RULES),
      baseline_binding: canonicalDigest('baseline_binding', request.baseline_binding, NO_ARRAY_RULES),
      stage_declarations: canonicalDigest('stage_declarations', request.stage_declarations, STAGE_DECLARATION_ORDER_RULES),
      risks: canonicalDigest('risks', request.risks, RISK_ORDER_RULES),
      cutoffs: canonicalDigest('cutoffs', request.cutoffs, NO_ARRAY_RULES),
    },
    output_digests: {
      coverage_input: canonicalDigest('coverage_input', input, COVERAGE_INPUT_ORDER_RULES),
      manifest: canonicalDigest('manifest', manifest, MANIFEST_ORDER_RULES),
    },
    counts: {
      rows_in: index.row_count,
      admitted: admitted.length,
      held,
      needs: needs.length,
      observations_emitted: observations.length,
      unbound_artifact_observations: unbound.length,
      requirements_without_needs: needsUndeclaredByGroup
        .reduce((total, group) => total + group.requirement_count, 0),
      // Counted over admitted rows only: a held row never becomes a requirement, so
      // counting its open marks here would report unresolved text that is not in the
      // baseline at all.
      tbc: admitted.filter((candidate) => candidate.row.tbc).length,
      tbd: admitted.filter((candidate) => candidate.row.tbd).length,
    },
    policy_status: request.needs_policy.policy_status,
    artifact_presence_semantics: request.needs_policy.artifact_presence_semantics,
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
  };

  return deepFreeze({ input, manifest, receipt });
}

/**
 * Builds the input and runs the R1 projection over it in one call.
 *
 * The two receipts are kept side by side rather than merged: one says what was read and
 * shaped, the other says what was projected, and folding them would make it impossible to
 * tell which step a digest belongs to. Refusals from R1 propagate unchanged, because a
 * builder that re-wrapped them would hide which contract was actually broken.
 */
export function projectRequirementCoverageFromIndex(request) {
  const built = buildRequirementCoverageInput(request);
  const coverage = computeRequirementCoverage(clonePlain(built.input));
  return deepFreeze({
    input: built.input,
    manifest: built.manifest,
    coverage,
    receipt: { ...built.receipt, coverage_receipt: coverage.receipt },
  });
}

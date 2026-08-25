// L3 of the SE stage rule source model: the compiler that turns one standard rule table plus
// one project overlay into the three things the three consumers read.
//
// The point of this seam is that there is exactly one source of "which artifact belongs to
// which stage". The folder-tree variant spec (L1) owns it, the project overlay (L2) says only
// what this project adds, aliases, or declares not applicable, and everything downstream —
// the gap-scan expected-artifact policy, the engine stage policy, and the Needs policy stage
// vocabulary — is a pure function of those two. Nothing here reads a file, a clock, a random
// source, an environment value, or a network; the caller owns all of that. Two callers holding
// the same inputs must reach byte-identical outputs, which is why every ordering is declared
// and every digest is taken over a canonical form.
//
// Three rules give this module its shape.
//
// 1. The overlay may never raise a rule's evidence level (design D45). A project can say "also
//    this", "we call it that", and "not applicable here, on this basis". It cannot promote its
//    own contract item into a regulation, and it cannot re-grade one that came from L1.
// 2. A rule is only mandated as strongly as its source verification allows. An unverified,
//    unsupported, or contradicted verification status weakens a row to context and never
//    strengthens one, and a row that never declared a status is treated as unverified. A
//    variant that has not been compared against its canonical texts therefore yields context,
//    not requirements — which is the intended outcome for the baselines the design doc marks
//    for re-basing.
// 3. What is optional context is not an engine requirement. The engine's requirements are the
//    things that must be present or explicitly not applicable; feeding it context rows would
//    turn every unmapped folder into a gap. Those rows stay in the gap-scan policy and in the
//    mapping table, where they are visible without being enforced.
import { createHash } from 'node:crypto';

import { canonicalise, compareCodePoints, isCanonicalInstant } from '../../../core/validators/canonical.mjs';
import { CANONICAL, REF_REQUIRED_FIELDS } from '../../../core/validators/contract_config.mjs';
import { AUTHORITY_FAMILIES } from '../../../core/validators/authority.mjs';
import { isWellFormedRef } from '../../../core/validators/identity.mjs';
import {
  ARTIFACT_FAMILIES, CAPABILITY_TOKENS, CROSS_LAYER_TOKEN_EQUIVALENCE, artifactTypeEntry,
  nationalTokenFor,
} from './artifact_vocabulary.mjs';

export const STAGE_RULE_COMPILER_SCHEMA_VERSION = 'soulforge.se_stage_rule_compiler.v0';
export const COMPILED_VARIANT_SCHEMA_VERSION = 'soulforge.se_foldertree_compiled_variant.v0';
export const STAGE_RULE_OVERLAY_SCHEMA_VERSION = 'soulforge.se_stage_rule_overlay.v0';
export const EXPECTED_ARTIFACT_POLICY_SCHEMA_VERSION = 'se_stage_expected_artifact_policy_v0';
export const ENGINE_STAGE_POLICY_SCHEMA_VERSION = 'soulforge.ax_se_stage_policy.v0';
export const COMPILER_VERSION = 'v0';

// The engine's frozen policy revision, restated rather than imported.
//
// `guild_hall/engineering_engine/subjects/ax_se_project_assessment.mjs` exports this constant,
// but it also imports `node:util`, and importing it would put a second bare specifier into a
// module whose whole contract is that its import graph reaches nothing but `node:crypto`. The
// value is pinned instead: the test suite imports the engine's own export and asserts equality,
// and mints a policy ref that the engine's validator accepts, so a drift here fails there.
export const AX_SE_POLICY_REVISION_PIN = 'soulforge.ax_se_project_assessment_policy.v0';

export const STAGE_RULE_ERROR_CODES = Object.freeze({
  REQUEST_INVALID: 'SE_STAGE_RULE_REQUEST_INVALID',
  VARIANT_INVALID: 'SE_STAGE_RULE_VARIANT_INVALID',
  OVERLAY_INVALID: 'SE_STAGE_RULE_OVERLAY_INVALID',
  OVERLAY_FORBIDDEN: 'SE_STAGE_RULE_OVERLAY_FORBIDDEN',
  OVERLAY_BASE_MISMATCH: 'SE_STAGE_RULE_OVERLAY_BASE_MISMATCH',
  STAGE_CODE_UNKNOWN: 'SE_STAGE_RULE_STAGE_CODE_UNKNOWN',
  BINDING_INVALID: 'SE_STAGE_RULE_BINDING_INVALID',
  ENGINE_MATERIAL_INVALID: 'SE_STAGE_RULE_ENGINE_MATERIAL_INVALID',
  WORK_ORDER_INVALID: 'SE_STAGE_RULE_WORK_ORDER_INVALID',
  DEPENDENCY_CYCLE: 'SE_STAGE_RULE_DEPENDENCY_CYCLE',
});

export class StageRuleCompilerError extends Error {
  constructor(code, message, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'StageRuleCompilerError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail = {}) => {
  throw new StageRuleCompilerError(code, message, detail);
};

// ---------------------------------------------------------------- declared vocabularies

// Gate code to engine stage code. The variant numbers its gates the way the lifecycle numbers
// its reviews, and the engine names them; this is the only place the two meet. A gate code that
// is not on this list is refused rather than guessed, because guessing would file a real
// artifact under a stage nobody chose.
const GATE_CODE_TO_STAGE_CODE = new Map([
  [0, '000_REF'],
  [20, '020_MGMT'],
  [30, '030_SRR'],
  [60, '060_SFR'],
  [90, '090_PDR'],
  [120, '120_CDR'],
  [150, '150_TRR_DT'],
  [180, '180_FCA_OT'],
  [210, '210_PCA'],
  [240, '240_LL'],
  [270, '270_UNCLASSIFIED'],
]);
const STAGE_CODES = new Set(GATE_CODE_TO_STAGE_CODE.values());
const STAGE_CODE_TO_SEQUENCE = new Map(
  [...GATE_CODE_TO_STAGE_CODE].map(([code, stage]) => [stage, code]),
);

export const PRESENCE_RULE = Object.freeze({
  PRESENT: 'present',
  PRESENT_OR_NOT_APPLICABLE: 'present_or_not_applicable',
  OPTIONAL_CONTEXT: 'optional_context',
});
const PRESENCE_RANK = Object.freeze({
  [PRESENCE_RULE.PRESENT]: 2,
  [PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE]: 1,
  [PRESENCE_RULE.OPTIONAL_CONTEXT]: 0,
});

export const EVIDENCE_LEVELS = Object.freeze([
  'regulation_mandated', 'guidebook_recommended', 'prime_contract', 'general_se_guidance',
  'internal_management', 'unstated',
]);
const EVIDENCE_TO_PRESENCE = Object.freeze({
  regulation_mandated: PRESENCE_RULE.PRESENT,
  guidebook_recommended: PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE,
  prime_contract: PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE,
  // The buyer- and country-independent systems engineering floor (layer ①): what any development
  // run on SE lines is expected to have produced before a given technical review. It is guidance
  // and not a regulation, so it can be answered with "not applicable, on this basis" — but the
  // basis has to be given, which is what present-or-not-applicable means.
  general_se_guidance: PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE,
  internal_management: PRESENCE_RULE.OPTIONAL_CONTEXT,
  unstated: PRESENCE_RULE.OPTIONAL_CONTEXT,
});

// How strongly the guidance floor asks for a row, as recorded by the layer ① checklist: both
// canonical texts list it (`must_have`), one of them does (`should_have`), or it is carried as
// background the development itself does not produce — a buyer-owned input or a mission-specific
// product (`context`). Only `context` changes what the compiler enforces; the other two are
// carried through so a downstream reader can tell a floor from a recommendation.
export const SE_FLOORS = Object.freeze(['must_have', 'should_have', 'context']);

// What kind of node a rule row is (design D46). Until now every row was a document that either
// sits in a folder or does not. A development also owes work that leaves no folder of its own —
// an analysis that has to happen, a baseline that has to be declared — and a checklist that can
// only name documents cannot say "do the functional analysis before you write the design".
//
// The judgement vocabulary does not change: an activity or a decision is still satisfied,
// missing, or unknown. What changes is what counts as evidence — for an activity or a decision it
// is a record (minutes, a decision record, or the artifact the work produced), which is why such
// a row carries `evidence_record` naming the records that would show it happened.
export const NODE_KINDS = Object.freeze(['artifact', 'activity', 'decision']);
const DEFAULT_NODE_KIND = 'artifact';

// What a row is TO its gate, which is a different question from what it needs first.
//
// `core` is what the review exists to produce — the guidebook's 주요 산출물 column, the NASA
// success criteria. `entry` is material the review expects to already be on the table — the
// INPUT column, the entrance criteria. `supporting` is everything else the gate carries.
//
// This is the distinction the earlier pass got wrong: a review's input list was read as though
// the listed artifacts fed each other, which produced backwards edges (functional analysis before
// the requirements it analyses). An input list says what has to exist by the review, not what
// derives from what, so it belongs here and not in `depends_on`.
export const GATE_ROLES = Object.freeze(['core', 'entry', 'supporting']);
const DEFAULT_GATE_ROLE = 'supporting';
const GATE_ROLE_RANK = Object.freeze({ core: 0, entry: 1, supporting: 2 });

// Where a row's declared inputs came from. `canonical` is the ordinary case: a text in this row's
// own layer said it. `generic_layer_projection` marks an edge carried across from the buyer- and
// country-independent layer through the recorded token equivalence, and `mixed` a row that has
// both. A projected edge never outranks a canonical one — it arrives at `general_se_guidance`.
export const DEPENDS_ON_ORIGINS = Object.freeze(['canonical', 'generic_layer_projection', 'mixed']);
const DEFAULT_DEPENDS_ON_ORIGIN = 'canonical';

// Which grade of canonical text states a dependency edge. An edge is only as strong as the text
// behind it, and a practice-only edge — one everybody follows and no canonical text writes down —
// is `unstated`. A row that declares inputs without declaring their grade is read as `unstated`
// rather than inheriting the row's own grade: the row's evidence is about the artifact, not about
// the order, and inheriting would silently promote a habit into a rule.
const DEFAULT_DEPENDS_ON_EVIDENCE = 'unstated';

// The precedence the plan declares for work order (manual 09 section 9.0.2 rule 4): regulation
// before guidebook before general SE guidance before unstated. `prime_contract` is not on that
// list because it is not a canonical-text grade at all; it is placed after the guidebook and
// before the guidance floor because it is an obligation this project actually carries while the
// floor is advice. This is a display order and never an evidence re-grade — nothing here changes
// what `EVIDENCE_TO_PRESENCE` decided.
const EVIDENCE_WORK_RANK = Object.freeze({
  regulation_mandated: 0,
  guidebook_recommended: 1,
  prime_contract: 2,
  general_se_guidance: 3,
  internal_management: 4,
  unstated: 5,
});

// `internal_management` is the verdict the source verification gives INBOX/LOG/TDP-style rows
// (design §3: the verdict is copied verbatim). It neither supports nor weakens a rule; such rows
// are context by their evidence level already.
export const VERIFICATION_STATUSES = Object.freeze([
  'source_supported', 'partially_supported', 'unsupported', 'contradicted', 'unverified',
  'internal_management',
]);
// A row carrying one of these cannot be enforced. `unverified` is also the default for a task
// that declares no status at all: not yet compared is not the same as compared and accepted.
// `partially_supported` is deliberately not here: it says the row was compared and found in one
// canonical text rather than in every one of them, which is support and not the absence of it.
// For a `general_se_guidance` row that is the ordinary case — a single-source floor is still a
// floor — and for the others it is the "exists under another name or at another gate" verdict.
const WEAKENING_VERIFICATION = new Set(['unverified', 'unsupported', 'contradicted']);
const DEFAULT_VERIFICATION_STATUS = 'unverified';

const DRAFTABILITY = Object.freeze({
  DEFAULT: 'draftable_with_sources',
  NOT_APPLICABLE: 'not_applicable',
});
// Which basis a "not applicable" is allowed to rest on. The variant's own default rests on the
// policy rule that produced it; a project decision rests on a scoped owner decision.
const NOT_APPLICABLE_BASIS = Object.freeze({
  POLICY_RULE: 'policy_rule',
  OWNER_DECISION: 'scoped_owner_decision_ref',
});

// Verbatim from `.workflow/se_stage_artifact_gap_scan_v0/templates/stage_expected_artifact_policy.template.yaml`.
// Copied rather than derived: the workflow owns these two blocks, and a compiled instance that
// silently disagreed with the template would be read as a policy change nobody made.
const STATUS_VOCABULARY = Object.freeze([
  'draftable', 'owner_input_needed', 'source_needed', 'blocked', 'not_applicable',
]);
const POLICY_RULES = Object.freeze({
  missing_owner_decision_becomes_owner_input: true,
  missing_source_becomes_source_needed_or_blocked: true,
  not_applicable_requires_policy_or_owner_basis: true,
  scan_result_does_not_complete_artifact: true,
});
const WORKFLOW_ID = 'se_stage_artifact_gap_scan_v0';
const OWNER_SURFACE = 'se_stage_rule_compiler';
const DESIGN_DOC_REF = 'docs/architecture/workspace/SE_STAGE_RULE_SOURCE_MODEL_V0.md';
const BOSS_CLEAR_INTERPRETATION = 'scan_reference_only_not_approval';
const DOWNSTREAM_ROUTE_HINT = 'none';

// Vocabulary family to the template's `artifact_kind` enum. `formal_document` is the default,
// and only the families whose evidence is not a document move off it.
const FAMILY_TO_ARTIFACT_KIND = Object.freeze({
  drawing_and_interface: 'interface_diagram',
  mechanical_model: 'diagram',
  test_plan: 'verification_planning_artifact',
  test_procedure: 'verification_planning_artifact',
  test_result: 'review_evidence',
  test_docs: 'review_evidence',
  evaluation_report: 'analysis_packet',
  configuration_audit: 'review_evidence',
  review_minutes: 'review_evidence',
  review_result: 'review_evidence',
  // D46. What is filed for an activity is the record that it happened; what is filed for a
  // decision is the record of the decision. The gap-scan template already names both kinds.
  activity: 'review_evidence',
  decision: 'owner_decision_record',
});
const DEFAULT_ARTIFACT_KIND = 'formal_document';

const ORIGIN = Object.freeze({ VARIANT: 'variant', OVERLAY: 'overlay' });
const DOCUMENT_REF_SELECTION = Object.freeze({
  COVERED: 'covered',
  DEFAULT: 'default_document_ref',
});

const AUTHORITY_FAMILY_KEYS = new Set(AUTHORITY_FAMILIES.map((row) => row.key));
const FAMILY_TOKENS = new Set(ARTIFACT_FAMILIES);
const CAPABILITY_TOKEN_SET = new Set(CAPABILITY_TOKENS);
const UNMAPPED_PREFIX = 'unmapped_';
const UNMAPPED_FAMILY = 'internal';
const UNMAPPED_CAPABILITY = 'project_management';

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SHA256_TAGGED = /^sha256:[0-9a-f]{64}$/u;
const SHA256_BARE = /^[0-9a-f]{64}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

// Bounds belong to this seam and not to its caller. They exist so that one call stays one
// bounded call whatever the input claims about itself.
const MAX = Object.freeze({
  string: 512, gates: 64, tasks: 512, ops: 512, refs: 128, conditions: 128, documents: 128,
  // A row's purpose sentence, in characters rather than UTF-16 units so the cap means the same
  // thing in Korean as it does in English.
  purposeChars: 200,
});

// ---------------------------------------------------------------- shape assertions

function assertPlainObject(value, where, code = STAGE_RULE_ERROR_CODES.REQUEST_INVALID) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${where} must be an object`, { where });
  }
}

function assertExactKeys(value, required, optional, where, code = STAGE_RULE_ERROR_CODES.REQUEST_INVALID) {
  assertPlainObject(value, where, code);
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(value);
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  const unexpected = actual.filter((key) => !allowed.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    fail(code, `${where} has missing or unexpected fields`, { where, missing, unexpected });
  }
}

function assertSafeString(value, where, code = STAGE_RULE_ERROR_CODES.REQUEST_INVALID) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX.string
      || value.normalize('NFC') !== value || CONTROL_CHARACTERS.test(value)) {
    fail(code, `${where} must be bounded non-empty NFC text without control characters`, { where });
  }
  return value;
}

function assertToken(value, where, code = STAGE_RULE_ERROR_CODES.REQUEST_INVALID) {
  if (typeof value !== 'string' || !TOKEN.test(value)) {
    fail(code, `${where} must be a bounded stable token`, { where });
  }
  return value;
}

function assertArray(value, where, max, code = STAGE_RULE_ERROR_CODES.REQUEST_INVALID) {
  if (!Array.isArray(value) || value.length > max) {
    fail(code, `${where} must be an explicit array within its item limit`, { where, limit: max });
  }
  return value;
}

function assertEnum(value, allowed, where, code = STAGE_RULE_ERROR_CODES.REQUEST_INVALID) {
  if (!allowed.includes(value)) {
    fail(code, `${where} is not one of the declared values`, { where });
  }
  return value;
}

function assertSafeInteger(value, where, code = STAGE_RULE_ERROR_CODES.REQUEST_INVALID) {
  if (!Number.isSafeInteger(value)) fail(code, `${where} must be a safe integer`, { where });
  return value;
}

function assertExactRef(ref, where, code = STAGE_RULE_ERROR_CODES.REQUEST_INVALID) {
  assertExactKeys(ref, REF_REQUIRED_FIELDS, [], where, code);
  if (!isWellFormedRef(ref) || !SHA256_TAGGED.test(ref.content_id) || ref.content_hash_alg !== 'sha256') {
    fail(code, `${where} must be an exact sha256-bound revision ref`, { where });
  }
  for (const field of REF_REQUIRED_FIELDS) assertSafeString(ref[field], `${where}.${field}`, code);
  return Object.freeze({
    entity_id: ref.entity_id,
    revision_id: ref.revision_id,
    content_id: ref.content_id,
    content_hash_alg: ref.content_hash_alg,
  });
}

function assertInstant(value, where, code = STAGE_RULE_ERROR_CODES.REQUEST_INVALID) {
  if (!isCanonicalInstant(value)) fail(code, `${where} must be a canonical instant`, { where });
  return value;
}

// ---------------------------------------------------------------- canonical digests

const sha256Hex = (input) => createHash(CANONICAL.hashAlgorithm).update(input).digest('hex');

/**
 * Declares every array in `value` insertion-ordered, at the exact paths the canonical layer
 * asks about.
 *
 * Reproduced from the engine subject's private helper of the same shape. It has to be the same
 * walk, not merely a similar one: `mintEnginePolicyRef` has to land on the byte the engine's
 * own digest lands on, and a different path spelling would produce a different rule map and a
 * ref the engine then rejects as a hash mismatch.
 */
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

/**
 * Drops keys whose value is `null` before canonicalisation.
 *
 * The canonical layer forbids null outright, and rightly: an omitted key and a null key would
 * otherwise serialise differently while meaning the same thing. The compiler's outputs use null
 * for "this row has no engine requirement" and "this row has no alias" because that reads
 * better in a mapping table a human opens, so the digest is taken over the same structure with
 * those keys omitted. No collision hides in that: every row of a given table carries the same
 * key set, so a missing key is unambiguous.
 */
function withoutNulls(value) {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== null) out[key] = withoutNulls(child);
    }
    return out;
  }
  return value;
}

function canonicalDigest(domain, value) {
  const projected = withoutNulls(value);
  let canonical;
  try {
    canonical = canonicalise(projected, arrayOrderRules(projected));
  } catch (error) {
    // The canonical layer names the offending path and echoes the rejected value in its detail.
    // Neither belongs in a refusal that travels back to a caller, so every canonical failure
    // collapses into one code that carries only the domain it happened in.
    return fail(STAGE_RULE_ERROR_CODES.REQUEST_INVALID,
      'stage rule material is not canonically serialisable',
      { domain, contract_code: error?.code ?? null });
  }
  return sha256Hex(`${domain}\n${canonical}`);
}

const compilerDomain = (name) => `${STAGE_RULE_COMPILER_SCHEMA_VERSION}.${name}`;

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// ---------------------------------------------------------------- declared shapes

const REQUEST_FIELDS = Object.freeze([
  'compiled_variant', 'overlay', 'project_binding', 'target_stage_codes', 'overlay_conditions',
]);
const VARIANT_FIELDS = Object.freeze([
  'schema_version', 'support_key', 'business_type', 'prime_contractor', 'quality_grade',
  'spec_file', 'spec_sha256', 'spec_version', 'generated_by', 'principles', 'special_folders',
  'management_static_folders', 'gates', 'completion_rule', 'generation_rules', 'profiles',
]);
// A common-base variant derived by the exporter from a prime-contractor spec carries where it came
// from. Provenance only; the rules are the tasks that remain.
const VARIANT_OPTIONAL_FIELDS = Object.freeze(['derived_from']);
const GATE_FIELDS = Object.freeze(['code', 'name', 'desc', 'tasks']);
const TASK_REQUIRED_FIELDS = Object.freeze(['id', 'name']);
const TASK_OPTIONAL_FIELDS = Object.freeze([
  'desc', 'term', 'source', 'template', 'is_fixed', 'artifact_type_id', 'evidence_level',
  'source_refs', 'applies_when', 'not_applicable_default', 'verification_status',
  'added_by_verification', 'se_floor', 'maturity',
  // D46: the node kind, the causal edges into this row, the grade and citations behind those
  // edges, the records that would show an activity or a decision happened, and whether the row
  // is virtual (a rule with no folder of its own).
  'node_kind', 'depends_on', 'depends_on_refs', 'depends_on_evidence', 'evidence_record',
  'is_virtual',
  // What this row is to its gate, and where its declared inputs came from.
  'gate_role', 'depends_on_origin',
  // What the canonical text says the artifact is FOR, and the locators that sentence was read at.
  // The compiler does not read either — a purpose changes no judgement — but a spec row is
  // validated key by key, so a field the guidance layer reads has to be declared here too.
  'purpose_ko', 'purpose_refs',
]);
const SOURCE_REF_FIELDS = Object.freeze(['source_key', 'locator']);
const PROJECT_BINDING_FIELDS = Object.freeze([
  'document_refs', 'valid_at', 'known_at', 'authority_family', 'applicability_default',
]);
const DOCUMENT_REF_FIELDS = Object.freeze(['artifact_type_ids_covered', 'requirement_ref']);
const OVERLAY_FIELDS = Object.freeze(['schema_version', 'extends', 'ops']);
// Provenance only: who authored the overlay and which spec/prime it was derived from. Read for the
// receipt, never for a rule.
const OVERLAY_OPTIONAL_FIELDS = Object.freeze(['overlay_identity']);
const OVERLAY_EXTENDS_FIELDS = Object.freeze(['support_key', 'spec_sha256']);
const OP_ADD_REQUIRED = Object.freeze([
  'op', 'stage_code', 'artifact_type_id', 'label', 'evidence_level', 'source_ref', 'basis',
]);
// `family` and `required_capability` are optional overrides, and become required when the added
// token is not one the vocabulary owns. Without them an unknown token has no `requirement_kind`
// and no capability, and the engine requirement built from it would name a capability no role
// can hold. Design section 5 says the overlay may set the capability; this is where.
// `task_id` and `folder_name` say where this addition lives on disk, and they are optional because
// most additions do not have a folder of their own. An `add` op invents a rule the standard table
// does not carry, so nothing generated the folder for it; when a project HAS made one — typically
// a slot that used to be a spec row and moved into the overlay — these two carry the number and
// the name so the file door can resolve it the same way it resolves a spec row: number and name
// must agree. Without them the addition still compiles, and the door still refuses to place files
// for it, which is the honest answer when nobody has said where they go.
const OP_ADD_OPTIONAL = Object.freeze(['family', 'required_capability', 'task_id', 'folder_name']);
const OP_MARK_NA_REQUIRED = Object.freeze(['op', 'stage_code', 'artifact_type_id', 'basis']);
const OP_MARK_NA_OPTIONAL = Object.freeze(['decision_ref']);
const OP_ALIAS_FIELDS = Object.freeze(['op', 'stage_code', 'artifact_type_id', 'alias']);
const OP_CONDITION_FIELDS = Object.freeze(['op', 'token']);
// D46: an overlay may state an input the standard table did not, on the exact document that asks
// for it. It is additive only — there is no operation that takes a canonical edge away, for the
// same reason there is none that lowers a canonical evidence level (D45).
const OP_ADD_DEPENDENCY_FIELDS = Object.freeze([
  'op', 'stage_code', 'artifact_type_id', 'depends_on', 'source_ref', 'basis',
]);
const OVERLAY_OPS = Object.freeze([
  'add', 'mark_not_applicable', 'alias', 'condition', 'add_dependency',
]);
const FORBIDDEN_OVERLAY_OPS = Object.freeze(['override_evidence', 'remove_dependency']);

// ---------------------------------------------------------------- input validation

function validateCompiledVariant(variant) {
  assertExactKeys(variant, VARIANT_FIELDS, VARIANT_OPTIONAL_FIELDS, 'compiled_variant', STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
  if (variant.schema_version !== COMPILED_VARIANT_SCHEMA_VERSION) {
    fail(STAGE_RULE_ERROR_CODES.VARIANT_INVALID, 'compiled_variant carries an unknown schema version',
      { where: 'compiled_variant.schema_version' });
  }
  for (const field of ['support_key', 'business_type', 'prime_contractor', 'quality_grade',
    'spec_file', 'spec_version', 'generated_by']) {
    assertSafeString(variant[field], `compiled_variant.${field}`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
  }
  if (typeof variant.spec_sha256 !== 'string' || !SHA256_BARE.test(variant.spec_sha256)) {
    fail(STAGE_RULE_ERROR_CODES.VARIANT_INVALID, 'compiled_variant.spec_sha256 must be a bare lowercase sha256',
      { where: 'compiled_variant.spec_sha256' });
  }
  assertArray(variant.principles, 'compiled_variant.principles', MAX.refs, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
  assertArray(variant.management_static_folders, 'compiled_variant.management_static_folders', MAX.refs,
    STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
  for (const field of ['special_folders', 'completion_rule', 'generation_rules', 'profiles']) {
    assertPlainObject(variant[field], `compiled_variant.${field}`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
  }

  const gates = assertArray(variant.gates, 'compiled_variant.gates', MAX.gates,
    STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
  if (gates.length === 0) {
    fail(STAGE_RULE_ERROR_CODES.VARIANT_INVALID, 'compiled_variant.gates must declare at least one gate',
      { where: 'compiled_variant.gates' });
  }

  const byStageCode = new Map();
  gates.forEach((gate, index) => {
    const where = `compiled_variant.gates[${index}]`;
    assertExactKeys(gate, GATE_FIELDS, [], where, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
    assertSafeInteger(gate.code, `${where}.code`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
    assertSafeString(gate.name, `${where}.name`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
    assertSafeString(gate.desc, `${where}.desc`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
    // An unrecognised gate code is refused for the whole variant, not skipped, and refused even
    // when the caller did not target it. A variant that files tasks under a lifecycle position
    // this model does not name is wrong as a whole; compiling the part of it that happens to be
    // recognisable would hand back a rule set that silently lost rules.
    const stageCode = GATE_CODE_TO_STAGE_CODE.get(gate.code);
    if (stageCode === undefined) {
      fail(STAGE_RULE_ERROR_CODES.STAGE_CODE_UNKNOWN, 'gate code does not map to an engine stage code',
        { where: `${where}.code`, gate_code: gate.code });
    }
    if (byStageCode.has(stageCode)) {
      fail(STAGE_RULE_ERROR_CODES.VARIANT_INVALID, 'two gates map to one stage code',
        { where: `${where}.code`, stage_code: stageCode });
    }
    byStageCode.set(stageCode, gate);

    const tasks = assertArray(gate.tasks, `${where}.tasks`, MAX.tasks, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
    const taskIds = new Set();
    tasks.forEach((task, taskIndex) => {
      const taskWhere = `${where}.tasks[${taskIndex}]`;
      assertExactKeys(task, TASK_REQUIRED_FIELDS, TASK_OPTIONAL_FIELDS, taskWhere,
        STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
      assertSafeInteger(task.id, `${taskWhere}.id`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
      assertSafeString(task.name, `${taskWhere}.name`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
      if (taskIds.has(task.id)) {
        fail(STAGE_RULE_ERROR_CODES.VARIANT_INVALID, 'task id is declared twice inside one gate',
          { where: `${taskWhere}.id` });
      }
      taskIds.add(task.id);
      for (const field of ['desc', 'term', 'source', 'template']) {
        if (task[field] !== undefined) {
          assertSafeString(task[field], `${taskWhere}.${field}`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
        }
      }
      for (const field of ['is_fixed', 'not_applicable_default', 'is_virtual']) {
        if (task[field] !== undefined && typeof task[field] !== 'boolean') {
          fail(STAGE_RULE_ERROR_CODES.VARIANT_INVALID, `${taskWhere}.${field} must be a boolean`,
            { where: `${taskWhere}.${field}` });
        }
      }
      // The exporter stamps the verification date on rows it added; a bare `true` is also
      // accepted. Either way it is provenance, not a rule input.
      if (task.added_by_verification !== undefined && task.added_by_verification !== true) {
        assertSafeString(task.added_by_verification, `${taskWhere}.added_by_verification`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
      }
      if (task.artifact_type_id !== undefined) {
        assertToken(task.artifact_type_id, `${taskWhere}.artifact_type_id`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
      }
      if (task.evidence_level !== undefined) {
        assertEnum(task.evidence_level, EVIDENCE_LEVELS, `${taskWhere}.evidence_level`,
          STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
      }
      if (task.verification_status !== undefined) {
        assertEnum(task.verification_status, VERIFICATION_STATUSES, `${taskWhere}.verification_status`,
          STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
      }
      if (task.se_floor !== undefined) {
        assertEnum(task.se_floor, SE_FLOORS, `${taskWhere}.se_floor`,
          STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
      }
      // The maturity expected of the artifact at this gate (preliminary / updated / baseline /
      // final in the layer ① checklist). It is display and downstream material, not a rule input,
      // so it is bounded rather than enumerated.
      if (task.maturity !== undefined) {
        assertSafeString(task.maturity, `${taskWhere}.maturity`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
      }
      if (task.applies_when !== undefined) {
        // One condition token or a list of them (all must hold). The exporter emits a list so a
        // slot may hang on more than one condition, e.g. an SDP at SRR on exploratory_skipped +
        // sw_included.
        const tokens = Array.isArray(task.applies_when) ? task.applies_when : [task.applies_when];
        if (tokens.length === 0 || tokens.length > MAX.refs) {
          fail(STAGE_RULE_ERROR_CODES.VARIANT_INVALID, 'applies_when must name at least one condition', { where: `${taskWhere}.applies_when` });
        }
        for (const token of tokens) assertToken(token, `${taskWhere}.applies_when`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
      }
      if (task.source_refs !== undefined) {
        assertArray(task.source_refs, `${taskWhere}.source_refs`, MAX.refs, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
        task.source_refs.forEach((ref, refIndex) => {
          const refWhere = `${taskWhere}.source_refs[${refIndex}]`;
          assertExactKeys(ref, SOURCE_REF_FIELDS, [], refWhere, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
          assertSafeString(ref.source_key, `${refWhere}.source_key`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
          assertSafeString(ref.locator, `${refWhere}.locator`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
        });
      }
      // What the canon says the artifact is for. Bounded at 200 characters because a purpose is a
      // sentence a person reads on a card, and a longer one would be the canonical text itself
      // copied into a public spec rather than a condensation of it with a locator beside it.
      if (task.purpose_ko !== undefined) {
        assertSafeString(task.purpose_ko, `${taskWhere}.purpose_ko`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
        if ([...task.purpose_ko].length > MAX.purposeChars) {
          fail(STAGE_RULE_ERROR_CODES.VARIANT_INVALID, 'purpose_ko is longer than a card sentence may be',
            { where: `${taskWhere}.purpose_ko`, limit: MAX.purposeChars });
        }
      }
      if (task.purpose_refs !== undefined) {
        assertArray(task.purpose_refs, `${taskWhere}.purpose_refs`, MAX.refs, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
        task.purpose_refs.forEach((ref, refIndex) => {
          const refWhere = `${taskWhere}.purpose_refs[${refIndex}]`;
          assertExactKeys(ref, SOURCE_REF_FIELDS, [], refWhere, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
          assertSafeString(ref.source_key, `${refWhere}.source_key`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
          assertSafeString(ref.locator, `${refWhere}.locator`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
        });
      }
      // A purpose without a locator is somebody's opinion in a table of cited rules.
      if (task.purpose_ko !== undefined && (task.purpose_refs ?? []).length === 0) {
        fail(STAGE_RULE_ERROR_CODES.VARIANT_INVALID, 'a stated purpose must name where it was read',
          { where: `${taskWhere}.purpose_refs` });
      }
      // ---- D46 fields.
      if (task.node_kind !== undefined) {
        assertEnum(task.node_kind, NODE_KINDS, `${taskWhere}.node_kind`,
          STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
      }
      if (task.depends_on !== undefined) {
        assertArray(task.depends_on, `${taskWhere}.depends_on`, MAX.refs, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
        task.depends_on.forEach((token, tokenIndex) => assertToken(token,
          `${taskWhere}.depends_on[${tokenIndex}]`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID));
      }
      if (task.evidence_record !== undefined) {
        assertArray(task.evidence_record, `${taskWhere}.evidence_record`, MAX.refs, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
        task.evidence_record.forEach((token, tokenIndex) => assertToken(token,
          `${taskWhere}.evidence_record[${tokenIndex}]`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID));
      }
      if (task.depends_on_evidence !== undefined) {
        assertEnum(task.depends_on_evidence, EVIDENCE_LEVELS, `${taskWhere}.depends_on_evidence`,
          STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
      }
      if (task.gate_role !== undefined) {
        assertEnum(task.gate_role, GATE_ROLES, `${taskWhere}.gate_role`,
          STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
      }
      if (task.depends_on_origin !== undefined) {
        assertEnum(task.depends_on_origin, DEPENDS_ON_ORIGINS, `${taskWhere}.depends_on_origin`,
          STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
      }
      if (task.depends_on_refs !== undefined) {
        assertArray(task.depends_on_refs, `${taskWhere}.depends_on_refs`, MAX.refs, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
        task.depends_on_refs.forEach((ref, refIndex) => {
          const refWhere = `${taskWhere}.depends_on_refs[${refIndex}]`;
          assertExactKeys(ref, SOURCE_REF_FIELDS, [], refWhere, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
          assertSafeString(ref.source_key, `${refWhere}.source_key`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
          assertSafeString(ref.locator, `${refWhere}.locator`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
        });
      }
    });
  });

  return byStageCode;
}

function validateProjectBinding(binding) {
  assertExactKeys(binding, PROJECT_BINDING_FIELDS, [], 'project_binding', STAGE_RULE_ERROR_CODES.BINDING_INVALID);
  const documentRefs = assertArray(binding.document_refs, 'project_binding.document_refs', MAX.documents,
    STAGE_RULE_ERROR_CODES.BINDING_INVALID);
  if (documentRefs.length === 0) {
    fail(STAGE_RULE_ERROR_CODES.BINDING_INVALID,
      'project_binding.document_refs must carry at least one document ref',
      { where: 'project_binding.document_refs' });
  }
  const normalised = documentRefs.map((row, index) => {
    const where = `project_binding.document_refs[${index}]`;
    assertExactKeys(row, DOCUMENT_REF_FIELDS, [], where, STAGE_RULE_ERROR_CODES.BINDING_INVALID);
    const covered = assertArray(row.artifact_type_ids_covered, `${where}.artifact_type_ids_covered`, MAX.refs,
      STAGE_RULE_ERROR_CODES.BINDING_INVALID);
    covered.forEach((id, idIndex) => assertToken(id, `${where}.artifact_type_ids_covered[${idIndex}]`,
      STAGE_RULE_ERROR_CODES.BINDING_INVALID));
    return Object.freeze({
      artifact_type_ids_covered: Object.freeze([...covered]),
      requirement_ref: assertExactRef(row.requirement_ref, `${where}.requirement_ref`,
        STAGE_RULE_ERROR_CODES.BINDING_INVALID),
    });
  });
  assertInstant(binding.valid_at, 'project_binding.valid_at', STAGE_RULE_ERROR_CODES.BINDING_INVALID);
  assertInstant(binding.known_at, 'project_binding.known_at', STAGE_RULE_ERROR_CODES.BINDING_INVALID);
  if (compareCodePoints(binding.known_at, binding.valid_at) < 0) {
    fail(STAGE_RULE_ERROR_CODES.BINDING_INVALID, 'project_binding.known_at cannot precede valid_at',
      { where: 'project_binding.known_at' });
  }
  if (!AUTHORITY_FAMILY_KEYS.has(binding.authority_family)) {
    fail(STAGE_RULE_ERROR_CODES.BINDING_INVALID, 'project_binding.authority_family is unregistered',
      { where: 'project_binding.authority_family' });
  }
  if (![true, false, 'unknown'].includes(binding.applicability_default)) {
    fail(STAGE_RULE_ERROR_CODES.BINDING_INVALID,
      'project_binding.applicability_default must be exactly true, false, or "unknown"',
      { where: 'project_binding.applicability_default' });
  }
  return {
    document_refs: normalised,
    valid_at: binding.valid_at,
    known_at: binding.known_at,
    authority_family: binding.authority_family,
    applicability_default: binding.applicability_default,
  };
}

function validateOverlay(overlay, variant) {
  assertExactKeys(overlay, OVERLAY_FIELDS, OVERLAY_OPTIONAL_FIELDS, 'overlay', STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
  if (overlay.overlay_identity !== undefined) {
    assertPlainObject(overlay.overlay_identity, 'overlay.overlay_identity', STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
    for (const [key, value] of Object.entries(overlay.overlay_identity)) {
      assertSafeString(String(value), `overlay.overlay_identity.${key}`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
    }
  }
  if (overlay.schema_version !== STAGE_RULE_OVERLAY_SCHEMA_VERSION) {
    fail(STAGE_RULE_ERROR_CODES.OVERLAY_INVALID, 'overlay carries an unknown schema version',
      { where: 'overlay.schema_version' });
  }
  assertExactKeys(overlay.extends, OVERLAY_EXTENDS_FIELDS, [], 'overlay.extends',
    STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
  // An overlay is only meaningful against the exact rule table it was written for. A support key
  // or a spec digest that has moved means the standard rules underneath it have changed, and the
  // additions and not-applicable decisions in it were reasoned about something else.
  if (overlay.extends.support_key !== variant.support_key
      || overlay.extends.spec_sha256 !== variant.spec_sha256) {
    fail(STAGE_RULE_ERROR_CODES.OVERLAY_BASE_MISMATCH,
      'overlay.extends does not name the compiled variant it is applied to',
      { where: 'overlay.extends' });
  }

  const ops = assertArray(overlay.ops, 'overlay.ops', MAX.ops, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
  return ops.map((op, index) => {
    const where = `overlay.ops[${index}]`;
    assertPlainObject(op, where, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
    if (FORBIDDEN_OVERLAY_OPS.includes(op.op)) {
      // D45. The overlay carries the project's additions and its not-applicable decisions. The
      // grade of the canonical source behind an L1 rule is not the project's to restate.
      fail(STAGE_RULE_ERROR_CODES.OVERLAY_FORBIDDEN,
        'an overlay may not change the evidence level of a standard rule',
        { where, op: op.op });
    }
    if (!OVERLAY_OPS.includes(op.op)) {
      fail(STAGE_RULE_ERROR_CODES.OVERLAY_INVALID, 'overlay op is not one of the declared operations',
        { where });
    }
    if (op.op === 'condition') {
      assertExactKeys(op, OP_CONDITION_FIELDS, [], where, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
      assertToken(op.token, `${where}.token`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
      return Object.freeze({ op: 'condition', token: op.token });
    }

    assertToken(op.stage_code, `${where}.stage_code`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
    if (!STAGE_CODES.has(op.stage_code)) {
      fail(STAGE_RULE_ERROR_CODES.OVERLAY_INVALID, 'overlay op names a stage code the model does not declare',
        { where: `${where}.stage_code` });
    }
    assertToken(op.artifact_type_id, `${where}.artifact_type_id`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);

    if (op.op === 'alias') {
      assertExactKeys(op, OP_ALIAS_FIELDS, [], where, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
      assertSafeString(op.alias, `${where}.alias`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
      return Object.freeze({
        op: 'alias', stage_code: op.stage_code, artifact_type_id: op.artifact_type_id, alias: op.alias,
      });
    }
    if (op.op === 'add_dependency') {
      assertExactKeys(op, OP_ADD_DEPENDENCY_FIELDS, [], where, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
      assertSafeString(op.basis, `${where}.basis`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
      const tokens = assertArray(op.depends_on, `${where}.depends_on`, MAX.refs,
        STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
      if (tokens.length === 0) {
        fail(STAGE_RULE_ERROR_CODES.OVERLAY_INVALID, 'an add_dependency op must name at least one input',
          { where: `${where}.depends_on` });
      }
      tokens.forEach((token, tokenIndex) => assertToken(token, `${where}.depends_on[${tokenIndex}]`,
        STAGE_RULE_ERROR_CODES.OVERLAY_INVALID));
      return Object.freeze({
        op: 'add_dependency',
        stage_code: op.stage_code,
        artifact_type_id: op.artifact_type_id,
        depends_on: Object.freeze([...new Set(tokens)].sort(compareCodePoints)),
        source_ref: assertExactRef(op.source_ref, `${where}.source_ref`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID),
        basis: op.basis,
      });
    }
    if (op.op === 'mark_not_applicable') {
      assertExactKeys(op, OP_MARK_NA_REQUIRED, OP_MARK_NA_OPTIONAL, where, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
      assertSafeString(op.basis, `${where}.basis`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
      const decisionRef = op.decision_ref === undefined
        ? null
        : assertExactRef(op.decision_ref, `${where}.decision_ref`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
      return Object.freeze({
        op: 'mark_not_applicable',
        stage_code: op.stage_code,
        artifact_type_id: op.artifact_type_id,
        basis: op.basis,
        decision_ref: decisionRef,
      });
    }

    assertExactKeys(op, OP_ADD_REQUIRED, OP_ADD_OPTIONAL, where, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
    assertSafeString(op.label, `${where}.label`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
    assertSafeString(op.basis, `${where}.basis`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
    if (op.evidence_level !== 'prime_contract') {
      // The only grade an overlay may state is the one it can support: an item this project's
      // prime contract asked for. Anything else is a raise dressed as an addition.
      fail(STAGE_RULE_ERROR_CODES.OVERLAY_FORBIDDEN,
        'an overlay addition may only carry the prime_contract evidence level',
        { where: `${where}.evidence_level` });
    }
    const sourceRef = assertExactRef(op.source_ref, `${where}.source_ref`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
    const vocabulary = artifactTypeEntry(op.artifact_type_id);
    if (op.family !== undefined) {
      assertEnum(op.family, ARTIFACT_FAMILIES, `${where}.family`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
    }
    if (op.required_capability !== undefined) {
      assertEnum(op.required_capability, CAPABILITY_TOKENS, `${where}.required_capability`,
        STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
    }
    const family = op.family ?? vocabulary?.family;
    const capability = op.required_capability ?? vocabulary?.capability_default;
    if (family === undefined || capability === undefined) {
      fail(STAGE_RULE_ERROR_CODES.OVERLAY_INVALID,
        'an overlay addition outside the vocabulary must declare both family and required_capability',
        { where, artifact_type_id: op.artifact_type_id });
    }
    if (!FAMILY_TOKENS.has(family) || !CAPABILITY_TOKEN_SET.has(capability)) {
      fail(STAGE_RULE_ERROR_CODES.OVERLAY_INVALID, 'overlay addition family or capability is unregistered',
        { where });
    }
    // Where this addition sits on disk, when the project has a folder for it. Both or neither:
    // the file door checks that the number and the name agree before it moves anything, and a
    // number with no name to check against would turn that agreement into a bare number match.
    if ((op.task_id === undefined) !== (op.folder_name === undefined)) {
      fail(STAGE_RULE_ERROR_CODES.OVERLAY_INVALID,
        'an overlay addition must declare task_id and folder_name together or declare neither',
        { where, artifact_type_id: op.artifact_type_id });
    }
    if (op.task_id !== undefined) {
      assertSafeInteger(op.task_id, `${where}.task_id`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
      if (op.task_id <= 0) {
        fail(STAGE_RULE_ERROR_CODES.OVERLAY_INVALID, 'an overlay addition task_id must be positive',
          { where: `${where}.task_id` });
      }
      assertSafeString(op.folder_name, `${where}.folder_name`, STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
    }
    return Object.freeze({
      op: 'add',
      stage_code: op.stage_code,
      artifact_type_id: op.artifact_type_id,
      label: op.label,
      evidence_level: 'prime_contract',
      source_ref: sourceRef,
      basis: op.basis,
      family,
      required_capability: capability,
      task_id: op.task_id ?? null,
      folder_name: op.folder_name ?? null,
    });
  });
}

// ---------------------------------------------------------------- rule rows

const weakenTo = (current, ceiling) => (PRESENCE_RANK[current] > PRESENCE_RANK[ceiling] ? ceiling : current);

function variantRow(stageCode, sequence, task, conditions, counts) {
  const isFixed = task.is_fixed === true;
  const vocabulary = artifactTypeEntry(task.artifact_type_id);
  const unmapped = vocabulary === null;
  if (unmapped) counts.unmapped += 1;

  // An unmapped row keeps its place in the table under a name that says what it is. Dropping it
  // would hide a real folder, and inventing a token for it would put a name into the shared
  // vocabulary that nothing agreed to.
  const artifactTypeId = unmapped ? `${UNMAPPED_PREFIX}${task.id}` : task.artifact_type_id;
  const family = isFixed || unmapped ? UNMAPPED_FAMILY : vocabulary.family;
  const capability = unmapped ? UNMAPPED_CAPABILITY : vocabulary.capability_default;
  const evidenceLevel = task.evidence_level ?? 'unstated';
  const verificationStatus = task.verification_status ?? DEFAULT_VERIFICATION_STATUS;
  const seFloor = task.se_floor ?? null;
  const maturity = task.maturity ?? null;
  const nodeKind = task.node_kind ?? DEFAULT_NODE_KIND;
  const isVirtual = task.is_virtual === true;

  let presence = EVIDENCE_TO_PRESENCE[evidenceLevel];
  if (isFixed || unmapped) presence = PRESENCE_RULE.OPTIONAL_CONTEXT;
  // An activity or a decision is evidenced by a record rather than by a filed document, and a
  // record can legitimately be answered with "this did not apply here, on this basis". So unless
  // a regulation says the work must happen, such a row is asked for as present-or-not-applicable
  // and never as flatly present.
  if (nodeKind !== DEFAULT_NODE_KIND && evidenceLevel !== 'regulation_mandated') {
    presence = weakenTo(presence, PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE);
  }
  // A guidance row the checklist marked `context` is background rather than a floor: the buyer
  // owns it, or it belongs to a kind of mission this development is not running. Enforcing it
  // would report a gap against something this project was never the one to produce.
  if (evidenceLevel === 'general_se_guidance' && seFloor === 'context') {
    presence = PRESENCE_RULE.OPTIONAL_CONTEXT;
  }
  // The verification status measures support by the canonical (regulation/guidebook) texts. A
  // prime-contract row is supported by the contract, not by those texts, so 'unsupported' and
  // 'unverified' are its expected state and do not weaken it; only an explicit contradiction does.
  // This keeps the layered path (common base + prime overlay) and the merged spec path identical.
  const primeContract = task.evidence_level === 'prime_contract';
  const weakens = primeContract ? verificationStatus === 'contradicted' : WEAKENING_VERIFICATION.has(verificationStatus);
  if (weakens) {
    if (PRESENCE_RANK[presence] > 0) counts.downgraded_unverified += 1;
    presence = PRESENCE_RULE.OPTIONAL_CONTEXT;
  }
  // A conditional row whose condition this project has not declared is not thereby absent: it
  // is a row nobody has yet said applies, which is what present-or-not-applicable means. It can
  // only ever weaken; a condition cannot promote a context row into a required one.
  const appliesWhen = task.applies_when === undefined ? null
    : (Array.isArray(task.applies_when) ? [...task.applies_when] : [task.applies_when]).sort(compareCodePoints);
  if (appliesWhen !== null && !appliesWhen.every((token) => conditions.has(token))) {
    presence = weakenTo(presence, PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE);
  }

  const notApplicableDefault = task.not_applicable_default === true;
  return {
    stage_code: stageCode,
    sequence,
    task_id: task.id,
    artifact_type_id: artifactTypeId,
    family,
    capability,
    evidence_level: evidenceLevel,
    minimum_presence_rule: presence,
    draftability_rule: notApplicableDefault ? DRAFTABILITY.NOT_APPLICABLE : DRAFTABILITY.DEFAULT,
    not_applicable_requires: [notApplicableDefault
      ? NOT_APPLICABLE_BASIS.POLICY_RULE
      : NOT_APPLICABLE_BASIS.OWNER_DECISION],
    source_refs: (task.source_refs ?? []).map((ref) => Object.freeze({
      source_key: ref.source_key, locator: ref.locator,
    })),
    overlay_source_ref: null,
    verification_status: verificationStatus,
    se_floor: seFloor,
    maturity,
    applies_when: appliesWhen,
    origin: ORIGIN.VARIANT,
    alias: null,
    unmapped,
    is_fixed: isFixed,
    node_kind: nodeKind,
    is_virtual: isVirtual,
    gate_role: task.gate_role ?? DEFAULT_GATE_ROLE,
    depends_on_origin: task.depends_on_origin ?? DEFAULT_DEPENDS_ON_ORIGIN,
    // Declared inputs are deduplicated and sorted here so that the order the spec happens to
    // list them in cannot reach a digest or a work order.
    depends_on: [...new Set(task.depends_on ?? [])].sort(compareCodePoints),
    depends_on_evidence: task.depends_on_evidence ?? DEFAULT_DEPENDS_ON_EVIDENCE,
    depends_on_refs: (task.depends_on_refs ?? []).map((ref) => Object.freeze({
      source_key: ref.source_key, locator: ref.locator,
    })),
    overlay_depends_on: [],
    overlay_dependency_refs: [],
    evidence_record: [...new Set(task.evidence_record ?? [])].sort(compareCodePoints),
  };
}

function overlayAddRow(op, sequence) {
  return {
    stage_code: op.stage_code,
    sequence,
    // Null unless the overlay said where this addition lives: an added rule usually has no folder,
    // because nothing generated one for it.
    task_id: op.task_id ?? null,
    folder_name: op.folder_name ?? null,
    artifact_type_id: op.artifact_type_id,
    family: op.family,
    capability: op.required_capability,
    evidence_level: op.evidence_level,
    minimum_presence_rule: EVIDENCE_TO_PRESENCE[op.evidence_level],
    draftability_rule: DRAFTABILITY.DEFAULT,
    not_applicable_requires: [NOT_APPLICABLE_BASIS.OWNER_DECISION],
    source_refs: [Object.freeze({ source_key: op.basis, locator: op.label })],
    overlay_source_ref: op.source_ref,
    // L1 source verification grades a standard rule against a canonical text. An overlay
    // addition is not graded that way: what supports it is the exact contract revision in
    // `overlay_source_ref`, so it carries no L1 status and the weakening rule does not reach it.
    verification_status: null,
    // The guidance floor and the expected maturity are layer ① readings of a canonical text. An
    // overlay addition comes from a contract, which does not grade itself on that scale.
    se_floor: null,
    maturity: null,
    applies_when: null,
    origin: ORIGIN.OVERLAY,
    alias: null,
    unmapped: false,
    is_fixed: false,
    // An `add` op names a contract deliverable, which is a document. An overlay that also wants
    // to say what that deliverable needs first uses `add_dependency`, which is applied after all
    // rows exist and can therefore reach this row too.
    node_kind: DEFAULT_NODE_KIND,
    is_virtual: false,
    // A contract addition is material this project's buyer asked for at that gate, which is what
    // `entry` means. It is not the review's own stated purpose, so it is never `core`.
    gate_role: 'entry',
    depends_on_origin: DEFAULT_DEPENDS_ON_ORIGIN,
    depends_on: [],
    depends_on_evidence: DEFAULT_DEPENDS_ON_EVIDENCE,
    depends_on_refs: [],
    overlay_depends_on: [],
    overlay_dependency_refs: [],
    evidence_record: [],
  };
}

const rowSortKey = (row) => [
  String(row.sequence).padStart(6, '0'),
  row.artifact_type_id,
  row.task_id === null ? '' : String(row.task_id).padStart(9, '0'),
].join('\u001f');

const sortRows = (rows) => [...rows]
  .sort((left, right) => compareCodePoints(rowSortKey(left), rowSortKey(right)));

/**
 * The row that speaks for a group of rows sharing one stage and one artifact type.
 *
 * Two tasks can legitimately point at the same artifact, and the overlay can add a row beside
 * one that is already there. Downstream there is exactly one requirement per stage and type, so
 * one row has to answer for the group; the strongest presence rule wins, and a tie is broken by
 * the lowest task id so that reordering the variant cannot change the answer.
 */
function governingRow(rows) {
  return [...rows].sort((left, right) => {
    const byRank = PRESENCE_RANK[right.minimum_presence_rule] - PRESENCE_RANK[left.minimum_presence_rule];
    if (byRank !== 0) return byRank;
    return compareCodePoints(rowSortKey(left), rowSortKey(right));
  })[0];
}

function groupRowsByType(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.stage_code}\u001f${row.artifact_type_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

// ---------------------------------------------------------------- outputs

function buildExpectedArtifactPolicy(stageOrder, rowsByStage, variant, overlayDigest, binding) {
  const policyId = `se_stage_rule_policy_${canonicalDigest(compilerDomain('policy_id'), {
    support_key: variant.support_key,
    spec_sha256: variant.spec_sha256,
    overlay_digest: overlayDigest,
  }).slice(0, 32)}`;

  const stageFamilyDefaults = stageOrder.map(({ stage_code: stageCode, stage_label: stageLabel }) => {
    const groups = groupRowsByType(rowsByStage.get(stageCode) ?? []);
    const families = [...groups.values()].map((rows) => {
      const row = governingRow(rows);
      return {
        artifact_family_id: row.artifact_type_id,
        artifact_kind: FAMILY_TO_ARTIFACT_KIND[row.family] ?? DEFAULT_ARTIFACT_KIND,
        // The gap-scan template has always carried this field and the compiler has always left
        // it empty, because until D46 no rule table said what an artifact needs first. It is now
        // the union of the declared inputs of every row in the group — the causal edges only,
        // never the stage sequence, which the reader already has from `stage_code`.
        expected_inputs: [...new Set(rows.flatMap((member) => member.depends_on))].sort(compareCodePoints),
        minimum_presence_rule: row.minimum_presence_rule,
        draftability_rule: row.draftability_rule,
        not_applicable_requires: [...row.not_applicable_requires],
        downstream_route_hint: DOWNSTREAM_ROUTE_HINT,
      };
    }).sort((left, right) => compareCodePoints(left.artifact_family_id, right.artifact_family_id));
    return {
      stage_code: stageCode,
      stage_label: stageLabel,
      boss_clear_interpretation: BOSS_CLEAR_INTERPRETATION,
      required_artifact_families: families,
    };
  });

  return {
    schema_version: EXPECTED_ARTIFACT_POLICY_SCHEMA_VERSION,
    workflow_id: WORKFLOW_ID,
    policy_identity: {
      policy_id: policyId,
      // No clock. The instant a compiled policy was created is the instant the caller says it
      // knew the binding it compiled, which is a fact the caller holds and this module does not.
      created_at: binding.known_at,
      owner_surface: OWNER_SURFACE,
      source_basis_refs: [DESIGN_DOC_REF, variant.spec_file],
    },
    stage_family_defaults: stageFamilyDefaults,
    status_vocabulary: [...STATUS_VOCABULARY],
    rules: { ...POLICY_RULES },
  };
}

/**
 * Which document revision a requirement rests on, and how that was decided.
 *
 * The ref is copied rather than shared. Several requirements legitimately rest on the same
 * document, but the engine refuses an input whose object graph is aliased, and it is right to:
 * two requirements that share one object cannot afterwards be shown to have independently
 * agreed on it. The selection is reported so a reader can tell a document that actually claims
 * to cover this artifact from the fallback that merely came first.
 */
function selectRequirementRef(artifactTypeId, binding) {
  const covered = binding.document_refs.find((row) => row.artifact_type_ids_covered.includes(artifactTypeId));
  const source = covered ?? binding.document_refs[0];
  return {
    ref: {
      entity_id: source.requirement_ref.entity_id,
      revision_id: source.requirement_ref.revision_id,
      content_id: source.requirement_ref.content_id,
      content_hash_alg: source.requirement_ref.content_hash_alg,
    },
    selection: covered ? DOCUMENT_REF_SELECTION.COVERED : DOCUMENT_REF_SELECTION.DEFAULT,
  };
}

function buildEngineStagePolicyMaterial(stageOrder, rowsByStage, binding, requirementByRow) {
  const stages = [];
  for (const { stage_code: stageCode, stage_label: stageLabel, sequence } of stageOrder) {
    const groups = groupRowsByType(rowsByStage.get(stageCode) ?? []);
    const requirements = [];
    for (const rows of groups.values()) {
      const row = governingRow(rows);
      // Optional context is not a requirement, and neither is a fixed internal folder. Both stay
      // in the gap-scan policy and the mapping table; neither becomes something the engine can
      // report as a gap.
      if (row.minimum_presence_rule === PRESENCE_RULE.OPTIONAL_CONTEXT || row.family === UNMAPPED_FAMILY) {
        continue;
      }
      const requirementId = `${stageCode}_${row.artifact_type_id}`;
      assertToken(requirementId, 'engine requirement_id', STAGE_RULE_ERROR_CODES.ENGINE_MATERIAL_INVALID);
      const { ref, selection } = selectRequirementRef(row.artifact_type_id, binding);
      const applicability = row.draftability_rule === DRAFTABILITY.NOT_APPLICABLE
        ? false
        : row.minimum_presence_rule === PRESENCE_RULE.OPTIONAL_CONTEXT
          ? 'unknown'
          : binding.applicability_default;
      requirements.push({
        requirement_id: requirementId,
        requirement_kind: row.family,
        required_capability: row.capability,
        requirement_ref: ref,
        authority_family: binding.authority_family,
        applicability,
        valid_at: binding.valid_at,
        known_at: binding.known_at,
      });
      for (const member of rows) {
        requirementByRow.set(member, { requirement_id: requirementId, document_ref_selection: selection });
      }
    }
    if (requirements.length === 0) continue;
    requirements.sort((left, right) => compareCodePoints(left.requirement_id, right.requirement_id));
    if (requirements.every((row) => row.applicability === false)) {
      // The engine refuses a stage with nothing left to judge, and it is right to: a stage whose
      // every requirement is not applicable would report as cleared on no evidence at all.
      fail(STAGE_RULE_ERROR_CODES.ENGINE_MATERIAL_INVALID,
        'a stage would carry no applicable or unresolved requirement',
        { stage_code: stageCode });
    }
    stages.push({ stage_code: stageCode, stage_label: stageLabel, sequence, requirements });
  }
  if (stages.length === 0) {
    fail(STAGE_RULE_ERROR_CODES.ENGINE_MATERIAL_INVALID,
      'no target stage produced an engine requirement', {});
  }
  return { schema_version: ENGINE_STAGE_POLICY_SCHEMA_VERSION, stages };
}

const emptyCounts = () => ({
  rows: 0,
  by_evidence_level: Object.fromEntries(EVIDENCE_LEVELS.map((level) => [level, 0])),
  by_presence_rule: Object.fromEntries(Object.values(PRESENCE_RULE).map((rule) => [rule, 0])),
  by_node_kind: Object.fromEntries(NODE_KINDS.map((kind) => [kind, 0])),
  by_gate_role: Object.fromEntries(GATE_ROLES.map((role) => [role, 0])),
  engine_requirements: 0,
  not_applicable: 0,
  overlay_added: 0,
  overlay_strengthened: 0,
  overlay_aliases: 0,
  overlay_out_of_scope: 0,
  overlay_dependencies_added: 0,
  unmapped: 0,
  downgraded_unverified: 0,
  // D46 bookkeeping. `dependency_edges` counts declared (row, input) pairs after deduplication;
  // `unresolved_dependency` counts the ones naming a token nothing in this model owns, which is
  // recorded rather than refused so that one mistyped input cannot take a whole variant down.
  virtual_rows: 0,
  dependency_edges: 0,
  unresolved_dependency: 0,
});

// ---------------------------------------------------------------- entry points

/**
 * Compiles one standard rule table plus one project overlay into the three consumer surfaces.
 *
 * @param request `{ compiled_variant, overlay, project_binding, target_stage_codes, overlay_conditions }`
 * @returns deeply frozen `{ expected_artifact_policy, engine_stage_policy_material,
 *          needs_stage_declarations, mapping_table, receipt }`
 */
export function compileStageRules(request) {
  assertExactKeys(request, REQUEST_FIELDS, [], 'request');
  const variant = request.compiled_variant;
  const gatesByStage = validateCompiledVariant(variant);
  const binding = validateProjectBinding(request.project_binding);

  const targetStageCodes = assertArray(request.target_stage_codes, 'request.target_stage_codes', MAX.gates);
  if (targetStageCodes.length === 0) {
    fail(STAGE_RULE_ERROR_CODES.REQUEST_INVALID, 'request.target_stage_codes must name at least one stage',
      { where: 'request.target_stage_codes' });
  }
  const targets = new Set();
  targetStageCodes.forEach((code, index) => {
    const where = `request.target_stage_codes[${index}]`;
    if (!STAGE_CODES.has(code)) {
      fail(STAGE_RULE_ERROR_CODES.STAGE_CODE_UNKNOWN, 'target stage code is not an engine stage code', { where });
    }
    if (targets.has(code)) {
      fail(STAGE_RULE_ERROR_CODES.REQUEST_INVALID, 'target stage code is named twice', { where });
    }
    if (!gatesByStage.has(code)) {
      // Compiling a stage the variant never described would hand back an empty rule set that
      // reads like "this stage expects nothing". The caller is asking the wrong variant.
      fail(STAGE_RULE_ERROR_CODES.REQUEST_INVALID, 'the compiled variant declares no gate for a target stage',
        { where, stage_code: code });
    }
    targets.add(code);
  });

  const conditions = new Set();
  const overlayConditions = assertArray(request.overlay_conditions, 'request.overlay_conditions', MAX.conditions);
  overlayConditions.forEach((token, index) => {
    assertToken(token, `request.overlay_conditions[${index}]`);
    conditions.add(token);
  });

  const ops = request.overlay === null || request.overlay === undefined
    ? []
    : validateOverlay(request.overlay, variant);
  // Conditions are collected before any row is built. A `condition` op that arrived after the
  // rows were graded would leave the same overlay meaning two different things depending on the
  // order its operations happen to be written in.
  for (const op of ops) if (op.op === 'condition') conditions.add(op.token);

  const counts = emptyCounts();
  const stageOrder = [...targets]
    .map((stageCode) => ({
      stage_code: stageCode,
      stage_label: gatesByStage.get(stageCode).name,
      sequence: STAGE_CODE_TO_SEQUENCE.get(stageCode),
    }))
    .sort((left, right) => left.sequence - right.sequence);

  const rows = [];
  for (const { stage_code: stageCode, sequence } of stageOrder) {
    for (const task of gatesByStage.get(stageCode).tasks) {
      rows.push(variantRow(stageCode, sequence, task, conditions, counts));
    }
  }

  // An overlay operation names a stage and an artifact type, never a task. Two tasks can point
  // at the same artifact, so the index holds every row of a group and an operation reaches all
  // of them; reaching only one would make the result depend on which task the variant happened
  // to list last, which is the ordering sensitivity this compiler exists to remove.
  const rowIndex = new Map();
  const indexRow = (row) => {
    const key = `${row.stage_code}\u001f${row.artifact_type_id}`;
    if (!rowIndex.has(key)) rowIndex.set(key, []);
    rowIndex.get(key).push(row);
  };
  for (const row of rows) indexRow(row);
  for (const op of ops) {
    if (op.op === 'condition') continue;
    if (!targets.has(op.stage_code)) {
      // The overlay belongs to the project, not to this compile. An operation for a stage nobody
      // asked about is skipped rather than refused, and counted rather than skipped silently.
      counts.overlay_out_of_scope += 1;
      continue;
    }
    const key = `${op.stage_code}\u001f${op.artifact_type_id}`;
    if (op.op === 'add') {
      const existing = rowIndex.get(key);
      if (existing !== undefined) {
        // A buyer or contract may require an artifact the standard table only carries as
        // context (optional_context: unstated, unverified, or downgraded). The overlay may then
        // add its own prime_contract row beside the standard row — the standard row keeps its
        // own evidence grade untouched, the group is governed by the strongest presence rule,
        // and the receipt counts the strengthening. Where the standard already requires the
        // artifact (present / present_or_not_applicable) an addition would only restate or
        // regrade it, which D45 forbids.
        const onlyContext = existing.every((row) => row.minimum_presence_rule === PRESENCE_RULE.OPTIONAL_CONTEXT);
        if (!onlyContext) {
          fail(STAGE_RULE_ERROR_CODES.OVERLAY_FORBIDDEN,
            'an overlay addition names a rule the standard table already requires',
            { stage_code: op.stage_code, artifact_type_id: op.artifact_type_id });
        }
        counts.overlay_strengthened += 1;
      }
      const row = overlayAddRow(op, STAGE_CODE_TO_SEQUENCE.get(op.stage_code));
      rows.push(row);
      indexRow(row);
      counts.overlay_added += 1;
      continue;
    }
    const targeted = rowIndex.get(key);
    if (targeted === undefined) {
      // This is a REFUSAL, not a soft report, and it is worth being explicit about because the
      // two look similar from a distance. `receipt.unresolved_dependencies` names inputs that
      // resolve to nothing, and the packet generator's `unbound_observations` names observations
      // that reach no requirement; both are recorded because losing them silently would only
      // cost information. An `alias` or `mark_not_applicable` is different: it is a project
      // asserting something about a rule, and if that rule is not there the assertion has already
      // failed. Continuing would apply an overlay that means less than it says.
      //
      // The practical consequence (D44, 2026-08-19): correcting a token assignment on a spec row
      // breaks any project overlay that named the old token at that stage, loudly and at compile
      // time. The detail below carries the op, the stage and the token so the overlay can be
      // re-pointed. A stale `extends.spec_sha256` is caught even earlier, by
      // OVERLAY_BASE_MISMATCH, so an overlay written against an older spec revision never reaches
      // this check at all.
      fail(STAGE_RULE_ERROR_CODES.OVERLAY_INVALID, 'an overlay operation names a rule that does not exist',
        { op: op.op, stage_code: op.stage_code, artifact_type_id: op.artifact_type_id });
    }
    if (op.op === 'alias') {
      for (const row of targeted) row.alias = op.alias;
      counts.overlay_aliases += 1;
    } else if (op.op === 'add_dependency') {
      // Additive only: the union of what the standard table already said and what this project's
      // document adds. The overlay's own tokens are also recorded separately, so a reader can
      // always tell a canonical edge from one this project asked for.
      for (const row of targeted) {
        row.depends_on = [...new Set([...row.depends_on, ...op.depends_on])].sort(compareCodePoints);
        row.overlay_depends_on = [...new Set([...row.overlay_depends_on, ...op.depends_on])]
          .sort(compareCodePoints);
        row.overlay_dependency_refs = [
          ...row.overlay_dependency_refs,
          Object.freeze({ source_ref: op.source_ref, basis: op.basis }),
        ];
      }
      counts.overlay_dependencies_added += 1;
    } else {
      for (const row of targeted) {
        row.draftability_rule = DRAFTABILITY.NOT_APPLICABLE;
        row.not_applicable_requires = [NOT_APPLICABLE_BASIS.OWNER_DECISION];
      }
    }
  }

  // Which artifact, activity, and decision tokens this compile actually produces somewhere. An
  // input naming one of them is an edge inside this rule set; an input naming a token the shared
  // vocabulary owns but this compile does not produce is a real dependency on work outside the
  // compiled scope; anything else is a token nothing owns.
  const producedTokens = new Set(rows.map((row) => row.artifact_type_id));
  const unresolvedDependencies = [];
  for (const row of rows) {
    counts.rows += 1;
    counts.by_evidence_level[row.evidence_level] += 1;
    counts.by_presence_rule[row.minimum_presence_rule] += 1;
    counts.by_node_kind[row.node_kind] += 1;
    counts.by_gate_role[row.gate_role] += 1;
    if (row.is_virtual) counts.virtual_rows += 1;
    if (row.draftability_rule === DRAFTABILITY.NOT_APPLICABLE) counts.not_applicable += 1;

    const inScope = [];
    const external = [];
    const unresolved = [];
    for (const token of row.depends_on) {
      if (producedTokens.has(token)) inScope.push(token);
      else if (artifactTypeEntry(token) !== null) external.push(token);
      else unresolved.push(token);
    }
    row.dependency_resolution = Object.freeze({
      in_scope: Object.freeze(inScope),
      out_of_scope: Object.freeze(external),
      unresolved: Object.freeze(unresolved),
    });
    counts.dependency_edges += row.depends_on.length;
    counts.unresolved_dependency += unresolved.length;
    if (unresolved.length > 0) {
      unresolvedDependencies.push({
        stage_code: row.stage_code,
        artifact_type_id: row.artifact_type_id,
        task_id: row.task_id,
        depends_on: [...unresolved],
      });
    }
  }
  unresolvedDependencies.sort((left, right) => compareCodePoints(
    `${left.stage_code}${left.artifact_type_id}${left.task_id ?? ''}`,
    `${right.stage_code}${right.artifact_type_id}${right.task_id ?? ''}`,
  ));

  const ordered = sortRows(rows);
  const rowsByStage = new Map(stageOrder.map(({ stage_code: stageCode }) => [stageCode, []]));
  for (const row of ordered) rowsByStage.get(row.stage_code).push(row);

  const requirementByRow = new Map();
  const engineStagePolicyMaterial = buildEngineStagePolicyMaterial(stageOrder, rowsByStage, binding, requirementByRow);
  counts.engine_requirements = engineStagePolicyMaterial.stages
    .reduce((total, stage) => total + stage.requirements.length, 0);

  const overlayDigest = request.overlay === null || request.overlay === undefined
    ? canonicalDigest(compilerDomain('overlay'), { present: false })
    : canonicalDigest(compilerDomain('overlay'), { present: true, overlay: request.overlay });

  const expectedArtifactPolicy = buildExpectedArtifactPolicy(
    stageOrder, rowsByStage, variant, overlayDigest, binding,
  );

  const mappingTable = ordered.map((row) => {
    const bound = requirementByRow.get(row) ?? null;
    return {
      stage_code: row.stage_code,
      task_id: row.task_id,
      // Only an overlay addition carries this: a spec row's folder name is the row's own `name`,
      // which the folder tree already generated from. An added rule has no spec row, so when a
      // project has a folder for it the overlay is the only place that can say which one.
      folder_name: row.folder_name ?? null,
      artifact_type_id: row.artifact_type_id,
      origin: row.origin,
      node_kind: row.node_kind,
      is_virtual: row.is_virtual,
      gate_role: row.gate_role,
      depends_on_origin: row.depends_on_origin,
      evidence_level: row.evidence_level,
      se_floor: row.se_floor,
      maturity: row.maturity,
      minimum_presence_rule: row.minimum_presence_rule,
      engine_requirement_id: bound === null ? null : bound.requirement_id,
      document_ref_selection: bound === null ? null : bound.document_ref_selection,
      alias: row.alias,
      source_refs: row.source_refs.map((ref) => ({ source_key: ref.source_key, locator: ref.locator })),
      overlay_source_ref: row.overlay_source_ref,
      depends_on: [...row.depends_on],
      depends_on_evidence: row.depends_on_evidence,
      depends_on_refs: row.depends_on_refs.map((ref) => ({ source_key: ref.source_key, locator: ref.locator })),
      overlay_depends_on: [...row.overlay_depends_on],
      // Which document this project's added edges rest on. Always present, usually empty: an edge
      // the canonical table already stated is provenanced by `depends_on_refs` instead.
      overlay_dependency_refs: row.overlay_dependency_refs.map((entry) => ({
        source_ref: { ...entry.source_ref }, basis: entry.basis,
      })),
      dependency_resolution: {
        in_scope: [...row.dependency_resolution.in_scope],
        out_of_scope: [...row.dependency_resolution.out_of_scope],
        unresolved: [...row.dependency_resolution.unresolved],
      },
      evidence_record: [...row.evidence_record],
    };
  });

  const artifactTypeIds = [...new Set(ordered.map((row) => row.artifact_type_id))]
    .sort(compareCodePoints);
  const needsStageDeclarations = {
    stages: stageOrder.map(({ stage_code: stageCode, sequence }) => ({ stage_code: stageCode, sequence })),
    artifact_type_ids: artifactTypeIds,
  };

  const receipt = {
    schema_version: STAGE_RULE_COMPILER_SCHEMA_VERSION,
    compiler_version: COMPILER_VERSION,
    deterministic: true,
    claim_ceiling: 'observed',
    input_digests: {
      compiled_variant: canonicalDigest(compilerDomain('compiled_variant'), variant),
      overlay: overlayDigest,
      project_binding: canonicalDigest(compilerDomain('project_binding'), request.project_binding),
      target_stage_codes: canonicalDigest(compilerDomain('target_stage_codes'), [...targetStageCodes]),
      overlay_conditions: canonicalDigest(compilerDomain('overlay_conditions'), [...overlayConditions]),
    },
    output_digests: {
      expected_artifact_policy: canonicalDigest(compilerDomain('expected_artifact_policy'), expectedArtifactPolicy),
      engine_stage_policy_material: canonicalDigest(
        compilerDomain('engine_stage_policy_material'), engineStagePolicyMaterial,
      ),
      mapping_table: canonicalDigest(compilerDomain('mapping_table'), mappingTable),
    },
    counts,
    // Named rather than only counted: an input that resolves to nothing is a rule-authoring
    // mistake somebody has to go and fix, and a bare number does not say which row to open.
    unresolved_dependencies: unresolvedDependencies,
    effects: {
      erp_writes: 0,
      filesystem_writes: 0,
      model_calls: 0,
      network_calls: 0,
      clock_reads: 0,
    },
  };

  return deepFreeze({
    expected_artifact_policy: expectedArtifactPolicy,
    engine_stage_policy_material: engineStagePolicyMaterial,
    needs_stage_declarations: needsStageDeclarations,
    mapping_table: mappingTable,
    receipt,
  });
}

// ---------------------------------------------------------------- cross-layer edge projection

export const GENERIC_EDGE_PROJECTION_SCHEMA_VERSION = 'soulforge.se_generic_edge_projection.v0';
const PROJECTED_EDGE_EVIDENCE = 'general_se_guidance';

/**
 * Carries the buyer- and country-independent layer's input relations across to a national layer.
 *
 * Why this is needed at all: the generic layer states its relations bipartitely — an artifact
 * needs an activity, and that activity needs artifacts. The national layer has almost none of
 * those activity rows, so nothing joined the two and the national tables were left with no
 * artifact-to-artifact ordering at all.
 *
 * So each projected edge is a COMPOSITION of two statements the generic layer does make, through
 * one activity: `A is an input of activity X` and `X produces B` give `B needs A`. That is a
 * sound composition, but it is not a sentence any canonical text wrote, which is why the result
 * never rises above `general_se_guidance`, always records the activity it went through, and is
 * marked `generic_layer_projection` in the row it lands on. The national layer's own edges
 * outrank it wherever both exist.
 *
 * Both endpoints must exist in the national layer, and the input must be required at the same
 * gate or an earlier one — an edge to something the national layer only asks for later would say
 * "wait for a thing that has not been asked for yet".
 *
 * Pure: the caller reads and writes the files.
 *
 * @param request `{ generic_variant, national_variant }`, both compiled variant JSON
 * @returns deeply frozen `{schema_version, projections[], receipt}`
 */
export function projectGenericLayerEdges(request) {
  assertExactKeys(request, ['generic_variant', 'national_variant'], [], 'projection request');
  const generic = request.generic_variant;
  const national = request.national_variant;
  validateCompiledVariant(generic);
  validateCompiledVariant(national);

  // Where each layer asks for each token, by gate code.
  const gatesOfToken = (variant) => {
    const map = new Map();
    for (const gate of variant.gates) {
      for (const task of gate.tasks) {
        if (!task.artifact_type_id) continue;
        if (!map.has(task.artifact_type_id)) map.set(task.artifact_type_id, []);
        map.get(task.artifact_type_id).push(gate.code);
      }
    }
    for (const codes of map.values()) codes.sort((left, right) => left - right);
    return map;
  };
  const nationalGates = gatesOfToken(national);
  const firstNationalGate = new Map([...nationalGates].map(([token, codes]) => [token, codes[0]]));

  // The generic layer's activity rows, by token, with the gate they sit at and what they need.
  const activityRows = [];
  const producedBy = new Map(); // activity token -> [{token, gate_code, refs}]
  for (const gate of generic.gates) {
    for (const task of gate.tasks) {
      if (!task.artifact_type_id) continue;
      const kind = task.node_kind ?? DEFAULT_NODE_KIND;
      if (kind !== DEFAULT_NODE_KIND) {
        activityRows.push({
          token: task.artifact_type_id,
          gate_code: gate.code,
          inputs: [...new Set(task.depends_on ?? [])].sort(compareCodePoints),
          refs: task.depends_on_refs ?? [],
        });
        continue;
      }
      for (const producer of task.depends_on ?? []) {
        if (!producedBy.has(producer)) producedBy.set(producer, []);
        producedBy.get(producer).push({
          token: task.artifact_type_id, gate_code: gate.code, refs: task.depends_on_refs ?? [],
        });
      }
    }
  }
  activityRows.sort((left, right) => left.gate_code - right.gate_code
    || compareCodePoints(left.token, right.token));

  const counts = {
    generic_activity_rows: activityRows.length,
    composed_generic_edges: 0,
    projected_edges: 0,
    dropped_endpoint_absent: 0,
    dropped_input_not_yet_required: 0,
    dropped_self_edge: 0,
    rows_touched: 0,
  };
  const byRow = new Map();

  for (const activity of activityRows) {
    for (const product of producedBy.get(activity.token) ?? []) {
      // The statement of what the activity needs has to be the one that was current when the
      // product was due: the latest activity row at or before the product's gate.
      const current = activityRows
        .filter((row) => row.token === activity.token && row.gate_code <= product.gate_code)
        .pop();
      if (current === undefined || current.gate_code !== activity.gate_code) continue;
      for (const input of current.inputs) {
        counts.composed_generic_edges += 1;
        const target = nationalTokenFor(product.token);
        const source = nationalTokenFor(input);
        if (target === source) { counts.dropped_self_edge += 1; continue; }
        const targetGates = nationalGates.get(target);
        if (targetGates === undefined || !nationalGates.has(source)) {
          counts.dropped_endpoint_absent += 1;
          continue;
        }
        let landed = false;
        for (const gateCode of targetGates) {
          if (firstNationalGate.get(source) > gateCode) continue;
          const key = `${gateCode}${target}`;
          if (!byRow.has(key)) {
            byRow.set(key, {
              gate_code: gateCode,
              artifact_type_id: target,
              depends_on: new Set(),
              via: new Set(),
              refs: [],
            });
          }
          const entry = byRow.get(key);
          entry.depends_on.add(source);
          entry.via.add(activity.token);
          for (const ref of [...current.refs, ...product.refs]) {
            if (!entry.refs.some((seen) => seen.source_key === ref.source_key && seen.locator === ref.locator)) {
              entry.refs.push({ source_key: ref.source_key, locator: ref.locator });
            }
          }
          landed = true;
        }
        if (landed) counts.projected_edges += 1;
        else counts.dropped_input_not_yet_required += 1;
      }
    }
  }

  const projections = [...byRow.values()]
    .map((entry) => ({
      gate_code: entry.gate_code,
      artifact_type_id: entry.artifact_type_id,
      depends_on: [...entry.depends_on].sort(compareCodePoints),
      via_activity: [...entry.via].sort(compareCodePoints),
      depends_on_evidence: PROJECTED_EDGE_EVIDENCE,
      depends_on_origin: 'generic_layer_projection',
      depends_on_refs: entry.refs
        .sort((left, right) => compareCodePoints(`${left.source_key}${left.locator}`,
          `${right.source_key}${right.locator}`)),
    }))
    .sort((left, right) => left.gate_code - right.gate_code
      || compareCodePoints(left.artifact_type_id, right.artifact_type_id));
  counts.rows_touched = projections.length;

  return deepFreeze({
    schema_version: GENERIC_EDGE_PROJECTION_SCHEMA_VERSION,
    generic_support_key: generic.support_key,
    national_support_key: national.support_key,
    equivalence_used: CROSS_LAYER_TOKEN_EQUIVALENCE.map((row) => ({ ...row })),
    projections,
    receipt: {
      schema_version: GENERIC_EDGE_PROJECTION_SCHEMA_VERSION,
      deterministic: true,
      claim_ceiling: 'observed',
      composition_rule: 'input_of(A, X) and produces(X, B) give depends_on(B, A); never stronger than general_se_guidance',
      counts,
      effects: {
        erp_writes: 0, filesystem_writes: 0, model_calls: 0, network_calls: 0, clock_reads: 0,
      },
    },
  });
}

// ---------------------------------------------------------------- work order (D46)

export const STAGE_WORK_ORDER_SCHEMA_VERSION = 'soulforge.se_stage_work_order.v0';

// The custody states a per-artifact observation can carry, restated from the pilot packet
// generator rather than imported for the same reason the policy revision is restated: this
// module's import graph is pinned. The generator's test asserts the two lists agree.
export const OBSERVATION_PRESENCE_STATES = Object.freeze(['present', 'unknown', 'absence_confirmed']);
const OBSERVED_PRESENT = 'present';
const UNOBSERVED = 'unobserved';
const OBSERVATION_FIELDS = Object.freeze(['artifact_type_id', 'presence_state']);

// Which tie-breaks this ordering actually applies, and which one it cannot. The plan asks for
// "gate entrance criteria first", but no rule spec marks which rows are a gate's entrance
// criteria, and inventing that marking here would be the compiler writing a rule. So the
// tie-break is declared skipped and named, rather than approximated.
const WORK_ORDER_TIE_BREAKS_APPLIED = Object.freeze([
  'dependency_topological_within_stage',
  'unblocked_before_blocked',
  'evidence_rank',
  'gate_role_rank',
  'dependents_count_desc',
  'artifact_type_id',
]);
const WORK_ORDER_TIE_BREAKS_SKIPPED = Object.freeze([]);

function validateObservations(observations) {
  const rows = assertArray(observations, 'observations', MAX.tasks,
    STAGE_RULE_ERROR_CODES.WORK_ORDER_INVALID);
  const byToken = new Map();
  rows.forEach((row, index) => {
    const where = `observations[${index}]`;
    assertExactKeys(row, OBSERVATION_FIELDS, [], where, STAGE_RULE_ERROR_CODES.WORK_ORDER_INVALID);
    assertToken(row.artifact_type_id, `${where}.artifact_type_id`, STAGE_RULE_ERROR_CODES.WORK_ORDER_INVALID);
    assertEnum(row.presence_state, OBSERVATION_PRESENCE_STATES, `${where}.presence_state`,
      STAGE_RULE_ERROR_CODES.WORK_ORDER_INVALID);
    if (byToken.has(row.artifact_type_id)) {
      // Two states for one artifact is not something to average. The caller has to say which
      // one it means before anything can be ordered against it.
      fail(STAGE_RULE_ERROR_CODES.WORK_ORDER_INVALID, 'one artifact type carries two observations',
        { where, artifact_type_id: row.artifact_type_id });
    }
    byToken.set(row.artifact_type_id, row.presence_state);
  });
  return byToken;
}

/**
 * Turns a compile result into "what to do first", per target stage.
 *
 * Two different things are being separated here, and keeping them apart is the whole point.
 *
 * - A **causal edge** (`depends_on`) says one piece of work needs another's result. It comes from
 *   a canonical text that said so, or it is `unstated` practice. It is a property of the rules.
 * - The **stage sequence** says which review comes first. It comes from the lifecycle, not from
 *   any input relation. An input produced at an earlier stage is already ordered by that, which
 *   is why the topological pass only has to run inside one stage.
 *
 * Observations mark what is already done; they do not reorder the rules. An item whose declared
 * inputs are all observed present sorts ahead of one still waiting, but an edge between two items
 * stays an edge whatever has been observed, so the same rule set always yields the same shape.
 *
 * With no observations at all — the empty project — every declared input is unsatisfied, so a
 * stage opens with the items that need nothing first.
 *
 * Among items the rules do not separate, two further questions decide which is offered first, and
 * both are read off the rules rather than guessed. What is the item TO this gate — the thing the
 * review exists to produce (`core`), material it expects on the table (`entry`), or the rest? And
 * how much later work names it as an input? An artifact half the programme depends on is worth
 * starting before one nothing waits for, which is what stops a centrepiece specification from
 * being buried alphabetically among plans.
 *
 * @param compileResult the return value of `compileStageRules`
 * @param observations optional `[{artifact_type_id, presence_state}]`, the per-artifact projection
 *        of the pilot packet's `artifact_observations`
 * @returns deeply frozen `{schema_version, stages, receipt}`
 */
export function orderStageWork(compileResult, observations = []) {
  assertPlainObject(compileResult, 'compile_result', STAGE_RULE_ERROR_CODES.WORK_ORDER_INVALID);
  const mappingTable = assertArray(compileResult.mapping_table, 'compile_result.mapping_table',
    MAX.gates * MAX.tasks, STAGE_RULE_ERROR_CODES.WORK_ORDER_INVALID);
  assertPlainObject(compileResult.needs_stage_declarations, 'compile_result.needs_stage_declarations',
    STAGE_RULE_ERROR_CODES.WORK_ORDER_INVALID);
  const stageDeclarations = assertArray(compileResult.needs_stage_declarations.stages,
    'compile_result.needs_stage_declarations.stages', MAX.gates, STAGE_RULE_ERROR_CODES.WORK_ORDER_INVALID);
  if (mappingTable.length === 0) {
    fail(STAGE_RULE_ERROR_CODES.WORK_ORDER_INVALID, 'a compile result with no mapping row orders nothing', {});
  }
  const observedByToken = validateObservations(observations);

  const stageSequence = new Map(stageDeclarations.map((row) => [row.stage_code, row.sequence]));

  // One node per (stage, artifact type). Context rows are nodes too: a required item can sit
  // downstream of one, and dropping it would lose that ordering.
  const nodes = new Map();
  const nodeKey = (stageCode, token) => `${stageCode}${token}`;
  const producingStages = new Map();
  for (const row of mappingTable) {
    const key = nodeKey(row.stage_code, row.artifact_type_id);
    let node = nodes.get(key);
    if (node === undefined) {
      node = {
        stage_code: row.stage_code,
        stage_sequence: stageSequence.get(row.stage_code) ?? STAGE_CODE_TO_SEQUENCE.get(row.stage_code) ?? 0,
        artifact_type_id: row.artifact_type_id,
        node_kind: row.node_kind ?? DEFAULT_NODE_KIND,
        is_virtual: row.is_virtual === true,
        gate_role: row.gate_role ?? DEFAULT_GATE_ROLE,
        depends_on_origin: row.depends_on_origin ?? DEFAULT_DEPENDS_ON_ORIGIN,
        evidence_level: row.evidence_level,
        minimum_presence_rule: row.minimum_presence_rule,
        engine_requirement_id: row.engine_requirement_id ?? null,
        alias: row.alias ?? null,
        evidence_record: [],
        declared: new Set(),
        in_scope: new Set(),
        out_of_scope: new Set(),
        unresolved: new Set(),
      };
      nodes.set(key, node);
    }
    // The row that speaks for the group is the one the engine bound to a requirement; failing
    // that, the strongest presence rule. Same rule as `governingRow`, read off the table.
    if (node.engine_requirement_id === null && row.engine_requirement_id !== null) {
      node.engine_requirement_id = row.engine_requirement_id;
      node.evidence_level = row.evidence_level;
      node.minimum_presence_rule = row.minimum_presence_rule;
      node.node_kind = row.node_kind ?? DEFAULT_NODE_KIND;
    } else if (PRESENCE_RANK[row.minimum_presence_rule] > PRESENCE_RANK[node.minimum_presence_rule]) {
      node.evidence_level = row.evidence_level;
      node.minimum_presence_rule = row.minimum_presence_rule;
    }
    // The strongest role any row of the group carries speaks for the group: if one row says this
    // artifact is what the review is for, the group is core.
    if (GATE_ROLE_RANK[row.gate_role ?? DEFAULT_GATE_ROLE] < GATE_ROLE_RANK[node.gate_role]) {
      node.gate_role = row.gate_role;
    }
    if (row.depends_on_origin !== undefined && row.depends_on_origin !== node.depends_on_origin) {
      node.depends_on_origin = 'mixed';
    }
    if (row.alias !== null && row.alias !== undefined) node.alias = row.alias;
    if (row.is_virtual === true) node.is_virtual = true;
    for (const token of row.evidence_record ?? []) node.evidence_record.push(token);
    for (const token of row.depends_on ?? []) node.declared.add(token);
    const resolution = row.dependency_resolution ?? { in_scope: [], out_of_scope: [], unresolved: [] };
    for (const token of resolution.in_scope) node.in_scope.add(token);
    for (const token of resolution.out_of_scope) node.out_of_scope.add(token);
    for (const token of resolution.unresolved) node.unresolved.add(token);

    if (!producingStages.has(row.artifact_type_id)) producingStages.set(row.artifact_type_id, new Set());
    producingStages.get(row.artifact_type_id).add(row.stage_code);
  }

  // How much later work names each token as an input, counted once per work item over every
  // target stage of this compile. It is a property of the compiled rule set, so it is computed
  // before any stage is ordered and is the same number wherever the token appears. A context row
  // does not count as a dependent: it is not work anybody is asked to do.
  const dependentsCount = new Map();
  for (const node of nodes.values()) {
    if (node.engine_requirement_id === null) continue;
    for (const token of node.declared) {
      if (token === node.artifact_type_id) continue;
      dependentsCount.set(token, (dependentsCount.get(token) ?? 0) + 1);
    }
  }

  const counts = {
    stages: 0,
    work_items: 0,
    by_gate_role: Object.fromEntries(GATE_ROLES.map((role) => [role, 0])),
    context_items: 0,
    ordering_edges: 0,
    forward_dependency: 0,
    earlier_stage_dependency: 0,
    out_of_scope_dependency: 0,
    unresolved_dependency: 0,
    ready_at_start: 0,
    blocked_at_start: 0,
    observed_present: 0,
  };

  const stages = [];
  for (const { stage_code: stageCode, sequence } of [...stageDeclarations]
    .sort((left, right) => left.sequence - right.sequence)) {
    const stageNodes = [...nodes.values()].filter((node) => node.stage_code === stageCode);
    if (stageNodes.length === 0) continue;
    counts.stages += 1;

    const prepared = stageNodes.map((node) => {
      const declared = [...node.declared].sort(compareCodePoints);
      const sameStage = [];
      const earlier = [];
      const forward = [];
      for (const token of [...node.in_scope].sort(compareCodePoints)) {
        const producers = producingStages.get(token) ?? new Set();
        if (producers.has(stageCode)) sameStage.push(token);
        else {
          const sequences = [...producers].map((code) => stageSequence.get(code)
            ?? STAGE_CODE_TO_SEQUENCE.get(code) ?? 0);
          if (sequences.some((value) => value < sequence)) earlier.push(token);
          else forward.push(token);
        }
      }
      const satisfied = declared.filter((token) => observedByToken.get(token) === OBSERVED_PRESENT);
      const blockedBy = declared.filter((token) => observedByToken.get(token) !== OBSERVED_PRESENT);
      counts.earlier_stage_dependency += earlier.length;
      counts.forward_dependency += forward.length;
      counts.out_of_scope_dependency += node.out_of_scope.size;
      counts.unresolved_dependency += node.unresolved.size;
      const observationState = observedByToken.get(node.artifact_type_id) ?? UNOBSERVED;
      if (observationState === OBSERVED_PRESENT) counts.observed_present += 1;
      if (blockedBy.length === 0) counts.ready_at_start += 1; else counts.blocked_at_start += 1;
      return {
        node,
        same_stage_inputs: sameStage,
        earlier_stage_inputs: earlier,
        forward_stage_inputs: forward,
        out_of_scope_inputs: [...node.out_of_scope].sort(compareCodePoints),
        unresolved_inputs: [...node.unresolved].sort(compareCodePoints),
        satisfied_inputs: satisfied,
        blocked_by: blockedBy,
        declared,
        dependents_count: dependentsCount.get(node.artifact_type_id) ?? 0,
        observation_state: observationState,
      };
    });

    const byToken = new Map(prepared.map((item) => [item.node.artifact_type_id, item]));
    const indegree = new Map(prepared.map((item) => [item.node.artifact_type_id, 0]));
    const dependents = new Map(prepared.map((item) => [item.node.artifact_type_id, []]));
    for (const item of prepared) {
      for (const token of item.same_stage_inputs) {
        if (!byToken.has(token) || token === item.node.artifact_type_id) continue;
        dependents.get(token).push(item.node.artifact_type_id);
        indegree.set(item.node.artifact_type_id, indegree.get(item.node.artifact_type_id) + 1);
        counts.ordering_edges += 1;
      }
    }

    const sortKey = (item) => [
      item.blocked_by.length === 0 ? '0' : '1',
      String(EVIDENCE_WORK_RANK[item.node.evidence_level] ?? 9),
      String(GATE_ROLE_RANK[item.node.gate_role] ?? 9),
      // Inverted and zero-padded so that a plain code-point comparison sorts it descending:
      // what more of the programme is waiting on is offered first.
      String(9999 - Math.min(9999, item.dependents_count)).padStart(4, '0'),
      item.node.artifact_type_id,
    ].join('');
    const emitted = [];
    const ready = prepared.filter((item) => indegree.get(item.node.artifact_type_id) === 0);
    while (ready.length > 0) {
      ready.sort((left, right) => compareCodePoints(sortKey(left), sortKey(right)));
      const next = ready.shift();
      emitted.push(next);
      for (const token of dependents.get(next.node.artifact_type_id)) {
        const remaining = indegree.get(token) - 1;
        indegree.set(token, remaining);
        if (remaining === 0) ready.push(byToken.get(token));
      }
    }
    if (emitted.length !== prepared.length) {
      // A ring of inputs has no first item. Emitting some arbitrary member would be the compiler
      // deciding a question the rules left contradictory, so this is refused and named.
      const stuck = prepared
        .filter((item) => indegree.get(item.node.artifact_type_id) > 0)
        .map((item) => item.node.artifact_type_id)
        .sort(compareCodePoints);
      fail(STAGE_RULE_ERROR_CODES.DEPENDENCY_CYCLE,
        'the declared inputs of one stage form a cycle, so no item can come first',
        { stage_code: stageCode, artifact_type_ids: stuck });
    }

    const workItems = [];
    for (const item of emitted) {
      if (item.node.engine_requirement_id === null) {
        counts.context_items += 1;
        continue;
      }
      counts.by_gate_role[item.node.gate_role] += 1;
      workItems.push({
        order_index: workItems.length,
        stage_code: stageCode,
        artifact_type_id: item.node.artifact_type_id,
        node_kind: item.node.node_kind,
        is_virtual: item.node.is_virtual,
        gate_role: item.node.gate_role,
        gate_role_rank: GATE_ROLE_RANK[item.node.gate_role] ?? 9,
        dependents_count: item.dependents_count,
        depends_on_origin: item.node.depends_on_origin,
        evidence_level: item.node.evidence_level,
        evidence_rank: EVIDENCE_WORK_RANK[item.node.evidence_level] ?? 9,
        minimum_presence_rule: item.node.minimum_presence_rule,
        engine_requirement_id: item.node.engine_requirement_id,
        alias: item.node.alias,
        evidence_record: [...new Set(item.node.evidence_record)].sort(compareCodePoints),
        depends_on: item.declared,
        same_stage_inputs: item.same_stage_inputs,
        earlier_stage_inputs: item.earlier_stage_inputs,
        forward_stage_inputs: item.forward_stage_inputs,
        out_of_scope_inputs: item.out_of_scope_inputs,
        unresolved_inputs: item.unresolved_inputs,
        satisfied_inputs: item.satisfied_inputs,
        blocked_by: item.blocked_by,
        ready: item.blocked_by.length === 0,
        observation_state: item.observation_state,
      });
    }
    counts.work_items += workItems.length;
    if (workItems.length === 0) continue;
    stages.push({ stage_code: stageCode, stage_sequence: sequence, work_items: workItems });
  }

  if (stages.length === 0) {
    fail(STAGE_RULE_ERROR_CODES.WORK_ORDER_INVALID,
      'no target stage carries a work item to order', {});
  }

  const receipt = {
    schema_version: STAGE_WORK_ORDER_SCHEMA_VERSION,
    compiler_version: COMPILER_VERSION,
    deterministic: true,
    claim_ceiling: 'observed',
    tie_breaks_applied: [...WORK_ORDER_TIE_BREAKS_APPLIED],
    tie_breaks_skipped: [...WORK_ORDER_TIE_BREAKS_SKIPPED],
    evidence_rank: { ...EVIDENCE_WORK_RANK },
    gate_role_rank: { ...GATE_ROLE_RANK },
    input_digests: {
      mapping_table: canonicalDigest(compilerDomain('mapping_table'), mappingTable),
      observations: canonicalDigest(compilerDomain('work_order_observations'), [...observations]),
    },
    output_digests: {
      stages: canonicalDigest(compilerDomain('stage_work_order'), stages),
    },
    counts,
    effects: {
      erp_writes: 0,
      filesystem_writes: 0,
      model_calls: 0,
      network_calls: 0,
      clock_reads: 0,
    },
  };

  return deepFreeze({ schema_version: STAGE_WORK_ORDER_SCHEMA_VERSION, stages, receipt });
}

/**
 * Mints the exact policy ref the engine's own validator recomputes.
 *
 * The engine binds a stage policy to its bytes by hashing `{schema_version, policy_revision,
 * stages}` under its frozen policy revision, and refuses any `policy_ref` whose content id does
 * not come back equal. This reproduces that rule over the material this compiler emitted, so a
 * caller can hand the pair straight to the engine. The entity and revision halves are the
 * caller's identity to state, not this module's to invent.
 *
 * @param material `{ schema_version, stages }` as returned in `engine_stage_policy_material`
 * @param identity `{ entity_id, revision_id }`
 */
export function mintEnginePolicyRef(material, identity) {
  assertExactKeys(material, ['schema_version', 'stages'], [], 'engine_stage_policy_material',
    STAGE_RULE_ERROR_CODES.ENGINE_MATERIAL_INVALID);
  if (material.schema_version !== ENGINE_STAGE_POLICY_SCHEMA_VERSION) {
    fail(STAGE_RULE_ERROR_CODES.ENGINE_MATERIAL_INVALID, 'engine stage policy schema is unsupported',
      { where: 'engine_stage_policy_material.schema_version' });
  }
  assertArray(material.stages, 'engine_stage_policy_material.stages', MAX.gates,
    STAGE_RULE_ERROR_CODES.ENGINE_MATERIAL_INVALID);
  assertExactKeys(identity, ['entity_id', 'revision_id'], [], 'policy identity',
    STAGE_RULE_ERROR_CODES.ENGINE_MATERIAL_INVALID);
  assertToken(identity.entity_id, 'policy identity.entity_id', STAGE_RULE_ERROR_CODES.ENGINE_MATERIAL_INVALID);
  assertToken(identity.revision_id, 'policy identity.revision_id', STAGE_RULE_ERROR_CODES.ENGINE_MATERIAL_INVALID);

  const hashMaterial = {
    schema_version: material.schema_version,
    policy_revision: AX_SE_POLICY_REVISION_PIN,
    stages: material.stages,
  };
  const digest = canonicalDigest(AX_SE_POLICY_REVISION_PIN, hashMaterial);
  return Object.freeze({
    entity_id: identity.entity_id,
    revision_id: identity.revision_id,
    content_id: `sha256:${digest}`,
    content_hash_alg: 'sha256',
  });
}

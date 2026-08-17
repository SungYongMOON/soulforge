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

import { canonicalise, compareCodePoints, isCanonicalInstant } from '../kernel/canonical.mjs';
import { CANONICAL, REF_REQUIRED_FIELDS } from '../kernel/contract_config.mjs';
import { AUTHORITY_FAMILIES } from '../kernel/authority.mjs';
import { isWellFormedRef } from '../kernel/identity.mjs';
import { ARTIFACT_FAMILIES, CAPABILITY_TOKENS, artifactTypeEntry } from './artifact_vocabulary.mjs';

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
  'regulation_mandated', 'guidebook_recommended', 'prime_contract', 'internal_management', 'unstated',
]);
const EVIDENCE_TO_PRESENCE = Object.freeze({
  regulation_mandated: PRESENCE_RULE.PRESENT,
  guidebook_recommended: PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE,
  prime_contract: PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE,
  internal_management: PRESENCE_RULE.OPTIONAL_CONTEXT,
  unstated: PRESENCE_RULE.OPTIONAL_CONTEXT,
});

export const VERIFICATION_STATUSES = Object.freeze([
  'source_supported', 'partially_supported', 'unsupported', 'contradicted', 'unverified',
]);
// A row carrying one of these cannot be enforced. `unverified` is also the default for a task
// that declares no status at all: not yet compared is not the same as compared and accepted.
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
const GATE_FIELDS = Object.freeze(['code', 'name', 'desc', 'tasks']);
const TASK_REQUIRED_FIELDS = Object.freeze(['id', 'name']);
const TASK_OPTIONAL_FIELDS = Object.freeze([
  'desc', 'term', 'source', 'template', 'is_fixed', 'artifact_type_id', 'evidence_level',
  'source_refs', 'applies_when', 'not_applicable_default', 'verification_status',
  'added_by_verification',
]);
const SOURCE_REF_FIELDS = Object.freeze(['source_key', 'locator']);
const PROJECT_BINDING_FIELDS = Object.freeze([
  'document_refs', 'valid_at', 'known_at', 'authority_family', 'applicability_default',
]);
const DOCUMENT_REF_FIELDS = Object.freeze(['artifact_type_ids_covered', 'requirement_ref']);
const OVERLAY_FIELDS = Object.freeze(['schema_version', 'extends', 'ops']);
const OVERLAY_EXTENDS_FIELDS = Object.freeze(['support_key', 'spec_sha256']);
const OP_ADD_REQUIRED = Object.freeze([
  'op', 'stage_code', 'artifact_type_id', 'label', 'evidence_level', 'source_ref', 'basis',
]);
// `family` and `required_capability` are optional overrides, and become required when the added
// token is not one the vocabulary owns. Without them an unknown token has no `requirement_kind`
// and no capability, and the engine requirement built from it would name a capability no role
// can hold. Design section 5 says the overlay may set the capability; this is where.
const OP_ADD_OPTIONAL = Object.freeze(['family', 'required_capability']);
const OP_MARK_NA_REQUIRED = Object.freeze(['op', 'stage_code', 'artifact_type_id', 'basis']);
const OP_MARK_NA_OPTIONAL = Object.freeze(['decision_ref']);
const OP_ALIAS_FIELDS = Object.freeze(['op', 'stage_code', 'artifact_type_id', 'alias']);
const OP_CONDITION_FIELDS = Object.freeze(['op', 'token']);
const OVERLAY_OPS = Object.freeze(['add', 'mark_not_applicable', 'alias', 'condition']);
const FORBIDDEN_OVERLAY_OPS = Object.freeze(['override_evidence']);

// ---------------------------------------------------------------- input validation

function validateCompiledVariant(variant) {
  assertExactKeys(variant, VARIANT_FIELDS, [], 'compiled_variant', STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
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
      for (const field of ['is_fixed', 'not_applicable_default', 'added_by_verification']) {
        if (task[field] !== undefined && typeof task[field] !== 'boolean') {
          fail(STAGE_RULE_ERROR_CODES.VARIANT_INVALID, `${taskWhere}.${field} must be a boolean`,
            { where: `${taskWhere}.${field}` });
        }
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
      if (task.applies_when !== undefined) {
        assertToken(task.applies_when, `${taskWhere}.applies_when`, STAGE_RULE_ERROR_CODES.VARIANT_INVALID);
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
  assertExactKeys(overlay, OVERLAY_FIELDS, [], 'overlay', STAGE_RULE_ERROR_CODES.OVERLAY_INVALID);
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

  let presence = EVIDENCE_TO_PRESENCE[evidenceLevel];
  if (isFixed || unmapped) presence = PRESENCE_RULE.OPTIONAL_CONTEXT;
  if (WEAKENING_VERIFICATION.has(verificationStatus)) {
    if (PRESENCE_RANK[presence] > 0) counts.downgraded_unverified += 1;
    presence = PRESENCE_RULE.OPTIONAL_CONTEXT;
  }
  // A conditional row whose condition this project has not declared is not thereby absent: it
  // is a row nobody has yet said applies, which is what present-or-not-applicable means. It can
  // only ever weaken; a condition cannot promote a context row into a required one.
  if (task.applies_when !== undefined && !conditions.has(task.applies_when)) {
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
    applies_when: task.applies_when ?? null,
    origin: ORIGIN.VARIANT,
    alias: null,
    unmapped,
    is_fixed: isFixed,
  };
}

function overlayAddRow(op, sequence) {
  return {
    stage_code: op.stage_code,
    sequence,
    task_id: null,
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
    applies_when: null,
    origin: ORIGIN.OVERLAY,
    alias: null,
    unmapped: false,
    is_fixed: false,
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
        expected_inputs: [],
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
  engine_requirements: 0,
  not_applicable: 0,
  overlay_added: 0,
  overlay_strengthened: 0,
  overlay_aliases: 0,
  overlay_out_of_scope: 0,
  unmapped: 0,
  downgraded_unverified: 0,
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
      fail(STAGE_RULE_ERROR_CODES.OVERLAY_INVALID, 'an overlay operation names a rule that does not exist',
        { op: op.op, stage_code: op.stage_code, artifact_type_id: op.artifact_type_id });
    }
    if (op.op === 'alias') {
      for (const row of targeted) row.alias = op.alias;
      counts.overlay_aliases += 1;
    } else {
      for (const row of targeted) {
        row.draftability_rule = DRAFTABILITY.NOT_APPLICABLE;
        row.not_applicable_requires = [NOT_APPLICABLE_BASIS.OWNER_DECISION];
      }
    }
  }

  for (const row of rows) {
    counts.rows += 1;
    counts.by_evidence_level[row.evidence_level] += 1;
    counts.by_presence_rule[row.minimum_presence_rule] += 1;
    if (row.draftability_rule === DRAFTABILITY.NOT_APPLICABLE) counts.not_applicable += 1;
  }

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
      artifact_type_id: row.artifact_type_id,
      origin: row.origin,
      evidence_level: row.evidence_level,
      minimum_presence_rule: row.minimum_presence_rule,
      engine_requirement_id: bound === null ? null : bound.requirement_id,
      document_ref_selection: bound === null ? null : bound.document_ref_selection,
      alias: row.alias,
      source_refs: row.source_refs.map((ref) => ({ source_key: ref.source_key, locator: ref.locator })),
      overlay_source_ref: row.overlay_source_ref,
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

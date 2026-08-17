import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import {
  compileStageRules,
  mintEnginePolicyRef,
  StageRuleCompilerError,
  STAGE_RULE_ERROR_CODES,
  STAGE_RULE_COMPILER_SCHEMA_VERSION,
  COMPILED_VARIANT_SCHEMA_VERSION,
  STAGE_RULE_OVERLAY_SCHEMA_VERSION,
  ENGINE_STAGE_POLICY_SCHEMA_VERSION,
  EXPECTED_ARTIFACT_POLICY_SCHEMA_VERSION,
  AX_SE_POLICY_REVISION_PIN,
  PRESENCE_RULE,
} from './stage_rule_compiler.mjs';
import {
  ARTIFACT_VOCABULARY_V0,
  ARTIFACT_FAMILIES,
  CAPABILITY_TOKENS,
  isKnownArtifactType,
  artifactTypeEntry,
} from './artifact_vocabulary.mjs';
import {
  buildAxSeAssessmentInput,
  assessAxSeProject,
  AX_SE_POLICY_REVISION,
  AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA,
  CODES as AX_SE_CODES,
} from '../subjects/ax_se_project_assessment.mjs';

const EXAMPLES = '../../../docs/architecture/workspace/examples/se_stage_rules/';
const load = (name) => JSON.parse(readFileSync(new URL(`${EXAMPLES}${name}`, import.meta.url), 'utf8'));

const BASE = load('compiled_variant_synthetic_v0.json');
const OVERLAY = load('stage_rule_overlay_synthetic_v0.json');
const FORBIDDEN = load('stage_rule_overlay_forbidden_v0.json');

const baseRequest = () => structuredClone(BASE.request);
const overlayRequest = () => {
  const request = baseRequest();
  request.overlay = structuredClone(OVERLAY.overlay);
  return request;
};

const rowOf = (result, taskId) => result.mapping_table.find((row) => row.task_id === taskId);
const overlayRowOf = (result, artifactTypeId) => result.mapping_table
  .find((row) => row.origin === 'overlay' && row.artifact_type_id === artifactTypeId);
const stageOf = (result, stageCode) => result.engine_stage_policy_material.stages
  .find((stage) => stage.stage_code === stageCode);
const requirementOf = (result, stageCode, requirementId) => stageOf(result, stageCode)
  ?.requirements.find((row) => row.requirement_id === requirementId);
const familyOf = (result, stageCode, artifactFamilyId) => result.expected_artifact_policy.stage_family_defaults
  .find((stage) => stage.stage_code === stageCode)
  ?.required_artifact_families.find((row) => row.artifact_family_id === artifactFamilyId);
const requirementIds = (result) => result.engine_stage_policy_material.stages
  .flatMap((stage) => stage.requirements.map((row) => row.requirement_id));

const taskOf = (request, taskId) => request.compiled_variant.gates
  .flatMap((gate) => gate.tasks).find((task) => task.id === taskId);

const throwsWith = (code) => (error) => {
  assert.ok(error instanceof StageRuleCompilerError, `expected a StageRuleCompilerError, got ${error}`);
  assert.equal(error.code, code);
  return true;
};

// Invented refs for the engine round trip. Digests of invented ascii strings, not of any bytes.
const syntheticRef = (name) => ({
  entity_id: name,
  revision_id: 'rev_1',
  content_id: `sha256:${createHash('sha256').update(name).digest('hex')}`,
  content_hash_alg: 'sha256',
});

// ---------------------------------------------------------------- 1. fixture conformance

test('the synthetic variant compiles to the hand-derived rule set', () => {
  const result = compileStageRules(baseRequest());
  const expected = BASE.expected;

  assert.deepEqual(result.receipt.counts, expected.counts);
  assert.equal(result.receipt.schema_version, STAGE_RULE_COMPILER_SCHEMA_VERSION);
  assert.equal(result.receipt.compiler_version, 'v0');
  assert.equal(result.receipt.deterministic, true);
  assert.equal(result.receipt.claim_ceiling, 'observed');
  assert.deepEqual(result.receipt.effects, {
    erp_writes: 0, filesystem_writes: 0, model_calls: 0, network_calls: 0, clock_reads: 0,
  });

  assert.equal(result.expected_artifact_policy.schema_version, EXPECTED_ARTIFACT_POLICY_SCHEMA_VERSION);
  assert.equal(result.engine_stage_policy_material.schema_version, ENGINE_STAGE_POLICY_SCHEMA_VERSION);
  assert.equal(result.expected_artifact_policy.policy_identity.owner_surface, 'se_stage_rule_compiler');
  assert.equal(result.expected_artifact_policy.policy_identity.created_at,
    BASE.request.project_binding.known_at);

  assert.deepEqual(result.engine_stage_policy_material.stages.map((stage) => stage.stage_code),
    expected.engine_stage_codes);
  assert.deepEqual(requirementIds(result), expected.engine_requirement_ids);
  assert.deepEqual(result.needs_stage_declarations.stages, expected.needs_stages);
  assert.deepEqual(result.needs_stage_declarations.artifact_type_ids, expected.artifact_type_ids);
  assert.equal(result.mapping_table.length, expected.counts.rows);

  for (const row of expected.rows) {
    const actual = rowOf(result, row.task_id);
    assert.ok(actual, `no mapping row for task ${row.task_id}`);
    assert.equal(actual.stage_code, row.stage_code, `stage of ${row.task_id}`);
    assert.equal(actual.artifact_type_id, row.artifact_type_id, `type of ${row.task_id}`);
    assert.equal(actual.minimum_presence_rule, row.minimum_presence_rule, `rule of ${row.task_id}`);
    assert.equal(actual.engine_requirement_id, row.engine_requirement_id, `requirement of ${row.task_id}`);
    assert.equal(actual.document_ref_selection, row.document_ref_selection, `document ref of ${row.task_id}`);
  }
  for (const row of expected.expected_artifact_families) {
    const actual = familyOf(result, row.stage_code, row.artifact_family_id);
    assert.ok(actual, `no policy family ${row.stage_code}/${row.artifact_family_id}`);
    assert.equal(actual.artifact_kind, row.artifact_kind);
    assert.equal(actual.draftability_rule, row.draftability_rule);
    assert.deepEqual(actual.not_applicable_requires, row.not_applicable_requires);
    assert.deepEqual(actual.expected_inputs, []);
    assert.equal(actual.downstream_route_hint, 'none');
  }
  for (const id of expected.not_applicable_requirement_ids) {
    const stageCode = id.slice(0, id.indexOf('_', 4));
    assert.equal(requirementOf(result, stageCode, id).applicability, false, `${id} applicability`);
  }

  // The template blocks the workflow owns travel through unchanged.
  assert.deepEqual(result.expected_artifact_policy.status_vocabulary,
    ['draftable', 'owner_input_needed', 'source_needed', 'blocked', 'not_applicable']);
  assert.deepEqual(result.expected_artifact_policy.rules, {
    missing_owner_decision_becomes_owner_input: true,
    missing_source_becomes_source_needed_or_blocked: true,
    not_applicable_requires_policy_or_owner_basis: true,
    scan_result_does_not_complete_artifact: true,
  });
});

// ---------------------------------------------------------------- 2. determinism

test('two compiles of the same input agree, and reordering the variant changes nothing', () => {
  const first = compileStageRules(baseRequest());
  const second = compileStageRules(baseRequest());
  assert.deepEqual(second.receipt.input_digests, first.receipt.input_digests);
  assert.deepEqual(second.receipt.output_digests, first.receipt.output_digests);
  assert.deepEqual(second.mapping_table, first.mapping_table);

  // The gates and the tasks inside them carry no order meaning, and the caller may name the
  // target stages in any order. None of that may reach the output.
  const shuffled = baseRequest();
  shuffled.compiled_variant.gates.reverse();
  for (const gate of shuffled.compiled_variant.gates) gate.tasks.reverse();
  shuffled.target_stage_codes = ['090_PDR', '120_CDR', '020_MGMT'];
  const reordered = compileStageRules(shuffled);

  assert.deepEqual(reordered.mapping_table, first.mapping_table);
  assert.deepEqual(reordered.engine_stage_policy_material, first.engine_stage_policy_material);
  assert.deepEqual(reordered.expected_artifact_policy, first.expected_artifact_policy);
  assert.deepEqual(reordered.needs_stage_declarations, first.needs_stage_declarations);
  assert.deepEqual(reordered.receipt.output_digests, first.receipt.output_digests);
  assert.deepEqual(reordered.receipt.counts, first.receipt.counts);
});

// ---------------------------------------------------------------- 3. evidence level mapping

test('each evidence level maps to its declared minimum presence rule', () => {
  const cases = [
    ['regulation_mandated', PRESENCE_RULE.PRESENT],
    ['guidebook_recommended', PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE],
    ['prime_contract', PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE],
    ['internal_management', PRESENCE_RULE.OPTIONAL_CONTEXT],
    ['unstated', PRESENCE_RULE.OPTIONAL_CONTEXT],
  ];
  for (const [level, rule] of cases) {
    const request = baseRequest();
    taskOf(request, 9002).evidence_level = level;
    const result = compileStageRules(request);
    assert.equal(rowOf(result, 9002).minimum_presence_rule, rule, `evidence level ${level}`);
    assert.equal(rowOf(result, 9002).evidence_level, level);
  }

  // A task that states no level at all is unstated, not mandated by omission.
  const request = baseRequest();
  delete taskOf(request, 9002).evidence_level;
  const result = compileStageRules(request);
  assert.equal(rowOf(result, 9002).evidence_level, 'unstated');
  assert.equal(rowOf(result, 9002).minimum_presence_rule, PRESENCE_RULE.OPTIONAL_CONTEXT);
});

// ---------------------------------------------------------------- 4. verification status

test('an unverified, unsupported, or contradicted status weakens a rule and never strengthens one', () => {
  for (const status of ['unverified', 'unsupported', 'contradicted']) {
    const request = baseRequest();
    taskOf(request, 9001).verification_status = status;
    const result = compileStageRules(request);
    assert.equal(rowOf(result, 9001).minimum_presence_rule, PRESENCE_RULE.OPTIONAL_CONTEXT, status);
    assert.equal(rowOf(result, 9001).engine_requirement_id, null, `${status} produces no requirement`);
    assert.equal(result.receipt.counts.downgraded_unverified, 2, `${status} is counted`);
  }
  for (const status of ['source_supported', 'partially_supported']) {
    const request = baseRequest();
    taskOf(request, 9001).verification_status = status;
    const result = compileStageRules(request);
    assert.equal(rowOf(result, 9001).minimum_presence_rule, PRESENCE_RULE.PRESENT, status);
  }

  // A weakening status on a row that was already context cannot raise it, and is not counted as
  // a downgrade because nothing was taken away.
  const request = baseRequest();
  taskOf(request, 12005).verification_status = 'contradicted';
  const result = compileStageRules(request);
  assert.equal(rowOf(result, 12005).minimum_presence_rule, PRESENCE_RULE.OPTIONAL_CONTEXT);
  assert.equal(result.receipt.counts.downgraded_unverified, 1);

  // A task that declares no status is treated as unverified rather than as accepted.
  const undeclared = baseRequest();
  delete taskOf(undeclared, 9001).verification_status;
  assert.equal(rowOf(compileStageRules(undeclared), 9001).minimum_presence_rule,
    PRESENCE_RULE.OPTIONAL_CONTEXT);
});

// ---------------------------------------------------------------- 5. applies_when

test('a conditional rule weakens while its condition is undeclared and returns when it is declared', () => {
  const withoutCondition = compileStageRules(baseRequest());
  assert.equal(rowOf(withoutCondition, 9004).minimum_presence_rule,
    PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE);

  const declared = baseRequest();
  declared.overlay_conditions = ['sw_included'];
  const withCondition = compileStageRules(declared);
  assert.equal(rowOf(withCondition, 9004).minimum_presence_rule, PRESENCE_RULE.PRESENT);

  // A declared condition cannot promote a row that some other rule already weakened.
  const weakened = baseRequest();
  weakened.overlay_conditions = ['sw_included'];
  taskOf(weakened, 9004).verification_status = 'unsupported';
  assert.equal(rowOf(compileStageRules(weakened), 9004).minimum_presence_rule,
    PRESENCE_RULE.OPTIONAL_CONTEXT);
});

// ---------------------------------------------------------------- 6. not applicable by default

test('a default not-applicable row carries the policy-rule basis and is not applicable to the engine', () => {
  const result = compileStageRules(baseRequest());
  const family = familyOf(result, '120_CDR', 'mra_report');
  assert.equal(family.draftability_rule, 'not_applicable');
  assert.deepEqual(family.not_applicable_requires, ['policy_rule']);
  assert.equal(requirementOf(result, '120_CDR', '120_CDR_mra_report').applicability, false);
  assert.equal(result.receipt.counts.not_applicable, 1);

  // Every other row rests on a scoped owner decision instead.
  assert.deepEqual(familyOf(result, '090_PDR', 'srs').not_applicable_requires,
    ['scoped_owner_decision_ref']);
  assert.equal(familyOf(result, '090_PDR', 'srs').draftability_rule, 'draftable_with_sources');
});

// ---------------------------------------------------------------- 7. fixed and unmapped rows

test('fixed internal folders and unmapped tasks stay visible without becoming requirements', () => {
  const result = compileStageRules(baseRequest());

  for (const taskId of [2001, 2002, 2003]) {
    const row = rowOf(result, taskId);
    assert.equal(row.minimum_presence_rule, PRESENCE_RULE.OPTIONAL_CONTEXT);
    assert.equal(row.engine_requirement_id, null);
  }
  // The management stage holds rules but produces no requirement, so the engine never sees it.
  assert.equal(stageOf(result, '020_MGMT'), undefined);
  assert.equal(result.expected_artifact_policy.stage_family_defaults
    .find((stage) => stage.stage_code === '020_MGMT').required_artifact_families.length, 3);
  assert.deepEqual(result.needs_stage_declarations.stages.map((row) => row.stage_code),
    ['020_MGMT', '090_PDR', '120_CDR']);

  const unmapped = rowOf(result, 9005);
  assert.equal(unmapped.artifact_type_id, 'unmapped_9005');
  assert.equal(unmapped.minimum_presence_rule, PRESENCE_RULE.OPTIONAL_CONTEXT);
  assert.equal(unmapped.engine_requirement_id, null);
  assert.equal(result.receipt.counts.unmapped, 1);
  assert.ok(result.needs_stage_declarations.artifact_type_ids.includes('unmapped_9005'));
});

// ---------------------------------------------------------------- 8. overlay conformance

test('the synthetic overlay adds, aliases, declares not applicable, and declares one condition', () => {
  const result = compileStageRules(overlayRequest());
  const expected = OVERLAY.expected;

  assert.deepEqual(result.receipt.counts, expected.counts);
  assert.deepEqual(requirementIds(result), expected.engine_requirement_ids);

  for (const row of expected.rows) {
    const actual = row.task_id === null
      ? overlayRowOf(result, row.artifact_type_id)
      : rowOf(result, row.task_id);
    assert.ok(actual, `no mapping row for ${row.artifact_type_id}`);
    assert.equal(actual.minimum_presence_rule, row.minimum_presence_rule, `rule of ${row.artifact_type_id}`);
    assert.equal(actual.origin, row.origin, `origin of ${row.artifact_type_id}`);
    assert.equal(actual.alias, row.alias, `alias of ${row.artifact_type_id}`);
  }
  for (const row of expected.expected_artifact_families) {
    const actual = familyOf(result, row.stage_code, row.artifact_family_id);
    assert.ok(actual, `no policy family ${row.artifact_family_id}`);
    assert.equal(actual.artifact_kind, row.artifact_kind);
    assert.equal(actual.draftability_rule, row.draftability_rule);
    assert.deepEqual(actual.not_applicable_requires, row.not_applicable_requires);
  }
  for (const id of expected.not_applicable_requirement_ids) {
    assert.equal(requirementOf(result, '120_CDR', id).applicability, false, `${id} applicability`);
  }

  // The addition carries the exact contract revision it rests on, and the alias records the
  // project's own slot name without changing any rule.
  const added = overlayRowOf(result, 'spec_linkage_table');
  assert.equal(added.evidence_level, 'prime_contract');
  assert.equal(added.overlay_source_ref.entity_id, 'synthetic_prime_request_letter');
  assert.equal(added.task_id, null);
  assert.equal(rowOf(result, 12001).alias, 'synthetic_slot_07_product_baseline');
  assert.equal(requirementOf(result, '120_CDR', '120_CDR_pci').applicability, true);
  // The 240_LL operation is outside this compile and was skipped rather than applied.
  assert.equal(result.receipt.counts.overlay_out_of_scope, 1);

  // An overlay changes the compiled policy identity, so the two compiles cannot be confused.
  const base = compileStageRules(baseRequest());
  assert.notEqual(result.expected_artifact_policy.policy_identity.policy_id,
    base.expected_artifact_policy.policy_identity.policy_id);
  assert.notEqual(result.receipt.input_digests.overlay, base.receipt.input_digests.overlay);
});

// ---------------------------------------------------------------- 9. overlay refusals

test('an overlay may not raise the evidence level of a rule', () => {
  const request = baseRequest();
  request.overlay = structuredClone(FORBIDDEN.overlay);
  assert.throws(() => compileStageRules(request), throwsWith(FORBIDDEN.expected.error_code));
  assert.equal(FORBIDDEN.expected.error_code, STAGE_RULE_ERROR_CODES.OVERLAY_FORBIDDEN);

  // An addition may only ever carry the one grade it can support.
  const regraded = overlayRequest();
  regraded.overlay.ops[1].evidence_level = 'regulation_mandated';
  assert.throws(() => compileStageRules(regraded), throwsWith(STAGE_RULE_ERROR_CODES.OVERLAY_FORBIDDEN));

  // Adding a rule the standard table already REQUIRES would restate or regrade it.
  const duplicate = overlayRequest();
  duplicate.overlay.ops[1].artifact_type_id = 'pci';
  assert.throws(() => compileStageRules(duplicate), throwsWith(STAGE_RULE_ERROR_CODES.OVERLAY_FORBIDDEN));

  // But a buyer may require an artifact the standard table only carries as context: the overlay
  // adds its own prime_contract row beside the standard row, the standard row keeps its grade,
  // and the group is governed by the stronger presence rule.
  const base = compileStageRules(baseRequest());
  const contextRow = base.mapping_table.find((row) => row.origin === 'variant'
    && row.minimum_presence_rule === 'optional_context'
    && row.evidence_level !== 'internal_management'
    && !row.artifact_type_id.startsWith('unmapped_')
    && base.mapping_table.filter((other) => other.stage_code === row.stage_code
      && other.artifact_type_id === row.artifact_type_id).every((other) => other.minimum_presence_rule === 'optional_context'));
  assert.ok(contextRow, 'fixture carries at least one context-only standard row');
  const strengthen = overlayRequest();
  strengthen.overlay.ops[1] = { ...strengthen.overlay.ops[1], stage_code: contextRow.stage_code, artifact_type_id: contextRow.artifact_type_id };
  if (!strengthen.target_stage_codes.includes(contextRow.stage_code)) strengthen.target_stage_codes.push(contextRow.stage_code);
  const strengthened = compileStageRules(strengthen);
  assert.equal(strengthened.receipt.counts.overlay_strengthened, 1);
  const group = strengthened.mapping_table.filter((row) => row.stage_code === contextRow.stage_code
    && row.artifact_type_id === contextRow.artifact_type_id);
  assert.ok(group.some((row) => row.origin === 'overlay' && row.evidence_level === 'prime_contract'));
  assert.ok(group.some((row) => row.origin === 'variant' && row.minimum_presence_rule === 'optional_context'), 'standard row keeps its own grade');
  const engineIds = strengthened.engine_stage_policy_material.stages.flatMap((stage) => stage.requirements.map((r) => r.requirement_id));
  assert.ok(engineIds.includes(`${contextRow.stage_code}_${contextRow.artifact_type_id}`), 'the group now yields an engine requirement');

  // An operation aimed at a rule that does not exist is a mistake, not a silent no-op.
  const missing = overlayRequest();
  missing.overlay.ops[3].artifact_type_id = 'ot_report';
  assert.throws(() => compileStageRules(missing), throwsWith(STAGE_RULE_ERROR_CODES.OVERLAY_INVALID));

  // An addition outside the vocabulary has no family and no capability to stand on.
  const unknown = overlayRequest();
  unknown.overlay.ops[1].artifact_type_id = 'synthetic_unlisted_token';
  assert.throws(() => compileStageRules(unknown), throwsWith(STAGE_RULE_ERROR_CODES.OVERLAY_INVALID));
});

test('an overlay written against another rule table is refused', () => {
  const shiftedKey = overlayRequest();
  shiftedKey.overlay.extends.support_key = 'synthetic_other__synthetic_prime__grade_a';
  assert.throws(() => compileStageRules(shiftedKey),
    throwsWith(STAGE_RULE_ERROR_CODES.OVERLAY_BASE_MISMATCH));

  const shiftedSpec = overlayRequest();
  shiftedSpec.overlay.extends.spec_sha256 = 'a'.repeat(64);
  assert.throws(() => compileStageRules(shiftedSpec),
    throwsWith(STAGE_RULE_ERROR_CODES.OVERLAY_BASE_MISMATCH));

  assert.equal(OVERLAY.overlay.schema_version, STAGE_RULE_OVERLAY_SCHEMA_VERSION);
});

// ---------------------------------------------------------------- 10. stage code refusals

test('a gate code the model does not name is refused for the whole variant', () => {
  const request = baseRequest();
  request.compiled_variant.gates[1].code = 45;
  assert.throws(() => compileStageRules(request), throwsWith(STAGE_RULE_ERROR_CODES.STAGE_CODE_UNKNOWN));

  const targeted = baseRequest();
  targeted.target_stage_codes = ['090_PDR', '999_NOPE'];
  assert.throws(() => compileStageRules(targeted), throwsWith(STAGE_RULE_ERROR_CODES.STAGE_CODE_UNKNOWN));

  // A target the variant never described would compile to "this stage expects nothing".
  const undescribed = baseRequest();
  undescribed.target_stage_codes = ['090_PDR', '240_LL'];
  assert.throws(() => compileStageRules(undescribed), throwsWith(STAGE_RULE_ERROR_CODES.REQUEST_INVALID));

  const empty = baseRequest();
  empty.target_stage_codes = [];
  assert.throws(() => compileStageRules(empty), throwsWith(STAGE_RULE_ERROR_CODES.REQUEST_INVALID));

  assert.equal(BASE.request.compiled_variant.schema_version, COMPILED_VARIANT_SCHEMA_VERSION);
});

test('a stage whose every requirement is not applicable is refused rather than emitted', () => {
  const request = overlayRequest();
  // Take away everything 120_CDR could still be judged on.
  for (const id of ['pci', 'review_minutes_cdr', 'dbdd', 'spec_linkage_table']) {
    request.overlay.ops.push({
      op: 'mark_not_applicable',
      stage_code: '120_CDR',
      artifact_type_id: id,
      basis: 'synthetic_owner_decision_strip_the_stage',
    });
  }
  assert.throws(() => compileStageRules(request),
    throwsWith(STAGE_RULE_ERROR_CODES.ENGINE_MATERIAL_INVALID));
});

// ---------------------------------------------------------------- 11. the engine accepts the material

test('the engine validates the compiled stage policy and recomputes the minted policy ref', () => {
  // The compiler restates the engine's frozen policy revision rather than importing it, so that
  // its import graph stays inside node:crypto. This is the pin that makes the restatement safe.
  assert.equal(AX_SE_POLICY_REVISION_PIN, AX_SE_POLICY_REVISION);

  const result = compileStageRules(overlayRequest());
  const material = result.engine_stage_policy_material;
  const policyRef = mintEnginePolicyRef(material, {
    entity_id: 'synthetic_stage_policy', revision_id: 'rev_1',
  });
  const policy = {
    schema_version: material.schema_version,
    policy_ref: structuredClone(policyRef),
    stages: structuredClone(material.stages),
  };
  // Every ref is cloned at each use. The engine refuses an aliased object graph outright, and it
  // is right to: two fields that share one object cannot later be shown to have agreed.
  const projectBindingRef = syntheticRef('synthetic_project_binding');
  const contextPacket = {
    schema_version: AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA,
    project_binding_ref: structuredClone(projectBindingRef),
    objective_ref: syntheticRef('synthetic_objective'),
    policy_ref: structuredClone(policyRef),
    project_snapshot_identity: { entity_id: 'synthetic_project_snapshot', revision_id: 'rev_1' },
    observations: [],
    risks: [],
  };

  // `validatePolicy` is not exported by the engine subject; `buildAxSeAssessmentInput` is, and it
  // runs the engine's own `validatePolicy` over exactly this material, including the digest rule
  // that binds `policy_ref` to the bytes. A wrong requirement shape, a duplicate or unsorted
  // requirement id, a stage without an applicable requirement, or a policy ref that does not
  // recompute all fail inside the engine rather than inside a copy of its rules kept here.
  const input = buildAxSeAssessmentInput({
    contextPacket: structuredClone(contextPacket),
    expectedProjectBindingRef: structuredClone(projectBindingRef),
    policy,
    roles: [],
  });
  assert.equal(input.policy_revision, AX_SE_POLICY_REVISION);
  assert.equal(input.policy.stages.length, material.stages.length);
  assert.equal(input.policy.stages[0].requirements.length, material.stages[0].requirements.length);

  // And the whole subject runs on it end to end.
  const assessment = assessAxSeProject(input);
  assert.equal(assessment.policy_ref.content_id, policyRef.content_id);
  assert.ok(['UNKNOWN', 'HOLD', 'READY_FOR_OWNER_REVIEW'].includes(assessment.assessment_state));
  assert.equal(assessment.effects.filesystem_writes, 0);

  // The digest is over the material, so a single changed value invalidates the ref the engine
  // recomputes. This is what proves the reproduction is the engine's rule and not a lookalike.
  const tampered = structuredClone(policy);
  tampered.stages[0].requirements[0].required_capability = 'project_management';
  assert.throws(
    () => buildAxSeAssessmentInput({
      contextPacket: structuredClone(contextPacket),
      expectedProjectBindingRef: structuredClone(projectBindingRef),
      policy: tampered,
      roles: [],
    }),
    (error) => error.code === AX_SE_CODES.POLICY_HASH_MISMATCH,
  );
});

test('every emitted requirement id is a token the engine accepts, and stage sequences increase', () => {
  const token = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
  const result = compileStageRules(overlayRequest());
  let priorSequence = -1;
  const seen = new Set();
  for (const stage of result.engine_stage_policy_material.stages) {
    assert.ok(Number.isSafeInteger(stage.sequence) && stage.sequence > priorSequence,
      `stage sequence must strictly increase at ${stage.stage_code}`);
    priorSequence = stage.sequence;
    assert.ok(stage.requirements.length > 0, `${stage.stage_code} must own a requirement`);
    for (const requirement of stage.requirements) {
      for (const value of [requirement.requirement_id, requirement.requirement_kind,
        requirement.required_capability]) {
        assert.ok(token.test(value), `${value} is not a stable token`);
      }
      assert.ok(!seen.has(requirement.requirement_id), 'requirement ids must be lifecycle-unique');
      seen.add(requirement.requirement_id);
      assert.ok(ARTIFACT_FAMILIES.includes(requirement.requirement_kind));
      assert.ok(CAPABILITY_TOKENS.includes(requirement.required_capability));
      assert.equal(requirement.authority_family, BASE.request.project_binding.authority_family);
      assert.equal(requirement.valid_at, BASE.request.project_binding.valid_at);
      assert.equal(requirement.known_at, BASE.request.project_binding.known_at);
    }
  }
});

// ---------------------------------------------------------------- 12. immutability

test('the result is deeply frozen and the request is not touched', () => {
  const request = baseRequest();
  const before = JSON.stringify(request);
  const result = compileStageRules(request);
  assert.equal(JSON.stringify(request), before);

  const frozen = [
    result, result.expected_artifact_policy, result.expected_artifact_policy.policy_identity,
    result.expected_artifact_policy.stage_family_defaults,
    result.expected_artifact_policy.stage_family_defaults[0],
    result.engine_stage_policy_material, result.engine_stage_policy_material.stages,
    result.engine_stage_policy_material.stages[0],
    result.engine_stage_policy_material.stages[0].requirements[0],
    result.needs_stage_declarations, result.needs_stage_declarations.stages,
    result.mapping_table, result.mapping_table[0], result.receipt, result.receipt.counts,
    result.receipt.effects, result.receipt.input_digests, result.receipt.output_digests,
  ];
  for (const value of frozen) assert.equal(Object.isFrozen(value), true);

  assert.throws(() => { result.receipt.counts.rows = 99; }, TypeError);
  assert.throws(() => { result.mapping_table.push({}); }, TypeError);
  assert.equal(result.receipt.counts.rows, BASE.expected.counts.rows);
});

// ---------------------------------------------------------------- 13. the vocabulary

test('the artifact vocabulary is unique, closed over its families, and closed over the capabilities', () => {
  const ids = ARTIFACT_VOCABULARY_V0.map((row) => row.artifact_type_id);
  assert.equal(new Set(ids).size, ids.length, 'artifact_type_id must be unique');
  for (const row of ARTIFACT_VOCABULARY_V0) {
    assert.ok(ARTIFACT_FAMILIES.includes(row.family), `${row.artifact_type_id} family`);
    assert.ok(CAPABILITY_TOKENS.includes(row.capability_default), `${row.artifact_type_id} capability`);
    assert.ok(row.label_ko.length > 0 && row.label_en.length > 0, `${row.artifact_type_id} labels`);
    assert.equal(Object.isFrozen(row), true);
  }
  // Every family the compiler can emit is carried by at least one token, so no family is a
  // name with nothing behind it.
  const families = new Set(ARTIFACT_VOCABULARY_V0.map((row) => row.family));
  for (const family of ARTIFACT_FAMILIES) assert.ok(families.has(family), `${family} has no token`);

  assert.equal(isKnownArtifactType('srs'), true);
  assert.equal(isKnownArtifactType('synthetic_unlisted_token'), false);
  assert.equal(isKnownArtifactType(undefined), false);
  assert.equal(artifactTypeEntry('srs').family, 'requirements_specification');
  assert.equal(artifactTypeEntry('synthetic_unlisted_token'), null);
});

// ---------------------------------------------------------------- 14. static effect pin

test('the module and everything it imports read no file, clock, network, or model', () => {
  const FORBIDDEN_TOKENS = [
    'node:fs', 'node:net', 'node:http', 'node:https', 'node:dns', 'node:child_process',
    'node:worker_threads', 'node:process', 'node:os', 'node:readline',
    'Date.now', 'new Date', 'Math.random', 'process.env', 'process.argv',
    'process.hrtime', 'performance.now', 'fetch(', 'XMLHttpRequest', 'require(',
  ];
  const ALLOWED_BARE_SPECIFIERS = new Set(['node:crypto']);

  const seen = new Map();
  const walk = (url) => {
    const href = url.href;
    if (seen.has(href)) return;
    const source = readFileSync(url, 'utf8');
    seen.set(href, source);
    for (const match of source.matchAll(/\bfrom\s+'([^']+)'/gu)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) walk(new URL(specifier, url));
      else assert.ok(ALLOWED_BARE_SPECIFIERS.has(specifier), `unexpected bare import "${specifier}" in ${href}`);
    }
  };
  walk(new URL('./stage_rule_compiler.mjs', import.meta.url));

  assert.ok(seen.size >= 3, 'the import graph should include the vocabulary and the kernel modules');
  for (const [href, source] of seen) {
    for (const token of FORBIDDEN_TOKENS) {
      assert.equal(source.includes(token), false, `${href} must not contain "${token}"`);
    }
  }

  const entry = seen.get(new URL('./stage_rule_compiler.mjs', import.meta.url).href);
  assert.equal(entry.includes('import.meta.main'), false);
  assert.equal(entry.includes('process.'), false);
});

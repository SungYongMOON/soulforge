import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import {
  compileStageRules,
  orderStageWork,
  mintEnginePolicyRef,
  StageRuleCompilerError,
  STAGE_RULE_ERROR_CODES,
  STAGE_RULE_COMPILER_SCHEMA_VERSION,
  COMPILED_VARIANT_SCHEMA_VERSION,
  STAGE_RULE_OVERLAY_SCHEMA_VERSION,
  ENGINE_STAGE_POLICY_SCHEMA_VERSION,
  EXPECTED_ARTIFACT_POLICY_SCHEMA_VERSION,
  STAGE_WORK_ORDER_SCHEMA_VERSION,
  OBSERVATION_PRESENCE_STATES,
  AX_SE_POLICY_REVISION_PIN,
  PRESENCE_RULE,
  NODE_KINDS,
  SE_FLOORS,
} from './stage_rule_compiler.mjs';
import { PRESENCE_STATES_PIN } from './pilot_packet_generator.mjs';
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
const ORDER = load('stage_work_order_synthetic_v0.json');

const baseRequest = () => structuredClone(BASE.request);
const orderRequest = () => structuredClone(ORDER.request);
const orderTaskOf = (request, taskId) => request.compiled_variant.gates
  .flatMap((gate) => gate.tasks).find((task) => task.id === taskId);
const workTokens = (result, stageCode) => result.stages
  .find((stage) => stage.stage_code === stageCode)
  ?.work_items.map((item) => item.artifact_type_id);
const workItemOf = (result, stageCode, token) => result.stages
  .find((stage) => stage.stage_code === stageCode)
  ?.work_items.find((item) => item.artifact_type_id === token);
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
    // `expected_inputs` is the declared causal edges of the group. These fixture rows declare
    // none, so it is empty here — and the fixture states that rather than the test assuming it.
    assert.deepEqual(actual.expected_inputs, row.expected_inputs ?? []);
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

// ---------------------------------------------------------------- 4b. the generic SE floor

test('a general_se_guidance row is present-or-not-applicable, and only its context floor is context', () => {
  assert.deepEqual([...SE_FLOORS], ['must_have', 'should_have', 'context']);
  // must_have and should_have are both floors the development is expected to answer for; the
  // difference between them is how many canonical texts list the artifact, not whether it counts.
  for (const floor of ['must_have', 'should_have']) {
    const request = baseRequest();
    const task = taskOf(request, 9002);
    task.evidence_level = 'general_se_guidance';
    task.se_floor = floor;
    const row = rowOf(compileStageRules(request), 9002);
    assert.equal(row.evidence_level, 'general_se_guidance', floor);
    assert.equal(row.minimum_presence_rule, PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE, floor);
    assert.equal(row.engine_requirement_id, '090_PDR_hdd', `${floor} is an engine requirement`);
  }

  // `context` is the checklist saying the buyer owns it, or the mission does. It stays visible
  // and never becomes a gap.
  const contextual = baseRequest();
  const contextTask = taskOf(contextual, 9002);
  contextTask.evidence_level = 'general_se_guidance';
  contextTask.se_floor = 'context';
  const contextRow = rowOf(compileStageRules(contextual), 9002);
  assert.equal(contextRow.minimum_presence_rule, PRESENCE_RULE.OPTIONAL_CONTEXT);
  assert.equal(contextRow.engine_requirement_id, null);
  // A context floor is not a downgrade of a verified rule, so it is not counted as one.
  assert.equal(compileStageRules(contextual).receipt.counts.downgraded_unverified, 1);

  // A single-source guidance row is `partially_supported`, which is support and must not weaken
  // it; the three weakening statuses still do.
  const partial = baseRequest();
  const partialTask = taskOf(partial, 9002);
  partialTask.evidence_level = 'general_se_guidance';
  partialTask.se_floor = 'must_have';
  partialTask.verification_status = 'partially_supported';
  assert.equal(rowOf(compileStageRules(partial), 9002).minimum_presence_rule,
    PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE);
  for (const status of ['unverified', 'unsupported', 'contradicted']) {
    const weakened = baseRequest();
    const weakenedTask = taskOf(weakened, 9002);
    weakenedTask.evidence_level = 'general_se_guidance';
    weakenedTask.se_floor = 'must_have';
    weakenedTask.verification_status = status;
    assert.equal(rowOf(compileStageRules(weakened), 9002).minimum_presence_rule,
      PRESENCE_RULE.OPTIONAL_CONTEXT, status);
  }

  // The level is counted under its own name rather than folded into another one.
  const counted = baseRequest();
  taskOf(counted, 9002).evidence_level = 'general_se_guidance';
  const counts = compileStageRules(counted).receipt.counts.by_evidence_level;
  assert.equal(counts.general_se_guidance, 1);
  assert.equal(counts.guidebook_recommended, BASE.expected.counts.by_evidence_level.guidebook_recommended - 1);
});

test('the guidance floor and the expected maturity travel into the mapping table', () => {
  const request = baseRequest();
  const task = taskOf(request, 9002);
  task.evidence_level = 'general_se_guidance';
  task.se_floor = 'should_have';
  task.maturity = 'preliminary';
  const result = compileStageRules(request);
  assert.equal(rowOf(result, 9002).se_floor, 'should_have');
  assert.equal(rowOf(result, 9002).maturity, 'preliminary');

  // A task that declares neither carries neither, rather than a guessed default.
  assert.equal(rowOf(result, 9001).se_floor, null);
  assert.equal(rowOf(result, 9001).maturity, null);
  // An overlay addition rests on a contract, which is not graded on the guidance scale.
  const overlaid = compileStageRules(overlayRequest());
  const added = overlayRowOf(overlaid, OVERLAY.expected.rows.find((row) => row.task_id === null).artifact_type_id);
  assert.equal(added.se_floor, null);
  assert.equal(added.maturity, null);

  // Neither field is a rule input outside the context case, so neither changes the compile.
  const graded = baseRequest();
  taskOf(graded, 9001).se_floor = 'context';
  taskOf(graded, 9001).maturity = 'final';
  assert.equal(rowOf(compileStageRules(graded), 9001).minimum_presence_rule, PRESENCE_RULE.PRESENT);

  for (const bad of ['required', 'MUST_HAVE', '']) {
    const invalid = baseRequest();
    taskOf(invalid, 9002).se_floor = bad;
    assert.throws(() => compileStageRules(invalid), throwsWith(STAGE_RULE_ERROR_CODES.VARIANT_INVALID));
  }
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
  // `prime_contract_item` is carried by the prime_* token rule rather than by a listed entry.
  for (const family of ARTIFACT_FAMILIES) {
    if (family === 'prime_contract_item') continue;
    assert.ok(families.has(family), `${family} has no token`);
  }

  assert.equal(isKnownArtifactType('srs'), true);
  assert.equal(isKnownArtifactType('synthetic_unlisted_token'), false);
  assert.equal(isKnownArtifactType(undefined), false);
  assert.equal(artifactTypeEntry('srs').family, 'requirements_specification');
  assert.equal(artifactTypeEntry('synthetic_unlisted_token'), null);
  // Prime-contractor items are recognised by shape and land in their own family.
  assert.equal(isKnownArtifactType('prime_q4_manufacturing_readiness_review'), true);
  assert.equal(artifactTypeEntry('prime_q4_manufacturing_readiness_review').family, 'prime_contract_item');
  assert.equal(isKnownArtifactType('prime_'), false);
  assert.equal(isKnownArtifactType('Prime_x'), false);
});

test('the generic SE baseline tokens are in the vocabulary, closed over families and capabilities', () => {
  // The thirty tokens the layer ① checklist needed beyond the earlier lists. Named here rather
  // than counted so that dropping or renaming one is a test failure and not a silent re-grade of
  // every rule that used it: a row whose token leaves the vocabulary falls to unmapped context.
  const GENERIC_SE_TOKENS = [
    'conops', 'spec_tree', 'tpm_list', 'resource_budget', 'risk_management_plan', 'ims',
    'ils_plan', 'manufacturing_plan', 'hsi_plan', 'security_plan', 'integration_plan',
    'emc_control_plan', 'handling_transport_plan', 'vcrm', 'system_safety_analysis', 'fmeca',
    'engineering_analysis_report', 'discrepancy_log', 'ram_assessment_report',
    'security_assessment_report', 'fracas_report', 'long_lead_list', 'critical_items_list',
    'as_built_config', 'vdd', 'waiver_deviation_log', 'acceptance_data_package', 'tech_manual',
    'training_material', 'action_item_log',
  ];
  assert.equal(new Set(GENERIC_SE_TOKENS).size, 30);
  for (const token of GENERIC_SE_TOKENS) {
    const row = artifactTypeEntry(token);
    assert.ok(row, `${token} must be a vocabulary token`);
    assert.equal(isKnownArtifactType(token), true, token);
    assert.ok(ARTIFACT_FAMILIES.includes(row.family), `${token} family`);
    assert.ok(CAPABILITY_TOKENS.includes(row.capability_default), `${token} capability`);
    // None of them may be a prime-contractor item: this layer is buyer- and country-independent.
    assert.notEqual(row.family, 'prime_contract_item', token);
    assert.ok(!token.startsWith('prime_'), token);
  }
  // They are additions, so every token the vocabulary carried before is still there.
  for (const token of ['srs', 'sdd', 'icd', 'semp', 'temp', 'pci', 'review_minutes_pdr']) {
    assert.ok(artifactTypeEntry(token), `${token} must still be a vocabulary token`);
  }
});

// ---------------------------------------------------------------- 13b. the real generic baseline

test('the tracked generic SE baseline compiles to at least one engine requirement per review stage', () => {
  const variant = JSON.parse(readFileSync(
    new URL('../../../.registry/skills/se_foldertree_generate/codex/assets/compiled/generic_se_base.json',
      import.meta.url), 'utf8'));
  assert.equal(variant.schema_version, COMPILED_VARIANT_SCHEMA_VERSION);
  assert.equal(variant.support_key, 'generic_se_base');

  const stageCodes = ['000_REF', '030_SRR', '060_SFR', '090_PDR', '120_CDR', '150_TRR_DT',
    '180_FCA_OT', '210_PCA', '240_LL'];
  const result = compileStageRules({
    compiled_variant: variant,
    overlay: null,
    project_binding: {
      document_refs: [{
        artifact_type_ids_covered: [],
        requirement_ref: syntheticRef('generic_se_baseline_probe_document'),
      }],
      valid_at: '2026-05-04T00:00:00.000Z',
      known_at: '2026-05-11T00:00:00.000Z',
      authority_family: 'project_contract_baseline',
      applicability_default: true,
    },
    target_stage_codes: stageCodes,
    overlay_conditions: [],
  });

  // The eight review stages are what this layer exists to answer for; a stage that produced no
  // requirement would mean the checklist said nothing about a gate the lifecycle names.
  for (const stageCode of stageCodes.slice(1)) {
    const stage = stageOf(result, stageCode);
    assert.ok(stage, `${stageCode} must reach the engine`);
    assert.ok(stage.requirements.length >= 1, `${stageCode} must own a requirement`);
  }

  // The floor is the whole content of this layer, so nothing in it may arrive as a regulation, as
  // a contract item, or as an ungraded row.
  const counts = result.receipt.counts;
  assert.equal(counts.by_evidence_level.regulation_mandated, 0);
  assert.equal(counts.by_evidence_level.prime_contract, 0);
  assert.equal(counts.by_evidence_level.unstated, 0);
  assert.ok(counts.by_evidence_level.general_se_guidance > 150);
  // Nothing was compared and found wanting: the checklist states a verdict on every row.
  assert.equal(counts.downgraded_unverified, 0);
  assert.equal(counts.by_presence_rule.present, 0);

  let activityRows = 0;
  for (const row of result.mapping_table) {
    if (row.evidence_level !== 'general_se_guidance') continue;
    assert.ok(['must_have', 'should_have', 'context'].includes(row.se_floor), row.artifact_type_id);
    if (row.node_kind === 'artifact') {
      // Maturity is a property of a document (draft, updated, baselined, final). An activity has
      // no maturity, and giving it one to satisfy a check would be a rule invented by a test.
      assert.ok(['preliminary', 'updated', 'baseline', 'final'].includes(row.maturity), row.artifact_type_id);
    } else {
      activityRows += 1;
      assert.equal(row.maturity, null, row.artifact_type_id);
      assert.equal(row.is_virtual, true, `${row.artifact_type_id} must not ask for a folder`);
      assert.ok(row.evidence_record.length >= 1,
        `${row.artifact_type_id} must name the record that would show it happened`);
    }
    assert.ok(row.source_refs.length >= 1, `${row.artifact_type_id} must cite a source`);
    for (const ref of [...row.source_refs, ...row.depends_on_refs]) {
      assert.ok(['nasa_npr_7123_1d', 'dod_se_guidebook_2022', 'nasa_se_handbook_rev2']
        .includes(ref.source_key), ref.source_key);
    }
    assert.equal(row.minimum_presence_rule,
      row.se_floor === 'context' ? PRESENCE_RULE.OPTIONAL_CONTEXT : PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE,
      `${row.stage_code}/${row.artifact_type_id}`);
    // Every declared input resolves to something: a token this layer produces, or one the shared
    // vocabulary owns. Nothing in this layer may name an input that exists nowhere.
    assert.deepEqual(row.dependency_resolution.unresolved, [], row.artifact_type_id);
  }
  assert.ok(activityRows >= 10, 'the layer carries activity rows');
  assert.equal(result.receipt.counts.unresolved_dependency, 0);
  assert.ok(result.receipt.counts.dependency_edges > 100);

  // And with nothing observed, every review stage opens with work that needs nothing first.
  const order = orderStageWork(result);
  for (const stage of order.stages) {
    const firstBlocked = stage.work_items.findIndex((item) => !item.ready);
    if (firstBlocked === -1) continue;
    for (const item of stage.work_items.slice(firstBlocked)) {
      assert.equal(item.ready, false, `${stage.stage_code}/${item.artifact_type_id}`);
    }
  }
});

// ---------------------------------------------------------------- 13c. node kinds and dependencies (D46)

test('the ordering fixture compiles to its hand-derived rule set, with node kinds and edges carried', () => {
  const result = compileStageRules(orderRequest());
  assert.deepEqual(result.receipt.counts, ORDER.expected.counts);
  assert.deepEqual(result.receipt.unresolved_dependencies, ORDER.expected.unresolved_dependencies);
  assert.deepEqual([...NODE_KINDS], ['artifact', 'activity', 'decision']);

  // An activity and a decision are rules, not folders: they reach the engine as requirements and
  // they carry the record that would show the work happened.
  const activity = rowOf(result, 3003);
  assert.equal(activity.node_kind, 'activity');
  assert.equal(activity.is_virtual, true);
  assert.equal(activity.engine_requirement_id, '030_SRR_act_stakeholder_expectations');
  assert.deepEqual(activity.evidence_record, ['review_minutes_srr']);
  assert.equal(familyOf(result, '030_SRR', 'act_stakeholder_expectations').artifact_kind, 'review_evidence');
  assert.equal(requirementOf(result, '030_SRR', '030_SRR_act_stakeholder_expectations').requirement_kind, 'activity');

  const decision = rowOf(result, 9004);
  assert.equal(decision.node_kind, 'decision');
  assert.equal(decision.is_virtual, true);
  assert.equal(familyOf(result, '090_PDR', 'dec_allocated_baseline').artifact_kind, 'owner_decision_record');
  assert.deepEqual(decision.evidence_record, ['review_minutes_pdr', 'ssdd']);

  // The declared inputs travel into the mapping table and into the gap-scan policy's own
  // `expected_inputs`, which the compiler used to leave empty because no rule table said them.
  assert.deepEqual(rowOf(result, 3004).depends_on, ['act_stakeholder_expectations']);
  assert.equal(rowOf(result, 3004).depends_on_evidence, 'guidebook_recommended');
  assert.deepEqual(rowOf(result, 3004).depends_on_refs,
    [{ source_key: 'synthetic_guidebook_v0', locator: 'table 2-1' }]);
  assert.deepEqual(familyOf(result, '030_SRR', 'ssrs').expected_inputs, ['act_stakeholder_expectations']);
  // A row that declares inputs without saying what states them is read as practice, never as
  // inheriting the row's own grade.
  assert.equal(rowOf(result, 3007).depends_on_evidence, 'unstated');
  assert.deepEqual(rowOf(result, 3002).depends_on, []);
});

test('an activity or a decision is asked for as present-or-not-applicable unless a regulation mandates it', () => {
  // The decision row is regulation_mandated, so it stays `present`: a regulation that says the
  // baseline shall be established is not answerable with "we chose not to".
  const mandated = compileStageRules(orderRequest());
  assert.equal(rowOf(mandated, 9004).minimum_presence_rule, PRESENCE_RULE.PRESENT);

  // Drop it to a guidebook and it becomes answerable with a basis, like every other guidance row.
  for (const level of ['guidebook_recommended', 'general_se_guidance', 'prime_contract']) {
    const softened = orderRequest();
    const task = orderTaskOf(softened, 9004);
    task.evidence_level = level;
    if (level === 'general_se_guidance') task.se_floor = 'must_have';
    assert.equal(rowOf(compileStageRules(softened), 9004).minimum_presence_rule,
      PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE, level);
  }

  // The ceiling only reaches non-artifact rows: an ordinary regulation-mandated document is
  // still flatly present.
  assert.equal(rowOf(mandated, 3002).minimum_presence_rule, PRESENCE_RULE.PRESENT);
  const asArtifact = orderRequest();
  orderTaskOf(asArtifact, 9004).node_kind = 'artifact';
  assert.equal(rowOf(compileStageRules(asArtifact), 9004).minimum_presence_rule, PRESENCE_RULE.PRESENT);

  // A node kind the model does not name is refused rather than read as a document.
  const invalid = orderRequest();
  orderTaskOf(invalid, 9004).node_kind = 'milestone';
  assert.throws(() => compileStageRules(invalid), throwsWith(STAGE_RULE_ERROR_CODES.VARIANT_INVALID));
});

test('a declared input naming a token nothing owns is recorded and never refuses the compile', () => {
  const result = compileStageRules(orderRequest());
  assert.equal(result.receipt.counts.unresolved_dependency, 1);
  assert.deepEqual(rowOf(result, 9006).dependency_resolution,
    { in_scope: [], out_of_scope: [], unresolved: ['synthetic_unlisted_input'] });
  // The row itself is unharmed: an authoring mistake in one edge does not re-grade the rule.
  assert.equal(rowOf(result, 9006).minimum_presence_rule, PRESENCE_RULE.PRESENT_OR_NOT_APPLICABLE);
  assert.equal(rowOf(result, 9006).engine_requirement_id, '090_PDR_stp');

  // A vocabulary token this compile does not produce is a real dependency on work outside the
  // compiled scope, which is a different thing from a token nobody owns.
  const outside = orderRequest();
  orderTaskOf(outside, 9006).depends_on = ['temp', 'synthetic_unlisted_input'];
  const widened = compileStageRules(outside);
  assert.deepEqual(rowOf(widened, 9006).dependency_resolution,
    { in_scope: [], out_of_scope: ['temp'], unresolved: ['synthetic_unlisted_input'] });
  assert.equal(workItemOf(orderStageWork(widened), '090_PDR', 'stp').out_of_scope_inputs.length, 1);
});

// ---------------------------------------------------------------- 13d. the work order

test('an empty project is ordered inputs first, deterministically, and the order repeats', () => {
  const compiled = compileStageRules(orderRequest());
  const order = orderStageWork(compiled);
  assert.equal(order.schema_version, STAGE_WORK_ORDER_SCHEMA_VERSION);
  assert.deepEqual(order.stages.map((stage) => stage.stage_code), ['030_SRR', '090_PDR']);
  assert.deepEqual(order.stages.map((stage) => stage.stage_sequence), [30, 90]);

  for (const [stageCode, tokens] of Object.entries(ORDER.expected.empty_project_work_order)) {
    assert.deepEqual(workTokens(order, stageCode), tokens, stageCode);
  }

  // With nothing observed, every declared input is unsatisfied, so a stage opens with the items
  // that need nothing at all — and no item ever precedes one of its own same-stage inputs.
  const srr = order.stages.find((stage) => stage.stage_code === '030_SRR');
  assert.deepEqual(srr.work_items.filter((item) => item.ready).map((item) => item.artifact_type_id),
    ORDER.expected.empty_project_ready_tokens);
  for (const stage of order.stages) {
    const placed = new Map(stage.work_items.map((item) => [item.artifact_type_id, item.order_index]));
    for (const item of stage.work_items) {
      assert.equal(item.order_index, stage.work_items.indexOf(item));
      for (const input of item.same_stage_inputs) {
        if (!placed.has(input)) continue;
        assert.ok(placed.get(input) < item.order_index,
          `${input} must precede ${item.artifact_type_id} in ${stage.stage_code}`);
      }
      assert.equal(item.observation_state, 'unobserved');
      assert.deepEqual(item.blocked_by, item.depends_on);
    }
  }

  // Same input, same bytes — and the order the gates and the target stages happen to be written
  // in cannot reach it.
  assert.deepEqual(orderStageWork(compileStageRules(orderRequest())).receipt.output_digests,
    order.receipt.output_digests);
  const shuffled = orderRequest();
  shuffled.compiled_variant.gates.reverse();
  for (const gate of shuffled.compiled_variant.gates) gate.tasks.reverse();
  shuffled.target_stage_codes = ['030_SRR', '090_PDR'];
  assert.deepEqual(orderStageWork(compileStageRules(shuffled)).stages, order.stages);

  assert.deepEqual(order.receipt.effects, {
    erp_writes: 0, filesystem_writes: 0, model_calls: 0, network_calls: 0, clock_reads: 0,
  });
  // The tie-break the plan asked for and this ordering cannot honestly apply is named, not faked.
  assert.ok(order.receipt.tie_breaks_skipped.some((row) => row.startsWith('gate_entrance_criteria_first')));
});

test('causal edges and the stage sequence stay separate in the work order', () => {
  const order = orderStageWork(compileStageRules(orderRequest()));

  // An input produced at an earlier gate is already ordered by the lifecycle, so it is reported
  // as an earlier-stage input and never as an edge inside this stage.
  const design = workItemOf(order, '090_PDR', 'act_architecture_design');
  assert.deepEqual(design.earlier_stage_inputs, ['ssrs']);
  assert.deepEqual(design.same_stage_inputs, []);
  assert.deepEqual(design.depends_on, ['ssrs']);
  assert.deepEqual(design.blocked_by, ['ssrs']);
  assert.equal(design.node_kind, 'activity');
  assert.equal(design.is_virtual, true);
  assert.deepEqual(design.evidence_record, ['review_minutes_pdr']);

  const ssdd = workItemOf(order, '090_PDR', 'ssdd');
  assert.deepEqual(ssdd.same_stage_inputs, ['act_architecture_design']);
  assert.deepEqual(ssdd.earlier_stage_inputs, []);

  // Only the rows the engine judges become work items; context rows are counted and sequenced
  // but never handed out as something to do.
  assert.equal(order.receipt.counts.work_items, 10);
  assert.equal(order.receipt.counts.context_items, 3);
  assert.ok(!workTokens(order, '030_SRR').includes('rtm'));
  assert.ok(!workTokens(order, '030_SRR').includes('inbox'));

  // The evidence precedence the plan declares is stated in the receipt rather than left implicit.
  assert.ok(order.receipt.evidence_rank.regulation_mandated < order.receipt.evidence_rank.guidebook_recommended);
  assert.ok(order.receipt.evidence_rank.guidebook_recommended < order.receipt.evidence_rank.general_se_guidance);
  assert.ok(order.receipt.evidence_rank.general_se_guidance < order.receipt.evidence_rank.unstated);
});

test('observations mark what is already done without rewriting the rules', () => {
  assert.deepEqual([...OBSERVATION_PRESENCE_STATES], [...PRESENCE_STATES_PIN]);
  const compiled = compileStageRules(orderRequest());
  const empty = orderStageWork(compiled);
  const observed = orderStageWork(compiled, [
    { artifact_type_id: 'conops', presence_state: 'present' },
    { artifact_type_id: 'ssrs', presence_state: 'absence_confirmed' },
  ]);

  const activity = workItemOf(observed, '030_SRR', 'act_stakeholder_expectations');
  assert.deepEqual(activity.satisfied_inputs, ['conops']);
  assert.deepEqual(activity.blocked_by, []);
  assert.equal(activity.ready, true);
  assert.equal(workItemOf(observed, '030_SRR', 'conops').observation_state, 'present');
  assert.equal(workItemOf(observed, '030_SRR', 'ssrs').observation_state, 'absence_confirmed');

  // An edge is a property of the rules, so an item can never move ahead of its own same-stage
  // input however much has been observed. What an observation does change is which items are
  // unblocked, and an unblocked item is offered before one that is still waiting — so the
  // activity, whose only input has now been seen, moves up past a plan that needs nothing.
  assert.deepEqual(workTokens(empty, '030_SRR'),
    ['conops', 'semp', 'act_stakeholder_expectations', 'ssrs', 'review_minutes_srr']);
  assert.deepEqual(workTokens(observed, '030_SRR'),
    ['conops', 'act_stakeholder_expectations', 'semp', 'ssrs', 'review_minutes_srr']);
  const placed = new Map(workTokens(observed, '030_SRR').map((token, index) => [token, index]));
  assert.ok(placed.get('conops') < placed.get('act_stakeholder_expectations'));
  assert.ok(placed.get('act_stakeholder_expectations') < placed.get('ssrs'));
  assert.notDeepEqual(observed.receipt.output_digests, empty.receipt.output_digests);
  assert.equal(observed.receipt.counts.observed_present, 1);

  // Two states for one artifact is a question for the caller, not something to average.
  assert.throws(() => orderStageWork(compiled, [
    { artifact_type_id: 'conops', presence_state: 'present' },
    { artifact_type_id: 'conops', presence_state: 'unknown' },
  ]), throwsWith(STAGE_RULE_ERROR_CODES.WORK_ORDER_INVALID));
  assert.throws(() => orderStageWork(compiled, [
    { artifact_type_id: 'conops', presence_state: 'probably' },
  ]), throwsWith(STAGE_RULE_ERROR_CODES.WORK_ORDER_INVALID));
});

test('a ring of declared inputs has no first item and is refused by code', () => {
  const cyclic = orderRequest();
  // ssrs already needs the stakeholder activity; make the activity need ssrs back.
  orderTaskOf(cyclic, 3003).depends_on = ['conops', 'ssrs'];
  const compiled = compileStageRules(cyclic);
  // The compile itself still succeeds: a cycle is a question about order, not about presence.
  assert.equal(compiled.receipt.counts.dependency_edges, 10);
  assert.throws(() => orderStageWork(compiled), (error) => {
    assert.ok(error instanceof StageRuleCompilerError);
    assert.equal(error.code, STAGE_RULE_ERROR_CODES.DEPENDENCY_CYCLE);
    assert.equal(error.detail.stage_code, '030_SRR');
    assert.deepEqual(error.detail.artifact_type_ids,
      ['act_stakeholder_expectations', 'review_minutes_srr', 'rtm', 'ssrs']);
    return true;
  });

  // A row that names itself is not an edge at all, so it does not deadlock the stage.
  const selfish = orderRequest();
  orderTaskOf(selfish, 3005).depends_on = ['semp'];
  assert.ok(workTokens(orderStageWork(compileStageRules(selfish)), '030_SRR').includes('semp'));
});

test('an overlay may add a declared input and may never take one away', () => {
  const request = orderRequest();
  request.overlay = structuredClone(ORDER.overlay_add_dependency);
  const compiled = compileStageRules(request);
  assert.equal(compiled.receipt.counts.overlay_dependencies_added, 1);

  const row = rowOf(compiled, 9006);
  assert.deepEqual(row.depends_on, ['ssdd', 'synthetic_unlisted_input']);
  // What the canonical table said and what this project added stay tellable apart, and the added
  // edge carries the exact document revision that asked for it.
  assert.deepEqual(row.overlay_depends_on, ['ssdd']);
  assert.deepEqual(row.dependency_resolution.in_scope, ['ssdd']);
  assert.equal(row.overlay_dependency_refs.length, 1);
  assert.equal(row.overlay_dependency_refs[0].source_ref.entity_id, 'synthetic_buyer_request_letter');
  assert.equal(row.overlay_dependency_refs[0].basis, 'synthetic_buyer_asked_for_the_design_first');
  assert.deepEqual(rowOf(compiled, 9003).overlay_dependency_refs, []);

  const order = orderStageWork(compiled);
  assert.deepEqual(workTokens(order, '090_PDR'), ORDER.expected.work_order_with_overlay_dependency['090_PDR']);
  assert.deepEqual(workItemOf(order, '090_PDR', 'stp').same_stage_inputs, ['ssdd']);

  // There is no operation that removes a canonical edge, for the same reason there is none that
  // lowers a canonical evidence level.
  const removing = orderRequest();
  removing.overlay = structuredClone(ORDER.overlay_add_dependency);
  removing.overlay.ops[0] = { ...removing.overlay.ops[0], op: 'remove_dependency' };
  assert.throws(() => compileStageRules(removing), throwsWith(STAGE_RULE_ERROR_CODES.OVERLAY_FORBIDDEN));

  // And an added edge still has to name a rule that exists.
  const missing = orderRequest();
  missing.overlay = structuredClone(ORDER.overlay_add_dependency);
  missing.overlay.ops[0].artifact_type_id = 'ot_report';
  assert.throws(() => compileStageRules(missing), throwsWith(STAGE_RULE_ERROR_CODES.OVERLAY_INVALID));

  const empty = orderRequest();
  empty.overlay = structuredClone(ORDER.overlay_add_dependency);
  empty.overlay.ops[0].depends_on = [];
  assert.throws(() => compileStageRules(empty), throwsWith(STAGE_RULE_ERROR_CODES.OVERLAY_INVALID));
});

// ---------------------------------------------------------------- 13e. layered equals merged

test('the layered rule path and the merged spec path agree on the real 체계개발 table at 120_CDR', () => {
  // The tracked spec carries both the national common rows and the prime-contract rows, and the
  // exporter splits them into a common baseline plus a prime overlay. If the split and the
  // compiler's weakening rules ever disagree, the two paths stop naming the same requirements —
  // which is the failure this asserts against, on the real rule table rather than a synthetic one.
  const compiled = (name) => JSON.parse(readFileSync(new URL(
    `../../../.registry/skills/se_foldertree_generate/codex/assets/compiled/${name}`,
    import.meta.url), 'utf8'));
  const merged = compiled('system_dev_lig_grade_a.json');
  const common = compiled('system_dev_common_no_grade.json');
  const primeOverlay = compiled('overlays/system_dev_lig_grade_a.prime.overlay.json');

  const binding = {
    document_refs: [{
      artifact_type_ids_covered: [],
      requirement_ref: syntheticRef('layered_equivalence_probe_document'),
    }],
    valid_at: '2026-05-04T00:00:00.000Z',
    known_at: '2026-05-11T00:00:00.000Z',
    authority_family: 'project_contract_baseline',
    applicability_default: true,
  };
  const conditions = ['exploratory_skipped', 'sw_included'];
  const run = (variant, overlay) => compileStageRules({
    compiled_variant: variant,
    overlay,
    project_binding: structuredClone(binding),
    target_stage_codes: ['120_CDR'],
    overlay_conditions: [...conditions],
  });

  const mergedResult = run(merged, null);
  const layeredResult = run(common, primeOverlay);
  assert.deepEqual(requirementIds(layeredResult), requirementIds(mergedResult));
  assert.equal(layeredResult.receipt.counts.engine_requirements,
    mergedResult.receipt.counts.engine_requirements);
  assert.ok(mergedResult.receipt.counts.engine_requirements > 0);

  // The work order is a pure function of the rules, so the two paths also agree on what to do
  // first — this is the property that would break silently if only one path carried the edges.
  assert.deepEqual(workTokens(orderStageWork(layeredResult), '120_CDR'),
    workTokens(orderStageWork(mergedResult), '120_CDR'));
});

// ---------------------------------------------------------------- 13f. the empty project

test('an empty 체계개발 project is told what to do first at 030_SRR, from the real rule table', () => {
  // The plan's completion test for this slice: with zero observations, the national common
  // baseline plus its prime-contract overlay has to name a deterministic first list. What that
  // list contains is whatever the canonical texts support and is asserted structurally rather
  // than by name, so re-deriving an edge changes the order without breaking the property.
  const compiled = (name) => JSON.parse(readFileSync(new URL(
    `../../../.registry/skills/se_foldertree_generate/codex/assets/compiled/${name}`,
    import.meta.url), 'utf8'));
  const result = compileStageRules({
    compiled_variant: compiled('system_dev_common_no_grade.json'),
    overlay: compiled('overlays/system_dev_lig_grade_a.prime.overlay.json'),
    project_binding: {
      document_refs: [{
        artifact_type_ids_covered: [],
        requirement_ref: syntheticRef('empty_project_probe_document'),
      }],
      valid_at: '2026-05-04T00:00:00.000Z',
      known_at: '2026-05-11T00:00:00.000Z',
      authority_family: 'project_contract_baseline',
      applicability_default: true,
    },
    target_stage_codes: ['030_SRR', '060_SFR', '090_PDR', '120_CDR'],
    overlay_conditions: ['exploratory_skipped', 'sw_included'],
  });
  const order = orderStageWork(result);
  const srr = order.stages.find((stage) => stage.stage_code === '030_SRR');
  assert.ok(srr && srr.work_items.length > 10);

  // Everything that needs nothing comes before everything that is still waiting on an input.
  const firstBlocked = srr.work_items.findIndex((item) => !item.ready);
  assert.ok(firstBlocked > 0, 'the stage opens with work that needs nothing');
  for (const item of srr.work_items.slice(0, firstBlocked)) {
    assert.deepEqual(item.depends_on, [], item.artifact_type_id);
  }
  for (const item of srr.work_items.slice(firstBlocked)) {
    assert.ok(item.depends_on.length > 0, item.artifact_type_id);
  }
  // Inside the unblocked head, a regulation comes before a guidebook recommendation, and that
  // before a contract item.
  const head = srr.work_items.slice(0, firstBlocked).map((item) => item.evidence_rank);
  assert.deepEqual(head, [...head].sort((left, right) => left - right));
  assert.equal(srr.work_items[0].evidence_level, 'regulation_mandated');

  // The two things this slice added are visible in the answer: an activity node, and an item
  // that has to wait for one.
  assert.ok(srr.work_items.some((item) => item.node_kind === 'activity' && item.is_virtual));
  const waiting = srr.work_items.filter((item) => item.same_stage_inputs.length > 0);
  assert.ok(waiting.length > 0, 'at least one SRR item waits on same-stage work');
  for (const item of waiting) {
    for (const input of item.same_stage_inputs) {
      const inputIndex = srr.work_items.findIndex((row) => row.artifact_type_id === input);
      // An input can be a context row of this stage rather than work — a buyer-owned document,
      // for instance. It still sequences the item that needs it, and it is still not something
      // to hand anybody as a thing to do, so it is absent from the work list by design.
      if (inputIndex === -1) continue;
      assert.ok(inputIndex < item.order_index,
        `${input} must be offered before ${item.artifact_type_id}`);
    }
  }
  // The review activity waits on a buyer-owned document that this stage carries as context: the
  // list says "not yet" rather than pretending the review is ready.
  const review = srr.work_items.find((item) => item.artifact_type_id === 'act_technical_review');
  assert.ok(review && review.ready === false && review.blocked_by.length > 0);
  assert.ok(!srr.work_items.some((item) => item.artifact_type_id === review.blocked_by[0]),
    'the blocking input is a context row of this stage, not work');

  // Every later stage is ordered too, and no stage names an input nothing owns.
  assert.deepEqual(order.stages.map((stage) => stage.stage_code),
    ['030_SRR', '060_SFR', '090_PDR', '120_CDR']);
  assert.equal(order.receipt.counts.unresolved_dependency, 0);
  assert.deepEqual(result.receipt.unresolved_dependencies, []);
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

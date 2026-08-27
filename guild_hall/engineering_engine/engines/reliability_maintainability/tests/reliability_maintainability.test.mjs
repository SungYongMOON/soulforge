import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  RM_EVALUATOR_ERROR_CODES,
  assessReliabilityMaintainability,
  verifyReliabilityMaintainabilityResult,
} from '../evaluator/reliability_maintainability.mjs';
import {
  RELIABILITY_MAINTAINABILITY_PUBLIC_SYNTHETIC_FIXTURE,
  RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF,
  RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_SHA256,
  buildReliabilityMaintainabilityPublicSyntheticRequest,
} from '../fixtures/reliability_maintainability_public_synthetic.mjs';
import {
  RELIABILITY_MAINTAINABILITY_RULES,
  RELIABILITY_MAINTAINABILITY_RULESET_REF,
} from '../rules/reliability_maintainability_rules.mjs';
import { createReliabilityMaintainabilityModuleManifest } from '../topology/reliability_maintainability_module_manifest.mjs';

const RESULT_EFFECTS = Object.freeze({
  filesystem: 0,
  network: 0,
  model: 0,
  rag: 0,
  wiki: 0,
  erp: 0,
  task: 0,
  approval: 0,
});
const FORBIDDEN_OUTPUT_FIELDS = new Set([
  'product_acceptance', 'product_accepted', 'quality_acceptance', 'quality_state',
  'compliance', 'compliance_state', 'risk_closed', 'closure_state', 'repair_authorized',
  'release_authorized', 'spare_procurement_authorized',
]);

function assess(request = buildReliabilityMaintainabilityPublicSyntheticRequest()) {
  return assessReliabilityMaintainability(request);
}

function rowFor(request, caseId) {
  const row = request.domain_input.rows.find((entry) => entry.case_id === caseId);
  assert.ok(row, `expected ${caseId} row`);
  return row;
}

function resultFor(result, caseId) {
  const entry = result.domain_result.results.find((candidate) => candidate.case_id === caseId);
  assert.ok(entry, `expected ${caseId} result`);
  return entry;
}

function rejectsWith(code, operation) {
  assert.throws(operation, (error) => error?.code === code, `expected ${code}`);
}

function assertDeepFrozen(value, path = 'result') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${path}.${key}`);
}

function assertNoForbiddenFields(value, path = 'result') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(FORBIDDEN_OUTPUT_FIELDS.has(key), false, `${path}.${key} is outside E06 authority`);
    assertNoForbiddenFields(child, `${path}.${key}`);
  }
}

function manifestFactoryInput() {
  return {
    module_version: '0.1.0',
    build_commit: 'e2acd5d899a1760bd528ffd12a9835c949df1d8e',
    artifact_sha256: '1'.repeat(64),
    engine_contract_abi_range: '>=1.0.0 <2.0.0',
    supported_project_classifications: ['public_synthetic'],
    dependency_versions: { engineering_core: '1.0.0' },
    configuration_hash: '2'.repeat(64),
    rollback_compatible_with: ['0.1.0'],
    test_receipt_ref: 'receipt:synthetic-reliability-maintainability-focused-test-v0',
  };
}

test('R&M source packet bytes match the locked candidate SHA-256', () => {
  const packetPath = fileURLToPath(new URL('../contracts/reliability_maintainability_source_packet_v0.md', import.meta.url));
  const actual = createHash('sha256').update(readFileSync(packetPath)).digest('hex');
  assert.equal(actual, RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_SHA256);
  assert.equal(RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF.content_id, `sha256:${actual}`);
});

test('descriptor, schema, topology, manual, and local integration request form a complete package surface', () => {
  const packageRoot = fileURLToPath(new URL('../', import.meta.url));
  const descriptor = readFileSync(new URL('../engine.yaml', import.meta.url), 'utf8');
  assert.match(descriptor, /^domain_engine_id: reliability_maintainability$/m);
  assert.match(descriptor, /^claim_ceiling: source_supported$/m);
  assert.match(descriptor, /^execution_mode: deterministic_only$/m);

  const schema = JSON.parse(readFileSync(new URL('../schemas/reliability_maintainability_schema_v0.json', import.meta.url), 'utf8'));
  assert.equal(schema.properties.domain_engine_id.const, 'reliability_maintainability');
  assert.equal(schema.properties.schema_version.const, 'soulforge.domain_engine_descriptor.v0');
  assert.equal(schema.properties.schemas.properties.typed_facts.const, 'soulforge.reliability_maintainability.typed_facts.v0');

  const topology = JSON.parse(readFileSync(new URL('../topology/reliability_maintainability_topology.json', import.meta.url), 'utf8'));
  assert.equal(topology.domain_engine_id, 'reliability_maintainability');
  assert.equal(topology.core_interface.core_modification_required, false);
  assert.deepEqual(topology.effects, RESULT_EFFECTS);
  for (const node of topology.nodes) {
    assert.equal(existsSync(join(packageRoot, node.path)), true, `topology node ${node.id} must exist`);
  }
  for (let chapter = 1; chapter <= 12; chapter += 1) {
    const name = String(chapter).padStart(2, '0');
    assert.equal(existsSync(join(packageRoot, 'manual', `${name}_${[
      'purpose_and_shape', 'source_derivation', 'vocabulary_and_quality_boundary', 'rule_layers',
      'compiler_and_profile_bindings', 'evaluator_and_error_contract', 'metrics_and_availability',
      'fmeca_and_closure_gaps', 'maintainability_spares_support', 'runs_replay_zero_write',
      'decisions_and_holds', 'integration_door',
    ][chapter - 1]}.md`)), true, `manual chapter ${chapter} must exist`);
  }
  assert.equal(existsSync(join(packageRoot, 'contracts', 'reliability_maintainability_integration_request_v0.md')), true);
});

test('R&M candidate rules retain the source-specific scope and vocabulary boundary', () => {
  assert.deepEqual(RELIABILITY_MAINTAINABILITY_RULES.map((rule) => ({
    rule_id: rule.rule_id,
    source_ref: rule.source_ref,
    source_locator: rule.source_locator,
    source_modality: rule.source_modality,
    evidence: rule.allowed_evidence_kinds,
    authority: rule.required_authority_families,
    context: rule.context_ref_fields,
    sufficiency: rule.sufficiency_fields,
  })), [
    {
      rule_id: 'RM-AVL-06', source_ref: 'S1-NASA-STD-8729.1A',
      source_locator: '§3.2, pp. 7-8; Appendix C, Availability Analysis, p. 33',
      source_modality: 'NASA R&M definition and analysis method; explicit Ai/Ao classification and project-selected target/basis are required',
      evidence: [null, 'availability_analysis'], authority: ['project_contract_baseline'],
      context: ['availability_input_basis_ref', 'availability_kind_ref', 'availability_model_or_calculation_ref', 'availability_requirement_ref', 'availability_result_ref'],
      sufficiency: ['evaluation_result_ref', 'evaluation_result_state'],
    },
    {
      rule_id: 'RM-CLS-07', source_ref: 'S2-GSFC-HDBK-8004',
      source_locator: '§§4.4-4.4.1; corroborating NASA-STD-8729.1A §5.2 and Appendix C, Problem Failure Reporting, p. 49',
      source_modality: 'traceable update and failure-control evidence; no engine authority to close risk, authorize repair, release, or accept product',
      evidence: [null, 'failure_closure_trace'], authority: ['project_contract_baseline'],
      context: ['closure_authority_ref', 'corrective_or_control_action_ref', 'failure_or_anomaly_ref', 'fmeca_update_ref', 'verification_evidence_ref'],
      sufficiency: ['evaluation_result_ref', 'evaluation_result_state'],
    },
    {
      rule_id: 'RM-FMECA-02', source_ref: 'S2-GSFC-HDBK-8004',
      source_locator: '§§1.1-1.2, 4.4; corroborating NASA-STD-8729.1A Appendix C, FMEA/FMECA, pp. 34-35',
      source_modality: 'GSFC FMECA guidance as a living analysis linked to design/change evidence; this engine does not assign criticality or approve mitigation',
      evidence: [null, 'fmeca_record'], authority: ['project_contract_baseline'],
      context: ['configuration_baseline_ref', 'criticality_method_ref', 'failure_mode_trace_ref', 'fmeca_ref', 'fmeca_scope_ref', 'update_trigger_ref'],
      sufficiency: ['evaluation_result_ref', 'evaluation_result_state'],
    },
    {
      rule_id: 'RM-MDEMO-04', source_ref: 'S1-NASA-STD-8729.1A',
      source_locator: 'Appendix C, Maintainability Demonstration, p. 49',
      source_modality: 'formal repair simulation method for stated critical equipment/circumstances; it is not an automatic requirement outside a bound scope',
      evidence: [null, 'maintainability_demonstration_record'], authority: ['project_contract_baseline'],
      context: ['maintainability_demo_plan_ref', 'maintainability_demo_procedure_ref', 'maintainability_demo_result_ref', 'maintainability_requirement_ref', 'requirement_comparison_ref'],
      sufficiency: ['evaluation_result_ref', 'evaluation_result_state'],
    },
    {
      rule_id: 'RM-MET-03', source_ref: 'S1-NASA-STD-8729.1A',
      source_locator: '§3.2, pp. 7-10; Appendix C, Maintainability Modeling, p. 40',
      source_modality: 'defined R&M metrics and a repair-time estimation method; thresholds, units, and calculation method remain project-bound',
      evidence: [null, 'failure_repair_metric_record'], authority: ['project_contract_baseline'],
      context: ['metric_calculation_or_model_ref', 'metric_cutoff_ref', 'metric_data_ref', 'metric_definition_ref', 'metric_time_basis_ref'],
      sufficiency: ['evaluation_result_ref', 'evaluation_result_state'],
    },
    {
      rule_id: 'RM-REL-01', source_ref: 'S1-NASA-STD-8729.1A',
      source_locator: '§5.1.2(b); Appendix C, Reliability Modeling (Prediction/Allocation), p. 37',
      source_modality: 'NASA R&M planning/objective material with prediction/allocation method under stated circumstances; no universal calculation is implied',
      evidence: [null, 'reliability_allocation_model'], authority: ['project_contract_baseline'],
      context: ['allocation_or_prediction_basis_ref', 'model_revision_ref', 'model_scope_ref', 'reliability_model_ref', 'reliability_requirement_ref'],
      sufficiency: ['evaluation_result_ref', 'evaluation_result_state'],
    },
    {
      rule_id: 'RM-SUP-05', source_ref: 'S1-NASA-STD-8729.1A',
      source_locator: '§3.2, pp. 7-13; Appendix C, Logistics Support Analysis/Plan, p. 40',
      source_modality: 'supportability/readiness analysis linking maintenance concept, support resources, spares, and support equipment; it does not authorize a purchase or provisioning action',
      evidence: [null, 'logistics_support_analysis'], authority: ['project_contract_baseline'],
      context: ['logistics_support_analysis_ref', 'maintenance_concept_ref', 'spares_analysis_ref', 'support_equipment_ref', 'support_resource_basis_ref'],
      sufficiency: ['evaluation_result_ref', 'evaluation_result_state'],
    },
  ]);
});

test('the seven public-synthetic cases produce deterministic R&M evidence states', () => {
  const result = assess();
  const expected = RELIABILITY_MAINTAINABILITY_PUBLIC_SYNTHETIC_FIXTURE.expected;
  assert.deepEqual(result.domain_result.results.map((entry) => entry.case_id), expected.ordered_case_ids);
  for (const [caseId, state] of Object.entries(expected.states_by_case)) {
    assert.equal(resultFor(result, caseId).state, state, caseId);
  }
  assert.deepEqual(result.domain_result.counts, expected.counts);
  assert.deepEqual(result.receipt.counts, expected.counts);
  assert.equal(resultFor(result, 'CLOSURE_GAP').reason_code, 'context_facts_missing');
  assert.equal(resultFor(result, 'SUPPORT_AUTHORITY_HOLD').authority_hold, true);
  assert.equal(resultFor(result, 'FMECA_CONFLICT').conflict.retained_claims.length, 2);
  assert.equal(resultFor(result, 'FMECA_CONFLICT').conflict.governing_authority_family, 'project_contract_baseline');
  for (const entry of result.domain_result.results) {
    assert.equal(entry.canon_claim_ceiling, 'source_supported');
    assert.ok(['source_sufficient', 'source_referenced', 'unknown', 'contradicted', 'not_applicable']
      .includes(entry.evidence_claim_ceiling));
  }
  assert.equal(result.assessment.overall_state, 'hold');
});

test('evaluation preserves input, deeply freezes output, and replays regardless of caller row order', () => {
  const request = buildReliabilityMaintainabilityPublicSyntheticRequest();
  const before = JSON.stringify(request);
  const first = assess(request);
  assert.equal(JSON.stringify(request), before);
  assertDeepFrozen(first);

  const reordered = buildReliabilityMaintainabilityPublicSyntheticRequest();
  reordered.domain_input.rows.reverse();
  const second = assess(reordered);
  assert.deepEqual(second, first);
});

test('an accepted closure trace never declares closure authority exercised', () => {
  const request = buildReliabilityMaintainabilityPublicSyntheticRequest();
  const row = rowFor(request, 'CLOSURE_GAP');
  row.context_refs.closure_authority_ref = structuredClone(request.binding.objective_ref);
  row.evaluation_result_ref = structuredClone(request.binding.policy_ref);
  row.evaluation_result_state = 'criteria_met';
  const closure = resultFor(assess(request), 'CLOSURE_GAP');
  assert.equal(closure.state, 'satisfied');
  assert.equal(closure.closure_authority_exercised, false);
  assert.equal(Object.hasOwn(closure, 'closure_state'), false);
});

test('unknown applicability, missing context, absent evidence, and missing authority retain distinct outcomes', () => {
  const result = assess();
  assert.equal(resultFor(result, 'DEMO_UNKNOWN').reason_code, 'applicability_unknown');
  assert.equal(resultFor(result, 'CLOSURE_GAP').reason_code, 'context_facts_missing');
  assert.equal(resultFor(result, 'METRICS_MISSING').reason_code, 'absence_confirmed');
  assert.equal(resultFor(result, 'SUPPORT_AUTHORITY_HOLD').reason_code, 'authority_missing');

  const missingBasis = buildReliabilityMaintainabilityPublicSyntheticRequest();
  rowFor(missingBasis, 'RELIABILITY_SATISFIED').applicability.approval_scope = false;
  rejectsWith(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, () => assess(missingBasis));
});

test('R&M evidence vocabulary refuses Quality labels and evidence cannot impersonate authority', () => {
  const wrongVocabulary = buildReliabilityMaintainabilityPublicSyntheticRequest();
  rowFor(wrongVocabulary, 'FMECA_CONFLICT').evidence_kind = 'fmeca';
  rejectsWith(RM_EVALUATOR_ERROR_CODES.VOCABULARY_REFUSED, () => assess(wrongVocabulary));

  const wrongQualityLabel = buildReliabilityMaintainabilityPublicSyntheticRequest();
  rowFor(wrongQualityLabel, 'RELIABILITY_SATISFIED').evidence_kind = 'manufacturing_process_flow';
  rejectsWith(RM_EVALUATOR_ERROR_CODES.VOCABULARY_REFUSED, () => assess(wrongQualityLabel));

  const impersonatedAuthority = buildReliabilityMaintainabilityPublicSyntheticRequest();
  const row = rowFor(impersonatedAuthority, 'RELIABILITY_SATISFIED');
  const evidence = structuredClone(row.evidence_refs[0]);
  row.authority_bindings[0].role_ref = evidence;
  row.authority_bindings[0].delegation_ref = structuredClone(evidence);
  row.authority_bindings[0].decision_ref = structuredClone(evidence);
  rejectsWith(RM_EVALUATOR_ERROR_CODES.AUTHORITY_REFUSED, () => assess(impersonatedAuthority));
});

test('binding pins packet/ruleset/module/source revisions and exact accepted rows', () => {
  const stalePacket = buildReliabilityMaintainabilityPublicSyntheticRequest();
  stalePacket.binding.source_packet_ref.content_id = `sha256:${'0'.repeat(64)}`;
  rejectsWith(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED, () => assess(stalePacket));

  const staleRuleset = buildReliabilityMaintainabilityPublicSyntheticRequest();
  staleRuleset.binding.ruleset_ref = structuredClone(RELIABILITY_MAINTAINABILITY_RULESET_REF);
  staleRuleset.binding.ruleset_ref.content_id = `sha256:${'f'.repeat(64)}`;
  rejectsWith(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED, () => assess(staleRuleset));

  const floatingProject = buildReliabilityMaintainabilityPublicSyntheticRequest();
  floatingProject.binding.project_binding_ref.revision_id = 'latest';
  rejectsWith(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED, () => assess(floatingProject));

  const conflatedSource = buildReliabilityMaintainabilityPublicSyntheticRequest();
  conflatedSource.binding.source_bindings[0].body_revision_ref = structuredClone(
    conflatedSource.binding.source_bindings[0].metadata_revision_ref,
  );
  rejectsWith(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED, () => assess(conflatedSource));

  const unaccepted = buildReliabilityMaintainabilityPublicSyntheticRequest();
  rowFor(unaccepted, 'RELIABILITY_SATISFIED').rule_id = 'RM-REL-99';
  rejectsWith(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, () => assess(unaccepted));

  const wrongStage = buildReliabilityMaintainabilityPublicSyntheticRequest();
  rowFor(wrongStage, 'RELIABILITY_SATISFIED').stage_ref = structuredClone(
    wrongStage.binding.accepted_rule_bindings.find((binding) => binding.rule_id === 'RM-AVL-06').stage_ref,
  );
  rejectsWith(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, () => assess(wrongStage));
});

test('raw/private material, aliases, accessors, and malformed manifest factory inputs fail closed', () => {
  const raw = buildReliabilityMaintainabilityPublicSyntheticRequest();
  raw.domain_input.rows[0].source_body = 'private source text';
  rejectsWith(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, () => assess(raw));

  const aliased = buildReliabilityMaintainabilityPublicSyntheticRequest();
  aliased.binding.engine_ref = aliased.binding.objective_ref;
  rejectsWith(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, () => assess(aliased));

  const accessor = buildReliabilityMaintainabilityPublicSyntheticRequest();
  const original = accessor.domain_input.rows[0];
  let getterCalls = 0;
  Object.defineProperty(accessor.domain_input.rows, '0', {
    enumerable: true,
    configurable: true,
    get() { getterCalls += 1; return original; },
  });
  rejectsWith(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, () => assess(accessor));
  assert.equal(getterCalls, 0);

  const factoryInput = manifestFactoryInput();
  Object.defineProperty(factoryInput, 'artifact_sha256', {
    enumerable: true,
    configurable: true,
    get() { return '1'.repeat(64); },
  });
  assert.throws(() => createReliabilityMaintainabilityModuleManifest(factoryInput));
});

test('receipt has no decision authority, all effects are zero, and runner is zero-write/stable', () => {
  const result = assess();
  assertNoForbiddenFields(result);
  assert.deepEqual(result.receipt.effects, RESULT_EFFECTS);
  assert.equal(result.receipt.bindings.execution_mode, 'deterministic_only');
  for (const digest of Object.values(result.receipt.digests)) assert.match(digest, /^[a-f0-9]{64}$/);

  const runnerPath = fileURLToPath(new URL('../tools/reliability_maintainability_runner.mjs', import.meta.url));
  const sandbox = mkdtempSync(join(tmpdir(), 'reliability-maintainability-runner-'));
  try {
    const first = spawnSync(process.execPath, [runnerPath], { cwd: sandbox, encoding: 'utf8', timeout: 10_000 });
    const second = spawnSync(process.execPath, [runnerPath], { cwd: sandbox, encoding: 'utf8', timeout: 10_000 });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stderr, '');
    assert.equal(second.stderr, '');
    assert.equal(second.stdout, first.stdout);
    assert.deepEqual(JSON.parse(first.stdout), result);
    assert.deepEqual(readdirSync(sandbox), []);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('RED: direct request containing admitted row with evidence_kind: null evaluates deterministically, retains literal null, and verifies', () => {
  const concreteRequest = buildReliabilityMaintainabilityPublicSyntheticRequest();
  const concreteResult = assess(concreteRequest);

  const request = buildReliabilityMaintainabilityPublicSyntheticRequest();
  const relRow = request.domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
  relRow.evidence_kind = null;

  const requestBefore = structuredClone(request);
  const result = assess(request);

  // Deeply frozen and non-mutating
  assert.deepEqual(request, requestBefore, 'assessment must not mutate input');
  assertDeepFrozen(result);
  assertNoForbiddenFields(result);

  // Retains literal null
  const relResult = result.domain_result.results.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
  assert.equal(relResult.evidence_kind, null, 'domain_result result must carry literal null');
  assert.equal(relResult.state, 'satisfied');
  assert.equal(relResult.reason_code, 'evidence_sufficient');

  // Digests differ deterministically from concrete evidence kind
  assert.notEqual(result.receipt.digests.domain_result_sha256, concreteResult.receipt.digests.domain_result_sha256);
  assert.notEqual(result.receipt.digests.input_sha256, concreteResult.receipt.digests.input_sha256);
  assert.notEqual(result.receipt.digests.result_sha256, concreteResult.receipt.digests.result_sha256);

  // Deterministic byte replay
  const replay = assess(request);
  assert.deepEqual(result, replay);
  assert.equal(JSON.stringify(result), JSON.stringify(replay));

  // Replay regardless of caller row order
  const permutedRequest = structuredClone(request);
  permutedRequest.domain_input.rows.reverse();
  const permutedResult = assess(permutedRequest);
  assert.deepEqual(permutedResult.domain_result, result.domain_result);
  assert.deepEqual(permutedResult.assessment, result.assessment);
  assert.deepEqual(permutedResult.receipt.digests, result.receipt.digests);

  // Verifies against trusted input
  const verification = verifyReliabilityMaintainabilityResult(result, null, request);
  assert.equal(verification.verified, true);
  assert.deepEqual(verification.digests, result.receipt.digests);

  // Omission of evidence_kind is refused
  const omitted = structuredClone(request);
  delete omitted.domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED').evidence_kind;
  rejectsWith(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, () => assess(omitted));

  // Injected marker-shaped caller value is refused
  const markerInjected = structuredClone(request);
  markerInjected.domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED').evidence_kind = { source_native: true };
  rejectsWith(RM_EVALUATOR_ERROR_CODES.VOCABULARY_REFUSED, () => assess(markerInjected));

  // Invalid null in non-nullable fields remains rejected
  const nullCaseId = structuredClone(request);
  nullCaseId.domain_input.rows[0].case_id = null;
  rejectsWith(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, () => assess(nullCaseId));

  const nullStageRef = structuredClone(request);
  nullStageRef.domain_input.rows[0].stage_ref = null;
  rejectsWith(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, () => assess(nullStageRef));

  const nullCutoffs = structuredClone(request);
  nullCutoffs.cutoffs = null;
  rejectsWith(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED, () => assess(nullCutoffs));
});

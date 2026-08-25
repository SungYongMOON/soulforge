import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { assessQualityReadiness } from '../evaluator/quality_readiness.mjs';
import {
  buildQualityReadinessPublicSyntheticRequest,
  QUALITY_READINESS_PUBLIC_SYNTHETIC_FIXTURE,
  QUALITY_READINESS_SOURCE_PACKET_REF,
  QUALITY_READINESS_SOURCE_PACKET_SHA256,
} from '../fixtures/quality_readiness_public_synthetic.mjs';
import { QUALITY_READINESS_RULES } from '../rules/quality_readiness_rules.mjs';
import { createQualityReadinessModuleManifest } from '../topology/quality_readiness_module_manifest.mjs';

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
  'product_acceptance',
  'product_accepted',
  'compliance',
  'compliance_state',
  'disposition',
  'disposition_state',
  'release_authorized',
]);

// Independent literal semantic lock. These values are copied from the reviewed source packet,
// not derived from the implementation's ruleset digest.
const EXPECTED_RULES = [
  {
    rule_id: 'QR-FAR-01',
    source_ref: 'S2-FAR-46',
    source_locator: '§§46.103-46.105, 46.201-46.203',
    source_modality: 'role- and clause-specific duties; exact contract controls',
    allowed_artifact_tokens: [null],
    required_authority_families: ['applicable_law_and_regulation', 'project_contract_baseline'],
    context_ref_fields: ['agency_allocation_ref', 'contract_clause_ref', 'far_jurisdiction_ref'],
    sufficiency_fields: [],
  },
  {
    rule_id: 'QR-FAR-02',
    source_ref: 'S2-FAR-46',
    source_locator: '§§46.104(c), 46.401(f), 46.501-46.502',
    source_modality: '§46.401(f) inspection documentation is mandatory; ordinary acceptance-certificate path is conditional on exact procedure and exceptions',
    allowed_artifact_tokens: ['delivery_acceptance_record'],
    required_authority_families: ['applicable_law_and_regulation', 'project_contract_baseline'],
    context_ref_fields: [
      'agency_procedure_ref', 'completed_actions_ref', 'exceptions_ref',
      'far_jurisdiction_ref', 'inspection_record_ref', 'record_path_ref',
    ],
    sufficiency_fields: [],
  },
  {
    rule_id: 'QR-FAR-03',
    source_ref: 'S2-FAR-46',
    source_locator: '§46.407',
    source_modality: 'preserve branch-specific should/may/shall and prerequisites',
    allowed_artifact_tokens: [null],
    required_authority_families: ['applicable_law_and_regulation', 'project_contract_baseline'],
    context_ref_fields: [
      'far_jurisdiction_ref', 'nonconformance_class_ref', 'proposed_disposition_ref',
      'selected_branch_ref', 'technical_evidence_ref',
    ],
    sufficiency_fields: [],
  },
  {
    rule_id: 'QR-MIL-01',
    source_ref: 'S1-MIL-STD-1916',
    source_locator: '§§1.2, 5.1-5.1.3',
    source_modality: 'operative requirements only after exact invocation; §1.2 flow-down should remains advisory',
    allowed_artifact_tokens: [null],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: ['invocation_ref', 'scope_ref'],
    sufficiency_fields: [],
  },
  {
    rule_id: 'QR-MIL-02',
    source_ref: 'S1-MIL-STD-1916',
    source_locator: '§§5.1.4.1-5.1.4.3',
    source_modality: 'effectiveness proof required; evidence examples are non-exhaustive and not individually mandatory',
    allowed_artifact_tokens: [null, 'manufacturing_process_flow'],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: ['invocation_ref', 'scope_ref'],
    sufficiency_fields: ['approved_evidence_selection_ref', 'measurement_evaluation_criteria_ref'],
  },
  {
    rule_id: 'QR-MIL-03',
    source_ref: 'S1-MIL-STD-1916',
    source_locator: '§§4.3-4.5',
    source_modality: 'operative requirements with critical-nonconformance branch conditions',
    allowed_artifact_tokens: [null],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: ['government_route_ref', 'invocation_ref', 'scope_ref'],
    sufficiency_fields: [],
  },
  ...['QR-NASA-01', 'QR-NASA-02', 'QR-NASA-03'].map((rule_id, index) => ({
    rule_id,
    source_ref: 'S3-NASA-STD-8739.6B',
    source_locator: [
      '§§1.2-1.3, 4.1.2-4.1.5',
      '§§4.1.6, 4.3.1-4.3.2',
      '§§5.4, 6.6.1, 6.8.1-6.8.2',
    ][index],
    source_modality: [
      '§1.2.3 referral remains advisory; §4.1.2 is context; only §§4.1.4-4.1.5 operative duties become checks',
      'operative stop-work and prior-approval requirements',
      'operative, scope-specific retention/inspection/rework/repair requirements',
    ][index],
    allowed_artifact_tokens: [null],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: ['authority_route_ref', 'baseline_ref', 'nasa_flowdown_ref', 'scope_ref', 'tailoring_ref'],
    sufficiency_fields: [],
  })),
];

function assess(request = buildQualityReadinessPublicSyntheticRequest()) {
  return assessQualityReadiness(request);
}

function resultFor(result, caseId) {
  const found = result.domain_result.results.find((entry) => entry.case_id === caseId);
  assert.ok(found, `expected ${caseId} domain result`);
  return found;
}

function assertDeepFrozen(value, path = 'result') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${path}.${key}`);
}

function assertNoForbiddenFields(value, path = 'result') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(FORBIDDEN_OUTPUT_FIELDS.has(key), false, `${path}.${key} is outside E01 authority`);
    assertNoForbiddenFields(child, `${path}.${key}`);
  }
}

function rowFor(request, caseId) {
  const row = request.domain_input.rows.find((entry) => entry.case_id === caseId);
  assert.ok(row, `expected ${caseId} input row`);
  return row;
}

function rejectsWith(code, operation) {
  assert.throws(operation, (error) => error?.code === code, `expected ${code}`);
}

function manifestFactoryInput() {
  return {
    module_version: '0.1.0',
    build_commit: 'e7f465ccbe0243efe5678cdf1a5a7dd05bbcde35',
    artifact_sha256: '1'.repeat(64),
    engine_contract_abi_range: '>=1.0.0 <2.0.0',
    supported_project_classifications: ['public_synthetic'],
    dependency_versions: { engineering_kernel: '1.0.0' },
    configuration_hash: '2'.repeat(64),
    rollback_compatible_with: ['0.1.0'],
    test_receipt_ref: 'receipt:synthetic-quality-readiness-focused-test-v0',
  };
}

test('accepted source packet bytes match the locked quality-readiness SHA-256', () => {
  const packetPath = fileURLToPath(new URL('../contracts/quality_readiness_source_packet_v0.md', import.meta.url));
  const actual = createHash('sha256').update(readFileSync(packetPath)).digest('hex');
  assert.equal(actual, QUALITY_READINESS_SOURCE_PACKET_SHA256);
  assert.equal(QUALITY_READINESS_SOURCE_PACKET_REF.content_id, `sha256:${actual}`);
});

test('candidate rules exactly preserve the reviewed packet semantics', () => {
  assert.deepEqual(structuredClone(QUALITY_READINESS_RULES), EXPECTED_RULES);
});

test('Revision Gate 1 refuses untyped authority refs before evidence can be judged', () => {
  const request = buildQualityReadinessPublicSyntheticRequest();
  rowFor(request, 'SATISFIED').authority_bindings = [{
    authority_family: 'project_contract_baseline',
    evidence_ref: structuredClone(rowFor(request, 'SATISFIED').evidence_refs[0]),
  }];
  rejectsWith('QUALITY_READINESS_AUTHORITY_REFUSED', () => assess(request));
});

test('partial typed authority remains an authority HOLD instead of becoming satisfaction', () => {
  const request = buildQualityReadinessPublicSyntheticRequest();
  const row = rowFor(request, 'MISSING');
  row.authority_bindings.pop();
  const result = resultFor(assess(request), 'MISSING');
  assert.equal(result.state, 'gap_unknown');
  assert.equal(result.reason_code, 'authority_missing');
  assert.equal(result.authority_hold, true);
});

test('exact evidence refs cannot impersonate role, delegation, or decision authority', () => {
  const request = buildQualityReadinessPublicSyntheticRequest();
  const row = rowFor(request, 'SATISFIED');
  const evidence = structuredClone(row.evidence_refs[0]);
  row.authority_bindings[0].role_ref = structuredClone(evidence);
  row.authority_bindings[0].delegation_ref = structuredClone(evidence);
  row.authority_bindings[0].decision_ref = structuredClone(evidence);
  rejectsWith('QUALITY_READINESS_AUTHORITY_REFUSED', () => assess(request));
});

test('the five locked public-synthetic cases produce their specified deterministic gap states', () => {
  const result = assess();
  const expected = QUALITY_READINESS_PUBLIC_SYNTHETIC_FIXTURE.expected;

  assert.deepEqual(
    result.domain_result.results.map((entry) => entry.case_id),
    expected.ordered_case_ids,
  );
  for (const [caseId, state] of Object.entries(expected.states_by_case)) {
    assert.equal(resultFor(result, caseId).state, state, caseId);
  }
  assert.deepEqual(result.domain_result.counts, expected.counts);
  assert.deepEqual(result.receipt.counts, expected.counts);
  assert.equal(resultFor(result, 'AUTHORITY_HOLD').authority_hold, true);
  assert.equal(resultFor(result, 'CONFLICT').conflict.retained_claims.length, 2);
  assert.equal(resultFor(result, 'CONFLICT').conflict.governing_authority_family, 'project_contract_baseline');
  assert.equal(resultFor(result, 'CONFLICT').conflict.resolution_reason, 'highest applicable tier');
  for (const entry of result.domain_result.results) {
    assert.equal(entry.canon_claim_ceiling, 'source_supported');
    assert.ok(['source_sufficient', 'source_referenced', 'unknown', 'contradicted'].includes(entry.evidence_claim_ceiling));
  }
  assert.equal(result.assessment.canon_claim_ceiling, 'source_supported');
  assert.equal(result.domain_result.canon_claim_ceiling, 'source_supported');
});

test('the assessment never mutates its input and deeply freezes every output object', () => {
  const request = buildQualityReadinessPublicSyntheticRequest();
  const before = JSON.stringify(request);
  const result = assess(request);

  assert.equal(JSON.stringify(request), before);
  assertDeepFrozen(result);
});

test('stable rule/case ordering and counts do not vary when caller order changes', () => {
  const normal = assess();
  const reorderedRequest = buildQualityReadinessPublicSyntheticRequest();
  reorderedRequest.domain_input.rows.reverse();
  const reordered = assess(reorderedRequest);

  assert.deepEqual(reordered, normal);
});

test('only explicit sorted rule-stage-owner acceptance bindings may execute rows', () => {
  const unaccepted = buildQualityReadinessPublicSyntheticRequest();
  rowFor(unaccepted, 'SATISFIED').rule_id = 'QR-MIL-01';
  rejectsWith('QUALITY_READINESS_UNACCEPTED_RULE', () => assess(unaccepted));

  const unsorted = buildQualityReadinessPublicSyntheticRequest();
  unsorted.binding.accepted_rule_bindings.reverse();
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(unsorted));

  const duplicated = buildQualityReadinessPublicSyntheticRequest();
  duplicated.binding.accepted_rule_bindings.push(structuredClone(duplicated.binding.accepted_rule_bindings.at(-1)));
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(duplicated));

  const wrongStage = buildQualityReadinessPublicSyntheticRequest();
  rowFor(wrongStage, 'SATISFIED').stage_ref = structuredClone(
    wrongStage.binding.accepted_rule_bindings.find((binding) => binding.rule_id === 'QR-FAR-02').stage_ref,
  );
  rejectsWith('QUALITY_READINESS_INPUT_REFUSED', () => assess(wrongStage));

  const floatingAcceptance = buildQualityReadinessPublicSyntheticRequest();
  floatingAcceptance.binding.accepted_rule_bindings[0].owner_acceptance_ref.revision_id = 'latest';
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(floatingAcceptance));
});

test('floating, stale, and mismatched packet, ruleset, and module refs fail closed', () => {
  const floating = buildQualityReadinessPublicSyntheticRequest();
  delete floating.binding.source_packet_ref.revision_id;
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(floating));

  const stalePacket = buildQualityReadinessPublicSyntheticRequest();
  stalePacket.binding.source_packet_ref.content_id = `sha256:${'0'.repeat(64)}`;
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(stalePacket));

  const staleRuleset = buildQualityReadinessPublicSyntheticRequest();
  staleRuleset.binding.ruleset_ref.content_id = `sha256:${'f'.repeat(64)}`;
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(staleRuleset));

  const mismatchedModule = buildQualityReadinessPublicSyntheticRequest();
  mismatchedModule.binding.module_bindings[0].artifact_sha256 = '0'.repeat(64);
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(mismatchedModule));

  const floatingProject = buildQualityReadinessPublicSyntheticRequest();
  floatingProject.binding.project_binding_ref.revision_id = 'latest';
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(floatingProject));

  const floatingPolicy = buildQualityReadinessPublicSyntheticRequest();
  floatingPolicy.binding.policy_bundle_revision = '^1.2.0';
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(floatingPolicy));

  const floatingRulesetRef = buildQualityReadinessPublicSyntheticRequest();
  floatingRulesetRef.binding.ruleset_ref.revision_id = 'current';
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(floatingRulesetRef));

  const branchRevision = buildQualityReadinessPublicSyntheticRequest();
  branchRevision.binding.policy_bundle_revision = 'develop';
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(branchRevision));

  const rangeRevision = buildQualityReadinessPublicSyntheticRequest();
  rangeRevision.binding.policy_bundle_revision = '1.2.0-2.0.0';
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(rangeRevision));
});

test('source metadata/body and execution bindings are exact, distinct, and receipted', () => {
  const result = assess();
  assert.equal(result.receipt.bindings.source_bindings.length, 3);
  assert.equal(result.receipt.bindings.accepted_rule_bindings.length, 5);
  for (const field of ['engine_ref', 'objective_ref', 'policy_ref', 'snapshot_ref']) {
    assert.match(result.receipt.bindings[field].content_id, /^sha256:[a-f0-9]{64}$/);
  }

  const conflated = buildQualityReadinessPublicSyntheticRequest();
  conflated.binding.source_bindings[0].body_revision_ref = structuredClone(
    conflated.binding.source_bindings[0].metadata_revision_ref,
  );
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(conflated));

  const missingSource = buildQualityReadinessPublicSyntheticRequest();
  missingSource.binding.source_bindings.pop();
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(missingSource));

  const reusedSourceRefs = buildQualityReadinessPublicSyntheticRequest();
  for (const sourceBinding of reusedSourceRefs.binding.source_bindings.slice(1)) {
    sourceBinding.metadata_revision_ref = structuredClone(
      reusedSourceRefs.binding.source_bindings[0].metadata_revision_ref,
    );
    sourceBinding.body_revision_ref = structuredClone(
      reusedSourceRefs.binding.source_bindings[0].body_revision_ref,
    );
  }
  rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(reusedSourceRefs));
});

test('manifest nested values are typed and distinct valid manifests produce distinct receipts', () => {
  for (const hostileValue of [null, { explicit_null: true }]) {
    const hostile = buildQualityReadinessPublicSyntheticRequest();
    hostile.manifest.supported_project_classifications = [hostileValue];
    hostile.binding.module_bindings[0] = structuredClone(hostile.manifest);
    rejectsWith('QUALITY_READINESS_BINDING_REFUSED', () => assess(hostile));
  }

  const left = buildQualityReadinessPublicSyntheticRequest();
  const right = buildQualityReadinessPublicSyntheticRequest();
  right.manifest.supported_project_classifications = ['public_synthetic_v1'];
  right.binding.module_bindings[0] = structuredClone(right.manifest);
  const leftResult = assess(left);
  const rightResult = assess(right);
  assert.notEqual(leftResult.receipt.digests.input_sha256, rightResult.receipt.digests.input_sha256);
  assert.notEqual(leftResult.receipt.digests.binding_sha256, rightResult.receipt.digests.binding_sha256);
});

test('pre-release manifest factory rejects accessors without invoking them', () => {
  const input = manifestFactoryInput();
  let getterCalls = 0;
  Object.defineProperty(input, 'artifact_sha256', {
    enumerable: true,
    configurable: true,
    get() { getterCalls += 1; return '1'.repeat(64); },
  });
  assert.throws(() => createQualityReadinessModuleManifest(input));
  assert.equal(getterCalls, 0);
});

test('source modality and explicit null artifact tokens survive evaluation without synonym mapping', () => {
  const result = assess();
  for (const entry of result.domain_result.results) {
    assert.equal(typeof entry.source_modality, 'string');
    assert.ok(entry.source_modality.length > 0);
  }
  assert.equal(resultFor(result, 'UNKNOWN').artifact_token, null);
  assert.equal(resultFor(result, 'CONFLICT').artifact_token, null);
  assert.equal(resultFor(result, 'AUTHORITY_HOLD').artifact_token, null);

  for (const hostileToken of ['defect_action_report', 'wps', 'training_material']) {
    const hostile = buildQualityReadinessPublicSyntheticRequest();
    rowFor(hostile, 'UNKNOWN').artifact_token = hostileToken;
    rejectsWith('QUALITY_READINESS_VOCABULARY_REFUSED', () => assess(hostile));
  }
});

test('QR-MIL-02 requires approved selection, criteria, and an evaluated criteria-met result beyond presence', () => {
  for (const missingField of [
    'approved_evidence_selection_ref',
    'measurement_evaluation_criteria_ref',
  ]) {
    const request = buildQualityReadinessPublicSyntheticRequest();
    delete rowFor(request, 'SATISFIED')[missingField];
    const result = assess(request);
    const mil02 = resultFor(result, 'SATISFIED');
    assert.equal(mil02.state, 'gap_unknown', missingField);
    assert.equal(mil02.reason_code, 'sufficiency_facts_missing', missingField);
  }

  const missingEvaluation = buildQualityReadinessPublicSyntheticRequest();
  delete rowFor(missingEvaluation, 'SATISFIED').evaluation_result_ref;
  delete rowFor(missingEvaluation, 'SATISFIED').evaluation_result_state;
  assert.equal(resultFor(assess(missingEvaluation), 'SATISFIED').reason_code, 'evaluation_unknown');

  const failedEvaluation = buildQualityReadinessPublicSyntheticRequest();
  rowFor(failedEvaluation, 'SATISFIED').evaluation_result_state = 'criteria_not_met';
  assert.equal(resultFor(assess(failedEvaluation), 'SATISFIED').state, 'gap_conflict');

  const unknownEvaluation = buildQualityReadinessPublicSyntheticRequest();
  rowFor(unknownEvaluation, 'SATISFIED').evaluation_result_state = 'unknown';
  assert.equal(resultFor(assess(unknownEvaluation), 'SATISFIED').reason_code, 'evaluation_unknown');

  const sourceNativeEvidence = buildQualityReadinessPublicSyntheticRequest();
  rowFor(sourceNativeEvidence, 'SATISFIED').artifact_token = null;
  const sourceNativeResult = resultFor(assess(sourceNativeEvidence), 'SATISFIED');
  assert.equal(sourceNativeResult.state, 'satisfied');
  assert.equal(sourceNativeResult.artifact_token, null);
});

test('missing executable FAR path facts stay unknown and cannot become a missing finding', () => {
  const request = buildQualityReadinessPublicSyntheticRequest();
  delete rowFor(request, 'MISSING').context_refs.record_path_ref;
  const result = resultFor(assess(request), 'MISSING');
  assert.equal(result.state, 'gap_unknown');
  assert.equal(result.reason_code, 'context_facts_missing');
  assert.equal(result.authority_hold, false);
});

test('source conflict cannot bypass missing context or missing authority', () => {
  const missingContext = buildQualityReadinessPublicSyntheticRequest();
  rowFor(missingContext, 'CONFLICT').context_refs = {};
  rowFor(missingContext, 'CONFLICT').authority_bindings = [];
  const contextResult = resultFor(assess(missingContext), 'CONFLICT');
  assert.equal(contextResult.state, 'gap_unknown');
  assert.equal(contextResult.reason_code, 'context_facts_missing');
  assert.equal(contextResult.authority_hold, false);

  const missingAuthority = buildQualityReadinessPublicSyntheticRequest();
  rowFor(missingAuthority, 'CONFLICT').authority_bindings = [];
  const authorityResult = resultFor(assess(missingAuthority), 'CONFLICT');
  assert.equal(authorityResult.state, 'gap_unknown');
  assert.equal(authorityResult.reason_code, 'authority_missing');
  assert.equal(authorityResult.authority_hold, true);
});

test('complete explicit false yields domain-only not_applicable and unknown applicability stays a gap', () => {
  const missingBasis = buildQualityReadinessPublicSyntheticRequest();
  rowFor(missingBasis, 'SATISFIED').applicability.approval_scope = false;
  rejectsWith('QUALITY_READINESS_INPUT_REFUSED', () => assess(missingBasis));

  const notApplicable = buildQualityReadinessPublicSyntheticRequest();
  rowFor(notApplicable, 'SATISFIED').applicability.approval_scope = false;
  rowFor(notApplicable, 'SATISFIED').not_applicable_basis_ref = structuredClone(
    rowFor(notApplicable, 'SATISFIED').observation_attempt_ref,
  );
  const notApplicableResult = resultFor(assess(notApplicable), 'SATISFIED');
  assert.equal(notApplicableResult.state, 'not_applicable');
  assert.equal(notApplicableResult.authority_hold, false);

  const unknownApplicability = buildQualityReadinessPublicSyntheticRequest();
  rowFor(unknownApplicability, 'SATISFIED').applicability.approval_scope = 'unknown';
  rowFor(unknownApplicability, 'SATISFIED').context_refs = {};
  rowFor(unknownApplicability, 'SATISFIED').authority_bindings = [];
  const unknownResult = resultFor(assess(unknownApplicability), 'SATISFIED');
  assert.equal(unknownResult.state, 'gap_unknown');
  assert.equal(unknownResult.reason_code, 'applicability_unknown');
});

test('plain-data admission rejects accessors, custom prototypes, aliases, and prototype keys', () => {
  const accessor = buildQualityReadinessPublicSyntheticRequest();
  const first = accessor.domain_input.rows[0];
  let getterCalls = 0;
  Object.defineProperty(accessor.domain_input.rows, '0', {
    enumerable: true,
    configurable: true,
    get() { getterCalls += 1; return first; },
  });
  rejectsWith('QUALITY_READINESS_INPUT_REFUSED', () => assess(accessor));
  assert.equal(getterCalls, 0);

  const customArray = buildQualityReadinessPublicSyntheticRequest();
  Object.setPrototypeOf(customArray.domain_input.rows, Object.create(Array.prototype));
  rejectsWith('QUALITY_READINESS_INPUT_REFUSED', () => assess(customArray));

  const aliased = buildQualityReadinessPublicSyntheticRequest();
  aliased.binding.engine_ref = aliased.binding.objective_ref;
  rejectsWith('QUALITY_READINESS_INPUT_REFUSED', () => assess(aliased));

  const polluted = buildQualityReadinessPublicSyntheticRequest();
  Object.defineProperty(polluted.binding, '__proto__', {
    value: { smuggled_source_text: 'bounded-source-like-text' },
    enumerable: true,
  });
  rejectsWith('QUALITY_READINESS_INPUT_REFUSED', () => assess(polluted));

  const hidden = buildQualityReadinessPublicSyntheticRequest();
  Object.defineProperty(hidden, 'hidden', { value: 1, enumerable: false });
  rejectsWith('QUALITY_READINESS_INPUT_REFUSED', () => assess(hidden));

  const symbolKey = buildQualityReadinessPublicSyntheticRequest();
  symbolKey[Symbol('hidden')] = true;
  rejectsWith('QUALITY_READINESS_INPUT_REFUSED', () => assess(symbolKey));
});

test('the result and receipt carry no product authority fields and all effect counters are zero', () => {
  const result = assess();
  assertNoForbiddenFields(result);
  assert.deepEqual(Object.keys(result.receipt).sort(), [
    'bindings',
    'counts',
    'digests',
    'effects',
    'schema_version',
  ]);
  assert.deepEqual(result.receipt.effects, RESULT_EFFECTS);
  assert.equal(result.receipt.bindings.execution_mode, 'deterministic_only');
  for (const digest of Object.values(result.receipt.digests)) {
    assert.match(digest, /^[a-f0-9]{64}$/);
  }
});

test('the read-only runner writes no caller-directory files and emits stable JSON on stdout', () => {
  const runnerPath = fileURLToPath(new URL('../../../tools/quality_readiness_runner.mjs', import.meta.url));
  const sandbox = mkdtempSync(join(tmpdir(), 'quality-readiness-runner-'));
  try {
    const first = spawnSync(process.execPath, [runnerPath], {
      cwd: sandbox,
      encoding: 'utf8',
      timeout: 10_000,
    });
    const second = spawnSync(process.execPath, [runnerPath], {
      cwd: sandbox,
      encoding: 'utf8',
      timeout: 10_000,
    });

    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stderr, '');
    assert.equal(second.stderr, '');
    assert.equal(second.stdout, first.stdout);
    assert.deepEqual(JSON.parse(first.stdout), assess());
    assert.deepEqual(readdirSync(sandbox), []);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  CCI_ERROR_CODES,
  adaptConfigurationChangeImpactProjectEvidence,
  configurationChangeImpactAdapter,
} from '../evaluator/configuration_change_impact_evaluator_adapter.mjs';
import {
  CCI_COMPILER_ERROR_CODES,
  compileConfigurationChangeImpactRules,
  configurationChangeImpactCompilerAdapter,
} from '../compiler/configuration_change_impact_compiler_adapter.mjs';
import {
  CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS,
  CONFIGURATION_CHANGE_IMPACT_SOURCE_PACKET_REF,
} from '../rules/configuration_change_impact_rules.mjs';
import {
  buildConfigurationChangeImpactPublicSyntheticBindingInput,
  buildConfigurationChangeImpactPublicSyntheticProjectProfile,
  buildConfigurationChangeImpactPublicSyntheticRequest,
} from '../fixtures/configuration_change_impact_public_synthetic.mjs';
import { createConfigurationChangeImpactModuleManifest } from '../topology/configuration_change_impact_module_manifest.mjs';
import {
  assembleEffectiveRuleSet,
  evaluate,
  resolveProfileBindings,
} from '../../../core/interfaces/domain_engine_adapter.mjs';

const SOURCE_PACKET_SHA256 = 'c97908b8d6cb99cf164fb9fff7783a887f85c7748d04cf298ce2e396f54f16cd';

function expectCode(code, run) {
  assert.throws(run, (error) => error?.code === code, `expected ${code}`);
}

function makeEmptyProjectProfile() {
  return buildConfigurationChangeImpactPublicSyntheticProjectProfile();
}

function makeSyntheticTypedFacts(request) {
  return adaptConfigurationChangeImpactProjectEvidence(
    buildConfigurationChangeImpactPublicSyntheticBindingInput(request),
  );
}

function evaluateThroughCore(request) {
  const bindings = resolveProfileBindings(null, makeEmptyProjectProfile());
  const assembled = assembleEffectiveRuleSet(configurationChangeImpactAdapter, bindings, {
    compilation_scope: 'public_synthetic',
  });
  return evaluate(configurationChangeImpactAdapter, assembled, makeSyntheticTypedFacts(request), {}, {});
}

test('source packet bytes match the locked public-safe source reference', () => {
  const packetPath = fileURLToPath(new URL('../contracts/configuration_change_impact_source_packet_v0.md', import.meta.url));
  const actual = createHash('sha256').update(readFileSync(packetPath)).digest('hex');
  assert.equal(actual, SOURCE_PACKET_SHA256);
  assert.equal(CONFIGURATION_CHANGE_IMPACT_SOURCE_PACKET_REF.content_id, `sha256:${actual}`);
});

test('the fully propagated synthetic change is deterministic, closed, and source-supported only', () => {
  const request = buildConfigurationChangeImpactPublicSyntheticRequest();
  const before = JSON.stringify(request);
  const result = evaluateThroughCore(request);

  assert.equal(JSON.stringify(request), before);
  assert.equal(result.assessment.overall_state, 'evidence_ready_for_owner_review');
  assert.equal(result.assessment.change_state, 'closed');
  assert.equal(result.assessment.canon_claim_ceiling, 'source_supported');
  assert.deepEqual(result.domain_result.impact_results.map((row) => row.impact_kind), CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS);
  assert.deepEqual(
    result.domain_result.propagation_plan.map((row) => row.action),
    CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS.map(() => 'propagation_verified'),
  );
  assert.equal(result.domain_result.propagation_graph.complete, true);
  assert.deepEqual(
    result.domain_result.propagation_plan.find((row) => row.impact_kind === 'closure_evidence').item_paths[0].item_path_refs,
    CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS.map((kind) => `item:synthetic-${kind}`),
  );
  assert.deepEqual(result.domain_result.counts, {
    affected_verified: 9,
    affected_pending: 0,
    conflict: 0,
    not_affected: 0,
    unknown: 0,
    total: 9,
  });
  assert.deepEqual(result.receipt.effects, {
    file_reads: 0,
    file_writes: 0,
    network_calls: 0,
    model_calls: 0,
    approval_actions: 0,
    baseline_mutations: 0,
    task_creations: 0,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.domain_result.impact_results), true);
});

test('the adapter conforms to the existing Core profile, assembly, and evaluation seam without Core changes', () => {
  const request = buildConfigurationChangeImpactPublicSyntheticRequest();
  const bindings = resolveProfileBindings(null, makeEmptyProjectProfile());
  const assembled = assembleEffectiveRuleSet(configurationChangeImpactAdapter, bindings, {
    compilation_scope: 'public_synthetic',
  });
  const typedFacts = makeSyntheticTypedFacts(request);
  const throughCore = evaluate(configurationChangeImpactAdapter, assembled, typedFacts, {}, {});

  assert.equal(assembled.domain_engine_id, 'configuration_change_impact');
  assert.equal(assembled.compilation_trace.project_trace.profile_id, 'synthetic-configuration-change-profile');
  assert.equal(typedFacts.core_typed_project_facts.project_binding_ref.domain_engine_id, 'configuration_change_impact');
  assert.equal(typeof typedFacts.identity_digest, 'string');
  assert.deepEqual(throughCore, evaluateThroughCore(request));
});

test('unknown impact coverage remains a hold and cannot close the change', () => {
  const request = buildConfigurationChangeImpactPublicSyntheticRequest();
  const software = request.impact_records.find((row) => row.impact_kind === 'software');
  software.impact_state = 'unknown';
  software.impact_analysis_ref = null;
  software.affected_item_refs = [];
  software.propagation_evidence = [];
  software.verification_evidence = [];
  request.closure.state = 'open';
  request.closure.closure_evidence = [];

  const result = evaluateThroughCore(request);
  assert.equal(result.assessment.overall_state, 'hold');
  assert.equal(result.domain_result.counts.unknown, 1);
  assert.equal(result.domain_result.impact_results.find((row) => row.impact_kind === 'software').reason_code, 'reachable_impact_not_assessed');
  assert.equal(result.domain_result.propagation_plan.find((row) => row.impact_kind === 'software').action, 'complete_propagation_and_verification');
});

test('missing, duplicate, unsafe, and contradictory impact facts fail closed', () => {
  const missing = buildConfigurationChangeImpactPublicSyntheticRequest();
  missing.impact_records.pop();
  expectCode(CCI_ERROR_CODES.IMPACT_COVERAGE_REFUSED, () => evaluateThroughCore(missing));

  const duplicate = buildConfigurationChangeImpactPublicSyntheticRequest();
  duplicate.impact_records[1].impact_kind = duplicate.impact_records[0].impact_kind;
  expectCode(CCI_ERROR_CODES.IMPACT_COVERAGE_REFUSED, () => evaluateThroughCore(duplicate));

  const unsafe = buildConfigurationChangeImpactPublicSyntheticRequest();
  unsafe.change.change_request_ref = 'file:private-change-request';
  expectCode(CCI_ERROR_CODES.TYPED_FACTS_REFUSED, () => evaluateThroughCore(unsafe));

  const prematureClosure = buildConfigurationChangeImpactPublicSyntheticRequest();
  prematureClosure.impact_records[0].impact_state = 'affected_pending';
  prematureClosure.impact_records[0].verification_evidence = [];
  expectCode(CCI_ERROR_CODES.CLOSURE_REFUSED, () => evaluateThroughCore(prematureClosure));
});

test('the compiler preserves the base ruleset for empty bound profiles and rejects unsupported profile changes', () => {
  const base = compileConfigurationChangeImpactRules([]);
  const emptyProfile = makeEmptyProjectProfile();
  const bound = compileConfigurationChangeImpactRules([emptyProfile]);
  assert.deepEqual(bound.effective_rule_set.rules, base.effective_rule_set.rules);
  assert.equal(bound.profile_provenance.length, 1);

  const unsupported = makeEmptyProjectProfile();
  unsupported.operations = [{ op: 'add', rule: { rule_id: 'CCI-EXTRA-99' } }];
  expectCode(CCI_COMPILER_ERROR_CODES.PROFILE_OPERATION_UNSUPPORTED, () => compileConfigurationChangeImpactRules([unsupported]));
});

test('the package exports one consistent compiler and evaluator error vocabulary', () => {
  assert.equal(CCI_ERROR_CODES.PROFILE_BINDINGS_INVALID, CCI_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID);
  assert.equal(CCI_ERROR_CODES.EVALUATOR_REQUIRED, CCI_COMPILER_ERROR_CODES.EVALUATOR_REQUIRED);
  expectCode(CCI_ERROR_CODES.EVALUATOR_REQUIRED, () => configurationChangeImpactCompilerAdapter.evaluate());
});

test('the local manifest is bounded to the common Core contract', () => {
  const manifest = createConfigurationChangeImpactModuleManifest({
    module_version: '0.1.0',
    build_commit: 'e2acd5d899a1760bd528ffd12a9835c949df1d8e',
    artifact_sha256: '1'.repeat(64),
    engine_contract_abi_range: '>=1.0.0 <2.0.0',
    supported_project_classifications: ['public_synthetic'],
    dependency_versions: { engineering_kernel: '1.0.0' },
    configuration_hash: '2'.repeat(64),
    rollback_compatible_with: ['0.1.0'],
    test_receipt_ref: 'receipt:configuration-change-impact-focused-test-v0',
  });

  assert.equal(manifest.module_id, 'soulforge.engineering_engine.configuration_change_impact');
  assert.equal(manifest.execution_mode, 'deterministic_only');
  assert.equal(manifest.claim_ceiling, 'source_supported');
});

test('the local manifest refuses accessor and Proxy wrappers without executing them', () => {
  const valid = {
    module_version: '0.1.0',
    build_commit: 'e2acd5d899a1760bd528ffd12a9835c949df1d8e',
    artifact_sha256: '1'.repeat(64),
    engine_contract_abi_range: '>=1.0.0 <2.0.0',
    supported_project_classifications: ['public_synthetic'],
    dependency_versions: { engineering_kernel: '1.0.0' },
    configuration_hash: '2'.repeat(64),
    rollback_compatible_with: ['0.1.0'],
    test_receipt_ref: 'receipt:configuration-change-impact-focused-test-v0',
  };
  let getterCalls = 0;
  Object.defineProperty(valid, 'module_version', {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      return '0.1.0';
    },
  });

  expectCode('CCI_MANIFEST_INPUT_REFUSED', () => createConfigurationChangeImpactModuleManifest(valid));
  assert.equal(getterCalls, 0);
  expectCode('CCI_MANIFEST_INPUT_REFUSED', () => createConfigurationChangeImpactModuleManifest(new Proxy({
    module_version: '0.1.0',
    build_commit: 'e2acd5d899a1760bd528ffd12a9835c949df1d8e',
    artifact_sha256: '1'.repeat(64),
    engine_contract_abi_range: '>=1.0.0 <2.0.0',
    supported_project_classifications: ['public_synthetic'],
    dependency_versions: { engineering_kernel: '1.0.0' },
    configuration_hash: '2'.repeat(64),
    rollback_compatible_with: ['0.1.0'],
    test_receipt_ref: 'receipt:configuration-change-impact-focused-test-v0',
  }, {})));

  const nestedAccessor = {
    module_version: '0.1.0',
    build_commit: 'e2acd5d899a1760bd528ffd12a9835c949df1d8e',
    artifact_sha256: '1'.repeat(64),
    engine_contract_abi_range: '>=1.0.0 <2.0.0',
    supported_project_classifications: ['public_synthetic'],
    dependency_versions: {},
    configuration_hash: '2'.repeat(64),
    rollback_compatible_with: ['0.1.0'],
    test_receipt_ref: 'receipt:configuration-change-impact-focused-test-v0',
  };
  let nestedGetterCalls = 0;
  Object.defineProperty(nestedAccessor.dependency_versions, 'engineering_kernel', {
    enumerable: true,
    get() {
      nestedGetterCalls += 1;
      return '1.0.0';
    },
  });
  expectCode('CCI_MANIFEST_INPUT_REFUSED', () => createConfigurationChangeImpactModuleManifest(nestedAccessor));
  assert.equal(nestedGetterCalls, 0);

  const hiddenField = {
    module_version: '0.1.0',
    build_commit: 'e2acd5d899a1760bd528ffd12a9835c949df1d8e',
    artifact_sha256: '1'.repeat(64),
    engine_contract_abi_range: '>=1.0.0 <2.0.0',
    supported_project_classifications: ['public_synthetic'],
    dependency_versions: { engineering_kernel: '1.0.0' },
    configuration_hash: '2'.repeat(64),
    rollback_compatible_with: ['0.1.0'],
    test_receipt_ref: 'receipt:configuration-change-impact-focused-test-v0',
  };
  Object.defineProperty(hiddenField, 'hidden', { enumerable: false, value: 'nope' });
  expectCode('CCI_MANIFEST_INPUT_REFUSED', () => createConfigurationChangeImpactModuleManifest(hiddenField));

  const dangerousKey = {
    module_version: '0.1.0',
    build_commit: 'e2acd5d899a1760bd528ffd12a9835c949df1d8e',
    artifact_sha256: '1'.repeat(64),
    engine_contract_abi_range: '>=1.0.0 <2.0.0',
    supported_project_classifications: ['public_synthetic'],
    dependency_versions: { engineering_kernel: '1.0.0' },
    configuration_hash: '2'.repeat(64),
    rollback_compatible_with: ['0.1.0'],
    test_receipt_ref: 'receipt:configuration-change-impact-focused-test-v0',
  };
  Object.defineProperty(dangerousKey, '__proto__', { enumerable: true, value: 'ref:synthetic-dangerous-key' });
  expectCode('CCI_MANIFEST_INPUT_REFUSED', () => createConfigurationChangeImpactModuleManifest(dangerousKey));
});

test('the zero-write runner is stable and does not touch its caller directory', () => {
  const runnerPath = fileURLToPath(new URL('../tools/configuration_change_impact_runner.mjs', import.meta.url));
  const sandbox = mkdtempSync(join(tmpdir(), 'configuration-change-impact-runner-'));
  try {
    const first = spawnSync(process.execPath, [runnerPath], { cwd: sandbox, encoding: 'utf8', timeout: 10_000 });
    const second = spawnSync(process.execPath, [runnerPath], { cwd: sandbox, encoding: 'utf8', timeout: 10_000 });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stderr, '');
    assert.equal(second.stderr, '');
    assert.equal(first.stdout, second.stdout);
    assert.deepEqual(JSON.parse(first.stdout), evaluateThroughCore(buildConfigurationChangeImpactPublicSyntheticRequest()));
    assert.deepEqual(readdirSync(sandbox), []);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

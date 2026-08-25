import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerDomainEngineAdapter,
  loadDomainEngineAdapter,
  assembleEffectiveRuleSet,
  evaluate,
  resolveProfileBindings,
  adaptProjectEvidence,
} from '../interfaces/domain_engine_adapter.mjs';

import { systemsEngineeringCompilerAdapter } from '../../engines/systems_engineering/compiler/se_compiler_adapter.mjs';
import { systemsEngineeringAdapter } from '../../engines/systems_engineering/evaluator/se_evaluator_adapter.mjs';
import { qualityReadinessCompilerAdapter } from '../../engines/quality_readiness/compiler/quality_readiness_compiler_adapter.mjs';
import { qualityReadinessAdapter } from '../../engines/quality_readiness/evaluator/quality_readiness_evaluator_adapter.mjs';

test('Two-Domain Contract: Systems Engineering compiles, traces, and evaluates', () => {
  const adapter = loadDomainEngineAdapter('systems_engineering');
  const orgProfile = {
    profile_kind: 'organization',
    profile_id: 'org_synthetic_alpha',
    domain_engine_id: 'systems_engineering',
    revision_or_hash: 'rev_synthetic_alpha_01',
    extends_or_base_pin: 'generic_se_base:v0',
    source_refs: ['contracts/synthetic_alpha.json'],
    operations: [{ op: 'alias', token: 'SYSTEM_SPEC', alias: 'SYS_SPEC_SYNTHETIC_ALPHA' }],
    order: 0,
  };
  const bindings = resolveProfileBindings(orgProfile, null);
  const effective = assembleEffectiveRuleSet(adapter, bindings, { stage: '030_SRR' });
  assert.equal(effective.domain_engine_id, 'systems_engineering');
  assert.ok(effective.rule_count >= 1);
  assert.equal(effective.compilation_trace.organization_trace.profile_id, 'org_synthetic_alpha');
});

test('Two-Domain Contract: Quality Readiness compiles, traces, and evaluates', () => {
  const adapter = loadDomainEngineAdapter('quality_readiness');
  const orgProfile = {
    profile_kind: 'organization',
    profile_id: 'org_qr_01',
    domain_engine_id: 'quality_readiness',
    revision_or_hash: 'rev_qr_01',
    extends_or_base_pin: 'qr_base:v0',
    source_refs: ['contracts/qr.json'],
    operations: [{ op: 'add', rule_id: 'QR-ORG-01', requirement: 'Organization Quality Gate' }],
    order: 0,
  };
  const bindings = resolveProfileBindings(orgProfile, null);
  const effective = assembleEffectiveRuleSet(adapter, bindings, {});
  assert.equal(effective.domain_engine_id, 'quality_readiness');
  assert.equal(effective.compilation_trace.organization_trace.profile_id, 'org_qr_01');
});

test('Domain Adapter Registration: exact idempotent registration of identical object succeeds', () => {
  assert.doesNotThrow(() => {
    registerDomainEngineAdapter('systems_engineering', systemsEngineeringAdapter);
  });
  assert.doesNotThrow(() => {
    registerDomainEngineAdapter('quality_readiness', qualityReadinessAdapter);
  });
});

test('Domain Adapter Registration: different implementation object for registered domain fails with ADAPTER_CONFLICT', () => {
  const conflictingAdapter = {
    domain_engine_id: 'systems_engineering',
    revision: 'soulforge.systems_engineering.compiler.v0',
    compile: () => ({ effective_rule_set: {}, compilation_trace: {} }),
    evaluate: () => ({}),
  };
  assert.throws(
    () => registerDomainEngineAdapter('systems_engineering', conflictingAdapter),
    (err) => err.code === 'DOMAIN_ADAPTER_CONFLICT'
  );
});

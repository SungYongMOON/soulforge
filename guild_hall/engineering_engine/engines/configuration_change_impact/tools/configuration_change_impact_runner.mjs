#!/usr/bin/env node
// Public-synthetic, zero-write runner through the existing Core Project Binding and Typed Facts seam.
import {
  adaptConfigurationChangeImpactProjectEvidence,
  configurationChangeImpactAdapter,
} from '../evaluator/configuration_change_impact_evaluator_adapter.mjs';
import {
  buildConfigurationChangeImpactPublicSyntheticBindingInput,
  buildConfigurationChangeImpactPublicSyntheticProjectProfile,
  buildConfigurationChangeImpactPublicSyntheticRequest,
} from '../fixtures/configuration_change_impact_public_synthetic.mjs';
import {
  assembleEffectiveRuleSet,
  evaluate,
  resolveProfileBindings,
} from '../../../core/interfaces/domain_engine_adapter.mjs';

const request = buildConfigurationChangeImpactPublicSyntheticRequest();
const typedFacts = adaptConfigurationChangeImpactProjectEvidence(
  buildConfigurationChangeImpactPublicSyntheticBindingInput(request, 'public_synthetic'),
);
const bindings = resolveProfileBindings(null, buildConfigurationChangeImpactPublicSyntheticProjectProfile());
const effectiveRuleSet = assembleEffectiveRuleSet(configurationChangeImpactAdapter, bindings, {
  compilation_scope: 'public_synthetic',
});
const result = evaluate(configurationChangeImpactAdapter, effectiveRuleSet, typedFacts, {}, {});

process.stdout.write(`${JSON.stringify(result)}\n`);

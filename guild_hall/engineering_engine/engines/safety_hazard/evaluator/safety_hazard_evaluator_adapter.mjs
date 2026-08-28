// Registered Core adapter. All Core-call ingress reaches one deep package-local admission seam;
// no raw Safety request or permissive `{ request }` wrapper is accepted here.
import { registerDomainEngineAdapter } from '../../../core/interfaces/domain_engine_adapter.mjs';
import { safetyHazardCompilerAdapter } from '../compiler/safety_hazard_compiler_adapter.mjs';
import { assessSafetyHazard } from './safety_hazard.mjs';
import {
  admitSafetyHazardCoreEvaluation,
  calculateSafetyHazardAdmissionDigest,
} from './safety_hazard_project_facts_adapter.mjs';

export const SAFETY_HAZARD_EVALUATOR_ADAPTER_SCHEMA_VERSION = 'soulforge.safety_hazard.evaluator.v0';

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

export const safetyHazardAdapter = Object.freeze({
  ...safetyHazardCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts, authority, cutoffs) {
    const admitted = admitSafetyHazardCoreEvaluation({
      effective_rule_set: effectiveRuleSet,
      typed_project_facts: typedProjectFacts,
      authority,
      cutoffs,
    });
    const result = structuredClone(assessSafetyHazard(admitted.request));
    result.receipt.bindings.core_typed_facts = admitted.core_typed_facts;
    result.receipt.bindings.admitted_effective_ruleset = admitted.effective_ruleset;
    result.receipt.digests.core_admission_sha256 = calculateSafetyHazardAdmissionDigest(admitted);
    return deepFreeze(result);
  },
});

registerDomainEngineAdapter('safety_hazard', safetyHazardAdapter);

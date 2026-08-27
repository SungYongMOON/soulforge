// Reliability and Maintainability Domain Evaluator Adapter. The public seam accepts only
// admitted Core TypedProjectFacts and a deeply admitted effective base ruleset. Profile-added
// rules remain compiled-with-provenance but intentionally non-executable.
import { registerDomainEngineAdapter } from '../../../core/interfaces/domain_engine_adapter.mjs';
import { reliabilityMaintainabilityCompilerAdapter } from '../compiler/reliability_maintainability_compiler_adapter.mjs';
import {
  assessAdmittedReliabilityMaintainability,
  verifyReliabilityMaintainabilityResult,
} from './reliability_maintainability.mjs';
import {
  RM_ADMISSION_ERROR_CODES,
  admitReliabilityMaintainabilityEffectiveRuleSet,
  admitReliabilityMaintainabilityTypedFacts,
  validateEvaluatorAuthority,
  validateEvaluatorCutoffs,
} from './reliability_maintainability_admission.mjs';

export const RM_EVALUATOR_ADAPTER_SCHEMA_VERSION =
  'soulforge.reliability_maintainability.evaluator.v0';
export const RM_TYPED_FACTS_ERROR_CODES = RM_ADMISSION_ERROR_CODES;

export function verifyReliabilityMaintainabilityBaseRuleset(effectiveRuleSet) {
  return admitReliabilityMaintainabilityEffectiveRuleSet(effectiveRuleSet);
}

export { verifyReliabilityMaintainabilityResult };

export const reliabilityMaintainabilityAdapter = Object.freeze({
  ...reliabilityMaintainabilityCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts, authority, cutoffs) {
    validateEvaluatorAuthority(authority);
    const admittedEffectiveRuleSet = admitReliabilityMaintainabilityEffectiveRuleSet(effectiveRuleSet);
    const admittedTypedFacts = admitReliabilityMaintainabilityTypedFacts(typedProjectFacts);
    validateEvaluatorCutoffs(cutoffs, admittedTypedFacts.cutoffs.valid_at, admittedTypedFacts.cutoffs.known_at);
    const { project_facts_provenance, ...directRequest } = admittedTypedFacts;
    return assessAdmittedReliabilityMaintainability(directRequest, admittedEffectiveRuleSet, project_facts_provenance);
  },
});

registerDomainEngineAdapter('reliability_maintainability', reliabilityMaintainabilityAdapter);

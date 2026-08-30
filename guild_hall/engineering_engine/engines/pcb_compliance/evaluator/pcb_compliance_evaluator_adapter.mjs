// PCB Domain Evaluator Adapter for the existing Core Interface. Typed facts are admitted as one
// closed Core envelope; raw request shortcuts and hybrid shapes are intentionally refused.
// Fact admission lives in pcb_compliance_fact_admission.mjs (the shared leaf);
// this file only binds admission + evaluator into the registered adapter and
// re-exports the admission API for existing import sites.
import { registerDomainEngineAdapter } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { pcbComplianceCompilerAdapter } from "../compiler/pcb_compliance_compiler_adapter.mjs";
import { assessPcbCompliance, verifyPcbComplianceResult } from "./pcb_compliance.mjs";
import {
  PCB_TYPED_FACTS_ERROR_CODE,
  admitPcbCoreTypedFacts,
  calculatePcbCoreTypedFactsDigest,
  validateEvaluatorAuthority,
  validateEvaluatorCutoffs,
} from "./pcb_compliance_fact_admission.mjs";

export const PCB_EVALUATOR_ADAPTER_SCHEMA_VERSION = "soulforge.pcb_compliance.evaluator.v0";
export { PCB_TYPED_FACTS_ERROR_CODE, admitPcbCoreTypedFacts, calculatePcbCoreTypedFactsDigest };
export { verifyPcbComplianceResult };

export const pcbComplianceAdapter = Object.freeze({
  ...pcbComplianceCompilerAdapter,
  revision: PCB_EVALUATOR_ADAPTER_SCHEMA_VERSION,
  evaluate(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
    validateEvaluatorAuthority(authority);
    const admittedFacts = admitPcbCoreTypedFacts(typedProjectFacts);
    validateEvaluatorCutoffs(cutoffs, admittedFacts.provenance);
    return assessPcbCompliance(admittedFacts.request, effectiveRuleSet, admittedFacts.provenance);
  },
});

registerDomainEngineAdapter("pcb_compliance", pcbComplianceAdapter);

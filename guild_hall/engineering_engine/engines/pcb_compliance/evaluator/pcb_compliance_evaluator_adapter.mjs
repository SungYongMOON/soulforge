// PCB Domain Evaluator Adapter for the existing Core Interface.
import { ContractError } from "../../../core/validators/errors.mjs";
import { registerDomainEngineAdapter } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { pcbComplianceCompilerAdapter } from "../compiler/pcb_compliance_compiler_adapter.mjs";
import { assessPcbCompliance, validatePcbEffectiveRuleSet } from "./pcb_compliance.mjs";

export const PCB_EVALUATOR_ADAPTER_SCHEMA_VERSION = "soulforge.pcb_compliance.evaluator.v0";

function requestFromTypedFacts(typedProjectFacts) {
  if (typedProjectFacts?.request) return typedProjectFacts.request;
  const facts = typedProjectFacts?.facts;
  if (!Array.isArray(facts)) {
    throw new ContractError("PCB_TYPED_FACTS_INVALID", "PCB evaluator requires typed facts with a PCB evaluation request");
  }
  const candidates = facts.filter((fact) => fact?.fact_type === "pcb_compliance_evaluation_request");
  if (candidates.length !== 1 || !candidates[0].request) {
    throw new ContractError("PCB_TYPED_FACTS_INVALID", "typed facts must contain exactly one pcb_compliance_evaluation_request");
  }
  return candidates[0].request;
}

export const pcbComplianceAdapter = Object.freeze({
  ...pcbComplianceCompilerAdapter,
  revision: PCB_EVALUATOR_ADAPTER_SCHEMA_VERSION,
  evaluate(effectiveRuleSet, typedProjectFacts) {
    const effective = validatePcbEffectiveRuleSet(effectiveRuleSet);
    return assessPcbCompliance(requestFromTypedFacts(typedProjectFacts), effective);
  },
});

registerDomainEngineAdapter("pcb_compliance", pcbComplianceAdapter);

import { registerDomainEngineAdapter } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { interfaceConsistencyCompilerAdapter } from "../compiler/interface_consistency_compiler_adapter.mjs";
import { evaluateInterfaceConsistency } from "./interface_consistency.mjs";

export const interfaceConsistencyAdapter = Object.freeze({
  ...interfaceConsistencyCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
    return evaluateInterfaceConsistency(effectiveRuleSet, typedProjectFacts, authority, cutoffs);
  },
});

registerDomainEngineAdapter("interface_consistency", interfaceConsistencyAdapter);

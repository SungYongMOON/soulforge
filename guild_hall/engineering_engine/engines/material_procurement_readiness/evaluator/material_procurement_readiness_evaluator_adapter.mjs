// E03 Core adapter registration. The adapter is deterministic-only: it rejects non-empty
// authority, requires exact cutoffs, and carries admitted Project Binding lineage without action.
import { registerDomainEngineAdapter } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { materialProcurementReadinessCompilerAdapter } from "../compiler/material_procurement_readiness_compiler_adapter.mjs";
import {
  evaluateMaterialProcurementReadiness,
  MPR_ERROR_CODES,
} from "./material_procurement_readiness.mjs";

export { MPR_ERROR_CODES };
export const MPR_EVALUATOR_ADAPTER_SCHEMA_VERSION = "soulforge.material_procurement_readiness.evaluator.v1";

export const materialProcurementReadinessAdapter = Object.freeze({
  ...materialProcurementReadinessCompilerAdapter,
  revision: MPR_EVALUATOR_ADAPTER_SCHEMA_VERSION,
  evaluate(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
    return evaluateMaterialProcurementReadiness(effectiveRuleSet, typedProjectFacts, authority, cutoffs);
  },
});

registerDomainEngineAdapter("material_procurement_readiness", materialProcurementReadinessAdapter);

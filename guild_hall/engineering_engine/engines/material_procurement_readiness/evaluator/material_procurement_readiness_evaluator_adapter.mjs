// E03 Core adapter registration. The adapter is deterministic-only and intentionally ignores
// authority/cutoff objects because it cannot create procurement or inventory authority.
import { registerDomainEngineAdapter } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { materialProcurementReadinessCompilerAdapter } from "../compiler/material_procurement_readiness_compiler_adapter.mjs";
import {
  evaluateMaterialProcurementReadiness,
  MPR_ERROR_CODES,
} from "./material_procurement_readiness.mjs";

export { MPR_ERROR_CODES };
export const MPR_EVALUATOR_ADAPTER_SCHEMA_VERSION = "soulforge.material_procurement_readiness.evaluator.v0";

export const materialProcurementReadinessAdapter = Object.freeze({
  ...materialProcurementReadinessCompilerAdapter,
  revision: MPR_EVALUATOR_ADAPTER_SCHEMA_VERSION,
  evaluate(effectiveRuleSet, typedProjectFacts) {
    return evaluateMaterialProcurementReadiness(effectiveRuleSet, typedProjectFacts);
  },
});

registerDomainEngineAdapter("material_procurement_readiness", materialProcurementReadinessAdapter);

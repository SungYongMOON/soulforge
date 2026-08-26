import { registerDomainEngineAdapter } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { bomSupplyChainRiskCompilerAdapter } from "../compiler/bom_supply_chain_risk_compiler_adapter.mjs";
import { evaluateBomSupplyChainRisk } from "./bom_supply_chain_risk.mjs";

export const BOM_SCR_EVALUATOR_ADAPTER_SCHEMA_VERSION = "soulforge.bom_supply_chain_risk.evaluator.v0";

export const bomSupplyChainRiskAdapter = Object.freeze({
  ...bomSupplyChainRiskCompilerAdapter,
  revision: "soulforge.bom_supply_chain_risk.adapter.v0",
  evaluate(effectiveRuleSet, typedProjectFacts) {
    return evaluateBomSupplyChainRisk(effectiveRuleSet, typedProjectFacts);
  },
});

registerDomainEngineAdapter("bom_supply_chain_risk", bomSupplyChainRiskAdapter);

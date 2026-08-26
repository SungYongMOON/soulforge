#!/usr/bin/env node
// Zero-write public-synthetic runner. It reads no file and performs no network,
// model, ERP, procurement, or authority action; it writes deterministic JSON only to stdout.
import {
  assembleEffectiveRuleSet,
  evaluate,
  resolveProfileBindings,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { bomSupplyChainRiskAdapter } from "../evaluator/bom_supply_chain_risk_evaluator_adapter.mjs";
import {
  buildBomSupplyChainRiskPublicSyntheticProfile,
  buildBomSupplyChainRiskPublicSyntheticTypedFacts,
} from "../fixtures/bom_supply_chain_risk_public_synthetic.mjs";

const [profile] = resolveProfileBindings(buildBomSupplyChainRiskPublicSyntheticProfile(), null);
const ruleSet = assembleEffectiveRuleSet(bomSupplyChainRiskAdapter, [profile], {});
const result = evaluate(bomSupplyChainRiskAdapter, ruleSet, buildBomSupplyChainRiskPublicSyntheticTypedFacts(), {}, {});
process.stdout.write(`${JSON.stringify(result)}\n`);

// Quality Readiness Domain Evaluator Adapter
import { assessQualityReadiness } from "./quality_readiness.mjs";
import { registerDomainEngineAdapter } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { qualityReadinessCompilerAdapter } from "../compiler/quality_readiness_compiler_adapter.mjs";

export const QR_EVALUATOR_ADAPTER_SCHEMA_VERSION = "soulforge.quality_readiness.evaluator.v0";

export const qualityReadinessAdapter = Object.freeze({
  ...qualityReadinessCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
    const request = typedProjectFacts.request || typedProjectFacts;
    return assessQualityReadiness(request);
  },
});

registerDomainEngineAdapter("quality_readiness", qualityReadinessAdapter);

// Quality Readiness Domain Compiler Adapter
import {
  QUALITY_READINESS_RULES,
  QUALITY_READINESS_RULESET_REF,
  QUALITY_READINESS_SOURCE_PACKET_REF,
  QUALITY_READINESS_RULESET_SCHEMA,
} from "../rules/quality_readiness_rules.mjs";

export const QR_COMPILER_ADAPTER_SCHEMA_VERSION = "soulforge.quality_readiness.compiler.v0";

export const qualityReadinessCompilerAdapter = Object.freeze({
  domain_engine_id: "quality_readiness",
  revision: "soulforge.quality_readiness.compiler.v0",

  compile(profileBindings = [], options = {}) {
    const rules = [...QUALITY_READINESS_RULES];
    return {
      effective_rule_set: {
        schema_version: QUALITY_READINESS_RULESET_SCHEMA,
        ruleset_ref: QUALITY_READINESS_RULESET_REF,
        source_packet_ref: QUALITY_READINESS_SOURCE_PACKET_REF,
        rules,
      },
      rule_count: rules.length,
    };
  },

  evaluate(effectiveRuleSet, typedProjectFacts, authority, cutoffs) {
    return { assessment: {}, domain_result: {}, receipt: {} };
  },
});

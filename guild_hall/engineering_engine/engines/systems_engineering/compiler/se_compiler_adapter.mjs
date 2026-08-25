// Systems Engineering Domain Compiler Adapter
import { compileStageRules, mintEnginePolicyRef } from "../rules/stage_rule_compiler.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";

export const SE_COMPILER_ADAPTER_SCHEMA_VERSION = "soulforge.systems_engineering.compiler.v0";

export const systemsEngineeringCompilerAdapter = Object.freeze({
  domain_engine_id: "systems_engineering",
  revision: "soulforge.systems_engineering.compiler.v0",

  compile(profileBindings = [], options = {}) {
    if (options.compiled_variant) {
      const overlay = options.overlay || {
        schema_version: "soulforge.se_stage_rule_overlay.v0",
        extends: {
          support_key: options.compiled_variant.support_key,
          spec_sha256: options.compiled_variant.spec_sha256,
        },
        ops: profileBindings.flatMap((p) => p.operations || []),
      };
      const result = compileStageRules({
        compiled_variant: options.compiled_variant,
        overlay,
        project_binding: options.project_binding,
        target_stage_codes: options.target_stage_codes,
        overlay_conditions: options.overlay_conditions,
      });
      return {
        effective_rule_set: result.engine_stage_policy_material,
        expected_artifact_policy: result.expected_artifact_policy,
        stage_mapping_table: result.stage_mapping_table,
        receipt: result.receipt,
        rule_count: result.engine_stage_policy_material?.stages?.length || 0,
      };
    }

    const allOps = profileBindings.flatMap((p) => p.operations || []);
    return {
      effective_rule_set: {
        schema_version: "soulforge.ax_se_stage_policy.v0",
        stages: options.stages || [],
        operations: allOps,
      },
      rule_count: options.stages?.length || allOps.length,
    };
  },

  evaluate(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
    throw new ContractError(
      "SE_EVALUATION_EVALUATOR_REQUIRED",
      "Systems engineering evaluation must be performed via systemsEngineeringAdapter with bound evaluation interface"
    );
  },
});

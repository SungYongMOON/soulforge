// Systems Engineering Domain Evaluator Adapter
import { assessAxSeProject } from "./ax_se_project_assessment.mjs";
import { assessAxSeRoleBoundProject } from "./ax_se_project_role_bound_assessment.mjs";
import { registerDomainEngineAdapter } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { systemsEngineeringCompilerAdapter } from "../compiler/se_compiler_adapter.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";

export const SE_EVALUATOR_ADAPTER_SCHEMA_VERSION = "soulforge.systems_engineering.evaluator.v0";

export const systemsEngineeringAdapter = Object.freeze({
  ...systemsEngineeringCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
    if (typedProjectFacts?.role_bound_packet && typedProjectFacts?.expected_role_roster_ref) {
      return assessAxSeRoleBoundProject(
        typedProjectFacts.role_bound_packet,
        typedProjectFacts.expected_role_roster_ref
      );
    }
    if (typedProjectFacts?.assessment_input || typedProjectFacts?.context_carrier) {
      return assessAxSeProject(
        typedProjectFacts.assessment_input || typedProjectFacts
      );
    }
    throw new ContractError(
      "SE_EVALUATION_INPUT_REQUIRED",
      "Systems engineering evaluation requires typed project facts with assessment_input or role_bound_packet"
    );
  },
});

registerDomainEngineAdapter("systems_engineering", systemsEngineeringAdapter);

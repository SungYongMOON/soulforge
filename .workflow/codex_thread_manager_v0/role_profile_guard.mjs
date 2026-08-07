#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const POLICY_REF =
  "docs/architecture/guild_hall/AI_ORGANIZATION_MODEL_OPERATING_POLICY_V0.md";

const exact = (model, reasoningEffort, fresh = false) => ({
  allowedModels: [model],
  allowedReasoningEfforts: [reasoningEffort],
  fresh,
});

export const ROLE_PROFILES = Object.freeze({
  development1_company_ceo: exact("gpt-5.6-sol", "xhigh"),
  ai_platform_company_ceo: exact("gpt-5.6-sol", "xhigh"),
  ax_ceo: exact("gpt-5.6-sol", "xhigh"),
  erp_ceo: exact("gpt-5.6-sol", "xhigh"),
  system_responsibility: exact("gpt-5.6-sol", "xhigh"),
  development1_operations_manager: exact("gpt-5.6-sol", "high"),
  project_manager: exact("gpt-5.6-sol", "xhigh"),
  technical_direction_acceptance_responsibility: exact("gpt-5.6-sol", "high"),
  operations_control_responsibility: {
    allowedModels: ["gpt-5.6-terra"],
    allowedReasoningEfforts: ["high", "xhigh"],
    exactReasoningSelectionRequired: true,
    fresh: false,
  },
  deliverable_task: exact("gpt-5.6-terra", "max"),
  operations_status_task: exact("gpt-5.6-terra", "high"),
  simple_collection_formatting: exact("gpt-5.6-luna", "medium"),
  independent_technical_review: exact("gpt-5.6-sol", "high", true),
  independent_operations_review: exact("gpt-5.6-terra", "xhigh", true),
  major_gate_review: {
    allowedModels: ["gpt-5.6-sol", "gpt-5.6-terra"],
    allowedReasoningEfforts: ["ultra"],
    explicitModelRequired: true,
    ultraAuthorizationRequired: true,
    fresh: true,
  },
});

const asText = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const asObservedText = (value) => {
  const text = asText(value);
  return text === "UNKNOWN" ? null : text;
};

export function evaluateRoleProfileBinding(input = {}) {
  const errors = [];
  const profileClass = asText(input.profileClass);
  const rule = profileClass ? ROLE_PROFILES[profileClass] : null;

  if (!profileClass) errors.push("profile_class_missing");
  else if (!rule) errors.push("profile_class_unknown");

  let requestedModel = asText(input.requestedModel);
  let requestedReasoningEffort = asText(input.requestedReasoningEffort);

  if (rule) {
    if (!requestedModel && rule.allowedModels.length === 1 && !rule.explicitModelRequired) {
      [requestedModel] = rule.allowedModels;
    }
    if (
      !requestedReasoningEffort &&
      rule.allowedReasoningEfforts.length === 1 &&
      !rule.exactReasoningSelectionRequired
    ) {
      [requestedReasoningEffort] = rule.allowedReasoningEfforts;
    }
    if (!requestedModel) errors.push("requested_model_missing");
    else if (!rule.allowedModels.includes(requestedModel)) {
      errors.push("requested_model_not_allowed_for_profile_class");
    }
    if (!requestedReasoningEffort) {
      errors.push("requested_reasoning_effort_missing_or_range_unresolved");
    } else if (!rule.allowedReasoningEfforts.includes(requestedReasoningEffort)) {
      errors.push("requested_reasoning_effort_not_allowed_for_profile_class");
    }
  }

  const ultraAuthorization = asText(input.ultraGateAuthorization);
  if (requestedReasoningEffort === "ultra") {
    if (profileClass !== "major_gate_review") {
      errors.push("ultra_forbidden_outside_major_gate_review");
    }
    if (!ultraAuthorization) errors.push("ultra_gate_authorization_missing");
  } else if (ultraAuthorization) {
    errors.push("ultra_gate_authorization_on_non_ultra_profile");
  }

  const fallbackDecision = asText(input.fallbackDecision) ?? "none";
  if (fallbackDecision !== "none") {
    errors.push("profile_fallback_forbidden");
  }

  const operation = asText(input.operation) ?? "create";
  if (!new Set(["create", "fork"]).has(operation)) {
    errors.push("unsupported_thread_operation");
  }

  if (operation === "create") {
    const createModel = asText(input.createModel);
    const createThinking = asText(input.createThinking);
    if (!createModel) errors.push("create_thread_model_missing");
    else if (requestedModel && createModel !== requestedModel) {
      errors.push("create_thread_model_mismatch");
    }
    if (!createThinking) errors.push("create_thread_thinking_missing");
    else if (requestedReasoningEffort && createThinking !== requestedReasoningEffort) {
      errors.push("create_thread_thinking_mismatch");
    }
  }

  if (operation === "fork") {
    const sourceProfileClass = asText(input.sourceProfileClass);
    const sourceModel = asText(input.sourceModel);
    const sourceThinking = asText(input.sourceThinking);
    if (!sourceProfileClass || sourceProfileClass !== profileClass) {
      errors.push("fork_role_or_profile_class_change_forbidden");
    }
    if (!sourceModel || sourceModel !== requestedModel) {
      errors.push("fork_source_model_unknown_or_mismatch");
    }
    if (!sourceThinking || sourceThinking !== requestedReasoningEffort) {
      errors.push("fork_source_thinking_unknown_or_mismatch");
    }
    if (rule?.fresh) errors.push("fork_fresh_context_profile_forbidden");
  }

  const observedModel = asObservedText(input.observedModel);
  const observedReasoningEffort = asObservedText(input.observedReasoningEffort);
  let profileMismatchState = "UNKNOWN";
  const observedModelMismatch =
    observedModel && requestedModel && observedModel !== requestedModel;
  const observedReasoningMismatch =
    observedReasoningEffort &&
    requestedReasoningEffort &&
    observedReasoningEffort !== requestedReasoningEffort;
  if (observedModelMismatch || observedReasoningMismatch) {
    profileMismatchState = "profile_mismatch";
    errors.push("observed_profile_mismatch");
  } else if (observedModel && observedReasoningEffort) {
    profileMismatchState = "MATCH";
  }

  return {
    status: errors.length === 0 ? "PASS" : "HOLD",
    profile_source_ref: POLICY_REF,
    profile_class: profileClass,
    requested_model: requestedModel,
    requested_reasoning_effort: requestedReasoningEffort,
    fresh_context_required: rule?.fresh ?? null,
    fallback_decision: fallbackDecision,
    ultra_gate_authorization: ultraAuthorization,
    operation,
    observed_model: observedModel ?? "UNKNOWN",
    observed_reasoning_effort: observedReasoningEffort ?? "UNKNOWN",
    profile_mismatch_state: profileMismatchState,
    errors,
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected_argument:${token}`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing_value:${token}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = evaluateRoleProfileBinding(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== "PASS") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

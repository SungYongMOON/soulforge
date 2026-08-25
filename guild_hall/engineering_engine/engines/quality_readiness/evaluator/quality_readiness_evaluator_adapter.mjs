// Quality Readiness Domain Evaluator Adapter
import types from "node:util/types";
import { assessQualityReadiness } from "./quality_readiness.mjs";
import { registerDomainEngineAdapter } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { qualityReadinessCompilerAdapter } from "../compiler/quality_readiness_compiler_adapter.mjs";
import {
  QUALITY_READINESS_RULES,
  QUALITY_READINESS_RULESET_REF,
  QUALITY_READINESS_SOURCE_PACKET_REF,
  QUALITY_READINESS_RULESET_SCHEMA,
} from "../rules/quality_readiness_rules.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { compareCodePoints } from "../../../core/validators/canonical.mjs";

export const QR_EVALUATOR_ADAPTER_SCHEMA_VERSION = "soulforge.quality_readiness.evaluator.v0";

const ALLOWED_EFFECTIVE_RULESET_KEYS = Object.freeze([
  "domain_engine_id",
  "effective_rule_set",
  "profile_rule_provenance",
  "rules",
  "ruleset_ref",
  "schema_version",
  "source_packet_ref",
]);

const CANONICAL_QR_RULE_FIELDS = Object.freeze([
  "allowed_artifact_tokens",
  "context_ref_fields",
  "required_authority_families",
  "rule_id",
  "source_locator",
  "source_modality",
  "source_ref",
  "sufficiency_fields",
]);

function assertPlainObjectNoAccessor(obj, label = "object") {
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || (types && types.isProxy(obj))) {
    throw new ContractError("QR_EFFECTIVE_RULESET_INVALID", `${label} must be a plain object, proxies and non-objects rejected`);
  }
  if (Object.getPrototypeOf(obj) !== Object.prototype) {
    throw new ContractError("QR_EFFECTIVE_RULESET_INVALID", `${label} must have standard Object.prototype`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(obj);
  for (const [k, d] of Object.entries(descriptors)) {
    if (k === "__proto__" || k === "prototype" || k === "constructor") {
      throw new ContractError("QR_EFFECTIVE_RULESET_INVALID", `prototype-sensitive key in ${label}`);
    }
    if (!d || !Object.hasOwn(d, "value") || d.enumerable !== true) {
      throw new ContractError("QR_EFFECTIVE_RULESET_INVALID", `accessor-backed or non-enumerable property in ${label}`);
    }
  }
}

function verifyBaseRulesetStrict(effectiveRuleSet) {
  if (!effectiveRuleSet || typeof effectiveRuleSet !== "object") {
    throw new ContractError("QR_EFFECTIVE_RULESET_INVALID", "effectiveRuleSet must be a non-null object");
  }
  assertPlainObjectNoAccessor(effectiveRuleSet, "effectiveRuleSet");

  const unwrapped = effectiveRuleSet.effective_rule_set || effectiveRuleSet;
  assertPlainObjectNoAccessor(unwrapped, "unwrapped rule set");

  // Verify no unexpected extra fields on unwrapped rule set
  for (const k of Object.keys(unwrapped)) {
    if (!ALLOWED_EFFECTIVE_RULESET_KEYS.includes(k)) {
      throw new ContractError("QR_EFFECTIVE_RULESET_INVALID", "unexpected extra key in effective rule set");
    }
  }

  // 1. Schema version
  if (unwrapped.schema_version !== QUALITY_READINESS_RULESET_SCHEMA) {
    throw new ContractError(
      "QR_EFFECTIVE_RULESET_INVALID",
      `schema_version must be "${QUALITY_READINESS_RULESET_SCHEMA}", got "${unwrapped.schema_version}"`
    );
  }

  // 2. Ruleset ref
  const rulesetRef = unwrapped.ruleset_ref;
  if (!rulesetRef || typeof rulesetRef !== "object") {
    throw new ContractError("QR_EFFECTIVE_RULESET_INVALID", "ruleset_ref must be an object");
  }
  assertPlainObjectNoAccessor(rulesetRef, "ruleset_ref");

  if (
    rulesetRef.entity_id !== QUALITY_READINESS_RULESET_REF.entity_id ||
    rulesetRef.revision_id !== QUALITY_READINESS_RULESET_REF.revision_id ||
    rulesetRef.content_id !== QUALITY_READINESS_RULESET_REF.content_id ||
    rulesetRef.content_hash_alg !== QUALITY_READINESS_RULESET_REF.content_hash_alg
  ) {
    throw new ContractError(
      "QR_PROFILE_EVALUATION_UNSUPPORTED",
      "Quality Readiness E01 evaluator is bound to base ruleset only; evaluating derived profile rulesets is not supported in E01"
    );
  }

  // 3. F5: Source packet ref is strictly required
  const sp = unwrapped.source_packet_ref;
  if (!sp || typeof sp !== "object") {
    throw new ContractError("QR_EFFECTIVE_RULESET_INVALID", "source_packet_ref is required");
  }
  assertPlainObjectNoAccessor(sp, "source_packet_ref");
  if (
    sp.entity_id !== QUALITY_READINESS_SOURCE_PACKET_REF.entity_id ||
    sp.revision_id !== QUALITY_READINESS_SOURCE_PACKET_REF.revision_id ||
    sp.content_id !== QUALITY_READINESS_SOURCE_PACKET_REF.content_id ||
    sp.content_hash_alg !== QUALITY_READINESS_SOURCE_PACKET_REF.content_hash_alg
  ) {
    throw new ContractError(
      "QR_PROFILE_EVALUATION_UNSUPPORTED",
      "mismatched source_packet_ref in effective rule set"
    );
  }

  // 4. Profile rule provenance must be empty or missing
  const prov = unwrapped.profile_rule_provenance || effectiveRuleSet.profile_rule_provenance;
  if (prov && typeof prov === "object" && Object.keys(prov).length > 0) {
    throw new ContractError(
      "QR_PROFILE_EVALUATION_UNSUPPORTED",
      "Quality Readiness E01 evaluator is bound to base ruleset only; evaluating derived profile rulesets is not supported in E01"
    );
  }

  // 5. Rules array exact verification
  const rules = unwrapped.rules;
  if (!Array.isArray(rules)) {
    throw new ContractError("QR_EFFECTIVE_RULESET_INVALID", "rules must be an array");
  }
  if (rules.length !== QUALITY_READINESS_RULES.length) {
    throw new ContractError(
      "QR_PROFILE_EVALUATION_UNSUPPORTED",
      `rule count mismatch: expected ${QUALITY_READINESS_RULES.length} base rules, got ${rules.length}`
    );
  }

  const expectedRuleKeys = [...CANONICAL_QR_RULE_FIELDS].sort(compareCodePoints);

  for (let i = 0; i < QUALITY_READINESS_RULES.length; i += 1) {
    const r = rules[i];
    const base = QUALITY_READINESS_RULES[i];
    assertPlainObjectNoAccessor(r, `rules[${i}]`);

    // F4: Exact 8-key closure on each rule row
    const rKeys = Object.keys(r).sort(compareCodePoints);
    if (rKeys.length !== expectedRuleKeys.length || !rKeys.every((k, idx) => k === expectedRuleKeys[idx])) {
      throw new ContractError(
        "QR_EFFECTIVE_RULESET_INVALID",
        `rule row must contain exactly the 8 canonical fields, got [${rKeys.join(", ")}]`
      );
    }

    if (
      r.rule_id !== base.rule_id ||
      r.source_ref !== base.source_ref ||
      r.source_locator !== base.source_locator ||
      r.source_modality !== base.source_modality ||
      !Array.isArray(r.allowed_artifact_tokens) ||
      r.allowed_artifact_tokens.length !== base.allowed_artifact_tokens.length ||
      !r.allowed_artifact_tokens.every((v, j) => v === base.allowed_artifact_tokens[j]) ||
      !Array.isArray(r.required_authority_families) ||
      r.required_authority_families.length !== base.required_authority_families.length ||
      !r.required_authority_families.every((v, j) => v === base.required_authority_families[j]) ||
      !Array.isArray(r.context_ref_fields) ||
      r.context_ref_fields.length !== base.context_ref_fields.length ||
      !r.context_ref_fields.every((v, j) => v === base.context_ref_fields[j]) ||
      !Array.isArray(r.sufficiency_fields) ||
      r.sufficiency_fields.length !== base.sufficiency_fields.length ||
      !r.sufficiency_fields.every((v, j) => v === base.sufficiency_fields[j])
    ) {
      throw new ContractError(
        "QR_PROFILE_EVALUATION_UNSUPPORTED",
        `rule mismatch at index ${i}`
      );
    }
  }
}

export const qualityReadinessAdapter = Object.freeze({
  ...qualityReadinessCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
    verifyBaseRulesetStrict(effectiveRuleSet);
    const request = typedProjectFacts?.request || typedProjectFacts;
    return assessQualityReadiness(request);
  },
});

registerDomainEngineAdapter("quality_readiness", qualityReadinessAdapter);

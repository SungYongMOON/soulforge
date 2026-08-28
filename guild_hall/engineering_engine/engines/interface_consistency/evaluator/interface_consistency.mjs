// Deterministic E02 evaluator. It accepts already-typed interface facts only; it does not
// read project files, call RAG, infer applicability, convert units, or write artifacts.
import { createHash } from "node:crypto";
import { types } from "node:util";

import { canonicalise, compareCodePoints, inspectInstant } from "../../../core/validators/canonical.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import {
  COMPILATION_TRACE_SCHEMA_VERSION,
  EFFECTIVE_RULE_SET_SCHEMA_VERSION,
  arrayOrderRules,
  validateProfileBinding,
  withoutNulls,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { normalizeProfileOperations } from "../../../core/interfaces/profile_operation_canon.mjs";
import {
  INTERFACE_CONSISTENCY_ASSESSMENT_SCHEMA,
  INTERFACE_CONSISTENCY_CATEGORIES,
  INTERFACE_CONSISTENCY_COMPARISON_CATEGORIES,
  INTERFACE_CONSISTENCY_DOMAIN_INPUT_SCHEMA,
  INTERFACE_CONSISTENCY_RULES,
  INTERFACE_CONSISTENCY_RULESET_REF,
  INTERFACE_CONSISTENCY_RULESET_SCHEMA,
  INTERFACE_CONSISTENCY_SOURCE_PACKET_REF,
} from "../rules/interface_consistency_rules.mjs";
import {
  compileInterfaceConsistencyRules,
  INTERFACE_CONSISTENCY_COMPILER_ADAPTER_SCHEMA_VERSION,
} from "../compiler/interface_consistency_compiler_adapter.mjs";
import {
  INTERFACE_CONSISTENCY_EXPONENT_LIKE,
  INTERFACE_CONSISTENCY_SAFE_PROVENANCE_TOKEN,
  INTERFACE_CONSISTENCY_SAFE_SOURCE_REF,
  interfaceConsistencyStringHasForbiddenMarker,
} from "../rules/interface_consistency_safety_policy.mjs";

export const INTERFACE_CONSISTENCY_STATES = Object.freeze({
  SATISFIED: "satisfied",
  MISSING: "gap_missing",
  UNKNOWN: "gap_unknown",
  CONFLICT: "gap_conflict",
  NOT_APPLICABLE: "not_applicable",
});

export const INTERFACE_CONSISTENCY_EVALUATOR_CODES = Object.freeze({
  INPUT_INVALID: "IC_INPUT_INVALID",
  UNSAFE_VALUE: "IC_UNSAFE_VALUE",
  EFFECTIVE_RULESET_INVALID: "IC_EFFECTIVE_RULESET_INVALID",
  TYPED_FACTS_INVALID: "IC_TYPED_FACTS_INVALID",
});

const TOKEN = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u;
const COMPARISON_SET = new Set(INTERFACE_CONSISTENCY_COMPARISON_CATEGORIES);
const FACT_STATES = new Set(["present", "known_absent", "unknown"]);
const APPLICABILITY_STATES = new Set(["applicable", "not_applicable", "unknown"]);
const AGREEMENT_STATES = new Set(["agreed", "not_agreed", "unknown"]);
const END_ROLES = new Set(["provider", "consumer", "bidirectional", "peer"]);
const PROTOTYPE_SENSITIVE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const CORE_UTC_REGEX = /^(?:(?:[0-9]{4}-(?:(?:01|03|05|07|08|10|12)-(?:0[1-9]|[12][0-9]|3[01])|(?:04|06|09|11)-(?:0[1-9]|[12][0-9]|30)|02-(?:0[1-9]|1[0-9]|2[0-9])))T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z)$/u;
const TIME_LIKE = /^\d{4}-\d{2}-\d{2}T/u;
const MAX_RECEIPT_ARRAY_LENGTH = 300000;
const CORE_PROFILE_PACKAGE_FIELDS = Object.freeze([
  "domain_engine_id",
  "extends_or_base_pin",
  "operation_digest",
  "operations",
  "order",
  "profile_id",
  "profile_kind",
  "revision_or_hash",
  "schema_version",
  "source_refs",
]);
const CORE_PROJECT_BINDING_FIELDS = Object.freeze([
  "binding_revision_hash",
  "domain_engine_id",
  "project_id",
  "schema_version",
  "source_manifest_ref",
]);
export const INTERFACE_CONSISTENCY_ASSESSMENT_DIGEST_DOMAIN = "soulforge.interface_consistency.assessment_body.v0";

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

function fail(code, detail) {
  throw new ContractError(code, detail);
}

function descriptorsFor(value, label, errorCode = INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(errorCode, `${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== "string" || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(errorCode, `${label} cannot contain accessors, symbols, or hidden fields`);
    }
  }
  return descriptors;
}

function denseArrayDescriptors(value, label, maxLength, errorCode = INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length > maxLength) {
    fail(errorCode, `${label} must be a bounded ordinary array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === "symbol" || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key))) {
      fail(errorCode, `${label} cannot contain symbols or named array entries`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(errorCode, `${label} cannot contain sparse or accessor array entries`);
    }
  }
  return descriptors;
}

function exactObject(value, label, required, allowed = required, errorCode = INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID) {
  const descriptors = descriptorsFor(value, label, errorCode);
  const keys = Object.keys(descriptors).sort(compareCodePoints);
  const expected = [...allowed].sort(compareCodePoints);
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])) {
    fail(errorCode, `${label} has an unexpected field set`);
  }
  for (const key of required) {
    if (!Object.hasOwn(descriptors, key)) {
      fail(errorCode, `${label}.${key} is required`);
    }
  }
  return descriptors;
}

function assertPolicySafeString(value, label, errorCode, maxLength = 1024) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength
      || value.normalize("NFC") !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(errorCode, `${label} must be a bounded NFC string without controls`);
  }
  if (interfaceConsistencyStringHasForbiddenMarker(value)) {
    fail(errorCode, `${label} contains a forbidden path or secret sentinel`);
  }
  return value;
}

function safeText(value, label, maxLength = 1024) {
  assertPolicySafeString(value, label, INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE, maxLength);
  if (INTERFACE_CONSISTENCY_EXPONENT_LIKE.test(value)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE, `${label} cannot use exponent-form decimal syntax`);
  }
  if (TIME_LIKE.test(value) && (!CORE_UTC_REGEX.test(value) || !inspectInstant(value).valid)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE, `${label} must use canonical .mmmZ instant syntax when instant-shaped`);
  }
  return value;
}

function safeToken(value, label) {
  safeText(value, label, 128);
  if (!TOKEN.test(value)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label} must match the closed token grammar`);
  }
  return value;
}

function stableValueEncoding(value, label, errorCode, depth = 0, ancestors = new Set()) {
  if (depth > 64) fail(errorCode, `${label} exceeds deterministic encoding depth`);
  if (value === null) return "null";
  if (typeof value === "string") {
    assertPolicySafeString(value, label, errorCode);
    return `s:${JSON.stringify(value)}`;
  }
  if (typeof value === "boolean") return value ? "b:true" : "b:false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail(errorCode, `${label} contains a non-canonical number`);
    return `n:${String(value)}`;
  }
  if (!value || typeof value !== "object" || types.isProxy(value) || ancestors.has(value)) {
    fail(errorCode, `${label} must contain acyclic ordinary JSON data`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_RECEIPT_ARRAY_LENGTH) {
        fail(errorCode, `${label} must be a bounded ordinary array`);
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key === "symbol" || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key))) {
          fail(errorCode, `${label} contains a named or symbol array entry`);
        }
      }
      const entries = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
          fail(errorCode, `${label} contains a sparse or accessor array entry`);
        }
        entries.push(stableValueEncoding(descriptor.value, `${label}[${index}]`, errorCode, depth + 1, ancestors));
      }
      return `[${entries.join(",")}]`;
    }
    const descriptors = descriptorsFor(value, label, errorCode);
    const entries = Object.keys(descriptors).sort(compareCodePoints).map((key) => {
      assertPolicySafeString(key, `${label} key`, errorCode, 128);
      return `${JSON.stringify(key)}:${stableValueEncoding(descriptors[key].value, `${label}.${key}`, errorCode, depth + 1, ancestors)}`;
    });
    return `{${entries.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function digestStable(label, value, errorCode) {
  return `sha256:${createHash("sha256")
    .update(`${label}\n${stableValueEncoding(value, label, errorCode)}`)
    .digest("hex")}`;
}

function coreContractDigest(prefix, value, errorCode) {
  try {
    // Inspect before calling the Core serializer so hostile shapes cannot leak raw Core errors.
    stableValueEncoding(value, `${prefix} material`, errorCode);
    const clean = withoutNulls(value);
    const canonical = canonicalise(clean, arrayOrderRules(clean));
    return sha256Hex(`${prefix}\n${canonical}`);
  } catch (error) {
    if (error?.code === errorCode) throw error;
    fail(errorCode, `${prefix} material cannot satisfy the Core canonical contract`);
  }
}

export function digestInterfaceConsistencyAssessmentBody(assessmentBody) {
  const descriptors = descriptorsFor(
    assessmentBody,
    "assessment digest body",
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
  if (Object.hasOwn(descriptors, "receipt")) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, "assessment digest body must exclude receipt");
  }
  return digestStable(
    INTERFACE_CONSISTENCY_ASSESSMENT_DIGEST_DOMAIN,
    assessmentBody,
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
}

const ASSESSMENT_BODY_FIELDS = Object.freeze([
  "assessments",
  "domain_engine_id",
  "execution_mode",
  "external_effects",
  "register_id",
  "register_revision",
  "ruleset_ref",
  "schema_version",
  "source_packet_ref",
]);

function hasExactKeys(descriptors, expectedKeys) {
  const actualKeys = Object.keys(descriptors).sort(compareCodePoints);
  const sortedExpected = [...expectedKeys].sort(compareCodePoints);
  return actualKeys.length === sortedExpected.length
    && actualKeys.every((key, index) => key === sortedExpected[index]);
}

function assertExactKeySet(descriptors, expectedKeys, label) {
  if (!hasExactKeys(descriptors, expectedKeys)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label} key set does not match admitted input identity`);
  }
}

function assertSameEncoding(actual, expected, label) {
  const actualEncoding = stableValueEncoding(actual, `${label}.actual`, INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID);
  const expectedEncoding = stableValueEncoding(expected, `${label}.expected`, INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID);
  if (actualEncoding !== expectedEncoding) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label} does not match the deterministic canonical representation`);
  }
}

function cloneSafeValue(value, label, depth = 0, ancestors = new Set()) {
  if (depth > 8) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE, `${label} exceeds the maximum depth`);
  }
  if (typeof value === "string") return safeText(value, label, 1024);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE, `${label} must use a safe integer or fixed decimal string`);
    }
    return value;
  }
  if (value === null || value === undefined || typeof value !== "object") {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE, `${label} must contain non-null JSON data`);
  }
  if (types.isProxy(value) || ancestors.has(value)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE, `${label} cannot contain proxies or cycles`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 64) {
        fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE, `${label} must be a bounded ordinary array`);
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const output = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
          fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE, `${label} contains a sparse or accessor array entry`);
        }
        output.push(cloneSafeValue(descriptor.value, `${label}[${index}]`, depth + 1, ancestors));
      }
      if (Reflect.ownKeys(descriptors).some((key) => typeof key === "symbol" || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key)))) {
        fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE, `${label} contains a named array entry`);
      }
      return output;
    }
    const descriptors = descriptorsFor(value, label);
    if (Object.keys(descriptors).length > 64) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE, `${label} exceeds the maximum object-member count`);
    }
    const output = {};
    for (const key of Object.keys(descriptors).sort(compareCodePoints)) {
      if (PROTOTYPE_SENSITIVE_KEYS.has(key)) {
        fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE, `${label} contains a prototype-sensitive key`);
      }
      safeToken(key, `${label} key`);
      output[key] = cloneSafeValue(descriptors[key].value, `${label}.${key}`, depth + 1, ancestors);
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

function parseFact(value, label, { tokenValue = false, attribute = false } = {}) {
  const baseRequired = attribute ? ["attribute_id", "state"] : ["state"];
  const allowed = tokenValue
    ? ["state", "value"]
    : (attribute ? ["attribute_id", "state", "unit", "value"] : ["state", "unit", "value"]);
  const descriptors = descriptorsFor(value, label);
  const state = descriptors.state?.value;
  if (!FACT_STATES.has(state)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label}.state is invalid`);
  }
  const hasValue = Object.hasOwn(descriptors, "value");
  const hasUnit = Object.hasOwn(descriptors, "unit");
  const keys = Object.keys(descriptors).sort(compareCodePoints);
  const sortedAllowed = [...allowed].sort(compareCodePoints);
  if (keys.some((key) => !sortedAllowed.includes(key))) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label} contains an unexpected field`);
  }
  for (const key of baseRequired) {
    if (!Object.hasOwn(descriptors, key)) fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label}.${key} is required`);
  }
  if (state === "present" && !hasValue) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label}.value is required when state is present`);
  }
  if (state !== "present" && (hasValue || hasUnit)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label} may not carry value or unit when state is not present`);
  }
  const output = { state };
  if (attribute) output.attribute_id = safeToken(descriptors.attribute_id.value, `${label}.attribute_id`);
  if (state === "present") {
    output.value = tokenValue
      ? safeToken(descriptors.value.value, `${label}.value`)
      : cloneSafeValue(descriptors.value.value, `${label}.value`);
    if (hasUnit) output.unit = safeToken(descriptors.unit.value, `${label}.unit`);
  }
  return output;
}

function parseCategoryScope(value, label) {
  const descriptors = exactObject(value, label, ["applicability", "required_attributes"]);
  const applicability = descriptors.applicability.value;
  if (!APPLICABILITY_STATES.has(applicability)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label}.applicability is invalid`);
  }
  const required = descriptors.required_attributes.value;
  const requiredDescriptors = denseArrayDescriptors(required, `${label}.required_attributes`, 64);
  const ids = Array.from({ length: required.length }, (_, index) => (
    safeToken(requiredDescriptors[String(index)].value, `${label}.required_attributes[${index}]`)
  ));
  const sortedIds = [...ids].sort(compareCodePoints);
  if (new Set(sortedIds).size !== sortedIds.length) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label}.required_attributes must not contain duplicates`);
  }
  return { applicability, required_attributes: sortedIds };
}

function parseCategoryObservation(value, label) {
  const descriptors = exactObject(value, label, ["attributes"]);
  const attributes = descriptors.attributes.value;
  const attributeDescriptors = denseArrayDescriptors(attributes, `${label}.attributes`, 64);
  const parsed = Array.from({ length: attributes.length }, (_, index) => (
    parseFact(attributeDescriptors[String(index)].value, `${label}.attributes[${index}]`, { attribute: true })
  ));
  parsed.sort((left, right) => compareCodePoints(left.attribute_id, right.attribute_id));
  for (let index = 1; index < parsed.length; index += 1) {
    if (parsed[index - 1].attribute_id === parsed[index].attribute_id) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label} repeats an attribute_id`);
    }
  }
  return { attributes: parsed };
}

function parseEnd(value, label) {
  const descriptors = exactObject(value, label, ["agreement", "end_id", "observations", "revision", "role"]);
  const endId = safeToken(descriptors.end_id.value, `${label}.end_id`);
  const role = descriptors.role.value;
  if (!END_ROLES.has(role)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label}.role is invalid`);
  }
  const revision = parseFact(descriptors.revision.value, `${label}.revision`, { tokenValue: true });
  const agreementDescriptors = exactObject(descriptors.agreement.value, `${label}.agreement`, ["revision", "state"]);
  const agreementState = agreementDescriptors.state.value;
  if (!AGREEMENT_STATES.has(agreementState)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label}.agreement.state is invalid`);
  }
  const agreement = {
    state: agreementState,
    revision: parseFact(agreementDescriptors.revision.value, `${label}.agreement.revision`, { tokenValue: true }),
  };
  const observationDescriptors = descriptorsFor(descriptors.observations.value, `${label}.observations`);
  const observations = {};
  for (const category of Object.keys(observationDescriptors)) {
    if (!COMPARISON_SET.has(category)) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label}.observations has an unknown category`);
    }
    observations[category] = parseCategoryObservation(observationDescriptors[category].value, `${label}.observations.${category}`);
  }
  return { end_id: endId, role, revision, agreement, observations };
}

function parseInterface(value, label) {
  const descriptors = exactObject(value, label, ["applicability", "category_scope", "ends", "interface_id", "revision"]);
  const applicability = descriptors.applicability.value;
  if (!APPLICABILITY_STATES.has(applicability)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label}.applicability is invalid`);
  }
  const scopeDescriptors = descriptorsFor(descriptors.category_scope.value, `${label}.category_scope`);
  const categoryScope = {};
  for (const category of Object.keys(scopeDescriptors)) {
    if (!COMPARISON_SET.has(category)) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label}.category_scope has an unknown category`);
    }
    categoryScope[category] = parseCategoryScope(scopeDescriptors[category].value, `${label}.category_scope.${category}`);
  }
  const ends = descriptors.ends.value;
  const endDescriptors = denseArrayDescriptors(ends, `${label}.ends`, 16);
  if (ends.length < 2) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label}.ends must contain 2-16 endpoints`);
  }
  const parsedEnds = Array.from({ length: ends.length }, (_, index) => (
    parseEnd(endDescriptors[String(index)].value, `${label}.ends[${index}]`)
  ));
  parsedEnds.sort((left, right) => compareCodePoints(left.end_id, right.end_id));
  for (let index = 1; index < parsedEnds.length; index += 1) {
    if (parsedEnds[index - 1].end_id === parsedEnds[index].end_id) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, `${label}.ends repeats an end_id`);
    }
  }
  return {
    interface_id: safeToken(descriptors.interface_id.value, `${label}.interface_id`),
    applicability,
    revision: parseFact(descriptors.revision.value, `${label}.revision`, { tokenValue: true }),
    category_scope: categoryScope,
    ends: parsedEnds,
  };
}

function canonicalEnvelopeInstant(value, label) {
  if (typeof value !== "string" || !CORE_UTC_REGEX.test(value) || !inspectInstant(value).valid) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, `${label} must match the Core canonical UTC shape`);
  }
  return value;
}

function assertChronologicalInstants(validAt, knownAt, label) {
  // Canonical fixed-width UTC strings sort in chronological order, so no clock or
  // host date parser is needed at this deterministic boundary.
  if (validAt > knownAt) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, `${label}.known_at must not precede ${label}.valid_at`);
  }
}

function assertExactEmptyPlainObject(value, label, errorCode) {
  const descriptors = descriptorsFor(value, label, errorCode);
  if (Object.keys(descriptors).length !== 0) {
    fail(errorCode, `${label} must be the exact empty plain object`);
  }
}

function admitEvaluationCutoffs(value) {
  const descriptors = descriptorsFor(
    value,
    "evaluation cutoffs",
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
  );
  const keys = Object.keys(descriptors).sort(compareCodePoints);
  if (keys.length === 0) return null;
  const expected = ["known_at", "valid_at"];
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, "evaluation cutoffs must be empty or contain exact valid_at and known_at");
  }
  const validAt = canonicalEnvelopeInstant(descriptors.valid_at.value, "evaluation cutoffs.valid_at");
  const knownAt = canonicalEnvelopeInstant(descriptors.known_at.value, "evaluation cutoffs.known_at");
  assertChronologicalInstants(validAt, knownAt, "evaluation cutoffs");
  return { valid_at: validAt, known_at: knownAt };
}

function assertTypedFactsToken(value, label) {
  assertPolicySafeString(value, label, INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, 128);
  if (!TOKEN.test(value)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, `${label} must use the closed public token grammar`);
  }
  return value;
}

function validateCoreProjectBindingRef(value) {
  const descriptors = exactObject(
    value,
    "typed_project_facts.project_binding_ref",
    CORE_PROJECT_BINDING_FIELDS,
    CORE_PROJECT_BINDING_FIELDS,
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
  );
  if (descriptors.schema_version.value !== "soulforge.project_binding.v0"
      || descriptors.domain_engine_id.value !== "interface_consistency") {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, "typed_project_facts.project_binding_ref has an invalid Core binding identity");
  }
  const projectId = assertTypedFactsToken(descriptors.project_id.value, "typed_project_facts.project_binding_ref.project_id");
  const bindingRevisionHash = descriptors.binding_revision_hash.value;
  if (typeof bindingRevisionHash !== "string" || !/^[0-9a-f]{64}$/u.test(bindingRevisionHash)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, "typed_project_facts.project_binding_ref.binding_revision_hash must be a bare Core sha256 hex value");
  }
  const sourceManifestRef = descriptors.source_manifest_ref.value;
  assertPolicySafeString(
    sourceManifestRef,
    "typed_project_facts.project_binding_ref.source_manifest_ref",
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
    256,
  );
  if (!INTERFACE_CONSISTENCY_SAFE_SOURCE_REF.test(sourceManifestRef)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, "typed_project_facts.project_binding_ref.source_manifest_ref is not a safe public reference");
  }
  return {
    schema_version: descriptors.schema_version.value,
    project_id: projectId,
    domain_engine_id: descriptors.domain_engine_id.value,
    binding_revision_hash: bindingRevisionHash,
    source_manifest_ref: sourceManifestRef,
  };
}

function unwrapTypedProjectFacts(value) {
  const descriptors = descriptorsFor(value, "typed_project_facts", INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID);
  const keys = Object.keys(descriptors).sort(compareCodePoints);
  const minimalKeys = ["facts", "schema_version"];
  const coreKeys = ["facts", "facts_digest", "known_at", "project_binding_ref", "schema_version", "valid_at"];
  const exactShape = (expected) => keys.length === expected.length && keys.every((key, index) => key === expected[index]);
  const isMinimal = exactShape(minimalKeys);
  const isCoreEnvelope = exactShape(coreKeys);
  if ((!isMinimal && !isCoreEnvelope)
      || descriptors.schema_version?.value !== "soulforge.typed_project_facts.v0") {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, "typed_project_facts has an invalid exact-key envelope");
  }
  const facts = descriptors.facts.value;
  const factArrayDescriptors = denseArrayDescriptors(
    facts,
    "typed_project_facts.facts",
    512,
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
  );
  let assertedFactsDigest = null;
  let coreProjectBindingRef = null;
  let coreCutoffs = null;
  if (isCoreEnvelope) {
    const suppliedDigest = descriptors.facts_digest.value;
    if (typeof suppliedDigest !== "string" || !/^[0-9a-f]{64}$/u.test(suppliedDigest)) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, "typed_project_facts.facts_digest must be the bare Core sha256 hex value");
    }
    const recomputedDigest = coreContractDigest(
      "soulforge.project_observations.v0",
      facts,
      INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
    );
    if (suppliedDigest !== recomputedDigest) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, "typed_project_facts.facts_digest does not match the Core observations contract");
    }
    assertedFactsDigest = suppliedDigest;
    coreProjectBindingRef = validateCoreProjectBindingRef(descriptors.project_binding_ref.value);
    coreCutoffs = {
      valid_at: canonicalEnvelopeInstant(descriptors.valid_at.value, "typed_project_facts.valid_at"),
      known_at: canonicalEnvelopeInstant(descriptors.known_at.value, "typed_project_facts.known_at"),
    };
    assertChronologicalInstants(coreCutoffs.valid_at, coreCutoffs.known_at, "typed_project_facts");
  }
  let register = null;
  for (let index = 0; index < facts.length; index += 1) {
    const factDescriptors = descriptorsFor(
      factArrayDescriptors[String(index)].value,
      `typed_project_facts.facts[${index}]`,
      INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
    );
    const factType = factDescriptors.fact_type?.value;
    if (factType !== "interface_consistency_register") continue;
    const factKeys = Object.keys(factDescriptors).sort(compareCodePoints);
    if (factKeys.length !== 2 || factKeys[0] !== "fact_type" || factKeys[1] !== "register") {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, "interface_consistency_register fact has an invalid exact-key shape");
    }
    if (register !== null) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, "typed_project_facts must contain exactly one interface_consistency_register fact");
    }
    register = factDescriptors.register.value;
  }
  if (register === null) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, "typed_project_facts must contain exactly one interface_consistency_register fact");
  }
  const envelopeProvenance = isCoreEnvelope
    ? {
      envelope_kind: "core_typed_project_facts",
      schema_version: descriptors.schema_version.value,
      asserted_facts_digest: assertedFactsDigest,
      project_binding_ref_digest: digestStable(
        "soulforge.interface_consistency.project_binding_ref.v0",
        coreProjectBindingRef,
        INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
      ),
      cutoff_pair_digest: digestStable(
        "soulforge.interface_consistency.cutoff_pair.v0",
        coreCutoffs,
        INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
      ),
    }
    : {
      envelope_kind: "minimal_typed_project_facts",
      schema_version: descriptors.schema_version.value,
    };
  return { candidate: register, envelope_provenance: envelopeProvenance, admitted_cutoffs: coreCutoffs };
}

function unwrapDomainInput(value) {
  if (types.isProxy(value)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, "evaluation input proxy is not admitted");
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const tentativeDescriptors = descriptorsFor(
      value,
      "evaluation input",
      INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
    );
    if (tentativeDescriptors.schema_version?.value === "soulforge.typed_project_facts.v0") {
      return unwrapTypedProjectFacts(value);
    }
  }
  descriptorsFor(value, "evaluation input");
  return {
    candidate: value,
    envelope_provenance: { envelope_kind: "direct_domain_input" },
  };
}

function parseDomainInput(value) {
  const unwrapped = unwrapDomainInput(value);
  const candidate = unwrapped.candidate;
  const descriptors = exactObject(candidate, "domain input", ["interfaces", "register_id", "register_revision", "schema_version"]);
  if (descriptors.schema_version.value !== INTERFACE_CONSISTENCY_DOMAIN_INPUT_SCHEMA) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, "domain input schema_version is invalid");
  }
  const interfaces = descriptors.interfaces.value;
  const interfaceDescriptors = denseArrayDescriptors(interfaces, "domain input.interfaces", 256);
  if (interfaces.length === 0) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, "domain input.interfaces must be a non-empty bounded array");
  }
  const parsedInterfaces = Array.from({ length: interfaces.length }, (_, index) => (
    parseInterface(interfaceDescriptors[String(index)].value, `domain input.interfaces[${index}]`)
  ));
  parsedInterfaces.sort((left, right) => compareCodePoints(left.interface_id, right.interface_id));
  for (let index = 1; index < parsedInterfaces.length; index += 1) {
    if (parsedInterfaces[index - 1].interface_id === parsedInterfaces[index].interface_id) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, "domain input.interfaces repeats an interface_id");
    }
  }
  return {
    schema_version: INTERFACE_CONSISTENCY_DOMAIN_INPUT_SCHEMA,
    register_id: safeToken(descriptors.register_id.value, "domain input.register_id"),
    register_revision: safeToken(descriptors.register_revision.value, "domain input.register_revision"),
    interfaces: parsedInterfaces,
    envelope_provenance: unwrapped.envelope_provenance,
    admitted_cutoffs: unwrapped.admitted_cutoffs,
  };
}

function sameRef(actual, expected, label) {
  const descriptors = exactObject(
    actual,
    label,
    ["content_hash_alg", "content_id", "entity_id", "revision_id"],
    ["content_hash_alg", "content_id", "entity_id", "revision_id"],
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  return descriptors.entity_id.value === expected.entity_id
    && descriptors.revision_id.value === expected.revision_id
    && descriptors.content_id.value === expected.content_id
    && descriptors.content_hash_alg.value === expected.content_hash_alg;
}

function assertSafeDirectProvenanceString(value, label, { rejectExponent = false } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128
      || value.normalize("NFC") !== value || /[\u0000-\u001f\u007f]/u.test(value)
      || !INTERFACE_CONSISTENCY_SAFE_PROVENANCE_TOKEN.test(value)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, `${label} is not a bounded safe provenance string`);
  }
  if (rejectExponent && INTERFACE_CONSISTENCY_EXPONENT_LIKE.test(value)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, `${label} cannot use exponent-like revision syntax`);
  }
  if (interfaceConsistencyStringHasForbiddenMarker(value)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, `${label} contains a forbidden path or secret sentinel`);
  }
  return value;
}

function parseProfileApplicabilityOperation(value, label) {
  const descriptors = exactObject(
    value,
    label,
    ["applicable", "category", "op"],
    ["applicable", "category", "op"],
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  if (descriptors.op.value !== "set_category_applicability"
      || typeof descriptors.category.value !== "string"
      || typeof descriptors.applicable.value !== "boolean") {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, `${label} is not a valid Interface Consistency applicability operation`);
  }
  assertSafeDirectProvenanceString(descriptors.category.value, `${label}.category`);
  if (!INTERFACE_CONSISTENCY_CATEGORIES.includes(descriptors.category.value)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, `${label}.category is unknown`);
  }
  return {
    op: descriptors.op.value,
    category: descriptors.category.value,
    applicable: descriptors.applicable.value,
  };
}

function validateProfilePackage(value, expectedOrder) {
  const descriptors = exactObject(
    value,
    `effective rule set.profile_packages[${expectedOrder}]`,
    CORE_PROFILE_PACKAGE_FIELDS,
    CORE_PROFILE_PACKAGE_FIELDS,
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  if (descriptors.schema_version.value !== "soulforge.engineering_profile_binding.v0"
      || descriptors.domain_engine_id.value !== "interface_consistency"
      || descriptors.order.value !== expectedOrder
      || !Number.isSafeInteger(descriptors.order.value)
      || (descriptors.profile_kind.value !== "organization" && descriptors.profile_kind.value !== "project")) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "Profile package metadata is invalid");
  }
  assertSafeDirectProvenanceString(descriptors.profile_id.value, "profile package.profile_id");
  assertSafeDirectProvenanceString(descriptors.profile_kind.value, "profile package.profile_kind");
  assertSafeDirectProvenanceString(descriptors.revision_or_hash.value, "profile package.revision_or_hash", { rejectExponent: true });
  assertSafeDirectProvenanceString(descriptors.extends_or_base_pin.value, "profile package.extends_or_base_pin");
  assertSafeDirectProvenanceString(descriptors.operation_digest.value, "profile package.operation_digest");
  if (!/^[0-9a-f]{64}$/u.test(descriptors.operation_digest.value)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "Profile package operation_digest is not a Core digest");
  }
  const sourceRefs = descriptors.source_refs.value;
  const sourceDescriptors = denseArrayDescriptors(
    sourceRefs,
    `effective rule set.profile_packages[${expectedOrder}].source_refs`,
    64,
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  if (sourceRefs.length === 0) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "Profile package must retain Core source references");
  }
  const normalizedSourceRefs = Array.from({ length: sourceRefs.length }, (_, index) => (
    assertSafeTraceSourceRef(sourceDescriptors[String(index)].value, `profile package.source_refs[${index}]`)
  ));
  const operations = descriptors.operations.value;
  denseArrayDescriptors(
    operations,
    `effective rule set.profile_packages[${expectedOrder}].operations`,
    64,
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  let normalizedOperations;
  try {
    normalizedOperations = normalizeProfileOperations(operations);
  } catch {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "Profile package operations do not satisfy the Core operation canonical contract");
  }
  if (descriptors.operation_digest.value !== normalizedOperations.operation_digest) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "Profile package operation_digest does not match normalized operations");
  }
  let coreBinding;
  try {
    coreBinding = validateProfileBinding({
      schema_version: descriptors.schema_version.value,
      profile_kind: descriptors.profile_kind.value,
      profile_id: descriptors.profile_id.value,
      domain_engine_id: descriptors.domain_engine_id.value,
      revision_or_hash: descriptors.revision_or_hash.value,
      extends_or_base_pin: descriptors.extends_or_base_pin.value,
      operation_digest: descriptors.operation_digest.value,
      source_refs: normalizedSourceRefs,
      order: descriptors.order.value,
      operations: normalizedOperations.operations,
    }, expectedOrder);
  } catch {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "Profile package does not satisfy the Core binding contract");
  }
  if (coreBinding.operation_digest !== normalizedOperations.operation_digest) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "Profile package Core operation digest parity failed");
  }
  const normalizedOperationDescriptors = denseArrayDescriptors(
    coreBinding.operations,
    `effective rule set.profile_packages[${expectedOrder}].normalized_operations`,
    64,
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  const semanticOperations = Array.from({ length: coreBinding.operations.length }, (_, index) => (
    parseProfileApplicabilityOperation(
      normalizedOperationDescriptors[String(index)].value,
      `effective rule set.profile_packages[${expectedOrder}].operations[${index}]`,
    )
  ));
  return { core_binding: coreBinding, semantic_operations: semanticOperations };
}

function validateProfilePackages(value, { requireCoreAssembly = false } = {}) {
  const descriptors = denseArrayDescriptors(
    value,
    "effective rule set.profile_packages",
    2,
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  if (!requireCoreAssembly && value.length !== 0) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "direct compiler output may not claim Profile packages without a verified Core assembly");
  }
  const packages = Array.from({ length: value.length }, (_, index) => (
    validateProfilePackage(descriptors[String(index)].value, index)
  ));
  if (packages.some((entry, index) => (entry.core_binding.profile_kind === "organization" && index !== 0)
      || (entry.core_binding.profile_kind === "project" && index > 1))
      || packages.filter((entry) => entry.core_binding.profile_kind === "organization").length > 1
      || packages.filter((entry) => entry.core_binding.profile_kind === "project").length > 1) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "Profile package order is invalid");
  }
  return packages;
}

function deriveProfileApplicability(profilePackages) {
  const categoryApplicability = Object.fromEntries(INTERFACE_CONSISTENCY_CATEGORIES.map((category) => [category, null]));
  const provenance = {};
  for (let packageIndex = 0; packageIndex < profilePackages.length; packageIndex += 1) {
    for (let operationIndex = 0; operationIndex < profilePackages[packageIndex].semantic_operations.length; operationIndex += 1) {
      const operation = profilePackages[packageIndex].semantic_operations[operationIndex];
      categoryApplicability[operation.category] = operation.applicable;
      provenance[operation.category] = { profile_package_index: packageIndex, operation_index: operationIndex };
    }
  }
  return { category_applicability: categoryApplicability, provenance };
}

function validateProfileRuleProvenance(value, categoryApplicability, derived, { requireCoreAssembly = false } = {}) {
  const descriptors = descriptorsFor(
    value,
    "effective rule set.profile_rule_provenance",
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  const knownCategories = new Set(INTERFACE_CONSISTENCY_CATEGORIES);
  for (const category of Object.keys(descriptors)) {
    if (!knownCategories.has(category)) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "profile_rule_provenance contains an unknown category");
    }
  }
  for (const category of INTERFACE_CONSISTENCY_CATEGORIES) {
    const expectedApplicability = derived.category_applicability[category];
    const hasProvenance = Object.hasOwn(descriptors, category);
    if (categoryApplicability[category] !== expectedApplicability) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "category applicability is not produced by normalized Profile operations");
    }
    if (expectedApplicability === null) {
      if (hasProvenance) {
        fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "profile_rule_provenance cannot explain a base category");
      }
      continue;
    }
    if (!requireCoreAssembly) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "direct compiler output may not claim Profile-derived category applicability without a verified Core assembly");
    }
    if (!hasProvenance) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "profile_rule_provenance is required for a Profile-derived category override");
    }
    const provenance = exactObject(
      descriptors[category].value,
      `effective rule set.profile_rule_provenance.${category}`,
      ["operation_index", "profile_package_index"],
      ["operation_index", "profile_package_index"],
      INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
    );
    const expected = derived.provenance[category];
    if (!Number.isSafeInteger(provenance.profile_package_index.value)
        || !Number.isSafeInteger(provenance.operation_index.value)
        || provenance.profile_package_index.value !== expected.profile_package_index
        || provenance.operation_index.value !== expected.operation_index) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "profile_rule_provenance does not reference the producing normalized Profile operation");
    }
  }
  return derived.provenance;
}

function assertSafeTraceSourceRef(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256
      || value.normalize("NFC") !== value || /[\u0000-\u001f\u007f]/u.test(value)
      || !INTERFACE_CONSISTENCY_SAFE_SOURCE_REF.test(value)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, `${label} is not a bounded safe source reference`);
  }
  if (interfaceConsistencyStringHasForbiddenMarker(value)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, `${label} contains a forbidden path or secret sentinel`);
  }
  return value;
}

function validateTraceProfile(value, expectedOrder) {
  const descriptors = exactObject(
    value,
    `compilation_trace.profiles[${expectedOrder}]`,
    [
      "applied_operations_count",
      "domain_engine_id",
      "extends_or_base_pin",
      "operation_digest",
      "order",
      "profile_id",
      "profile_kind",
      "revision_or_hash",
      "source_refs",
    ],
    undefined,
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  if (descriptors.order.value !== expectedOrder
      || descriptors.domain_engine_id.value !== "interface_consistency"
      || !Number.isSafeInteger(descriptors.applied_operations_count.value)
      || descriptors.applied_operations_count.value < 0) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "compilation trace profile metadata is invalid");
  }
  assertSafeDirectProvenanceString(descriptors.profile_id.value, "trace.profile_id");
  assertSafeDirectProvenanceString(descriptors.profile_kind.value, "trace.profile_kind");
  assertSafeDirectProvenanceString(descriptors.revision_or_hash.value, "trace.revision_or_hash", { rejectExponent: true });
  assertSafeDirectProvenanceString(descriptors.extends_or_base_pin.value, "trace.extends_or_base_pin");
  assertSafeDirectProvenanceString(descriptors.operation_digest.value, "trace.operation_digest");
  if (!/^[0-9a-f]{64}$/u.test(descriptors.operation_digest.value)) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "compilation trace profile operation_digest is not a Core digest");
  }
  const sourceRefs = descriptors.source_refs.value;
  const sourceDescriptors = denseArrayDescriptors(
    sourceRefs,
    `compilation_trace.profiles[${expectedOrder}].source_refs`,
    64,
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  if (sourceRefs.length === 0) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "compilation trace profile must retain Core source references");
  }
  const normalizedRefs = Array.from({ length: sourceRefs.length }, (_, index) => (
    assertSafeTraceSourceRef(sourceDescriptors[String(index)].value, `trace.source_refs[${index}]`)
  ));
  return {
    order: descriptors.order.value,
    profile_kind: descriptors.profile_kind.value,
    profile_id: descriptors.profile_id.value,
    domain_engine_id: descriptors.domain_engine_id.value,
    revision_or_hash: descriptors.revision_or_hash.value,
    extends_or_base_pin: descriptors.extends_or_base_pin.value,
    operation_digest: descriptors.operation_digest.value,
    applied_operations_count: descriptors.applied_operations_count.value,
    source_refs: normalizedRefs,
  };
}

function validateShortTrace(value, profile, label) {
  if (profile === null) {
    if (value !== null) fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, `${label} must be null when absent`);
    return;
  }
  const descriptors = exactObject(
    value,
    label,
    ["applied_operations_count", "domain_engine_id", "extends_or_base_pin", "operation_digest", "profile_id", "revision_or_hash", "source_refs"],
    undefined,
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  const expected = {
    profile_id: profile.profile_id,
    domain_engine_id: profile.domain_engine_id,
    revision_or_hash: profile.revision_or_hash,
    extends_or_base_pin: profile.extends_or_base_pin,
    operation_digest: profile.operation_digest,
    applied_operations_count: profile.applied_operations_count,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (descriptors[field].value !== expectedValue) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, `${label}.${field} does not match ordered profile trace`);
    }
  }
  const refs = descriptors.source_refs.value;
  const refDescriptors = denseArrayDescriptors(refs, `${label}.source_refs`, 64, INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID);
  if (refs.length !== profile.source_refs.length) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, `${label}.source_refs length does not match ordered profile trace`);
  }
  for (let index = 0; index < refs.length; index += 1) {
    if (assertSafeTraceSourceRef(refDescriptors[String(index)].value, `${label}.source_refs[${index}]`) !== profile.source_refs[index]) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, `${label}.source_refs does not match ordered profile trace`);
    }
  }
}

function validateCoreCompilationTrace(value, wrapperMetadata, profilePackages, computedDigest) {
  const descriptors = exactObject(
    value,
    "effective rule set compilation_trace",
    [
      "compilation_scope",
      "domain_adapter_revision",
      "domain_engine_id",
      "effective_ruleset_digest",
      "organization_trace",
      "profiles",
      "project_trace",
      "rule_count",
      "schema_version",
    ],
    undefined,
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  if (descriptors.schema_version.value !== COMPILATION_TRACE_SCHEMA_VERSION
      || descriptors.domain_engine_id.value !== "interface_consistency"
      || descriptors.domain_adapter_revision.value !== INTERFACE_CONSISTENCY_COMPILER_ADAPTER_SCHEMA_VERSION
      || descriptors.rule_count.value !== INTERFACE_CONSISTENCY_RULES.length
      || descriptors.effective_ruleset_digest.value !== computedDigest
      || wrapperMetadata.assembly_digest !== computedDigest) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "Core assembly and trace digest metadata is stale or invalid");
  }
  exactObject(
    descriptors.compilation_scope.value,
    "compilation_trace.compilation_scope",
    [],
    [],
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  const rawProfiles = descriptors.profiles.value;
  const profileDescriptors = denseArrayDescriptors(rawProfiles, "compilation_trace.profiles", 2, INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID);
  const profiles = Array.from({ length: rawProfiles.length }, (_, index) => (
    validateTraceProfile(profileDescriptors[String(index)].value, index)
  ));
  if (profiles.length !== profilePackages.length) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "compilation trace profile count does not match retained Core Profile packages");
  }
  if (profiles.some((profile) => profile.profile_kind !== "organization" && profile.profile_kind !== "project")
      || profiles.some((profile, index) => (profile.profile_kind === "organization" && index !== 0)
      || (profile.profile_kind === "project" && index > 1))
      || profiles.filter((profile) => profile.profile_kind === "organization").length > 1
      || profiles.filter((profile) => profile.profile_kind === "project").length > 1) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "compilation trace profile order is invalid");
  }
  const organization = profiles.find((profile) => profile.profile_kind === "organization") ?? null;
  const project = profiles.find((profile) => profile.profile_kind === "project") ?? null;
  validateShortTrace(descriptors.organization_trace.value, organization, "compilation_trace.organization_trace");
  validateShortTrace(descriptors.project_trace.value, project, "compilation_trace.project_trace");
  for (let index = 0; index < profiles.length; index += 1) {
    const traceProfile = profiles[index];
    const packageBinding = profilePackages[index].core_binding;
    if (traceProfile.order !== packageBinding.order
        || traceProfile.profile_kind !== packageBinding.profile_kind
        || traceProfile.profile_id !== packageBinding.profile_id
        || traceProfile.domain_engine_id !== packageBinding.domain_engine_id
        || traceProfile.revision_or_hash !== packageBinding.revision_or_hash
        || traceProfile.extends_or_base_pin !== packageBinding.extends_or_base_pin
        || traceProfile.operation_digest !== packageBinding.operation_digest
        || traceProfile.applied_operations_count !== profilePackages[index].semantic_operations.length
        || traceProfile.source_refs.length !== packageBinding.source_refs.length) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "compilation trace profile does not match retained Core Profile package");
    }
    for (let refIndex = 0; refIndex < traceProfile.source_refs.length; refIndex += 1) {
      if (traceProfile.source_refs[refIndex] !== packageBinding.source_refs[refIndex]) {
        fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "compilation trace profile source refs do not match retained Core Profile package");
      }
    }
  }
}

function unwrapEffectiveRuleSet(value) {
  const outerDescriptors = descriptorsFor(
    value,
    "effective rule set input",
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  let candidate = value;
  let wrapperMetadata = { wrapper_kind: "direct_effective_rule_set" };
  if (Object.hasOwn(outerDescriptors, "effective_rule_set")) {
    const wrapperKeys = Object.keys(outerDescriptors).sort(compareCodePoints);
    const compilerOutputKeys = ["effective_rule_set", "rule_count"];
    const expectedWrapperKeys = [
      "assembly_digest",
      "compilation_trace",
      "domain_engine_id",
      "effective_rule_set",
      "rule_count",
      "schema_version",
    ];
    const isCompilerOutput = wrapperKeys.length === compilerOutputKeys.length
      && wrapperKeys.every((key, index) => key === compilerOutputKeys[index]);
    const isCoreWrapper = wrapperKeys.length === expectedWrapperKeys.length
      && wrapperKeys.every((key, index) => key === expectedWrapperKeys[index]);
    if (!isCompilerOutput && !isCoreWrapper) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "effective rule set wrapper has an invalid exact-key shape");
    }
    if (!Number.isSafeInteger(outerDescriptors.rule_count.value)
        || outerDescriptors.rule_count.value !== INTERFACE_CONSISTENCY_RULES.length) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "effective rule set wrapper metadata is invalid");
    }
    candidate = outerDescriptors.effective_rule_set.value;
    if (isCompilerOutput) {
      wrapperMetadata = {
        wrapper_kind: "domain_compiler_output",
        rule_count: outerDescriptors.rule_count.value,
      };
    } else {
      if (outerDescriptors.schema_version.value !== EFFECTIVE_RULE_SET_SCHEMA_VERSION
          || outerDescriptors.domain_engine_id.value !== "interface_consistency"
          || typeof outerDescriptors.assembly_digest.value !== "string"
          || !/^[0-9a-f]{64}$/u.test(outerDescriptors.assembly_digest.value)) {
        fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "effective rule set wrapper metadata is invalid");
      }
      descriptorsFor(
        outerDescriptors.compilation_trace.value,
        "effective rule set compilation_trace",
        INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
      );
      wrapperMetadata = {
        wrapper_kind: "core_assembly_wrapper",
        domain_engine_id: outerDescriptors.domain_engine_id.value,
        rule_count: outerDescriptors.rule_count.value,
        assembly_digest: outerDescriptors.assembly_digest.value,
      };
    }
  }
  const descriptors = exactObject(candidate, "effective rule set", [
    "category_applicability",
    "profile_packages",
    "profile_rule_provenance",
    "rules",
    "ruleset_ref",
    "schema_version",
    "source_packet_ref",
  ], undefined, INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID);
  if (descriptors.schema_version.value !== INTERFACE_CONSISTENCY_RULESET_SCHEMA
      || !sameRef(descriptors.ruleset_ref.value, INTERFACE_CONSISTENCY_RULESET_REF, "effective rule set.ruleset_ref")
      || !sameRef(descriptors.source_packet_ref.value, INTERFACE_CONSISTENCY_SOURCE_PACKET_REF, "effective rule set.source_packet_ref")) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "effective rule set provenance is invalid");
  }
  const rules = descriptors.rules.value;
  const ruleDescriptors = denseArrayDescriptors(
    rules,
    "effective rule set.rules",
    INTERFACE_CONSISTENCY_RULES.length,
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  if (rules.length !== INTERFACE_CONSISTENCY_RULES.length) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "effective rule set rule count is invalid");
  }
  for (let index = 0; index < INTERFACE_CONSISTENCY_RULES.length; index += 1) {
    const rule = ruleDescriptors[String(index)].value;
    const actual = stableValueEncoding(rule, `effective rule set.rules[${index}]`, INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID);
    const expected = stableValueEncoding(
      INTERFACE_CONSISTENCY_RULES[index],
      `base rule set.rules[${index}]`,
      INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
    );
    if (actual !== expected) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "effective rule set rules are tampered or reordered");
    }
  }
  const applicabilityDescriptors = descriptorsFor(
    descriptors.category_applicability.value,
    "effective rule set.category_applicability",
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  const applicabilityKeys = Object.keys(applicabilityDescriptors).sort(compareCodePoints);
  const expectedKeys = [...INTERFACE_CONSISTENCY_CATEGORIES].sort(compareCodePoints);
  if (applicabilityKeys.length !== expectedKeys.length || !applicabilityKeys.every((key, index) => key === expectedKeys[index])) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "effective rule set category applicability is incomplete");
  }
  const categoryApplicability = {};
  for (const category of INTERFACE_CONSISTENCY_CATEGORIES) {
    const entry = applicabilityDescriptors[category].value;
    if (entry !== null && typeof entry !== "boolean") {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID, "category applicability must be boolean or null");
    }
    categoryApplicability[category] = entry;
  }
  const profilePackages = validateProfilePackages(
    descriptors.profile_packages.value,
    { requireCoreAssembly: wrapperMetadata.wrapper_kind === "core_assembly_wrapper" },
  );
  const derivedProfileApplicability = deriveProfileApplicability(profilePackages);
  validateProfileRuleProvenance(
    descriptors.profile_rule_provenance.value,
    categoryApplicability,
    derivedProfileApplicability,
    { requireCoreAssembly: wrapperMetadata.wrapper_kind === "core_assembly_wrapper" },
  );
  if (wrapperMetadata.wrapper_kind === "core_assembly_wrapper") {
    const computedCoreDigest = coreContractDigest(
      "soulforge.effective_rule_set.v0",
      candidate,
      INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
    );
    validateCoreCompilationTrace(
      outerDescriptors.compilation_trace.value,
      wrapperMetadata,
      profilePackages,
      computedCoreDigest,
    );
  }
  return {
    category_applicability: categoryApplicability,
    requires_core_typed_facts: wrapperMetadata.wrapper_kind === "core_assembly_wrapper",
    domain_ruleset_digest: digestStable(
      "soulforge.interface_consistency.effective_ruleset.v0",
      { effective_rule_set: candidate, wrapper_metadata: wrapperMetadata },
      INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
    ),
  };
}

function stateForApplicability(interfaceApplicability, scopedApplicability, profileApplicability) {
  if (interfaceApplicability === "not_applicable") return INTERFACE_CONSISTENCY_STATES.NOT_APPLICABLE;
  if (interfaceApplicability === "unknown") return INTERFACE_CONSISTENCY_STATES.UNKNOWN;
  if (profileApplicability === false && scopedApplicability === "applicable") return INTERFACE_CONSISTENCY_STATES.CONFLICT;
  if (profileApplicability === true && scopedApplicability === "not_applicable") return INTERFACE_CONSISTENCY_STATES.CONFLICT;
  const resolved = profileApplicability === null ? scopedApplicability : (profileApplicability ? "applicable" : "not_applicable");
  if (resolved === "not_applicable") return INTERFACE_CONSISTENCY_STATES.NOT_APPLICABLE;
  if (resolved === "unknown") return INTERFACE_CONSISTENCY_STATES.UNKNOWN;
  return null;
}

function globalCategoryApplicabilityState(interfaceApplicability, profileApplicability) {
  if (interfaceApplicability === "not_applicable") return INTERFACE_CONSISTENCY_STATES.NOT_APPLICABLE;
  if (interfaceApplicability === "unknown") return INTERFACE_CONSISTENCY_STATES.UNKNOWN;
  if (profileApplicability === false) return INTERFACE_CONSISTENCY_STATES.NOT_APPLICABLE;
  return null;
}

function pairRows(ends) {
  const pairs = [];
  for (let left = 0; left < ends.length; left += 1) {
    for (let right = left + 1; right < ends.length; right += 1) {
      pairs.push({
        left: ends[left],
        right: ends[right],
        pair_key: `${ends[left].end_id}<->${ends[right].end_id}`,
      });
    }
  }
  return pairs;
}

function pairResult(pair, state, detailCode, attributeIds = []) {
  return {
    pair_key: pair.pair_key,
    state,
    detail_code: detailCode,
    attribute_ids: attributeIds,
  };
}

function aggregatePairResults(pairResults, aggregateDetailCode) {
  return {
    state: overallState(pairResults),
    detail_code: aggregateDetailCode,
    attribute_ids: [...new Set(pairResults.flatMap((row) => row.attribute_ids))].sort(compareCodePoints),
    pair_results: Object.fromEntries(pairResults.map(({ pair_key, ...pairResultBody }) => [pair_key, pairResultBody])),
  };
}

function uniformPairResults(interfaceRecord, state, detailCode) {
  return aggregatePairResults(
    pairRows(interfaceRecord.ends).map((pair) => pairResult(pair, state, detailCode)),
    detailCode,
  );
}

function factConsensus(facts) {
  const present = facts.filter((fact) => fact.state === "present");
  const missing = facts.some((fact) => fact.state === "known_absent");
  const unknown = facts.some((fact) => fact.state === "unknown");
  if (present.length > 0 && missing) return INTERFACE_CONSISTENCY_STATES.CONFLICT;
  if (present.length > 1) {
    const materialFor = (fact) => (
      Object.hasOwn(fact, "unit") ? { unit: fact.unit, value: fact.value } : { value: fact.value }
    );
    const first = stableValueEncoding(
      materialFor(present[0]),
      "fact comparison material",
      INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE,
    );
    if (present.some((fact) => stableValueEncoding(
      materialFor(fact),
      "fact comparison material",
      INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE,
    ) !== first)) {
      return INTERFACE_CONSISTENCY_STATES.CONFLICT;
    }
  }
  if (missing) return INTERFACE_CONSISTENCY_STATES.MISSING;
  if (unknown || present.length === 0) return INTERFACE_CONSISTENCY_STATES.UNKNOWN;
  return INTERFACE_CONSISTENCY_STATES.SATISFIED;
}

function observationFact(end, category, attributeId) {
  const observation = end.observations[category];
  const match = observation?.attributes.find((row) => row.attribute_id === attributeId);
  return match ?? { state: "unknown" };
}

function categoryFinding(interfaceRecord, rule, categoryApplicability) {
  const scope = interfaceRecord.category_scope[rule.category];
  if (!scope) {
    const state = interfaceRecord.applicability === "not_applicable"
      ? INTERFACE_CONSISTENCY_STATES.NOT_APPLICABLE
      : INTERFACE_CONSISTENCY_STATES.UNKNOWN;
    return uniformPairResults(interfaceRecord, state, "IC_CATEGORY_SCOPE_UNKNOWN");
  }
  const applicabilityState = stateForApplicability(
    interfaceRecord.applicability,
    scope.applicability,
    categoryApplicability[rule.category],
  );
  if (applicabilityState) {
    return uniformPairResults(
      interfaceRecord,
      applicabilityState,
      `IC_${rule.category.toUpperCase()}_APPLICABILITY_${applicabilityState.toUpperCase()}`,
    );
  }
  if (scope.required_attributes.length === 0) {
    return uniformPairResults(interfaceRecord, INTERFACE_CONSISTENCY_STATES.UNKNOWN, "IC_REQUIRED_ATTRIBUTE_SET_UNKNOWN");
  }
  const pairResults = pairRows(interfaceRecord.ends).map((pair) => {
    const attributeResults = scope.required_attributes.map((attributeId) => ({
      attribute_id: attributeId,
      state: factConsensus([
        observationFact(pair.left, rule.category, attributeId),
        observationFact(pair.right, rule.category, attributeId),
      ]),
    }));
    const state = overallState(attributeResults);
    return pairResult(
      pair,
      state,
      state === INTERFACE_CONSISTENCY_STATES.SATISFIED ? "IC_PAIRWISE_MATCH" : "IC_PAIRWISE_ATTRIBUTE_STATE",
      attributeResults.filter((row) => row.state !== INTERFACE_CONSISTENCY_STATES.SATISFIED).map((row) => row.attribute_id),
    );
  });
  return aggregatePairResults(pairResults, "IC_PAIRWISE_RESULTS_AGGREGATED");
}

function revisionFinding(interfaceRecord, rule, categoryApplicability) {
  const applicabilityState = globalCategoryApplicabilityState(interfaceRecord.applicability, categoryApplicability.revision);
  if (applicabilityState) return uniformPairResults(interfaceRecord, applicabilityState, "IC_REVISION_APPLICABILITY");
  const pairResults = pairRows(interfaceRecord.ends).map((pair) => pairResult(
    pair,
    factConsensus([interfaceRecord.revision, pair.left.revision, pair.right.revision]),
    "IC_REVISION_ALIGNMENT",
  ));
  return aggregatePairResults(pairResults, "IC_REVISION_RESULTS_AGGREGATED");
}

function bilateralFinding(interfaceRecord, rule, categoryApplicability) {
  const applicabilityState = globalCategoryApplicabilityState(interfaceRecord.applicability, categoryApplicability.bilateral_agreement);
  if (applicabilityState) return uniformPairResults(interfaceRecord, applicabilityState, "IC_BILATERAL_APPLICABILITY");
  const pairResults = pairRows(interfaceRecord.ends).map((pair) => {
    const states = [pair.left.agreement.state, pair.right.agreement.state];
    const hasAgreed = states.includes("agreed");
    const hasNotAgreed = states.includes("not_agreed");
    if (hasAgreed && hasNotAgreed) {
      return pairResult(pair, INTERFACE_CONSISTENCY_STATES.CONFLICT, "IC_BILATERAL_AGREEMENT_CONFLICT");
    }
    if (hasNotAgreed) {
      return pairResult(pair, INTERFACE_CONSISTENCY_STATES.MISSING, "IC_BILATERAL_AGREEMENT_MISSING");
    }
    if (states.includes("unknown")) {
      return pairResult(pair, INTERFACE_CONSISTENCY_STATES.UNKNOWN, "IC_BILATERAL_AGREEMENT_UNKNOWN");
    }
    return pairResult(
      pair,
      factConsensus([interfaceRecord.revision, pair.left.agreement.revision, pair.right.agreement.revision]),
      "IC_BILATERAL_REVISION_ALIGNMENT",
    );
  });
  return aggregatePairResults(pairResults, "IC_BILATERAL_RESULTS_AGGREGATED");
}

function registerFinding(interfaceRecord, rule, categoryApplicability) {
  const applicabilityState = globalCategoryApplicabilityState(interfaceRecord.applicability, categoryApplicability.interface_register);
  return uniformPairResults(
    interfaceRecord,
    applicabilityState ?? INTERFACE_CONSISTENCY_STATES.SATISFIED,
    applicabilityState ? "IC_REGISTER_APPLICABILITY" : "IC_REGISTERED_ENDS",
  );
}

function overallState(findings) {
  const states = findings.map((finding) => finding.state);
  if (states.includes(INTERFACE_CONSISTENCY_STATES.CONFLICT)) return INTERFACE_CONSISTENCY_STATES.CONFLICT;
  if (states.includes(INTERFACE_CONSISTENCY_STATES.MISSING)) return INTERFACE_CONSISTENCY_STATES.MISSING;
  if (states.includes(INTERFACE_CONSISTENCY_STATES.UNKNOWN)) return INTERFACE_CONSISTENCY_STATES.UNKNOWN;
  if (states.every((state) => state === INTERFACE_CONSISTENCY_STATES.NOT_APPLICABLE)) return INTERFACE_CONSISTENCY_STATES.NOT_APPLICABLE;
  return INTERFACE_CONSISTENCY_STATES.SATISFIED;
}

function evaluateInterface(interfaceRecord, categoryApplicability) {
  const findings = INTERFACE_CONSISTENCY_RULES.map((rule) => {
    let verdict;
    if (rule.category === "interface_register") verdict = registerFinding(interfaceRecord, rule, categoryApplicability);
    else if (rule.category === "revision") verdict = revisionFinding(interfaceRecord, rule, categoryApplicability);
    else if (rule.category === "bilateral_agreement") verdict = bilateralFinding(interfaceRecord, rule, categoryApplicability);
    else verdict = categoryFinding(interfaceRecord, rule, categoryApplicability);
    return {
      rule_id: rule.rule_id,
      category: rule.category,
      pair_results: verdict.pair_results,
    };
  });
  return {
    pairs: Object.fromEntries(pairRows(interfaceRecord.ends).map((pair) => [
      pair.pair_key,
      {
        rules: findings.map((finding) => ({
          rule_id: finding.rule_id,
          category: finding.category,
          ...finding.pair_results[pair.pair_key],
        })),
      },
    ])),
  };
}

/**
 * Verifies the dynamic relationship that JSON Schema cannot express: every public
 * interface/pair key must be derived from the admitted input, and every pair owns the
 * fixed E02 outcome slots exactly once. A caller must supply an effective ruleset context;
 * the verifier re-admits it itself so a reclosed outcome payload is compared to deterministic
 * replay even outside the evaluator.
 */
export function verifyInterfaceConsistencyAssessment(typedProjectFacts, result, effectiveRuleSet) {
  if (effectiveRuleSet === undefined || effectiveRuleSet === null) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, "assessment verification requires an effective ruleset context");
  }
  const replayContext = unwrapEffectiveRuleSet(effectiveRuleSet);
  const input = parseDomainInput(typedProjectFacts);
  const resultDescriptors = exactObject(
    result,
    "assessment verification result",
    [...ASSESSMENT_BODY_FIELDS, "receipt"],
    [...ASSESSMENT_BODY_FIELDS, "receipt"],
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
  if (resultDescriptors.schema_version.value !== INTERFACE_CONSISTENCY_ASSESSMENT_SCHEMA
      || resultDescriptors.domain_engine_id.value !== "interface_consistency"
      || resultDescriptors.register_id.value !== input.register_id
      || resultDescriptors.register_revision.value !== input.register_revision
      || resultDescriptors.execution_mode.value !== "deterministic_only"
      || !sameRef(resultDescriptors.ruleset_ref.value, INTERFACE_CONSISTENCY_RULESET_REF, "assessment verification ruleset_ref")
      || !sameRef(resultDescriptors.source_packet_ref.value, INTERFACE_CONSISTENCY_SOURCE_PACKET_REF, "assessment verification source_packet_ref")) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, "assessment verification metadata is not the fixed E02 public contract");
  }
  const effects = exactObject(
    resultDescriptors.external_effects.value,
    "assessment verification external_effects",
    ["files_read", "files_written", "network_calls", "rag_queries"],
    ["files_read", "files_written", "network_calls", "rag_queries"],
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
  if (effects.files_read.value !== 0 || effects.files_written.value !== 0
      || effects.network_calls.value !== 0 || effects.rag_queries.value !== 0) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, "assessment verification external effects must remain zero");
  }

  const assessments = descriptorsFor(
    resultDescriptors.assessments.value,
    "assessment verification assessments",
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
  const expectedInterfaceIds = input.interfaces.map((record) => record.interface_id);
  assertExactKeySet(assessments, expectedInterfaceIds, "assessment verification interface map");
  for (const interfaceRecord of input.interfaces) {
    const assessment = exactObject(
      assessments[interfaceRecord.interface_id].value,
      `assessment verification assessments.${interfaceRecord.interface_id}`,
      ["pairs"],
      ["pairs"],
      INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
    );
    const pairs = descriptorsFor(
      assessment.pairs.value,
      `assessment verification assessments.${interfaceRecord.interface_id}.pairs`,
      INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
    );
    const expectedPairs = pairRows(interfaceRecord.ends);
    const expectedPairKeys = expectedPairs.map((pair) => pair.pair_key);
    assertExactKeySet(pairs, expectedPairKeys, `assessment verification pairs for ${interfaceRecord.interface_id}`);
    for (const pair of expectedPairs) {
      const pairAssessment = exactObject(
        pairs[pair.pair_key].value,
        `assessment verification pair ${pair.pair_key}`,
        ["rules"],
        ["rules"],
        INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
      );
      const ruleDescriptors = denseArrayDescriptors(
        pairAssessment.rules.value,
        `assessment verification pair ${pair.pair_key}.rules`,
        INTERFACE_CONSISTENCY_RULES.length,
        INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
      );
      if (pairAssessment.rules.value.length !== INTERFACE_CONSISTENCY_RULES.length) {
        fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, "assessment verification pair must carry all fixed E02 rules");
      }
      for (let index = 0; index < INTERFACE_CONSISTENCY_RULES.length; index += 1) {
        const outcome = exactObject(
          ruleDescriptors[String(index)].value,
          `assessment verification pair ${pair.pair_key}.rules[${index}]`,
          ["attribute_ids", "category", "detail_code", "rule_id", "state"],
          ["attribute_ids", "category", "detail_code", "rule_id", "state"],
          INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
        );
        const rule = INTERFACE_CONSISTENCY_RULES[index];
        if (outcome.rule_id.value !== rule.rule_id || outcome.category.value !== rule.category
            || !Object.values(INTERFACE_CONSISTENCY_STATES).includes(outcome.state.value)) {
          fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, "assessment verification rule slot is not the fixed E02 order/category tuple");
        }
        safeToken(outcome.detail_code.value, `assessment verification pair ${pair.pair_key}.rules[${index}].detail_code`);
        const attributes = denseArrayDescriptors(
          outcome.attribute_ids.value,
          `assessment verification pair ${pair.pair_key}.rules[${index}].attribute_ids`,
          64,
          INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
        );
        for (let attributeIndex = 0; attributeIndex < outcome.attribute_ids.value.length; attributeIndex += 1) {
          safeToken(attributes[String(attributeIndex)].value, `assessment verification pair ${pair.pair_key}.rules[${index}].attribute_ids[${attributeIndex}]`);
        }
      }
    }
    assertSameEncoding(
      assessment.pairs.value,
      evaluateInterface(interfaceRecord, replayContext.category_applicability).pairs,
      `assessment verification outcome replay for ${interfaceRecord.interface_id}`,
    );
  }

  const assessmentBody = Object.fromEntries(ASSESSMENT_BODY_FIELDS.map((field) => [field, resultDescriptors[field].value]));
  const receipt = exactObject(
    resultDescriptors.receipt.value,
    "assessment verification receipt",
    ["assessment_digest", "domain_ruleset_digest", "envelope_provenance", "input_digest", "provenance_digest", "schema_version"],
    ["assessment_digest", "domain_ruleset_digest", "envelope_provenance", "input_digest", "provenance_digest", "schema_version"],
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
  const expectedInputDigest = digestStable(
    "soulforge.interface_consistency.domain_input.v0",
    {
      schema_version: input.schema_version,
      register_id: input.register_id,
      register_revision: input.register_revision,
      interfaces: input.interfaces,
    },
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
  const expectedProvenanceDigest = digestStable(
    "soulforge.interface_consistency.envelope_provenance.v0",
    input.envelope_provenance,
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
  if (receipt.schema_version.value !== "soulforge.interface_consistency.receipt.v0"
      || receipt.input_digest.value !== expectedInputDigest
      || receipt.assessment_digest.value !== digestInterfaceConsistencyAssessmentBody(assessmentBody)
      || receipt.provenance_digest.value !== expectedProvenanceDigest) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, "assessment verification receipt digest binding is stale or invalid");
  }
  assertSameEncoding(
    receipt.envelope_provenance.value,
    input.envelope_provenance,
    "assessment verification envelope provenance",
  );
  if (receipt.domain_ruleset_digest.value !== replayContext.domain_ruleset_digest) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID, "assessment verification domain ruleset digest is stale or invalid");
  }
  return true;
}

export function evaluateInterfaceConsistency(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
  // This pure evaluator has no authority model. Admit the exact neutral authority shape
  // before any ruleset or project-fact traversal so hostile wrappers cannot execute traps.
  assertExactEmptyPlainObject(authority, "evaluation authority", INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID);
  const admittedCutoffs = admitEvaluationCutoffs(cutoffs);
  const input = parseDomainInput(typedProjectFacts);
  const compiled = unwrapEffectiveRuleSet(effectiveRuleSet);
  const isCoreEnvelope = input.envelope_provenance.envelope_kind === "core_typed_project_facts";
  if (compiled.requires_core_typed_facts && !isCoreEnvelope) {
    fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, "Core assembly evaluation requires the exact Core Typed Facts envelope");
  }
  if (admittedCutoffs !== null) {
    if (!isCoreEnvelope
        || admittedCutoffs.valid_at !== input.admitted_cutoffs.valid_at
        || admittedCutoffs.known_at !== input.admitted_cutoffs.known_at) {
      fail(INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID, "evaluation cutoffs must exactly match admitted Core Typed Facts instants");
    }
  }
  const assessments = Object.fromEntries(input.interfaces.map((interfaceRecord) => [
    interfaceRecord.interface_id,
    evaluateInterface(interfaceRecord, compiled.category_applicability),
  ]));
  const assessment = {
    schema_version: INTERFACE_CONSISTENCY_ASSESSMENT_SCHEMA,
    domain_engine_id: "interface_consistency",
    ruleset_ref: structuredClone(INTERFACE_CONSISTENCY_RULESET_REF),
    source_packet_ref: structuredClone(INTERFACE_CONSISTENCY_SOURCE_PACKET_REF),
    register_id: input.register_id,
    register_revision: input.register_revision,
    assessments,
    execution_mode: "deterministic_only",
    external_effects: {
      files_read: 0,
      files_written: 0,
      network_calls: 0,
      rag_queries: 0,
    },
  };
  const inputDigest = digestStable(
    "soulforge.interface_consistency.domain_input.v0",
    {
      schema_version: input.schema_version,
      register_id: input.register_id,
      register_revision: input.register_revision,
      interfaces: input.interfaces,
    },
    INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
  const receipt = {
    schema_version: "soulforge.interface_consistency.receipt.v0",
    input_digest: inputDigest,
    domain_ruleset_digest: compiled.domain_ruleset_digest,
    assessment_digest: digestInterfaceConsistencyAssessmentBody(assessment),
    envelope_provenance: input.envelope_provenance,
    provenance_digest: digestStable(
      "soulforge.interface_consistency.envelope_provenance.v0",
      input.envelope_provenance,
      INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
    ),
  };
  const result = { ...assessment, receipt };
  verifyInterfaceConsistencyAssessment(typedProjectFacts, result, effectiveRuleSet);
  return deepFreeze(result);
}

export function assessInterfaceConsistency(domainInput) {
  return evaluateInterfaceConsistency(compileInterfaceConsistencyRules([]), domainInput);
}

// Quality Readiness Domain Compiler Adapter
import types from "node:util/types";
import {
  QUALITY_READINESS_RULES,
  QUALITY_READINESS_RULESET_REF,
  QUALITY_READINESS_SOURCE_PACKET_REF,
  QUALITY_READINESS_RULESET_SCHEMA,
  QUALITY_READINESS_RULESET_REVISION,
  QUALITY_READINESS_ARTIFACT_TOKENS,
  isQualityReadinessArtifactToken,
} from "../rules/quality_readiness_rules.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { AUTHORITY_FAMILIES } from "../../../core/validators/authority.mjs";
import { canonicalise, compareCodePoints } from "../../../core/validators/canonical.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import { normalizeProfileOperations } from "../../../core/interfaces/profile_operation_canon.mjs";

export const QR_COMPILER_ADAPTER_SCHEMA_VERSION = "soulforge.quality_readiness.compiler.v0";

export const QR_COMPILER_ERROR_CODES = Object.freeze({
  PROFILE_BINDINGS_INVALID: "QR_PROFILE_BINDINGS_INVALID",
  OPERATION_UNSUPPORTED: "QR_OPERATION_UNSUPPORTED",
  OPERATION_MALFORMED: "QR_OPERATION_MALFORMED",
  RULE_MALFORMED: "QR_RULE_MALFORMED",
  RULE_INVALID_FIELD: "QR_RULE_INVALID_FIELD",
  RULE_SOURCE_REF_UNBOUND: "QR_RULE_SOURCE_REF_UNBOUND",
  RULE_DUPLICATE_ID: "QR_RULE_DUPLICATE_ID",
});

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

const ALLOWED_PROFILE_BINDING_KEYS = Object.freeze([
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

const KNOWN_AUTHORITY_KEYS = new Set(AUTHORITY_FAMILIES.map((f) => f.key));

const PROTOTYPE_SENSITIVE_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "valueOf",
  "isPrototypeOf",
  "hasOwnProperty",
  "propertyIsEnumerable",
  "toLocaleString",
]);

const QR_RULE_ID_REGEX = /^QR-[A-Za-z0-9_-]{1,60}$/;

const FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\\\]+\\\\/u,
  /(?:^|[^A-Za-z0-9_])\/(?:tmp|temp|var|etc|opt|srv|usr|bin|sbin|lib|dev|proc|sys|root|home|users|mnt|media|private|data)\/\S/iu,
  /^file:\/\//iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
]);

function assertSafeString(value, fieldName = "string", maxLen = 256) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLen
      || value.normalize("NFC") !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
      `field "${fieldName}" must be a bounded non-empty NFC string without controls (length <= ${maxLen})`
    );
  }
  for (const pattern of FORBIDDEN_STRING_PATTERNS) {
    if (pattern.test(value)) {
      throw new ContractError(
        QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
        `field "${fieldName}" contains forbidden path, URI, or secret sentinel value`
      );
    }
  }
  return value;
}

function assertPlainData(value, depth = 0, ancestors = new Set()) {
  if (depth > 16) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "nested depth exceeds maximum bound");
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return;
  }
  if (typeof value === "string") {
    assertSafeString(value, "string", 2048);
    return;
  }
  if (typeof value !== "object" || (types && types.isProxy(value))) {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      "only plain JSON data is accepted; proxies, functions, and symbols are rejected"
    );
  }
  if (ancestors.has(value)) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "circular references are rejected");
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "arrays must have standard Array prototype");
      }
      const keys = Reflect.ownKeys(value);
      if (keys.some((k) => typeof k === "symbol" || (k !== "length" && !/^(0|[1-9]\d*)$/u.test(k)))) {
        throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "sparse or named array entries are rejected");
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (let i = 0; i < value.length; i += 1) {
        const d = descriptors[String(i)];
        if (!d || !Object.hasOwn(d, "value") || d.enumerable !== true) {
          throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "accessor-backed array elements are rejected");
        }
        assertPlainData(d.value, depth + 1, ancestors);
      }
      return;
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "objects must be plain objects with Object.prototype");
    }
    const keys = Reflect.ownKeys(value);
    for (const k of keys) {
      if (typeof k !== "string" || PROTOTYPE_SENSITIVE_KEYS.has(k)) {
        throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "invalid or prototype-sensitive object key");
      }
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const k of keys) {
      const d = descriptors[k];
      if (!d || !Object.hasOwn(d, "value") || d.enumerable !== true) {
        throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "accessor-backed object properties are rejected");
      }
      assertPlainData(d.value, depth + 1, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

// QR owns this admission before it asks the shared Core operation normaliser to inspect Profile
// material.  The clone closes proxies/accessors/aliases and makes the compiler result independent
// from caller identity without changing the Core contract.
function snapshotCompilerData(value, label = 'Profile input', depth = 0, seen = new WeakSet(), { allowCoreProvenanceMap = false } = {}) {
  if (depth > 16) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} exceeds the QR admission depth limit`);
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} must use finite canonical JSON numbers`);
    }
    return value;
  }
  if (!value || typeof value !== 'object' || (types && types.isProxy(value))) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} must be ordinary JSON-like data`);
  }
  if (seen.has(value)) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} may not be circular or shared`);
  }
  seen.add(value);
  const array = Array.isArray(value);
  const nullCoreProvenanceMap = allowCoreProvenanceMap
    && !array && label.endsWith('.profile_rule_provenance') && Object.getPrototypeOf(value) === null;
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) && !nullCoreProvenanceMap) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} has an unsupported prototype`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (array) {
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')
        || !Number.isSafeInteger(lengthDescriptor.value)
        || keys.length !== lengthDescriptor.value + 1
        || keys.some((key) => typeof key === 'symbol' || (key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key)))) {
      throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} must be a dense standard array`);
    }
    const output = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label}[${index}] may not be accessor-backed`);
      }
      output.push(snapshotCompilerData(descriptor.value, `${label}[${index}]`, depth + 1, seen, { allowCoreProvenanceMap }));
    }
    return output;
  }
  const output = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || PROTOTYPE_SENSITIVE_KEYS.has(key)
        || !descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} may not carry symbols, prototype keys, accessors, or hidden fields`);
    }
    Object.defineProperty(output, key, {
      value: snapshotCompilerData(descriptor.value, `${label}.${key}`, depth + 1, seen, { allowCoreProvenanceMap }),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return output;
}

function sortStrings(arr) {
  return [...arr].sort(compareCodePoints);
}

function sortArtifactTokens(arr) {
  return [...arr].sort((a, b) => {
    if (a === null && b === null) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return compareCodePoints(a, b);
  });
}

function arrayOrderRules(value) {
  const rules = {};
  const visit = (row, path = "") => {
    if (Array.isArray(row)) {
      rules[path] = "insertion_ordered";
      for (const child of row) visit(child, `${path}[]`);
    } else if (row !== null && typeof row === "object") {
      for (const [key, child] of Object.entries(row)) visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(value);
  return rules;
}

function sameExactRef(left, right) {
  return Boolean(left && right)
    && left.entity_id === right.entity_id
    && left.revision_id === right.revision_id
    && left.content_id === right.content_id
    && left.content_hash_alg === right.content_hash_alg;
}

function assertOwnDataRecord(value, label, { allowNullPrototype = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value) || (types && types.isProxy(value))) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} must be a plain data record`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && !(allowNullPrototype && prototype === null)) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} has an unsupported prototype`);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || PROTOTYPE_SENSITIVE_KEYS.has(key)
        || !descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} must not carry accessors, symbols, or prototype keys`);
    }
  }
}

function sameRule(left, right) {
  const leftKeys = left && typeof left === 'object' ? Object.keys(left).sort(compareCodePoints) : [];
  const rightKeys = right && typeof right === 'object' ? Object.keys(right).sort(compareCodePoints) : [];
  const expectedKeys = [...CANONICAL_QR_RULE_FIELDS].sort(compareCodePoints);
  if (leftKeys.length !== expectedKeys.length || rightKeys.length !== expectedKeys.length
      || !leftKeys.every((field, index) => field === expectedKeys[index])
      || !rightKeys.every((field, index) => field === expectedKeys[index])) return false;
  return CANONICAL_QR_RULE_FIELDS.every((field) => {
    if (Array.isArray(left[field]) || Array.isArray(right[field])) {
      return Array.isArray(left[field]) && Array.isArray(right[field])
        && left[field].length === right[field].length
        && left[field].every((value, index) => value === right[field][index]);
    }
    return left[field] === right[field];
  });
}

function normalisedAddOperationForRule(rule) {
  return {
    op: 'add',
    rule: {
      rule_id: rule.rule_id,
      source_ref: rule.source_ref,
      source_locator: rule.source_locator,
      source_modality: rule.source_modality,
      allowed_artifact_tokens: [...rule.allowed_artifact_tokens],
      required_authority_families: [...rule.required_authority_families],
      context_ref_fields: [...rule.context_ref_fields],
      sufficiency_fields: [...rule.sufficiency_fields],
    },
  };
}

function operationItemDigestFor(normalisedAddOperation) {
  const normalised = normalizeProfileOperations([normalisedAddOperation]);
  return sha256Hex(`soulforge.quality_readiness.operation_item.v1\n${normalised.canonical_material}`);
}

function sameOrderedStrings(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function hasAcceptedProfileSequence(profiles) {
  if (profiles.length === 1) {
    return profiles[0].order === 0
      && ['organization', 'project'].includes(profiles[0].profile_kind);
  }
  return profiles.length === 2
    && profiles[0].order === 0
    && profiles[0].profile_kind === 'organization'
    && profiles[1].order === 1
    && profiles[1].profile_kind === 'project';
}

function derivedRulesetDigestFor(allRules, profileRuleProvenance) {
  const digestMaterial = {
    schema_version: QUALITY_READINESS_RULESET_SCHEMA,
    revision: QUALITY_READINESS_RULESET_REVISION,
    source_packet_ref: QUALITY_READINESS_SOURCE_PACKET_REF,
    base_ruleset_ref: QUALITY_READINESS_RULESET_REF,
    rules: allRules.map(({ allowed_artifact_tokens, ...rule }) => ({
      ...rule,
      allowed_artifact_mappings: allowed_artifact_tokens.map((artifact_token) => (
        artifact_token === null ? { source_native: true } : { artifact_token }
      )),
    })),
    profile_rule_provenance: profileRuleProvenance,
  };
  return sha256Hex(
    `soulforge.quality_readiness.ruleset.derived.digest.v1\n${canonicalise(digestMaterial, {
      ...arrayOrderRules(digestMaterial),
      rules: "sorted_by:rule_id",
    })}`
  );
}

function validateQrRuleRow(rule, bindingSourceRefs, existingRuleIds) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.RULE_MALFORMED, "QR rule must be a plain object");
  }

  const keys = Object.keys(rule).sort(compareCodePoints);
  const expectedKeys = [...CANONICAL_QR_RULE_FIELDS].sort(compareCodePoints);
  if (keys.length !== expectedKeys.length || !keys.every((k, i) => k === expectedKeys[i])) {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.RULE_MALFORMED,
      `QR rule must contain exactly the 8 canonical fields (${CANONICAL_QR_RULE_FIELDS.join(", ")}), got [${keys.join(", ")}]`
    );
  }

  const rawRuleId = rule.rule_id;
  if (typeof rawRuleId !== "string" || !QR_RULE_ID_REGEX.test(rawRuleId) || PROTOTYPE_SENSITIVE_KEYS.has(rawRuleId)) {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
      "rule_id must match closed QR rule identifier grammar (e.g. QR-XXX-01) and cannot be a prototype property"
    );
  }
  const ruleId = assertSafeString(rawRuleId, "rule_id", 128);

  if (existingRuleIds.has(ruleId)) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.RULE_DUPLICATE_ID, "duplicate QR rule_id");
  }

  const sourceRef = assertSafeString(rule.source_ref, "source_ref", 256);
  if (!bindingSourceRefs.includes(sourceRef)) {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.RULE_SOURCE_REF_UNBOUND,
      "rule source_ref must be explicitly present in profile binding source_refs"
    );
  }

  const sourceLocator = assertSafeString(rule.source_locator, "source_locator", 256);
  const sourceModality = assertSafeString(rule.source_modality, "source_modality", 512);

  // allowed_artifact_tokens (must be strictly sorted in canonical order: null first, then compareCodePoints)
  if (!Array.isArray(rule.allowed_artifact_tokens)) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD, "allowed_artifact_tokens must be an array");
  }
  for (let i = 0; i < rule.allowed_artifact_tokens.length; i += 1) {
    const token = rule.allowed_artifact_tokens[i];
    if (token !== null && !isQualityReadinessArtifactToken(token)) {
      throw new ContractError(
        QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
        `unknown artifact token in allowed_artifact_tokens; known tokens are [null, ${QUALITY_READINESS_ARTIFACT_TOKENS.join(", ")}]`
      );
    }
    if (i > 0) {
      const prev = rule.allowed_artifact_tokens[i - 1];
      const cmp = (prev === null && token === null) ? 0 : (prev === null ? -1 : (token === null ? 1 : compareCodePoints(prev, token)));
      if (cmp >= 0) {
        throw new ContractError(
          QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
          "allowed_artifact_tokens must be strictly sorted in canonical order without duplicates"
        );
      }
    }
  }

  // required_authority_families (must be strictly sorted by compareCodePoints)
  if (!Array.isArray(rule.required_authority_families)) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD, "required_authority_families must be an array");
  }
  for (let i = 0; i < rule.required_authority_families.length; i += 1) {
    const fam = rule.required_authority_families[i];
    if (typeof fam !== "string" || !fam.trim() || !KNOWN_AUTHORITY_KEYS.has(fam)) {
      throw new ContractError(
        QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
        "unregistered authority family in required_authority_families"
      );
    }
    if (i > 0) {
      const prev = rule.required_authority_families[i - 1];
      if (compareCodePoints(prev, fam) >= 0) {
        throw new ContractError(
          QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
          "required_authority_families must be strictly sorted in canonical order without duplicates"
        );
      }
    }
  }

  // context_ref_fields (must be strictly sorted by compareCodePoints)
  if (!Array.isArray(rule.context_ref_fields)) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD, "context_ref_fields must be an array");
  }
  for (let i = 0; i < rule.context_ref_fields.length; i += 1) {
    const f = rule.context_ref_fields[i];
    assertSafeString(f, "context_ref_fields element", 128);
    if (i > 0) {
      const prev = rule.context_ref_fields[i - 1];
      if (compareCodePoints(prev, f) >= 0) {
        throw new ContractError(
          QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
          "context_ref_fields must be strictly sorted in canonical order without duplicates"
        );
      }
    }
  }

  // sufficiency_fields (must be strictly sorted by compareCodePoints)
  if (!Array.isArray(rule.sufficiency_fields)) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD, "sufficiency_fields must be an array");
  }
  for (let i = 0; i < rule.sufficiency_fields.length; i += 1) {
    const f = rule.sufficiency_fields[i];
    assertSafeString(f, "sufficiency_fields element", 128);
    if (i > 0) {
      const prev = rule.sufficiency_fields[i - 1];
      if (compareCodePoints(prev, f) >= 0) {
        throw new ContractError(
          QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
          "sufficiency_fields must be strictly sorted in canonical order without duplicates"
        );
      }
    }
  }

  return Object.freeze({
    rule_id: ruleId,
    source_ref: sourceRef,
    source_locator: sourceLocator,
    source_modality: sourceModality,
    allowed_artifact_tokens: Object.freeze([...rule.allowed_artifact_tokens]),
    required_authority_families: Object.freeze([...rule.required_authority_families]),
    context_ref_fields: Object.freeze([...rule.context_ref_fields]),
    sufficiency_fields: Object.freeze([...rule.sufficiency_fields]),
  });
}

function validateQrProfileBindingStrict(rawBinding, expectedOrder, existingKinds) {
  assertPlainData(rawBinding);

  const keys = Object.keys(rawBinding).sort(compareCodePoints);
  const expectedKeys = [...ALLOWED_PROFILE_BINDING_KEYS].sort(compareCodePoints);
  if (keys.length !== expectedKeys.length || !keys.every((k, i) => k === expectedKeys[i])) {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      `profile binding has unexpected or missing keys: [${keys.join(", ")}]`
    );
  }

  if (rawBinding.schema_version !== "soulforge.engineering_profile_binding.v0") {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      `schema_version must be "soulforge.engineering_profile_binding.v0", got "${rawBinding.schema_version}"`
    );
  }

  const kind = rawBinding.profile_kind;
  if (kind !== "organization" && kind !== "project") {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      `profile_kind must be "organization" or "project", got "${kind}"`
    );
  }
  if (existingKinds.has(kind)) {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      `duplicate profile_kind "${kind}" is not allowed`
    );
  }
  if (kind === "organization") {
    if (existingKinds.has("project")) {
      throw new ContractError(
        QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        "organization profile must precede project profile"
      );
    }
    if (expectedOrder !== 0 || rawBinding.order !== 0) {
      throw new ContractError(
        QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        `organization profile order must be 0, got ${rawBinding.order}`
      );
    }
  }
  if (kind === "project") {
    const requiredOrder = existingKinds.has("organization") ? 1 : 0;
    if (expectedOrder !== requiredOrder || rawBinding.order !== requiredOrder) {
      throw new ContractError(
        QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        `project profile order must be ${requiredOrder}, got ${rawBinding.order}`
      );
    }
  }

  if (rawBinding.domain_engine_id !== "quality_readiness") {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      `domain_engine_id must be "quality_readiness", got "${rawBinding.domain_engine_id}"`
    );
  }

  const profileId = assertSafeString(rawBinding.profile_id, "profile_id", 128);
  const revision = assertSafeString(rawBinding.revision_or_hash, "revision_or_hash", 128);
  if (revision === "unversioned") {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      `revision_or_hash cannot be "unversioned"`
    );
  }
  const extendsBase = assertSafeString(rawBinding.extends_or_base_pin, "extends_or_base_pin", 128);

  if (!Array.isArray(rawBinding.operations)) {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      "operations must be an array"
    );
  }

  // F2: Recompute and verify operation_digest through the one Core helper. QR must not hold a
  // second opinion on Profile operation canonicalisation, and the normalised operations keep
  // every `null` a rule bound on purpose - a QR rule reads `[null]` as source-native evidence.
  const normalizedOperations = normalizeProfileOperations(rawBinding.operations);
  const expectedOperationDigest = normalizedOperations.operation_digest;

  if (typeof rawBinding.operation_digest !== "string" || rawBinding.operation_digest !== expectedOperationDigest) {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      "profile binding operation_digest does not match canonical operations digest"
    );
  }

  if (!Array.isArray(rawBinding.source_refs) || rawBinding.source_refs.length === 0) {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      "source_refs must be a non-empty array of safe source paths"
    );
  }
  const sourceRefSet = new Set();
  const validSourceRefs = [];
  for (const ref of rawBinding.source_refs) {
    const s = assertSafeString(ref, "source_ref", 256);
    if (sourceRefSet.has(s)) {
      throw new ContractError(
        QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        "duplicate source_ref in profile binding"
      );
    }
    sourceRefSet.add(s);
    validSourceRefs.push(s);
  }

  return {
    schema_version: rawBinding.schema_version,
    profile_kind: kind,
    profile_id: profileId,
    domain_engine_id: "quality_readiness",
    revision_or_hash: revision,
    extends_or_base_pin: extendsBase,
    operation_digest: expectedOperationDigest,
    source_refs: validSourceRefs,
    order: rawBinding.order,
    operations: normalizedOperations.operations,
  };
}

export function compileQualityReadinessRules(profileBindings = [], options = {}) {
  const admittedProfileBindings = snapshotCompilerData(profileBindings, 'profileBindings');
  if (!Array.isArray(admittedProfileBindings)) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profileBindings must be an array");
  }

  const existingKinds = new Set();
  const existingRuleIds = new Set(QUALITY_READINESS_RULES.map((r) => r.rule_id));
  const addedRules = [];
  const profileRuleProvenance = Object.create(null);

  for (let bindingIndex = 0; bindingIndex < admittedProfileBindings.length; bindingIndex += 1) {
    const raw = admittedProfileBindings[bindingIndex];
    const binding = validateQrProfileBindingStrict(raw, bindingIndex, existingKinds);
    existingKinds.add(binding.profile_kind);

    const sourceRefs = binding.source_refs;
    const operations = binding.operations;

    for (let opIndex = 0; opIndex < operations.length; opIndex += 1) {
      const op = operations[opIndex];
      assertPlainData(op);

      if (!op || typeof op !== "object" || Array.isArray(op)) {
        throw new ContractError(QR_COMPILER_ERROR_CODES.OPERATION_MALFORMED, "operation must be a plain object");
      }

      if (typeof op.op !== "string" || !op.op.trim()) {
        throw new ContractError(QR_COMPILER_ERROR_CODES.OPERATION_MALFORMED, "operation op must be a non-empty string");
      }

      if (op.op !== "add") {
        throw new ContractError(
          QR_COMPILER_ERROR_CODES.OPERATION_UNSUPPORTED,
          `unsupported QR operation kind "${op.op}"; QR Profile compiler supports only "add"`
        );
      }

      const opKeys = Object.keys(op);
      if (opKeys.length !== 2 || !opKeys.includes("op") || !opKeys.includes("rule")) {
        throw new ContractError(
          QR_COMPILER_ERROR_CODES.OPERATION_MALFORMED,
          `QR operation must have exactly keys ["op", "rule"], got [${opKeys.join(", ")}]`
        );
      }

      const validatedRule = validateQrRuleRow(op.rule, sourceRefs, existingRuleIds);
      existingRuleIds.add(validatedRule.rule_id);
      addedRules.push(validatedRule);

      const normalisedAddOperation = normalisedAddOperationForRule(validatedRule);
      const opItemDigest = operationItemDigestFor(normalisedAddOperation);

      Object.defineProperty(profileRuleProvenance, validatedRule.rule_id, {
        value: Object.freeze({
          profile_kind: binding.profile_kind,
          profile_id: binding.profile_id,
          revision_or_hash: binding.revision_or_hash,
          extends_or_base_pin: binding.extends_or_base_pin,
          operation_digest: binding.operation_digest,
          operation_item_digest: opItemDigest,
          operation_index: opIndex,
          source_refs: Object.freeze([...sourceRefs]),
          order: binding.order,
        }),
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
  }

  // F1 Closure: Assert every added rule has exactly one own provenance record
  if (addedRules.length !== Object.keys(profileRuleProvenance).length) {
    throw new ContractError(
      QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      "provenance record count does not match added rules count"
    );
  }
  for (const r of addedRules) {
    if (!Object.prototype.hasOwnProperty.call(profileRuleProvenance, r.rule_id) || !profileRuleProvenance[r.rule_id]) {
      throw new ContractError(
        QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        "every added rule must have own provenance record"
      );
    }
  }

  // If no added rules, preserve exact base behavior
  if (addedRules.length === 0) {
    const rules = [...QUALITY_READINESS_RULES];
    return {
      effective_rule_set: {
        schema_version: QUALITY_READINESS_RULESET_SCHEMA,
        ruleset_ref: QUALITY_READINESS_RULESET_REF,
        source_packet_ref: QUALITY_READINESS_SOURCE_PACKET_REF,
        rules,
      },
      rule_count: rules.length,
      profile_rule_provenance: Object.freeze(Object.create(null)),
    };
  }

  // Combine base rules and added rules, sorted deterministically by rule_id using compareCodePoints
  const allRules = [...QUALITY_READINESS_RULES, ...addedRules].sort((a, b) => (
    compareCodePoints(a.rule_id, b.rule_id)
  ));

  const frozenProvenance = Object.freeze(profileRuleProvenance);

  const derivedRulesetDigest = derivedRulesetDigestFor(allRules, frozenProvenance);

  const derivedRulesetRef = Object.freeze({
    entity_id: "quality-readiness-ruleset-derived-v0",
    revision_id: `derived:${derivedRulesetDigest.slice(0, 16)}`,
    content_id: `sha256:${derivedRulesetDigest}`,
    content_hash_alg: "sha256",
  });

  return {
    effective_rule_set: {
      schema_version: QUALITY_READINESS_RULESET_SCHEMA,
      ruleset_ref: derivedRulesetRef,
      source_packet_ref: QUALITY_READINESS_SOURCE_PACKET_REF,
      rules: allRules,
      profile_rule_provenance: frozenProvenance,
    },
    rule_count: allRules.length,
    profile_rule_provenance: frozenProvenance,
  };
}

/**
 * Verifies a compiler-shaped E01 ruleset without creating a second Core contract. The evaluator
 * uses this boundary before it accepts a derived Profile result, so a caller cannot substitute a
 * hand-written ruleset ref or omit the per-rule Profile provenance that produced it.
 */
export function verifyQualityReadinessEffectiveRuleSet(effectiveRuleSet) {
  effectiveRuleSet = snapshotCompilerData(effectiveRuleSet, 'effective rule set', 0, new WeakSet(), {
    allowCoreProvenanceMap: true,
  });
  assertOwnDataRecord(effectiveRuleSet, "effective rule set");
  const keys = Object.keys(effectiveRuleSet).sort(compareCodePoints);
  const baseKeys = ["rules", "ruleset_ref", "schema_version", "source_packet_ref"].sort(compareCodePoints);
  const derivedKeys = [...baseKeys, "profile_rule_provenance"].sort(compareCodePoints);
  const isBaseShape = keys.length === baseKeys.length && keys.every((key, index) => key === baseKeys[index]);
  const isDerivedShape = keys.length === derivedKeys.length && keys.every((key, index) => key === derivedKeys[index]);
  if (!isBaseShape && !isDerivedShape) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      "effective rule set has an unexpected key set");
  }
  if (effectiveRuleSet.schema_version !== QUALITY_READINESS_RULESET_SCHEMA
      || !sameExactRef(effectiveRuleSet.source_packet_ref, QUALITY_READINESS_SOURCE_PACKET_REF)
      || !Array.isArray(effectiveRuleSet.rules)) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      "effective rule set is not bound to the exact E01 schema and source packet");
  }

  if (isBaseShape) {
    if (!sameExactRef(effectiveRuleSet.ruleset_ref, QUALITY_READINESS_RULESET_REF)
        || effectiveRuleSet.rules.length !== QUALITY_READINESS_RULES.length
        || !effectiveRuleSet.rules.every((rule, index) => sameRule(rule, QUALITY_READINESS_RULES[index]))) {
      throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        "base effective rule set does not exactly match the accepted E01 ruleset");
    }
    return Object.freeze({
      kind: "base",
      rules: effectiveRuleSet.rules,
      ruleset_ref: effectiveRuleSet.ruleset_ref,
      source_packet_ref: effectiveRuleSet.source_packet_ref,
      profile_rule_provenance: null,
    });
  }

  const provenance = effectiveRuleSet.profile_rule_provenance;
  assertOwnDataRecord(provenance, "profile_rule_provenance", { allowNullPrototype: true });
  let priorRuleId = null;
  const seenRuleIds = new Set(QUALITY_READINESS_RULES.map((rule) => rule.rule_id));
  const expectedProvenanceIds = [];
  const baseById = new Map(QUALITY_READINESS_RULES.map((rule) => [rule.rule_id, rule]));
  const seenBaseIds = new Set();
  const derivedRules = [];
  for (const rule of effectiveRuleSet.rules) {
    if (priorRuleId !== null && compareCodePoints(priorRuleId, rule?.rule_id ?? "") >= 0) {
      throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        "effective rules must be sorted uniquely by rule_id");
    }
    priorRuleId = rule?.rule_id ?? null;
    const baseRule = baseById.get(rule?.rule_id);
    if (baseRule) {
      if (!sameRule(rule, baseRule)) {
        throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
          "derived rule set must retain each accepted E01 base rule exactly");
      }
      seenBaseIds.add(rule.rule_id);
    } else {
      derivedRules.push(rule);
    }
  }
  if (derivedRules.length === 0 || seenBaseIds.size !== QUALITY_READINESS_RULES.length) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      "derived rule set must retain the complete accepted E01 base and at least one derived rule");
  }

  const profileOperations = new Map();
  for (const rule of derivedRules) {
    const provenanceRow = provenance[rule?.rule_id];
    if (!provenanceRow) {
      throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        "every derived E01 rule requires its own Profile provenance row");
    }
    assertOwnDataRecord(provenanceRow, `profile_rule_provenance.${rule.rule_id}`);
    const provenanceKeys = Object.keys(provenanceRow).sort(compareCodePoints);
    const expectedKeys = [
      "extends_or_base_pin", "operation_digest", "operation_index", "operation_item_digest", "order",
      "profile_id", "profile_kind", "revision_or_hash", "source_refs",
    ].sort(compareCodePoints);
    if (provenanceKeys.length !== expectedKeys.length
        || !provenanceKeys.every((key, index) => key === expectedKeys[index])) {
      throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        "derived rule Profile provenance must use the exact compiler trace fields");
    }
    if (!["organization", "project"].includes(provenanceRow.profile_kind)
        || !Number.isSafeInteger(provenanceRow.order)
        || provenanceRow.order < 0
        || !Number.isSafeInteger(provenanceRow.operation_index)
        || provenanceRow.operation_index < 0
        || !/^[a-f0-9]{64}$/u.test(provenanceRow.operation_digest)
        || !/^[a-f0-9]{64}$/u.test(provenanceRow.operation_item_digest)
        || !Array.isArray(provenanceRow.source_refs)
        || provenanceRow.source_refs.length === 0) {
      throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        "derived rule Profile provenance is incomplete or malformed");
    }
    for (const field of ["profile_id", "revision_or_hash", "extends_or_base_pin"]) {
      assertSafeString(provenanceRow[field], `profile provenance ${field}`, 128);
    }
    const sourceRefs = [];
    const seenSourceRefs = new Set();
    for (const sourceRef of provenanceRow.source_refs) {
      const source = assertSafeString(sourceRef, "profile provenance source_ref", 256);
      if (seenSourceRefs.has(source)) {
        throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
          "derived rule Profile provenance must not duplicate source refs");
      }
      seenSourceRefs.add(source);
      sourceRefs.push(source);
    }
    validateQrRuleRow(rule, sourceRefs, seenRuleIds);
    const normalisedAddOperation = normalisedAddOperationForRule(rule);
    if (provenanceRow.operation_item_digest !== operationItemDigestFor(normalisedAddOperation)) {
      throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        "derived rule Profile operation item digest does not match exact normalized add material");
    }
    const profileKey = `${provenanceRow.profile_kind}\u001f${provenanceRow.profile_id}\u001f${provenanceRow.order}`;
    const profileState = profileOperations.get(profileKey) ?? {
      profile_kind: provenanceRow.profile_kind,
      profile_id: provenanceRow.profile_id,
      order: provenanceRow.order,
      revision_or_hash: provenanceRow.revision_or_hash,
      extends_or_base_pin: provenanceRow.extends_or_base_pin,
      operation_digest: provenanceRow.operation_digest,
      source_refs: sourceRefs,
      operations_by_index: new Map(),
    };
    if (profileState.revision_or_hash !== provenanceRow.revision_or_hash
        || profileState.extends_or_base_pin !== provenanceRow.extends_or_base_pin
        || profileState.operation_digest !== provenanceRow.operation_digest
        || !sameOrderedStrings(profileState.source_refs, sourceRefs)
        || profileState.operations_by_index.has(provenanceRow.operation_index)) {
      throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        "derived rule Profile provenance cannot duplicate, substitute, or cross-bind Profile operations");
    }
    profileState.operations_by_index.set(provenanceRow.operation_index, normalisedAddOperation);
    profileOperations.set(profileKey, profileState);
    expectedProvenanceIds.push(rule.rule_id);
  }

  const actualProvenanceIds = Object.keys(provenance).sort(compareCodePoints);
  const expectedIds = [...expectedProvenanceIds].sort(compareCodePoints);
  if (actualProvenanceIds.length !== expectedIds.length
      || !actualProvenanceIds.every((ruleId, index) => ruleId === expectedIds[index])) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      "profile provenance must cover exactly the derived E01 rules");
  }

  for (const profileState of profileOperations.values()) {
    const orderedIndexes = [...profileState.operations_by_index.keys()].sort((left, right) => left - right);
    if (!orderedIndexes.every((operationIndex, index) => operationIndex === index)) {
      throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        "derived rule Profile operation indexes must be complete, unique, and sequential");
    }
    const operations = orderedIndexes.map((operationIndex) => profileState.operations_by_index.get(operationIndex));
    if (normalizeProfileOperations(operations).operation_digest !== profileState.operation_digest) {
      throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        "derived rule Profile operation digest does not match rebuilt ordered operations");
    }
  }
  if (!hasAcceptedProfileSequence(
    [...profileOperations.values()].sort((left, right) => left.order - right.order),
  )) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      'derived rule Profile provenance has an unsupported Profile topology');
  }

  const derivedDigest = derivedRulesetDigestFor(effectiveRuleSet.rules, provenance);
  const expectedRulesetRef = {
    entity_id: "quality-readiness-ruleset-derived-v0",
    revision_id: `derived:${derivedDigest.slice(0, 16)}`,
    content_id: `sha256:${derivedDigest}`,
    content_hash_alg: "sha256",
  };
  if (!sameExactRef(effectiveRuleSet.ruleset_ref, expectedRulesetRef)) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      "derived effective ruleset ref does not match the compiler digest");
  }
  return Object.freeze({
    kind: "derived",
    rules: effectiveRuleSet.rules,
    ruleset_ref: effectiveRuleSet.ruleset_ref,
    source_packet_ref: effectiveRuleSet.source_packet_ref,
    profile_rule_provenance: provenance,
  });
}

export const qualityReadinessCompilerAdapter = Object.freeze({
  domain_engine_id: "quality_readiness",
  revision: "soulforge.quality_readiness.compiler.v0",
  compile(profileBindings = [], options = {}) {
    return compileQualityReadinessRules(profileBindings, options);
  },
  evaluate(effectiveRuleSet, typedProjectFacts, authority, cutoffs) {
    throw new ContractError(
      "QR_EVALUATION_EVALUATOR_REQUIRED",
      "Quality readiness evaluation must be performed via qualityReadinessAdapter with bound evaluation interface"
    );
  },
});

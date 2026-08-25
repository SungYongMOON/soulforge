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

function withoutNulls(value) {
  if (Array.isArray(value)) return value.filter((v) => v !== null).map(withoutNulls);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== null) out[key] = withoutNulls(child);
    }
    return out;
  }
  return value;
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

  // F2: Recompute and verify operation_digest
  const cleanOps = withoutNulls(rawBinding.operations);
  const canonicalOps = canonicalise(cleanOps, arrayOrderRules(cleanOps));
  const expectedOperationDigest = sha256Hex(`soulforge.profile_operations.v0\n${canonicalOps}`);

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
    operations: rawBinding.operations,
  };
}

export function compileQualityReadinessRules(profileBindings = [], options = {}) {
  if (!Array.isArray(profileBindings)) {
    throw new ContractError(QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profileBindings must be an array");
  }

  const existingKinds = new Set();
  const existingRuleIds = new Set(QUALITY_READINESS_RULES.map((r) => r.rule_id));
  const addedRules = [];
  const profileRuleProvenance = Object.create(null);

  for (let bindingIndex = 0; bindingIndex < profileBindings.length; bindingIndex += 1) {
    const raw = profileBindings[bindingIndex];
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

      const opForDigest = {
        op: op.op,
        rule: {
          rule_id: validatedRule.rule_id,
          source_ref: validatedRule.source_ref,
          source_locator: validatedRule.source_locator,
          source_modality: validatedRule.source_modality,
          allowed_artifact_mappings: validatedRule.allowed_artifact_tokens.map((token) => (
            token === null ? { source_native: true } : { artifact_token: token }
          )),
          required_authority_families: validatedRule.required_authority_families,
          context_ref_fields: validatedRule.context_ref_fields,
          sufficiency_fields: validatedRule.sufficiency_fields,
        },
      };
      const opItemCanonical = canonicalise(opForDigest, arrayOrderRules(opForDigest));
      const opItemDigest = sha256Hex(`soulforge.quality_readiness.operation_item.v0\n${opItemCanonical}`);

      Object.defineProperty(profileRuleProvenance, validatedRule.rule_id, {
        value: Object.freeze({
          profile_kind: binding.profile_kind,
          profile_id: binding.profile_id,
          revision_or_hash: binding.revision_or_hash,
          extends_or_base_pin: binding.extends_or_base_pin,
          operation_digest: binding.operation_digest,
          operation_item_digest: opItemDigest,
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
    profile_rule_provenance: frozenProvenance,
  };

  const derivedRulesetDigest = sha256Hex(
    `soulforge.quality_readiness.ruleset.derived.digest.v0\n${canonicalise(digestMaterial, {
      ...arrayOrderRules(digestMaterial),
      rules: "sorted_by:rule_id",
    })}`
  );

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

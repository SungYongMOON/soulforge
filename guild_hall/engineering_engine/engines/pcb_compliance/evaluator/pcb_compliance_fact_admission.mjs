// PCB Core typed-facts admission — the LEAF shared by the domain evaluator
// and its adapter. Extracted from pcb_compliance_evaluator_adapter.mjs on
// 2026-08-30 to cut the evaluator<->adapter import cycle: the evaluator needs
// only this admission surface, never the adapter (which registers itself and
// imports the evaluator). This module imports nothing from either of them.
import types from "node:util/types";

import { AUTHORITY_FAMILIES } from "../../../core/validators/authority.mjs";
import { canonicalise, compareCodePoints, inspectInstant } from "../../../core/validators/canonical.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import { arrayOrderRules, withoutNulls } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { assertPublicSafeString, isPublicSafeString } from "../rules/pcb_compliance_rules.mjs";

export const PCB_TYPED_FACTS_ERROR_CODE = "PCB_TYPED_FACTS_INVALID";

const AUTHORITY_KEYS = new Set(AUTHORITY_FAMILIES.map((family) => family.key));

const TYPED_FACTS_SCHEMA = "soulforge.typed_project_facts.v0";
const PROJECT_BINDING_SCHEMA = "soulforge.project_binding.v0";
const TYPED_FACTS_FIELDS = Object.freeze([
  "facts",
  "facts_digest",
  "known_at",
  "project_binding_ref",
  "schema_version",
  "valid_at",
]);
const FACT_FIELDS = Object.freeze(["fact_type", "request"]);
const PROJECT_BINDING_REQUIRED_FIELDS = Object.freeze([
  "binding_revision_hash",
  "domain_engine_id",
  "project_id",
  "schema_version",
  "source_manifest_ref",
]);
const PROJECT_BINDING_OPTIONAL_FIELDS = Object.freeze([
  "authority_family",
  "document_refs",
  "known_at",
  "valid_at",
]);
const REQUEST_FIELDS = Object.freeze(["binding", "cutoffs", "domain_input", "schema_version"]);
const REQUEST_BINDING_FIELDS = Object.freeze(["domain_engine_id", "ruleset_ref", "source_packet_ref"]);
const REQUEST_CUTOFF_FIELDS = Object.freeze(["known_at", "valid_at"]);
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:/#-]{0,255}$/u;
const FORBIDDEN_STRING = /(?:^[A-Za-z]:[\\/]|^\\\\|^\/(?:etc|var|usr|home|root|tmp)\/|secret|password|bearer|api[_-]?key|token)/iu;

function refuse(message) {
  throw new ContractError(PCB_TYPED_FACTS_ERROR_CODE, message);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function snapshotTypedFacts(value, label = "typed facts", ancestors = new Set(), seen = new Set(), depth = 0) {
  if (depth > 24) refuse(`${label} exceeds maximum depth`);
  if (value === null || typeof value !== "object") {
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
    refuse(`${label} contains an unsupported value`);
  }
  if (types.isProxy(value)) refuse(`${label} must not be a proxy`);
  if (ancestors.has(value)) refuse(`${label} is cyclic`);
  if (seen.has(value)) refuse(`${label} aliases another supplied object`);
  const isArray = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype)) {
    refuse(`${label} must have a standard prototype`);
  }
  ancestors.add(value);
  seen.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.some((key) => typeof key !== "string")) refuse(`${label} contains a symbol property`);
    const output = isArray ? [] : {};
    if (isArray) {
      const itemKeys = ownKeys.filter((key) => key !== "length");
      if (value.length > 128 || itemKeys.length !== value.length) refuse(`${label} must be a bounded dense array`);
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
          refuse(`${label} contains an accessor or sparse array item`);
        }
        output.push(snapshotTypedFacts(descriptor.value, `${label}[${index}]`, ancestors, seen, depth + 1));
      }
    } else {
      for (const key of ownKeys) {
        const descriptor = descriptors[key];
        if (["__proto__", "prototype", "constructor"].includes(key) || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
          refuse(`${label} contains an unsafe property`);
        }
        output[key] = snapshotTypedFacts(descriptor.value, `${label}.${key}`, ancestors, seen, depth + 1);
      }
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) refuse(`${label} must be a plain object`);
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (actualKeys.length !== expectedKeys.length || !actualKeys.every((key, index) => key === expectedKeys[index])) {
    refuse(`${label} has an invalid closed key set`);
  }
}

function assertRequiredAndOptionalKeys(value, required, optional, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) refuse(`${label} must be a plain object`);
  const keys = Object.keys(value);
  for (const key of required) if (!Object.hasOwn(value, key)) refuse(`${label} is missing ${key}`);
  if (keys.some((key) => !required.includes(key) && !optional.includes(key))) refuse(`${label} has an unknown field`);
}

function assertSafeToken(value, label) {
  if (typeof value !== "string" || !SAFE_TOKEN.test(value) || FORBIDDEN_STRING.test(value) || !isPublicSafeString(value)) {
    refuse(`${label} must be a bounded public-safe token`);
  }
  return value;
}

function validateInstant(value, label) {
  if (!inspectInstant(value).valid) {
    refuse(`${label} must be a canonical UTC instant`);
  }
  return value;
}

function validateSortedUniqueTokens(values, label) {
  if (!Array.isArray(values)) refuse(`${label} must be an array`);
  const tokens = values.map((value) => {
    assertSafeToken(value, `${label} item`);
    assertPublicSafeString(value, `${label} item`, PCB_TYPED_FACTS_ERROR_CODE);
    return value;
  });
  for (let index = 1; index < tokens.length; index += 1) {
    if (compareCodePoints(tokens[index - 1], tokens[index]) >= 0) {
      refuse(`${label} must be strictly code-point sorted and duplicate-free`);
    }
  }
  return tokens;
}

function validateProjectBindingRef(raw) {
  assertRequiredAndOptionalKeys(raw, PROJECT_BINDING_REQUIRED_FIELDS, PROJECT_BINDING_OPTIONAL_FIELDS, "project_binding_ref");
  if (raw.schema_version !== PROJECT_BINDING_SCHEMA) refuse("project_binding_ref schema_version is invalid");
  if (raw.domain_engine_id !== "pcb_compliance") refuse("project_binding_ref domain_engine_id is invalid");
  const binding = {
    schema_version: raw.schema_version,
    project_id: assertSafeToken(raw.project_id, "project_binding_ref.project_id"),
    domain_engine_id: raw.domain_engine_id,
    binding_revision_hash: assertSafeToken(raw.binding_revision_hash, "project_binding_ref.binding_revision_hash"),
    source_manifest_ref: assertSafeToken(raw.source_manifest_ref, "project_binding_ref.source_manifest_ref"),
  };
  if (Object.hasOwn(raw, "authority_family")) {
    assertSafeToken(raw.authority_family, "project_binding_ref.authority_family");
    if (!AUTHORITY_KEYS.has(raw.authority_family)) {
      refuse("project_binding_ref authority_family is unknown");
    }
    binding.authority_family = raw.authority_family;
  }
  if (Object.hasOwn(raw, "document_refs")) {
    binding.document_refs = validateSortedUniqueTokens(raw.document_refs, "project_binding_ref.document_refs");
  }
  if (Object.hasOwn(raw, "valid_at")) binding.valid_at = validateInstant(raw.valid_at, "project_binding_ref.valid_at");
  if (Object.hasOwn(raw, "known_at")) binding.known_at = validateInstant(raw.known_at, "project_binding_ref.known_at");
  return binding;
}

export function calculatePcbCoreTypedFactsDigest(facts) {
  const cleanFacts = withoutNulls(facts);
  return sha256Hex(`soulforge.project_observations.v0\n${canonicalise(cleanFacts, arrayOrderRules(cleanFacts))}`);
}

function validateMappedRequest(raw, binding, validAt, knownAt) {
  assertExactKeys(raw, REQUEST_FIELDS, "PCB request fact");
  if (raw.schema_version !== "soulforge.pcb_compliance.request.v0") refuse("PCB request fact schema_version is invalid");
  assertExactKeys(raw.binding, REQUEST_BINDING_FIELDS, "PCB request fact binding");
  if (raw.binding.domain_engine_id !== binding.domain_engine_id) refuse("PCB request domain does not match project_binding_ref");
  assertExactKeys(raw.cutoffs, REQUEST_CUTOFF_FIELDS, "PCB request fact cutoffs");
  const requestValidAt = validateInstant(raw.cutoffs.valid_at, "PCB request fact cutoffs.valid_at");
  const requestKnownAt = validateInstant(raw.cutoffs.known_at, "PCB request fact cutoffs.known_at");
  if (requestValidAt !== validAt || requestKnownAt !== knownAt) refuse("PCB request cutoffs do not match typed facts cutoffs");
  return raw;
}

export function validateEvaluatorAuthority(rawAuthority) {
  if (rawAuthority === undefined) return;
  const authority = snapshotTypedFacts(rawAuthority, "evaluator authority");
  if (!authority || typeof authority !== "object" || Array.isArray(authority)) {
    refuse("evaluator authority must be an empty plain object");
  }
  if (Object.keys(authority).length > 0) {
    refuse("evaluator authority must be empty; PCB compliance accepts no execution or action authority");
  }
}

export function validateEvaluatorCutoffs(rawCutoffs, provenance) {
  if (rawCutoffs === undefined) return;
  const cutoffs = snapshotTypedFacts(rawCutoffs, "evaluator cutoffs");
  if (!cutoffs || typeof cutoffs !== "object" || Array.isArray(cutoffs)) {
    refuse("evaluator cutoffs must be a plain object");
  }
  if (Object.keys(cutoffs).length === 0) return;
  assertExactKeys(cutoffs, REQUEST_CUTOFF_FIELDS, "evaluator cutoffs");
  if (validateInstant(cutoffs.valid_at, "evaluator cutoffs.valid_at") !== provenance.valid_at
    || validateInstant(cutoffs.known_at, "evaluator cutoffs.known_at") !== provenance.known_at) {
    refuse("evaluator cutoffs do not match admitted typed facts");
  }
}

export function admitPcbCoreTypedFacts(rawTypedFacts) {
  const typedFacts = snapshotTypedFacts(rawTypedFacts, "PCB Core TypedProjectFacts");
  assertExactKeys(typedFacts, TYPED_FACTS_FIELDS, "PCB Core TypedProjectFacts");
  if (typedFacts.schema_version !== TYPED_FACTS_SCHEMA) refuse("typed facts schema_version is invalid");
  const binding = validateProjectBindingRef(typedFacts.project_binding_ref);
  const validAt = validateInstant(typedFacts.valid_at, "typed facts valid_at");
  const knownAt = validateInstant(typedFacts.known_at, "typed facts known_at");
  if (Date.parse(knownAt) < Date.parse(validAt)) refuse("typed facts known_at precedes valid_at");
  if (binding.valid_at && binding.valid_at !== validAt) refuse("project_binding_ref valid_at does not match typed facts");
  if (binding.known_at && binding.known_at !== knownAt) refuse("project_binding_ref known_at does not match typed facts");
  if (!Array.isArray(typedFacts.facts) || typedFacts.facts.length !== 1) refuse("typed facts must contain exactly one PCB request fact");
  const fact = typedFacts.facts[0];
  assertExactKeys(fact, FACT_FIELDS, "PCB request fact");
  if (fact.fact_type !== "pcb_compliance_evaluation_request") refuse("PCB request fact identity is invalid");
  const request = validateMappedRequest(fact.request, binding, validAt, knownAt);
  const expectedDigest = calculatePcbCoreTypedFactsDigest(typedFacts.facts);
  if (typeof typedFacts.facts_digest !== "string" || !SHA256_HEX.test(typedFacts.facts_digest) || typedFacts.facts_digest !== expectedDigest) {
    refuse("typed facts digest does not match the exact facts array");
  }
  const provenance = {
    project_binding_ref: binding,
    facts_digest: expectedDigest,
    valid_at: validAt,
    known_at: knownAt,
  };
  return deepFreeze({ request, provenance });
}


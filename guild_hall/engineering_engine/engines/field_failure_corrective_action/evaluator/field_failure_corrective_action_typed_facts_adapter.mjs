// Exact Core TypedProjectFacts admission for FFCA. This module is intentionally package-local:
// it consumes Core envelopes and binds them to FFCA's already-validated request/result contract
// without changing the shared Core.
import types from "node:util/types";

import { ContractError } from "../../../core/validators/errors.mjs";
import { inspectInstant } from "../../../core/validators/canonical.mjs";
import { assessFieldFailureCorrectiveAction } from "./field_failure_corrective_action.mjs";
import {
  computeFfcaRequestBindingRevision,
  computeFfcaTypedFactsDigest,
} from "../rules/field_failure_corrective_action_binding_integrity.mjs";

export const FFCA_TYPED_FACTS_RECEIPT_SCHEMA = "soulforge.field_failure_corrective_action.typed_facts_receipt.v0";
export const FFCA_TYPED_FACTS_SCHEMA = "soulforge.typed_project_facts.v0";
export const FFCA_PROJECT_BINDING_SCHEMA = "soulforge.project_binding.v0";

const TYPED_FACTS_FIELDS = Object.freeze([
  "facts",
  "facts_digest",
  "known_at",
  "project_binding_ref",
  "schema_version",
  "valid_at",
]);
const PROJECT_BINDING_FIELDS = Object.freeze([
  "binding_revision_hash",
  "domain_engine_id",
  "project_id",
  "schema_version",
  "source_manifest_ref",
]);
const SHA256 = /^[0-9a-f]{64}$/u;
const SHA256_REF = /^sha256:[0-9a-f]{64}$/u;
const PROTOTYPE_SENSITIVE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function refuse(message) {
  throw new ContractError("FFCA_INPUT_REFUSED", message);
}

function snapshotExact(value, label = "typed_project_facts", depth = 0, seen = new WeakSet()) {
  if (depth > 32) refuse(label + " exceeds maximum nesting depth");
  if (value === null || value === undefined) refuse(label + " may not be null or undefined");
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) refuse(label + " number must be a safe integer");
    return value;
  }
  if (typeof value !== "object" || types.isProxy(value)) refuse(label + " must be plain non-proxy data");
  if (seen.has(value)) refuse(label + " may not contain aliases or cycles");
  seen.add(value);

  let descriptors;
  let prototype;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
    prototype = Object.getPrototypeOf(value);
  } catch {
    refuse(label + " reflection failed");
  }
  const isArray = Array.isArray(value);
  if (prototype !== (isArray ? Array.prototype : Object.prototype)) refuse(label + " has an unsupported prototype");
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) refuse(label + " may not contain symbol keys");
  for (const key of keys) {
    if (isArray && key === "length") continue;
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true
        || (!isArray && PROTOTYPE_SENSITIVE_KEYS.has(key))) {
      refuse(label + " may not contain accessors, hidden fields, or prototype-sensitive keys");
    }
  }

  if (isArray) {
    const length = descriptors.length?.value;
    const indexes = keys.filter((key) => key !== "length");
    if (!Number.isSafeInteger(length) || length < 0 || indexes.length !== length
        || indexes.some((key) => !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length)) {
      refuse(label + " must be a dense array without named properties");
    }
    const copy = [];
    for (let index = 0; index < length; index += 1) {
      copy.push(snapshotExact(descriptors[String(index)].value, label + "[" + index + "]", depth + 1, seen));
    }
    return copy;
  }

  const copy = {};
  for (const key of keys) copy[key] = snapshotExact(descriptors[key].value, label + "." + key, depth + 1, seen);
  return copy;
}

function assertExactKeys(value, expected, label) {
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    refuse(label + " must contain exactly its declared fields");
  }
}

function assertCanonicalInstant(value, label) {
  const inspected = inspectInstant(value);
  if (!inspected.valid) refuse(label + " must be an exact canonical UTC instant");
  return value;
}

function assertProjectBinding(binding) {
  assertExactKeys(binding, PROJECT_BINDING_FIELDS, "project_binding_ref");
  if (binding.schema_version !== FFCA_PROJECT_BINDING_SCHEMA
      || typeof binding.project_id !== "string" || !binding.project_id
      || binding.domain_engine_id !== "field_failure_corrective_action"
      || typeof binding.binding_revision_hash !== "string" || !SHA256.test(binding.binding_revision_hash)
      || typeof binding.source_manifest_ref !== "string" || !SHA256_REF.test(binding.source_manifest_ref)) {
    refuse("project_binding_ref is not an exact FFCA Core binding");
  }
  return Object.freeze({ ...binding });
}

function sameJson(left, right) {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== typeof right) return false;
  if (typeof left !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    return left.length === right.length && left.every((value, index) => sameJson(value, right[index]));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJson(left[key], right[key]));
}

export function admitFfcaTypedProjectFacts(typedProjectFacts, effectiveBinding) {
  const typed = snapshotExact(typedProjectFacts);
  assertExactKeys(typed, TYPED_FACTS_FIELDS, "typed_project_facts");
  if (typed.schema_version !== FFCA_TYPED_FACTS_SCHEMA
      || !Array.isArray(typed.facts) || typed.facts.length !== 1
      || typeof typed.facts_digest !== "string" || !SHA256.test(typed.facts_digest)) {
    refuse("typed_project_facts schema/facts/digest is invalid");
  }
  const projectBinding = assertProjectBinding(typed.project_binding_ref);
  const validAt = assertCanonicalInstant(typed.valid_at, "typed_project_facts.valid_at");
  const knownAt = assertCanonicalInstant(typed.known_at, "typed_project_facts.known_at");
  if (validAt > knownAt) refuse("typed_project_facts valid_at must not be after known_at");

  const computedFactsDigest = computeFfcaTypedFactsDigest(typed.facts);
  if (typed.facts_digest !== computedFactsDigest) refuse("typed_project_facts facts_digest is stale or forged");

  const request = typed.facts[0];
  const assessment = assessFieldFailureCorrectiveAction(request);
  const binding = request.binding;
  const cutoffs = request.cutoffs;
  if (!sameJson(projectBinding, binding.project_binding_ref)
      || validAt !== cutoffs.valid_at || knownAt !== cutoffs.known_at
      || !sameJson(binding.ruleset_ref, effectiveBinding.ruleset_ref)
      || !sameJson(binding.source_packet_ref, effectiveBinding.source_packet_ref)) {
    refuse("typed_project_facts project/source/cutoff binding does not match the admitted FFCA request");
  }

  return Object.freeze({
    assessment,
    typed_facts_binding: Object.freeze({
      schema_version: FFCA_TYPED_FACTS_RECEIPT_SCHEMA,
      facts_digest: typed.facts_digest,
      project_binding_ref: projectBinding,
      project_binding_revision_hash: projectBinding.binding_revision_hash,
      source_manifest_ref: projectBinding.source_manifest_ref,
      request_binding_digest: computeFfcaRequestBindingRevision(binding),
      valid_at: validAt,
      known_at: knownAt,
      request_input_digest: assessment.input_digest,
    }),
  });
}

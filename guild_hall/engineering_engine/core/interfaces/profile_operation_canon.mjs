// Core Profile operation canonicalisation contract.
//
// Profile operations are the one Core material where JSON `null` is a value rather than an
// absence. A Profile rule may bind `allowed_artifact_tokens: [null]` to mean "source-native
// evidence is accepted" and `[]` to mean "no artifact is accepted at all". Those are opposite
// statements about a project.
//
// The general PC-11 serialiser refuses `null` outright, so every earlier Profile digest was
// taken over a null-stripped projection of the operations. That projection turned `[null]`
// into `[]` before the hash was computed, which gave two contradictory Profiles one identical
// operation digest and handed a compiler material that no longer said what the Profile said.
//
// This module owns the Profile-specific canonical form instead: every JSON value survives,
// `null` included, and every array is insertion ordered. It is domain neutral - it knows
// nothing about any rule vocabulary, artifact token, or engine - and it delegates every scalar
// to the PC-11 serialiser, so null-free operations still produce exactly the same bytes, and
// therefore exactly the same digests, that they produced before this contract existed.
//
// The container walk below is deliberately not routed through `canonicalise`: that function
// raises on `null` by design and must keep doing so for the effective-rule, observation, and
// fingerprint material that depends on it. Only the two container cases are re-expressed here,
// and they are re-expressed to match it byte for byte.
import types from "node:util/types";
import { canonicalise, compareCodePoints } from "../validators/canonical.mjs";
import { CANONICAL } from "../validators/contract_config.mjs";
import { sha256Hex } from "../validators/fingerprint.mjs";
import { ContractError, CODES as CANONICAL_CODES } from "../validators/errors.mjs";

// Unchanged from the pre-repair digest domain: null-free material must keep its digest.
export const PROFILE_OPERATION_CANON_VERSION = "soulforge.profile_operations.v0";

export const PROFILE_OPERATION_MAX_DEPTH = 32;

export const PROFILE_OPERATION_CODES = Object.freeze({
  OPERATIONS_INVALID: "PROFILE_OPERATIONS_INVALID",
});

const ARRAY_INDEX_KEY = /^(0|[1-9][0-9]*)$/u;
const MAX_ARRAY_INDEX = 4_294_967_294;

const isArrayIndexKey = (key) => ARRAY_INDEX_KEY.test(key) && Number(key) <= MAX_ARRAY_INDEX;

const PROTOTYPE_SENSITIVE_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function reject(detail) {
  throw new ContractError(
    PROFILE_OPERATION_CODES.OPERATIONS_INVALID,
    `profile operations must be plain JSON data: ${detail}`
  );
}

/**
 * Clones profile operation material into frozen plain data, preserving every `null`.
 *
 * The clone is what makes the contract non-mutating and replay stable: the caller keeps its
 * own object, and nothing it does to that object afterwards can change what was digested.
 * Shapes that only look like JSON - proxies, accessors, class instances, symbol keys, cycles -
 * are refused rather than flattened, because flattening them would produce a digest over
 * material the caller never supplied.
 */
function clonePlainData(value, depth, ancestors) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (typeof value !== "object") {
    reject(`unsupported ${typeof value} value`);
  }
  if (types.isProxy(value)) {
    reject("proxy-backed values are rejected");
  }
  if (depth >= PROFILE_OPERATION_MAX_DEPTH) {
    reject(`nesting exceeds the maximum depth of ${PROFILE_OPERATION_MAX_DEPTH}`);
  }
  if (ancestors.has(value)) {
    reject("circular references are rejected");
  }
  ancestors.add(value);

  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);

    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        reject("arrays must use the standard Array prototype");
      }
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === "symbol" || (key !== "length" && !isArrayIndexKey(key))) {
          reject("symbol-keyed, sparse, or named array entries are rejected");
        }
      }
      const out = [];
      for (let i = 0; i < value.length; i += 1) {
        const descriptor = descriptors[String(i)];
        if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
          reject("accessor-backed or absent array elements are rejected");
        }
        out.push(clonePlainData(descriptor.value, depth + 1, ancestors));
      }
      return Object.freeze(out);
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) {
      reject("objects must be plain objects carrying Object.prototype");
    }
    const out = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        reject("symbol-keyed properties are rejected");
      }
      if (PROTOTYPE_SENSITIVE_KEYS.has(key)) {
        reject(`prototype-sensitive key "${key}" is rejected`);
      }
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
        reject("accessor-backed or non-enumerable object properties are rejected");
      }
      out[key] = clonePlainData(descriptor.value, depth + 1, ancestors);
    }
    return Object.freeze(out);
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Serialises cloned profile operation material.
 *
 * `null` renders as the JSON literal, which no other value can produce: strings carry quotes,
 * numbers render as plain decimals, booleans as `true`/`false`, and containers as `[]`/`{}`.
 * So the distinction that was being lost is representable without a sentinel that real data
 * could impersonate. Every other decision - key normalisation, collision refusal, code point
 * ordering, integer and instant rules - is the PC-11 decision, reached either by delegating to
 * `canonicalise` or by mirroring it exactly.
 */
function serialiseNullPreserving(value, path) {
  if (value === null) return "null";

  if (Array.isArray(value)) {
    // Every profile operation array is insertion ordered: the operations are an ordered
    // program, not a set, and reordering them is a different Profile.
    return `[${value.map((element) => serialiseNullPreserving(element, `${path}[]`)).join(",")}]`;
  }

  if (typeof value === "object") {
    const byNormalised = new Map();
    for (const rawKey of Object.keys(value)) {
      const normalised = rawKey.normalize(CANONICAL.unicodeNormalization);
      if (byNormalised.has(normalised)) {
        throw new ContractError(
          CANONICAL_CODES.NFC_KEY_COLLISION,
          "two keys collapse to the same normalised form",
          { path, first: byNormalised.get(normalised), second: rawKey }
        );
      }
      byNormalised.set(normalised, rawKey);
    }
    const ordered = [...byNormalised.keys()].sort(compareCodePoints);
    const body = ordered.map((normalised) => {
      const child = value[byNormalised.get(normalised)];
      const childPath = path ? `${path}.${normalised}` : normalised;
      return `${JSON.stringify(normalised)}:${serialiseNullPreserving(child, childPath)}`;
    });
    return `{${body.join(",")}}`;
  }

  // Scalars keep the single PC-11 authority: no second opinion on numbers, instants, or NFC.
  return canonicalise(value, {}, path);
}

/**
 * The one Core helper for normalised Profile operations and their exact operation digest.
 *
 * Core and every domain compiler must call this and only this. Two implementations of the
 * same digest is how `[null]` and `[]` collided in the first place.
 *
 * @param operations the caller's profile operations array
 * @returns frozen `{ operations, canonical_material, operation_digest }`, null preserved
 */
export function normalizeProfileOperations(operations) {
  if (types.isProxy(operations) || !Array.isArray(operations)) {
    reject("operations must be an array");
  }
  const normalized = clonePlainData(operations, 0, new Set());
  const canonicalMaterial = serialiseNullPreserving(normalized, "");
  return Object.freeze({
    operations: normalized,
    canonical_material: canonicalMaterial,
    operation_digest: sha256Hex(`${PROFILE_OPERATION_CANON_VERSION}\n${canonicalMaterial}`),
  });
}

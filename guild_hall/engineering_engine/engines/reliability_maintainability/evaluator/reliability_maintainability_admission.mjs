// Closed admission module for the two E06 public seams:
// (1) Core TypedProjectFacts -> one R&M evaluation request; and
// (2) effective rule-set -> the reviewed E06 base ruleset identity.
// All untrusted data is deeply snapshotted before any semantic property read.
import { isDeepStrictEqual, types } from 'node:util';

import { canonicalise, compareCodePoints, inspectInstant } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { arrayOrderRules, withoutNulls } from '../../../core/interfaces/domain_engine_adapter.mjs';
import { normalizeProfileOperations } from '../../../core/interfaces/profile_operation_canon.mjs';
import { AUTHORITY_FAMILIES } from '../../../core/validators/authority.mjs';
import {
  RELIABILITY_MAINTAINABILITY_RULES,
  RELIABILITY_MAINTAINABILITY_RULESET_REF,
  RELIABILITY_MAINTAINABILITY_RULESET_SCHEMA,
  RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF,
} from '../rules/reliability_maintainability_rules.mjs';
import { assertRmOpaqueToken, assertRmPublicSafeString } from '../rules/reliability_maintainability_public_safe.mjs';
import {
  RM_COMPILER_ADAPTER_SCHEMA_VERSION,
  calculateReliabilityMaintainabilityProfileOperationItemDigest,
} from '../compiler/reliability_maintainability_compiler_adapter.mjs';

export const RM_ADMISSION_ERROR_CODES = Object.freeze({
  EFFECTIVE_RULESET_INVALID: 'RM_EFFECTIVE_RULESET_INVALID',
  PROFILE_EVALUATION_UNSUPPORTED: 'RM_PROFILE_EVALUATION_UNSUPPORTED',
  TYPED_FACTS_INVALID: 'RM_TYPED_FACTS_INVALID',
  TYPED_FACTS_RAW_WRAPPER_REFUSED: 'RM_TYPED_FACTS_RAW_WRAPPER_REFUSED',
  TYPED_FACTS_DIGEST_MISMATCH: 'RM_TYPED_FACTS_DIGEST_MISMATCH',
  TYPED_FACTS_PROJECT_MISMATCH: 'RM_TYPED_FACTS_PROJECT_MISMATCH',
  TYPED_FACTS_BINDING_MISMATCH: 'RM_TYPED_FACTS_BINDING_MISMATCH',
  TYPED_FACTS_TIME_MISMATCH: 'RM_TYPED_FACTS_TIME_MISMATCH',
  AUTHORITY_REFUSED: 'RELIABILITY_MAINTAINABILITY_AUTHORITY_REFUSED',
});

const MAX = Object.freeze({ depth: 20, values: 8192, array: 128, keys: 64, string: 512 });
const PROTOTYPE_SENSITIVE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const FORBIDDEN_KEYS = new Set([
  'raw', 'raw_text', 'source_body', 'source_text', 'project_payload', 'payload', 'transcript',
  'raw_transcript', 'hidden_reasoning', 'prompt', 'completion', 'private_path',
  'absolute_private_path', 'absolute_path', 'source_path', 'secret', 'credential', 'password',
  'cookie', 'session',
]);
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const SOURCE_NATIVE_EVIDENCE_PROJECTION = 'source_native';
const CORE_AUTHORITY_KEYS = new Set(AUTHORITY_FAMILIES.map((f) => f.key));

function fail(code, message, detail = {}) {
  throw new ContractError(code, message, detail);
}

// This is intentionally a descriptor-only copier. No getter, toJSON, ownKeys Proxy trap,
// symbol, hidden field, custom prototype, cycle, or alias is allowed to cross an E06 seam.
export function snapshotReliabilityMaintainabilityAdmission(value, {
  code,
  rootLabel = 'input',
  allowedNullPrototypePaths = new Set(),
  allowAliases = false,
} = {}) {
  const seen = new WeakSet();
  const ancestors = new WeakSet();
  let valueCount = 0;

  const walk = (current, depth, field) => {
    valueCount += 1;
    if (valueCount > MAX.values || depth > MAX.depth) {
      fail(code, 'input exceeds bounded plain-data limits', { field });
    }
    if (typeof current === 'string') {
      return assertRmPublicSafeString(current, { code, field, maxLength: MAX.string });
    }
    if (typeof current === 'boolean') return current;
    if (typeof current === 'number') {
      if (!Number.isSafeInteger(current)) fail(code, 'only safe integer data is accepted', { field });
      return current;
    }
    if (current === null) return null;
    if (!current || typeof current !== 'object') {
      fail(code, 'only plain JSON-compatible data is accepted', { field });
    }
    if (types.isProxy(current)) {
      fail(code, 'Proxy input is refused before reflective access', { field });
    }
    if (ancestors.has(current)) {
      fail(code, 'cyclic graphs are refused', { field });
    }
    if (!allowAliases && seen.has(current)) {
      fail(code, 'cyclic and aliased graphs are refused', { field });
    }
    seen.add(current);
    ancestors.add(current);

    const array = Array.isArray(current);
    let prototype;
    let descriptors;
    try {
      prototype = Object.getPrototypeOf(current);
      descriptors = Object.getOwnPropertyDescriptors(current);
    } catch {
      fail(code, 'input reflection failed before a safe snapshot could be built', { field });
    }
    const allowedNullPrototype = !array && prototype === null && allowedNullPrototypePaths.has(field);
    if ((array && prototype !== Array.prototype) || (!array && prototype !== Object.prototype && !allowedNullPrototype)) {
      fail(code, 'custom prototypes and host objects are refused', { field });
    }

    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) {
      fail(code, 'symbol properties are refused', { field });
    }
    const dataKeys = array ? keys.filter((key) => key !== 'length') : keys;
    if (array) {
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX.array) {
        fail(code, 'arrays must be bounded dense data arrays', { field });
      }
      const expected = new Set(Array.from({ length }, (_, index) => String(index)));
      if (dataKeys.length !== expected.size || dataKeys.some((key) => !expected.has(key))) {
        fail(code, 'arrays must be dense and may not carry named entries', { field });
      }
      const copy = new Array(length);
      for (let index = 0; index < length; index += 1) {
        const key = String(index);
        const descriptor = descriptors[key];
        if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
          fail(code, 'arrays may not carry accessors or hidden entries', { field });
        }
        copy[index] = walk(descriptor.value, depth + 1, `${field}[${index}]`);
      }
      ancestors.delete(current);
      return copy;
    }

    if (dataKeys.length > MAX.keys) fail(code, 'object has too many fields', { field });
    const copy = {};
    for (const key of dataKeys) {
      if (key.length > 80 || key.normalize('NFC') !== key || PROTOTYPE_SENSITIVE_KEYS.has(key)
          || FORBIDDEN_KEYS.has(key.toLowerCase())) {
        fail(code, 'unsafe, payload-bearing, or prototype-sensitive field is refused', { field });
      }
      const descriptor = descriptors[key];
      if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
        fail(code, 'objects may not carry accessors or hidden entries', { field });
      }
      Object.defineProperty(copy, key, {
        value: walk(descriptor.value, depth + 1, `${field}.${key}`),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    ancestors.delete(current);
    return copy;
  };

  return walk(value, 0, rootLabel);
}

function assertExactKeys(value, required, optional, field, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${field} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(code, `${field}.${key} is required`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(code, `${field}.${key} is not permitted`);
  }
}

function assertExactRef(value, field, code) {
  assertExactKeys(value, ['entity_id', 'revision_id', 'content_id', 'content_hash_alg'], [], field, code);
  assertRmOpaqueToken(value.entity_id, { code, field: `${field}.entity_id` });
  assertRmOpaqueToken(value.revision_id, { code, field: `${field}.revision_id` });
  assertRmPublicSafeString(value.content_id, { code, field: `${field}.content_id`, maxLength: 80 });
  if (!SHA256_CONTENT_ID.test(value.content_id) || value.content_hash_alg !== 'sha256') {
    fail(code, `${field} must be an exact sha256 reference`);
  }
}

function refsEqual(left, right) {
  return left.entity_id === right.entity_id
    && left.revision_id === right.revision_id
    && left.content_id === right.content_id
    && left.content_hash_alg === right.content_hash_alg;
}

function assertCanonicalInstant(value, field, code) {
  if (typeof value !== 'string' || !inspectInstant(value).valid) {
    fail(code, `${field} must be a canonical UTC instant`);
  }
  return value;
}

export function validateEvaluatorAuthority(authority) {
  const code = RM_ADMISSION_ERROR_CODES.AUTHORITY_REFUSED;
  if (authority === undefined) {
    return;
  }
  if (authority === null) {
    fail(code, 'explicit null authority is refused; authority must be an empty plain object');
  }
  if (typeof authority !== 'object' || Array.isArray(authority)) {
    fail(code, 'authority must be a plain object');
  }
  if (types.isProxy(authority)) {
    fail(code, 'Proxy authority is refused before reflective access');
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(authority);
    descriptors = Object.getOwnPropertyDescriptors(authority);
  } catch {
    fail(code, 'authority reflection failed');
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail(code, 'custom prototype on authority is refused');
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((k) => typeof k !== 'string')) {
    fail(code, 'symbol properties on authority are refused');
  }
  for (const k of keys) {
    const d = descriptors[k];
    if (!d || d.enumerable !== true || !Object.hasOwn(d, 'value') || typeof d.get === 'function' || typeof d.set === 'function') {
      fail(code, 'authority may not carry accessors');
    }
  }
  if (keys.length > 0) {
    fail(code, 'E06 evaluator operates with zero authority, no authority properties or requested effects permitted');
  }
}

export function validateEvaluatorCutoffs(cutoffs, expectedValidAt, expectedKnownAt) {
  const code = RM_ADMISSION_ERROR_CODES.TYPED_FACTS_INVALID;
  if (cutoffs === undefined) {
    return;
  }
  if (cutoffs === null) {
    fail(code, 'explicit null cutoffs is refused; cutoffs must be a plain object');
  }
  if (typeof cutoffs !== 'object' || Array.isArray(cutoffs)) {
    fail(code, 'cutoffs must be a plain object');
  }
  if (types.isProxy(cutoffs)) {
    fail(code, 'Proxy cutoffs is refused before reflective access');
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(cutoffs);
    descriptors = Object.getOwnPropertyDescriptors(cutoffs);
  } catch {
    fail(code, 'cutoffs reflection failed');
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail(code, 'custom prototype on cutoffs is refused');
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((k) => typeof k !== 'string')) {
    fail(code, 'symbol properties on cutoffs are refused');
  }
  if (keys.length === 0) {
    return;
  }
  const allowed = new Set(['valid_at', 'known_at']);
  for (const k of keys) {
    if (!allowed.has(k)) {
      fail(code, `cutoffs.${k} is not permitted`);
    }
    const d = descriptors[k];
    if (!d || d.enumerable !== true || !Object.hasOwn(d, 'value') || typeof d.get === 'function' || typeof d.set === 'function') {
      fail(code, `cutoffs.${k} may not carry accessors`);
    }
  }
  if (descriptors.valid_at) {
    const val = descriptors.valid_at.value;
    if (typeof val !== 'string' || !inspectInstant(val).valid) {
      fail(code, 'cutoffs.valid_at must be a canonical UTC instant');
    }
    if (expectedValidAt !== undefined && val !== expectedValidAt) {
      fail(RM_ADMISSION_ERROR_CODES.TYPED_FACTS_TIME_MISMATCH, 'cutoffs.valid_at does not match admitted facts valid_at');
    }
  }
  if (descriptors.known_at) {
    const val = descriptors.known_at.value;
    if (typeof val !== 'string' || !inspectInstant(val).valid) {
      fail(code, 'cutoffs.known_at must be a canonical UTC instant');
    }
    if (expectedKnownAt !== undefined && val !== expectedKnownAt) {
      fail(RM_ADMISSION_ERROR_CODES.TYPED_FACTS_TIME_MISMATCH, 'cutoffs.known_at does not match admitted facts known_at');
    }
  }
}

export function coreFactsDigest(facts) {
  const cleanFacts = withoutNulls(facts);
  const canonicalFacts = canonicalise(cleanFacts, arrayOrderRules(cleanFacts));
  return sha256Hex(`soulforge.project_observations.v0\n${canonicalFacts}`);
}

export { coreFactsDigest as calculateReliabilityMaintainabilityCoreFactsDigest };

export function validateAndCloneProjectFactsProvenance(value) {
  if (value === null || value === undefined) return null;
  const code = RM_ADMISSION_ERROR_CODES.TYPED_FACTS_INVALID;
  const snapshot = snapshotReliabilityMaintainabilityAdmission(value, {
    code,
    rootLabel: 'project_facts_provenance',
  });
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    fail(code, 'project_facts_provenance must be a plain object');
  }
  assertExactKeys(snapshot, ['facts_digest', 'known_at', 'project_binding_ref', 'valid_at'], [], 'project_facts_provenance', code);
  if (typeof snapshot.facts_digest !== 'string' || !SHA256_HEX.test(snapshot.facts_digest)) {
    fail(code, 'facts_digest must be a 64-character sha256 hex digest');
  }
  assertCanonicalInstant(snapshot.valid_at, 'project_facts_provenance.valid_at', code);
  assertCanonicalInstant(snapshot.known_at, 'project_facts_provenance.known_at', code);
  if (Date.parse(snapshot.known_at) < Date.parse(snapshot.valid_at) || compareCodePoints(snapshot.known_at, snapshot.valid_at) < 0) {
    fail(RM_ADMISSION_ERROR_CODES.TYPED_FACTS_TIME_MISMATCH, 'project_facts_provenance known_at precedes valid_at');
  }

  const rawBinding = snapshot.project_binding_ref;
  if (!rawBinding || typeof rawBinding !== 'object' || Array.isArray(rawBinding)) {
    fail(code, 'project_binding_ref must be a plain object');
  }
  assertExactKeys(
    rawBinding,
    ['schema_version', 'project_id', 'domain_engine_id', 'binding_revision_hash', 'source_manifest_ref'],
    ['authority_family', 'document_refs', 'valid_at', 'known_at'],
    'project_binding_ref',
    code,
  );
  if (rawBinding.schema_version !== 'soulforge.project_binding.v0') {
    fail(code, 'project_binding_ref.schema_version must be soulforge.project_binding.v0');
  }
  if (rawBinding.domain_engine_id !== 'reliability_maintainability') {
    fail(code, 'project_binding_ref.domain_engine_id must be reliability_maintainability');
  }
  assertRmOpaqueToken(rawBinding.project_id, { code, field: 'project_binding_ref.project_id' });
  assertRmOpaqueToken(rawBinding.binding_revision_hash, { code, field: 'project_binding_ref.binding_revision_hash' });
  assertRmOpaqueToken(rawBinding.source_manifest_ref, { code, field: 'project_binding_ref.source_manifest_ref' });
  if (rawBinding.authority_family !== undefined) {
    assertRmOpaqueToken(rawBinding.authority_family, { code, field: 'project_binding_ref.authority_family' });
    if (!CORE_AUTHORITY_KEYS.has(rawBinding.authority_family)) {
      fail(code, 'project_binding_ref.authority_family is not an official Core authority family');
    }
  }
  if (rawBinding.valid_at !== undefined) {
    assertCanonicalInstant(rawBinding.valid_at, 'project_binding_ref.valid_at', code);
    if (rawBinding.valid_at !== snapshot.valid_at) {
      fail(RM_ADMISSION_ERROR_CODES.TYPED_FACTS_TIME_MISMATCH, 'project_binding_ref valid_at must match provenance valid_at');
    }
  }
  if (rawBinding.known_at !== undefined) {
    assertCanonicalInstant(rawBinding.known_at, 'project_binding_ref.known_at', code);
    if (rawBinding.known_at !== snapshot.known_at) {
      fail(RM_ADMISSION_ERROR_CODES.TYPED_FACTS_TIME_MISMATCH, 'project_binding_ref known_at must match provenance known_at');
    }
  }

  let documentRefs = undefined;
  if (rawBinding.document_refs !== undefined) {
    if (!Array.isArray(rawBinding.document_refs)) fail(code, 'project_binding_ref.document_refs must be an array');
    documentRefs = [];
    let priorDoc = null;
    for (const doc of rawBinding.document_refs) {
      assertRmOpaqueToken(doc, { code, field: 'project_binding_ref.document_refs item' });
      if (priorDoc !== null && compareCodePoints(priorDoc, doc) >= 0) {
        fail(code, 'project_binding_ref.document_refs must be strictly code-point sorted and duplicate-free');
      }
      priorDoc = doc;
      documentRefs.push(doc);
    }
  }

  const cleanBinding = {
    schema_version: rawBinding.schema_version,
    project_id: rawBinding.project_id,
    domain_engine_id: rawBinding.domain_engine_id,
    binding_revision_hash: rawBinding.binding_revision_hash,
    source_manifest_ref: rawBinding.source_manifest_ref,
  };
  if (rawBinding.authority_family !== undefined) cleanBinding.authority_family = rawBinding.authority_family;
  if (documentRefs !== undefined) cleanBinding.document_refs = Object.freeze(documentRefs);
  if (rawBinding.valid_at !== undefined) cleanBinding.valid_at = rawBinding.valid_at;
  if (rawBinding.known_at !== undefined) cleanBinding.known_at = rawBinding.known_at;

  return Object.freeze({
    project_binding_ref: Object.freeze(cleanBinding),
    facts_digest: snapshot.facts_digest,
    valid_at: snapshot.valid_at,
    known_at: snapshot.known_at,
  });
}

function assertCoreProjectBinding(projectBinding) {
  const code = RM_ADMISSION_ERROR_CODES.TYPED_FACTS_INVALID;
  assertExactKeys(
    projectBinding,
    ['schema_version', 'project_id', 'domain_engine_id', 'binding_revision_hash', 'source_manifest_ref'],
    ['authority_family', 'document_refs', 'valid_at', 'known_at'],
    'typedProjectFacts.project_binding_ref',
    code,
  );
  if (projectBinding.schema_version !== 'soulforge.project_binding.v0') {
    fail(code, 'typedProjectFacts.project_binding_ref.schema_version must be soulforge.project_binding.v0');
  }
  if (projectBinding.domain_engine_id !== 'reliability_maintainability') {
    fail(code, 'typedProjectFacts.project_binding_ref.domain_engine_id must be reliability_maintainability');
  }
  assertRmOpaqueToken(projectBinding.project_id, { code, field: 'typedProjectFacts.project_binding_ref.project_id' });
  assertRmOpaqueToken(projectBinding.binding_revision_hash, { code, field: 'typedProjectFacts.project_binding_ref.binding_revision_hash' });
  assertRmOpaqueToken(projectBinding.source_manifest_ref, { code, field: 'typedProjectFacts.project_binding_ref.source_manifest_ref' });
  if (projectBinding.authority_family !== undefined) {
    if (!CORE_AUTHORITY_KEYS.has(projectBinding.authority_family)) {
      fail(code, 'typedProjectFacts.project_binding_ref.authority_family must be an official Core authority family');
    }
  }
  if (projectBinding.document_refs !== undefined) {
    if (!Array.isArray(projectBinding.document_refs)) {
      fail(code, 'typedProjectFacts.project_binding_ref.document_refs must be an array');
    }
    let priorDoc = null;
    for (const docRef of projectBinding.document_refs) {
      assertRmOpaqueToken(docRef, { code, field: 'typedProjectFacts.project_binding_ref.document_refs' });
      if (priorDoc !== null && compareCodePoints(priorDoc, docRef) >= 0) {
        fail(code, 'typedProjectFacts.project_binding_ref.document_refs must be strictly code-point sorted and duplicate-free');
      }
      priorDoc = docRef;
    }
  }
  if (projectBinding.valid_at !== undefined) {
    assertCanonicalInstant(projectBinding.valid_at, 'typedProjectFacts.project_binding_ref.valid_at', code);
  }
  if (projectBinding.known_at !== undefined) {
    assertCanonicalInstant(projectBinding.known_at, 'typedProjectFacts.project_binding_ref.known_at', code);
  }
}

// Core TypedProjectFacts intentionally applies `withoutNulls` to observations. E06 therefore
// uses one explicit non-null transport marker only inside the Core fact mapping. The marker is
// removed and restored to the domain-owned `null` meaning before the direct evaluator sees it.
function restoreSourceNativeEvidenceProjection(domainInput) {
  const code = RM_ADMISSION_ERROR_CODES.TYPED_FACTS_INVALID;
  if (!domainInput || typeof domainInput !== 'object' || Array.isArray(domainInput)
      || !Array.isArray(domainInput.rows)) {
    fail(code, 'Core R&M request fact must contain domain_input.rows');
  }
  const rows = domainInput.rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      fail(code, 'Core R&M request fact row is invalid', { index });
    }
    const hasEvidenceKind = Object.hasOwn(row, 'evidence_kind');
    const hasProjection = Object.hasOwn(row, 'evidence_kind_projection');
    if (!hasProjection) {
      if (!hasEvidenceKind) {
        fail(code, 'Core R&M request fact row is missing evidence_kind without a source-native projection', { index });
      }
      return row;
    }
    if (hasEvidenceKind || row.evidence_kind_projection !== SOURCE_NATIVE_EVIDENCE_PROJECTION) {
      fail(code, 'source-native evidence projection is malformed or ambiguous', { index });
    }
    const { evidence_kind_projection, ...withoutProjection } = row;
    void evidence_kind_projection;
    return { ...withoutProjection, evidence_kind: null };
  });
  return { ...domainInput, rows };
}

export function admitReliabilityMaintainabilityTypedFacts(untrustedTypedFacts) {
  const code = RM_ADMISSION_ERROR_CODES.TYPED_FACTS_INVALID;
  const typedFacts = snapshotReliabilityMaintainabilityAdmission(untrustedTypedFacts, {
    code,
    rootLabel: 'typedProjectFacts',
  });
  if (Object.hasOwn(typedFacts, 'request')) {
    fail(RM_ADMISSION_ERROR_CODES.TYPED_FACTS_RAW_WRAPPER_REFUSED,
      'legacy raw {request} wrapper is not a Core TypedProjectFacts envelope');
  }
  assertExactKeys(typedFacts, [
    'schema_version', 'project_binding_ref', 'facts', 'facts_digest', 'valid_at', 'known_at',
  ], [], 'typedProjectFacts', code);
  if (typedFacts.schema_version !== 'soulforge.typed_project_facts.v0') {
    fail(code, 'typedProjectFacts.schema_version is invalid');
  }
  assertCoreProjectBinding(typedFacts.project_binding_ref);
  if (!Array.isArray(typedFacts.facts) || typedFacts.facts.length !== 1) {
    fail(code, 'typedProjectFacts.facts must contain exactly one closed R&M request fact');
  }
  if (!/^[a-f0-9]{64}$/u.test(typedFacts.facts_digest)
      || coreFactsDigest(typedFacts.facts) !== typedFacts.facts_digest) {
    fail(RM_ADMISSION_ERROR_CODES.TYPED_FACTS_DIGEST_MISMATCH,
      'typedProjectFacts.facts_digest does not match the exact Core facts projection');
  }
  assertCanonicalInstant(typedFacts.valid_at, 'typedProjectFacts.valid_at', code);
  assertCanonicalInstant(typedFacts.known_at, 'typedProjectFacts.known_at', code);
  if (compareCodePoints(typedFacts.known_at, typedFacts.valid_at) < 0) {
    fail(RM_ADMISSION_ERROR_CODES.TYPED_FACTS_TIME_MISMATCH,
      'typedProjectFacts.known_at precedes valid_at');
  }

  if (typedFacts.project_binding_ref.valid_at !== undefined && typedFacts.project_binding_ref.valid_at !== typedFacts.valid_at) {
    fail(RM_ADMISSION_ERROR_CODES.TYPED_FACTS_TIME_MISMATCH,
      'typedProjectFacts.project_binding_ref.valid_at does not match typedProjectFacts.valid_at');
  }
  if (typedFacts.project_binding_ref.known_at !== undefined && typedFacts.project_binding_ref.known_at !== typedFacts.known_at) {
    fail(RM_ADMISSION_ERROR_CODES.TYPED_FACTS_TIME_MISMATCH,
      'typedProjectFacts.project_binding_ref.known_at does not match typedProjectFacts.known_at');
  }

  const fact = typedFacts.facts[0];
  assertExactKeys(fact, ['manifest', 'binding', 'domain_input', 'cutoffs'], [], 'typedProjectFacts.facts[0]', code);
  if (!fact.binding || typeof fact.binding !== 'object' || Array.isArray(fact.binding)
      || !fact.binding.project_binding_ref || typeof fact.binding.project_binding_ref !== 'object') {
    fail(RM_ADMISSION_ERROR_CODES.TYPED_FACTS_BINDING_MISMATCH,
      'R&M fact must carry the closed request binding and its exact project_binding_ref');
  }
  assertExactRef(fact.binding.project_binding_ref, 'typedProjectFacts.facts[0].binding.project_binding_ref', code);
  if (fact.binding.project_binding_ref.entity_id !== typedFacts.project_binding_ref.project_id) {
    fail(RM_ADMISSION_ERROR_CODES.TYPED_FACTS_PROJECT_MISMATCH,
      'Core project_id does not match the admitted R&M binding entity_id');
  }
  if (fact.binding.project_binding_ref.revision_id !== typedFacts.project_binding_ref.binding_revision_hash) {
    fail(RM_ADMISSION_ERROR_CODES.TYPED_FACTS_BINDING_MISMATCH,
      'Core binding_revision_hash does not match the admitted R&M binding revision_id');
  }
  assertExactKeys(fact.cutoffs, ['accepted_context_generation', 'assessment_cutoff_ref', 'valid_at', 'known_at'], [], 'typedProjectFacts.facts[0].cutoffs', code);
  assertCanonicalInstant(fact.cutoffs.valid_at, 'typedProjectFacts.facts[0].cutoffs.valid_at', code);
  assertCanonicalInstant(fact.cutoffs.known_at, 'typedProjectFacts.facts[0].cutoffs.known_at', code);
  if (fact.cutoffs.valid_at !== typedFacts.valid_at || fact.cutoffs.known_at !== typedFacts.known_at) {
    fail(RM_ADMISSION_ERROR_CODES.TYPED_FACTS_TIME_MISMATCH,
      'R&M fact cutoff times must exactly match Core TypedProjectFacts times');
  }

  const validatedProvenance = validateAndCloneProjectFactsProvenance({
    project_binding_ref: typedFacts.project_binding_ref,
    facts_digest: typedFacts.facts_digest,
    valid_at: typedFacts.valid_at,
    known_at: typedFacts.known_at,
  });

  return Object.freeze({
    manifest: fact.manifest,
    binding: fact.binding,
    domain_input: restoreSourceNativeEvidenceProjection(fact.domain_input),
    cutoffs: {
      accepted_context_generation: fact.cutoffs.accepted_context_generation,
      assessment_cutoff_ref: fact.cutoffs.assessment_cutoff_ref,
      valid_at: fact.cutoffs.valid_at,
      known_at: fact.cutoffs.known_at,
    },
    project_facts_provenance: validatedProvenance,
  });
}

function exactRefMatches(value, expected) {
  assertExactRef(value, 'effectiveRuleSet.ref', RM_ADMISSION_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  return refsEqual(value, expected);
}

function validateCoreCompilationEnvelope(envelope, ruleset) {
  const code = RM_ADMISSION_ERROR_CODES.EFFECTIVE_RULESET_INVALID;
  assertExactKeys(
    envelope,
    ['schema_version', 'domain_engine_id', 'effective_rule_set', 'compilation_trace', 'rule_count', 'assembly_digest'],
    [],
    'effectiveRuleSet',
    code,
  );
  if (envelope.schema_version !== 'soulforge.effective_rule_set.v0') {
    fail(code, 'Core compilation envelope schema_version is invalid');
  }
  if (envelope.domain_engine_id !== 'reliability_maintainability') {
    fail(code, 'Core compilation envelope domain_engine_id must be reliability_maintainability');
  }
  if (!Number.isSafeInteger(envelope.rule_count) || envelope.rule_count !== ruleset.rules.length) {
    fail(code, 'Core compilation envelope rule_count does not match rules length');
  }

  const cleanRuleset = withoutNulls(ruleset);
  const expectedAssemblyDigest = sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalise(cleanRuleset, arrayOrderRules(cleanRuleset))}`);
  if (envelope.assembly_digest !== expectedAssemblyDigest) {
    fail(code, 'Core compilation envelope assembly_digest does not match computed digest');
  }

  const trace = envelope.compilation_trace;
  if (!trace || typeof trace !== 'object' || Array.isArray(trace)) {
    fail(code, 'Core compilation trace must be an object');
  }
  assertExactKeys(
    trace,
    ['schema_version', 'domain_engine_id', 'domain_adapter_revision', 'organization_trace', 'project_trace', 'profiles', 'compilation_scope', 'effective_ruleset_digest', 'rule_count'],
    [],
    'effectiveRuleSet.compilation_trace',
    code,
  );
  if (trace.schema_version !== 'soulforge.compilation_trace.v0') {
    fail(code, 'compilation_trace schema_version is invalid');
  }
  if (trace.domain_engine_id !== 'reliability_maintainability') {
    fail(code, 'compilation_trace domain_engine_id must be reliability_maintainability');
  }
  if (trace.domain_adapter_revision !== RM_COMPILER_ADAPTER_SCHEMA_VERSION) {
    fail(code, 'compilation_trace domain_adapter_revision is invalid');
  }
  if (trace.effective_ruleset_digest !== expectedAssemblyDigest) {
    fail(code, 'compilation_trace effective_ruleset_digest does not match assembly digest');
  }
  if (trace.rule_count !== ruleset.rules.length) {
    fail(code, 'compilation_trace rule_count does not match rules length');
  }

  const scope = trace.compilation_scope;
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)
      || (Object.getPrototypeOf(scope) !== Object.prototype && Object.getPrototypeOf(scope) !== null)
      || types.isProxy(scope)) {
    fail(code, 'compilation_scope must be a plain object');
  }
  const scopeDescriptors = Object.getOwnPropertyDescriptors(scope);
  for (const [, desc] of Object.entries(scopeDescriptors)) {
    if (!desc.enumerable || typeof desc.get === 'function' || typeof desc.set === 'function') {
      fail(code, 'compilation_scope contains unsafe accessor properties');
    }
  }
  if (Object.keys(scope).length !== 0) {
    fail(code, 'compilation_scope must be empty; reliability_maintainability defines no compilation scope');
  }

  if (!Array.isArray(trace.profiles) || trace.profiles.length > 2) {
    fail(code, 'Core compilation trace profiles is invalid');
  }
  const CORE_PROFILE_TRACE_FIELDS = ['applied_operations_count', 'domain_engine_id', 'extends_or_base_pin', 'operation_digest', 'order', 'profile_id', 'profile_kind', 'revision_or_hash', 'source_refs'];
  const CORE_PROFILE_SUMMARY_TRACE_FIELDS = ['applied_operations_count', 'domain_engine_id', 'extends_or_base_pin', 'operation_digest', 'profile_id', 'revision_or_hash', 'source_refs'];

  const traceProfileKeys = new Set();
  for (let i = 0; i < trace.profiles.length; i += 1) {
    const p = trace.profiles[i];
    if (!p || typeof p !== 'object' || Array.isArray(p)) fail(code, 'profile trace must be an object');
    assertExactKeys(p, CORE_PROFILE_TRACE_FIELDS, [], `profile trace ${i}`, code);
    if (p.domain_engine_id !== 'reliability_maintainability'
        || !['organization', 'project'].includes(p.profile_kind)
        || p.order !== i
        || !Number.isSafeInteger(p.applied_operations_count)
        || p.applied_operations_count < 0
        || typeof p.operation_digest !== 'string'
        || !SHA256_HEX.test(p.operation_digest)
        || !Array.isArray(p.source_refs)
        || p.source_refs.length === 0
        || p.source_refs.length > 64) {
      fail(code, `profile trace ${i} is malformed`);
    }
    assertRmOpaqueToken(p.profile_id, { code, field: `profile trace ${i} profile_id` });
    assertRmOpaqueToken(p.revision_or_hash, { code, field: `profile trace ${i} revision_or_hash` });
    assertRmOpaqueToken(p.extends_or_base_pin, { code, field: `profile trace ${i} extends_or_base_pin` });
    const seenProfileSourceRefs = new Set();
    for (const ref of p.source_refs) {
      assertRmOpaqueToken(ref, { code, field: `profile trace ${i} source_ref` });
      if (seenProfileSourceRefs.has(ref)) {
        fail(code, `duplicate source_ref in profile trace ${i}`);
      }
      seenProfileSourceRefs.add(ref);
    }
    const traceKey = `${p.profile_kind}\u0000${p.profile_id}`;
    if (traceProfileKeys.has(traceKey)) {
      fail(code, 'duplicate profile identity in compilation trace');
    }
    traceProfileKeys.add(traceKey);
  }
  if (trace.profiles.length === 2 && (trace.profiles[0].profile_kind !== 'organization' || trace.profiles[1].profile_kind !== 'project')) {
    fail(code, 'profile sequence in compilation trace must be organization then project');
  }

  // Summary nullability and byte-canonical trace matching
  const orgProfile = trace.profiles.find((p) => p.profile_kind === 'organization');
  const projProfile = trace.profiles.find((p) => p.profile_kind === 'project');

  if (orgProfile) {
    if (trace.organization_trace === null || trace.organization_trace === undefined) {
      fail(code, 'organization_trace is required when organization profile exists');
    }
    assertExactKeys(trace.organization_trace, CORE_PROFILE_SUMMARY_TRACE_FIELDS, [], 'organization_trace', code);
    if (!Array.isArray(trace.organization_trace.source_refs) || trace.organization_trace.source_refs.length === 0) {
      fail(code, 'organization_trace.source_refs must be a non-empty array');
    }
    const seenOrgSourceRefs = new Set();
    for (const ref of trace.organization_trace.source_refs) {
      assertRmOpaqueToken(ref, { code, field: 'organization_trace source_ref' });
      if (seenOrgSourceRefs.has(ref)) {
        fail(code, 'duplicate source_ref in organization_trace');
      }
      seenOrgSourceRefs.add(ref);
    }
    if (trace.organization_trace.profile_id !== orgProfile.profile_id
        || trace.organization_trace.domain_engine_id !== orgProfile.domain_engine_id
        || trace.organization_trace.revision_or_hash !== orgProfile.revision_or_hash
        || trace.organization_trace.extends_or_base_pin !== orgProfile.extends_or_base_pin
        || trace.organization_trace.operation_digest !== orgProfile.operation_digest
        || trace.organization_trace.applied_operations_count !== orgProfile.applied_operations_count
        || trace.organization_trace.source_refs.length !== orgProfile.source_refs.length
        || trace.organization_trace.source_refs.some((ref, idx) => ref !== orgProfile.source_refs[idx])) {
      fail(code, 'organization_trace must match organization profile trace exactly with insertion-order parity');
    }
  } else {
    if (trace.organization_trace !== null) {
      fail(code, 'organization_trace must be null when no organization profile exists');
    }
  }

  if (projProfile) {
    if (trace.project_trace === null || trace.project_trace === undefined) {
      fail(code, 'project_trace is required when project profile exists');
    }
    assertExactKeys(trace.project_trace, CORE_PROFILE_SUMMARY_TRACE_FIELDS, [], 'project_trace', code);
    if (!Array.isArray(trace.project_trace.source_refs) || trace.project_trace.source_refs.length === 0) {
      fail(code, 'project_trace.source_refs must be a non-empty array');
    }
    const seenProjSourceRefs = new Set();
    for (const ref of trace.project_trace.source_refs) {
      assertRmOpaqueToken(ref, { code, field: 'project_trace source_ref' });
      if (seenProjSourceRefs.has(ref)) {
        fail(code, 'duplicate source_ref in project_trace');
      }
      seenProjSourceRefs.add(ref);
    }
    if (trace.project_trace.profile_id !== projProfile.profile_id
        || trace.project_trace.domain_engine_id !== projProfile.domain_engine_id
        || trace.project_trace.revision_or_hash !== projProfile.revision_or_hash
        || trace.project_trace.extends_or_base_pin !== projProfile.extends_or_base_pin
        || trace.project_trace.operation_digest !== projProfile.operation_digest
        || trace.project_trace.applied_operations_count !== projProfile.applied_operations_count
        || trace.project_trace.source_refs.length !== projProfile.source_refs.length
        || trace.project_trace.source_refs.some((ref, idx) => ref !== projProfile.source_refs[idx])) {
      fail(code, 'project_trace must match project profile trace exactly with insertion-order parity');
    }
  } else {
    if (trace.project_trace !== null) {
      fail(code, 'project_trace must be null when no project profile exists');
    }
  }

  const PROVENANCE_RECORD_FIELDS = [
    'profile_kind',
    'profile_id',
    'revision_or_hash',
    'extends_or_base_pin',
    'operation_digest',
    'source_refs',
    'order',
    'operation_index',
    'operation_item_digest',
  ];

  const provenance = ruleset.profile_rule_provenance ?? {};
  for (const profileTrace of trace.profiles) {
    const profileRulesWithProv = ruleset.rules
      .map((r) => ({ rule: r, prov: provenance[r.rule_id] }))
      .filter(({ prov }) => prov && prov.profile_id === profileTrace.profile_id && prov.profile_kind === profileTrace.profile_kind && prov.order === profileTrace.order);

    if (profileRulesWithProv.length !== profileTrace.applied_operations_count) {
      fail(code, 'applied_operations_count mismatch for profile');
    }

    const indices = profileRulesWithProv.map(({ prov }) => prov.operation_index).sort((a, b) => a - b);
    for (let idx = 0; idx < indices.length; idx += 1) {
      if (indices[idx] !== idx) {
        fail(code, 'operation_index gap or duplicate in profile');
      }
    }
    profileRulesWithProv.sort((a, b) => a.prov.operation_index - b.prov.operation_index);

    const reconstructedOps = [];
    for (const { rule, prov } of profileRulesWithProv) {
      assertExactKeys(prov, PROVENANCE_RECORD_FIELDS, [], `profile_rule_provenance.${rule.rule_id}`, code);
      if (!Array.isArray(prov.source_refs) || prov.source_refs.length === 0) {
        fail(code, 'provenance source_refs must be a non-empty array');
      }
      const seenProvSourceRefs = new Set();
      for (const ref of prov.source_refs) {
        assertRmOpaqueToken(ref, { code, field: 'provenance source_ref' });
        if (seenProvSourceRefs.has(ref)) {
          fail(code, 'duplicate source_ref in provenance record');
        }
        seenProvSourceRefs.add(ref);
      }
      if (prov.profile_kind !== profileTrace.profile_kind
          || prov.profile_id !== profileTrace.profile_id
          || prov.revision_or_hash !== profileTrace.revision_or_hash
          || prov.extends_or_base_pin !== profileTrace.extends_or_base_pin
          || prov.operation_digest !== profileTrace.operation_digest
          || prov.order !== profileTrace.order
          || prov.source_refs.length !== profileTrace.source_refs.length
          || prov.source_refs.some((ref, idx) => ref !== profileTrace.source_refs[idx])) {
        fail(code, 'provenance record does not match profile trace exactly with insertion-order parity');
      }
      if (!profileTrace.source_refs.includes(rule.source_ref)) {
        fail(code, 'rule source_ref is not in profile source_refs');
      }
      const singleOpRule = {
        allowed_evidence_kinds: rule.allowed_evidence_kinds,
        context_ref_fields: rule.context_ref_fields,
        required_authority_families: rule.required_authority_families,
        rule_id: rule.rule_id,
        source_locator: rule.source_locator,
        source_modality: rule.source_modality,
        source_ref: rule.source_ref,
        sufficiency_fields: rule.sufficiency_fields,
      };
      if (rule.claim_ceiling !== undefined) {
        singleOpRule.claim_ceiling = rule.claim_ceiling;
      }
      const singleOp = {
        op: 'add',
        rule: singleOpRule,
      };
      const expectedItemDigest = calculateReliabilityMaintainabilityProfileOperationItemDigest(prov, rule.rule_id);
      if (prov.operation_item_digest !== expectedItemDigest) {
        fail(code, 'operation_item_digest mismatch for rule');
      }
      reconstructedOps.push(singleOp);
    }
    const opCanon = normalizeProfileOperations(reconstructedOps);
    if (opCanon.operation_digest !== profileTrace.operation_digest) {
      fail(code, 'operation_digest mismatch for profile');
    }
  }

  for (const [ruleId, prov] of Object.entries(provenance)) {
    assertExactKeys(prov, PROVENANCE_RECORD_FIELDS, [], `profile_rule_provenance.${ruleId}`, code);
    const matchingTrace = trace.profiles.find((p) => p.profile_id === prov.profile_id && p.profile_kind === prov.profile_kind && p.order === prov.order);
    if (!matchingTrace) {
      fail(code, 'derived rule has no matching profile in compilation trace');
    }
    if (RELIABILITY_MAINTAINABILITY_RULES.some((b) => b.rule_id === ruleId)) {
      fail(code, 'base rule cannot carry profile rule provenance');
    }
    if (!ruleset.rules.some((r) => r.rule_id === ruleId)) {
      fail(code, 'provenance record references non-existent rule in ruleset');
    }
  }

  for (const rule of ruleset.rules) {
    const isBase = RELIABILITY_MAINTAINABILITY_RULES.some((b) => b.rule_id === rule.rule_id);
    if (!isBase && !Object.hasOwn(provenance, rule.rule_id)) {
      fail(code, `derived rule ${rule.rule_id} is missing profile rule provenance`);
    }
  }
}

export function calculateReliabilityMaintainabilityCompilationIdentityDigest(envelope) {
  const trace = envelope.compilation_trace;
  const identity = {
    envelope: {
      schema_version: envelope.schema_version,
      domain_engine_id: envelope.domain_engine_id,
      assembly_digest: envelope.assembly_digest,
      rule_count: envelope.rule_count,
    },
    compilation_trace: {
      schema_version: trace.schema_version,
      domain_engine_id: trace.domain_engine_id,
      domain_adapter_revision: trace.domain_adapter_revision,
      organization_trace: trace.organization_trace,
      project_trace: trace.project_trace,
      profiles: trace.profiles,
      compilation_scope: trace.compilation_scope,
      effective_ruleset_digest: trace.effective_ruleset_digest,
      rule_count: trace.rule_count,
    },
  };
  const cleanIdentity = withoutNulls(identity);
  return sha256Hex(`soulforge.reliability_maintainability.compilation_identity.v0\n${canonicalise(cleanIdentity, {
    ...arrayOrderRules(cleanIdentity),
  })}`);
}

export function admitReliabilityMaintainabilityEffectiveRuleSet(untrustedEffectiveRuleSet) {
  const code = RM_ADMISSION_ERROR_CODES.EFFECTIVE_RULESET_INVALID;
  if (!untrustedEffectiveRuleSet || typeof untrustedEffectiveRuleSet !== 'object') {
    fail(code, 'effectiveRuleSet must be an object');
  }

  const effectiveRuleSet = snapshotReliabilityMaintainabilityAdmission(untrustedEffectiveRuleSet, {
    code,
    rootLabel: 'effectiveRuleSet',
    allowAliases: true,
    allowedNullPrototypePaths: new Set([
      'effectiveRuleSet.profile_rule_provenance',
      'effectiveRuleSet.effective_rule_set.profile_rule_provenance',
    ]),
  });

  const isCoreWrapper = Object.hasOwn(effectiveRuleSet, 'effective_rule_set');
  if (!isCoreWrapper) {
    assertExactKeys(effectiveRuleSet, ['schema_version', 'ruleset_ref', 'source_packet_ref', 'rules'], ['profile_rule_provenance'], 'effectiveRuleSet', code);
    if (effectiveRuleSet.schema_version !== RELIABILITY_MAINTAINABILITY_RULESET_SCHEMA) {
      fail(code, 'R&M ruleset schema_version does not match the candidate');
    }

    const isBaseRef = exactRefMatches(effectiveRuleSet.ruleset_ref, RELIABILITY_MAINTAINABILITY_RULESET_REF)
      && exactRefMatches(effectiveRuleSet.source_packet_ref, RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF);
    const hasProvenance = Object.hasOwn(effectiveRuleSet, 'profile_rule_provenance')
      && effectiveRuleSet.profile_rule_provenance
      && Object.keys(effectiveRuleSet.profile_rule_provenance).length > 0;
    const isBaseRules = Array.isArray(effectiveRuleSet.rules) && isDeepStrictEqual(effectiveRuleSet.rules, RELIABILITY_MAINTAINABILITY_RULES);

    if (!isBaseRef || hasProvenance || !isBaseRules) {
      fail(code, 'bare derived ruleset without Core compilation envelope is rejected');
    }

    return Object.freeze({
      ruleset_ref: Object.freeze({ ...effectiveRuleSet.ruleset_ref }),
      effective_ruleset_digest: effectiveRuleSet.ruleset_ref.content_id,
      compilation_identity_digest: null,
      rules: effectiveRuleSet.rules,
      profile_rule_provenance: effectiveRuleSet.profile_rule_provenance,
    });
  }

  const ruleset = effectiveRuleSet.effective_rule_set;
  if (!ruleset || typeof ruleset !== 'object' || Array.isArray(ruleset)) {
    fail(code, 'effective_rule_set must be an object');
  }
  assertExactKeys(ruleset, ['schema_version', 'ruleset_ref', 'source_packet_ref', 'rules'], ['base_ruleset_ref', 'profile_rule_provenance'], 'effectiveRuleSet.effective_rule_set', code);
  if (ruleset.schema_version !== RELIABILITY_MAINTAINABILITY_RULESET_SCHEMA) {
    fail(code, 'R&M ruleset schema_version does not match the candidate');
  }
  if (Object.hasOwn(ruleset, 'base_ruleset_ref')) {
    if (!ruleset.base_ruleset_ref || typeof ruleset.base_ruleset_ref !== 'object' || Array.isArray(ruleset.base_ruleset_ref)) {
      fail(code, 'base_ruleset_ref must be an object');
    }
    assertExactRef(ruleset.base_ruleset_ref, 'effectiveRuleSet.effective_rule_set.base_ruleset_ref', code);
    if (!refsEqual(ruleset.base_ruleset_ref, RELIABILITY_MAINTAINABILITY_RULESET_REF)) {
      fail(code, 'base_ruleset_ref does not match the reviewed R&M base ruleset reference');
    }
  }

  // Validate the full compilation envelope and trace against the inner ruleset
  validateCoreCompilationEnvelope(effectiveRuleSet, ruleset);

  const isBaseRef = exactRefMatches(ruleset.ruleset_ref, RELIABILITY_MAINTAINABILITY_RULESET_REF)
    && exactRefMatches(ruleset.source_packet_ref, RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF);
  const hasProvenance = Object.hasOwn(ruleset, 'profile_rule_provenance')
    && ruleset.profile_rule_provenance
    && Object.keys(ruleset.profile_rule_provenance).length > 0;
  const isBaseRules = Array.isArray(ruleset.rules) && isDeepStrictEqual(ruleset.rules, RELIABILITY_MAINTAINABILITY_RULES);

  if (!isBaseRef || hasProvenance || !isBaseRules) {
    fail(RM_ADMISSION_ERROR_CODES.PROFILE_EVALUATION_UNSUPPORTED,
      'Profile-added R&M rules require a separately reviewed evaluator revision');
  }

  const compilationIdentityDigest = calculateReliabilityMaintainabilityCompilationIdentityDigest(effectiveRuleSet);
  return Object.freeze({
    ruleset_ref: Object.freeze({ ...ruleset.ruleset_ref }),
    effective_ruleset_digest: `sha256:${compilationIdentityDigest}`,
    compilation_identity_digest: compilationIdentityDigest,
    rules: ruleset.rules,
    profile_rule_provenance: ruleset.profile_rule_provenance,
  });
}

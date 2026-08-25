// Public-safe logical role roster binding.
//
// The module accepts bounded plain data and returns one deterministic candidate-only
// roster. It has no execution adapter and grants no assignment or write authority.

import { types } from 'node:util';

import { canonicalise, compareCodePoints, inspectInstant } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import {
  exactRefIdentityKey,
  isWellFormedRef,
  logicalRevisionKey,
  sameExactRef,
} from '../../../core/validators/identity.mjs';

export const AX_SE_PROJECT_ROLE_ROSTER_PACKET_SCHEMA = 'soulforge.ax_se_project_role_roster_packet.v0';
export const AX_SE_PROJECT_ROLE_ROSTER_SCHEMA = 'soulforge.ax_se_project_role_roster.v0';

export const AX_SE_PROJECT_ROLE_ROSTER_CODES = Object.freeze({
  INPUT_INVALID: 'AX_SE_ROLE_ROSTER_INPUT_INVALID',
  INPUT_UNSAFE: 'AX_SE_ROLE_ROSTER_INPUT_UNSAFE',
  INPUT_UNBOUNDED: 'AX_SE_ROLE_ROSTER_INPUT_UNBOUNDED',
  REFERENCE_INVALID: 'AX_SE_ROLE_ROSTER_REFERENCE_INVALID',
  PROJECT_BINDING_MISMATCH: 'AX_SE_ROLE_ROSTER_PROJECT_BINDING_MISMATCH',
});

const HASH_DOMAIN = AX_SE_PROJECT_ROLE_ROSTER_SCHEMA;
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const REQUEST_FIELDS = Object.freeze(['rosterPacket', 'expectedProjectBindingRef']);
const PACKET_FIELDS = Object.freeze([
  'schema_version', 'project_binding_ref', 'role_roster_identity', 'source_revision_refs',
  'capability_vocabulary_ref', 'valid_at', 'known_at', 'coverage_state', 'roles',
]);
const IDENTITY_FIELDS = Object.freeze(['entity_id', 'revision_id']);
const REF_FIELDS = Object.freeze(['entity_id', 'revision_id', 'content_id', 'content_hash_alg']);
const ROLE_FIELDS = Object.freeze(['role_id', 'routing_state', 'capabilities']);
const COVERAGE_STATES = new Set(['complete', 'partial', 'unknown']);
const ROUTING_STATES = new Set(['eligible', 'ineligible', 'unknown']);
const FORBIDDEN_KEYS = new Set([
  'raw', 'raw_text', 'source_text', 'chunk', 'chunks', 'answer', 'answer_text',
  'body', 'payload', 'prompt', 'completion', 'private_path', 'absolute_path',
  'source_path', 'secret', 'credential', 'password', 'cookie', 'token',
]);
const FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
  /(?:^|[^A-Za-z0-9_])\/(?:tmp|temp|var|etc|opt|srv|usr|bin|sbin|lib|dev|proc|sys|root|home|users|mnt|media|private|data|Applications|Library|Volumes)\/\S/iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
]);
const MAX = Object.freeze({ depth: 12, values: 20000, array: 128, keys: 16, string: 512 });
const AUTHORITY = Object.freeze({
  candidate_only: true,
  roster_approval_claimed: false,
  human_identity_bound: false,
  live_availability_claimed: false,
  assignment_made: false,
  task_intent_created: false,
  erp_write_allowed: false,
  canon_promotion_allowed: false,
});

function fail(code, message, detail = {}) {
  throw new ContractError(code, message, detail);
}

function assertSafeString(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX.string
      || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNSAFE,
      'input strings must be bounded non-empty NFC text without controls', { field });
  }
  if (FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
    fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNSAFE,
      'private paths, credentials, and payload-bearing strings are forbidden', { field });
  }
  return value;
}

function snapshotPlainData(root) {
  const seen = new WeakSet();
  let values = 0;

  const walk = (value, depth, field) => {
    values += 1;
    if (values > MAX.values || depth > MAX.depth) {
      fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNBOUNDED,
        'input exceeds the bounded plain-data limits');
    }
    if (typeof value === 'string') return assertSafeString(value, field);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) {
        fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNSAFE,
          'only safe integers are accepted', { field });
      }
      return value;
    }
    if (value === null || typeof value !== 'object') {
      fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNSAFE,
        'only non-null plain JSON data is accepted', { field });
    }
    if (types.isProxy(value)) {
      fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNSAFE,
        'Proxy input is refused before reflective access', { field });
    }
    if (seen.has(value)) {
      fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNSAFE,
        'cyclic and aliased object graphs are refused', { field });
    }
    seen.add(value);

    let prototype;
    let descriptors;
    try {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNSAFE,
        'input reflection failed without exposing caller text', { field });
    }
    const array = Array.isArray(value);
    if ((array && prototype !== Array.prototype) || (!array && prototype !== Object.prototype)) {
      fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNSAFE,
        'custom prototypes and host objects are refused', { field });
    }
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) {
      fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNSAFE,
        'symbol properties are not accepted', { field });
    }
    const dataKeys = array ? keys.filter((key) => key !== 'length') : keys;
    const arrayLength = array ? descriptors.length?.value : undefined;
    if (array) {
      if (!Number.isSafeInteger(arrayLength) || arrayLength < 0 || arrayLength > MAX.array) {
        fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNBOUNDED,
          'arrays must be dense, unnamed, and within the item limit', { field });
      }
      const expected = new Set(Array.from({ length: arrayLength }, (_, index) => String(index)));
      if (dataKeys.length !== expected.size || dataKeys.some((key) => !expected.has(key))) {
        fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNBOUNDED,
          'arrays must be dense, unnamed, and within the item limit', { field });
      }
    } else if (dataKeys.length > MAX.keys) {
      fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNBOUNDED,
        'an input object exceeds the field limit', { field });
    }

    const copy = array ? new Array(arrayLength) : {};
    for (const key of dataKeys) {
      if (key.length > 80 || key.normalize('NFC') !== key || FORBIDDEN_KEYS.has(key.toLowerCase())) {
        fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNSAFE,
          'payload-bearing, unsafe, or unbounded field name refused', { field });
      }
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_UNSAFE,
          'accessors and hidden fields are refused', { field });
      }
      Object.defineProperty(copy, key, {
        value: walk(descriptor.value, depth + 1, array ? `${field}[]` : `${field}.*`),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return copy;
  };

  return walk(root, 0, 'input');
}

function assertExactKeys(value, expected, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_INVALID, `${label} must be an object`);
  }
  const actual = Object.keys(value).sort(compareCodePoints);
  const allowed = [...expected].sort(compareCodePoints);
  if (actual.length !== allowed.length
      || actual.some((key, index) => key !== allowed[index])) {
    fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_INVALID,
      `${label} has missing or unexpected fields`, { field: label });
  }
}

function assertToken(value, field) {
  if (typeof value !== 'string' || !TOKEN.test(value)) {
    fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_INVALID,
      `${field} must be a bounded stable token`, { field });
  }
}

function assertExactRef(ref, field) {
  assertExactKeys(ref, REF_FIELDS, field);
  if (!isWellFormedRef(ref) || !SHA256_CONTENT_ID.test(ref.content_id)) {
    fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.REFERENCE_INVALID,
      `${field} must be an exact sha256-bound revision ref`, { field });
  }
  return ref;
}

function assertSortedUniqueKeys(rows, keyOf, field) {
  for (let index = 1; index < rows.length; index += 1) {
    if (compareCodePoints(keyOf(rows[index - 1]), keyOf(rows[index])) >= 0) {
      fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_INVALID,
        `${field} must be unique`, { field });
    }
  }
}

function arrayOrderRules(value) {
  const rules = {};
  const visit = (row, path = '') => {
    if (Array.isArray(row)) {
      rules[path] = 'insertion_ordered';
      for (const child of row) visit(child, `${path}[]`);
    } else if (row !== null && typeof row === 'object') {
      for (const [key, child] of Object.entries(row)) visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(value);
  return rules;
}

function canonicalDigest(value) {
  try {
    return sha256Hex(`${HASH_DOMAIN}\n${canonicalise(value, arrayOrderRules(value))}`);
  } catch {
    fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_INVALID,
      'role roster material is not canonically serialisable');
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Binds a source-revision-backed logical role roster without granting execution authority.
 */
export function buildAxSeProjectRoleRoster(request) {
  const input = snapshotPlainData(request);
  assertExactKeys(input, REQUEST_FIELDS, 'request');
  const { rosterPacket, expectedProjectBindingRef } = input;
  assertExactKeys(rosterPacket, PACKET_FIELDS, 'roster packet');
  if (rosterPacket.schema_version !== AX_SE_PROJECT_ROLE_ROSTER_PACKET_SCHEMA) {
    fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_INVALID,
      'roster packet schema version is unsupported');
  }

  assertExactRef(rosterPacket.project_binding_ref, 'project_binding_ref');
  assertExactRef(expectedProjectBindingRef, 'expected_project_binding_ref');
  if (!sameExactRef(rosterPacket.project_binding_ref, expectedProjectBindingRef)) {
    fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.PROJECT_BINDING_MISMATCH,
      'roster packet project binding does not match the expected project');
  }
  assertExactRef(rosterPacket.capability_vocabulary_ref, 'capability_vocabulary_ref');

  assertExactKeys(rosterPacket.role_roster_identity, IDENTITY_FIELDS, 'role roster identity');
  assertToken(rosterPacket.role_roster_identity.entity_id, 'role_roster_identity.entity_id');
  assertToken(rosterPacket.role_roster_identity.revision_id, 'role_roster_identity.revision_id');

  if (!Array.isArray(rosterPacket.source_revision_refs)
      || rosterPacket.source_revision_refs.length < 1
      || rosterPacket.source_revision_refs.length > 32) {
    fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_INVALID,
      'source_revision_refs must contain between 1 and 32 exact refs');
  }
  for (const ref of rosterPacket.source_revision_refs) assertExactRef(ref, 'source_revision_ref');
  const sourceRevisionRefs = [...rosterPacket.source_revision_refs]
    .sort((left, right) => compareCodePoints(exactRefIdentityKey(left), exactRefIdentityKey(right)));
  assertSortedUniqueKeys(sourceRevisionRefs, exactRefIdentityKey, 'source_revision_refs');
  const logicalSourceKeys = sourceRevisionRefs.map(logicalRevisionKey).sort(compareCodePoints);
  for (let index = 1; index < logicalSourceKeys.length; index += 1) {
    if (logicalSourceKeys[index - 1] === logicalSourceKeys[index]) {
      fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_INVALID,
        'source_revision_refs contain contradictory logical revisions',
        { field: 'source_revision_refs' });
    }
  }

  if (!inspectInstant(rosterPacket.valid_at).valid || !inspectInstant(rosterPacket.known_at).valid) {
    fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_INVALID,
      'valid_at and known_at must be canonical instants');
  }
  if (compareCodePoints(rosterPacket.known_at, rosterPacket.valid_at) < 0) {
    fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_INVALID,
      'known_at cannot precede valid_at');
  }
  if (!COVERAGE_STATES.has(rosterPacket.coverage_state)) {
    fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_INVALID,
      'coverage_state is unsupported');
  }

  if (!Array.isArray(rosterPacket.roles)
      || rosterPacket.roles.length < 1
      || rosterPacket.roles.length > 128) {
    fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_INVALID,
      'roles must contain between 1 and 128 logical roles');
  }
  const roles = rosterPacket.roles.map((role) => {
    assertExactKeys(role, ROLE_FIELDS, 'role');
    assertToken(role.role_id, 'role.role_id');
    if (!ROUTING_STATES.has(role.routing_state)) {
      fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_INVALID,
        'role routing_state is unsupported');
    }
    if (!Array.isArray(role.capabilities)
        || role.capabilities.length < 1
        || role.capabilities.length > 64) {
      fail(AX_SE_PROJECT_ROLE_ROSTER_CODES.INPUT_INVALID,
        'role capabilities must contain between 1 and 64 tokens');
    }
    for (const capability of role.capabilities) assertToken(capability, 'role.capability');
    const capabilities = [...role.capabilities].sort(compareCodePoints);
    assertSortedUniqueKeys(capabilities, (value) => value, 'role capabilities');
    return { role_id: role.role_id, routing_state: role.routing_state, capabilities };
  }).sort((left, right) => compareCodePoints(left.role_id, right.role_id));
  assertSortedUniqueKeys(roles, (role) => role.role_id, 'roles');
  const unknownRoutingCount = roles.filter((role) => role.routing_state === 'unknown').length;
  const exclusivitySupported = rosterPacket.coverage_state === 'complete' && unknownRoutingCount === 0;

  const material = {
    schema_version: AX_SE_PROJECT_ROLE_ROSTER_SCHEMA,
    project_binding_ref: rosterPacket.project_binding_ref,
    capability_vocabulary_ref: rosterPacket.capability_vocabulary_ref,
    source_revision_refs: sourceRevisionRefs,
    valid_at: rosterPacket.valid_at,
    known_at: rosterPacket.known_at,
    coverage_state: rosterPacket.coverage_state,
    unknown_routing_count: unknownRoutingCount,
    exclusivity_supported: exclusivitySupported,
    roles,
    authority: { ...AUTHORITY },
  };
  const roleRosterRef = {
    entity_id: rosterPacket.role_roster_identity.entity_id,
    revision_id: rosterPacket.role_roster_identity.revision_id,
    content_id: `sha256:${canonicalDigest(material)}`,
    content_hash_alg: 'sha256',
  };
  return deepFreeze({
    schema_version: material.schema_version,
    project_binding_ref: material.project_binding_ref,
    role_roster_ref: roleRosterRef,
    capability_vocabulary_ref: material.capability_vocabulary_ref,
    source_revision_refs: material.source_revision_refs,
    valid_at: material.valid_at,
    known_at: material.known_at,
    coverage_state: material.coverage_state,
    unknown_routing_count: material.unknown_routing_count,
    exclusivity_supported: material.exclusivity_supported,
    roles: material.roles,
    authority: material.authority,
  });
}

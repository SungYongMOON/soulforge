// R3 of the SE stage rule source model: the step that lets the engine judge a stage from the
// compiled standard+overlay policy instead of a hand-written slot list.
//
// `compileStageRules` answers "which artifacts does this stage require, and on what authority".
// The engine's context-pilot subject answers "given those requirements and these observations,
// what is the state of this project". Between them sits one mechanical translation, and until
// now it lived in a throwaway script: take a pilot packet that a run already validated, swap in
// the compiled policy, re-key the observations from artifact identity to requirement identity,
// and re-mint every digest that binds the packet to itself. This module is that translation.
//
// Four rules give it its shape.
//
// 1. The stage rules own the policy and nothing else. Everything a compiled rule table has no
//    opinion about — the Knowledge View request, the Owner's root grant, the role roster, the
//    objective, the risks, the project binding — is carried through from a base packet that was
//    already accepted, byte for byte. A generator that reinvented those would be asserting facts
//    no compile established.
// 2. Observations arrive at artifact level, because that is the level a person or a scan can
//    actually see: "the BOM is in 03_Out". Which requirement that satisfies is the mapping
//    table's answer, not the observer's. An observation whose artifact maps to no requirement of
//    this policy is reported and dropped, never guessed into the nearest requirement.
// 3. Every digest the subject recomputes is recomputed here from the same material under the
//    same domain, so the packet this module emits is one the subject accepts or one it refuses
//    for a reason that is in the material rather than in the wiring. The digests are reproduced
//    rather than imported for the reason stated at the pins below.
// 4. Nothing here reads a file, a clock, a random source, an environment value, or a network.
//    Two callers holding the same request reach byte-identical packets, which is the only way a
//    packet sha256 can appear in a launch file the caller writes later.
import { createHash } from 'node:crypto';

import { canonicalise, compareCodePoints, isCanonicalInstant } from '../kernel/canonical.mjs';
import { CANONICAL, REF_REQUIRED_FIELDS } from '../kernel/contract_config.mjs';
import {
  exactRefIdentityKey,
  inspectIdentifierOpacity,
  isWellFormedRef,
  logicalRevisionKey,
} from '../kernel/identity.mjs';
import { ENGINE_STAGE_POLICY_SCHEMA_VERSION, mintEnginePolicyRef } from './stage_rule_compiler.mjs';

export const PILOT_PACKET_GENERATOR_SCHEMA_VERSION = 'soulforge.ax_se_pilot_packet_generator.v0';
export const GENERATOR_VERSION = 'v0';

// The consumer's frozen schema versions and hash domains, restated rather than imported.
//
// `subjects/ax_se_project_context_pilot.mjs` exports all of these, and it would be the obvious
// import. It also imports the node utility module, and through the shared Knowledge View
// selector it reaches the node filesystem module; importing it would put both into a module
// whose whole contract is that its import graph reaches nothing but the node crypto module —
// which is also why the tokens are spelled out in prose here rather than written as specifiers,
// since the static effect pin reads this file as text. The values are pinned instead: the test
// suite imports each subject's own export and asserts equality, and then runs the real subject
// over a packet this module produced, so a drift here fails there rather than in a caller's run.
export const AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA_PIN =
  'soulforge.ax_se_project_context_pilot_packet.v0';
export const AX_SE_PROJECT_CONTEXT_PILOT_GRANT_SCHEMA_PIN =
  'soulforge.ax_se_project_context_pilot_grant.v0';
export const AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_SCHEMA_PIN =
  'soulforge.ax_se_project_source_binding_manifest.v0';
export const AX_SE_PROJECT_ROLE_BOUND_PACKET_SCHEMA_PIN =
  'soulforge.ax_se_project_role_bound_packet.v1';
export const AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA_PIN =
  'soulforge.ax_se_project_context_packet.v0';
export const PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_PIN =
  'soulforge.project_knowledge_view_request.v0';
export const PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_PIN =
  'soulforge.project_knowledge_view_authority_grant.v0';
export const AX_SE_PROJECT_CONTEXT_PILOT_LAUNCH_SCHEMA_PIN =
  'soulforge.ax_se_project_context_pilot_launch.v0';

export const AX_SE_PROJECT_CONTEXT_PILOT_GRANT_HASH_DOMAIN_PIN =
  'soulforge.ax_se_project_context_pilot.grant.v0';
export const AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_HASH_DOMAIN_PIN =
  'soulforge.ax_se_project_context_pilot.material.v0';
export const AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN_PIN =
  'soulforge.ax_se_project_context_pilot.project_source_binding_manifest.v0';
export const AX_SE_PROJECT_CONTEXT_COMMON_BINDINGS_HASH_DOMAIN_PIN =
  'soulforge.ax_se_project_context_pilot.common_projection_bindings.v0';
export const PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN_PIN =
  'soulforge.project_knowledge_view.authority_grant.v0';

// `kernel/custody.mjs` owns these three tokens. Same reason as above: the pin is asserted
// against that module's export in the test rather than imported here.
export const PRESENCE_STATES_PIN = Object.freeze(['present', 'unknown', 'absence_confirmed']);
const PRESENCE_UNKNOWN = 'unknown';
const PRESENCE_PRESENT = 'present';
const PRESENCE_ABSENCE_CONFIRMED = 'absence_confirmed';

export const PILOT_PACKET_GENERATOR_CODES = Object.freeze({
  REQUEST_INVALID: 'PILOT_PACKET_GENERATOR_REQUEST_INVALID',
  BASE_PACKET_INVALID: 'PILOT_PACKET_GENERATOR_BASE_PACKET_INVALID',
  POLICY_MATERIAL_INVALID: 'PILOT_PACKET_GENERATOR_POLICY_MATERIAL_INVALID',
  MAPPING_TABLE_INVALID: 'PILOT_PACKET_GENERATOR_MAPPING_TABLE_INVALID',
  OBSERVATION_INVALID: 'PILOT_PACKET_GENERATOR_OBSERVATION_INVALID',
  COMMON_BINDING_UNRESOLVED: 'PILOT_PACKET_GENERATOR_COMMON_BINDING_UNRESOLVED',
  IDENTITY_COLLISION: 'PILOT_PACKET_GENERATOR_IDENTITY_COLLISION',
  MATERIAL_INVALID: 'PILOT_PACKET_GENERATOR_MATERIAL_INVALID',
});

export class PilotPacketGeneratorError extends Error {
  constructor(code, message, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'PilotPacketGeneratorError';
    this.code = code;
    this.detail = detail;
  }
}

// Refusals carry a static field label and nothing else. A rejected identifier, path, or value
// must not travel back to the caller inside the error it caused.
const fail = (code, message, detail = {}) => {
  throw new PilotPacketGeneratorError(code, message, detail);
};

// ---------------------------------------------------------------- declared shapes

const REQUEST_REQUIRED_FIELDS = Object.freeze([
  'base_packet', 'engine_stage_policy_material', 'mapping_table', 'artifact_observations',
  'policy_identity', 'packet_identity_seed', 'known_at',
]);
const REQUEST_OPTIONAL_FIELDS = Object.freeze(['common_binding_requirement_id']);
const POLICY_IDENTITY_FIELDS = Object.freeze(['policy_id', 'revision_label']);
const PILOT_PACKET_FIELDS = Object.freeze([
  'schema_version', 'feature_state', 'knowledge_view_request', 'knowledge_view_authority_grant',
  'common_projection_bindings', 'project_source_binding_manifest', 'pilot_grant',
  'role_bound_packet',
]);
const PILOT_GRANT_FIELDS = Object.freeze([
  'schema_version', 'feature_state', 'authority_ceiling', 'grant_ref',
  'knowledge_view_authority_grant_ref', 'project_binding_ref',
  'project_source_binding_manifest_ref', 'pilot_material_fingerprint_sha256',
  'expected_role_roster_ref',
]);
const MANIFEST_FIELDS = Object.freeze([
  'schema_version', 'manifest_ref', 'project_binding_ref', 'project_material_revision_refs',
]);
const COMMON_BINDING_FIELDS = Object.freeze(['common_revision_ref', 'policy_requirement_ref']);
const ROLE_BOUND_PACKET_FIELDS = Object.freeze([
  'schema_version', 'context_packet', 'expected_project_binding_ref', 'policy',
  'policy_capability_vocabulary_ref', 'role_roster_packet',
]);
const CONTEXT_PACKET_FIELDS = Object.freeze([
  'schema_version', 'project_binding_ref', 'objective_ref', 'policy_ref',
  'project_snapshot_identity', 'observations', 'risks',
]);
const KNOWLEDGE_VIEW_REQUEST_FIELDS = Object.freeze([
  'schema_version', 'feature_state', 'project_binding_refs', 'common_revision_refs',
]);
const KNOWLEDGE_VIEW_GRANT_FIELDS = Object.freeze([
  'schema_version', 'feature_state', 'authority_ceiling', 'grant_ref', 'policy_ref',
  'project_binding_ref', 'project_root_path', 'common_root_path', 'containment_root_path',
  'approved_common_revision_refs',
]);
const OBSERVATION_REQUIRED_FIELDS = Object.freeze([
  'observation_id', 'presence_state', 'observation_attempt_ref', 'artifact_revision_ref',
  'evidence_refs', 'valid_at', 'known_at',
]);
const OBSERVATION_OPTIONAL_FIELDS = Object.freeze([
  'artifact_type_id', 'alias', 'conflict_claims',
]);
const REQUIREMENT_FIELDS = Object.freeze([
  'requirement_id', 'requirement_kind', 'required_capability', 'requirement_ref',
  'authority_family', 'applicability', 'valid_at', 'known_at',
]);
const LAUNCH_MATERIAL_FIELDS = Object.freeze([
  'expected_pilot_grant_ref', 'expected_project_source_binding_manifest_ref',
  'expected_role_roster_ref', 'expected_common_projection_bindings_fingerprint_sha256',
  'expected_project_binding_ref', 'expected_knowledge_view_authority_grant_ref',
  'pilot_packet_sha256',
]);

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CONTENT_DERIVED_REVISION = /^[0-9a-f]{12,64}$/iu;
const NUMBERED_REVISION = /(?:^|[-_.])(?:r|rev|v)\d+(?:[-_.]\d+)*$/iu;
const SHA256_TAGGED = /^sha256:[0-9a-f]{64}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const SECRET_PATTERNS = Object.freeze([
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
]);
// Payload-bearing field names. The base packet legitimately carries Owner root paths inside the
// Knowledge View grant, so the locator patterns the engine subjects apply to their own inputs
// are deliberately not reproduced here; what this module refuses is a field that would carry a
// document body or a credential through it.
const FORBIDDEN_KEYS = new Set([
  'raw', 'raw_text', 'source_text', 'chunk', 'chunks', 'answer', 'answer_text',
  'body', 'payload', 'prompt', 'completion', 'secret', 'credential', 'password',
  'cookie', 'token',
]);

// Bounds belong to this seam and not to its caller, so that one call stays one bounded call
// whatever the request claims about itself.
const MAX = Object.freeze({
  depth: 28, values: 60000, array: 1024, keys: 48, string: 4096, key: 96,
});

// ---------------------------------------------------------------- bounded plain data

/**
 * Copies the whole request graph into fresh plain data before anything reads it semantically.
 *
 * A custom prototype, an accessor, a symbol key, a sparse array, a cycle, an unsafe number, or
 * a payload-bearing field name is refused here rather than at the first field that happens to
 * touch it. Proxy detection is the one guard the engine subjects have that this does not:
 * `types.isProxy` lives in the node utility module, and a second bare specifier would break the
 * import contract this module keeps. Every value is read exactly once and copied, so a Proxy
 * cannot make the emitted packet disagree with the packet that was validated, and the subject
 * that does own the Proxy guard re-validates the result before any run consumes it.
 */
function snapshotPlainData(root) {
  const seen = new WeakSet();
  let values = 0;

  const walk = (value, depth) => {
    values += 1;
    if (values > MAX.values || depth > MAX.depth) {
      fail(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID, 'request exceeds the bounded plain-data limits');
    }
    if (typeof value === 'string') {
      if (value.length === 0 || value.length > MAX.string
          || value.normalize('NFC') !== value
          || CONTROL_CHARACTERS.test(value)
          || SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
        fail(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID, 'a request string is unbounded, denormalised, or secret-shaped');
      }
      return value;
    }
    if (typeof value === 'boolean') return value;
    // `null` is accepted as a leaf because the compiler's own mapping table uses it for "this
    // row has no engine requirement" and "this row has no alias". It never reaches the emitted
    // packet: the canonical layer forbids null outright, and every digest below is taken over a
    // projection with the null keys omitted.
    if (value === null) return null;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) {
        fail(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID, 'only safe integers are accepted');
      }
      return value;
    }
    if (typeof value !== 'object') {
      fail(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID, 'only plain JSON data is accepted');
    }
    if (seen.has(value)) {
      fail(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID, 'cyclic and aliased object graphs are refused');
    }
    seen.add(value);

    let prototype;
    let descriptors;
    try {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      fail(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID, 'request reflection failed without exposing caller text');
    }
    const array = Array.isArray(value);
    if ((array && prototype !== Array.prototype)
        || (!array && prototype !== Object.prototype && prototype !== null)) {
      fail(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID, 'custom prototypes and host objects are refused');
    }
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) {
      fail(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID, 'symbol properties are not accepted');
    }
    const dataKeys = array ? keys.filter((key) => key !== 'length') : keys;
    if (array) {
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX.array) {
        fail(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID, 'arrays must be dense and within the item limit');
      }
      const expected = new Set(Array.from({ length }, (_, index) => String(index)));
      if (dataKeys.length !== expected.size || dataKeys.some((key) => !expected.has(key))) {
        fail(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID, 'arrays must be dense, unnamed, and within the item limit');
      }
      const copy = new Array(length);
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
          fail(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID, 'accessors and hidden fields are refused');
        }
        copy[index] = walk(descriptor.value, depth + 1);
      }
      return copy;
    }
    if (dataKeys.length > MAX.keys) {
      fail(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID, 'a request object exceeds the field limit');
    }
    // Every own key is defined explicitly so that even a literal `__proto__` stays inert data.
    const copy = {};
    for (const key of dataKeys) {
      const descriptor = descriptors[key];
      if (key.length > MAX.key || key.normalize('NFC') !== key
          || FORBIDDEN_KEYS.has(key.toLowerCase())
          || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
        fail(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID, 'payload-bearing, unsafe, or hidden field refused');
      }
      Object.defineProperty(copy, key, {
        value: walk(descriptor.value, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return copy;
  };

  return walk(root, 0);
}

// ---------------------------------------------------------------- shape assertions

function assertExactKeys(value, required, optional, where, code) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${where} must be an object`, { where });
  }
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    fail(code, `${where} has missing or unexpected fields`, {
      where, missing, unexpected_count: unexpected.length,
    });
  }
  return value;
}

function assertToken(value, where, code) {
  if (typeof value !== 'string' || !TOKEN.test(value)) {
    fail(code, `${where} must be a bounded stable token`, { where });
  }
  return value;
}

function assertInstant(value, where, code) {
  if (!isCanonicalInstant(value)) fail(code, `${where} must be a canonical instant`, { where });
  return value;
}

function assertArray(value, where, code) {
  if (!Array.isArray(value) || value.length > MAX.array) {
    fail(code, `${where} must be an explicit array within its item limit`, { where });
  }
  return value;
}

/**
 * The exact-ref rule the pilot subject applies, reproduced field for field.
 *
 * The subject is stricter than the kernel: on top of a well-formed sha256-bound ref it demands
 * an opaque identifier in a shape that cannot carry a project code or a path, and a revision id
 * that names one immutable state rather than a moving label such as `latest`. A ref that would
 * fail there must fail here, or this module would emit packets that only fail at run time.
 */
function assertExactRef(ref, where, code) {
  assertExactKeys(ref, REF_REQUIRED_FIELDS, [], where, code);
  if (!isWellFormedRef(ref)
      || ref.content_hash_alg !== 'sha256'
      || !SHA256_TAGGED.test(ref.content_id)
      || !SAFE_IDENTIFIER.test(ref.entity_id)
      || !SAFE_IDENTIFIER.test(ref.revision_id)
      || inspectIdentifierOpacity(ref.entity_id).opaque !== true
      || inspectIdentifierOpacity(ref.revision_id).opaque !== true
      || !(CANONICAL_UUID.test(ref.revision_id)
        || CONTENT_DERIVED_REVISION.test(ref.revision_id)
        || NUMBERED_REVISION.test(ref.revision_id))) {
    fail(code, `${where} must be an exact, opaque, immutably revisioned sha256 ref`, { where });
  }
  return ref;
}

const cloneRef = (ref) => ({
  entity_id: ref.entity_id,
  revision_id: ref.revision_id,
  content_id: ref.content_id,
  content_hash_alg: ref.content_hash_alg,
});

function sortedUniqueRefs(refs, where, code) {
  const byIdentity = new Map();
  const byLogical = new Map();
  for (const ref of refs) {
    assertExactRef(ref, where, code);
    const identity = exactRefIdentityKey(ref);
    const logical = logicalRevisionKey(ref);
    if (byLogical.has(logical) && byLogical.get(logical) !== identity) {
      // One revision of one subject naming two different byte sets is a contradiction in the
      // input, not a second entry.
      fail(code, `${where} names one logical revision with two different content ids`, { where });
    }
    byLogical.set(logical, identity);
    byIdentity.set(identity, cloneRef(ref));
  }
  return [...byIdentity.values()]
    .sort((left, right) => compareCodePoints(exactRefIdentityKey(left), exactRefIdentityKey(right)));
}

// ---------------------------------------------------------------- canonical digests

const sha256Hex = (input) => createHash(CANONICAL.hashAlgorithm).update(input).digest('hex');

/** Declares every array insertion-ordered at the exact paths the canonical layer asks about. */
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

/** Drops keys whose value is `null`; the canonical layer forbids null and rightly so. */
function withoutNulls(value) {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== null) out[key] = withoutNulls(child);
    }
    return out;
  }
  return value;
}

function canonicalText(value, code) {
  try {
    return canonicalise(value, arrayOrderRules(value));
  } catch (error) {
    // The canonical layer names the offending path and echoes the rejected value in its detail;
    // neither belongs in a refusal that travels back to a caller.
    return fail(code, 'generator material is not canonically serialisable',
      { contract_code: error?.code ?? null });
  }
}

/** The `domain\ncanonical` digest the compiler and the engine's policy rule both use. */
function canonicalDigest(domain, value) {
  return sha256Hex(`${domain}\n${canonicalText(withoutNulls(value), PILOT_PACKET_GENERATOR_CODES.MATERIAL_INVALID)}`);
}

/**
 * The `domain\0canonical` fingerprint the pilot subject and the Knowledge View selector use.
 *
 * Two separators exist in this codebase because two layers chose differently, and the choice is
 * part of each digest. Using one where the other belongs produces a well-formed hash that the
 * consumer then rejects, so both are kept explicit here rather than unified.
 */
function nulFingerprint(domain, value) {
  return `sha256:${sha256Hex(`${domain}\0${canonicalText(value, PILOT_PACKET_GENERATOR_CODES.MATERIAL_INVALID)}`)}`;
}

const generatorDomain = (name) => `${PILOT_PACKET_GENERATOR_SCHEMA_VERSION}.${name}`;

/**
 * Mints one opaque identifier in canonical UUID layout from declared material.
 *
 * The layout matters: the consumers accept an entity or revision id only if it is opaque, and a
 * canonical UUID is opaque by construction because every character is hex in a fixed shape and
 * so cannot carry a project code, a path, or a date. The bits are a digest rather than a random
 * draw, which is what makes two callers holding one request reach one packet.
 */
function mintedIdentifier(domain, parts) {
  const hex = sha256Hex(`${domain}\n${parts.join('\u001f')}`);
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32),
  ].join('-');
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// ---------------------------------------------------------------- consumer digest rules

function knowledgeViewAuthorityGrantContentId(grant) {
  return nulFingerprint(PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN_PIN, {
    schema_version: grant.schema_version,
    feature_state: grant.feature_state,
    authority_ceiling: grant.authority_ceiling,
    policy_ref: grant.policy_ref,
    project_binding_ref: grant.project_binding_ref,
    project_root_path: grant.project_root_path,
    common_root_path: grant.common_root_path,
    containment_root_path: grant.containment_root_path,
    approved_common_revision_refs: grant.approved_common_revision_refs,
  });
}

function manifestContentId(manifest) {
  return nulFingerprint(AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN_PIN, {
    schema_version: manifest.schema_version,
    project_binding_ref: manifest.project_binding_ref,
    project_material_revision_refs: manifest.project_material_revision_refs,
  });
}

function pilotMaterialFingerprint(packet) {
  return nulFingerprint(AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_HASH_DOMAIN_PIN, {
    knowledge_view_request: packet.knowledge_view_request,
    common_projection_bindings: packet.common_projection_bindings,
    project_source_binding_manifest: packet.project_source_binding_manifest,
    role_bound_packet: packet.role_bound_packet,
  });
}

function pilotGrantContentId(grant) {
  return nulFingerprint(AX_SE_PROJECT_CONTEXT_PILOT_GRANT_HASH_DOMAIN_PIN, {
    schema_version: grant.schema_version,
    feature_state: grant.feature_state,
    authority_ceiling: grant.authority_ceiling,
    knowledge_view_authority_grant_ref: grant.knowledge_view_authority_grant_ref,
    project_binding_ref: grant.project_binding_ref,
    project_source_binding_manifest_ref: grant.project_source_binding_manifest_ref,
    pilot_material_fingerprint_sha256: grant.pilot_material_fingerprint_sha256,
    expected_role_roster_ref: grant.expected_role_roster_ref,
  });
}

const commonBindingsFingerprint = (bindings) => nulFingerprint(
  AX_SE_PROJECT_CONTEXT_COMMON_BINDINGS_HASH_DOMAIN_PIN, bindings,
);

/**
 * Every project-plane revision the packet rests on, in the exact partition the subject expects.
 *
 * Reproduced from the subject's own `projectMaterialRefs`. It has to be the same walk and the
 * same exclusion, not merely a similar one: the subject recomputes this set and refuses a
 * manifest that carries one ref more or one ref less. The exclusion is what keeps the partition
 * exact — a requirement the packet has declared to rest on common material belongs to the
 * Knowledge View side of the line, not to the project source manifest.
 */
function projectMaterialRefs(rolePacket, commonRequirementIdentities) {
  const code = PILOT_PACKET_GENERATOR_CODES.MATERIAL_INVALID;
  const refs = [cloneRef(rolePacket.context_packet.objective_ref)];
  for (const observation of rolePacket.context_packet.observations) {
    refs.push(cloneRef(observation.artifact_revision_ref));
    for (const ref of observation.evidence_refs) refs.push(cloneRef(ref));
    for (const claim of observation.conflict_claims ?? []) {
      refs.push(cloneRef(claim.source_revision_ref));
    }
  }
  for (const risk of rolePacket.context_packet.risks) {
    refs.push(cloneRef(risk.risk_ref));
    for (const ref of risk.evidence_refs) refs.push(cloneRef(ref));
  }
  for (const ref of rolePacket.role_roster_packet.source_revision_refs) refs.push(cloneRef(ref));
  refs.push(cloneRef(rolePacket.policy_capability_vocabulary_ref));
  for (const stage of rolePacket.policy.stages) {
    for (const requirement of stage.requirements) {
      if (!commonRequirementIdentities.has(exactRefIdentityKey(requirement.requirement_ref))) {
        refs.push(cloneRef(requirement.requirement_ref));
      }
    }
  }
  return sortedUniqueRefs(refs, 'project_material_revision_refs', code);
}

// ---------------------------------------------------------------- input validation

function validateBasePacket(basePacket) {
  const code = PILOT_PACKET_GENERATOR_CODES.BASE_PACKET_INVALID;
  assertExactKeys(basePacket, PILOT_PACKET_FIELDS, [], 'base_packet', code);
  if (basePacket.schema_version !== AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA_PIN
      || basePacket.feature_state !== 'off') {
    fail(code, 'base_packet must be an off-state context pilot packet', { where: 'base_packet' });
  }

  const request = assertExactKeys(basePacket.knowledge_view_request, KNOWLEDGE_VIEW_REQUEST_FIELDS,
    [], 'base_packet.knowledge_view_request', code);
  if (request.schema_version !== PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_PIN
      || request.feature_state !== 'off'
      || !Array.isArray(request.project_binding_refs) || request.project_binding_refs.length !== 1) {
    fail(code, 'the Knowledge View request must name exactly one project binding',
      { where: 'base_packet.knowledge_view_request' });
  }
  for (const ref of request.project_binding_refs) {
    assertExactRef(ref, 'base_packet.knowledge_view_request.project_binding_refs[]', code);
  }
  const selectedCommon = sortedUniqueRefs(
    assertArray(request.common_revision_refs,
      'base_packet.knowledge_view_request.common_revision_refs', code),
    'base_packet.knowledge_view_request.common_revision_refs', code,
  );

  const grant = assertExactKeys(basePacket.knowledge_view_authority_grant,
    KNOWLEDGE_VIEW_GRANT_FIELDS, [], 'base_packet.knowledge_view_authority_grant', code);
  if (grant.schema_version !== PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_PIN
      || grant.feature_state !== 'off') {
    fail(code, 'the Knowledge View authority grant must be off-state',
      { where: 'base_packet.knowledge_view_authority_grant' });
  }
  for (const [field, ref] of [['grant_ref', grant.grant_ref], ['policy_ref', grant.policy_ref],
    ['project_binding_ref', grant.project_binding_ref]]) {
    assertExactRef(ref, `base_packet.knowledge_view_authority_grant.${field}`, code);
  }

  const pilotGrant = assertExactKeys(basePacket.pilot_grant, PILOT_GRANT_FIELDS, [],
    'base_packet.pilot_grant', code);
  if (pilotGrant.schema_version !== AX_SE_PROJECT_CONTEXT_PILOT_GRANT_SCHEMA_PIN
      || pilotGrant.feature_state !== 'off') {
    fail(code, 'the base pilot grant must be off-state', { where: 'base_packet.pilot_grant' });
  }
  for (const field of ['project_binding_ref', 'expected_role_roster_ref']) {
    assertExactRef(pilotGrant[field], `base_packet.pilot_grant.${field}`, code);
  }

  const manifest = assertExactKeys(basePacket.project_source_binding_manifest, MANIFEST_FIELDS, [],
    'base_packet.project_source_binding_manifest', code);
  if (manifest.schema_version !== AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_SCHEMA_PIN) {
    fail(code, 'the base source binding manifest schema is unsupported',
      { where: 'base_packet.project_source_binding_manifest' });
  }
  assertExactRef(manifest.project_binding_ref,
    'base_packet.project_source_binding_manifest.project_binding_ref', code);

  const rolePacket = assertExactKeys(basePacket.role_bound_packet, ROLE_BOUND_PACKET_FIELDS, [],
    'base_packet.role_bound_packet', code);
  if (rolePacket.schema_version !== AX_SE_PROJECT_ROLE_BOUND_PACKET_SCHEMA_PIN) {
    fail(code, 'the base role-bound packet schema is unsupported',
      { where: 'base_packet.role_bound_packet' });
  }
  assertExactRef(rolePacket.expected_project_binding_ref,
    'base_packet.role_bound_packet.expected_project_binding_ref', code);
  assertExactRef(rolePacket.policy_capability_vocabulary_ref,
    'base_packet.role_bound_packet.policy_capability_vocabulary_ref', code);

  const contextPacket = assertExactKeys(rolePacket.context_packet, CONTEXT_PACKET_FIELDS, [],
    'base_packet.role_bound_packet.context_packet', code);
  if (contextPacket.schema_version !== AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA_PIN) {
    fail(code, 'the base context packet schema is unsupported',
      { where: 'base_packet.role_bound_packet.context_packet' });
  }
  assertExactRef(contextPacket.objective_ref,
    'base_packet.role_bound_packet.context_packet.objective_ref', code);
  assertExactRef(contextPacket.project_binding_ref,
    'base_packet.role_bound_packet.context_packet.project_binding_ref', code);
  assertExactKeys(contextPacket.project_snapshot_identity, ['entity_id', 'revision_id'], [],
    'base_packet.role_bound_packet.context_packet.project_snapshot_identity', code);
  assertArray(contextPacket.risks, 'base_packet.role_bound_packet.context_packet.risks', code);

  const roster = rolePacket.role_roster_packet;
  if (roster === null || typeof roster !== 'object' || Array.isArray(roster)
      || !Array.isArray(roster.source_revision_refs) || roster.source_revision_refs.length === 0) {
    fail(code, 'the base role roster packet must carry at least one source revision ref',
      { where: 'base_packet.role_bound_packet.role_roster_packet' });
  }
  for (const ref of roster.source_revision_refs) {
    assertExactRef(ref, 'base_packet.role_bound_packet.role_roster_packet.source_revision_refs[]', code);
  }

  const bindings = assertArray(basePacket.common_projection_bindings,
    'base_packet.common_projection_bindings', code);
  if (bindings.length === 0) {
    fail(code, 'base_packet.common_projection_bindings must carry at least one row',
      { where: 'base_packet.common_projection_bindings' });
  }
  for (const row of bindings) {
    assertExactKeys(row, COMMON_BINDING_FIELDS, [], 'base_packet.common_projection_bindings[]', code);
    assertExactRef(row.common_revision_ref,
      'base_packet.common_projection_bindings[].common_revision_ref', code);
    assertExactRef(row.policy_requirement_ref,
      'base_packet.common_projection_bindings[].policy_requirement_ref', code);
  }
  if (bindings.length !== selectedCommon.length) {
    // The subject requires the bound common revisions and the selected ones to be the same set,
    // one row each. A base packet that already disagreed would produce a packet refused for a
    // reason the caller could not act on.
    fail(code, 'each selected common revision must carry exactly one projection binding',
      { where: 'base_packet.common_projection_bindings' });
  }

  return { selectedCommon };
}

function validatePolicyMaterial(material, knownAt) {
  const code = PILOT_PACKET_GENERATOR_CODES.POLICY_MATERIAL_INVALID;
  assertExactKeys(material, ['schema_version', 'stages'], [], 'engine_stage_policy_material', code);
  if (material.schema_version !== ENGINE_STAGE_POLICY_SCHEMA_VERSION) {
    fail(code, 'engine_stage_policy_material carries an unsupported schema version',
      { where: 'engine_stage_policy_material.schema_version' });
  }
  const stages = assertArray(material.stages, 'engine_stage_policy_material.stages', code);
  if (stages.length === 0) {
    fail(code, 'engine_stage_policy_material must carry at least one stage',
      { where: 'engine_stage_policy_material.stages' });
  }
  const requirementById = new Map();
  for (const stage of stages) {
    assertExactKeys(stage, ['stage_code', 'stage_label', 'sequence', 'requirements'], [],
      'engine_stage_policy_material.stages[]', code);
    const requirements = assertArray(stage.requirements,
      'engine_stage_policy_material.stages[].requirements', code);
    if (requirements.length === 0) {
      fail(code, 'each stage must own at least one requirement',
        { where: 'engine_stage_policy_material.stages[].requirements' });
    }
    for (const requirement of requirements) {
      assertExactKeys(requirement, REQUIREMENT_FIELDS, [],
        'engine_stage_policy_material.stages[].requirements[]', code);
      assertToken(requirement.requirement_id, 'requirement_id', code);
      assertExactRef(requirement.requirement_ref, 'requirement_ref', code);
      assertInstant(requirement.valid_at, 'requirement.valid_at', code);
      assertInstant(requirement.known_at, 'requirement.known_at', code);
      if (compareCodePoints(knownAt, requirement.known_at) < 0) {
        // The request's instant is what the generated packet claims to know as of. A requirement
        // known later than that would be a fact the packet cannot yet have had.
        fail(code, 'a requirement is known later than the instant the request states',
          { where: 'engine_stage_policy_material.stages[].requirements[].known_at' });
      }
      if (requirementById.has(requirement.requirement_id)) {
        fail(code, 'requirement ids must be lifecycle-unique',
          { where: 'engine_stage_policy_material.stages[].requirements[].requirement_id' });
      }
      requirementById.set(requirement.requirement_id, requirement);
    }
  }
  return requirementById;
}

/**
 * The artifact-to-requirement index the observations are re-keyed through.
 *
 * Both the standard token and the project's own slot name are accepted keys, because both are
 * names a real observer uses and the mapping table is the one place that knows they mean the
 * same row. A key that two rows answer differently is refused rather than resolved: choosing
 * one would file a real artifact under a requirement nobody mapped it to.
 */
function buildRequirementIndex(mappingTable, requirementById) {
  const code = PILOT_PACKET_GENERATOR_CODES.MAPPING_TABLE_INVALID;
  const rows = assertArray(mappingTable, 'mapping_table', code);
  const byArtifactType = new Map();
  const byAlias = new Map();
  const bind = (index, key, requirementId, where) => {
    if (index.has(key) && index.get(key) !== requirementId) {
      fail(code, `${where} names one artifact under two engine requirements`, { where });
    }
    index.set(key, requirementId);
  };
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      fail(code, 'mapping_table rows must be objects', { where: 'mapping_table[]' });
    }
    const requirementId = row.engine_requirement_id;
    // A row with no engine requirement is a context row the compiler deliberately kept visible
    // without enforcing. It is not an index entry, and an observation that lands on it is
    // unbound rather than silently attached to some neighbouring requirement.
    if (requirementId === null || requirementId === undefined) continue;
    assertToken(requirementId, 'mapping_table[].engine_requirement_id', code);
    if (!requirementById.has(requirementId)) {
      fail(code, 'mapping_table names an engine requirement the policy material does not declare',
        { where: 'mapping_table[].engine_requirement_id' });
    }
    if (typeof row.artifact_type_id === 'string') {
      bind(byArtifactType, assertToken(row.artifact_type_id, 'mapping_table[].artifact_type_id', code),
        requirementId, 'mapping_table[].artifact_type_id');
    }
    if (typeof row.alias === 'string' && row.alias.length > 0) {
      bind(byAlias, row.alias, requirementId, 'mapping_table[].alias');
    }
  }
  return { byArtifactType, byAlias };
}

// ---------------------------------------------------------------- observation mapping

function mapObservations(artifactObservations, index, requirementById, knownAt) {
  const code = PILOT_PACKET_GENERATOR_CODES.OBSERVATION_INVALID;
  const rows = assertArray(artifactObservations, 'artifact_observations', code);
  const emitted = new Map();
  const unbound = [];
  const counts = {
    [PRESENCE_PRESENT]: 0, [PRESENCE_ABSENCE_CONFIRMED]: 0, [PRESENCE_UNKNOWN]: 0,
  };

  for (const row of rows) {
    assertExactKeys(row, OBSERVATION_REQUIRED_FIELDS, OBSERVATION_OPTIONAL_FIELDS,
      'artifact_observations[]', code);
    const observationId = assertToken(row.observation_id, 'artifact_observations[].observation_id', code);
    const hasType = Object.hasOwn(row, 'artifact_type_id');
    const hasAlias = Object.hasOwn(row, 'alias');
    if (!hasType && !hasAlias) {
      fail(code, 'an observation must name either a standard artifact type or a project alias',
        { where: 'artifact_observations[]' });
    }
    const artifactTypeId = hasType
      ? assertToken(row.artifact_type_id, 'artifact_observations[].artifact_type_id', code)
      : null;
    const alias = hasAlias
      ? assertToken(row.alias, 'artifact_observations[].alias', code)
      : null;
    const fromType = artifactTypeId === null ? undefined : index.byArtifactType.get(artifactTypeId);
    const fromAlias = alias === null ? undefined : index.byAlias.get(alias);
    if (fromType !== undefined && fromAlias !== undefined && fromType !== fromAlias) {
      fail(code, 'an observation names a type and an alias that map to different requirements',
        { where: 'artifact_observations[]' });
    }
    const requirementId = fromType ?? fromAlias;

    if (!PRESENCE_STATES_PIN.includes(row.presence_state)) {
      fail(code, 'presence_state is not one of the declared custody states',
        { where: 'artifact_observations[].presence_state' });
    }
    assertToken(row.observation_attempt_ref, 'artifact_observations[].observation_attempt_ref', code);
    assertExactRef(row.artifact_revision_ref, 'artifact_observations[].artifact_revision_ref', code);
    assertInstant(row.valid_at, 'artifact_observations[].valid_at', code);
    assertInstant(row.known_at, 'artifact_observations[].known_at', code);
    if (compareCodePoints(row.known_at, row.valid_at) < 0) {
      fail(code, 'an observation cannot be known before the fact it asserts was dated',
        { where: 'artifact_observations[].known_at' });
    }
    if (compareCodePoints(knownAt, row.known_at) < 0) {
      fail(code, 'an observation is known later than the instant the request states',
        { where: 'artifact_observations[].known_at' });
    }
    const evidenceRefs = sortedUniqueRefs(
      assertArray(row.evidence_refs, 'artifact_observations[].evidence_refs', code),
      'artifact_observations[].evidence_refs', code,
    );
    if (evidenceRefs.length === 0 && row.presence_state !== PRESENCE_UNKNOWN) {
      // An unmade observation may legitimately cite nothing. A claim that something is present,
      // or positively absent, may not.
      fail(code, 'a present or absence-confirmed observation must cite at least one evidence ref',
        { where: 'artifact_observations[].evidence_refs' });
    }
    let conflictClaims = null;
    if (Object.hasOwn(row, 'conflict_claims')) {
      const claims = assertArray(row.conflict_claims, 'artifact_observations[].conflict_claims', code);
      if (row.presence_state !== PRESENCE_PRESENT || claims.length < 2) {
        fail(code, 'only a present observation may carry two or more disagreeing source claims',
          { where: 'artifact_observations[].conflict_claims' });
      }
      for (const claim of claims) {
        if (claim === null || typeof claim !== 'object' || Array.isArray(claim)) {
          fail(code, 'a conflict claim must be an object',
            { where: 'artifact_observations[].conflict_claims[]' });
        }
        assertExactRef(claim.source_revision_ref,
          'artifact_observations[].conflict_claims[].source_revision_ref', code);
      }
      conflictClaims = claims;
    }

    if (requirementId === undefined) {
      unbound.push({
        observation_id: observationId,
        ...(artifactTypeId === null ? {} : { artifact_type_id: artifactTypeId }),
        ...(alias === null ? {} : { alias }),
        reason_code: 'no_engine_requirement_for_artifact',
      });
      continue;
    }
    if (emitted.has(requirementId)) {
      // The engine reads at most one observation per requirement. Two would be a contradiction
      // this layer has no authority to resolve.
      fail(code, 'two observations map to one engine requirement',
        { where: 'artifact_observations[]' });
    }
    // An observation made before the requirement's own `known_at` is not refused. The two
    // instants answer different questions — when the artifact was seen, and when the binding
    // document behind the rule was known — and a project routinely observes an artifact before
    // it restates the contract revision that requires it. Only the request's instant bounds
    // both, because that is the moment the whole packet claims to speak as of.
    counts[row.presence_state] += 1;
    emitted.set(requirementId, {
      requirement_id: requirementId,
      presence_state: row.presence_state,
      observation_attempt_ref: row.observation_attempt_ref,
      artifact_revision_ref: cloneRef(row.artifact_revision_ref),
      evidence_refs: evidenceRefs,
      valid_at: row.valid_at,
      known_at: row.known_at,
      ...(conflictClaims === null ? {} : { conflict_claims: conflictClaims }),
    });
  }

  const observations = [...emitted.values()]
    .sort((left, right) => compareCodePoints(left.requirement_id, right.requirement_id));
  unbound.sort((left, right) => compareCodePoints(left.observation_id, right.observation_id));
  return { observations, unbound, counts };
}

// ---------------------------------------------------------------- common projection re-pointing

/**
 * Re-points each common projection at a requirement of the new policy.
 *
 * A projection binding says "this piece of approved common knowledge is what this policy
 * requirement rests on". The requirement identities move when the policy is recompiled, so the
 * binding has to be re-pointed — but not re-decided. If the new policy still carries the exact
 * requirement ref the base packet bound, that binding stands unchanged. Only when it does not
 * does the caller's explicitly named requirement take over, and if the caller named none the
 * whole generation is refused: silently dropping the projection would hand the manifest a
 * partition nobody chose, and guessing a requirement would put common material behind a rule
 * the Owner never pointed it at.
 */
function repointCommonBindings(baseBindings, requirementById, requestedRequirementId) {
  const code = PILOT_PACKET_GENERATOR_CODES.COMMON_BINDING_UNRESOLVED;
  const requirementRefByIdentity = new Map();
  for (const requirement of requirementById.values()) {
    requirementRefByIdentity.set(exactRefIdentityKey(requirement.requirement_ref),
      requirement.requirement_ref);
  }
  const fallback = requestedRequirementId === null
    ? null
    : requirementById.get(requestedRequirementId) ?? null;
  if (requestedRequirementId !== null && fallback === null) {
    fail(code, 'common_binding_requirement_id names no requirement of the compiled policy',
      { where: 'request.common_binding_requirement_id' });
  }

  const rows = [];
  const boundRequirements = new Set();
  const boundCommon = new Set();
  let fallbackUsed = false;
  for (const binding of baseBindings) {
    const carried = requirementRefByIdentity.get(exactRefIdentityKey(binding.policy_requirement_ref));
    let requirementRef;
    if (carried !== undefined) {
      requirementRef = carried;
    } else if (fallback !== null && !fallbackUsed) {
      requirementRef = fallback.requirement_ref;
      fallbackUsed = true;
    } else {
      fail(code, 'a common projection binding resolves to no requirement of the compiled policy',
        { where: 'base_packet.common_projection_bindings[].policy_requirement_ref' });
    }
    const commonKey = exactRefIdentityKey(binding.common_revision_ref);
    const requirementKey = exactRefIdentityKey(requirementRef);
    if (boundCommon.has(commonKey) || boundRequirements.has(requirementKey)) {
      // The subject reads these as a one-to-one map, and reads a repeat as an unresolved claim
      // about which projection stands.
      fail(code, 'common projection bindings must stay one-to-one after re-pointing',
        { where: 'common_projection_bindings' });
    }
    boundCommon.add(commonKey);
    boundRequirements.add(requirementKey);
    rows.push({
      common_revision_ref: cloneRef(binding.common_revision_ref),
      policy_requirement_ref: cloneRef(requirementRef),
      sort_key: `${commonKey}\u0000${requirementKey}`,
    });
  }
  rows.sort((left, right) => compareCodePoints(left.sort_key, right.sort_key));
  return {
    bindings: rows.map((row) => ({
      common_revision_ref: row.common_revision_ref,
      policy_requirement_ref: row.policy_requirement_ref,
    })),
    boundRequirements,
    fallbackUsed,
  };
}

// ---------------------------------------------------------------- entry point

/**
 * Turns one compiled stage policy plus artifact-level observations into one context-pilot packet
 * and the launch fields that derive from it.
 *
 * @param request `{ base_packet, engine_stage_policy_material, mapping_table,
 *        artifact_observations, policy_identity, packet_identity_seed, known_at,
 *        common_binding_requirement_id? }`
 * @returns deeply frozen `{ pilot_packet, launch_material, receipt }`
 */
export function generatePilotPacketFromStageRules(request) {
  const safe = snapshotPlainData(request);
  assertExactKeys(safe, REQUEST_REQUIRED_FIELDS, REQUEST_OPTIONAL_FIELDS, 'request',
    PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID);
  const requestCode = PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID;
  const seed = assertToken(safe.packet_identity_seed, 'request.packet_identity_seed', requestCode);
  const knownAt = assertInstant(safe.known_at, 'request.known_at', requestCode);
  assertExactKeys(safe.policy_identity, POLICY_IDENTITY_FIELDS, [], 'request.policy_identity',
    requestCode);
  const policyId = assertToken(safe.policy_identity.policy_id,
    'request.policy_identity.policy_id', requestCode);
  const revisionLabel = assertToken(safe.policy_identity.revision_label,
    'request.policy_identity.revision_label', requestCode);
  const requestedCommonRequirementId = Object.hasOwn(safe, 'common_binding_requirement_id')
    ? assertToken(safe.common_binding_requirement_id, 'request.common_binding_requirement_id', requestCode)
    : null;

  const base = safe.base_packet;
  validateBasePacket(base);
  const requirementById = validatePolicyMaterial(safe.engine_stage_policy_material, knownAt);
  const index = buildRequirementIndex(safe.mapping_table, requirementById);

  // 1. The policy and its ref. The entity and revision halves are minted from the caller's
  //    declared policy identity so that recompiling the same rules under the same label lands on
  //    the same identifiers; the content half is the engine's own digest rule.
  const policyEntityId = mintedIdentifier(generatorDomain('policy_entity'), [policyId]);
  const policyRevisionId = mintedIdentifier(generatorDomain('policy_revision'),
    [policyId, revisionLabel]);
  const policyRef = cloneRef(mintEnginePolicyRef(
    { schema_version: safe.engine_stage_policy_material.schema_version, stages: safe.engine_stage_policy_material.stages },
    { entity_id: policyEntityId, revision_id: policyRevisionId },
  ));
  const policy = {
    schema_version: safe.engine_stage_policy_material.schema_version,
    policy_ref: cloneRef(policyRef),
    stages: safe.engine_stage_policy_material.stages,
  };

  // The Knowledge View selector refuses a grant whose project, grant, and policy halves share an
  // entity or a logical revision, because a role that answers for two things answers for
  // neither. Freshly minted digests will not collide by accident; a collision is reported rather
  // than worked around.
  const projectBindingRef = base.pilot_grant.project_binding_ref;
  if (policyRef.entity_id === projectBindingRef.entity_id
      || policyRef.entity_id === base.knowledge_view_authority_grant.grant_ref.entity_id
      || logicalRevisionKey(policyRef) === logicalRevisionKey(projectBindingRef)) {
    fail(PILOT_PACKET_GENERATOR_CODES.IDENTITY_COLLISION,
      'the minted policy identity collides with the project or grant identity',
      { where: 'policy_ref' });
  }

  // 2. The observations, re-keyed from artifact identity to requirement identity.
  const mapped = mapObservations(safe.artifact_observations, index, requirementById, knownAt);

  // 3. The role-bound packet: the compiled policy and the mapped observations, everything else
  //    carried through from the base packet unchanged.
  const rolePacket = {
    schema_version: base.role_bound_packet.schema_version,
    context_packet: {
      schema_version: base.role_bound_packet.context_packet.schema_version,
      project_binding_ref: cloneRef(base.role_bound_packet.context_packet.project_binding_ref),
      objective_ref: cloneRef(base.role_bound_packet.context_packet.objective_ref),
      policy_ref: cloneRef(policyRef),
      project_snapshot_identity: {
        entity_id: base.role_bound_packet.context_packet.project_snapshot_identity.entity_id,
        revision_id: base.role_bound_packet.context_packet.project_snapshot_identity.revision_id,
      },
      observations: mapped.observations,
      risks: base.role_bound_packet.context_packet.risks,
    },
    expected_project_binding_ref: cloneRef(base.role_bound_packet.expected_project_binding_ref),
    policy,
    policy_capability_vocabulary_ref:
      cloneRef(base.role_bound_packet.policy_capability_vocabulary_ref),
    role_roster_packet: base.role_bound_packet.role_roster_packet,
  };

  // 4. The common projections, re-pointed at requirements this policy actually declares.
  const common = repointCommonBindings(base.common_projection_bindings, requirementById,
    requestedCommonRequirementId);

  // 5. The source binding manifest over the exact project-plane partition the subject recomputes.
  const manifestBody = {
    schema_version: AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_SCHEMA_PIN,
    project_binding_ref: cloneRef(base.project_source_binding_manifest.project_binding_ref),
    project_material_revision_refs: projectMaterialRefs(rolePacket, common.boundRequirements),
  };
  const manifest = {
    schema_version: manifestBody.schema_version,
    manifest_ref: {
      entity_id: mintedIdentifier(generatorDomain('manifest_entity'), [seed]),
      revision_id: mintedIdentifier(generatorDomain('manifest_revision'), [seed, knownAt]),
      content_id: manifestContentId(manifestBody),
      content_hash_alg: 'sha256',
    },
    project_binding_ref: manifestBody.project_binding_ref,
    project_material_revision_refs: manifestBody.project_material_revision_refs,
  };

  // 6. The Knowledge View authority grant. The Owner's decision — the roots, the ceiling, the
  //    approved common revisions — travels through untouched, but the grant names the policy it
  //    was given against, so a recompiled policy makes a new revision of the same grant subject
  //    rather than the same revision with different bytes.
  const baseGrant = base.knowledge_view_authority_grant;
  const knowledgeGrantBody = {
    schema_version: baseGrant.schema_version,
    feature_state: baseGrant.feature_state,
    authority_ceiling: baseGrant.authority_ceiling,
    policy_ref: cloneRef(policyRef),
    project_binding_ref: cloneRef(baseGrant.project_binding_ref),
    project_root_path: baseGrant.project_root_path,
    common_root_path: baseGrant.common_root_path,
    containment_root_path: baseGrant.containment_root_path,
    approved_common_revision_refs: baseGrant.approved_common_revision_refs,
  };
  const knowledgeViewAuthorityGrant = {
    ...knowledgeGrantBody,
    grant_ref: {
      entity_id: baseGrant.grant_ref.entity_id,
      revision_id: mintedIdentifier(generatorDomain('knowledge_view_authority_grant_revision'),
        [seed, knownAt, policyRef.content_id]),
      content_id: knowledgeViewAuthorityGrantContentId(knowledgeGrantBody),
      content_hash_alg: 'sha256',
    },
  };

  // 7. The pilot grant, which binds all four halves to one another and to the material.
  const packetDraft = {
    schema_version: AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA_PIN,
    feature_state: base.feature_state,
    knowledge_view_request: base.knowledge_view_request,
    knowledge_view_authority_grant: knowledgeViewAuthorityGrant,
    common_projection_bindings: common.bindings,
    project_source_binding_manifest: manifest,
    role_bound_packet: rolePacket,
  };
  const grantBody = {
    schema_version: AX_SE_PROJECT_CONTEXT_PILOT_GRANT_SCHEMA_PIN,
    feature_state: base.pilot_grant.feature_state,
    authority_ceiling: base.pilot_grant.authority_ceiling,
    knowledge_view_authority_grant_ref: cloneRef(knowledgeViewAuthorityGrant.grant_ref),
    project_binding_ref: cloneRef(base.pilot_grant.project_binding_ref),
    project_source_binding_manifest_ref: cloneRef(manifest.manifest_ref),
    pilot_material_fingerprint_sha256: pilotMaterialFingerprint(packetDraft),
    expected_role_roster_ref: cloneRef(base.pilot_grant.expected_role_roster_ref),
  };
  const pilotGrant = {
    schema_version: grantBody.schema_version,
    feature_state: grantBody.feature_state,
    authority_ceiling: grantBody.authority_ceiling,
    grant_ref: {
      entity_id: mintedIdentifier(generatorDomain('pilot_grant_entity'), [seed]),
      revision_id: mintedIdentifier(generatorDomain('pilot_grant_revision'),
        [seed, knownAt, grantBody.pilot_material_fingerprint_sha256]),
      content_id: pilotGrantContentId(grantBody),
      content_hash_alg: 'sha256',
    },
    knowledge_view_authority_grant_ref: grantBody.knowledge_view_authority_grant_ref,
    project_binding_ref: grantBody.project_binding_ref,
    project_source_binding_manifest_ref: grantBody.project_source_binding_manifest_ref,
    pilot_material_fingerprint_sha256: grantBody.pilot_material_fingerprint_sha256,
    expected_role_roster_ref: grantBody.expected_role_roster_ref,
  };
  const pilotPacket = { ...packetDraft, pilot_grant: pilotGrant };

  // 8. The launch fields that derive from the packet. The caller owns the rest of the launch —
  //    the roots, the relative locator, the mode — and owns writing both files.
  const canonicalPacket = canonicalText(pilotPacket, PILOT_PACKET_GENERATOR_CODES.MATERIAL_INVALID);
  const launchMaterial = {
    expected_pilot_grant_ref: cloneRef(pilotGrant.grant_ref),
    expected_project_source_binding_manifest_ref: cloneRef(manifest.manifest_ref),
    expected_role_roster_ref: cloneRef(pilotGrant.expected_role_roster_ref),
    expected_common_projection_bindings_fingerprint_sha256:
      commonBindingsFingerprint(pilotPacket.common_projection_bindings),
    expected_project_binding_ref: cloneRef(pilotGrant.project_binding_ref),
    expected_knowledge_view_authority_grant_ref: cloneRef(knowledgeViewAuthorityGrant.grant_ref),
    // Exactly the bytes the runner will hash: the canonical form plus the trailing newline the
    // caller writes, hashed as utf8. A packet file that differs by one byte fails the runner's
    // pin, which is the point of computing it here rather than after the write.
    pilot_packet_sha256: sha256Hex(`${canonicalPacket}\n`),
  };
  assertExactKeys(launchMaterial, LAUNCH_MATERIAL_FIELDS, [], 'launch_material',
    PILOT_PACKET_GENERATOR_CODES.MATERIAL_INVALID);

  const requirementCount = [...requirementById.keys()].length;
  const receipt = {
    schema_version: PILOT_PACKET_GENERATOR_SCHEMA_VERSION,
    generator_version: GENERATOR_VERSION,
    deterministic: true,
    claim_ceiling: 'observed',
    input_digests: {
      base_packet: canonicalDigest(generatorDomain('base_packet'), safe.base_packet),
      engine_stage_policy_material: canonicalDigest(generatorDomain('engine_stage_policy_material'),
        safe.engine_stage_policy_material),
      mapping_table: canonicalDigest(generatorDomain('mapping_table'), safe.mapping_table),
      artifact_observations: canonicalDigest(generatorDomain('artifact_observations'),
        safe.artifact_observations),
      policy_identity: canonicalDigest(generatorDomain('policy_identity'), safe.policy_identity),
      packet_identity_seed: canonicalDigest(generatorDomain('packet_identity_seed'), seed),
      known_at: canonicalDigest(generatorDomain('known_at'), knownAt),
      common_binding_requirement_id: canonicalDigest(generatorDomain('common_binding_requirement_id'),
        { declared: requestedCommonRequirementId !== null, requirement_id: requestedCommonRequirementId }),
    },
    output_digests: {
      pilot_packet: canonicalDigest(generatorDomain('pilot_packet'), pilotPacket),
      launch_material: canonicalDigest(generatorDomain('launch_material'), launchMaterial),
    },
    counts: {
      requirements: requirementCount,
      observations_emitted: mapped.observations.length,
      unbound_observations: mapped.unbound.length,
      present: mapped.counts[PRESENCE_PRESENT],
      absence_confirmed: mapped.counts[PRESENCE_ABSENCE_CONFIRMED],
      unknown: mapped.counts[PRESENCE_UNKNOWN],
    },
    unbound_observations: mapped.unbound,
    common_binding: {
      rows: common.bindings.length,
      carried_from_base: common.bindings.length - (common.fallbackUsed ? 1 : 0),
      repointed_to_requested_requirement: common.fallbackUsed,
    },
    // The subject that would give a real preflight verdict — `assessOwnerFrozenProjectContext` —
    // reaches the node utility module and, through the shared Knowledge View selector, the node
    // filesystem module. Importing it would break the one property this module is built to hold,
    // so the preflight runs in the test suite and in the caller instead, over the packet this
    // returns. What is verified here is every digest and partition rule this module reproduces.
    preflight: {
      subject_assessment_performed: false,
      deferred_reason: 'subject_import_graph_is_not_pure',
      self_verified: [
        'policy_ref_engine_digest_rule',
        'knowledge_view_authority_grant_content_id',
        'project_source_binding_manifest_content_id',
        'pilot_material_fingerprint',
        'pilot_grant_content_id',
        'common_projection_bindings_one_to_one',
        'project_material_partition_excludes_common_bound_requirements',
      ],
    },
    effects: {
      erp_writes: 0,
      filesystem_writes: 0,
      model_calls: 0,
      network_calls: 0,
      clock_reads: 0,
    },
  };

  return deepFreeze({ pilot_packet: pilotPacket, launch_material: launchMaterial, receipt });
}

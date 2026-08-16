// Owner-frozen, zero-write M2-2 composition for one project Knowledge View.
//
// This subject does not discover or read project source bodies. It proves that one
// independently pinned pilot grant binds the portable Knowledge View request, the
// complete project-source reference manifest, the explicit common-to-policy
// projections, and the unchanged role-bound AX/SE packet before invoking the
// existing deterministic assessment exactly once.

import { types } from 'node:util';

import {
  PROJECT_KNOWLEDGE_VIEW_SCHEMA_VERSION,
  selectProjectKnowledgeView,
} from '../../shared/project_knowledge_view.mjs';
import { canonicalise, compareCodePoints } from '../kernel/canonical.mjs';
import { sha256Hex } from '../kernel/fingerprint.mjs';
import {
  exactRefIdentityKey,
  inspectIdentifierOpacity,
  isWellFormedRef,
  logicalRevisionKey,
  sameExactRef,
} from '../kernel/identity.mjs';
import {
  AX_SE_PROJECT_ROLE_BOUND_PACKET_SCHEMA,
  assessAxSeRoleBoundProject,
} from './ax_se_project_role_bound_assessment.mjs';

export const AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA =
  'soulforge.ax_se_project_context_pilot_packet.v0';
export const AX_SE_PROJECT_CONTEXT_PILOT_GRANT_SCHEMA =
  'soulforge.ax_se_project_context_pilot_grant.v0';
export const AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_SCHEMA =
  'soulforge.ax_se_project_source_binding_manifest.v0';
export const AX_SE_PROJECT_CONTEXT_PILOT_RESULT_SCHEMA =
  'soulforge.ax_se_project_context_pilot_assessment.v0';
export const AX_SE_PROJECT_CONTEXT_PILOT_POLICY_REVISION =
  'soulforge.ax_se_project_context_pilot_policy.v0';
export const AX_SE_PROJECT_CONTEXT_PILOT_GRANT_HASH_DOMAIN =
  'soulforge.ax_se_project_context_pilot.grant.v0';
export const AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_HASH_DOMAIN =
  'soulforge.ax_se_project_context_pilot.material.v0';
export const AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN =
  'soulforge.ax_se_project_context_pilot.project_source_binding_manifest.v0';
export const AX_SE_PROJECT_CONTEXT_COMMON_BINDINGS_HASH_DOMAIN =
  'soulforge.ax_se_project_context_pilot.common_projection_bindings.v0';

export const AX_SE_PROJECT_CONTEXT_PILOT_CODES = Object.freeze({
  INPUT_REFUSED: 'AX_SE_PROJECT_CONTEXT_PILOT_INPUT_REFUSED',
  GRANT_REFUSED: 'AX_SE_PROJECT_CONTEXT_PILOT_GRANT_REFUSED',
  MATERIAL_REFUSED: 'AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_REFUSED',
  KNOWLEDGE_VIEW_REFUSED: 'AX_SE_PROJECT_CONTEXT_PILOT_KNOWLEDGE_VIEW_REFUSED',
  SOURCE_BINDING_REFUSED: 'AX_SE_PROJECT_CONTEXT_PILOT_SOURCE_BINDING_REFUSED',
  ASSESSMENT_REFUSED: 'AX_SE_PROJECT_CONTEXT_PILOT_ASSESSMENT_REFUSED',
});

const PACKET_FIELDS = Object.freeze([
  'schema_version',
  'feature_state',
  'knowledge_view_request',
  'knowledge_view_authority_grant',
  'common_projection_bindings',
  'project_source_binding_manifest',
  'pilot_grant',
  'role_bound_packet',
]);
const PILOT_GRANT_FIELDS = Object.freeze([
  'schema_version',
  'feature_state',
  'authority_ceiling',
  'grant_ref',
  'knowledge_view_authority_grant_ref',
  'project_binding_ref',
  'project_source_binding_manifest_ref',
  'pilot_material_fingerprint_sha256',
  'expected_role_roster_ref',
]);
const MANIFEST_FIELDS = Object.freeze([
  'schema_version',
  'manifest_ref',
  'project_binding_ref',
  'project_material_revision_refs',
]);
const COMMON_BINDING_FIELDS = Object.freeze([
  'common_revision_ref',
  'policy_requirement_ref',
]);
const REF_FIELDS = Object.freeze([
  'entity_id',
  'revision_id',
  'content_id',
  'content_hash_alg',
]);
const VIEW_REQUEST_FIELDS = Object.freeze([
  'schema_version',
  'feature_state',
  'project_binding_refs',
  'common_revision_refs',
]);
const VIEW_FIELDS = Object.freeze([
  'schema_version',
  'kind',
  'status',
  'feature_state',
  'route',
  'project_binding_ref',
  'common_revision_refs',
  'authority_grant_ref',
  'expected_authority_grant_ref_match_verified',
  'policy_ref',
  'project_root_local_path_commitment_sha256',
  'common_root_commitment',
  'knowledge_scope_fingerprint_sha256',
  'local_admission_fingerprint_sha256',
  'boundary',
  'authority',
]);
const VIEW_BOUNDARY_FIELDS = Object.freeze([
  'metadata_only',
  'project_count',
  'common_revision_count',
  'root_relation',
  'root_resolution_count',
  'body_loaded',
  'retrieval_performed',
  'enumeration_performed',
  'foreign_lookup_performed',
  'filesystem_writes',
  'model_calls',
  'explicit_network_calls',
]);
const VIEW_AUTHORITY_FIELDS = Object.freeze([
  'project_read_allowed',
  'common_read_allowed',
  'engine_input_allowed',
  'wiki_write_allowed',
  'rag_write_allowed',
  'erp_write_allowed',
  'taskdriver_allowed',
  'activation_allowed',
]);
const MAX = Object.freeze({
  depth: 28,
  values: 40000,
  array: 512,
  keys: 40,
  string: 4096,
});
const SHA256_REF = /^sha256:[0-9a-f]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CONTENT_DERIVED_REVISION = /^[0-9a-f]{12,64}$/iu;
const NUMBERED_REVISION = /(?:^|[-_.])(?:r|rev|v)\d+(?:[-_.]\d+)*$/iu;
const FORBIDDEN_KEYS = new Set([
  'raw', 'raw_text', 'source_text', 'chunk', 'chunks', 'answer', 'answer_text',
  'body', 'payload', 'prompt', 'completion', 'private_path', 'absolute_path',
  'source_path', 'secret', 'credential', 'password', 'cookie', 'token',
]);
const SECRET_PATTERNS = Object.freeze([
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
]);

export class AxSeProjectContextPilotError extends Error {
  constructor(code) {
    super('Owner-frozen AX/SE project-context pilot was refused');
    this.name = 'AxSeProjectContextPilotError';
    this.code = code;
  }
}

function refuse(code) {
  throw new AxSeProjectContextPilotError(code);
}

function snapshotPlainData(root) {
  const seen = new WeakSet();
  let values = 0;

  const walk = (value, depth) => {
    values += 1;
    if (values > MAX.values || depth > MAX.depth) {
      refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED);
    }
    if (typeof value === 'string') {
      if (value.length === 0 || value.length > MAX.string
          || value.normalize('NFC') !== value
          || /[\u0000-\u001f\u007f]/u.test(value)
          || SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
        refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED);
      }
      return value;
    }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    if (value === null || typeof value !== 'object' || types.isProxy(value)) {
      refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED);
    }
    if (seen.has(value)) refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED);
    seen.add(value);

    let prototype;
    let descriptors;
    try {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED);
    }
    const array = Array.isArray(value);
    if ((array && prototype !== Array.prototype)
        || (!array && prototype !== Object.prototype && prototype !== null)) {
      refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED);
    }
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) {
      refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED);
    }
    const dataKeys = array ? keys.filter((key) => key !== 'length') : keys;
    const arrayLength = array ? descriptors.length?.value : undefined;
    if (array) {
      if (!Number.isSafeInteger(arrayLength) || arrayLength < 0 || arrayLength > MAX.array) {
        refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED);
      }
      const expected = new Set(Array.from({ length: arrayLength }, (_, index) => String(index)));
      if (dataKeys.length !== expected.size || dataKeys.some((key) => !expected.has(key))) {
        refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED);
      }
    } else if (dataKeys.length > MAX.keys) {
      refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED);
    }

    // Downstream Engine subjects accept only ordinary JSON objects. Define every
    // own key explicitly so even a literal `__proto__` remains inert data.
    const copy = array ? new Array(arrayLength) : {};
    for (const key of dataKeys) {
      const descriptor = descriptors[key];
      if (key.length > 96 || key.normalize('NFC') !== key
          || FORBIDDEN_KEYS.has(key.toLowerCase())
          || descriptor.enumerable !== true
          || !Object.hasOwn(descriptor, 'value')) {
        refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED);
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

function exactKeys(value, expected, code = AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) refuse(code);
  const actual = Object.keys(value).sort(compareCodePoints);
  const required = [...expected].sort(compareCodePoints);
  if (actual.length !== required.length
      || actual.some((key, index) => key !== required[index])) {
    refuse(code);
  }
}

function exactRef(ref, code = AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED) {
  exactKeys(ref, REF_FIELDS, code);
  if (!isWellFormedRef(ref)
      || ref.content_hash_alg !== 'sha256'
      || !SHA256_REF.test(ref.content_id)
      || !SAFE_IDENTIFIER.test(ref.entity_id)
      || !SAFE_IDENTIFIER.test(ref.revision_id)
      || inspectIdentifierOpacity(ref.entity_id).opaque !== true
      || inspectIdentifierOpacity(ref.revision_id).opaque !== true
      || !(CANONICAL_UUID.test(ref.revision_id)
        || CONTENT_DERIVED_REVISION.test(ref.revision_id)
        || NUMBERED_REVISION.test(ref.revision_id))) {
    refuse(code);
  }
  try {
    canonicalise(ref, {});
  } catch {
    refuse(code);
  }
  return ref;
}

function arrayOrderRules(value) {
  const rules = {};
  const visit = (node, path = '') => {
    if (Array.isArray(node)) {
      rules[path] = 'insertion_ordered';
      for (const child of node) visit(child, `${path}[]`);
    } else if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        visit(child, path ? `${path}.${key}` : key);
      }
    }
  };
  visit(value);
  return rules;
}

function fingerprint(domain, value, code = AX_SE_PROJECT_CONTEXT_PILOT_CODES.MATERIAL_REFUSED) {
  try {
    return `sha256:${sha256Hex(`${domain}\0${canonicalise(value, arrayOrderRules(value))}`)}`;
  } catch {
    refuse(code);
  }
}

function cloneRef(ref) {
  return {
    entity_id: ref.entity_id,
    revision_id: ref.revision_id,
    content_id: ref.content_id,
    content_hash_alg: ref.content_hash_alg,
  };
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function sortedUniqueRefs(refs, code) {
  if (!Array.isArray(refs)) refuse(code);
  const identities = [];
  const logical = new Map();
  const entities = new Set();
  const output = [];
  for (const ref of refs) {
    exactRef(ref, code);
    const identity = exactRefIdentityKey(ref);
    const revision = logicalRevisionKey(ref);
    if (identities.includes(identity)
        || (logical.has(revision) && logical.get(revision) !== identity)) {
      refuse(code);
    }
    identities.push(identity);
    logical.set(revision, identity);
    entities.add(ref.entity_id);
    output.push(ref);
  }
  const sorted = [...identities].sort(compareCodePoints);
  if (identities.some((identity, index) => identity !== sorted[index])) refuse(code);
  return { refs: output, identities: new Set(identities), logical, entities };
}

function sameRefSet(left, right) {
  if (left.size !== right.size) return false;
  return [...left].every((identity) => right.has(identity));
}

function pilotGrantContentId(grant) {
  return fingerprint(AX_SE_PROJECT_CONTEXT_PILOT_GRANT_HASH_DOMAIN, {
    schema_version: grant.schema_version,
    feature_state: grant.feature_state,
    authority_ceiling: grant.authority_ceiling,
    knowledge_view_authority_grant_ref: grant.knowledge_view_authority_grant_ref,
    project_binding_ref: grant.project_binding_ref,
    project_source_binding_manifest_ref: grant.project_source_binding_manifest_ref,
    pilot_material_fingerprint_sha256: grant.pilot_material_fingerprint_sha256,
    expected_role_roster_ref: grant.expected_role_roster_ref,
  }, AX_SE_PROJECT_CONTEXT_PILOT_CODES.GRANT_REFUSED);
}

function manifestContentId(manifest) {
  return fingerprint(AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN, {
    schema_version: manifest.schema_version,
    project_binding_ref: manifest.project_binding_ref,
    project_material_revision_refs: manifest.project_material_revision_refs,
  }, AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
}

function materialFingerprint(packet) {
  return fingerprint(AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_HASH_DOMAIN, {
    knowledge_view_request: packet.knowledge_view_request,
    common_projection_bindings: packet.common_projection_bindings,
    project_source_binding_manifest: packet.project_source_binding_manifest,
    role_bound_packet: packet.role_bound_packet,
  });
}

function commonBindingsFingerprint(bindings) {
  return fingerprint(AX_SE_PROJECT_CONTEXT_COMMON_BINDINGS_HASH_DOMAIN, bindings);
}

function policyRequirementRefs(rolePacket) {
  const stages = rolePacket?.policy?.stages;
  if (!Array.isArray(stages) || stages.length === 0) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
  }
  const refs = [];
  for (const stage of stages) {
    if (!Array.isArray(stage?.requirements) || stage.requirements.length === 0) {
      refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
    }
    for (const requirement of stage.requirements) {
      refs.push(exactRef(
        requirement?.requirement_ref,
        AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED,
      ));
    }
  }
  return refs;
}

function projectMaterialRefs(rolePacket, commonRequirementIdentities) {
  const refs = [];
  const add = (ref) => refs.push(exactRef(
    ref,
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED,
  ));
  add(rolePacket?.context_packet?.objective_ref);

  const observations = rolePacket?.context_packet?.observations;
  const risks = rolePacket?.context_packet?.risks;
  if (!Array.isArray(observations) || !Array.isArray(risks)) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
  }
  for (const observation of observations) {
    add(observation?.artifact_revision_ref);
    if (!Array.isArray(observation?.evidence_refs)) {
      refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
    }
    for (const ref of observation.evidence_refs) add(ref);
    const claims = observation.conflict_claims ?? [];
    if (!Array.isArray(claims)) {
      refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
    }
    for (const claim of claims) add(claim?.source_revision_ref);
  }
  for (const risk of risks) {
    add(risk?.risk_ref);
    if (!Array.isArray(risk?.evidence_refs)) {
      refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
    }
    for (const ref of risk.evidence_refs) add(ref);
  }

  const rosterSources = rolePacket?.role_roster_packet?.source_revision_refs;
  if (!Array.isArray(rosterSources) || rosterSources.length === 0) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
  }
  for (const ref of rosterSources) add(ref);
  add(rolePacket?.policy_capability_vocabulary_ref);

  for (const ref of policyRequirementRefs(rolePacket)) {
    if (!commonRequirementIdentities.has(exactRefIdentityKey(ref))) add(ref);
  }
  const byIdentity = new Map(refs.map((ref) => [exactRefIdentityKey(ref), ref]));
  return [...byIdentity.values()].sort((left, right) => compareCodePoints(
    exactRefIdentityKey(left),
    exactRefIdentityKey(right),
  ));
}

function validateCommonBindings(packet) {
  exactKeys(packet.knowledge_view_request, VIEW_REQUEST_FIELDS);
  if (!Array.isArray(packet.knowledge_view_request.project_binding_refs)
      || packet.knowledge_view_request.project_binding_refs.length !== 1) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.MATERIAL_REFUSED);
  }
  const selected = sortedUniqueRefs(
    packet.knowledge_view_request.common_revision_refs,
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED,
  );
  if (selected.refs.length === 0 || !Array.isArray(packet.common_projection_bindings)
      || packet.common_projection_bindings.length === 0) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
  }
  const requirements = policyRequirementRefs(packet.role_bound_packet);
  const allowedRequirements = new Set(requirements.map(exactRefIdentityKey));
  const boundCommon = new Set();
  const boundRequirements = new Set();
  const pairKeys = [];
  for (const row of packet.common_projection_bindings) {
    exactKeys(row, COMMON_BINDING_FIELDS, AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
    exactRef(row.common_revision_ref, AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
    exactRef(row.policy_requirement_ref, AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
    const commonKey = exactRefIdentityKey(row.common_revision_ref);
    const requirementKey = exactRefIdentityKey(row.policy_requirement_ref);
    if (!selected.identities.has(commonKey) || !allowedRequirements.has(requirementKey)) {
      refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
    }
    const pairKey = `${commonKey}\0${requirementKey}`;
    if (pairKeys.includes(pairKey)
        || boundCommon.has(commonKey)
        || boundRequirements.has(requirementKey)) {
      refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
    }
    pairKeys.push(pairKey);
    boundCommon.add(commonKey);
    boundRequirements.add(requirementKey);
  }
  const sortedPairs = [...pairKeys].sort(compareCodePoints);
  if (pairKeys.some((pair, index) => pair !== sortedPairs[index])
      || !sameRefSet(selected.identities, boundCommon)) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
  }
  return {
    selected,
    commonRequirementIdentities: boundRequirements,
    fingerprint: commonBindingsFingerprint(packet.common_projection_bindings),
  };
}

function validateManifest(packet, common) {
  const manifest = packet.project_source_binding_manifest;
  exactKeys(manifest, MANIFEST_FIELDS, AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
  if (manifest.schema_version !== AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_SCHEMA) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
  }
  exactRef(manifest.manifest_ref, AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
  exactRef(manifest.project_binding_ref, AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
  const supplied = sortedUniqueRefs(
    manifest.project_material_revision_refs,
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED,
  );
  if (supplied.refs.length === 0
      || manifest.manifest_ref.content_id !== manifestContentId(manifest)) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
  }
  const expectedRefs = projectMaterialRefs(
    packet.role_bound_packet,
    common.commonRequirementIdentities,
  );
  const expected = new Set(expectedRefs.map(exactRefIdentityKey));
  if (!sameRefSet(supplied.identities, expected)
      || [...supplied.identities].some((identity) => common.selected.identities.has(identity))
      || supplied.refs.some((projectRef) => common.selected.refs.some((commonRef) => (
        logicalRevisionKey(projectRef) === logicalRevisionKey(commonRef)
        || projectRef.entity_id === commonRef.entity_id
      )))) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED);
  }
  return supplied;
}

function validatePortableBindings(packet, expectedPilotGrantRef) {
  exactKeys(packet, PACKET_FIELDS);
  exactKeys(packet.pilot_grant, PILOT_GRANT_FIELDS, AX_SE_PROJECT_CONTEXT_PILOT_CODES.GRANT_REFUSED);
  if (packet.schema_version !== AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA
      || packet.feature_state !== 'off'
      || packet.pilot_grant.schema_version !== AX_SE_PROJECT_CONTEXT_PILOT_GRANT_SCHEMA
      || packet.pilot_grant.feature_state !== 'off'
      || packet.pilot_grant.authority_ceiling !== 'owner_frozen_manual_zero_write'
      || packet.role_bound_packet?.schema_version !== AX_SE_PROJECT_ROLE_BOUND_PACKET_SCHEMA) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED);
  }
  const grant = packet.pilot_grant;
  exactRef(expectedPilotGrantRef, AX_SE_PROJECT_CONTEXT_PILOT_CODES.GRANT_REFUSED);
  for (const ref of [
    grant.grant_ref,
    grant.knowledge_view_authority_grant_ref,
    grant.project_binding_ref,
    grant.project_source_binding_manifest_ref,
    grant.expected_role_roster_ref,
  ]) exactRef(ref, AX_SE_PROJECT_CONTEXT_PILOT_CODES.GRANT_REFUSED);
  if (!SHA256_REF.test(grant.pilot_material_fingerprint_sha256)
      || !sameExactRef(grant.grant_ref, expectedPilotGrantRef)
      || grant.grant_ref.content_id !== pilotGrantContentId(grant)
      || grant.pilot_material_fingerprint_sha256 !== materialFingerprint(packet)
      || !sameExactRef(grant.knowledge_view_authority_grant_ref,
        packet.knowledge_view_authority_grant?.grant_ref)
      || !sameExactRef(grant.project_source_binding_manifest_ref,
        packet.project_source_binding_manifest?.manifest_ref)) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.GRANT_REFUSED);
  }

  const requestProject = packet.knowledge_view_request?.project_binding_refs?.[0];
  const roleProject = packet.role_bound_packet?.expected_project_binding_ref;
  const contextProject = packet.role_bound_packet?.context_packet?.project_binding_ref;
  const rosterProject = packet.role_bound_packet?.role_roster_packet?.project_binding_ref;
  const manifestProject = packet.project_source_binding_manifest?.project_binding_ref;
  for (const ref of [requestProject, roleProject, contextProject, rosterProject, manifestProject]) {
    exactRef(ref, AX_SE_PROJECT_CONTEXT_PILOT_CODES.MATERIAL_REFUSED);
    if (!sameExactRef(ref, grant.project_binding_ref)) {
      refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.MATERIAL_REFUSED);
    }
  }
  const packetPolicy = packet.role_bound_packet?.policy?.policy_ref;
  const contextPolicy = packet.role_bound_packet?.context_packet?.policy_ref;
  const viewPolicy = packet.knowledge_view_authority_grant?.policy_ref;
  for (const ref of [packetPolicy, contextPolicy, viewPolicy]) {
    exactRef(ref, AX_SE_PROJECT_CONTEXT_PILOT_CODES.MATERIAL_REFUSED);
  }
  if (!sameExactRef(packetPolicy, contextPolicy) || !sameExactRef(packetPolicy, viewPolicy)) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.MATERIAL_REFUSED);
  }

  const common = validateCommonBindings(packet);
  const project = validateManifest(packet, common);
  return { grant, common, project, policyRef: packetPolicy };
}

/**
 * Composes one independently pinned frozen project packet with one public-synthetic
 * Knowledge View admission and the unchanged role-bound AX/SE assessment.
 */
export function assessOwnerFrozenProjectContext(pilotPacketInput, expectedPilotGrantRefInput) {
  const safe = snapshotPlainData({
    pilotPacket: pilotPacketInput,
    expectedPilotGrantRef: expectedPilotGrantRefInput,
  });
  const packet = safe.pilotPacket;
  const expectedPilotGrantRef = safe.expectedPilotGrantRef;
  const portable = validatePortableBindings(packet, expectedPilotGrantRef);

  let view;
  try {
    view = selectProjectKnowledgeView(
      packet.knowledge_view_request,
      packet.knowledge_view_authority_grant,
      portable.grant.knowledge_view_authority_grant_ref,
    );
  } catch {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.KNOWLEDGE_VIEW_REFUSED);
  }
  exactKeys(view, VIEW_FIELDS, AX_SE_PROJECT_CONTEXT_PILOT_CODES.KNOWLEDGE_VIEW_REFUSED);
  exactKeys(view.boundary, VIEW_BOUNDARY_FIELDS,
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.KNOWLEDGE_VIEW_REFUSED);
  exactKeys(view.authority, VIEW_AUTHORITY_FIELDS,
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.KNOWLEDGE_VIEW_REFUSED);
  exactRef(
    view.authority_grant_ref,
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.KNOWLEDGE_VIEW_REFUSED,
  );
  exactRef(
    view.project_binding_ref,
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.KNOWLEDGE_VIEW_REFUSED,
  );
  exactRef(view.policy_ref, AX_SE_PROJECT_CONTEXT_PILOT_CODES.KNOWLEDGE_VIEW_REFUSED);
  if (!Array.isArray(view.common_revision_refs)) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.KNOWLEDGE_VIEW_REFUSED);
  }
  for (const ref of view.common_revision_refs) {
    exactRef(ref, AX_SE_PROJECT_CONTEXT_PILOT_CODES.KNOWLEDGE_VIEW_REFUSED);
  }
  if (view.schema_version !== PROJECT_KNOWLEDGE_VIEW_SCHEMA_VERSION
      || view.kind !== 'project_knowledge_view'
      || view.status !== 'selected'
      || view.feature_state !== 'off'
      || view.route !== 'validation_only'
      || !SHA256_REF.test(view.knowledge_scope_fingerprint_sha256)
      || view.expected_authority_grant_ref_match_verified !== true
      || !sameExactRef(
        view.authority_grant_ref,
        portable.grant.knowledge_view_authority_grant_ref,
      )
      || !sameExactRef(view.project_binding_ref, portable.grant.project_binding_ref)
      || !sameExactRef(view.policy_ref, portable.policyRef)
      || view.common_revision_refs.length !== portable.common.selected.refs.length
      || view.common_revision_refs.some((ref, index) => (
        !sameExactRef(ref, portable.common.selected.refs[index])
      ))
      || view.boundary.metadata_only !== true
      || view.boundary.project_count !== 1
      || view.boundary.common_revision_count !== portable.common.selected.refs.length
      || view.boundary.root_relation !== 'disjoint'
      || view.boundary.root_resolution_count !== 2
      || view.boundary.body_loaded !== false
      || view.boundary.retrieval_performed !== false
      || view.boundary.enumeration_performed !== false
      || view.boundary.foreign_lookup_performed !== false
      || view.boundary.filesystem_writes !== 0
      || view.boundary.model_calls !== 0
      || view.boundary.explicit_network_calls !== 0
      || VIEW_AUTHORITY_FIELDS.some((field) => view.authority[field] !== false)) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.KNOWLEDGE_VIEW_REFUSED);
  }

  let assessment;
  try {
    assessment = assessAxSeRoleBoundProject(
      packet.role_bound_packet,
      portable.grant.expected_role_roster_ref,
    );
  } catch {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.ASSESSMENT_REFUSED);
  }
  if (!sameExactRef(assessment.project_binding_ref, portable.grant.project_binding_ref)
      || !sameExactRef(assessment.policy_ref, portable.policyRef)) {
    refuse(AX_SE_PROJECT_CONTEXT_PILOT_CODES.ASSESSMENT_REFUSED);
  }

  return deepFreeze({
    schema_version: AX_SE_PROJECT_CONTEXT_PILOT_RESULT_SCHEMA,
    pilot_policy_revision: AX_SE_PROJECT_CONTEXT_PILOT_POLICY_REVISION,
    feature_state: 'off',
    mode: 'owner_frozen_manual_zero_write',
    status: 'assessed',
    claim_ceiling: 'observed',
    pilot_grant_ref: cloneRef(portable.grant.grant_ref),
    project_binding_ref: cloneRef(portable.grant.project_binding_ref),
    knowledge_view: {
      authority_grant_ref: cloneRef(view.authority_grant_ref),
      policy_ref: cloneRef(view.policy_ref),
      common_revision_refs: view.common_revision_refs.map(cloneRef),
      knowledge_scope_fingerprint_sha256: view.knowledge_scope_fingerprint_sha256,
      common_projection_bindings_fingerprint_sha256: portable.common.fingerprint,
      project_count: 1,
      common_revision_count: view.common_revision_refs.length,
      common_projection_binding_count: packet.common_projection_bindings.length,
      exact_project_binding_verified: true,
      policy_binding_verified: true,
      common_projection_binding_verified: true,
      engine_input_binding_verified: true,
      root_metadata_revalidated: true,
      root_relation: view.boundary.root_relation,
      body_loaded: false,
      retrieval_performed: false,
      enumeration_performed: false,
      foreign_lookup_performed: false,
    },
    project_source_binding: {
      manifest_ref: cloneRef(packet.project_source_binding_manifest.manifest_ref),
      manifest_binding_verified: true,
      exact_partition_verified: true,
      project_material_revision_count: portable.project.refs.length,
      source_bodies_opened: false,
      source_content_membership_verified: false,
      source_truth_validated: false,
      freshness_validated: false,
      terminal_provenance_validated: false,
    },
    current_stage_code: assessment.current_stage.stage_code,
    role_bound_assessment: assessment,
    authority: {
      candidate_only: true,
      engine_input_general_authority: false,
      owner_decision_made: false,
      stage_cleared: false,
      assignment_made: false,
      task_intent_created: false,
      canon_promotion_allowed: false,
      live_current_claimed: false,
    },
    gates: {
      actual_project_activation_allowed: false,
      stage_clear_allowed: false,
      taskdriver_activation_allowed: false,
      erp_write_allowed: false,
      wiki_write_allowed: false,
      rag_write_allowed: false,
      llm_activation_allowed: false,
    },
    effects: {
      filesystem_writes: 0,
      explicit_network_calls: 0,
      model_calls: 0,
      rag_calls: 0,
      wiki_calls: 0,
      erp_writes: 0,
      taskdriver_activations: 0,
    },
  });
}

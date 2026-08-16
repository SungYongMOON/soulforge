import { types } from 'node:util';

import { canonicalise, compareCodePoints } from '../engineering_engine/kernel/canonical.mjs';
import { sha256Hex } from '../engineering_engine/kernel/fingerprint.mjs';
import {
  exactRefIdentityKey,
  inspectIdentifierOpacity,
  isWellFormedRef,
  logicalRevisionKey,
  sameExactRef,
} from '../engineering_engine/kernel/identity.mjs';
import {
  ROOT_STATUS,
  resolveKnowledgeRoot,
  rootRelation,
} from './knowledge_root_resolver.mjs';

export const PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION =
  'soulforge.project_knowledge_view_request.v0';
export const PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION =
  'soulforge.project_knowledge_view_authority_grant.v0';
export const PROJECT_KNOWLEDGE_VIEW_SCHEMA_VERSION =
  'soulforge.project_knowledge_view.v0';
export const PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN =
  'soulforge.project_knowledge_view.authority_grant.v0';

export const PROJECT_KNOWLEDGE_VIEW_CODES = Object.freeze({
  INPUT_REFUSED: 'PROJECT_KNOWLEDGE_VIEW_INPUT_REFUSED',
  SCOPE_REFUSED: 'PROJECT_KNOWLEDGE_VIEW_SCOPE_REFUSED',
  ROOT_REFUSED: 'PROJECT_KNOWLEDGE_VIEW_ROOT_REFUSED',
});

const REQUEST_FIELDS = Object.freeze([
  'schema_version',
  'feature_state',
  'project_binding_refs',
  'common_revision_refs',
]);
const GRANT_FIELDS = Object.freeze([
  'schema_version',
  'feature_state',
  'authority_ceiling',
  'grant_ref',
  'policy_ref',
  'project_binding_ref',
  'project_root_path',
  'common_root_path',
  'containment_root_path',
  'approved_common_revision_refs',
]);
const EXACT_REF_FIELDS = Object.freeze([
  'entity_id',
  'revision_id',
  'content_id',
  'content_hash_alg',
]);
const MAX_GRAPH_DEPTH = 12;
const MAX_GRAPH_NODES = 512;
const MAX_ARRAY_LENGTH = 64;
const MAX_OBJECT_KEYS = 64;
const MAX_STRING_LENGTH = 4096;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SHA256_CONTENT_ID = /^sha256:[a-f0-9]{64}$/u;
const RESERVED_FLOATING_REVISION = /^(?:latest|current|head|tip|floating)$/iu;

export class ProjectKnowledgeViewError extends Error {
  constructor(code) {
    super('Project Knowledge View admission was refused');
    this.name = 'ProjectKnowledgeViewError';
    this.code = code;
  }
}

function refuse(code) {
  throw new ProjectKnowledgeViewError(code);
}

function snapshotPlainData(value, state = {
  seen: new WeakSet(),
  nodes: 0,
}, depth = 0) {
  if (depth > MAX_GRAPH_DEPTH) refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
  if (value === null) refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);

  const kind = typeof value;
  if (kind === 'string') {
    if (value.length > MAX_STRING_LENGTH || value.normalize('NFC') !== value) {
      refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
    }
    return value;
  }
  if (kind === 'boolean') return value;
  if (kind === 'number' && Number.isSafeInteger(value)) return value;
  if (kind !== 'object' || types.isProxy(value)) {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
  }
  if (state.seen.has(value)) refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
  state.seen.add(value);
  state.nodes += 1;
  if (state.nodes > MAX_GRAPH_NODES) refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length > MAX_OBJECT_KEYS) refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
  const symbols = ownKeys.filter((key) => typeof key === 'symbol');
  if (symbols.length !== 0) refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
  const descriptors = Object.getOwnPropertyDescriptors(value);

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype
        || value.length > MAX_ARRAY_LENGTH
        || !Object.hasOwn(descriptors, 'length')) {
      refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
    }
    const keys = Object.keys(descriptors).filter((key) => key !== 'length');
    if (keys.length !== value.length) refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
    const output = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
      }
      output.push(snapshotPlainData(descriptor.value, state, depth + 1));
    }
    return output;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
  }
  const output = Object.create(null);
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true
        || key.normalize('NFC') !== key) {
      refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
    }
    Object.defineProperty(output, key, {
      value: snapshotPlainData(descriptor.value, state, depth + 1),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return output;
}

function exactKeys(value, expected) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
  }
  const actual = Object.keys(value).sort(compareCodePoints);
  const required = [...expected].sort(compareCodePoints);
  if (actual.length !== required.length
      || actual.some((key, index) => key !== required[index])) {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
  }
}

function validateExactRef(ref) {
  exactKeys(ref, EXACT_REF_FIELDS);
  if (!isWellFormedRef(ref)
      || ref.content_hash_alg !== 'sha256'
      || !SHA256_CONTENT_ID.test(ref.content_id)
      || !SAFE_IDENTIFIER.test(ref.entity_id)
      || !SAFE_IDENTIFIER.test(ref.revision_id)
      || inspectIdentifierOpacity(ref.entity_id).opaque !== true
      || inspectIdentifierOpacity(ref.revision_id).opaque !== true
      || RESERVED_FLOATING_REVISION.test(ref.revision_id)) {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
  }
  try {
    canonicalise(ref.entity_id);
    canonicalise(ref.revision_id);
  } catch {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
  }
  return ref;
}

function normalizeRefSet(refs, { allowEmpty }) {
  if (!Array.isArray(refs) || (!allowEmpty && refs.length === 0)) {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
  }
  const exactKeysSeen = new Set();
  const logicalKeysSeen = new Map();
  const normalized = [];
  for (const ref of refs) {
    validateExactRef(ref);
    const exactKey = exactRefIdentityKey(ref);
    const logicalKey = logicalRevisionKey(ref);
    if (exactKeysSeen.has(exactKey)) refuse(PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED);
    if (logicalKeysSeen.has(logicalKey) && logicalKeysSeen.get(logicalKey) !== exactKey) {
      refuse(PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED);
    }
    exactKeysSeen.add(exactKey);
    logicalKeysSeen.set(logicalKey, exactKey);
    normalized.push(ref);
  }
  normalized.sort((left, right) => compareCodePoints(
    exactRefIdentityKey(left),
    exactRefIdentityKey(right),
  ));
  return normalized;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function cloneRef(ref) {
  return {
    entity_id: ref.entity_id,
    revision_id: ref.revision_id,
    content_id: ref.content_id,
    content_hash_alg: ref.content_hash_alg,
  };
}

function resolveRootOrRefuse(rootPath, containmentRootPath) {
  try {
    const resolution = resolveKnowledgeRoot(rootPath, {
      containmentRoot: containmentRootPath,
    });
    if (resolution.status !== ROOT_STATUS.RESOLVED
        || !/^sha256:[a-f0-9]{64}$/u.test(resolution.local_path_commitment_sha256)) {
      refuse(PROJECT_KNOWLEDGE_VIEW_CODES.ROOT_REFUSED);
    }
    return resolution;
  } catch {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.ROOT_REFUSED);
  }
}

function fingerprint(domain, material, arrayOrderRules = {}) {
  try {
    const canonical = canonicalise(material, arrayOrderRules);
    return `sha256:${sha256Hex(`${domain}\0${canonical}`)}`;
  } catch {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
  }
}

function authorityGrantContentId(authorityGrant, approvedCommonRefs) {
  const material = {
    schema_version: authorityGrant.schema_version,
    feature_state: authorityGrant.feature_state,
    authority_ceiling: authorityGrant.authority_ceiling,
    policy_ref: authorityGrant.policy_ref,
    project_binding_ref: authorityGrant.project_binding_ref,
    project_root_path: authorityGrant.project_root_path,
    common_root_path: authorityGrant.common_root_path,
    containment_root_path: authorityGrant.containment_root_path,
    approved_common_revision_refs: approvedCommonRefs,
  };
  return fingerprint(
    PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN,
    material,
    { approved_common_revision_refs: 'insertion_ordered' },
  );
}

export function selectProjectKnowledgeView(
  requestInput,
  authorityGrantInput,
  expectedAuthorityGrantRefInput,
) {
  const request = snapshotPlainData(requestInput);
  const authorityGrant = snapshotPlainData(authorityGrantInput);
  const expectedAuthorityGrantRef = snapshotPlainData(expectedAuthorityGrantRefInput);
  exactKeys(request, REQUEST_FIELDS);
  exactKeys(authorityGrant, GRANT_FIELDS);

  if (request.schema_version !== PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION
      || request.feature_state !== 'off'
      || authorityGrant.schema_version
        !== PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION
      || authorityGrant.feature_state !== 'off'
      || authorityGrant.authority_ceiling !== 'synthetic_validation_only') {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
  }
  if (!Array.isArray(request.project_binding_refs)
      || request.project_binding_refs.length !== 1) {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED);
  }

  const projectRef = validateExactRef(request.project_binding_refs[0]);
  const selectedCommonRefs = normalizeRefSet(request.common_revision_refs, { allowEmpty: true });
  const approvedCommonRefs = normalizeRefSet(
    authorityGrant.approved_common_revision_refs,
    { allowEmpty: true },
  );
  validateExactRef(authorityGrant.grant_ref);
  validateExactRef(authorityGrant.policy_ref);
  validateExactRef(authorityGrant.project_binding_ref);
  validateExactRef(expectedAuthorityGrantRef);

  if (!sameExactRef(authorityGrant.grant_ref, expectedAuthorityGrantRef)
      || authorityGrant.grant_ref.content_id
        !== authorityGrantContentId(authorityGrant, approvedCommonRefs)) {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED);
  }

  if (!sameExactRef(projectRef, authorityGrant.project_binding_ref)) {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED);
  }
  const projectIdentity = exactRefIdentityKey(projectRef);
  const projectLogicalRevision = logicalRevisionKey(projectRef);
  const roleLogicalRevisions = [
    projectLogicalRevision,
    logicalRevisionKey(authorityGrant.grant_ref),
    logicalRevisionKey(authorityGrant.policy_ref),
  ];
  const roleEntityIds = [
    projectRef.entity_id,
    authorityGrant.grant_ref.entity_id,
    authorityGrant.policy_ref.entity_id,
  ];
  if (new Set(roleLogicalRevisions).size !== roleLogicalRevisions.length
      || new Set(roleEntityIds).size !== roleEntityIds.length) {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED);
  }
  const approvedIdentities = new Set(approvedCommonRefs.map(exactRefIdentityKey));
  if (approvedIdentities.has(projectIdentity)
      || approvedCommonRefs.some((ref) => ref.entity_id === projectRef.entity_id)
      || approvedCommonRefs.some((ref) => roleLogicalRevisions.includes(logicalRevisionKey(ref)))
      || approvedCommonRefs.some((ref) => roleEntityIds.includes(ref.entity_id))
      || selectedCommonRefs.some((ref) => {
        const identity = exactRefIdentityKey(ref);
        const logicalRevision = logicalRevisionKey(ref);
        return identity === projectIdentity
          || logicalRevision === projectLogicalRevision
          || ref.entity_id === projectRef.entity_id
          || roleLogicalRevisions.includes(logicalRevision)
          || roleEntityIds.includes(ref.entity_id)
          || !approvedIdentities.has(identity);
      })) {
    refuse(PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED);
  }

  const projectRoot = resolveRootOrRefuse(
    authorityGrant.project_root_path,
    authorityGrant.containment_root_path,
  );
  let commonRoot = null;
  if (selectedCommonRefs.length > 0) {
    commonRoot = resolveRootOrRefuse(
      authorityGrant.common_root_path,
      authorityGrant.containment_root_path,
    );
    let relation;
    try {
      relation = rootRelation(projectRoot, commonRoot);
    } catch {
      refuse(PROJECT_KNOWLEDGE_VIEW_CODES.ROOT_REFUSED);
    }
    if (relation !== 'disjoint') refuse(PROJECT_KNOWLEDGE_VIEW_CODES.ROOT_REFUSED);
  }

  const projectBindingRef = cloneRef(projectRef);
  const commonRevisionRefs = selectedCommonRefs.map(cloneRef);
  const authorityGrantRef = cloneRef(authorityGrant.grant_ref);
  const policyRef = cloneRef(authorityGrant.policy_ref);
  const commonRootCommitment = commonRoot === null
    ? { selected: false }
    : {
      selected: true,
      local_path_commitment_sha256: commonRoot.local_path_commitment_sha256,
    };
  const scopeFingerprintMaterial = {
    schema_version: PROJECT_KNOWLEDGE_VIEW_SCHEMA_VERSION,
    project_binding_ref: projectBindingRef,
    common_revision_refs: commonRevisionRefs,
    policy_ref: policyRef,
  };
  const knowledgeScopeFingerprint = fingerprint(
    'soulforge.project_knowledge_view.scope_fingerprint.v0',
    scopeFingerprintMaterial,
    { common_revision_refs: 'insertion_ordered' },
  );
  const localAdmissionFingerprint = fingerprint(
    'soulforge.project_knowledge_view.local_admission.v0',
    {
      knowledge_scope_fingerprint_sha256: knowledgeScopeFingerprint,
      authority_grant_ref: authorityGrantRef,
      project_root_local_path_commitment_sha256:
        projectRoot.local_path_commitment_sha256,
      common_root_commitment: commonRootCommitment,
    },
  );

  return deepFreeze({
    schema_version: PROJECT_KNOWLEDGE_VIEW_SCHEMA_VERSION,
    kind: 'project_knowledge_view',
    status: 'selected',
    feature_state: 'off',
    route: 'validation_only',
    project_binding_ref: projectBindingRef,
    common_revision_refs: commonRevisionRefs,
    authority_grant_ref: authorityGrantRef,
    expected_authority_grant_ref_match_verified: true,
    policy_ref: policyRef,
    project_root_local_path_commitment_sha256:
      projectRoot.local_path_commitment_sha256,
    common_root_commitment: commonRootCommitment,
    knowledge_scope_fingerprint_sha256: knowledgeScopeFingerprint,
    local_admission_fingerprint_sha256: localAdmissionFingerprint,
    boundary: {
      metadata_only: true,
      project_count: 1,
      common_revision_count: commonRevisionRefs.length,
      root_relation: commonRoot === null ? 'not_selected' : 'disjoint',
      root_resolution_count: commonRoot === null ? 1 : 2,
      body_loaded: false,
      retrieval_performed: false,
      enumeration_performed: false,
      foreign_lookup_performed: false,
      filesystem_writes: 0,
      model_calls: 0,
      explicit_network_calls: 0,
    },
    authority: {
      project_read_allowed: false,
      common_read_allowed: false,
      engine_input_allowed: false,
      wiki_write_allowed: false,
      rag_write_allowed: false,
      erp_write_allowed: false,
      taskdriver_allowed: false,
      activation_allowed: false,
    },
  });
}

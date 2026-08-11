// Common-SE corpus projection -> Engineering Engine state adapter.
//
// This boundary consumes an immutable, content-addressed rule projection. It never reads a
// source body, RAG index, Wiki, NotebookLM response, filesystem, clock, or network. The graph
// remains a rebuildable view and the caller must provide both the project binding and every
// observation explicitly.

import { createHash } from 'node:crypto';
import { canonicalise, compareCodePoints } from '../kernel/canonical.mjs';
import { AUTHORITY_FAMILIES } from '../kernel/authority.mjs';
import { selectCapsule, contextCapsuleFingerprint, RANKING_KEYS } from '../kernel/capsule.mjs';
import { validateEdge, REQUIRED_EDGE_ATTRIBUTES } from '../kernel/graph.mjs';
import { classifyRef, exactRefIdentityKey, logicalRevisionKey, RESOLUTION, sameExactRef } from '../kernel/identity.mjs';
import { validateStateElement, AXIS } from '../kernel/snapshot.mjs';
import { ContractError } from '../kernel/errors.mjs';

export const CODES = Object.freeze({
  INPUT_INVALID: 'COMMON_SE_PROJECTION_INPUT_INVALID',
  FORBIDDEN_PAYLOAD: 'COMMON_SE_PROJECTION_FORBIDDEN_PAYLOAD',
  PROJECT_BINDING_REQUIRED: 'COMMON_SE_PROJECTION_BINDING_REQUIRED',
  PROJECT_BINDING_MISMATCH: 'COMMON_SE_PROJECTION_BINDING_MISMATCH',
  MANIFEST_PIN_INVALID: 'COMMON_SE_PROJECTION_MANIFEST_PIN_INVALID',
  PROJECTION_PIN_INVALID: 'COMMON_SE_PROJECTION_PIN_INVALID',
  REF_DIGEST_INVALID: 'COMMON_SE_PROJECTION_REF_DIGEST_INVALID',
  NODE_INVALID: 'COMMON_SE_PROJECTION_NODE_INVALID',
  EDGE_INVALID: 'COMMON_SE_PROJECTION_EDGE_INVALID',
  AUTHORITY_CEILING_BREACH: 'COMMON_SE_PROJECTION_AUTHORITY_CEILING_BREACH',
  SELECTOR_UNBOUNDED: 'COMMON_SE_PROJECTION_SELECTOR_UNBOUNDED',
  OBSERVATION_INVALID: 'COMMON_SE_PROJECTION_OBSERVATION_INVALID',
  SELECTION_EMPTY: 'COMMON_SE_PROJECTION_SELECTION_EMPTY',
  JSON_SHAPE_INVALID: 'COMMON_SE_PROJECTION_JSON_SHAPE_INVALID',
  SCHEMA_CLOSED: 'COMMON_SE_PROJECTION_SCHEMA_CLOSED',
});

export const SUBJECT_ID = 'common_se_corpus_projection';
export const PROJECTION_SCHEMA_VERSION = 'soulforge.common_se_corpus_projection.v0';
export const SELECTOR_SCOPE = 'common_se_eval_slice';

const SHA256 = /^[0-9a-f]{64}$/;
const AUTHORITY_RANK = new Map(AUTHORITY_FAMILIES.map((family) => [family.key, family.rank]));
const REF_SHA_PREFIX = 'sha256:';
const MAX_SELECTOR = Object.freeze({
  seeds: 20, top_k: 50, max_nodes: 50, max_edges: 50, max_sources: 20, max_evidence_chars: 4000,
});
const MAX_PROJECTION = Object.freeze({ nodes: 100, edges: 50 });
const MAX_JSON = Object.freeze({ depth: 16, values: 5000, array: 100, object_keys: 32, string: 512, key: 80 });
const PROJECTION_FIELDS = Object.freeze([
  'schema_version', 'immutable_derived_projection', 'is_truth_owner',
  'projection_revision', 'projection_ref', 'projection_sha256',
  'project_binding_kind', 'project_binding_ref', 'authority_ceiling',
  'manifest_ref', 'manifest_sha256', 'nodes', 'edges',
]);
const REF_FIELDS = Object.freeze(['entity_id', 'revision_id', 'content_id', 'content_hash_alg']);
const RULE_NODE_FIELDS = Object.freeze([
  'node_type', 'ref', 'content_sha256', 'project_binding_ref', 'authority_family', 'applicability',
]);
const EXPECTED_NODE_FIELDS = Object.freeze([...RULE_NODE_FIELDS, 'state_element']);
const EXPECTED_STATE_FIELDS = Object.freeze([
  'element_id', 'axis', 'requirement_ref', 'authority_family', 'applicability', 'valid_at', 'known_at',
]);
const SELECTOR_FIELDS = Object.freeze([
  'project_binding_ref', 'scope', 'accepted_context_generation', 'valid_at', 'known_at',
  'acl_filter_revision', 'source_family_filter', 'seed_refs', 'traversal', 'ranking', 'budgets',
  'graph_projection_revision',
]);
const TRAVERSAL_FIELDS = Object.freeze(['max_hops', 'allowlisted_edge_types']);
const RANKING_FIELDS = Object.freeze(['method', 'keys']);
const BUDGET_FIELDS = Object.freeze(['top_k', 'max_nodes', 'max_edges', 'max_sources', 'max_evidence_chars']);
const OBSERVATION_FIELDS = Object.freeze([
  'element_id', 'axis', 'artifact_revision_ref', 'presence_state', 'valid_at', 'known_at', 'project_binding_ref',
]);
const FORBIDDEN_KEYS = new Set([
  'raw', 'raw_text', 'source_text', 'chunk', 'chunks', 'answer', 'answer_text',
  'body', 'text', 'payload', 'prompt', 'completion', 'private_path', 'absolute_path',
  'source_path', 'secret', 'credential', 'password', 'cookie', 'token',
]);
const FORBIDDEN_STRING_PATTERNS = [
  /(?:^|[\\/])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[\\/])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[\\/])private-state(?:[\\/]|$)/iu,
  /^[a-z]:[\\/]/iu,
  /^\/(?:users|home|var|private)\//iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_\-]{8,}/u,
  /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => structuredClone(value);
const compareTuples = (a, b) => {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (index >= a.length) return -1;
    if (index >= b.length) return 1;
    const comparison = compareCodePoints(String(a[index]), String(b[index]));
    if (comparison !== 0) return comparison;
  }
  return 0;
};
const refTuple = (ref) => REF_FIELDS.map((field) => ref?.[field] ?? '');
const canonicalRefs = (refs) => {
  const byIdentity = new Map();
  for (const ref of refs) byIdentity.set(exactRefIdentityKey(ref), clone(ref));
  const ordered = [...byIdentity.values()].sort((a, b) => compareTuples(
    [a.revision_id, ...refTuple(a)],
    [b.revision_id, ...refTuple(b)],
  ));
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].revision_id === ordered[index].revision_id) {
      throw new ContractError(CODES.REF_DIGEST_INVALID,
        'canonical input refs may not reuse one revision_id for different exact refs');
    }
  }
  return ordered;
};
const refDigest = (ref) => (typeof ref?.content_id === 'string' && ref.content_id.startsWith(REF_SHA_PREFIX)
  ? ref.content_id.slice(REF_SHA_PREFIX.length)
  : null);

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function assertSafeString(value) {
  if (typeof value !== 'string' || value.length > MAX_JSON.string
      || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new ContractError(CODES.JSON_SHAPE_INVALID,
      'input strings must be bounded NFC text without control characters');
  }
  if (FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new ContractError(CODES.FORBIDDEN_PAYLOAD,
      'private paths, credentials, tokens, and source payload are forbidden at this boundary');
  }
}

function snapshotPlainJson(root) {
  const seen = new WeakSet();
  let values = 0;
  const walk = (value, depth) => {
    values += 1;
    if (values > MAX_JSON.values || depth > MAX_JSON.depth) {
      throw new ContractError(CODES.JSON_SHAPE_INVALID, 'input exceeds the bounded JSON tree limits');
    }
    if (typeof value === 'string') { assertSafeString(value); return value; }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) {
        throw new ContractError(CODES.JSON_SHAPE_INVALID, 'JSON numbers must be safe integers');
      }
      return value;
    }
    if (value === null || typeof value !== 'object') {
      throw new ContractError(CODES.JSON_SHAPE_INVALID, 'only non-null plain JSON values are accepted');
    }
    if (seen.has(value)) {
      throw new ContractError(CODES.JSON_SHAPE_INVALID, 'cyclic or aliased object graphs are not JSON trees');
    }
    seen.add(value);

    const array = Array.isArray(value);
    let prototype;
    let descriptors;
    try {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      throw new ContractError(CODES.JSON_SHAPE_INVALID,
        'input reflection failed without exposing caller-controlled error text');
    }
    if ((array && prototype !== Array.prototype)
        || (!array && prototype !== Object.prototype)) {
      throw new ContractError(CODES.JSON_SHAPE_INVALID, 'custom prototypes and host objects are forbidden');
    }
    const arrayLength = array ? descriptors.length?.value : undefined;
    if (array && (!Number.isSafeInteger(arrayLength) || arrayLength < 0 || arrayLength > MAX_JSON.array)) {
      throw new ContractError(CODES.JSON_SHAPE_INVALID, 'an input array exceeds the hard item limit');
    }
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) {
      throw new ContractError(CODES.JSON_SHAPE_INVALID, 'symbol properties are not JSON');
    }
    const dataKeys = array ? keys.filter((key) => key !== 'length') : keys;
    if (!array && dataKeys.length > MAX_JSON.object_keys) {
      throw new ContractError(CODES.JSON_SHAPE_INVALID, 'an input object exceeds the hard field limit');
    }
    if (array) {
      const expected = new Set(Array.from({ length: arrayLength }, (_, index) => String(index)));
      if (dataKeys.length !== expected.size || dataKeys.some((key) => !expected.has(key))) {
        throw new ContractError(CODES.JSON_SHAPE_INVALID, 'sparse arrays and named array properties are forbidden');
      }
    }
    const snapshot = array ? new Array(arrayLength) : {};
    for (const key of dataKeys) {
      if (key.length > MAX_JSON.key || key.normalize('NFC') !== key) {
        throw new ContractError(CODES.JSON_SHAPE_INVALID, 'object keys must be bounded NFC strings');
      }
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new ContractError(CODES.JSON_SHAPE_INVALID, 'accessors and hidden fields are forbidden');
      }
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        throw new ContractError(CODES.FORBIDDEN_PAYLOAD,
          'source or model payload fields are forbidden at this boundary');
      }
      const child = walk(descriptor.value, depth + 1);
      Object.defineProperty(snapshot, key, {
        value: child, enumerable: true, configurable: true, writable: true,
      });
    }
    return snapshot;
  };
  return walk(root, 0);
}

function snapshotInvocation(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ContractError(CODES.INPUT_INVALID, 'adapter invocation must be one plain object');
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(input);
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch {
    throw new ContractError(CODES.INPUT_INVALID,
      'invocation reflection failed without exposing caller-controlled error text');
  }
  if (prototype !== Object.prototype) {
    throw new ContractError(CODES.INPUT_INVALID, 'adapter invocation must use the plain object prototype');
  }
  const fields = ['projection', 'selector', 'observedStateElements', 'aclCheck', 'expectedProjectBindingRef'];
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== 'string') || keys.length !== fields.length
      || fields.some((field) => !Object.hasOwn(descriptors, field))) {
    throw new ContractError(CODES.INPUT_INVALID, 'adapter invocation uses one closed field set');
  }
  const values = {};
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new ContractError(CODES.INPUT_INVALID, 'adapter invocation fields must be own enumerable data properties');
    }
    values[field] = descriptor.value;
  }
  return values;
}

function assertExactKeys(value, fields, code = CODES.SCHEMA_CLOSED) {
  if (!isObject(value)) throw new ContractError(code, 'contract value must be a plain object');
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...fields].sort(compareCodePoints);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ContractError(code, 'contract objects use a closed, exact field set');
  }
}

function assertBoundedIdentifier(value, code) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 160) {
    throw new ContractError(code, 'identifier must be a non-empty bounded string');
  }
}

function assertDigestRef(ref, code, label, declaredDigest = undefined) {
  assertExactKeys(ref, REF_FIELDS, code);
  if (classifyRef(ref, { bytesAvailable: true }) !== RESOLUTION.RESOLVABLE) {
    throw new ContractError(code, `${label} must be a complete exact revision ref`);
  }
  for (const field of ['entity_id', 'revision_id']) assertBoundedIdentifier(ref[field], code);
  if (ref.content_hash_alg !== 'sha256') throw new ContractError(code, 'exact refs require sha256');
  const digest = refDigest(ref);
  if (!SHA256.test(digest ?? '')) {
    throw new ContractError(CODES.REF_DIGEST_INVALID,
      `${label}.content_id must be "sha256:<lowercase digest>"`);
  }
  if (declaredDigest !== undefined && (!SHA256.test(declaredDigest) || digest !== declaredDigest)) {
    throw new ContractError(CODES.REF_DIGEST_INVALID,
      `${label} content digest does not match its exact ref`);
  }
  return digest;
}

function assertAuthorityWithinCeiling(authority, ceiling) {
  const rank = AUTHORITY_RANK.get(authority);
  const ceilingRank = AUTHORITY_RANK.get(ceiling);
  if (rank === undefined || ceilingRank === undefined) {
    throw new ContractError(CODES.AUTHORITY_CEILING_BREACH,
      'authority and authority ceiling must use registered family keys');
  }
  if (rank < ceilingRank) {
    throw new ContractError(CODES.AUTHORITY_CEILING_BREACH,
      'derived projection material may not claim more authority than its declared ceiling');
  }
}

function assertDoesNotOutrank(authority, groundingAuthorities) {
  const rank = AUTHORITY_RANK.get(authority);
  if (rank === undefined || groundingAuthorities.some((grounding) => AUTHORITY_RANK.get(grounding) === undefined)
      || groundingAuthorities.some((grounding) => rank < AUTHORITY_RANK.get(grounding))) {
    throw new ContractError(CODES.AUTHORITY_CEILING_BREACH,
      'an expected state authority may not outrank its rule, evidence, or edge grounding');
  }
}

function normalisedProjectionMaterial(projection) {
  // Compare tuple fields independently. Joining caller-controlled identifiers with a printable
  // separator lets two distinct tuples collapse to one sort key (for example ["a|b", "c"] and
  // ["a", "b|c"]), after which a stable sort makes the projection hash depend on input order.
  const nodes = [...projection.nodes].sort((a, b) => compareTuples(
    [a?.ref?.revision_id ?? '', a?.ref?.entity_id ?? '', a?.ref?.content_id ?? '',
      a?.ref?.content_hash_alg ?? '', a?.node_type ?? ''],
    [b?.ref?.revision_id ?? '', b?.ref?.entity_id ?? '', b?.ref?.content_id ?? '',
      b?.ref?.content_hash_alg ?? '', b?.node_type ?? ''],
  ));
  const edges = [...projection.edges].sort((a, b) => compareTuples(
    [a?.edge_id ?? '', ...refTuple(a?.from_ref), ...refTuple(a?.to_ref), ...refTuple(a?.evidence_ref)],
    [b?.edge_id ?? '', ...refTuple(b?.from_ref), ...refTuple(b?.to_ref), ...refTuple(b?.evidence_ref)],
  ));
  // The checksum field is the only excluded field. Every other accepted semantic field,
  // including the complete projection_ref, is hashed. The projection ref's content digest is
  // an external byte pin and is deliberately not required to equal this semantic checksum;
  // requiring equality would create an impossible self-referential hash.
  const { projection_sha256: _checksum, ...semanticFields } = projection;
  return { ...semanticFields, nodes, edges };
}

function projectionSha256(projection) {
  const material = normalisedProjectionMaterial(projection);
  try {
    return createHash('sha256')
      .update(`soulforge.common_se_corpus_projection.v0\n${canonicalise(material, {
        nodes: 'insertion_ordered', edges: 'insertion_ordered',
      })}`)
      .digest('hex');
  } catch {
    throw new ContractError(CODES.PROJECTION_PIN_INVALID,
      'projection semantic fields could not be canonicalised');
  }
}

function assertProjectionClosedStructure(projection) {
  for (const node of projection.nodes) {
    if (!isObject(node) || !['rule', 'expected_state_element'].includes(node.node_type)) {
      throw new ContractError(CODES.NODE_INVALID,
        'common-SE projection nodes are limited to rule and expected_state_element');
    }
    assertExactKeys(node, node.node_type === 'rule' ? RULE_NODE_FIELDS : EXPECTED_NODE_FIELDS, CODES.NODE_INVALID);
    assertDigestRef(node.ref, CODES.NODE_INVALID, 'node.ref', node.content_sha256);
    for (const field of ['node_type', 'project_binding_ref', 'authority_family']) {
      assertBoundedIdentifier(node[field], CODES.NODE_INVALID);
    }
    if (node.node_type === 'expected_state_element') {
      assertExactKeys(node.state_element, EXPECTED_STATE_FIELDS, CODES.NODE_INVALID);
      assertDigestRef(node.state_element.requirement_ref, CODES.NODE_INVALID, 'requirement_ref');
      assertBoundedIdentifier(node.state_element.element_id, CODES.NODE_INVALID);
    }
  }
  for (const edge of projection.edges) {
    assertExactKeys(edge, REQUIRED_EDGE_ATTRIBUTES, CODES.EDGE_INVALID);
    for (const ref of [edge.from_ref, edge.to_ref, edge.evidence_ref]) {
      assertDigestRef(ref, CODES.EDGE_INVALID, 'edge ref');
    }
    for (const field of [
      'edge_id', 'edge_type', 'from_type', 'to_type', 'authority_family', 'review_state',
      'evidence_claim_ceiling', 'generating_policy_revision', 'project_binding_ref',
    ]) assertBoundedIdentifier(edge[field], CODES.EDGE_INVALID);
  }
}

function assertProjectionEnvelope(projection, expectedProjectBindingRef) {
  assertExactKeys(projection, PROJECTION_FIELDS, CODES.SCHEMA_CLOSED);
  if (projection.schema_version !== PROJECTION_SCHEMA_VERSION) {
    throw new ContractError(CODES.INPUT_INVALID, `projection schema must be ${PROJECTION_SCHEMA_VERSION}`);
  }
  if (projection.immutable_derived_projection !== true || projection.is_truth_owner !== false) {
    throw new ContractError(CODES.INPUT_INVALID,
      'the common-SE projection must declare an immutable derived view and must not claim truth ownership');
  }
  if (!['synthetic', 'explicit'].includes(projection.project_binding_kind)) {
    throw new ContractError(CODES.PROJECT_BINDING_REQUIRED,
      'project_binding_kind must be explicitly "synthetic" or "explicit"; no inferred binding exists');
  }
  assertSafeString(expectedProjectBindingRef);
  if (typeof expectedProjectBindingRef !== 'string' || expectedProjectBindingRef.length === 0
      || expectedProjectBindingRef.length > 160) {
    throw new ContractError(CODES.PROJECT_BINDING_REQUIRED, 'expectedProjectBindingRef is required and has no fallback');
  }
  if (typeof projection.project_binding_ref !== 'string' || projection.project_binding_ref.length === 0
      || projection.project_binding_ref !== expectedProjectBindingRef) {
    throw new ContractError(CODES.PROJECT_BINDING_MISMATCH,
      'projection binding must exactly match the caller-declared binding');
  }
  for (const field of ['schema_version', 'projection_revision', 'project_binding_kind', 'project_binding_ref', 'authority_ceiling']) {
    assertBoundedIdentifier(projection[field], CODES.INPUT_INVALID);
  }
  assertDigestRef(projection.manifest_ref, CODES.MANIFEST_PIN_INVALID, 'manifest_ref', projection.manifest_sha256);
  if (projection.projection_ref?.revision_id !== projection.projection_revision) {
    throw new ContractError(CODES.PROJECTION_PIN_INVALID,
      'projection_ref must name the declared projection_revision exactly');
  }
  assertDigestRef(projection.projection_ref, CODES.PROJECTION_PIN_INVALID, 'projection_ref');
  if (!Array.isArray(projection.nodes) || projection.nodes.length === 0
      || !Array.isArray(projection.edges) || projection.edges.length === 0) {
    throw new ContractError(CODES.INPUT_INVALID, 'projection nodes and edges must be non-empty arrays');
  }
  if (projection.nodes.length > MAX_PROJECTION.nodes || projection.edges.length > MAX_PROJECTION.edges) {
    throw new ContractError(CODES.SELECTOR_UNBOUNDED,
      'the supplied projection slice exceeds the common-SE node or edge ceiling; a whole corpus is not a capsule input');
  }
  if (!SHA256.test(projection.projection_sha256)) {
    throw new ContractError(CODES.PROJECTION_PIN_INVALID, 'projection_sha256 must be a lowercase sha256 digest');
  }
  assertProjectionClosedStructure(projection);
  const calculated = projectionSha256(projection);
  if (calculated !== projection.projection_sha256) {
    throw new ContractError(CODES.PROJECTION_PIN_INVALID,
      'projection_sha256 does not match all accepted semantic fields', { expected_sha256: calculated });
  }
  assertAuthorityWithinCeiling(projection.authority_ceiling, projection.authority_ceiling);
}

function validateProjectionGraph(projection) {
  const nodesByExactRef = new Map();
  const logicalRefs = new Set();
  const expectedElementIds = new Set();

  for (const node of projection.nodes) {
    if (!isObject(node) || !['rule', 'expected_state_element'].includes(node.node_type)) {
      throw new ContractError(CODES.NODE_INVALID,
        'common-SE projection nodes are limited to rule and expected_state_element');
    }
    assertExactKeys(node, node.node_type === 'rule' ? RULE_NODE_FIELDS : EXPECTED_NODE_FIELDS, CODES.NODE_INVALID);
    for (const field of ['node_type', 'project_binding_ref', 'authority_family']) {
      assertBoundedIdentifier(node[field], CODES.NODE_INVALID);
    }
    assertDigestRef(node.ref, CODES.NODE_INVALID, 'node.ref', node.content_sha256);
    const key = exactRefIdentityKey(node.ref);
    const logical = logicalRevisionKey(node.ref);
    if (nodesByExactRef.has(key) || logicalRefs.has(logical)) {
      throw new ContractError(CODES.NODE_INVALID, 'a projection node revision may be declared only once');
    }
    if (node.project_binding_ref !== projection.project_binding_ref) {
      throw new ContractError(CODES.PROJECT_BINDING_MISMATCH, 'every projection node must use the projection binding');
    }
    if (node.applicability !== true) {
      throw new ContractError(CODES.NODE_INVALID,
        'only explicitly applicable common-SE rules may produce expected state elements');
    }
    assertAuthorityWithinCeiling(node.authority_family, projection.authority_ceiling);
    if (node.node_type === 'expected_state_element') {
      const element = node.state_element;
      assertExactKeys(element, EXPECTED_STATE_FIELDS, CODES.NODE_INVALID);
      assertDigestRef(element.requirement_ref, CODES.NODE_INVALID, 'requirement_ref');
      assertBoundedIdentifier(element.element_id, CODES.NODE_INVALID);
      if (!isObject(element) || element.axis !== AXIS.EXPECTED || !sameExactRef(element.requirement_ref, node.ref)
          || element.authority_family !== node.authority_family || element.applicability !== true) {
        throw new ContractError(CODES.NODE_INVALID,
          'an expected node must carry one matching expected state element grounded in its exact node ref');
      }
      try { validateStateElement(element); } catch {
        throw new ContractError(CODES.NODE_INVALID, 'expected state element failed the existing state contract');
      }
      if (expectedElementIds.has(element.element_id)) {
        throw new ContractError(CODES.NODE_INVALID, 'expected element_id values must be unique');
      }
      expectedElementIds.add(element.element_id);
    } else if (Object.hasOwn(node, 'state_element')) {
      throw new ContractError(CODES.NODE_INVALID, 'a rule node is metadata, not an expected-state payload container');
    }
    nodesByExactRef.set(key, node);
    logicalRefs.add(logical);
  }

  const edgeIds = new Set();
  for (const edge of projection.edges) {
    assertExactKeys(edge, REQUIRED_EDGE_ATTRIBUTES, CODES.EDGE_INVALID);
    for (const field of [
      'edge_id', 'edge_type', 'from_type', 'to_type', 'authority_family', 'review_state',
      'evidence_claim_ceiling', 'generating_policy_revision', 'project_binding_ref',
    ]) assertBoundedIdentifier(edge[field], CODES.EDGE_INVALID);
    for (const ref of [edge.from_ref, edge.to_ref, edge.evidence_ref]) {
      assertDigestRef(ref, CODES.EDGE_INVALID, 'edge ref');
    }
    if (edge?.from_type !== 'rule' || edge?.edge_type !== 'requires' || edge?.to_type !== 'expected_state_element') {
      throw new ContractError(CODES.EDGE_INVALID,
        'the Engine adapter accepts only rule -> requires -> expected_state_element edges');
    }
    if (edgeIds.has(edge.edge_id)) throw new ContractError(CODES.EDGE_INVALID, 'edge_id values must be unique');
    edgeIds.add(edge.edge_id);
    const fromNode = nodesByExactRef.get(exactRefIdentityKey(edge.from_ref));
    const toNode = nodesByExactRef.get(exactRefIdentityKey(edge.to_ref));
    const evidenceNode = nodesByExactRef.get(exactRefIdentityKey(edge.evidence_ref));
    if (fromNode?.node_type !== 'rule' || toNode?.node_type !== 'expected_state_element' || evidenceNode === undefined
        || !sameExactRef(edge.evidence_ref, edge.from_ref)) {
      throw new ContractError(CODES.EDGE_INVALID, 'every edge endpoint and evidence ref must resolve in the declared projection nodes');
    }
    if (edge.project_binding_ref !== projection.project_binding_ref || edge.applicability !== true) {
      throw new ContractError(CODES.EDGE_INVALID, 'requires edges must be applicable and use the exact projection binding');
    }
    assertAuthorityWithinCeiling(edge.authority_family, projection.authority_ceiling);
    assertDoesNotOutrank(toNode.authority_family,
      [fromNode.authority_family, evidenceNode.authority_family, edge.authority_family]);
    try {
      validateEdge(edge, { evidenceAuthority: evidenceNode.authority_family, evidenceResolvable: true });
    } catch {
      throw new ContractError(CODES.EDGE_INVALID, 'requires edge failed the existing typed-graph contract');
    }
  }
  return nodesByExactRef;
}

function assertBoundedSelector(selector, projection, expectedProjectBindingRef, ruleRefs, nodesByExactRef) {
  assertExactKeys(selector, SELECTOR_FIELDS, CODES.SELECTOR_UNBOUNDED);
  assertExactKeys(selector.traversal, TRAVERSAL_FIELDS, CODES.SELECTOR_UNBOUNDED);
  assertExactKeys(selector.ranking, RANKING_FIELDS, CODES.SELECTOR_UNBOUNDED);
  assertExactKeys(selector.budgets, BUDGET_FIELDS, CODES.SELECTOR_UNBOUNDED);
  if (selector.project_binding_ref !== expectedProjectBindingRef
      || selector.project_binding_ref !== projection.project_binding_ref) {
    throw new ContractError(CODES.PROJECT_BINDING_MISMATCH, 'selector binding must match both caller and projection');
  }
  if (selector.scope !== SELECTOR_SCOPE || selector.traversal?.max_hops !== 1
      || JSON.stringify(selector.traversal?.allowlisted_edge_types) !== JSON.stringify(['requires'])) {
    throw new ContractError(CODES.SELECTOR_UNBOUNDED,
      `selector must use scope "${SELECTOR_SCOPE}" and exactly one allowlisted requires hop`);
  }
  if (!Array.isArray(selector.seed_refs) || selector.seed_refs.length < 1
      || selector.seed_refs.length > MAX_SELECTOR.seeds
      || selector.seed_refs.some((ref) => {
        try { assertDigestRef(ref, CODES.SELECTOR_UNBOUNDED, 'seed ref'); } catch { return true; }
        return !ruleRefs.has(exactRefIdentityKey(ref));
      })) {
    throw new ContractError(CODES.SELECTOR_UNBOUNDED,
      'selector seeds must be a bounded, non-empty subset of declared rule refs');
  }
  const uniqueSeeds = new Set(selector.seed_refs.map(exactRefIdentityKey));
  if (uniqueSeeds.size !== selector.seed_refs.length) {
    throw new ContractError(CODES.SELECTOR_UNBOUNDED, 'selector seed refs must be unique');
  }
  if (!Array.isArray(selector.source_family_filter) || selector.source_family_filter.length === 0
      || selector.source_family_filter.length > AUTHORITY_FAMILIES.length
      || new Set(selector.source_family_filter).size !== selector.source_family_filter.length
      || selector.source_family_filter.some((family) => !AUTHORITY_RANK.has(family))) {
    throw new ContractError(CODES.SELECTOR_UNBOUNDED, 'source_family_filter must be a non-empty registered allowlist');
  }
  if (typeof selector.acl_filter_revision !== 'string' || selector.acl_filter_revision.length === 0) {
    throw new ContractError(CODES.SELECTOR_UNBOUNDED, 'acl_filter_revision must be explicit and non-empty');
  }
  if (selector.ranking?.method !== 'deterministic'
      || JSON.stringify(selector.ranking.keys) !== JSON.stringify([...RANKING_KEYS])) {
    throw new ContractError(CODES.SELECTOR_UNBOUNDED, 'selector ranking must use the deterministic capsule contract');
  }
  const b = selector.budgets;
  if (!isObject(b)
      || !Number.isInteger(b.top_k) || b.top_k < 1 || b.top_k > MAX_SELECTOR.top_k
      || !Number.isInteger(b.max_nodes) || b.max_nodes < b.top_k || b.max_nodes > MAX_SELECTOR.max_nodes
      || !Number.isInteger(b.max_edges) || b.max_edges < 1 || b.max_edges > MAX_SELECTOR.max_edges
      || !Number.isInteger(b.max_sources) || b.max_sources < 1 || b.max_sources > MAX_SELECTOR.max_sources
      || !Number.isInteger(b.max_evidence_chars) || b.max_evidence_chars < 1
      || b.max_evidence_chars > MAX_SELECTOR.max_evidence_chars) {
    throw new ContractError(CODES.SELECTOR_UNBOUNDED, 'selector budgets exceed the common-SE hard ceilings or are malformed');
  }
  if (selector.graph_projection_revision !== projection.projection_revision) {
    throw new ContractError(CODES.PROJECTION_PIN_INVALID, 'selector graph projection revision must be exact');
  }
  for (const field of ['project_binding_ref', 'scope', 'acl_filter_revision', 'graph_projection_revision']) {
    assertBoundedIdentifier(selector[field], CODES.SELECTOR_UNBOUNDED);
  }

  const allowedFamilies = new Set(selector.source_family_filter);
  const seedKeys = new Set(selector.seed_refs.map((ref) => exactRefIdentityKey(ref)));
  const selectableEdgeCount = projection.edges
    .filter((edge) => seedKeys.has(exactRefIdentityKey(edge.from_ref))).length;
  if (selectableEdgeCount > b.max_edges) {
    throw new ContractError(CODES.SELECTOR_UNBOUNDED,
      'the one-hop selection contains more candidate edges than selector.budgets.max_edges');
  }
  for (const seedKey of seedKeys) {
    const seedNode = nodesByExactRef.get(seedKey);
    if (!allowedFamilies.has(seedNode.authority_family)) {
      throw new ContractError(CODES.SELECTOR_UNBOUNDED,
        'source_family_filter must allow every seeded rule authority, including isolated seeds');
    }
  }
  for (const edge of projection.edges) {
    if (!seedKeys.has(exactRefIdentityKey(edge.from_ref))) continue;
    const fromNode = nodesByExactRef.get(exactRefIdentityKey(edge.from_ref));
    const toNode = nodesByExactRef.get(exactRefIdentityKey(edge.to_ref));
    const evidenceNode = nodesByExactRef.get(exactRefIdentityKey(edge.evidence_ref));
    if (![fromNode.authority_family, toNode.authority_family, evidenceNode.authority_family, edge.authority_family]
      .every((family) => allowedFamilies.has(family))) {
      throw new ContractError(CODES.SELECTOR_UNBOUNDED,
        'source_family_filter must apply to rule, evidence, edge, and expected-state authority');
    }
  }
}

function validateObservations(observedStateElements, selectedElementIds, projectBindingRef) {
  if (!Array.isArray(observedStateElements)) {
    throw new ContractError(CODES.OBSERVATION_INVALID,
      'observedStateElements must be supplied explicitly; an omitted observation set has no default');
  }
  if (observedStateElements.length > MAX_SELECTOR.top_k) {
    throw new ContractError(CODES.OBSERVATION_INVALID, 'observation set exceeds the selected-state ceiling');
  }
  const byId = new Map();
  for (const observation of observedStateElements) {
    assertExactKeys(observation, OBSERVATION_FIELDS, CODES.OBSERVATION_INVALID);
    if (!isObject(observation) || observation.axis !== AXIS.OBSERVED
        || observation.project_binding_ref !== projectBindingRef
        || !selectedElementIds.has(observation.element_id)) {
      throw new ContractError(CODES.OBSERVATION_INVALID,
        'every observation must be explicit, bound, and correspond to one selected expected element');
    }
    assertDigestRef(observation.artifact_revision_ref, CODES.OBSERVATION_INVALID, 'artifact_revision_ref');
    assertBoundedIdentifier(observation.element_id, CODES.OBSERVATION_INVALID);
    try { validateStateElement(observation); } catch {
      throw new ContractError(CODES.OBSERVATION_INVALID, 'observation failed the existing state contract');
    }
    if (byId.has(observation.element_id)) {
      throw new ContractError(CODES.OBSERVATION_INVALID, 'an observed element may be supplied only once');
    }
    byId.set(observation.element_id, clone(observation));
  }
  return [...byId.values()].sort((a, b) => compareCodePoints(a.element_id, b.element_id));
}

function strongContextCapsuleFingerprint({ projection, selector, capsule, aclTrace }) {
  const seedKeys = new Set(selector.seed_refs.map((ref) => exactRefIdentityKey(ref)));
  const selectedEdgeIds = new Set(capsule.included_refs.map((included) => included.via_edge_id));
  const candidateEdges = projection.edges.filter((edge) => seedKeys.has(exactRefIdentityKey(edge.from_ref)));
  const selectedRefs = capsule.included_refs.map((included) => {
    const edge = projection.edges.find((candidate) => candidate.edge_id === included.via_edge_id);
    return {
      ref: clone(edge.to_ref),
      via_edge_id: edge.edge_id,
      hop: included.hop,
    };
  }).sort((a, b) => compareTuples(
    [a.via_edge_id, ...refTuple(a.ref), a.hop],
    [b.via_edge_id, ...refTuple(b.ref), b.hop],
  ));
  const unselectedCandidates = candidateEdges
    .filter((edge) => !selectedEdgeIds.has(edge.edge_id))
    .map((edge) => ({
      ref: clone(edge.to_ref),
      via_edge_id: edge.edge_id,
    }))
    .sort((a, b) => compareTuples(
      [a.via_edge_id, ...refTuple(a.ref)],
      [b.via_edge_id, ...refTuple(b.ref)],
    ));
  const aclDecisions = [...aclTrace.values()].sort((a, b) => {
    if (a.hop !== b.hop) return a.hop - b.hop;
    return compareTuples(refTuple(a.ref), refTuple(b.ref));
  });
  const excludedSummary = capsule.excluded.map((entry) => ({
    reason: entry.reason,
    hop: entry.hop,
    count: entry.count,
  })).sort((a, b) => compareTuples([a.reason, a.hop], [b.reason, b.hop]));
  const material = {
    contract_version: 'soulforge.common_se_context_capsule_fingerprint.v1',
    projection: {
      projection_ref: clone(projection.projection_ref),
      projection_sha256: projection.projection_sha256,
      manifest_ref: clone(projection.manifest_ref),
      manifest_sha256: projection.manifest_sha256,
    },
    selector: {
      ...clone(selector),
      source_family_filter: [...selector.source_family_filter].sort(compareCodePoints),
      seed_refs: canonicalRefs(selector.seed_refs),
      traversal: {
        ...clone(selector.traversal),
        allowlisted_edge_types: [...selector.traversal.allowlisted_edge_types].sort(compareCodePoints),
      },
    },
    selection: {
      kernel_capsule_fingerprint: contextCapsuleFingerprint(selector, capsule),
      selected_refs: selectedRefs,
      unselected_candidate_refs: unselectedCandidates,
      acl_decisions: aclDecisions,
      excluded_summary: excludedSummary,
      included_count: capsule.included_refs.length,
      excluded_count: capsule.excluded_count,
      traversed_node_count: capsule.traversed_node_count,
    },
  };
  return createHash('sha256')
    .update(`soulforge.common_se_context_capsule_fingerprint.v1\n${canonicalise(material, {
      'selector.source_family_filter': 'insertion_ordered',
      'selector.seed_refs': 'sorted_by:revision_id',
      'selector.traversal.allowlisted_edge_types': 'insertion_ordered',
      'selector.ranking.keys': 'insertion_ordered',
      'selection.selected_refs': 'insertion_ordered',
      'selection.unselected_candidate_refs': 'insertion_ordered',
      'selection.acl_decisions': 'insertion_ordered',
      'selection.excluded_summary': 'insertion_ordered',
    })}`)
    .digest('hex');
}

/**
 * Builds the existing Engine `states` shape from a bounded common-SE rule projection.
 *
 * No observation is fabricated. If a selected expected element has no explicit counterpart,
 * runEnginePass classifies it UNKNOWN. Only a caller-supplied `absence_confirmed` observation
 * can reach the kernel's MISSING branch.
 */
export function buildStatesFromCommonSeProjection(input) {
  const invocation = snapshotInvocation(input);
  const projection = snapshotPlainJson(invocation.projection);
  const selector = snapshotPlainJson(invocation.selector);
  const observedStateElements = Array.isArray(invocation.observedStateElements)
    ? snapshotPlainJson(invocation.observedStateElements)
    : invocation.observedStateElements;
  const { aclCheck, expectedProjectBindingRef } = invocation;
  assertProjectionEnvelope(projection, expectedProjectBindingRef);
  const nodesByExactRef = validateProjectionGraph(projection);
  const ruleRefs = new Set(projection.nodes
    .filter((node) => node.node_type === 'rule')
    .map((node) => exactRefIdentityKey(node.ref)));
  assertBoundedSelector(selector, projection, expectedProjectBindingRef, ruleRefs, nodesByExactRef);
  if (typeof aclCheck !== 'function') {
    throw new ContractError(CODES.INPUT_INVALID, 'aclCheck is required and has no permissive default');
  }
  const aclTrace = new Map();
  const checkedAcl = (ref, hop) => {
    let verdict;
    try { verdict = aclCheck(clone(ref), hop); } catch {
      throw new ContractError(CODES.INPUT_INVALID, 'aclCheck failed without exposing caller-controlled error text');
    }
    if (verdict !== true && verdict !== false) {
      throw new ContractError(CODES.INPUT_INVALID, 'aclCheck must return an explicit boolean at every hop');
    }
    const traceKey = JSON.stringify([hop, ...refTuple(ref)]);
    const prior = aclTrace.get(traceKey);
    if (prior && prior.allowed !== verdict) {
      throw new ContractError(CODES.INPUT_INVALID, 'aclCheck returned inconsistent decisions for one exact ref and hop');
    }
    aclTrace.set(traceKey, { ref: clone(ref), hop, allowed: verdict });
    return verdict;
  };
  let capsule;
  try {
    capsule = selectCapsule(selector, {
      edges: projection.edges,
      nodes: projection.nodes.map((node) => ({ ref: node.ref, project_binding_ref: node.project_binding_ref })),
    }, checkedAcl);
  } catch (error) {
    if (error instanceof ContractError && Object.values(CODES).includes(error.code)) throw error;
    throw new ContractError(CODES.SELECTOR_UNBOUNDED,
      'the existing capsule contract refused this bounded selection');
  }
  if (capsule.included_refs.length > selector.budgets.max_edges) {
    throw new ContractError(CODES.SELECTOR_UNBOUNDED,
      'the selected capsule exceeds selector.budgets.max_edges');
  }
  if (capsule.included_refs.length === 0) {
    const excludedReasons = capsule.excluded.map(({ reason, hop, count }) => ({ reason, hop, count }));
    throw new ContractError(CODES.SELECTION_EMPTY,
      'no expected-state element survived the bounded selection and ACL checks', {
        included_count: 0,
        excluded_count: capsule.excluded_count,
        excluded_reasons: excludedReasons,
        acl_denied_count: excludedReasons
          .filter(({ reason }) => reason === 'acl_denied_at_seed' || reason === 'acl_denied_at_hop')
          .reduce((total, { count }) => total + count, 0),
      });
  }

  const edgeById = new Map(projection.edges.map((edge) => [edge.edge_id, edge]));
  const selectedExpected = [];
  const selectedRuleRefs = [];
  for (const included of capsule.included_refs) {
    const edge = edgeById.get(included.via_edge_id);
    const expectedNode = edge && nodesByExactRef.get(exactRefIdentityKey(edge.to_ref));
    const ruleNode = edge && nodesByExactRef.get(exactRefIdentityKey(edge.from_ref));
    if (expectedNode?.node_type !== 'expected_state_element' || ruleNode?.node_type !== 'rule') {
      throw new ContractError(CODES.EDGE_INVALID, 'capsule selection did not resolve to a declared rule requirement');
    }
    if (!selector.source_family_filter.includes(edge.authority_family)
        || !selector.source_family_filter.includes(ruleNode.authority_family)) {
      throw new ContractError(CODES.SELECTOR_UNBOUNDED,
        'selected rule and edge authority must both be present in source_family_filter');
    }
    selectedExpected.push(clone(expectedNode.state_element));
    selectedRuleRefs.push(clone(ruleNode.ref));
  }
  selectedExpected.sort((a, b) => compareCodePoints(a.element_id, b.element_id));
  const selectedIds = new Set(selectedExpected.map((element) => `obs_${element.element_id}`));
  const observed = validateObservations(observedStateElements, selectedIds, expectedProjectBindingRef);

  const states = {
    subject_id: SUBJECT_ID,
    expected: selectedExpected,
    observed,
    canonical_accepted_input_set: {
      source_revision_refs: canonicalRefs([
        projection.manifest_ref, projection.projection_ref,
        ...selectedRuleRefs, ...selectedExpected.map((element) => element.requirement_ref),
      ]),
      artifact_revision_refs: canonicalRefs(observed.map((element) => element.artifact_revision_ref)),
    },
    project_binding_ref: expectedProjectBindingRef,
    accepted_context_generation: selector.accepted_context_generation,
    projection_revision: projection.projection_revision,
    projection_sha256: projection.projection_sha256,
    manifest_revision: projection.manifest_ref.revision_id,
    manifest_sha256: projection.manifest_sha256,
    context_capsule_fingerprint: strongContextCapsuleFingerprint({ projection, selector, capsule, aclTrace }),
    selection: {
      included_count: selectedExpected.length,
      excluded_count: capsule.excluded_count,
      every_returned_ref_bound_to_the_selector: capsule.every_returned_ref_bound_to_the_selector,
    },
  };
  return deepFreeze(states);
}

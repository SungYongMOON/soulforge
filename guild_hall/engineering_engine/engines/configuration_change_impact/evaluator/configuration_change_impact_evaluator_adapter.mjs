// Deterministic evaluator for one supplied, Core-bound change-impact fact bundle. It never
// reads project material, decides authority, releases a baseline, or writes externally.
import types from 'node:util/types';

import { canonicalise } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import {
  COMPILATION_TRACE_SCHEMA_VERSION,
  EFFECTIVE_RULE_SET_SCHEMA_VERSION,
  registerDomainEngineAdapter,
} from '../../../core/interfaces/domain_engine_adapter.mjs';
import { createProjectBindingAdapter } from '../../../core/interfaces/project_binding_adapter.mjs';
import {
  compileConfigurationChangeImpactRules,
  configurationChangeImpactCompilerAdapter,
  configurationChangeImpactProfileProvenanceDigest,
  validateConfigurationChangeImpactProfileProvenance,
} from '../compiler/configuration_change_impact_compiler_adapter.mjs';
import {
  PROPAGATION_GRAPH_ERROR_CODES,
  evaluatePropagationGraph,
} from './propagation_graph.mjs';
import {
  CONFIGURATION_CHANGE_IMPACT_ASSESSMENT_SCHEMA,
  CONFIGURATION_CHANGE_IMPACT_ERROR_CODES,
  CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS,
  CONFIGURATION_CHANGE_IMPACT_IMPACT_STATES,
  CONFIGURATION_CHANGE_IMPACT_INPUT_SCHEMA,
  CONFIGURATION_CHANGE_IMPACT_RECEIPT_SCHEMA,
  CONFIGURATION_CHANGE_IMPACT_RESULT_SCHEMA,
  CONFIGURATION_CHANGE_IMPACT_RULES,
  CONFIGURATION_CHANGE_IMPACT_RULESET_REF,
  CONFIGURATION_CHANGE_IMPACT_RULESET_SCHEMA,
  CONFIGURATION_CHANGE_IMPACT_SOURCE_PACKET_REF,
} from '../rules/configuration_change_impact_rules.mjs';

export const CCI_EVALUATOR_ADAPTER_SCHEMA_VERSION = 'soulforge.configuration_change_impact.evaluator.v0';
export const CCI_TYPED_FACTS_SCHEMA_VERSION = 'soulforge.configuration_change_impact.typed_facts.v0';
export const CCI_TYPED_FACTS_IDENTITY_DOMAIN = 'soulforge.configuration_change_impact.typed_facts.identity.v0';
export const CCI_ERROR_CODES = CONFIGURATION_CHANGE_IMPACT_ERROR_CODES;

const ROOT_FIELDS = Object.freeze(['schema_version', 'change', 'propagation_graph', 'impact_records', 'approval', 'closure']);
const CHANGE_FIELDS = Object.freeze([
  'change_id',
  'change_class',
  'change_request_ref',
  'pre_change_baseline_ref',
  'pre_change_revision_ref',
  'target_post_change_revision_ref',
  'seed_item_refs',
]);
const CHANGE_IDENTITY_FIELDS = Object.freeze(CHANGE_FIELDS.filter((field) => field !== 'seed_item_refs'));
const PROPAGATION_GRAPH_FIELDS = Object.freeze(['complete', 'nodes', 'edges']);
const PROPAGATION_NODE_FIELDS = Object.freeze(['item_ref', 'impact_kind']);
const PROPAGATION_EDGE_FIELDS = Object.freeze(['from_item_ref', 'to_item_ref', 'relationship_ref']);
const EVIDENCE_FIELDS = Object.freeze([
  'evidence_ref',
  'change_id',
  'change_identity_digest',
  'item_ref',
  'item_path_refs',
  'relationship_path_refs',
]);
const IMPACT_FIELDS = Object.freeze([
  'impact_kind',
  'impact_state',
  'impact_analysis_ref',
  'affected_item_refs',
  'propagation_evidence',
  'verification_evidence',
]);
const APPROVAL_FIELDS = Object.freeze(['state', 'approval_decision_ref']);
const CLOSURE_FIELDS = Object.freeze(['state', 'closure_evidence']);
const PROJECT_BINDING_FIELDS = Object.freeze([
  'schema_version',
  'project_id',
  'domain_engine_id',
  'binding_revision_hash',
  'source_manifest_ref',
]);
const SOURCE_SNAPSHOT_FIELDS = Object.freeze(['snapshot_id', 'source_refs', 'observations']);
const FACT_BUNDLE_FIELDS = Object.freeze([
  'fact_kind',
  'project_binding_ref',
  'project_profile',
  'change_identity',
  'request',
]);
const CORE_TYPED_FACTS_FIELDS = Object.freeze([
  'schema_version',
  'project_binding_ref',
  'facts',
  'facts_digest',
  'valid_at',
  'known_at',
]);
const CORE_RECEIPT_FIELDS = Object.freeze([
  'schema_version',
  'project_binding_ref',
  'source_snapshot_refs',
  'cutoffs',
  'observed_at',
  'observations_digest',
  'facts_count',
]);
const COMPILATION_SCOPE_FIELDS = Object.freeze(['compilation_scope']);
const PROFILE_TRACE_FIELDS = Object.freeze([
  'profile_id',
  'domain_engine_id',
  'revision_or_hash',
  'extends_or_base_pin',
  'operation_digest',
  'applied_operations_count',
  'source_refs',
]);
const TYPED_FACTS_FIELDS = Object.freeze([
  'schema_version',
  'project_binding_ref',
  'core_typed_project_facts',
  'core_observation_receipt',
  'project_profile_provenance',
  'change_identity',
  'compilation_scope',
  'source_snapshot_digest',
  'identity_digest',
]);
const APPROVAL_STATES = Object.freeze(['approved', 'pending', 'rejected', 'unknown']);
const CLOSURE_STATES = Object.freeze(['closed', 'open', 'unknown']);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SHA256_REFERENCE = /^sha256:[0-9a-f]{64}$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const ISO_UTC = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/u;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const EFFECTS = Object.freeze({
  file_reads: 0,
  file_writes: 0,
  network_calls: 0,
  model_calls: 0,
  approval_actions: 0,
  baseline_mutations: 0,
  task_creations: 0,
});

function fail(code, message) {
  throw new ContractError(code, message);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function snapshotOrdinaryData(value, { errorCode = CCI_ERROR_CODES.INPUT_REFUSED, rejectAliases = true } = {}) {
  const snapshot = (current, depth = 0, ancestors = new Set(), seen = new Set()) => {
    if (depth > 16) fail(errorCode, 'input depth exceeds the bounded limit');
    if (current === null || typeof current === 'boolean' || typeof current === 'number') return current;
    if (typeof current === 'string') {
      if (current.length > 512 || current.normalize('NFC') !== current || /[\u0000-\u001f\u007f]/u.test(current)) {
        fail(errorCode, 'string values must be bounded NFC text without controls');
      }
      return current;
    }
    if (!current || typeof current !== 'object' || types.isProxy(current)) {
      fail(errorCode, 'input accepts only ordinary JSON-like data');
    }
    if (ancestors.has(current) || (rejectAliases && seen.has(current))) {
      fail(errorCode, 'aliased or circular input objects are refused');
    }
    ancestors.add(current);
    seen.add(current);
    try {
      if (Array.isArray(current)) {
        if (Object.getPrototypeOf(current) !== Array.prototype || current.length > 64) {
          fail(errorCode, 'arrays must be ordinary and bounded');
        }
        const descriptors = Object.getOwnPropertyDescriptors(current);
        if (Reflect.ownKeys(current).some((key) => typeof key === 'symbol' || (key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key)))) {
          fail(errorCode, 'arrays may not carry symbols, sparse entries, or named fields');
        }
        const copy = [];
        for (let index = 0; index < current.length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
            fail(errorCode, 'arrays may not carry accessors or holes');
          }
          copy.push(snapshot(descriptor.value, depth + 1, ancestors, seen));
        }
        return copy;
      }
      if (Object.getPrototypeOf(current) !== Object.prototype) {
        fail(errorCode, 'objects must have Object.prototype');
      }
      const descriptors = Object.getOwnPropertyDescriptors(current);
      const copy = {};
      for (const key of Reflect.ownKeys(descriptors)) {
        const descriptor = descriptors[key];
        if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key) || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          fail(errorCode, 'objects may not carry symbols, dangerous keys, hidden fields, or accessors');
        }
        copy[key] = snapshot(descriptor.value, depth + 1, ancestors, seen);
      }
      return copy;
    } finally {
      ancestors.delete(current);
    }
  };
  return snapshot(value);
}

function assertExactKeys(value, expected, label, code = CCI_ERROR_CODES.INPUT_REFUSED) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || !actual.every((key, index) => key === required[index])) {
    fail(code, `${label} must contain exactly ${required.join(', ')}`);
  }
}

function assertToken(value, label, { nullable = false, code = CCI_ERROR_CODES.INPUT_REFUSED } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !TOKEN.test(value) || value === 'latest' || /^file:/iu.test(value)) {
    fail(code, `${label} must be an exact bounded reference token`);
  }
  return value;
}

function assertTokenArray(value, label, { required = false, maxItems = 64, code = CCI_ERROR_CODES.IMPACT_RECORD_REFUSED } = {}) {
  if (!Array.isArray(value) || value.length > maxItems || (required && value.length === 0)) {
    fail(code, `${label} must be a${required ? ' non-empty' : ''} array`);
  }
  let previous = null;
  for (const item of value) {
    assertToken(item, label, { code });
    if (previous !== null && previous >= item) fail(code, `${label} must be sorted and unique`);
    previous = item;
  }
  return [...value];
}

function assertPathTokenArray(value, label, { required = false, code = CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED } = {}) {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    fail(code, `${label} must be a${required ? ' non-empty' : ''} ordered array`);
  }
  const seen = new Set();
  for (const item of value) {
    assertToken(item, label, { code });
    if (seen.has(item)) fail(code, `${label} may not repeat a reference`);
    seen.add(item);
  }
  return [...value];
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function changeIdentity(change) {
  return Object.freeze({
    change_id: change.change_id,
    change_class: change.change_class,
    change_request_ref: change.change_request_ref,
    pre_change_baseline_ref: change.pre_change_baseline_ref,
    pre_change_revision_ref: change.pre_change_revision_ref,
    target_post_change_revision_ref: change.target_post_change_revision_ref,
  });
}

function validateChangeIdentity(identity, code = CCI_ERROR_CODES.CHANGE_IDENTITY_REFUSED) {
  assertExactKeys(identity, CHANGE_IDENTITY_FIELDS, 'change identity', code);
  const normalized = {};
  for (const field of CHANGE_IDENTITY_FIELDS) normalized[field] = assertToken(identity[field], `change identity.${field}`, { code });
  if (normalized.pre_change_revision_ref === normalized.target_post_change_revision_ref) {
    fail(code, 'pre-change and target post-change revision pins must differ');
  }
  return Object.freeze(normalized);
}

function changeIdentityDigest(identity) {
  return `sha256:${digest('soulforge.configuration_change_impact.change_identity.v0', identity)}`;
}

export function configurationChangeImpactChangeIdentityDigest(identity) {
  return changeIdentityDigest(validateChangeIdentity(identity));
}

function validateChange(change) {
  assertExactKeys(change, CHANGE_FIELDS, 'change');
  const identity = validateChangeIdentity({
    change_id: change.change_id,
    change_class: change.change_class,
    change_request_ref: change.change_request_ref,
    pre_change_baseline_ref: change.pre_change_baseline_ref,
    pre_change_revision_ref: change.pre_change_revision_ref,
    target_post_change_revision_ref: change.target_post_change_revision_ref,
  });
  return {
    ...identity,
    seed_item_refs: assertTokenArray(change.seed_item_refs, 'change.seed_item_refs', {
      required: true,
      maxItems: 32,
      code: CCI_ERROR_CODES.INPUT_REFUSED,
    }),
  };
}

function validatePropagationGraph(graph) {
  assertExactKeys(graph, PROPAGATION_GRAPH_FIELDS, 'propagation_graph', CCI_ERROR_CODES.GRAPH_REFUSED);
  if (typeof graph.complete !== 'boolean' || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    fail(CCI_ERROR_CODES.GRAPH_REFUSED, 'propagation_graph must state completeness and contain nodes and edges');
  }
  const nodes = graph.nodes.map((node) => {
    assertExactKeys(node, PROPAGATION_NODE_FIELDS, 'propagation_graph.node', CCI_ERROR_CODES.NODE_REFUSED);
    if (!CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS.includes(node.impact_kind)) {
      fail(CCI_ERROR_CODES.NODE_REFUSED, 'propagation graph node uses an unknown impact kind');
    }
    return {
      item_ref: assertToken(node.item_ref, 'propagation_graph.node.item_ref', { code: CCI_ERROR_CODES.NODE_REFUSED }),
      impact_kind: node.impact_kind,
    };
  });
  const edges = graph.edges.map((edge) => {
    assertExactKeys(edge, PROPAGATION_EDGE_FIELDS, 'propagation_graph.edge', CCI_ERROR_CODES.EDGE_REFUSED);
    return {
      from_item_ref: assertToken(edge.from_item_ref, 'propagation_graph.edge.from_item_ref', { code: CCI_ERROR_CODES.EDGE_REFUSED }),
      to_item_ref: assertToken(edge.to_item_ref, 'propagation_graph.edge.to_item_ref', { code: CCI_ERROR_CODES.EDGE_REFUSED }),
      relationship_ref: assertToken(edge.relationship_ref, 'propagation_graph.edge.relationship_ref', { code: CCI_ERROR_CODES.EDGE_REFUSED }),
    };
  });
  return { complete: graph.complete, nodes, edges };
}

function validateEvidence(evidence, label) {
  assertExactKeys(evidence, EVIDENCE_FIELDS, label, CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED);
  const item_path_refs = assertPathTokenArray(evidence.item_path_refs, `${label}.item_path_refs`, { required: true });
  const relationship_path_refs = assertPathTokenArray(evidence.relationship_path_refs, `${label}.relationship_path_refs`);
  if (relationship_path_refs.length !== item_path_refs.length - 1) {
    fail(CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED, `${label} relationship path length must equal item path length minus one`);
  }
  return {
    evidence_ref: assertToken(evidence.evidence_ref, `${label}.evidence_ref`, { code: CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED }),
    change_id: assertToken(evidence.change_id, `${label}.change_id`, { code: CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED }),
    change_identity_digest: SHA256_REFERENCE.test(evidence.change_identity_digest)
      ? evidence.change_identity_digest
      : fail(CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED, `${label}.change_identity_digest must be a sha256 pin`),
    item_ref: assertToken(evidence.item_ref, `${label}.item_ref`, { code: CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED }),
    item_path_refs,
    relationship_path_refs,
  };
}

function validateEvidenceArray(value, label) {
  if (!Array.isArray(value) || value.length > 64) {
    fail(CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED, `${label} must be a bounded array`);
  }
  const evidence = value.map((entry, index) => validateEvidence(entry, `${label}.${index}`));
  let previous = null;
  const evidenceRefs = new Set();
  for (const entry of evidence) {
    const key = `${entry.item_ref}\u0000${entry.evidence_ref}`;
    if (previous !== null && previous >= key) {
      fail(CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED, `${label} must be sorted and unique by item and evidence reference`);
    }
    if (evidenceRefs.has(entry.evidence_ref)) {
      fail(CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED, `${label} may not reuse an evidence reference across items`);
    }
    previous = key;
    evidenceRefs.add(entry.evidence_ref);
  }
  return evidence;
}

function validateImpactRecord(record, expectedKind) {
  assertExactKeys(record, IMPACT_FIELDS, `impact_records.${expectedKind}`, CCI_ERROR_CODES.IMPACT_RECORD_REFUSED);
  if (record.impact_kind !== expectedKind) {
    fail(CCI_ERROR_CODES.IMPACT_COVERAGE_REFUSED, `impact records must use the fixed canonical kind order; expected ${expectedKind}`);
  }
  if (!CONFIGURATION_CHANGE_IMPACT_IMPACT_STATES.includes(record.impact_state)) {
    fail(CCI_ERROR_CODES.IMPACT_RECORD_REFUSED, 'impact state is not in the closed vocabulary');
  }
  const normalized = {
    impact_kind: record.impact_kind,
    impact_state: record.impact_state,
    impact_analysis_ref: assertToken(record.impact_analysis_ref, `${expectedKind}.impact_analysis_ref`, {
      nullable: true,
      code: CCI_ERROR_CODES.IMPACT_RECORD_REFUSED,
    }),
    affected_item_refs: assertTokenArray(record.affected_item_refs, `${expectedKind}.affected_item_refs`, {
      code: CCI_ERROR_CODES.IMPACT_RECORD_REFUSED,
    }),
    propagation_evidence: validateEvidenceArray(record.propagation_evidence, `${expectedKind}.propagation_evidence`),
    verification_evidence: validateEvidenceArray(record.verification_evidence, `${expectedKind}.verification_evidence`),
  };
  const noEvidence = normalized.affected_item_refs.length === 0
    && normalized.propagation_evidence.length === 0
    && normalized.verification_evidence.length === 0;
  if (normalized.impact_state === 'unknown') {
    if (normalized.impact_analysis_ref !== null || !noEvidence) {
      fail(CCI_ERROR_CODES.IMPACT_RECORD_REFUSED, 'unknown impact must not carry resolved analysis or evidence');
    }
  } else if (normalized.impact_state === 'not_affected') {
    if (normalized.impact_analysis_ref === null || !noEvidence) {
      fail(CCI_ERROR_CODES.IMPACT_RECORD_REFUSED, 'not_affected impact requires an analysis reference and no affected-item evidence');
    }
  } else if (normalized.impact_state === 'affected_pending') {
    if (normalized.impact_analysis_ref === null || normalized.affected_item_refs.length === 0
        || normalized.propagation_evidence.length !== normalized.affected_item_refs.length
        || normalized.verification_evidence.length !== 0) {
      fail(CCI_ERROR_CODES.IMPACT_RECORD_REFUSED, 'affected_pending requires analysis, items, and path-bound propagation evidence but no verification evidence');
    }
  } else if (normalized.impact_state === 'affected_verified') {
    if (normalized.impact_analysis_ref === null || normalized.affected_item_refs.length === 0
        || normalized.propagation_evidence.length !== normalized.affected_item_refs.length
        || normalized.verification_evidence.length !== normalized.affected_item_refs.length) {
      fail(CCI_ERROR_CODES.IMPACT_RECORD_REFUSED, 'affected_verified requires analysis, items, and one propagation plus verification evidence record per affected item');
    }
  } else if (normalized.impact_state === 'conflict') {
    if (normalized.impact_analysis_ref === null || normalized.affected_item_refs.length === 0
        || (normalized.propagation_evidence.length === 0 && normalized.verification_evidence.length === 0)) {
      fail(CCI_ERROR_CODES.IMPACT_RECORD_REFUSED, 'conflict requires analysis, affected items, and retained evidence');
    }
  }
  return normalized;
}

function validateApproval(approval) {
  assertExactKeys(approval, APPROVAL_FIELDS, 'approval', CCI_ERROR_CODES.APPROVAL_REFUSED);
  if (!APPROVAL_STATES.includes(approval.state)) fail(CCI_ERROR_CODES.APPROVAL_REFUSED, 'approval state is invalid');
  const decision = assertToken(approval.approval_decision_ref, 'approval.approval_decision_ref', {
    nullable: true,
    code: CCI_ERROR_CODES.APPROVAL_REFUSED,
  });
  if ((approval.state === 'approved' || approval.state === 'rejected') !== (decision !== null)) {
    fail(CCI_ERROR_CODES.APPROVAL_REFUSED, 'resolved approval states require one decision reference; unresolved states require none');
  }
  return { state: approval.state, approval_decision_ref: decision };
}

function validateClosure(closure) {
  assertExactKeys(closure, CLOSURE_FIELDS, 'closure', CCI_ERROR_CODES.CLOSURE_REFUSED);
  if (!CLOSURE_STATES.includes(closure.state)) fail(CCI_ERROR_CODES.CLOSURE_REFUSED, 'closure state is invalid');
  const closure_evidence = validateEvidenceArray(closure.closure_evidence, 'closure.closure_evidence');
  if ((closure.state === 'closed') !== (closure_evidence.length > 0)) {
    fail(CCI_ERROR_CODES.CLOSURE_REFUSED, 'closed requires closure evidence and open/unknown may not claim it');
  }
  return { state: closure.state, closure_evidence };
}

function validateRequest(request) {
  const input = snapshotOrdinaryData(request);
  assertExactKeys(input, ROOT_FIELDS, 'request');
  if (input.schema_version !== CONFIGURATION_CHANGE_IMPACT_INPUT_SCHEMA) {
    fail(CCI_ERROR_CODES.INPUT_REFUSED, `schema_version must be ${CONFIGURATION_CHANGE_IMPACT_INPUT_SCHEMA}`);
  }
  if (!Array.isArray(input.impact_records) || input.impact_records.length !== CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS.length) {
    fail(CCI_ERROR_CODES.IMPACT_COVERAGE_REFUSED, 'input must provide exactly one impact record for every fixed impact kind');
  }
  return {
    schema_version: input.schema_version,
    change: validateChange(input.change),
    propagation_graph: validatePropagationGraph(input.propagation_graph),
    impact_records: input.impact_records.map((row, index) => validateImpactRecord(row, CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS[index])),
    approval: validateApproval(input.approval),
    closure: validateClosure(input.closure),
  };
}

function assertEvidenceMatchesPath(evidence, expectedPath, change, label) {
  if (evidence.change_id !== change.change_id
      || evidence.change_identity_digest !== changeIdentityDigest(changeIdentity(change))
      || evidence.item_ref !== expectedPath.item_ref
      || !sameArray(evidence.item_path_refs, expectedPath.item_path_refs)
      || !sameArray(evidence.relationship_path_refs, expectedPath.relationship_path_refs)) {
    fail(CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED, `${label} must bind this exact change, item path, and relationship path`);
  }
}

function assertEvidenceRowsMatch(evidenceRows, pathByItem, change, label) {
  for (const evidence of evidenceRows) {
    const expectedPath = pathByItem.get(evidence.item_ref);
    if (!expectedPath) fail(CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED, `${label} names an unreachable or undeclared item`);
    assertEvidenceMatchesPath(evidence, expectedPath, change, label);
  }
}

function assertCompleteEvidence(evidenceRows, affectedItemRefs, pathByItem, change, label) {
  if (evidenceRows.length !== affectedItemRefs.length) {
    fail(CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED, `${label} must contain one record for every affected item`);
  }
  for (let index = 0; index < affectedItemRefs.length; index += 1) {
    const expectedPath = pathByItem.get(affectedItemRefs[index]);
    if (!expectedPath || evidenceRows[index].item_ref !== affectedItemRefs[index]) {
      fail(CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED, `${label} must be canonically ordered by affected item`);
    }
    assertEvidenceMatchesPath(evidenceRows[index], expectedPath, change, label);
  }
}

function evaluateImpact(record, propagation, change) {
  const reasonByState = {
    affected_verified: 'propagation_verified',
    affected_pending: 'propagation_pending',
    conflict: 'impact_conflict',
    not_affected: 'impact_not_affected',
    unknown: 'impact_unknown',
  };
  const actionByState = {
    affected_verified: 'propagation_verified',
    affected_pending: 'complete_propagation_and_verification',
    conflict: 'resolve_impact_conflict',
    not_affected: 'record_no_impact',
    unknown: 'obtain_impact_analysis',
  };
  const evidenceClaimByState = {
    affected_verified: 'source_sufficient',
    affected_pending: 'source_referenced',
    conflict: 'contradicted',
    not_affected: 'not_applicable',
    unknown: 'unknown',
  };
  const reachable_item_refs = propagation.reachable_item_refs_by_kind[record.impact_kind];
  const pathByItem = new Map(propagation.paths_by_item.map((path) => [path.item_ref, path]));
  const item_paths = reachable_item_refs.map((item_ref) => {
    const path = pathByItem.get(item_ref);
    return {
      item_ref,
      item_path_refs: [...path.item_path_refs],
      relationship_path_refs: [...path.relationship_path_refs],
    };
  });
  let state = record.impact_state;
  let reason_code = reasonByState[state];
  let propagation_action = actionByState[state];
  let reachability_state = reachable_item_refs.length > 0 ? 'reachable' : (propagation.complete ? 'unreachable_complete' : 'unreachable_incomplete');

  if (reachable_item_refs.length > 0) {
    if (record.impact_state === 'not_affected') {
      fail(CCI_ERROR_CODES.PROPAGATION_CONFLICT, 'a graph-reachable impact category cannot be declared not_affected');
    }
    if (record.impact_state !== 'unknown' && !sameArray(record.affected_item_refs, reachable_item_refs)) {
      fail(CCI_ERROR_CODES.PROPAGATION_REFUSED, 'affected item evidence must exactly cover the graph-reachable items for its impact category');
    }
    if (record.impact_state === 'affected_pending' || record.impact_state === 'affected_verified') {
      assertCompleteEvidence(record.propagation_evidence, record.affected_item_refs, pathByItem, change, `${record.impact_kind}.propagation_evidence`);
    }
    if (record.impact_state === 'affected_verified') {
      assertCompleteEvidence(record.verification_evidence, record.affected_item_refs, pathByItem, change, `${record.impact_kind}.verification_evidence`);
    }
    if (record.impact_state === 'conflict') {
      assertEvidenceRowsMatch(record.propagation_evidence, pathByItem, change, `${record.impact_kind}.propagation_evidence`);
      assertEvidenceRowsMatch(record.verification_evidence, pathByItem, change, `${record.impact_kind}.verification_evidence`);
    }
    if (record.impact_state === 'unknown') {
      reason_code = 'reachable_impact_not_assessed';
      propagation_action = 'complete_propagation_and_verification';
    }
  } else {
    if (record.impact_state !== 'not_affected' && record.impact_state !== 'unknown') {
      fail(CCI_ERROR_CODES.PROPAGATION_REFUSED, 'a complete or incomplete graph cannot claim an affected item absent from the reachable impact projection');
    }
    if (!propagation.complete && record.impact_state === 'not_affected') {
      state = 'unknown';
      reason_code = 'propagation_graph_incomplete';
      propagation_action = 'complete_propagation_graph';
      reachability_state = 'unreachable_incomplete';
    }
  }

  return {
    ...record,
    declared_state: record.impact_state,
    state,
    reason_code,
    propagation_action,
    reachability_state,
    reachable_item_refs: [...reachable_item_refs],
    item_paths,
    canon_claim_ceiling: 'source_supported',
    evidence_claim_ceiling: evidenceClaimByState[state],
  };
}

function countsFor(rows) {
  const counts = {
    affected_verified: 0,
    affected_pending: 0,
    conflict: 0,
    not_affected: 0,
    unknown: 0,
    total: rows.length,
  };
  for (const row of rows) counts[row.state] += 1;
  return counts;
}

function assertClosureConsistency(request, impactResults, counts, propagation) {
  if (request.closure.state !== 'closed') return;
  if (!propagation.complete || request.approval.state !== 'approved'
      || counts.affected_pending !== 0 || counts.conflict !== 0 || counts.unknown !== 0) {
    fail(CCI_ERROR_CODES.CLOSURE_REFUSED, 'a closed change requires a complete graph, approved decision, and every impact resolved');
  }
  const closureResult = impactResults.find((row) => row.impact_kind === 'closure_evidence');
  const pathByItem = new Map(propagation.paths_by_item.map((path) => [path.item_ref, path]));
  assertCompleteEvidence(
    request.closure.closure_evidence,
    closureResult.affected_item_refs,
    pathByItem,
    request.change,
    'closure.closure_evidence',
  );
}

function overallState(request, counts, propagation) {
  if (request.approval.state === 'rejected') return 'rejected';
  if (!propagation.complete || counts.affected_pending || counts.conflict || counts.unknown || request.approval.state !== 'approved') return 'hold';
  if (request.closure.state !== 'closed') return 'closure_pending';
  return 'evidence_ready_for_owner_review';
}

function evidenceCeiling(counts, propagation) {
  if (!propagation.complete) return 'unknown';
  if (counts.unknown) return 'unknown';
  if (counts.conflict) return 'contradicted';
  if (counts.affected_pending) return 'source_referenced';
  if (counts.affected_verified) return 'source_sufficient';
  return 'not_applicable';
}

function arrayOrderRules(value, path = '', rules = {}) {
  if (Array.isArray(value)) {
    rules[path] = 'insertion_ordered';
    for (const child of value) arrayOrderRules(child, `${path}[]`, rules);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) arrayOrderRules(child, path ? `${path}.${key}` : key, rules);
  }
  return rules;
}

function encodeTypedValue(value) {
  if (value === null) return { kind: 'null' };
  if (typeof value === 'string') return { kind: 'string', value };
  if (typeof value === 'boolean') return { kind: 'boolean', value };
  if (typeof value === 'number') return { kind: 'number', value };
  if (Array.isArray(value)) return { kind: 'array', value: value.map(encodeTypedValue) };
  if (value && typeof value === 'object') {
    return {
      kind: 'object',
      value: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encodeTypedValue(child)])),
    };
  }
  fail(CCI_ERROR_CODES.INPUT_REFUSED, 'digest input contains an unsupported value type');
}

function digest(domain, value) {
  const encoded = encodeTypedValue(value);
  return sha256Hex(`${domain}\n${canonicalise(encoded, arrayOrderRules(encoded))}`);
}

function withoutNulls(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== null).map(withoutNulls);
  if (value !== null && typeof value === 'object') {
    const copy = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== null) copy[key] = withoutNulls(child);
    }
    return copy;
  }
  return value;
}

function coreFactsDigest(facts) {
  const cleanFacts = withoutNulls(facts);
  return sha256Hex(`soulforge.project_observations.v0\n${canonicalise(cleanFacts, arrayOrderRules(cleanFacts))}`);
}

function sameExactReference(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = Object.keys(expected).sort();
  return sameArray(actualKeys, expectedKeys)
    && expectedKeys.every((key) => value[key] === expected[key]);
}

function sameDigestValue(left, right, domain) {
  return digest(domain, left) === digest(domain, right);
}

function coreEffectiveRuleSetDigest(ruleSet) {
  const cleanRuleSet = withoutNulls(ruleSet);
  return sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalise(cleanRuleSet, arrayOrderRules(cleanRuleSet))}`);
}

function validateCompilationScope(scope, code = CCI_ERROR_CODES.RULESET_REFUSED) {
  assertExactKeys(scope, COMPILATION_SCOPE_FIELDS, 'compilation scope', code);
  return Object.freeze({
    compilation_scope: assertToken(scope.compilation_scope, 'compilation scope compilation_scope', { code }),
  });
}

function validateProfileTrace(traceValue, profile, label) {
  if (!profile) {
    if (traceValue !== null) fail(CCI_ERROR_CODES.RULESET_REFUSED, `${label} must be null when no matching Profile exists`);
    return null;
  }
  assertExactKeys(traceValue, PROFILE_TRACE_FIELDS, label, CCI_ERROR_CODES.RULESET_REFUSED);
  const expected = {
    profile_id: profile.profile_id,
    domain_engine_id: profile.domain_engine_id,
    revision_or_hash: profile.revision_or_hash,
    extends_or_base_pin: profile.extends_or_base_pin,
    operation_digest: profile.operation_digest,
    applied_operations_count: profile.applied_operations_count,
    source_refs: profile.source_refs,
  };
  if (!sameDigestValue(traceValue, expected, 'soulforge.configuration_change_impact.profile_trace.v0')) {
    fail(CCI_ERROR_CODES.RULESET_REFUSED, `${label} does not match its Profile provenance`);
  }
  return traceValue;
}

function sourceSnapshotDigest(sourceSnapshot) {
  return `sha256:${digest('soulforge.configuration_change_impact.source_snapshot.v0', {
    snapshot_id: sourceSnapshot.snapshot_id,
    source_refs: sourceSnapshot.source_refs,
    observations: sourceSnapshot.observations,
  })}`;
}

function validateEffectiveRuleSet(effectiveRuleSet) {
  const outer = snapshotOrdinaryData(effectiveRuleSet, {
    errorCode: CCI_ERROR_CODES.RULESET_REFUSED,
    rejectAliases: false,
  });
  assertExactKeys(outer, [
    'schema_version',
    'domain_engine_id',
    'effective_rule_set',
    'compilation_trace',
    'rule_count',
    'assembly_digest',
  ], 'effective rule set envelope', CCI_ERROR_CODES.RULESET_REFUSED);
  if (outer.schema_version !== EFFECTIVE_RULE_SET_SCHEMA_VERSION
      || outer.domain_engine_id !== 'configuration_change_impact'
      || !SHA256_HEX.test(outer.assembly_digest)) {
    fail(CCI_ERROR_CODES.RULESET_REFUSED, 'effective rule set envelope schema, domain, or digest is invalid');
  }
  const ruleSet = outer.effective_rule_set;
  assertExactKeys(ruleSet, [
    'schema_version',
    'ruleset_ref',
    'source_packet_ref',
    'rules',
    'profile_provenance',
    'profile_provenance_digest',
  ], 'effective rule set', CCI_ERROR_CODES.RULESET_REFUSED);
  if (ruleSet.schema_version !== CONFIGURATION_CHANGE_IMPACT_RULESET_SCHEMA
      || !sameExactReference(ruleSet.ruleset_ref, CONFIGURATION_CHANGE_IMPACT_RULESET_REF)
      || !sameExactReference(ruleSet.source_packet_ref, CONFIGURATION_CHANGE_IMPACT_SOURCE_PACKET_REF)
      || digest('soulforge.configuration_change_impact.rules.v0', ruleSet.rules)
        !== digest('soulforge.configuration_change_impact.rules.v0', CONFIGURATION_CHANGE_IMPACT_RULES)) {
    fail(CCI_ERROR_CODES.RULESET_REFUSED, 'effective rule set does not exactly match the approved base rule pack');
  }
  const profileProvenance = validateConfigurationChangeImpactProfileProvenance(ruleSet.profile_provenance);
  const profileDigest = configurationChangeImpactProfileProvenanceDigest(profileProvenance);
  if (ruleSet.profile_provenance_digest !== profileDigest) {
    fail(CCI_ERROR_CODES.RULESET_REFUSED, 'effective rule set profile provenance digest is invalid');
  }
  const expectedRuleCount = ruleSet.rules.length;
  const effectiveDigest = coreEffectiveRuleSetDigest(ruleSet);
  if (outer.rule_count !== expectedRuleCount || outer.assembly_digest !== effectiveDigest) {
    fail(CCI_ERROR_CODES.RULESET_REFUSED, 'effective rule set envelope rule count or assembly digest is invalid');
  }
  const trace = outer.compilation_trace;
  assertExactKeys(trace, [
    'schema_version',
    'domain_engine_id',
    'domain_adapter_revision',
    'organization_trace',
    'project_trace',
    'profiles',
    'compilation_scope',
    'effective_ruleset_digest',
    'rule_count',
  ], 'compilation trace', CCI_ERROR_CODES.RULESET_REFUSED);
  if (trace.schema_version !== COMPILATION_TRACE_SCHEMA_VERSION
      || trace.domain_engine_id !== 'configuration_change_impact'
      || trace.domain_adapter_revision !== CCI_EVALUATOR_ADAPTER_SCHEMA_VERSION
      || trace.effective_ruleset_digest !== effectiveDigest
      || trace.rule_count !== expectedRuleCount) {
    fail(CCI_ERROR_CODES.RULESET_REFUSED, 'compilation trace schema, domain, revision, digest, or rule count is invalid');
  }
  const traceProfiles = validateConfigurationChangeImpactProfileProvenance(trace.profiles);
  if (configurationChangeImpactProfileProvenanceDigest(traceProfiles) !== profileDigest
      || !sameDigestValue(traceProfiles, profileProvenance, 'soulforge.configuration_change_impact.profile_provenance.compare.v0')) {
    fail(CCI_ERROR_CODES.RULESET_REFUSED, 'compilation trace profile provenance does not match the effective ruleset');
  }
  const organizationProfile = profileProvenance.find((entry) => entry.profile_kind === 'organization') ?? null;
  const projectProfile = profileProvenance.find((entry) => entry.profile_kind === 'project') ?? null;
  validateProfileTrace(trace.organization_trace, organizationProfile, 'organization trace');
  validateProfileTrace(trace.project_trace, projectProfile, 'project trace');
  const compilationScope = validateCompilationScope(trace.compilation_scope);
  return { outer, ruleSet, profileProvenance, compilationTrace: trace, compilationScope };
}

function validateProjectBindingRef(binding, code = CCI_ERROR_CODES.TYPED_FACTS_REFUSED) {
  assertExactKeys(binding, PROJECT_BINDING_FIELDS, 'project binding reference', code);
  if (binding.schema_version !== 'soulforge.project_binding.v0'
      || binding.domain_engine_id !== 'configuration_change_impact'
      || !SHA256_REFERENCE.test(binding.binding_revision_hash)) {
    fail(code, 'project binding schema, domain, or revision pin is invalid');
  }
  return Object.freeze({
    schema_version: binding.schema_version,
    project_id: assertToken(binding.project_id, 'project binding project_id', { code }),
    domain_engine_id: binding.domain_engine_id,
    binding_revision_hash: binding.binding_revision_hash,
    source_manifest_ref: assertToken(binding.source_manifest_ref, 'project binding source_manifest_ref', { code }),
  });
}

function validateCutoffs(cutoffs, code = CCI_ERROR_CODES.TYPED_FACTS_REFUSED) {
  assertExactKeys(cutoffs, ['valid_at', 'known_at'], 'cutoffs', code);
  if (typeof cutoffs.valid_at !== 'string' || !ISO_UTC.test(cutoffs.valid_at)
      || typeof cutoffs.known_at !== 'string' || !ISO_UTC.test(cutoffs.known_at)) {
    fail(code, 'cutoffs must use canonical UTC timestamps');
  }
  return Object.freeze({ valid_at: cutoffs.valid_at, known_at: cutoffs.known_at });
}

function profileProvenanceFromProjectProfile(projectProfile, code = CCI_ERROR_CODES.TYPED_FACTS_REFUSED) {
  try {
    const result = compileConfigurationChangeImpactRules([projectProfile]);
    const provenance = result.profile_provenance;
    if (provenance.length !== 1 || provenance[0].profile_kind !== 'project') {
      fail(code, 'typed facts require exactly one project Profile provenance entry');
    }
    return provenance[0];
  } catch (error) {
    if (error instanceof ContractError) {
      throw new ContractError(code, 'typed facts project Profile is invalid');
    }
    throw error;
  }
}

function restoreCoreNullStrippedRequest(request) {
  const restored = {
    ...request,
    approval: { ...request.approval },
    impact_records: request.impact_records.map((record) => ({ ...record })),
  };
  for (const record of restored.impact_records) {
    if (!Object.hasOwn(record, 'impact_analysis_ref')) record.impact_analysis_ref = null;
  }
  if (!Object.hasOwn(restored.approval, 'approval_decision_ref')) restored.approval.approval_decision_ref = null;
  return restored;
}

function validateFactBundle(fact, code = CCI_ERROR_CODES.TYPED_FACTS_REFUSED, { allowCoreNullStripping = false } = {}) {
  assertExactKeys(fact, FACT_BUNDLE_FIELDS, 'typed facts change bundle', code);
  if (fact.fact_kind !== 'configuration_change_impact_change') {
    fail(code, 'typed facts must contain the configuration-change fact kind');
  }
  const projectBinding = validateProjectBindingRef(fact.project_binding_ref, code);
  const profileProvenance = profileProvenanceFromProjectProfile(fact.project_profile, code);
  const identity = validateChangeIdentity(fact.change_identity, code);
  const request = validateRequest(allowCoreNullStripping ? restoreCoreNullStrippedRequest(fact.request) : fact.request);
  if (!sameDigestValue(projectBinding, fact.project_binding_ref, 'soulforge.configuration_change_impact.project_binding.v0')) {
    fail(CCI_ERROR_CODES.PROJECT_BINDING_MISMATCH, 'typed facts change bundle project binding is inconsistent');
  }
  if (!sameDigestValue(identity, changeIdentity(request.change), 'soulforge.configuration_change_impact.change_identity.v0')) {
    fail(CCI_ERROR_CODES.CHANGE_IDENTITY_REFUSED, 'typed facts change bundle change identity is inconsistent');
  }
  return { projectBinding, profileProvenance, identity, request };
}

function validateSourceSnapshot(sourceSnapshot, code = CCI_ERROR_CODES.TYPED_FACTS_REFUSED) {
  assertExactKeys(sourceSnapshot, SOURCE_SNAPSHOT_FIELDS, 'source snapshot references', code);
  const snapshot_id = assertToken(sourceSnapshot.snapshot_id, 'source snapshot snapshot_id', { code });
  const source_refs = assertTokenArray(sourceSnapshot.source_refs, 'source snapshot source_refs', { required: true, code });
  if (!Array.isArray(sourceSnapshot.observations) || sourceSnapshot.observations.length !== 1) {
    fail(code, 'source snapshot must carry exactly one configuration-change fact bundle');
  }
  const fact = validateFactBundle(sourceSnapshot.observations[0], code);
  return {
    snapshot_id,
    source_refs,
    observations: [sourceSnapshot.observations[0]],
    fact,
  };
}

function typedFactsIdentityMaterial(projectBinding, profileProvenance, change, factsDigest, sourceDigest, compilationScope) {
  return {
    schema_version: CCI_TYPED_FACTS_SCHEMA_VERSION,
    project_binding_ref: projectBinding,
    project_profile_provenance: profileProvenance,
    change_identity: change,
    core_facts_digest: factsDigest,
    source_snapshot_digest: sourceDigest,
    compilation_scope: compilationScope,
  };
}

function validateCoreTypedFacts(coreTypedFacts, code = CCI_ERROR_CODES.TYPED_FACTS_REFUSED) {
  assertExactKeys(coreTypedFacts, CORE_TYPED_FACTS_FIELDS, 'Core typed project facts', code);
  if (coreTypedFacts.schema_version !== 'soulforge.typed_project_facts.v0'
      || !Array.isArray(coreTypedFacts.facts)
      || coreTypedFacts.facts.length !== 1
      || !SHA256_HEX.test(coreTypedFacts.facts_digest)) {
    fail(code, 'Core typed project facts shape is invalid');
  }
  const projectBinding = validateProjectBindingRef(coreTypedFacts.project_binding_ref, code);
  validateCutoffs({ valid_at: coreTypedFacts.valid_at, known_at: coreTypedFacts.known_at }, code);
  if (coreTypedFacts.facts_digest !== coreFactsDigest(coreTypedFacts.facts)) {
    fail(code, 'Core typed project facts digest does not match the facts');
  }
  const fact = validateFactBundle(coreTypedFacts.facts[0], code, { allowCoreNullStripping: true });
  return { projectBinding, fact };
}

function validateCoreReceipt(receipt, expectedBinding, expectedFactsDigest, expectedSourceSnapshotDigest, code = CCI_ERROR_CODES.TYPED_FACTS_REFUSED) {
  assertExactKeys(receipt, CORE_RECEIPT_FIELDS, 'Core observation receipt', code);
  if (receipt.schema_version !== 'soulforge.project_observation_receipt.v0'
      || receipt.observations_digest !== expectedFactsDigest
      || receipt.facts_count !== 1) {
    fail(code, 'Core observation receipt digest or fact count is invalid');
  }
  const binding = validateProjectBindingRef(receipt.project_binding_ref, code);
  if (!sameDigestValue(binding, expectedBinding, 'soulforge.configuration_change_impact.project_binding.compare.v0')) {
    fail(CCI_ERROR_CODES.PROJECT_BINDING_MISMATCH, 'Core observation receipt binding does not match typed facts');
  }
  validateCutoffs(receipt.cutoffs, code);
  if (typeof receipt.observed_at !== 'string' || !ISO_UTC.test(receipt.observed_at)) {
    fail(code, 'Core observation receipt observed_at is invalid');
  }
  const receiptSource = validateSourceSnapshot(receipt.source_snapshot_refs, code);
  if (receipt.observations_digest !== coreFactsDigest(receiptSource.observations)
      || sourceSnapshotDigest(receiptSource) !== expectedSourceSnapshotDigest) {
    fail(code, 'Core observation receipt source snapshot does not match its facts or pinned source provenance');
  }
  return receiptSource;
}

export function adaptConfigurationChangeImpactProjectEvidence(input) {
  const snapshot = snapshotOrdinaryData(input, { errorCode: CCI_ERROR_CODES.TYPED_FACTS_REFUSED });
  assertExactKeys(snapshot, ['project_binding_ref', 'project_profile', 'source_snapshot_refs', 'cutoffs', 'compilation_scope'], 'typed facts adapter input', CCI_ERROR_CODES.TYPED_FACTS_REFUSED);
  const projectBinding = validateProjectBindingRef(snapshot.project_binding_ref);
  const projectProfile = profileProvenanceFromProjectProfile(snapshot.project_profile);
  const sourceSnapshot = validateSourceSnapshot(snapshot.source_snapshot_refs);
  const cutoffs = validateCutoffs(snapshot.cutoffs);
  const compilationScope = validateCompilationScope(snapshot.compilation_scope, CCI_ERROR_CODES.TYPED_FACTS_REFUSED);
  const sourceDigest = sourceSnapshotDigest(sourceSnapshot);
  if (!sameDigestValue(sourceSnapshot.fact.projectBinding, projectBinding, 'soulforge.configuration_change_impact.project_binding.compare.v0')) {
    fail(CCI_ERROR_CODES.PROJECT_BINDING_MISMATCH, 'fact bundle project binding does not match the adapter input');
  }
  if (!sameDigestValue(sourceSnapshot.fact.profileProvenance, projectProfile, 'soulforge.configuration_change_impact.profile_provenance.compare.v0')) {
    fail(CCI_ERROR_CODES.PROFILE_BINDING_MISMATCH, 'fact bundle Profile provenance does not match the adapter input');
  }

  const coreAdapter = createProjectBindingAdapter('configuration_change_impact', projectBinding);
  const adapted = coreAdapter.adaptEvidence({
    snapshot_id: sourceSnapshot.snapshot_id,
    source_refs: sourceSnapshot.source_refs,
    observations: sourceSnapshot.observations,
  }, cutoffs);
  const coreTypedFacts = snapshotOrdinaryData(adapted.typed_project_facts, { errorCode: CCI_ERROR_CODES.TYPED_FACTS_REFUSED });
  const coreReceipt = snapshotOrdinaryData(adapted.observation_receipt, { errorCode: CCI_ERROR_CODES.TYPED_FACTS_REFUSED });
  const core = validateCoreTypedFacts(coreTypedFacts);
  if (!sameDigestValue(core.projectBinding, projectBinding, 'soulforge.configuration_change_impact.project_binding.compare.v0')) {
    fail(CCI_ERROR_CODES.PROJECT_BINDING_MISMATCH, 'Core typed facts binding does not match the adapter input');
  }
  if (!sameDigestValue(core.fact.profileProvenance, projectProfile, 'soulforge.configuration_change_impact.profile_provenance.compare.v0')
      || !sameDigestValue(core.fact.identity, sourceSnapshot.fact.identity, 'soulforge.configuration_change_impact.change_identity.compare.v0')) {
    fail(CCI_ERROR_CODES.TYPED_FACTS_REFUSED, 'Core typed fact bundle changed its profile or change identity');
  }
  const receiptSource = validateCoreReceipt(coreReceipt, projectBinding, coreTypedFacts.facts_digest, sourceDigest);
  if (!sameDigestValue(receiptSource.fact.identity, core.fact.identity, 'soulforge.configuration_change_impact.change_identity.compare.v0')
      || !sameDigestValue(receiptSource.fact.request, core.fact.request, 'soulforge.configuration_change_impact.request.compare.v0')) {
    fail(CCI_ERROR_CODES.TYPED_FACTS_REFUSED, 'Core receipt fact bundle does not match typed facts');
  }
  const identityDigest = `sha256:${digest(
    CCI_TYPED_FACTS_IDENTITY_DOMAIN,
    typedFactsIdentityMaterial(
      projectBinding,
      projectProfile,
      core.fact.identity,
      coreTypedFacts.facts_digest,
      sourceDigest,
      compilationScope,
    ),
  )}`;
  return deepFreeze({
    schema_version: CCI_TYPED_FACTS_SCHEMA_VERSION,
    project_binding_ref: projectBinding,
    core_typed_project_facts: coreTypedFacts,
    core_observation_receipt: coreReceipt,
    project_profile_provenance: projectProfile,
    change_identity: core.fact.identity,
    compilation_scope: compilationScope,
    source_snapshot_digest: sourceDigest,
    identity_digest: identityDigest,
  });
}

function extractTypedFacts(typedFacts, effectiveRuleSet) {
  const envelope = snapshotOrdinaryData(typedFacts, { errorCode: CCI_ERROR_CODES.TYPED_FACTS_REFUSED });
  assertExactKeys(envelope, TYPED_FACTS_FIELDS, 'configuration-change typed facts', CCI_ERROR_CODES.TYPED_FACTS_REFUSED);
  if (envelope.schema_version !== CCI_TYPED_FACTS_SCHEMA_VERSION
      || !SHA256_REFERENCE.test(envelope.identity_digest)
      || !SHA256_REFERENCE.test(envelope.source_snapshot_digest)) {
    fail(CCI_ERROR_CODES.TYPED_FACTS_REFUSED, 'configuration-change typed facts schema or identity digest is invalid');
  }
  const binding = validateProjectBindingRef(envelope.project_binding_ref);
  const core = validateCoreTypedFacts(envelope.core_typed_project_facts);
  const compilationScope = validateCompilationScope(envelope.compilation_scope, CCI_ERROR_CODES.TYPED_FACTS_REFUSED);
  const receiptSource = validateCoreReceipt(
    envelope.core_observation_receipt,
    binding,
    envelope.core_typed_project_facts.facts_digest,
    envelope.source_snapshot_digest,
  );
  const profileList = validateConfigurationChangeImpactProfileProvenance([envelope.project_profile_provenance]);
  const profile = profileList[0];
  if (profile.profile_kind !== 'project') fail(CCI_ERROR_CODES.PROFILE_BINDING_MISMATCH, 'typed facts must bind a project Profile');
  const identity = validateChangeIdentity(envelope.change_identity, CCI_ERROR_CODES.TYPED_FACTS_REFUSED);
  const expectedIdentityDigest = `sha256:${digest(
    CCI_TYPED_FACTS_IDENTITY_DOMAIN,
    typedFactsIdentityMaterial(
      binding,
      profile,
      identity,
      envelope.core_typed_project_facts.facts_digest,
      envelope.source_snapshot_digest,
      compilationScope,
    ),
  )}`;
  if (envelope.identity_digest !== expectedIdentityDigest) {
    fail(CCI_ERROR_CODES.TYPED_FACTS_REFUSED, 'configuration-change typed facts identity digest is invalid');
  }
  if (!sameDigestValue(binding, core.projectBinding, 'soulforge.configuration_change_impact.project_binding.compare.v0')
      || !sameDigestValue(binding, core.fact.projectBinding, 'soulforge.configuration_change_impact.project_binding.compare.v0')
      || !sameDigestValue(binding, receiptSource.fact.projectBinding, 'soulforge.configuration_change_impact.project_binding.compare.v0')) {
    fail(CCI_ERROR_CODES.PROJECT_BINDING_MISMATCH, 'typed facts project binding does not agree across the Core seam');
  }
  if (!sameDigestValue(profile, core.fact.profileProvenance, 'soulforge.configuration_change_impact.profile_provenance.compare.v0')
      || !sameDigestValue(profile, receiptSource.fact.profileProvenance, 'soulforge.configuration_change_impact.profile_provenance.compare.v0')) {
    fail(CCI_ERROR_CODES.PROFILE_BINDING_MISMATCH, 'typed facts Profile provenance does not agree across the Core seam');
  }
  if (!sameDigestValue(identity, core.fact.identity, 'soulforge.configuration_change_impact.change_identity.compare.v0')
      || !sameDigestValue(identity, receiptSource.fact.identity, 'soulforge.configuration_change_impact.change_identity.compare.v0')) {
    fail(CCI_ERROR_CODES.CHANGE_IDENTITY_REFUSED, 'typed facts change identity does not agree across the Core seam');
  }
  const request = core.fact.request;
  if (!sameDigestValue(receiptSource.fact.request, request, 'soulforge.configuration_change_impact.request.compare.v0')) {
    fail(CCI_ERROR_CODES.TYPED_FACTS_REFUSED, 'typed facts receipt source evidence or decision facts do not match evaluated facts');
  }
  if (!sameDigestValue(identity, changeIdentity(request.change), 'soulforge.configuration_change_impact.change_identity.compare.v0')) {
    fail(CCI_ERROR_CODES.CHANGE_IDENTITY_REFUSED, 'typed facts request does not match its change identity');
  }
  const effectiveProjectProfile = effectiveRuleSet.profileProvenance.find((entry) => entry.profile_kind === 'project');
  if (!effectiveProjectProfile
      || !sameDigestValue(profile, effectiveProjectProfile, 'soulforge.configuration_change_impact.profile_provenance.compare.v0')) {
    fail(CCI_ERROR_CODES.PROFILE_BINDING_MISMATCH, 'typed facts Profile provenance does not match the effective ruleset');
  }
  if (!sameDigestValue(compilationScope, effectiveRuleSet.compilationScope, 'soulforge.configuration_change_impact.compilation_scope.compare.v0')) {
    fail(CCI_ERROR_CODES.RULESET_REFUSED, 'typed facts compilation scope does not match the Effective Rule Set trace');
  }
  return {
    request,
    binding,
    profile,
    identity,
    compilationScope,
    identityDigest: envelope.identity_digest,
    sourceSnapshotDigest: envelope.source_snapshot_digest,
  };
}

function evaluateRequest(input, typedFactsBinding) {
  const propagation = evaluatePropagationGraph({
    graph: input.propagation_graph,
    seed_item_refs: input.change.seed_item_refs,
    impact_kinds: CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS,
  });
  const impact_results = input.impact_records.map((record) => evaluateImpact(record, propagation, input.change));
  const counts = countsFor(impact_results);
  assertClosureConsistency(input, impact_results, counts, propagation);
  const evidence_claim_ceiling = evidenceCeiling(counts, propagation);
  const domain_result = {
    schema_version: CONFIGURATION_CHANGE_IMPACT_RESULT_SCHEMA,
    canon_claim_ceiling: 'source_supported',
    evidence_claim_ceiling,
    change: { ...input.change },
    propagation_graph: {
      complete: propagation.complete,
      seed_item_refs: [...propagation.seed_item_refs],
      reachable_item_refs_by_kind: Object.fromEntries(
        CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS.map((kind) => [kind, [...propagation.reachable_item_refs_by_kind[kind]]]),
      ),
      unreachable_item_refs_by_kind: Object.fromEntries(
        CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS.map((kind) => [kind, [...propagation.unreachable_item_refs_by_kind[kind]]]),
      ),
      reachable_tree_edge_count: propagation.reachable_tree_edge_count,
    },
    approval: { ...input.approval },
    closure: {
      state: input.closure.state,
      closure_evidence: input.closure.closure_evidence.map((evidence) => ({
        ...evidence,
        item_path_refs: [...evidence.item_path_refs],
        relationship_path_refs: [...evidence.relationship_path_refs],
      })),
    },
    impact_results,
    propagation_plan: impact_results.map((row) => ({
      impact_kind: row.impact_kind,
      action: row.propagation_action,
      calculated_state: row.state,
      reachability_state: row.reachability_state,
      reachable_item_refs: [...row.reachable_item_refs],
      item_paths: row.item_paths.map((path) => ({
        item_ref: path.item_ref,
        item_path_refs: [...path.item_path_refs],
        relationship_path_refs: [...path.relationship_path_refs],
      })),
    })),
    counts,
  };
  const assessment = {
    schema_version: CONFIGURATION_CHANGE_IMPACT_ASSESSMENT_SCHEMA,
    assessment_kind: 'configuration_change_impact',
    canon_claim_ceiling: 'source_supported',
    evidence_claim_ceiling,
    overall_state: overallState(input, counts, propagation),
    change_state: input.closure.state,
    result_counts: { ...counts },
  };
  const receipt = {
    schema_version: CONFIGURATION_CHANGE_IMPACT_RECEIPT_SCHEMA,
    bindings: {
      domain_engine_id: 'configuration_change_impact',
      adapter_revision: CCI_EVALUATOR_ADAPTER_SCHEMA_VERSION,
      source_packet_ref: { ...CONFIGURATION_CHANGE_IMPACT_SOURCE_PACKET_REF },
      ruleset_ref: { ...CONFIGURATION_CHANGE_IMPACT_RULESET_REF },
      typed_facts_identity_digest: typedFactsBinding.identityDigest,
      source_snapshot_digest: typedFactsBinding.sourceSnapshotDigest,
    },
    digests: {
      input_sha256: digest('soulforge.configuration_change_impact.input.v0', input),
      domain_result_sha256: digest('soulforge.configuration_change_impact.domain_result.v0', domain_result),
      assessment_sha256: digest('soulforge.configuration_change_impact.assessment.v0', assessment),
    },
    counts: { ...counts },
    effects: { ...EFFECTS },
  };
  return deepFreeze({ assessment, domain_result, receipt });
}

export function evaluateConfigurationChangeImpact(effectiveRuleSet, typedProjectFacts) {
  const effective = validateEffectiveRuleSet(effectiveRuleSet);
  const typed = extractTypedFacts(typedProjectFacts, effective);
  return evaluateRequest(typed.request, typed);
}

export const configurationChangeImpactAdapter = Object.freeze({
  ...configurationChangeImpactCompilerAdapter,
  revision: CCI_EVALUATOR_ADAPTER_SCHEMA_VERSION,
  evaluate(effectiveRuleSet, typedProjectFacts) {
    return evaluateConfigurationChangeImpact(effectiveRuleSet, typedProjectFacts);
  },
});

registerDomainEngineAdapter('configuration_change_impact', configurationChangeImpactAdapter);

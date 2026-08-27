// Deep, domain-local graph module. Its small interface turns a typed, finite dependency graph
// into deterministic transitive reachability and path evidence without reading project sources.
import types from 'node:util/types';

import { compareCodePoints } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { CONFIGURATION_CHANGE_IMPACT_ERROR_CODES } from '../rules/configuration_change_impact_rules.mjs';

export const PROPAGATION_GRAPH_ERROR_CODES = Object.freeze({
  GRAPH_REFUSED: CONFIGURATION_CHANGE_IMPACT_ERROR_CODES.GRAPH_REFUSED,
  NODE_REFUSED: CONFIGURATION_CHANGE_IMPACT_ERROR_CODES.NODE_REFUSED,
  EDGE_REFUSED: CONFIGURATION_CHANGE_IMPACT_ERROR_CODES.EDGE_REFUSED,
  SEED_REFUSED: CONFIGURATION_CHANGE_IMPACT_ERROR_CODES.SEED_REFUSED,
});

const GRAPH_FIELDS = Object.freeze(['complete', 'nodes', 'edges']);
const NODE_FIELDS = Object.freeze(['item_ref', 'impact_kind']);
const EDGE_FIELDS = Object.freeze(['from_item_ref', 'to_item_ref', 'relationship_ref']);

function fail(code, message) {
  throw new ContractError(code, message);
}

function snapshotPlainData(value, depth = 0, ancestors = new Set(), seen = new Set()) {
  if (depth > 16) fail(PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED, 'graph input depth exceeds the bounded limit');
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || types.isProxy(value)) {
    fail(PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED, 'graph input accepts only ordinary JSON-like data');
  }
  if (ancestors.has(value) || seen.has(value)) {
    fail(PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED, 'graph input may not contain aliases or cycles');
  }
  ancestors.add(value);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 64) {
        fail(PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED, 'graph input arrays must be ordinary and bounded');
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol' || (key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key)))) {
        fail(PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED, 'graph input arrays may not carry symbols, holes, or named fields');
      }
      const copy = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          fail(PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED, 'graph input arrays may not carry accessors or holes');
        }
        copy.push(snapshotPlainData(descriptor.value, depth + 1, ancestors, seen));
      }
      return copy;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      fail(PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED, 'graph input objects must have Object.prototype');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const copy = {};
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        fail(PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED, 'graph input objects may not carry symbols, hidden fields, or accessors');
      }
      copy[key] = snapshotPlainData(descriptor.value, depth + 1, ancestors, seen);
    }
    return copy;
  } finally {
    ancestors.delete(value);
  }
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function assertExactKeys(value, expected, label, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be an object`);
  const actual = Object.keys(value).sort(compareCodePoints);
  const required = [...expected].sort(compareCodePoints);
  if (actual.length !== required.length || !actual.every((key, index) => key === required[index])) {
    fail(code, `${label} must contain exactly ${required.join(', ')}`);
  }
}

function assertReference(value, label, code) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(code, `${label} must be a bounded non-empty reference`);
  }
  return value;
}

function assertOrderedUnique(values, label, code) {
  let previous = null;
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value) || (previous !== null && compareCodePoints(previous, value) >= 0)) {
      fail(code, `${label} must be sorted and unique`);
    }
    seen.add(value);
    previous = value;
  }
}

function edgeKey(edge) {
  return `${edge.from_item_ref}\u0000${edge.to_item_ref}\u0000${edge.relationship_ref}`;
}

function validateImpactKinds(impactKinds) {
  if (!Array.isArray(impactKinds) || impactKinds.length === 0 || impactKinds.length > 32) {
    fail(PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED, 'impact_kinds must be a bounded non-empty array');
  }
  const seen = new Set();
  for (const kind of impactKinds) {
    if (typeof kind !== 'string' || !kind || seen.has(kind)) {
      fail(PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED, 'impact_kinds must contain unique non-empty tokens');
    }
    seen.add(kind);
  }
  return new Set(impactKinds);
}

function validateGraph(graph, impactKinds) {
  assertExactKeys(graph, GRAPH_FIELDS, 'propagation_graph', PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED);
  if (typeof graph.complete !== 'boolean' || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)
      || graph.nodes.length === 0 || graph.nodes.length > 64 || graph.edges.length > 64) {
    fail(PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED, 'propagation graph must have bounded nodes, edges, and an explicit complete flag');
  }
  const knownKinds = validateImpactKinds(impactKinds);
  const nodeByRef = new Map();
  const nodes = graph.nodes.map((node) => {
    assertExactKeys(node, NODE_FIELDS, 'propagation_graph.node', PROPAGATION_GRAPH_ERROR_CODES.NODE_REFUSED);
    const item_ref = assertReference(node.item_ref, 'node.item_ref', PROPAGATION_GRAPH_ERROR_CODES.NODE_REFUSED);
    if (!knownKinds.has(node.impact_kind)) {
      fail(PROPAGATION_GRAPH_ERROR_CODES.NODE_REFUSED, 'node impact_kind is not in the fixed domain vocabulary');
    }
    if (nodeByRef.has(item_ref)) fail(PROPAGATION_GRAPH_ERROR_CODES.NODE_REFUSED, 'node item_ref must be unique');
    const normalized = { item_ref, impact_kind: node.impact_kind };
    nodeByRef.set(item_ref, normalized);
    return normalized;
  });
  assertOrderedUnique(nodes.map((node) => node.item_ref), 'nodes', PROPAGATION_GRAPH_ERROR_CODES.NODE_REFUSED);

  let priorEdge = null;
  const edgeKeys = new Set();
  const edges = graph.edges.map((edge) => {
    assertExactKeys(edge, EDGE_FIELDS, 'propagation_graph.edge', PROPAGATION_GRAPH_ERROR_CODES.EDGE_REFUSED);
    const normalized = {
      from_item_ref: assertReference(edge.from_item_ref, 'edge.from_item_ref', PROPAGATION_GRAPH_ERROR_CODES.EDGE_REFUSED),
      to_item_ref: assertReference(edge.to_item_ref, 'edge.to_item_ref', PROPAGATION_GRAPH_ERROR_CODES.EDGE_REFUSED),
      relationship_ref: assertReference(edge.relationship_ref, 'edge.relationship_ref', PROPAGATION_GRAPH_ERROR_CODES.EDGE_REFUSED),
    };
    if (!nodeByRef.has(normalized.from_item_ref) || !nodeByRef.has(normalized.to_item_ref)
        || normalized.from_item_ref === normalized.to_item_ref) {
      fail(PROPAGATION_GRAPH_ERROR_CODES.EDGE_REFUSED, 'each edge must join two distinct declared nodes');
    }
    const key = edgeKey(normalized);
    if (edgeKeys.has(key) || (priorEdge !== null && compareCodePoints(priorEdge, key) >= 0)) {
      fail(PROPAGATION_GRAPH_ERROR_CODES.EDGE_REFUSED, 'edges must be sorted and unique by source, target, and relationship');
    }
    edgeKeys.add(key);
    priorEdge = key;
    return normalized;
  });
  return { complete: graph.complete, nodes, edges, nodeByRef };
}

function validateSeeds(seedItemRefs, nodeByRef) {
  if (!Array.isArray(seedItemRefs) || seedItemRefs.length === 0 || seedItemRefs.length > 32) {
    fail(PROPAGATION_GRAPH_ERROR_CODES.SEED_REFUSED, 'seed_item_refs must be a bounded non-empty array');
  }
  const seeds = seedItemRefs.map((ref) => assertReference(ref, 'seed_item_ref', PROPAGATION_GRAPH_ERROR_CODES.SEED_REFUSED));
  assertOrderedUnique(seeds, 'seed_item_refs', PROPAGATION_GRAPH_ERROR_CODES.SEED_REFUSED);
  for (const seed of seeds) {
    if (!nodeByRef.has(seed)) fail(PROPAGATION_GRAPH_ERROR_CODES.SEED_REFUSED, 'every seed_item_ref must name a declared graph node');
  }
  return seeds;
}

/**
 * Computes transitive graph reachability for one controlled change.
 *
 * Interface: caller supplies a finite graph, its explicit completeness declaration, fixed
 * domain kinds, and sorted seed references. The result exposes only deterministic reachability
 * and shortest paths; it never changes source data or performs an external action.
 */
export function evaluatePropagationGraph(input) {
  const snapshot = snapshotPlainData(input);
  assertExactKeys(snapshot, ['graph', 'seed_item_refs', 'impact_kinds'], 'graph input', PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED);
  const { graph, seed_item_refs, impact_kinds } = snapshot;
  const normalizedGraph = validateGraph(graph, impact_kinds);
  const seeds = validateSeeds(seed_item_refs, normalizedGraph.nodeByRef);
  const adjacency = new Map(normalizedGraph.nodes.map((node) => [node.item_ref, []]));
  for (const edge of normalizedGraph.edges) adjacency.get(edge.from_item_ref).push(edge);
  for (const edges of adjacency.values()) {
    edges.sort((left, right) => compareCodePoints(left.to_item_ref, right.to_item_ref)
      || compareCodePoints(left.relationship_ref, right.relationship_ref));
  }

  const paths = new Map();
  const queue = [];
  for (const seed of seeds) {
    paths.set(seed, { item_path_refs: [seed], relationship_path_refs: [] });
    queue.push(seed);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const edge of adjacency.get(current)) {
      if (paths.has(edge.to_item_ref)) continue;
      const previousPath = paths.get(current);
      paths.set(edge.to_item_ref, {
        item_path_refs: [...previousPath.item_path_refs, edge.to_item_ref],
        relationship_path_refs: [...previousPath.relationship_path_refs, edge.relationship_ref],
      });
      queue.push(edge.to_item_ref);
    }
  }

  const reachable_item_refs_by_kind = Object.fromEntries(impact_kinds.map((kind) => [kind, []]));
  const unreachable_item_refs_by_kind = Object.fromEntries(impact_kinds.map((kind) => [kind, []]));
  const paths_by_item = [];
  for (const node of normalizedGraph.nodes) {
    const path = paths.get(node.item_ref);
    if (path) {
      reachable_item_refs_by_kind[node.impact_kind].push(node.item_ref);
      paths_by_item.push({
        item_ref: node.item_ref,
        impact_kind: node.impact_kind,
        item_path_refs: [...path.item_path_refs],
        relationship_path_refs: [...path.relationship_path_refs],
      });
    } else {
      unreachable_item_refs_by_kind[node.impact_kind].push(node.item_ref);
    }
  }

  return freezeDeep({
    complete: normalizedGraph.complete,
    seed_item_refs: [...seeds],
    reachable_item_refs_by_kind,
    unreachable_item_refs_by_kind,
    paths_by_item,
    reachable_tree_edge_count: Math.max(0, paths.size - seeds.length),
  });
}

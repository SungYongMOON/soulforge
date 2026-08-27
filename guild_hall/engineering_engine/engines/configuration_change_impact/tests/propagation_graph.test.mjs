import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROPAGATION_GRAPH_ERROR_CODES,
  evaluatePropagationGraph,
} from '../evaluator/propagation_graph.mjs';

const KINDS = [
  'requirements',
  'bom',
  'drawings',
  'software',
  'interfaces',
  'tests',
  'documents',
  'baselines',
  'closure_evidence',
];

function graph() {
  const nodes = KINDS.map((impact_kind, index) => ({
    item_ref: `item:${String(index + 1).padStart(2, '0')}:${impact_kind}`,
    impact_kind,
  }));
  return {
    complete: true,
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => ({
      from_item_ref: node.item_ref,
      to_item_ref: nodes[index + 1].item_ref,
      relationship_ref: `relation:${String(index + 1).padStart(2, '0')}`,
    })),
  };
}

test('computes a stable transitive propagation path across every configured impact kind', () => {
  const input = graph();
  const result = evaluatePropagationGraph({
    graph: input,
    seed_item_refs: [input.nodes[0].item_ref],
    impact_kinds: KINDS,
  });

  assert.equal(result.complete, true);
  assert.deepEqual(result.reachable_item_refs_by_kind.requirements, [input.nodes[0].item_ref]);
  assert.deepEqual(result.reachable_item_refs_by_kind.closure_evidence, [input.nodes.at(-1).item_ref]);
  assert.deepEqual(result.paths_by_item.find((row) => row.item_ref === input.nodes.at(-1).item_ref).item_path_refs, input.nodes.map((node) => node.item_ref));
  assert.deepEqual(
    result.paths_by_item.find((row) => row.item_ref === input.nodes.at(-1).item_ref).relationship_path_refs,
    input.edges.map((edge) => edge.relationship_ref),
  );
  assert.equal(result.reachable_tree_edge_count, input.edges.length);
  assert.equal(Object.isFrozen(result), true);
});

test('fails closed for dangling, unsorted, or duplicated graph relationships', () => {
  const dangling = graph();
  dangling.edges[0].to_item_ref = 'item:missing';
  assert.throws(
    () => evaluatePropagationGraph({ graph: dangling, seed_item_refs: [dangling.nodes[0].item_ref], impact_kinds: KINDS }),
    (error) => error?.code === PROPAGATION_GRAPH_ERROR_CODES.EDGE_REFUSED,
  );

  const unsorted = graph();
  unsorted.edges.reverse();
  assert.throws(
    () => evaluatePropagationGraph({ graph: unsorted, seed_item_refs: [unsorted.nodes[0].item_ref], impact_kinds: KINDS }),
    (error) => error?.code === PROPAGATION_GRAPH_ERROR_CODES.EDGE_REFUSED,
  );

  const duplicate = graph();
  duplicate.edges.push(structuredClone(duplicate.edges[0]));
  assert.throws(
    () => evaluatePropagationGraph({ graph: duplicate, seed_item_refs: [duplicate.nodes[0].item_ref], impact_kinds: KINDS }),
    (error) => error?.code === PROPAGATION_GRAPH_ERROR_CODES.EDGE_REFUSED,
  );
});

test('refuses accessor and Proxy graph wrappers without executing getters', () => {
  let getterCalls = 0;
  const accessorInput = {};
  Object.defineProperty(accessorInput, 'graph', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return graph();
    },
  });
  accessorInput.seed_item_refs = ['item:01:requirements'];
  accessorInput.impact_kinds = KINDS;
  assert.throws(
    () => evaluatePropagationGraph(accessorInput),
    (error) => error?.code === PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED,
  );
  assert.equal(getterCalls, 0);
  assert.throws(
    () => evaluatePropagationGraph(new Proxy({
      graph: graph(),
      seed_item_refs: ['item:01:requirements'],
      impact_kinds: KINDS,
    }, {})),
    (error) => error?.code === PROPAGATION_GRAPH_ERROR_CODES.GRAPH_REFUSED,
  );
});

test('selects a stable shortest path when multiple graph routes reach one item', () => {
  const nodes = [
    { item_ref: 'item:01:requirements', impact_kind: 'requirements' },
    { item_ref: 'item:02:bom', impact_kind: 'bom' },
    { item_ref: 'item:03:drawings', impact_kind: 'drawings' },
    { item_ref: 'item:04:closure', impact_kind: 'closure_evidence' },
  ];
  const result = evaluatePropagationGraph({
    impact_kinds: KINDS,
    seed_item_refs: ['item:01:requirements'],
    graph: {
      complete: true,
      nodes,
      edges: [
        { from_item_ref: 'item:01:requirements', to_item_ref: 'item:02:bom', relationship_ref: 'relation:01' },
        { from_item_ref: 'item:01:requirements', to_item_ref: 'item:03:drawings', relationship_ref: 'relation:02' },
        { from_item_ref: 'item:02:bom', to_item_ref: 'item:04:closure', relationship_ref: 'relation:03' },
        { from_item_ref: 'item:03:drawings', to_item_ref: 'item:04:closure', relationship_ref: 'relation:04' },
      ],
    },
  });
  assert.deepEqual(
    result.paths_by_item.find((row) => row.item_ref === 'item:04:closure').item_path_refs,
    ['item:01:requirements', 'item:02:bom', 'item:04:closure'],
  );
  assert.deepEqual(
    result.paths_by_item.find((row) => row.item_ref === 'item:04:closure').relationship_path_refs,
    ['relation:01', 'relation:03'],
  );
  assert.equal(result.reachable_tree_edge_count, 3);
});

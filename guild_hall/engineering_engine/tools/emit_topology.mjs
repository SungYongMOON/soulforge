#!/usr/bin/env node
// Emits the engine's structural topology by reading the engine, not by describing it.
//
// The point is that nothing here is hand-authored. Module edges come from parsing the actual
// `import` statements; boundaries come from the OPERATIONS table lane 1D declares; the
// lineage chain, graph shapes and fingerprint inputs come from the modules that own them.
// A drawing can disagree with the code it depicts. This cannot: if a module stops importing
// another, the edge disappears on the next run.
//
// Output is a single JSON document plus a digest over it, so a viewer can state which
// version of the code it is showing rather than asserting a topology of its own.
//
//   node tools/emit_topology.mjs [--out <path>]

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, '..');
const KERNEL = join(ENGINE, 'kernel');

// ---------------------------------------------------------------- module edges, parsed

const moduleFiles = readdirSync(KERNEL).filter((f) => f.endsWith('.mjs')).sort();
const IMPORT_FROM = /from\s+'\.\/([a-z_0-9]+)\.mjs'/g;

const modules = [];
const edges = [];
for (const file of moduleFiles) {
  const name = file.replace('.mjs', '');
  const src = readFileSync(join(KERNEL, file), 'utf8');
  const exported = [...src.matchAll(/^export\s+(?:const|function|class)\s+([A-Za-z_][A-Za-z_0-9]*)/gm)].map((m) => m[1]);
  const reExported = [...src.matchAll(/^export\s*\{([^}]*)\}\s*from/gm)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean));
  modules.push({
    module: name,
    exports: [...new Set([...exported, ...reExported])].sort(),
    export_count: new Set([...exported, ...reExported]).size,
    line_count: src.split('\n').length,
  });
  for (const m of src.matchAll(IMPORT_FROM)) {
    const to = m[1];
    if (to !== name && !edges.some((e) => e.from === name && e.to === to)) {
      edges.push({ from: name, to, relation: 'imports' });
    }
  }
}
edges.sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));

// ---------------------------------------------------------------- declarations, imported

const [
  cfg, mcp, pipeline, graph, capsule, lineage, custody, snapshot, minting, moduleBinding, ceilings, authority, finding, executionMode,
] = await Promise.all([
  'contract_config', 'mcp_contract', 'pipeline', 'graph', 'capsule', 'lineage', 'custody',
  'snapshot', 'minting', 'module_binding', 'ceilings', 'authority', 'finding', 'execution_mode',
].map((m) => import(`../kernel/${m}.mjs`)));

// Lane ownership of the frozen crosswalk's field groups. This is the one list that is stated
// rather than derived, because the crosswalk lives in the frozen bundle and this tree only
// records which lane answered which entry.
const LANE_FIELD_GROUPS = [
  { lane: '1A', field_group: 'snapshot_envelope_state_axes_finding_and_pipeline_contract_fields', modules: ['snapshot', 'pipeline'], suite: 'lane_1a_conformance.mjs' },
  { lane: '1B', field_group: 'inventory_custody_eligibility_and_lineage', modules: ['custody', 'lineage'], suite: 'lane_1b_conformance.mjs' },
  { lane: '1C', field_group: 'graph_typed_edge_and_capsule_and_context_capsule_fingerprint', modules: ['graph', 'capsule'], suite: 'lane_1c_conformance.mjs' },
  { lane: '1D', field_group: 'mcp_request_receipt_cas_idempotency', modules: ['mcp_contract'], suite: 'lane_1d_conformance.mjs' },
  { lane: '1E', field_group: 'module_abi_binding_artifact_and_module_binding_revision', modules: ['module_binding'], suite: 'lane_1e_conformance.mjs' },
  { lane: '1V', field_group: 'verification_lock', modules: [], suite: 'lane_1v_mutation_lock.mjs' },
];

const topology = {
  topology_version: 'engine_topology.v0',
  engine_root: 'guild_hall/engineering_engine',
  contract_revision: cfg.CONTRACT_REVISION,
  derivation: {
    module_edges: 'parsed from import statements in kernel/*.mjs',
    boundaries: 'read from mcp_contract.OPERATIONS',
    everything_else: 'read from the module that owns it',
    hand_authored: ['lane_field_group_ownership'],
  },

  modules,
  module_count: modules.length,
  module_edges: edges,
  module_edge_count: edges.length,

  lane_field_groups: LANE_FIELD_GROUPS,

  serialised_boundaries: pipeline.SERIALISED_BOUNDARIES.map((b) => ({
    ...b, effects: pipeline.BOUNDARY_EFFECTS[b.lane],
  })),
  parallel_operations: Object.entries(mcp.OPERATIONS)
    .filter(([, o]) => o.concurrency === 'parallel').map(([name, o]) => ({ operation: name, ceiling: o.ceiling })),

  fingerprint: {
    input_keys: cfg.FINGERPRINT_INPUT_KEYS,
    excluded_layers: cfg.FINGERPRINT_EXCLUDED_LAYERS,
    replay_relevant_field_count: cfg.REPLAY_RELEVANT_PROVENANCE.length,
    run_observational_field_count: cfg.RUN_OBSERVATIONAL_PROVENANCE.length,
  },

  vocabularies: {
    authority_families: authority.AUTHORITY_FAMILIES.map((f) => f.key ?? f),
    canon_claim_ceiling: ceilings.CANON_CLAIM_CEILING,
    evidence_claim_ceiling: ceilings.EVIDENCE_CLAIM_CEILING,
    snapshot_claim_ceiling_axis: ceilings.SNAPSHOT_CLAIM_CEILING_AXIS,
    graph_node_types: graph.NODE_TYPES,
    graph_edge_shape_count: graph.EDGE_SHAPES.length,
    lineage_chain: lineage.CHAIN_KINDS,
    gap_types: Object.values(snapshot.GAP_TYPE),
    state_axes: Object.values(snapshot.AXIS),
    presence_states: Object.values(custody.PRESENCE),
    custody_mode: custody.CUSTODY_MODE,
    disposition_chain: finding.CHAIN,
    minted_families: minting.MINTED_FAMILIES,
    derived_families: minting.DERIVED_FAMILIES,
    caller_supplied_families: minting.CALLER_FAMILIES,
    max_capsule_hops: capsule.MAX_HOPS_CEILING,
    time_fractional_digits: cfg.TIME_PRECISION.fractionalDigits,
    baseline_execution_mode: cfg.BASELINE_EXECUTION_MODE,
    allowed_authoritative_retrieval: executionMode.ALLOWED_AUTHORITATIVE_RETRIEVAL,
  },

  owner_decisions: {
    closed: cfg.CLOSED_OWNER_DECISIONS,
    open: cfg.OPEN_OWNER_DECISIONS,
    open_lane_questions: cfg.OPEN_LANE_QUESTIONS,
    lane_1a: pipeline.OPEN_OWNER_DECISIONS_FOR_THIS_LANE,
    lane_1b: custody.OPEN_OWNER_DECISIONS_FOR_THIS_LANE,
    lane_1e: moduleBinding.OPEN_OWNER_DECISIONS_FOR_THIS_LANE,
    undefined_stage: pipeline.P7,
  },
};

// Stable digest: a viewer can show this and say which code it rendered.
const canonicalJson = JSON.stringify(topology, Object.keys(topology).sort());
topology.topology_digest = createHash('sha256').update(canonicalJson).digest('hex');

const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
const text = `${JSON.stringify(topology, null, 2)}\n`;
if (out) {
  writeFileSync(out, text, 'utf8');
  console.log(JSON.stringify({
    emitted: out, modules: topology.module_count, module_edges: topology.module_edge_count,
    boundaries: topology.serialised_boundaries.length, topology_digest: topology.topology_digest,
  }, null, 2));
} else {
  process.stdout.write(text);
}

#!/usr/bin/env node
// Emits the engine's structural topology by reading canonical core and domain engine modules.
//
// Nothing here is hand-authored:
// - Modules and edges are parsed from all canonical .mjs source files under core/ and engines/.
// - Boundaries come from pipeline.SERIALISED_BOUNDARIES and mcp_contract.OPERATIONS.
// - Lineage, graph shapes, and fingerprint inputs come from core validator declarations.
//
// Legacy compatibility wrappers (kernel/, assembly/, stage_rules/, subjects/, observation/,
// guidance/, evaluation/, mcp/, fixtures/, tools/, tests/) are excluded from canonical module counts
// and topology representation.
//
// Usage:
//   node tools/emit_topology.mjs [--out <path> | --check <path>]

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, '..');

// Canonical source trees (excluding tests and legacy flat wrapper dirs)
const CANONICAL_ROOTS = [
  'core',
  'engines/systems_engineering',
  'engines/quality_readiness',
  'engines/database_engineering',
  'engines/material_procurement_readiness',
  'engines/reliability_maintainability',
  'engines/pcb_compliance',
];

export function findCanonicalModules(dirRel) {
  const fullDir = join(ENGINE, dirRel);
  const found = [];
  let entries = [];
  try { entries = readdirSync(fullDir, { withFileTypes: true }); } catch { return found; }

  for (const entry of entries) {
    const relChild = `${dirRel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'tests' || entry.name === 'scratch') continue;
      found.push(...findCanonicalModules(relChild));
    } else if (entry.name.endsWith('.mjs')) {
      if (entry.name.endsWith('.test.mjs') || entry.name.includes('.test.')) continue;
      found.push(relChild);
    }
  }
  return found;
}

export function extractStaticImportSpecifiers(sourceText) {
  const specifiers = new Set();

  // Pattern 1: Any import/export ... from '...' or "..." (single/double quotes, single/multiline)
  const fromPattern = /\bfrom\s*['"]((?:\.\.?\/)+[^'"]+\.mjs)['"]/g;
  for (const m of sourceText.matchAll(fromPattern)) {
    specifiers.add(m[1]);
  }

  // Pattern 2: Side-effect import: import '...' or import "..."
  const sideEffectPattern = /\bimport\s*['"]((?:\.\.?\/)+[^'"]+\.mjs)['"]/g;
  for (const m of sourceText.matchAll(sideEffectPattern)) {
    specifiers.add(m[1]);
  }

  // Pattern 3: Dynamic import: import('...') or import("...")
  const dynamicImportPattern = /\bimport\s*\(\s*['"]((?:\.\.?\/)+[^'"]+\.mjs)['"]/g;
  for (const m of sourceText.matchAll(dynamicImportPattern)) {
    specifiers.add(m[1]);
  }

  return [...specifiers];
}

// ---------------------------------------------------------------- core declarations
const [
  cfg, mcp, pipeline, graph, capsule, lineage, custody, snapshot, minting, moduleBinding, ceilings, authority, finding, executionMode,
] = await Promise.all([
  'contract_config', 'mcp_contract', 'pipeline', 'graph', 'capsule', 'lineage', 'custody',
  'snapshot', 'minting', 'module_binding', 'ceilings', 'authority', 'finding', 'execution_mode',
].map((m) => import(`../core/validators/${m}.mjs`)));

const LANE_FIELD_GROUPS = [
  { lane: '1A', field_group: 'snapshot_envelope_state_axes_finding_and_pipeline_contract_fields', modules: ['snapshot', 'pipeline'], suite: 'lane_1a_conformance.mjs' },
  { lane: '1B', field_group: 'inventory_custody_eligibility_and_lineage', modules: ['custody', 'lineage'], suite: 'lane_1b_conformance.mjs' },
  { lane: '1C', field_group: 'graph_typed_edge_and_capsule_and_context_capsule_fingerprint', modules: ['graph', 'capsule'], suite: 'lane_1c_conformance.mjs' },
  { lane: '1D', field_group: 'mcp_request_receipt_cas_idempotency', modules: ['mcp_contract'], suite: 'lane_1d_conformance.mjs' },
  { lane: '1E', field_group: 'module_abi_binding_artifact_and_module_binding_revision', modules: ['module_binding'], suite: 'lane_1e_conformance.mjs' },
  { lane: '1V', field_group: 'verification_lock', modules: [], suite: 'lane_1v_mutation_lock.mjs' },
];

export function buildTopology() {
  const canonicalFiles = CANONICAL_ROOTS.flatMap(findCanonicalModules).sort();
  const canonicalModIds = new Set(canonicalFiles.map((f) => f.replace(/\\/g, '/').replace(/\.mjs$/, '')));

  const modules = [];
  const rawEdges = [];

  for (const relFile of canonicalFiles) {
    const sourcePath = join(ENGINE, relFile);
    const modId = relFile.replace(/\\/g, '/').replace(/\.mjs$/, '');
    const src = readFileSync(sourcePath, 'utf8');

    const exported = [...src.matchAll(/^export\s+(?:const|function|class)\s+([A-Za-z_][A-Za-z_0-9]*)/gm)].map((m) => m[1]);
    const reExported = [...src.matchAll(/^export\s*\{([^}]*)\}\s*from/gm)]
      .flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean));

    const allExports = [...new Set([...exported, ...reExported])].sort();

    modules.push({
      module: modId,
      area: modId.split('/')[0],
      exports: allExports,
      export_count: allExports.length,
      line_count: src.split('\n').length,
    });

    const specifiers = extractStaticImportSpecifiers(src);
    for (const spec of specifiers) {
      const targetAbs = resolve(dirname(sourcePath), spec);
      const targetRel = relative(ENGINE, targetAbs).replace(/\\/g, '/');

      if (isAbsolute(targetRel) || targetRel.startsWith('..')) continue;

      const targetModId = targetRel.replace(/\.mjs$/, '');
      if (canonicalModIds.has(targetModId) && targetModId !== modId) {
        rawEdges.push({
          from: modId,
          to: targetModId,
          relation: 'imports',
          receipt_channel: 'module_load_observation',
          evidence_note: 'declared by canonical source; traversal requires a receipt from an observed run',
        });
      }
    }
  }

  modules.sort((a, b) => a.module.localeCompare(b.module));

  // Deduplicate edges stably
  const edges = [];
  const seenEdges = new Set();
  for (const e of rawEdges) {
    const key = `${e.from}->${e.to}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      edges.push(e);
    }
  }
  edges.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to));

  const topology = {
    topology_version: 'engine_topology.v0',
    engine_root: 'guild_hall/engineering_engine',
    contract_revision: cfg.CONTRACT_REVISION,
    derivation: {
      module_edges: `parsed from import statements across canonical ${CANONICAL_ROOTS.join(', ')}`,
      areas_covered: CANONICAL_ROOTS,
      areas_deliberately_excluded: [
        { area: 'kernel', reason: 'legacy_compatibility_wrappers_excluded_from_canonical_topology' },
        { area: 'assembly', reason: 'legacy_compatibility_wrappers_excluded_from_canonical_topology' },
        { area: 'stage_rules', reason: 'legacy_compatibility_wrappers_excluded_from_canonical_topology' },
        { area: 'subjects', reason: 'legacy_compatibility_wrappers_excluded_from_canonical_topology' },
        { area: 'observation', reason: 'legacy_compatibility_wrappers_excluded_from_canonical_topology' },
        { area: 'guidance', reason: 'legacy_compatibility_wrappers_excluded_from_canonical_topology' },
        { area: 'evaluation', reason: 'legacy_compatibility_wrappers_excluded_from_canonical_topology' },
        { area: 'mcp', reason: 'legacy_compatibility_wrappers_excluded_from_canonical_topology' },
        { area: 'fixtures', reason: 'legacy_compatibility_wrappers_excluded_from_canonical_topology' },
        { area: 'tools', reason: 'cli_entry_points_not_judgement_structure' },
        { area: 'tests', reason: 'test_suites_excluded_from_canonical_topology' },
      ],
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
    },

    task_driver_stage: pipeline.P7,
  };

  const { topology_digest: _omitted, ...rest } = topology;
  topology.topology_digest = createHash('sha256').update(stableStringify(rest)).digest('hex');
  return topology;
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const flagValue = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
    throw new Error(`engine_topology_${name.slice(2)}_path_missing`);
  }
  return value;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const out = flagValue('--out');
  const check = flagValue('--check');
  if (out !== null && check !== null) throw new Error('engine_topology_output_mode_conflict');

  const topology = buildTopology();
  const text = `${JSON.stringify(topology, null, 2)}\n`;

  if (check !== null) {
    const matches = readFileSync(check, 'utf8') === text;
    console.log(JSON.stringify({
      checked: check,
      topology_matches_code: matches,
      modules: topology.module_count,
      module_edges: topology.module_edge_count,
      topology_digest: topology.topology_digest,
    }, null, 2));
    if (!matches) process.exitCode = 1;
  } else if (out !== null) {
    writeFileSync(out, text, 'utf8');
    console.log(JSON.stringify({
      emitted: out,
      modules: topology.module_count,
      module_edges: topology.module_edge_count,
      boundaries: topology.serialised_boundaries.length,
      topology_digest: topology.topology_digest,
    }, null, 2));
  } else {
    process.stdout.write(text);
  }
}

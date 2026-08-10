#!/usr/bin/env node
// phase_1_serial_integration — the single command that decides whether Phase 1 holds.
//
// Seven checks, all of which must pass:
//   1. every conformance suite passes
//   2. the mutation lock kills every mutation
//   3. the frozen Phase 1-0 bundle still matches 13/13 by sha256
//   4. every frozen field group has exactly one owning lane
//   5. the committed topology matches a fresh emit from the code
//   6. a real observed run traversed only edges the topology declares
//   7. no suite performed a write
//
// Checks 5 and 6 are the pair that keeps the topology honest, from both directions. 5 catches
// a committed artifact drifting from the source. 6 catches the source drifting from what
// actually runs: if a real execution takes an edge the static parse never found, the "1:1 with
// the code" claim is false and this fails rather than reporting a prettier number.
//
//   node tools/phase_1_integration_check.mjs --oracle <path> --bundle <dir> --scratch <dir>

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const ORACLE = arg('--oracle');
const BUNDLE = arg('--bundle');
const SCRATCH = arg('--scratch');
// The manifest rows are repo-root relative, and the root that matters is the tree the bundle
// actually sits in — which is the primary checkout, because _workspaces is gitignored and so
// absent from a worktree. Resolving these against the engine's own root produced 0/13.
// Read only: nothing here writes outside this engine tree.
const REPO_ROOT = arg('--repo-root') ?? (BUNDLE ? join(BUNDLE, '..', '..', '..', '..') : join(ENGINE, '..', '..'));

if (!ORACLE || !BUNDLE || !SCRATCH) {
  console.error('usage: node tools/phase_1_integration_check.mjs --oracle <path> --bundle <dir> --scratch <dir>');
  process.exit(2);
}

const checks = [];
const fail = (id, detail) => checks.push({ id, ok: false, detail });
const pass = (id, detail) => checks.push({ id, ok: true, detail });

const runNode = (script, args) => spawnSync(process.execPath, [join(ENGINE, 'tests', script), ...args], { encoding: 'utf8' });

// ---------------------------------------------------------------- 1. suites

const SUITES = [
  ['kernel_conformance.mjs', ['--oracle', ORACLE], 'phase_1_0_substrate', 'frozen_independently_reviewed_oracle'],
  ['lane_1a_conformance.mjs', [], '1A', 'author_written_fixtures'],
  ['lane_1b_conformance.mjs', [], '1B', 'author_written_fixtures'],
  ['lane_1c_conformance.mjs', [], '1C', 'author_written_fixtures'],
  ['lane_1d_conformance.mjs', [], '1D', 'author_written_fixtures'],
  ['lane_1e_conformance.mjs', [], '1E', 'author_written_fixtures'],
  ['minting_conformance.mjs', [], 'D-P10-03', 'author_written_fixtures'],
  ['runtime_observation_conformance.mjs', [], 'runtime_observation', 'author_written_fixtures'],
  ['end_to_end_engine_run.mjs', [], 'end_to_end', 'author_written_fixtures'],
  ['output_contract_conformance.mjs', ['--scratch', SCRATCH], 'output_contract', 'author_written_fixtures'],
];

const suiteResults = [];
let totalChecks = 0;
let totalWrites = 0;
for (const [script, args, lane, strength] of SUITES) {
  const r = runNode(script, args);
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch { /* reported below */ }
  const ok = r.status === 0 && parsed && parsed.result === 'PASS';
  suiteResults.push({
    suite: script, lane, verification_strength: strength,
    result: parsed?.result ?? 'UNPARSEABLE',
    pass_count: parsed?.pass_count ?? null, failure_count: parsed?.failure_count ?? null,
    failures: parsed?.failures ?? null,
  });
  if (parsed?.pass_count) totalChecks += parsed.pass_count;
  totalWrites += parsed?.writes_performed ?? 0;
  if (!ok) fail(`suite/${lane}`, `${script} did not pass`);
}
if (suiteResults.every((s) => s.result === 'PASS')) pass('suites', `${suiteResults.length} suites, ${totalChecks} checks`);

// ---------------------------------------------------------------- 2. mutation lock

const ml = spawnSync(process.execPath,
  [join(ENGINE, 'tests', 'lane_1v_mutation_lock.mjs'), '--scratch', SCRATCH, '--oracle', ORACLE], { encoding: 'utf8' });
let mutation = null;
try { mutation = JSON.parse(ml.stdout); } catch { /* reported below */ }
if (ml.status === 0 && mutation?.result === 'PASS') {
  pass('mutation_lock', `${mutation.killed_count}/${mutation.mutation_count} killed across ${mutation.modules_covered_count} modules`);
} else {
  fail('mutation_lock', `survived ${mutation?.survived_count ?? '?'}, catalogue errors ${mutation?.catalogue_error_count ?? '?'}`);
}

// ---------------------------------------------------------------- 3. frozen bundle

const manifestPath = join(BUNDLE, 'phase_1_0_freeze_manifest.sha256');
let bundleRows = 0;
let bundleOk = 0;
const bundleMismatches = [];
if (!existsSync(manifestPath)) {
  fail('frozen_bundle', 'freeze manifest not found');
} else {
  const manifestText = readFileSync(manifestPath, 'utf8');
  // The manifest declares its own path base. That header exists because resolving these rows
  // against the wrong root has now produced false FAILs twice, in opposite directions. It is
  // read rather than assumed, and an absent or unrecognised value fails instead of guessing.
  const declared = /^#\s*path_base:\s*(\S+)\s*$/m.exec(manifestText)?.[1];
  const base = declared === 'bundle-relative' ? BUNDLE
    : declared === 'repo-root-relative' ? REPO_ROOT
      : null;
  if (!base) fail('frozen_bundle', `manifest declares path_base "${declared ?? 'absent'}", which this checker does not recognise`);
  for (const line of base ? manifestText.split('\n') : []) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line.trim());
    if (!m) continue;
    bundleRows += 1;
    const target = join(base, m[2]);
    if (!existsSync(target)) { bundleMismatches.push({ file: m[2], reason: 'absent' }); continue; }
    const got = createHash('sha256').update(readFileSync(target)).digest('hex');
    if (got === m[1]) bundleOk += 1;
    else bundleMismatches.push({ file: m[2], expected: m[1], got });
  }
  if (bundleRows > 0 && bundleOk === bundleRows) pass('frozen_bundle', `${bundleOk}/${bundleRows}`);
  else fail('frozen_bundle', `${bundleOk}/${bundleRows} matched`);
}

// ---------------------------------------------------------------- 4. field group ownership

const topologyPath = join(ENGINE, 'topology', 'engine_topology.json');
let committed = null;
try { committed = JSON.parse(readFileSync(topologyPath, 'utf8')); } catch { /* reported below */ }

const EXPECTED_FIELD_GROUPS = [
  'snapshot_envelope_state_axes_finding_and_pipeline_contract_fields',
  'inventory_custody_eligibility_and_lineage',
  'graph_typed_edge_and_capsule_and_context_capsule_fingerprint',
  'mcp_request_receipt_cas_idempotency',
  'module_abi_binding_artifact_and_module_binding_revision',
  'verification_lock',
];
if (!committed) {
  fail('field_group_ownership', 'topology not readable');
} else {
  const owned = committed.lane_field_groups.map((g) => g.field_group);
  const missing = EXPECTED_FIELD_GROUPS.filter((g) => !owned.includes(g));
  const duplicated = owned.filter((g, i) => owned.indexOf(g) !== i);
  const unexpected = owned.filter((g) => !EXPECTED_FIELD_GROUPS.includes(g));
  if (missing.length || duplicated.length || unexpected.length) {
    fail('field_group_ownership', JSON.stringify({ missing, duplicated, unexpected }));
  } else {
    pass('field_group_ownership', `${owned.length} groups, one owning lane each`);
  }
}

// ---------------------------------------------------------------- 5. topology is not stale

const fresh = spawnSync(process.execPath, [join(ENGINE, 'tools', 'emit_topology.mjs')], { encoding: 'utf8' });
let freshTopology = null;
try { freshTopology = JSON.parse(fresh.stdout); } catch { /* reported below */ }
if (!freshTopology || !committed) {
  fail('topology_matches_code', 'could not compare');
} else if (freshTopology.topology_digest !== committed.topology_digest) {
  fail('topology_matches_code',
    `committed ${committed.topology_digest?.slice(0, 12)} but the code now emits ${freshTopology.topology_digest?.slice(0, 12)}; re-run tools/emit_topology.mjs`);
} else {
  pass('topology_matches_code', `${committed.module_count} modules, ${committed.module_edge_count} import edges, digest ${committed.topology_digest.slice(0, 12)}`);
}

// ---------------------------------------------------------------- 6. runtime observation
// Runs the real surfaces under the load observation hook and compares what was traversed
// against what the source declares. This is the engine's own Expected/Observed comparison
// applied to itself, so the same rule holds: an undeclared traversal is a fault, and an idle
// edge is reported rather than smoothed over.

const obs = spawnSync(process.execPath,
  [join(ENGINE, 'tools', 'observe_engine_run.mjs'), '--oracle', ORACLE], { encoding: 'utf8' });
let observation = null;
try { observation = JSON.parse(obs.stdout); } catch { /* reported below */ }
if (!observation) {
  fail('runtime_observation', 'the observation run produced no readable summary');
} else if (observation.edges.topology_is_one_to_one !== true) {
  fail('runtime_observation',
    `a run traversed edges the topology does not declare: ${observation.edges.observed_not_declared.join(', ')}`);
} else if (observation.surfaces.failing.length > 0) {
  fail('runtime_observation', `surfaces failed under observation: ${observation.surfaces.failing.join(', ')}`);
} else {
  pass('runtime_observation',
    `${observation.edges.coverage} edges traversed, ${observation.surfaces.run} surfaces reported, topology 1:1`);
}

// ---------------------------------------------------------------- 7. no writes

if (totalWrites === 0) pass('no_writes', 'every suite reported zero writes');
else fail('no_writes', `${totalWrites} writes reported`);

// ---------------------------------------------------------------- receipt

const failed = checks.filter((c) => !c.ok);
for (const f of failed) console.error(`FAIL  ${f.id}  ${f.detail}`);

const receipt = {
  receipt: 'phase_1_serial_integration',
  contract_revision: committed?.contract_revision ?? null,
  result: failed.length === 0 ? 'PASS' : 'FAIL',
  checks,
  suites: suiteResults,
  total_conformance_checks: totalChecks,
  mutation_lock: mutation ? {
    result: mutation.result, mutations: mutation.mutation_count, killed: mutation.killed_count,
    survived: mutation.survived_count, catalogue_errors: mutation.catalogue_error_count,
    modules_covered: mutation.modules_covered_count,
    semantic_independence: mutation.semantic_independence,
  } : null,
  frozen_bundle: { matched: bundleOk, rows: bundleRows, mismatches: bundleMismatches },
  runtime_observation: observation ? {
    run_id: observation.run_id,
    surfaces_run: observation.surfaces.run,
    surfaces_without_heartbeat: observation.surfaces.counts.absent,
    edge_coverage: observation.edges.coverage,
    declared_not_exercised: observation.edges.declared_not_exercised,
    observed_not_declared: observation.edges.observed_not_declared,
    topology_is_one_to_one: observation.edges.topology_is_one_to_one,
  } : null,
  topology: committed ? {
    modules: committed.module_count, import_edges: committed.module_edge_count,
    digest: committed.topology_digest, derived_from: committed.derivation,
  } : null,
  verification_strength_by_lane: Object.fromEntries(suiteResults.map((s) => [s.lane, s.verification_strength])),
  honest_limits: [
    'five of six lanes carry author-written fixtures; only the phase_1_0 substrate is judged against the independently reviewed frozen oracle',
    'the mutation lock is self-authored, so a rule wrong identically in code and fixtures survives it',
    'no actual project material, UI, MCP execution, ERP writer or learned model was exercised',
    'a module load observation proves an edge was traversed, not that data was processed',
  ],
  open_owner_decisions: committed?.owner_decisions ?? null,
  writes_performed: totalWrites,
};

console.log(JSON.stringify(receipt, null, 2));
process.exit(failed.length === 0 ? 0 : 1);

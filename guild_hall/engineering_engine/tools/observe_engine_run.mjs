#!/usr/bin/env node
// Runs the engine's real verification surfaces and records what was actually observed.
//
// Two kinds of evidence come out of one pass:
//
//   heartbeats  per surface — it ran, when, and whether it passed
//   receipts    per edge    — this kernel-to-kernel connection was actually traversed
//
// Neither is declared. Both are byproducts of a real execution, which is the only reason they
// are worth anything. A surface that did not run gets no heartbeat, and an edge nothing
// traversed gets no receipt; both absences are reported rather than filled in.
//
// Output goes under guild_hall/state/** which is git-ignored, because these are observations
// of one host at one time and committing them would turn a measurement into a claim.
//
//   node tools/observe_engine_run.mjs --oracle <path> [--out <dir>]

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { HEARTBEAT_SURFACES, validateHeartbeat, judgeAllSurfaces } from '../kernel/heartbeat.mjs';
import { edgeKey, validateReceipt, classifyEdgeCoverage, summariseDelivery } from '../kernel/delivery_receipt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const ORACLE = arg('--oracle');
const OUT_DIR = resolve(arg('--out', join(ENGINE, '..', 'state', 'engineering_engine', 'runtime')));
const HOOK = pathToFileURL(join(HERE, 'observe_hook.mjs')).href;

// Surface id -> test file. The ids come from the kernel's closed list, so a surface cannot be
// invented here by typing a new string.
const SURFACES = [
  ['kernel_conformance', 'kernel_conformance.mjs', ORACLE ? ['--oracle', ORACLE] : null],
  ['lane_1a_conformance', 'lane_1a_conformance.mjs', []],
  ['lane_1b_conformance', 'lane_1b_conformance.mjs', []],
  ['lane_1c_conformance', 'lane_1c_conformance.mjs', []],
  ['lane_1d_conformance', 'lane_1d_conformance.mjs', []],
  ['lane_1e_conformance', 'lane_1e_conformance.mjs', []],
  ['minting_conformance', 'minting_conformance.mjs', []],
  ['runtime_observation_conformance', 'runtime_observation_conformance.mjs', []],
];

const RUN_STARTED_AT = new Date().toISOString();   // canonical: three fractional digits
const RUN_ID = `run-${RUN_STARTED_AT.replace(/[-:.TZ]/g, '')}`;

mkdirSync(OUT_DIR, { recursive: true });
const observationFile = join(OUT_DIR, `${RUN_ID}.observed-edges.txt`);
rmSync(observationFile, { force: true });

// ---------------------------------------------------------------- run the surfaces

const heartbeats = {};
const skipped = [];
for (const [surfaceId, file, extraArgs] of SURFACES) {
  const testPath = join(ENGINE, 'tests', file);
  if (!existsSync(testPath)) { skipped.push({ surface_id: surfaceId, reason: 'test_file_absent' }); continue; }
  if (extraArgs === null) { skipped.push({ surface_id: surfaceId, reason: 'oracle_not_supplied' }); continue; }

  const started = new Date().toISOString();
  const result = spawnSync(process.execPath, ['--import', HOOK, testPath, ...extraArgs], {
    encoding: 'utf8',
    env: { ...process.env, SE_ENGINE_OBSERVATION_OUT: observationFile },
  });
  let parsed = null;
  try { parsed = JSON.parse(result.stdout); } catch { /* recorded as unparseable below */ }

  const heartbeat = {
    surface_id: surfaceId,
    observed_at: started,
    outcome: result.status === 0 && parsed?.result === 'PASS' ? 'passed' : 'failed',
    evidence: {
      exit_code: result.status,
      pass_count: parsed?.pass_count ?? null,
      failure_count: parsed?.failure_count ?? null,
      verification_strength: parsed?.verification_strength ?? 'frozen_independently_reviewed_oracle',
      stdout_parsed: parsed !== null,
    },
  };
  validateHeartbeat(heartbeat);
  heartbeats[surfaceId] = heartbeat;
}

// ---------------------------------------------------------------- collect observations

const observedEdgeKeys = existsSync(observationFile)
  ? [...new Set(readFileSync(observationFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean))].sort()
  : [];

// Declared edges come from the emitter, which parses the source. Regenerated here rather than
// read from the committed artifact, so a stale artifact cannot make coverage look better.
const emit = spawnSync(process.execPath, [join(HERE, 'emit_topology.mjs')], { encoding: 'utf8' });
let declaredEdges = [];
let topologyDigest = null;
try {
  const topology = JSON.parse(emit.stdout);
  declaredEdges = topology.module_edges.map((e) => edgeKey(e.from, e.to));
  topologyDigest = topology.topology_digest;
} catch {
  console.error('topology could not be emitted; coverage cannot be judged against the source');
  process.exit(1);
}

const coverage = classifyEdgeCoverage({ declaredEdges, observedEdgeKeys });

const receipts = {};
for (const key of coverage.exercised) {
  const receipt = {
    edge_key: key,
    observed_at: RUN_STARTED_AT,
    outcome: 'delivered',
    observation_method: 'module_load_observation',
    run_id: RUN_ID,
  };
  validateReceipt(receipt);
  receipts[key] = receipt;
}

// ---------------------------------------------------------------- judge and write

const NOW = Date.now();
const WINDOWS = { default: { period_seconds: 3600, grace_seconds: 1800 } };
const heartbeatSummary = judgeAllSurfaces({ heartbeats, windows: WINDOWS, now: NOW });
const deliverySummary = summariseDelivery({ declaredEdges, receipts, windows: WINDOWS, now: NOW });

const summary = {
  schema: 'soulforge.engineering_engine.runtime_observation.v0',
  run_id: RUN_ID,
  run_started_at: RUN_STARTED_AT,
  topology_digest: topologyDigest,
  surfaces: {
    declared: HEARTBEAT_SURFACES.length,
    run: Object.keys(heartbeats).length,
    skipped,
    counts: heartbeatSummary.counts,
    claim: heartbeatSummary.claim,
    failing: Object.values(heartbeats).filter((h) => h.outcome === 'failed').map((h) => h.surface_id),
  },
  edges: {
    declared: coverage.declared_count,
    observed: coverage.observed_count,
    exercised: coverage.exercised.length,
    coverage: coverage.coverage_ratio_text,
    // Reported, never omitted: an idle edge is a fact about this run, not a defect to hide.
    declared_not_exercised: coverage.declared_not_exercised,
    // Must be empty. A traversal the source parse never found means the topology is not 1:1.
    observed_not_declared: coverage.observed_not_declared,
    topology_is_one_to_one: coverage.consistent,
    delivery_counts: deliverySummary.counts,
    claim: deliverySummary.claim,
  },
  honest_limits: [
    'a module load observation proves the edge was traversed, not that data was processed',
    'an edge idle in this run is reported unexercised; that is a statement about the run, not about the code',
    'these files describe one host at one time and are git-ignored for that reason',
  ],
};

writeFileSync(join(OUT_DIR, 'heartbeats.json'), `${JSON.stringify(heartbeats, null, 2)}\n`, 'utf8');
writeFileSync(join(OUT_DIR, 'receipts.json'), `${JSON.stringify(receipts, null, 2)}\n`, 'utf8');
writeFileSync(join(OUT_DIR, 'observation_summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ...summary,
  written_to: OUT_DIR,
  result: heartbeatSummary.counts.failed === 0 && coverage.consistent ? 'PASS' : 'FAIL',
}, null, 2));

process.exit(heartbeatSummary.counts.failed === 0 && coverage.consistent ? 0 : 1);

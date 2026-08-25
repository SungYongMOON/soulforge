#!/usr/bin/env node
// The engine, assembled and run end to end.
//
// Everything before this file was a pure function with a test. This is the first place they
// are wired into one pass that produces a real Project State Snapshot:
//
//   subject adapter -> Expected / Observed states
//   compare          -> gap per requirement
//   mint             -> a permanent finding_id at the serialised boundary
//   envelope         -> snapshot with a fingerprint that is recomputed, not trusted
//   context request  -> a candidate wherever the evidence was not good enough to judge
//
// Deterministic throughout: no learned model, no network, and no ERP write. P8 is not invoked,
// so every finding and every context request stays a candidate.
//
// The replay property is the one worth watching. Two runs over identical inputs must produce
// the same deterministic_replay_fingerprint while carrying different snapshot_ids, because the
// identifier is minted per snapshot and the fingerprint covers the inputs. That is what makes
// "the same question was asked twice" distinguishable from "the answer changed".
//
//   node tools/run_engine.mjs --observation <summary.json> [--out <dir>] [--json]

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildStates, SUBJECT_ID } from '../evaluator/engine_self_topology.mjs';
import { runEnginePass } from '../../../core/runtime/engine_pass.mjs';
import { resolveOutputRoot } from './output_binding.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, '..');
const arg = (n, fallback) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : fallback; };

const resolvedRoot = resolveOutputRoot({ repoRoot: join(ENGINE, '..', '..') });
if (resolvedRoot.root === null) {
  console.error(`output root unresolved (${resolvedRoot.source}); refusing to guess where the evidence is`);
  process.exit(1);
}
const OBSERVATION = arg('--observation', join(resolvedRoot.root, 'runtime', 'observation_summary.json'));
const OUT_DIR = resolve(arg('--out', join(resolvedRoot.root, 'snapshots')));
const PROJECT_BINDING_REF = arg('--binding-ref', 'pb-engine-self');
const GENERATION = Number(arg('--generation', '1'));

// ---------------------------------------------------------------- inputs

const observation = JSON.parse(readFileSync(OBSERVATION, 'utf8'));
// Receipts are the evidence; the summary only says how much to trust them.
const RECEIPTS = arg('--receipts', join(dirname(OBSERVATION), 'receipts.json'));
const receipts = JSON.parse(readFileSync(RECEIPTS, 'utf8'));

// The topology is regenerated from source rather than read from the committed artifact, so a
// stale file cannot influence a judgement.
const emitted = spawnSync(process.execPath, [join(HERE, 'emit_topology.mjs')], { encoding: 'utf8' });
if (emitted.status !== 0) {
  console.error('topology could not be emitted; refusing to judge against an unknown structure');
  process.exit(1);
}
const topology = JSON.parse(emitted.stdout);

const TAKEN_AT = new Date().toISOString();
const VALID_AT = observation.run_started_at ?? TAKEN_AT;
const KNOWN_AT = TAKEN_AT;

// The freshness window travels with the observation that produced the receipts. Inventing
// one here would let this file decide how old is too old for evidence it did not gather.
const RECEIPT_WINDOW = observation.receipt_window;
if (!RECEIPT_WINDOW) {
  console.error('the observation declares no receipt window; refusing to judge receipts against an invented freshness rule');
  process.exit(1);
}

const states = buildStates({
  topology, receipts, observation,
  validAt: VALID_AT, knownAt: KNOWN_AT,
  window: RECEIPT_WINDOW, now: Date.parse(TAKEN_AT),
});

// ---------------------------------------------------------------- one pass, via the assembly
// The pass itself lives in assembly/engine_pass.mjs so a test can drive it with a controlled
// clock and identifier source. This file is only the shell that does I/O.

const result = runEnginePass({
  states,
  subjectId: SUBJECT_ID,
  projectBindingRef: PROJECT_BINDING_REF,
  generation: GENERATION,
  topologyDigest: topology.topology_digest,
  observationRunId: observation.run_id,
  takenAt: TAKEN_AT,
  validAt: VALID_AT,
  mintValue: randomUUID,
});

const report = {
  schema: 'soulforge.engineering_engine.run_result.v0',
  subject_id: SUBJECT_ID,
  snapshot_id: result.snapshot.snapshot_id,
  deterministic_replay_fingerprint: result.fingerprint,
  taken_at: TAKEN_AT,
  requirements_judged: result.requirements_judged,
  gap_counts: result.gap_counts,
  finding_count: result.findings.length,
  observation_trust: states.trust,
  receipt_verdicts: states.receipt_verdicts,
  context_request: result.contextRequest
    ? { id: result.contextRequest.context_request_id, finding_count: result.contextRequest.finding_ids.length, erp_delta: 0 }
    : null,
  envelope_valid: result.envelope.valid,
  claim_ceiling: result.snapshot.claim_ceiling,
  claim_ceiling_axis: result.envelope.claim_ceiling_axis,
  execution_mode: result.snapshot.execution_mode,
  identifiers_issued: result.identifiers_issued,
  erp_writes: result.erp_writes,
  learned_model_invocations: result.learned_model_invocations,
  honest_limits: [
    'the subject is the engine itself, so this run judged no project material',
    'a finding here is a candidate; nothing was accepted, promoted or written',
    'gap_missing is only reachable when the observation was complete; otherwise the answer is unknown',
  ],
};

mkdirSync(OUT_DIR, { recursive: true });
const id = result.snapshot.snapshot_id;
writeFileSync(join(OUT_DIR, `${id}.snapshot.json`), `${JSON.stringify(result.snapshot, null, 2)}
`, 'utf8');
if (result.contextRequest) {
  writeFileSync(join(OUT_DIR, `${id}.context_request.json`), `${JSON.stringify(result.contextRequest, null, 2)}
`, 'utf8');
}
writeFileSync(join(OUT_DIR, `${id}.run_result.json`), `${JSON.stringify(report, null, 2)}
`, 'utf8');

console.log(JSON.stringify({ ...report, written_to: OUT_DIR }, null, 2));

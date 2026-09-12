// The smallest runner that takes one preparation the whole way through the
// store: prepare -> land as an inactive generation -> read it back -> validate
// the *stored* run against the exact grant -> append the report beside the
// generation. Five steps, in that order, so what is judged is what was stored,
// not what was in memory.
//
// It uses only the exports the APP already has. It writes no current pointer,
// calls no model, opens no database and never reaches an operating project
// folder on its own: the store is whatever io the caller admits, and the
// preparer's own gate still refuses any data class but public_synthetic.
//
// Two ways in. `--synthetic` builds a throwaway estate under os.tmpdir() with
// the repository's public-synthetic fixture, reached through an aliased io from
// a root table, and prints the receipt. Otherwise the caller names a root table
// (the one absolute path), its digest, the binding address and digest, and a
// request; everything after that is an alias address.
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import path from 'node:path';
import os from 'node:os';
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { validatePreparationRun } from '../src/runtime/preparation_validation.mjs';
import { writePreparationGeneration, readPreparationGeneration, appendValidationReport,
  PREPARATION_STORE_BINDING_FILE } from '../src/runtime/preparation_store.mjs';
import { rootedStore, safeStoreRel } from '../src/runtime/pair_store.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readRootTable, ROOT_TABLE_SCHEMA } from '../../path_registry/src/root_table.mjs';

export const PREPARATION_FLOW_SCHEMA = 'soulforge.context_preparation_flow_receipt.v1';
const SHA = /^sha256:[0-9a-f]{64}$/u;
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export class PreparationFlowError extends Error {
  constructor(code) { super(code); this.name = 'PreparationFlowError'; this.code = code; }
}
const fail = code => { throw new PreparationFlowError(code); };

/**
 * Runs the five steps over an already-admitted io (or one synthetic storeRoot)
 * and returns a receipt of refs and digests only - no document text, no host
 * path other than what the caller put in `storeRoot`.
 */
export async function runPreparationFlow({ io = null, storeRoot = null, bindingSha256, bindingAddress = PREPARATION_STORE_BINDING_FILE,
  request, runId, validationRunId, now, clock = () => new Date(now) } = {}) {
  if (io === null && typeof storeRoot !== 'string') fail('preparation_flow_store_required');
  if (!SHA.test(bindingSha256 ?? '') || !safeStoreRel(bindingAddress)) fail('preparation_flow_binding_invalid');
  if (typeof runId !== 'string' || typeof validationRunId !== 'string' || runId === validationRunId) fail('preparation_flow_ids_invalid');
  const reader = io ?? rootedStore(storeRoot);
  const bindingBytes = reader.read(bindingAddress);
  if (digest(bindingBytes) !== bindingSha256) fail('preparation_flow_binding_mismatch');
  const binding = JSON.parse(bindingBytes);
  if (!safeStoreRel(binding?.grant?.path) || !SHA.test(binding?.grant?.sha256 ?? '')) fail('preparation_flow_grant_ref_invalid');
  // The exact grant the binding pins, read back and checked against its digest.
  // The same bytes go to the preparer and, later, to the validator.
  const grantBytes = reader.read(binding.grant.path);
  if (digest(grantBytes) !== binding.grant.sha256) fail('preparation_flow_grant_mismatch');
  const grant = JSON.parse(grantBytes);
  const storeArgs = { io, storeRoot, bindingSha256, bindingAddress, request };

  // 1. prepare (the preparer's own gate refuses real data classes)
  const preparation = await prepareSourceDocuments({ grant, roots: binding.source_roots, now, runId, clock });
  if (!preparation.run) fail('preparation_flow_run_unavailable');
  // 2. land, inactive
  const landed = await writePreparationGeneration({ ...storeArgs, preparation });
  // 3. read back what was stored
  const back = await readPreparationGeneration({ ...storeArgs, generationId: runId });
  if (back.manifest.run.run_sha256 !== preparation.run.run_sha256) fail('preparation_flow_readback_mismatch');
  // 4. validate the stored run against the stored result and the exact grant
  const report = validatePreparationRun({ run: back.manifest.run, preparation: back.preparation, grant,
    validationRunId, checkedAt: clock().toISOString() });
  // 5. append the report beside the generation
  const appended = await appendValidationReport({ ...storeArgs, report });
  if (appended.generation_sha256 !== landed.generation_sha256) fail('preparation_flow_generation_moved');
  return Object.freeze({
    schema_version: PREPARATION_FLOW_SCHEMA,
    io: io ? { kind: 'aliased', table_sha256: io.table_sha256, aliases: io.aliases } : { kind: 'rooted' },
    binding: { address: bindingAddress, sha256: bindingSha256 }, grant: { path: binding.grant.path, sha256: binding.grant.sha256 },
    request: { actor_ref: request.actor_ref, purpose: request.purpose },
    steps: {
      prepare: { run_id: runId, run_sha256: preparation.run.run_sha256, documents: preparation.documents.length,
        coverage: preparation.coverage.counts, preparer: { id: preparation.run.preparer_id, version: preparation.run.preparer_version } },
      land: { status: landed.status, generation_sha256: landed.generation_sha256, template_version: landed.template_version,
        references: landed.references, documents: landed.documents },
      readback: { generation_sha256: back.manifest.generation_sha256, documents: back.documents.length },
      validate: { validation_run_id: validationRunId, outcome: report.outcome, report_sha256: report.report_sha256,
        validator: { id: report.validator_id, version: report.validator_version } },
      append: { status: appended.status, report: appended.report, generation_sha256: appended.generation_sha256 },
    },
    not_done: ['current pointer', 'graph index', 'neo4j', 'real data (preparer gate)'],
  });
}

/**
 * A throwaway estate: the fixture's project tree under `data`, its binding under
 * `control`, a root table beside them, and an aliased io over the table. Returns
 * everything the flow needs plus a cleanup.
 */
export async function makeSyntheticEstate({ fixture, now }) {
  const store = await fixture.makeGraphIndexStore({ writeOperations: ['index', 'prepare'] });
  const estate = await mkdtemp(path.join(os.tmpdir(), 'ctx-flow-estate-'));
  const data = path.join(estate, 'data'), control = path.join(estate, 'control');
  await cp(path.join(store.storeRoot, 'data_root'), data, { recursive: true });
  await mkdir(control, { recursive: true });
  const bindingAddress = 'control_root/project-bindings/synthetic/graph_index_binding.json';
  await mkdir(path.join(control, 'project-bindings', 'synthetic'), { recursive: true });
  await writeFile(path.join(control, 'project-bindings', 'synthetic', 'graph_index_binding.json'),
    await readFile(path.join(store.storeRoot, PREPARATION_STORE_BINDING_FILE)));
  const tablePath = path.join(estate, 'root-table.json');
  const tableBytes = Buffer.from(`${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA, roots: { data_root: data, control_root: control } })}\n`);
  await writeFile(tablePath, tableBytes);
  const io = createAliasedStoreIo(readRootTable({ tablePath, expectedSha256: digest(tableBytes) }));
  const cleanup = async () => {
    for (const dir of [estate, store.storeRoot, store.sourceRoot]) {
      if (path.dirname(dir) !== os.tmpdir()) fail('preparation_flow_cleanup_refused');
      await rm(dir, { recursive: true, force: true });
    }
  };
  return { io, bindingAddress, bindingSha256: store.bindingSha256, request: fixture.indexerRequest(), estate, cleanup, now };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) fail('preparation_flow_usage');
    if (arg === '--synthetic') { options.synthetic = true; continue; }
    options[arg] = argv[index + 1]; index += 1;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const now = options['--now'] ?? new Date().toISOString();
  const runId = options['--run-id'] ?? `flow-${now.replace(/[-:.]/gu, '').slice(0, 15)}`;
  const validationRunId = options['--validation-run-id'] ?? `${runId}-val`;
  if (options.synthetic) {
    const fixture = await import('./fixtures/graph_index_fixture.mjs');
    const estate = await makeSyntheticEstate({ fixture, now });
    try {
      const receipt = await runPreparationFlow({ io: estate.io, bindingAddress: estate.bindingAddress,
        bindingSha256: estate.bindingSha256, request: estate.request, runId, validationRunId, now });
      process.stdout.write(`${JSON.stringify({ mode: 'synthetic', ...receipt })}\n`);
    } finally { await estate.cleanup(); }
    return 0;
  }
  // A named estate: one absolute path in (the root table), aliases after.
  const tablePath = options['--root-table'], tableSha = options['--root-table-sha256'];
  const request = JSON.parse(options['--request-json'] ?? 'null');
  const io = createAliasedStoreIo(readRootTable({ tablePath, expectedSha256: tableSha }));
  const receipt = await runPreparationFlow({ io, bindingAddress: options['--binding-address'],
    bindingSha256: options['--binding-sha256'], request, runId, validationRunId, now });
  process.stdout.write(`${JSON.stringify({ mode: 'estate', ...receipt })}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[preparation-flow] ${error?.code ?? error?.message ?? 'failed'}\n`);
    process.exitCode = 2;
  });
}

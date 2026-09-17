#!/usr/bin/env node
/**
 * Topology v2 check-only CLI.
 *
 *   node topology_v2_cli.mjs check --binding <absolute-path> [--evidence-out <absolute-path>]
 *   node topology_v2_cli.mjs generate --draft <absolute-path> --out <absolute-path>
 *
 * `check` reads the bound resources, builds the preflight_v2 evidence packet
 * and runs the pure judge. It writes nothing outside an optional evidence file
 * and it activates nothing: a green verdict is still `feature_state: off`.
 *
 * `generate` is the author-time leg. It derives the public-safe v2 binding from
 * observed state and writes the completed private binding to `--out`. Freezing
 * that output is what gives every later `check` something to fail against.
 *
 * Neither mode prints an absolute path: the private binding holds the paths and
 * stays on the protected control root.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { evaluateBackupTopologyPreflightV2 } from './preflight_v2.mjs';
import { createTopologyV2ActualPort } from './topology_v2_actual_port.mjs';
import {
  TOPOLOGY_V2_ACTUAL_READER_STATUS,
  TOPOLOGY_V2_PRIVATE_BINDING_SCHEMA,
  TOPOLOGY_V2_RESOURCE_IDS,
  buildTopologyV2Evidence,
  generatePublicBindingV2,
} from './topology_v2_actual_reader.mjs';

const DRAFT_SCHEMA = 'soulforge.backup_controller.topology_v2_private_binding_draft.v0';

function usage() {
  process.stderr.write(
    'usage: node topology_v2_cli.mjs check --binding <absolute-path> [--evidence-out <absolute-path>]\n'
    + '       node topology_v2_cli.mjs generate --draft <absolute-path> --out <absolute-path>\n',
  );
  process.exit(2);
}

function flag(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : (argv[index + 1] ?? null);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function utcMs(date) {
  return `${date.toISOString().slice(0, 19)}.${String(date.getUTCMilliseconds()).padStart(3, '0')}Z`;
}

const [mode, ...argv] = process.argv.slice(2);
const port = createTopologyV2ActualPort();

if (mode === 'check') {
  const bindingPath = flag(argv, '--binding');
  if (bindingPath === null) usage();
  const privateBinding = readJson(bindingPath);
  const clock = {
    now_utc: utcMs(new Date()),
    current_epoch: privateBinding.binding_epoch,
  };
  const read = buildTopologyV2Evidence({ privateBinding, port, clock });
  if (read.status !== TOPOLOGY_V2_ACTUAL_READER_STATUS.EVIDENCE_READY) {
    process.stdout.write(`${JSON.stringify({
      mode: 'check',
      reader_status: read.status,
      reader_holds: read.holds,
      reader_detail: read.detail,
      preflight_status: null,
    }, null, 2)}\n`);
    process.exit(1);
  }
  const verdict = evaluateBackupTopologyPreflightV2(read.evidence);
  const evidenceOut = flag(argv, '--evidence-out');
  if (evidenceOut !== null) {
    writeFileSync(evidenceOut, `${JSON.stringify(read.evidence, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify({
    mode: 'check',
    reader_status: read.status,
    reader_holds: read.holds,
    preflight_status: verdict.status,
    effect: verdict.effect,
    feature_state: verdict.feature_state,
    activation_authority: verdict.activation_authority,
    backup_run_authorized: verdict.backup_run_authorized,
    evaluated_at: verdict.evaluated_at,
    evaluation_epoch: verdict.evaluation_epoch,
    blockers: verdict.blockers,
    topology: verdict.topology,
    inspected_resource_ids: TOPOLOGY_V2_RESOURCE_IDS,
  }, null, 2)}\n`);
  process.exit(verdict.status === 'PREFLIGHT_OFF_READY' ? 0 : 1);
} else if (mode === 'generate') {
  const draftPath = flag(argv, '--draft');
  const outPath = flag(argv, '--out');
  if (draftPath === null || outPath === null) usage();
  const draft = readJson(draftPath);
  if (draft.schema_version !== DRAFT_SCHEMA) {
    process.stderr.write(`draft schema must be ${DRAFT_SCHEMA}\n`);
    process.exit(2);
  }
  const skeleton = {
    schema_version: TOPOLOGY_V2_PRIVATE_BINDING_SCHEMA,
    binding_epoch: draft.binding_epoch,
    evaluation_ref: draft.evaluation_ref,
    clock_ref: draft.clock_ref,
    receipt_ref: draft.receipt_ref,
    inspection_refs: draft.inspection_refs,
    installed_pack: draft.installed_pack,
    resources: draft.resources,
    public_binding: null,
  };
  const publicBinding = generatePublicBindingV2({
    privateBinding: skeleton,
    port,
    refs: draft.refs,
    packDigest: draft.installed_pack_digest,
  });
  if (publicBinding === null) {
    process.stderr.write('public binding generation refused: unreadable resource, pack or refs\n');
    process.exit(1);
  }
  skeleton.public_binding = publicBinding;
  writeFileSync(outPath, `${JSON.stringify(skeleton, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    mode: 'generate',
    binding_ref: publicBinding.binding_ref,
    binding_digest: publicBinding.binding_digest,
    binding_epoch: publicBinding.binding_epoch,
    installed_pack_ref: publicBinding.installed_controller.installed_pack_ref,
    installed_pack_digest: publicBinding.installed_controller.installed_pack_digest,
    resource_count: TOPOLOGY_V2_RESOURCE_IDS.length,
  }, null, 2)}\n`);
} else {
  usage();
}

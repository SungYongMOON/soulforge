#!/usr/bin/env node
// Exact isolated installation copy. No server registration, Pack or live apply.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readRuntimeBytes, runtimeOrdinary, runtimeInside, runtimeHash, runtimeCheck as check } from './feedback_runtime_io.mjs';
export const READBOX_STAGE_FILES = Object.freeze([
  'guild_hall/dev_worker/feedback_readbox.mjs', 'guild_hall/dev_worker/feedback_dispatch.mjs',
  'guild_hall/dev_worker/feedback_readbox_cli.mjs', 'guild_hall/dev_worker/feedback_readbox_stage.mjs',
  'guild_hall/dev_worker/feedback_runtime_io.mjs', 'guild_hall/dev_worker/feedback_buzz_bridge.py',
  'guild_hall/dev_worker/feedback_buzz_bridge_install.py',
  'guild_hall/codex_work_directory/directory.mjs',
  'guild_hall/codex_work_directory/schema/route_catalog.v1.schema.json',
  'guild_hall/codex_work_directory/schema/live_bindings.v1.schema.json',
  'ui-workspace/apps/dev-erp/src/feedback_readbox_http.mjs',
  'ui-workspace/apps/dev-erp/src/feedback_readbox_view.mjs',
]);
export async function stageFeedbackReadbox({ sourceRoot, targetRoot }) {
  await runtimeOrdinary(sourceRoot, true); await runtimeOrdinary(targetRoot, true);
  check(!runtimeInside(sourceRoot, targetRoot) && !runtimeInside(targetRoot, sourceRoot), 'READBOX_STAGE_OVERLAP');
  check(!path.resolve(targetRoot).split(path.sep).some(p => ['_workmeta', '_workspaces', 'private-state', '.git'].includes(p.toLowerCase())), 'READBOX_STAGE_FORBIDDEN');
  for (let parent = path.resolve(targetRoot); ; parent = path.dirname(parent)) {
    check(!await fs.lstat(path.join(parent, '.git')).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; }), 'READBOX_STAGE_REPOSITORY');
    if (path.dirname(parent) === parent) break;
  }
  check((await fs.readdir(targetRoot)).length === 0, 'READBOX_STAGE_NOT_EMPTY');
  const manifest = { version: 1, kind: 'feedback_readbox_isolated_candidate', operational_activation: false, files: [] };
  for (const relative of READBOX_STAGE_FILES) {
    const bytes = await readRuntimeBytes(path.join(sourceRoot, relative), null, 2000000), target = path.join(targetRoot, relative);
    await fs.mkdir(path.dirname(target), { recursive: true }); await runtimeOrdinary(path.dirname(target), true);
    const handle = await fs.open(target, 'wx', 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await readRuntimeBytes(target, runtimeHash(bytes), 2000000);
    manifest.files.push({ path: relative, sha256: runtimeHash(bytes), bytes: bytes.length });
  }
  await fs.writeFile(path.join(targetRoot, 'feedback-readbox-stage.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error('usage');
    const result = await stageFeedbackReadbox({ sourceRoot: process.argv[2], targetRoot: process.argv[3] });
    process.stdout.write(`${JSON.stringify({ status: 'STAGED', files: result.files.length, operational_activation: false })}\n`);
  } catch { process.stdout.write('{"status":"HELD"}\n'); process.exitCode = 1; }
}

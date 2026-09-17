import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PINNED = new URL('../algorithms/preparation/pinned_pdf_v1.mjs', import.meta.url);
const WORKER = new URL('../../rag/project_document_extract.py', import.meta.url);
const FAKE_INGEST = `
let start;
let finish;
export const started = new Promise(resolve => { start = resolve; });
const released = new Promise(resolve => { finish = resolve; });
export const release = () => finish();
export async function extractProjectPdfCandidate() {
  start();
  await released;
  return Object.freeze({ status: 'candidate' });
}
`;

async function isolatedPinnedModule() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-pdf-worker-guard-'));
  const preparationDir = path.join(root, 'guild_hall', 'context_engine', 'algorithms', 'preparation');
  const ragDir = path.join(root, 'guild_hall', 'rag');
  await mkdir(preparationDir, { recursive: true });
  await mkdir(ragDir, { recursive: true });
  const pinnedPath = path.join(preparationDir, 'pinned_pdf_v1.mjs');
  const workerPath = path.join(ragDir, 'project_document_extract.py');
  const ingestPath = path.join(ragDir, 'project_document_ingest.mjs');
  await copyFile(PINNED, pinnedPath);
  await copyFile(WORKER, workerPath);
  await writeFile(ingestPath, FAKE_INGEST);
  const fake = await import(pathToFileURL(ingestPath).href);
  const pinned = await import(pathToFileURL(pinnedPath).href);
  return { fake, pinned, workerPath };
}

test('a fixed PDF worker changed before launch is refused from an isolated copy', async () => {
  const { pinned, workerPath } = await isolatedPinnedModule();
  await writeFile(workerPath, `${await readFile(workerPath, 'utf8')}\n# changed before launch\n`);
  await assert.rejects(pinned.preparePinnedPdfCandidate({}, {}), { code: 'pdf_preparation_worker_changed' });
});

test('a fixed PDF worker changed while parsing is refused after the parser returns', async () => {
  const { fake, pinned, workerPath } = await isolatedPinnedModule();
  const pending = pinned.preparePinnedPdfCandidate({}, {});
  await fake.started;
  await writeFile(workerPath, `${await readFile(workerPath, 'utf8')}\n# changed during parse\n`);
  fake.release();
  await assert.rejects(pending, { code: 'pdf_preparation_worker_changed' });
});

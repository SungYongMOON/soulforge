// Explicit approved byte pin and trusted extraction configuration; no writer.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extractProjectPdfCandidate } from '../../../rag/project_document_ingest.mjs';

export const PREPARATION_PROFILE = 'pdfplumber-tables-v1';
const WORKER_URL = new URL('../../../rag/project_document_extract.py', import.meta.url);
const workerSha256 = () => `sha256:${createHash('sha256').update(readFileSync(WORKER_URL)).digest('hex')}`;
// The JavaScript closure walker cannot see the fixed Python worker referenced by
// project_document_ingest.mjs. Carry its bytes into every prepared document's
// derivation identity instead of letting a worker change inherit an old doc key.
export const PREPARATION_WORKER_SHA256 = workerSha256();

const assertWorkerUnchanged = () => {
  try {
    if (workerSha256() === PREPARATION_WORKER_SHA256) return;
  } catch { /* a missing or unreadable fixed worker is the same closed failure */ }
  const error = new Error('pdf_preparation_worker_changed');
  error.code = 'pdf_preparation_worker_changed';
  throw error;
};

export async function preparePinnedPdfCandidate(request, trustedOptions) {
  // Shared ingest owns request, hash, process and output validation. Requiring
  // explicit options prevents its legacy default parser from being selected.
  assertWorkerUnchanged();
  const candidate = await extractProjectPdfCandidate(request, trustedOptions === undefined ? null : trustedOptions);
  assertWorkerUnchanged();
  return candidate;
}

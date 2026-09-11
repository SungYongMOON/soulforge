// Explicit approved byte pin and trusted extraction configuration; no writer.
import { extractProjectPdfCandidate } from '../../../rag/project_document_ingest.mjs';

export const PREPARATION_PROFILE = 'pdfplumber-tables-v1';

export function preparePinnedPdfCandidate(request, trustedOptions) {
  // Shared ingest owns request, hash, process and output validation. Requiring
  // explicit options prevents its legacy default parser from being selected.
  return extractProjectPdfCandidate(request, trustedOptions === undefined ? null : trustedOptions);
}

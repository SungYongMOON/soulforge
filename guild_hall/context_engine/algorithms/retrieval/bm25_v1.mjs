import { searchSourceTextCorpus } from '../../../rag/source_text_index.mjs';

export const RETRIEVAL_PROFILE = 'bm25-v1';

// Sources have already passed runtime admission. This adapter only ranks them.
export function retrieveAdmittedDocuments(queryText, sources) {
  return searchSourceTextCorpus({ queryText, advisoryTerms: [], sources,
    maxEvidence: 12, maxPerSource: 12 });
}

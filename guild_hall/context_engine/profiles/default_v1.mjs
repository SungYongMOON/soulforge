// First composition: actual default behavior retained. No strategy selection
// grants scope, acceptance, source access, publication or a larger budget.
export const DEFAULT_CONTEXT_PROFILE = Object.freeze({
  profile_id: 'context-engine/default-v1',
  profile_version: '0.1.0',
  preparation: 'pdfplumber-tables-v1',
  representation: 'accepted-typed-v1',
  retrieval: 'bm25-v1',
  memory: 'ranked-decision-v1',
  assembly: 'bounded-pack-v1',
});

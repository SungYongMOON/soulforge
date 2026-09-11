export const MEMORY_PROFILE = 'ranked-decision-v1';
export const RELATED_MEMORY_PROFILE = 'related-evidence-v2';
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const priority = Object.freeze({ correction: 0, decision: 1, constraint: 2, fact: 3,
  commitment: 4, procedure: 5, failure: 6, success: 7, preference: 8 });

export function compareMemoryCandidates(a, b) {
  return priority[a.record.kind] - priority[b.record.kind] || compare(a.record.id, b.record.id);
}

// Pure ordering only: endpoints must already belong to the authorized set.
export function orderMemoryCandidates(candidates, profile = MEMORY_PROFILE) {
  if (profile === MEMORY_PROFILE) return [...candidates].sort(compareMemoryCandidates);
  if (profile !== RELATED_MEMORY_PROFILE) throw new Error('unsupported memory profile');
  const ids = new Set(candidates.map(c => c.record.id));
  const related = new Set();
  for (const { record } of candidates) for (const relation of record.relations) {
    if (['depends_on', 'same_result'].includes(relation.kind) && ids.has(relation.target)) {
      related.add(record.id); related.add(relation.target);
    }
  }
  return [...candidates].sort((a, b) => Number(related.has(b.record.id)) - Number(related.has(a.record.id))
    || compareMemoryCandidates(a, b));
}

export function compareRecallSources(a, b, retrieval) {
  return Number(b.correction_state !== 'original') - Number(a.correction_state !== 'original')
    || (retrieval ? (retrieval.source_span_order.indexOf(a.source_span_ref) < 0 ? 999 : retrieval.source_span_order.indexOf(a.source_span_ref))
      - (retrieval.source_span_order.indexOf(b.source_span_ref) < 0 ? 999 : retrieval.source_span_order.indexOf(b.source_span_ref)) : 0)
    || compare(a.source_span_ref, b.source_span_ref);
}

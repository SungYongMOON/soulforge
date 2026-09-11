export const ASSEMBLY_PROFILE = 'bounded-pack-v1';

// Pure presentation of admitted, budget-selected evidence. Runtime supplies
// use_state after its conflict/currentness checks and owns all final caps.
export function assembleAcceptedEvidence(picked, applicability, useStates) {
  const result = { facts: [], evidence: [] };
  for (const { record, hit, proof, documentProof } of picked) {
    const { relations, purposes, task_ref, ...fact } = record;
    result.facts.push({ ...fact, evidence_id: record.id, applicability,
      use_state: useStates.get(record.id) });
    if (documentProof) {
      result.document_generations ||= [];
      let generation = result.document_generations.findIndex(d => d.source_span_ref === hit.source_span_ref);
      if (generation < 0) {
        generation = result.document_generations.length;
        result.document_generations.push({ source_span_ref: hit.source_span_ref,
          source_revision_ref: hit.source_revision_ref, context_unit_ref: hit.context_unit_ref,
          context_event_ref: hit.context_event_ref, context_branch_ref: hit.context_branch_ref,
          extraction_digest: documentProof.extraction_digest, index_digest: documentProof.index_digest });
      }
      result.evidence.push({ id: record.id, document_generation: generation, locator: documentProof.locator,
        page: documentProof.page, bbox: documentProof.bbox, coordinate_system: 'top-left-points-decimal',
        status: proof.status, ...(documentProof.table ? { table: documentProof.table } : {}) });
    } else result.evidence.push({ id: record.id, source_span_ref: hit.source_span_ref,
      source_revision_ref: hit.source_revision_ref, locator: proof.locator,
      context_unit_ref: hit.context_unit_ref, context_event_ref: hit.context_event_ref,
      context_branch_ref: hit.context_branch_ref, status: proof.status });
  }
  return result;
}

// Two bounded compositions share source/acceptance/IO/budget guards.
const common={producer_id:'accepted-snapshot-generation-v1',parser:'pdfplumber-tables-v1',
  assembly:'bounded-pack-v1',harness_revision:'context-comparison/1'};
export const UPDATE_PROFILES=Object.freeze({
  'decision-v1':Object.freeze({...common,profile_id:'decision-v1',chunking:'paragraph-v1',
    representation:'accepted-locations-v1',traversal:'source-order-v1',memory:'ranked-decision-v1'}),
  'relation-v2':Object.freeze({...common,profile_id:'relation-v2',chunking:'paragraph-table-v2',
    representation:'accepted-member-links-v2',traversal:'bounded-related-records-v2',memory:'related-evidence-v2'}),
});

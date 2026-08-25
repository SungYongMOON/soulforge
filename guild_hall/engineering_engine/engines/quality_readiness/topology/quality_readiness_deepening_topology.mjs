// Domain-local topology declaration only. Global engine release/topology/Watchtower enrollment is
// intentionally deferred to the integration request and remains outside this E01 package.
export const QUALITY_READINESS_DEEPENING_TOPOLOGY_SCHEMA = 'soulforge.quality_readiness.local_topology.v0';

export const QUALITY_READINESS_DEEPENING_TOPOLOGY = Object.freeze({
  schema_version: QUALITY_READINESS_DEEPENING_TOPOLOGY_SCHEMA,
  domain_engine_id: 'quality_readiness',
  status: 'candidate_local_only',
  source_derivation: 'engines/quality_readiness/source/quality_readiness_source_derivation.mjs',
  rag_boundary: 'engines/quality_readiness/rag/quality_readiness_rag_boundary.mjs',
  typed_facts: 'engines/quality_readiness/binding/quality_readiness_typed_facts.mjs',
  observation: 'engines/quality_readiness/observation/quality_readiness_observation.mjs',
  guidance: 'engines/quality_readiness/guidance/quality_readiness_guidance.mjs',
  mcp_read_tools: 'engines/quality_readiness/mcp/quality_readiness_read_tools.mjs',
  public_synthetic_runner: 'engines/quality_readiness/tools/quality_readiness_runner.mjs --deepening',
  global_registration: false,
  writer_enabled: false,
  effects: Object.freeze({
    filesystem_reads: 0,
    filesystem_writes: 0,
    network_calls: 0,
    model_calls: 0,
    rag_calls: 0,
  }),
});

export function getQualityReadinessDeepeningTopology() {
  return QUALITY_READINESS_DEEPENING_TOPOLOGY;
}

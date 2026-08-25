#!/usr/bin/env node
// Public-synthetic E01 demonstration runner. It reads no files and writes only deterministic JSON
// to stdout; the module receipt declares every external-effect counter as zero.
import { buildQualityReadinessPublicSyntheticRequest } from '../fixtures/quality_readiness_public_synthetic.mjs';
import { assessQualityReadiness } from '../evaluator/quality_readiness.mjs';
import {
  buildQualityReadinessDeepeningPublicSynthetic,
  qualityReadinessSyntheticRef,
  QUALITY_READINESS_DEEPENING_SYNTHETIC_INSTANT,
} from '../fixtures/quality_readiness_deepening_public_synthetic.mjs';
import { evaluate } from '../../../core/interfaces/domain_engine_adapter.mjs';
import { qualityReadinessAdapter } from '../evaluator/quality_readiness_evaluator_adapter.mjs';
import { retrieveQualityReadinessAdvisoryEvidence } from '../rag/quality_readiness_rag_boundary.mjs';
import { projectQualityReadinessObservations } from '../observation/quality_readiness_observation.mjs';
import { buildQualityReadinessGuidance } from '../guidance/quality_readiness_guidance.mjs';
import { callQualityReadinessReadTool } from '../mcp/quality_readiness_read_tools.mjs';

export function runQualityReadinessPublicSynthetic(mode = 'base') {
  if (mode === 'base') return assessQualityReadiness(buildQualityReadinessPublicSyntheticRequest());
  if (mode !== 'deepening') throw new Error('quality readiness runner supports only "base" or "deepening" public-synthetic modes');
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  const assessment = evaluate(qualityReadinessAdapter, fixture.assembly, fixture.typed_facts, {});
  const rag = retrieveQualityReadinessAdvisoryEvidence({
    packet: fixture.rag_packet,
    query: {
      query_id: 'qr_public_synthetic_runner',
      topic_tags: ['quality'],
      source_packet_sha256: fixture.rag_packet.packet_sha256,
    },
  });
  const observation = projectQualityReadinessObservations({
    typed_facts: fixture.typed_facts,
    assessment_run: assessment,
    observation_run_ref: qualityReadinessSyntheticRef('qr-public-synthetic-observation-run', 'r1', '8'),
    known_at: QUALITY_READINESS_DEEPENING_SYNTHETIC_INSTANT,
  });
  const guidance = buildQualityReadinessGuidance({
    assessment_run: assessment,
    observation_projection: observation,
  });
  return {
    schema_version: 'soulforge.quality_readiness.public_synthetic_deepening_run.v0',
    assessment,
    rag,
    observation,
    guidance,
    mcp_preview: callQualityReadinessReadTool({ name: 'guidance_next_steps', input: { guidance } }),
    effects: {
      filesystem_reads: 0,
      filesystem_writes: 0,
      network_calls: 0,
      model_calls: 0,
      rag_calls: 0,
    },
  };
}

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--deepening')) {
  throw new Error('usage: quality_readiness_runner.mjs [--deepening]');
}
const result = runQualityReadinessPublicSynthetic(args[0] === '--deepening' ? 'deepening' : 'base');
process.stdout.write(`${JSON.stringify(result)}\n`);

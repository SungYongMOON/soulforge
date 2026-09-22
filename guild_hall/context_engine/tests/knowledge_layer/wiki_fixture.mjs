import { createBoundedGenerator, createMemoryArchive, createMemoryGraph, createWikiKnowledgeLayer } from '../../src/knowledge_layer/index.mjs';
import { syntheticRequest } from './fixtures.mjs';
export const BUDGET = { max_calls: 1, max_input_characters: 12000, max_output_characters: 12000, timeout_ms: 1000 };
export const extractiveFake = input => ({ candidates: input.units.map(u => {
  const quote = u.text.split('\n').slice(1).join(' ') || u.text;
  return { statement_id: 'statement:' + u.unit_id, unit_id: u.unit_id, text: quote, quote, impact_kinds: [], claim: null };
}) });
export const wikiInput = (project = 'SYN-A') => ({ request: syntheticRequest(project), withdrawals: [], expected_previous: null });
export function wikiFixture({ graph = createMemoryGraph(), archive = createMemoryArchive(), generate = extractiveFake,
  budget = BUDGET, enabled = true } = {}) {
  let calls = 0;
  const generator = createBoundedGenerator({ enabled, id: 'synthetic-generator-v1', budget,
    generate: (...args) => { calls++; return generate(...args); } });
  return { graph, archive, generator, calls: () => calls, layer: createWikiKnowledgeLayer({ graph, archive, generator }) };
}

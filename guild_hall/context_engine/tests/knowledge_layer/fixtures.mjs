import { readCorpus } from '../../harness/knowledge_layer_eval.mjs';
import { hashText } from '../../src/knowledge_layer/data.mjs';
export const NOW = '2026-09-22T00:00:00.000Z';
export function syntheticRequest(project = 'SYN-A') {
  const units = readCorpus().units.filter(u => u.project_ref === project).map(u => ({ ...u,
    source_revision_ref: { entity_id: 'source:' + u.unit_id, revision_id: 'revision:1', content_id: hashText(u.text), content_hash_alg: 'sha256' },
    text_sha256: hashText(u.text), occurred_at: '2026-09-21T00:00:00.000Z', known_at: NOW }));
  return { project_ref: project, units, now: NOW, grant: { project_ref: project, grant_id: 'grant:synthetic', epoch: 1,
    expires_at: '2026-09-23T00:00:00.000Z', units: units.map(u => ({ unit_id: u.unit_id, source_revision_ref: u.source_revision_ref, locator: u.locator, text_sha256: u.text_sha256 })) } };
}

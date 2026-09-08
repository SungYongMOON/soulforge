import { validateWorkIntakeDocuments } from '../src/work_intake_documents.mjs';
import { hashWorkIntakeFacts, runWorkIntake } from '../src/work_intake_adapter.mjs';

export const START = '2026-09-08T00:00:00.000Z';
export const END = '2026-09-08T01:00:00.000Z';
export function syntheticInput(runId = 'run:1') {
  const manifest = ['authority_policy', 'intake_policy'].map((role) => ({
    document_ref: `doc:${role}`, document_role: role, required_for: ['hourly_intake'],
    applicable_actions: ['hourly_intake'], revision_policy: { mode: 'exact', revisions: ['v1'] },
    required_sections: ['scope'], authority_ref: `auth:${role}`,
  }));
  const facts = [{ fact_ref: 'ev:fact1', text: 'Synthetic request: draft a review checklist.' }];
  return {
    run_id: runId, provenance: 'synthetic', project_ref: 'P01', window: { start: START, end: END },
    observed_at: END, permission_refs: ['perm:gmail', 'perm:linear'],
    source_reads: ['gmail', 'linear'].map((source) => ({ source, scope_ref: `scope:${source}`,
      status: source === 'gmail' ? 'read' : 'empty', window: { start: START, end: END },
      cursor_before: null, cursor_after: 'cursor:1', observed_at: END,
      permission_ref: `perm:${source}`, evidence_refs: [`read:${source}`] })),
    events: [{ source: 'gmail', scope_ref: 'scope:gmail', event_ref: 'event:1', revision_ref: 'ev:revision1',
      revision_sha256: 'a'.repeat(64), occurred_at: '2026-09-08T00:55:00.000Z',
      observed_at: '2026-09-08T00:55:00.000Z', project_ref: 'P01', project_binding_ref: 'ev:binding',
      revision_state: 'current', parse_state: 'parsed', evidence_refs: ['ev:revision1', 'ev:binding', 'ev:fact1'],
      facts, facts_sha256: hashWorkIntakeFacts(facts), correction: null }],
    linear_view: { scope_ref: 'scope:linear', as_of: END, status: 'current', coverage: 'complete', evidence_refs: ['read:linear'], tasks: [] },
    echo_receipts: [],
    document_validation: validateWorkIntakeDocuments({ action: 'hourly_intake', manifest,
      documents: manifest.map((m) => ({ document_ref: m.document_ref, revision: 'v1', sections: ['scope'], authority_ref: m.authority_ref, read_status: 'read' })) }),
  };
}
export function scriptedJudge(overrides = {}) {
  return async (request) => ({ classification: 'NEW', reason_code: 'NEW_REQUEST', matched_task_ref: null,
    task_semantic_sha256: 'b'.repeat(64), action_semantic_sha256: 'c'.repeat(64),
    evidence_refs: [...request.event.evidence_refs], model_receipt: { kind: 'scripted', model_ref: 'SCRIPTED_SYNTHETIC',
      receipt_ref: 'judge:1', input_sha256: request.input_sha256, prompt_sha256_ref: 'd'.repeat(64) }, ...overrides });
}
export const syntheticResult = (input = syntheticInput(), overrides = {}) => runWorkIntake(input, { judge: scriptedJudge(overrides) });
export const eventAttempt = (result) => result.attempts.find((a) => a.kind === 'event');

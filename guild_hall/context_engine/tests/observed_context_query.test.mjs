import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createObservedContextQuery } from '../src/runtime/observed_context_query.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
const coverage = { mail: { selected: 1, body_read: 0, existing_folder_frame: 1, existing_folder_selected: 1, existing_folder_review_pending: 0, existing_folder_auto: 0, selected_outside_folder: 0 },
  legacy: { sources: 0, review_pending: 1 }, documents: { inventory_rows: 0, directory_rows: 0, registered_file_metadata: 0, admitted_content: 0 },
  plaud: { index_records: 0, exact_project_spans: 0, body_read: 0 }, linear: { candidate_records: 0, verified_project_mappings: 0, current_issue_reads: 0 } };
test('observed evidence remains distinct from accepted facts; same input is deterministic', async () => {
  const task = hash('owner-read-grant'), row = { id: hash('record'), project_code: 'SYN', source_revision_sha256: hash('source'), input_file_sha256: hash('file'),
    source_ref: 'sha256:' + hash('locator'), kind: 'legacy_review_pending', claim_state: 'review_pending', text: 'Synthetic prior decision proposal', section: 'decision_candidates', known_at: '2026-01-01', locator: 'csv:review_id:'+hash('review') };
  const corpus = { project_code: 'SYN', task_authority_sha256: task, input_packet_sha256: hash('input'), known_at: '2026-01-01', source_coverage: coverage,
    coverage_audit_ref: 'sha256:'+hash('audit'), records: [row], gaps: ['ACCEPTED_GENERATION_NOT_CREATED'] };
  const bytes = Buffer.from(JSON.stringify(corpus));
  const binding = { actor_ref: 'actor:synthetic', project_code: 'SYN', task_authority_sha256: task, corpus_sha256: hash(bytes), input_packet_sha256: hash('input'), allowed_source_refs: [row.source_ref] };
  const authority = { ...binding, active: true };
  const reader = createObservedContextQuery({ binding, loadCorpus: async () => bytes, authoritySnapshot: () => authority });
  const request = { ...binding, purpose: 'review_observed_sources', scope: 'project', query: 'decision' };
  const first = await reader.query(request), second = await reader.query(request);
  assert.equal(first.status, 'OBSERVED_CONTEXT'); assert.equal(first.accepted_generation_ref, null);
  assert.equal(first.decision_candidates[0].claim_state, 'review_pending'); assert.equal(first.digest, second.digest);
  for (const mutate of [c=>{c.records[0].extra='must not flow';},c=>{c.records[0].project_code='FOREIGN';},c=>{c.gaps=['untrusted raw gap'];},c=>{c.records[0].locator='file:'+'///private';}]) {
    const changed=structuredClone(corpus);mutate(changed);const changedBytes=Buffer.from(JSON.stringify(changed));
    const bad=createObservedContextQuery({binding:{...binding,corpus_sha256:hash(changedBytes)},loadCorpus:async()=>changedBytes,authoritySnapshot:()=>authority});
    assert.equal((await bad.query(request)).status,'NOT_AVAILABLE');
  }
  assert.equal((await reader.query({...request,scope:'common'})).status,'NOT_AVAILABLE');
  authority.active = false; assert.equal((await reader.query(request)).status, 'NOT_AVAILABLE');
});
test('wrong purpose/actor and corpus drift are denied', async () => {
  const binding = { actor_ref: 'actor:a', project_code: 'SYN', task_authority_sha256: hash('task'), corpus_sha256: hash('expected'), input_packet_sha256: hash('input'), allowed_source_refs: [] };
  let reads = 0;
  const reader = createObservedContextQuery({ binding, loadCorpus: async () => { reads++; return Buffer.from('changed'); }, authoritySnapshot: () => ({ ...binding, active: true }) });
  assert.equal((await reader.query({ ...binding, purpose: 'accept', query: '' })).status, 'NOT_AVAILABLE'); assert.equal(reads, 0);
  assert.equal((await reader.query({ ...binding, purpose: 'review_observed_sources', scope: 'project', query: '' })).status, 'NOT_AVAILABLE');
});
test('the final payload including its digest never exceeds 12000 characters', async () => {
  async function run(project) {
    const task = hash('bounded-output'), ref = 'sha256:'+hash('source');
    const row = { id:hash('row'), project_code:project, source_ref:ref, source_revision_sha256:hash('revision'), input_file_sha256:hash('file'),
      kind:'mail_metadata', claim_state:'observed', text:'Synthetic observation', section:'situation', known_at:'2026-01-01', locator:'metadata.subject' };
    const bytes=Buffer.from(JSON.stringify({project_code:project,task_authority_sha256:task,input_packet_sha256:hash('packet'),known_at:'2026-01-01',
      source_coverage:coverage,coverage_audit_ref:'sha256:'+hash('audit'),records:[row],gaps:[]}));
    const binding={actor_ref:'actor:synthetic',project_code:project,task_authority_sha256:task,input_packet_sha256:hash('packet'),corpus_sha256:hash(bytes),allowed_source_refs:[ref]};
    return createObservedContextQuery({binding,loadCorpus:async()=>bytes,authoritySnapshot:()=>({...binding,active:true})}).query({...binding,purpose:'review_observed_sources',scope:'project',query:''});
  }
  const base = await run('SYN'); const {digest,...withoutDigest}=base;
  const extra = Math.floor((11950-JSON.stringify(withoutDigest).length)/2);
  const result = await run('SYN'+'X'.repeat(extra));
  assert.equal(result.status,'NOT_AVAILABLE');
  assert.ok(result.gaps.includes('OBSERVATION_OUTPUT_BUDGET_EXCEEDED'));
  assert.ok(JSON.stringify(result).length<=12000);
});

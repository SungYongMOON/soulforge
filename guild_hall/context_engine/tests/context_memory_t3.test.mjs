import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createT3Fixture, materializeT3, semanticSources } from '../harness/fixtures/context_memory_t3_fixture.mjs';
import { createAcceptedContextPack } from '../src/runtime/accepted_context_pack.mjs';
import { ref, hash } from '../harness/fixtures/accepted_context_fixture.mjs';

// The candidate ran these through the dev-ERP haengbogwan `--accepted-context` branch,
// which delegated to this APP CLI; main defers that caller branch (CTX-S0-G2).
const cliPath = fileURLToPath(new URL('../src/app.mjs', import.meta.url));
function cli(x, delta = {}) {
  const request = { ...x.request, ...delta };
  const stdout = execFileSync(process.execPath, [cliPath, '--root', x.root,
    '--binding-sha256', x.bindingSha256, '--request-json', JSON.stringify(request), '--synthetic-only'], { encoding: 'utf8', windowsHide: true });
  const pack = JSON.parse(stdout);
  assert.ok([...stdout].length <= request.budget.max_characters, 'entire CLI output budget');
  if (pack.metrics?.output_characters) assert.equal(pack.metrics.output_characters, [...stdout].length);
  return pack;
}
async function direct(x, delta = {}, config = {}) {
  const pack = createAcceptedContextPack({ enabled: true, binding: x.binding, providers: x.providers,
    sourceReadback: x.sourceReadback, ...config });
  return pack.query({ ...x.request, ...delta });
}

test('actual CLI core Q01 Q05 Q07 Q09 Q11 Q12: accepted typed sources -> bounded pack', async () => {
  const x = await materializeT3(); const p = cli(x);
  assert.equal(p.status, 'PARTIAL');
  assert.equal(p.identity.task_ref, 'T-A1'); assert.equal(p.identity.task_identity_verified, true);
  assert.ok(p.facts.some(f => f.id === 'D-CURRENT' && f.value === '28V'));
  assert.ok(!p.facts.some(f => ['D-OLD','D-WITHDRAWN'].includes(f.id)));
  assert.ok(p.paths.some(r => r.kind === 'corrects' && r.target_status === 'EXCLUDED_HISTORY'));
  assert.ok(p.conflicts.some(c => [c.left,c.right].includes('D-CONFLICT') && [c.left,c.right].includes('D-CURRENT')));
  assert.ok(p.gaps.includes('UNTYPED_OR_UNBOUND_SOURCE_COVERAGE'));
  assert.equal(p.metrics.source_reads, 2); assert.equal(p.metrics.source_read_attempts, 2);
  assert.equal(p.metrics.source_body_loads, 2); assert.equal(p.metrics.tokens, 'UNKNOWN');
  for (const e of p.evidence) {
    const file = x.sourceFiles.find(s => s.source_revision_ref.content_id === e.source_revision_ref.content_id);
    const bytes = await readFile(join(x.root, file.file_name), 'utf8');
    assert.equal(hash(bytes), e.source_revision_ref.content_id); assert.equal(e.locator, 'paragraph:1');
    assert.ok(JSON.parse(bytes).records.some(r => r.id === e.id));
  }
  assert.ok(Object.values(p.effects).every(v => v === 0));
});

test('actual CLI Q02 Q03 Q04 project/purpose/ACL rejects before source IO', async () => {
  const x = await materializeT3();
  for (const delta of [{ project_ref: ref(999) }, { project_ref: null }, { purpose: 'ungranted' }, { actor_ref: 'actor:unknown' }]) {
    const p = cli(x, delta); assert.ok(['HOLD','NOT_AVAILABLE'].includes(p.status));
    assert.equal(p.metrics.source_read_attempts, 0); assert.equal(p.metrics.source_body_loads, 0);
  }
  x.acl.revoked_actors.push('actor:alpha'); await x.put('acl.json', x.acl);
  const p = cli(x); assert.equal(p.status,'NOT_AVAILABLE'); assert.equal(p.metrics.source_read_attempts,0);
});

test('actual CLI Q21 output/evidence/path/read budgets and Q22 replay', async () => {
  const x = await materializeT3(); const a = cli(x); const b = cli(x);
  assert.equal(a.digest,b.digest); assert.deepEqual(a.facts,b.facts);
  for (const changes of [{ max_characters: 1200 }, { max_evidence: 1 }, { max_paths: 0 }, { max_source_reads: 1 }]) {
    const p = cli(x, { budget: { ...x.request.budget, ...changes } });
    assert.ok(p.metrics.source_reads <= (changes.max_source_reads ?? 2));
    assert.ok((p.evidence?.length || 0) + (p.retained_history?.length || 0) <= (changes.max_evidence ?? 12));
    assert.notEqual(p.status,'OK');
    if (changes.max_evidence === 1) { assert.equal(p.status,'HOLD'); assert.ok(p.gaps.includes('CONFLICT_PROOF_BUDGET_INSUFFICIENT')); }
    if (changes.max_characters) assert.equal(p.reason,'OUTPUT_BUDGET_INSUFFICIENT');
  }
  const invalid = cli(x, { budget: { ...x.request.budget, max_source_reads: 3 } });
  assert.equal(invalid.status,'HOLD'); assert.equal(invalid.metrics.source_read_attempts,0);
});

test('actual CLI Q06 past query HOLD without current corrected decision or IO', async () => {
  const x = await materializeT3(); const p = cli(x, { valid_at: '2026-08-01T00:00:00.000Z', known_at: '2026-08-02T00:00:00.000Z', as_of: '2026-08-02T00:00:00.000Z' });
  assert.equal(p.status,'HOLD'); assert.ok(p.gaps.includes('HISTORICAL_ACCEPTED_QUERY_UNSUPPORTED'));
  assert.equal(p.facts.length,0); assert.equal(p.metrics.source_reads,0);
});

test('actual CLI Q08 Q10 stale, missing source, changed bytes never healthy', async () => {
  const x = await materializeT3();
  const stale = cli(x, { valid_at: '2026-08-08T00:00:00.000Z', known_at: '2026-08-08T00:00:00.000Z', as_of: '2026-08-08T00:00:00.000Z' });
  assert.equal(stale.freshness,'STALE_OR_UNCONFIRMED');
  const target = x.sourceFiles.find(s => s.source_revision_ref.entity_id === ref(901).entity_id);
  await writeFile(join(x.root,target.file_name),'{}');
  const drift = cli(x); assert.ok(drift.gaps.includes('REVISION_MISMATCH')); assert.ok(!drift.facts.some(f => f.id === 'D-CURRENT'));
  // Missing file is simulated by an explicit bound filename with no source file;
  // no recursive deletion or production resource is touched.
  const binding = JSON.parse(await readFile(join(x.root,'binding.json'),'utf8'));
  binding.context_pack.source_files.find(s => s.source_revision_ref.entity_id === ref(901).entity_id).file_name = 'source-' + 'a'.repeat(64) + '.json';
  const bytes = JSON.stringify(binding); await writeFile(join(x.root,'binding.json'),bytes); x.bindingSha256 = hash(bytes);
  const missing = cli(x); assert.ok(missing.gaps.includes('SOURCE_UNAVAILABLE'));
  assert.equal(missing.metrics.source_read_attempts,2); assert.equal(missing.metrics.source_body_loads,1);
});

test('Q12 exact absent task, Q16 missing procedure remain coverage gaps', async () => {
  const x = await materializeT3(); const absent = cli(x, { task_ref: 'T-MISSING' });
  assert.equal(absent.identity.task_identity_verified,false); assert.equal(absent.facts.length,0);
  assert.ok(absent.gaps.includes('TASK_IDENTITY_UNCONFIRMED')); assert.equal(absent.coverage.status,'INSUFFICIENT');
  const procedure = cli(x, { requested_kinds: ['procedure'] });
  assert.deepEqual(procedure.coverage.missing_kinds,['procedure']);
});

test('Q15 Q17 Q18 typed commitment, applicable failure and deterministic ordering', async () => {
  const x = await materializeT3(); const p = cli(x);
  assert.ok(p.facts.some(f => f.kind === 'commitment' && f.subject === 'person:A' && f.value === 'pending'));
  assert.ok(p.facts.some(f => f.kind === 'failure' && f.id === 'F-PRECEDENT'));
  assert.deepEqual(p.facts.slice(0,2).map(f=>f.kind),['decision','decision']);
});

test('actual CLI Q19 common explicitly authorized preference, never project fact/decision', async () => {
  const x = await materializeT3(); const p = cli(x, { scope: 'common', requested_kinds: ['preference','decision'] });
  assert.ok(p.facts.some(f=>f.kind==='preference')); assert.ok(!p.facts.some(f=>f.kind==='decision'));
  x.acl.actors[0].grant.allowed_scopes = ['project']; await x.put('acl.json',x.acl);
  const denied = cli(x, { scope: 'common', requested_kinds: ['preference'] });
  assert.equal(denied.status,'NOT_AVAILABLE'); assert.equal(denied.metrics.source_body_loads,0);
  const sources = semanticSources(); const body = JSON.parse(sources.common);
  body.project_ref = null; body.records[0].kind = 'decision'; sources.common = JSON.stringify(body);
  const unsafe = createT3Fixture({ sources }); const excluded = await direct(unsafe, { scope:'common', requested_kinds:['decision'] });
  assert.ok(excluded.gaps.includes('TYPED_EVIDENCE_INVALID')); assert.equal(excluded.facts.length,0);
});

test('actual CLI Q20 off needs no source IO; Q24 purpose differentiates reviewed experience', async () => {
  const x = await materializeT3(); const off = cli(x, { memory_mode:'off' });
  assert.equal(off.status,'REQUEST_ONLY'); assert.equal(off.metrics.source_body_loads,0); assert.equal(off.facts.length,0);
  const work = cli(x, { requested_kinds:['failure','success'] });
  const review = cli(x, { memory_purpose:'procedure_review', requested_kinds:['failure','success'] });
  assert.ok(!work.facts.some(f=>f.id==='F-REVIEW')); assert.ok(review.facts.some(f=>f.id==='F-REVIEW'));
  assert.ok(review.facts.some(f=>f.id==='S-REVIEW')); assert.notEqual(work.digest,review.digest);
});

test('actual CLI correction replay creates distinct accepted G1/G2 and repeatable G2 pack', async () => {
  const first = await materializeT3({ generation:1 }); const a = cli(first);
  const second = await materializeT3(); const b = cli(second); const replay = await materializeT3(); const c = cli(replay);
  assert.ok(a.facts.some(f=>f.id==='D-OLD')); assert.ok(!b.facts.some(f=>f.id==='D-OLD'));
  assert.notEqual(a.digest,b.digest); assert.equal(b.digest,c.digest);
  assert.ok(second.store.getGeneration(second.g1.currentRef));
});

test('read counters catch revoked ACL/source drift during await, without leaking typed facts', async () => {
  for (const kind of ['acl','source','throw']) {
    const x = createT3Fixture(); const original = x.providers.readSourceRevision;
    x.providers.readSourceRevision = async row => {
      const loaded = original(row);
      if (kind === 'acl') x.state.acl.revoked_actors.add('actor:alpha');
      if (kind === 'source') x.state.source.source_revision_refs.pop();
      if (kind === 'throw') throw new Error('synthetic provider failure');
      return loaded;
    };
    const p = await direct(x); assert.ok(['NOT_AVAILABLE','PARTIAL'].includes(p.status));
    assert.equal(p.metrics.source_reads,x.readLog.length); assert.equal(p.facts.length,0);
  }
});

test('typed records bind exact project, accepted bytes and requested task independently of fixture IDs', async () => {
  const sources = semanticSources(); const current = JSON.parse(sources.current);
  current.project_ref = ref(999); sources.current = JSON.stringify(current);
  const x = createT3Fixture({ sources }); const p = await direct(x);
  assert.ok(p.gaps.includes('TYPED_EVIDENCE_INVALID')); assert.ok(!p.facts.some(f=>f.id==='D-CURRENT'));
});

test('pack read budget spans metadata/readback calls and exposes unread conflict risk', async () => {
  const x = createT3Fixture();
  const member = x.f.builtCandidate.project_context.memberships.find(m=>m.source_span_ref==='timeline-span:3');
  const extra = { ...x.sourceBindings.find(b=>b.scope==='project'), ...Object.fromEntries(['source_revision_ref','source_span_ref',
    'source_lane','context_unit_ref','context_event_ref','context_branch_ref','valid_at','known_at'].map(k=>[k,member[k]])) };
  x.sourceReadback.bindings.push(extra);
  const p = await direct(x);
  assert.equal(p.metrics.reader_calls,2); assert.equal(x.readLog.length,2);
  assert.ok(p.gaps.includes('UNREAD_SOURCES_MAY_CONTAIN_CONFLICTS'));
  assert.ok(p.excluded.some(e=>e.reason==='SOURCE_READ_BUDGET'));
});

test('same CLI accepts changed public typed claims without question ID or expected-answer branching', async () => {
  const sources = semanticSources();
  const current = JSON.parse(sources.current);
  const decision = current.records.find(r=>r.kind==='decision');
  decision.id = 'D-CHANGED'; decision.statement = '합성 수정 요구의 시험 전압은 29 V다.'; decision.value = '29V';
  sources.current = JSON.stringify(current);
  const x = await materializeT3({ sources }); const p = cli(x);
  assert.ok(p.facts.some(f=>f.id==='D-CHANGED' && f.value==='29V'));
  assert.ok(!p.facts.some(f=>f.id==='D-CURRENT'));
});

test('public source packet matches exact preparation bytes; original metadata query stays unchanged', async () => {
  const sources = JSON.parse(await readFile(new URL('../../../docs/architecture/workspace/examples/context-memory/t3-sources.json',import.meta.url),'utf8'));
  assert.deepEqual(sources,semanticSources());
  const { createAcceptedContextReader } = await import('../src/runtime/accepted_context_reader.mjs');
  const x = createT3Fixture();
  const request = Object.fromEntries(['actor_ref','project_ref','accepted_generation_ref','scope','as_of','purpose'].map(k=>[k,x.request[k]]));
  const metadata = await createAcceptedContextReader({ enabled:true,binding:x.binding,providers:x.providers }).query({ ...request,budget:{max_units:2},cursor:null });
  assert.equal(metadata.status,'ok'); assert.equal('typed_memory' in metadata,false); assert.equal('context_state' in metadata,false);
  assert.equal(x.readLog.length,0);
});

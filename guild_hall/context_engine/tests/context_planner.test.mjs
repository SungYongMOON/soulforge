// 맥락이 working context over a selected graph index. Unit tests answer the
// local model with a canned chat stub (named as such) to check the program's
// part: searches run by the program, citation enforcement, coverage per source
// kind, budget and partial results, refusals, no writes, and a moved index.
// The opt-in test asks a real local model on the synthetic store.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { INDEX_NOW, READER_REQUEST, cannedGraphWorker, indexerRequest, makeGraphIndexStore } from '../harness/fixtures/graph_index_fixture.mjs';
import { openGraphIndex, updateGraphIndex } from '../src/runtime/graph_index_generation.mjs';
import { PLANNER_BUDGET_CEILING, composeWorkingContext } from '../src/runtime/context_planner.mjs';
import { CONTEXT_PLANNER_PROFILE } from '../profiles/context_planner_v1.mjs';
import { createModelFetch, loopbackFetch, validateAllowedChatHosts, validateChatBinding }
  from '../src/adapters/local_model/ollama_chat.mjs';

const code = fn => { try { fn(); return null; } catch (error) { return error.code; } };

const REQUEST = { request_text: '응답기 장표 요청 건과 전원 조건 변경을 확인해 착수 준비를 해 주세요.', task_purpose: '장표 작성 착수 전 맥락 확인' };
const BINDING = { llm: { host: 'http://127.0.0.1:11434', model: 'planner-model:tag' } };
const PLAN = { deliverables: ['응답기 장표'], questions: [{ id: 'q1', text: '응답기 장표는 언제까지 요청됐나?' },
  { id: 'q2', text: '전원 조건이 바뀌었나?' }], searches: [{ question_id: 'q1', mode: 'lexical', query: '응답기 장표' },
  { question_id: 'q2', mode: 'graph', query: '전원 변경 이력' }, { question_id: 'q1', mode: 'exact', query: 'memo-a' }] };
const REVIEW = { answered: ['q1'], missing: [{ question_id: 'q2', reason: '전원 조건 근거 없음' }],
  searches: [{ question_id: 'q2', mode: 'lexical', query: '전원 조건 28V' }] };
const compose = ({ evidence }) => {
  const request = evidence.find(row => row.item_id === 'memo-a' && row.text.includes('화요일'))?.id;
  const power = evidence.find(row => row.item_id === 'memo-b' && row.text.includes('28V'))?.id;
  return { sections: {
    background: [{ text: '요청자가 응답기 장표를 다음 주 화요일까지 요청했다.', kind: 'claim', evidence: [request] }],
    work_history: [{ text: '장표 초안이 이미 제출되었다.', kind: 'fact', evidence: [] }],
    decisions: [{ text: '전원 조건은 28V로 바뀌었고 24V는 취소됐다.', kind: 'fact', evidence: [power] },
      { text: '30V 조건도 검토됐다.', kind: 'fact', evidence: ['E99'] }],
    reusable: [],
    impact: [{ text: '장표에 28V 조건을 반영해야 할 것으로 보인다.', kind: 'interpretation', evidence: [] },
      { text: '제출 여부는 확인되지 않았다.', kind: 'unknown', evidence: [] }] },
  open_questions: ['장표 제출 여부 확인'] };
};

const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
// Canned chat stub: the local server's tags and chat endpoints with scripted answers per step.
function cannedChat({ responses = { plan: PLAN, review: REVIEW, compose }, installed = true } = {}) {
  const calls = [];
  async function fetchImpl(url, init = {}) {
    const { pathname } = new URL(url);
    if (pathname === '/api/tags') {
      return json({ models: installed ? [{ name: 'planner-model:tag', model: 'planner-model:tag', digest: 'a'.repeat(64) }] : [] });
    }
    if (pathname !== '/api/chat') throw new Error('unexpected endpoint');
    const body = JSON.parse(init.body), user = JSON.parse(body.messages[1].content);
    const step = Object.entries(CONTEXT_PLANNER_PROFILE.prompts).find(([, prompt]) => prompt === body.messages[0].content)?.[0];
    calls.push({ step, think: body.think, schema: typeof body.format === 'object', user });
    const reply = typeof responses[step] === 'function' ? responses[step](user) : responses[step];
    return json({ message: { role: 'assistant', content: typeof reply === 'string' ? reply : JSON.stringify(reply) },
      done_reason: 'stop', prompt_eval_count: 100, eval_count: 20 });
  }
  return { fetchImpl, calls };
}

async function indexedStore() {
  const store = await makeGraphIndexStore(), worker = cannedGraphWorker();
  const first = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: indexerRequest({ generation_id: 'g1', expected_prior: null }), now: INDEX_NOW, runWorker: worker.runWorker });
  assert.equal(first.status, 'COMMITTED');
  const view = () => openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: READER_REQUEST });
  return { store, worker, first, view };
}

// Every file under the store with its content hash: a query must change neither.
async function listFiles(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    out.push(`${file} ${createHash('sha256').update(await readFile(file)).digest('hex')}`);
  }
  return out.sort();
}

test('canned local model: the program searches, enforces citations and reports coverage without writing', async () => {
  const { store, view } = await indexedStore();
  const before = await listFiles(store.storeRoot);
  const chat = cannedChat();
  const pack = await composeWorkingContext({ view: view(), request: REQUEST, binding: BINDING, fetchImpl: chat.fetchImpl });
  assert.deepEqual({ status: pack.status, ceiling: pack.claim_ceiling, steps: chat.calls.map(call => call.step),
    think: chat.calls.every(call => call.think === false && call.schema) },
  { status: 'complete', ceiling: 'observed', steps: ['plan', 'review', 'compose'], think: true });
  assert.deepEqual(pack.searches.map(row => [row.round, row.mode, row.status]),
    [[1, 'lexical', 'ok'], [1, 'graph', 'not_connected'], [1, 'exact', 'ok'], [2, 'lexical', 'ok']]);
  assert.equal(pack.searches.find(row => row.mode === 'exact').hits, 2, 'exact lookup returns every unit of the item');
  const ids = new Set(pack.evidence.map(row => row.id));
  for (const row of pack.evidence) {
    assert.match(row.doc_key, /^sha256:/u); assert.match(row.revision_sha256, /^sha256:/u); assert.ok(row.unit_id && row.locator);
  }
  const statements = Object.values(pack.sections).flat();
  for (const row of statements.filter(item => ['fact', 'claim'].includes(item.kind))) {
    assert.ok(row.evidence.length > 0 && row.evidence.every(id => ids.has(id)), 'every fact or claim cites real evidence');
  }
  assert.deepEqual(pack.enforcement, { empty_dropped: 0, downgraded: 2, unknown_evidence_ids: 1 });
  assert.deepEqual(pack.sections.work_history, [{ text: '장표 초안이 이미 제출되었다.', kind: 'interpretation', evidence: [], downgraded_from: 'fact' }]);
  const coverage = Object.fromEntries(pack.coverage.map(row => [row.source_kind, [row.state, row.searched, row.body_read > 0]]));
  assert.deepEqual(coverage, { buzz: ['not_connected', false, false], document: ['connected', true, true], linear: ['none_in_scope', false, false],
    mail: ['none_in_scope', false, false], slack: ['not_connected', false, false], voice: ['none_in_scope', false, false] });
  assert.deepEqual(pack.rune, { status: 'not_run', reason: 'rune_not_connected' });
  assert.deepEqual(pack.review, { status: 'ok', rounds: 1, code: null });
  assert.deepEqual(pack.uncited_model_text, ['deliverables', 'questions', 'missing', 'open_questions']);
  assert.equal(pack.budget.used.model_calls, 3);
  const trace = JSON.stringify(pack.trace);
  assert.ok(!trace.includes(REQUEST.request_text) && !trace.includes('화요일'), 'the trace carries hashes, not text');
  assert.ok(pack.trace.every(row => /^sha256:/u.test(row.input_sha256)));
  assert.deepEqual(await listFiles(store.storeRoot), before, 'a query writes nothing');
  const again = await composeWorkingContext({ view: view(), request: REQUEST, binding: BINDING, fetchImpl: cannedChat().fetchImpl });
  assert.equal(again.content_sha256, pack.content_sha256, 'same input and same answers give the same content digest');
});

test('budget, failure and refusal paths', async () => {
  const { store, view } = await indexedStore();
  const partial = await composeWorkingContext({ view: view(), request: { ...REQUEST, budget: { max_model_calls: 1 } }, binding: BINDING,
    fetchImpl: cannedChat().fetchImpl });
  assert.deepEqual({ status: partial.status, code: partial.code, open: partial.open_questions, statements: Object.values(partial.sections).flat().length },
    { status: 'partial', code: 'model_budget_exhausted', open: PLAN.questions.map(row => row.text), statements: 0 });
  assert.ok(partial.trace.some(row => row.status === 'budget_exhausted'));
  const capped = cannedChat();
  const narrowed = await composeWorkingContext({ view: view(), request: { ...REQUEST, budget: { max_model_calls: 99 } },
    binding: { ...BINDING, budget: { max_model_calls: 2 } }, fetchImpl: capped.fetchImpl });
  assert.deepEqual({ status: narrowed.status, steps: capped.calls.map(call => call.step), review: narrowed.review },
    { status: 'complete', steps: ['plan', 'compose'], review: { status: 'skipped', rounds: 0, code: 'model_budget_reserved_for_compose' } },
    'a request cannot raise the configured budget; the last call is kept for compose and the skipped review is reported');
  const greedy = await composeWorkingContext({ view: view(), request: REQUEST, binding: BINDING, fetchImpl: cannedChat().fetchImpl,
    profile: { ...CONTEXT_PLANNER_PROFILE, budget: { ...CONTEXT_PLANNER_PROFILE.budget, max_model_calls: 99, max_evidence: 999 } } });
  assert.deepEqual({ calls: greedy.budget.limits.max_model_calls, evidence: greedy.budget.limits.max_evidence },
    { calls: PLANNER_BUDGET_CEILING.max_model_calls, evidence: PLANNER_BUDGET_CEILING.max_evidence }, 'no profile goes above the program ceiling');
  const few = await composeWorkingContext({ view: view(), request: { ...REQUEST, budget: { max_evidence: 1 } }, binding: BINDING,
    fetchImpl: cannedChat().fetchImpl });
  assert.deepEqual({ evidence: few.evidence.length, truncated: few.budget.evidence_truncated }, { evidence: 1, truncated: true });
  const broken = await composeWorkingContext({ view: view(), request: REQUEST, binding: BINDING,
    fetchImpl: cannedChat({ responses: { plan: PLAN, review: REVIEW, compose: 'not json' } }).fetchImpl });
  assert.deepEqual({ status: broken.status, code: broken.code }, { status: 'partial', code: 'compose_invalid_json' });
  const untouched = cannedChat();
  for (const [args, code] of [
    [{ request: { ...REQUEST, budget: { max_tokens: 5 } } }, 'planner_budget_invalid'],
    [{ request: { ...REQUEST, as_of: '2026-09-01T00:00:00.000Z' } }, 'as_of_not_supported_by_graph_index'],
    [{ request: { task_purpose: 'x' } }, 'planner_request_invalid'],
    [{ binding: { llm: { host: 'http://10.1.2.3:11434', model: 'planner-model:tag' } } }, 'chat_binding_invalid'],
    [{ binding: { llm: { host: 'http://127.0.0.1:11434', model: 'gpt-oss:120b-cloud' } } }, 'chat_model_not_local'],
  ]) {
    await assert.rejects(composeWorkingContext({ view: view(), request: REQUEST, binding: BINDING, fetchImpl: untouched.fetchImpl, ...args }), { code });
  }
  assert.equal(untouched.calls.length, 0, 'no model call before admission');
  await assert.rejects(composeWorkingContext({ view: view(), request: REQUEST, binding: BINDING,
    fetchImpl: cannedChat({ installed: false }).fetchImpl }), { code: 'chat_model_not_installed' });
  const stale = view();
  await writeFile(path.join(store.sourceRoot, 'memo-b.md'), '# 전원 조건\n\n전원 조건은 30V로 다시 바뀌었다.\n');
  const moved = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: indexerRequest({ generation_id: 'g2', expected_prior: stale.pointer_sha256 }), now: INDEX_NOW, runWorker: cannedGraphWorker().runWorker });
  assert.equal(moved.status, 'COMMITTED');
  await assert.rejects(composeWorkingContext({ view: stale, request: REQUEST, binding: BINDING, fetchImpl: cannedChat().fetchImpl }),
    { code: 'graph_index_pointer_changed' });
});

test('local model client: this host plus named origins only, and a redirect is refused rather than followed with the prompt', async () => {
  await assert.rejects(loopbackFetch('http://192.0.2.10:11434/api/tags'), { code: 'chat_endpoint_not_admitted' });

  // An origin the configuration names is reachable; everything else still is not.
  const named = 'https://model-host.example';
  const admitted = createModelFetch(validateAllowedChatHosts([named]));
  await assert.rejects(admitted('https://other-host.example/api/tags'), { code: 'chat_endpoint_not_admitted' });
  await assert.rejects(admitted('http://192.0.2.10:11434/api/tags'), { code: 'chat_endpoint_not_admitted' });
  // Loopback keeps working through the same guard.
  await assert.rejects(admitted('http://127.0.0.1:1/api/tags'), error => error.code !== 'chat_endpoint_not_admitted');

  assert.deepEqual([...validateAllowedChatHosts(undefined)], [], 'no list means this host only');
  assert.equal(code(() => validateAllowedChatHosts(['http://192.168.0.9:11434'])), 'chat_host_not_https',
    'plaintext off-host would put the prompt on the wire in clear');
  assert.equal(code(() => validateAllowedChatHosts([`${named}/v1`])), 'chat_hosts_invalid');
  assert.equal(code(() => validateAllowedChatHosts(['https://127.0.0.1:11434'])), 'chat_host_redundant');

  // The binding admits the named origin for the model as well as for the transport.
  const bound = validateChatBinding({ host: `${named}/`, model: 'a-model:tag', allowed_hosts: [named] });
  assert.deepEqual([...bound.allowed_hosts], [named]);
  assert.equal(code(() => validateChatBinding({ host: `${named}/`, model: 'a-model:tag' })), 'chat_binding_invalid',
    'without the list the same address is refused');

  const server = http.createServer((request, response) => {
    response.writeHead(307, { location: 'http://192.0.2.10:11434/api/chat' }); response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(loopbackFetch(`http://127.0.0.1:${server.address().port}/api/chat`, { method: 'POST', body: '{"prompt":"x"}' }),
      { code: 'chat_redirect_refused' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});

const MODEL = process.env.SOULFORGE_TEST_CONTEXT_PLANNER_LLM;
test('real local model composes a cited working context on the synthetic index (opt-in)',
  { skip: MODEL ? false : 'set SOULFORGE_TEST_CONTEXT_PLANNER_LLM to ask a local model', timeout: 1800000 }, async () => {
    const { view } = await indexedStore();
    const host = process.env.SOULFORGE_TEST_OLLAMA_HOST || 'http://127.0.0.1:11434';
    const pack = await composeWorkingContext({ view: view(), request: REQUEST,
      binding: { llm: { host, model: MODEL, keep_alive: process.env.SOULFORGE_TEST_GRAPHRAG_KEEP_ALIVE || '30s' } } });
    assert.ok(pack.budget.used.model_calls >= 2, JSON.stringify({ status: pack.status, code: pack.code }));
    assert.equal(pack.status, 'complete', pack.code);
    const statements = Object.values(pack.sections).flat();
    assert.ok(statements.length > 0 && pack.evidence.length > 0);
    const ids = new Set(pack.evidence.map(row => row.id));
    for (const row of statements.filter(item => ['fact', 'claim'].includes(item.kind))) assert.ok(row.evidence.every(id => ids.has(id)));
    const tokens = key => pack.trace.reduce((sum, row) => sum + (row[key] ?? 0), 0);
    process.stdout.write(`# planner real run: ${JSON.stringify({ status: pack.status, model: pack.planner.model, calls: pack.budget.used.model_calls,
      prompt_tokens: tokens('prompt_tokens'), output_tokens: tokens('output_tokens'), elapsed_ms: tokens('elapsed_ms'), questions: pack.questions.length,
      searches: pack.searches.map(row => [row.round, row.mode, row.status, row.hits]), evidence: pack.evidence.length,
      statements: Object.fromEntries(Object.entries(pack.sections).map(([name, rows]) => [name, rows.map(row => row.kind)])),
      enforcement: pack.enforcement, open_questions: pack.open_questions.length })}\n`);
  });

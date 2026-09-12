// One run of the whole chain on the chosen deployment. Development harness; never packaged.
//
//   prepare -> extract (model) -> materialize (graph database) -> search -> compose
//
// Everything is synthetic: two memos, the same ones the comparison harness uses.
// The point is not the answer but that every seam is exercised once against the
// real endpoints a deployment would use, so a seam that only works in a unit test
// shows up here.
//
// usage:
//   node guild_hall/context_engine/harness/end_to_end.mjs
//     SOULFORGE_TEST_GRAPHRAG_PYTHON        required, the venv interpreter
//     SOULFORGE_TEST_GRAPHRAG_LLM           required, the extraction and planner model
//     SOULFORGE_TEST_GRAPHRAG_EMBEDDER      required, the embedding model
//     SOULFORGE_TEST_OLLAMA_HOST            model origin, default this host
//     SOULFORGE_TEST_NEO4J_URI              bolt address
//     SOULFORGE_TEST_NEO4J_PASSWORD_FILE    single-line password file
import { realpathSync } from 'node:fs';
import { makeGraphIndexStore, indexerRequest, READER_REQUEST, INDEX_NOW } from './fixtures/graph_index_fixture.mjs';
import { openGraphIndex, updateGraphIndex } from '../src/runtime/graph_index_generation.mjs';
import { materializeGraphIndex } from '../src/runtime/graph_database.mjs';
import { createGraphIndexRetriever } from '../src/runtime/graph_index_retrieval.mjs';
import { composeWorkingContext } from '../src/runtime/context_planner.mjs';
import { createModelFetch, validateAllowedChatHosts } from '../src/adapters/local_model/ollama_chat.mjs';

const need = name => process.env[name] ?? (() => { process.stderr.write(`set ${name}\n`); process.exit(2); })();
const PYTHON = need('SOULFORGE_TEST_GRAPHRAG_PYTHON');
const MODEL = need('SOULFORGE_TEST_GRAPHRAG_LLM');
const EMBEDDER = need('SOULFORGE_TEST_GRAPHRAG_EMBEDDER');
const HOST = process.env.SOULFORGE_TEST_OLLAMA_HOST || 'http://127.0.0.1:11434';
// The embedder can sit on a different machine from the LLM, and usually should:
// extraction is one LLM call per chunk while embedding is small and fast, so the
// expensive half moves off this host and the cheap half stays.
const EMBEDDER_HOST = process.env.SOULFORGE_TEST_EMBEDDER_HOST || 'http://127.0.0.1:11434';
const NEO4J_URI = need('SOULFORGE_TEST_NEO4J_URI');
const NEO4J_PASSWORD_FILE = realpathSync(need('SOULFORGE_TEST_NEO4J_PASSWORD_FILE'));

// Off-host origins are named once and used by both the worker and the planner.
const remote = [...new Set([HOST, EMBEDDER_HOST].filter(h => h.startsWith('https://')).map(h => new URL(h).origin))];
const step = (n, what) => process.stdout.write(`\n[${n}] ${what}\n`);
const started = Date.now();
const since = () => `${Math.round((Date.now() - started) / 1000)}s`;

const where = host => (host.startsWith('https://') ? '원격' : '이 PC');
step(1, `준비 — 합성 메모 2장 · LLM ${MODEL} @ ${where(HOST)} · 임베더 ${EMBEDDER} @ ${where(EMBEDDER_HOST)}`);
const store = await makeGraphIndexStore({
  neo4j: { uri: NEO4J_URI, user: process.env.SOULFORGE_TEST_NEO4J_USER || 'neo4j', password_file: NEO4J_PASSWORD_FILE },
  embedder: { host: EMBEDDER_HOST, model: EMBEDDER },
});
const graph = { ...store.binding.graph,
  worker: { interpreter_path: PYTHON, timeout_ms: 1800000 },
  llm: { host: HOST, model: MODEL, max_calls: 60, keep_alive: '10m' },
  allowed_model_hosts: remote };
const { sha256: bindingSha256 } = await store.put('graph_index_binding.json', { ...store.binding, graph });
process.stdout.write(`    store ready (${since()})\n`);

step(2, '추출 — 원문에서 대상·관계 뽑아 세대 만들기');
const generationId = `e2e-${Date.now()}`;
const built = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256, now: INDEX_NOW,
  request: indexerRequest({ generation_id: generationId, expected_prior: null }) });
if (built.status !== 'COMMITTED') { process.stdout.write(`    FAILED ${built.status} ${built.code}\n`); process.exit(1); }
process.stdout.write(`    ${built.status} 문서 ${built.counts.documents} 청크 ${built.counts.chunks} `
  + `대상 ${built.counts.entities} 관계 ${built.counts.entity_relationships} 호출 ${built.llm.calls} (${since()})\n`);

const view = () => openGraphIndex({ storeRoot: store.storeRoot, bindingSha256, request: READER_REQUEST });
step(3, '적재 — 세대를 그래프 데이터베이스로');
const loaded = await materializeGraphIndex({ view: view(), binding: view().graph_binding });
process.stdout.write(`    ${loaded.status} loaded=${loaded.loaded} 청크 ${loaded.counts?.chunks} `
  + `벡터 ${loaded.counts?.embedded_chunks} 관계 ${loaded.counts?.relationships} (${since()})\n`);
const replay = await materializeGraphIndex({ view: view(), binding: view().graph_binding });
process.stdout.write(`    재실행: loaded=${replay.loaded} ${replay.code ?? ''}\n`);

step(4, '검색 — 다섯 방식 각각');
const retriever = createGraphIndexRetriever(view());
const question = '전원 조건이 몇 볼트로 바뀌었나';
for (const mode of ['lexical', 'exact', 'vector', 'hybrid', 'graph']) {
  const query = mode === 'exact' ? 'memo-b' : question;
  const result = await retriever[mode](query);
  const top = result.hits[0];
  process.stdout.write(`    ${mode.padEnd(8)} ${String(result.status).padEnd(14)} hits ${String(result.hits.length).padStart(2)}`
    + `${top ? `  최상위: ${top.item_id} / ${top.text.slice(0, 34)}` : `  ${result.code ?? ''}`}\n`);
}

step(5, `맥락이 — 실제 질문에 인용된 맥락 쓰기`);
const pack = await composeWorkingContext({ view: view(),
  request: { request_text: `${question}? 지금 설계에 반영해야 할 조건과, 아직 확인이 필요한 것을 정리해줘.`,
    task_purpose: '설계 조건 확인' },
  binding: { llm: { host: HOST, model: MODEL, keep_alive: '10m', allowed_hosts: remote } },
  fetchImpl: createModelFetch(validateAllowedChatHosts(remote)) });
process.stdout.write(`    ${pack.status} ${pack.code ?? ''} 호출 ${pack.budget.used.model_calls} `
  + `검색 ${pack.budget.used.searches} 근거 ${pack.evidence.length} (${since()})\n`);
process.stdout.write(`    검색 가능 방식: ${pack.search_modes.filter(m => m.state === 'connected').map(m => m.mode).join(', ')}\n`);
process.stdout.write(`    강등된 문장(근거 없음): ${pack.enforcement.downgraded}, 없는 근거 id: ${pack.enforcement.unknown_evidence_ids}\n`);
// sections is an object keyed by the profile's section names, each a statement list.
for (const [name, statements] of Object.entries(pack.sections ?? {})) {
  if (!statements.length) { process.stdout.write(`\n    § ${name} — (없음)\n`); continue; }
  process.stdout.write(`\n    § ${name}\n`);
  for (const line of statements) {
    process.stdout.write(`      [${pack.statement_kinds[line.kind] ?? line.kind}] ${line.text}`
      + `${line.evidence?.length ? `  <${line.evidence.join(',')}>` : ''}\n`);
  }
}
if (pack.open_questions?.length) {
  process.stdout.write(`\n    남은 질문:\n`);
  for (const q of pack.open_questions) process.stdout.write(`      - ${typeof q === 'string' ? q : JSON.stringify(q)}\n`);
}
process.stdout.write(`\n    근거:\n`);
for (const row of pack.evidence) process.stdout.write(`      ${row.id} ${row.item_id}/${row.unit_id}: ${row.text.slice(0, 56)}\n`);
process.stdout.write(`\n=== 끝 (${since()}) content_sha256=${pack.content_sha256.slice(0, 23)} ===\n`);

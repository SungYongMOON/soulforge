// Extraction comparison across model candidates. Development harness; never packaged.
//
// Every candidate gets its own fresh synthetic store and extracts the same two
// memos, so the only thing that differs between runs is the model. Two kinds of
// number come out:
//
//   mechanical — what the existing admission already counts: chunks that matched
//     their unit, entities and relationships admitted, what was dropped and why,
//     calls, errors, unreadable answers, cut-off answers, tokens, time.
//   meaning — a small gold standard over the two memos below. These are the
//     failures actually observed in earlier runs, turned into checks. They are a
//     floor, not a grade: passing all of them does not make a model good, but
//     failing `power_28` means the index would answer "what voltage" with the
//     cancelled value, which is a real work error.
//
// The remote host is read from the environment, never written here: a private
// address does not belong in the public tree.
//
// usage:
//   node guild_hall/context_engine/harness/model_comparison.mjs
//     SOULFORGE_TEST_GRAPHRAG_PYTHON   required, the venv interpreter
//     SOULFORGE_TEST_REMOTE_OLLAMA     optional origin, e.g. https://host.example
//     SOULFORGE_TEST_LOCAL_OPENAI      optional origin of an OpenAI-compatible server
//     SOULFORGE_TEST_ONLY              optional comma-separated candidate labels
import { writeFileSync } from 'node:fs';
import { makeGraphIndexStore, indexerRequest, READER_REQUEST, INDEX_NOW } from './fixtures/graph_index_fixture.mjs';
import { openGraphIndex, updateGraphIndex } from '../src/runtime/graph_index_generation.mjs';

const PYTHON = process.env.SOULFORGE_TEST_GRAPHRAG_PYTHON;
const LOCAL = process.env.SOULFORGE_TEST_OLLAMA_HOST || 'http://127.0.0.1:11434';
const REMOTE = process.env.SOULFORGE_TEST_REMOTE_OLLAMA || null;
const LOCAL_OPENAI = process.env.SOULFORGE_TEST_LOCAL_OPENAI || null;
const REMOTE_OPENAI = process.env.SOULFORGE_TEST_REMOTE_OPENAI || null;
if (!PYTHON) { process.stderr.write('set SOULFORGE_TEST_GRAPHRAG_PYTHON\n'); process.exit(2); }

const candidates = [
  { label: '1-gemma4-12b', host: LOCAL, model: 'gemma4:12b' },
  { label: '2-qwen3.6-27b', host: LOCAL, model: 'qwen3.6:27b' },
  { label: '3-qwen3.5-9b', host: LOCAL, model: 'qwen3.5:9b' },
  { label: '4-qwen3.8-27b-local', host: LOCAL_OPENAI, model: 'qwen3.8-27b-iq3xxs', transport: 'openai_chat' },
  { label: '5-gemma4-e2b-73k', host: REMOTE, model: 'gemma4:e2b-73k' },
  { label: '6-gemma4-31b-remote', host: REMOTE, model: 'gemma4:31b' },
  // A remote OpenAI-compatible server: same shape as the local one, different host.
  { label: '7-remote-openai', host: REMOTE_OPENAI, model: process.env.SOULFORGE_TEST_REMOTE_OPENAI_MODEL,
    transport: 'openai_chat' },
].filter(row => row.host && row.model)
  .filter(row => !process.env.SOULFORGE_TEST_ONLY || process.env.SOULFORGE_TEST_ONLY.split(',').includes(row.label));

// The two synthetic memos say exactly this much. Each check is something an index
// built from them must get right for the answer to a later question to be usable.
const GOLD = [
  { id: 'request', what: 'Request 대상을 잡음',
    ok: n => n.some(x => x.label === 'Request') },
  { id: 'not_commitment', what: '요청을 약속(Commitment)으로 오분류하지 않음',
    ok: n => !n.some(x => x.label === 'Commitment') },
  { id: 'deliverable', what: '산출물(장표)을 잡음',
    ok: n => n.some(x => x.label === 'Deliverable' && /장표/u.test(x.properties?.name ?? '')) },
  { id: 'due', what: '마감(화요일)을 날짜 칸에 담음',
    ok: n => n.some(x => /화요일/u.test(x.properties?.due ?? '')) },
  { id: 'change', what: '변경(Change) 대상을 잡음',
    ok: n => n.some(x => x.label === 'Change') },
  { id: 'power_28', what: '현재 전원 조건이 28V',
    ok: n => n.some(x => x.label === 'Constraint' && /28/u.test(`${x.properties?.name ?? ''} ${x.properties?.value ?? ''}`)) },
  // Keeping the cancelled 24V is not the error -- the text says it existed, and a
  // later "why did it change" needs it. The error is keeping it as a bare value that
  // reads exactly like the current one, so a search for the voltage returns both
  // with nothing to tell them apart.
  { id: 'power_24_marked', what: '취소된 24V를 현재 값과 구분되게 표시',
    ok: n => n.filter(x => x.label === 'Constraint'
      && /24/u.test(`${x.properties?.name ?? ''} ${x.properties?.value ?? ''}`))
      .every(x => /이전|예전|옛|기존|취소|old|previous|former|cancel/iu.test(x.properties?.name ?? '')) },
  { id: 'equipment', what: '장비를 잡음',
    ok: n => n.some(x => x.label === 'Equipment') },
  // The memo is not a document the memo refers to, and not something it asks for.
  // Only the document-shaped labels are checked: a memo heading can also be a
  // legitimate entity name, so matching titles against every label would punish
  // the right answer.
  { id: 'no_self_as_doc', what: '자기 제목을 참조문서·산출물로 만들지 않음',
    ok: (n, titles) => !n.some(x => ['ReferencedDocument', 'Deliverable'].includes(x.label)
      && typeof x.properties?.name === 'string' && x.properties.name.length >= 4
      && titles.some(t => typeof t === 'string' && t.length >= 4
        && (t.includes(x.properties.name) || x.properties.name.includes(t)))) },
];

async function run(candidate) {
  const started = Date.now();
  const store = await makeGraphIndexStore();
  const graph = { ...store.binding.graph,
    worker: { interpreter_path: PYTHON, timeout_ms: 1800000 },
    llm: { host: candidate.host, model: candidate.model, max_calls: 40, keep_alive: '10m',
      ...(candidate.transport ? { transport: candidate.transport } : {}) },
    embedder: null,
    ...(candidate.host.startsWith('https://') ? { allowed_model_hosts: [new URL(candidate.host).origin] } : {}) };
  const { sha256: bindingSha256 } = await store.put('graph_index_binding.json', { ...store.binding, graph });
  const result = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256, now: INDEX_NOW,
    request: indexerRequest({ generation_id: 'g1', expected_prior: null }) });
  const elapsed = Math.round((Date.now() - started) / 1000);
  if (result.status !== 'COMMITTED') {
    return { ...candidate, status: result.status, code: result.code ?? null, degraded: result.degraded ?? null, elapsed };
  }
  const view = openGraphIndex({ storeRoot: store.storeRoot, bindingSha256, request: READER_REQUEST });
  const nodes = [], titles = [], dropped = {};
  for (const row of view.manifest.documents) {
    const fragment = view.readFragment(row.doc_key);
    titles.push(view.readDocument(row.doc_key).title);
    for (const node of fragment.nodes) if (!['Document', 'Chunk'].includes(node.label)) nodes.push(node);
    for (const [key, value] of Object.entries(fragment.stats)) {
      if (key.startsWith('chunks_') || key.startsWith('entities_') || key.startsWith('relationships_') || key === 'duplicate_ids') {
        dropped[key] = (dropped[key] ?? 0) + value;
      }
    }
  }
  const gold = Object.fromEntries(GOLD.map(check => [check.id, check.ok(nodes, titles)]));
  return { ...candidate, status: 'COMMITTED', elapsed,
    counts: view.manifest.counts, llm: { calls: result.llm.calls, errors: result.llm.errors,
      invalid_outputs: result.llm.invalid_outputs, truncated: result.llm.truncated,
      prompt_tokens: result.llm.prompt_tokens, output_tokens: result.llm.output_tokens,
      thinking_characters: result.llm.thinking_characters },
    pin: { kind: view.manifest.model.llm_pin_kind, transport: view.manifest.model.transport },
    dropped, gold, gold_passed: Object.values(gold).filter(Boolean).length,
    entities: nodes.map(n => `${n.label}:${n.properties?.name ?? ''}${n.properties?.value ? '=' + n.properties.value : ''}${n.properties?.due ? '@' + n.properties.due : ''}`).sort() };
}

const rows = [];
for (const candidate of candidates) {
  process.stdout.write(`\n>>> ${candidate.label}  (${candidate.model})\n`);
  try { rows.push(await run(candidate)); }
  catch (error) { rows.push({ ...candidate, status: 'THREW', code: error.code ?? error.message, elapsed: null }); }
  const last = rows.at(-1);
  process.stdout.write(`    ${last.status}  ${last.elapsed ?? '-'}s  gold=${last.gold_passed ?? '-'}/${GOLD.length}  ${last.code ?? ''}\n`);
}

process.stdout.write(`\n=== 비교 (gold ${GOLD.length}항목) ===\n`);
const pad = (v, n) => String(v ?? '-').padEnd(n);
process.stdout.write(`${pad('후보', 22)}${pad('상태', 11)}${pad('초', 6)}${pad('대상', 6)}${pad('관계', 6)}${pad('호출', 6)}${pad('불량', 6)}${pad('gold', 7)}\n`);
for (const row of rows) {
  process.stdout.write(pad(row.label, 22) + pad(row.status, 11) + pad(row.elapsed, 6)
    + pad(row.counts?.entities, 6) + pad(row.counts?.entity_relationships, 6) + pad(row.llm?.calls, 6)
    + pad((row.llm?.errors ?? 0) + (row.llm?.invalid_outputs ?? 0) + (row.llm?.truncated ?? 0), 6)
    + pad(`${row.gold_passed ?? '-'}/${GOLD.length}`, 7) + '\n');
}
process.stdout.write('\n=== 항목별 ===\n');
process.stdout.write(pad('검사', 40) + candidates.map(c => pad(c.label.slice(0, 12), 14)).join('') + '\n');
for (const check of GOLD) {
  process.stdout.write(pad(`${check.id} — ${check.what}`, 40)
    + rows.map(r => pad(r.gold ? (r.gold[check.id] ? 'O' : 'X') : '-', 14)).join('') + '\n');
}
const out = process.env.SOULFORGE_TEST_COMPARISON_OUT;
if (out) { writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), rows }, null, 2) + '\n'); process.stdout.write(`\nwrote ${out}\n`); }

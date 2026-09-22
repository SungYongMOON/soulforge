import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGraph, createMemoryArchive, createWikiKnowledgeLayer, withdrawalFingerprint } from '../../src/knowledge_layer/index.mjs';
import { hashText } from '../../src/knowledge_layer/data.mjs';
import { checkKnowledgeCandidates } from '../../src/knowledge_layer/candidate_check.mjs';
import { linkApprovedUnits } from '../../src/knowledge_layer/span_link.mjs';
import { checkWikiOutput } from '../../src/knowledge_layer/wiki_check.mjs';
import { evaluateKnowledgeAnswers, fixtureAnswers, readCorpus } from '../../harness/knowledge_layer_eval.mjs';
import { BUDGET, extractiveFake, wikiFixture, wikiInput } from './wiki_fixture.mjs';
function revise(input, unitId, text) {
  const u = input.request.units.find(u => u.unit_id === unitId); u.text = text; u.text_sha256 = hashText(text);
  u.source_revision_ref = { ...u.source_revision_ref, revision_id: 'revision:2', content_id: hashText(text) };
  const g = input.request.grant.units.find(u => u.unit_id === unitId); g.text_sha256 = u.text_sha256; g.source_revision_ref = u.source_revision_ref;
}
test('K3 emits project/source two-section pages, index, append log and closed evidence graph', async () => {
  const f = wikiFixture(), input = wikiInput(), before = structuredClone(input);
  const result = await f.layer.generate(input); assert.equal(result.status, 'READY'); const c = result.record.content;
  assert.equal(c.pages.length, 4); assert.equal(c.statements.length, 3); assert.equal(c.work_log.length, 1);
  for (const p of c.pages) { assert.match(p.markdown, /## 정리본/); assert.match(p.markdown, /## 기록 \(추가 전용\)/); assert.equal(p.display_label, '자동 정리본'); }
  assert.match(c.index_markdown, /source:source:a-mail/);
  assert.equal(c.knowledge_accepted, false); assert.equal(c.semantic_fact_verified, false);
  assert.ok(c.edges.filter(e => e.kind === 'SUPPORTED_BY').length === 3);
  assert.deepEqual(input, before);
  assert.deepEqual(await f.archive.get(result.record.generation_id), c);
});
test('model topics replace source pages while preserving the project page, evidence and materials', async () => {
  const f = wikiFixture({ generate: input => { const out = extractiveFake(input);
    out.candidates.find(s => s.unit_id === 'a-doc').topic = '제작과 검사';
    out.candidates.find(s => s.unit_id === 'a-mail').topic = '일정과 승인';
    out.candidates.find(s => s.unit_id === 'a-voice').topic = '제작과 검사';
    return out; } });
  const c = (await f.layer.generate(wikiInput())).record.content;
  assert.equal(c.pages.length, 3, 'project + two topic pages');
  assert.equal(c.pages.filter(p => p.page_id.startsWith('topic:')).length, 2);
  assert.equal(c.pages.some(p => p.page_id.startsWith('source:')), false);
  const build = c.pages.find(p => p.topic === '제작과 검사');
  assert.deepEqual(build.source_unit_ids, ['a-doc', 'a-voice']);
  assert.deepEqual([...build.statement_ids].sort(), ['statement:a-doc', 'statement:a-voice']);
  assert.equal(build.materials.length, 2);
  assert.deepEqual(build.materials.find(m => m.unit_id === 'a-doc').statement_ids, ['statement:a-doc']);
  assert.deepEqual(build.materials.find(m => m.unit_id === 'a-voice').statement_ids, ['statement:a-voice']);
  assert.match(build.markdown, /^# 제작과 검사/mu);
  assert.match(c.index_markdown, /제작과 검사/);
  assert.match(c.index_markdown, /일정과 승인/);
  assert.ok(c.edges.filter(e => e.kind === 'SUPPORTED_BY').length === 3);
});
test('topic and project pages retain model review for a citation-rejected statement', async () => {
  const f = wikiFixture({ generate: input => { const out = extractiveFake(input);
    const accepted = out.candidates.find(s => s.unit_id === 'a-doc'); accepted.topic = '비용과 계약';
    const rejected = out.candidates.find(s => s.unit_id === 'a-mail'); rejected.topic = '비용과 계약';
    rejected.quote = '승인 원문에 없는 합성 인용문입니다.';
    out.review.exceptions = [{ statement_id: rejected.statement_id, impact_kinds: ['amount'], reason: '모델이 보고한 근거 부족' }];
    out.review.conflicts = [{ left: accepted.statement_id, right: rejected.statement_id, note: '포함 문장과 제외 문장의 모순 후보' }];
    return out; } });
  const c = (await f.layer.generate(wikiInput())).record.content;
  assert.ok(c.excluded.some(s => s.statement_id === 'statement:a-mail'));
  const project = c.pages.find(p => p.page_id === 'project:SYN-A'), topic = c.pages.find(p => p.topic === '비용과 계약');
  for (const page of [project, topic]) {
    assert.match(page.markdown, /모델이 보고한 근거 부족/);
    assert.match(page.markdown, /포함 문장과 제외 문장의 모순 후보/);
    assert.equal(page.statement_ids.includes('statement:a-mail'), false);
  }
  assert.deepEqual(topic.materials.find(m => m.unit_id === 'a-mail').statement_ids, []);
});
test('same request is a no-op, no extra model calls or rewritten history', async () => {
  const f = wikiFixture(), input = wikiInput(), one = await f.layer.generate(input);
  input.expected_previous = one.record.generation_id; const two = await f.layer.generate(input);
  assert.equal(f.calls(), 1); assert.equal(two.unchanged, true); assert.equal(two.record.generation_id, one.record.generation_id);
  assert.equal(two.record.content.work_log.length, 1);
});
test('unchanged request still checks expected_previous before archive effects', async () => {
  const f = wikiFixture(), input = wikiInput(), first = await f.layer.generate(input);
  await assert.rejects(() => f.layer.generate(input), /wiki_prior_mismatch/);
  input.expected_previous = 'sha256:' + 'f'.repeat(64);
  await assert.rejects(() => f.layer.generate(input), /wiki_prior_mismatch/);
  assert.equal(f.calls(), 1); assert.deepEqual(await f.graph.read('SYN-A'), first.record);
  assert.deepEqual(await f.archive.getWithdrawals('SYN-A'), []);
});
test('verified quote attribution does not turn paraphrasing into a mechanical exception', async () => {
  const sentence = '대금 5,000,000원 지급을 2026-10-31 마감으로 고객과 계약 확정하기로 결정했다';
  const f = wikiFixture({ generate: input => { const out = extractiveFake(input); out.candidates.find(s => s.unit_id === 'a-mail').text = sentence; return out; } });
  const c = (await f.layer.generate(wikiInput())).record.content, row = c.statements.find(s => s.unit_id === 'a-mail');
  assert.equal(c.exceptions.length, 0); assert.equal(row.exception_required, false); assert.equal(row.evidence_strength, 'source_attributed');
  assert.deepEqual(row.impact_kinds, ['amount', 'deadline', 'decision', 'external_commitment']);
  assert.equal(row.text, sentence, 'floor must not reject a cited paraphrase');
  for (const page of c.pages.filter(p => p.source_unit_ids.includes('a-mail'))) {
    assert.match(page.markdown, /## 확인 필요/); assert.match(page.markdown, /### 예외\n\n없음/);
  }
  const other = c.pages.find(p => p.page_id === 'source:source:a-doc');
  assert.match(other.markdown, /### 예외\n\n없음/); assert.match(other.markdown, /### 모순\n\n없음/); assert.match(other.markdown, /## 빈틈\n\n없음/);
  assert.equal(c.nodes.some(n => n.kind === 'Exception'), false);
});
test('model and floor union preserves reasons and renders exception, conflict and gap', async () => {
  const f = wikiFixture({ generate: input => { const out = extractiveFake(input);
    out.candidates[0].text = '대금 지급 결정은 검토 대상이다.';
    out.review.exceptions = [{ statement_id: out.candidates[0].statement_id, impact_kinds: ['external_commitment'], reason: '모델이 보고한 추가 사유' }];
    out.review.conflicts = [{ left: out.candidates[0].statement_id, right: out.candidates[1].statement_id, note: '자료 간 모순 후보' }];
    out.review.gaps = [{ unit_ids: [out.candidates[0].unit_id], note: '서명 자료 누락' }]; return out; } });
  const c = (await f.layer.generate(wikiInput())).record.content, page = c.pages[0].markdown;
  assert.equal(c.exceptions.length, 1); assert.equal(c.conflicts.length, 1); assert.equal(c.gaps.length, 1);
  assert.deepEqual(c.exceptions[0].origins, ['model_proposal']);
  assert.equal(c.exceptions[0].evidence_strength, 'source_attributed');
  assert.ok(c.exceptions[0].exception_reasons.includes('모델이 보고한 추가 사유'));
  assert.match(page, /### 예외[\s\S]*모델이 보고한 추가 사유/);
  assert.match(page, /### 모순[\s\S]*자료 간 모순 후보/);
  assert.ok(page.includes(c.conflicts[0].left + ' ↔ ' + c.conflicts[0].right));
  assert.match(page, /## 빈틈[\s\S]*서명 자료 누락/);
});
test('K3 retains K2 impact markers but keeps quote attribution separate from paraphrase identity', () => {
  const request = wikiInput().request, bundle = linkApprovedUnits(request), base = extractiveFake({ units: request.units });
  const variants = ['결정 승인 확정', '마감 납기 기한 일정 2026-10-31', '금액 대금 예산 비용 500원 USD KRW €',
    '대외 고객 계약 약속 납품 출하', 'approve decided', 'deadline due', 'amount $200', 'commitment promise contract', '일반 설명'];
  const copied = base.candidates[0];
  const rows = [...variants.map(text => ({ ...copied, text })), copied,
    { ...copied, text: copied.text.normalize('NFD').replaceAll(' ', '　') },
    { ...copied, claim: { subject: '대상', key: '상태', value: '후보' } },
    { ...copied, quote: '허용 원문에 존재하지 않는 인용문이다.' }];
  for (const [index, row] of rows.entries()) {
    const k2 = checkKnowledgeCandidates({ bundle, candidates: [row], now: request.now }).results[0];
    const k3 = checkWikiOutput(bundle, { candidates: [row], review: { conflicts: [], gaps: [], exceptions: [] } }).results[0];
    assert.deepEqual(k3.impact_kinds, k2.impact_kinds);
    if (index < variants.length) {
      assert.equal(k2.evidence_strength, 'weak'); assert.equal(k3.evidence_strength, 'source_attributed');
      assert.equal(k3.exception_required, false);
    } else if (index === variants.length || index === variants.length + 1) {
      assert.equal(k2.evidence_strength, 'source_attributed'); assert.equal(k3.evidence_strength, 'source_attributed');
    } else {
      assert.equal(k3.evidence_strength, 'weak');
    }
  }
  const modelReported = checkWikiOutput(bundle, { candidates: [copied], review: { conflicts: [], gaps: [], exceptions: [
    { statement_id: copied.statement_id, impact_kinds: ['amount'], reason: '모델 추가 확인 요청' }] } }).results[0];
  assert.equal(modelReported.evidence_strength, 'source_attributed'); assert.equal(modelReported.exception_required, true);
});
test('a candidate row may supply impact_kinds or claim independently, not only both together (additive shape)', () => {
  const request = wikiInput().request, bundle = linkApprovedUnits(request), base = extractiveFake({ units: request.units });
  const { statement_id, unit_id, text, quote } = base.candidates[0];
  const fourKey = { statement_id, unit_id, text, quote };
  const impactOnly = { ...fourKey, impact_kinds: ['amount'] };
  const claimOnly = { ...fourKey, claim: { subject: 's', key: 'k', value: 'v' } };
  const sixKey = { ...fourKey, impact_kinds: ['amount'], claim: null };
  for (const row of [fourKey, impactOnly, claimOnly, sixKey]) {
    const result = checkWikiOutput(bundle, { candidates: [row], review: { conflicts: [], gaps: [], exceptions: [] } }).results[0];
    assert.equal(result.statement_id, statement_id);
  }
  const claimOnlyResult = checkWikiOutput(bundle, { candidates: [claimOnly], review: { conflicts: [], gaps: [], exceptions: [] } }).results[0];
  assert.equal(claimOnlyResult.evidence_strength, 'weak', 'a non-null claim still marks evidence weak, whether or not impact_kinds was also supplied');
  // Still refuses an unrecognised extra field or a fifth key outside the two optional names.
  assert.throws(() => checkWikiOutput(bundle, { candidates: [{ ...fourKey, bogus: 1 }], review: { conflicts: [], gaps: [], exceptions: [] } }),
    /wiki_sentence_invalid/);
  for (const topic of ['', ' 앞 공백', '줄\n바꿈', 'topic\u0000']) {
    assert.throws(() => checkWikiOutput(bundle, { candidates: [{ ...fourKey, topic }], review: { conflicts: [], gaps: [], exceptions: [] } }),
      /wiki_topic_invalid/);
  }
});
test('two projects are isolated in pages, graph snapshots and source grants', async () => {
  const f = wikiFixture(), a = await f.layer.generate(wikiInput()), b = await f.layer.generate(wikiInput('SYN-B'));
  assert.notEqual(a.record.generation_id, b.record.generation_id);
  const again = await f.layer.readCurrent(wikiInput()); assert.deepEqual(again.record, a.record);
  assert.doesNotMatch(JSON.stringify(again.record.content.pages), /b-mail|200 USD/);
  const mixed = wikiInput(); mixed.request.units.push(wikiInput('SYN-B').request.units[0]);
  await assert.rejects(() => f.layer.generate(mixed));
});
test('correction creates a new revision and append log; prior content stays historical', async () => {
  const f = wikiFixture(), input = wikiInput(), old = await f.layer.generate(input);
  revise(input, 'a-mail', '메일 안내\n납기는 2026-10-16으로 정정하며 출하 승인은 보류한다.');
  assert.equal((await f.layer.readCurrent(input)).reason, 'wiki_stale_or_withdrawn');
  input.expected_previous = old.record.generation_id; const current = await f.layer.generate(input);
  assert.equal(current.record.content.work_log.length, 2);
  assert.deepEqual(current.record.content.work_log[0], old.record.content.work_log[0]);
  const page = current.record.content.pages.find(p => p.page_id === 'source:source:a-mail');
  assert.match(page.markdown, /2026-10-16/); assert.doesNotMatch(page.markdown.split('## 기록')[0], /2026-10-09/);
  assert.ok(current.record.content.edges.some(e => e.kind === 'SUPERSEDES'));
  assert.deepEqual(await f.archive.get(old.record.generation_id), old.record.content);
});
test('withdrawal survives graph loss, re-ingest, whitespace variants and rejects old restore', async () => {
  const f = wikiFixture(), input = wikiInput(), old = await f.layer.generate(input);
  const text = old.record.content.statements.find(s => s.unit_id === 'a-mail').text;
  input.withdrawals = [withdrawalFingerprint(text)]; input.expected_previous = old.record.generation_id;
  const current = await f.layer.generate(input); assert.equal(current.record.content.statements.length, 2);
  await f.graph.clearTestNamespace();
  const fresh = wikiInput();
  await assert.rejects(() => f.layer.restore({ input: fresh, generation_id: old.record.generation_id }), /wiki_restore_stale/);
  revise(fresh, 'a-mail', '메일 안내\n' + text.replaceAll(' ', '　'));
  const regenerated = await f.layer.generate(fresh); assert.equal(regenerated.record.content.statements.length, 2);
  assert.ok(regenerated.record.content.excluded.some(s => s.withdrawn));
});
test('empty input and empty model output cannot overwrite existing pages', async () => {
  let empty = false; const f = wikiFixture({ generate: input => empty ? { candidates: [] } : extractiveFake(input) });
  const input = wikiInput(), old = await f.layer.generate(input), blank = wikiInput();
  blank.request.units = []; blank.request.grant.units = []; blank.expected_previous = old.record.generation_id;
  assert.equal((await f.layer.generate(blank)).reason, 'empty_input');
  empty = true; revise(input, 'a-mail', '새 안내\n새 납기는 아직 확정하지 않은 상태이다.'); input.expected_previous = old.record.generation_id;
  assert.equal((await f.layer.generate(input)).reason, 'empty_generation');
  assert.equal((await f.graph.read('SYN-A')).generation_id, old.record.generation_id);
  assert.equal((await f.layer.readCurrent(input)).status, 'HOLD');
});
test('invalid sentences omitted; gaps and weak high-impact exceptions retained', async () => {
  const f = wikiFixture({ generate: input => { const out = extractiveFake(input); out.candidates[0].text = '계약 금액은 900 USD로 확정한다.';
    out.candidates[0].quote = out.candidates[0].text;
    out.review.gaps = [{ unit_ids: [out.candidates[0].unit_id], note: '모델이 근거 부족으로 보고함' }];
    out.review.exceptions = [{ statement_id: out.candidates[0].statement_id, impact_kinds: ['amount'], reason: '모델이 금액 근거 부족을 보고함' }]; return out; } });
  const result = await f.layer.generate(wikiInput()); const c = result.record.content;
  assert.equal(c.excluded.length, 1); assert.equal(c.gaps.length, 1); assert.equal(c.exceptions.length, 1);
  assert.doesNotMatch(c.pages[0].markdown, /900 USD/); assert.equal(c.exceptions[0].exception_required, true);
});
test('model-reported contradictions are retained without a mechanical winner', async () => {
  const f = wikiFixture({ generate: input => { const out = extractiveFake(input); out.candidates[0].claim = { subject: '가상대상', key: '상태', value: 'A' };
    out.candidates[1].claim = { subject: '가상대상', key: '상태', value: 'B' };
    out.review.conflicts = [{ left: out.candidates[0].statement_id, right: out.candidates[1].statement_id, note: '모델의 모순 후보' }]; return out; } });
  const c = (await f.layer.generate(wikiInput())).record.content;
  assert.equal(c.conflicts.length, 1); assert.equal(c.conflicts[0].meaning_verified, false); assert.equal(c.statements.length, 3);
});
test('concurrent changes require expected-prior and one CAS winner', async () => {
  const f = wikiFixture(), first = wikiInput(), second = wikiInput(); revise(second, 'a-mail', '메일 안내\n납기는 2026-10-30으로 새로 제안되었다.');
  const result = await Promise.allSettled([f.layer.generate(first), f.layer.generate(second)]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(result.filter(r => r.status === 'rejected').length, 1);
});
test('archive written before failed graph commit is safely retryable', async () => {
  const graph = createMemoryGraph(); let broken = true;
  const f = wikiFixture({ graph: { read: graph.read, async commit(...args) { if (broken) throw new Error('synthetic_failure'); return graph.commit(...args); } } });
  await assert.rejects(() => f.layer.generate(wikiInput())); assert.equal(await graph.read('SYN-A'), null);
  broken = false; assert.equal((await f.layer.generate(wikiInput())).status, 'READY');
});
test('stale or failed withdrawal writes leave current reads unchanged, with recovery intents separate', async () => {
  const graph = createMemoryGraph(); let broken = false;
  const f = wikiFixture({ graph: { read: graph.read, async commit(...args) { if (broken) throw new Error('synthetic_failure'); return graph.commit(...args); } } });
  const input = wikiInput(), old = await f.layer.generate(input), withdrawn = wikiInput();
  withdrawn.withdrawals = [withdrawalFingerprint(old.record.content.statements[0].text)];
  withdrawn.expected_previous = 'sha256:' + 'f'.repeat(64);
  await assert.rejects(() => f.layer.generate(withdrawn), /wiki_prior_mismatch/);
  assert.deepEqual(await f.archive.getWithdrawals('SYN-A'), []); assert.deepEqual(await f.archive.getRecoveryWithdrawals('SYN-A'), []);
  assert.equal((await f.layer.readCurrent(input)).status, 'READY');
  withdrawn.expected_previous = old.record.generation_id; broken = true;
  await assert.rejects(() => f.layer.generate(withdrawn));
  assert.deepEqual(await f.archive.getWithdrawals('SYN-A'), []); assert.equal((await f.layer.readCurrent(input)).status, 'READY');
  assert.deepEqual(await f.archive.getRecoveryWithdrawals('SYN-A'), withdrawn.withdrawals);
  await graph.clearTestNamespace();
  await assert.rejects(() => f.layer.restore({ input, generation_id: old.record.generation_id }), /wiki_restore_stale/);
});
test('archive restores current generation with equal bytes and project checks', async () => {
  const f = wikiFixture(), input = wikiInput(), original = await f.layer.generate(input);
  await f.graph.clearTestNamespace(); const restored = await f.layer.restore({ input, generation_id: original.record.generation_id });
  assert.deepEqual(restored.record, original.record);
  await assert.rejects(() => f.layer.restore({ input: wikiInput('SYN-B'), generation_id: original.record.generation_id }));
});
test('disabled, missing budget, input/output excess and hanging providers fail closed', async () => {
  const disabled = wikiFixture({ enabled: false }); assert.equal((await disabled.layer.generate(wikiInput())).status, 'HOLD'); assert.equal(disabled.calls(), 0);
  assert.throws(() => wikiFixture({ budget: {} }));
  const small = wikiFixture({ budget: { ...BUDGET, max_input_characters: 10 } }); assert.equal((await small.layer.generate(wikiInput())).reason, 'generation_input_budget'); assert.equal(small.calls(), 0);
  const big = wikiFixture({ budget: { ...BUDGET, max_output_characters: 10 } }); assert.equal((await big.layer.generate(wikiInput())).status, 'HOLD');
  const hanging = wikiFixture({ budget: { ...BUDGET, timeout_ms: 15 }, generate: () => new Promise(() => {}) });
  assert.equal((await hanging.layer.generate(wikiInput())).status, 'HOLD');
});
test('K0 before/after scores use actual generated source pages with the same pins', async () => {
  const f = wikiFixture(), corpus = readCorpus(), generated = new Map();
  for (const project of ['SYN-A', 'SYN-B']) generated.set(project, (await f.layer.generate(wikiInput(project))).record.content);
  const answers = corpus.questions.map(q => ({ id: q.id, project_ref: q.project_ref,
    text: generated.get(q.project_ref).pages.find(p => p.page_id.startsWith('source:') && p.source_unit_ids.includes(q.unit_id)).markdown }));
  const before = evaluateKnowledgeAnswers({ corpus, answers: fixtureAnswers(corpus, 'headings') });
  const after = evaluateKnowledgeAnswers({ corpus, answers });
  const reference = evaluateKnowledgeAnswers({ corpus, answers: fixtureAnswers(corpus, 'reference') });
  assert.equal(reference.summary.mean_found, 1); assert.equal(reference.summary.mean_cited, 1); assert.equal(reference.summary.errors_total, 0);
  assert.equal(before.corpus_sha256, after.corpus_sha256); assert.equal(before.model_id, after.model_id); assert.equal(before.budget, after.budget);
  assert.equal(before.summary.mean_found, 0); assert.equal(after.summary.mean_found, 1); assert.equal(after.summary.mean_cited, 1); assert.equal(after.summary.errors_total, 0);
});

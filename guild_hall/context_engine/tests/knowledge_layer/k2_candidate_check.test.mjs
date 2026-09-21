import test from 'node:test';
import assert from 'node:assert/strict';
import { linkApprovedUnits, checkKnowledgeCandidates } from '../../src/knowledge_layer/index.mjs';
import { NOW, syntheticRequest } from './fixtures.mjs';
const fixture = () => {
  const bundle = linkApprovedUnits(syntheticRequest());
  const candidates = bundle.units.map(u => ({ statement_id: 'statement:' + u.unit_id, unit_id: u.unit_id,
    text: u.text.split('\n')[1], quote: u.text.split('\n')[1], impact_kinds: [], claim: null }));
  return { bundle, candidates, now: NOW };
};
test('verbatim source attribution is eligible but is never semantic truth or acceptance', () => {
  const input = fixture(), before = structuredClone(input), result = checkKnowledgeCandidates(input);
  assert.equal(result.counts.eligible, 3); assert.equal(result.counts.exceptions, 0);
  for (const row of result.results) {
    assert.equal(row.meaning_check, 'source_attribution_only'); assert.equal(row.semantic_fact_verified, false);
    assert.equal(row.knowledge_accepted, false); assert.equal(row.display_label, '자동 정리본');
    assert.equal(row.string_check.status, 'exact_match'); assert.ok(Object.isFrozen(row));
    assert.equal(row.quote_sha256, row.string_check.quote_sha256);
  }
  assert.deepEqual(input, before);
});
test('NFC and Unicode whitespace comparison retain original citation offsets', () => {
  const f = fixture(), row = f.candidates[0]; row.text = row.text.normalize('NFD').replaceAll(' ', '　'); row.quote = row.text;
  const checked = checkKnowledgeCandidates(f).results[0]; assert.equal(checked.eligible_for_wiki, true);
  assert.equal(checked.string_check.status, 'normalized_match'); assert.ok(checked.string_check.start > 0);
});
for (const [name, change] of [
  ['number', text => text.replace('10 mA', '100 mA')],
  ['unit', text => text.replace('10 mA', '10 A')],
  ['negation', text => text.replace('유지한다', '유지하지 않는다')],
]) test(name + ' changed in the claimed quote is rejected', () => {
  const f = fixture(), row = f.candidates.find(c => c.unit_id === 'a-voice'); row.quote = change(row.quote); row.text = row.quote;
  assert.equal(checkKnowledgeCandidates(f).results.find(r => r.unit_id === 'a-voice').eligible_for_wiki, false);
});
test('a real quote cannot validate a different paraphrase or reversed approval', () => {
  const f = fixture(), row = f.candidates.find(c => c.unit_id === 'a-mail'); row.text = '납기는 2026-10-09이며 승인 완료로 확정한다.';
  const result = checkKnowledgeCandidates(f).results.find(r => r.unit_id === 'a-mail');
  assert.equal(result.string_check.status, 'exact_match'); assert.equal(result.meaning_check, 'unverified');
  assert.equal(result.eligible_for_wiki, false); assert.equal(result.exception_required, true);
  assert.ok(result.impact_kinds.includes('deadline')); assert.ok(result.impact_kinds.includes('decision'));
});
test('weak high-impact sentences become exceptions even if the model omits impact tags', () => {
  const f = fixture(); f.candidates = [{ ...f.candidates[0], text: '고객 계약 금액은 300 USD로 확정하고 내일 납품한다.', quote: '고객 계약 금액은 300 USD로 확정하고 내일 납품한다.' }];
  const result = checkKnowledgeCandidates(f).results[0];
  assert.equal(result.exception_required, true); assert.ok(result.impact_kinds.includes('amount'));
  assert.ok(result.impact_kinds.includes('external_commitment'));
});
test('weak general text is rejected without manufacturing a human exception', () => {
  const f = fixture(); f.candidates = [{ ...f.candidates[0], text: '이것은 새로운 일반 설명입니다.', quote: '이것은 새로운 일반 설명입니다.' }];
  const row = checkKnowledgeCandidates(f).results[0]; assert.equal(row.eligible_for_wiki, false); assert.equal(row.exception_required, false);
});
test('short negation stays visible as a failed exception, never stripped to a positive claim', () => {
  const f = fixture(); f.candidates = [{ ...f.candidates[0], text: '승인 안 함', quote: '승인 안 함' }];
  const row = checkKnowledgeCandidates(f).results[0]; assert.equal(row.string_check.reason, 'quote_too_short');
  assert.equal(row.text, '승인 안 함'); assert.equal(row.exception_required, true);
});
test('unknown units cannot route to another project or source', () => {
  const f = fixture(); f.candidates[0].unit_id = 'b-mail'; const row = checkKnowledgeCandidates(f).results[0];
  assert.equal(row.string_check.status, 'source_missing'); assert.equal(row.evidence_ref, null);
});
test('structured claims remain unverified lint candidates even with a correct quote', () => {
  const f = fixture(); f.candidates[0].claim = { subject: '가상대상', key: '결정', value: '모델의 분류' };
  const row = checkKnowledgeCandidates(f).results[0]; assert.equal(row.structured_claim_check, 'unverified_lint_candidate');
  assert.equal(row.evidence_strength, 'weak'); assert.equal(row.knowledge_accepted, false);
});
test('duplicate ids, false authority fields, expired bundles and empty batch handling', () => {
  let f = fixture(); f.candidates.push(f.candidates[0]); assert.throws(() => checkKnowledgeCandidates(f));
  f = fixture(); f.candidates[0].semantic_fact_verified = true; assert.throws(() => checkKnowledgeCandidates(f));
  f = fixture(); f.now = f.bundle.grant.expires_at; assert.throws(() => checkKnowledgeCandidates(f));
  f = fixture(); f.candidates = []; assert.equal(checkKnowledgeCandidates(f).counts.supplied, 0);
});
test('top-level accessors and unknown authority fields are refused before access', () => {
  let called = false; const f = fixture(); Object.defineProperty(f, 'now', { get() { called = true; return NOW; } });
  assert.throws(() => checkKnowledgeCandidates(f)); assert.equal(called, false);
  assert.throws(() => checkKnowledgeCandidates({ ...fixture(), approved: true }));
});

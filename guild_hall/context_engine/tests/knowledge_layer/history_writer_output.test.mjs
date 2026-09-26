import test from 'node:test';
import assert from 'node:assert/strict';
import { checkHistoryBatchDraft, extractHistoryDraft } from '../../src/history_writer_output.mjs';

const prepared = { prepare_id: 'sha256:prepared' };
const packet = { packet_id: 'sha256:packet' };
const batch = { user: { threads: [{ records: [{ source_id: 'A' }] }] } };
const draft = { schema: 'soulforge.history_external_draft.v1',
  prepare_id: prepared.prepare_id,
  drafts: [{ packet_id: packet.packet_id,
    sentences: [{ text: '기록했다.', evidence_ids: ['A'] }] }] };

test('extracts the history JSON portion from prose and a code fence', () => {
  assert.deepEqual(extractHistoryDraft(`먼저 살폈다.\n` + JSON.stringify(draft) + '\n완료.'), draft);
  assert.deepEqual(extractHistoryDraft('```json\n' + JSON.stringify(draft) + '\n```'), draft);
  assert.equal(extractHistoryDraft('JSON이 없는 일반 문장'), null);
  assert.deepEqual(extractHistoryDraft('{} '.repeat(30) + JSON.stringify(draft)), draft);
  assert.equal(extractHistoryDraft('{} '.repeat(31) + JSON.stringify(draft)), null);
});

test('bounds the brace scan for a long run of unclosed braces', () => {
  const start = Date.now();
  assert.equal(extractHistoryDraft('{'.repeat(200_000)), null);
  assert.ok(Date.now() - start < 2000);
});

test('keeps source-link errors distinct from format errors', () => {
  assert.deepEqual(checkHistoryBatchDraft(draft, prepared, packet, batch),
    { ok: true, sentences: draft.drafts[0].sentences, source_link_errors: 0 });
  const wrong = structuredClone(draft);
  wrong.drafts[0].sentences[0].evidence_ids = ['OTHER'];
  assert.deepEqual(checkHistoryBatchDraft(wrong, prepared, packet, batch),
    { ok: false, reason: 'source_link_invalid_after_retry', source_link_errors: 1,
      detail: 'unknown_evidence_ids', bad_ids: ['OTHER'] });
  assert.equal(checkHistoryBatchDraft(null, prepared, packet, batch).reason,
    'format_invalid_after_retry');
});

test('a format rejection names a fixed detail code and the sentence it stopped at', () => {
  const detail = mutate => { const value = structuredClone(draft); mutate(value);
    const checked = checkHistoryBatchDraft(value, prepared, packet, batch);
    return [checked.reason, checked.detail, checked.sentence_index ?? null]; };
  assert.deepEqual(checkHistoryBatchDraft(null, prepared, packet, batch).detail, 'json_not_found');
  assert.deepEqual(detail(value => { value.extra = 1; }), ['format_invalid_after_retry', 'top_keys_invalid', null]);
  assert.deepEqual(detail(value => { value.prepare_id = 'sha256:other'; }), ['format_invalid_after_retry', 'prepare_id_mismatch', null]);
  assert.deepEqual(detail(value => { value.drafts.push(value.drafts[0]); }), ['format_invalid_after_retry', 'drafts_count_invalid', null]);
  assert.deepEqual(detail(value => { value.drafts[0].packet_id = 'x'; }), ['format_invalid_after_retry', 'packet_id_mismatch', null]);
  assert.deepEqual(detail(value => { value.drafts[0].note = 'x'; }), ['format_invalid_after_retry', 'draft_keys_invalid', null]);
  assert.deepEqual(detail(value => { value.drafts[0].sentences.push({ text: '제목', evidence_ids: [] }); }),
    ['format_invalid_after_retry', 'evidence_ids_missing', 2]);
  assert.deepEqual(detail(value => { value.drafts[0].sentences[0].line = 1; }),
    ['format_invalid_after_retry', 'sentence_keys_invalid', 1]);
  assert.deepEqual(detail(value => { value.drafts[0].sentences[0].evidence_ids = ['A', 'A']; }),
    ['format_invalid_after_retry', 'evidence_ids_duplicate', 1]);
  assert.deepEqual(detail(value => { value.drafts[0].sentences[0].text = ' '; }),
    ['format_invalid_after_retry', 'sentence_text_invalid', 1]);
});

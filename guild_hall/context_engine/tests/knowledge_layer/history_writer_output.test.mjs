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

test('keeps source-link errors distinct from format errors', () => {
  assert.deepEqual(checkHistoryBatchDraft(draft, prepared, packet, batch),
    { ok: true, sentences: draft.drafts[0].sentences, source_link_errors: 0 });
  const wrong = structuredClone(draft);
  wrong.drafts[0].sentences[0].evidence_ids = ['OTHER'];
  assert.deepEqual(checkHistoryBatchDraft(wrong, prepared, packet, batch),
    { ok: false, reason: 'source_link_invalid_after_retry', source_link_errors: 1 });
  assert.equal(checkHistoryBatchDraft(null, prepared, packet, batch).reason,
    'format_invalid_after_retry');
});

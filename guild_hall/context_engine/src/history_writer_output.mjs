// Parse a bounded Hermes final answer without editing any authored sentence.
export function extractHistoryDraft(raw) {
  if (typeof raw !== 'string' || raw.length > 500_000) return null;
  const MAX_PARSE_ATTEMPTS = 32;
  const MAX_SCAN_STEPS = raw.length * 8;
  let attempts = 0;
  let scanSteps = 0;
  const parse = candidate => {
    if (++attempts > MAX_PARSE_ATTEMPTS) return null;
    try {
      const value = JSON.parse(candidate);
      return value?.schema === 'soulforge.history_external_draft.v1' ? value : null;
    } catch { return null; }
  };
  const direct = parse(raw.trim());
  if (direct) return direct;
  for (let start = 0; start < raw.length; start++) {
    if (attempts >= MAX_PARSE_ATTEMPTS) return null;
    if (scanSteps >= MAX_SCAN_STEPS) return null;
    if (raw[start] !== '{') continue;
    let depth = 0, quoted = false, escaped = false;
    for (let end = start; end < raw.length; end++) {
      scanSteps++;
      if (scanSteps >= MAX_SCAN_STEPS) return null;
      const char = raw[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        const value = parse(raw.slice(start, end + 1));
        if (value) return value;
        break;
      }
    }
  }
  return null;
}

// A rejected answer carries `detail` (a fixed code, never answer text) so the caller
// can record why and tell the writer exactly what to fix on the retry. `bad_ids`
// lists (at most 20) evidence ids the answer cited that the batch does not allow;
// `sentence_index` is the 1-based sentence a sentence-level check stopped at.
export const HISTORY_ANSWER_DETAIL_CODES = Object.freeze(['empty_answer', 'json_not_found', 'top_keys_invalid',
  'prepare_id_mismatch', 'drafts_count_invalid', 'packet_id_mismatch', 'draft_keys_invalid', 'sentences_invalid',
  'sentence_keys_invalid', 'sentence_text_invalid', 'evidence_ids_missing', 'evidence_ids_duplicate',
  'evidence_ids_not_string', 'unknown_evidence_ids']);
export function checkHistoryBatchDraft(value, prepared, packet, batch) {
  const invalid = (reason, detail, extra = {}) => ({ ok: false, reason, source_link_errors: 0, detail, ...extra });
  const format = (detail, extra) => invalid('format_invalid_after_retry', detail, extra);
  if (!value) return format('json_not_found');
  if (Object.keys(value).sort().join(',') !== 'drafts,prepare_id,schema'
    || value.schema !== 'soulforge.history_external_draft.v1') return format('top_keys_invalid');
  if (value.prepare_id !== prepared.prepare_id) return format('prepare_id_mismatch');
  if (!Array.isArray(value.drafts) || value.drafts.length !== 1) return format('drafts_count_invalid');
  if (value.drafts[0]?.packet_id !== packet.packet_id) return format('packet_id_mismatch');
  if (Object.keys(value.drafts[0]).sort().join(',') !== 'packet_id,sentences') return format('draft_keys_invalid');
  if (!Array.isArray(value.drafts[0].sentences) || value.drafts[0].sentences.length > 1000)
    return format('sentences_invalid');
  const allowed = new Set(batch.user.threads.flatMap(thread => thread.records)
    .map(row => row.source_id ?? row.id));
  let errors = 0;
  const bad = new Set();
  for (const [index, sentence] of value.drafts[0].sentences.entries()) {
    const at = { sentence_index: index + 1 };
    if (!sentence || typeof sentence !== 'object' || Object.keys(sentence).sort().join(',') !== 'evidence_ids,text')
      return format('sentence_keys_invalid', at);
    if (typeof sentence.text !== 'string' || !sentence.text.trim() || sentence.text.length > 10000)
      return format('sentence_text_invalid', at);
    if (!Array.isArray(sentence.evidence_ids) || !sentence.evidence_ids.length) return format('evidence_ids_missing', at);
    if (sentence.evidence_ids.some(id => typeof id !== 'string')) return format('evidence_ids_not_string', at);
    if (new Set(sentence.evidence_ids).size !== sentence.evidence_ids.length) return format('evidence_ids_duplicate', at);
    for (const id of sentence.evidence_ids) if (!allowed.has(id)) { errors++; if (bad.size < 20) bad.add(id); }
  }
  return errors ? { ...invalid('source_link_invalid_after_retry', 'unknown_evidence_ids', { bad_ids: [...bad] }),
    source_link_errors: errors }
    : { ok: true, sentences: value.drafts[0].sentences, source_link_errors: 0 };
}

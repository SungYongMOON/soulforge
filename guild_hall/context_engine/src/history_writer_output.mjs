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

export function checkHistoryBatchDraft(value, prepared, packet, batch) {
  const invalid = (reason, source_link_errors = 0) => ({ ok: false, reason, source_link_errors });
  if (!value || Object.keys(value).sort().join(',') !== 'drafts,prepare_id,schema'
    || value.schema !== 'soulforge.history_external_draft.v1'
    || value.prepare_id !== prepared.prepare_id || !Array.isArray(value.drafts)
    || value.drafts.length !== 1 || value.drafts[0]?.packet_id !== packet.packet_id
    || Object.keys(value.drafts[0]).sort().join(',') !== 'packet_id,sentences'
    || !Array.isArray(value.drafts[0].sentences) || value.drafts[0].sentences.length > 1000)
    return invalid('format_invalid_after_retry');
  const allowed = new Set(batch.user.threads.flatMap(thread => thread.records)
    .map(row => row.source_id ?? row.id));
  let errors = 0;
  for (const sentence of value.drafts[0].sentences) {
    if (!sentence || Object.keys(sentence).sort().join(',') !== 'evidence_ids,text'
      || typeof sentence.text !== 'string' || !sentence.text.trim() || sentence.text.length > 10000
      || !Array.isArray(sentence.evidence_ids) || !sentence.evidence_ids.length
      || new Set(sentence.evidence_ids).size !== sentence.evidence_ids.length
      || sentence.evidence_ids.some(id => typeof id !== 'string'))
      return invalid('format_invalid_after_retry');
    errors += sentence.evidence_ids.filter(id => !allowed.has(id)).length;
  }
  return errors ? invalid('source_link_invalid_after_retry', errors)
    : { ok: true, sentences: value.drafts[0].sentences, source_link_errors: 0 };
}

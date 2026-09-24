// Deterministic, bounded day packing. Source offsets use UTF-16 indices, never
// bisect a surrogate pair, and reconstruct each original record byte-for-byte.
import { hashText, snapshot } from './data.mjs';

const wire = value => JSON.stringify(snapshot(value));
const modelRow = (row, start = 0, end = row.text.length) => {
  const { originrefs, text_sha256, ...safe } = row;
  const text = row.text.slice(start, end);
  return { ...safe, text, text_sha256: hashText(text), part: { start, end } };
};
const payload = (project, day, threads) => ({ project, day, threads });
const fits = (project, day, threads, limit) => wire(payload(project, day, threads)).length <= limit;
function endAt(text, start, end) {
  if (end < text.length && end > start && /[\uD800-\uDBFF]/u.test(text[end - 1]) && /[\uDC00-\uDFFF]/u.test(text[end])) end--;
  const newline = text.lastIndexOf('\n', end - 1);
  if (newline >= start + Math.floor((end - start) / 2)) end = newline + 1;
  return end;
}
function splitRecord(project, day, key, row, limit) {
  const parts = [];
  for (let start = 0; start < row.text.length;) {
    let low = start + 1, high = row.text.length, best = start;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (fits(project, day, [{ thread_ref: key, records: [modelRow(row, start, mid)] }], limit)) { best = mid; low = mid + 1; }
      else high = mid - 1;
    }
    const end = endAt(row.text, start, best);
    if (end <= start) throw new Error('history_batch_record_too_large');
    parts.push({ thread_ref: key, records: [modelRow(row, start, end)] });
    start = end;
  }
  if (!parts.length) throw new Error('history_batch_record_too_large');
  return parts;
}
export function partitionDay({ project, day, rows, limit }) {
  if (!Number.isSafeInteger(limit) || limit < 1000 || limit > 500000) throw new Error('history_batch_limit_invalid');
  const groups = new Map();
  for (const row of rows) { const key = row.thread_ref ? 'thread:' + row.thread_ref : 'record:' + row.id;
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
  const units = [];
  for (const [key, records] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const whole = { thread_ref: key, records: records.map(row => modelRow(row)) };
    if (fits(project, day, [whole], limit)) { units.push(whole); continue; }
    for (const row of records) {
      const single = { thread_ref: key, records: [modelRow(row)] };
      if (fits(project, day, [single], limit)) units.push(single);
      else units.push(...splitRecord(project, day, key, row, limit));
    }
  }
  const batches = [], sourceById = new Map(rows.map(row => [row.id, row]));
  let held = [];
  const flush = () => { if (!held.length) return;
    const parts = held.flatMap(thread => thread.records.map(row => ({ source_id: row.id,
      start: row.part.start, end: row.part.end, part_sha256: row.text_sha256,
      source_text_sha256: sourceById.get(row.id).text_sha256 ?? hashText(sourceById.get(row.id).text),
      originrefs: sourceById.get(row.id).originrefs })));
    const user = payload(project, day, held);
    batches.push({ user, characters: wire(user).length, parts }); held = [];
  };
  for (const unit of units) {
    if (held.length && !fits(project, day, [...held, unit], limit)) flush();
    if (!fits(project, day, [unit], limit)) throw new Error('history_batch_record_too_large');
    held.push(unit);
  }
  flush();
  return batches;
}

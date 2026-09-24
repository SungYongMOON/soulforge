// Deterministic, bounded day packing. Source offsets use UTF-16 indices, never
// bisect a surrogate pair, and reconstruct each original record byte-for-byte.
import { hashText, snapshot } from './data.mjs';

const wire = value => JSON.stringify(snapshot(value));
const modelRow = (row, start = 0, end = row.text.length) => {
  const { originrefs, text_sha256, ...safe } = row;
  const text = row.text.slice(start, end);
  if (row.evidence_mode === 'source_id') return { source_id: row.id, evidence_mode: 'source_id', text,
    text_sha256: hashText(text), part: { start, end } };
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
    const parts = held.flatMap(thread => thread.records.map(row => ({ source_id: row.source_id ?? row.id,
      start: row.part.start, end: row.part.end, part_sha256: row.text_sha256,
      source_text_sha256: sourceById.get(row.source_id ?? row.id).text_sha256 ?? hashText(sourceById.get(row.source_id ?? row.id).text),
      originrefs: sourceById.get(row.source_id ?? row.id).originrefs })));
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

// One level only: split the text already supplied in one batch, never reopen a
// source path or expand beyond the parent's source offsets.
export function bisectBatch(batch) {
  const records = batch.user.threads.flatMap(thread => thread.records.map(record => ({ thread_ref: thread.thread_ref, record })));
  if (records.length !== batch.parts.length) throw new Error('history_batch_parts_mismatch');
  const sizes = records.map(({ record }, index) => {
    const part = batch.parts[index];
    if ((record.source_id ?? record.id) !== part.source_id || record.part.start !== part.start || record.part.end !== part.end
      || record.text.length !== part.end - part.start || hashText(record.text) !== part.part_sha256)
      throw new Error('history_batch_parts_mismatch');
    return record.text.length;
  });
  const total = sizes.reduce((sum, n) => sum + n, 0);
  if (total < 2) return null;
  let cut = -1, distance = Infinity, cumulative = 0;
  for (let index = 1; index < records.length; index++) {
    cumulative += sizes[index - 1];
    if (cumulative > 0 && cumulative < total && Math.abs(cumulative - total / 2) < distance) {
      cut = index; distance = Math.abs(cumulative - total / 2);
    }
  }
  let groups;
  if (cut > 0 && distance <= total / 4) groups = [[...records.slice(0, cut).map((item, index) => ({ ...item, part: batch.parts[index] }))],
    [...records.slice(cut).map((item, index) => ({ ...item, part: batch.parts[cut + index] }))]];
  else {
    let beforeSize = 0;
    const item = records.find(({ record }) => { const crossing = beforeSize <= total / 2 && beforeSize + record.text.length >= total / 2;
      beforeSize += record.text.length; return crossing && record.text.length > 1; })
      ?? records.find(({ record }) => record.text.length > 1);
    if (!item) return null;
    const index = records.indexOf(item), original = batch.parts[index], text = item.record.text;
    const preceding = sizes.slice(0, index).reduce((sum, n) => sum + n, 0);
    let at = Math.round(total / 2 - preceding);
    if (at <= 0 || at >= text.length) at = Math.floor(text.length / 2);
    const before = text.lastIndexOf('\n', at), after = text.indexOf('\n', at);
    const newline = [before + 1, after + 1].filter(pos => pos > 0 && pos < text.length)
      .sort((a, b) => Math.abs(a - text.length / 2) - Math.abs(b - text.length / 2))[0];
    if (newline && Math.abs(newline - text.length / 2) <= text.length / 4) at = newline;
    if (at > 0 && at < text.length && /[\uD800-\uDBFF]/u.test(text[at - 1])
      && /[\uDC00-\uDFFF]/u.test(text[at])) at--;
    if (at <= 0 || at >= text.length) return null;
    const half = (start, end) => {
      const excerpt = text.slice(start, end), absoluteStart = original.start + start, absoluteEnd = original.start + end;
      return { thread_ref: item.thread_ref,
        record: { ...item.record, text: excerpt, text_sha256: hashText(excerpt),
          part: { start: absoluteStart, end: absoluteEnd } },
        part: { ...original, start: absoluteStart, end: absoluteEnd, part_sha256: hashText(excerpt) } };
    };
    groups = [[...records.slice(0, index).map((entry, atIndex) => ({ ...entry, part: batch.parts[atIndex] })), half(0, at)],
      [half(at, text.length), ...records.slice(index + 1).map((entry, atIndex) => ({ ...entry, part: batch.parts[index + 1 + atIndex] }))]];
  }
  return groups.map(items => {
    const threads = [];
    for (const item of items) {
      const last = threads.at(-1);
      if (last?.thread_ref === item.thread_ref) last.records.push(item.record);
      else threads.push({ thread_ref: item.thread_ref, records: [item.record] });
    }
    const user = { project: batch.user.project, day: batch.user.day, threads };
    return { user, characters: wire(user).length, parts: items.map(item => item.part) };
  });
}

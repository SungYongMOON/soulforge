// Explicit private preparation surface for one project/month. It never opens
// source refs; the injected collector owns native source reads and attribution.
import { closeSync, existsSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest, snapshot, token } from './data.mjs';
import { historyInputFingerprint } from './history.mjs';

const SCHEMA = 'soulforge.history_prepare.v1';
const LANES = ['mail', 'slack', 'linear', 'voice'];
const fail = code => { throw new Error(code); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const serial = value => JSON.stringify(snapshot(value));
function validDate(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(day)
    && !Number.isNaN(Date.parse(day + 'T00:00:00Z'))
    && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;
}
export function yesterdayKst(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) fail('history_prepare_now_invalid');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
    .filter(part => ['year', 'month', 'day'].includes(part.type)).map(part => [part.type, part.value]));
  const today = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  today.setUTCDate(today.getUTCDate() - 1);
  return today.toISOString().slice(0, 10);
}
function storeFor(root, project, month) {
  if (typeof root !== 'string' || !isAbsolute(root) || !existsSync(root)) fail('history_prepare_root_invalid');
  const identity = lstatSync(root);
  if (!identity.isDirectory() || identity.isSymbolicLink()) fail('history_prepare_root_invalid');
  const guard = () => { const now = lstatSync(root);
    if (!now.isDirectory() || now.isSymbolicLink() || now.dev !== identity.dev || now.ino !== identity.ino)
      fail('history_prepare_root_changed'); };
  function path(name) { guard(); const file = join(root, name);
    if (existsSync(file)) { const st = lstatSync(file); if (!st.isFile() || st.isSymbolicLink()) fail('history_prepare_entry_invalid'); }
    return file;
  }
  function read(name, max = 20_000_000) { const file = path(name);
    if (!existsSync(file)) return null; if (lstatSync(file).size > max) fail('history_prepare_entry_large');
    return JSON.parse(readFileSync(file, 'utf8'));
  }
  function writeNew(name, value) {
    const file = path(name), bytes = serial(value) + '\n';
    if (Buffer.byteLength(bytes) > 20_000_000) fail('history_prepare_entry_large');
    let fd;
    try { fd = openSync(file, 'wx'); writeFileSync(fd, bytes); }
    catch (error) { if (error.code !== 'EEXIST' || serial(read(name)) !== serial(value)) throw error; }
    finally { if (fd !== undefined) closeSync(fd); }
  }
  function contentFile(kind, value) {
    const name = `history-prepare-${kind}-${digest(value).slice(7)}.json`;
    writeNew(name, value); return name;
  }
  function readContent(kind, name) {
    if (typeof name !== 'string' || !new RegExp(`^history-prepare-${kind}-[0-9a-f]{64}\\.json$`, 'u').test(name))
      fail('history_prepare_ref_invalid');
    const value = read(name); if (!value || digest(value).slice(7) !== name.slice(`history-prepare-${kind}-`.length, -5))
      fail('history_prepare_ref_corrupt');
    return value;
  }
  function replaceHead(value) {
    contentFile('head', value);
    const temp = `history-prepare-${randomUUID()}.tmp`, file = path(temp);
    let fd;
    try { fd = openSync(file, 'wx'); writeFileSync(fd, serial(value) + '\n'); }
    finally { if (fd !== undefined) closeSync(fd); }
    try { path('history-prepare-head.json'); renameSync(file, path('history-prepare-head.json')); }
    catch (error) { if (existsSync(file)) unlinkSync(file); throw error; }
  }
  const scope = { schema: SCHEMA, project, month };
  const oldScope = read('history-prepare-scope.json', 100_000);
  if (oldScope && serial(oldScope) !== serial(scope)) fail('history_prepare_scope_mismatch');
  return { root, path, read, writeNew, contentFile, readContent, replaceHead,
    ensureScope: () => { if (!oldScope) writeNew('history-prepare-scope.json', scope); } };
}
function dayFingerprints(records) {
  const groups = new Map();
  for (const row of records) { if (!groups.has(row.date)) groups.set(row.date, []); groups.get(row.date).push(row); }
  return Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b))
    .map(([day, rows]) => [day, digest(rows.map(row => digest(row)))]));
}
function mergeDisplay(previous, incoming, scannedIds) {
  const prior = plain(previous) ? snapshot(previous) : {}, next = plain(incoming) ? snapshot(incoming) : {};
  const merged = {};
  for (const field of ['source_attachments', 'source_body_sha256', 'slack_names', 'person_names', 'voice_sources']) {
    const oldMap = plain(prior[field]) ? prior[field] : {}, newMap = plain(next[field]) ? next[field] : {};
    const keep = Object.fromEntries(Object.entries(oldMap).filter(([key]) =>
      !['source_attachments', 'source_body_sha256', 'voice_sources'].includes(field) || !scannedIds.has(key)));
    merged[field] = { ...keep, ...newMap };
  }
  return snapshot(merged);
}
function sourceCounts(records) {
  const counts = {}; for (const row of records) counts[row.kind] = (counts[row.kind] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}
/** `collector` is the only source reader; `invokeHistory` runs the explicit existing history CLI. */
export async function prepareHistory({ project, date, fromDate, sourceConfig, outputRoot, mode = 'prepare',
  collector, now = new Date() } = {}) {
  if (!token(project) || mode !== 'prepare' || typeof collector !== 'function'
    || !plain(sourceConfig)) fail('history_prepare_request_invalid');
  const target = date ?? yesterdayKst(now), month = target?.slice(0, 7);
  if (!validDate(target) || !/^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) fail('history_prepare_date_invalid');
  const from = fromDate ?? `${month}-01`;
  if (!validDate(from) || !from.startsWith(month) || from > target) fail('history_prepare_window_invalid');
  const store = storeFor(outputRoot, project, month), lockFile = store.path('history-prepare.lock');
  let fd;
  try { fd = openSync(lockFile, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') fail('history_prepare_locked'); throw error; }
  const lockIdentity = lstatSync(lockFile);
  try {
    const previous = store.read('history-prepare-head.json', 100_000);
    if (previous && (previous.schema !== SCHEMA || previous.project !== project || previous.month !== month))
      fail('history_prepare_head_scope_mismatch');
    if (!previous && store.read('history-head.json', 100_000)) fail('history_prepare_baseline_missing');
    const priorInput = previous ? store.readContent('input', previous.input_file) : null;
    const priorDisplay = previous ? store.readContent('display', previous.display_file) : null;
    if (priorInput && (!Array.isArray(priorInput.records) || priorInput.project !== project || priorInput.month !== month
      || priorInput.as_of > target || previous.as_of > target)) fail('history_prepare_prior_invalid');
    const collected = await collector({ project, fromDate: from, throughDate: target, sourceConfig });
    if (!plain(collected) || !Array.isArray(collected.records) || !plain(collected.coverage?.lanes)
      || !plain(collected.coverage)) fail('history_prepare_source_invalid');
    if (LANES.some(lane => collected.coverage.lanes[lane]?.status !== 'ok')) {
      const coverage = snapshot(collected.coverage), sourceReceipts = snapshot(collected.sourceReceipts ?? []);
      const laneStatuses = Object.fromEntries(LANES.map(lane => [lane,
        ['ok', 'missing', 'error'].includes(coverage.lanes[lane]?.status) ? coverage.lanes[lane].status : 'missing']));
      const receipt = { schema: SCHEMA, status: 'source_hold', project, month, from_date: from,
        through_date: target, requested_days: [target], lane_statuses: laneStatuses,
        coverage, source_receipts: sourceReceipts,
        source_snapshot_sha256: digest({ coverage, sourceReceipts }) };
      store.ensureScope();
      return { status: 'source_hold', project, month, requested_days: [target], lane_statuses: laneStatuses,
        receipt_file: store.contentFile('receipt', receipt), history_calls: 0,
        stages: ['source_collect', 'source_hold'] };
    }
    const fresh = [], ids = new Set();
    for (const row of collected.records) {
      if (!plain(row) || !token(row.id) || !validDate(row.date) || row.date < from || row.date > target
        || (row.project !== undefined && row.project !== project) || ids.has(row.id)) fail('history_prepare_record_invalid');
      ids.add(row.id); fresh.push(snapshot(row));
    }
    fresh.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const scannedPrior = (priorInput?.records ?? []).filter(row => row.date >= from && row.date <= target);
    const movedPrior = (priorInput?.records ?? []).filter(row => ids.has(row.id)
      && (row.date < from || row.date > target));
    const scannedIds = new Set([...scannedPrior, ...movedPrior].map(row => row.id));
    const kept = (priorInput?.records ?? []).filter(row => (row.date < from || row.date > target) && !ids.has(row.id));
    const records = [...kept, ...fresh].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    if (!records.length && !priorInput) {
      const coverage = snapshot(collected.coverage), sourceReceipts = snapshot(collected.sourceReceipts ?? []);
      const receipt = { schema: SCHEMA, status: 'no_sources', project, month, from_date: from, through_date: target,
        requested_days: [target], changed_days: [], processing_dates: [], source_counts: {}, coverage,
        source_receipts: sourceReceipts, source_snapshot_sha256: digest({ coverage, sourceReceipts, record_hashes: [] }) };
      store.ensureScope();
      return { status: 'no_sources', project, month, requested_days: [target], changed_days: [],
        processing_dates: [], source_counts: {}, receipt_file: store.contentFile('receipt', receipt),
        history_calls: 0, stages: ['source_collect', 'coverage_gate', 'no_sources'] };
    }
    if (!records.length || new Set(records.map(row => row.id)).size !== records.length) fail('history_prepare_empty_or_duplicate');
    const input = { project, month, as_of: target, records };
    const historyFingerprint = historyInputFingerprint(input); // includes direct S1 memo guard
    const displayMetadata = mergeDisplay(priorDisplay, collected.displayMetadata, scannedIds);
    const oldDays = dayFingerprints(priorInput?.records ?? []), newDays = dayFingerprints(records);
    const changedDays = [...new Set([...Object.keys(oldDays), ...Object.keys(newDays)])]
      .filter(day => day >= from && day <= target && oldDays[day] !== newDays[day]);
    for (const row of movedPrior) changedDays.push(row.date, fresh.find(next => next.id === row.id).date);
    const distinctChangedDays = [...new Set(changedDays)].sort();
    const targetHasSource = records.some(row => row.date === target);
    const processingDates = [...new Set([...distinctChangedDays, ...(targetHasSource ? [target] : [])])].sort();
    const coverage = snapshot(collected.coverage), sourceReceipts = snapshot(collected.sourceReceipts ?? []);
    const sourceSnapshot = digest({ record_hashes: fresh.map(row => digest(row)), coverage, sourceReceipts,
      display_sha256: digest(displayMetadata) });
    store.ensureScope();
    const inputFile = store.contentFile('input', input), displayFile = store.contentFile('display', displayMetadata);
    const receipt = { schema: SCHEMA, status: 'source_frozen', project, month, from_date: from, through_date: target,
      requested_days: [target], changed_days: distinctChangedDays, processing_dates: processingDates,
      source_counts: sourceCounts(fresh), coverage, source_receipts: sourceReceipts,
      source_snapshot_sha256: sourceSnapshot, input_sha256: digest(input),
      display_sha256: digest(displayMetadata), history_input_fingerprint: historyFingerprint };
    const receiptFile = store.contentFile('receipt', receipt);
    const base = { project, month, requested_days: [target], changed_days: distinctChangedDays,
      processing_dates: processingDates, source_counts: receipt.source_counts,
      input_file: inputFile, display_file: displayFile, receipt_file: receiptFile, history_calls: 0,
      stages: ['source_collect', 'coverage_gate', 'source_frozen'] };
    const head = { schema: SCHEMA, project, month, as_of: target, input_file: inputFile,
      display_file: displayFile, receipt_file: receiptFile };
    if (serial(previous) !== serial(head)) store.replaceHead(head);
    return { status: 'source_frozen', ...base, stages: [...base.stages, 'source_head_advanced'] };
  } finally {
    closeSync(fd);
    const current = lstatSync(lockFile);
    if (current.dev !== lockIdentity.dev || current.ino !== lockIdentity.ino || current.isSymbolicLink())
      fail('history_prepare_lock_changed');
    unlinkSync(lockFile);
  }
}

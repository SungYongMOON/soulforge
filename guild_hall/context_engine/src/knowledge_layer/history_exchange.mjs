// File-only history handoff. No model transport, scheduler, or source reader.
import { closeSync, existsSync, lstatSync, openSync, unlinkSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { digest, hashText, sha, snapshot, token } from './data.mjs';
import { partitionDay } from './history_batches.mjs';
import { createHistoryStorage, historyInputFingerprint, historySourceLabel,
  historySourceCoverage, historyWeekFor, normalizeHistoryInput, renderHistory } from './history.mjs';

const SCHEMA = 'soulforge.history_draft.v1';
const PACKET_SCHEMA = 'soulforge.history_external_packet.v1';
const PREPARE_SCHEMA = 'soulforge.history_external_prepare.v1';
const DRAFT_SCHEMA = 'soulforge.history_external_draft.v1';
const LAYERS = ['daily', 'weekly', 'monthly', 'status'];
// Default daily batch budget (serialized user payload). A caller whose prompt
// wraps the batch may ask for a smaller one; a non-default value is recorded
// in the daily packet so finalize recounts the same batches.
const DEFAULT_BATCH_CHARACTERS = 7200;
const batchCharactersOf = packet => packet.batch_characters ?? DEFAULT_BATCH_CHARACTERS;
const fail = code => { throw new Error(code); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const serial = value => JSON.stringify(snapshot(value));
const sorted = values => [...values].sort((a, b) => a.localeCompare(b));
const emptyCells = () => ({ daily: {}, weekly: {}, monthly: {}, status: {} });
function scoped(input, outputRoot, rulesText) {
  const data = normalizeHistoryInput(input);
  if (typeof rulesText !== 'string' || !rulesText.trim() || rulesText.length > 100000)
    fail('history_exchange_request_invalid');
  if (typeof outputRoot !== 'string' || !isAbsolute(outputRoot)) fail('history_exchange_root_invalid');
  const store = createHistoryStorage(outputRoot, data.project, data.month, data.records.length === 0);
  const head = store.read('history-head.json');
  if (head && (head.schema !== SCHEMA || head.project !== data.project || head.month !== data.month))
    fail('history_exchange_head_scope_mismatch');
  if (head) {
    const saved = store.read(`history-head-${digest(head).slice(7)}.json`);
    if (serial(saved) !== serial(head) || !/^history-view-[0-9a-f]{64}\.md$/u.test(head.view_file ?? ''))
      fail('history_head_corrupt');
    const view = store.readText(head.view_file);
    if (view === null || hashText(view).slice(7) !== head.view_file.slice(13, 77)) fail('history_view_corrupt');
    if (head.projection_file !== undefined) {
      if (!/^history-projection-[0-9a-f]{64}\.json$/u.test(head.projection_file)) fail('history_projection_corrupt');
      const projection = store.read(head.projection_file);
      if (!projection || digest(projection).slice(7) !== head.projection_file.slice(19, 83)) fail('history_projection_corrupt');
    }
    if (head.draft_file !== undefined) {
      if (!/^history-draft-[0-9a-f]{64}\.json$/u.test(head.draft_file)) fail('history_draft_corrupt');
      const draft = store.read(head.draft_file);
      if (!draft || digest(draft).slice(7) !== head.draft_file.slice(14, 78)) fail('history_draft_corrupt');
    }
  }
  return { data, store, head, inputFingerprint: historyInputFingerprint(input), rulesHash: hashText(rulesText), outputRoot };
}
function readCell(ctx, fingerprint, layer, key) {
  if (!sha(fingerprint)) fail('history_exchange_cell_ref_invalid');
  const cell = ctx.store.read(`history-cell-${fingerprint.slice(7)}.json`);
  if (!cell || cell.fingerprint !== fingerprint || cell.layer !== layer || cell.key !== key
    || cell.project !== ctx.data.project || cell.month !== ctx.data.month) fail('history_exchange_cell_corrupt');
  const { content_sha256, ...body } = cell;
  if (content_sha256 !== hashText(serial(body))) fail('history_exchange_cell_corrupt');
  if (cell.card_batches !== undefined) {
    if (layer !== 'daily' || !Array.isArray(cell.cards) || cell.cards.length
      || !Array.isArray(cell.card_batches) || !cell.card_batches.length)
      fail('history_exchange_cell_corrupt');
    const cards = [];
    for (const [index, ref] of cell.card_batches.entries()) {
      if (!plain(ref) || !/^history-cell-batch-[0-9a-f]{64}\.json$/u.test(ref.file ?? '')
        || !sha(ref.sha256) || ref.file !== `history-cell-batch-${ref.sha256.slice(7)}.json`)
        fail('history_exchange_cell_corrupt');
      const part = ctx.store.read(ref.file);
      if (!part || part.schema !== 'soulforge.history_cell_batch.v1'
        || part.fingerprint !== fingerprint || part.index !== index + 1
        || !Array.isArray(part.cards) || part.cards.length !== ref.count
        || digest(part) !== ref.sha256) fail('history_exchange_cell_corrupt');
      cards.push(...part.cards);
    }
    return { ...cell, cards };
  }
  return cell;
}
function storedCell(cell) {
  try {
    const complete = { ...cell, content_sha256: hashText(serial(cell)) };
    serial(complete);
    return { cell: complete, batches: [] };
  } catch (error) {
    if (error?.message !== 'knowledge_input_budget' || cell.layer !== 'daily') throw error;
  }
  const groups = [], batches = [];
  let held = [];
  const flush = () => { if (held.length) { groups.push(held); held = []; } };
  for (const card of cell.cards) {
    const next = { schema: 'soulforge.history_cell_batch.v1', fingerprint: cell.fingerprint,
      index: groups.length + 1, cards: [...held, card] };
    let size;
    try { size = serial(next).length; }
    catch (error) {
      if (error?.message !== 'knowledge_input_budget' || !held.length) throw error;
      flush();
      held.push(card);
      continue;
    }
    if (size > 200_000 && held.length) flush();
    held.push(card);
  }
  flush();
  const refs = groups.map((cards, index) => {
    const value = { schema: 'soulforge.history_cell_batch.v1', fingerprint: cell.fingerprint,
      index: index + 1, cards };
    const sha256 = digest(value), file = `history-cell-batch-${sha256.slice(7)}.json`;
    batches.push({ file, value });
    return { file, sha256, count: cards.length };
  });
  const compact = { ...cell, cards: [], card_batches: refs };
  return { cell: { ...compact, content_sha256: hashText(serial(compact)) }, batches };
}
function grouped(data) {
  const days = new Map(), weeks = new Map();
  for (const row of data.records) { if (!days.has(row.date)) days.set(row.date, []); days.get(row.date).push(row); }
  for (const day of sorted(days.keys())) {
    const week = historyWeekFor(day, data.month, data.as_of);
    if (!weeks.has(week.key)) weeks.set(week.key, { ...week, days: [] });
    weeks.get(week.key).days.push(day);
  }
  return { days, weeks };
}
// A daily packet names its day's records by a composed digest (input format v2):
// the records themselves come from the same input, which the packet's
// input_fingerprint pins, so a day of thousands of voice lines never has to fit
// one snapshot together with the packet.
function dayDependencies(records) {
  return { records_sha256: hashText(records.map(row => digest(row)).join('\n')), record_count: records.length };
}
function dayRows(ctx, day) { return ctx.data.records.filter(row => row.date === day); }
function cellInput(layer, key, dependencies, rulesHash, data) {
  return digest({ schema: PACKET_SCHEMA, project: data.project, month: data.month,
    ...(['monthly', 'status'].includes(layer) ? { as_of: data.as_of } : {}),
    layer, key, dependencies, rules_sha256: rulesHash });
}
function currentCell(ctx, cells, layer, key, expected) {
  const ref = cells[layer]?.[key];
  if (!ref) return null;
  const cell = readCell(ctx, ref, layer, key);
  return cell.cell_input_fingerprint === expected && !cell.format_flag ? cell : null;
}
function packetFor(ctx, layer, key, dependencies, allowedIds, expectedHead) {
  const base = { schema: PACKET_SCHEMA, project: ctx.data.project, month: ctx.data.month,
    as_of: ctx.data.as_of, layer, key, input_fingerprint: ctx.inputFingerprint,
    cell_input_fingerprint: cellInput(layer, key, dependencies, ctx.rulesHash, ctx.data),
    rules_sha256: ctx.rulesHash, expected_head_sha256: expectedHead,
    dependencies, allowed_evidence_ids: sorted(new Set(allowedIds)),
    ...(layer === 'daily' && ctx.batchCharacters !== DEFAULT_BATCH_CHARACTERS
      ? { batch_characters: ctx.batchCharacters } : {}) };
  const packetId = digest(base);
  return { ...base, packet_id: packetId };
}
function nextTargets(data, cells, weeks) {
  const daily = sorted(new Set(data.records.map(row => row.date))).filter(day => !cells.daily[day]);
  const weekly = sorted(weeks.keys()).filter(key => !cells.weekly[key]);
  return { daily, weekly, monthly: cells.monthly[data.month] ? [] : [data.month],
    status: cells.status[data.month] ? [] : [data.month] };
}
function plannedTargets(ctx, plan) {
  const targets = nextTargets(ctx.data, ctx.head?.cells ?? emptyCells(), plan.weeks);
  const days = [...plan.packets.filter(packet => packet.layer === 'daily').map(packet => packet.key),
    ...plan.retired.daily];
  const weeks = [...days.map(day => historyWeekFor(day, ctx.data.month, ctx.data.as_of).key),
    ...plan.packets.filter(packet => packet.layer === 'weekly').map(packet => packet.key)]
    .filter(key => plan.weeks.has(key));
  const upperChanged = days.length || weeks.length || plan.retired.weekly.length
    || plan.packets.some(packet => packet.layer === 'monthly');
  return { daily: sorted(new Set([...targets.daily, ...days.filter(day => ctx.data.records.some(row => row.date === day))])),
    weekly: sorted(new Set([...targets.weekly, ...weeks])),
    monthly: upperChanged ? [ctx.data.month] : targets.monthly,
    status: upperChanged ? [ctx.data.month] : targets.status };
}
function readyPlan(ctx) {
  const { days, weeks } = grouped(ctx.data), current = ctx.head?.cells ?? emptyCells();
  const expectedHead = ctx.head ? digest(ctx.head) : null;
  const packets = [], readyDaily = new Map(), readyWeekly = new Map();
  const retired = { daily: sorted(Object.keys(current.daily ?? {}).filter(day => !days.has(day))),
    weekly: sorted(Object.keys(current.weekly ?? {}).filter(key => !weeks.has(key))) };
  for (const day of sorted(days.keys())) {
    const records = days.get(day), dependencies = dayDependencies(records);
    const fp = cellInput('daily', day, dependencies, ctx.rulesHash, ctx.data);
    const held = currentCell(ctx, current, 'daily', day, fp);
    if (held) readyDaily.set(day, held);
    else packets.push(packetFor(ctx, 'daily', day, dependencies, records.map(row => row.id), expectedHead));
  }
  for (const key of sorted(weeks.keys())) {
    const week = weeks.get(key);
    if (!week.days.every(day => readyDaily.has(day))) continue;
    const children = week.days.map(day => ({ day, version: readyDaily.get(day).fingerprint,
      cards: readyDaily.get(day).cards }));
    const dependencies = { week: { start: week.start, end: week.end, partial: week.partial }, days: children };
    const fp = cellInput('weekly', key, dependencies, ctx.rulesHash, ctx.data);
    const held = currentCell(ctx, current, 'weekly', key, fp);
    if (held) readyWeekly.set(key, held);
    else packets.push(packetFor(ctx, 'weekly', key, dependencies,
      children.flatMap(child => child.cards.map(card => card.card_id)), expectedHead));
  }
  let readyMonth = null;
  if (sorted(weeks.keys()).every(key => readyWeekly.has(key))) {
    const children = sorted(weeks.keys()).map(key => ({ week: key, version: readyWeekly.get(key).fingerprint,
      cards: readyWeekly.get(key).cards }));
    const dependencies = { weeks: children };
    const fp = cellInput('monthly', ctx.data.month, dependencies, ctx.rulesHash, ctx.data);
    readyMonth = currentCell(ctx, current, 'monthly', ctx.data.month, fp);
    if (!readyMonth) packets.push(packetFor(ctx, 'monthly', ctx.data.month, dependencies,
      children.flatMap(child => child.cards.map(card => card.card_id)), expectedHead));
  }
  if (readyMonth) {
    const dependencies = { monthly: { version: readyMonth.fingerprint, cards: readyMonth.cards } };
    const fp = cellInput('status', ctx.data.month, dependencies, ctx.rulesHash, ctx.data);
    if (!currentCell(ctx, current, 'status', ctx.data.month, fp))
      packets.push(packetFor(ctx, 'status', ctx.data.month, dependencies,
        readyMonth.cards.map(card => card.card_id), expectedHead));
  }
  return { packets, retired, weeks, expectedHead };
}
/** `layers` (default all four) limits this manifest to those layers so a caller can
 * finalize daily cells without waiting on an upper packet; retirements travel only
 * with a manifest that includes `daily`. */
export function prepareHistoryExchange({ input, outputRoot, rulesText, displayMetadata = {},
  layers = LAYERS, batchCharacters = DEFAULT_BATCH_CHARACTERS } = {}) {
  if (!Array.isArray(layers) || !layers.length || layers.some(layer => !LAYERS.includes(layer))
    || new Set(layers).size !== layers.length || !Number.isSafeInteger(batchCharacters)
    || batchCharacters < 1000 || batchCharacters > DEFAULT_BATCH_CHARACTERS) fail('history_exchange_request_invalid');
  const ctx = { ...scoped(input, outputRoot, rulesText), batchCharacters };
  if (!ctx.data.records.length) return { status: ctx.head ? 'refused_empty_input' : 'unchanged',
    project: ctx.data.project, month: ctx.data.month, head_sha256: ctx.head ? digest(ctx.head) : null,
    prepare_id: null, manifest_path: null, packet_paths: [], packets: [], upper_update_targets: null };
  const full = readyPlan(ctx);
  const plan = { ...full, packets: full.packets.filter(packet => layers.includes(packet.layer)),
    retired: layers.includes('daily') ? full.retired : { daily: [], weekly: [] } };
  if (!plan.packets.length && !plan.retired.daily.length && !plan.retired.weekly.length)
    return { status: 'unchanged', project: ctx.data.project, month: ctx.data.month,
      head_sha256: plan.expectedHead, prepare_id: null, manifest_path: null,
      packet_paths: [], packets: [], upper_update_targets: nextTargets(ctx.data, ctx.head?.cells ?? emptyCells(), plan.weeks) };
  const packetPaths = plan.packets.map(packet => {
    const name = `history-packet-${packet.packet_id.slice(7)}.json`;
    ctx.store.writeNew(name, packet); return join(outputRoot, name);
  });
  const batchPaths = plan.packets.map(packet => {
    if (packet.layer !== 'daily') return [];
    const batches = partitionDay({ project: ctx.data.project, day: packet.key,
      rows: dayRows(ctx, packet.key), limit: batchCharactersOf(packet), voiceGroups: ctx.data.voice_groups ?? null });
    return batches.map((batch, index) => {
      const body = { packet_id: packet.packet_id, batch_index: index + 1,
        batch_total: batches.length, user: batch.user };
      if (serial(body).length > 8000) fail('history_exchange_batch_too_large');
      const name = `history-batch-${digest(body).slice(7)}.json`;
      ctx.store.writeNew(name, body);
      return join(outputRoot, name);
    });
  });
  const base = { schema: PREPARE_SCHEMA, project: ctx.data.project, month: ctx.data.month,
    as_of: ctx.data.as_of, input_fingerprint: ctx.inputFingerprint, rules_sha256: ctx.rulesHash,
    expected_head_sha256: plan.expectedHead, packet_ids: plan.packets.map(packet => packet.packet_id),
    packet_paths: packetPaths, retire_cells: plan.retired };
  const prepareId = digest(base), manifest = { ...base, prepare_id: prepareId };
  const manifestName = `history-prepare-${prepareId.slice(7)}.json`;
  ctx.store.writeNew(manifestName, manifest);
  return { status: 'prepared', project: ctx.data.project, month: ctx.data.month,
    head_sha256: plan.expectedHead, prepare_id: prepareId, manifest_path: join(outputRoot, manifestName),
    packet_paths: packetPaths, packets: plan.packets.map((packet, index) => ({
      layer: packet.layer, key: packet.key, packet_id: packet.packet_id, path: packetPaths[index],
      batch_paths: batchPaths[index] })),
    upper_update_targets: plannedTargets(ctx, plan) };
}
function validatePrepared(ctx, prepared) {
  if (!plain(prepared) || prepared.schema !== PREPARE_SCHEMA || !sha(prepared.prepare_id))
    fail('history_exchange_manifest_invalid');
  const { prepare_id, ...base } = prepared;
  if (digest(base) !== prepare_id || prepared.project !== ctx.data.project || prepared.month !== ctx.data.month
    || prepared.as_of !== ctx.data.as_of || prepared.input_fingerprint !== ctx.inputFingerprint
    || prepared.rules_sha256 !== ctx.rulesHash || !Array.isArray(prepared.packet_ids)
    || !Array.isArray(prepared.packet_paths) || prepared.packet_ids.length !== prepared.packet_paths.length)
    fail('history_exchange_manifest_mismatch');
  const name = `history-prepare-${prepare_id.slice(7)}.json`;
  if (serial(ctx.store.read(name)) !== serial(prepared)) fail('history_exchange_manifest_missing');
  const packets = prepared.packet_ids.map((id, index) => {
    if (!sha(id) || prepared.packet_paths[index] !== join(ctx.outputRoot, `history-packet-${id.slice(7)}.json`))
      fail('history_exchange_packet_path_invalid');
    const packet = ctx.store.read(`history-packet-${id.slice(7)}.json`);
    if (!plain(packet) || packet.packet_id !== id) fail('history_exchange_packet_missing');
    const { packet_id, ...packetBase } = packet;
    if (digest(packetBase) !== id || packet.project !== ctx.data.project || packet.month !== ctx.data.month
      || packet.input_fingerprint !== ctx.inputFingerprint || packet.rules_sha256 !== ctx.rulesHash
      || packet.expected_head_sha256 !== prepared.expected_head_sha256) fail('history_exchange_packet_mismatch');
    return packet;
  });
  return packets;
}
function cardsForPacket(packet, draftEntry, rows, voiceGroups = null) {
  const keys = plain(draftEntry) ? Object.keys(draftEntry).sort().join(',') : '';
  if (!['packet_id,sentences', 'packet_id,sentences,unprocessed_batches', 'merge_fallback,packet_id,sentences'].includes(keys)
    || draftEntry.packet_id !== packet.packet_id || !Array.isArray(draftEntry.sentences)
    || draftEntry.sentences.length > 1000) fail('history_exchange_draft_invalid');
  const unprocessed = draftEntry.unprocessed_batches ?? [];
  if (!Array.isArray(unprocessed) || (packet.layer !== 'daily' && unprocessed.length)
    || (draftEntry.merge_fallback !== undefined && (draftEntry.merge_fallback !== true || packet.layer === 'daily')))
    fail('history_exchange_draft_invalid');
  if (packet.layer === 'daily') {
    const limit = batchCharactersOf(packet);
    if (!Number.isSafeInteger(limit) || limit < 1000 || limit > DEFAULT_BATCH_CHARACTERS)
      fail('history_exchange_packet_mismatch');
    const count = partitionDay({ project: packet.project, day: packet.key,
      rows, limit, voiceGroups }).length;
    if (unprocessed.length > count || new Set(unprocessed.map(item => item?.batch_index)).size !== unprocessed.length
      || unprocessed.some(item => !plain(item) || Object.keys(item).sort().join(',') !== 'batch_index,reason'
        || !Number.isSafeInteger(item.batch_index) || item.batch_index < 1 || item.batch_index > count
        || !['format_invalid_after_retry', 'source_link_invalid_after_retry'].includes(item.reason)))
      fail('history_exchange_unprocessed_invalid');
  }
  const allowed = new Set(packet.allowed_evidence_ids), dependencies = packet.dependencies;
  const sourceById = packet.layer === 'daily' ? new Map(rows.map(row => [row.id, row])) : null;
  const childById = packet.layer === 'daily' ? null : new Map((dependencies.days ?? dependencies.weeks
    ?? (dependencies.monthly ? [dependencies.monthly] : [])).flatMap(child => child.cards)
    .map(card => [card.card_id, card]));
  const cards = [];
  for (const [index, sentence] of draftEntry.sentences.entries()) {
    if (!plain(sentence) || Object.keys(sentence).sort().join(',') !== 'evidence_ids,text'
      || typeof sentence.text !== 'string' || !sentence.text.trim() || sentence.text.length > 10000
      || !Array.isArray(sentence.evidence_ids) || !sentence.evidence_ids.length
      || new Set(sentence.evidence_ids).size !== sentence.evidence_ids.length
      || sentence.evidence_ids.some(id => typeof id !== 'string' || !allowed.has(id)))
      fail('history_exchange_evidence_invalid');
    const evidence = [], displays = new Map();
    for (const id of sentence.evidence_ids) {
      if (sourceById) {
        const source = sourceById.get(id);
        evidence.push({ source_id: id, quote: source.text, originrefs: source.originrefs });
        displays.set(id, { ...historySourceLabel(source), text_sha256: source.text_sha256 });
      } else {
        const child = childById.get(id);
        for (const item of child.evidence) evidence.push({ ...item, inherited_from_child_card_id: id });
        for (const source of child.source_display) displays.set(source.source_id, source);
      }
    }
    cards.push({ card_id: `${packet.layer}:${packet.key}:${String(index + 1).padStart(3, '0')}`,
      text: sentence.text, evidence, source_ids: sorted(displays.keys()), source_display: [...displays.values()],
      child_card_ids: childById ? sentence.evidence_ids : [], flags: [], claim_ceiling: 'observed',
      semantic_fact_verified: false });
  }
  const used = new Set(draftEntry.sentences.flatMap(sentence => sentence.evidence_ids));
  return { cards, unused_evidence_ids: packet.allowed_evidence_ids.filter(id => !used.has(id)),
    unprocessed_batches: unprocessed };
}
function withLock(root, action) {
  const path = join(root, 'history-run.lock');
  if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()))
    fail('history_exchange_lock_invalid');
  let fd;
  try { fd = openSync(path, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') fail('history_run_locked'); throw error; }
  const held = lstatSync(path);
  try { return action(); }
  finally { closeSync(fd); const current = lstatSync(path);
    if (current.dev !== held.dev || current.ino !== held.ino || current.isSymbolicLink())
      fail('history_exchange_lock_changed');
    unlinkSync(path);
  }
}
export function finalizeHistoryExchange({ input, outputRoot, rulesText, prepared, draft,
  displayMetadata = {} } = {}) {
  return withLock(outputRoot, () => {
    const ctx = scoped(input, outputRoot, rulesText), packets = validatePrepared(ctx, prepared);
    if (!ctx.data.records.length) fail('history_exchange_empty_input');
    if (!plain(draft) || Object.keys(draft).sort().join(',') !== 'drafts,prepare_id,schema'
      || draft.schema !== DRAFT_SCHEMA || draft.prepare_id !== prepared.prepare_id
      || !Array.isArray(draft.drafts) || draft.drafts.length !== packets.length
      || new Set(draft.drafts.map(item => item?.packet_id)).size !== packets.length)
      fail('history_exchange_draft_invalid');
    const draftById = new Map(draft.drafts.map(entry => [entry.packet_id, entry]));
    if (packets.some(packet => !draftById.has(packet.packet_id))) fail('history_exchange_draft_missing');
    const candidates = packets.map(packet => {
      const entry = draftById.get(packet.packet_id), mapped = cardsForPacket(packet, entry, packet.layer === 'daily' ? dayRows(ctx, packet.key) : null,
        ctx.data.voice_groups ?? null);
      const cell = { schema: SCHEMA, project: ctx.data.project, month: ctx.data.month,
        layer: packet.layer, key: packet.key, fingerprint: packet.packet_id,
        packet_id: packet.packet_id, cell_input_fingerprint: packet.cell_input_fingerprint,
        draft_sha256: digest(entry), source_ids: sorted(new Set(mapped.cards.flatMap(card => card.source_ids))),
        child_card_ids: sorted(new Set(mapped.cards.flatMap(card => card.child_card_ids))),
        cards: mapped.cards, unused_evidence_ids: mapped.unused_evidence_ids,
        ...(packet.layer === 'daily' ? { unprocessed_batches: mapped.unprocessed_batches } : {}),
        // A split upper packet whose merge call failed keeps the parts' sentences; the view says so.
        ...(entry.merge_fallback === true ? { merge_fallback: true } : {}),
        format_flag: null, response_format: 'external_draft', raw: '' };
      if (packet.layer === 'weekly') Object.assign(cell, packet.dependencies.week);
      return { packet, ...storedCell(cell) };
    });
    const existing = ctx.head?.cells ?? emptyCells();
    const replay = candidates.every(({ packet, cell }) => {
      const ref = existing[packet.layer]?.[packet.key];
      if (ref !== packet.packet_id) return false;
      const held = readCell(ctx, ref, packet.layer, packet.key);
      return held.draft_sha256 === cell.draft_sha256;
    });
    if (replay && !(prepared.retire_cells?.daily?.length || prepared.retire_cells?.weekly?.length))
      return { status: 'unchanged', project: ctx.data.project, month: ctx.data.month,
        accepted_cells: [], upper_update_targets: nextTargets(ctx.data, existing, grouped(ctx.data).weeks),
        source_coverage: historySourceCoverage(ctx.data, new Map(sorted(Object.keys(existing.daily))
          .map(day => [day, readCell(ctx, existing.daily[day], 'daily', day)]))), head: ctx.head };
    if ((ctx.head ? digest(ctx.head) : null) !== prepared.expected_head_sha256)
      fail('history_exchange_stale_head');
    const cells = Object.fromEntries(LAYERS.map(layer => [layer, { ...(existing[layer] ?? {}) }]));
    const changedDaily = new Set([...candidates.filter(item => item.packet.layer === 'daily').map(item => item.packet.key),
      ...(prepared.retire_cells?.daily ?? [])]);
    const changedWeekly = new Set([...candidates.filter(item => item.packet.layer === 'weekly').map(item => item.packet.key),
      ...(prepared.retire_cells?.weekly ?? [])]);
    for (const day of prepared.retire_cells?.daily ?? []) delete cells.daily[day];
    for (const week of prepared.retire_cells?.weekly ?? []) delete cells.weekly[week];
    for (const day of changedDaily) changedWeekly.add(historyWeekFor(day, ctx.data.month, ctx.data.as_of).key);
    for (const week of changedWeekly) delete cells.weekly[week];
    if (changedDaily.size || changedWeekly.size) { delete cells.monthly[ctx.data.month]; delete cells.status[ctx.data.month]; }
    if (candidates.some(item => item.packet.layer === 'monthly')) delete cells.status[ctx.data.month];
    for (const { packet, cell, batches } of candidates) {
      for (const part of batches) ctx.store.writeNew(part.file, part.value);
      const name = `history-cell-${cell.fingerprint.slice(7)}.json`;
      ctx.store.writeNew(name, cell);
      cells[packet.layer][packet.key] = cell.fingerprint;
    }
    const draftName = `history-draft-${digest(draft).slice(7)}.json`;
    ctx.store.writeNew(draftName, draft);
    const { weeks } = grouped(ctx.data);
    const daily = new Map(sorted(Object.keys(cells.daily)).map(day => [day, readCell(ctx, cells.daily[day], 'daily', day)]));
    const weekly = new Map(sorted(Object.keys(cells.weekly)).map(week => [week, readCell(ctx, cells.weekly[week], 'weekly', week)]));
    const monthly = cells.monthly[ctx.data.month] ? readCell(ctx, cells.monthly[ctx.data.month], 'monthly', ctx.data.month) : null;
    const status = cells.status[ctx.data.month] ? readCell(ctx, cells.status[ctx.data.month], 'status', ctx.data.month) : null;
    const pending = nextTargets(ctx.data, cells, weeks);
    const view = renderHistory(ctx.data, daily, weekly, monthly, status, displayMetadata, false,
      { external: true, pending });
    const viewName = `history-view-${hashText(view).slice(7)}.md`;
    ctx.store.writeTextNew(viewName, view);
    const head = { schema: SCHEMA, project: ctx.data.project, month: ctx.data.month,
      as_of: ctx.data.as_of, input_fingerprint: ctx.inputFingerprint, cells,
      view_file: viewName, draft_file: draftName,
      status: Object.values(pending).some(values => values.length) ? 'partial' : 'ready' };
    ctx.store.writeNew(`history-head-${digest(head).slice(7)}.json`, head);
    ctx.store.replaceHead(head);
    return { status: 'finalized', project: ctx.data.project, month: ctx.data.month,
      accepted_cells: candidates.map(({ packet, cell }) => ({ layer: packet.layer, key: packet.key,
        fingerprint: cell.fingerprint, unused_evidence_ids: cell.unused_evidence_ids,
        unprocessed_batches: cell.unprocessed_batches ?? [] })),
      source_coverage: historySourceCoverage(ctx.data, daily),
      upper_update_targets: pending, draft_file: draftName, head };
  });
}

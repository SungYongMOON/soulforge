#!/usr/bin/env node
// Nightly project-history (이력) step: source preparation -> history_cli-style
// prepare -> one external writer call per prepared unit -> finalize.
//
// This file is the productionised form of a private pilot runner. It owns the
// orchestration only; every history rule stays where it already lives:
//   - src/knowledge_layer/history_prepare.mjs   collects and freezes sources
//     (the injected `collector` is the only source reader)
//   - src/knowledge_layer/history_exchange.mjs  selects changed cells by
//     fingerprint, writes packets/batches and finalizes a draft
//   - src/history_writer_output.mjs             parses and checks one answer
// It never edits an authored sentence, never fills a cell the writer did not
// answer, and never calls a model itself: the writer is an injected function.
// The default writer spawns an external Hermes profile
// (`<command> -p <profile> chat -Q --query-file <f> --in <dir> --source tool
// --reasoning none --run-budget <n>`); tests inject a fake writer.
//
// Unit = one daily batch (history-batch-*.json) or one upper packet (weekly,
// monthly, status). A unit gets at most 2 writer calls; the second call's
// query ends with "JSON으로만 답하라.". A daily batch that still fails is
// recorded as `unprocessed_batches` (format_invalid_after_retry /
// source_link_invalid_after_retry) and the rest of the day is still
// submitted. An upper packet cannot be marked unprocessed by the draft
// contract, so a failed upper packet holds that project's finalize for the
// night (its daily results stay cached).
//
// Incremental: prepare only returns packets whose cell input changed, so the
// same input makes 0 writer calls. Accepted/unprocessed daily outcomes are
// cached in the private work root keyed by (template version, rules digest,
// profile, batch content) so a deadline stop does not repeat finished calls
// the next night even though packet ids move with the whole-month input.
//
// Usage:
//   node guild_hall/context_engine/harness/history_night.mjs
//     --config <absolute JSON> [--config-sha256 sha256:<hex>]
//     --receipts <absolute dir>
//     [--projects CODE[,CODE...]] [--date YYYY-MM-DD] [--from-date YYYY-MM-DD]
//     [--deadline HH:MM [--scheduled-start HH:MM]] [--no-start-within MINUTES]
//     [--profile NAME] [--run-budget SECONDS] [--now ISO]
//
// Config (soulforge.history_night_config.v1, private, Owner-controlled):
//   { schema, rules_file, rules_version?, work_root,
//     writer: { command, profile, run_budget?, call_timeout_seconds?, max_query_characters? },
//     projects: [ { project, sources, output_root } ] }
// All paths are absolute and come from the config; nothing host-specific is
// written in this file. Each project's history store is <output_root>/<YYYY-MM>.
//
// Exit codes (same meaning as voice_conversation_list_nightly.mjs and
// ops/night_chain.mjs): 0 OK, 2 FAILED, 3 LOCK_HELD, 4 SKIPPED_PAST_DEADLINE
// (the no-start cutoff had passed before any project started), 5
// CONFIG_INVALID (usage, config digest or shape), 6 PARTIAL (the cutoff was
// reached mid-run: unstarted units are left for the next night and nothing
// failed). One receipt (soulforge.history_night_receipt.v1, counts and
// statuses only, never text) is written per run except for CONFIG_INVALID
// before a receipts directory is known.
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync,
  rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextDeadlineInstant } from '../ops/night_chain.mjs';
import { checkHistoryBatchDraft, extractHistoryDraft } from '../src/history_writer_output.mjs';
import { finalizeHistoryExchange, prepareHistoryExchange } from '../src/knowledge_layer/history_exchange.mjs';
import { prepareHistory, yesterdayKst } from '../src/knowledge_layer/history_prepare.mjs';
import { collectHistorySources } from '../src/knowledge_layer/history_sources.mjs';

export const HISTORY_NIGHT_CONFIG_SCHEMA = 'soulforge.history_night_config.v1';
export const HISTORY_NIGHT_RECEIPT_SCHEMA = 'soulforge.history_night_receipt.v1';
export const HISTORY_NIGHT_TEMPLATE_VERSION = 'history-night-query v1';
export const LOCK_FILE_NAME = 'history-night.lock';
export const DEFAULT_RUN_BUDGET_SECONDS = 1200;
export const DEFAULT_NO_START_WITHIN_MINUTES = 20;
export const DEFAULT_MAX_QUERY_CHARACTERS = 8000;
export const MAX_ATTEMPTS = 2;
// daily -> weekly -> monthly -> status: at most four prepare/finalize rounds per project per night.
export const MAX_ROUNDS = 4;
export const EXIT = Object.freeze({ OK: 0, FAILED: 2, LOCK_HELD: 3, SKIPPED_PAST_DEADLINE: 4,
  CONFIG_INVALID: 5, PARTIAL: 6 });
const DRAFT_SCHEMA = 'soulforge.history_external_draft.v1';
const CACHE_SCHEMA = 'soulforge.history_night_unit_cache.v1';
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/u;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;

export class HistoryNightError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new HistoryNightError(code); };
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeCode = error => {
  const code = String(error?.code ?? error?.message ?? 'history_night_error');
  return /^[A-Za-z0-9_:-]{1,120}$/u.test(code) ? code : 'history_night_error';
};
const readJson = (file, limit = 20_000_000) => {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) fail('history_night_file_invalid');
  return JSON.parse(readFileSync(file, 'utf8'));
};
function atomicWrite(file, text) {
  const temp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temp, text, { encoding: 'utf8', flag: 'wx' });
  try { renameSync(temp, file); } catch (error) { rmSync(temp, { force: true }); throw error; }
}

// ------------------------------------------------------------------ config
export function readNightConfig(configPath, expectedSha256 = null) {
  if (typeof configPath !== 'string' || !path.isAbsolute(configPath)) fail('history_night_config_path_invalid');
  let bytes;
  try { bytes = readFileSync(configPath); } catch { fail('history_night_config_unreadable'); }
  if (bytes.length > 1_000_000) fail('history_night_config_too_large');
  if (expectedSha256 !== null && sha256(bytes) !== expectedSha256) fail('history_night_config_sha256_mismatch');
  let config;
  try { config = JSON.parse(bytes.toString('utf8')); } catch { fail('history_night_config_json_invalid'); }
  const abs = value => typeof value === 'string' && path.isAbsolute(value);
  const writer = config?.writer;
  if (!plain(config) || config.schema !== HISTORY_NIGHT_CONFIG_SCHEMA || !abs(config.rules_file)
    || !abs(config.work_root) || !plain(writer) || !abs(writer.command)
    || typeof writer.profile !== 'string' || !CODE.test(writer.profile)
    || (config.rules_version !== undefined && (typeof config.rules_version !== 'string' || !config.rules_version.trim()))
    || !Array.isArray(config.projects) || !config.projects.length) fail('history_night_config_shape_invalid');
  for (const key of ['run_budget', 'call_timeout_seconds', 'max_query_characters'])
    if (writer[key] !== undefined && (!Number.isSafeInteger(writer[key]) || writer[key] < 1))
      fail('history_night_config_shape_invalid');
  const seen = new Set();
  for (const entry of config.projects) {
    if (!plain(entry) || typeof entry.project !== 'string' || !CODE.test(entry.project)
      || !abs(entry.sources) || !abs(entry.output_root) || seen.has(entry.project))
      fail('history_night_config_project_invalid');
    seen.add(entry.project);
  }
  return { config, config_sha256: sha256(bytes) };
}

// ------------------------------------------------------------------ lock
/** Fail-closed lock: a held lock is only healed when its recorded owner pid is
 * provably dead. An unreadable or foreign-shaped lock is treated as held. */
export function acquireNightLock(receiptsDir, { now, isPidAlive = defaultIsPidAlive } = {}) {
  const file = path.join(receiptsDir, LOCK_FILE_NAME);
  const token = randomUUID();
  const body = `${JSON.stringify({ pid: process.pid, started_at: now, token })}\n`;
  const take = () => { const fd = openSync(file, 'wx'); try { writeFileSync(fd, body); } finally { closeSync(fd); } };
  try { take(); return { acquired: true, healed: false, token, file }; }
  catch (error) { if (error?.code !== 'EEXIST') throw error; }
  let held = null;
  try {
    const stat = lstatSync(file);
    if (stat.isFile() && !stat.isSymbolicLink() && stat.size < 10_000) held = JSON.parse(readFileSync(file, 'utf8'));
  } catch { held = null; }
  if (!plain(held) || !Number.isSafeInteger(held.pid) || held.pid <= 0)
    return { acquired: false, reason: 'history_night_lock_unreadable', file };
  if (isPidAlive(held.pid)) return { acquired: false, reason: 'history_night_lock_held', file };
  rmSync(file, { force: true });
  try { take(); } catch (error) {
    if (error?.code === 'EEXIST') return { acquired: false, reason: 'history_night_lock_held', file };
    throw error;
  }
  return { acquired: true, healed: true, token, file };
}
export function releaseNightLock(lock) {
  if (!lock?.acquired) return;
  try {
    const held = JSON.parse(readFileSync(lock.file, 'utf8'));
    if (held?.token === lock.token) rmSync(lock.file, { force: true });
  } catch { /* nothing of ours left to release */ }
}
function defaultIsPidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}

// ------------------------------------------------------------------ prompts
export function dailyPrompt({ project, day, rulesVersion, prepareId, packetId, batch }) {
  return [
    `${project} ${day}의 준비 배치만 읽고 그날 실제 사건을 빠짐없이 이력 문장으로 써라.${rulesVersion ? ` 지침 판본: ${rulesVersion}.` : ''}`,
    '각 문장에 이 배치의 id 또는 source_id를 evidence_ids로 넣어라. 확인되지 않은 발화자는 쓰지 말라.',
    '녹음에만 있는 사건에는 (녹음 기준)을 붙이고 같은 뜻을 반복하지 말라.',
    '녹음 안건별로 쓰고 메일 본문의 요청·일정·수치·조건을 각각 쓰라. 결정·지시·담당자·장비명을 빠뜨리지 말라.',
    'JSON 객체 하나만 출력하라. 설명과 코드펜스는 금지한다. 사건이 없으면 sentences는 빈 배열로 둔다.',
    `{"schema":"${DRAFT_SCHEMA}","prepare_id":"${prepareId}","drafts":[{"packet_id":"${packetId}","sentences":[{"text":"사실 문장","evidence_ids":["근거 ID"]}]}]}`,
    '자료 배치:', JSON.stringify(batch),
  ].join('\n');
}
const UPPER_LABEL = { weekly: '주간', monthly: '월간', status: '최근 현황' };
export function upperCards(packet) {
  const deps = packet.dependencies ?? {};
  const groups = packet.layer === 'weekly' ? deps.days : packet.layer === 'monthly' ? deps.weeks
    : packet.layer === 'status' && deps.monthly ? [deps.monthly] : null;
  if (!Array.isArray(groups)) fail('history_night_upper_packet_invalid');
  return groups.flatMap(group => group.cards ?? []).map(card => ({ card_id: card.card_id, text: card.text }));
}
export function upperPrompt({ project, packet, rulesVersion, prepareId }) {
  return [
    `${project} ${packet.key} ${UPPER_LABEL[packet.layer]} 이력을 아래 하위 이력 카드만 읽고 써라.${rulesVersion ? ` 지침 판본: ${rulesVersion}.` : ''}`,
    packet.layer === 'status' ? '최근 있었던 일만 정리하라.' : '같은 사건을 묶어 5~10줄로 압축하라.',
    '각 문장의 evidence_ids에는 아래 카드의 card_id만 넣어라. 카드에 없는 사실을 더하지 말라.',
    'JSON 객체 하나만 출력하라. 설명과 코드펜스는 금지한다.',
    `{"schema":"${DRAFT_SCHEMA}","prepare_id":"${prepareId}","drafts":[{"packet_id":"${packet.packet_id}","sentences":[{"text":"사실 문장","evidence_ids":["카드 ID"]}]}]}`,
    '하위 카드:', JSON.stringify(upperCards(packet)),
  ].join('\n');
}

// ------------------------------------------------------------------ writer
/** Default writer: one external Hermes profile call. Returns only what the
 * runner needs; stdout is parsed in memory and never written to a receipt. */
export function hermesWriter({ command, profile, runBudget, timeoutMs }) {
  return async ({ queryFile, workDir }) => {
    const env = { ...process.env };
    delete env.HERMES_HOME;
    const result = spawnSync(command, ['-p', profile, 'chat', '-Q', '--query-file', queryFile,
      '--in', workDir, '--source', 'tool', '--reasoning', 'none', '--run-budget', String(runBudget)],
    { cwd: workDir, env, encoding: 'utf8', windowsHide: true, timeout: timeoutMs, maxBuffer: 2_000_000 });
    return { exit_code: result.status, stdout: result.stdout ?? '', error_code: result.error?.code ?? null };
  };
}

// ------------------------------------------------------------------ units
function cacheFile(workRoot, project, key) {
  return path.join(workRoot, project, 'unit-cache', `${key.slice(7)}.json`);
}
function readCache(file, key) {
  if (!existsSync(file)) return null;
  try {
    const value = readJson(file, 5_000_000);
    return value?.schema === CACHE_SCHEMA && value.key === key ? value : null;
  } catch { return null; }
}
function writeCache(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  if (!existsSync(file)) atomicWrite(file, `${JSON.stringify(value)}\n`);
}

async function runUnit({ unit, ctx }) {
  const { project, writer, clock, cutoffAt, workRoot, maxQuery, runStamp } = ctx;
  const row = { layer: unit.layer, key: unit.key, batch_index: unit.batchIndex ?? null,
    batch_total: unit.batchTotal ?? null, status: 'not_started', sentences: 0, attempts: [] };
  const cachePath = cacheFile(workRoot, project, unit.cacheKey);
  const cached = readCache(cachePath, unit.cacheKey);
  if (cached) {
    row.status = cached.outcome === 'accepted' ? 'cached_accepted' : 'cached_unprocessed';
    row.sentences = cached.sentences?.length ?? 0;
    return { row, sentences: cached.sentences ?? [], reason: cached.reason ?? null,
      accepted: cached.outcome === 'accepted' };
  }
  if (unit.prompt.length > maxQuery) fail('history_night_query_too_large');
  let lastReason = 'format_invalid_after_retry';
  const callDir = path.join(workRoot, project, 'calls', runStamp);
  mkdirSync(callDir, { recursive: true });
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (cutoffAt !== null && Date.parse(clock()) >= cutoffAt) {
      // Never finalize a unit the cutoff interrupted: it is left whole for the next night.
      row.status = attempt === 1 ? 'not_started' : 'deferred_after_attempt';
      return { row, deferred: true };
    }
    const queryFile = path.join(callDir, `query-${randomUUID()}.txt`);
    writeFileSync(queryFile, unit.prompt + (attempt === 2 ? '\nJSON으로만 답하라.\n' : '\n'),
      { encoding: 'utf8', flag: 'wx' });
    const started = Date.parse(clock());
    let run;
    try { run = await writer({ queryFile, workDir: callDir, project, layer: unit.layer, key: unit.key,
      batchIndex: unit.batchIndex ?? null, attempt }); }
    finally { rmSync(queryFile, { force: true }); }
    const seconds = Math.max(0, Math.round((Date.parse(clock()) - started) / 1000));
    const parsed = run?.exit_code === 0 && !run?.error_code ? extractHistoryDraft(run.stdout) : null;
    const checked = checkHistoryBatchDraft(parsed, { prepare_id: unit.prepareId },
      { packet_id: unit.packetId }, unit.checkBatch);
    row.attempts.push({ attempt, seconds, exit_code: run?.exit_code ?? null,
      error_code: run?.error_code ?? null, response_sha256: sha256(String(run?.stdout ?? '')),
      result: checked.ok ? 'accepted' : checked.reason, source_link_errors: checked.source_link_errors });
    if (checked.ok) {
      row.status = 'accepted'; row.sentences = checked.sentences.length;
      writeCache(cachePath, { schema: CACHE_SCHEMA, key: unit.cacheKey, outcome: 'accepted',
        sentences: checked.sentences });
      return { row, sentences: checked.sentences, accepted: true };
    }
    lastReason = checked.reason;
  }
  row.status = 'unprocessed';
  if (unit.layer === 'daily' && row.attempts.length === MAX_ATTEMPTS)
    writeCache(cachePath, { schema: CACHE_SCHEMA, key: unit.cacheKey, outcome: 'unprocessed', reason: lastReason });
  return { row, sentences: [], reason: lastReason, accepted: false };
}

function unitsFor({ prepared, manifest, project, rulesVersion, rulesSha, profile }) {
  const units = [];
  for (const packet of prepared.packets) {
    const full = readJson(packet.path, 20_000_000);
    if (full.packet_id !== packet.packet_id || !manifest.packet_ids.includes(packet.packet_id))
      fail('history_night_packet_mismatch');
    if (packet.layer === 'daily') {
      packet.batch_paths.forEach((batchPath, index) => {
        const batch = readJson(batchPath, 100_000);
        if (batch.packet_id !== packet.packet_id || batch.batch_index !== index + 1
          || batch.batch_total !== packet.batch_paths.length) fail('history_night_batch_mismatch');
        units.push({ layer: 'daily', key: packet.key, packetId: packet.packet_id, prepareId: prepared.prepare_id,
          batchIndex: index + 1, batchTotal: packet.batch_paths.length, checkBatch: batch,
          prompt: dailyPrompt({ project, day: packet.key, rulesVersion, prepareId: prepared.prepare_id,
            packetId: packet.packet_id, batch }),
          cacheKey: sha256(JSON.stringify({ v: HISTORY_NIGHT_TEMPLATE_VERSION, rules: rulesSha, profile,
            project, day: packet.key, user: batch.user })) });
      });
      if (!packet.batch_paths.length) fail('history_night_daily_without_batches');
    } else {
      // Upper packets reuse the batch checker with the packet's own allowed card ids.
      const checkBatch = { user: { threads: [{ records: full.allowed_evidence_ids.map(id => ({ id })) }] } };
      units.push({ layer: packet.layer, key: packet.key, packetId: packet.packet_id,
        prepareId: prepared.prepare_id, checkBatch,
        prompt: upperPrompt({ project, packet: full, rulesVersion, prepareId: prepared.prepare_id }),
        cacheKey: sha256(JSON.stringify({ v: HISTORY_NIGHT_TEMPLATE_VERSION, rules: rulesSha, profile,
          project, layer: packet.layer, key: packet.key, cards: upperCards(full) })) });
    }
  }
  return units;
}

async function runProject({ entry, ctx }) {
  const { project } = entry;
  const result = { project, status: 'not_started', reason: null, source_status: null,
    changed_days: [], packets: 0, units: [], calls: 0, finalize_status: null, upper_pending: false,
    accepted_cells: 0, unprocessed_batches: 0, total_sources: null, unquoted_sources: null };
  const monthRoot = path.join(entry.output_root, ctx.targetDate.slice(0, 7));
  mkdirSync(monthRoot, { recursive: true });
  const sourceConfig = readJson(entry.sources, 2_000_000);
  const frozen = await prepareHistory({ project, date: ctx.targetDate, fromDate: ctx.fromDate ?? undefined,
    sourceConfig, outputRoot: monthRoot, collector: ctx.collector, now: new Date(ctx.now) });
  result.source_status = frozen.status;
  if (frozen.status === 'source_hold') { result.status = 'source_hold'; result.reason = 'history_night_source_hold'; return result; }
  if (frozen.status === 'no_sources') { result.status = 'no_sources'; return result; }
  result.changed_days = frozen.changed_days ?? [];
  const input = readJson(path.join(monthRoot, frozen.input_file));
  const displayMetadata = readJson(path.join(monthRoot, frozen.display_file));
  const common = { input, outputRoot: monthRoot, rulesText: ctx.rulesText, displayMetadata };
  // Daily cells first; each finalize can make the next layer ready (week -> month -> status),
  // so the same night keeps preparing until nothing is left or the cutoff is reached.
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    if (round > 1 && ctx.cutoffAt !== null && Date.parse(ctx.clock()) >= ctx.cutoffAt) {
      result.upper_pending = true; break;
    }
    const prepared = prepareHistoryExchange(common);
    if (prepared.status === 'unchanged') { if (round === 1) result.status = 'unchanged'; break; }
    if (prepared.status !== 'prepared') fail(`history_night_prepare_${prepared.status}`);
    const manifest = readJson(prepared.manifest_path, 2_000_000);
    result.packets += prepared.packets.length;
    const units = unitsFor({ prepared, manifest, project, rulesVersion: ctx.rulesVersion,
      rulesSha: ctx.rulesSha, profile: ctx.profile });
    const outcomes = [];
    let deferred = false;
    for (const unit of units) {
      if (deferred) { result.units.push({ layer: unit.layer, key: unit.key, batch_index: unit.batchIndex ?? null,
        batch_total: unit.batchTotal ?? null, status: 'not_started', sentences: 0, attempts: [] }); continue; }
      const outcome = await runUnit({ unit, ctx: { ...ctx, project } });
      result.calls += outcome.row.attempts.length;
      ctx.totals.calls += outcome.row.attempts.length;
      result.units.push(outcome.row);
      if (outcome.deferred) { deferred = true; continue; }
      outcomes.push({ unit, ...outcome });
    }
    if (deferred) { result.status = 'deferred_deadline'; return result; }
    if (outcomes.some(item => item.unit.layer !== 'daily' && !item.accepted)) {
      result.status = 'upper_failed'; result.reason = 'history_night_upper_unprocessed'; return result;
    }
    const drafts = prepared.packets.map(packet => {
      const mine = outcomes.filter(item => item.unit.packetId === packet.packet_id);
      const unprocessed = mine.filter(item => !item.accepted)
        .map(item => ({ batch_index: item.unit.batchIndex, reason: item.reason }));
      return { packet_id: packet.packet_id, sentences: mine.flatMap(item => item.accepted ? item.sentences : []),
        ...(unprocessed.length ? { unprocessed_batches: unprocessed } : {}) };
    });
    const draft = { schema: DRAFT_SCHEMA, prepare_id: prepared.prepare_id, drafts };
    const finalized = finalizeHistoryExchange({ ...common, prepared: manifest, draft });
    result.finalize_status = finalized.status;
    result.accepted_cells += finalized.accepted_cells?.length ?? 0;
    result.unprocessed_batches += drafts.reduce((sum, item) => sum + (item.unprocessed_batches?.length ?? 0), 0);
    const coverage = finalized.source_coverage ?? [];
    result.total_sources = coverage.reduce((sum, item) => sum + (item.total_sources ?? 0), 0);
    result.unquoted_sources = coverage.reduce((sum, item) => sum + (item.unquoted_sources ?? 0), 0);
    result.status = finalized.status === 'finalized' ? 'finalized' : 'unchanged';
    if (finalized.status !== 'finalized') break;
  }
  return result;
}

// ------------------------------------------------------------------ run
export async function runHistoryNight({ config, configSha256 = null, receiptsDir, projects = null,
  date = null, fromDate = null, deadline = null, scheduledStart = null,
  noStartWithinMinutes = DEFAULT_NO_START_WITHIN_MINUTES, profile = null, runBudget = null,
  now = new Date().toISOString(), clock = () => new Date().toISOString(), writer = null,
  collector = undefined, isPidAlive = undefined } = {}) {
  const targetDate = date ?? yesterdayKst(new Date(now));
  const deadlineAt = deadline !== null ? nextDeadlineInstant(now, deadline, scheduledStart) : null;
  const cutoffAt = deadlineAt !== null ? Date.parse(deadlineAt) - noStartWithinMinutes * 60_000 : null;
  const effectiveProfile = profile ?? config.writer.profile;
  const budget = runBudget ?? config.writer.run_budget ?? DEFAULT_RUN_BUDGET_SECONDS;
  const selected = projects === null ? config.projects
    : projects.map(code => config.projects.find(entry => entry.project === code)
      ?? fail('history_night_project_unknown'));
  mkdirSync(receiptsDir, { recursive: true });
  const receipt = { schema: HISTORY_NIGHT_RECEIPT_SCHEMA, status: null, started_at: now, finished_at: null,
    config_sha256: configSha256, target_date: targetDate, from_date: fromDate,
    deadline: deadlineAt !== null ? { configured: deadline, scheduled_start: scheduledStart, at: deadlineAt,
      no_start_within_minutes: noStartWithinMinutes, stopped: false } : null,
    writer: { profile: effectiveProfile, run_budget: budget, template: HISTORY_NIGHT_TEMPLATE_VERSION },
    rules_sha256: null, lock: null, projects: [],
    totals: { calls: 0, units: 0, accepted: 0, cached: 0, unprocessed: 0, not_started: 0 } };
  const lock = acquireNightLock(receiptsDir, { now, ...(isPidAlive ? { isPidAlive } : {}) });
  receipt.lock = lock.acquired ? { healed_stale: lock.healed } : { refused: lock.reason };
  if (!lock.acquired) {
    receipt.status = 'LOCK_HELD';
    return finish(receipt, receiptsDir, clock);
  }
  try {
    const rulesText = readFileSync(config.rules_file, 'utf8');
    if (config.rules_version && !rulesText.split('\n', 1)[0].includes(config.rules_version))
      fail('history_night_rules_version_mismatch');
    receipt.rules_sha256 = sha256(rulesText);
    const runStamp = now.replace(/[-:.]/gu, '').slice(0, 15);
    const ctx = { targetDate, fromDate, now, clock, cutoffAt, rulesText, rulesSha: receipt.rules_sha256,
      rulesVersion: config.rules_version ?? null, profile: effectiveProfile, workRoot: config.work_root,
      maxQuery: config.writer.max_query_characters ?? DEFAULT_MAX_QUERY_CHARACTERS, runStamp,
      collector: collector ?? collectHistorySources, totals: receipt.totals,
      writer: writer ?? hermesWriter({ command: config.writer.command, profile: effectiveProfile,
        runBudget: budget, timeoutMs: (config.writer.call_timeout_seconds ?? budget + 120) * 1000 }) };
    for (const entry of selected) {
      if (cutoffAt !== null && Date.parse(clock()) >= cutoffAt) {
        receipt.projects.push({ project: entry.project, status: 'not_started', reason: 'history_night_past_cutoff' });
        continue;
      }
      let row;
      try { row = await runProject({ entry, ctx }); }
      catch (error) { row = { project: entry.project, status: 'failed', reason: safeCode(error) }; }
      receipt.projects.push(row);
    }
  } catch (error) {
    receipt.status = 'FAILED';
    receipt.reason = safeCode(error);
  } finally {
    releaseNightLock(lock);
  }
  for (const project of receipt.projects) for (const unit of project.units ?? []) {
    receipt.totals.units++;
    if (unit.status === 'accepted') receipt.totals.accepted++;
    else if (unit.status.startsWith('cached_')) receipt.totals.cached++;
    else if (unit.status === 'unprocessed') receipt.totals.unprocessed++;
    else if (['not_started', 'deferred_after_attempt'].includes(unit.status)) receipt.totals.not_started++;
  }
  if (receipt.status === null) {
    const statuses = receipt.projects.map(project => project.status);
    const deferred = statuses.some(status => ['deferred_deadline', 'not_started'].includes(status));
    if (receipt.deadline) receipt.deadline.stopped = deferred;
    if (statuses.some(status => ['failed', 'source_hold', 'upper_failed'].includes(status))) receipt.status = 'FAILED';
    else if (statuses.length && statuses.every(status => status === 'not_started')) receipt.status = 'SKIPPED_PAST_DEADLINE';
    else if (deferred) receipt.status = 'PARTIAL';
    else receipt.status = 'OK';
  }
  return finish(receipt, receiptsDir, clock);
}
function finish(receipt, receiptsDir, clock) {
  receipt.finished_at = clock();
  const base = `history-night-${receipt.started_at.replace(/[-:.]/gu, '').slice(0, 15)}`;
  let file = path.join(receiptsDir, `${base}.json`);
  for (let n = 2; existsSync(file); n++) file = path.join(receiptsDir, `${base}-${n}.json`);
  atomicWrite(file, `${JSON.stringify(receipt, null, 2)}\n`);
  return { receipt, receiptPath: file, exitCode: EXIT[receipt.status] };
}

// ------------------------------------------------------------------ cli
function parseArgs(argv) {
  const known = new Set(['--config', '--config-sha256', '--receipts', '--projects', '--date', '--from-date',
    '--deadline', '--scheduled-start', '--no-start-within', '--profile', '--run-budget', '--now']);
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    if (!known.has(flag) || value === undefined || value.startsWith('--') || Object.hasOwn(args, flag))
      fail('history_night_arguments_invalid');
    args[flag] = value;
  }
  const int = (value, min, max) => {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < min || n > max) fail('history_night_arguments_invalid');
    return n;
  };
  if (!args['--config'] || !args['--receipts'] || !path.isAbsolute(args['--receipts'])
    || (args['--config-sha256'] && !SHA.test(args['--config-sha256']))
    || (args['--date'] && !DAY.test(args['--date'])) || (args['--from-date'] && !DAY.test(args['--from-date']))
    || (args['--deadline'] && !HHMM.test(args['--deadline']))
    || (args['--scheduled-start'] && (!HHMM.test(args['--scheduled-start']) || !args['--deadline']))
    || (args['--no-start-within'] && !args['--deadline'])
    || (args['--profile'] && !CODE.test(args['--profile']))
    || (args['--now'] && !Number.isFinite(Date.parse(args['--now']))))
    fail('history_night_arguments_invalid');
  const projects = args['--projects'] ? args['--projects'].split(',') : null;
  if (projects && (projects.some(code => !CODE.test(code)) || new Set(projects).size !== projects.length))
    fail('history_night_arguments_invalid');
  return { configPath: args['--config'], configSha256: args['--config-sha256'] ?? null,
    receiptsDir: args['--receipts'], projects, date: args['--date'] ?? null, fromDate: args['--from-date'] ?? null,
    deadline: args['--deadline'] ?? null, scheduledStart: args['--scheduled-start'] ?? null,
    noStartWithinMinutes: args['--no-start-within'] ? int(args['--no-start-within'], 0, 600) : DEFAULT_NO_START_WITHIN_MINUTES,
    profile: args['--profile'] ?? null, runBudget: args['--run-budget'] ? int(args['--run-budget'], 60, 7200) : null,
    now: args['--now'] ? new Date(args['--now']).toISOString() : undefined };
}
export async function historyNightCli(argv = process.argv.slice(2), { stdout = process.stdout,
  stderr = process.stderr, writer, collector, clock, isPidAlive } = {}) {
  let parsed, loaded;
  try {
    parsed = parseArgs(argv);
    loaded = readNightConfig(parsed.configPath, parsed.configSha256);
    if (parsed.projects) for (const code of parsed.projects)
      if (!loaded.config.projects.some(entry => entry.project === code)) fail('history_night_project_unknown');
  } catch (error) {
    stderr.write(`${JSON.stringify({ status: 'CONFIG_INVALID', code: safeCode(error) })}\n`);
    return EXIT.CONFIG_INVALID;
  }
  try {
    const { receipt, exitCode } = await runHistoryNight({ config: loaded.config, configSha256: loaded.config_sha256,
      ...parsed, ...(parsed.now ? {} : { now: new Date().toISOString() }),
      ...(clock ? { clock } : {}), writer: writer ?? null, collector, isPidAlive });
    stdout.write(`${JSON.stringify({ status: receipt.status, calls: receipt.totals.calls,
      projects: receipt.projects.map(project => ({ project: project.project, status: project.status })) })}\n`);
    return exitCode;
  } catch (error) {
    stderr.write(`${JSON.stringify({ status: 'FAILED', code: safeCode(error) })}\n`);
    return EXIT.FAILED;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase())
  process.exitCode = await historyNightCli();

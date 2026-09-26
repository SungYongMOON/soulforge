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
// --reasoning none --run-budget <n>`) and kills the whole process tree on
// timeout; tests inject a fake writer.
//
// Layers are prepared and finalized one at a time (daily -> weekly -> monthly
// -> status), so an upper packet that fails never holds back a day's cells.
// Unit = one daily batch (history-batch-*.json) or one upper packet. A unit gets
// at most 2 writer calls; the second call's query ends with "JSON으로만 답하라.".
// Outcomes:
//   - the writer exited 0 and its answer was parsed but rejected twice: a daily
//     batch becomes `unprocessed_batches` (cached; the day is still finalized);
//     an upper packet is left for the next night (not cached).
//   - transport failure (non-zero exit, spawn error, timeout, throw): the unit
//     is deferred -- never cached, never finalized as unprocessed -- that layer
//     is not finalized and the project makes no further calls tonight, so the
//     same cells are prepared again next run.
//   - a query over `max_query_characters` is a recorded `oversize` deferral,
//     never a throw. Daily batches are prepared with a budget that already
//     subtracts this file's prompt overhead, so a daily query cannot exceed it.
//   - the no-start cutoff (`--deadline` minus `--no-start-within`) defers the
//     remaining units; nothing interrupted is finalized.
//
// Incremental: prepare only returns packets whose cell input changed, so the
// same input makes 0 writer calls. Accepted daily batches, rejected-twice daily
// batches and accepted upper packets are cached in the private work root keyed
// by (template version, rules digest, writer identity, unit content) so a
// deferral does not repeat finished calls the next night even though packet
// ids move with the whole-month input. Writer identity = profile name plus
// `writer_id` (flag or config) and/or the sha256 of the profile config file.
//
// Usage:
//   node guild_hall/context_engine/harness/history_night.mjs
//     --config <absolute JSON> [--config-sha256 sha256:<hex>]
//     --receipts <absolute dir>
//     [--projects CODE[,CODE...]] [--date YYYY-MM-DD] [--from-date YYYY-MM-DD]
//     [--deadline HH:MM [--scheduled-start HH:MM]] [--no-start-within MINUTES]
//     [--profile NAME] [--writer-id ID] [--run-budget SECONDS] [--now ISO]
//
// Config (soulforge.history_night_config.v1, private, Owner-controlled):
//   { schema, rules_file, rules_version?, work_root,
//     writer: { command, profile, writer_id?, profile_config?, run_budget?,
//               call_timeout_seconds?, max_query_characters? },
//     projects: [ { project, sources, output_root } ] }
// All paths are absolute and come from the config; nothing host-specific is
// written in this file. Each project's history store is <output_root>/<YYYY-MM>.
// A call's timeout never exceeds the time left until the deadline, and the
// effective no-start window is never shorter than one call's timeout.
//
// Exit codes (same meaning as voice_conversation_list_nightly.mjs and
// ops/night_chain.mjs): 0 OK, 2 FAILED (a project failed or held its sources,
// or a transport failure left nothing finalized), 3 LOCK_HELD, 4
// SKIPPED_PAST_DEADLINE (the cutoff had passed before any project started), 5
// CONFIG_INVALID (usage, config digest or shape), 6 PARTIAL (work was left for
// the next night: cutoff, transport deferral after some progress, upper layer
// pending, oversize). One receipt (soulforge.history_night_receipt.v1, counts
// and statuses only, never text) is written per run except for CONFIG_INVALID.
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
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
// v2: voice input is one conversation segment per record (history input v3);
// the daily query asks for one paragraph per segment, and an upper packet over
// the query budget is split into parts plus one merge call.
export const HISTORY_NIGHT_TEMPLATE_VERSION = 'history-night-query v2';
// The writer rules this template was written for (first line of the rules file).
// A mismatch is recorded in the receipt, not refused: the Owner installs rules.
export const HISTORY_WRITER_RULES_VERSION = 'history-writer-rules v3';
export const LOCK_FILE_NAME = 'history-night.lock';
export const DEFAULT_RUN_BUDGET_SECONDS = 1200;
export const DEFAULT_CALL_MARGIN_SECONDS = 120;
export const DEFAULT_NO_START_WITHIN_MINUTES = 20;
export const DEFAULT_MAX_QUERY_CHARACTERS = 8000;
export const MAX_ATTEMPTS = 2;
export const LAYER_ORDER = Object.freeze(['daily', 'weekly', 'monthly', 'status']);
// Same thresholds as voice_conversation_list_nightly.mjs: a lock older than this
// is abandoned even if a process with its pid exists (pids are reused).
export const STALE_LOCK_MS = 3 * 60 * 60 * 1000;
export const MIN_DEADLINE_STALE_LOCK_MS = 8 * 60 * 60 * 1000;
export const KILL_GRACE_MS = 10_000;
export const RETRY_SUFFIX = '\nJSON으로만 답하라.\n';
export const EXIT = Object.freeze({ OK: 0, FAILED: 2, LOCK_HELD: 3, SKIPPED_PAST_DEADLINE: 4,
  CONFIG_INVALID: 5, PARTIAL: 6 });
const DRAFT_SCHEMA = 'soulforge.history_external_draft.v1';
const CACHE_SCHEMA = 'soulforge.history_night_unit_cache.v1';
const MAX_BATCH_CHARACTERS = 7200;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/u;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const WRITER_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
const PLACEHOLDER_ID = `sha256:${'0'.repeat(64)}`;

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
    || (writer.writer_id !== undefined && (typeof writer.writer_id !== 'string' || !WRITER_ID.test(writer.writer_id)))
    || (writer.profile_config !== undefined && !abs(writer.profile_config))
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
/** The identity cached outcomes are keyed by. A profile name alone is not a model:
 * `writer_id` names the model explicitly, `profile_config` pins the profile file. */
export function writerIdentity(config, { profile = null, writerId = null } = {}) {
  const writer = config.writer;
  const id = writerId ?? writer.writer_id ?? null;
  let profileConfigSha = null;
  if (writer.profile_config) {
    try { profileConfigSha = sha256(readFileSync(writer.profile_config)); }
    catch { fail('history_night_profile_config_unreadable'); }
  }
  if (id === null && profileConfigSha === null) fail('history_night_writer_identity_missing');
  return { profile: profile ?? writer.profile, writer_id: id, profile_config_sha256: profileConfigSha };
}

// ------------------------------------------------------------------ lock
/** Fail-closed lock. A held lock is healed only when its owner pid is dead or it is
 * older than the age cap; healing renames the old lock aside and then takes the
 * lock with an exclusive create, so two healers cannot both win. An unreadable or
 * foreign-shaped lock is treated as held. */
export function acquireNightLock(receiptsDir, { now, isPidAlive = defaultIsPidAlive,
  staleLockMs = STALE_LOCK_MS } = {}) {
  const file = path.join(receiptsDir, LOCK_FILE_NAME);
  const token = randomUUID();
  const body = `${JSON.stringify({ pid: process.pid, started_at: now, token })}\n`;
  const take = () => { const fd = openSync(file, 'wx'); try { writeFileSync(fd, body); } finally { closeSync(fd); } };
  try { take(); return { acquired: true, healed: null, token, file }; }
  catch (error) { if (error?.code !== 'EEXIST') throw error; }
  let held = null;
  try {
    const stat = lstatSync(file);
    if (stat.isFile() && !stat.isSymbolicLink() && stat.size < 10_000) held = JSON.parse(readFileSync(file, 'utf8'));
  } catch { held = null; }
  if (!plain(held) || !Number.isSafeInteger(held.pid) || held.pid <= 0 || !Number.isFinite(Date.parse(held.started_at)))
    return { acquired: false, reason: 'history_night_lock_unreadable', file };
  const aged = Date.parse(now) - Date.parse(held.started_at) > staleLockMs;
  const dead = !isPidAlive(held.pid);
  if (!aged && !dead) return { acquired: false, reason: 'history_night_lock_held', file };
  const aside = `${file}.stale-${randomUUID()}`;
  try { renameSync(file, aside); } catch { return { acquired: false, reason: 'history_night_lock_held', file }; }
  // The lock may have been replaced between the read and the rename; only the
  // exact lock that was judged stale may be healed. Otherwise put it back.
  let moved = null;
  try { moved = JSON.parse(readFileSync(aside, 'utf8')); } catch { moved = null; }
  if (!plain(moved) || moved.pid !== held.pid || moved.started_at !== held.started_at || moved.token !== held.token) {
    try { if (!existsSync(file)) renameSync(aside, file); } catch { /* left aside; still treated as held */ }
    return { acquired: false, reason: 'history_night_lock_held', file };
  }
  try { take(); } catch (error) {
    if (error?.code === 'EEXIST') return { acquired: false, reason: 'history_night_lock_held', file };
    throw error;
  }
  rmSync(aside, { force: true });
  return { acquired: true, healed: dead ? 'owner_dead' : 'aged_out', token, file };
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
    '녹음 자료 하나는 대화 구간 하나다(segment는 구간 제목·성격·시각, 제목은 길잡이일 뿐 근거가 아니다). 구간마다 한 문단으로 그 구간의 결정·요청·지시·일정·수치·장비명만 사실로 쓰고 그 source_id를 근거로 넣어라.',
    '녹음에만 있는 사건에는 (녹음 기준)을 붙여라. "~라는 언급이 있었다" 같은 채움말을 쓰지 말라. 인사·잡담만 있는 구간은 쓰지 않되 없는 내용을 만들지 말라.',
    '메일 본문의 요청·일정·수치·조건을 각각 쓰라. 같은 사건은 한 문단으로 묶고 다른 사건은 합치지 말라.',
    'JSON 객체 하나만 출력하라. 설명과 코드펜스는 금지한다. 사건이 없으면 sentences는 빈 배열로 둔다.',
    `{"schema":"${DRAFT_SCHEMA}","prepare_id":"${prepareId}","drafts":[{"packet_id":"${packetId}","sentences":[{"text":"사실 문장","evidence_ids":["근거 ID"]}]}]}`,
    '자료 배치:', JSON.stringify(batch),
  ].join('\n');
}
/** Characters the daily prompt adds around a batch's `user` payload (worst case:
 * 4-digit batch counters, retry suffix). Prepare gets `maxQuery - overhead` as its
 * batch budget, so a daily query can never exceed `maxQuery`. */
export function dailyPromptOverhead({ project, rulesVersion }) {
  const sample = dailyPrompt({ project, day: '0000-00-00', rulesVersion, prepareId: PLACEHOLDER_ID,
    packetId: PLACEHOLDER_ID, batch: { packet_id: PLACEHOLDER_ID, batch_index: 9999, batch_total: 9999, user: {} } });
  return sample.length - JSON.stringify({}).length + RETRY_SUFFIX.length;
}
const UPPER_LABEL = { weekly: '주간', monthly: '월간', status: '최근 현황' };
export function upperCards(packet) {
  const deps = packet.dependencies ?? {};
  const groups = packet.layer === 'weekly' ? deps.days : packet.layer === 'monthly' ? deps.weeks
    : packet.layer === 'status' && deps.monthly ? [deps.monthly] : null;
  if (!Array.isArray(groups)) fail('history_night_upper_packet_invalid');
  return groups.flatMap(group => group.cards ?? []).map(card => ({ card_id: card.card_id, text: card.text }));
}
export function upperPrompt({ project, packet, rulesVersion, prepareId, cards = upperCards(packet), part = null }) {
  return [
    `${project} ${packet.key} ${UPPER_LABEL[packet.layer]} 이력을 아래 하위 이력 카드만 읽고 써라.${rulesVersion ? ` 지침 판본: ${rulesVersion}.` : ''}`,
    ...(part ? [`이 요청은 ${part.index}/${part.total}번째 부분이다. 이 부분의 카드만 요약하라.`] : []),
    packet.layer === 'status' ? '최근 있었던 일만 정리하라.' : part ? '같은 사건을 묶어 3~6줄로 압축하라.' : '같은 사건을 묶어 5~10줄로 압축하라.',
    '각 문장의 evidence_ids에는 아래 카드의 card_id만 넣어라. 카드에 없는 사실을 더하지 말라.',
    'JSON 객체 하나만 출력하라. 설명과 코드펜스는 금지한다.',
    `{"schema":"${DRAFT_SCHEMA}","prepare_id":"${prepareId}","drafts":[{"packet_id":"${packet.packet_id}","sentences":[{"text":"사실 문장","evidence_ids":["카드 ID"]}]}]}`,
    '하위 카드:', JSON.stringify(cards),
  ].join('\n');
}
/** Merge call after a split upper packet: the parts' accepted sentences (with
 * their card ids) are compressed into one set. Only card ids already cited by
 * those sentences may be used. */
export function upperMergePrompt({ project, packet, rulesVersion, prepareId, sentences }) {
  return [
    `${project} ${packet.key} ${UPPER_LABEL[packet.layer]} 이력의 부분 요약 문장들을 합쳐라.${rulesVersion ? ` 지침 판본: ${rulesVersion}.` : ''}`,
    packet.layer === 'status' ? '최근 있었던 일만 정리하라.' : '같은 사건을 묶어 5~10줄로 압축하라.',
    '각 문장의 evidence_ids에는 아래 문장들이 가진 카드 ID만 넣어라. 아래 문장에 없는 사실을 더하지 말라.',
    'JSON 객체 하나만 출력하라. 설명과 코드펜스는 금지한다.',
    `{"schema":"${DRAFT_SCHEMA}","prepare_id":"${prepareId}","drafts":[{"packet_id":"${packet.packet_id}","sentences":[{"text":"사실 문장","evidence_ids":["카드 ID"]}]}]}`,
    '부분 요약 문장:', JSON.stringify(sentences),
  ].join('\n');
}
/** Deterministic split of an upper packet's cards into parts whose query fits
 * `budget`, in card order (days, then weeks, stay in sequence). A single card
 * longer than the budget is shortened for the query only (counted); its card id
 * and evidence link are unchanged. */
export function splitUpperCards({ project, packet, rulesVersion, prepareId, budget }) {
  const cards = upperCards(packet);
  const size = (list, part) => upperPrompt({ project, packet, rulesVersion, prepareId, cards: list,
    part: part ?? { index: 9999, total: 9999 } }).length;
  if (upperPrompt({ project, packet, rulesVersion, prepareId, cards }).length <= budget)
    return { parts: [cards], truncated: 0 };
  const parts = []; let held = [], truncated = 0;
  for (const card of cards) {
    let item = card;
    if (size([item]) > budget) {
      const room = budget - size([{ ...card, text: '' }]) - 1;
      if (room < 50) fail('history_night_query_budget_too_small');
      item = { ...card, text: `${[...card.text].slice(0, room).join('')}…` };
      while (size([item]) > budget) item = { ...item, text: `${[...item.text].slice(0, -2).join('')}…` };
      truncated++;
    }
    if (held.length && size([...held, item]) > budget) { parts.push(held); held = []; }
    held.push(item);
  }
  if (held.length) parts.push(held);
  return { parts, truncated };
}

// ------------------------------------------------------------------ writer
/** Kills the whole tree the writer started (Hermes is a launcher; an orphaned model
 * client would hold the single local model slot). Same approach as
 * harness/answer_eval.mjs killProcessTree: `taskkill /T /F` on Windows, the
 * process group elsewhere, the direct child as the last resort. */
export function killProcessTree(child, { platform = process.platform, env = process.env } = {}) {
  const pid = child?.pid;
  if (!pid || pid <= 1) return 'no_pid';
  if (platform === 'win32') {
    const root = env.SystemRoot ?? env.windir ?? null;
    for (const executable of root ? [path.join(root, 'System32', 'taskkill.exe'), 'taskkill'] : ['taskkill']) {
      try {
        execFileSync(executable, ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 15000 });
        return 'taskkill';
      } catch { /* next candidate */ }
    }
  } else {
    try { process.kill(-pid, 'SIGKILL'); return 'group'; } catch { /* fall through */ }
  }
  try { child.kill('SIGKILL'); return 'direct'; } catch { return 'unreachable'; }
}
/** Default writer: one external Hermes profile call. stdout is parsed in memory and
 * never written anywhere. Resolves `{ exit_code, stdout, error_code, timed_out }`. */
export function hermesWriter({ command, profile, runBudget, spawner = spawn, killTree = killProcessTree,
  killGraceMs = KILL_GRACE_MS }) {
  return ({ queryFile, workDir, timeoutMs }) => new Promise(resolve => {
    const env = { ...process.env };
    delete env.HERMES_HOME;
    let child;
    try {
      child = spawner(command, ['-p', profile, 'chat', '-Q', '--query-file', queryFile, '--in', workDir,
        '--source', 'tool', '--reasoning', 'none', '--run-budget', String(runBudget)],
      { cwd: workDir, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (error) {
      resolve({ exit_code: null, stdout: '', error_code: safeCode(error), timed_out: false }); return;
    }
    let stdout = '', settled = false, timedOut = false, grace = null;
    const done = value => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(grace); resolve(value); };
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', chunk => { if (stdout.length < 2_000_000) stdout += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      grace = setTimeout(() => done({ exit_code: null, stdout: '', error_code: 'ETIMEDOUT', timed_out: true }), killGraceMs);
    }, Math.max(1, timeoutMs));
    child.on('error', error => done({ exit_code: null, stdout: '', error_code: safeCode(error), timed_out: timedOut }));
    child.on('close', code => done(timedOut
      ? { exit_code: code, stdout: '', error_code: 'ETIMEDOUT', timed_out: true }
      : { exit_code: code, stdout, error_code: null, timed_out: false }));
  });
}

// ------------------------------------------------------------------ units
const cacheFile = (workRoot, project, key) => path.join(workRoot, project, 'unit-cache', `${key.slice(7)}.json`);
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
/** Query files hold source text; none may outlive its call. Leftovers from a
 * killed run are removed before the project's first call. */
function callDirFor(workRoot, project) {
  const dir = path.join(workRoot, project, 'calls');
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) if (/^query-.*\.txt$/u.test(name)) rmSync(path.join(dir, name), { force: true });
  return dir;
}

const unitRow = unit => ({ layer: unit.layer, key: unit.key, batch_index: unit.batchIndex ?? null,
  batch_total: unit.batchTotal ?? null, ...(unit.merge ? { merge: true } : {}),
  ...(unit.truncatedCards ? { truncated_cards: unit.truncatedCards } : {}),
  status: 'not_started', reason: null, sentences: 0, attempts: [] });

/** One unit. Returns `{ row, kind }` with kind accepted | unprocessed | rejected
 * (upper) | deferred. Only accepted units and rejected-twice daily batches are cached. */
async function runUnit(unit, ctx) {
  const row = unitRow(unit);
  const cachePath = cacheFile(ctx.workRoot, ctx.project, unit.cacheKey);
  const cached = readCache(cachePath, unit.cacheKey);
  if (cached) {
    row.status = cached.outcome === 'accepted' ? 'cached_accepted' : 'cached_unprocessed';
    row.sentences = cached.sentences?.length ?? 0;
    return { row, kind: cached.outcome, sentences: cached.sentences ?? [], reason: cached.reason ?? null };
  }
  if (unit.prompt.length + RETRY_SUFFIX.length > ctx.maxQuery) {
    row.status = 'oversize'; row.reason = unit.layer === 'daily' ? 'daily_oversize' : 'upper_oversize';
    return { row, kind: 'deferred' };
  }
  let lastReason = 'format_invalid_after_retry';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const nowMs = Date.parse(ctx.clock());
    if (ctx.cutoffAt !== null && nowMs >= ctx.cutoffAt) {
      row.status = attempt === 1 ? 'not_started' : 'deferred_after_attempt'; row.reason = 'history_night_past_cutoff';
      return { row, kind: 'deferred' };
    }
    const timeoutMs = ctx.deadlineAtMs === null ? ctx.callTimeoutMs
      : Math.max(1000, Math.min(ctx.callTimeoutMs, ctx.deadlineAtMs - nowMs));
    const queryFile = path.join(ctx.callDir, `query-${randomUUID()}.txt`);
    let run, thrown = null;
    try {
      writeFileSync(queryFile, unit.prompt + (attempt === 2 ? RETRY_SUFFIX : '\n'), { encoding: 'utf8', flag: 'wx' });
      run = await ctx.writer({ queryFile, workDir: ctx.callDir, timeoutMs, project: ctx.project,
        layer: unit.layer, key: unit.key, batchIndex: unit.batchIndex ?? null, attempt });
    } catch (error) { thrown = safeCode(error); }
    finally { rmSync(queryFile, { force: true }); }
    const seconds = Math.max(0, Math.round((Date.parse(ctx.clock()) - nowMs) / 1000));
    const transport = thrown ?? (run?.timed_out ? 'ETIMEDOUT' : run?.error_code ? safeCode({ code: run.error_code })
      : run?.exit_code !== 0 ? 'writer_exit_nonzero' : null);
    if (transport) {
      row.attempts.push({ attempt, seconds, exit_code: run?.exit_code ?? null, error_code: transport,
        response_sha256: null, result: 'transport_failed', source_link_errors: 0 });
      row.status = 'transport_failed'; row.reason = transport;
      return { row, kind: 'deferred', transport: true };
    }
    const checked = checkHistoryBatchDraft(extractHistoryDraft(run.stdout), { prepare_id: unit.prepareId },
      { packet_id: unit.packetId }, unit.checkBatch);
    row.attempts.push({ attempt, seconds, exit_code: 0, error_code: null,
      response_sha256: sha256(String(run.stdout ?? '')), result: checked.ok ? 'accepted' : checked.reason,
      source_link_errors: checked.source_link_errors });
    if (checked.ok) {
      row.status = 'accepted'; row.sentences = checked.sentences.length;
      writeCache(cachePath, { schema: CACHE_SCHEMA, key: unit.cacheKey, outcome: 'accepted', sentences: checked.sentences });
      return { row, kind: 'accepted', sentences: checked.sentences };
    }
    lastReason = checked.reason;
  }
  if (unit.layer !== 'daily') {
    row.status = 'rejected'; row.reason = lastReason;
    return { row, kind: 'rejected', reason: lastReason };
  }
  row.status = 'unprocessed'; row.reason = lastReason;
  writeCache(cachePath, { schema: CACHE_SCHEMA, key: unit.cacheKey, outcome: 'unprocessed', reason: lastReason });
  return { row, kind: 'unprocessed', reason: lastReason };
}

function unitsFor({ prepared, manifest, project, ctx }) {
  const units = [];
  const keyOf = content => sha256(JSON.stringify({ v: HISTORY_NIGHT_TEMPLATE_VERSION, rules: ctx.rulesSha,
    writer: ctx.identity, project, ...content }));
  for (const packet of prepared.packets) {
    const full = readJson(packet.path, 20_000_000);
    if (full.packet_id !== packet.packet_id || !manifest.packet_ids.includes(packet.packet_id))
      fail('history_night_packet_mismatch');
    if (packet.layer === 'daily') {
      if (!packet.batch_paths.length) fail('history_night_daily_without_batches');
      packet.batch_paths.forEach((batchPath, index) => {
        const batch = readJson(batchPath, 100_000);
        if (batch.packet_id !== packet.packet_id || batch.batch_index !== index + 1
          || batch.batch_total !== packet.batch_paths.length) fail('history_night_batch_mismatch');
        units.push({ layer: 'daily', key: packet.key, packetId: packet.packet_id, prepareId: prepared.prepare_id,
          batchIndex: index + 1, batchTotal: packet.batch_paths.length, checkBatch: batch,
          prompt: dailyPrompt({ project, day: packet.key, rulesVersion: ctx.rulesVersion,
            prepareId: prepared.prepare_id, packetId: packet.packet_id, batch }),
          cacheKey: keyOf({ day: packet.key, user: batch.user }) });
      });
    } else {
      // Upper packets reuse the batch checker with the packet's own allowed card ids.
      // A packet whose query would pass the budget is split into parts (each part
      // may cite only its own cards) and merged afterwards; it is never left oversize.
      const { parts, truncated } = splitUpperCards({ project, packet: full, rulesVersion: ctx.rulesVersion,
        prepareId: prepared.prepare_id, budget: ctx.maxQuery - RETRY_SUFFIX.length });
      parts.forEach((cards, index) => {
        const part = parts.length > 1 ? { index: index + 1, total: parts.length } : null;
        const ids = part ? cards.map(card => card.card_id) : full.allowed_evidence_ids;
        units.push({ layer: packet.layer, key: packet.key, packetId: packet.packet_id,
          prepareId: prepared.prepare_id, checkBatch: { user: { threads: [{ records: ids.map(id => ({ id })) }] } },
          ...(part ? { batchIndex: part.index, batchTotal: part.total, upperPart: true } : {}),
          truncatedCards: index === 0 ? truncated : 0, packet: full,
          prompt: upperPrompt({ project, packet: full, rulesVersion: ctx.rulesVersion, prepareId: prepared.prepare_id, cards, part }),
          cacheKey: part ? keyOf({ layer: packet.layer, key: packet.key, part: part.index, parts: part.total, cards })
            : keyOf({ layer: packet.layer, key: packet.key, cards: upperCards(full) }) });
      });
    }
  }
  return units;
}

async function runProject({ entry, ctx: base }) {
  const { project } = entry;
  const ctx = { ...base, project };
  const result = { project, status: 'not_started', reason: null, source_status: null,
    changed_days: [], packets: 0, units: [], calls: 0, finalized_layers: [], pending: [],
    accepted_cells: 0, unprocessed_batches: 0, total_sources: null, unquoted_sources: null,
    unquoted_non_work_voice: null };
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
  const batchCharacters = Math.min(MAX_BATCH_CHARACTERS,
    ctx.maxQuery - dailyPromptOverhead({ project, rulesVersion: ctx.rulesVersion }));
  if (batchCharacters < 1000) fail('history_night_query_budget_too_small');
  ctx.callDir = callDirFor(ctx.workRoot, project);
  let stopped = null;
  // One layer per manifest: a failing upper packet never holds back finished days.
  for (const layer of LAYER_ORDER) {
    if (stopped) break;
    if (layer !== 'daily' && ctx.cutoffAt !== null && Date.parse(ctx.clock()) >= ctx.cutoffAt) {
      result.pending.push({ layer, reason: 'history_night_past_cutoff' }); break;
    }
    const prepared = prepareHistoryExchange({ ...common, layers: [layer], batchCharacters });
    if (prepared.status === 'unchanged') continue;
    if (prepared.status !== 'prepared') fail(`history_night_prepare_${prepared.status}`);
    const manifest = readJson(prepared.manifest_path, 2_000_000);
    result.packets += prepared.packets.length;
    const outcomes = [];
    let deferral = null;
    for (const unit of unitsFor({ prepared, manifest, project, ctx })) {
      if (deferral && (deferral.transport || deferral.row.reason === 'history_night_past_cutoff')) {
        result.units.push(unitRow(unit)); continue;
      }
      const outcome = await runUnit(unit, ctx);
      result.calls += outcome.row.attempts.length;
      ctx.totals.calls += outcome.row.attempts.length;
      result.units.push(outcome.row);
      if (outcome.kind === 'deferred' || outcome.kind === 'rejected') deferral ??= outcome;
      if (outcome.transport || outcome.row.reason === 'history_night_past_cutoff') deferral = outcome;
      outcomes.push({ unit, ...outcome });
    }
    // Split upper packets: once every part is accepted, one merge call compresses
    // the parts' sentences. A merge that is rejected or still over the budget
    // falls back to the parts' sentences as they are (the layer still finishes);
    // a transport failure or the cutoff defers the layer like any other unit.
    if (!deferral) for (const packet of prepared.packets.filter(item => item.layer !== 'daily')) {
      const parts = outcomes.filter(item => item.unit.packetId === packet.packet_id && item.unit.upperPart);
      if (parts.length < 2 || parts.some(item => item.kind !== 'accepted')) continue;
      const sentences = parts.flatMap(item => item.sentences);
      const full = parts[0].unit.packet;
      const cited = [...new Set(sentences.flatMap(sentence => sentence.evidence_ids))];
      const unit = { layer: packet.layer, key: packet.key, packetId: packet.packet_id, prepareId: prepared.prepare_id,
        merge: true, checkBatch: { user: { threads: [{ records: cited.map(id => ({ id })) }] } },
        prompt: upperMergePrompt({ project, packet: full, rulesVersion: ctx.rulesVersion, prepareId: prepared.prepare_id, sentences }),
        cacheKey: sha256(JSON.stringify({ v: HISTORY_NIGHT_TEMPLATE_VERSION, rules: ctx.rulesSha, writer: ctx.identity,
          project, layer: packet.layer, key: packet.key, merge: sentences })) };
      const outcome = await runUnit(unit, ctx);
      result.calls += outcome.row.attempts.length;
      ctx.totals.calls += outcome.row.attempts.length;
      result.units.push(outcome.row);
      if (outcome.transport || outcome.row.reason === 'history_night_past_cutoff') { deferral = outcome; break; }
      if (outcome.kind === 'accepted') outcomes.push({ unit, ...outcome, mergeOf: packet.packet_id });
    }
    if (deferral) {
      result.pending.push({ layer, reason: deferral.row.reason });
      if (deferral.transport) stopped = 'transport_failed';
      else if (deferral.row.reason === 'history_night_past_cutoff') stopped = 'deferred_deadline';
      continue; // nothing of this layer is finalized; lower finished layers stay finalized
    }
    const drafts = prepared.packets.map(packet => {
      const all = outcomes.filter(item => item.unit.packetId === packet.packet_id);
      const merged = all.find(item => item.mergeOf === packet.packet_id);
      const mine = merged ? [merged] : all;
      // Parts all accepted but no merged answer: the parts' sentences are used as they are, marked.
      const fallback = !merged && all.filter(item => item.unit.upperPart).length >= 2;
      const unprocessed = mine.filter(item => item.kind === 'unprocessed')
        .map(item => ({ batch_index: item.unit.batchIndex, reason: item.reason }));
      return { packet_id: packet.packet_id, sentences: mine.flatMap(item => item.kind === 'accepted' ? item.sentences : []),
        ...(unprocessed.length ? { unprocessed_batches: unprocessed } : {}), ...(fallback ? { merge_fallback: true } : {}) };
    });
    const finalized = finalizeHistoryExchange({ ...common, prepared: manifest,
      draft: { schema: DRAFT_SCHEMA, prepare_id: prepared.prepare_id, drafts } });
    if (finalized.status === 'finalized') result.finalized_layers.push(layer);
    result.accepted_cells += finalized.accepted_cells?.length ?? 0;
    result.unprocessed_batches += drafts.reduce((sum, item) => sum + (item.unprocessed_batches?.length ?? 0), 0);
    const coverage = finalized.source_coverage ?? [];
    result.total_sources = coverage.reduce((sum, item) => sum + (item.total_sources ?? 0), 0);
    result.unquoted_sources = coverage.reduce((sum, item) => sum + (item.unquoted_sources ?? 0), 0);
    result.unquoted_non_work_voice = coverage.reduce((sum, item) => sum + (item.unquoted_non_work_voice ?? 0), 0);
  }
  result.status = stopped ?? (result.finalized_layers.length ? 'finalized' : result.pending.length ? 'pending' : 'unchanged');
  return result;
}

// ------------------------------------------------------------------ run
export async function runHistoryNight({ config, configSha256 = null, receiptsDir, projects = null,
  date = null, fromDate = null, deadline = null, scheduledStart = null,
  noStartWithinMinutes = DEFAULT_NO_START_WITHIN_MINUTES, profile = null, writerId = null, runBudget = null,
  now = new Date().toISOString(), clock = () => new Date().toISOString(), writer = null,
  collector = undefined, isPidAlive = undefined } = {}) {
  const targetDate = date ?? yesterdayKst(new Date(now));
  const identity = writerIdentity(config, { profile, writerId });
  const budget = runBudget ?? config.writer.run_budget ?? DEFAULT_RUN_BUDGET_SECONDS;
  const callTimeoutSeconds = config.writer.call_timeout_seconds ?? budget + DEFAULT_CALL_MARGIN_SECONDS;
  // A call that may start must be able to finish before the deadline.
  const effectiveNoStart = Math.max(noStartWithinMinutes, Math.ceil(callTimeoutSeconds / 60));
  const deadlineAt = deadline !== null ? nextDeadlineInstant(now, deadline, scheduledStart) : null;
  const deadlineAtMs = deadlineAt !== null ? Date.parse(deadlineAt) : null;
  const cutoffAt = deadlineAtMs !== null ? deadlineAtMs - effectiveNoStart * 60_000 : null;
  const selected = projects === null ? config.projects
    : projects.map(code => config.projects.find(entry => entry.project === code)
      ?? fail('history_night_project_unknown'));
  mkdirSync(receiptsDir, { recursive: true });
  const receipt = { schema: HISTORY_NIGHT_RECEIPT_SCHEMA, status: null, started_at: now, finished_at: null,
    config_sha256: configSha256, target_date: targetDate, from_date: fromDate,
    deadline: deadlineAt !== null ? { configured: deadline, scheduled_start: scheduledStart, at: deadlineAt,
      no_start_within_minutes: effectiveNoStart, requested_no_start_within_minutes: noStartWithinMinutes,
      stopped: false } : null,
    writer: { ...identity, run_budget: budget, call_timeout_seconds: callTimeoutSeconds,
      template: HISTORY_NIGHT_TEMPLATE_VERSION },
    rules_sha256: null, lock: null, projects: [],
    totals: { calls: 0, units: 0, accepted: 0, cached: 0, unprocessed: 0, rejected: 0, deferred: 0, transport_failed: 0 } };
  const staleLockMs = deadlineAtMs !== null
    ? Math.max(MIN_DEADLINE_STALE_LOCK_MS, deadlineAtMs - Date.parse(now) + callTimeoutSeconds * 1000)
    : STALE_LOCK_MS;
  const lock = acquireNightLock(receiptsDir, { now, staleLockMs, ...(isPidAlive ? { isPidAlive } : {}) });
  receipt.lock = lock.acquired ? { healed_stale: lock.healed } : { refused: lock.reason };
  if (!lock.acquired) { receipt.status = 'LOCK_HELD'; return finish(receipt, receiptsDir, clock); }
  try {
    const rulesText = readFileSync(config.rules_file, 'utf8');
    if (config.rules_version && !rulesText.split('\n', 1)[0].includes(config.rules_version))
      fail('history_night_rules_version_mismatch');
    receipt.rules_sha256 = sha256(rulesText);
    receipt.rules_version_expected = HISTORY_WRITER_RULES_VERSION;
    receipt.rules_version_matches = rulesText.split('\n', 1)[0].includes(HISTORY_WRITER_RULES_VERSION);
    const ctx = { targetDate, fromDate, now, clock, cutoffAt, deadlineAtMs, rulesText, rulesSha: receipt.rules_sha256,
      rulesVersion: config.rules_version ?? null, identity, workRoot: config.work_root,
      maxQuery: config.writer.max_query_characters ?? DEFAULT_MAX_QUERY_CHARACTERS,
      callTimeoutMs: callTimeoutSeconds * 1000, collector: collector ?? collectHistorySources, totals: receipt.totals,
      writer: writer ?? hermesWriter({ command: config.writer.command, profile: identity.profile, runBudget: budget }) };
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
    else if (unit.status === 'rejected') receipt.totals.rejected++;
    else if (unit.status === 'transport_failed') receipt.totals.transport_failed++;
    else receipt.totals.deferred++;
  }
  if (receipt.status === null) receipt.status = runStatus(receipt);
  return finish(receipt, receiptsDir, clock);
}
function runStatus(receipt) {
  const rows = receipt.projects;
  const deadlineStop = rows.some(row => row.status === 'deferred_deadline' || row.status === 'not_started'
    || (row.pending ?? []).some(item => item.reason === 'history_night_past_cutoff'));
  if (receipt.deadline) receipt.deadline.stopped = deadlineStop;
  if (rows.some(row => ['failed', 'source_hold'].includes(row.status))) return 'FAILED';
  const progressed = rows.some(row => (row.finalized_layers ?? []).length);
  if (rows.some(row => row.status === 'transport_failed') && !progressed) return 'FAILED';
  if (rows.length && rows.every(row => row.status === 'not_started')) return 'SKIPPED_PAST_DEADLINE';
  if (deadlineStop || rows.some(row => row.status === 'transport_failed' || (row.pending ?? []).length)) return 'PARTIAL';
  return 'OK';
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
    '--deadline', '--scheduled-start', '--no-start-within', '--profile', '--writer-id', '--run-budget', '--now']);
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
    || (args['--writer-id'] && !WRITER_ID.test(args['--writer-id']))
    || (args['--now'] && !Number.isFinite(Date.parse(args['--now']))))
    fail('history_night_arguments_invalid');
  const projects = args['--projects'] ? args['--projects'].split(',') : null;
  if (projects && (projects.some(code => !CODE.test(code)) || new Set(projects).size !== projects.length))
    fail('history_night_arguments_invalid');
  return { configPath: args['--config'], configSha256: args['--config-sha256'] ?? null,
    receiptsDir: args['--receipts'], projects, date: args['--date'] ?? null, fromDate: args['--from-date'] ?? null,
    deadline: args['--deadline'] ?? null, scheduledStart: args['--scheduled-start'] ?? null,
    noStartWithinMinutes: args['--no-start-within'] ? int(args['--no-start-within'], 0, 600) : DEFAULT_NO_START_WITHIN_MINUTES,
    profile: args['--profile'] ?? null, writerId: args['--writer-id'] ?? null,
    runBudget: args['--run-budget'] ? int(args['--run-budget'], 60, 7200) : null,
    now: args['--now'] ? new Date(args['--now']).toISOString() : new Date().toISOString() };
}
export async function historyNightCli(argv = process.argv.slice(2), { stdout = process.stdout,
  stderr = process.stderr, writer, collector, clock, isPidAlive } = {}) {
  let parsed, loaded;
  try {
    parsed = parseArgs(argv);
    loaded = readNightConfig(parsed.configPath, parsed.configSha256);
    if (parsed.projects) for (const code of parsed.projects)
      if (!loaded.config.projects.some(entry => entry.project === code)) fail('history_night_project_unknown');
    writerIdentity(loaded.config, parsed);
  } catch (error) {
    stderr.write(`${JSON.stringify({ status: 'CONFIG_INVALID', code: safeCode(error) })}\n`);
    return EXIT.CONFIG_INVALID;
  }
  try {
    const { receipt, exitCode } = await runHistoryNight({ config: loaded.config, configSha256: loaded.config_sha256,
      ...parsed, ...(clock ? { clock } : {}), writer: writer ?? null, collector, isPidAlive });
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

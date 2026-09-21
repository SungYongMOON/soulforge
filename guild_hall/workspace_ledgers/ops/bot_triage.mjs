#!/usr/bin/env node
// Bot-facing wrapper around this module's 판독(triage) API -- the ONLY surface a
// local chat bot is ever given for the 미분류 queue.
//
// Why a wrapper at all, when `cli.mjs triage list|decide` already exists: that CLI
// takes `--reader`, `--human-actors`, `--workspaces-root`, `--reading-table` and
// every other path as free arguments, and accepts all five 판독 levels including
// `include`. Handing that to a model means the model can assert who it is, which
// tables it writes, and how strong its own attribution counts as. The module README
// says the reader identity is caller-asserted and must be pinned by a lane wrapper,
// not by the model -- this file is that wrapper.
//
// Everything that decides WHO and WHERE comes from ONE pinned config file
// (`--config` + `--config-sha256`), never from a flag:
//   - `reader_label`  -> the `reader` every appended row carries. There is no flag
//                        that can override it; an unrecognised flag is refused
//                        outright rather than ignored, so `--reader <someone>` is a
//                        refusal, not a silent no-op.
//   - `human_actors`  -> the human allow-list handed to `appendReadingDecision`.
//   - workspaces root, org config (itself digest-pinned), custody directories and
//     the reading table -- all fixed by the config.
// The model chooses only: which mail (`--id`), which level, which target, and why.
//
// Levels: `include` is REFUSED here. An AI reader's positive attribution starts one
// notch weaker (`include_with_review`) -- the same rule `appendReadingDecision`'s own
// `humanActors` check enforces from the library side; this wrapper refuses it a step
// earlier, with a code that says so, so the bot gets an instruction rather than a
// permission error.
//
// Correction is deliberately NOT here. When the Owner disagrees with a row, the bot
// replies with the line a person should apply and writes nothing -- the Owner確認
// column and every correction stay human-only (see ops/bot-skill/SKILL.md).
//
// Exit codes: 0 ok; 2 refused (a guardrail here, or a refusal raised by the library);
// 4 a config/digest problem -- the run never started and nothing, not even a receipt,
// was written.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { seoulDateOf } from '../src/ledgers.mjs';
import { resolveOwnerTablePaths } from '../src/owner_tables.mjs';
import { redactHostPaths } from '../src/refresh.mjs';
import { listProjects } from '../src/rule_store.mjs';
import {
  appendReadingDecision, EXCLUDE_FIXED_TARGETS, EXCLUDE_LEGACY_TARGETS, listUnclassified,
} from '../src/triage.mjs';

export const BOT_TRIAGE_CONFIG_SCHEMA = 'soulforge.workspace_ledgers_bot_triage_config.v1';
export const BOT_TRIAGE_RECEIPT_SCHEMA = 'soulforge.workspace_ledgers_bot_triage_receipt.v1';

/**
 * The four levels this wrapper will write. `include` is absent on purpose (see the
 * file header); `READING_LEVELS` (the library's own five) stays the wider set a
 * human-driven caller may use.
 */
export const BOT_ALLOWED_LEVELS = Object.freeze(['include_with_review', 'exclude', 'vendor_only', 'hold_owner_review']);

/**
 * The exclude categories the bot may write, enumerated FROM the library's own
 * vocabulary rather than copied: every fixed token `isAllowedExcludeTarget` accepts,
 * minus the superseded spellings (`EXCLUDE_LEGACY_TARGETS`) -- a row already written
 * under an old name keeps working, but a NEW row uses the current name.
 *
 * The library also accepts `일반업무:<detail>`-style prefixed targets. Those carry
 * free text after the colon, which is exactly what this wrapper refuses to let a
 * model invent, so they are not offered here: the bot picks from a closed menu.
 */
export function botExcludeTargets() {
  return [...EXCLUDE_FIXED_TARGETS].filter(token => !EXCLUDE_LEGACY_TARGETS.has(token)).sort();
}

// The library's own `listUnclassified` hard cap. `show`/`decide` look a mail up by id
// inside this window; a queue longer than that is reported as such rather than
// silently searched half-way (see `findQueueItem`).
const QUEUE_SCAN_LIMIT = 500;
const DEFAULT_SHOW_CHARS = 4000;
const MAX_SHOW_CHARS = 6000;
// The bot's context is small: one screen of Korean text, never a dump. Every command
// renders into this budget and says how much it left out.
export const MAX_STDOUT_CHARS = 6000;
const MAX_WHY_CHARS = 200;
const MAX_SUBJECT_CHARS = 60;
const MAX_ATTACHMENTS_SHOWN = 5;
const MAX_RECIPIENTS_SHOWN = 4;
const SHA256_PIN = /^sha256:[0-9a-f]{64}$/u;

export class BotTriageError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'BotTriageError';
    this.code = code;
    this.detail = detail ?? null;
  }
}
const fail = (code, detail) => { throw new BotTriageError(code, detail); };

const sha256Hex = bytes => createHash('sha256').update(bytes).digest('hex');
const sha256Of = bytes => `sha256:${sha256Hex(bytes)}`;

// ------------------------------------------------------------------ redaction
// A local part before `@` is the one piece of an address this surface never prints:
// the skill's own rule is that an address never decides a project, so the bot has no
// reason to see one, and a bot that cannot see one cannot quote one back into a chat
// room. Name and domain are kept -- those are what a reader actually judges by.
// Applied to EVERY line this file prints (subject, attachment names and body text
// included), so there is one place to check rather than one per field.
const ADDRESS_LOCAL_PART = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/gu;
export function maskAddresses(text) {
  return String(text ?? '').replace(ADDRESS_LOCAL_PART, (match, domain) => `@${domain}`);
}
/** The domain of an address, or `''` -- never the local part. */
export function domainOf(address) {
  const at = String(address ?? '').lastIndexOf('@');
  return at === -1 ? '' : String(address).slice(at + 1).trim();
}
/** `이름 @도메인` for the sender line; an address with no display name stays nameless rather than borrowing its local part. */
export function senderLabel(from) {
  if (!from) return '(발신자 없음)';
  const name = String(from.name ?? '').trim();
  const domain = domainOf(from.email);
  const shown = name === '' ? '(이름 없음)' : name;
  return domain === '' ? shown : `${shown} @${domain}`;
}
/**
 * `listUnclassified` renders a recipient as `name || email`, so a recipient with no
 * display name arrives as a bare address. Masking alone would leave a naked
 * `@domain`, which reads like a mistake; this says what it actually is.
 */
export function recipientLabel(entry) {
  const text = String(entry ?? '').trim();
  const domain = /^[^\s@]+@[^\s@]+$/u.test(text) ? domainOf(text) : '';
  return domain === '' ? text : `(이름 없음) @${domain}`;
}

// ------------------------------------------------------------------ config
function assertString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') fail('workspace_ledgers_bot_triage_config_field_invalid', field);
  return value;
}
function assertDirList(value, field) {
  if (!Array.isArray(value) || value.length === 0) fail('workspace_ledgers_bot_triage_config_field_invalid', field);
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim() === '') fail('workspace_ledgers_bot_triage_config_field_invalid', field);
  }
  return value;
}
function assertInteger(value, field, { min, max }) {
  if (!Number.isInteger(value) || value < min || value > max) fail('workspace_ledgers_bot_triage_config_field_invalid', field);
  return value;
}

/** Same write-free usability check `ops/daily_refresh.mjs` applies to its own `--receipts` (R-1 there): a directory this run could never create is refused before start, not discovered at the first write. */
function assertReceiptsDirUsable(receiptsDir) {
  let cursor = path.resolve(receiptsDir);
  for (;;) {
    if (existsSync(cursor)) break;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  let stat;
  try { stat = statSync(cursor); }
  catch { fail('workspace_ledgers_bot_triage_config_receipts_unusable'); return; }
  if (!stat.isDirectory()) fail('workspace_ledgers_bot_triage_config_receipts_unusable');
}

/**
 * Reads and verifies the one pinned config. Every failure here is a "this run never
 * started" failure (exit 4) and writes nothing at all -- not even a receipt, because
 * the receipts directory itself is one of the things this function is still deciding
 * whether it can trust.
 */
export function loadBotConfig({ configPath, configSha256 }) {
  if (typeof configPath !== 'string' || configPath.trim() === '') fail('workspace_ledgers_bot_triage_config_required');
  if (!SHA256_PIN.test(String(configSha256 ?? ''))) fail('workspace_ledgers_bot_triage_config_sha256_invalid');
  let bytes;
  try { bytes = readFileSync(configPath); }
  catch { fail('workspace_ledgers_bot_triage_config_unreadable', path.basename(String(configPath))); }
  if (sha256Of(bytes) !== configSha256) fail('workspace_ledgers_bot_triage_config_sha256_mismatch');
  let raw;
  try { raw = JSON.parse(bytes.toString('utf8')); }
  catch { fail('workspace_ledgers_bot_triage_config_invalid_json'); }
  if (raw?.schema_version !== BOT_TRIAGE_CONFIG_SCHEMA) {
    fail('workspace_ledgers_bot_triage_config_schema_unknown', String(raw?.schema_version ?? ''));
  }

  const workspacesRoot = assertString(raw.workspaces_root, 'workspaces_root');
  const orgConfigPath = assertString(raw.org_config, 'org_config');
  const orgConfigSha256 = assertString(raw.org_config_sha256, 'org_config_sha256');
  if (!SHA256_PIN.test(orgConfigSha256)) fail('workspace_ledgers_bot_triage_config_field_invalid', 'org_config_sha256');
  const custody = raw.custody ?? {};
  const hiworksDirs = assertDirList(custody.hiworks_events, 'custody.hiworks_events');
  const gmailSentDirs = assertDirList(custody.gmail_sent_events, 'custody.gmail_sent_events');
  const receiptsDir = assertString(raw.receipts_dir, 'receipts_dir');
  const readerLabel = assertString(raw.reader_label, 'reader_label');
  if (!Array.isArray(raw.human_actors) || raw.human_actors.some(entry => typeof entry !== 'string' || entry.trim() === '')) {
    fail('workspace_ledgers_bot_triage_config_field_invalid', 'human_actors');
  }
  const dailyDecisionCap = assertInteger(raw.daily_decision_cap, 'daily_decision_cap', { min: 0, max: 1000 });
  const listLimitCap = assertInteger(raw.list_limit_cap, 'list_limit_cap', { min: 1, max: 100 });
  const readingTableOverride = raw.reading_table ?? null;
  if (readingTableOverride !== null && (typeof readingTableOverride !== 'string' || readingTableOverride.trim() === '')) {
    fail('workspace_ledgers_bot_triage_config_field_invalid', 'reading_table');
  }

  let workspacesStat;
  try { workspacesStat = statSync(workspacesRoot); }
  catch { fail('workspace_ledgers_bot_triage_config_workspaces_root_missing'); }
  if (!workspacesStat.isDirectory()) fail('workspace_ledgers_bot_triage_config_workspaces_root_missing');

  let orgConfigBytes;
  try { orgConfigBytes = readFileSync(orgConfigPath); }
  catch { fail('workspace_ledgers_bot_triage_config_org_config_unreadable', path.basename(orgConfigPath)); }
  if (sha256Of(orgConfigBytes) !== orgConfigSha256) fail('workspace_ledgers_bot_triage_config_org_config_sha256_mismatch');
  let orgConfig;
  try { orgConfig = JSON.parse(orgConfigBytes.toString('utf8')); }
  catch { fail('workspace_ledgers_bot_triage_config_org_config_invalid_json'); }

  assertReceiptsDirUsable(receiptsDir);

  // ONE resolved reading-table path for both the queue read and the append, so the
  // list a decision was made from and the table that decision lands in can never be
  // two different files (the module README's "hard operating rule", applied to this
  // wrapper). An explicit `reading_table` in the config wins; otherwise the pinned
  // org config's own `common_ledgers.owner_tables.reading` does.
  const resolved = resolveOwnerTablePaths({ readingTablePath: readingTableOverride }, { orgConfig, workspacesRoot });
  if (!resolved.readingTablePath) fail('workspace_ledgers_bot_triage_config_reading_table_unresolved');

  return {
    configSha256,
    workspacesRoot,
    orgConfigPath,
    hiworksDirs,
    gmailSentDirs,
    receiptsDir,
    readerLabel,
    humanActors: [...raw.human_actors],
    dailyDecisionCap,
    listLimitCap,
    readingTablePath: resolved.readingTablePath,
  };
}

// ------------------------------------------------------------------ receipts
const RECEIPT_PREFIX = 'bot_triage-';

/**
 * One small receipt per call. Carries what happened (command, mail id, level, target
 * vocabulary, result code, counts) and nothing a reader could reconstruct the mail
 * from: no subject, no body, no address, no host path. A target that is free text
 * rather than module vocabulary (a vendor name) is recorded as a hash instead of
 * itself, so even the one Owner-typed string this surface accepts never lands here.
 */
export function buildReceipt({ at, command, config, mailId = null, level = null, target = null, result, code = null, counts = {} }) {
  const targetView = describeTarget(level, target);
  return {
    schema_version: BOT_TRIAGE_RECEIPT_SCHEMA,
    at,
    command,
    reader_label: config.readerLabel,
    config_sha256: config.configSha256,
    mail_id: mailId,
    level,
    target: targetView.target,
    target_kind: targetView.kind,
    target_hash: targetView.hash,
    result,
    code,
    counts,
  };
}

/** Which of a target's two natures this one is: closed module vocabulary (recorded as itself) or Owner-typed free text (recorded as a hash). */
export function describeTarget(level, target) {
  const text = String(target ?? '').trim();
  if (text === '') return { target: null, kind: 'none', hash: null };
  if (level === 'include_with_review' || level === 'hold_owner_review') return { target: text, kind: 'project_code', hash: null };
  if (level === 'exclude') return { target: text, kind: 'exclude_category', hash: null };
  return { target: null, kind: 'vendor', hash: `sha256:${sha256Hex(text).slice(0, 16)}` };
}

export function writeReceipt(receiptsDir, receipt) {
  mkdirSync(receiptsDir, { recursive: true });
  const stamp = String(receipt.at).replace(/[:.]/gu, '-');
  const fileName = `${RECEIPT_PREFIX}${stamp}-${receipt.command}-${randomUUID().slice(0, 8)}.json`;
  const target = path.join(receiptsDir, fileName);
  const staging = path.join(receiptsDir, `.${fileName}.tmp-${randomUUID()}`);
  writeFileSync(staging, `${JSON.stringify(receipt, null, 2)}\n`);
  renameSync(staging, target);
  return target;
}

/**
 * How many decisions this wrapper has already APPENDED today (Seoul calendar day, the
 * same day boundary every display date in this module uses). Counted from this
 * wrapper's own receipts, not from the table: a row a person wrote by hand, or a row
 * from another reader, is not this bot's daily budget. Refusals do not count -- a
 * budget that a rejected call could burn would let one malformed loop silence the bot
 * for the rest of the day.
 */
export function countDecisionsToday(receiptsDir, now) {
  const today = seoulDateOf(now);
  let entries;
  try { entries = readdirSync(receiptsDir); }
  catch { return 0; }
  let count = 0;
  for (const name of entries) {
    if (!name.startsWith(RECEIPT_PREFIX) || !name.endsWith('.json')) continue;
    let parsed;
    try { parsed = JSON.parse(readFileSync(path.join(receiptsDir, name), 'utf8')); }
    catch { continue; }
    if (parsed?.schema_version !== BOT_TRIAGE_RECEIPT_SCHEMA) continue;
    if (parsed.command !== 'decide' || parsed.result !== 'ok') continue;
    if (seoulDateOf(parsed.at) === today) count += 1;
  }
  return count;
}

// ------------------------------------------------------------------ rendering
/** Joins `lines` into one bounded block; anything past the budget becomes an explicit "N more" line rather than a silent cut. */
export function boundedOutput(lines, { budget = MAX_STDOUT_CHARS, moreLabel = '줄' } = {}) {
  const kept = [];
  let used = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const cost = line.length + 1;
    const remaining = lines.length - index;
    if (used + cost > budget && kept.length > 0) {
      kept.push(`… ${remaining}${moreLabel} 더 있습니다 (표시 한도 ${budget}자).`);
      break;
    }
    kept.push(line);
    used += cost;
  }
  return maskAddresses(kept.join('\n'));
}

function shorten(text, max) {
  const flat = String(text ?? '').replace(/\s+/gu, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * The "maybe look here" project codes, from the two review-only signals the
 * classification pass already computed: `candidates` (its own ambiguity list -- two
 * projects' subject terms colliding, or several projects' terms in the body) and
 * `hint_codes` (projects whose HINT terms matched but whose exact terms did not).
 * Neither is attribution, and the skill says so; both are places to read.
 */
export function candidateCodes(item) {
  return [...new Set([...(item.candidates ?? []), ...(item.hint_codes ?? [])])];
}

function attachmentsLabel(names) {
  if (!Array.isArray(names) || names.length === 0) return '첨부 없음';
  const shown = names.slice(0, MAX_ATTACHMENTS_SHOWN).map(name => shorten(name, 40));
  const extra = names.length > shown.length ? ` 외 ${names.length - shown.length}건` : '';
  return `첨부 ${names.length}건: ${shown.join(', ')}${extra}`;
}

function listLine(index, item) {
  const parts = [
    `${index}) ${item.mail_source_id}`,
    seoulDateOf(item.received_at),
    senderLabel(item.from),
    `"${shorten(item.subject, MAX_SUBJECT_CHARS)}"`,
    attachmentsLabel(item.attachment_names),
    `후보 ${candidateCodes(item).length > 0 ? candidateCodes(item).join('/') : '없음'}`,
    `거래처 ${item.vendors.length > 0 ? item.vendors.join('/') : '없음'}`,
  ];
  if (item.already_decided_invalid) parts.push(`손질필요(${item.already_decided_invalid})`);
  return parts.join(' · ');
}

// ------------------------------------------------------------------ queue
function readQueue(config, { bodyPreviewChars } = {}) {
  // `allowDegradedOwnerTables` is never passed: a malformed Owner table makes the
  // library throw `workspace_ledgers_triage_owner_table_failures`, and that refusal is
  // surfaced as-is rather than opted out of. A bot working a queue computed against a
  // broken table would file mail under the wrong project and never know.
  return listUnclassified({
    workspacesRoot: config.workspacesRoot,
    hiworksDirs: config.hiworksDirs,
    gmailSentDirs: config.gmailSentDirs,
    orgConfigPath: config.orgConfigPath,
    readingTablePath: config.readingTablePath,
    limit: QUEUE_SCAN_LIMIT,
    ...(bodyPreviewChars ? { bodyPreviewChars } : {}),
    maxParticipants: MAX_RECIPIENTS_SHOWN,
  });
}

function findQueueItem(queue, id) {
  const item = queue.items.find(entry => entry.mail_source_id === id);
  if (item) return item;
  if (queue.total > queue.items.length) fail('workspace_ledgers_bot_triage_id_not_in_queue_window', String(queue.items.length));
  return fail('workspace_ledgers_bot_triage_id_not_in_queue');
}

// ------------------------------------------------------------------ commands
function runList(config, { limit, now }) {
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) fail('workspace_ledgers_bot_triage_limit_invalid', String(limit));
  const effectiveLimit = Math.min(limit ?? config.listLimitCap, config.listLimitCap);
  const queue = readQueue(config);
  const shown = queue.items.slice(0, effectiveLimit);
  const decisionsToday = countDecisionsToday(config.receiptsDir, now);
  const header = `미분류 ${queue.total}건 · 아래 ${shown.length}건 표시 · 오늘 판독 ${decisionsToday}/${config.dailyDecisionCap}건`;
  const lines = [header, ...shown.map((item, index) => listLine(index + 1, item))];
  if (queue.total > shown.length) lines.push(`… 남은 ${queue.total - shown.length}건은 이번 목록에 없습니다.`);
  return {
    stdout: boundedOutput(lines, { moreLabel: '줄이' }),
    counts: { queue_total: queue.total, listed: shown.length, decisions_today: decisionsToday, daily_cap: config.dailyDecisionCap },
  };
}

function runShow(config, { id, maxChars }) {
  if (typeof id !== 'string' || id.trim() === '') fail('workspace_ledgers_bot_triage_id_required');
  if (maxChars !== null && (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > MAX_SHOW_CHARS)) {
    fail('workspace_ledgers_bot_triage_max_chars_invalid', String(maxChars));
  }
  const bodyChars = maxChars ?? DEFAULT_SHOW_CHARS;
  const queue = readQueue(config, { bodyPreviewChars: bodyChars });
  const item = findQueueItem(queue, id);
  const recipients = item.to.length > 0 ? item.to.map(recipientLabel).join(', ') : '(없음)';
  const lines = [
    `${item.mail_source_id} · ${seoulDateOf(item.received_at)} · 대기줄 ${item.bucket}`,
    `보낸이: ${senderLabel(item.from)}`,
    `받는이: ${shorten(recipients, 120)}`,
    `제목: ${shorten(item.subject, 200)}`,
    attachmentsLabel(item.attachment_names),
    `후보 ${candidateCodes(item).length > 0 ? candidateCodes(item).join('/') : '없음'} · 거래처 ${item.vendors.length > 0 ? item.vendors.join('/') : '없음'}`
      + ` · 같은 대화 ${item.same_thread_routing.length > 0 ? item.same_thread_routing.join('/') : '없음'}`,
    ...(item.already_decided_invalid ? [`주의: 이미 판독줄이 있으나 쓸 수 없는 상태다(${item.already_decided_invalid}) — 사람이 표를 고쳐야 한다.`] : []),
    `본문(최대 ${bodyChars}자):`,
    item.body_preview === '' ? '(본문 없음)' : item.body_preview,
  ];
  return {
    stdout: boundedOutput(lines, { moreLabel: '줄이' }),
    counts: { queue_total: queue.total, body_chars: Math.min(item.body_preview.length, bodyChars) },
  };
}

function validateWhy(why) {
  if (typeof why !== 'string' || why.trim() === '') fail('workspace_ledgers_bot_triage_why_required');
  if (/[\r\n]/u.test(why)) fail('workspace_ledgers_bot_triage_why_not_single_line');
  if (why.length > MAX_WHY_CHARS) fail('workspace_ledgers_bot_triage_why_too_long', String(MAX_WHY_CHARS));
  return why.trim();
}

/** The target vocabulary each allowed level accepts -- a closed set in every case, never free text the model composes. */
function validateTarget(config, { level, target, item }) {
  const text = String(target ?? '').trim();
  const knownCodes = new Set(listProjects({ workspacesRoot: config.workspacesRoot }).map(project => project.project_code));
  if (level === 'include_with_review') {
    if (text === '') fail('workspace_ledgers_bot_triage_target_required', level);
    // One mail, one project. The library accepts `A;B` (Owner-confirmed sharing);
    // a bot asserting that two projects share a mail is exactly the guess this
    // wrapper exists to prevent -- it holds for the Owner instead.
    if (text.includes(';')) fail('workspace_ledgers_bot_triage_target_multiple_projects', text);
    if (!knownCodes.has(text)) fail('workspace_ledgers_bot_triage_target_unknown_project', text);
    return text;
  }
  if (level === 'exclude') {
    if (!botExcludeTargets().includes(text)) fail('workspace_ledgers_bot_triage_target_not_allowed', text);
    return text;
  }
  if (level === 'vendor_only') {
    // S3 in the module README: a `vendor_only` row naming no organisation this module
    // can match routes nowhere and can only be fixed by a person editing the CSV.
    if (item.vendors.length === 0) fail('workspace_ledgers_bot_triage_vendor_only_without_organisation');
    if (!item.vendors.includes(text)) fail('workspace_ledgers_bot_triage_target_not_a_matched_vendor');
    return text;
  }
  // hold_owner_review: a target is optional (the honest "no idea" case) and, when
  // given, is read as "maybe this project" -- so it still has to be a real code.
  if (text === '') return '';
  if (!knownCodes.has(text)) fail('workspace_ledgers_bot_triage_target_unknown_project', text);
  return text;
}

function runDecide(config, { id, level, target, why, now }) {
  if (typeof id !== 'string' || id.trim() === '') fail('workspace_ledgers_bot_triage_id_required');
  if (level === 'include') fail('workspace_ledgers_bot_triage_level_include_refused');
  if (!BOT_ALLOWED_LEVELS.includes(level)) fail('workspace_ledgers_bot_triage_level_not_allowed', String(level));
  const cleanWhy = validateWhy(why);
  const decisionsToday = countDecisionsToday(config.receiptsDir, now);
  if (decisionsToday >= config.dailyDecisionCap) {
    fail('workspace_ledgers_bot_triage_daily_cap_reached', `${decisionsToday}/${config.dailyDecisionCap}`);
  }
  const queue = readQueue(config);
  const item = findQueueItem(queue, id);
  if (item.already_decided_invalid) {
    fail('workspace_ledgers_bot_triage_mail_already_decided_invalid', item.already_decided_invalid);
  }
  const cleanTarget = validateTarget(config, { level, target, item });

  // The only call that writes. `reader`/`humanActors` come from the config and have
  // no flag; `receivedAt`/`subject` come from the queue entry, so the Owner-facing
  // table reads as mail rather than as opaque ids.
  const result = appendReadingDecision({
    workspacesRoot: config.workspacesRoot,
    readingTablePath: config.readingTablePath,
    id,
    level,
    target: cleanTarget,
    why: cleanWhy,
    reader: config.readerLabel,
    humanActors: config.humanActors,
    receivedAt: item.received_at,
    subject: item.subject,
    now,
  });
  const lines = [
    `기록했습니다: ${id} → ${level}${cleanTarget === '' ? '' : ` / ${cleanTarget}`}`,
    `이유: ${shorten(cleanWhy, MAX_WHY_CHARS)}`,
    `판독자: ${config.readerLabel} · Owner확인 칸은 비워 두었습니다(사람만 채웁니다).`,
    `오늘 판독 ${decisionsToday + 1}/${config.dailyDecisionCap}건 · 판독표 ${result.row_count}줄`,
  ];
  return {
    stdout: boundedOutput(lines, { moreLabel: '줄이' }),
    level,
    target: cleanTarget,
    counts: {
      queue_total: queue.total,
      decisions_today: decisionsToday + 1,
      daily_cap: config.dailyDecisionCap,
      reading_table_rows: result.row_count,
    },
  };
}

// ------------------------------------------------------------------ CLI
const COMMAND_FLAGS = Object.freeze({
  list: ['config', 'config-sha256', 'limit'],
  show: ['config', 'config-sha256', 'id', 'max-chars'],
  decide: ['config', 'config-sha256', 'id', 'level', 'target', 'why'],
});

/**
 * A STRICT parser: only the flags the named command declares are accepted, and an
 * unrecognised one is a refusal rather than something quietly ignored. This is what
 * makes "the reader label cannot be overridden" a property of the surface rather than
 * a promise -- `--reader X`, `--human-actors X`, `--workspaces-root X` and every other
 * identity/path flag simply do not exist here, and passing one stops the call.
 */
export function parseStrictArgs(command, argv) {
  const allowed = COMMAND_FLAGS[command];
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) fail('workspace_ledgers_bot_triage_unexpected_argument', token);
    const name = token.slice(2);
    if (!allowed.includes(name)) fail('workspace_ledgers_bot_triage_unknown_flag', name);
    if (flags.has(name)) fail('workspace_ledgers_bot_triage_repeated_flag', name);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) fail('workspace_ledgers_bot_triage_flag_value_required', name);
    index += 1;
    flags.set(name, next);
  }
  return flags;
}

function integerFlag(flags, name) {
  if (!flags.has(name)) return null;
  const raw = flags.get(name);
  if (!/^\d+$/u.test(raw)) fail('workspace_ledgers_bot_triage_flag_value_invalid', name);
  return Number(raw);
}

// Explicit, never a substring match on a library code (the lesson
// `ops/daily_refresh.mjs`'s own S2 records): only this wrapper's pre-start config
// codes are a 4. Everything else -- a guardrail here, a library refusal, an
// unexpected library error -- is a 2, which is what "this call did not write a row"
// means to the bot either way.
export function exitCodeFor(code) {
  return typeof code === 'string' && code.startsWith('workspace_ledgers_bot_triage_config') ? 4 : 2;
}

const COMMAND_RUNNERS = { list: runList, show: runShow, decide: runDecide };

export function runCli(argv, { now = new Date().toISOString(), stdout = console.log, stderr = console.error } = {}) {
  const [command, ...rest] = argv;
  if (command === 'correct') {
    // Deliberately absent, and said so rather than reported as "unknown": a
    // correction is the Owner's, and the bot's job is to hand back the line a person
    // should apply (see ops/bot-skill/SKILL.md), not to rewrite the table.
    stderr('workspace_ledgers_bot_triage_correct_not_supported: 판독줄 정정은 사람만 합니다 — 적용할 명령 한 줄을 Owner에게 답으로 드리고 아무것도 쓰지 마십시오.');
    return 2;
  }
  if (!Object.hasOwn(COMMAND_RUNNERS, String(command))) {
    stderr(`workspace_ledgers_bot_triage_unknown_command: ${String(command ?? '')} (list | show | decide)`);
    return 2;
  }

  let flags;
  try { flags = parseStrictArgs(command, rest); }
  catch (error) { stderr(`${error.code}${error.detail ? `: ${error.detail}` : ''}`); return 2; }

  let config;
  try { config = loadBotConfig({ configPath: flags.get('config') ?? null, configSha256: flags.get('config-sha256') ?? null }); }
  catch (error) {
    // Exit 4 and nothing written -- including no receipt, because the receipts
    // directory is itself one of the config facts that just failed to verify.
    stderr(`${error.code ?? 'workspace_ledgers_bot_triage_config_invalid'}${error.detail ? `: ${error.detail}` : ''}`);
    return exitCodeFor(error.code ?? 'workspace_ledgers_bot_triage_config_invalid');
  }

  let outcome = null;
  let failure = null;
  try {
    outcome = COMMAND_RUNNERS[command](config, {
      now,
      limit: integerFlagSafe(flags, 'limit'),
      maxChars: integerFlagSafe(flags, 'max-chars'),
      id: flags.get('id') ?? null,
      level: flags.get('level') ?? null,
      target: flags.get('target') ?? null,
      why: flags.get('why') ?? null,
    });
  } catch (error) {
    failure = error;
  }

  const receipt = buildReceipt({
    at: now,
    command,
    config,
    mailId: flags.get('id') ?? null,
    level: failure ? (flags.get('level') ?? null) : (outcome?.level ?? null),
    target: failure ? null : (outcome?.target ?? null),
    result: failure ? 'refused' : 'ok',
    code: failure ? (failure.code ?? 'workspace_ledgers_bot_triage_failed') : null,
    counts: failure ? {} : (outcome.counts ?? {}),
  });
  try { writeReceipt(config.receiptsDir, receipt); }
  catch (error) { stderr(`workspace_ledgers_bot_triage_receipt_write_failed: ${redactHostPaths(String(error?.message ?? error))}`); }

  if (failure) {
    stderr(`${failure.code ?? 'workspace_ledgers_bot_triage_failed'}${failure.detail ? `: ${redactHostPaths(String(failure.detail))}` : ''}`);
    return exitCodeFor(failure.code);
  }
  stdout(outcome.stdout);
  return 0;
}

/** `integerFlag` for a flag the current command may not even declare -- absent is always `null`, never a parse failure. */
function integerFlagSafe(flags, name) {
  return flags.has(name) ? integerFlag(flags, name) : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(process.argv.slice(2));
}

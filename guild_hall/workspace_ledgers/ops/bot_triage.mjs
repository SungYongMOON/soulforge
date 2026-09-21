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
// Exit codes: 0 ok; 2 refused (a guardrail here, or a refusal raised by the library),
// or this wrapper could not write its own receipt (S-1: the receipts directory IS the
// daily-cap ledger, so an unwritten receipt is never a warning -- and when the row had
// already been appended, the code says so and stderr states that the table changed);
// 4 a config/digest problem -- the run never started and nothing, not even a receipt,
// was written.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
// N-1: how much of a rejected, unvalidated value (a raw `--level`, a raw `--id`) may
// reach a receipt or stderr at all.
const MAX_RECORDED_LABEL_CHARS = 80;
// S-3: `show` gives the body its OWN budget rather than letting it share one with the
// headers -- at the documented maximum the headers used to consume the whole stdout
// cap and the body line was dropped entirely, which is the one thing `show` is for.
const MIN_BODY_BUDGET = 400;
// Room for the `본문(최대 N자):` label line and the truncation note appended to the
// body, so neither can push the rendered total past `MAX_STDOUT_CHARS`.
const BODY_LABEL_RESERVE = 80;
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

// ------------------------------------------------------- control characters
// R-1 (2026-09-22 fresh review): only CR/LF used to be refused, so any other C0/C1
// control character a model can type -- NUL, ESC, VT, TAB, a terminal escape
// sequence's introducer -- travelled straight into the Owner's reading-decision CSV
// (where a raw control byte makes the file unopenable in some editors and makes git
// treat it as binary, the exact class of damage this module's own byte_hygiene test
// exists to catch), into a receipt, and onto stdout, where an escape sequence can
// rewrite what the operator sees. Every free-text value the bot supplies is checked;
// TAB is refused like the rest rather than stripped, because silently rewriting what
// a reader said is worse than telling it to retype.
const CONTROL_CHARACTER = /\p{Cc}/u;
const CONTROL_CHARACTER_GLOBAL = /\p{Cc}/gu;
export function hasControlCharacters(value) {
  return CONTROL_CHARACTER.test(String(value ?? ''));
}
/**
 * N-1: the LAST line of defence for a value that is about to be recorded or printed
 * even though the call is already failing -- a refused `--level`/`--id` still reaches
 * the receipt and stderr, and it must not carry a control byte or an unbounded blob
 * there either. Validation (above) is what refuses; this only makes the record of the
 * refusal safe, and never runs on a value that passed validation unchanged.
 */
export function safeLabel(value, max = MAX_RECORDED_LABEL_CHARS) {
  if (value === null || value === undefined) return null;
  return String(value).replace(CONTROL_CHARACTER_GLOBAL, '').slice(0, max);
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
    // S-5: kept so every command can re-verify the SAME digest after the library has
    // re-read the file for itself (see `assertOrgConfigUnchanged`).
    orgConfigSha256,
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
    // S-6 (2026-09-22 round-2 review): a mail id that PASSED `assertId` is recorded in
    // FULL. `safeLabel`'s 80-character bound used to apply to every id, so a valid but
    // long `event_id` (the loader's synthetic ids can run well past that) landed
    // truncated in the receipt while the CSV kept the whole thing -- and the receipt
    // could then no longer be matched to the row it is the evidence for, which is the
    // only job it has. "Full" is still bounded, by `assertId`'s own explicit ceiling
    // (`MAX_MAIL_ID_CHARS`), so an unbounded blob can never reach a receipt either way.
    //
    // N-1: the label-safe truncation stays for the REFUSAL paths, where the id (and
    // `level`, which has no validated form at all when the call failed) is raw,
    // never-validated argument text. One place, rather than at each call site.
    mail_id: isValidMailId(mailId) ? mailId : safeLabel(mailId),
    level: safeLabel(level),
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
  // N-1: `safeLabel` here is belt-and-braces -- `runCli` only ever passes a target
  // that `validateTarget` already accepted (closed vocabulary, control-character
  // checked), and passes `null` on every refusal.
  const text = String(safeLabel(target) ?? '').trim();
  if (text === '') return { target: null, kind: 'none', hash: null };
  if (level === 'include_with_review' || level === 'hold_owner_review') return { target: text, kind: 'project_code', hash: null };
  if (level === 'exclude') return { target: text, kind: 'exclude_category', hash: null };
  return { target: null, kind: 'vendor', hash: `sha256:${sha256Hex(text).slice(0, 16)}` };
}

// S-7 (2026-09-22 round-2 review): the probe file's name must be invisible to
// `countDecisionsToday`, which reads `bot_triage-*.json`. This prefix is dot-led (so
// it also sorts with the staging files `writeReceipt` uses) and the suffix is `.tmp`,
// so a leftover probe from a crashed run fails that filter twice over -- it is never
// parsed, never counted, and never an error.
const RECEIPT_PROBE_PREFIX = '.bot_triage_probe-';

/**
 * S-7: proves the receipts directory can actually be written to, BEFORE a row is
 * appended.
 *
 * S-1 made a failed receipt write a loud failure, but only after the fact: the daily
 * cap is ledgered nowhere except this directory, so a directory that stays unwritable
 * let every call append its row and record nothing, and the cap never advanced -- a
 * bot could work straight through a 3-decision budget and leave 3 rows and 0 receipts
 * behind. Refusing here makes the budget structural rather than best-effort: no
 * receipt, no row. The after-append path in `runCli` stays as the second line of
 * defence for whatever fails between this probe and the real write.
 *
 * Creates the directory if it is absent, exactly as the real receipt write would, so
 * a first-ever run is not refused for the directory simply not existing yet.
 */
export function assertReceiptsWritable(receiptsDir) {
  const probePath = path.join(receiptsDir, `${RECEIPT_PROBE_PREFIX}${randomUUID()}.tmp`);
  try {
    mkdirSync(receiptsDir, { recursive: true });
    writeFileSync(probePath, '');
  } catch { fail('workspace_ledgers_bot_triage_receipts_unwritable_before_append'); }
  // A probe that cannot be removed is not itself a reason to refuse -- the write
  // succeeded, which is the whole question, and the leftover matches no pattern any
  // reader in this file uses.
  try { rmSync(probePath, { force: true }); } catch { /* see above */ }
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
  // S-2 (2026-09-22 fresh review): a mail that already HAS a usable reading decision
  // (a `hold_owner_review` row, most often) stays in the 미분류 queue by design -- the
  // library only attributes on `include*`. It used to look identical to a never-read
  // mail, so a bot would decide it again and get an opaque library duplicate refusal.
  // Both states are now marked, and differently: `이미판정` is "a row exists, leave
  // it", `손질필요` is "a row exists and is broken, a person must fix it".
  if (item.already_decided_level) parts.push(`이미판정(${item.already_decided_level})`);
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

/**
 * S-5 (2026-09-22 fresh review), TOCTOU: `loadBotConfig` verifies the org config's
 * digest, and then `listUnclassified` re-READS that same file from disk for itself
 * (through `classifyAllCommonMail`'s own `readOrgConfig`). Between those two moments
 * the file can change, and the queue the bot then decides from -- which buckets,
 * which vendor table, which reading table -- would have been computed against a
 * version nobody pinned.
 *
 * Re-verified after every library call that reads it, fail-closed, mirroring what
 * `ops/daily_refresh.mjs` does after each of its own steps (its S1). Deliberately NOT
 * done by handing the parsed object down into the library: that would change
 * `classifyAllCommonMail`'s signature, which `refresh()`/`refreshCommon()` also reach,
 * and this wrapper must not alter what those two classify. Nothing here touches the
 * library, so base and head classify byte-identically.
 *
 * The code does not start with this file's `..._config` prefix on purpose -- it is an
 * exit 2 ("this run started, then something failed"), not an exit 4 ("refused before
 * start"), the same split `daily_refresh.mjs` draws for the same situation.
 */
function assertOrgConfigUnchanged(config) {
  let actual;
  try { actual = sha256Of(readFileSync(config.orgConfigPath)); }
  catch { fail('workspace_ledgers_bot_triage_org_config_unreadable_during_run'); }
  if (actual !== config.orgConfigSha256) fail('workspace_ledgers_bot_triage_org_config_changed_during_run');
}

function findQueueItem(queue, id) {
  const item = queue.items.find(entry => entry.mail_source_id === id);
  if (item) return item;
  if (queue.total > queue.items.length) fail('workspace_ledgers_bot_triage_id_not_in_queue_window', String(queue.items.length));
  return fail('workspace_ledgers_bot_triage_id_not_in_queue');
}

// ------------------------------------------------------------------ commands
function runList(config, { limit, now, deps = {} }) {
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) fail('workspace_ledgers_bot_triage_limit_invalid', String(limit));
  const effectiveLimit = Math.min(limit ?? config.listLimitCap, config.listLimitCap);
  const queue = (deps.readQueue ?? readQueue)(config);
  assertOrgConfigUnchanged(config);
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

function runShow(config, { id, maxChars, deps = {} }) {
  assertId(id);
  if (maxChars !== null && (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > MAX_SHOW_CHARS)) {
    fail('workspace_ledgers_bot_triage_max_chars_invalid', String(maxChars));
  }
  const bodyChars = maxChars ?? DEFAULT_SHOW_CHARS;
  const queue = (deps.readQueue ?? readQueue)(config, { bodyPreviewChars: bodyChars });
  assertOrgConfigUnchanged(config);
  const item = findQueueItem(queue, id);
  const recipients = item.to.length > 0 ? item.to.map(recipientLabel).join(', ') : '(없음)';
  const headerLines = [
    `${item.mail_source_id} · ${seoulDateOf(item.received_at)} · 대기줄 ${item.bucket}`,
    `보낸이: ${senderLabel(item.from)}`,
    `받는이: ${shorten(recipients, 120)}`,
    `제목: ${shorten(item.subject, 200)}`,
    attachmentsLabel(item.attachment_names),
    `후보 ${candidateCodes(item).length > 0 ? candidateCodes(item).join('/') : '없음'} · 거래처 ${item.vendors.length > 0 ? item.vendors.join('/') : '없음'}`
      + ` · 같은 대화 ${item.same_thread_routing.length > 0 ? item.same_thread_routing.join('/') : '없음'}`,
    ...(item.already_decided_level ? [`주의: 이미 판독줄이 있습니다(${item.already_decided_level}) — 다시 판정하지 말고 그대로 보고하십시오.`] : []),
    ...(item.already_decided_invalid ? [`주의: 이미 판독줄이 있으나 쓸 수 없는 상태다(${item.already_decided_invalid}) — 사람이 표를 고쳐야 한다.`] : []),
  ];
  // S-3 (2026-09-22 fresh review): the headers and the body no longer share one
  // budget. At the documented maximum (`--max-chars 6000`, the stdout cap itself) the
  // headers used to be rendered first and the body line dropped whole by
  // `boundedOutput`, so the one thing `show` exists to print never appeared. The
  // headers now render into a budget that RESERVES `MIN_BODY_BUDGET` for the body,
  // and the body is truncated (and says by how much) rather than dropped.
  const headerText = boundedOutput(headerLines, { budget: MAX_STDOUT_CHARS - MIN_BODY_BUDGET - BODY_LABEL_RESERVE, moreLabel: '줄이' });
  const bodyBudget = Math.max(MIN_BODY_BUDGET, MAX_STDOUT_CHARS - headerText.length - BODY_LABEL_RESERVE);
  const preview = maskAddresses(item.body_preview);
  const truncated = preview.length > bodyBudget;
  const body = preview === '' ? '(본문 없음)'
    : (truncated ? `${preview.slice(0, bodyBudget)}… (본문 ${preview.length}자 중 ${bodyBudget}자)` : preview);
  return {
    stdout: [headerText, `본문(최대 ${bodyChars}자):`, body].join('\n'),
    counts: {
      queue_total: queue.total,
      body_chars: preview === '' ? 0 : Math.min(preview.length, bodyBudget),
      body_truncated: truncated,
    },
  };
}

/**
 * S-6 (2026-09-22 round-2 review): an explicit, generous ceiling on a mail id, so
 * "record the id in full" (see `buildReceipt`) is still a bounded promise. Well above
 * anything `common_events.mjs`'s loader produces -- a real `event_id`, or the
 * content-derived synthetic id plus a collision suffix -- and far below "a model
 * pasted a document into `--id`".
 */
export const MAX_MAIL_ID_CHARS = 512;

/**
 * Whether `id` is exactly what `assertId` accepts. Exported and shared so the receipt
 * writer can tell a validated id (recorded whole) from raw argument text (truncated),
 * without re-stating the rule and letting the two drift apart.
 */
export function isValidMailId(id) {
  return typeof id === 'string' && id.trim() !== '' && !hasControlCharacters(id) && id.length <= MAX_MAIL_ID_CHARS;
}

/** R-1: `--id` reaches the reading-decision CSV's key column, a receipt and stdout. */
function assertId(id) {
  if (typeof id !== 'string' || id.trim() === '') fail('workspace_ledgers_bot_triage_id_required');
  if (hasControlCharacters(id)) fail('workspace_ledgers_bot_triage_id_control_characters');
  if (id.length > MAX_MAIL_ID_CHARS) fail('workspace_ledgers_bot_triage_id_too_long', String(MAX_MAIL_ID_CHARS));
  return id;
}

function validateWhy(why) {
  if (typeof why !== 'string' || why.trim() === '') fail('workspace_ledgers_bot_triage_why_required');
  // CR/LF keeps its own, more specific code -- "you wrote several lines" is a
  // different mistake from "you smuggled a control byte", and a model can act on the
  // first without being told about the second. Checked first for exactly that reason.
  if (/[\r\n]/u.test(why)) fail('workspace_ledgers_bot_triage_why_not_single_line');
  // R-1 (2026-09-22 fresh review): every OTHER C0/C1 control character -- NUL, TAB,
  // ESC, VT and the rest -- is refused too, never stripped.
  if (hasControlCharacters(why)) fail('workspace_ledgers_bot_triage_why_control_characters');
  if (why.length > MAX_WHY_CHARS) fail('workspace_ledgers_bot_triage_why_too_long', String(MAX_WHY_CHARS));
  return why.trim();
}

/** The target vocabulary each allowed level accepts -- a closed set in every case, never free text the model composes. */
function validateTarget(config, { level, target, item }) {
  // R-1: checked BEFORE the vocabulary checks, so the refusal names the real problem
  // even when the smuggled control byte would also have made the value unknown. The
  // closed vocabularies below cannot themselves contain one, but `vendor_only`'s
  // target is compared against Owner-typed vendor names and would otherwise be the
  // one value a model could feed a control byte into and have accepted.
  if (hasControlCharacters(target)) fail('workspace_ledgers_bot_triage_target_control_characters');
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

function runDecide(config, { id, level, target, why, now, deps = {} }) {
  assertId(id);
  if (level === 'include') fail('workspace_ledgers_bot_triage_level_include_refused');
  // N-1: `safeLabel` on the detail, so a control byte or a blob in `--level` cannot
  // reach stderr (or, via `buildReceipt`, a receipt) just because the call failed.
  if (!BOT_ALLOWED_LEVELS.includes(level)) fail('workspace_ledgers_bot_triage_level_not_allowed', safeLabel(level));
  const cleanWhy = validateWhy(why);
  const decisionsToday = countDecisionsToday(config.receiptsDir, now);
  if (decisionsToday >= config.dailyDecisionCap) {
    fail('workspace_ledgers_bot_triage_daily_cap_reached', `${decisionsToday}/${config.dailyDecisionCap}`);
  }
  const queue = (deps.readQueue ?? readQueue)(config);
  // S-5: fail closed BEFORE appending if the pinned org config moved under the
  // library's own re-read of it (see `assertOrgConfigUnchanged`).
  assertOrgConfigUnchanged(config);
  const item = findQueueItem(queue, id);
  if (item.already_decided_invalid) {
    fail('workspace_ledgers_bot_triage_mail_already_decided_invalid', item.already_decided_invalid);
  }
  // S-2: a mail that already carries a usable decision (typically `hold_owner_review`,
  // which legitimately leaves it in the queue) is refused HERE, with a code that says
  // what is already there -- rather than reaching the library and coming back as the
  // bare `workspace_ledgers_triage_decision_duplicate` a bot cannot act on.
  if (item.already_decided_level) {
    fail('workspace_ledgers_bot_triage_mail_already_decided', item.already_decided_level);
  }
  const cleanTarget = validateTarget(config, { level, target, item });
  // S-7: the last gate before the append -- after every validation and after the
  // org-config re-verify, so a run that is about to be refused for any other reason
  // never leaves a probe file behind. No receipt, no row.
  (deps.assertReceiptsWritable ?? assertReceiptsWritable)(config.receiptsDir);

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

/**
 * `deps` (optional, tests only) injects the two steps a test cannot otherwise reach
 * from outside the process -- the receipt write (S-1: proving what happens when it
 * fails AFTER a row was appended) and the queue read (S-5: proving the org-config
 * re-check fires when the file moves mid-run). Same shape `ops/daily_refresh.mjs`'s
 * own `runDailyRefresh({...}, deps)` uses, and for the same reason its CHANGELOG
 * gives: reproducing these by real timing would be a race, while a stub that rewrites
 * the file inside the step is deterministic. Nothing production passes `deps`.
 */
export function runCli(argv, { now = new Date().toISOString(), stdout = console.log, stderr = console.error, deps = {} } = {}) {
  const [command, ...rest] = argv;
  if (command === 'correct') {
    // Deliberately absent, and said so rather than reported as "unknown": a
    // correction is the Owner's, and the bot's job is to hand back the line a person
    // should apply (see ops/bot-skill/SKILL.md), not to rewrite the table.
    stderr('workspace_ledgers_bot_triage_correct_not_supported: 판독줄 정정은 사람만 합니다 — 적용할 명령 한 줄을 Owner에게 답으로 드리고 아무것도 쓰지 마십시오.');
    return 2;
  }
  if (!Object.hasOwn(COMMAND_RUNNERS, String(command))) {
    // N-2: the offending token is argument text -- it can be a host path, and it has
    // never been validated. Redacted and label-safed like every other detail.
    stderr(`workspace_ledgers_bot_triage_unknown_command: ${safeDetail(command)} (list | show | decide)`);
    return 2;
  }

  let flags;
  try { flags = parseStrictArgs(command, rest); }
  // N-2: `unknown_flag`/`unexpected_argument`/`flag_value_required` all carry a raw
  // argument token as their detail, and this branch used to print it unredacted.
  // (N-5, round-2 review: the config branch just below was the actual last one --
  // this comment used to claim otherwise.) Every stderr path in this file now goes
  // through `safeDetail`.
  catch (error) { stderr(`${error.code}${error.detail ? `: ${safeDetail(error.detail)}` : ''}`); return 2; }

  let config;
  try { config = loadBotConfig({ configPath: flags.get('config') ?? null, configSha256: flags.get('config-sha256') ?? null }); }
  catch (error) {
    // Exit 4 and nothing written -- including no receipt, because the receipts
    // directory is itself one of the config facts that just failed to verify.
    // N-5: the detail here is a basename or a config KEY NAME, but it is derived from
    // caller-supplied text either way (`path.basename` of an argument path), so it
    // gets the same treatment as every other printed detail rather than a special case.
    stderr(`${error.code ?? 'workspace_ledgers_bot_triage_config_invalid'}${error.detail ? `: ${safeDetail(error.detail)}` : ''}`);
    return exitCodeFor(error.code ?? 'workspace_ledgers_bot_triage_config_invalid');
  }

  let outcome = null;
  let failure = null;
  try {
    outcome = COMMAND_RUNNERS[command](config, {
      now,
      deps,
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
  // S-1 (2026-09-22 fresh review): a receipt that could not be written is NOT a
  // warning. The daily cap is counted from these receipts, so an unwritten one is a
  // decision this wrapper will never see again -- the budget silently regrows. Worse,
  // for a successful `decide` the row is ALREADY in the Owner's table at this point:
  // returning 0 there would tell the bot "recorded, and everything is fine" about a
  // decision that has no trace in the receipts directory at all. Both cases are now a
  // hard non-zero, and the post-append case gets its own code plus a line stating
  // plainly that the table DID change, so nobody retries the same mail.
  let receiptFailure = null;
  try { (deps.writeReceipt ?? writeReceipt)(config.receiptsDir, receipt); }
  catch (error) { receiptFailure = error; }

  if (failure) {
    stderr(`${failure.code ?? 'workspace_ledgers_bot_triage_failed'}${failure.detail ? `: ${safeDetail(failure.detail)}` : ''}`);
    if (receiptFailure) {
      stderr(`workspace_ledgers_bot_triage_receipt_write_failed: ${redactHostPaths(String(receiptFailure?.message ?? receiptFailure))}`);
    }
    return exitCodeFor(failure.code);
  }
  if (receiptFailure) {
    const appended = command === 'decide';
    const code = appended
      ? 'workspace_ledgers_bot_triage_receipt_write_failed_after_append'
      : 'workspace_ledgers_bot_triage_receipt_write_failed';
    stderr(`${code}: ${redactHostPaths(String(receiptFailure?.message ?? receiptFailure))}`);
    if (appended) {
      stderr('-- 판독표에는 줄이 이미 추가되었습니다. 같은 메일을 다시 판정하지 마시고 Owner에게 그대로 알리십시오.');
    }
    return 2;
  }
  stdout(outcome.stdout);
  return 0;
}

/** One place for "this string came from an argument or an error and is about to be printed": host paths redacted, control characters stripped, bounded. */
function safeDetail(value) {
  return redactHostPaths(safeLabel(value, MAX_WHY_CHARS) ?? '');
}

/** `integerFlag` for a flag the current command may not even declare -- absent is always `null`, never a parse failure. */
function integerFlagSafe(flags, name) {
  return flags.has(name) ? integerFlag(flags, name) : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(process.argv.slice(2));
}

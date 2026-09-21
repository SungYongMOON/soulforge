// Refresh pass: rebuilds a project's four management CSVs from mail custody, and a
// read-only preview of a draft rule's effect on matching. Both read
// `020_MGMT/021_자동화설정_운영규칙/mail_routing_rule.json` for every onboarded project
// (via `rule_store.mjs`) so held/yield decisions consider the whole rule set, not just
// the projects a caller selected to refresh.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compileRules, MATCH_FIELDS } from './classifier.mjs';
import { listProjects, readRule, validateRule, LINEAGE_SCHEMA } from './rule_store.mjs';
import { loadMailEvents } from './mail_events.mjs';
import { buildContacts, buildHistory, buildReplyStatus, decodeCsv, domainOf, encodeCsv, LEDGER_SCHEMA, makeOrgLookup } from './ledgers.mjs';

export const REFRESH_RECEIPT_SCHEMA = 'soulforge.workspace_ledgers_refresh_receipt.v1';
export const REFRESH_STALE_LOCK_MS = 30 * 60 * 1000;
const LOCK_FILE_NAME = 'refresh.lock';

const CONTACTS_REL = '020_MGMT/023_연락처_이해관계자/연락처_장부.csv';
const RECV_REL = '020_MGMT/027_수신이력_이동이력/메일_수신이력.csv';
const SENT_REL = '020_MGMT/027_수신이력_이동이력/메일_발송이력.csv';
const REPLY_REL = '020_MGMT/027_수신이력_이동이력/회신_현황.csv';

// Owner-entered columns preserved by key across a refresh (Owner 2026-09-21 refresh contract).
const CONTACTS_KEY_INDEX = 5; // 메일
const CONTACTS_PRESERVE_INDICES = [12]; // 과제내역할(Owner기입) -- 비고(14) is machine-derived, not Owner-entered, and is not preserved
const HISTORY_KEY_INDEX = 0; // 이력키
const HISTORY_PRESERVE_INDICES = [4, 17]; // 단계, 작업상태
const REPLY_KEY_INDEX = 9; // 스레드
const REPLY_PRESERVE_INDICES = [10, 11]; // 처리상태(Owner기입), 메모

export class RefreshError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'RefreshError';
    this.code = code;
  }
}
const fail = (code, detail) => { throw new RefreshError(code, detail); };

const sha256 = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const encodeJson = value => `${JSON.stringify(value, null, 2)}\n`;

function atomicWriteText(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const staging = `${filePath}.writing-${process.pid}-${Date.now()}`;
  writeFileSync(staging, text);
  renameSync(staging, filePath);
}

// -------------------------------------------------------------------------- lock
export function acquireRefreshLock(receiptsDir, now) {
  mkdirSync(receiptsDir, { recursive: true });
  const lockFile = path.join(receiptsDir, LOCK_FILE_NAME);
  if (existsSync(lockFile)) {
    let existing;
    try { existing = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { existing = {}; }
    const startedAt = typeof existing?.started_at === 'string' ? Date.parse(existing.started_at) : NaN;
    const ageMs = Number.isFinite(startedAt) ? Math.max(0, Date.parse(now) - startedAt) : Number.POSITIVE_INFINITY;
    if (ageMs <= REFRESH_STALE_LOCK_MS) return { held: true, age_ms: ageMs };
    try { rmSync(lockFile, { force: true }); } catch (error) { fail('workspace_ledgers_refresh_lock_unavailable', error?.code); }
    try { writeFileSync(lockFile, encodeJson({ pid: process.pid, started_at: now, reclaimed_from: existing }), { flag: 'wx' }); }
    catch (error) { if (error?.code === 'EEXIST') return { held: true, age_ms: ageMs }; fail('workspace_ledgers_refresh_lock_unavailable', error?.code); }
    return { held: false, reclaimed: true, age_ms: ageMs };
  }
  try { writeFileSync(lockFile, encodeJson({ pid: process.pid, started_at: now }), { flag: 'wx' }); }
  catch (error) { if (error?.code === 'EEXIST') return { held: true, age_ms: 0 }; fail('workspace_ledgers_refresh_lock_unavailable', error?.code); }
  return { held: false, reclaimed: false, age_ms: null };
}
export function releaseRefreshLock(receiptsDir) {
  try { rmSync(path.join(receiptsDir, LOCK_FILE_NAME), { force: true }); } catch { /* nothing to release */ }
}

// ------------------------------------------------------------------ shared reading
function readOrgConfig(orgConfigPath) {
  let text;
  try { text = readFileSync(orgConfigPath, 'utf8'); }
  catch (error) { fail('workspace_ledgers_org_config_unreadable', error?.code ?? orgConfigPath); }
  try { return JSON.parse(text); }
  catch (error) { fail('workspace_ledgers_org_config_invalid_json', error.message); }
  return null;
}

function readAllRuleJson(workspacesRoot) {
  const projects = listProjects({ workspacesRoot });
  return projects.map(project => ({ project, json: readRule({ workspacesRoot, code: project.project_code }).json }));
}

function classifyCustody({ hiworksDirs, gmailSentDirs, compiledRules, fields }) {
  const hiworks = loadMailEvents({ dirs: hiworksDirs, source: '하이웍스_수집', compiledRules, fields });
  const gmail = loadMailEvents({ dirs: gmailSentDirs, source: 'Gmail_보낸메일_수집', compiledRules, fields });
  return { events: [...hiworks.events, ...gmail.events], hiworks, gmail };
}

// ---------------------------------------------------------- S10: custody read cache
// `previewRule` is called interactively (a console iterating on one draft rule) and
// classifies the *same* custody window twice per call (once for the saved rules,
// once with the draft substituted); repeated calls in a short span very often share
// the "before" ruleset (and sometimes the exact same draft) entirely unchanged. This
// cache keys on the actual rule JSON compared plus a cheap directory signature (file
// names + size + mtime, not content), so a change to either invalidates the entry
// immediately -- it never serves custody or rule state that could have changed.
// `refresh()` (which writes real files) intentionally never reads through this cache.
export const CUSTODY_CACHE_TTL_MS = 60 * 1000;
const CUSTODY_CACHE_MAX_ENTRIES = 20;
const custodyCache = new Map();

/** Test/host seam: drops every cached entry, so a test never observes another test's cached read. */
export function clearCustodyCache() { custodyCache.clear(); }

function dirSignature(dir) {
  let names;
  try { names = readdirSync(dir).filter(name => name.endsWith('.jsonl')).sort(); }
  catch { return `${dir}::absent`; }
  const parts = names.map(name => {
    try { const stat = statSync(path.join(dir, name)); return `${name}:${stat.size}:${stat.mtimeMs}`; }
    catch { return `${name}:unreadable`; }
  });
  return `${dir}::${parts.join(',')}`;
}
function dirsSignature(dirs) { return dirs.map(dirSignature).join('|'); }

function cachedClassifyCustody({ hiworksDirs, gmailSentDirs, compiledRules, fields, ruleJsonList, now = Date.now() }) {
  const key = JSON.stringify({
    rules: ruleJsonList, fields, hiworks: dirsSignature(hiworksDirs), gmail: dirsSignature(gmailSentDirs),
  });
  const cached = custodyCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  const value = classifyCustody({ hiworksDirs, gmailSentDirs, compiledRules, fields });
  custodyCache.set(key, { value, expiresAt: now + CUSTODY_CACHE_TTL_MS });
  if (custodyCache.size > CUSTODY_CACHE_MAX_ENTRIES) custodyCache.delete(custodyCache.keys().next().value);
  return value;
}

// ----------------------------------------------------------------- preview-rule
/**
 * Read-only comparison of one project's saved rule against a draft, over the full
 * custody window. Classification always considers every onboarded project's rule (so
 * held/yield behaviour is accurate), but only `code`'s hit/miss transitions are
 * reported. Never writes.
 */
export function previewRule({ workspacesRoot, code, draft, hiworksDirs = [], gmailSentDirs = [], fields = MATCH_FIELDS }) {
  const all = readAllRuleJson(workspacesRoot);
  const target = all.find(row => row.project.project_code === code);
  const folderName = target ? target.project.folder_name : draft.folder_name ?? null;
  const nextDraft = { ...draft, project_code: code, folder_name: folderName };
  const validation = validateRule(nextDraft, { folderName });
  if (!validation.valid) fail('workspace_ledgers_rule_invalid', validation.errors.join(','));

  const beforeJson = all.map(row => row.json);
  const afterJson = target ? beforeJson.map(row => (row.project_code === code ? nextDraft : row)) : [...beforeJson, nextDraft];
  const compiledBefore = compileRules(beforeJson);
  const compiledAfter = compileRules(afterJson);

  const before = cachedClassifyCustody({ hiworksDirs, gmailSentDirs, compiledRules: compiledBefore, fields, ruleJsonList: beforeJson });
  const after = cachedClassifyCustody({ hiworksDirs, gmailSentDirs, compiledRules: compiledAfter, fields, ruleJsonList: afterJson });
  const keyOf = (event, index) => (event.event_id ? `id:${event.event_id}` : `idx:${index}:${event.subject}`);
  const beforeByKey = new Map(before.events.map((event, index) => [keyOf(event, index), event]));
  const afterByKey = new Map(after.events.map((event, index) => [keyOf(event, index), event]));

  const sample = event => ({ at: event.at, subject: event.subject.length > 80 ? event.subject.slice(0, 80) : event.subject });
  let matchedBefore = 0, matchedAfter = 0;
  const movedIn = [], movedOut = [], newlyHeld = [];
  for (const [key, beforeEvent] of beforeByKey) {
    const afterEvent = afterByKey.get(key) ?? beforeEvent;
    const beforeHit = beforeEvent.match.hits.some(hit => hit.project_code === code);
    const afterHit = afterEvent.match.hits.some(hit => hit.project_code === code);
    if (beforeHit) matchedBefore += 1;
    if (afterHit) matchedAfter += 1;
    if (afterHit && !beforeHit) movedIn.push(sample(afterEvent));
    if (beforeHit && !afterHit) movedOut.push(sample(beforeEvent));
    if (afterHit && afterEvent.match.held && !(beforeHit && beforeEvent.match.held)) newlyHeld.push(sample(afterEvent));
  }
  return {
    matched_before: matchedBefore, matched_after: matchedAfter,
    moved_in: movedIn.length, moved_out: movedOut.length, newly_held: newlyHeld.length,
    samples: { moved_in: movedIn.slice(0, 10), moved_out: movedOut.slice(0, 10), newly_held: newlyHeld.slice(0, 10) },
  };
}

// -------------------------------------------------------------------- CSV write
const REPLACEMENT_CHARACTER = '�';

/**
 * R4: strictly validates an existing ledger CSV before any merge is attempted, so a
 * corrupted or hand-broken file is never merged into and never silently overwritten.
 * Returns `{ present: false }` when there is nothing to validate yet (first refresh),
 * `{ present: true, ok: false, code }` on any violation, or `{ present: true, ok:
 * true, decoded, rawText }` when the file is safe to merge against. Checked, in order:
 * encoding (no U+FFFD anywhere -- a common CP949/EUC-KR-as-UTF-8 mojibake signature),
 * the header row equals the builder's own headers exactly, every row has exactly the
 * header's column count, and no two rows share the same key.
 */
function validateExistingCsv({ existingPath, headers, keyIndex }) {
  if (!existsSync(existingPath)) return { present: false };
  const rawText = readFileSync(existingPath, 'utf8');
  if (rawText.includes(REPLACEMENT_CHARACTER)) return { present: true, ok: false, code: 'workspace_ledgers_ledger_encoding' };
  const decoded = decodeCsv(rawText);
  if (JSON.stringify(decoded.headers) !== JSON.stringify(headers)) {
    return { present: true, ok: false, code: 'workspace_ledgers_ledger_header_mismatch' };
  }
  if (decoded.rows.some(row => row.length !== headers.length)) {
    return { present: true, ok: false, code: 'workspace_ledgers_ledger_row_shape' };
  }
  const seenKeys = new Set();
  for (const row of decoded.rows) {
    const key = row[keyIndex];
    if (seenKeys.has(key)) return { present: true, ok: false, code: 'workspace_ledgers_ledger_duplicate_key' };
    seenKeys.add(key);
  }
  return { present: true, ok: true, decoded, rawText };
}

function preserveMerge({ existingPath, headers, rows, keyIndex, preserveIndices }) {
  const validated = validateExistingCsv({ existingPath, headers, keyIndex });
  if (!validated.present) return { invalid: null, rows, preservedCount: 0, ownerCellsDroppedWithRow: 0, beforeRowCount: 0, oldText: null };
  if (!validated.ok) return { invalid: { code: validated.code }, rows: null, preservedCount: 0, ownerCellsDroppedWithRow: 0, beforeRowCount: 0, oldText: null };
  const { decoded, rawText } = validated;
  const byKey = new Map();
  for (const oldRow of decoded.rows) byKey.set(oldRow[keyIndex], oldRow);
  const newKeys = new Set(rows.map(row => row[keyIndex]));
  // S9: a key present before but not in this refresh's fresh rows means that mail/
  // person/thread left the live view (e.g. re-attributed elsewhere); any Owner-entered
  // value on that row is not carried forward -- it survives only in the history
  // archive this refresh is about to write, and this count says how many rows that
  // happened to (never which rows, to avoid surfacing subjects/names in the receipt).
  let ownerCellsDroppedWithRow = 0;
  for (const oldRow of decoded.rows) {
    if (newKeys.has(oldRow[keyIndex])) continue;
    if (preserveIndices.some(index => oldRow[index] !== undefined && oldRow[index] !== '')) ownerCellsDroppedWithRow += 1;
  }
  let preservedCount = 0;
  const merged = rows.map(newRow => {
    const oldRow = byKey.get(newRow[keyIndex]);
    if (!oldRow) return newRow;
    const out = [...newRow];
    for (const index of preserveIndices) {
      const oldValue = oldRow[index];
      if (oldValue !== undefined && oldValue !== '') { out[index] = oldValue; preservedCount += 1; }
    }
    return out;
  });
  return { invalid: null, rows: merged, preservedCount, ownerCellsDroppedWithRow, beforeRowCount: decoded.rows.length, oldText: rawText };
}

/**
 * S13: archives `bytes` under `<historyDir>/<baseName>.<stamp>.csv`, create-only like
 * `rule_store.mjs`'s history archive. If that exact name is already taken (two
 * refreshes sharing the same `now` stamp, e.g. two calls in the same process tick),
 * a numeric counter suffix is appended until a free name is found, rather than
 * overwriting the earlier archive.
 */
function archiveHistoryCreateOnly({ historyDir, baseName, stamp, bytes }) {
  mkdirSync(historyDir, { recursive: true });
  for (let counter = 0; counter <= 1000; counter += 1) {
    const suffix = counter === 0 ? '' : `-${counter}`;
    const candidate = path.join(historyDir, `${baseName}.${stamp}${suffix}.csv`);
    try { writeFileSync(candidate, bytes, { flag: 'wx' }); return candidate; }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
  }
  fail('workspace_ledgers_history_archive_exhausted', `${historyDir}/${baseName}.${stamp}`);
  return null;
}

function writeLedgerCsv({ filePath, lineagePath, headers, rows, keyIndex, preserveIndices, code, folder, relPath, now, dry }) {
  const merge = preserveMerge({ existingPath: filePath, headers, rows, keyIndex, preserveIndices });
  if (merge.invalid) {
    // R4: fail closed for this one file -- do not write, do not archive, do not touch
    // lineage. The file is left exactly as it was found.
    return { failed: true, code: merge.invalid.code, file: `${folder}/${relPath}`, written: false, changed: false };
  }
  const newText = encodeCsv(headers, merge.rows);
  const changed = merge.oldText !== newText;
  const result = { failed: false, rows: merge.rows.length, before_rows: merge.beforeRowCount,
    preserved_owner_cells: merge.preservedCount, owner_cells_dropped_with_row: merge.ownerCellsDroppedWithRow,
    changed, sha256: sha256(newText) };
  if (dry || !changed) return { ...result, written: false };
  if (merge.oldText !== null) {
    const stamp = now.replace(/[:.]/gu, '-');
    archiveHistoryCreateOnly({ historyDir: path.join(path.dirname(filePath), 'history'), baseName: path.basename(filePath), stamp, bytes: merge.oldText });
  }
  atomicWriteText(filePath, newText);
  const lineage = {
    schema_version: LINEAGE_SCHEMA, project_code: code, object: `_workspaces/${folder}/${relPath}`, folder_name: folder,
    format: 'csv utf-8 bom crlf', ledger_schema: LEDGER_SCHEMA, sha256: result.sha256, bytes: Buffer.byteLength(newText),
    rows: merge.rows.length, previous_sha256: merge.oldText ? sha256(merge.oldText) : null,
    status: 'refreshed_from_custody', written_at: now,
  };
  atomicWriteText(lineagePath, encodeJson(lineage));
  return { ...result, written: true };
}

// ------------------------------------------------------------------------ refresh
/**
 * Rewrites every selected project's four management CSVs from custody, preserving
 * Owner-entered columns by key. `projects` (array of codes) restricts which projects
 * are *written*; classification always considers every onboarded project's rule.
 * Returns the receipt body (also written to `receiptsDir` unless the caller wants it
 * suppressed -- this function always writes the receipt, dry or not, so a `--dry`
 * pass leaves an audit trail of what it previewed).
 *
 * R4: a single ledger file that fails strict validation (see `validateExistingCsv`)
 * is skipped -- left untouched, recorded in `receipt.ledger_failures` -- while every
 * other file for every other project still refreshes normally. `receipt.status` is
 * `'failed'` whenever `ledger_failures` is non-empty; this function still returns the
 * receipt rather than throwing, so a caller sees exactly what succeeded and what did
 * not. The CLI (`cli.mjs`) maps `status: 'failed'` to exit code 2.
 */
export function refresh({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs, orgConfigPath, projects: onlyProjects = null,
  fields = MATCH_FIELDS, dry = false, receiptsDir, now = new Date().toISOString() }) {
  if (!Array.isArray(hiworksDirs) || !Array.isArray(gmailSentDirs)) fail('workspace_ledgers_refresh_dirs_required');
  if (typeof orgConfigPath !== 'string' || orgConfigPath.trim() === '') fail('workspace_ledgers_org_config_required');
  if (typeof receiptsDir !== 'string' || receiptsDir.trim() === '') fail('workspace_ledgers_receipts_dir_required');
  const orgConfig = readOrgConfig(orgConfigPath);
  const { ourDomain } = makeOrgLookup(orgConfig);

  const lock = acquireRefreshLock(receiptsDir, now);
  if (lock.held) fail('workspace_ledgers_refresh_lock_held');
  try {
    const all = readAllRuleJson(workspacesRoot);
    if (all.length === 0) fail('workspace_ledgers_no_projects_found', workspacesRoot);
    const selectedCodes = Array.isArray(onlyProjects) && onlyProjects.length > 0 ? new Set(onlyProjects) : null;
    if (selectedCodes) {
      for (const code of selectedCodes) if (!all.some(row => row.project.project_code === code)) fail('workspace_ledgers_unknown_project', code);
    }
    const compiledRules = compileRules(all.map(row => row.json));
    const { events, hiworks, gmail } = classifyCustody({ hiworksDirs, gmailSentDirs, compiledRules, fields });

    const buckets = new Map();
    let heldCount = 0, unattributed = 0;
    for (const event of events) {
      if (event.match.held) { heldCount += 1; continue; }
      if (event.match.hits.length === 0) { unattributed += 1; continue; }
      const hit = event.match.hits[0];
      const direction = event.source === 'Gmail_보낸메일_수집' || (event.from && domainOf(event.from.email) === ourDomain) ? 'sent' : 'received';
      const bucket = buckets.get(hit.project_code) ?? [];
      bucket.push({ ...event, direction, label: hit.label });
      buckets.set(hit.project_code, bucket);
    }
    for (const bucket of buckets.values()) bucket.sort((a, b) => a.at.localeCompare(b.at));

    const presenceByEmail = new Map();
    for (const [code, mails] of buckets) {
      for (const mail of mails) {
        for (const person of [mail.from, ...mail.to, ...mail.cc].filter(Boolean)) {
          const set = presenceByEmail.get(person.email) ?? new Set();
          set.add(code);
          presenceByEmail.set(person.email, set);
        }
      }
    }

    const projectReports = [];
    const ledgerFailures = [];
    const recordResult = result => { if (result.failed) ledgerFailures.push({ file: result.file, code: result.code }); return result; };
    for (const { project, json } of all) {
      const code = project.project_code;
      if (selectedCodes && !selectedCodes.has(code)) continue;
      const mails = buckets.get(code) ?? [];
      const base = path.join(workspacesRoot, project.folder_name);
      const lineageBase = path.join(workmetaRoot, project.folder_name, 'lineage');

      const contacts = buildContacts({ code, mails, orgConfig, presenceByEmail });
      const history = buildHistory({ code, mails, orgConfig, ruleVersion: json.rule_version });
      const reply = buildReplyStatus({ code, mails, orgConfig, now });

      const contactsResult = recordResult(writeLedgerCsv({
        filePath: path.join(base, CONTACTS_REL), lineagePath: path.join(lineageBase, '연락처_장부.csv.lineage.json'),
        headers: contacts.headers, rows: contacts.rows, keyIndex: CONTACTS_KEY_INDEX, preserveIndices: CONTACTS_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: CONTACTS_REL, now, dry,
      }));
      const recvResult = recordResult(writeLedgerCsv({
        filePath: path.join(base, RECV_REL), lineagePath: path.join(lineageBase, '메일_수신이력.csv.lineage.json'),
        headers: history.headers, rows: history.received.rows, keyIndex: HISTORY_KEY_INDEX, preserveIndices: HISTORY_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: RECV_REL, now, dry,
      }));
      const sentResult = recordResult(writeLedgerCsv({
        filePath: path.join(base, SENT_REL), lineagePath: path.join(lineageBase, '메일_발송이력.csv.lineage.json'),
        headers: history.headers, rows: history.sent.rows, keyIndex: HISTORY_KEY_INDEX, preserveIndices: HISTORY_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: SENT_REL, now, dry,
      }));
      const replyResult = recordResult(writeLedgerCsv({
        filePath: path.join(base, REPLY_REL), lineagePath: path.join(lineageBase, '회신_현황.csv.lineage.json'),
        headers: reply.headers, rows: reply.rows, keyIndex: REPLY_KEY_INDEX, preserveIndices: REPLY_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: REPLY_REL, now, dry,
      }));

      projectReports.push({
        project_code: code, folder_name: project.folder_name, rule_version: json.rule_version,
        mails: mails.length, received: recvResult.failed ? null : recvResult.rows, sent: sentResult.failed ? null : sentResult.rows,
        people: contactsResult.failed ? null : contactsResult.rows,
        need_reply: reply.rows.filter(row => row[1] === '답필요').length, waiting_reply: reply.rows.filter(row => row[1] === '회신대기').length,
        contacts: contactsResult, received_history: recvResult, sent_history: sentResult, reply_status: replyResult,
      });
    }

    const receipt = {
      schema_version: REFRESH_RECEIPT_SCHEMA, generated_at: now, dry, fields, status: ledgerFailures.length > 0 ? 'failed' : 'ok',
      events_scanned: { hiworks: hiworks.scanned, gmail_sent: gmail.scanned },
      skipped_system: hiworks.skippedSystem + gmail.skippedSystem,
      unreadable_dirs: [...hiworks.unreadableDirs, ...gmail.unreadableDirs],
      held_two_projects: heldCount, unattributed, ledger_failures: ledgerFailures, projects: projectReports,
    };
    mkdirSync(receiptsDir, { recursive: true });
    const stamp = now.replace(/[:.]/gu, '-');
    atomicWriteText(path.join(receiptsDir, `refresh-${stamp}${dry ? '-dry' : ''}.json`), encodeJson(receipt));
    return receipt;
  } finally {
    releaseRefreshLock(receiptsDir);
  }
}

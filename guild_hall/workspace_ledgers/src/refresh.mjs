// Refresh pass: rebuilds a project's four management CSVs from mail custody, and a
// read-only preview of a draft rule's effect on matching. Both read
// `020_MGMT/021_자동화설정_운영규칙/mail_routing_rule.json` for every onboarded project
// (via `rule_store.mjs`) so held/yield decisions consider the whole rule set, not just
// the projects a caller selected to refresh.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

  const before = classifyCustody({ hiworksDirs, gmailSentDirs, compiledRules: compiledBefore, fields });
  const after = classifyCustody({ hiworksDirs, gmailSentDirs, compiledRules: compiledAfter, fields });
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
function preserveMerge({ existingPath, rows, keyIndex, preserveIndices }) {
  if (!existsSync(existingPath)) return { rows, preservedCount: 0, beforeRowCount: 0, oldText: null };
  const oldText = readFileSync(existingPath, 'utf8');
  const decoded = decodeCsv(oldText);
  const byKey = new Map();
  for (const oldRow of decoded.rows) if (oldRow[keyIndex] !== undefined) byKey.set(oldRow[keyIndex], oldRow);
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
  return { rows: merged, preservedCount, beforeRowCount: decoded.rows.length, oldText };
}

function writeLedgerCsv({ filePath, lineagePath, headers, rows, keyIndex, preserveIndices, code, folder, relPath, now, dry }) {
  const merge = preserveMerge({ existingPath: filePath, rows, keyIndex, preserveIndices });
  const newText = encodeCsv(headers, merge.rows);
  const changed = merge.oldText !== newText;
  const result = { rows: merge.rows.length, before_rows: merge.beforeRowCount, preserved_owner_cells: merge.preservedCount,
    changed, sha256: sha256(newText) };
  if (dry || !changed) return { ...result, written: false };
  if (merge.oldText !== null) {
    const historyDir = path.join(path.dirname(filePath), 'history');
    mkdirSync(historyDir, { recursive: true });
    const stamp = now.replace(/[:.]/gu, '-');
    writeFileSync(path.join(historyDir, `${path.basename(filePath)}.${stamp}.csv`), merge.oldText);
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
    for (const { project, json } of all) {
      const code = project.project_code;
      if (selectedCodes && !selectedCodes.has(code)) continue;
      const mails = buckets.get(code) ?? [];
      const base = path.join(workspacesRoot, project.folder_name);
      const lineageBase = path.join(workmetaRoot, project.folder_name, 'lineage');

      const contacts = buildContacts({ code, mails, orgConfig, presenceByEmail });
      const history = buildHistory({ code, mails, orgConfig, ruleVersion: json.rule_version });
      const reply = buildReplyStatus({ code, mails, orgConfig, now });

      const contactsResult = writeLedgerCsv({
        filePath: path.join(base, CONTACTS_REL), lineagePath: path.join(lineageBase, '연락처_장부.csv.lineage.json'),
        headers: contacts.headers, rows: contacts.rows, keyIndex: CONTACTS_KEY_INDEX, preserveIndices: CONTACTS_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: CONTACTS_REL, now, dry,
      });
      const recvResult = writeLedgerCsv({
        filePath: path.join(base, RECV_REL), lineagePath: path.join(lineageBase, '메일_수신이력.csv.lineage.json'),
        headers: history.headers, rows: history.received.rows, keyIndex: HISTORY_KEY_INDEX, preserveIndices: HISTORY_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: RECV_REL, now, dry,
      });
      const sentResult = writeLedgerCsv({
        filePath: path.join(base, SENT_REL), lineagePath: path.join(lineageBase, '메일_발송이력.csv.lineage.json'),
        headers: history.headers, rows: history.sent.rows, keyIndex: HISTORY_KEY_INDEX, preserveIndices: HISTORY_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: SENT_REL, now, dry,
      });
      const replyResult = writeLedgerCsv({
        filePath: path.join(base, REPLY_REL), lineagePath: path.join(lineageBase, '회신_현황.csv.lineage.json'),
        headers: reply.headers, rows: reply.rows, keyIndex: REPLY_KEY_INDEX, preserveIndices: REPLY_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: REPLY_REL, now, dry,
      });

      projectReports.push({
        project_code: code, folder_name: project.folder_name, rule_version: json.rule_version,
        mails: mails.length, received: recvResult.rows, sent: sentResult.rows, people: contactsResult.rows,
        need_reply: reply.rows.filter(row => row[1] === '답필요').length, waiting_reply: reply.rows.filter(row => row[1] === '회신대기').length,
        contacts: contactsResult, received_history: recvResult, sent_history: sentResult, reply_status: replyResult,
      });
    }

    const receipt = {
      schema_version: REFRESH_RECEIPT_SCHEMA, generated_at: now, dry, fields,
      events_scanned: { hiworks: hiworks.scanned, gmail_sent: gmail.scanned },
      skipped_system: hiworks.skippedSystem + gmail.skippedSystem,
      unreadable_dirs: [...hiworks.unreadableDirs, ...gmail.unreadableDirs],
      held_two_projects: heldCount, unattributed, projects: projectReports,
    };
    mkdirSync(receiptsDir, { recursive: true });
    const stamp = now.replace(/[:.]/gu, '-');
    atomicWriteText(path.join(receiptsDir, `refresh-${stamp}${dry ? '-dry' : ''}.json`), encodeJson(receipt));
    return receipt;
  } finally {
    releaseRefreshLock(receiptsDir);
  }
}

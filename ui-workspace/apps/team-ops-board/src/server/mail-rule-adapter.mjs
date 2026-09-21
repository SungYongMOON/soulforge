// mail-rule-adapter.mjs — Team Ops Board read (and gated preview/save/refresh) projection for
// the per-project mail classification rule (2026-09-21 owner decision). The rule and its human
// twin live as files on the private D: workspace plane, one pair per project folder:
//   <workspacesRoot>/<CODE>_<짧은한글명>/020_MGMT/021_자동화설정_운영규칙/mail_routing_rule.json
//   <workspacesRoot>/<CODE>_<짧은한글명>/020_MGMT/021_자동화설정_운영규칙/mail_routing_rule.md
//
// GET /mail-rules.snapshot.json and GET /mail-rule.snapshot.json only ever read those two
// files directly (via the existing symlink/hardlink-safe, 256KB-capped `readStableFile`) —
// this adapter never writes a file itself for the read path, and this read path does not
// depend on the core module below being present.
//
// POST /mail-rule/preview, POST /mail-rule/save and POST /mail-rule/refresh validate the
// request fully and then delegate to an injectable `core` object — by default a loader for
// the sibling `guild_hall/workspace_ledgers` module (merged 2026-09-21) that reports
// `core_module_unavailable` if that module cannot be imported or does not export the expected
// functions. `save` and `refresh` both write (a new rule version, or the four management
// ledgers) and so both refuse with 403 `write_disabled` before any other work when
// `TEAM_OPS_MAIL_RULE_WRITE` is not the exact string '1'; `preview` never writes and has no
// such gate. All three also refuse with 503 `custody_unconfigured` when the mail-event
// directories (and, for save/refresh, the org config and receipts directory) are not set.

import { lstat, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readStableFile } from './receipt-expiry-adapter.mjs';
import { isDirectLoopbackRequest } from './loopback-request-guard.mjs';

export const MAIL_RULES_SNAPSHOT_PATH = '/mail-rules.snapshot.json';
export const MAIL_RULE_SNAPSHOT_PATH = '/mail-rule.snapshot.json';
export const MAIL_RULE_PREVIEW_PATH = '/mail-rule/preview';
export const MAIL_RULE_SAVE_PATH = '/mail-rule/save';
export const MAIL_RULE_REFRESH_PATH = '/mail-rule/refresh';

// Owner-approved default (2026-09-21): subject-only matching. The core module's builder
// measured that adding body/attachment matching raises overall matches by only ~5% but
// raises two-project conflicts (held, no auto-attribution) from 1 to 98 — not worth it.
const MATCH_FIELDS_SUBJECT_ONLY = ['subject'];

export const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const RULE_SCHEMA = 'soulforge.project_mail_routing_rule.v0';
const RULE_RELATIVE = ['020_MGMT', '021_자동화설정_운영규칙', 'mail_routing_rule.json'];
const RULE_MD_RELATIVE = ['020_MGMT', '021_자동화설정_운영규칙', 'mail_routing_rule.md'];

const MAX_FOLDER_SCAN = 500; // direct children of workspacesRoot examined per list/lookup
const MAX_LIST_RULE_READS = 200; // rule files actually opened while building the list snapshot
const MAX_TERM_ITEMS = 500; // defensive cap on a stored rule's exact/hint arrays
const MAX_TERM_VALUE_CHARS = 4096;
const MAX_MD_BULLET_CHARS = 300;
const MAX_MD_BULLETS = 30;
const MAX_YIELDS_TO_ENTRIES = 8; // a hand-over list this long already needs a conflict_policy rethink
const CACHE_TTL_MS = 60_000;

// Draft (POST body) limits, per the 2026-09-21 owner decision on what an Owner may author
// in the UI: literal terms only, bounded counts and lengths.
const MAX_DRAFT_TERMS = 60;
const MAX_LITERAL_CHARS = 80;
const MAX_REGEX_CHARS = 120;
const MAX_NOTE_CHARS = 500;
const MAX_BODY_BYTES = 64 * 1024;

const asNonEmptyString = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const safeFolderName = name => typeof name === 'string' && name.length > 0 && name.length <= 255
  && !/[\\/:\x00-\x1f\x7f]/u.test(name) && !/[. ]$/u.test(name);

// ---------- workspace folder resolution (never follows a path supplied by the caller) ----------

// realpath() always returns an OS-normalized, separator-consistent path; the configured root
// or a joined child path may not (forward slashes are a common way to spell an absolute
// Windows path in an env var). Comparing after path.resolve() — case-insensitively on win32,
// matching receipt-expiry-adapter's defaultPathsEqual — avoids rejecting a perfectly real
// directory over spelling instead of an actual symlink/reparse escape.
function pathsEqual(a, b) {
  const normA = path.resolve(a);
  const normB = path.resolve(b);
  return process.platform === 'win32' ? normA.toLowerCase() === normB.toLowerCase() : normA === normB;
}

async function admitRealDirectory(target) {
  const stat = await lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe_directory');
  let real;
  try { real = await realpath(target); } catch { throw new Error('unsafe_directory'); }
  if (!pathsEqual(real, target)) throw new Error('unsafe_directory');
  return stat;
}

// Direct children of workspacesRoot whose name starts with "<code>_". Zero, one, or more
// than one match are all valid outcomes the caller must handle explicitly.
export async function findProjectFolders(workspacesRoot, code) {
  await admitRealDirectory(workspacesRoot);
  const prefix = `${code}_`;
  const matches = [];
  let examined = 0;
  for await (const entry of await opendir(workspacesRoot)) {
    if (examined++ >= MAX_FOLDER_SCAN) break;
    if (!safeFolderName(entry.name) || !entry.name.startsWith(prefix)) continue;
    try { await admitRealDirectory(path.join(workspacesRoot, entry.name)); }
    catch { continue; }
    matches.push(entry.name);
  }
  return matches;
}

// ---------- rule.json shape validation ----------

function validateTermItem(item, maxValueChars) {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return false;
  if (!asNonEmptyString(item.label, 200)) return false;
  if (item.kind !== 'literal' && item.kind !== 'regex') return false;
  if (!asNonEmptyString(item.value, maxValueChars)) return false;
  if (item.flags !== undefined && typeof item.flags !== 'string') return false;
  return true;
}

function validateYieldsToEntry(entry) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (typeof entry.project_code !== 'string' || !PROJECT_CODE.test(entry.project_code)) return false;
  return validateTermItem(entry.when, MAX_TERM_VALUE_CHARS);
}

// `yields_to` changed shape after this panel's first slice: it is now an array of hand-over
// rules (empty when there are none), but older files on disk may still carry `null` (no
// hand-over) or a single bare object (exactly one hand-over). All three are accepted and
// normalized to an array here, so every caller downstream — the snapshot response, the panel,
// and the draft round-trip — only ever sees the array shape.
export function normalizeYieldsTo(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    if (value.length > MAX_YIELDS_TO_ENTRIES || !value.every(validateYieldsToEntry)) throw new Error('rule_shape_invalid');
    return value;
  }
  if (typeof value === 'object') {
    if (!validateYieldsToEntry(value)) throw new Error('rule_shape_invalid');
    return [value];
  }
  throw new Error('rule_shape_invalid');
}

export function validateRuleDocument(doc, expectedCode) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('rule_shape_invalid');
  if (doc.schema_version !== RULE_SCHEMA) throw new Error('rule_schema_mismatch');
  if (typeof doc.project_code !== 'string' || !PROJECT_CODE.test(doc.project_code) || doc.project_code !== expectedCode) {
    throw new Error('rule_project_mismatch');
  }
  if (!asNonEmptyString(doc.folder_name, 255)) throw new Error('rule_shape_invalid');
  if (typeof doc.rule_version !== 'string' && typeof doc.rule_version !== 'number') throw new Error('rule_shape_invalid');
  if (!asNonEmptyString(doc.status, 64)) throw new Error('rule_shape_invalid');
  if (!Array.isArray(doc.exact) || doc.exact.length > MAX_TERM_ITEMS || !doc.exact.every(item => validateTermItem(item, MAX_TERM_VALUE_CHARS))) {
    throw new Error('rule_shape_invalid');
  }
  if (!Array.isArray(doc.hint) || doc.hint.length > MAX_TERM_ITEMS || !doc.hint.every(item => validateTermItem(item, MAX_TERM_VALUE_CHARS))) {
    throw new Error('rule_shape_invalid');
  }
  const yieldsTo = normalizeYieldsTo(doc.yields_to);
  if (doc.conflict_policy !== undefined && typeof doc.conflict_policy !== 'string') throw new Error('rule_shape_invalid');
  return { ...doc, yields_to: yieldsTo };
}

// ---------- mail_routing_rule.md twin: two fixed bullet-list sections ----------

export function parseBulletSection(markdown, headingPrefix) {
  const items = [];
  let capture = false;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = rawLine.match(/^##\s+(.*)$/u);
    if (heading) { capture = heading[1].startsWith(headingPrefix); continue; }
    if (!capture) continue;
    const bullet = rawLine.match(/^\s*[-*]\s+(.*)$/u);
    if (!bullet) continue;
    const text = bullet[1].trim();
    if (!text || text.length > MAX_MD_BULLET_CHARS) continue; // dropped, not truncated
    if (items.length >= MAX_MD_BULLETS) continue;
    items.push(text);
  }
  return items;
}

// ---------- draft (POST body) validation ----------

export function validateDraft(draft) {
  if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) throw new Error('draft_invalid');
  for (const group of ['exact', 'hint']) {
    const list = draft[group];
    if (!Array.isArray(list) || list.length > MAX_DRAFT_TERMS) throw new Error('draft_invalid');
    const labels = new Set();
    for (const item of list) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) throw new Error('draft_invalid');
      if (!asNonEmptyString(item.label, 200) || labels.has(item.label)) throw new Error('draft_invalid');
      labels.add(item.label);
      if (item.kind === 'literal') {
        if (!asNonEmptyString(item.value, MAX_LITERAL_CHARS)) throw new Error('draft_invalid');
      } else if (item.kind === 'regex') {
        if (!asNonEmptyString(item.value, MAX_REGEX_CHARS)) throw new Error('draft_invalid');
        try { new RegExp(item.value, typeof item.flags === 'string' ? item.flags : undefined); }
        catch { throw new Error('draft_invalid'); }
      } else throw new Error('draft_invalid');
    }
  }
  if (draft.note !== undefined && !(typeof draft.note === 'string' && draft.note.length <= MAX_NOTE_CHARS)) throw new Error('draft_invalid');
  // yields_to is not editable in this slice: the panel round-trips whatever shape the rule
  // already carried. Validate it (same null/object/array shapes as a stored rule, same term
  // limits) but leave the value itself untouched — normalizing it is the reader's job, not
  // the draft's, since a draft with no yields_to key at all is also valid (nothing to carry).
  if (draft.yields_to !== undefined) {
    try { normalizeYieldsTo(draft.yields_to); } catch { throw new Error('draft_invalid'); }
  }
  return draft;
}

async function readJsonBody(req, maxBytes) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) { const error = new Error('body_too_large'); error.code = 'body_too_large'; throw error; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { const error = new Error('body_invalid_json'); error.code = 'body_invalid_json'; throw error; }
}

// ---------- default core loader ----------

// `guild_hall/workspace_ledgers/src/index.mjs` merged to main 2026-09-21 as b453abef
// (eight fresh-review rounds after the earlier pre-merge commit this adapter was first
// wired against) exporting exactly these three names among others; see that module's
// README for full option semantics.
const CORE_MODULE_SPECIFIER = '../../../../../guild_hall/workspace_ledgers/src/index.mjs';
const CORE_EXPORTS = ['previewRule', 'saveRuleVersion', 'refresh'];

export function createDefaultMailRuleCore({ importModule = specifier => import(specifier) } = {}) {
  let modulePromise;
  function loadModule() {
    if (!modulePromise) {
      modulePromise = Promise.resolve()
        .then(() => importModule(CORE_MODULE_SPECIFIER))
        .then(mod => (mod && CORE_EXPORTS.every(name => typeof mod[name] === 'function')) ? mod : null)
        .catch(() => null);
    }
    return modulePromise;
  }
  async function call(name, args) {
    const mod = await loadModule();
    if (!mod) { const error = new Error('core_module_unavailable'); error.code = 'core_module_unavailable'; throw error; }
    return mod[name](args);
  }
  return {
    previewRule: args => call('previewRule', args),
    saveRuleVersion: args => call('saveRuleVersion', args),
    refresh: args => call('refresh', args),
  };
}

// A refresh receipt's per-project ledger results (`contacts`, `received_history`,
// `sent_history`, `reply_status`) each carry a `written` boolean (true only when the CSV's
// content actually changed). Used to report `changed_files` after a save/refresh.
function summarizeRefreshReceipt(receipt) {
  const projects = receipt.projects.map(p => p.project_code);
  const changed_files = receipt.projects.reduce((sum, p) =>
    sum + [p.contacts, p.received_history, p.sent_history, p.reply_status].filter(r => r?.written).length, 0);
  return { projects, changed_files };
}

// ---------- reader ----------

export function createMailRuleReader({ workspacesRoot, workmetaRoot, writeEnabled = false, core, now = Date.now,
  hiworksEventsDir, gmailSentEventsDir, ledgerOrgConfigPath, ledgerReceiptsDir } = {}) {
  const cache = new Map();
  const pending = new Map();
  const resolvedCore = core ?? createDefaultMailRuleCore();
  // `loadMailEvents`/`refresh` take an array of directories per source; this adapter's
  // config exposes one directory each, so the arrays are always zero-or-one long.
  const hiworksDirs = hiworksEventsDir ? [hiworksEventsDir] : [];
  const gmailSentDirs = gmailSentEventsDir ? [gmailSentEventsDir] : [];
  // previewRule only needs the two custody directories; save/refresh additionally need the
  // org config and a receipts directory (refresh() itself requires both and fails closed).
  const previewCustodyReady = hiworksDirs.length > 0 && gmailSentDirs.length > 0;
  const fullCustodyReady = previewCustodyReady && Boolean(ledgerOrgConfigPath) && Boolean(ledgerReceiptsDir);

  async function cached(key, build) {
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_TTL_MS) return hit.value;
    if (pending.has(key)) return pending.get(key);
    const operation = build().then(value => { cache.set(key, { at: now(), value }); return value; });
    pending.set(key, operation);
    try { return await operation; } finally { pending.delete(key); }
  }

  async function readRuleFile(folderPath, code) {
    // readStableFile already returns a utf8 string (symlink/hardlink/reparse-safe, 256KB cap).
    const text = await readStableFile(path.join(folderPath, ...RULE_RELATIVE));
    return validateRuleDocument(JSON.parse(text), code);
  }

  async function listProjects() {
    if (!workspacesRoot) return { state: 'unconfigured', projects: [] };
    return cached('list', async () => {
      try { await admitRealDirectory(workspacesRoot); }
      catch { return { state: 'unavailable', projects: [], reason: 'workspaces_root_invalid' }; }
      const projects = [];
      let examined = 0, ruleReads = 0;
      try {
        for await (const entry of await opendir(workspacesRoot)) {
          if (examined++ >= MAX_FOLDER_SCAN) break;
          if (!safeFolderName(entry.name)) continue;
          const match = entry.name.match(/^([A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+)_/u);
          if (!match) continue;
          if (ruleReads >= MAX_LIST_RULE_READS) continue;
          ruleReads++;
          try {
            await admitRealDirectory(path.join(workspacesRoot, entry.name));
            const doc = await readRuleFile(path.join(workspacesRoot, entry.name), match[1]);
            projects.push({ project_code: match[1], folder_name: entry.name, rule_version: doc.rule_version,
              status: doc.status, exact_count: doc.exact.length, hint_count: doc.hint.length });
          } catch { /* no rule file, or an invalid one: this project is not listed */ }
        }
      } catch { return { state: 'unavailable', projects: [], reason: 'workspaces_root_scan_failed' }; }
      return { state: 'ready', projects, scanned_at: new Date(now()).toISOString() };
    });
  }

  async function readProject(rawCode) {
    if (!workspacesRoot) return { state: 'unconfigured' };
    const code = typeof rawCode === 'string' ? rawCode : '';
    if (!PROJECT_CODE.test(code)) return { state: 'denied', reason: 'invalid_project_code' };
    return cached(`project:${code}`, async () => {
      let matches;
      try { matches = await findProjectFolders(workspacesRoot, code); }
      catch { return { state: 'unavailable', reason: 'workspaces_root_invalid' }; }
      if (matches.length === 0) return { state: 'no_rule', reason: 'project_folder_not_found' };
      if (matches.length > 1) return { state: 'unavailable', reason: 'ambiguous_project_folder' };
      const folder = matches[0];
      const folderPath = path.join(workspacesRoot, folder);
      let doc;
      try { doc = await readRuleFile(folderPath, code); }
      catch (error) {
        if (error?.code === 'ENOENT') return { state: 'no_rule', folder_name: folder };
        return { state: 'unavailable', reason: 'rule_read_failed' };
      }
      let decisions = [], open_items = [];
      try {
        const markdown = await readStableFile(path.join(folderPath, ...RULE_MD_RELATIVE));
        decisions = parseBulletSection(markdown, 'Owner 확인 기록');
        open_items = parseBulletSection(markdown, 'Owner 확인이 필요한 것');
      } catch { /* the human twin is optional; missing/unreadable leaves both lists empty */ }
      return { state: 'ready', rule: doc, decisions, open_items, write_enabled: Boolean(writeEnabled),
        observed_at: new Date(now()).toISOString() };
    });
  }

  // previewRule/saveRuleVersion take a *full* rule document (schema_version, status,
  // conflict_policy, sender_policy, rule_version, … — everything, not just the edited
  // parts); the panel's draft only ever carries {exact, hint, yields_to, note}. This merges
  // the UI draft's editable fields onto the project's current on-disk rule so the core
  // module always receives a structurally complete document. Throws a tagged error
  // (`no_current_rule` / `current_rule_unavailable`) when there is nothing to merge onto —
  // this module only versions an *existing* rule, it does not author a first one.
  async function buildFullDraft(code, uiDraft) {
    const current = await readProject(code);
    if (current.state !== 'ready') {
      const error = new Error('mail_rule_current_unreadable');
      error.code = current.state === 'no_rule' ? 'no_current_rule' : 'current_rule_unavailable';
      throw error;
    }
    return { ...current.rule, exact: uiDraft.exact, hint: uiDraft.hint, yields_to: uiDraft.yields_to ?? current.rule.yields_to };
  }

  function requireCustody(ready) {
    if (!ready) { const error = new Error('mail_rule_custody_unconfigured'); error.code = 'custody_unconfigured'; throw error; }
  }

  // Read-only: never writes. Subject-only fields per the Owner-approved default.
  async function preview(code, uiDraft) {
    requireCustody(previewCustodyReady);
    const draft = await buildFullDraft(code, uiDraft);
    return resolvedCore.previewRule({ workspacesRoot, code, draft, hiworksDirs, gmailSentDirs, fields: MATCH_FIELDS_SUBJECT_ONLY });
  }

  // Re-runs preview server-side (never trusts a client-supplied preview result) to obtain
  // `measured` for the saved rule's rendered markdown, saves the new version, then refreshes
  // every onboarded project's ledgers (omitting `projects` on the core's `refresh()` call
  // means "all" — this adapter has no way to learn from previewRule's result which *other*
  // projects' custody attribution shifted, so it always refreshes the full set rather than
  // guessing a narrower one). A refresh failure after a successful save does not roll the
  // save back — the rule is already the source of truth on disk.
  async function save(code, uiDraft, note) {
    requireCustody(fullCustodyReady);
    const draft = await buildFullDraft(code, uiDraft);
    const measured = await resolvedCore.previewRule({ workspacesRoot, code, draft, hiworksDirs, gmailSentDirs, fields: MATCH_FIELDS_SUBJECT_ONLY });
    const saved = await resolvedCore.saveRuleVersion({ workspacesRoot, workmetaRoot, code, draft, by: 'owner', note, measured });
    cache.delete(`project:${code}`);
    cache.delete('list');
    try {
      const receipt = await resolvedCore.refresh({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs,
        orgConfigPath: ledgerOrgConfigPath, fields: MATCH_FIELDS_SUBJECT_ONLY, receiptsDir: ledgerReceiptsDir });
      return { kind: 'saved', rule_version: saved.rule_version, previous_version: saved.previous_version, refresh: summarizeRefreshReceipt(receipt) };
    } catch (error) {
      return { kind: 'saved_refresh_failed', rule_version: saved.rule_version, error_code: error?.code ?? 'workspace_ledgers_refresh_failed' };
    }
  }

  // The "다시 시도" retry after a `saved_refresh_failed` response. Always refreshes every
  // onboarded project, for the same reason `save` does. Never touches rule.json, so the
  // GET-path cache (keyed on the rule, not the ledgers) is left alone.
  async function refreshAll() {
    requireCustody(fullCustodyReady);
    const receipt = await resolvedCore.refresh({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs,
      orgConfigPath: ledgerOrgConfigPath, fields: MATCH_FIELDS_SUBJECT_ONLY, receiptsDir: ledgerReceiptsDir });
    return summarizeRefreshReceipt(receipt);
  }

  return { listProjects, readProject, preview, save, refreshAll, core: resolvedCore,
    workspacesRoot, workmetaRoot, writeEnabled: Boolean(writeEnabled),
    hiworksDirs, gmailSentDirs, ledgerOrgConfigPath, ledgerReceiptsDir, previewCustodyReady, fullCustodyReady };
}

// ---------- HTTP plugin ----------

function originIsSelf(req) {
  let originOk = true;
  try { if (req.headers.origin) originOk = new URL(req.headers.origin).host === req.headers.host; }
  catch { originOk = false; }
  return originOk && req.headers['sec-fetch-site'] !== 'cross-site'
    && /^(127\.0\.0\.1|localhost)(:\d+)?$/u.test(req.headers.host || '');
}

// Status codes shared by every POST-route failure. `custody_unconfigured` and
// `core_module_unavailable` are both "not ready", not the caller's fault — 503. Everything
// else classified here as a caller/data problem is 400, with the module's own structured
// error code (never a raw message, path, or stack) surfaced as `reason` for the UI/operator.
function sendWriteRouteError(res, send, error) {
  if (error?.code === 'custody_unconfigured') { res.statusCode = 503; send({ state: 'custody_unconfigured' }); return; }
  if (error?.code === 'core_module_unavailable') { res.statusCode = 503; send({ state: 'core_module_unavailable' }); return; }
  if (error?.code === 'body_too_large') { res.statusCode = 413; send({ state: 'denied' }); return; }
  const reason = typeof error?.code === 'string' && /^[a-z0-9_]+$/u.test(error.code) ? error.code : undefined;
  res.statusCode = 400; send({ state: 'denied', ...(reason ? { reason } : {}) });
}

export function createMailRulePlugin(options = {}) {
  const reader = createMailRuleReader(options);
  const configure = server => { server.middlewares.use((req, res, next) => {
    let url;
    try { url = new URL(req.url || '/', 'http://127.0.0.1'); } catch { res.statusCode = 400; res.end(); return; }
    const isWrite = [MAIL_RULE_PREVIEW_PATH, MAIL_RULE_SAVE_PATH, MAIL_RULE_REFRESH_PATH].includes(url.pathname);
    if (![MAIL_RULES_SNAPSHOT_PATH, MAIL_RULE_SNAPSHOT_PATH, MAIL_RULE_PREVIEW_PATH, MAIL_RULE_SAVE_PATH, MAIL_RULE_REFRESH_PATH].includes(url.pathname)) return next();
    if (req.method !== (isWrite ? 'POST' : 'GET')) { res.statusCode = 405; res.end(); return; }
    if (!isDirectLoopbackRequest(req) || !originIsSelf(req)) { res.statusCode = 403; res.end(); return; }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = value => res.end(JSON.stringify(value));

    if (url.pathname === MAIL_RULES_SNAPSHOT_PATH) {
      if ([...url.searchParams.keys()].length) { res.statusCode = 400; send({ state: 'denied' }); return; }
      void reader.listProjects().then(send, () => { res.statusCode = 503; send({ state: 'unavailable', projects: [] }); });
      return;
    }
    if (url.pathname === MAIL_RULE_SNAPSHOT_PATH) {
      if ([...url.searchParams.keys()].some(key => key !== 'project')) { res.statusCode = 400; send({ state: 'denied' }); return; }
      void reader.readProject(url.searchParams.get('project') || '').then(send, () => { res.statusCode = 503; send({ state: 'unavailable' }); });
      return;
    }

    // POST /mail-rule/preview, /mail-rule/save or /mail-rule/refresh. `save` and `refresh`
    // both write (a new rule version, or the four management ledgers) and so both refuse
    // before any other work (including body parsing) when the write flag is not the exact
    // string '1'. `preview` never writes and has no such gate.
    if (url.pathname !== MAIL_RULE_PREVIEW_PATH && !reader.writeEnabled) { res.statusCode = 403; send({ state: 'write_disabled' }); return; }
    if (req.headers['content-type'] !== 'application/json') { res.statusCode = 415; send({ state: 'denied' }); return; }
    void readJsonBody(req, MAX_BODY_BYTES)
      .then(body => {
        if (url.pathname === MAIL_RULE_REFRESH_PATH) return reader.refreshAll();
        if (typeof body?.project !== 'string' || !PROJECT_CODE.test(body.project)) throw new Error('project_invalid');
        const draft = validateDraft(body.draft);
        return url.pathname === MAIL_RULE_PREVIEW_PATH
          ? reader.preview(body.project, draft)
          : reader.save(body.project, draft, draft.note);
      })
      .then(result => {
        if (url.pathname === MAIL_RULE_SAVE_PATH) { const { kind, ...rest } = result; send({ state: kind, ...rest }); return; }
        if (url.pathname === MAIL_RULE_REFRESH_PATH) { send({ state: 'ready', refresh: result }); return; }
        send({ state: 'ready', result });
      }, error => sendWriteRouteError(res, send, error));
  }); };
  return { name: 'operations-mail-rule-read-only', configureServer: configure, configurePreviewServer: configure };
}

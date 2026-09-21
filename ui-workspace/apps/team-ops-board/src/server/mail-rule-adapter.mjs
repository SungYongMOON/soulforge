// mail-rule-adapter.mjs — Team Ops Board read (and gated preview/save) projection for the
// per-project mail classification rule (2026-09-21 owner decision). The rule and its human
// twin live as files on the private D: workspace plane, one pair per project folder:
//   <workspacesRoot>/<CODE>_<짧은한글명>/020_MGMT/021_자동화설정_운영규칙/mail_routing_rule.json
//   <workspacesRoot>/<CODE>_<짧은한글명>/020_MGMT/021_자동화설정_운영규칙/mail_routing_rule.md
//
// This adapter only ever reads those two files (via the existing symlink/hardlink-safe,
// 256KB-capped `readStableFile`). It never writes a file itself. The write path
// (POST /mail-rule/preview, POST /mail-rule/save) validates the request fully and then
// delegates to an injectable `core` object — by default a loader that tries to import the
// sibling `guild_hall/workspace_ledgers` module and reports `core_module_unavailable` until
// that module exists. `POST /mail-rule/save` additionally refuses with 403 `write_disabled`
// before any other work when `TEAM_OPS_MAIL_RULE_WRITE` is not the exact string '1'.

import { lstat, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readStableFile } from './receipt-expiry-adapter.mjs';
import { isDirectLoopbackRequest } from './loopback-request-guard.mjs';

export const MAIL_RULES_SNAPSHOT_PATH = '/mail-rules.snapshot.json';
export const MAIL_RULE_SNAPSHOT_PATH = '/mail-rule.snapshot.json';
export const MAIL_RULE_PREVIEW_PATH = '/mail-rule/preview';
export const MAIL_RULE_SAVE_PATH = '/mail-rule/save';

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
  if (doc.yields_to !== null) {
    if (doc.yields_to === undefined || typeof doc.yields_to !== 'object' || Array.isArray(doc.yields_to)) throw new Error('rule_shape_invalid');
    if (typeof doc.yields_to.project_code !== 'string' || !PROJECT_CODE.test(doc.yields_to.project_code)) throw new Error('rule_shape_invalid');
    if (!validateTermItem(doc.yields_to.when, MAX_TERM_VALUE_CHARS)) throw new Error('rule_shape_invalid');
  }
  if (doc.conflict_policy !== undefined && typeof doc.conflict_policy !== 'string') throw new Error('rule_shape_invalid');
  return doc;
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

// ---------- default core loader (workspace_ledgers module not merged yet) ----------

// Best-effort conventional path for the sibling `guild_hall/workspace_ledgers` module
// (branch claude/workspace-ledgers-v0, not merged as of 2026-09-21). This exact specifier is
// a guess — see README "메일 분류 키워드" section for the one-line change required once the
// real module lands with its actual file name and export shape.
const CORE_MODULE_SPECIFIER = '../../../../../guild_hall/workspace_ledgers/src/mail_routing_rules.mjs';
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

// ---------- reader ----------

export function createMailRuleReader({ workspacesRoot, workmetaRoot, writeEnabled = false, core, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  const resolvedCore = core ?? createDefaultMailRuleCore();

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

  return { listProjects, readProject, core: resolvedCore, workspacesRoot, workmetaRoot, writeEnabled: Boolean(writeEnabled) };
}

// ---------- HTTP plugin ----------

function originIsSelf(req) {
  let originOk = true;
  try { if (req.headers.origin) originOk = new URL(req.headers.origin).host === req.headers.host; }
  catch { originOk = false; }
  return originOk && req.headers['sec-fetch-site'] !== 'cross-site'
    && /^(127\.0\.0\.1|localhost)(:\d+)?$/u.test(req.headers.host || '');
}

export function createMailRulePlugin(options = {}) {
  const reader = createMailRuleReader(options);
  const configure = server => { server.middlewares.use((req, res, next) => {
    let url;
    try { url = new URL(req.url || '/', 'http://127.0.0.1'); } catch { res.statusCode = 400; res.end(); return; }
    const isWrite = url.pathname === MAIL_RULE_PREVIEW_PATH || url.pathname === MAIL_RULE_SAVE_PATH;
    if (![MAIL_RULES_SNAPSHOT_PATH, MAIL_RULE_SNAPSHOT_PATH, MAIL_RULE_PREVIEW_PATH, MAIL_RULE_SAVE_PATH].includes(url.pathname)) return next();
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

    // POST /mail-rule/preview or /mail-rule/save. `save` refuses before any other work
    // (including body parsing) when the write flag is not the exact string '1'.
    if (url.pathname === MAIL_RULE_SAVE_PATH && !reader.writeEnabled) { res.statusCode = 403; send({ state: 'write_disabled' }); return; }
    if (req.headers['content-type'] !== 'application/json') { res.statusCode = 415; send({ state: 'denied' }); return; }
    void readJsonBody(req, MAX_BODY_BYTES)
      .then(body => {
        if (typeof body?.project !== 'string' || !PROJECT_CODE.test(body.project)) throw new Error('project_invalid');
        const draft = validateDraft(body.draft);
        const call = url.pathname === MAIL_RULE_PREVIEW_PATH
          ? reader.core.previewRule({ workspacesRoot: reader.workspacesRoot, code: body.project, draft })
          : reader.core.saveRuleVersion({ workspacesRoot: reader.workspacesRoot, workmetaRoot: reader.workmetaRoot,
              code: body.project, draft, by: 'owner', note: draft.note });
        return call;
      })
      .then(result => send({ state: 'ready', result }), error => {
        if (error?.code === 'core_module_unavailable') { res.statusCode = 503; send({ state: 'core_module_unavailable' }); return; }
        if (error?.code === 'body_too_large') { res.statusCode = 413; send({ state: 'denied' }); return; }
        res.statusCode = 400; send({ state: 'denied' });
      });
  }); };
  return { name: 'operations-mail-rule-read-only', configureServer: configure, configurePreviewServer: configure };
}

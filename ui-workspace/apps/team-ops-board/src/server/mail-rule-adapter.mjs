// mail-rule-adapter.mjs — Team Ops Board read (and gated preview/save/refresh) projection for
// the per-project mail classification rule (2026-09-21 owner decision). The rule and its human
// twin live as files on the private D: workspace plane, one pair per project folder:
//   <workspacesRoot>/<CODE>_<짧은한글명>/020_MGMT/021_자동화설정_운영규칙/mail_routing_rule.json
//   <workspacesRoot>/<CODE>_<짧은한글명>/020_MGMT/021_자동화설정_운영규칙/mail_routing_rule.md
//
// GET /mail-rule.snapshot.json only ever reads those two files directly (via the existing
// symlink/hardlink-safe, 256KB-capped `readStableFile`) — this adapter never writes a file
// itself for the read path, and this read path does not depend on the core module below being
// present. (An earlier `GET /mail-rules.snapshot.json` project-list route was removed — the
// UI never grew a project-picker screen to call it; `createMailRuleReader(...).listProjects()`
// stays available as an internal, independently tested building block for if/when one exists,
// but is no longer reachable over HTTP.)
//
// POST /mail-rule/preview, POST /mail-rule/save and POST /mail-rule/refresh validate the
// request fully and then delegate to an injectable `core` object — by default a loader for
// the sibling `guild_hall/workspace_ledgers` module that reports `core_module_unavailable` if
// that module cannot be imported or does not export the expected functions. `save` and
// `refresh` both write (a new rule version, or the four management ledgers) and so both refuse
// with 403 `write_disabled` before any other work when `TEAM_OPS_MAIL_RULE_WRITE` is not the
// exact string '1'; `preview` never writes and has no such gate. All three also refuse with
// 503 `custody_unconfigured` when `workspacesRoot` is not set, or the mail-event directories
// are not set, or (save/refresh only) `workmetaRoot`, the org config, or the receipts
// directory are not set — this check runs before any core call, so a missing `workmetaRoot`
// can never reach `saveRuleVersion`'s lineage write and throw partway through (fresh review
// R1: that used to write a new rule version, then throw building the lineage path, leaving the
// private plane holding an unversioned-lineage write while the panel reported a plain 400).
// `save`/`refresh` additionally require `workspacesRoot`/`workmetaRoot` to each resolve to a
// real, existing directory (503 `workspaces_root_invalid`/`workmeta_root_invalid` otherwise,
// second review round S-b/S-c) — a merely-non-empty but typo'd path used to reach the core's
// `refresh()` unguarded, which creates rather than fails on a missing directory, so a typo
// silently produced a new empty directory on the private plane and a green "0 files" success.
// `save` re-reads the current rule uncached and compares against the caller's `rule_version`/
// `sha256_json` **twice** — once before the core's `previewRule` call and once more immediately
// before `saveRuleVersion` (second round S-a: `previewRule` against real custody can be slow,
// and that gap was a window for a concurrent CLI save to land and be silently reverted on every
// field the UI draft does not itself carry) — refusing 409 `rule_changed` either time (optimistic
// concurrency — see "Optimistic concurrency" in the README). At most one preview/save/refresh
// call runs at a time; a second concurrent call is refused 409 `busy` rather than queued or
// interleaved, because the core module's own matching and file-write paths are synchronous,
// blocking calls with no internal concurrency control of their own (see "Synchronous core
// calls" in the README). If `guild_hall/workspace_ledgers`' `refresh()` ever grows optional
// bundle/custody-reading-table paths beyond the ones this adapter already wires
// (`hiworksDirs`/`gmailSentDirs`/`orgConfigPath`/`receiptsDir`), this adapter passes none of
// them today — the console's refresh would silently do less than the CLI until a follow-up
// change wires them from configuration too.

import { createHash } from 'node:crypto';
import { lstat, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readStableFile } from './receipt-expiry-adapter.mjs';
import { isDirectLoopbackRequest } from './loopback-request-guard.mjs';

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

// Shared by every place that decides whether an error `.code` is safe to surface verbatim as a
// `reason`/`error_code` — this module's own codes, plus every core error code, are all
// lowercase_with_underscores; a bare Node error code (`ERR_INVALID_ARG_TYPE`, `ENOENT`, …) or an
// unset `.code` never is. Used by `sendWriteRouteError` below and by `save()`'s
// `saved_refresh_failed` branch (fresh review, second round S-d — that branch used to send
// `error?.code` verbatim, bypassing this exact normalisation).
const SAFE_ERROR_CODE = /^[a-z0-9_]+$/u;
const normalizeErrorCode = code => (typeof code === 'string' && SAFE_ERROR_CODE.test(code)) ? code : 'internal_error';

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

// Fresh review, second round S-b/S-c: `fullCustodyReady`/`previewCustodyReady` only check that
// `workspacesRoot`/`workmetaRoot` are non-empty strings — a typo'd path passes that check just
// as well as a real one. `refreshAll()` in particular never touched either path at all before
// handing them straight to the core's `refresh()`, which (like most Node fs-writing code) is
// happy to `mkdir` a path that does not exist yet — so a typo silently created a new, empty
// directory on the private plane and the panel showed a green "0 files" success rather than any
// error. Throws a tagged error (`code`) rather than returning a boolean, so callers can `await`
// it directly ahead of any core call and let it propagate through the normal error path.
async function requireRealDirectory(target, code) {
  try { await admitRealDirectory(target); }
  catch { const error = new Error(code); error.code = code; throw error; }
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

// Every rejection here is the same code (`draft_invalid`) — the specific reason is not
// distinguished — but the previous version threw bare `new Error('draft_invalid')` with no
// `.code` set, so `sendWriteRouteError`'s reason-surfacing check silently found nothing and the
// panel/operator saw only a bare `{state:'denied'}`. Setting `.code` here is what actually
// carries this string as far as the HTTP response.
function draftInvalid() { const error = new Error('draft_invalid'); error.code = 'draft_invalid'; return error; }

export function validateDraft(draft) {
  if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) throw draftInvalid();
  for (const group of ['exact', 'hint']) {
    const list = draft[group];
    if (!Array.isArray(list) || list.length > MAX_DRAFT_TERMS) throw draftInvalid();
    const labels = new Set();
    for (const item of list) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) throw draftInvalid();
      if (!asNonEmptyString(item.label, 200) || labels.has(item.label)) throw draftInvalid();
      labels.add(item.label);
      if (item.kind === 'literal') {
        if (!asNonEmptyString(item.value, MAX_LITERAL_CHARS)) throw draftInvalid();
      } else if (item.kind === 'regex') {
        if (!asNonEmptyString(item.value, MAX_REGEX_CHARS)) throw draftInvalid();
        try { new RegExp(item.value, typeof item.flags === 'string' ? item.flags : undefined); }
        catch { throw draftInvalid(); }
      } else throw draftInvalid();
    }
  }
  if (draft.note !== undefined && !(typeof draft.note === 'string' && draft.note.length <= MAX_NOTE_CHARS)) throw draftInvalid();
  // yields_to is not editable in this slice: the panel round-trips whatever shape the rule
  // already carried. Validate it (same null/object/array shapes as a stored rule, same term
  // limits) but leave the value itself untouched — normalizing it is the reader's job, not
  // the draft's, since a draft with no yields_to key at all is also valid (nothing to carry).
  if (draft.yields_to !== undefined) {
    try { normalizeYieldsTo(draft.yields_to); } catch { throw draftInvalid(); }
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
//
// Fresh review R2: this used to report only `{projects, changed_files}`, silently dropping
// `receipt.status`. `refresh()` returns normally with `status: 'failed'` — it does not throw —
// whenever one or more ledger files failed R4 validation (`ledger_failures`), a custody
// directory could not be read at all (`unreadable_dirs`), or a saved rule for one project
// failed to read/compile (`rule_failures`); in the worst case (every custody directory
// unreadable) `receipt.projects` comes back empty, which used to render identically to a
// genuinely quiet "0 files changed" run. Carrying `status` plus the three failure counts lets
// the caller (and the panel) tell those apart. `owner_table_failures` is not part of the
// current core — carried through only when a receipt actually has it, so this adapter never
// invents a field the core never wrote (it is anticipating a pending second core review round
// that may add it).
function summarizeRefreshReceipt(receipt) {
  const projects = Array.isArray(receipt?.projects) ? receipt.projects.map(p => p.project_code) : [];
  const changed_files = Array.isArray(receipt?.projects) ? receipt.projects.reduce((sum, p) =>
    sum + [p.contacts, p.received_history, p.sent_history, p.reply_status].filter(r => r?.written).length, 0) : 0;
  const summary = {
    projects, changed_files,
    status: receipt?.status === 'ok' ? 'ok' : 'failed',
    ledger_failures: Array.isArray(receipt?.ledger_failures) ? receipt.ledger_failures.length : 0,
    rule_failures: Array.isArray(receipt?.rule_failures) ? receipt.rule_failures.length : 0,
    unreadable_dirs: Array.isArray(receipt?.unreadable_dirs) ? receipt.unreadable_dirs.length : 0,
  };
  if (Array.isArray(receipt?.owner_table_failures)) summary.owner_table_failures = receipt.owner_table_failures.length;
  return summary;
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
  // previewRule only needs workspacesRoot and the two custody directories; save/refresh
  // additionally need workmetaRoot, the org config, and a receipts directory (`refresh()`
  // itself requires all of those and fails closed). Fresh review R1: `fullCustodyReady` used
  // to omit `workmetaRoot` — with it unset, `saveRuleVersion` would write the new rule version
  // to disk and only then throw building the lineage path (`ERR_INVALID_ARG_TYPE`), leaving a
  // new version with no lineage record while the panel reported a plain 400 and kept showing
  // the old version. Checking both roots here, before any core call, makes that a clean 503
  // custody_unconfigured instead.
  const previewCustodyReady = Boolean(workspacesRoot) && hiworksDirs.length > 0 && gmailSentDirs.length > 0;
  const fullCustodyReady = previewCustodyReady && Boolean(workspacesRoot) && Boolean(workmetaRoot)
    && Boolean(ledgerOrgConfigPath) && Boolean(ledgerReceiptsDir);

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
    const doc = validateRuleDocument(JSON.parse(text), code);
    // Hashed over the raw on-disk bytes (before JSON.parse/validate reshape them), so this is
    // exactly the digest a concurrent writer's own next write would have to match for S1's
    // optimistic-concurrency check below to consider nothing changed.
    const sha256_json = createHash('sha256').update(text, 'utf8').digest('hex');
    return { doc, sha256_json };
  }

  async function listProjects() {
    if (!workspacesRoot) return { state: 'unconfigured', projects: [] };
    return cached('list', async () => {
      try { await admitRealDirectory(workspacesRoot); }
      catch { return { state: 'unavailable', projects: [], reason: 'workspaces_root_invalid' }; }
      const projects = [];
      let examined = 0, ruleReads = 0, truncated = false;
      try {
        for await (const entry of await opendir(workspacesRoot)) {
          if (examined++ >= MAX_FOLDER_SCAN) { truncated = true; break; }
          if (!safeFolderName(entry.name)) continue;
          const match = entry.name.match(/^([A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+)_/u);
          if (!match) continue;
          if (ruleReads >= MAX_LIST_RULE_READS) { truncated = true; continue; }
          ruleReads++;
          try {
            await admitRealDirectory(path.join(workspacesRoot, entry.name));
            const { doc } = await readRuleFile(path.join(workspacesRoot, entry.name), match[1]);
            projects.push({ project_code: match[1], folder_name: entry.name, rule_version: doc.rule_version,
              status: doc.status, exact_count: doc.exact.length, hint_count: doc.hint.length });
          } catch { /* no rule file, or an invalid one: this project is not listed */ }
        }
      } catch { return { state: 'unavailable', projects: [], reason: 'workspaces_root_scan_failed' }; }
      return { state: 'ready', projects, truncated, scanned_at: new Date(now()).toISOString() };
    });
  }

  // Shared by the cached GET path (`readProject`) and the always-fresh save path (S1 below) —
  // the two must read the rule the exact same way, or a version/sha256 comparison between them
  // would be meaningless.
  async function buildProjectSnapshot(code) {
    let matches;
    try { matches = await findProjectFolders(workspacesRoot, code); }
    catch { return { state: 'unavailable', reason: 'workspaces_root_invalid' }; }
    if (matches.length === 0) return { state: 'no_rule', reason: 'project_folder_not_found' };
    if (matches.length > 1) return { state: 'unavailable', reason: 'ambiguous_project_folder' };
    const folder = matches[0];
    const folderPath = path.join(workspacesRoot, folder);
    let parsed;
    try { parsed = await readRuleFile(folderPath, code); }
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
    return { state: 'ready', rule: parsed.doc, sha256_json: parsed.sha256_json, decisions, open_items,
      write_enabled: Boolean(writeEnabled), observed_at: new Date(now()).toISOString() };
  }

  async function readProject(rawCode) {
    if (!workspacesRoot) return { state: 'unconfigured' };
    const code = typeof rawCode === 'string' ? rawCode : '';
    if (!PROJECT_CODE.test(code)) return { state: 'denied', reason: 'invalid_project_code' };
    return cached(`project:${code}`, () => buildProjectSnapshot(code));
  }

  function mergeDraftOntoRule(currentRule, uiDraft) {
    return { ...currentRule, exact: uiDraft.exact, hint: uiDraft.hint, yields_to: uiDraft.yields_to ?? currentRule.yields_to };
  }

  // previewRule/saveRuleVersion take a *full* rule document (schema_version, status,
  // conflict_policy, sender_policy, rule_version, … — everything, not just the edited
  // parts); the panel's draft only ever carries {exact, hint, yields_to, note}. This merges
  // the UI draft's editable fields onto the project's current on-disk rule so the core
  // module always receives a structurally complete document. Throws a tagged error
  // (`no_current_rule` / `current_rule_unavailable`) when there is nothing to merge onto —
  // this module only versions an *existing* rule, it does not author a first one. Used by the
  // read-only preview path, which is fine reading through the 60s cache; `save` below always
  // reads fresh instead (see S1).
  async function buildFullDraft(code, uiDraft) {
    const current = await readProject(code);
    if (current.state !== 'ready') {
      const error = new Error('mail_rule_current_unreadable');
      error.code = current.state === 'no_rule' ? 'no_current_rule' : 'current_rule_unavailable';
      throw error;
    }
    return mergeDraftOntoRule(current.rule, uiDraft);
  }

  function requireCustody(ready) {
    if (!ready) { const error = new Error('mail_rule_custody_unconfigured'); error.code = 'custody_unconfigured'; throw error; }
  }

  // S5: preview/save/refresh delegate to the core module's synchronous, blocking match and
  // file-write paths (see the README's "Synchronous core calls" note) — this adapter has no
  // business running two of those at once, and the core's own file locks (`rule_save.lock`,
  // the refresh lock) would only let a second concurrent call fail later and more confusingly.
  // A single in-process flag is enough: this plugin only ever runs inside one process, and the
  // core calls this guards are themselves single-threaded async work, not real parallelism.
  let coreBusy = false;
  async function withCoreLock(run) {
    if (coreBusy) { const error = new Error('mail_rule_core_busy'); error.code = 'busy'; throw error; }
    coreBusy = true;
    try { return await run(); } finally { coreBusy = false; }
  }

  // Read-only: never writes. Subject-only fields per the Owner-approved default. `orgConfigPath`
  // (R3) is passed only when actually configured — preview's custody requirement does not
  // include it, so it can be absent here even when save's cannot.
  async function preview(code, uiDraft) {
    requireCustody(previewCustodyReady);
    return withCoreLock(async () => {
      const draft = await buildFullDraft(code, uiDraft);
      return resolvedCore.previewRule({ workspacesRoot, code, draft, hiworksDirs, gmailSentDirs, fields: MATCH_FIELDS_SUBJECT_ONLY,
        ...(ledgerOrgConfigPath ? { orgConfigPath: ledgerOrgConfigPath } : {}) });
    });
  }

  // Re-runs preview server-side (never trusts a client-supplied preview result) to obtain
  // `measured` for the saved rule's rendered markdown, saves the new version, then refreshes
  // every onboarded project's ledgers (omitting `projects` on the core's `refresh()` call
  // means "all" — this adapter has no way to learn from previewRule's result which *other*
  // projects' custody attribution shifted, so it always refreshes the full set rather than
  // guessing a narrower one). A refresh failure after a successful save does not roll the
  // save back — the rule is already the source of truth on disk; a refresh that returns
  // normally but with `status: 'failed'` (R2) is reported as `saved_refresh_partial` instead
  // of the plain `saved` success, distinct from `saved_refresh_failed` (the refresh call itself
  // threw). R3: `orgConfigPath` is always passed here — `save` already requires it via
  // `fullCustodyReady`, and this `previewRule` call's `measured` result is what gets rendered
  // into the saved rule's markdown, so it must resolve `system_sender_domains` the exact same
  // way the `refresh()` call below does, or the rendered "근거" line could disagree with what
  // refresh actually does moments later.
  //
  // S1 optimistic concurrency: `expected` (when the caller supplies it) is `{rule_version,
  // sha256_json}` read by the panel at load time. Refuses `rule_changed` if a fresh read no
  // longer matches either field, before any core call. `expected` is optional at this reader
  // level (a direct/internal caller with no prior read to compare against can still save); the
  // HTTP route below requires it. `checkExpectedVersion` is called twice — see S-a below.
  function checkExpectedVersion(currentSnapshot, expectedVersion) {
    if (!expectedVersion) return;
    const changed = String(expectedVersion.rule_version) !== String(currentSnapshot.rule.rule_version)
      || expectedVersion.sha256_json !== currentSnapshot.sha256_json;
    if (changed) { const error = new Error('mail_rule_changed'); error.code = 'rule_changed'; throw error; }
  }

  function requireReadySnapshot(snapshot) {
    if (snapshot.state !== 'ready') {
      const error = new Error('mail_rule_current_unreadable');
      error.code = snapshot.state === 'no_rule' ? 'no_current_rule' : 'current_rule_unavailable';
      throw error;
    }
  }

  async function save(code, uiDraft, note, expected) {
    requireCustody(fullCustodyReady);
    // S-b/S-c (second round): a typo'd workspacesRoot/workmetaRoot is a truthy string, so the
    // sync check above alone would let it through; the core would then happily `mkdir` it. This
    // path is already indirectly guarded for workspacesRoot by `findProjectFolders` inside
    // `buildProjectSnapshot` below, but checking both explicitly, before any read or write,
    // keeps the guarantee obvious rather than incidental and covers workmetaRoot too (nothing
    // else in `save` ever reads it before handing it to `saveRuleVersion`).
    await requireRealDirectory(workspacesRoot, 'workspaces_root_invalid');
    await requireRealDirectory(workmetaRoot, 'workmeta_root_invalid');
    // Second round nit: the note is checked here — before the potentially slow `previewRule`
    // call below — even though `saveRuleVersion` would eventually refuse the same way
    // (`workspace_ledgers_note_missing`); there is no reason to pay for a full custody
    // classification pass just to reject a request that was always going to fail on this alone.
    if (typeof note !== 'string' || note.trim() === '') {
      const error = new Error('workspace_ledgers_note_missing'); error.code = 'workspace_ledgers_note_missing'; throw error;
    }
    return withCoreLock(async () => {
      const current = await buildProjectSnapshot(code);
      requireReadySnapshot(current);
      checkExpectedVersion(current, expected);
      const draft = mergeDraftOntoRule(current.rule, uiDraft);
      const measured = await resolvedCore.previewRule({ workspacesRoot, code, draft, hiworksDirs, gmailSentDirs,
        fields: MATCH_FIELDS_SUBJECT_ONLY, orgConfigPath: ledgerOrgConfigPath });
      // S-a (second round): `previewRule` above can take a while against real custody, and the
      // uncached read + version compare happened *before* it started — a concurrent CLI save
      // landing in that window would otherwise be silently reverted (every field `uiDraft`
      // doesn't carry, which is everything except exact/hint/yields_to, still came from the
      // pre-previewRule `current.rule`). Re-reading and re-comparing now, immediately before the
      // actual write, closes that window; a mismatch here still means no core write happens.
      // `previewRule`'s own `measured` result stays valid either way — it was computed against
      // whichever draft `current.rule` produced, and this second check either confirms that
      // rule is still the one on disk or refuses before `saveRuleVersion` is ever called.
      const beforeWrite = await buildProjectSnapshot(code);
      requireReadySnapshot(beforeWrite);
      checkExpectedVersion(beforeWrite, expected);
      const finalDraft = mergeDraftOntoRule(beforeWrite.rule, uiDraft);
      const saved = await resolvedCore.saveRuleVersion({ workspacesRoot, workmetaRoot, code, draft: finalDraft, by: 'owner', note, measured,
        allowedActors: ['owner'] });
      cache.delete(`project:${code}`);
      cache.delete('list');
      try {
        const receipt = await resolvedCore.refresh({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs,
          orgConfigPath: ledgerOrgConfigPath, fields: MATCH_FIELDS_SUBJECT_ONLY, receiptsDir: ledgerReceiptsDir });
        const refreshSummary = summarizeRefreshReceipt(receipt);
        const kind = refreshSummary.status === 'ok' ? 'saved' : 'saved_refresh_partial';
        return { kind, rule_version: saved.rule_version, previous_version: saved.previous_version, refresh: refreshSummary };
      } catch (error) {
        // S-d (second round): this used to send `error?.code` verbatim — a bare Node error code
        // (or none at all) would leak straight through instead of going through the same
        // lowercase_with_underscores normalisation `sendWriteRouteError` applies to every other
        // write-route failure.
        return { kind: 'saved_refresh_failed', rule_version: saved.rule_version,
          error_code: normalizeErrorCode(error?.code ?? 'workspace_ledgers_refresh_failed') };
      }
    });
  }

  // The "다시 시도" retry after a `saved_refresh_failed`/`saved_refresh_partial` response.
  // Always refreshes every onboarded project, for the same reason `save` does. Never touches
  // rule.json, so the GET-path cache (keyed on the rule, not the ledgers) is left alone.
  async function refreshAll() {
    requireCustody(fullCustodyReady);
    // S-b/S-c (second round): see the identical comment in `save` above — `refreshAll` had no
    // check of either path's real existence at all before this, so a typo'd `workspacesRoot`
    // reached the core's `refresh()` unguarded, which creates the directory rather than failing,
    // and the panel showed a plain "0 files changed" success instead of any error.
    await requireRealDirectory(workspacesRoot, 'workspaces_root_invalid');
    await requireRealDirectory(workmetaRoot, 'workmeta_root_invalid');
    return withCoreLock(async () => {
      const receipt = await resolvedCore.refresh({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs,
        orgConfigPath: ledgerOrgConfigPath, fields: MATCH_FIELDS_SUBJECT_ONLY, receiptsDir: ledgerReceiptsDir });
      return summarizeRefreshReceipt(receipt);
    });
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

// Status codes shared by every POST-route failure. `custody_unconfigured`,
// `core_module_unavailable`, `workspaces_root_invalid` and `workmeta_root_invalid` are all "not
// ready", not the caller's fault — 503 (the latter two, second round S-b/S-c: a configured but
// non-existent root, caught by `requireRealDirectory` before any core call). `rule_changed` (S1:
// the on-disk rule no longer matches what the caller loaded) is a genuine conflict — 409, like
// `busy` (S5: another preview/save/refresh is already running). Everything else classified here
// as a caller/data problem is 400, with the module's own structured error code surfaced as
// `reason` for the UI/operator, normalised through the shared `normalizeErrorCode` (fresh review
// R1: every code reaching this function is now expected to be one of this module's own
// lowercase_with_underscores codes — `validateDraft` and the plain `project_invalid`/
// `expected_version_missing` throws below all set `.code` for exactly this reason — but a code
// that still fails that shape, e.g. a bare Node error like `ERR_INVALID_ARG_TYPE` from somewhere
// this module did not anticipate, or no `.code` at all, is never leaked verbatim: it maps to the
// stable `internal_error` reason instead of silently omitting `reason`). `save()`'s
// `saved_refresh_failed` branch uses the exact same `normalizeErrorCode` (S-d, second round) —
// this function is not the only place a core error code reaches the panel.
function sendWriteRouteError(res, send, error) {
  if (error?.code === 'custody_unconfigured') { res.statusCode = 503; send({ state: 'custody_unconfigured' }); return; }
  if (error?.code === 'core_module_unavailable') { res.statusCode = 503; send({ state: 'core_module_unavailable' }); return; }
  if (error?.code === 'workspaces_root_invalid') { res.statusCode = 503; send({ state: 'workspaces_root_invalid' }); return; }
  if (error?.code === 'workmeta_root_invalid') { res.statusCode = 503; send({ state: 'workmeta_root_invalid' }); return; }
  if (error?.code === 'body_too_large') { res.statusCode = 413; send({ state: 'denied' }); return; }
  if (error?.code === 'rule_changed') { res.statusCode = 409; send({ state: 'rule_changed' }); return; }
  if (error?.code === 'busy') { res.statusCode = 409; send({ state: 'busy' }); return; }
  res.statusCode = 400; send({ state: 'denied', reason: normalizeErrorCode(error?.code) });
}

// S1: the save route requires the rule_version/sha256_json the panel loaded, alongside `draft`.
// `sha256_json` is validated as a lowercase hex sha256 (64 chars) — not because a caller could
// forge a match (the adapter always re-reads and compares against its own fresh digest), but so
// a caller that omits or mistypes it fails fast with a clear code instead of an opaque
// `rule_changed` a moment later.
const SHA256_HEX = /^[0-9a-f]{64}$/u;
function validateExpectedVersion(body) {
  const ruleVersion = body?.rule_version;
  if ((typeof ruleVersion !== 'string' && typeof ruleVersion !== 'number') || String(ruleVersion).length === 0 || String(ruleVersion).length > 64) {
    const error = new Error('expected_version_missing'); error.code = 'expected_version_missing'; throw error;
  }
  if (typeof body?.sha256_json !== 'string' || !SHA256_HEX.test(body.sha256_json)) {
    const error = new Error('expected_version_missing'); error.code = 'expected_version_missing'; throw error;
  }
  return { rule_version: ruleVersion, sha256_json: body.sha256_json };
}

export function createMailRulePlugin(options = {}) {
  const reader = createMailRuleReader(options);
  const configure = server => { server.middlewares.use((req, res, next) => {
    let url;
    try { url = new URL(req.url || '/', 'http://127.0.0.1'); } catch { res.statusCode = 400; res.end(); return; }
    const isWrite = [MAIL_RULE_PREVIEW_PATH, MAIL_RULE_SAVE_PATH, MAIL_RULE_REFRESH_PATH].includes(url.pathname);
    if (![MAIL_RULE_SNAPSHOT_PATH, MAIL_RULE_PREVIEW_PATH, MAIL_RULE_SAVE_PATH, MAIL_RULE_REFRESH_PATH].includes(url.pathname)) return next();
    if (req.method !== (isWrite ? 'POST' : 'GET')) { res.statusCode = 405; res.end(); return; }
    if (!isDirectLoopbackRequest(req) || !originIsSelf(req)) { res.statusCode = 403; res.end(); return; }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const send = value => res.end(JSON.stringify(value));

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
        if (typeof body?.project !== 'string' || !PROJECT_CODE.test(body.project)) {
          const error = new Error('project_invalid'); error.code = 'project_invalid'; throw error;
        }
        const draft = validateDraft(body.draft);
        if (url.pathname === MAIL_RULE_PREVIEW_PATH) return reader.preview(body.project, draft);
        const expected = validateExpectedVersion(body);
        return reader.save(body.project, draft, draft.note, expected);
      })
      .then(result => {
        if (url.pathname === MAIL_RULE_SAVE_PATH) { const { kind, ...rest } = result; send({ state: kind, ...rest }); return; }
        if (url.pathname === MAIL_RULE_REFRESH_PATH) { send({ state: result.status === 'ok' ? 'ready' : 'refresh_partial', refresh: result }); return; }
        send({ state: 'ready', result });
      }, error => sendWriteRouteError(res, send, error));
  }); };
  return { name: 'operations-mail-rule-read-only', configureServer: configure, configurePreviewServer: configure };
}

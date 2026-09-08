// Metadata-only consumer. Never constructs the worker, renews its clock, or reads
// model request/exchange and validator output files.
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readRuntimeJson, readRuntimeBytes, runtimeOrdinary, runtimeInside,
  runtimeHash as hash, runtimeRef as ref, runtimeCheck as check } from './feedback_runtime_io.mjs';

export const readboxHash = value => hash(JSON.stringify(sort(value)));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
}
export const readboxPin = value => value && typeof value.path === 'string' && /^[a-f0-9]{64}$/u.test(value.sha256);
const evidenceRef = value => typeof value === 'string' && /^feedback\.(?:report|run-result|manager-notice)\.[a-f0-9]{32}$/u.test(value);
const states = new Set(['running', 'execution_unknown', 'held_internal', 'candidate_reported']);
const health = new Set(['HEALTHY', 'EXECUTION_UNKNOWN', 'EXECUTION_OVERDUE', 'TICK_STALE', 'NEVER_STARTED', 'SOURCE_UNAVAILABLE']);
const iso = value => { check(Number.isFinite(Date.parse(value)), 'FEEDBACK_READBOX_RECORD_INVALID'); return new Date(value).toISOString(); };

export async function openFeedbackReadbox({ configPath, configSha256 }) {
  check(/^[a-f0-9]{64}$/u.test(configSha256), 'FEEDBACK_READBOX_PIN_REQUIRED');
  const config = await readRuntimeJson({ path: configPath, sha256: configSha256 });
  check(config.version === 1 && ref(config.project_id) && readboxPin(config.runtime_deployment)
    && config.access_current?.sha256 === null, 'FEEDBACK_READBOX_CONFIG_INVALID');
  const deployment = await readRuntimeJson(config.runtime_deployment);
  const binding = deployment.linear?.expectedBinding;
  check(deployment.enabled === true && ref(binding?.project_scope_ref) && ref(binding.project_code)
    && ref(binding.organization_id), 'FEEDBACK_READBOX_DEPLOYMENT_INVALID');
  check(Array.isArray(deployment.runner?.allowedFiles) && deployment.runner.allowedFiles.every(file => typeof file === 'string'
    && !/^(?:guild_hall\/dev_worker\/feedback_(?:readbox|dispatch|buzz_bridge)|ui-workspace\/apps\/dev-erp\/src\/feedback_readbox)/u.test(file.replaceAll('\\', '/').toLowerCase())),
  'FEEDBACK_READBOX_SELF_EDIT_FORBIDDEN');
  const roots = [deployment.controlRoot, deployment.evidenceRoot];
  for (const root of roots) await runtimeOrdinary(root, true);
  check(!runtimeInside(roots[0], roots[1]) && !runtimeInside(roots[1], roots[0]), 'FEEDBACK_READBOX_ROOT_OVERLAP');
  for (const authority of [configPath, config.runtime_deployment.path, config.access_current.path])
    check(roots.every(root => !runtimeInside(root, authority)), 'FEEDBACK_READBOX_AUTHORITY_WRITABLE');
  const controlPath = path.join(deployment.controlRoot, 'feedback.sqlite');
  const controlDigest = hash({ scope_ref: binding.project_scope_ref, organization_id: binding.organization_id,
    repository: path.resolve(deployment.runner.repoRoot) });
  async function dbRead(file, action) {
    await runtimeOrdinary(file);
    const db = new DatabaseSync(file, { readOnly: true });
    try { db.exec('PRAGMA busy_timeout=100'); return action(db); } finally { db.close(); }
  }
  async function assertCurrent() {
    await readRuntimeJson({ path: configPath, sha256: configSha256 });
    await readRuntimeJson(config.runtime_deployment);
    await dbRead(controlPath, db => check(db.prepare('SELECT digest FROM dev_feedback_runtime_binding WHERE id=1').get()?.digest === controlDigest,
      'FEEDBACK_READBOX_SCOPE_MISMATCH'));
  }
  async function authorize(access, service = false) {
    await assertCurrent();
    const current = await readRuntimeJson(config.access_current);
    const now = Date.now();
    check(current.project_id === config.project_id && current.scope_ref === binding.project_scope_ref
      && current.active === true && Date.parse(current.issued_at) <= now && Date.parse(current.expires_at) > now
      && now - Date.parse(current.observed_at) >= 0 && now - Date.parse(current.observed_at) <= 300000,
    'FEEDBACK_READBOX_ACCESS_REQUIRED');
    if (service) check(current.dispatch_enabled === true && current.dispatch_service_ref === config.dispatch_service_ref,
      'FEEDBACK_READBOX_ACCESS_REQUIRED');
    else {
      check(access && await access.checkSession?.() === true, 'FEEDBACK_READBOX_AUTH_REQUIRED');
      check(Array.isArray(current.manager_account_ids) && current.manager_account_ids.includes(access.accountId)
        && await access.canAccessProject?.(config.project_id) === true, 'FEEDBACK_READBOX_ACCESS_REQUIRED');
      check(await access.checkSession() === true, 'FEEDBACK_READBOX_AUTH_REQUIRED');
    }
    return current;
  }
  const watchPath = path.join(deployment.controlRoot, 'feedback-watchdog.sqlite');
  const watchRead = (action, fallback) => dbRead(watchPath, action).catch(error => { if (error.code === 'ENOENT') return fallback; throw error; });
  const scopedRun = (db, row) => !row ? null : { ...row, _scope: db.prepare(
    'SELECT scope_ref FROM dev_feedback_revision WHERE source_ref=? AND semantic_sha256=?').get(row.source_ref, row.semantic_sha256)?.scope_ref ?? null };
  const encode = cursor => Buffer.from(JSON.stringify(cursor)).toString('base64url');
  async function position(token) {
    if (token != null) {
      check(typeof token === 'string' && /^[A-Za-z0-9_-]{1,1024}$/u.test(token), 'FEEDBACK_READBOX_CURSOR_INVALID');
      let value; try { value = JSON.parse(Buffer.from(token, 'base64url')); } catch { check(false, 'FEEDBACK_READBOX_CURSOR_INVALID'); }
      check(Object.keys(value ?? {}).sort().join(',') === 'notice,notice_high,run,run_high,scope,v'
        && value.v === 1 && value.scope === controlDigest
        && ['run', 'notice', 'run_high', 'notice_high'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
        && value.run <= value.run_high && value.notice <= value.notice_high, 'FEEDBACK_READBOX_CURSOR_INVALID');
      return value;
    }
    return { v: 1, scope: controlDigest, run: 0, notice: 0,
      run_high: await dbRead(controlPath, db => db.prepare('SELECT rowid AS n FROM dev_feedback_run ORDER BY rowid DESC LIMIT 1').get()?.n ?? 0),
      notice_high: await watchRead(db => db.prepare('SELECT revision AS n FROM dev_feedback_watch_notice ORDER BY revision DESC LIMIT 1').get()?.n ?? 0, 0) };
  }
  // Seek on existing rowid/INTEGER PRIMARY KEY indexes, then exact revision PK
  // joins. No COUNT, OFFSET, history-wide predicate, sort, or producer migration.
  async function sources(cursor, limit) {
    const runPending = cursor.run < cursor.run_high, noticePending = cursor.notice < cursor.notice_high;
    const runLimit = runPending ? noticePending ? Math.floor(limit / 2) : limit : 0;
    const noticeLimit = noticePending ? runPending ? limit - runLimit : limit : 0;
    const rows = runLimit ? await dbRead(controlPath, db => db.prepare(
      'SELECT rowid AS _seek,* FROM dev_feedback_run WHERE rowid>? AND rowid<=? ORDER BY rowid LIMIT ?')
      .all(cursor.run, cursor.run_high, runLimit).map(row => scopedRun(db, row))) : [];
    const notices = noticeLimit ? await watchRead(db => db.prepare(
      'SELECT * FROM dev_feedback_watch_notice WHERE revision>? AND revision<=? ORDER BY revision LIMIT ?')
      .all(cursor.notice, cursor.notice_high, noticeLimit), []) : [];
    const next = { ...cursor,
      run: runLimit ? rows.length < runLimit ? cursor.run_high : rows.at(-1)._seek : cursor.run,
      notice: noticeLimit ? notices.length < noticeLimit ? cursor.notice_high : notices.at(-1).revision : cursor.notice };
    return { rows, notices, next };
  }
  async function exactSources(query) {
    const stored = await record(query.ref);
    check(stored.sha256 === query.sha256, 'FEEDBACK_READBOX_PIN_CHANGED');
    if (query.ref.startsWith('feedback.manager-notice.')) {
      if (query.locator !== undefined) check(/^n:[1-9][0-9]{0,15}$/u.test(query.locator)
        && Number.isSafeInteger(Number(query.locator.slice(2))), 'FEEDBACK_READBOX_LOCATOR_INVALID');
      // Compatibility for old small-list callers; new list/CLI consumers carry
      // the locator. It is only a seek hint, never authorization or evidence.
      const notices = await watchRead(db => query.locator
        ? [db.prepare('SELECT * FROM dev_feedback_watch_notice WHERE revision=?').get(Number(query.locator.slice(2)))].filter(Boolean)
        : db.prepare('SELECT * FROM dev_feedback_watch_notice ORDER BY revision DESC LIMIT 100').all(), []);
      const row = notices.find(row => row.receipt_ref === query.ref && row.notice_ref === stored.body.notice?.notice_ref);
      check(row, query.locator ? 'FEEDBACK_READBOX_RECORD_NOT_FOUND' : 'FEEDBACK_READBOX_LOCATOR_REQUIRED');
      return { rows: [], notices: [row] };
    }
    const runRef = stored.body.run_ref ?? stored.body.result?.run_ref;
    check(ref(runRef), 'FEEDBACK_READBOX_RECORD_INVALID');
    const row = await dbRead(controlPath, db => scopedRun(db, db.prepare('SELECT rowid AS _seek,* FROM dev_feedback_run WHERE run_ref=?').get(runRef)));
    check(row && row._scope === binding.project_scope_ref, 'FEEDBACK_READBOX_RECORD_NOT_FOUND');
    check(query.locator === undefined || query.locator === `r:${row._seek}`, 'FEEDBACK_READBOX_LOCATOR_INVALID');
    return { rows: [row], notices: [] };
  }
  async function record(reference) {
    check(evidenceRef(reference), 'FEEDBACK_READBOX_RECORD_NOT_FOUND');
    const bytes = await readRuntimeBytes(path.join(deployment.evidenceRoot, `${reference}.json`), null, 2000000);
    return { body: JSON.parse(bytes), sha256: hash(bytes) };
  }
  async function checkNoticeRuns(runRefs) {
    await dbRead(controlPath, db => check(runRefs.every(run => {
      const found = db.prepare(`SELECT v.scope_ref FROM dev_feedback_run r JOIN dev_feedback_revision v
        ON r.source_ref=v.source_ref AND r.semantic_sha256=v.semantic_sha256 WHERE r.run_ref=?`).get(run);
      return found?.scope_ref === binding.project_scope_ref;
    }), 'FEEDBACK_READBOX_SCOPE_MISMATCH'));
  }
  async function entries(source, budget, noticeRuns) {
    const result = [];
    for (const row of source.rows) {
      budget();
      if (row._scope !== binding.project_scope_ref) continue;
      check(ref(row.run_ref) && states.has(row.state), 'FEEDBACK_READBOX_RECORD_INVALID');
      const reference = row.report_ref ?? `feedback.run-result.${hash(row.run_ref).slice(0, 32)}`;
      check(row.report_ref === null || row.report_ref === `feedback.report.${hash(row.run_ref).slice(0, 32)}`, 'FEEDBACK_READBOX_RECORD_INVALID');
      let stored;
      try { stored = await record(reference); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      const report = row.report_ref !== null, payload = report ? stored.body : stored.body.result;
      check(payload?.run_ref === row.run_ref && (report ? payload.source_ref === row.source_ref && payload.semantic_sha256 === row.semantic_sha256 : true),
        'FEEDBACK_READBOX_RECORD_INVALID');
      const reviewStatus = report && ['ACCEPT', 'REJECT', 'HOLD'].includes(stored.body.review?.status) ? stored.body.review.status
        : row.reason === 'FEEDBACK_REVIEW_REQUIRED' ? 'NOT_ACCEPTED' : 'UNKNOWN';
      result.push({ ref: reference, sha256: stored.sha256, kind: 'result',
        locator: `r:${row._seek}`, event_key: `run.${hash([row.run_ref, row.state]).slice(0, 32)}`, state: row.state, run_ref: row.run_ref,
        reason: typeof row.reason === 'string' && /^FEEDBACK_[A-Z0-9_]{1,100}$/u.test(row.reason) ? row.reason : null,
        observed_at: iso(row.finished_at ?? row.started_at), review: { status: reviewStatus, ref: ref(row.review_ref) ? row.review_ref : null },
        evidence_refs: [{ ref: reference, sha256: stored.sha256 }], local_recorded: true,
        buzz_delivery: 'NOT_OBSERVED', human_acceptance: 'UNKNOWN', official_done: false, owner_decision_required: false });
    }
    for (const row of source.notices) {
      budget();
      if (row.receipt_ref === null) continue;
      check(ref(row.notice_ref) && row.receipt_ref === `feedback.manager-notice.${hash(row.notice_ref).slice(0, 32)}`, 'FEEDBACK_READBOX_RECORD_INVALID');
      const stored = await record(row.receipt_ref), notice = stored.body.notice;
      check(stored.body.target === 'local_manager_readbox' && stored.body.transport === 'local_file'
        && notice?.notice_ref === row.notice_ref && health.has(notice.status) && notice.owner_decision_required === false
        && Array.isArray(notice.run_refs) && notice.run_refs.length <= 20 && notice.run_refs.every(ref), 'FEEDBACK_READBOX_RECORD_INVALID');
      noticeRuns.push(...notice.run_refs);
      await checkNoticeRuns(notice.run_refs);
      result.push({ ref: row.receipt_ref, sha256: stored.sha256, kind: 'manager_notice', event_key: notice.notice_ref,
        locator: `n:${row.revision}`,
        state: notice.status, run_ref: null, reason: null, observed_at: new Date(row.last_attempt_at).toISOString(),
        review: { status: 'NOT_APPLICABLE', ref: null }, evidence_refs: [{ ref: row.receipt_ref, sha256: stored.sha256 }],
        local_recorded: true, buzz_delivery: 'NOT_OBSERVED', human_acceptance: 'UNKNOWN', official_done: false, owner_decision_required: false });
    }
    return result.sort((a, b) => b.observed_at.localeCompare(a.observed_at) || a.ref.localeCompare(b.ref));
  }
  async function readPage(query, access, service, detail, budget) {
    await authorize(access, service);
    budget();
    check(detail || Number.isInteger(query.limit) && query.limit > 0 && query.limit <= 100, 'FEEDBACK_READBOX_QUERY_INVALID');
    const cursor = detail ? null : await position(query.cursor);
    const select = () => detail ? exactSources(query) : sources(cursor, query.limit);
    const source = await select(), noticeRuns = [], items = await entries(source, budget, noticeRuns);
    budget();
    check(hash(await select()) === hash(source), 'FEEDBACK_READBOX_SOURCE_CHANGED');
    // Pin readback also covers immutable evidence replacement during the batch.
    for (const item of items) { budget(); await readRuntimeBytes(path.join(deployment.evidenceRoot, `${item.ref}.json`), item.sha256, 2000000); }
    if (noticeRuns.length) await checkNoticeRuns(noticeRuns);
    await authorize(access, service);
    budget();
    if (detail) {
      const item = items.find(item => item.ref === query.ref);
      check(item, 'FEEDBACK_READBOX_RECORD_NOT_FOUND');
      check(item.sha256 === query.sha256, 'FEEDBACK_READBOX_PIN_CHANGED');
      return { project_id: config.project_id, ...item };
    }
    const has_more = source.next.run < cursor.run_high || source.next.notice < cursor.notice_high;
    return { state: 'CURRENT', project_id: config.project_id, items, has_more, next_cursor: has_more ? encode(source.next) : null };
  }
  async function read(query, access, service, detail) {
    let timedOut = false, timer;
    const deadline = Date.now() + 5000;
    const budget = () => check(!timedOut && Date.now() < deadline, 'FEEDBACK_READBOX_READ_BUDGET');
    try { return await Promise.race([readPage(query, access, service, detail, budget), new Promise((_, reject) => {
      timer = setTimeout(() => { timedOut = true; reject(Object.assign(new Error('FEEDBACK_READBOX_READ_BUDGET'), { feedbackCode: 'FEEDBACK_READBOX_READ_BUDGET' })); }, 5000);
    })]); } finally { clearTimeout(timer); }
  }
  await assertCurrent();
  return Object.freeze({ config, deployment, authorizeService: () => authorize(null, true),
    snapshot: (query, access) => read(query, access, false, false), detail: (query, access) => read(query, access, false, true),
    serviceSnapshot: (query = { limit: 20 }) => read(query, null, true, false),
    serviceDetail: query => read(query, null, true, true) });
}

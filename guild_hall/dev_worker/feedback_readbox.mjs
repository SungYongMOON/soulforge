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
    try { db.exec('PRAGMA busy_timeout=1000'); return action(db); } finally { db.close(); }
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
  async function sources() {
    const rows = await dbRead(controlPath, db => db.prepare(`SELECT r.* FROM dev_feedback_run r JOIN dev_feedback_revision v
      ON r.source_ref=v.source_ref AND r.semantic_sha256=v.semantic_sha256 WHERE v.scope_ref=? ORDER BY r.started_at DESC LIMIT 1001`).all(binding.project_scope_ref));
    check(rows.length <= 1000, 'FEEDBACK_READBOX_HISTORY_LIMIT');
    const notices = await dbRead(path.join(deployment.controlRoot, 'feedback-watchdog.sqlite'), db => db.prepare(
      'SELECT * FROM dev_feedback_watch_notice WHERE receipt_ref IS NOT NULL ORDER BY revision DESC LIMIT 1001').all())
      .catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    check(notices.length <= 1000, 'FEEDBACK_READBOX_HISTORY_LIMIT');
    return { rows, notices };
  }
  async function record(reference) {
    check(evidenceRef(reference), 'FEEDBACK_READBOX_RECORD_NOT_FOUND');
    const bytes = await readRuntimeBytes(path.join(deployment.evidenceRoot, `${reference}.json`), null, 2000000);
    return { body: JSON.parse(bytes), sha256: hash(bytes) };
  }
  async function entries(source) {
    const result = [];
    for (const row of source.rows) {
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
        event_key: `run.${hash([row.run_ref, row.state]).slice(0, 32)}`, state: row.state, run_ref: row.run_ref,
        reason: typeof row.reason === 'string' && /^FEEDBACK_[A-Z0-9_]{1,100}$/u.test(row.reason) ? row.reason : null,
        observed_at: iso(row.finished_at ?? row.started_at), review: { status: reviewStatus, ref: ref(row.review_ref) ? row.review_ref : null },
        evidence_refs: [{ ref: reference, sha256: stored.sha256 }], local_recorded: true,
        buzz_delivery: 'NOT_OBSERVED', human_acceptance: 'UNKNOWN', official_done: false, owner_decision_required: false });
    }
    for (const row of source.notices) {
      check(ref(row.notice_ref) && row.receipt_ref === `feedback.manager-notice.${hash(row.notice_ref).slice(0, 32)}`, 'FEEDBACK_READBOX_RECORD_INVALID');
      const stored = await record(row.receipt_ref), notice = stored.body.notice;
      check(stored.body.target === 'local_manager_readbox' && stored.body.transport === 'local_file'
        && notice?.notice_ref === row.notice_ref && health.has(notice.status) && notice.owner_decision_required === false
        && Array.isArray(notice.run_refs) && notice.run_refs.length <= 20 && notice.run_refs.every(ref), 'FEEDBACK_READBOX_RECORD_INVALID');
      check(notice.run_refs.every(run => source.rows.some(row => row.run_ref === run)), 'FEEDBACK_READBOX_SCOPE_MISMATCH');
      result.push({ ref: row.receipt_ref, sha256: stored.sha256, kind: 'manager_notice', event_key: notice.notice_ref,
        state: notice.status, run_ref: null, reason: null, observed_at: new Date(row.last_attempt_at).toISOString(),
        review: { status: 'NOT_APPLICABLE', ref: null }, evidence_refs: [{ ref: row.receipt_ref, sha256: stored.sha256 }],
        local_recorded: true, buzz_delivery: 'NOT_OBSERVED', human_acceptance: 'UNKNOWN', official_done: false, owner_decision_required: false });
    }
    return result.sort((a, b) => b.observed_at.localeCompare(a.observed_at) || a.ref.localeCompare(b.ref));
  }
  async function read(query, access, service, detail) {
    await authorize(access, service);
    check(detail || Number.isInteger(query.limit) && query.limit > 0 && query.limit <= (service ? 2000 : 100), 'FEEDBACK_READBOX_QUERY_INVALID');
    const source = await sources(), items = await entries(source);
    check(hash(await sources()) === hash(source), 'FEEDBACK_READBOX_SOURCE_CHANGED');
    // Pin readback also covers immutable evidence replacement during the batch.
    for (const item of items) await readRuntimeBytes(path.join(deployment.evidenceRoot, `${item.ref}.json`), item.sha256, 2000000);
    await authorize(access, service);
    if (detail) {
      const item = items.find(item => item.ref === query.ref);
      check(item, 'FEEDBACK_READBOX_RECORD_NOT_FOUND');
      check(item.sha256 === query.sha256, 'FEEDBACK_READBOX_PIN_CHANGED');
      return { project_id: config.project_id, ...item };
    }
    return { state: 'CURRENT', project_id: config.project_id, items: items.slice(0, query.limit), has_more: items.length > query.limit };
  }
  await assertCurrent();
  return Object.freeze({ config, deployment, authorizeService: () => authorize(null, true),
    snapshot: (query, access) => read(query, access, false, false), detail: (query, access) => read(query, access, false, true),
    serviceSnapshot: (query = { limit: 2000 }) => read(query, null, true, false),
    serviceDetail: query => read(query, null, true, true) });
}

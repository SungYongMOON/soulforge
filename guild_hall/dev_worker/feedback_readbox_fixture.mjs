// Synthetic filesystem/SQLite fixture only. No runtime, model or delivery runs.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
export async function createReadboxFixture(baseRoot = null, moduleRoot = null) {
  const root = baseRoot ? await fs.mkdtemp(path.join(baseRoot, 'feedback-readbox-')) : await fs.mkdtemp(path.join(os.tmpdir(), 'feedback-readbox-'));
  const repoModules = moduleRoot ?? sourceRoot;
  const load = name => import(pathToFileURL(path.join(repoModules, 'guild_hall/dev_worker', name)).href);
  const [{ writeRuntimeEvidence }, { openFeedbackReadbox }] = await Promise.all([
    load('feedback_runtime_io.mjs'), load('feedback_readbox.mjs')]);
  const paths = Object.fromEntries(['control', 'evidence', 'delivery', 'config', 'repo'].map(name => [name, path.join(root, name)]));
  await Promise.all(Object.values(paths).map(value => fs.mkdir(value, { recursive: true })));
  Object.assign(paths, { current: path.join(paths.config, 'access-current.json'), routeCurrent: path.join(paths.config, 'route-current.json'),
    policy: path.join(paths.config, 'policy.json'), catalog: path.join(paths.config, 'catalog.json'), bindings: path.join(paths.config, 'bindings.json'),
    workerDb: path.join(paths.control, 'feedback.sqlite'), watchDb: path.join(paths.control, 'feedback-watchdog.sqlite'),
    deployment: path.join(paths.config, 'deployment.json'), readbox: path.join(paths.config, 'readbox.json') });
  const save = async (file, value) => { const bytes = JSON.stringify(value); await fs.writeFile(file, bytes); return { path: file, sha256: hash(bytes) }; };
  const now = Date.now(), issued = new Date(now - 60000).toISOString(), observed = new Date(now - 1000).toISOString(), expires = new Date(now + 600000).toISOString();
  const project = 'SYN', scope = 'project:SYN', manager = 'manager.synthetic';
  const deployment = { enabled: true, mode: 'synthetic_rehearsal', controlRoot: paths.control, evidenceRoot: paths.evidence,
    linear: { expectedBinding: { project_scope_ref: scope, project_code: project, organization_id: 'organization.synthetic' } },
    runner: { repoRoot: paths.repo, allowedFiles: [] } };
  const current = { project_id: project, scope_ref: scope, active: true, issued_at: issued, observed_at: observed, expires_at: expires,
    manager_account_ids: [manager], dispatch_enabled: true, dispatch_service_ref: 'service.synthetic' };
  const policy = { version: 1, approved: true, project_ref: project, purpose: 'manager_feedback_notice', service_ref: current.dispatch_service_ref,
    manager_route_id: 'SYNTHETIC_PROJECT_1', profile_ref: 'profile.synthetic', bot_chat_id: 'chat.synthetic', sender_ref: 'sender.synthetic',
    issued_at: issued, expires_at: expires };
  const route = (id, branch, extra = {}) => ({ route_id: id, branch_id: branch, display_name: id,
    scope: { kind: branch === 'projects' ? 'project' : 'function', responsibility_terms: [id + '_RESPONSIBILITY'] },
    aliases: [id + '_ALIAS'], project_code: branch === 'projects' ? id + '_CODE' : null, owner_role: id + '_OWNER',
    manager_route_id: null, escalation_route_id: null, request_examples: [id + '_REQUEST'], do_not_route: [], lifecycle: { state: 'active' },
    capability_classes: ['synthetic_coordination', 'synthetic_execution'], ...extra });
  const catalog = { schema_version: 'soulforge.codex_work_route_catalog.v1', catalog_revision: 'SYNTHETIC_REVISION_1', navigation_authority: 'none',
    branches: ['common', 'projects', 'ax_development', 'erp_development', 'system_development'].map((id, index) => ({ branch_id: id,
      display_name: ['COMMON', 'PROJECTS', 'AX DEVELOPMENT', 'ERP DEVELOPMENT', 'SYSTEM DEVELOPMENT'][index], parent_branch_id: null, navigation_authority: 'none' })),
    routes: [route('SYNTHETIC_COMMON', 'common'), ...Array.from({ length: 8 }, (_, index) => route(`SYNTHETIC_PROJECT_${index + 1}`, 'projects', index === 0 ? { project_code: project } : {})),
      route('SYNTHETIC_AX_ROOT', 'ax_development'), ...Array.from({ length: 5 }, (_, index) => route(`SYNTHETIC_AX_OWNER_${index + 1}`, 'ax_development', { manager_route_id: 'SYNTHETIC_AX_ROOT' })),
      route('SYNTHETIC_ERP', 'erp_development'), route('SYNTHETIC_SYSTEM', 'system_development')] };
  const binding = (id, resource = id + '_RESOURCE', capability = 'synthetic_execution') => ({ binding_id: id, capability_class: capability,
    provider_identifier: 'SYNTHETIC_PROVIDER', resource_identifier: resource });
  const bindings = { schema_version: 'soulforge.codex_work_live_bindings.v1', catalog_schema_version: catalog.schema_version, catalog_revision: catalog.catalog_revision,
    bindings: [{ route_id: policy.manager_route_id,
      durable_coordination_binding: { ...binding('SYNTHETIC_COORDINATION', policy.bot_chat_id, 'synthetic_coordination'), resource_title: 'SYNTHETIC_TITLE', host_identifier: 'SYNTHETIC_HOST', thread_identifier: 'SYNTHETIC_THREAD' },
      preferred_execution_surface: binding('SYNTHETIC_SURFACE'), runtime_agent: binding('SYNTHETIC_AGENT', policy.profile_ref),
      runtime_session: binding('SYNTHETIC_SESSION'), worktree_binding: binding('SYNTHETIC_WORKTREE'), fallback_bindings: [], validator_bindings: [],
      observed_status: 'SYNTHETIC_OBSERVED', verified_at_kst: new Date(now - 1000 + 9 * 3600000).toISOString().replace('Z', '+09:00'), source_kind: 'synthetic_manual_observation', binding_state: 'active',
      prior_resource_history_pointer: null, prior_thread_history_pointer: null, bridge_state: 'active', execution_ready: true }] };
  const routeCurrent = { active: true, project_ref: project, observed_at: observed, expires_at: expires,
    policy_sha256: (await save(paths.policy, policy)).sha256, catalog: await save(paths.catalog, catalog), bindings: await save(paths.bindings, bindings) };
  await save(paths.current, current); await save(paths.routeCurrent, routeCurrent);
  const config = { version: 1, project_id: project, runtime_deployment: await save(paths.deployment, deployment),
    access_current: { path: paths.current, sha256: null }, dispatch_service_ref: current.dispatch_service_ref,
    delivery: { policy: { path: paths.policy, sha256: routeCurrent.policy_sha256 }, route_current: { path: paths.routeCurrent, sha256: null },
      state_root: paths.delivery, native_origin: 'http://127.0.0.1:47899' } };
  let descriptor = await save(paths.readbox, config);
  const worker = new DatabaseSync(paths.workerDb), watch = new DatabaseSync(paths.watchDb);
  // Match the producer's durable tables without loading its execution/model ports.
  worker.exec(`CREATE TABLE dev_feedback_revision (source_ref TEXT NOT NULL,semantic_sha256 TEXT NOT NULL,source_revision TEXT NOT NULL,
    kind TEXT NOT NULL,scope_ref TEXT NOT NULL,revision_no INTEGER NOT NULL,current INTEGER NOT NULL,status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,observed_at TEXT NOT NULL,PRIMARY KEY(source_ref,semantic_sha256));
    CREATE TABLE dev_feedback_run (run_ref TEXT PRIMARY KEY,source_ref TEXT NOT NULL,semantic_sha256 TEXT NOT NULL,
    instance_ref TEXT NOT NULL,fence INTEGER NOT NULL,state TEXT NOT NULL,started_at TEXT NOT NULL,deadline_at TEXT NOT NULL,
    finished_at TEXT,packet_sha256 TEXT,candidate_ref TEXT,validation_ref TEXT,review_ref TEXT,report_ref TEXT,reason TEXT);
    CREATE TABLE dev_feedback_clock (id INTEGER PRIMARY KEY CHECK(id=1),last_tick TEXT NOT NULL);`);
  watch.exec(`CREATE TABLE dev_feedback_watch (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,fingerprint TEXT NOT NULL,status TEXT NOT NULL,observed_at INTEGER NOT NULL);
    CREATE TABLE dev_feedback_watch_notice (revision INTEGER PRIMARY KEY,notice_ref TEXT NOT NULL,status TEXT NOT NULL,
    attempts INTEGER NOT NULL,last_attempt_at INTEGER,receipt_ref TEXT);`);
  worker.exec('CREATE TABLE dev_feedback_runtime_binding (id INTEGER PRIMARY KEY CHECK(id=1), digest TEXT NOT NULL)');
  worker.prepare('INSERT INTO dev_feedback_runtime_binding VALUES(1,?)').run(hash({ scope_ref: scope, organization_id: 'organization.synthetic', repository: path.resolve(paths.repo) }));
  worker.prepare('INSERT INTO dev_feedback_clock VALUES(1,?)').run(observed);
  const rawSentinel = 'SYNTHETIC_RAW_MODEL_BODY_MUST_NOT_LEAK';
  const runRef = 'feedback.run.synthetic', heldRunRef = 'feedback.run.held', sourceRef = 'linear.issue.synthetic', semanticSha256 = 'a'.repeat(64);
  const report = await writeRuntimeEvidence(paths.evidence, 'report', runRef, { run_ref: runRef, source_ref: sourceRef, semantic_sha256: semanticSha256,
    status: 'candidate_reported', candidate_ref: 'candidate.synthetic', validation_ref: 'validation.synthetic', review_ref: 'review.synthetic',
    candidate: { candidate_ref: 'candidate.synthetic' }, validation: { status: 'PASS', validation_ref: 'validation.synthetic', evidence: [{ stdout: rawSentinel }] },
    review: { status: 'ACCEPT', review_ref: 'review.synthetic', summary: rawSentinel }, model_input: rawSentinel, raw_stdout: rawSentinel,
    model_requests: [{ path: 'unopened-model-file.json', body: rawSentinel }], model_evidence: [], transport: 'local_file',
    execution_mode: 'synthetic_rehearsal', model_evidence_kind: 'synthetic_role_verdicts', instance_ref: 'instance.synthetic',
    official_done: false, canonical_accepted: false });
  const result = await writeRuntimeEvidence(paths.evidence, 'run-result', heldRunRef, { result: { run_ref: heldRunRef, status: 'HELD_INTERNAL' }, runner: { stdout: rawSentinel } });
  worker.prepare('INSERT INTO dev_feedback_revision VALUES(?,?,?,?,?,?,?,?,?,?)').run(sourceRef, semanticSha256, 'revision.synthetic', 'improvement', scope, 1, 1, 'candidate_reported', 1, issued);
  const insertRun = worker.prepare('INSERT INTO dev_feedback_run VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  insertRun.run(runRef, sourceRef, semanticSha256, 'instance.synthetic', 1, 'candidate_reported', issued, expires, observed, 'b'.repeat(64), 'candidate.synthetic', 'validation.synthetic', 'review.synthetic', report.ref, null);
  insertRun.run(heldRunRef, sourceRef, semanticSha256, 'instance.synthetic', 2, 'held_internal', issued, expires, observed, 'c'.repeat(64), null, null, null, null, 'FEEDBACK_REVIEW_REQUIRED');
  const noticeRef = 'feedback.notice.synthetic';
  const notice = await writeRuntimeEvidence(paths.evidence, 'manager-notice', noticeRef, { target: 'local_manager_readbox', transport: 'local_file',
    notice: { notice_ref: noticeRef, status: 'TICK_STALE', run_refs: [runRef, heldRunRef], owner_decision_required: false, text: rawSentinel } });
  watch.prepare('INSERT INTO dev_feedback_watch VALUES(1,?,?,?,?)').run(1, hash({ status: 'TICK_STALE', run_refs: [runRef, heldRunRef] }), 'TICK_STALE', now);
  watch.prepare('INSERT INTO dev_feedback_watch_notice VALUES(?,?,?,?,?,?)').run(1, noticeRef, 'delivered', 1, now, notice.ref);
  worker.close(); watch.close();
  const accessState = { session: true, project: true };
  const access = { accountId: manager, checkSession: async () => accessState.session, canAccessProject: async value => accessState.project && value === project };
  return { root, moduleRoot: repoModules, paths, config, deployment, current, accessCurrent: current, policy, routeCurrent, catalog, bindings,
    access, accessState, pins: { report, result, notice }, rawSentinel, runRef, heldRunRef, sourceRef, semanticSha256, save,
    control: paths.control, evidence: paths.evidence, configPath: paths.readbox,
    get configSha256() { return descriptor.sha256; }, get options() { return { configPath: descriptor.path, configSha256: descriptor.sha256 }; },
    async writeCurrent(patch = {}) { Object.assign(current, patch); return save(paths.current, current); },
    async writeRouteCurrent(patch = {}) { Object.assign(routeCurrent, patch); return save(paths.routeCurrent, routeCurrent); },
    async reseal() { config.runtime_deployment = await save(paths.deployment, deployment); config.delivery.policy = await save(paths.policy, policy);
      routeCurrent.policy_sha256 = config.delivery.policy.sha256; routeCurrent.catalog = await save(paths.catalog, catalog); routeCurrent.bindings = await save(paths.bindings, bindings);
      await save(paths.routeCurrent, routeCurrent); descriptor = await save(paths.readbox, config); return { configPath: descriptor.path, configSha256: descriptor.sha256 }; },
    async resealConfig() { return this.reseal(); },
    open() { return openFeedbackReadbox({ configPath: descriptor.path, configSha256: descriptor.sha256 }); },
    async close() { const resolved = await fs.realpath(root), parent = await fs.realpath(path.dirname(root));
      if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('feedback-readbox-')) throw new Error('synthetic_cleanup_scope');
      await fs.rm(resolved, { recursive: true, force: true }); },
  };
}

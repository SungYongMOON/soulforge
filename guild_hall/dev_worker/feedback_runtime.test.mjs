import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { openFeedbackRuntime, loadFeedbackDeployment } from './feedback_runtime.mjs';
import { createFeedbackRuntimeIssuer } from './feedback_runtime_source.mjs';
import { stageFeedbackRuntime, verifyFeedbackRuntimeStage } from './feedback_runtime_stage.mjs';
import { runtimeHash as hash } from './feedback_runtime_io.mjs';
import { sha256Canonical } from '../shared/project_history_envelope.mjs';
import { computeUnverifiedAgentApprovalClaimDigest, AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA, AGENT_AUTHORITY_CURRENT_STATE_SCHEMA } from '../agent_observation/agent_authority_verification.mjs';
import { runReceiptObjectKinds } from '../linear_history/linear_collect_receipt.mjs';
import { identityDigestForBinding, readEvidenceRecordForIssue, taskStatusTokenForWorkflowState } from '../linear_history/linear_collect_runner.mjs';
import { startFeedbackCurrentnessServer } from '../secure_work/feedback_currentness_transport.mjs';
import { readOperationsForReceiptVersion } from '../linear_history/linear_graphql_client.mjs';

const CLI = fileURLToPath(new URL('./feedback_runtime_cli.mjs', import.meta.url));
const WRAPPER = 'guild_hall/dev_worker/feedback_runtime_validator.mjs';
const gitExe = process.platform === 'win32' ? execFileSync('where.exe', ['git.exe'], { encoding: 'utf8' }).trim().split(/\r?\n/u)[0]
  : execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
const ISSUE = 'f8091a2b-3c4d-4859-aa6b-465768798a9b', SECOND = 'b8091a2b-3c4d-4859-aa6b-465768798a9b';
const SHA = `sha256:${'a'.repeat(64)}`;
const patch = 'diff --git a/src/value.mjs b/src/value.mjs\n--- a/src/value.mjs\n+++ b/src/value.mjs\n@@ -1 +1 @@\n-export const answer = 1;\n+export const answer = 2;\n';

test('authenticated currentness reaches the real issuer and sender revocation stops further work', {
  skip: process.platform !== 'win32' || !process.env.SOULFORGE_SECURE_WORK_TEST_PYTHON,
  timeout: 60000,
}, async t => {
  const f = await runtimeFixture(t), python = process.env.SOULFORGE_SECURE_WORK_TEST_PYTHON;
  let server, runtime;
  try {
  const src = fileURLToPath(new URL('../secure_work/src/soulforge_secure_work/', import.meta.url));
  const sid = execFileSync(python, ['-I', '-S', '-B', '-c',
    'import sys;sys.path.insert(0,sys.argv[1]);from ipc_pipe import current_sid;print(current_sid())', src],
    {encoding: 'utf8', windowsHide: true, timeout: 5000}).trim();
  const indexBytes = await fs.readFile(path.join(f.projections, 'current.json')), index = JSON.parse(indexBytes);
  const entry = index.projections[0], projection = JSON.parse(await fs.readFile(path.join(f.projections, entry.file)));
  const expected = {publisher_ref: 'sender:synthetic', producer_ref: index.producer_ref, scope_ref: index.scope_ref,
    issue_id: projection.issue_id, issue_content_sha256: projection.issue_content_sha256, body_sha256: entry.sha256,
    generation: index.generation, review_ref: 'review:synthetic', index_sha256: hash(indexBytes)};
  const transport = {pipe_name: `soulforge-secure-${hash(f.root).slice(0, 32)}`, server_sid: sid, client_sid: sid,
    python_executable: python, python_sha256: hash(readFileSync(python)),
    bridge_sha256: hash(readFileSync(path.join(src, 'feedback_currentness_pipe.py'))),
    ipc_pipe_sha256: hash(readFileSync(path.join(src, 'ipc_pipe.py'))), timeout_ms: 5000,
    valid_until: new Date(Date.now() + 120000).toISOString()};
  let active = true, requests = 0;
  server = await startFeedbackCurrentnessServer({binding: transport, assertCurrent: () => true,
    assertCurrentPublication: challenge => {
      requests++; if (!active) throw new Error('synthetic_review_revoked');
      return {...expected, challenge, observed_at: new Date().toISOString(),
        valid_until: transport.valid_until, execution_authority: false};
    }});
  const expectedPath = path.join(f.projections, 'currentness.json'); await save(expectedPath, expected);
  f.deployment.publicationCurrentness = {transport: await save(path.join(f.config, 'transport.json'), transport),
    expected: {path: expectedPath, mode: 'current_metadata'}};
  await f.reseal();
  runtime = await f.open();
  const first = await runtime.runOnce();
  assert.equal(first.status, 'CANDIDATE_REPORTED'); assert.ok(requests > 0); assert.equal(f.calls.length, 3);
  active = false; const modelCalls = f.calls.length;
  await assert.rejects(runtime.runOnce()); assert.equal(f.calls.length, modelCalls);
  active = true; const priorRequests = requests;
  await save(expectedPath, {...expected, body_sha256: '0'.repeat(64)});
  await assert.rejects(runtime.runOnce()); assert.equal(requests, priorRequests); assert.equal(f.calls.length, modelCalls);
  t.diagnostic('Synthetic same-user kernel channel + real issuer/cycle; actual SENDER/E14 and cross-SID installations are separate qualification.');
  } finally { await runtime?.close(); await server?.close(); }
});
async function save(file, value) { await fs.mkdir(path.dirname(file), { recursive: true }); const bytes = JSON.stringify(value); await fs.writeFile(file, bytes); return { path: file, sha256: hash(bytes) }; }

export async function runtimeFixture(t, { root: suppliedRoot = null, keep = false } = {}) {
  const root = suppliedRoot ?? await fs.mkdtemp(path.join(os.tmpdir(), 'feedback-runtime-'));
  const [repo, trees, evidence, control, projections, config] = ['repo', 'candidates', 'evidence', 'control', 'projections', 'config'].map(p => path.join(root, p));
  for (const p of [repo, trees, evidence, control, projections, config]) await fs.mkdir(p, { recursive: true });
  await fs.mkdir(path.join(repo, 'src')); await fs.mkdir(path.join(repo, 'checks')); await fs.mkdir(path.join(repo, path.dirname(WRAPPER)), { recursive: true });
  const validator = "import assert from 'node:assert/strict';\nimport {answer} from '../src/value.mjs';\nassert.equal(answer,2);\nconsole.log('checked public fixture answer=2');\n";
  const wrapper = await fs.readFile(fileURLToPath(new URL('./feedback_runtime_validator.mjs', import.meta.url)));
  await fs.writeFile(path.join(repo, 'src/value.mjs'), 'export const answer = 1;\n'); await fs.writeFile(path.join(repo, 'checks/answer.mjs'), validator);
  await fs.writeFile(path.join(repo, WRAPPER), wrapper);
  const git = args => execFileSync(gitExe, ['-c', 'core.hooksPath=' + (process.platform === 'win32' ? 'NUL' : '/dev/null'), ...args], { cwd: repo, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-q']); git(['add', '--', 'src/value.mjs', 'checks/answer.mjs', WRAPPER]);
  git(['-c', 'user.name=Synthetic Fixture', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'synthetic source']);
  const now = Date.now(), from = new Date(now - 60000).toISOString(), until = new Date(now + 600000).toISOString();
  const bindingFields = { lineage_digest: SHA, family_ref: 'family:G1', family_digest: SHA, mark_ref: 'mark:G1', mark_digest: SHA,
    deployment_ref: 'deployment:G1', deployment_digest: SHA, memory_generation_ref: 'memory:G1', memory_digest: SHA };
  const claim = { project_scope_ref: 'project:SYN', project_scope_refs: ['project:SYN'], ...bindingFields,
    authority_receipt_ref: 'approval:synthetic', authority_receipt_verified: false };
  const pin = { schema_version: AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA, pin_ref: 'pin:synthetic', verification_receipt_ref: 'verification:synthetic',
    owner_ref: 'owner:synthetic', authority_ref: 'authority:synthetic', verifier_ref: 'verifier:synthetic', project_scope_ref: 'project:SYN', ...bindingFields,
    approval_claim_digest: computeUnverifiedAgentApprovalClaimDigest(claim, 'project:SYN').claim_digest,
    authority_receipt_ref: claim.authority_receipt_ref, authority_receipt_digest: SHA, claim_ceiling: 'validated_private',
    issued_at: from, verified_at: from, expires_at: until, receipt_epoch: 1, trusted_authority_epoch: 1, revoked: false };
  const current = { schema_version: AGENT_AUTHORITY_CURRENT_STATE_SCHEMA, evaluation_ref: 'evaluation:current', evaluated_at: new Date(now).toISOString(),
    authority_ref: pin.authority_ref, current_authority_epoch: 1, revoked_pin_refs: [], claim_ceiling: 'validated_private' };
  const grant = { grant_ref: 'grant:standing-feedback', authority_ref: pin.authority_ref, authority_revision: 'authority:1', scope_ref: 'project:SYN',
    project_code: 'SYN', issuer_ref: 'issuer:synthetic', selection_authority: 'internal_feedback_source',
    actions: ['issue_request', 'observe', 'prepare', 'execute', 'validate', 'review', 'report', 'record_result', 'recover', 'retry'],
    allowed_kinds: ['bug', 'feature', 'improvement'], allowed_states: ['Todo', 'In Progress'], allowed_write_paths: ['src/value.mjs'],
    acceptance_checks: ['check.answer'], valid_from: from, valid_until: until, agent_group: 'G1', input_class: 'g2_public_code_projection',
    g2_leader_ref: 'leader:G2', maximum_issues: 16 };
  const workforce = { claim: await save(path.join(config, 'claim.json'), claim), pin: await save(path.join(config, 'pin.json'), pin),
    current: await save(path.join(config, 'current-authority.json'), current) };
  const custody = path.join(root, 'custody', 'synthetic-forge'), stateRoot = path.join(root, 'linear-state');
  const linearBinding = { lane_id: 'synthetic-linear', writer: { authority_id: 'synthetic-writer', epoch: 1 },
    workspace: { url_key: 'synthetic-forge', project_scope_map: [{ linear_project_id: 'project-1', project_scope_ref: 'project:SYN' }] } };
  const expectedBinding = { custody_root: custody, state_root: stateRoot, lane_id: linearBinding.lane_id, identity_digest: identityDigestForBinding(linearBinding),
    writer_authority_id: 'synthetic-writer', writer_epoch: 1, binding_sha256: SHA, workspace_url_key: 'synthetic-forge',
    organization_id: 'a8091a2b-3c4d-4859-aa6b-465768798a9b', project_scope_ref: 'project:SYN', project_code: 'SYN' };
  const issues = new Map([[ISSUE, { id: ISSUE, identifier: 'SYN-1', updated_at: new Date(now - 2000).toISOString(), state_name: 'Todo',
    project_id: 'project-1', title: 'Synthetic approved code request', creator_id: ISSUE }]]);
  const projectionOverrides = new Map(); let generation = 0;
  async function publish() {
    generation++; const completed = new Date(Date.now()).toISOString(), object_index = {}, manifest = [];
    for (const issue of issues.values()) {
      const envelope = readEvidenceRecordForIssue(linearBinding, issue).envelope, content = sha256Canonical(envelope);
      object_index[`issues:${issue.id}`] = { content_sha256: envelope.issue_content_sha256, updated_at: issue.updated_at };
      object_index[`read_evidence:${issue.id}`] = { content_sha256: content, updated_at: issue.updated_at };
      await save(path.join(custody, 'read_evidence', issue.id, `${content.slice(7)}.json`), { schema_version: 'soulforge.linear_collect.custody_object.v1',
        kind: 'read_evidence', object_id: issue.id, content_sha256: content, object: envelope });
      await fs.mkdir(path.join(custody, 'issues', issue.id), { recursive: true });
      await fs.writeFile(path.join(custody, 'issues', issue.id, `${envelope.issue_content_sha256.slice(7)}.json`), 'Unreadable raw issue: must never be opened by G1.');
      const projection = { projection_ref: `projection:${issue.id}`, producer_ref: grant.g2_leader_ref, content_class: 'public_safe_code', issue_id: issue.id,
        issue_content_sha256: envelope.issue_content_sha256, scope_ref: grant.scope_ref, kind: 'improvement', summary: 'Set the public fixture answer to 2.',
        allowed_write_paths: ['src/value.mjs'], acceptance_checks: ['check.answer'], valid_from: from, valid_until: until, echo: null,
        ...projectionOverrides.get(issue.id) };
      const p = await save(path.join(projections, `${issue.id}.json`), projection);
      manifest.push({ issue_id: issue.id, file: path.basename(p.path), sha256: p.sha256 });
    }
    const cursor = { schema_version: 'soulforge.linear_collect.cursor.v1', watermark: completed, backfill: null, generation_seq: generation };
    const state = { schema_version: 'soulforge.linear_collect.state.v1', lane_id: expectedBinding.lane_id, identity_digest: expectedBinding.identity_digest,
      writer_authority_id: expectedBinding.writer_authority_id, writer_epoch: 1, cursor, object_index, last_run_id: `run-${generation}`, last_completed_at: completed };
    const receipt = { schema_version: 'soulforge.linear_collect.run_receipt.v1', lane_id: expectedBinding.lane_id, run_id: state.last_run_id,
      generation_seq: generation, mode: 'apply', status: 'ok', writer_authority_id: expectedBinding.writer_authority_id, writer_epoch: 1,
      binding_sha256: SHA, workspace_url_key: expectedBinding.workspace_url_key, organization_id: expectedBinding.organization_id,
      started_at: completed, completed_at: completed, duration_ms: 0, window: { lower: from, upper: completed, phase: 'delta', order_observed: 'ascending' },
      cursor_before: { ...cursor, generation_seq: generation - 1 }, cursor_after: cursor,
      read_calls: { total: 0, by_operation: Object.fromEntries(readOperationsForReceiptVersion('soulforge.linear_collect.run_receipt.v1').map(k => [k, 0])) },
      objects: Object.fromEntries(runReceiptObjectKinds('soulforge.linear_collect.run_receipt.v1').map(k => [k, { observed: 0, created: 0, unchanged: 0 }])),
      custody_manifest_digest: SHA, coverage_gaps: ['polling_cannot_prove_hard_deletes'], error_codes: [], repository_writes: 0, private_writes: 3, network_used: false };
    await save(path.join(stateRoot, 'receipts', `${state.last_run_id}.json`), receipt);
    await save(path.join(stateRoot, 'state', 'linear-collect.json'), state);
    await save(path.join(projections, 'current.json'), { producer_ref: grant.g2_leader_ref, scope_ref: grant.scope_ref,
      valid_from: from, valid_until: until, generation, projections: manifest });
    return state;
  }
  await publish(); const calls = []; const behavior = { rejectReview: false, delayMs: 0, onCall: null };
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks)), request = JSON.parse(body.prompt); calls.push(request);
    if (behavior.onCall) await behavior.onCall(request);
    if (behavior.delayMs) await new Promise(r => setTimeout(r, behavior.delayMs));
    const validPatch = request.operation === 'propose' || request.data.patch === patch;
    const response = request.operation === 'propose' ? { binding: request.binding, patch }
      : { binding: request.binding, status: !behavior.rejectReview && validPatch ? 'ACCEPT' : 'REJECT', summary: 'Synthetic independent predicate over exact patch and evidence.' };
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ model: body.model, done: true, response: JSON.stringify(response) }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const deployment = { enabled: true, mode: 'synthetic_rehearsal', controlRoot: control, evidenceRoot: evidence, projectionRoot: projections,
    g2LeaderRef: grant.g2_leader_ref, grant: await save(path.join(config, 'grant.json'), grant), workforce, authorityMaxAgeMs: 300000,
    linear: { expectedBinding, maxAgeMs: 300000 }, runner: { repoRoot: repo, worktreeRoot: trees, baseCommit: git(['rev-parse', 'HEAD']).trim(),
      git: { executable: gitExe, sha256: hash(readFileSync(gitExe)) }, allowedFiles: ['src/value.mjs'], authorRef: 'author:G1', patchReviewerRef: 'reviewer:G1',
      validationCatalog: [{ check_id: 'check.answer', executable: process.execPath, executable_sha256: hash(readFileSync(process.execPath)),
        argv: [WRAPPER, '--validator', 'checks/answer.mjs', '--sha256', hash(validator), '--evidence-root', evidence, '--repo-root', repo],
        file_pins: [{ path: WRAPPER, sha256: hash(wrapper) }, { path: 'checks/answer.mjs', sha256: hash(validator) }] }] },
    model: { enabled: true, purpose: 'synthetic_harness', endpoint: `http://127.0.0.1:${server.address().port}`, model: 'synthetic-model', leaderRef: 'coordinator:G1',
      authorRef: 'author:G1', patchReviewerRef: 'reviewer:G1', finalReviewerRef: 'final-reviewer:G1', timeoutMs: 15000 },
    polling: { workerMs: 1000, watchdogMs: 1000, maxTickAgeMs: 1000 }, budget: { maxRunsPerDay: 10, maxAttemptsPerRevision: 2, runDeadlineMs: 60000 } };
  let descriptor = await save(path.join(config, 'deployment.json'), deployment);
  const children = [];
  let cli = CLI;
  function processRun(role, extra = ['--once']) {
    const child = spawn(process.execPath, [cli, role, '--deployment', descriptor.path, '--sha256', descriptor.sha256, ...extra], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child); let out = '', err = '';
    child.stdout.on('data', b => { out += b; }); child.stderr.on('data', b => { err += b; });
    const done = new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal, out, err, pid: child.pid })));
    return { child, done };
  }
  t.after(async () => { for (const child of children) if (child.exitCode === null) child.kill(); server.closeAllConnections(); await new Promise(r => server.close(r));
    if (!keep) { assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)); await fs.rm(root, { recursive: true, force: true }); } });
  return { root, repo, trees, evidence, control, config, issues, projections, projectionOverrides, publish, deployment, grant, calls, behavior, processRun,
    open: () => openFeedbackRuntime({ deploymentPath: descriptor.path, deploymentSha256: descriptor.sha256 }),
    async reseal() { deployment.grant = await save(path.join(config, 'grant.json'), grant); descriptor = await save(path.join(config, 'deployment.json'), deployment); },
    get descriptor() { return descriptor; }, useInstalledCli(value) { cli = value; } };
}

test('actual worker process joins automatic source selection, issued request, sparse Git, validator evidence and stateless review', async t => {
  const f = await runtimeFixture(t, { root: process.env.FEEDBACK_REHEARSAL_ROOT ?? null, keep: !!process.env.FEEDBACK_REHEARSAL_ROOT }); const first = await f.processRun('worker').done;
  assert.equal(first.code, 0, first.err); const result = JSON.parse(first.out.trim()); assert.equal(result.status, 'CANDIDATE_REPORTED', first.out);
  assert.equal(f.calls.length, 3); assert.deepEqual(f.calls.map(c => c.operation), ['propose', 'patch-review', 'final-review']);
  const report = JSON.parse(await fs.readFile(path.join(f.evidence, `${result.report_ref}.json`)));
  assert.equal(report.model_evidence.length, 3); assert.equal(report.model_requests.length, 3); assert.equal(report.official_done, false);
  assert.equal(await fs.readFile(path.join(report.candidate.worktree_path, 'src/value.mjs'), 'utf8'), 'export const answer = 2;\n');
  assert.equal(await fs.readFile(path.join(f.repo, 'src/value.mjs'), 'utf8'), 'export const answer = 1;\n');
  assert.equal(f.calls[2].data.validation.evidence[0].stdout.includes('checked public fixture'), true);
  const second = await f.processRun('worker').done; assert.equal(second.code, 0, second.err); assert.equal(JSON.parse(second.out.trim()).status, 'NO_CHANGE');
  assert.equal(f.calls.length, 3);
  const db = new DatabaseSync(path.join(f.control, 'feedback.sqlite'), { readOnly: true });
  assert.equal(db.prepare('SELECT count(*) n FROM dev_feedback_issued_request').get().n, 1); db.close();
});

test('new UUID discovered under the same standing scope requires no deployment edit; exact report echo does not rerun', async t => {
  const f = await runtimeFixture(t); const first = JSON.parse((await f.processRun('worker').done).out.trim());
  assert.equal(first.status, 'CANDIDATE_REPORTED'); const deploymentPin = f.descriptor.sha256;
  f.issues.set(SECOND, { ...f.issues.get(ISSUE), id: SECOND, identifier: 'SYN-2', updated_at: new Date(Date.now()).toISOString() });
  await f.publish(); const second = JSON.parse((await f.processRun('worker').done).out.trim());
  assert.equal(second.status, 'CANDIDATE_REPORTED'); assert.equal(f.descriptor.sha256, deploymentPin); assert.equal(f.calls.length, 6);
  const reportBytes = await fs.readFile(path.join(f.evidence, `${first.report_ref}.json`));
  f.issues.get(ISSUE).updated_at = new Date(Date.now()).toISOString(); f.issues.get(ISSUE).title = 'Synthetic echoed local result';
  const state = await f.publish();
  f.projectionOverrides.set(ISSUE, { echo: { report_ref: first.report_ref, report_sha256: hash(reportBytes), source_ref: `linear.issue:${ISSUE}`,
    source_revision: `linear.issue.revision:${state.object_index[`issues:${ISSUE}`].content_sha256.slice(7)}`, readback_ref: 'readback:G2-exact', producer_ref: 'leader:G2' } });
  await f.publish(); const echoed = await f.processRun('worker').done;
  assert.equal(echoed.code, 0, echoed.err); assert.equal(JSON.parse(echoed.out.trim()).status, 'NO_CHANGE'); assert.equal(f.calls.length, 6);
});

test('independent watchdog process persists stale/recovery notices without renewing worker clock or model calls', async t => {
  const f = await runtimeFixture(t); const runtime = await f.open(); await runtime.close();
  const db = new DatabaseSync(path.join(f.control, 'feedback.sqlite'));
  const stale = new Date(Date.now() - 10000).toISOString(); db.prepare('INSERT INTO dev_feedback_clock VALUES(1,?)').run(stale); db.close();
  const watch = await f.processRun('watchdog').done;
  assert.equal(watch.code, 0, watch.err); assert.equal(JSON.parse(watch.out.trim()).status, 'TICK_STALE'); assert.equal(f.calls.length, 0);
  const after = new DatabaseSync(path.join(f.control, 'feedback.sqlite'), { readOnly: true });
  assert.equal(after.prepare('SELECT last_tick FROM dev_feedback_clock').get().last_tick, stale); after.close();
  const repeat = JSON.parse((await f.processRun('watchdog').done).out.trim()); assert.equal(repeat.notification, 'UNCHANGED_OR_HELD');
  const freshDb = new DatabaseSync(path.join(f.control, 'feedback.sqlite')); freshDb.prepare('UPDATE dev_feedback_clock SET last_tick=?').run(new Date().toISOString()); freshDb.close();
  const recovered = JSON.parse((await f.processRun('watchdog').done).out.trim()); assert.equal(recovered.status, 'HEALTHY'); assert.equal(recovered.notification, 'DELIVERED');
  const notices = (await fs.readdir(f.evidence)).filter(n => n.startsWith('feedback.manager-notice.')); assert.equal(notices.length, 2);
});

test('revocation, foreign project projection and source hash drift never reach proposer', async t => {
  for (const kind of ['revoke', 'scope', 'revision', 'unprepared']) {
    const f = await runtimeFixture(t);
    if (kind === 'revoke') { const state = JSON.parse(await fs.readFile(f.deployment.workforce.current.path)); state.revoked_pin_refs = ['pin:synthetic']; await fs.writeFile(f.deployment.workforce.current.path, JSON.stringify(state)); }
    if (kind === 'scope') { f.projectionOverrides.set(ISSUE, { scope_ref: 'project:OTHER' }); await f.publish(); }
    if (kind === 'revision') { f.projectionOverrides.set(ISSUE, { issue_content_sha256: `sha256:${'b'.repeat(64)}` }); await f.publish(); }
    if (kind === 'unprepared') { const index = JSON.parse(await fs.readFile(path.join(f.projections, 'current.json'))); index.projections = []; await fs.writeFile(path.join(f.projections, 'current.json'), JSON.stringify(index)); }
    const result = await f.processRun('worker').done; assert.equal(f.calls.length, 0);
    if (kind === 'unprepared') { assert.equal(result.code, 0); assert.equal(JSON.parse(result.out.trim()).status, 'PREPARATION_PENDING'); }
    else assert.equal(result.code, 2, result.out);
    assert.equal((await fs.readdir(f.trees)).length, 0);
  }
});

test('deployment.linear.workflowStatusMap wiring lets the issuer resolve a workflow state outside the built-in four', async t => {
  const f = await runtimeFixture(t);
  const baseline = await createFeedbackRuntimeIssuer({ db: new DatabaseSync(':memory:'), deployment: f.deployment, evidenceRoot: f.evidence }).source.snapshot();
  assert.equal(baseline.status, 'CURRENT'); assert.equal(baseline.items.length, 1);
  const STATE_ID = 'wf-waiting-1', STATE_NAME = 'Waiting'; // Not one of the reader's built-in Todo/In Progress/Done/Cancelled tokens.
  const TOKEN = taskStatusTokenForWorkflowState(STATE_NAME, undefined);
  f.issues.set(SECOND, { ...f.issues.get(ISSUE), id: SECOND, identifier: 'SYN-2', updated_at: new Date(Date.now() - 1000).toISOString(), state_name: STATE_NAME });
  await f.publish();
  // Without a map, enumerate() sees a HOLD (not LINEAR_PROJECT_SCOPE_MISMATCH) for the second
  // issue and throws FEEDBACK_ENUMERATION_INCOMPLETE; the source swallows it into a bare HOLD.
  const unmapped = await createFeedbackRuntimeIssuer({ db: new DatabaseSync(':memory:'), deployment: f.deployment, evidenceRoot: f.evidence }).source.snapshot();
  assert.equal(unmapped.status, 'HOLD');
  const stateFile = path.join(f.deployment.linear.expectedBinding.state_root, 'state', 'linear-collect.json');
  const workflowState = { id: STATE_ID, name: STATE_NAME, type: 'unstarted', updated_at: new Date().toISOString() };
  const contentSha256 = sha256Canonical(workflowState);
  await save(path.join(f.deployment.linear.expectedBinding.custody_root, 'states', STATE_ID, `${contentSha256.slice(7)}.json`),
    { schema_version: 'soulforge.linear_collect.custody_object.v1', kind: 'states', object_id: STATE_ID, content_sha256: contentSha256, object: workflowState });
  const state = JSON.parse(await fs.readFile(stateFile));
  state.object_index[`states:${STATE_ID}`] = { content_sha256: contentSha256, updated_at: workflowState.updated_at };
  await save(stateFile, state); // Same generation/receipt; only a new committed states: object is added.
  f.deployment.linear.workflowStatusMap = { [TOKEN]: 'Todo' };
  const issuer = createFeedbackRuntimeIssuer({ db: new DatabaseSync(':memory:'), deployment: f.deployment, evidenceRoot: f.evidence });
  const mapped = await issuer.source.snapshot();
  assert.equal(mapped.status, 'CURRENT');
  assert.deepEqual(mapped.items.map(item => item.source_ref).sort(), [`linear.issue:${ISSUE}`, `linear.issue:${SECOND}`].sort());
  // grant.allowed_states is ['Todo', 'In Progress']: the mapped canonical status made the
  // second issue eligible and preparable exactly like the first.
  assert.deepEqual(issuer.selectionState(), { observed: 2, eligible: 2, prepared: 2, preparation_pending: 0 });
});

test('cancellation persists execution unknown and a restarted worker does not rerun it', async t => {
  const f = await runtimeFixture(t); const runtime = await f.open();
  let started; const requested = new Promise(r => { started = r; }); f.behavior.onCall = async () => started(); f.behavior.delayMs = 1000;
  const pending = runtime.runOnce(); await requested; await runtime.close(); const result = await pending;
  assert.equal(result.status, 'EXECUTION_UNKNOWN'); assert.equal(f.calls.length, 1);
  const restarted = await f.processRun('worker').done;
  assert.equal(restarted.code, 0, restarted.err); assert.equal(JSON.parse(restarted.out.trim()).status, 'RECOVERY_REQUIRED'); assert.equal(f.calls.length, 1);
  const watch = await f.processRun('watchdog').done; assert.equal(JSON.parse(watch.out.trim()).status, 'EXECUTION_UNKNOWN');
});

test('serial polling stops after its configured cycles and does not infer work from issue labels alone', async t => {
  const f = await runtimeFixture(t); const index = JSON.parse(await fs.readFile(path.join(f.projections, 'current.json'))); index.projections = [];
  await fs.writeFile(path.join(f.projections, 'current.json'), JSON.stringify(index));
  f.issues.get(ISSUE).title = 'ready approved execute bug'; // Not consulted by the G1 reader.
  const result = await f.processRun('worker', ['--cycles', '2']).done;
  assert.equal(result.code, 0, result.err); const ticks = result.out.trim().split('\n').map(JSON.parse);
  assert.equal(ticks.length, 2); assert.deepEqual(ticks.map(x => x.status), ['PREPARATION_PENDING', 'PREPARATION_PENDING']); assert.equal(f.calls.length, 0);
});

test('staged runtime runs worker and independent watcher from installed bytes with preserved validation evidence', async t => {
  const f = await runtimeFixture(t); const installed = path.join(f.root, 'installed'); await fs.mkdir(installed);
  const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
  const staged = await stageFeedbackRuntime({ sourceRoot, targetRoot: installed, dependencyRoot: path.join(sourceRoot, 'node_modules') });
  assert.ok(staged); await verifyFeedbackRuntimeStage({ targetRoot: installed });
  f.useInstalledCli(path.join(installed, 'guild_hall/dev_worker/feedback_runtime_cli.mjs'));
  const worker = await f.processRun('worker').done; assert.equal(worker.code, 0, worker.err);
  const result = JSON.parse(worker.out.trim()); assert.equal(result.status, 'CANDIDATE_REPORTED');
  const watchdog = await f.processRun('watchdog').done; assert.equal(watchdog.code, 0, watchdog.err); assert.notEqual(worker.pid, watchdog.pid);
  assert.equal(f.calls.length, 3); assert.ok((await fs.readdir(f.evidence)).some(f => /^feedback-validator-.*\.json$/u.test(f)));
});

test('expired unknown work requires independent pinned stop evidence before recovery and bounded retry', async t => {
  const f = await runtimeFixture(t); f.deployment.budget.runDeadlineMs = 1000; f.behavior.delayMs = 2000; await f.reseal();
  const first = await f.processRun('worker').done; assert.equal(first.code, 0, first.err);
  const result = JSON.parse(first.out.trim()); assert.equal(result.status, 'EXECUTION_UNKNOWN');
  const db = new DatabaseSync(path.join(f.control, 'feedback.sqlite'), { readOnly: true });
  const run = db.prepare('SELECT * FROM dev_feedback_run WHERE run_ref=?').get(result.run_ref); db.close();
  const start = JSON.parse(await fs.readFile(path.join(f.evidence, `feedback.run-start.${hash(run.run_ref).slice(0, 32)}.json`)));
  const proof = { run_ref: run.run_ref, source_ref: run.source_ref, semantic_sha256: run.semantic_sha256, scope_ref: 'project:SYN',
    packet_sha256: run.packet_sha256, instance_ref: start.instance_ref, inspector_ref: 'final-reviewer:G1', stopped: true,
    side_effects_resolved: true, candidate_sha256: null, process_evidence_refs: ['inspection:synthetic-child-exit'], observed_at: new Date().toISOString() };
  const bad = await save(path.join(f.config, 'bad-recovery.json'), { ...proof, inspector_ref: 'author:G1' });
  const rejected = await f.processRun('recover', ['--run-ref', run.run_ref, '--proof', bad.path, '--proof-sha256', bad.sha256]).done;
  assert.equal(rejected.code, 2); assert.match(rejected.err, /FEEDBACK_RECOVERY_READBACK_UNBOUND/u);
  const pinned = await save(path.join(f.config, 'recovery.json'), proof);
  const recovered = await f.processRun('recover', ['--run-ref', run.run_ref, '--proof', pinned.path, '--proof-sha256', pinned.sha256]).done;
  assert.equal(recovered.code, 0, recovered.err); assert.equal(JSON.parse(recovered.out.trim()).status, 'RECOVERED_FOR_INTERNAL_REVIEW');
  const retried = await f.processRun('retry', ['--run-ref', run.run_ref, '--proof', pinned.path, '--proof-sha256', pinned.sha256]).done;
  assert.equal(retried.code, 0, retried.err); assert.equal(JSON.parse(retried.out.trim()).status, 'REQUEUED');
  assert.equal((await fs.readdir(f.trees)).length, 0); // Retry requeues; it does not execute immediately.
});

test('an empty collection cannot bypass watermark freshness and mutable authority pins are refused', async t => {
  const f = await runtimeFixture(t); f.issues.clear(); const state = await f.publish();
  const stateRoot = f.deployment.linear.expectedBinding.state_root;
  const receiptFile = path.join(stateRoot, 'receipts', `${state.last_run_id}.json`), receipt = JSON.parse(await fs.readFile(receiptFile));
  const stale = new Date(Date.now() - 600000).toISOString(); state.cursor.watermark = stale; receipt.cursor_after.watermark = stale; receipt.cursor_before.watermark = stale;
  await save(path.join(stateRoot, 'state', 'linear-collect.json'), state); await save(receiptFile, receipt);
  const result = await f.processRun('worker').done; assert.equal(result.code, 2); assert.equal(f.calls.length, 0);
  f.deployment.grant.sha256 = null;
  const descriptor = await save(path.join(f.config, 'unpinned-deployment.json'), f.deployment);
  await assert.rejects(loadFeedbackDeployment(descriptor.path, descriptor.sha256), { feedbackCode: 'FEEDBACK_AUTHORITY_PIN_REQUIRED' });
});

test('projection bytes require an independent digest and a control DB cannot silently change project scope', async t => {
  const f = await runtimeFixture(t); const indexFile = path.join(f.projections, 'current.json');
  const index = JSON.parse(await fs.readFile(indexFile)); index.projections[0].sha256 = null; await fs.writeFile(indexFile, JSON.stringify(index));
  const result = await f.processRun('worker').done; assert.equal(result.code, 2); assert.equal(f.calls.length, 0);
  f.deployment.linear.expectedBinding.project_scope_ref = 'project:OTHER';
  const descriptor = await save(path.join(f.config, 'foreign-deployment.json'), f.deployment);
  await assert.rejects(openFeedbackRuntime({ deploymentPath: descriptor.path, deploymentSha256: descriptor.sha256 }), { feedbackCode: 'FEEDBACK_CONTROL_SCOPE_MISMATCH' });
});

test('current authority observation renews without reissuing standing grants or deployment and revocation still holds', async t => {
  const f = await runtimeFixture(t), currentPath = f.deployment.workforce.current.path;
  f.deployment.workforce.current = { path: currentPath, mode: 'current_state' }; await f.reseal();
  const pinnedDeployment = f.descriptor.sha256;
  const indexFile = path.join(f.projections, 'current.json'), index = JSON.parse(await fs.readFile(indexFile)); index.projections = [];
  await fs.writeFile(indexFile, JSON.stringify(index));
  const first = await f.processRun('worker').done; assert.equal(first.code, 0); assert.equal(JSON.parse(first.out.trim()).selection.preparation_pending, 1);
  const current = JSON.parse(await fs.readFile(currentPath)); current.evaluated_at = new Date().toISOString(); current.evaluation_ref = 'evaluation:renewed';
  await fs.writeFile(currentPath, JSON.stringify(current));
  const renewed = await f.processRun('worker').done; assert.equal(renewed.code, 0, renewed.err); assert.equal(f.descriptor.sha256, pinnedDeployment);
  current.current_authority_epoch = 2; current.evaluated_at = new Date().toISOString(); await fs.writeFile(currentPath, JSON.stringify(current));
  const revoked = await f.processRun('worker').done; assert.equal(revoked.code, 2); assert.equal(f.calls.length, 0);
});

test('standing configuration cannot authorize this runtime to rewrite its own guards or installer', async t => {
  const f = await runtimeFixture(t);
  for (const file of ['guild_hall/dev_worker/feedback_runtime_source.mjs', 'guild_hall/dev_worker/feedback_runtime_stage.mjs', 'guild_hall/dev_worker/FEEDBACK_RUNTIME.md']) {
    f.deployment.runner.allowedFiles = [file]; const descriptor = await save(path.join(f.config, 'self-edit.json'), f.deployment);
    await assert.rejects(loadFeedbackDeployment(descriptor.path, descriptor.sha256), { feedbackCode: 'FEEDBACK_RUNTIME_SELF_EDIT_FORBIDDEN' });
  }
});

test('G1 deployment requires an independent authenticated currentness binding outside its writable roots', async t => {
  const f = await runtimeFixture(t);
  f.deployment.mode = 'g1_acp';
  f.deployment.model.provider = 'g1_acp'; f.deployment.model.group = 'G1';
  await f.reseal();
  await assert.rejects(loadFeedbackDeployment(f.descriptor.path, f.descriptor.sha256),
    { feedbackCode: 'FEEDBACK_AUTHENTICATED_CURRENTNESS_REQUIRED' });
  const transport = await save(path.join(f.config, 'currentness-transport.json'),
    { server_sid: 'S-1-5-21-111-222-333-1001', client_sid: 'S-1-5-21-111-222-333-1001' });
  const expected = await save(path.join(f.config, 'currentness-metadata.json'), {});
  f.deployment.publicationCurrentness = { transport, expected: { path: expected.path, mode: 'current_metadata' } };
  await f.reseal();
  await assert.rejects(loadFeedbackDeployment(f.descriptor.path, f.descriptor.sha256),
    { feedbackCode: 'FEEDBACK_ROLE_SEPARATION_REQUIRED' });
  f.deployment.publicationCurrentness.transport = await save(path.join(f.deployment.controlRoot, 'writable-transport.json'),
    { server_sid: 'S-1-5-21-111-222-333-1001', client_sid: 'S-1-5-21-111-222-333-1002' });
  await f.reseal();
  await assert.rejects(loadFeedbackDeployment(f.descriptor.path, f.descriptor.sha256),
    { feedbackCode: 'FEEDBACK_CURRENTNESS_AUTHORITY_WRITABLE' });
  assert.equal(f.calls.length, 0);
});

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createFeedbackCycle } from './feedback_cycle.mjs';
import { createFeedbackWorktreeRunner } from './feedback_worktree_runner.mjs';
import { createFeedbackWatchdog, readFeedbackWatchState } from './feedback_watchdog.mjs';
import { startFeedbackPolling } from './feedback_polling.mjs';
import { createFeedbackRuntimeIssuer } from './feedback_runtime_source.mjs';
import { createFeedbackPublicationCurrentness } from './feedback_publication_currentness.mjs';
import { createFeedbackRuntimeModel } from './feedback_runtime_model.mjs';
import { deriveValidatorCaptureId } from './feedback_runtime_validator.mjs';
import { readRuntimeJson, readRuntimeBytes, writeRuntimeEvidence, runtimeOrdinary, runtimeCheck as check,
  runtimeHash as hash, runtimeRef as ref, runtimeExact as exact, runtimeInside as inside } from './feedback_runtime_io.mjs';

const WRAPPER = 'guild_hall/dev_worker/feedback_runtime_validator.mjs';

// The core's durable interrupted state covers unresolved execution at every
// stage. Translate the concrete ACP close-uncertainty signal at this consumer
// boundary, including final review, without changing the six-module core.
export async function runFeedbackRuntimeReview({ model, candidate, validation, packet, context, evidenceRoot }) {
  try {
    const review = await model.review(candidate, validation, packet, context);
    await writeRuntimeEvidence(evidenceRoot, 'review', review.review_ref, { candidate_ref: candidate.candidate_ref, review });
    return review;
  } catch (error) {
    if (error.feedbackCode !== 'FEEDBACK_ACP_CLOSURE_UNKNOWN') throw error;
    try { await writeRuntimeEvidence(evidenceRoot, 'review-unknown', context.run_ref,
      { run_ref: context.run_ref, candidate_ref: candidate.candidate_ref, code: 'FEEDBACK_ACP_CLOSURE_UNKNOWN', recovery_required: true }); }
    catch { /* A failed trace write must never downgrade execution uncertainty. */ }
    throw Object.assign(new Error('FEEDBACK_INTERRUPTED'), { feedbackCode: 'FEEDBACK_INTERRUPTED' });
  }
}
export async function loadFeedbackDeployment(deploymentPath, deploymentSha256) {
  check(typeof deploymentSha256 === 'string' && /^[a-f0-9]{64}$/u.test(deploymentSha256), 'FEEDBACK_DEPLOYMENT_PIN_REQUIRED');
  const deployment = await readRuntimeJson({ path: deploymentPath, sha256: deploymentSha256 });
  check(exact(deployment, ['enabled', 'mode', 'controlRoot', 'evidenceRoot', 'projectionRoot', 'g2LeaderRef', 'grant', 'workforce', 'linear',
    'authorityMaxAgeMs', 'runner', 'model', 'polling', 'budget', ...(Object.hasOwn(deployment, 'publicationCurrentness') ? ['publicationCurrentness'] : [])]) && deployment.enabled === true
    && ['synthetic_rehearsal', 'g1_acp'].includes(deployment.mode) && ref(deployment.g2LeaderRef)
    && Number.isInteger(deployment.authorityMaxAgeMs) && deployment.authorityMaxAgeMs > 0 && deployment.authorityMaxAgeMs <= 300000,
  'FEEDBACK_DEPLOYMENT_INVALID');
  const roots = [deployment.controlRoot, deployment.evidenceRoot, deployment.projectionRoot, deployment.runner.repoRoot, deployment.runner.worktreeRoot];
  for (const root of roots) {
    await runtimeOrdinary(root, true);
    check(!path.resolve(root).split(path.sep).some(p => ['_workmeta', '_workspaces', 'private-state', '.git'].includes(p.toLowerCase())), 'FEEDBACK_RUNTIME_ROOT_FORBIDDEN');
  }
  check(roots.every((a, i) => roots.slice(i + 1).every(b => !inside(a, b) && !inside(b, a))), 'FEEDBACK_RUNTIME_ROOT_OVERLAP');
  for (const pin of [deployment.grant, deployment.workforce.claim, deployment.workforce.pin, deployment.workforce.current, { path: deploymentPath }]) {
    check([deployment.controlRoot, deployment.evidenceRoot, deployment.runner.repoRoot, deployment.runner.worktreeRoot].every(root => !inside(root, pin.path)), 'FEEDBACK_AUTHORITY_ROOT_WRITABLE');
  }
  for (const pin of [deployment.grant, deployment.workforce.claim, deployment.workforce.pin]) {
    check(exact(pin, ['path', 'sha256']) && /^[a-f0-9]{64}$/u.test(pin.sha256), 'FEEDBACK_AUTHORITY_PIN_REQUIRED');
  }
  const current = deployment.workforce.current;
  check((exact(current, ['path', 'sha256']) && /^[a-f0-9]{64}$/u.test(current.sha256))
    || (exact(current, ['path', 'mode']) && current.mode === 'current_state'), 'FEEDBACK_AUTHORITY_CURRENT_DESCRIPTOR');
  check(!inside(deployment.projectionRoot, current.path), 'FEEDBACK_AUTHORITY_CURRENT_ROOT_WRITABLE');
  check(deployment.runner.authorRef === deployment.model.authorRef && deployment.runner.patchReviewerRef === deployment.model.patchReviewerRef,
    'FEEDBACK_ACTOR_BINDING_MISMATCH');
  check(Array.isArray(deployment.runner.allowedFiles) && deployment.runner.allowedFiles.every(file => typeof file === 'string'
    && !file.replaceAll('\\', '/').toLowerCase().startsWith('guild_hall/dev_worker/feedback_runtime')),
  'FEEDBACK_RUNTIME_SELF_EDIT_FORBIDDEN');
  check(exact(deployment.polling, ['workerMs', 'watchdogMs', 'maxTickAgeMs'])
    && Object.values(deployment.polling).every(n => Number.isInteger(n) && n >= 1000 && n <= 3600000), 'FEEDBACK_RUNTIME_POLLING_INVALID');
  check(exact(deployment.budget, ['maxRunsPerDay', 'maxAttemptsPerRevision', 'runDeadlineMs']), 'FEEDBACK_RUNTIME_BUDGET_INVALID');
  const wrapperSha = hash(await readRuntimeBytes(fileURLToPath(new URL('./feedback_runtime_validator.mjs', import.meta.url))));
  for (const command of deployment.runner.validationCatalog) {
    check(command.argv[0] === WRAPPER && command.argv.length === 9
      && command.argv[1] === '--validator' && command.argv[3] === '--sha256' && command.argv[5] === '--evidence-root'
      && command.argv[7] === '--repo-root' && command.argv[6] === deployment.evidenceRoot && command.argv[8] === deployment.runner.repoRoot
      && command.file_pins.some(p => p.path === WRAPPER && p.sha256 === wrapperSha)
      && command.file_pins.some(p => p.path === command.argv[2] && p.sha256 === command.argv[4]), 'FEEDBACK_CAPTURE_CATALOG_REQUIRED');
  }
  if (deployment.publicationCurrentness !== undefined) {
    const value = deployment.publicationCurrentness;
    check(exact(value, ['transport', 'expected']) && exact(value.transport, ['path', 'sha256'])
      && /^[a-f0-9]{64}$/u.test(value.transport.sha256) && exact(value.expected, ['path', 'mode'])
      && value.expected.mode === 'current_metadata', 'FEEDBACK_CURRENTNESS_CONFIG');
    for (const descriptor of [value.transport, value.expected]) {
      await runtimeOrdinary(descriptor.path);
      check([deployment.controlRoot, deployment.evidenceRoot, deployment.runner.repoRoot, deployment.runner.worktreeRoot]
        .every(root => !inside(root, descriptor.path)), 'FEEDBACK_CURRENTNESS_AUTHORITY_WRITABLE');
    }
  }
  if (deployment.mode === 'synthetic_rehearsal') check(deployment.model.purpose === 'synthetic_harness', 'FEEDBACK_MODEL_HARNESS_ONLY');
  else {
    check(deployment.model.provider === 'g1_acp' && deployment.model.group === 'G1', 'FEEDBACK_G1_ACTOR_REQUIRED');
    check(deployment.publicationCurrentness !== undefined, 'FEEDBACK_AUTHENTICATED_CURRENTNESS_REQUIRED');
    const transport = await readRuntimeJson(deployment.publicationCurrentness.transport);
    check(transport.server_sid !== transport.client_sid, 'FEEDBACK_ROLE_SEPARATION_REQUIRED');
  }
  return deployment;
}

async function controlDatabase(root, name, readOnly = false) {
  const file = path.join(root, name);
  if (!readOnly) {
    try { const fd = await fs.open(file, 'wx', 0o600); await fd.close(); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  await runtimeOrdinary(file);
  const db = new DatabaseSync(file, { readOnly });
  db.exec('PRAGMA busy_timeout=1000;');
  if (!readOnly) db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
  return db;
}

export async function openFeedbackRuntime({ deploymentPath, deploymentSha256, role = 'worker' }) {
  check(['worker', 'watchdog', 'inspect'].includes(role), 'FEEDBACK_RUNTIME_ROLE_INVALID');
  const deployment = await loadFeedbackDeployment(deploymentPath, deploymentSha256);
  let publicationGuard;
  const assertDeployment = async ({ projection } = {}) => {
    await readRuntimeJson({ path: deploymentPath, sha256: deploymentSha256 });
    if (projection && publicationGuard) await publicationGuard.assertProjection(projection);
  };
  const workerDb = await controlDatabase(deployment.controlRoot, 'feedback.sqlite', role !== 'worker');
  let watchDb;
  try {
  const controlBinding = hash({ scope_ref: deployment.linear.expectedBinding.project_scope_ref,
    organization_id: deployment.linear.expectedBinding.organization_id, repository: path.resolve(deployment.runner.repoRoot) });
  const hasBinding = workerDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='dev_feedback_runtime_binding'").get();
  if (!hasBinding && role === 'worker') {
    const hasOld = workerDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='dev_feedback_revision'").get();
    check(!hasOld || workerDb.prepare('SELECT count(*) n FROM dev_feedback_revision').get().n === 0, 'FEEDBACK_CONTROL_BINDING_MISSING');
    workerDb.exec('CREATE TABLE IF NOT EXISTS dev_feedback_runtime_binding (id INTEGER PRIMARY KEY CHECK(id=1), digest TEXT NOT NULL)');
    workerDb.prepare('INSERT OR IGNORE INTO dev_feedback_runtime_binding VALUES(1,?)').run(controlBinding);
  }
  check((hasBinding || role === 'worker') && workerDb.prepare('SELECT digest FROM dev_feedback_runtime_binding WHERE id=1').get()?.digest === controlBinding,
    'FEEDBACK_CONTROL_SCOPE_MISMATCH');
  if (role === 'inspect') return { async inspect() { return readFeedbackWatchState(workerDb); }, async close() { workerDb.close(); } };
  if (role === 'watchdog') {
    watchDb = await controlDatabase(deployment.controlRoot, 'feedback-watchdog.sqlite');
    const watchdog = createFeedbackWatchdog({ db: watchDb, maxTickAgeMs: deployment.polling.maxTickAgeMs,
      readState: async () => { await assertDeployment(); return readFeedbackWatchState(workerDb); },
      notifyManager: async notice => {
        await assertDeployment();
        const receipt = await writeRuntimeEvidence(deployment.evidenceRoot, 'manager-notice', notice.notice_ref,
          { target: 'local_manager_readbox', transport: 'local_file', notice });
        // Confirmed local readbox persistence, not a sent chat/Slack notification.
        return { status: 'delivered', receipt_ref: receipt.ref };
      } });
    return { role, intervalMs: deployment.polling.watchdogMs, runOnce: watchdog.watchOnce,
      async close() { watchDb.close(); workerDb.close(); } };
  }
  if (deployment.publicationCurrentness) publicationGuard = createFeedbackPublicationCurrentness({ deploymentPath, deploymentSha256, deployment });
  const instanceRef = `feedback.worker.${randomUUID()}`, issued = createFeedbackRuntimeIssuer({ db: workerDb, deployment,
    evidenceRoot: deployment.evidenceRoot, assertDeployment });
  const modelEvidence = new Map(), modelRequests = new Map(), candidateRecords = new Map();
  let runner, cycle, recoveryDescriptor = null;
  async function recoveryEvidence(run) {
    check(recoveryDescriptor && /^[a-f0-9]{64}$/u.test(recoveryDescriptor.sha256), 'FEEDBACK_RECOVERY_READBACK_REQUIRED');
    check([deployment.controlRoot, deployment.evidenceRoot, deployment.runner.repoRoot, deployment.runner.worktreeRoot]
      .every(root => !inside(root, recoveryDescriptor.path)), 'FEEDBACK_RECOVERY_PROOF_WRITABLE');
    const proof = await readRuntimeJson(recoveryDescriptor);
    const revision = workerDb.prepare('SELECT * FROM dev_feedback_revision WHERE source_ref=? AND semantic_sha256=?').get(run.source_ref, run.semantic_sha256);
    const startRef = `feedback.run-start.${hash(run.run_ref).slice(0, 32)}`;
    const start = await readRuntimeJson({ path: path.join(deployment.evidenceRoot, `${startRef}.json`), sha256: null });
    check(exact(proof, ['run_ref', 'source_ref', 'semantic_sha256', 'scope_ref', 'packet_sha256', 'instance_ref', 'inspector_ref',
      'stopped', 'side_effects_resolved', 'candidate_sha256', 'process_evidence_refs', 'observed_at'])
      && proof.run_ref === run.run_ref && proof.source_ref === run.source_ref && proof.semantic_sha256 === run.semantic_sha256
      && proof.scope_ref === revision?.scope_ref && proof.packet_sha256 === run.packet_sha256 && proof.packet_sha256 === start.packet_sha256
      && proof.instance_ref === start.instance_ref && proof.inspector_ref === deployment.model.finalReviewerRef
      && proof.inspector_ref !== deployment.model.authorRef && proof.stopped === true && proof.side_effects_resolved === true
      && Array.isArray(proof.process_evidence_refs) && proof.process_evidence_refs.length > 0 && proof.process_evidence_refs.length <= 16
      && proof.process_evidence_refs.every(ref) && Number.isFinite(Date.parse(proof.observed_at))
      && Date.parse(proof.observed_at) <= Date.now() && Date.now() - Date.parse(proof.observed_at) <= deployment.authorityMaxAgeMs,
    'FEEDBACK_RECOVERY_READBACK_UNBOUND');
    check(Number.isInteger(start.worker_pid) && start.worker_pid > 0, 'FEEDBACK_RECOVERY_PROCESS_UNBOUND');
    let alive = true;
    try { process.kill(start.worker_pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    check(!alive, 'FEEDBACK_RECOVERY_WORKER_NOT_STOPPED');
    const suffix = hash(run.run_ref).slice(0, 24), candidatePath = path.join(deployment.runner.worktreeRoot, `feedback-${suffix}`);
    const exists = await fs.lstat(candidatePath).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; });
    if (exists) {
      check(typeof proof.candidate_sha256 === 'string' && /^[a-f0-9]{64}$/u.test(proof.candidate_sha256), 'FEEDBACK_RECOVERY_CANDIDATE_UNBOUND');
      check(run.candidate_ref === `feedback.candidate.${suffix}`, 'FEEDBACK_RECOVERY_PARTIAL_CANDIDATE');
      const candidateRef = `feedback.candidate.${hash(run.candidate_ref).slice(0, 32)}`;
      const saved = await readRuntimeJson({ path: path.join(deployment.evidenceRoot, `${candidateRef}.json`), sha256: proof.candidate_sha256 });
      check(saved.candidate?.worktree_path === candidatePath && Array.isArray(saved.candidate.files), 'FEEDBACK_RECOVERY_CANDIDATE_UNBOUND');
      for (const file of saved.candidate.files) {
        check(typeof file.path === 'string' && !path.isAbsolute(file.path) && !file.path.split('/').includes('..'), 'FEEDBACK_RECOVERY_CANDIDATE_UNBOUND');
        await readRuntimeBytes(path.join(candidatePath, file.path), file.sha256);
      }
    } else check(proof.candidate_sha256 === null && run.candidate_ref === null, 'FEEDBACK_RECOVERY_CANDIDATE_UNBOUND');
    // The separately pinned controller inspection must include descendant/model
    // stop evidence. A dead worker PID alone is deliberately insufficient.
    const receipt = await writeRuntimeEvidence(deployment.evidenceRoot, 'recovery', `${run.run_ref}:${hash(proof)}`, proof);
    return { run_ref: run.run_ref, stopped: true, side_effects_resolved: true, receipt_ref: receipt.ref };
  }
  async function validationEvidence(candidate, validation) {
    const captures = [];
    for (const checkResult of validation.checks) {
      const command = deployment.runner.validationCatalog.find(c => c.check_id === checkResult.check_id);
      check(command && checkResult.passed === true, 'FEEDBACK_CAPTURE_CHECK_UNBOUND');
      const id = deriveValidatorCaptureId({ cwd: candidate.worktree_path, validator: command.argv[2], sha256: command.argv[4] });
      const filename = path.join(deployment.evidenceRoot, `feedback-validator-${id}.json`);
      const record = await readRuntimeJson({ path: filename, sha256: null }, 1_000_000);
      const stdout = Buffer.from(record.stdout, 'base64'), stderr = Buffer.from(record.stderr, 'base64');
      check(record.candidate_ref === candidate.candidate_ref && record.validator_sha256 === command.argv[4]
        && record.closed === true && record.output_complete === true && record.exit_code === 0 && record.wrapper_exit_code === 0
        && hash(stdout) === record.stdout_sha256 && hash(stderr) === record.stderr_sha256, 'FEEDBACK_CAPTURE_EVIDENCE_UNBOUND');
      captures.push({ check_id: checkResult.check_id, capture_ref: `feedback.capture.${id}`, stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'), stdout_sha256: record.stdout_sha256, stderr_sha256: record.stderr_sha256, exit_code: record.exit_code });
    }
    return captures;
  }
  const modelOptions = { ...deployment.model,
    authorize: async (stage, binding) => issued.authorizePacket(stage === 'propose' || stage === 'patch-review' ? 'execute' : 'review', binding.packet_sha256),
    onRequest: async request => {
      const saved = await writeRuntimeEvidence(deployment.evidenceRoot, 'model-request', request.request_ref, request);
      const list = modelRequests.get(request.run_ref) ?? []; list.push(saved); modelRequests.set(request.run_ref, list);
    },
    onExchange: async exchange => {
      const receipt = exchange.model_receipt;
      const saved = await writeRuntimeEvidence(deployment.evidenceRoot, 'model-exchange', receipt.receipt_ref, exchange);
      const list = modelEvidence.get(receipt.run_ref) ?? []; list.push(saved); modelEvidence.set(receipt.run_ref, list);
    }, loadValidationEvidence: validationEvidence };
  const model = deployment.mode === 'synthetic_rehearsal' ? createFeedbackRuntimeModel(modelOptions)
    : (await import('./feedback_runtime_acp.mjs')).createFeedbackRuntimeAcp(modelOptions);
  runner = createFeedbackWorktreeRunner({ ...deployment.runner, proposePatch: model.proposePatch, inspectPatch: model.inspectPatch,
    authorizeInput: async packet => issued.authorizePacket('execute', hash(packet)) });
  async function echoSnapshot() {
    const snapshot = await issued.source.snapshot();
    if (snapshot.status !== 'CURRENT') return snapshot;
    for (const item of snapshot.items) {
      const proof = issued.selection(item.source_ref)?.projection.echo;
      if (proof === null || proof === undefined) continue;
      check(exact(proof, ['report_ref', 'report_sha256', 'source_ref', 'source_revision', 'readback_ref', 'producer_ref'])
        && /^feedback\.report\.[a-f0-9]{32}$/u.test(proof.report_ref) && /^[a-f0-9]{64}$/u.test(proof.report_sha256)
        && ref(proof.readback_ref) && proof.producer_ref === deployment.g2LeaderRef
        && proof.source_ref === item.source_ref && proof.source_revision === item.source_revision, 'FEEDBACK_ECHO_READBACK_UNBOUND');
      const report = await readRuntimeJson({ path: path.join(deployment.evidenceRoot, `${proof.report_ref}.json`), sha256: proof.report_sha256 }, 2_000_000);
      check(report.source_ref === item.source_ref && report.status === 'candidate_reported' && ref(report.review_ref), 'FEEDBACK_ECHO_REPORT_UNCONFIRMED');
      cycle.recordEcho({ source_ref: item.source_ref, semantic_sha256: item.semantic_sha256, report_ref: proof.report_ref });
    }
    return snapshot;
  }
  cycle = createFeedbackCycle({ db: workerDb, source: { snapshot: echoSnapshot, current: issued.source.current },
    prepare: issued.prepare, authorize: issued.authorize, verifyRecovery: recoveryEvidence, verifyRetry: recoveryEvidence, ...deployment.budget,
    execute: async (packet, context) => {
      await writeRuntimeEvidence(deployment.evidenceRoot, 'run-start', context.run_ref,
        { run_ref: context.run_ref, instance_ref: instanceRef, worker_pid: process.pid, packet_sha256: hash(packet), deadline_at: context.deadline_at });
      const candidate = await runner.execute(packet, context);
      await writeRuntimeEvidence(deployment.evidenceRoot, 'candidate', candidate.candidate_ref, { candidate });
      candidateRecords.set(candidate.candidate_ref, { candidate }); return candidate;
    },
    validate: async (candidate, packet, context) => {
      const validation = await runner.validate(candidate, packet, context);
      if (validation.status === 'PASS') await validationEvidence(candidate, validation);
      await writeRuntimeEvidence(deployment.evidenceRoot, 'validation', validation.validation_ref, { candidate_ref: candidate.candidate_ref, validation, runner: runner.state() });
      candidateRecords.get(candidate.candidate_ref).validation = validation; return validation;
    },
    review: async (candidate, validation, packet, context) => {
      const review = await runFeedbackRuntimeReview({ model, candidate, validation, packet, context, evidenceRoot: deployment.evidenceRoot });
      candidateRecords.get(candidate.candidate_ref).review = review; return review;
    },
    report: async values => {
      const details = candidateRecords.get(values.candidate_ref);
      check(details?.review?.status === 'ACCEPT' && details.validation?.status === 'PASS', 'FEEDBACK_REPORT_EVIDENCE_INCOMPLETE');
      const record = { ...values, status: 'candidate_reported', ...details, model_evidence: modelEvidence.get(values.run_ref) ?? [],
        model_requests: modelRequests.get(values.run_ref) ?? [],
        official_done: false, canonical_accepted: false, transport: 'local_file', execution_mode: deployment.mode,
        model_evidence_kind: deployment.mode === 'synthetic_rehearsal' ? 'synthetic_role_verdicts' : 'g1_acp_role_verdicts', instance_ref: instanceRef };
      check(record.model_evidence.length === 3 && record.model_requests.length === 3, 'FEEDBACK_REPORT_MODEL_EVIDENCE_INCOMPLETE');
      const receipt = await writeRuntimeEvidence(deployment.evidenceRoot, 'report', values.run_ref, record);
      return { report_ref: receipt.ref };
    } });
  return { role, intervalMs: deployment.polling.workerMs, instanceRef,
    async runOnce() {
      const result = await cycle.runOnce();
      if (result.run_ref && ['CANDIDATE_REPORTED', 'HELD_INTERNAL', 'EXECUTION_UNKNOWN'].includes(result.status)) {
        await writeRuntimeEvidence(deployment.evidenceRoot, 'run-result', result.run_ref, { result, runner: runner.state() });
        if (result.status === 'CANDIDATE_REPORTED') model.clearRun(result.run_ref);
      }
      const selection = issued.selectionState();
      return { ...result, status: result.status === 'NO_CHANGE' && selection.preparation_pending > 0 ? 'PREPARATION_PENDING' : result.status,
        core_status: result.status, selection, execution_mode: deployment.mode };
    }, inspect: () => cycle.state(),
    async recover(runRef, descriptor, { retry = false } = {}) {
      check(!recoveryDescriptor && ref(runRef), 'FEEDBACK_RECOVERY_BUSY'); recoveryDescriptor = descriptor;
      try { await issued.source.snapshot(); return retry ? await cycle.retry(runRef) : await cycle.recover(runRef); }
      finally { recoveryDescriptor = null; }
    },
    async close() { await cycle.stop(); await publicationGuard?.close(); workerDb.close(); } };
  } catch (error) { await publicationGuard?.close(); watchDb?.close(); workerDb.close(); throw error; }
}

export function pollFeedbackRuntime(runtime, { maxCycles = null, onStatus = () => {} } = {}) {
  let polling, closed = false; let resolve;
  const done = new Promise(r => { resolve = r; });
  polling = startFeedbackPolling({ runOnce: runtime.runOnce, intervalMs: runtime.intervalMs,
    onStatus: async state => {
      onStatus(state);
      if (maxCycles !== null && state.sequence >= maxCycles && !closed) { closed = true; await polling.stop(); await runtime.close(); resolve(state); }
    } });
  return { done, async stop() { if (!closed) { closed = true; await polling.stop({ stopActive: () => runtime.close() }); resolve({ status: 'STOPPED' }); } } };
}

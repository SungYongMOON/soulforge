// Concrete company-discovery composition. No official writer, scheduler or live
// source discovery is created here; all authority/input endpoints are installer-pinned.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createForgeIntentCore } from '../../../../guild_hall/forge_intent/src/forge_intent_core.mjs';
import { sameExactRef } from '../../../../guild_hall/engineering_engine/kernel/identity.mjs';
import { createWorkIntakeStore } from './work_intake_store.mjs';
import { runWorkIntake } from './work_intake_adapter.mjs';
import { createWorkIntakeSource } from './work_intake_source.mjs';
import { createWorkIntakeJudge } from './work_intake_judge.mjs';
import { createWorkIntakeContextConsumer } from './work_intake_context.mjs';
import { intakeRead, intakeBytes, intakeOrdinary, intakeInside, intakeCheck as check, intakeRef as ref,
  intakePin, intakeHash as hash } from './work_intake_io.mjs';
const uniqueReasons = values => [...new Set(values)];

export async function openWorkIntakeRuntime({ deploymentPath, deploymentSha256, readOnly = false }) {
  const pin = { path: deploymentPath, sha256: deploymentSha256 }, deployment = await intakeRead(pin);
  check(deployment.version === 1 && ref(deployment.project_ref) && ref(deployment.scope_ref)
    && ['synthetic_rehearsal', 'source_bound'].includes(deployment.mode)
    && ['synthetic', 'released'].includes(deployment.data_provenance)
    && Array.isArray(deployment.release_binding_roots) && deployment.release_binding_roots.length > 0,
  'INTAKE_DEPLOYMENT_INVALID');
  const writable = [deployment.control_root, deployment.evidence_root];
  for (const root of writable) {
    await intakeOrdinary(root, true);
    check(!root.split(/[\\/]/u).some(part => ['_workmeta', '_workspaces', 'private-state', '.git'].includes(part.toLowerCase())), 'INTAKE_ROOT_FORBIDDEN');
  }
  check(!intakeInside(writable[0], writable[1]) && !intakeInside(writable[1], writable[0])
    && writable.every(root => !intakeInside(root, deploymentPath)), 'INTAKE_ROOT_OVERLAP');
  const source = createWorkIntakeSource({ deployment, assertDeployment: () => intakeRead(pin) });
  await source.authority(readOnly ? 'view' : 'read');
  const file = path.join(deployment.control_root, 'work-intake.runtime.sqlite');
  if (!readOnly) { try { const h = await fs.open(file, 'wx', 0o600); await h.close(); } catch (e) { if (e.code !== 'EEXIST') throw e; } }
  await intakeOrdinary(file);
  const db = new DatabaseSync(file, { readOnly });
  db.exec('PRAGMA busy_timeout=1000');
  if (!readOnly) db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS intake_runtime_binding(id INTEGER PRIMARY KEY CHECK(id=1),digest TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS intake_runtime_run(sequence INTEGER PRIMARY KEY,run_id TEXT NOT NULL UNIQUE,
      input_key TEXT NOT NULL,state TEXT NOT NULL,result_ref TEXT,result_sha256 TEXT,reason TEXT,started_at TEXT NOT NULL,finished_at TEXT);
    CREATE TABLE IF NOT EXISTS intake_runtime_model(attempt_ref TEXT PRIMARY KEY,run_id TEXT NOT NULL,input_sha256 TEXT NOT NULL,
      session_id TEXT NOT NULL,state TEXT NOT NULL,reason TEXT,UNIQUE(run_id,input_sha256));
    CREATE INDEX IF NOT EXISTS intake_runtime_input_key ON intake_runtime_run(input_key,sequence);
    CREATE INDEX IF NOT EXISTS intake_runtime_model_state ON intake_runtime_model(state);`);
  const bindingDigest = hash({ project: deployment.project_ref, scope: deployment.scope_ref, mode: deployment.mode, data_provenance: deployment.data_provenance });
  if (!readOnly) db.prepare('INSERT OR IGNORE INTO intake_runtime_binding VALUES(1,?)').run(bindingDigest);
  try { check(db.prepare('SELECT digest FROM intake_runtime_binding WHERE id=1').get()?.digest === bindingDigest, 'INTAKE_CONTROL_SCOPE_MISMATCH'); }
  catch (error) { db.close(); throw error; }
  const store = readOnly ? null : createWorkIntakeStore({ directory: deployment.control_root,
    repositoryRoot: deployment.repository_root, project_ref: deployment.project_ref,
    provenance: deployment.mode === 'source_bound' ? 'source_bound' : 'synthetic' });
  if (!readOnly && store.status !== 'OPEN') { db.close(); throw new Error('INTAKE_STORE_UNAVAILABLE'); }
  const row = runId => db.prepare('SELECT * FROM intake_runtime_run WHERE run_id=?').get(runId);
  async function save(kind, identity, value) {
    const reference = `intake.${kind}.${hash(identity).slice(0, 32)}`, bytes = Buffer.from(JSON.stringify(value));
    check(bytes.length <= 1000000, 'INTAKE_EVIDENCE_LIMIT');
    const filename = path.join(deployment.evidence_root, `${reference}.json`);
    try { const h = await fs.open(filename, 'wx', 0o600); try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); } }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    await intakeBytes({ path: filename, sha256: hash(bytes) }); return { ref: reference, sha256: hash(bytes) };
  }
  async function contextFor(spec, observation) {
    check(sameExactRef(spec.request?.project_ref, deployment.accepted_project_ref), 'INTAKE_CONTEXT_PROJECT_MISMATCH');
    const asOf = Date.parse(spec.request.as_of), now = Date.now();
    check(Number.isFinite(asOf) && asOf <= now && now - asOf <= 300000
      && asOf >= Date.parse(observation.window.end) && asOf <= Date.parse(observation.observed_at), 'INTAKE_CONTEXT_TIME_MISMATCH');
    check(intakePin(spec.config) && writable.every(root => !intakeInside(root, spec.config.path)), 'INTAKE_CONTEXT_CONFIG_INVALID');
    const consumer = createWorkIntakeContextConsumer({ configPath: spec.config.path, configSha256: spec.config.sha256, writableRoots: writable });
    return consumer.read(spec.request, { currentTime: new Date(now).toISOString() });
  }
  async function safeContextFor(spec, observation) {
    try { return await contextFor(spec, observation); }
    catch { return { status: 'HOLD', blocker_codes: ['ENGINEERING_CONTEXT_REQUIRED'], findings: [], accepted_context_ref: null }; }
  }
  const contextKey = context => hash({ status: context.status, blockers: context.blocker_codes,
    evidence: context.evidence_digests, accepted: context.accepted_context_ref });
  let inFlight = null;
  async function runOnce() {
    check(!readOnly, 'INTAKE_READ_ONLY');
    await source.authority();
    if (db.prepare("SELECT 1 FROM intake_runtime_model WHERE state='UNKNOWN' LIMIT 1").get())
      return { status: 'MODEL_CLOSURE_UNKNOWN', official_done: false, external_effects: 0 };
    const inspected = store.inspect();
    check(inspected.status === 'INSPECTED', 'INTAKE_STORE_UNAVAILABLE');
    const cursors = Object.fromEntries(inspected.cursors.map(value => [`${value.source}:${value.scope}`, value.cursor]));
    let produced;
    try { produced = await source.produce({ run_id: `intake.scan.${Date.now()}`, cursors }); }
    catch (error) {
      const run_id = `intake.failure.${Date.now()}`;
      db.prepare("INSERT INTO intake_runtime_run(run_id,input_key,state,reason,started_at,finished_at) VALUES(?,?,'HELD',?,?,?)")
        .run(run_id, hash(error.workIntakeCode ?? 'SOURCE_UNAVAILABLE'), error.workIntakeCode ?? 'SOURCE_UNAVAILABLE', new Date().toISOString(), new Date().toISOString());
      return { status: 'HELD', run_id, reason: error.workIntakeCode ?? 'SOURCE_UNAVAILABLE', official_done: false, external_effects: 0 };
    }
    const contexts = {};
    for (const [eventRef, spec] of Object.entries(produced.engineering)) contexts[eventRef] = await safeContextFor(spec, produced.input);
    const inputKey = hash({ source: produced.source_snapshot_sha256, contexts: Object.fromEntries(Object.entries(contexts).map(([key, value]) => [key, contextKey(value)])),
      judge: deployment.judge, documents: deployment.documents });
    const old = db.prepare('SELECT * FROM intake_runtime_run WHERE input_key=? ORDER BY sequence DESC LIMIT 1').get(inputKey);
    if (old) return { status: old.state === 'RUNNING' ? 'MODEL_CLOSURE_UNKNOWN' : 'NO_CHANGE', run_id: old.run_id,
      result_ref: old.result_ref, official_done: false, external_effects: 0 };
    const run_id = `intake.run.${inputKey.slice(0, 32)}`;
    db.prepare("INSERT INTO intake_runtime_run(run_id,input_key,state,started_at) VALUES(?,?,'RUNNING',?)").run(run_id, inputKey, new Date().toISOString());
    const input = { ...produced.input, run_id };
    let result;
    const authorize = async () => {
      if (!await source.current('judge')) return false;
      for (const [eventRef, spec] of Object.entries(produced.engineering))
        if (contextKey(await safeContextFor(spec, produced.input)) !== contextKey(contexts[eventRef])) return false;
      return true;
    };
    try {
    const judge = createWorkIntakeJudge({ ...deployment.judge, authorize,
      onAttempt: async attempt => {
        check(await authorize(), 'INTAKE_AUTHORITY_REVOKED');
        const attempt_ref = `intake.model.${hash([run_id, attempt.input_sha256]).slice(0, 32)}`;
        db.prepare("INSERT INTO intake_runtime_model VALUES(?,?,?,?,'UNKNOWN',NULL)").run(attempt_ref, run_id, attempt.input_sha256, attempt.session_id);
        return { status: 'RECORDED', input_sha256: attempt.input_sha256, attempt_ref };
      },
      onClosed: async closed => {
        if (!closed.direct_child_closed) db.prepare("INSERT OR IGNORE INTO intake_runtime_model VALUES(?,?,?,?,'UNKNOWN',?)")
          .run(`intake.model.${hash([run_id, closed.input_sha256]).slice(0, 32)}`, run_id, closed.input_sha256, closed.session_id ?? 'unknown', closed.reason_code);
        check(closed.direct_child_closed === true, 'INTAKE_MODEL_CLOSURE_UNKNOWN');
        if (!db.prepare('SELECT 1 FROM intake_runtime_model WHERE run_id=? AND input_sha256=?').get(run_id, closed.input_sha256)) return;
        const updated = db.prepare("UPDATE intake_runtime_model SET state='CLOSED',reason=? WHERE run_id=? AND input_sha256=? AND session_id=? AND state='UNKNOWN'")
          .run(closed.reason_code, run_id, closed.input_sha256, closed.session_id);
        check(updated.changes === 1, 'INTAKE_MODEL_CLOSURE_UNRECORDED');
      } });
      result = await runWorkIntake(input, { judge, eventGate: event => {
        const context = contexts[event.event_ref];
        if (context?.findings?.some(finding => finding.gap_type === 'gap_unknown'))
          return { status: 'HOLD', reason_codes: ['ENGINEERING_EVIDENCE_UNKNOWN'] };
        return !context || context.status === 'READ_ONLY_ASSESSED' ? { status: 'READY' }
          : { status: 'HOLD', reason_codes: context.blocker_codes ?? ['ENGINEERING_CONTEXT_REQUIRED'] };
      } });
      check(await source.current('record'), 'INTAKE_AUTHORITY_REVOKED');
      check(await authorize(), 'INTAKE_CONTEXT_CHANGED');
      const committed = store.commitResult(result);
      check(['COMMITTED', 'REPLAY'].includes(committed.status), 'INTAKE_RESULT_STORE_FAILED');
      const applied = committed.receipt.decision_status === 'RECORDED';
      const forge = createForgeIntentCore({ taskWriter: { createOfficialTask() { throw new Error('INTAKE_OFFICIAL_WRITER_FORBIDDEN'); } } });
      const candidates = result.attempts.filter(attempt => attempt.kind === 'event').map(attempt => {
        const context = contexts[attempt.event_ref]; let engineering = null, refBindings = null;
        if (applied && context?.status === 'READ_ONLY_ASSESSED') {
          const missing = context.findings.filter(finding => finding.gap_type === 'gap_missing');
          if (missing.length && ['NEW', 'FOLLOW_UP', 'EVIDENCE'].includes(attempt.classification)) {
            // Forge takes named string refs; Rune supplies exact tuples/UUIDs.
            // Preserve the full validated targets beside deterministic aliases.
            // These aliases identify existing evidence; they never mint it.
            refBindings = { accepted: { ref: `accepted-context:${hash(context.accepted_context_ref)}`, exact_ref: context.accepted_context_ref },
              findings: missing.map(finding => ({ ref: `engine-finding:${finding.finding_id}`, finding_id: finding.finding_id, snapshot_id: finding.snapshot_id })) };
            engineering = forge.createWorkCandidate({
              candidate_id: `intake.candidate.${hash(attempt.attempt_id).slice(0, 24)}`, accepted_context_ref: refBindings.accepted.ref,
              engine_finding_refs: refBindings.findings.map(finding => finding.ref), rationale: 'Review a source-bound confirmed engineering gap.',
              confidence: 'low', stop_conditions: ['Human review required; no official task or acceptance is created.'] });
          }
        }
        return { attempt_ref: attempt.attempt_id, event_ref: attempt.event_ref, classification: applied ? attempt.classification : 'HOLD',
          proposed_classification: attempt.classification,
          reason_codes: applied ? attempt.reason_codes : uniqueReasons([...attempt.reason_codes, 'INTAKE_DECISION_NOT_APPLIED']),
          source_revision_ref: attempt.source_revision_ref, source_sha256: attempt.event_revision_sha256,
          semantic_digest: attempt.semantic_digest, task_identity: attempt.task_identity, matched_task_ref: attempt.matched_task_ref,
          evidence_refs: attempt.evidence_refs, model_receipt_ref: attempt.model_receipt_ref,
          engineering: context ? { status: context.status, findings: context.findings, accepted_context_ref: context.accepted_context_ref,
            evidence_digests: context.evidence_digests, candidate: engineering, ref_bindings: refBindings } : null,
          human_acceptance: 'UNKNOWN', official_done: false };
      });
      const unknown = db.prepare("SELECT 1 FROM intake_runtime_model WHERE run_id=? AND state='UNKNOWN' LIMIT 1").get(run_id);
      const record = { version: 1, run_id, project_ref: deployment.project_ref, provenance: input.provenance, data_provenance: deployment.data_provenance,
        status: unknown ? 'MODEL_CLOSURE_UNKNOWN' : applied ? result.status : 'HOLD', candidates, denominators: result.denominators,
        decision_status: committed.receipt.decision_status, applied_candidates: applied ? result.denominators.proposals : 0,
        source_snapshot_sha256: produced.source_snapshot_sha256, coverage_gaps: produced.coverage_gaps,
        store_receipt: committed.receipt, official_done: false, external_effects: 0 };
      const evidence = await save('result', run_id, record);
      db.prepare('UPDATE intake_runtime_run SET state=?,result_ref=?,result_sha256=?,reason=?,finished_at=? WHERE run_id=?')
        .run(unknown ? 'MODEL_UNKNOWN' : applied && result.status === 'COMPLETED' ? 'COMMITTED' : 'HELD', evidence.ref, evidence.sha256,
          result.hold_codes.join(',') || null, new Date().toISOString(), run_id);
      return { status: record.status, run_id, result_ref: evidence.ref, result_sha256: evidence.sha256,
        candidates: candidates.length, official_done: false, external_effects: 0 };
    } catch (error) {
      const unknown = db.prepare("SELECT 1 FROM intake_runtime_model WHERE run_id=? AND state='UNKNOWN' LIMIT 1").get(run_id);
      db.prepare('UPDATE intake_runtime_run SET state=?,reason=?,finished_at=? WHERE run_id=?')
        .run(unknown ? 'MODEL_UNKNOWN' : 'HELD', error.workIntakeCode ?? 'INTAKE_RUN_FAILED', new Date().toISOString(), run_id);
      return { status: unknown ? 'MODEL_CLOSURE_UNKNOWN' : 'HELD', run_id,
        reason: error.workIntakeCode ?? 'INTAKE_RUN_FAILED', official_done: false, external_effects: 0 };
    }
  }
  async function accessCheck(access) {
    await source.authority('view');
    check(access && await access.checkSession?.() === true && await access.canAccessProject?.(deployment.project_ref) === true
      && await access.checkSession() === true, 'INTAKE_VIEW_FORBIDDEN');
  }
  return { runOnce() { if (!inFlight) inFlight = runOnce().finally(() => { inFlight = null; }); return inFlight; },
    async snapshot({ limit = 50, after = 0 } = {}, access) {
      await accessCheck(access);
      check(Number.isInteger(limit) && limit >= 1 && limit <= 100 && Number.isSafeInteger(after) && after >= 0, 'INTAKE_VIEW_QUERY_INVALID');
      const rows = db.prepare('SELECT * FROM intake_runtime_run WHERE sequence>? ORDER BY sequence LIMIT ?').all(after, limit + 1);
      await accessCheck(access);
      return { project_ref: deployment.project_ref, items: rows.slice(0, limit), next: rows.length > limit ? rows[limit - 1].sequence : null,
        official_done: false, external_effects: 0 };
    },
    async detail({ run_id, ref: reference, sha256 }, access) {
      await accessCheck(access); const current = row(run_id);
      check(current && current.result_ref === reference && current.result_sha256 === sha256 && /^intake\.result\.[a-f0-9]{32}$/u.test(reference), 'INTAKE_RESULT_NOT_FOUND');
      const result = await intakeRead({ path: path.join(deployment.evidence_root, `${reference}.json`), sha256 });
      await accessCheck(access); check(hash(row(run_id)) === hash(current), 'INTAKE_RESULT_CHANGED');
      return result;
    },
    async inspect() { await source.authority('view'); return { project_ref: deployment.project_ref, data_provenance: deployment.data_provenance,
      runs: db.prepare('SELECT * FROM intake_runtime_run ORDER BY sequence DESC LIMIT 50').all(),
      unknown_models: db.prepare("SELECT attempt_ref,run_id,state FROM intake_runtime_model WHERE state='UNKNOWN' LIMIT 50").all(), official_done: false }; },
    close() { store?.close(); db.close(); } };
}

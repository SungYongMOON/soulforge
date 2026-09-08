import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, realpathSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isWorkIntakeResult } from './work_intake_adapter.mjs';
import { isWorkIntakeEvaluation } from './work_intake_evaluation.mjs';
import { validateHourlyShadowCycle } from './hourly_shadow_cycle_contract.mjs';
import { createInMemoryProjectDecisionLedger } from './project_decision_ledger.mjs';

const token = (v) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u.test(v);
const timestamp = (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/u.test(v) && Number.isFinite(Date.parse(v));
const digest = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const hold = (code) => Object.freeze({ status: 'HOLD', hold_codes: [code] });
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const overlaps = (a, b) => {
  const rel = path.relative(a, b);
  return !rel || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
};
const identity = (s) => `${s.dev}:${s.ino}:${s.birthtimeMs}`;

// A separate caller-provisioned synthetic control directory is mandatory. This
// module is not installed, scheduled, or connected to any source or delivery port.
export function createWorkIntakeStore({ directory, repositoryRoot, project_ref, provenance = 'synthetic' } = {}) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)
    || typeof repositoryRoot !== 'string' || !path.isAbsolute(repositoryRoot)
    || path.parse(directory).root === path.normalize(directory) || !token(project_ref) || !['synthetic', 'source_bound'].includes(provenance)) {
    return hold('STORE_BINDING_REQUIRED');
  }
  directory = path.normalize(directory); repositoryRoot = path.normalize(repositoryRoot);
  if (overlaps(directory, repositoryRoot) || overlaps(repositoryRoot, directory)
    || directory.split(path.sep).some((p) => ['_workmeta', '_workspaces', '.git', '.workflow', '.registry', 'guild_hall'].includes(p.toLowerCase()))) {
    return hold('STORE_ROOT_FORBIDDEN');
  }
  const filename = path.join(directory, provenance === 'synthetic' ? 'work-intake.synthetic.sqlite' : 'work-intake.source-bound.sqlite');
  let db; let rootIdentity; let fileIdentity; let closed = false;
  function checkBinding() {
    if (closed) fail('STORE_CLOSED');
    for (let current = directory; ; current = path.dirname(current)) {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('STORE_ROOT_UNSAFE');
      if (current === directory) {
        if (rootIdentity && rootIdentity !== identity(stat)) fail('STORE_ROOT_CHANGED');
        rootIdentity ??= identity(stat);
      }
      if (current === path.dirname(current)) break;
    }
    if (!samePath(realpathSync(directory), directory)) fail('STORE_ROOT_UNSAFE');
    if (fileIdentity) {
      const stat = lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || identity(stat) !== fileIdentity) fail('STORE_FILE_CHANGED');
    }
  }
  try {
    checkBinding();
    try { const fd = openSync(filename, 'wx', 0o600); closeSync(fd); }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
    const stat = lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('STORE_FILE_UNSAFE');
    fileIdentity = identity(stat);
    // No WAL sidecar: each mutation and its cursor/exposure state commit together.
    db = new DatabaseSync(filename);
    db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000;
      CREATE TABLE IF NOT EXISTS intake_binding (singleton INTEGER PRIMARY KEY CHECK(singleton=1), project TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS intake_runs (sequence INTEGER PRIMARY KEY, run_id TEXT NOT NULL UNIQUE,
        input_digest TEXT NOT NULL, payload TEXT NOT NULL, payload_digest TEXT NOT NULL, receipt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS intake_cursors (source TEXT NOT NULL, scope TEXT NOT NULL, cursor TEXT, PRIMARY KEY(source,scope));
      CREATE TABLE IF NOT EXISTS intake_exposure_events (sequence INTEGER PRIMARY KEY, exposure_key TEXT NOT NULL,
        reservation_ref TEXT NOT NULL, attempt_ref TEXT NOT NULL, state TEXT NOT NULL, payload TEXT NOT NULL, payload_digest TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS intake_evaluations (evaluation_key TEXT PRIMARY KEY, run_id TEXT NOT NULL,
        payload TEXT NOT NULL, payload_digest TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS intake_runs_no_update BEFORE UPDATE ON intake_runs BEGIN SELECT RAISE(ABORT,'append_only'); END;
      CREATE TRIGGER IF NOT EXISTS intake_runs_no_delete BEFORE DELETE ON intake_runs BEGIN SELECT RAISE(ABORT,'append_only'); END;
      CREATE TRIGGER IF NOT EXISTS intake_exposure_no_update BEFORE UPDATE ON intake_exposure_events BEGIN SELECT RAISE(ABORT,'append_only'); END;
      CREATE TRIGGER IF NOT EXISTS intake_exposure_no_delete BEFORE DELETE ON intake_exposure_events BEGIN SELECT RAISE(ABORT,'append_only'); END;`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS intake_evaluation_no_update BEFORE UPDATE ON intake_evaluations BEGIN SELECT RAISE(ABORT,'append_only'); END;
      CREATE TRIGGER IF NOT EXISTS intake_evaluation_no_delete BEFORE DELETE ON intake_evaluations BEGIN SELECT RAISE(ABORT,'append_only'); END;`);
    db.prepare('INSERT OR IGNORE INTO intake_binding VALUES (1,?)').run(project_ref);
    if (db.prepare('SELECT project FROM intake_binding').get().project !== project_ref) fail('STORE_PROJECT_MISMATCH');
  } catch (e) { try { db?.close(); } catch {} return hold(e.code?.startsWith('STORE_') ? e.code : 'STORE_UNAVAILABLE'); }

  function transaction(fn) {
    try {
      checkBinding(); db.exec('BEGIN IMMEDIATE');
      try { const result = fn(); db.exec('COMMIT'); return freeze(result); }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    } catch (e) { return hold(e.code?.startsWith('STORE_') ? e.code : 'STORE_TRANSACTION_FAILED'); }
  }
  function readRuns() {
    const rows = db.prepare('SELECT * FROM intake_runs ORDER BY sequence').all();
    if (rows.length > 10000) fail('STORE_CAPACITY_REACHED');
    return rows.map((row) => {
      let result;
      try { result = JSON.parse(row.payload); } catch { fail('STORE_INTEGRITY_FAILED'); }
      let receipt;
      try { receipt = JSON.parse(row.receipt); } catch { fail('STORE_INTEGRITY_FAILED'); }
      if (digest({ result, receipt }) !== row.payload_digest || result.project_ref !== project_ref
        || result.provenance !== provenance || result.run_id !== row.run_id || result.input_sha256 !== row.input_digest) {
        fail('STORE_INTEGRITY_FAILED');
      }
      return { result, receipt };
    });
  }
  function hydrate(runs) {
    const ledger = createInMemoryProjectDecisionLedger();
    for (const { result, receipt } of runs) {
      if (receipt.decision_status !== 'RECORDED') continue;
      for (const attempt of result.attempts) {
        if (!attempt.shadow_cycle) continue;
        const validated = validateHourlyShadowCycle(attempt.shadow_cycle);
        if (validated.status !== 'VALIDATED') fail('STORE_INTEGRITY_FAILED');
        if (ledger.appendCycle(validated.cycle).status === 'HOLD') fail('STORE_INTEGRITY_FAILED');
      }
    }
    return ledger;
  }
  function commitResult(result) {
    if (!isWorkIntakeResult(result) || result.provenance !== provenance
      || result.project_ref !== project_ref || !token(result.run_id)) return hold('STORE_RESULT_INVALID');
    return transaction(() => {
      const runs = readRuns();
      const existing = runs.find((row) => row.result.run_id === result.run_id);
      if (existing) {
        return existing.result.input_sha256 === result.input_sha256
          && digest(existing.result) === digest(result)
          ? { status: 'REPLAY', receipt: existing.receipt } : hold('STORE_RUN_CONFLICT');
      }
      if (runs.length >= 10000) fail('STORE_CAPACITY_REACHED');
      const ledger = hydrate(runs);
      const decisions = [];
      let decisionStatus = 'RECORDED';
      for (const attempt of result.attempts) {
        if (!attempt.shadow_cycle) continue;
        const validated = validateHourlyShadowCycle(attempt.shadow_cycle);
        if (validated.status !== 'VALIDATED') fail('STORE_RESULT_INVALID');
        const appended = ledger.appendCycle(validated.cycle);
        decisions.push({ attempt_ref: attempt.attempt_id, status: appended.status, hold_codes: appended.hold_codes, receipt: appended.receipt });
        if (appended.status === 'HOLD') decisionStatus = 'HOLD';
      }
      // Every failed attempt is committed, but a failed decision transaction never
      // contributes partial decisions to the rehydrated ledger or advances reads.
      const proposals = result.cursor_proposals ?? [];
      let cursorStatus = 'NOT_ADVANCED';
      const latestObserved = runs.filter((r) => r.receipt.cursor_status.startsWith('ADVANCED')).at(-1)?.result.observed_at;
      if (latestObserved && (!timestamp(result.observed_at) || Date.parse(result.observed_at) < Date.parse(latestObserved))) {
        decisionStatus = 'HOLD'; cursorStatus = 'STALE_OBSERVATION';
      }
      const eligibleProposals = proposals.filter((p) => p.eligible === true);
      if (decisionStatus === 'RECORDED' && eligibleProposals.length > 0) {
        const matching = eligibleProposals.every((p) => {
          const row = db.prepare('SELECT cursor FROM intake_cursors WHERE source=? AND scope=?').get(p.source, p.scope_ref);
          return (row?.cursor ?? null) === p.before;
        });
        if (matching) {
          for (const p of eligibleProposals) db.prepare(`INSERT INTO intake_cursors VALUES (?,?,?)
            ON CONFLICT(source,scope) DO UPDATE SET cursor=excluded.cursor`).run(p.source, p.scope_ref, p.after);
          cursorStatus = eligibleProposals.length === proposals.length ? 'ADVANCED' : 'ADVANCED_PARTIAL';
        } else { cursorStatus = 'CONFLICT'; decisionStatus = 'HOLD'; }
      }
      if (decisionStatus === 'HOLD') for (const decision of decisions) {
        decision.status = 'ROLLED_BACK'; decision.receipt = null;
      }
      const receipt = { run_id: result.run_id, input_sha256: result.input_sha256,
        provenance, decision_status: decisionStatus, cursor_status: cursorStatus,
        decisions, sequence: runs.length + 1, external_effects: 0 };
      db.prepare('INSERT INTO intake_runs VALUES (?,?,?,?,?,?)').run(runs.length + 1, result.run_id,
        result.input_sha256, JSON.stringify(result), digest({ result, receipt }), JSON.stringify(receipt));
      return { status: 'COMMITTED', receipt };
    });
  }
  function exposureEvents() {
    return db.prepare('SELECT * FROM intake_exposure_events ORDER BY sequence').all().map((row) => {
      const value = JSON.parse(row.payload);
      if (digest(value) !== row.payload_digest || value.exposure_key !== row.exposure_key
        || value.reservation_ref !== row.reservation_ref || value.attempt_ref !== row.attempt_ref
        || value.state !== row.state) fail('STORE_INTEGRITY_FAILED');
      return value;
    });
  }
  function insertExposure(event) {
    db.prepare(`INSERT INTO intake_exposure_events(exposure_key,reservation_ref,attempt_ref,state,payload,payload_digest)
      VALUES (?,?,?,?,?,?)`).run(event.exposure_key, event.reservation_ref, event.attempt_ref, event.state, JSON.stringify(event), digest(event));
  }
  async function reserveExposure(request, { checkAccess } = {}) {
    if (!request || !['attempt_ref', 'recipient_ref', 'destination_ref', 'permission_ref'].every((k) => token(request[k]))
      || !timestamp(request.observed_at) || typeof checkAccess !== 'function') return hold('STORE_EXPOSURE_INVALID');
    const bound = freeze({ attempt_ref: request.attempt_ref, recipient_ref: request.recipient_ref,
      destination_ref: request.destination_ref, permission_ref: request.permission_ref, observed_at: request.observed_at });
    let access;
    try { access = await checkAccess(bound); } catch { return hold('STORE_ACCESS_UNAVAILABLE'); }
    // The injected port attests current access for this exact read. A string ref
    // or an old checked-at stamp alone is not authorization.
    if (access?.allowed !== true || access?.request_sha256 !== digest(bound)) return hold('STORE_ACCESS_DENIED');
    return transaction(() => {
      const runs = readRuns(); const ledger = hydrate(runs);
      const origin = runs.find((r) => r.receipt.decision_status === 'RECORDED'
        && r.result.attempts.some((a) => a.attempt_id === bound.attempt_ref));
      const found = origin?.result.attempts.find((a) => a.attempt_id === bound.attempt_ref);
      if (!found || !['NEW', 'FOLLOW_UP', 'EVIDENCE'].includes(found.classification) || !found.shadow_cycle
        || !ledger.inspectProject(project_ref).capsule.active_proposals.some((p) => p.cycle_id === found.shadow_cycle.cycle_id)) {
        return hold('STORE_PROPOSAL_NOT_ACTIVE');
      }
      // Core capsules preserve historical proposals unless explicitly corrected.
      // A newer contrary or failed observation must still prevent old exposure.
      const later = runs.filter((r) => r.receipt.sequence > origin.receipt.sequence);
      if (Date.parse(bound.observed_at) < Date.parse(origin.result.observed_at)
        || later.some((r) => r.result.attempts.some((a) => a.kind === 'event'
          && ((a.event_identity === found.event_identity && a.semantic_digest !== found.semantic_digest)
            || (a.task_identity === found.task_identity && a.classification === 'NO_ACTION'))))) {
        return hold('STORE_PROPOSAL_STALE');
      }
      const key = digest([project_ref, found.task_identity, found.semantic_digest, bound.recipient_ref, bound.destination_ref]);
      const events = exposureEvents().filter((e) => e.exposure_key === key);
      const last = events.at(-1);
      if (last && last.state !== 'NOT_DELIVERED') return {
        status: last.state === 'ACKNOWLEDGED' ? 'SUPPRESSED' : 'HOLD',
        hold_codes: last.state === 'ACKNOWLEDGED' ? [] : ['EXPOSURE_ACK_UNKNOWN'], exposure_key: key,
      };
      const event = { ...bound, exposure_key: key, reservation_ref: `exposure_${randomUUID()}`,
        state: 'ACK_UNKNOWN', evidence_ref: null };
      insertExposure(event);
      return { status: 'RESERVED', exposure_key: key, reservation_ref: event.reservation_ref,
        state: event.state, external_effects: 0 };
    });
  }
  async function reconcileExposure(request, { verifyReadback } = {}) {
    if (!request || !/^[a-f0-9]{64}$/u.test(request.exposure_key) || !token(request.reservation_ref)
      || !token(request.evidence_ref) || !timestamp(request.observed_at)
      || !['ACKNOWLEDGED', 'NOT_DELIVERED', 'ACK_UNKNOWN'].includes(request.state)
      || typeof verifyReadback !== 'function') return hold('STORE_RECONCILE_INVALID');
    const bound = freeze({ exposure_key: request.exposure_key, reservation_ref: request.reservation_ref,
      evidence_ref: request.evidence_ref, observed_at: request.observed_at, state: request.state });
    let proof;
    try { proof = await verifyReadback(bound); } catch { return hold('STORE_READBACK_UNAVAILABLE'); }
    if (proof?.verified !== true || proof?.request_sha256 !== digest(bound)) return hold('STORE_READBACK_UNVERIFIED');
    request = bound;
    return transaction(() => {
      const last = exposureEvents().filter((e) => e.exposure_key === request.exposure_key).at(-1);
      if (!last || last.reservation_ref !== request.reservation_ref) return hold('STORE_RESERVATION_MISMATCH');
      if (Date.parse(request.observed_at) < Date.parse(last.observed_at)) return hold('STORE_RECONCILE_STALE');
      if (last.state !== 'ACK_UNKNOWN') return last.state === request.state
        ? { status: 'REPLAY', state: last.state } : hold('STORE_EXPOSURE_TERMINAL');
      insertExposure({ ...last, state: request.state, evidence_ref: request.evidence_ref, observed_at: request.observed_at });
      return { status: 'RECORDED', state: request.state, external_effects: 0 };
    });
  }
  function commitEvaluation(evaluation) {
    if (provenance !== 'synthetic' || !isWorkIntakeEvaluation(evaluation) || evaluation.report.provenance !== 'synthetic') return hold('STORE_EVALUATION_INVALID');
    return transaction(() => {
      const report = evaluation.report;
      const run = readRuns().find((r) => r.result.run_id === report.run_id);
      if (!run || run.result.input_sha256 !== report.input_sha256 || run.result.snapshot_sha256 !== report.snapshot_sha256) {
        return hold('STORE_EVALUATION_UNBOUND');
      }
      const key = digest([report.run_id, report.case_set_ref, report.case_set_sha256, report.evaluated_at]);
      const previous = db.prepare('SELECT payload_digest FROM intake_evaluations WHERE evaluation_key=?').get(key);
      if (previous) return previous.payload_digest === digest(report)
        ? { status: 'REPLAY', evaluation_key: key } : hold('STORE_EVALUATION_CONFLICT');
      db.prepare('INSERT INTO intake_evaluations VALUES (?,?,?,?)').run(key, report.run_id, JSON.stringify(report), digest(report));
      return { status: 'RECORDED', evaluation_key: key, decision_status: run.receipt.decision_status,
        cursor_status: run.receipt.cursor_status, external_effects: 0 };
    });
  }
  function inspect() {
    return transaction(() => {
      const runs = readRuns(); const ledger = hydrate(runs); const events = exposureEvents();
      const evaluations = db.prepare('SELECT * FROM intake_evaluations ORDER BY rowid').all().map((row) => {
        const report = JSON.parse(row.payload);
        const run = runs.find((r) => r.result.run_id === row.run_id);
        if (digest(report) !== row.payload_digest || !run || report.input_sha256 !== run.result.input_sha256) fail('STORE_INTEGRITY_FAILED');
        return { evaluation_key: row.evaluation_key, report, decision_status: run.receipt.decision_status, cursor_status: run.receipt.cursor_status };
      });
      return { status: 'INSPECTED', provenance, project_ref,
        run_count: runs.length, attempt_count: runs.reduce((n, r) => n + r.result.attempts.length, 0),
        failed_attempts: runs.reduce((n, r) => n + r.result.attempts.filter((a) => a.classification === 'HOLD').length, 0),
        cursors: db.prepare('SELECT source,scope,cursor FROM intake_cursors ORDER BY source,scope').all(),
        decision_capsule: ledger.inspectProject(project_ref).capsule,
        exposure_events: events, evaluations, receipts: runs.map((r) => r.receipt), external_effects: 0 };
    });
  }
  function close() { if (!closed) { db.close(); closed = true; } }
  return Object.freeze({ status: 'OPEN', commitResult, commitEvaluation, inspect, reserveExposure, reconcileExposure, close });
}

export const workIntakeExposureRequestDigest = digest;

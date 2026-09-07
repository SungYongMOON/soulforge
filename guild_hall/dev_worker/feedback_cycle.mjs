// Durable, serial feedback orchestration over an already opened control DB.
// Source verification, scoped execution, independent checks/review and reporting
// are separate server-owned ports; no provider text can supply those functions.
import { createHash, randomBytes } from 'node:crypto';
import { normalizeTaskPacket } from './claim_task.mjs';

const HASH = /^[a-f0-9]{64}$/u;
const REF = { test: value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u.test(value) };
const KINDS = new Set(['bug', 'feature', 'improvement']);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { feedbackCode: code }); };
const iso = value => new Date(value).toISOString();
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const frozenCopy = value => {
  const copy = structuredClone(value);
  const freeze = part => { if (part && typeof part === 'object') { Object.values(part).forEach(freeze); Object.freeze(part); } };
  freeze(copy); return copy;
};
const DDL = `
CREATE TABLE IF NOT EXISTS dev_feedback_revision (
 source_ref TEXT NOT NULL, semantic_sha256 TEXT NOT NULL, source_revision TEXT NOT NULL,
 kind TEXT NOT NULL, scope_ref TEXT NOT NULL, revision_no INTEGER NOT NULL, current INTEGER NOT NULL,
 status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, observed_at TEXT NOT NULL,
 PRIMARY KEY(source_ref,semantic_sha256)
);
CREATE TABLE IF NOT EXISTS dev_feedback_run (
 run_ref TEXT PRIMARY KEY, source_ref TEXT NOT NULL, semantic_sha256 TEXT NOT NULL,
 instance_ref TEXT NOT NULL, fence INTEGER NOT NULL, state TEXT NOT NULL,
 started_at TEXT NOT NULL, deadline_at TEXT NOT NULL, finished_at TEXT,
 packet_sha256 TEXT, candidate_ref TEXT, validation_ref TEXT, review_ref TEXT, report_ref TEXT, reason TEXT
);
CREATE TABLE IF NOT EXISTS dev_feedback_echo (
 source_ref TEXT NOT NULL, semantic_sha256 TEXT NOT NULL, report_ref TEXT NOT NULL,
 PRIMARY KEY(source_ref,semantic_sha256)
);
CREATE TABLE IF NOT EXISTS dev_feedback_clock (id INTEGER PRIMARY KEY CHECK(id=1), last_tick TEXT NOT NULL);
`;

export function createFeedbackCycle({ db, source, prepare, execute, validate, review, report, authorize,
  verifyRecovery = null, verifyRetry = null,
  now = Date.now, maxRunsPerDay = 4, maxAttemptsPerRevision = 2, runDeadlineMs = 300_000 } = {}) {
  if (!db || ![source?.snapshot, source?.current, prepare, execute, validate, review, report, authorize].every(fn => typeof fn === 'function')) {
    throw new TypeError('feedback_ports_required');
  }
  if (!Number.isInteger(maxRunsPerDay) || maxRunsPerDay < 1 || maxRunsPerDay > 100
    || !Number.isInteger(maxAttemptsPerRevision) || maxAttemptsPerRevision < 1 || maxAttemptsPerRevision > 3
    || !Number.isInteger(runDeadlineMs) || runDeadlineMs < 1_000 || runDeadlineMs > 600_000) throw new TypeError('feedback_budget_invalid');
  db.exec(DDL);
  const instance = `feedback.instance.${randomBytes(12).toString('hex')}`;
  let inFlight = null, stopped = false, activeAbort = null;
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
  }
  function normalizeSnapshot(value) {
    if (!exact(value, ['status', 'snapshot_ref', 'items']) || value.status !== 'CURRENT'
      || !REF.test(value.snapshot_ref) || !Array.isArray(value.items) || value.items.length > 256) fail('FEEDBACK_SOURCE_UNAVAILABLE');
    const refs = new Set();
    return value.items.map(item => {
      if (!exact(item, ['source_ref', 'semantic_sha256', 'source_revision', 'scope_ref', 'kind'])
        || ![item.source_ref, item.source_revision, item.scope_ref].every(v => typeof v === 'string' && REF.test(v))
        || !HASH.test(item.semantic_sha256) || !KINDS.has(item.kind) || refs.has(item.source_ref)) fail('FEEDBACK_SOURCE_INVALID');
      refs.add(item.source_ref); return Object.freeze({ ...item });
    });
  }
  async function check(action, item, execution = {}) {
    if (stopped || await authorize(action, item, execution) !== true
      || await source.current(item.source_ref, item.semantic_sha256) !== true) fail('FEEDBACK_AUTHORITY_OR_SOURCE_CHANGED');
  }
  function ingest(items) {
    const at = iso(now());
    // A snapshot is a complete bounded set. Absence retires authority; an older
    // semantic hash can become current again without restarting completed work.
    const visible = new Set(items.map(item => item.source_ref));
    for (const row of db.prepare('SELECT source_ref FROM dev_feedback_revision WHERE current=1').all()) {
      if (!visible.has(row.source_ref)) db.prepare("UPDATE dev_feedback_revision SET current=0,status=CASE WHEN status='queued' THEN 'superseded' ELSE status END WHERE source_ref=?").run(row.source_ref);
    }
    for (const item of items) {
      if (db.prepare('SELECT 1 FROM dev_feedback_echo WHERE source_ref=? AND semantic_sha256=?').get(item.source_ref, item.semantic_sha256)) {
        db.prepare("UPDATE dev_feedback_revision SET current=0,status=CASE WHEN status='queued' THEN 'superseded' ELSE status END WHERE source_ref=?").run(item.source_ref);
        continue;
      }
      const prior = db.prepare('SELECT * FROM dev_feedback_revision WHERE source_ref=? AND semantic_sha256=?').get(item.source_ref, item.semantic_sha256);
      // Poll timestamp/status chatter and our own report never reopen work.
      if (prior) {
        if (prior.kind !== item.kind || prior.scope_ref !== item.scope_ref) fail('FEEDBACK_SEMANTIC_CONFLICT');
        db.prepare("UPDATE dev_feedback_revision SET current=0,status=CASE WHEN status='queued' THEN 'superseded' ELSE status END WHERE source_ref=? AND semantic_sha256<>?").run(item.source_ref, item.semantic_sha256);
        db.prepare("UPDATE dev_feedback_revision SET current=1,source_revision=?,status=CASE WHEN status='superseded' AND attempts=0 THEN 'queued' ELSE status END WHERE source_ref=? AND semantic_sha256=?")
          .run(item.source_revision, item.source_ref, item.semantic_sha256);
        continue;
      }
      if (db.prepare('SELECT count(*) AS n FROM dev_feedback_revision').get().n >= 10_000) fail('FEEDBACK_HISTORY_LIMIT');
      const number = db.prepare('SELECT coalesce(max(revision_no),0)+1 AS n FROM dev_feedback_revision WHERE source_ref=?').get(item.source_ref).n;
      db.prepare("UPDATE dev_feedback_revision SET current=0,status=CASE WHEN status='queued' THEN 'superseded' ELSE status END WHERE source_ref=?").run(item.source_ref);
      db.prepare('INSERT INTO dev_feedback_revision VALUES(?,?,?,?,?,?,1,\'queued\',0,?)')
        .run(item.source_ref, item.semantic_sha256, item.source_revision, item.kind, item.scope_ref, number, at);
    }
    db.prepare('INSERT INTO dev_feedback_clock VALUES(1,?) ON CONFLICT(id) DO UPDATE SET last_tick=excluded.last_tick').run(at);
  }
  function claim() {
    const active = db.prepare("SELECT * FROM dev_feedback_run WHERE state IN ('running','execution_unknown') LIMIT 1").get();
    if (active) return { status: active.state === 'execution_unknown' || Date.parse(active.deadline_at) <= now() ? 'RECOVERY_REQUIRED' : 'BUSY', run_ref: active.run_ref };
    const day = iso(now()).slice(0, 10);
    if (db.prepare('SELECT count(*) AS n FROM dev_feedback_run WHERE substr(started_at,1,10)=?').get(day).n >= maxRunsPerDay) return { status: 'BUDGET_EXHAUSTED' };
    const item = db.prepare("SELECT * FROM dev_feedback_revision WHERE current=1 AND status='queued' AND attempts<? ORDER BY observed_at,source_ref LIMIT 1").get(maxAttemptsPerRevision);
    if (!item) return { status: 'NO_CHANGE' };
    const run = { run_ref: `feedback.run.${randomBytes(12).toString('hex')}`, source_ref: item.source_ref,
      semantic_sha256: item.semantic_sha256, instance_ref: instance, fence: item.attempts + 1,
      started_at: iso(now()), deadline_at: iso(now() + runDeadlineMs) };
    db.prepare("INSERT INTO dev_feedback_run(run_ref,source_ref,semantic_sha256,instance_ref,fence,state,started_at,deadline_at) VALUES(?,?,?,?,?,'running',?,?)")
      .run(run.run_ref, run.source_ref, run.semantic_sha256, instance, run.fence, run.started_at, run.deadline_at);
    db.prepare("UPDATE dev_feedback_revision SET status='running',attempts=attempts+1 WHERE source_ref=? AND semantic_sha256=?")
      .run(item.source_ref, item.semantic_sha256);
    return { status: 'CLAIMED', run, item };
  }
  function finish(run, state, refs = {}, reason = null) {
    return transaction(() => {
      const current = db.prepare('SELECT * FROM dev_feedback_revision WHERE source_ref=? AND semantic_sha256=?').get(run.source_ref, run.semantic_sha256);
      const row = db.prepare('SELECT * FROM dev_feedback_run WHERE run_ref=?').get(run.run_ref);
      if (!row || row.state !== 'running' || row.instance_ref !== instance || row.fence !== run.fence) return { status: 'FENCED' };
      if (state !== 'execution_unknown' && (!current?.current || Date.parse(run.deadline_at) <= now())) { state = 'held_internal'; reason = 'SOURCE_CHANGED_OR_DEADLINE'; }
      db.prepare('UPDATE dev_feedback_run SET state=?,finished_at=?,packet_sha256=?,candidate_ref=?,validation_ref=?,review_ref=?,report_ref=?,reason=? WHERE run_ref=?')
        .run(state, iso(now()), refs.packet_sha256 ?? null, refs.candidate_ref ?? null, refs.validation_ref ?? null,
          refs.review_ref ?? null, refs.report_ref ?? null, reason, run.run_ref);
      db.prepare('UPDATE dev_feedback_revision SET status=? WHERE source_ref=? AND semantic_sha256=?').run(state, run.source_ref, run.semantic_sha256);
      return { status: state.toUpperCase(), run_ref: run.run_ref, ...refs, reason, official_done: false, canonical_accepted: false };
    });
  }
  async function perform(claimed) {
    const { item, run } = claimed;
    const refs = {};
    const abort = new AbortController(); activeAbort = abort;
    let stage = 'prepare', dispatched = false;
    async function call(name, port, ...args) {
      stage = name;
      dispatched = false;
      await check(name, item, {run_ref:run.run_ref,packet_sha256:refs.packet_sha256??null});
      const remaining = Date.parse(run.deadline_at) - now();
      if (remaining <= 0) fail('FEEDBACK_DEADLINE');
      let timer, listener;
      try {
        return await Promise.race([
          Promise.resolve().then(() => { dispatched = true; return port(...args, { run_ref: run.run_ref, deadline_at: run.deadline_at, signal: abort.signal }); }),
          new Promise((_, reject) => {
            listener = () => reject(Object.assign(new Error('interrupted'), { feedbackCode: 'FEEDBACK_INTERRUPTED' }));
            abort.signal.addEventListener('abort', listener, { once: true });
            timer = setTimeout(() => abort.abort(), remaining);
            if (abort.signal.aborted) listener();
          }),
        ]);
      } finally { clearTimeout(timer); abort.signal.removeEventListener('abort', listener); }
    }
    try {
      const packet = await call('prepare', prepare, item);
      if (!packet || packet.status !== 'READY' || !packet.packet || !HASH.test(packet.packet_sha256)
        || hash(packet.packet) !== packet.packet_sha256) fail('FEEDBACK_PACKET_UNAVAILABLE');
      const pinnedPacket = frozenCopy(packet.packet);
      if (hash(pinnedPacket) !== packet.packet_sha256) fail('FEEDBACK_PACKET_UNAVAILABLE');
      const normalized = normalizeTaskPacket(pinnedPacket, { packet_path: 'feedback.yaml', packet_ref: item.source_ref });
      if (packet.packet.schema_version !== 'soulforge.dev_worker_request.v0' || !normalized.eligible
        || packet.packet.origin?.kind !== 'agent_generated') fail('FEEDBACK_PACKET_INELIGIBLE');
      refs.packet_sha256 = packet.packet_sha256;
      const candidate = await call('execute', execute, frozenCopy(pinnedPacket));
      if (!candidate || !REF.test(candidate.candidate_ref)) fail('FEEDBACK_CANDIDATE_UNAVAILABLE');
      refs.candidate_ref = candidate.candidate_ref;
      const checked = await call('validate', validate, frozenCopy(candidate), frozenCopy(pinnedPacket));
      if (checked?.status !== 'PASS' || !REF.test(checked.validation_ref)) fail('FEEDBACK_VALIDATION_FAILED');
      refs.validation_ref = checked.validation_ref;
      const reviewed = await call('review', review, frozenCopy(candidate), frozenCopy(checked), frozenCopy(pinnedPacket));
      if (reviewed?.status !== 'ACCEPT' || !REF.test(reviewed.review_ref)) fail('FEEDBACK_REVIEW_REQUIRED');
      refs.review_ref = reviewed.review_ref;
      const reported = await call('report', report, { ...refs, run_ref: run.run_ref, source_ref: item.source_ref, semantic_sha256: item.semantic_sha256 });
      if (!reported || !REF.test(reported.report_ref)) fail('FEEDBACK_REPORT_UNCONFIRMED');
      refs.report_ref = reported.report_ref;
      await check('record_result', item, {run_ref:run.run_ref,packet_sha256:refs.packet_sha256});
      return finish(run, 'candidate_reported', refs);
    } catch (error) {
      const code = typeof error.feedbackCode === 'string' && /^[A-Z_]{1,80}$/u.test(error.feedbackCode) ? error.feedbackCode : 'FEEDBACK_STAGE_FAILED';
      const uncertain = code === 'FEEDBACK_INTERRUPTED' || (dispatched && ['execute', 'report'].includes(stage));
      return finish(run, uncertain ? 'execution_unknown' : 'held_internal', refs, code);
    } finally { if (activeAbort === abort) activeAbort = null; }
  }
  async function tick() {
    const items = normalizeSnapshot(await source.snapshot());
    for (const item of items) await check('observe', item);
    const claimed = transaction(() => { ingest(items); return claim(); });
    return claimed.status === 'CLAIMED' ? perform(claimed) : claimed;
  }
  return Object.freeze({
    runOnce() {
      if (stopped) return Promise.resolve({ status: 'STOPPED' });
      if (!inFlight) inFlight = tick().finally(() => { inFlight = null; });
      return inFlight;
    },
    recordEcho({ source_ref, semantic_sha256, report_ref }) {
      if (![source_ref, report_ref].every(v => typeof v === 'string' && REF.test(v)) || !HASH.test(semantic_sha256)) fail('FEEDBACK_ECHO_INVALID');
      db.prepare('INSERT OR IGNORE INTO dev_feedback_echo VALUES(?,?,?)').run(source_ref, semantic_sha256, report_ref);
    },
    async recover(runRef) {
      if (!REF.test(runRef) || typeof verifyRecovery !== 'function') fail('FEEDBACK_RECOVERY_UNAVAILABLE');
      const run = db.prepare('SELECT * FROM dev_feedback_run WHERE run_ref=?').get(runRef);
      if (!run || !['running','execution_unknown'].includes(run.state) || Date.parse(run.deadline_at) > now()) fail('FEEDBACK_RECOVERY_NOT_ELIGIBLE');
      const revision = db.prepare('SELECT * FROM dev_feedback_revision WHERE source_ref=? AND semantic_sha256=?').get(run.source_ref,run.semantic_sha256);
      // Recovery needs the original exact scope, which lives on the revision.
      // It records stopped-work evidence only; it never starts superseded work.
      if (!revision || await authorize('recover', frozenCopy(revision), {run_ref:runRef,packet_sha256:run.packet_sha256}) !== true) fail('FEEDBACK_RECOVERY_DENIED');
      const proof = await verifyRecovery(run);
      if (proof?.run_ref !== runRef || proof.stopped !== true || !REF.test(proof.receipt_ref)) fail('FEEDBACK_RECOVERY_UNCONFIRMED');
      if (stopped || await authorize('recover', frozenCopy(revision), {run_ref:runRef,packet_sha256:run.packet_sha256}) !== true) fail('FEEDBACK_RECOVERY_DENIED');
      return transaction(() => {
        const changed = db.prepare("UPDATE dev_feedback_run SET state='held_internal',finished_at=?,reason='INTERRUPTED_EXECUTION_INSPECTED',review_ref=? WHERE run_ref=? AND state=? AND fence=?")
          .run(iso(now()), proof.receipt_ref, runRef, run.state, run.fence);
        if (Number(changed.changes) !== 1) return { status: 'FENCED' };
        db.prepare("UPDATE dev_feedback_revision SET status='held_internal' WHERE source_ref=? AND semantic_sha256=?")
          .run(run.source_ref, run.semantic_sha256);
        return { status: 'RECOVERED_FOR_INTERNAL_REVIEW', run_ref: runRef, receipt_ref: proof.receipt_ref };
      });
    },
    async retry(runRef) {
      if (!REF.test(runRef) || typeof verifyRetry !== 'function') fail('FEEDBACK_RETRY_UNAVAILABLE');
      const run = db.prepare('SELECT * FROM dev_feedback_run WHERE run_ref=?').get(runRef);
      const revision = run && db.prepare('SELECT * FROM dev_feedback_revision WHERE source_ref=? AND semantic_sha256=?').get(run.source_ref, run.semantic_sha256);
      if (!run || run.state !== 'held_internal' || !revision?.current || revision.status !== 'held_internal'
        || revision.attempts >= maxAttemptsPerRevision || run.fence !== revision.attempts) fail('FEEDBACK_RETRY_NOT_ELIGIBLE');
      await check('retry', revision);
      const proof = await verifyRetry(frozenCopy(run));
      if (proof?.run_ref !== runRef || proof.stopped !== true || proof.side_effects_resolved !== true
        || !REF.test(proof.receipt_ref)) fail('FEEDBACK_RETRY_UNCONFIRMED');
      await check('retry', revision);
      return transaction(() => {
        const active = db.prepare("SELECT 1 FROM dev_feedback_run WHERE state IN ('running','execution_unknown') LIMIT 1").get();
        if (active) return { status: 'BUSY' };
        const changed = db.prepare("UPDATE dev_feedback_revision SET status='queued' WHERE source_ref=? AND semantic_sha256=? AND current=1 AND status='held_internal' AND attempts=?")
          .run(run.source_ref, run.semantic_sha256, run.fence);
        if (Number(changed.changes) !== 1) return { status: 'FENCED' };
        db.prepare("UPDATE dev_feedback_run SET reason='INTERNAL_RETRY_INSPECTED',review_ref=? WHERE run_ref=?").run(proof.receipt_ref, runRef);
        return { status: 'REQUEUED', run_ref: runRef, receipt_ref: proof.receipt_ref };
      });
    },
    state() {
      return { revisions: db.prepare('SELECT * FROM dev_feedback_revision ORDER BY source_ref,revision_no').all(),
        runs: db.prepare('SELECT * FROM dev_feedback_run ORDER BY started_at,run_ref').all(),
        last_tick: db.prepare('SELECT last_tick FROM dev_feedback_clock WHERE id=1').get()?.last_tick ?? null,
        official_done: false, canonical_accepted: false };
    },
    stop() { stopped = true; activeAbort?.abort(); return inFlight ?? Promise.resolve({ status: 'STOPPED' }); },
  });
}

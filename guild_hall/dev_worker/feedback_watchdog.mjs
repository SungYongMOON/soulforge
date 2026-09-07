// Model-free watchdog. Run independently of the development worker; a stalled
// worker cannot manufacture a healthy tick. Notifications target its manager,
// not an Owner approval queue, and carry bounded control metadata only.
import { createHash, randomBytes } from 'node:crypto';

const ref = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u.test(value);
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// This reader can use an independently opened read-only connection. It does not
// construct a worker, create tables in its DB, or renew the worker's last_tick.
export function readFeedbackWatchState(workerDb) {
  return{last_tick:workerDb.prepare('SELECT last_tick FROM dev_feedback_clock WHERE id=1').get()?.last_tick??null,
    runs:workerDb.prepare("SELECT run_ref,state,deadline_at FROM dev_feedback_run WHERE state IN ('running','execution_unknown') ORDER BY started_at LIMIT 21").all()};
}

export function inspectFeedbackHealth(state, { now = Date.now(), maxTickAgeMs = 180_000 } = {}) {
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(maxTickAgeMs) || maxTickAgeMs < 1_000) throw new TypeError('watchdog_clock_invalid');
  if (!state || !Array.isArray(state.runs) || state.runs.length > 10_000
    || (state.last_tick !== null && !date(state.last_tick))) return { status: 'SOURCE_UNAVAILABLE', run_refs: [] };
  if(state.runs.some(row=>!row || !ref(row.run_ref) || !date(row.deadline_at)
    || !['running','execution_unknown','held_internal','candidate_reported'].includes(row.state))) return {status:'SOURCE_UNAVAILABLE',run_refs:[]};
  const active = state.runs.filter(row => ['running', 'execution_unknown'].includes(row.state));
  if (active.some(row => !ref(row.run_ref) || !date(row.deadline_at))) return { status: 'SOURCE_UNAVAILABLE', run_refs: [] };
  const unknown = active.filter(row => row.state === 'execution_unknown').map(row => row.run_ref).sort();
  if (unknown.length) return { status: 'EXECUTION_UNKNOWN', run_refs: unknown.slice(0, 20) };
  const overdue = active.filter(row => Date.parse(row.deadline_at) <= now).map(row => row.run_ref).sort();
  if (overdue.length) return { status: 'EXECUTION_OVERDUE', run_refs: overdue.slice(0, 20) };
  if (state.last_tick === null) return { status: 'NEVER_STARTED', run_refs: [] };
  if (Date.parse(state.last_tick) > now || now - Date.parse(state.last_tick) > maxTickAgeMs) return { status: 'TICK_STALE', run_refs: [] };
  return { status: 'HEALTHY', run_refs: [] };
}

export function createFeedbackWatchdog({ db, readState, notifyManager, now = Date.now,
  maxTickAgeMs = 180_000, retryAfterMs = 60_000, maxAttempts = 3, portTimeoutMs = 5_000 } = {}) {
  if (!db || typeof readState !== 'function' || typeof notifyManager !== 'function'
    || !Number.isSafeInteger(retryAfterMs) || retryAfterMs < 1_000
    || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3
    || !Number.isSafeInteger(portTimeoutMs) || portTimeoutMs < 10 || portTimeoutMs > 30_000) throw new TypeError('watchdog_ports_invalid');
  // Separate records from the worker ledger: this process never marks work done,
  // renews worker leases, repairs authority or launches an inference.
  db.exec(`CREATE TABLE IF NOT EXISTS dev_feedback_watch (
    id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, fingerprint TEXT NOT NULL,
    status TEXT NOT NULL, observed_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS dev_feedback_watch_notice (
    revision INTEGER PRIMARY KEY, notice_ref TEXT NOT NULL, status TEXT NOT NULL,
    attempts INTEGER NOT NULL, last_attempt_at INTEGER, receipt_ref TEXT);`);
  let inFlight = null;
  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = action(); db.exec('COMMIT'); return result; }
    catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
  }
  async function bounded(port, ...args) {
    let timer; const abort = new AbortController();
    try {
      return await Promise.race([Promise.resolve().then(()=>port(...args,{signal:abort.signal})),
        new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new Error('watchdog_port_timeout'));},portTimeoutMs);})]);
    } finally { clearTimeout(timer); }
  }
  async function check() {
    let observed;
    try { observed = inspectFeedbackHealth(await bounded(readState), { now: now(), maxTickAgeMs }); }
    catch { observed = { status: 'SOURCE_UNAVAILABLE', run_refs: [] }; }
    const fingerprint = digest(observed);
    const claimed = transaction(() => {
      let row = db.prepare('SELECT * FROM dev_feedback_watch WHERE id=1').get();
      if (!row || row.fingerprint !== fingerprint) {
        const revision = (row?.revision ?? 0) + 1;
        db.prepare('INSERT INTO dev_feedback_watch VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,fingerprint=excluded.fingerprint,status=excluded.status,observed_at=excluded.observed_at')
          .run(revision, fingerprint, observed.status, now());
        // Do not announce an initially healthy process. A real recovery is a
        // meaningful change and gets its own single notification.
        if (row || observed.status !== 'HEALTHY') db.prepare("INSERT INTO dev_feedback_watch_notice VALUES(?,?,'queued',0,NULL,NULL)")
          .run(revision, `feedback.notice.${randomBytes(12).toString('hex')}`);
        row = { revision, fingerprint };
      }
      const notice = db.prepare('SELECT * FROM dev_feedback_watch_notice WHERE revision=?').get(row.revision);
      if (!notice || !['queued', 'not_sent'].includes(notice.status) || notice.attempts >= maxAttempts
        || (notice.last_attempt_at !== null && now() - notice.last_attempt_at < retryAfterMs)) return null;
      db.prepare("UPDATE dev_feedback_watch_notice SET status='delivery_unknown',attempts=attempts+1,last_attempt_at=? WHERE revision=?").run(now(), row.revision);
      return { ...notice, revision: row.revision, attempts: notice.attempts + 1 };
    });
    if (!claimed) return { ...observed, notification: 'UNCHANGED_OR_HELD', owner_decision_required: false };
    let delivery;
    try {
      delivery = await bounded(notifyManager,Object.freeze({ notice_ref: claimed.notice_ref, ...observed,
        run_refs: Object.freeze([...observed.run_refs]), owner_decision_required: false }));
    } catch { /* A lost response is not proof of no delivery. */ }
    const status = delivery?.status === 'delivered' && ref(delivery.receipt_ref) ? 'delivered'
      : delivery?.status === 'not_sent' ? 'not_sent' : 'delivery_unknown';
    db.prepare('UPDATE dev_feedback_watch_notice SET status=?,receipt_ref=? WHERE revision=? AND status=\'delivery_unknown\' AND attempts=?')
      .run(status, status === 'delivered' ? delivery.receipt_ref : null, claimed.revision, claimed.attempts);
    return { ...observed, notification: status.toUpperCase(), owner_decision_required: false };
  }
  return Object.freeze({ watchOnce() {
    if (!inFlight) inFlight = check().finally(() => { inFlight = null; });
    return inFlight;
  } });
}

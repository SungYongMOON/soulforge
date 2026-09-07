import { DatabaseSync } from 'node:sqlite';
import { lstatSync, realpathSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { digestOf, guardEntry } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';

const SHA = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const REQUEST = /^w_[a-f0-9]{32}$/u;
const RUN = /^wx_[a-f0-9]{32}$/u;
const CLAIM_FIELDS = ['claim_key', 'basis_digest', 'request_id', 'requester', 'project_code', 'revision_no', 'revision_of',
  'agent_id', 'binding_digest', 'authority_epoch', 'deadline_at', 'instance_ref'];
const fail = code => { throw Object.assign(new Error(code), { workbenchCode: code }); };
const assert = (condition, code) => { if (!condition) fail(code); };
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const utc = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const held = hold_code => ({ status: 'HOLD', hold_code });
// Extended SQLite result codes retain the primary SQLITE_BUSY (5) in the low byte.
const sqliteBusy = error => error?.code === 'ERR_SQLITE_ERROR' && Number.isInteger(error.errcode) && (error.errcode & 255) === 5;

/**
 * Execution ledger in an independently supplied directory. Its mode is pinned
 * by the file's existing backup_class; a mode switch never reinterprets old rows. SQLite transactions
 * own multi-process claims, active-agent slots and final compare-and-swap. This neither changes
 * the in-memory CEC/Core nor supplies execution authority. No automatic orphan rerun or deletion.
 * OS directory custody remains required; portable path checks do not sandbox hostile OS races.
 */
export function createWorkbenchExecutionStore({ root, now = () => Date.now(), mode = 'synthetic_fixed' } = {}) {
  assert(['synthetic_fixed', 'native_chat'].includes(mode), 'EXECUTION_MODE_INVALID');
  const backupClass = mode === 'native_chat' ? 'native-execution-metadata' : 'synthetic-only';
  if (typeof root !== 'string' || !isAbsolute(root) || resolve(root) === parse(resolve(root)).root) {
    throw new TypeError('Explicit existing execution root required');
  }
  const rootPath = resolve(root);
  let rootIdentity;
  let databaseIdentity;
  function checkRoot() {
    let cursor = rootPath;
    while (true) {
      const stat = lstatSync(cursor);
      assert(stat.isDirectory() && !stat.isSymbolicLink(), 'EXECUTION_ROOT_UNSAFE');
      if (cursor === rootPath) { assert(!rootIdentity || sameFile(rootIdentity, stat), 'EXECUTION_ROOT_CHANGED'); rootIdentity ??= stat; }
      const parent = dirname(cursor); if (parent === cursor) break; cursor = parent;
    }
    assert(samePath(realpathSync(rootPath), rootPath), 'EXECUTION_ROOT_UNSAFE');
    for (const name of readdirSync(rootPath)) {
      assert(['execution.sqlite', 'execution.sqlite-journal'].includes(name), 'EXECUTION_ROOT_ENTRY_UNKNOWN');
      let stat;
      try { stat = lstatSync(join(rootPath, name)); }
      catch (error) { if (name === 'execution.sqlite-journal' && error.code === 'ENOENT') continue; throw error; }
      assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= 32 * 1024 * 1024, 'EXECUTION_FILE_UNSAFE');
      if (name === 'execution.sqlite') {
        assert(!databaseIdentity || sameFile(databaseIdentity, stat), 'EXECUTION_DATABASE_CHANGED'); databaseIdentity ??= stat;
      }
    }
  }
  checkRoot();
  const db = new DatabaseSync(join(rootPath, 'execution.sqlite'));
  try {
    // This connection-local wait must precede even the first format read. It does not modify a foreign file.
    db.exec('PRAGMA busy_timeout=1000;');
    // An existing foreign SQLite file must not receive DDL or journal settings.
    if (databaseIdentity) {
      let metadata;
      try { metadata = db.prepare('SELECT format,backup_class FROM wb_meta WHERE id=1').get(); }
      catch (error) { if (sqliteBusy(error)) throw error; fail('EXECUTION_FORMAT_INVALID'); }
      assert(metadata?.format === 1 && metadata?.backup_class === backupClass, 'EXECUTION_FORMAT_INVALID');
    }
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
    db.exec(`
    CREATE TABLE IF NOT EXISTS wb_meta (id INTEGER PRIMARY KEY CHECK(id=1), format INTEGER NOT NULL, backup_class TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wb_epoch (agent_id TEXT PRIMARY KEY, epoch INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS wb_run (
      run_id TEXT PRIMARY KEY, claim_key TEXT NOT NULL, basis_digest TEXT NOT NULL,
      request_id TEXT UNIQUE NOT NULL, requester TEXT NOT NULL, project_code TEXT NOT NULL,
      revision_no INTEGER NOT NULL, revision_of TEXT, agent_id TEXT NOT NULL,
      binding_digest TEXT NOT NULL, authority_epoch INTEGER NOT NULL, instance_ref TEXT NOT NULL,
      attempt_no INTEGER NOT NULL, fencing_epoch INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('running','succeeded','failed','hold','cancelled')), worker_started_at TEXT,
      reason_code TEXT, started_at TEXT NOT NULL, deadline_at TEXT NOT NULL, completed_at TEXT,
      receipt_json TEXT, receipt_digest TEXT, candidate_bytes BLOB, candidate_sha256 TEXT,
      UNIQUE(claim_key,attempt_no)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS wb_active_agent ON wb_run(agent_id) WHERE state='running';
    CREATE TABLE IF NOT EXISTS wb_link (request_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES wb_run(run_id), revision_no INTEGER NOT NULL);
    `);
    db.prepare('INSERT OR IGNORE INTO wb_meta VALUES(1,1,?)').run(backupClass);
    assert(db.prepare('SELECT format,backup_class FROM wb_meta WHERE id=1').get()?.backup_class === backupClass
      && db.prepare('SELECT format FROM wb_meta WHERE id=1').get()?.format === 1, 'EXECUTION_FORMAT_INVALID');
    checkRoot();
  } catch (error) {
    db.close();
    if (sqliteBusy(error)) fail('EXECUTION_STORE_BUSY');
    throw error;
  }
  function instant() {
    const time = new Date(now()); assert(Number.isFinite(time.getTime()), 'EXECUTION_CLOCK_INVALID'); return time.toISOString();
  }
  function transaction(work) {
    checkRoot(); db.exec('BEGIN IMMEDIATE');
    try { const value = work(); checkRoot(); db.exec('COMMIT'); return value; }
    catch (error) { try { db.exec('ROLLBACK'); } catch { /* Original failure retained. */ } throw error; }
  }
  function row(runId) { return db.prepare('SELECT * FROM wb_run WHERE run_id=?').get(runId) ?? null; }
  function view(value, instanceRef) {
    if (!value) return null;
    const { candidate_bytes, receipt_json, receipt_digest, ...metadata } = value;
    let receipt = null;
    if (receipt_json !== null) {
      try { receipt = JSON.parse(receipt_json); } catch { fail('EXECUTION_RECEIPT_CORRUPT'); }
      assert(digestOf(receipt) === receipt_digest, 'EXECUTION_RECEIPT_CORRUPT');
    }
    if (candidate_bytes !== null) assert(sha(candidate_bytes) === value.candidate_sha256, 'EXECUTION_CANDIDATE_CORRUPT');
    const recover = value.state === 'running' && (value.instance_ref !== instanceRef || value.deadline_at <= instant());
    // Preserve format-1 SQL compatibility: the terminal response observation is
    // represented by a reserved HOLD reason + receipt, never by candidate success.
    const responseObserved = mode === 'native_chat' && value.state === 'hold'
      && value.reason_code === 'NATIVE_RESPONSE_OBSERVED' && receipt?.response_observed === true;
    return { ...metadata, receipt, candidate_present: candidate_bytes !== null, response_observed: responseObserved,
      execution_mode: mode,
      state: responseObserved ? 'response_observed' : value.state,
      observed_state: recover ? 'hold' : responseObserved ? 'response_observed' : value.state,
      observed_reason: recover ? 'RUN_RECOVERY_REQUIRED' : responseObserved ? null : value.reason_code };
  }
  function expire() {
    // Deadline expiration only fences a run. It never creates a successor or calls an executor.
    db.prepare("UPDATE wb_run SET state='hold',reason_code='RUN_DEADLINE_EXPIRED',completed_at=? WHERE state='running' AND deadline_at<=?").run(instant(), instant());
  }

  return Object.freeze({
    backupClass,
    claim(rawInput) {
      const checked = guardEntry(rawInput, CLAIM_FIELDS, { unknownField: 'EXECUTION_CLAIM_INVALID', secret: 'EXECUTION_CLAIM_INVALID',
        localPath: 'EXECUTION_CLAIM_INVALID', tooDeep: 'EXECUTION_CLAIM_INVALID', tooLarge: 'EXECUTION_CLAIM_INVALID', hostileInput: 'EXECUTION_CLAIM_INVALID', accessor: 'EXECUTION_CLAIM_INVALID' });
      assert(checked.status === 'OK' && Object.keys(checked.value).length === CLAIM_FIELDS.length, 'EXECUTION_CLAIM_INVALID');
      const value = checked.value;
      assert([value.claim_key, value.basis_digest, value.binding_digest].every(digest => SHA.test(digest))
        && REQUEST.test(value.request_id) && /^member\.[a-f0-9]{16}$/u.test(value.requester)
        && (mode === 'native_chat' ? /^[A-Z0-9][A-Z0-9_-]{2,23}$/u.test(value.project_code)
          : /^(?:SYN|SFX)(?:-|_)[A-Z0-9_-]+$/u.test(value.project_code))
        && [value.agent_id, value.instance_ref].every(id => ID.test(id))
        && Number.isSafeInteger(value.revision_no) && value.revision_no >= 1
        && (value.revision_of === null || REQUEST.test(value.revision_of))
        && Number.isSafeInteger(value.authority_epoch) && value.authority_epoch >= 0
        && utc(value.deadline_at) && value.deadline_at > instant(), 'EXECUTION_CLAIM_INVALID');
      return transaction(() => {
        expire();
        const linked = db.prepare('SELECT run_id FROM wb_link WHERE request_id=?').get(value.request_id);
        if (linked) {
          const prior = row(linked.run_id);
          assert(prior.basis_digest === value.basis_digest && prior.requester === value.requester, 'EXECUTION_REPLAY_CONFLICT');
          return { status: 'REPLAY', run: view(prior, value.instance_ref) };
        }
        const previous = db.prepare('SELECT * FROM wb_run WHERE claim_key=? ORDER BY attempt_no DESC LIMIT 1').get(value.claim_key);
        if (previous) {
          assert(previous.basis_digest === value.basis_digest && previous.requester === value.requester, 'EXECUTION_REPLAY_CONFLICT');
          const parentLink = value.revision_of === null ? null : db.prepare('SELECT run_id,revision_no FROM wb_link WHERE request_id=?').get(value.revision_of);
          const successor = ['hold', 'failed', 'cancelled'].includes(previous.state)
            && parentLink?.run_id === previous.run_id && value.revision_no === parentLink.revision_no + 1;
          if (!successor) {
            if (value.revision_of !== null && previous.state === 'running') return held('RUN_STILL_ACTIVE');
            if (value.revision_of !== null && previous.state !== 'succeeded') return held('REVISION_EXECUTION_PARENT_REQUIRED');
            db.prepare('INSERT INTO wb_link VALUES(?,?,?)').run(value.request_id, previous.run_id, value.revision_no);
            return { status: 'REPLAY', run: view(previous, value.instance_ref) };
          }
        }
        if (db.prepare("SELECT 1 FROM wb_run WHERE agent_id=? AND state='running'").get(value.agent_id)) return held('PERFORMING_AGENT_SLOT_BUSY');
        assert(db.prepare('SELECT count(*) AS count FROM wb_run').get().count < 256, 'EXECUTION_STORE_LIMIT');
        const epoch = (db.prepare('SELECT epoch FROM wb_epoch WHERE agent_id=?').get(value.agent_id)?.epoch ?? 0) + 1;
        db.prepare('INSERT INTO wb_epoch VALUES(?,?) ON CONFLICT(agent_id) DO UPDATE SET epoch=excluded.epoch').run(value.agent_id, epoch);
        const runId = `wx_${randomBytes(16).toString('hex')}`;
        db.prepare(`INSERT INTO wb_run(run_id,claim_key,basis_digest,request_id,requester,project_code,revision_no,revision_of,
          agent_id,binding_digest,authority_epoch,instance_ref,attempt_no,fencing_epoch,state,started_at,deadline_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'running',?,?)`).run(runId, value.claim_key, value.basis_digest, value.request_id,
          value.requester, value.project_code, value.revision_no, value.revision_of, value.agent_id, value.binding_digest,
          value.authority_epoch, value.instance_ref, (previous?.attempt_no ?? 0) + 1, epoch, instant(), value.deadline_at);
        db.prepare('INSERT INTO wb_link VALUES(?,?,?)').run(value.request_id, runId, value.revision_no);
        return { status: 'CLAIMED', run: view(row(runId), value.instance_ref) };
      });
    },
    settle({ run_id, fencing_epoch, instance_ref, state, reason_code, receipt = null, candidate_bytes = null }) {
      const responseObserved = mode === 'native_chat' && state === 'response_observed';
      assert(RUN.test(run_id) && Number.isSafeInteger(fencing_epoch) && (responseObserved || ['succeeded', 'failed', 'hold', 'cancelled'].includes(state))
        && (reason_code === null || /^[A-Z][A-Z0-9_]{2,63}$/u.test(reason_code)), 'EXECUTION_SETTLE_INVALID');
      assert(state === 'succeeded' ? reason_code === null && Buffer.isBuffer(candidate_bytes) && candidate_bytes.length > 0
        && candidate_bytes.length <= 65536 && receipt !== null : candidate_bytes === null, 'EXECUTION_CANDIDATE_INVALID');
      if (mode === 'native_chat') {
        assert(state !== 'succeeded' && (receipt === null || (receipt.local_candidate_stored === false
          && receipt.official_task_done === false && receipt.acceptance_authority === false)), 'NATIVE_CUSTODY_NOT_ESTABLISHED');
        assert(!responseObserved || (receipt?.response_observed === true && reason_code === null), 'NATIVE_RESPONSE_RECEIPT_REQUIRED');
        if (responseObserved) { state = 'hold'; reason_code = 'NATIVE_RESPONSE_OBSERVED'; }
      }
      const receiptJson = receipt === null ? null : JSON.stringify(receipt);
      assert(receiptJson === null || Buffer.byteLength(receiptJson) <= 32768, 'EXECUTION_RECEIPT_INVALID');
      return transaction(() => {
        expire(); const current = row(run_id);
        if (!current || current.state !== 'running' || current.fencing_epoch !== fencing_epoch || current.instance_ref !== instance_ref) return held('RUN_FENCED_OUT');
        db.prepare(`UPDATE wb_run SET state=?,reason_code=?,completed_at=?,receipt_json=?,receipt_digest=?,candidate_bytes=?,candidate_sha256=?
          WHERE run_id=? AND fencing_epoch=? AND state='running'`).run(state, reason_code, instant(), receiptJson,
          receipt === null ? null : digestOf(receipt), candidate_bytes, candidate_bytes === null ? null : sha(candidate_bytes), run_id, fencing_epoch);
        return { status: 'SETTLED', run: view(row(run_id), instance_ref) };
      });
    },
    markWorkerStarted({ run_id, fencing_epoch, instance_ref }) {
      return transaction(() => {
        expire();
        const changed = db.prepare("UPDATE wb_run SET worker_started_at=? WHERE run_id=? AND fencing_epoch=? AND instance_ref=? AND state='running' AND worker_started_at IS NULL")
          .run(instant(), run_id, fencing_epoch, instance_ref);
        return changed.changes === 1;
      });
    },
    read(requestId, instanceRef) {
      assert(REQUEST.test(requestId), 'EXECUTION_REQUEST_INVALID'); checkRoot();
      const linked = db.prepare('SELECT run_id FROM wb_link WHERE request_id=?').get(requestId);
      return linked ? view(row(linked.run_id), instanceRef) : null;
    },
    candidate(requestId, instanceRef) {
      const current = this.read(requestId, instanceRef);
      if (!current || current.state !== 'succeeded' || !current.candidate_present) return null;
      return { bytes: Buffer.from(row(current.run_id).candidate_bytes), content_sha256: current.candidate_sha256, run_id: current.run_id };
    },
    close() { db.close(); },
  });
}

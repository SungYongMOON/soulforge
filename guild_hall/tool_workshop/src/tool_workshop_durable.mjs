// A local SQLite transaction serializes replay + mutation. The pure core is the
// only queue/lease state machine; the journal carries no packet or process text.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createToolWorkshopCore } from './tool_workshop_core.mjs';
import { directPath, exactKeys, reject, sha256 } from './workshop_files.mjs';

if (Number(process.versions.node.split('.')[0]) < 24) reject('node_runtime_unsupported_requires_24');
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

const internals = new WeakMap();
const fields = {
  registerWorkshop:['workshop_id','workshop_class','resource_id','tool_versions','binding_digest'],
  submitJob:['job_id','workshop_id','task_ref','work_brief_ref','project_ref','priority','required_tool_version','input_bundle_manifest_digest','timeout_seconds','max_retries','approval_ref'],
};
const DIGEST = /^[a-f0-9]{64}$/;
const REF = /^[a-z][a-z0-9_.:-]{1,120}$/;

export function createDurableToolWorkshop({ stateRoot }) {
  const root = directPath(stateRoot, true);
  const file = path.join(root,'workshop.sqlite');
  function transaction(action) {
    directPath(root,true);
    for (const suffix of ['', '-wal', '-shm', '-journal']) if (existsSync(file+suffix)) directPath(file+suffix);
    const db = new DatabaseSync(file);
    try {
      db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;');
      db.exec('CREATE TABLE IF NOT EXISTS journal (seq INTEGER PRIMARY KEY, command TEXT NOT NULL, digest TEXT NOT NULL)');
      const core = createToolWorkshopCore();
      const bindings = new Map();
      const artifacts = new Map();
      const approvals = new Map();
      let previous = '0'.repeat(64), sequence = 0;
      function apply(command) {
        const {method,args} = command;
        if (method === 'candidate') {
          const result = core.completeRun(args[0]);
          artifacts.set(result.job_id,args[1]);
          return {...result,artifact:args[1]};
        }
        if (!['registerWorkshop','submitJob','acquireLease','releaseLease','completeRun','cancelJob','finishCancellation'].includes(method)) reject('journal_command_invalid');
        const result = core[method](...args);
        if (method === 'registerWorkshop') bindings.set(args[0].workshop_id,args[0].binding_digest ?? null);
        if (method === 'submitJob') approvals.set(args[0].job_id,args[0].approval_ref ?? null);
        return result;
      }
      for (const row of db.prepare('SELECT seq,command,digest FROM journal ORDER BY seq').all()) {
        if (row.seq !== ++sequence || sha256(previous+row.command) !== row.digest) reject('journal_integrity_failed');
        apply(JSON.parse(row.command)); previous = row.digest;
      }
      function append(method,args) {
        const command = JSON.stringify({method,args});
        const digest = sha256(previous+command);
        const result = apply(JSON.parse(command));
        db.prepare('INSERT INTO journal VALUES (?,?,?)').run(sequence+1,command,digest);
        return result;
      }
      const result = action({core,append,bindings,artifacts,approvals});
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    } finally { db.close(); }
  }
  const api = Object.freeze({
    registerWorkshop(input) {
      exactKeys(input,fields.registerWorkshop);
      if (input.binding_digest !== undefined && !DIGEST.test(input.binding_digest)) reject('binding_digest_invalid');
      return transaction(({append}) => append('registerWorkshop',[input]));
    },
    submitJob(input) {
      exactKeys(input,fields.submitJob);
      if (input.approval_ref !== undefined && !REF.test(input.approval_ref)) reject('approval_ref_invalid');
      if (input.timeout_seconds > 300) reject('timeout_limit_exceeded');
      return transaction(({append,bindings}) => {
        if (bindings.get(input.workshop_id) && !input.approval_ref) reject('approved_packet_required');
        return append('submitJob',[input]);
      });
    },
    acquireLease(workshopId,input) {
      exactKeys(input,['now','lease_id','project_ref']);
      return transaction(({append}) => append('acquireLease',[workshopId,{...input,now:input.now??new Date().toISOString()}]));
    },
    releaseLease(input) {
      exactKeys(input,['lease_id','fencing_token']);
      return transaction(({append}) => append('releaseLease',[input]));
    },
    cancelJob(jobId) { return transaction(({append}) => append('cancelJob',[jobId])); },
    finishCancellation(lease) { return transaction(({append}) => append('finishCancellation',[{lease_id:lease.lease_id,fencing_token:lease.fencing_token}])); },
    stateRoot: root,
    assertCurrentLease(lease,now) { return transaction(({core}) => core.assertCurrentLease(lease,now)); },
    failRun(lease,code) {
      if (!['validator_failed','runner_failed','runner_timeout','input_invalid','binding_drift','output_invalid'].includes(code)) reject('failure_code_invalid');
      return transaction(({append,core}) => {
        // Failures may close an expired lease, but never a superseded one.
        return append('completeRun',[{lease_id:lease.lease_id,fencing_token:lease.fencing_token,validator_result:'fail',failure_code:code}]);
      });
    },
    getJob(id) { return transaction(({core,approvals}) => {const job=core.getJob(id);return job?{...job,approval_ref:approvals.get(id)}:null;}); },
    getBinding(id) { return transaction(({bindings}) => bindings.get(id) ?? null); },
    getWorkshop(id) { return transaction(({core}) => core.getWorkshop(id)); },
    getCustodyReceipt(id) { return transaction(({core,artifacts}) => {const receipt=core.getCustodyReceipt(id);return receipt?{...receipt,artifact:artifacts.get(id)}:null;}); },
    eventLog() { return transaction(({core}) => core.eventLog()); },
  });
  internals.set(api,{transaction,root});
  // Opening performs an integrity replay, so corrupt state fails before use.
  transaction(() => null);
  return api;
}

// Trusted adapter seam, not a job command. The synchronous verifier and write
// callback execute inside the SAME DB lock as fence check and candidate commit.
// A crash after file creation but before commit leaves an unregistered orphan.
export function commitVerifiedCandidate(queue,{lease,now,verifyAndPublish}) {
  const runtime = internals.get(queue);
  if (!runtime) reject('durable_queue_required');
  return runtime.transaction(({core,append,bindings,approvals}) => {
    const currentLease=core.assertCurrentLease(lease,now());
    const job=core.getJob(currentLease.job_id);
    if (!approvals.get(job.job_id) || job.required_tool_version !== 'tool.project_history_xlsx:v1' || !bindings.get(job.workshop_id)) reject('candidate_binding_required');
    const artifact = verifyAndPublish();
    exactKeys(artifact,['sha256','size_bytes','format','binding_digest','validator_ref','artifact_ref']);
    if (!DIGEST.test(artifact.sha256) || !DIGEST.test(artifact.binding_digest) || !Number.isSafeInteger(artifact.size_bytes) || artifact.size_bytes < 1 || artifact.format !== 'xlsx' || artifact.validator_ref !== 'validator.xlsx_native_readback:v1' || artifact.artifact_ref !== `artifact.sha256:${artifact.sha256}`) reject('artifact_metadata_invalid');
    if (artifact.binding_digest !== bindings.get(job.workshop_id)) reject('binding_drift');
    core.assertCurrentLease(lease,now());
    return append('candidate',[{lease_id:lease.lease_id,fencing_token:lease.fencing_token,now:now(),validator_result:'pass',output_bundle_manifest_digest:sha256(JSON.stringify(artifact)),evidence_refs:[artifact.validator_ref]},artifact]);
  });
}

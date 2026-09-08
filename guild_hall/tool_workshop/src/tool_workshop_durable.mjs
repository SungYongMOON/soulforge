// A local SQLite transaction serializes replay + mutation. The pure core is the
// only queue/lease state machine; the journal carries no packet or process text.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

export function createDurableToolWorkshop({ stateRoot, mode = 'open_or_create' }) {
  const root = directPath(stateRoot, true);
  const file = path.join(root,'workshop.sqlite');
  const marker = path.join(root,'workshop.initialized');
  if (!['create_new','open_existing','open_or_create'].includes(mode)) reject('state_open_mode_invalid');
  if (mode === 'create_new' && (existsSync(file) || existsSync(marker))) reject('state_already_exists');
  if (mode === 'open_existing' && !existsSync(file)) reject('state_database_missing');
  const markerBytes = 'soulforge.tool_workshop_state.v1\n';
  let initialized = existsSync(marker);
  let mayCreateDatabase = !initialized && !existsSync(file);
  function assertMarker() {
    directPath(marker);
    if (readFileSync(marker,'utf8') !== markerBytes) reject('state_marker_invalid');
  }
  if (initialized) assertMarker();
  function transaction(action) {
    directPath(root,true);
    if (initialized) assertMarker();
    if (!mayCreateDatabase || existsSync(file)) {
      try { directPath(file); } catch(error) { if(error.code==='ENOENT')reject('state_database_missing');throw error; }
    }
    // SQLite creates/removes its journal between transactions. A vanished
    // optional file is normal; links and every other filesystem error remain
    // fail-closed. Avoid exists() followed by a racy lstat()/realpath().
    for (const suffix of ['-wal', '-shm', '-journal']) {
      try { directPath(file+suffix); } catch(error) { if(error.code!=='ENOENT')throw error; }
    }
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
  mayCreateDatabase = false;
  // Existing v1 databases gain only this metadata presence marker after a
  // successful replay. A missing established DB is never a new empty queue.
  if (!existsSync(marker)) {
    try { writeFileSync(marker,markerBytes,{flag:'wx'}); } catch(error) { if(error.code!=='EEXIST')throw error; }
  }
  assertMarker();initialized = true;
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
    const candidateTools={'tool.project_history_xlsx:v1':{format:'xlsx',validator:'validator.xlsx_native_readback:v1'},'tool.template_pptx:v1':{format:'pptx',validator:'validator.pptx_native_render:v1'},'tool.template_hwpx:v1':{format:'hwpx',validator:'validator.hwpx_structural_readback:v1'},'tool.reference_hwpx:v1':{format:'hwpx',validator:'validator.hwpx_reference_readback:v1',reference:true}};
    const expected=candidateTools[job.required_tool_version];
    if (!approvals.get(job.job_id) || !expected || !bindings.get(job.workshop_id)) reject('candidate_binding_required');
    const artifact = verifyAndPublish();
    exactKeys(artifact,['sha256','size_bytes','format','binding_digest','validator_ref','artifact_ref',...(expected.format==='pptx'?['template_sha256','render_manifest_digest','render_count']:[]),...(expected.reference?['template_sha256','section_count','preview_status','render_required','page_count_verified']:[])]);
    if (!DIGEST.test(artifact.sha256) || !DIGEST.test(artifact.binding_digest) || !Number.isSafeInteger(artifact.size_bytes) || artifact.size_bytes < 1 || artifact.format !== expected.format || artifact.validator_ref !== expected.validator || artifact.artifact_ref !== `artifact.sha256:${artifact.sha256}`) reject('artifact_metadata_invalid');
    if(expected.format==='pptx' && (!DIGEST.test(artifact.template_sha256) || !DIGEST.test(artifact.render_manifest_digest) || !Number.isInteger(artifact.render_count) || artifact.render_count<2 || artifact.render_count>20)) reject('render_evidence_required');
    if(expected.reference && (!DIGEST.test(artifact.template_sha256) || !Number.isInteger(artifact.section_count)
      || artifact.section_count<1 || artifact.section_count>64 || !['preview_stale','present_unverified','absent'].includes(artifact.preview_status)
      || artifact.render_required!==true || artifact.page_count_verified!==false)) reject('reference_evidence_required');
    if (artifact.binding_digest !== bindings.get(job.workshop_id)) reject('binding_drift');
    core.assertCurrentLease(lease,now());
    return append('candidate',[{lease_id:lease.lease_id,fencing_token:lease.fencing_token,now:now(),validator_result:'pass',output_bundle_manifest_digest:sha256(JSON.stringify(artifact)),evidence_refs:[artifact.validator_ref]},artifact]);
  });
}

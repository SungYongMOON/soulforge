// Closed, installer-bound composition. No signing, approval writer or model API.
import { promises as fs, lstatSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { assertProtectedPaths, pythonInvocation, readCurrentnessDescriptor } from './sfx.mjs';
import { loadExecutionAuthority } from './execution_authority.mjs';
import { createG2LinearCustodyReader } from './g2_linear_custody_reader.mjs';
import { createLinearReadEvidenceReader } from '../linear_history/linear_read_evidence_reader.mjs';
import { createFeedbackRuntimeIssuer } from '../dev_worker/feedback_runtime_source.mjs';
import { readRuntimeBytes, readRuntimeJson, runtimeExact as exact, runtimeInside, runtimeOrdinary } from '../dev_worker/feedback_runtime_io.mjs';
import { atomicWritePrivateJson, preparePrivateDataRoot, acquireExclusiveLease, writeCreateOnlyJson } from '../linear_history/linear_custody.mjs';
import { sha256Canonical } from '../shared/project_history_envelope.mjs';
import { startFeedbackCurrentnessServer } from './feedback_currentness_transport.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => sha256Canonical(value).slice(7);
const require = (value, code = 'G2_FEEDBACK_HOLD') => { if (!value) throw new Error(code); };
const scope = proof => Object.fromEntries(['project_ref', 'assignment_ref', 'assignment_epoch', 'task_ref', 'policy_epoch', 'route_sha256', 'audience'].map(k => [k, proof[k]]));
const DESCRIPTORS = ['profile', 'grant', 'route', 'field_ledger'];
const PARTS = ['body', 'packet', 'prepared', 'evidence'];
const COMMON = ['role', ...DESCRIPTORS, 'linear', 'workforce', 'authorityMaxAgeMs', 'receiver'];
const current = (value, now) => Number.isFinite(Date.parse(value.valid_from)) && Number.isFinite(Date.parse(value.valid_until))
  && Date.parse(value.valid_from) <= now && now < Date.parse(value.valid_until);

// Read-only consistency gate shared with isolated restore validation. This is
// not authorization: callers still need the installed role/output custody gate.
export async function assertCompletedPublicationJournal(controlRoot, expected) {
  require(exact(expected,['attempt_id','permit_id','body_sha256','scope_ref','job_id']));
  const filename=path.join(controlRoot,'attempts.db');
  await runtimeOrdinary(filename);
  for(const suffix of ['-wal','-shm','-journal']) {
    try { await runtimeOrdinary(filename+suffix); } catch(error) { if(error.code!=='ENOENT') throw error; }
  }
  const db=new DatabaseSync(filename,{readOnly:true});
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF');
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row=>row.name);
    require(tables.join(',')==='attempts,commands,events,jobs'
      && !db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('view','trigger') LIMIT 1").get(),'G2_FEEDBACK_JOURNAL_INCOMPLETE');
    const row=db.prepare('SELECT job_id,permit_id,request_sha256,state FROM attempts WHERE attempt_id=?').get(expected.attempt_id);
    require(row && (expected.job_id===null || row.job_id===expected.job_id) && row.permit_id===expected.permit_id
      && row.request_sha256===expected.body_sha256 && row.state==='RESPONSE_RECEIVED','G2_FEEDBACK_ATTEMPT_NOT_COMPLETE');
    const job=db.prepare('SELECT project_ref,work_type FROM jobs WHERE job_id=?').get(row.job_id);
    require(job?.project_ref===expected.scope_ref && job.work_type==='feedback.code','G2_FEEDBACK_ATTEMPT_SCOPE');
  } finally { db.close(); }
}

async function immutableBytes(root, name, bytes) {
  require(/^[a-f0-9]{64}\.(?:json|bin)$/u.test(name));
  await runtimeOrdinary(root, true);
  const target = path.join(root, name), temporary = path.join(root, `.pending-${randomUUID()}`);
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600); await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    try { await fs.link(temporary, target); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  } finally { await handle?.close(); await fs.rm(temporary, { force: true }); }
  await readRuntimeBytes(target, hash(bytes), 2_000_000);
  return { file: name, sha256: hash(bytes) };
}

function fixedConfig(runtime, mode) {
  require(exact(runtime.config, ['schema', 'runtime', 'kit_root', 'recipe_root', 'execution_authority', 'g2_feedback',
    ...(mode === 'prepare' ? ['permit_trust_pubkey_path'] : [])]), 'G2_FEEDBACK_FOREIGN_CONFIG');
  const fixed = runtime.config.g2_feedback;
  require(exact(fixed, [...COMMON, ...(mode === 'prepare' ? ['selection', 'prepared_root']
    : ['prepared_manifest', 'review', 'permit', 'public_key', 'control_root', 'projection_root',
      ...(Object.hasOwn(fixed,'currentness_transport')?['currentness_transport']:[])])]));
  require(fixed.role === (mode === 'prepare' ? 'controller' : 'sender') && runtime.installationRole?.name === fixed.role, 'G2_FEEDBACK_ROLE');
  return fixed;
}

export function createFeedbackAdapter(runtime, mode, { now = Date.now } = {}) {
  require(['prepare', 'publish'].includes(mode));
  runtime.recheck(); runtime.checkFile(fileURLToPath(import.meta.url));
  const fixed = fixedConfig(runtime, mode), roles = loadExecutionAuthority(runtime, { now });
  const operation = mode === 'prepare' ? 'jobs.advance' : 'model.dispatch';
  let verifiedCache = null;
  const linear = createLinearReadEvidenceReader({ root: fixed.linear.expectedBinding.custody_root,
    expectedBinding: fixed.linear.expectedBinding, maxAgeMs: fixed.linear.maxAgeMs, now });
  const protect = descriptors => assertProtectedPaths(descriptors.map(d => d.path), runtime.binding.trust_owner_sid, runtime.observeSecurity);
  async function pinned(descriptor, protectedFile = true) {
    require(exact(descriptor, ['path', 'sha256']) && /^[a-f0-9]{64}$/u.test(descriptor.sha256));
    require(typeof descriptor.path==='string' && !/(?:^|[\\/_.-])(?:credentials?|secrets?|passwords?|cookies?|tokens?|sessions?)(?:[\\/_.-]|$)/iu.test(descriptor.path)
      && !/(?:^|[\\/])\.env(?:\.|$)|\.(?:key|pfx|p12)$/iu.test(descriptor.path),'G2_FEEDBACK_DOCUMENT_PATH');
    if (protectedFile) protect([descriptor]);
    const bytes=await readRuntimeBytes(descriptor.path, descriptor.sha256, 2_000_000);
    runtime.recordCurrentnessFile?.(descriptor.path,descriptor.sha256,2_000_000);
    return bytes;
  }
  async function inputs() {
    runtime.recheck();
    const identity = roles.entry(operation);
    const documents = {}, decoded = {};
    for (const name of [...DESCRIPTORS, ...(mode === 'publish' ? ['review', 'permit'] : [])]) {
      const raw = await pinned(fixed[name]); documents[name] = raw.toString('base64'); decoded[name] = JSON.parse(raw);
    }
    const profile = decoded.profile;
    require(identity.principal_ref === profile[mode === 'prepare' ? 'producer_ref' : 'publisher_ref']
      && identity.project_ref === profile.scope_ref && identity.audience === profile.audience
      && current(profile, now()), 'G2_FEEDBACK_IDENTITY');
    require(exact(fixed.receiver, ['deployment', 'qualification_ref']) && fixed.receiver.qualification_ref
      && fixed.receiver.qualification_ref === profile.qualification_ref, 'G2_FEEDBACK_RECEIVER_UNQUALIFIED');
    const receiver = JSON.parse(await pinned(fixed.receiver.deployment));
    require(fixed.receiver.deployment.sha256 === profile.receiver_sha256
      && receiver.g2LeaderRef === profile.producer_ref && receiver.projectionRoot
      && digest(receiver.grant) === digest(fixed.grant)
      && digest(receiver.workforce) === digest(fixed.workforce)
      && digest(receiver.linear) === digest(fixed.linear), 'G2_FEEDBACK_RECEIVER_UNBOUND');
    // Reuse the existing issuer's authority reader only. Its DB is transient;
    // no source enumeration, issued request or task execution is invoked here.
    for (const key of ['claim', 'pin', 'current']) protect([fixed.workforce[key]]);
    const db = new DatabaseSync(':memory:');
    let grant;
    try {
      grant = await createFeedbackRuntimeIssuer({ db, deployment: receiver, evidenceRoot: undefined,
        assertDeployment: async () => runtime.recheck(), now }).authority();
    } finally { db.close(); }
    require(digest(grant) === digest(decoded.grant));
    require(profile.allowed_write_paths.every(p => receiver.runner.allowedFiles.includes(p))
      && profile.acceptance_checks.every(c => receiver.runner.validationCatalog.some(v => v.check_id === c)), 'G2_FEEDBACK_RUNNER_WIDENING');
    if (mode === 'publish') {
      require(receiver.projectionRoot === fixed.projection_root);
      require(hash(Buffer.from(fixed.control_root)) === profile.control_root_sha256, 'G2_FEEDBACK_STORE_UNBOUND');
      require(fixed.public_key.path.endsWith('.pub'),'G2_FEEDBACK_PUBLIC_KEY_PATH');
      await pinned(fixed.public_key);
      roles.verifyPermitIdentity(scope(identity), decoded.permit);
      require(decoded.review.decision === 'ALLOW' && decoded.review.actor_ref === decoded.permit.actor_ref,
        'G2_FEEDBACK_REVIEW_REQUIRED');
    }
    require(digest(roles.entry(operation)) === digest(identity), 'G2_FEEDBACK_AUTHORITY_CHANGED');
    return { documents, profile, grant, identity, receiver };
  }
  async function source(selection, identity) {
    await runtime.recordCurrentnessSource?.(selection);
    const result = await linear.resolve({ issueId: selection.issue_id });
    require(result.status === 'CURRENT' && result.issue_content_sha256 === selection.issue_content_sha256
      && result.project_scope_ref === selection.scope_ref && result.generation_seq === selection.generation_seq
      && identity.task_ref === `linear.task:${result.linear_task.task_ref.task_id.toLowerCase()}`, 'G2_FEEDBACK_SOURCE_CHANGED');
    roles.authorize(operation, scope(identity));
    return result;
  }
  async function outputRoot(root) {
    require(typeof root === 'string' && path.isAbsolute(root)
      && !root.split(/[\\/]/u).some(p => ['_workspaces', '_workmeta', '.git'].includes(p.toLowerCase())), 'G2_FEEDBACK_OUTPUT_ROOT');
    for (const other of [...runtime.roots, fixed.linear.expectedBinding.custody_root, fixed.linear.expectedBinding.state_root])
      require(!runtimeInside(other, root) && !runtimeInside(root, other), 'G2_FEEDBACK_OUTPUT_OVERLAP');
    await runtimeOrdinary(root, true);
    protect([{ path: path.dirname(root) }]);
    const security = runtime.observeSecurity([root]), item = security.paths?.[0];
    const system = ['S-1-5-18', 'S-1-5-32-544', 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'];
    const allowed = [runtime.binding.trust_owner_sid, runtime.installationRole.sid, ...system];
    const mutate = 2 | 4 | 16 | 64 | 256 | 65536 | 262144 | 524288 | 0x40000000 | 0x10000000;
    require(security.sid === runtime.installationRole.sid && item?.path === root && item.reparse === false
      && [runtime.binding.trust_owner_sid, ...system].includes(item.owner_sid) && Array.isArray(item.allow)
      && item.allow.every(ace => Number.isSafeInteger(ace.rights) && (!(ace.rights & mutate) || allowed.includes(ace.sid))),
    'G2_FEEDBACK_OUTPUT_CUSTODY');
  }
  function invoke(request, expected) {
    // A cold typed/signature verifier may execute only after the ORIGINAL full
    // installation recheck, even within a deduplicated read-only request.
    if(runtime.recheckExecution)runtime.recheckExecution();else runtime.recheck();
    const command = pythonInvocation(runtime, mode === 'prepare' ? 'feedback_prepare' : 'feedback_verify');
    const payload = Buffer.from(JSON.stringify(request)); require(payload.length <= 4_000_000);
    const result = spawnSync(command.executable, command.args, { ...command.options,
      input: Buffer.concat([command.inputPrefix, payload]), encoding: 'utf8', timeout: 120000, maxBuffer: 8_000_000,
      stdio: ['pipe', 'pipe', 'pipe'] });
    require(!result.error && result.status === 0, 'G2_FEEDBACK_CONTRACT_HOLD');
    let value;
    try { value = JSON.parse(result.stdout); } catch { throw new Error('G2_FEEDBACK_CONTRACT_HOLD'); }
    require(exact(value, ['ok', 'result']) && value.ok === true);
    require(digest(roles.entry(operation)) === digest(expected), 'G2_FEEDBACK_AUTHORITY_CHANGED');
    runtime.recheck(); return value.result;
  }
  async function loadParts() {
    const manifest = JSON.parse(await pinned(fixed.prepared_manifest, false));
    require(exact(manifest, ['parts']) && exact(manifest.parts, PARTS));
    const root = path.dirname(fixed.prepared_manifest.path), parts = {};
    for (const name of PARTS) {
      const descriptor = manifest.parts[name];
      require(exact(descriptor, ['file', 'sha256']) && /^[a-f0-9]{64}\.(?:json|bin)$/u.test(descriptor.file));
      parts[name] = (await pinned({ path: path.join(root, descriptor.file), sha256: descriptor.sha256 }, false)).toString('base64');
    }
    return parts;
  }
  async function prepare() {
    const initial = await inputs(), selection = JSON.parse(await pinned(fixed.selection));
    const custody = createG2LinearCustodyReader({ ...fixed.linear, expectedBinding: fixed.linear.expectedBinding,
      authority: roles, producerRef: initial.profile.producer_ref, now });
    const read = await custody.read(selection);
    let output;
    try { output = invoke({ wrapper: read.bytes.toString('base64'), selection, documents: initial.documents }, initial.identity); }
    finally { read.bytes.fill(0); }
    require(exact(output, PARTS));
    await source(selection, initial.identity); const final = await inputs();
    require(digest(final.documents) === digest(initial.documents), 'G2_FEEDBACK_INPUT_CHANGED');
    await outputRoot(fixed.prepared_root);
    const root = await preparePrivateDataRoot(fixed.prepared_root);
    require(!runtimeInside(fixed.linear.expectedBinding.custody_root, root) && !runtimeInside(root, fixed.linear.expectedBinding.custody_root));
    const parts = {};
    for (const name of PARTS) {
      const bytes = Buffer.from(output[name], 'base64');
      parts[name] = await immutableBytes(root, `${hash(bytes)}.${name === 'body' ? 'bin' : 'json'}`, bytes);
    }
    const manifest = { parts }, saved = await writeCreateOnlyJson(root, [`${digest(manifest)}.manifest.json`], manifest);
    return { ok: true, code: 'G2_FEEDBACK_PREPARED_NOT_RELEASED', manifest_sha256: saved.digest.slice(7),
      manifest_file: path.basename(saved.path), execution_authority: false };
  }
  async function verify(phase = 'check', cacheOnly = false) {
    const before = await inputs(), parts = await loadParts();
    const selection = JSON.parse(Buffer.from(parts.evidence, 'base64')).selection;
    const observed = await source(selection, before.identity);
    require(before.grant.allowed_states.includes(observed.linear_task.task_status), 'G2_FEEDBACK_SOURCE_STATE');
    const fingerprint = digest({ documents: before.documents, parts, identity: before.identity });
    // Only signature/typed mapping work is cached for unchanged exact bytes.
    // Current OS authority, protected inputs, source/grant and clock are still
    // checked on every call, before and after. No cached release decision is
    // returned across a changed review/ledger/key/config/body/epoch.
    if(cacheOnly)require(phase==='check' && verifiedCache?.fingerprint===fingerprint,'G2_FEEDBACK_CURRENTNESS_REWARM_REQUIRED');
    const verified = phase === 'check' && verifiedCache?.fingerprint === fingerprint
      ? verifiedCache.result : invoke({ documents: before.documents, parts, phase }, before.identity);
    verifiedCache = { fingerprint, result: verified };
    await source(selection, before.identity);
    const after = await inputs(); require(digest(before.documents) === digest(after.documents), 'G2_FEEDBACK_INPUT_CHANGED');
    return { ...before, parts, verified };
  }
  function expectedIndex(value) {
    return { producer_ref:value.profile.producer_ref, scope_ref:value.profile.scope_ref,
      valid_from:value.profile.valid_from, valid_until:value.profile.valid_until, generation:value.profile.generation,
      projections:[{issue_id:value.verified.selection.issue_id, file:`${value.verified.body_sha256}.json`, sha256:value.verified.body_sha256}] };
  }
  function expectedReceipt(value, indexSha) {
    return {binding_sha256:runtime.binding.config_sha256,index_sha256:indexSha,body_sha256:value.verified.body_sha256,
      generation:value.profile.generation,publisher_ref:value.profile.publisher_ref,producer_ref:value.profile.producer_ref,
      scope_ref:value.profile.scope_ref,permit_id:value.verified.permit_id,attempt_id:value.verified.attempt_id};
  }
  async function requireCompletedAttempt(value) {
    await assertCompletedPublicationJournal(fixed.control_root,{attempt_id:value.verified.attempt_id,permit_id:value.verified.permit_id,
      body_sha256:value.verified.body_sha256,scope_ref:value.profile.scope_ref,job_id:value.verified.job_id});
  }
  async function withdrawOwned() {
    // Fail-closed withdrawal is confined to this installed sender's generated
    // index. Never delete another writer's index or reclaim another lease.
    try {
      runtime.recheck();
      await outputRoot(fixed.control_root); await outputRoot(fixed.projection_root);
      const profile=JSON.parse(await pinned(fixed.profile));
      for (const name of ['pending-publication.json', 'current-publication.json']) {
        try {
          const record = await readRuntimeJson({ path: path.join(fixed.control_root, name), sha256: null });
          const indexPath = path.join(fixed.projection_root, 'current.json');
          const currentBytes = await readRuntimeBytes(indexPath, record.index_sha256);
          require(record.publisher_ref === profile.publisher_ref && record.scope_ref === profile.scope_ref);
          await fs.rename(indexPath, path.join(fixed.projection_root, `withdrawn-${hash(currentBytes)}-${randomUUID()}.json`));
          break;
        } catch { /* Try only this writer's other exact generation receipt. */ }
      }
    } catch { /* No provably owned current index to withdraw. */ }
  }
  async function publish() {
    try { await inputs(); } catch (error) { await withdrawOwned(); throw error; }
    await outputRoot(fixed.control_root); await outputRoot(fixed.projection_root);
    await preparePrivateDataRoot(fixed.control_root); await preparePrivateDataRoot(fixed.projection_root);
    require(!runtimeInside(fixed.control_root, fixed.projection_root) && !runtimeInside(fixed.projection_root, fixed.control_root));
    const lease = await acquireExclusiveLease({ state_root: fixed.control_root, lease_name: 'feedback-publish.lock', payload: { operation: 'model.dispatch' } });
    try {
      const currentPath=path.join(fixed.projection_root,'current.json');
      let priorRecord=null;
      try {
        priorRecord=await readRuntimeJson({path:path.join(fixed.control_root,'current-publication.json'),sha256:null});
      } catch(error) { if(error.code!=='ENOENT') throw error; }
      if(priorRecord) await assertCompletedPublicationJournal(fixed.control_root,{attempt_id:priorRecord.attempt_id,
        permit_id:priorRecord.permit_id,body_sha256:priorRecord.body_sha256,scope_ref:priorRecord.scope_ref,job_id:null});
      else {
        try { await runtimeOrdinary(path.join(fixed.control_root,'attempts.db')); }
        catch(error) {
          if(error.code!=='ENOENT') throw error;
          require((await fs.readdir(fixed.projection_root)).length===0,'G2_FEEDBACK_STORE_MISSING');
        }
      }
      try {
        await fs.lstat(currentPath);
        require(priorRecord, 'G2_FEEDBACK_UNOWNED_INDEX');
        await readRuntimeBytes(currentPath,priorRecord.index_sha256);
      } catch(error) { if(error.code!=='ENOENT') throw error; }
      const value = await verify('reserve'), body = Buffer.from(value.parts.body, 'base64'), profile = value.profile;
      if(priorRecord) require(priorRecord.publisher_ref===profile.publisher_ref && priorRecord.scope_ref===profile.scope_ref
        && priorRecord.generation<=profile.generation, 'G2_FEEDBACK_GENERATION_REPLAY');
      const descriptor = await immutableBytes(fixed.projection_root, `${value.verified.body_sha256}.json`, body);
      const index = expectedIndex(value);
      require(descriptor.sha256===index.projections[0].sha256);
      const existingPath = path.join(fixed.projection_root, 'current.json');
      let prior = null;
      try { prior = await readRuntimeJson({ path: existingPath, sha256: null }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (prior) require(digest(prior) === digest(index) || prior.generation < profile.generation, 'G2_FEEDBACK_GENERATION_REPLAY');
      await verify('check');
      const { canonicalBytes } = await import('../linear_history/linear_custody.mjs');
      const pending = expectedReceipt(value, hash(canonicalBytes(index)));
      await atomicWritePrivateJson(fixed.control_root, ['pending-publication.json'], pending);
      const saved = await atomicWritePrivateJson(fixed.projection_root, ['current.json'], index);
      const complete = await verify('complete');
      require(complete.verified.attempt_state === 'RESPONSE_RECEIVED');
      require(saved.digest.slice(7) === pending.index_sha256);
      await atomicWritePrivateJson(fixed.control_root, ['current-publication.json'], pending);
      // G1 may read only these existing currentness-contract fields. Fresh peer-
      // authenticated verification is still mandatory; this file is not authority.
      await atomicWritePrivateJson(fixed.projection_root, ['currentness.json'], {
        publisher_ref: profile.publisher_ref, producer_ref: profile.producer_ref, scope_ref: profile.scope_ref,
        issue_id: value.verified.selection.issue_id, issue_content_sha256: value.verified.selection.issue_content_sha256,
        body_sha256: value.verified.body_sha256, generation: profile.generation, review_ref: value.verified.review_ref,
        index_sha256: pending.index_sha256,
      });
      return { ok: true, code: 'G2_FEEDBACK_PUBLISHED', body_sha256: value.verified.body_sha256,
        generation: profile.generation, execution_authority: false };
    } catch (error) { await withdrawOwned(); throw error; }
    finally { await lease.release(); }
  }
  return Object.freeze({ prepare, publish, async assertCurrentPublication(challenge, {cacheOnly=false}={}) {
    require(typeof challenge === 'string' && /^[a-f0-9]{32}$/u.test(challenge), 'G2_FEEDBACK_CHALLENGE');
    await outputRoot(fixed.control_root); await outputRoot(fixed.projection_root);
    const value = await verify('check',cacheOnly);
    await runtime.recordCurrentnessJournal?.(fixed.control_root);
    await requireCompletedAttempt(value);
    const receiptPath=path.join(fixed.control_root,'current-publication.json');
    const receiptBytes=await readRuntimeBytes(receiptPath),receipt=JSON.parse(receiptBytes);
    runtime.recordCurrentnessFile?.(receiptPath,hash(receiptBytes),2_000_000);
    const {canonicalBytes}=await import('../linear_history/linear_custody.mjs');
    const expected=canonicalBytes(expectedIndex(value)), indexSha=hash(expected);
    require(exact(receipt,Object.keys(expectedReceipt(value,indexSha)))
      && digest(receipt)===digest(expectedReceipt(value,indexSha)), 'G2_FEEDBACK_RECEIPT_UNBOUND');
    const index = await readRuntimeBytes(path.join(fixed.projection_root, 'current.json'), indexSha);
    runtime.recordCurrentnessFile?.(path.join(fixed.projection_root,'current.json'),indexSha,2_000_000);
    require(index.equals(expected),'G2_FEEDBACK_INDEX_UNBOUND');
    await readRuntimeBytes(path.join(fixed.projection_root,`${value.verified.body_sha256}.json`),value.verified.body_sha256);
    runtime.recordCurrentnessFile?.(path.join(fixed.projection_root,`${value.verified.body_sha256}.json`),value.verified.body_sha256,2_000_000);
    require(current(value.profile, now()) && now() < value.identity.expires_at, 'G2_FEEDBACK_CURRENTNESS_EXPIRED');
    return { challenge, publisher_ref: value.profile.publisher_ref, producer_ref: value.profile.producer_ref,
      scope_ref: value.profile.scope_ref, issue_id: value.verified.selection.issue_id,
      issue_content_sha256: value.verified.selection.issue_content_sha256, body_sha256: value.verified.body_sha256,
      generation: value.profile.generation, review_ref: value.verified.review_ref, index_sha256: receipt.index_sha256,
      observed_at: new Date(now()).toISOString(), valid_until: value.profile.valid_until, execution_authority: false };
  } });
}

/** G1 validates metadata received from its authenticated SENDER boundary.
 * This function is not an authenticator and must never bless model-supplied
 * responses. No source body, field ledger, permit or key belongs on this port.
 */
export { validateAuthenticatedCurrentnessMetadata } from './feedback_currentness_contract.mjs';

const normalized=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);
const fileIdentity=p=>{
  const s=lstatSync(p);
  require(s.isFile() && !s.isSymbolicLink() && s.nlink===1,'G2_FEEDBACK_FILE_CHANGED');
  return `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}:${s.nlink}`;
};

// A request-local installation/OS observation bracket, not an authority cache.
// Every role/grant/source/review/journal check still executes. Only repeated
// observations of the SAME declared paths within that bracket are deduplicated.
export function createReadOnlyFeedbackCurrentness(runtime,{now=Date.now}={}){
  const configPin={path:runtime.binding.config_path,sha256:runtime.binding.config_sha256};
  const immutableConfig=JSON.parse(readCurrentnessDescriptor(configPin));
  require(digest(immutableConfig)===digest(runtime.config),'G2_FEEDBACK_CONFIG_CHANGED');
  const fixed=fixedConfig({...runtime,config:immutableConfig},'publish'),descriptor=fixed.currentness_transport;
  require(runtime.installationRole?.name==='sender'
    && (!runtime.installationRole.purpose || runtime.installationRole.purpose==='model.dispatch'),'G2_FEEDBACK_ROLE');
  require(exact(descriptor,['path','sha256']),'G2_FEEDBACK_CURRENTNESS_CONFIG');
  const transport=Object.freeze(JSON.parse(readCurrentnessDescriptor(descriptor)));
  require(exact(transport,['pipe_name','server_sid','client_sid','python_executable','python_sha256','bridge_sha256','ipc_pipe_sha256','timeout_ms','valid_until'])
    && Number.isSafeInteger(transport.timeout_ms) && transport.timeout_ms>=100 && transport.timeout_ms<=5000,'G2_FEEDBACK_CURRENTNESS_CONFIG');
  require(transport.server_sid===runtime.installationRole.sid && transport.client_sid!==transport.server_sid
    && normalized(transport.python_executable)===normalized(runtime.binding.launch.python_executable)
    && runtime.expected.get(normalized(transport.python_executable))===transport.python_sha256,'G2_FEEDBACK_CURRENTNESS_INSTALLATION');
  for(const [file,key]of [['feedback_currentness_pipe.py','bridge_sha256'],['ipc_pipe.py','ipc_pipe_sha256']]){
    const source=fileURLToPath(new URL(`./src/soulforge_secure_work/${file}`,import.meta.url));
    require(runtime.expected.get(normalized(source))===transport[key],'G2_FEEDBACK_CURRENTNESS_INSTALLATION');runtime.checkFile(source);
  }
  require(assertProtectedPaths([descriptor.path],runtime.binding.trust_owner_sid,runtime.observeSecurity)===runtime.installationRole.sid,'G2_FEEDBACK_ROLE');
  const policyPin={path:immutableConfig.execution_authority.policy_path,sha256:immutableConfig.execution_authority.policy_sha256};
  let closed=false,request=null,warmed=false,lastMeasurement=null;
  const quick=()=>{
    require(!closed,'G2_FEEDBACK_CURRENTNESS_CLOSED');
    readCurrentnessDescriptor(configPin);readCurrentnessDescriptor(descriptor);
    const policy=JSON.parse(readCurrentnessDescriptor(policyPin)),profile=JSON.parse(readCurrentnessDescriptor(fixed.profile));
    require(now()<Date.parse(transport.valid_until) && now()<policy.expires_at && current(profile,now()),'G2_FEEDBACK_CURRENTNESS_EXPIRED');
    if(request){
      request.freshUntil=Math.min(request.freshUntil,Date.parse(transport.valid_until),policy.expires_at,Date.parse(profile.valid_until));
      require(performance.now()<request.deadline && now()<request.freshUntil,'G2_FEEDBACK_CURRENTNESS_TIMEOUT');
    }
  };
  const protectedPaths=[configPin.path,policyPin.path,descriptor.path,...[...DESCRIPTORS,'review','permit','public_key'].map(key=>fixed[key].path),
    fixed.receiver.deployment.path,...['claim','pin','current'].map(key=>fixed.workforce[key].path),
    fixed.control_root,fixed.projection_root,path.dirname(fixed.control_root),path.dirname(fixed.projection_root)];
  const observedPaths=[...new Set(protectedPaths.flatMap(file=>{
    const values=[path.resolve(file)];while(path.dirname(values.at(-1))!==values.at(-1))values.push(path.dirname(values.at(-1)));return values;
  }))].sort();
  function observe(){
    const result=runtime.observeSecurity(observedPaths);
    require(Array.isArray(result.paths)&&result.paths.length===observedPaths.length
      && result.paths.every((item,index)=>normalized(item.path)===normalized(observedPaths[index])),'G2_FEEDBACK_CURRENTNESS_OS_SCOPE');
    return structuredClone(result);
  }
  function recordFile(file,sha256,limit){
    require(request,'G2_FEEDBACK_CURRENTNESS_REQUEST_REQUIRED');
    const identity=fileIdentity(file),old=request.files.get(file);
    require(!old || old.sha256===sha256 && old.identity===identity,'G2_FEEDBACK_FILE_CHANGED');
    request.files.set(file,{sha256,identity,limit});
  }
  async function capture(file,limit,pin=null){
    const bytes=await readRuntimeBytes(file,pin,limit);recordFile(file,hash(bytes),limit);return JSON.parse(bytes);
  }
  function fullRecheck(){if(request)request.full_rechecks++;runtime.recheck();quick();}
  const boundedRuntime={...runtime,config:immutableConfig,binding:structuredClone(runtime.binding),roots:[...runtime.roots],
    recheck(){if(request)quick();else runtime.recheck();},
    recheckExecution:fullRecheck,
    observeSecurity(paths){
      if(!request)return runtime.observeSecurity(paths);
      quick();const index=new Map(request.security.paths.map(item=>[normalized(item.path),item]));
      require(paths.every(p=>index.has(normalized(p))),'G2_FEEDBACK_CURRENTNESS_UNOBSERVED_PATH');
      return {...request.security,paths:paths.map(p=>({...structuredClone(index.get(normalized(p))),path:p}))};
    },
    recordCurrentnessFile:recordFile,
    async recordCurrentnessSource(selection){
      require(typeof selection.issue_id==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(selection.issue_id));
      const pins=fixed.linear.expectedBinding;
      const state=await capture(path.join(pins.state_root,'state','linear-collect.json'),8*1024*1024);
      require(typeof state.last_run_id==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(state.last_run_id));
      const receipt=await capture(path.join(pins.state_root,'receipts',`${state.last_run_id}.json`),128*1024);
      const content=state.object_index?.[`read_evidence:${selection.issue_id}`]?.content_sha256;
      require(/^sha256:[a-f0-9]{64}$/u.test(content??''));
      await capture(path.join(pins.custody_root,'read_evidence',selection.issue_id,`${content.slice(7)}.json`),32768);
      request.freshUntil=Math.min(request.freshUntil,Date.parse(state.last_completed_at)+fixed.linear.maxAgeMs,
        Date.parse(state.cursor?.watermark)+fixed.linear.maxAgeMs,Date.parse(receipt.completed_at)+fixed.linear.maxAgeMs);quick();
    },
    async recordCurrentnessJournal(root){
      for(const suffix of ['','-wal','-journal']){
        const file=path.join(root,`attempts.db${suffix}`);let identity=null;
        try{await runtimeOrdinary(file);identity=fileIdentity(file);}catch(error){if(error.code!=='ENOENT'||!suffix)throw error;}
        request.journal.set(file,identity);
      }
    },
  };
  // The constructor performs its normal full installation/source check. It is
  // completed before opening the pipe; prepare/publish are never exposed here.
  const adapter=createFeedbackAdapter(boundedRuntime,'publish',{now});
  async function check(challenge,cacheOnly){
    quick();require(!request,'G2_FEEDBACK_CURRENTNESS_BUSY');
    if(cacheOnly)require(warmed,'G2_FEEDBACK_CURRENTNESS_REWARM_REQUIRED');
    const started=performance.now();
    request={deadline:cacheOnly?started+transport.timeout_ms:Infinity,freshUntil:Infinity,security:null,files:new Map(),journal:new Map(),full_rechecks:0};
    try{
      fullRecheck();request.security=observe();
      const receiver=await capture(fixed.receiver.deployment.path,2_000_000,fixed.receiver.deployment.sha256);
      require(Number.isSafeInteger(receiver.authorityMaxAgeMs)&&receiver.authorityMaxAgeMs>0,'G2_FEEDBACK_RECEIVER_UNBOUND');
      for(const key of ['claim','pin','current']){
        const d=fixed.workforce[key],value=await capture(d.path,2_000_000,d.sha256??null);
        if(key==='pin')request.freshUntil=Math.min(request.freshUntil,Date.parse(value.expires_at));
        if(key==='current')request.freshUntil=Math.min(request.freshUntil,Date.parse(value.evaluated_at)+receiver.authorityMaxAgeMs);
      }
      const grant=await capture(fixed.grant.path,2_000_000,fixed.grant.sha256);
      request.freshUntil=Math.min(request.freshUntil,Date.parse(grant.valid_until));quick();
      const result=await adapter.assertCurrentPublication(challenge,{cacheOnly});
      fullRecheck();require(digest(observe())===digest(request.security),'G2_FEEDBACK_CURRENTNESS_OS_CHANGED');
      for(const [file,pin]of request.files){
        require(fileIdentity(file)===pin.identity,'G2_FEEDBACK_FILE_CHANGED');
        await readRuntimeBytes(file,pin.sha256,pin.limit);
        require(fileIdentity(file)===pin.identity,'G2_FEEDBACK_FILE_CHANGED');
      }
      for(const [file,identity]of request.journal){
        let actual=null;try{await runtimeOrdinary(file);actual=fileIdentity(file);}catch(error){if(error.code!=='ENOENT')throw error;}
        require(actual===identity,'G2_FEEDBACK_JOURNAL_CHANGED');
      }
      quick();
      const observedAt=now(),validUntil=Math.min(Date.parse(result.valid_until),request.freshUntil);
      require(observedAt<validUntil,'G2_FEEDBACK_CURRENTNESS_EXPIRED');warmed=true;
      // Same source/role/document bytes and identities survived the fresh exit
      // bracket, and their original freshness deadlines have not been extended.
      return {...result,observed_at:new Date(observedAt).toISOString(),valid_until:new Date(validUntil).toISOString()};
    }finally{
      lastMeasurement={request_ms:Math.round(performance.now()-started),full_rechecks:request.full_rechecks,
        phase:cacheOnly?'warm_read_only_request':'read_only_warmup_before_listen'};
      request=null;
    }
  }
  return Object.freeze({binding:transport,assertCurrent:quick,
    warmup:()=>check(randomUUID().replaceAll('-',''),false),
    assertCurrentPublication:challenge=>check(challenge,true),
    measurement:()=>lastMeasurement?{...lastMeasurement}:null,
    close(){closed=true;},
  });
}

export async function startInstalledFeedbackCurrentness(runtime){
  const readOnly=createReadOnlyFeedbackCurrentness(runtime);
  await readOnly.warmup();
  const startup={warmup:'READ_ONLY_VERIFIED_BEFORE_LISTEN',...readOnly.measurement(),execution_authority:false};
  const server=await startFeedbackCurrentnessServer({binding:readOnly.binding,assertCurrent:readOnly.assertCurrent,
    assertCurrentPublication:readOnly.assertCurrentPublication});
  // Closing the pipe leaves the source callback guard valid until it drains.
  // Import-hook lifetime remains owned by the installed launcher above us.
  server.drained.finally(()=>readOnly.close()).catch(()=>{});
  return Object.freeze({...server,startup,measurement:readOnly.measurement});
}

export async function executeFeedbackAdapter(runtime, mode) {
  const adapter = createFeedbackAdapter(runtime, mode);
  return mode === 'prepare' ? adapter.prepare() : adapter.publish();
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs, constants} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {openWorkIntakeRuntime} from '../src/work_intake_runtime.mjs';
import {createWorkIntakeStore} from '../src/work_intake_store.mjs';
import {syntheticResult, eventAttempt} from './work_intake_test_helpers.mjs';
import {intakeBytes, intakeRead, intakeHash as hash} from '../src/work_intake_io.mjs';
import {backupRuntimeDb} from '../tools/runtime_ops.mjs';
import {computeUnverifiedAgentApprovalClaimDigest, AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA,
  AGENT_AUTHORITY_CURRENT_STATE_SCHEMA} from '../../../../guild_hall/agent_observation/agent_authority_verification.mjs';

const REPO=fileURLToPath(new URL('../../../../',import.meta.url));
const access={checkSession:async()=>true,canAccessProject:async project=>project==='P01'};
function within(root,relative) {
  const target=path.resolve(root,relative),suffix=path.relative(root,target);
  assert.ok(relative && !path.isAbsolute(relative) && suffix && !path.isAbsolute(suffix) && suffix!=='..' && !suffix.startsWith(`..${path.sep}`));
  return target;
}
async function listFiles(root,prefix='') {
  const files=[];
  for(const entry of await fs.readdir(prefix?within(root,prefix):root,{withFileTypes:true})) {
    const relative=prefix?`${prefix}/${entry.name}`:entry.name;
    assert.equal(entry.isSymbolicLink(),false);
    if(entry.isDirectory())files.push(...await listFiles(root,relative));else{assert.ok(entry.isFile());files.push(relative);}
  }
  return files.sort();
}
async function generation(root,digest) {
  const manifest=await intakeRead({path:path.join(root,'manifest.json'),sha256:digest});
  assert.equal(manifest.generation,'synthetic.company-intake.restore.1');
  assert.equal(new Set(manifest.members.map(member=>member.relative)).size,manifest.members.length);
  assert.deepEqual(await listFiles(root),['manifest.json',...manifest.members.map(member=>member.relative)].sort());
  for(const member of manifest.members)assert.equal((await intakeBytes({path:within(root,member.relative),sha256:member.sha256},4_000_000)).length,member.size);
  return manifest;
}
function rows(file) {
  const db=new DatabaseSync(file,{readOnly:true});
  try {
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
    return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>{
      assert.match(name,/^[a-z_]+$/u);return [name,db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()];
    }));
  } finally {db.close();}
}

test('closed synthetic intake generation restores exact readers and preserves UNKNOWN and current revocation',async t=>{
  // This deliberately does not invoke createCompanyIntakeFixture: that helper
  // prepares signed E14 packets and a native fake judge. Here the existing pure
  // scripted-result fixture supplies the real store commit; runtime rows model
  // closed/UNKNOWN persisted states. No model, key, release or GUI is exercised.
  const namespace=await fs.mkdtemp(path.join(os.tmpdir(),'sf-intake-restore-'));
  const source=path.join(namespace,'source'),frozen=path.join(namespace,'generation'),restored=path.join(namespace,'restored');
  const dirs={trusted:path.join(source,'trusted'),control:path.join(source,'control'),evidence:path.join(source,'evidence')};
  for(const folder of Object.values(dirs))await fs.mkdir(folder,{recursive:true});
  let runtime=null,complete=false,passed=0;
  t.after(async()=>{
    runtime?.close();
    if(complete){
      const resolved=await fs.realpath(namespace);
      assert.equal(path.dirname(resolved),await fs.realpath(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('sf-intake-restore-'));
      await fs.rm(resolved,{recursive:true,force:true});
    }else t.diagnostic(`Owned synthetic failure evidence retained: ${namespace}`);
  });
  const gate=(name,check)=>t.test(name,async()=>{await check();passed++;});
  const save=async(file,value)=>{const bytes=Buffer.from(JSON.stringify(value));await fs.writeFile(file,bytes,{flag:'wx'});return {path:file,sha256:hash(bytes)};};
  const at=Date.now(),issued=new Date(at-60000).toISOString(),until=new Date(at+600000).toISOString(),scope='project:P01',sha=`sha256:${'a'.repeat(64)}`;
  // The same synthetic metadata authority shape used by the company fixture;
  // the existing workforce verifier remains the authority check, not this test.
  const fields={lineage_digest:sha,family_ref:'family:G1',family_digest:sha,mark_ref:'mark:G1',mark_digest:sha,
    deployment_ref:'deployment:G1',deployment_digest:sha,memory_generation_ref:'memory:G1',memory_digest:sha};
  const claim={project_scope_ref:scope,project_scope_refs:[scope],...fields,authority_receipt_ref:'approval:synthetic',authority_receipt_verified:false};
  const pin={schema_version:AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA,pin_ref:'pin:synthetic',verification_receipt_ref:'verification:synthetic',owner_ref:'owner:synthetic',authority_ref:'authority:synthetic',verifier_ref:'verifier:synthetic',project_scope_ref:scope,...fields,
    approval_claim_digest:computeUnverifiedAgentApprovalClaimDigest(claim,scope).claim_digest,authority_receipt_ref:claim.authority_receipt_ref,authority_receipt_digest:sha,claim_ceiling:'validated_private',issued_at:issued,verified_at:issued,expires_at:until,receipt_epoch:1,trusted_authority_epoch:1,revoked:false};
  const current={schema_version:AGENT_AUTHORITY_CURRENT_STATE_SCHEMA,evaluation_ref:'evaluation:current',evaluated_at:new Date(at-1000).toISOString(),authority_ref:pin.authority_ref,current_authority_epoch:1,revoked_pin_refs:[],claim_ceiling:'validated_private'};
  const grant={grant_ref:'grant.synthetic',authority_ref:pin.authority_ref,project_ref:'P01',scope_ref:scope,producer_ref:'producer.G2.synthetic',receiver_ref:'g1.work-intake-judge',agent_group:'G1',input_class:'g2_released_workpacket',actions:['read','judge','record','view'],valid_from:issued,valid_until:until,maximum_events:8};
  const authority={grant:await save(path.join(dirs.trusted,'grant.json'),grant),claim:await save(path.join(dirs.trusted,'claim.json'),claim),pin:await save(path.join(dirs.trusted,'pin.json'),pin),current:{...await save(path.join(dirs.trusted,'current.json'),current),sha256:null}};
  const sourceIndex=await save(path.join(dirs.trusted,'source-index.json'),{fixture:'not_a_live_source_index'});
  const documents=await save(path.join(dirs.trusted,'documents.json'),{fixture:'readback_only'});
  const deployment={version:1,mode:'synthetic_rehearsal',data_provenance:'synthetic',project_ref:'P01',scope_ref:scope,repository_root:REPO,
    control_root:dirs.control,evidence_root:dirs.evidence,release_binding_roots:[dirs.trusted],authority,
    source_index:{...sourceIndex,sha256:null},documents,linear:{},judge:null,packet_reader:null};
  const deploymentPin=await save(path.join(dirs.trusted,'deployment.json'),deployment);
  const originalOptions={deploymentPath:deploymentPin.path,deploymentSha256:deploymentPin.sha256};
  runtime=await openWorkIntakeRuntime(originalOptions);runtime.close();runtime=null;
  const result=await syntheticResult(),store=createWorkIntakeStore({directory:dirs.control,repositoryRoot:REPO,project_ref:'P01'});
  assert.equal(store.status,'OPEN');
  let committed;try{committed=store.commitResult(result);assert.equal(committed.status,'COMMITTED');}finally{store.close();}
  const runId='intake.run.synthetic.closed',reference=`intake.result.${hash(runId).slice(0,32)}`;
  const report={version:1,run_id:runId,project_ref:'P01',provenance:'synthetic',data_provenance:'synthetic',fixture_only:true,model_executed:false,
    status:'COMPLETED',store_receipt:committed.receipt,candidates:[{classification:eventAttempt(result).classification,human_acceptance:'UNKNOWN',official_done:false}],official_done:false,external_effects:0};
  const evidence=await save(path.join(dirs.evidence,`${reference}.json`),report);
  const dbPaths=[path.join(dirs.control,'work-intake.runtime.sqlite'),path.join(dirs.control,'work-intake.synthetic.sqlite')];
  const db=new DatabaseSync(dbPaths[0]);
  try {
    db.prepare("INSERT INTO intake_runtime_run(run_id,input_key,state,result_ref,result_sha256,started_at,finished_at) VALUES(?,?,'COMMITTED',?,?,?,?)").run(runId,hash('synthetic.closed'),reference,evidence.sha256,issued,new Date(at).toISOString());
    db.prepare("INSERT INTO intake_runtime_run(run_id,input_key,state,reason,started_at,finished_at) VALUES(?,?,'MODEL_UNKNOWN',?,?,?)").run('intake.run.synthetic.unknown',hash('synthetic.unknown'),'synthetic interrupted attempt',issued,new Date(at).toISOString());
    db.prepare("INSERT INTO intake_runtime_model VALUES(?,?,?,?,'UNKNOWN',?)").run('synthetic.crash','intake.run.synthetic.unknown',hash('synthetic.model.input'),'synthetic.no-native-session','interrupted fixture');
  }finally{db.close();}
  const expectedRows=dbPaths.map(rows),originalDbHashes=await Promise.all(dbPaths.map(file=>fs.readFile(file).then(hash)));
  const query={run_id:runId,ref:reference,sha256:evidence.sha256};
  runtime=await openWorkIntakeRuntime({...originalOptions,readOnly:true});
  const originalView=await runtime.snapshot({limit:10},access);assert.deepEqual(await runtime.detail(query,access),report);runtime.close();runtime=null;
  let manifest,manifestSha;
  await gate('closed database exports and evidence/authority bytes form one immutable generation',async()=>{
    await fs.mkdir(frozen);const members=[];
    const capture=async(file,relative)=>{const bytes=await fs.readFile(file),destination=within(frozen,relative);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes,{flag:'wx'});members.push({relative,sha256:hash(bytes),size:bytes.length});};
    for(const [index,file]of dbPaths.entries()) {
      const outDir=within(namespace,`logical-${index}`);await assert.rejects(fs.lstat(outDir),{code:'ENOENT'});
      const exported=backupRuntimeDb({dbPath:file,outDir,tag:'intake_synthetic'});
      assert.equal(exported.ok,true);assert.equal(exported.quick_check,'ok');assert.equal(hash(await fs.readFile(exported.backupPath)),exported.sha256);assert.deepEqual(rows(exported.backupPath),expectedRows[index]);
      assert.equal(hash(await fs.readFile(file)),originalDbHashes[index]);await capture(exported.backupPath,`control/${path.basename(file)}`);
    }
    for(const file of [evidence.path,...Object.values(authority).map(value=>value.path),sourceIndex.path,documents.path,deploymentPin.path])await capture(file,path.relative(source,file).replaceAll('\\','/'));
    members.sort((a,b)=>a.relative.localeCompare(b.relative));const bytes=Buffer.from(JSON.stringify({generation:'synthetic.company-intake.restore.1',members}));manifestSha=hash(bytes);await fs.writeFile(path.join(frozen,'manifest.json'),bytes,{flag:'wx'});
    manifest=await generation(frozen,manifestSha);assert.equal(manifest.members.length,10);
  });
  await gate('missing and mixed database, result and authority members reject before any runtime reader opens',async()=>{
    for(const [index,target]of ['control/work-intake.runtime.sqlite','control/work-intake.synthetic.sqlite',`evidence/${reference}.json`,'trusted/pin.json','trusted/deployment.json'].entries())for(const fault of ['missing','mixed']) {
      const damaged=within(namespace,`damaged-${index}-${fault}`);await fs.mkdir(damaged);
      for(const relative of ['manifest.json',...manifest.members.map(member=>member.relative)]){
        if(relative===target&&fault==='missing')continue;
        const destination=within(damaged,relative);await fs.mkdir(path.dirname(destination),{recursive:true});
        if(relative===target)await fs.writeFile(destination,'SYNTHETIC_OTHER_GENERATION',{flag:'wx'});else await fs.copyFile(within(frozen,relative),destination,constants.COPYFILE_EXCL);
      }
      await assert.rejects(generation(damaged,manifestSha));
    }
    await generation(frozen,manifestSha);
  });
  let restoredOptions;
  await gate('copy-only restoration reopens exact rows and read-only result bytes with an explicit path mapping',async()=>{
    await generation(frozen,manifestSha);await fs.mkdir(restored);
    for(const relative of ['manifest.json',...manifest.members.map(member=>member.relative)]){
      const destination=within(restored,relative);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(within(frozen,relative),destination,constants.COPYFILE_EXCL);
    }
    await generation(restored,manifestSha);
    for(const [index,file]of dbPaths.entries())assert.deepEqual(rows(path.join(restored,'control',path.basename(file))),expectedRows[index]);
    const rebound=structuredClone(deployment),rebased=descriptor=>({...descriptor,path:within(restored,path.relative(source,descriptor.path))});
    rebound.control_root=path.join(restored,'control');rebound.evidence_root=path.join(restored,'evidence');
    for(const name of ['grant','claim','pin'])rebound.authority[name]=rebased(deployment.authority[name]);
    rebound.source_index=rebased(deployment.source_index);rebound.documents=rebased(deployment.documents);
    // A saved active observation is evidence, not renewed access. Keep the live
    // independent synthetic current-authority pointer; never replay its old copy.
    assert.deepEqual(rebound.authority.current,deployment.authority.current);
    const newPin=await save(path.join(namespace,'restore-deployment.json'),rebound);
    restoredOptions={deploymentPath:newPin.path,deploymentSha256:newPin.sha256};
    runtime=await openWorkIntakeRuntime({...restoredOptions,readOnly:true});
    assert.deepEqual(await runtime.snapshot({limit:10},access),originalView);assert.deepEqual(await runtime.detail(query,access),report);
    await assert.rejects(runtime.runOnce(),/INTAKE_READ_ONLY/);runtime.close();runtime=null;
    await generation(restored,manifestSha);
  });
  await gate('restored MODEL_UNKNOWN remains fenced before an unconfigured reader or model can start',async()=>{
    runtime=await openWorkIntakeRuntime(restoredOptions);
    assert.equal(deployment.judge,null);assert.equal(deployment.packet_reader,null);
    const before=await runtime.inspect();assert.equal(before.unknown_models.length,1);
    assert.deepEqual(await runtime.runOnce(),{status:'MODEL_CLOSURE_UNKNOWN',official_done:false,external_effects:0});
    assert.deepEqual(await runtime.inspect(),before);runtime.close();runtime=null;
    for(const [index,file]of dbPaths.entries())assert.deepEqual(rows(path.join(restored,'control',path.basename(file))),expectedRows[index]);
  });
  await gate('current revocation denies restored reads while original databases and frozen bytes remain preserved',async()=>{
    runtime=await openWorkIntakeRuntime({...restoredOptions,readOnly:true});
    const revoked={...current,evaluated_at:new Date().toISOString(),revoked_pin_refs:[pin.pin_ref]};
    await fs.writeFile(authority.current.path,JSON.stringify(revoked));
    await assert.rejects(runtime.snapshot({limit:10},access),/INTAKE_CURRENT_AUTHORITY_REQUIRED/);
    await assert.rejects(runtime.detail(query,access),/INTAKE_CURRENT_AUTHORITY_REQUIRED/);runtime.close();runtime=null;
    await assert.rejects(openWorkIntakeRuntime({...restoredOptions,readOnly:true}),/INTAKE_CURRENT_AUTHORITY_REQUIRED/);
    await generation(frozen,manifestSha);assert.deepEqual(await intakeBytes(evidence),Buffer.from(JSON.stringify(report)));
    for(const [index,file]of dbPaths.entries())assert.equal(hash(await fs.readFile(file)),originalDbHashes[index]);
  });
  complete=passed===5;
});

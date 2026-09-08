import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Narrow composition fixture: real publisher/role checks, pinned files and
// SQLite readback; source/issuer and E14 Python typing are explicit stand-ins.
// The prior full E14 fixture owns those component proofs, not this fast test.
const program=String.raw`
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';import childProcess from 'node:child_process';
import moduleBuiltin,{syncBuiltinESMExports} from 'node:module';import {mock} from 'node:test';import {DatabaseSync} from 'node:sqlite';
const [rootUrl,scenario,python]=process.argv.slice(1),here=new URL('../',rootUrl),root=fs.mkdtempSync(path.join(os.tmpdir(),'g2-currentness-server-'));
const h=b=>createHash('sha256').update(b).digest('hex'),norm=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);
const fileURL=p=>new URL(p,here);
const {fileURLToPath}=await import('node:url');
const pin=p=>({path:p,sha256:h(fs.readFileSync(p))});
const save=(name,value)=>{const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(value));return pin(p);};
const dirs=Object.fromEntries(['control','projection','prepared','custody','state','code'].map(name=>{const p=path.join(root,name);fs.mkdirSync(p);return[name,p];}));
const now=Date.now(),past=new Date(now-1000).toISOString(),future=new Date(now+60000).toISOString();
let sender='S-1-5-21-111-222-333-1003';
if(scenario==='same-user')sender=childProcess.execFileSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).match(/S-1-[0-9-]+/)[0];
const owner='S-1-5-21-111-222-333-1001',client='S-1-5-21-111-222-333-1008';
const counts={full:0,os:0,roles:0,source:0,grant:0,python:0};let fault='',hooks=0;
const register=moduleBuiltin.registerHooks;moduleBuiltin.registerHooks=(...args)=>{const hook=register(...args);hooks++;return{deregister(){hooks--;hook.deregister();}};};syncBuiltinESMExports();
const realAuthority=await import(fileURL('execution_authority.mjs'));
mock.module(fileURL('execution_authority.mjs').href,{namedExports:{loadExecutionAuthority:(runtime,options)=>{
  const roles=realAuthority.loadExecutionAuthority(runtime,options);return {...roles,entry(...args){counts.roles++;
    if(fault==='unobserved'&&runtime.recordCurrentnessFile)runtime.observeSecurity([path.join(root,'unobserved.json')]);
    const proof=roles.entry(...args);return fault==='cache-miss'?{...proof,synthetic_changed_identity:true}:proof;}};
}}});
const {sha256Canonical}=await import(new URL('../../shared/project_history_envelope.mjs',rootUrl));
const digest=v=>sha256Canonical(v).slice(7);
const selection={issue_id:'synthetic-issue',issue_content_sha256:'sha256:'+'a'.repeat(64),scope_ref:'project:SYN',generation_seq:1};
const observed={status:'CURRENT',issue_content_sha256:selection.issue_content_sha256,project_scope_ref:'project:SYN',generation_seq:1,linear_task:{task_ref:{task_id:'SYN-1'},task_status:'Todo'}};
mock.module(new URL('../../linear_history/linear_read_evidence_reader.mjs',rootUrl).href,{namedExports:{createLinearReadEvidenceReader:()=>({resolve:async()=>{
  counts.source++;if(fault==='source'&&counts.source===1)save('state/state/linear-collect.json',{...state,changed:true});return structuredClone(observed);
}})}});
const grant={allowed_states:['Todo'],valid_until:future};
mock.module(new URL('../../dev_worker/feedback_runtime_source.mjs',rootUrl).href,{namedExports:{createFeedbackRuntimeIssuer:args=>({authority:async()=>{
  counts.grant++;await args.assertDeployment();return grant;
}})}});
const fields={project_ref:'project:SYN',assignment_ref:'assignment:one',assignment_epoch:1,task_ref:'linear.task:syn-1',route_sha256:'b'.repeat(64),audience:'feedback:synthetic'};
const policy={epoch:1,expires_at:now+(scenario==='expiry-policy'?2000:60000),revoked:false,context:fields,issuer_key_id:'key.synthetic',public_key_sha256:'c'.repeat(64),worker_registration:{task_path:'unused',xml_sha256:'d'.repeat(64)},roles:{
  controller:{sid:'S-1-5-21-111-222-333-1002',principal_ref:'controller:synthetic',purpose:'SOURCE',capabilities:['jobs.advance']},
  sender:{sid:sender,principal_ref:'sender:synthetic',purpose:'G3_PROVIDER',capabilities:['model.dispatch']},
  worker:{sid:'S-1-5-21-111-222-333-1004',principal_ref:'worker:synthetic',purpose:'G3_PROVIDER',capabilities:[]},
  reviewer:{sid:'S-1-5-21-111-222-333-1005',principal_ref:'reviewer:synthetic',purpose:'KEY_SERVICE',capabilities:['release.review']}}};
const policyPin=save('policy.json',policy),grantPin=save('grant.json',grant);
const workforce={claim:save('claim.json',{}),pin:save('workforce-pin.json',{expires_at:future}),current:save('workforce-current.json',{evaluated_at:new Date(now).toISOString()})};
const linear={expectedBinding:{custody_root:dirs.custody,state_root:dirs.state},maxAgeMs:scenario==='expiry-source'?2000:60000};
const receiver={g2LeaderRef:'leader:G2',projectionRoot:dirs.projection,grant:grantPin,workforce,linear,authorityMaxAgeMs:60000,runner:{allowedFiles:['src/value.mjs'],validationCatalog:[{check_id:'check.synthetic'}]}};
const receiverPin=save('receiver.json',receiver);
const profile={producer_ref:'leader:G2',publisher_ref:'sender:synthetic',scope_ref:'project:SYN',audience:fields.audience,valid_from:past,valid_until:scenario==='expiry-profile'?new Date(now+2000).toISOString():future,
  qualification_ref:'qualification:synthetic',receiver_sha256:receiverPin.sha256,control_root_sha256:h(Buffer.from(dirs.control)),allowed_write_paths:['src/value.mjs'],acceptance_checks:['check.synthetic'],generation:1};
const profilePin=save('profile.json',profile),reviewPin=save('review.json',{decision:'ALLOW',actor_ref:'reviewer:synthetic'});
const permitPin=save('permit.json',{actor_ref:'reviewer:synthetic',issuer_key_id:'key.synthetic',permit:{key_id:'key.synthetic'}});
const pub=path.join(root,'verification.pub');fs.writeFileSync(pub,'synthetic public bytes only');
const body=Buffer.from('{"public_code":"synthetic"}'),bodySha=h(body),parts={};
for(const [name,bytes]of Object.entries({body,packet:Buffer.from('{}'),prepared:Buffer.from('{}'),evidence:Buffer.from(JSON.stringify({selection}))})){
  const file=h(bytes)+(name==='body'?'.bin':'.json');fs.writeFileSync(path.join(dirs.prepared,file),bytes);parts[name]={file,sha256:h(bytes)};
}
const manifest=save('prepared/manifest.json',{parts});
const state={last_run_id:'run-one',last_completed_at:new Date(now).toISOString(),cursor:{watermark:new Date(now).toISOString()},object_index:{'read_evidence:synthetic-issue':{content_sha256:'sha256:'+'e'.repeat(64)}}};
save('state/state/linear-collect.json',state);save('state/receipts/run-one.json',{completed_at:state.last_completed_at});save('custody/read_evidence/synthetic-issue/'+ 'e'.repeat(64)+'.json',{});
const interpreter=python||process.execPath;
const transport={pipe_name:'soulforge-secure-'+randomBytes(12).toString('hex'),server_sid:sender,client_sid:client,python_executable:interpreter,python_sha256:pin(interpreter).sha256,
  bridge_sha256:pin(fileURLToPath(fileURL('src/soulforge_secure_work/feedback_currentness_pipe.py'))).sha256,
  ipc_pipe_sha256:pin(fileURLToPath(fileURL('src/soulforge_secure_work/ipc_pipe.py'))).sha256,timeout_ms:2000,valid_until:scenario==='expiry-transport'?new Date(now+2000).toISOString():future};
const transportPin=save('transport.json',transport);
const fixed={role:'sender',profile:profilePin,grant:grantPin,route:save('route.json',{}),field_ledger:save('field-ledger.json',{}),linear,workforce,authorityMaxAgeMs:60000,
  receiver:{deployment:receiverPin,qualification_ref:profile.qualification_ref},prepared_manifest:manifest,review:reviewPin,permit:permitPin,public_key:pin(pub),control_root:dirs.control,projection_root:dirs.projection,currentness_transport:transportPin};
const config={schema:'soulforge.secure_work.config.v0',runtime:{python_executable:interpreter},kit_root:dirs.code,recipe_root:dirs.code,execution_authority:{policy_path:policyPin.path,policy_sha256:policyPin.sha256},g2_feedback:fixed};
const configPin=save('config.json',config),expected=new Map();
for(const p of [interpreter,...['sfx.mjs','execution_authority.mjs','g2_feedback_publisher.mjs','feedback_currentness_transport.mjs','feedback_currentness_contract.mjs','src/soulforge_secure_work/feedback_currentness_pipe.py','src/soulforge_secure_work/ipc_pipe.py'].map(p=>fileURLToPath(fileURL(p))),fileURLToPath(new URL('../../linear_history/linear_custody.mjs',rootUrl))])expected.set(norm(p),pin(p).sha256);
const runtime={config,binding:{config_path:configPin.path,config_sha256:configPin.sha256,trust_owner_sid:owner,node_executable:{path:process.execPath},launch:{python_executable:interpreter,python_paths:[],kit_root:dirs.code}},expected,roots:[dirs.code],environment:{},launcherPath:fileURLToPath(fileURL('sfx.mjs')),
  installationRole:{name:'sender',sid:sender,purpose:'model.dispatch'},recheck(){counts.full++;assert.equal(pin(configPin.path).sha256,configPin.sha256);},
  checkFile(p){assert.equal(pin(p).sha256,expected.get(norm(p)));},observeSecurity(paths){counts.os++;
    if(fault==='identity'&&counts.os===2)fs.writeFileSync(reviewPin.path,fs.readFileSync(reviewPin.path));
    if(fault==='journal'&&counts.os===2){const changed=new DatabaseSync(path.join(dirs.control,'attempts.db'));changed.exec("UPDATE attempts SET state='IN_FLIGHT'");changed.close();}
    return {sid:fault==='sid'&&counts.os===2?client:sender,groups:[],privileges:[],elevated:false,
    paths:paths.map(p=>({path:p,owner_sid:owner,reparse:false,allow:[{sid:owner,rights:2032127},{sid:sender,rights:1179785},...(fault==='acl'&&counts.os===2?[{sid:'S-1-1-0',rights:2032127}]:[])]}))};}};
const verified={selection,body_sha256:bodySha,permit_id:'permit-one',attempt_id:'attempt-one',job_id:'job-one',review_ref:'review:synthetic'};
const index={producer_ref:profile.producer_ref,scope_ref:profile.scope_ref,valid_from:past,valid_until:profile.valid_until,generation:1,projections:[{issue_id:selection.issue_id,file:bodySha+'.json',sha256:bodySha}]};
const {canonicalBytes}=await import(new URL('../../linear_history/linear_custody.mjs',rootUrl));const indexBytes=canonicalBytes(index);
fs.writeFileSync(path.join(dirs.projection,'current.json'),indexBytes);fs.writeFileSync(path.join(dirs.projection,bodySha+'.json'),body);
save('control/current-publication.json',{binding_sha256:configPin.sha256,index_sha256:h(indexBytes),body_sha256:bodySha,generation:1,publisher_ref:profile.publisher_ref,producer_ref:profile.producer_ref,scope_ref:profile.scope_ref,permit_id:verified.permit_id,attempt_id:verified.attempt_id});
const db=new DatabaseSync(path.join(dirs.control,'attempts.db'));db.exec('CREATE TABLE attempts(attempt_id TEXT,job_id TEXT,permit_id TEXT,request_sha256 TEXT,state TEXT);CREATE TABLE jobs(job_id TEXT,project_ref TEXT,work_type TEXT);CREATE TABLE commands(id TEXT);CREATE TABLE events(id TEXT);');
db.prepare('INSERT INTO attempts VALUES(?,?,?,?,?)').run(verified.attempt_id,verified.job_id,verified.permit_id,bodySha,'RESPONSE_RECEIVED');db.prepare('INSERT INTO jobs VALUES(?,?,?)').run(verified.job_id,profile.scope_ref,'feedback.code');db.close();
const originalSpawn=childProcess.spawnSync;
childProcess.spawnSync=(exe,args,options)=>{counts.python++;assert.equal(exe,interpreter);assert.ok(args.includes('-I'));const request=JSON.parse(options.input.toString().trim().split('\n').at(-1));assert.equal(request.phase,'check');return{status:0,stdout:JSON.stringify({ok:true,result:verified}),stderr:''};};syncBuiltinESMExports();
let transportOptions,resolveReady,resolveClosed,resolveDrained;
const ready=new Promise(r=>resolveReady=r),closed=new Promise(r=>resolveClosed=r),drained=new Promise(r=>resolveDrained=r);
if(scenario!=='same-user')mock.module(fileURL('feedback_currentness_transport.mjs').href,{namedExports:{startFeedbackCurrentnessServer:async options=>{
  assert.equal(counts.python,1,'readonly cold verifier must finish before pipe readiness');transportOptions=options;resolveReady();return{closed,drained,close:async()=>resolveClosed()};
}}});
try{
  const publisher=await import(fileURL('g2_feedback_publisher.mjs'));
  const baseline=fs.readFileSync(path.join(dirs.projection,'current.json'));
  if(scenario.startsWith('expiry-')){
    // Pure clock-boundary regression through the actual facade and metadata
    // validator: source/role/profile/pipe expiry cannot borrow the longer age
    // allowance of a recently emitted response. No real wait or pipe is needed.
    const reader=publisher.createReadOnlyFeedbackCurrentness(runtime,{now:()=>now+1500});
    await reader.warmup();const response=await reader.assertCurrentPublication('f'.repeat(32));
    const {observed_at,valid_until,execution_authority,...expected}=response;
    assert.equal(Date.parse(observed_at),now+1500);assert.equal(Date.parse(valid_until),now+2000);
    assert.equal(publisher.validateAuthenticatedCurrentnessMetadata(response,expected,{now:()=>now+1900,maxAgeMs:1000}),true);
    for(const at of [now+2000,now+2100])assert.throws(()=>publisher.validateAuthenticatedCurrentnessMetadata(response,expected,{now:()=>at,maxAgeMs:1000}));
    reader.close();
  }else if(scenario==='lifecycle'){
    const {executeVerified}=await import(fileURL('sfx.mjs'));let done=false;
    const pending=executeVerified(runtime,['--g2-feedback-currentness']).then(x=>{done=true;return x;});await ready;
    for(const key of Object.keys(counts))counts[key]=0;
    for(let n=0;n<20;n++)transportOptions.assertCurrent();assert.deepEqual(counts,{full:0,os:0,roles:0,source:0,grant:0,python:0});
    const result=await transportOptions.assertCurrentPublication('a'.repeat(32));assert.equal(result.challenge,'a'.repeat(32));assert.equal(result.execution_authority,false);
    assert.equal(counts.full,2);assert.equal(counts.os,2);assert.equal(counts.python,0);assert.equal(counts.source,2);assert.equal(counts.grant,2);
    resolveClosed();await new Promise(r=>setTimeout(r,20));assert.equal(done,false);assert.equal(hooks,1,'import hooks survive closed pipe until callback drainage');
    resolveDrained();assert.equal((await pending).warmup,'READ_ONLY_VERIFIED_BEFORE_LISTEN');assert.equal(hooks,0);
    for(const argv of [['--g2-feedback-currentness','extra'],['--g2-feedback-currentness=x']])await assert.rejects(executeVerified(runtime,argv));
  }else if(scenario==='gates'){
    const reader=publisher.createReadOnlyFeedbackCurrentness(runtime);await reader.warmup();const cold=counts.python;
    assert.equal(reader.measurement().full_rechecks,3,'cold verifier retains an extra original execution-time check before Python');
    for(const bad of ['acl','sid','unobserved','source','identity','journal','cache-miss']){
      for(const key of Object.keys(counts))counts[key]=0;fault=bad;await assert.rejects(reader.assertCurrentPublication('b'.repeat(32)),bad==='cache-miss'?/REWARM_REQUIRED/:undefined);assert.equal(counts.python,0);fault='';save('state/state/linear-collect.json',state);
      if(bad==='journal'){const restored=new DatabaseSync(path.join(dirs.control,'attempts.db'));restored.exec("UPDATE attempts SET state='RESPONSE_RECEIVED'");restored.close();}
    }
    for(const p of [reviewPin.path,grantPin.path,policyPin.path,transportPin.path]){
      const bytes=fs.readFileSync(p);fs.writeFileSync(p,'{}');await assert.rejects(reader.assertCurrentPublication('c'.repeat(32)));fs.writeFileSync(p,bytes);
    }
    const journal=new DatabaseSync(path.join(dirs.control,'attempts.db'));journal.exec("UPDATE attempts SET state='IN_FLIGHT'");journal.close();await assert.rejects(reader.assertCurrentPublication('d'.repeat(32)));
    assert.equal(cold,1);reader.close();
  }else if(scenario==='binding'){
    for(const patch of [{client_sid:sender},{server_sid:client},{python_sha256:'0'.repeat(64)},{bridge_sha256:'0'.repeat(64)}]){
      fixed.currentness_transport=save('transport.json',{...transport,...patch});
      // Keep the surrounding installed config pin coherent: each rejection
      // must reach the target SID/interpreter/source guard, not config drift.
      Object.assign(configPin,save('config.json',config));runtime.binding.config_sha256=configPin.sha256;
      assert.throws(()=>publisher.createReadOnlyFeedbackCurrentness(runtime),{message:'G2_FEEDBACK_CURRENTNESS_INSTALLATION'});
    }
    assert.equal(counts.python,0);
  }else if(scenario==='same-user'){
    childProcess.spawnSync=originalSpawn;syncBuiltinESMExports();
    // Only the verifier remains mocked. The actual owned Python Named Pipe has
    // the current user as server and a different synthetic authorized client.
    childProcess.spawnSync=(exe,args,options)=>options?.input?{status:0,stdout:JSON.stringify({ok:true,result:verified}),stderr:''}:originalSpawn(exe,args,options);syncBuiltinESMExports();
    const server=await publisher.startInstalledFeedbackCurrentness(runtime);
    const {createFeedbackCurrentnessClient}=await import(fileURL('feedback_currentness_transport.mjs'));
    const actualClient=createFeedbackCurrentnessClient({binding:{...transport,client_sid:sender},assertCurrent:()=>{}});
    const expectedMetadata={publisher_ref:profile.publisher_ref,producer_ref:profile.producer_ref,scope_ref:profile.scope_ref,issue_id:selection.issue_id,issue_content_sha256:selection.issue_content_sha256,body_sha256:bodySha,generation:1,review_ref:verified.review_ref,index_sha256:h(indexBytes)};
    try{await assert.rejects(actualClient.request(expectedMetadata));}finally{await actualClient.close();await server.close();await server.drained;}
    assert.equal(counts.source,2,'unauthorized same-user client cannot invoke another publisher query');
  }
  assert.deepEqual(fs.readFileSync(path.join(dirs.projection,'current.json')),baseline,'read-only path cannot publish or withdraw');
  assert.deepEqual(fs.readdirSync(dirs.projection).sort(),[bodySha+'.json','current.json'].sort());
  console.log(JSON.stringify({scenario,ok:true,qualification:scenario==='same-user'?'same_user_denied_not_cross_sid':'synthetic_composition_only'}));
}finally{
  childProcess.spawnSync=originalSpawn;moduleBuiltin.registerHooks=register;syncBuiltinESMExports();
  assert.equal(path.dirname(fs.realpathSync(root)),fs.realpathSync(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});
}
`;

for(const scenario of ['lifecycle','gates','binding','same-user','expiry-source','expiry-policy','expiry-profile','expiry-transport'])test(`installed currentness ${scenario}: read-only bounded composition`,{
  timeout:45000,skip:scenario==='same-user' && (process.platform!=='win32'||!process.env.SOULFORGE_CURRENTNESS_TEST_PYTHON)?'Explicit Windows test Python is required':false,
},()=>{
  const result=spawnSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',program,new URL('./',import.meta.url).href,scenario,process.env.SOULFORGE_CURRENTNESS_TEST_PYTHON??''],
    {encoding:'utf8',windowsHide:true,timeout:40000,maxBuffer:65536,
      env:Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]))});
  assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{scenario,ok:true,qualification:scenario==='same-user'?'same_user_denied_not_cross_sid':'synthetic_composition_only'});
});

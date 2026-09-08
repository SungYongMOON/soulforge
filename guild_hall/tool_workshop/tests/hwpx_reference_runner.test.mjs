import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDurableToolWorkshop} from '../src/tool_workshop_durable.mjs';
import {HWPX_REFERENCE_PROFILE,pinHwpxReferenceBinding,verifyHwpxReferenceBinding,hwpxReferenceBindingDigest,createHwpxReferenceRunner,validateHwpxReferencePacket} from '../src/hwpx_reference_runner.mjs';
import {sha256} from '../src/workshop_files.mjs';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const python=process.env.SOULFORGE_HWPX_TEST_PYTHON;
const available=Boolean(python) && existsSync(python);
// Reuse the preceding leaf's actual two-section fixture without modifying that
// frozen test or cloning its representative document generator.
const fixtureSource=readFileSync(new URL('./hwpx_reference_child.test.mjs',import.meta.url),'utf8');
const fixtureCode=fixtureSource.match(/const fixtureCode=String\.raw`([\s\S]*?)`;/)?.[1];
const job=(digest,id='job.reference')=>({job_id:id,workshop_id:'workshop.hwpx',project_ref:'project.synthetic',task_ref:'task.synthetic',work_brief_ref:'brief.synthetic',approval_ref:'approval.synthetic',priority:2,required_tool_version:'tool.reference_hwpx:v1',input_bundle_manifest_digest:digest,timeout_seconds:60,max_retries:0});
function setup(scenario='pass',mixedProfile=false) {
  assert.ok(fixtureCode,'frozen child fixture must remain discoverable');
  const root=mkdtempSync(path.join(tmpdir(),'hwpx-reference-queue-'));
  const roots=Object.fromEntries(['stateRoot','inputRoot','workRoot','outputRoot','templateRoot','fixtureRoot'].map(key=>{const value=path.join(root,key);mkdirSync(value);return [key,value];}));
  const generated=spawnSync(python,['-I','-B','-c',fixtureCode,roots.fixtureRoot,path.join(ROOT,'.registry/skills/hwpx_document/codex/templates/base'),scenario],{encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(generated.status,0,generated.stderr);
  const original=JSON.parse(readFileSync(path.join(roots.fixtureRoot,'request.json'),'utf8'));
  const templatePath=path.join(roots.templateRoot,'reference.hwpx');
  writeFileSync(templatePath,readFileSync(path.join(roots.fixtureRoot,'reference.hwpx')),{flag:'wx'});
  const candidate=readFileSync(path.join(roots.fixtureRoot,'candidate.hwpx'));
  writeFileSync(path.join(roots.inputRoot,`${original.candidate_sha256}.hwpx`),candidate,{flag:'wx'});
  const binding=pinHwpxReferenceBinding({pythonExecutable:python,templatePath,templateApprovalRef:'approval.reference_template',templateProvenance:'synthetic_fixture',allowedParts:original.allowed_parts});
  const packet={kind:'hwpx_reference_packet',project_ref:'project.synthetic',source_ref:'source.skill_candidate',revision:'revision.one',approval_ref:'approval.synthetic',provenance:'synthetic_fixture',template_sha256:binding.template_sha256,candidate_sha256:original.candidate_sha256,allowed_parts:original.allowed_parts,expected_text:original.expected_text};
  const queue=createDurableToolWorkshop({stateRoot:roots.stateRoot,mode:'create_new'});
  queue.registerWorkshop({...HWPX_REFERENCE_PROFILE,...(mixedProfile?{tool_versions:['tool.template_hwpx:v1','tool.reference_hwpx:v1']}:{}),binding_digest:hwpxReferenceBindingDigest(binding)});
  const env={...roots,queue,binding,projectRef:'project.synthetic'};
  function submit(value=packet,id='job.reference',overrides={}) {
    const bytes=Buffer.from(JSON.stringify(value)),digest=sha256(bytes),file=path.join(roots.inputRoot,`${digest}.json`);
    if(!existsSync(file))writeFileSync(file,bytes,{flag:'wx'});
    queue.submitJob({...job(digest,id),...overrides});return id;
  }
  return {roots,binding,packet,queue,env,submit,candidate};
}
const noCustody=(f,id)=>{assert.equal(f.queue.getCustodyReceipt(id),null);assert.deepEqual(readdirSync(f.roots.outputRoot),[]);};

test('reference packets have exact authority fields and allow full Korean text without legacy length caps',()=>{
  const packet={kind:'hwpx_reference_packet',project_ref:'project.synthetic',source_ref:'source.skill',revision:'revision.one',approval_ref:'approval.synthetic',provenance:'synthetic_fixture',template_sha256:'a'.repeat(64),candidate_sha256:'b'.repeat(64),allowed_parts:['Contents/section0.xml','Contents/section1.xml'],expected_text:['한국어 여러 문단과 표를 검사하는 충분히 긴 제목입니다.','검토 내용을 줄이지 않고 그대로 확인합니다.\n다음 문단도 포함합니다.']};
  assert.equal(validateHwpxReferencePacket(packet),packet);
  for(const changed of [{...packet,command:'arbitrary'},{...packet,allowed_parts:['Contents/header.xml']},{...packet,allowed_parts:['Contents/section0.xml','Contents/section0.xml']},{...packet,expected_text:[1]}])assert.throws(()=>validateHwpxReferencePacket(changed));
});
if(!available)test('queue reference outcomes need configured Python/lxml',{skip:'SOULFORGE_HWPX_TEST_PYTHON is not configured or does not exist'},()=>{});
else {
  test('actual snapshot validator commits exact skill candidate and SQLite reopen preserves the same structural receipt',async()=>{
    const f=setup();f.submit();const result=await createHwpxReferenceRunner(f.env).runNext();
    assert.equal(result.state,'done_candidate');const artifact=result.receipt.artifact;
    assert.equal(artifact.validator_ref,'validator.hwpx_reference_readback:v1');assert.equal(artifact.template_sha256,f.binding.template_sha256);
    assert.equal(artifact.section_count,2);assert.equal(artifact.preview_status,'preview_stale');assert.equal(artifact.render_required,true);assert.equal(artifact.page_count_verified,false);
    assert.deepEqual(readFileSync(path.join(f.roots.outputRoot,`${artifact.sha256}.hwpx`)),f.candidate);
    assert.deepEqual(createDurableToolWorkshop({stateRoot:f.roots.stateRoot,mode:'open_existing'}).getCustodyReceipt('job.reference'),result.receipt);
    assert.equal(readFileSync(path.join(f.roots.stateRoot,'workshop.sqlite')).includes(Buffer.from(f.packet.expected_text[0])),false);
    const runRoot=path.join(f.roots.workRoot,readdirSync(f.roots.workRoot)[0]);
    assert.ok(readdirSync(path.join(runRoot,'libraries','lxml')).some(name=>/etree.*\.(pyd|so)$/.test(name)));
    assert.equal(readdirSync(path.join(runRoot,'reference-metrics')).length,4);
  });
  test('mixed tool profile is rejected before leasing and leaves every job queued without custody',()=>{
    const f=setup('pass',true);
    f.submit(f.packet,'job.reference');f.submit(f.packet,'job.template',{required_tool_version:'tool.template_hwpx:v1'});
    assert.throws(()=>createHwpxReferenceRunner(f.env),{code:'workshop_profile_drift'});
    for(const id of ['job.reference','job.template']){assert.equal(f.queue.getJob(id).state,'queued');noCustody(f,id);}
    assert.equal(f.queue.getWorkshop('workshop.hwpx').active_lease_id,null);
    assert.equal(f.queue.eventLog().some(event=>event.kind==='lease_acquired'),false);
    assert.deepEqual(readdirSync(f.roots.workRoot),[]);
  });
  test('project, candidate hash, allowlist, provenance and approval mismatches never enter custody',async()=>{
    const f=setup();
    for(const [index,delta] of [{project_ref:'project.foreign'},{candidate_sha256:'0'.repeat(64)},{allowed_parts:['Contents/section0.xml']},{provenance:'owner_approved'},{approval_ref:'approval.other'}].entries()) {
      const id=f.submit({...f.packet,...delta},`job.bad.${index}`),result=await createHwpxReferenceRunner(f.env).runNext();
      assert.equal(result.state,'failed_terminal');noCustody(f,id);
    }
    f.submit(f.packet,'job.foreign',{project_ref:'project.foreign'});
    assert.equal(await createHwpxReferenceRunner(f.env).runNext(),null);noCustody(f,'job.foreign');
  });
  test('source, Python, lxml and closure drift do not repin or gain execution authority',()=>{
    const f=setup(),before=JSON.stringify(f.binding);
    for(const mutate of [b=>b.python_sha256='0'.repeat(64),b=>b.sources[0].sha256='0'.repeat(64),b=>b.lxml_files[0].sha256='0'.repeat(64),b=>b.lxml_files[0].relative_path='credential.json']) {
      const changed=structuredClone(f.binding);mutate(changed);assert.throws(()=>verifyHwpxReferenceBinding(changed),{code:'binding_drift'});
    }
    const expanded=structuredClone(f.binding);expanded.allowed_parts.push('Contents/section2.xml');
    assert.throws(()=>createHwpxReferenceRunner({...f.env,binding:expanded}),{code:'binding_drift'});
    const missing=structuredClone(f.binding);missing.python_files.pop();
    assert.throws(()=>createHwpxReferenceRunner({...f.env,binding:missing}),{code:'binding_drift'});
    assert.equal(JSON.stringify(f.binding),before);assert.deepEqual(readdirSync(f.roots.workRoot),[]);
  });
  test('pure verify spawns no child and trusted bootstrap cannot import a sibling site-packages shadow',()=>{
    const f=setup(),bindingFile=path.join(f.roots.fixtureRoot,'binding.json');
    writeFileSync(bindingFile,JSON.stringify(f.binding),{flag:'wx'});
    const sourceUrl=new URL('../src/hwpx_reference_runner.mjs',import.meta.url).href;
    const verifyCode=`import {mock} from 'node:test';import {readFileSync} from 'node:fs';let calls=0;const forbidden=()=>{calls++;throw Error('probe_forbidden')};mock.module('node:child_process',{namedExports:{spawnSync:forbidden,spawn:forbidden}});const {verifyHwpxReferenceBinding}=await import(${JSON.stringify(sourceUrl)});const binding=JSON.parse(readFileSync(process.argv[1],'utf8'));verifyHwpxReferenceBinding(binding);for(const mutate of [b=>b.python_sha256='0'.repeat(64),b=>b.lxml_files.pop()]){const changed=structuredClone(binding);mutate(changed);let rejected=false;try{verifyHwpxReferenceBinding(changed)}catch(e){rejected=e.code==='binding_drift'};if(!rejected)throw Error('pure_verify_failed')}if(calls)throw Error('probe_called');console.log(JSON.stringify({verified:true,rejected:true,spawn_count:calls}));`;
    const env={...process.env};delete env.NODE_TEST_CONTEXT;
    const verified=spawnSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',verifyCode,bindingFile],{encoding:'utf8',windowsHide:true,timeout:10000,env});
    assert.equal(verified.status,0,verified.stderr);assert.deepEqual(JSON.parse(verified.stdout),{verified:true,rejected:true,spawn_count:0});
    const site=path.join(f.roots.fixtureRoot,'synthetic-site'),library=path.join(site,'lxml'),marker=path.join(site,'shadow-executed');mkdirSync(library,{recursive:true});
    writeFileSync(path.join(library,'__init__.py'),'__version__="9.9.0"\n',{flag:'wx'});writeFileSync(path.join(library,'etree.py'),'# synthetic package only\n',{flag:'wx'});
    writeFileSync(path.join(site,'hashlib.py'),`from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text('executed')\nraise RuntimeError('shadow_import_executed')\n`,{flag:'wx'});
    const probeChild=path.join(f.roots.fixtureRoot,'probe-child.py');writeFileSync(probeChild,'import hashlib\nassert hashlib.sha256(b"synthetic").hexdigest()\n',{flag:'wx'});
    const source=readFileSync(new URL('../src/hwpx_reference_runner.mjs',import.meta.url),'utf8');
    const code=source.match(/const code=`([\s\S]*?)`;/)?.[1];assert.ok(code);
    assert.equal(code.includes('sys.path.insert'),false);
    const synthetic=code.replace(/^package=.*$/m,'package=pathlib.Path(sys.argv.pop(1))');assert.notEqual(synthetic,code);
    const result=spawnSync(python,['-I','-S','-B','-X',`pycache_prefix=${path.join(f.roots.fixtureRoot,'unused-cache')}`,'-c',synthetic,library,probeChild],{encoding:'utf8',windowsHide:true,timeout:10000});
    assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).lxml_version,'9.9.0');assert.equal(existsSync(marker),false);
    assert.ok(source.includes('sys.path[:]=[libraries,') && source.includes("runtime];import runpy;"));
  });
  test('cancellation of the actual child leaves no custody or output',async()=>{
    const f=setup();f.submit();const pending=createHwpxReferenceRunner(f.env).runNext();
    f.queue.cancelJob('job.reference');assert.equal((await pending).state,'cancelled');noCustody(f,'job.reference');
  });
  test('a superseded fence cannot publish the completed validator result',async()=>{
    const f=setup();f.submit();const pending=createHwpxReferenceRunner(f.env).runNext();
    const profile=f.queue.getWorkshop('workshop.hwpx');
    f.queue.releaseLease({lease_id:profile.active_lease_id,fencing_token:profile.fencing_counter});
    f.queue.acquireLease('workshop.hwpx',{lease_id:'lease.replacement',project_ref:'project.synthetic'});
    assert.equal((await pending).state,'fenced');noCustody(f,'job.reference');
  });
  test('input replacement after snapshot cannot acquire custody',async()=>{
    const f=setup();f.submit();const pending=createHwpxReferenceRunner(f.env).runNext();
    writeFileSync(path.join(f.roots.inputRoot,`${f.packet.candidate_sha256}.hwpx`),'changed after snapshot');
    assert.equal((await pending).state,'failed_terminal');noCustody(f,'job.reference');
  });
  test('snapshot source drift after dispatch cannot acquire custody even if the validator reports success',async()=>{
    const f=setup();f.submit();const pending=createHwpxReferenceRunner(f.env).runNext();
    const runRoot=path.join(f.roots.workRoot,readdirSync(f.roots.workRoot)[0]);
    const source=path.join(runRoot,'.registry/skills/hwpx_document/codex/scripts/validate.py');
    writeFileSync(source,Buffer.concat([readFileSync(source),Buffer.from('\n# synthetic snapshot drift\n')]));
    assert.equal((await pending).state,'failed_terminal');noCustody(f,'job.reference');
  });
  test('second-section page drift fails canonical all-section gate and never publishes',async()=>{
    const f=setup('second_section_drift');f.submit();
    assert.equal((await createHwpxReferenceRunner(f.env).runNext()).state,'failed_terminal');noCustody(f,'job.reference');
  });
  test('create-only output never overwrites a preexisting foreign artifact or returns a receipt',async()=>{
    const f=setup(),target=path.join(f.roots.outputRoot,`${f.packet.candidate_sha256}.hwpx`);writeFileSync(target,'foreign artifact',{flag:'wx'});f.submit();
    assert.equal((await createHwpxReferenceRunner(f.env).runNext()).state,'failed_terminal');
    assert.equal(f.queue.getCustodyReceipt('job.reference'),null);assert.equal(readFileSync(target,'utf8'),'foreign artifact');
  });
}
